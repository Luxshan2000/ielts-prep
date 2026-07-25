"""Provider layer: preset registry, the OpenAI-compatible LLM adapter, engine
detection and connection verification (03-providers-and-settings.md)."""

from __future__ import annotations

from .llm import chat_json, chat_text
from .presets import get_preset, list_presets

__all__ = ["chat_json", "chat_text", "get_preset", "list_presets"]
