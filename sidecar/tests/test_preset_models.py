"""Every model a learner can pick is one we have actually pointed the app at.

The model field falls back to free text when it has no options, and a free-text model field is
a trap: somebody types a plausible id, the call 404s deep inside a provider, and the failure
surfaces three screens away as "the practice engine reported an error". That exact confusion
already cost a debugging session in this repo once.

So a preset that serves a modality owes that modality a list. And a preset that serves three
owes three *different* lists — offering the chat models in the speech-to-text dropdown is how
somebody ends up trying to transcribe with a chat model and cannot see why it fails.

The lists are curated, not mirrored. A provider adding a model does not silently add it here,
which is the whole point: the set of things that can be chosen is the set of things that work.
"""

from __future__ import annotations

import pytest

from bandready.providers.presets import OPENROUTER_MODELS, PRESETS

MULTI_MODALITY = [p for p in PRESETS if len(p.get("modalities", [])) > 1 and p.get("kind") == "cloud"]


def _by_id(preset_id: str) -> dict:
    return next(p for p in PRESETS if p["id"] == preset_id)


# ======================================================================================
# A dropdown for every modality a preset claims
# ======================================================================================


#: The one preset that must NOT have a curated list. It exists to point at an endpoint this
#: app has never seen — a self-hosted vLLM, a company gateway — so a closed dropdown would
#: make it useless. Free text is the correct answer here and nowhere else.
OPEN_ENDED = {"custom_openai"}


@pytest.mark.parametrize("preset", MULTI_MODALITY, ids=lambda p: str(p["id"]))
def test_a_cloud_preset_offers_models_for_each_modality_it_claims(preset: dict) -> None:
    lists = preset.get("models_by_modality")
    if preset["id"] in OPEN_ENDED:
        assert lists is None, (
            f"{preset['id']} is the point-at-anything escape hatch; a closed dropdown would "
            "defeat it"
        )
        return
    assert lists is not None, f"{preset['id']} has no curated lists, so its field is free text"
    for modality in preset["modalities"]:
        assert lists.get(modality), (
            f"{preset['id']} claims {modality} but offers no models for it, so the field "
            "falls back to free text"
        )


def test_the_three_lists_are_genuinely_different() -> None:
    """If they were the same list the per-modality machinery would be decoration."""
    assert OPENROUTER_MODELS["llm"] != OPENROUTER_MODELS["stt"]
    assert OPENROUTER_MODELS["stt"] != OPENROUTER_MODELS["tts"]


def test_no_chat_model_leaks_into_the_speech_lists() -> None:
    """The specific mistake this exists to prevent."""
    for lists in (OPENROUTER_MODELS,):
        chat = set(lists["llm"])
        assert chat.isdisjoint(lists["stt"])
        assert chat.isdisjoint(lists["tts"])


# ======================================================================================
# The models themselves
# ======================================================================================


def test_openrouter_offers_whisper_and_the_qwen_recogniser() -> None:
    """Both were asked for by name, and both are in the live catalogue."""
    stt = OPENROUTER_MODELS["stt"]
    assert any("whisper" in m for m in stt)
    assert any("qwen3-asr" in m for m in stt)


def test_openrouter_ids_carry_their_vendor_prefix() -> None:
    """OpenRouter namespaces every id, and a bare "whisper-1" 404s there.

    This mattered more when OpenAI was also a preset and the two spellings sat side by side.
    It still matters: anyone reading an OpenAI tutorial will copy the bare id.
    """
    for models in OPENROUTER_MODELS.values():
        for model in models:
            assert "/" in model, f"{model} is missing its vendor prefix"




def test_every_curated_id_is_a_plausible_non_empty_string() -> None:
    for lists in (OPENROUTER_MODELS,):
        for models in lists.values():
            assert models, "an empty list is the free-text trap again"
            assert len(set(models)) == len(models), "a duplicate would render twice"
            for model in models:
                assert model.strip() == model and model


def test_openrouter_is_the_only_remote_provider() -> None:
    """The simplification, pinned.

    OpenRouter serves chat, transcription and speech from one key, so OpenAI, Groq and
    DeepSeek bought nothing but a longer list and one more decision for somebody who is here
    to practise English. custom_openai went too: a point-at-anything escape hatch is a
    free-text model field wearing a coat, and this app now offers three jobs each choosing
    between one remote provider and one local engine.
    """
    cloud = {p["id"] for p in PRESETS if p.get("kind") == "cloud"}
    assert cloud == {"openrouter"}


def test_no_provider_is_offered_that_is_not_installed() -> None:
    """mlx_whisper was selectable and absent, and it broke speech-to-text silently.

    `pron/analyze.py` reads the configured model id and hands it to faster-whisper. An MLX
    repository id can never load there, both attempts fail, and the failure is cached in a
    module-level flag for the life of the process, so every later recording comes back
    unrecognised with nothing on screen naming the cause.
    """
    assert not any(p["id"] == "mlx_whisper" for p in PRESETS)
    local = {p["id"] for p in PRESETS if str(p.get("kind", "")).startswith("local")}
    assert local == {"ollama", "faster_whisper", "kokoro"}


def test_thinking_and_listening_can_be_answered_locally_or_remotely() -> None:
    """The examiner and speech-to-text are each chosen on their own.

    A learner may send marking to OpenRouter and keep transcription on the machine, or the
    reverse. That only works while neither has a single possible answer.
    """
    for modality in ("llm", "stt"):
        serving = [p for p in PRESETS if modality in p.get("modalities", [])
                   and not str(p["id"]).startswith("mock")]
        kinds = {"remote" if p.get("kind") == "cloud" else "local" for p in serving}
        assert kinds == {"local", "remote"}, f"{modality} cannot be answered both ways"


def test_the_voice_is_local_only_in_this_release() -> None:
    """Deliberate, and the deliberateness is the point.

    Listening audio is exam content, not a per-user preference: it should sound the same for
    every learner, with the accents the papers were written for, and a voice inventory that
    varies by provider cannot promise that. Kokoro being Apache-2.0 is what will make a shared
    pre-rendered pack redistributable later.

    If a remote voice is ever offered again, it needs an `engine` on the preset. Without one
    the dispatch falls through to whatever engine the slot already held, which is how choosing
    a cloud voice used to synthesize locally while the screen claimed otherwise.
    """
    serving = [p for p in PRESETS if "tts" in p.get("modalities", [])
               and not str(p["id"]).startswith("mock")]
    assert [p["id"] for p in serving] == ["kokoro"]
    assert all(p.get("kind") != "cloud" for p in serving)


def test_one_recommendation_per_job_and_all_are_namespaced() -> None:
    """The picker needs a good default, which is a different thing from an inventory."""
    from bandready.providers.presets import RECOMMENDED_OPENROUTER

    assert set(RECOMMENDED_OPENROUTER) == {"llm", "stt", "tts"}
    for model in RECOMMENDED_OPENROUTER.values():
        assert "/" in model, f"{model} is missing its vendor prefix"


def test_the_local_engines_all_survived() -> None:
    """'OpenRouter or local' means local has to still be a real option."""
    local = {p["id"] for p in PRESETS if str(p.get("kind", "")).startswith("local")}
    assert {"ollama", "faster_whisper", "kokoro"} <= local


# ======================================================================================
# What a remote transcript cannot do
# ======================================================================================


def test_openrouter_says_pronunciation_still_needs_local_whisper() -> None:
    """A remote transcript carries no per-word confidence.

    `pron.score_from_confidence` reads faster-whisper's per-word `probability`. Nothing in an
    OpenAI-shaped transcription response carries it, so a learner who routes speech-to-text
    through OpenRouter still needs the local model for pronunciation. Saying that in the
    preset is cheaper than letting them discover it from an empty screen.
    """
    notes = str(_by_id("openrouter").get("notes", "")).lower()
    assert "pronunciation" in notes
    assert "local" in notes


def test_openrouter_serves_the_two_jobs_that_are_a_preference() -> None:
    """Marking and transcription, not the voice. See the local-only test above for why."""
    assert set(_by_id("openrouter")["modalities"]) == {"llm", "stt"}
