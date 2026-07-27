"""Reading practice logic that is not HTTP and not content.

Reading already had two homes and neither of them is this one.
``bandready.server.routes.reading`` is the **player** — the passage bank, attempts,
autosave, deterministic marking and the review screen. ``bandready.scoring.answers`` is
the **marker**, shared with listening. This package is the **teacher**, and everything in
it is importable without a running server so the rules can be tested as rules.

Reading teaches differently from speaking and writing, and the difference decides the
whole design. Those two modules teach through band-graded model answers because the
learner produces language; a reading candidate produces nothing but a key match, so a
"model answer" field here would be meaningless. What decides a reading score is the
**worked solution** (where the answer is and which words carry it), the **paraphrase
link** between question and text, the **distractor analysis** that says why each wrong
option was tempting, the **trap taxonomy** — above all on True/False/Not Given — the
**per-type strategy**, and **time discipline**: 60 minutes, 3 passages, and unlike
Listening, no transfer time.

* :mod:`~bandready.reading.coach` reads the authored teaching payload out of
  ``reading_passages.passage_json`` and decides who may see what. Its single rule: **a
  worked solution is never returned for a passage the learner has not attempted.** The
  answer span *is* the answer, so leaking it before an attempt destroys the practice.
* :mod:`~bandready.reading.mock` runs one 60-minute sitting — three passages, forty
  questions, one clock, one submit — and holds the coach shut for its duration.
* :mod:`~bandready.reading.drills` builds and grades the practice kinds the review step
  feeds (type · trap · paraphrase · skim).

The coupling runs one way only: ``mock`` imports ``coach`` at module level, ``coach``
imports ``mock`` lazily inside the handful of functions that have to ask whether a
sitting is open. Nothing is imported here, so one half-finished module never stops the
other from loading.
"""

from __future__ import annotations

__all__ = ["coach", "drills", "mock"]
