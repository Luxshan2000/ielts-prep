"""The single error envelope every non-2xx response uses (18-api-contract.md §1).

    {"detail": "<human readable>", "code": "<machine code>"}
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_log = logging.getLogger("bandready.errors")

# Extensible, but these are the codes the contract enumerates.
CODES = (
    "unauthorized",
    "not_found",
    "validation_error",
    "conflict",
    "provider_error",
    "job_failed",
    "ticket_invalid",
    "ticket_expired",
    "rate_limited",
    "env_var_missing",
    "internal",
)

_STATUS_CODE_DEFAULTS = {
    400: "validation_error",
    401: "unauthorized",
    403: "unauthorized",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
}


class ApiError(Exception):
    """Raise anywhere in a request to render the standard error envelope.

    >>> raise ApiError(404, "not_found", "no writing attempt with that id")
    """

    def __init__(self, status: int, code: str, detail: str) -> None:
        super().__init__(detail)
        self.status = int(status)
        self.code = code
        self.detail = detail

    def to_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=self.status,
            content={"detail": self.detail, "code": self.code},
        )

    def __repr__(self) -> str:  # pragma: no cover — debugging aid
        return f"ApiError({self.status}, {self.code!r}, {self.detail!r})"


def error_response(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "code": code})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        if exc.status >= 500:
            _log.error("api error %s/%s: %s", exc.status, exc.code, exc.detail)
        return exc.to_response()

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "request failed"
        code = _STATUS_CODE_DEFAULTS.get(exc.status_code, "internal")
        # A route may raise HTTPException(detail={"detail":..., "code":...}) too.
        if isinstance(exc.detail, dict):
            detail = str(exc.detail.get("detail", detail))
            code = str(exc.detail.get("code", code))
        return error_response(exc.status_code, code, detail)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        parts: list[str] = []
        for err in exc.errors()[:5]:
            loc = ".".join(str(x) for x in err.get("loc", ()) if x != "body")
            parts.append(f"{loc or 'body'}: {err.get('msg', 'invalid')}")
        return error_response(422, "validation_error", "; ".join(parts) or "invalid request")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        _log.exception("unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, "internal", f"{type(exc).__name__}: {exc}")
