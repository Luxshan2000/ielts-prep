"""Adopt model weights that already exist elsewhere on this machine.

Downloading Kokoro (~340 MB) and Whisper (145 MB - 1.6 GB) is the slowest part of
first run, and on a metered or slow connection it is the difference between the app
being usable today and not. Many machines already hold these exact files, put there
by another Pipecat app, a previous BandReady install, or a bare ``faster-whisper``
run that populated the Hugging Face cache.

This module finds those files and adopts them into ``<data_dir>/models/`` instead of
re-fetching. Adoption prefers a hard link (instant, zero extra disk, same inode) and
falls back to a copy across filesystems. Sources are never modified or removed --
the other app keeps working.

Discovery is intentionally conservative: a candidate is only adopted when every file
the artifact declares is present and non-empty, so a half-finished download in
someone else's cache can never masquerade as a complete artifact.
"""

from __future__ import annotations

import logging
import os
import shutil
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

__all__ = [
    "LocalHit",
    "adopt",
    "adopt_all",
    "discover",
    "search_roots",
]


# --------------------------------------------------------------------------- #
# Where weights tend to live already
# --------------------------------------------------------------------------- #

def _env_paths(*names: str) -> list[Path]:
    out: list[Path] = []
    for name in names:
        raw = os.environ.get(name)
        if raw:
            out.append(Path(raw).expanduser())
    return out


def search_roots() -> dict[str, list[Path]]:
    """Directories worth searching, grouped by the layout they use.

    ``BANDREADY_MODEL_SEARCH_PATH`` (os.pathsep-separated) is honoured first so a
    user can point at an external drive or a sibling checkout.
    """
    home = Path.home()
    extra = [
        Path(p).expanduser()
        for p in (os.environ.get("BANDREADY_MODEL_SEARCH_PATH") or "").split(os.pathsep)
        if p.strip()
    ]

    # Flat directories holding the Kokoro release files side by side.
    flat = [
        *extra,
        *_env_paths("OVUI_KOKORO_MODEL", "OVUI_KOKORO_VOICES"),
        home / ".cache" / "pipecat" / "kokoro-onnx",
        home / ".cache" / "pipecat",
        home / ".cache" / "kokoro-onnx",
        home / ".local" / "share" / "kokoro",
    ]
    # Anything that looks like a file was given via env (OVUI_KOKORO_MODEL points at
    # the .onnx itself); search its parent instead.
    flat = [p.parent if p.suffix else p for p in flat]

    # Hugging Face style: <hub>/models--<org>--<repo>/snapshots/<rev>/<files>
    hf: list[Path] = [*extra]
    for base in (*_env_paths("HF_HOME", "HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE"),):
        hf.extend((base / "hub", base))
    hf.append(home / ".cache" / "huggingface" / "hub")
    hf.append(home / ".cache" / "huggingface")

    def _live(paths: Iterable[Path]) -> list[Path]:
        seen: set[Path] = set()
        out: list[Path] = []
        for p in paths:
            try:
                rp = p.resolve()
            except OSError:
                continue
            if rp in seen or not rp.is_dir():
                continue
            seen.add(rp)
            out.append(rp)
        return out

    return {"flat": _live(flat), "hf": _live(hf)}


# --------------------------------------------------------------------------- #
# Discovery
# --------------------------------------------------------------------------- #

@dataclass(slots=True)
class LocalHit:
    """A complete artifact found on disk outside our data dir."""

    artifact_id: str
    source: Path
    files: dict[str, Path] = field(default_factory=dict)
    total_bytes: int = 0

    @property
    def total_mb(self) -> int:
        return round(self.total_bytes / (1024 * 1024))

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "source": str(self.source),
            "files": sorted(self.files),
            "size_mb": self.total_mb,
        }


def _wanted_files(artifact: Mapping[str, Any]) -> list[str]:
    return [str(f["name"]) for f in artifact.get("files") or [] if f.get("name")]


def _complete(directory: Path, names: Iterable[str]) -> dict[str, Path] | None:
    """Return the resolved files iff every one exists and is non-empty."""
    found: dict[str, Path] = {}
    for name in names:
        candidate = directory / name
        try:
            if not candidate.is_file() or candidate.stat().st_size == 0:
                return None
        except OSError:
            return None
        found[name] = candidate
    return found or None


def _hf_snapshot_dirs(root: Path, repo: str) -> list[Path]:
    """Snapshot directories for ``org/name`` under a HF hub root, newest first."""
    folder = root / ("models--" + repo.replace("/", "--"))
    snaps = folder / "snapshots"
    if not snaps.is_dir():
        return []
    try:
        entries = [d for d in snaps.iterdir() if d.is_dir()]
    except OSError:
        return []
    entries.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return entries


def discover(
    artifacts: Iterable[Mapping[str, Any]],
    *,
    models_dir: Path | None = None,
) -> list[LocalHit]:
    """Find artifacts already present on this machine but not yet in our models dir.

    Artifacts we already hold are skipped, so this is safe to call on every boot.
    """
    roots = search_roots()
    hits: list[LocalHit] = []

    for artifact in artifacts:
        artifact_id = str(artifact.get("id") or "")
        names = _wanted_files(artifact)
        if not artifact_id or not names:
            continue

        # Already installed? Nothing to adopt.
        if models_dir is not None:
            dest = models_dir / str(artifact.get("dest") or artifact_id)
            if _complete(dest, names):
                continue

        found: dict[str, Path] | None = None
        source: Path | None = None

        # 1. Hugging Face layout, when the artifact names its repo.
        repo = artifact.get("hf_repo")
        if repo:
            for root in roots["hf"]:
                for snapshot in _hf_snapshot_dirs(root, str(repo)):
                    found = _complete(snapshot, names)
                    if found:
                        source = snapshot
                        break
                if found:
                    break

        # 2. Flat directories (Kokoro and friends).
        if not found:
            for root in roots["flat"]:
                found = _complete(root, names)
                if found:
                    source = root
                    break
                # One level down covers ~/.cache/pipecat -> kokoro-onnx/.
                try:
                    children = [d for d in root.iterdir() if d.is_dir()]
                except OSError:
                    children = []
                for child in children:
                    found = _complete(child, names)
                    if found:
                        source = child
                        break
                if found:
                    break

        if found and source is not None:
            total = 0
            for path in found.values():
                try:
                    total += path.stat().st_size
                except OSError:
                    # The file vanished (or is unreadable) between the glob and the
                    # stat. The size is cosmetic — it only sizes a "reuse this?"
                    # prompt — so an under-count is better than failing detection.
                    pass
            hits.append(LocalHit(artifact_id, source, found, total))

    return hits


# --------------------------------------------------------------------------- #
# Adoption
# --------------------------------------------------------------------------- #

def _link_or_copy(src: Path, dst: Path) -> str:
    """Hard link when we can, copy when we must. Returns the method used."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
        return "link"
    except OSError:
        # Different filesystem, or a filesystem without hard links.
        tmp = dst.with_name(dst.name + ".part")
        shutil.copy2(src, tmp)
        tmp.replace(dst)
        return "copy"


def adopt(hit: LocalHit, artifact: Mapping[str, Any], models_dir: Path) -> dict[str, Any]:
    """Install one discovered artifact into the models dir.

    The source is left untouched, so whichever app put it there keeps working.
    """
    dest = models_dir / str(artifact.get("dest") or hit.artifact_id)
    methods: set[str] = set()
    for name, src in hit.files.items():
        methods.add(_link_or_copy(src, dest / name))

    method = "link" if methods == {"link"} else ("copy" if methods == {"copy"} else "mixed")
    log.info(
        "adopted %s from %s into %s (%s, %d MB)",
        hit.artifact_id, hit.source, dest, method, hit.total_mb,
    )
    return {
        "artifact_id": hit.artifact_id,
        "source": str(hit.source),
        "dest": str(dest),
        "method": method,
        "size_mb": hit.total_mb,
        "files": sorted(hit.files),
    }


def adopt_all(
    artifacts: Iterable[Mapping[str, Any]],
    models_dir: Path,
) -> list[dict[str, Any]]:
    """Discover and adopt everything available. Never raises -- adoption is a bonus.

    Returns one record per adopted artifact (empty when there was nothing to reuse).
    """
    by_id = {str(a.get("id")): a for a in artifacts if a.get("id")}
    results: list[dict[str, Any]] = []
    try:
        hits = discover(by_id.values(), models_dir=models_dir)
    except Exception:  # pragma: no cover - discovery must never break boot
        log.exception("local model discovery failed")
        return results

    for hit in hits:
        artifact = by_id.get(hit.artifact_id)
        if artifact is None:
            continue
        try:
            results.append(adopt(hit, artifact, models_dir))
        except Exception:
            log.exception("could not adopt %s from %s", hit.artifact_id, hit.source)
    return results
