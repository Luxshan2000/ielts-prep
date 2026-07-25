"""Pronunciation assessment. **v1 only** — 09-pronunciation-assessment.md §3.

v1 = whisper word-timestamp proxies + LLM-flagged likely mispronunciations + authored
minimal-pair drills. No new models, no GOP. The v2 modules 09 §4.0 lists
(``gop_v2.py``, ``g2p.py``, ``align.py``, ``calibrate.py``, ``prosody.py``) are
intentionally absent; ``analyze.py`` reports ``method='proxy-v1'`` everywhere so the
switch to v2 is additive.

    from bandready.pron import analyze
    result = await analyze.analyze_wav(path, reference_text="…")
    await analyze.analyze_session(session, session_id, profile_id)
"""

from __future__ import annotations

from bandready.pron import analyze
from bandready.pron.analyze import (
    ACCENT_NOTICE,
    BAND_AMBER,
    BAND_GREEN,
    METHOD,
    TurnPronResult,
    WordScore,
    analyze_session,
    analyze_wav,
    drill_items,
    pron_signals,
    session_results,
)

__all__ = [
    "ACCENT_NOTICE",
    "BAND_AMBER",
    "BAND_GREEN",
    "METHOD",
    "TurnPronResult",
    "WordScore",
    "analyze",
    "analyze_session",
    "analyze_wav",
    "drill_items",
    "pron_signals",
    "session_results",
]
