"""Audio rendering for the Listening module (07-listening-module.md §3).

Two halves, deliberately separated so the maths is testable without a TTS engine:

* :mod:`bandready.audio.stitch` — pure numpy/soundfile concatenation, silence insertion,
  resampling and loudness normalisation. **No ffmpeg / pydub**: shelling out to an
  external binary is a packaging liability (13-packaging-distribution.md), so the
  stitcher owns the sample maths itself.
* :mod:`bandready.audio.tts_render` — voice resolution (role x accent), per-line synthesis
  against the configured TTS provider, caching by content hash, and the
  ``listening_render`` job body.

Import the submodules directly::

    from bandready.audio import stitch, tts_render

Nothing is re-exported here on purpose: a package-level ``stitch`` name would shadow the
``bandready.audio.stitch`` module for every later importer. Nothing in this package
touches HTTP — :mod:`bandready.server.routes.listening` is the only caller that knows
about requests.
"""

from __future__ import annotations

__all__: list[str] = []
