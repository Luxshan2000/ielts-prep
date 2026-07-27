"""Writing Mock tests: assembly coherence, exam conditions, the clock, the weighting.

Four properties are load-bearing and each is tested from more than one angle:

1. **The sitting is coherent.** One Task 1 of the right kind for the module and one Task 2,
   on different subjects, at comparable difficulty, least-recently-served, reproducible
   from a seed.
2. **The coach is shut for the duration** — including for a prompt the learner has already
   attempted and legitimately unlocked. This is the property a mock has no value without,
   so it is tested against the unlock path that would otherwise open the gate.
3. **The clock is one hour, attributed silently.** Per-task minutes come out of the
   autosave stream, are never in the live view, and are the first thing in the report.
4. **The weighting arithmetic is ``round_ielts((T1 + 2 × T2) / 3)``**, computed
   server-side, refused when half the paper is unscored, and labelled an estimate.

The fixture pack is six prompts we control completely, so "which prompt does
least-recently-served pick" is a question about this engine rather than about production
content.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bandready.writing import mock

TOKEN = "test-token"

AC1 = "wp_mk_ac_reservoirs"
AC2 = "wp_mk_ac_freight"
GT1 = "wp_mk_gt_complaint"
T2A = "wp_mk_t2_night_buses"
T2B = "wp_mk_t2_school_hours"
T2_SAME_TOPIC = "wp_mk_t2_reservoirs"

#: Long enough to clear the evaluator's 50-word hard floor and the 150/250 minima, and
#: written to overlap the mock LLM fixture's evidence quotes where it can.
def _script(topic: str, words: int) -> str:
    body = (
        f"In recent years {topic} has become a subject of real disagreement, and the "
        "argument is usually conducted without much attention to who actually bears the "
        "cost. In my opinion, both governments and individuals share this duty, though "
        "the balance between them depends on what alternatives exist in the first place. "
        "Firstly, the government should invest in public transport, because a household "
        "cannot choose an option that has never been built. Secondly, individual choices "
        "still matter, and small habits accumulate faster than any single policy does. "
    )
    out = body
    while len(out.split()) < words:
        out += (
            f"A further consideration is that {topic} is measured badly, and what is "
            "measured badly is funded badly. "
        )
    return out


AC_CHART = {
    "kind": "line",
    "title": "Reservoir levels, 2018–2023",
    "unit": "% of capacity",
    "x_axis": {"label": "Year", "categories": ["2018", "2019", "2020", "2021", "2022", "2023"]},
    "y_axis": {"label": "% of capacity", "min": 0, "max": 100},
    "series": [
        {"name": "Ashfield", "values": [72, 65, 74, 66, 73, 71]},
        {"name": "Verdon", "values": [80, 71, 68, 59, 55, 48]},
    ],
}

TEACHING = {
    "schema_version": 1,
    "cluster": "mk-test",
    "band_move": "Write the overview before any figure, and put no figure in it.",
    "model_answers": [
        {"band_target": 6, "label": "band 6", "word_count": 8, "text": "A short band six rendering of the answer.", "what_caps_it": [], "what_lifts_it": [], "annotations": []},
        {"band_target": 7, "label": "band 7", "word_count": 8, "text": "A short band seven rendering of the answer.", "what_caps_it": [], "what_lifts_it": [], "annotations": []},
        {"band_target": 8, "label": "band 8", "word_count": 8, "text": "A short band eight rendering of the answer.", "what_caps_it": [], "what_lifts_it": [], "annotations": []},
    ],
    "plan": {"lines": [{"label": "POSITION", "note": "agree with a limit"}], "test": "Could a stranger write it?", "trap": "Most answers agree flatly."},
    "language_bank": {
        "warning": "Frames with gaps, not lines to recite.",
        "moves": [
            {
                "move": "conceding",
                "why_here": "The objection is strong and must be put fairly.",
                "grammar": "concessive clauses",
                "frames": [{"frame": "There is force in the claim that ___.", "slot_hint": "the objection"}],
                "avoid": "Of course, every coin has two sides.",
            }
        ],
    },
    "sentence_ladder": {
        "idea": "One idea, four renderings.",
        "rungs": [
            {"band": 5, "text": "The bus not run in night."},
            {"band": 6, "text": "There are no buses in the evening."},
            {"band": 7, "text": "Where the last bus leaves early, the network excludes late workers."},
            {"band": 8, "text": "A timetable ending at eleven rations employment, not travel."},
        ],
    },
    "error_watchlist": [
        {"pattern": "position drift", "wrong": "Buses matter to everyone.", "right": "Evening services matter where shift work is common.", "why": "Keep the limit.", "criterion": "ta"}
    ],
    "rewrite_focus": {"focus": "State the limit in the same sentence as the position.", "why": "Task Response first.", "drill": "Three minutes, four versions."},
}

#: Every prompt in the fixture pack: (id, task_type, genre, topic_id, tags, difficulty).
PACK: list[tuple[str, str, str, str, list[str], int]] = [
    (AC1, "ac_task1", "line", "topic_environment", ["water", "seasons", "supply"], 2),
    (AC2, "ac_task1", "bar", "topic_transport", ["freight", "rail", "roads"], 2),
    (GT1, "gt_task1", "formal", "topic_housing", ["landlord", "repairs", "tenancy"], 2),
    (T2A, "task2", "opinion", "topic_work", ["shifts", "employment", "buses"], 2),
    (T2B, "task2", "discussion", "topic_education", ["schools", "timetable", "children"], 3),
    (T2_SAME_TOPIC, "task2", "opinion", "topic_environment", ["water", "rationing", "supply"], 1),
]


# ======================================================================================
# Fixtures
# ======================================================================================


@pytest.fixture()
def client(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from bandready import settings_store
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
    monkeypatch.setenv("BANDREADY_HOST", "127.0.0.1")
    reset_settings_cache()
    db_engine.reset_engine()
    settings_store.invalidate_cache()

    from bandready.server.app import create_app

    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TOKEN}"})
        settings_store.patch_settings(
            {"llm": {"preset": "mock_llm", "base_url": "mock://llm", "model": "mock-model-1"}}
        )
        seed_pack()
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def seed_pack() -> None:
    """Retire the shipped pack and install six prompts we control completely."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        names = {str(r[1]) for r in s.execute(sa_text("PRAGMA table_info(writing_prompts)")).all()}
        if "teaching_json" not in names:
            s.execute(sa_text("ALTER TABLE writing_prompts ADD COLUMN teaching_json TEXT"))

    with session_scope() as s:
        s.execute(sa_text("UPDATE writing_prompts SET retired = 1"))
        for _, _, _, topic, _, _ in PACK:
            s.execute(
                sa_text(
                    "INSERT INTO topics (id, label, category) VALUES (:id, :label, 'general') "
                    "ON CONFLICT(id) DO NOTHING"
                ),
                {"id": topic, "label": topic.replace("topic_", "").title()},
            )
        for pid, task_type, genre, topic, tags, difficulty in PACK:
            bullets = (
                ["what the problem is", "how long it has gone on", "what you want done"]
                if task_type == "gt_task1"
                else None
            )
            text = {
                "ac_task1": (
                    "The graph below shows water levels at two reservoirs between 2018 and 2023.\n\n"
                    "Summarise the information by selecting and reporting the main features, and "
                    "make comparisons where relevant.\n\nWrite at least 150 words."
                ),
                "gt_task1": (
                    "The heating in your rented flat has failed.\n\nWrite a letter to your landlord. "
                    "In your letter:\n\n- what the problem is\n- how long it has gone on\n"
                    "- what you want done\n\nWrite at least 150 words.\n\n"
                    "Begin your letter as follows:\n\nDear Mr Halloran,"
                ),
                "task2": (
                    f"Write about the following topic:\n\nSome people argue about {topic}.\n\n"
                    "To what extent do you agree?\n\nGive reasons for your answer and include any "
                    "relevant examples from your own knowledge or experience.\n\n"
                    "Write at least 250 words."
                ),
            }[task_type]
            s.execute(
                sa_text(
                    "INSERT INTO writing_prompts "
                    "  (id, task_type, genre, topic_id, topic_tags, difficulty, prompt_text, "
                    "   chart_spec, letter_bullets, teaching_json, source, retired) "
                    "VALUES (:id, :tt, :genre, :topic, :tags, :diff, :text, :chart, :bullets, "
                    "        :teaching, 'pack', 0)"
                ),
                {
                    "id": pid,
                    "tt": task_type,
                    "genre": genre,
                    "topic": topic,
                    "tags": json.dumps(tags),
                    "diff": difficulty,
                    "text": text,
                    "chart": json.dumps(AC_CHART) if task_type == "ac_task1" else None,
                    "bullets": json.dumps(bullets) if bullets else None,
                    "teaching": json.dumps(TEACHING),
                },
            )


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/writing/mock/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def prompt_ids(doc: dict[str, Any]) -> dict[str, str]:
    return {task["slot"]: task["prompt_id"] for task in doc["tasks"]}


def write_both(client: TestClient, mock_id: str, *, t1_minutes: int, t2_minutes: int) -> dict[str, Any]:
    """Drive the sitting the way the editor would: two autosaves, one per task.

    The clock is the sitting's, not the task's — the delta between autosaves is credited
    to whatever ``active_slot`` said was on screen for it, which is the whole per-task
    attribution mechanism.
    """
    first = client.patch(
        f"/api/v1/writing/mock/sessions/{mock_id}",
        json={
            "seconds_elapsed": t1_minutes * 60,
            "active_slot": "task2",
            "tasks": [{"slot": "task1", "essay_text": _script("water supply", 200)}],
        },
    )
    assert first.status_code == 200, first.text
    second = client.patch(
        f"/api/v1/writing/mock/sessions/{mock_id}",
        json={
            "seconds_elapsed": (t1_minutes + t2_minutes) * 60,
            "active_slot": "task2",
            "tasks": [{"slot": "task2", "essay_text": _script("evening transport", 300)}],
        },
    )
    assert second.status_code == 200, second.text
    return second.json()


# ======================================================================================
# Assembly coherence
# ======================================================================================


def test_a_sitting_is_one_task1_and_one_task2(client: TestClient) -> None:
    doc = start(client)

    assert doc["status"] == "in_progress"
    assert [t["slot"] for t in doc["tasks"]] == ["task1", "task2"]
    assert doc["tasks"][0]["task_type"] == "ac_task1"
    assert doc["tasks"][1]["task_type"] == "task2"
    assert doc["tasks"][0]["target_minutes"] == 20
    assert doc["tasks"][1]["target_minutes"] == 40
    assert doc["clock"]["duration_s"] == 3600
    assert doc["clock"]["remaining_s"] == 3600

    # Both tasks are handed over at minute zero. The allocation is the lesson, so hiding
    # half the paper would remove it.
    assert all(task["prompt_text"] for task in doc["tasks"])
    assert doc["tasks"][0]["chart_spec"]["kind"] == "line"


def test_the_general_training_module_sits_a_letter(client: TestClient) -> None:
    doc = start(client, module="general_training")
    assert doc["tasks"][0]["task_type"] == "gt_task1"
    assert doc["tasks"][0]["prompt_id"] == GT1
    assert doc["tasks"][0]["letter_bullets"] == [
        "what the problem is",
        "how long it has gone on",
        "what you want done",
    ]
    assert doc["tasks"][1]["task_type"] == "task2"


def test_the_two_tasks_are_never_the_same_subject(client: TestClient) -> None:
    """One set of ideas must not be able to serve both answers."""
    doc = start(client, task1_prompt_id=AC1)
    ids = prompt_ids(doc)
    assert ids["task1"] == AC1
    # AC1 and T2_SAME_TOPIC share topic_environment *and* the "water"/"supply" tags, so a
    # coherent pairing has to reach past the pool's first entry to avoid it.
    assert ids["task2"] != T2_SAME_TOPIC
    assert doc["coherence"]["distinct_topic"] is True
    assert doc["coherence"]["shared_tags"] == []
    assert doc["coherence"]["relaxed"] == []
    assert doc["coherence"]["difficulty_delta"] <= 1


def test_coherence_relaxations_are_reported_not_hidden(client: TestClient) -> None:
    """A pack too thin to satisfy every rule still opens a mock, and says what it gave up."""
    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id
    from bandready.writing import mock as mock_mod

    with session_scope() as s:
        plan = mock_mod.assemble(
            s,
            current_profile_id(s),
            task1_prompt_id=AC1,
            task2_prompt_id=T2_SAME_TOPIC,
        )
    assert plan["coherence"]["distinct_topic"] is False
    assert plan["coherence"]["shared_tags"] == ["supply", "water"]
    assert set(plan["coherence"]["relaxed"]) == {
        "distinct_tags",
        "difficulty_within_one",
        "distinct_topic",
    }


def test_a_seed_reproduces_the_same_paper(client: TestClient) -> None:
    a = client.get("/api/v1/writing/mock/plan", params={"seed": 20260727}).json()
    b = client.get("/api/v1/writing/mock/plan", params={"seed": 20260727}).json()
    c = client.get("/api/v1/writing/mock/plan", params={"seed": 99}).json()

    assert [t["prompt_id"] for t in a["tasks"]] == [t["prompt_id"] for t in b["tasks"]]
    assert a["seed"] == 20260727
    # Different seeds must be able to produce different papers, or the seed means nothing.
    seen = {
        tuple(
            t["prompt_id"]
            for t in client.get("/api/v1/writing/mock/plan", params={"seed": n}).json()["tasks"]
        )
        for n in range(40)
    }
    assert len(seen) > 1
    assert c["tasks"]


def test_the_preview_writes_nothing(client: TestClient) -> None:
    client.get("/api/v1/writing/mock/plan")
    assert client.get("/api/v1/writing/mock/sessions").json()["count"] == 0
    # And a sitting can still be opened afterwards, so nothing was consumed.
    assert start(client)["created"] is True


def test_least_recently_served_moves_on(client: TestClient) -> None:
    first = start(client)
    client.post(f"/api/v1/writing/mock/sessions/{first['mock_id']}/abandon")
    second = start(client)
    assert prompt_ids(second) != prompt_ids(first)


def test_only_one_sitting_at_a_time(client: TestClient) -> None:
    start(client)
    response = client.post("/api/v1/writing/mock/sessions", json={})
    assert response.status_code == 409
    assert "still in progress" in response.json()["detail"]


def test_an_unknown_module_is_refused(client: TestClient) -> None:
    response = client.post("/api/v1/writing/mock/sessions", json={"module": "hybrid"})
    assert response.status_code == 422


# ======================================================================================
# Exam conditions — the property a mock has no value without
# ======================================================================================


def submit_practice_attempt(prompt_id: str) -> str:
    """A submitted practice attempt — the thing that would normally open the gate."""
    from ulid import ULID

    from bandready.db import models as m
    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id

    attempt_id = f"wa_{ULID()}"
    with session_scope() as s:
        s.add(
            m.PracticeSession(
                id=attempt_id, profile_id=current_profile_id(s), module="writing",
                activity="task2", started_at="2026-01-01T09:00:00.000Z",
            )
        )
        s.add(
            m.WritingSubmission(
                id=attempt_id, prompt_id=prompt_id, mode="practice", status="scored",
                essay_text=_script("evening transport", 300), word_count=300,
                submitted_at="2026-01-01T09:40:00.000Z",
            )
        )
    return attempt_id


def test_the_coach_is_shut_even_for_a_prompt_already_unlocked(client: TestClient) -> None:
    """The whole point. An attempt made last week must not open the model mid-mock."""
    submit_practice_attempt(T2A)
    before = client.get(f"/api/v1/writing/coach/prompts/{T2A}/teaching").json()
    assert before["gate"]["unlocked"] is True
    assert len(before["model_answers"]) == 3

    doc = start(client)
    during = client.get(f"/api/v1/writing/coach/prompts/{T2A}/teaching").json()

    assert during["gate"]["unlocked"] is False
    assert during["gate"]["reason"] == "exam_conditions"
    assert during["gate"]["mock_id"] == doc["mock_id"]
    assert during["model_answers"] == []
    assert during["model_answer_bands"] == []
    assert during["sentence_ladder"] is None
    assert during["teaching_available"] is False
    assert during["band_move"] is None
    assert during["error_watchlist"] == []
    assert during["exam_conditions"]["active"] is True
    # Nothing coaching is even serialised, not merely hidden behind a flag.
    assert "There is force in the claim" not in json.dumps(during)


def test_the_plan_language_bank_and_compare_all_refuse_during_a_mock(client: TestClient) -> None:
    submit_practice_attempt(T2A)
    start(client)

    for path, method, body in (
        (f"/api/v1/writing/coach/plan/{T2A}", "get", None),
        ("/api/v1/writing/coach/language-bank", "get", None),
        ("/api/v1/writing/coach/compare", "post", {"prompt_id": T2A, "script": _script("buses", 60), "band_target": 7}),
    ):
        response = client.get(path) if method == "get" else client.post(path, json=body)
        assert response.status_code == 409, (path, response.status_code, response.text)
        assert "mock" in response.json()["detail"].lower()


def test_exam_conditions_names_everything_it_withholds(client: TestClient) -> None:
    doc = start(client)
    for path in ("/api/v1/writing/coach/exam-conditions", "/api/v1/writing/mock/exam-conditions"):
        conditions = client.get(path).json()
        assert conditions["active"] is True
        assert conditions["coaching_available"] is False
        assert conditions["mock_id"] == doc["mock_id"]
        assert "model_answers" in conditions["withheld"]
        assert "language_bank" in conditions["withheld"]
        assert set(conditions["withheld"]) == set(mock.WITHHELD)


def test_abandoning_reopens_the_coach(client: TestClient) -> None:
    submit_practice_attempt(T2A)
    doc = start(client)
    assert client.get(f"/api/v1/writing/coach/prompts/{T2A}/teaching").json()["gate"]["unlocked"] is False

    response = client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/abandon")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "abandoned"

    after = client.get(f"/api/v1/writing/coach/prompts/{T2A}/teaching").json()
    assert after["gate"]["unlocked"] is True
    assert len(after["model_answers"]) == 3


def test_a_stale_sitting_does_not_brick_the_coach(client: TestClient) -> None:
    """A closed laptop must not lock the teaching layer for good."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    submit_practice_attempt(T2A)
    doc = start(client)
    with session_scope() as s:
        s.execute(
            sa_text("UPDATE writing_mocks SET created_at = :at WHERE mock_id = :mid"),
            {"at": "2020-01-01T00:00:00.000Z", "mid": doc["mock_id"]},
        )
    assert client.get(f"/api/v1/writing/coach/prompts/{T2A}/teaching").json()["gate"]["unlocked"] is True


def test_an_abandoned_sitting_cannot_be_edited(client: TestClient) -> None:
    doc = start(client)
    client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/abandon")
    response = client.patch(
        f"/api/v1/writing/mock/sessions/{doc['mock_id']}",
        json={"seconds_elapsed": 60, "tasks": [{"slot": "task1", "essay_text": "late"}]},
    )
    assert response.status_code == 409


# ======================================================================================
# The clock
# ======================================================================================


def test_autosave_stores_both_scripts_and_the_one_clock(client: TestClient) -> None:
    doc = start(client)
    view = write_both(client, doc["mock_id"], t1_minutes=18, t2_minutes=38)

    assert view["clock"]["seconds_elapsed"] == 56 * 60
    assert view["clock"]["remaining_s"] == 4 * 60
    assert view["clock"]["expired"] is False
    assert view["tasks"][0]["word_count"] >= 200
    assert view["tasks"][1]["word_count"] >= 300

    # Per-task time is tracked but never shown during the sitting: showing it would coach
    # the exact decision being measured.
    assert "task1_seconds" not in view["clock"]
    assert "task2_seconds" not in view["clock"]


def test_the_clock_counts_up_past_the_hour_and_never_auto_submits(client: TestClient) -> None:
    doc = start(client)
    view = write_both(client, doc["mock_id"], t1_minutes=25, t2_minutes=42)

    assert view["status"] == "in_progress"
    assert view["clock"]["expired"] is True
    assert view["clock"]["remaining_s"] == -(7 * 60)
    assert view["clock"]["overtime_s"] == 7 * 60


def test_per_task_minutes_are_attributed_from_the_autosave_stream(client: TestClient) -> None:
    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=30, t2_minutes=25)
    report = client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit").json()

    rows = {row["slot"]: row for row in report["time"]["tasks"]}
    assert rows["task1"]["minutes"] == 30
    assert rows["task2"]["minutes"] == 25
    assert rows["task1"]["delta_minutes"] == 10
    assert rows["task2"]["delta_minutes"] == -15
    assert report["time"]["attributed"] is True


def test_a_big_paste_flags_the_attempt_but_never_blocks_it(client: TestClient) -> None:
    doc = start(client)
    response = client.patch(
        f"/api/v1/writing/mock/sessions/{doc['mock_id']}",
        json={
            "seconds_elapsed": 300,
            "active_slot": "task1",
            "tasks": [
                {
                    "slot": "task1",
                    "essay_text": _script("water supply", 200),
                    "paste_events": 1,
                    "last_paste_words": 180,
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["tasks"][0]["integrity_flag"] == "pasted"


# ======================================================================================
# Submit, scoring and the weighting arithmetic
# ======================================================================================


def test_the_weighting_is_task2_double_through_the_shared_rounding(client: TestClient) -> None:
    """Pure arithmetic, no HTTP: this is the number the whole feature rests on."""
    assert mock.combine(6.0, 7.5) == 7.0
    assert mock.combine(7.5, 6.0) == 6.5
    assert mock.combine(6.0, 6.0) == 6.0
    assert mock.combine(7.0, 8.0) == 7.5
    # (5 + 2×6) / 3 = 5.666… → 5.5, not 6.0.
    assert mock.combine(5.0, 6.0) == 5.5
    # A tie rounds UP, which is the official rule and the shared helper's whole job:
    # (6 + 2×6.5) / 3 = 6.333… → 6.5.
    assert mock.combine(6.0, 6.5) == 6.5
    # Half a paper is not a band.
    assert mock.combine(None, 7.0) is None
    assert mock.combine(6.0, None) is None


def test_submit_scores_both_tasks_and_leads_with_time(client: TestClient) -> None:
    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=32, t2_minutes=26)

    response = client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit")
    assert response.status_code == 200, response.text
    report = response.json()

    # Time comes before any band, because it is the most expensive decision in the paper.
    keys = list(report)
    assert keys.index("time") < keys.index("tasks") < keys.index("combined")
    assert report["time"]["total_minutes"] == 58
    assert "worst trade" in report["time"]["verdict"]

    assert [t["slot"] for t in report["tasks"]] == ["task1", "task2"]
    for task in report["tasks"]:
        assert task["scored"] is True
        assert task["block"] is None
        assert set(task["bands"]) == {"ta", "cc", "lr", "gra"}
        assert {row["criterion"] for row in task["criteria"]} == {"ta", "cc", "lr", "gra"}
        assert all(row["comment"] for row in task["criteria"])

    combined = report["combined"]
    assert combined["available"] is True
    assert combined["estimated_band"] == mock.combine(
        report["tasks"][0]["overall_band"], report["tasks"][1]["overall_band"]
    )
    assert combined["label"] == "Estimated Writing band"
    assert "not printed in the published" in combined["footnote"]
    assert report["next_actions"]


def test_the_report_shows_what_the_allocation_cost(client: TestClient) -> None:
    """The lesson, made arithmetic: the same two bands the other way round differ."""
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=30, t2_minutes=25)
    first = client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit").json()

    # The mock evaluator hands both tasks the same band, so there is nothing to trade.
    assert first["tasks"][0]["overall_band"] == first["tasks"][1]["overall_band"]
    assert "trade" not in first["combined"]

    # Push them apart and rebuild the report over the stored evaluations — the report is
    # framing, so it must read the bands rather than remember them.
    first_id = first["tasks"][0]["attempt_id"]
    with session_scope() as s:
        row = (
            s.query(m.WritingEvaluation)
            .filter(m.WritingEvaluation.submission_id == first_id)
            .one()
        )
        row.overall_band = 7.5
        s.get(m.WritingSubmission, first_id).overall_band = 7.5

    with session_scope() as s:
        rebuilt = mock._build_report(s, mock.load(s, doc["mock_id"]), {})

    assert rebuilt["tasks"][0]["overall_band"] == 7.5
    trade = rebuilt["combined"]["trade"]
    assert trade["as_written"] == mock.combine(
        rebuilt["tasks"][0]["overall_band"], rebuilt["tasks"][1]["overall_band"]
    )
    assert trade["if_swapped"] == mock.combine(
        rebuilt["tasks"][1]["overall_band"], rebuilt["tasks"][0]["overall_band"]
    )
    assert trade["as_written"] != trade["if_swapped"]
    assert trade["as_written"] < trade["if_swapped"]  # the good band went to the cheap task
    assert "Minutes are worth more on Task 2" in trade["note"]


def test_an_empty_task_blocks_only_itself_and_withholds_the_combined_band(client: TestClient) -> None:
    doc = start(client)
    client.patch(
        f"/api/v1/writing/mock/sessions/{doc['mock_id']}",
        json={
            "seconds_elapsed": 3600,
            "active_slot": "task2",
            "tasks": [{"slot": "task2", "essay_text": _script("evening transport", 300)}],
        },
    )
    report = client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit").json()

    first, second = report["tasks"]
    assert first["scored"] is False
    assert first["block"]["id"] == "hard_length_floor"
    assert second["scored"] is True

    assert report["combined"]["available"] is False
    assert report["combined"]["estimated_band"] is None
    assert "Both tasks have to be scored" in report["combined"]["unavailable_reason"]


def test_submitting_reopens_the_coach(client: TestClient) -> None:
    submit_practice_attempt(T2A)
    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=20, t2_minutes=38)
    client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit")

    assert client.get("/api/v1/writing/coach/exam-conditions").json()["coaching_available"] is True
    # And the two prompts just sat are now unlocked, because they have now been written.
    for prompt_id in prompt_ids(doc).values():
        gate = client.get(f"/api/v1/writing/coach/prompts/{prompt_id}/teaching").json()["gate"]
        assert gate["unlocked"] is True, prompt_id
        assert gate["reason"] == "attempted"


def test_the_sitting_is_gone_from_the_live_view_but_kept_in_history(client: TestClient) -> None:
    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=21, t2_minutes=37)
    client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit")

    history = client.get("/api/v1/writing/mock/sessions").json()
    assert history["count"] == 1
    item = history["items"][0]
    assert item["mock_id"] == doc["mock_id"]
    assert item["status"] == "complete"
    assert item["task1_minutes"] == 21
    assert item["task2_minutes"] == 37
    assert item["estimated_band"] is not None
    assert history["trajectory"][0]["estimated_band"] == item["estimated_band"]
    assert history["label"] == "Estimated Writing band"

    # A second sitting can now be opened, and the trajectory grows.
    second = start(client)
    write_both(client, second["mock_id"], t1_minutes=20, t2_minutes=39)
    client.post(f"/api/v1/writing/mock/sessions/{second['mock_id']}/submit")
    again = client.get("/api/v1/writing/mock/sessions").json()
    assert again["count"] == 2
    assert again["scored"] == 2
    assert [t["mock_id"] for t in again["trajectory"]] == [doc["mock_id"], second["mock_id"]]


def test_the_two_attempts_are_ordinary_exam_mode_submissions(client: TestClient) -> None:
    """Nothing bespoke: every existing report, history and rewrite surface still works."""
    doc = start(client)
    write_both(client, doc["mock_id"], t1_minutes=20, t2_minutes=38)
    client.post(f"/api/v1/writing/mock/sessions/{doc['mock_id']}/submit")

    for task in client.get(f"/api/v1/writing/mock/sessions/{doc['mock_id']}").json()["tasks"]:
        attempt = client.get(f"/api/v1/writing/attempts/{task['attempt_id']}").json()
        assert attempt["mode"] == "exam"
        assert attempt["status"] == "scored"
        assert attempt["evaluation"]["annotations"] is not None
        assert attempt["overall_band"] is not None


def test_an_unknown_sitting_is_a_404(client: TestClient) -> None:
    assert client.get("/api/v1/writing/mock/sessions/wm_nope").status_code == 404
    assert client.post("/api/v1/writing/mock/sessions/wm_nope/submit").status_code == 404
