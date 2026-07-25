"""SQLite engine, session helpers and programmatic migrations.

The engine is built lazily (first ``get_engine()`` call) so that the process can set
``BANDREADY_DATA_DIR`` — passed by the Electron main process, 01-architecture.md §9 — before
anything binds to a file. Per-connection pragmas follow 11-data-model.md §1.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import threading
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

__all__ = [
    "DB_FILENAME",
    "MIN_SQLITE_VERSION",
    "SessionLocal",
    "get_data_dir",
    "get_db_path",
    "get_engine",
    "get_session",
    "reset_engine",
    "run_migrations",
    "session_scope",
]

DB_FILENAME = "bandready.db"
#: 11 §1 — json_object() in views and the `->>` operator need SQLite ≥ 3.38.
MIN_SQLITE_VERSION = (3, 38, 0)

_engine: Engine | None = None
_engine_lock = threading.Lock()


class _LazySessionFactory(sessionmaker):
    """Session factory that binds itself to the process engine on first use."""

    def __call__(self, **local_kw) -> Session:
        get_engine()
        return super().__call__(**local_kw)


#: Session factory. Safe to call before ``get_engine()`` — it binds on demand.
SessionLocal = _LazySessionFactory(class_=Session, autoflush=False, expire_on_commit=False)


# --------------------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------------------


def _platform_data_dir() -> Path:
    """Fallback data dir when ``BANDREADY_DATA_DIR`` is unset (dev shells, tests, CLI)."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "BandReady"
    if os.name == "nt":
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "BandReady"
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / "BandReady"


def get_data_dir() -> Path:
    """Resolve the data directory, creating it if needed.

    In the packaged app the Electron main process always passes ``BANDREADY_DATA_DIR`` so
    both processes agree; the per-OS fallback exists for tests and the bare CLI.
    """
    raw = os.environ.get("BANDREADY_DATA_DIR")
    path = Path(raw).expanduser() if raw else _platform_data_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_db_path() -> Path:
    return get_data_dir() / DB_FILENAME


# --------------------------------------------------------------------------------------
# Engine
# --------------------------------------------------------------------------------------


def _assert_sqlite_version() -> None:
    if sqlite3.sqlite_version_info < MIN_SQLITE_VERSION:
        want = ".".join(str(p) for p in MIN_SQLITE_VERSION)
        raise RuntimeError(
            f"BandReady needs SQLite >= {want}; this Python is linked against "
            f"{sqlite3.sqlite_version}."
        )


def _build_engine() -> Engine:
    _assert_sqlite_version()
    db_path = get_db_path()
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_conn, _record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()

    return engine


def get_engine() -> Engine:
    """Return the process-wide engine, building it on first use."""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                engine = _build_engine()
                SessionLocal.configure(bind=engine)
                _engine = engine
    return _engine


def reset_engine() -> None:
    """Dispose the engine and unbind the session factory (tests / data-dir switches)."""
    global _engine
    with _engine_lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None
    SessionLocal.configure(bind=None)


# --------------------------------------------------------------------------------------
# Sessions
# --------------------------------------------------------------------------------------


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope: commit on success, rollback on error, always close."""
    get_engine()  # ensure SessionLocal is bound
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency. Commits when the request handler returns cleanly."""
    get_engine()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# --------------------------------------------------------------------------------------
# Migrations
# --------------------------------------------------------------------------------------


def _migrations_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "migrations"


@contextmanager
def _boot_lock(path: Path) -> Iterator[None]:
    """Cross-process advisory lock so two sidecars never migrate the same DB at once."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+b")
    try:
        try:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        except ImportError:  # pragma: no cover - Windows
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        yield
    finally:
        try:
            try:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except ImportError:  # pragma: no cover - Windows
                import msvcrt

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        finally:
            handle.close()


def run_migrations() -> None:
    """Run ``alembic upgrade head`` against the process engine, under the boot lock."""
    from alembic import command
    from alembic.config import Config

    engine = get_engine()
    with _boot_lock(get_data_dir() / ".migrate.lock"):
        cfg = Config()
        cfg.set_main_option("script_location", str(_migrations_dir()))
        # No sqlalchemy.url: env.py takes the live engine from attributes (and a '%' in the
        # data-dir path would break ConfigParser interpolation).
        cfg.attributes["engine"] = engine
        command.upgrade(cfg, "head")
