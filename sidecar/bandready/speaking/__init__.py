"""Speaking teaching layer — the read side of the authored coaching payload.

The exam layer (questions, cue cards, Part 3 themes) is served by
``bandready.server.routes.speaking`` and spoken aloud by the examiner persona. This
package serves the *teaching* layer that sits beside it in ``payload_json.teaching``:
model answers, functional language, vocabulary, structure plans, error watchlists and
pronunciation focus.

The two layers are deliberately separate because the examiner is forbidden from
teaching, and because one of the teaching fields — the model answer — must never reach
a learner who has not attempted the card yet.
"""

from __future__ import annotations

from bandready.speaking.coach import (
    BANDS,
    CRITERIA,
    DEFAULT_BAND,
    FUNCTIONS,
    gate_state,
    teaching_payload,
)

__all__ = [
    "BANDS",
    "CRITERIA",
    "DEFAULT_BAND",
    "FUNCTIONS",
    "gate_state",
    "teaching_payload",
]
