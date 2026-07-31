"""`python -m tools.content.reseq_grammar <pack>` — re-seat every grammar point into 1..N.

    uv run --project sidecar python -m tools.content.reseq_grammar content/core-en
    uv run --project sidecar python -m tools.content.reseq_grammar content/core-en --check

DESIGN §5.4 requires ``sequence_index`` to be a permutation of 1..154 in which every
prerequisite is strictly lower than the point that needs it. That is a *global* constraint,
and authoring is *parallel*: eleven agents each write one unit without seeing the others.
Asking each of them to pick globally-correct numbers is asking for the two defects the first
run actually produced — two blocks opening at the same index, and a point seated before the
thing it depends on (``gr_passive_nonfinite`` at #76 needing ``gr_verb_patterns_core`` at
#115, so a beginner met the dependent first).

So authors number inside a private band (u01 gets 1000-1099, u02 1100-1199, …) where
collision is impossible by construction, and this pass computes the real order afterwards.
The constraint is then *enforced* rather than *hoped for*.

The order is a topological sort of the prerequisite graph, and the tie-break is what makes
the output stable and teachable rather than merely valid:

1. **depth** — the longest prerequisite chain ending at this point. Every genuine dependency
   is respected because depth(A) < depth(B) whenever A is a prerequisite of B.
2. **unit order**, then the author's own index within its band. Two points at the same depth
   with no dependency between them keep the sequence their unit intended, and units stay
   contiguous wherever the graph allows it.

Edges naming a point the pack does not carry are ignored with a warning: the syllabus is
incomplete while it is being authored, and an unresolvable edge must not stop the pack from
building. ``loader`` already treats such an edge as met at runtime, and ``validate`` already
reports it — this pass agreeing with both is deliberate.

The whitelisted order exceptions in DESIGN §5.4 are *not* special-cased. If the graph says a
point must move, it moves; a whitelist exists to let a human override the topology, and this
tool computes the topology. A cycle is a hard error and names its members, because no seating
exists and silently picking one would hide an authoring mistake.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any

DEFAULT_PACK = "content/core-en"

#: Written order of the eight authored columns, so a re-seated row diffs cleanly against the
#: one the merge produced (`merge_grammar` writes this same order for the same reason).
COLUMNS = (
    "id",
    "unit_id",
    "sequence_index",
    "title",
    "cefr_level",
    "role",
    "topic_id",
    "point_json",
)


def load_rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def prerequisites(row: dict[str, Any]) -> list[str]:
    point = row.get("point_json")
    if isinstance(point, str):  # tolerate a not-yet-parsed blob
        point = json.loads(point)
    return list((point or {}).get("prerequisites") or [])


def compute_order(rows: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    """Return (ids in teaching order, warnings). Raises on a cycle."""
    by_id = {row["id"]: row for row in rows}
    warnings: list[str] = []

    # Keep only edges we can actually resolve. A dangling edge is a syllabus hole, not a
    # seating problem, and the loader already treats it as met.
    edges: dict[str, list[str]] = {}
    for row in rows:
        resolved = []
        for need in prerequisites(row):
            if need in by_id:
                resolved.append(need)
            else:
                warnings.append(f"{row['id']}: prerequisite {need} is not in the pack — edge ignored")
        edges[row["id"]] = resolved

    # Longest-chain depth, memoised, with an explicit cycle report.
    depth: dict[str, int] = {}
    walking: set[str] = set()

    def depth_of(node: str, trail: list[str]) -> int:
        if node in depth:
            return depth[node]
        if node in walking:
            cycle = trail[trail.index(node):] + [node]
            raise SystemExit("cycle in the prerequisite graph: " + " -> ".join(cycle))
        walking.add(node)
        best = 0
        for need in edges[node]:
            best = max(best, depth_of(need, trail + [node]) + 1)
        walking.discard(node)
        depth[node] = best
        return best

    for row in rows:
        depth_of(row["id"], [])

    ordered = sorted(
        rows,
        key=lambda r: (depth[r["id"]], r.get("unit_id") or "", int(r["sequence_index"]), r["id"]),
    )
    return [r["id"] for r in ordered], warnings


def reseat(rows: list[dict[str, Any]], order: Sequence[str]) -> list[dict[str, Any]]:
    seat = {pid: i for i, pid in enumerate(order, start=1)}
    out = []
    for row in sorted(rows, key=lambda r: seat[r["id"]]):
        row = dict(row)
        row["sequence_index"] = seat[row["id"]]
        out.append({key: row[key] for key in COLUMNS if key in row})
    return out


def verify(rows: list[dict[str, Any]]) -> list[str]:
    """The invariants DESIGN §5.4 states, checked against the seated result."""
    problems: list[str] = []
    seats = [int(r["sequence_index"]) for r in rows]
    if sorted(seats) != list(range(1, len(rows) + 1)):
        problems.append(f"sequence_index is not a permutation of 1..{len(rows)}")
    by_id = {r["id"]: int(r["sequence_index"]) for r in rows}
    for row in rows:
        for need in prerequisites(row):
            if need in by_id and by_id[need] >= int(row["sequence_index"]):
                problems.append(
                    f"{row['id']} (#{by_id[row['id']]}) needs {need} (#{by_id[need]}) — "
                    "a beginner meets it before it is taught"
                )
    return problems


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", nargs="?", default=DEFAULT_PACK, help="pack root")
    parser.add_argument("--check", action="store_true", help="report without writing")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    path = Path(args.pack).expanduser() / "data" / "grammar.jsonl"
    if not path.is_file():
        print(f"no grammar rows at {path}", file=sys.stderr)
        return 1

    rows = load_rows(path)
    order, warnings = compute_order(rows)
    seated = reseat(rows, order)

    problems = verify(seated)
    if problems:
        print("refusing to write — the seating does not satisfy the design:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    moved = sum(1 for before, after in zip(rows, seated, strict=False) if before["id"] != after["id"])
    body = "\n".join(json.dumps(row, ensure_ascii=False) for row in seated) + "\n"
    unchanged = path.read_text() == body

    if not args.quiet:
        print(f"pack: {path.parent.parent}")
        print(f"  {len(rows)} points -> sequence_index 1..{len(rows)}")
        by_unit: dict[str, list[int]] = defaultdict(list)
        for row in seated:
            by_unit[row.get("unit_id") or "?"].append(int(row["sequence_index"]))
        for unit in sorted(by_unit):
            seats = by_unit[unit]
            print(f"    {unit}: {min(seats)}-{max(seats)} ({len(seats)} points)")
        if warnings:
            print(f"  warnings: {len(warnings)}")
            for warning in warnings[:8]:
                print(f"    ! {warning}")
            if len(warnings) > 8:
                print(f"    … and {len(warnings) - 8} more")
        print("  order: unchanged" if unchanged else f"  order: re-seated ({moved} rows move)")

    if args.check:
        return 0 if unchanged else 2
    if not unchanged:
        path.write_text(body)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
