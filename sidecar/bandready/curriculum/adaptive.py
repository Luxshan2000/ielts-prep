"""Adaptive rules engine — 10-curriculum-progress.md §8.

Rules are declarative data (``RULES`` below is the shipped default set, tunable without
touching the evaluator). They are evaluated after every scored attempt and at daily
rollover. Every firing writes an ``adaptive_events`` row carrying the evidence attempt
ids, so the dashboard callouts state both what happened and what changed — plan changes
are never silent.

Engine rules: at most ``MAX_FIRINGS_PER_DAY`` firings applied per day, highest priority
first (priority = declaration order), and ``cooldown_days`` prevents nagging.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from ulid import ULID

from bandready.curriculum.estimate import (
    SKILLS,
    Attempt,
    iso,
    load_attempts,
    parse_ts,
    utcnow,
)

_log = logging.getLogger("bandready.curriculum.adaptive")

MAX_FIRINGS_PER_DAY = 2
LOW_CRITERION = 5.5
RETENTION_FLOOR = 0.80
STALE_SKILL_DAYS = 14


@dataclass(slots=True)
class Firing:
    rule_id: str
    description: str
    evidence: dict[str, Any]
    action: dict[str, Any]


@dataclass(slots=True)
class Rule:
    id: str
    description: str
    cooldown_days: int
    check: Callable[[RuleContext], Firing | None]
    daily_rollover_only: bool = False


@dataclass(slots=True)
class RuleContext:
    session: Any
    profile_id: str
    now: datetime
    attempts: list[Attempt]
    extras: dict[str, Any] = field(default_factory=dict)

    def recent(self, skill: str | None = None, limit: int = 3) -> list[Attempt]:
        rows = [a for a in self.attempts if skill is None or a.skill == skill]
        return rows[-limit:][::-1]  # newest first


# --------------------------------------------------------------------------------------
# Rule implementations
# --------------------------------------------------------------------------------------


def _criterion_streak(
    ctx: RuleContext, criterion: str, skills: tuple[str, ...], count: int
) -> list[Attempt] | None:
    """The last ``count`` attempts across ``skills`` that carry ``criterion``, all low."""
    rows = [a for a in ctx.attempts if a.skill in skills and criterion in a.criteria]
    window = rows[-count:]
    if len(window) < count:
        return None
    if all(a.criteria[criterion] <= LOW_CRITERION for a in window):
        return window[::-1]
    return None


def _gra_low_streak(ctx: RuleContext) -> Firing | None:
    window = _criterion_streak(ctx, "GRA", ("writing", "speaking"), 3)
    if window is None:
        return None
    return Firing(
        rule_id="gra-low-streak",
        description="3 consecutive low GRA scores — grammar micro-lessons queued",
        evidence={
            "criterion": "GRA",
            "threshold": LOW_CRITERION,
            "values": [a.criteria["GRA"] for a in window],
            "attempt_ids": [a.attempt_id for a in window],
        },
        action={
            "type": "inject_micro_drills",
            "activity_tag": "grammar",
            "module": "writing",
            "activity": "gra_complex_sentences",
            "count": 3,
            "within_days": 7,
        },
    )


def _speaking_lr_flat(ctx: RuleContext) -> Firing | None:
    window = _criterion_streak(ctx, "LR", ("speaking",), 3)
    if window is None:
        return None
    return Firing(
        rule_id="speaking-lr-flat",
        description="Speaking lexical resource stuck at 5.5 or below — topic vocabulary queued",
        evidence={
            "criterion": "LR",
            "values": [a.criteria["LR"] for a in window],
            "attempt_ids": [a.attempt_id for a in window],
        },
        action={
            "type": "queue_vocab_packs",
            "activity_tag": "topic_vocabulary",
            "module": "vocab",
            "activity": "lr_topic_vocabulary",
            "count": 2,
            "within_days": 7,
        },
    )


def _writing_ta_low(ctx: RuleContext) -> Firing | None:
    window = _criterion_streak(ctx, "TA", ("writing",), 2)
    if window is None:
        return None
    return Firing(
        rule_id="writing-ta-low",
        description="Task achievement low twice running — outline-first mode enabled",
        evidence={
            "criterion": "TA",
            "values": [a.criteria["TA"] for a in window],
            "attempt_ids": [a.attempt_id for a in window],
        },
        action={
            "type": "inject_micro_drills",
            "activity_tag": "task_response",
            "module": "writing",
            "activity": "ta_answer_the_question",
            "count": 1,
            "within_days": 7,
            "flags": {"outline_first": True},
        },
    )


def _reading_timeouts(ctx: RuleContext) -> Firing | None:
    rows = ctx.session.execute(
        text(
            "SELECT ra.id, ra.duration_s, ra.state_json, ra.test_id, ra.status "
            "FROM reading_attempts ra JOIN practice_sessions ps ON ps.id = ra.id "
            "WHERE ps.profile_id = :pid AND ra.status = 'submitted' "
            "ORDER BY COALESCE(ra.submitted_at, ps.started_at) DESC LIMIT 3"
        ),
        {"pid": ctx.profile_id},
    ).mappings().all()
    if len(rows) < 3:
        return None

    timed_out: list[str] = []
    for row in rows:
        state = row["state_json"]
        flag = False
        if state:
            try:
                flag = bool((json.loads(state) or {}).get("timed_out"))
            except (TypeError, ValueError):
                flag = False
        limit = 3600 if row["test_id"] else 1200
        if flag or int(row["duration_s"] or 0) >= limit:
            timed_out.append(str(row["id"]))
    if len(timed_out) < 2:
        return None
    return Firing(
        rule_id="reading-timeouts",
        description="Timed out on 2 of the last 3 reading attempts — speed drills added",
        evidence={"attempt_ids": timed_out, "of_last": len(rows)},
        action={
            "type": "replace_main_activity",
            "module": "reading",
            "activity": "timed_speed_drill_set",
            "count": 1,
            "within_days": 7,
            "flags": {"per_question_timer": True},
        },
    )


def _listening_late_parts(ctx: RuleContext) -> Firing | None:
    rows = ctx.session.execute(
        text(
            "SELECT ls.part AS part, SUM(la2.correct) AS correct, COUNT(*) AS total "
            "FROM listening_answers la2 "
            "JOIN listening_questions lq ON lq.id = la2.question_id "
            "JOIN listening_scripts ls ON ls.id = lq.script_id "
            "JOIN listening_attempts la ON la.id = la2.attempt_id "
            "JOIN practice_sessions ps ON ps.id = la.id "
            "WHERE ps.profile_id = :pid AND la.id IN ("
            "  SELECT la3.id FROM listening_attempts la3 "
            "  JOIN practice_sessions ps3 ON ps3.id = la3.id "
            "  WHERE ps3.profile_id = :pid AND la3.status = 'submitted' "
            "  ORDER BY COALESCE(la3.submitted_at, ps3.started_at) DESC LIMIT 3) "
            "GROUP BY ls.part"
        ),
        {"pid": ctx.profile_id},
    ).mappings().all()
    early = [r for r in rows if int(r["part"]) <= 2]
    late = [r for r in rows if int(r["part"]) >= 3]
    if not early or not late:
        return None
    early_acc = sum(int(r["correct"] or 0) for r in early) / max(
        1, sum(int(r["total"]) for r in early)
    )
    late_acc = sum(int(r["correct"] or 0) for r in late) / max(
        1, sum(int(r["total"]) for r in late)
    )
    if (early_acc - late_acc) < 0.20:
        return None
    return Firing(
        rule_id="listening-late-parts",
        description="Parts 3–4 accuracy trails Parts 1–2 by 20+ points — picker biased to 3–4",
        evidence={
            "early_accuracy": round(early_acc, 3),
            "late_accuracy": round(late_acc, 3),
        },
        action={
            "type": "bias_activity_picker",
            "module": "listening",
            "activity": "part34_set",
            "count": 2,
            "within_days": 7,
        },
    )


def _vocab_retention_drop(ctx: RuleContext) -> Firing | None:
    since = iso(ctx.now - timedelta(days=7))
    row = ctx.session.execute(
        text(
            "SELECT COUNT(*) AS n, SUM(CASE WHEN l.rating >= 3 THEN 1 ELSE 0 END) AS ok "
            "FROM srs_review_logs l JOIN srs_cards c ON c.id = l.card_id "
            "JOIN vocab_entries e ON e.id = c.entry_id "
            "WHERE e.profile_id = :pid AND l.reviewed_at >= :since"
        ),
        {"pid": ctx.profile_id, "since": since},
    ).mappings().first()
    total = int((row or {}).get("n") or 0)
    if total < 20:  # too few reviews to judge
        return None
    retention = float((row or {}).get("ok") or 0) / total
    if retention >= RETENTION_FLOOR:
        return None
    return Firing(
        rule_id="vocab-retention-drop",
        description="7-day retention below 80 % — new cards paused until it recovers",
        evidence={"retention": round(retention, 3), "reviews": total},
        action={
            "type": "cap_new_cards",
            "module": "vocab",
            "value": 0,
            "until_retention": 0.85,
            "within_days": 14,
        },
    )


def _stale_skill(ctx: RuleContext) -> Firing | None:
    stale: list[dict[str, Any]] = []
    for skill in SKILLS:
        rows = [a for a in ctx.attempts if a.skill == skill]
        if not rows:
            stale.append({"skill": skill, "days": None})
            continue
        age = (ctx.now - rows[-1].at).total_seconds() / 86400.0
        if age >= STALE_SKILL_DAYS:
            stale.append({"skill": skill, "days": round(age, 1)})
    if not stale:
        return None
    target = stale[0]["skill"]
    return Firing(
        rule_id="stale-skill",
        description=f"No scored {target} attempt in {STALE_SKILL_DAYS}+ days — promoted to next session",
        evidence={"skills": stale},
        action={
            "type": "promote_main_activity",
            "module": target,
            "activity": _default_activity(target),
            "count": 1,
            "within_days": 7,
        },
    )


def _returning_learner(ctx: RuleContext) -> Firing | None:
    rows = ctx.session.execute(
        text(
            "SELECT date, minutes, goal_met FROM daily_activity WHERE profile_id = :pid "
            "AND date <= :today ORDER BY date DESC LIMIT 30"
        ),
        {"pid": ctx.profile_id, "today": ctx.now.date().isoformat()},
    ).mappings().all()
    if not rows:
        return None
    last_active = next((r for r in rows if int(r["minutes"] or 0) > 0), None)
    if last_active is None:
        return None
    last_day = parse_ts(str(last_active["date"]))
    if last_day is None:
        return None
    idle = (ctx.now.date() - last_day.date()).days
    prior_streak = sum(1 for r in rows if r["goal_met"])
    if idle < 3 or prior_streak < 7:
        return None
    return Firing(
        rule_id="returning-learner",
        description="Back after a break — next session shrinks to the 30-minute variant",
        evidence={"idle_days": idle, "prior_goal_days": prior_streak},
        action={
            "type": "shrink_next_session",
            "variant_minutes": 30,
            "count": 1,
            "within_days": 3,
        },
    )


def _default_activity(skill: str) -> str:
    return {
        "listening": "part_set",
        "reading": "passage_timed",
        "writing": "task2_essay",
        "speaking": "p2_long_turn",
    }.get(skill, "practice")


# Priority = declaration order (10 §8 table order).
RULES: tuple[Rule, ...] = (
    Rule("gra-low-streak", "3 consecutive low GRA scores", 14, _gra_low_streak),
    Rule("reading-timeouts", "Reading timer hit 2 of last 3", 14, _reading_timeouts),
    Rule(
        "listening-late-parts",
        "Parts 3+4 accuracy trails Parts 1+2",
        14,
        _listening_late_parts,
    ),
    Rule("speaking-lr-flat", "Speaking LR flat at <= 5.5", 14, _speaking_lr_flat),
    Rule("writing-ta-low", "Writing TA low twice running", 14, _writing_ta_low),
    Rule(
        "vocab-retention-drop",
        "7-day retention below 80 %",
        7,
        _vocab_retention_drop,
        daily_rollover_only=True,
    ),
    Rule("stale-skill", "No attempt in a skill for 14 days", 14, _stale_skill, True),
    Rule("returning-learner", "Streak broken after 7+ days", 14, _returning_learner, True),
)


# --------------------------------------------------------------------------------------
# Engine
# --------------------------------------------------------------------------------------


def _in_cooldown(session: Any, profile_id: str, rule: Rule, now: datetime) -> bool:
    row = session.execute(
        text(
            "SELECT fired_at FROM adaptive_events WHERE profile_id = :pid AND rule_id = :rid "
            "ORDER BY fired_at DESC LIMIT 1"
        ),
        {"pid": profile_id, "rid": rule.id},
    ).first()
    if row is None:
        return False
    fired = parse_ts(str(row[0]))
    if fired is None:
        return False
    return (now - fired).total_seconds() < rule.cooldown_days * 86400


def _fired_today(session: Any, profile_id: str, now: datetime) -> int:
    row = session.execute(
        text(
            "SELECT COUNT(*) FROM adaptive_events WHERE profile_id = :pid "
            "AND fired_at >= :start"
        ),
        {"pid": profile_id, "start": now.date().isoformat()},
    ).first()
    return int(row[0] if row else 0)


def evaluate(
    session: Any,
    profile_id: str,
    now: datetime | None = None,
    daily_rollover: bool = False,
) -> list[dict[str, Any]]:
    """Run the rule set; persist and apply at most ``MAX_FIRINGS_PER_DAY`` firings."""
    now = now or utcnow()
    ctx = RuleContext(
        session=session,
        profile_id=profile_id,
        now=now,
        attempts=load_attempts(session, profile_id),
    )
    budget = MAX_FIRINGS_PER_DAY - _fired_today(session, profile_id, now)
    if budget <= 0:
        return []

    applied: list[dict[str, Any]] = []
    for rule in RULES:
        if budget <= 0:
            break
        if rule.daily_rollover_only and not daily_rollover:
            continue
        if _in_cooldown(session, profile_id, rule, now):
            continue
        try:
            firing = rule.check(ctx)
        except Exception:  # noqa: BLE001 — one broken rule must not stop the others
            _log.exception("adaptive rule %s failed to evaluate", rule.id)
            continue
        if firing is None:
            continue
        event = _persist(session, profile_id, firing, now)
        applied.append(event)
        budget -= 1
    return applied


def _persist(
    session: Any, profile_id: str, firing: Firing, now: datetime
) -> dict[str, Any]:
    event_id = f"ae_{ULID()}"
    session.execute(
        text(
            "INSERT INTO adaptive_events (id, profile_id, rule_id, fired_at, evidence_json, "
            "action_json) VALUES (:id, :pid, :rid, :at, :ev, :ac)"
        ),
        {
            "id": event_id,
            "pid": profile_id,
            "rid": firing.rule_id,
            "at": iso(now),
            "ev": json.dumps(firing.evidence),
            "ac": json.dumps(firing.action),
        },
    )
    changed = apply_action(session, profile_id, firing.action, now)
    return {
        "id": event_id,
        "rule_id": firing.rule_id,
        "description": firing.description,
        "fired_at": iso(now),
        "evidence": firing.evidence,
        "action": firing.action,
        "sessions_changed": changed,
    }


def apply_action(
    session: Any, profile_id: str, action: dict[str, Any], now: datetime
) -> list[str]:
    """Rewrite upcoming plan-session blocks so a firing is visible, not advisory."""
    from bandready.curriculum.plan import active_plan_id

    plan_id = active_plan_id(session, profile_id)
    if not plan_id:
        return []
    horizon = (now + timedelta(days=int(action.get("within_days") or 7))).date().isoformat()
    rows = session.execute(
        text(
            "SELECT id, blocks_json, duration_min FROM plan_sessions WHERE plan_id = :plan "
            "AND date >= :today AND date <= :until AND status = 'scheduled' "
            "ORDER BY date LIMIT :n"
        ),
        {
            "plan": plan_id,
            "today": now.date().isoformat(),
            "until": horizon,
            "n": max(1, int(action.get("count") or 1)),
        },
    ).mappings().all()

    kind = str(action.get("type"))
    changed: list[str] = []
    for row in rows:
        try:
            blocks = json.loads(row["blocks_json"])
        except (TypeError, ValueError):
            continue
        if not isinstance(blocks, list):
            continue
        touched = False
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if kind in ("inject_micro_drills", "queue_vocab_packs") and block.get("kind") == "micro_drill":
                block["module"] = action.get("module", block.get("module"))
                block["activity"] = action.get("activity", block.get("activity"))
                block.setdefault("params", {})["adaptive"] = True
                touched = True
            elif kind in ("replace_main_activity", "promote_main_activity", "bias_activity_picker") and block.get("kind") == "main":
                block["module"] = action.get("module", block.get("module"))
                block["activity"] = action.get("activity", block.get("activity"))
                params = block.setdefault("params", {})
                params["adaptive"] = True
                params.update(action.get("flags") or {})
                touched = True
            elif kind == "cap_new_cards" and block.get("kind") == "warmup_srs":
                block.setdefault("params", {})["new_cards"] = 0
                touched = True
            elif kind == "shrink_next_session":
                touched = True
        if kind == "shrink_next_session":
            blocks = _shrink(blocks)
        if not touched:
            continue
        duration = sum(int(b.get("minutes") or 0) for b in blocks if isinstance(b, dict))
        session.execute(
            text(
                "UPDATE plan_sessions SET blocks_json = :b, duration_min = :d WHERE id = :id"
            ),
            {"b": json.dumps(blocks), "d": duration or row["duration_min"], "id": row["id"]},
        )
        changed.append(str(row["id"]))
    return changed


def _shrink(blocks: list[Any]) -> list[Any]:
    from bandready.curriculum.plan import VARIANTS

    target = VARIANTS[30]
    for block in blocks:
        if not isinstance(block, dict):
            continue
        kind = block.get("kind")
        if kind == "warmup_srs":
            block["minutes"] = target["warmup"]
            block.setdefault("params", {})["max_cards"] = target["max_cards"]
        elif kind == "main":
            block["minutes"] = target["main"]
        elif kind == "micro_drill":
            block["minutes"] = target["micro"]
    return blocks


def recent_events(
    session: Any, profile_id: str, limit: int = 5, include_dismissed: bool = False
) -> list[dict[str, Any]]:
    """Dashboard callouts (§7) — evidence AND action, so changes are auditable."""
    sql = (
        "SELECT id, rule_id, fired_at, evidence_json, action_json, dismissed_at "
        "FROM adaptive_events WHERE profile_id = :pid "
        + ("" if include_dismissed else "AND dismissed_at IS NULL ")
        + "ORDER BY fired_at DESC LIMIT :n"
    )
    rows = session.execute(text(sql), {"pid": profile_id, "n": max(1, limit)}).mappings().all()
    described = {r.id: r.description for r in RULES}
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "id": row["id"],
                "rule_id": row["rule_id"],
                "description": described.get(str(row["rule_id"]), str(row["rule_id"])),
                "fired_at": row["fired_at"],
                "evidence": _json(row["evidence_json"]),
                "action": _json(row["action_json"]),
                "dismissed_at": row["dismissed_at"],
            }
        )
    return out


def dismiss(session: Any, profile_id: str, event_id: str) -> bool:
    result = session.execute(
        text(
            "UPDATE adaptive_events SET dismissed_at = :at WHERE id = :id AND profile_id = :pid"
        ),
        {"at": iso(datetime.now(UTC)), "id": event_id, "pid": profile_id},
    )
    return bool(result.rowcount)


def _json(raw: Any) -> Any:
    if raw is None or isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
