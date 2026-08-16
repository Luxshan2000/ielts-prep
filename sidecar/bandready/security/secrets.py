"""Provider secrets, encrypted at rest with a per-install key.

Policy (03-providers-and-settings.md §8):

* A Fernet key is generated on first use into ``<data_dir>/secret.key`` with mode 0600.
  There is **no shared fallback key**; a key baked into the source is not encryption.
* Plaintext keys entered by the user become ``enc:v1:<fernet-token>`` before they are
  written anywhere.
* ``${ENV_VAR}`` references are stored literally and never encrypted — power users keep
  their keys out of the file entirely.
* ``GET /api/v1/settings`` returns masked values; plaintext never leaves this process.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_log = logging.getLogger("bandready.secrets")

PREFIX = "enc:v1:"
MASK = "•••• (stored)"
ENV_REF = re.compile(r"^\$\{([A-Z0-9_]+)\}$")

_SECRET_KEY_RE = re.compile(r"(api[_-]?key|secret|token|password|passwd|credential)", re.IGNORECASE)

_cached_fernet: tuple[Path, Fernet] | None = None


class SecretError(RuntimeError):
    """Raised when a stored secret cannot be decrypted."""


def is_secret_key(key: str) -> bool:
    """Heuristic backstop so a value is never leaked because a preset forgot
    ``"secret": true`` in its config_spec."""
    return bool(_SECRET_KEY_RE.search(key))


def is_encrypted(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)


def is_env_ref(value: str | None) -> bool:
    return isinstance(value, str) and bool(ENV_REF.match(value.strip()))


def key_path() -> Path:
    from bandready.config import get_settings

    return get_settings().secret_key_path


def _load_or_create_key(path: Path) -> bytes:
    if path.exists():
        raw = path.read_bytes().strip()
        if raw:
            return raw
        _log.warning("secret.key at %s was empty; regenerating", path)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    # Write 0600 atomically: mkstemp already creates the file with 0600.
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(key)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    try:
        os.chmod(path, 0o600)
    except OSError:  # pragma: no cover — Windows tolerates the missing chmod
        pass
    _log.info("generated a new per-install encryption key at %s", path)
    return key


def _fernet() -> Fernet:
    global _cached_fernet
    path = key_path()
    if _cached_fernet is not None and _cached_fernet[0] == path:
        return _cached_fernet[1]
    f = Fernet(_load_or_create_key(path))
    _cached_fernet = (path, f)
    return f


def reset_key_cache() -> None:
    """Forget the cached Fernet — used by tests that move the data dir."""
    global _cached_fernet
    _cached_fernet = None


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext secret to its ``enc:v1:`` wire form.

    Already-encrypted values and ``${ENV_VAR}`` references pass through untouched, so
    this is safe to apply to a whole settings document.
    """
    if not plaintext:
        return ""
    if is_encrypted(plaintext) or is_env_ref(plaintext):
        return plaintext
    token = _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{PREFIX}{token}"


def decrypt(value: str | None) -> str:
    """Decrypt an ``enc:v1:`` value. Plaintext and empty values pass through.

    ``${ENV_VAR}`` references are NOT resolved here — that is settings_store's job, so
    the "variable is unset" error can be surfaced with proper context.
    """
    if not value:
        return ""
    if not is_encrypted(value):
        return value
    try:
        return _fernet().decrypt(value[len(PREFIX) :].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise SecretError(
            "a stored API key could not be decrypted — the install key changed or the "
            "settings were copied from another machine; re-enter the key in Settings"
        ) from exc


def mask(value: str | None) -> str:
    """UI-safe rendering of a stored secret. Plaintext is NEVER returned."""
    if not value:
        return ""
    if is_env_ref(value):
        return value.strip()  # env references are shown literally — they are not secret
    return MASK


def redact(text: str) -> str:
    """Strip anything that looks like a live secret out of a log line."""
    text = re.sub(rf"{re.escape(PREFIX)}[A-Za-z0-9_\-=]+", f"{PREFIX}<redacted>", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_\-]{8,}", "sk-<redacted>", text)
    text = re.sub(r"(?i)(ticket=)[^&\s]+", r"\1<redacted>", text)
    text = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._\-]+", r"\1<redacted>", text)
    return text


class RedactingFilter(logging.Filter):
    """Logging filter that redacts secrets from formatted messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001  # pragma: no cover — malformed record
            return True
        cleaned = redact(msg)
        if cleaned != msg:
            record.msg = cleaned
            record.args = ()
        return True


def install_log_redaction() -> None:
    """Attach the redaction filter to the root handlers."""
    f = RedactingFilter()
    root = logging.getLogger()
    for handler in root.handlers:
        if not any(isinstance(x, RedactingFilter) for x in handler.filters):
            handler.addFilter(f)
