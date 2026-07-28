"""Listening practice logic that is not HTTP, not content and not audio.

Listening already had three homes and none of them is this one.
:mod:`bandready.server.routes.listening` is the **player** — the script bank, TTS
rendering, attempts, autosave, deterministic marking and the review screen.
:mod:`bandready.audio.tts_render` and :mod:`bandready.audio.stitch` are the **studio**,
which turn an authored script into a WAV plus the per-line ``timing.json`` everything
below seeks with. :mod:`bandready.scoring.answers` is the **marker**, shared with
reading. This package is the **teacher**, and everything in it is importable without a
running server so the rules can be tested as rules.

Listening teaches differently from every other module, and the difference decides the
whole design. Speaking and writing teach through band-graded model answers because the
learner produces language. Reading teaches through worked solutions because the text
stays on the page and can be re-read. **Listening's audio plays once and then it is
gone**, so a worked solution that says "the answer was at line 34" is a post-mortem: the
learner already knows they missed line 34. What they do not know is why their ear did not
stop there.

So the payload here is a **timeline**, not a location — the four moments around every
answer plus a fifth axis that has no equivalent in reading at all:

    BEFORE        prediction   what class of thing can fill this gap
    APPROACH      signpost     the discourse marker that announced it
    THE MOMENT    answer_quote + distraction — the decoy, and the three seconds it cost
    AFTER         recovery     the next handhold, if this one is already lost
    ────────────  form         heard right, written wrong. Counted apart, always.

* :mod:`~bandready.listening.coach` reads the authored teaching payload out of
  ``listening_scripts.script_json`` and decides who may see what. Its single rule: **the
  transcript and everything anchored to it are never returned for a script the learner
  has not attempted.** In listening the transcript *is* the answer key — every keyed
  answer is a verbatim span of it — so leaking it before an attempt does not merely spoil
  one question, it spends the whole part, and a part can only be sat once.
* :mod:`~bandready.listening.mock` runs one sitting — four parts, forty questions, audio
  once, then the check window — and holds the coach shut for its duration.
* :mod:`~bandready.listening.drills` builds and grades the practice kinds the review step
  feeds, all of them seeded from content that already exists and none of them needing new
  audio.

The coupling runs one way only: ``mock`` imports ``coach`` at module level, ``coach``
imports ``mock`` lazily inside the handful of functions that have to ask whether a
sitting is open. Nothing is imported here, so one half-finished module never stops the
other from loading.
"""

from __future__ import annotations

__all__ = ["coach", "drills", "mock"]
