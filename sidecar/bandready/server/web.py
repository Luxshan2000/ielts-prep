"""The browser edition: the sidecar serves the app's own pages.

Off unless ``BANDREADY_WEB=1``, which only the ``bandready`` launcher
(:mod:`bandready.launch`) sets. The desktop app loads its pages from disk and never
takes this path.

The pages need the per-launch bearer token, and in the desktop app Electron's preload
bridge hands it over. Here the token is written into ``index.html`` as it is served.
That is safe for the same reasons the API is: the server binds loopback only, and
:class:`~bandready.server.auth.AuthMiddleware` refuses any ``Host`` that is not a
loopback name, so a DNS-rebound page cannot fetch this document. A web page on another
origin can make the request but cannot read the response.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

_log = logging.getLogger("bandready.web")

#: Where the release build puts the renderer bundle inside the wheel.
BUNDLED_WEB_DIR = Path(__file__).resolve().parents[1] / "_bundle" / "web"

_TRUTHY = {"1", "true", "yes", "on"}


def web_enabled() -> bool:
    return (os.environ.get("BANDREADY_WEB") or "").strip().lower() in _TRUTHY


def web_dir() -> Path | None:
    """The built renderer: ``$BANDREADY_WEB_DIR`` first, then the copy inside the wheel."""
    candidates: list[Path] = []
    env = os.environ.get("BANDREADY_WEB_DIR")
    if env:
        candidates.append(Path(env).expanduser())
    candidates.append(BUNDLED_WEB_DIR)
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return None


def index_with_contract(page: str, token: str) -> str:
    """``index.html`` with the token the renderer's API client reads on start-up."""
    # `<` is escaped so no value can close the script element early.
    contract = json.dumps({"token": token}).replace("<", "\\u003c")
    script = f"<script>window.__BANDREADY_SIDECAR__={contract};</script>"
    if "<head>" in page:
        return page.replace("<head>", "<head>" + script, 1)
    return script + page


def install_web(app: FastAPI, token: str) -> bool:
    """Serve the renderer at ``/``. Must run after every API router is included."""
    root = web_dir()
    if root is None:
        _log.error(
            "browser edition requested but no built pages were found; set BANDREADY_WEB_DIR "
            "or install a release wheel"
        )
        return False

    html = index_with_contract((root / "index.html").read_text(encoding="utf-8"), token)

    async def index() -> HTMLResponse:
        # Never cached: the token changes on every launch.
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    app.add_api_route("/", index, methods=["GET"], include_in_schema=False)
    app.add_api_route("/index.html", index, methods=["GET"], include_in_schema=False)
    app.mount("/", StaticFiles(directory=root), name="web")
    _log.info("serving the app pages from %s", root)
    return True
