"""Listening coach routes — the teaching layer of the listening pack.

    GET  /api/v1/listening/coach/scripts/{script_id}/teaching   full payload (gated)
    GET  /api/v1/listening/coach/strategy                       per-type strategy, pack-wide
    GET  /api/v1/listening/coach/predictions/{script_id}        the per-gap prediction layer
    POST /api/v1/listening/coach/replay                         one missed question, on the timeline
    GET  /api/v1/listening/coach/traps                          the trap taxonomy and the enums
    GET  /api/v1/listening/coach/exam-conditions                is the coach shut, and why

These are the *coach's* routes. ``routes/listening.py`` remains the player — the script
bank, TTS rendering, attempts, autosave, marking and review — and holds no teaching of its
own; nothing here is reachable during a mock.

**The gate.** ``…/teaching``, ``…/predictions`` and ``…/replay`` withhold the transcript,
the answer quotes, the signposts, the decoys, the authored prediction slots and the
recovery notes until the learner has **submitted an attempt containing that script**. That
surface is wider than the reading coach's on purpose. A reading passage is on the
learner's screen throughout the attempt, so gating it would be theatre; a listening
transcript never is, and every keyed answer is a verbatim span of it. Leaking it does not
spoil one question, it spends the whole part — and unlike the audio, which can be
re-rendered, a first hearing cannot be recovered.

Unlike the speaking coach there is no ``?attempted=true`` attestation: a listening attempt
is written to the database by its own submit call before that call returns, so there is
never a window in which the learner has attempted and the sidecar cannot see it. A live
mock shuts the gate for every script regardless of history — that is the property a mock
has no value without.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.listening import coach
from bandready.listening import mock as listening_mock
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/listening/coach", tags=["listening-coach"])


class ReplayBody(BaseModel):
    """Which moment to replay.

    Either name the attempt — the usual path, straight off the review screen — or name the
    script directly, which is what the drill panes do when there is no attempt in front of
    them. The gate is the same either way.
    """

    model_config = ConfigDict(extra="ignore")

    number: int = Field(ge=1, le=40)
    attempt_id: str | None = None
    script_id: str | None = None


def _guard(session: Session) -> dict[str, Any] | None:
    """The live sitting, if there is one. Every route below consults it."""
    return listening_mock.exam_conditions(session, current_profile_id(session))


# --------------------------------------------------------------------------------------
# The teaching payload
# --------------------------------------------------------------------------------------


@router.get("/scripts/{script_id}/teaching", summary="The teaching payload for one part")
def script_teaching(
    script_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The five moments around every answer, the group strategy, and the transcript.

    The timeline and the transcript are **absent** unless the gate opens — not truncated,
    absent. That is the whole feature. In listening the transcript *is* the answer key, so
    reading it before the attempt teaches nothing and permanently spends a part that can
    only be sat once. ``timelines_available`` still tells the UI how many exist, so it can
    render a locked card rather than a blank screen, and the preparation half — the type
    pages, the group attack plans, the preview protocol, the pause plan and the pre-teach
    glosses — comes back either way, because that half is worth most *before* the audio
    plays.
    """
    row = coach.get_script(s, script_id)
    conditions = _guard(s)
    if conditions is not None:
        return {
            **coach.locked_teaching_payload(row, conditions),
            "gate": listening_mock.locked_gate(conditions),
        }
    gate = coach.gate_state(s, current_profile_id(s), script_id)
    payload = coach.teaching_payload(row, unlocked=gate["unlocked"])
    return {**payload, "gate": gate}


# --------------------------------------------------------------------------------------
# Strategy
# --------------------------------------------------------------------------------------


@router.get("/strategy", summary="Per-question-type strategy across the pack")
def strategy(
    type: str | None = Query(default=None, description="One question type slug"),
    part: Annotated[int | None, Query(ge=1, le=4)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The static per-type page plus every authored attack plan for that type.

    Never gated by an attempt — a strategy card says how to attack the type, not what was
    said, and it is worth most in the thirty seconds before the audio starts. It **is**
    refused during a mock, because during a mock nothing is preparation.

    Two facts here are worth more than the rest and most learners do not have either.
    First, **every listening group runs in recording order, always** — the badge says so on
    every card, and the contrast with Reading, where matching headings and matching
    information scatter, is one of the highest-value things this app can teach. Second,
    **the answer is the last value stated for that slot before the speaker moves on, never
    the first**, which is the whole of the correction family in one sentence.

    Filterable by ``type`` and by ``part``, because "how do I do map labelling" and "what
    happens in Part 4" are different questions and learners ask both.
    """
    conditions = _guard(s)
    if conditions is not None:
        raise listening_mock.refusal(conditions)
    return coach.strategy(s, qtype=type, part=part, limit=limit)


@router.get("/traps", summary="The trap taxonomy and the closed enums")
def traps(_: Auth = None, s: Db = None) -> dict[str, Any]:
    """The closed vocabularies the review picker, the drills and the stats all share.

    Five trap families, and family C — the speaker takes it back — has no equivalent in
    reading at all, because a printed text never corrects itself. Every entry carries the
    **lexical signal** that must be audible for the trap to be fair, which is what makes
    the taxonomy teachable rather than merely diagnosable: a learner who learns the signal
    hears the trap coming next time.

    ``form_risks`` is returned separately and must stay separate everywhere it is
    displayed. Losing a mark to spelling is not a listening failure — the learner heard the
    answer — and coaching it as one sends them to redo a skill they already have.
    """
    conditions = _guard(s)
    if conditions is not None:
        raise listening_mock.refusal(conditions)
    families: dict[str, list[dict[str, Any]]] = {key: [] for key in coach.TRAP_FAMILIES}
    for slug, entry in coach.TRAPS.items():
        families[entry["family"]].append({"slug": slug, **entry})
    return {
        "families": [
            {"family": key, "label": label, "traps": families[key]}
            for key, label in coach.TRAP_FAMILIES.items()
        ],
        "count": len(coach.TRAPS),
        "form_risks": {slug: dict(entry) for slug, entry in coach.FORM_RISKS.items()},
        "process": {slug: dict(entry) for slug, entry in coach.PROCESS.items()},
        "slots": {slug: dict(entry) for slug, entry in coach.SLOTS.items()},
        "signpost_kinds": {slug: dict(entry) for slug, entry in coach.SIGNPOST_KINDS.items()},
        "levers": dict(coach.LEVERS),
        "last_value_rule": coach.LAST_VALUE_RULE,
        "order_contrast": coach.ORDER_CONTRAST,
    }


# --------------------------------------------------------------------------------------
# Predictions — the strongest technique in the module
# --------------------------------------------------------------------------------------


@router.get("/predictions/{script_id}", summary="The per-gap prediction layer")
def predictions(
    script_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Slot-typing every gap before the audio starts — listening practice with no audio.

    The response has two halves and the split between them is the feature. The **cue
    table** is the technique and is never gated: how ``a ___`` fixes a singular noun, how
    ``an ___`` additionally tells you the answer begins with a vowel sound, how a printed
    unit after the gap means the bare figure only. A learner who internalises twenty rows
    of it can slot-type a whole question set in fifteen seconds.

    The **authored slots** are the answers to that exercise, so they arrive with the rest
    of the timeline. Handing them over first would turn the most drillable skill in the
    module into a page somebody skimmed — the printed frame is right there on the prompt,
    and deriving the slot from it is the whole point.

    Every question is listed either way, with its instruction, its printed frame and its
    cue, so the drill is runnable before the part has ever been played. That is what makes
    it the one listening exercise immune to the once-only constraint.
    """
    row = coach.get_script(s, script_id)
    conditions = _guard(s)
    if conditions is not None:
        raise listening_mock.refusal(conditions)
    gate = coach.gate_state(s, current_profile_id(s), script_id)
    return {**coach.predictions(row, unlocked=gate["unlocked"]), "gate": gate}


# --------------------------------------------------------------------------------------
# Replay — the highest-value review action in listening
# --------------------------------------------------------------------------------------


@router.post("/replay", summary="Replay the moment one answer was spoken")
def replay(
    body: ReplayBody,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The signpost, the decoy and the answer line, as playable windows into the WAV.

    This is worth more than any worked solution, and it is worth more precisely because
    the learner's failure was not one of reasoning. They did not mis-weigh the evidence;
    their ear did not stop at the right second. Telling them which second it was, and
    playing the three seconds before it, is the only intervention that addresses what
    actually happened.

    The windows come from ``timing.json``, which the stitcher writes with sample-accurate
    offsets for every line, so ``start_ms`` is the real position in the rendered file
    rather than an estimate from a words-per-minute heuristic. ``segments`` is a playlist
    in **recording order** — one clip per spoken line, ordered as the learner heard them.
    That is the whole claim of the feature: a decoy that the speaker corrected *after* the
    keyed line is played after it, because playing it first would invent three seconds
    that never happened. Where the signpost and the answer share a spoken line — the
    common case in the shipped pack — the line plays once and ``roles`` names it as both,
    keeping the answer's three-second lead-in.

    When the part has not been rendered yet the clips come back with ``playable: false``
    and their text intact, plus a ``render_hint`` naming the call that fixes it.
    """
    conditions = _guard(s)
    if conditions is not None:
        raise listening_mock.refusal(conditions)

    script_id = body.script_id
    if body.attempt_id:
        script_id = _script_of_attempt(s, body.attempt_id, body.number)
    if not script_id:
        raise ApiError(422, "validation_error", "supply attempt_id or script_id")

    gate = coach.gate_state(s, current_profile_id(s), script_id)
    payload = coach.replay(s, script_id, body.number, unlocked=gate["unlocked"])
    return {**payload, "gate": gate}


def _script_of_attempt(session: Session, attempt_id: str, number: int) -> str:
    """Which part of a submitted attempt carries this question number.

    Resolved through the player's own question walk so the numbering matches the answer
    sheet the learner filled in — on a whole-test attempt question 23 belongs to Part 3,
    and asking the content bank directly would find a Part 1 script that happens to number
    its own questions 1..10.
    """
    from bandready.server.routes.listening import _attempt_questions, _attempt_row

    row = _attempt_row(session, attempt_id)
    if row.status != "submitted":
        raise ApiError(409, "conflict", "ask this after submitting the attempt")
    for script, _question, display_number in _attempt_questions(session, row):
        if int(display_number) == int(number):
            return script.id
    raise ApiError(404, "not_found", f"question {number} is not in this attempt")


# --------------------------------------------------------------------------------------
# Exam conditions
# --------------------------------------------------------------------------------------


@router.get("/exam-conditions", summary="Is the coach shut, and why")
def read_exam_conditions(_: Auth = None, s: Db = None) -> dict[str, Any]:
    conditions = _guard(s)
    if conditions is None:
        return {
            "active": False,
            "mock_id": None,
            "coaching_available": True,
            "dictionary_enabled": True,
            "prediction_gate_enabled": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
