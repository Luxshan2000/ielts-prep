"""The Pipecat 1.5.0 pipeline for speaking sessions (02-voice-pipeline.md §2).

Chain (02 §2.2, exact order)::

    transport.input()
      → TurnAudioRecorder tap      # §5 — passthrough, feeds the ring buffer
      → VADProcessor               # G1
      → RTVIProcessor              # Pipecat transport events only (R2-3)
      → stt
      → aggregator.user()          # G2 turn-stop strategy
      → QuestionCardProcessor      # §3 — one marked system message per turn
      → LLMGateProcessor           # §7 — closed through Part 2 prep + long turn
      → llm
      → tts
      → transport.output()
      → aggregator.assistant()

All five version-specific gotchas from 02 §2.1 are implemented here and each site carries
a ``G<n>`` comment naming the gotcha it prevents. Pipecat is imported **lazily inside
functions** so the rest of the sidecar boots (and every non-voice route keeps working) on
a machine where the voice extra is not installed — the failure surfaces as a clean
``503 voice_unavailable`` on the speaking routes instead of an import-time crash.
"""

from __future__ import annotations

import importlib
import logging
import sys
import types
from dataclasses import dataclass
from typing import Any

from bandready.providers import transport
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.voice.pipeline")

__all__ = [
    "BuiltPipeline",
    "build_speaking_task",
    "pipecat_available",
    "require_pipecat",
    "transport_params",
    "vad_params",
    "warmup",
]

#: 02 §9 — examiner answers are short by design; a small cap keeps first audio fast.
DEFAULT_MAX_TOKENS = 150


def pipecat_available() -> bool:
    try:
        import pipecat  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def require_pipecat() -> None:
    """Raise the contract's 503 when the voice extra is missing or broken."""
    try:
        import pipecat  # noqa: F401
    except Exception as exc:
        raise ApiError(
            503,
            "voice_unavailable",
            "the live voice engine is not installed in this sidecar "
            f"(pipecat import failed: {exc}). Reinstall BandReady with the voice extra "
            "to run speaking sessions.",
        ) from exc


# --------------------------------------------------------------------------- VAD


def vad_params() -> dict[str, float]:
    """VAD settings from the settings document, with the G5 clamp re-asserted."""
    try:
        from bandready.settings_store import load_settings

        block = dict(load_settings().get("vad") or {})
    except Exception:  # noqa: BLE001 — settings must never block a session
        block = {}
    return {
        "confidence": float(block.get("confidence", 0.5)),
        "start_secs": float(block.get("start_secs", 0.2)),
        "stop_secs": float(block.get("stop_secs", 0.6)),
        # G5: Pipecat's own default of 0.6 silences quiet or distant speakers. The
        # settings layer clamps user input to ≤ 0.6; we ship 0.0.
        "min_volume": min(0.6, max(0.0, float(block.get("min_volume", 0.0)))),
    }


def _vad_processor() -> Any:
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams
    from pipecat.processors.audio.vad_processor import VADProcessor

    params = vad_params()
    # G1: an explicit VADProcessor immediately after transport.input().
    # TransportParams(vad_analyzer=…) is INERT in pipecat 1.5.0 — relying on it gives a
    # session that connects, streams audio, and never produces a single speech event.
    return VADProcessor(vad_analyzer=SileroVADAnalyzer(params=VADParams(**params)))


def transport_params() -> Any:
    from pipecat.transports.base_transport import TransportParams

    # G1 again, stated as a warning to future editors: do NOT add vad_analyzer here and
    # delete the VADProcessor — the parameter does nothing in 1.5.0.
    return TransportParams(audio_in_enabled=True, audio_out_enabled=True)


# --------------------------------------------------------------------------- services


def _slot(kind: str) -> dict[str, Any]:
    from bandready.settings_store import get_slot

    try:
        return get_slot(kind)
    except Exception:  # noqa: BLE001
        return {}


def build_llm_service(config: dict[str, Any] | None = None) -> Any:
    """The examiner LLM — any OpenAI-compatible endpoint (03 §1)."""
    from pipecat.services.openai.llm import OpenAILLMService

    cfg = config or _slot("llm")
    base_url = str(cfg.get("base_url") or "http://127.0.0.1:11434/v1")
    model = str(cfg.get("model") or "")
    if not model:
        raise ApiError(400, "provider_error", "no language model is selected in Settings")
    params = dict(cfg.get("params") or {})
    return OpenAILLMService(
        api_key=str(cfg.get("api_key") or "not-needed"),
        base_url=base_url,
        model=model,
        params=OpenAILLMService.InputParams(
            temperature=float(params.get("temperature", 0.6)),
            max_tokens=int(params.get("max_tokens", DEFAULT_MAX_TOKENS)),
        ),
    )


def _import_whisper_stt() -> tuple[Any, Any]:
    """``(Model, WhisperSTTService)`` from Pipecat's faster-whisper backend.

    Pipecat 1.5.0's ``pipecat.services.whisper.stt`` raises at *import* time on Apple
    Silicon when ``mlx_whisper`` is absent — even though the faster-whisper backend this
    app actually uses does not need it. MLX is a multi-gigabyte optional extra, so
    requiring it would make every Apple Silicon install pay for a model it never runs,
    and without it the whole speaking pipeline is unreachable.

    So: if the import fails only because of that guard, satisfy it with a placeholder
    module, import once (Python then caches the real module), and withdraw the
    placeholder. ``WhisperSTTServiceMLX`` imports ``mlx_whisper`` lazily in its own
    constructor, so selecting the MLX preset without the extra installed still fails
    loudly and correctly — this only unblocks the faster-whisper path.
    """
    try:
        from pipecat.services.whisper.stt import Model, WhisperSTTService

        return Model, WhisperSTTService
    except ImportError:
        # A real mlx_whisper (or any other already-imported one) means the guard is not
        # what failed — some other dependency is genuinely missing, so do not mask it.
        if "mlx_whisper" in sys.modules:
            raise

    placeholder = types.ModuleType("mlx_whisper")
    placeholder.__bandready_placeholder__ = True  # type: ignore[attr-defined]
    sys.modules["mlx_whisper"] = placeholder
    try:
        module = importlib.import_module("pipecat.services.whisper.stt")
    finally:
        if getattr(sys.modules.get("mlx_whisper"), "__bandready_placeholder__", False):
            del sys.modules["mlx_whisper"]
    _log.info(
        "imported Pipecat's faster-whisper STT without the mlx_whisper extra "
        "(the MLX backend stays unavailable until that extra is installed)"
    )
    return module.Model, module.WhisperSTTService


def _whisper_model_enum(Model: Any, name: str) -> Any:
    """`Model.<NAME>` or a 422 that says which name was not recognised.

    ``getattr(Model, name, Model.BASE)`` used to sit here, and a silent default is the
    worst possible answer to a misconfiguration: a learner who typed ``large-v3-turbo``
    got whisper-base, heard plausible-but-worse transcripts, and had nothing anywhere
    telling them the name never took. Failing loudly costs one clear error; failing
    quietly costs trust in every transcript the app produces.
    """
    attr = str(name or "base").upper().replace("-", "_")
    model = getattr(Model, attr, None)
    if model is not None:
        return model
    known = sorted(
        m.name.lower().replace("_", "-") for m in Model if not m.name.startswith("_")
    )
    raise ApiError(
        422,
        "validation_error",
        f"{name!r} is not a Whisper model this build can run. "
        f"Choose one of: {', '.join(known)} — or change the model in Settings → Providers.",
    )


def build_stt_service(config: dict[str, Any] | None = None) -> Any:
    """Local Whisper by default (03 §1); an OpenAI-compatible endpoint when configured.

    The engine comes from :func:`bandready.providers.transport.resolve_engine`, never from
    a local allow-list: this used to read ``cfg["engine"] or cfg["preset"]`` and match it
    against ``("openai_stt", "openai", "groq_stt")``, so selecting OpenRouter — whose stored
    ``engine`` was still ``faster_whisper`` — quietly ran the local model instead.
    """
    cfg = config or _slot("stt")
    engine = transport.resolve_engine(cfg, "stt")
    if engine == "openai_compat":
        base_url = str(cfg.get("base_url") or "").strip()
        if not base_url:
            raise ApiError(
                503,
                "provider_error",
                "the selected speech-to-text provider is a remote one but has no base URL — "
                "finish it in Settings → Providers.",
            )
        from pipecat.services.openai.stt import OpenAISTTService

        # `or "not-needed"`, exactly as `build_llm_service` does: a keyless local
        # OpenAI-compatible server is a supported setup, and the OpenAI SDK refuses to
        # construct at all with an empty key — which would turn "I run LM Studio" into a
        # crash, and a genuinely missing OpenRouter key into an SDK message about
        # OPENAI_API_KEY that names an env var this app has never used.
        return OpenAISTTService(
            api_key=str(cfg.get("api_key") or "not-needed"),
            base_url=base_url,
            model=str(cfg.get("model") or "whisper-1"),
        )
    Model, WhisperSTTService = _import_whisper_stt()

    model = _whisper_model_enum(Model, str(cfg.get("model") or "base"))
    device = str(cfg.get("device") or "auto")
    return WhisperSTTService(
        model=model,
        device="cpu" if device in ("auto", "cpu") else device,
    )


def build_tts_service(config: dict[str, Any] | None = None) -> Any:
    """Kokoro ONNX by default (03 §1); an OpenAI-compatible endpoint when configured."""
    cfg = config or _slot("tts")
    engine = transport.resolve_engine(cfg, "tts")
    if engine == "openai_compat":
        base_url = str(cfg.get("base_url") or "").strip()
        if not base_url:
            raise ApiError(
                503,
                "provider_error",
                "the selected voice provider is a remote one but has no base URL — "
                "finish it in Settings → Providers.",
            )
        from pipecat.services.openai.tts import OpenAITTSService

        # See the note in `build_stt_service`: never an empty string.
        return OpenAITTSService(
            api_key=str(cfg.get("api_key") or "not-needed"),
            base_url=base_url,
            voice=str(cfg.get("voice") or "alloy"),
        )
    from pipecat.services.kokoro.tts import KokoroTTSService

    kwargs: dict[str, Any] = {"voice_id": str(cfg.get("voice") or "af_heart")}
    if cfg.get("model_path"):
        kwargs["model_path"] = str(cfg["model_path"])
    if cfg.get("voices_path"):
        kwargs["voices_path"] = str(cfg["voices_path"])
    return KokoroTTSService(**kwargs)


# --------------------------------------------------------------------------- assembly


@dataclass
class BuiltPipeline:
    """Everything the runtime needs to drive one call."""

    task: Any
    context: Any
    gate: Any
    injector: Any
    transcript_observer: Any
    recorder: Any


def build_speaking_task(
    transport: Any,
    state_machine: Any,
    accumulator: Any,
    recorder: Any,
    llm: Any = None,
    stt: Any = None,
    tts: Any = None,
) -> BuiltPipeline:
    """Assemble the pipeline of 02 §2.3 verbatim."""
    require_pipecat()

    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.task import PipelineParams, PipelineTask
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
    )
    from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
    from pipecat.turns.user_stop.speech_timeout_user_turn_stop_strategy import (
        SpeechTimeoutUserTurnStopStrategy,
    )
    from pipecat.turns.user_turn_strategies import UserTurnStrategies

    from bandready.voice.injector import make_question_card_processor
    from bandready.voice.state_machine import make_llm_gate
    from bandready.voice.transcript import make_transcript_observer

    llm = llm or build_llm_service()
    stt = stt or build_stt_service()
    tts = tts or build_tts_service()

    context = LLMContext([{"role": "system", "content": state_machine.system_prompt}])

    # G2: an explicit turn-stop strategy. The 1.5.0 default (Smart Turn) hangs — the user
    # stops speaking and the turn is never committed, so the call looks frozen.
    # `user_speech_timeout` must track VADParams.stop_secs (02 §9 — they move together).
    aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            user_turn_strategies=UserTurnStrategies(
                stop=[
                    SpeechTimeoutUserTurnStopStrategy(
                        user_speech_timeout=vad_params()["stop_secs"]
                    )
                ]
            )
        ),
    )

    rtvi = RTVIProcessor()
    gate = make_llm_gate(is_open=state_machine.phase not in ("P2_PREP", "P2_LONG_TURN"))
    injector = make_question_card_processor(context, state_machine)
    transcript_observer = make_transcript_observer(accumulator)

    pipeline = Pipeline(
        [
            transport.input(),
            recorder.tap(),          # §5 — pure passthrough into the ring buffer
            _vad_processor(),        # G1 + G5
            rtvi,                    # transport events only; session phases go over the WS
            stt,
            aggregator.user(),       # G2
            injector,                # §3 — [[br-question-card]] injection
            gate,                    # §7 — closed during P2_PREP / P2_LONG_TURN
            llm,
            tts,
            transport.output(),
            aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, allow_interruptions=True),
        observers=[RTVIObserver(rtvi), transcript_observer, recorder.observer()],
    )
    return BuiltPipeline(
        task=task,
        context=context,
        gate=gate,
        injector=injector,
        transcript_observer=transcript_observer,
        recorder=recorder,
    )


async def warmup() -> None:
    """Build STT and TTS at boot so first-session latency matches steady state (02 §9).

    Best effort — every failure is logged and swallowed; a cold cache is slower, not broken.
    """
    if not pipecat_available():
        _log.info("warmup skipped: the voice extra is not installed")
        return
    for name, builder in (("STT", build_stt_service), ("TTS", build_tts_service)):
        try:
            service = builder()
            _log.info("warmup: built %s service %s", name, type(service).__name__)
        except Exception:  # noqa: BLE001
            _log.exception("warmup: %s build failed; continuing", name)
