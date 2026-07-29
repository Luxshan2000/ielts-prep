"""Ticket minting (18-api-contract.md §2, ruling R2-2).

``<audio>`` elements and browser ``WebSocket``s cannot set an ``Authorization`` header, so
the renderer mints a 60-second, single-audience, single-resource signed ticket and appends
it as a query param. There is no server-side state: the signature is an HMAC over
``audience|resource|exp`` keyed by the per-launch bearer token.

The minted value is **never logged** — it is a 60-second capability derived from the
bearer token.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends

from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.tickets import AUDIENCES, issue_ticket, ttl_for

router = APIRouter(prefix="/api/v1/tickets", tags=["tickets"])

MAX_RESOURCE_LEN = 512


@router.post("", status_code=201, summary="Mint a short-lived signed ticket")
async def create_ticket(
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    audience = str(body.get("audience") or "").strip()
    resource = str(body.get("resource") or "").strip()

    if audience not in AUDIENCES:
        raise ApiError(
            422,
            "validation_error",
            f"audience must be one of {', '.join(AUDIENCES)}",
        )
    if not resource:
        raise ApiError(422, "validation_error", "resource is required")
    if len(resource) > MAX_RESOURCE_LEN:
        raise ApiError(422, "validation_error", "resource is too long")
    if audience == "media-read" and not resource.startswith("/api/v1/media/"):
        raise ApiError(
            422,
            "validation_error",
            "a media-read resource is the exact request path of one media file",
        )

    ttl = ttl_for(audience)
    ticket = issue_ticket(audience, resource, ttl)
    return {"ticket": ticket, "expires_in": ttl, "audience": audience}
