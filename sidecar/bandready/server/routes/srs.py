"""Spaced-repetition routes (18-api-contract.md §4.11; behaviour per 08 §4, §5, §7, §8).

``GET /due`` (and its 18 §4.11 alias ``GET /queue``) returns the next chunk of the queue
with each card's exercise already rendered, so the renderer never has to know the §5.2
maturity table. ``POST /review`` is the single write path: it runs the FSRS transaction,
appends the append-only log row, and hands back the updated card plus the next-interval
preview the rating buttons display.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.routes.vocab import serialize_entry
from bandready.srs import exercises as ex
from bandready.srs import scheduler as sched

_log = logging.getLogger("bandready.srs.routes")

router = APIRouter(prefix="/api/v1/srs", tags=["srs"])

DEFAULT_CHUNK = 20


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    card_id: str | None = None
    entry_id: str | None = None
    rating: int = Field(ge=1, le=4)
    exercise_type: Literal[
        "flip", "cloze", "use_in_sentence", "collocation", "audio_recall", "speaking_drill"
    ] = "flip"
    elapsed_ms: int | None = Field(default=None, ge=0, le=3_600_000)


def _now() -> datetime:
    return datetime.now(UTC)


def _distractor_pool(session: Session, profile_id: str, exclude: str) -> list[str]:
    """Same-bank headwords used as collocation-match decoys (§5.2.4)."""
    rows = (
        session.execute(
            select(m.VocabEntry.headword)
            .where(
                m.VocabEntry.profile_id == profile_id,
                m.VocabEntry.status == "active",
                m.VocabEntry.id != exclude,
            )
            .limit(60)
        )
        .scalars()
        .all()
    )
    return [str(r) for r in rows]


def _queue_items(
    session: Session,
    profile_id: str,
    limit: int,
    *,
    allow_llm: bool = True,
    rng: random.Random | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    now = now or _now()
    rng = rng or random.Random()
    pairs = sched.due_queue(session, profile_id, limit, now)
    items: list[dict[str, Any]] = []
    for card, entry in pairs:
        doc = serialize_entry(entry, card)
        kind = ex.choose_exercise(doc, doc["srs"], rng=rng, allow_llm=allow_llm)
        distractors: list[str] = []
        if kind == "collocation":
            pool = _distractor_pool(session, profile_id, entry.id)
            distractors = rng.sample(pool, min(3, len(pool)))
        exercise = ex.build_exercise(kind, doc, doc["srs"], distractors=distractors, rng=rng)
        items.append(
            {
                "card_id": card.id,
                "entry_id": entry.id,
                "entry": doc,
                "exercise": exercise,
                "exercise_type": exercise["type"],
                "intervals": sched.preview_intervals(card, now),
            }
        )
    return items


@router.get("/due", summary="Next review chunk plus queue counters")
def due(
    limit: int = Query(default=DEFAULT_CHUNK, ge=1, le=100),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    now = _now()
    return {
        "items": _queue_items(session, profile_id, limit, now=now),
        "counts": sched.counts(session, profile_id, now),
        "generated_at": sched.iso(now),
    }


@router.get("/queue", summary="Next review chunk (18 §4.11 alias of /due)")
def queue(
    limit: int = Query(default=DEFAULT_CHUNK, ge=1, le=100),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return due(limit=limit, _=None, session=session)


@router.get("/session", summary="A composed review session of N cards with mixed exercises")
def compose_session(
    count: int = Query(default=DEFAULT_CHUNK, ge=1, le=50),
    seed: int | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    now = _now()
    rng = random.Random(seed) if seed is not None else random.Random()
    items = _queue_items(session, profile_id, count, rng=rng, now=now)
    tallies = sched.counts(session, profile_id, now)
    mix: dict[str, int] = {}
    for item in items:
        mix[item["exercise_type"]] = mix.get(item["exercise_type"], 0) + 1
    return {
        "items": items,
        "size": len(items),
        "chunk_limit": DEFAULT_CHUNK,
        "mix": mix,
        "counts": tallies,
        "remaining_after": max(0, tallies["due_today"] - len(items)),
        "streak": sched.streak(session, profile_id, now),
        "generated_at": sched.iso(now),
    }


@router.post("/review", summary="Rate a card — FSRS transaction + append-only log")
def post_review(
    body: ReviewRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    now = _now()

    card: m.SrsCard | None = None
    if body.card_id:
        card = session.get(m.SrsCard, body.card_id)
    elif body.entry_id:
        card = session.execute(
            select(m.SrsCard).where(m.SrsCard.entry_id == body.entry_id)
        ).scalar_one_or_none()
    else:
        raise ApiError(422, "validation_error", "card_id or entry_id is required")
    if card is None:
        raise ApiError(404, "not_found", "no scheduled card with that id")

    entry = session.get(m.VocabEntry, card.entry_id)
    if entry is None or entry.profile_id != profile_id:
        raise ApiError(404, "not_found", "no scheduled card with that id")
    if entry.status not in ("active",):
        raise ApiError(
            409, "conflict", f"entry {entry.id} is {entry.status} and is not being scheduled"
        )

    card, log_row = sched.review(
        card,
        body.rating,
        now,
        exercise_type=body.exercise_type,
        elapsed_ms=body.elapsed_ms,
    )
    session.add(log_row)
    session.flush()

    return {
        "card": sched.card_public(card, now),
        "entry_id": entry.id,
        "rating": body.rating,
        "exercise_type": body.exercise_type,
        "next_intervals": sched.preview_intervals(card, now),
        "logged_at": log_row.reviewed_at,
        "counts": sched.counts(session, profile_id, now),
    }


@router.get("/stats", summary="Retention, streak, maturity counts, forecast (§8)")
def stats(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    return sched.stats(session, profile_id)
