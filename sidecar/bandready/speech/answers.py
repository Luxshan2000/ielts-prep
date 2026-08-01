"""Turning a spoken answer into the string the existing graders already take.

**A spoken answer is a typed answer that arrived by microphone.** It is transcribed here, at
the edge, and from that point travels the identical path: same grader, same rating map, same
log row, same card. There is no second grading path and no exercise kind whose name contains
the word *speak*.

That is not a shortcut, it is the cheap option in every direction. ``srs_review_logs
.review_type`` is CheckConstraint-ed to six values and ``speaking_drill`` is already one of
them, so nothing here needs a migration on a live database. Grammar's item-kind enum is
closed at fourteen and already contains ``speaking_drill`` too. And ``judge_production()``
already takes a ``str``, with three fairness mechanisms — span-quoting enforcement, two-call
confirmation, and offline-is-an-accept — that a parallel spoken grader would reimplement
worse and then let drift.

What this module adds on top of :func:`speaking.drills.transcribe` is the guard that a
microphone needs and a keyboard does not: silence, noise and hallucination. Whisper is
cheerfully willing to invent a fluent sentence from two seconds of room tone, and a grader
handed that invention will mark it — sometimes correct. Refusing to answer is the only honest
response to an empty recording, and it must be distinguishable from a wrong answer, because
telling somebody they were wrong when the microphone never heard them is worse than telling
them nothing.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_log = logging.getLogger("bandready.speech.answers")

#: Below this, there is no speech to grade. A genuine one-word answer clears it easily.
MIN_SPEECH_MS = 400

#: Whisper's stock hallucinations on silence. Matched whole and case-insensitively; these are
#: what the model emits for room tone, not things a learner says.
_HALLUCINATIONS: frozenset[str] = frozenset(
    {
        "you",
        "thank you",
        "thanks for watching",
        "thank you for watching",
        "thanks for watching!",
        "bye",
        "bye.",
        "please subscribe",
        "subtitles by the amara.org community",
        "amara.org",
        "www.mooji.org",
        "the end",
        "silence",
        "[silence]",
        "[music]",
        "[blank_audio]",
        "音乐",
    }
)


class SpeechUnavailable(Exception):
    """No speech-to-text is configured or installed, so nothing can be transcribed."""


@dataclass(frozen=True)
class SpokenAnswer:
    """A transcript, plus the reason it must not be graded when there is one."""

    transcript: str
    duration_ms: int | None
    words: list[dict[str, Any]]
    #: ``None`` when the transcript is safe to grade; otherwise why it is not.
    refusal: str | None = None

    @property
    def gradeable(self) -> bool:
        return self.refusal is None and bool(self.transcript.strip())

    def as_wire(self) -> dict[str, Any]:
        return {
            "transcript": self.transcript,
            "duration_ms": self.duration_ms,
            "heard": self.transcript,
            "gradeable": self.gradeable,
            "refusal": self.refusal,
        }


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s']", "", text or "")).strip().lower()


#: The set above, normalised the same way the input is. Comparing a raw entry against a
#: stripped input silently never matches — "amara.org" becomes "amaraorg" on one side only,
#: so the entry with a dot in it was dead the moment it was written.
_HALLUCINATIONS_NORMALISED: frozenset[str] = frozenset(
    _normalise(phrase) for phrase in _HALLUCINATIONS
)


def refusal_for(transcript: str, duration_ms: int | None) -> str | None:
    """Why this recording must not be graded, or ``None`` if it may be.

    Ordered so the message names the learner's actual situation: a recording too short to
    contain speech is a different problem from one the recogniser could not make out.
    """
    if duration_ms is not None and duration_ms < MIN_SPEECH_MS:
        return "That recording was too short to hear. Hold the button and say the whole sentence."

    bare = _normalise(transcript)
    if not bare:
        return "Nothing was picked up. Check the microphone is not muted and try again."

    if bare in _HALLUCINATIONS_NORMALISED:
        # Whisper produces these from silence. Grading one would mark a learner on a
        # sentence the model wrote for them.
        return "Nothing was picked up. Check the microphone is not muted and try again."

    return None


async def transcribe_answer(wav_path: Path) -> SpokenAnswer:
    """Transcribe one short recording and decide whether it can be graded at all."""
    try:
        from bandready.speaking import drills
    except Exception as exc:  # noqa: BLE001 — the voice extra is optional
        raise SpeechUnavailable(str(exc)) from exc

    words, transcript, duration_ms = await drills.transcribe(Path(wav_path))
    transcript = (transcript or "").strip()

    refusal = refusal_for(transcript, duration_ms)
    if refusal:
        _log.info("spoken answer refused: %s (heard %r)", refusal, transcript[:60])

    return SpokenAnswer(
        transcript=transcript,
        duration_ms=duration_ms,
        words=list(words or []),
        refusal=refusal,
    )
