"""Re-seating grammar points into a teachable order.

Parallel authoring cannot produce a globally correct ``sequence_index``. Eleven agents write
one unit each and none of them sees the others, so the first run produced exactly the two
defects that arrangement invites: two blocks opening at the same index, and a point seated
before its own prerequisite (``gr_passive_nonfinite`` at #76 needing ``gr_verb_patterns_core``
at #115 — a beginner met the dependent first).

The fix is to stop asking authors for the answer. They number inside a private band where
collision is impossible, and this pass computes the real order from the prerequisite graph.
The property that matters to a learner is the one these tests pin: **you are never shown a
point before the thing it depends on**.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[2]


def _load_module() -> Any:
    """`tools` lives above the sidecar package and is not on its import path (as in
    test_merge_speaking.py), so import it from disk, package context and all."""
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    spec = importlib.util.spec_from_file_location(
        "tools.content.reseq_grammar", REPO / "tools" / "content" / "reseq_grammar.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reseq = _load_module()


def _point(pid: str, unit: str, seat: int, needs: list[str] | None = None) -> dict:
    return {
        "id": pid,
        "unit_id": unit,
        "sequence_index": seat,
        "title": pid,
        "cefr_level": "A1",
        "role": "form",
        "topic_id": "topic_general",
        "point_json": {"prerequisites": needs or []},
    }


def _pack(tmp_path: Path, rows: list[dict]) -> Path:
    data = tmp_path / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "grammar.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n"
    )
    return tmp_path


def _seated(tmp_path: Path) -> dict[str, int]:
    rows = reseq.load_rows(tmp_path / "data" / "grammar.jsonl")
    return {r["id"]: int(r["sequence_index"]) for r in rows}


# ======================================================================================
# The property a learner actually experiences
# ======================================================================================


def test_a_prerequisite_is_always_seated_earlier(tmp_path: Path) -> None:
    """The inversion that shipped: the dependent was numbered before what it needed."""
    rows = [
        _point("gr_passive_nonfinite", "u08", 76, ["gr_verb_patterns_core"]),
        _point("gr_verb_patterns_core", "u12", 115),
    ]
    pack = _pack(tmp_path, rows)
    assert reseq.main([str(pack), "--quiet"]) == 0

    seats = _seated(pack)
    assert seats["gr_verb_patterns_core"] < seats["gr_passive_nonfinite"]


def test_a_whole_chain_comes_out_in_order(tmp_path: Path) -> None:
    """Authors wrote it backwards; depth ordering still recovers the teaching sequence."""
    rows = [
        _point("d", "u04", 1000, ["c"]),
        _point("c", "u03", 1001, ["b"]),
        _point("b", "u02", 1002, ["a"]),
        _point("a", "u01", 1003),
    ]
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])

    seats = _seated(pack)
    assert [seats[k] for k in ("a", "b", "c", "d")] == [1, 2, 3, 4]


def test_output_is_a_permutation_of_one_to_n(tmp_path: Path) -> None:
    rows = [_point(f"p{i}", "u01", 1000 + i * 7) for i in range(12)]
    rows[3]["point_json"]["prerequisites"] = ["p9"]
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])

    assert sorted(_seated(pack).values()) == list(range(1, 13))


# ======================================================================================
# Tie-breaking — why the output is stable rather than merely valid
# ======================================================================================


def test_independent_points_keep_their_unit_grouping(tmp_path: Path) -> None:
    """Nothing depends on anything, so the authored intent must survive intact."""
    rows = [
        _point("b2", "u02", 1101),
        _point("a1", "u01", 1000),
        _point("b1", "u02", 1100),
        _point("a2", "u01", 1001),
    ]
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])

    seats = _seated(pack)
    assert [seats[k] for k in ("a1", "a2", "b1", "b2")] == [1, 2, 3, 4]


def test_an_advanced_point_does_not_jump_the_queue(tmp_path: Path) -> None:
    """The defect a depth-layered sort produced on the real pack.

    ``gr_embedded_question`` is C1, but its prerequisites are in units nobody has authored
    yet, so it had no resolvable edges and layering seated it third — ahead of
    ``gr_be_present``. Dependency-safe and pedagogically absurd. Among points that are all
    eligible, the beginner material has to come first.
    """
    rows = [
        _point("gr_embedded_question", "u11", 1000),
        _point("gr_be_present", "u01", 1900),
    ]
    rows[0]["cefr_level"] = "C1"
    rows[1]["cefr_level"] = "A1"
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])

    seats = _seated(pack)
    assert seats["gr_be_present"] < seats["gr_embedded_question"]


def test_cefr_never_overrides_a_real_dependency(tmp_path: Path) -> None:
    """Kindness is only ever applied among points that are already safe to seat."""
    rows = [
        _point("easy_but_dependent", "u01", 1000, ["hard_but_first"]),
        _point("hard_but_first", "u09", 1900),
    ]
    rows[0]["cefr_level"] = "A1"
    rows[1]["cefr_level"] = "C1"
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])

    seats = _seated(pack)
    assert seats["hard_but_first"] < seats["easy_but_dependent"]


def test_an_unknown_cefr_level_sorts_last_rather_than_crashing(tmp_path: Path) -> None:
    rows = [_point("weird", "u01", 1000), _point("normal", "u01", 1001)]
    rows[0]["cefr_level"] = "banana"
    rows[1]["cefr_level"] = "B2"
    pack = _pack(tmp_path, rows)

    assert reseq.main([str(pack), "--quiet"]) == 0
    assert _seated(pack)["normal"] < _seated(pack)["weird"]


def test_reseating_is_idempotent(tmp_path: Path) -> None:
    """A second pass must be a no-op, or the pack churns on every build."""
    rows = [
        _point("c", "u03", 1200, ["a"]),
        _point("a", "u01", 1000),
        _point("b", "u02", 1100, ["a"]),
    ]
    pack = _pack(tmp_path, rows)
    reseq.main([str(pack), "--quiet"])
    first = (pack / "data" / "grammar.jsonl").read_text()

    assert reseq.main([str(pack), "--check", "--quiet"]) == 0, "already seated — check must pass"
    reseq.main([str(pack), "--quiet"])
    assert (pack / "data" / "grammar.jsonl").read_text() == first


def test_check_reports_without_writing(tmp_path: Path) -> None:
    rows = [_point("b", "u02", 1100, ["a"]), _point("a", "u01", 1500)]
    pack = _pack(tmp_path, rows)
    before = (pack / "data" / "grammar.jsonl").read_text()

    assert reseq.main([str(pack), "--check", "--quiet"]) == 2, "a needed change exits non-zero"
    assert (pack / "data" / "grammar.jsonl").read_text() == before, "--check must not write"


# ======================================================================================
# The holes that exist while the syllabus is being authored
# ======================================================================================


def test_an_edge_to_an_unauthored_point_is_ignored_not_fatal(tmp_path: Path) -> None:
    """The syllabus is incomplete mid-authoring; the loader treats such an edge as met."""
    rows = [_point("a", "u01", 1000, ["gr_not_written_yet"])]
    pack = _pack(tmp_path, rows)

    assert reseq.main([str(pack), "--quiet"]) == 0
    assert _seated(pack) == {"a": 1}


def test_the_ignored_edge_is_reported(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """Silently dropping it is how a syllabus hole becomes invisible."""
    pack = _pack(tmp_path, [_point("a", "u01", 1000, ["gr_missing"])])
    reseq.main([str(pack)])

    assert "gr_missing" in capsys.readouterr().out


def test_a_cycle_is_a_hard_error_and_names_its_members(tmp_path: Path) -> None:
    """No seating exists. Picking one anyway would hide an authoring mistake."""
    rows = [
        _point("a", "u01", 1000, ["c"]),
        _point("b", "u02", 1100, ["a"]),
        _point("c", "u03", 1200, ["b"]),
    ]
    pack = _pack(tmp_path, rows)

    with pytest.raises(SystemExit) as excinfo:
        reseq.main([str(pack), "--quiet"])
    message = str(excinfo.value)
    assert "cycle" in message
    assert "a" in message and "b" in message and "c" in message


def test_a_missing_pack_fails_loudly(tmp_path: Path) -> None:
    assert reseq.main([str(tmp_path), "--quiet"]) == 1


# ======================================================================================
# The authored payload must survive the move
# ======================================================================================


def test_reseating_only_changes_the_seat(tmp_path: Path) -> None:
    """Everything the learner sees lives in point_json and must come through untouched."""
    teach = {"can_do": "I can do the thing.", "rule_line": "Weld them on."}
    row = _point("a", "u01", 1000)
    row["point_json"] = {"prerequisites": [], "teach": teach, "items": [{"id": "gi_a_01"}]}
    pack = _pack(tmp_path, [row])
    reseq.main([str(pack), "--quiet"])

    out = reseq.load_rows(pack / "data" / "grammar.jsonl")[0]
    assert out["point_json"]["teach"] == teach
    assert out["point_json"]["items"] == [{"id": "gi_a_01"}]
    assert out["title"] == "a" and out["unit_id"] == "u01" and out["cefr_level"] == "A1"


def test_columns_are_written_in_the_authored_order(tmp_path: Path) -> None:
    """merge_grammar writes this order too, so a re-seated row diffs cleanly against it."""
    pack = _pack(tmp_path, [_point("a", "u01", 1000)])
    reseq.main([str(pack), "--quiet"])

    first = json.loads((pack / "data" / "grammar.jsonl").read_text().splitlines()[0])
    assert list(first) == list(reseq.COLUMNS)
