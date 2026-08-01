"""`python -m tools.content.merge_theory <pack>` — fold the staged Theory chapters in.

    uv run --project sidecar python -m tools.content.merge_theory content/core-en
    uv run --project sidecar python -m tools.content.merge_theory content/core-en --check

Chapter agents write one file per chapter at ``<pack>/staging-theory/content/<key>.json``,
each holding ``articles[]`` of the seven authored columns. This folds them into
``data/theory.jsonl``, sorted by ``sequence_index``.

Theory is far simpler to merge than grammar, and the reason is worth stating: it is
*reference*, so it has no prerequisite graph to keep acyclic, no items whose answers must be
defensible, and no ordering that can strand a beginner. An article that is out of order is
merely an odd table of contents; a grammar point that is out of order is a wall. So the
checks here are the ones that can still go wrong — a duplicate id (two chapters claiming the
same article), a body that is not a list of blocks, and a block with no type, which would
render as a hole the reader cannot interpret.

``TEMPLATE-THEORY.json`` is merged too when it carries articles. It holds the exemplars the
chapter authors write against, and they are complete, correct articles — shipping them means
the reference is never empty while the chapters are still being written.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

DEFAULT_PACK = "content/core-en"
STAGING_SUBDIR = "staging-theory"
THEORY_FILE = "data/theory.jsonl"

#: The seven authored columns, in written order, so a merged row diffs cleanly whichever
#: chapter agent produced it. `loader.TABLE_COLUMNS` copies exactly these.
COLUMNS = ("id", "chapter_id", "sequence_index", "title", "kind", "cefr_level", "article_json")


def staging_docs(pack: Path) -> list[tuple[Path, dict[str, Any]]]:
    base = pack / STAGING_SUBDIR
    out: list[tuple[Path, dict[str, Any]]] = []
    candidates = sorted((base / "content").glob("*.json")) if (base / "content").is_dir() else []
    # The template's exemplars are complete, correct articles, so they ship while the
    # chapters are still being written — and stop shipping the moment a real chapter exists,
    # because by then they are near-duplicates of it (the exemplar on the passive and
    # ch6-voice's article on the passive are the same article twice).
    template = base / "TEMPLATE-THEORY.json"
    if template.is_file() and not candidates:
        candidates.append(template)
    for path in candidates:
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"{path.name}: {exc}", file=sys.stderr)
            continue
        if isinstance(doc, dict):
            out.append((path, doc))
    return out


def check(rows: list[tuple[str, dict[str, Any]]]) -> list[str]:
    problems: list[str] = []
    seen: dict[str, str] = {}
    for source, row in rows:
        rid = str(row.get("id") or "")
        if not rid:
            problems.append(f"{source}: an article has no id")
            continue
        if rid in seen:
            problems.append(f"{source}: id {rid} is already authored in {seen[rid]}")
            continue
        seen[rid] = source
        for column in ("chapter_id", "title"):
            if not row.get(column):
                problems.append(f"{source}/{rid}: missing {column}")
        body = (row.get("article_json") or {}).get("body")
        if not isinstance(body, list) or not body:
            problems.append(f"{source}/{rid}: article_json.body must be a non-empty list")
            continue
        for i, block in enumerate(body):
            if not isinstance(block, dict):
                problems.append(f"{source}/{rid}: body[{i}] is not a block")
            elif not (block.get("type") or block.get("kind")):
                problems.append(f"{source}/{rid}: body[{i}] has no type")
    return problems


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", nargs="?", default=DEFAULT_PACK)
    parser.add_argument("--check", action="store_true", help="report without writing")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    pack = Path(args.pack).expanduser()
    docs = staging_docs(pack)
    if not docs:
        print(f"no staged theory in {pack / STAGING_SUBDIR}", file=sys.stderr)
        return 1

    collected: list[tuple[str, dict[str, Any]]] = []
    for path, doc in docs:
        articles = doc.get("articles") or []
        if not args.quiet:
            print(f"  {path.name}: {len(articles)} articles")
        for article in articles:
            if isinstance(article, dict):
                collected.append((path.name, article))

    problems = check(collected)
    if problems:
        print(f"refusing to write — {len(problems)} problem(s):", file=sys.stderr)
        for problem in problems[:20]:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    rows = [row for _, row in collected]
    rows.sort(key=lambda r: (int(r.get("sequence_index") or 0), str(r.get("id"))))
    body = "\n".join(
        json.dumps({k: row[k] for k in COLUMNS if k in row}, ensure_ascii=False) for row in rows
    ) + "\n"

    target = pack / THEORY_FILE
    unchanged = target.is_file() and target.read_text() == body
    if not args.quiet:
        chapters = sorted({str(r.get("chapter_id")) for r in rows})
        print(f"  {len(rows)} articles across {len(chapters)} chapters: {', '.join(chapters)}")
        print("  " + ("up to date" if unchanged else f"writing {target}"))

    if args.check:
        return 0 if unchanged else 2
    if not unchanged:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
