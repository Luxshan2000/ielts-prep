"""Data portability and retention (11-data-model.md §13).

Four routes, all reachable from Settings → Data:

    POST /api/v1/data/export                202 {job_id}  → exports/bandready-export-<date>.zip
    POST /api/v1/data/wipe-recordings       200 {removed, freed_mb, cleared_refs}
    GET  /api/v1/data/generated-audio       200 {files, freed_mb, by_kind, kept_recordings}
    POST /api/v1/data/wipe-generated-audio  200 {removed, freed_mb, by_kind, kept_recordings}

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

The *generated*-audio purge is the exact mirror image and the two must never be confused:
it deletes only what a TTS engine produced (listening renders, cached TTS lines,
pronunciation reference clips, vocabulary audio) and never a single byte of the learner's
own voice. It exists so that "I changed the text-to-speech provider" has an answer that
does not involve deleting the data folder by hand. The boundary is drawn on
``media_files.kind`` + ``pinned``, not on paths, because ``media/pron/ref`` (generated) is
a sibling of ``media/pron/attempts`` (the learner's voice) — a path glob over ``pron/``
would take both. ``is_user_recording`` is then asked a second time per row, exactly as
``evict_cache`` does, so the two guards would have to fail together.
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
from sqlalchemy import bindparam
from sqlalchemy import text as sa_text

from bandready import __version__
from bandready.config import get_settings
from bandready.db.engine import session_scope
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager
from bandready.server.routes.media import CACHE_KINDS, is_user_recording, resolve_rel_path

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


# ------------------------------------------------------------------- generated audio


#: The only four subtrees of ``media/`` that hold engine output. Deliberately written out
#: one by one rather than derived: ``pron/ref`` is generated and ``pron/attempts`` is the
#: learner's voice, so the *parent* ``pron`` must never appear here — and neither must
#: ``speaking`` (recordings) or ``packs`` (shipped content, pinned).
GENERATED_DIRS: tuple[str, ...] = ("listening", "tts-lines", "pron/ref", "vocab")

#: Which ``media_files.kind`` an orphaned file under each directory would have had.
_DIR_KIND: dict[str, str] = {
    "listening": "listening_render",
    "tts-lines": "tts_line",
    "pron/ref": "pron_ref",
    "vocab": "vocab_audio",
}


def _timing_sidecar(path: Path) -> Path:
    """``<hash>.wav`` → ``<hash>.timing.json``.

    The word-timing document a listening render writes next to its WAV is never
    registered in ``media_files`` (only the audio is), so nothing else would ever remove
    it. Left behind it is merely dead weight, but it is dead weight keyed by a hash that
    a future render can legitimately reuse.
    """
    return path.with_name(f"{path.stem}.timing.json")


def _generated_plan() -> dict[str, Any]:
    """Everything the purge would touch, computed without deleting anything.

    Returns ``{rows, files, keep, skipped}`` where ``rows`` is the list of
    ``media_files`` rows to drop, ``files`` maps each on-disk path to the kind it counts
    against, ``keep`` is the set of media-relative paths that are spoken for by a row the
    purge is *not* dropping, and ``skipped`` counts rows the recording guard rejected.
    """
    settings = get_settings()
    media_dir = settings.media_dir

    with session_scope() as session:
        rows = session.execute(
            sa_text(
                "SELECT hash, rel_path, kind FROM media_files "
                "WHERE pinned = 0 AND kind IN :kinds"
            ).bindparams(bindparam("kinds", expanding=True)),
            {"kinds": list(CACHE_KINDS)},
        ).mappings().all()
        every = session.execute(
            sa_text("SELECT rel_path FROM media_files")
        ).scalars().all()

    doomed: list[dict[str, Any]] = []
    skipped = 0
    for row in rows:
        rel = str(row["rel_path"])
        if is_user_recording(rel):
            # Belt and braces, exactly as evict_cache does: a cache `kind` on a path
            # under speaking/ or pron/attempts/ is a bug somewhere upstream, and the
            # answer to a bug in a delete path is to not delete.
            skipped += 1
            _log.warning("refusing to purge %r — it is under a recordings subtree", rel)
            continue
        doomed.append({"hash": str(row["hash"]), "rel_path": rel, "kind": str(row["kind"])})

    dropping = {d["rel_path"].lstrip("/") for d in doomed}
    keep = {str(rel).lstrip("/") for rel in every} - dropping

    files: dict[Path, str] = {}
    for entry in doomed:
        path = resolve_rel_path(entry["rel_path"])
        files[path] = entry["kind"]
        sidecar = _timing_sidecar(path)
        if sidecar.is_file():
            files[sidecar] = entry["kind"]

    # Orphans: renders outlive their row (a restored backup, a reset database over a warm
    # cache) and timing sidecars were never in the table to begin with. Without this pass
    # "delete it all and try new settings" would leave the old provider's bytes exactly
    # where the next lookup finds them.
    for sub in GENERATED_DIRS:
        root = media_dir / sub
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path in files:
                continue
            try:
                rel = path.relative_to(media_dir).as_posix()
            except ValueError:  # pragma: no cover — rglob cannot leave its root
                continue
            if is_user_recording(rel) or rel in keep:
                continue
            files[path] = _DIR_KIND[sub]

    return {"rows": doomed, "files": files, "keep": keep, "skipped": skipped}


def _kept_recordings() -> int:
    """How many of the learner's own audio files this purge leaves alone. All of them."""
    return len(_recording_files(get_settings().media_dir))


def _survey_generated_audio() -> dict[str, Any]:
    """Dry run: the same numbers the purge would report, with nothing unlinked."""
    plan = _generated_plan()
    by_kind: dict[str, int] = {}
    total = 0
    for path, kind in plan["files"].items():
        try:
            total += path.stat().st_size
        except OSError:
            continue
        by_kind[kind] = by_kind.get(kind, 0) + 1
    return {
        "files": len(plan["files"]),
        "freed_mb": round(total / (1024 * 1024), 2),
        "by_kind": by_kind,
        "kept_recordings": _kept_recordings(),
    }


def _wipe_generated_audio() -> dict[str, Any]:
    """Delete every generated audio file. The learner's own recordings are not in scope."""
    settings = get_settings()
    media_dir = settings.media_dir
    plan = _generated_plan()

    removed = 0
    freed = 0
    by_kind: dict[str, int] = {}
    failures: list[str] = []
    gone: set[Path] = set()
    for path, kind in plan["files"].items():
        try:
            size = path.stat().st_size
            path.unlink()
        except FileNotFoundError:
            gone.add(path)
            continue
        except OSError as exc:
            failures.append(f"{path.name}: {exc.strerror or exc}")
            continue
        gone.add(path)
        removed += 1
        freed += size
        by_kind[kind] = by_kind.get(kind, 0) + 1

    # Only forget a row whose file is actually gone: a row kept alongside a file that
    # could not be unlinked is the recoverable half of the failure.
    hashes = [
        entry["hash"]
        for entry in plan["rows"]
        if resolve_rel_path(entry["rel_path"]) in gone
    ]
    try:
        with session_scope() as session:
            for chunk in (hashes[i : i + 400] for i in range(0, len(hashes), 400)):
                # NULL the referrer FIRST: `listening_scripts.audio_hash` is a real
                # foreign key onto `media_files.hash`, so deleting the row first raises
                # IntegrityError and the whole purge rolls back with the files gone.
                session.execute(
                    sa_text(
                        "UPDATE listening_scripts SET audio_hash = NULL WHERE audio_hash IN :h"
                    ).bindparams(bindparam("h", expanding=True)),
                    {"h": chunk},
                )
                session.flush()
                session.execute(
                    sa_text("DELETE FROM media_files WHERE hash IN :h").bindparams(
                        bindparam("h", expanding=True)
                    ),
                    {"h": chunk},
                )
    except Exception as exc:
        _log.exception("generated-audio purge unlinked files but could not clear media_files")
        raise ApiError(
            500,
            "internal",
            f"deleted {removed} files but the database still references them: {exc}",
        ) from exc

    # Best effort tidy-up of the now-empty voice/accent subdirectories.
    for sub in GENERATED_DIRS:
        root = media_dir / sub
        if not root.is_dir():
            continue
        for directory in sorted((p for p in root.rglob("*") if p.is_dir()), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass

    if failures:
        _log.warning(
            "generated-audio purge could not delete %d file(s): %s", len(failures), failures[:5]
        )
    _log.info(
        "generated-audio purge removed %d file(s), %.1f MB, kinds=%s",
        removed,
        freed / (1024 * 1024),
        by_kind,
    )

    return {
        "removed": removed,
        "freed_mb": round(freed / (1024 * 1024), 2),
        "by_kind": by_kind,
        "kept_recordings": _kept_recordings(),
        "failed": failures[:20],
    }


@router.get("/generated-audio", summary="What a generated-audio purge would delete")
async def generated_audio_survey(_: Auth = None) -> dict[str, Any]:
    """Dry run. Deletes nothing — it exists so the confirmation dialog can be specific."""
    return await asyncio.to_thread(_survey_generated_audio)


@router.post("/wipe-generated-audio", summary="Delete every generated audio file")
async def wipe_generated_audio_route(_: Auth = None) -> dict[str, Any]:
    """Synchronous from the caller's view; the unlink loop runs off the event loop."""
    return await asyncio.to_thread(_wipe_generated_audio)
