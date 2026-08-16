"""Practice content is not exam content.

A learner reported it before any test did: "I am seeing several practice questions same as
final ... gives the feel like leaked questions." They were right. Drills were built from the
whole script bank, tests included, so an item could be met in practice and then again on the
paper it was reserved for.

The pack already ships enough for both. What was missing was the line that keeps them apart,
and these tests are that line, so it cannot be quietly removed by a later refactor.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.engine import session_scope
from bandready.listening import drills


@pytest.fixture()
def db_session(tmp_path: Path) -> Iterator[Session]:
    """A throwaway database per test, so the pool one test builds cannot reach another."""
    from bandready.config import get_settings
    from bandready.db import engine as engine_mod

    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(tmp_path))
        get_settings.cache_clear()
        engine_mod.reset_engine()
        engine_mod.run_migrations()
        with session_scope() as session:
            yield session
        engine_mod.reset_engine()
        get_settings.cache_clear()


def _script(session: Session, script_id: str, part: int) -> m.ListeningScript:
    row = m.ListeningScript(
        id=script_id,
        part=part,
        title=f"Part {part} {script_id}",
        accent_set="uk",
        target_band=6.5,
        script_json=json.dumps({"lines": []}),
        source="pack",
        retired=0,
    )
    session.add(row)
    return row


@pytest.fixture()
def pool(db_session: Session) -> Session:
    """Four scripts carried by one test, and two carried by nothing."""
    for i, part in enumerate((1, 2, 3, 4), start=1):
        _script(db_session, f"ls_exam_{i}", part)
    _script(db_session, "ls_free_1", 1)
    _script(db_session, "ls_free_2", 2)
    db_session.add(
        m.ListeningTest(
            id="lt_01",
            title="Test 1",
            p1_id="ls_exam_1",
            p2_id="ls_exam_2",
            p3_id="ls_exam_3",
            p4_id="ls_exam_4",
            source="pack",
        )
    )
    db_session.flush()
    return db_session


def test_a_drill_never_sees_a_script_a_test_carries(pool: Session) -> None:
    """The whole point. If this fails, practice is leaking the exam again."""
    reserved = drills.exam_script_ids(pool)
    assert reserved == {"ls_exam_1", "ls_exam_2", "ls_exam_3", "ls_exam_4"}
    got = {row.id for row in drills.live_scripts(pool)}
    assert got == {"ls_free_1", "ls_free_2"}
    assert got.isdisjoint(reserved)


def test_the_exam_pool_is_still_reachable_when_asked_for_explicitly(pool: Session) -> None:
    """Sitting a test must still find its own parts."""
    got = {row.id for row in drills.live_scripts(pool, include_exam=True)}
    assert len(got) == 6
    assert "ls_exam_1" in got


def test_filters_still_narrow_within_the_practice_pool(pool: Session) -> None:
    got = {row.id for row in drills.live_scripts(pool, part=1)}
    assert got == {"ls_free_1"}, "part filter must apply after the exam scripts are removed"


def test_an_empty_practice_pool_stays_empty_rather_than_falling_back(db_session: Session) -> None:
    """The failure mode this design rejects.

    Falling back to the exam pool when practice runs dry would re-open the leak at exactly the
    moment the practice bank is thinnest. An empty list is an empty state for the UI to explain,
    and that is the correct answer.
    """
    for i, part in enumerate((1, 2, 3, 4), start=1):
        _script(db_session, f"ls_only_{i}", part)
    db_session.add(
        m.ListeningTest(
            id="lt_02",
            title="Test 2",
            p1_id="ls_only_1",
            p2_id="ls_only_2",
            p3_id="ls_only_3",
            p4_id="ls_only_4",
            source="pack",
        )
    )
    db_session.flush()
    assert drills.live_scripts(db_session) == []
