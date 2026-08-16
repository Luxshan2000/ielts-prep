"""The shipped preset registry (03-providers-and-settings.md §3).

Presets are **data, not code**: a preset pre-fills fields and declares — via
``config_spec`` — which fields the generic Settings form should render. Adding a provider
never touches TSX and never touches an adapter.

Hidden presets (``"hidden": true``) are the mock test seam of §3.1 / R2-19: they exist in
this module always but are only *served* and only *selectable* when the sidecar runs with
``BANDREADY_ENABLE_MOCK=1``.
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from typing import Any

ALL_PLATFORMS = ["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"]
MAC_ARM = ["darwin-arm64"]

# --- reusable config_spec fragments ---------------------------------------------------

_TEMPERATURE = {
    "key": "params.temperature", "label": "Temperature", "type": "slider",
    "group": "params", "default": 0.7, "min": 0.0, "max": 2.0, "step": 0.1,
    "help": "Lower is more consistent. Scoring calls override this per request.",
}
_MAX_TOKENS = {
    "key": "params.max_tokens", "label": "Max tokens", "type": "number",
    "group": "params", "default": 1024, "min": 64, "max": 32000, "step": 64,
}
#: Models we have actually pointed this app at, per modality.
#:
#: There is exactly one cloud provider now. OpenRouter serves chat, transcription and
#: speech from a single key, so the branded alternatives — OpenAI, Groq, DeepSeek — bought
#: nothing but a longer list and one more decision for somebody who is here to practise
#: English. Anything OpenAI-compatible is still reachable through custom_openai.
#:
#: A preset whose model field falls back to free text is a trap: the learner types something
#: plausible, the call 404s deep in a provider, and the failure surfaces as "the practice
#: engine reported an error" three screens away.
#:
#: These are no longer the whole list. The full catalogue is fetched live from OpenRouter,
#: because it changes weekly and because a text-to-speech model's voices can only be read off
#: the API. What stays here is the ONE model we recommend per job, which is a different thing
#: from an inventory: a learner opening this screen wants a good default, not 413 options.
#:
#: See docs/plan/_context/openrouter-catalogue.md for how the live listing works. The short
#: version: audio models declare their modality as `speech` and `transcription`, not `audio`,
#: and they are absent from the default `/models` response entirely.
RECOMMENDED_OPENROUTER: dict[str, str] = {
    # Closest to a real examiner, and the best written feedback.
    "llm": "anthropic/claude-sonnet-4.5",
    # 90 voices, and priced per character rather than per second.
    "tts": "deepgram/aura-2",
    # Accurate on accented speech, which is the entire population of this app.
    "stt": "deepgram/nova-3",
}

OPENROUTER_MODELS: dict[str, list[str]] = {
    "llm": [
        "anthropic/claude-sonnet-4.5",
        "google/gemini-2.5-flash",
        "meta-llama/llama-3.3-70b-instruct",
        "qwen/qwen-2.5-72b-instruct",
        "deepseek/deepseek-chat",
    ],
    "stt": [
        "openai/whisper-large-v3-turbo",
        "openai/whisper-large-v3",
        "qwen/qwen3-asr-flash-2026-02-10",
        "openai/gpt-4o-transcribe",
        "openai/gpt-4o-mini-transcribe",
        "deepgram/nova-3",
        "mistralai/voxtral-mini-transcribe",
    ],
    "tts": [
        "openai/gpt-audio",
        "openai/gpt-audio-mini",
        "deepgram/aura-2",
        "google/gemini-3.1-flash-tts-preview",
        "qwen/qwen-audio-3.0-tts-flash",
    ],
}


_MODEL_FROM_VERIFY = {
    "key": "model", "label": "Model", "type": "select", "required": True,
    "group": "connection", "options_from": "verify",
}


def _base_url(default: str, locked: bool = False) -> dict[str, Any]:
    return {
        "key": "base_url", "label": "Base URL", "type": "text", "required": True,
        "group": "connection", "default": default, "readonly": locked,
        "placeholder": default,
    }


def _api_key(env_hint: str, placeholder: str) -> dict[str, Any]:
    return {
        "key": "api_key", "label": "API key", "type": "password", "required": True,
        "secret": True, "group": "connection", "placeholder": placeholder,
        "help": f"Or reference an environment variable: ${{{env_hint}}}",
    }


# --- the registry ---------------------------------------------------------------------

PRESETS: list[dict[str, Any]] = [
        {
        "id": "ollama",
        "label": "Ollama",
        "modalities": ["llm"],
        "kind": "local-server",
        "base_url": "http://127.0.0.1:11434/v1",
        "base_url_locked": False,
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://ollama.com/download",
        "suggested_models": ["qwen3:14b", "llama3.1:8b", "qwen3:32b"],
        "notes": "Default local engine on Windows and Linux.",
        "config_spec": [
            _base_url("http://127.0.0.1:11434/v1"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
                {
        "id": "openrouter",
        "label": "OpenRouter",
        # OpenRouter shipped /audio/transcriptions and /audio/speech, so one key now covers
        # all three modalities. Its base URL is already an OpenAI-shaped /v1, so the existing
        # OpenAI-compatible client reaches both without a new transport.
        "modalities": ["llm", "stt", "tts"],
        "kind": "cloud",
        # Declared, not inferred. `engine` on a slot is a stale copy of this answer —
        # `bandready.providers.transport.resolve_engine` reads the declaration and
        # `settings_store.validate_settings` writes it back over whatever the previous
        # preset left in the slot, which is what stops "TTS: OpenRouter" running Kokoro.
        "engine": "openai_compat",
        "base_url": "https://openrouter.ai/api/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "OPENROUTER_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://openrouter.ai/docs",
        "suggested_models": OPENROUTER_MODELS["llm"],
        "models_by_modality": OPENROUTER_MODELS,
        "notes": (
            "One key for the examiner, speech-to-text and the voice. Pronunciation practice "
            "still needs local Whisper — a remote transcript carries no per-word confidence."
        ),
        "config_spec": [
            _base_url("https://openrouter.ai/api/v1", locked=True),
            _api_key("OPENROUTER_API_KEY", "sk-or-…"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
                {
        "id": "faster_whisper",
        "label": "Local Whisper",
        "modalities": ["stt"],
        "kind": "local-inproc",
        "base_url": "",
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "engine": "faster_whisper",
        "docs_url": "https://github.com/SYSTRAN/faster-whisper",
        "suggested_models": ["base", "small", "large-v3-turbo"],
        "notes": "faster-whisper, int8 on CPU by default.",
        "config_spec": [
            {"key": "model", "label": "Model size", "type": "select", "required": True,
             "group": "connection", "default": "base",
             "options": ["tiny", "base", "small", "medium", "large-v3-turbo"]},
            {"key": "device", "label": "Device", "type": "select", "group": "params",
             "default": "auto", "options": ["auto", "cpu"]},
            {"key": "compute_type", "label": "Compute type", "type": "select",
             "group": "params", "default": "int8",
             "options": ["int8", "int8_float16", "float16", "float32"]},
        ],
    },
    {
        "id": "kokoro",
        "label": "Kokoro (local TTS)",
        "modalities": ["tts"],
        "kind": "local-inproc",
        "base_url": "",
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "engine": "kokoro_onnx",
        "docs_url": "https://github.com/thewh1teagle/kokoro-onnx",
        "suggested_models": [],
        "notes": "82M ONNX voice model — the default everywhere.",
        "config_spec": [
            {"key": "voice", "label": "Voice", "type": "select", "required": True,
             "group": "connection", "default": "af_heart",
             "options": ["af_heart", "bf_emma", "bm_george", "bm_lewis", "am_michael"],
             "help": "British voices (bf_/bm_) are the most exam-authentic."},
            {"key": "speed", "label": "Speed", "type": "slider", "group": "params",
             "default": 1.0, "min": 0.5, "max": 1.5, "step": 0.05},
        ],
    },
    # --- hidden test seam (§3.1, R2-19) -----------------------------------------------
    {
        "id": "mock_llm",
        "label": "Mock LLM (tests)",
        "modalities": ["llm"],
        "kind": "mock",
        "hidden": True,
        "base_url": "mock://llm",
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "suggested_models": ["mock-model-1"],
        "notes": "Deterministic canned fixtures; no network.",
        "config_spec": [
            {"key": "model", "label": "Model", "type": "text", "group": "connection",
             "default": "mock-model-1"},
            {"key": "fixture_set", "label": "Fixture set", "type": "text",
             "group": "params", "default": "default"},
            {"key": "latency_ms", "label": "Simulated latency (ms)", "type": "number",
             "group": "params", "default": 0, "min": 0, "max": 5000},
        ],
    },
    {
        "id": "mock_stt",
        "label": "Mock STT (tests)",
        "modalities": ["stt"],
        "kind": "mock",
        "hidden": True,
        "base_url": "mock://stt",
        "needs_key": False,
        "engine": "mock",
        "platforms": ALL_PLATFORMS,
        "suggested_models": ["mock-stt"],
        "notes": "Returns a fixed transcript.",
        "config_spec": [
            {"key": "model", "label": "Model", "type": "text", "group": "connection",
             "default": "mock-stt"},
        ],
    },
    {
        "id": "mock_tts",
        "label": "Mock TTS (tests)",
        "modalities": ["tts"],
        "kind": "mock",
        "hidden": True,
        "base_url": "mock://tts",
        "needs_key": False,
        "engine": "mock",
        "platforms": ALL_PLATFORMS,
        "suggested_models": [],
        "notes": "Returns a short silent WAV.",
        "config_spec": [
            {"key": "voice", "label": "Voice", "type": "text", "group": "connection",
             "default": "mock_voice"},
        ],
    },
]

_BY_ID = {p["id"]: p for p in PRESETS}


def mock_enabled() -> bool:
    from bandready.config import get_settings

    return bool(get_settings().enable_mock)


def list_presets(
    modality: str | None = None, include_hidden: bool | None = None
) -> list[dict[str, Any]]:
    """Presets as served by ``GET /api/v1/providers/presets``.

    Hidden (mock) presets appear only when ``BANDREADY_ENABLE_MOCK=1``, unless a caller
    explicitly overrides `include_hidden`.
    """
    show_hidden = mock_enabled() if include_hidden is None else include_hidden
    out = []
    for preset in PRESETS:
        if preset.get("hidden") and not show_hidden:
            continue
        if modality and modality not in preset["modalities"]:
            continue
        out.append(copy.deepcopy(preset))
    return out


def get_preset(preset_id: str, include_hidden: bool | None = None) -> dict[str, Any] | None:
    preset = _BY_ID.get(preset_id)
    if preset is None:
        return None
    show_hidden = mock_enabled() if include_hidden is None else include_hidden
    if preset.get("hidden") and not show_hidden:
        return None
    return copy.deepcopy(preset)


def is_mock_preset(preset_id: str | None) -> bool:
    if not preset_id:
        return False
    preset = _BY_ID.get(preset_id)
    return bool(preset and preset.get("kind") == "mock")


def is_mock_config(cfg: Mapping[str, Any]) -> bool:
    """Is this slot config pointed at the mock provider — i.e. does nothing leave the box?

    One predicate, not six private copies, because this is the answer to the question the
    whole product rests on: an offline-first app that says "no" here in five places and
    "yes" in the sixth has shipped a network call it promised not to make. A config is the
    mock one if its preset is a mock preset (``is_mock_preset`` above) or if its base URL
    is a ``mock://`` address, which is how an override reaches the mock transport without
    naming a preset at all.

    Engine-level mock flags stay at their call site: ``tts_render`` writes
    ``is_mock_config(cfg) or engine == "mock"`` because "the TTS engine is the mock
    renderer" is a different fact from "the provider is the mock provider".
    """
    return is_mock_preset(cfg.get("preset")) or str(cfg.get("base_url") or "").startswith(
        "mock://"
    )


def preset_for_config(cfg: dict[str, Any]) -> dict[str, Any] | None:
    return get_preset(str(cfg.get("preset", "")), include_hidden=True)
