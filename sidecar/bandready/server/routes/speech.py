"""`/api/v1/speech` — turn a recording into text, and say whether that is possible at all.

Two screens already transcribe a spoken answer and hand the string to a grader that was
written for typed input: `POST /vocab/speak` and `POST /grammar/answer/spoken`. Both wrap the
same two lines. Placement needs a third, and a fourth would be one too many, so the shared
part lives here.

`GET /speech/capabilities` exists because the honest answer to "can I speak my answer?" has to
be available *before* the microphone button is drawn. Offering to record and then failing is
worse than not offering: the learner has already spoken by then, and blaming their microphone
for a missing dependency is the kind of wrong-subsystem message this app has been bitten by
before.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile
from ulid import ULID

from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.speech import answers

router = APIRouter(prefix="/api/v1/speech", tags=["speech"])


def _scratch() -> Path:
    """One recording's scratch file, deleted in a finally — this is user voice data and has
    no reason to outlive the request that read it (11 §9 rule 1)."""
    root = Path(tempfile.gettempdir()) / "bandready-speech"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{ULID()}.wav"


@router.get("/capabilities", summary="Can this machine turn speech into text right now?")
def capabilities(_: None = Depends(require_auth)) -> dict[str, Any]:
    """Whether a screen may offer a microphone, and what to say when it may not.

    Deliberately cheap and side-effect free: this is called on render, so it asks whether the
    dependency imports rather than loading a model or touching the network.
    """
    try:
        from bandready.speaking import drills  # noqa: F401

        available, reason = True, None
    except Exception as exc:  # noqa: BLE001 — the voice extra is optional by design
        available = False
        reason = (
            "Speech-to-text is not installed in this build. You can still type your answers, "
            "and you can set speech up later in Settings."
        )
        _ = exc

    return {
        "transcription": available,
        "reason": reason,
        # What a screen should show instead. Named rather than left to each caller to invent,
        # so the same absence does not get five different explanations across the app.
        "fallback": "typing",
    }


@router.post("/transcribe", summary="Transcribe one short recording")
async def transcribe(
    wav: UploadFile = File(...),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    """Return what was heard, and whether it is worth using.

    No grading happens here — the caller decides what the words are for. A recording that
    holds no speech comes back `gradeable: false` with a reason the learner can act on,
    because silence must never be mistaken for a poor answer.
    """
    target = _scratch()
    target.write_bytes(await wav.read())
    try:
        spoken = await answers.transcribe_answer(target)
    except answers.SpeechUnavailable as exc:
        raise ApiError(
            503,
            "speech_unavailable",
            "Speech-to-text is not set up on this machine, so a recording cannot be read. "
            "Type your answer instead, or set speech up in Settings.",
        ) from exc
    finally:
        target.unlink(missing_ok=True)

    return spoken.as_wire()
