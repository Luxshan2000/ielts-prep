"""Reading and shaping the writing pack's teaching payload (content DESIGN.md §1–§5).

Two layers ship on every authored writing prompt. The **exam** layer — ``prompt_text``,
``chart_spec``, ``letter_bullets`` — is what the candidate is given, and it is already
served by ``routes/writing.py``. The **teaching** layer lives in
``writing_prompts.teaching_json`` and is what the *coach* is allowed to show. This module
is the read side of the teaching layer, and the only place that decides what may be shown.

One rule outranks everything else in this file:

    **A model answer is never returned to a learner who has not written yet.**

A model read before the attempt is a template to memorise, and memorised language is
precisely what the band descriptors decline to credit (content DESIGN §9 F1).
:func:`gate_state` is the only place that decides, :func:`teaching_payload` is the only
place that assembles the response, and the gate covers every field that carries model
wording — the three model answers, the four-rung sentence ladder (whose 6/7/8 rungs are
lifted from those answers), the swap slots (whose spans are verbatim substrings of the
band-7 text), the Academic Task 1 overview brief (which *is* the answer's shape, DESIGN
§9 F3) and ``plan.trap``, which DESIGN §1.2 says is shown after submit and never before.

The second rule lives in :mod:`bandready.writing.mock` and is enforced here: while a
60-minute mock is open, the coach is shut for **every** prompt, including one the learner
attempted and legitimately unlocked last week. A mock you can look things up during
measures your reading, not your writing.

Everything here is absent-by-default. The sixteen original prompts shipped with no
teaching payload at all, and the ``teaching_json`` column itself is a prerequisite this
package does not own (content DESIGN §0.3), so every accessor returns an empty structure
rather than raising: a payload-free prompt renders as "no teaching material for this
prompt yet" instead of a 500.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy import text as sa_text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.scoring import writing as scoring
from bandready.scoring.rubrics import writing_criterion_labels
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.writing.coach")

#: The closed functional-move enum the app renders the same labels for (DESIGN §1.5).
MOVES: tuple[str, ...] = (
    "describing_trend",
    "comparing",
    "grouping",
    "sequencing",
    "locating",
    "hedging",
    "conceding",
    "exemplifying",
    "evaluating",
    "proposing",
    "requesting",
    "apologising",
    "referencing",
)

#: Writing's four criteria, lowercase, exactly as ``scoring/rubrics.py`` names them.
#: There is no ``TR`` code in this codebase — criterion 1 is *labelled* Task Response on
#: ``task2`` and Task Achievement on Task 1, but the code is ``ta`` in both.
CRITERIA: tuple[str, ...] = ("ta", "cc", "lr", "gra")

#: The bands a model answer is authored at (DESIGN §5.1). Deliberately three, not five:
#: band 5 is served by :data:`LADDER_BANDS` at a twentieth of the authoring cost, and
#: band 9 is not authored at all because the published scale gives nothing to author
#: against.
BANDS: tuple[int, ...] = (6, 7, 8)
DEFAULT_BAND = 7

#: The sentence ladder's four rungs (DESIGN §5.2) — this is where band 5 lives.
LADDER_BANDS: tuple[int, ...] = (5, 6, 7, 8)

#: What the ladder's steps consist of, in the module's own words (DESIGN §5.2, R4 §5).
LADDER_STEPS: dict[str, str] = {
    "5_to_6": "accuracy",
    "6_to_7": "specificity and flexible structure",
    "7_to_8": "density of relevant detail and reader consideration",
}

#: Fields withheld until the learner has submitted an attempt on the prompt. Every one of
#: them either *is* model wording or hands over the shape of the answer before it is
#: written, so they travel together.
GATED_FIELDS: tuple[str, ...] = (
    "model_answers",
    "sentence_ladder",
    "swap_slots",
    "plan.trap",
    "overview_brief.must_capture",
    "overview_brief.model_overview",
    "overview_brief.weak_overview",
    "overview_brief.group_as",
    "overview_brief.must_report",
    "overview_brief.omit",
    "overview_brief.phases",
)

LOCK_MESSAGE = (
    "Write an answer to this prompt first. A model read before you write becomes a "
    "template, and a template is the one thing the band descriptors will not credit you "
    "for."
)


#: Words in a submitted answer before it counts as an attempt on the prompt. This is the
#: evaluator's own hard floor (``scoring.thresholds()['hard_floor_words']``): anything
#: shorter is refused evaluation, so it cannot have earned the model either.
MIN_ATTEMPT_WORDS = 50

#: Enough of the learner's own script for a comparison to say anything true. Lower than
#: the attempt floor on purpose — a comparison may be run against a partial draft.
MIN_COMPARE_WORDS = 30


def redact_gated(teaching: Any) -> dict[str, Any] | None:
    """``teaching_json`` with every :data:`GATED_FIELDS` path removed.

    ``routes/writing.py`` serves the raw payload on ``GET /writing/prompts`` and
    ``/prompts/{id}`` so the coach can render the ungated two-thirds — the plan, the
    structure, the language bank, the watchlist — without a second round trip. Those
    endpoints know nothing about the learner's history and are also what the *picker*
    lists, so a hundred prompts' worth of model answers would otherwise cross the wire
    to somebody who has written nothing. That would make the gate a piece of client-side
    decoration, and a gate you can defeat with the network tab is not a gate.

    The gated fields therefore leave through exactly one door:
    ``GET /writing/coach/prompts/{id}/teaching``, which asks :func:`gate_state` first.
    """
    if not isinstance(teaching, dict):
        return None
    out = dict(teaching)
    for path in GATED_FIELDS:
        head, _, tail = path.partition(".")
        if not tail:
            out.pop(head, None)
            continue
        parent = out.get(head)
        if isinstance(parent, dict) and tail in parent:
            child = dict(parent)
            child.pop(tail, None)
            out[head] = child
    return out


# --------------------------------------------------------------------------------------
# JSON column helpers
# --------------------------------------------------------------------------------------


def loads(raw: Any, fallback: Any) -> Any:
    """Parse a ``*_json`` column that may already be decoded, never raising."""
    if raw is None:
        return fallback
    if isinstance(raw, type(fallback)) and not isinstance(raw, str):
        return raw
    if isinstance(raw, str):
        if not raw.strip():
            return fallback
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            return fallback
        return value if isinstance(value, type(fallback)) else fallback
    return fallback


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


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _criterion(value: Any) -> str | None:
    code = str(value or "").strip().lower()
    return code if code in CRITERIA else None


# --------------------------------------------------------------------------------------
# Row lookup and the teaching column
# --------------------------------------------------------------------------------------


def get_prompt(session: Session, prompt_id: str) -> m.WritingPrompt:
    prompt = session.get(m.WritingPrompt, prompt_id)
    if prompt is None or prompt.retired:
        raise ApiError(404, "not_found", f"no writing prompt {prompt_id!r}")
    return prompt


#: Engines already known to carry ``writing_prompts.teaching_json``. Only positives are
#: cached: a test (or a migration) may add the column mid-process, and a false negative
#: that stuck would hide the entire teaching layer until restart.
_HAS_TEACHING: set[str] = set()


def has_teaching_column(session: Session) -> bool:
    """Whether ``writing_prompts.teaching_json`` exists on this database yet.

    Content DESIGN §0.3 makes the column a hard prerequisite for any of the authored
    payload being visible, and it is owned by the schema/loader agent rather than by this
    package. Until it lands, every accessor here returns empty rather than exploding —
    which is also exactly the behaviour the sixteen payload-free original prompts need.
    """
    try:
        bind = session.get_bind()
        key = str(getattr(bind, "url", bind))
    except Exception:  # noqa: BLE001 — a detached session must not break the coach
        key = ""
    if key and key in _HAS_TEACHING:
        return True
    try:
        rows = session.execute(sa_text("PRAGMA table_info(writing_prompts)")).all()
    except SQLAlchemyError:  # pragma: no cover — non-SQLite bind
        return hasattr(m.WritingPrompt, "teaching_json")
    present = any(str(row[1]) == "teaching_json" for row in rows)
    if present and key:
        _HAS_TEACHING.add(key)
    return present


def teaching_of(session: Session, prompt: Any) -> dict[str, Any]:
    """The authored ``teaching_json`` for one prompt, as a dict. Empty when absent."""
    if prompt is None:
        return {}
    raw = getattr(prompt, "teaching_json", None)
    if raw is None and not hasattr(m.WritingPrompt, "teaching_json"):
        # The ORM model does not declare the column yet (DESIGN §0.3). Read it directly
        # so authored content is visible the moment the migration lands, with or without
        # a model change.
        if not has_teaching_column(session):
            return {}
        row = session.execute(
            sa_text("SELECT teaching_json FROM writing_prompts WHERE id = :id"),
            {"id": getattr(prompt, "id", None)},
        ).first()
        raw = row[0] if row is not None else None
    return dict(loads(raw, {}))


# --------------------------------------------------------------------------------------
# Model answers
# --------------------------------------------------------------------------------------


def _band_of(answer: dict[str, Any]) -> int | None:
    return _int(answer.get("band_target"))


def model_answers(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Every band rendering the prompt carries, ordered low → high. **Gated**.

    All three say the same thing with the same content; only the language and the density
    of relevant detail differ (DESIGN §5.1). Nothing downstream may assume a count — the
    UI builds its band selector from ``model_answer_bands``, which is exactly the bands
    present here.
    """
    answers = _dicts(teaching.get("model_answers"))
    return sorted(answers, key=lambda a: _band_of(a) or 0)


def model_answer_at(teaching: dict[str, Any], band: int) -> dict[str, Any] | None:
    for answer in model_answers(teaching):
        if _band_of(answer) == band:
            return answer
    return None


def _annotations(answer: dict[str, Any]) -> list[dict[str, Any]]:
    """Span annotations, with the span's offsets resolved once, server-side.

    The UI locates annotations by exact string search (content lint 20). Resolving the
    offsets here means a span that drifted during authoring surfaces as ``start: null``
    instead of as a highlight that silently fails to render.
    """
    text = str(answer.get("text") or "")
    out: list[dict[str, Any]] = []
    for note in _dicts(answer.get("annotations")):
        span = _text(note.get("span"), 600)
        if not span:
            continue
        start = text.find(span)
        out.append(
            {
                "span": span,
                "kind": _text(note.get("kind"), 30),
                "criterion": _criterion(note.get("criterion")),
                "label": _text(note.get("label"), 120),
                "why": _text(note.get("why"), 300),
                "transferable": bool(note.get("transferable")),
                "start": start if start >= 0 else None,
                "end": start + len(span) if start >= 0 else None,
            }
        )
    return out


def _points(value: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(value):
        criterion = _criterion(entry.get("criterion"))
        point = _text(entry.get("point"), 300)
        if criterion and point:
            out.append({"criterion": criterion, "point": point})
    return out


def model_answer_view(answer: dict[str, Any]) -> dict[str, Any]:
    """One model answer as the Compare screen renders it."""
    text = str(answer.get("text") or "")
    return {
        "band_target": _band_of(answer),
        "label": _text(answer.get("label"), 120),
        "word_count": _int(answer.get("word_count")) or len(text.split()),
        "text": text,
        "what_caps_it": _points(answer.get("what_caps_it")),
        "what_lifts_it": _points(answer.get("what_lifts_it")),
        "annotations": _annotations(answer),
    }


def sentence_ladder(teaching: dict[str, Any]) -> dict[str, Any] | None:
    """The four-rung ladder at bands 5–8. **Gated** — rungs 6/7/8 quote the models."""
    raw = teaching.get("sentence_ladder")
    if not isinstance(raw, dict):
        return None
    rungs: list[dict[str, Any]] = []
    for rung in _dicts(raw.get("rungs")):
        band = _int(rung.get("band"))
        text = _text(rung.get("text"), 800)
        if band is None or not text:
            continue
        rungs.append({"band": band, "text": text, "words": len(text.split())})
    rungs.sort(key=lambda r: r["band"])
    if not rungs:
        return None
    return {"idea": _text(raw.get("idea"), 200), "rungs": rungs, "steps": dict(LADDER_STEPS)}


def swap_slots(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The anti-memorisation spans (DESIGN §5.3). **Gated** — they quote the band-7 text."""
    band7 = model_answer_at(teaching, 7) or {}
    text = str(band7.get("text") or "")
    out: list[dict[str, Any]] = []
    for slot in _dicts(teaching.get("swap_slots")):
        span = _text(slot.get("span"), 400)
        if not span:
            continue
        start = text.find(span)
        out.append(
            {
                "span": span,
                "prompt": _text(slot.get("prompt"), 300),
                "start": start if start >= 0 else None,
                "end": start + len(span) if start >= 0 else None,
            }
        )
    return out


# --------------------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Attempt:
    """One submitted attempt that counts as having written on a prompt."""

    attempt_id: str
    status: str
    words: int
    submitted_at: str | None
    mode: str


def find_attempts(
    session: Session, profile_id: str, prompt_id: str, *, limit: int = 5
) -> list[Attempt]:
    """Submitted attempts this learner has made on this prompt, newest first.

    ``status IN ('submitted', 'scored', 'failed')`` is load-bearing, and so is what is
    *not* in it. A draft is not an attempt: a learner who opened the editor, read nothing
    and switched to the Compare tab has not written, and the gate must not open for them.
    A *mock* attempt counts, because by the time the mock has ended they have genuinely
    written the thing under exam conditions. And ``failed`` counts, because it does not
    mean "the learner failed" — ``scoring/writing.py:_record_failure`` sets it when the
    evaluator call itself could not complete. On a machine with no model reachable that is
    the status *every* honest attempt lands in, and locking the coach behind a working LLM
    would punish exactly the offline learner this app is built for.
    """
    stmt = (
        select(m.WritingSubmission)
        .join(m.PracticeSession, m.PracticeSession.id == m.WritingSubmission.id)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.WritingSubmission.prompt_id == prompt_id,
            m.WritingSubmission.status.in_(("submitted", "scored", "failed")),
            m.WritingSubmission.submitted_at.is_not(None),
        )
        .order_by(m.WritingSubmission.id.desc())
    )
    out: list[Attempt] = []
    for row in session.scalars(stmt).all():
        words = int(row.word_count or 0) or scoring.count_words(row.essay_text or "")
        if words < MIN_ATTEMPT_WORDS:
            continue
        out.append(Attempt(row.id, row.status, words, row.submitted_at, row.mode))
        if len(out) >= limit:
            break
    return out


def gate_state(
    session: Session,
    profile_id: str,
    prompt_id: str,
    *,
    attested: bool = False,
) -> dict[str, Any]:
    """Whether the model answers may be returned, and why.

    Three ways this resolves, in priority order:

    1. A mock is open — **shut**, for every prompt, whatever the learner has attempted.
       That is the one property a mock has no value without.
    2. A submitted attempt on this prompt exists — open.
    3. The caller attests the learner has just written one (the editor holds a draft the
       server has not seen submitted yet) — open.
    """
    from bandready.writing import mock as mock_mod

    conditions = mock_mod.exam_conditions(session, profile_id)
    if conditions is not None:
        return mock_mod.locked_gate(conditions)

    attempts = find_attempts(session, profile_id, prompt_id)
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
        "last_attempt_id": attempts[0].attempt_id if attempts else None,
        "last_attempt_words": attempts[0].words if attempts else None,
        "min_attempt_words": MIN_ATTEMPT_WORDS,
        "gated_fields": [] if unlocked else list(GATED_FIELDS),
        "message": None if unlocked else LOCK_MESSAGE,
    }


# --------------------------------------------------------------------------------------
# The payload's parts
# --------------------------------------------------------------------------------------

#: The four phases every ``time_plan`` carries, in order (DESIGN §1.1).
PHASES: tuple[str, ...] = ("decode", "plan", "write", "check")


def time_plan(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The 20 or 40 minutes as four phases, with a running offset for the timer bar.

    ``minutes`` are fixed by task type and are not the author's to change; ``does`` is
    written for this prompt. The offsets are computed here so the editor's segmented bar
    and the phase-boundary banner have one source of truth.
    """
    out: list[dict[str, Any]] = []
    offset = 0
    for entry in _dicts(teaching.get("time_plan")):
        phase = str(entry.get("phase") or "").strip().lower()
        minutes = _int(entry.get("minutes"))
        if phase not in PHASES or minutes is None:
            continue
        out.append(
            {
                "phase": phase,
                "minutes": minutes,
                "does": _text(entry.get("does"), 200),
                "starts_at_s": offset * 60,
                "ends_at_s": (offset + minutes) * 60,
            }
        )
        offset += minutes
    out.sort(key=lambda e: PHASES.index(e["phase"]))
    return out


def plan_lines(teaching: dict[str, Any], *, unlocked: bool) -> dict[str, Any]:
    """The worked plan for this exact prompt (DESIGN §1.2).

    ``notes`` are the scratchpad's **ghost text** and stay note-form on purpose — a plan
    written in prose is a draft the learner will copy. ``trap`` is gated: DESIGN §1.2
    says it is surfaced only in the report, as a check ("most people forget to say what
    did *not* change — you covered it ✓"), never as a warning read while planning.
    """
    raw = teaching.get("plan")
    raw = raw if isinstance(raw, dict) else {}
    lines: list[dict[str, Any]] = []
    for line in _dicts(raw.get("lines")):
        label = _text(line.get("label"), 30)
        if not label:
            continue
        lines.append({"label": label.upper(), "note": _text(line.get("note"), 90)})
    trap = _text(raw.get("trap"), 200)
    return {
        "lines": lines,
        "test": _text(raw.get("test"), 200),
        "trap": trap if unlocked else None,
        "trap_locked": bool(trap) and not unlocked,
    }


def structure_plan(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Paragraph roles with a word budget each (DESIGN §1.3), ordered by paragraph."""
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("structure_plan")):
        para = _int(entry.get("para"))
        role = _text(entry.get("role"), 30)
        if para is None or not role:
            continue
        out.append(
            {
                "para": para,
                "role": role,
                "words": _int(entry.get("words")) or 0,
                "must_do": _text(entry.get("must_do"), 200),
            }
        )
    out.sort(key=lambda e: e["para"])
    return out


def parts_checklist(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The discrete parts of *this* task, each with the question that evidences it.

    The highest-impact field in the payload: an unaddressed part of the task is the
    single largest cause of a capped criterion-1 score, and it is the only failure a
    checklist can eliminate outright (DESIGN §1.4).
    """
    return [
        {
            "index": index,
            "part": _text(entry.get("part"), 140),
            "evidence_question": _text(entry.get("evidence_question"), 200),
        }
        for index, entry in enumerate(_dicts(teaching.get("parts_checklist")))
        if _text(entry.get("part"))
    ]


def _frames(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for frame in _dicts(raw):
        text = _text(frame.get("frame"), 300)
        if not text:
            continue
        out.append(
            {
                "frame": text,
                "slot_hint": _text(frame.get("slot_hint"), 160),
                # Every authored frame carries at least one gap (DESIGN §1.5): a frame
                # with no gap is a sentence, and a sentence is a script.
                "slots": text.count("___"),
            }
        )
    return out


def bank_moves(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """This prompt's functional-language entries, normalised and enum-checked."""
    bank = teaching.get("language_bank")
    bank = bank if isinstance(bank, dict) else {}
    out: list[dict[str, Any]] = []
    for entry in _dicts(bank.get("moves")):
        move = str(entry.get("move") or "").strip().lower()
        frames = _frames(entry.get("frames"))
        if move not in MOVES or not frames:
            continue
        out.append(
            {
                "move": move,
                "why_here": _text(entry.get("why_here"), 160),
                "grammar": _text(entry.get("grammar"), 120),
                "frames": frames,
                # The negative exemplar. Not decoration: the contrast is the teaching,
                # and it is what inoculates against the phrase lists that cause plateaus.
                "avoid": _text(entry.get("avoid"), 300),
            }
        )
    return out


def bank_warning(teaching: dict[str, Any]) -> str | None:
    bank = teaching.get("language_bank")
    return _text(bank.get("warning"), 300) if isinstance(bank, dict) else None


def collocations(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Chunks with their partners and their preposition, never bare words (DESIGN §1.6)."""
    out: list[dict[str, Any]] = []
    for item in _dicts(teaching.get("collocations")):
        chunk = _text(item.get("chunk"), 160)
        if not chunk:
            continue
        out.append(
            {
                "chunk": chunk,
                "example": _text(item.get("example"), 400),
                "cefr": _text(item.get("cefr"), 4),
                "words": len(chunk.split()),
            }
        )
    return out


def upgrade_pairs(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "vague": _text(entry.get("vague"), 300),
            "precise": _text(entry.get("precise"), 300),
            "why": _text(entry.get("why"), 200),
        }
        for entry in _dicts(teaching.get("upgrade_pairs"))
        if _text(entry.get("precise"))
    ]


def target_structures(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The structures this prompt's content pulls, each shipped with its accuracy trap.

    Band 6 already attempts complexity; landing it is the upgrade, which is why no entry
    ever ships without its trap (DESIGN §1.8).
    """
    return [
        {
            "name": _text(entry.get("name"), 80),
            "model": _text(entry.get("model"), 400),
            "trap": _text(entry.get("trap"), 240),
        }
        for entry in _dicts(teaching.get("target_structures"))
        if _text(entry.get("name"))
    ]


def error_watchlist(teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """The two or three errors this prompt's content forces, highest impact first.

    ``rank`` is authored, not inferred: the report surfaces one improvement and index 0
    is the one it gets (DESIGN §1.9).
    """
    return [
        {
            "rank": index,
            "pattern": _text(entry.get("pattern"), 80),
            "wrong": _text(entry.get("wrong"), 400),
            "right": _text(entry.get("right"), 400),
            "why": _text(entry.get("why"), 200),
            "criterion": _criterion(entry.get("criterion")),
        }
        for index, entry in enumerate(_dicts(teaching.get("error_watchlist")))
        if _text(entry.get("pattern")) or _text(entry.get("right"))
    ]


def rewrite_focus(teaching: dict[str, Any]) -> dict[str, Any] | None:
    """The one change that would most raise this script, with a timed retry attached.

    Never gated. It is a behaviour to perform, not a text to copy, and feedback with no
    "try it now" is a note rather than coaching (DESIGN §1.11).
    """
    raw = teaching.get("rewrite_focus")
    if not isinstance(raw, dict):
        return None
    focus = _text(raw.get("focus"), 240)
    if not focus:
        return None
    return {
        "focus": focus,
        "why": _text(raw.get("why"), 300),
        "drill": _text(raw.get("drill"), 300),
    }


# --------------------------------------------------------------------------------------
# The three task-specific briefs
# --------------------------------------------------------------------------------------


def overview_brief(teaching: dict[str, Any], *, unlocked: bool) -> dict[str, Any] | None:
    """Academic Task 1's overview brief (DESIGN §2) — the biggest scoring lever there is.

    Mostly gated, and for a reason DESIGN §9 F3 states outright: the Overview Builder
    asks the learner for *their* two whole-chart statements before anything from this
    brief is shown, then opens the report by putting the two side by side. Handing over
    ``must_capture`` beforehand replaces the exercise with a transcription task, and
    ``phases`` on a process is literally the band-7 overview.

    ``tense`` and ``figure_budget`` stay open — they are rules about how to write, not
    statements about what this chart says.
    """
    raw = teaching.get("overview_brief")
    if not isinstance(raw, dict) or not raw:
        return None
    budget = raw.get("figure_budget")
    budget = budget if isinstance(budget, dict) else {}
    weak = raw.get("weak_overview")
    weak = weak if isinstance(weak, dict) else {}
    group = raw.get("group_as")
    group = group if isinstance(group, dict) else {}

    out: dict[str, Any] = {
        # ---- always available ------------------------------------------------------
        "tense": _text(raw.get("tense"), 200),
        "figure_budget": {
            "min": _int(budget.get("min")),
            "max": _int(budget.get("max")),
        },
        "rule": "The overview carries no figures. Two statements, both true of the whole visual.",
        "locked": not unlocked,
        # ---- gated -----------------------------------------------------------------
        "must_capture": [],
        "model_overview": None,
        "weak_overview": None,
        "group_as": None,
        "must_report": [],
        "omit": [],
        "phases": [],
    }
    if not unlocked:
        return out

    out["must_capture"] = _strings(raw.get("must_capture"), 2)
    out["model_overview"] = _text(raw.get("model_overview"), 500)
    if weak:
        out["weak_overview"] = {
            "text": _text(weak.get("text"), 500),
            "failure": _text(weak.get("failure"), 8),
        }
    if group:
        out["group_as"] = {
            "body1": _text(group.get("body1"), 160),
            "body2": _text(group.get("body2"), 160),
            "why": _text(group.get("why"), 200),
        }
    out["must_report"] = _strings(raw.get("must_report"), 8)
    out["omit"] = _strings(raw.get("omit"), 6)
    out["phases"] = [
        {"name": _text(phase.get("name"), 60), "step_ids": _strings(phase.get("step_ids"), 12)}
        for phase in _dicts(raw.get("phases"))
        if _text(phase.get("name"))
    ]
    return out


def letter_brief(teaching: dict[str, Any]) -> dict[str, Any] | None:
    """General Training Task 1's letter brief (DESIGN §3).

    **Not gated.** Register is inside Task Achievement, not style, and every field here
    describes the *task* — who the recipient is, which greeting the prompt already ends
    with, what each bullet has to do. The learner is given the bullets in the prompt; the
    teaching is what "cover and extend" means for each one, which is the commonest band-6
    ceiling on this task and is invisible to a checklist.
    """
    raw = teaching.get("letter_brief")
    if not isinstance(raw, dict) or not raw:
        return None
    notes: list[dict[str, Any]] = []
    for note in _dicts(raw.get("bullet_notes")):
        index = _int(note.get("bullet_index"))
        if index is None:
            index = len(notes)
        notes.append(
            {
                "bullet_index": index,
                "function": _text(note.get("function"), 120),
                "must_include": _text(note.get("must_include"), 240),
                # The whole point of the field: a *different* sentence that adds
                # something the bullet did not say — a date, an amount, a consequence.
                "extension_move": _text(note.get("extension_move"), 240),
                "tone_note": _text(note.get("tone_note"), 200),
            }
        )
    notes.sort(key=lambda n: n["bullet_index"])
    return {
        "purpose": _text(raw.get("purpose"), 8),
        "purpose_label": _text(raw.get("purpose_label"), 60),
        "register": _text(raw.get("register"), 20),
        "recipient": _text(raw.get("recipient"), 200),
        "greeting": _text(raw.get("greeting"), 120),
        "signoff": _text(raw.get("signoff"), 120),
        "moves": _strings(raw.get("moves"), 8),
        "bullet_notes": notes,
        "register_signals": [
            {
                "signal": _text(sig.get("signal"), 40),
                "do": _text(sig.get("do"), 200),
                "dont": _text(sig.get("dont"), 200),
            }
            for sig in _dicts(raw.get("register_signals"))
            if _text(sig.get("signal"))
        ],
        "drift_watch": _text(raw.get("drift_watch"), 240),
    }


def essay_brief(teaching: dict[str, Any]) -> dict[str, Any] | None:
    """Task 2's essay brief (DESIGN §4).

    **Not gated.** ``idea_bank`` is arguments with mechanisms, not sentences — the point
    of shipping two ideas per side is that the learner practises the *language* rather
    than the ideation, which they cannot do if the bank is hidden until afterwards. No
    ``evidence`` field is ever a statistic: an invented figure is self-defeating and a
    specific unnumbered instance is stronger and faster to write.
    """
    raw = teaching.get("essay_brief")
    if not isinstance(raw, dict) or not raw:
        return None
    drill = raw.get("development_drill")
    drill = drill if isinstance(drill, dict) else {}
    return {
        "question_type": _text(raw.get("question_type"), 80),
        "obligatory_shape": _text(raw.get("obligatory_shape"), 300),
        "axis": _int(raw.get("axis")),
        "axis_label": _text(raw.get("axis_label"), 60),
        "position": _text(raw.get("position"), 300),
        "position_touchpoints": _strings(raw.get("position_touchpoints"), 3),
        "idea_bank": [
            {
                "side": _text(idea.get("side"), 60),
                "claim": _text(idea.get("claim"), 200),
                "mechanism": _text(idea.get("mechanism"), 260),
                "evidence": _text(idea.get("evidence"), 260),
                "consequence": _text(idea.get("consequence"), 200),
            }
            for idea in _dicts(raw.get("idea_bank"))
            if _text(idea.get("claim"))
        ],
        "development_drill": {
            "claim": _text(drill.get("claim"), 200),
            "ask": _text(drill.get("ask"), 260),
        }
        if drill
        else None,
        "memorisation_test": _text(raw.get("memorisation_test"), 260),
    }


# --------------------------------------------------------------------------------------
# The whole teaching payload
# --------------------------------------------------------------------------------------


def prompt_header(prompt: Any, teaching: dict[str, Any]) -> dict[str, Any]:
    meta = scoring.TASKS.get(prompt.task_type, {})
    return {
        "prompt_id": prompt.id,
        "task_type": prompt.task_type,
        "task_label": meta.get("label", prompt.task_type),
        "genre": prompt.genre,
        "topic_id": prompt.topic_id,
        "topic_tags": _strings(loads(prompt.topic_tags, []), 12),
        "difficulty": prompt.difficulty,
        "min_words": meta.get("min_words"),
        "time_limit_s": (int(meta["minutes"]) * 60) if meta.get("minutes") else None,
        "criterion_labels": writing_criterion_labels(prompt.task_type),
        "schema_version": _int(teaching.get("schema_version")) or 1,
        "cluster": _text(teaching.get("cluster"), 60),
    }


def teaching_payload(session: Session, prompt: Any, *, unlocked: bool) -> dict[str, Any]:
    """Everything the coach may show for one prompt. The **only** assembler of this shape.

    ``unlocked`` comes from :func:`gate_state` and nowhere else. When it is false the
    model answers, the sentence ladder, the swap slots, ``plan.trap`` and the Academic
    overview brief's content are **absent** — not truncated, not summarised, absent —
    while the ladder's *existence* is still advertised through ``model_answer_bands`` so
    the UI can render a locked tab rather than an empty one.

    During a mock the question does not arise: the sitting's own empty document is
    returned instead, so no coaching field is ever *computed*, let alone serialised.
    """
    from bandready.writing import mock as mock_mod

    conditions = mock_mod.exam_conditions(session)
    if conditions is not None:
        return mock_mod.locked_teaching_payload(session, prompt, conditions)

    teaching = teaching_of(session, prompt)
    answers = model_answers(teaching)
    structure = structure_plan(teaching)
    ladder = sentence_ladder(teaching)

    return {
        **prompt_header(prompt, teaching),
        "teaching_available": bool(teaching),
        "teaches": _text(teaching.get("teaches"), 240),
        # The one rankable behaviour this prompt trains — the report's headline.
        "band_move": _text(teaching.get("band_move"), 200),
        "exam_note": _text(teaching.get("exam_note"), 300),
        "time_plan": time_plan(teaching),
        "plan": plan_lines(teaching, unlocked=unlocked),
        "structure_plan": structure,
        "word_budget": sum(entry["words"] for entry in structure) or None,
        "parts_checklist": parts_checklist(teaching),
        "language_bank": {"warning": bank_warning(teaching), "moves": bank_moves(teaching)},
        "collocations": collocations(teaching),
        "upgrade_pairs": upgrade_pairs(teaching),
        "target_structures": target_structures(teaching),
        "error_watchlist": error_watchlist(teaching),
        "checklist": _strings(teaching.get("checklist"), 8),
        "rewrite_focus": rewrite_focus(teaching),
        "overview_brief": overview_brief(teaching, unlocked=unlocked),
        "letter_brief": letter_brief(teaching),
        "essay_brief": essay_brief(teaching),
        # ---- gated -------------------------------------------------------------------
        "model_answer_bands": [b for b in (_band_of(a) for a in answers) if b is not None],
        "model_answers": [model_answer_view(a) for a in answers] if unlocked else [],
        "sentence_ladder_bands": [r["band"] for r in (ladder or {}).get("rungs", [])],
        "sentence_ladder": ladder if unlocked else None,
        "swap_slots": swap_slots(teaching) if unlocked else [],
    }


# --------------------------------------------------------------------------------------
# The planning screen (DESIGN §9 F2)
# --------------------------------------------------------------------------------------


def plan_payload(session: Session, prompt: Any, *, unlocked: bool) -> dict[str, Any]:
    """The time plan and the paragraph skeleton, and nothing that would write it for them.

    This is the screen between reading the prompt and opening the editor, so it carries
    the procedure and the budget and stops there: no model answer, no overview content,
    no ``trap``. ``post_submit`` is separated on purpose — the trap is shown *after*, as a
    check, never as something read while planning.
    """
    from bandready.writing import mock as mock_mod

    conditions = mock_mod.exam_conditions(session)
    if conditions is not None:
        raise mock_mod.refusal(conditions)

    teaching = teaching_of(session, prompt)
    if not teaching:
        raise ApiError(
            404,
            "not_found",
            f"writing prompt {prompt.id!r} has no teaching payload — it predates the "
            "teaching layer",
        )
    plan = plan_lines(teaching, unlocked=unlocked)
    structure = structure_plan(teaching)
    phases = time_plan(teaching)
    minutes = sum(entry["minutes"] for entry in phases)

    return {
        **prompt_header(prompt, teaching),
        "teaches": _text(teaching.get("teaches"), 240),
        "band_move": _text(teaching.get("band_move"), 200),
        "time_plan": phases,
        "total_minutes": minutes or None,
        "plan": {"lines": plan["lines"], "test": plan["test"]},
        "structure_plan": structure,
        "word_budget": sum(entry["words"] for entry in structure) or None,
        "parts_checklist": parts_checklist(teaching),
        "target_moves": [entry["move"] for entry in bank_moves(teaching)],
        "checklist": _strings(teaching.get("checklist"), 8),
        # Shown once the answer is in, never before.
        "post_submit": {
            "trap": plan["trap"],
            "trap_locked": plan["trap_locked"],
            "rewrite_focus": rewrite_focus(teaching) if unlocked else None,
        },
    }


# --------------------------------------------------------------------------------------
# Language bank across the pack (DESIGN §9 F5)
# --------------------------------------------------------------------------------------


def _bulk_rows(
    session: Session,
    *,
    task_type: str | None,
    genre: str | None,
    topic_id: str | None,
    prompt_id: str | None,
) -> list[tuple[Any, ...]]:
    """One SELECT over the prompt bank, teaching payload included.

    Deliberately raw SQL: ``teaching_json`` may not be on the ORM model yet (DESIGN
    §0.3), and reading a hundred prompts one ``PRAGMA`` at a time would be silly.
    """
    if not has_teaching_column(session):
        return []
    where = ["retired = 0"]
    params: dict[str, Any] = {}
    if task_type:
        where.append("task_type = :task_type")
        params["task_type"] = task_type
    if genre:
        where.append("genre = :genre")
        params["genre"] = genre
    if topic_id:
        where.append("topic_id = :topic_id")
        params["topic_id"] = topic_id
    if prompt_id:
        where.append("id = :prompt_id")
        params["prompt_id"] = prompt_id
    stmt = sa_text(
        "SELECT id, task_type, genre, topic_id, difficulty, teaching_json "
        f"FROM writing_prompts WHERE {' AND '.join(where)} ORDER BY id"
    )
    return list(session.execute(stmt, params).all())


def normalise_topic(topic: str | None) -> str | None:
    """Accept ``environment`` or ``topic_environment`` — both name the same topic row."""
    value = (topic or "").strip().lower()
    if not value:
        return None
    return value if value.startswith("topic_") else f"topic_{value}"


def language_bank(
    session: Session,
    *,
    move: str | None = None,
    task_type: str | None = None,
    genre: str | None = None,
    topic: str | None = None,
    prompt_id: str | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """Every functional frame in the pack, filterable by move and task type.

    **Never gated by an attempt.** A frame with an open slot is preparation material, not
    a model answer — which is exactly why every authored frame is required to contain a
    ``___``. It *is* closed during a mock, because during a mock nothing is preparation.

    ``facets`` counts every entry that passed the row filters, before the ``move`` filter
    and before ``limit``, so the UI can render a full move selector with counts on it.
    """
    from bandready.writing import mock as mock_mod

    conditions = mock_mod.exam_conditions(session)
    if conditions is not None:
        raise mock_mod.refusal(conditions)

    wanted = (move or "").strip().lower() or None
    if wanted is not None and wanted not in MOVES:
        raise ApiError(
            422, "validation_error", f"move must be one of {', '.join(MOVES)}"
        )
    if task_type and task_type not in scoring.TASK_TYPES:
        raise ApiError(422, "validation_error", f"unknown task_type {task_type!r}")
    topic_id = normalise_topic(topic)

    items: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    facets: dict[str, int] = {name: 0 for name in MOVES}
    prompts_with_bank = 0

    for row_id, row_task, row_genre, row_topic, difficulty, raw in _bulk_rows(
        session,
        task_type=task_type,
        genre=genre,
        topic_id=topic_id,
        prompt_id=prompt_id,
    ):
        teaching = dict(loads(raw, {}))
        if not teaching:
            continue
        entries = bank_moves(teaching)
        if not entries:
            continue
        prompts_with_bank += 1
        warning = bank_warning(teaching)
        origin = {
            "prompt_id": row_id,
            "task_type": row_task,
            "genre": row_genre,
            "topic_id": row_topic,
            "difficulty": difficulty,
        }
        for entry in entries:
            facets[entry["move"]] += 1
            if wanted and entry["move"] != wanted:
                continue
            if len(items) >= limit:
                continue
            items.append({**entry, **origin, "prompt_warning": warning})
        if len(chunks) < limit:
            for chunk in collocations(teaching):
                if len(chunks) >= limit:
                    break
                chunks.append({**chunk, **origin})

    return {
        "items": items,
        "next_cursor": None,
        "count": len(items),
        "prompts": prompts_with_bank,
        "collocations": chunks,
        "facets": {name: count for name, count in facets.items() if count},
        "moves": list(MOVES),
        "task_types": list(scoring.TASK_TYPES),
        "filters": {
            "move": wanted,
            "task_type": task_type,
            "genre": genre,
            "topic_id": topic_id,
            "prompt_id": prompt_id,
        },
    }


# --------------------------------------------------------------------------------------
# Compare (DESIGN §9 F1) — the learner's script against the model at a chosen band
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
    """The content words that make a frame recognisable when it is written.

    The ``___`` gaps contribute nothing, which is the point: what identifies a frame is
    the fixed language around the slot, not what the learner poured into it.
    """
    return [
        token
        for token in _WORD_RE.findall(frame.lower())
        if len(token) >= 3 and token not in STOPWORDS
    ]


def unused_language(script: str, moves: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Frames this prompt offered that the script shows no sign of reaching for.

    Computed here rather than asked of the model: "which of these did I not use" is a
    string question, and a string question answered by an LLM is a string question
    answered unreliably. The model's job is only to say *where* an unused frame fits.
    """
    written = set(_WORD_RE.findall(script.lower()))
    out: list[dict[str, Any]] = []
    for entry in moves:
        for frame in entry.get("frames") or []:
            tokens = signature_tokens(frame["frame"])
            if tokens and all(token in written for token in tokens):
                continue  # they reached for this one
            out.append(
                {
                    "move": entry["move"],
                    "frame": frame["frame"],
                    "slot_hint": frame.get("slot_hint"),
                    "grammar": entry.get("grammar"),
                    "where_it_fits": None,
                }
            )
    return out


def compare_context(
    session: Session, prompt: Any, band_target: int
) -> dict[str, Any]:
    """Everything the comparison may reason from — this prompt's own payload, nothing generic."""
    teaching = teaching_of(session, prompt)
    answers = model_answers(teaching)
    if not answers:
        raise ApiError(
            422,
            "validation_error",
            f"writing prompt {prompt.id!r} has no model answers to compare against — it "
            "predates the teaching payload",
        )
    answer = model_answer_at(teaching, band_target)
    if answer is None:
        available = ", ".join(str(_band_of(a)) for a in answers)
        raise ApiError(
            422,
            "validation_error",
            f"this prompt has no band-{band_target} model answer (available: {available})",
        )
    return {
        "prompt": prompt,
        "teaching": teaching,
        "band_target": band_target,
        "answer": answer,
        "moves": bank_moves(teaching),
        "watchlist": error_watchlist(teaching),
        "parts": parts_checklist(teaching),
        "band_move": _text(teaching.get("band_move"), 200),
        "rewrite_focus": rewrite_focus(teaching),
        "criterion_labels": writing_criterion_labels(prompt.task_type),
    }


def _criterion_points(answer: dict[str, Any]) -> list[dict[str, Any]]:
    """The authored per-criterion account of what this band's rendering does.

    Bands 7 and 8 carry ``what_lifts_it`` (against the band below). Band 6 carries
    ``what_caps_it`` instead — for a learner aiming at 6 the useful comparison is the
    non-``avoid`` annotations, the things it does right.
    """
    lifts = _points(answer.get("what_lifts_it"))
    if lifts:
        return lifts[:4]
    caps = _points(answer.get("what_caps_it"))
    if caps:
        return caps[:4]
    out: list[dict[str, Any]] = []
    for note in _annotations(answer):
        if note["kind"] == "avoid" or not note["criterion"]:
            continue
        point = " — ".join(p for p in (note["label"], note["why"]) if p)
        if point:
            out.append({"criterion": note["criterion"], "point": point})
    return out[:4]


def baseline_comparison(context: dict[str, Any], script: str) -> dict[str, Any]:
    """The comparison this sidecar can make with no model at all.

    It is the offline answer, the mock-mode answer, and the floor under a live call that
    comes back thin: every line of it is authored content for this prompt, so it is never
    wrong, only less personal than a good LLM pass.
    """
    criteria = [
        {
            "criterion": point["criterion"],
            "model_does": point["point"],
            "you_did": None,
            "try_this": None,
            "source": "prompt",
        }
        for point in _criterion_points(context["answer"])
    ]

    actions: list[str] = []
    focus = context.get("rewrite_focus") or {}
    if focus.get("focus"):
        actions.append(focus["focus"])
    if context.get("band_move"):
        actions.append(context["band_move"])
    watchlist = context.get("watchlist") or []
    if watchlist:
        top = watchlist[0]
        if top.get("right") and top.get("wrong"):
            fix = f"Write \"{top['right']}\", not \"{top['wrong']}\""
            actions.append(f"{fix} — {top['why']}" if top.get("why") else fix)
        elif top.get("right"):
            actions.append(str(top["right"]))
    if focus.get("drill"):
        actions.append(focus["drill"])

    deduped: list[str] = []
    for action in actions:
        if action not in deduped:
            deduped.append(action)

    return {
        "criteria": criteria,
        "unused_language": unused_language(script, context.get("moves") or []),
        "next_actions": deduped[:3],
    }


COMPARE_SYSTEM = """You are an IELTS-style writing teacher reviewing one script.

You will be given the learner's own script and the teaching material authored for this \
exact prompt: a model answer at the band they are aiming for, the criterion-by-criterion \
account of what that rendering does, the requirements of this task, the functional frames \
this prompt pulls, and the errors this prompt's content provokes.

Rules, in order:
1. Every point must be traceable to the material you are given. No generic advice.
2. Compare BEHAVIOUR, not content. On an essay the learner's arguments are theirs and on \
a letter their invented specifics are theirs; never suggest they borrow the model's \
figures, names, dates or examples. Rewrites use THEIR sentence, THEIR subject matter.
3. Quote the learner in `you_did` — their exact words, short.
4. `try_this` must be a sentence the learner could actually write about THEIR content.
5. If the learner already does what the model does on a criterion, say so plainly rather \
than inventing a fault.
6. Criterion codes are exactly `ta`, `cc`, `lr`, `gra`. Cohesion, referencing and \
paragraphing belong to `cc`; collocation and word choice to `lr`; sentence variety and \
accuracy to `gra`; covering the task and holding a position or a register to `ta`.

Return ONLY a JSON object with this shape:
{
  "criteria": [
    {"criterion": "ta" | "cc" | "lr" | "gra",
     "model_does": "what the model does here, max 25 words",
     "you_did": "what the learner did instead, quoting them, max 25 words",
     "try_this": "one sentence in the learner's own content, max 25 words"}
  ],
  "unused_language": [
    {"frame": "one of the frames given, copied exactly",
     "where_it_fits": "the sentence in THE LEARNER'S OWN script it would have gone in, \
naming what they were writing about there, max 15 words"}
  ],
  "next_actions": ["2 or 3 imperative actions, each naming one concrete thing to do"]
}"""


def build_compare_messages(
    context: dict[str, Any], script: str, unused: list[dict[str, Any]]
) -> list[dict[str, str]]:
    """The compare prompt, grounded in this prompt's own teaching payload."""
    prompt = context["prompt"]
    answer = context["answer"]
    meta = scoring.TASKS.get(prompt.task_type, {})
    lines: list[str] = [
        f"TASK: {meta.get('label', prompt.task_type)} ({prompt.genre})",
        f"TARGET BAND: {context['band_target']}",
        "",
        "THE PROMPT:",
        str(prompt.prompt_text or "").strip(),
    ]

    chart = loads(prompt.chart_spec, {}) if prompt.chart_spec else {}
    if chart:
        lines += ["", "THE VISUAL, AS DATA:", scoring.chart_to_text(chart)]
    bullets = _strings(loads(prompt.letter_bullets, []), 5)
    if bullets:
        lines += ["", "THE LETTER'S BULLETS:"] + [f"- {b}" for b in bullets]

    parts = context.get("parts") or []
    if parts:
        lines += ["", "WHAT A FULL RESPONSE TO THIS TASK MUST DO:"]
        lines += [f"- {p['part']}" for p in parts if p.get("part")]

    lines += [
        "",
        (
            f"MODEL ANSWER AT BAND {context['band_target']}"
            f" ({_text(answer.get('label')) or 'one way to write it'}):"
        ),
        str(answer.get("text") or "").strip(),
        "",
        "WHAT THIS RENDERING DOES, BY CRITERION:",
    ]
    points = _criterion_points(answer)
    lines += [f"- {p['criterion']}: {p['point']}" for p in points] or ["- (not annotated)"]

    if context.get("band_move"):
        lines += ["", f"THE ONE MOVE THIS PROMPT TEACHES: {context['band_move']}"]

    watchlist = context.get("watchlist") or []
    if watchlist:
        lines += ["", "ERRORS THIS PROMPT'S CONTENT PROVOKES:"]
        lines += [
            f"- {w.get('pattern') or w.get('criterion') or 'error'}: "
            f"\"{w.get('wrong')}\" → \"{w.get('right')}\" ({w.get('why')})"
            for w in watchlist[:3]
        ]

    lines += ["", "THE LEARNER'S SCRIPT:", script.strip()]

    # Last, so the learner's own script is the freshest thing in context when the model
    # is asked where each unused frame would have gone in *their* answer.
    if unused:
        lines += [
            "",
            (
                "FRAMES THIS PROMPT OFFERS THAT THE LEARNER DID NOT REACH FOR "
                "(say where each one fits in THE LEARNER'S SCRIPT above, not in the model):"
            ),
        ]
        lines += [
            f"- [{item['move']}] {item['frame']}"
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
    nothing about this prompt — so every branch here falls back to authored content
    rather than to an empty screen.
    """
    parsed = parsed if isinstance(parsed, dict) else {}

    criteria: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in _dicts(parsed.get("criteria")):
        criterion = _criterion(entry.get("criterion"))
        model_does = _text(entry.get("model_does"), 300)
        if not criterion or not model_does or criterion in seen:
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
    # Authored points the model skipped are still true; keep them, ordered ta→cc→lr→gra.
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


def attempt_script(session: Session, attempt_id: str) -> tuple[str, Any]:
    """The learner's own text from one attempt, with the submission row it came from."""
    row = session.get(m.WritingSubmission, attempt_id)
    if row is None:
        raise ApiError(404, "not_found", f"no writing attempt {attempt_id!r}")
    return (row.essay_text or ""), row


async def compare_answer(
    session: Session,
    prompt: Any,
    script: str,
    band_target: int,
) -> dict[str, Any]:
    """One structured comparison of the learner's script against the model at ``band_target``."""
    from bandready.providers.llm import chat_json
    from bandready.writing import mock as mock_mod

    conditions = mock_mod.exam_conditions(session)
    if conditions is not None:
        raise mock_mod.refusal(conditions)

    text = (script or "").strip()
    if len(text.split()) < MIN_COMPARE_WORDS:
        raise ApiError(
            422,
            "validation_error",
            "the comparison needs the learner's own words — write at least "
            f"{MIN_COMPARE_WORDS} of them first",
        )

    context = compare_context(session, prompt, band_target)
    baseline = baseline_comparison(context, text)
    messages = build_compare_messages(context, text, baseline["unused_language"])

    try:
        parsed = await chat_json(messages, mock_kind="writing_compare", temperature=0.3)
    except ApiError as exc:
        # Offline, no key, a provider outage: the authored comparison still stands.
        _log.info("writing compare fell back to the authored baseline: %s", exc.detail)
        parsed = {}

    result = normalize_comparison(parsed, baseline)
    answer = context["answer"]
    meta = parsed.get("_meta") if isinstance(parsed.get("_meta"), dict) else {}
    return {
        "prompt_id": prompt.id,
        "task_type": prompt.task_type,
        "genre": prompt.genre,
        "band_target": band_target,
        "your_words": len(text.split()),
        "criterion_labels": context["criterion_labels"],
        "model_answer": model_answer_view(answer),
        "criteria": result["criteria"],
        "unused_language": result["unused_language"],
        "next_actions": result["next_actions"],
        "rewrite_focus": context.get("rewrite_focus"),
        "error_watchlist": context.get("watchlist") or [],
        "swap_slots": swap_slots(context["teaching"]) if band_target == 7 else [],
        "_meta": {"model_id": meta.get("model_id"), "grounded": result["grounded"]},
    }


__all__ = [
    "BANDS",
    "CRITERIA",
    "DEFAULT_BAND",
    "GATED_FIELDS",
    "LADDER_BANDS",
    "LOCK_MESSAGE",
    "MIN_ATTEMPT_WORDS",
    "MIN_COMPARE_WORDS",
    "MOVES",
    "Attempt",
    "compare_answer",
    "compare_context",
    "find_attempts",
    "gate_state",
    "get_prompt",
    "has_teaching_column",
    "language_bank",
    "loads",
    "model_answer_at",
    "model_answers",
    "plan_payload",
    "prompt_header",
    "redact_gated",
    "teaching_of",
    "teaching_payload",
    "unused_language",
]
