"""``bandready``: the browser edition's launcher.

Starts the sidecar with the app's pages (see :mod:`bandready.server.web`) and opens them
in the default browser. It is what the install scripts' shortcut runs, so it is written
for someone who has never used a terminal: one window, one sentence about keeping it open,
and a second launch that just opens the browser again rather than failing on a busy port.
"""

from __future__ import annotations

import argparse
import json
import os
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


def _data_dir() -> Path:
    from bandready.config import default_data_dir

    env = os.environ.get("BANDREADY_DATA_DIR")
    return Path(env).expanduser() if env else default_data_dir()


def _url(port: int) -> str:
    return f"http://127.0.0.1:{port}/"


def _is_bandready(port: int, timeout: float = 1.0) -> bool:
    """True when a BandReady sidecar answers on this port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
    except (OSError, ValueError):
        return False
    return body.get("status") == "ok" and "migrations" in body


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


def _read_state(path: Path) -> int | None:
    try:
        port = json.loads(path.read_text(encoding="utf-8")).get("port")
    except (OSError, ValueError, AttributeError):
        return None
    return port if isinstance(port, int) and 0 < port < 65536 else None


def _open_when_ready(port: int, deadline_s: float = 180.0) -> None:
    """Open the browser once /health answers. First start runs migrations and seeds content."""
    end = time.monotonic() + deadline_s
    while time.monotonic() < end:
        if _is_bandready(port):
            webbrowser.open(_url(port))
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
    running = _read_state(state)
    if args.port is None and running and _is_bandready(running):
        print(f"BandReady is already running at {_url(running)}", flush=True)
        if not args.no_browser:
            webbrowser.open(_url(running))
        return 0

    if args.port is not None:
        port = args.port
    else:
        port = next(
            (p for p in (running, PREFERRED_PORT) if p and _port_free(p)),
            None,
        ) or _any_free_port()

    data_dir.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps({"port": port}), encoding="utf-8")

    os.environ["BANDREADY_WEB"] = "1"
    os.environ["BANDREADY_HOST"] = "127.0.0.1"
    os.environ["BANDREADY_PORT"] = str(port)
    os.environ.setdefault("BANDREADY_DATA_DIR", str(data_dir))

    print(
        f"\nBandReady is starting at {_url(port)}\n"
        "Keep this window open while you practise. Close it to stop BandReady.\n",
        flush=True,
    )
    if not args.no_browser:
        threading.Thread(target=_open_when_ready, args=(port,), daemon=True).start()

    from bandready.cli import main as sidecar_main

    return sidecar_main(["serve"])


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
