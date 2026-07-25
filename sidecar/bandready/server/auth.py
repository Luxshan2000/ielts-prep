"""Bearer auth + loopback/CSRF guard (01-architecture.md §5, 18 §1).

The sidecar is a real HTTP server on localhost, so it must be unusable by other local
processes and by any web page attempting DNS rebinding. Three layers, cheapest first:

1. **Host guard** — the ``Host`` header must name a loopback address. This is what stops
   DNS rebinding: a rebound page reaches us with ``Host: evil.example``.
2. **Origin guard** — when an ``Origin`` header is present it must be an allowed app or
   dev origin.
3. **Bearer token** — 256-bit per-launch token, constant-time compare. The only exempt
   route is ``GET /health``; requests carrying a live signed ticket (18 §2) are exempt
   because ``<audio>`` and ``WebSocket`` cannot set headers — the route itself still
   validates the ticket's audience and resource.
"""

from __future__ import annotations

import hmac
import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from bandready.server.tickets import ticket_signature_ok

_log = logging.getLogger("bandready.auth")

EXEMPT_PATHS = frozenset({"/health"})
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"})

# Dev + packaged renderer origins. `file://` sends `Origin: null`.
ALLOWED_ORIGIN_SCHEMES = ("app://", "file://")
DEV_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def _unauthorized(detail: str = "unauthorized") -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": detail, "code": "unauthorized"})


def _forbidden(detail: str) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": detail, "code": "unauthorized"})


def host_is_loopback(host_header: str | None) -> bool:
    if not host_header:
        return True  # HTTP/1.0 clients and some test clients omit it
    host = host_header.strip()
    if host.startswith("["):  # [::1]:1234
        host = host.split("]")[0] + "]"
    else:
        host = host.split(":")[0]
    return host in LOOPBACK_HOSTS


def origin_is_allowed(origin: str | None) -> bool:
    if not origin or origin == "null":
        return True
    if origin.startswith(ALLOWED_ORIGIN_SCHEMES):
        return True
    if origin in DEV_ORIGINS:
        return True
    # Any loopback origin is acceptable — the bearer token is the real gate and the
    # renderer's dev port is configurable.
    return origin.startswith(("http://127.0.0.1:", "http://localhost:"))


def token_matches(presented: str | None, expected: str) -> bool:
    if not expected:
        return True  # auth disabled (dev/tests) — see AuthMiddleware.__init__
    if not presented:
        return False
    return hmac.compare_digest(presented, expected)


def bearer_from(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def is_exempt(path: str) -> bool:
    return path in EXEMPT_PATHS


class AuthMiddleware(BaseHTTPMiddleware):
    """Applies the three guards above to every request."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        super().__init__(app)
        self.token = token or ""
        if not self.token:
            _log.warning(
                "BANDREADY_AUTH_TOKEN is not set — bearer auth is DISABLED and only the "
                "loopback binding protects this process. Never do this in a packaged app."
            )

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        if not host_is_loopback(request.headers.get("host")):
            _log.warning("rejected non-loopback Host header on %s", path)
            return _forbidden("this server only accepts loopback requests")

        if not origin_is_allowed(request.headers.get("origin")):
            _log.warning("rejected disallowed Origin on %s", path)
            return _forbidden("origin not allowed")

        if request.method == "OPTIONS" or is_exempt(path):
            request.state.authenticated = True
            return await call_next(request)

        if token_matches(bearer_from(request), self.token):
            request.state.authenticated = True
            request.state.auth_kind = "bearer"
            return await call_next(request)

        # Ticket-bearing requests (media GETs, WS upgrades). The signature and expiry are
        # checked here; the route checks audience + resource via require_ticket().
        ticket = request.query_params.get("ticket")
        if ticket and ticket_signature_ok(ticket):
            request.state.authenticated = True
            request.state.auth_kind = "ticket"
            return await call_next(request)

        return _unauthorized()


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Request logging with the ``ticket`` query param redacted (18 §2)."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        if _log.isEnabledFor(logging.DEBUG):
            params = dict(request.query_params)
            if "ticket" in params:
                params["ticket"] = "<redacted>"
            query = "&".join(f"{k}={v}" for k, v in params.items())
            _log.debug(
                "%s %s%s -> %s",
                request.method,
                request.url.path,
                f"?{query}" if query else "",
                response.status_code,
            )
        return response
