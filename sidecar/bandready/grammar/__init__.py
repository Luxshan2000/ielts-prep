"""Grammar & Usage — the module that teaches the language under the four skills.

Where the skills modules teach a learner to pass a test, this one teaches the language the
test is made of, so its shape is different in three ways:

* it is **sequenced** — :mod:`~bandready.grammar.syllabus` holds a prerequisite graph a
  learner with no English grammar at all can walk from one end to the other, and nothing
  in it depends on something not yet taught;
* it is **productive** — :mod:`~bandready.grammar.practice` moves every point up six rungs
  from recognition to controlled production to free production under time pressure,
  because grammar is only learned by producing it;
* it is about **choice** — the forms are the easy half. *When to use which* is what
  learners get wrong, and it is a whole rung of the ladder and half the content schema.

Module map::

    tables.py             the four tables (D1) — points, derived items, cards, review log
    syllabus.py           the prerequisite graph and the learner's state on it
    practice.py           THE LADDER: what kind of question, in which sentence, and what
                          a pass is worth
    scheduler_bridge.py   the FSRS boundary — when the card comes back, and nothing else
    detectors.py          structure detectors keyed by `structure_slug` (D4)
    grading.py            mechanical grading, and four binary questions for free production

The one-line version of the design, which is the thing worth remembering:
**FSRS decides WHEN. The Ladder decides WHAT KIND.**
"""

from __future__ import annotations

__all__ = [
    "detectors",
    "grading",
    "practice",
    "scheduler_bridge",
    "syllabus",
    "tables",
]
