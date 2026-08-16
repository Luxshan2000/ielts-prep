"""Settings routes (18-api-contract.md §4.2, 03-providers-and-settings.md §2/§8).

Three routes, one document. The behaviour that matters:

* ``GET`` returns the **masked** document — plaintext keys never leave this process, and
  ``${ENV_VAR}`` references are shown literally so the user can recognise their own setup.
* ``PATCH`` is a partial deep-merge (R2-19; ``PUT`` is dropped). The renderer round-trips
  untouched secret fields as the ``"•••• (stored)"`` sentinel, which the store strips so a
  save never overwrites a key the user did not retype. New plaintext keys are encrypted
  before the atomic write.
* ``POST /reset`` restores factory defaults — settings hold no attempts, scores or
  scheduling state (03 §1.5), so blowing them away is always safe.

Hot-apply is free: every consumer resolves the settings document per call
(``bandready.providers.llm._resolve_config``), so the next scoring call or voice session
picks up the new configuration with no restart.

One block of this document is not stored in it. Four of the ``study`` keys — exam format,
target band, minutes a day and study days — are read by the plan, the streak, the heatmap
and every "what you still need" line from the ``profiles`` row, which is where onboarding
writes them. The copy in ``settings.study`` was never written by onboarding and never read
by anything, so Settings > You showed the factory defaults to a learner who had chosen
something else, and every change they made there went nowhere. The two are mirrored here,
in the one place that already owns the read and write of this document.
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


# ------------------------------------------------------------------- study ↔ profile

#: Mirrored, ``settings.study`` key -> ``profiles`` column: ``exam_format``,
#: ``target_band``, ``daily_minutes`` and ``study_days`` -> ``study_days_json``. Only
#: those four; the SRS limits and ``calibration_few_shot`` genuinely do live in the
#: settings document and are read from it (``bandready.srs.scheduler.study_limits``).
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _profile_id(session: Any) -> str | None:
    """The active profile's id — read-only, so a plain GET never creates a row."""
    from sqlalchemy import text

    from bandready.settings_store import load_settings

    wanted = str(load_settings().get("active_profile_id") or "default")
    row = session.execute(text("SELECT id FROM profiles WHERE id = :id"), {"id": wanted}).first()
    if row is None:
        row = session.execute(
            text("SELECT id FROM profiles ORDER BY created_at LIMIT 1")
        ).first()
    return str(row[0]) if row else None


def _study_from_profile() -> dict[str, Any]:
    """The four mirrored keys as the learner's profile actually holds them."""
    import json

    from sqlalchemy import text

    from bandready.db.engine import session_scope

    with session_scope() as session:
        profile_id = _profile_id(session)
        if profile_id is None:
            return {}
        row = session.execute(
            text(
                "SELECT exam_format, target_band, daily_minutes, study_days_json "
                "FROM profiles WHERE id = :pid"
            ),
            {"pid": profile_id},
        ).mappings().first()
    if row is None:
        return {}

    out: dict[str, Any] = {}
    if row["exam_format"]:
        out["exam_format"] = str(row["exam_format"])
    if row["target_band"] is not None:
        out["target_band"] = float(row["target_band"])
    if row["daily_minutes"] is not None:
        out["daily_minutes"] = int(row["daily_minutes"])
    try:
        days = json.loads(row["study_days_json"] or "[]")
    except (TypeError, ValueError):
        days = []
    days = [d for d in days if d in WEEKDAYS]
    if days:
        out["study_days"] = days
    return out


def _with_profile_study(doc: dict[str, Any]) -> dict[str, Any]:
    """Overlay the profile's answers onto the document the UI renders."""
    try:
        overlay = _study_from_profile()
    except Exception as exc:  # noqa: BLE001 — never fail a read over the mirror
        _log.debug("study mirror could not be read: %s", exc)
        return doc
    if overlay:
        doc["study"] = {**(doc.get("study") or {}), **overlay}
    return doc


#: `profiles` carries CHECK (daily_minutes IN (30,60,90)) and the planner only composes
#: those three session shapes, so anything else is not a slower plan — it is a rejected
#: write. One bad value used to take the whole UPDATE down with it and lose the exam
#: format and target band alongside it, so each key is screened on its own.
_SESSION_LENGTHS = (30, 60, 90)
_EXAM_FORMATS = ("academic", "general_training")


def _mirror_updates(study: dict[str, Any]) -> dict[str, Any]:
    """The subset of ``study`` that the profiles row can actually hold, per column."""
    import json

    updates: dict[str, Any] = {}

    fmt = study.get("exam_format")
    if fmt in _EXAM_FORMATS:
        updates["exam_format"] = fmt

    if "target_band" in study:
        try:
            band = round(float(study["target_band"]) * 2) / 2
        except (TypeError, ValueError):
            band = None
        if band is not None and 4.0 <= band <= 9.0:
            updates["target_band"] = band

    if "daily_minutes" in study:
        try:
            minutes = int(study["daily_minutes"])
        except (TypeError, ValueError):
            minutes = -1
        if minutes in _SESSION_LENGTHS:
            updates["daily_minutes"] = minutes

    if "study_days" in study:
        raw = study["study_days"]
        days = [d for d in raw if d in WEEKDAYS] if isinstance(raw, list) else []
        # An empty week is not a preference anybody can act on: the planner already
        # substitutes Mon–Sat for it, so store what will actually be used.
        updates["study_days_json"] = json.dumps(days or list(WEEKDAYS[:6]))

    return updates


def _mirror_study_to_profile(study: dict[str, Any]) -> None:
    """Write the four mirrored keys through to the profile the plan is built from."""
    updates = _mirror_updates(study)
    if not updates:
        return

    try:
        from sqlalchemy import text

        from bandready.db.engine import session_scope
        from bandready.server.deps import current_profile_id

        with session_scope() as session:
            # The write path creates the default profile if this is the learner's first
            # act in the app; the read path above never writes.
            profile_id = current_profile_id(session)
            assignments = ", ".join(f"{col} = :{col}" for col in updates)
            session.execute(
                text(f"UPDATE profiles SET {assignments} WHERE id = :pid"),
                {**updates, "pid": profile_id},
            )
    except Exception as exc:  # noqa: BLE001 — never fail a save over the mirror
        _log.warning("study preferences could not be mirrored to the profile: %s", exc)


@router.get("", summary="The settings document (secrets masked)")
async def get_settings_doc(_: None = Depends(require_auth)) -> dict[str, Any]:
    return _with_profile_study(load_settings_masked())


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
    study = body.get("study")
    if isinstance(study, dict):
        _mirror_study_to_profile(study)
    _hot_apply()
    return _with_profile_study(load_settings_masked())


@router.post("/reset", summary="Restore factory-default settings")
async def reset_settings(_: None = Depends(require_auth)) -> dict[str, Any]:
    save_settings(copy.deepcopy(DEFAULT_SETTINGS))
    # The mirrored keys are read back from the profile, so resetting only the document
    # would hand back the old answers and call them factory defaults.
    _mirror_study_to_profile(dict(DEFAULT_SETTINGS["study"]))
    _hot_apply()
    _log.info("settings reset to factory defaults")
    return _with_profile_study(load_settings_masked())
