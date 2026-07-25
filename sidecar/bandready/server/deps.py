"""FastAPI dependencies shared by every route module.

    from bandready.server.deps import require_auth, current_profile_id

    @router.get("/things")
    def list_things(_: None = Depends(require_auth), session=Depends(get_session)):
        pid = current_profile_id(session)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Request

from bandready.server.auth import bearer_from, token_matches
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.deps")

DEFAULT_PROFILE_ID = "default"
DEFAULT_PROFILE_NAME = "Me"


def require_auth(request: Request) -> None:
    """Assert the request is authenticated.

    The middleware normally already did this; the dependency re-checks so a route is
    still safe if it is mounted on a sub-application without the middleware, and so the
    dependency shows up in the OpenAPI schema.
    """
    if getattr(request.state, "authenticated", False):
        return
    from bandready.config import get_settings

    if token_matches(bearer_from(request), get_settings().auth_token):
        request.state.authenticated = True
        return
    raise ApiError(401, "unauthorized", "unauthorized")


def current_profile_id(session: Any) -> str:
    """The active learner profile id, creating the default profile row if needed.

    v1 exposes exactly one profile (ruling R2-5) — this is the single place that resolves
    it, so a profile switcher in v1.x is a change here and nowhere else.
    """
    from sqlalchemy import text

    from bandready.settings_store import load_settings

    wanted = str(load_settings().get("active_profile_id") or DEFAULT_PROFILE_ID)

    row = session.execute(
        text("SELECT id FROM profiles WHERE id = :id"), {"id": wanted}
    ).first()
    if row is not None:
        return str(row[0])

    existing = session.execute(text("SELECT id FROM profiles ORDER BY created_at LIMIT 1")).first()
    if existing is not None:
        return str(existing[0])

    return _create_default_profile(session, wanted)


def _create_default_profile(session: Any, profile_id: str) -> str:
    """Insert the auto-created first profile (11-data-model.md §2).

    Raw SQL, and every DB import is function-local: ``bandready.db.models`` pulls in the
    whole ORM (which imports config, which imports back into the server package), so a
    module-level import here would be a startup cycle. Column-level SQL also keeps this
    working no matter what the ORM class for ``profiles`` ends up being called.
    """
    from sqlalchemy import text

    session.execute(
        text(
            "INSERT INTO profiles (id, name, exam_format, daily_minutes) "
            "VALUES (:id, :name, 'academic', 60) "
            "ON CONFLICT(id) DO NOTHING"
        ),
        {"id": profile_id, "name": DEFAULT_PROFILE_NAME},
    )
    _log.info("created the default learner profile %r", profile_id)
    return profile_id
