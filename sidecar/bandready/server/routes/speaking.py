"""Speaking-session routes (18-api-contract.md §4.7, behaviour owned by 04 + 02).

    POST   /api/v1/speaking/sessions                start (409 if one is live)
    GET    /api/v1/speaking/sessions                history
    GET    /api/v1/speaking/sessions/{id}           session record
    POST   /api/v1/speaking/sessions/{id}/offer     SDP offer → answer
    PATCH  /api/v1/speaking/sessions/{id}/offer     trickle ICE, SAME url (gotcha #4)
    WS     /api/v1/speaking/sessions/{id}/events    ?ticket= (audience session-events)
    POST   /api/v1/speaking/sessions/{id}/transcript  mock-only test seam (inject turns)
    POST   /api/v1/speaking/sessions/{id}/end       teardown (alias: /hangup)
    POST   /api/v1/speaking/sessions/{id}/score     idempotent scoring
    GET    /api/v1/speaking/sessions/{id}/report    the session's report
    GET    /api/v1/speaking/reports/{id}            report by id
    GET    /api/v1/speaking/cards                   drill topic picker
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from ulid import ULID

from bandready.config import get_settings
from bandready.db import models as m
from bandready.db.engine import get_session, session_scope
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.tickets import verify_ticket
from bandready.voice import runtime
from bandready.voice.state_machine import (
    ACTIVITIES,
    ACTIVITY_TO_WEIGHT,
    SCOREABLE_ACTIVITIES,
    CardBundle,
    default_bundle,
)

_log = logging.getLogger("bandready.routes.speaking")

# Annotated aliases keep the route signatures free of call-in-default patterns.
Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Any, Depends(get_session)]

router = APIRouter(prefix="/api/v1/speaking", tags=["speaking"])

WEIGHT_CLASSES = ("placement", "mock", "practice", "micro")
#: The reverse of ACTIVITY_TO_WEIGHT, for clients that send the estimator weight class.
WEIGHT_TO_ACTIVITY = {
    "mock": "full_mock",
    "practice": "single_part",
    "micro": "quick_chat",
    "placement": "full_mock",
}


class StartSessionBody(BaseModel):
    """`mode` accepts the activity kind (04 §2) or the R2-7 estimator weight class."""

    mode: str = Field(default="full_mock")
    part: int | None = None
    card_set_id: str | None = None
    topic: str | None = None


class EndSessionBody(BaseModel):
    score: bool = False
    status: str = "complete"


class InjectTranscriptBody(BaseModel):
    """Body of the mock-only transcript seam (see `inject_session_transcript`)."""

    turns: list[dict[str, Any]] = Field(default_factory=list)


# --------------------------------------------------------------------------- helpers


def _resolve_mode(raw: str) -> tuple[str, str]:
    """``(activity, weight_class)`` from whatever the client sent."""
    value = (raw or "full_mock").strip().lower()
    if value in ACTIVITIES:
        return value, ACTIVITY_TO_WEIGHT[value]
    if value in WEIGHT_CLASSES:
        return WEIGHT_TO_ACTIVITY[value], value
    raise ApiError(
        422,
        "validation_error",
        f"mode must be one of {', '.join(ACTIVITIES)} "
        f"(or a weight class: {', '.join(WEIGHT_CLASSES)})",
    )


def _pick_card_set(s: Any, card_set_id: str | None) -> tuple[CardBundle, str | None]:
    """Least-recently-served card set (04 §2 / R2-21), or the built-in fallback."""
    row = None
    if card_set_id:
        row = s.get(m.CardSet, card_set_id)
        if row is None:
            raise ApiError(404, "not_found", f"no card set {card_set_id!r}")
    else:
        row = s.execute(
            select(m.CardSet)
            .where(m.CardSet.retired == 0)
            # NULL last_served_at (never served) sorts first.
            .order_by(m.CardSet.last_served_at.is_(None).desc(), m.CardSet.last_served_at)
            .limit(1)
        ).scalars().first()
    if row is None:
        return default_bundle(), None

    cards = s.execute(
        select(m.SpeakingCard)
        .where(m.SpeakingCard.card_set_id == row.id, m.SpeakingCard.retired == 0)
        .order_by(m.SpeakingCard.part)
    ).scalars().all()
    bundle = CardBundle.from_payloads(
        [_payload(c) for c in cards], set_id=row.id, set_title=row.title
    )
    if bundle.is_empty():
        return default_bundle(), None
    row.last_served_at = _now_iso()
    for card in cards:
        card.last_served_at = row.last_served_at
    return bundle, row.id


def _pick_cards_for_part(s: Any, part: int, topic: str | None) -> CardBundle:
    """Least-recently-served standalone cards for a single-part or drill session."""
    stmt = (
        select(m.SpeakingCard)
        .where(m.SpeakingCard.part == part, m.SpeakingCard.retired == 0)
        .order_by(
            m.SpeakingCard.last_served_at.is_(None).desc(), m.SpeakingCard.last_served_at
        )
        .limit(3 if part == 1 else 1)
    )
    if topic:
        stmt = stmt.where(m.SpeakingCard.title.like(f"%{topic}%"))
    cards = s.execute(stmt).scalars().all()
    if not cards:
        return default_bundle()
    bundle = CardBundle.from_payloads([_payload(c) for c in cards])
    if bundle.is_empty():
        return default_bundle()
    stamp = _now_iso()
    for card in cards:
        card.last_served_at = stamp
    # A single-part 2 or 3 session still needs the other parts' text for its scripted
    # lines; the built-in set fills the gaps rather than leaving them blank.
    fallback = default_bundle()
    bundle.part1 = bundle.part1 or fallback.part1
    bundle.part2 = bundle.part2 or fallback.part2
    bundle.part3 = bundle.part3 or fallback.part3
    return bundle


def _payload(card: Any) -> dict[str, Any]:
    try:
        payload = json.loads(card.payload_json or "{}")
    except (TypeError, ValueError):
        payload = {}
    payload.setdefault("id", card.id)
    payload.setdefault("part", card.part)
    payload.setdefault("topic", card.title)
    return payload


def _now_iso() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _session_record(s: Any, session_id: str) -> dict[str, Any]:
    row = s.get(m.SpeakingSession, session_id)
    if row is None:
        raise ApiError(404, "not_found", "no speaking session with that id")
    envelope = s.get(m.PracticeSession, session_id)
    report = s.execute(
        select(m.LlmEvaluation.id)
        .where(
            m.LlmEvaluation.subject_kind == "speaking_session",
            m.LlmEvaluation.subject_id == session_id,
            m.LlmEvaluation.status == "ok",
        )
        .order_by(m.LlmEvaluation.created_at.desc())
        .limit(1)
    ).scalars().first()
    live = runtime.get(session_id)
    return {
        "id": session_id,
        "mode": row.mode,
        "activity": envelope.activity if envelope else None,
        "part": row.part,
        "card_set_id": row.card_set_id,
        "state": live.state.phase if live is not None else row.state,
        "status": row.status,
        "overall_band": row.overall_band,
        "criteria": json.loads(row.criteria_json) if row.criteria_json else None,
        "started_at": envelope.started_at if envelope else None,
        "ended_at": envelope.ended_at if envelope else None,
        "duration_s": envelope.duration_s if envelope else None,
        "live": live is not None and not live.ended,
        "report_id": report,
        "offer_url": f"/api/v1/speaking/sessions/{session_id}/offer",
        "events_url": f"/api/v1/speaking/sessions/{session_id}/events",
    }


# --------------------------------------------------------------------------- routes


@router.post("/sessions", status_code=201, summary="Start a speaking session")
async def start_session(
    _: Auth = None,
    body: StartSessionBody | None = None,
) -> dict[str, Any]:
    body = body or StartSessionBody()
    activity, weight = _resolve_mode(body.mode)

    live = runtime.active()
    if live is not None:
        raise ApiError(
            409,
            "conflict",
            f"speaking session {live.session_id} is still live — end it first "
            "(the sidecar runs one session at a time)",
        )

    part = body.part
    if activity == "single_part":
        if part not in (1, 2, 3):
            raise ApiError(422, "validation_error", "single_part needs part 1, 2 or 3")
    elif activity == "topic_drill":
        part = part if part in (1, 2, 3) else 1
    else:
        part = None

    session_id = f"ss_{ULID()}"
    with session_scope() as s:
        profile_id = current_profile_id(s)
        if activity == "full_mock":
            bundle, card_set_id = _pick_card_set(s, body.card_set_id)
        elif activity == "quick_chat":
            bundle, card_set_id = default_bundle(), None
        else:
            bundle = _pick_cards_for_part(s, part or 1, body.topic)
            card_set_id = None

        s.add(
            m.PracticeSession(
                id=session_id,
                profile_id=profile_id,
                module="speaking",
                activity=(
                    f"single_part:{part}" if activity == "single_part" else activity
                ),
            )
        )
        s.add(
            m.SpeakingSession(
                id=session_id,
                mode=weight,
                part=part,
                card_set_id=card_set_id,
                state="CONNECTING",
                status="active",
            )
        )

    session = runtime.register(
        runtime.LiveSession(session_id, activity=activity, part=part, bundle=bundle)
    )
    await session.start()

    return {
        "session_id": session_id,
        "mode": weight,
        "activity": activity,
        "part": part,
        "card_set_id": session.bundle.set_id,
        "card_set_title": session.bundle.set_title,
        "state": session.state.phase,
        "offer_url": f"/api/v1/speaking/sessions/{session_id}/offer",
        "events_url": f"/api/v1/speaking/sessions/{session_id}/events",
    }


def _latest_report_ids(s: Any, session_ids: list[str]) -> dict[str, str]:
    """The newest successful evaluation per session id.

    The single-session record has always carried ``report_id``; the list did not, so
    every client reading the list saw ``undefined`` and concluded no past session could
    be opened. That is why the Speaking room's history was a wall of dead rows. One
    ``IN`` query answers it for the whole page.
    """
    if not session_ids:
        return {}
    rows = s.execute(
        select(m.LlmEvaluation.subject_id, m.LlmEvaluation.id)
        .where(
            m.LlmEvaluation.subject_kind == "speaking_session",
            m.LlmEvaluation.subject_id.in_(session_ids),
            m.LlmEvaluation.status == "ok",
        )
        # Ascending, so the last row written for a subject is the one that survives the
        # dict build — the same "newest ok evaluation wins" rule `_session_record` uses.
        .order_by(m.LlmEvaluation.created_at.asc(), m.LlmEvaluation.id.asc())
    ).all()
    return {row.subject_id: row.id for row in rows}


def _card_set_titles(s: Any, set_ids: set[str]) -> dict[str, str]:
    """Topic-set titles, so a history row can be named rather than numbered."""
    if not set_ids:
        return {}
    rows = s.execute(
        select(m.CardSet.id, m.CardSet.title).where(m.CardSet.id.in_(sorted(set_ids)))
    ).all()
    return {row.id: row.title for row in rows}


def _turn_counts(s: Any, session_ids: list[str]) -> dict[str, int]:
    """How many flattened turns each session kept (R2-24)."""
    if not session_ids:
        return {}
    rows = s.execute(
        select(m.SpeakingTurn.session_id, func.count())
        .where(m.SpeakingTurn.session_id.in_(session_ids))
        .group_by(m.SpeakingTurn.session_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


#: How much of the opening answer a history row can usefully show.
OPENING_LINE_MAX = 160


def _opening_lines(s: Any, session_ids: list[str]) -> dict[str, str]:
    """The first thing the candidate said in each session.

    An unscored session has no band and no report, so without this the whole list reads
    "Quick chat, Quick chat, Quick chat" and the learner cannot tell which conversation
    was which. The first line is what they remember it by, and it is what makes the
    search box able to find one.

    Only the earliest user turn per session is read — a min()/join rather than pulling
    every turn's text back for a page of fifty sessions.
    """
    if not session_ids:
        return {}
    first = (
        select(
            m.SpeakingTurn.session_id.label("sid"),
            func.min(m.SpeakingTurn.turn_index).label("ti"),
        )
        .where(m.SpeakingTurn.session_id.in_(session_ids), m.SpeakingTurn.role == "user")
        .group_by(m.SpeakingTurn.session_id)
        .subquery()
    )
    rows = s.execute(
        select(m.SpeakingTurn.session_id, m.SpeakingTurn.text).join(
            first,
            (m.SpeakingTurn.session_id == first.c.sid)
            & (m.SpeakingTurn.turn_index == first.c.ti),
        )
    ).all()
    out: dict[str, str] = {}
    for session_id, raw in rows:
        line = " ".join((raw or "").split())
        if not line:
            continue
        out[session_id] = (
            line if len(line) <= OPENING_LINE_MAX else line[: OPENING_LINE_MAX - 1].rstrip() + "…"
        )
    return out


@router.get("/sessions", summary="Speaking session history")
async def list_sessions(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    cursor: str | None = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    profile_id = current_profile_id(s)
    stmt = (
        select(m.SpeakingSession, m.PracticeSession)
        .join(m.PracticeSession, m.PracticeSession.id == m.SpeakingSession.id)
        .where(m.PracticeSession.profile_id == profile_id)
        .order_by(m.SpeakingSession.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        stmt = stmt.where(m.SpeakingSession.id < cursor)
    rows = list(s.execute(stmt).all())
    has_more = len(rows) > limit
    rows = rows[:limit]

    # Everything a history row needs to be openable and nameable, resolved once for the
    # page rather than per row: which report to link to, what the topic set was called,
    # and whether anything was actually said.
    ids = [row.id for row, _ in rows]
    reports = _latest_report_ids(s, ids)
    titles = _card_set_titles(s, {row.card_set_id for row, _ in rows if row.card_set_id})
    turn_counts = _turn_counts(s, ids)
    openings = _opening_lines(s, ids)
    live = runtime.active()
    live_id = live.session_id if live is not None and not live.ended else None

    items = [
        {
            "id": row.id,
            "mode": row.mode,
            "activity": envelope.activity,
            "part": row.part,
            "card_set_id": row.card_set_id,
            "card_set_title": titles.get(row.card_set_id) if row.card_set_id else None,
            "state": row.state,
            "status": row.status,
            "overall_band": row.overall_band,
            "started_at": envelope.started_at,
            "ended_at": envelope.ended_at,
            "duration_s": envelope.duration_s,
            "live": row.id == live_id,
            "report_id": reports.get(row.id),
            "turn_count": turn_counts.get(row.id, 0),
            "opening_line": openings.get(row.id),
            # The blob and the flattened rows are written by the same teardown, but a
            # row trimmed by a repair keeps only one of them. Either one means there is
            # a conversation to read back.
            "has_transcript": bool(row.transcript_json) or row.id in turn_counts,
        }
        for row, envelope in rows
    ]
    return {"items": items, "next_cursor": items[-1]["id"] if has_more and items else None}


@router.get("/sessions/{session_id}", summary="One speaking session record")
async def get_session_record(
    session_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    return _session_record(s, session_id)


def _transcript_turns(s: Any, session_id: str) -> list[dict[str, Any]]:
    """The session's timed transcript in `voice/transcript.py` record order.

    ``transcript_json`` is preferred because it keeps the authoring context the
    flattened rows drop (``phase``, ``card_id``, ``part``). ``speaking_turns`` is
    the fallback for rows written before the blob existed, or trimmed by a repair.
    """
    row = s.get(m.SpeakingSession, session_id)
    if row is None:
        raise ApiError(404, "not_found", "no speaking session with that id")

    if row.transcript_json:
        record = json.loads(row.transcript_json)
        turns = record.get("turns") if isinstance(record, dict) else record
        if turns:
            return list(turns)

    rows = s.execute(
        select(m.SpeakingTurn)
        .where(m.SpeakingTurn.session_id == session_id)
        .order_by(m.SpeakingTurn.turn_index)
    ).scalars().all()
    return [
        {
            "role": t.role,
            "text": t.text,
            "t_ms": t.t_ms,
            "dur_ms": t.dur_ms,
            "segments": json.loads(t.segments_json) if t.segments_json else [],
            "audio_file": t.audio_path,
            "metrics": json.loads(t.metrics_json) if t.metrics_json else None,
        }
        for t in rows
    ]


@router.get("/sessions/{session_id}/transcript", summary="The session's timed transcript")
async def get_session_transcript(
    session_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Feeds the feedback report's annotated transcript and per-turn replay (04 §7)."""
    return {"session_id": session_id, "turns": _transcript_turns(s, session_id)}


@router.post("/sessions/{session_id}/transcript", summary="Test seam: inject a transcript")
async def inject_session_transcript(
    session_id: str,
    body: InjectTranscriptBody | None = None,
    _: Auth = None,
) -> dict[str, Any]:
    """Install a transcript on a live session without running WebRTC.

    The out-of-process twin of ``bandready.voice.runtime.inject_transcript`` (the
    in-process seam 14-testing-strategy.md §7.1 documents): the Playwright suite
    runs in a browser and cannot reach the runtime object, so a scored speaking
    report has to be seeded over HTTP. Registered only under
    ``BANDREADY_ENABLE_MOCK=1`` — the same test seam that exposes the mock
    provider presets (03-providers-and-settings.md, R2-19) — so a shipped build
    has no way to forge a transcript.
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
    runtime.inject_transcript(session_id, {"turns": body.turns})
    return {"session_id": session_id, "turns": len(body.turns)}


@router.post("/sessions/{session_id}/offer", summary="WebRTC SDP offer → answer")
async def post_offer(
    session_id: str,
    body: dict[str, Any],
    _: Auth = None,
) -> dict[str, Any]:
    answer = await runtime.handle_offer(session_id, body)
    if answer is None:
        raise ApiError(502, "internal", "the voice engine did not return an SDP answer")
    return answer


@router.patch("/sessions/{session_id}/offer", summary="Trickle ICE (gotcha #4 — same URL)")
async def patch_offer(
    session_id: str,
    body: dict[str, Any],
    _: Auth = None,
) -> dict[str, Any]:
    # Gotcha #4: trickle ICE arrives as PATCH on the *same* /offer URL, and candidate keys
    # come in snake_case or camelCase depending on the client build. runtime.handle_patch
    # accepts both; getting this wrong strands the connection in `connecting`.
    runtime.require(session_id)
    await runtime.handle_patch(session_id, body)
    return {"ok": True}


@router.post("/sessions/{session_id}/end", summary="End a session (teardown + flatten)")
async def end_session(
    session_id: str,
    body: EndSessionBody | None = None,
    _: Auth = None,
) -> dict[str, Any]:
    body = body or EndSessionBody()
    live = runtime.get(session_id)
    activity = live.activity if live is not None else None
    if live is not None:
        with contextlib.suppress(Exception):
            await live.state.hangup()

    status = body.status if body.status in ("complete", "aborted", "failed") else "complete"
    result = await runtime.finalize(session_id, status=status)

    scoreable = activity in SCOREABLE_ACTIVITIES if activity else True
    if body.score and scoreable and result.get("turns"):
        from bandready.scoring.speaking import evaluate_session

        async def _score() -> None:
            with contextlib.suppress(Exception):
                await evaluate_session(session_id)

        asyncio.get_running_loop().create_task(_score())
        result["scoring"] = True
    return result


@router.post("/sessions/{session_id}/hangup", summary="Alias of /end (18 §4.7)")
async def hangup_session(
    session_id: str,
    body: EndSessionBody | None = None,
    _: Auth = None,
) -> dict[str, Any]:
    return await end_session(session_id, body)


@router.post("/sessions/{session_id}/score", summary="Score a finished session")
async def score_session(
    session_id: str,
    force: bool = False,
    _: Auth = None,
) -> dict[str, Any]:
    from bandready.scoring.speaking import evaluate_session

    live = runtime.get(session_id)
    if live is not None and not live.ended:
        # Scoring reads the persisted transcript, so the session must be torn down first.
        await runtime.finalize(session_id)
    report = await evaluate_session(session_id, force=force)
    return report


@router.get("/sessions/{session_id}/report", summary="The session's report")
async def session_report(
    session_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    from bandready.scoring.speaking import get_report

    report_id = s.execute(
        select(m.LlmEvaluation.id)
        .where(
            m.LlmEvaluation.subject_kind == "speaking_session",
            m.LlmEvaluation.subject_id == session_id,
            m.LlmEvaluation.status == "ok",
        )
        .order_by(m.LlmEvaluation.created_at.desc())
        .limit(1)
    ).scalars().first()
    if report_id is None:
        raise ApiError(
            404,
            "not_found",
            "this session has not been scored yet — POST …/score first",
        )
    return get_report(report_id)


@router.get("/reports/{report_id}", summary="Speaking report by id")
async def get_report_route(
    report_id: str,
    _: Auth = None,
) -> dict[str, Any]:
    from bandready.scoring.speaking import get_report

    return get_report(report_id)


#: The three tiers the picker offers. `challenging` is round 2's, and cannot live in
#: `speaking_cards.difficulty` — the row schema pins that to core|stretch.
_TIERS = ("core", "stretch", "challenging")


def _set_tiers(s: Any, set_ids: set[str]) -> dict[str, str]:
    """`card_set_id` → `core|stretch|challenging`, read from the set payload.

    Round-2 authors wrote the tier under two different keys and the merge step mirrors
    them, so either answers; a set that declares neither falls back to its own
    `difficulty`, which is what every round-1 set does.
    """
    if not set_ids:
        return {}
    out: dict[str, str] = {}
    rows = s.execute(select(m.CardSet).where(m.CardSet.id.in_(set_ids))).scalars().all()
    for row in rows:
        try:
            payload = json.loads(row.payload_json or "{}")
        except (TypeError, ValueError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        tier = next(
            (
                str(payload.get(key)).strip().lower()
                for key in ("difficulty_tier", "challenge_tier")
                if str(payload.get(key) or "").strip().lower() in _TIERS
            ),
            str(payload.get("difficulty") or "core"),
        )
        out[row.id] = tier
    return out


@router.get("/cards", summary="Question cards (drill topic picker)")
async def list_cards(
    part: Annotated[int | None, Query(ge=1, le=3)] = None,
    tag: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    stmt = select(m.SpeakingCard).where(m.SpeakingCard.retired == 0)
    if part is not None:
        stmt = stmt.where(m.SpeakingCard.part == part)
    if tag:
        stmt = stmt.where(m.SpeakingCard.tags_json.like(f'%"{tag}"%'))
    rows = s.execute(stmt.order_by(m.SpeakingCard.part, m.SpeakingCard.title).limit(limit))
    cards = rows.scalars().all()

    # The third difficulty tier cannot live on the card row (`difficulty` is pinned to
    # core|stretch by the schema), so `challenging` rides in the parent set's payload.
    # The picker needs it here or sixteen challenging sets read as ordinary stretch ones.
    tiers = _set_tiers(s, {c.card_set_id for c in cards if c.card_set_id})

    items = []
    for card in cards:
        try:
            tags = json.loads(card.tags_json or "[]")
        except (TypeError, ValueError):
            tags = []
        items.append(
            {
                "id": card.id,
                "part": card.part,
                "title": card.title,
                "difficulty": card.difficulty,
                "difficulty_tier": tiers.get(card.card_set_id, card.difficulty),
                "tags": tags,
                "card_set_id": card.card_set_id,
                "last_served_at": card.last_served_at,
            }
        )
    if not items:
        # A clean empty state: the built-in fallback set is what a session would use.
        fallback = default_bundle()
        items = [
            {
                "id": "builtin-p1-everyday",
                "part": 1,
                "title": fallback.part1[0].topic if fallback.part1 else "everyday life",
                "difficulty": "core",
                "difficulty_tier": "core",
                "tags": ["built-in"],
                "card_set_id": None,
                "last_served_at": None,
                "builtin": True,
            },
            {
                "id": "builtin-p2-place",
                "part": 2,
                "title": fallback.part2.topic if fallback.part2 else "",
                "difficulty": "core",
                "difficulty_tier": "core",
                "tags": ["built-in"],
                "card_set_id": None,
                "last_served_at": None,
                "builtin": True,
            },
        ]
    return {"items": items, "next_cursor": None}


@router.get("/card-sets/{set_id}", summary="One topic set with all four of its cards")
async def get_card_set(set_id: str, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """A whole Part 1 + Part 2 + Part 3 unit, payloads intact.

    The Topic Coach studies a *set*, not a card: the prep plan lives on the Part 2 card,
    the language bank and vocabulary on the set, and the escalation ladder on the Part 3
    card. Returning them together is one round trip instead of four, and keeps the
    teaching payloads verbatim so the client never has to know their internal shape.

    Model answers are NOT gated here — this route hands back the stored payload as-is,
    and the coach endpoint owns the gate. Callers that must respect it use
    ``/coach/cards/{card_id}/teaching``.
    """
    card_set = s.get(m.CardSet, set_id)
    if card_set is None or card_set.retired:
        raise ApiError(404, "not_found", f"no card set {set_id!r}")

    def _json(raw: Any, fallback: Any) -> Any:
        try:
            return json.loads(raw) if isinstance(raw, str) else (raw if raw is not None else fallback)
        except (TypeError, ValueError):
            return fallback

    rows = s.execute(
        select(m.SpeakingCard)
        .where(m.SpeakingCard.card_set_id == set_id, m.SpeakingCard.retired == 0)
        .order_by(m.SpeakingCard.part, m.SpeakingCard.id)
    )
    cards = [
        {
            "id": c.id,
            "part": c.part,
            "title": c.title,
            "difficulty": c.difficulty,
            "topic_id": c.topic_id,
            "tags_json": _json(c.tags_json, []),
            "payload_json": _json(c.payload_json, {}),
        }
        for c in rows.scalars().all()
    ]
    return {
        "id": card_set.id,
        "title": card_set.title,
        "topic_id": card_set.topic_id,
        "parts_json": _json(card_set.parts_json, [1, 2, 3]),
        "payload_json": _json(card_set.payload_json, {}),
        "cards": cards,
    }


# --------------------------------------------------------------------------- websocket


@router.websocket("/sessions/{session_id}/events")
async def session_events(websocket: WebSocket, session_id: str) -> None:
    """18 §5 event stream. Ticket auth (audience ``session-events``, resource = id).

    Server→client only: the renderer mirrors state and never advances it.
    """
    ticket = websocket.query_params.get("ticket")
    if not verify_ticket(ticket, "session-events", session_id):
        # 1008 = policy violation; the client re-mints a ticket and reconnects.
        await websocket.close(code=1008)
        return

    live = runtime.get(session_id)
    if live is None:
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "detail": "that speaking session is not live",
                "code": "not_found",
                "recoverable": False,
            }
        )
        await websocket.close(code=1000)
        return

    await websocket.accept()
    queue = live.attach()
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=20.0)
            except TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — a dead socket is normal, not an error
        _log.debug("session-events socket for %s ended", session_id, exc_info=True)
    finally:
        live.detach(queue)


def examiner_status() -> tuple[bool, str | None]:
    """Can a language model both ask the questions and write the band?

    ``voice_available`` only answers "is Pipecat importable" — it says nothing about
    the model, and the model is what the examiner *is*. Without one, the SDP exchange
    still succeeds, so the room connects, sits in silence, and the learner discovers
    after eleven minutes of a mock that there was never going to be a band. This is the
    pre-flight answer that stops that, so it must be cheap and side-effect free: it
    reads the resolved config and reproduces the two conditions that would definitely
    fail later, and claims nothing about the ones that only *might*.

    ``build_llm_service`` (voice/pipeline.py) raises when no model name is set, and
    ``get_slot`` itself raises when the stored config interpolates an environment
    variable that is not present — a missing API key is exactly that. Anything else is
    reported as ready, because a wrong port or a stopped Ollama cannot be known without
    a network call and is already handled honestly once the call fails.
    """
    try:
        from bandready.settings_store import get_slot

        cfg = get_slot("llm") or {}
    except Exception:  # noqa: BLE001 — an unresolvable config is a missing one
        return False, (
            "The examiner needs a language model, and this one is not set up yet — its "
            "key is missing. Open Settings → Providers to finish it. Reading, listening, "
            "grammar and vocabulary practice all still work."
        )

    from bandready.providers.presets import is_mock_preset

    if is_mock_preset(cfg.get("preset")) or str(cfg.get("base_url") or "").startswith("mock://"):
        return True, None

    if not str(cfg.get("model") or "").strip():
        return False, (
            "No language model has been chosen yet, so nothing can ask you questions or "
            "mark your answers. Open Settings → Providers and pick one. Reading, "
            "listening, grammar and vocabulary practice all still work."
        )
    return True, None


@router.get("/engine", summary="Voice-engine availability (pre-flight screen)")
async def engine_info(request: Request, _: Auth = None) -> dict[str, Any]:
    """Whether this build can run a live session at all, plus the effective VAD params."""
    from bandready.voice.pipeline import pipecat_available, vad_params

    live = runtime.active()
    examiner_available, examiner_reason = examiner_status()
    return {
        "voice_available": pipecat_available(),
        # The examiner and the marker are the same model, so one flag covers both the
        # "can this session happen" and the "will there be a band" questions.
        "examiner_available": examiner_available,
        "examiner_reason": examiner_reason,
        "vad": vad_params(),
        "live_session_id": live.session_id if live else None,
        "client": request.client.host if request.client else None,
    }
