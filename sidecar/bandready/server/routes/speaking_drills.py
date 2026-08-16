"""Speaking-drill routes — the practice layer over the teaching payload.

    GET  /api/v1/speaking/drills/kinds                     the four kinds and their contracts
    GET  /api/v1/speaking/drills/cards/{card_id}           this card's drills + a two-minute set
    POST /api/v1/speaking/drills/audio                     render one item's reference audio
    POST /api/v1/speaking/drills/attempts                  record, grade, persist (multipart)
    GET  /api/v1/speaking/drills/history                   recent attempts + per-kind accuracy

Every item is built from the card the learner is on — its ``pronunciation_focus``, its
``error_watchlist``, its band-7 model, its set's language bank. There is no generic drill
bank behind this and there is deliberately no way to ask for one: practice that is not
tied to the card is practice the learner could have done in any app.

Two rules this module enforces rather than assumes:

**The gate.** Shadowing quotes the band-7 model a sentence at a time, so it obeys the
same gate as the model answers themselves — :func:`coach.gate_state`, the identical call
the teaching route makes. The three other kinds quote nothing gated and always ship.

**Exam conditions.** Drills are coaching. Every entry point here is shut for the duration
of a Full Mock, exactly like the rest of the coach, and says so with the same 409.

Grading lives in :mod:`bandready.speaking.drills` and is mechanical wherever the question
is mechanical; this module is the HTTP surface over it and holds no rules of its own.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db.engine import get_session
from bandready.pron import analyze as pron
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.speaking import coach, drills, mock

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/speaking/drills", tags=["speaking-drills"])

#: A drill recording is seconds long. 16 MB is already an order of magnitude of headroom.
MAX_UPLOAD_BYTES = 16 * 1024 * 1024

#: Last resort only. The voice for reference audio comes from the learner's own
#: text-to-speech setting (:func:`_default_voice`); this is what is used when that slot
#: names no voice at all — a remote provider whose ``voice`` field is still blank, say.
#: HVPT wants multiple talkers, so the client may still vary it per item.
DEFAULT_VOICE = "bf_emma"


def _default_voice(cfg: Any) -> str:
    """The voice this install actually speaks in, not a constant baked in at build time.

    ``DEFAULT_VOICE`` was hardcoded, so a learner who changed the voice in Settings kept
    hearing ``bf_emma`` in every drill — the setting was real, saved, displayed, and
    ignored by this one route.
    """
    return str((cfg or {}).get("voice") or "").strip() or DEFAULT_VOICE


class AudioBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    card_id: str = Field(min_length=1)
    item_id: str = Field(min_length=1)
    #: Vary this across repeats: single-voice minimal-pair drills lose most of the effect.
    #: Empty means "whatever voice Settings names" — not a constant, see `_default_voice`.
    voice: str = ""
    attempted: bool = False


# --------------------------------------------------------------------------------------
# Shared plumbing
# --------------------------------------------------------------------------------------


def _no_mock_in_progress(s: Session, profile_id: str) -> None:
    """Refuse every drill entry point while a sitting is open (mock §2)."""
    conditions = mock.exam_conditions(s, profile_id)
    if conditions is not None:
        raise ApiError(
            409,
            "conflict",
            f"{mock.EXAM_CONDITIONS_MESSAGE} (sitting {conditions['session_id']})",
        )


def _items_for(
    s: Session, card_id: str, *, attempted: bool, kinds: list[str] | None = None
) -> tuple[Any, dict[str, Any], list[dict[str, Any]]]:
    """``(card, gate, items)`` — the one place items are assembled for a request."""
    card = coach.get_card(s, card_id)
    profile_id = current_profile_id(s)
    _no_mock_in_progress(s, profile_id)
    gate = coach.gate_state(s, profile_id, card, attested=attempted)
    items = drills.build_items(s, card, unlocked=bool(gate["unlocked"]), kinds=kinds)
    return card, gate, items


def _parse_kinds(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    wanted = [k.strip() for k in raw.split(",") if k.strip()]
    unknown = [k for k in wanted if k not in drills.DRILL_KINDS]
    if unknown:
        raise ApiError(
            422,
            "validation_error",
            f"unknown drill kind(s) {', '.join(unknown)} — expected {', '.join(drills.DRILL_KINDS)}",
        )
    return wanted or None


# --------------------------------------------------------------------------------------
# The contract
# --------------------------------------------------------------------------------------


@router.get("/kinds", summary="The four drill kinds and how each is graded")
def get_kinds(_: Auth = None) -> dict[str, Any]:
    """Static: lets a client render the picker and the grading promise without a card."""
    return {
        "kinds": [
            {
                "kind": "shadowing",
                "title": "Shadow the sentence",
                "seconds": drills.DRILL_SECONDS["shadowing"],
                "graded_by": "stt_alignment",
                "gated": True,
                "trains": "rhythm, thought groups, sentence stress",
                "blurb": (
                    "One sentence from the model, spoken to you, repeated by you. The "
                    "evidence puts shadowing behind prosody and fluency — not phonemes."
                ),
            },
            {
                "kind": "minimal_pair",
                "title": "Say the harder one",
                "seconds": drills.DRILL_SECONDS["minimal_pair"],
                "graded_by": "stt_contains",
                "gated": False,
                "trains": "the one contrast this card's vocabulary keeps stumbling on",
                "blurb": (
                    "Pairs drawn from this card's pronunciation focus. Pass means the "
                    "transcriber heard your word and not its neighbour."
                ),
            },
            {
                "kind": "error_repair",
                "title": "Say it correctly",
                "seconds": drills.DRILL_SECONDS["error_repair"],
                "graded_by": "stt_repair",
                "gated": False,
                "trains": "the grammar or lexis pattern this topic provokes",
                "blurb": (
                    "The error in this topic's own words, then you saying the fix out "
                    "loud. Naming the form is what makes correction stick."
                ),
            },
            {
                "kind": "extend",
                "title": "Keep going for thirty seconds",
                "seconds": drills.DRILL_SECONDS["extend"],
                "graded_by": "stt_fluency",
                "gated": False,
                "trains": "not stopping — the commonest self-inflicted band loss",
                "blurb": (
                    "A too-short answer and thirty seconds. Reports words per minute, "
                    "long pauses, and whether you reached for the set's language."
                ),
            },
        ],
        "set_budget_s": drills.SET_BUDGET_S,
        "grading_modes": list(drills.GRADING_MODES),
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# Items for a card
# --------------------------------------------------------------------------------------


@router.get("/cards/{card_id}", summary="Drills built from one card's teaching payload")
def card_drills(
    card_id: str,
    attempted: Annotated[
        bool,
        Query(description="The caller attests the learner has already attempted this card."),
    ] = False,
    kinds: Annotated[
        str | None, Query(description="Comma-separated subset of the four kinds.")
    ] = None,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Every drill this card can offer, plus the two-minute set to run first.

    ``plan`` is one item of each available kind inside a 120-second speaking budget —
    the session length the research actually supports, rather than a wall of exercises
    nobody finishes.
    """
    card, gate, items = _items_for(s, card_id, attempted=attempted, kinds=_parse_kinds(kinds))
    payload = coach.payload_of(card)
    available = sorted({item["kind"] for item in items}, key=drills.DRILL_KINDS.index)
    unavailable = [k for k in drills.DRILL_KINDS if k not in available]

    reasons = {
        kind: drills.unavailable_reason(card, kind, unlocked=bool(gate["unlocked"]))
        for kind in unavailable
    }

    return {
        "card_id": card.id,
        "card_set_id": card.card_set_id,
        "part": card.part,
        "topic": drills.clip(payload.get("topic"), 600) or card.title,
        "difficulty": card.difficulty,
        "gate": gate,
        "items": items,
        "plan": drills.two_minute_set(items),
        "available_kinds": available,
        "unavailable_kinds": reasons,
        "set_budget_s": drills.SET_BUDGET_S,
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# Reference audio
# --------------------------------------------------------------------------------------


@router.post(
    "/audio",
    status_code=status.HTTP_201_CREATED,
    summary="Render one item's reference audio (Kokoro, cached)",
)
async def render_audio(body: AudioBody, _: Auth = None, s: Db = None) -> dict[str, Any]:
    """Synthesize the item's spoken prompt into the cache the media route already reads.

    The file lands at ``media/pron/ref/<voice>/<sha1(text)>-<generation>[-<identity>].wav``
    — the exact path ``GET /api/v1/media/pron/ref`` resolves, both computed by
    :func:`bandready.pron.analyze.reference_rel_path` — and is registered as a ``pron_ref``
    cache entry so both the LRU sweep and the generated-audio purge can reclaim it.
    Calling this twice is free: an existing render is returned without touching the engine.

    Because the provider identity is part of the name, switching text-to-speech provider
    in Settings makes this a miss and the clip is re-synthesized with the engine the
    learner actually chose — no migration, and the old clip simply stops being addressed.
    """
    _, _gate, items = _items_for(s, body.card_id, attempted=body.attempted)
    item = drills.find_item(items, body.item_id)
    if item is None:
        raise ApiError(404, "not_found", f"no drill item {body.item_id!r} on card {body.card_id!r}")

    audio = item.get("audio") or {}
    phrase = str(audio.get("text") or "").strip()
    if not phrase:
        raise ApiError(422, "validation_error", "this drill item has nothing to speak")

    from bandready.audio import stitch, tts_render

    cfg = tts_render.tts_config()
    voice = (body.voice or _default_voice(cfg)).strip() or _default_voice(cfg)
    if "/" in voice or ".." in voice:
        raise ApiError(422, "validation_error", "invalid voice id")

    rel = pron.reference_rel_path(voice, phrase, cfg)
    target = pron.media_root() / rel
    url = f"/api/v1/media/pron/ref?voice={quote(voice)}&text={quote(phrase)}"

    if not (target.is_file() and target.stat().st_size > 0):
        target.parent.mkdir(parents=True, exist_ok=True)
        pcm, rate = await tts_render.synthesize_line(phrase, voice, cfg)
        if not getattr(pcm, "size", 0):
            raise ApiError(502, "provider_error", "the TTS engine returned no audio for this line")
        size = stitch.write_wav(target, pcm, rate)
        tts_render.register_media(
            pron.reference_media_hash(voice, phrase, cfg), "pron_ref", rel, size
        )

    return {
        "item_id": item["item_id"],
        "kind": item["kind"],
        "role": audio.get("role"),
        "text": phrase,
        "voice": voice,
        "media_url": url,
        "rel_path": rel,
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# Attempts
# --------------------------------------------------------------------------------------


def _attempt_path() -> Path:
    root = pron.media_root() / "pron" / "attempts"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{ULID()}.wav"


@router.post(
    "/attempts",
    status_code=status.HTTP_201_CREATED,
    summary="Grade one drill attempt and record it",
)
async def post_attempt(
    card_id: Annotated[str, Form()],
    item_id: Annotated[str, Form()],
    wav: Annotated[UploadFile | None, File()] = None,
    transcript: Annotated[str | None, Form()] = None,
    choice: Annotated[str | None, Form()] = None,
    attempted: Annotated[bool, Form()] = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Record → local STT → mechanical grade → (only if unclear) one model call → store.

    ``wav`` is the normal path. ``transcript`` is accepted instead for two real cases: a
    perception item, which has no recording at all, and a renderer that already ran STT
    client-side. Sending neither is a 422 rather than a zero score, because a drill
    graded on silence teaches the learner something false.

    The recording is written under ``media/pron/attempts/`` and, per 11 §9 rule 1, is
    never registered in ``media_files`` — user voice data is not cache and is never swept.
    """
    _card, _gate, items = _items_for(s, card_id, attempted=attempted)
    item = drills.find_item(items, item_id)
    if item is None:
        raise ApiError(404, "not_found", f"no drill item {item_id!r} on card {card_id!r}")

    profile_id = current_profile_id(s)
    mode = item["grading"]["mode"]

    words: list[dict[str, Any]] = []
    said = (transcript or "").strip()
    duration_ms: int | None = None
    audio_rel: str | None = None

    if mode == "choice":
        result = drills.grade(item, choice=choice)
    else:
        if wav is not None:
            payload = await wav.read()
            if not payload:
                raise ApiError(422, "validation_error", "the uploaded recording is empty")
            if len(payload) > MAX_UPLOAD_BYTES:
                raise ApiError(422, "validation_error", "recording exceeds the 16 MB upload limit")
            target = _attempt_path()
            target.write_bytes(payload)
            audio_rel = target.relative_to(pron.media_root()).as_posix()
            words, heard, duration_ms = await drills.transcribe(target)
            said = heard or said
        elif not said:
            raise ApiError(
                422,
                "validation_error",
                "send the recording as `wav`, or a `transcript` if the client already "
                "transcribed it — this item is graded on what was actually said",
            )
        else:
            # A client that transcribed for us gives word identities but no timings or
            # confidences. That is the same degradation 09 §3.1 prescribes: the rhythm
            # report goes unavailable and the word rows store ``score: null`` rather
            # than a number nothing measured.
            words = pron.words_from_transcript(said)

        result = drills.grade(item, transcript=said, words=words, duration_ms=duration_ms)
        if result["needs_judgement"]:
            result = await drills.judge(item, said, result)

    written = drills.persist(
        s,
        profile_id,
        item,
        result,
        words=words,
        transcript=said,
        duration_ms=duration_ms,
        audio_path=audio_rel,
    )

    return {
        "item_id": item["item_id"],
        "card_id": item.get("card_id"),
        "card_set_id": item.get("card_set_id"),
        "kind": item["kind"],
        "mode": result["mode"],
        "passed": result["passed"],
        "score": result["score"],
        "checks": result["checks"],
        "detail": result.get("detail"),
        "feedback": result.get("feedback"),
        "judgement": result.get("judgement"),
        "expected": item["expected"],
        "you_said": drills.clip(said, 1200),
        "audio_path": audio_rel,
        "media_url": (
            f"/api/v1/media/{audio_rel}" if audio_rel else None
        ),
        "stored": written,
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# History
# --------------------------------------------------------------------------------------


@router.get("/history", summary="Recent drill attempts and per-kind accuracy")
def get_history(
    kind: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Read back out of ``practice_sessions`` — drills add no table of their own."""
    profile_id = current_profile_id(s)
    _no_mock_in_progress(s, profile_id)
    return {
        **drills.history(s, profile_id, kind=kind, limit=limit),
        "contrasts": pron.contrast_accuracy(s, profile_id),
        "accent_notice": pron.ACCENT_NOTICE,
    }


__all__ = ["router"]
