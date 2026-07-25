"""Live speaking-session voice engine (02-voice-pipeline.md).

Import layout matters here: **nothing in this package imports Pipecat at module level.**
Every Pipecat symbol is pulled in inside a function so the sidecar boots, migrates, serves
settings and runs every non-voice route on a machine where the voice extra is missing or
broken. Speaking routes then fail with a clean ``503 voice_unavailable`` instead of the
whole app refusing to start.

Modules:

* :mod:`~bandready.voice.pipeline`      — chain assembly, the five 1.5.0 gotchas
* :mod:`~bandready.voice.runtime`       — signaling, event fan-out, teardown (R2-24)
* :mod:`~bandready.voice.state_machine` — canonical phases, timers, scripted lines, gate
* :mod:`~bandready.voice.injector`      — ``[[br-question-card]]`` per-turn injection
* :mod:`~bandready.voice.transcript`    — timed transcript capture
* :mod:`~bandready.voice.recorder`      — per-turn WAV capture for 09
* :mod:`~bandready.voice.metrics`       — the R2-10 fluency metric set
"""

from __future__ import annotations

from bandready.voice.injector import MARKER, build_messages
from bandready.voice.metrics import (
    aggregate_metrics,
    compute_transcript_metrics,
    turn_metrics,
)
from bandready.voice.state_machine import (
    PHASES,
    CardBundle,
    CueCard,
    SpeakingStateMachine,
    Timings,
    TopicFrame,
    default_bundle,
)
from bandready.voice.transcript import TranscriptAccumulator

__all__ = [
    "MARKER",
    "PHASES",
    "CardBundle",
    "CueCard",
    "SpeakingStateMachine",
    "Timings",
    "TopicFrame",
    "TranscriptAccumulator",
    "aggregate_metrics",
    "build_messages",
    "compute_transcript_metrics",
    "default_bundle",
    "turn_metrics",
]
