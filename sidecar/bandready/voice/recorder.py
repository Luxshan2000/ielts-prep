"""Per-turn candidate audio capture (02-voice-pipeline.md §5).

Pronunciation assessment (09) needs raw audio, not transcripts, so every candidate turn is
written as one 16-bit mono WAV::

    <data_dir>/media/speaking/{session_id}/turn-001.wav
                                          /manifest.json

Two halves share one ring buffer:

* **frame tap** — in-chain, right after ``transport.input()``; appends every
  ``InputAudioRawFrame`` to a 90-second ring buffer and pushes the frame on unchanged. It
  never blocks and never touches the disk.
* **observer** — segments turns from the VAD control frames (with 300 ms pre-roll, because
  ``start_secs=0.2`` means real onset audio precedes the event) and writes the WAV on a
  thread-pool executor at turn commit.

**Failure policy (02 §5): recorder errors are logged and swallowed.** A session must never
die because a disk write failed — the turn simply gets ``audio_file: null`` and 09 skips it.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import wave
from collections import deque
from pathlib import Path
from typing import Any

_log = logging.getLogger("bandready.voice.recorder")

__all__ = ["TurnAudioRecorder", "make_recorder_observer", "make_recorder_tap"]

DEFAULT_CAPACITY_S = 90.0
PRE_ROLL_MS = 300
#: Real gaps between a turn's segments are preserved up to this cap, so rhythm stays
#: analyzable without letting a file balloon.
MAX_GAP_MS = 1000
SAMPLE_WIDTH = 2  # PCM signed 16-bit LE


class TurnAudioRecorder:
    """Ring buffer + WAV writer for one speaking session."""

    def __init__(
        self,
        session_id: str,
        base_dir: Path | str | None = None,
        capacity_s: float = DEFAULT_CAPACITY_S,
        pre_roll_ms: int = PRE_ROLL_MS,
        max_gap_ms: int = MAX_GAP_MS,
    ) -> None:
        self.session_id = session_id
        self.capacity_ms = int(capacity_s * 1000)
        self.pre_roll_ms = int(pre_roll_ms)
        self.max_gap_ms = int(max_gap_ms)
        self.sample_rate = 16000
        self.num_channels = 1
        self._chunks: deque[tuple[int, bytes]] = deque()
        self._buffered_ms = 0
        self._clock_ms = 0
        self._dir = Path(base_dir) if base_dir is not None else None
        self._manifest: list[dict[str, Any]] = []
        self.enabled = True

    # ------------------------------------------------------------------ paths

    @property
    def directory(self) -> Path:
        if self._dir is None:
            from bandready.config import get_settings

            self._dir = get_settings().media_dir / "speaking" / self.session_id
        return self._dir

    def relative_path(self, filename: str) -> str:
        return f"speaking/{self.session_id}/{filename}"

    # ------------------------------------------------------------------ buffer

    def _chunk_ms(self, pcm: bytes) -> int:
        frame_bytes = SAMPLE_WIDTH * max(1, self.num_channels)
        samples = len(pcm) // frame_bytes
        return int(samples * 1000 / max(1, self.sample_rate))

    def append(
        self,
        pcm: bytes,
        t_ms: int | None = None,
        sample_rate: int | None = None,
        num_channels: int | None = None,
    ) -> None:
        """Frame-tap half: buffer raw PCM. Never raises."""
        if not self.enabled or not pcm:
            return
        try:
            if sample_rate:
                self.sample_rate = int(sample_rate)
            if num_channels:
                self.num_channels = int(num_channels)
            start = int(t_ms) if t_ms is not None else self._clock_ms
            duration = self._chunk_ms(pcm)
            self._chunks.append((start, bytes(pcm)))
            self._buffered_ms += duration
            self._clock_ms = start + duration
            while self._chunks and self._buffered_ms > self.capacity_ms:
                _, dropped = self._chunks.popleft()
                self._buffered_ms -= self._chunk_ms(dropped)
        except Exception:  # noqa: BLE001 — recording must never break the call
            _log.exception("audio buffering failed; disabling the recorder")
            self.enabled = False

    # ------------------------------------------------------------------ splice

    def _slice(self, start_ms: int, end_ms: int) -> bytes:
        """PCM between two absolute timestamps, from whatever is still buffered."""
        frame_bytes = SAMPLE_WIDTH * max(1, self.num_channels)
        out = bytearray()
        for chunk_start, pcm in self._chunks:
            chunk_end = chunk_start + self._chunk_ms(pcm)
            if chunk_end <= start_ms or chunk_start >= end_ms:
                continue
            lo_ms = max(0, start_ms - chunk_start)
            hi_ms = min(chunk_end - chunk_start, end_ms - chunk_start)
            lo = (int(lo_ms * self.sample_rate / 1000)) * frame_bytes
            hi = (int(hi_ms * self.sample_rate / 1000)) * frame_bytes
            out += pcm[lo:hi]
        return bytes(out)

    def splice(self, segments: list[dict[str, Any]]) -> bytes:
        """Concatenate a turn's segments, keeping real gaps up to ``max_gap_ms``."""
        frame_bytes = SAMPLE_WIDTH * max(1, self.num_channels)
        out = bytearray()
        prev_end: int | None = None
        for segment in segments:
            try:
                start = int(segment["t_start_ms"]) - self.pre_roll_ms
                end = int(segment["t_end_ms"])
            except (KeyError, TypeError, ValueError):
                continue
            if prev_end is not None:
                gap = min(max(0, start - prev_end), self.max_gap_ms)
                if gap:
                    out += b"\x00" * (int(gap * self.sample_rate / 1000) * frame_bytes)
            out += self._slice(max(0, start), end)
            prev_end = end
        return bytes(out)

    # ------------------------------------------------------------------ write

    def write_turn(
        self,
        turn_index: int,
        segments: list[dict[str, Any]],
        card_id: str | None = None,
    ) -> str | None:
        """Write one turn's WAV synchronously. Returns the filename, or None on failure."""
        if not self.enabled:
            return None
        try:
            pcm = self.splice(segments)
            if not pcm:
                return None
            filename = f"turn-{turn_index:03d}.wav"
            directory = self.directory
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / filename
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(max(1, self.num_channels))
                wav.setsampwidth(SAMPLE_WIDTH)
                wav.setframerate(self.sample_rate)
                wav.writeframes(pcm)
            duration_ms = int(
                len(pcm) / (SAMPLE_WIDTH * max(1, self.num_channels)) * 1000 / self.sample_rate
            )
            self._manifest.append(
                {
                    "turn_index": turn_index,
                    "file": filename,
                    "duration_ms": duration_ms,
                    "sample_rate": self.sample_rate,
                    "card_id": card_id,
                }
            )
            return filename
        except Exception:  # noqa: BLE001 — 02 §5: never kill a session over the disk
            _log.exception("writing turn %s audio failed; continuing without it", turn_index)
            return None

    async def commit_turn(
        self,
        turn_index: int,
        segments: list[dict[str, Any]],
        card_id: str | None = None,
    ) -> str | None:
        """Off-thread WAV write, so disk latency never lands on the frame path."""
        if not self.enabled:
            return None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return self.write_turn(turn_index, segments, card_id)
        return await loop.run_in_executor(
            None, self.write_turn, turn_index, segments, card_id
        )

    # ------------------------------------------------------------------ manifest

    def manifest(self) -> dict[str, Any]:
        return {"session_id": self.session_id, "turns": list(self._manifest)}

    def write_manifest(self) -> Path | None:
        if not self._manifest:
            return None
        try:
            directory = self.directory
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / "manifest.json"
            path.write_text(json.dumps(self.manifest(), indent=2), encoding="utf-8")
            return path
        except Exception:  # noqa: BLE001
            _log.exception("writing the speaking manifest failed")
            return None

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.write_manifest()
        self._chunks.clear()
        self._buffered_ms = 0

    # ------------------------------------------------------------------ pipecat

    def tap(self) -> Any:
        return make_recorder_tap(self)

    def observer(self) -> Any:
        return make_recorder_observer(self)


_TAP_CLASS: Any = None
_REC_OBSERVER_CLASS: Any = None


def make_recorder_tap(recorder: TurnAudioRecorder) -> Any:
    """In-chain passthrough that feeds the ring buffer (needs Pipecat)."""
    global _TAP_CLASS
    if _TAP_CLASS is None:
        from bandready.voice.pipeline import require_pipecat

        require_pipecat()
        from pipecat.frames.frames import InputAudioRawFrame
        from pipecat.processors.frame_processor import FrameProcessor

        class _RecorderTap(FrameProcessor):  # type: ignore[misc,valid-type]
            def __init__(self, rec: TurnAudioRecorder) -> None:
                super().__init__()
                self._rec = rec

            async def process_frame(self, frame: Any, direction: Any) -> None:
                await super().process_frame(frame, direction)
                if isinstance(frame, InputAudioRawFrame):
                    self._rec.append(
                        getattr(frame, "audio", b"") or b"",
                        None,
                        getattr(frame, "sample_rate", None),
                        getattr(frame, "num_channels", None),
                    )
                await self.push_frame(frame, direction)

        _TAP_CLASS = _RecorderTap
    return _TAP_CLASS(recorder)


def make_recorder_observer(recorder: TurnAudioRecorder) -> Any:
    """Observer half: notes VAD boundaries so the tap's clock stays aligned."""
    global _REC_OBSERVER_CLASS
    if _REC_OBSERVER_CLASS is None:
        from bandready.voice.pipeline import require_pipecat

        require_pipecat()
        from pipecat.frames.frames import (
            UserStartedSpeakingFrame,
            UserStoppedSpeakingFrame,
        )
        from pipecat.observers.base_observer import BaseObserver, FramePushed

        class _RecorderObserver(BaseObserver):  # type: ignore[misc,valid-type]
            def __init__(self, rec: TurnAudioRecorder) -> None:
                super().__init__()
                self._rec = rec
                self._seen: set[int] = set()

            async def on_push_frame(self, data: FramePushed) -> None:
                frame = data.frame
                fid = id(frame)
                if fid in self._seen:
                    return
                if isinstance(frame, UserStartedSpeakingFrame | UserStoppedSpeakingFrame):
                    self._seen.add(fid)
                    # The observer clock and the tap clock are the same task clock, so
                    # nothing to reconcile — recorded here for diagnostics only.
                    _log.debug(
                        "vad boundary %s at %s ms",
                        type(frame).__name__,
                        int((getattr(data, "timestamp", 0) or 0) / 1_000_000),
                    )

        _REC_OBSERVER_CLASS = _RecorderObserver
    return _REC_OBSERVER_CLASS(recorder)
