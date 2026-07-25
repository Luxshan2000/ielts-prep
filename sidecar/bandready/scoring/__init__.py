"""Shared scoring primitives.

Everything band-related that more than one module needs lives here so there is exactly
one implementation of each rule:

* :mod:`bandready.scoring.bands`    — ``round_ielts()`` (R2-4) and criterion arithmetic.
* :mod:`bandready.scoring.rubrics`  — paraphrased band descriptors (speaking + writing).
* :mod:`bandready.scoring.writing`  — the writing evaluator (pre-checks, prompt, anchoring).
* :mod:`bandready.scoring.answers`  — the shared reading/listening answer normalizer
  (owned by the reading module; imported directly, never re-exported here, so this
  package keeps importing cleanly while that file is still in flight).

Only the band helpers are re-exported: they are the ones every module touches, and they
have no dependencies beyond the standard library.
"""

from __future__ import annotations

from bandready.scoring.bands import (
    BAND_MAX,
    BAND_MIN,
    CRITERION_MAX,
    CRITERION_MIN,
    band_delta,
    clamp_band,
    clamp_criterion,
    format_band,
    mean_band,
    overall_from_criteria,
    round_ielts,
)

__all__ = [
    "BAND_MAX",
    "BAND_MIN",
    "CRITERION_MAX",
    "CRITERION_MIN",
    "band_delta",
    "clamp_band",
    "clamp_criterion",
    "format_band",
    "mean_band",
    "overall_from_criteria",
    "round_ielts",
]
