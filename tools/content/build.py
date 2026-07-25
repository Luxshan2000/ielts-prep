"""`python -m tools.content.build <pack>` — recompute manifest counts + checksums in place.

    uv run --project sidecar python -m tools.content.build content/core-en

11 §11.2 makes ``manifest.checksums`` exhaustive: **every** file under ``data/`` and ``media/``
must be listed, and a mismatch rejects the pack whole at import (11 §11.3). Authoring by hand
therefore means hand-maintaining a sha256 table, which nobody does correctly — so this is the
one blessed writer of those two fields. Authors edit ``data/*.jsonl``, run this, and commit.

What it rewrites, and nothing else:

* ``counts``    — rows per ``data/*.jsonl`` file, keyed by file stem (11 §11.2's example keys:
  ``card_sets``, ``speaking_cards``, …, ``vocab``). Blank lines and ``//`` comment lines do not
  count, matching :func:`bandready.content.validate.iter_jsonl`.
* ``checksums`` — ``"<rel/path>": "sha256:<hex>"`` for every payload file, sorted by path.

Key order, indentation and every other manifest field are preserved; the file is written
atomically. ``--check`` computes without writing and exits non-zero if the manifest is stale,
which is what CI runs. After a successful write the pack is re-validated *with* checksum
verification (skippable with ``--skip-validate``), because a manifest that is internally
consistent but whose rows are malformed is still a pack that will not import.

Exit codes: ``0`` written/up to date and valid, ``1`` stale (``--check``) or invalid, ``2`` bad
usage or unreadable pack.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from tools.content import DEFAULT_PACK, resolve_pack
from tools.content.validate import render_text

from bandready.content.validate import (
    MANIFEST_NAME,
    ROW_SCHEMAS,
    iter_jsonl,
    payload_files,
    sha256_file,
    validate_pack,
)

#: ``counts`` key for each data file, in the manifest's documented order (11 §11.2).
COUNT_KEYS: tuple[tuple[str, str], ...] = tuple(
    (name, name.removesuffix(".jsonl"))
    for name in (
        "topics.jsonl",
        "card_sets.jsonl",
        "speaking_cards.jsonl",
        "writing_prompts.jsonl",
        "reading_passages.jsonl",
        "reading_tests.jsonl",
        "listening_scripts.jsonl",
        "listening_tests.jsonl",
        "vocab.jsonl",
        "pron_pairs.jsonl",
    )
)


class BuildError(Exception):
    """A problem that stops the build before anything is written."""


# --------------------------------------------------------------------------------------
# Computation
# --------------------------------------------------------------------------------------


def count_rows(path: Path) -> int:
    """Rows in one JSONL file, counted exactly the way the importer reads them."""
    try:
        return sum(1 for _ in iter_jsonl(path))
    except (OSError, ValueError) as exc:
        raise BuildError(f"{path.name}: {exc}") from exc


def compute_counts(root: Path) -> dict[str, int]:
    """Row counts for the data files that exist, in manifest order.

    Unrecognised ``data/*.jsonl`` files are counted too (under their stem) so a pack that
    ships something new is still described honestly, but they sort after the known keys.
    """
    data_dir = root / "data"
    counts: dict[str, int] = {}
    if not data_dir.is_dir():
        return counts
    for name, key in COUNT_KEYS:
        path = data_dir / name
        if path.is_file():
            counts[key] = count_rows(path)
    for path in sorted(data_dir.glob("*.jsonl")):
        if path.name in ROW_SCHEMAS:
            continue
        counts.setdefault(path.name.removesuffix(".jsonl"), count_rows(path))
    return counts


def compute_checksums(root: Path) -> dict[str, str]:
    """``sha256:`` digests for every ``data/`` and ``media/`` file, keyed by relative path."""
    return {
        path.relative_to(root).as_posix(): f"sha256:{sha256_file(path)}"
        for path in payload_files(root)
    }


def detect_indent(text: str) -> int:
    """Indent width of the existing manifest, so a rewrite is a minimal diff."""
    for line in text.splitlines():
        stripped = line.lstrip(" ")
        if stripped.startswith('"') and len(line) > len(stripped):
            return len(line) - len(stripped)
    return 2


# --------------------------------------------------------------------------------------
# Manifest rewrite
# --------------------------------------------------------------------------------------


def read_manifest_text(root: Path) -> tuple[dict[str, Any], str]:
    path = root / MANIFEST_NAME
    if not path.is_file():
        raise BuildError(f"{path} is missing — a pack root must contain {MANIFEST_NAME}")
    text = path.read_text(encoding="utf-8")
    try:
        raw = json.loads(text)
    except ValueError as exc:
        raise BuildError(f"{MANIFEST_NAME} is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise BuildError(f"{MANIFEST_NAME} must contain a JSON object")
    return raw, text


def apply(
    manifest: dict[str, Any], counts: dict[str, int], checksums: dict[str, str]
) -> dict[str, Any]:
    """A copy of ``manifest`` with ``counts``/``checksums`` replaced, key order preserved.

    A manifest that never declared the fields gets them appended, so a hand-started pack
    only needs the mandatory keys.
    """
    out = dict(manifest)
    out["counts"] = dict(counts)
    out["checksums"] = {key: checksums[key] for key in sorted(checksums)}
    return out


def write_atomic(path: Path, payload: dict[str, Any], indent: int) -> None:
    text = json.dumps(payload, indent=indent, ensure_ascii=False) + "\n"
    handle, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".manifest-", suffix=".json")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as fh:
            fh.write(text)
        tmp.replace(path)
    finally:
        if tmp.exists():  # pragma: no cover — only on a failed replace
            tmp.unlink(missing_ok=True)


def diff_summary(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """Human lines describing what a write would change (empty = already up to date)."""
    lines: list[str] = []
    old_counts = before.get("counts") or {}
    new_counts = after["counts"]
    for key in sorted(set(old_counts) | set(new_counts)):
        old = old_counts.get(key)
        new = new_counts.get(key)
        if old != new:
            lines.append(f"counts.{key}: {old!r} -> {new!r}")

    old_sums = {k.replace("\\", "/"): v for k, v in (before.get("checksums") or {}).items()}
    new_sums = after["checksums"]
    for key in sorted(set(old_sums) | set(new_sums)):
        old = old_sums.get(key)
        new = new_sums.get(key)
        if old == new:
            continue
        if old is None:
            lines.append(f"checksums + {key}")
        elif new is None:
            lines.append(f"checksums - {key}")
        else:
            lines.append(f"checksums ~ {key}")
    return lines


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.build",
        description="Recompute manifest counts + sha256 checksums for a content pack.",
    )
    parser.add_argument(
        "pack",
        nargs="?",
        default=DEFAULT_PACK,
        help=f"pack root containing manifest.json (default: {DEFAULT_PACK})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit 1 if counts/checksums are stale (CI mode)",
    )
    parser.add_argument(
        "--skip-validate",
        action="store_true",
        help="do not re-validate the pack after writing",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="print only what changed",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = resolve_pack(args.pack)

    try:
        manifest, text = read_manifest_text(root)
        counts = compute_counts(root)
        checksums = compute_checksums(root)
    except BuildError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 2

    updated = apply(manifest, counts, checksums)
    changes = diff_summary(manifest, updated)

    if args.check:
        if changes:
            print(f"{root / MANIFEST_NAME} is stale:", file=sys.stderr)
            for line in changes:
                print(f"  {line}", file=sys.stderr)
            fix = f"uv run --project sidecar python -m tools.content.build {args.pack}"
            print(f"run: {fix}", file=sys.stderr)
            return 1
        if not args.quiet:
            print(f"{MANIFEST_NAME} is up to date ({sum(counts.values())} rows).")
    else:
        if changes:
            write_atomic(root / MANIFEST_NAME, updated, detect_indent(text))
            print(f"wrote {root / MANIFEST_NAME}")
            for line in changes:
                print(f"  {line}")
        elif not args.quiet:
            print(f"{MANIFEST_NAME} already up to date — nothing written.")

    if args.skip_validate:
        return 0

    report = validate_pack(root, verify_checksums=True)
    if not args.quiet or not report.ok:
        stream = sys.stdout if report.ok else sys.stderr
        print(render_text(root, report, 40), file=stream)
    return 0 if report.ok else 1


if __name__ == "__main__":  # pragma: no cover — CLI entry point
    raise SystemExit(main())
