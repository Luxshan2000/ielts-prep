"""Local engine auto-detection (03-providers-and-settings.md §5).

All probes run concurrently against loopback with a 400 ms per-probe timeout and a ~1.5 s
overall budget, then the result is cached for 30 s (``?fresh=1`` busts it). Nothing here
ever touches the network beyond 127.0.0.1.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import platform
import shutil
import time
from typing import Any

import httpx

_log = logging.getLogger("bandready.detect")

PROBE_TIMEOUT_S = 0.4
CACHE_TTL_S = 30.0

_cache: tuple[float, dict[str, Any]] | None = None


# --------------------------------------------------------------------------- platform

def ram_gb() -> float | None:
    with contextlib.suppress(Exception):
        if hasattr(os, "sysconf") and "SC_PHYS_PAGES" in os.sysconf_names:  # posix
            total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
            return round(total / (1024**3), 1)
    with contextlib.suppress(Exception):  # pragma: no cover — Windows only
        import ctypes

        class _MemStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = _MemStatus()
        status.dwLength = ctypes.sizeof(_MemStatus)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))  # type: ignore[attr-defined]
        return round(status.ullTotalPhys / (1024**3), 1)
    return None


def platform_info() -> dict[str, Any]:
    system = platform.system()
    machine = platform.machine()
    os_name = {"Darwin": "darwin", "Windows": "win32", "Linux": "linux"}.get(
        system, system.lower()
    )
    return {
        "os": os_name,
        "arch": machine,
        "apple_silicon": system == "Darwin" and machine == "arm64",
        "ram_gb": ram_gb(),
        "tier": _tier(ram_gb()),
    }


def _tier(ram: float | None) -> str:
    if ram is None:
        return "unknown"
    if ram >= 32:
        return "32gb+"
    if ram >= 16:
        return "16gb"
    return "8gb"


# --------------------------------------------------------------------------- probes

async def _get(client: httpx.AsyncClient, url: str) -> dict[str, Any] | None:
    try:
        resp = await client.get(url)
    except Exception:  # noqa: BLE001 — every failure means "not there"
        return None
    if resp.status_code >= 400:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else {"data": data}


async def _probe_ollama(client: httpx.AsyncClient) -> dict[str, Any]:
    data = await _get(client, "http://127.0.0.1:11434/api/tags")
    engine: dict[str, Any] = {"id": "ollama", "state": "absent"}
    if data is not None:
        engine["state"] = "running"
        engine["via"] = "port:11434"
        engine["models"] = [
            m.get("name") for m in data.get("models", []) if isinstance(m, dict) and m.get("name")
        ]
        engine["base_url"] = "http://127.0.0.1:11434/v1"
    elif shutil.which("ollama"):
        engine["state"] = "installed"
        engine["via"] = "binary:ollama"
    return engine




def _model_ids(data: dict[str, Any] | None) -> list[str]:
    if not data:
        return []
    items = data.get("data") if isinstance(data.get("data"), list) else data.get("models")
    out: list[str] = []
    for item in items or []:
        if isinstance(item, dict):
            name = item.get("id") or item.get("name")
            if name:
                out.append(str(name))
        elif isinstance(item, str):
            out.append(item)
    return out


# --------------------------------------------------------------------------- in-process

def _weights_state(paths: list, download_mb: int, engine_id: str) -> dict[str, Any]:
    present = all(p.exists() for p in paths) if paths else False
    if present:
        return {"id": engine_id, "state": "ready", "via": "weights"}
    return {"id": engine_id, "state": "needs_download", "download_mb": download_mb}


def _inproc_engines() -> list[dict[str, Any]]:
    from bandready.config import get_settings

    models = get_settings().models_dir
    kokoro = _weights_state(
        [models / "kokoro" / "kokoro-v1.0.onnx", models / "kokoro" / "voices-v1.0.bin"],
        340,
        "kokoro",
    )
    whisper_dir = models / "whisper"
    fw_present = whisper_dir.exists() and any(whisper_dir.iterdir()) if whisper_dir.exists() else False
    faster = (
        {"id": "faster_whisper", "state": "ready", "via": "weights"}
        if fw_present
        else {"id": "faster_whisper", "state": "needs_download", "download_mb": 484}
    )
    # Kokoro speaks and faster-whisper listens. There is no third local engine to report:
    # mlx_whisper was reported here and offered in Settings while never being installed, and
    # naming an engine the app cannot actually run is how a learner ends up selecting one.
    return [kokoro, faster]


# --------------------------------------------------------------------------- entry point

async def detect(fresh: bool = False) -> dict[str, Any]:
    """The detection report served by ``GET /api/v1/providers/detect``."""
    global _cache
    now = time.monotonic()
    if not fresh and _cache is not None and now - _cache[0] < CACHE_TTL_S:
        return _cache[1]

    engines: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_S) as client:
        try:
            results = await asyncio.wait_for(
                asyncio.gather(
                    # Ollama only. The provider list was cut to "OpenRouter or local", and
                    # local means Ollama: LM Studio, mlx-lm and llama.cpp each added a probe,
                    # a preset and a decision, for an audience that is here to practise
                    # English rather than to choose an inference server.
                    _probe_ollama(client),
                    return_exceptions=True,
                ),
                timeout=1.5,
            )
        except TimeoutError:  # pragma: no cover — pathological localhost
            results = []
    for result in results:
        if isinstance(result, BaseException):
            _log.debug("detection probe failed: %s", result)
            continue
        if isinstance(result, list):
            engines.extend(result)
        else:
            engines.append(result)
    engines.extend(_inproc_engines())

    report = {"platform": platform_info(), "engines": engines, "detected_at": time.time()}
    _cache = (now, report)
    return report


def invalidate_cache() -> None:
    global _cache
    _cache = None
