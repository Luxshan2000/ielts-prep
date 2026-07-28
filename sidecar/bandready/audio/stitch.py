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

One thing that looks like an invariant and is not: **an authored pause is a lower bound
unless the caller trims.** L-R4 §7.4 measured Kokoro's own residual silence per voice at
97–538 ms of trailing and 35–103 ms of leading dead air *after* its internal ``trim=True``,
so ``pause_after_ms: 300`` rendered as anything from 434 ms to 941 ms depending on which
voice happened to be speaking, and ``pause_after_ms: 0`` — the latched interruption — was
never latched at all. Worse for the coach: that residual sits inside the line's
``start_ms``/``end_ms``, so a click-to-replay computed from ``timing.json`` opened on up to
half a second of nothing. :func:`trim_edges` is the fix, and the render path applies it per
line before stitching; offsets stay sample-accurate because they are measured after the
trim, not adjusted afterwards.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

TARGET_RATE = 24_000
MAX_PAUSE_MS = 60_000

#: Silence left at each end of a line by :func:`trim_edges`. Not zero: a hard cut on the
#: first sample above threshold clips the attack of a plosive and sounds like a dropout,
#: and 40 ms is below the ~50 ms at which a gap becomes audible as a gap.
EDGE_SILENCE_MS = 40

#: A sample counts as voiced when it exceeds this fraction of the line's own peak. Relative
#: rather than absolute because line loudness is not normalised until after concatenation;
#: −40 dB below peak keeps breath and fricative tails and drops the engine's noise floor.
EDGE_THRESHOLD_RATIO = 0.01

#: …but never trim against a threshold below this, so a line that is *entirely* near-silent
#: (mock mode renders pure zeros) is left exactly as it is rather than collapsed to nothing.
EDGE_THRESHOLD_FLOOR = 1e-4

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


def trim_edges(
    pcm: np.ndarray,
    rate: int = TARGET_RATE,
    *,
    edge_ms: int = EDGE_SILENCE_MS,
    ratio: float = EDGE_THRESHOLD_RATIO,
) -> np.ndarray:
    """Cut a line's leading and trailing silence back to a fixed ``edge_ms`` floor.

    This is what makes ``pause_after_ms`` mean what it says (L-R4 §7.4, C-7). Kokoro's
    residual silence is voice-dependent by up to ~800 ms, so without this the same
    authored pause renders as a different gap depending on the cast — and the per-line
    ``start_ms``/``end_ms`` the coach replays from are padded by that residual, which is
    how a "replay the answer" button lands on dead air.

    Two deliberate refusals:

    * a buffer whose peak is at or below :data:`EDGE_THRESHOLD_FLOOR` is returned
      **untouched**. That is the mock provider's pure-silence line, and collapsing it to
      nothing would turn a mock render into "the TTS provider returned no audio";
    * nothing is ever *added*. A line that is already tighter than ``edge_ms`` keeps its
      own onset, because padding it back out would undo the point.
    """
    audio = to_mono(pcm)
    if audio.size == 0:
        return audio
    peak = float(np.max(np.abs(audio)))
    if peak <= EDGE_THRESHOLD_FLOOR:
        return audio
    threshold = max(EDGE_THRESHOLD_FLOOR, peak * float(ratio))
    voiced = np.flatnonzero(np.abs(audio) > threshold)
    if voiced.size == 0:  # pragma: no cover — implied by the peak guard above
        return audio
    pad = ms_to_samples(max(0, edge_ms), rate)
    start = max(0, int(voiced[0]) - pad)
    end = min(audio.size, int(voiced[-1]) + 1 + pad)
    if start == 0 and end == audio.size:
        return audio
    return np.ascontiguousarray(audio[start:end], dtype=np.float32)


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


#: Measured chars/second for ordinary prose (L-R4 §7.5: 15.3 cps at 113 characters rising to
#: 18.3 at 900+; the doc's flat 15 is the short-line figure and over-estimates long lines).
PROSE_CPS = 17.0

#: How many characters of prose one *spoken-out* character is worth. A digit and a dotted
#: letter are each a whole stressed syllable — ``0384`` is "zero three eight four" — so they
#: take far longer than their width on the page suggests.
#:
#: Fitted to two measurements: ``"Call 0117 496 0384."`` took 4.87 s for 19 characters
#: (3.9 cps) and ``"at 6.30 pm"`` took 1.82 s for 10 (5.5 cps), against ~19 cps for a long
#: prose clause. A weight of six reproduces both to within about half a second, and the flat
#: rate it replaces was out by up to four times on exactly the lines Part 1 is built from.
SLOW_CHAR_WEIGHT = 6.0

_SPOKEN_SLOWLY = re.compile(r"[0-9]|(?<![A-Za-z])[A-Za-z]\.")


def estimate_speech_ms(text: str, chars_per_second: float | None = None) -> int:
    """Predicted spoken duration — mock synthesis, and any lint bound that needs one.

    Digits and dotted spelled-aloud letters are counted at :data:`SLOW_CHAR_WEIGHT` times
    their width; everything else at :data:`PROSE_CPS`. The distinction exists because the
    07 §10 flat rate made a phone number look like the shortest line in the script when it
    is one of the longest, and any timing gate built on it would have passed parts that run
    minutes over.

    Passing ``chars_per_second`` restores the old flat behaviour for a caller that wants a
    single rate. Nothing in the app does.
    """
    body = (text or "").strip()
    if not body:
        return 0
    if chars_per_second is not None:
        return math.ceil(len(body) / max(1.0, chars_per_second) * 1000.0)
    slow = len(_SPOKEN_SLOWLY.findall(body))
    fast = max(0, len(body) - slow)
    effective = fast + slow * SLOW_CHAR_WEIGHT
    return math.ceil(effective / PROSE_CPS * 1000.0)
