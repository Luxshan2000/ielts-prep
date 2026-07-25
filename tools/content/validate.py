"""`python -m tools.content.validate <pack>` — readable wrapper around the pack validator.

Thin by design: every check lives in :mod:`bandready.content.validate` so the sidecar's
import step (11 §11.3) and community CI (15 §7) enforce exactly the same rules. This module
only turns a :class:`~bandready.content.validate.PackReport` into human output and an exit
code.

    uv run --project sidecar python -m tools.content.validate content/core-en
    uv run --project sidecar python -m tools.content.validate content/core-en --no-checksums
    uv run --project sidecar python -m tools.content.validate content/core-en --json

Exit codes: ``0`` valid (warnings allowed), ``1`` invalid, ``2`` bad usage.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from tools.content import DEFAULT_PACK, resolve_pack

from bandready.content.validate import DATA_FILES, PackReport, validate_pack

#: ``counts`` keys, in the manifest's documented order (11 §11.2).
COUNT_ORDER: tuple[str, ...] = tuple(
    DATA_FILES[name]
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.validate",
        description="Validate a BandReady content pack directory (11 §11, 15 §3.3).",
    )
    parser.add_argument(
        "pack",
        nargs="?",
        default=DEFAULT_PACK,
        help=f"pack root containing manifest.json (default: {DEFAULT_PACK})",
    )
    parser.add_argument(
        "--no-checksums",
        dest="checksums",
        action="store_false",
        help="skip manifest.checksums verification (use while authoring, before build)",
    )
    parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="emit the report as JSON instead of text (for CI)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat warnings as failures",
    )
    parser.add_argument(
        "--max-errors",
        type=int,
        default=40,
        metavar="N",
        help="how many errors to print before truncating (default: 40)",
    )
    return parser


def render_text(root: Path, report: PackReport, max_errors: int) -> str:
    lines: list[str] = []
    label = f"{report.pack_id} {report.version}" if report.pack_id else str(root)
    lines.append(f"pack:   {label}")
    lines.append(f"root:   {root}")

    if report.counts:
        ordered = [k for k in COUNT_ORDER if k in report.counts]
        ordered += [k for k in sorted(report.counts) if k not in ordered]
        width = max(len(k) for k in ordered)
        lines.append("counts:")
        lines.extend(f"  {key.ljust(width)}  {report.counts[key]:>6}" for key in ordered)
        lines.append(f"  {'total'.ljust(width)}  {sum(report.counts.values()):>6}")
    else:
        lines.append("counts: (no data/*.jsonl rows found)")

    if report.warnings:
        lines.append(f"warnings ({len(report.warnings)}):")
        lines.extend(f"  ! {w}" for w in report.warnings)

    if report.errors:
        shown = report.errors[:max_errors]
        lines.append(f"errors ({len(report.errors)}):")
        lines.extend(f"  x {e}" for e in shown)
        if len(report.errors) > len(shown):
            lines.append(f"  … {len(report.errors) - len(shown)} more")
        lines.append("FAIL — the pack would be rejected whole at import (11 §11.3).")
    else:
        lines.append("OK — pack is valid.")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = resolve_pack(args.pack)
    report = validate_pack(root, verify_checksums=args.checksums)

    ok = report.ok and not (args.strict and report.warnings)
    if args.as_json:
        payload = report.as_dict()
        payload["root"] = str(root)
        payload["ok"] = ok
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        text = render_text(root, report, max(1, args.max_errors))
        if args.strict and report.warnings and report.ok:
            text += "\n--strict: warnings present, failing anyway."
        print(text, file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":  # pragma: no cover — CLI entry point
    raise SystemExit(main())
