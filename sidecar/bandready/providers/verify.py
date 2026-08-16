"""Connection verification (03-providers-and-settings.md §9).

``POST /api/v1/providers/verify`` posts a *form-state* config — the user verifies before
saving — so nothing here reads the stored settings unless the caller passes them.

Server-backed presets: ``GET {base_url}/models``, 4 s budget, wall-clock latency, model
ids extracted for the ``options_from: "verify"`` select. Ollama servers that 404 on
``/v1/models`` are retried on ``/api/tags``.

In-process engines: check the weight files; no network. The result carries
``state: "needs_download"`` so the UI can flip Verify into Download.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from bandready.security.secrets import SecretError, decrypt
from bandready.server.errors import ApiError
from bandready.settings_store import interpolate_env

_log = logging.getLogger("bandready.verify")

VERIFY_TIMEOUT_S = 4.0
PROBE_PROMPT = [{"role": "user", "content": "ping"}]


def _resolve(cfg: dict[str, Any]) -> dict[str, Any]:
    """Decrypt + interpolate a form-state config so Verify tests what will really run."""
    out = dict(cfg or {})
    if isinstance(out.get("api_key"), str):
        try:
            out["api_key"] = decrypt(out["api_key"])
        except SecretError as exc:
            raise ApiError(400, "provider_error", str(exc)) from exc
    return interpolate_env(out, where="the connection settings")


def _models_from(payload: Any) -> list[str]:
    if isinstance(payload, dict):
        items = payload.get("data") or payload.get("models") or []
    elif isinstance(payload, list):
        items = payload
    else:
        return []
    out: list[str] = []
    for item in items:
        if isinstance(item, dict):
            name = item.get("id") or item.get("name")
            if name:
                out.append(str(name))
        elif isinstance(item, str):
            out.append(item)
    return out


def _inproc_result(kind: str, cfg: dict[str, Any]) -> dict[str, Any] | None:
    """Weight-file checks for engines that run inside this process."""
    from bandready.config import get_settings

    engine = str(cfg.get("engine") or "")
    models_dir = get_settings().models_dir

    if kind == "tts" and engine == "kokoro_onnx":
        model = cfg.get("model_path") or str(models_dir / "kokoro" / "kokoro-v1.0.onnx")
        voices = cfg.get("voices_path") or str(models_dir / "kokoro" / "voices-v1.0.bin")
        from pathlib import Path

        ready = Path(model).exists() and Path(voices).exists()
        return {
            "ok": ready,
            "latency_ms": 0,
            "models": [],
            "state": "ready" if ready else "needs_download",
            "detail": (
                "local model — loads at pipeline start"
                if ready
                else "Kokoro weights are not downloaded yet (~340 MB)"
            ),
            "warnings": [],
        }

    if kind == "stt" and engine in ("faster_whisper", "mlx_whisper"):
        sub = "whisper" if engine == "faster_whisper" else "mlx-whisper"
        target = models_dir / sub
        ready = target.exists() and any(target.iterdir())
        return {
            "ok": ready,
            "latency_ms": 0,
            "models": [],
            "state": "ready" if ready else "needs_download",
            "detail": (
                "local model — loads at pipeline start"
                if ready
                else f"whisper weights for '{cfg.get('model', 'base')}' are not downloaded yet"
            ),
            "warnings": [],
        }

    if engine == "mock" or str(cfg.get("preset", "")).startswith("mock"):
        return {
            "ok": True, "latency_ms": 0, "models": ["mock-model-1"],
            "state": "ready", "detail": "mock provider — deterministic fixtures",
            "warnings": [],
        }
    return None


async def verify_connection(kind: str, cfg: dict[str, Any]) -> dict[str, Any]:
    """Verify one modality's config. Returns ``{ok, detail, models, ...}``.

    Never raises for an unreachable endpoint — an unreachable endpoint IS the answer, and
    the UI renders `detail` as actionable copy. The same goes for a key that cannot be
    resolved, which is the most common thing to be wrong and used to be the one thing this
    function threw for.
    """
    if kind not in ("llm", "stt", "tts"):
        raise ApiError(422, "validation_error", f"unknown modality {kind!r}")

    try:
        cfg = _resolve(cfg)
    except ApiError as exc:
        # A `${VAR}` with nothing behind it, or a stored key that will not decrypt. Raising
        # turned the check into an HTTP error, and the Settings row that asked for it went
        # back to looking like a check nobody had run — the learner was told a job was
        # broken and given no sentence saying why. Verify's whole job is to say why.
        return {
            "ok": False,
            "latency_ms": 0,
            "models": [],
            "state": "no_key",
            "detail": exc.detail,
            "warnings": [],
        }
    inproc = _inproc_result(kind, cfg)
    if inproc is not None:
        return inproc

    base_url = str(cfg.get("base_url") or "").strip()
    if not base_url:
        return {
            "ok": False, "latency_ms": 0, "models": [], "state": "unconfigured",
            "detail": "no base URL is set for this provider", "warnings": [],
        }

    headers = {}
    api_key = str(cfg.get("api_key") or "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    warnings: list[str] = []
    started = time.monotonic()
    models: list[str] = []
    async with httpx.AsyncClient(timeout=VERIFY_TIMEOUT_S) as client:
        try:
            resp = await client.get(f"{base_url.rstrip('/')}/models", headers=headers)
        except httpx.ConnectError:
            return {
                "ok": False, "latency_ms": int((time.monotonic() - started) * 1000),
                "models": [], "state": "unreachable",
                "detail": f"could not connect to {base_url} — is the server running?",
                "warnings": [],
            }
        except httpx.TimeoutException:
            return {
                "ok": False, "latency_ms": int(VERIFY_TIMEOUT_S * 1000), "models": [],
                "state": "timeout",
                "detail": f"{base_url} did not answer within {VERIFY_TIMEOUT_S:.0f}s",
                "warnings": [],
            }

        if resp.status_code == 404 and "11434" in base_url:
            # Ollama fallback: older builds only expose /api/tags.
            root = base_url.rstrip("/").removesuffix("/v1")
            try:
                alt = await client.get(f"{root}/api/tags", headers=headers)
                if alt.status_code < 400:
                    models = _models_from(alt.json())
                    resp = alt
            except Exception as exc:  # noqa: BLE001 — the /v1 404 is still the answer
                _log.debug("ollama /api/tags fallback failed: %s", exc)

        latency_ms = int((time.monotonic() - started) * 1000)

        if resp.status_code in (401, 403):
            return {
                "ok": False, "latency_ms": latency_ms, "models": [], "state": "unauthorized",
                "detail": "key rejected — check the pasted key or the ${ENV_VAR} it references",
                "warnings": [],
            }
        if resp.status_code >= 400:
            return {
                "ok": False, "latency_ms": latency_ms, "models": [], "state": "error",
                "detail": f"{base_url} returned HTTP {resp.status_code}",
                "warnings": [],
            }

        if not models:
            try:
                models = _models_from(resp.json())
            except ValueError:
                models = []

        selected = str(cfg.get("model") or "")
        if selected and models and selected not in models:
            warnings.append(f"Selected model '{selected}' not in server list")

        result: dict[str, Any] = {
            "ok": True,
            "latency_ms": latency_ms,
            "models": models,
            "state": "ready",
            "detail": f"{len(models)} model{'s' if len(models) != 1 else ''} available",
            "warnings": warnings,
        }

        # Round-trip probe: proves the key actually has access to the chosen model.
        if kind == "llm" and selected:
            probe_started = time.monotonic()
            try:
                probe = await client.post(
                    f"{base_url.rstrip('/')}/chat/completions",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"model": selected, "messages": PROBE_PROMPT, "max_tokens": 1},
                )
                result["ttft_ms"] = int((time.monotonic() - probe_started) * 1000)
                if probe.status_code in (401, 403):
                    result["ok"] = False
                    result["state"] = "unauthorized"
                    result["detail"] = f"key rejected for model '{selected}'"
                elif probe.status_code >= 400:
                    warnings.append(
                        f"model '{selected}' probe returned HTTP {probe.status_code}"
                    )
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"model probe failed: {type(exc).__name__}")

    return result
