"""Content packs — 18-api-contract.md §4.14 (11 §11 owns the format, 15 the authoring).

Import runs as a §3 job (``kind='pack_import'``) because checksum verification plus a
few thousand row upserts is seconds-to-minutes work. Validation is available
synchronously so the UI can show what is wrong with a pack before committing to it.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.content import loader
from bandready.content.validate import PackError, validate_pack
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.routes.packs")

router = APIRouter(prefix="/api/v1/packs", tags=["packs"])


class ImportBody(BaseModel):
    path: str


class ValidateBody(BaseModel):
    path: str
    verify_checksums: bool = True


def _resolve(path_str: str) -> Path:
    path = Path(path_str).expanduser()
    if not path.exists():
        raise ApiError(404, "not_found", f"no content pack at {path}")
    return path


@router.get("", summary="Installed content packs")
def list_packs(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    return loader.list_packs(session)


@router.get("/available", summary="The shipped pack found on disk, if any")
def available_pack(_: None = Depends(require_auth)) -> dict[str, Any]:
    path = loader.default_pack_path()
    if path is None:
        return {
            "found": False,
            "searched": [str(p) for p in loader.candidate_pack_paths()],
            "hint": "Place a .brpack (or an extracted pack directory) in content/core-en.",
        }
    report = validate_pack(path) if path.is_dir() else None
    return {
        "found": True,
        "path": str(path),
        "pack_id": report.pack_id if report else None,
        "version": report.version if report else None,
        "valid": report.ok if report else None,
    }


@router.post("/validate", summary="Validate a pack without installing it")
def validate(
    body: ValidateBody,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    path = _resolve(body.path)
    if path.is_dir():
        return validate_pack(path, verify_checksums=body.verify_checksums).as_dict()
    try:
        with loader.open_pack(path) as root:
            return validate_pack(root, verify_checksums=body.verify_checksums).as_dict()
    except PackError as exc:
        return exc.report.as_dict()


def _import_job(path: Path, repair: bool, profile_id: str) -> Any:
    """Job factory: the job body owns its own DB session and transaction."""

    async def run(job_id: str) -> dict[str, Any]:
        def work() -> dict[str, Any]:
            from bandready.db.engine import session_scope

            def progress(pct: float, detail: str) -> None:
                job_manager.set_progress(job_id, pct, detail)

            with session_scope() as session:
                result = loader.import_pack(session, path, progress=progress, repair=repair)
                session.execute(
                    text(
                        "INSERT INTO activity_log (id, profile_id, event_type, ref_kind, ref_id, "
                        "meta_json) VALUES (:id, :pid, 'pack_installed', 'content_pack', :ref, "
                        ":meta)"
                    ),
                    {
                        "id": f"al_{ULID()}",
                        "pid": profile_id,
                        "ref": result.get("pack_id"),
                        "meta": json.dumps(
                            {"version": result.get("version"), "status": result.get("status")}
                        ),
                    },
                )
            return result

        try:
            return await asyncio.to_thread(work)
        except PackError as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc

    return run


@router.post("/import", status_code=status.HTTP_202_ACCEPTED, summary="Import a .brpack")
def import_pack(
    body: ImportBody,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    path = _resolve(body.path)
    profile_id = current_profile_id(session)
    job_id = job_manager.submit("pack_import", _import_job(path, False, profile_id))
    return {"job_id": job_id, "kind": "pack_import", "path": str(path)}


@router.post(
    "/{pack_id}/repair",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Re-verify and rewrite a pack's rows",
)
def repair_pack(
    pack_id: str,
    body: ImportBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    installed = {p["pack_id"] for p in loader.list_packs(session)}
    if pack_id not in installed and body is None:
        raise ApiError(404, "not_found", f"pack {pack_id} is not installed")
    path = _resolve(body.path) if body and body.path else loader.default_pack_path()
    if path is None:
        raise ApiError(
            422,
            "validation_error",
            "repair needs the original .brpack — pass {\"path\": \"…\"}",
        )
    profile_id = current_profile_id(session)
    job_id = job_manager.submit("pack_import", _import_job(path, True, profile_id))
    return {"job_id": job_id, "kind": "pack_import", "pack_id": pack_id, "path": str(path)}


@router.delete("/{pack_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Uninstall a pack")
def delete_pack(
    pack_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> Response:
    installed = {p["pack_id"] for p in loader.list_packs(session)}
    if pack_id not in installed:
        raise ApiError(404, "not_found", f"pack {pack_id} is not installed")
    # Learner data referencing pack content is kept; rows are retired, never deleted.
    loader.uninstall_pack(session, pack_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
