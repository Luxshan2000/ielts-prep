"""The arithmetic that makes "past is past" automatic.

The owner's requirement, in their words: *"when people choose the provider via settings
page then based on it only the listen page should generate prepare audio … by default the
new generation for speaking or whatever listens to it. past is past."*

Three properties have to hold together, and each one alone is a shipped bug:

1. **Switching the provider changes what gets generated.** Asserted by value — the same
   script under two TTS configurations produces two different render hashes *and* two
   different per-line cache keys. Re-keying only the render is not enough: Kokoro's voice
   ids are engine-independent, so every line would still hit ``media/tts-lines/`` and the
   "new" render would be the old provider's audio stitched again under a new name.
2. **Nobody on the shipped default loses a render.** The legacy default digests to ``""``
   and the term is omitted, so a default install's hashes are the ones already on disk.
   Pinned by golden value, because a docstring cannot fail.
3. **A stored ``engine`` never outranks the preset.** That single inversion is why
   choosing OpenRouter for text-to-speech kept running local Kokoro on a *cold* cache —
   no amount of cache-key work would have fixed it.

Everything here runs with no TTS engine and no network.
"""

from __future__ import annotations

import asyncio
import copy
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from bandready import settings_store
from bandready.audio import tts_render
from bandready.config import reset_settings_cache
from bandready.providers import transport

# --------------------------------------------------------------------------------------
# Fixtures and fixtures-shaped data
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    directory = tmp_path_factory.mktemp("bandready-tts-identity")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(directory))
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        reset_settings_cache()
        settings_store.invalidate_cache()
        try:
            yield directory
        finally:
            reset_settings_cache()
            settings_store.invalidate_cache()


def default_tts() -> dict[str, Any]:
    """The shipped TTS slot, straight out of the defaults — no live settings involved."""
    return copy.deepcopy(settings_store.DEFAULT_SETTINGS["tts"])


def openrouter_tts() -> dict[str, Any]:
    """What Settings writes when a learner picks OpenRouter for the voice."""
    return {
        "preset": "openrouter",
        "engine": "openai_compat",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": "sk-or-secret",
        "model": "deepgram/aura-2",
        "voice": "af_heart",
        "speed": 1.0,
    }


SCRIPT: dict[str, Any] = {
    "schema_version": 1,
    "accent_set": "uk",
    "speakers": [{"id": "narrator", "role": "narrator"}],
    "lines": [
        {
            "speaker": "narrator",
            "text": "Good morning, and welcome to the library.",
            "pause_after_ms": 300,
        }
    ],
}

#: The hash this one-line British script had **before** provider identity existed. It is
#: written out rather than computed so that a change to the payload shape cannot quietly
#: agree with itself: if this value moves, every listening render on every default install
#: is orphaned, and that must be a deliberate act (a RENDER_GENERATION bump), never a
#: side effect of editing the hash function.
GOLDEN_SCRIPT_HASH = "f8ac90cc9f379453"
GOLDEN_LINE_KEY = "050c88a19fbff63371b9863e"


# --------------------------------------------------------------------------------------
# 1. The one that matters: switching provider changes what gets generated
# --------------------------------------------------------------------------------------

def test_switching_the_tts_provider_changes_what_gets_generated(data_dir: Path) -> None:
    """Same script, two providers, two keys — at **both** cache layers.

    This is the whole requirement in one assertion. Before it, rendering a part with local
    Kokoro and then choosing OpenRouter in Settings left the hash untouched: ``cached_render``
    hit, the library said "audio ready", and the app served Kokoro audio forever.
    """
    local = tts_render.script_audio_hash(SCRIPT, "uk", config=default_tts())
    remote = tts_render.script_audio_hash(SCRIPT, "uk", config=openrouter_tts())
    assert local != remote

    local_line = tts_render.line_cache_key(
        "bm_george", "Good morning, and welcome to the library.", 1.0, config=default_tts()
    )
    remote_line = tts_render.line_cache_key(
        "bm_george", "Good morning, and welcome to the library.", 1.0, config=openrouter_tts()
    )
    # Without this half, the re-keyed render is the old provider's audio, re-stitched.
    assert local_line != remote_line


def test_the_mock_provider_is_a_provider_too(data_dir: Path) -> None:
    """Silence is not Kokoro. A test seam that shared keys with the real engine would let
    a mock render satisfy a real one and vice versa."""
    mock = {"preset": "mock_tts", "engine": "mock", "base_url": "mock://tts"}
    assert tts_render.script_audio_hash(SCRIPT, "uk", config=mock) != (
        tts_render.script_audio_hash(SCRIPT, "uk", config=default_tts())
    )


# --------------------------------------------------------------------------------------
# 2. Nobody on the default loses a render
# --------------------------------------------------------------------------------------

def test_the_shipped_default_has_an_empty_identity(data_dir: Path) -> None:
    assert transport.provider_identity(default_tts(), "tts") == ""
    assert transport.is_legacy_default(default_tts(), "tts") is True
    assert transport.provider_identity(settings_store.DEFAULT_SETTINGS["stt"], "stt") == ""


def test_the_default_hashes_are_byte_identical_to_the_ones_on_disk(data_dir: Path) -> None:
    """The upgrade is free for everyone who never changed provider."""
    assert tts_render.script_audio_hash(SCRIPT, "uk", config=default_tts()) == (
        GOLDEN_SCRIPT_HASH
    )
    assert (
        tts_render.line_cache_key(
            "bm_george",
            "Good morning, and welcome to the library.",
            1.0,
            config=default_tts(),
        )
        == GOLDEN_LINE_KEY
    )


def test_a_provider_other_than_the_default_actually_moves_the_hash(data_dir: Path) -> None:
    assert tts_render.script_audio_hash(SCRIPT, "uk", config=openrouter_tts()) != (
        GOLDEN_SCRIPT_HASH
    )


# --------------------------------------------------------------------------------------
# 3. What the identity folds in — and, just as deliberately, what it does not
# --------------------------------------------------------------------------------------

def test_rotating_an_api_key_costs_nothing(data_dir: Path) -> None:
    """A key rotation must never discard every WAV on disk."""
    rotated = {**openrouter_tts(), "api_key": "sk-or-a-brand-new-key"}
    assert transport.provider_identity(rotated, "tts") == transport.provider_identity(
        openrouter_tts(), "tts"
    )


def test_labels_params_and_timeouts_are_not_part_of_the_identity(data_dir: Path) -> None:
    noisy = {
        **openrouter_tts(),
        "label": "My cloud voice",
        "params": {"temperature": 0.1, "timeout_s": 5.0, "max_retries": 9},
        "voice": "bm_lewis",  # listening voices come from VOICE_MAP, never from the slot
    }
    assert transport.provider_identity(noisy, "tts") == transport.provider_identity(
        openrouter_tts(), "tts"
    )


def test_moving_the_data_directory_invalidates_nothing(data_dir: Path) -> None:
    """Only the weight **basenames** are folded in, never the absolute path."""
    here = {
        **default_tts(),
        "model_path": "/Users/a/Library/models/kokoro/kokoro-v1.0.onnx",
        "voices_path": "/Users/a/Library/models/kokoro/voices-v1.0.bin",
    }
    there = {
        **default_tts(),
        "model_path": "/Volumes/External/br/models/kokoro/kokoro-v1.0.onnx",
        "voices_path": "/Volumes/External/br/models/kokoro/voices-v1.0.bin",
    }
    assert transport.identity_fields(here, "tts") == transport.identity_fields(there, "tts")
    # And an explicit default path is still the default: identity stays empty.
    assert transport.provider_identity(here, "tts") == ""


def test_different_kokoro_weights_re_key(data_dir: Path) -> None:
    upgraded = {**default_tts(), "model_path": "/m/kokoro/kokoro-v1.1.onnx"}
    assert transport.provider_identity(upgraded, "tts") != ""
    assert tts_render.script_audio_hash(SCRIPT, "uk", config=upgraded) != GOLDEN_SCRIPT_HASH


def test_the_speed_slider_re_keys_the_stitched_render(data_dir: Path) -> None:
    """The second-order bug: ``speed`` was in ``line_cache_key`` and absent from
    ``script_audio_hash``, so moving the slider re-synthesized every line and then filed
    the result under the old render's name — where the old WAV was still sitting."""
    faster = {**default_tts(), "speed": 1.25}
    assert tts_render.script_audio_hash(SCRIPT, "uk", config=faster) != GOLDEN_SCRIPT_HASH
    assert transport.identity_fields(faster, "tts")["speed"] == "1.25"


def test_the_remote_endpoint_is_normalised_before_it_is_hashed(data_dir: Path) -> None:
    scruffy = {
        **openrouter_tts(),
        "base_url": "  https://OpenRouter.ai/api/v1/  ",
        "model": " deepgram/aura-2 ",
    }
    assert transport.provider_identity(scruffy, "tts") == transport.provider_identity(
        openrouter_tts(), "tts"
    )


def test_a_different_remote_model_re_keys(data_dir: Path) -> None:
    other = {**openrouter_tts(), "model": "openai/gpt-audio"}
    assert transport.provider_identity(other, "tts") != transport.provider_identity(
        openrouter_tts(), "tts"
    )


def test_a_different_remote_host_re_keys(data_dir: Path) -> None:
    other = {**openrouter_tts(), "preset": "custom_openai", "base_url": "http://localhost:8880/v1"}
    assert transport.provider_identity(other, "tts") != transport.provider_identity(
        openrouter_tts(), "tts"
    )


# --------------------------------------------------------------------------------------
# 4. resolve_engine — the order IS the fix
# --------------------------------------------------------------------------------------

def test_a_stored_engine_never_outranks_a_known_preset(data_dir: Path) -> None:
    """The exact document the frontend used to leave behind.

    ``applyPreset`` skips a falsy ``engine`` and ``PATCH`` deep-merges, so picking
    OpenRouter wrote ``{"preset": "openrouter", "engine": "kokoro_onnx"}`` — and every
    dispatch site read ``engine`` and ran the local model.
    """
    stale = {**openrouter_tts(), "engine": "kokoro_onnx"}
    assert transport.resolve_engine(stale, "tts") == "openai_compat"

    stale_stt = {"preset": "openrouter", "engine": "faster_whisper",
                 "base_url": "https://openrouter.ai/api/v1", "model": "deepgram/nova-3"}
    assert transport.resolve_engine(stale_stt, "stt") == "openai_compat"

    # And the other direction: a stale cloud engine on a local preset resolves local.
    assert transport.resolve_engine(
        {"preset": "kokoro", "engine": "openai_compat"}, "tts"
    ) == "kokoro_onnx"


def test_a_preset_id_we_do_not_ship_may_still_use_its_stored_engine(data_dir: Path) -> None:
    custom = {"preset": "my-own-endpoint", "engine": "openai_compat",
              "base_url": "http://127.0.0.1:8880/v1", "model": "kokoro"}
    assert transport.resolve_engine(custom, "tts") == "openai_compat"
    # No preset, no engine, but a base URL: an OpenAI-compatible endpoint.
    assert transport.resolve_engine({"base_url": "http://127.0.0.1:8880/v1"}, "tts") == (
        "openai_compat"
    )
    # Nothing at all falls back to the modality default, never to a crash.
    assert transport.resolve_engine({}, "tts") == "kokoro_onnx"
    assert transport.resolve_engine({}, "stt") == "faster_whisper"


def test_the_mock_seam_resolves_to_the_mock_engine(data_dir: Path) -> None:
    assert transport.resolve_engine({"preset": "mock_tts"}, "tts") == "mock"
    assert transport.resolve_engine({"preset": "mock_stt"}, "stt") == "mock"
    # A `mock://` base URL is how an override reaches the mock transport without a preset.
    assert transport.resolve_engine({"base_url": "mock://tts"}, "tts") == "mock"
    assert tts_render.is_mock_tts({"preset": "mock_tts"}) is True
    assert tts_render.is_mock_tts(default_tts()) is False


def test_an_unknown_modality_is_rejected_rather_than_guessed(data_dir: Path) -> None:
    with pytest.raises(ValueError):
        transport.resolve_engine(default_tts(), "ocr")


# --------------------------------------------------------------------------------------
# 5. Settings heals a document the frontend left behind — with no migration
# --------------------------------------------------------------------------------------

def test_validate_settings_re_derives_the_engine_from_the_preset(data_dir: Path) -> None:
    doc = settings_store.deep_merge(
        settings_store.DEFAULT_SETTINGS,
        {
            "tts": {"preset": "openrouter", "base_url": "https://openrouter.ai/api/v1",
                    "model": "deepgram/aura-2"},
            "stt": {"preset": "openrouter", "base_url": "https://openrouter.ai/api/v1",
                    "model": "deepgram/nova-3"},
        },
    )
    # The stale values the deep-merge preserved from the previous preset.
    assert doc["tts"]["engine"] == "kokoro_onnx"
    assert doc["stt"]["engine"] == "faster_whisper"

    healed = settings_store.validate_settings(doc)
    assert healed["tts"]["engine"] == "openai_compat"
    assert healed["stt"]["engine"] == "openai_compat"
    # llm has no engine field and must not grow one.
    assert "engine" not in healed["llm"]


def test_validate_settings_leaves_an_unknown_preset_alone(data_dir: Path) -> None:
    doc = settings_store.deep_merge(
        settings_store.DEFAULT_SETTINGS,
        {"tts": {"preset": "my-own-endpoint", "engine": "openai_compat",
                 "base_url": "http://127.0.0.1:8880/v1"}},
    )
    assert settings_store.validate_settings(doc)["tts"]["engine"] == "openai_compat"


def test_the_default_document_is_unchanged_by_derivation(data_dir: Path) -> None:
    healed = settings_store.validate_settings(copy.deepcopy(settings_store.DEFAULT_SETTINGS))
    assert healed["tts"]["engine"] == "kokoro_onnx"
    assert healed["stt"]["engine"] == "faster_whisper"


# --------------------------------------------------------------------------------------
# 6. Dispatch and the force escape hatch
# --------------------------------------------------------------------------------------

def test_synthesize_line_dispatches_on_the_resolved_engine(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The cold-cache half of the bug: a brand-new line went to the local engine too."""
    called: list[str] = []

    async def fake_openai(text: str, voice: str, cfg: Any) -> tuple[np.ndarray, int]:
        called.append("openai")
        return np.zeros(16, dtype=np.float32), 24000

    async def fake_kokoro(
        text: str, voice: str, cfg: Any, *, is_phonemes: bool = False
    ) -> tuple[np.ndarray, int]:
        called.append("kokoro")
        return np.zeros(16, dtype=np.float32), 24000

    monkeypatch.setattr(tts_render, "_synthesize_openai", fake_openai)
    monkeypatch.setattr(tts_render, "_synthesize_kokoro", fake_kokoro)

    stale = {**openrouter_tts(), "engine": "kokoro_onnx"}
    asyncio.run(tts_render.synthesize_line("hello", "bm_george", stale))
    assert called == ["openai"]

    asyncio.run(tts_render.synthesize_line("hello", "bm_george", default_tts()))
    assert called == ["openai", "kokoro"]


def test_force_reaches_the_line_cache(data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """``force`` used to skip only ``cached_render``, so the re-render was the *same*
    audio: every line still hit ``media/tts-lines/`` one layer down."""
    calls: list[str] = []
    real = tts_render.synthesize_line

    async def counting(*args: Any, **kwargs: Any) -> tuple[np.ndarray, int]:
        calls.append(args[0] if args else "")
        return await real(*args, **kwargs)

    monkeypatch.setattr(tts_render, "synthesize_line", counting)
    cfg = {"preset": "mock_tts", "engine": "mock", "base_url": "mock://tts"}

    first = asyncio.run(tts_render.render_script(SCRIPT, accent_set="uk", config=cfg))
    assert len(calls) == 1

    calls.clear()
    asyncio.run(tts_render.render_script(SCRIPT, accent_set="uk", config=cfg))
    assert calls == []  # the whole render was cached

    calls.clear()
    forced = asyncio.run(
        tts_render.render_script(SCRIPT, accent_set="uk", config=cfg, force=True)
    )
    assert len(calls) == 1  # the line cache was bypassed, not just the render cache
    assert forced["audio_hash"] == first["audio_hash"]

    # A forced render still *writes* the line cache, so the next one is warm again.
    calls.clear()
    asyncio.run(tts_render.render_script(SCRIPT, accent_set="uk", config=cfg))
    assert calls == []


def test_a_render_is_filed_under_the_config_it_was_rendered_with(data_dir: Path) -> None:
    """``config`` is an override; hashing against the live slot while synthesizing with
    the override would file the override's audio under the live slot's name."""
    cfg = {"preset": "mock_tts", "engine": "mock", "base_url": "mock://tts"}
    result = asyncio.run(tts_render.render_script(SCRIPT, accent_set="uk", config=cfg))
    assert result["audio_hash"] == tts_render.script_audio_hash(SCRIPT, "uk", config=cfg)
    assert result["audio_hash"] != GOLDEN_SCRIPT_HASH


def test_an_unreadable_settings_document_never_moves_a_hash(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A transient settings failure must not orphan every WAV on disk."""

    def boom(modality: str) -> dict[str, Any]:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(settings_store, "get_slot", boom)
    assert transport.slot_identity("tts") == ""
    assert tts_render.script_audio_hash(SCRIPT, "uk") == GOLDEN_SCRIPT_HASH
