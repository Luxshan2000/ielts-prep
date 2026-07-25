"""Content-authoring CLI — 15-content-authoring-licensing.md §3 (`tools/content/`, R2-8).

The *validators* live in the sidecar package (``bandready.content``) because the sidecar runs
the no-LLM subset of them at pack-import time (11 §11.3). This package is the thin authoring
side on top of them: one implementation, three consumers (authoring CLI, sidecar import,
community CI).

Run from the repository root, inside the sidecar's venv::

    uv run --project sidecar python -m tools.content.validate content/core-en
    uv run --project sidecar python -m tools.content.build    content/core-en

``build`` recomputes ``manifest.counts`` + ``manifest.checksums`` and rewrites the manifest in
place; ``validate`` prints a readable report and exits non-zero on failure.
"""

from __future__ import annotations

__all__ = ["DEFAULT_PACK", "REPO_ROOT", "resolve_pack"]

from pathlib import Path

#: Repo root, derived from this file's location (``<root>/tools/content/__init__.py``).
REPO_ROOT: Path = Path(__file__).resolve().parents[2]

#: The first-party pack these tools are usually pointed at.
DEFAULT_PACK: str = "content/core-en"


def resolve_pack(raw: str | None) -> Path:
    """Turn a CLI path argument into an absolute pack root.

    A relative path is resolved against the current directory first (so ``content/core-en``
    works from the repo root) and against the repo root second (so the tools also work when
    invoked from a subdirectory). No existence check happens here — the callers report a
    missing pack through their normal report path so the output stays uniform.
    """
    candidate = Path(raw or DEFAULT_PACK).expanduser()
    if candidate.is_absolute():
        return candidate
    direct = (Path.cwd() / candidate).resolve()
    if direct.exists():
        return direct
    from_root = (REPO_ROOT / candidate).resolve()
    if from_root.exists():
        return from_root
    return direct
