"""Sentence selection, and the context-driven exercise kinds built on top of it.

The owner's ask for this module was that words are memorised **through real sentences**,
not word lists. That is two jobs, and this file is both of them:

1. **Which sentence carries the item at this review** (`select_sentence`). The rule is the
   grammar DESIGN §1.5 ladder, and the preference order it resolves is written down once,
   in :data:`SENTENCE_SOURCE_ORDER`, so it can be read rather than inferred.
2. **Four exercise kinds that only exist because a sentence was chosen** — `forced_choice`,
   `transform`, `error_fix` and `produce`. The six kinds in :mod:`bandready.srs.exercises`
   are a recognition-and-recall core; these four are the productive half, and each of them
   is meaningless without a context to sit in.

Why provenance is ranked the way it is (GV-R3 §1.2, and it is the whole argument):

* **A definition teaches one thing; a context teaches five.** A learner who knows
  `biodegradable = decays naturally` still does not know it is an adjective that sits
  before `packaging` and never before `person`. Only a sentence carries that.
* **Context supplies the retrieval cues the exam will supply.** In a Task 2 essay nobody
  hands you the definition — the cue is a *situation*. Practice has to run
  situation → word, because that is the direction the exam runs.
* **The learner's own sentence beats an authored one** because it is already tied to their
  own episodic memory of writing or saying it, and to a topic they actually care about.
  An authored sentence has to build that association from cold.

**Rotation outranks provenance, and that distinction is load-bearing.** If provenance were
the outright winner, the learner's own sentence would be shown at every single review and
we would be back to memorising one sentence instead of learning a word (§1.5 rule 1). So:
*rotation decides which candidates are allowed at this review; provenance decides which of
the allowed ones wins.* :func:`select_sentence` implements exactly that, in that order.

Nothing here writes to the database. :func:`pack_payload` reads one indexed row (§3.3) and
everything else is a pure function over a serialized entry, so the same code renders a
preview, a queue item and a test fixture.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import re
from dataclasses import dataclass, field
from typing import Any

from bandready.srs import exercises as ex

_log = logging.getLogger("bandready.srs.context")

__all__ = [
    "CONTEXT_EXERCISE_TYPES",
    "MIN_CORRECTION_REVEAL_MS",
    "NEVER_CHECKED",
    "PRODUCTION_PROMPT",
    "SENTENCE_SOURCE_ORDER",
    "SHORT_CONTEXT_WORDS",
    "STAGE_LATENCY_MS",
    "Sentence",
    "appeal_production",
    "build",
    "can_build",
    "check_production",
    "cloze_payload",
    "detect_target",
    "grade",
    "levenshtein",
    "merge_pack_payload",
    "pack_payload",
    "same_inflection_class",
    "select_sentence",
    "sentence_candidates",
    "strict_close",
]


# ======================================================================================
# 1. Sentence selection
# ======================================================================================

#: Provenance tiers, best first. The index into this tuple *is* the preference rank, and
#: it is the only place the order is expressed — everything else looks it up.
#:
#: ``learner_own``      the learner's own context sentence (``own_context_origin='learner'``)
#: ``learner_attempt``  a sentence they met the item in during a real speaking/writing/
#:                      reading/listening attempt, harvested by :mod:`bandready.srs.bridge`
#: ``authored_context`` an authored ``contexts[]`` entry from the pack (entry_json v2 §3.2)
#: ``authored_seed``    the pack's single ``own_context_sentence`` (v1 entries have only this)
#: ``authored_example`` an ``example_sentences[]`` line
#: ``generated``        supplied by the caller from a model. Last resort, always.
SENTENCE_SOURCE_ORDER: tuple[str, ...] = (
    "learner_own",
    "learner_attempt",
    "authored_context",
    "authored_seed",
    "authored_example",
    "generated",
)

#: §1.5 rule 6 — at S1–S2 keep the context short so the load stays on form.
SHORT_CONTEXT_WORDS = 14

#: §1.6 latency thresholds, in ``elapsed_ms``. Starting values, invented, to be
#: recalibrated from our own logs — which is why they are a constant and not a literal.
STAGE_LATENCY_MS: dict[int, int | None] = {0: None, 1: 6_000, 2: 15_000, 3: 20_000, 4: None, 5: None}

#: GV-R4 §4.4 — a correction must stay on screen at least as long as the broken form did.
MIN_CORRECTION_REVEAL_MS = 4_000

_WS_RE = re.compile(r"\s+")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])[\s ]+(?=[\"'(\[]?[A-Z0-9])")


def _rank_of(source: str) -> int:
    try:
        return SENTENCE_SOURCE_ORDER.index(source)
    except ValueError:
        return len(SENTENCE_SOURCE_ORDER)


def _clean(text: Any) -> str:
    return _WS_RE.sub(" ", str(text or "").replace("’", "'")).strip()


def _digest(text: str) -> str:
    return hashlib.sha1(text.lower().encode("utf-8")).hexdigest()[:8]


@dataclass(frozen=True)
class Sentence:
    """One candidate context, with everything a builder or a UI needs to use it."""

    id: str
    text: str
    source: str
    rank: int = field(default=0)
    register: str | None = None
    topic_id: str | None = None
    skill_hook: str | None = None
    gap_span: str | None = None
    unique_answer: bool = False
    note: str | None = None
    provenance: str | None = None  # learner-facing, e.g. "from your Writing feedback"

    @property
    def words(self) -> int:
        return len(self.text.split())

    @property
    def is_learner_own(self) -> bool:
        return self.source in ("learner_own", "learner_attempt")

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "source": self.source,
            "register": self.register,
            "topic_id": self.topic_id,
            "skill_hook": self.skill_hook,
            "words": self.words,
            "provenance": self.provenance,
            "note": self.note,
        }


_PROVENANCE = {
    "speaking": "from your Speaking practice",
    "writing": "from your Writing feedback",
    "reading": "from your Reading session",
    "listening": "from your Listening practice",
    "pronunciation": "from your Pronunciation report",
    "manual": "you added this one",
}


def _learner_provenance(entry: dict[str, Any]) -> str | None:
    module = str((entry.get("source") or {}).get("module") or "")
    return _PROVENANCE.get(module)


def sentence_candidates(
    entry: dict[str, Any],
    *,
    extra_sentences: tuple[dict[str, Any], ...] | list[dict[str, Any]] = (),
    allow_generated: bool = True,
) -> list[Sentence]:
    """Every sentence that could carry this item, ordered by :data:`SENTENCE_SOURCE_ORDER`.

    ``extra_sentences`` are caller-supplied: ``{"text", "source", "id"?, "register"?,
    "topic_id"?, "provenance"?}``. ``bridge.attach_learner_context()`` fills them with
    sentences from real attempts; a route that has just generated one passes it here with
    ``source="generated"``. **No model is called from this module** — generating a sentence
    is an I/O decision and it does not belong inside a selector.
    """
    out: list[Sentence] = []
    seen_text: set[str] = set()

    def add(sentence: Sentence) -> None:
        key = sentence.text.lower()
        if not sentence.text or key in seen_text:
            return
        seen_text.add(key)
        out.append(sentence)

    own = _clean(entry.get("own_context_sentence"))
    own_is_learner = str(entry.get("own_context_origin") or "") == "learner"
    if own and own_is_learner:
        add(
            Sentence(
                id="own",
                text=own,
                source="learner_own",
                rank=_rank_of("learner_own"),
                provenance=_learner_provenance(entry) or "your own sentence",
            )
        )

    # `bridge.attach_learner_context()` parks its findings on the entry, so a caller that
    # decorated the entry does not also have to remember to forward them here.
    supplied = [*(entry.get("attempt_sentences") or []), *(extra_sentences or ())]
    for extra in supplied:
        text = _clean((extra or {}).get("text"))
        source = str((extra or {}).get("source") or "learner_attempt")
        if source == "generated" and not allow_generated:
            continue
        if not text or source not in SENTENCE_SOURCE_ORDER:
            continue
        add(
            Sentence(
                id=str(extra.get("id") or f"{source}:{_digest(text)}"),
                text=text,
                source=source,
                rank=_rank_of(source),
                register=extra.get("register"),
                topic_id=extra.get("topic_id"),
                skill_hook=extra.get("skill_hook"),
                gap_span=extra.get("gap_span"),
                provenance=extra.get("provenance"),
                note=extra.get("note"),
            )
        )

    # Everything the pack authored, so an example the pack does *not* contain can be
    # recognised as one the learner met. Only populated by `merge_pack_payload()` — with no
    # pack to compare against we call an example authored, which is the safe direction:
    # promoting our own prose to "your sentence" would be a lie the UI then repeats.
    authored_texts = {
        _clean(t).lower() for t in (entry.get("_pack_sentences") or []) if _clean(t)
    }
    for index, raw in enumerate(entry.get("contexts") or []):
        if not isinstance(raw, dict):
            continue
        text = _clean(raw.get("text"))
        if not text:
            continue
        add(
            Sentence(
                id=f"ctx:{raw.get('id') or index}",
                text=text,
                source="authored_context",
                rank=_rank_of("authored_context"),
                register=(str(raw.get("register")) if raw.get("register") else None),
                topic_id=(str(raw.get("topic_id")) if raw.get("topic_id") else None),
                skill_hook=(str(raw.get("skill_hook")) if raw.get("skill_hook") else None),
                gap_span=(_clean(raw.get("gap_span")) or None),
                unique_answer=bool(raw.get("unique_answer")),
                note=(_clean(raw.get("note")) or None),
            )
        )

    if own and not own_is_learner:
        add(
            Sentence(
                id="seed",
                text=own,
                source="authored_seed",
                rank=_rank_of("authored_seed"),
                register=(str(entry.get("register")) if entry.get("register") else None),
                topic_id=(str(entry.get("topic_id")) if entry.get("topic_id") else None),
            )
        )

    for index, raw in enumerate(entry.get("example_sentences") or []):
        text = _clean(raw)
        if not text:
            continue
        # An example the authored pack does not contain arrived through `ingest_item()`
        # from a real attempt — the merge rules append an unseen sentence_context here
        # (vocab routes §3.3). That makes it the learner's own encounter, not our prose.
        met_in_the_wild = bool(authored_texts) and text.lower() not in authored_texts
        source = "learner_attempt" if met_in_the_wild else "authored_example"
        add(
            Sentence(
                id=f"ex:{index}",
                text=text,
                source=source,
                rank=_rank_of(source),
                provenance=_learner_provenance(entry) if met_in_the_wild else None,
            )
        )

    out.sort(key=lambda s: (s.rank, s.id))
    return out


def select_sentence(
    entry: dict[str, Any],
    *,
    stage: int = 2,
    seen_ids: tuple[str, ...] | list[str] = (),
    last_shown_id: str | None = None,
    register_bias: str | None = None,
    topic_bias: tuple[str, ...] | list[str] = (),
    extra_sentences: tuple[dict[str, Any], ...] | list[dict[str, Any]] = (),
    allow_generated: bool = True,
) -> Sentence | None:
    """The sentence this review should use, per DESIGN §1.5. ``None`` when there is none.

    ``seen_ids`` is the rotation log for this card, **oldest first** — the caller keeps it
    (``seen_items_json``) and this function never mutates it.

    The sort key, in order, is the rule list itself:

    ==  ===================================  ==============================================
    #   Key                                  Rule
    ==  ===================================  ==============================================
    0   unseen first, then least-recent      §1.5 r1+r2 — exhaust the bank before repeating
    1   provenance rank                      GV-R3 §1.2 — the learner's own sentence first
    2   register match                       §1.5 r3 — bias to the skill they have been using
    3   topic match                          §1.5 r4 — the two modules stop feeling separate
    4   short context at S1–S2               §1.5 r6 — form focus early, semantic load late
    5   id                                   determinism; the same inputs pick the same one
    ==  ===================================  ==============================================

    Key 0 sitting above key 1 is deliberate and is the difference between *learning a word*
    and *memorising one sentence*: the learner's own sentence wins the first presentation
    and every tie, but it does not win twice in a row while an unseen context exists.
    """
    pool = sentence_candidates(
        entry, extra_sentences=extra_sentences, allow_generated=allow_generated
    )
    if not pool:
        return None

    log = [str(s) for s in seen_ids]
    last = last_shown_id if last_shown_id is not None else (log[-1] if log else None)

    # Rule 1 — never the same context at consecutive presentations, unless it is all we have.
    allowed = [s for s in pool if s.id != last] or list(pool)

    recency = {sid: index for index, sid in enumerate(log)}
    wanted_register = (register_bias or "").strip().lower() or None
    wanted_topics = {str(t) for t in topic_bias if t}
    short_stage = int(stage) <= 2

    def key(s: Sentence) -> tuple[Any, ...]:
        # A candidate that declares no register is neither rewarded nor punished: it sits
        # with the misses, so a declared match still wins and nothing else is penalised.
        matched_register = (
            wanted_register is not None
            and s.register is not None
            and s.register in (wanted_register, "both")
        )
        register_miss = 0 if matched_register else 1
        topic_miss = 0 if (wanted_topics and s.topic_id in wanted_topics) else 1
        length_miss = 1 if (short_stage and s.words > SHORT_CONTEXT_WORDS) else 0
        return (recency.get(s.id, -1), s.rank, register_miss, topic_miss, length_miss, s.id)

    return min(allowed, key=key)


def cloze_payload(sentence: Sentence, entry: dict[str, Any]) -> dict[str, Any]:
    """Blank the target in a chosen sentence — ``gap_span`` first, the matcher second.

    §3.4: authored ``gap_span`` is exact, so it fixes the case the regex matcher cannot
    handle — a chunk that appears in anything other than its citation form.
    """
    text = sentence.text
    span = (sentence.gap_span or "").strip()
    if span:
        index = text.lower().find(span.lower())
        if index >= 0:
            actual = text[index : index + len(span)]
            masked = text[:index] + "_" * max(4, len(actual)) + text[index + len(actual) :]
            return {"masked": masked, "answers": [actual], "blanks": 1}
    return ex.cloze_from_sentence(text, entry.get("headword") or "", entry.get("lemma"))


# ======================================================================================
# 2. entry_json v2 — reaching the runtime without a migration (§3.3)
# ======================================================================================

_PACK_SQL = (
    "SELECT p.entry_json FROM vocab_sources s "
    "JOIN vocab_pack_entries p ON p.id = s.session_id "
    "WHERE s.entry_id = :e AND s.module = 'seed' AND p.retired = 0 "
    "ORDER BY s.created_at LIMIT 1"
)

#: The v2 keys a serialized entry does not already carry (§3.2).
PACK_ONLY_FIELDS: tuple[str, ...] = (
    "schema_version",
    "unit_type",
    "register",
    "frequency_band",
    "syllables",
    "word_family",
    "chunk",
    "contexts",
    "confusables",
    "grammar_links",
    "avoid",
    "audio_hint",
    "topic_id",
)


def pack_payload(session: Any, entry_id: str) -> dict[str, Any]:
    """The authored v2 blob behind a seeded entry, or ``{}`` for a learner-added one.

    One indexed lookup over the join that already exists (``ix_vocab_sources_entry``), no
    migration, and correct across pack upgrades because the loader upserts
    ``vocab_pack_entries`` by authored id. A learner-added entry returning ``{}`` and
    degrading to v1 behaviour is the right outcome — nobody authored contexts for a word
    somebody typed in last Tuesday.

    Read-only, and it does **not** flush: sessions are created with ``autoflush=False``
    project-wide, so a caller that has just ingested rows in the same transaction must
    flush first — exactly as the vocab routes already do after ``ingest_item()``.
    """
    from sqlalchemy import text as sql_text

    try:
        row = session.execute(sql_text(_PACK_SQL), {"e": entry_id}).first()
    except Exception as exc:  # noqa: BLE001 — a missing pack must never break a review
        _log.debug("pack payload lookup failed for %s: %s", entry_id, exc)
        return {}
    if not row or not row[0]:
        return {}
    try:
        payload = json.loads(row[0])
    except (TypeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def merge_pack_payload(entry: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Fold the authored v2 fields under a serialized entry, without overwriting it.

    The learner's row wins for everything a learner can change (their own context sentence,
    their status, their added examples); the pack only supplies what the learner has no
    copy of. Returns a new dict — the caller's entry is not mutated.
    """
    merged = dict(entry)
    for key in PACK_ONLY_FIELDS:
        if key in payload and payload[key] is not None and not merged.get(key):
            merged[key] = payload[key]
    # `example_sentences` is a union: the pack's prose plus whatever the learner met.
    pack_examples = [_clean(s) for s in (payload.get("example_sentences") or []) if _clean(s)]
    if pack_examples:
        have = {_clean(s).lower() for s in (merged.get("example_sentences") or [])}
        merged["example_sentences"] = [
            *(merged.get("example_sentences") or []),
            *[s for s in pack_examples if s.lower() not in have],
        ]
    for key in ("collocations", "topic_tags"):
        if not merged.get(key) and payload.get(key):
            merged[key] = payload[key]

    # Provenance for `sentence_candidates`: everything below is our prose, so anything in
    # `example_sentences` that is *not* here arrived through `ingest_item()` from a real
    # attempt and ranks above authored material.
    authored = [
        *(payload.get("example_sentences") or []),
        *[c.get("text") for c in (payload.get("contexts") or []) if isinstance(c, dict)],
        payload.get("own_context_sentence"),
    ]
    merged["_pack_sentences"] = [_clean(s) for s in authored if _clean(s)]
    return merged


# ======================================================================================
# 3. Strict near-miss — grammar's policy, not the vocabulary bank's (§2.9)
# ======================================================================================


def levenshtein(a: str, b: str, *, cap: int = 3) -> int:
    """Edit distance, short-circuited at ``cap`` (we only ever care about 0, 1 or "more")."""
    if a == b:
        return 0
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb))
            )
        if min(current) > cap:
            return cap + 1
        previous = current
    return previous[-1]


_INFLECTIONS: tuple[tuple[str, str], ...] = (
    ("ing", "progressive"),
    ("ies", "plural_3s"),
    ("ied", "past"),
    ("es", "plural_3s"),
    ("ed", "past"),
    ("s", "plural_3s"),
)


def _split_inflection(word: str) -> tuple[str, str]:
    for suffix, tag in _INFLECTIONS:
        if word.endswith(suffix) and len(word) > len(suffix) + 1:
            return word[: -len(suffix)], tag
    return word, "base"


def same_inflection_class(expected: str, given: str) -> bool:
    """Do the two forms carry the *same grammatical ending*?

    This is the ten lines that separate a drill which teaches form from one that awards
    "almost" for the wrong form (DESIGN §2.9):

    * ``walked`` / ``walkd`` — **same** class. The ending is mistyped, not chosen.
    * ``walked`` / ``walks``, ``arable`` / ``arables`` — **different**. The learner picked a
      different ending, and in a form-focused item that *is* the lesson.

    Never call :func:`exercises.word_variants` in its place: that helper deliberately
    accepts every inflection, which is exactly the wrong answer here.
    """
    exp_stem, exp_tag = _split_inflection(expected)
    giv_stem, giv_tag = _split_inflection(given)
    if exp_tag == giv_tag:
        return True  # same ending; the difference is inside the stem, so it is a slip
    # Different endings are only forgivable when the given form is not a *competing*
    # inflection of the same stem — i.e. the ending was mistyped into something that is
    # not an English ending at all, rather than swapped for another real one.
    return giv_tag == "base" and giv_stem != exp_stem


def strict_close(expected: list[str], given: str) -> bool:
    """A near-miss that a form-focused item may forgive: one typo, same ending."""
    for candidate in expected:
        if levenshtein(candidate, given, cap=1) <= 1 and same_inflection_class(candidate, given):
            return True
    return False


# ======================================================================================
# 4. The context-driven exercise kinds
# ======================================================================================

CONTEXT_EXERCISE_TYPES: tuple[str, ...] = (
    "forced_choice",
    "transform",
    "error_fix",
    "produce",
)


def _norm(text: Any) -> str:
    return ex.normalize_answer_text(str(text or ""))


def _confusables(entry: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        c
        for c in (entry.get("confusables") or [])
        if isinstance(c, dict) and _clean(c.get("term"))
    ]


def _family(entry: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        f for f in (entry.get("word_family") or []) if isinstance(f, dict) and _clean(f.get("form"))
    ]


def _chunk(entry: dict[str, Any]) -> dict[str, Any]:
    chunk = entry.get("chunk")
    return chunk if isinstance(chunk, dict) else {}


def _learner_errors(entry: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for raw in entry.get("learner_errors") or []:
        if not isinstance(raw, dict):
            continue
        if _clean(raw.get("sentence")) and _clean(raw.get("span")) and _clean(raw.get("fix")):
            out.append(raw)
    return out


def _family_target(entry: dict[str, Any]) -> dict[str, Any] | None:
    """A family member whose part of speech differs from the headword's — the transform."""
    head = ex.normalize_term(entry.get("headword") or "")
    pos = str(entry.get("pos") or "").strip().lower()
    for member in _family(entry):
        form = ex.normalize_term(member.get("form"))
        member_pos = str(member.get("pos") or "").strip().lower()
        if form and form != head and member_pos and member_pos != pos:
            return member
    return None


def _swap_target(entry: dict[str, Any]) -> dict[str, Any] | None:
    """A confusable carrying a two-sentence minimal pair — the other transform."""
    for confusable in _confusables(entry):
        pair = confusable.get("minimal_pair")
        if isinstance(pair, list) and len([p for p in pair if _clean(p)]) >= 2:
            return confusable
    return None


_OPPOSITE_PREPOSITION = {
    "on": "of", "of": "on", "in": "on", "to": "for", "for": "to", "from": "of", "with": "to",
    "at": "in", "about": "on", "between": "among", "into": "in",
}


def _forced_choice_option(entry: dict[str, Any]) -> dict[str, Any] | None:
    """The one alternative worth offering: grammatical, plausible, and wrong *here*.

    A distractor that is simply not English tests nothing — the learner rules it out
    without reading the sentence. Resolved once, so :func:`can_build` and the builder can
    never disagree about whether an item is possible.
    """
    headword = _clean(entry.get("headword")) or _clean(entry.get("lemma"))
    head_key = ex.normalize_term(headword)

    confusables = _confusables(entry)
    if confusables:
        pick = confusables[0]
        return {
            "basis": "confusable",
            "answer": headword,
            "alternative": _clean(pick.get("term")),
            "difference": _clean(pick.get("difference")),
            "minimal_pair": [_clean(p) for p in (pick.get("minimal_pair") or []) if _clean(p)],
        }

    sibling = next(
        (
            f
            for f in _family(entry)
            if ex.normalize_term(f.get("form")) and ex.normalize_term(f.get("form")) != head_key
        ),
        None,
    )
    if sibling is not None:
        return {
            "basis": "word_family",
            "answer": headword,
            "alternative": _clean(sibling.get("form")),
            "difference": _clean(sibling.get("note"))
            or (
                f"Same family, different job in the sentence: here you need the "
                f"{entry.get('pos') or 'form'}."
            ),
            "minimal_pair": [],
        }

    preposition = _clean(_chunk(entry).get("dependent_preposition"))
    if preposition:
        return {
            "basis": "dependent_preposition",
            "answer": preposition,
            "alternative": _OPPOSITE_PREPOSITION.get(preposition, "of"),
            "difference": (
                f"“{headword}” takes “{preposition}”. There is no rule behind it — it is part "
                "of the chunk, so the two words have to be learned together."
            ),
            "minimal_pair": [],
        }
    return None


def can_build(
    kind: str,
    entry: dict[str, Any],
    card: dict[str, Any] | None = None,
    *,
    allow_llm: bool = True,
    sentence: Sentence | None = None,
) -> bool:
    """Does this entry carry the data the kind needs, right now?

    Kept out of :mod:`exercises` on purpose: the six core kinds have no idea these exist,
    and the guard belongs next to the builder it guards.
    """
    if kind == "forced_choice":
        option = _forced_choice_option(entry)
        if option is None or not option["alternative"]:
            return False
        return sentence is not None or bool(sentence_candidates(entry))
    if kind == "transform":
        return bool(_family_target(entry) or _swap_target(entry))
    if kind == "error_fix":
        return bool(_learner_errors(entry))
    if kind == "produce":
        return bool(allow_llm and _clean(entry.get("definition")))
    return False


def build(
    kind: str,
    entry: dict[str, Any],
    card: dict[str, Any] | None = None,
    *,
    sentence: Sentence | None = None,
    rng: random.Random | None = None,
    distractors: list[str] | None = None,
    grammar_target: dict[str, Any] | None = None,
    stage: int = 3,
    **selection: Any,
) -> dict[str, Any]:
    """Render one context-driven exercise, in the same envelope as `exercises.build_exercise`.

    Falls back to the caller's core builder when the entry cannot support the kind, so a
    queue that asks for `forced_choice` on a bare v1 entry still gets a usable card.
    """
    rng = rng or random
    if sentence is None:
        sentence = select_sentence(entry, stage=stage, **selection)

    if kind == "forced_choice" and can_build(kind, entry, card, sentence=sentence):
        return _build_forced_choice(entry, sentence, rng)
    if kind == "transform" and can_build(kind, entry, card):
        return _build_transform(entry, sentence, rng)
    if kind == "error_fix" and can_build(kind, entry, card):
        return _build_error_fix(entry, rng)
    if kind == "produce" and can_build(kind, entry, card):
        return _build_produce(entry, sentence, grammar_target, rng)

    return ex.build_exercise("flip", entry, card, distractors=distractors, rng=rng)


def _context_block(sentence: Sentence | None) -> dict[str, Any]:
    return sentence.public() if sentence is not None else {}


# -- forced choice ---------------------------------------------------------------------


def _build_forced_choice(
    entry: dict[str, Any], sentence: Sentence | None, rng: random.Random
) -> dict[str, Any]:
    """Two options, both real English, and the *situation* is what decides (§1.4 S3).

    The two options are always a near-synonym the author wrote a difference for, a sibling
    from the same word family, or the wrong dependent preposition — three things that are
    all real English and all wrong *in this sentence*.
    """
    headword = _clean(entry.get("headword")) or _clean(entry.get("lemma"))
    option = _forced_choice_option(entry) or {}
    answer = option.get("answer") or headword
    alternative = option.get("alternative") or ""
    difference = option.get("difference") or ""
    minimal_pair = option.get("minimal_pair") or []
    basis = option.get("basis") or "confusable"

    if sentence is not None:
        cloze = cloze_payload(sentence, entry)
        masked = cloze["masked"] if cloze["blanks"] else sentence.text
    else:
        masked = ""

    options = [answer, alternative]
    rng.shuffle(options)

    return {
        "type": "forced_choice",
        "prompt": "Both of these are real English. Which one does this sentence need?",
        "payload": {
            "entry_id": entry.get("id"),
            "headword": headword,
            "definition": entry.get("definition"),
            "masked_sentence": masked,
            "options": options,
            "basis": basis,
            "context": _context_block(sentence),
            # Shown only after the answer — reading it first turns a choice into a lookup.
            "reveal": {
                "difference": difference,
                "minimal_pair": minimal_pair,
                "avoid": entry.get("avoid"),
            },
        },
        "expected": [_norm(answer)],
    }


# -- transformation --------------------------------------------------------------------


def _build_transform(
    entry: dict[str, Any], sentence: Sentence | None, rng: random.Random
) -> dict[str, Any]:
    """Two modes, both with an authored answer set so the grading stays mechanical.

    ``word_family`` — the sentence fixes the meaning and the learner supplies a different
    form of the same word. Word form is a top-ten IELTS error and learners experience it as
    grammar, which is exactly why it belongs on a sentence and not on a table.

    ``confusable_swap`` — the learner is given the *near-synonym's* sentence and has to
    rewrite it so it says the other thing. This is "when to use which" in productive mode:
    choosing correctly is easier than producing the choice, and only the second one shows
    up in an exam.
    """
    headword = _clean(entry.get("headword")) or _clean(entry.get("lemma"))
    member = _family_target(entry)
    if member is not None:
        form = _clean(member.get("form"))
        target_pos = str(member.get("pos") or "").strip().lower()
        source_text = sentence.text if sentence is not None else ""
        accepted = {
            _norm(f.get("form"))
            for f in _family(entry)
            if str(f.get("pos") or "").strip().lower() == target_pos and _clean(f.get("form"))
        }
        return {
            "type": "transform",
            "prompt": (
                f"Here “{headword}” is a {entry.get('pos') or 'word'}. "
                f"Write the **{target_pos or 'other'}** from the same family."
            ),
            "payload": {
                "entry_id": entry.get("id"),
                "mode": "word_family",
                "source_sentence": source_text,
                "headword": headword,
                "from_pos": entry.get("pos"),
                "to_pos": target_pos,
                "context": _context_block(sentence),
                "reveal": {"answer": form, "note": _clean(member.get("note")) or None},
            },
            "expected": sorted(accepted or {_norm(form)}),
        }

    confusable = _swap_target(entry)
    pair = [_clean(p) for p in (confusable or {}).get("minimal_pair", []) if _clean(p)]
    target_sentence, other_sentence = pair[0], pair[1]
    difference = _clean((confusable or {}).get("difference"))
    other_term = _clean((confusable or {}).get("term"))
    return {
        "type": "transform",
        "prompt": (
            f"Rewrite this so it uses **{headword}** instead of “{other_term}”. "
            "Change as little as possible."
        ),
        "payload": {
            "entry_id": entry.get("id"),
            "mode": "confusable_swap",
            "source_sentence": other_sentence,
            "headword": headword,
            "replaces": other_term,
            "must_contain": [headword],
            "must_not_contain": [other_term],
            "context": _context_block(sentence),
            "reveal": {"answer": target_sentence, "difference": difference},
        },
        "expected": [_norm(target_sentence)],
    }


def _swap_accepted(exercise: dict[str, Any], given: str) -> bool:
    """A rewrite is right when it *does the swap*, not when it matches our string.

    Accepting is cheap and rejecting is expensive (§2.9): a learner who writes a perfectly
    good sentence and is told no stops believing the next correction. So an answer passes
    when it contains the target, drops the near-synonym, and is recognisably the same
    sentence — even if the article or the tense wording differs from ours.
    """
    payload = exercise.get("payload") or {}
    words = set(_norm(given).split())
    if not words:
        return False
    for term in payload.get("must_contain") or []:
        if not set(_norm(term).split()) <= words:
            return False
    for term in payload.get("must_not_contain") or []:
        if set(_norm(term).split()) <= words:
            return False
    reference = set(_norm(payload.get("source_sentence")).split())
    if not reference:
        return True
    overlap = len(words & reference) / max(1, len(reference))
    return overlap >= 0.6


# -- error correction ------------------------------------------------------------------


def _build_error_fix(entry: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    """Correction on a sentence the learner actually produced (GV-R4 §4.4).

    Own errors are strictly preferred over authored ones: maximum relevance and zero risk
    of teaching a new error by exposure. The UI contract is in the payload — exactly one
    error, the span marked as broken chrome rather than as prose the learner might read as
    a model, and the correction held on screen at least as long as the broken form was.
    """
    errors = _learner_errors(entry)
    error = rng.choice(errors) if len(errors) > 1 else errors[0]
    sentence = _clean(error.get("sentence"))
    span = _clean(error.get("span"))
    fix = _clean(error.get("fix"))
    index = sentence.lower().find(span.lower())
    corrected = (
        sentence[:index] + fix + sentence[index + len(span) :] if index >= 0 else sentence
    )
    module = str(error.get("module") or "")
    return {
        "type": "error_fix",
        "prompt": "You wrote this. One part of it is wrong — type the correction.",
        "payload": {
            "entry_id": entry.get("id"),
            "error_id": error.get("id"),
            "sentence": sentence,
            "span": span,
            "span_start": index if index >= 0 else None,
            "span_end": (index + len(span)) if index >= 0 else None,
            "marked_broken": True,
            "kind": error.get("kind") or "grammar",
            "source_note": _PROVENANCE.get(module, "from your own practice"),
            "min_reveal_ms": MIN_CORRECTION_REVEAL_MS,
            "reveal": {
                "corrected_sentence": corrected,
                "explanation": _clean(error.get("explanation")) or None,
            },
        },
        # The learner may type just the replacement or retype the whole sentence.
        "expected": sorted({_norm(fix), _norm(corrected)}),
    }


# -- free production -------------------------------------------------------------------


def _build_produce(
    entry: dict[str, Any],
    sentence: Sentence | None,
    grammar_target: dict[str, Any] | None,
    rng: random.Random,
) -> dict[str, Any]:
    """One original sentence, under one constraint. The rung everything else feeds.

    The constraint is what stops this being "write a sentence with X", which learners
    satisfy with *"I like X."* forever. Priority: a grammar structure the caller is also
    reviewing (one answer, two cards — DESIGN §1.5 rule 7), then an authored collocate,
    then a topic.
    """
    headword = _clean(entry.get("headword")) or _clean(entry.get("lemma"))
    chunk = _chunk(entry)
    must_contain = [chunk.get("fixed_part") or headword]

    constraint: dict[str, Any]
    if grammar_target and _clean(grammar_target.get("label")):
        constraint = {
            "kind": "grammar",
            "value": _clean(grammar_target.get("label")),
            "point_id": grammar_target.get("point_id"),
        }
        instruction = (
            f"Write one sentence using **{headword}** with the "
            f"{constraint['value']}."
        )
    elif entry.get("collocations"):
        collocate = _clean((entry.get("collocations") or [])[0])
        constraint = {"kind": "collocation", "value": collocate}
        instruction = f"Write one sentence using the whole phrase **{collocate}**."
        must_contain = [collocate]
    else:
        topic = _clean((entry.get("topic_tags") or ["something you did this week"])[0])
        constraint = {"kind": "topic", "value": topic}
        instruction = f"Write one sentence about **{topic}** using **{headword}**."

    return {
        "type": "produce",
        "prompt": instruction,
        "payload": {
            "entry_id": entry.get("id"),
            "headword": headword,
            "pos": entry.get("pos"),
            "definition": entry.get("definition"),
            "constraint": constraint,
            "must_contain": [m for m in must_contain if m],
            "min_words": 6,
            "checked_by": "llm",
            "context": _context_block(sentence),
            # Shown after the attempt, as one possibility among many — never before.
            "reveal": {
                "model_sentence": sentence.text if sentence is not None else None,
                "avoid": entry.get("avoid"),
            },
        },
        "expected": None,
    }


# ======================================================================================
# 5. Grading
# ======================================================================================


def grade(
    exercise: dict[str, Any],
    answer: str,
    *,
    entry: dict[str, Any] | None = None,
    attempts: int = 1,
    revealed: bool = False,
    hinted: bool = False,
    elapsed_ms: int | None = None,
    stage: int = 3,
) -> dict[str, Any]:
    """Mechanical grading for the three deterministic kinds, with §1.8's rating mapping.

    `produce` is not graded here — it is free production and it goes through
    :func:`check_production`. Asking for it returns an unchecked result rather than
    guessing, because guessing at a free sentence is how a grader loses a learner's trust.
    """
    kind = str(exercise.get("type") or "")
    expected: list[str] = list(exercise.get("expected") or [])
    given = _norm(answer)

    if kind == "produce" or not expected:
        return {
            "checked": False,
            "correct": None,
            "close": False,
            "suggested_rating": 3,
            "detail": "Rate yourself." if kind != "produce" else "Checked by the language model.",
            "expected": None,
            "note": None,
        }

    correct = bool(given) and given in expected
    if not correct and kind == "transform" and (exercise.get("payload") or {}).get(
        "must_contain"
    ):
        correct = _swap_accepted(exercise, answer)

    close = False if correct else strict_close(expected, given)

    note: str | None = None
    if revealed or (not correct and not close):
        rating = 1
        detail = f"The answer is “{expected[0]}”."
    elif close:
        # §1.6 — typos are not failures. A false lapse poisons FSRS's difficulty estimate
        # for this card *and* the learner's trust, in the same move.
        rating = 3
        detail = "Right — check the spelling."
        note = "spelling"
    elif hinted or attempts > 1:
        rating = 2
        detail = "Correct on the second try." if attempts > 1 else "Correct, with a hint."
    else:
        threshold = STAGE_LATENCY_MS.get(int(stage))
        fast = threshold is not None and elapsed_ms is not None and elapsed_ms <= threshold
        rating = 4 if fast else 3
        detail = "Correct." if not fast else "Correct, and fast."

    return {
        "checked": True,
        "correct": correct or close,
        "close": close,
        "suggested_rating": rating,
        "detail": detail,
        "expected": expected[0],
        "note": note,
    }


# --------------------------------------------------------------------------------------
# Free production — four binary checks, never a score (GV-R4 §5, DESIGN §2.9)
# --------------------------------------------------------------------------------------

#: Never checked, ever. This list is in the code so that no future prompt edit quietly
#: reintroduces one of them: topic · opinion · truth · length · formality (unless the item
#: is about register) · spelling outside the target span · punctuation outside the target
#: span · vocabulary choice elsewhere · whether it is "natural" · whether a native would
#: say it. Focused feedback beats unfocused feedback, and unfocused feedback turns the
#: module into a red-pen machine that learners stop reading.
NEVER_CHECKED: tuple[str, ...] = (
    "topic",
    "opinion",
    "truth",
    "length",
    "formality",
    "spelling outside the target",
    "punctuation outside the target",
    "vocabulary choice elsewhere",
    "naturalness",
    "what a native speaker would say",
)

PRODUCTION_PROMPT = """You are checking one sentence an English learner wrote to practise a \
target item.

Target item: "{headword}" ({pos}) — meaning: {definition}
The task they were given: {instruction}
Their sentence: "{sentence}"

The automatic check says the target item WAS {detected} in their sentence.{gloss}

Answer only these questions:
1. structure_correct — is the TARGET ITEM itself correctly formed and used in this
   sentence (word form, the words it combines with, the grammar it requires)?
2. fits — does the sentence make sense for the task above, given what the target item
   means?

Rules you must follow:
- Ignore every error that is not part of the target item: spelling, articles,
  prepositions, punctuation and word choice elsewhere are NOT your business.
- Do not judge the topic, the opinion, the truth of the claim, the length, or whether a
  native speaker would phrase it that way.
- Only answer false for structure_correct if you can quote the exact words that are
  wrong, in offending_span, copied verbatim from their sentence.
- If you are unsure, answer true.

Return ONLY a JSON object:
{{
  "structure_correct": true/false,
  "fits": true/false,
  "offending_span": "the exact wrong words copied from their sentence, or an empty string",
  "minimal_fix": "their sentence with the smallest possible edit that fixes it, or an
    empty string if nothing needs changing"
}}"""


def detect_target(sentence: str, entry: dict[str, Any]) -> bool:
    """Check A, mechanically: is the target item present at all?

    Answering this in code and *telling* the model the result is the main fairness defence
    — it stops a model that has decided it dislikes the sentence from also deciding the
    word is missing.
    """
    text = _norm(sentence)
    if not text:
        return False
    chunk = _chunk(entry)
    fixed = _norm(chunk.get("fixed_part"))
    if fixed and fixed in text:
        return True
    headword = _clean(entry.get("headword")) or _clean(entry.get("lemma"))
    if " " in ex.normalize_term(headword):
        return _norm(headword) in text
    tokens = set(text.split())
    return bool(tokens & {_norm(v) for v in ex.word_variants(headword, entry.get("lemma"))})


def _read_binary(raw: dict[str, Any], key: str) -> bool:
    """Missing or unparseable means **true** — the leniency bias is deliberate (§2.9)."""
    if key in raw:
        value = raw[key]
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("true", "yes", "1")
    # `acceptable` is the older single-verdict key some fixtures and providers still emit.
    if "acceptable" in raw:
        value = raw["acceptable"]
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("true", "yes", "1")
    return True


async def _judge(prompt: str) -> dict[str, Any] | None:
    from bandready.providers.llm import chat_json

    try:
        raw = await chat_json(
            [{"role": "user", "content": prompt}], mock_kind="vocab_check", temperature=0
        )
    except Exception as exc:  # noqa: BLE001 — offline degrades, it never raises
        _log.info("production check unavailable (%s)", type(exc).__name__)
        return None
    return raw if isinstance(raw, dict) else {}


async def check_production(
    exercise: dict[str, Any],
    sentence: str,
    *,
    entry: dict[str, Any],
    learner_gloss: str | None = None,
) -> dict[str, Any]:
    """Grade a `produce` answer the way GV-R4 §5 prescribes.

    Verdict is ``A and B and C`` and nothing else — present (mechanical), well-formed
    (binary), fits (binary). Three mechanisms make rejection expensive on purpose:

    1. **A rejection with no quotable span is discarded.** If the model says the structure
       is wrong but cannot point at the words, we accept. Ten lines, and the strongest
       single fairness lever available to us.
    2. **Asymmetric confirmation.** Accept on one call; a rejection costs a second, and if
       the two calls disagree we accept.
    3. **A missed detector is our bug.** If check A does not fire we still do not reject —
       we ask the model and log the gap for the content agent.
    """
    payload = exercise.get("payload") or {}
    text = _clean(sentence)
    if not text:
        return _production_result(
            accepted=False,
            checked=True,
            detail="Write one sentence first.",
            rating=1,
        )

    detected = detect_target(text, entry)
    prompt = PRODUCTION_PROMPT.format(
        headword=payload.get("headword") or entry.get("headword") or "",
        pos=entry.get("pos") or "other",
        definition=entry.get("definition") or "(no definition yet)",
        instruction=exercise.get("prompt") or "use the item in a sentence",
        sentence=text,
        detected="FOUND" if detected else "NOT FOUND",
        gloss=(
            f'\n\nThe learner says they meant: "{_clean(learner_gloss)}". If the sentence can '
            "carry that meaning, answer true."
            if _clean(learner_gloss)
            else ""
        ),
    )

    raw = await _judge(prompt)
    if raw is None:
        return _production_result(
            accepted=None,
            checked=False,
            detail="Could not reach the language model — rate yourself.",
            rating=3,
            detected=detected,
        )

    verdict = _verdict(raw, text, detected)
    if verdict["accepted"]:
        return _production_result(
            accepted=True,
            checked=True,
            detail="Good — that is the item doing its job.",
            rating=3,
            detected=detected,
            minimal_fix=verdict["minimal_fix"],
        )

    # Rejection: confirm it. Disagreement between the two calls is resolved in the
    # learner's favour, always.
    second = await _judge(prompt + "\n\nAnswer question 2 first, then question 1.")
    if second is None or _verdict(second, text, detected)["accepted"]:
        return _production_result(
            accepted=True,
            checked=True,
            detail="Accepted — the two checks disagreed, so we took your side.",
            rating=3,
            detected=detected,
        )

    return _production_result(
        accepted=False,
        checked=True,
        detail="Look at the highlighted words — that part is not doing what you want.",
        rating=1,
        detected=detected,
        offending_span=verdict["offending_span"],
        minimal_fix=verdict["minimal_fix"],
        appealable=True,
    )


def _verdict(raw: dict[str, Any], sentence: str, detected: bool) -> dict[str, Any]:
    well_formed = _read_binary(raw, "structure_correct")
    fits = _read_binary(raw, "fits")
    span = _clean(raw.get("offending_span"))
    minimal_fix = _clean(raw.get("minimal_fix"))

    # A rejection the model cannot anchor in the learner's own words is not a rejection.
    if not well_formed and (not span or _norm(span) not in _norm(sentence)):
        well_formed = True
        span = ""

    # Check A never rejects on its own: a detector that misses is our bug, not their error.
    present = detected or well_formed
    return {
        "accepted": bool(present and well_formed and fits),
        "offending_span": span,
        "minimal_fix": minimal_fix,
    }


def _production_result(
    *,
    accepted: bool | None,
    checked: bool,
    detail: str,
    rating: int,
    detected: bool | None = None,
    offending_span: str = "",
    minimal_fix: str = "",
    appealable: bool = False,
) -> dict[str, Any]:
    return {
        "checked": checked,
        "accepted": accepted,
        "correct": accepted,
        "close": False,
        "suggested_rating": rating,
        "detail": detail,
        "detected": detected,
        "offending_span": offending_span,
        "minimal_fix": minimal_fix,
        "appealable": appealable,
        "expected": None,
    }


async def appeal_production(
    exercise: dict[str, Any],
    sentence: str,
    *,
    entry: dict[str, Any],
    gloss: str,
) -> dict[str, Any]:
    """"I think this is right." Re-runs the check with the learner's own meaning attached.

    Every appeal is a labelled data point about where our items and detectors are wrong. A
    module that cannot be told it is wrong will stay wrong.
    """
    result = await check_production(exercise, sentence, entry=entry, learner_gloss=gloss)
    result["appealed"] = True
    if result.get("accepted"):
        result["detail"] = "Accepted — that reading works."
    return result


# ======================================================================================
# 6. Sentence utilities shared with the bridge
# ======================================================================================


def split_sentences(text: str) -> list[str]:
    """Sentence-ish split, good enough to pull one learner sentence out of an essay."""
    cleaned = _clean(text)
    return [s for s in _SENTENCE_SPLIT_RE.split(cleaned) if s] if cleaned else []


def sentence_around(text: str, start: int, end: int) -> str:
    """The single sentence of ``text`` containing ``[start:end)``.

    A writing annotation anchors to character offsets in the essay; an `error_fix` item
    needs the sentence, not the essay and not the bare fragment — the fragment is where the
    error is, the sentence is what makes it visible.
    """
    if not text:
        return ""
    start = max(0, min(int(start), len(text)))
    end = max(start, min(int(end), len(text)))
    cursor = 0
    for piece in split_sentences(text) or [text]:
        index = text.find(piece, cursor)
        if index < 0:
            index = cursor
        stop = index + len(piece)
        if index <= start < stop or index < end <= stop:
            return _clean(piece)
        cursor = stop
    return _clean(text[max(0, start - 120) : end + 120])
