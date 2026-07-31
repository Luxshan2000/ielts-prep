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

The order is a topological sort, but *which* topological sort matters. Layering by longest
prerequisite chain is correct and produces a bad curriculum: it seats every dependency-free
point at the very front, so ``gr_embedded_question`` (C1, but whose prerequisites are not
authored yet) landed third, ahead of ``gr_be_present``. Dependency-safe, pedagogically absurd.

So this is Kahn's algorithm driven by a priority queue. At each step every point whose
prerequisites are already placed is *eligible*, and among those we take the one a learner
should meet first:

1. **CEFR level** — A1 before A2 before B1 …. The dominant signal, and the one that keeps a
   beginner in beginner material.
2. **unit order**, so a unit stays contiguous wherever the graph allows it.
3. **the author's own index** within their band, honouring the sequence the unit intended.

Correctness does not rest on the tie-break: a point becomes eligible only once every
prerequisite is seated, so *any* choice among eligible points is dependency-safe. The
tie-break only decides which of several safe options is the kindest.

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
import heapq
import json
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any

DEFAULT_PACK = "content/core-en"

#: A learner meets easier material first, so CEFR is the dominant tie-break among the points
#: that are eligible at any moment. An unrecognised level sorts last rather than crashing.
CEFR_ORDER = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}

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

    # Kahn's algorithm over a priority queue. `blocking` counts the prerequisites a point is
    # still waiting on; `unlocks` is the reverse edge, so seating a point can free others.
    blocking = {pid: len(needs) for pid, needs in edges.items()}
    unlocks: dict[str, list[str]] = defaultdict(list)
    for pid, needs in edges.items():
        for need in needs:
            unlocks[need].append(pid)

    def rank(pid: str) -> tuple[int, str, int, str]:
        row = by_id[pid]
        level = str(row.get("cefr_level") or "")
        return (
            CEFR_ORDER.get(level, len(CEFR_ORDER)),
            str(row.get("unit_id") or ""),
            int(row["sequence_index"]),
            pid,
        )

    ready = [rank(pid) for pid, n in blocking.items() if n == 0]
    heapq.heapify(ready)

    order: list[str] = []
    while ready:
        pid = heapq.heappop(ready)[3]
        order.append(pid)
        for freed in unlocks[pid]:
            blocking[freed] -= 1
            if blocking[freed] == 0:
                heapq.heappush(ready, rank(freed))

    if len(order) != len(rows):
        stuck = sorted(pid for pid, n in blocking.items() if n > 0)
        raise SystemExit(
            "cycle in the prerequisite graph, nothing can be seated among: "
            + ", ".join(stuck[:12])
        )
    return order, warnings


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
