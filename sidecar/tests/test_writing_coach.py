"""Writing coach tests: the gate, the payload shape, the language bank, compare.

Three properties are load-bearing here and each is tested from more than one angle:

1. **A model answer is never returned to a learner who has not written yet.** The lock
   covers every field that carries model wording — the three answers, the sentence ladder
   (whose 6/7/8 rungs are lifted from them), the swap slots (whose spans are substrings of
   the band-7 text), ``plan.trap`` and the Academic overview brief.
2. **Preparation material is never locked.** The frames, the collocations, the letter
   brief and the essay brief are available before the attempt, because a frame with an
   open slot is not a model answer.
3. **Compare is grounded in the prompt's own payload.** In mock mode the LLM returns a
   fixture that knows nothing about this prompt, so the authored baseline is what comes
   back — which is exactly the offline behaviour, tested for real.

The fixture pack is two authored prompts (one Task 2 essay, one Academic line chart) plus
one payload-free prompt, because "a prompt that predates the teaching layer must render as
empty rather than 500" is a real requirement of the sixteen originals.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

TOKEN = "test-token"

T2_PROMPT = "wp_t2_night_buses"
AC_PROMPT = "wp_ac_reservoir_levels"
BARE_PROMPT = "wp_legacy_no_teaching"

#: Appears only inside the band-7 model answer. If this string ever comes back before an
#: attempt has been submitted, the gate has leaked.
MODEL_ONLY = "a timetable that stops at eleven is a timetable for people who own cars"

#: Appears only in the overview brief. Same job, for the Academic Task 1 side.
OVERVIEW_ONLY = "both reservoirs recover in the same season, but only one of them keeps what it gains"

T2_TEXT = (
    "Some towns have withdrawn their evening bus services and now argue that the money is "
    "better spent elsewhere.\n\nTo what extent do you agree that a public transport network "
    "should be judged by its evening service rather than by its peak-hour capacity?\n\n"
    "Give reasons for your answer and include any relevant examples from your own knowledge "
    "or experience.\n\nWrite at least 250 words."
)


def _model(band: int, text: str, *, lifts: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {
        "band_target": band,
        "label": f"band {band}",
        "word_count": len(text.split()),
        "text": text,
        "what_caps_it": []
        if band > 6
        else [{"criterion": "cc", "point": "Connectives sit at the head of every sentence."}],
        "what_lifts_it": lifts or [],
        "annotations": [
            {
                "span": text.split(".")[0] + ".",
                "kind": "move",
                "criterion": "ta",
                "label": "The position carries its limit",
                "why": "State the degree where the position is stated.",
                "transferable": True,
            }
        ],
    }


T2_TEACHING: dict[str, Any] = {
    "schema_version": 1,
    "cluster": "t2-test",
    "teaches": "Judge a network by the journeys it makes possible, not by the ones it already carries.",
    "band_move": "Answer 'to what extent' with a stated limit, and carry that limit into the conclusion.",
    "exam_note": "A flat agreement can still score at the top; an unstated degree cannot.",
    "time_plan": [
        {"phase": "decode", "minutes": 2, "does": "The claim is about evenings, not about buses in general."},
        {"phase": "plan", "minutes": 5, "does": "Fix the degree word, then one objection and one reason."},
        {"phase": "write", "minutes": 28, "does": "Objection first, then the access argument."},
        {"phase": "check", "minutes": 5, "does": "Does the conclusion still carry the introduction's qualifier?"},
    ],
    "plan": {
        "lines": [
            {"label": "POSITION", "note": "agree, but only where shift work exists"},
            {"label": "BODY 1", "note": "concede: peak capacity is what the budget is measured on"},
            {"label": "BODY 2", "note": "access: no evening bus = no evening job"},
            {"label": "RISK", "note": "no invented ridership figures"},
        ],
        "test": "Could a stranger write body two from this line, including the limit?",
        "trap": "Most answers agree flatly and never say how far, so the question goes unanswered.",
    },
    "structure_plan": [
        {"para": 1, "role": "introduction", "words": 45, "must_do": "Agree and name the limit in one sentence."},
        {"para": 2, "role": "body", "words": 100, "must_do": "The objection, argued properly."},
        {"para": 3, "role": "body", "words": 105, "must_do": "The access argument, with one typical case."},
        {"para": 4, "role": "conclusion", "words": 40, "must_do": "Same qualifier, nothing new."},
    ],
    "parts_checklist": [
        {"part": "A position, given in the introduction", "evidence_question": "Can a reader state your answer after paragraph one?"},
        {"part": "A stated degree, not a bare agreement", "evidence_question": "Which word carries the 'to what extent'?"},
    ],
    "language_bank": {
        "warning": "The gap in each frame is where your own thinking goes.",
        "moves": [
            {
                "move": "conceding",
                "why_here": "The budget objection is strong and must be put fairly.",
                "grammar": "concessive clauses",
                "frames": [
                    {"frame": "There is force in the claim that ___.", "slot_hint": "the objection, in its own terms"},
                    {"frame": "___ may well ___ rather than ___.", "slot_hint": "the policy, then the modest effect"},
                ],
                "avoid": "Of course, every coin has two sides and we should look at both.",
            },
            {
                "move": "evaluating",
                "why_here": "A degree word has to be chosen and then defended.",
                "grammar": "degree adverbs",
                "frames": [{"frame": "The case for ___ holds only where ___.", "slot_hint": "the measure, then the condition"}],
                "avoid": "In my opinion, I totally agree with this statement one hundred per cent.",
            },
        ],
    },
    "collocations": [
        {"chunk": "a case for", "example": "There is a case for keeping one late service on every route.", "cefr": "B2"},
        {"chunk": "at the expense of", "example": "Peak capacity is protected at the expense of the last bus home.", "cefr": "C1"},
    ],
    "upgrade_pairs": [
        {"vague": "everyone needs buses at night", "precise": "in most towns without night work, demand is thin", "why": "Overreach invites the counter-example."}
    ],
    "target_structures": [
        {"name": "fronted concessive", "model": "While peak capacity is what the budget measures, it is not what strands people.", "trap": "'While' + comma, not 'While' + full stop."}
    ],
    "error_watchlist": [
        {"pattern": "position drift", "wrong": "Buses are important for everyone.", "right": "Evening services matter most where shift work is common.", "why": "Keep the limit you set in the introduction.", "criterion": "ta"},
        {"pattern": "people which", "wrong": "people which work nights", "right": "people who work nights", "why": "'Who' for people, 'which' for things.", "criterion": "gra"},
    ],
    "checklist": [
        "Read the introduction and the conclusion together: same qualifier?",
        "Does each body paragraph open on a claim, not a subject?",
    ],
    "rewrite_focus": {
        "focus": "Rewrite your introduction so the sentence stating agreement also states the limit.",
        "why": "A calibrated position is what 'to what extent' rewards, and it lifts Task Response first.",
        "drill": "Three minutes: four versions of that sentence, each with a different qualifier.",
    },
    "sentence_ladder": {
        "idea": "A network without an evening service excludes the people who most need it.",
        "rungs": [
            {"band": 5, "text": "The bus not run in night so the peoples cannot go home from work."},
            {"band": 6, "text": "There are no buses in the evening, so people who finish work late cannot get home."},
            {"band": 7, "text": "Where the last bus leaves before the late shift ends, the network is closed to the people who most depend on it."},
            {"band": 8, "text": f"{MODEL_ONLY}."},
        ],
    },
    "essay_brief": {
        "question_type": "to what extent do you agree",
        "obligatory_shape": "A degree, stated in the introduction and defended, not a bare agreement.",
        "axis": 3,
        "axis_label": "spending trade-off",
        "position": "Largely agree, but only where evening employment is common.",
        "position_touchpoints": ["introduction", "opening of body two", "conclusion"],
        "idea_bank": [
            {"side": "against", "claim": "Peak capacity is what the budget is measured on.", "mechanism": "Funding follows counted journeys, and evening journeys are few.", "evidence": "A route reviewed on morning boardings alone.", "consequence": "Evening cuts look efficient on paper."},
            {"side": "for", "claim": "An evening service is what makes an evening job possible.", "mechanism": "Without a way home, the job cannot be accepted at all.", "evidence": "A hospital cleaner finishing at ten.", "consequence": "The saving is paid for by somebody's employment."},
        ],
        "development_drill": {"claim": "Evening services are a labour-market policy.", "ask": "Five minutes: supply the mechanism, one typical case and the consequence."},
        "memorisation_test": "A memorised transport essay argues about congestion; this prompt is about the last bus.",
    },
    "swap_slots": [
        {"span": MODEL_ONLY, "prompt": "Name the shift and the hour it ends in your own town."}
    ],
    "model_answers": [
        _model(6, "I agree with this statement. Evening buses are important. Firstly, people need them."),
        _model(
            7,
            f"I largely agree, though only where evening work is common. {MODEL_ONLY}. "
            "The objection has force: peak capacity is what a budget is measured on.",
            lifts=[
                {"criterion": "ta", "point": "The degree is stated up front and argued, not merely repeated."},
                {"criterion": "cc", "point": "Paragraphs open on claims rather than on connectives."},
                {"criterion": "lr", "point": "'Peak capacity', 'measured on': the subject's own language."},
            ],
        ),
        _model(
            8,
            "I largely agree, with one condition attached. What a timetable ending at eleven "
            "actually rations is not travel but employment.",
            lifts=[{"criterion": "gra", "point": "One cleft carries the whole argument."}],
        ),
    ],
}

AC_TEACHING: dict[str, Any] = {
    "schema_version": 1,
    "cluster": "ac-test",
    "teaches": "Group two reservoirs by what they keep, not by which is larger.",
    "band_move": "Write the overview before any figure, and put no figure in it.",
    "time_plan": [
        {"phase": "decode", "minutes": 3, "does": "Two reservoirs, six years, one unit."},
        {"phase": "plan", "minutes": 2, "does": "Commit to both overview statements before writing."},
        {"phase": "write", "minutes": 12, "does": "Overview, then the recovery group, then the loss group."},
        {"phase": "check", "minutes": 3, "does": "Every figure transcribed correctly?"},
    ],
    "plan": {
        "lines": [
            {"label": "TENSE", "note": "past simple - period ends 2023"},
            {"label": "OVERVIEW", "note": "both recover in winter; one holds it, one does not"},
            {"label": "GROUP 1", "note": "Ashfield: seasonal, ends where it started"},
            {"label": "GROUP 2", "note": "Verdon: same seasons, lower each year"},
            {"label": "RISK", "note": "by vs to with every figure"},
        ],
        "test": "Could a stranger write both body paragraphs from these five lines?",
        "trap": "Most answers describe each reservoir in turn and never say what they share.",
    },
    "structure_plan": [
        {"para": 1, "role": "introduction", "words": 25, "must_do": "Paraphrase the description line, no figures."},
        {"para": 2, "role": "overview", "words": 35, "must_do": "Both whole-data statements, still no figures."},
        {"para": 3, "role": "detail_group", "words": 60, "must_do": "The seasonal pattern, with three figures."},
        {"para": 4, "role": "detail_group", "words": 60, "must_do": "The decline, compared across the same years."},
    ],
    "parts_checklist": [
        {"part": "A figure-free overview", "evidence_question": "Which sentence is true of the whole chart?"}
    ],
    "language_bank": {
        "warning": "A trend verb with no adverb is half a sentence.",
        "moves": [
            {
                "move": "describing_trend",
                "why_here": "Six years of data is a trend, not a ranking.",
                "grammar": "there was a + adjective + noun in",
                "frames": [{"frame": "There was a ___ ___ in ___ between ___ and ___.", "slot_hint": "adjective, noun, series, two years"}],
                "avoid": "The graph shows the levels went up and down over the years.",
            },
            {
                "move": "grouping",
                "why_here": "Two reservoirs behave the same way and then diverge.",
                "grammar": "both ... but only",
                "frames": [{"frame": "Both ___, but only ___ ___.", "slot_hint": "the shared behaviour, then the exception"}],
                "avoid": "Firstly I will describe reservoir one and secondly reservoir two.",
            },
        ],
    },
    "collocations": [
        {"chunk": "a decline in", "example": "There was a steady decline in the Verdon level across the six years.", "cefr": "B2"}
    ],
    "upgrade_pairs": [{"vague": "went down a lot", "precise": "fell by roughly a third", "why": "Name the size, not the drama."}],
    "target_structures": [{"name": "nominalised change", "model": "There was a sharp fall in the Verdon level.", "trap": "'a fall in', never 'a fall of' for a level."}],
    "error_watchlist": [
        {"pattern": "by vs to with figures", "wrong": "fell by 40 per cent of capacity", "right": "fell to 40 per cent of capacity", "why": "'By' is the size of the change; 'to' is the endpoint.", "criterion": "lr"}
    ],
    "checklist": ["Check every figure against the chart before you leave the room."],
    "rewrite_focus": {
        "focus": "Delete every figure from your overview paragraph and see whether it still says something.",
        "why": "An overview that decays into a data sentence is the commonest cap on Task Achievement.",
        "drill": "Two minutes: rewrite the overview with no digits at all.",
    },
    "sentence_ladder": {
        "idea": "Both reservoirs rise in winter; only one keeps what it gains.",
        "rungs": [
            {"band": 5, "text": "In winter the water is more. Verdon is less every year."},
            {"band": 6, "text": "Both reservoirs rose in winter, but Verdon was lower each year."},
            {"band": 7, "text": "Both recovered every winter, yet only Ashfield ended the period where it began."},
            {"band": 8, "text": "The seasonal recovery was shared; what was not shared was the ability to hold on to it."},
        ],
    },
    "overview_brief": {
        "must_capture": [OVERVIEW_ONLY, "Ashfield ends the period at the level it started from."],
        "model_overview": "Both reservoirs followed the same seasonal rhythm, yet only one ended the period where it began.",
        "weak_overview": {"text": "The graph shows the water levels of two reservoirs over six years.", "failure": "W3"},
        "group_as": {"body1": "the shared seasonal pattern", "body2": "the divergence in what is retained", "why": "Grouping by behaviour beats describing each reservoir in turn."},
        "must_report": ["the winter peaks", "the summer troughs", "the Verdon decline", "the Ashfield return"],
        "omit": ["the exact month of each peak", "the axis maximum"],
        "figure_budget": {"min": 8, "max": 14},
        "tense": "Past simple: the period ends in a completed year.",
    },
    "model_answers": [
        _model(6, "The graph shows two reservoirs. Ashfield goes up and down. Verdon goes down."),
        _model(7, "Both reservoirs recovered each winter, but only Ashfield held what it gained."),
        _model(8, "What the two reservoirs shared was the season; what they did not share was retention."),
    ],
}


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


def add_teaching_column() -> None:
    """Install ``writing_prompts.teaching_json`` if the schema agent's migration has not.

    Content DESIGN §0.3 makes the column a prerequisite this package does not own. The
    coach is written to survive its absence, and these tests exercise the path where it is
    present — which is the path that has to work once the migration lands.
    """
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        names = {str(row[1]) for row in s.execute(sa_text("PRAGMA table_info(writing_prompts)")).all()}
        if "teaching_json" not in names:
            s.execute(sa_text("ALTER TABLE writing_prompts ADD COLUMN teaching_json TEXT"))


def seed_pack() -> None:
    """Retire the shipped pack and install three prompts we control completely."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    add_teaching_column()
    rows = [
        (T2_PROMPT, "task2", "opinion", "topic_transport", ["transport", "work", "buses"], 2, T2_TEXT, None, None, T2_TEACHING),
        (
            AC_PROMPT,
            "ac_task1",
            "line",
            "topic_environment",
            ["water", "environment", "seasons"],
            2,
            (
                "The graph below shows water levels at two reservoirs between 2018 and 2023."
                "\n\nSummarise the information by selecting and reporting the main features, "
                "and make comparisons where relevant.\n\nWrite at least 150 words."
            ),
            {
                "kind": "line",
                "title": "Reservoir levels, 2018–2023",
                "unit": "% of capacity",
                "x_axis": {"label": "Year", "categories": ["2018", "2019", "2020", "2021", "2022", "2023"]},
                "y_axis": {"label": "% of capacity", "min": 0, "max": 100},
                "series": [
                    {"name": "Ashfield", "values": [72, 65, 74, 66, 73, 71]},
                    {"name": "Verdon", "values": [80, 71, 68, 59, 55, 48]},
                ],
            },
            None,
            AC_TEACHING,
        ),
        (BARE_PROMPT, "task2", "discussion", "topic_education", ["education"], 1, "A prompt from before the teaching layer.\n\nWrite at least 250 words.", None, None, None),
    ]
    with session_scope() as s:
        s.execute(sa_text("UPDATE writing_prompts SET retired = 1"))
        for topic in ("topic_transport", "topic_environment", "topic_education"):
            s.execute(
                sa_text(
                    "INSERT INTO topics (id, label, category) VALUES (:id, :label, 'general') "
                    "ON CONFLICT(id) DO NOTHING"
                ),
                {"id": topic, "label": topic.replace("topic_", "").title()},
            )
        for pid, task_type, genre, topic_id, tags, difficulty, text, chart, bullets, teaching in rows:
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
                    "topic": topic_id,
                    "tags": json.dumps(tags),
                    "diff": difficulty,
                    "text": text,
                    "chart": json.dumps(chart) if chart else None,
                    "bullets": json.dumps(bullets) if bullets else None,
                    "teaching": json.dumps(teaching) if teaching else None,
                },
            )


def submit_attempt(prompt_id: str, *, words: int = 260) -> str:
    """A submitted attempt on ``prompt_id`` — the thing that opens the gate."""
    from ulid import ULID

    from bandready.db import models as m
    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id

    attempt_id = f"wa_{ULID()}"
    essay = " ".join(["evening"] * words)
    with session_scope() as s:
        s.add(
            m.PracticeSession(
                id=attempt_id, profile_id=current_profile_id(s), module="writing",
                activity="task2", started_at="2026-01-01T09:00:00.000Z",
            )
        )
        s.add(
            m.WritingSubmission(
                id=attempt_id, prompt_id=prompt_id, mode="practice", status="submitted",
                essay_text=essay, outline_text="", word_count=words, seconds_elapsed=1500,
                overtime_seconds=0, paste_events=0, submitted_at="2026-01-01T09:40:00.000Z",
            )
        )
    return attempt_id


def teaching(client: TestClient, prompt_id: str, **params: Any) -> dict[str, Any]:
    response = client.get(f"/api/v1/writing/coach/prompts/{prompt_id}/teaching", params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ======================================================================================
# The gate
# ======================================================================================


def test_model_answers_are_withheld_before_any_attempt(client: TestClient) -> None:
    doc = teaching(client, T2_PROMPT)

    assert doc["gate"]["unlocked"] is False
    assert doc["gate"]["reason"] == "not_attempted"
    assert doc["model_answers"] == []
    assert doc["sentence_ladder"] is None
    assert doc["swap_slots"] == []
    assert doc["plan"]["trap"] is None
    assert doc["plan"]["trap_locked"] is True

    # The ladder's existence is still advertised so the UI can render a locked tab.
    assert doc["model_answer_bands"] == [6, 7, 8]
    assert doc["sentence_ladder_bands"] == [5, 6, 7, 8]

    # And nothing anywhere in the serialised document quotes the model.
    assert MODEL_ONLY not in json.dumps(doc)


def test_a_submitted_attempt_opens_the_gate(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    doc = teaching(client, T2_PROMPT)

    assert doc["gate"]["unlocked"] is True
    assert doc["gate"]["reason"] == "attempted"
    assert doc["gate"]["attempts"] == 1
    assert [a["band_target"] for a in doc["model_answers"]] == [6, 7, 8]
    assert [r["band"] for r in doc["sentence_ladder"]["rungs"]] == [5, 6, 7, 8]
    assert doc["swap_slots"][0]["span"] == MODEL_ONLY
    assert doc["plan"]["trap"]
    assert MODEL_ONLY in json.dumps(doc)


def test_a_draft_is_not_an_attempt(client: TestClient) -> None:
    """Opening the editor and switching tabs must not open the model."""
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
                id=attempt_id, prompt_id=T2_PROMPT, mode="practice", status="draft",
                essay_text="I think that " * 40, word_count=120,
            )
        )
    assert teaching(client, T2_PROMPT)["gate"]["unlocked"] is False


def test_a_stub_attempt_does_not_open_the_gate(client: TestClient) -> None:
    """Below the evaluator's own hard floor, nothing has been written."""
    from bandready.writing import coach

    submit_attempt(T2_PROMPT, words=coach.MIN_ATTEMPT_WORDS - 5)
    assert teaching(client, T2_PROMPT)["gate"]["unlocked"] is False


def test_the_client_may_attest_a_fresh_attempt(client: TestClient) -> None:
    doc = teaching(client, T2_PROMPT, attempted="true")
    assert doc["gate"]["reason"] == "client_attested"
    assert len(doc["model_answers"]) == 3


def test_the_gate_is_per_prompt(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    assert teaching(client, T2_PROMPT)["gate"]["unlocked"] is True
    assert teaching(client, AC_PROMPT)["gate"]["unlocked"] is False
    assert OVERVIEW_ONLY not in json.dumps(teaching(client, AC_PROMPT))


def test_the_overview_brief_is_gated_but_its_rules_are_not(client: TestClient) -> None:
    locked = teaching(client, AC_PROMPT)["overview_brief"]
    assert locked["locked"] is True
    assert locked["must_capture"] == []
    assert locked["model_overview"] is None
    assert locked["weak_overview"] is None
    assert locked["must_report"] == []
    # Rules about *how* to write an overview are not statements about this chart.
    assert locked["tense"]
    assert locked["figure_budget"] == {"min": 8, "max": 14}

    submit_attempt(AC_PROMPT, words=180)
    opened = teaching(client, AC_PROMPT)["overview_brief"]
    assert opened["locked"] is False
    assert OVERVIEW_ONLY in opened["must_capture"]
    assert opened["weak_overview"]["failure"] == "W3"
    assert opened["group_as"]["body1"]


# ======================================================================================
# Preparation material is never gated
# ======================================================================================


def test_preparation_material_is_available_before_the_attempt(client: TestClient) -> None:
    doc = teaching(client, T2_PROMPT)

    assert doc["gate"]["unlocked"] is False
    assert doc["band_move"]
    assert [m["move"] for m in doc["language_bank"]["moves"]] == ["conceding", "evaluating"]
    assert doc["language_bank"]["warning"]
    assert doc["collocations"][0]["chunk"] == "a case for"
    assert doc["error_watchlist"][0]["rank"] == 0
    assert doc["checklist"]
    assert doc["rewrite_focus"]["drill"]
    # The essay brief is arguments, not sentences — hiding it would leave the learner
    # practising ideation instead of language.
    assert len(doc["essay_brief"]["idea_bank"]) == 2
    assert doc["essay_brief"]["axis"] == 3


def test_every_authored_frame_carries_a_gap(client: TestClient) -> None:
    doc = teaching(client, T2_PROMPT)
    frames = [f for move in doc["language_bank"]["moves"] for f in move["frames"]]
    assert frames
    for frame in frames:
        assert "___" in frame["frame"]
        assert frame["slots"] >= 1


def test_annotations_resolve_to_offsets_in_their_own_text(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    doc = teaching(client, T2_PROMPT)
    for answer in doc["model_answers"]:
        for note in answer["annotations"]:
            assert note["start"] is not None, note
            assert answer["text"][note["start"] : note["end"]] == note["span"]


def test_a_prompt_with_no_teaching_payload_renders_empty(client: TestClient) -> None:
    doc = teaching(client, BARE_PROMPT)
    assert doc["teaching_available"] is False
    assert doc["model_answers"] == []
    assert doc["model_answer_bands"] == []
    assert doc["language_bank"] == {"warning": None, "moves": []}
    assert doc["essay_brief"] is None


def test_unknown_prompt_is_a_404(client: TestClient) -> None:
    assert client.get("/api/v1/writing/coach/prompts/nope/teaching").status_code == 404


# ======================================================================================
# The plan screen
# ======================================================================================


def test_plan_returns_the_procedure_and_withholds_the_trap(client: TestClient) -> None:
    response = client.get(f"/api/v1/writing/coach/plan/{T2_PROMPT}")
    assert response.status_code == 200, response.text
    plan = response.json()

    assert [p["phase"] for p in plan["time_plan"]] == ["decode", "plan", "write", "check"]
    assert plan["total_minutes"] == 40
    # The segmented timer bar's offsets are computed server-side, once.
    assert plan["time_plan"][0]["starts_at_s"] == 0
    assert plan["time_plan"][1]["starts_at_s"] == 120
    assert plan["time_plan"][-1]["ends_at_s"] == 2400

    assert [line["label"] for line in plan["plan"]["lines"]] == ["POSITION", "BODY 1", "BODY 2", "RISK"]
    assert all(len(line["note"]) <= 90 for line in plan["plan"]["lines"])
    assert plan["plan"]["test"]
    assert [p["role"] for p in plan["structure_plan"]] == ["introduction", "body", "body", "conclusion"]
    assert plan["word_budget"] == 290

    assert plan["post_submit"]["trap"] is None
    assert plan["post_submit"]["trap_locked"] is True
    assert "trap" not in plan["plan"]


def test_plan_releases_the_trap_after_an_attempt(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    plan = client.get(f"/api/v1/writing/coach/plan/{T2_PROMPT}").json()
    assert plan["post_submit"]["trap"]
    assert plan["post_submit"]["rewrite_focus"]["focus"]


def test_plan_404s_on_a_prompt_with_no_payload(client: TestClient) -> None:
    assert client.get(f"/api/v1/writing/coach/plan/{BARE_PROMPT}").status_code == 404


# ======================================================================================
# Language bank
# ======================================================================================


def test_language_bank_spans_the_pack_and_faceting_precedes_filtering(client: TestClient) -> None:
    response = client.get("/api/v1/writing/coach/language-bank")
    assert response.status_code == 200, response.text
    bank = response.json()

    assert bank["prompts"] == 2
    assert bank["facets"] == {"describing_trend": 1, "grouping": 1, "conceding": 1, "evaluating": 1}
    assert {item["prompt_id"] for item in bank["items"]} == {T2_PROMPT, AC_PROMPT}
    assert {c["chunk"] for c in bank["collocations"]} >= {"a case for", "a decline in"}


def test_language_bank_filters_by_move_and_task_type(client: TestClient) -> None:
    by_move = client.get("/api/v1/writing/coach/language-bank", params={"move": "grouping"}).json()
    assert [item["move"] for item in by_move["items"]] == ["grouping"]
    assert by_move["items"][0]["prompt_id"] == AC_PROMPT
    # Facets still describe the whole filtered pack, so the selector keeps its counts.
    assert by_move["facets"]["conceding"] == 1

    by_task = client.get("/api/v1/writing/coach/language-bank", params={"task_type": "task2"}).json()
    assert {item["prompt_id"] for item in by_task["items"]} == {T2_PROMPT}
    assert by_task["filters"]["task_type"] == "task2"


def test_language_bank_rejects_an_unknown_move(client: TestClient) -> None:
    response = client.get("/api/v1/writing/coach/language-bank", params={"move": "vibing"})
    assert response.status_code == 422


def test_language_bank_accepts_a_bare_topic(client: TestClient) -> None:
    bank = client.get("/api/v1/writing/coach/language-bank", params={"topic": "environment"}).json()
    assert bank["filters"]["topic_id"] == "topic_environment"
    assert {item["prompt_id"] for item in bank["items"]} == {AC_PROMPT}


# ======================================================================================
# Compare
# ======================================================================================

LEARNER_SCRIPT = (
    "I agree with this statement because buses are very important for the people. "
    "In my opinion the government should give more money to the bus company so that "
    "peoples which work at night can go home after their shift is finished. Firstly, "
    "the evening buses are useful. Secondly, the peak hour is also important but not "
    "more important than the night. In conclusion I agree with this statement totally."
)


def test_compare_is_locked_until_the_learner_has_written(client: TestClient) -> None:
    response = client.post(
        "/api/v1/writing/coach/compare",
        json={"prompt_id": T2_PROMPT, "script": "", "band_target": 7},
    )
    assert response.status_code in (409, 422), response.text


def test_compare_grounds_itself_in_this_prompts_payload(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    response = client.post(
        "/api/v1/writing/coach/compare",
        json={"prompt_id": T2_PROMPT, "script": LEARNER_SCRIPT, "band_target": 7},
    )
    assert response.status_code == 200, response.text
    result = response.json()

    assert result["band_target"] == 7
    assert result["model_answer"]["band_target"] == 7
    assert MODEL_ONLY in result["model_answer"]["text"]

    # In mock mode the LLM fixture knows nothing about this prompt, so what comes back is
    # the authored baseline — which is also the offline answer, and it is never wrong.
    assert {row["criterion"] for row in result["criteria"]} == {"ta", "cc", "lr"}
    assert all(row["criterion"] in ("ta", "cc", "lr", "gra") for row in result["criteria"])
    assert result["criteria"] == sorted(
        result["criteria"], key=lambda r: ["ta", "cc", "lr", "gra"].index(r["criterion"])
    )
    assert result["next_actions"]
    assert result["error_watchlist"][0]["pattern"] == "position drift"
    assert result["swap_slots"][0]["span"] == MODEL_ONLY


def test_compare_computes_unused_frames_by_string_match_not_by_the_model(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    result = client.post(
        "/api/v1/writing/coach/compare",
        json={"prompt_id": T2_PROMPT, "script": LEARNER_SCRIPT, "band_target": 7},
    ).json()
    unused = {item["frame"] for item in result["unused_language"]}
    # The learner reached for none of them, and every one comes back.
    assert "There is force in the claim that ___." in unused
    assert "The case for ___ holds only where ___." in unused

    from bandready.writing import coach

    reached = "There is force in the claim that peak capacity matters."
    remaining = coach.unused_language(
        reached,
        [
            {
                "move": "conceding",
                "grammar": "concessive clauses",
                "frames": [{"frame": "There is force in the claim that ___.", "slot_hint": None}],
            }
        ],
    )
    assert remaining == []


def test_compare_refuses_a_band_the_prompt_does_not_carry(client: TestClient) -> None:
    submit_attempt(T2_PROMPT)
    response = client.post(
        "/api/v1/writing/coach/compare",
        json={"prompt_id": T2_PROMPT, "script": LEARNER_SCRIPT, "band_target": 9},
    )
    assert response.status_code == 422
    assert "band_target" in response.json()["detail"]


def test_compare_can_read_the_script_from_an_attempt(client: TestClient) -> None:
    attempt_id = submit_attempt(T2_PROMPT)
    response = client.post(
        "/api/v1/writing/coach/compare", json={"attempt_id": attempt_id, "band_target": 6}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["prompt_id"] == T2_PROMPT
    assert result["attempt_id"] == attempt_id
    assert result["band_target"] == 6


def test_compare_refuses_a_prompt_with_no_models(client: TestClient) -> None:
    submit_attempt(BARE_PROMPT)
    response = client.post(
        "/api/v1/writing/coach/compare",
        json={"prompt_id": BARE_PROMPT, "script": LEARNER_SCRIPT, "band_target": 7},
    )
    assert response.status_code == 422
    assert "model answers" in response.json()["detail"]


# ======================================================================================
# Exam conditions, seen from the coach's side
# ======================================================================================


def test_exam_conditions_reports_an_open_coach_when_no_mock_is_running(client: TestClient) -> None:
    doc = client.get("/api/v1/writing/coach/exam-conditions").json()
    assert doc == {
        "active": False,
        "mock_id": None,
        "coaching_available": True,
        "withheld": [],
        "message": None,
    }
