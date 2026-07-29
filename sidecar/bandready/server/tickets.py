"""Short-lived signed tickets for the two contexts that cannot set headers:
``<audio>`` elements and browser ``WebSocket``s (18-api-contract.md §2, ruling R2-2).

    payload = "{audience}|{resource}|{exp_unix}"
    sig     = HMAC-SHA256(key = sidecar bearer token, msg = payload)
    ticket  = b64url(payload) + "." + b64url(sig)

No server-side state: verification recomputes the HMAC. Ticket values are a 60-second
capability derived from the bearer token — they are NEVER logged and never appear in an
error ``detail``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Literal

from bandready.server.errors import ApiError

Audience = Literal["media-read", "session-events"]

AUDIENCES: tuple[str, ...] = ("media-read", "session-events")
DEFAULT_TTL = 60

#: Per-audience lifetime. ``session-events`` keeps the 60-second default: a socket
#: presents its ticket once, at connect.
#:
#: ``media-read`` cannot. An ``<audio>`` element holds one URL for the whole life of the
#: element and re-presents it on every HTTP ``Range`` request — every seek, and every
#: progressive-buffer top-up. A listening part runs 5-7 minutes and the review screen is
#: read for far longer, so a 60-second ticket is dead long before the learner clicks
#: "replay from 1:28". The failure is also invisible: the 401 goes to a no-cors media
#: request, so the browser reports the opaque response as ``ERR_BLOCKED_BY_ORB`` and the
#: element just stops with ``MEDIA_ERR_NETWORK``.
#:
#: Lengthening it costs nothing here. The ticket is HMAC'd with the bearer token and
#: scoped to one exact media path, the sidecar is loopback-only, and anyone able to
#: present a ticket can mint a fresh one from the same token anyway.
AUDIENCE_TTL: dict[str, int] = {
    "media-read": 12 * 60 * 60,
    "session-events": DEFAULT_TTL,
}


def ttl_for(audience: str) -> int:
    """Lifetime in seconds for one audience."""
    return AUDIENCE_TTL.get(audience, DEFAULT_TTL)


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def _key() -> bytes:
    from bandready.config import get_settings

    # An empty auth token (dev/tests with auth disabled) still yields a stable key so
    # ticket round-trips work; it just isn't a secret in that mode.
    return (get_settings().auth_token or "bandready-dev-unauthenticated").encode("utf-8")


def _sign(payload: str) -> str:
    return _b64e(hmac.new(_key(), payload.encode("utf-8"), hashlib.sha256).digest())


def issue_ticket(audience: str, resource: str, ttl: int = DEFAULT_TTL) -> str:
    """Mint a ticket for exactly one audience and one resource."""
    if audience not in AUDIENCES:
        raise ApiError(422, "validation_error", f"unknown ticket audience {audience!r}")
    if not resource:
        raise ApiError(422, "validation_error", "ticket resource is required")
    if "|" in audience or "|" in resource:
        raise ApiError(422, "validation_error", "ticket fields may not contain '|'")
    exp = int(time.time()) + max(1, int(ttl))
    payload = f"{audience}|{resource}|{exp}"
    return f"{_b64e(payload.encode('utf-8'))}.{_sign(payload)}"


def decode_ticket(ticket: str | None) -> tuple[str, str, int] | None:
    """Return ``(audience, resource, exp)`` if the signature checks out, else ``None``.

    Expiry is NOT checked here — callers distinguish `ticket_invalid` from
    `ticket_expired`.
    """
    if not ticket or "." not in ticket:
        return None
    body, _, sig = ticket.partition(".")
    try:
        payload = _b64d(body).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None
    if not hmac.compare_digest(sig, _sign(payload)):
        return None
    audience, _, rest = payload.partition("|")
    resource, _, exp_s = rest.rpartition("|")
    try:
        exp = int(exp_s)
    except ValueError:
        return None
    if audience not in AUDIENCES:
        return None
    return audience, resource, exp


def verify_ticket(ticket: str | None, audience: str, resource: str) -> bool:
    """True iff `ticket` is a live signature over exactly this audience + resource."""
    decoded = decode_ticket(ticket)
    if decoded is None:
        return False
    got_audience, got_resource, exp = decoded
    if exp <= int(time.time()):
        return False
    return hmac.compare_digest(got_audience, audience) and hmac.compare_digest(
        got_resource, resource
    )


def require_ticket(ticket: str | None, audience: str, resource: str) -> None:
    """Raise the contract's 401 envelope when a ticket is missing/wrong/expired."""
    decoded = decode_ticket(ticket)
    if decoded is None:
        raise ApiError(401, "ticket_invalid", "invalid ticket")
    got_audience, got_resource, exp = decoded
    if exp <= int(time.time()):
        raise ApiError(401, "ticket_expired", "ticket expired")
    if not hmac.compare_digest(got_audience, audience) or not hmac.compare_digest(
        got_resource, resource
    ):
        raise ApiError(401, "ticket_invalid", "invalid ticket")


def ticket_signature_ok(ticket: str | None) -> bool:
    """Signature + expiry only — used by the auth middleware, which cannot know the
    audience/resource a route will demand. The route still calls `require_ticket`."""
    decoded = decode_ticket(ticket)
    return decoded is not None and decoded[2] > int(time.time())
