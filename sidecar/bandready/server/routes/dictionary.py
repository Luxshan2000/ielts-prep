"""Offline dictionary route (18-api-contract.md §4.6, ruling R2-20).

``GET /api/v1/dictionary/{word}`` is the reading module's double-click popover and the
definition that fills a vocab suggestion. It is WordNet, not an LLM: no network, no
provider config, target < 50 ms.

The lookup itself is synchronous SQLite, so it runs on a worker thread; the first request
on a machine with no lexicon installed kicks off a background install and answers
immediately with ``available: false`` (see :mod:`bandready.dictionary`).
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query

from bandready import dictionary as wordnet
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError

router = APIRouter(prefix="/api/v1/dictionary", tags=["dictionary"])

MAX_WORD_LEN = 64


@router.get("", summary="Dictionary availability")
async def dictionary_status(_: None = Depends(require_auth)) -> dict[str, Any]:
    return await asyncio.to_thread(wordnet.status)


@router.post("/install", summary="Install the offline WordNet lexicon (background)")
async def install(_: None = Depends(require_auth)) -> dict[str, Any]:
    return wordnet.start_install()


@router.get("/{word}", summary="Offline WordNet lookup")
async def lookup(
    word: str,
    install_missing: int = Query(default=1),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    term = (word or "").strip()
    if not term:
        raise ApiError(422, "validation_error", "a word is required")
    if len(term) > MAX_WORD_LEN:
        raise ApiError(422, "validation_error", "that is too long to be a word")
    return await asyncio.to_thread(
        wordnet.lookup, term, auto_install=bool(install_missing)
    )
