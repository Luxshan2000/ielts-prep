"""The reading coach — the read side of the authored teaching payload.

The teaching layer lives inside ``reading_passages.passage_json`` at three depths, all
of them authored to ``content/core-en/staging-reading/DESIGN.md``:

* ``passage_json.teaching`` — time budget, difficulty rationale, skim plan, paraphrase
  families, hinge words, mineable vocabulary, measured metrics (DESIGN §3);
* ``question_groups[].teaching`` — answer order, the attack plan for this type on *this*
  passage, the order note, the group's time budget, what it is built to provoke (§2);
* ``question_groups[].questions[].teaching`` — the paraphrase link, the decision rule,
  the distractor autopsy, the reusable rule, the trap slugs, the gear (§1).

One rule outranks everything else in this file:

    **A worked solution is never returned for a passage the learner has not attempted.**

In speaking and writing the thing withheld is a model answer, because a model read
before the attempt becomes a script to memorise. Reading is receptive and nothing here
can be memorised into a score — but the damage is worse, not smaller. ``evidence_quote``
*is* the answer, ``paraphrase_link.text_phrase`` points straight at it, and a trap slug
like ``absence_read_as_contradiction`` announces that the key is NOT GIVEN. Reading one
solution card does not teach the learner anything and permanently spends the practice
value of that passage, which cannot be regenerated.

:func:`gate_state` is the only place that decides, :func:`teaching_payload` is the only
place that assembles the response, and the gate covers every field that carries the
answer or its location. There is deliberately **no client attestation escape hatch**: a
reading attempt is written to the database by ``POST /attempts/{id}/submit`` before that
call returns, so unlike the speaking renderer there is never a window in which the
learner has attempted and the sidecar cannot see it.

Everything here is absent-by-default. The passages that shipped before the teaching pass
carry no ``teaching`` object at all, so every accessor returns an empty structure rather
than raising: such a passage renders as "no teaching material for this passage yet"
instead of a 500.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.jsoncol import loads
from bandready.scoring.answers import (
    CHOICE_TYPES,
    LETTER_TYPES,
    MULTI_TYPES,
    TEXT_TYPES,
    canonical_choice,
    expand_variants,
    normalize_answer,
    normalize_letters,
    within_word_limit,
    word_limit_of,
)
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.reading.coach")

SCHEMA_VERSION = 1


# ======================================================================================
# The closed enums (DESIGN §5). Slugs are simultaneously a content field, a review
# picker, a progress axis, a drill filter and the constrained vocabulary for the
# "why was I wrong" call. Never rename one after content ships.
# ======================================================================================

#: ``teaching.traps[]`` — the closed trap taxonomy, grouped into the four families the
#: results screen reports separately. ``family`` F is deliberately apart: those are form
#: and process losses, never comprehension losses, and they need a different fix.
TRAP_FAMILIES: dict[str, str] = {
    "J": "Judgement — the three-way decision",
    "P": "Proposition matching",
    "L": "Locating and choosing",
    "F": "Form and process",
}

TRAPS: dict[str, dict[str, str]] = {
    # ---- Family J — judgement (TFNG / YNNG, and the MCQ items that turn on the same) --
    "absence_read_as_contradiction": {
        "family": "J",
        "label": "Phantom contradiction",
        "what_happened": (
            "The key is NOT GIVEN and you wrote FALSE. The passage is silent and the "
            "silence felt like a denial."
        ),
        "fix": (
            "Before writing FALSE, name the sentence that does the contradicting. If you "
            "cannot quote it, the answer is NOT GIVEN."
        ),
    },
    "contradiction_read_as_absence": {
        "family": "J",
        "label": "Missed contradiction",
        "what_happened": (
            "The key is FALSE and you wrote NOT GIVEN. The contradiction was there, "
            "carried by one word or by the following sentence."
        ),
        "fix": (
            "This is a searching failure, not a reasoning one. Read one sentence past the "
            "match before deciding nothing was said."
        ),
    },
    "causal_link_assumed": {
        "family": "J",
        "label": "Two facts, one invented link",
        "what_happened": (
            "The text states X and states Y and never states that X caused Y."
        ),
        "fix": "Ask which sentence states the link. Adjacency is not causation.",
    },
    "plausible_inference": {
        "family": "J",
        "label": "Reasonable inference",
        "what_happened": "It follows plausibly and it is not stated.",
        "fix": "If a step of reasoning is needed to get there, the answer is NOT GIVEN.",
    },
    "comparison_invented": {
        "family": "J",
        "label": "Invented comparison",
        "what_happened": (
            "Facts about A and about B are given separately and the statement ranks them."
        ),
        "fix": "NOT GIVEN however easy the arithmetic. The text has to do the comparing.",
    },
    "comparison_reversed": {
        "family": "J",
        "label": "Comparison flipped",
        "what_happened": "A exceeded B was read as B exceeded A.",
        "fix": "FALSE, and quotable. Put your finger on which side of the comparison is larger.",
    },
    "attribution_shift": {
        "family": "J",
        "label": "Whose view is it?",
        "what_happened": (
            "The claim belongs to a named researcher or to 'critics'; the statement gives "
            "it to the writer, or to the wrong person."
        ),
        "fix": (
            "On YES/NO/NOT GIVEN, find the reporting verb first. The question is always "
            "about the writer unless it names somebody else."
        ),
    },
    "outside_knowledge": {
        "family": "J",
        "label": "True in the world, not in the text",
        "what_happened": "You answered from what you already know.",
        "fix": "Most dangerous on familiar topics. The only evidence is on the page.",
    },
    # ---- Family P — proposition matching (every type) ---------------------------------
    "lexical_lure": {
        "family": "P",
        "label": "Word match, no meaning match",
        "what_happened": (
            "The content words are all present and the relation between them is different "
            "or reversed."
        ),
        "fix": "Match the relation, not the vocabulary. Who does what to whom.",
    },
    "paraphrase_missed": {
        "family": "P",
        "label": "Meaning match not recognised",
        "what_happened": (
            "The text does state it, fully, in other words, and you answered NOT GIVEN or "
            "picked nothing."
        ),
        "fix": "Search for the idea, not the wording. The item writer changed the wording on purpose.",
    },
    "scope_shift": {
        "family": "P",
        "label": "Quantifier or scope shift",
        "what_happened": "some↔all, often↔always, one district↔nationally, a study↔research generally.",
        "fix": "Underline every quantifier in the statement before you look at the text.",
    },
    "hedge_stripped": {
        "family": "P",
        "label": "Certainty inflated or deflated",
        "what_happened": "'may reduce' read as 'reduces'; 'suggests' read as 'proves'.",
        "fix": "The modal is the answer. Compare the strength of the two claims, not their content.",
    },
    "time_shift": {
        "family": "P",
        "label": "Wrong point on the timeline",
        "what_happened": "A plan read as an implementation; past practice asserted as current.",
        "fix": "Check the tense and any date before deciding.",
    },
    "negation_missed": {
        "family": "P",
        "label": "A not / rarely / failed to was skipped",
        "what_happened": "Including negative prefixes and the double negation of a negated antonym.",
        "fix": "Read the verb group twice on any statement that feels obviously true.",
    },
    "partial_condition": {
        "family": "P",
        "label": "Half true",
        "what_happened": "One clause is supported and one is not.",
        "fix": "TRUE requires all of it. Split the statement at the conjunction and check both halves.",
    },
    # ---- Family L — locating and choosing between options ------------------------------
    "detail_for_main_idea": {
        "family": "L",
        "label": "A detail taken for the point",
        "what_happened": (
            "The heading matches something the paragraph mentions rather than what the "
            "paragraph does."
        ),
        "fix": "Say the paragraph's job in six words before you look at the list of headings.",
    },
    "heading_too_broad": {
        "family": "L",
        "label": "The topic of the whole text",
        "what_happened": (
            "The heading names the passage's subject rather than this paragraph's "
            "contribution to it."
        ),
        "fix": "A heading that would fit three paragraphs fits none of them.",
    },
    "heading_cascade": {
        "family": "L",
        "label": "Error propagated",
        "what_happened": (
            "One wrong placement forced a second, because headings cannot be reused."
        ),
        "fix": "Place only the paragraphs you are certain of first; leave the doubtful ones open.",
    },
    "parallel_decoy": {
        "family": "L",
        "label": "The topic returns later",
        "what_happened": (
            "Two paragraphs discuss the same thing; the answer is in the second and the "
            "decoy is in the first."
        ),
        "fix": "Keep reading after the first match on any question that mentions a recurring topic.",
    },
    "true_but_not_asked": {
        "family": "L",
        "label": "Accurate, irrelevant",
        "what_happened": "The option is true of the passage and does not answer this stem.",
        "fix": "Read the stem, answer it in your own words, then look at the options.",
    },
    "neighbour_answer": {
        "family": "L",
        "label": "Right answer, wrong number",
        "what_happened": "The answer belonged to the adjacent item.",
        "fix": "Check the question number against the line you took the answer from.",
    },
    "order_ignored": {
        "family": "L",
        "label": "Searched the whole passage",
        "what_happened": "The group runs in passage order and the answer was already bracketed.",
        "fix": "On a sequential group, search only between the previous answer and the next one.",
    },
    # ---- Family F — form and process. Never a comprehension failure. -------------------
    "over_limit": {
        "family": "F",
        "label": "Over the word limit",
        "what_happened": "Right content, wrong length. Articles count.",
        "fix": "Count the words of every completion answer before moving on. A certain zero otherwise.",
    },
    "spelling": {
        "family": "F",
        "label": "Mis-copied",
        "what_happened": "The answer was on the screen and the copy was wrong.",
        "fix": "Copy letter by letter from the passage, never from memory.",
    },
    "form_error": {
        "family": "F",
        "label": "Right word, wrong form",
        "what_happened": (
            "Singular for plural, wrong word class, or paraphrased where the answer had to "
            "be copied."
        ),
        "fix": "Read the completed sentence back. If it does not parse, the form is wrong.",
    },
    "wrong_option_form": {
        "family": "F",
        "label": "Wrote the word, not the letter",
        "what_happened": "Letter-answer types, and the wrong number of letters on 'choose TWO'.",
        "fix": "Answer letter-types with a letter, and count your selections.",
    },
    "ran_out_of_time": {
        "family": "F",
        "label": "Not a comprehension error",
        "what_happened": "Blank, or a guess taken under the clock.",
        "fix": "Never leave a blank: there is no penalty for a wrong answer and no credit for an empty box.",
    },
}

#: ``paraphrase_link.devices[]`` — the 14 rewording devices. The ``preserving`` flag is
#: the whole lesson: sorting a rewording into meaning-preserving vs meaning-changing is,
#: more or less, TFNG.
DEVICES: dict[str, dict[str, Any]] = {
    "synonym": {"preserving": True, "label": "Synonym", "note": "one content word swapped"},
    "superordinate": {
        "preserving": True,
        "label": "Specific → category",
        "note": "larch and spruce → conifers",
    },
    "hyponym": {"preserving": True, "label": "Category → instance", "note": "the reverse move"},
    "nominalisation": {
        "preserving": True,
        "label": "Verb → noun",
        "note": "the ice retreated → the retreat of the ice",
    },
    "verbalisation": {
        "preserving": True,
        "label": "Noun → verb",
        "note": "a reduction in cost → costs fell",
    },
    "voice_shift": {
        "preserving": True,
        "label": "Active ↔ passive",
        "note": "often with the agent deleted — a NOT GIVEN factory",
    },
    "converse": {
        "preserving": True,
        "label": "Converse",
        "note": "A supplied B to C ↔ C obtained B from A; reversing it makes FALSE",
    },
    "negated_antonym": {
        "preserving": True,
        "label": "Negated antonym",
        "note": "few adopted it ↔ it was not widely adopted",
    },
    "compression": {
        "preserving": True,
        "label": "Compression",
        "note": "multiword ↔ single word; changes length, so it breaks word limits",
    },
    "clause_restructure": {
        "preserving": True,
        "label": "Clause restructure",
        "note": "the proposition may cross a sentence boundary",
    },
    "gloss_swap": {
        "preserving": True,
        "label": "Term ↔ its definition",
        "note": "photovoltaic panels → panels that turn light into electricity",
    },
    "figure_restatement": {
        "preserving": True,
        "label": "Number ↔ expression",
        "note": "from 20% to 40% → doubled",
    },
    "scope_change": {
        "preserving": False,
        "label": "Scope change",
        "note": "some ↔ most ↔ all. MEANING-CHANGING — yields FALSE",
    },
    "modality_change": {
        "preserving": False,
        "label": "Modality change",
        "note": "may reduce ↔ reduces. MEANING-CHANGING — yields FALSE",
    },
}

#: ``distractors[].diagnosis`` — why that option fails, from the marker's side.
DIAGNOSES: dict[str, str] = {
    "true_but_not_asked": "true of the passage, not an answer to this stem",
    "right_words_wrong_paragraph": "the words are in the passage, in the wrong place",
    "overstated": "stronger than the text",
    "understated": "weaker than the text",
    "partially_true": "one half supported, one half not",
    "unstated": "nothing in the text says it",
    "too_narrow": "covers part of what the paragraph does",
    "too_broad": "would fit several paragraphs",
    "reversed": "the relation runs the other way",
    "wrong_claimant": "the right claim, the wrong person",
    "wrong_period": "the right fact, the wrong time",
    "wrong_form": "right content, wrong number, word class or verbatim form",
    "no_contradiction": "FALSE chosen, and nothing in the text contradicts",
    "contradiction_present": "NOT GIVEN chosen, and the text does contradict",
    "support_present": "NOT GIVEN chosen, and the text does state it",
}

#: ``teaching.gear`` — R3's careful/expeditious × local/global taxonomy, per question.
GEARS: dict[str, str] = {
    "skim": "expeditious, global — sampling for gist",
    "scan": "expeditious, local — hunting a form you already know: a date, a name, a figure",
    "search": (
        "expeditious, local→global — hunting a meaning when you do not know its wording. "
        "The gear the paper demands most and the one preparation material never names"
    ),
    "close": "careful — full processing of two to four sentences, once you have located them",
}

#: ``difficulty_rationale.levers[]``, ranked by how much they actually move difficulty.
LEVERS: dict[str, str] = {
    "density": "propositional density — how many claims per sentence",
    "abstraction": "how far the subject matter is from things you can point at",
    "implicit_cohesion": "links between sentences left for the reader to supply",
    "lexis": "lexical sophistication",
    "syntax": "syntactic complexity",
    "argument_structure": "rhetorical structure — concession, qualification, verdict",
}


# ======================================================================================
# Per-type strategy — static app copy (DESIGN §10 F3), written once.
#
# `answer_order` and `seconds_per_question` are published properties of the question
# type, not authorial choices: an app that gets them wrong ships a wrong strategy card.
# Everything else on this page is our own summary of how the type behaves.
# ======================================================================================

ORDER_BADGES: dict[str, str] = {
    "sequential": "In passage order",
    "scattered": "Not in order",
    "section_local": "All in one section",
}

ORDER_NOTES: dict[str, str] = {
    "sequential": (
        "The answers appear in the order the questions do. Once you have Q12 and Q14, "
        "Q13 is between them — search the band, not the passage."
    ),
    "scattered": (
        "The answers are anywhere. Do this group last if you can: by then you have read "
        "the passage for another group and you are searching a text you know."
    ),
    "section_local": (
        "Officially guaranteed and badly under-taught: the answers all come from ONE "
        "section of the passage, not the whole text. Locate the section once, then work "
        "inside it. That turns the scariest-looking types into the fastest ones."
    ),
}

ONE_LINE_ORDER_RULE = (
    "Everything called 'matching' is out of order except sentence endings; everything "
    "shaped like a summary, a table or a picture comes from one section; everything else "
    "runs top to bottom."
)


@dataclass(frozen=True)
class TypeStrategy:
    """The static per-type page. One per question type in the bank."""

    qtype: str
    label: str
    tests: str
    gear: str
    answer_order: str
    seconds_per_question: int
    first_move: str
    losses: tuple[str, str]
    rule: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "qtype": self.qtype,
            "label": self.label,
            "tests": self.tests,
            "gear": self.gear,
            "gear_note": GEARS.get(self.gear, ""),
            "answer_order": self.answer_order,
            "order_badge": ORDER_BADGES.get(self.answer_order, self.answer_order),
            "order_note": ORDER_NOTES.get(self.answer_order, ""),
            "seconds_per_question": self.seconds_per_question,
            "first_move": self.first_move,
            "characteristic_losses": list(self.losses),
            "rule": self.rule,
        }


TYPE_STRATEGY: dict[str, TypeStrategy] = {
    s.qtype: s
    for s in (
        TypeStrategy(
            qtype="true_false_not_given",
            label="True / False / Not Given",
            tests="whether a statement about the facts agrees with the passage, contradicts it, or is absent from it",
            gear="close",
            answer_order="sequential",
            seconds_per_question=70,
            first_move=(
                "Read the statement and underline the words that make it strong: every, "
                "only, first, all, never, and any comparison. Then find the place, then "
                "read closely."
            ),
            losses=(
                (
                    "FALSE written where the key is NOT GIVEN — the passage was silent and the "
                    "silence felt like a denial. The commonest error in the paper."
                ),
                (
                    "NOT GIVEN written where the key is FALSE — the contradiction was one word "
                    "further on than you read."
                ),
            ),
            rule=(
                "Split the decision in two. First ask: is this topic dealt with here at "
                "all? If not, NOT GIVEN and move on. Only then ask: does the text agree or "
                "disagree? A three-way decision becomes two binaries."
            ),
        ),
        TypeStrategy(
            qtype="yes_no_not_given",
            label="Yes / No / Not Given",
            tests="whether a statement about the WRITER'S views and claims matches the passage",
            gear="close",
            answer_order="sequential",
            seconds_per_question=80,
            first_move=(
                "Find the reporting verb. 'Critics argue', 'Marsh suggests', 'it is widely "
                "assumed' — decide whose view is on the page before you judge it."
            ),
            losses=(
                (
                    "A view belonging to a named researcher or to 'critics' credited to the "
                    "writer. The defining trap of the type."
                ),
                "A hedge stripped: 'may well be' read as a claim that it is.",
            ),
            rule=(
                "The question is about the writer unless it names somebody else. If the "
                "passage reports a view without endorsing it, the writer has not made the "
                "claim."
            ),
        ),
        TypeStrategy(
            qtype="matching_headings",
            label="Matching headings",
            tests="whether you can say what a paragraph is for, as distinct from what it mentions",
            gear="skim",
            answer_order="scattered",
            seconds_per_question=70,
            first_move=(
                "Cover the list. Read the paragraph and say its job in six words. Only then "
                "look for the heading that matches what you said."
            ),
            losses=(
                (
                    "A heading matched to a detail the paragraph merely mentions rather than to "
                    "what the paragraph does."
                ),
                (
                    "One wrong placement forcing a second, because headings cannot be reused — "
                    "the worst marks-lost-per-mistake ratio in the paper."
                ),
            ),
            rule=(
                "Place the paragraphs you are certain of first and leave the doubtful ones "
                "open. Every certain placement removes a heading from the list."
            ),
        ),
        TypeStrategy(
            qtype="matching_information",
            label="Matching information to paragraphs",
            tests="whether you can locate a specific piece of information anywhere in the text",
            gear="search",
            answer_order="scattered",
            seconds_per_question=55,
            first_move=(
                "Do this group last. It is a search task, and it is far cheaper once you "
                "have read the passage for another group."
            ),
            losses=(
                (
                    "Landing in the paragraph where the words appear rather than where the "
                    "information is."
                ),
                (
                    "Stopping at the first plausible paragraph when the same topic returns "
                    "later with the actual answer."
                ),
            ),
            rule=(
                "Paragraphs can be used more than once and some are used not at all. Never "
                "assume one answer per paragraph."
            ),
        ),
        TypeStrategy(
            qtype="matching_features",
            label="Matching features",
            tests="whether you can attribute claims, findings or properties to the right person or thing",
            gear="scan",
            answer_order="scattered",
            seconds_per_question=45,
            first_move=(
                "Find and mark every name in the passage first. The names are the index; "
                "the statements are the queries."
            ),
            losses=(
                (
                    "Attributing a claim to whoever is named nearest to it rather than to whoever "
                    "made it."
                ),
                "Missing that a feature can be used twice, or not at all.",
            ),
            rule="Work from the passage to the statements, not the other way round.",
        ),
        TypeStrategy(
            qtype="matching_sentence_endings",
            label="Matching sentence endings",
            tests="whether you can complete a proposition accurately from the text",
            gear="search",
            answer_order="sequential",
            seconds_per_question=55,
            first_move=(
                "Read the stem and predict the ending before you look at the list. Then "
                "eliminate on grammar — several endings will not fit the stem at all."
            ),
            losses=(
                (
                    "Choosing an ending that is true of the passage but does not complete THIS "
                    "stem."
                ),
                (
                    "Not knowing this is the one matching type that runs in passage order, and "
                    "so searching the whole text for every item."
                ),
            ),
            rule=(
                "This is the matching type with the sequential advantage. Bracket your "
                "search between the answers either side."
            ),
        ),
        TypeStrategy(
            qtype="multiple_choice",
            label="Multiple choice",
            tests="close comprehension of a located passage of two to four sentences",
            gear="close",
            answer_order="sequential",
            seconds_per_question=85,
            first_move=(
                "Answer the stem in your own words before reading the options. Options read "
                "first are four suggestions your memory will start agreeing with."
            ),
            losses=(
                "Choosing an option that is true of the passage but does not answer the stem.",
                "Choosing the option with the most words in common with the text.",
            ),
            rule=(
                "Three of the four are wrong for a reason you can name. If you cannot say why "
                "the others fail, you have not finished the question."
            ),
        ),
        TypeStrategy(
            qtype="multiple_choice_multi",
            label="Multiple choice — choose TWO (or more)",
            tests="the same close comprehension, over a wider span of text",
            gear="close",
            answer_order="sequential",
            seconds_per_question=85,
            first_move="Count. Select exactly as many as the instruction asks for, never more.",
            losses=(
                "Selecting three where two were asked for, which scores zero rather than one.",
                "Both selections drawn from the same sentence when the answers are spread.",
            ),
            rule=(
                "Each correct letter earns its own mark, so a half-right pair is still worth "
                "one. Guess the second letter rather than leaving it."
            ),
        ),
        TypeStrategy(
            qtype="list_selection",
            label="Selecting from a list",
            tests="the same close comprehension over a list of candidate propositions",
            gear="close",
            answer_order="sequential",
            seconds_per_question=85,
            first_move="Work through the list once, marking each entry yes / no / not sure.",
            losses=(
                "Over-selecting.",
                "Treating a plausible entry as supported because the passage does not deny it.",
            ),
            rule="Each entry needs its own evidence. Absence of denial is not support.",
        ),
        TypeStrategy(
            qtype="sentence_completion",
            label="Sentence completion",
            tests="location plus accurate copying, under a word limit",
            gear="search",
            answer_order="sequential",
            seconds_per_question=40,
            first_move=(
                "Read the gapped sentence and predict the word class before you search: a "
                "noun, a plural noun, an -ing form."
            ),
            losses=(
                "Over the word limit. Right content, certain zero, and articles count.",
                (
                    "Paraphrasing instead of copying. The answer is always a contiguous span of "
                    "the passage."
                ),
            ),
            rule=(
                "Copy from the passage, count the words, and read the completed sentence "
                "back. If it does not parse, the answer is wrong."
            ),
        ),
        TypeStrategy(
            qtype="short_answer",
            label="Short answer questions",
            tests="locating a specific fact and copying it inside the limit",
            gear="scan",
            answer_order="sequential",
            seconds_per_question=30,
            first_move="Decide what kind of thing the answer is — a date, a name, a material.",
            losses=(
                "Answering with a whole clause where two words were asked for.",
                "Spelling the copied word wrong.",
            ),
            rule="The cheapest marks in the paper, and the ones most often lost to form.",
        ),
        TypeStrategy(
            qtype="summary_completion",
            label="Summary completion (from the passage)",
            tests="following a compressed restatement of one section of the text",
            gear="search",
            answer_order="section_local",
            seconds_per_question=40,
            first_move=(
                "Read the whole summary first. It tells you which section it covers and "
                "what shape the argument has."
            ),
            losses=(
                "Searching the whole passage instead of the one section the summary covers.",
                "Answers over the word limit.",
            ),
            rule=(
                "Expect the gaps roughly in order, but treat that as a hint. The guaranteed "
                "fact is that they all come from one section."
            ),
        ),
        TypeStrategy(
            qtype="summary_completion_bank",
            label="Summary completion (with a word bank)",
            tests="paraphrase recognition — the bank words are the item writer's synonyms, not the passage's words",
            gear="search",
            answer_order="section_local",
            seconds_per_question=30,
            first_move=(
                "Predict the word class of each gap from the sentence around it, then group "
                "the bank by word class. Half the bank will not fit grammatically."
            ),
            losses=(
                (
                    "Hunting for the bank word in the passage. It is not there — that is the "
                    "point of the type."
                ),
                "Choosing a bank word that fits the meaning but not the grammar of the gap.",
            ),
            rule=(
                "The bank is deliberately larger than the number of gaps and every unused "
                "word was built to tempt a particular gap."
            ),
        ),
        TypeStrategy(
            qtype="note_completion",
            label="Note completion",
            tests="locating detail inside a section and copying it in the right form",
            gear="scan",
            answer_order="section_local",
            seconds_per_question=30,
            first_move="Use the note headings as the map. They mirror the section's own order.",
            losses=(
                "Over the word limit, because notes read as though they want a phrase.",
                "Copying the paraphrase in the note rather than the word in the text.",
            ),
            rule="Notes are already abbreviated. Your answer is a span of the passage, not a summary of it.",
        ),
        TypeStrategy(
            qtype="table_completion",
            label="Table completion",
            tests="reading across a structured comparison and copying accurately",
            gear="scan",
            answer_order="section_local",
            seconds_per_question=30,
            first_move=(
                "Read the column headings. They name the categories the passage organises "
                "the section by."
            ),
            losses=(
                "Taking the answer from the wrong row, because the rows share vocabulary.",
                "Number and unit errors.",
            ),
            rule="Confirm the row before you confirm the word.",
        ),
        TypeStrategy(
            qtype="flow_chart_completion",
            label="Flow chart completion",
            tests="following a process in the order the text describes it",
            gear="search",
            answer_order="section_local",
            seconds_per_question=40,
            first_move="Read the whole chart first so you know how many stages the process has.",
            losses=(
                "Filling a stage from the wrong step, because two steps share vocabulary.",
                "Over the word limit.",
            ),
            rule=(
                "The chart follows the text's own order, so a filled box brackets the search "
                "for the next one."
            ),
        ),
        TypeStrategy(
            qtype="diagram_labelling",
            label="Diagram labelling",
            tests="mapping description onto a picture — the spatial vocabulary is the whole task",
            gear="scan",
            answer_order="section_local",
            seconds_per_question=40,
            first_move=(
                "Orient the diagram against the text first: find the one part the passage "
                "names explicitly and work outwards from it."
            ),
            losses=(
                "Labelling by plausibility rather than by the passage's own words.",
                (
                    "Ignoring the spatial prepositions — above, beneath, between — that fix which "
                    "part is which."
                ),
            ),
            rule="Everything you need is in one section, and the labels are copied, never invented.",
        ),
    )
}


# ======================================================================================
# The gate
# ======================================================================================

#: Every field withheld until the learner has submitted an attempt on this passage.
#: They travel together because each one either *is* the answer or points at it.
GATED_FIELDS: tuple[str, ...] = (
    "questions[].accepted_answers",
    "questions[].evidence_quote",
    "questions[].explanation",
    "questions[].paraphrase_link",
    "questions[].decision_rule",
    "questions[].distractors",
    "questions[].reusable_rule",
    "questions[].traps",
    "questions[].trap_note",
    "questions[].nearest_text",
    "questions[].grammar_cue",
    "trap_profile",
    "skim_plan.map",
    "hinge_words[].why_here",
    "mineable[].blocks_q",
    "paraphrase_links",
)

LOCK_MESSAGE = (
    "Attempt this passage first. In reading the worked solution IS the answer — the "
    "evidence span, the paragraph and the paraphrase link all point straight at it — so "
    "reading it now would not teach you anything and would spend a passage you can only "
    "sit once."
)


@dataclass(frozen=True)
class Attempt:
    """One submitted attempt that covers a passage."""

    attempt_id: str
    submitted_at: str | None
    raw_score: int | None
    total_questions: int | None
    answered: int
    evidence: str  # "passage" · "test" · "drill"


# ======================================================================================
# JSON helpers — never raise, always degrade to the empty structure
# ======================================================================================


#: ``loads`` is imported, not defined here: the same ``*_json`` reader lived byte-identical
#: in all four coach modules, and the list of shapes it tolerates has to be one edit, not
#: four. Re-exported under this module's own name because ``coach.loads(...)`` is how the
#: mock engines and the tests reach it.


def _text(value: Any, limit: int = 600) -> str | None:
    if value is None:
        return None
    out = str(value).strip()
    return out[:limit] if out else None


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in (value or []) if isinstance(item, dict)]


def _strings(value: Any, limit: int = 40) -> list[str]:
    out: list[str] = []
    for item in value or []:
        text = _text(item, 200)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ======================================================================================
# Row and document access
# ======================================================================================


def get_passage(session: Session, passage_id: str) -> m.ReadingPassage:
    row = session.get(m.ReadingPassage, passage_id)
    if row is None or row.retired:
        raise ApiError(404, "not_found", f"no reading passage {passage_id!r}")
    return row


def document(row: Any) -> dict[str, Any]:
    """``passage_json`` as a dict, whatever the column happens to hold."""
    doc = loads(getattr(row, "passage_json", None), {})
    return dict(doc) if isinstance(doc, dict) else {}


def passage_teaching(doc: dict[str, Any]) -> dict[str, Any]:
    teaching = doc.get("teaching")
    return dict(teaching) if isinstance(teaching, dict) else {}


def iter_questions(doc: dict[str, Any]):
    """``(group_index, group, question)`` for every numbered question in a document."""
    for group_index, group in enumerate(doc.get("question_groups") or []):
        if not isinstance(group, dict):
            continue
        for question in group.get("questions") or []:
            if isinstance(question, dict):
                yield group_index, group, question


def paragraphs(doc: dict[str, Any]) -> dict[str, str]:
    """``{paragraph_id: text}`` across every text block on the passage."""
    out: dict[str, str] = {}
    for block in doc.get("texts") or []:
        if not isinstance(block, dict):
            continue
        for para in block.get("paragraphs") or []:
            if isinstance(para, dict) and para.get("id"):
                out[str(para["id"])] = str(para.get("text") or "")
    return out


def strip_teaching(doc: dict[str, Any]) -> dict[str, Any]:
    """Remove every ``teaching`` object at all three depths.

    ``routes/reading.py:_strip_key`` removes the answer key from an exam-mode response
    but not the teaching payload, which post-dates it. The mock builds its exam document
    through here so that no strategy card, no trap slug and no paraphrase link is
    *serialised* during a sitting — not hidden behind a renderer flag, absent, so there
    is nothing to reveal with a devtools toggle.
    """
    out = dict(doc)
    out.pop("teaching", None)
    groups: list[dict[str, Any]] = []
    for group in out.get("question_groups") or []:
        if not isinstance(group, dict):
            continue
        clean_group = {k: v for k, v in group.items() if k != "teaching"}
        clean_group["questions"] = [
            {k: v for k, v in question.items() if k != "teaching"}
            for question in (group.get("questions") or [])
            if isinstance(question, dict)
        ]
        groups.append(clean_group)
    out["question_groups"] = groups
    return out


# ======================================================================================
# Attempt history — what the gate is made of
# ======================================================================================


def _passage_ids_of_test(session: Session, test_id: str) -> list[str]:
    test = session.get(m.ReadingTest, test_id)
    if test is None:
        return []
    return [test.p1_id, test.p2_id, test.p3_id]


def find_attempts(
    session: Session, profile_id: str, passage_id: str, *, limit: int = 10
) -> list[Attempt]:
    """Submitted attempts by this learner that contained this passage, newest first.

    Three shapes count, because all three put the passage in front of the learner:
    a single-passage practice run, a full test one of whose three passages this is, and
    a drill whose items came from it. ``status == 'submitted'`` is load-bearing — an
    attempt still in progress has not been sat yet and must not open the gate mid-test.
    """
    rows = session.execute(
        select(m.ReadingAttempt, m.PracticeSession.started_at)
        .join(m.PracticeSession, m.PracticeSession.id == m.ReadingAttempt.id)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.ReadingAttempt.status == "submitted",
        )
        .order_by(m.ReadingAttempt.submitted_at.desc(), m.ReadingAttempt.id.desc())
    ).all()

    test_cache: dict[str, list[str]] = {}
    out: list[Attempt] = []
    for row, started_at in rows:
        evidence: str | None = None
        if row.passage_id == passage_id:
            evidence = "passage"
        elif row.test_id:
            if row.test_id not in test_cache:
                test_cache[row.test_id] = _passage_ids_of_test(session, row.test_id)
            if passage_id in test_cache[row.test_id]:
                evidence = "test"
        if evidence is None:
            state = loads(row.state_json, {})
            drill = state.get("drill") if isinstance(state, dict) else None
            items = _dicts((drill or {}).get("items")) if isinstance(drill, dict) else []
            if any(item.get("passage_id") == passage_id for item in items):
                evidence = "drill"
        if evidence is None:
            continue
        state = loads(row.state_json, {})
        answered = len((state.get("answers") or {}) if isinstance(state, dict) else {})
        out.append(
            Attempt(
                attempt_id=row.id,
                submitted_at=row.submitted_at or started_at,
                raw_score=row.raw_score,
                total_questions=row.total_questions,
                answered=answered,
                evidence=evidence,
            )
        )
        if len(out) >= limit:
            break
    return out


def gate_state(session: Session, profile_id: str, passage_id: str) -> dict[str, Any]:
    """Whether the worked solutions may be returned for this passage, and why.

    Two things can shut it. A live mock shuts it for **every** passage, including one
    attempted and legitimately unlocked last week — that is the property a mock has no
    value without. Otherwise it opens on a submitted attempt covering this passage and
    on nothing else. There is no ``attested=True`` bypass: reading attempts are persisted
    by their own submit call before it returns, so unlike speaking there is no window in
    which the learner has attempted and the sidecar cannot see it.
    """
    from bandready.reading import mock as mock_mod

    conditions = mock_mod.exam_conditions(session, profile_id)
    if conditions is not None:
        return mock_mod.locked_gate(conditions)

    attempts = find_attempts(session, profile_id, passage_id)
    unlocked = bool(attempts)
    return {
        "unlocked": unlocked,
        "reason": "attempted" if unlocked else "not_attempted",
        "attempts": len(attempts),
        "last_attempt_id": attempts[0].attempt_id if attempts else None,
        "last_submitted_at": attempts[0].submitted_at if attempts else None,
        "last_raw_score": attempts[0].raw_score if attempts else None,
        "evidence": attempts[0].evidence if attempts else None,
        "gated_fields": [] if unlocked else list(GATED_FIELDS),
        "message": None if unlocked else LOCK_MESSAGE,
    }


# ======================================================================================
# Shaping the authored payload
# ======================================================================================


def _trap(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = TRAPS.get(key)
    if entry is None:
        return None
    return {
        "slug": key,
        "label": entry["label"],
        "family": entry["family"],
        "family_label": TRAP_FAMILIES[entry["family"]],
        "what_happened": entry["what_happened"],
        "fix": entry["fix"],
    }


def _traps(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for slug in raw or []:
        entry = _trap(slug)
        if entry is not None and entry not in out:
            out.append(entry)
    return out


def _device(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = DEVICES.get(key)
    if entry is None:
        return None
    return {"slug": key, **entry}


def _paraphrase_link(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    stem = _text(raw.get("stem_phrase"), 300)
    text_phrase = _text(raw.get("text_phrase"), 300)
    if not stem or not text_phrase:
        return None
    devices = [d for d in (_device(s) for s in raw.get("devices") or []) if d]
    return {
        "stem_phrase": stem,
        "text_phrase": text_phrase,
        "devices": devices,
        # Sorting a rewording into preserving vs changing IS most of TFNG, so the split
        # is computed here rather than left for a renderer to infer.
        "meaning_preserving": all(d["preserving"] for d in devices) if devices else None,
        "note": _text(raw.get("note"), 300),
    }


def _distractors(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(raw):
        key = _text(entry.get("key"), 200)
        if not key:
            continue
        diagnosis = str(entry.get("diagnosis") or "").strip()
        out.append(
            {
                "key": key,
                "why_tempting": _text(entry.get("why_tempting"), 300),
                "why_wrong": _text(entry.get("why_wrong"), 300),
                "diagnosis": diagnosis or None,
                "diagnosis_label": DIAGNOSES.get(diagnosis),
            }
        )
    return out


def group_strategy(group: dict[str, Any]) -> dict[str, Any]:
    """The per-group teaching object plus the static per-type page beside it.

    Never gated by the attempt: a strategy card tells the learner *how to attack* the
    type, not what the answer is, and withholding it would withhold the only part of the
    payload that is useful before an attempt. It **is** withheld during a mock, because
    during a mock nothing is preparation.
    """
    qtype = str(group.get("type") or "")
    teaching = group.get("teaching")
    teaching = dict(teaching) if isinstance(teaching, dict) else {}
    static = TYPE_STRATEGY.get(qtype)
    order = str(teaching.get("answer_order") or (static.answer_order if static else "")) or None
    numbers = [
        _int(q.get("number"))
        for q in (group.get("questions") or [])
        if isinstance(q, dict) and _int(q.get("number")) is not None
    ]
    return {
        "group_id": _text(group.get("id"), 60),
        "qtype": qtype,
        "type_page": static.as_dict() if static else None,
        "question_numbers": numbers,
        "question_count": len(numbers),
        "answer_order": order,
        "order_badge": ORDER_BADGES.get(order or "", None),
        "section_scope": _strings(teaching.get("section_scope"), 12) or None,
        "strategy": _text(teaching.get("strategy"), 500),
        "order_note": _text(teaching.get("order_note"), 300),
        "watch_out": _text(teaching.get("watch_out"), 300),
        "time_budget_s": _int(teaching.get("time_budget_s")),
        "bank_analysis": [
            {
                "key": _text(entry.get("key"), 40),
                "designed_to_tempt": _int(entry.get("designed_to_tempt")),
                "why_wrong": _text(entry.get("why_wrong"), 300),
            }
            for entry in _dicts(teaching.get("bank_analysis"))
        ],
        "teaching_available": bool(teaching),
    }


def question_card(
    group: dict[str, Any], question: dict[str, Any], *, unlocked: bool
) -> dict[str, Any]:
    """One question's row in the teaching payload. ``solution`` is the gated half.

    The five parts of the Solution Card come back in the order the review screen renders
    them and in no other: **location → paraphrase link → decision rule → distractor
    autopsy → rule to reuse**. That order is the teaching. Reading the autopsy before the
    location trains option-elimination, which is exactly the habit that loses marks.
    """
    teaching = question.get("teaching")
    teaching = dict(teaching) if isinstance(teaching, dict) else {}
    qtype = str(group.get("type") or "")
    limit = word_limit_of(group.get("word_limit"))

    card: dict[str, Any] = {
        "number": _int(question.get("number")),
        "qtype": qtype,
        "group_id": _text(group.get("id"), 60),
        "prompt": _text(question.get("prompt"), 800),
        # Not gated, and deliberately: the exam player already shows anchor paragraphs
        # during the attempt (routes/reading.py keeps them out of `_SECRET_FIELDS` because
        # the question palette scrolls the passage to them), so hiding them in the coach
        # would be theatre rather than a gate.
        "anchor_paragraphs": _strings(question.get("anchor_paragraphs"), 8),
        "difficulty": _text(question.get("difficulty"), 20),
        "band_target": question.get("band_target"),
        "gear": _text(teaching.get("gear"), 20),
        "gear_note": GEARS.get(str(teaching.get("gear") or ""), None),
        "word_limit": limit,
        "teaching_available": bool(teaching),
        "solution": None,
        "locked": not unlocked,
    }
    if not unlocked:
        return card

    link = _paraphrase_link(teaching.get("paraphrase_link"))
    card["solution"] = {
        # 1. Location
        "accepted_answers": expand_variants(question.get("answers") or []),
        "evidence_quote": _text(question.get("evidence_quote"), 600),
        "anchor_paragraphs": card["anchor_paragraphs"],
        # On a NOT GIVEN item the Location row has nothing to point at, and the reason
        # for the emptiness is the lesson: this is the sentence that tempted you.
        "nearest_text": _text(teaching.get("nearest_text"), 600),
        "explanation": _text(question.get("explanation"), 900),
        # 2. Paraphrase link
        "paraphrase_link": link,
        # 3. Decision rule
        "decision_rule": _text(teaching.get("decision_rule"), 400),
        "grammar_cue": _text(teaching.get("grammar_cue"), 200),
        # 4. Distractor autopsy
        "distractors": _distractors(teaching.get("distractors")),
        # 5. Rule to reuse
        "reusable_rule": _text(teaching.get("reusable_rule"), 300),
        "traps": _traps(teaching.get("traps")),
        "trap_note": _text(question.get("trap_note"), 400),
    }
    return card


def _skim_plan(teaching: dict[str, Any], *, unlocked: bool) -> dict[str, Any] | None:
    raw = teaching.get("skim_plan")
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "paragraph_map")
    plan: dict[str, Any] = {
        "kind": kind,
        "read_first": _text(raw.get("read_first"), 300),
        "skip": _text(raw.get("skip"), 300),
        "budget_s": _int(raw.get("budget_s")),
        "fields": _strings(raw.get("fields"), 10),
        # The authored labels are the worked example, and the comparison against the
        # learner's own labels is the whole teaching — so they arrive only after the
        # attempt, exactly like a solution.
        "map": (
            [
                {
                    "paragraph": _text(entry.get("paragraph"), 10),
                    "label": _text(entry.get("label"), 60),
                }
                for entry in _dicts(raw.get("map"))
            ]
            if unlocked
            else []
        ),
        "map_locked": not unlocked,
        "map_size": len(_dicts(raw.get("map"))),
    }
    return plan


def _paraphrase_families(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("paraphrase_families")):
        concept = _text(entry.get("concept"), 80)
        passage_form = _text(entry.get("passage_form"), 300)
        if not concept or not passage_form:
            continue
        out.append(
            {
                "concept": concept,
                "passage_form": passage_form,
                "paragraph": _text(entry.get("paragraph"), 10),
                "rewordings": _strings(entry.get("rewordings"), 8),
                "cefr": _text(entry.get("cefr"), 8),
            }
        )
    return out


def _hinge_words(teaching: dict[str, Any], *, unlocked: bool) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("hinge_words")):
        word = _text(entry.get("word"), 60)
        if not word:
            continue
        out.append(
            {
                "word": word,
                "kind": _text(entry.get("kind"), 30),
                # `why_here` names the question this word decides, which is a location
                # hint with a verdict attached. It waits for the attempt.
                "why_here": _text(entry.get("why_here"), 200) if unlocked else None,
            }
        )
    return out


def _mineable(teaching: dict[str, Any], *, unlocked: bool) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("mineable")):
        item = _text(entry.get("item"), 80)
        if not item:
            continue
        out.append(
            {
                "item": item,
                "paragraph": _text(entry.get("paragraph"), 10),
                "cefr": _text(entry.get("cefr"), 8),
                "meaning": _text(entry.get("meaning"), 200),
                "blocks_q": _int(entry.get("blocks_q")) if unlocked else None,
            }
        )
    return out


def _difficulty_rationale(teaching: dict[str, Any]) -> dict[str, Any] | None:
    raw = teaching.get("difficulty_rationale")
    if not isinstance(raw, dict):
        return None
    levers = [str(v) for v in raw.get("levers") or [] if str(v) in LEVERS]
    return {
        "levers": [{"slug": slug, "note": LEVERS[slug]} for slug in levers],
        "note": _text(raw.get("note"), 400),
        "hardest_paragraph": _text(raw.get("hardest_paragraph"), 10),
        "why_hardest": _text(raw.get("why_hardest"), 300),
    }


def trap_profile(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Which traps this passage's items are built on, and which questions carry them."""
    counts: dict[str, list[int]] = {}
    for _gi, _group, question in iter_questions(doc):
        teaching = question.get("teaching")
        if not isinstance(teaching, dict):
            continue
        number = _int(question.get("number"))
        for slug in teaching.get("traps") or []:
            key = str(slug)
            if key not in TRAPS:
                continue
            counts.setdefault(key, [])
            if number is not None:
                counts[key].append(number)
    out = []
    for slug, numbers in counts.items():
        entry = _trap(slug)
        if entry is None:  # pragma: no cover — filtered above
            continue
        out.append({**entry, "questions": sorted(numbers), "count": len(numbers)})
    out.sort(key=lambda e: (-e["count"], e["slug"]))
    return out


# ======================================================================================
# The pacing plan (DESIGN §4.2) — a constant per format, the only authored input being
# each passage's `teaching.time_budget_min`.
# ======================================================================================

#: Minutes per passage by format and position. Front-loaded on purpose: every passage
#: carries roughly the same marks at very different cost per mark, and spending equal
#: time on unequal costs leaves the expensive marks underfunded.
PACING: dict[str, tuple[int, int, int]] = {
    "academic": (16, 20, 22),
    "general_training": (15, 18, 25),
}
RESERVE_MIN = 2

NO_TRANSFER_TIME = (
    "60 minutes total. Unlike Listening, Reading gives you no extra time to transfer "
    "answers — the most under-taught operational fact in the paper. Our player writes "
    "your answers straight into the grid, so the risk does not exist here; on the paper "
    "test it does."
)
TWO_MINUTE_RULE = (
    "No single question gets more than two minutes. Enter your best guess, flag it, move "
    "on. A flagged guess is a mark you might get; a blank after four minutes is a mark "
    "you definitely did not get plus three lost minutes."
)
NEVER_BLANK = (
    "Never leave a blank. There is no negative marking, no partial credit and one mark "
    "per question whatever the type. At 58:00, stop answering and sweep the palette."
)


def pacing_for(fmt: str, position: int, authored: int | None = None) -> dict[str, Any]:
    """The minute budget for one passage, preferring the authored figure when present."""
    table = PACING.get(fmt, PACING["academic"])
    index = min(max(int(position or 1), 1), 3) - 1
    benchmark = table[index]
    return {
        "position": index + 1,
        "target_minutes": int(authored or benchmark),
        "benchmark_minutes": benchmark,
        "authored": authored is not None and int(authored) != benchmark,
    }


def pacing_plan(fmt: str) -> dict[str, Any]:
    """The whole 60 minutes as a plan, with the checkpoints the timer bar marks."""
    table = PACING.get(fmt, PACING["academic"])
    labels = (
        ("Section 1", "Section 2", "Section 3")
        if fmt == "general_training"
        else ("Passage 1", "Passage 2", "Passage 3")
    )
    elapsed = 0
    checkpoints: list[dict[str, Any]] = []
    for index, minutes in enumerate(table):
        elapsed += minutes
        if index < 2:
            checkpoints.append(
                {
                    "at_minute": elapsed,
                    "instruction": f"start {labels[index + 1]}",
                }
            )
    return {
        "format": fmt,
        "total_minutes": 60,
        "reserve_minutes": RESERVE_MIN,
        "passages": [
            {"position": i + 1, "label": labels[i], "target_minutes": table[i]}
            for i in range(3)
        ],
        "checkpoints": checkpoints,
        "sweep_at_minute": 58,
        "no_transfer_time": NO_TRANSFER_TIME,
        "two_minute_rule": TWO_MINUTE_RULE,
        "never_blank": NEVER_BLANK,
    }


# ======================================================================================
# The teaching payload — the ONLY assembler of this shape
# ======================================================================================


def passage_header(row: Any, doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "passage_id": row.id,
        "format": row.format,
        "title": row.title,
        "topic": _text(doc.get("topic"), 200),
        "topic_id": row.topic_id,
        "difficulty": _text(doc.get("difficulty"), 20),
        "gt_section": doc.get("gt_section"),
        "position": _int(doc.get("position")),
        "word_count": row.word_count,
        "band_target": row.band_target,
        "schema_version": _int(doc.get("schema_version")) or 1,
    }


def teaching_payload(row: Any, *, unlocked: bool) -> dict[str, Any]:
    """Everything the coach may show for one passage. The only assembler of this shape.

    ``unlocked`` comes from :func:`gate_state` and nowhere else. When it is false the
    worked solutions are **absent** — not truncated, not summarised, absent — while the
    fact that they exist is still advertised through ``solutions_available`` so the UI
    can render a locked card rather than an empty screen.
    """
    doc = document(row)
    teaching = passage_teaching(doc)
    groups = [
        group_strategy(group)
        for group in (doc.get("question_groups") or [])
        if isinstance(group, dict)
    ]
    questions = [
        question_card(group, question, unlocked=unlocked)
        for _gi, group, question in iter_questions(doc)
    ]
    authored_minutes = _int(teaching.get("time_budget_min"))
    position = _int(doc.get("position")) or 1

    return {
        **passage_header(row, doc),
        "teaching_available": bool(teaching)
        or any(g["teaching_available"] for g in groups)
        or any(q["teaching_available"] for q in questions),
        "solutions_available": sum(1 for q in questions if q["teaching_available"]),
        "question_count": len(questions),
        # ---- ungated: preparation material ------------------------------------------
        "pacing": pacing_for(row.format, position, authored_minutes),
        "difficulty_rationale": _difficulty_rationale(teaching),
        "skim_plan": _skim_plan(teaching, unlocked=unlocked),
        "paraphrase_families": _paraphrase_families(teaching),
        "hinge_words": _hinge_words(teaching, unlocked=unlocked),
        "mineable": _mineable(teaching, unlocked=unlocked),
        "metrics": dict(teaching.get("metrics") or {})
        if isinstance(teaching.get("metrics"), dict)
        else None,
        "groups": groups,
        # ---- questions: identity ungated, `solution` gated ---------------------------
        "questions": questions,
        "trap_profile": trap_profile(doc) if unlocked else [],
    }


def locked_teaching_payload(row: Any, conditions: dict[str, Any]) -> dict[str, Any]:
    """The teaching document during a mock: the passage's identity and nothing taught.

    Built here rather than by stripping :func:`teaching_payload` so that no coaching
    field is ever *computed*, let alone serialised. The shape stays key-compatible with
    the open document so the client renders the same screen with dark panels instead of
    crashing on a missing key.
    """
    doc = document(row)
    return {
        **passage_header(row, doc),
        "teaching_available": False,
        "solutions_available": 0,
        "question_count": sum(1 for _ in iter_questions(doc)),
        "pacing": None,
        "difficulty_rationale": None,
        "skim_plan": None,
        "paraphrase_families": [],
        "hinge_words": [],
        "mineable": [],
        "metrics": None,
        "groups": [],
        "questions": [],
        "trap_profile": [],
        "exam_conditions": conditions,
    }


# ======================================================================================
# Strategy across the pack (F3)
# ======================================================================================


def strategy(
    session: Session,
    *,
    qtype: str | None = None,
    fmt: str | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """The static per-type page for every type in the bank, plus every authored group.

    Two surfaces in one response. The **type page** is app copy, written once, and is
    what the type browser renders: what the type tests, the gear it wants, whether its
    answers run in passage order, its two characteristic losses and its per-question time
    budget. The **groups** are the authored attack plans — the same type instantiated for
    a particular passage, which is what the drill and review panes render above a group.
    """
    wanted_type = (qtype or "").strip() or None
    if wanted_type and wanted_type not in TYPE_STRATEGY:
        raise ApiError(
            422,
            "validation_error",
            f"unknown question type {wanted_type!r} — "
            f"one of {', '.join(sorted(TYPE_STRATEGY))}",
        )
    wanted_format = (fmt or "").strip() or None
    if wanted_format and wanted_format not in ("academic", "general_training"):
        raise ApiError(
            422, "validation_error", "format must be academic | general_training"
        )

    stmt = select(m.ReadingPassage).where(m.ReadingPassage.retired == 0)
    if wanted_format:
        stmt = stmt.where(m.ReadingPassage.format == wanted_format)

    by_type: dict[str, list[dict[str, Any]]] = {}
    for row in session.scalars(stmt.order_by(m.ReadingPassage.id)).all():
        doc = document(row)
        for group in doc.get("question_groups") or []:
            if not isinstance(group, dict):
                continue
            group_type = str(group.get("type") or "")
            if wanted_type and group_type != wanted_type:
                continue
            card = group_strategy(group)
            if not card["strategy"]:
                # A group with no authored plan contributes to coverage but has nothing
                # to teach; counted below, not listed.
                by_type.setdefault(group_type, [])
                continue
            by_type.setdefault(group_type, []).append(
                {
                    **card,
                    "passage_id": row.id,
                    "passage_title": row.title,
                    "format": row.format,
                    "band_target": row.band_target,
                }
            )

    types: list[dict[str, Any]] = []
    names = [wanted_type] if wanted_type else sorted(set(by_type) | set(TYPE_STRATEGY))
    for name in names:
        static = TYPE_STRATEGY.get(name)
        groups = by_type.get(name, [])[:limit]
        types.append(
            {
                "qtype": name,
                "page": static.as_dict() if static else None,
                "in_bank": name in by_type,
                "authored_groups": len(groups),
                "questions": sum(g["question_count"] for g in groups),
                "groups": groups,
            }
        )

    return {
        "types": types,
        "count": len(types),
        "format": wanted_format,
        "one_line_rule": ONE_LINE_ORDER_RULE,
        "order_badges": dict(ORDER_BADGES),
        "order_notes": dict(ORDER_NOTES),
        "gears": dict(GEARS),
    }


# ======================================================================================
# The Paraphrase Gym (F5) and constrained mining (F7)
# ======================================================================================

#: F7's cap. A word you did not know and did not need is not worth a card, and a review
#: screen offering thirty of them turns mining into collecting.
MINE_CAP = 5


def paraphrase_payload(row: Any, *, unlocked: bool) -> dict[str, Any]:
    """The paraphrase material for one passage: families, hinges, and the item links.

    The **families** are the passage's own concepts with four to six exam-realistic
    rewordings each, none of which appear in the text; they are preparation material and
    are never gated. The **links** are the per-item stem-phrase ↔ text-phrase pairs, and
    they are gated with the solutions: a link's ``text_phrase`` is an exact substring of
    the anchor paragraph, which is to say it is the answer's address.
    """
    doc = document(row)
    teaching = passage_teaching(doc)
    para_text = paragraphs(doc)

    links: list[dict[str, Any]] = []
    if unlocked:
        for _gi, group, question in iter_questions(doc):
            item_teaching = question.get("teaching")
            if not isinstance(item_teaching, dict):
                continue
            link = _paraphrase_link(item_teaching.get("paraphrase_link"))
            if link is None:
                continue
            anchors = _strings(question.get("anchor_paragraphs"), 8)
            links.append(
                {
                    "number": _int(question.get("number")),
                    "qtype": str(group.get("type") or ""),
                    "paragraph": anchors[0] if anchors else None,
                    "source_sentence": _sentence_containing(
                        para_text, anchors, link["text_phrase"]
                    ),
                    **link,
                }
            )

    families = _paraphrase_families(teaching)
    return {
        **passage_header(row, doc),
        "families": families,
        "hinge_words": _hinge_words(teaching, unlocked=unlocked),
        "mineable": _mineable(teaching, unlocked=unlocked),
        "links": links,
        "links_available": sum(
            1
            for _gi, _g, q in iter_questions(doc)
            if isinstance(q.get("teaching"), dict)
            and isinstance(q["teaching"].get("paraphrase_link"), dict)
        ),
        "locked": not unlocked,
        "devices": {slug: dict(entry) for slug, entry in DEVICES.items()},
        "gym": {
            # What the three Gym formats can be built from without a single new content
            # field. `name_it` is the highest-value one: sorting a rewording into
            # preserving vs changing is, more or less, TFNG.
            "match": len(links) >= 4 or len(families) >= 4,
            "spot": len(links) >= 1 and len(families) >= 3,
            "name_it": sum(1 for link in links if link["devices"]),
            "note": (
                "The Gym is built from fields the item bank already carries: the stem ↔ "
                "text pairs on each question and the passage's paraphrase families."
            ),
        },
    }


def _sentence_containing(
    para_text: dict[str, str], anchors: list[str], phrase: str
) -> str | None:
    """The sentence carrying ``phrase``, hunted only inside this item's anchors."""
    needle = phrase.strip().lower()
    if not needle:
        return None
    for anchor in anchors or list(para_text):
        body = para_text.get(anchor)
        if not body:
            continue
        for sentence in _split_sentences(body):
            if needle in sentence.lower():
                return sentence.strip()
    return None


def _split_sentences(body: str) -> list[str]:
    out: list[str] = []
    current: list[str] = []
    for token in body.replace("\n", " ").split(" "):
        current.append(token)
        if token.endswith((".", "!", "?")) and len(token) > 1:
            out.append(" ".join(current))
            current = []
    if current:
        out.append(" ".join(current))
    return out


def mineable_terms(row: Any) -> list[dict[str, Any]]:
    """Every mineable entry with its ``blocks_q``, regardless of the gate.

    Used by the push route, which needs the question link to apply F7's constraint; the
    constraint itself is what makes mining teach, so it cannot be dropped when the caller
    happens to be locked. Nothing from here is ever returned to a client directly.
    """
    doc = document(row)
    return _mineable(passage_teaching(doc), unlocked=True)


def unknown_terms(items: list[dict[str, Any]], wanted: list[str]) -> list[str]:
    known = {str(item["item"]).strip().lower() for item in items}
    return [w for w in wanted if str(w).strip().lower() not in known]


def suggestion_payloads(
    row: Any,
    *,
    wanted: list[str] | None = None,
    missed_numbers: set[int] | None = None,
    cap: int = MINE_CAP,
) -> list[dict[str, Any]]:
    """Map ``mineable`` onto the vocab ingest shape (``IngestItem`` kwargs).

    Two constraints from F7 are applied here and nowhere else, because they are what
    stops mining from becoming collecting:

    1. When the caller supplies the questions the learner actually got wrong, only items
       whose ``blocks_q`` names one of them are offered — a word you did not know and did
       not need is not worth a card.
    2. At most :data:`MINE_CAP` items per passage.

    The card produced is a **paraphrase pair** wherever the item's question carries a
    link — text phrase, stem phrase and the source sentence — rather than a bare
    headword, because the pair is the thing that will be tested again.

    Deliberately returns plain dicts: the HTTP-layer reuse of
    ``POST /api/v1/vocab/suggestions`` belongs to the route module, and this package
    stays out of the ingest pipeline entirely.
    """
    doc = document(row)
    para_text = paragraphs(doc)
    links: dict[int, dict[str, Any]] = {}
    for _gi, _group, question in iter_questions(doc):
        item_teaching = question.get("teaching")
        number = _int(question.get("number"))
        if not isinstance(item_teaching, dict) or number is None:
            continue
        link = _paraphrase_link(item_teaching.get("paraphrase_link"))
        if link is not None:
            links[number] = link

    selected = {w.strip().lower() for w in (wanted or []) if str(w).strip()}
    tag = _topic_tag(row.topic_id)
    out: list[dict[str, Any]] = []
    for entry in mineable_terms(row):
        term = entry["item"]
        if selected and term.strip().lower() not in selected:
            continue
        blocks_q = entry.get("blocks_q")
        if missed_numbers is not None and (
            blocks_q is None or int(blocks_q) not in missed_numbers
        ):
            continue
        paragraph = entry.get("paragraph")
        sentence = _sentence_containing(para_text, [paragraph] if paragraph else [], term)
        link = links.get(int(blocks_q)) if blocks_q is not None else None
        detail = f"passage {row.id}"
        if paragraph:
            detail += f" · paragraph {paragraph}"
        if blocks_q is not None:
            detail += f" · blocks Q{blocks_q}"
        out.append(
            {
                "term": term,
                "is_phrase": " " in term,
                "definition": entry.get("meaning"),
                "cefr_level": entry.get("cefr"),
                "sentence_context": sentence,
                "example_sentences": [sentence] if sentence else [],
                # The pair, not a bare headword: what will be tested again is the
                # recognition that these two phrases are the same proposition.
                "collocations": (
                    [link["text_phrase"], link["stem_phrase"]] if link else []
                ),
                "topic_tags": [tag] if tag else [],
                "source": {"kind": "reading", "item_id": row.id, "detail": detail},
            }
        )
        if len(out) >= cap:
            break
    return out


def _topic_tag(topic_id: str | None) -> str | None:
    value = (topic_id or "").strip().lower()
    if not value:
        return None
    return value.removeprefix("topic_")


# ======================================================================================
# "Why was I wrong?" — grounded in this item's own autopsy first
# ======================================================================================

WHY_WRONG_SYSTEM = """You are an IELTS-style reading tutor. A learner answered one question
wrongly and the authored explanation for it is missing, so you are writing the
replacement. Rules:

1. Ground everything in the passage excerpt you are given. Quote at most 15 words from it.
   Never invent text that is not in the excerpt.
2. Name the trap using EXACTLY ONE slug from this closed list, and nothing else:
{trap_slugs}
3. Say what the learner's own answer would have required the text to say, and show that it
   does not say it.
4. Finish with one rule the learner can carry to a different passage. It must not mention
   this passage's subject matter.
5. Address the learner as "you". Do not restate the question. 120 words maximum.

Return JSON: {{"explanation": "...", "trap": "<slug>", "rule": "...", "tip": "..."}}"""

WHY_WRONG_USER = """Question type: {qtype}
Question: {prompt}
Correct answer: {answer}
Your answer: {given}
Passage excerpt (paragraphs {anchors}):
\"\"\"{anchor_texts}\"\"\"
Authored explanation, if any: {explanation}"""


def _canonical(value: str, qtype: str) -> str:
    """Fold one answer the way the marker would, so it can be matched to a distractor."""
    text = str(value or "").strip()
    if not text:
        return ""
    if qtype in CHOICE_TYPES:
        return canonical_choice(text, qtype)
    if qtype in LETTER_TYPES or qtype in MULTI_TYPES:
        return "".join(normalize_letters(text)).lower()
    return normalize_answer(text)


def match_distractor(
    distractors: list[dict[str, Any]], given: str, qtype: str
) -> dict[str, Any] | None:
    """The autopsy entry for the option the learner actually chose, if it was authored.

    Matched through the shared normalizer rather than by string equality, because a
    learner who typed ``NG`` and a key of ``not given`` are the same choice, and a
    distractor keyed ``iii`` must match an answer of ``III``.
    """
    target = _canonical(given, qtype)
    if not target:
        return None
    for entry in distractors:
        if _canonical(str(entry.get("key") or ""), qtype) == target:
            return entry
    return None


def form_traps(given: str, qtype: str, word_limit: Any, accepted: Any) -> list[str]:
    """Family-F slugs derivable from the answer itself, without any authored field.

    These are counted separately everywhere because they are not comprehension failures:
    a blank needs a pacing fix and an over-length answer needs an answer-form fix, and
    coaching either of them as a reading problem wastes the learner's time.
    """
    out: list[str] = []
    text = str(given or "").strip()
    if not text:
        out.append("ran_out_of_time")
        return out
    if qtype in TEXT_TYPES and word_limit and not within_word_limit(text, word_limit):
        out.append("over_limit")
    if qtype in LETTER_TYPES | MULTI_TYPES and not normalize_letters(text):
        # A word typed where a letter was asked for.
        out.append("wrong_option_form")
    from bandready.scoring.answers import near_miss

    if qtype in TEXT_TYPES and accepted and near_miss(text, accepted):
        out.append("spelling")
    return out


def why_wrong_card(
    *,
    number: int,
    qtype: str,
    prompt: str,
    given: str,
    accepted: list[str],
    evidence_quote: str | None,
    explanation: str | None,
    anchors: list[str],
    teaching: dict[str, Any],
    word_limit: Any = None,
) -> dict[str, Any] | None:
    """The authored answer to "why was I wrong", or ``None`` when nothing was authored.

    Preferred over the model every time it exists, and not as an optimisation: the
    authored autopsy names why *that* option was tempting to a real candidate, which a
    model asked to invent a whole solution cannot know and will occasionally hallucinate
    the evidence for.
    """
    if not isinstance(teaching, dict) or not teaching:
        return None
    distractors = _distractors(teaching.get("distractors"))
    decision_rule = _text(teaching.get("decision_rule"), 400)
    if not distractors and not decision_rule:
        return None

    chosen = match_distractor(distractors, given, qtype)
    authored_traps = _traps(teaching.get("traps"))
    derived = [
        t for t in (_trap(slug) for slug in form_traps(given, qtype, word_limit, accepted)) if t
    ]
    # The learner's own answer decides which trap leads: an over-limit answer is a form
    # loss even on an item whose authored trap is a scope shift, and telling them to read
    # more carefully would be the wrong lesson.
    lead = derived[0] if derived else (authored_traps[0] if authored_traps else None)

    link = _paraphrase_link(teaching.get("paraphrase_link"))
    return {
        "number": number,
        "qtype": qtype,
        "source": "authored",
        "given": given,
        "accepted_answers": accepted,
        "what_the_text_says": explanation,
        "evidence": {"quote": evidence_quote, "paragraphs": anchors},
        "nearest_text": _text(teaching.get("nearest_text"), 600),
        "paraphrase_link": link,
        "decision_rule": decision_rule,
        "grammar_cue": _text(teaching.get("grammar_cue"), 200),
        "your_option": chosen,
        "other_distractors": [d for d in distractors if d is not chosen],
        "trap": lead,
        "traps": authored_traps,
        "form_traps": derived,
        "rule": _text(teaching.get("reusable_rule"), 300),
        "next_action": lead["fix"] if lead else None,
    }


def why_wrong_prompt(
    *,
    qtype: str,
    prompt: str,
    given: str,
    accepted: list[str],
    anchors: list[str],
    anchor_texts: list[dict[str, str]],
    explanation: str | None,
) -> list[dict[str, str]]:
    """The messages for the fallback call, with the trap vocabulary closed by hand."""
    slugs = "\n".join(
        f"  - {slug}: {entry['label']}"
        for slug, entry in TRAPS.items()
        if entry["family"] in ("J", "P", "L")
    )
    return [
        {"role": "system", "content": WHY_WRONG_SYSTEM.format(trap_slugs=slugs)},
        {
            "role": "user",
            "content": WHY_WRONG_USER.format(
                qtype=qtype,
                prompt=prompt,
                answer=", ".join(accepted) or "—",
                given=given or "(no answer)",
                anchors=", ".join(anchors) or "—",
                anchor_texts="\n\n".join(
                    f"[{a['id']}] {a['text']}" for a in anchor_texts
                )
                or "(no excerpt available)",
                explanation=explanation or "—",
            ),
        },
    ]


def parse_why_wrong(
    analysis: dict[str, Any], *, number: int, qtype: str, given: str, accepted: list[str]
) -> dict[str, Any]:
    """Fold a model response into the same card shape the authored path returns.

    The trap is coerced back onto the closed taxonomy: a model that answers
    "scope/quantifier shift" instead of ``scope_shift`` must not create a 27th slug,
    because the slug is simultaneously a drill filter and a progress axis.
    """
    raw_trap = str(analysis.get("trap") or "").strip()
    trap = _trap(raw_trap) or _trap(_coerce_trap(raw_trap))
    return {
        "number": number,
        "qtype": qtype,
        "source": "model",
        "given": given,
        "accepted_answers": accepted,
        "what_the_text_says": _text(
            analysis.get("explanation") or analysis.get("text"), 900
        ),
        "evidence": None,
        "nearest_text": None,
        "paraphrase_link": None,
        "decision_rule": None,
        "grammar_cue": None,
        "your_option": None,
        "other_distractors": [],
        "trap": trap,
        "traps": [trap] if trap else [],
        "form_traps": [],
        "rule": _text(analysis.get("rule") or analysis.get("tip"), 300),
        "next_action": trap["fix"] if trap else _text(analysis.get("tip"), 300),
        "model": (analysis.get("_meta") or {}).get("model_id"),
    }


def question_teaching(session: Session, passage_id: str, number: int) -> dict[str, Any]:
    """The authored ``teaching`` object for one numbered question, or ``{}``.

    ``reading_questions`` is a flattened projection that predates the teaching payload
    and carries no column for it, so the authored material is read from
    ``passage_json`` — which is the source of truth in any case.
    """
    row = session.get(m.ReadingPassage, passage_id)
    if row is None:
        return {}
    for _gi, _group, question in iter_questions(document(row)):
        if _int(question.get("number")) == int(number):
            teaching = question.get("teaching")
            return dict(teaching) if isinstance(teaching, dict) else {}
    return {}


async def explain_wrong(session: Session, attempt_id: str, number: int) -> dict[str, Any]:
    """Why *this* answer was wrong on *this* question, from the item's own autopsy.

    The authored payload is preferred over the model every time it exists, and the
    ordering is a design ruling rather than a cost saving (DESIGN §10, "explicitly not
    built"): an LLM asked to invent the whole solution will occasionally invent the
    evidence with it, whereas ``distractors[].why_tempting`` records a real candidate
    process that no model can reconstruct from the passage. The model is the second
    layer, for the passages authored before the teaching pass.
    """
    from bandready.providers.llm import chat_json
    from bandready.reading import mock as mock_mod
    from bandready.server.deps import current_profile_id
    from bandready.server.routes.reading import (
        _anchor_texts,
        _attempt_row,
        _attempt_state,
        _passage_doc,
        _passage_row,
        _scorables,
    )

    conditions = mock_mod.exam_conditions(session, current_profile_id(session))
    if conditions is not None:
        raise mock_mod.refusal(conditions)

    row = _attempt_row(session, attempt_id)
    if row.status != "submitted":
        raise ApiError(409, "conflict", "ask this after submitting the attempt")
    state = _attempt_state(row)
    item = {s.key: s for s in _scorables(session, row, state)}.get(str(number))
    if item is None:
        raise ApiError(404, "not_found", f"question {number} is not in this attempt")

    marked = next(
        (
            q
            for q in ((state.get("score") or {}).get("per_question") or [])
            if int(q.get("number") or 0) == int(number)
        ),
        None,
    )
    if marked is not None and marked.get("correct"):
        raise ApiError(422, "validation_error", "that answer was correct")

    given = str((state.get("answers") or {}).get(item.key) or "")
    accepted = expand_variants(item.answers)
    anchors = [str(a) for a in item.anchor_paragraphs or []]
    teaching = question_teaching(session, item.passage_id, int(number))

    card = why_wrong_card(
        number=int(number),
        qtype=item.qtype,
        prompt=item.prompt,
        given=given,
        accepted=accepted,
        evidence_quote=item.evidence_quote,
        explanation=item.explanation,
        anchors=anchors,
        teaching=teaching,
        word_limit=item.word_limit,
    )
    if card is not None:
        return {**card, "cached": False, "passage_id": item.passage_id}

    doc = _passage_doc(_passage_row(session, item.passage_id))
    stored = session.scalars(
        select(m.ReadingAnswer).where(
            m.ReadingAnswer.attempt_id == attempt_id,
            m.ReadingAnswer.question_id == item.question_id,
        )
    ).first()
    if stored is not None and stored.trap_analysis_json:
        cached = loads(stored.trap_analysis_json, {})
        if isinstance(cached, dict) and cached.get("source") == "model":
            return {**cached, "cached": True, "passage_id": item.passage_id}

    analysis = await chat_json(
        why_wrong_prompt(
            qtype=item.qtype,
            prompt=item.prompt,
            given=given,
            accepted=accepted,
            anchors=anchors,
            anchor_texts=_anchor_texts(doc, anchors),
            explanation=item.explanation,
        ),
        mock_kind="why_wrong",
        temperature=0.2,
    )
    result = parse_why_wrong(
        analysis, number=int(number), qtype=item.qtype, given=given, accepted=accepted
    )
    if stored is not None:
        stored.trap_analysis_json = json.dumps(result, ensure_ascii=False)
        session.flush()
    return {**result, "cached": False, "passage_id": item.passage_id}


def _coerce_trap(raw: str) -> str:
    """Best-effort mapping of free text onto a slug. Returns ``""`` when unsure."""
    text = raw.lower().replace("-", " ").replace("_", " ").strip()
    if not text:
        return ""
    hints: tuple[tuple[str, str], ...] = (
        ("scope", "scope_shift"),
        ("quantifier", "scope_shift"),
        ("hedge", "hedge_stripped"),
        ("modal", "hedge_stripped"),
        ("keyword", "lexical_lure"),
        ("word match", "lexical_lure"),
        ("outside", "outside_knowledge"),
        ("attribution", "attribution_shift"),
        ("whose", "attribution_shift"),
        ("causal", "causal_link_assumed"),
        ("causation", "causal_link_assumed"),
        ("comparison", "comparison_invented"),
        ("inference", "plausible_inference"),
        ("negation", "negation_missed"),
        ("time", "time_shift"),
        ("partial", "partial_condition"),
        ("detail", "detail_for_main_idea"),
        ("absence", "absence_read_as_contradiction"),
        ("contradiction read", "contradiction_read_as_absence"),
    )
    for needle, slug in hints:
        if needle in text:
            return slug
    return ""


__all__ = [
    "DEVICES",
    "DIAGNOSES",
    "GATED_FIELDS",
    "GEARS",
    "LEVERS",
    "LOCK_MESSAGE",
    "MINE_CAP",
    "NEVER_BLANK",
    "NO_TRANSFER_TIME",
    "ORDER_BADGES",
    "PACING",
    "TRAPS",
    "TRAP_FAMILIES",
    "TWO_MINUTE_RULE",
    "TYPE_STRATEGY",
    "Attempt",
    "document",
    "explain_wrong",
    "find_attempts",
    "form_traps",
    "gate_state",
    "get_passage",
    "group_strategy",
    "iter_questions",
    "loads",
    "locked_teaching_payload",
    "match_distractor",
    "mineable_terms",
    "pacing_for",
    "pacing_plan",
    "paragraphs",
    "paraphrase_payload",
    "parse_why_wrong",
    "passage_teaching",
    "question_card",
    "question_teaching",
    "strategy",
    "strip_teaching",
    "suggestion_payloads",
    "teaching_payload",
    "trap_profile",
    "unknown_terms",
    "why_wrong_card",
    "why_wrong_prompt",
]
