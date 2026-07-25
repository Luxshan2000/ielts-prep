"""The settings document — one LLM + one STT + one TTS + VAD + appearance + study.

Storage (per the A1 contract): the SQLite ``settings`` table (11-data-model.md §2), a
key/value store of JSON blobs, under the key ``app``. When the DB layer is not available
yet (early boot, headless unit tests) we fall back to ``<data_dir>/settings.json`` written
with OpenVoiceUI's proven durability recipe: mkstemp → fsync → atomic replace → chmod 0600
→ fsync of the parent directory, and quarantine of a corrupt file rather than a crash.

Three read shapes exist and mixing them up is the classic secrets bug, so they are three
functions:

* :func:`load_settings`      — storage form. ``api_key`` is ``enc:v1:…`` or ``${VAR}``.
* :func:`load_settings_masked` — UI form. Secrets become ``"•••• (stored)"``.
* :func:`load_settings_resolved` — use form. Decrypted, ``${VAR}`` interpolated. An unset
  variable raises :class:`~bandready.server.errors.ApiError` — never a silent empty
  string (03 §2.2 divergence from OpenVoiceUI, which substituted ``""`` and produced
  baffling 401s).
"""

from __future__ import annotations

import copy
import json
import logging
import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from bandready.security import secrets as secrets_mod
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.settings")

SETTINGS_KEY = "app"
ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)\}")
UNCHANGED_SENTINELS = ("•••• (unchanged)", "•••• (stored)", "••••••")

# Fields whose values are secrets regardless of what a preset's config_spec says.
SECRET_FIELDS = ("api_key",)


# --------------------------------------------------------------------------- defaults

DEFAULT_SETTINGS: dict[str, Any] = {
    "version": 1,
    "llm": {
        "preset": "ollama",
        "base_url": "http://127.0.0.1:11434/v1",
        "api_key": "",
        "model": "qwen3:14b",
        "params": {
            "temperature": 0.7,
            "max_tokens": 1024,
            "timeout_s": 60.0,
            "max_retries": 2,
        },
    },
    "stt": {
        "preset": "faster_whisper",
        "engine": "faster_whisper",
        "model": "base",
        "device": "auto",
        "compute_type": "int8",
        "base_url": "",
        "api_key": "",
        "language": "en",
    },
    "tts": {
        "preset": "kokoro",
        "engine": "kokoro_onnx",
        "voice": "af_heart",
        "speed": 1.0,
        "model_path": "",
        "voices_path": "",
        "base_url": "",
        "api_key": "",
        "model": "",
    },
    # gotcha #5: Pipecat's own min_volume default of 0.6 blocks normal speech.
    "vad": {
        "confidence": 0.5,
        "start_secs": 0.2,
        "stop_secs": 0.6,
        "min_volume": 0.0,
    },
    "appearance": {
        "theme": "dark",
        "accent": "indigo",
        "font_scale": 1.0,
        "reduce_motion": False,
        "density": "comfortable",
    },
    "study": {
        "exam_format": "academic",
        "target_band": 7.0,
        "daily_minutes": 60,
        "study_days": ["mon", "tue", "wed", "thu", "fri", "sat"],
        "srs_new_per_day": 10,
        "srs_max_reviews_per_day": 120,
        "calibration_few_shot": True,
        "show_timer": True,
    },
    "media": {"cache_budget_mb": 2048},
    "active_profile_id": "default",
}


# --------------------------------------------------------------------------- schema

class _Loose(BaseModel):
    """Sub-documents stay open: a module may add a key without a schema change here."""

    model_config = ConfigDict(extra="allow")


class LlmParams(_Loose):
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=64)
    timeout_s: float = Field(default=60.0, gt=0)
    max_retries: int = Field(default=2, ge=0, le=5)


class LlmSlot(_Loose):
    preset: str = "ollama"
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    params: LlmParams = Field(default_factory=LlmParams)


class SttSlot(_Loose):
    preset: str = "faster_whisper"
    engine: str = "faster_whisper"
    model: str = "base"
    device: Literal["cpu", "auto"] = "auto"
    compute_type: str = "int8"
    base_url: str = ""
    api_key: str = ""
    language: str = "en"


class TtsSlot(_Loose):
    preset: str = "kokoro"
    engine: str = "kokoro_onnx"
    voice: str = "af_heart"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)
    model_path: str = ""
    voices_path: str = ""
    base_url: str = ""
    api_key: str = ""
    model: str = ""


class VadBlock(_Loose):
    confidence: float = Field(default=0.5, ge=0.1, le=0.9)
    start_secs: float = Field(default=0.2, ge=0.05, le=1.0)
    stop_secs: float = Field(default=0.6, ge=0.2, le=3.0)
    min_volume: float = Field(default=0.0, ge=0.0, le=0.6)

    @field_validator("min_volume", mode="before")
    @classmethod
    def _clamp_min_volume(cls, v: Any) -> Any:
        # Hard clamp, not just a schema bound: a hand-edited file must not be able to
        # regress gotcha #5 into "the mic appears dead".
        try:
            return max(0.0, min(0.6, float(v)))
        except (TypeError, ValueError):
            return 0.0


class AppearanceBlock(_Loose):
    theme: Literal["dark", "light", "system"] = "dark"
    accent: str = "indigo"
    font_scale: float = Field(default=1.0, ge=0.8, le=1.4)
    reduce_motion: bool = False
    density: Literal["comfortable", "compact"] = "comfortable"


class StudyBlock(_Loose):
    exam_format: Literal["academic", "general_training"] = "academic"
    target_band: float = Field(default=7.0, ge=4.0, le=9.0)
    daily_minutes: int = 60
    study_days: list[str] = Field(
        default_factory=lambda: ["mon", "tue", "wed", "thu", "fri", "sat"]
    )
    srs_new_per_day: int = Field(default=10, ge=0, le=100)
    srs_max_reviews_per_day: int = Field(default=120, ge=0, le=1000)
    calibration_few_shot: bool = True
    show_timer: bool = True


class MediaBlock(_Loose):
    cache_budget_mb: int = Field(default=2048, ge=128)


class SettingsDoc(_Loose):
    version: int = 1
    llm: LlmSlot = Field(default_factory=LlmSlot)
    stt: SttSlot = Field(default_factory=SttSlot)
    tts: TtsSlot = Field(default_factory=TtsSlot)
    vad: VadBlock = Field(default_factory=VadBlock)
    appearance: AppearanceBlock = Field(default_factory=AppearanceBlock)
    study: StudyBlock = Field(default_factory=StudyBlock)
    media: MediaBlock = Field(default_factory=MediaBlock)
    active_profile_id: str = "default"


# --------------------------------------------------------------------------- helpers

_cache: dict[str, Any] | None = None
_first_run = True


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Recursive dict merge — the semantics of ``PATCH /api/v1/settings`` (R2-19)."""
    out = copy.deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _is_secret_field(key: str) -> bool:
    return key in SECRET_FIELDS or secrets_mod.is_secret_key(key)


def _walk_secrets(doc: Any, fn: Any, path: str = "") -> Any:
    if isinstance(doc, dict):
        return {
            k: (fn(v, k) if _is_secret_field(k) and isinstance(v, str)
                else _walk_secrets(v, fn, f"{path}.{k}"))
            for k, v in doc.items()
        }
    if isinstance(doc, list):
        return [_walk_secrets(v, fn, path) for v in doc]
    return doc


def interpolate_env(value: Any, *, where: str = "settings") -> Any:
    """Recursively resolve ``${VAR}``. An unset variable is an error, not ``""``."""
    if isinstance(value, str):
        missing: list[str] = []

        def sub(m: re.Match[str]) -> str:
            name = m.group(1)
            got = os.environ.get(name)
            if got is None:
                missing.append(name)
                return ""
            return got

        out = ENV_PATTERN.sub(sub, value)
        if missing:
            names = ", ".join(sorted(set(missing)))
            raise ApiError(
                400,
                "env_var_missing",
                f"{names} is not set in your environment (referenced by {where})",
            )
        return out
    if isinstance(value, dict):
        return {k: interpolate_env(v, where=f"{where}.{k}") for k, v in value.items()}
    if isinstance(value, list):
        return [interpolate_env(v, where=where) for v in value]
    return value


def mask_settings(doc: dict[str, Any]) -> dict[str, Any]:
    """UI-safe copy: every secret becomes a mask (``${VAR}`` refs stay literal)."""
    return _walk_secrets(doc, lambda v, _k: secrets_mod.mask(v))


def encrypt_settings(doc: dict[str, Any]) -> dict[str, Any]:
    """Encrypt any plaintext secret before it touches storage."""
    return _walk_secrets(doc, lambda v, _k: secrets_mod.encrypt(v))


def _strip_sentinels(patch: dict[str, Any]) -> dict[str, Any]:
    """Drop secret fields whose value is the "unchanged" sentinel the UI round-trips."""
    out: dict[str, Any] = {}
    for key, value in patch.items():
        if isinstance(value, dict):
            nested = _strip_sentinels(value)
            out[key] = nested
        elif _is_secret_field(key) and isinstance(value, str) and value in UNCHANGED_SENTINELS:
            continue
        else:
            out[key] = value
    return out


def validate_settings(doc: dict[str, Any]) -> dict[str, Any]:
    """Validate + normalise a full settings document, or raise `validation_error`."""
    try:
        model = SettingsDoc.model_validate(doc)
    except ValidationError as exc:
        parts = []
        for err in exc.errors()[:5]:
            loc = ".".join(str(x) for x in err.get("loc", ()))
            parts.append(f"{loc}: {err.get('msg')}")
        raise ApiError(422, "validation_error", "; ".join(parts)) from exc
    out = model.model_dump(mode="json")
    _reject_hidden_presets(out)
    return out


def _reject_hidden_presets(doc: dict[str, Any]) -> None:
    from bandready.config import get_settings
    from bandready.providers.presets import get_preset

    if get_settings().enable_mock:
        return
    for modality in ("llm", "stt", "tts"):
        preset_id = (doc.get(modality) or {}).get("preset")
        if not preset_id:
            continue
        preset = get_preset(preset_id, include_hidden=True)
        if preset is not None and preset.get("hidden"):
            raise ApiError(
                422,
                "validation_error",
                f"preset {preset_id!r} is a test-only provider and requires "
                "BANDREADY_ENABLE_MOCK=1",
            )


# --------------------------------------------------------------------------- storage

def _settings_path() -> Path:
    from bandready.config import get_settings

    return get_settings().settings_file


def _read_db() -> dict[str, Any] | None:
    try:
        from sqlalchemy import text

        from bandready.db.engine import session_scope
    except Exception:  # noqa: BLE001 — db layer not present yet
        return None
    try:
        with session_scope() as session:
            row = session.execute(
                text("SELECT value FROM settings WHERE key = :k"), {"k": SETTINGS_KEY}
            ).first()
    except Exception as exc:  # noqa: BLE001 — table missing before first migration
        _log.debug("settings table unavailable (%s); using the file fallback", exc)
        return None
    if row is None:
        return {}
    try:
        value = json.loads(row[0])
    except (TypeError, ValueError):
        _log.error("settings row is not valid JSON; falling back to defaults")
        return {}
    return value if isinstance(value, dict) else {}


def _write_db(doc: dict[str, Any]) -> bool:
    try:
        from sqlalchemy import text

        from bandready.db.engine import session_scope
    except Exception:  # noqa: BLE001
        return False
    payload = json.dumps(doc, ensure_ascii=False)
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    try:
        with session_scope() as session:
            session.execute(
                text(
                    "INSERT INTO settings (key, value, updated_at) "
                    "VALUES (:k, :v, :u) "
                    "ON CONFLICT(key) DO UPDATE SET value = :v, updated_at = :u"
                ),
                {"k": SETTINGS_KEY, "v": payload, "u": now},
            )
        return True
    except Exception as exc:  # noqa: BLE001
        _log.debug("could not persist settings to the DB (%s); using the file", exc)
        return False


def _read_file() -> dict[str, Any] | None:
    path = _settings_path()
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise TypeError("settings.json is not a JSON object")
        return value
    except Exception as exc:  # noqa: BLE001 — never crash on a bad byte
        ts = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        quarantine = path.with_name(path.name + f".corrupt-{ts}")
        try:
            os.replace(path, quarantine)
        except OSError:
            quarantine = path
        _log.error(
            "settings file %s is corrupt (%s); quarantined to %s, using defaults",
            path, exc, quarantine,
        )
        return None


def _write_file(doc: dict[str, Any]) -> None:
    """Atomic + durable write (03 §2.1, verbatim port of OpenVoiceUI's lockfile.write)."""
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2, ensure_ascii=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())  # 1. durable contents before the rename
        os.replace(tmp, path)  # 2. atomic swap
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    try:
        os.chmod(path, 0o600)  # 3. owner-only — it holds encrypted keys
    except OSError as exc:
        # Not fatal (some filesystems, e.g. exFAT, have no POSIX modes), but it means
        # the file holding encrypted keys kept its default permissions. Say so — a
        # silent failure here is a security question nobody can answer later.
        _log.warning("could not restrict permissions on %s: %s", path, exc)
    try:  # 4. fsync the parent dir so the rename survives power loss
        dfd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    except OSError as exc:
        # Windows and some network filesystems cannot fsync a directory handle. The
        # settings are already written and renamed; only the "survives a power cut
        # in the next few seconds" guarantee is lost, so this is a debug note, not a
        # failure — but it must not be invisible.
        _log.debug("could not fsync the settings directory %s: %s", path.parent, exc)


# --------------------------------------------------------------------------- API

def load_settings(*, refresh: bool = False) -> dict[str, Any]:
    """The settings document in **storage form** (secrets still ``enc:v1:``/``${VAR}``)."""
    global _cache, _first_run
    if _cache is not None and not refresh:
        return copy.deepcopy(_cache)
    stored = _read_db()
    if stored is None:
        stored = _read_file()
        _first_run = stored is None
        stored = stored or {}
    else:
        _first_run = not stored
    merged = deep_merge(DEFAULT_SETTINGS, stored)
    try:
        doc = validate_settings(merged)
    except ApiError as exc:
        _log.error("stored settings failed validation (%s); using defaults", exc.detail)
        doc = validate_settings(copy.deepcopy(DEFAULT_SETTINGS))
    _cache = doc
    return copy.deepcopy(doc)


def is_first_run() -> bool:
    """True when nothing has ever been saved — drives the Setup wizard."""
    if _cache is None:
        load_settings()
    return _first_run


def save_settings(doc: dict[str, Any]) -> dict[str, Any]:
    """Full replace: validate, encrypt plaintext secrets, persist durably, hot-apply."""
    global _cache, _first_run
    merged = deep_merge(DEFAULT_SETTINGS, doc or {})
    validated = validate_settings(merged)
    encrypted = encrypt_settings(validated)
    if not _write_db(encrypted):
        _write_file(encrypted)
    _cache = encrypted
    _first_run = False
    _log.info("settings saved (llm=%s stt=%s tts=%s)",
              encrypted["llm"]["preset"], encrypted["stt"]["preset"], encrypted["tts"]["preset"])
    return copy.deepcopy(encrypted)


def patch_settings(partial: dict[str, Any]) -> dict[str, Any]:
    """Partial deep-merge — the semantics of ``PATCH /api/v1/settings``."""
    current = load_settings()
    return save_settings(deep_merge(current, _strip_sentinels(partial or {})))


def load_settings_masked() -> dict[str, Any]:
    """UI form: plaintext never leaves the sidecar."""
    doc = mask_settings(load_settings())
    doc["first_run"] = is_first_run()
    return doc


def load_settings_resolved() -> dict[str, Any]:
    """Use form: decrypted + ``${VAR}`` interpolated. Never send this to the renderer."""
    doc = load_settings()
    decrypted = _walk_secrets(doc, lambda v, _k: secrets_mod.decrypt(v))
    return interpolate_env(decrypted)


def get_slot(modality: str) -> dict[str, Any]:
    """Resolved config for one modality (``llm`` | ``stt`` | ``tts``)."""
    if modality not in ("llm", "stt", "tts"):
        raise ApiError(422, "validation_error", f"unknown modality {modality!r}")
    return load_settings_resolved()[modality]


def seed_defaults() -> dict[str, Any]:
    """Startup hook: materialise the defaults on first boot so every later read is a
    plain lookup and the Settings page has a document to show."""
    doc = load_settings(refresh=True)
    if is_first_run():
        _log.info("no stored settings — seeding factory defaults")
        return save_settings(doc)
    return doc


def invalidate_cache() -> None:
    """Drop the in-memory cache (tests, and after an external DB write)."""
    global _cache
    _cache = None
