"""Rule-based study-plan generator — 10-curriculum-progress.md §4/§5.

Deliberately non-ML and deterministic: the same profile + estimates + seed always produce
the same plan, so "Regenerate" is reproducible and testable (14-testing-strategy.md).

Shape produced (10 §4.4), persisted as one ``study_plans`` row plus one ``plan_sessions``
row per scheduled day:

    {plan_id, generated_at, horizon_weeks, weights_by_week: [...], sessions: [
       {session_id, date, phase, duration_min, blocks: [...], status}]}
"""

from __future__ import annotations

import json
import logging
import math
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from ulid import ULID

from bandready.curriculum.estimate import (
    SKILLS,
    SkillEstimate,
    current_estimates,
    iso,
    utcnow,
    weakest_criteria,
)

_log = logging.getLogger("bandready.curriculum.plan")

FLOOR = 0.15  # no skill ever gets < 15% of weekly minutes
MIN_GAP = 0.25  # even at/above target, keep a maintenance gap
DEFAULT_HORIZON_WEEKS = 8
TAPER_WEEKS = 2
MAX_HORIZON_WEEKS = 26

WEEKDAYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# 10 §5 — fixed three-block skeleton, minutes by daily variant.
VARIANTS: dict[int, dict[str, int]] = {
    30: {"warmup": 5, "max_cards": 10, "main": 20, "micro": 5},
    60: {"warmup": 10, "max_cards": 20, "main": 40, "micro": 10},
    90: {"warmup": 10, "max_cards": 25, "main": 60, "micro": 15},
}

# Section-length tests (10 §4.1 "one full section-length test per week").
SECTION_TEST_MINUTES: dict[str, int] = {
    "listening": 30,
    "reading": 60,
    "writing": 60,
    "speaking": 15,
}

# Full mock block: Listening ~30 + Reading 60 + Writing 60 + transitions (10 §10).
MOCK_MINUTES = 155
MOCK_SPEAKING_MINUTES = 45

ACTIVITIES: dict[str, tuple[str, ...]] = {
    "writing": ("task2_essay", "task1_report", "task2_essay", "rewrite_with_feedback"),
    "speaking": ("p2_long_turn", "p1_interview", "p3_discussion", "p2_long_turn"),
    "reading": ("passage_timed", "qtype_drill", "passage_timed", "skimming_set"),
    "listening": ("part_set", "part34_set", "dictation", "part_set"),
}

# Micro-drill targeting the current weakest criterion (10 §5/§8).
CRITERION_DRILL: dict[str, tuple[str, str]] = {
    "GRA": ("writing", "gra_complex_sentences"),
    "CC": ("writing", "cc_cohesion_linkers"),
    "TA": ("writing", "ta_answer_the_question"),
    "LR": ("vocab", "lr_paraphrase_sprint"),
    "FC": ("speaking", "fc_fluency_shadowing"),
    "P": ("speaking", "minimal_pairs"),
}
DEFAULT_DRILL = ("vocab", "vocab_recall_sprint")


# --------------------------------------------------------------------------------------
# Profile
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class PlanProfile:
    profile_id: str
    target_band: float
    exam_date: date | None
    daily_minutes: int
    study_days: list[str]
    exam_format: str = "academic"
    self_level: str | None = None

    @property
    def variant(self) -> dict[str, int]:
        return VARIANTS.get(self.daily_minutes, VARIANTS[60])


def load_profile(session: Any, profile_id: str) -> PlanProfile:
    row = session.execute(
        text(
            "SELECT target_band, exam_date, daily_minutes, study_days_json, exam_format, "
            "self_level FROM profiles WHERE id = :pid"
        ),
        {"pid": profile_id},
    ).mappings().first()
    if row is None:
        return PlanProfile(profile_id, 6.5, None, 60, list(WEEKDAYS[:6]))

    try:
        days = json.loads(row["study_days_json"] or "[]")
    except (TypeError, ValueError):
        days = []
    days = [d for d in days if d in WEEKDAYS] or list(WEEKDAYS[:6])
    exam_date = None
    if row["exam_date"]:
        try:
            exam_date = date.fromisoformat(str(row["exam_date"])[:10])
        except ValueError:
            exam_date = None
    return PlanProfile(
        profile_id=profile_id,
        target_band=float(row["target_band"] or 6.5),
        exam_date=exam_date,
        daily_minutes=int(row["daily_minutes"] or 60),
        study_days=days,
        exam_format=str(row["exam_format"] or "academic"),
        self_level=row["self_level"],
    )


# --------------------------------------------------------------------------------------
# §4.2 weekly weighting
# --------------------------------------------------------------------------------------


def weekly_weights(target_band: float, estimates: dict[str, float]) -> dict[str, float]:
    """Gap-weighted weekly minute split with a 15 % floor (10 §4.2, verbatim algorithm)."""
    gaps = {s: max(MIN_GAP, target_band - float(estimates.get(s, target_band))) for s in SKILLS}
    total = sum(gaps.values()) or 1.0
    w = {s: gaps[s] / total for s in SKILLS}

    floored = {s for s in SKILLS if w[s] < FLOOR}
    rest = [s for s in SKILLS if s not in floored]
    if not rest:  # every skill under the floor — an even split is the only fixed point
        return {s: 1.0 / len(SKILLS) for s in SKILLS}
    for s in floored:
        w[s] = FLOOR
    remaining = 1.0 - FLOOR * len(floored)
    rest_total = sum(w[s] for s in rest) or 1.0
    for s in rest:
        w[s] = w[s] / rest_total * remaining
    return {s: round(w[s], 4) for s in SKILLS}


def weeks_until_exam(profile: PlanProfile, today: date) -> int:
    if profile.exam_date is None:
        return DEFAULT_HORIZON_WEEKS
    days = (profile.exam_date - today).days
    if days <= 0:
        return 1
    return max(1, min(MAX_HORIZON_WEEKS, math.ceil(days / 7)))


def round_to_session(minutes: float) -> int:
    return int(round(minutes / 5.0) * 5)


# --------------------------------------------------------------------------------------
# Block composition (§5)
# --------------------------------------------------------------------------------------


def _warmup_block(variant: dict[str, int], taper: bool) -> dict[str, Any]:
    params: dict[str, Any] = {"max_cards": variant["max_cards"]}
    if taper:
        # 10 §4.1 — no new vocabulary cards during taper (overrides 08's new_cards_per_day).
        params["new_cards"] = 0
    return {"kind": "warmup_srs", "minutes": variant["warmup"], "params": params}


def compose_session_blocks(
    variant: dict[str, int],
    module: str,
    activity: str,
    params: dict[str, Any],
    drill: tuple[str, str],
    taper: bool = False,
    main_minutes: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    main = int(main_minutes or variant["main"])
    blocks = [
        _warmup_block(variant, taper),
        {
            "kind": "main",
            "minutes": main,
            "module": module,
            "activity": activity,
            "params": params,
        },
        {
            "kind": "micro_drill",
            "minutes": variant["micro"],
            "module": drill[0],
            "activity": drill[1],
        },
    ]
    return blocks, variant["warmup"] + main + variant["micro"]


def _drill_for(estimates: dict[str, SkillEstimate]) -> tuple[str, str]:
    weakest = weakest_criteria(estimates, limit=1)
    if not weakest:
        return DEFAULT_DRILL
    return CRITERION_DRILL.get(str(weakest[0]["criterion"]), DEFAULT_DRILL)


# --------------------------------------------------------------------------------------
# Week scheduling
# --------------------------------------------------------------------------------------


def week_dates(today: date, week_index: int, study_days: list[str]) -> list[date]:
    """Study-day dates inside week ``week_index``, never before ``today``."""
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_index)
    out = [
        monday + timedelta(days=offset)
        for offset in range(7)
        if WEEKDAYS[offset] in study_days
    ]
    return [d for d in out if d >= today]


def schedule_build_week(
    week_index: int,
    dates: list[date],
    budget: dict[str, int],
    variant: dict[str, int],
    section_test_skill: str,
    drill: tuple[str, str],
    rng: random.Random,
    recent_mains: list[str],
) -> list[dict[str, Any]]:
    """One session per study day: greedy by remaining budget, with the variety rule."""
    sessions: list[dict[str, Any]] = []
    if not dates:
        return sessions

    remaining = dict(budget)
    review_date = dates[-1]  # 10 §4.1 — one weekly review day, the last study day
    test_date = dates[len(dates) // 2] if len(dates) > 1 else None

    for day in dates:
        if day == review_date and len(dates) > 1:
            blocks, duration = compose_session_blocks(
                variant,
                "vocab",
                "review_day",
                {"error_log": True, "srs_deep": True},
                ("vocab", "srs_deep_session"),
            )
            sessions.append(_session_row(day, "build", duration, blocks))
            continue

        if day == test_date:
            skill = section_test_skill
            minutes = SECTION_TEST_MINUTES[skill]
            blocks, duration = compose_session_blocks(
                variant,
                skill,
                "section_test",
                {"full_section": True, "timed": True},
                drill,
                main_minutes=minutes,
            )
            remaining[skill] = max(0, remaining[skill] - minutes)
            recent_mains.append(skill)
            sessions.append(_session_row(day, "build", duration, blocks))
            continue

        skill = _pick_main_skill(remaining, recent_mains, rng)
        activity = ACTIVITIES[skill][(week_index + len(sessions)) % len(ACTIVITIES[skill])]
        blocks, duration = compose_session_blocks(
            variant,
            skill,
            activity,
            {"criterion_focus": drill[1].split("_")[0].upper() if drill[0] != "vocab" else None},
            drill,
        )
        remaining[skill] = max(0, remaining[skill] - variant["main"])
        recent_mains.append(skill)
        sessions.append(_session_row(day, "build", duration, blocks))
    return sessions


def _pick_main_skill(
    remaining: dict[str, int], recent_mains: list[str], rng: random.Random
) -> str:
    """Largest remaining budget wins; never the same skill 3 days running (§4.2)."""
    blocked = set()
    if len(recent_mains) >= 2 and recent_mains[-1] == recent_mains[-2]:
        blocked.add(recent_mains[-1])
    candidates = [s for s in SKILLS if s not in blocked] or list(SKILLS)
    best = max(remaining.get(s, 0) for s in candidates)
    tied = [s for s in candidates if remaining.get(s, 0) == best]
    return tied[0] if len(tied) == 1 else rng.choice(sorted(tied))


def schedule_taper_week(
    week_index: int,
    dates: list[date],
    variant: dict[str, int],
    drill: tuple[str, str],
    mock_number: int,
) -> list[dict[str, Any]]:
    """2 full mocks + mock reviews + light SRS (10 §4.1/§10)."""
    sessions: list[dict[str, Any]] = []
    if not dates:
        return sessions

    mock_days = {0}
    if len(dates) >= 5:
        mock_days.add(4)
    elif len(dates) >= 3:
        mock_days.add(len(dates) - 2)

    n = mock_number
    for idx, day in enumerate(dates):
        if idx in mock_days:
            blocks = [
                {
                    "kind": "main",
                    "minutes": MOCK_MINUTES,
                    "module": "mock",
                    "activity": "full_mock",
                    "params": {
                        "mock_number": n,
                        "sections": ["listening", "reading", "writing"],
                        "confirm_long_session": True,
                    },
                }
            ]
            sessions.append(_session_row(day, "taper", MOCK_MINUTES, blocks))
            n += 1
            continue
        if (idx - 1) in mock_days:
            blocks = [
                {
                    "kind": "main",
                    "minutes": MOCK_SPEAKING_MINUTES,
                    "module": "speaking",
                    "activity": "mock_speaking",
                    "params": {"mock_number": n - 1, "exam_mode": True},
                },
                {
                    "kind": "micro_drill",
                    "minutes": variant["micro"],
                    "module": "mock",
                    "activity": "mock_review",
                },
            ]
            sessions.append(
                _session_row(day, "taper", MOCK_SPEAKING_MINUTES + variant["micro"], blocks)
            )
            continue
        if idx == len(dates) - 1:
            blocks, duration = compose_session_blocks(
                variant,
                "mock",
                "readiness_checklist",
                {"checklist": True},
                drill,
                taper=True,
            )
            sessions.append(_session_row(day, "taper", duration, blocks))
            continue
        blocks, duration = compose_session_blocks(
            variant,
            "mock",
            "mock_error_review",
            {"light": True},
            drill,
            taper=True,
        )
        sessions.append(_session_row(day, "taper", duration, blocks))
    return sessions


def _session_row(
    day: date, phase: str, duration: int, blocks: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "session_id": f"ses_{ULID()}",
        "date": day.isoformat(),
        "phase": phase,
        "duration_min": int(duration),
        "blocks": blocks,
        "status": "scheduled",
    }


# --------------------------------------------------------------------------------------
# Generator
# --------------------------------------------------------------------------------------


def build_plan(
    profile: PlanProfile,
    estimates: dict[str, SkillEstimate],
    today: date | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    """Pure generator — no DB writes. ``persist_plan`` stores the result."""
    today = today or utcnow().date()
    rng = random.Random(seed if seed is not None else 20260725)
    weeks = weeks_until_exam(profile, today)
    variant = profile.variant
    drill = _drill_for(estimates)
    bands = {s: estimates[s].planning_band() for s in SKILLS if s in estimates}

    weights_by_week: list[dict[str, Any]] = []
    sessions: list[dict[str, Any]] = []
    recent_mains: list[str] = []
    mock_number = 1

    for wk in range(weeks):
        is_taper = profile.exam_date is not None and wk >= weeks - TAPER_WEEKS
        w = weekly_weights(profile.target_band, bands)
        weights_by_week.append({"week": wk + 1, "phase": "taper" if is_taper else "build", **w})
        dates = week_dates(today, wk, profile.study_days)
        if not dates:
            continue
        if is_taper:
            week_sessions = schedule_taper_week(wk, dates, variant, drill, mock_number)
            mock_number += sum(
                1
                for s in week_sessions
                for b in s["blocks"]
                if b.get("activity") == "full_mock"
            )
            sessions += week_sessions
        else:
            pool = profile.daily_minutes * len(profile.study_days)
            budget = {s: round_to_session(w[s] * pool) for s in SKILLS}
            sessions += schedule_build_week(
                wk,
                dates,
                budget,
                variant,
                SKILLS[wk % len(SKILLS)],
                drill,
                rng,
                recent_mains,
            )

    return {
        "plan_id": f"pln_{ULID()}",
        "generated_at": iso(utcnow()),
        "horizon_weeks": weeks,
        "goal_band": profile.target_band,
        "exam_date": profile.exam_date.isoformat() if profile.exam_date else None,
        "daily_minutes": profile.daily_minutes,
        "study_days": profile.study_days,
        "weights_by_week": weights_by_week,
        "sessions": sessions,
        "rationale": {
            "estimates": {s: estimates[s].band for s in SKILLS if s in estimates},
            "confidence": {s: estimates[s].confidence for s in SKILLS if s in estimates},
            "target_band": profile.target_band,
            "micro_drill": {"module": drill[0], "activity": drill[1]},
            "seed": seed,
            "generated_from": "estimator",
        },
    }


def persist_plan(session: Any, profile_id: str, plan: dict[str, Any]) -> str:
    """Insert the plan, supersede the previous active one, keep completed sessions."""
    previous = active_plan_id(session, profile_id)
    session.execute(
        text(
            "INSERT INTO study_plans (id, profile_id, goal_band, exam_date, horizon_weeks, "
            "weights_json, rationale_json, generated_at) VALUES (:id, :pid, :goal, :exam, "
            ":weeks, :weights, :rationale, :at)"
        ),
        {
            "id": plan["plan_id"],
            "pid": profile_id,
            "goal": plan["goal_band"],
            "exam": plan["exam_date"],
            "weeks": plan["horizon_weeks"],
            "weights": json.dumps(plan["weights_by_week"]),
            "rationale": json.dumps(plan["rationale"]),
            "at": plan["generated_at"],
        },
    )
    for s in plan["sessions"]:
        session.execute(
            text(
                "INSERT INTO plan_sessions (id, plan_id, date, phase, duration_min, "
                "blocks_json, status) VALUES (:id, :plan, :date, :phase, :dur, :blocks, "
                "'scheduled')"
            ),
            {
                "id": s["session_id"],
                "plan": plan["plan_id"],
                "date": s["date"],
                "phase": s["phase"],
                "dur": s["duration_min"],
                "blocks": json.dumps(s["blocks"]),
            },
        )
    if previous:
        session.execute(
            text("UPDATE study_plans SET superseded_by = :new WHERE id = :old"),
            {"new": plan["plan_id"], "old": previous},
        )
    session.execute(
        text(
            "INSERT INTO activity_log (id, profile_id, event_type, ref_kind, ref_id, meta_json) "
            "VALUES (:id, :pid, 'plan_generated', 'study_plan', :ref, :meta)"
        ),
        {
            "id": f"al_{ULID()}",
            "pid": profile_id,
            "ref": plan["plan_id"],
            "meta": json.dumps(
                {"horizon_weeks": plan["horizon_weeks"], "sessions": len(plan["sessions"])}
            ),
        },
    )
    return plan["plan_id"]


def generate_plan(
    session: Any,
    profile_id: str,
    today: date | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate + persist the active plan for a profile."""
    profile = load_profile(session, profile_id)
    estimates = current_estimates(session, profile_id)
    plan = build_plan(profile, estimates, today=today, seed=seed)
    persist_plan(session, profile_id, plan)
    return plan


# --------------------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------------------


def active_plan_id(session: Any, profile_id: str) -> str | None:
    row = session.execute(
        text(
            "SELECT id FROM study_plans WHERE profile_id = :pid AND superseded_by IS NULL "
            "ORDER BY generated_at DESC, id DESC LIMIT 1"
        ),
        {"pid": profile_id},
    ).first()
    return str(row[0]) if row else None


def load_plan(session: Any, plan_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            "SELECT id, profile_id, goal_band, exam_date, horizon_weeks, weights_json, "
            "rationale_json, generated_at FROM study_plans WHERE id = :id"
        ),
        {"id": plan_id},
    ).mappings().first()
    if row is None:
        return None
    sessions = session.execute(
        text(
            "SELECT id, date, phase, duration_min, blocks_json, status, minutes_logged, "
            "current_block FROM plan_sessions WHERE plan_id = :id ORDER BY date, id"
        ),
        {"id": plan_id},
    ).mappings().all()
    return {
        "plan_id": row["id"],
        "generated_at": row["generated_at"],
        "horizon_weeks": row["horizon_weeks"],
        "goal_band": row["goal_band"],
        "exam_date": row["exam_date"],
        "weights_by_week": _json(row["weights_json"], []),
        "rationale": _json(row["rationale_json"], {}),
        "sessions": [
            {
                "session_id": s["id"],
                "date": s["date"],
                "phase": s["phase"],
                "duration_min": s["duration_min"],
                "blocks": _json(s["blocks_json"], []),
                "status": s["status"],
                "minutes_logged": s["minutes_logged"],
                "current_block": s["current_block"],
            }
            for s in sessions
        ],
    }


def active_plan(session: Any, profile_id: str) -> dict[str, Any] | None:
    plan_id = active_plan_id(session, profile_id)
    return load_plan(session, plan_id) if plan_id else None


def todays_session(plan: dict[str, Any] | None, today: date | None = None) -> dict[str, Any] | None:
    if not plan:
        return None
    key = (today or utcnow().date()).isoformat()
    for s in plan["sessions"]:
        if s["date"] == key and s["status"] in ("scheduled", "in_progress"):
            return s
    for s in plan["sessions"]:
        if s["date"] == key:
            return s
    return None


def next_session(plan: dict[str, Any] | None, today: date | None = None) -> dict[str, Any] | None:
    if not plan:
        return None
    key = (today or utcnow().date()).isoformat()
    upcoming = [
        s for s in plan["sessions"] if s["date"] >= key and s["status"] in ("scheduled", "in_progress")
    ]
    return upcoming[0] if upcoming else None


def _json(raw: Any, fallback: Any) -> Any:
    if raw is None:
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


# --------------------------------------------------------------------------------------
# Session lifecycle (§5) + daily activity
# --------------------------------------------------------------------------------------


def mark_session(
    session: Any,
    plan_session_id: str,
    status: str,
    minutes: int | None = None,
    current_block: int | None = None,
) -> dict[str, Any] | None:
    row = session.execute(
        text(
            "SELECT id, plan_id, date, duration_min, minutes_logged, status "
            "FROM plan_sessions WHERE id = :id"
        ),
        {"id": plan_session_id},
    ).mappings().first()
    if row is None:
        return None

    logged = int(row["minutes_logged"] or 0)
    if minutes is not None:
        logged = max(logged, int(minutes))
    elif status == "completed":
        logged = max(logged, int(row["duration_min"] or 0))

    session.execute(
        text(
            "UPDATE plan_sessions SET status = :status, minutes_logged = :mins, "
            "current_block = :block WHERE id = :id"
        ),
        {
            "id": plan_session_id,
            "status": status,
            "mins": logged,
            "block": current_block,
        },
    )
    return {
        "session_id": plan_session_id,
        "plan_id": row["plan_id"],
        "date": row["date"],
        "status": status,
        "minutes_logged": logged,
    }


def profile_for_plan(session: Any, plan_id: str) -> str | None:
    row = session.execute(
        text("SELECT profile_id FROM study_plans WHERE id = :id"), {"id": plan_id}
    ).first()
    return str(row[0]) if row else None


def log_activity_minutes(
    session: Any,
    profile_id: str,
    day: str,
    minutes: int,
    daily_goal: int,
    study_days: list[str],
) -> dict[str, Any]:
    """Upsert the ``daily_activity`` row that drives the heatmap and the streak (§9)."""
    row = session.execute(
        text("SELECT minutes FROM daily_activity WHERE profile_id = :pid AND date = :d"),
        {"pid": profile_id, "d": day},
    ).first()
    total = int(row[0] if row else 0) + max(0, int(minutes))
    try:
        weekday = WEEKDAYS[date.fromisoformat(day).weekday()]
    except ValueError:
        weekday = "mon"
    is_rest = 0 if weekday in study_days else 1
    goal_met = 1 if total >= max(1, daily_goal) else 0

    if row is None:
        session.execute(
            text(
                "INSERT INTO daily_activity (profile_id, date, minutes, goal_met, is_rest_day) "
                "VALUES (:pid, :d, :m, :g, :r)"
            ),
            {"pid": profile_id, "d": day, "m": total, "g": goal_met, "r": is_rest},
        )
    else:
        session.execute(
            text(
                "UPDATE daily_activity SET minutes = :m, goal_met = :g, is_rest_day = :r "
                "WHERE profile_id = :pid AND date = :d"
            ),
            {"pid": profile_id, "d": day, "m": total, "g": goal_met, "r": is_rest},
        )
    return {"date": day, "minutes": total, "goal_met": bool(goal_met), "is_rest_day": bool(is_rest)}


def sweep_missed_sessions(session: Any, profile_id: str, today: date | None = None) -> int:
    """Past scheduled sessions become ``skipped`` (never rescheduled — 10 §5)."""
    key = (today or utcnow().date()).isoformat()
    plan_id = active_plan_id(session, profile_id)
    if not plan_id:
        return 0
    result = session.execute(
        text(
            "UPDATE plan_sessions SET status = 'skipped' WHERE plan_id = :plan "
            "AND date < :today AND status = 'scheduled'"
        ),
        {"plan": plan_id, "today": key},
    )
    return int(result.rowcount or 0)


def now_iso() -> str:
    return iso(datetime.now(tz=utcnow().tzinfo))


# --------------------------------------------------------------------------------------
# Streak + heatmap (10 §7/§9) — daily_activity is the source of truth
# --------------------------------------------------------------------------------------

STREAK_REPAIR_WINDOW_DAYS = 30


def load_activity(
    session: Any, profile_id: str, since: date, until: date
) -> dict[str, dict[str, Any]]:
    rows = session.execute(
        text(
            "SELECT date, minutes, goal_met, is_rest_day, streak_repaired FROM daily_activity "
            "WHERE profile_id = :pid AND date >= :since AND date <= :until"
        ),
        {"pid": profile_id, "since": since.isoformat(), "until": until.isoformat()},
    ).mappings().all()
    return {str(r["date"]): dict(r) for r in rows}


def compute_streak(
    session: Any,
    profile_id: str,
    study_days: list[str],
    today: date | None = None,
    lookback_days: int = 400,
) -> dict[str, Any]:
    """Consecutive study-days with the goal met. Configured rest days never break it (§9).

    One automatic repair per 30 days covers a single missed study day and is labelled
    honestly rather than hidden.
    """
    today = today or utcnow().date()
    start = today - timedelta(days=lookback_days)
    activity = load_activity(session, profile_id, start, today)

    current = 0
    repairs_used = 0
    repaired_dates: list[str] = []
    cursor = today
    # Today not yet studied should not break a streak that is otherwise alive.
    if not activity.get(today.isoformat(), {}).get("goal_met"):
        cursor = today - timedelta(days=1)

    while cursor >= start:
        key = cursor.isoformat()
        weekday = WEEKDAYS[cursor.weekday()]
        row = activity.get(key)
        if weekday not in study_days:
            cursor -= timedelta(days=1)
            continue  # a configured rest day is neutral
        if row and row.get("goal_met"):
            current += 1
        elif repairs_used == 0 and current > 0 and (today - cursor).days <= STREAK_REPAIR_WINDOW_DAYS:
            repairs_used += 1
            repaired_dates.append(key)
            current += 1
        else:
            break
        cursor -= timedelta(days=1)

    longest = 0
    run = 0
    for offset in range(lookback_days + 1):
        day = start + timedelta(days=offset)
        if WEEKDAYS[day.weekday()] not in study_days:
            continue
        if activity.get(day.isoformat(), {}).get("goal_met"):
            run += 1
            longest = max(longest, run)
        else:
            run = 0

    total_minutes = sum(int(r.get("minutes") or 0) for r in activity.values())
    return {
        "current": current,
        "longest": max(longest, current),
        "repaired_dates": repaired_dates,
        "total_minutes_400d": total_minutes,
        "today_minutes": int(activity.get(today.isoformat(), {}).get("minutes") or 0),
        "today_goal_met": bool(activity.get(today.isoformat(), {}).get("goal_met")),
    }


def heatmap_grid(
    session: Any,
    profile_id: str,
    weeks: int = 16,
    daily_goal: int = 60,
    study_days: list[str] | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """GitHub-style calendar: ``weeks`` × 7 cells, intensity 0–3 vs the daily goal (§7)."""
    today = today or utcnow().date()
    weeks = max(1, min(53, int(weeks)))
    end = today + timedelta(days=6 - today.weekday())  # end of the current week (Sunday)
    start = end - timedelta(weeks=weeks) + timedelta(days=1)
    activity = load_activity(session, profile_id, start, end)
    study_days = study_days or list(WEEKDAYS[:6])

    cells: list[dict[str, Any]] = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        key = day.isoformat()
        row = activity.get(key)
        minutes = int(row["minutes"]) if row else 0
        ratio = minutes / max(1, daily_goal)
        level = 0 if minutes <= 0 else 1 if ratio < 0.5 else 2 if ratio < 1.0 else 3
        cells.append(
            {
                "date": key,
                "minutes": minutes,
                "level": level,
                "goal_met": bool(row and row["goal_met"]),
                "is_rest_day": bool(row["is_rest_day"]) if row else WEEKDAYS[day.weekday()] not in study_days,
                "future": day > today,
            }
        )
    return {
        "weeks": weeks,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "daily_goal_min": daily_goal,
        "cells": cells,
    }
