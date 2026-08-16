"""Reading a ``*_json`` column back into Python without ever raising.

BandReady stores structured payloads — coach reports, annotations, suggestion lists — as
JSON text in a single column. Reading one back has to survive two different shapes: the
``str`` SQLite hands over, and the already-decoded ``dict``/``list`` a test fixture or an
in-memory row hands over instead.

WHY THIS IS ONE FUNCTION AND NOT SIX COPIES
-------------------------------------------
The type guard *is* the function. Everything else here is two lines of ``json.loads``;
what the callers actually depend on is the exact list of shapes it tolerates and the
promise that an unexpected one degrades to the caller's fallback rather than raising.
Adding a shape it must tolerate — or tightening one — has to be a single edit, because a
``*_json`` column that blows up a request is precisely the failure this was written to
prevent, and a coach panel that 500s on one skill and quietly renders empty on the other
three is the bug six copies produce.

It lives under ``db/`` because what it knows about is how this codebase stores JSON in a
column, not about coaching, vocabulary or scheduling.

NOT this helper: the several sites that return ``None`` on failure instead of a caller
supplied fallback, and the ones with no type guard at all. Those answer a different
question about a wrong-typed value and folding them in would need a switch.
"""

from __future__ import annotations

import json
from typing import Any

__all__ = ["loads"]


def loads(raw: Any, fallback: Any) -> Any:
    """Parse a ``*_json`` column that may already be decoded, never raising.

    ``fallback`` doubles as the expected type: a value that decodes to something else
    (a list where the caller wanted a dict) is treated as unusable and the fallback is
    returned, so the caller never has to type-check the result.
    """
    if raw is None:
        return fallback
    if isinstance(raw, type(fallback)) and not isinstance(raw, str):
        return raw
    if isinstance(raw, str):
        if not raw.strip():
            return fallback
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            return fallback
        return value if isinstance(value, type(fallback)) else fallback
    return fallback
