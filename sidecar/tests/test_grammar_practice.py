"""The Ladder itself — the rungs, the demotions, free production, and the API on top.

These are the behaviours the algorithm is *made of*, so each one is pinned individually:

* **the entry gate** — a card exists only after the learner has passed one retrieval, which
  is what closes FSRS's blind spot (it will happily schedule something never understood);
* **advancement** needs two clean passes, on two study days, on two different sentences,
  and at most one rung per session;
* **demotion** — one lapse at Choose or above costs a rung; two lapses in three reviews
  cost two and flag the card; a hinted pass at the production rungs buys nothing;
* **the wild-failure rule** — the same error code coming back in a real submission
  hard-drops the point regardless of how green the card looked;
* **free-production grading is fair** — it accepts a correct sentence it did not
  anticipate, and a rejection it cannot quote is thrown away.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope
from bandready.grammar import grading, practice, syllabus
from bandready.grammar import scheduler_bridge as bridge
from bandready.grammar.tables import (
    GrammarCard,
    GrammarPoint,
    GrammarReviewLog,
    ensure_grammar_tables,
)
from bandready.srs import scheduler as sched

PROFILE = "default"
AUTH = {"Authorization": "Bearer test-token"}
REPO = Path(__file__).resolve().parents[2]
STAGING = REPO / "content" / "core-en" / "staging-grammar" / "content"

#: The staged choice point everything below is walked on: a full 16-item bank with twins,
#: a `both_ok`, a dictation, and a `produce` item at both S4 and S5.
WALK_POINT = "gr_quantifiers_fine"

#: A confusion set whose members are *all* choice points, so a sibling really does have a
#: `choose_form` item to be asked. `cs_quantifier_polarity` pairs a choice point with a
#: form point, which is a legitimate set but a poor fixture for the sibling rules.
CONTRAST_POINT = "gr_passive_when"


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


def _staged_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(STAGING.glob("*.json")):
        try:
            rows.extend(json.loads(path.read_text()).get("points") or [])
        except (OSError, ValueError):  # pragma: no cover
            continue
    return rows


def _seed(session: Any, rows: list[dict[str, Any]]) -> None:
    present = {row["id"] for row in rows}
    for row in rows:
        payload = dict(row["point_json"])
        payload["prerequisites"] = [
            p for p in (payload.get("prerequisites") or []) if p in present
        ]
        session.merge(
            GrammarPoint(
                id=row["id"],
                unit_id=row["unit_id"],
                sequence_index=int(row["sequence_index"]),
                title=row["title"],
                cefr_level=row["cefr_level"],
                role=row["role"],
                topic_id=row.get("topic_id"),
                point_json=json.dumps(payload, ensure_ascii=False),
                source="pack",
            )
        )
    syllabus.reset_cache()


@pytest.fixture(scope="module")
def migrated_db(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    data_dir = tmp_path_factory.mktemp("bandready-grammar-practice")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        from bandready.config import reset_settings_cache

        reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        ensure_grammar_tables()
        from bandready.settings_store import patch_settings

        patch_settings(
            {"llm": {"preset": "mock_llm", "base_url": "mock://llm", "model": "mock-model-1"}}
        )
        try:
            yield data_dir
        finally:
            db_engine.reset_engine()
            reset_settings_cache()


@pytest.fixture()
def db(migrated_db: Path) -> Iterator[Path]:
    rows = _staged_rows()
    if not rows:  # pragma: no cover
        pytest.skip("no grammar content has been staged yet")
    with session_scope() as s:
        s.execute(delete(GrammarReviewLog))
        s.execute(delete(GrammarCard))
        s.execute(delete(GrammarPoint))
        s.execute(delete(m.WritingEvaluation))
        s.execute(delete(m.LlmEvaluation))
        s.execute(delete(m.WritingSubmission))
        s.execute(delete(m.PracticeSession))
        if s.get(m.Profile, PROFILE) is None:
            s.add(m.Profile(id=PROFILE, name="Test Learner", exam_format="academic"))
        for line in (REPO / "content/core-en/data/topics.jsonl").read_text().splitlines():
            topic = json.loads(line)
            if s.get(m.Topic, topic["id"]) is None:
                s.add(m.Topic(**topic))
        # Flush the topics before the points that reference them: `grammar_points.topic_id`
        # is a real FK, and `Session.merge()` runs with autoflush suppressed, so without
        # this the points are inserted first and SQLite rejects the batch.
        s.flush()
        _seed(s, rows)
    syllabus.reset_cache()
    yield migrated_db


@pytest.fixture()
def client(db: Path) -> Iterator[TestClient]:
    from bandready.server.app import create_app

    with TestClient(create_app(), base_url="http://127.0.0.1:8710") as c:
        c.headers.update(AUTH)
        yield c


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _point(session: Any, point_id: str = WALK_POINT) -> syllabus.Point:
    return syllabus.load_points(session)[point_id]


def _card(
    session: Any,
    point_id: str = WALK_POINT,
    stage: int = 1,
    *,
    settled: bool = True,
) -> GrammarCard:
    """A card at a given rung.

    ``settled`` puts it in FSRS review state with mature stability, because otherwise the
    maturity gate caps the question at Build however high the rung is — which is correct
    behaviour, and would silently make every rung test a Build test.
    """
    card = bridge.create_card(PROFILE, point_id)
    card.stage = stage
    if settled:
        card.state = sched.STATE_REVIEW
        card.stability = 40.0
        card.difficulty = 5.0
        card.due_at = sched.iso(sched.now_utc() - timedelta(minutes=1))
    session.add(card)
    session.flush()
    return card


def _answer(
    session: Any,
    card: GrammarCard,
    point: syllabus.Point,
    item: dict[str, Any],
    *,
    outcome: str = "pass",
    now: Any = None,
    session_started_at: str | None = None,
) -> dict[str, Any]:
    return practice.apply_outcome(
        session,
        card,
        point,
        item,
        outcome=outcome,
        grade={"correct": outcome != "fail"},
        elapsed_ms=2_000,
        now=now,
        session_started_at=session_started_at,
    )


def _items_at(point: syllabus.Point, stage: int) -> list[dict[str, Any]]:
    return [i for i in point.items if int(i.get("stage") or 0) == stage]


# --------------------------------------------------------------------------------------
# 1. The entry gate — nothing is scheduled until it is understood (§1.3)
# --------------------------------------------------------------------------------------


def test_a_failed_gate_creates_no_card(client: TestClient) -> None:
    point_id = "gr_countability"
    start = client.post(f"/api/v1/grammar/points/{point_id}/start")
    assert start.status_code == 200, start.text
    gate = start.json()["gate_item"]
    assert gate is not None

    response = client.post(
        f"/api/v1/grammar/points/{point_id}/gate",
        json={"item_id": gate["item_id"], "answer": "definitely not the answer"},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["passed"] is False
    assert body["card"] is None

    with session_scope() as s:
        assert bridge.cards_by_point(s, PROFILE) == {}


def test_a_passed_gate_creates_the_card_at_notice(client: TestClient) -> None:
    point_id = "gr_countability"
    gate_id = client.post(f"/api/v1/grammar/points/{point_id}/start").json()["gate_item"]["item_id"]

    with session_scope() as s:
        item = _point(s, point_id).item(gate_id)
        answer = _correct_answer(item)

    response = client.post(
        f"/api/v1/grammar/points/{point_id}/gate", json={"item_id": gate_id, "answer": answer}
    )
    body = response.json()
    assert body["passed"] is True, body
    assert body["stage"] == 1
    assert body["stage_name"] == "Notice"
    assert body["rule_card"]["rule_line"], "the rule card arrives only after the attempt"

    with session_scope() as s:
        cards = bridge.cards_by_point(s, PROFILE)
        assert list(cards) == [point_id]
        assert cards[point_id].reps == 0, "the gate is not a scheduled review"


def test_the_gate_is_idempotent(db: Path) -> None:
    with session_scope() as s:
        point = _point(s, "gr_countability")
        first = practice.pass_gate(s, PROFILE, point)
        second = practice.pass_gate(s, PROFILE, point)
        assert first.id == second.id


def _correct_answer(item: dict[str, Any]) -> Any:
    payload = item.get("payload") or {}
    kind = str(item.get("kind"))
    if kind in ("interpret", "choose_form", "contrast_pair"):
        return payload.get("key")
    if kind == "both_ok":
        return "both"
    if kind == "judge":
        return {"acceptable": payload.get("acceptable"), "reason": payload.get("reason_key")}
    if kind == "dictation":
        return " ".join(payload.get("scored_tokens") or [])
    if kind == "order":
        return (payload.get("accepted_orders") or [[]])[0]
    if kind == "error_fix":
        return {
            "span": payload.get("error_span"),
            "replacement": (item.get("expected") or [""])[0],
        }
    return (item.get("expected") or [""])[0]


# --------------------------------------------------------------------------------------
# 2. Advancement (§1.6)
# --------------------------------------------------------------------------------------


def test_one_clean_pass_is_not_enough(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        items = _items_at(point, 2)
        result = _answer(s, card, point, items[0])
        assert result["stage_after"] == 2
        assert "1 of 2" in result["ladder_note"]


def test_two_passes_on_one_day_are_not_enough(db: Path) -> None:
    """Spacing between *quality levels*, not just between reps (§1.6)."""
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        items = _items_at(point, 2)
        _answer(s, card, point, items[0], now=now)
        result = _answer(s, card, point, items[1], now=now + timedelta(minutes=5))
        assert result["stage_after"] == 2
        assert "second day" in result["ladder_note"]


def test_two_passes_on_two_days_with_two_items_advances(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        items = _items_at(point, 2)
        _answer(s, card, point, items[0], now=now)
        result = _answer(s, card, point, items[1], now=now + timedelta(days=1))
        assert result["stage_after"] == 3
        assert result["advanced"] is True
        assert result["stage_name"] == "Choose"


def test_the_same_sentence_twice_does_not_advance_from_build(db: Path) -> None:
    """Two successes on one item is a memorised sentence, not a learned structure."""
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        item = _items_at(point, 2)[0]
        _answer(s, card, point, item, now=now)
        result = _answer(s, card, point, item, now=now + timedelta(days=1))
        assert result["stage_after"] == 2
        assert "second sentence" in result["ladder_note"]


def test_notice_is_forced_upwards_after_three_passes(db: Path) -> None:
    """S1 is deliberately thin: flip-card ease must not let an item live there (§1.4)."""
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=1)
        items = _items_at(point, 1)
        _answer(s, card, point, items[0], now=now)
        _answer(s, card, point, items[1], now=now + timedelta(minutes=1))
        result = _answer(s, card, point, items[2 % len(items)], now=now + timedelta(minutes=2))
        assert result["stage_after"] == 2, "three clean passes at Notice promote regardless"
        assert "three clean passes" in result["ladder_note"]


def test_only_one_rung_per_session(db: Path) -> None:
    """Two rungs in one sitting is not learning, it is a good half-hour.

    Checked on the pure core, because the surrounding conditions (two days, two items)
    would independently block a second advance and the guard would never be reached.
    """
    card = bridge.create_card(PROFILE, WALK_POINT)
    card.stage = 2
    card.stage_successes = 3
    satisfied = {
        "stage_days": ["2026-01-01", "2026-01-02"],
        "stage_items": {"gi_1", "gi_2"},
        "clean": True,
        "leech_active": False,
    }
    assert practice._may_advance(card, advanced_this_session=False, **satisfied)[0] is True
    blocked, reason = practice._may_advance(card, advanced_this_session=True, **satisfied)
    assert blocked is False
    assert "one rung per session" in reason


def test_an_advance_is_detected_within_the_session_window(db: Path) -> None:
    now = sched.now_utc()
    started = sched.iso(now)
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        items = _items_at(point, 2)
        _answer(s, card, point, items[0], now=now - timedelta(days=1))
        first = _answer(s, card, point, items[1], now=now, session_started_at=started)
        assert first["advanced"] is True
        # The log carries `stage_before = 2` while the card now says 3, which is how the
        # guard sees the advance without a session table to look it up in.
        assert practice._advanced_in_session(s, card, started) is True
        assert practice._advanced_in_session(s, card, sched.iso(now + timedelta(hours=1))) is False


def test_a_rung_with_only_one_item_is_not_a_dead_end(db: Path) -> None:
    """The authoring floors allow a single ``produce`` item at Use — that must still pass.

    "Two distinct sentences" is a requirement on the learner, not a way to strand a card
    on a rung whose bank cannot supply two. A production prompt is answered with different
    content every time, so the second attempt genuinely is a second sentence.
    """
    now = sched.now_utc()
    with session_scope() as s:
        point = _point(s)
        assert practice.bank_size(point, 4) == 1, "this fixture depends on a one-item rung"
        card = _card(s, stage=4)
        item = _items_at(point, 4)[0]
        _answer(s, card, point, item, now=now)
        result = _answer(s, card, point, item, now=now + timedelta(days=1))
        assert result["stage_after"] == 5, result["ladder_note"]


def test_a_rung_with_a_full_bank_still_demands_two_sentences(db: Path) -> None:
    with session_scope() as s:
        point = _point(s)
        assert practice.bank_size(point, 2) >= 2
        card = _card(s, stage=2)
        card.stage_successes = 2
        blocked, reason = practice._may_advance(
            card,
            stage_days=["2026-01-01", "2026-01-02"],
            stage_items={"gi_only_one"},
            clean=True,
            advanced_this_session=False,
            leech_active=False,
            available_items=practice.bank_size(point, 2),
        )
        assert blocked is False
        assert "second sentence" in reason


def test_a_slow_pass_counts_as_a_success_but_does_not_advance(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        items = _items_at(point, 2)
        _answer(s, card, point, items[0], now=now)
        result = _answer(
            s, card, point, items[1], outcome="pass_slow", now=now + timedelta(days=1)
        )
        assert result["stage_after"] == 2
        assert result["rating"] == 2
        assert "ran long" in result["ladder_note"]


# --------------------------------------------------------------------------------------
# 3. Demotion (§1.6)
# --------------------------------------------------------------------------------------


def test_a_lapse_at_choose_costs_one_rung_and_triggers_a_re_teach(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=3)
        result = _answer(s, card, point, _items_at(point, 3)[0], outcome="fail")
        assert result["stage_after"] == 2
        assert result["demoted"] is True
        assert result["reteach_first"] is True
        assert result["rating"] == 1


def test_a_lapse_below_choose_holds_the_rung(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        result = _answer(s, card, point, _items_at(point, 2)[0], outcome="fail")
        assert result["stage_after"] == 2
        assert "not finished" in result["ladder_note"]


def test_two_lapses_in_three_reviews_cost_two_rungs_and_flag_the_card(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=5)
        items = _items_at(point, 3) or point.items
        _answer(s, card, point, items[0], outcome="fail", now=now)
        assert card.stage == 4
        result = _answer(s, card, point, items[1], outcome="fail", now=now + timedelta(minutes=5))
        assert result["stage_after"] == 2
        assert result["leech"] is True
        assert "keeps slipping" in result["ladder_note"]


def test_a_leech_is_capped_at_choose_for_a_fortnight(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=3)
        card.leech = 1
        _answer(s, card, point, _items_at(point, 3)[0], outcome="fail", now=now)
        assert practice.leech_capped(s, card, now) is True

        # A leech that has climbed back to Use is still only asked to Choose.
        card.stage = 5
        card.state, card.stability = sched.STATE_REVIEW, 40.0
        assert practice.stage_ceiling(card) == 5
        assert practice.stage_ceiling(card, leech_active=True) == 3
        # …and the cap expires on its own, with no column to keep in step.
        assert practice.leech_capped(s, card, now + timedelta(days=15)) is False


def test_a_hinted_pass_at_the_production_rungs_buys_nothing(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=4)
        before = int(card.stage_successes or 0)
        result = _answer(s, card, point, _items_at(point, 4)[0], outcome="hint")
        assert result["stage_after"] == 4
        assert int(card.stage_successes or 0) == before
        assert "hinted" in result["ladder_note"]
        assert result["rating"] == 2


# --------------------------------------------------------------------------------------
# 4. The wild-failure rule — the essay outranks the card (§1.6)
# --------------------------------------------------------------------------------------


def test_a_wild_failure_hard_drops_to_choose_and_forces_the_point_back(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        card = _card(s, stage=5)
        card.stability = 60.0
        card.state = sched.STATE_REVIEW
        card.due_at = sched.iso(now + timedelta(days=40))

        event = practice.wild_failure(
            s, card, code="quantifier_wrong_class", module="writing", source_id="ws_1", now=now
        )
        assert event["stage_after"] == 3
        assert event["open_on"] == "contrast_board"
        assert card.last_wild_failure_at is not None
        assert card.due_at < sched.iso(now + timedelta(days=1)), "forced into the next session"

        log = s.execute(
            GrammarReviewLog.__table__.select().where(GrammarReviewLog.card_id == card.id)
        ).first()
        assert log is not None
        assert json.loads(log.error_codes_json) == ["quantifier_wrong_class"]
        assert log.item_id == "wild:writing:ws_1", "the source is recoverable from the log"


def test_a_wild_failure_only_fires_on_a_point_the_learner_has_already_built(db: Path) -> None:
    now = sched.now_utc()
    _record_writing_error(
        quote="Few of the funding reached the schools.",
        fix="Little of the funding reached the schools.",
        explanation="'Few' is for things you can count; this is a quantifier problem.",
    )
    with session_scope() as s:
        points = syllabus.load_points(s)
        card = _card(s, stage=2)  # still being built — no demotion
        events = practice.apply_wild_failures(s, PROFILE, points, now=now)
        assert events == []
        assert card.stage == 2

        card.stage = 5
        events = practice.apply_wild_failures(s, PROFILE, points, now=now)
        assert len(events) == 1
        assert events[0]["stage_after"] == 3

        # The same submission cannot demote the same point twice.
        assert practice.apply_wild_failures(s, PROFILE, points, now=now) == []


def _record_writing_error(
    *, quote: str, fix: str, explanation: str, annotation_type: str = "grammar"
) -> str:
    """A scored Writing submission carrying one annotated error, as the scorer stores it.

    Each row is merged and flushed in FK order, so the helper is safe to call more than
    once inside one module-scoped database.
    """
    with session_scope() as s:
        s.merge(
            m.WritingPrompt(
                id="wp_grammar_test", task_type="task2", genre="opinion",
                prompt_text="A test prompt.", source="pack",
            )
        )
        s.flush()
        s.merge(
            m.PracticeSession(
                id="ps_grammar_1", profile_id=PROFILE, module="writing", activity="task2"
            )
        )
        s.flush()
        s.merge(
            m.WritingSubmission(
                id="ps_grammar_1", prompt_id="wp_grammar_test", mode="practice",
                status="scored", essay_text=quote, word_count=250,
            )
        )
        s.flush()
        s.merge(
            m.WritingEvaluation(
                id="we_grammar_1", submission_id="ps_grammar_1", llm_evaluation_id="le_1",
                band_ta=6, band_cc=6, band_lr=6, band_gra=6, overall_band=6,
                annotations_json=json.dumps(
                    {
                        "annotations": [
                            {"quote": quote, "type": annotation_type, "fix": fix,
                             "explanation": explanation, "start": 0, "end": len(quote)}
                        ]
                    }
                ),
            )
        )
        s.flush()
    return "ps_grammar_1"


def _record_speaking_error(*, turn: str, quote: str, better: str, issue: str) -> str:
    """A scored Speaking session carrying one error quote, as the speaking scorer stores it.

    The turn is written too, because the harvest anchors an error to the sentence it was
    said in — a fragment out of context is much harder to recognise as your own.
    """
    with session_scope() as s:
        s.merge(
            m.PracticeSession(
                id="ps_grammar_sp", profile_id=PROFILE, module="speaking", activity="part1"
            )
        )
        s.flush()
        s.merge(
            m.SpeakingSession(
                id="ps_grammar_sp", mode="practice", part=1, state="done", status="complete"
            )
        )
        s.flush()
        s.merge(
            m.SpeakingTurn(
                id="st_grammar_1", session_id="ps_grammar_sp", turn_index=0,
                role="user", t_ms=0, text=turn,
            )
        )
        s.merge(
            m.LlmEvaluation(
                id="le_grammar_sp", subject_kind="speaking_session",
                subject_id="ps_grammar_sp", purpose="score", model_id="mock-model-1",
                provider_id="mock", prompt_version="v1", temperature=0.0,
                raw_response="{}", status="ok",
                parsed_json=json.dumps(
                    {"errors": [{"quote": quote, "better": better, "issue": issue}]}
                ),
            )
        )
        s.flush()
    return "ps_grammar_sp"


# --------------------------------------------------------------------------------------
# 5. Harvesting the learner's own errors (§1.3 route 1, F8)
# --------------------------------------------------------------------------------------


def test_writing_annotations_become_error_codes_and_a_route_into_the_syllabus(db: Path) -> None:
    _record_writing_error(
        quote="Few of the funding reached the smaller schools.",
        fix="Little of the funding reached the smaller schools.",
        explanation="'Few' is for countable things — this is a quantifier problem.",
    )
    with session_scope() as s:
        harvested = practice.harvest(s, PROFILE)
        assert harvested, "the harvest must read what the writing scorer already stores"
        assert harvested[0]["code"] == "quantifier_wrong_class"
        assert harvested[0]["module"] == "writing"

        points = syllabus.load_points(s)
        routes = practice.route_codes(harvested, points, {})
        assert routes
        route = routes[0]
        assert route["code"] == "quantifier_wrong_class"
        assert route["point_id"] in points


def test_speaking_errors_feed_the_same_route_as_writing_ones(db: Path) -> None:
    """Both scorers already emit errors, so the module reads both through one harvest.

    This is the same code path as the writing test — `srs.bridge.harvest_errors` — which
    is the point: grammar owns the mapping to an error code and nothing else, so a change
    to either scorer's payload is absorbed in one place rather than two.
    """
    _record_speaking_error(
        turn="We get a lot of informations from the local radio, mostly about the roadworks.",
        quote="a lot of informations",
        better="a lot of information",
        issue="'information' is uncountable, so it has no plural.",
    )
    with session_scope() as s:
        harvested = practice.harvest(s, PROFILE)
        assert harvested, "a speaking transcript must be able to open a grammar point"
        entry = harvested[0]
        assert entry["code"] == "countable_uncountable"
        assert entry["module"] == "speaking"
        assert entry["quote"] == "a lot of informations"
        assert "local radio" in entry["sentence"], "the error is anchored to what they said"

        points = syllabus.load_points(s)
        routes = practice.route_codes(harvested, points, {})
        assert routes and routes[0]["code"] == "countable_uncountable"
        assert routes[0]["point_id"] in points


def test_a_locked_recommendation_sends_the_learner_somewhere_they_can_start(db: Path) -> None:
    with session_scope() as s:
        points = syllabus.load_points(s)
        codes = [{"code": "quantifier_wrong_class", "quote": "few of the funding",
                  "module": "writing", "at": "2026-01-01", "source_id": "x"}]
        routes = practice.route_codes(codes, points, {})
        route = routes[0]
        if not route["unlocked"]:
            assert route["start_here"] is not None
            assert route["why"] and "have not done" in route["why"]
            # And the door it points at must actually be open.
            start = points[route["start_here"]]
            assert syllabus.unmet_prerequisites(start, {}, points) == []


def test_an_unmappable_correction_is_dropped_rather_than_guessed() -> None:
    assert practice.code_for_annotation("something", "something else", "it reads oddly") is None
    assert practice.code_for_annotation("", "", "") is None


def test_spelling_annotations_are_not_this_module_s_business(db: Path) -> None:
    _record_writing_error(
        quote="goverment", fix="government", explanation="Spelling.",
        annotation_type="spelling",
    )
    with session_scope() as s:
        assert practice.harvest(s, PROFILE) == []


# --------------------------------------------------------------------------------------
# 6. Mastery (§1.7)
# --------------------------------------------------------------------------------------


def test_stability_alone_is_not_mastery(db: Path) -> None:
    """A learner can max out stability on recognition items and produce none of it."""
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=5)
        card.stability = 90.0
        report = practice.mastery_report(s, card, point)
        assert report["conditions"]["at_top_rung"] is True
        assert report["conditions"]["durable"] is True
        assert report["conditions"]["produced_unassisted"] is False
        assert report["mastered"] is False


def test_a_real_submission_counts_for_more_than_a_drill(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=5)
        card.stability = 90.0
        practice.record_real_use(s, card, module="writing", source_id="ps_1", quote="A few…")
        s.flush()
        report = practice.mastery_report(s, card, point)
        assert report["conditions"]["produced_unassisted"] is True
        assert report["evidence"]["production_source"] == "a real submission"
        assert "counts for more than a drill" in report["evidence"]["production_note"]


def test_recording_a_real_use_does_not_move_the_schedule(db: Path) -> None:
    """Evidence about competence is not a scheduled retrieval."""
    with session_scope() as s:
        card = _card(s, stage=5)
        due_before, reps_before = card.due_at, card.reps
        practice.record_real_use(s, card, module="speaking", source_id="ss_1")
        assert card.due_at == due_before
        assert card.reps == reps_before


def test_a_contrast_point_is_not_mastered_until_the_rival_is_declined(db: Path) -> None:
    """You have not mastered the present perfect until you can decline to use it (§1.7)."""
    with session_scope() as s:
        point = _point(s, CONTRAST_POINT)
        assert point.confusion_set, "the contrast point must belong to a confusion set"
        card = _card(s, CONTRAST_POINT, stage=5)
        card.stability = 90.0
        practice.record_real_use(s, card, module="writing", source_id="ps_1")
        s.flush()
        report = practice.mastery_report(s, card, point)
        assert report["conditions"]["declines_the_rival"] is False
        assert "rival form" in report["evidence"]["sibling_note"]

        # Pass a `choose_form` on the sibling and the last condition closes.
        points = syllabus.load_points(s)
        sibling = syllabus.siblings(points, point)[0]
        sibling_card = _card(s, sibling.id, stage=3)
        choose = next(i for i in sibling.items if str(i.get("kind")) == "choose_form")
        _answer(s, sibling_card, sibling, choose)
        report = practice.mastery_report(s, card, point)
        assert report["conditions"]["declines_the_rival"] is True
        assert report["mastered"] is True
        assert report["can_do"], "mastery is a sentence about the learner, not a percentage"


# --------------------------------------------------------------------------------------
# 7. Free-production grading (§2.9, F5)
# --------------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_a_correct_sentence_the_grader_did_not_anticipate_is_accepted(db: Path) -> None:
    """Mock mode returns a fixture with none of our keys — leniency must carry it."""
    verdict = await grading.judge_production(
        "A few of the stalls have stayed open, which nobody expected.",
        structure_slug="present_perfect",
        prompt_text="Say one thing that has changed.",
    )
    assert verdict["checked"] is True
    assert verdict["accepted"] is True
    assert verdict["structure_present"] is True


@pytest.mark.anyio
async def test_a_rejection_that_cannot_quote_itself_is_thrown_away(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ten lines, and the strongest fairness mechanism we have (§2.9)."""

    async def fake(_messages: Any, **_kw: Any) -> dict[str, Any]:
        return {
            "structure_correct": False,
            "fits_situation": True,
            "offending_span": "words that appear nowhere in what they wrote",
            "minimal_fix": "something",
            "why": "it is wrong because I say so",
        }

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake)
    verdict = await grading.judge_production(
        "The council has published the figures.", structure_slug="present_perfect"
    )
    assert verdict["accepted"] is True
    assert verdict["discarded_reason"] is None or "quote" in str(verdict.get("discarded_reason"))
    assert verdict["why"] == "", "a discarded rejection must not leave its reason behind"


@pytest.mark.anyio
async def test_a_rejection_that_quotes_the_learner_is_kept_and_names_what_is_wrong(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake(_messages: Any, **_kw: Any) -> dict[str, Any]:
        return {
            "structure_correct": False,
            "fits_situation": True,
            "offending_span": "have publish",
            "minimal_fix": "The council has published the figures.",
            "why": "The verb after 'have' needs its past participle form.",
        }

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake)
    verdict = await grading.judge_production(
        "The council have publish the figures.", structure_slug="present_perfect"
    )
    assert verdict["accepted"] is False
    assert verdict["offending_span"] == "have publish"
    assert "past participle" in verdict["why"]
    assert verdict["appealable"] is True


@pytest.mark.anyio
async def test_when_the_two_checks_disagree_the_learner_wins(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A rejection costs a second call at temperature 0. Disagreement means accept."""
    calls = {"n": 0}

    async def fake(_messages: Any, **_kw: Any) -> dict[str, Any]:
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "structure_correct": False, "fits_situation": True,
                "offending_span": "has published", "minimal_fix": "x", "why": "no",
            }
        return {"structure_correct": True, "fits_situation": True,
                "offending_span": "", "minimal_fix": "", "why": ""}

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake)
    verdict = await grading.judge_production(
        "The council has published the figures.", structure_slug="present_perfect"
    )
    assert calls["n"] == 2, "a rejection must be confirmed before it is shown"
    assert verdict["accepted"] is True
    assert "disagreed" in str(verdict["discarded_reason"])


@pytest.mark.anyio
async def test_a_detector_miss_is_our_bug_and_never_a_rejection(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake(_messages: Any, **_kw: Any) -> dict[str, Any]:
        return {"structure_correct": True, "fits_situation": True,
                "offending_span": "", "minimal_fix": "", "why": ""}

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake)
    verdict = await grading.judge_production(
        "I worked there for six years.", structure_slug="present_perfect"
    )
    assert verdict["accepted"] is True
    assert verdict["detector_gap"] is True, "the gap is logged, not charged to the learner"


@pytest.mark.anyio
async def test_offline_degrades_to_self_rating_rather_than_to_a_rejection(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(_messages: Any, **_kw: Any) -> dict[str, Any]:
        raise RuntimeError("no network")

    monkeypatch.setattr("bandready.providers.llm.chat_json", boom)
    verdict = await grading.judge_production("Anything at all.", structure_slug="present_perfect")
    assert verdict["checked"] is False
    assert verdict["accepted"] is None
    assert "rate yourself" in verdict["detail"]


@pytest.mark.anyio
async def test_an_accepted_sentence_with_a_suggestion_is_not_corrected(
    db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake(_messages: Any, **_kw: Any) -> dict[str, Any]:
        return {"structure_correct": True, "fits_situation": True, "offending_span": "",
                "minimal_fix": "The council has published the figures since 2018.", "why": ""}

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake)
    verdict = await grading.judge_production(
        "The council has published the figures.", structure_slug="present_perfect"
    )
    assert verdict["accepted"] is True
    assert "Also fine" in verdict["detail"], "an accepted sentence is never shown as corrected"


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"


# --------------------------------------------------------------------------------------
# 8. Session composition (§1.9)
# --------------------------------------------------------------------------------------


def test_a_session_ends_on_production_and_never_on_recognition(db: Path) -> None:
    with session_scope() as s:
        points = syllabus.load_points(s)
        card = _card(s, stage=5)
        card.state = sched.STATE_REVIEW
        card.stability = 40.0
        composed = practice.build_session(s, PROFILE, points=points, size=8)
        phases = {phase["name"]: phase for phase in composed["phases"]}
        assert list(phases) == ["warm_up", "core", "new", "production"]
        assert composed["items"], composed
        assert composed["items"][-1]["stage"] >= 4


def test_a_choice_point_never_practises_alone(db: Path) -> None:
    """Without a sibling in the session, the answer is "whatever this block is about".

    The sibling here is deliberately **not due**: the contrast constraint has to pull it in
    anyway, which is the whole point of it being a constraint rather than a preference.
    """
    now = sched.now_utc()
    with session_scope() as s:
        points = syllabus.load_points(s)
        point = points[CONTRAST_POINT]
        sibling = syllabus.siblings(points, point)[0]
        _card(s, point.id, stage=3)
        not_due = _card(s, sibling.id, stage=3)
        not_due.due_at = sched.iso(now + timedelta(days=9))

        composed = practice.build_session(s, PROFILE, points=points, size=6, now=now)
        point_ids = {item["point_id"] for item in composed["items"]}
        assert point.id in point_ids
        assert sibling.id in point_ids, "the rival has to be in the room"
        assert composed["contrast_notes"], "the learner is told why the sibling is there"
        assert composed["contrast_notes"][0]["confusion_set"] == point.confusion_set


def test_a_production_prompt_borrows_a_word_from_the_vocabulary_queue(db: Path) -> None:
    """§1.5 rule 7 — one sentence, two cards. This is the owner's ask made literal.

    The word leaves the vocabulary queue when it is seeded: asking for it again as a card
    of its own in the same session would be two retrievals pretending to be one.
    """
    lex = [
        {
            "family": "lex", "card_id": "sc_1", "entry_id": "ve_1",
            "headword": "deteriorate", "definition": "to get worse over time",
            "kind": "cloze", "stage": 2, "item_id": "lex:ve_1", "point_id": None,
            "exercise": {"type": "cloze"},
        }
    ]
    with session_scope() as s:
        points = syllabus.load_points(s)
        # Use, not Under pressure: the walk point's S4 item is the one whose author asked
        # for a seed, and S4 is where DESIGN §1.5 rule 7 puts it.
        _card(s, stage=4)
        composed = practice.build_session(
            s, PROFILE, points=points, lex_items=lex, size=8
        )

    seeded = [
        item
        for item in composed["items"]
        if (item.get("exercise") or {}).get("payload", {}).get("seed_word")
    ]
    assert seeded, "a produce item that asked for a word must be given one"
    word = seeded[0]["exercise"]["payload"]["seed_word"]
    assert word["headword"] == "deteriorate"
    assert word["definition"] == "to get worse over time"
    assert seeded[0]["seeds_from_vocab"] is True
    assert seeded[0]["also_reviews"]["entry_id"] == "ve_1", "the word's own card is rated too"
    assert seeded[0]["also_reviews"]["review_via"] == "/api/v1/srs/review"
    assert composed["vocab_seeds"][0]["headword"] == "deteriorate"
    assert not [i for i in composed["items"] if i.get("entry_id") == "ve_1"], (
        "a seeded word is not also asked for on a card of its own"
    )


def test_a_production_prompt_stands_on_its_own_when_no_word_is_due(db: Path) -> None:
    """The seed is an enrichment, never a dependency — an empty queue changes nothing."""
    with session_scope() as s:
        points = syllabus.load_points(s)
        _card(s, stage=4)
        composed = practice.build_session(s, PROFILE, points=points, lex_items=[], size=8)

    assert composed["items"], composed
    assert composed["vocab_seeds"] == []
    assert all(
        not (item.get("exercise") or {}).get("payload", {}).get("seed_word")
        for item in composed["items"]
    )
    assert all(item.get("seeds_from_vocab") is False for item in composed["items"])


def test_the_arranger_keeps_twins_apart_and_blocks_from_forming() -> None:
    items = [
        {"item_id": "a1", "point_id": "p1", "kind": "choose_form", "twin_id": "a2"},
        {"item_id": "a2", "point_id": "p1", "kind": "choose_form", "twin_id": "a1"},
        {"item_id": "a3", "point_id": "p1", "kind": "choose_form", "twin_id": None},
        {"item_id": "b1", "point_id": "p2", "kind": "gap_fill", "twin_id": None},
        {"item_id": "b2", "point_id": "p2", "kind": "gap_fill", "twin_id": None},
        {"item_id": "b3", "point_id": "p2", "kind": "judge", "twin_id": None},
    ]
    ordered = practice.arrange(items)
    assert len(ordered) == len(items)
    ids = [i["item_id"] for i in ordered]
    assert abs(ids.index("a1") - ids.index("a2")) >= practice.TWIN_MIN_GAP

    run_point = run_kind = 1
    for previous, current in pairwise(ordered):
        run_point = run_point + 1 if previous["point_id"] == current["point_id"] else 1
        run_kind = run_kind + 1 if previous["kind"] == current["kind"] else 1
        assert run_point <= practice.MAX_CONSECUTIVE_SAME_POINT
        assert run_kind <= practice.MAX_CONSECUTIVE_SAME_TYPE


def test_a_new_point_is_withheld_while_something_half_learned_keeps_slipping(db: Path) -> None:
    """A learner drowning in reviews must never be handed more (§0.5 override 11)."""
    with session_scope() as s:
        assert bridge.new_point_budget(s, PROFILE)["allowed"] == 1
        point, card = _point(s), _card(s, stage=2)
        _answer(s, card, point, _items_at(point, 2)[0], outcome="fail")
        budget = bridge.new_point_budget(s, PROFILE)
        assert budget["allowed"] == 0
        assert budget["blocked_by_point"] == WALK_POINT
        assert "keeps slipping" in budget["reason"]


def test_the_item_bank_rotates_rather_than_repeating(db: Path) -> None:
    """A repeated context builds a memorised sentence, not a generalisable rule."""
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=2)
        seen: list[str] = []
        for _ in range(len(_items_at(point, 2))):
            ctx = practice.SelectionContext(seen=seen)
            item = practice.select_item(point, card, ctx)
            assert item is not None
            assert str(item["id"]) not in seen
            seen.append(str(item["id"]))


def test_the_reserve_is_held_back_until_the_teaching_set_is_spent(db: Path) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=3)
        teaching = [
            i for i in _items_at(point, 3)
            if not i.get("review_only") and str(i.get("kind")) in practice.KINDS_BY_STAGE[3]
        ]
        reserve = [i for i in _items_at(point, 3) if i.get("review_only")]
        assert teaching and reserve, "the walk point must have both sets"

        first = practice.select_item(point, card, practice.SelectionContext(seen=[]))
        assert not first.get("review_only")

        spent = [str(i["id"]) for i in teaching]
        later = practice.select_item(point, card, practice.SelectionContext(seen=spent))
        assert later is not None
        assert str(later["id"]) in {str(i["id"]) for i in reserve}


# --------------------------------------------------------------------------------------
# 9. The API
# --------------------------------------------------------------------------------------


def test_the_path_shows_every_point_and_names_what_blocks_each_one(client: TestClient) -> None:
    body = client.get("/api/v1/grammar/path").json()
    assert body["points"], body
    assert body["units"]
    assert {row["state"] for row in body["points"]} <= set(syllabus.PATH_STATES)
    locked = [row for row in body["points"] if row["state"] == "locked"]
    assert locked, "a real syllabus has locked points"
    assert all(row["blocked_by"] for row in locked), "a locked point always says why"
    assert all(row["title"] for row in body["points"]), "nothing is ever hidden"
    assert sum(1 for row in body["points"] if row["is_next_up"]) <= 1
    assert len(body["entry_points"]) == 3


def test_a_locked_point_cannot_be_started(client: TestClient) -> None:
    body = client.get("/api/v1/grammar/path").json()
    locked = next(row for row in body["points"] if row["state"] == "locked")
    response = client.post(f"/api/v1/grammar/points/{locked['id']}/start")
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"
    assert "first" in response.json()["detail"]


def test_answering_wrong_signals_before_it_reveals(client: TestClient) -> None:
    """Roughly seven in ten recasts go unnoticed; the answer is never the first thing."""
    point_id = "gr_countability"
    gate_id = client.post(f"/api/v1/grammar/points/{point_id}/start").json()["gate_item"]["item_id"]
    with session_scope() as s:
        item = _point(s, point_id).item(gate_id)
        good = _correct_answer(item)
    client.post(f"/api/v1/grammar/points/{point_id}/gate", json={"item_id": gate_id, "answer": good})

    with session_scope() as s:
        point = _point(s, point_id)
        wrong_item = next(
            i for i in point.items
            if int(i.get("stage") or 0) <= 2 and str(i.get("kind")) in ("interpret", "gap_fill")
        )
        wrong = "certainly not this" if wrong_item["kind"] == "gap_fill" else 99

    first = client.post(
        "/api/v1/grammar/answer",
        json={"point_id": point_id, "item_id": wrong_item["id"], "answer": wrong, "attempts": 1},
    ).json()
    assert first["committed"] is False
    assert first["beat"] == "signal"
    assert "expected" not in first and "reveal" not in first

    second = client.post(
        "/api/v1/grammar/answer",
        json={"point_id": point_id, "item_id": wrong_item["id"], "answer": wrong, "attempts": 2},
    ).json()
    assert second["committed"] is True
    assert second["beat"] == "reveal"
    assert second["outcome"] == "fail"
    assert second["reveal"]["why_key"], "the reveal names the meaning, not the verdict"


def test_the_session_route_composes_and_carries_its_own_start_time(client: TestClient) -> None:
    point_id = "gr_countability"
    gate_id = client.post(f"/api/v1/grammar/points/{point_id}/start").json()["gate_item"]["item_id"]
    with session_scope() as s:
        good = _correct_answer(_point(s, point_id).item(gate_id))
    client.post(f"/api/v1/grammar/points/{point_id}/gate", json={"item_id": gate_id, "answer": good})

    body = client.get("/api/v1/grammar/session?size=8&seed=7").json()
    assert body["session_started_at"]
    assert body["stage_names"]["3"] == "Choose"
    assert [phase["name"] for phase in body["phases"]] == [
        "warm_up", "core", "new", "production"
    ]
    for item in body["items"]:
        if item["family"] == "gram":
            assert "key" not in json.dumps(item["exercise"]["payload"])


def test_review_rates_a_grammar_card_which_the_vocabulary_route_cannot(
    client: TestClient,
) -> None:
    with session_scope() as s:
        _card(s, stage=2)
    response = client.post(
        "/api/v1/grammar/review",
        json={"point_id": WALK_POINT, "rating": 3, "review_type": "choose_form"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rating"] == 3
    assert body["card"]["due"] > body["card"]["last_review"]

    # The vocabulary route rejects the same exercise type outright.
    rejected = client.post(
        "/api/v1/srs/review", json={"card_id": "whatever", "rating": 3, "exercise_type": "choose_form"}
    )
    assert rejected.status_code == 422


def test_progress_leads_with_what_is_costing_marks(client: TestClient) -> None:
    with session_scope() as s:
        point, card = _point(s), _card(s, stage=3)
        _answer(s, card, point, _items_at(point, 3)[0], outcome="fail")
    body = client.get("/api/v1/grammar/progress").json()
    assert body["costing_you"], body
    assert body["costing_you"][0]["code"] in practice.ERROR_CODES
    assert body["costing_you"][0]["family"]
    assert "%" not in body["headline"]
    assert body["honesty_note"]


def test_a_contrast_board_answers_one_question(client: TestClient) -> None:
    boards = client.get("/api/v1/grammar/boards").json()["boards"]
    assert boards
    board_id = boards[0]["board_id"]
    body = client.get(f"/api/v1/grammar/boards/{board_id}").json()
    assert body["question"]
    assert len(body["worked_pairs"]) == 3
    assert body["wrong_choice_note"]
    assert body["your_record"]["line"]
    for pair in body["worked_pairs"]:
        assert pair["deciding_span_a"] in pair["a"], "a span that does not match highlights nothing"
        assert pair["deciding_span_b"] in pair["b"]


def test_a_drill_is_assembled_by_error_code_across_every_point(client: TestClient) -> None:
    body = client.get("/api/v1/grammar/drills?code=quantifier_wrong_class&size=12&seed=3").json()
    assert body["items"], body
    assert all(item["kind"] not in grading.FREE_PRODUCTION_KINDS for item in body["items"])
    assert body["family"] == "The noun phrase"


def test_mistakes_explains_itself_when_there_is_nothing_to_show(client: TestClient) -> None:
    body = client.get("/api/v1/grammar/mistakes").json()
    assert body["harvested"] == []
    assert "check back" in body["note"]
    assert body["coverage_note"]
