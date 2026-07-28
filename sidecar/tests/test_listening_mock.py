"""Listening Mock tests: the pre-render gate, exam conditions, the table, the breakdowns.

Five properties are load-bearing and each is tested from more than one angle:

1. **The sitting cannot open on audio that does not exist.** ``POST /sessions`` queues a
   render job and holds at ``preparing``; ``POST …/start`` is a 409 until every part is on
   disk. A mock that stalled in the middle of Part 3 to synthesize Part 4 would be teaching
   the learner to tolerate a pause the exam never gives them.
2. **The audio plays once, and the server enforces it.** A second play of the same part is
   refused server-side, not hidden by the renderer — that is the constraint every technique
   in this module exists because of.
3. **The coach is shut for the duration**, including for a part the learner sat and
   legitimately unlocked earlier, and including while the audio is still rendering. The
   sitting's own part documents carry neither the key, nor the transcript, nor any teaching
   field, because the player builds them from an allowlist rather than stripping a blob.
4. **The conversion table is exact and shared.** One table serves Academic and General
   Training; 30/40 is band 7.0 and 23/40 is band 6.0, and the report leads with the raw
   score because 18–22 is a single five-mark-wide band.
5. **The breakdowns are per-part, per-type, per-trap and per-cascade**, with the form
   losses — blanks and near-miss spellings — counted apart from comprehension losses and
   derived from what the learner actually wrote.

The fixture pack is shared with ``test_listening_coach``: two papers we control completely,
forty questions each, so "what does the band table say" is a question about this engine
rather than about production content.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

# The fixture pack is shared rather than duplicated: two copies of a forty-question paper
# would drift, and "the same paper" is the premise of half these assertions.
from tests.test_listening_coach import (
    LETTERS,
    TEST_1,
    TEST_2,
    answer_key,
    render,
    script_numbers,
    sit_script,
)
from tests.test_listening_coach import client as client  # noqa: PLC0414 — re-exported fixture

P1 = "ls_mk_01_p1"


# ======================================================================================
# Helpers
# ======================================================================================


def render_test(test_id: str) -> None:
    """Put every part of one paper into the render cache, synchronously."""
    for script_id in script_numbers(test_id):
        render(script_id)


def graded_answers(test_id: str, correct: int, *, blanks: int = 0) -> dict[str, str]:
    """An answer sheet scoring exactly ``correct`` out of forty.

    The wrong answers are deliberately of two kinds. A completion item gets a real word
    that is never a key, and a letter item gets a different letter — so a wrong answer is a
    comprehension loss and nothing else, and the form bucket stays empty except for the
    blanks this helper is explicitly asked for.
    """
    key = answer_key(test_id)
    out: dict[str, str] = {}
    for index, number in enumerate(sorted(int(k) for k in key)):
        expected = key[str(number)]
        if index < correct:
            out[str(number)] = expected
        elif index < correct + blanks:
            out[str(number)] = ""
        elif expected in LETTERS:
            out[str(number)] = LETTERS[(LETTERS.index(expected) + 1) % len(LETTERS)]
        else:
            out[str(number)] = "quarry"
    return out


def open_sitting(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/listening/mock/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def start(client: TestClient, mock_id: str) -> dict[str, Any]:
    response = client.post(f"/api/v1/listening/mock/sessions/{mock_id}/start")
    assert response.status_code == 200, response.text
    return response.json()


def sit(
    client: TestClient,
    test_id: str = TEST_1,
    *,
    answers: dict[str, str] | None = None,
    play_all: bool = True,
    **body: Any,
) -> dict[str, Any]:
    """Render, open, start, play the four parts and autosave one answer sheet."""
    render_test(test_id)
    opened = open_sitting(client, test_id=test_id, **body)
    mock_id = opened["mock_id"]
    assert opened["status"] == "ready", opened["status"]
    started = start(client, mock_id)

    if play_all:
        for part in started["part_meta"]:
            played = client.post(
                f"/api/v1/listening/mock/sessions/{mock_id}/play",
                json={"script_id": part["script_id"]},
            )
            assert played.status_code == 200, played.text

    if answers is not None:
        saved = client.patch(
            f"/api/v1/listening/mock/sessions/{mock_id}",
            json={"answers": answers, "seconds_elapsed": 1500, "phase": "check"},
        )
        assert saved.status_code == 200, saved.text
    return started


def submit(client: TestClient, mock_id: str, **body: Any) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/listening/mock/sessions/{mock_id}/submit", json=body
    )
    assert response.status_code == 200, response.text
    return response.json()


# ======================================================================================
# 1. Assembly
# ======================================================================================


def test_assembly_is_coherent_and_least_recently_served(client: TestClient) -> None:
    """Four distinct parts, numbers 1..40 across the paper, never-sat first."""
    plan = client.get("/api/v1/listening/mock/plan").json()

    assert plan["question_count"] == 40
    assert [p["position"] for p in plan["parts"]] == [1, 2, 3, 4]
    assert [p["part"] for p in plan["parts"]] == [1, 2, 3, 4]
    assert plan["parts"][0]["first_number"] == 1
    assert plan["parts"][3]["last_number"] == 40
    assert plan["coherence"]["checks"]["four_parts"] is True
    assert plan["coherence"]["checks"]["numbers_contiguous"] is True
    assert plan["coherence"]["checks"]["forty_questions"] is True
    # Both fixture papers spread accents across the four parts, as the real one does.
    assert plan["coherence"]["checks"]["accent_spread"] is True
    assert plan["coherence"]["warnings"] == []
    assert plan["test_id"] == TEST_1  # neither is sat yet; id order breaks the tie

    # Sitting paper one makes paper two the least-recently-served choice.
    sit_test_1 = client.post(
        "/api/v1/listening/attempts", json={"test_id": TEST_1, "mode": "practice"}
    ).json()
    client.post(f"/api/v1/listening/attempts/{sit_test_1['attempt_id']}/submit", json={})
    assert client.get("/api/v1/listening/mock/plan").json()["test_id"] == TEST_2


def test_a_seed_reproduces_the_same_paper(client: TestClient) -> None:
    first = client.get("/api/v1/listening/mock/plan", params={"seed": 7}).json()
    second = client.get("/api/v1/listening/mock/plan", params={"seed": 7}).json()
    assert first["test_id"] == second["test_id"]
    assert first["seed"] == 7


def test_a_paper_whose_numbering_is_broken_is_refused(client: TestClient) -> None:
    """A sitting that cannot be marked out of forty is not sat and quietly mis-scored."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        # Retire everything but one paper, then break that paper's numbering.
        s.execute(
            sa_text("UPDATE listening_tests SET retired = 1 WHERE id != :keep"),
            {"keep": TEST_1},
        )
        s.execute(
            sa_text(
                "UPDATE listening_questions SET number = number + 100 "
                "WHERE script_id = :sid"
            ),
            {"sid": "ls_mk_01_p4"},
        )
        s.execute(
            sa_text(
                "UPDATE listening_scripts SET script_json = "
                "  replace(script_json, '\"n\": 3', '\"n\": 13') WHERE id = :sid"
            ),
            {"sid": "ls_mk_01_p4"},
        )

    response = client.get("/api/v1/listening/mock/plan")
    assert response.status_code == 422
    assert "1..N without a gap" in response.json()["detail"]


def test_only_one_sitting_may_be_open(client: TestClient) -> None:
    render_test(TEST_1)
    opened = open_sitting(client, test_id=TEST_1)
    second = client.post("/api/v1/listening/mock/sessions", json={})
    assert second.status_code == 409
    assert opened["mock_id"] in second.json()["detail"]


# ======================================================================================
# 2. The pre-render requirement
# ======================================================================================


@pytest.fixture()
def stub_render_job(monkeypatch: pytest.MonkeyPatch) -> None:
    """Hold the render job still so the pre-render gate can be observed one part at a time.

    With the real job running the audio appears within milliseconds, which is right for a
    learner and useless for an assertion about a partly-rendered sitting. The job itself is
    exercised end to end by the test below this one.
    """
    from bandready.listening import mock as engine

    monkeypatch.setattr(
        engine, "_submit_render_job", lambda session, doc: "job_stubbed_for_test"
    )


def test_the_sitting_will_not_start_until_every_part_is_rendered(
    client: TestClient, stub_render_job: None
) -> None:
    """The whole point: no part may be missing when the clock starts.

    Opening a sitting on unrendered audio holds it at ``preparing``. ``start`` refuses with
    a 409 that names how many parts are ready, so the UI can show a progress bar rather
    than an error, and the refusal lifts only when the last file lands.
    """
    opened = open_sitting(client, test_id=TEST_1)
    mock_id = opened["mock_id"]

    assert opened["status"] == "preparing"
    assert opened["audio"]["ready"] is False
    assert opened["audio"]["ready_parts"] == 0
    assert opened["audio"]["total_parts"] == 4
    assert opened["audio"]["job_id"]

    refused = client.post(f"/api/v1/listening/mock/sessions/{mock_id}/start")
    assert refused.status_code == 409
    assert "0 of 4 parts rendered" in refused.json()["detail"]

    # Render three of the four: still refused, and the progress moves.
    for script_id in list(script_numbers(TEST_1))[:3]:
        render(script_id)
    partly = client.get(f"/api/v1/listening/mock/sessions/{mock_id}").json()
    assert partly["status"] == "preparing"
    assert partly["audio"]["ready_parts"] == 3
    assert partly["audio"]["pct"] == 75
    still_refused = client.post(f"/api/v1/listening/mock/sessions/{mock_id}/start")
    assert still_refused.status_code == 409
    assert "3 of 4 parts rendered" in still_refused.json()["detail"]

    # The last part lands; a poll promotes the sitting and start succeeds.
    render(list(script_numbers(TEST_1))[3])
    ready = client.get(f"/api/v1/listening/mock/sessions/{mock_id}").json()
    assert ready["status"] == "ready"
    assert ready["audio"]["ready"] is True
    assert ready["audio"]["pct"] == 100

    started = start(client, mock_id)
    assert started["status"] == "in_progress"
    assert started["clock"]["phase"] == "audio"
    # And the clock is derived from the audio, not invented.
    assert started["timing"]["derived_from_audio"] is True
    assert started["timing"]["audio_s"] > 0
    assert started["clock"]["duration_s"] == pytest.approx(
        started["timing"]["audio_s"] + 120.0
    )


def test_the_render_job_prepares_the_audio_and_the_sitting_then_starts(
    client: TestClient,
) -> None:
    """The real background job, end to end: create, poll, start.

    The job renders each part on a worker thread rather than on the serving event loop.
    That is not tidiness: ``render_script`` writes a ``media_files`` row per synthesized
    line, and run on the loop those blocking writes deadlock against the very request that
    submitted the job, because the session teardown that would release the writer lock is
    itself a loop callback.
    """
    import time

    opened = open_sitting(client, test_id=TEST_1)
    mock_id = opened["mock_id"]
    assert opened["status"] == "preparing"
    assert opened["audio"]["job_id"]

    deadline = time.monotonic() + 30.0
    body = opened
    while time.monotonic() < deadline:
        body = client.get(f"/api/v1/listening/mock/sessions/{mock_id}").json()
        if body["status"] == "ready":
            break
        assert body["audio"]["job_state"] != "error", body["audio"]["job_error"]
        time.sleep(0.05)

    assert body["status"] == "ready", body["audio"]
    assert body["audio"]["ready_parts"] == 4
    assert client.get(f"/api/v1/jobs/{opened['audio']['job_id']}").json()["state"] == "done"
    assert start(client, mock_id)["status"] == "in_progress"


def test_a_fully_rendered_paper_opens_ready_with_no_job(client: TestClient) -> None:
    render_test(TEST_1)
    opened = open_sitting(client, test_id=TEST_1)
    assert opened["status"] == "ready"
    assert opened["audio"]["job_id"] is None
    assert opened["audio"]["ready"] is True


def test_submitting_a_sitting_that_never_started_is_refused(client: TestClient) -> None:
    render_test(TEST_1)
    opened = open_sitting(client, test_id=TEST_1)
    response = client.post(
        f"/api/v1/listening/mock/sessions/{opened['mock_id']}/submit", json={}
    )
    assert response.status_code == 409
    assert "has not been started" in response.json()["detail"]


# ======================================================================================
# 3. Exam conditions
# ======================================================================================


def test_the_coach_is_shut_for_a_part_that_was_legitimately_unlocked(
    client: TestClient,
) -> None:
    """The property a mock has no value without.

    The learner sat Part 1 last week and earned its transcript. During a sitting they do
    not have it — not for that part and not for any other — and the refusal is server-side,
    where the renderer cannot negotiate with it.
    """
    sit_script(client, P1, {"1": "answer1"})
    assert (
        client.get(f"/api/v1/listening/coach/scripts/{P1}/teaching").json()["gate"][
            "unlocked"
        ]
        is True
    )

    render_test(TEST_1)
    opened = open_sitting(client, test_id=TEST_1)
    try:
        payload = client.get(f"/api/v1/listening/coach/scripts/{P1}/teaching").json()
        assert payload["gate"]["unlocked"] is False
        assert payload["gate"]["reason"] == "exam_conditions"
        assert payload["gate"]["mock_id"] == opened["mock_id"]
        assert payload["transcript"]["lines"] == []
        assert payload["questions"] == []
        assert payload["groups"] == []
        assert payload["teaching_available"] is False
        assert payload["exam_conditions"]["plays_allowed"] == 1

        # Every other coach surface is a 409, including the ones that are never gated by
        # an attempt — during a sitting nothing is preparation.
        for response in (
            client.get("/api/v1/listening/coach/strategy"),
            client.get("/api/v1/listening/coach/traps"),
            client.get(f"/api/v1/listening/coach/predictions/{P1}"),
            client.post(
                "/api/v1/listening/coach/replay", json={"script_id": P1, "number": 1}
            ),
        ):
            assert response.status_code == 409, response.text
            assert "listening mock" in response.json()["detail"]

        conditions = client.get("/api/v1/listening/coach/exam-conditions").json()
        assert conditions["active"] is True
        assert conditions["coaching_available"] is False
        assert conditions["prediction_gate_enabled"] is False
        assert "transcript" in conditions["withheld"]
        assert "strategy_cards" in conditions["withheld"]
    finally:
        client.post(f"/api/v1/listening/mock/sessions/{opened['mock_id']}/abandon")

    # Walking out reopens the coach — one closed laptop must not cost an afternoon.
    reopened = client.get(f"/api/v1/listening/coach/scripts/{P1}/teaching").json()
    assert reopened["gate"]["unlocked"] is True


def test_the_coach_is_shut_while_the_audio_is_still_rendering(
    client: TestClient,
) -> None:
    """A learner reading transcripts during the render queue has already sat the paper."""
    sit_script(client, P1, {"1": "answer1"})
    opened = open_sitting(client, test_id=TEST_1)
    assert opened["status"] == "preparing"

    payload = client.get(f"/api/v1/listening/coach/scripts/{P1}/teaching").json()
    assert payload["gate"]["reason"] == "exam_conditions"
    assert payload["gate"]["mock_id"] == opened["mock_id"]


def test_the_sitting_serves_no_key_no_transcript_and_no_teaching(
    client: TestClient,
) -> None:
    """Not stripped from a blob — never put into one. The player builds from an allowlist."""
    started = sit(client)
    parts = started["parts"]

    assert len(parts) == 4
    assert started["answers_included"] is False
    assert started["coaching_included"] is False
    for part in parts:
        assert "lines" not in part
        assert "teaching" not in part
        assert "groups" not in part
        assert part["coaching_included"] is False
        for question in part["questions"]:
            assert "answers" not in question
            assert "cue_line_index" not in question
            assert "explanation" not in question
            assert "teaching" not in question
    # Numbering is the answer sheet's, so the narrator and the boxes agree.
    assert [q["number"] for q in parts[0]["questions"]] == list(range(1, 11))
    assert [q["number"] for q in parts[3]["questions"]] == list(range(31, 41))


def test_each_part_plays_once_and_the_server_refuses_the_second(
    client: TestClient,
) -> None:
    """The defining constraint of the paper, enforced where a renderer cannot argue."""
    started = sit(client, play_all=False)
    mock_id = started["mock_id"]

    first = client.post(
        f"/api/v1/listening/mock/sessions/{mock_id}/play", json={"script_id": P1}
    )
    assert first.status_code == 200, first.text
    assert first.json()["plays"]["played"] == {P1: 1}
    assert P1 not in first.json()["plays"]["remaining"]

    again = client.post(
        f"/api/v1/listening/mock/sessions/{mock_id}/play", json={"script_id": P1}
    )
    assert again.status_code == 409
    assert "already been played" in again.json()["detail"]

    # A part from another paper is not in this sitting at all.
    stranger = client.post(
        f"/api/v1/listening/mock/sessions/{mock_id}/play",
        json={"script_id": "ls_mk_02_p1"},
    )
    assert stranger.status_code == 404


# ======================================================================================
# 4. The clock, the delivery modes and autosave
# ======================================================================================


def test_the_two_delivery_modes_differ_only_in_the_window(client: TestClient) -> None:
    """Computer gets 2 minutes to check; paper gets 10 minutes to transfer."""
    modes = client.get("/api/v1/listening/mock/delivery").json()
    assert modes["default"] == "computer"
    by_slug = {entry["slug"]: entry for entry in modes["modes"]}
    assert by_slug["computer"]["window_s"] == 120.0
    assert by_slug["paper"]["window_s"] == 600.0
    assert "clerical allowance" in by_slug["paper"]["note"]
    assert modes["mnemonic"].startswith("Paper gets ten minutes")
    assert modes["check_protocol"][0].startswith("Blanks first")

    computer = client.get("/api/v1/listening/mock/plan").json()
    paper = client.get(
        "/api/v1/listening/mock/plan", params={"delivery": "paper"}
    ).json()
    assert computer["timing"]["window_s"] == 120.0
    assert computer["timing"]["window_label"] == "2-minute check"
    assert paper["timing"]["window_s"] == 600.0
    assert paper["timing"]["window_label"] == "10-minute transfer"
    # Everything else about the two sittings is identical: the audio decides the rest.
    assert computer["timing"]["audio_s"] == paper["timing"]["audio_s"]


def test_the_response_says_which_test_is_modelled(client: TestClient) -> None:
    started = sit(client, delivery="paper")
    assert started["delivery"] == "paper"
    assert started["delivery_label"] == "Paper-based"
    assert "10-minute transfer" in started["modelled"]
    assert started["clock"]["window_s"] == 600.0
    assert any("paper-based format" in point for point in started["briefing"]["points"])


def test_autosave_merges_answers_and_moves_the_phase(client: TestClient) -> None:
    started = sit(client)
    mock_id = started["mock_id"]

    first = client.patch(
        f"/api/v1/listening/mock/sessions/{mock_id}",
        json={"answers": {"1": "answer1"}, "seconds_elapsed": 60, "current_part": 1},
    ).json()
    assert first["answered"] == 1
    assert first["clock"]["seconds_elapsed"] == 60.0
    assert first["clock"]["phase"] == "audio"

    second = client.patch(
        f"/api/v1/listening/mock/sessions/{mock_id}",
        json={"answers": {"2": "answer2"}, "current_part": 2},
    ).json()
    assert second["answered"] == 2  # a partial deep-merge, not a replace
    assert second["resume_state"]["answers"] == {"1": "answer1", "2": "answer2"}
    assert second["clock"]["current_part"] == 2

    bad_part = client.patch(
        f"/api/v1/listening/mock/sessions/{mock_id}", json={"current_part": 4}
    )
    assert bad_part.status_code == 200  # four parts exist
    invalid = client.patch(
        f"/api/v1/listening/mock/sessions/{mock_id}", json={"phase": "interval"}
    )
    assert invalid.status_code == 422


def test_a_finished_sitting_cannot_be_edited(client: TestClient) -> None:
    started = sit(client, answers=graded_answers(TEST_1, 20))
    submit(client, started["mock_id"])
    late = client.patch(
        f"/api/v1/listening/mock/sessions/{started['mock_id']}", json={"answers": {"1": "x"}}
    )
    assert late.status_code == 409


# ======================================================================================
# 5. Submit — the table, and the breakdowns
# ======================================================================================


@pytest.mark.parametrize(
    ("raw", "band"),
    [(40, 9.0), (39, 9.0), (35, 8.0), (30, 7.0), (26, 6.5), (23, 6.0), (16, 5.0)],
)
def test_the_conversion_table_hits_the_published_anchors(raw: int, band: float) -> None:
    """Band 5 = 16, band 6 = 23, band 7 = 30, band 8 = 35 — all four official anchors."""
    from bandready.listening.mock import _band_ladder

    ladder = _band_ladder(raw, 40)
    assert ladder["band"] == band
    assert ladder["projected_raw_40"] == raw
    assert ladder["band_is_estimate"] is False


def test_the_ladder_names_the_next_band_and_the_width_of_this_one() -> None:
    """The middle is a swamp and the top is a cliff, and the numbers say so."""
    from bandready.listening.mock import _band_ladder

    swamp = _band_ladder(19, 40)
    assert swamp["band"] == 5.5
    assert swamp["band_width"] == 5  # 18, 19, 20, 21, 22 are all band 5.5
    assert swamp["next_band"] == 6.0
    assert swamp["marks_to_next_band"] == 4

    cliff = _band_ladder(33, 40)
    assert cliff["band"] == 7.5
    assert cliff["band_width"] == 3
    assert cliff["marks_to_next_band"] == 2
    assert "same test for both" in cliff["one_table_note"]


def test_the_report_leads_with_the_raw_score_and_splits_by_part(
    client: TestClient,
) -> None:
    """Raw first, then the per-part split — because the two hard parts fail differently."""
    started = sit(client, answers=graded_answers(TEST_1, 30))
    report = submit(client, started["mock_id"])

    assert report["score"]["raw_score"] == 30
    assert report["score"]["total_questions"] == 40
    assert report["score"]["band"] == 7.0
    assert report["score"]["band_is_estimate"] is False
    assert "five-mark-wide" in report["score"]["note"]
    assert report["band_ladder"]["marks_to_next_band"] == 2

    assert [row["position"] for row in report["per_part"]] == [1, 2, 3, 4]
    assert [row["part"] for row in report["per_part"]] == [1, 2, 3, 4]
    assert [row["total"] for row in report["per_part"]] == [10, 10, 10, 10]
    # The first thirty answers are right, so parts 1–3 are clean and part 4 is empty.
    assert [row["correct"] for row in report["per_part"]] == [10, 10, 10, 0]
    assert report["per_part"][3]["pct"] == 0.0
    assert all(row["played"] == 1 for row in report["per_part"])
    assert "losing track of who thinks what" in report["per_part_note"]

    by_type = {row["qtype"]: row for row in report["per_type"]}
    assert by_type["note_completion"]["total"] == 20
    assert by_type["multiple_choice"]["total"] == 20
    assert by_type["multiple_choice"]["label"] == "Multiple choice"

    assert report["review_url"].endswith(f"/{started['mock_id']}/review")
    assert report["coach_reopened"] is True
    assert 0 < len(report["next_actions"]) <= 3


def test_the_form_losses_are_counted_apart_from_the_comprehension_ones(
    client: TestClient,
) -> None:
    """Blanks and near misses are process failures. Coaching them as listening wastes time."""
    answers = graded_answers(TEST_1, 20, blanks=4)
    # Two near misses: heard correctly, written wrongly. They score zero and they are not
    # comprehension losses, and the report has to say so.
    answers["25"] = "answr25"
    answers["31"] = "answr31"
    started = sit(client, answers=answers)
    report = submit(client, started["mock_id"])

    form = report["answer_form"]
    assert form["blank"] == 4
    assert form["spelling"] == 2
    assert form["over_limit"] == 0
    assert form["marks_lost_to_form"] == 6
    assert {row["slug"] for row in form["rows"]} == {"blank", "spelling"}
    assert "three weeks" in form["note"]

    # …and the trap table is comprehension only, with the authored slugs behind it.
    assert {row["slug"] for row in report["per_trap"]} <= {
        "self_correction",
        "all_options_named",
    }
    assert all(row["family"] in ("C", "L") for row in report["per_trap"])
    assert any("blank" in action for action in report["next_actions"])
    assert any("spelling" in action for action in report["next_actions"])


def test_the_cascade_detector_names_the_miss_that_cost_three_marks(
    client: TestClient,
) -> None:
    """One miss plus a failure to rejoin is not three comprehension failures."""
    answers = answer_key(TEST_1).copy()
    for number in (17, 18, 19):
        answers[str(number)] = "quarry"
    # A lone miss elsewhere, which must NOT be reported as a cascade.
    answers["3"] = "quarry"
    started = sit(client, answers=answers)
    report = submit(client, started["mock_id"])

    cascades = report["cascades"]
    assert cascades["count"] == 1
    run = cascades["runs"][0]
    assert run["trigger"] == 17
    assert run["lost_after"] == [18, 19]
    assert run["marks_lost_to_the_cascade"] == 2
    assert run["part"] == 2
    assert "You lost Q17" in run["verdict"]
    # The handhold that was available and unused, from the question after the miss.
    assert run["recovery"].startswith("If this one went past")
    assert any("Q17" in action for action in report["next_actions"])


def test_a_cascade_does_not_run_across_a_part_boundary(client: TestClient) -> None:
    """Every part boundary hands the learner a preview pause and a fresh start."""
    answers = answer_key(TEST_1).copy()
    for number in (19, 20, 21, 22):
        answers[str(number)] = "quarry"
    started = sit(client, answers=answers)
    report = submit(client, started["mock_id"])

    # 19–20 are Part 2 and 21–22 are Part 3: two runs of two, so neither is a cascade.
    assert report["cascades"]["count"] == 0
    assert "No cascades" in report["cascades"]["note"]


def test_a_second_submit_returns_the_stored_report(client: TestClient) -> None:
    started = sit(client, answers=graded_answers(TEST_1, 23))
    first = submit(client, started["mock_id"])
    second = submit(client, started["mock_id"])
    assert first == second
    assert first["score"]["band"] == 6.0


def test_submitting_reopens_the_coach_on_all_four_parts(client: TestClient) -> None:
    started = sit(client, answers=graded_answers(TEST_1, 25))
    submit(client, started["mock_id"])

    for script_id in script_numbers(TEST_1):
        gate = client.get(
            f"/api/v1/listening/coach/scripts/{script_id}/teaching"
        ).json()["gate"]
        assert gate["unlocked"] is True, script_id
        assert gate["evidence"] == "test"
    assert client.get("/api/v1/listening/coach/strategy").status_code == 200


def test_an_expired_clock_is_recorded_as_auto_submitted(client: TestClient) -> None:
    started = sit(client, answers=graded_answers(TEST_1, 10))
    report = submit(
        client, started["mock_id"], seconds_elapsed=started["clock"]["duration_s"] + 30
    )
    assert report["auto_submitted"] is True


# ======================================================================================
# 6. History
# ======================================================================================


def test_history_plots_raw_score_as_the_primary_series(client: TestClient) -> None:
    first = sit(client, answers=graded_answers(TEST_1, 20))
    submit(client, first["mock_id"])
    second = sit(client, TEST_2, answers=graded_answers(TEST_2, 28))
    submit(client, second["mock_id"])

    body = client.get("/api/v1/listening/mock/sessions").json()
    assert body["count"] == 2
    assert body["scored"] == 2
    assert body["primary_metric"] == "raw_score"
    assert body["latest_raw"] == 28
    assert body["best_raw"] == 28
    assert body["delta_raw"] == 8
    assert [point["raw_score"] for point in body["trajectory"]] == [20, 28]
    assert body["items"][0]["status"] == "complete"
    assert body["items"][0]["part_scores"] == [10, 10, 8, 0]


def test_an_abandoned_sitting_cannot_be_marked(client: TestClient) -> None:
    """Nobody who walked out has earned a band — or the transcript that comes with one."""
    started = sit(client, answers=graded_answers(TEST_1, 12))
    walked_out = client.post(
        f"/api/v1/listening/mock/sessions/{started['mock_id']}/abandon"
    )
    assert walked_out.status_code == 200
    assert walked_out.json()["status"] == "abandoned"

    refused = client.post(
        f"/api/v1/listening/mock/sessions/{started['mock_id']}/submit", json={}
    )
    assert refused.status_code == 409
    assert "abandoned" in refused.json()["detail"]
    # …and the coach stays shut on the parts of the paper they walked out of.
    gate = client.get(f"/api/v1/listening/coach/scripts/{P1}/teaching").json()["gate"]
    assert gate["unlocked"] is False


def test_an_unknown_sitting_is_a_404(client: TestClient) -> None:
    assert client.get("/api/v1/listening/mock/sessions/lm_nope").status_code == 404
    assert (
        client.post("/api/v1/listening/mock/sessions/lm_nope/submit", json={}).status_code
        == 404
    )
