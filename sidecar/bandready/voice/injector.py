"""Per-turn question-card injection (02-voice-pipeline.md §3).

**Question progression is app logic, not LLM memory.** The examiner model never decides
what comes next: the state machine's current card is re-injected as one marked system
message immediately before the last user turn, and the previous injection is stripped, so
cards can never accumulate or drift.

:func:`build_messages` is the whole idea and is deliberately pure — no Pipecat, no I/O —
so the injection rule is unit-tested directly. The Pipecat half
(:func:`make_question_card_processor`) imports Pipecat lazily so this module stays
importable on a machine without the voice extra.
"""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger("bandready.voice.injector")

MARKER = "[[br-question-card]]"
#: Examiner conduct rules (:mod:`bandready.voice.examiner`). Pinned with the persona
#: rather than with the card, because these must survive history trimming: they matter
#: most late in a long session, which is exactly when the oldest messages are dropped.
RULES_MARKER = "[[br-examiner-rules]]"
#: History kept in front of the injected card (02 §9 "context trimming" knob). Examiner
#: turns need no deep memory — the card carries the script.
DEFAULT_MAX_HISTORY = 12

__all__ = [
    "DEFAULT_MAX_HISTORY",
    "MARKER",
    "RULES_MARKER",
    "QuestionCardProcessor",
    "build_messages",
    "make_question_card_processor",
]


def _is_injection(message: dict[str, Any]) -> bool:
    content = message.get("content")
    return (
        message.get("role") == "system"
        and isinstance(content, str)
        and content.startswith((MARKER, RULES_MARKER))
    )


def build_messages(
    messages: list[dict[str, Any]],
    card_block: str | None,
    max_history: int | None = DEFAULT_MAX_HISTORY,
    rules_block: str | None = None,
) -> list[dict[str, Any]]:
    """Rebuild the LLM context with exactly one fresh card injection.

    1. Drop any previous ``[[br-question-card]]`` / ``[[br-examiner-rules]]`` system
       message (never accumulate).
    2. Trim the conversation to the last ``max_history`` non-leading-system messages.
    3. Pin the examiner conduct rules straight after the persona, ahead of the trimmed
       conversation, so they can never be trimmed away.
    4. Insert the new card immediately **before the last user message**, so the model
       reads it as current-turn instructions rather than stale history.

    Pure: the input list is never mutated.
    """
    cleaned = [dict(m) for m in messages if not _is_injection(m)]

    head: list[dict[str, Any]] = []
    rest = cleaned
    while rest and rest[0].get("role") == "system":
        head.append(rest[0])
        rest = rest[1:]

    # The leading persona system message(s) are pinned; only the conversation is trimmed,
    # oldest first.
    if max_history is not None and max_history > 0 and len(rest) > max_history:
        rest = rest[-max_history:]

    if rules_block:
        head.append({"role": "system", "content": f"{RULES_MARKER}\n{rules_block.strip()}"})
    cleaned = head + rest

    if not card_block:
        return cleaned

    injected = {"role": "system", "content": f"{MARKER}\n{card_block.strip()}"}
    insert_at = len(cleaned)
    for i in range(len(cleaned) - 1, -1, -1):
        if cleaned[i].get("role") == "user":
            insert_at = i
            break
    cleaned.insert(insert_at, injected)
    return cleaned


def make_question_card_processor(context: Any, card_source: Any, **kwargs: Any) -> Any:
    """Build the in-pipeline half (needs Pipecat).

    ``card_source`` is anything exposing ``current_card_block() -> str | None`` — in
    practice the session state machine. Reading the card is a pure read; advancing is the
    state machine's own business (02 §3.1).
    """
    return _processor_class()(context, card_source, **kwargs)


#: Backwards-compatible spelling used by 02 §2.3's assembly sketch.
QuestionCardProcessor = make_question_card_processor


_CLASS: Any = None


def _processor_class() -> Any:
    global _CLASS
    if _CLASS is not None:
        return _CLASS

    from bandready.voice.pipeline import require_pipecat

    require_pipecat()
    from pipecat.frames.frames import LLMContextFrame
    from pipecat.processors.frame_processor import FrameProcessor

    class _QuestionCardProcessor(FrameProcessor):  # type: ignore[misc,valid-type]
        """Intercepts ``LLMContextFrame`` and rewrites the context in place.

        Mirrors OpenVoiceUI's ``RAGProcessor.process_frame`` exactly, including its
        never-raise policy: a missed injection degrades one turn, an exception kills the
        whole call.
        """

        def __init__(
            self,
            context: Any,
            card_source: Any,
            max_history: int | None = DEFAULT_MAX_HISTORY,
        ) -> None:
            super().__init__()
            self._context = context
            self._cards = card_source
            self._max_history = max_history

        async def process_frame(self, frame: Any, direction: Any) -> None:
            await super().process_frame(frame, direction)
            if isinstance(frame, LLMContextFrame):
                try:
                    self._apply()
                except Exception:  # noqa: BLE001 — never break the call over injection
                    _log.exception("question-card injection failed; continuing")
            await self.push_frame(frame, direction)

        def _apply(self) -> None:
            card_block = self._read("current_card_block")
            # Examiner conduct is re-stated every turn because it is part-dependent
            # (research 01 §8) and because an LLM's helpfulness reasserts itself the
            # moment the instruction falls out of the recent context.
            rules_block = self._read("current_rules_block")
            messages = list(self._context.get_messages())
            self._context.set_messages(
                build_messages(messages, card_block, self._max_history, rules_block)
            )

        def _read(self, name: str) -> str | None:
            getter = getattr(self._cards, name, None)
            return getter() if callable(getter) else None

    _CLASS = _QuestionCardProcessor
    return _CLASS
