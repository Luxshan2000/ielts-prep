"""Reading Mock tests: assembly, the gate, the two band tables, pacing, breakdowns.

Five properties are load-bearing and each is tested from more than one angle:

1. **Assembly is coherent.** Three distinct passages whose question numbers run 1..N
   contiguously *across the whole paper*; a test that breaks that is refused rather than
   sat and quietly mis-scored. Least-recently-served picks the paper, a seed makes it
   reproducible, and softer problems are reported rather than hidden.
2. **The coach is shut for the duration**, including for a passage the learner attempted
   and legitimately unlocked — and the exam document carries neither the answer key nor
   the teaching payload, so there is nothing to reveal with a devtools toggle.
3. **The two conversion tables are different and both are right.** 30/40 is band 7.0 on
   Academic and band 6.0 on General Training: the same raw score, a full band apart.
4. **The clock is one hour with no transfer time**, attributed silently per passage, and
   pacing is the first thing the report says.
5. **The breakdowns are per-passage, per-type and per-trap**, with the form-and-process
   losses — blanks and over-length answers — counted apart from comprehension losses.

The fixture pack is shared with ``test_reading_coach``: three papers we control
completely, forty questions each, so "what does the band table say" is a question about
this engine rather than about production content.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

# The fixture pack is shared rather than duplicated: two copies of a forty-question
# paper would drift, and "the same paper" is the premise of half these assertions.
from tests.test_reading_coach import (
    AC_TEST_1,
    AC_TEST_2,
    GT_TEST_1,
    PACK,
    answer_key,
    passage_numbers,
    sit_passage,
)
from tests.test_reading_coach import client as client  # noqa: PLC0414 — re-exported fixture

# ======================================================================================
# Helpers
# ======================================================================================


def question_kinds(test_id: str) -> dict[int, str]:
    """``{number: "tfng" | "completion"}`` — the builder's split, recomputed."""
    entry = next(t for t in PACK if t[0] == test_id)
    out: dict[int, str] = {}
    next_number = 1
    for _passage_id, _title, _topic, count in entry[3]:
        numbers = list(range(next_number, next_number + count))
        next_number += count
        half = (len(numbers) + 1) // 2
        for number in numbers[:half]:
            out[number] = "tfng"
        for number in numbers[half:]:
            out[number] = "completion"
    return out


def graded_answers(test_id: str, correct: int) -> dict[str, str]:
    """An answer sheet scoring exactly ``correct`` out of forty."""
    key = answer_key(test_id)
    kinds = question_kinds(test_id)
    out: dict[str, str] = {}
    for index, number in enumerate(sorted(int(k) for k in key)):
        expected = key[str(number)]
        if index < correct:
            out[str(number)] = expected
        elif kinds[number] == "tfng":
            out[str(number)] = "false" if expected != "false" else "true"
        else:
            out[str(number)] = "quarry"  # a real word in the pack, never a keyed answer
    return out


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/reading/mock/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def sit(
    client: TestClient,
    mock_id: str,
    answers: dict[str, str],
    *,
    minutes: tuple[int, int, int] = (16, 20, 22),
) -> dict[str, Any]:
    """Drive the sitting the way the player would: one autosave per passage.

    The clock is the sitting's, not the passage's — the delta between autosaves is
    credited to whatever ``active_position`` said was on screen for it, which is the
    whole per-passage attribution mechanism.
    """
    elapsed = 0
    for position, spent in enumerate(minutes, start=1):
        elapsed += spent * 60
        response = client.patch(
            f"/api/v1/reading/mock/sessions/{mock_id}",
            json={
                "seconds_elapsed": elapsed,
                # The slice that just ran belongs to the passage named by the *previous*
                # call, so the next position is announced after the time is banked.
                "active_position": min(position + 1, 3),
                "answers": answers if position == 1 else None,
            },
        )
        assert response.status_code == 200, response.text
    return response.json()


def submit(client: TestClient, mock_id: str, **body: Any) -> dict[str, Any]:
    response = client.post(f"/api/v1/reading/mock/sessions/{mock_id}/submit", json=body)
    assert response.status_code == 200, response.text
    return response.json()


AC_P1 = "rp_mk_ac_01_p1"


def test_the_sitting_strips_the_strategy_card(client: TestClient) -> None:
    """Passage- and group-level teaching survives a normal fetch and not a sitting.

    Outside a mock it is preparation material the coach is built on. Inside one it is help,
    and a mock you can take help during measures reading-with-help (DESIGN §10 F9).
    """
    open_doc = client.get(f"/api/v1/reading/passages/{AC_P1}").json()
    assert open_doc["coaching_included"] is True

    doc = start(client)
    try:
        during = client.get(f"/api/v1/reading/passages/{AC_P1}").json()
        assert during["coaching_included"] is False
        passage = during["passages"][0]
        assert "teaching" not in passage
        for group in passage["question_groups"]:
            assert "teaching" not in group
    finally:
        client.post(f"/api/v1/reading/mock/sessions/{doc['mock_id']}/abandon")

    assert client.get(f"/api/v1/reading/passages/{AC_P1}").json()["coaching_included"] is True


def test_the_dictionary_is_closed_during_a_sitting(client: TestClient) -> None:
    """DESIGN §10 F9 — a rule only the client enforces is not a rule.

    The sitting reports ``dictionary_enabled: false`` and lists "dictionary" among the
    affordances it withholds. If the route still answers, the word is one fetch away and
    the mock measures reading-with-help, which the exam does not measure. The words the
    learner clicks are queued and returned in the report, so nothing is lost.
    """
    assert client.get("/api/v1/dictionary/quarry").status_code == 200

    doc = start(client)
    assert doc["exam_conditions"]["dictionary_enabled"] is False
    assert "dictionary" in doc["exam_conditions"]["withheld"]
    try:
        blocked = client.get("/api/v1/dictionary/quarry")
        assert blocked.status_code == 409
        assert blocked.json()["code"] == "conflict"
    finally:
        client.post(f"/api/v1/reading/mock/sessions/{doc['mock_id']}/abandon")

    assert client.get("/api/v1/dictionary/quarry").status_code == 200


# ======================================================================================
# Assembly
# ======================================================================================


def test_a_sitting_is_three_passages_forty_questions_and_one_hour(client: TestClient) -> None:
    doc = start(client)

    assert doc["status"] == "in_progress"
    assert doc["module"] == "academic"
    assert doc["question_count"] == 40
    assert len(doc["passages"]) == 3
    assert doc["clock"]["duration_s"] == 3600
    assert doc["clock"]["remaining_s"] == 3600
    # Unlike Listening, there is no extra time to write answers up.
    assert doc["clock"]["transfer_time_s"] == 0
    assert any("no extra time" in point for point in doc["briefing"]["points"])

    # The paper is front-loaded, not flat: equal time on unequal costs underfunds the
    # expensive marks.
    assert [p["target_minutes"] for p in doc["passage_meta"]] == [16, 20, 22]
    assert [p["questions"] for p in doc["passage_meta"]] == [14, 13, 13]
    assert [p["first_number"] for p in doc["passage_meta"]] == [1, 15, 28]

    assert doc["coherence"]["checks"] == {
        "three_passages": True,
        "numbers_contiguous": True,
        "forty_questions": True,
        "distinct_topics": True,
        "format_matches": True,
    }
    assert doc["coherence"]["warnings"] == []


def test_general_training_sits_its_own_paper_and_its_own_pacing(client: TestClient) -> None:
    doc = start(client, module="general_training")

    assert doc["test_id"] == GT_TEST_1
    assert doc["format"] == "general_training"
    # Section 3 is the long one on GT and gets the biggest share.
    assert [p["target_minutes"] for p in doc["passage_meta"]] == [15, 18, 25]
    assert doc["pacing"]["passages"][2]["label"] == "Section 3"


def test_least_recently_served_hands_back_a_different_paper(client: TestClient) -> None:
    first = start(client)
    assert first["test_id"] == AC_TEST_1
    submit(client, first["mock_id"], seconds_elapsed=3600)

    second = start(client)
    assert second["test_id"] == AC_TEST_2, "a paper just sat must not come round again"


def test_a_seed_reproduces_the_same_paper(client: TestClient) -> None:
    a = client.get("/api/v1/reading/mock/plan", params={"seed": 4321}).json()
    b = client.get("/api/v1/reading/mock/plan", params={"seed": 4321}).json()
    c = client.get("/api/v1/reading/mock/plan", params={"seed": 99}).json()

    assert a["test_id"] == b["test_id"]
    assert [p["passage_id"] for p in a["passages"]] == [p["passage_id"] for p in b["passages"]]
    assert {a["test_id"], c["test_id"]} <= {AC_TEST_1, AC_TEST_2}
    # A preview writes nothing.
    assert client.get("/api/v1/reading/mock/sessions").json()["count"] == 0


def test_a_broken_paper_is_refused_and_the_next_one_is_sat(client: TestClient) -> None:
    """Numbering that does not run 1..N cannot be marked out of forty."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.execute(
            sa_text("SELECT passage_json FROM reading_passages WHERE id = 'rp_mk_ac_01_p1'")
        ).first()
        doc = json.loads(row[0])
        for group in doc["question_groups"]:
            for question in group["questions"]:
                question["number"] += 100  # a hole between passage 1 and passage 2
        s.execute(
            sa_text("UPDATE reading_passages SET passage_json = :doc WHERE id = :id"),
            {"doc": json.dumps(doc), "id": "rp_mk_ac_01_p1"},
        )

    named = client.post(
        "/api/v1/reading/mock/sessions", json={"test_id": AC_TEST_1}
    )
    assert named.status_code == 422
    assert "1..N" in named.json()["detail"]

    doc = start(client)
    assert doc["test_id"] == AC_TEST_2
    rejected = doc["coherence"]["rejected"]
    assert rejected and rejected[0]["test_id"] == AC_TEST_1
    assert "numbers_contiguous" in rejected[0]["failed"]


def test_a_short_paper_is_sat_and_the_shortfall_is_reported(client: TestClient) -> None:
    """A generated paper may be 39 questions long; the learner deserves to know."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope
    from bandready.reading import mock as mock_mod
    from bandready.server.deps import current_profile_id

    with session_scope() as s:
        row = s.execute(
            sa_text("SELECT passage_json FROM reading_passages WHERE id = 'rp_mk_ac_01_p3'")
        ).first()
        doc = json.loads(row[0])
        doc["question_groups"][-1]["questions"].pop()  # drop question 40
        s.execute(
            sa_text("UPDATE reading_passages SET passage_json = :doc WHERE id = :id"),
            {"doc": json.dumps(doc), "id": "rp_mk_ac_01_p3"},
        )

    with session_scope() as s:
        plan = mock_mod.assemble(s, current_profile_id(s), test_id=AC_TEST_1)

    assert plan["question_count"] == 39
    assert plan["coherence"]["checks"]["numbers_contiguous"] is True
    assert plan["coherence"]["checks"]["forty_questions"] is False
    assert any("39 questions" in w for w in plan["coherence"]["warnings"])


def test_only_one_sitting_is_open_at_a_time(client: TestClient) -> None:
    first = start(client)
    again = client.post("/api/v1/reading/mock/sessions", json={})
    assert again.status_code == 409
    assert first["mock_id"] in again.json()["detail"]

    client.post(f"/api/v1/reading/mock/sessions/{first['mock_id']}/abandon")
    assert client.post("/api/v1/reading/mock/sessions", json={}).status_code == 201


# ======================================================================================
# Exam conditions
# ======================================================================================


def test_the_paper_carries_neither_the_key_nor_the_teaching(client: TestClient) -> None:
    doc = start(client)
    body = json.dumps(doc["passages"])

    # The key. (The evidence quote is by construction a span of the passage prose, so it
    # is the *field* that must be gone, not the words.)
    assert "evidence_quote" not in body
    assert '"answers"' not in body
    assert '"explanation"' not in body
    assert "settles this" not in body  # every authored explanation opens with it
    assert "trap_note" not in body
    # The teaching, at all three depths.
    assert '"teaching"' not in body
    assert "absence_read_as_contradiction" not in body
    assert "paraphrase_link" not in body
    assert "skim_plan" not in body

    # …and the exam layout survives, because the palette scrolls to it.
    first_group = doc["passages"][0]["question_groups"][0]
    assert first_group["type"] == "true_false_not_given"
    assert first_group["questions"][0]["anchor_paragraphs"] == ["A"]
    assert doc["passages"][0]["texts"][0]["paragraphs"][0]["id"] == "A"


def test_the_coach_is_shut_for_every_passage_during_a_sitting(client: TestClient) -> None:
    sit_passage(client, "rp_mk_ac_01_p1", {"1": "TRUE"})
    opened = start(client)

    conditions = client.get("/api/v1/reading/mock/exam-conditions").json()
    assert conditions["active"] is True
    assert conditions["coaching_available"] is False
    assert conditions["dictionary_enabled"] is False
    assert "worked_solutions" in conditions["withheld"]
    assert "dictionary" in conditions["withheld"]

    # Even for the passage attempted and legitimately unlocked before the mock began.
    teaching = client.get(
        "/api/v1/reading/coach/passages/rp_mk_ac_01_p1/teaching"
    ).json()
    assert teaching["gate"]["reason"] == "exam_conditions"
    assert teaching["questions"] == []

    submit(client, opened["mock_id"], seconds_elapsed=3600)
    assert client.get("/api/v1/reading/coach/exam-conditions").json()["active"] is False


def test_abandoning_reopens_the_coach_without_unlocking_the_paper(client: TestClient) -> None:
    doc = start(client)
    client.post(f"/api/v1/reading/mock/sessions/{doc['mock_id']}/abandon")

    assert client.get("/api/v1/reading/coach/strategy").status_code == 200
    # Nobody who walked out has earned the worked solutions.
    gate = client.get(
        "/api/v1/reading/coach/passages/rp_mk_ac_01_p1/teaching"
    ).json()["gate"]
    assert gate["unlocked"] is False
    assert gate["reason"] == "not_attempted"


# ======================================================================================
# The clock
# ======================================================================================


def test_per_passage_time_is_tracked_silently_and_shown_only_afterwards(
    client: TestClient,
) -> None:
    doc = start(client)
    mock_id = doc["mock_id"]
    live = sit(client, mock_id, graded_answers(AC_TEST_1, 30), minutes=(28, 20, 10))

    # Never during the hour: showing it would coach the decision being measured.
    assert "passage_seconds" not in json.dumps(live["clock"])
    assert live["clock"]["seconds_elapsed"] == 3480
    assert live["clock"]["sweep_due"] is True
    assert live["clock"]["expired"] is False

    report = submit(client, mock_id)
    minutes = {p["position"]: p["minutes"] for p in report["pacing"]["passages"]}
    assert minutes == {1: 28.0, 2: 20.0, 3: 10.0}
    assert report["pacing"]["attributed"] is True
    assert report["pacing"]["passages"][0]["delta_minutes"] == 12.0
    assert report["pacing"]["passages"][2]["delta_minutes"] == -12.0
    # Passage 3 is the hardest and the most expensive per mark, and it was starved.
    assert "starved" in report["pacing"]["verdict"]
    assert "no extra time to transfer" in report["pacing"]["no_transfer_time"]


def test_overtime_is_recorded_and_auto_submission_is_inferred(client: TestClient) -> None:
    doc = start(client)
    report = submit(client, doc["mock_id"], seconds_elapsed=3900)

    assert report["auto_submitted"] is True, "the clock ran out, whatever the client said"
    assert report["pacing"]["overtime_minutes"] == 5.0
    assert "past the hour" in report["pacing"]["verdict"]


# ======================================================================================
# Marking, and the two conversion tables
# ======================================================================================


def test_thirty_out_of_forty_is_band_seven_on_academic(client: TestClient) -> None:
    doc = start(client)
    sit(client, doc["mock_id"], graded_answers(AC_TEST_1, 30))
    report = submit(client, doc["mock_id"])

    assert report["score"]["raw_score"] == 30
    assert report["score"]["total_questions"] == 40
    assert report["score"]["band"] == 7.0
    assert report["score"]["band_is_estimate"] is False
    assert report["score"]["band_disclaimer"]
    # Raw score is the headline: the middle of the table is four marks wide.
    assert "four marks wide" in report["score"]["note"]


def test_the_same_thirty_is_band_six_on_general_training(client: TestClient) -> None:
    """The same raw score, a full band apart. GT's texts are easier and the standard compensates."""
    doc = start(client, module="general_training")
    sit(client, doc["mock_id"], graded_answers(GT_TEST_1, 30), minutes=(15, 18, 25))
    report = submit(client, doc["mock_id"])

    assert report["format"] == "general_training"
    assert report["score"]["raw_score"] == 30
    assert report["score"]["band"] == 6.0
    assert "full band apart" in report["band_ladder"]["module_note"]


@pytest.mark.parametrize(
    ("module", "raw", "band", "next_band", "marks_to_next"),
    [
        ("academic", 30, 7.0, 7.5, 3),
        ("academic", 23, 6.0, 6.5, 4),
        ("general_training", 30, 6.0, 6.5, 2),
        ("general_training", 23, 5.0, 5.5, 4),
        ("academic", 40, 9.0, None, None),
    ],
)
def test_the_band_ladder_says_how_far_the_next_band_is(
    module: str, raw: int, band: float, next_band: float | None, marks_to_next: int | None
) -> None:
    """Pure arithmetic on the published tables, and the most motivating number available."""
    from bandready.reading.mock import _band_ladder

    ladder = _band_ladder(raw, module)
    assert ladder["band"] == band
    assert ladder["next_band"] == next_band
    assert ladder["marks_to_next_band"] == marks_to_next


def test_the_two_tables_disagree_across_the_whole_range() -> None:
    """Not a single-point coincidence: GT is harsher everywhere it matters."""
    from bandready.server.routes.reading import raw_to_band

    strictly_harder = [
        raw
        for raw in range(20, 41)
        if raw_to_band(raw, "general_training") < raw_to_band(raw, "academic")
    ]
    assert len(strictly_harder) >= 15
    assert all(
        raw_to_band(raw, "general_training") <= raw_to_band(raw, "academic")
        for raw in range(41)
    )


# ======================================================================================
# The breakdowns
# ======================================================================================


def test_the_report_breaks_down_by_passage_type_and_trap(client: TestClient) -> None:
    doc = start(client)
    sit(client, doc["mock_id"], graded_answers(AC_TEST_1, 30))
    report = submit(client, doc["mock_id"])

    per_passage = {p["position"]: p for p in report["per_passage"]}
    assert sum(p["correct"] for p in per_passage.values()) == 30
    assert sum(p["total"] for p in per_passage.values()) == 40
    assert per_passage[1]["correct"] == 14  # the first fourteen were answered correctly

    per_type = {t["qtype"]: t for t in report["per_type"]}
    assert set(per_type) == {"true_false_not_given", "sentence_completion"}
    assert per_type["true_false_not_given"]["label"] == "True / False / Not Given"
    assert per_type["true_false_not_given"]["order_badge"] == "In passage order"
    assert sum(t["total"] for t in per_type.values()) == 40
    # Weakest type first — the report is ordered by what to fix.
    assert report["per_type"][0]["pct"] <= report["per_type"][-1]["pct"]

    traps = {t["slug"]: t for t in report["per_trap"]}
    assert traps, "every wrong item's authored traps are attributed"
    assert all(t["marks_lost"] >= 1 for t in traps.values())
    assert all(t["questions"] == sorted(t["questions"]) for t in traps.values())
    assert any(t["family"] == "J" for t in traps.values())

    assert report["review_url"].endswith(f"/attempts/{doc['mock_id']}/review")
    assert report["coach_reopened"] is True
    assert 1 <= len(report["next_actions"]) <= 3


def test_form_losses_are_counted_apart_from_comprehension_losses(client: TestClient) -> None:
    """Blanks and over-length answers need a pacing fix, not a re-read."""
    doc = start(client)
    answers = graded_answers(AC_TEST_1, 40)
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    completion = numbers[7]
    answers[str(completion)] = "a fall of eleven centimetres"  # right content, four words
    for blank in (numbers[0], numbers[1]):
        answers.pop(str(blank))

    sit(client, doc["mock_id"], answers)
    report = submit(client, doc["mock_id"])

    form = report["answer_form"]
    assert form["blank"] == 2
    assert form["over_limit"] == 1
    assert "not comprehension losses" in form["note"]

    slugs = {t["slug"]: t for t in report["per_trap"]}
    assert slugs["ran_out_of_time"]["marks_lost"] == 2
    assert slugs["ran_out_of_time"]["family"] == "F"
    assert slugs["over_limit"]["questions"] == [completion]
    assert any("blank" in action for action in report["next_actions"])


def test_a_finished_mock_is_reviewable_and_opens_every_passage(client: TestClient) -> None:
    doc = start(client)
    sit(client, doc["mock_id"], graded_answers(AC_TEST_1, 30))
    submit(client, doc["mock_id"])

    review = client.get(f"/api/v1/reading/attempts/{doc['mock_id']}/review")
    assert review.status_code == 200, review.text
    assert review.json()["raw_score"] == 30

    for passage_id in ("rp_mk_ac_01_p1", "rp_mk_ac_01_p2", "rp_mk_ac_01_p3"):
        gate = client.get(
            f"/api/v1/reading/coach/passages/{passage_id}/teaching"
        ).json()["gate"]
        assert gate["unlocked"] is True, passage_id
        assert gate["evidence"] == "test"


def test_words_looked_up_are_queued_and_returned_after_submission(client: TestClient) -> None:
    """The dictionary is closed during the hour; nothing the learner reached for is lost."""
    doc = start(client)
    client.patch(
        f"/api/v1/reading/mock/sessions/{doc['mock_id']}",
        json={"looked_up": ["slack", "dredged"], "seconds_elapsed": 600},
    )
    report = submit(client, doc["mock_id"])
    assert report["looked_up"] == ["slack", "dredged"]


def test_submitting_twice_returns_the_same_report(client: TestClient) -> None:
    doc = start(client)
    sit(client, doc["mock_id"], graded_answers(AC_TEST_1, 30))
    first = submit(client, doc["mock_id"])
    second = submit(client, doc["mock_id"])
    assert first["score"] == second["score"]
    assert first["finished_at"] == second["finished_at"]

    assert client.patch(
        f"/api/v1/reading/mock/sessions/{doc['mock_id']}", json={"answers": {"1": "true"}}
    ).status_code == 409


# ======================================================================================
# History
# ======================================================================================


def test_history_plots_raw_score_first(client: TestClient) -> None:
    first = start(client)
    sit(client, first["mock_id"], graded_answers(AC_TEST_1, 23))
    submit(client, first["mock_id"])

    second = start(client)
    sit(client, second["mock_id"], graded_answers(AC_TEST_2, 30))
    submit(client, second["mock_id"])

    body = client.get("/api/v1/reading/mock/sessions").json()
    assert body["count"] == 2
    assert body["scored"] == 2
    assert body["primary_metric"] == "raw_score"
    assert body["latest_raw"] == 30
    assert body["best_raw"] == 30
    assert body["delta_raw"] == 7  # the seven marks between band 6.0 and band 7.0
    # Oldest first, so the line plots left to right.
    assert [point["raw_score"] for point in body["trajectory"]] == [23, 30]
    assert [point["band"] for point in body["trajectory"]] == [6.0, 7.0]
    assert all(point["passage_minutes"] for point in body["trajectory"])
