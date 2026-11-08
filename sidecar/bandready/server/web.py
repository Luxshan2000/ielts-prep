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
3. Only that request gets the page with the token in it. The page keeps the token in
   ``sessionStorage`` for reloads and takes the secret out of the address bar.

There is no cookie. Browsers do not keep cookies apart by port, so a cookie set here
would also be sent to any other server on 127.0.0.1 the learner happened to open, and
another account's server could replay it. ``sessionStorage`` belongs to one origin,
port included. Every other request for the page gets it without a token, and the app
then shows only a note to open BandReady from its shortcut.

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
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

_log = logging.getLogger("bandready.web")

#: Where the release build puts the renderer bundle inside the wheel.
BUNDLED_WEB_DIR = Path(__file__).resolve().parents[1] / "_bundle" / "web"

_TRUTHY = {"1", "true", "yes", "on"}

LAUNCH_SECRET_ENV = "BANDREADY_WEB_LAUNCH_SECRET"

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


#: The ``sessionStorage`` key the page keeps the token under between reloads.
STORAGE_KEY = "bandready-token"


def index_with_contract(page: str, token: str | None) -> str:
    """``index.html`` with the script that hands the renderer its token.

    With a token (the launch visit) the script stores it and cleans the address bar.
    Without one it reads a token stored by an earlier launch visit in this tab, if any.
    Either way it leaves ``window.__BANDREADY_SIDECAR__``, which ``lib/api.ts`` reads,
    and an empty token there tells ``main.tsx`` to show the open-from-shortcut note.
    """
    # `<` is escaped so no value can close the script element early.
    value = json.dumps(token).replace("<", "\\u003c")
    key = json.dumps(STORAGE_KEY)
    script = (
        "<script>(function(){"
        f"var t={value};"
        "try{"
        f"if(t){{sessionStorage.setItem({key},t);"
        "history.replaceState(null,'',location.pathname+location.hash);}"
        f"else{{t=sessionStorage.getItem({key});}}"
        "}catch(e){}"
        "window.__BANDREADY_SIDECAR__={token:t||''};"
        "})();</script>"
    )
    # First thing in <head>, ahead of the page's Content-Security-Policy meta tag. That
    # policy allows no inline script, and a policy set by <meta> only governs what comes
    # after it, so this one line runs and nothing injected later could.
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


def install_web(app: FastAPI, token: str) -> bool:
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
    page = (root / "index.html").read_text(encoding="utf-8")
    unlocked = index_with_contract(page, token)
    locked = index_with_contract(page, None)
    # Never cached (the token changes every launch), and never sent on as a referrer.
    headers = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}

    async def index(request: Request) -> Response:
        offered = request.query_params.get("launch")
        if offered is None:
            return HTMLResponse(locked, headers=headers)
        if launch_secret and hmac.compare_digest(offered, launch_secret):
            return HTMLResponse(unlocked, headers=headers)
        return HTMLResponse(locked, status_code=403, headers=headers)

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
