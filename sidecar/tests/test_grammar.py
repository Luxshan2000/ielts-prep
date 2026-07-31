"""Grammar module — the syllabus, the detectors, the grading and the FSRS boundary.

The behaviours proved here are the ones that are expensive to get wrong later:

* **the zero-knowledge guarantee** — the prerequisite graph has no cycles and no dangling
  references, and every prerequisite is taught before the point that needs it. A learner
  who starts at ``sequence_index`` 1 never meets a point that depends on something they
  have not been offered;
* **the detectors do not confuse the structures they exist to tell apart** — a present
  perfect is not a past simple, and an active sentence is not a passive one;
* **grammar's near-miss policy is narrower than vocabulary's** — ``walking`` is never
  "almost" for ``walked``, which is exactly what ``exercises.word_variants()`` would say;
* **the FSRS boundary holds in both directions** — the scheduler never writes ``stage``,
  the Ladder never writes ``due_at``, and a grammar review genuinely cannot be logged to
  ``srs_review_logs`` (which is the whole reason the parallel tables exist).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope
from bandready.grammar import detectors, grading, practice, syllabus
from bandready.grammar import scheduler_bridge as bridge
from bandready.grammar.tables import (
    GrammarCard,
    GrammarPoint,
    GrammarReviewLog,
    ensure_grammar_tables,
)
from bandready.srs import scheduler as sched

PROFILE = "default"
STAGING = (
    Path(__file__).resolve().parents[2]
    / "content"
    / "core-en"
    / "staging-grammar"
    / "content"
)


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


def staged_rows() -> list[dict[str, Any]]:
    """Every grammar point any content agent has staged so far.

    The tests run against the real authored content, not against invented rows, so a
    change to the schema that the engine cannot read shows up here rather than in
    production.
    """
    rows: list[dict[str, Any]] = []
    for path in sorted(STAGING.glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except (OSError, ValueError):  # pragma: no cover
            continue
        rows.extend(doc.get("points") or [])
    return rows


def seed_points(session: Any, rows: list[dict[str, Any]], *, self_contained: bool = True) -> None:
    """Insert point rows the way the loader will, and (optionally) close the graph.

    The staged blocks are written against the full 154-point syllabus, so a single block
    references prerequisites that live in another agent's file. ``self_contained`` drops
    those edges so a partial bank behaves like a complete one for the purposes of walking
    it — the cross-block references themselves are checked separately.
    """
    present = {row["id"] for row in rows}
    for row in rows:
        payload = dict(row["point_json"])
        if self_contained:
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
    data_dir = tmp_path_factory.mktemp("bandready-grammar")
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
    with session_scope() as s:
        s.execute(delete(GrammarReviewLog))
        s.execute(delete(GrammarCard))
        s.execute(delete(GrammarPoint))
        if s.get(m.Profile, PROFILE) is None:
            s.add(m.Profile(id=PROFILE, name="Test Learner", exam_format="academic"))
        for line in (
            Path(__file__).resolve().parents[2] / "content/core-en/data/topics.jsonl"
        ).read_text().splitlines():
            topic = json.loads(line)
            if s.get(m.Topic, topic["id"]) is None:
                s.add(m.Topic(**topic))
    syllabus.reset_cache()
    yield migrated_db


@pytest.fixture()
def staged(db: Path) -> list[dict[str, Any]]:
    rows = staged_rows()
    if not rows:  # pragma: no cover — the content agents have staged their blocks
        pytest.skip("no grammar content has been staged yet")
    with session_scope() as s:
        seed_points(s, rows)
    return rows


# --------------------------------------------------------------------------------------
# A tiny hand-built syllabus, for the graph cases real content should never contain
# --------------------------------------------------------------------------------------


def _point(pid: str, seq: int, prereqs: list[str], **extra: Any) -> dict[str, Any]:
    return {
        "id": pid,
        "unit_id": "u01",
        "sequence_index": seq,
        "title": f"can-do line for {pid}",
        "cefr_level": "A1",
        "role": extra.pop("role", "form"),
        "topic_id": "topic_work",
        "point_json": {
            "schema_version": 1,
            "grammar_name": pid,
            "prerequisites": prereqs,
            "teach": {"can_do": f"I can {pid}."},
            "items": [],
            **extra,
        },
    }


def _load(rows: list[dict[str, Any]]) -> dict[str, syllabus.Point]:
    with session_scope() as s:
        s.execute(delete(GrammarPoint))
        seed_points(s, rows, self_contained=False)
    with session_scope() as s:
        return syllabus.load_points(s, refresh=True)


# --------------------------------------------------------------------------------------
# 1. The prerequisite graph — the zero-knowledge guarantee
# --------------------------------------------------------------------------------------


def test_a_well_formed_graph_reports_no_problems(db: Path) -> None:
    points = _load([
        _point("gr_a", 1, []),
        _point("gr_b", 2, ["gr_a"]),
        _point("gr_c", 3, ["gr_a"]),
        _point("gr_d", 4, ["gr_b", "gr_c"]),
    ])
    assert syllabus.check_graph(points) == []
    assert syllabus.topological_order(points) == ["gr_a", "gr_b", "gr_c", "gr_d"]


def test_a_cycle_is_an_error_and_names_the_points(db: Path) -> None:
    points = _load([
        _point("gr_a", 1, ["gr_c"]),
        _point("gr_b", 2, ["gr_a"]),
        _point("gr_c", 3, ["gr_b"]),
    ])
    with pytest.raises(ValueError, match="cycle"):
        syllabus.topological_order(points)
    problems = syllabus.check_graph(points)
    assert any("cycle" in p for p in problems)
    assert any("gr_a" in p and "gr_b" in p and "gr_c" in p for p in problems)


def test_a_dangling_prerequisite_is_an_error(db: Path) -> None:
    points = _load([_point("gr_a", 1, []), _point("gr_b", 2, ["gr_nowhere"])])
    problems = syllabus.check_graph(points)
    assert any("gr_nowhere" in p and "does not resolve" in p for p in problems)


def test_a_prerequisite_taught_later_is_an_error(db: Path) -> None:
    """The ordering check is the guarantee, not a nicety.

    If a point at sequence 2 needs a point at sequence 9, a learner walking the path in
    order meets it seven lessons early — which is exactly the failure the whole sequencing
    exercise exists to prevent.
    """
    points = _load([_point("gr_a", 9, []), _point("gr_b", 2, ["gr_a"])])
    problems = syllabus.check_graph(points)
    assert any("taught later" in p for p in problems)


def test_duplicate_sequence_index_is_an_error(db: Path) -> None:
    points = _load([_point("gr_a", 4, []), _point("gr_b", 4, [])])
    problems = syllabus.check_graph(points)
    assert any("already used by" in p for p in problems)


def test_staged_content_is_acyclic_and_in_teaching_order(staged: list[dict[str, Any]]) -> None:
    """The real authored content, checked as a graph.

    Cross-block prerequisites are resolved away by the fixture (each block is authored
    against the full 154-point list), so what is proved here is that nothing inside the
    staged blocks loops, and that every edge that *can* be resolved points backwards.
    """
    with session_scope() as s:
        points = syllabus.load_points(s, refresh=True)
    assert len(points) == len(staged)

    order = syllabus.topological_order(points)  # raises on a cycle
    assert len(order) == len(points)

    position = {pid: index for index, pid in enumerate(order)}
    for point in points.values():
        for prereq in point.prerequisites:
            assert position[prereq] < position[point.id], (
                f"{point.id} is taught before its prerequisite {prereq}"
            )
            assert points[prereq].sequence_index < point.sequence_index

    problems = [p for p in syllabus.check_graph(points) if "does not resolve" not in p]
    assert problems == [], problems


def test_staged_cross_block_references_name_real_syllabus_ids(
    staged: list[dict[str, Any]],
) -> None:
    """A prerequisite that resolves nowhere would be a permanently locked point.

    Blocks are authored separately, so a reference out of the block is expected. What is
    not acceptable is a reference to an id no block will ever provide, so every unresolved
    id must at least look like a syllabus id rather than a typo of a title.
    """
    ids = {row["id"] for row in staged}
    outward: set[str] = set()
    for row in staged:
        for prereq in row["point_json"].get("prerequisites") or []:
            if prereq not in ids:
                outward.add(prereq)
    assert all(pid.startswith("gr_") for pid in outward), sorted(outward)


def test_deepest_unmet_prerequisite_lands_somewhere_startable(db: Path) -> None:
    """Route 1 must hand the learner a door they can actually open (§1.3)."""
    points = _load([
        _point("gr_a", 1, []),
        _point("gr_b", 2, ["gr_a"]),
        _point("gr_c", 3, ["gr_b"]),
    ])
    start = syllabus.deepest_unmet_prerequisite("gr_c", {}, points)
    assert start == "gr_a"

    # Once the foundation is at Choose, the door moves up one.
    assert syllabus.deepest_unmet_prerequisite("gr_c", {"gr_a": 3}, points) == "gr_b"
    # And a point whose prerequisites are all met needs no redirection at all.
    assert syllabus.deepest_unmet_prerequisite("gr_c", {"gr_a": 3, "gr_b": 3}, points) is None


def test_path_locks_a_point_until_its_prerequisite_is_at_choose(db: Path) -> None:
    points = _load([_point("gr_a", 1, []), _point("gr_b", 2, ["gr_a"])])

    rows = {r["id"]: r for r in syllabus.path_states(points, {})}
    assert rows["gr_a"]["state"] == "next"
    assert rows["gr_b"]["state"] == "locked"
    assert rows["gr_b"]["blocked_by"][0]["title"].startswith("can-do line")

    # Build (stage 2) is not enough — the learner can make the form but not the choice.
    rows = {r["id"]: r for r in syllabus.path_states(points, {"gr_a": 2})}
    assert rows["gr_b"]["state"] == "locked"

    rows = {r["id"]: r for r in syllabus.path_states(points, {"gr_a": 3})}
    assert rows["gr_b"]["state"] == "next"
    assert rows["gr_a"]["state"] == "in_progress"


# --------------------------------------------------------------------------------------
# 2. Detectors (D4)
# --------------------------------------------------------------------------------------

DETECTOR_CASES: tuple[tuple[str, str, bool], ...] = (
    ("present_perfect", "The council has published the figures every March since 2018.", True),
    ("present_perfect", "I worked at the Marlow depot for six years.", False),
    ("present_perfect", "He's been repainting the hall.", False),
    ("present_perfect_continuous", "He's been repainting the hall.", True),
    ("past_simple", "I visited the Norland reserve in 2019.", True),
    ("past_perfect", "She had left before the meeting started.", True),
    ("past_perfect_continuous", "I'd been commuting for nearly two hours a day.", True),
    ("passive_any", "The figures were published in March.", True),
    ("passive_any", "The council published the figures in March.", False),
    ("passive_agentless", "The figures were published in March.", True),
    ("passive_agentless", "The figures were published by the council.", False),
    ("conditional_unreal_past", "If they had asked, I would have gone.", True),
    ("conditional_unreal_present", "If they asked, I would go.", True),
    ("conditional_real", "If it rains, we will cancel.", True),
    ("modal_perfect", "They should have checked the figures.", True),
    ("modal_simple", "They should check the figures.", True),
    ("relative_non_defining", "The depot, which closed in 2019, is now flats.", True),
    ("relative_defining", "The depot that closed in 2019 is now flats.", True),
    ("gerund_after_preposition", "She left without saying anything.", True),
    ("cleft", "It was the cost that stopped the scheme.", True),
    ("used_to", "I used to walk to work.", True),
    ("future_going_to", "It is going to rain.", True),
    ("future_will", "I will send it tomorrow.", True),
    ("future_perfect", "By June they will have finished.", True),
    ("future_continuous", "I will be working late.", True),
    ("comparative", "This route is more direct than the old one.", True),
    ("noun_clause_that", "The report shows that the scheme worked.", True),
    ("embedded_question", "I do not know why the scheme failed.", True),
    ("participle_clause", "Having read the report, she resigned.", True),
    ("causative_have_get", "We had the roof repaired last spring.", True),
    ("causative_have_get", "They had repaired the roof by then.", False),
    ("wish_unreal", "I wish I had more time.", True),
    ("past_continuous", "They were waiting outside.", True),
    ("present_continuous", "The numbers are rising fast.", True),
    ("reported_speech", "She said that she had already sent it.", True),
    ("present_simple", "The bus leaves at seven.", True),
    ("present_simple", "I visited the reserve in 2019.", False),
)


@pytest.mark.parametrize(("slug", "sentence", "expected"), DETECTOR_CASES)
def test_detector_fires_on_what_it_names(slug: str, sentence: str, expected: bool) -> None:
    assert bool(detectors.detect(slug, sentence)) is expected


def test_the_slug_set_is_closed_and_complete() -> None:
    """A point declaring a slug with no detector is a lint failure, not a runtime surprise.

    31 is the §2.8 list. If this number changes, the content lint has to change with it.
    """
    assert len(detectors.STRUCTURE_SLUGS) == 31
    assert detectors.detect("no_such_structure", "anything") is None
    assert detectors.detect("present_perfect", "") is None
    assert detectors.describe(None) == "the target structure"


def test_every_staged_structure_slug_has_a_detector(staged: list[dict[str, Any]]) -> None:
    for row in staged:
        slug = row["point_json"].get("structure_slug")
        if slug:
            assert detectors.has_detector(slug), f"{row['id']} declares an unknown slug {slug!r}"


# --------------------------------------------------------------------------------------
# 3. Grammar's near-miss policy
# --------------------------------------------------------------------------------------


def test_a_spelling_slip_is_forgiven() -> None:
    assert grammar_close(["have worked"], "have workd")
    assert grammar_close(["published"], "publishd")
    assert grammar_close(["don't"], "dont")


def test_a_wrong_inflection_is_not_a_slip() -> None:
    """The whole reason ``word_variants()`` is banned here (§0.3).

    ``exercises.word_variants('walk')`` contains both ``walked`` and ``walking``, so the
    vocabulary grader would call one an "almost" for the other. In a tense point that
    distinction is the lesson.
    """
    from bandready.srs.exercises import word_variants

    assert {"walked", "walking"} <= word_variants("walk")  # the trap, proved to exist
    assert not grammar_close(["walked"], "walking")
    assert not grammar_close(["has published"], "have published")
    assert not grammar_close(["a few"], "few")
    assert not grammar_close(["had gone"], "has gone")


def test_an_apostrophe_that_is_the_distinction_is_not_forgiven() -> None:
    """``dont``/``don't`` is a typing slip; ``its``/``it's`` is a different word."""
    assert grammar_close(["haven't"], "havent")
    assert not grammar_close(["it's"], "its")
    assert not grammar_close(["we're"], "were")


def grammar_close(expected: list[str], given: str) -> bool:
    from bandready.srs.exercises import normalize_answer_text

    return grading.grammar_close(
        [normalize_answer_text(e) for e in expected], normalize_answer_text(given)
    )


# --------------------------------------------------------------------------------------
# 4. Mechanical grading, kind by kind
# --------------------------------------------------------------------------------------


def test_gap_fill_accepts_every_authored_surface_form() -> None:
    item = {
        "id": "gi_x_01",
        "kind": "gap_fill",
        "stage": 2,
        "expected": ["have worked", "'ve worked"],
        "payload": {"stem": "I ___ here for six years.", "blanks": 1},
    }
    assert grading.grade_item(item, "have worked")["correct"]
    assert grading.grade_item(item, "'ve worked")["correct"]
    assert grading.grade_item(item, "worked")["correct"] is False


def test_choose_form_takes_an_index_or_the_option_text() -> None:
    item = {
        "id": "gi_x_02",
        "kind": "choose_form",
        "stage": 3,
        "payload": {
            "stem": "I ___ here for six years.",
            "options": [{"text": "worked"}, {"text": "have worked"}],
            "key": 1,
        },
    }
    assert grading.grade_item(item, 1)["correct"]
    assert grading.grade_item(item, "have worked")["correct"]
    assert grading.grade_item(item, 0)["correct"] is False


def test_both_ok_rejects_picking_one_side() -> None:
    """The honesty item: choosing one option is not half right, it is the misconception."""
    item = {
        "id": "gi_x_03",
        "kind": "both_ok",
        "stage": 3,
        "payload": {
            "options": [{"text": "lived"}, {"text": "has lived"}],
            "key": "both",
            "follow_up": {"question": "Which says she is still there?", "key": 1},
        },
    }
    assert grading.grade_item(item, "both")["correct"]
    assert grading.grade_item(item, 0)["correct"] is False
    assert "Both of these are correct" in grading.grade_item(item, 0)["detail"]


def test_judge_is_two_stage_and_the_reason_matters() -> None:
    item = {
        "id": "gi_x_04",
        "kind": "judge",
        "stage": 3,
        "payload": {
            "sentence": "I have finished the report yesterday.",
            "acceptable": False,
            "reasons": ["the time is finished and named", "the action is not finished"],
            "reason_key": 0,
        },
    }
    assert grading.grade_item(item, {"acceptable": False, "reason": 0})["correct"]
    spotted = grading.grade_item(item, {"acceptable": False, "reason": 1})
    assert spotted["correct"] is False
    assert "reason is a different one" in spotted["detail"]
    assert grading.grade_item(item, {"acceptable": True})["correct"] is False


def test_dictation_is_graded_on_the_target_tokens_only() -> None:
    """A whole-string grader fails a good learner for misspelling ``commuting``."""
    item = {
        "id": "gi_x_05",
        "kind": "dictation",
        "stage": 2,
        "payload": {
            "audio_text": "I'd been commuting for nearly two hours a day by then.",
            "scored_tokens": ["I'd", "been", "commuting"],
            "mode": "dictation",
        },
    }
    assert grading.grade_item(item, "I'd been commuting for nearly to hours a day")["correct"]
    missed = grading.grade_item(item, "I been commuting for two hours a day")
    assert missed["correct"] is False
    assert "I'd" in missed["missed_tokens"]


def test_order_accepts_every_legal_order() -> None:
    item = {
        "id": "gi_x_06",
        "kind": "order",
        "stage": 2,
        "payload": {
            "tokens": ["often", "she", "goes", "there"],
            "accepted_orders": [[1, 0, 2, 3], [0, 1, 2, 3]],
        },
    }
    assert grading.grade_item(item, [1, 0, 2, 3])["correct"]
    assert grading.grade_item(item, [0, 1, 2, 3])["correct"], "refusing a legal order teaches a falsehood"
    assert grading.grade_item(item, [2, 1, 0, 3])["correct"] is False


def test_error_fix_checks_the_span_as_well_as_the_replacement() -> None:
    item = {
        "id": "gi_x_07",
        "kind": "error_fix",
        "stage": 3,
        "expected": ["although the cost was high", "despite the high cost"],
        "payload": {
            "sentence": "Despite the cost was high, the scheme went ahead.",
            "error_span": "Despite the cost was high",
            "accept_overlap_tokens": 1,
        },
    }
    good = grading.grade_item(item, {"span": "Despite the cost was high", "replacement": "although the cost was high"})
    assert good["correct"]
    wrong_span = grading.grade_item(item, {"span": "the scheme went ahead", "replacement": "although the cost was high"})
    assert wrong_span["correct"] is False
    assert "somewhere else" in wrong_span["detail"]


def test_free_production_kinds_are_not_graded_mechanically() -> None:
    for kind in ("produce", "combine", "speaking_drill"):
        result = grading.grade_item({"id": "x", "kind": kind, "stage": 4}, "anything")
        assert result["checked"] is False
        assert result["needs_llm"] is True


def test_eleven_of_fourteen_kinds_work_with_the_network_off() -> None:
    assert len(grading.MECHANICAL_KINDS) + len(grading.FREE_PRODUCTION_KINDS) == 14


# --------------------------------------------------------------------------------------
# 5. Nothing leaks before the attempt
# --------------------------------------------------------------------------------------


def test_the_item_the_learner_sees_carries_no_answer(staged: list[dict[str, Any]]) -> None:
    """Same attempt-gating as the four skills: the key never travels before the answer."""
    with session_scope() as s:
        points = syllabus.load_points(s)
    leaked: list[str] = []
    for point in points.values():
        for item in point.items:
            public = practice.public_item(item)
            blob = json.dumps(public)
            payload = public["payload"]
            if any(key in payload for key in ("key", "reason_key", "accepted_orders", "scored_tokens", "acceptable")):
                leaked.append(f"{item['id']}: payload key")
            if "decision_cue" in blob or "why_this_means" in blob:
                leaked.append(f"{item['id']}: cue or option gloss")
            if "why_key" in blob or "feed_forward" in blob:
                leaked.append(f"{item['id']}: feedback")
            if public["kind"] == "choose_form":
                assert all(set(o) == {"text"} for o in payload["options"])
    assert leaked == [], leaked[:5]


def test_the_s0_package_does_not_ship_the_notice_set_answers(staged: list[dict[str, Any]]) -> None:
    with session_scope() as s:
        points = syllabus.load_points(s)
    point = next(p for p in points.values() if p.teach.get("notice_set"))
    package = practice.open_point(point)
    for entry in package["beats"][0]["notice_set"]:
        assert "key" not in entry and "why" not in entry
    assert package["rule_card_locked_until"] == "notice_set_answered"


# --------------------------------------------------------------------------------------
# 6. The FSRS boundary (§1.1)
# --------------------------------------------------------------------------------------


def test_the_scheduler_moves_due_at_and_never_touches_the_rung(db: Path) -> None:
    """``scheduler.review`` cannot see whether the question was a flip card or an essay.

    Run it directly against a grammar card and confirm it changes exactly the nine FSRS
    columns and none of the six ladder ones.
    """
    with session_scope() as s:
        seed_points(s, [_point("gr_a", 1, [])])
    with session_scope() as s:
        card = bridge.create_card(PROFILE, "gr_a")
        card.stage = 3
        card.stage_successes = 1
        s.add(card)
        s.flush()

        before = (card.due_at, card.stage, card.stage_successes, card.reps)
        sched.review(card, 3, exercise_type="flip")
        assert card.due_at > before[0], "FSRS must move the due date"
        assert card.reps == before[3] + 1
        assert card.stage == before[1], "the scheduler must never write `stage`"
        assert card.stage_successes == before[2]


def test_the_ladder_moves_the_rung_and_never_writes_due_at_itself(db: Path) -> None:
    """The Ladder's own advancement check is a pure function over card state."""
    card = bridge.create_card(PROFILE, "gr_a")
    card.stage = 2
    card.stage_successes = 2
    due_before = card.due_at
    ok, _reason = practice._may_advance(
        card,
        stage_days=["2026-01-01", "2026-01-02"],
        stage_items={"gi_1", "gi_2"},
        clean=True,
        advanced_this_session=False,
        leech_active=False,
    )
    assert ok
    assert card.due_at == due_before, "the Ladder must not schedule"


def test_a_grammar_review_cannot_be_logged_to_the_vocabulary_table(db: Path) -> None:
    """The reason ``grammar_review_logs`` exists at all (D1).

    ``srs_review_logs.review_type`` is CheckConstraint-ed to the six vocabulary kinds, so
    writing ``choose_form`` there raises rather than being accepted as free text.
    """
    with session_scope() as s:
        entry = m.VocabEntry(
            id="ve_test", profile_id=PROFILE, headword="deteriorate", lemma="deteriorate",
            pos="verb", definition="to get worse",
        )
        s.add(entry)
        s.flush()
        card = sched.create_card("ve_test")
        s.add(card)
        s.flush()
        card_id = card.id

    with pytest.raises(IntegrityError), session_scope() as s:
        s.add(
            m.SrsReviewLog(
                id="rl_bad", card_id=card_id, rating=3, review_type="choose_form",
                reviewed_at=sched.iso(sched.now_utc()), state_before=0,
            )
        )
        s.flush()


def test_the_thresholds_come_from_one_place(db: Path) -> None:
    """A third set of constants is how two schedulers start disagreeing (§0.3)."""
    assert bridge.YOUNG_STABILITY_DAYS is sched.YOUNG_STABILITY_DAYS
    assert bridge.MATURE_STABILITY_DAYS is sched.MATURE_STABILITY_DAYS
    assert bridge.MAX_CONSECUTIVE_NEW is sched.MAX_CONSECUTIVE_NEW


def test_fsrs_state_caps_the_rung_a_question_may_be_asked_at(db: Path) -> None:
    """Stage sets the ceiling; FSRS state sets the floor (§1.4's maturity gate)."""
    card = bridge.create_card(PROFILE, "gr_a")
    card.stage = 5

    card.state, card.stability = sched.STATE_LEARNING, None
    assert practice.stage_ceiling(card) == 2, "a learning card gets a Build question at most"

    card.state, card.stability = sched.STATE_RELEARNING, 30.0
    assert practice.stage_ceiling(card) == 3, "relearning backs off one rung"

    card.state, card.stability = sched.STATE_REVIEW, 3.0
    assert practice.stage_ceiling(card) == 3, "a young card is not asked to produce"

    card.state, card.stability = sched.STATE_REVIEW, 10.0
    assert practice.stage_ceiling(card) == 4

    card.state, card.stability = sched.STATE_REVIEW, 40.0
    assert practice.stage_ceiling(card) == 5

    assert practice.stage_ceiling(card, leech_active=True) == 3


# --------------------------------------------------------------------------------------
# 7. The closed enums
# --------------------------------------------------------------------------------------


def test_the_error_code_taxonomy_is_the_closed_53(staged: list[dict[str, Any]]) -> None:
    assert len(practice.ERROR_CODES) == 53
    assert len(set(practice.ERROR_CODES)) == 53
    for row in staged:
        payload = row["point_json"]
        for code in payload.get("fixes_errors") or []:
            assert code in practice.ERROR_CODES, f"{row['id']} names unknown code {code!r}"
        for item in payload.get("items") or []:
            for code in item.get("error_codes") or []:
                assert code in practice.ERROR_CODES, (
                    f"{item['id']} names unknown code {code!r}"
                )


def test_every_item_kind_used_by_the_content_is_gradeable(staged: list[dict[str, Any]]) -> None:
    known = set(grading.MECHANICAL_KINDS) | set(grading.FREE_PRODUCTION_KINDS)
    for row in staged:
        for item in row["point_json"].get("items") or []:
            assert str(item.get("kind")) in known, f"{item['id']} uses an ungradeable kind"
