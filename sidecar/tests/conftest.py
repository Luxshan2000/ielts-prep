"""Suite-wide defaults that keep tests independent of the machine they run on."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True, scope="session")
def _no_local_model_adoption() -> None:
    """Never adopt the developer's real Kokoro/Whisper caches during tests.

    Startup opportunistically hard-links weights it finds in ``~/.cache`` (see
    ``bandready.models_local``). That is right for users on a slow connection and
    wrong for tests: it makes assertions like "a fresh install has no models" pass or
    fail depending on what this particular machine happens to have downloaded.

    ``tests/test_models_local.py`` exercises adoption directly against a sandboxed
    fake home, so nothing is left uncovered by switching it off here.
    """
    import os

    os.environ["BANDREADY_ADOPT_LOCAL_MODELS"] = "0"
