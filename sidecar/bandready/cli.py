"""``bandready-sidecar`` — the process Electron spawns (01-architecture.md §4).

Two rules, both of which are easy to get wrong:

1. **Env wins.** ``BANDREADY_HOST``/``BANDREADY_PORT`` are the source of truth in a
   packaged app. argparse flags exist for dev only, and an omitted flag never overrides
   the environment. An argparse default silently shadows an environment variable, so the
   flag default must be ``None`` and the env value must win, or the packaged app binds
   the wrong interface.
2. **The token never appears in argv** (``ps`` shows argv to every local user). It comes
   in through the environment; if it is absent we generate one and announce it on stdout:

       SIDECAR_READY {"base_url": "http://127.0.0.1:52344", "token": "…"}

   exactly one line, which Electron main parses.

A parent-PID watchdog exits the process when Electron disappears, so an Electron hard
crash never leaves an orphaned Python server holding the port and the SQLite WAL.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import secrets
import signal
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

WATCHDOG_INTERVAL_S = 5.0
_SENTINEL = object()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bandready-sidecar",
        description="BandReady sidecar — local API, voice pipeline, scoring and content.",
    )
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="run the HTTP/WebRTC server (default)")
    # No argparse defaults: `None` means "the flag was not given", so the environment
    # keeps ownership of the value.
    serve.add_argument("--host", default=None, help="bind address (default $BANDREADY_HOST)")
    serve.add_argument("--port", type=int, default=None, help="port (default $BANDREADY_PORT)")
    serve.add_argument("--data-dir", default=None, help="data directory")
    serve.add_argument("--log-level", default=None, choices=["debug", "info", "warning", "error"])
    serve.add_argument("--reload", action="store_true", help="dev only: uvicorn autoreload")
    serve.add_argument("--enable-mock", action="store_true", help="expose the mock providers")

    sub.add_parser("version", help="print the sidecar version and exit")
    return parser


def parent_watchdog(parent_pid: int, interval: float = WATCHDOG_INTERVAL_S) -> threading.Thread:
    """Exit when the parent process disappears (01 §4.4)."""

    def _watch() -> None:
        log = logging.getLogger("bandready.watchdog")
        while True:
            time.sleep(interval)
            if not _pid_alive(parent_pid):
                log.warning("parent process %s is gone — shutting down", parent_pid)
                try:
                    os.kill(os.getpid(), signal.SIGTERM)
                except OSError:  # pragma: no cover
                    os._exit(0)
                # If uvicorn ignores SIGTERM (a wedged pipeline), leave anyway.
                time.sleep(10)
                os._exit(0)

    thread = threading.Thread(target=_watch, name="parent-watchdog", daemon=True)
    thread.start()
    return thread


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":  # pragma: no cover — Windows
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(  # type: ignore[attr-defined]
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid
        )
        if not handle:
            return False
        exit_code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))  # type: ignore[attr-defined]
        ctypes.windll.kernel32.CloseHandle(handle)  # type: ignore[attr-defined]
        return exit_code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def configure_logging(level: str, logs_dir: Path | None = None) -> None:
    """Log to stderr (Electron's pipe) and, when a directory is given, to a file.

    The file is what a user can actually attach to a bug report, so it is the
    point of `Settings → About → Reveal logs`. It rotates at 2 MB x 3 so a long
    -running install can never fill a disk.
    """
    resolved = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=resolved,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    if logs_dir is not None:
        root = logging.getLogger()
        already = any(
            isinstance(h, RotatingFileHandler) for h in root.handlers
        )
        if not already:
            try:
                logs_dir.mkdir(parents=True, exist_ok=True)
                handler = RotatingFileHandler(
                    logs_dir / "sidecar.log",
                    maxBytes=2_000_000,
                    backupCount=3,
                    encoding="utf-8",
                )
                handler.setFormatter(
                    logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
                )
                handler.setLevel(resolved)
                root.addHandler(handler)
            except OSError as exc:
                # A read-only or missing data dir must never stop the sidecar booting;
                # stderr logging still works and Electron captures it.
                logging.getLogger("bandready.cli").warning(
                    "could not open the log file in %s (%s) — logging to stderr only",
                    logs_dir,
                    exc,
                )

    from bandready.security.secrets import install_log_redaction

    # Must run AFTER every handler is attached: the filter is applied per-handler,
    # so a handler added later would write unredacted secrets.
    install_log_redaction()


def _apply_flag(env_key: str, value: object) -> None:
    """A flag that was actually passed overrides the env — for dev convenience only."""
    if value is None or value is False:
        return
    os.environ[env_key] = "1" if value is True else str(value)


def serve(args: argparse.Namespace) -> int:
    # Order matters: mutate the environment BEFORE the settings object is first built.
    _apply_flag("BANDREADY_HOST", args.host)
    _apply_flag("BANDREADY_PORT", args.port)
    _apply_flag("BANDREADY_DATA_DIR", args.data_dir)
    _apply_flag("BANDREADY_LOG_LEVEL", args.log_level)
    _apply_flag("BANDREADY_ENABLE_MOCK", args.enable_mock)

    generated_token = False
    if not os.environ.get("BANDREADY_AUTH_TOKEN"):
        os.environ["BANDREADY_AUTH_TOKEN"] = secrets.token_hex(32)  # 256-bit
        generated_token = True

    from bandready.config import get_settings, reset_settings_cache

    reset_settings_cache()
    settings = get_settings()
    settings.ensure_dirs()
    configure_logging(settings.log_level, settings.logs_dir)

    if settings.parent_pid:
        parent_watchdog(settings.parent_pid)

    # The one line Electron parses. Printed before the bind so main can start polling
    # /health immediately; the health poll is what actually gates the window.
    ready = {"base_url": settings.base_url, "token": settings.auth_token, "pid": os.getpid()}
    sys.stdout.write("SIDECAR_READY " + json.dumps(ready) + "\n")
    sys.stdout.flush()
    if generated_token:
        logging.getLogger("bandready.cli").info(
            "no BANDREADY_AUTH_TOKEN in the environment — generated a per-launch token"
        )

    import uvicorn

    uvicorn.run(
        "bandready.server.app:app",
        host=settings.host,
        port=settings.port,
        # workers=1 is a hard contract: WebRTC peer connections and session state are
        # in-process (01 §9). Never make this configurable.
        workers=1,
        log_level=settings.log_level,
        reload=bool(args.reload),
        access_log=False,  # AccessLogMiddleware logs with the ticket param redacted
        factory=False,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    if args.command == "version":
        from bandready import __version__

        print(__version__)
        return 0
    if args.command is None:
        # Bare invocation behaves like `serve`, matching the packaged spawn contract.
        args = parser.parse_args(["serve"])
    return serve(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
