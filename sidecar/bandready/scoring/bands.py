"""IELTS band arithmetic — the single implementation (ruling R2-4).

Speaking (04), writing (05), the reading/listening raw-score converters (06/07) and the
overall estimator (10) all import :func:`round_ielts` from here. Do not reimplement it:
the whole point of R2-4 is that a learner never sees two different roundings of the same
numbers.

The official rule: a mean of criterion bands is reported to the nearest half band, and a
tie (``x.25`` / ``x.75``) rounds **UP** — ``6.25 → 6.5``, ``6.75 → 7.0``. An earlier draft
of 05 rounded ties down; that is repealed.

    >>> round_ielts(6.25)
    6.5
    >>> round_ielts(6.75)
    7.0
    >>> overall_from_criteria({"ta": 6, "cc": 6, "lr": 7, "gra": 6})
    6.5
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

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

BAND_MIN = 0.0
BAND_MAX = 9.0
CRITERION_MIN = 1
CRITERION_MAX = 9

_HALF = Decimal(1)


def _as_float(value: Any, *, what: str = "band") -> float:
    if isinstance(value, bool):  # bool is an int; refuse it explicitly
        raise TypeError(f"{what} must be a number, got bool")
    if isinstance(value, (int, float, Decimal)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError as exc:
            raise ValueError(f"{what} is not numeric: {value!r}") from exc
    else:
        raise TypeError(f"{what} must be a number, got {type(value).__name__}")
    if math.isnan(number) or math.isinf(number):
        raise ValueError(f"{what} must be finite, got {number!r}")
    return number


def clamp_band(value: Any) -> float:
    """Force a band onto the 0–9 scale (the DB CHECK constraints assume this)."""
    return min(BAND_MAX, max(BAND_MIN, _as_float(value)))


def clamp_criterion(value: Any) -> int:
    """A single criterion is a WHOLE band 1–9 (05 §6.1, 04 §6.1)."""
    number = _as_float(value, what="criterion band")
    rounded = int(Decimal(repr(number)).quantize(_HALF, rounding=ROUND_HALF_UP))
    return min(CRITERION_MAX, max(CRITERION_MIN, rounded))


def round_ielts(value: Any) -> float:
    """Round to the nearest half band, ties UP (the official IELTS rule, R2-4).

    ``6.1 → 6.0``, ``6.24 → 6.0``, ``6.25 → 6.5``, ``6.74 → 6.5``, ``6.75 → 7.0``.
    Results are clamped to the 0–9 scale.
    """
    number = _as_float(value)
    # Decimal(repr(x)) is exact for the shortest round-tripping literal, so a mean that
    # lands on a true tie (mean of whole criteria is always an exact quarter) is treated
    # as a tie rather than as binary noise a hair below it.
    doubled = (Decimal(repr(number)) * 2).quantize(_HALF, rounding=ROUND_HALF_UP)
    return clamp_band(float(doubled) / 2.0)


def mean_band(values: Iterable[Any]) -> float:
    """Unrounded arithmetic mean of criterion bands (all criteria weigh the same)."""
    numbers = [_as_float(v, what="criterion band") for v in values]
    if not numbers:
        raise ValueError("cannot average an empty set of criterion bands")
    return sum(numbers) / len(numbers)


def _criterion_value(raw: Any) -> float | None:
    """Accept ``6``, ``6.0``, ``"6"`` or the LLM's ``{"band": 6, "comment": ...}``."""
    if isinstance(raw, Mapping):
        for key in ("band", "score", "value"):
            if key in raw:
                return _as_float(raw[key], what="criterion band")
        return None
    try:
        return _as_float(raw, what="criterion band")
    except (TypeError, ValueError):
        return None


def overall_from_criteria(criteria: Mapping[str, Any]) -> float:
    """``round_ielts(mean(criteria))`` — the server-side overall band.

    Accepts either a flat ``{"ta": 6, ...}`` mapping or the evaluator's nested
    ``{"task_achievement": {"band": 6, ...}, ...}`` shape. Keys starting with ``_``
    (e.g. the ``_meta`` block :func:`bandready.providers.llm.chat_json` adds) are ignored.
    The model's own ``overall_band`` is never used — that is the point of this function.
    """
    if not isinstance(criteria, Mapping):
        raise TypeError("criteria must be a mapping of criterion -> band")
    values: list[float] = []
    for key, raw in criteria.items():
        if isinstance(key, str) and key.startswith("_"):
            continue
        value = _criterion_value(raw)
        if value is not None:
            values.append(value)
    if not values:
        raise ValueError("no criterion bands found in the criteria mapping")
    return round_ielts(mean_band(values))


def band_delta(new: Any, old: Any) -> float:
    """Signed half-band difference, e.g. for the rewrite loop's band-delta strip."""
    return round(clamp_band(new) - clamp_band(old), 2)


def format_band(value: Any) -> str:
    """Wire/UI rendering: always one decimal — ``"6.5"``, ``"7.0"``."""
    return f"{clamp_band(value):.1f}"
