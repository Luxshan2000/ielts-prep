"""The app's stored-timestamp format — written and read in exactly one place.

Every timestamp BandReady persists is UTC ISO-8601 truncated to milliseconds with a
``Z`` suffix: ``2026-08-15T09:41:07.123Z``.

WHY THIS IS ONE MODULE AND NOT TWENTY COPIES
--------------------------------------------
The format is a *data contract*, not a display choice. The SRS due-queue SQL compares
these timestamps as **strings** (``WHERE c.due_at <= :now``), which is only correct
because every stored value is the same fixed-width UTC rendering — same zone, same
digit count, same suffix — so lexicographic order equals chronological order. Drop the
milliseconds in one writer, or stamp a ``+05:30`` offset in another, and the due queue
silently returns the wrong cards. Nothing raises; the learner just gets the wrong
review.

That rule used to be written down in exactly one of the twenty modules that implement
it (``srs/scheduler.py``), under six different private names, with one site reaching the
same string by a completely different expression. A rule that lives in twenty copies is
a rule nobody can see.

The reader lives beside the writer for the same reason: a change to the format that did
not change the parser is a silent data corruption, and keeping them in one file makes
that pairing impossible to miss.

This module sits at the package root so every layer — server routes, curriculum, srs,
scoring, voice and the four mock engines — can import it without an import cycle. It
depends on nothing but the standard library, and it must stay that way.

NOT this contract: ``server/routes/models.py`` renders a second-precision string from an
epoch for human display. That is a different format for a different purpose; do not
route it through here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

__all__ = ["iso", "parse_iso", "seconds_since", "utcnow"]

#: The one rendering. Sliced to milliseconds, then suffixed ``Z``.
_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"


def utcnow() -> datetime:
    """Now, as a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def iso(moment: datetime | None = None) -> str:
    """Render ``moment`` (default: now) as the app's stored timestamp string.

    A naive datetime is assumed to already be UTC — that is what every caller in this
    codebase means by one — and an aware datetime is converted, so the output is UTC
    whatever the input carried.
    """
    if moment is None:
        moment = utcnow()
    elif moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).strftime(_FORMAT)[:-3] + "Z"


def parse_iso(value: Any) -> datetime | None:
    """Read a stored timestamp back into an aware UTC datetime, or ``None``.

    Tolerant on purpose and never raises: a stored column that fails to parse must
    degrade to "unknown", not 500 a request. Accepts the ``Z`` suffix ``datetime``
    itself refuses, treats a missing offset as UTC, and returns ``None`` for anything
    that is not a parseable string.
    """
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def seconds_since(value: Any) -> float:
    """Seconds elapsed since a stored timestamp; ``0.0`` if it is missing or unreadable.

    Never negative: a clock that moved backwards reports "just now" rather than a
    negative age, because every caller uses this to decide whether something has gone
    stale.
    """
    started = parse_iso(value)
    if started is None:
        return 0.0
    return max(0.0, (utcnow() - started).total_seconds())
