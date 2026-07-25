"""Fluency metrics computed from the timed transcript (02-voice-pipeline.md §4.2).

Ruling R2-10 fixes the metric set exactly — these eleven fields and no others:

    wpm, articulation_wpm, mean_pause_ms, long_pause_count, pause_ratio,
    initial_latency_ms, filler_count, fillers_per_min, false_start_count,
    mean_length_of_run_words        (per turn / per part)
    p2_long_turn_secs               (session layer, Part 2 only)

Everything here is a pure function over ``{"turns": [...]}`` plus segment timings, so the
whole module is unit-testable without Pipecat, audio, or a database.
"""

from __future__ import annotations

import re
from itertools import pairwise
from typing import Any

__all__ = [
    "FILLERS",
    "LONG_PAUSE_MS",
    "METRIC_FIELDS",
    "MIN_PAUSE_MS",
    "aggregate_metrics",
    "compute_transcript_metrics",
    "false_start_count",
    "filler_count",
    "p2_long_turn_secs",
    "pause_gaps",
    "tokenize",
    "turn_metrics",
    "word_count",
]

# Gaps below this are VAD jitter, not pauses (02 §4.2).
MIN_PAUSE_MS = 250
# "Long pause" threshold used for the hesitation signal (R2-10).
LONG_PAUSE_MS = 1500

# v1 counts only unambiguous hesitation tokens. "like" / "you know" are deliberately
# excluded — without POS context they produce far more false positives than signal
# (02 §4.2 + open question 3).
FILLERS: frozenset[str] = frozenset({"um", "uh", "er", "erm", "hmm", "mmm", "uhm", "ah"})

METRIC_FIELDS: tuple[str, ...] = (
    "wpm",
    "articulation_wpm",
    "mean_pause_ms",
    "long_pause_count",
    "pause_ratio",
    "initial_latency_ms",
    "filler_count",
    "fillers_per_min",
    "false_start_count",
    "mean_length_of_run_words",
)

_PUNCT = re.compile(r"[^\w'-]+", re.UNICODE)


# --------------------------------------------------------------------------- text


def tokenize(text: str) -> list[str]:
    """Lowercased, punctuation-stripped tokens (comparison form)."""
    out: list[str] = []
    for raw in (text or "").split():
        token = _PUNCT.sub("", raw.lower())
        if token:
            out.append(token)
    return out


def word_count(text: str) -> int:
    """Whitespace tokens of the turn text, per the 02 §4.2 formula."""
    return len((text or "").split())


def filler_count(text: str) -> int:
    return sum(1 for t in tokenize(text) if t in FILLERS)


#: 02 §4.2 specifies unigram and bigram repetition; trigrams are included because the
#: doc's own example ("I went to— I went to") is a three-token repeat that the bigram
#: rule alone cannot see.
_REPEAT_SPANS = (1, 2, 3)


def false_start_count(text: str) -> int:
    """Immediate word / bigram / trigram repetitions ("I I think", "I went to I went to").

    Matches are consumed, so "the the" counts once rather than cascading.
    """
    tokens = tokenize(text)
    total = len(tokens)
    count = 0
    i = 0
    while i < total - 1:
        for span in _REPEAT_SPANS:
            if i + 2 * span > total:
                continue
            if tokens[i : i + span] == tokens[i + span : i + 2 * span]:
                count += 1
                i += 2 * span
                break
        else:
            i += 1
    return count


# --------------------------------------------------------------------------- timing


def _segments(turn: dict[str, Any]) -> list[dict[str, int]]:
    out: list[dict[str, int]] = []
    for seg in turn.get("segments") or []:
        try:
            start = int(seg["t_start_ms"])
            end = int(seg["t_end_ms"])
        except (KeyError, TypeError, ValueError):
            continue
        if end >= start:
            out.append({"t_start_ms": start, "t_end_ms": end})
    out.sort(key=lambda s: s["t_start_ms"])
    return out


def pause_gaps(segments: list[dict[str, int]]) -> list[int]:
    """Gaps between consecutive segments, keeping only those ≥ ``MIN_PAUSE_MS``."""
    gaps: list[int] = []
    for prev, nxt in pairwise(segments):
        gap = nxt["t_start_ms"] - prev["t_end_ms"]
        if gap >= MIN_PAUSE_MS:
            gaps.append(gap)
    return gaps


def _round(value: float, places: int = 1) -> float:
    return round(float(value) + 0.0, places)


# --------------------------------------------------------------------------- per turn


def turn_metrics(
    text: str,
    segments: list[dict[str, Any]] | None = None,
    prev_assistant_t_ms: int | None = None,
) -> dict[str, Any]:
    """The R2-10 metric set for a single candidate turn.

    ``segments`` are VAD speech segments in ms relative to task start. With no segments
    (a turn whose audio timing was lost) the rate metrics degrade to 0 rather than
    raising — a missing metric must never break scoring.
    """
    segs = _segments({"segments": segments or []})
    words = word_count(text)
    speech_ms = sum(s["t_end_ms"] - s["t_start_ms"] for s in segs)
    response_ms = (segs[-1]["t_end_ms"] - segs[0]["t_start_ms"]) if segs else 0
    gaps = pause_gaps(segs)

    speech_s = speech_ms / 1000.0
    response_s = response_ms / 1000.0

    wpm = words / (response_s / 60.0) if response_s > 0 else 0.0
    articulation = words / (speech_s / 60.0) if speech_s > 0 else 0.0
    mean_pause = (sum(gaps) / len(gaps)) if gaps else 0.0
    pause_ratio = ((response_ms - speech_ms) / response_ms) if response_ms > 0 else 0.0
    fillers = filler_count(text)
    fillers_pm = fillers / (speech_s / 60.0) if speech_s > 0 else 0.0

    latency: int | None = None
    if segs and prev_assistant_t_ms is not None:
        latency = max(0, segs[0]["t_start_ms"] - int(prev_assistant_t_ms))

    return {
        "wpm": _round(wpm),
        "articulation_wpm": _round(articulation),
        "mean_pause_ms": round(mean_pause),
        "long_pause_count": sum(1 for g in gaps if g >= LONG_PAUSE_MS),
        "pause_ratio": _round(max(0.0, min(1.0, pause_ratio)), 2),
        "initial_latency_ms": latency,
        "filler_count": fillers,
        "fillers_per_min": _round(fillers_pm),
        "false_start_count": false_start_count(text),
        "mean_length_of_run_words": _round(words / (len(gaps) + 1)),
        # Raw quantities kept for aggregation; not part of the R2-10 wire contract and
        # stripped by `_public()` before the metric set reaches the prompt.
        "_words": words,
        "_speech_ms": speech_ms,
        "_response_ms": response_ms,
        "_gaps": gaps,
    }


def _public(raw: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in raw.items() if not k.startswith("_")}


# --------------------------------------------------------------------------- aggregate


def aggregate_metrics(raws: list[dict[str, Any]]) -> dict[str, Any]:
    """Pool per-turn raw metrics into one R2-10 metric set (per part or per session).

    Rates are recomputed from pooled totals rather than averaged, so a 60-second turn
    weighs more than a two-word one.
    """
    if not raws:
        return {
            "wpm": 0.0,
            "articulation_wpm": 0.0,
            "mean_pause_ms": 0,
            "long_pause_count": 0,
            "pause_ratio": 0.0,
            "initial_latency_ms": None,
            "filler_count": 0,
            "fillers_per_min": 0.0,
            "false_start_count": 0,
            "mean_length_of_run_words": 0.0,
        }

    words = sum(int(r.get("_words", 0)) for r in raws)
    speech_ms = sum(int(r.get("_speech_ms", 0)) for r in raws)
    response_ms = sum(int(r.get("_response_ms", 0)) for r in raws)
    gaps: list[int] = []
    for r in raws:
        gaps.extend(int(g) for g in r.get("_gaps", []))
    fillers = sum(int(r.get("filler_count", 0)) for r in raws)
    false_starts = sum(int(r.get("false_start_count", 0)) for r in raws)
    latencies = [
        int(r["initial_latency_ms"]) for r in raws if r.get("initial_latency_ms") is not None
    ]

    speech_s = speech_ms / 1000.0
    response_s = response_ms / 1000.0

    return {
        "wpm": _round(words / (response_s / 60.0)) if response_s > 0 else 0.0,
        "articulation_wpm": _round(words / (speech_s / 60.0)) if speech_s > 0 else 0.0,
        "mean_pause_ms": round(sum(gaps) / len(gaps)) if gaps else 0,
        "long_pause_count": sum(1 for g in gaps if g >= LONG_PAUSE_MS),
        "pause_ratio": (
            _round((response_ms - speech_ms) / response_ms, 2) if response_ms > 0 else 0.0
        ),
        "initial_latency_ms": round(sum(latencies) / len(latencies)) if latencies else None,
        "filler_count": fillers,
        "fillers_per_min": _round(fillers / (speech_s / 60.0)) if speech_s > 0 else 0.0,
        "false_start_count": false_starts,
        "mean_length_of_run_words": _round(words / (len(gaps) + len(raws))),
    }


def p2_long_turn_secs(turns: list[dict[str, Any]]) -> float | None:
    """Wall-clock length of the Part 2 long turn (session-layer metric, R2-10).

    Spans every user segment recorded while the state machine was in ``P2_LONG_TURN``;
    ``None`` when the session never reached the long turn.
    """
    starts: list[int] = []
    ends: list[int] = []
    for turn in turns:
        if turn.get("role") != "user":
            continue
        if turn.get("phase") != "P2_LONG_TURN":
            continue
        for seg in _segments(turn):
            starts.append(seg["t_start_ms"])
            ends.append(seg["t_end_ms"])
    if not starts:
        return None
    return _round((max(ends) - min(starts)) / 1000.0)


# --------------------------------------------------------------------------- session


def compute_transcript_metrics(record: dict[str, Any]) -> dict[str, Any]:
    """Full metric document for one session.

    Shape (what `speaking_sessions.metrics_json` stores and what 04 §6.3's prompt reads)::

        {"parts": {"1": {...R2-10...}, "2": {...}},
         "overall": {...R2-10...},
         "session": {"p2_long_turn_secs": 96.0, "speech_secs": 214.4},
         "turns": [{"turn_index": 3, ...R2-10...}]}
    """
    turns = list(record.get("turns") or [])
    per_turn: list[dict[str, Any]] = []
    by_part: dict[str, list[dict[str, Any]]] = {}
    prev_assistant_t: int | None = None

    for index, turn in enumerate(turns):
        role = turn.get("role")
        if role == "assistant":
            prev_assistant_t = int(turn.get("t_ms") or 0)
            continue
        if role != "user":
            continue
        raw = turn_metrics(
            str(turn.get("text") or ""),
            turn.get("segments") or [],
            prev_assistant_t_ms=prev_assistant_t,
        )
        raw["turn_index"] = index
        per_turn.append(raw)
        part = turn.get("part")
        if part is not None:
            by_part.setdefault(str(part), []).append(raw)

    speech_ms = sum(int(r.get("_speech_ms", 0)) for r in per_turn)
    session: dict[str, Any] = {"speech_secs": _round(speech_ms / 1000.0)}
    p2 = p2_long_turn_secs(turns)
    if p2 is not None:
        session["p2_long_turn_secs"] = p2

    return {
        "parts": {part: aggregate_metrics(raws) for part, raws in sorted(by_part.items())},
        "overall": aggregate_metrics(per_turn),
        "session": session,
        "turns": [_public(r) for r in per_turn],
    }
