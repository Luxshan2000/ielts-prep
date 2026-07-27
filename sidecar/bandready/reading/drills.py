"""Reading drills — the practice that follows a review, not the practice that replaces it.

An unreviewed test teaches almost nothing (staging-reading/DESIGN.md §10 F10, R4 §1). A
learner who sits four papers and reviews none has bought four measurements of the same
number. So the drills here are all *post-mortem instruments*: every one of them is built
out of a field the item bank already carries, and every one of them exists to convert a
loss into a named, repeatable behaviour.

Four kinds (:data:`DRILL_KINDS`), in the order they are worth building:

``trap``
    N judgement items (TFNG / YNNG) carrying **one named trap** from the §5.1 taxonomy,
    pulled from across the pack. The learner answers, and only then does the reveal
    open: which trap this item was built out of, and — the part that actually moves the
    mark — **why FALSE differs from NOT GIVEN on this particular statement**, worked from
    the authored distractor autopsy rather than from a general rule. TFNG is the
    highest-loss type in the paper and the F/NG boundary is where the loss happens.
    Optionally run with the **two-stage scaffold** (:func:`stage_split`): decide
    GIVEN vs NOT GIVEN first, then TRUE vs FALSE on the survivors — a three-way decision
    turned into two binaries (R1 §7.3).

``type``
    N questions of one type from across the bank. The existing
    ``GET /api/v1/reading/drills/{qtype}`` route already assembles a set like this and
    runs it as a scored attempt; this kind adds the two things that route cannot do —
    the per-item teaching reveal, and **bounded search** (:func:`bounded_band`), which
    shows only the paragraph band a sequential group's answer must lie in instead of the
    exact anchor. Handing a learner the anchor paragraph teaches location by giving the
    answer away; handing them the band teaches that the search is *bounded*, which is the
    single most useful thing there is to say about NOT GIVEN.

``paraphrase``
    One question's phrasing and four passage extracts; pick the one that says the same
    thing. Reading is paraphrase recognition, and this trains it with no new content at
    all: the key is an authored ``teaching.paraphrase_link``, and the three lures are
    other items' ``text_phrase`` values ranked by **word overlap** with the stem, so the
    wrong answers are exactly the keyword matches that lose marks in the paper. Items
    whose pair carries authored devices add a second, scored move — was the rewording
    meaning-**preserving** or meaning-**changing**? Sorting a rewording into those two
    buckets more or less *is* TFNG.

``skim``
    A passage, a short window on the clock, then questions that can only be answered
    from gist: the authored ``skim_plan.map`` labels turned into paragraph-identification
    items, plus any bank question the author tagged ``gear: "skim"``. Trains speed
    without over-reading, and it is the drill that makes the two-minute map a habit
    rather than a paragraph the learner nodded at.

**Grading is mechanical wherever the question is mechanical.** Every verdict in this
module goes through :func:`bandready.scoring.answers.answers_match` — the same matcher
listening and the reading player use, never a second copy of the normalisation rules. The
only judgement call in the whole surface is *explain-back*: the learner types, in their
own words, why the key is the key, and no string test can mark that. That is one
``chat_json`` call, it runs after the mechanical verdict is already fixed, and it may not
change it (:data:`EXPLAIN_BACK_SYSTEM`).

**Storage — no new table.** A finished set writes the same two rows the existing drill
route writes: one ``practice_sessions`` envelope and one ``drill_results``
(:func:`record_set`). The per-item detail, including which trap the learner *said* it was
against which trap it *is*, rides in ``details_json``.

**Degrading.** The teaching payload is ``schema_version: 2`` content and the pack still
carries ``schema_version: 1`` rows. Every accessor here treats every teaching field as
absent-by-default: a passage without a payload simply supplies fewer drillable items, and
:func:`census` reports honestly how many there are rather than shipping a drill with
nothing to reveal.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.scoring.answers import (
    CHOICE_TYPES,
    LETTER_TYPES,
    TEXT_TYPES,
    answers_match,
    canonical_choice,
    expand_variants,
    instruction_for,
    near_miss,
    within_word_limit,
    word_limit_of,
)

_log = logging.getLogger("bandready.reading.drills")

# ======================================================================================
# Vocabulary of the module
# ======================================================================================

#: Ordered by how much a learner gains per minute spent, which is also the order the
#: launcher offers them in.
DRILL_KINDS: tuple[str, ...] = ("trap", "type", "paraphrase", "skim")

#: The two three-way judgement types, aliased so the intent reads at the call site.
JUDGEMENT_TYPES: frozenset[str] = CHOICE_TYPES

#: ``drill_results.drill_kind`` values these drills write. ``question_type`` is the value
#: the pre-existing reading drill already uses and is kept identical so a learner's
#: history is one series, not two.
RESULT_KINDS: dict[str, str] = {
    "type": "question_type",
    "trap": "trap",
    "paraphrase": "paraphrase",
    "skim": "skim",
}

#: Seconds a single item is worth in each kind. Type drills defer to the per-type figures
#: in :data:`SECONDS_PER_QUESTION`; the rest are whole-item budgets.
DRILL_SECONDS: dict[str, int] = {"trap": 75, "paraphrase": 45, "skim": 35}

#: How long the passage stays on screen in a skim drill before the questions open, when
#: the author supplied no ``skim_plan.budget_s``. DESIGN §3.2: 90–150 s for a paragraph
#: map, 45–75 s for a GT field scan.
SKIM_WINDOW_DEFAULT: dict[str, int] = {"paragraph_map": 120, "field_scan": 60}

#: Smallest and largest set we will build. Below three the accuracy figure is noise;
#: above twenty the learner stops reviewing and starts grinding.
MIN_SIZE, MAX_SIZE, DEFAULT_SIZE = 3, 20, 8

#: A paraphrase item needs one key and three lures. Fewer lures than this and the item is
#: a coin toss, so it is dropped rather than shipped short.
PARAPHRASE_OPTIONS = 4


# --------------------------------------------------------------------------------------
# The trap taxonomy (DESIGN §5.1) — one closed enum, four families
# --------------------------------------------------------------------------------------

#: Family order is the order the profile screen lists them in: judgement first because
#: that is where the marks go, form last because those are pacing and answer-form fixes
#: rather than reading fixes and must never be averaged in with the rest.
TRAP_FAMILIES: dict[str, str] = {
    "judgement": "Judgement — TRUE / FALSE / NOT GIVEN and the choices that turn on it",
    "proposition": "Proposition matching — does the text say this, in any words",
    "locating": "Locating and choosing between options",
    "form": "Form and process — not a comprehension failure, and counted separately",
}

#: slug → (family, learner-facing name, what happened). Never rename a slug: it is
#: simultaneously a content field, a drill filter, a progress axis and the constrained
#: vocabulary handed to the "why was I wrong" model.
TRAPS: dict[str, dict[str, str]] = {
    # Family J — judgement
    "absence_read_as_contradiction": {
        "family": "judgement",
        "name": "Phantom contradiction",
        "what": "The key is NOT GIVEN and you wrote FALSE. The passage is silent, and the "
                "silence felt like a denial. The commonest single error in the paper.",
    },
    "contradiction_read_as_absence": {
        "family": "judgement",
        "name": "Missed contradiction",
        "what": "The key is FALSE and you wrote NOT GIVEN. The contradiction is there, "
                "carried by one word or by the next sentence — a searching failure, not a "
                "reasoning one.",
    },
    "causal_link_assumed": {
        "family": "judgement",
        "name": "Two facts, one invented link",
        "what": "The text states X and states Y and never says X caused Y. The richest "
                "genuine NOT GIVEN there is.",
    },
    "plausible_inference": {
        "family": "judgement",
        "name": "Reasonable inference",
        "what": "It follows plausibly and it is not stated. If a step of reasoning is "
                "needed, the answer is NOT GIVEN.",
    },
    "comparison_invented": {
        "family": "judgement",
        "name": "Invented comparison",
        "what": "Facts about A and about B are given separately and the statement ranks "
                "them. NOT GIVEN, however easy the arithmetic looks.",
    },
    "comparison_reversed": {
        "family": "judgement",
        "name": "Comparison flipped",
        "what": "A exceeded B, read as B exceeded A. FALSE, and quotable.",
    },
    "attribution_shift": {
        "family": "judgement",
        "name": "Whose view?",
        "what": "The claim belongs to a cited person or to 'critics'; the statement gives "
                "it to the writer, or to the wrong person. The defining YES/NO trap.",
    },
    "outside_knowledge": {
        "family": "judgement",
        "name": "True in the world, not in the text",
        "what": "Answered from what you already know. Most dangerous on familiar topics.",
    },
    # Family P — proposition matching
    "lexical_lure": {
        "family": "proposition",
        "name": "Word match, no meaning match",
        "what": "Every content word is present and the relation between them is different, "
                "or reversed.",
    },
    "paraphrase_missed": {
        "family": "proposition",
        "name": "Meaning match not recognised",
        "what": "The text does state it, fully, in other words — and you answered NOT GIVEN "
                "or picked nothing.",
    },
    "scope_shift": {
        "family": "proposition",
        "name": "Quantifier or scope shift",
        "what": "some ↔ all, often ↔ always, one district ↔ nationally, a study ↔ research "
                "in general.",
    },
    "hedge_stripped": {
        "family": "proposition",
        "name": "Certainty inflated or deflated",
        "what": "'may reduce' read as 'reduces'; 'suggests' as 'proves'; or only / never / "
                "the first asserted without licence.",
    },
    "time_shift": {
        "family": "proposition",
        "name": "Wrong point on the timeline",
        "what": "A plan taken for an implementation; 'used to' taken for 'does'; past "
                "practice asserted as current.",
    },
    "negation_missed": {
        "family": "proposition",
        "name": "A not / rarely / failed to was skipped",
        "what": "Includes negative prefixes and the double negation of a negated antonym.",
    },
    "partial_condition": {
        "family": "proposition",
        "name": "Half true",
        "what": "One clause supported, one not. TRUE requires all of it — the most "
                "under-taught trap after the FALSE / NOT GIVEN boundary.",
    },
    # Family L — locating and choosing
    "detail_for_main_idea": {
        "family": "locating",
        "name": "A detail taken for the point",
        "what": "The heading matches something the paragraph mentions, not what the "
                "paragraph does. The classic headings failure.",
    },
    "heading_too_broad": {
        "family": "locating",
        "name": "The topic of the whole text",
        "what": "The heading names the passage's subject rather than this paragraph's "
                "contribution to it.",
    },
    "heading_cascade": {
        "family": "locating",
        "name": "Error propagated",
        "what": "One wrong placement forced a second, because headings cannot be reused. "
                "The worst marks-lost-per-mistake ratio in the paper.",
    },
    "parallel_decoy": {
        "family": "locating",
        "name": "The topic returns later",
        "what": "Two paragraphs discuss the same thing; the answer is in the second and the "
                "decoy is in the first.",
    },
    "true_but_not_asked": {
        "family": "locating",
        "name": "Accurate, irrelevant",
        "what": "The option is true of the passage and does not answer this stem. Punishes "
                "reading the options before the question.",
    },
    "neighbour_answer": {
        "family": "locating",
        "name": "Right answer, wrong number",
        "what": "The answer you wrote belonged to the item next door.",
    },
    "order_ignored": {
        "family": "locating",
        "name": "Searched the whole passage",
        "what": "The group runs in passage order and the answer was already bracketed "
                "between two you had found.",
    },
    # Family F — form and process
    "over_limit": {
        "family": "form",
        "name": "Over the word limit",
        "what": "Right content, wrong length. Articles count. A certain zero.",
    },
    "spelling": {
        "family": "form",
        "name": "Mis-copied",
        "what": "The answer was on the screen. Pure avoidable loss.",
    },
    "form_error": {
        "family": "form",
        "name": "Right word, wrong form",
        "what": "Singular for plural, wrong word class, paraphrased instead of copied, or it "
                "does not fit the gap's frame.",
    },
    "wrong_option_form": {
        "family": "form",
        "name": "Wrote the word, not the letter",
        "what": "Letter-answer types, and choosing the wrong number of letters on a "
                "'choose TWO' item.",
    },
    "ran_out_of_time": {
        "family": "form",
        "name": "Not a comprehension error",
        "what": "Blank, or a guess under the clock. Needs a pacing fix, not a reading one.",
    },
}

#: The 5–7 slugs worth offering as a self-diagnosis picker for each type (DESIGN §10 F2).
#: Offering all 27 makes the picker a menu nobody reads; offering the wrong five makes the
#: disagreement metric meaningless. ``ran_out_of_time`` is on every list because it is
#: always a live answer and it is the one the learner is most reluctant to admit.
TRAP_PICKER: dict[str, tuple[str, ...]] = {
    "true_false_not_given": (
        "absence_read_as_contradiction", "contradiction_read_as_absence",
        "causal_link_assumed", "comparison_invented", "scope_shift", "hedge_stripped",
        "partial_condition", "outside_knowledge", "ran_out_of_time",
    ),
    "yes_no_not_given": (
        "attribution_shift", "absence_read_as_contradiction",
        "contradiction_read_as_absence", "hedge_stripped", "plausible_inference",
        "scope_shift", "outside_knowledge", "ran_out_of_time",
    ),
    "matching_headings": (
        "detail_for_main_idea", "heading_too_broad", "heading_cascade", "parallel_decoy",
        "neighbour_answer", "ran_out_of_time",
    ),
    "matching_information": (
        "parallel_decoy", "lexical_lure", "detail_for_main_idea", "neighbour_answer",
        "ran_out_of_time",
    ),
    "matching_features": (
        "attribution_shift", "lexical_lure", "parallel_decoy", "neighbour_answer",
        "ran_out_of_time",
    ),
    "matching_sentence_endings": (
        "lexical_lure", "partial_condition", "order_ignored", "neighbour_answer",
        "ran_out_of_time",
    ),
    "multiple_choice": (
        "true_but_not_asked", "partial_condition", "scope_shift", "hedge_stripped",
        "lexical_lure", "ran_out_of_time",
    ),
    "multiple_choice_multi": (
        "true_but_not_asked", "wrong_option_form", "partial_condition", "lexical_lure",
        "ran_out_of_time",
    ),
    "list_selection": (
        "true_but_not_asked", "wrong_option_form", "lexical_lure", "ran_out_of_time",
    ),
    "summary_completion_bank": (
        "wrong_option_form", "lexical_lure", "parallel_decoy", "form_error",
        "ran_out_of_time",
    ),
}

#: Every free-text type loses marks the same four ways, so they share a picker.
_TEXT_PICKER: tuple[str, ...] = (
    "form_error", "over_limit", "spelling", "paraphrase_missed", "neighbour_answer",
    "ran_out_of_time",
)

#: Fallback for anything the table above does not name.
_DEFAULT_PICKER: tuple[str, ...] = (
    "lexical_lure", "paraphrase_missed", "scope_shift", "neighbour_answer",
    "ran_out_of_time",
)


def picker_for(qtype: str) -> list[str]:
    """The trap slugs a learner may plausibly have fallen into on this type."""
    if qtype in TRAP_PICKER:
        return list(TRAP_PICKER[qtype])
    if qtype in TEXT_TYPES:
        return list(_TEXT_PICKER)
    return list(_DEFAULT_PICKER)


# --------------------------------------------------------------------------------------
# Paraphrase devices (DESIGN §5.2) — and the split that matters
# --------------------------------------------------------------------------------------

#: slug → (label, ``preserving`` | ``changing``). The two changing devices are the whole
#: reason this enum is scored: a rewording that changes scope or modality is what makes a
#: statement FALSE rather than TRUE, so naming the split *is* practising judgement.
DEVICES: dict[str, dict[str, str]] = {
    "synonym": {"label": "Synonym", "meaning": "preserving",
                "gloss": "one content word swapped for another"},
    "superordinate": {"label": "Specific → category", "meaning": "preserving",
                      "gloss": "larch and spruce → conifers"},
    "hyponym": {"label": "Category → instance", "meaning": "preserving",
                "gloss": "conifers → larch"},
    "nominalisation": {"label": "Verb → noun", "meaning": "preserving",
                       "gloss": "the ice retreated → the retreat of the ice"},
    "verbalisation": {"label": "Noun → verb", "meaning": "preserving",
                      "gloss": "a reduction in cost → costs fell"},
    "voice_shift": {"label": "Active ↔ passive", "meaning": "preserving",
                    "gloss": "often with the agent deleted — a NOT GIVEN factory"},
    "converse": {"label": "Converse", "meaning": "preserving",
                 "gloss": "A supplied B to C ↔ C obtained B from A; reversing it makes FALSE"},
    "negated_antonym": {"label": "Negated antonym", "meaning": "preserving",
                        "gloss": "few adopted it ↔ it was not widely adopted"},
    "compression": {"label": "Compression", "meaning": "preserving",
                    "gloss": "multiword ↔ single word — this is what breaks word limits"},
    "clause_restructure": {"label": "Clause restructure", "meaning": "preserving",
                           "gloss": "the proposition may cross a sentence boundary"},
    "gloss_swap": {"label": "Term ↔ definition", "meaning": "preserving",
                   "gloss": "photovoltaic panels → panels that turn light into electricity"},
    "figure_restatement": {"label": "Figure restated", "meaning": "preserving",
                           "gloss": "from 20% to 40% → doubled"},
    "scope_change": {"label": "Scope changed", "meaning": "changing",
                     "gloss": "some ↔ most ↔ all; in one region ↔ everywhere — yields FALSE"},
    "modality_change": {"label": "Certainty changed", "meaning": "changing",
                        "gloss": "may reduce ↔ reduces; suggests ↔ demonstrates — yields FALSE"},
}

#: The two meaning-changing devices, named once so nothing re-derives the set.
CHANGING_DEVICES: frozenset[str] = frozenset(
    slug for slug, info in DEVICES.items() if info["meaning"] == "changing"
)


# --------------------------------------------------------------------------------------
# Answer order and pacing, fixed per type (DESIGN §5.4)
# --------------------------------------------------------------------------------------

#: Published property of the question type, not an authorial choice. Bounded search is
#: only honest on a ``sequential`` group, which is why this table is load-bearing here and
#: not merely decorative.
ANSWER_ORDER: dict[str, str] = {
    "multiple_choice": "sequential",
    "multiple_choice_multi": "sequential",
    "list_selection": "sequential",
    "true_false_not_given": "sequential",
    "yes_no_not_given": "sequential",
    "matching_sentence_endings": "sequential",
    "sentence_completion": "sequential",
    "short_answer": "sequential",
    "matching_headings": "scattered",
    "matching_information": "scattered",
    "matching_features": "scattered",
    "summary_completion": "section_local",
    "summary_completion_bank": "section_local",
    "note_completion": "section_local",
    "table_completion": "section_local",
    "flow_chart_completion": "section_local",
    "diagram_labelling": "section_local",
}

SECONDS_PER_QUESTION: dict[str, int] = {
    "multiple_choice": 85, "multiple_choice_multi": 85, "list_selection": 85,
    "true_false_not_given": 70, "yes_no_not_given": 80,
    "matching_sentence_endings": 55, "sentence_completion": 40, "short_answer": 30,
    "matching_headings": 70, "matching_information": 55, "matching_features": 45,
    "summary_completion": 40, "summary_completion_bank": 30, "note_completion": 30,
    "table_completion": 30, "flow_chart_completion": 40, "diagram_labelling": 40,
}

ORDER_BADGE: dict[str, str] = {
    "sequential": "In passage order",
    "scattered": "Not in order",
    "section_local": "All in one section",
}


# ======================================================================================
# Reading the content documents
# ======================================================================================

def loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except ValueError:
        _log.warning("unparseable stored JSON; using the fallback")
        return fallback


def passage_doc(row: m.ReadingPassage) -> dict[str, Any]:
    """``passage_json`` as a dict, with the row's own identity filled in.

    Deliberately *not* the route's ``_passage_doc``: that one renders instruction lines
    for the player. Here the document is read, never served, and a drill renders its own.
    """
    doc = loads(row.passage_json, {})
    if not isinstance(doc, dict):
        doc = {}
    doc = dict(doc)
    doc["passage_id"] = row.id
    doc.setdefault("id", row.id)
    doc.setdefault("title", row.title)
    doc.setdefault("format", row.format)
    return doc


def iter_questions(doc: dict[str, Any]):
    """``(group_index, group, question)`` over the flat ``question_groups`` array."""
    for group_index, group in enumerate(doc.get("question_groups") or []):
        if not isinstance(group, dict):
            continue
        for question in group.get("questions") or []:
            if isinstance(question, dict):
                yield group_index, group, question


def find_question(doc: dict[str, Any], number: int) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    for _index, group, question in iter_questions(doc):
        if int(question.get("number") or 0) == int(number):
            return group, question
    return None, None


def paragraphs(doc: dict[str, Any]) -> list[dict[str, str]]:
    """Every paragraph in the row, in reading order, across all text blocks.

    One flat sequence is the correct model: paragraph ids are unique across the whole row
    (DESIGN §0.3) precisely so that a letter means one thing everywhere.
    """
    out: list[dict[str, str]] = []
    for block in doc.get("texts") or []:
        if not isinstance(block, dict):
            continue
        for para in block.get("paragraphs") or []:
            if isinstance(para, dict) and para.get("id") is not None:
                out.append({"id": str(para["id"]), "text": str(para.get("text") or "")})
    return out


def paragraph_ids(doc: dict[str, Any]) -> list[str]:
    return [p["id"] for p in paragraphs(doc)]


def paragraph_texts(doc: dict[str, Any], wanted: list[str] | tuple[str, ...]) -> list[dict[str, str]]:
    """The named paragraphs, in passage order — never in the order they were asked for."""
    keep = {str(w) for w in wanted}
    return [p for p in paragraphs(doc) if p["id"] in keep]


def teaching_of(node: Any) -> dict[str, Any]:
    """A question's, group's or passage's ``teaching`` object, or ``{}``.

    Absent-by-default is the contract (DESIGN §0.3): ``schema_version: 1`` rows carry no
    payload at all and must still flow through every function here.
    """
    if not isinstance(node, dict):
        return {}
    payload = node.get("teaching")
    return dict(payload) if isinstance(payload, dict) else {}


def traps_of(question: Any) -> list[str]:
    """Authored trap slugs, filtered to the closed enum and de-duplicated in order."""
    out: list[str] = []
    for slug in teaching_of(question).get("traps") or []:
        text = str(slug).strip()
        if text in TRAPS and text not in out:
            out.append(text)
    return out


def paraphrase_link(question: Any) -> dict[str, Any] | None:
    link = teaching_of(question).get("paraphrase_link")
    if not isinstance(link, dict):
        return None
    stem = str(link.get("stem_phrase") or "").strip()
    text = str(link.get("text_phrase") or "").strip()
    if not stem or not text:
        return None
    devices = [str(d) for d in (link.get("devices") or []) if str(d) in DEVICES]
    return {
        "stem_phrase": stem,
        "text_phrase": text,
        "devices": devices,
        "note": str(link.get("note") or "").strip() or None,
    }


def key_values(question: Any) -> list[str]:
    """Every accepted string for a question, expanded through the shared matcher."""
    if not isinstance(question, dict):
        return []
    return expand_variants(question.get("answers") or [])


def display_key(question: dict[str, Any], qtype: str) -> str:
    """The one string to show as *the* answer. Alternatives live in ``accepted``."""
    values = key_values(question)
    if not values:
        return ""
    if qtype in JUDGEMENT_TYPES:
        return canonical_choice(values[0], qtype) or values[0].upper()
    if qtype in LETTER_TYPES:
        return values[0].upper() if len(values[0]) <= 4 else values[0]
    return values[0]


def group_word_limit(group: Any) -> dict[str, Any] | None:
    if not isinstance(group, dict):
        return None
    return word_limit_of(group.get("word_limit"))


# ======================================================================================
# Bounded search — the paragraph band a sequential answer must lie in
# ======================================================================================

def bounded_band(doc: dict[str, Any], group: dict[str, Any], number: int) -> list[str]:
    """Paragraph ids between the neighbouring questions' anchors, inclusive.

    Only meaningful when the group's answers run in passage order. The band is what a
    learner *could* have worked out during the test from the two questions on either side
    — so showing it is not a hint, it is the strategy made visible. Where a neighbour has
    no anchors the band runs to the end of the passage on that side, which is the honest
    answer rather than a guess.

    Returns ``[]`` when the group is not sequential or the passage has no paragraph ids;
    callers fall back to the anchors, which is what the existing drill already shows.
    """
    qtype = str(group.get("type") or "")
    order = str(teaching_of(group).get("answer_order") or ANSWER_ORDER.get(qtype) or "")
    if order != "sequential":
        return []

    order_of = {pid: index for index, pid in enumerate(paragraph_ids(doc))}
    if not order_of:
        return []

    numbered: list[tuple[int, list[str]]] = []
    for question in group.get("questions") or []:
        if not isinstance(question, dict):
            continue
        anchors = [str(a) for a in (question.get("anchor_paragraphs") or []) if str(a) in order_of]
        numbered.append((int(question.get("number") or 0), anchors))
    numbered.sort(key=lambda pair: pair[0])

    position = next((i for i, (num, _a) in enumerate(numbered) if num == int(number)), None)
    if position is None:
        return []

    low = 0
    for _num, anchors in reversed(numbered[:position]):
        if anchors:
            low = min(order_of[a] for a in anchors)
            break
    high = len(order_of) - 1
    for _num, anchors in numbered[position + 1:]:
        if anchors:
            high = max(order_of[a] for a in anchors)
            break

    own = [order_of[a] for a in numbered[position][1]]
    if own:  # the band must contain the answer even if the neighbours are unanchored
        low, high = min(low, min(own)), max(high, max(own))
    if low > high:
        return []
    ids = paragraph_ids(doc)
    return ids[low: high + 1]


def context_for(
    doc: dict[str, Any],
    group: dict[str, Any],
    question: dict[str, Any],
    *,
    bounded: bool = False,
) -> dict[str, Any]:
    """The text a drill item is allowed to show, and an honest label for what it is.

    ``anchor`` hands over the paragraph the answer is in — fast, and it teaches location
    by giving it away. ``band`` hands over the stretch the answer must lie in, which is
    what the learner could have bracketed for themselves mid-test. ``none`` is the
    degraded case and says so rather than pretending the item ships context.
    """
    anchors = [str(a) for a in (question.get("anchor_paragraphs") or [])]
    band = bounded_band(doc, group, int(question.get("number") or 0)) if bounded else []
    if band and len(band) > len(anchors):
        return {
            "kind": "band",
            "paragraph_ids": band,
            "paragraphs": paragraph_texts(doc, band),
            "note": (
                "The answers to this group run in passage order, so this answer lies "
                "somewhere in these paragraphs. The search is bounded — 'I could not find "
                "it' is a decision you can make here, not a surrender."
            ),
        }
    if anchors:
        return {
            "kind": "anchor",
            "paragraph_ids": anchors,
            "paragraphs": paragraph_texts(doc, anchors),
            "note": None,
        }
    return {
        "kind": "none",
        "paragraph_ids": [],
        "paragraphs": [],
        "note": "This question ships no anchor paragraphs, so answer it from the prompt alone.",
    }


# ======================================================================================
# The reveal — what opens after the answer, never before it
# ======================================================================================

_VERDICTS: dict[str, tuple[str, str, str]] = {
    "true_false_not_given": ("TRUE", "FALSE", "NOT GIVEN"),
    "yes_no_not_given": ("YES", "NO", "NOT GIVEN"),
}


def _distractor_index(question: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Authored distractor entries keyed by the option they describe, upper-cased."""
    out: dict[str, dict[str, Any]] = {}
    for entry in teaching_of(question).get("distractors") or []:
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("key") or "").strip()
        if not key:
            continue
        out[key.upper()] = {
            "key": key,
            "why_tempting": str(entry.get("why_tempting") or "").strip() or None,
            "why_wrong": str(entry.get("why_wrong") or "").strip() or None,
            "diagnosis": str(entry.get("diagnosis") or "").strip() or None,
        }
    return out


def verdict_contrast(question: dict[str, Any], qtype: str) -> dict[str, Any] | None:
    """Why the key is the key **and the other two verdicts are not**, for this statement.

    This is the whole of the trap drill. A learner who is told "the answer is NOT GIVEN"
    learns one item; a learner who is told, on this sentence, what would have had to be
    on the page for FALSE to be right learns the boundary — and the FALSE/NOT GIVEN
    boundary is where the marks in this paper actually go.

    Built entirely from authored fields: the key, the distractor autopsy's two non-keyed
    entries, ``decision_rule`` and ``nearest_text``. Returns ``None`` for a type that has
    no three-way verdict; degrades to whatever is present on ``schema_version: 1`` rows
    and reports that in ``complete``.
    """
    labels = _VERDICTS.get(qtype)
    if not labels:
        return None
    teaching = teaching_of(question)
    key = display_key(question, qtype).upper()
    if key not in labels:
        return None

    distractors = _distractor_index(question)
    _affirm, deny, absent = labels

    rows: list[dict[str, Any]] = []
    for label in labels:
        entry = distractors.get(label)
        rows.append(
            {
                "verdict": label,
                "role": "key" if label == key else "distractor",
                "why_tempting": (entry or {}).get("why_tempting"),
                "why_wrong": (entry or {}).get("why_wrong"),
                "diagnosis": (entry or {}).get("diagnosis"),
            }
        )

    # The one line that names the boundary this item sits on. Which pair matters depends
    # on the key: an absence item is lost to FALSE, a contradiction item is lost to NOT
    # GIVEN, and a supported item is lost to both in different ways.
    if key == absent:
        rival, condition = deny, (
            f"{deny} would need a sentence that says the opposite. There isn't one — "
            "the passage simply never settles this."
        )
    elif key == deny:
        rival, condition = absent, (
            f"{absent} would need the passage to leave this open. It does not: there is a "
            "sentence that denies it."
        )
    else:
        rival, condition = absent, (
            f"{absent} would need the passage to stop short of saying this. It does say it, "
            "in other words."
        )
    rival_entry = distractors.get(rival) or {}
    boundary = {
        "key": key,
        "rival": rival,
        "line": condition,
        "authored": rival_entry.get("why_wrong"),
        "tempting": rival_entry.get("why_tempting"),
    }

    return {
        "type": qtype,
        "key": key,
        "verdicts": rows,
        "boundary": boundary,
        "decision_rule": str(teaching.get("decision_rule") or "").strip() or None,
        "nearest_text": str(teaching.get("nearest_text") or "").strip() or None,
        # ``complete`` is how the UI decides whether to render the full three-row contrast
        # or the single boundary line — a v1 row has neither distractor and must not be
        # dressed up as though it had.
        "complete": all(row["why_wrong"] for row in rows if row["role"] == "distractor"),
    }


def reveal_for(
    doc: dict[str, Any],
    group: dict[str, Any],
    question: dict[str, Any],
    *,
    given: str = "",
    correct: bool = False,
) -> dict[str, Any]:
    """The Solution Card for one item, in DESIGN §10 F1's fixed order.

    Location → paraphrase link → decision rule → distractor autopsy → rule to reuse. The
    option the learner actually chose is pinned to the front of the autopsy, because that
    is the only row they will certainly read.
    """
    qtype = str(group.get("type") or "")
    teaching = teaching_of(question)
    anchors = [str(a) for a in (question.get("anchor_paragraphs") or [])]
    chosen = (given or "").strip()
    chosen_key = canonical_choice(chosen, qtype) if qtype in JUDGEMENT_TYPES else chosen.upper()

    autopsy = list(_distractor_index(question).values())
    autopsy.sort(key=lambda entry: 0 if str(entry["key"]).upper() == chosen_key else 1)

    trap_slugs = traps_of(question)
    return {
        "correct": bool(correct),
        "key": display_key(question, qtype),
        "accepted": key_values(question),
        "location": {
            "passage_id": doc.get("passage_id"),
            "passage_title": doc.get("title"),
            "anchor_paragraphs": anchors,
            "evidence_quote": question.get("evidence_quote"),
            "paragraphs": paragraph_texts(doc, anchors),
            # On a NOT GIVEN item there is no evidence to point at, and the reason for the
            # emptiness is the lesson — so the sentence that tempted you takes its place.
            "nearest_text": str(teaching.get("nearest_text") or "").strip() or None,
        },
        "paraphrase_link": paraphrase_link(question),
        "decision_rule": str(teaching.get("decision_rule") or "").strip() or None,
        "explanation": question.get("explanation"),
        "distractors": autopsy,
        "reusable_rule": str(teaching.get("reusable_rule") or "").strip() or None,
        "traps": [{"slug": slug, **TRAPS[slug]} for slug in trap_slugs],
        "trap_note": question.get("trap_note"),
        "gear": str(teaching.get("gear") or "").strip() or None,
        "grammar_cue": str(teaching.get("grammar_cue") or "").strip() or None,
        "contrast": verdict_contrast(question, qtype),
        "strategy": group_strategy(group),
        "self_diagnosis_options": [
            {"slug": slug, **TRAPS[slug]} for slug in picker_for(qtype)
        ],
    }


def group_strategy(group: dict[str, Any]) -> dict[str, Any]:
    """The strategy card for this group — authored where it exists, typed where it does not."""
    qtype = str(group.get("type") or "")
    teaching = teaching_of(group)
    order = str(teaching.get("answer_order") or ANSWER_ORDER.get(qtype) or "")
    return {
        "qtype": qtype,
        "answer_order": order or None,
        "order_badge": ORDER_BADGE.get(order),
        "strategy": str(teaching.get("strategy") or "").strip() or None,
        "order_note": str(teaching.get("order_note") or "").strip() or None,
        "watch_out": str(teaching.get("watch_out") or "").strip() or None,
        "seconds_per_question": SECONDS_PER_QUESTION.get(qtype),
    }


# ======================================================================================
# The two-stage TFNG scaffold (R1 §7.3)
# ======================================================================================

STAGE_ONE_OPTIONS: tuple[str, str] = ("GIVEN", "NOT GIVEN")


def stage_split(qtype: str, key: str) -> dict[str, Any] | None:
    """Turn one three-way decision into two binaries.

    Stage one asks only whether the passage settles the statement at all. Stage two runs
    only on the survivors and asks which way. The gain is not cosmetic: nearly every
    TFNG loss is a stage-one loss wearing a stage-two costume, and separating them makes
    the learner's own error visible to them.
    """
    labels = _VERDICTS.get(qtype)
    if not labels:
        return None
    affirm, deny, absent = labels
    canon = (canonical_choice(key, qtype) or key).upper()
    if canon not in labels:
        return None
    return {
        "one": {
            "question": "Does the passage settle this statement at all?",
            "options": list(STAGE_ONE_OPTIONS),
            "key": absent if canon == absent else "GIVEN",
        },
        "two": None
        if canon == absent
        else {
            "question": "Which way does it settle it?",
            "options": [affirm, deny],
            "key": canon,
        },
    }


def stage_one_answer(qtype: str, given: str) -> str:
    """Fold a learner's stage-one pick onto ``GIVEN`` / ``NOT GIVEN``."""
    raw = re.sub(r"[^a-z]", "", (given or "").lower())
    if raw in {"ng", "notgiven", "ngiven", "n", "no"} and raw != "n":
        return "NOT GIVEN"
    if canonical_choice(given, qtype) == "NOT GIVEN":
        return "NOT GIVEN"
    if raw in {"g", "given", "yes", "y"}:
        return "GIVEN"
    return ""


# ======================================================================================
# Selecting items out of the bank
# ======================================================================================

def _fingerprint(session: Session) -> str:
    """Cheap cache key: how many live passage rows there are, and the last id.

    A pack import replaces rows wholesale, so both move together. This is not a checksum
    and does not pretend to be one — it exists so a launcher poll does not re-parse every
    ``passage_json`` in the bank three times a second.
    """
    ids = session.scalars(
        select(m.ReadingPassage.id)
        .where(m.ReadingPassage.retired == 0)
        .order_by(m.ReadingPassage.id)
    ).all()
    return f"{len(ids)}:{ids[-1] if ids else ''}"


#: One entry, replaced whenever the fingerprint moves. A census is a whole-bank scan and a
#: launcher asks for it on every mount.
_CENSUS_CACHE: dict[str, dict[str, Any]] = {}


def _live_passages(session: Session) -> list[m.ReadingPassage]:
    return list(
        session.scalars(
            select(m.ReadingPassage)
            .where(m.ReadingPassage.retired == 0)
            .order_by(m.ReadingPassage.id)
        ).all()
    )


def census(session: Session, *, fmt: str | None = None) -> dict[str, Any]:
    """What the bank can actually drill, counted rather than assumed.

    The launcher must never offer a trap the pack exercises twice, or a paraphrase drill
    on a pack with four authored links. DESIGN §5.1 sets the floor at six questions per
    judgement/proposition/locating slug; anything under that is reported as ``thin`` so
    the UI can grey it rather than ship a three-item "drill".
    """
    cache_key = f"{_fingerprint(session)}|{fmt or '*'}"
    cached = _CENSUS_CACHE.get(cache_key)
    if cached is not None:
        return cached

    types: dict[str, int] = {}
    traps: dict[str, int] = {}
    paraphrase_by_passage: dict[str, int] = {}
    skimmable: list[dict[str, Any]] = []
    payloaded = 0
    total_questions = 0
    total_passages = 0

    for row in _live_passages(session):
        if fmt and row.format != fmt:
            continue
        total_passages += 1
        doc = passage_doc(row)
        if teaching_of(doc):
            payloaded += 1
        links = 0
        for _index, group, question in iter_questions(doc):
            total_questions += 1
            qtype = str(group.get("type") or "")
            if qtype:
                types[qtype] = types.get(qtype, 0) + 1
            for slug in traps_of(question):
                traps[slug] = traps.get(slug, 0) + 1
            if paraphrase_link(question):
                links += 1
        if links:
            paraphrase_by_passage[row.id] = links
        gist = skim_sources(doc)
        if gist["items"]:
            skimmable.append(
                {
                    "passage_id": row.id,
                    "title": doc.get("title"),
                    "format": row.format,
                    "gt_section": doc.get("gt_section"),
                    "word_count": row.word_count,
                    "items": len(gist["items"]),
                    "window_s": gist["window_s"],
                    "plan_kind": gist["plan_kind"],
                }
            )

    result = {
        "passages": total_passages,
        "questions": total_questions,
        "passages_with_payload": payloaded,
        "types": [
            {
                "qtype": qtype,
                "count": count,
                "drillable": count >= MIN_SIZE,
                "answer_order": ANSWER_ORDER.get(qtype),
                "order_badge": ORDER_BADGE.get(ANSWER_ORDER.get(qtype, ""), None),
                "seconds_per_question": SECONDS_PER_QUESTION.get(qtype),
            }
            for qtype, count in sorted(types.items(), key=lambda kv: -kv[1])
        ],
        "traps": [
            {
                "slug": slug,
                **TRAPS[slug],
                "count": traps.get(slug, 0),
                "drillable": traps.get(slug, 0) >= MIN_SIZE,
                # DESIGN §5.1 pack rule: six items per slug is the floor below which a
                # drill cannot teach the slug, only demonstrate it.
                "thin": 0 < traps.get(slug, 0) < 6,
            }
            for slug in TRAPS
            if TRAPS[slug]["family"] != "form"  # form errors are diagnosed, never drilled
        ],
        "paraphrase": {
            "links": sum(paraphrase_by_passage.values()),
            "passages": len(paraphrase_by_passage),
            # A passage needs the key plus three lures before it can build one item.
            "drillable": sum(
                1 for count in paraphrase_by_passage.values() if count >= PARAPHRASE_OPTIONS
            ),
        },
        "skim": skimmable,
    }
    # The launcher asks for the unfiltered census and one per format, so a single-entry
    # cache would thrash on exactly the screen the cache exists for.
    if len(_CENSUS_CACHE) > 6:
        _CENSUS_CACHE.clear()
    _CENSUS_CACHE[cache_key] = result
    return result


def _matches(
    group: dict[str, Any],
    question: dict[str, Any],
    *,
    qtype: str | None,
    trap: str | None,
    judgement_only: bool,
) -> bool:
    group_type = str(group.get("type") or "")
    if qtype and group_type != qtype:
        return False
    if judgement_only and group_type not in JUDGEMENT_TYPES:
        return False
    return not (trap and trap not in traps_of(question))


def select_questions(
    session: Session,
    *,
    qtype: str | None = None,
    trap: str | None = None,
    fmt: str | None = None,
    passage_id: str | None = None,
    judgement_only: bool = False,
    size: int = DEFAULT_SIZE,
    seed: str = "",
) -> list[dict[str, Any]]:
    """Candidate items from across the pack, spread over passages and shuffled.

    Spreading matters more than it looks. Ten TFNG items from one passage is a
    comprehension test of that passage; ten from eight passages is a drill of the type,
    which is the entire premise. So candidates are grouped by passage and dealt
    round-robin before the cut.
    """
    wanted = max(MIN_SIZE, min(MAX_SIZE, int(size or DEFAULT_SIZE)))
    by_passage: dict[str, list[dict[str, Any]]] = {}

    for row in _live_passages(session):
        if fmt and row.format != fmt:
            continue
        if passage_id and row.id != passage_id:
            continue
        doc = passage_doc(row)
        for _index, group, question in iter_questions(doc):
            if not _matches(group, question, qtype=qtype, trap=trap,
                            judgement_only=judgement_only):
                continue
            if not key_values(question):
                continue  # unmarkable; never ships
            by_passage.setdefault(row.id, []).append(
                {"row": row, "doc": doc, "group": group, "question": question}
            )

    rng = random.Random(f"reading-drill|{seed}|{qtype}|{trap}|{fmt}|{passage_id}")
    buckets = [by_passage[pid] for pid in sorted(by_passage)]
    for bucket in buckets:
        rng.shuffle(bucket)
    rng.shuffle(buckets)

    dealt: list[dict[str, Any]] = []
    depth = 0
    while len(dealt) < wanted and any(len(b) > depth for b in buckets):
        for bucket in buckets:
            if depth < len(bucket):
                dealt.append(bucket[depth])
                if len(dealt) >= wanted:
                    break
        depth += 1
    return dealt


def question_row_ids(session: Session, pairs: list[tuple[str, int]]) -> dict[tuple[str, int], str]:
    """``(passage_id, number)`` → ``reading_questions.id`` for the items we dealt.

    The flat projection is the stable identity a graded response comes back with, so a
    client never has to echo a whole item and the server never has to remember one.
    """
    if not pairs:
        return {}
    passage_ids = sorted({pid for pid, _n in pairs})
    rows = session.scalars(
        select(m.ReadingQuestion).where(m.ReadingQuestion.passage_id.in_(passage_ids))
    ).all()
    index = {(r.passage_id, r.number): r.id for r in rows}
    return {pair: index[pair] for pair in pairs if pair in index}


# ======================================================================================
# Item construction
# ======================================================================================

def item_id(kind: str, passage_id: str, number: int, seed: str = "") -> str:
    digest = hashlib.sha1(f"{kind}|{passage_id}|{number}|{seed}".encode()).hexdigest()[:8]
    return f"rdr_{kind}_{number}_{digest}"


def _base_item(
    kind: str,
    doc: dict[str, Any],
    group: dict[str, Any],
    question: dict[str, Any],
    *,
    index: int,
    seed: str,
    question_id: str | None,
    bounded: bool,
) -> dict[str, Any]:
    qtype = str(group.get("type") or "")
    number = int(question.get("number") or 0)
    limit = group_word_limit(group)
    return {
        "item_id": item_id(kind, str(doc.get("passage_id")), number, seed),
        "kind": kind,
        "index": index,
        "question_id": question_id,
        "passage_id": doc.get("passage_id"),
        "passage_title": doc.get("title"),
        "number": number,
        "qtype": qtype,
        "prompt": str(question.get("prompt") or ""),
        "options": group.get("options"),
        "word_limit": limit,
        "instructions": instruction_for(limit),
        "instructions_extra": group.get("instructions_extra"),
        "layout": group.get("layout"),
        "context": context_for(doc, group, question, bounded=bounded),
        "difficulty": question.get("difficulty"),
        "band_target": question.get("band_target"),
        "seconds": SECONDS_PER_QUESTION.get(qtype, 60),
        "self_diagnosis_options": [{"slug": s, **TRAPS[s]} for s in picker_for(qtype)],
    }


def type_item(candidate: dict[str, Any], *, index: int, seed: str,
              question_id: str | None, bounded: bool) -> dict[str, Any]:
    item = _base_item(
        "type", candidate["doc"], candidate["group"], candidate["question"],
        index=index, seed=seed, question_id=question_id, bounded=bounded,
    )
    item["grading"] = {
        "mode": "key_match",
        "pass_when": "the answer matches the key through the shared reading/listening matcher",
    }
    item["strategy"] = group_strategy(candidate["group"])
    return item


def trap_item(candidate: dict[str, Any], *, index: int, seed: str,
              question_id: str | None, bounded: bool, two_stage: bool) -> dict[str, Any]:
    """One judgement item, optionally split into the GIVEN/NOT GIVEN scaffold.

    The trap slug is deliberately **not** on the item: naming the trap before the answer
    turns the drill into a matching exercise and destroys the only thing it measures.
    It arrives with the reveal.
    """
    group, question = candidate["group"], candidate["question"]
    qtype = str(group.get("type") or "")
    item = _base_item(
        "trap", candidate["doc"], group, question,
        index=index, seed=seed, question_id=question_id, bounded=bounded,
    )
    item["seconds"] = DRILL_SECONDS["trap"]
    item["choices"] = list(_VERDICTS.get(qtype, ()))
    item["grading"] = {
        "mode": "verdict",
        "pass_when": "the verdict matches the key; the trap and the boundary open afterwards",
    }
    if two_stage and qtype in _VERDICTS:
        affirm, deny, absent = _VERDICTS[qtype]
        # Both stages are described unconditionally. Sending stage two only for the items
        # that *have* one would announce, by its absence, that the key is NOT GIVEN — so
        # the client always offers it after a GIVEN pick and the server decides whether it
        # counted.
        item["two_stage"] = {
            "one": {
                "question": "Does the passage settle this statement at all?",
                "options": list(STAGE_ONE_OPTIONS),
                "hint": (
                    "Answer this and nothing else first. Almost every lost TRUE/FALSE mark "
                    "is really a lost GIVEN / NOT GIVEN mark."
                ),
            },
            "two": {
                "question": "Which way does it settle it?",
                "options": [affirm, deny],
                "when": "GIVEN",
            },
            "not_given_label": absent,
        }
    item["strategy"] = group_strategy(group)
    return item


# --------------------------------------------------------------------------------------
# Paraphrase items
# --------------------------------------------------------------------------------------

_WORD = re.compile(r"[a-z0-9]+")
#: Overlap is measured on content words only. A lure that shares *the* and *of* with the
#: stem is not a keyword match, and counting it as one would rank the options at random.
_STOP: frozenset[str] = frozenset({
    "a", "an", "the", "of", "to", "in", "on", "for", "with", "by", "from", "as", "at",
    "is", "are", "was", "were", "be", "been", "being", "and", "or", "but", "that",
    "this", "these", "those", "it", "its", "their", "his", "her", "our", "your", "not",
    "no", "than", "then", "so", "such", "which", "who", "whom", "whose", "what", "when",
    "where", "how", "they", "them", "he", "she", "we", "you", "i",
})


def _content_words(text: str) -> set[str]:
    return {w for w in _WORD.findall((text or "").lower()) if w not in _STOP and len(w) > 2}


def _overlap(a: str, b: str) -> int:
    return len(_content_words(a) & _content_words(b))


def paraphrase_item(
    candidate: dict[str, Any],
    pool: list[dict[str, Any]],
    *,
    index: int,
    seed: str,
    question_id: str | None,
) -> dict[str, Any] | None:
    """Four passage extracts, one of which actually says what the stem says.

    The lures are the highest-word-overlap ``text_phrase`` values from *other* items —
    preferring the same passage, because a lure from the same text is a lure the learner
    would really have to rule out. That makes the wrong options genuine keyword matches,
    which is exactly the failure mode the item exists to punish. Ranking by overlap and
    then shuffling with a seed keeps the item reproducible without any server state.
    """
    link = paraphrase_link(candidate["question"])
    if not link:
        return None

    doc = candidate["doc"]
    key_text = link["text_phrase"]
    key_words = _content_words(key_text)

    lures: list[tuple[int, int, str]] = []
    seen = {key_text.lower()}
    for other in pool:
        if other is candidate:
            continue
        other_link = paraphrase_link(other["question"])
        if not other_link:
            continue
        phrase = other_link["text_phrase"]
        if phrase.lower() in seen:
            continue
        # A "lure" that shares no vocabulary at all is not a lure, it is filler; one that
        # shares almost everything may genuinely say the same thing and would make the
        # item unfair. Keep the middle.
        shared = len(key_words & _content_words(phrase))
        if key_words and shared >= max(len(key_words) - 1, 3):
            continue
        same_passage = 0 if other["doc"].get("passage_id") == doc.get("passage_id") else 1
        seen.add(phrase.lower())
        lures.append((same_passage, -_overlap(link["stem_phrase"], phrase), phrase))

    lures.sort()
    picked = [phrase for _same, _score, phrase in lures[: PARAPHRASE_OPTIONS - 1]]
    if len(picked) < PARAPHRASE_OPTIONS - 1:
        return None

    rng = random.Random(f"paraphrase|{seed}|{doc.get('passage_id')}|{candidate['question'].get('number')}")
    texts = [key_text, *picked]
    rng.shuffle(texts)
    letters = ["A", "B", "C", "D"]
    options = [{"key": letters[i], "text": text} for i, text in enumerate(texts)]
    answer = next(opt["key"] for opt in options if opt["text"] == key_text)

    devices = link["devices"]
    changing = bool(set(devices) & CHANGING_DEVICES)
    return {
        "item_id": item_id("paraphrase", str(doc.get("passage_id")),
                           int(candidate["question"].get("number") or 0), seed),
        "kind": "paraphrase",
        "index": index,
        "question_id": question_id,
        "passage_id": doc.get("passage_id"),
        "passage_title": doc.get("title"),
        "number": int(candidate["question"].get("number") or 0),
        "qtype": str(candidate["group"].get("type") or ""),
        "seconds": DRILL_SECONDS["paraphrase"],
        "prompt": "Which extract says the same thing as the phrase from the question?",
        "stem_phrase": link["stem_phrase"],
        "source_prompt": str(candidate["question"].get("prompt") or ""),
        "options": options,
        "answer_key": answer,  # stripped before the item is served; see strip_key()
        "device_step": (
            {
                "question": "Did that rewording change the meaning, or keep it?",
                "options": ["preserving", "changing"],
                "answer": "changing" if changing else "preserving",
                "devices": [{"slug": d, **DEVICES[d]} for d in devices],
                "why": (
                    "A rewording that changes scope or certainty is what makes a statement "
                    "FALSE rather than TRUE. Sorting a rewording into these two buckets is, "
                    "more or less, doing True/False/Not Given."
                ),
            }
            if devices
            else None
        ),
        "note": link["note"],
        "grading": {
            "mode": "paraphrase_choice",
            "pass_when": "the extract that carries the same proposition is chosen",
        },
    }


# --------------------------------------------------------------------------------------
# Skim items
# --------------------------------------------------------------------------------------

def skim_sources(doc: dict[str, Any]) -> dict[str, Any]:
    """Everything in one passage that can be answered from gist, and the window it gets.

    Two sources, in this order:

    1. the authored ``skim_plan.map`` — one label per paragraph, which becomes "which
       paragraph is mainly about X?". This is the truest gist item there is and it costs
       no new content, because the map already exists to be compared against the
       learner's own two-minute map;
    2. bank questions the author tagged ``gear: "skim"`` — best-title MCQs and matching
       headings, the two types that are *supposed* to be answered without close reading.

    A GT Section 1–2 row carries a ``field_scan`` plan and no map by design (DESIGN §3.2:
    do not teach the paragraph map on those texts), so it contributes only source 2.
    """
    teaching = teaching_of(doc)
    plan = teaching.get("skim_plan") if isinstance(teaching.get("skim_plan"), dict) else {}
    plan_kind = str(plan.get("kind") or "") or None
    window = plan.get("budget_s")
    try:
        window_s = int(window)
    except (TypeError, ValueError):
        window_s = SKIM_WINDOW_DEFAULT.get(plan_kind or "paragraph_map", 120)

    items: list[dict[str, Any]] = []
    known = set(paragraph_ids(doc))

    labels: list[tuple[str, str]] = []
    for entry in plan.get("map") or []:
        if not isinstance(entry, dict):
            continue
        pid, label = str(entry.get("paragraph") or ""), str(entry.get("label") or "").strip()
        if pid in known and label:
            labels.append((pid, label))
    # A label that fits two paragraphs is not a gist item, it is a coin toss.
    counted: dict[str, int] = {}
    for _pid, label in labels:
        counted[label.lower()] = counted.get(label.lower(), 0) + 1
    for pid, label in labels:
        if counted[label.lower()] > 1:
            continue
        items.append(
            {
                "source": "map_label",
                "paragraph": pid,
                "label": label,
                "prompt": f"Which paragraph is mainly about: {label}?",
            }
        )

    for _index, group, question in iter_questions(doc):
        if str(teaching_of(question).get("gear") or "") != "skim":
            continue
        if not key_values(question):
            continue
        items.append(
            {
                "source": "bank",
                "group": group,
                "question": question,
                "prompt": str(question.get("prompt") or ""),
            }
        )

    return {
        "items": items,
        "window_s": max(30, min(180, window_s)),
        "plan_kind": plan_kind,
        "read_first": str(plan.get("read_first") or "").strip() or None,
        "skip": str(plan.get("skip") or "").strip() or None,
        "fields": [str(f) for f in (plan.get("fields") or []) if str(f).strip()],
    }


def skim_items(
    doc: dict[str, Any],
    sources: dict[str, Any],
    *,
    seed: str,
    size: int,
    row_ids: dict[tuple[str, int], str],
) -> list[dict[str, Any]]:
    """The gist questions, map labels first, capped and shuffled deterministically."""
    passage_id = str(doc.get("passage_id"))
    rng = random.Random(f"skim|{seed}|{passage_id}")
    pool = list(sources["items"])
    rng.shuffle(pool)
    pool.sort(key=lambda entry: 0 if entry["source"] == "map_label" else 1)

    letters = paragraph_ids(doc)
    out: list[dict[str, Any]] = []
    for index, entry in enumerate(pool[: max(MIN_SIZE, min(MAX_SIZE, size))], start=1):
        if entry["source"] == "map_label":
            out.append(
                {
                    "item_id": item_id("skim", passage_id, index, f"{seed}|{entry['paragraph']}"),
                    "kind": "skim",
                    "index": index,
                    "question_id": None,
                    "passage_id": passage_id,
                    "passage_title": doc.get("title"),
                    "number": None,
                    "qtype": "matching_information",
                    "source": "map_label",
                    "prompt": entry["prompt"],
                    "options": [{"key": pid, "text": f"Paragraph {pid}"} for pid in letters],
                    "answer_key": entry["paragraph"],
                    "label": entry["label"],
                    "seconds": DRILL_SECONDS["skim"],
                    "grading": {"mode": "key_match",
                                "pass_when": "the paragraph the author labelled this way is chosen"},
                }
            )
            continue
        group, question = entry["group"], entry["question"]
        number = int(question.get("number") or 0)
        item = _base_item(
            "skim", doc, group, question,
            index=index, seed=seed,
            question_id=row_ids.get((passage_id, number)),
            bounded=False,
        )
        # The whole point is that the passage is gone by now, so a drill that hands back
        # the anchor paragraph is not a skim drill.
        item["context"] = {"kind": "none", "paragraph_ids": [], "paragraphs": [], "note": None}
        item["source"] = "bank"
        item["seconds"] = DRILL_SECONDS["skim"]
        item["grading"] = {"mode": "key_match", "pass_when": "the answer matches the key"}
        out.append(item)
    return out


# ======================================================================================
# Grading — mechanical, and the only place a verdict is decided
# ======================================================================================

def grade_answer(
    *,
    qtype: str,
    given: Any,
    accepted: Any,
    word_limit: Any = None,
) -> dict[str, Any]:
    """One mechanical verdict, through the shared matcher and nothing else.

    Never re-implements normalisation: ``answers_match`` already knows that ``1,500`` is
    ``1500``, that ``n.g.`` is NOT GIVEN and that a letter answer is an unordered set. A
    second copy of those rules in the drill layer is a second set of bugs.
    """
    raw = "" if given is None else str(given)
    correct = answers_match(raw, accepted, question_type=qtype, word_limit=word_limit)
    answered = bool(raw.strip())
    over_limit = bool(
        answered and not correct and word_limit is not None
        and qtype in TEXT_TYPES
        and not within_word_limit(raw, word_limit)
    )
    spelling_leak = bool(
        answered and not correct and qtype not in (LETTER_TYPES | CHOICE_TYPES)
        and near_miss(raw, accepted)
    )
    return {
        "correct": correct,
        "answered": answered,
        "given": raw,
        "over_limit": over_limit,
        "near_miss_spelling": spelling_leak,
        # Form failures are not comprehension failures and must stay separable in the
        # stats: they need an answer-form fix, not a reading one (DESIGN §5.1 family F).
        "form_trap": (
            "over_limit" if over_limit
            else "spelling" if spelling_leak
            else "ran_out_of_time" if not answered
            else None
        ),
    }


def grade_two_stage(qtype: str, key: str, response: dict[str, Any]) -> dict[str, Any]:
    """Mark the GIVEN/NOT GIVEN pass and the TRUE/FALSE pass separately.

    Separating them is the whole value: "you knew the passage dealt with it and then
    picked the wrong direction" and "you never located it" are two different diagnoses
    and two different remedies (R4 §1.2).
    """
    stages = stage_split(qtype, key)
    if not stages:
        return {"available": False}
    one_key = stages["one"]["key"]
    one_given = stage_one_answer(qtype, str(response.get("stage_one") or ""))
    one_ok = bool(one_given) and one_given == one_key

    two = stages["two"]
    if two is None:
        return {
            "available": True,
            "stage_one": {"given": one_given or None, "key": one_key, "correct": one_ok},
            "stage_two": None,
            "diagnosis": (
                "located_and_read" if one_ok
                else "read_something_that_was_not_there"
            ),
        }

    two_given = str(response.get("given") or "")
    two_ok = one_ok and answers_match(two_given, [two["key"]], question_type=qtype)
    return {
        "available": True,
        "stage_one": {"given": one_given or None, "key": one_key, "correct": one_ok},
        "stage_two": {
            "given": two_given or None,
            "key": two["key"],
            "correct": bool(two_ok),
            "skipped": not one_ok,
        },
        "diagnosis": (
            "located_and_read" if two_ok
            else "located_wrong_direction" if one_ok
            else "did_not_locate"
        ),
    }


def grade_paraphrase(item: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    """The extract choice, plus the preserving/changing call when the pair has devices."""
    chosen = str(response.get("given") or "").strip()
    key = str(item.get("answer_key") or "")
    correct = answers_match(chosen, [key], question_type="matching_features")

    step = item.get("device_step")
    device_result = None
    if isinstance(step, dict):
        picked = str(response.get("device_choice") or "").strip().lower()
        expected = str(step.get("answer") or "")
        device_result = {
            "asked": True,
            "given": picked or None,
            "key": expected,
            "correct": bool(picked) and picked == expected,
            "devices": step.get("devices") or [],
            "why": step.get("why"),
        }
    return {
        "correct": correct,
        "answered": bool(chosen),
        "given": chosen,
        "key": key,
        "device": device_result,
        "form_trap": None if chosen else "ran_out_of_time",
    }


def self_diagnosis(authored: list[str], picked: str | None) -> dict[str, Any]:
    """What the learner said went wrong, against what the author says went wrong.

    The disagreement rate is a metacognition signal in its own right (R4 §2.3): a learner
    who consistently names the wrong trap is not learning from the reveal, whatever their
    accuracy is doing.
    """
    slug = (picked or "").strip() or None
    if slug and slug not in TRAPS and slug != "unsure":
        slug = None
    agreed = bool(slug and slug in authored)
    return {
        "picked": slug,
        "picked_label": TRAPS[slug]["name"] if slug in TRAPS else None,
        "authored": authored,
        "authored_labels": [TRAPS[s]["name"] for s in authored],
        "agreed": agreed,
        # No authored trap is a legitimate state — not every item is a trap, and pretending
        # otherwise trains paranoia (DESIGN §5.1).
        "comparable": bool(slug and slug != "unsure" and authored),
    }


# ======================================================================================
# Persistence — the same two rows the existing drill route writes
# ======================================================================================

def record_set(
    session: Session,
    *,
    profile_id: str,
    kind: str,
    qtype: str | None,
    trap: str | None,
    results: list[dict[str, Any]],
    params: dict[str, Any],
    duration_s: int | None = None,
    now: str,
) -> str:
    """One ``practice_sessions`` envelope and one ``drill_results`` row. No new table.

    ``details_json`` carries the per-item verdicts *and* the trap comparison, because the
    trap profile the results screen draws is an aggregate over exactly that: which traps a
    learner loses marks to, and how often the trap they name is the trap that was set.
    """
    from ulid import ULID

    drill_id = f"dr_{ULID()}"
    n_items = len(results)
    n_correct = sum(1 for r in results if r.get("correct"))
    trap_hits: dict[str, int] = {}
    for result in results:
        if result.get("correct"):
            continue
        for slug in result.get("traps") or []:
            trap_hits[slug] = trap_hits.get(slug, 0) + 1
        form = (result.get("marking") or {}).get("form_trap")
        if form:
            trap_hits[form] = trap_hits.get(form, 0) + 1

    session.add(
        m.PracticeSession(
            id=drill_id,
            profile_id=profile_id,
            module="reading",
            activity=f"drill:{RESULT_KINDS.get(kind, kind)}",
            ended_at=now,
            duration_s=duration_s,
            summary_json=json.dumps(
                {
                    "kind": kind,
                    "qtype": qtype,
                    "trap": trap,
                    "n_items": n_items,
                    "n_correct": n_correct,
                    "trap_hits": trap_hits,
                },
                ensure_ascii=False,
            ),
        )
    )
    session.flush()
    session.add(
        m.DrillResult(
            id=drill_id,
            module="reading",
            drill_kind=RESULT_KINDS.get(kind, kind),
            qtype=qtype,
            n_items=n_items,
            n_correct=n_correct,
            params_json=json.dumps({**params, "kind": kind, "trap": trap}, ensure_ascii=False),
            details_json=json.dumps(
                {
                    "trap_hits": trap_hits,
                    "items": [
                        {
                            "item_id": r.get("item_id"),
                            "question_id": r.get("question_id"),
                            "passage_id": r.get("passage_id"),
                            "number": r.get("number"),
                            "qtype": r.get("qtype"),
                            "correct": bool(r.get("correct")),
                            "given": (r.get("marking") or {}).get("given"),
                            "traps": r.get("traps") or [],
                            "self_trap": (r.get("self_diagnosis") or {}).get("picked"),
                            "agreed": (r.get("self_diagnosis") or {}).get("agreed"),
                            "two_stage": (r.get("two_stage") or {}).get("diagnosis"),
                        }
                        for r in results
                    ],
                },
                ensure_ascii=False,
            ),
        )
    )
    session.flush()
    return drill_id


def trap_profile(session: Session, profile_id: str, *, limit: int = 12) -> list[dict[str, Any]]:
    """Which traps this learner actually loses marks to, across tests and drills.

    Two sources, deliberately merged: wrong answers on full and passage attempts (join
    ``reading_answers`` back to the passage document to recover the authored slugs — there
    is no ``trap_codes_json`` column yet, DESIGN §0.4 D3), and the ``trap_hits`` a drill
    already summarised. Merging them is the point of one closed taxonomy: a learner's
    history is a diagnosis rather than a percentage.
    """
    counts: dict[str, int] = {}

    wrong_ids = [
        row[0]
        for row in session.execute(
            select(m.ReadingAnswer.question_id)
            .join(m.ReadingAttempt, m.ReadingAttempt.id == m.ReadingAnswer.attempt_id)
            .join(m.PracticeSession, m.PracticeSession.id == m.ReadingAttempt.id)
            .where(m.ReadingAnswer.correct == 0, m.PracticeSession.profile_id == profile_id)
        ).all()
    ]
    if wrong_ids:
        rows = session.scalars(
            select(m.ReadingQuestion).where(m.ReadingQuestion.id.in_(wrong_ids))
        ).all()
        by_passage: dict[str, set[int]] = {}
        for row in rows:
            by_passage.setdefault(row.passage_id, set()).add(row.number)
        for passage_id, numbers in by_passage.items():
            passage = session.get(m.ReadingPassage, passage_id)
            if passage is None:
                continue
            doc = passage_doc(passage)
            for _index, _group, question in iter_questions(doc):
                if int(question.get("number") or 0) not in numbers:
                    continue
                for slug in traps_of(question):
                    counts[slug] = counts.get(slug, 0) + 1

    for row in session.scalars(
        select(m.DrillResult)
        .join(m.PracticeSession, m.PracticeSession.id == m.DrillResult.id)
        .where(m.DrillResult.module == "reading", m.PracticeSession.profile_id == profile_id)
    ).all():
        details = loads(row.details_json, {})
        for slug, hits in (details.get("trap_hits") or {}).items():
            if slug in TRAPS:
                counts[slug] = counts.get(slug, 0) + int(hits)

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [
        {"slug": slug, **TRAPS[slug], "lost": hits, "drillable": TRAPS[slug]["family"] != "form"}
        for slug, hits in ranked
    ]


# ======================================================================================
# Serving — the key never leaves the server before the answer arrives
# ======================================================================================

_ITEM_SECRETS = ("answer_key", "answer", "key")


def strip_key(item: dict[str, Any]) -> dict[str, Any]:
    """The item as the learner sees it: no key, no device answer, no device names.

    Nothing in this module ever *puts* the authored trap slug, the evidence quote, the
    explanation or the decision rule on an item — they are assembled by :func:`reveal_for`
    at grading time and reach the client only with the verdict. This function closes the
    remaining two leaks: the generated ``answer_key`` a paraphrase or map-label item
    carries, and the ``device_step`` answer, which would give the key away by elimination
    (a pair labelled *modality changed* announces which extract is the real one). Both are
    absent from the response body rather than hidden behind a renderer flag — the standard
    the mock is held to, applied here too.
    """
    out = json.loads(json.dumps(item, ensure_ascii=False))
    for field in _ITEM_SECRETS:
        out.pop(field, None)
    step = out.get("device_step")
    if isinstance(step, dict):
        step.pop("answer", None)
        step.pop("devices", None)
    return out
