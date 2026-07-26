"""`python -m tools.content.merge_speaking <pack>` — fold staged speaking sets into the pack.

    uv run --project sidecar python -m tools.content.merge_speaking content/core-en
    uv run --project sidecar python -m tools.content.merge_speaking content/core-en --check
    uv run --project sidecar python -m tools.content.merge_speaking content/core-en --lint-only

Authoring agents write one staging file per cluster at
``<pack>/staging/sets/<cluster>.json`` (staging schema in ``staging/DESIGN.md`` §6.1)::

    {"staging_version": 1, "cluster": "...", "authored_by": "...",
     "sets": [{"set": {…card_sets row…}, "cards": [{…speaking_cards row…} ×4]}, …]}

This module is the *only* blessed writer of the staged half of
``data/card_sets.jsonl`` and ``data/speaking_cards.jsonl``. It is deliberately
mechanical (DESIGN §6.2): rows are copied verbatim, no id rewriting, no defaulting.
If a merge would need to *fix* something, the staging file is wrong and the lint gate
below says so instead of papering over it.

**Idempotent by construction.** Rows already in the pack whose id appears in staging are
dropped and re-appended from staging, so re-running after an author edits one cluster
updates that cluster in place and never duplicates. Rows whose ids are *not* in any
staging file (the 12 hand-authored ``_001`` sets that predate staging) are preserved in
their original order and always come first.

The lint gate implements DESIGN §6.4's structural rules — the ones a machine can check
without judging prose. It runs before anything is written; a failing lint aborts the
merge whole, because a half-merged pack is worse than an unmerged one.

Exit codes: ``0`` merged / already up to date, ``1`` lint failed or ``--check`` found the
pack stale, ``2`` bad usage or unreadable input.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from tools.content import DEFAULT_PACK, resolve_pack

from bandready.content.validate import iter_jsonl

STAGING_SUBDIR = "staging/sets"
CARD_SETS = "data/card_sets.jsonl"
SPEAKING_CARDS = "data/speaking_cards.jsonl"
TOPICS = "data/topics.jsonl"

SET_KEYS = {"id", "title", "topic_id", "parts_json", "payload_json"}
CARD_KEYS = {
    "id",
    "part",
    "card_set_id",
    "topic_id",
    "title",
    "difficulty",
    "tags_json",
    "payload_json",
}
EXPECTED_PARTS = [1, 1, 2, 3]
SERIAL_RE = re.compile(r"_(\d{3})$")

#: DESIGN §3.4 — the fixed (from_s, to_s, segment) budget every Part 2 time_plan must use.
TIME_PLAN: list[tuple[int, int, str]] = [
    (0, 10, "opening"),
    (10, 50, "bullets_1_2"),
    (50, 80, "bullet_3"),
    (80, 115, "bullet_4"),
    (115, 120, "landing"),
]


class MergeError(Exception):
    """A problem that stops the merge before anything is written."""


# --------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------


def staging_files(pack: Path) -> list[Path]:
    base = pack / STAGING_SUBDIR
    if not base.is_dir():
        raise MergeError(f"{base} does not exist — nothing to merge")
    files = sorted(base.glob("*.json"))
    if not files:
        raise MergeError(f"{base} contains no *.json staging files")
    return files


def load_staging(path: Path) -> dict[str, Any]:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise MergeError(f"{path.name}: unreadable staging file: {exc}") from exc
    if not isinstance(doc, dict) or not isinstance(doc.get("sets"), list):
        raise MergeError(f"{path.name}: staging file must be an object with a 'sets' list")
    return doc


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [row for _, row in iter_jsonl(path)]


# --------------------------------------------------------------------------------------
# Lint (DESIGN §6.4, the machine-checkable subset)
# --------------------------------------------------------------------------------------


def _serial(row_id: str) -> str | None:
    match = SERIAL_RE.search(row_id)
    return match.group(1) if match else None


def lint_staging(
    docs: list[tuple[Path, dict[str, Any]]],
    topic_ids: set[str],
) -> list[str]:
    """Every structural violation found, as human-readable strings (empty == clean)."""
    problems: list[str] = []
    seen_ids: dict[str, str] = {}  # id → "file:set_id"

    for path, doc in docs:
        name = path.name
        stem = path.stem

        def bad(message: str, _name: str = name) -> None:
            problems.append(f"{_name}: {message}")

        if doc.get("cluster") != stem:
            bad(f"cluster {doc.get('cluster')!r} does not match filename stem {stem!r}")

        entries = doc["sets"]
        if len(entries) != 8:
            bad(f"expected exactly 8 sets, found {len(entries)}")

        cluster_serials: set[str] = set()
        difficulties: list[str] = []

        for index, entry in enumerate(entries):
            if not isinstance(entry, dict) or "set" not in entry or "cards" not in entry:
                bad(f"sets[{index}] must be an object with 'set' and 'cards'")
                continue
            row = entry["set"]
            cards = entry["cards"]
            set_id = row.get("id", f"<sets[{index}]>")

            def bad_set(message: str, _sid: str = set_id, _bad: Any = bad) -> None:
                _bad(f"{_sid}: {message}")

            # 6.4/1 — shape
            if set(row) != SET_KEYS:
                bad_set(f"set row keys {sorted(set(row) ^ SET_KEYS)} differ from the contract")
            if not isinstance(cards, list) or len(cards) != 4:
                bad_set(f"expected 4 cards, found {len(cards) if isinstance(cards, list) else '?'}")
                continue
            if [c.get("part") for c in cards] != EXPECTED_PARTS:
                bad_set(f"card parts {[c.get('part') for c in cards]} != {EXPECTED_PARTS}")

            payload = row.get("payload_json") or {}
            if not isinstance(payload, dict):
                bad_set("payload_json must be an object")
                continue

            # 6.4/2 — the set's card pointers are exactly its four cards
            card_ids = [c.get("id") for c in cards]
            pointed = set(payload.get("part1_card_ids") or []) | {
                payload.get("part2_card_id"),
                payload.get("part3_card_id"),
            }
            if pointed != set(card_ids):
                bad_set(f"payload card pointers {sorted(map(str, pointed))} != cards {card_ids}")
            for card in cards:
                if card.get("card_set_id") != row.get("id"):
                    bad_set(f"{card.get('id')}: card_set_id != {row.get('id')!r}")

            # 6.4/4 — serial block, global uniqueness
            serial = _serial(str(row.get("id", "")))
            if serial is None:
                bad_set("id does not end in a 3-digit serial")
            else:
                cluster_serials.add(serial)
            for row_id in [row.get("id"), *card_ids]:
                row_id = str(row_id)
                if _serial(row_id) != serial:
                    bad_set(f"{row_id}: serial does not match the set serial {serial}")
                if row_id in seen_ids:
                    bad_set(f"{row_id}: duplicate id, already used by {seen_ids[row_id]}")
                seen_ids[row_id] = f"{name}:{row.get('id')}"

            # 6.4/5 — topic ids resolve
            for row_id, topic_id in [(row.get("id"), row.get("topic_id"))] + [
                (c.get("id"), c.get("topic_id")) for c in cards
            ]:
                if topic_id not in topic_ids:
                    bad_set(f"{row_id}: topic_id {topic_id!r} is not in {TOPICS}")

            # 6.4/6 + /7 — difficulty ladder
            set_difficulty = payload.get("difficulty")
            difficulties.append(str(set_difficulty))
            for card in cards:
                part, diff = card.get("part"), card.get("difficulty")
                if diff not in ("core", "stretch"):
                    bad_set(f"{card.get('id')}: difficulty {diff!r} must be core|stretch")
                if part == 1 and diff != "core":
                    bad_set(f"{card.get('id')}: Part 1 must be core")
                if part == 3 and diff != "stretch":
                    bad_set(f"{card.get('id')}: Part 3 must be stretch")
                if part == 2 and diff != set_difficulty:
                    bad_set(f"{card.get('id')}: Part 2 difficulty must equal the set's")
            load = payload.get("cognitive_load")
            if (set_difficulty == "stretch") != (load is not None):
                bad_set(f"cognitive_load {load!r} must be non-null iff the set is stretch")

            problems.extend(_lint_cards(f"{name}:{set_id}", row, cards, payload))

        # 6.4/17 — cluster-wide balance
        counts = Counter(difficulties)
        if counts["core"] != 6 or counts["stretch"] != 2:
            bad(f"cluster mix is {dict(counts)}, expected 6 core + 2 stretch")
        if len(cluster_serials) > 1 and len({s[0] for s in cluster_serials}) != 1:
            bad(f"serials span more than one cluster block: {sorted(cluster_serials)}")

    return problems


def _lint_cards(
    where: str, row: dict[str, Any], cards: list[dict[str, Any]], set_payload: dict[str, Any]
) -> list[str]:
    """Per-card content-shape rules (DESIGN §6.4 rules 3, 8–15)."""
    problems: list[str] = []

    def bad(card_id: Any, message: str) -> None:
        problems.append(f"{where}: {card_id}: {message}")

    functions = {
        f.get("function")
        for f in (set_payload.get("language_bank") or {}).get("functions") or []
    }

    for card in cards:
        if set(card) != CARD_KEYS:
            bad(card.get("id"), f"card row keys {sorted(set(card) ^ CARD_KEYS)} differ")
        payload = card.get("payload_json")
        if not isinstance(payload, dict):
            bad(card.get("id"), "payload_json must be an object")
            continue

        # 6.4/3 — the payload mirror fields
        if payload.get("id") != card.get("id"):
            bad(card.get("id"), "payload_json.id != row id")
        if payload.get("part") != card.get("part"):
            bad(card.get("id"), "payload_json.part != row part")
        if payload.get("topic") != card.get("title"):
            bad(card.get("id"), "payload_json.topic != row title")

        teaching = payload.get("teaching") or {}
        part = card.get("part")

        if part == 1:
            questions = payload.get("questions") or []
            if not 4 <= len(questions) <= 6 or not all(isinstance(q, str) for q in questions):
                bad(card.get("id"), f"Part 1 needs 4–6 string questions, has {len(questions)}")
            notes = teaching.get("questions") or []
            if len(notes) != len(questions):
                bad(card.get("id"), f"teaching.questions {len(notes)} != questions {len(questions)}")
            if [n.get("q_index") for n in notes] != list(range(len(notes))):
                bad(card.get("id"), "teaching.questions q_index is not contiguous from 0")

        elif part == 2:
            cue = payload.get("cue_card") or {}
            bullets = cue.get("bullets") or []
            if len(bullets) != 4:
                bad(card.get("id"), f"cue_card.bullets must be 4, has {len(bullets)}")
            elif not str(bullets[3]).startswith("and explain "):
                bad(card.get("id"), "cue_card.bullets[3] must start with 'and explain '")
            if len(cue.get("rounding_off") or []) != 2:
                bad(card.get("id"), "cue_card.rounding_off must have 2 entries")

            models = teaching.get("model_answers") or []
            if [m.get("band_target") for m in models] != [6, 7, 8]:
                bad(card.get("id"), "model_answers must be exactly bands [6, 7, 8]")
            for model in models:
                transcript = str(model.get("transcript") or "")
                for annotation in model.get("annotations") or []:
                    span = str(annotation.get("span") or "")
                    if span and span not in transcript:
                        bad(
                            card.get("id"),
                            f"band {model.get('band_target')} annotation span "
                            f"{span[:40]!r} is not a substring of its transcript",
                        )
            band7 = next((m for m in models if m.get("band_target") == 7), None)
            if band7 is not None:
                transcript = str(band7.get("transcript") or "")
                for slot in teaching.get("swap_slots") or []:
                    span = str(slot.get("span") or "")
                    if span and span not in transcript:
                        bad(card.get("id"), f"swap_slots span {span[:40]!r} not in band-7 transcript")

            plan = [
                (seg.get("from_s"), seg.get("to_s"), seg.get("segment"))
                for seg in teaching.get("time_plan") or []
            ]
            if plan != TIME_PLAN:
                bad(card.get("id"), f"time_plan boundaries/segments differ from the fixed budget: {plan}")
            grid = (teaching.get("prep_plan") or {}).get("note_grid") or []
            if [cell.get("bullet_index") for cell in grid] != [0, 1, 2, 3]:
                bad(card.get("id"), "prep_plan.note_grid must be 4 cells, bullet_index 0..3 in order")
            for cell in grid:
                text = str(cell.get("cell") or "")
                if len(text) > 40:
                    bad(card.get("id"), f"note_grid cell is {len(text)} chars (>40): {text!r}")
            rungs = [m.get("rung") for m in teaching.get("recovery_moves") or []]
            if not 3 <= len(rungs) <= 4 or any(not isinstance(r, int) or not 1 <= r <= 6 for r in rungs):
                bad(card.get("id"), f"recovery_moves must be 3–4 entries with rung 1–6, got {rungs}")
            for fn in teaching.get("target_language") or []:
                if fn not in functions:
                    bad(card.get("id"), f"target_language {fn!r} is not in the set's language_bank")

        elif part == 3:
            themes = payload.get("part3_themes") or []
            if not 2 <= len(themes) <= 3:
                bad(card.get("id"), f"Part 3 needs 2–3 themes, has {len(themes)}")
            for theme in themes:
                questions = theme.get("questions") or []
                if len(questions) != 3 or not all(isinstance(q, str) for q in questions):
                    bad(card.get("id"), f"theme {theme.get('title')!r} needs exactly 3 questions")
                notes = theme.get("question_notes") or []
                if len(notes) != len(questions):
                    bad(card.get("id"), f"theme {theme.get('title')!r} question_notes length mismatch")
                if [n.get("q_index") for n in notes] != list(range(len(notes))):
                    bad(card.get("id"), f"theme {theme.get('title')!r} q_index not contiguous")
                for fn in theme.get("target_functions") or []:
                    if fn not in functions:
                        bad(card.get("id"), f"target_functions {fn!r} is not in the set's language_bank")

    # 6.4/15 — vocabulary
    vocab = set_payload.get("vocabulary") or []
    if not 8 <= len(vocab) <= 12:
        problems.append(f"{where}: vocabulary must be 8–12 items, has {len(vocab)}")
    items = [v.get("item") for v in vocab]
    if len(items) != len(set(items)):
        problems.append(f"{where}: duplicate vocabulary items")
    if sum(1 for v in vocab if v.get("type") == "word") > 2:
        problems.append(f"{where}: at most 2 vocabulary entries may be type 'word'")
    if sum(1 for v in vocab if v.get("cefr") == "C1") < 2:
        problems.append(f"{where}: vocabulary needs at least 2 C1 items")
    return problems


# --------------------------------------------------------------------------------------
# Merge
# --------------------------------------------------------------------------------------


def merge_rows(
    existing: list[dict[str, Any]], staged: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Pre-staging rows in original order, then every staged row. Re-runnable."""
    staged_ids = {row["id"] for row in staged}
    kept = [row for row in existing if row.get("id") not in staged_ids]
    return kept + staged


def dump_jsonl(rows: list[dict[str, Any]]) -> str:
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


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.merge_speaking",
        description="Merge staging/sets/*.json into the pack's speaking JSONL files.",
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
        help="merge even if lint reports problems (they are still printed)",
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

    try:
        files = staging_files(pack)
        docs = [(path, load_staging(path)) for path in files]
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    topic_ids = {row["id"] for row in read_rows(pack / TOPICS)}

    problems = lint_staging(docs, topic_ids)
    for problem in problems:
        print(f"lint: {problem}", file=sys.stderr)
    if problems and not (args.allow_lint_failures or args.lint_only):
        print(f"error: {len(problems)} lint problem(s) — nothing written", file=sys.stderr)
        return 1
    if args.lint_only:
        print(f"lint: {len(problems)} problem(s) across {len(files)} staging file(s)")
        return 1 if problems else 0

    staged_sets: list[dict[str, Any]] = []
    staged_cards: list[dict[str, Any]] = []
    for path, doc in docs:
        for entry in doc["sets"]:
            staged_sets.append(entry["set"])
            staged_cards.extend(entry["cards"])
        if not args.quiet:
            print(f"staged {path.name}: {len(doc['sets'])} sets")

    targets = [
        (pack / CARD_SETS, staged_sets),
        (pack / SPEAKING_CARDS, staged_cards),
    ]
    stale = False
    for path, staged in targets:
        existing = read_rows(path)
        merged = merge_rows(existing, staged)
        text = dump_jsonl(merged)
        current = path.read_text(encoding="utf-8") if path.is_file() else ""
        kept = len(merged) - len(staged)
        if text == current:
            if not args.quiet:
                print(f"{path.relative_to(pack)}: up to date ({len(merged)} rows)")
            continue
        stale = True
        if args.check:
            print(f"{path.relative_to(pack)}: STALE (would be {len(merged)} rows)", file=sys.stderr)
            continue
        write_atomic(path, text)
        print(f"{path.relative_to(pack)}: {len(merged)} rows ({kept} pre-staging + {len(staged)} staged)")

    if args.check and stale:
        print("error: pack is stale — run without --check", file=sys.stderr)
        return 1
    print(
        f"merged {len(staged_sets)} staged sets / {len(staged_cards)} staged cards "
        f"from {len(files)} cluster file(s); {len(problems)} lint problem(s)"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
