"""Render a listening script to a single cached WAV (07-listening-module.md §3).

Pipeline, per script:

1. resolve each speaker's concrete voice from ``role x accent`` (:data:`VOICE_MAP`);
2. synthesize every line independently against the configured TTS provider, caching each
   line at ``media/tts-lines/<sha>.wav`` so editing one line re-renders only that line;
3. stitch the lines with their authored pauses (:mod:`bandready.audio.stitch`), recording
   per-line offsets;
4. write ``media/listening/<audio_hash>.wav`` + ``<audio_hash>.timing.json`` and register
   both in ``media_files`` so 11 §9's LRU eviction can see them.

Providers, in the order they are tried:

* **mock** (``BANDREADY_ENABLE_MOCK=1`` + the hidden ``mock_tts`` preset) — silence of a
  plausible duration. Everything downstream (hashing, stitching, timing, HTTP range
  serving) is exercised with no engine installed; this is what the tests use.
* **kokoro_onnx** — the local default. Imported lazily and guarded: a missing wheel or a
  missing model file is a clean ``provider_error``, never an import-time crash that would
  take the whole route module out of auto-discovery.
* any **OpenAI-compatible** ``POST /audio/speech`` endpoint (07 §8).
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from bandready.audio import stitch as stitch_mod
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.audio.tts")

# 07 §3 — role x accent -> Kokoro voice id. Kokoro v1.0 has no Australian voices, so
# `au` falls back to British ones and the UI labels it "approximated".
VOICE_MAP: dict[str, dict[str, str]] = {
    "uk": {
        "narrator": "bm_george",
        "female_1": "bf_emma",
        "female_2": "bf_isabella",
        "male_1": "bm_lewis",
        "male_2": "bm_daniel",
    },
    "us": {
        "narrator": "am_michael",
        "female_1": "af_heart",
        "female_2": "af_bella",
        "male_1": "am_adam",
        "male_2": "am_eric",
    },
    "au": {
        "narrator": "bm_george",
        "female_1": "bf_alice",
        "female_2": "bf_lily",
        "male_1": "bm_daniel",
        "male_2": "bm_fable",
    },
}

ACCENT_SETS: tuple[str, ...] = ("uk", "us", "au")
ROLES: tuple[str, ...] = ("narrator", "female_1", "female_2", "male_1", "male_2")
FALLBACK_ROLE_ORDER: tuple[str, ...] = ("female_1", "male_1", "female_2", "male_2")

#: Accent labelling shown next to the player (07 §3).
ACCENT_LABELS = {
    "uk": "British",
    "us": "American",
    "au": "Australian (approximated with British voices)",
}

_kokoro_cache: dict[tuple[str, str], Any] = {}


# --------------------------------------------------------------------------- voices

def resolve_voice(
    speaker: Mapping[str, Any], accent: str, ordinal: int = 0, *, forced: bool = False
) -> str:
    """Concrete voice id for one speaker.

    An authored ``voice`` wins (07 §2) unless ``forced`` — an accent drill re-renders the
    same script with a different accent set and must override authoring.
    """
    override = str(speaker.get("voice") or "").strip()
    if override and not forced:
        return override
    table = VOICE_MAP.get(accent.lower()) or VOICE_MAP["uk"]
    role = str(speaker.get("role") or "").strip().lower()
    if role not in table:
        # Unrolled speaker (generated scripts sometimes omit `role`): cast it into the
        # next free slot deterministically so the same script always sounds the same.
        role = FALLBACK_ROLE_ORDER[ordinal % len(FALLBACK_ROLE_ORDER)]
    return table[role]


def resolve_voices(script: Mapping[str, Any], accent_set: str | None = None) -> dict[str, str]:
    """``{speaker_id: voice_id}`` for every speaker in the script.

    ``accent_set=None`` honours each speaker's authored ``accent`` (falling back to the
    script's ``accent_set``); passing an accent explicitly **forces** every speaker onto
    that accent's cast, which is what the accent-drill re-render needs (07 §8).
    """
    forced = str(accent_set).lower() if accent_set else None
    if forced is not None and forced not in VOICE_MAP:
        forced = "uk"
    default_accent = str(script.get("accent_set") or "uk").lower()
    resolved: dict[str, str] = {}
    ordinal = 0
    for speaker in script.get("speakers") or []:
        if not isinstance(speaker, Mapping):
            continue
        sid = str(speaker.get("id") or "").strip()
        if not sid:
            continue
        accent = forced or str(speaker.get("accent") or default_accent).lower()
        is_narrator = str(speaker.get("role") or sid).lower() == "narrator"
        resolved[sid] = resolve_voice(
            speaker, accent, 0 if is_narrator else ordinal, forced=forced is not None
        )
        if not is_narrator:
            ordinal += 1
    return resolved


def accent_label(accent_set: str | None) -> str:
    return ACCENT_LABELS.get(str(accent_set or "uk").lower(), ACCENT_LABELS["uk"])


# --------------------------------------------------------------------------- hashing

def _canonical(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def script_audio_hash(script: Mapping[str, Any], accent_set: str | None = None) -> str:
    """Content hash of *what will be spoken*: resolved voices + line text + pauses.

    Changing a line, a pause or the accent set yields a new hash; re-titling the script
    or editing a question does not (07 §3 step 5).
    """
    voices = resolve_voices(script, accent_set)
    lines = []
    for line in script.get("lines") or []:
        if not isinstance(line, Mapping):
            continue
        speaker = str(line.get("speaker") or "")
        lines.append(
            {
                "v": voices.get(speaker, ""),
                "t": str(line.get("text") or ""),
                "p": stitch_mod.clamp_pause(line.get("pause_after_ms", 300)),
            }
        )
    payload = {
        "schema_version": int(script.get("schema_version") or 1),
        "accent_set": str(accent_set or script.get("accent_set") or "uk").lower(),
        "lines": lines,
    }
    return hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()[:16]


def line_cache_key(voice: str, text: str, speed: float = 1.0) -> str:
    raw = f"{voice}\x00{text}\x00{speed:.2f}".encode()
    return hashlib.sha256(raw).hexdigest()[:24]


# --------------------------------------------------------------------------- paths

def media_root() -> Path:
    from bandready.config import get_settings

    return get_settings().media_dir


def listening_audio_paths(audio_hash: str) -> tuple[Path, Path]:
    """``(wav_path, timing_path)`` for a rendered script."""
    root = media_root() / "listening"
    return root / f"{audio_hash}.wav", root / f"{audio_hash}.timing.json"


def line_cache_path(key: str) -> Path:
    return media_root() / "tts-lines" / f"{key}.wav"


def cached_render(audio_hash: str) -> dict[str, Any] | None:
    """Return the cached render descriptor, or ``None`` when the WAV is gone."""
    wav_path, timing_path = listening_audio_paths(audio_hash)
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        return None
    timing: dict[str, Any] = {}
    if timing_path.exists():
        try:
            timing = json.loads(timing_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):  # pragma: no cover — corrupt sidecar
            timing = {}
    return {
        "audio_hash": audio_hash,
        "path": str(wav_path),
        "bytes": wav_path.stat().st_size,
        "duration_ms": int(timing.get("duration_ms") or 0),
        "sample_rate": int(timing.get("sample_rate") or stitch_mod.TARGET_RATE),
        "lines": timing.get("lines") or [],
        "cached": True,
    }


def load_timing(audio_hash: str) -> dict[str, Any] | None:
    _, timing_path = listening_audio_paths(audio_hash)
    if not timing_path.exists():
        return None
    try:
        return json.loads(timing_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):  # pragma: no cover
        return None


# --------------------------------------------------------------------------- providers

def tts_config(override: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if override:
        return dict(override)
    from bandready.settings_store import get_slot

    return get_slot("tts")


def is_mock_tts(cfg: Mapping[str, Any]) -> bool:
    from bandready.providers.presets import is_mock_preset

    return (
        is_mock_preset(cfg.get("preset"))
        or str(cfg.get("engine") or "") == "mock"
        or str(cfg.get("base_url") or "").startswith("mock://")
    )


def _mock_pcm(text: str, rate: int = stitch_mod.TARGET_RATE) -> tuple[np.ndarray, int]:
    """Silence of a plausible spoken duration (07 §10's chars/15 heuristic)."""
    ms = max(400, stitch_mod.estimate_speech_ms(text))
    return np.zeros(stitch_mod.ms_to_samples(ms, rate), dtype=np.float32), rate


def _kokoro_paths(cfg: Mapping[str, Any]) -> tuple[Path, Path]:
    from bandready.config import get_settings

    models = get_settings().models_dir / "kokoro"
    model_path = Path(str(cfg.get("model_path") or "") or models / "kokoro-v1.0.onnx")
    voices_path = Path(str(cfg.get("voices_path") or "") or models / "voices-v1.0.bin")
    return model_path, voices_path


def _kokoro(cfg: Mapping[str, Any]) -> Any:
    model_path, voices_path = _kokoro_paths(cfg)
    key = (str(model_path), str(voices_path))
    cached = _kokoro_cache.get(key)
    if cached is not None:
        return cached
    try:
        from kokoro_onnx import Kokoro  # type: ignore[import-not-found]
    except Exception as exc:
        raise ApiError(
            503,
            "provider_error",
            "the local Kokoro TTS engine is not installed; install the voice extra or "
            f"point Settings at an OpenAI-compatible TTS endpoint ({exc})",
        ) from exc
    if not model_path.exists() or not voices_path.exists():
        raise ApiError(
            503,
            "provider_error",
            f"Kokoro model files are missing (expected {model_path.name} and "
            f"{voices_path.name} under {model_path.parent}); download them from the "
            "Models settings page before rendering listening audio",
        )
    engine = Kokoro(str(model_path), str(voices_path))
    _kokoro_cache[key] = engine
    return engine


async def _synthesize_kokoro(
    text: str, voice: str, cfg: Mapping[str, Any]
) -> tuple[np.ndarray, int]:
    engine = _kokoro(cfg)
    speed = float(cfg.get("speed") or 1.0)

    def run() -> tuple[np.ndarray, int]:
        samples, rate = engine.create(text, voice=voice, speed=speed, lang="en-us")
        return np.asarray(samples, dtype=np.float32), int(rate)

    try:
        return await asyncio.to_thread(run)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(
            502, "provider_error", f"Kokoro failed to synthesize a line: {exc}"
        ) from exc


async def _synthesize_openai(
    text: str, voice: str, cfg: Mapping[str, Any]
) -> tuple[np.ndarray, int]:
    import httpx
    import soundfile as sf

    base_url = str(cfg.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ApiError(
            400, "provider_error", "the configured TTS provider has no base URL"
        )
    headers = {"Content-Type": "application/json"}
    api_key = str(cfg.get("api_key") or "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": str(cfg.get("model") or "tts-1"),
        "voice": voice,
        "input": text,
        "response_format": "wav",
        "speed": float(cfg.get("speed") or 1.0),
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/audio/speech", json=body, headers=headers
            )
    except httpx.HTTPError as exc:
        raise ApiError(502, "provider_error", f"the TTS endpoint is unreachable: {exc}") from exc
    if response.status_code >= 400:
        raise ApiError(
            502,
            "provider_error",
            f"the TTS endpoint returned {response.status_code}: {response.text[:200]}",
        )
    try:
        data, rate = sf.read(io.BytesIO(response.content), dtype="float32", always_2d=False)
    except Exception as exc:
        raise ApiError(
            502, "provider_error", f"the TTS endpoint returned audio we cannot decode: {exc}"
        ) from exc
    return stitch_mod.to_mono(data), int(rate)


async def synthesize_line(
    text: str, voice: str, cfg: Mapping[str, Any] | None = None
) -> tuple[np.ndarray, int]:
    """``(pcm float32 mono, sample_rate)`` for one line — no caching, no stitching."""
    config = tts_config(cfg)
    clean = (text or "").strip()
    if not clean:
        return np.zeros(0, dtype=np.float32), stitch_mod.TARGET_RATE
    if is_mock_tts(config):
        return _mock_pcm(clean)
    engine = str(config.get("engine") or "").lower()
    if engine in ("kokoro_onnx", "kokoro"):
        return await _synthesize_kokoro(clean, voice, config)
    return await _synthesize_openai(clean, voice, config)


async def _synthesize_cached(
    text: str, voice: str, cfg: Mapping[str, Any], *, use_cache: bool = True
) -> tuple[np.ndarray, int]:
    """Per-line cache (07 §3 step 2) so an edited script re-renders only what changed."""
    clean = (text or "").strip()
    if not clean:
        return np.zeros(0, dtype=np.float32), stitch_mod.TARGET_RATE
    key = line_cache_key(voice, clean, float(cfg.get("speed") or 1.0))
    path = line_cache_path(key)
    if use_cache and path.exists() and path.stat().st_size > 0:
        try:
            return stitch_mod.read_wav(path)
        except Exception:  # noqa: BLE001 — a corrupt cache entry is not fatal
            _log.warning("discarding unreadable TTS line cache entry %s", path.name)
    pcm, rate = await synthesize_line(clean, voice, cfg)
    if use_cache and pcm.size:
        try:
            size = stitch_mod.write_wav(path, pcm, rate)
            register_media(key, "tts_line", f"tts-lines/{key}.wav", size)
        except OSError as exc:  # pragma: no cover — disk full / permissions
            _log.warning("could not cache TTS line %s: %s", key, exc)
    return pcm, rate


# --------------------------------------------------------------------------- media rows

def register_media(
    file_hash: str, kind: str, rel_path: str, size_bytes: int, *, pinned: bool = False
) -> None:
    """Upsert a ``media_files`` row (11 §9). Best effort — never fails a render."""
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql(
                    "INSERT INTO media_files (hash, kind, rel_path, bytes, pinned) "
                    "VALUES (:hash, :kind, :rel_path, :bytes, :pinned) "
                    "ON CONFLICT(hash) DO UPDATE SET "
                    "  rel_path = excluded.rel_path, bytes = excluded.bytes, "
                    "  last_access_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
                ),
                {
                    "hash": file_hash,
                    "kind": kind,
                    "rel_path": rel_path,
                    "bytes": int(size_bytes),
                    "pinned": 1 if pinned else 0,
                },
            )
    except Exception as exc:  # noqa: BLE001 — the cache file is the source of truth
        _log.warning("could not register media file %s (%s): %s", file_hash, kind, exc)


def touch_media(file_hash: str) -> None:
    """Bump ``last_access_at`` so LRU eviction keeps what the learner is playing."""
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql(
                    "UPDATE media_files SET last_access_at = "
                    "strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE hash = :hash"
                ),
                {"hash": file_hash},
            )
    except Exception as exc:  # noqa: BLE001
        _log.debug("could not touch media file %s: %s", file_hash, exc)


def _link_script_audio(script_id: str | None, audio_hash: str) -> None:
    if not script_id:
        return
    try:
        from sqlalchemy import text as sql

        from bandready.db.engine import session_scope

        with session_scope() as session:
            session.execute(
                sql("UPDATE listening_scripts SET audio_hash = :h WHERE id = :id"),
                {"h": audio_hash, "id": script_id},
            )
    except Exception as exc:  # noqa: BLE001
        _log.warning("could not link script %s to audio %s: %s", script_id, audio_hash, exc)


# --------------------------------------------------------------------------- rendering

def _progress(job_id: str | None, pct: int, detail: str) -> None:
    if not job_id:
        return
    try:
        from bandready.server.jobs import job_manager

        job_manager.set_progress(job_id, pct, detail)
    except Exception as exc:  # noqa: BLE001 — progress must never break a render
        _log.debug("progress update failed: %s", exc)


async def render_script(
    script: Mapping[str, Any],
    *,
    accent_set: str | None = None,
    script_id: str | None = None,
    job_id: str | None = None,
    force: bool = False,
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Render one script part to a cached WAV; returns the render descriptor.

    Idempotent: a second call with identical audio content returns the cached result
    without touching the TTS engine.
    """
    lines: Sequence[Mapping[str, Any]] = [
        line for line in (script.get("lines") or []) if isinstance(line, Mapping)
    ]
    if not lines:
        raise ApiError(422, "validation_error", "this script has no lines to render")

    accent = str(accent_set or script.get("accent_set") or "uk").lower()
    # NB: the raw `accent_set` (possibly None) is what drives voice resolution, so a
    # mixed-accent authored script keeps its cast; `accent` is only the label.
    audio_hash = script_audio_hash(script, accent_set)

    if not force:
        hit = cached_render(audio_hash)
        if hit is not None:
            _progress(job_id, 100, "audio already rendered")
            touch_media(audio_hash)
            _link_script_audio(script_id, audio_hash)
            hit.update({"accent_set": accent, "script_id": script_id})
            return hit

    cfg = tts_config(config)
    voices = resolve_voices(script, accent_set)
    default_voice = VOICE_MAP.get(accent, VOICE_MAP["uk"])["narrator"]

    pieces: list[stitch_mod.Piece] = []
    total = len(lines)
    for index, line in enumerate(lines):
        speaker = str(line.get("speaker") or "")
        voice = voices.get(speaker) or default_voice
        text = str(line.get("text") or "")
        pcm, rate = await _synthesize_cached(text, voice, cfg)
        pieces.append((pcm, rate, stitch_mod.clamp_pause(line.get("pause_after_ms", 300))))
        _progress(
            job_id,
            int(5 + 80 * (index + 1) / total),
            f"synthesizing line {index + 1} of {total}",
        )

    _progress(job_id, 88, "stitching audio")
    result = stitch_mod.stitch(pieces)
    if result.audio.size == 0:
        raise ApiError(502, "provider_error", "the TTS provider returned no audio")

    _progress(job_id, 94, "writing the audio cache")
    wav_path, timing_path = listening_audio_paths(audio_hash)
    size = stitch_mod.write_wav(wav_path, result.audio, result.sample_rate)
    document = result.timing_document()
    document.update(
        {
            "audio_hash": audio_hash,
            "accent_set": accent,
            "accent_label": accent_label(accent),
            "script_id": script_id,
            "voices": voices,
            "part": script.get("part"),
        }
    )
    stitch_mod.write_timing(timing_path, document)
    register_media(audio_hash, "listening_render", f"listening/{audio_hash}.wav", size)
    _link_script_audio(script_id, audio_hash)
    _progress(job_id, 100, "audio ready")

    _log.info(
        "rendered listening script %s -> %s (%.1fs, %d lines)",
        script_id or "(unsaved)", audio_hash, result.duration_ms / 1000.0, total,
    )
    return {
        "audio_hash": audio_hash,
        "path": str(wav_path),
        "bytes": size,
        "duration_ms": result.duration_ms,
        "sample_rate": result.sample_rate,
        "lines": [
            {
                "index": t.index,
                "start_ms": t.start_ms,
                "end_ms": t.end_ms,
                "pause_after_ms": t.pause_after_ms,
            }
            for t in result.timings
        ],
        "accent_set": accent,
        "script_id": script_id,
        "cached": False,
    }
