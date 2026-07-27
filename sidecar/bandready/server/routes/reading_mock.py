"""Reading Mock routes — one 60-minute sitting, three passages, one clock.

    POST  /api/v1/reading/mock/sessions              assemble and open a sitting
    GET   /api/v1/reading/mock/sessions              past mocks + the trajectory
    GET   /api/v1/reading/mock/sessions/{id}         the paper, the clock, the saved state
    PATCH /api/v1/reading/mock/sessions/{id}         autosave answers, flags and the clock
    POST  /api/v1/reading/mock/sessions/{id}/submit  mark it and report
    POST  /api/v1/reading/mock/sessions/{id}/abandon walk out (reopens the coach)
    GET   /api/v1/reading/mock/plan                  preview an assembly without opening one
    GET   /api/v1/reading/mock/exam-conditions       is the coach shut, and why

A reading mock is not three passage practices in a row. The engine in
:mod:`bandready.reading.mock` holds the differences that matter — the whole paper visible
from minute zero with the allocation left to the candidate, a single hour tracked
server-side with **no transfer time**, the coach closed for the duration, and one submit
that marks all forty questions and reports pacing before score. This module is the HTTP
surface over it and holds no rules of its own.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.reading import mock
from bandready.server.deps import current_profile_id, require_auth

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/reading/mock", tags=["reading-mock"])


class StartMockBody(BaseModel):
    """What little the learner gets to choose about a sitting."""

    model_config = ConfigDict(extra="ignore")

    #: Which paper they sit — a property of the exam they booked, not a preference.
    #: Academic and General Training differ in text type, in section shape and, most
    #: consequentially, in the raw-score-to-band conversion.
    module: Literal["academic", "general_training"] = "academic"
    #: Reproducibility. The same seed assembles the same paper on any machine.
    seed: int | None = None
    #: Sit a specific test. Left unset, least-recently-served picks one.
    test_id: str | None = None


class PatchMockBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: Partial deep-merge, exactly as the practice player's autosave: an empty value
    #: deletes the answer rather than storing an empty string.
    answers: dict[str, Any] | None = None
    flags: list[int] | None = None
    highlights: list[dict[str, Any]] | None = None
    notes: dict[str, Any] | None = None
    #: The dictionary is closed during a sitting. Words the learner clicks are queued
    #: here silently and handed back in the report.
    looked_up: list[str] | None = None
    #: The sitting's clock, owned by the renderer and sent on every autosave.
    seconds_elapsed: float | None = Field(default=None, ge=0.0, le=36000.0)
    #: Which passage is on screen. Per-passage time is attributed from this and never
    #: shown during the hour.
    active_position: int | None = Field(default=None, ge=1, le=3)


class SubmitMockBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: The clock ran out and the renderer submitted for the learner. Recorded either way:
    #: a sitting whose clock has expired is auto-submitted whatever the client says.
    auto_submitted: bool = False
    seconds_elapsed: float | None = Field(default=None, ge=0.0, le=36000.0)


# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


@router.post("/sessions", status_code=201, summary="Open a 60-minute reading mock")
def start_mock(
    body: StartMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Assemble a sittable paper and open it under exam conditions.

    Sittable is a real check, not a formality: a test needs three distinct passages whose
    question numbers run 1..N contiguously **across the whole paper** rather than
    restarting per passage, because a paper whose numbering is broken cannot be marked
    out of forty. Tests that fail are skipped and reported in ``coherence.rejected``;
    softer problems — fewer than forty questions, two passages sharing a topic — are sat
    anyway and reported in ``coherence.warnings``.

    Least-recently-served picks the paper unless ``test_id`` names one. With a ``seed``
    the pool is shuffled by the seed instead, so the same number assembles the same paper
    tomorrow.
    """
    body = body or StartMockBody()
    doc = mock.create(
        s,
        current_profile_id(s),
        module=body.module,
        seed=body.seed,
        test_id=body.test_id,
    )
    payload = mock.view(s, doc)
    payload["created"] = True
    return payload


@router.get("/plan", summary="Preview an assembly without opening a sitting")
def preview_plan(
    module: Literal["academic", "general_training"] = "academic",
    seed: int | None = None,
    test_id: str | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The same assembly the POST would make, with no sitting and no rows written.

    Exists so the picker can show what a mock would look like — the three passages, the
    minute budget, the briefing — and so a seeded paper can be checked for
    reproducibility without burning a sitting to do it.
    """
    return mock.assemble(
        s, current_profile_id(s), module=module, seed=seed, test_id=test_id
    )


# --------------------------------------------------------------------------------------
# The sitting
# --------------------------------------------------------------------------------------


@router.get("/sessions", summary="Past reading mocks and the trajectory")
def list_mocks(
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory.

    Raw score is the primary series and the band is secondary. The middle of the Academic
    conversion table is four marks wide — 23, 24, 25 and 26 are all band 6.0 — so a
    learner improving inside it would otherwise watch a flat line for three weeks.
    """
    return mock.history(s, current_profile_id(s), limit=limit)


@router.get("/sessions/{mock_id}", summary="The paper, the clock, the saved state")
def get_mock(
    mock_id: str,
    passages: bool = Query(default=True, description="Include the passage documents"),
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """All three passages from the first second — the allocation is the lesson.

    The documents come back with the answer key stripped *and* the teaching payload
    stripped: no strategy card, no skim plan, no paraphrase link and no trap slug is
    serialised during a sitting, so there is nothing to reveal with a devtools toggle.
    """
    return mock.view(s, mock.load(s, mock_id), include_passages=passages)


@router.patch("/sessions/{mock_id}", summary="Autosave answers, flags and the clock")
def patch_mock(
    mock_id: str,
    body: PatchMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One call carries the answer grid, the flags and the single clock.

    ``seconds_elapsed`` is the sitting's clock, not a per-passage one: the renderer owns
    it because it knows about hidden tabs and sleeping laptops. The delta since the last
    autosave is credited to whichever passage ``active_position`` said was on screen,
    which is how the report can open on a pacing verdict without ever showing a
    per-passage timer during the hour.
    """
    body = body or PatchMockBody()
    return mock.patch(
        s,
        mock_id,
        mock.MockPatch(
            answers=body.answers,
            flags=body.flags,
            highlights=body.highlights,
            notes=body.notes,
            looked_up=body.looked_up,
            seconds_elapsed=body.seconds_elapsed,
            active_position=body.active_position,
        ),
    )


@router.post("/sessions/{mock_id}/abandon", summary="Walk out of a sitting")
def abandon_mock(mock_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Leaving reopens the coach — otherwise one closed laptop locks it for hours.

    The attempt is marked ``abandoned`` rather than submitted, so walking out does *not*
    open the passage gate. Nobody who left has earned the worked solutions.
    """
    return mock.abandon(s, mock_id)


# --------------------------------------------------------------------------------------
# Submit
# --------------------------------------------------------------------------------------


@router.post("/sessions/{mock_id}/submit", summary="Mark the paper and report")
def submit_mock(
    mock_id: str,
    body: SubmitMockBody | None = None,
    force: bool = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One submit for the paper, and one report that leads with where the hour went.

    Marking itself is the player's, unchanged: the same shared normalizer, the same
    "choose TWO" group rule, the same ``reading_answers`` rows and the same published
    conversion table as a practice attempt — so a mock and a practice attempt can never
    disagree about whether an answer was right. What this adds is the sitting's own
    reading of the result: pacing against the benchmark, then raw score, then band with
    its disclaimer, then the per-passage, per-type and per-trap breakdowns with the
    form-and-process losses counted apart from the comprehension ones.

    Submitting also reopens the coach and unlocks the worked solutions on all three
    passages, which is the whole point of having sat it.
    """
    body = body or SubmitMockBody()
    mock.load(s, mock_id)  # 404 before doing any work
    return mock.submit(
        s,
        mock_id,
        auto_submitted=body.auto_submitted,
        seconds_elapsed=body.seconds_elapsed,
        force=force,
    )


# --------------------------------------------------------------------------------------
# Exam conditions
# --------------------------------------------------------------------------------------


@router.get("/exam-conditions", summary="Is the coach shut, and why")
def read_exam_conditions(_: Auth = None, s: Db = None) -> dict[str, Any]:
    conditions = mock.exam_conditions(s, current_profile_id(s))
    if conditions is None:
        return {
            "active": False,
            "mock_id": None,
            "coaching_available": True,
            "dictionary_enabled": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
