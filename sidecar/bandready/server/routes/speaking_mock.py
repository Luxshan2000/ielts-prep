"""Full Mock routes — one continuous sitting under exam conditions.

    POST /api/v1/speaking/mock/sessions                assemble and open a sitting
    GET  /api/v1/speaking/mock/sessions                past mocks + the band trajectory
    GET  /api/v1/speaking/mock/sessions/{id}           current stage, elapsed, what's next
    POST /api/v1/speaking/mock/sessions/{id}/advance   close this stage, open the next
    POST /api/v1/speaking/mock/sessions/{id}/abandon   end without finishing (reopens the coach)
    POST /api/v1/speaking/mock/sessions/{id}/score     whole-test score
    POST /api/v1/speaking/mock/sessions/{id}/transcript  headless test seam (mock builds only)
    GET  /api/v1/speaking/mock/plan                    preview an assembly without opening one
    GET  /api/v1/speaking/mock/exam-conditions         is the coach shut, and why

A mock is not three practices in a row. The engine in :mod:`bandready.speaking.mock`
holds the differences that matter — a Part 3 that descends from the Part 2 card actually
set, exam timing enforced server-side, the coach closed for the duration, and one band
set for the whole sitting. This module is the HTTP surface over it and holds no rules of
its own.

Importing this module installs the exam-conditions guards over the coach, so the gate is
shut from the moment the app boots rather than from the first mock request.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.config import get_settings
from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.speaking import mock

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/speaking/mock", tags=["speaking-mock"])

# The one rule that makes a mock mean anything, installed at import so it is live before
# any request arrives. Idempotent — see mock.install_exam_conditions_guards.
mock.install_exam_conditions_guards()


class StartMockBody(BaseModel):
    """What little the learner gets to choose about a sitting."""

    model_config = ConfigDict(extra="ignore")

    #: Reproducibility. The same seed assembles the same sitting on any machine.
    seed: int | None = None
    #: Sit a specific topic set. Left unset, least-recently-served picks one.
    card_set_id: str | None = None
    #: ``core`` | ``stretch`` | ``challenging``.
    difficulty: str | None = None
    #: Part 1 frames, 2 or 3 (the researched range; 3 is the default).
    frames: int = Field(default=mock.PART1_FRAMES_DEFAULT, ge=2, le=3)
    #: Also open a live WebRTC session, so the existing /sessions/{id}/offer URLs work.
    live: bool = False


class AdvanceBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: Measured length of the stage that just ended. The renderer owns the audio clock;
    #: omitted, the server falls back to wall-clock since the stage opened.
    elapsed_s: float | None = Field(default=None, ge=0.0, le=3600.0)
    #: Examiner discretion: skip the rounding-off questions. Only they may be skipped.
    skip: bool = False


class InjectTranscriptBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    turns: list[dict[str, Any]] = Field(default_factory=list)


# --------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------


@router.post("/sessions", status_code=201, summary="Open a Full Mock sitting")
async def start_mock(
    body: StartMockBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Assemble a coherent sitting and open it under exam conditions.

    Coherent means one thing above all: the Part 3 themes descend from the Part 2 card
    that was set, never from a card picked at random. Part 1 is the deliberate exception —
    a real interview opens on the candidate's own life, not on the cue-card topic, so the
    first frame is a personal one even when it has to be borrowed from another set.
    """
    body = body or StartMockBody()
    profile_id = current_profile_id(s)

    if body.live:
        from bandready.voice import runtime

        existing = runtime.active()
        if existing is not None:
            raise ApiError(
                409,
                "conflict",
                f"speaking session {existing.session_id} is still live — end it first "
                "(the sidecar runs one session at a time)",
            )

    doc = mock.create(
        s,
        profile_id,
        seed=body.seed,
        card_set_id=body.card_set_id,
        difficulty=body.difficulty,
        frames=body.frames,
    )
    # The mock row and the two session rows must be on disk before a live call can attach.
    s.commit()

    payload = mock.view(doc)
    payload["stages"] = doc["stages"]
    payload["created"] = True

    if body.live:
        payload.update(await _attach_live(s, doc))
    return payload


async def _attach_live(s: Session, doc: dict[str, Any]) -> dict[str, Any]:
    """Register the runtime session so the existing WebRTC routes drive this sitting.

    Reuses ``/api/v1/speaking/sessions/{id}/offer`` and ``…/events`` rather than growing a
    second signalling path: a mock is a speaking session with a stricter script.
    """
    from bandready.voice import runtime
    from bandready.voice.state_machine import CardBundle, CueCard, Theme, TopicFrame

    bundle = CardBundle(
        set_id=doc.get("card_set_id"),
        set_title=doc.get("card_set_title"),
        card_ids=list(doc.get("card_ids") or []),
    )
    for stage in doc["stages"]:
        content = stage.get("content") or {}
        if stage["key"].startswith("p1_frame_"):
            bundle.part1.append(
                TopicFrame(topic=content["topic"], questions=list(content["questions"]))
            )
        elif stage["key"] == "p2_long_turn":
            cue = content.get("cue_card") or {}
            rounding = next(
                (
                    st["content"].get("questions") or []
                    for st in doc["stages"]
                    if st["key"] == "p2_rounding"
                ),
                [],
            )
            bundle.part2 = CueCard(
                topic=cue.get("topic") or "",
                bullets=list(cue.get("bullets") or []),
                rounding_off=list(rounding),
            )
        elif stage["key"].startswith("p3_theme_"):
            # The authored counterpoint is examiner sparring material and is fetched
            # here, not from the plan the client renders.
            bundle.part3.append(
                Theme(
                    title=content["title"],
                    questions=list(content["questions"]),
                    counterpoint=_counterpoint(s, doc.get("part3_card_id"), content["title"]),
                )
            )

    live = runtime.register(
        runtime.LiveSession(
            doc["session_id"], activity="full_mock", part=None, bundle=bundle
        )
    )
    await live.start()
    return {
        "live": True,
        "state": live.state.phase,
        "offer_url": f"/api/v1/speaking/sessions/{doc['session_id']}/offer",
        "events_url": f"/api/v1/speaking/sessions/{doc['session_id']}/events",
    }


def _counterpoint(s: Session, card_id: str | None, title: str) -> str | None:
    if not card_id:
        return None
    from bandready.speaking import coach

    card = s.get(m.SpeakingCard, card_id)
    for theme in coach.payload_of(card).get("part3_themes") or []:
        if isinstance(theme, dict) and str(theme.get("title") or "") == title:
            value = str(theme.get("counterpoint") or "").strip()
            return value or None
    return None


@router.get("/plan", summary="Preview an assembly without opening a sitting")
def preview_plan(
    seed: int | None = None,
    card_set_id: str | None = None,
    difficulty: str | None = None,
    frames: Annotated[int, Query(ge=2, le=3)] = mock.PART1_FRAMES_DEFAULT,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The same assembly the POST would make, with no session and no LRS stamp.

    Exists so the picker can show what a mock would look like — and so a seeded sitting
    can be checked for reproducibility without burning the least-recently-served order.
    """
    return mock.assemble(
        s,
        seed=seed,
        card_set_id=card_set_id,
        difficulty=difficulty,
        frames=frames,
        stamp=False,
    )


# --------------------------------------------------------------------------------------
# The stage machine
# --------------------------------------------------------------------------------------


@router.get("/sessions", summary="Past mocks and the band trajectory")
def list_mocks(
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory."""
    return mock.history(s, current_profile_id(s), limit=limit)


@router.get("/sessions/{session_id}", summary="Where the sitting is right now")
def get_mock(session_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    doc = mock.load(s, session_id)
    return {**mock.view(doc), "stages": doc["stages"]}


@router.post("/sessions/{session_id}/advance", summary="Close this stage, open the next")
def advance_mock(
    session_id: str,
    body: AdvanceBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Move the sitting on, recording what the stage that just ended actually took.

    Two exam rules fire here: a long turn is never recorded as longer than two minutes,
    and a long turn that reached ~115 s consumes the rounding-off questions, which come
    back marked ``skipped`` with the reason rather than quietly vanishing.
    """
    body = body or AdvanceBody()
    return mock.advance(s, session_id, elapsed_s=body.elapsed_s, skip=body.skip)


@router.post("/sessions/{session_id}/abandon", summary="End a sitting without finishing")
def abandon_mock(session_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Walking out of a mock has to reopen the coach — otherwise one abandoned sitting
    locks the teaching layer for good."""
    return mock.abandon(s, session_id)


# --------------------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------------------


@router.post("/sessions/{session_id}/score", summary="Score the whole sitting")
async def score_mock(
    session_id: str,
    force: bool = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """One band set for the whole test, which is how the real thing is rated.

    Scoring itself is ``scoring/speaking.py`` — unchanged, and the overall band is the
    mean of the criterion bands through ``round_ielts``, recomputed here so no client
    ever supplies it. What this route adds is the framing a mock needs: evidence
    attributed to the part it was spoken in, a measured part breakdown, and next actions
    naming the cards that were actually sat.
    """
    mock.load(s, session_id)  # 404 before doing any work
    # Scoring runs in its own transactions (it has to survive an await). Release this
    # request's connection first so the two never contend for the SQLite write lock.
    s.commit()
    return await mock.score(session_id, force=force)


@router.post("/sessions/{session_id}/transcript", summary="Test seam: inject a transcript")
def inject_transcript(
    session_id: str,
    body: InjectTranscriptBody | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Install a sitting's transcript without running WebRTC.

    The headless twin of the live pipeline, so the whole-test scoring path can be
    exercised end to end. Registered only under ``BANDREADY_ENABLE_MOCK=1``, exactly like
    the equivalent seam on the drill routes, so a shipped build cannot forge a mock.
    """
    if not get_settings().enable_mock:
        raise ApiError(
            404,
            "not_found",
            "transcript injection is a test seam — start the sidecar with "
            "BANDREADY_ENABLE_MOCK=1 to enable it",
        )
    body = body or InjectTranscriptBody()
    if not body.turns:
        raise ApiError(422, "validation_error", "turns must contain at least one turn")

    import json

    from bandready.voice.metrics import compute_transcript_metrics

    mock.load(s, session_id)
    row = s.get(m.SpeakingSession, session_id)
    if row is None:
        raise ApiError(404, "not_found", "no speaking session with that id")
    record = {"turns": body.turns}
    row.transcript_json = json.dumps(record, ensure_ascii=False)
    row.metrics_json = json.dumps(compute_transcript_metrics(record), ensure_ascii=False)
    return {"session_id": session_id, "turns": len(body.turns)}


# --------------------------------------------------------------------------------------
# Exam conditions
# --------------------------------------------------------------------------------------


@router.get("/exam-conditions", summary="Is the coach shut, and why")
def read_exam_conditions(_: Auth = None, s: Db = None) -> dict[str, Any]:
    """What the coach will refuse right now.

    The client does not need this to be correct — the guards refuse regardless — but a UI
    that greys the Coach tab out beats one that offers it and then shows a 409.
    """
    conditions = mock.exam_conditions(s, current_profile_id(s))
    if conditions is None:
        return {
            "active": False,
            "session_id": None,
            "coaching_available": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
