"""Model-weight routes (13-packaging-distribution.md §7, 18-api-contract.md §4.15).

Weights never ride in the app bundle — they live in ``<data_dir>/models/`` and are fetched
here. Everything long-running goes through the job convention (18 §3), so the renderer
polls ``GET /api/v1/jobs/{id}`` and gets ``progress_pct`` + a human ``detail``
("412 MB / 484 MB", "verifying checksum…").

Download rules implemented below, all from 13 §7.3:

* stream into ``<dest>/<name>.part`` and **resume** with ``Range: bytes=<len>-`` when the
  server answers ``206`` (HF and GitHub releases both do); a ``200`` means start over;
* sha256 is computed incrementally while the bytes arrive, so verification is free;
  a mismatch deletes the ``.part``, retries once, then fails the job with ``detail:
  "checksum"``;
* 3 retries with 2/8/30 s backoff on network errors;
* one download at a time (a module-level lock) — models are GB-scale and parallelism only
  fragments bandwidth;
* cancellation keeps the ``.part`` file so the next attempt resumes.

The artifact manifest is data. It is read from ``$BANDREADY_MODEL_MANIFEST``, then
``resources/content/model-manifest.json`` beside the repo, and finally falls back to the
built-in table below. ``sha256`` may be ``null`` until ``scripts/pin_model_hashes.py`` runs
at release time; an unpinned file downloads with a warning in ``detail`` instead of
silently pretending it was verified.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, Query, Response

from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.routes.models")

router = APIRouter(prefix="/api/v1/models", tags=["models"])

CHUNK = 1 << 20
NET_RETRIES = 3
BACKOFF_S = (2.0, 8.0, 30.0)
DOWNLOAD_TIMEOUT = httpx.Timeout(connect=15.0, read=60.0, write=60.0, pool=15.0)

_download_lock = asyncio.Lock()


# --------------------------------------------------------------------------- manifest

KOKORO_RELEASE = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
)
HF = "https://huggingface.co"


def _ct2(repo: str, name: str) -> dict[str, Any]:
    return {"name": name, "size": None, "sha256": None,
            "url": f"{HF}/{repo}/resolve/main/{name}"}


def _whisper(size: str, repo: str, mb: int) -> dict[str, Any]:
    return {
        "id": f"faster-whisper-{size}",
        "kind": "stt",
        "engine": "faster_whisper",
        "label": f"Whisper {size} (CTranslate2)",
        "dest": f"whisper/{size}",
        "hf_repo": repo,
        "approx_mb": mb,
        "files": [
            _ct2(repo, "model.bin"),
            _ct2(repo, "config.json"),
            _ct2(repo, "tokenizer.json"),
            _ct2(repo, "vocabulary.txt"),
        ],
    }


BUILTIN_MANIFEST: dict[str, Any] = {
    "manifest_version": 1,
    "pinned": False,
    "artifacts": [
        {
            "id": "kokoro-v1.0",
            "kind": "tts",
            "engine": "kokoro_onnx",
            "label": "Kokoro TTS v1.0",
            "dest": "kokoro",
            "approx_mb": 340,
            "files": [
                {"name": "kokoro-v1.0.onnx", "size": 325532160, "sha256": None,
                 "url": f"{KOKORO_RELEASE}/kokoro-v1.0.onnx"},
                {"name": "voices-v1.0.bin", "size": 28303104, "sha256": None,
                 "url": f"{KOKORO_RELEASE}/voices-v1.0.bin"},
            ],
        },
        _whisper("base", "Systran/faster-whisper-base", 145),
        _whisper("small", "Systran/faster-whisper-small", 484),
        _whisper("large-v3-turbo", "deepdml/faster-whisper-large-v3-turbo-ct2", 1620),
        {
            "id": "mlx-whisper-large-v3-turbo",
            "kind": "stt",
            "engine": "mlx_whisper",
            "label": "MLX Whisper large-v3-turbo",
            "dest": "mlx-whisper/large-v3-turbo",
            "hf_repo": "mlx-community/whisper-large-v3-turbo",
            "approx_mb": 1550,
            "platforms": ["darwin-arm64"],
            "files": [
                {"name": "config.json", "size": None, "sha256": None,
                 "url": f"{HF}/mlx-community/whisper-large-v3-turbo/resolve/main/config.json"},
                {"name": "weights.npz", "size": None, "sha256": None,
                 "url": f"{HF}/mlx-community/whisper-large-v3-turbo/resolve/main/weights.npz"},
            ],
        },
    ],
}

_manifest_cache: dict[str, Any] | None = None


def _manifest_paths() -> list[Path]:
    paths: list[Path] = []
    env = os.environ.get("BANDREADY_MODEL_MANIFEST", "").strip()
    if env:
        paths.append(Path(env).expanduser())
    here = Path(__file__).resolve()
    for parent in here.parents[:6]:
        candidate = parent / "resources" / "content" / "model-manifest.json"
        if candidate not in paths:
            paths.append(candidate)
    return paths


def load_manifest(*, refresh: bool = False) -> dict[str, Any]:
    """The artifact manifest — shipped file if present, built-in table otherwise."""
    global _manifest_cache
    if _manifest_cache is not None and not refresh:
        return _manifest_cache
    for path in _manifest_paths():
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("artifacts"), list):
                data["source"] = str(path)
                _manifest_cache = data
                _log.info("model manifest loaded from %s", path)
                return data
        except Exception as exc:  # noqa: BLE001 — a bad file must not break the app
            _log.error("model manifest at %s is unreadable (%s); using the built-in", path, exc)
    _manifest_cache = {**BUILTIN_MANIFEST, "source": "builtin"}
    return _manifest_cache


def get_artifact(artifact_id: str) -> dict[str, Any]:
    for artifact in load_manifest()["artifacts"]:
        if artifact["id"] == artifact_id:
            return artifact
    raise ApiError(404, "not_found", f"no model artifact with id {artifact_id!r}")


def artifact_dir(artifact: dict[str, Any]) -> Path:
    from bandready.config import get_settings

    return get_settings().models_dir / str(artifact.get("dest") or artifact["id"])


def artifact_state(artifact: dict[str, Any]) -> dict[str, Any]:
    """``installed`` / ``partial`` / ``absent`` plus per-file bytes on disk."""
    directory = artifact_dir(artifact)
    files: list[dict[str, Any]] = []
    complete = 0
    for spec in artifact["files"]:
        final = directory / spec["name"]
        part = directory / f"{spec['name']}.part"
        on_disk = final.stat().st_size if final.exists() else 0
        partial = part.stat().st_size if part.exists() else 0
        if final.exists():
            complete += 1
        files.append(
            {
                "name": spec["name"],
                "path": str(final),
                "present": final.exists(),
                "bytes": on_disk,
                "partial_bytes": partial,
                "expected_size": spec.get("size"),
                "sha256_pinned": bool(spec.get("sha256")),
            }
        )
    total = len(artifact["files"])
    state = "installed" if complete == total else ("partial" if complete or any(
        f["partial_bytes"] for f in files) else "absent")
    return {
        "artifact_id": artifact["id"],
        "kind": artifact.get("kind"),
        "engine": artifact.get("engine"),
        "label": artifact.get("label", artifact["id"]),
        "path": str(directory),
        "approx_mb": artifact.get("approx_mb"),
        "state": state,
        "files": files,
    }


# --------------------------------------------------------------------------- download

def _human_mb(n: int) -> str:
    return f"{n / (1024 * 1024):.0f} MB"


async def _fetch_file(
    client: httpx.AsyncClient,
    spec: dict[str, Any],
    directory: Path,
    on_bytes: Any,
) -> None:
    """Download one file with resume + incremental sha256. Raises on final failure."""
    final = directory / spec["name"]
    part = directory / f"{spec['name']}.part"
    expected_hash = spec.get("sha256")

    if final.exists() and (not spec.get("size") or final.stat().st_size == spec["size"]):
        on_bytes(final.stat().st_size, final.stat().st_size, spec["name"], "already present")
        return

    for attempt in range(1, NET_RETRIES + 1):
        digest = hashlib.sha256()
        resume_from = part.stat().st_size if part.exists() else 0
        if resume_from:
            with part.open("rb") as fh:  # seed the hash with what we already have
                while chunk := fh.read(CHUNK):
                    digest.update(chunk)
        headers = {"Range": f"bytes={resume_from}-"} if resume_from else {}
        try:
            async with client.stream("GET", spec["url"], headers=headers) as response:
                if resume_from and response.status_code == 200:
                    # Server ignored the Range header — start over.
                    digest = hashlib.sha256()
                    resume_from = 0
                elif response.status_code not in (200, 206):
                    response.raise_for_status()
                total = int(response.headers.get("Content-Length") or 0) + resume_from
                mode = "ab" if resume_from else "wb"
                received = resume_from
                with part.open(mode) as fh:
                    async for chunk in response.aiter_bytes(CHUNK):
                        fh.write(chunk)
                        digest.update(chunk)
                        received += len(chunk)
                        on_bytes(received, total or spec.get("size") or 0, spec["name"], None)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if attempt == NET_RETRIES:
                raise ApiError(
                    502, "provider_error", f"downloading {spec['name']} failed: {exc}"
                ) from exc
            delay = BACKOFF_S[min(attempt - 1, len(BACKOFF_S) - 1)]
            on_bytes(None, None, spec["name"], f"retrying in {delay:.0f}s ({exc})")
            await asyncio.sleep(delay)
            continue

        on_bytes(None, None, spec["name"], "verifying checksum…")
        actual = digest.hexdigest()
        if expected_hash and actual != expected_hash:
            part.unlink(missing_ok=True)
            if attempt == NET_RETRIES:
                raise ApiError(
                    422, "validation_error", f"checksum mismatch for {spec['name']}"
                )
            on_bytes(None, None, spec["name"], "checksum mismatch — retrying")
            continue
        if spec.get("size") and part.stat().st_size != spec["size"]:
            part.unlink(missing_ok=True)
            if attempt == NET_RETRIES:
                raise ApiError(
                    422,
                    "validation_error",
                    f"{spec['name']} is {part.stat().st_size if part.exists() else 0} bytes, "
                    f"expected {spec['size']}",
                )
            continue
        os.replace(part, final)
        spec["_observed_sha256"] = actual
        return


async def download_artifact(artifact: dict[str, Any], job_id: str | None = None) -> dict[str, Any]:
    """Fetch every file of one artifact. Used by the job below and by provider setup."""
    directory = artifact_dir(artifact)
    directory.mkdir(parents=True, exist_ok=True)
    files = artifact["files"]
    sizes = [f.get("size") or 0 for f in files]
    grand_total = sum(sizes) or 0
    done_before: list[int] = [0]

    def progress(received: int | None, total: int | None, name: str, note: str | None) -> None:
        if job_id is None:
            return
        if received is None:
            job_manager.set_progress(job_id, None, f"{name}: {note}" if note else None)
            return
        overall = done_before[0] + received
        pct = (overall / grand_total * 100) if grand_total else None
        detail = note or (
            f"{name} — {_human_mb(received)} / {_human_mb(total)}" if total
            else f"{name} — {_human_mb(received)}"
        )
        job_manager.set_progress(job_id, pct, detail)

    # One download at a time (13 §7.3) — models are GB-scale.
    async with _download_lock, httpx.AsyncClient(
        timeout=DOWNLOAD_TIMEOUT, follow_redirects=True
    ) as client:
        for index, spec in enumerate(files):
            await _fetch_file(client, spec, directory, progress)
            done_before[0] += sizes[index] or (
                (directory / spec["name"]).stat().st_size
                if (directory / spec["name"]).exists() else 0
            )
    if job_id is not None:
        job_manager.set_progress(job_id, 100, "download complete")
    _apply_paths(artifact, directory)
    return {"artifact_id": artifact["id"], "path": str(directory)}


def _apply_paths(artifact: dict[str, Any], directory: Path) -> None:
    """Kokoro's weights are addressed by path in settings — wire them up on success."""
    if artifact.get("engine") != "kokoro_onnx":
        return
    try:
        from bandready.settings_store import patch_settings

        patch_settings(
            {
                "tts": {
                    "model_path": str(directory / "kokoro-v1.0.onnx"),
                    "voices_path": str(directory / "voices-v1.0.bin"),
                }
            }
        )
    except Exception as exc:  # noqa: BLE001 — a settings write must not fail the download
        _log.warning("could not record the Kokoro weight paths in settings: %s", exc)


# --------------------------------------------------------------------------- recommend

TIER_TABLE: list[dict[str, Any]] = [
    {
        "tier": "8gb",
        "min_ram_gb": 0,
        "label": "8 GB RAM",
        "llm": {"ollama": "llama3.1:8b", "mlx": "mlx-community/Qwen3-8B-4bit"},
        "chat_quality": "good",
        "scoring_quality": "marginal",
        "advice": (
            "Band scoring is unreliable below ~14B — add a cloud key (DeepSeek or "
            "OpenRouter) for scored assessments."
        ),
        "stt": {"artifact_id": "faster-whisper-base", "model": "base"},
        "tts": {"artifact_id": "kokoro-v1.0", "voice": "af_heart"},
    },
    {
        "tier": "16gb",
        "min_ram_gb": 16,
        "label": "16 GB RAM",
        "llm": {"ollama": "qwen3:14b", "mlx": "mlx-community/Qwen3-14B-4bit"},
        "chat_quality": "good",
        "scoring_quality": "acceptable",
        "advice": "Local scoring is workable; a cloud key still scores more consistently.",
        "stt": {"artifact_id": "faster-whisper-small", "model": "small"},
        "tts": {"artifact_id": "kokoro-v1.0", "voice": "af_heart"},
    },
    {
        "tier": "32gb+",
        "min_ram_gb": 32,
        "label": "32 GB RAM or more",
        "llm": {"ollama": "qwen3:32b", "mlx": "mlx-community/Qwen3-32B-4bit"},
        "chat_quality": "excellent",
        "scoring_quality": "good",
        "advice": "Everything runs locally with no quality compromise.",
        "stt": {"artifact_id": "faster-whisper-large-v3-turbo", "model": "large-v3-turbo"},
        "tts": {"artifact_id": "kokoro-v1.0", "voice": "af_heart"},
    },
]

CLOUD_TIER: dict[str, Any] = {
    "tier": "cloud",
    "label": "Any machine + a cloud key",
    "llm": {"presets": ["openrouter", "groq", "deepseek"]},
    "chat_quality": "excellent",
    "scoring_quality": "excellent",
    "advice": "Best scoring quality; audio still runs locally so recordings never leave the machine.",
    "stt": {"preset": "groq_whisper", "model": "whisper-large-v3-turbo", "optional": True},
    "tts": {"artifact_id": "kokoro-v1.0", "voice": "af_heart"},
}


@router.get("/recommended", summary="Recommended models for the detected hardware tier")
async def recommended(_: None = Depends(require_auth)) -> dict[str, Any]:
    from bandready.providers.detect import platform_info

    info = platform_info()
    ram = info.get("ram_gb")
    tier_id = info.get("tier") or "unknown"
    chosen = TIER_TABLE[0]
    for row in TIER_TABLE:
        if ram is not None and ram >= row["min_ram_gb"]:
            chosen = row
    # Ollama on every platform, and faster-whisper for speech.
    #
    # This used to recommend the MLX presets on Apple Silicon, which became a way to hand a
    # learner a preset that no longer exists. Worse, it had already caused a silent failure:
    # `pron/analyze.py` reads whatever model id is configured and gives it to faster-whisper,
    # and an MLX repository id can never load there. Both attempts fail, the failure is cached
    # for the life of the process, and every later recording comes back unrecognised with
    # nothing on screen naming the cause.
    recommendation = {
        **chosen,
        "llm_engine": "ollama",
        "llm_preset": "ollama",
        "llm_model": chosen["llm"]["ollama"],
    }
    states = {a["id"]: artifact_state(a) for a in load_manifest()["artifacts"]}
    needed = [
        states[aid]
        for aid in (recommendation["stt"].get("artifact_id"), recommendation["tts"]["artifact_id"])
        if aid in states
    ]
    return {
        "platform": info,
        "tier": tier_id,
        "recommended": recommendation,
        "cloud_alternative": CLOUD_TIER,
        "tiers": TIER_TABLE,
        "required_artifacts": needed,
    }


# --------------------------------------------------------------------------- routes

@router.get("/manifest", summary="The shipped model-artifact manifest")
async def manifest(_: None = Depends(require_auth)) -> dict[str, Any]:
    doc = load_manifest()
    return {
        "manifest_version": doc.get("manifest_version", 1),
        "source": doc.get("source", "builtin"),
        "artifacts": [artifact_state(a) for a in doc["artifacts"]],
    }


@router.get("/installed", summary="Model artifacts present on disk")
async def installed(_: None = Depends(require_auth)) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for artifact in load_manifest()["artifacts"]:
        state = artifact_state(artifact)
        if state["state"] != "installed":
            continue
        mtimes = [
            Path(f["path"]).stat().st_mtime for f in state["files"] if Path(f["path"]).exists()
        ]
        newest = max(mtimes) if mtimes else 0.0
        out.append(
            {
                "artifact_id": state["artifact_id"],
                "path": state["path"],
                "verified_at": _iso(newest),
                "bytes": sum(f["bytes"] for f in state["files"]),
            }
        )
    return out


def _iso(epoch: float) -> str | None:
    if not epoch:
        return None
    from datetime import UTC, datetime

    return datetime.fromtimestamp(epoch, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _start_download(artifact_id: str) -> dict[str, Any]:
    artifact = get_artifact(artifact_id)
    state = artifact_state(artifact)
    if state["state"] == "installed":
        return {"artifact_id": artifact_id, "state": "installed", "path": state["path"]}
    running = job_manager.list(kind="model_download", limit=200)["items"]
    for job in running:
        if job["state"] in ("queued", "running") and (job.get("result") or {}).get(
            "artifact_id"
        ) == artifact_id:
            return {"job_id": job["id"], "artifact_id": artifact_id}
    job_id = job_manager.submit(
        "model_download", lambda jid: download_artifact(artifact, jid)
    )
    job_manager.set_result(job_id, {"artifact_id": artifact_id})
    job_manager.set_progress(job_id, 0, f"queued — {artifact.get('label', artifact_id)}")
    return {"job_id": job_id, "artifact_id": artifact_id}


@router.post("/download", status_code=202, summary="Download one model artifact (job)")
async def download(
    response: Response,
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    artifact_id = str(body.get("artifact_id") or "").strip()
    if not artifact_id:
        raise ApiError(422, "validation_error", "artifact_id is required")
    result = _start_download(artifact_id)
    if "job_id" in result:
        response.headers["Location"] = f"/api/v1/jobs/{result['job_id']}"
    else:
        response.status_code = 200
    return result


@router.post("/downloads", status_code=202, summary="Alias of POST /models/download")
async def start_download(
    response: Response,
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    return await download(response, body, None)


@router.get("/downloads", summary="Download jobs plus what is already on disk")
async def downloads(
    state: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    jobs = job_manager.list(kind="model_download", state=state, limit=limit)
    return {
        "items": jobs["items"],
        "next_cursor": jobs["next_cursor"],
        "artifacts": [artifact_state(a) for a in load_manifest()["artifacts"]],
    }


@router.post("/import", summary="Offline import of an already-downloaded artifact")
async def import_artifact(
    body: dict[str, Any] = Body(default_factory=dict),
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    artifact_id = str(body.get("artifact_id") or "").strip()
    source = str(body.get("source_path") or "").strip()
    if not artifact_id or not source:
        raise ApiError(422, "validation_error", "artifact_id and source_path are required")
    artifact = get_artifact(artifact_id)
    src = Path(source).expanduser()
    if not src.exists():
        raise ApiError(404, "not_found", f"{src} does not exist")

    directory = artifact_dir(artifact)
    directory.mkdir(parents=True, exist_ok=True)
    wanted = {spec["name"]: spec for spec in artifact["files"]}
    sources = [src] if src.is_file() else sorted(p for p in src.iterdir() if p.is_file())

    copied: list[str] = []
    skipped: list[str] = []
    for candidate in sources:
        spec = wanted.get(candidate.name)
        if spec is None:
            skipped.append(candidate.name)
            continue
        digest = hashlib.sha256()
        with candidate.open("rb") as fh:
            while chunk := fh.read(CHUNK):
                digest.update(chunk)
        if spec.get("sha256") and digest.hexdigest() != spec["sha256"]:
            raise ApiError(422, "validation_error", f"checksum mismatch for {candidate.name}")
        tmp = directory / f"{candidate.name}.import"
        shutil.copyfile(candidate, tmp)
        os.replace(tmp, directory / candidate.name)
        copied.append(candidate.name)
    if not copied:
        raise ApiError(
            422,
            "validation_error",
            f"nothing in {src} matches artifact {artifact_id!r} "
            f"(expected: {', '.join(sorted(wanted))})",
        )
    _apply_paths(artifact, directory)
    return {"artifact_id": artifact_id, "copied": copied, "ignored": skipped,
            "state": artifact_state(artifact)}


@router.delete("/{artifact_id}", status_code=204, summary="Remove a downloaded artifact")
async def remove(artifact_id: str, _: None = Depends(require_auth)) -> Response:
    artifact = get_artifact(artifact_id)
    directory = artifact_dir(artifact)
    if directory.exists():
        with contextlib.suppress(OSError):
            shutil.rmtree(directory)
    return Response(status_code=204)
