"""Writing module tests: pre-checks, chart serialisation, quote anchoring, and the full
mock-mode submit → evaluate → report flow over HTTP.

Everything runs against a throwaway data dir with the hidden ``mock_llm`` preset selected
(``BANDREADY_ENABLE_MOCK=1``), so no network call happens and the evaluator's parser is
exercised against the real 05 §6.2-shaped fixture.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.scoring import writing as w

TOKEN = "test-token"

PROMPT_TEXT = (
    "Some people believe that governments should invest heavily in public transport, "
    "while others think individuals should be responsible for reducing their own car "
    "use.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 250 words."
)

# Contains, verbatim, the mock fixture's annotation quotes 1 and 3 plus both evidence
# quotes — but NOT "In nowadays", which must therefore end up `unanchored`.
ESSAY = """In recent decades many cities have struggled with traffic congestion and dirty air. Some people believe that the government must solve this problem, while others argue that individuals should change their own habits. In my opinion, both governments and individuals share this duty.

Firstly, the government should invest in public transport. When buses and trains are frequent, clean and affordable, commuters abandon their cars without being forced to. In my own city a new tram line reduced car journeys in the centre by almost a fifth in two years, which shows that good infrastructure changes behaviour faster than any advertising campaign. A goverment that refuses to spend on alternatives cannot reasonably ask drivers to give up the only option they have.

Secondly, individual choices still matter. Many peoples are agree with this opinion but continue to drive very short distances out of pure habit. Walking, cycling or sharing a car for a two-kilometre journey costs almost nothing and reduces emissions immediately. Employers can help by allowing staff to work from home for part of the week, and schools can organise walking groups so that parents do not need to drive at all.

However, individual effort alone is not enough. Without safe cycle lanes and reliable trains, even a motivated commuter has very little real choice, and blaming drivers quickly becomes a convenient way for politicians to avoid difficult spending decisions.

In conclusion, governments must build the alternatives and individuals must be willing to use them. Real progress in reducing traffic depends on the two sides working together rather than on either of them waiting for the other to act first."""

GROUPED_BAR = {
    "kind": "grouped_bar",
    "title": "Household spending by category in two countries, 2024",
    "unit": "% of household budget",
    "x_axis": {
        "label": "Category",
        "categories": ["Housing", "Food", "Transport", "Leisure", "Other"],
    },
    "y_axis": {"label": "% of budget", "min": 0, "max": 40},
    "series": [
        {"name": "Norland", "values": [31, 18, 14, 12, 25]},
        {"name": "Sudonia", "values": [22, 27, 10, 8, 33]},
    ],
}

PROCESS = {
    "kind": "process",
    "title": "How recycled glass bottles are made into new bottles",
    "steps": [
        {"id": "collect", "label": "Used bottles collected from banks", "next": ["sort"]},
        {"id": "sort", "label": "Sorted by colour", "next": ["melt"]},
        {"id": "melt", "label": "Melted in furnace", "next": []},
    ],
}


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    from bandready.config import reset_settings_cache

    data_dir = tmp_path_factory.mktemp("bandready-writing")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_HOST", "127.0.0.1")
        reset_settings_cache()
        db_engine.reset_engine()

        from bandready.server.app import create_app
        from bandready.settings_store import invalidate_cache, patch_settings

        invalidate_cache()
        app = create_app()
        # The auth middleware only accepts loopback Host headers, so the default
        # ``http://testserver`` base URL would be rejected outright.
        with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
            test_client.headers.update({"Authorization": f"Bearer {TOKEN}"})
            patch_settings(
                {
                    "llm": {
                        "preset": "mock_llm",
                        "base_url": "mock://llm",
                        "model": "mock-model-1",
                        "api_key": "",
                    }
                }
            )
            yield test_client
        db_engine.reset_engine()
        reset_settings_cache()
        invalidate_cache()


@pytest.fixture()
def prompt_id(client: TestClient) -> str:
    """A task-2 prompt inserted directly (the seed content pack is another agent's job)."""
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    new_id = f"wp_{ULID()}"
    with session_scope() as session:
        session.add(
            m.WritingPrompt(
                id=new_id,
                task_type="task2",
                genre="discussion",
                topic_tags=json.dumps(["environment", "transport"]),
                difficulty=2,
                prompt_text=PROMPT_TEXT,
                source="pack",
                license="CC-BY-4.0",
            )
        )
    return new_id


def wait_for_job(client: TestClient, job_id: str, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200, response.text
        job = response.json()
        if job["state"] in ("done", "error", "cancelled"):
            return job
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} never finished")


# --------------------------------------------------------------------------------------
# Word count + pre-checks (05 §3, §5)
# --------------------------------------------------------------------------------------

def test_count_words_rules() -> None:
    assert w.count_words("") == 0
    assert w.count_words("   ") == 0
    assert w.count_words("one two three") == 3
    assert w.count_words("state-of-the-art design") == 2  # hyphenated word counts once
    assert w.count_words("in 2024 about 31% rose") == 5   # numbers count
    assert w.count_words("hello —  world") == 2           # bare punctuation does not
    assert w.count_words(ESSAY) > 250


def test_prechecks_pass_on_a_full_on_topic_essay() -> None:
    checks = w.run_prechecks(ESSAY, task_type="task2", prompt_text=PROMPT_TEXT)
    assert w.precheck_verdict(checks) == "pass", checks
    assert w.blocking_checks(checks) == []


def test_prechecks_block_a_very_short_answer() -> None:
    checks = w.run_prechecks("Too short.", task_type="task2", prompt_text=PROMPT_TEXT)
    assert w.precheck_verdict(checks) == "block"
    blocks = w.blocking_checks(checks)
    assert [b["id"] for b in blocks] == ["hard_length_floor"]
    assert "250" in blocks[0]["message"]


def test_prechecks_block_gibberish() -> None:
    gibberish = " ".join(["zx9$%^" for _ in range(80)])
    checks = w.run_prechecks(gibberish, task_type="task2", prompt_text=PROMPT_TEXT)
    ids = {c["id"] for c in w.blocking_checks(checks)}
    assert "language_sanity" in ids


def test_prechecks_warn_when_under_length() -> None:
    short = " ".join(ESSAY.split()[:120])
    checks = w.run_prechecks(short, task_type="task2", prompt_text=PROMPT_TEXT)
    warns = {c["id"] for c in w.warning_checks(checks)}
    assert "minimum_words" in warns
    assert w.precheck_verdict(checks) == "warn"
    shortfall = next(c for c in checks if c["id"] == "minimum_words")["shortfall"]
    assert shortfall == 250 - w.count_words(short)


def test_prechecks_warn_when_off_topic() -> None:
    off_topic = (
        "My grandmother taught me to bake bread when I was seven years old. "
        "She measured flour by eye, kneaded dough on a wooden board, and never once "
        "used a recipe book. The kitchen smelled of yeast every Sunday morning and my "
        "cousins would arrive early to steal the first slice while it was still hot. "
    ) * 4
    checks = w.run_prechecks(off_topic, task_type="task2", prompt_text=PROMPT_TEXT)
    warns = {c["id"] for c in w.warning_checks(checks)}
    assert "off_topic" in warns


def test_prechecks_warn_when_the_prompt_is_copied() -> None:
    copied = PROMPT_TEXT + " " + ESSAY
    checks = w.run_prechecks(copied, task_type="task2", prompt_text=PROMPT_TEXT)
    copy_check = next(c for c in checks if c["id"] == "prompt_copy")
    assert copy_check["level"] == "warn"
    assert copy_check["copied_words"] >= 20


def test_longest_common_run_and_jaccard() -> None:
    assert w.longest_common_run("a b c d".split(), "x a b c y".split()) == 3
    assert w.longest_common_run([], ["a"]) == 0
    assert w.jaccard(set(), {"a"}) == 0.0
    assert w.jaccard({"a", "b"}, {"a", "b"}) == 1.0


# --------------------------------------------------------------------------------------
# Chart specs (05 §2.2)
# --------------------------------------------------------------------------------------

def test_chart_to_text_grouped_bar_is_deterministic() -> None:
    summary = w.chart_to_text(GROUPED_BAR)
    assert summary == w.chart_to_text(json.dumps(GROUPED_BAR))
    assert summary.startswith(
        "Grouped bar chart: Household spending by category in two countries, 2024 "
        "(units: % of household budget)"
    )
    assert "Norland: Housing 31, Food 18, Transport 14, Leisure 12, Other 25" in summary
    assert "Sudonia: Housing 22" in summary
    assert "Vertical axis: % of budget from 0 to 40" in summary


def test_chart_to_text_process_lists_stages_in_order() -> None:
    summary = w.chart_to_text(PROCESS)
    assert "Stage 1: Used bottles collected from banks → Sorted by colour" in summary
    assert summary.rstrip().endswith("(final stage)")


def test_chart_to_text_tolerates_rubbish() -> None:
    assert w.chart_to_text(None) == ""
    assert w.chart_to_text("not json") == ""
    assert w.chart_to_text({"kind": "bar"}).startswith("Bar chart:")


def test_validate_chart_spec_accepts_the_doc_example() -> None:
    spec = w.validate_chart_spec(GROUPED_BAR)
    assert spec["series"][1]["values"] == [22, 27, 10, 8, 33]
    assert spec["y_axis"]["max"] == 40


@pytest.mark.parametrize(
    "bad",
    [
        {"title": "no kind"},
        {"kind": "sunburst", "title": "unsupported"},
        {"kind": "bar", "title": ""},
        {"kind": "bar", "title": "no series"},
        {"kind": "table", "title": "header only", "rows": [["a", "b"]]},
        {"kind": "process", "title": "one step", "steps": [{"id": "a", "label": "A"}]},
        {"kind": "map", "title": "one snapshot", "snapshots": [{"label": "before",
                                                                "features": []}]},
        {
            "kind": "bar",
            "title": "value/category mismatch",
            "x_axis": {"categories": ["a", "b", "c"]},
            "series": [{"name": "s", "values": [1, 2]}],
        },
    ],
)
def test_validate_chart_spec_rejects_broken_specs(bad: dict) -> None:
    with pytest.raises(ValueError):
        w.validate_chart_spec(bad)


def test_validate_chart_spec_clamps_series_and_categories() -> None:
    spec = w.validate_chart_spec(
        {
            "kind": "line",
            "title": "many",
            "x_axis": {"categories": [f"c{i}" for i in range(20)]},
            "series": [
                {"name": f"s{i}", "values": [float(i)] * 20} for i in range(8)
            ],
        }
    )
    assert len(spec["series"]) == w.MAX_SERIES
    assert len(spec["x_axis"]["categories"]) == w.MAX_CATEGORIES
    assert all(len(s["values"]) == w.MAX_CATEGORIES for s in spec["series"])


# --------------------------------------------------------------------------------------
# Quote anchoring (05 §7)
# --------------------------------------------------------------------------------------

def test_anchoring_exact_matches_carry_offsets() -> None:
    text = "The goverment should act now."
    annotations, unanchored = w.resolve_annotations(
        text, [{"quote": "goverment", "type": "spelling", "fix": "government",
                "explanation": "Missing an n."}]
    )
    assert unanchored == []
    hit = annotations[0]
    assert text[hit["start"]: hit["end"]] == "goverment"
    assert hit["type"] == "spelling"


def test_anchoring_duplicate_quotes_take_successive_occurrences() -> None:
    text = "I am agree. Later I am agree again."
    quote = {"quote": "I am agree", "type": "grammar", "fix": "I agree", "explanation": "x"}
    annotations, unanchored = w.resolve_annotations(text, [dict(quote), dict(quote)])
    assert unanchored == []
    assert [a["start"] for a in annotations] == [0, text.index("I am agree", 1)]
    assert all(text[a["start"]: a["end"]] == "I am agree" for a in annotations)


def test_anchoring_falls_back_to_whitespace_and_case_normalisation() -> None:
    text = "Many\n  peoples  are   Agree with this."
    annotations, unanchored = w.resolve_annotations(
        text, [{"quote": "peoples are agree", "type": "grammar", "fix": "people agree",
                "explanation": "x"}]
    )
    assert unanchored == []
    hit = annotations[0]
    # The quote is rewritten to the learner's exact characters, not the model's version.
    assert text[hit["start"]: hit["end"]] == hit["quote"] == "peoples  are   Agree"


def test_anchoring_handles_curly_quote_variants() -> None:
    text = "The child’s bag was lost."
    annotations, unanchored = w.resolve_annotations(
        text, [{"quote": "child's bag", "type": "punctuation", "fix": "child's bag",
                "explanation": "x"}]
    )
    assert unanchored == []
    assert annotations[0]["quote"] == "child’s bag"


def test_unresolvable_quotes_are_never_guessed() -> None:
    text = "A perfectly clean sentence."
    annotations, unanchored = w.resolve_annotations(
        text,
        [
            {"quote": "a paraphrase the model invented", "type": "grammar",
             "fix": "-", "explanation": "x"},
            {"quote": "clean sentence", "type": "vocabulary", "fix": "tidy sentence",
             "explanation": "y"},
            {"quote": "", "type": "grammar", "fix": "", "explanation": "dropped"},
        ],
    )
    assert [a["quote"] for a in annotations] == ["clean sentence"]
    assert [u["quote"] for u in unanchored] == ["a paraphrase the model invented"]
    assert "start" not in unanchored[0]


def test_overlapping_annotations_demote_the_loser() -> None:
    text = "peoples are agree with this opinion today."
    annotations, unanchored = w.resolve_annotations(
        text,
        [
            {"quote": "peoples are agree with this opinion", "type": "grammar",
             "fix": "people agree with this opinion", "explanation": "x"},
            {"quote": "are agree", "type": "grammar", "fix": "agree", "explanation": "y"},
        ],
    )
    assert len(annotations) == 1
    assert annotations[0]["quote"] == "peoples are agree with this opinion"
    assert unanchored[0]["quote"] == "are agree"


def test_annotations_are_sorted_and_types_normalised() -> None:
    text = "First mistake here, second mistake there."
    annotations, _ = w.resolve_annotations(
        text,
        [
            {"quote": "second mistake", "type": "COHESION", "fix": "-", "explanation": "b"},
            {"quote": "First mistake", "type": "not-a-type", "fix": "-", "explanation": "a"},
        ],
    )
    assert [a["quote"] for a in annotations] == ["First mistake", "second mistake"]
    assert [a["type"] for a in annotations] == ["grammar", "cohesion"]


def test_resolve_quotes_reports_missing_evidence() -> None:
    found, missing = w.resolve_quotes(ESSAY, [
        "Firstly, the government should invest in public transport.",
        "a quote that is not in the essay",
    ])
    assert len(found) == 1
    assert ESSAY[found[0]["start"]: found[0]["end"]] == found[0]["quote"]
    assert missing == ["a quote that is not in the essay"]


# --------------------------------------------------------------------------------------
# Prompt rendering + response parsing (05 §6)
# --------------------------------------------------------------------------------------

def test_build_eval_messages_matches_the_doc_template() -> None:
    messages = w.build_eval_messages(
        task_type="task2",
        genre="discussion",
        prompt_text=PROMPT_TEXT,
        essay_text=ESSAY,
        word_count=270,
        minutes_taken=38,
        under_length=False,
    )
    assert [msg["role"] for msg in messages] == ["system", "user"]
    assert messages[1]["content"] == "Evaluate now."
    system = messages[0]["content"]
    assert system.startswith("You are a strict, experienced IELTS writing examiner.")
    assert "- Task type: Writing Task 2 (essay)" in system
    assert "Minimum words: 250. Candidate wrote 270 words\n  in 38 minutes." in system
    assert "<<<ANSWER" in system and "ANSWER>>>" in system
    assert system.index("<<<ANSWER") < system.index(ESSAY) < system.index("ANSWER>>>")
    assert "1. Task Response — does it fully answer every part of the task?" in system
    assert "clear position/response maintained throughout" in system
    assert "STRICT JSON only" in system
    assert "UNDER LENGTH" not in system


def test_build_eval_messages_task1_context_blocks() -> None:
    messages = w.build_eval_messages(
        task_type="ac_task1",
        genre="grouped_bar",
        prompt_text="Summarise the information.",
        essay_text="short answer",
        word_count=90,
        minutes_taken=22,
        chart_summary=w.chart_to_text(GROUPED_BAR),
        overtime_seconds=120,
        under_length=True,
        prompt_copied=True,
        copied_words=24,
        outline_text="intro, overview, details",
    )
    system = messages[0]["content"]
    assert "1. Task Achievement" in system
    assert "Penalise\n   invented or wrong figures." in system
    assert "Norland: Housing 31" in system
    assert "(2 minutes over the limit)" in system
    assert "The response is UNDER LENGTH" in system
    assert "copied 24 consecutive words" in system
    assert "planning notes" in system


def test_build_eval_messages_letter_bullets_and_register() -> None:
    system = w.build_eval_messages(
        task_type="gt_task1",
        genre="semi_formal",
        prompt_text="Write a letter.",
        essay_text="Dear Mr Ali,",
        word_count=160,
        minutes_taken=19,
        letter_bullets=["explain the problem", "describe the damage", "say what you want"],
    )[0]["content"]
    assert "Required bullet points the letter must cover:" in system
    assert "* describe the damage" in system
    assert "Is the register consistently semi-formal?" in system


def test_parse_evaluation_recomputes_the_overall_band_server_side() -> None:
    from bandready.providers.llm import mock_fixture

    raw = mock_fixture("writing_eval")
    raw["overall_band"] = 9.0  # the model's own arithmetic must be ignored
    raw["criteria"]["task_achievement"]["band"] = 7
    parsed = w.parse_evaluation(raw, ESSAY)
    assert parsed["bands"] == {"ta": 7, "cc": 6, "lr": 6, "gra": 6}
    assert parsed["overall_band"] == 6.5      # mean 6.25 -> ties up
    assert parsed["model_overall_band"] == 9.0


def test_parse_evaluation_anchors_the_fixture_and_keeps_the_rest_unanchored() -> None:
    from bandready.providers.llm import mock_fixture

    parsed = w.parse_evaluation(mock_fixture("writing_eval"), ESSAY)
    anchored = {a["quote"] for a in parsed["annotations"]}
    assert "peoples are agree with this opinion" in anchored
    assert "goverment" in anchored
    assert [u["quote"] for u in parsed["unanchored"]] == ["In nowadays"]
    for annotation in parsed["annotations"]:
        assert ESSAY[annotation["start"]: annotation["end"]] == annotation["quote"]
    ta = parsed["criteria"]["ta"]
    assert ta["wire"] == "task_achievement"
    assert ta["evidence_ranges"] and ta["unanchored_quotes"] == []
    assert parsed["structure_analysis"]["paragraphs"][0]["role"] == "introduction"
    assert parsed["model_answer_outline"]
    assert any(v["better"] == "pressing issue" for v in parsed["vocab_upgrades"])


def test_parse_evaluation_clamps_out_of_range_criterion_bands() -> None:
    from bandready.providers.llm import mock_fixture

    raw = mock_fixture("writing_eval")
    raw["criteria"]["task_achievement"]["band"] = 42
    raw["criteria"]["lexical_resource"]["band"] = -3
    parsed = w.parse_evaluation(raw, ESSAY)
    assert parsed["bands"]["ta"] == 9
    assert parsed["bands"]["lr"] == 1


@pytest.mark.parametrize("mutate", ["no_criteria", "missing_criterion", "no_band"])
def test_parse_evaluation_rejects_unusable_responses(mutate: str) -> None:
    from bandready.providers.llm import mock_fixture

    raw = mock_fixture("writing_eval")
    if mutate == "no_criteria":
        raw.pop("criteria")
    elif mutate == "missing_criterion":
        raw["criteria"].pop("lexical_resource")
    else:
        raw["criteria"]["coherence_cohesion"].pop("band")
    with pytest.raises(ValueError):
        w.parse_evaluation(raw, ESSAY)


def test_vocab_suggestions_dedupe_and_carry_the_source() -> None:
    from bandready.providers.llm import mock_fixture

    parsed = w.parse_evaluation(mock_fixture("writing_eval"), ESSAY)
    items = w.vocab_suggestions(parsed, "wa_test")
    terms = [item["term"] for item in items]
    assert len(terms) == len({t.lower() for t in terms})
    assert items[0]["source"] == {"kind": "writing", "item_id": "wa_test"}


# --------------------------------------------------------------------------------------
# HTTP surface
# --------------------------------------------------------------------------------------

def test_auth_is_required(client: TestClient) -> None:
    response = client.get("/api/v1/writing/prompts", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_prompt_bank_listing_and_filters(client: TestClient, prompt_id: str) -> None:
    response = client.get("/api/v1/writing/prompts", params={"task_type": "task2"})
    assert response.status_code == 200
    body = response.json()
    ids = [item["id"] for item in body["items"]]
    assert prompt_id in ids
    item = next(i for i in body["items"] if i["id"] == prompt_id)
    assert item["min_words"] == 250
    assert item["time_limit_s"] == 2400
    assert item["topic_tags"] == ["environment", "transport"]

    assert client.get(
        "/api/v1/writing/prompts", params={"task_type": "ac_task1"}
    ).json()["items"] == []
    assert prompt_id in [
        i["id"]
        for i in client.get(
            "/api/v1/writing/prompts", params={"variant": "discussion", "q": "public transport"}
        ).json()["items"]
    ]
    assert client.get(
        "/api/v1/writing/prompts", params={"task_type": "nonsense"}
    ).status_code == 422


def test_get_prompt_404(client: TestClient) -> None:
    response = client.get("/api/v1/writing/prompts/wp_missing")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_templates_and_rubrics(client: TestClient) -> None:
    templates = client.get("/api/v1/writing/templates").json()
    assert len(templates) >= 4
    skeletons = client.get(
        "/api/v1/writing/templates", params={"category": "task2_skeleton"}
    ).json()
    assert skeletons and all(t["category"] == "task2_skeleton" for t in skeletons)

    rubrics = client.get("/api/v1/writing/rubrics", params={"task_type": "task2"}).json()
    assert rubrics["criteria"][0]["label"] == "Task Response"
    assert rubrics["criteria"][0]["descriptors"]["6"]


def test_full_submit_evaluate_report_flow(client: TestClient, prompt_id: str) -> None:
    created = client.post(
        "/api/v1/writing/attempts", json={"prompt_id": prompt_id, "mode": "exam"}
    )
    assert created.status_code == 201, created.text
    attempt_id = created.json()["attempt_id"]
    assert attempt_id.startswith("wa_")
    assert created.json()["status"] == "draft"
    assert created.json()["time_limit_s"] == 2400

    # autosave, including the overtime clock and the paste flag
    patched = client.patch(
        f"/api/v1/writing/attempts/{attempt_id}",
        json={
            "essay_text": ESSAY,
            "outline_text": "intro / gov / individuals / conclusion",
            "seconds_elapsed": 2520,
            "paste_events": 1,
            "last_paste_words": 60,
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["word_count"] == w.count_words(ESSAY)
    assert patched.json()["overtime_seconds"] == 120
    assert patched.json()["integrity_flag"] == "pasted"

    precheck = client.get(f"/api/v1/writing/attempts/{attempt_id}/precheck").json()
    assert precheck["verdict"] == "pass"
    assert precheck["min_words"] == 250

    submitted = client.post(f"/api/v1/writing/attempts/{attempt_id}/submit", json={})
    assert submitted.status_code == 202, submitted.text
    assert submitted.headers["Location"].endswith(submitted.json()["job_id"])
    job = wait_for_job(client, submitted.json()["job_id"])
    assert job["state"] == "done", job
    assert job["kind"] == "writing_eval"
    assert job["result"] == {"attempt_id": attempt_id}
    assert job["progress_pct"] == 100

    report = client.get(f"/api/v1/writing/attempts/{attempt_id}").json()
    assert report["status"] == "scored"
    assert report["overall_band"] == 6.0            # fixture is 6/6/6/6
    evaluation = report["evaluation"]
    assert evaluation["overall_band"] == 6.0
    assert evaluation["bands"] == {"ta": 6.0, "cc": 6.0, "lr": 6.0, "gra": 6.0}
    assert evaluation["prompt_version"] == w.WRITING_EVAL_PROMPT_VERSION
    assert evaluation["criteria"]["cc"]["comment"]
    assert [u["quote"] for u in evaluation["unanchored"]] == ["In nowadays"]
    for annotation in evaluation["annotations"]:
        assert ESSAY[annotation["start"]: annotation["end"]] == annotation["quote"]
    assert evaluation["structure_analysis"]["summary"]
    assert evaluation["vocab_suggestions"][0]["source"]["kind"] == "writing"
    assert any(c["id"] == "prompt_copy" for c in evaluation["prechecks"])
    assert report["prompt"]["id"] == prompt_id

    # audit trail
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as session:
        rows = (
            session.query(m.LlmEvaluation)
            .filter(m.LlmEvaluation.subject_id == attempt_id)
            .all()
        )
        assert [r.status for r in rows] == ["ok"]
        assert rows[0].subject_kind == "writing_submission"
        assert rows[0].purpose == "score"
        assert rows[0].prompt_version == w.WRITING_EVAL_PROMPT_VERSION
        assert rows[0].temperature == pytest.approx(0.2)
        assert rows[0].overall_band == 6.0
        envelope = session.get(m.PracticeSession, attempt_id)
        assert envelope.module == "writing"
        assert json.loads(envelope.summary_json)["overall_band"] == 6.0

    # a scored attempt cannot be resubmitted or edited
    assert client.post(f"/api/v1/writing/attempts/{attempt_id}/submit").status_code == 409
    assert client.patch(
        f"/api/v1/writing/attempts/{attempt_id}", json={"essay_text": "x"}
    ).status_code == 409

    # …but it can be rewritten, and the child carries the lineage for the diff view
    rewritten = client.post(
        f"/api/v1/writing/attempts/{attempt_id}/rewrite", json={"prefill": True}
    )
    assert rewritten.status_code == 201, rewritten.text
    child = rewritten.json()
    assert child["parent_attempt_id"] == attempt_id
    assert child["mode"] == "practice"
    assert child["essay_text"] == ESSAY
    assert child["parent"]["overall_band"] == 6.0
    assert child["parent"]["annotations"]

    blank = client.post(
        f"/api/v1/writing/attempts/{attempt_id}/rewrite", json={"prefill": False}
    ).json()
    assert blank["essay_text"] == ""
    assert blank["word_count"] == 0

    # history, newest first, filterable by prompt
    history = client.get(
        "/api/v1/writing/attempts", params={"prompt_id": prompt_id}
    ).json()
    ids = [item["id"] for item in history["items"]]
    assert attempt_id in ids
    assert ids == sorted(ids, reverse=True)
    assert history["items"][0]["prompt"]["task_type"] == "task2"

    # the /submissions alias serves the same resource
    alias = client.get(f"/api/v1/writing/submissions/{attempt_id}")
    assert alias.status_code == 200
    assert alias.json()["id"] == attempt_id


def test_submit_blocks_a_too_short_draft(client: TestClient, prompt_id: str) -> None:
    attempt_id = client.post(
        "/api/v1/writing/attempts", json={"prompt_id": prompt_id, "mode": "practice"}
    ).json()["attempt_id"]
    client.patch(
        f"/api/v1/writing/attempts/{attempt_id}", json={"essay_text": "Barely anything."}
    )
    precheck = client.get(f"/api/v1/writing/attempts/{attempt_id}/precheck").json()
    assert precheck["verdict"] == "block"

    response = client.post(f"/api/v1/writing/attempts/{attempt_id}/submit")
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert "Too short" in response.json()["detail"]

    # still a draft: nothing was scored, no tokens were spent
    assert client.get(f"/api/v1/writing/attempts/{attempt_id}").json()["status"] == "draft"


def test_submit_reports_warnings_but_still_scores(client: TestClient, prompt_id: str) -> None:
    attempt_id = client.post(
        "/api/v1/writing/attempts", json={"prompt_id": prompt_id, "mode": "practice"}
    ).json()["attempt_id"]
    short = " ".join(ESSAY.split()[:120])
    client.patch(f"/api/v1/writing/attempts/{attempt_id}", json={"essay_text": short})
    submitted = client.post(
        f"/api/v1/writing/attempts/{attempt_id}/submit",
        json={"acknowledge_warnings": True},
    )
    assert submitted.status_code == 202
    assert [wn["id"] for wn in submitted.json()["warnings"]] == ["minimum_words"]
    assert submitted.json()["acknowledged"] is True
    job = wait_for_job(client, submitted.json()["job_id"])
    assert job["state"] == "done", job
    report = client.get(f"/api/v1/writing/attempts/{attempt_id}").json()
    assert report["status"] == "scored"
    under = next(c for c in report["evaluation"]["prechecks"] if c["id"] == "minimum_words")
    assert under["level"] == "warn"


def test_attempt_404s(client: TestClient) -> None:
    assert client.get("/api/v1/writing/attempts/wa_missing").status_code == 404
    assert client.patch(
        "/api/v1/writing/attempts/wa_missing", json={"essay_text": "x"}
    ).status_code == 404
    assert client.post("/api/v1/writing/attempts/wa_missing/submit").status_code == 404
    assert client.post(
        "/api/v1/writing/attempts", json={"prompt_id": "wp_missing", "mode": "practice"}
    ).status_code == 404


def test_model_answer_job_then_cache_hit(client: TestClient, prompt_id: str) -> None:
    first = client.post(
        f"/api/v1/writing/prompts/{prompt_id}/model-answer", json={"band": 8}
    )
    assert first.status_code == 202, first.text
    job = wait_for_job(client, first.json()["job_id"])
    assert job["state"] == "done", job
    assert job["result"]["band"] == 8
    assert job["result"]["text"]
    assert job["result"]["banner"] == (
        "AI-generated exemplar at approximately Band 8. Not an official IELTS sample."
    )

    second = client.post(
        f"/api/v1/writing/prompts/{prompt_id}/model-answer", json={"band": 8}
    )
    assert second.status_code == 200
    assert second.json()["cached"] is True
    assert second.json()["text"] == job["result"]["text"]

    # the attempt-scoped variant resolves the prompt itself
    attempt_id = client.post(
        "/api/v1/writing/attempts", json={"prompt_id": prompt_id, "mode": "practice"}
    ).json()["attempt_id"]
    via_attempt = client.get(
        f"/api/v1/writing/attempts/{attempt_id}/model-answer", params={"band": 8}
    )
    assert via_attempt.status_code == 200
    assert via_attempt.json()["cached"] is True

    assert client.post(
        f"/api/v1/writing/prompts/{prompt_id}/model-answer", json={"band": 5}
    ).status_code == 422


def test_prompt_generation_job_saves_a_usable_prompt(client: TestClient) -> None:
    response = client.post(
        "/api/v1/writing/prompts/generate", json={"task_type": "ac_task1"}
    )
    assert response.status_code == 202, response.text
    job = wait_for_job(client, response.json()["job_id"])
    assert job["state"] == "done", job
    new_id = job["result"]["prompt_id"]

    prompt = client.get(f"/api/v1/writing/prompts/{new_id}").json()
    assert prompt["task_type"] == "ac_task1"
    assert prompt["source"] == "generated"
    assert prompt["chart_spec"]["kind"] in w.CHART_KINDS
    assert w.chart_to_text(prompt["chart_spec"])
    assert prompt["min_words"] == 150

    letter_job = wait_for_job(
        client,
        client.post(
            "/api/v1/writing/prompts/generate", json={"task_type": "gt_task1"}
        ).json()["job_id"],
    )
    letter = client.get(f"/api/v1/writing/prompts/{letter_job['result']['prompt_id']}").json()
    assert len(letter["letter_bullets"]) == 3

    assert client.post(
        "/api/v1/writing/prompts/generate", json={"task_type": "speaking"}
    ).status_code == 422


def test_evaluation_failure_marks_the_attempt_failed(
    client: TestClient, prompt_id: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from bandready.server.errors import ApiError

    attempt_id = client.post(
        "/api/v1/writing/attempts", json={"prompt_id": prompt_id, "mode": "practice"}
    ).json()["attempt_id"]
    client.patch(f"/api/v1/writing/attempts/{attempt_id}", json={"essay_text": ESSAY})

    async def boom(*_args: object, **_kwargs: object) -> dict:
        raise ApiError(502, "provider_error", "the model is on fire")

    monkeypatch.setattr(w, "chat_json", boom)
    job = wait_for_job(
        client,
        client.post(f"/api/v1/writing/attempts/{attempt_id}/submit").json()["job_id"],
    )
    assert job["state"] == "error"
    assert job["error"]["code"] == "provider_error"

    report = client.get(f"/api/v1/writing/attempts/{attempt_id}").json()
    assert report["status"] == "failed"
    assert report["evaluation"] is None

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as session:
        row = (
            session.query(m.LlmEvaluation)
            .filter(m.LlmEvaluation.subject_id == attempt_id)
            .one()
        )
        assert row.status == "api_failed"
        assert "on fire" in row.raw_response

    # a failed attempt is editable again, so the learner can retry
    assert client.patch(
        f"/api/v1/writing/attempts/{attempt_id}", json={"seconds_elapsed": 10}
    ).status_code == 200
