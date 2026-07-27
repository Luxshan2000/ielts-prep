"""The speaking merge gate — `tools/content/merge_speaking.py`.

Round 2 staged three shapes of file the round-1 merge could not read: whole new sets,
in-place updates to rows that already ship, and additive Part 1 cards that also rewrite
their parent set's pointer list. All three land in one run, and the run has to be safe to
repeat — a merge that duplicates a row on its second execution poisons the pack, because
`validate_rows` rejects a duplicate id and rejects the pack *whole*.

`tools` lives above the sidecar package and is not on the sidecar's import path, so it is
loaded here by file path rather than by name.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "content" / "core-en"


def _load_module() -> Any:
    """Import `tools.content.merge_speaking` from disk, package context and all."""
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    spec = importlib.util.spec_from_file_location(
        "tools.content.merge_speaking", REPO / "tools" / "content" / "merge_speaking.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


merge = _load_module()


# --------------------------------------------------------------------------------------
# Row fixtures — the smallest shapes each merge mode needs
# --------------------------------------------------------------------------------------


def _set_row(set_id: str, part1: list[str], part2: str, part3: str) -> dict[str, Any]:
    return {
        "id": set_id,
        "title": "A set",
        "topic_id": "topic_work",
        "parts_json": [1, 2, 3],
        "payload_json": {
            "schema_version": 2,
            "difficulty": "core",
            "part1_card_ids": list(part1),
            "part2_card_id": part2,
            "part3_card_id": part3,
        },
    }


def _card_row(card_id: str, part: int, set_id: str) -> dict[str, Any]:
    return {
        "id": card_id,
        "part": part,
        "card_set_id": set_id,
        "topic_id": "topic_work",
        "title": "A card",
        "difficulty": "core" if part != 3 else "stretch",
        "tags_json": [],
        "payload_json": {"schema_version": 2, "id": card_id, "part": part, "topic": "A card"},
    }


def _ladder(card_id: str) -> dict[str, Any]:
    """A Part 2 card carrying the round-1 three-rung ladder, ready to be extended."""
    row = _card_row(card_id, 2, "set_a")
    row["payload_json"]["teaching"] = {
        "model_answers": [
            {"band_target": band, "transcript": f"band {band} text"} for band in (6, 7, 8)
        ]
    }
    return row


@pytest.fixture()
def pack(tmp_path: Path) -> Path:
    """A two-set pack on disk, in the JSONL shape the real one uses."""
    data = tmp_path / "data"
    data.mkdir(parents=True)
    sets = [
        _set_row("set_a", ["card_p1_a1", "card_p1_a2"], "card_p2_a", "card_p3_a"),
        _set_row("set_b", ["card_p1_b1", "card_p1_b2"], "card_p2_b", "card_p3_b"),
    ]
    cards = [
        _card_row("card_p1_a1", 1, "set_a"),
        _card_row("card_p1_a2", 1, "set_a"),
        _ladder("card_p2_a"),
        _card_row("card_p3_a", 3, "set_a"),
        _card_row("card_p1_b1", 1, "set_b"),
        _card_row("card_p1_b2", 1, "set_b"),
        _card_row("card_p2_b", 2, "set_b"),
        _card_row("card_p3_b", 3, "set_b"),
    ]
    (data / "card_sets.jsonl").write_text(merge.dump_jsonl(sets), encoding="utf-8")
    (data / "speaking_cards.jsonl").write_text(merge.dump_jsonl(cards), encoding="utf-8")
    return tmp_path


def _read(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


# --------------------------------------------------------------------------------------
# Kind detection
# --------------------------------------------------------------------------------------


def test_every_round_2_staging_shape_is_recognised() -> None:
    assert merge.staging_kind({"sets": []}) == merge.KIND_SETS
    assert merge.staging_kind({"sets": [], "merge_mode": "update-in-place"}) == merge.KIND_UPDATE_SETS
    assert merge.staging_kind({"kind": "card_model_answer_updates"}) == merge.KIND_CARD_UPDATES
    assert merge.staging_kind({"kind": "part1_frame_additions"}) == merge.KIND_FRAME_ADDITIONS
    assert merge.staging_kind({"notes": "no rows here"}) == ""


# --------------------------------------------------------------------------------------
# The band ladder (r2-ladder)
# --------------------------------------------------------------------------------------


def _ladder_update(card_id: str = "card_p2_a") -> dict[str, Any]:
    return {
        "card_id": card_id,
        "card_set_id": "set_a",
        "model_answers_add": [
            {"band_target": 5, "transcript": "band 5 text"},
            {"band_target": 9, "transcript": "band 9 text"},
        ],
        "ladder_note": {"from_5_to_6": "Say more."},
    }


def test_the_ladder_is_spliced_into_band_order(pack: Path) -> None:
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    assert merge.apply_card_model_answer_updates(cards, [_ladder_update()]) == 1

    teaching = next(c for c in cards if c["id"] == "card_p2_a")["payload_json"]["teaching"]
    assert [m["band_target"] for m in teaching["model_answers"]] == [5, 6, 7, 8, 9]
    assert teaching["ladder_note"]["from_5_to_6"] == "Say more."


def test_re_applying_the_ladder_does_not_grow_it(pack: Path) -> None:
    """The rebuild is from the card's own 6/7/8 core, so a second run is a no-op."""
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    merge.apply_card_model_answer_updates(cards, [_ladder_update()])
    once = copy.deepcopy(cards)
    merge.apply_card_model_answer_updates(cards, [_ladder_update()])
    assert cards == once


def test_the_ladder_refuses_to_invent_a_card(pack: Path) -> None:
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    with pytest.raises(merge.MergeError, match="refusing to create it"):
        merge.apply_card_model_answer_updates(cards, [_ladder_update("card_p2_nope")])


def test_the_ladder_refuses_a_card_with_no_rungs_to_extend(pack: Path) -> None:
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    update = _ladder_update("card_p2_b")
    update["card_set_id"] = "set_b"
    with pytest.raises(merge.MergeError, match="no teaching payload"):
        merge.apply_card_model_answer_updates(cards, [update])


# --------------------------------------------------------------------------------------
# The third Part 1 frame (r2-frames)
# --------------------------------------------------------------------------------------


def _frame_patch() -> dict[str, Any]:
    return {
        "set_id": "set_a",
        "field": "payload_json.part1_card_ids",
        "expect_before": ["card_p1_a1", "card_p1_a2"],
        "set_after": ["card_p1_a0", "card_p1_a1", "card_p1_a2"],
        "added_card_id": "card_p1_a0",
    }


def test_the_frame_patch_rewrites_the_pointer_list_in_order(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    assert merge.apply_set_field_patches(sets, [_frame_patch()]) == 1
    row = next(s for s in sets if s["id"] == "set_a")
    assert row["payload_json"]["part1_card_ids"] == ["card_p1_a0", "card_p1_a1", "card_p1_a2"]


def test_the_frame_patch_is_idempotent(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    merge.apply_set_field_patches(sets, [_frame_patch()])
    merge.apply_set_field_patches(sets, [_frame_patch()])
    row = next(s for s in sets if s["id"] == "set_a")
    assert row["payload_json"]["part1_card_ids"] == ["card_p1_a0", "card_p1_a1", "card_p1_a2"]


def test_the_frame_patch_stops_rather_than_clobber_another_agent(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    next(s for s in sets if s["id"] == "set_a")["payload_json"]["part1_card_ids"] = ["else"]
    with pytest.raises(merge.MergeError, match="reconcile"):
        merge.apply_set_field_patches(sets, [_frame_patch()])


# --------------------------------------------------------------------------------------
# Ordering, tiers and the integrity gate
# --------------------------------------------------------------------------------------


def test_cards_are_written_in_the_order_the_set_points_at_them(pack: Path) -> None:
    """The API serves a set's cards ORDER BY part, so ties fall back to insertion order.

    A frame prepended to `part1_card_ids` must therefore also come first in the file, or
    a practice session opens on the wrong frame.
    """
    sets = _read(pack / "data" / "card_sets.jsonl")
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    cards.append(_card_row("card_p1_a0", 1, "set_a"))
    merge.apply_set_field_patches(sets, [_frame_patch()])

    ordered = merge.order_cards(sets, cards)
    part1_of_a = [c["id"] for c in ordered if c["card_set_id"] == "set_a" and c["part"] == 1]
    assert part1_of_a == ["card_p1_a0", "card_p1_a1", "card_p1_a2"]


def test_the_two_tier_keys_are_mirrored_onto_each_other(pack: Path) -> None:
    """Round-2 authors used `difficulty_tier` in four clusters and `challenge_tier` in
    a fifth. The merge makes both present and equal rather than picking a winner."""
    sets = _read(pack / "data" / "card_sets.jsonl")
    sets[0]["payload_json"]["challenge_tier"] = "challenging"
    sets[1]["payload_json"]["difficulty_tier"] = "stretch"

    merge.normalize_tiers(sets)
    assert sets[0]["payload_json"]["difficulty_tier"] == "challenging"
    assert sets[1]["payload_json"]["challenge_tier"] == "stretch"
    # A set that declares nothing falls back to its row difficulty, not to a guess.
    assert merge.set_tier({"difficulty": "core"}) == "core"


def test_normalising_tiers_twice_changes_nothing(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    merge.normalize_tiers(sets)
    assert merge.normalize_tiers(sets) == 0


def test_integrity_catches_a_duplicate_id(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    cards.append(dict(cards[0]))
    problems = merge.check_integrity(sets, cards)
    assert any("appears 2 times" in p for p in problems)


def test_integrity_catches_an_orphan_pointer(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    sets[0]["payload_json"]["part1_card_ids"].append("card_p1_ghost")
    problems = merge.check_integrity(sets, cards)
    assert any("points at missing card" in p for p in problems)


def test_integrity_catches_a_card_its_set_does_not_point_at(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    cards.append(_card_row("card_p1_a9", 1, "set_a"))
    problems = merge.check_integrity(sets, cards)
    assert any("the set does not point at it" in p for p in problems)


def test_a_clean_pack_has_no_integrity_problems(pack: Path) -> None:
    sets = _read(pack / "data" / "card_sets.jsonl")
    cards = _read(pack / "data" / "speaking_cards.jsonl")
    assert merge.check_integrity(sets, cards) == []


# --------------------------------------------------------------------------------------
# The shipped pack
# --------------------------------------------------------------------------------------


@pytest.mark.skipif(not PACK.is_dir(), reason="run from a checkout with content/core-en")
def test_the_shipped_pack_is_merged_and_internally_consistent() -> None:
    """`--check` should be clean, and nothing in the pack should dangle."""
    sets = _read(PACK / "data" / "card_sets.jsonl")
    cards = _read(PACK / "data" / "speaking_cards.jsonl")
    assert merge.check_integrity(sets, cards) == []
    # Round 2's headline promise: every set carries a teaching payload.
    assert [s["id"] for s in sets if not (s["payload_json"] or {}).get("language_bank")] == []
