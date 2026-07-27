"""Offline dictionary route (18-api-contract.md §4.6, ruling R2-20).

``GET /api/v1/dictionary/{word}`` is the reading module's double-click popover and the
definition that fills a vocab suggestion. It is WordNet, not an LLM: no network, no
provider config, target < 50 ms.

The lookup itself is synchronous SQLite, so it runs on a worker thread; the first request
on a machine with no lexicon installed kicks off a background install and answers
immediately with ``available: false`` (see :mod:`bandready.dictionary`).

One thing it will not do is answer during a reading mock. The 60-minute sitting reports
``dictionary_enabled: false`` and lists ``"dictionary"`` among its withheld affordances
(staging-reading/DESIGN.md §10 F9), and a rule the client alone enforces is not a rule —
the word would still be one fetch away. The sitting queues every word the learner clicks
and hands the list back in the report, so nothing is lost, only deferred.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from bandready import dictionary as wordnet
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError

router = APIRouter(prefix="/api/v1/dictionary", tags=["dictionary"])

MAX_WORD_LEN = 64


@router.get("", summary="Dictionary availability")
async def dictionary_status(_: None = Depends(require_auth)) -> dict[str, Any]:
    return await asyncio.to_thread(wordnet.status)


@router.post("/install", summary="Install the offline WordNet lexicon (background)")
async def install(_: None = Depends(require_auth)) -> dict[str, Any]:
    return wordnet.start_install()


def _reading_mock_in_progress(session: Session) -> dict[str, Any] | None:
    """The live reading sitting, or ``None``. Never raises — a lookup must not 500."""
    try:
        from bandready.reading import mock as reading_mock

        return reading_mock.exam_conditions(session, current_profile_id(session))
    except Exception:  # noqa: BLE001 — the guard must never break a lookup
        return None


@router.get("/{word}", summary="Offline WordNet lookup")
async def lookup(
    word: str,
    install_missing: int = Query(default=1),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    term = (word or "").strip()
    if not term:
        raise ApiError(422, "validation_error", "a word is required")
    if len(term) > MAX_WORD_LEN:
        raise ApiError(422, "validation_error", "that is too long to be a word")
    conditions = _reading_mock_in_progress(session)
    if conditions is not None:
        raise ApiError(
            409,
            "conflict",
            "The dictionary is closed during a reading mock. The words you click are "
            "saved and appear in the report when you submit.",
        )
    return await asyncio.to_thread(
        wordnet.lookup, term, auto_install=bool(install_missing)
    )
