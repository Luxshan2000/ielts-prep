"""Curriculum, progress, content-pack and pronunciation tests (14-testing-strategy.md).

Covers the three things B7 must prove:

* the study-plan generator's shape for a band-6 → 7 candidate four weeks out (10 §4.3's
  worked example, including the weighting numbers and the two-week taper);
* the estimator's maths — exponential recency decay, per-mode base weights and the
  confidence gate (10 §6.1/§6.2) — plus official IELTS rounding for the overall band;
* `.brpack` import idempotency and whole-pack rejection (11 §11.3).

Everything runs against a throwaway data dir; no network, no real LLM (mock preset).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import delete, text
from ulid import ULID

from bandready.content import loader
from bandready.content.validate import PackError, validate_pack
from bandready.curriculum import adaptive
from bandready.curriculum.estimate import (
    Attempt,
    SKILLS,
    compute_estimates,
    confidence_for,
    current_estimates,
    decay_weight,
    estimate_skill,
    iso,
    overall_estimate,
    recompute,
    round_ielts,
    utcnow,
)
from bandready.curriculum.plan import (
    PlanProfile,
    active_plan,
    build_plan,
    compute_streak,
    generate_plan,
    log_activity_minutes,
    weekly_weights,
)
from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope

PROFILE_ID = "default"


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    root = tmp_path_factory.mktemp("bandready-curriculum")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(root))
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.setenv("BANDREADY_AUTH_TOKEN", "")
        from bandready.config import reset_settings_cache

        reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        try:
            yield root
        finally:
            db_engine.reset_engine()
            reset_settings_cache()


@pytest.fixture()
def db(data_dir: Path) -> Iterator[Path]:
    """Fresh profile per test; the profile cascade clears every learner table."""
    with session_scope() as s:
        s.execute(delete(m.Profile))
        s.execute(delete(m.MediaFile))
        s.execute(text("DELETE FROM reading_questions"))
        s.execute(text("DELETE FROM listening_questions"))
        s.execute(delete(m.ReadingTest))
        s.execute(delete(m.ListeningTest))
        s.execute(delete(m.ReadingPassage))
        s.execute(delete(m.ListeningScript))
        s.execute(delete(m.SpeakingCard))
        s.execute(delete(m.CardSet))
        s.execute(delete(m.WritingPrompt))
        s.execute(delete(m.VocabPackEntry))
        s.execute(delete(m.ContentPack))
        s.execute(delete(m.Topic))
        s.add(
            m.Profile(
                id=PROFILE_ID,
                name="Test Learner",
                exam_format="academic",
                target_band=7.0,
                daily_minutes=60,
                self_level="intermediate",
                study_days_json=json.dumps(["mon", "tue", "wed", "thu", "fri", "sat"]),
            )
        )
    yield data_dir


def seed_estimates(session: Any, bands: dict[str, float], confidence: str = "medium") -> None:
    for skill, band in bands.items():
        session.execute(
            text(
                "INSERT INTO band_estimates (id, profile_id, skill, estimate_raw, band, "
                "range_low, range_high, confidence, n_eff, attempts_used, method) VALUES "
                "(:id, :pid, :skill, :band, :band, :lo, :hi, :conf, 5.0, 5, 'estimator')"
            ),
            {
                "id": f"be_{ULID()}",
                "pid": PROFILE_ID,
                "skill": skill,
                "band": band,
                "lo": band - 0.5,
                "hi": band + 0.5,
                "conf": confidence,
            },
        )


# --------------------------------------------------------------------------------------
# 1. Study-plan generation (10 §4)
# --------------------------------------------------------------------------------------


def test_weekly_weights_matches_the_worked_example() -> None:
    """10 §4.3: L 6.5 R 6.5 W 5.5 S 6.0 vs target 7.0 → 15/15/42/28 %."""
    weights = weekly_weights(
        7.0, {"listening": 6.5, "reading": 6.5, "writing": 5.5, "speaking": 6.0}
    )
    assert weights["listening"] == pytest.approx(0.15, abs=0.005)
    assert weights["reading"] == pytest.approx(0.15, abs=0.005)
    assert weights["writing"] == pytest.approx(0.42, abs=0.005)
    assert weights["speaking"] == pytest.approx(0.28, abs=0.005)
    assert sum(weights.values()) == pytest.approx(1.0)


def test_weekly_weights_keeps_a_maintenance_gap_at_target() -> None:
    """A learner already at target still gets a floor-respecting split, never zeros."""
    weights = weekly_weights(6.5, dict.fromkeys(SKILLS, 8.0))
    assert all(w >= 0.15 for w in weights.values())
    assert sum(weights.values()) == pytest.approx(1.0)


def test_plan_for_band_6_to_7_four_weeks_out(db: Path) -> None:
    today = date(2026, 7, 27)  # a Monday
    exam = today + timedelta(days=28)
    with session_scope() as s:
        s.execute(
            text("UPDATE profiles SET target_band = 7.0, exam_date = :d WHERE id = :pid"),
            {"d": exam.isoformat(), "pid": PROFILE_ID},
        )
        seed_estimates(
            s, {"listening": 6.5, "reading": 6.5, "writing": 5.5, "speaking": 6.0}
        )
        plan = generate_plan(s, PROFILE_ID, today=today, seed=7)

    assert plan["horizon_weeks"] == 4
    assert plan["goal_band"] == 7.0
    assert len(plan["weights_by_week"]) == 4

    phases = [w["phase"] for w in plan["weights_by_week"]]
    assert phases == ["build", "build", "taper", "taper"], "final 2 weeks taper (10 §4.1)"

    week1 = plan["weights_by_week"][0]
    assert week1["writing"] > week1["speaking"] > week1["listening"]
    assert week1["listening"] == pytest.approx(0.15, abs=0.005)

    sessions = plan["sessions"]
    assert sessions, "a plan must schedule sessions"
    assert len(sessions) == 24, "6 study days × 4 weeks"
    assert all(s["date"] >= today.isoformat() for s in sessions)
    assert all(s["status"] == "scheduled" for s in sessions)

    build = [s for s in sessions if s["phase"] == "build"]
    taper = [s for s in sessions if s["phase"] == "taper"]
    assert len(build) == 12 and len(taper) == 12

    # Every build session is the fixed three-block skeleton for the 60-minute variant.
    for session_row in build:
        kinds = [b["kind"] for b in session_row["blocks"]]
        assert kinds == ["warmup_srs", "main", "micro_drill"]
        assert session_row["blocks"][0]["params"]["max_cards"] == 20
        assert session_row["blocks"][0]["minutes"] == 10
        assert session_row["blocks"][2]["minutes"] == 10

    # Variety rule: never the same main skill three days running.
    mains = [
        b["module"]
        for s in build
        for b in s["blocks"]
        if b["kind"] == "main" and b["module"] in SKILLS
    ]
    assert not any(
        mains[i] == mains[i + 1] == mains[i + 2] for i in range(len(mains) - 2)
    ), f"variety rule broken: {mains}"

    # Taper: two full mocks per week + no new vocabulary cards.
    mocks = [
        b for s in taper for b in s["blocks"] if b.get("activity") == "full_mock"
    ]
    assert len(mocks) >= 4, "2 full mocks per taper week (10 §4.1)"
    warmups = [b for s in taper for b in s["blocks"] if b["kind"] == "warmup_srs"]
    assert warmups and all(b["params"].get("new_cards") == 0 for b in warmups)

    with session_scope() as s:
        stored = active_plan(s, PROFILE_ID)
    assert stored is not None
    assert stored["plan_id"] == plan["plan_id"]
    assert len(stored["sessions"]) == len(sessions)


def test_plan_is_deterministic_for_the_same_seed(db: Path) -> None:
    today = date(2026, 7, 27)
    profile = PlanProfile(
        profile_id=PROFILE_ID,
        target_band=7.0,
        exam_date=today + timedelta(days=28),
        daily_minutes=60,
        study_days=["mon", "tue", "wed", "thu", "fri", "sat"],
    )
    estimates = {
        skill: estimate_skill(skill, [], self_level="intermediate") for skill in SKILLS
    }
    first = build_plan(profile, estimates, today=today, seed=42)
    second = build_plan(profile, estimates, today=today, seed=42)
    strip = lambda plan: [  # noqa: E731 — ids are ULIDs and intentionally differ
        {k: v for k, v in s.items() if k != "session_id"} for s in plan["sessions"]
    ]
    assert strip(first) == strip(second)
    assert first["weights_by_week"] == second["weights_by_week"]


def test_plan_without_an_exam_date_uses_a_rolling_horizon_and_no_taper(db: Path) -> None:
    with session_scope() as s:
        plan = generate_plan(s, PROFILE_ID, today=date(2026, 7, 27), seed=3)
    assert plan["horizon_weeks"] == 8
    assert {w["phase"] for w in plan["weights_by_week"]} == {"build"}
    assert all(s["phase"] == "build" for s in plan["sessions"])


def test_regeneration_supersedes_the_previous_plan(db: Path) -> None:
    with session_scope() as s:
        first = generate_plan(s, PROFILE_ID, today=date(2026, 7, 27), seed=1)
        second = generate_plan(s, PROFILE_ID, today=date(2026, 7, 27), seed=2)
        row = s.execute(
            text("SELECT superseded_by FROM study_plans WHERE id = :id"),
            {"id": first["plan_id"]},
        ).first()
        active = active_plan(s, PROFILE_ID)
    assert row is not None and row[0] == second["plan_id"]
    assert active is not None and active["plan_id"] == second["plan_id"]


# --------------------------------------------------------------------------------------
# 2. Estimator maths (10 §6)
# --------------------------------------------------------------------------------------


def attempt(band: float, days_ago: float, mode: str = "practice") -> Attempt:
    return Attempt(
        attempt_id=f"a_{ULID()}",
        skill="writing",
        mode=mode,
        band=band,
        at=utcnow() - timedelta(days=days_ago),
    )


def test_recency_decay_halves_a_14_day_old_attempt() -> None:
    now = utcnow()
    fresh = attempt(7.0, 0)
    old = attempt(7.0, 14)
    assert decay_weight(fresh, now) == pytest.approx(1.0, abs=1e-6)
    assert decay_weight(old, now) == pytest.approx(0.5, abs=1e-3)
    assert decay_weight(attempt(7.0, 28), now) == pytest.approx(0.25, abs=1e-3)


def test_mode_base_weights_double_placement_and_mock() -> None:
    now = utcnow()
    assert decay_weight(attempt(7.0, 0, "placement"), now) == pytest.approx(2.0, abs=1e-6)
    assert decay_weight(attempt(7.0, 0, "mock"), now) == pytest.approx(2.0, abs=1e-6)
    assert decay_weight(attempt(7.0, 0, "practice"), now) == pytest.approx(1.0, abs=1e-6)
    assert decay_weight(attempt(7.0, 0, "micro"), now) == pytest.approx(0.5, abs=1e-6)


def test_decayed_weighted_mean_favours_the_recent_attempt() -> None:
    """band 6 today (w 1.0) + band 8 two weeks ago (w 0.5) → 6.67 raw → 6.5 display."""
    est = estimate_skill("writing", [attempt(8.0, 14), attempt(6.0, 0)])
    assert est.estimate_raw == pytest.approx(6.6667, abs=0.01)
    assert est.band == 6.5
    assert est.n_eff == pytest.approx(1.5, abs=0.01)
    assert est.attempts_used == 2


def test_confidence_gate_thresholds() -> None:
    now = utcnow()
    fresh = now - timedelta(days=1)
    assert confidence_for(1.9, fresh, now)[0] == "insufficient"
    assert confidence_for(2.0, fresh, now)[0] == "low"
    assert confidence_for(3.9, fresh, now)[0] == "low"
    assert confidence_for(4.0, fresh, now)[0] == "medium"
    assert confidence_for(7.9, fresh, now)[0] == "medium"
    assert confidence_for(8.0, fresh, now)[0] == "high"
    # "high" also needs the newest attempt inside 7 days.
    assert confidence_for(9.0, now - timedelta(days=10), now)[0] == "medium"
    # Staleness beyond 21 days drops one level and raises the stale flag.
    stale_conf, stale = confidence_for(9.0, now - timedelta(days=30), now)
    assert stale is True and stale_conf == "low"


def test_insufficient_evidence_gates_the_band_and_ranges_widen() -> None:
    single = estimate_skill("writing", [attempt(7.0, 0)])
    assert single.n_eff == pytest.approx(1.0)
    assert single.confidence == "insufficient"
    assert single.as_dict()["band"] is None
    assert single.as_dict()["display"] == "—"

    two_mocks = estimate_skill("writing", [attempt(7.0, 0, "mock"), attempt(7.0, 0, "mock")])
    assert two_mocks.n_eff == pytest.approx(4.0)
    assert two_mocks.confidence == "medium"
    assert (two_mocks.range_high - two_mocks.range_low) == pytest.approx(1.0)
    assert two_mocks.as_dict()["display"] == "7.0 (likely 6.5–7.5)"


def test_no_attempts_falls_back_to_the_self_assessed_band() -> None:
    est = estimate_skill("speaking", [], self_level="upper")
    assert est.band == 6.5
    assert est.method == "self_assessed"
    assert est.confidence == "insufficient"
    assert est.range_low == 5.5 and est.range_high == 7.5


def test_criterion_estimates_use_the_same_decay() -> None:
    now = utcnow()
    older = Attempt("a1", "writing", "practice", 6.0, now - timedelta(days=14), {"GRA": 5.0})
    newer = Attempt("a2", "writing", "practice", 6.0, now, {"GRA": 6.5})
    est = estimate_skill("writing", [older, newer], now=now)
    # (6.5*1.0 + 5.0*0.5) / 1.5 = 6.0
    assert est.criteria["GRA"] == 6.0


@pytest.mark.parametrize(
    ("bands", "expected"),
    [
        ((6.5, 6.5, 5.5, 6.0), 6.0),  # mean 6.125 → 6.0
        ((6.5, 6.5, 5.5, 6.5), 6.5),  # mean 6.25  → rounds UP
        ((7.0, 7.0, 6.5, 7.0), 7.0),  # mean 6.875 → 7.0
        ((7.0, 7.0, 6.5, 6.5), 7.0),  # mean 6.75  → rounds UP to the whole band
        ((6.0, 6.0, 6.0, 6.0), 6.0),
    ],
)
def test_overall_band_uses_official_ielts_rounding(
    bands: tuple[float, ...], expected: float
) -> None:
    per_skill = {
        skill: estimate_skill(skill, [Attempt("x", skill, "mock", band, utcnow())])
        for skill, band in zip(SKILLS, bands, strict=True)
    }
    assert overall_estimate(per_skill).band == expected
    assert round_ielts(sum(bands) / 4) == expected


def test_overall_confidence_is_the_minimum_of_the_four_skills() -> None:
    per_skill = {
        "listening": estimate_skill("listening", [attempt(7.0, 0, "mock"), attempt(7.0, 0, "mock")]),
        "reading": estimate_skill("reading", [attempt(7.0, 0, "mock"), attempt(7.0, 0, "mock")]),
        "writing": estimate_skill("writing", [attempt(7.0, 0)]),
        "speaking": estimate_skill("speaking", [attempt(7.0, 0, "mock"), attempt(7.0, 0, "mock")]),
    }
    for skill, est in per_skill.items():  # rebuild with the right skill labels
        est.skill = skill
    assert overall_estimate(per_skill).confidence == "insufficient"


# --------------------------------------------------------------------------------------
# 3. Estimator against the real scored_attempts view
# --------------------------------------------------------------------------------------


def add_reading_attempt(session: Any, band: float, mode: str = "practice", days_ago: int = 0) -> str:
    attempt_id = f"ps_{ULID()}"
    when = iso(utcnow() - timedelta(days=days_ago))
    passage_id = f"rp_{ULID()}"
    session.execute(
        text(
            "INSERT INTO reading_passages (id, format, title, word_count, band_target, "
            "passage_json, source) VALUES (:id, 'academic', 'T', 800, 6.5, '{}', 'pack')"
        ),
        {"id": passage_id},
    )
    session.execute(
        text(
            "INSERT INTO practice_sessions (id, profile_id, module, activity, started_at, "
            "ended_at) VALUES (:id, :pid, 'reading', 'passage', :at, :at)"
        ),
        {"id": attempt_id, "pid": PROFILE_ID, "at": when},
    )
    session.execute(
        text(
            "INSERT INTO reading_attempts (id, passage_id, mode, status, raw_score, "
            "total_questions, band, duration_s, submitted_at) VALUES (:id, :p, :mode, "
            "'submitted', 10, 13, :band, 1100, :at)"
        ),
        {"id": attempt_id, "p": passage_id, "mode": mode, "band": band, "at": when},
    )
    return attempt_id


def test_estimator_reads_the_view_and_appends_band_estimates(db: Path) -> None:
    with session_scope() as s:
        add_reading_attempt(s, 6.5, "exam")  # mode='exam' + no test_id → 'practice'
        add_reading_attempt(s, 7.0, "practice")
        estimates = recompute(s, PROFILE_ID)

        assert estimates["reading"].attempts_used == 2
        assert estimates["reading"].band in (6.5, 7.0)

        rows = s.execute(
            text("SELECT skill, method FROM band_estimates WHERE profile_id = :pid"),
            {"pid": PROFILE_ID},
        ).all()
        skills = {r[0] for r in rows}
        assert skills == {*SKILLS, "overall"}

        view = s.execute(
            text("SELECT skill, band FROM current_band_estimates WHERE profile_id = :pid")
        ).all()
        assert len(view) == 5

        # A second identical run appends nothing (the log stays meaningful).
        before = len(rows)
        recompute(s, PROFILE_ID)
        after = s.execute(
            text("SELECT COUNT(*) FROM band_estimates WHERE profile_id = :pid"),
            {"pid": PROFILE_ID},
        ).scalar()
        assert after == before


def test_placement_result_seeds_the_estimator_at_double_weight(db: Path) -> None:
    document = {
        "taken_at": iso(utcnow()),
        "estimates": {
            "reading": {"band": 6.5, "evidence": {"correct": 6, "of": 8}},
            "listening": {"band": 6.0, "evidence": {"correct": 5, "of": 8}},
            "writing": {"band": 5.5, "evidence": {"criteria": {"TA": 6.0, "CC": 5.0}}},
            "speaking": {"band": 6.0, "skipped": True, "evidence": {"self_level": "intermediate"}},
        },
        "confidence": "medium",
    }
    with session_scope() as s:
        s.execute(
            text(
                "INSERT INTO placement_results (id, profile_id, taken_at, estimates_json) "
                "VALUES (:id, :pid, :at, :doc)"
            ),
            {
                "id": f"pe_{ULID()}",
                "pid": PROFILE_ID,
                "at": document["taken_at"],
                "doc": json.dumps(document),
            },
        )
        estimates = compute_estimates(s, PROFILE_ID)

    assert estimates["reading"].band == 6.5
    assert estimates["reading"].n_eff == pytest.approx(2.0, abs=0.01), "placement counts ×2"
    assert estimates["reading"].confidence == "low"
    assert estimates["writing"].criteria["TA"] == 6.0
    # A skipped section is NOT an attempt — it falls back to the self-rating.
    assert estimates["speaking"].method == "self_assessed"
    assert estimates["speaking"].attempts_used == 0


def test_current_estimates_recomputes_when_the_view_is_empty(db: Path) -> None:
    with session_scope() as s:
        estimates = current_estimates(s, PROFILE_ID)
    assert set(estimates) >= {*SKILLS, "overall"}
    assert estimates["writing"].confidence == "insufficient"


# --------------------------------------------------------------------------------------
# 4. Streak + activity (10 §9)
# --------------------------------------------------------------------------------------


def test_streak_counts_study_days_and_ignores_configured_rest_days(db: Path) -> None:
    study_days = ["mon", "tue", "wed", "thu", "fri", "sat"]
    today = date(2026, 7, 27)  # Monday
    with session_scope() as s:
        for offset in range(4):  # Fri, Sat, (Sun rest), Mon
            day = today - timedelta(days=offset)
            log_activity_minutes(s, PROFILE_ID, day.isoformat(), 60, 60, study_days)
        streak = compute_streak(s, PROFILE_ID, study_days, today=today)
    assert streak["current"] == 3, "Sunday is a rest day and must not break the streak"
    assert streak["today_goal_met"] is True


def test_partial_minutes_do_not_meet_the_goal(db: Path) -> None:
    with session_scope() as s:
        row = log_activity_minutes(s, PROFILE_ID, "2026-07-27", 20, 60, ["mon"])
    assert row["minutes"] == 20 and row["goal_met"] is False


# --------------------------------------------------------------------------------------
# 5. Adaptive rules (10 §8)
# --------------------------------------------------------------------------------------


def add_writing_submission(
    session: Any, band: float, criteria: dict[str, float], days_ago: int = 0
) -> str:
    prompt_id = f"wp_{ULID()}"
    submission_id = f"ps_{ULID()}"
    when = iso(utcnow() - timedelta(days=days_ago))
    session.execute(
        text(
            "INSERT INTO writing_prompts (id, task_type, genre, prompt_text, source) "
            "VALUES (:id, 'task2', 'opinion', 'Discuss.', 'pack')"
        ),
        {"id": prompt_id},
    )
    session.execute(
        text(
            "INSERT INTO practice_sessions (id, profile_id, module, activity, started_at, "
            "ended_at) VALUES (:id, :pid, 'writing', 'task2', :at, :at)"
        ),
        {"id": submission_id, "pid": PROFILE_ID, "at": when},
    )
    session.execute(
        text(
            "INSERT INTO writing_submissions (id, prompt_id, mode, status, essay_text, "
            "word_count, overall_band, submitted_at) VALUES (:id, :p, 'practice', 'scored', "
            "'essay', 260, :band, :at)"
        ),
        {"id": submission_id, "p": prompt_id, "band": band, "at": when},
    )
    session.execute(
        text(
            "INSERT INTO writing_evaluations (id, submission_id, llm_evaluation_id, band_ta, "
            "band_cc, band_lr, band_gra, overall_band, annotations_json, created_at) VALUES "
            "(:id, :sub, :llm, :ta, :cc, :lr, :gra, :band, '[]', :at)"
        ),
        {
            "id": f"we_{ULID()}",
            "sub": submission_id,
            "llm": f"le_{ULID()}",
            "ta": criteria.get("TA", 6.0),
            "cc": criteria.get("CC", 6.0),
            "lr": criteria.get("LR", 6.0),
            "gra": criteria.get("GRA", 6.0),
            "band": band,
            "at": when,
        },
    )
    return submission_id


def test_gra_low_streak_fires_and_rewrites_the_micro_drill(db: Path) -> None:
    with session_scope() as s:
        generate_plan(s, PROFILE_ID, today=utcnow().date(), seed=5)
        for days_ago in (3, 2, 1):
            add_writing_submission(s, 5.5, {"GRA": 5.0, "TA": 6.5}, days_ago=days_ago)
        fired = adaptive.evaluate(s, PROFILE_ID)

        rule_ids = [f["rule_id"] for f in fired]
        assert "gra-low-streak" in rule_ids
        firing = next(f for f in fired if f["rule_id"] == "gra-low-streak")
        assert len(firing["evidence"]["attempt_ids"]) == 3
        assert firing["action"]["activity_tag"] == "grammar"
        assert firing["sessions_changed"], "the plan must actually change, not just advise"

        changed = s.execute(
            text("SELECT blocks_json FROM plan_sessions WHERE id = :id"),
            {"id": firing["sessions_changed"][0]},
        ).scalar()
        drill = [b for b in json.loads(changed) if b["kind"] == "micro_drill"][0]
        assert drill["activity"] == "gra_complex_sentences"

        # Cooldown: a second evaluation the same day does not re-fire the rule.
        again = adaptive.evaluate(s, PROFILE_ID)
        assert "gra-low-streak" not in [f["rule_id"] for f in again]

        callouts = adaptive.recent_events(s, PROFILE_ID)
        assert callouts and callouts[0]["evidence"] and callouts[0]["action"]


def test_at_most_two_rules_fire_per_day(db: Path) -> None:
    with session_scope() as s:
        generate_plan(s, PROFILE_ID, today=utcnow().date(), seed=6)
        for days_ago in (3, 2, 1):
            add_writing_submission(s, 5.0, {"GRA": 5.0, "TA": 5.0}, days_ago=days_ago)
        fired = adaptive.evaluate(s, PROFILE_ID, daily_rollover=True)
    assert 0 < len(fired) <= 2


# --------------------------------------------------------------------------------------
# 6. Content-pack import (11 §11)
# --------------------------------------------------------------------------------------


def reading_passage_doc(prefix: str, first_number: int, answer: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "title": f"{prefix} passage",
        "texts": [
            {
                "id": "t1",
                "paragraphs": [
                    {"id": "A", "text": "Coastal cities have grown quickly in recent decades."},
                    {"id": "B", "text": "Planners now argue for denser, better-served districts."},
                ],
            }
        ],
        "question_groups": [
            {
                "id": "g1",
                "type": "sentence_completion",
                "word_limit": {"max_words": 2, "numbers_allowed": True},
                "questions": [
                    {
                        "number": first_number + i,
                        "prompt": "Cities grew because of {{gap}}.",
                        "answers": [{"value": answer}],
                        "anchor_paragraphs": ["A"],
                        "evidence_quote": "Coastal cities have grown quickly",
                        "explanation": "Paraphrase of paragraph A.",
                    }
                    for i in range(8)
                ],
            }
        ],
    }


def listening_script_doc() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "part": 2,
        "title": "Museum tour briefing",
        "speakers": [{"id": "s1", "name": "Guide", "role": "female_1", "accent": "uk"}],
        "lines": [{"speaker": "s1", "text": "Welcome to the museum tour.", "pause_after_ms": 300}],
        "questions": [
            {
                "n": i + 1,
                "type": "form_completion",
                "instruction": "Write ONE WORD.",
                "word_limit": {"words": 1, "numbers": 1},
                "prompt": "The tour starts at the ______.",
                "answers": [["entrance"]],
                "cue_line_index": 0,
            }
            for i in range(8)
        ],
    }


DISCLAIMER = (
    "BandReady is an independent open-source project and is not affiliated with, endorsed "
    "by, or connected to the IELTS Partners. All practice materials are original."
)


def write_fixture_pack(root: Path, version: str = "1.0.0", drop_hard: bool = False) -> Path:
    """A tiny valid `.brpack` directory — NEVER written into content/core-en."""
    root.mkdir(parents=True, exist_ok=True)
    data = root / "data"
    data.mkdir(exist_ok=True)

    rows: dict[str, list[dict[str, Any]]] = {
        "topics.jsonl": [{"id": "urbanisation", "label": "Urbanisation", "category": "society"}],
        "reading_passages.jsonl": [
            {
                "id": "rp_easy",
                "format": "academic",
                "title": "Coastal growth (band 5–6)",
                "topic_id": "urbanisation",
                "word_count": 820,
                "band_target": 5.5,
                "passage_json": reading_passage_doc("Easy", 1, "trade"),
            }
        ],
        "listening_scripts.jsonl": [
            {
                "id": "ls_part2",
                "part": 2,
                "title": "Museum tour briefing",
                "topic_id": "urbanisation",
                "accent_set": "uk",
                "target_band": 6.0,
                "script_json": listening_script_doc(),
            }
        ],
        "writing_prompts.jsonl": [
            {
                "id": "wp_ac1",
                "task_type": "ac_task1",
                "genre": "line_graph",
                "topic_id": "urbanisation",
                "difficulty": 2,
                "prompt_text": "Summarise the information in the chart below.",
                "chart_spec": {"kind": "line", "series": [{"label": "City A", "points": [1, 2]}]},
            }
        ],
        "speaking_cards.jsonl": [
            {
                "id": "sc_p1",
                "part": 1,
                "title": "Where you live",
                "topic_id": "urbanisation",
                "difficulty": "core",
                "tags_json": ["home"],
                "payload_json": {
                    "questions": [
                        "Where do you live?",
                        "What do you like about it?",
                        "Would you like to move?",
                        "How has it changed?",
                    ]
                },
            }
        ],
        "vocab.jsonl": [
            {
                "id": "vp_congestion",
                "lemma": "congestion",
                "pos": "noun",
                "deck": "urban",
                "entry_json": {"definition": "Crowding of traffic or people."},
            }
        ],
        "pron_pairs.jsonl": [
            {
                "id": "mp_pack_bit_beat",
                "a": "bit",
                "b": "beat",
                "contrast": "ɪ–iː",
                "sentence_a": "Just a bit more.",
                "sentence_b": "Feel the beat.",
                "tags": ["vowel"],
            }
        ],
    }
    if not drop_hard:
        rows["reading_passages.jsonl"].append(
            {
                "id": "rp_hard",
                "format": "academic",
                "title": "Coastal growth (band 7–8)",
                "topic_id": "urbanisation",
                "word_count": 900,
                "band_target": 7.5,
                "passage_json": reading_passage_doc("Hard", 1, "commerce"),
            }
        )

    for name, lines in rows.items():
        (data / name).write_text(
            "\n".join(json.dumps(line, ensure_ascii=False) for line in lines) + "\n",
            encoding="utf-8",
        )

    checksums = {
        f"data/{name}": "sha256:" + hashlib.sha256((data / name).read_bytes()).hexdigest()
        for name in rows
    }
    manifest = {
        "manifest_version": 1,
        "id": "org.bandready.test",
        "version": version,
        "name": "BandReady Test Bank",
        "description": "Fixture pack used only by the test suite.",
        "publisher": "BandReady contributors",
        "license": "CC0-1.0",
        "disclaimer": DISCLAIMER,
        "ai_disclosure": "human",
        "built_with": {"tool": "pytest", "tool_version": "0"},
        "counts": {name.split(".")[0]: len(lines) for name, lines in rows.items()},
        "checksums": checksums,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return root


def test_fixture_pack_validates(tmp_path: Path) -> None:
    report = validate_pack(write_fixture_pack(tmp_path / "pack"))
    assert report.ok, report.errors
    assert report.pack_id == "org.bandready.test"
    assert report.counts["reading_passages"] == 2
    assert report.counts["listening_scripts"] == 1


def test_pack_import_is_idempotent(db: Path, tmp_path: Path) -> None:
    pack = write_fixture_pack(tmp_path / "pack")

    with session_scope() as s:
        first = loader.import_pack(s, pack)
    assert first["status"] == "installed"
    assert first["counts"]["reading_passages"] == 2
    assert first["counts"]["reading_questions"] == 16
    assert first["counts"]["listening_questions"] == 8

    def snapshot() -> dict[str, int]:
        with session_scope() as s:
            return {
                table: int(
                    s.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
                )
                for table in (
                    "content_packs",
                    "topics",
                    "reading_passages",
                    "reading_questions",
                    "listening_scripts",
                    "listening_questions",
                    "writing_prompts",
                    "speaking_cards",
                    "vocab_pack_entries",
                )
            }

    after_first = snapshot()

    with session_scope() as s:
        second = loader.import_pack(s, pack)
    assert second["status"] == "already_installed"
    assert snapshot() == after_first, "a second import must not duplicate or drop rows"

    # --repair re-verifies and rewrites, still without duplicating anything.
    with session_scope() as s:
        repaired = loader.import_pack(s, pack, repair=True)
    assert repaired["status"] == "repaired"
    assert snapshot() == after_first

    with session_scope() as s:
        packs = loader.list_packs(s)
        provenance = s.execute(
            text("SELECT source, pack_id, pack_version, license FROM reading_passages LIMIT 1")
        ).mappings().first()
    assert [p["pack_id"] for p in packs] == ["org.bandready.test"]
    assert provenance is not None
    assert dict(provenance) == {
        "source": "pack",
        "pack_id": "org.bandready.test",
        "pack_version": "1.0.0",
        "license": "CC0-1.0",
    }


def test_pack_upgrade_retires_rows_absent_from_the_new_version(db: Path, tmp_path: Path) -> None:
    with session_scope() as s:
        loader.import_pack(s, write_fixture_pack(tmp_path / "v1", version="1.0.0"))
    with session_scope() as s:
        loader.import_pack(
            s, write_fixture_pack(tmp_path / "v2", version="1.1.0", drop_hard=True)
        )
        rows = dict(
            s.execute(text("SELECT id, retired FROM reading_passages")).all()  # type: ignore[arg-type]
        )
        enabled = s.execute(
            text("SELECT version, enabled FROM content_packs ORDER BY version")
        ).all()
    assert rows["rp_hard"] == 1, "dropped rows are retired, never deleted (attempt FKs)"
    assert rows["rp_easy"] == 0
    assert enabled == [("1.0.0", 0), ("1.1.0", 1)]


def test_pack_import_rejects_a_bad_checksum(db: Path, tmp_path: Path) -> None:
    pack = write_fixture_pack(tmp_path / "pack")
    (pack / "data" / "vocab.jsonl").write_text('{"id":"x","lemma":"x","deck":"d","entry_json":{}}\n')
    with pytest.raises(PackError) as excinfo, session_scope() as s:
        loader.import_pack(s, pack)
    assert any("checksum mismatch" in e for e in excinfo.value.report.errors)
    with session_scope() as s:
        assert s.execute(text("SELECT COUNT(*) FROM content_packs")).scalar() == 0


def test_pack_import_rejects_an_unlisted_file(db: Path, tmp_path: Path) -> None:
    pack = write_fixture_pack(tmp_path / "pack")
    (pack / "data" / "extra.jsonl").write_text('{"id": "nope"}\n')
    report = validate_pack(pack)
    assert not report.ok
    assert any("not listed in manifest.checksums" in e for e in report.errors)


def test_pack_import_from_a_brpack_archive(db: Path, tmp_path: Path) -> None:
    import zipfile

    pack = write_fixture_pack(tmp_path / "pack")
    archive = tmp_path / "org.bandready.test-1.0.0.brpack"
    with zipfile.ZipFile(archive, "w") as zf:
        for path in sorted(pack.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(pack).as_posix())
    with session_scope() as s:
        result = loader.import_pack(s, archive)
    assert result["status"] == "installed"
    assert result["counts"]["reading_questions"] == 16


def test_seed_if_empty_is_a_noop_once_a_pack_is_installed(db: Path, tmp_path: Path) -> None:
    with session_scope() as s:
        loader.import_pack(s, write_fixture_pack(tmp_path / "pack"))
    with session_scope() as s:
        assert loader.seed_if_empty(s) is None


def test_pack_authored_minimal_pairs_merge_into_the_drill_bank(db: Path, tmp_path: Path) -> None:
    from bandready.pron import analyze as pron

    with session_scope() as s:
        loader.import_pack(s, write_fixture_pack(tmp_path / "pack"))
    ids = {p["id"] for p in pron.minimal_pairs()}
    assert "mp_ship_sheep" in ids, "built-in bank still present"
    assert "mp_pack_bit_beat" in ids, "pack-authored pairs merge in (09 §5.3)"
