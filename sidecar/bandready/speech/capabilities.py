"""Which provider actually runs each speech job — the answer, not the setting.

Settings lets a learner choose speech-to-text and text-to-speech independently, and the
app is supposed to honour both. Most of it does. Two jobs cannot, and until now nothing
said so anywhere a learner could read it:

* **pronunciation analysis** and **one-shot transcription** always run local Whisper.
  The scorer needs per-word timings and per-word confidence; the remote transcript APIs
  we speak to return neither, so a remote choice would silently produce a worse answer
  rather than a different one. The *model name* from the stt slot is still used — it
  selects which local Whisper loads — but the endpoint and key are not.

The distinction between "your choice is used" and "your choice is used for this job" is
the whole difference between a working setting and a setting that looks like it worked.
This module is the single place that distinction is computed, so the two capability
endpoints cannot drift apart or disagree with what the dispatch sites actually do.
"""

from __future__ import annotations

from typing import Any

#: Human-readable name per resolved engine id, for copy that faces a learner.
ENGINE_LABELS: dict[str, str] = {
    "faster_whisper": "Local Whisper (faster-whisper)",
    "kokoro_onnx": "Local Kokoro",
    "openai_compat": "A remote OpenAI-compatible endpoint",
    "mock": "The built-in mock engine",
}

#: Engines that never leave the machine. `mock` is local too, but saying so in a
#: capability payload would be more confusing than useful, so it is listed separately.
LOCAL_ENGINES: frozenset[str] = frozenset({"faster_whisper", "kokoro_onnx", "mock"})

#: The sentence that stands between a learner and a silently ignored choice.
WHISPER_ONLY_NOTE = (
    "Pronunciation analysis and one-shot transcription always use local Whisper, "
    "whichever speech-to-text provider is selected in Settings. A remote transcript "
    "carries no per-word timings or confidence, and those are exactly what the "
    "pronunciation scoring reads. Your model choice still applies — it picks which "
    "local Whisper model loads — but the endpoint and key are not used for these jobs."
)


def _slot(name: str) -> dict[str, Any]:
    try:
        from bandready.settings_store import get_slot

        return dict(get_slot(name) or {})
    except Exception:  # noqa: BLE001 — an unresolvable config is reported, never raised
        return {}


def _resolve(slot: dict[str, Any], modality: str) -> str:
    """The engine that will actually run, via the one shared resolver."""
    from bandready.providers import transport

    return transport.resolve_engine(slot, modality)


def _job(
    job_id: str,
    label: str,
    *,
    modality: str,
    engine: str,
    slot: dict[str, Any],
    honours_setting: bool,
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "job": job_id,
        "label": label,
        "modality": modality,
        "engine": engine,
        "engine_label": ENGINE_LABELS.get(engine, engine),
        "provider": str(slot.get("preset") or "") or None,
        "model": str(slot.get("model") or "") or None,
        "local": engine in LOCAL_ENGINES,
        # False means: the provider chosen in Settings does NOT decide this job.
        "honours_setting": honours_setting,
        "note": note,
    }


def stt_jobs() -> list[dict[str, Any]]:
    """Every job that turns speech into text, and who really runs it."""
    slot = _slot("stt")
    live = _resolve(slot, "stt")
    return [
        _job(
            "transcribe_answer",
            "Typing out a spoken answer (vocabulary, grammar, placement)",
            modality="stt",
            engine="faster_whisper",
            slot=slot,
            honours_setting=False,
            note=WHISPER_ONLY_NOTE,
        ),
        _job(
            "pronunciation",
            "Pronunciation analysis and speaking drills",
            modality="stt",
            engine="faster_whisper",
            slot=slot,
            honours_setting=False,
            note=WHISPER_ONLY_NOTE,
        ),
        _job(
            "live_session",
            "The examiner hearing you in a live speaking session",
            modality="stt",
            engine=live,
            slot=slot,
            honours_setting=True,
        ),
    ]


def tts_jobs() -> list[dict[str, Any]]:
    """Every job that turns text into speech, and who really runs it."""
    slot = _slot("tts")
    engine = _resolve(slot, "tts")
    return [
        _job(
            "live_session",
            "The examiner's voice in a live speaking session",
            modality="tts",
            engine=engine,
            slot=slot,
            honours_setting=True,
        ),
        _job(
            "listening_render",
            "Rendering listening audio, drill reference clips and vocabulary audio",
            modality="tts",
            engine=engine,
            slot=slot,
            honours_setting=True,
        ),
    ]


def job_providers() -> dict[str, list[dict[str, Any]]]:
    """`{"stt": [...], "tts": [...]}` — the whole honest picture in one call."""
    return {"stt": stt_jobs(), "tts": tts_jobs()}


__all__ = [
    "ENGINE_LABELS",
    "LOCAL_ENGINES",
    "WHISPER_ONLY_NOTE",
    "job_providers",
    "stt_jobs",
    "tts_jobs",
]
