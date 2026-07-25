"""Settings routes (18-api-contract.md §4.2, 03-providers-and-settings.md §2/§8).

Three routes, one document. The behaviour that matters:

* ``GET`` returns the **masked** document — plaintext keys never leave this process, and
  ``${ENV_VAR}`` references are shown literally so the user can recognise their own setup.
* ``PATCH`` is a partial deep-merge (R2-19; ``PUT`` is dropped). The renderer round-trips
  untouched secret fields as the ``"•••• (stored)"`` sentinel, which the store strips so a
  save never overwrites a key the user did not retype. New plaintext keys are encrypted
  before the atomic write.
* ``POST /reset`` restores factory defaults — settings hold zero learner data (03 §1.5),
  so blowing them away is always safe.

Hot-apply is free: every consumer resolves the settings document per call
(``bandready.providers.llm._resolve_config``), so the next scoring call or voice session
picks up the new configuration with no restart.
"""

from __future__ import annotations

import copy
import logging
from typing import Any

from fastapi import APIRouter, Body, Depends

from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.settings_store import (
    DEFAULT_SETTINGS,
    load_settings_masked,
    patch_settings,
    save_settings,
)

_log = logging.getLogger("bandready.routes.settings")

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


def _hot_apply() -> None:
    """Invalidate the caches that would otherwise serve a stale provider view."""
    try:
        from bandready.providers.detect import invalidate_cache

        invalidate_cache()
    except Exception as exc:  # noqa: BLE001 — never fail a save over a cache
        _log.debug("detection cache could not be invalidated: %s", exc)


@router.get("", summary="The settings document (secrets masked)")
async def get_settings_doc(_: None = Depends(require_auth)) -> dict[str, Any]:
    return load_settings_masked()


@router.patch("", summary="Partial deep-merge update of the settings document")
async def patch_settings_doc(
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ApiError(422, "validation_error", "the settings patch must be a JSON object")
    unknown = set(body) - set(DEFAULT_SETTINGS) - {"first_run"}
    if unknown:
        raise ApiError(
            422,
            "validation_error",
            f"unknown settings section(s): {', '.join(sorted(unknown))}",
        )
    body.pop("first_run", None)
    patch_settings(body)
    _hot_apply()
    return load_settings_masked()


@router.post("/reset", summary="Restore factory-default settings")
async def reset_settings(_: None = Depends(require_auth)) -> dict[str, Any]:
    save_settings(copy.deepcopy(DEFAULT_SETTINGS))
    _hot_apply()
    _log.info("settings reset to factory defaults")
    return load_settings_masked()
