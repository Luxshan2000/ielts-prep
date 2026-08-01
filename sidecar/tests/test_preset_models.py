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

from bandready.providers.presets import OPENAI_MODELS, OPENROUTER_MODELS, PRESETS

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
    for lists in (OPENROUTER_MODELS, OPENAI_MODELS):
        assert lists["llm"] != lists["stt"]
        assert lists["stt"] != lists["tts"]


def test_no_chat_model_leaks_into_the_speech_lists() -> None:
    """The specific mistake this exists to prevent."""
    for lists in (OPENROUTER_MODELS, OPENAI_MODELS):
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
    """OpenRouter namespaces every id; a bare "whisper-1" 404s there and works on OpenAI."""
    for models in OPENROUTER_MODELS.values():
        for model in models:
            assert "/" in model, f"{model} is missing its vendor prefix"


def test_openai_ids_do_not_carry_a_vendor_prefix() -> None:
    """And the mirror image: OpenAI's own API takes the bare id."""
    for models in OPENAI_MODELS.values():
        for model in models:
            assert "/" not in model, f"{model} looks like an OpenRouter id"


def test_every_curated_id_is_a_plausible_non_empty_string() -> None:
    for lists in (OPENROUTER_MODELS, OPENAI_MODELS):
        for models in lists.values():
            assert models, "an empty list is the free-text trap again"
            assert len(set(models)) == len(models), "a duplicate would render twice"
            for model in models:
                assert model.strip() == model and model


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


def test_openrouter_serves_all_three_modalities() -> None:
    assert set(_by_id("openrouter")["modalities"]) == {"llm", "stt", "tts"}
