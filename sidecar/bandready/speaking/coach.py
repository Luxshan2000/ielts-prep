"""Reading and shaping the speaking pack's teaching payload (content DESIGN.md §1–§4).

Two layers ship on every card set. The **exam** layer — questions, cue card, Part 3
themes — is what the examiner persona reads aloud. The **teaching** layer lives beside
it in ``payload_json.teaching`` (and, for topic-scoped material, in the card set's
``language_bank`` and ``vocabulary``) and is what the *coach* is allowed to show. This
module is the read side of the teaching layer.

One rule outranks everything else in this file:

    **A model answer is never returned to a learner who has not spoken yet.**

A model read before the attempt is a script to memorise, and memorised language is
precisely what the band descriptors decline to credit. :func:`gate_state` is the only
place that decides, :func:`teaching_payload` is the only place that assembles the
response, and the gate covers every field that carries model wording — the three model
answers, the swap slots (whose spans are verbatim substrings of the band-7 transcript)
and the chunking drill (whose sentence is copied from the same transcript).

Everything here is absent-by-default. The twelve original sets are ``schema_version: 1``
and carry no teaching fields at all, so every accessor returns an empty structure rather
than raising: a v1 card renders as "no teaching material for this card yet" instead of a
500.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.jsoncol import loads
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.speaking.coach")

#: The closed function enum the app renders the same eight labels for (DESIGN §1.1).
FUNCTIONS: tuple[str, ...] = (
    "opinion",
    "hedging",
    "comparing",
    "speculating",
    "conceding",
    "exemplifying",
    "narrating",
    "evaluating",
)
CRITERIA: tuple[str, ...] = ("FC", "LR", "GRA", "PRON")
#: Bands a learner may compare their attempt against. Round 1 authored 6/7/8 on every
#: Part 2 card; round 2 (staging/sets/r2-ladder.json) extended twenty of them down to 5
#: — so a candidate sitting below 6 has a rung to stand on — and up to 9. Comparing
#: against a band the *card* does not carry is refused per-card in `compare`, not here.
BANDS: tuple[int, ...] = (5, 6, 7, 8, 9)
DEFAULT_BAND = 7

#: Fields withheld until the learner has attempted the card. Every one of them carries
#: wording lifted from a model answer, so they travel together (DESIGN §3.8/§3.9/§3.7).
GATED_FIELDS: tuple[str, ...] = (
    "model_answers",
    "swap_slots",
    "pronunciation_focus.chunking_drill",
)

LOCK_MESSAGE = (
    "Record an attempt on this card first. A model answer read before you speak becomes "
    "a script, and a script is the one thing the band descriptors will not credit you for."
)

#: Words spoken in a session before it counts as an attempt on the card. Low on purpose:
#: a learner who dried up after two sentences has still spoken, and has still earned the
#: model answer.
MIN_ATTEMPT_WORDS = 5

#: Enough of the learner's own words for a comparison to say anything true.
MIN_COMPARE_WORDS = 5


# --------------------------------------------------------------------------------------
# JSON column helpers
# --------------------------------------------------------------------------------------


#: ``loads`` is imported, not defined here: the same ``*_json`` reader lived byte-identical
#: in all four coach modules, and the list of shapes it tolerates has to be one edit, not
#: four. Re-exported under this module's own name because ``coach.loads(...)`` is how the
#: mock engines and the tests reach it.


def payload_of(row: Any) -> dict[str, Any]:
    """``payload_json`` as a dict, whatever the column happens to hold."""
    if row is None:
        return {}
    return dict(loads(getattr(row, "payload_json", None), {}))


def _text(value: Any, limit: int = 400) -> str | None:
    """A trimmed non-empty string, or ``None`` — never the string ``"None"``."""
    if value is None:
        return None
    out = str(value).strip()
    if not out:
        return None
    return out[:limit]


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in (value or []) if isinstance(item, dict)]


def _strings(value: Any, limit: int = 40) -> list[str]:
    out: list[str] = []
    for item in value or []:
        text = _text(item)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------------------
# Row lookup
# --------------------------------------------------------------------------------------


def get_card(session: Session, card_id: str) -> m.SpeakingCard:
    card = session.get(m.SpeakingCard, card_id)
    if card is None or card.retired:
        raise ApiError(404, "not_found", f"no speaking card {card_id!r}")
    return card


def get_card_set(session: Session, card_set_id: str) -> m.CardSet:
    row = session.get(m.CardSet, card_set_id)
    if row is None or row.retired:
        raise ApiError(404, "not_found", f"no card set {card_set_id!r}")
    return row


def teaching_of(card: Any) -> dict[str, Any]:
    return dict(payload_of(card).get("teaching") or {})


def model_answers(card: Any) -> list[dict[str, Any]]:
    """Every band rendering the card carries, ordered low → high. **Gated**.

    Round 1 authored three rungs (6/7/8); round 2 extended twenty cards to five
    (5/6/7/8/9). Nothing downstream may assume a count — the UI builds its band selector
    from ``model_answer_bands``, which is exactly the bands present here.
    """
    answers = _dicts(teaching_of(card).get("model_answers"))
    return sorted(answers, key=lambda a: _band_of(a) or 0)


#: ``ladder_note`` keys, one per step of the 5→9 ladder (staging/sets/r2-ladder.json).
LADDER_STEPS = ("from_5_to_6", "from_6_to_7", "from_7_to_8", "from_8_to_9")


def _ladder_note(teaching: dict[str, Any]) -> dict[str, str]:
    """The one next change per rung. Absent on every card the ladder pass did not touch."""
    raw = teaching.get("ladder_note")
    if not isinstance(raw, dict):
        return {}
    return {
        key: _text(raw.get(key), 300) or ""
        for key in LADDER_STEPS
        if isinstance(raw.get(key), str) and raw.get(key, "").strip()
    }


def _band_of(answer: dict[str, Any]) -> int | None:
    try:
        return int(answer.get("band_target"))
    except (TypeError, ValueError):
        return None


def model_answer_at(card: Any, band: int) -> dict[str, Any] | None:
    for answer in model_answers(card):
        if _band_of(answer) == band:
            return answer
    return None


# --------------------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Attempt:
    """One completed session that counts as an attempt on a card."""

    session_id: str
    ended_at: str | None
    words: int
    evidence: str  # "card_id" — the turn named the card; "card_set" — same set, same part


def _turns_of(row: Any) -> list[dict[str, Any]]:
    record = loads(getattr(row, "transcript_json", None), {})
    turns = record.get("turns") if isinstance(record, dict) else None
    return _dicts(turns)


def _attempt_in(row: Any, card: m.SpeakingCard) -> tuple[int, str] | None:
    """Words the learner spoke on ``card`` inside this session, and how we know.

    Two paths, because the live runtime stamps every turn with the *first* card id in
    the bundle rather than the card actually being asked: an exact ``card_id`` match is
    trusted when it appears, and otherwise a user turn in the right part of a session
    that served this card's set is what an attempt looks like.
    """
    by_card = 0
    by_part = 0
    same_set = bool(card.card_set_id) and row.card_set_id == card.card_set_id
    for turn in _turns_of(row):
        if turn.get("role") != "user":
            continue
        words = len(str(turn.get("text") or "").split())
        if not words:
            continue
        if turn.get("card_id") == card.id:
            by_card += words
        elif same_set:
            part = turn.get("part")
            if part == card.part or (part is None and row.part == card.part):
                by_part += words
    if by_card >= MIN_ATTEMPT_WORDS:
        return by_card, "card_id"
    if by_part >= MIN_ATTEMPT_WORDS:
        return by_part, "card_set"
    return None


def find_attempts(
    session: Session, profile_id: str, card: m.SpeakingCard, *, limit: int = 5
) -> list[Attempt]:
    """Completed sessions in which this learner spoke on this card, newest first.

    ``status == 'complete'`` is load-bearing: a session that is still live has not
    produced an attempt yet, and must not open the gate mid-turn.
    """
    stmt = (
        select(m.SpeakingSession, m.PracticeSession.ended_at)
        .join(m.PracticeSession, m.PracticeSession.id == m.SpeakingSession.id)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.PracticeSession.module == "speaking",
            m.SpeakingSession.status == "complete",
            m.SpeakingSession.transcript_json.is_not(None),
        )
        .order_by(m.SpeakingSession.id.desc())
    )
    # Cheap pre-filter so we only parse the transcripts that could possibly match. Card
    # ids contain `_`, which LIKE reads as a single-character wildcard — harmless here,
    # because the pattern can only ever over-select and `_attempt_in` is the real check.
    named = m.SpeakingSession.transcript_json.like(f'%"{card.id}"%')
    stmt = stmt.where(
        or_(m.SpeakingSession.card_set_id == card.card_set_id, named)
        if card.card_set_id
        else named
    )

    out: list[Attempt] = []
    for row, ended_at in session.execute(stmt).all():
        hit = _attempt_in(row, card)
        if hit is None:
            continue
        words, evidence = hit
        out.append(Attempt(row.id, ended_at, words, evidence))
        if len(out) >= limit:
            break
    return out


def gate_state(
    session: Session, profile_id: str, card: m.SpeakingCard, *, attested: bool
) -> dict[str, Any]:
    """Whether the model answer may be returned, and why.

    Unlocked by either an attempt this sidecar can see, or the caller's explicit
    attestation that the learner has just recorded one (the renderer holds the attempt
    in memory before the session is finalised, so it must be able to say so).
    """
    attempts = find_attempts(session, profile_id, card)
    if attempts:
        reason = "attempted"
    elif attested:
        reason = "client_attested"
    else:
        reason = "not_attempted"
    unlocked = reason != "not_attempted"
    return {
        "unlocked": unlocked,
        "reason": reason,
        "attempts": len(attempts),
        "last_attempt_session_id": attempts[0].session_id if attempts else None,
        "gated_fields": [] if unlocked else list(GATED_FIELDS),
        "message": None if unlocked else LOCK_MESSAGE,
    }


# --------------------------------------------------------------------------------------
# Topic-scoped material (lives on the card set)
# --------------------------------------------------------------------------------------


def _frames(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for frame in _dicts(raw):
        text = _text(frame.get("frame"))
        if not text:
            continue
        out.append(
            {
                "frame": text,
                "slot_hint": _text(frame.get("slot_hint")),
                "slots": text.count("___"),
            }
        )
    return out


def bank_functions(set_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """The set's functional-language entries, normalised and enum-checked."""
    bank = set_payload.get("language_bank") or {}
    out: list[dict[str, Any]] = []
    for entry in _dicts(bank.get("functions") if isinstance(bank, dict) else None):
        function = str(entry.get("function") or "").strip().lower()
        frames = _frames(entry.get("frames"))
        if function not in FUNCTIONS or not frames:
            continue
        out.append(
            {
                "function": function,
                "why_here": _text(entry.get("why_here")),
                "grammar": _text(entry.get("grammar")),
                "frames": frames,
                # The negative exemplar. Not decoration: the contrast is the teaching.
                "avoid": _text(entry.get("avoid")),
            }
        )
    return out


def bank_warning(set_payload: dict[str, Any]) -> str | None:
    bank = set_payload.get("language_bank") or {}
    return _text(bank.get("warning")) if isinstance(bank, dict) else None


def functional_language(
    set_payload: dict[str, Any], targeted: list[str] | None = None
) -> dict[str, Any]:
    """The language bank as the card's Language tab renders it (F4).

    Never gated: frames with open slots are preparation material, not a model answer.
    """
    wanted = [f for f in (targeted or []) if f in FUNCTIONS]
    functions = bank_functions(set_payload)
    for entry in functions:
        entry["targeted"] = entry["function"] in wanted
    functions.sort(key=lambda e: (not e["targeted"], e["function"]))
    return {
        "warning": bank_warning(set_payload),
        "targeted": wanted,
        "functions": functions,
    }


def vocabulary_items(set_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Collocations first, single words last (DESIGN §1.2)."""
    out: list[dict[str, Any]] = []
    for item in _dicts(set_payload.get("vocabulary")):
        term = _text(item.get("item"), 200)
        if not term:
            continue
        out.append(
            {
                "item": term,
                "type": _text(item.get("type")) or "word",
                "cefr": _text(item.get("cefr")),
                "meaning": _text(item.get("meaning")),
                "example": _text(item.get("example")),
                "used_in": _text(item.get("used_in")) or "any",
            }
        )
    return out


def _set_header(row: Any, set_payload: dict[str, Any]) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row.id,
        "title": row.title,
        "topic_id": row.topic_id,
        "teaches": _text(set_payload.get("teaches")),
        "exam_note": _text(set_payload.get("exam_note")),
        "cluster": _text(set_payload.get("cluster")),
        "family": _text(set_payload.get("family")),
        "cognitive_load": _text(set_payload.get("cognitive_load")),
    }


# --------------------------------------------------------------------------------------
# Per-part teaching blocks
# --------------------------------------------------------------------------------------


def _error(entry: dict[str, Any], **extra: Any) -> dict[str, Any]:
    criterion = str(entry.get("criterion") or "").strip().upper() or None
    return {
        "pattern": _text(entry.get("pattern")),
        "wrong": _text(entry.get("wrong")),
        "right": _text(entry.get("right")),
        "why": _text(entry.get("why")),
        "criterion": criterion if criterion in CRITERIA else None,
        **extra,
    }


def common_errors(card: Any, teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The two or three errors this card's subject provokes, highest impact first.

    Part 1 keeps its errors per question, so they are flattened here with the question
    they belong to — the report only ever surfaces one, and it has to be able to rank.
    """
    watchlist = _dicts(teaching.get("error_watchlist"))
    if watchlist:
        return [_error(entry, rank=index) for index, entry in enumerate(watchlist)]

    questions = payload_of(card).get("questions") or []
    out: list[dict[str, Any]] = []
    for note in _dicts(teaching.get("questions")):
        error = note.get("common_error")
        if not isinstance(error, dict):
            continue
        try:
            q_index = int(note.get("q_index"))
        except (TypeError, ValueError):
            q_index = len(out)
        question = questions[q_index] if 0 <= q_index < len(questions) else None
        out.append(
            _error(error, rank=len(out), q_index=q_index, question=_text(question))
        )
    return out


def pronunciation_focus(teaching: dict[str, Any], *, unlocked: bool) -> dict[str, Any] | None:
    """The pronunciation feature this topic's language actually stresses (DESIGN §3.7).

    Available before an attempt — except ``chunking_drill``, whose sentence is copied
    verbatim out of the band-7 model and would leak it a sentence at a time.
    """
    focus = teaching.get("pronunciation_focus")
    if not isinstance(focus, dict) or not focus:
        return None
    out: dict[str, Any] = {
        "priority": _text(focus.get("priority")),
        "tier": focus.get("tier"),
        "why_here": _text(focus.get("why_here")),
        "target_words": _dicts(focus.get("target_words")),
        "minimal_pairs": _dicts(focus.get("minimal_pairs")),
        "chunking_drill": None,
        "chunking_drill_locked": False,
    }
    drill = focus.get("chunking_drill")
    if isinstance(drill, dict) and drill:
        if unlocked:
            out["chunking_drill"] = {
                "sentence": _text(drill.get("sentence"), 600),
                "chunks": _strings(drill.get("chunks"), 12),
            }
        else:
            out["chunking_drill_locked"] = True
    return out


def structure_plan(card: Any, teaching: dict[str, Any]) -> dict[str, Any] | None:
    """The Part 2 plan the prep-minute coach runs on (F2), plus the long-turn budget.

    ``trap`` and ``transfer_drill`` sit under ``post_turn`` because both are shown
    *after* the turn: the trap is a check ("you covered the last bullet ✓"), never a
    warning the learner reads while planning.
    """
    if card.part != 2:
        return None
    payload = payload_of(card)
    cue = payload.get("cue_card") if isinstance(payload.get("cue_card"), dict) else {}
    bullets = _strings(cue.get("bullets"), 6)
    prep = teaching.get("prep_plan") if isinstance(teaching.get("prep_plan"), dict) else {}

    note_grid: list[dict[str, Any]] = []
    for cell in _dicts(prep.get("note_grid")):
        try:
            index = int(cell.get("bullet_index"))
        except (TypeError, ValueError):
            index = len(note_grid)
        note_grid.append(
            {
                "bullet_index": index,
                "bullet": bullets[index] if 0 <= index < len(bullets) else None,
                "cell": _text(cell.get("cell"), 40),
            }
        )

    idea_prompt = _text(prep.get("idea_prompt"))
    return {
        "card_id": card.id,
        "topic": _text(payload.get("topic")) or card.title,
        "band_move": _text(teaching.get("band_move")),
        "cue_card": {
            "topic": _text(cue.get("topic"), 600),
            "bullets": bullets,
            "rounding_off": _strings(cue.get("rounding_off"), 4),
        },
        "prep": {
            "seconds": 60,
            "idea_prompt": idea_prompt,
            "note_grid_example": note_grid,
            "cell_char_limit": 40,
            # The banner script: phrases not sentences, then one read-through.
            "cues": [
                {"at_s": 0, "remaining_s": 60, "banner": idea_prompt},
                {"at_s": 15, "remaining_s": 45, "banner": "Now note, don't write."},
                {
                    "at_s": 50,
                    "remaining_s": 10,
                    "banner": "Read your grid once, top to bottom.",
                },
            ],
        },
        "time_plan": _dicts(teaching.get("time_plan")),
        "recovery_moves": sorted(
            _dicts(teaching.get("recovery_moves")),
            key=lambda move: move.get("rung") if isinstance(move.get("rung"), int) else 99,
        ),
        "target_language": [
            f for f in _strings(teaching.get("target_language"), 6) if f in FUNCTIONS
        ],
        "examiner_note": _text(teaching.get("examiner_note")),
        "post_turn": {
            "trap": _text(prep.get("trap")),
            "transfer_drill": _text(teaching.get("transfer_drill")),
        },
    }


def part1_questions(payload: dict[str, Any], teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Each Part 1 question joined to its own teaching note (F7).

    ``questions`` stays a flat array of strings on disk because the examiner TTS speaks
    it; the notes live in a parallel array keyed by ``q_index``, and this is where the
    two are put back together.
    """
    questions = [str(q) for q in (payload.get("questions") or [])]
    notes: dict[int, dict[str, Any]] = {}
    for note in _dicts(teaching.get("questions")):
        try:
            notes[int(note.get("q_index"))] = note
        except (TypeError, ValueError):
            continue
    out: list[dict[str, Any]] = []
    for index, question in enumerate(questions):
        note = notes.get(index, {})
        error = note.get("common_error")
        out.append(
            {
                "q_index": index,
                "question": question,
                "angle": _text(note.get("angle")),
                "answer_shape": _text(note.get("answer_shape")),
                "extend_move": _text(note.get("extend_move")),
                "probe": _text(note.get("probe")),
                "common_error": _error(error) if isinstance(error, dict) else None,
            }
        )
    return out


def part3_themes(payload: dict[str, Any], _teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Part 3 themes with each question joined to its note, plus the sparring fields."""
    out: list[dict[str, Any]] = []
    for theme in _dicts(payload.get("part3_themes")):
        questions = [str(q) for q in (theme.get("questions") or [])]
        notes: dict[int, dict[str, Any]] = {}
        for note in _dicts(theme.get("question_notes")):
            try:
                notes[int(note.get("q_index"))] = note
            except (TypeError, ValueError):
                continue
        ladder = theme.get("abstraction_ladder")
        out.append(
            {
                "title": _text(theme.get("title")),
                "counterpoint": _text(theme.get("counterpoint")),
                "counter_probe": _text(theme.get("counter_probe")),
                "concession_frame": _text(theme.get("concession_frame")),
                "target_functions": [
                    f for f in _strings(theme.get("target_functions"), 4) if f in FUNCTIONS
                ],
                "abstraction_ladder": ladder if isinstance(ladder, dict) else None,
                "questions": [
                    {
                        "q_index": index,
                        "question": question,
                        "move": _text(notes.get(index, {}).get("move")),
                        "archetype": _text(notes.get(index, {}).get("archetype")),
                        "answer_shape": _text(notes.get(index, {}).get("answer_shape")),
                        "probe": _text(notes.get(index, {}).get("probe")),
                        "watch_out": _text(notes.get(index, {}).get("watch_out")),
                    }
                    for index, question in enumerate(questions)
                ],
            }
        )
    return out


# --------------------------------------------------------------------------------------
# The whole teaching payload
# --------------------------------------------------------------------------------------


def _targeted_functions(card: Any, teaching: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    if card.part == 2:
        return [f for f in _strings(teaching.get("target_language"), 6) if f in FUNCTIONS]
    if card.part == 3:
        wanted: list[str] = []
        for theme in _dicts(payload.get("part3_themes")):
            for function in _strings(theme.get("target_functions"), 4):
                if function in FUNCTIONS and function not in wanted:
                    wanted.append(function)
        return wanted
    return []


def teaching_payload(session: Session, card: m.SpeakingCard, *, unlocked: bool) -> dict[str, Any]:
    """Everything the coach may show for one card. The **only** assembler of this shape.

    ``unlocked`` comes from :func:`gate_state` and nowhere else. When it is false the
    three model answers, the swap slots and the chunking drill are absent — not
    truncated, not summarised, absent — while the band ladder's *existence* is still
    advertised through ``model_answer_bands`` so the UI can render a locked tab.
    """
    payload = payload_of(card)
    teaching = dict(payload.get("teaching") or {})
    set_row = session.get(m.CardSet, card.card_set_id) if card.card_set_id else None
    set_payload = payload_of(set_row)
    answers = model_answers(card)

    try:
        schema_version = int(payload.get("schema_version") or 1)
    except (TypeError, ValueError):
        schema_version = 1

    return {
        "card_id": card.id,
        "part": card.part,
        "card_set_id": card.card_set_id,
        "topic_id": card.topic_id,
        "topic": _text(payload.get("topic"), 600) or card.title,
        "title": card.title,
        "difficulty": card.difficulty,
        "schema_version": schema_version,
        "tags": _strings(loads(card.tags_json, []), 12),
        "teaching_available": bool(teaching) or bool(set_payload.get("language_bank")),
        "set": _set_header(set_row, set_payload),
        "band_move": _text(teaching.get("band_move")),
        "tense_focus": _text(teaching.get("tense_focus")),
        "examiner_note": _text(teaching.get("examiner_note")),
        "bridge": _text(teaching.get("bridge")),
        "transfer_drill": _text(teaching.get("transfer_drill")),
        "functional_language": functional_language(
            set_payload, _targeted_functions(card, teaching, payload)
        ),
        "vocabulary": vocabulary_items(set_payload),
        "structure_plan": structure_plan(card, teaching),
        "questions": part1_questions(payload, teaching) if card.part == 1 else None,
        "themes": part3_themes(payload, teaching) if card.part == 3 else None,
        "common_errors": common_errors(card, teaching),
        "pronunciation_focus": pronunciation_focus(teaching, unlocked=unlocked),
        # Round 2's rung notes (``from_5_to_6`` … ``from_8_to_9``), one sentence each.
        # Deliberately NOT gated: a note saying "add three details, you stopped at 70
        # seconds" is advice about the learner's own answer, not a script to memorise.
        "ladder_note": _ladder_note(teaching),
        # ---- gated ----------------------------------------------------------------
        "model_answer_bands": [b for b in (_band_of(a) for a in answers) if b is not None],
        "model_answers": answers if unlocked else [],
        "swap_slots": _dicts(teaching.get("swap_slots")) if unlocked else [],
    }


# --------------------------------------------------------------------------------------
# Language bank across the pack (F4)
# --------------------------------------------------------------------------------------


def normalise_topic(topic: str | None) -> str | None:
    """Accept ``environment`` or ``topic_environment`` — both name the same topic row."""
    value = (topic or "").strip().lower()
    if not value:
        return None
    return value if value.startswith("topic_") else f"topic_{value}"


def language_bank(
    session: Session,
    *,
    function: str | None = None,
    topic: str | None = None,
    card_set_id: str | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Every functional-language entry in the pack, filterable by function and topic."""
    wanted = (function or "").strip().lower() or None
    if wanted is not None and wanted not in FUNCTIONS:
        raise ApiError(
            422,
            "validation_error",
            f"function must be one of {', '.join(FUNCTIONS)}",
        )

    stmt = select(m.CardSet).where(m.CardSet.retired == 0).order_by(m.CardSet.id)
    topic_id = normalise_topic(topic)
    if topic_id:
        stmt = stmt.where(m.CardSet.topic_id == topic_id)
    if card_set_id:
        stmt = stmt.where(m.CardSet.id == card_set_id)

    items: list[dict[str, Any]] = []
    facets: dict[str, int] = {name: 0 for name in FUNCTIONS}
    sets_with_bank = 0
    for row in session.execute(stmt).scalars().all():
        set_payload = payload_of(row)
        entries = bank_functions(set_payload)
        if not entries:
            continue
        sets_with_bank += 1
        warning = bank_warning(set_payload)
        for entry in entries:
            facets[entry["function"]] += 1
            if wanted and entry["function"] != wanted:
                continue
            if len(items) >= limit:
                continue
            items.append(
                {
                    **entry,
                    "card_set_id": row.id,
                    "card_set_title": row.title,
                    "topic_id": row.topic_id,
                    "difficulty": _text(set_payload.get("difficulty")),
                    "tags": _strings(set_payload.get("tags"), 8),
                    "set_warning": warning,
                }
            )
    return {
        "items": items,
        "next_cursor": None,
        "count": len(items),
        "sets": sets_with_bank,
        "facets": {name: count for name, count in facets.items() if count},
        "functions": list(FUNCTIONS),
        "filters": {"function": wanted, "topic_id": topic_id, "card_set_id": card_set_id},
    }


# --------------------------------------------------------------------------------------
# Vocabulary (F4) and the push into the suggestion inbox
# --------------------------------------------------------------------------------------

#: DESIGN's `type` → the vocab bank's `pos` (08 §3.1). ``word`` is left unmapped so the
#: bank's own POS resolution runs instead of guessing a part of speech we do not know.
TYPE_TO_POS: dict[str, str | None] = {
    "collocation": "collocation",
    "chunk": "phrase",
    "idiom": "phrase",
    "phrasal_verb": "verb",
    "word": None,
}

#: Topic ids the pack uses → the vocab bank's closed tag list (routes/vocab.TOPIC_TAGS).
TOPIC_ID_TO_TAG: dict[str, str] = {
    "topic_environment": "environment",
    "topic_education": "education",
    "topic_technology": "technology",
    "topic_health": "health",
    "topic_globalisation": "globalisation",
    "topic_urbanisation": "urbanisation-housing",
    "topic_work": "work-careers",
    "topic_media": "media-advertising",
    "topic_culture": "art-culture",
    "topic_transport": "transport",
    "topic_crime": "crime-law",
    "topic_tourism": "travel-tourism",
    "topic_family": "family-relationships",
    "topic_science": "science-research",
    "topic_economy": "money-economy",
    "topic_food": "food-diet",
    "topic_sport": "sport-fitness",
    "topic_housing": "urbanisation-housing",
    "topic_communication": "language-communication",
    "topic_money": "money-economy",
}


def vocabulary_for_set(session: Session, card_set_id: str) -> dict[str, Any]:
    row = get_card_set(session, card_set_id)
    set_payload = payload_of(row)
    items = vocabulary_items(set_payload)
    return {
        "card_set_id": row.id,
        "card_set_title": row.title,
        "topic_id": row.topic_id,
        "topic_tag": TOPIC_ID_TO_TAG.get(row.topic_id or ""),
        "items": items,
        "count": len(items),
        # A chunk is not learned until it has been spoken about the learner's own life,
        # so these graduate into the SRS as production exercises, never as flip cards.
        "srs_exercises": ["use-in-sentence", "speaking-drill"],
    }


def suggestion_payloads(
    items: list[dict[str, Any]],
    *,
    card_set_id: str,
    topic_id: str | None,
    wanted: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Map pack vocabulary onto the vocab ingest shape (``IngestItem`` kwargs).

    Deliberately returns plain dicts: the HTTP-layer reuse of
    ``POST /api/v1/vocab/suggestions`` belongs to the route module, and this package
    stays out of the ingest pipeline entirely.
    """
    selected = {w.strip().lower() for w in (wanted or []) if str(w).strip()}
    tag = TOPIC_ID_TO_TAG.get(topic_id or "")
    out: list[dict[str, Any]] = []
    for item in items:
        term = item["item"]
        if selected and term.strip().lower() not in selected:
            continue
        kind = str(item.get("type") or "word").strip().lower()
        example = item.get("example")
        out.append(
            {
                "term": term,
                "pos": TYPE_TO_POS.get(kind),
                "is_phrase": kind != "word" or " " in term,
                "definition": item.get("meaning"),
                "cefr_level": item.get("cefr"),
                "sentence_context": example,
                "example_sentences": [example] if example else [],
                "topic_tags": [tag] if tag else [],
                "source": {
                    "kind": "speaking",
                    "item_id": card_set_id,
                    "detail": f"language bank · {card_set_id}",
                },
            }
        )
    return out


def unknown_terms(items: list[dict[str, Any]], wanted: list[str]) -> list[str]:
    """Requested terms this set does not carry — a typo should not silently ingest less."""
    have = {item["item"].strip().lower() for item in items}
    return [w for w in wanted if str(w).strip().lower() not in have]


# --------------------------------------------------------------------------------------
# Compare (F1) — the learner's attempt against the model at a chosen band
# --------------------------------------------------------------------------------------

_WORD_RE = re.compile(r"[a-z']+")

#: Function words carry no evidence that a frame was used, so they are ignored when
#: deciding whether the learner reached for one.
_STOPWORD_TEXT = """
    a an and are as at be been but by can could did do does for from had has have he her
    him his how i if in into is it its me my not of on or our out she so some than that
    the their them then there these they this to too us was we were what when which who
    will with would you your
    it's i'm i've i'd he's she's that's there's they're you're we're
    don't didn't doesn't wasn't weren't isn't aren't hasn't haven't hadn't
    can't couldn't wouldn't shouldn't won't
"""
STOPWORDS = frozenset(_STOPWORD_TEXT.split())


def signature_tokens(frame: str) -> list[str]:
    """The content words that make a frame recognisable when it is spoken."""
    return [
        token
        for token in _WORD_RE.findall(frame.lower())
        if len(token) >= 3 and token not in STOPWORDS
    ]


def unused_language(transcript: str, functions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Frames the set offered that the learner's transcript shows no sign of reaching for.

    Computed here rather than asked of the model: "which of these did I not use" is a
    string question, and a string question answered by an LLM is a string question
    answered unreliably. The model's job is only to say *where* an unused frame fits.
    """
    spoken = set(_WORD_RE.findall(transcript.lower()))
    out: list[dict[str, Any]] = []
    for entry in functions:
        for frame in entry.get("frames") or []:
            tokens = signature_tokens(frame["frame"])
            if tokens and all(token in spoken for token in tokens):
                continue  # they reached for this one
            out.append(
                {
                    "function": entry["function"],
                    "frame": frame["frame"],
                    "slot_hint": frame.get("slot_hint"),
                    "grammar": entry.get("grammar"),
                    "where_it_fits": None,
                }
            )
    return out


def compare_context(session: Session, card: m.SpeakingCard, band_target: int) -> dict[str, Any]:
    """Everything the comparison is allowed to reason from — this card, nothing generic."""
    teaching = teaching_of(card)
    answers = model_answers(card)
    if not answers:
        raise ApiError(
            422,
            "validation_error",
            f"card {card.id!r} has no model answers to compare against — it predates the "
            "teaching payload",
        )
    answer = model_answer_at(card, band_target)
    if answer is None:
        available = ", ".join(str(_band_of(a)) for a in answers)
        raise ApiError(
            422,
            "validation_error",
            f"this card has no band-{band_target} model answer (available: {available})",
        )
    set_payload = payload_of(
        session.get(m.CardSet, card.card_set_id) if card.card_set_id else None
    )
    return {
        "card": card,
        "topic": _text(payload_of(card).get("topic"), 600) or card.title,
        "band_target": band_target,
        "answer": answer,
        "functions": bank_functions(set_payload),
        "watchlist": common_errors(card, teaching),
        "band_move": _text(teaching.get("band_move")),
        "transfer_drill": _text(teaching.get("transfer_drill")),
        "time_plan": _dicts(teaching.get("time_plan")),
    }


def _criterion_points(answer: dict[str, Any]) -> list[dict[str, Any]]:
    """The authored per-criterion account of what this band's rendering does.

    Bands 7 and 8 carry ``what_lifts_it`` (against the band below). Band 6 carries
    ``what_caps_it`` instead — for a learner aiming at 6 the useful comparison is the
    ``move`` annotations, the things it does right.
    """
    out: list[dict[str, Any]] = []
    for entry in _dicts(answer.get("what_lifts_it")):
        criterion = str(entry.get("criterion") or "").strip().upper()
        point = _text(entry.get("point"))
        if criterion in CRITERIA and point:
            out.append({"criterion": criterion, "point": point})
    if out:
        return out
    for note in _dicts(answer.get("annotations")):
        if note.get("kind") not in ("move", "grammar", "lexis"):
            continue
        criterion = str(note.get("criterion") or "").strip().upper()
        label = _text(note.get("label"))
        why = _text(note.get("why"))
        if criterion in CRITERIA and (label or why):
            out.append(
                {"criterion": criterion, "point": " — ".join(p for p in (label, why) if p)}
            )
    return out[:4]


def baseline_comparison(context: dict[str, Any], transcript: str) -> dict[str, Any]:
    """The comparison this sidecar can make with no model at all.

    It is the offline answer, the mock-mode answer, and the floor under a live call that
    comes back thin: every line of it is authored content for this card, so it is never
    wrong, only less personal than a good LLM pass.
    """
    criteria = [
        {
            "criterion": point["criterion"],
            "model_does": point["point"],
            "you_did": None,
            "try_this": None,
            "source": "card",
        }
        for point in _criterion_points(context["answer"])
    ]

    actions: list[str] = []
    if context.get("band_move"):
        actions.append(context["band_move"])
    watchlist = context.get("watchlist") or []
    if watchlist:
        top = watchlist[0]
        if top.get("right") and top.get("wrong"):
            fix = f"Say \"{top['right']}\", not \"{top['wrong']}\""
            actions.append(f"{fix} — {top['why']}" if top.get("why") else fix)
        elif top.get("right"):
            actions.append(str(top["right"]))
    if context.get("transfer_drill"):
        actions.append(context["transfer_drill"])

    return {
        "criteria": criteria,
        "unused_language": unused_language(transcript, context.get("functions") or []),
        "next_actions": actions[:3],
    }


COMPARE_SYSTEM = """You are an IELTS-style speaking coach reviewing one Part 2 long turn.

You will be given the learner's own transcript and the teaching material authored for \
this exact card: a model answer at the band they are aiming for, the criterion-by-criterion \
account of what that rendering does, the functional frames this topic pulls, and the errors \
this topic provokes.

Rules, in order:
1. Every point must be traceable to the material you are given. No generic advice.
2. Compare BEHAVIOUR, not content. The learner's story is theirs; never suggest they \
borrow the model's facts, names, places or events. Rewrites use THEIR desk, THEIR week, \
THEIR people.
3. Quote the learner in `you_did` — their exact words, short.
4. `try_this` must be a sentence the learner could actually say about THEIR content.
5. If the learner already does what the model does on a criterion, say so plainly rather \
than inventing a fault.
6. Do NOT return a PRON entry. A transcript carries no sound; pronunciation is judged \
from the audio elsewhere. Cohesion and signposting belong to FC, not to PRON.

Return ONLY a JSON object with this shape:
{
  "criteria": [
    {"criterion": "FC" | "LR" | "GRA",
     "model_does": "what the model does here, max 25 words",
     "you_did": "what the learner did instead, quoting them, max 25 words",
     "try_this": "one sentence in the learner's own content, max 25 words"}
  ],
  "unused_language": [
    {"frame": "one of the frames given, copied exactly",
     "where_it_fits": "the moment in THE LEARNER'S OWN answer it would have gone, \
naming what they were talking about there, max 15 words"}
  ],
  "next_actions": ["2 or 3 imperative actions, each naming one concrete thing to do"]
}"""


def build_compare_messages(
    context: dict[str, Any], transcript: str, unused: list[dict[str, Any]]
) -> list[dict[str, str]]:
    """The compare prompt, grounded in this card's own teaching payload."""
    answer = context["answer"]
    lines: list[str] = [
        f"CARD: {context['topic']}",
        f"TARGET BAND: {context['band_target']}",
        "",
        (
            f"MODEL ANSWER AT BAND {context['band_target']}"
            f" ({_text(answer.get('label')) or 'one way to say it'}):"
        ),
        str(answer.get("transcript") or "").strip(),
        "",
        "WHAT THIS RENDERING DOES, BY CRITERION:",
    ]
    points = _criterion_points(answer)
    lines += [f"- {p['criterion']}: {p['point']}" for p in points] or ["- (not annotated)"]

    if context.get("band_move"):
        lines += ["", f"THE ONE MOVE THIS CARD TEACHES: {context['band_move']}"]

    watchlist = context.get("watchlist") or []
    if watchlist:
        lines += ["", "ERRORS THIS TOPIC PROVOKES:"]
        lines += [
            f"- {w.get('pattern') or w.get('criterion') or 'error'}: "
            f"\"{w.get('wrong')}\" → \"{w.get('right')}\" ({w.get('why')})"
            for w in watchlist[:3]
        ]

    lines += ["", "THE LEARNER'S ANSWER:", transcript.strip()]

    # Last, so the learner's own answer is the freshest thing in context when the model
    # is asked where each unused frame would have gone in *their* answer.
    if unused:
        lines += [
            "",
            (
                "FRAMES THIS TOPIC OFFERS THAT THE LEARNER DID NOT REACH FOR "
                "(say where each one fits in THE LEARNER'S ANSWER above, not in the model):"
            ),
        ]
        lines += [
            f"- [{item['function']}] {item['frame']}"
            + (f" (slot: {item['slot_hint']})" if item.get("slot_hint") else "")
            for item in unused[:6]
        ]
    return [
        {"role": "system", "content": COMPARE_SYSTEM},
        {"role": "user", "content": "\n".join(lines)},
    ]


def normalize_comparison(
    parsed: dict[str, Any], baseline: dict[str, Any]
) -> dict[str, Any]:
    """Merge a model response over the deterministic baseline.

    The model may return nothing usable — in mock mode it returns a fixture that knows
    nothing about this card — so every branch here falls back to authored content rather
    than to an empty screen.
    """
    parsed = parsed if isinstance(parsed, dict) else {}

    criteria: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in _dicts(parsed.get("criteria")):
        criterion = str(entry.get("criterion") or "").strip().upper()
        model_does = _text(entry.get("model_does"), 300)
        if criterion not in CRITERIA or not model_does or criterion in seen:
            continue
        seen.add(criterion)
        criteria.append(
            {
                "criterion": criterion,
                "model_does": model_does,
                "you_did": _text(entry.get("you_did"), 300),
                "try_this": _text(entry.get("try_this"), 300),
                "source": "model",
            }
        )
    # Authored points the model skipped are still true; keep them, ordered FC→LR→GRA→PRON.
    for entry in baseline["criteria"]:
        if entry["criterion"] not in seen:
            criteria.append(entry)
            seen.add(entry["criterion"])
    criteria.sort(key=lambda e: CRITERIA.index(e["criterion"]))

    # "Which frames went unused" is decided by string matching, not by the model; the
    # model only annotates where each one would have fitted.
    fitted: dict[str, str] = {}
    for entry in _dicts(parsed.get("unused_language")):
        frame = _text(entry.get("frame"), 300)
        where = _text(entry.get("where_it_fits"), 200)
        if frame and where:
            fitted[frame.strip().lower()] = where
    unused = [
        {**item, "where_it_fits": fitted.get(item["frame"].strip().lower())}
        for item in baseline["unused_language"]
    ]

    actions: list[str] = []
    for action in _strings(parsed.get("next_actions"), 6):
        if action not in actions:
            actions.append(action)
    if len(actions) < 2:
        for action in baseline["next_actions"]:
            if action not in actions:
                actions.append(action)

    return {
        "criteria": criteria,
        "unused_language": unused,
        "next_actions": actions[:3],
        "grounded": bool(criteria),
    }


def session_transcript_text(session: Session, session_id: str, part: int | None = None) -> str:
    """The learner's own words from a finished session, for the compare screen."""
    row = session.get(m.SpeakingSession, session_id)
    if row is None:
        raise ApiError(404, "not_found", f"no speaking session {session_id!r}")
    said: list[str] = []
    for turn in _turns_of(row):
        if turn.get("role") != "user":
            continue
        if part is not None and turn.get("part") not in (None, part):
            continue
        text = str(turn.get("text") or "").strip()
        if text:
            said.append(text)
    return " ".join(said)


async def compare_answer(
    session: Session,
    card: m.SpeakingCard,
    transcript: str,
    band_target: int,
) -> dict[str, Any]:
    """One structured comparison of the learner's turn against the model at ``band_target``."""
    from bandready.providers.llm import chat_json

    text = (transcript or "").strip()
    if len(text.split()) < MIN_COMPARE_WORDS:
        raise ApiError(
            422,
            "validation_error",
            "the comparison needs the learner's own words — record an attempt first",
        )
    if card.part != 2:
        raise ApiError(
            422,
            "validation_error",
            "compare runs on the Part 2 long turn, which is where the band ladder lives",
        )

    context = compare_context(session, card, band_target)
    baseline = baseline_comparison(context, text)
    messages = build_compare_messages(context, text, baseline["unused_language"])

    try:
        parsed = await chat_json(messages, mock_kind="speaking_compare", temperature=0.3)
    except ApiError as exc:
        # Offline, no key, a provider outage: the authored comparison still stands.
        _log.info("compare fell back to the authored baseline: %s", exc.detail)
        parsed = {}

    result = normalize_comparison(parsed, baseline)
    answer = context["answer"]
    meta = parsed.get("_meta") if isinstance(parsed.get("_meta"), dict) else {}
    return {
        "card_id": card.id,
        "card_set_id": card.card_set_id,
        "topic": context["topic"],
        "band_target": band_target,
        "your_words": len(text.split()),
        "model_answer": {
            "band_target": band_target,
            "label": _text(answer.get("label")),
            "approx_seconds": answer.get("approx_seconds"),
            "transcript": str(answer.get("transcript") or ""),
            "what_lifts_it": _dicts(answer.get("what_lifts_it")),
            "what_caps_it": _dicts(answer.get("what_caps_it")),
            "words": len(str(answer.get("transcript") or "").split()),
        },
        "criteria": result["criteria"],
        "unused_language": result["unused_language"],
        "next_actions": result["next_actions"],
        "transfer_drill": context.get("transfer_drill"),
        "error_watchlist": context.get("watchlist") or [],
        "_meta": {"model_id": meta.get("model_id"), "grounded": result["grounded"]},
    }
