"""Writing Mock routes — one 60-minute sitting, two tasks, one clock.

    POST  /api/v1/writing/mock/sessions             assemble and open a sitting
    GET   /api/v1/writing/mock/sessions             past mocks + the band trajectory
    GET   /api/v1/writing/mock/sessions/{id}        both tasks, both scripts, the clock
    PATCH /api/v1/writing/mock/sessions/{id}        autosave both scripts and the clock
    POST  /api/v1/writing/mock/sessions/{id}/submit score both, combine, report
    POST  /api/v1/writing/mock/sessions/{id}/abandon walk out (reopens the coach)
    GET   /api/v1/writing/mock/plan                 preview an assembly without opening one
    GET   /api/v1/writing/mock/exam-conditions      is the coach shut, and why

A writing mock is not two practices in a row. The engine in
:mod:`bandready.writing.mock` holds the differences that matter — both tasks visible from
minute zero with the allocation left to the candidate, a single hour tracked server-side,
the coach closed for the duration, and one submit that scores both tasks and combines
them with Task 2 weighted double. This module is the HTTP surface over it and holds no
rules of its own.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.writing import mock

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/writing/mock", tags=["writing-mock"])


class StartMockBody(BaseModel):
    """What little the learner gets to choose about a sitting."""

    model_config = ConfigDict(extra="ignore")

    #: Which Task 1 they sit — a property of the exam they booked, not a preference.
    module: Literal["academic", "general_training"] = "academic"
    #: Reproducibility. The same seed assembles the same paper on any machine.
    seed: int | None = None
    #: Sit a specific prompt. Left unset, least-recently-served picks one.
    task1_prompt_id: str | None = None
    task2_prompt_id: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=3)


class TaskPatchBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slot: Literal["task1", "task2"]
    essay_text: str | None = None
    outline_text: str | None = None
    paste_events: int | None = Field(default=None, ge=0)
    #: Words in the paste that just happened — a big one flags the attempt, never blocks.
    last_paste_words: int | None = Field(default=None, ge=0)


class PatchMockBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: The sitting's clock, owned by the renderer and sent on every autosave.
    seconds_elapsed: float | None = Field(default=None, ge=0.0, le=36000.0)
    #: Which task is on screen. Per-task time is attributed from this and never shown.
    active_slot: Literal["task1", "task2"] | None = None
    tasks: list[TaskPatchBody] = Field(default_factory=list, max_length=2)


# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


@router.post("/sessions", status_code=201, summary="Open a 60-minute writing mock")
def start_mock(
    body: StartMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Assemble a coherent sitting and open it under exam conditions.

    Coherent means the two tasks belong in the same hour rather than being the same hour
    twice: different subject areas, non-overlapping tags, and difficulties within one step
    of each other. Sitting a chart and an essay on the same topic would let one set of
    ideas serve both answers, which is the opposite of what the paper tests. When a thin
    pack cannot satisfy every constraint they are given up softest-first and every
    relaxation is reported in ``coherence.relaxed``.
    """
    body = body or StartMockBody()
    doc = mock.create(
        s,
        current_profile_id(s),
        module=body.module,
        seed=body.seed,
        task1_prompt_id=body.task1_prompt_id,
        task2_prompt_id=body.task2_prompt_id,
        difficulty=body.difficulty,
    )
    payload = mock.view(s, doc)
    payload["created"] = True
    return payload


@router.get("/plan", summary="Preview an assembly without opening a sitting")
def preview_plan(
    module: Literal["academic", "general_training"] = "academic",
    seed: int | None = None,
    task1_prompt_id: str | None = None,
    task2_prompt_id: str | None = None,
    difficulty: Annotated[int | None, Query(ge=1, le=3)] = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The same assembly the POST would make, with no sitting and no rows written.

    Exists so the picker can show what a mock would look like — and so a seeded paper can
    be checked for reproducibility without burning a sitting to do it.
    """
    return mock.assemble(
        s,
        current_profile_id(s),
        module=module,
        seed=seed,
        task1_prompt_id=task1_prompt_id,
        task2_prompt_id=task2_prompt_id,
        difficulty=difficulty,
    )


# --------------------------------------------------------------------------------------
# The sitting
# --------------------------------------------------------------------------------------


@router.get("/sessions", summary="Past writing mocks and the band trajectory")
def list_mocks(
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory.

    The trajectory carries the per-task bands and the per-task minutes beside the
    estimated band, because the interesting line over five mocks is usually the
    allocation, not the score.
    """
    return mock.history(s, current_profile_id(s), limit=limit)


@router.get("/sessions/{mock_id}", summary="Both tasks, both scripts, the clock")
def get_mock(mock_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Both prompts are returned from the first second — the allocation is the lesson."""
    return mock.view(s, mock.load(s, mock_id))


@router.patch("/sessions/{mock_id}", summary="Autosave both scripts and the clock")
def patch_mock(
    mock_id: str,
    body: PatchMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One call carries both editors and the single clock.

    ``seconds_elapsed`` is the sitting's clock, not a per-task one: the renderer owns it
    because it knows about hidden tabs and sleeping laptops. The delta since the last
    autosave is credited to whichever task ``active_slot`` said was on screen, which is
    how the report can open on a time verdict without ever showing a per-task timer
    during the hour.
    """
    body = body or PatchMockBody()
    return mock.patch(
        s,
        mock_id,
        seconds_elapsed=body.seconds_elapsed,
        active_slot=body.active_slot,
        tasks=[
            mock.TaskPatch(
                slot=task.slot,
                essay_text=task.essay_text,
                outline_text=task.outline_text,
                paste_events=task.paste_events,
                last_paste_words=task.last_paste_words,
            )
            for task in body.tasks
        ],
    )


@router.post("/sessions/{mock_id}/abandon", summary="Walk out of a sitting")
def abandon_mock(mock_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Leaving reopens the coach — otherwise one abandoned sitting locks it for hours."""
    return mock.abandon(s, mock_id)


# --------------------------------------------------------------------------------------
# Submit
# --------------------------------------------------------------------------------------


@router.post("/sessions/{mock_id}/submit", summary="Score both tasks and combine them")
async def submit_mock(
    mock_id: str,
    force: bool = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One submit for the pair, and one report that leads with where the hour went.

    Scoring itself is ``scoring/writing.py`` — unchanged, the same evaluator and the same
    audit rows as a practice attempt. What this adds is the combination: Task 2 counts
    double, the figure is computed through the shared ``round_ielts`` so no client ever
    decides it, and it is labelled an estimate every time it is shown.
    """
    mock.load(s, mock_id)  # 404 before doing any work
    # Scoring runs in its own transactions (it has to survive an await). Release this
    # request's connection first so the two never contend for the SQLite write lock.
    s.commit()
    return await mock.submit(mock_id, force=force)


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
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
