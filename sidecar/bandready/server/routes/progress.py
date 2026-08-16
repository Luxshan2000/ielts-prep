"""Progress dashboard, study plan and exam readiness — 18-api-contract.md §4.13.

Owner doc: 10-curriculum-progress.md §4/§5/§7/§9/§10. Every band value on the wire ships
**with its range** and with the "estimated band — not a guarantee" framing (10 §6.4),
because the copy rules there are non-negotiable.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.curriculum import adaptive
from bandready.curriculum.estimate import (
    SKILLS,
    current_estimates,
    recompute,
    trajectory,
    weakest_criteria,
)
from bandready.curriculum.plan import (
    active_plan,
    compute_streak,
    generate_plan,
    heatmap_grid,
    load_profile,
    log_activity_minutes,
    mark_session,
    profile_for_plan,
    sweep_missed_sessions,
    todays_session,
)
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.timeutil import iso, utcnow

router = APIRouter(prefix="/api/v1", tags=["progress"])

_log = logging.getLogger("bandready.routes.progress")

ESTIMATE_DISCLAIMER = "Estimated band — not a guarantee"
ESTIMATE_TOOLTIP = (
    "Based on your scored practice attempts, graded by your configured AI model against "
    "public IELTS band descriptors. Real examiner scores can differ."
)

MILESTONE_STREAKS = (7, 14, 30, 60)


# --------------------------------------------------------------------------------------
# Bodies
# --------------------------------------------------------------------------------------


class PlanGenerateBody(BaseModel):
    seed: int | None = None
    today: str | None = None


class SessionCompleteBody(BaseModel):
    minutes: int | None = Field(default=None, ge=0, le=600)
    current_block: int | None = Field(default=None, ge=0, le=16)


class ReadinessBody(BaseModel):
    checked: bool


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _estimate_payload(estimates: dict[str, Any]) -> dict[str, Any]:
    return {skill: estimates[skill].as_dict() for skill in (*SKILLS, "overall") if skill in estimates}


def _parse_today(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError as exc:
        raise ApiError(422, "validation_error", f"invalid date {value!r}") from exc


def _vocab_tile(session: Session, profile_id: str) -> dict[str, Any]:
    """Vocab counts + 7-day retention (08-vocabulary-srs.md owns the semantics)."""
    now = utcnow()
    try:
        totals = session.execute(
            text(
                "SELECT COUNT(*) AS cards, "
                "SUM(CASE WHEN c.due_at <= :now THEN 1 ELSE 0 END) AS due "
                "FROM srs_cards c JOIN vocab_entries e ON e.id = c.entry_id "
                "WHERE e.profile_id = :pid"
            ),
            {"pid": profile_id, "now": iso(now)},
        ).mappings().first()
        reviews = session.execute(
            text(
                "SELECT COUNT(*) AS n, SUM(CASE WHEN l.rating >= 3 THEN 1 ELSE 0 END) AS ok "
                "FROM srs_review_logs l JOIN srs_cards c ON c.id = l.card_id "
                "JOIN vocab_entries e ON e.id = c.entry_id "
                "WHERE e.profile_id = :pid AND l.reviewed_at >= :since"
            ),
            {
                "pid": profile_id,
                "since": iso(now - timedelta(days=7)),
            },
        ).mappings().first()
    except Exception as exc:  # noqa: BLE001 — vocab tables exist, but stay resilient
        # Zeroes here look identical to "you have no vocabulary yet" on the dashboard,
        # which is the wrong story if the real cause is a locked or migrating DB. The
        # summary still degrades gracefully, but the reason goes in the log.
        _log.warning("vocabulary counters could not be read: %s", exc)
        return {"cards": 0, "due_today": 0, "retention_7d": None, "reviews_7d": 0}

    total_reviews = int((reviews or {}).get("n") or 0)
    return {
        "cards": int((totals or {}).get("cards") or 0),
        "due_today": int((totals or {}).get("due") or 0),
        "reviews_7d": total_reviews,
        "retention_7d": (
            round(float((reviews or {}).get("ok") or 0) / total_reviews, 3)
            if total_reviews
            else None
        ),
    }


def _question_type_accuracy(session: Session, profile_id: str, skill: str) -> list[dict[str, Any]]:
    """Reading/Listening replacement for the criteria radar (10 §7)."""
    table = "reading" if skill == "reading" else "listening"
    rows = session.execute(
        text(
            f"SELECT a.qtype AS qtype, COUNT(*) AS n, SUM(a.correct) AS ok "
            f"FROM {table}_answers a JOIN {table}_attempts t ON t.id = a.attempt_id "
            f"JOIN practice_sessions ps ON ps.id = t.id "
            f"WHERE ps.profile_id = :pid GROUP BY a.qtype ORDER BY "
            f"(CAST(SUM(a.correct) AS REAL) / COUNT(*)) ASC"
        ),
        {"pid": profile_id},
    ).mappings().all()
    return [
        {
            "qtype": r["qtype"],
            "attempted": int(r["n"]),
            "correct": int(r["ok"] or 0),
            "accuracy": round(float(r["ok"] or 0) / max(1, int(r["n"])), 3),
        }
        for r in rows
    ]


def _award_milestones(
    session: Session, profile_id: str, streak: dict[str, Any], estimates: dict[str, Any]
) -> list[str]:
    """One-time, quiet milestones (10 §9). Never punitive, never purchasable."""
    earned: list[str] = []
    candidates: list[str] = []
    for threshold in MILESTONE_STREAKS:
        if int(streak.get("current") or 0) >= threshold:
            candidates.append(f"streak-{threshold}")
    mocks = session.execute(
        text(
            "SELECT COUNT(*) FROM practice_sessions WHERE profile_id = :pid AND module = 'reading'"
        ),
        {"pid": profile_id},
    ).first()
    if int(mocks[0] if mocks else 0) > 0:
        candidates.append("first-session")
    overall = estimates.get("overall")
    if overall is not None and overall.confidence in ("medium", "high"):
        candidates.append("first-confident-estimate")

    for milestone_id in candidates:
        result = session.execute(
            text(
                "INSERT INTO milestones (profile_id, milestone_id) VALUES (:pid, :mid) "
                "ON CONFLICT(profile_id, milestone_id) DO NOTHING"
            ),
            {"pid": profile_id, "mid": milestone_id},
        )
        if result.rowcount:
            earned.append(milestone_id)
    return earned


# --------------------------------------------------------------------------------------
# Progress
# --------------------------------------------------------------------------------------


@router.get("/progress/summary", summary="Dashboard payload (tiles, callouts, streak)")
def progress_summary(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    sweep_missed_sessions(session, profile_id)

    estimates = current_estimates(session, profile_id)
    streak = compute_streak(session, profile_id, profile.study_days)
    milestones = _award_milestones(session, profile_id, streak, estimates)
    plan = active_plan(session, profile_id)
    today_session = todays_session(plan)

    exam_in_days = None
    if profile.exam_date:
        exam_in_days = (profile.exam_date - utcnow().date()).days

    stale_skills = [s for s in SKILLS if s in estimates and estimates[s].stale]
    return {
        "profile": {
            "target_band": profile.target_band,
            "exam_date": profile.exam_date.isoformat() if profile.exam_date else None,
            "exam_in_days": exam_in_days,
            "exam_format": profile.exam_format,
            "daily_minutes": profile.daily_minutes,
            "study_days": profile.study_days,
        },
        "disclaimer": ESTIMATE_DISCLAIMER,
        "tooltip": ESTIMATE_TOOLTIP,
        "estimates": _estimate_payload(estimates),
        "weakest_criteria": weakest_criteria(estimates, limit=3),
        "callouts": adaptive.recent_events(session, profile_id, limit=4),
        "streak": {
            **streak,
            "daily_goal_min": profile.daily_minutes,
            "next_milestone": next(
                (t for t in MILESTONE_STREAKS if t > int(streak.get("current") or 0)), None
            ),
        },
        "heatmap": heatmap_grid(
            session,
            profile_id,
            weeks=16,
            daily_goal=profile.daily_minutes,
            study_days=profile.study_days,
        ),
        "vocab": _vocab_tile(session, profile_id),
        "today": today_session,
        "plan_id": plan["plan_id"] if plan else None,
        "milestones_earned": milestones,
        "stale_skills": stale_skills,
        "needs_placement": estimates.get("overall") is not None
        and estimates["overall"].confidence == "insufficient",
    }


@router.get("/progress/estimates", summary="Per-skill band estimates")
def progress_estimates(
    refresh: bool = Query(default=False, description="Recompute before reading"),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    estimates = recompute(session, profile_id) if refresh else current_estimates(session, profile_id)
    return {
        "disclaimer": ESTIMATE_DISCLAIMER,
        "tooltip": ESTIMATE_TOOLTIP,
        "estimates": _estimate_payload(estimates),
    }


@router.post("/progress/estimates/recompute", summary="Recompute estimates and fire rules")
def progress_recompute(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    estimates = recompute(session, profile_id, force=False)
    fired = adaptive.evaluate(session, profile_id)
    return {"estimates": _estimate_payload(estimates), "adaptive_events": fired}


@router.get("/progress/trajectory", summary="Weekly band trajectory series")
def progress_trajectory(
    skill: str = Query(default="overall"),
    weeks: int = Query(default=12, ge=1, le=52),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if skill not in (*SKILLS, "overall"):
        raise ApiError(422, "validation_error", f"unknown skill {skill!r}")
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    return {
        "skill": skill,
        "weeks": weeks,
        "target_band": profile.target_band,
        "disclaimer": ESTIMATE_DISCLAIMER,
        "points": trajectory(session, profile_id, skill, weeks=weeks),
    }


@router.get("/progress/criteria", summary="Criterion breakdown / question-type accuracy")
def progress_criteria(
    skill: str = Query(default="writing"),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if skill not in SKILLS:
        raise ApiError(422, "validation_error", f"unknown skill {skill!r}")
    profile_id = current_profile_id(session)
    estimates = current_estimates(session, profile_id)
    estimate = estimates.get(skill)
    if skill in ("reading", "listening"):
        return {
            "skill": skill,
            "kind": "question_type_accuracy",
            "items": _question_type_accuracy(session, profile_id, skill),
            "band": estimate.as_dict() if estimate else None,
        }
    return {
        "skill": skill,
        "kind": "criteria_radar",
        "criteria": (estimate.criteria if estimate else {}) or {},
        "band": estimate.as_dict() if estimate else None,
        "disclaimer": ESTIMATE_DISCLAIMER,
    }


@router.get("/progress/heatmap", summary="Daily activity grid")
def progress_heatmap(
    weeks: int = Query(default=16, ge=1, le=53),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    return heatmap_grid(
        session,
        profile_id,
        weeks=weeks,
        daily_goal=profile.daily_minutes,
        study_days=profile.study_days,
    )


@router.post("/progress/activity", summary="Log studied minutes for a day")
def progress_log_activity(
    minutes: int = Body(default=0, embed=True, ge=0, le=600),
    day: str | None = Body(default=None, embed=True),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    target = (_parse_today(day) or utcnow().date()).isoformat()
    return log_activity_minutes(
        session, profile_id, target, minutes, profile.daily_minutes, profile.study_days
    )


@router.post("/progress/callouts/{event_id}/dismiss", summary="Dismiss an adaptive callout")
def dismiss_callout(
    event_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    if not adaptive.dismiss(session, profile_id, event_id):
        raise ApiError(404, "not_found", f"no adaptive event {event_id}")
    return {"id": event_id, "dismissed": True}


# --------------------------------------------------------------------------------------
# Plan
# --------------------------------------------------------------------------------------


@router.get("/plan", summary="Current study plan plus today's session")
def get_plan(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    sweep_missed_sessions(session, profile_id)
    plan = active_plan(session, profile_id)
    if plan is None:
        return {
            "plan": None,
            "today": None,
            "next": None,
            "empty_reason": "no_plan_yet",
            "hint": "Generate a plan from your target band, exam date and weekly time budget.",
            "profile": {
                "target_band": profile.target_band,
                "exam_date": profile.exam_date.isoformat() if profile.exam_date else None,
                "daily_minutes": profile.daily_minutes,
                "study_days": profile.study_days,
            },
        }
    from bandready.curriculum.plan import next_session

    return {
        "plan": plan,
        "today": todays_session(plan),
        "next": next_session(plan),
        "profile": {
            "target_band": profile.target_band,
            "exam_date": profile.exam_date.isoformat() if profile.exam_date else None,
            "daily_minutes": profile.daily_minutes,
            "study_days": profile.study_days,
        },
    }


def _do_generate(session: Session, body: PlanGenerateBody) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    plan = generate_plan(session, profile_id, today=_parse_today(body.today), seed=body.seed)
    return {"plan": plan, "today": todays_session(plan)}


@router.post("/plan/generate", summary="Generate the study plan")
def plan_generate(
    body: PlanGenerateBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return _do_generate(session, body or PlanGenerateBody())


@router.post("/plan/regenerate", summary="Regenerate the study plan (18 §4.13 alias)")
def plan_regenerate(
    body: PlanGenerateBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return _do_generate(session, body or PlanGenerateBody())


def _session_owner(session: Session, plan_session_id: str) -> tuple[str, str]:
    row = session.execute(
        text("SELECT plan_id FROM plan_sessions WHERE id = :id"), {"id": plan_session_id}
    ).first()
    if row is None:
        raise ApiError(404, "not_found", f"no plan session {plan_session_id}")
    plan_id = str(row[0])
    profile_id = profile_for_plan(session, plan_id)
    if profile_id is None:
        raise ApiError(404, "not_found", f"plan {plan_id} has no profile")
    return plan_id, profile_id


@router.post("/plan/sessions/{plan_session_id}/start", summary="Begin a planned session")
def plan_session_start(
    plan_session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _session_owner(session, plan_session_id)
    result = mark_session(session, plan_session_id, "in_progress", current_block=0)
    if result is None:
        raise ApiError(404, "not_found", f"no plan session {plan_session_id}")
    return result


@router.post("/plan/sessions/{plan_session_id}/complete", summary="Finish a planned session")
def plan_session_complete(
    plan_session_id: str,
    body: SessionCompleteBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or SessionCompleteBody()
    _, profile_id = _session_owner(session, plan_session_id)
    profile = load_profile(session, profile_id)
    result = mark_session(
        session, plan_session_id, "completed", minutes=body.minutes, current_block=None
    )
    if result is None:
        raise ApiError(404, "not_found", f"no plan session {plan_session_id}")

    activity = log_activity_minutes(
        session,
        profile_id,
        str(result["date"]),
        int(result["minutes_logged"]),
        profile.daily_minutes,
        profile.study_days,
    )
    session.execute(
        text(
            "INSERT INTO activity_log (id, profile_id, event_type, ref_kind, ref_id, meta_json) "
            "VALUES (:id, :pid, 'session_completed', 'plan_session', :ref, :meta)"
        ),
        {
            "id": f"al_{ULID()}",
            "pid": profile_id,
            "ref": plan_session_id,
            "meta": json.dumps({"minutes": result["minutes_logged"]}),
        },
    )
    estimates = recompute(session, profile_id)
    fired = adaptive.evaluate(session, profile_id)
    streak = compute_streak(session, profile_id, profile.study_days)
    return {
        **result,
        "activity": activity,
        "streak": streak,
        "estimates": _estimate_payload(estimates),
        "adaptive_events": fired,
        "milestones_earned": _award_milestones(session, profile_id, streak, estimates),
    }


@router.post("/plan/sessions/{plan_session_id}/skip", summary="Skip a planned session")
def plan_session_skip(
    plan_session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _session_owner(session, plan_session_id)
    result = mark_session(session, plan_session_id, "skipped")
    if result is None:
        raise ApiError(404, "not_found", f"no plan session {plan_session_id}")
    # 10 §5/§9: skipped sessions are never rescheduled — no guilt-debt piles.
    return {**result, "rescheduled": False}


@router.post("/plan/sessions/{plan_session_id}/partial", summary="Quit a session early")
def plan_session_partial(
    plan_session_id: str,
    body: SessionCompleteBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or SessionCompleteBody()
    _, profile_id = _session_owner(session, plan_session_id)
    profile = load_profile(session, profile_id)
    result = mark_session(
        session,
        plan_session_id,
        "partial",
        minutes=body.minutes,
        current_block=body.current_block,
    )
    if result is None:
        raise ApiError(404, "not_found", f"no plan session {plan_session_id}")
    activity = log_activity_minutes(
        session,
        profile_id,
        str(result["date"]),
        int(result["minutes_logged"]),
        profile.daily_minutes,
        profile.study_days,
    )
    return {**result, "activity": activity}


# --------------------------------------------------------------------------------------
# Readiness (10 §10)
# --------------------------------------------------------------------------------------

AUTO_ITEMS: tuple[tuple[str, str], ...] = (
    ("auto-two-mocks", "At least 2 full mocks completed"),
    ("auto-overall-near-target", "Overall estimate within 0.5 of target"),
    ("auto-every-skill-near-target", "Every skill within 0.5 of target at medium+ confidence"),
    ("auto-timed-lr", "Listening + Reading completed inside official time limits"),
    ("auto-writing-word-minimums", "Both writing tasks met the word minimums"),
    ("auto-vocab-retention", "Vocabulary 7-day retention at 85 % or better"),
)

MANUAL_ITEMS: tuple[tuple[str, str], ...] = (
    ("manual-exam-booked", "Exam booked and documents valid"),
    ("manual-logistics", "Test-day logistics planned (venue and time)"),
    ("manual-format-known", "You know whether you booked paper or computer format"),
    ("manual-recorded-self", "Speaking: recorded yourself and listened back"),
    ("manual-sleep-plan", "Sleep plan for exam week"),
)


def _auto_checks(session: Session, profile_id: str, target: float) -> dict[str, bool]:
    mocks = session.execute(
        text(
            "SELECT COUNT(*) FROM scored_attempts WHERE profile_id = :pid AND mode = 'mock'"
        ),
        {"pid": profile_id},
    ).first()
    mock_count = int(mocks[0] if mocks else 0)
    estimates = current_estimates(session, profile_id)
    overall = estimates.get("overall")
    vocab = _vocab_tile(session, profile_id)

    timing_ok = True
    rows = session.execute(
        text(
            "SELECT t.duration_s, t.test_id FROM reading_attempts t "
            "JOIN practice_sessions ps ON ps.id = t.id WHERE ps.profile_id = :pid "
            "AND t.status = 'submitted' ORDER BY COALESCE(t.submitted_at, ps.started_at) DESC "
            "LIMIT 2"
        ),
        {"pid": profile_id},
    ).mappings().all()
    for row in rows:
        limit = 3600 if row["test_id"] else 1200
        if int(row["duration_s"] or 0) > limit:
            timing_ok = False

    word_min_ok = True
    subs = session.execute(
        text(
            "SELECT w.word_count, p.task_type FROM writing_submissions w "
            "JOIN practice_sessions ps ON ps.id = w.id "
            "JOIN writing_prompts p ON p.id = w.prompt_id "
            "WHERE ps.profile_id = :pid AND w.status = 'scored' "
            "ORDER BY COALESCE(w.submitted_at, ps.started_at) DESC LIMIT 4"
        ),
        {"pid": profile_id},
    ).mappings().all()
    for row in subs:
        minimum = 250 if row["task_type"] == "task2" else 150
        if int(row["word_count"] or 0) < minimum:
            word_min_ok = False

    every_skill = all(
        skill in estimates
        and estimates[skill].band >= target - 0.5
        and estimates[skill].confidence in ("medium", "high")
        for skill in SKILLS
    )
    return {
        "auto-two-mocks": mock_count >= 2,
        "auto-overall-near-target": bool(overall and overall.band >= target - 0.5),
        "auto-every-skill-near-target": every_skill,
        "auto-timed-lr": bool(rows) and timing_ok,
        "auto-writing-word-minimums": bool(subs) and word_min_ok,
        "auto-vocab-retention": (vocab["retention_7d"] or 0) >= 0.85,
    }


@router.get("/readiness", summary="Exam-readiness checklist")
def get_readiness(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    profile = load_profile(session, profile_id)
    auto = _auto_checks(session, profile_id, profile.target_band)

    stored = {
        str(r["item_id"]): dict(r)
        for r in session.execute(
            text(
                "SELECT item_id, kind, checked, checked_at FROM readiness_items "
                "WHERE profile_id = :pid"
            ),
            {"pid": profile_id},
        ).mappings().all()
    }

    items: list[dict[str, Any]] = []
    for item_id, label in AUTO_ITEMS:
        items.append(
            {"id": item_id, "kind": "auto", "label": label, "checked": bool(auto.get(item_id))}
        )
    for item_id, label in MANUAL_ITEMS:
        items.append(
            {
                "id": item_id,
                "kind": "manual",
                "label": label,
                "checked": bool(stored.get(item_id, {}).get("checked")),
                "checked_at": stored.get(item_id, {}).get("checked_at"),
            }
        )

    auto_done = sum(1 for i in items if i["kind"] == "auto" and i["checked"])
    auto_total = len(AUTO_ITEMS)
    ratio = auto_done / auto_total
    verdict = "ready" if auto_done == auto_total else "nearly" if ratio >= 0.75 else "keep_building"
    days_out = (profile.exam_date - utcnow().date()).days if profile.exam_date else None

    return {
        "unlocked": profile.exam_date is not None,
        "exam_date": profile.exam_date.isoformat() if profile.exam_date else None,
        "days_out": days_out,
        "verdict": verdict,
        "auto_done": auto_done,
        "auto_total": auto_total,
        "items": items,
        "disclaimer": ESTIMATE_DISCLAIMER,
        # 10 §10: one dismissible nudge when auto items are still red close to the exam.
        "reality_check": bool(
            days_out is not None and days_out <= 10 and verdict != "ready"
        ),
    }


@router.put("/readiness/{item_id}", summary="Tick a manual readiness item")
def put_readiness(
    item_id: str,
    body: ReadinessBody,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if item_id not in {i for i, _ in MANUAL_ITEMS}:
        if item_id in {i for i, _ in AUTO_ITEMS}:
            raise ApiError(422, "validation_error", "auto-checked items cannot be set by hand")
        raise ApiError(404, "not_found", f"no readiness item {item_id}")
    now = iso()
    profile_id = current_profile_id(session)
    session.execute(
        text(
            "INSERT INTO readiness_items (profile_id, item_id, kind, checked, checked_at) "
            "VALUES (:pid, :item, 'manual', :checked, :at) "
            "ON CONFLICT(profile_id, item_id) DO UPDATE SET checked = excluded.checked, "
            "checked_at = excluded.checked_at"
        ),
        {
            "pid": profile_id,
            "item": item_id,
            "checked": 1 if body.checked else 0,
            "at": now if body.checked else None,
        },
    )
    return {"id": item_id, "checked": body.checked}


__all__ = ["router"]
