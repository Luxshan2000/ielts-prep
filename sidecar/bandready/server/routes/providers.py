"""Provider routes — presets, detection, verify, guided setup (03 §3/§5/§6/§9, 18 §4.3).

The one security-relevant thing in this file is :data:`SETUP_FLOWS`. The app runs **only**
the non-privileged, non-shell commands of 03 §6 (`ollama pull`, `uv tool install`) and its
own HTTPS downloads. Every command is:

* looked up in a fixed allowlist — never assembled from request data;
* executed with ``asyncio.create_subprocess_exec`` — **never** a shell, so a pipe or a
  ``;`` in an argument is bytes, not syntax;
* argument-validated against a conservative regex before it is passed on.

Anything involving an installer, `sudo`, or `curl | sh` is *display-only*: the response
carries the command text for a copy button and the app never executes it.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import time
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, Query, Response

from bandready.providers.detect import detect, invalidate_cache
from bandready.providers.presets import (
    RECOMMENDED_OPENROUTER,
    list_presets,
    mock_enabled,
)
from bandready.providers.verify import verify_connection
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.routes.providers")

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])

MODALITIES = ("llm", "stt", "tts")
SAFE_ARG = re.compile(r"^[A-Za-z0-9._:/@+-]{1,120}$")
PREVIEW_SENTENCE = "Hello, I'm your BandReady examiner. Shall we begin?"


# --------------------------------------------------------------------------- presets

@router.get("/presets", summary="The shipped preset registry")
async def presets(
    modality: str | None = Query(default=None),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    if modality and modality not in MODALITIES:
        raise ApiError(422, "validation_error", f"unknown modality {modality!r}")
    return {
        "presets": list_presets(modality),
        "mock_enabled": mock_enabled(),
    }


# --------------------------------------------------------------------------- detect

@router.get("/detect", summary="Detect local engines and platform capabilities")
async def detect_engines(
    fresh: int = Query(default=0),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    report = await detect(fresh=bool(fresh))
    return {**report, "setup": {e["id"]: _flow_summary(e["id"]) for e in report["engines"]}}


# --------------------------------------------------------------------------- verify

@router.post("/verify", summary="Verify one modality's connection")
async def verify(
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    modality = str(body.get("modality") or "").strip()
    if modality not in MODALITIES:
        raise ApiError(
            422, "validation_error", "modality must be one of llm, stt, tts"
        )
    config = body.get("config")
    if config is None:
        # No form state supplied — verify what is actually stored (Settings mount does
        # this on load). Storage form is right: verify decrypts and interpolates itself.
        from bandready.settings_store import load_settings

        config = load_settings().get(modality, {})
    if not isinstance(config, dict):
        raise ApiError(422, "validation_error", "config must be an object")
    result = await verify_connection(modality, config)
    return {"modality": modality, **result}


# --------------------------------------------------------------------------- setup

SETUP_FLOWS: dict[str, dict[str, Any]] = {
    "ollama": {
        "label": "Ollama",
        "requires_binary": "ollama",
        "command": ["ollama", "pull", "{model}"],
        "default_model": "qwen3:14b",
        "manual": {
            "reason": "Ollama is not installed",
            "url": "https://ollama.com/download",
            "instructions": "Install Ollama, then come back — we re-detect automatically.",
        },
    },
    "mlx_lm": {
        "label": "MLX (mlx-lm server)",
        "requires_binary": "uv",
        "command": ["uv", "tool", "install", "mlx-lm"],
        "manual": {
            "reason": "uv is not installed",
            "url": "https://docs.astral.sh/uv/",
            "copy": "curl -LsSf https://astral.sh/uv/install.sh | sh",
            "instructions": (
                "Copy and run this in a terminal — BandReady never executes a piped "
                "install script."
            ),
        },
    },
    "llama_cpp": {
        "label": "llama.cpp",
        "manual": {
            "reason": "llama.cpp is detect-only — BandReady does not install it",
            "url": "https://github.com/ggml-org/llama.cpp",
            "copy": "llama-server -m <model.gguf> --port 8080",
            "instructions": "Start llama-server yourself, then press Detect again.",
        },
    },
    "lm_studio": {
        "label": "LM Studio",
        "manual": {
            "reason": "LM Studio is a GUI app",
            "url": "https://lmstudio.ai",
            "instructions": "Install LM Studio, open the Developer tab and Start server.",
        },
    },
    "kokoro": {"label": "Kokoro (local TTS)", "artifact": "kokoro-v1.0"},
    "faster_whisper": {
        "label": "Local Whisper",
        "artifact": "faster-whisper-{size}",
        "default_size": "small",
    },
    "mlx_whisper": {"label": "MLX Whisper", "artifact": "mlx-whisper-large-v3-turbo"},
}


def _flow_summary(engine_id: str) -> dict[str, Any]:
    flow = SETUP_FLOWS.get(engine_id)
    if flow is None:
        return {"runnable": False, "kind": "none"}
    if flow.get("artifact"):
        return {"runnable": True, "kind": "download", "artifact": flow["artifact"]}
    binary = flow.get("requires_binary")
    if flow.get("command") and (not binary or shutil.which(binary)):
        return {
            "runnable": True,
            "kind": "command",
            "command": " ".join(flow["command"]).replace(
                "{model}", str(flow.get("default_model", ""))
            ),
        }
    return {"runnable": False, "kind": "manual", **flow.get("manual", {})}


def _resolve_command(flow: dict[str, Any], body: dict[str, Any]) -> list[str]:
    model = str(body.get("model") or flow.get("default_model") or "")
    argv: list[str] = []
    for token in flow["command"]:
        value = token.replace("{model}", model)
        if not value:
            raise ApiError(422, "validation_error", "a model name is required for this step")
        if not SAFE_ARG.match(value):
            raise ApiError(422, "validation_error", f"unsafe argument {value!r}")
        argv.append(value)
    return argv


_PCT = re.compile(r"(\d{1,3})\s?%")


async def _run_command(argv: list[str], job_id: str) -> dict[str, Any]:
    """Run an allowlisted command, streaming its output into the job's progress."""
    _log.info("provider setup running: %s", " ".join(argv))
    job_manager.set_progress(job_id, 0, " ".join(argv))
    process = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    tail: list[str] = []
    assert process.stdout is not None
    try:
        while True:
            raw = await process.stdout.readline()
            if not raw:
                break
            # `ollama pull` repaints one line with \r — take the last segment.
            line = raw.decode("utf-8", "replace").replace("\r", "\n").strip().split("\n")[-1]
            if not line:
                continue
            tail.append(line)
            del tail[:-40]
            match = _PCT.search(line)
            job_manager.set_progress(job_id, int(match.group(1)) if match else None, line)
    except asyncio.CancelledError:
        process.kill()
        raise
    code = await process.wait()
    if code != 0:
        raise ApiError(
            500,
            "provider_error",
            f"`{' '.join(argv)}` exited with status {code}: {tail[-1] if tail else 'no output'}",
        )
    return {"command": argv, "output_tail": tail[-10:]}


async def _setup_job(
    engine_id: str, flow: dict[str, Any], body: dict[str, Any], job_id: str
) -> dict[str, Any]:
    detail: dict[str, Any]
    if flow.get("artifact"):
        from bandready.server.routes.models import download_artifact, get_artifact

        artifact_id = str(flow["artifact"]).replace(
            "{size}", str(body.get("size") or flow.get("default_size") or "small")
        )
        detail = await download_artifact(get_artifact(artifact_id), job_id)
    else:
        argv = _resolve_command(flow, body)
        detail = await _run_command(argv, job_id)

    job_manager.set_progress(job_id, 95, "re-detecting engines…")
    invalidate_cache()
    report = await detect(fresh=True)
    state = next(
        (e.get("state") for e in report["engines"] if e.get("id") == engine_id), "unknown"
    )
    job_manager.set_progress(job_id, 100, f"{engine_id} is now {state}")
    return {"engine_id": engine_id, "state": state, **detail}


@router.post("/setup/{engine_id}", status_code=202, summary="Guided one-click setup (job)")
async def setup(
    engine_id: str,
    response: Response,
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    flow = SETUP_FLOWS.get(engine_id)
    if flow is None:
        raise ApiError(404, "not_found", f"no guided setup for engine {engine_id!r}")

    summary = _flow_summary(engine_id)
    if not summary["runnable"]:
        # Display-only step: hand the UI the copy text; we never execute installers.
        response.status_code = 200
        return {"engine_id": engine_id, "runnable": False, **summary}

    job_id = job_manager.submit(
        "provider_setup", lambda jid: _setup_job(engine_id, flow, body, jid)
    )
    job_manager.set_progress(job_id, 0, f"starting {flow['label']} setup…")
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id, "engine_id": engine_id}


# --------------------------------------------------------------------------- tts preview

@router.post("/tts-preview", summary="Synthesize a fixed sentence with a TTS config")
async def tts_preview(
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> Response:
    config = body.get("config")
    if not isinstance(config, dict) or not config:
        from bandready.settings_store import get_slot

        config = get_slot("tts")
    else:
        from bandready.security.secrets import decrypt
        from bandready.settings_store import interpolate_env

        config = dict(config)
        if isinstance(config.get("api_key"), str):
            config["api_key"] = decrypt(config["api_key"])
        config = interpolate_env(config, where="the TTS settings")

    text = str(body.get("text") or PREVIEW_SENTENCE)[:300]
    base_url = str(config.get("base_url") or "").strip()

    # One resolver, the same one every real render uses. The rule here used to be
    # `engine == "openai_compat" or (base_url and not engine)`, which took the remote
    # branch on the *unsaved draft* (no stored engine yet) and the local branch once the
    # same config was saved (a stale `engine` had appeared) — so the preview proved a
    # switch had worked at the exact moment it had not.
    from bandready.providers import transport

    if transport.resolve_engine(config, "tts") == "openai_compat":
        if not base_url:
            raise ApiError(
                422,
                "validation_error",
                "this voice provider is a remote one but has no base URL yet",
            )
        import httpx

        headers = {"Content-Type": "application/json"}
        if config.get("api_key"):
            headers["Authorization"] = f"Bearer {config['api_key']}"
        payload = {
            "model": config.get("model") or "tts-1",
            "voice": config.get("voice") or "alloy",
            "input": text,
            "response_format": "wav",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post(
                    f"{base_url.rstrip('/')}/audio/speech", headers=headers, json=payload
                )
            except Exception as exc:
                raise ApiError(502, "provider_error", f"TTS preview failed: {exc}") from exc
        if resp.status_code >= 400:
            raise ApiError(
                502, "provider_error", f"TTS provider returned HTTP {resp.status_code}"
            )
        return Response(content=resp.content, media_type="audio/wav")

    # In-process engines (Kokoro) and the hidden mock preset both go through the same
    # renderer the listening module uses, so a preview sounds exactly like the real render.
    import io

    import soundfile as sf

    from bandready.audio.tts_render import synthesize_line

    voice = str(config.get("voice") or "af_heart")
    try:
        pcm, rate = await synthesize_line(text, voice, config)
    except ApiError:
        raise
    except Exception as exc:  # a missing model file is an ordinary outcome
        raise ApiError(
            503,
            "provider_error",
            f"voice preview could not run the local TTS engine: {exc}",
        ) from exc

    buffer = io.BytesIO()
    sf.write(buffer, pcm, int(rate), subtype="PCM_16", format="WAV")
    return Response(content=buffer.getvalue(), media_type="audio/wav")


# --------------------------------------------------------------------------- catalogue

#: OpenRouter's modality vocabulary for audio, which is the whole trick and is not
#: documented anywhere obvious. A text-to-speech model declares `output_modalities:
#: ["speech"]` and a transcription model `["transcription"]`. Neither says "audio", and
#: neither appears in the default `/models` response at all: filtering that response for
#: audio returns the handful of chat models that happen to accept it inline, which is not
#: what an audio endpoint wants. See docs/plan/_context/openrouter-catalogue.md.
_MODALITY_QUERY = {
    "llm": None,
    "tts": "speech",
    "stt": "transcription",
}

_CATALOGUE_URL = "https://openrouter.ai/api/v1/models"
_CATALOGUE_TTL_S = 60 * 60 * 6
_catalogue_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _thin(model: dict[str, Any]) -> dict[str, Any]:
    """Only what the picker draws. The full record is ~2KB of prose per model."""
    arch = model.get("architecture") or {}
    return {
        "id": model.get("id"),
        "name": model.get("name") or model.get("id"),
        "description": (model.get("description") or "")[:280],
        "pricing": model.get("pricing") or {},
        "context_length": model.get("context_length"),
        # Populated for text-to-speech and empty elsewhere. This is where a voice picker
        # gets its options, rather than from a list we would have to maintain by hand.
        "voices": model.get("supported_voices") or [],
        "input_modalities": arch.get("input_modalities") or [],
        "output_modalities": arch.get("output_modalities") or [],
    }


@router.get("/openrouter/models", summary="What OpenRouter can do for one job, live")
async def openrouter_models(
    modality: str = "llm",
    refresh: bool = False,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    """The catalogue for one modality, fetched from OpenRouter and cached for six hours.

    Listing needs no API key; only calling a model does. So this answers even before the
    learner has pasted anything, which is what lets the screen show what they would be
    choosing from rather than an empty box and a promise.

    A failure here is not fatal and must not read as one. The recommended model is known
    locally, so the picker can still offer that one and say the rest could not be listed.
    """
    if modality not in _MODALITY_QUERY:
        raise ApiError(422, "validation_error", "modality must be one of llm, stt, tts")

    now = time.monotonic()
    cached = _catalogue_cache.get(modality)
    if cached and not refresh and now - cached[0] < _CATALOGUE_TTL_S:
        return {"modality": modality, "models": cached[1], "cached": True,
                "recommended": RECOMMENDED_OPENROUTER.get(modality)}

    out_mod = _MODALITY_QUERY[modality]
    url = _CATALOGUE_URL + (f"?output_modalities={out_mod}" if out_mod else "")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url, headers={"Accept": "application/json"})
            res.raise_for_status()
            items = (res.json() or {}).get("data") or []
    except Exception as exc:  # noqa: BLE001 — offline is an ordinary state here
        return {
            "modality": modality,
            "models": [],
            "cached": False,
            "recommended": RECOMMENDED_OPENROUTER.get(modality),
            "error": (
                "The model list could not be fetched from OpenRouter. You can still use the "
                "recommended model, or try again when you are back online."
            ),
            "detail": str(exc)[:200],
        }

    if modality == "llm":
        # The default listing is every model, including the audio ones' chat siblings. A
        # language model is one that takes text and answers with text and nothing else;
        # anything emitting speech or a transcript belongs in one of the other two lists.
        items = [
            m for m in items
            if "text" in ((m.get("architecture") or {}).get("output_modalities") or [])
            and not ({"speech", "transcription", "audio"}
                     & set((m.get("architecture") or {}).get("output_modalities") or []))
        ]

    models = [_thin(m) for m in items if m.get("id")]
    models.sort(key=lambda m: str(m.get("name") or ""))
    _catalogue_cache[modality] = (now, models)
    return {"modality": modality, "models": models, "cached": False,
            "recommended": RECOMMENDED_OPENROUTER.get(modality)}
