"""`python -m tools.content.merge_writing <pack>` — fold staged writing prompts into the pack.

    uv run --project sidecar python -m tools.content.merge_writing content/core-en
    uv run --project sidecar python -m tools.content.merge_writing content/core-en --check
    uv run --project sidecar python -m tools.content.merge_writing content/core-en --lint-only

Authoring agents write one staging file per cluster at
``<pack>/staging-writing/prompts/<cluster>.json`` (staging schema in
``staging-writing/DESIGN.md`` §8.1). Two staging *modes* exist and both are folded in by the
same run:

``append`` — the ordinary cluster file
    ``{"staging_version": 1, "cluster": "...", "authored_by": "...", "prompts": [ …rows… ]}``
    Each entry is a complete ``data/writing_prompts.jsonl`` row. New ids are appended in file
    order; an id that already exists in the pack is **replaced in place**, which is what makes
    a second run a no-op instead of a duplicate.

``update`` — ``backfill-16.json``
    ``{"merge_mode": "update", "merge_key": "id", "order": [ids…],
       "updates": {"<id>": {"teaching_json": {…}}}}``
    Every id must already exist. The named fields are written onto the existing row; no row is
    added, no row is reordered, and nothing else on the row is touched.

The merge is mechanical (DESIGN §8.3): rows are copied verbatim, with no id rewriting and no
defaulting. The one liberty it takes is **key order** — a merged row is rewritten in the §8.1
column order so the JSONL diffs cleanly whichever agent authored it.

What it will not do is write a pack it knows to be broken. Before anything reaches disk the
merged rows go through :func:`check_integrity`: unique ids, ``WritingPromptRow`` validation,
``genre`` inside ``scoring.TASKS[task_type]["genres"]``, a real ``topic_id``, ``chart_spec``
non-null iff ``ac_task1``, ``letter_bullets`` non-null iff ``gt_task1``, chart kind known and
its series/category budgets respected, and — because the whole point of this push is the
teaching layer — a ``teaching_json`` that is a dict carrying the fields DESIGN §1–§5 require
for that task type. A failure prints the offending ids and exits non-zero; use
``--allow-lint-failures`` only when you are deliberately merging known-bad content.

After a successful merge, rebuild the manifest::

    uv run --project sidecar python -m tools.content.build content/core-en
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from tools.content import DEFAULT_PACK, resolve_pack

from bandready.content.validate import iter_jsonl
from bandready.scoring import writing as scoring

STAGING_SUBDIR = "staging-writing/prompts"
WRITING_PROMPTS = "data/writing_prompts.jsonl"
TOPICS = "data/topics.jsonl"

#: DESIGN §8.1 — a merged row is written in exactly this order.
ROW_KEYS: tuple[str, ...] = (
    "id",
    "task_type",
    "genre",
    "topic_id",
    "topic_tags",
    "difficulty",
    "prompt_text",
    "chart_spec",
    "letter_bullets",
    "teaching_json",
)

#: The teaching brief that must be present for each task type (DESIGN §1, §2–§4).
BRIEF_FOR_TASK: dict[str, str] = {
    "ac_task1": "overview_brief",
    "gt_task1": "letter_brief",
    "task2": "essay_brief",
}
ALL_BRIEFS: tuple[str, ...] = ("overview_brief", "letter_brief", "essay_brief")

#: Teaching fields every prompt carries regardless of task type (DESIGN §1).
COMMON_TEACHING_FIELDS: tuple[str, ...] = (
    "time_plan",
    "plan",
    "structure_plan",
    "parts_checklist",
    "language_bank",
    "collocations",
    "upgrade_pairs",
    "target_structures",
    "error_watchlist",
    "checklist",
    "rewrite_focus",
    "sentence_ladder",
    "model_answers",
)

KIND_APPEND = "append"
KIND_UPDATE = "update"


class MergeError(Exception):
    """A problem that stops the merge before anything is written."""


# --------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------


def staging_files(pack: Path) -> list[Path]:
    base = pack / STAGING_SUBDIR
    if not base.is_dir():
        raise MergeError(f"no staging directory at {base}")
    return sorted(base.glob("*.json"))


def staging_kind(doc: dict[str, Any]) -> str:
    """Which of the two merge modes this document declares.

    Detected from the document itself rather than from the filename, so a new backfill file
    needs no wiring here: ``merge_mode: "update"`` (or an ``updates`` map in place of
    ``prompts``) means update-in-place, anything with ``prompts`` is an append.
    """
    declared = str(doc.get("merge_mode") or "").strip().lower()
    if declared in ("update", "update-in-place", "update_in_place"):
        return KIND_UPDATE
    if isinstance(doc.get("prompts"), list):
        return KIND_APPEND
    if isinstance(doc.get("updates"), dict):
        return KIND_UPDATE
    raise MergeError("document declares neither `prompts` nor `updates`")


def load_staging(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise MergeError(f"{path.name}: unreadable ({exc})") from exc
    if not isinstance(doc, dict):
        raise MergeError(f"{path.name}: top level must be an object")
    try:
        kind = staging_kind(doc)
    except MergeError as exc:
        raise MergeError(f"{path.name}: {exc}") from exc
    return kind, doc


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [row for _lineno, row in iter_jsonl(path)]


def read_topic_ids(pack: Path) -> set[str]:
    return {str(row.get("id")) for row in read_rows(pack / TOPICS)}


# --------------------------------------------------------------------------------------
# Lint — run on the staging documents, before anything is merged
# --------------------------------------------------------------------------------------


def lint_staging(
    docs: Sequence[tuple[Path, str, dict[str, Any]]],
    existing: Sequence[dict[str, Any]],
) -> list[str]:
    """Problems with the staging files themselves. Empty list means "safe to merge"."""
    problems: list[str] = []
    existing_ids = {str(row.get("id")) for row in existing}
    seen_new: dict[str, str] = {}

    for path, kind, doc in docs:
        name = path.name
        stem = path.stem

        def bad(message: str, _name: str = name) -> None:
            problems.append(f"{_name}: {message}")

        cluster = str(doc.get("cluster") or "")
        if cluster != stem:
            bad(f"cluster {cluster!r} does not match the filename stem {stem!r}")

        if kind == KIND_APPEND:
            prompts = doc.get("prompts") or []
            if not prompts:
                bad("`prompts` is empty")
            for index, row in enumerate(prompts):
                if not isinstance(row, dict):
                    bad(f"prompts[{index}] is not an object")
                    continue
                row_id = str(row.get("id") or "")
                if not row_id:
                    bad(f"prompts[{index}] has no id")
                    continue
                missing = [key for key in ROW_KEYS if key not in row]
                if missing:
                    bad(f"{row_id}: missing key(s) {', '.join(missing)}")
                extra = [key for key in row if key not in ROW_KEYS]
                if extra:
                    bad(f"{row_id}: unexpected key(s) {', '.join(sorted(extra))}")
                if row_id in seen_new:
                    bad(f"{row_id}: id already staged in {seen_new[row_id]}")
                else:
                    seen_new[row_id] = name
                teaching = row.get("teaching_json")
                if isinstance(teaching, dict):
                    declared = str(teaching.get("cluster") or "")
                    if declared and declared != cluster:
                        bad(f"{row_id}: teaching_json.cluster {declared!r} != {cluster!r}")
        else:
            updates = doc.get("updates")
            if not isinstance(updates, dict) or not updates:
                bad("`updates` is missing or empty")
                continue
            order = doc.get("order") or list(updates)
            if sorted(map(str, order)) != sorted(map(str, updates)):
                bad("`order` and `updates` disagree on which ids are patched")
            for row_id, patch in updates.items():
                if not isinstance(patch, dict) or not patch:
                    bad(f"{row_id}: update payload is not a non-empty object")
                    continue
                unknown = [key for key in patch if key not in ROW_KEYS]
                if unknown:
                    bad(f"{row_id}: patches unknown field(s) {', '.join(sorted(unknown))}")
                if row_id not in existing_ids:
                    bad(f"{row_id}: update targets an id that is not in the pack")
    return problems


# --------------------------------------------------------------------------------------
# Merge
# --------------------------------------------------------------------------------------


def order_row(row: dict[str, Any]) -> dict[str, Any]:
    """The §8.1 key order, with any unrecognised key kept at the end rather than dropped."""
    out = {key: row[key] for key in ROW_KEYS if key in row}
    out.update({key: value for key, value in row.items() if key not in ROW_KEYS})
    return out


def merge_rows(
    existing: Sequence[dict[str, Any]],
    docs: Sequence[tuple[Path, str, dict[str, Any]]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Apply every staging document to ``existing``. Pure — nothing is written here.

    Idempotent by construction: an append whose id is already present overwrites that row
    where it stands instead of adding a second one, and an update rewrites fields that may
    already hold the same value.
    """
    rows: list[dict[str, Any]] = [dict(row) for row in existing]
    index: dict[str, int] = {str(row.get("id")): i for i, row in enumerate(rows)}
    stats = Counter({"appended": 0, "replaced": 0, "updated": 0, "unchanged_updates": 0})

    for _path, kind, doc in docs:
        if kind == KIND_APPEND:
            for row in doc.get("prompts") or []:
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get("id") or "")
                if not row_id:
                    continue
                merged = order_row(row)
                if row_id in index:
                    rows[index[row_id]] = merged
                    stats["replaced"] += 1
                else:
                    index[row_id] = len(rows)
                    rows.append(merged)
                    stats["appended"] += 1
        else:
            updates: dict[str, Any] = doc.get("updates") or {}
            order = [str(i) for i in (doc.get("order") or list(updates))]
            for row_id in order:
                patch = updates.get(row_id)
                if not isinstance(patch, dict):
                    continue
                if row_id not in index:
                    raise MergeError(f"update targets missing id {row_id!r}")
                target = rows[index[row_id]]
                before = json.dumps(target, sort_keys=True, ensure_ascii=False)
                target.update(patch)
                rows[index[row_id]] = order_row(target)
                after = json.dumps(rows[index[row_id]], sort_keys=True, ensure_ascii=False)
                stats["updated" if before != after else "unchanged_updates"] += 1
    return rows, dict(stats)


# --------------------------------------------------------------------------------------
# Integrity — run on the merged result, before it is written
# --------------------------------------------------------------------------------------


def _teaching_problems(row_id: str, task_type: str, teaching: Any) -> list[str]:
    if teaching is None:
        return [f"{row_id}: no teaching_json (every prompt in this pack carries one)"]
    if isinstance(teaching, str):
        try:
            teaching = json.loads(teaching)
        except ValueError:
            return [f"{row_id}: teaching_json is a string that is not JSON"]
    if not isinstance(teaching, dict):
        return [f"{row_id}: teaching_json must be an object"]

    problems: list[str] = []
    missing = [key for key in COMMON_TEACHING_FIELDS if key not in teaching]
    if missing:
        problems.append(f"{row_id}: teaching_json missing {', '.join(missing)}")

    wanted = BRIEF_FOR_TASK.get(task_type)
    present = [key for key in ALL_BRIEFS if key in teaching]
    if present != [wanted]:
        problems.append(
            f"{row_id}: {task_type} needs exactly {wanted}, found "
            f"{', '.join(present) or 'none'}"
        )

    models = teaching.get("model_answers")
    if isinstance(models, list):
        bands = [m.get("band_target") for m in models if isinstance(m, dict)]
        if bands != [6, 7, 8]:
            problems.append(f"{row_id}: model_answers band_target {bands} != [6, 7, 8]")
        for model in models:
            if not isinstance(model, dict):
                continue
            text = str(model.get("text") or "")
            band = model.get("band_target")
            if not text:
                problems.append(f"{row_id}: band {band} model answer has no text")
                continue
            for ann in model.get("annotations") or []:
                span = str((ann or {}).get("span") or "")
                if span and span not in text:
                    problems.append(
                        f"{row_id}: band {band} annotation span is not in its own text: "
                        f"{span[:40]!r}"
                    )
    elif "model_answers" in teaching:
        problems.append(f"{row_id}: model_answers must be a list")

    ladder = teaching.get("sentence_ladder")
    if isinstance(ladder, dict):
        rungs = [r.get("band") for r in (ladder.get("rungs") or []) if isinstance(r, dict)]
        if rungs != [5, 6, 7, 8]:
            problems.append(f"{row_id}: sentence_ladder rungs {rungs} != [5, 6, 7, 8]")
    return problems


def _chart_problems(row_id: str, spec: Any, *, panel: str = "") -> list[str]:
    where = f"{row_id}{panel}"
    if not isinstance(spec, dict):
        return [f"{where}: chart_spec must be an object"]
    kind = str(spec.get("kind") or "")
    if kind not in scoring.CHART_KINDS:
        return [f"{where}: unknown chart kind {kind!r}"]
    problems: list[str] = []
    if not str(spec.get("title") or "").strip():
        problems.append(f"{where}: chart_spec.title is required")
    if kind == "mixed":
        panels = spec.get("panels")
        if not isinstance(panels, list) or len(panels) != 2:
            return problems + [f"{where}: a mixed spec needs exactly two panels"]
        kinds = []
        for i, child in enumerate(panels, start=1):
            problems += _chart_problems(row_id, child, panel=f" panel {i}")
            if isinstance(child, dict):
                kinds.append(str(child.get("kind") or ""))
        if len(set(kinds)) == 1:
            problems.append(f"{where}: both mixed panels are {kinds[0]!r}")
        if "mixed" in kinds:
            problems.append(f"{where}: a mixed panel may not itself be mixed")
        return problems

    if kind in ("bar", "grouped_bar", "stacked_bar", "line", "pie"):
        categories = (spec.get("x_axis") or {}).get("categories") or []
        series = spec.get("series") or []
        limit = scoring.MAX_PIE_SERIES if kind == "pie" else scoring.MAX_SERIES
        if not series:
            problems.append(f"{where}: no series")
        if len(series) > limit:
            problems.append(f"{where}: {len(series)} series (max {limit})")
        if len(categories) > scoring.MAX_CATEGORIES:
            problems.append(
                f"{where}: {len(categories)} categories (max {scoring.MAX_CATEGORIES})"
            )
        for item in series:
            values = (item or {}).get("values") or []
            if len(values) != len(categories):
                problems.append(
                    f"{where}: series {item.get('name')!r} has {len(values)} values for "
                    f"{len(categories)} categories"
                )
            if kind == "pie" and values:
                total = sum(float(v) for v in values)
                if abs(total - 100) > 1:
                    problems.append(
                        f"{where}: pie ring {item.get('name')!r} sums to {total:g}, not 100"
                    )
    elif kind == "table":
        rows = spec.get("rows") or []
        if len(rows) < 3:
            problems.append(f"{where}: a table needs a header plus at least two data rows")
    elif kind == "process":
        steps = spec.get("steps") or []
        ids = {str((s or {}).get("id")) for s in steps}
        if len(steps) < 2:
            problems.append(f"{where}: a process needs at least two steps")
        for step in steps:
            for nxt in (step or {}).get("next") or []:
                if str(nxt) not in ids:
                    problems.append(f"{where}: step {step.get('id')!r} points at unknown {nxt!r}")
    elif kind == "map":
        snapshots = spec.get("snapshots") or []
        if len(snapshots) != 2:
            problems.append(f"{where}: a map needs exactly two snapshots")
        for snapshot in snapshots:
            if not (snapshot or {}).get("features"):
                problems.append(f"{where}: snapshot {snapshot.get('label')!r} has no features")
    return problems


def check_integrity(rows: Sequence[dict[str, Any]], topic_ids: set[str]) -> list[str]:
    """Everything that must be true of the merged file. Empty list means "safe to write"."""
    from bandready.content.validate import WritingPromptRow

    problems: list[str] = []
    counts = Counter(str(row.get("id")) for row in rows)
    for row_id, n in sorted(counts.items()):
        if n > 1:
            problems.append(f"{row_id}: appears {n} times")

    for row in rows:
        row_id = str(row.get("id"))
        try:
            WritingPromptRow.model_validate(row)
        except Exception as exc:  # noqa: BLE001 — pydantic's message is the useful part
            problems.append(f"{row_id}: fails WritingPromptRow ({exc})")
            continue

        task_type = str(row.get("task_type"))
        genre = str(row.get("genre"))
        genres = scoring.TASKS.get(task_type, {}).get("genres", ())
        if genre not in genres:
            problems.append(f"{row_id}: genre {genre!r} not legal for {task_type}")
        topic_id = row.get("topic_id")
        if topic_id and str(topic_id) not in topic_ids:
            problems.append(f"{row_id}: unknown topic_id {topic_id!r}")
        tags = row.get("topic_tags")
        if not isinstance(tags, list) or not tags:
            problems.append(f"{row_id}: topic_tags must be a non-empty list")

        chart = row.get("chart_spec")
        if task_type == "ac_task1":
            if chart is None:
                problems.append(f"{row_id}: ac_task1 needs a chart_spec")
            else:
                problems += _chart_problems(row_id, chart)
        elif chart is not None:
            problems.append(f"{row_id}: chart_spec must be null on {task_type}")

        bullets = row.get("letter_bullets")
        if task_type == "gt_task1":
            if not isinstance(bullets, list) or len(bullets) != 3:
                problems.append(f"{row_id}: gt_task1 needs exactly three letter_bullets")
        elif bullets not in (None, []):
            problems.append(f"{row_id}: letter_bullets must be null on {task_type}")

        problems += _teaching_problems(row_id, task_type, row.get("teaching_json"))
    return problems


# --------------------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------------------


def dump_jsonl(rows: Sequence[dict[str, Any]]) -> str:
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()


def summarise(rows: Sequence[dict[str, Any]]) -> list[str]:
    by_task = Counter(str(row.get("task_type")) for row in rows)
    by_genre = Counter(str(row.get("genre")) for row in rows)
    by_difficulty = Counter(int(row.get("difficulty") or 0) for row in rows)
    with_teaching = sum(1 for row in rows if row.get("teaching_json"))
    lines = [
        f"rows: {len(rows)}  (teaching payload on {with_teaching})",
        "  task_type: " + ", ".join(f"{k}={v}" for k, v in sorted(by_task.items())),
        "  genre:     " + ", ".join(f"{k}={v}" for k, v in sorted(by_genre.items())),
        "  difficulty:" + ", ".join(f" {k}={v}" for k, v in sorted(by_difficulty.items())),
    ]
    return lines


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.merge_writing",
        description="Merge staging-writing/prompts/*.json into data/writing_prompts.jsonl.",
    )
    parser.add_argument("pack", nargs="?", default=DEFAULT_PACK, help="pack root")
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit 1 if the merged output would differ from what is on disk",
    )
    parser.add_argument(
        "--lint-only", action="store_true", help="run the lint gate and stop before merging"
    )
    parser.add_argument(
        "--allow-lint-failures",
        action="store_true",
        help="merge even if lint or integrity reports problems (they are still printed)",
    )
    parser.add_argument("--quiet", action="store_true", help="only print problems and the summary")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        pack = resolve_pack(args.pack)
    except Exception as exc:  # noqa: BLE001 — resolve_pack raises its own message
        print(f"error: {exc}", file=sys.stderr)
        return 2

    target = pack / WRITING_PROMPTS
    try:
        files = staging_files(pack)
        docs = [(path, *load_staging(path)) for path in files]
        existing = read_rows(target)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not args.quiet:
        print(f"pack: {pack}")
        print(f"existing rows: {len(existing)}")
        for path, kind, doc in docs:
            size = len(doc.get("prompts") or ()) or len(doc.get("updates") or ())
            print(f"  {path.name}: {kind} ×{size}")

    problems = lint_staging(docs, existing)
    if problems:
        print(f"\nlint: {len(problems)} problem(s)", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
    elif not args.quiet:
        print("\nlint: clean")

    if args.lint_only:
        return 1 if problems else 0
    if problems and not args.allow_lint_failures:
        print("\nrefusing to merge; pass --allow-lint-failures to override", file=sys.stderr)
        return 1

    try:
        rows, stats = merge_rows(existing, docs)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    integrity = check_integrity(rows, read_topic_ids(pack))
    if integrity:
        print(f"\nintegrity: {len(integrity)} problem(s)", file=sys.stderr)
        for problem in integrity[:60]:
            print(f"  - {problem}", file=sys.stderr)
        if len(integrity) > 60:
            print(f"  … and {len(integrity) - 60} more", file=sys.stderr)
        if not args.allow_lint_failures:
            print("\nrefusing to write a broken pack", file=sys.stderr)
            return 1
    elif not args.quiet:
        print("integrity: clean")

    text = dump_jsonl(rows)
    current = target.read_text(encoding="utf-8") if target.exists() else ""
    changed = text != current

    if args.check:
        print("\n" + "\n".join(summarise(rows)))
        print("check: " + ("DIFFERS from disk" if changed else "up to date"))
        return 1 if changed else 0

    if changed:
        write_atomic(target, text)
    print(
        "\nmerged: "
        f"{stats.get('appended', 0)} appended, {stats.get('replaced', 0)} replaced, "
        f"{stats.get('updated', 0)} updated, "
        f"{stats.get('unchanged_updates', 0)} already current"
    )
    print("\n".join(summarise(rows)))
    print(f"{'wrote' if changed else 'unchanged'}: {target}")
    print("next: uv run --project sidecar python -m tools.content.build " + str(args.pack))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
