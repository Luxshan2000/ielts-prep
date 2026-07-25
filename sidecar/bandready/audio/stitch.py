"""Sample-accurate concatenation of synthesized listening lines (07 §3 steps 3-4).

The plan sketched pydub + an ffmpeg ``loudnorm`` pass. Both are dropped on purpose:
pydub needs an ffmpeg binary on PATH, and shipping/locating ffmpeg per platform is a
packaging cost we refuse to pay for what is ultimately array concatenation and a gain
multiply. Everything here is numpy + soundfile, both already vendored for the voice
pipeline.

Invariants the rest of the module relies on:

* the output is float32 mono at :data:`TARGET_RATE` (24 kHz — Kokoro's native rate);
* line offsets are computed from **sample counts**, never by summing float durations,
  so ``timing.json`` never drifts from the audio the browser plays;
* pauses are clamped to ``[0, MAX_PAUSE_MS]`` (07 §2) before any maths happens.
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

TARGET_RATE = 24_000
MAX_PAUSE_MS = 60_000

#: Target integrated level and true-peak ceiling, mirroring the intent of the doc's
#: ``loudnorm=I=-16:TP=-1.5`` without needing ffmpeg. Single-pass RMS gain + peak clamp.
TARGET_DBFS = -16.0
PEAK_CEILING_DBFS = -1.5

Piece = tuple[np.ndarray, int, int]
"""``(pcm, sample_rate, pause_after_ms)`` — one synthesized line plus its trailing gap."""


@dataclass(frozen=True)
class LineTiming:
    """Where one script line landed in the stitched file."""

    index: int
    start_ms: int
    end_ms: int
    pause_after_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


@dataclass(frozen=True)
class StitchResult:
    audio: np.ndarray
    sample_rate: int
    timings: list[LineTiming]
    duration_ms: int

    def timing_document(self) -> dict[str, Any]:
        """The ``<audio_hash>.timing.json`` sidecar (07 §3)."""
        return {
            "schema_version": 1,
            "sample_rate": self.sample_rate,
            "duration_ms": self.duration_ms,
            "lines": [asdict(t) for t in self.timings],
        }

    def start_ms_for_line(self, index: int) -> int | None:
        for timing in self.timings:
            if timing.index == index:
                return timing.start_ms
        return None


# --------------------------------------------------------------------------- helpers

def clamp_pause(ms: Any) -> int:
    """Coerce an authored ``pause_after_ms`` into the legal range (07 §2)."""
    try:
        value = round(float(ms))
    except (TypeError, ValueError):
        return 0
    return max(0, min(MAX_PAUSE_MS, value))


def ms_to_samples(ms: float, rate: int) -> int:
    return round(float(ms) * rate / 1000.0)


def samples_to_ms(samples: int, rate: int) -> int:
    return round(samples * 1000.0 / rate)


def to_mono(pcm: np.ndarray) -> np.ndarray:
    """Flatten any (frames, channels) buffer to mono float32."""
    array = np.asarray(pcm, dtype=np.float32)
    if array.ndim > 1:
        array = array.mean(axis=1, dtype=np.float32)
    return np.ascontiguousarray(array.reshape(-1), dtype=np.float32)


def resample(pcm: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    """Linear-interpolation resample.

    Speech at 22.05/24/44.1 kHz survives linear interpolation perfectly well for
    listening practice, and it keeps the dependency list at numpy. Mixed-rate input
    only happens when a cloud TTS returns something other than 24 kHz.
    """
    mono = to_mono(pcm)
    if src_rate == dst_rate or mono.size == 0:
        return mono
    if src_rate <= 0 or dst_rate <= 0:
        raise ValueError("sample rates must be positive")
    out_len = max(1, round(mono.size * dst_rate / src_rate))
    src_positions = np.arange(mono.size, dtype=np.float64)
    dst_positions = np.linspace(0.0, mono.size - 1, out_len, dtype=np.float64)
    return np.interp(dst_positions, src_positions, mono).astype(np.float32)


def silence(ms: float, rate: int = TARGET_RATE) -> np.ndarray:
    return np.zeros(ms_to_samples(clamp_pause(ms), rate), dtype=np.float32)


def duration_ms(pcm: np.ndarray, rate: int = TARGET_RATE) -> int:
    return samples_to_ms(int(np.asarray(pcm).reshape(-1).shape[0]), rate)


def normalize_loudness(
    pcm: np.ndarray,
    target_dbfs: float = TARGET_DBFS,
    peak_dbfs: float = PEAK_CEILING_DBFS,
) -> np.ndarray:
    """RMS-normalise towards ``target_dbfs``, then clamp the peak to ``peak_dbfs``.

    Silence-only buffers (mock mode) and all-zero renders are returned untouched
    instead of being amplified into noise.
    """
    audio = to_mono(pcm)
    if audio.size == 0:
        return audio
    # Measure RMS over the non-silent part only: the 30 s question-preview gaps would
    # otherwise drag the average down and make the speech far too loud.
    voiced = audio[np.abs(audio) > 1e-4]
    rms = float(np.sqrt(np.mean(np.square(voiced)))) if voiced.size else 0.0
    if rms <= 0.0:
        return audio
    gain = (10.0 ** (target_dbfs / 20.0)) / rms
    out = audio * gain
    peak = float(np.max(np.abs(out)))
    ceiling = 10.0 ** (peak_dbfs / 20.0)
    if peak > ceiling:
        out = out * (ceiling / peak)
    return np.clip(out, -1.0, 1.0).astype(np.float32)


# --------------------------------------------------------------------------- stitching

def stitch(
    pieces: Sequence[Piece],
    target_rate: int = TARGET_RATE,
    *,
    lead_in_ms: int = 0,
    normalize: bool = True,
) -> StitchResult:
    """Concatenate ``pieces`` with their trailing pauses, recording line offsets.

    ``pieces[i]`` is ``(pcm, sample_rate, pause_after_ms)``; pieces at a different rate
    are resampled to ``target_rate`` first. The returned timings are indexed by position
    in ``pieces`` — the caller maps them back to script line indices.
    """
    if target_rate <= 0:
        raise ValueError("target_rate must be positive")

    chunks: list[np.ndarray] = []
    timings: list[LineTiming] = []
    cursor = 0

    if lead_in_ms:
        lead = silence(lead_in_ms, target_rate)
        chunks.append(lead)
        cursor += lead.size

    for index, (pcm, rate, pause_after_ms) in enumerate(pieces):
        audio = resample(pcm, int(rate or target_rate), target_rate)
        start = cursor
        chunks.append(audio)
        cursor += audio.size
        pause = clamp_pause(pause_after_ms)
        timings.append(
            LineTiming(
                index=index,
                start_ms=samples_to_ms(start, target_rate),
                end_ms=samples_to_ms(cursor, target_rate),
                pause_after_ms=pause,
            )
        )
        if pause:
            gap = silence(pause, target_rate)
            chunks.append(gap)
            cursor += gap.size

    audio = (
        np.concatenate(chunks).astype(np.float32)
        if chunks
        else np.zeros(0, dtype=np.float32)
    )
    if normalize:
        audio = normalize_loudness(audio)
    return StitchResult(
        audio=audio,
        sample_rate=target_rate,
        timings=timings,
        duration_ms=samples_to_ms(audio.size, target_rate),
    )


def expected_duration_ms(pieces: Sequence[Piece], target_rate: int = TARGET_RATE) -> int:
    """Duration ``stitch`` will produce, without allocating the buffer.

    Used by the render job to report progress in wall-clock terms and by tests to pin
    the offset maths independently of the concatenation implementation.
    """
    total = 0
    for pcm, rate, pause_after_ms in pieces:
        source = int(rate or target_rate)
        frames = int(np.asarray(pcm).reshape(-1).shape[0])
        if source != target_rate and frames:
            frames = max(1, round(frames * target_rate / source))
        total += frames + ms_to_samples(clamp_pause(pause_after_ms), target_rate)
    return samples_to_ms(total, target_rate)


# --------------------------------------------------------------------------- file I/O

def write_wav(path: Path | str, pcm: np.ndarray, rate: int = TARGET_RATE) -> int:
    """Write 16-bit mono PCM atomically; returns the file size in bytes."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    sf.write(str(tmp), to_mono(pcm), int(rate), subtype="PCM_16", format="WAV")
    tmp.replace(target)
    return target.stat().st_size


def read_wav(path: Path | str) -> tuple[np.ndarray, int]:
    data, rate = sf.read(str(path), dtype="float32", always_2d=False)
    return to_mono(data), int(rate)


def write_timing(path: Path | str, document: dict[str, Any]) -> int:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(target)
    return target.stat().st_size


def estimate_speech_ms(text: str, chars_per_second: float = 15.0) -> int:
    """The doc's chars/15 heuristic — used for mock synthesis and lint bounds (07 §10)."""
    chars = len((text or "").strip())
    if not chars:
        return 0
    return math.ceil(chars / max(1.0, chars_per_second) * 1000.0)
