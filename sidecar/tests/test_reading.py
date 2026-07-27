"""Reading module tests: the band tables, the marker, and the full attempt lifecycle.

Everything runs against a throwaway data dir with the hidden mock LLM preset selected, so no
network is touched and the generation pipeline is exercised end to end.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope
from bandready.server.routes.reading import (
    ACADEMIC_BAND_TABLE,
    GT_BAND_TABLE,
    raw_to_band,
    scaled_raw,
)

# --------------------------------------------------------------------------------------
# A hand-authored passage: 8 questions covering four types and every scoring rule
# --------------------------------------------------------------------------------------

PARAGRAPHS = [
    {
        "id": "A",
        "text": (
            "For more than a millennium before the age of European expansion, ships carried "
            "cargo along the monsoon corridors of the Indian Ocean. Goods sealed in ceramic "
            "jars survived centuries underwater, and 1,500 wrecks have now been catalogued."
        ),
    },
    {
        "id": "B",
        "text": (
            "Archaeological evidence from shipwrecks off the coast of Java suggests the trade "
            "peaked around the year 1892 in tonnage terms, although the effect varies with the "
            "size of the harbour surveyed. Roughly 20 percent of hulls were built locally."
        ),
    },
    {
        "id": "C",
        "text": (
            "In the writer's view the network deserves the name it has been given, because the "
            "well-being of coastal towns depended on it. The town centre of each port grew "
            "around a customs house rather than a temple."
        ),
    },
]

QUESTION_GROUPS: list[dict[str, Any]] = [
    {
        "id": "g1",
        "type": "true_false_not_given",
        "instructions_extra": None,
        "word_limit": None,
        "allow_reuse": True,
        "options": None,
        "layout": None,
        "teaching": {
            "schema_version": 1,
            "answer_order": "sequential",
            "section_scope": None,
            "strategy": "Match the statement against one sentence, never against the gist.",
            "order_note": "In passage order.",
            "time_budget_s": 240,
            "watch_out": None,
        },
        "questions": [
            {
                "number": 1,
                "prompt": "Cargo was carried along the monsoon corridors before Europeans came.",
                "answers": [{"value": "true"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "ships carried cargo along the monsoon corridors",
                "explanation": "Paragraph A states this directly.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.0,
                # The authored teaching payload (staging-reading/DESIGN.md §1). It is a
                # key by another name — `text_phrase` quotes the deciding words — so the
                # exam payload must strip it and only the review may release it.
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "before Europeans came",
                        "text_phrase": "long before European ships",
                        "devices": ["synonym"],
                        "note": None,
                    },
                    "decision_rule": "The passage dates the corridors earlier than the arrival.",
                    "distractors": [],
                    "reusable_rule": "A date claim is decided by the earlier of the two dates.",
                    "traps": ["absence_read_as_contradiction"],
                    "gear": "scan",
                },
            },
            {
                "number": 2,
                "prompt": "The trade's effect was the same in every harbour surveyed.",
                "answers": [{"value": "false"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "the effect varies with the size of the harbour surveyed",
                "explanation": "'Varies' contradicts 'the same in every harbour'.",
                "trap_note": "Scope/quantifier shift: 'every' versus 'varies'.",
                "difficulty": "medium",
                "band_target": 6.5,
            },
            {
                "number": 3,
                "prompt": "Java's shipyards employed more workers than Sumatra's.",
                "answers": [{"value": "not given"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "Roughly 20 percent of hulls were built locally",
                "explanation": "The passage never compares the two islands' workforces.",
                "trap_note": "Absence read as contradiction.",
                "difficulty": "hard",
                "band_target": 7.0,
            },
        ],
    },
    {
        "id": "g2",
        "type": "sentence_completion",
        "instructions_extra": None,
        "word_limit": {"max_words": 2, "numbers_allowed": True},
        "allow_reuse": False,
        "options": None,
        "layout": None,
        "questions": [
            {
                "number": 4,
                "prompt": "Cargoes were sealed inside {{gap}} to protect them from seawater.",
                "answers": [{"value": "ceramic jars"}, {"value": "ceramic jar"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "Goods sealed in ceramic jars survived centuries underwater",
                "explanation": "'Protect them from seawater' paraphrases 'survived underwater'.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.5,
            },
            {
                "number": 5,
                "prompt": "The number of catalogued wrecks is {{gap}}.",
                "answers": [{"value": "1500"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "1,500 wrecks have now been catalogued",
                "explanation": "The figure appears verbatim in paragraph A.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.0,
            },
            {
                "number": 6,
                "prompt": "Coastal towns depended on the network for their {{gap}}.",
                "answers": [{"value": "well-being"}],
                "anchor_paragraphs": ["C"],
                "evidence_quote": "the well-being of coastal towns depended on it",
                "explanation": "The compound appears verbatim in paragraph C.",
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 6.0,
            },
        ],
    },
    {
        "id": "g3",
        "type": "matching_headings",
        "instructions_extra": None,
        "word_limit": None,
        "allow_reuse": False,
        "options": [
            {"key": "i", "text": "Evidence preserved beneath the waves"},
            {"key": "ii", "text": "A network worth its name"},
            {"key": "iii", "text": "The decline of a trading network"},
        ],
        "layout": None,
        "questions": [
            {
                "number": 7,
                "prompt": "Paragraph B",
                "answers": [{"value": "i"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "Archaeological evidence from shipwrecks off the coast of Java",
                "explanation": "Paragraph B is about underwater evidence.",
                "trap_note": "Heading iii is a trap: decline is never discussed.",
                "difficulty": "medium",
                "band_target": 6.5,
            },
            {
                "number": 8,
                "prompt": "Paragraph C",
                "answers": [{"value": "ii"}],
                "anchor_paragraphs": ["C"],
                "evidence_quote": "the network deserves the name it has been given",
                "explanation": "Paragraph C argues the name is deserved.",
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 7.0,
            },
        ],
    },
]


def build_passage(passage_id: str, title: str) -> dict[str, Any]:
    return {
        "id": passage_id,
        "position": 1,
        "title": title,
        "topic": "maritime trade history",
        "word_count": sum(len(p["text"].split()) for p in PARAGRAPHS),
        "difficulty": "medium",
        "gt_section": None,
        "texts": [{"id": "t1", "heading": None, "paragraphs": PARAGRAPHS}],
        "teaching": {
            "schema_version": 1,
            "time_budget_min": 20,
            "skim_plan": {"kind": "paragraph_map", "budget_s": 120, "map": []},
        },
        "question_groups": json.loads(json.dumps(QUESTION_GROUPS)),
    }


def seed_passage(session, fmt: str = "academic", title: str = "Seeded Passage") -> str:
    passage_id = f"rp_{ULID()}"
    doc = build_passage(passage_id, title)
    session.add(
        m.ReadingPassage(
            id=passage_id,
            format=fmt,
            title=title,
            word_count=int(doc["word_count"]),
            band_target=7.0,
            passage_json=json.dumps(doc),
            source="pack",
            license="CC-BY-4.0",
        )
    )
    for group_index, group in enumerate(doc["question_groups"]):
        limit = group.get("word_limit")
        for question in group["questions"]:
            session.add(
                m.ReadingQuestion(
                    id=f"rq_{ULID()}",
                    passage_id=passage_id,
                    number=question["number"],
                    group_index=group_index,
                    qtype=group["type"],
                    word_limit=limit["max_words"] if limit else None,
                    answers_json=json.dumps(question["answers"]),
                    anchor_paragraphs_json=json.dumps(question["anchor_paragraphs"]),
                    evidence_quote=question["evidence_quote"],
                    explanation=question["explanation"],
                    trap_note=question["trap_note"],
                )
            )
    session.flush()
    return passage_id


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def app_client(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    data_dir = tmp_path_factory.mktemp("bandready-reading")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.delenv("BANDREADY_PARENT_PID", raising=False)

        from bandready import config as br_config
        from bandready import settings_store

        br_config.reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        settings_store.invalidate_cache()
        settings_store.patch_settings(
            {
                "llm": {
                    "preset": "mock_llm",
                    "base_url": "mock://llm",
                    "model": "mock-model-1",
                    "api_key": "",
                }
            }
        )

        from bandready.server.app import create_app

        app = create_app()
        # The auth middleware rejects any non-loopback Host header, so TestClient's default
        # "testserver" base_url would 403 every request.
        with TestClient(app, base_url="http://127.0.0.1") as client:
            client.headers.update({"Authorization": "Bearer test-token"})
            yield client

        db_engine.reset_engine()
        settings_store.invalidate_cache()
        br_config.reset_settings_cache()


@pytest.fixture()
def passage_id(app_client: TestClient) -> Iterator[str]:
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.PracticeSession))
        pid = seed_passage(session)
    yield pid
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingPassage))


ALL_CORRECT = {
    "1": "TRUE",
    "2": "false",
    "3": "NG",  # abbreviation
    "4": "Ceramic Jars.",  # case folding + trailing punctuation
    "5": "1,500",  # thousands separator
    "6": "well being",  # hyphen ≡ space
    "7": "IV",  # wrong on purpose; overwritten with "i" where a perfect score is wanted
    "8": "ii",
}


# --------------------------------------------------------------------------------------
# Band tables (06 §4.3)
# --------------------------------------------------------------------------------------

def test_band_tables_cover_every_raw_score_exactly_once() -> None:
    for table in (ACADEMIC_BAND_TABLE, GT_BAND_TABLE):
        covered: list[int] = []
        for low, high, _band in table:
            covered.extend(range(low, high + 1))
        assert sorted(covered) == list(range(41))


@pytest.mark.parametrize(
    ("raw", "band"),
    [(40, 9.0), (39, 9.0), (38, 8.5), (35, 8.0), (33, 7.5), (30, 7.0), (27, 6.5),
     (23, 6.0), (19, 5.5), (15, 5.0), (13, 4.5), (10, 4.0), (8, 3.5), (6, 3.0),
     (4, 2.5), (0, 2.0)],
)
def test_academic_band_table(raw: int, band: float) -> None:
    assert raw_to_band(raw, "academic") == band


@pytest.mark.parametrize(
    ("raw", "band"),
    [(40, 9.0), (39, 8.5), (37, 8.0), (36, 7.5), (34, 7.0), (32, 6.5), (30, 6.0),
     (27, 5.5), (23, 5.0), (19, 4.5), (15, 4.0), (12, 3.5), (9, 3.0), (6, 2.5), (0, 2.0)],
)
def test_general_training_band_table(raw: int, band: float) -> None:
    assert raw_to_band(raw, "general_training") == band


def test_general_training_is_harsher_at_the_top() -> None:
    assert raw_to_band(39, "academic") == 9.0
    assert raw_to_band(39, "general_training") == 8.5


def test_scaled_raw_projects_short_attempts_onto_forty() -> None:
    assert scaled_raw(8, 8) == 40
    assert scaled_raw(4, 8) == 20
    assert scaled_raw(31, 40) == 31
    assert scaled_raw(0, 13) == 0


# --------------------------------------------------------------------------------------
# Content listing and answer-key stripping
# --------------------------------------------------------------------------------------

def test_passage_list_and_exam_payload_hide_the_key(
    app_client: TestClient, passage_id: str
) -> None:
    listing = app_client.get("/api/v1/reading/passages").json()
    assert any(item["id"] == passage_id for item in listing["items"])
    entry = next(item for item in listing["items"] if item["id"] == passage_id)
    assert entry["questions"] == 8
    assert set(entry["question_types"]) == {
        "true_false_not_given",
        "sentence_completion",
        "matching_headings",
    }

    exam = app_client.get(f"/api/v1/reading/passages/{passage_id}").json()
    assert exam["answers_included"] is False
    blob = json.dumps(exam)
    # The passage text itself of course contains the answer words; what must be gone is the
    # authored key, the explanations and the evidence quotes.
    assert "paraphrases" not in blob
    assert "Scope/quantifier shift" not in blob
    for group in exam["passages"][0]["question_groups"]:
        for question in group["questions"]:
            assert "answers" not in question
            assert "explanation" not in question
            assert "evidence_quote" not in question
            assert "anchor_paragraphs" in question  # navigation, not the key
    limits = {
        g["type"]: g["instructions"] for g in exam["passages"][0]["question_groups"]
    }
    assert limits["sentence_completion"] == (
        "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer."
    )


def start_passage_attempt(client: TestClient, passage_id: str, **kw: Any) -> dict[str, Any]:
    response = client.post(
        "/api/v1/reading/attempts",
        json={"passage_id": passage_id, "mode": "passage", **kw},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_review_mode_is_refused_until_an_attempt_is_submitted(
    app_client: TestClient, passage_id: str
) -> None:
    """``?mode=review`` costs an attempt (06 §6, staging-reading/DESIGN.md §10 F10).

    It hands over the key *and* the whole authored teaching payload, so a learner who can
    reach it without sitting the passage has simply been given the answers, and a passage
    can only be sat once.
    """
    response = app_client.get(f"/api/v1/reading/passages/{passage_id}?mode=review")
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_review_mode_payload_includes_the_key(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")

    doc = app_client.get(f"/api/v1/reading/passages/{passage_id}?mode=review").json()
    first = doc["passages"][0]["question_groups"][0]["questions"][0]
    assert first["answers"] == [{"value": "true"}]


def test_exam_payload_strips_the_per_question_teaching(
    app_client: TestClient, passage_id: str
) -> None:
    """DESIGN §0.4 D2 — the per-question payload is a key by another name.

    ``paraphrase_link.text_phrase`` quotes the deciding words and ``decision_rule`` states
    the answer outright, so neither may travel with the paper. The passage skim plan and
    the group strategy card are *preparation* material, name no answer, and deliberately
    survive — the coach reads them off this document to teach a passage before it is sat.
    They are dropped only under exam conditions, which
    ``test_the_sitting_strips_the_strategy_card`` covers.
    """
    exam = app_client.get(f"/api/v1/reading/passages/{passage_id}").json()
    document = exam["passages"][0]
    for group in document["question_groups"]:
        for question in group["questions"]:
            assert "teaching" not in question
    assert "decision_rule" not in json.dumps(exam)
    assert exam["coaching_included"] is True
    assert document["teaching"]["skim_plan"] if document.get("teaching") else True
    assert document["question_groups"][0]["teaching"]["strategy"]


def test_review_releases_the_solution_card(app_client: TestClient, passage_id: str) -> None:
    """DESIGN §10 F1 — the whole authored payload, once the attempt is spent."""
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")

    review = app_client.get(f"/api/v1/reading/attempts/{attempt_id}/review").json()
    first = next(q for q in review["per_question"] if q["number"] == 1)
    assert first["teaching"]["decision_rule"]
    solution = first["solution"]
    assert solution["paraphrase_link"]["text_phrase"] == "long before European ships"
    assert solution["reusable_rule"]
    assert solution["location"]["evidence_quote"]
    # Trap slugs arrive resolved against the closed taxonomy, not as bare strings.
    assert solution["traps"][0]["slug"] == "absence_read_as_contradiction"
    assert solution["traps"][0]["family"] == "judgement"
    assert first["group_teaching"]["strategy"]


def test_multiple_choice_options_survive_when_authored_on_the_question(
    app_client: TestClient, passage_id: str
) -> None:
    """Most MCQs in the shipped bank author their A–D on the question, not the group.

    Reading only the group leaves the review saying "you answered B, the answer was C"
    without printing either, which teaches nothing.
    """
    with session_scope() as session:
        row = session.get(m.ReadingPassage, passage_id)
        doc = json.loads(row.passage_json)
        doc["question_groups"].append(
            {
                "id": "g9",
                "type": "multiple_choice",
                "word_limit": None,
                "options": None,
                "questions": [
                    {
                        "number": 9,
                        "prompt": "What does paragraph A establish?",
                        "options": [
                            {"key": "A", "text": "That the corridors are recent."},
                            {"key": "B", "text": "That the corridors long predate Europeans."},
                            {"key": "C", "text": "That no cargo moved along them."},
                        ],
                        "answers": [{"value": "B"}],
                        "anchor_paragraphs": ["A"],
                        "evidence_quote": "ships carried cargo along the monsoon corridors",
                        "explanation": "Paragraph A dates the corridors before the arrival.",
                    }
                ],
            }
        )
        row.passage_json = json.dumps(doc)

    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")
    review = app_client.get(f"/api/v1/reading/attempts/{attempt_id}/review").json()
    mcq = next(q for q in review["per_question"] if q["number"] == 9)
    assert [option["key"] for option in mcq["options"]] == ["A", "B", "C"]


def test_unknown_passage_is_a_404_envelope(app_client: TestClient) -> None:
    response = app_client.get("/api/v1/reading/passages/rp_nope")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


# --------------------------------------------------------------------------------------
# The attempt lifecycle: start → autosave → submit → review → why-wrong
# --------------------------------------------------------------------------------------

def test_start_attempt_returns_an_exam_payload_and_resume_state(
    app_client: TestClient, passage_id: str
) -> None:
    started = start_passage_attempt(app_client, passage_id)
    assert started["attempt_id"].startswith("rd_")
    assert started["total_questions"] == 8
    assert started["timer_s"] == 1200
    assert started["resume_state"] == {
        "answers": {}, "flags": [], "highlights": [], "notes": {}, "timer_s": 1200,
    }
    assert "answers" not in json.dumps(started["passages"][0]["question_groups"][0]["questions"][0])


def test_start_full_attempt_requires_a_test_id(app_client: TestClient, passage_id: str) -> None:
    response = app_client.post("/api/v1/reading/attempts", json={"mode": "full"})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_autosave_deep_merges_and_resumes(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    first = app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={"answers": {"1": "TRUE", "2": "false"}, "flags": [2], "timer_s": 1100},
    )
    assert first.status_code == 200
    assert first.json()["answered"] == 2

    second = app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={
            "answers": {"4": "ceramic jars"},
            "notes": {"A": "check the dates"},
            "highlights": [
                {"text_id": "t1", "paragraph_id": "A", "start_offset": 0,
                 "end_offset": 12, "color": "yellow"}
            ],
            "timer_s": 900,
        },
    )
    assert second.json()["answered"] == 3

    resumed = app_client.get(f"/api/v1/reading/attempts/{attempt_id}").json()
    state = resumed["resume_state"]
    assert state["answers"] == {"1": "TRUE", "2": "false", "4": "ceramic jars"}
    assert state["flags"] == [2]
    assert state["notes"] == {"A": "check the dates"}
    assert len(state["highlights"]) == 1
    assert state["timer_s"] == 900
    assert resumed["status"] == "in_progress"


def test_autosave_clears_an_answer_when_it_is_blanked(
    app_client: TestClient, passage_id: str
) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE"}})
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": ""}})
    state = app_client.get(f"/api/v1/reading/attempts/{attempt_id}").json()["resume_state"]
    assert state["answers"] == {}


def test_submit_marks_a_perfect_attempt(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    answers = dict(ALL_CORRECT, **{"7": "i"})
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": answers})
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()

    assert record["raw_score"] == 8
    assert record["total_questions"] == 8
    assert record["scaled_raw_40"] == 40
    assert record["band"] == 9.0
    assert record["band_is_estimate"] is True
    assert record["auto_submitted"] is False
    assert record["weakest_type"] is None
    assert {q["number"] for q in record["per_question"] if q["correct"]} == set(range(1, 9))
    assert record["per_type"]["true_false_not_given"] == {"correct": 3, "total": 3}
    assert record["per_passage"][0]["passage_id"] == passage_id


def test_submit_applies_every_normalization_rule(app_client: TestClient, passage_id: str) -> None:
    """The perfect attempt above deliberately used tolerant-but-correct spellings."""
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={
            "answers": {
                "4": "Ceramic Jar.",  # second keyed variant + case + trailing period
                "5": "one thousand five hundred",  # number words → digits
                "6": "WELL BEING",  # hyphen ≡ space + case
                "3": "n.g.",  # abbreviation
            }
        },
    )
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    correct = {q["number"] for q in record["per_question"] if q["correct"]}
    assert correct == {3, 4, 5, 6}


def test_the_article_rule_cannot_beat_the_word_limit(
    app_client: TestClient, passage_id: str
) -> None:
    """"the ceramic jars" is the right words but three words — wrong under a 2-word limit."""
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"4": "the ceramic jars"}}
    )
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    assert record["raw_score"] == 0


def test_submit_rejects_over_limit_and_misspelled_answers(
    app_client: TestClient, passage_id: str
) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={
            "answers": {
                "4": "sealed in the ceramic jars",  # right words, way over the limit
                "5": "1500 wrecks exactly",  # over the limit
                "6": "wellbeing",  # closed form is not an authored variant
                "1": "maybe",  # not a valid TFNG token
            }
        },
    )
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    assert record["raw_score"] == 0
    by_number = {q["number"]: q for q in record["per_question"]}
    assert by_number[4]["correct"] is False
    assert by_number[5]["correct"] is False
    assert by_number[6]["correct"] is False
    assert by_number[6]["near_miss_spelling"] is True  # tagged as a spelling leak
    assert by_number[1]["correct"] is False


def test_submit_surfaces_the_weakest_type(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={
            "answers": {
                "1": "FALSE", "2": "TRUE", "3": "TRUE",  # TFNG 0/3
                "4": "ceramic jars", "5": "1500", "6": "well-being",  # completion 3/3
                "7": "i", "8": "ii",  # headings 2/2
            }
        },
    )
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    assert record["raw_score"] == 5
    assert record["weakest_type"]["qtype"] == "true_false_not_given"
    assert record["weakest_type"]["correct"] == 0


def test_submit_persists_reading_answers_rows(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={"answers": dict(ALL_CORRECT, **{"7": "i"})},
    )
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")

    with session_scope() as session:
        attempt = session.get(m.ReadingAttempt, attempt_id)
        assert attempt is not None
        assert attempt.status == "submitted"
        assert attempt.raw_score == 8
        assert attempt.band == 9.0
        assert attempt.submitted_at
        rows = list(
            session.scalars(
                m.ReadingAnswer.__table__.select().where(  # type: ignore[arg-type]
                    m.ReadingAnswer.attempt_id == attempt_id
                )
            )
        )
        assert len(rows) == 8
        practice = session.get(m.PracticeSession, attempt_id)
        assert practice is not None and practice.ended_at
        summary = json.loads(practice.summary_json or "{}")
        assert summary["raw_score"] == 8


def test_submitted_attempt_appears_in_scored_attempts_view(
    app_client: TestClient, passage_id: str
) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE"}}
    )
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")
    with session_scope() as session:
        from sqlalchemy import text as sql

        row = session.execute(
            sql("SELECT skill, mode, band FROM scored_attempts WHERE attempt_id = :i"),
            {"i": attempt_id},
        ).first()
    assert row is not None
    assert row[0] == "reading"
    assert row[1] == "practice"


def test_exam_conditions_attempt_is_stored_as_an_exam_mode_row(
    app_client: TestClient, passage_id: str
) -> None:
    started = start_passage_attempt(app_client, passage_id, exam_conditions=True)
    with session_scope() as session:
        attempt = session.get(m.ReadingAttempt, started["attempt_id"])
        assert attempt is not None and attempt.mode == "exam"
    assert started["exam_conditions"] is True


def test_autosave_after_submit_is_a_conflict(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")
    response = app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE"}}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_resubmit_is_idempotent(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE"}})
    first = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    second = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    assert first["raw_score"] == second["raw_score"] == 1


def test_auto_submit_flag_is_recorded(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    record = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/submit",
        json={"auto_submitted": True, "duration_s": 1200},
    ).json()
    assert record["auto_submitted"] is True
    assert record["duration_s"] == 1200


# --------------------------------------------------------------------------------------
# Review mode
# --------------------------------------------------------------------------------------

def test_review_returns_the_key_explanations_and_locate_data(
    app_client: TestClient, passage_id: str
) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={"answers": {"2": "not given", "4": "ceramic jars"}},
    )
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")

    review = app_client.get(f"/api/v1/reading/attempts/{attempt_id}/review").json()
    assert review["raw_score"] == 1
    by_number = {q["number"]: q for q in review["per_question"]}

    wrong = by_number[2]
    assert wrong["correct"] is False
    assert wrong["given"] == "not given"
    assert wrong["accepted_answers"] == ["false"]
    assert "contradicts" in wrong["explanation"].lower() or wrong["explanation"]
    assert wrong["trap_note"]
    assert wrong["locate"]["paragraph_id"] == "B"
    assert wrong["locate"]["passage_id"] == passage_id
    assert wrong["locate"]["evidence_quote"] in PARAGRAPHS[1]["text"]
    assert wrong["can_ask_why"] is True
    assert wrong["why_wrong"] is None

    right = by_number[4]
    assert right["correct"] is True
    assert right["accepted_answers"] == ["ceramic jars", "ceramic jar"]
    assert right["can_ask_why"] is False
    assert right["instructions"].startswith("Write NO MORE THAN TWO WORDS")


def test_review_before_submit_is_a_conflict(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    response = app_client.get(f"/api/v1/reading/attempts/{attempt_id}/review")
    assert response.status_code == 409


# --------------------------------------------------------------------------------------
# "Why was I wrong?" (job + cache)
# --------------------------------------------------------------------------------------

def poll_job(client: TestClient, job_id: str, timeout: float = 10.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        if job["state"] in ("done", "error", "cancelled"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} never finished")


def test_why_wrong_runs_a_job_and_caches_the_analysis(
    app_client: TestClient, passage_id: str
) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"2": "NG"}})
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")

    started = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/why-wrong", json={"number": 2}
    )
    assert started.status_code == 202
    assert started.json()["cached"] is False
    job = poll_job(app_client, started.json()["job_id"])
    assert job["state"] == "done", job
    assert "scope/quantifier shift" in job["result"]["trap"]

    cached = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/why-wrong", json={"number": 2}
    )
    assert cached.status_code == 200
    assert cached.json()["cached"] is True
    assert cached.json()["explanation"]

    review = app_client.get(f"/api/v1/reading/attempts/{attempt_id}/review").json()
    entry = next(q for q in review["per_question"] if q["number"] == 2)
    assert entry["why_wrong"]["trap"]


def test_why_wrong_refuses_a_correct_answer(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"1": "TRUE"}})
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")
    response = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/why-wrong", json={"number": 1}
    )
    assert response.status_code == 422


def test_why_wrong_logs_an_llm_evaluation_row(app_client: TestClient, passage_id: str) -> None:
    attempt_id = start_passage_attempt(app_client, passage_id)["attempt_id"]
    app_client.patch(f"/api/v1/reading/attempts/{attempt_id}", json={"answers": {"3": "TRUE"}})
    app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit")
    started = app_client.post(
        f"/api/v1/reading/attempts/{attempt_id}/why-wrong", json={"number": 3}
    )
    poll_job(app_client, started.json()["job_id"])
    with session_scope() as session:
        from sqlalchemy import text as sql

        row = session.execute(
            sql(
                "SELECT purpose, status FROM llm_evaluations "
                "WHERE subject_kind = 'reading_attempt' AND subject_id = :i"
            ),
            {"i": attempt_id},
        ).first()
    assert row is not None
    assert row[0] == "trap_analysis"
    assert row[1] == "ok"


# --------------------------------------------------------------------------------------
# Drills
# --------------------------------------------------------------------------------------

def test_drill_endpoint_returns_anchor_paragraphs_without_the_key(
    app_client: TestClient, passage_id: str
) -> None:
    drill = app_client.get("/api/v1/reading/drills/true_false_not_given?size=3").json()
    assert drill["qtype"] == "true_false_not_given"
    assert drill["size"] == 3
    first = drill["items"][0]
    assert first["prompt"]
    assert first["anchor_texts"]  # only the anchor paragraphs, not the whole passage
    for item in drill["items"]:
        assert "answers" not in item
        assert "explanation" not in item
        assert "trap_note" not in item
        assert "evidence_quote" not in item


def test_drill_attempt_scores_only_the_drawn_questions(
    app_client: TestClient, passage_id: str
) -> None:
    started = app_client.post(
        "/api/v1/reading/attempts",
        json={"mode": "drill", "qtype": "true_false_not_given", "size": 5},
    )
    assert started.status_code == 201, started.text
    body = started.json()
    assert body["total_questions"] == 3  # only three TFNG questions in the bank
    attempt_id = body["attempt_id"]

    app_client.patch(
        f"/api/v1/reading/attempts/{attempt_id}",
        json={"answers": {"1": "TRUE", "2": "FALSE", "3": "TRUE"}},
    )
    record = app_client.post(f"/api/v1/reading/attempts/{attempt_id}/submit").json()
    assert record["mode"] == "drill"
    assert record["raw_score"] == 2
    assert record["band"] is None  # drills are never band-scored (06 §6.2)


def test_multi_select_marker_awards_one_mark_per_correct_letter() -> None:
    """"Choose TWO letters" is one checkbox set but two question numbers (06 §2 type 1)."""
    from bandready.server.routes.reading import _mark

    def group(*numbers: int, key: list[str]) -> list[Any]:
        from bandready.server.routes.reading import _Scorable

        return [
            _Scorable(
                key=str(n),
                number=n,
                qtype="multiple_choice_multi",
                group_id="g:multi",
                answers=[{"value": key[i]}],
                word_limit=None,
            )
            for i, n in enumerate(numbers)
        ]

    scorables = group(11, 12, key=["A", "C"])
    both = _mark(scorables, {"11": "A,C", "12": "A,C"})
    assert list(both.values()) == [True, True]

    one = _mark(scorables, {"11": "A", "12": "A"})
    assert sorted(one.values()) == [False, True]  # one mark for the one correct letter

    over = _mark(scorables, {"11": "A,B,C", "12": "A,B,C"})
    assert list(over.values()) == [False, False]  # over-selecting scores nothing

    none = _mark(scorables, {})
    assert list(none.values()) == [False, False]


def test_full_test_attempt_scores_across_three_passages(app_client: TestClient) -> None:
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingPassage))
        pids = [seed_passage(session, title=f"Passage {i}") for i in range(1, 4)]
        test_id = f"rt_{ULID()}"
        session.add(
            m.ReadingTest(
                id=test_id,
                format="academic",
                title="Seeded Academic Reading Test",
                p1_id=pids[0],
                p2_id=pids[1],
                p3_id=pids[2],
                source="pack",
                license="CC-BY-4.0",
            )
        )

    started = app_client.post(
        "/api/v1/reading/attempts",
        json={"test_id": test_id, "mode": "full", "exam_conditions": True},
    )
    assert started.status_code == 201, started.text
    body = started.json()
    assert body["total_questions"] == 24
    assert body["timer_s"] == 3600
    assert len(body["passages"]) == 3

    # Each seeded passage numbers its questions 1-8, so one answer map marks all three.
    app_client.patch(
        f"/api/v1/reading/attempts/{body['attempt_id']}",
        json={"answers": dict(ALL_CORRECT, **{"7": "i"})},
    )
    record = app_client.post(
        f"/api/v1/reading/attempts/{body['attempt_id']}/submit"
    ).json()
    assert record["raw_score"] == 24
    assert record["total_questions"] == 24
    assert len(record["per_passage"]) == 3
    assert {p["correct"] for p in record["per_passage"]} == {8}
    assert record["band"] == 9.0

    with session_scope() as session:
        from sqlalchemy import text as sql

        mode = session.execute(
            sql("SELECT mode FROM scored_attempts WHERE attempt_id = :i"),
            {"i": body["attempt_id"]},
        ).scalar()
    assert mode == "mock"  # exam conditions on a full test feeds the mock-test history

    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingPassage))


def test_unknown_drill_type_is_a_404(app_client: TestClient, passage_id: str) -> None:
    response = app_client.get("/api/v1/reading/drills/map_labelling")
    assert response.status_code == 404


def test_drill_results_are_recorded(app_client: TestClient, passage_id: str) -> None:
    response = app_client.post(
        "/api/v1/reading/drills/results",
        json={
            "drill_kind": "scan",
            "qtype": None,
            "n_items": 8,
            "n_correct": 6,
            "params": {"seconds_per_target": 20},
            "details": {"median_locate_ms": 9400},
        },
    )
    assert response.status_code == 201
    drill_id = response.json()["drill_id"]
    with session_scope() as session:
        row = session.get(m.DrillResult, drill_id)
        assert row is not None
        assert row.module == "reading"
        assert row.drill_kind == "scan"
        assert (row.n_items, row.n_correct) == (8, 6)


# --------------------------------------------------------------------------------------
# Generation pipeline (mock LLM, 06 §7)
# --------------------------------------------------------------------------------------

def test_generate_a_passage_end_to_end(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/reading/generate",
        json={"format": "academic", "topic": "urban ecology", "band_target": 7.0,
              "scope": "passage"},
    )
    assert response.status_code == 202
    assert response.headers["Location"].startswith("/api/v1/jobs/")
    job = poll_job(app_client, response.json()["job_id"], timeout=30)
    assert job["state"] == "done", job
    new_id = job["result"]["passage_id"]

    with session_scope() as session:
        row = session.get(m.ReadingPassage, new_id)
        assert row is not None
        assert row.source == "generated"
        doc = json.loads(row.passage_json)
        report = json.loads(row.validation_report_json)
        assert report["total"] >= 1
        assert report["passed"] == report["total"]  # the blind pass agreed with the key
        assert report["survivors"] == report["total"]
        numbers = [
            q["number"] for g in doc["question_groups"] for q in g["questions"]
        ]
        assert numbers == list(range(1, len(numbers) + 1))
        questions = list(
            session.scalars(
                m.ReadingQuestion.__table__.select().where(  # type: ignore[arg-type]
                    m.ReadingQuestion.passage_id == new_id
                )
            )
        )
        assert len(questions) == len(numbers)

    # The generated passage is immediately playable through the normal routes.
    exam = app_client.get(f"/api/v1/reading/passages/{new_id}").json()
    assert exam["answers_included"] is False
    started = app_client.post(
        "/api/v1/reading/attempts", json={"passage_id": new_id, "mode": "passage"}
    ).json()
    assert started["total_questions"] == len(
        [q for g in exam["passages"][0]["question_groups"] for q in g["questions"]]
    )

    with session_scope() as session:
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingPassage))


def test_generate_a_full_test_builds_three_linked_passages(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/reading/generate",
        json={"format": "academic", "band_target": 7.0, "scope": "test"},
    )
    job = poll_job(app_client, response.json()["job_id"], timeout=60)
    assert job["state"] == "done", job
    test_id = job["result"]["test_id"]

    with session_scope() as session:
        test = session.get(m.ReadingTest, test_id)
        assert test is not None
        assert len({test.p1_id, test.p2_id, test.p3_id}) == 3

    listing = app_client.get("/api/v1/reading/tests?source=generated").json()
    entry = next(item for item in listing["items"] if item["id"] == test_id)
    assert entry["generated"] is True
    assert entry["total_questions"] == sum(p["questions"] for p in entry["passages"])

    payload = app_client.get(f"/api/v1/reading/tests/{test_id}").json()
    assert len(payload["passages"]) == 3
    numbers = [
        q["number"]
        for p in payload["passages"]
        for g in p["question_groups"]
        for q in g["questions"]
    ]
    assert numbers == list(range(1, len(numbers) + 1))  # contiguous across the whole test

    with session_scope() as session:
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingQuestion))
        session.execute(delete(m.ReadingPassage))


def test_generate_rejects_an_unknown_scope(app_client: TestClient) -> None:
    response = app_client.post(
        "/api/v1/reading/generate", json={"format": "academic", "scope": "chapter"}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------------------
# Route registration (18 §4.9)
# --------------------------------------------------------------------------------------

def test_every_contracted_route_is_registered(app_client: TestClient) -> None:
    from bandready.server.app import route_paths

    paths = set(route_paths(app_client.app))  # type: ignore[arg-type]
    for path in (
        "/api/v1/reading/tests",
        "/api/v1/reading/tests/{test_id}",
        "/api/v1/reading/attempts",
        "/api/v1/reading/attempts/{attempt_id}",
        "/api/v1/reading/attempts/{attempt_id}/submit",
        "/api/v1/reading/attempts/{attempt_id}/review",
        "/api/v1/reading/attempts/{attempt_id}/why-wrong",
        "/api/v1/reading/generate",
        "/api/v1/reading/drills/{qtype}",
        "/api/v1/reading/drills/results",
    ):
        assert path in paths, path


def test_unauthenticated_requests_are_rejected(app_client: TestClient) -> None:
    response = app_client.get(
        "/api/v1/reading/passages", headers={"Authorization": "Bearer wrong"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_data_dir_is_the_throwaway_one(app_client: TestClient) -> None:
    """Guard against a test run ever touching the developer's real database."""
    from bandready.config import get_settings

    assert "bandready-reading" in str(Path(get_settings().data_dir))
