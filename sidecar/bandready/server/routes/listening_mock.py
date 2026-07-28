"""Listening Mock routes — four parts, forty questions, audio once, then the window.

    POST  /api/v1/listening/mock/sessions              assemble a sitting and queue its audio
    GET   /api/v1/listening/mock/sessions              past mocks + the trajectory
    GET   /api/v1/listening/mock/sessions/{id}         the paper, the render progress, the clock
    POST  /api/v1/listening/mock/sessions/{id}/start   begin the clock (409 until audio is ready)
    PATCH /api/v1/listening/mock/sessions/{id}         autosave answers and the clock
    POST  /api/v1/listening/mock/sessions/{id}/play    register a part as played (once only)
    POST  /api/v1/listening/mock/sessions/{id}/submit  mark it and report
    POST  /api/v1/listening/mock/sessions/{id}/abandon walk out (reopens the coach)
    GET   /api/v1/listening/mock/plan                  preview an assembly without opening one
    GET   /api/v1/listening/mock/delivery              the two formats, and which we model
    GET   /api/v1/listening/mock/exam-conditions       is the coach shut, and why

A listening mock is not four part-practices in a row. The engine in
:mod:`bandready.listening.mock` holds the differences that matter — every part rendered
before the sitting opens, each recording played once and the second request refused by the
server, the coach closed for the duration, one clock derived from the audio itself, and one
submit that marks all forty questions and reports raw score before band. This module is the
HTTP surface over it and holds no rules of its own.

**Which test are we modelling?** The computer-delivered one, by default, and every response
says so. The difference is the window at the end: **computer gets 2 minutes to check, paper
gets 10 minutes to transfer.** Paper gets ten because paper has to move the answers onto a
separate sheet; computer gets two because the answers are already where they need to be.
The ten minutes is a clerical allowance, not a thinking period, and a candidate who treats
it as one arrives at the end with empty boxes.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.listening import mock
from bandready.server.deps import current_profile_id, require_auth

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/listening/mock", tags=["listening-mock"])


class StartMockBody(BaseModel):
    """What little the learner gets to choose about a sitting."""

    model_config = ConfigDict(extra="ignore")

    #: Which format is modelled. Not a preference so much as a property of the test the
    #: learner booked, and the only thing that genuinely differs is the window at the end.
    delivery: Literal["computer", "paper"] = "computer"
    #: Reproducibility. The same seed assembles the same paper on any machine.
    seed: int | None = None
    #: Sit a specific test. Left unset, least-recently-served picks one.
    test_id: str | None = None


class PatchMockBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: Partial deep-merge, exactly as the practice player's autosave: only the keys sent
    #: are touched.
    answers: dict[str, Any] | None = None
    #: The sitting's clock, owned by the renderer and sent on every autosave.
    seconds_elapsed: float | None = Field(default=None, ge=0.0, le=36000.0)
    #: Which part is on screen.
    current_part: int | None = Field(default=None, ge=1, le=4)
    #: ``audio`` while a recording is running, ``check`` once the last one has finished.
    #: They are different instructions, not different labels.
    phase: Literal["audio", "check"] | None = None


class PlayBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    script_id: str = Field(min_length=1)


class SubmitMockBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: The clock ran out and the renderer submitted for the learner. Recorded either way:
    #: a sitting whose clock has expired is auto-submitted whatever the client says.
    auto_submitted: bool = False
    seconds_elapsed: float | None = Field(default=None, ge=0.0, le=36000.0)


# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


@router.post("/sessions", status_code=201, summary="Open a listening mock")
def start_mock(
    response: Response,
    body: StartMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Assemble a sittable paper, queue its audio, and open it under exam conditions.

    Sittable is a real check, not a formality: a test needs four distinct parts whose
    question numbers run 1..N contiguously **across the whole paper** rather than restarting
    per part, because the narrator says "questions eleven to twenty" and the answer sheet
    has to agree. Tests that fail are skipped and reported in ``coherence.rejected``; softer
    problems — fewer than forty questions, one accent across all four parts — are sat anyway
    and reported in ``coherence.warnings``.

    The sitting opens at ``preparing`` whenever any part is unrendered, with a
    ``listening_render`` job carrying the four recordings. Poll ``GET …/sessions/{id}``
    until ``status`` is ``ready``, then ``POST …/start``. Nothing can begin before then:
    a mock that stalled in the middle of Part 3 to synthesize Part 4 would be teaching the
    learner to tolerate a pause the exam never gives them.

    **Exam conditions bite from this call**, not from ``/start`` — a learner who reads
    transcripts while the render queue runs has already sat the paper.
    """
    body = body or StartMockBody()
    doc = mock.create(
        s,
        current_profile_id(s),
        delivery=body.delivery,
        seed=body.seed,
        test_id=body.test_id,
    )
    payload = mock.view(s, doc)
    payload["created"] = True
    if doc.get("status") == "preparing":
        response.headers["Location"] = f"/api/v1/jobs/{doc.get('render_job_id')}"
    return payload


@router.get("/plan", summary="Preview an assembly without opening a sitting")
def preview_plan(
    delivery: Literal["computer", "paper"] = "computer",
    seed: int | None = None,
    test_id: str | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The same assembly the POST would make, with no sitting and no rows written.

    Exists so the picker can show what a mock would look like — the four parts, whether
    their audio is already rendered, how long the sitting will run, the briefing — and so a
    seeded paper can be checked for reproducibility without burning a sitting to do it.
    """
    return mock.assemble(
        s, current_profile_id(s), delivery=delivery, seed=seed, test_id=test_id
    )


@router.get("/delivery", summary="The two formats, and which one we model")
def delivery_modes(_: Auth = None) -> dict[str, Any]:
    """Computer against paper, stated plainly, because the confusion costs marks.

    Paper gets ten minutes because paper has to move the answers onto a separate sheet.
    Computer gets two because the answers are already where they need to be. The ten
    minutes is a clerical allowance, not a thinking period — and the single most useful
    thing to say about either window is that content recovery is impossible in it. The
    audio is gone. Only form recovery is possible.
    """
    from bandready.listening import coach

    return {
        "default": mock.DEFAULT_DELIVERY,
        "modes": [
            {
                "slug": entry.slug,
                "label": entry.label,
                "window_s": entry.window_s,
                "window_label": entry.window_label,
                "note": entry.note,
            }
            for entry in mock.DELIVERY.values()
        ],
        "mnemonic": mock.DELIVERY_MNEMONIC,
        "why_default": mock.WHY_COMPUTER,
        "check_protocol": list(coach.CHECK_PROTOCOL),
        "check_note": coach.CHECK_NOTE,
    }


# --------------------------------------------------------------------------------------
# The sitting
# --------------------------------------------------------------------------------------


@router.get("/sessions", summary="Past listening mocks and the trajectory")
def list_mocks(
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory.

    Raw score is the primary series and the band is secondary. The middle of the listening
    table is a swamp — 18 to 22 is a single five-mark-wide band 5.5 — so a learner
    improving inside it would otherwise watch a flat line for a month.
    """
    return mock.history(s, current_profile_id(s), limit=limit)


@router.get("/sessions/{mock_id}", summary="The paper, the render progress, the clock")
def get_mock(
    mock_id: str,
    parts: bool = Query(default=True, description="Include the part documents"),
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Poll this while the audio renders; ``audio.pct`` and ``audio.job_state`` say how far.

    The part documents come back through the player's own allowlist serialiser, so the
    accepted answers, the cue line indices, the explanations and the spoken lines are not
    stripped out of a larger object — they were never put into one. The authored teaching
    payload is not on that allowlist either, at any depth, so there is nothing to reveal
    with a devtools toggle.
    """
    doc = mock.refresh(s, mock.load(s, mock_id))
    return mock.view(s, doc, include_parts=parts)


@router.post("/sessions/{mock_id}/start", summary="Begin the clock")
def start_sitting(mock_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Refuses with a 409 until every part's audio exists on disk.

    Rendering four parts of synthesized speech takes long enough to notice. A sitting that
    opened optimistically would either stall between parts or serve a part with no audio at
    all, and a learner who reaches Part 4 and finds silence has lost the sitting rather than
    a minute. The refusal names how many parts are ready so the UI can show a progress bar
    instead of an error.
    """
    doc = mock.start(s, mock_id)
    return mock.view(s, doc)


@router.patch("/sessions/{mock_id}", summary="Autosave answers and the clock")
def patch_mock(
    mock_id: str,
    body: PatchMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One call carries the answer grid and the single clock.

    There is no per-part time attribution to do here, unlike reading: the recordings spend
    the time and the previews are baked into them as authored pauses, so the only decisions
    left to the learner are attention ones. ``phase`` is the one field worth sending
    carefully — ``audio`` and ``check`` are different instructions, because once the last
    recording ends the audio is gone forever and nothing but form repair is still possible.
    """
    body = body or PatchMockBody()
    return mock.patch(
        s,
        mock_id,
        mock.MockPatch(
            answers=body.answers,
            seconds_elapsed=body.seconds_elapsed,
            current_part=body.current_part,
            phase=body.phase,
        ),
    )


@router.post("/sessions/{mock_id}/play", summary="Register a part as played — once only")
def play_part(
    mock_id: str,
    body: PlayBody,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The exam condition that defines the paper, enforced server-side.

    Each recording plays once. A second request for the same part is a 409 with the part
    named, so the UI can say *"Part 2 has already been played"* rather than failing
    silently. This is enforced here rather than in the player because a renderer's promise
    not to offer a rewind button is a preference, not an exam condition — and every
    technique this module teaches, from prediction to recovery, exists only because the
    audio does not come back.
    """
    return mock.play(s, mock_id, body.script_id)


@router.post("/sessions/{mock_id}/abandon", summary="Walk out of a sitting")
def abandon_mock(mock_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Leaving reopens the coach — otherwise one closed laptop locks it for hours.

    The attempt is marked ``abandoned`` rather than submitted, so walking out does *not*
    open the part gate. Nobody who left has earned the transcript.
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
    """One submit for the paper, and one report that leads with the raw score.

    Marking itself is the player's, unchanged: the same shared normalizer, the same
    multi-slot rule, the same ``listening_answers`` rows and the same published conversion
    table as a practice attempt — so a mock and a practice attempt can never disagree about
    whether an answer was right.

    What this adds is the sitting's own reading of the result, in the order that makes it
    usable. **Raw score first**, because band 5.5 is five marks wide and a learner who goes
    from 19 to 22 has improved fifteen per cent and would otherwise be told nothing. Then
    the **per-part split**, because "Parts 3 and 4 are the hard ones" is not a diagnosis:
    Part 3 punishes losing track of who thinks what and Part 4 punishes losing your place,
    and those need completely different practice. Then the **form-and-comprehension split**,
    kept apart on purpose — marks lost to spelling were heard correctly and need three
    weeks of orthography, not six months of listening. Then the **cascades**, which is the
    single best analytic the module has: one miss that took the next two with it is not
    three comprehension failures, it is one miss plus a failure to rejoin. Then at most
    three next actions, never a table of percentages.

    Submitting also reopens the coach and unlocks the transcript and the timelines on all
    four parts, which is the whole point of having sat it.
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
            "prediction_gate_enabled": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
