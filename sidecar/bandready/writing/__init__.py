"""The writing module's teaching layer: the coach and the 60-minute mock.

Two packages already exist for writing and neither is this one. ``scoring/writing.py``
is the **examiner** — pre-checks, the evaluation prompt, band arithmetic, persistence.
``server/routes/writing.py`` is the **workspace** — the prompt bank, drafts, autosave,
submit, the report. This package is the **teacher**: the authored material that sits
beside a prompt (``writing_prompts.teaching_json``, content ``staging-writing/DESIGN.md``
§1–§5), and the one sitting in which all of it is taken away again.

* :mod:`bandready.writing.coach` reads the teaching payload and decides who may see what.
  Its single rule: **a model answer is never returned to a learner who has not written
  yet.**
* :mod:`bandready.writing.mock` runs one 60-minute sitting — Task 1 and Task 2, one
  clock, one submit, Task 2 weighted double — and holds the coach shut for its duration.

The two are deliberately circular-free in one direction only: ``mock`` imports ``coach``
at module level, ``coach`` imports ``mock`` lazily inside the functions that have to ask
whether a mock is running. That is the whole coupling.
"""

from __future__ import annotations

__all__ = ["coach", "mock"]
