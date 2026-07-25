"""Reuse model weights already on this machine instead of downloading them again.

Kokoro and Whisper are the slowest part of first run. When another Pipecat app, an
earlier BandReady install, or a plain ``faster-whisper`` run has already fetched the
exact files, there is no reason to spend the bandwidth twice -- especially on a slow
or metered connection.

``GET  /api/v1/models/local``   reports what is reusable, without changing anything.
``POST /api/v1/models/local/adopt`` installs it (hard link where possible, so it costs
no extra disk and leaves the original in place).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from bandready.config import get_settings
from bandready.models_local import adopt_all, discover, search_roots
from bandready.server.deps import require_auth

router = APIRouter(prefix="/api/v1/models/local", tags=["models"])


def _artifacts() -> list[dict[str, Any]]:
    """The built-in artifact manifest, imported lazily to avoid an import cycle."""
    from bandready.server.routes.models import BUILTIN_MANIFEST

    return list(BUILTIN_MANIFEST.get("artifacts") or [])


@router.get("", dependencies=[Depends(require_auth)])
def list_local() -> dict[str, Any]:
    """Weights found elsewhere on this machine that we do not have yet."""
    models_dir = get_settings().models_dir
    hits = discover(_artifacts(), models_dir=models_dir)
    return {
        "searched": [str(p) for group in search_roots().values() for p in group],
        "available": [h.as_dict() for h in hits],
        "reusable_mb": sum(h.total_mb for h in hits),
    }


@router.post("/adopt", dependencies=[Depends(require_auth)])
def adopt_local() -> dict[str, Any]:
    """Install every reusable artifact. Idempotent -- already-installed ones are skipped."""
    models_dir = get_settings().models_dir
    adopted = adopt_all(_artifacts(), models_dir)
    return {
        "adopted": adopted,
        "count": len(adopted),
        "saved_mb": sum(int(a.get("size_mb") or 0) for a in adopted),
    }
