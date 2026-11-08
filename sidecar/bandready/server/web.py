"""The browser edition: the sidecar serves the app's own pages.

Off unless ``BANDREADY_WEB=1``, which only the ``bandready`` launcher
(:mod:`bandready.launch`) sets. The desktop app loads its pages from disk and never
takes this path.

The pages need the per-launch bearer token. In the desktop app Electron's preload bridge
hands it over, and only Electron ever holds it. Here it is written into ``index.html``,
so ``index.html`` must not go to just anyone who can reach the port: on a shared
computer that includes every other account on it. So the page is gated the way Jupyter
gates its own:

1. The launcher holds a *launch secret*, in a file only this user can read, and passes it
   to this process through the environment (also owner-only).
2. It opens the browser through a local redirect file to ``/?launch=<secret>``. The
   secret never appears on a command line, where ``ps`` would show it to other users.
3. That request swaps the secret for an HttpOnly session cookie, and only a request
   carrying the cookie gets the page with the token in it.

Cross-origin pages cannot read any of this, and the Host guard in
:class:`~bandready.server.auth.AuthMiddleware` stops a DNS-rebound page from posing as
same-origin. The built JavaScript and CSS hold no secrets and are served to anyone.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

_log = logging.getLogger("bandready.web")

#: Where the release build puts the renderer bundle inside the wheel.
BUNDLED_WEB_DIR = Path(__file__).resolve().parents[1] / "_bundle" / "web"

_TRUTHY = {"1", "true", "yes", "on"}

LAUNCH_SECRET_ENV = "BANDREADY_WEB_LAUNCH_SECRET"

_SIGN_IN_AGAIN = """<!doctype html><html><head><meta charset="utf-8">
<title>BandReady</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;line-height:1.5">
<h1 style="font-size:1.25rem">Open BandReady from its shortcut</h1>
<p>For your privacy this page only opens through the BandReady shortcut, or by typing
<code>bandready</code> in a terminal. Close this tab and open BandReady again.</p>
</body></html>"""


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


#: Path the launcher asks before reusing a running server (see :func:`launch_proof`).
PROOF_PATH = "/launch-proof"


def launch_proof(secret: str, challenge: str) -> str:
    """What only a server holding ``secret`` can answer to ``challenge``.

    A second launch reuses the server named in ``web.json``. Anything else could be
    listening on that port by then, and ``/health`` is trivial to imitate, so the launcher
    sends a fresh challenge and checks the answer before it opens a browser there.
    """
    return hmac.new(secret.encode(), challenge.encode(), hashlib.sha256).hexdigest()


def session_cookie_name(port: int | str) -> str:
    # Browsers do not keep cookies apart by port, so the port goes in the name.
    return f"bandready-session-{port}"


def install_web(app: FastAPI, token: str, *, port: int | str) -> bool:
    """Serve the renderer at ``/``. Must run after every API router is included."""
    root = web_dir()
    if root is None:
        _log.error(
            "browser edition requested but no built pages were found; set BANDREADY_WEB_DIR "
            "or install a release wheel"
        )
        return False

    launch_secret = os.environ.get(LAUNCH_SECRET_ENV) or ""
    if not launch_secret:
        # Nothing can sign in, which is the safe failure. The launcher always sets it.
        _log.error("%s is not set: the app pages cannot be opened", LAUNCH_SECRET_ENV)
    session = secrets.token_urlsafe(32)
    cookie = session_cookie_name(port)
    html = index_with_contract((root / "index.html").read_text(encoding="utf-8"), token)

    async def index(request: Request) -> Response:
        offered = request.query_params.get("launch")
        if offered is not None:
            if launch_secret and hmac.compare_digest(offered, launch_secret):
                # 303 to a clean URL, so the secret leaves the address bar.
                resp = RedirectResponse("/", status_code=303)
                # Lax, not Strict: the first visit arrives from the launcher's local redirect
                # file, a cross-site navigation, and Strict would drop the cookie on the very
                # redirect that sets it. The page this unlocks is a GET that no other origin
                # can read.
                resp.set_cookie(cookie, session, httponly=True, samesite="lax", path="/")
                return resp
            return HTMLResponse(_SIGN_IN_AGAIN, status_code=403)

        presented = request.cookies.get(cookie) or ""
        if presented and hmac.compare_digest(presented, session):
            # Never cached: the token changes on every launch.
            return HTMLResponse(html, headers={"Cache-Control": "no-store"})
        return HTMLResponse(_SIGN_IN_AGAIN, status_code=401, headers={"Cache-Control": "no-store"})

    async def proof(challenge: str = "") -> dict[str, str]:
        if not launch_secret or not challenge:
            return {"proof": ""}
        return {"proof": launch_proof(launch_secret, challenge[:128])}

    app.add_api_route(PROOF_PATH, proof, methods=["GET"], include_in_schema=False)
    app.add_api_route("/", index, methods=["GET"], include_in_schema=False)
    app.add_api_route("/index.html", index, methods=["GET"], include_in_schema=False)
    app.mount("/", StaticFiles(directory=root), name="web")
    _log.info("serving the app pages from %s", root)
    return True
