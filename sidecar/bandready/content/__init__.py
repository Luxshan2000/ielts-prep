"""Content bank: authoring, import/seeding and LLM generation pipelines.

Submodules are independent and import-light on purpose — ``bandready.server.app`` imports
``bandready.content.loader`` inside a ``try/except ImportError`` at startup, so nothing here
may raise at import time or the whole content seed is silently skipped.
"""

from __future__ import annotations

__all__: list[str] = []
