"""Health and system info (18-api-contract.md §4.1).

``GET /health`` is the ONLY unauthenticated route and deliberately sits outside the
``/api/v1`` prefix — Electron main polls it every 250 ms during spawn and shows the window
only once it answers (01 §4.2). It must therefore stay cheap and must never depend on a
model being loaded.
"""

from __future__ import annotations

import platform
import sys
import time
from typing import Any

from fastapi import APIRouter, Depends

from bandready import __version__
from bandready.server.deps import require_auth

router = APIRouter(tags=["system"])

_STARTED_AT = time.time()


def _db_status() -> tuple[str, str | None]:
    """(db, migrations head) — best effort; never raises."""
    try:
        from sqlalchemy import text

        from bandready.db.engine import session_scope
    except Exception:  # noqa: BLE001 — db layer not present
        return "unavailable", None
    try:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
            row = session.execute(text("SELECT version_num FROM alembic_version")).first()
        return "ok", (str(row[0]) if row else None)
    except Exception:  # noqa: BLE001
        return "error", None


@router.get("/health", summary="Liveness probe (unauthenticated)")
async def health() -> dict[str, Any]:
    db, head = _db_status()
    return {
        "status": "ok",
        "version": __version__,
        "db": db,
        "migrations": head,
        "uptime_s": round(time.time() - _STARTED_AT, 3),
    }


@router.get("/api/v1/system/info", summary="Sidecar build and runtime information")
async def system_info(_: None = Depends(require_auth)) -> dict[str, Any]:
    from bandready.config import get_settings
    from bandready.providers.detect import platform_info

    settings = get_settings()
    db, head = _db_status()
    return {
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": platform_info(),
        "os_release": platform.platform(),
        "data_dir": str(settings.data_dir),
        "base_url": settings.base_url,
        "mock_enabled": settings.enable_mock,
        "db": db,
        "migrations": head,
        "uptime_s": round(time.time() - _STARTED_AT, 3),
        "started_at": _STARTED_AT,
    }
