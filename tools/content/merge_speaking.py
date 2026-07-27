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

Round 2 added three further staging *kinds*, all detected from the document itself and all
folded in by the same run (DESIGN §6.6):

``sets`` (round 1, and the five new round-2 clusters)
    ``{"sets": [{"set": …, "cards": [… ×4 or ×5]}]}`` — whole sets, appended.
``update-in-place`` (``r2-backfill``)
    Same shape, but ``"merge_mode": "update-in-place"`` and every id must already exist:
    the rows are *replaced*, never appended.
``card_model_answer_updates`` (``r2-ladder``)
    ``{"kind": …, "updates": [{"card_id": …, "model_answers_add": [band5, band9],
    "ladder_note": …}]}`` — patches ``payload_json.teaching`` on existing Part 2 cards.
``part1_frame_additions`` (``r2-frames``)
    ``{"kind": …, "cards_to_add": [{"card": …}], "set_updates": [{"set_id": …,
    "expect_before": […], "set_after": […]}]}`` — appends new Part 1 cards *and* rewrites
    the parent set's ``payload_json.part1_card_ids`` so nothing is orphaned.

**Idempotent by construction.** Rows already in the pack whose id appears in staging are
dropped and re-appended from staging, so re-running after an author edits one cluster
updates that cluster in place and never duplicates. Rows whose ids are *not* in any
staging file (the 12 hand-authored ``_001`` sets that predate staging) are preserved in
their original order and always come first. The two patch kinds are applied to the *merged*
row list, after the verbatim rows have been rebuilt from staging, so they are re-applied
from a clean base on every run rather than compounding.

After patching, the merge runs an integrity gate — no duplicate id, no set pointing at a
card that does not exist, no card pointing at a set that does not exist — and refuses to
write if it trips.

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
#: DESIGN §6.4/1 as amended in round 2: a set is two Part 1 frames (round 1) or three
#: (round 2 — the exam opens on work/study + home and only then moves to a topic frame).
EXPECTED_PARTS_ANY = ([1, 1, 2, 3], [1, 1, 1, 2, 3])
SERIAL_RE = re.compile(r"_(\d{3})$")
#: Round-2 clusters key their ids to the cluster instead of a §6.3 numeric block, so the
#: "all four cards share the set's serial" rule is checked against the trailing token.
SUFFIX_RE = re.compile(r"_([a-z0-9]+)$")

#: DESIGN §3.8 as amended in round 2 (staging/sets/r2-ladder.json): the ladder is three
#: rungs by default and five once a card has been extended down to 5 and up to 9.
BAND_LADDERS = ([6, 7, 8], [5, 6, 7, 8, 9])

#: The three tiers the picker and the mock assembler offer. ``challenging`` cannot live in
#: ``speaking_cards.difficulty`` (validate.py pins that to core|stretch), so it rides in the
#: set payload. Round-2 authors used two different keys for it; the merge mirrors them.
TIERS = ("core", "stretch", "challenging")
TIER_KEYS = ("difficulty_tier", "challenge_tier")

#: r2-ladder's `ladder_note`: one sentence per rung, naming the single next change.
LADDER_NOTE_KEYS = ("from_5_to_6", "from_6_to_7", "from_7_to_8", "from_8_to_9")

KIND_SETS = "sets"
KIND_UPDATE_SETS = "update_sets"
KIND_CARD_UPDATES = "card_model_answer_updates"
KIND_FRAME_ADDITIONS = "part1_frame_additions"

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


def staging_kind(doc: dict[str, Any]) -> str:
    """Which of the four staging shapes this document is (see the module docstring)."""
    declared = str(doc.get("kind") or "").strip()
    if declared in (KIND_CARD_UPDATES, KIND_FRAME_ADDITIONS):
        return declared
    if isinstance(doc.get("sets"), list):
        if str(doc.get("merge_mode") or "").strip() == "update-in-place":
            return KIND_UPDATE_SETS
        return KIND_SETS
    return ""


def load_staging(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise MergeError(f"{path.name}: unreadable staging file: {exc}") from exc
    if not isinstance(doc, dict):
        raise MergeError(f"{path.name}: staging file must be a JSON object")
    kind = staging_kind(doc)
    if not kind:
        raise MergeError(
            f"{path.name}: unrecognised staging shape — expected a 'sets' list, or "
            f"kind={KIND_CARD_UPDATES!r} / kind={KIND_FRAME_ADDITIONS!r}"
        )
    if kind == KIND_CARD_UPDATES and not isinstance(doc.get("updates"), list):
        raise MergeError(f"{path.name}: {KIND_CARD_UPDATES} needs an 'updates' list")
    if kind == KIND_FRAME_ADDITIONS and not (
        isinstance(doc.get("cards_to_add"), list) and isinstance(doc.get("set_updates"), list)
    ):
        raise MergeError(
            f"{path.name}: {KIND_FRAME_ADDITIONS} needs 'cards_to_add' and 'set_updates' lists"
        )
    return kind, doc


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


def _suffix(row_id: str) -> str | None:
    """The trailing id token — a §6.3 serial (``304``) or a round-2 cluster key (``r2c01``)."""
    match = SUFFIX_RE.search(row_id)
    return match.group(1) if match else None


def set_tier(payload: dict[str, Any]) -> str:
    """``core`` | ``stretch`` | ``challenging`` for one set payload, from either key."""
    for key in TIER_KEYS:
        value = str(payload.get(key) or "").strip().lower()
        if value in TIERS:
            return value
    return str(payload.get("difficulty") or "core").strip().lower()


def lint_staging(
    docs: list[tuple[Path, str, dict[str, Any]]],
    topic_ids: set[str],
) -> list[str]:
    """Every structural violation found, as human-readable strings (empty == clean)."""
    problems: list[str] = []
    seen_ids: dict[str, str] = {}  # id → "file:set_id"

    for path, kind, doc in docs:
        name = path.name
        stem = path.stem

        def bad(message: str, _name: str = name) -> None:
            problems.append(f"{_name}: {message}")

        if doc.get("cluster") != stem:
            bad(f"cluster {doc.get('cluster')!r} does not match filename stem {stem!r}")

        if kind == KIND_CARD_UPDATES:
            problems.extend(_lint_card_updates(name, doc))
            continue
        if kind == KIND_FRAME_ADDITIONS:
            problems.extend(_lint_frame_additions(name, doc, topic_ids, seen_ids))
            continue

        entries = doc["sets"]
        # 6.4/1 — a new cluster is exactly 8 sets. An update file patches whatever set of
        # existing ids its author was given, so the count is not fixed.
        if kind == KIND_SETS and len(entries) != 8:
            bad(f"expected exactly 8 sets, found {len(entries)}")

        cluster_serials: set[str] = set()
        difficulties: list[str] = []
        tiers: list[str] = []

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
            if not isinstance(cards, list) or len(cards) not in (4, 5):
                bad_set(
                    f"expected 4 or 5 cards, found {len(cards) if isinstance(cards, list) else '?'}"
                )
                continue
            parts = [c.get("part") for c in cards]
            if parts not in EXPECTED_PARTS_ANY:
                bad_set(f"card parts {parts} is neither of {EXPECTED_PARTS_ANY}")

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

            # 6.4/4 — id suffix block, global uniqueness. Round 1 used §6.3's 3-digit
            # cluster serial; round-2 clusters key the suffix to the cluster instead so
            # parallel agents cannot collide. Both are checked the same way: every card in
            # a set carries its set's suffix.
            serial = _suffix(str(row.get("id", "")))
            if serial is None:
                bad_set("id does not end in a serial/cluster-key token")
            else:
                cluster_serials.add(serial)
            for row_id in [row.get("id"), *card_ids]:
                row_id = str(row_id)
                if _suffix(row_id) != serial:
                    bad_set(f"{row_id}: id suffix does not match the set suffix {serial}")
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
            tier = set_tier(payload)
            tiers.append(tier)
            if tier not in TIERS:
                bad_set(f"difficulty_tier {tier!r} must be one of {TIERS}")
            if tier == "challenging" and set_difficulty != "stretch":
                bad_set("a challenging set must still carry row difficulty 'stretch'")
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

        # 6.4/17 — cluster-wide balance. Round 1's flat "6 core + 2 stretch" is superseded
        # for any cluster that declares a tier: round 2 deliberately skews harder, and the
        # r2-challenging cluster is 8/8 challenging by definition. What still has to hold
        # is that a cluster is not entirely one rung unless it says so on the tin.
        counts = Counter(difficulties)
        tier_counts = Counter(tiers)
        declares_tier = any(
            any(key in (entry.get("set", {}).get("payload_json") or {}) for key in TIER_KEYS)
            for entry in entries
            if isinstance(entry, dict)
        )
        if kind == KIND_SETS and not declares_tier:
            if counts["core"] != 6 or counts["stretch"] != 2:
                bad(f"cluster mix is {dict(counts)}, expected 6 core + 2 stretch")
        elif kind == KIND_SETS and len(tier_counts) == 1 and stem != "r2-challenging":
            bad(f"cluster is a single tier {dict(tier_counts)} — spread it or rename the cluster")
        if (
            len(cluster_serials) > 1
            and all(len(s) == 3 and s.isdigit() for s in cluster_serials)
            and len({s[0] for s in cluster_serials}) != 1
        ):
            bad(f"serials span more than one cluster block: {sorted(cluster_serials)}")

    return problems


def _lint_card_updates(name: str, doc: dict[str, Any]) -> list[str]:
    """``card_model_answer_updates`` (r2-ladder): the band 5 / band 9 rungs."""
    problems: list[str] = []
    seen: set[str] = set()
    for index, entry in enumerate(doc["updates"]):
        card_id = str(entry.get("card_id") or f"<updates[{index}]>")
        if card_id in seen:
            problems.append(f"{name}: {card_id}: appears twice in 'updates'")
        seen.add(card_id)
        adds = entry.get("model_answers_add") or []
        if [m.get("band_target") for m in adds] != [5, 9]:
            problems.append(
                f"{name}: {card_id}: model_answers_add must be exactly bands [5, 9], "
                f"got {[m.get('band_target') for m in adds]}"
            )
        for model in adds:
            transcript = str(model.get("transcript") or "")
            if not transcript:
                problems.append(f"{name}: {card_id}: band {model.get('band_target')} has no transcript")
            for annotation in model.get("annotations") or []:
                span = str(annotation.get("span") or "")
                if span and span not in transcript:
                    problems.append(
                        f"{name}: {card_id}: band {model.get('band_target')} annotation span "
                        f"{span[:40]!r} is not a substring of its transcript"
                    )
        note = entry.get("ladder_note")
        if not isinstance(note, dict):
            problems.append(f"{name}: {card_id}: ladder_note must be an object")
            continue
        missing = [k for k in LADDER_NOTE_KEYS if not str(note.get(k) or "").strip()]
        if missing:
            problems.append(f"{name}: {card_id}: ladder_note is missing {missing}")
        for key in LADDER_NOTE_KEYS:
            words = len(str(note.get(key) or "").split())
            if words > 30:
                problems.append(f"{name}: {card_id}: ladder_note.{key} is {words} words (>30)")
    return problems


def _lint_frame_additions(
    name: str,
    doc: dict[str, Any],
    topic_ids: set[str],
    seen_ids: dict[str, str],
) -> list[str]:
    """``part1_frame_additions`` (r2-frames): new Part 1 cards + the pointer rewrite."""
    problems: list[str] = []
    added: dict[str, str] = {}  # new card id → its card_set_id

    for index, entry in enumerate(doc["cards_to_add"]):
        card = entry.get("card")
        if not isinstance(card, dict):
            problems.append(f"{name}: cards_to_add[{index}] has no 'card' object")
            continue
        card_id = str(card.get("id") or f"<cards_to_add[{index}]>")
        if set(card) != CARD_KEYS:
            problems.append(f"{name}: {card_id}: card row keys {sorted(set(card) ^ CARD_KEYS)} differ")
        if card.get("part") != 1:
            problems.append(f"{name}: {card_id}: a frame addition must be part 1")
        if card.get("difficulty") != "core":
            problems.append(f"{name}: {card_id}: Part 1 must be core")
        if card.get("topic_id") not in topic_ids:
            problems.append(f"{name}: {card_id}: topic_id {card.get('topic_id')!r} is not in {TOPICS}")
        if card_id in seen_ids:
            problems.append(f"{name}: {card_id}: duplicate id, already used by {seen_ids[card_id]}")
        seen_ids[card_id] = name
        added[card_id] = str(card.get("card_set_id") or "")
        payload = card.get("payload_json")
        if not isinstance(payload, dict):
            problems.append(f"{name}: {card_id}: payload_json must be an object")
            continue
        if payload.get("id") != card.get("id") or payload.get("part") != card.get("part"):
            problems.append(f"{name}: {card_id}: payload mirror fields do not match the row")
        if payload.get("topic") != card.get("title"):
            problems.append(f"{name}: {card_id}: payload_json.topic != row title")
        questions = payload.get("questions") or []
        if not 4 <= len(questions) <= 6 or not all(isinstance(q, str) for q in questions):
            problems.append(f"{name}: {card_id}: Part 1 needs 4–6 string questions, has {len(questions)}")
        notes = (payload.get("teaching") or {}).get("questions") or []
        if len(notes) != len(questions):
            problems.append(f"{name}: {card_id}: teaching.questions {len(notes)} != questions {len(questions)}")
        if [n.get("q_index") for n in notes] != list(range(len(notes))):
            problems.append(f"{name}: {card_id}: teaching.questions q_index is not contiguous from 0")

    # Every added card is reachable from exactly one set, and every patch adds exactly one.
    claimed: set[str] = set()
    for index, patch in enumerate(doc["set_updates"]):
        set_id = str(patch.get("set_id") or f"<set_updates[{index}]>")
        if patch.get("field") != "payload_json.part1_card_ids":
            problems.append(f"{name}: {set_id}: only payload_json.part1_card_ids may be patched")
        before = list(patch.get("expect_before") or [])
        after = list(patch.get("set_after") or [])
        new = [cid for cid in after if cid not in before]
        if [cid for cid in after if cid in before] != before:
            problems.append(f"{name}: {set_id}: set_after must preserve expect_before in order")
        if len(new) != 1 or new[0] != patch.get("added_card_id"):
            problems.append(f"{name}: {set_id}: set_after must add exactly added_card_id, added {new}")
            continue
        card_id = new[0]
        if card_id not in added:
            problems.append(f"{name}: {set_id}: {card_id} is not in cards_to_add")
        elif added[card_id] != set_id:
            problems.append(f"{name}: {set_id}: {card_id}.card_set_id is {added[card_id]!r}")
        if card_id in claimed:
            problems.append(f"{name}: {card_id}: claimed by more than one set_update")
        claimed.add(card_id)
    orphans = sorted(set(added) - claimed)
    if orphans:
        problems.append(f"{name}: {len(orphans)} added card(s) no set points at: {orphans[:4]}")
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
            bands = [m.get("band_target") for m in models]
            if bands not in BAND_LADDERS:
                bad(card.get("id"), f"model_answers bands {bands} is neither of {BAND_LADDERS}")
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


def apply_card_model_answer_updates(
    cards: list[dict[str, Any]], updates: list[dict[str, Any]]
) -> int:
    """r2-ladder: splice the band 5 / band 9 rungs onto existing Part 2 cards.

    Idempotent because it rebuilds the ladder from the card's own 6/7/8 core rather than
    appending to whatever is already there: run it twice and you still get [5,6,7,8,9].
    """
    by_id = {str(row.get("id")): row for row in cards}
    touched = 0
    for entry in updates:
        card_id = str(entry.get("card_id"))
        row = by_id.get(card_id)
        if row is None:
            raise MergeError(f"r2-ladder: no card {card_id!r} to update — refusing to create it")
        if entry.get("card_set_id") and row.get("card_set_id") != entry["card_set_id"]:
            raise MergeError(
                f"r2-ladder: {card_id} card_set_id is {row.get('card_set_id')!r}, "
                f"expected {entry['card_set_id']!r}"
            )
        if row.get("part") != 2:
            raise MergeError(f"r2-ladder: {card_id} is part {row.get('part')}, expected 2")
        payload = row.get("payload_json")
        teaching = payload.get("teaching") if isinstance(payload, dict) else None
        if not isinstance(teaching, dict):
            raise MergeError(f"r2-ladder: {card_id} has no teaching payload to extend")
        core = [m for m in teaching.get("model_answers") or [] if m.get("band_target") in (6, 7, 8)]
        if [m.get("band_target") for m in core] != [6, 7, 8]:
            raise MergeError(f"r2-ladder: {card_id} does not carry a 6/7/8 ladder to extend")
        adds = {m.get("band_target"): m for m in entry.get("model_answers_add") or []}
        if set(adds) != {5, 9}:
            raise MergeError(f"r2-ladder: {card_id} model_answers_add must supply bands 5 and 9")
        teaching["model_answers"] = [adds[5], *core, adds[9]]
        teaching["ladder_note"] = entry["ladder_note"]
        touched += 1
    return touched


def apply_set_field_patches(
    sets: list[dict[str, Any]], patches: list[dict[str, Any]]
) -> int:
    """r2-frames: rewrite ``payload_json.part1_card_ids`` so the new frame is reachable.

    Accepts either the documented ``expect_before`` (a fresh merge, where the set row has
    just been rebuilt from its own staging file) or the already-patched ``set_after`` (a
    hand-edited pack), and refuses anything else rather than clobbering another agent.
    """
    by_id = {str(row.get("id")): row for row in sets}
    touched = 0
    for patch in patches:
        set_id = str(patch.get("set_id"))
        row = by_id.get(set_id)
        if row is None:
            raise MergeError(f"r2-frames: no card set {set_id!r} to patch")
        payload = row.get("payload_json")
        if not isinstance(payload, dict):
            raise MergeError(f"r2-frames: {set_id} payload_json is not an object")
        current = list(payload.get("part1_card_ids") or [])
        before = list(patch.get("expect_before") or [])
        after = list(patch.get("set_after") or [])
        if current not in (before, after):
            raise MergeError(
                f"r2-frames: {set_id}.part1_card_ids is {current}, expected {before} "
                f"(or the already-patched {after}) — another file has changed it; reconcile"
            )
        payload["part1_card_ids"] = after
        touched += 1
    return touched


def normalize_tiers(sets: list[dict[str, Any]]) -> int:
    """Mirror the two round-2 tier keys onto each other so one query answers both.

    Round-2 authors wrote the third difficulty tier under ``difficulty_tier`` in four
    clusters and ``challenge_tier`` in a fifth. ``speaking/mock.py`` reads one of them and
    the picker will want the other; rather than pick a winner and rewrite somebody's
    content, the merge makes both keys present and equal. Purely additive, idempotent.
    """
    touched = 0
    for row in sets:
        payload = row.get("payload_json")
        if not isinstance(payload, dict):
            continue
        tier = set_tier(payload)
        if any(payload.get(key) != tier for key in TIER_KEYS):
            for key in TIER_KEYS:
                payload[key] = tier
            touched += 1
    return touched


def order_cards(sets: list[dict[str, Any]], cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group cards by their set and, inside a set, by the set's own pointer order.

    The API serves a set's cards with ``ORDER BY part``, which leaves ties in insertion
    order — so the row order in this file decides which Part 1 frame a session opens on.
    r2-frames prepends an obligatory work/study + home frame to twelve legacy sets; without
    this pass the "opening" frame would be spoken last.
    """
    by_id = {str(row.get("id")): row for row in cards}
    ordered: list[dict[str, Any]] = []
    placed: set[str] = set()
    for set_row in sets:
        payload = set_row.get("payload_json") or {}
        pointers = [
            *(payload.get("part1_card_ids") or []),
            payload.get("part2_card_id"),
            payload.get("part3_card_id"),
        ]
        for card_id in pointers:
            row = by_id.get(str(card_id))
            if row is not None and str(card_id) not in placed:
                ordered.append(row)
                placed.add(str(card_id))
    # Anything a set does not point at keeps its original position, at the end.
    ordered.extend(row for row in cards if str(row.get("id")) not in placed)
    return ordered


def check_integrity(sets: list[dict[str, Any]], cards: list[dict[str, Any]]) -> list[str]:
    """No duplicate ids, no orphan pointers, no card stranded off a set."""
    problems: list[str] = []
    for label, rows in (("card_sets", sets), ("speaking_cards", cards)):
        counts = Counter(str(row.get("id")) for row in rows)
        for row_id, count in sorted(counts.items()):
            if count > 1:
                problems.append(f"{label}: id {row_id!r} appears {count} times")
    card_ids = {str(row.get("id")) for row in cards}
    set_ids = {str(row.get("id")) for row in sets}
    for set_row in sets:
        payload = set_row.get("payload_json") or {}
        pointers = [
            *(payload.get("part1_card_ids") or []),
            payload.get("part2_card_id"),
            payload.get("part3_card_id"),
        ]
        for card_id in pointers:
            if str(card_id) not in card_ids:
                problems.append(f"card_sets: {set_row.get('id')} points at missing card {card_id!r}")
    for card in cards:
        parent = card.get("card_set_id")
        if parent is None:
            continue
        if str(parent) not in set_ids:
            problems.append(f"speaking_cards: {card.get('id')} points at missing set {parent!r}")
            continue
        payload = next(
            (r.get("payload_json") or {} for r in sets if str(r.get("id")) == str(parent)), {}
        )
        pointed = set(map(str, payload.get("part1_card_ids") or [])) | {
            str(payload.get("part2_card_id")),
            str(payload.get("part3_card_id")),
        }
        if str(card.get("id")) not in pointed:
            problems.append(
                f"speaking_cards: {card.get('id')} belongs to {parent} but the set does not point at it"
            )
    return problems


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
        docs = [(path, *load_staging(path)) for path in files]
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
    card_updates: list[dict[str, Any]] = []
    set_patches: list[dict[str, Any]] = []
    for path, kind, doc in docs:
        if kind in (KIND_SETS, KIND_UPDATE_SETS):
            for entry in doc["sets"]:
                staged_sets.append(entry["set"])
                staged_cards.extend(entry["cards"])
            verb = "sets" if kind == KIND_SETS else "in-place set updates"
            summary = f"{len(doc['sets'])} {verb}"
        elif kind == KIND_CARD_UPDATES:
            card_updates.extend(doc["updates"])
            summary = f"{len(doc['updates'])} card payload updates"
        else:  # KIND_FRAME_ADDITIONS
            # The new frames join the staged card list so a re-run replaces them rather
            # than appending a second copy.
            staged_cards.extend(entry["card"] for entry in doc["cards_to_add"])
            set_patches.extend(doc["set_updates"])
            summary = (
                f"{len(doc['cards_to_add'])} added Part 1 cards "
                f"+ {len(doc['set_updates'])} set pointer patches"
            )
        if not args.quiet:
            print(f"staged {path.name}: {summary}")

    existing_sets = read_rows(pack / CARD_SETS)
    existing_cards = read_rows(pack / SPEAKING_CARDS)

    # An update-in-place file may only *replace*. If one of its ids is not already in the
    # pack the author has mistaken a new set for an edit, and appending it would ship a
    # half-authored row; stop instead.
    known = {str(row.get("id")) for row in existing_sets} | {
        str(row.get("id")) for row in existing_cards
    }
    for path, kind, doc in docs:
        if kind != KIND_UPDATE_SETS:
            continue
        unknown = [
            str(r.get("id"))
            for entry in doc["sets"]
            for r in [entry["set"], *entry["cards"]]
            if str(r.get("id")) not in known
        ]
        if unknown:
            print(
                f"error: {path.name} is merge_mode=update-in-place but {len(unknown)} id(s) "
                f"do not exist in the pack: {unknown[:4]}",
                file=sys.stderr,
            )
            return 1

    merged_sets = merge_rows(existing_sets, staged_sets)
    merged_cards = merge_rows(existing_cards, staged_cards)

    try:
        laddered = apply_card_model_answer_updates(merged_cards, card_updates)
        patched = apply_set_field_patches(merged_sets, set_patches)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    mirrored = normalize_tiers(merged_sets)
    merged_cards = order_cards(merged_sets, merged_cards)
    if not args.quiet:
        print(
            f"patched {laddered} card ladders, {patched} set pointer lists, "
            f"{mirrored} tier mirrors"
        )

    broken = check_integrity(merged_sets, merged_cards)
    for problem in broken:
        print(f"integrity: {problem}", file=sys.stderr)
    if broken:
        print(f"error: {len(broken)} integrity problem(s) — nothing written", file=sys.stderr)
        return 1

    stale = False
    for path, merged, staged in (
        (pack / CARD_SETS, merged_sets, staged_sets),
        (pack / SPEAKING_CARDS, merged_cards, staged_cards),
    ):
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
