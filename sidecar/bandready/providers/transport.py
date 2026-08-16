"""One answer to "which engine actually runs this job", and one digest that says so.

Two questions were previously answered in six places, each with its own rule:

* **Which engine?** ``tts_render.synthesize_line`` read ``cfg["engine"]``,
  ``voice/pipeline.py`` had its own allow-list, ``routes/providers.py`` had a third. The
  slot's stored ``engine`` is a *second source of truth* for a question the ``preset``
  already answers, and it silently outranked it: picking OpenRouter for text-to-speech
  left ``{"preset": "openrouter", "engine": "kokoro_onnx"}`` behind — the frontend's
  ``applyPreset`` skips a falsy ``engine`` and PATCH deep-merges — so every dispatch site
  kept running the local model while Settings showed the cloud one.
  :func:`resolve_engine` derives the engine from the preset and only consults a stored
  ``engine`` for a preset id we do not ship.

* **Is this the same provider that produced the audio on disk?** Nothing asked.
  :func:`provider_identity` is the short digest that makes "past is past" automatic: fold
  it into a cache key and switching provider stops addressing the old artefact, with no
  migration, no auto-delete and no hand-bumped generation counter.

The identity folds **exactly** the fields that change the bytes an engine emits:

============================  ==================================================
resolved engine               kokoro_onnx / faster_whisper / openai_compat / mock
``speed`` (tts, 2dp)          an audio parameter, and the one already in
                              ``line_cache_key`` but historically missing from
                              ``script_audio_hash``
kokoro weights, BASENAME only ``kokoro-v1.0.onnx`` — never the absolute path, so
                              moving the data directory invalidates nothing
base_url + model (remote)     normalised ``strip().rstrip("/").casefold()``, which
                              is what picks the endpoint
============================  ==================================================

Deliberately **excluded**, and each exclusion is a decision:

* ``api_key`` — rotating a key must never cost a re-render of every WAV on disk;
* the preset *label*, and the preset id itself — re-selecting an identical preset under a
  new name is not an audible change;
* ``params``, timeouts, retries — they change how a call is retried, not what it returns;
* ``voice`` — listening voices come from :data:`bandready.audio.tts_render.VOICE_MAP`, not
  from the slot, so folding the slot's voice in would invalidate renders it never touched;
* absolute paths — see the basename note above.

Finally, the **legacy default returns an empty identity**. Local Kokoro, shipped weights,
speed 1.0 — the configuration the overwhelming majority of installs run — digests to
``""``, and every caller omits an empty term. That is what makes this upgrade free: nobody
on the default loses a render, no orphaned WAVs are created, and only a learner who has
actually moved off Kokoro gets new keys, which is precisely when they should.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Mapping
from typing import Any

_log = logging.getLogger("bandready.providers.transport")

#: The four engines this app can actually run. Anything else is a configuration error,
#: not a provider — see ``rejected``: adding "openrouter" to an allow-list treats the
#: symptom, deriving the engine from the preset removes the class.
ENGINES: tuple[str, ...] = ("kokoro_onnx", "faster_whisper", "openai_compat", "mock")

MODALITIES: tuple[str, ...] = ("llm", "stt", "tts")

#: Engine assumed when nothing else answers, per modality.
DEFAULT_ENGINE: dict[str, str] = {
    "llm": "openai_compat",
    "stt": "faster_whisper",
    "tts": "kokoro_onnx",
}

#: Aliases we have written down at one call site or another over time.
_ENGINE_ALIASES: dict[str, str] = {
    "kokoro": "kokoro_onnx",
    "kokoro_onnx": "kokoro_onnx",
    "faster_whisper": "faster_whisper",
    "faster-whisper": "faster_whisper",
    "whisper": "faster_whisper",
    "openai": "openai_compat",
    "openai_compat": "openai_compat",
    "openrouter": "openai_compat",
    "mock": "mock",
}

#: The shipped Kokoro weights. Basenames, because that is all the identity folds.
DEFAULT_KOKORO_WEIGHTS: tuple[str, str] = ("kokoro-v1.0.onnx", "voices-v1.0.bin")

#: The configuration whose identity is ``""``. See the module docstring: this is the
#: sentinel that keeps every existing render addressable on upgrade.
_LEGACY_DEFAULT_FIELDS: dict[str, dict[str, Any]] = {
    "tts": {
        "engine": "kokoro_onnx",
        "speed": "1.00",
        "weights": list(DEFAULT_KOKORO_WEIGHTS),
    },
    "stt": {"engine": "faster_whisper"},
    "llm": {"engine": "openai_compat"},
}


def _normalise_engine(value: Any) -> str | None:
    name = str(value or "").strip().lower()
    if not name:
        return None
    return _ENGINE_ALIASES.get(name) or (name if name in ENGINES else None)


def _modality(modality: str) -> str:
    name = str(modality or "").strip().lower()
    if name not in MODALITIES:
        raise ValueError(f"unknown modality {modality!r}")
    return name


def _preset_for(slot: Mapping[str, Any]) -> dict[str, Any] | None:
    """The shipped preset behind this slot, hidden ones included.

    ``include_hidden=True`` on purpose: the mock presets are how the test suite runs with
    no engine installed, and a resolver that could not see them would report ``kokoro_onnx``
    for a slot that is deliberately pointed at silence.
    """
    from bandready.providers import presets

    preset_id = str(slot.get("preset") or "").strip()
    if not preset_id:
        return None
    return presets.get_preset(preset_id, include_hidden=True)


def resolve_engine(slot: Mapping[str, Any], modality: str) -> str:
    """Which engine will actually run this job — one of :data:`ENGINES`.

    The order **is** the fix:

    1. a ``mock://`` base URL, or a mock preset — nothing leaves the box, whatever else
       the slot says (this mirrors :func:`bandready.providers.presets.is_mock_config`);
    2. the preset's own ``engine`` declaration;
    3. the preset's ``kind``: ``cloud`` means an OpenAI-compatible endpoint;
    4. **only for a preset id we do not ship** — the slot's stored ``engine``;
    5. a base URL at all implies an OpenAI-compatible endpoint;
    6. the modality default.

    Step 4 sitting *below* steps 2 and 3 is the whole point. A stored ``engine`` is a
    stale copy of an answer the preset already gives, and letting it win is what made
    "text-to-speech: OpenRouter" keep synthesizing with local Kokoro.
    """
    kind = _modality(modality)
    if not isinstance(slot, Mapping):
        return DEFAULT_ENGINE[kind]

    from bandready.providers.presets import is_mock_config

    if is_mock_config(slot):
        return "mock"

    preset = _preset_for(slot)
    if preset is not None:
        declared = _normalise_engine(preset.get("engine"))
        if declared:
            return declared
        preset_kind = str(preset.get("kind") or "").strip().lower()
        if preset_kind == "mock":
            return "mock"
        if preset_kind == "cloud":
            return "openai_compat"
        # A shipped preset that declares nothing and is neither mock nor cloud (Ollama,
        # today) still must not fall back to the stored `engine`: it is exactly the value
        # a previous preset left behind. Its base URL is the honest answer.
    else:
        stored = _normalise_engine(slot.get("engine"))
        if stored:
            return stored

    if str(slot.get("base_url") or "").strip():
        return "openai_compat"
    return DEFAULT_ENGINE[kind]


def _kokoro_weight_names(slot: Mapping[str, Any]) -> list[str]:
    """Basenames of the resolved Kokoro weights — never the directory they live in."""
    from bandready.audio import tts_render

    try:
        model_path, voices_path = tts_render._kokoro_paths(slot)
    except Exception as exc:  # noqa: BLE001 — identity must never break a render
        _log.debug("could not resolve Kokoro weight paths for the identity: %s", exc)
        return list(DEFAULT_KOKORO_WEIGHTS)
    return [model_path.name, voices_path.name]


def identity_fields(slot: Mapping[str, Any], modality: str) -> dict[str, Any]:
    """The fields :func:`provider_identity` digests, in readable form — for logs.

    Handy in a bug report: two learners with "the same settings" and different hashes
    differ in exactly one line of this dict.
    """
    kind = _modality(modality)
    slot = slot if isinstance(slot, Mapping) else {}
    engine = resolve_engine(slot, kind)
    fields: dict[str, Any] = {"engine": engine}

    if kind == "tts":
        try:
            speed = float(slot.get("speed") if slot.get("speed") is not None else 1.0)
        except (TypeError, ValueError):
            speed = 1.0
        fields["speed"] = f"{speed:.2f}"

    if engine == "kokoro_onnx":
        fields["weights"] = _kokoro_weight_names(slot)
    elif engine == "openai_compat":
        fields["base_url"] = str(slot.get("base_url") or "").strip().rstrip("/").casefold()
        fields["model"] = str(slot.get("model") or "").strip()
    return fields


def is_legacy_default(slot: Mapping[str, Any], modality: str) -> bool:
    """Is this the configuration whose identity is deliberately empty?"""
    kind = _modality(modality)
    return identity_fields(slot, kind) == _LEGACY_DEFAULT_FIELDS[kind]


def provider_identity(slot: Mapping[str, Any], modality: str) -> str:
    """8 hex characters that change exactly when the engine's output would.

    Returns ``""`` for the legacy default (local Kokoro, shipped weights, speed 1.0), and
    callers **must** omit an empty identity from their key rather than folding an empty
    string in. That is what keeps every render made before this existed addressable.
    """
    kind = _modality(modality)
    fields = identity_fields(slot, kind)
    if fields == _LEGACY_DEFAULT_FIELDS[kind]:
        return ""
    canonical = json.dumps(fields, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:8]


def slot_identity(modality: str) -> str:
    """:func:`provider_identity` for the **live** slot; ``""`` if settings are unreadable.

    Never raises. A settings document that cannot be resolved — an unset ``${VAR}`` behind
    an ``api_key``, a DB that is not migrated yet — must not change a content hash, or a
    transient configuration error would orphan every WAV on disk.
    """
    try:
        from bandready.settings_store import get_slot

        return provider_identity(get_slot(modality), modality)
    except Exception as exc:  # noqa: BLE001
        _log.debug("could not read the %s slot for its identity: %s", modality, exc)
        return ""
