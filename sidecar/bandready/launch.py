"""``bandready``: the browser edition's launcher.

Starts the sidecar with the app's pages (see :mod:`bandready.server.web`) and opens them
in the default browser. It is what the install scripts' shortcut runs, so it is written
for someone who has never used a terminal: one window, one sentence about keeping it open,
and a second launch that just opens the browser again rather than failing on a busy port.

The pages open only through a launch secret (see :mod:`bandready.server.web` for why). It
lives in ``web.json`` beside the port, readable by this user only, and reaches the browser
through ``open.html``, a local redirect file with the same permissions. Handing the URL to
the browser directly would put the secret on a command line, where ``ps`` shows it to
every account on the machine.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

#: Tried first, so a bookmark keeps working between launches.
PREFERRED_PORT = 8765
STATE_FILE = "web.json"
OPEN_FILE = "open.html"


def _data_dir() -> Path:
    from bandready.config import default_data_dir

    env = os.environ.get("BANDREADY_DATA_DIR")
    return Path(env).expanduser() if env else default_data_dir()


def _url(port: int) -> str:
    return f"http://127.0.0.1:{port}/"


def _proves_secret(port: int, secret: str, timeout: float = 2.0) -> bool:
    """True when the server on ``port`` is the one this user started (it knows the secret)."""
    import hmac

    from bandready.server.web import PROOF_PATH, launch_proof

    challenge = secrets.token_hex(16)
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}{PROOF_PATH}?challenge={challenge}", timeout=timeout
        ) as resp:
            answer = json.loads(resp.read().decode("utf-8") or "{}").get("proof") or ""
    except (OSError, ValueError, AttributeError):
        return False
    return hmac.compare_digest(str(answer), launch_proof(secret, challenge))


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def _any_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _launch_url(port: int, secret: str) -> str:
    return f"{_url(port)}?launch={secret}"


def _write_private(path: Path, text: str) -> None:
    """Write a file only this user can read (on Windows the profile folder already is)."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    try:
        os.chmod(path, 0o600)  # an older file keeps its old mode through O_CREAT
    except OSError:  # pragma: no cover
        pass


def _read_state(path: Path) -> tuple[int, str] | None:
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        port, secret = state.get("port"), state.get("launch")
    except (OSError, ValueError, AttributeError):
        return None
    if not (isinstance(port, int) and 0 < port < 65536 and isinstance(secret, str) and secret):
        return None
    return port, secret


def _open_browser(data_dir: Path, port: int, secret: str) -> None:
    page = data_dir / OPEN_FILE
    target = _launch_url(port, secret)
    _write_private(
        page,
        "<!doctype html><meta charset=\"utf-8\"><title>Opening BandReady</title>"
        f'<meta http-equiv="refresh" content="0;url={target}">'
        f'<p>Opening BandReady... <a href="{target}">Continue</a></p>',
    )
    webbrowser.open(page.as_uri())


def _open_when_ready(data_dir: Path, port: int, secret: str, deadline_s: float = 180.0) -> None:
    """Open the browser once our server answers. First start runs migrations and seeds content.

    It waits for the secret's proof, not just /health: if something else took the port
    between choosing it and binding it, the browser, and the secret, must not go there.
    """
    end = time.monotonic() + deadline_s
    while time.monotonic() < end:
        if _proves_secret(port, secret):
            _open_browser(data_dir, port, secret)
            return
        time.sleep(0.5)
    print(
        f"BandReady is taking a long time to start. Open {_url(port)} yourself once it is ready.",
        flush=True,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="bandready",
        description="Run BandReady in your web browser. Everything stays on this computer.",
    )
    parser.add_argument("--port", type=int, default=None, help=f"port (default {PREFERRED_PORT})")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    data_dir = _data_dir()
    state = data_dir / STATE_FILE

    # Already running (a second click on the shortcut): show it rather than fail.
    previous = _read_state(state)
    if args.port is None and previous and _proves_secret(*previous):
        port, secret = previous
        print(f"BandReady is already running at {_url(port)}", flush=True)
        if not args.no_browser:
            _open_browser(data_dir, port, secret)
        return 0

    if args.port is not None:
        port = args.port
    else:
        last = previous[0] if previous else None
        port = next(
            (p for p in (last, PREFERRED_PORT) if p and _port_free(p)),
            None,
        ) or _any_free_port()

    from bandready.server.web import LAUNCH_SECRET_ENV

    secret = secrets.token_urlsafe(32)
    data_dir.mkdir(parents=True, exist_ok=True)
    _write_private(state, json.dumps({"port": port, "launch": secret}))

    os.environ[LAUNCH_SECRET_ENV] = secret
    os.environ["BANDREADY_WEB"] = "1"
    os.environ["BANDREADY_HOST"] = "127.0.0.1"
    os.environ["BANDREADY_PORT"] = str(port)
    os.environ.setdefault("BANDREADY_DATA_DIR", str(data_dir))

    # This window belongs to the learner, so the full address is safe to show here, and
    # it is the way in if the browser does not open by itself.
    print(
        "\nBandReady is starting. It opens in your browser in a moment.\n"
        "Keep this window open while you practise. Close it to stop BandReady.\n\n"
        f"If the browser does not open, copy this address into it:\n  {_launch_url(port, secret)}\n",
        flush=True,
    )
    if not args.no_browser:
        threading.Thread(
            target=_open_when_ready, args=(data_dir, port, secret), daemon=True
        ).start()

    from bandready.cli import main as sidecar_main

    return sidecar_main(["serve"])


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
