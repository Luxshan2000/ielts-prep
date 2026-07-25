"""Media serving — 18-api-contract.md §4.16, on-disk layout 11-data-model.md §9.

``GET /api/v1/media/{kind}/{path}`` serves files from ``<data_dir>/media`` (and from
``<data_dir>/packs`` for pinned pack media, resolved through ``media_files.rel_path``).

Auth: a §2 signed ticket whose ``resource`` is **the exact request path** — ``<audio>``
elements cannot send headers — or a bearer token for XHR fetches. Both are accepted;
neither is optional.

Range requests are supported (``206`` + ``Content-Range``) because the practice-mode
listening player seeks, and a ticket is reusable inside its 60 s TTL precisely so seeking
does not need a new ticket per range.

Eviction (11 §9): **user recordings are never auto-evicted.** ``evict_cache`` only ever
touches ``media_files`` rows with ``pinned=0`` and a cache ``kind``; recordings under
``media/speaking/`` and ``media/pron/attempts/`` are not in that table at all, so they
cannot be reached by the LRU sweep even by accident.
"""

from __future__ import annotations

import logging
import mimetypes
import re
from pathlib import Path
from typing import Any, Iterator

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from bandready.curriculum.estimate import iso, utcnow
from bandready.db.engine import get_session
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.tickets import require_ticket

_log = logging.getLogger("bandready.routes.media")

router = APIRouter(prefix="/api/v1/media", tags=["media"])

# The subtrees a client may address, mapped to their directory under <data_dir>/media.
KINDS: dict[str, str] = {
    "listening": "listening",
    "speaking": "speaking",
    "vocab": "vocab",
    "pron": "pron",
    "tts-lines": "tts-lines",
    "packs": "packs",
}

# Never auto-evicted (11 §9 rule 1) — user voice data.
RECORDING_PREFIXES: tuple[str, ...] = ("speaking/", "pron/attempts/")

CACHE_KINDS: tuple[str, ...] = ("listening_render", "tts_line", "vocab_audio", "pron_ref")

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
CHUNK = 64 * 1024


# --------------------------------------------------------------------------------------
# Path resolution
# --------------------------------------------------------------------------------------


def media_dir() -> Path:
    from bandready.config import get_settings

    return get_settings().media_dir


def data_dir() -> Path:
    from bandready.config import get_settings

    return get_settings().data_dir


def resolve_rel_path(rel_path: str) -> Path:
    """``media_files.rel_path`` is media-relative, except pinned pack media (``packs/…``)."""
    rel = str(rel_path).lstrip("/")
    base = data_dir() if rel.startswith("packs/") else media_dir()
    return base / rel


def _safe_join(base: Path, *parts: str) -> Path:
    candidate = base
    for part in parts:
        for segment in str(part).split("/"):
            if not segment or segment == ".":
                continue
            if segment == ".." or "\\" in segment:
                raise ApiError(422, "validation_error", "invalid media path")
            candidate = candidate / segment
    resolved = candidate.resolve()
    root = base.resolve()
    if root != resolved and root not in resolved.parents:
        raise ApiError(422, "validation_error", "invalid media path")
    return resolved


def is_user_recording(rel_path: str) -> bool:
    rel = str(rel_path).lstrip("/")
    return rel.startswith(RECORDING_PREFIXES)


def _by_hash(session: Session, name: str) -> Path | None:
    """Hash-addressed cache files (``<sha256>.wav``) resolve through ``media_files``."""
    stem = Path(name).stem
    if len(stem) != 64 or not re.fullmatch(r"[0-9a-f]{64}", stem):
        return None
    row = session.execute(
        text("SELECT rel_path FROM media_files WHERE hash = :h"), {"h": stem}
    ).first()
    if row is None:
        return None
    candidate = resolve_rel_path(str(row[0]))
    if candidate.suffix != Path(name).suffix:
        candidate = candidate.with_suffix(Path(name).suffix)
    return candidate if candidate.is_file() else None


def _touch(session: Session, path: Path) -> None:
    """LRU bookkeeping for cache files; recordings are deliberately not tracked."""
    try:
        rel = path.resolve().relative_to(media_dir().resolve()).as_posix()
    except ValueError:
        try:
            rel = "packs/" + path.resolve().relative_to((data_dir() / "packs").resolve()).as_posix()
        except ValueError:
            return
    if is_user_recording(rel):
        return
    session.execute(
        text("UPDATE media_files SET last_access_at = :now WHERE rel_path = :rel"),
        {"now": iso(utcnow()), "rel": rel},
    )


# --------------------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------------------


def _authorize(request: Request, ticket: str | None) -> None:
    """Bearer OR a ticket bound to this exact path (18 §2)."""
    if getattr(request.state, "auth_kind", None) == "bearer":
        return
    require_ticket(ticket, "media-read", request.url.path)


# --------------------------------------------------------------------------------------
# Range serving
# --------------------------------------------------------------------------------------


def _iter_range(path: Path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as fh:
        fh.seek(start)
        while remaining > 0:
            block = fh.read(min(CHUNK, remaining))
            if not block:
                break
            remaining -= len(block)
            yield block


def serve_file(path: Path, request: Request, filename: str | None = None) -> Response:
    if not path.is_file():
        raise ApiError(404, "not_found", f"no media file {filename or path.name}")
    size = path.stat().st_size
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"}

    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type=media_type, headers=headers)

    match = RANGE_RE.fullmatch(range_header.strip())
    if match is None:
        return FileResponse(path, media_type=media_type, headers=headers)
    raw_start, raw_end = match.group(1), match.group(2)
    if raw_start:
        start = int(raw_start)
        end = int(raw_end) if raw_end else size - 1
    else:  # suffix range: bytes=-500
        length = int(raw_end or 0)
        start = max(0, size - length)
        end = size - 1
    end = min(end, size - 1)
    if start >= size or start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )
    return StreamingResponse(
        _iter_range(path, start, end),
        status_code=206,
        media_type=media_type,
        headers={
            **headers,
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(end - start + 1),
        },
    )


# --------------------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------------------


@router.get("/usage", summary="Disk usage per media category (11 §9.4)")
def media_usage(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    base = media_dir()
    categories = {
        "recordings": ["speaking", "pron/attempts"],
        "cache": ["listening", "tts-lines", "vocab", "pron/ref"],
    }
    out: dict[str, Any] = {"data_dir": str(data_dir())}
    for label, subdirs in categories.items():
        total = 0
        for sub in subdirs:
            directory = base / sub
            if directory.is_dir():
                total += sum(p.stat().st_size for p in directory.rglob("*") if p.is_file())
        out[label] = {"bytes": total, "never_evicted": label == "recordings"}
    packs = data_dir() / "packs"
    out["packs"] = {
        "bytes": sum(p.stat().st_size for p in packs.rglob("*") if p.is_file())
        if packs.is_dir()
        else 0,
        "never_evicted": True,
    }
    row = session.execute(
        text("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM media_files")
    ).mappings().first()
    out["indexed"] = {"files": int((row or {}).get("n") or 0), "bytes": int((row or {}).get("b") or 0)}
    out["cache_budget_mb"] = _cache_budget_mb()
    return out


def _cache_budget_mb() -> int:
    try:
        from bandready.settings_store import load_settings

        return int((load_settings().get("media") or {}).get("cache_budget_mb") or 2048)
    except Exception:  # noqa: BLE001
        return 2048


def evict_cache(session: Session, budget_mb: int | None = None) -> dict[str, Any]:
    """LRU-prune unpinned cache files down to the budget. Recordings are untouchable."""
    budget_bytes = (budget_mb if budget_mb is not None else _cache_budget_mb()) * 1024 * 1024
    rows = session.execute(
        text(
            "SELECT hash, rel_path, bytes, kind FROM media_files "
            "WHERE pinned = 0 AND kind IN :kinds ORDER BY last_access_at DESC"
        ).bindparams(bindparam("kinds", expanding=True)),
        {"kinds": list(CACHE_KINDS)},
    ).mappings().all()

    total = sum(int(r["bytes"] or 0) for r in rows)
    removed: list[str] = []
    freed = 0
    for row in reversed(rows):  # oldest access first
        if total <= budget_bytes:
            break
        if is_user_recording(str(row["rel_path"])):  # belt and braces
            continue
        path = resolve_rel_path(str(row["rel_path"]))
        try:
            if path.is_file():
                path.unlink()
        except OSError as exc:  # noqa: PERF203
            _log.warning("could not evict %s: %s", path, exc)
            continue
        session.execute(
            text("DELETE FROM media_files WHERE hash = :h"), {"h": row["hash"]}
        )
        session.execute(
            text("UPDATE listening_scripts SET audio_hash = NULL WHERE audio_hash = :h"),
            {"h": row["hash"]},
        )
        total -= int(row["bytes"] or 0)
        freed += int(row["bytes"] or 0)
        removed.append(str(row["hash"]))
    return {"evicted": len(removed), "freed_bytes": freed, "budget_mb": budget_bytes // 1048576}


@router.post("/cache/evict", summary="Prune the generated-audio cache to its budget")
def media_evict(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return evict_cache(session)


@router.get("/pron/ref", summary="Kokoro-rendered reference audio (cached)")
def pron_reference(
    request: Request,
    text_: str = "",
    voice: str = "af_heart",
    ticket: str | None = None,
    session: Session = Depends(get_session),
) -> Response:
    """09 §5.2 cache read. Rendering on miss belongs to the TTS provider (07/09)."""
    _authorize(request, ticket)
    from hashlib import sha1

    phrase = (request.query_params.get("text") or text_ or "").strip()
    if not phrase:
        raise ApiError(422, "validation_error", "text= is required")
    digest = sha1(phrase.encode("utf-8")).hexdigest()  # noqa: S324 — cache key, not a secret
    path = _safe_join(media_dir(), "pron", "ref", voice, f"{digest}.wav")
    if not path.is_file():
        raise ApiError(
            404,
            "not_found",
            "reference audio has not been rendered yet — request it from the TTS provider first",
        )
    _touch(session, path)
    return serve_file(path, request, filename=path.name)


@router.get("/{kind}/{path:path}", summary="Serve a media file (ticket or bearer auth)")
def get_media(
    kind: str,
    path: str,
    request: Request,
    ticket: str | None = None,
    session: Session = Depends(get_session),
) -> Response:
    _authorize(request, ticket)
    subdir = KINDS.get(kind)
    if subdir is None:
        raise ApiError(404, "not_found", f"unknown media kind {kind!r}")
    if not path:
        raise ApiError(422, "validation_error", "a media path is required")

    base = data_dir() if kind == "packs" else media_dir()
    resolved = _safe_join(base, subdir if kind != "packs" else "packs", path)
    if not resolved.is_file():
        hashed = _by_hash(session, Path(path).name)
        if hashed is None:
            raise ApiError(404, "not_found", f"no media file {kind}/{path}")
        resolved = hashed
    _touch(session, resolved)
    return serve_file(resolved, request, filename=f"{kind}/{path}")


__all__ = ["router", "evict_cache", "serve_file", "resolve_rel_path", "is_user_recording"]
