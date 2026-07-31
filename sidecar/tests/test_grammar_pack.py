"""The grammar pack file: recognised, imported, derived, and safe to re-import.

Grammar is a new content type, and the way a new content type fails in this codebase is
**silently**: ``validate_rows`` warns "not a recognised pack file" and ignores anything it
has no ``ROW_SCHEMAS`` entry for, so a file with no wiring validates clean, imports zero
rows, and the pack still reports OK. The first four tests exist so that can never happen
again without a red test.

The last group is the rule the derived reading and listening tables learned the hard way and
that this module had to inherit: **the importer must never delete a row that attempt history
references.** Grammar satisfies it by schema rather than by a subquery —
``grammar_review_logs.item_id`` is loose text and not a foreign key — and the point of these
tests is to pin that down, because turning it into an FK would look like a tidy-up and would
break every upgrade on a used install.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text

from bandready.content import loader
from bandready.content.validate import (
    PackReport,
    iter_grammar_items,
    validate_grammar_graph,
    validate_pack,
)

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "content" / "core-en"


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    reset_settings_cache()
    db_engine.reset_engine()
    db_engine.run_migrations()
    yield tmp_path
    db_engine.reset_engine()
    reset_settings_cache()


def _count(session: Any, table: str) -> int:
    return int(session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)


def _point(point_id: str, seq: int, prereqs: list[str], items: list[dict[str, Any]]) -> dict:
    return {
        "id": point_id,
        "unit_id": "u01",
        "sequence_index": seq,
        "title": f"can-do line for {point_id}",
        "cefr_level": "B1",
        "role": "form",
        "topic_id": None,
        "point_json": {
            "schema_version": 1,
            "prerequisites": prereqs,
            "teach": {"can_do": "x", "meaning": "y", "rule_line": "z"},
            "items": items,
        },
    }


def _item(item_id: str, **over: Any) -> dict[str, Any]:
    base = {
        "id": item_id,
        "kind": "interpret",
        "stage": 1,
        "register": "both",
        "error_codes": ["comma_splice"],
        "payload": {"sentence": "s", "question": "q", "options": ["a", "b"], "key": 0},
        "feedback": {"why_key": "w", "feed_forward": "Do the thing."},
    }
    base.update(over)
    return base


# ======================================================================================
# The file is recognised at all
# ======================================================================================


def test_the_shipped_pack_validates_with_its_grammar_file(db: Path) -> None:
    """The whole-pack gate. `ok` must be True *and* grammar must have been counted.

    A pack whose grammar file was ignored also reports ok=True, so the count is the real
    assertion here.
    """
    if not (PACK / "data" / "grammar.jsonl").is_file():
        pytest.skip("no grammar.jsonl in the shipped pack")
    report = validate_pack(PACK)
    assert report.ok, report.errors
    assert report.counts.get("grammar_points", 0) > 0
    assert not any("not a recognised pack file" in w for w in report.warnings)


def test_importing_the_shipped_pack_lands_points_and_derives_items(db: Path) -> None:
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None or not (Path(pack) / "data" / "grammar.jsonl").is_file():
        pytest.skip("no shipped grammar content")

    with session_scope() as s:
        result = loader.import_pack(s, pack)

    assert result["counts"]["grammar_points"] > 0
    assert result["counts"]["grammar_items"] > 0
    with session_scope() as s:
        assert _count(s, "grammar_points") == result["counts"]["grammar_points"]
        assert _count(s, "grammar_items") == result["counts"]["grammar_items"]
        # The teaching payload survives the trip — TABLE_COLUMNS copies point_json.
        blob = s.execute(text("SELECT point_json FROM grammar_points LIMIT 1")).scalar()
        assert json.loads(blob)["teach"]["can_do"]


def test_a_choice_point_keeps_its_whole_contrast_through_the_import(db: Path) -> None:
    """The five-part contrast is the module's central ask; losing it is not survivable."""
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None or not (Path(pack) / "data" / "grammar.jsonl").is_file():
        pytest.skip("no shipped grammar content")
    with session_scope() as s:
        loader.import_pack(s, pack)
        row = s.execute(
            text("SELECT point_json FROM grammar_points WHERE role = 'choice' LIMIT 1")
        ).scalar()
    if row is None:
        pytest.skip("no choice points in the shipped pack yet")
    contrast = json.loads(row)["contrast"]
    for part in ("question", "fork", "minimal_pair", "wrong_choice_note", "edge_case"):
        assert contrast.get(part), f"contrast.{part} did not survive the import"


def test_the_item_extractor_and_the_loader_agree(db: Path) -> None:
    """One definition of "an item", shared by the validator and the importer."""
    row = _point("gr_x", 1, [], [_item("gi_x_01"), _item("gi_x_02")])
    extracted = [i["id"] for i in iter_grammar_items(row)]
    assert extracted == ["gi_x_01", "gi_x_02"]
    assert all(i["_point_id"] == "gr_x" for i in iter_grammar_items(row))


# ======================================================================================
# The graph — the zero-knowledge guarantee
# ======================================================================================


def test_a_cycle_is_an_error_not_a_warning() -> None:
    report = PackReport()
    validate_grammar_graph(
        [
            _point("gr_a", 1, ["gr_b"], []),
            _point("gr_b", 2, ["gr_a"], []),
        ],
        report,
    )
    assert not report.ok
    assert any("cycle" in e for e in report.errors)


def test_a_prerequisite_taught_later_is_an_error() -> None:
    """A beginner following the sequence would meet `gr_b` before it is taught."""
    report = PackReport()
    validate_grammar_graph(
        [_point("gr_a", 1, ["gr_b"], []), _point("gr_b", 2, [], [])],
        report,
    )
    assert not report.ok
    assert any("taught later" in e for e in report.errors)


def test_a_prerequisite_outside_the_pack_is_only_a_warning() -> None:
    """A partial syllabus must still ship — the runtime treats it as already met."""
    report = PackReport()
    validate_grammar_graph([_point("gr_a", 1, ["gr_not_authored_yet"], [])], report)
    assert report.ok, report.errors
    assert any("does not carry" in w for w in report.warnings)


def test_a_duplicate_item_id_is_an_error() -> None:
    report = PackReport()
    validate_grammar_graph(
        [
            _point("gr_a", 1, [], [_item("gi_dup_01")]),
            _point("gr_b", 2, [], [_item("gi_dup_01")]),
        ],
        report,
    )
    assert not report.ok
    assert any("duplicate item id" in e for e in report.errors)


def test_a_twin_with_the_same_key_is_an_error() -> None:
    """A twin pair exists to force the learner off the shape and onto the meaning."""
    options = [{"text": "worked"}, {"text": "have worked"}]
    report = PackReport()
    validate_grammar_graph(
        [
            _point(
                "gr_a",
                1,
                [],
                [
                    _item(
                        "gi_a_01",
                        kind="choose_form",
                        twin_id="gi_a_02",
                        payload={"options": options, "key": 0},
                    ),
                    _item(
                        "gi_a_02",
                        kind="choose_form",
                        twin_id="gi_a_01",
                        payload={"options": options, "key": 0},
                    ),
                ],
            )
        ],
        report,
    )
    assert not report.ok
    assert any("same key" in e for e in report.errors)


def test_the_shipped_graph_is_acyclic_and_ordered() -> None:
    """The promise on the tin, checked against what actually ships."""
    path = PACK / "data" / "grammar.jsonl"
    if not path.is_file():
        pytest.skip("no grammar.jsonl in the shipped pack")
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    report = PackReport()
    validate_grammar_graph(rows, report)
    assert report.ok, report.errors


# ======================================================================================
# Re-import — never delete a row attempt history references
# ======================================================================================


def _seed_one_point(session: Any, items: list[dict[str, Any]]) -> None:
    rows = [_point("gr_reimport", 1, [], items)]
    loader.upsert_rows(session, "grammar_points", rows, "org.t", "1.0.0", "CC0-1.0")
    loader.derive_grammar_items(session, rows)


def test_derive_is_idempotent(db: Path) -> None:
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _seed_one_point(s, [_item("gi_reimport_01"), _item("gi_reimport_02")])
    with session_scope() as s:
        assert _count(s, "grammar_items") == 2
        _seed_one_point(s, [_item("gi_reimport_01"), _item("gi_reimport_02")])
    with session_scope() as s:
        assert _count(s, "grammar_items") == 2, "a re-import must not duplicate items"


def test_a_reviewed_item_that_a_later_pack_drops_leaves_the_history_readable(db: Path) -> None:
    """The rule that broke upgrades once already, pinned for this module.

    ``grammar_review_logs.item_id`` is deliberately loose text. If it were a foreign key,
    dropping an item in a later pack version would abort the import on exactly the installs
    that matter most — the ones where the learner has actually practised.
    """
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _seed_one_point(s, [_item("gi_reimport_01"), _item("gi_reimport_02")])
        s.execute(
            text("INSERT INTO profiles (id, name, exam_format) VALUES ('pf_t','T','academic')")
        )
        s.execute(
            text(
                "INSERT INTO grammar_cards (id, profile_id, point_id, due_at, fsrs_json) "
                "VALUES ('gc_t', 'pf_t', 'gr_reimport', '2026-01-01T00:00:00.000Z', '{}')"
            )
        )
        s.execute(
            text(
                "INSERT INTO grammar_review_logs "
                "(id, card_id, item_id, rating, review_type, outcome, stage_before) "
                "VALUES ('gl_t', 'gc_t', 'gi_reimport_02', 3, 'interpret', 'pass', 1)"
            )
        )

    # A later pack version drops the item the learner answered.
    with session_scope() as s:
        _seed_one_point(s, [_item("gi_reimport_01")])

    with session_scope() as s:
        assert _count(s, "grammar_items") == 1
        assert _count(s, "grammar_review_logs") == 1, "review history must survive an upgrade"
        kept = s.execute(
            text("SELECT item_id FROM grammar_review_logs WHERE id = 'gl_t'")
        ).scalar()
        assert kept == "gi_reimport_02", "the log still names what was answered"


def test_dropping_a_points_whole_bank_does_not_touch_another_points(db: Path) -> None:
    from bandready.db.engine import session_scope

    with session_scope() as s:
        loader.upsert_rows(
            s,
            "grammar_points",
            [_point("gr_one", 1, [], []), _point("gr_two", 2, [], [])],
            "org.t",
            "1.0.0",
            "CC0-1.0",
        )
        loader.derive_grammar_items(
            s,
            [
                _point("gr_one", 1, [], [_item("gi_one_01")]),
                _point("gr_two", 2, [], [_item("gi_two_01")]),
            ],
        )
    with session_scope() as s:
        assert _count(s, "grammar_items") == 2
        # gr_one loses its whole bank; gr_two is not in this import at all.
        loader.derive_grammar_items(s, [_point("gr_one", 1, [], [])])
    with session_scope() as s:
        remaining = {
            r[0] for r in s.execute(text("SELECT id FROM grammar_items")).all()
        }
        assert remaining == {"gi_two_01"}


# ======================================================================================
# The vocabulary v2 payload reaching the runtime (D3)
# ======================================================================================


def test_a_seeded_entry_carries_its_authored_contexts_into_the_review_queue(db: Path) -> None:
    """The half of "practised in real sentences" that lives outside the grammar module.

    Deck opt-in copies ten named fields out of ``entry_json`` and drops the rest, so the
    authored ``contexts[]`` never reach ``vocab_entries``. They are read back through the
    join that already exists (``vocab_sources.session_id`` → ``vocab_pack_entries.id``).
    Without this wire the vocabulary queue clozes one fixed sentence per word forever,
    which is exactly what the sentence-based practice was supposed to replace.
    """
    from bandready.db.engine import session_scope
    from bandready.server.routes.srs import _queue_items
    from bandready.server.routes.vocab import _opt_in

    pack = loader.default_pack_path()
    if pack is None:
        pytest.skip("no shipped content pack on disk")

    with session_scope() as s:
        loader.import_pack(s, pack)
        s.execute(
            text("INSERT INTO profiles (id, name, exam_format) VALUES ('pf_v','T','academic')")
        )
        # A deck whose every row is schema v2, so the queue cannot hand back only the
        # older v1 entries that share a topic deck with them.
        deck = s.execute(
            text(
                "SELECT deck FROM vocab_pack_entries GROUP BY deck "
                "HAVING SUM(entry_json LIKE '%\"schema_version\": 2%') = COUNT(*) LIMIT 1"
            )
        ).scalar()
        if deck is None:
            pytest.skip("no schema-v2 vocabulary in the shipped pack")
        _opt_in(s, "pf_v", str(deck))
        s.flush()
        items = _queue_items(s, "pf_v", 20)

    assert items, "opting into a deck should schedule something"
    with_contexts = [i for i in items if len(i["entry"].get("contexts") or []) >= 3]
    assert with_contexts, "the authored context sentences did not reach the review queue"
    entry = with_contexts[0]["entry"]
    assert entry.get("unit_type"), "the v2 classification fields came through too"
    for ctx in entry["contexts"]:
        assert ctx["gap_span"] in ctx["text"], "a cloze blank that is not in its own sentence"
