"""Process configuration for the sidecar.

Everything the Electron main process needs to agree with us on lives here, and every
value is read from the environment. This is deliberate: argparse defaults silently
override `HOST`/`PORT` env vars if you let them, and a packaged app then binds the wrong
interface. Here env is the source of truth (01-architecture.md §4.1, §9); the CLI only
*fills in* argparse values when the flag was explicitly passed.
"""

from __future__ import annotations

import os
import platform
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR_NAME = "BandReady"


def _parse_env_file(path: Path) -> dict[str, str]:
    """Minimal ``KEY=value`` reader — no dependency, no shell semantics.

    Supports ``export KEY=value``, ``#`` comments, blank lines and surrounding quotes.
    Anything more exotic belongs in a real shell, not in a config file we read.
    """
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key] = value
    return out


def load_env_files(data_dir: Path | None = None) -> list[Path]:
    """Load ``.env`` into the process environment, returning the files applied.

    Provider keys can be stored as a ``${VAR}`` reference rather than on disk, which is
    the safer option — but a desktop app launched from Finder inherits no shell
    environment, so the reference could never resolve there. Reading a ``.env`` gives
    that user somewhere to put the value without embedding it in the settings database.

    A variable already present in the real environment always wins, so an explicit
    ``export`` beats the file. Search order (all optional):

    1. ``$BANDREADY_ENV_FILE``
    2. ``<data_dir>/.env`` — the packaged app's user-editable location
    3. ``<repo>/.env`` — development convenience
    """
    candidates: list[Path] = []
    explicit = os.environ.get("BANDREADY_ENV_FILE")
    if explicit:
        candidates.append(Path(explicit).expanduser())
    if data_dir is not None:
        candidates.append(Path(data_dir).expanduser() / ".env")
    # sidecar/bandready/config.py -> <repo>
    candidates.append(Path(__file__).resolve().parents[2] / ".env")

    applied: list[Path] = []
    for path in candidates:
        if not path.is_file():
            continue
        values = _parse_env_file(path)
        if not values:
            continue
        for key, value in values.items():
            os.environ.setdefault(key, value)  # a real env var always wins
        applied.append(path)
    return applied


def default_data_dir() -> Path:
    """Per-OS application data directory (01-architecture.md §8).

    The Electron main process normally passes `BANDREADY_DATA_DIR` so both processes
    agree; this is the standalone/dev fallback.
    """
    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / APP_DIR_NAME
    xdg = os.environ.get("XDG_DATA_HOME")
    base = Path(xdg) if xdg else Path.home() / ".local" / "share"
    return base / APP_DIR_NAME


class Settings(BaseSettings):
    """Env-driven process settings. All keys carry the `BANDREADY_` prefix."""

    model_config = SettingsConfigDict(
        env_prefix="BANDREADY_",
        extra="ignore",
        case_sensitive=False,
    )

    host: str = "127.0.0.1"
    port: int = 8710
    auth_token: str = ""
    data_dir: Path = Field(default_factory=default_data_dir)
    parent_pid: int | None = None
    enable_mock: bool = False
    log_level: str = "info"
    dev: bool = False

    @field_validator("data_dir", mode="before")
    @classmethod
    def _expand(cls, v: Any) -> Any:
        if isinstance(v, str):
            if not v.strip():
                return default_data_dir()
            return Path(v).expanduser()
        return v

    @field_validator("parent_pid", mode="before")
    @classmethod
    def _pid(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    # --- derived paths ------------------------------------------------------

    @property
    def db_path(self) -> Path:
        return self.data_dir / "bandready.db"

    @property
    def secret_key_path(self) -> Path:
        return self.data_dir / "secret.key"

    @property
    def settings_file(self) -> Path:
        return self.data_dir / "settings.json"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def packs_dir(self) -> Path:
        return self.data_dir / "packs"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def is_apple_silicon(self) -> bool:
        return platform.system() == "Darwin" and platform.machine() == "arm64"

    def ensure_dirs(self) -> None:
        for p in (
            self.data_dir,
            self.models_dir,
            self.media_dir,
            self.packs_dir,
            self.logs_dir,
            self.exports_dir,
        ):
            p.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Drop the cached Settings — used by tests that mutate the environment."""
    get_settings.cache_clear()


def __getattr__(name: str) -> Any:
    # PEP 562: `from bandready.config import settings` resolves lazily so that env
    # changes made before first use (tests, CLI) are always honoured.
    if name == "settings":
        return get_settings()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
