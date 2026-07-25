"""Job polling routes (18-api-contract.md §3 / §4.5, ruling R2-3).

Exactly two progress transports exist in BandReady: the per-session speaking WebSocket,
and these three routes. Model downloads, writing evaluation, content generation, provider
setup and pack import all land here, which is why the Models settings page can render
in-flight work with ``GET /api/v1/jobs?kind=model_download``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Response

from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import KNOWN_KINDS, STATES, job_manager

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("", summary="Recent jobs, newest first")
async def list_jobs(
    kind: str | None = Query(default=None),
    state: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    if kind and kind not in KNOWN_KINDS:
        raise ApiError(422, "validation_error", f"unknown job kind {kind!r}")
    if state and state not in STATES:
        raise ApiError(
            422, "validation_error", f"state must be one of {', '.join(STATES)}"
        )
    return job_manager.list(kind=kind, state=state, limit=limit, cursor=cursor)


@router.get("/{job_id}", summary="One job")
async def get_job(job_id: str, _: None = Depends(require_auth)) -> dict[str, Any]:
    job = job_manager.get(job_id)
    if job is None:
        raise ApiError(404, "not_found", f"no job with id {job_id!r}")
    return job


@router.post("/{job_id}/cancel", status_code=202, summary="Best-effort cancellation")
async def cancel_job(
    job_id: str, response: Response, _: None = Depends(require_auth)
) -> dict[str, Any]:
    job = job_manager.get(job_id)
    if job is None:
        raise ApiError(404, "not_found", f"no job with id {job_id!r}")
    if not job_manager.cancel(job_id):
        raise ApiError(409, "conflict", f"job {job_id} is already {job['state']}")
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"id": job_id, "state": "cancelling"}
