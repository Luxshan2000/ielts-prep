"""``GET /api/v1/reading/attempts`` and ``GET /api/v1/reading/drills/results``.

Reading stored attempts for a year with no way to list them, so a submitted paper was
reachable only from the tab that had just submitted it. These two routes are what the
reading history screen reads; the tests below pin the parts a history row depends on —
the title, the date, the mode, the score and the paging — because a mapping that silently
loses one of them shows a row the learner cannot act on rather than failing loudly.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope

from .test_reading import ALL_CORRECT, seed_passage


@pytest.fixture(scope="module")
def app_client(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    data_dir = tmp_path_factory.mktemp("bandready-reading-history")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.delenv("BANDREADY_PARENT_PID", raising=False)

        from bandready import config as br_config
        from bandready import settings_store

        br_config.reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        settings_store.invalidate_cache()

        from bandready.server.app import create_app

        with TestClient(create_app(), base_url="http://127.0.0.1") as client:
            client.headers.update({"Authorization": "Bearer test-token"})
            yield client

        db_engine.reset_engine()
        settings_store.invalidate_cache()
        br_config.reset_settings_cache()


def _wipe() -> None:
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.DrillResult))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingPassage))


@pytest.fixture()
def clean() -> Iterator[None]:
    _wipe()
    yield
    _wipe()


def seed_test(session, title: str = "Academic Practice Test 1") -> str:
    """One three-passage test, so a `full` attempt has a real title to be listed under."""
    test_id = f"rt_{ULID()}"
    pids = [seed_passage(session, title=f"{title} — passage {i}") for i in (1, 2, 3)]
    session.add(
        m.ReadingTest(
            id=test_id,
            format="academic",
            title=title,
            p1_id=pids[0],
            p2_id=pids[1],
            p3_id=pids[2],
            source="pack",
            license="CC-BY-4.0",
        )
    )
    session.flush()
    return test_id


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    res = client.post("/api/v1/reading/attempts", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def items(client: TestClient, **params: Any) -> list[dict[str, Any]]:
    res = client.get("/api/v1/reading/attempts", params=params)
    assert res.status_code == 200, res.text
    return res.json()["items"]


# --------------------------------------------------------------------------------------
# GET /attempts
# --------------------------------------------------------------------------------------

def test_empty_history_is_an_empty_page_not_an_error(
    app_client: TestClient, clean: None
) -> None:
    res = app_client.get("/api/v1/reading/attempts")
    assert res.status_code == 200
    assert res.json() == {"items": [], "next_cursor": None}


def test_a_passage_attempt_is_listed_with_its_passage_title_and_start_time(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session, title="Deep Sea Cables")
    started = start(app_client, mode="passage", passage_id=passage_id)

    (row,) = items(app_client)
    assert row["attempt_id"] == started["attempt_id"]
    assert row["title"] == "Deep Sea Cables"
    assert row["mode"] == "passage"
    assert row["format"] == "academic"
    assert row["status"] == "in_progress"
    # `started_at` lives on practice_sessions, not on reading_attempts; a row that lost it
    # would sort to the bottom of the history screen forever.
    assert row["started_at"]
    assert row["finished_at"] is None
    assert row["band"] is None
    assert row["raw_score"] is None
    assert row["total_questions"] == 8


def test_a_full_test_attempt_is_listed_under_the_test_title(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        test_id = seed_test(session, title="Academic Practice Test 4")
    start(app_client, mode="full", test_id=test_id, exam_conditions=True)

    (row,) = items(app_client)
    assert row["mode"] == "full"
    assert row["title"] == "Academic Practice Test 4"
    assert row["exam_conditions"] is True
    assert row["activity"] == "full_test"


def test_a_drill_is_not_titled_with_the_passage_it_borrowed_a_question_from(
    app_client: TestClient, clean: None
) -> None:
    """A drill pulls from across the bank, so its `passage_id` names one question only."""
    with session_scope() as session:
        seed_passage(session, title="Deep Sea Cables")
    start(app_client, mode="drill", qtype="true_false_not_given", size=5)

    (row,) = items(app_client)
    assert row["mode"] == "drill"
    assert row["title"] is None
    assert row["qtype"] == "true_false_not_given"


def test_a_submitted_attempt_carries_its_score_and_finish_time(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session, title="Deep Sea Cables")
    attempt_id = start(app_client, mode="passage", passage_id=passage_id)["attempt_id"]
    answers = {**ALL_CORRECT, "7": "i"}
    submitted = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/submit",
        json={"answers": answers, "duration_s": 420},
    )
    assert submitted.status_code == 200, submitted.text

    (row,) = items(app_client)
    assert row["status"] == "submitted"
    assert row["raw_score"] == 8
    assert row["total_questions"] == 8
    assert row["band"] == submitted.json()["band"]
    assert row["duration_s"] == 420
    assert row["finished_at"]


def test_an_unfinished_attempt_reports_how_far_in_it_got(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session)
    attempt_id = start(app_client, mode="passage", passage_id=passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE", "2": "FALSE"}}
    )

    (row,) = items(app_client)
    assert row["status"] == "in_progress"
    assert row["answered"] == 2


def test_a_drill_scored_without_a_band_reports_a_null_band_not_a_zero(
    app_client: TestClient, clean: None
) -> None:
    """A drill is too short to convert; band 0 would read as a catastrophic result."""
    with session_scope() as session:
        seed_passage(session)
    attempt_id = start(app_client, mode="drill", qtype="true_false_not_given", size=3)[
        "attempt_id"
    ]
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit", json={"answers": {}})

    (row,) = items(app_client)
    assert row["band"] is None
    assert row["raw_score"] == 0
    assert row["total_questions"] == 3


def test_newest_first_and_the_cursor_walks_the_whole_ledger(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session)
    ids = [
        start(app_client, mode="passage", passage_id=passage_id)["attempt_id"]
        for _ in range(5)
    ]

    first = app_client.get("/api/v1/reading/attempts", params={"limit": 2}).json()
    assert [row["attempt_id"] for row in first["items"]] == list(reversed(ids))[:2]
    assert first["next_cursor"] == first["items"][-1]["attempt_id"]

    second = app_client.get(
        "/api/v1/reading/attempts", params={"limit": 2, "cursor": first["next_cursor"]}
    ).json()
    assert [row["attempt_id"] for row in second["items"]] == list(reversed(ids))[2:4]

    last = app_client.get(
        "/api/v1/reading/attempts", params={"limit": 2, "cursor": second["next_cursor"]}
    ).json()
    assert [row["attempt_id"] for row in last["items"]] == list(reversed(ids))[4:]
    assert last["next_cursor"] is None


def test_the_mode_and_status_filters_narrow_the_ledger(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session)
        test_id = seed_test(session)
    start(app_client, mode="passage", passage_id=passage_id)
    start(app_client, mode="full", test_id=test_id)
    drill_id = start(app_client, mode="drill", qtype="true_false_not_given", size=3)[
        "attempt_id"
    ]
    app_client.post(f"/api/v1/reading/attempts/{drill_id}/submit", json={"answers": {}})

    assert {row["mode"] for row in items(app_client, mode="drill")} == {"drill"}
    assert {row["mode"] for row in items(app_client, mode="full")} == {"full"}
    assert [row["attempt_id"] for row in items(app_client, status="submitted")] == [drill_id]
    assert len(items(app_client, status="in_progress")) == 2


def test_a_server_assembled_mock_sitting_is_listed_as_a_full_paper(
    app_client: TestClient, clean: None
) -> None:
    """`reading/mock.py` writes the sitting as an ordinary attempt under its own activity."""
    with session_scope() as session:
        test_id = seed_test(session, title="Mock Paper A")
        session.add(
            m.PracticeSession(
                id="rd_mock_row",
                profile_id="default",
                module="reading",
                activity="reading_mock",
                started_at="2026-01-01T09:00:00.000Z",
            )
        )
        session.flush()
        session.add(
            m.ReadingAttempt(
                id="rd_mock_row",
                test_id=test_id,
                passage_id=None,
                mode="exam",
                status="abandoned",
                total_questions=40,
                state_json=json.dumps({"mode": "full", "exam_conditions": True}),
            )
        )

    (row,) = items(app_client)
    assert row["activity"] == "reading_mock"
    assert row["mode"] == "full"
    assert row["title"] == "Mock Paper A"
    assert row["status"] == "abandoned"
    assert row["exam_conditions"] is True
    assert items(app_client, mode="full") == [row]


def test_another_profiles_attempts_are_not_listed(
    app_client: TestClient, clean: None
) -> None:
    with session_scope() as session:
        passage_id = seed_passage(session)
    mine = start(app_client, mode="passage", passage_id=passage_id)["attempt_id"]
    with session_scope() as session:
        session.add(m.Profile(id="someone_else", name="Someone else"))
        session.flush()
        session.add(
            m.PracticeSession(
                id="rd_theirs",
                profile_id="someone_else",
                module="reading",
                activity="single_passage",
            )
        )
        session.flush()
        session.add(
            m.ReadingAttempt(
                id="rd_theirs",
                test_id=None,
                passage_id=passage_id,
                mode="practice",
                status="submitted",
                total_questions=8,
                state_json="{}",
            )
        )

    assert [row["attempt_id"] for row in items(app_client)] == [mine]


# --------------------------------------------------------------------------------------
# GET /drills/results
# --------------------------------------------------------------------------------------

def test_recorded_drills_are_listed_newest_first(
    app_client: TestClient, clean: None
) -> None:
    for correct in (2, 7):
        res = app_client.post(
            "/api/v1/reading/drills/results",
            json={
                "drill_kind": "question_type",
                "qtype": "true_false_not_given",
                "n_items": 10,
                "n_correct": correct,
            },
        )
        assert res.status_code == 201, res.text

    body = app_client.get("/api/v1/reading/drills/results")
    assert body.status_code == 200, body.text
    rows = body.json()["items"]
    assert [row["n_correct"] for row in rows] == [7, 2]
    assert rows[0]["drill_kind"] == "question_type"
    assert rows[0]["qtype"] == "true_false_not_given"
    assert rows[0]["n_items"] == 10
    assert rows[0]["started_at"]
    assert rows[0]["attempt_id"] is None


def test_a_drill_recorded_against_an_attempt_echoes_that_attempt_id(
    app_client: TestClient, clean: None
) -> None:
    """The history screen dedupes on this — a type drill sat inside an attempt is one row."""
    with session_scope() as session:
        seed_passage(session)
    attempt_id = start(app_client, mode="drill", qtype="true_false_not_given", size=3)[
        "attempt_id"
    ]
    app_client.post(
        "/api/v1/reading/drills/results",
        json={
            "drill_kind": "question_type",
            "qtype": "true_false_not_given",
            "n_items": 3,
            "n_correct": 1,
            "details": {"attempt_id": attempt_id},
        },
    )

    (row,) = app_client.get("/api/v1/reading/drills/results").json()["items"]
    assert row["attempt_id"] == attempt_id


def test_the_results_list_is_not_shadowed_by_the_qtype_drill_route(
    app_client: TestClient, clean: None
) -> None:
    """`GET /drills/{qtype}` is declared after it; declared before, this would 404."""
    res = app_client.get("/api/v1/reading/drills/results")
    assert res.status_code == 200
    assert "items" in res.json()
