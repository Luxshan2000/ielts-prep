"""Speaking coach routes — the teaching layer of the speaking pack.

    GET  /api/v1/speaking/coach/cards/{card_id}/teaching   full teaching payload (gated)
    GET  /api/v1/speaking/coach/language-bank              functional language, pack-wide
    GET  /api/v1/speaking/coach/vocabulary/{card_set_id}   topic vocabulary
    POST /api/v1/speaking/coach/vocabulary/{card_set_id}/push   → vocab suggestion inbox
    POST /api/v1/speaking/coach/compare                    attempt vs model at a band
    GET  /api/v1/speaking/coach/part2/plan/{card_id}       the prep-minute structure plan

These are the *coach's* routes. The examiner never touches them: teaching content must
not surface during a Full Mock, and none of this is reachable from the session event
stream.

**The gate.** ``…/teaching`` withholds the model answers (and the two fields that quote
them) until the learner has attempted the card. Unlocking happens one of two ways —
``?attempted=true``, the renderer attesting that the learner has just recorded an
attempt this sidecar has not finalised yet, or an attempt found in a *completed*
session. A live session does not count: the gate must not open mid-turn.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.speaking import coach

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/speaking/coach", tags=["speaking-coach"])


class VocabPushBody(BaseModel):
    """Which items to file. An empty ``items`` means the whole set's list."""

    model_config = ConfigDict(extra="ignore")

    items: list[str] = Field(default_factory=list, max_length=40)


class CompareBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    card_id: str = Field(min_length=1)
    transcript: str = ""
    band_target: int = coach.DEFAULT_BAND
    #: Read the transcript from a finished session instead of sending it inline.
    session_id: str | None = None


# --------------------------------------------------------------------------------------
# Teaching payload
# --------------------------------------------------------------------------------------


@router.get("/cards/{card_id}/teaching", summary="The teaching payload for one card")
def card_teaching(
    card_id: str,
    attempted: Annotated[
        bool,
        Query(
            description=(
                "The caller attests the learner has already attempted this card. "
                "Required to receive model answers when no completed session shows one."
            )
        ),
    ] = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Model answers, functional language, vocabulary, structure, errors, pronunciation.

    Model answers are **absent** unless the gate opens. That is the whole feature: a
    model read before the attempt is a script to memorise, and memorised language is
    what the descriptors decline to credit. ``model_answer_bands`` still tells the UI
    the ladder exists, so it can render a locked tab rather than an empty one.
    """
    card = coach.get_card(s, card_id)
    profile_id = current_profile_id(s)
    gate = coach.gate_state(s, profile_id, card, attested=attempted)
    payload = coach.teaching_payload(s, card, unlocked=gate["unlocked"])
    return {**payload, "gate": gate}


# --------------------------------------------------------------------------------------
# Language bank
# --------------------------------------------------------------------------------------


@router.get("/language-bank", summary="Functional language across the pack")
def language_bank(
    function: str | None = None,
    topic: str | None = None,
    card_set_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Frames grouped by function, with the "sounds canned" negative exemplar beside each.

    Never gated — a frame with an open slot is preparation material, not a model answer.
    ``topic`` accepts either ``environment`` or ``topic_environment``.
    """
    return coach.language_bank(
        s, function=function, topic=topic, card_set_id=card_set_id, limit=limit
    )


# --------------------------------------------------------------------------------------
# Vocabulary
# --------------------------------------------------------------------------------------


@router.get("/vocabulary/{card_set_id}", summary="Topic vocabulary for one card set")
def set_vocabulary(
    card_set_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    return coach.vocabulary_for_set(s, card_set_id)


@router.post("/vocabulary/{card_set_id}/push", status_code=201, summary="File items as suggestions")
@router.post("/vocabulary/{card_set_id}", status_code=201, include_in_schema=False)
def push_vocabulary(
    card_set_id: str,
    body: VocabPushBody = Body(default_factory=VocabPushBody),
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Push selected vocabulary into the **suggestion inbox** — never straight into SRS.

    This is a thin adapter over ``POST /api/v1/vocab/suggestions``: the same normalise →
    dedup → merge pipeline, the same provenance row, and the same ruling that nothing a
    module sends is ever scheduled silently. The learner accepts from the inbox, and only
    then does a card exist.
    """
    from bandready.server.routes.vocab import IngestItem, SuggestionBatch, post_suggestions

    doc = coach.vocabulary_for_set(s, card_set_id)
    items = doc["items"]
    if not items:
        raise ApiError(
            422,
            "validation_error",
            f"card set {card_set_id!r} carries no vocabulary list",
        )
    missing = coach.unknown_terms(items, body.items)
    if missing:
        raise ApiError(
            422,
            "validation_error",
            f"this set has no vocabulary item {missing[0]!r}",
        )

    payloads = coach.suggestion_payloads(
        items, card_set_id=card_set_id, topic_id=doc["topic_id"], wanted=body.items
    )
    batch = SuggestionBatch(items=[IngestItem(**payload) for payload in payloads])
    result = post_suggestions(body=batch, _=None, session=s)
    return {
        "card_set_id": card_set_id,
        "requested": len(payloads),
        "srs_exercises": doc["srs_exercises"],
        **result,
    }


# --------------------------------------------------------------------------------------
# Compare
# --------------------------------------------------------------------------------------


@router.post("/compare", summary="The learner's attempt against the model at a band")
async def compare(
    body: CompareBody,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """What the model does that the learner did not, per criterion, plus what to do next.

    Grounded in this card's own teaching payload — the model answer at the requested
    band, the frames this topic pulls and the errors it provokes — rather than in
    generic band advice. Which frames went unused is decided by string matching here,
    not by the model; the model only says where each one would have fitted.
    """
    card = coach.get_card(s, body.card_id)
    if body.band_target not in coach.BANDS:
        raise ApiError(
            422,
            "validation_error",
            f"band_target must be one of {', '.join(str(b) for b in coach.BANDS)}",
        )
    transcript = body.transcript.strip()
    if not transcript and body.session_id:
        transcript = coach.session_transcript_text(s, body.session_id, part=card.part)
    result = await coach.compare_answer(s, card, transcript, body.band_target)
    return {**result, "session_id": body.session_id}


# --------------------------------------------------------------------------------------
# Part 2 prep-minute plan
# --------------------------------------------------------------------------------------


@router.get("/part2/plan/{card_id}", summary="The structure plan for the prep minute")
def part2_plan(
    card_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The sixty seconds as a procedure: idea prompt, note grid, banner cues, time budget.

    ``post_turn`` is separated on purpose. The trap and the transfer drill are shown
    *after* the turn — the trap as a check ("you covered the last bullet ✓"), never as
    something read while planning.
    """
    card = coach.get_card(s, card_id)
    if card.part != 2:
        raise ApiError(
            422,
            "validation_error",
            f"card {card_id!r} is a Part {card.part} card — the prep minute is Part 2 only",
        )
    plan = coach.structure_plan(card, coach.teaching_of(card))
    if not plan or not plan.get("prep", {}).get("idea_prompt"):
        raise ApiError(
            404,
            "not_found",
            f"card {card_id!r} has no structure plan — it predates the teaching payload",
        )
    return plan
