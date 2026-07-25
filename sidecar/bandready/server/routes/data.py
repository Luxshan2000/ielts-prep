"""Data portability and retention (11-data-model.md §13).

Two routes, both reachable from Settings → Data:

    POST /api/v1/data/export           202 {job_id}  → exports/bandready-export-<date>.zip
    POST /api/v1/data/wipe-recordings  200 {removed, freed_mb, cleared_refs}

The export is deliberately job-backed: a heavy user's ``media/`` tree is the bulk of the
archive and zipping it can take minutes, which is far past the renderer's fetch patience.
The wipe is synchronous — it only unlinks files and NULLs two columns.

**Never exported**: nothing. The archive is self-contained by design (11 §13) — content
bank tables ride along so a future "import export" restores onto a fresh install without
needing the original pack. **Never included**: SQL views and ``vocab_fts``; both are
derived, and ``Base.metadata.tables`` excludes them for us because neither is declared as
an ORM table.

**Never touched by the wipe**: transcripts, metrics, band scores and reports. Only the
audio of the learner's own voice is deleted, and only after an explicit confirmation in
the UI — 11 §9 rule 1 forbids ever removing these files implicitly.
"""

from __future__ import annotations

import asyncio
import json
import logging
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text as sa_text

from bandready import __version__
from bandready.config import get_settings
from bandready.db.engine import session_scope
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.routes.data")

router = APIRouter(prefix="/api/v1/data", tags=["data"])

Auth = Annotated[None, Depends(require_auth)]

#: Subtrees of ``<data_dir>/media`` that hold the learner's own voice (11 §9 rule 1).
RECORDING_DIRS: tuple[str, ...] = ("speaking", "pron/attempts")


def _now_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _schema_head() -> str | None:
    """The applied alembic revision, so a restore can refuse a newer archive."""
    try:
        with session_scope() as s:
            row = s.execute(sa_text("SELECT version_num FROM alembic_version")).first()
        return str(row[0]) if row else None
    except Exception:  # noqa: BLE001 — the manifest degrades to null, never fails the export
        _log.warning("could not read alembic_version for the export manifest", exc_info=True)
        return None


def _table_names() -> list[str]:
    """Every real table, ordered as declared. Views and ``vocab_fts`` are not ORM tables."""
    from bandready.db.models import Base

    return list(Base.metadata.tables.keys())


def _rows_as_jsonl(session: Any, table: str) -> tuple[str, int]:
    """Dump one table as JSONL. BLOBs are not used anywhere in the schema (11 §2)."""
    result = session.execute(sa_text(f'SELECT * FROM "{table}"'))
    columns = list(result.keys())
    lines: list[str] = []
    for row in result:
        record = {col: row[i] for i, col in enumerate(columns)}
        lines.append(json.dumps(record, ensure_ascii=False, default=str))
    return ("\n".join(lines) + ("\n" if lines else "")), len(lines)


def _recording_files(media_dir: Path) -> list[Path]:
    files: list[Path] = []
    for rel in RECORDING_DIRS:
        root = media_dir / rel
        if not root.is_dir():
            continue
        files.extend(p for p in root.rglob("*") if p.is_file())
    return files


def _build_export(job_id: str) -> dict[str, Any]:
    """Write the archive and return `{path, bytes, tables, media_files}`."""
    settings = get_settings()
    settings.ensure_dirs()
    exports_dir = settings.exports_dir
    exports_dir.mkdir(parents=True, exist_ok=True)

    target = exports_dir / f"bandready-export-{_now_stamp()}.zip"
    tmp = target.with_suffix(".zip.partial")

    tables = _table_names()
    counts: dict[str, int] = {}
    media_dir = settings.media_dir
    recordings = _recording_files(media_dir)
    total_steps = len(tables) + len(recordings) + 1

    try:
        with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            with session_scope() as session:
                for index, table in enumerate(tables):
                    job_manager.set_progress(
                        job_id,
                        round(100 * index / total_steps, 1),
                        f"exporting {table}",
                    )
                    payload, count = _rows_as_jsonl(session, table)
                    counts[table] = count
                    zf.writestr(f"data/{table}.jsonl", payload)

            for offset, path in enumerate(recordings):
                if offset % 25 == 0:
                    job_manager.set_progress(
                        job_id,
                        round(100 * (len(tables) + offset) / total_steps, 1),
                        f"copying recordings ({offset + 1}/{len(recordings)})",
                    )
                zf.write(path, f"media/{path.relative_to(media_dir).as_posix()}")

            manifest = {
                "format": "bandready-export",
                "format_version": 1,
                "app_version": __version__,
                "schema_version": _schema_head(),
                "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "counts": counts,
                "media_files": len(recordings),
                "notes": (
                    "Self-contained export (11 §13). SQL views and vocab_fts are derived "
                    "and intentionally absent."
                ),
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

        tmp.replace(target)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise

    job_manager.set_progress(job_id, 100, "export complete")
    _log.info("data export written to %s (%d tables, %d recordings)",
              target, len(tables), len(recordings))
    return {
        "path": str(target),
        "bytes": target.stat().st_size,
        "tables": len(tables),
        "rows": sum(counts.values()),
        "media_files": len(recordings),
    }


async def _export_job(job_id: str) -> dict[str, Any]:
    """Zipping is blocking file I/O — it must never run on the event loop (01 §4.3)."""
    return await asyncio.to_thread(_build_export, job_id)


@router.post("/export", summary="Export every profile row and recording as a zip")
async def export_data(response: Response, _: Auth = None) -> dict[str, Any]:
    """202 + `{job_id}` — poll `GET /api/v1/jobs/{id}`; the result carries `path`."""
    job_id = job_manager.submit("data_export", _export_job)
    response.status_code = 202
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id}


def _wipe_recordings() -> dict[str, Any]:
    """11 §13 'wipe recordings': audio only. Transcripts and scores are untouched."""
    settings = get_settings()
    media_dir = settings.media_dir
    files = _recording_files(media_dir)

    removed = 0
    freed = 0
    failures: list[str] = []
    for path in files:
        try:
            size = path.stat().st_size
            path.unlink()
            removed += 1
            freed += size
        except OSError as exc:
            failures.append(f"{path.name}: {exc.strerror or exc}")

    # Drop the now-dangling directories (best effort — a live session may hold one open).
    for rel in RECORDING_DIRS:
        root = media_dir / rel
        if not root.is_dir():
            continue
        for directory in sorted((p for p in root.rglob("*") if p.is_dir()), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                # Not empty (a live session is still writing) or held open by the OS.
                # Leaving an empty-ish directory behind is harmless; the files the
                # learner asked to delete are already gone and counted in `failures`.
                pass

    cleared = 0
    try:
        with session_scope() as session:
            cleared += session.execute(
                sa_text("UPDATE speaking_turns SET audio_path = NULL WHERE audio_path IS NOT NULL")
            ).rowcount or 0
            cleared += session.execute(
                sa_text("UPDATE pron_scores SET audio_path = NULL WHERE audio_path IS NOT NULL")
            ).rowcount or 0
    except Exception as exc:
        _log.exception("recording wipe removed files but could not clear the audio_path columns")
        raise ApiError(
            500,
            "internal",
            f"deleted {removed} files but the database still references them: {exc}",
        ) from exc

    if failures:
        _log.warning("recording wipe could not delete %d file(s): %s", len(failures), failures[:5])

    return {
        "removed": removed,
        "freed_mb": round(freed / (1024 * 1024), 2),
        "cleared_refs": cleared,
        "failed": failures[:20],
    }


@router.post("/wipe-recordings", summary="Delete every practice recording, keep the history")
async def wipe_recordings_route(_: Auth = None) -> dict[str, Any]:
    """Synchronous from the caller's view; the unlink loop runs off the event loop."""
    return await asyncio.to_thread(_wipe_recordings)
