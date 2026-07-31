"""Upgrading an install that has already been used.

Two defects made a content update impossible on a real machine, and both failed in ways
that looked like success:

1. ``import_pack`` skipped whenever ``(pack_id, version)`` was already installed. A pack
   is rebuilt far more often than its version is bumped, so the importer reported
   ``already_installed``, changed nothing, and an install sat on a stale bank forever.

2. The derived question tables were cleared with an unguarded DELETE. Attempt history
   FK-references those rows, so on any install where the learner had actually practised
   the import aborted with a FOREIGN KEY error — the one case that matters most.

The module docstring already stated the rule ("retire, never delete, because attempt
history FK-references them"). It was applied to the typed tables and not to the rows
derived from them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import text

from bandready.content import loader


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


def _count(session, table: str) -> int:
    return int(session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)


# ======================================================================================
# content_changed — the skip decision
# ======================================================================================


def _install_marker(session, pack_id: str, version: str, checksums: dict[str, str]) -> None:
    session.execute(
        text(
            "INSERT INTO content_packs (pack_id, version, name, description, publisher, "
            "license, ai_disclosure, manifest_json, enabled) "
            "VALUES (:p, :v, 'n', '', '', 'CC0-1.0', 'human', :m, 1)"
        ),
        {"p": pack_id, "v": version, "m": json.dumps({"checksums": checksums})},
    )


def test_identical_checksums_are_a_skip(db: Path) -> None:
    from bandready.db.engine import session_scope

    checks = {"data/vocab.jsonl": "sha256:abc"}
    with session_scope() as s:
        _install_marker(s, "org.x", "1.0.0", checks)
        assert loader.content_changed(s, "org.x", "1.0.0", {"checksums": checks}) is False


def test_a_changed_file_is_detected_at_the_same_version(db: Path) -> None:
    """The whole point: a rebuilt pack that never bumped its version."""
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _install_marker(s, "org.x", "1.0.0", {"data/vocab.jsonl": "sha256:old"})
        assert loader.content_changed(s, "org.x", "1.0.0", {"checksums": {"data/vocab.jsonl": "sha256:new"}})


def test_an_added_file_is_detected(db: Path) -> None:
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _install_marker(s, "org.x", "1.0.0", {"a.jsonl": "sha256:1"})
        assert loader.content_changed(
            s, "org.x", "1.0.0", {"checksums": {"a.jsonl": "sha256:1", "b.jsonl": "sha256:2"}}
        )


def test_an_install_with_no_recorded_checksums_is_treated_as_changed(db: Path) -> None:
    """Predates checksum recording — we cannot prove it is current, and re-import is safe."""
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _install_marker(s, "org.x", "1.0.0", {})
        assert loader.content_changed(s, "org.x", "1.0.0", {"checksums": {"a.jsonl": "sha256:1"}})


def test_a_manifest_without_checksums_leaves_the_version_check_in_charge(db: Path) -> None:
    """Nothing to compare, so do not force a re-import on every single boot."""
    from bandready.db.engine import session_scope

    with session_scope() as s:
        _install_marker(s, "org.x", "1.0.0", {"a.jsonl": "sha256:1"})
        assert loader.content_changed(s, "org.x", "1.0.0", {}) is False
        assert loader.content_changed(s, "org.x", "1.0.0", {"checksums": {}}) is False


# ======================================================================================
# The FK-safe refresh — the defect that broke real installs
# ======================================================================================


def test_reimport_keeps_an_answered_question_and_its_history(db: Path) -> None:
    """A learner who has practised must still receive content updates."""
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None:
        pytest.skip("no shipped content pack on disk")

    with session_scope() as s:
        loader.import_pack(s, pack)

    # Answer one real question, exactly as a practice attempt would.
    with session_scope() as s:
        qid, pid = s.execute(
            text("SELECT id, passage_id FROM reading_questions LIMIT 1")
        ).first()
        # reading_attempts.id FK-references the practice_sessions envelope, and that
        # needs a profile — build the same chain a real attempt would.
        profile_id = s.execute(text("SELECT id FROM profiles LIMIT 1")).scalar()
        if profile_id is None:
            s.execute(
                text(
                    "INSERT INTO profiles (id, name, exam_format) "
                    "VALUES ('pf_t', 'Test', 'academic')"
                )
            )
            profile_id = "pf_t"
        s.execute(
            text(
                "INSERT INTO practice_sessions (id, profile_id, module, activity) "
                "VALUES ('ra_t', :prof, 'reading', 'practice')"
            ),
            {"prof": profile_id},
        )
        s.execute(
            text(
                "INSERT INTO reading_attempts (id, passage_id, mode, status) "
                "VALUES ('ra_t', :pid, 'practice', 'submitted')"
            ),
            {"pid": pid},
        )
        s.execute(
            text(
                "INSERT INTO reading_answers "
                "(id, attempt_id, question_id, qtype, given, correct) "
                "VALUES ('ans_t', 'ra_t', :q, 'true_false_not_given', 'x', 0)"
            ),
            {"q": qid},
        )

    # Re-import the very same pack. Before the fix this raised IntegrityError.
    with session_scope() as s:
        loader.import_pack(s, pack, repair=True)

    with session_scope() as s:
        assert _count(s, "reading_answers") == 1, "attempt history must survive an upgrade"
        still_there = s.execute(
            text("SELECT 1 FROM reading_questions WHERE id = :q"), {"q": qid}
        ).first()
        assert still_there is not None, "an answered question may not be deleted"


def test_reimport_is_idempotent_in_its_counts(db: Path) -> None:
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None:
        pytest.skip("no shipped content pack on disk")

    with session_scope() as s:
        loader.import_pack(s, pack)
    with session_scope() as s:
        before = {t: _count(s, t) for t in ("reading_questions", "listening_questions", "speaking_cards")}

    with session_scope() as s:
        loader.import_pack(s, pack, repair=True)
    with session_scope() as s:
        after = {t: _count(s, t) for t in ("reading_questions", "listening_questions", "speaking_cards")}

    assert before == after, "re-importing the same pack must not duplicate or drop rows"


def test_seed_if_empty_refreshes_a_stale_install(db: Path) -> None:
    """Startup self-heals, so an app update actually delivers its content."""
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None:
        pytest.skip("no shipped content pack on disk")

    with session_scope() as s:
        loader.import_pack(s, pack)
    # Simulate an install whose recorded checksums no longer match the shipped pack.
    with session_scope() as s:
        s.execute(
            text("UPDATE content_packs SET manifest_json = :m"),
            {"m": json.dumps({"checksums": {"data/vocab.jsonl": "sha256:stale"}})},
        )
        s.execute(text("DELETE FROM speaking_cards"))
        assert _count(s, "speaking_cards") == 0

    with session_scope() as s:
        result = loader.seed_if_empty(s)

    assert result is not None, "a changed pack must be re-imported at startup"
    with session_scope() as s:
        assert _count(s, "speaking_cards") > 0, "the refresh must restore the bank"


def test_seed_if_empty_is_a_no_op_when_nothing_changed(db: Path) -> None:
    """The common boot must stay cheap — no re-import on every start."""
    from bandready.db.engine import session_scope

    pack = loader.default_pack_path()
    if pack is None:
        pytest.skip("no shipped content pack on disk")

    with session_scope() as s:
        loader.import_pack(s, pack)
    with session_scope() as s:
        assert loader.seed_if_empty(s) is None


def test_seed_if_empty_leaves_a_bank_of_other_packs_alone(db: Path) -> None:
    """A bank holding someone else's pack but not ours is a deliberate state.

    Refreshing compares the SHIPPED pack against what is installed. If that comparison
    ran when the shipped pack was simply absent, every boot would reinstall it over the
    user's choice — a side-loaded pack, or the shipped one deliberately removed — and
    never stop. Refresh only ever updates a pack this install already has.
    """
    from bandready.db.engine import session_scope

    with session_scope() as s:
        # Content exists, but none of it is the shipped pack.
        _install_marker(s, "org.someone-else", "1.0.0", {"data/x.jsonl": "sha256:1"})
        s.execute(
            text(
                "INSERT INTO topics (id, label, category) VALUES ('topic_x', 'X', 'general')"
            )
        )

    with session_scope() as s:
        assert loader.seed_if_empty(s) is None, "must not reinstall a pack the user removed"
