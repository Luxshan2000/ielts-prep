"""Timed transcript capture (02-voice-pipeline.md §4.1).

The record persisted to ``speaking_sessions.transcript_json``::

    {"turns": [
      {"role": "assistant", "text": "…", "t_ms": 4210},
      {"role": "user", "text": "…", "t_ms": 21050,
       "segments": [{"t_start_ms": 9800, "t_end_ms": 14020}],
       "audio_file": "turn-004.wav", "part": 1, "phase": "P1_QA",
       "card_id": "p1-hometown-q2"}
    ]}

:class:`TranscriptAccumulator` holds all the logic and never imports Pipecat, so the
dedupe/segment-attachment rules are unit-testable. :func:`make_transcript_observer` wraps
it in a Pipecat ``BaseObserver`` that taps frames and dedupes by ``id(frame)`` (a frame is
pushed once per processor link).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

_log = logging.getLogger("bandready.voice.transcript")

__all__ = [
    "TranscriptAccumulator",
    "make_transcript_observer",
]


class TranscriptAccumulator:
    """Builds the ``{"turns": [...]}`` record from turn + VAD-segment events."""

    def __init__(
        self,
        stamp: Callable[[], dict[str, Any]] | None = None,
        on_assistant_turn: Callable[[str, int], Any] | None = None,
        on_user_turn: Callable[[str, int, float], Any] | None = None,
    ) -> None:
        #: Returns the session's current ``{"part":…, "phase":…, "card_id":…}`` stamp.
        self._stamp = stamp
        self.on_assistant_turn = on_assistant_turn
        self.on_user_turn = on_user_turn
        self._turns: list[dict[str, Any]] = []
        self._open_segment: dict[str, int] | None = None
        self._pending_segments: list[dict[str, int]] = []

    # ------------------------------------------------------------------ segments

    def segment_start(self, t_ms: int) -> None:
        self._open_segment = {"t_start_ms": int(t_ms)}

    def segment_end(self, t_ms: int) -> None:
        if self._open_segment is None:
            return
        segment = {
            "t_start_ms": int(self._open_segment["t_start_ms"]),
            "t_end_ms": int(t_ms),
        }
        self._open_segment = None
        if segment["t_end_ms"] >= segment["t_start_ms"]:
            self._pending_segments.append(segment)

    def take_segments(self) -> list[dict[str, int]]:
        """Detach the segments accumulated since the last committed user turn."""
        segments = self._pending_segments
        self._pending_segments = []
        return segments

    # ------------------------------------------------------------------ turns

    def user_turn(
        self, text: str, t_ms: int, segments: list[dict[str, int]] | None = None
    ) -> dict[str, Any]:
        segs = segments if segments is not None else self.take_segments()
        turn: dict[str, Any] = {
            "role": "user",
            "text": text.strip(),
            "t_ms": int(t_ms),
            "segments": segs,
        }
        turn.update(self._current_stamp())
        self._turns.append(turn)
        if self.on_user_turn is not None:
            speech_s = sum(s["t_end_ms"] - s["t_start_ms"] for s in segs) / 1000.0
            try:
                self.on_user_turn(turn["text"], turn["t_ms"], speech_s)
            except Exception:  # noqa: BLE001 — never break capture over a listener
                _log.exception("user-turn listener failed")
        return turn

    def assistant_turn(self, text: str, t_ms: int) -> dict[str, Any]:
        turn: dict[str, Any] = {
            "role": "assistant",
            "text": text.strip(),
            "t_ms": int(t_ms),
        }
        turn.update(self._current_stamp())
        self._turns.append(turn)
        if self.on_assistant_turn is not None:
            try:
                self.on_assistant_turn(turn["text"], turn["t_ms"])
            except Exception:  # noqa: BLE001
                _log.exception("assistant-turn listener failed")
        return turn

    def _current_stamp(self) -> dict[str, Any]:
        if self._stamp is None:
            return {}
        try:
            stamp = self._stamp() or {}
        except Exception:  # noqa: BLE001
            return {}
        return {k: v for k, v in stamp.items() if v is not None}

    # ------------------------------------------------------------------ output

    def set_audio_file(self, turn_index: int, filename: str | None) -> None:
        if 0 <= turn_index < len(self._turns):
            self._turns[turn_index]["audio_file"] = filename

    def last_user_index(self) -> int | None:
        for i in range(len(self._turns) - 1, -1, -1):
            if self._turns[i].get("role") == "user":
                return i
        return None

    @property
    def turns(self) -> list[dict[str, Any]]:
        return self._turns

    def record(self) -> dict[str, Any]:
        return {"turns": [dict(t) for t in self._turns]}

    def merge(self, record: dict[str, Any]) -> None:
        """Replace the collected turns (used by the headless test seam)."""
        self._turns = [dict(t) for t in (record.get("turns") or [])]


_OBSERVER_CLASS: Any = None


def make_transcript_observer(accumulator: TranscriptAccumulator) -> Any:
    """Wrap an accumulator in a Pipecat observer (needs Pipecat)."""
    global _OBSERVER_CLASS
    if _OBSERVER_CLASS is None:
        from bandready.voice.pipeline import require_pipecat

        require_pipecat()
        from pipecat.frames.frames import (
            LLMFullResponseEndFrame,
            LLMFullResponseStartFrame,
            LLMTextFrame,
            TranscriptionFrame,
            UserStartedSpeakingFrame,
            UserStoppedSpeakingFrame,
        )
        from pipecat.observers.base_observer import BaseObserver, FramePushed

        class _TimedTranscriptObserver(BaseObserver):  # type: ignore[misc,valid-type]
            def __init__(self, acc: TranscriptAccumulator) -> None:
                super().__init__()
                self.acc = acc
                self._seen: set[int] = set()
                self._buf: list[str] = []
                self._in_response = False

            async def on_push_frame(self, data: FramePushed) -> None:
                frame = data.frame
                fid = id(frame)
                if fid in self._seen:
                    return
                # Pipecat observer timestamps are ns since task start.
                ts_ms = int((getattr(data, "timestamp", 0) or 0) / 1_000_000)

                if isinstance(frame, UserStartedSpeakingFrame):
                    self._seen.add(fid)
                    self.acc.segment_start(ts_ms)
                elif isinstance(frame, UserStoppedSpeakingFrame):
                    self._seen.add(fid)
                    self.acc.segment_end(ts_ms)
                elif isinstance(frame, TranscriptionFrame):
                    self._seen.add(fid)
                    text = (getattr(frame, "text", "") or "").strip()
                    if text:
                        self.acc.user_turn(text, ts_ms)
                elif isinstance(frame, LLMFullResponseStartFrame):
                    self._seen.add(fid)
                    self._in_response = True
                    self._buf = []
                elif isinstance(frame, LLMTextFrame) and self._in_response:
                    self._seen.add(fid)
                    self._buf.append(getattr(frame, "text", "") or "")
                elif isinstance(frame, LLMFullResponseEndFrame):
                    self._seen.add(fid)
                    self._in_response = False
                    text = "".join(self._buf).strip()
                    self._buf = []
                    if text:
                        self.acc.assistant_turn(text, ts_ms)

            def record(self) -> dict[str, Any]:
                return self.acc.record()

        _OBSERVER_CLASS = _TimedTranscriptObserver
    return _OBSERVER_CLASS(accumulator)
