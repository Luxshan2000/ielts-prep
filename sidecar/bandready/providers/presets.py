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
        "id": "mlx_lm",
        "label": "MLX (mlx-lm server)",
        "modalities": ["llm"],
        "kind": "local-server",
        "base_url": "http://127.0.0.1:8080/v1",
        "base_url_locked": False,
        "needs_key": False,
        "platforms": MAC_ARM,
        "docs_url": "https://github.com/ml-explore/mlx-examples/tree/main/llms",
        "suggested_models": [
            "mlx-community/Qwen3-14B-4bit",
            "mlx-community/Qwen3-8B-4bit",
        ],
        "notes": "Fastest local LLM on Apple Silicon.",
        "config_spec": [
            _base_url("http://127.0.0.1:8080/v1"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
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
        "id": "lm_studio",
        "label": "LM Studio",
        "modalities": ["llm"],
        "kind": "local-server",
        "base_url": "http://127.0.0.1:1234/v1",
        "base_url_locked": False,
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://lmstudio.ai",
        "suggested_models": [],
        "notes": "GUI-managed models — start the server from LM Studio's Developer tab.",
        "config_spec": [
            _base_url("http://127.0.0.1:1234/v1"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
    {
        "id": "llama_cpp",
        "label": "llama.cpp (llama-server)",
        "modalities": ["llm"],
        "kind": "local-server",
        "base_url": "http://127.0.0.1:8080/v1",
        "base_url_locked": False,
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://github.com/ggml-org/llama.cpp",
        "suggested_models": [],
        "notes": "Port 8080 collides with mlx-lm; detection disambiguates by model id.",
        "config_spec": [
            _base_url("http://127.0.0.1:8080/v1"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "modalities": ["llm", "stt", "tts"],
        "kind": "cloud",
        "base_url": "https://api.openai.com/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "OPENAI_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://platform.openai.com/docs",
        "suggested_models": ["gpt-4o-mini", "gpt-4o"],
        "notes": "The only preset covering all three modalities.",
        "config_spec": [
            _base_url("https://api.openai.com/v1", locked=True),
            _api_key("OPENAI_API_KEY", "sk-…"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
    {
        "id": "openrouter",
        "label": "OpenRouter",
        "modalities": ["llm"],
        "kind": "cloud",
        "base_url": "https://openrouter.ai/api/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "OPENROUTER_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://openrouter.ai/docs",
        "suggested_models": [
            "anthropic/claude-sonnet-4.5",
            "meta-llama/llama-3.3-70b-instruct",
        ],
        "notes": "One key, every frontier model.",
        "config_spec": [
            _base_url("https://openrouter.ai/api/v1", locked=True),
            _api_key("OPENROUTER_API_KEY", "sk-or-…"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
    {
        "id": "groq",
        "label": "Groq",
        "modalities": ["llm"],
        "kind": "cloud",
        "base_url": "https://api.groq.com/openai/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "GROQ_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://console.groq.com/docs",
        "suggested_models": ["llama-3.3-70b-versatile"],
        "notes": "Lowest cloud latency.",
        "config_spec": [
            _base_url("https://api.groq.com/openai/v1", locked=True),
            _api_key("GROQ_API_KEY", "gsk_…"),
            _MODEL_FROM_VERIFY,
            _TEMPERATURE,
            _MAX_TOKENS,
        ],
    },
    {
        "id": "groq_whisper",
        "label": "Groq Whisper (STT)",
        "modalities": ["stt"],
        "kind": "cloud",
        "base_url": "https://api.groq.com/openai/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "GROQ_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://console.groq.com/docs/speech-text",
        "suggested_models": ["whisper-large-v3-turbo"],
        "engine": "openai_compat",
        "notes": "Same key as the Groq LLM preset.",
        "config_spec": [
            _base_url("https://api.groq.com/openai/v1", locked=True),
            _api_key("GROQ_API_KEY", "gsk_…"),
            {"key": "model", "label": "Model", "type": "select", "required": True,
             "group": "connection", "default": "whisper-large-v3-turbo",
             "options": ["whisper-large-v3-turbo", "whisper-large-v3"]},
        ],
    },
    {
        "id": "deepseek",
        "label": "DeepSeek",
        "modalities": ["llm"],
        "kind": "cloud",
        "base_url": "https://api.deepseek.com/v1",
        "base_url_locked": True,
        "needs_key": True,
        "key_env_hint": "DEEPSEEK_API_KEY",
        "platforms": ALL_PLATFORMS,
        "docs_url": "https://api-docs.deepseek.com",
        "suggested_models": ["deepseek-chat"],
        "notes": "Cheap, strong at rubric scoring.",
        "config_spec": [
            _base_url("https://api.deepseek.com/v1", locked=True),
            _api_key("DEEPSEEK_API_KEY", "sk-…"),
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
        "id": "mlx_whisper",
        "label": "MLX Whisper",
        "modalities": ["stt"],
        "kind": "local-inproc",
        "base_url": "",
        "needs_key": False,
        "platforms": MAC_ARM,
        "engine": "mlx_whisper",
        "docs_url": "https://github.com/ml-explore/mlx-examples/tree/main/whisper",
        "suggested_models": ["mlx-community/whisper-large-v3-turbo"],
        "notes": "large-v3-turbo runs realtime on M-series.",
        "config_spec": [
            {"key": "model", "label": "Model", "type": "select", "required": True,
             "group": "connection", "default": "mlx-community/whisper-large-v3-turbo",
             "options": ["mlx-community/whisper-large-v3-turbo",
                         "mlx-community/whisper-small-mlx"]},
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
    {
        "id": "custom_openai",
        "label": "Custom OpenAI-compatible…",
        "modalities": ["llm", "stt", "tts"],
        "kind": "cloud",
        "base_url": "",
        "base_url_locked": False,
        "needs_key": False,
        "platforms": ALL_PLATFORMS,
        "divider_before": True,
        "docs_url": "",
        "suggested_models": [],
        "notes": "Any endpoint that speaks the OpenAI HTTP API. Every field is editable.",
        "config_spec": [
            _base_url("", locked=False),
            {"key": "api_key", "label": "API key", "type": "password", "secret": True,
             "group": "connection", "required": False,
             "placeholder": "leave blank for keyless local servers"},
            {"key": "model", "label": "Model", "type": "text", "required": True,
             "group": "connection", "options_from": "verify"},
            _TEMPERATURE,
            _MAX_TOKENS,
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


def preset_for_config(cfg: dict[str, Any]) -> dict[str, Any] | None:
    return get_preset(str(cfg.get("preset", "")), include_hidden=True)
