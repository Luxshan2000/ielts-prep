"""Nothing outside the listening renderer may hold a provider longer than one request.

The owner's requirement is one sentence — "the whole app should listen to the settings"
— and the failures that break it are all the same shape: something captured a provider
once and kept answering from that capture. A module-level Whisper model captured on the
first call. A `_no_json_mode` memo keyed by base_url that never cleared. Three dispatch
sites with three different rules for "which engine is this". A reference-audio cache key
made of voice and text and nothing else, so the bytes on disk could not be told apart
from the bytes a different engine would have produced.

The test this file exists for is
:func:`test_switching_the_tts_provider_changes_the_reference_audio_key` — asserted by
**value**: same script, two TTS configs, two different keys. Everything else here guards
one of the ways that guarantee used to leak.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Self

import pytest

from bandready.pron import analyze as pron
from bandready.providers import transport

# ======================================================================================
# The one that matters: switching the TTS provider changes what gets generated
# ======================================================================================

KOKORO: dict[str, Any] = {"preset": "kokoro", "voice": "bf_emma", "speed": 1.0}
OPENROUTER: dict[str, Any] = {
    "preset": "openrouter",
    "voice": "bf_emma",
    "speed": 1.0,
    "base_url": "https://openrouter.ai/api/v1",
    "model": "openai/tts-1",
    # The stale field that used to win. The whole point of resolve_engine is that it does not.
    "engine": "kokoro_onnx",
}

PHRASE = "The ferry leaves at a quarter past four."


def test_switching_the_tts_provider_changes_the_reference_audio_key() -> None:
    """Same phrase, same voice, two providers — two distinct cache keys.

    Asserted by value rather than by reading the code, because the defect this replaces
    was invisible to inspection: `pron/ref/<voice>/<sha1(text)>.wav` looks like a fine
    cache key right up until you notice it cannot express *which engine spoke*.
    """
    local = pron.reference_rel_path("bf_emma", PHRASE, KOKORO)
    remote = pron.reference_rel_path("bf_emma", PHRASE, OPENROUTER)

    assert local != remote, (
        "a Kokoro render and an OpenRouter render of the same line share a path — "
        "the second provider would be served the first provider's audio forever"
    )
    # Both still address the same voice and the same text: only the provider term moved.
    assert local.startswith("pron/ref/bf_emma/")
    assert remote.startswith("pron/ref/bf_emma/")
    assert local.endswith(".wav") and remote.endswith(".wav")


def test_the_media_files_hash_moves_with_the_path() -> None:
    """A row that outlived its file is how a purge comes to lie about what it removed."""
    assert pron.reference_media_hash("bf_emma", PHRASE, KOKORO) != pron.reference_media_hash(
        "bf_emma", PHRASE, OPENROUTER
    )


def test_two_different_remote_models_are_two_different_renders() -> None:
    """`tts-1` and `tts-1-hd` on one endpoint are different voices, not one cached voice."""
    hd = dict(OPENROUTER, model="openai/tts-1-hd")
    assert pron.reference_rel_path("bf_emma", PHRASE, OPENROUTER) != pron.reference_rel_path(
        "bf_emma", PHRASE, hd
    )


def test_rotating_the_api_key_costs_nothing() -> None:
    """A credential is not an audio parameter. Rotating one must not re-render the disk."""
    rotated = dict(OPENROUTER, api_key="sk-or-brand-new")
    assert pron.reference_rel_path("bf_emma", PHRASE, OPENROUTER) == pron.reference_rel_path(
        "bf_emma", PHRASE, rotated
    )


def test_the_shipped_default_keeps_one_stable_name() -> None:
    """Past is past: an install that never changed provider gets no identity term at all."""
    default = pron.reference_rel_path("bf_emma", PHRASE, KOKORO)
    from bandready.audio.tts_render import RENDER_GENERATION

    assert default.endswith(f"-{RENDER_GENERATION}.wav"), (
        f"the legacy default grew an identity suffix ({default}) — every existing "
        "reference clip on every install would be orphaned for no audible difference"
    )


def test_changing_the_voice_still_changes_the_key() -> None:
    """The pre-existing guarantee, pinned so the new terms cannot swallow it."""
    assert pron.reference_rel_path("bf_emma", PHRASE, KOKORO) != pron.reference_rel_path(
        "bm_george", PHRASE, KOKORO
    )


# ======================================================================================
# The dispatch rule: one resolver, and a stale `engine` never outranks the preset
# ======================================================================================


def test_a_stale_engine_field_does_not_outrank_the_openrouter_preset() -> None:
    """The original bug, at its source.

    Choosing OpenRouter left `{"preset": "openrouter", "engine": "kokoro_onnx"}` behind,
    and every dispatch site read `engine`. This is the assertion that stops it coming back.
    """
    assert transport.resolve_engine(OPENROUTER, "tts") == "openai_compat"
    assert transport.resolve_engine(dict(OPENROUTER, engine="faster_whisper"), "stt") == (
        "openai_compat"
    )


def test_the_local_presets_still_resolve_local() -> None:
    assert transport.resolve_engine(KOKORO, "tts") == "kokoro_onnx"
    assert transport.resolve_engine({"preset": "faster_whisper"}, "stt") == "faster_whisper"


# ======================================================================================
# The live speaking pipeline asks the same resolver
# ======================================================================================


def test_the_live_session_builds_a_remote_tts_for_a_remote_preset() -> None:
    """`build_tts_service` used to match `engine` against a local allow-list of its own."""
    pipeline = pytest.importorskip("bandready.voice.pipeline")
    if not pipeline.pipecat_available():  # pragma: no cover — voice extra is optional
        pytest.skip("the voice extra is not installed")

    service = pipeline.build_tts_service(dict(OPENROUTER))
    assert "openai" in type(service).__name__.lower(), (
        f"OpenRouter text-to-speech built {type(service).__name__} — the live session "
        "would speak in the local voice while Settings showed the cloud one"
    )


def test_the_live_session_builds_a_remote_stt_for_a_remote_preset() -> None:
    pipeline = pytest.importorskip("bandready.voice.pipeline")
    if not pipeline.pipecat_available():  # pragma: no cover
        pytest.skip("the voice extra is not installed")

    service = pipeline.build_stt_service(
        {
            "preset": "openrouter",
            "engine": "faster_whisper",  # stale, and must lose
            "base_url": "https://openrouter.ai/api/v1",
            "model": "whisper-1",
        }
    )
    assert "openai" in type(service).__name__.lower()


def test_an_unrecognised_whisper_model_is_named_not_swallowed() -> None:
    """`getattr(Model, name, Model.BASE)` turned a typo into a convincing wrong answer."""
    pipeline = pytest.importorskip("bandready.voice.pipeline")
    if not pipeline.pipecat_available():  # pragma: no cover
        pytest.skip("the voice extra is not installed")

    from bandready.server.errors import ApiError

    with pytest.raises(ApiError) as caught:
        pipeline.build_stt_service({"preset": "faster_whisper", "model": "large-v9-turbo"})

    assert caught.value.status == 422
    assert "large-v9-turbo" in str(caught.value.detail), (
        "the error has to name the model that was not recognised — otherwise it is only "
        "marginally better than the silent whisper-base default it replaced"
    )


# ======================================================================================
# The local Whisper singleton is keyed on its configuration
# ======================================================================================


def test_the_whisper_cache_key_carries_every_field_that_picks_a_model() -> None:
    base = {"engine": "faster_whisper", "model": "base", "device": "auto", "compute_type": "int8"}
    assert pron._whisper_key(base) == ("faster_whisper", "base", "auto", "int8")

    # Each of the four alone must move the key: device and compute_type were hardcoded,
    # so changing either did nothing at all until the process restarted.
    for field, value in (
        ("model", "large-v3-turbo"),
        ("device", "cpu"),
        ("compute_type", "float16"),
        ("engine", "openai_compat"),
    ):
        assert pron._whisper_key(dict(base, **{field: value})) != pron._whisper_key(base), (
            f"changing {field} does not change which cached model is returned"
        )


def test_changing_the_whisper_model_returns_the_new_model_not_the_cached_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The singleton captured the model on the FIRST call for the process lifetime."""
    pron.reset_whisper_cache()
    built: list[tuple[str, str, str]] = []

    class _FakeWhisper:
        def __init__(self, size: str, device: str, compute_type: str, local_files_only: bool):
            built.append((size, device, compute_type))
            self.size = size

    module = type(pron)("faster_whisper")
    module.WhisperModel = _FakeWhisper  # type: ignore[attr-defined]
    monkeypatch.setitem(__import__("sys").modules, "faster_whisper", module)

    first = pron._load_whisper({"model": "base", "device": "auto", "compute_type": "int8"})
    second = pron._load_whisper({"model": "large-v3", "device": "cpu", "compute_type": "float16"})

    assert first is not None and second is not None
    assert first.size == "base"
    assert second.size == "large-v3", (
        "the second configuration was served the first one's model — a learner who "
        "changes Whisper model sees no difference until they restart the app"
    )
    assert built == [("base", "auto", "int8"), ("large-v3", "cpu", "float16")], (
        "device and compute_type are real settings fields and must reach the constructor"
    )

    # And the first configuration is still cached, not rebuilt.
    assert pron._load_whisper({"model": "base", "device": "auto", "compute_type": "int8"}) is first
    assert len(built) == 2

    pron.reset_whisper_cache()


def test_a_failed_load_is_memoised_per_configuration_not_for_the_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A latched failure meant a corrected setting was never retried."""
    pron.reset_whisper_cache()

    class _OnlyBaseWorks:
        def __init__(self, size: str, device: str, compute_type: str, local_files_only: bool):
            if size != "base":
                raise RuntimeError(f"no local weights for {size}")
            self.size = size

    module = type(pron)("faster_whisper")
    module.WhisperModel = _OnlyBaseWorks  # type: ignore[attr-defined]
    monkeypatch.setitem(__import__("sys").modules, "faster_whisper", module)

    assert pron._load_whisper({"model": "large-v3"}) is None
    recovered = pron._load_whisper({"model": "base"})
    assert recovered is not None and recovered.size == "base", (
        "one bad model name disabled local transcription for the whole process"
    )

    pron.reset_whisper_cache()


def test_word_timings_no_longer_import_a_module_that_has_never_existed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`bandready.providers.stt` was the sole 'provider dispatch' for six routes.

    It does not exist, so the import failed on every call and the debug log said so. Dead
    code that looks like a feature is worse than no feature: it is why nobody noticed
    pronunciation never consults Settings.
    """
    import importlib

    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("bandready.providers.stt")

    source = Path(pron.__file__).read_text(encoding="utf-8")
    assert "providers.stt" not in source, (
        "analyze.py still reaches for a module that has never existed"
    )


# ======================================================================================
# The JSON-mode memo
# ======================================================================================


def test_one_model_rejecting_json_mode_does_not_disable_it_for_the_others() -> None:
    """The memo was keyed by base_url, so one 400 covered every model on that server."""
    from bandready.providers import llm

    llm.invalidate_json_mode_memo()
    try:
        llm._no_json_mode.add(("http://127.0.0.1:11434/v1", "llama3.1:8b"))
        assert ("http://127.0.0.1:11434/v1", "qwen3:14b") not in llm._no_json_mode, (
            "a second model on the same Ollama server inherited the first one's failure"
        )
    finally:
        llm.invalidate_json_mode_memo()


def test_saving_settings_forgets_which_models_rejected_json_mode() -> None:
    from bandready.providers import llm

    llm._no_json_mode.add(("http://127.0.0.1:11434/v1", "llama3.1:8b"))
    llm.invalidate_json_mode_memo()
    assert llm._no_json_mode == set()


# ======================================================================================
# The capability endpoints tell the truth
# ======================================================================================


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    from fastapi.testclient import TestClient

    from bandready import settings_store
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", "test-token")
    reset_settings_cache()
    db_engine.reset_engine()
    settings_store.invalidate_cache()

    from bandready.server.app import create_app

    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        test_client.headers.update({"Authorization": "Bearer test-token"})
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def test_speech_capabilities_names_the_jobs_that_ignore_the_stt_setting(client: Any) -> None:
    """The only place a learner can be told their choice is not used everywhere."""
    from bandready import settings_store

    settings_store.patch_settings(
        {
            "stt": {
                "preset": "openrouter",
                "base_url": "https://openrouter.ai/api/v1",
                "model": "whisper-1",
            }
        }
    )

    body = client.get("/api/v1/speech/capabilities").json()
    jobs = {job["job"]: job for job in body["jobs"]}

    assert jobs["pronunciation"]["engine"] == "faster_whisper"
    assert jobs["pronunciation"]["honours_setting"] is False
    assert jobs["transcribe_answer"]["honours_setting"] is False
    assert jobs["pronunciation"]["local"] is True

    # And the one job that does follow the setting says so, with the resolved engine.
    assert jobs["live_session"]["engine"] == "openai_compat"
    assert jobs["live_session"]["honours_setting"] is True

    assert "local Whisper" in body["local_only_note"]


def test_the_speaking_preflight_reports_the_tts_provider_that_will_run(client: Any) -> None:
    from bandready import settings_store

    settings_store.patch_settings(
        {
            "tts": {
                "preset": "openrouter",
                "engine": "kokoro_onnx",  # stale; the preset must win
                "base_url": "https://openrouter.ai/api/v1",
                "model": "openai/tts-1",
            }
        }
    )

    body = client.get("/api/v1/speaking/engine").json()
    tts = {job["job"]: job for job in body["providers"]["tts"]}
    assert tts["live_session"]["engine"] == "openai_compat"
    assert tts["listening_render"]["engine"] == "openai_compat"
    assert tts["live_session"]["local"] is False
    assert "local Whisper" in body["local_only_note"]


def test_the_preflight_reports_local_when_the_learner_stays_local(client: Any) -> None:
    from bandready import settings_store

    settings_store.patch_settings({"tts": {"preset": "kokoro", "voice": "af_heart"}})
    body = client.get("/api/v1/speaking/engine").json()
    tts = {job["job"]: job for job in body["providers"]["tts"]}
    assert tts["live_session"]["engine"] == "kokoro_onnx"
    assert tts["live_session"]["local"] is True


# ======================================================================================
# The TTS preview answers the same question before and after a save
# ======================================================================================


def test_the_preview_takes_the_same_branch_on_a_draft_and_on_a_saved_config(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """This is the mechanism that convinced a learner the switch had worked.

    The old rule was `engine == "openai_compat" or (base_url and not engine)`. An unsaved
    draft carries no stored `engine`, so it took the remote branch; the moment the same
    config was saved a stale `engine` appeared and it took the local branch. The preview
    therefore proved the switch at exactly the moment the switch had not happened.
    """
    calls: list[str] = []

    class _FakeResponse:
        status_code = 200
        content = b"RIFF....WAVEfake"

    class _FakeClient:
        def __init__(self, *a: Any, **k: Any) -> None: ...

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, *a: object) -> None: ...

        async def post(self, url: str, **kwargs: Any) -> _FakeResponse:
            calls.append(url)
            return _FakeResponse()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    draft = {
        "preset": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "openai/tts-1",
        "voice": "alloy",
    }
    saved = dict(draft, engine="kokoro_onnx")  # what a PATCH deep-merge actually leaves

    for config in (draft, saved):
        response = client.post(
            "/api/v1/providers/tts-preview", json={"config": config, "text": "one two three"}
        )
        assert response.status_code == 200, response.text

    assert len(calls) == 2, (
        "the saved config took the local branch — the preview would sound like Kokoro "
        "for a learner who had already switched to OpenRouter"
    )
    assert all(url.endswith("/audio/speech") for url in calls)


# ======================================================================================
# The identity is JSON-stable, so keys survive a restart
# ======================================================================================


def test_the_identity_is_stable_across_calls_and_dict_order() -> None:
    """A key that depended on dict iteration order would orphan audio at random."""
    reordered = {key: OPENROUTER[key] for key in reversed(list(OPENROUTER))}
    assert transport.provider_identity(OPENROUTER, "tts") == transport.provider_identity(
        reordered, "tts"
    )
    assert json.dumps(transport.identity_fields(OPENROUTER, "tts"), sort_keys=True)
