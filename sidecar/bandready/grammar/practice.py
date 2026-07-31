"""The Ladder — the learning algorithm (grammar `DESIGN.md` §1).

The owner asked for this by name: *more vocabulary and phrases, practised with real
sentences so they are actually memorised — with a proper algorithm for how that is
achieved.* This module is that algorithm.

It sits **on top of** FSRS, not instead of it, and the division is absolute:
:mod:`bandready.grammar.scheduler_bridge` decides *when* a card comes back;
this module decides *what kind* of question is asked, *which sentence* it is asked in,
*what counts as a pass*, and *whether the point is mastered*. Read that module's docstring
before changing anything here that touches ``due_at``, ``stability`` or ``state`` — the
answer is that you must not.

The six rungs, and what each one asks for:

===== ================= ==================================================================
Stage Learner-facing    What the learner does
===== ================= ==================================================================
S0    Meet              Worked examples, a meaning question about each, then the rule
S1    Notice            Decodes form → meaning without producing anything
S2    Build             Produces the form with the meaning fixed
S3    Choose            Both options are grammatical; the situation decides
S4    Use               Builds an original sentence to a specification
S5    Under pressure    Uses it inside a task that would exist without it, timed
===== ================= ==================================================================

S3 is its own rung because *when to use which* is a different skill from producing the
form. An item that can be produced but not chosen is not learned. That is the owner's ask,
made structural.
"""

from __future__ import annotations

import json
import logging
import random
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.grammar import syllabus
from bandready.grammar.syllabus import Point
from bandready.grammar.tables import GrammarCard, GrammarReviewLog
from bandready.srs import scheduler as sched

from . import scheduler_bridge as bridge

_log = logging.getLogger("bandready.grammar.practice")

__all__ = [
    "ERROR_CODES",
    "KINDS_BY_STAGE",
    "LATENCY_THRESHOLD_MS",
    "STAGE_NAMES",
    "SelectionContext",
    "apply_outcome",
    "arrange",
    "build_session",
    "eligible_kinds",
    "harvest",
    "items_for_point",
    "mastery_report",
    "open_point",
    "outcome_for",
    "pass_gate",
    "progress",
    "public_item",
    "rating_for",
    "record_real_use",
    "reveal",
    "select_item",
    "stage_ceiling",
    "wild_failure",
]

# --------------------------------------------------------------------------------------
# 1. The rungs
# --------------------------------------------------------------------------------------

STAGE_NAMES: dict[int, str] = {
    0: "Meet",
    1: "Notice",
    2: "Build",
    3: "Choose",
    4: "Use",
    5: "Under pressure",
}

#: What each rung is allowed to ask. Stage sets the ceiling; FSRS state sets the floor.
KINDS_BY_STAGE: dict[int, tuple[str, ...]] = {
    0: ("interpret", "discover"),
    1: ("interpret", "judge"),
    2: ("gap_fill", "order", "transform", "dictation"),
    3: ("choose_form", "contrast_pair", "both_ok", "judge", "error_fix"),
    4: ("produce", "combine", "dictation"),
    5: ("produce", "speaking_drill"),
}

#: Starting values, invented, to be recalibrated from our own logs once there are any —
#: which is why they are a constant and not a literal buried in a comparison (§1.6).
#: S4 and S5 are untimed: an original sentence takes as long as it takes.
LATENCY_THRESHOLD_MS: dict[int, int | None] = {0: None, 1: 6_000, 2: 15_000, 3: 20_000, 4: None, 5: None}

ADVANCE_MIN_SUCCESSES = 2
ADVANCE_MIN_DAYS = 2
ADVANCE_MIN_ITEMS = 2          # S2 and above
S1_FORCED_PROMOTION_AFTER = 3  # recognition does not become production on its own
LEECH_CAP_STAGE = 3
LEECH_CAP_DAYS = 14
MAX_CONSECUTIVE_SAME_TYPE = 3
MAX_CONSECUTIVE_SAME_POINT = 2
TWIN_MIN_GAP = 4
SHORT_CONTEXT_WORDS = 14
#: ~60:40 lex:gram by item count, which lands near 50:50 by time because grammar items are
#: slower. Tune against observed session length, not against the ratio (§1.9).
LEX_PER_GRAM = 1.5
#: The fallback window used to answer "did this card already advance this session?" when
#: the client did not tell us when the session started.
SESSION_WINDOW_MINUTES = 45

SUCCESS_OUTCOMES = ("pass", "pass_slow", "self_repair")
ALL_OUTCOMES = ("pass", "pass_slow", "self_repair", "hint", "fail")

FREE_PRODUCTION_KINDS = ("produce", "combine", "speaking_drill")


def stage_ceiling(card: GrammarCard, *, leech_active: bool = False) -> int:
    """The highest rung this card may be asked at right now.

    Mirrors ``exercises.eligible_types()``: **stage sets the ceiling, FSRS state sets the
    floor**, so a lapsed mature card gets an easier question than its stage alone would
    give. The thresholds are imported from ``srs.scheduler``; there is no third set.
    """
    stage = int(card.stage)
    state = int(card.state)
    stability = float(card.stability or 0.0)

    if state in (sched.STATE_NEW, sched.STATE_LEARNING):
        ceiling = min(stage, 2)
    elif state == sched.STATE_RELEARNING or stability < bridge.YOUNG_STABILITY_DAYS:
        ceiling = min(stage, 3)
    elif stability < bridge.MATURE_STABILITY_DAYS:
        ceiling = min(stage, 4)
    else:
        ceiling = stage

    if leech_active:
        ceiling = min(ceiling, LEECH_CAP_STAGE)
    return max(0, ceiling)


def leech_capped(session: Session, card: GrammarCard, now: datetime | None = None) -> bool:
    """Is this card still inside its 14-day leech cap?

    Derived from the log rather than stored, so no column has to be invented for it and
    the cap expires on its own: a leech is a card that lapsed twice in three reviews, and
    the cap runs for :data:`LEECH_CAP_DAYS` from that lapse.
    """
    if not int(card.leech or 0):
        return False
    now = now or sched.now_utc()
    last_lapse = session.execute(
        select(GrammarReviewLog.reviewed_at)
        .where(GrammarReviewLog.card_id == card.id, GrammarReviewLog.rating == 1)
        .order_by(GrammarReviewLog.reviewed_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not last_lapse:
        return False
    moment = sched.parse_iso(str(last_lapse))
    return bool(moment and (now - moment) < timedelta(days=LEECH_CAP_DAYS))


def eligible_kinds(
    point: Point,
    card: GrammarCard,
    *,
    seen: list[str] | None = None,
    allow_llm: bool = True,
    leech_active: bool = False,
) -> tuple[int, list[str]]:
    """``(stage, kinds)`` this card may be asked at, walking down until the bank can answer.

    A point with no unseen item at the ceiling drops a rung rather than repeating the item
    the learner saw yesterday — §1.5 rule 1 is that a repeated context builds a memorised
    sentence, not a generalisable rule.
    """
    ceiling = stage_ceiling(card, leech_active=leech_active)
    seen_set = set(seen or [])
    for stage in range(ceiling, -1, -1):
        kinds = [
            kind
            for kind in KINDS_BY_STAGE[stage]
            if (allow_llm or kind not in FREE_PRODUCTION_KINDS)
            and any(
                str(i.get("kind")) == kind and int(i.get("stage") or 0) == stage
                for i in point.items
            )
        ]
        if not kinds:
            continue
        unseen = [
            kind
            for kind in kinds
            if any(
                str(i.get("kind")) == kind
                and int(i.get("stage") or 0) == stage
                and str(i.get("id")) not in seen_set
                for i in point.items
            )
        ]
        return stage, (unseen or kinds)
    return 0, []


# --------------------------------------------------------------------------------------
# 2. Choosing the sentence — what makes this "practised with real sentences"
# --------------------------------------------------------------------------------------


@dataclass
class SelectionContext:
    """Everything §1.5's seven rules need, gathered once per session."""

    seen: list[str] = field(default_factory=list)
    session_item_ids: list[str] = field(default_factory=list)
    register_bias: str | None = None
    topic_bias: set[str] = field(default_factory=set)
    allow_llm: bool = True
    leech_active: bool = False
    rng: random.Random = field(default_factory=random.Random)


def _context_words(item: dict[str, Any]) -> int:
    payload = item.get("payload") or {}
    text = " ".join(
        str(payload.get(key) or "")
        for key in ("context", "stem", "sentence", "given", "audio_text", "prompt_text")
    )
    return len(text.split())


def _teaching_ids(point: Point, stage: int, kinds: set[str]) -> list[str]:
    """The ids of the teaching set at one rung — everything not held in the reserve.

    ``review_only`` marks the review reserve: the items held back so that a card coming
    round for the ninth time still has something the learner has not seen (§2.7). The
    reserve is therefore judged **per rung, not per kind**. Asking "has this *kind* run
    out?" releases the reserve far too early — a rung where `both_ok` happens to hold only
    a reserve item would hand it over on the learner's first visit, which is precisely the
    first pass the field exists to stay out of.

    Where a rung has *no* teaching item at all — several points hold their only S5 item in
    the reserve — this returns ``[]``, the rung reads as exhausted, and the reserve is all
    there is. Getting that case wrong strands the card below the top rung forever.
    """
    return [
        str(i.get("id"))
        for i in point.items
        if int(i.get("stage") or 0) == stage
        and str(i.get("kind")) in kinds
        and not i.get("review_only")
    ]


def select_item(
    point: Point,
    card: GrammarCard,
    ctx: SelectionContext,
) -> dict[str, Any] | None:
    """Pick the next item for this card, applying §1.5's rules in order.

    1. never repeat a context at consecutive presentations — prefer the least recently seen;
    2. exhaust the bank before repeating anything;
    3. bias toward the register the learner has been using;
    4. bias toward a topic they have recently practised;
    5. twins are never adjacent (≥ 4 items apart, or a different session);
    6. form focus early, semantic load late — short contexts at S1–S2;
    7. a ``produce`` item at S4 seeds its content word from the due vocabulary queue.

    Rule 7 is applied by the caller, which is the only place that can see both queues; this
    function flags the item that wants a seed.
    """
    ceiling = stage_ceiling(card, leech_active=ctx.leech_active)
    seen_set = set(ctx.seen)
    recent_session = ctx.session_item_ids[-TWIN_MIN_GAP:]

    stage = ceiling
    candidates: list[dict[str, Any]] = []
    # Walk down the rungs until the bank can answer. A point whose top rung is exhausted
    # asks a lower question rather than repeating the item the learner saw an hour ago.
    for rung in range(ceiling, -1, -1):
        kinds = set(KINDS_BY_STAGE[rung])
        if not ctx.allow_llm:
            # Offline, a free-production item can neither be asked nor counted: leaving it
            # in the teaching set would make the rung permanently unexhausted and lock the
            # reserve away on exactly the sessions that most need it.
            kinds -= set(FREE_PRODUCTION_KINDS)
        teaching = _teaching_ids(point, rung, kinds)
        reserve_open = all(item_id in seen_set for item_id in teaching)
        found: list[dict[str, Any]] = []
        for item in point.items:
            if int(item.get("stage") or 0) != rung or str(item.get("kind")) not in kinds:
                continue
            item_id = str(item.get("id"))
            if item_id in ctx.session_item_ids:
                continue
            if item.get("review_only") and not reserve_open:
                continue
            twin = item.get("twin_id")
            if twin and str(twin) in recent_session:
                continue  # rule 5 — a twin next to its pair is a memory test, not a choice
            found.append(item)
        if found:
            stage, candidates = rung, found
            break

    if not candidates:
        return None

    def score(item: dict[str, Any]) -> float:
        item_id = str(item.get("id"))
        value = 0.0
        if item_id not in seen_set:
            value += 100.0
        else:
            # Least recently seen first: earlier in the list is older.
            value += ctx.seen.index(item_id) / max(1, len(ctx.seen))
        register = str(item.get("register") or "both")
        if ctx.register_bias and register in (ctx.register_bias, "both"):
            value += 12.0 if register == ctx.register_bias else 3.0
        if item.get("topic_id") and str(item["topic_id"]) in ctx.topic_bias:
            value += 8.0
        if stage <= 2 and _context_words(item) <= SHORT_CONTEXT_WORDS:
            value += 6.0
        difficulty = int(item.get("difficulty") or 2)
        if int(card.stage_successes or 0) == 0 and difficulty == 1:
            value += 4.0
        value += ctx.rng.random()  # tie-break, and stop the bank feeling ordered
        return value

    return max(candidates, key=score)


# --------------------------------------------------------------------------------------
# 3. Outcome, and outcome → FSRS rating (§1.8)
# --------------------------------------------------------------------------------------


def outcome_for(
    grade: dict[str, Any],
    *,
    item_stage: int,
    attempts: int = 1,
    hint_used: bool = False,
    revealed: bool = False,
    elapsed_ms: int | None = None,
) -> str:
    """One of ``pass`` · ``pass_slow`` · ``self_repair`` · ``hint`` · ``fail``.

    Note what is *not* here: the learner's opinion. Self-rating is offered at S1 only,
    where the app genuinely cannot see inside their head. Everywhere else the grading is
    the app's, because learners systematically mistake the fluency of recognition for the
    durability of recall.
    """
    if revealed:
        return "fail"
    correct = bool(grade.get("correct")) or bool(grade.get("close"))
    if not correct:
        return "fail"
    if hint_used:
        return "hint"
    if attempts > 1:
        return "self_repair"
    threshold = LATENCY_THRESHOLD_MS.get(item_stage)
    if threshold is not None and elapsed_ms is not None and elapsed_ms > threshold:
        return "pass_slow"
    return "pass"


def rating_for(
    outcome: str,
    *,
    item_stage: int,
    card_stage: int,
    elapsed_ms: int | None = None,
    typo: bool = False,
) -> int:
    """The §1.8 mapping. FSRS sees only 1–4 and takes what it is given as truth."""
    if outcome == "fail":
        return 1
    if outcome in ("self_repair", "hint", "pass_slow"):
        return 2
    if typo:
        return 3  # a spelling slip is a pass, and never an "easy"
    threshold = LATENCY_THRESHOLD_MS.get(item_stage)
    # `easy` needs evidence of ease, and at the untimed production rungs there is none:
    # writing an original sentence is never "easy", however well it comes out.
    fast = threshold is not None and elapsed_ms is not None and elapsed_ms <= threshold * 0.6
    if fast and item_stage >= card_stage:
        return 4
    return 3


# --------------------------------------------------------------------------------------
# 4. Advancement and demotion (§1.6)
# --------------------------------------------------------------------------------------


def _logs_at_current_stage(
    session: Session, card: GrammarCard, limit: int = 60
) -> list[GrammarReviewLog]:
    """Reviews since the card last changed rung.

    Derived rather than stored: the first log whose ``stage_before`` differs from the
    card's current stage is the one that moved it, so everything after that is this rung's
    history. One less column to keep in step.
    """
    rows = (
        session.execute(
            select(GrammarReviewLog)
            .where(GrammarReviewLog.card_id == card.id)
            .order_by(GrammarReviewLog.reviewed_at.desc(), GrammarReviewLog.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    out: list[GrammarReviewLog] = []
    for row in rows:
        if int(row.stage_before) != int(card.stage):
            break
        out.append(row)
    return out


def _recent_ratings(session: Session, card: GrammarCard, count: int = 3) -> list[int]:
    return [
        int(r)
        for r in session.execute(
            select(GrammarReviewLog.rating)
            .where(GrammarReviewLog.card_id == card.id)
            .order_by(GrammarReviewLog.reviewed_at.desc(), GrammarReviewLog.id.desc())
            .limit(count)
        )
        .scalars()
        .all()
    ]


def _advanced_in_session(
    session: Session, card: GrammarCard, since_iso: str | None
) -> bool:
    """At most one stage advance per session per card (§1.6).

    A session has no row of its own, so the window is either the client's declared session
    start or the last :data:`SESSION_WINDOW_MINUTES`. Any log in that window whose
    ``stage_before`` is *below* the card's current stage is an advance that already
    happened.
    """
    window = since_iso or sched.iso(sched.now_utc() - timedelta(minutes=SESSION_WINDOW_MINUTES))
    rows = (
        session.execute(
            select(GrammarReviewLog.stage_before)
            .where(
                GrammarReviewLog.card_id == card.id,
                GrammarReviewLog.reviewed_at >= window,
            )
        )
        .scalars()
        .all()
    )
    return any(int(stage) < int(card.stage) for stage in rows)


def _may_advance(
    card: GrammarCard,
    *,
    stage_days: list[str],
    stage_items: set[str],
    clean: bool,
    advanced_this_session: bool,
    leech_active: bool,
    available_items: int = ADVANCE_MIN_ITEMS,
) -> tuple[bool, str]:
    """The five advancement conditions, as a pure function so a test can pin each one."""
    stage = int(card.stage)
    if stage >= 5:
        return False, "already at the top rung"
    if advanced_this_session:
        return False, "one rung per session — the next one is tomorrow's"
    if not clean:
        return False, "the last attempt needed help or ran long"
    successes = int(card.stage_successes or 0)

    # S1 is deliberately thin. Recognition does not become production on its own, and the
    # bug to avoid is items lingering at S1 because flip cards are easy and keep passing.
    if stage == 1 and successes >= S1_FORCED_PROMOTION_AFTER:
        return True, "three clean passes at Notice — that rung is done"

    if leech_active and stage >= LEECH_CAP_STAGE:
        return False, "this one keeps slipping, so it stays at Choose for now"
    if successes < ADVANCE_MIN_SUCCESSES:
        return False, f"{successes} of {ADVANCE_MIN_SUCCESSES} clean passes at this rung"
    if len(set(stage_days)) < ADVANCE_MIN_DAYS:
        return False, "needs a second day — spacing is the point"
    # "Two distinct sentences" is a requirement on the *learner*, not a way to strand a
    # card on a rung whose bank cannot supply two. The authoring floors allow a single
    # `produce` item at Use and a single one at Under pressure, and that is fine: a
    # production prompt is answered with different content every time, so the second
    # attempt genuinely is a second sentence.
    required_items = max(1, min(ADVANCE_MIN_ITEMS, available_items or ADVANCE_MIN_ITEMS))
    if stage >= 2 and len(stage_items) < required_items:
        return False, "needs a second sentence, not the same one again"
    return True, "moved up"


def bank_size(point: Point, stage: int) -> int:
    """How many distinct items this point can offer at one rung."""
    kinds = set(KINDS_BY_STAGE.get(stage, ()))
    return sum(
        1
        for item in point.items
        if int(item.get("stage") or 0) == stage and str(item.get("kind")) in kinds
    )


def apply_outcome(
    session: Session,
    card: GrammarCard,
    point: Point,
    item: dict[str, Any] | None,
    *,
    outcome: str,
    grade: dict[str, Any] | None = None,
    elapsed_ms: int | None = None,
    now: datetime | None = None,
    session_started_at: str | None = None,
    rating_override: int | None = None,
) -> dict[str, Any]:
    """One review, end to end: rung first, then FSRS, then the log. One transaction.

    The order matters. The Ladder computes the rating from the outcome, FSRS is handed
    that rating and returns a new ``due_at``, and the ladder columns are updated beside it.
    The caller owns the commit.
    """
    now = now or sched.now_utc()
    grade = grade or {}
    item = item or {}
    item_id = str(item.get("id")) if item.get("id") else None
    item_stage = int(item.get("stage") or card.stage)
    kind = str(item.get("kind") or "interpret")
    stage_before = int(card.stage)
    leech_active = leech_capped(session, card, now)

    typo = bool(grade.get("close")) and not bool(grade.get("correct"))
    rating = (
        int(rating_override)
        if rating_override is not None
        else rating_for(
            outcome,
            item_stage=item_stage,
            card_stage=stage_before,
            elapsed_ms=elapsed_ms,
            typo=typo,
        )
    )

    # ---- ladder state ---------------------------------------------------------------
    stage_days = _json_list(card.stage_days_json)
    seen = _json_list(card.seen_items_json)
    if item_id and item_id not in seen:
        seen.append(item_id)
    elif item_id:
        seen.remove(item_id)
        seen.append(item_id)  # move to the back: least-recently-seen ordering (§1.5 rule 1)

    day_key = sched.study_day_key(now)
    reason = ""
    stage_after = stage_before
    reteach = False

    if outcome == "fail":
        card.stage_successes = 0
        ratings = [1, *_recent_ratings(session, card, 2)]
        if sum(1 for r in ratings[:3] if r == 1) >= 2:
            stage_after = max(0, stage_before - 2)
            card.leech = 1
            reason = "this one keeps slipping — two rungs back, and it is flagged"
        elif stage_before >= 3:
            stage_after = stage_before - 1
            reteach = True
            reason = "one rung back, with the rule restated before the retry"
        else:
            reason = "stay here — this rung is not finished"
    elif outcome == "hint" and stage_before >= 4:
        # A hinted pass buys nothing at the production rungs (§1.6).
        reason = "a hinted answer does not count towards moving up"
    else:
        card.stage_successes = int(card.stage_successes or 0) + 1
        if day_key not in stage_days:
            stage_days.append(day_key)
        stage_items = {
            str(row.item_id)
            for row in _logs_at_current_stage(session, card)
            if row.item_id and row.outcome in SUCCESS_OUTCOMES
        }
        if item_id:
            stage_items.add(item_id)
        ok, reason = _may_advance(
            card,
            stage_days=stage_days,
            stage_items=stage_items,
            clean=(outcome == "pass"),
            advanced_this_session=_advanced_in_session(session, card, session_started_at),
            leech_active=leech_active,
            available_items=bank_size(point, stage_before),
        )
        if ok:
            stage_after = min(5, stage_before + 1)

    if stage_after != stage_before:
        card.stage = stage_after
        card.stage_successes = 0
        stage_days = []

    card.stage_days_json = json.dumps(stage_days, ensure_ascii=False)
    card.seen_items_json = json.dumps(seen[-80:], ensure_ascii=False)

    # ---- FSRS half ------------------------------------------------------------------
    error_codes = (
        [str(c) for c in (item.get("error_codes") or [])] if outcome == "fail" else []
    )
    log = bridge.review(
        card,
        rating,
        review_type=kind,
        outcome=outcome,
        item_id=item_id,
        stage_before=stage_before,
        error_codes=error_codes,
        elapsed_ms=elapsed_ms,
        now=now,
    )
    session.add(log)
    session.flush()

    return {
        "point_id": point.id,
        "card_id": card.id,
        "item_id": item_id,
        "outcome": outcome,
        "rating": rating,
        "stage_before": stage_before,
        "stage_after": int(card.stage),
        "stage_name": STAGE_NAMES[int(card.stage)],
        "advanced": int(card.stage) > stage_before,
        "demoted": int(card.stage) < stage_before,
        "reteach_first": reteach,
        "ladder_note": reason,
        "leech": bool(int(card.leech or 0)),
        "error_codes": error_codes,
        "card": bridge.card_public(card, now),
        "next_intervals": bridge.preview_intervals(card, now),
    }


def _json_list(raw: Any) -> list[str]:
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return [str(v) for v in value] if isinstance(value, list) else []


# --------------------------------------------------------------------------------------
# 5. The entry gate (§1.3) — nothing is scheduled until it is understood
# --------------------------------------------------------------------------------------


def open_point(point: Point) -> dict[str, Any]:
    """The S0 package: meet it, see one narrated example, then answer one question.

    Three beats, in this order and no other. Discovery *then* explicit statement: a rule
    read before the learner has felt the problem is a fact to forget.
    """
    teach = point.teach
    notice = [dict(entry) for entry in (teach.get("notice_set") or [])]
    for entry in notice:
        entry.pop("key", None)
        entry.pop("why", None)
    return {
        "point": syllabus.point_public(point),
        "stage": 0,
        "stage_name": STAGE_NAMES[0],
        "beats": [
            {
                "beat": "meaning",
                "can_do": teach.get("can_do"),
                "why_it_matters": teach.get("why_it_matters"),
                "notice_set": notice,
                "discovery": _blind_discovery(teach.get("discovery")),
            },
            {
                "beat": "worked_example",
                "worked_example": teach.get("worked_example"),
                "minimal_pair": point.contrast.get("minimal_pair"),
            },
            {
                "beat": "first_retrieval",
                "note": (
                    "One question at Build level. Get it and the point starts being "
                    "scheduled; miss it twice and we go round the examples again — "
                    "nothing is put into your review queue until it means something."
                ),
            },
        ],
        "rule_card_locked_until": "notice_set_answered",
        "gate_attempts_allowed": 2,
    }


def _blind_discovery(discovery: Any) -> dict[str, Any] | None:
    """The discovery screen with the verdicts stripped — the learner rules first."""
    if not isinstance(discovery, dict):
        return None
    out = dict(discovery)
    out["candidate_rules"] = [
        {"text": rule.get("text")}
        for rule in (discovery.get("candidate_rules") or [])
        if isinstance(rule, dict)
    ]
    return out


def gate_item(point: Point, rng: random.Random | None = None) -> dict[str, Any] | None:
    """The one immediate retrieval that has to be passed before a card exists.

    Beat 3 of §1.3, at S1 difficulty: something that asks the learner to *do* the thing,
    not to recognise the word for it.
    """
    rng = rng or random.Random()
    pool = [
        i
        for i in point.items
        if int(i.get("stage") or 0) in (1, 2)
        and str(i.get("kind")) in ("interpret", "gap_fill", "judge")
        and not i.get("review_only")
    ]
    if not pool:
        pool = [i for i in point.items if int(i.get("stage") or 0) <= 2]
    if not pool:
        return None
    pool.sort(key=lambda i: (int(i.get("difficulty") or 2), str(i.get("id"))))
    return pool[0]


def pass_gate(
    session: Session,
    profile_id: str,
    point: Point,
    *,
    now: datetime | None = None,
) -> GrammarCard:
    """Create the card. Called only after beat 3 has actually been passed.

    Idempotent under concurrency, not just under a double tap. Check-then-insert loses the
    race whenever two requests for the same point arrive together — which is not exotic: a
    development build mounts every effect twice, and a learner opening a lesson in two
    windows does the same thing. The second insert then violates
    ``uq_grammar_cards_profile_point`` and, because that is an ``IntegrityError`` on the
    session's own transaction, it takes the whole request down rather than the one row. The
    ``SAVEPOINT`` contains it: the loser rolls back its own insert, re-reads, and both
    callers walk away with the same card.
    """
    now = now or sched.now_utc()
    existing = session.execute(
        select(GrammarCard).where(
            GrammarCard.profile_id == profile_id, GrammarCard.point_id == point.id
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    card = bridge.create_card(profile_id, point.id, now)
    card.stage = 1  # the gate pass *is* the S0 → S1 promotion
    try:
        with session.begin_nested():
            session.add(card)
    except IntegrityError:
        card = session.execute(
            select(GrammarCard).where(
                GrammarCard.profile_id == profile_id, GrammarCard.point_id == point.id
            )
        ).scalar_one()
    session.flush()
    return card


# --------------------------------------------------------------------------------------
# 6. Mastery (§1.7) — five conditions, only one of which is FSRS's
# --------------------------------------------------------------------------------------


def mastery_report(
    session: Session,
    card: GrammarCard,
    point: Point,
    points: dict[str, Point] | None = None,
) -> dict[str, Any]:
    """Is this point mastered, and if not, which of the five conditions is missing?

    **Stability is not mastery.** A learner can max out stability on recognition items and
    produce none of it, which is why condition 3 exists and why condition 5 exists: you
    have not mastered the present perfect until you can decline to use it.
    """
    logs = (
        session.execute(
            select(GrammarReviewLog)
            .where(GrammarReviewLog.card_id == card.id)
            .order_by(GrammarReviewLog.reviewed_at.desc())
            .limit(200)
        )
        .scalars()
        .all()
    )

    real_use = next(
        (
            row
            for row in logs
            if row.outcome in SUCCESS_OUTCOMES and str(row.item_id or "").startswith("real:")
        ),
        None,
    )
    drilled_production = any(
        row.outcome == "pass"
        and row.review_type in FREE_PRODUCTION_KINDS
        and not str(row.item_id or "").startswith(("wild:", "real:"))
        for row in logs
    )
    no_recent_lapse = not any(int(row.rating) == 1 for row in logs[:3])

    sibling_choice = True
    sibling_detail = None
    if point.confusion_set:
        points = points or syllabus.load_points(session)
        sibling_ids = {p.id for p in syllabus.siblings(points, point)}
        sibling_choice = False
        if sibling_ids:
            sibling_cards = {
                row.point_id: row.id
                for row in session.execute(
                    select(GrammarCard).where(
                        GrammarCard.profile_id == card.profile_id,
                        GrammarCard.point_id.in_(sibling_ids),
                    )
                )
                .scalars()
                .all()
            }
            if sibling_cards:
                passed = session.execute(
                    select(GrammarReviewLog.id)
                    .where(
                        GrammarReviewLog.card_id.in_(list(sibling_cards.values())),
                        GrammarReviewLog.review_type == "choose_form",
                        GrammarReviewLog.outcome.in_(SUCCESS_OUTCOMES),
                    )
                    .limit(1)
                ).first()
                sibling_choice = passed is not None
            sibling_detail = (
                "You have shown you can pick the other one when the other one is right."
                if sibling_choice
                else "Still to do: choose correctly on the rival form, not just on this one."
            )

    conditions = {
        "at_top_rung": int(card.stage) == 5,
        "durable": float(card.stability or 0.0) >= bridge.MATURE_STABILITY_DAYS,
        "produced_unassisted": bool(real_use) or drilled_production,
        "no_recent_lapse": no_recent_lapse,
        "declines_the_rival": sibling_choice,
    }
    mastered = all(conditions.values())
    return {
        "point_id": point.id,
        "mastered": mastered,
        "conditions": conditions,
        "evidence": {
            "production_source": (
                "a real submission" if real_use else ("practice" if drilled_production else None)
            ),
            "production_note": (
                "Confirmed in something you actually wrote or said — that counts for more "
                "than a drill, and it is why this took as long as it did."
                if real_use
                else None
            ),
            "sibling_note": sibling_detail,
            "stability_days": round(float(card.stability or 0.0), 1),
            "retrievals": len(logs),
        },
        # Mastery is reported as a sentence about the learner, never as a percentage.
        "can_do": point.teach.get("can_do") or point.title,
    }


def record_real_use(
    session: Session,
    card: GrammarCard,
    *,
    module: str,
    source_id: str,
    quote: str = "",
    now: datetime | None = None,
) -> GrammarReviewLog:
    """Log a correct use detected in a real submission (mastery condition 3).

    Deliberately **does not** touch FSRS. A sentence in an essay is evidence about what the
    learner can do; it is not a scheduled retrieval, and moving ``due_at`` on the strength
    of it would let a card drift out of review on the back of one lucky sentence.
    """
    now = now or sched.now_utc()
    _log.info("grammar: confirmed real use of %s in %s (%s)", card.point_id, module, quote[:60])
    log = GrammarReviewLog(
        id=f"grl_{ULID()}",
        card_id=card.id,
        item_id=f"real:{module}:{source_id}",
        rating=3,
        review_type="produce",
        outcome="pass",
        stage_before=int(card.stage),
        error_codes_json="[]",
        reviewed_at=sched.iso(now),
        elapsed_ms=None,
        state_before=int(card.state),
        stability_before=card.stability,
        difficulty_before=card.difficulty,
    )
    session.add(log)
    return log


# --------------------------------------------------------------------------------------
# 7. Entry route 1 — the learner's own errors (§1.3, F8)
# --------------------------------------------------------------------------------------

#: The 53 closed codes of §2.8, in their nine families. The slug is the join key between
#: the content, the drill selector, the progress screen and the rule sheet; the family
#: letter only groups them on screen. Three vocabularies for one concept would mean none
#: of them could aggregate.
ERROR_CODE_FAMILIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "T": (
        "Time and aspect",
        (
            "tense_finished_time_with_perfect", "tense_open_time_with_past",
            "tense_sequence_lost", "tense_drift_in_paragraph",
            "aspect_state_verb_continuous", "aspect_result_vs_activity",
            "future_will_in_time_clause", "future_evidence_vs_intention",
            "past_perfect_decorative",
        ),
    ),
    "M": (
        "Modality",
        (
            "modal_bare_infinitive", "modal_strength_mismatch", "modal_obligation_source",
            "modal_deduction_negative", "modal_perfect_form", "hedge_missing_overclaim",
        ),
    ),
    "V": (
        "Voice",
        (
            "passive_be_missing", "passive_participle_wrong", "passive_on_intransitive",
            "passive_unnecessary", "passive_agent_needed",
        ),
    ),
    "C": (
        "Condition and the unreal",
        (
            "conditional_would_in_if", "conditional_wrong_system", "unreal_past_missing",
            "unless_misused",
        ),
    ),
    "S": (
        "Sentence boundaries and joining clauses",
        (
            "comma_splice", "fragment_no_main_verb", "run_on_fused", "double_connector",
            "connector_relation_reversed", "subordinator_vs_preposition",
            "parallelism_broken",
        ),
    ),
    "R": (
        "Reference, relative and reporting",
        (
            "relative_pronoun_wrong", "relative_resumptive_pronoun", "relative_comma_meaning",
            "participle_dangling", "reference_ambiguous", "embedded_question_inversion",
            "reported_backshift_wrong",
        ),
    ),
    "N": (
        "The noun phrase",
        (
            "article_missing_singular", "article_generic_over_the",
            "article_specific_missing_the", "countable_uncountable",
            "quantifier_wrong_class", "agreement_subject_verb", "agreement_across_distance",
        ),
    ),
    "L": (
        "Lexico-grammar",
        (
            "preposition_dependent", "verb_pattern_wrong", "word_form_wrong",
            "comparative_form", "word_order_adverb",
        ),
    ),
    "G": (
        "Register and texture",
        ("register_spoken_in_writing", "register_written_in_speech", "linker_overused"),
    ),
}

ERROR_CODES: tuple[str, ...] = tuple(
    code for _label, codes in ERROR_CODE_FAMILIES.values() for code in codes
)

CODE_FAMILY: dict[str, str] = {
    code: label
    for _letter, (label, codes) in ERROR_CODE_FAMILIES.items()
    for code in codes
}

#: Free-text annotation → §2.8 code. **This is a bridge, not the design.** D6 asks the
#: writing and speaking scorers to emit codes at source; until they do, this reads what
#: they already produce rather than growing a parallel feedback path. Every rule needs two
#: signals to fire, and anything unmatched is dropped rather than guessed — a wrong code
#: sends the learner to the wrong lesson, which is worse than sending them to none.
_CODE_RULES: tuple[tuple[str, str, str], ...] = (
    # (code, pattern over the quote, pattern over fix + explanation)
    ("tense_finished_time_with_perfect",
     r"\b(?:have|has|'ve)\s+\w+(?:ed|en)\b.*\b(?:yesterday|last\s+\w+|ago|in\s+(?:19|20)\d\d)\b",
     r"."),
    ("tense_open_time_with_past",
     r"\b(?:since|so far|up to now|this (?:year|week|month))\b",
     r"\b(?:have|has)\b"),
    ("conditional_would_in_if", r"\bif\b[^.]*\bwould\b", r"."),
    ("unreal_past_missing", r"\bif\s+\w+\s+(?:is|are|am)\b", r"\bwould\b"),
    ("unless_misused", r"\bunless\b", r"\b(?:if\s+not|negative)\b"),
    ("modal_bare_infinitive",
     r"\b(?:can|could|will|would|should|must|may|might)\s+\w+(?:ed|ing)\b", r"."),
    ("modal_perfect_form",
     r"\b(?:should|would|could|must|might)\s+(?:of|have\s+\w+ing)\b", r"."),
    ("passive_be_missing", r"\b\w+(?:ed|en)\s+by\b", r"\b(?:is|are|was|were|been)\b"),
    ("passive_unnecessary", r"\b(?:is|are|was|were)\s+\w+(?:ed|en)\b", r"\bpassive\b.*\b(?:unnecessar|active|simpler|direct)\w*"),
    ("passive_participle_wrong", r"\b(?:is|are|was|were|been)\s+\w+\b", r"\bpast participle\b"),
    ("comma_splice", r",", r"\bcomma splice\b"),
    ("run_on_fused", r".", r"\brun-?on\b|\bfused\b"),
    ("fragment_no_main_verb", r".", r"\bfragment\b|\bno (?:main )?verb\b"),
    ("double_connector", r"\b(?:although|though|while|whereas)\b[^.]*\bbut\b", r"."),
    ("subordinator_vs_preposition",
     r"\b(?:despite|in spite of)\b[^.]*\b(?:is|are|was|were|the \w+ (?:is|was))\b",
     r"\b(?:although|despite|preposition|clause)\b"),
    ("parallelism_broken", r".", r"\bparallel\w*\b"),
    ("relative_pronoun_wrong", r"\b(?:who|which|that|whose|whom)\b", r"\brelative\b"),
    ("relative_resumptive_pronoun", r"\b(?:which|that|who)\b[^.]*\b(?:it|them|him|her)\b", r"\bresumptive\b|\bextra pronoun\b"),
    ("participle_dangling", r".", r"\bdangl\w+\b"),
    ("reported_backshift_wrong", r"\b(?:said|told|asked)\b", r"\bbackshift\b|\breported\b"),
    ("embedded_question_inversion",
     r"\b(?:what|where|when|why|how|who)\s+(?:is|are|was|were|do|does|did)\b",
     r"\b(?:word order|statement order|indirect question|embedded)\b"),
    ("article_missing_singular", r".", r"\b(?:missing|needs?|add)\b[^.]*\barticle\b|\ba\b/\ban\b"),
    ("article_generic_over_the", r"\bthe\s+\w+s\b", r"\b(?:general|generic|no article|drop the)\b"),
    ("article_specific_missing_the", r".", r"\badd (?:the|'the')\b|\bdefinite article\b"),
    ("countable_uncountable",
     (r"\b(?:informations|advices|researches|equipments|knowledges|furnitures|peoples|"
      r"softwares|homeworks|luggages|traffics|moneys)\b"), r"."),
    ("countable_uncountable", r".", r"\buncountable\b|\bnot countable\b"),
    ("quantifier_wrong_class",
     r"\b(?:much|many|few|little|amount|number)\b", r"\bquantifi\w+\b|\bcountable\b"),
    ("agreement_subject_verb", r".", r"\b(?:subject-?verb|agreement|agrees? with)\b"),
    ("agreement_across_distance", r"\bof\s+\w+\b", r"\bagreement\b.*\b(?:distance|far|of)\b"),
    ("preposition_dependent", r".", r"\bpreposition\b"),
    ("verb_pattern_wrong", r"\b\w+\s+(?:to\s+\w+|\w+ing)\b", r"\b(?:verb pattern|followed by|infinitive|gerund)\b"),
    ("word_form_wrong", r".", r"\bword form\b|\b(?:noun|adjective|adverb) form\b"),
    ("comparative_form", r"\b(?:more|most|er than|est)\b", r"\bcomparative\b|\bsuperlative\b"),
    ("word_order_adverb", r".", r"\bword order\b.*\badverb\b|\badverb\b.*\bposition\b"),
    ("register_spoken_in_writing", r".", r"\b(?:too informal|informal|conversational|spoken)\b"),
    ("linker_overused", r".", r"\b(?:overus\w+|mechanical|too many linkers?)\b"),
    ("hedge_missing_overclaim", r"\b(?:all|every|always|never)\b", r"\b(?:overstat\w+|too strong|hedge|absolute)\b"),
)


def code_for_annotation(quote: str, fix: str = "", explanation: str = "") -> str | None:
    """Best-effort mapping of one free-text correction to a §2.8 code, or ``None``.

    Silence is a valid answer and the common one. Entry route 1 is a bonus path: when it
    yields nothing the curriculum sequence carries the whole load and the module loses its
    diagnosis, not its teaching.
    """
    haystack_quote = f" {(quote or '').lower()} "
    haystack_other = f" {(fix or '').lower()} {(explanation or '').lower()} "
    for code, quote_pattern, other_pattern in _CODE_RULES:
        try:
            if re.search(quote_pattern, haystack_quote) and re.search(
                other_pattern, haystack_other
            ):
                return code
        except re.error:  # pragma: no cover
            continue
    return None


def harvest(
    session: Session,
    profile_id: str,
    *,
    since: str | None = None,
    limit: int = 40,
) -> list[dict[str, Any]]:
    """Error codes from the learner's own Writing and Speaking work (entry route 1).

    **This does not read the scorers' tables itself.** ``srs.bridge.harvest_errors``
    already turns ``writing_evaluations.annotations_json`` and the speaking report's
    ``errors[]`` into :class:`~bandready.srs.bridge.LearnerError` rows — anchored to the
    sentence the learner made the mistake in, deduplicated, and newest-first. A second
    reader of the same two blobs would drift from it the first time either scorer changed
    shape, so grammar consumes that harvest and adds the one thing it owns: the mapping
    from a free-text correction to a §2.8 error code.

    That mapping is guesswork and it is allowed to fail. Entry route 1 is a bonus path;
    when it yields nothing the curriculum sequence carries the whole load and the module
    loses its diagnosis, not its teaching. That is D6 stated honestly: when the scorers
    emit codes at source, this function keeps its signature and drops the guessing.
    """
    from bandready.srs import bridge as srs_bridge

    out: list[dict[str, Any]] = []
    for error in srs_bridge.harvest_errors(session, profile_id, since=since):
        if error.kind == "spelling":
            continue  # a misspelling is not a structure, and not this module's business
        code = code_for_annotation(error.span, error.fix, error.explanation)
        if not code:
            continue
        out.append({
            "code": code,
            "module": error.module,
            "source_id": error.source_id,
            "quote": error.span,
            # The sentence they wrote it in, so F8 can show the mistake in context rather
            # than as a fragment — a span on its own is much harder to recognise as yours.
            "sentence": error.sentence,
            "fix": error.fix,
            "at": error.created_at,
        })

    out.sort(key=lambda e: str(e["at"]), reverse=True)
    return out[:limit]


def route_codes(
    codes: list[dict[str, Any]],
    points: dict[str, Point],
    stages: dict[str, int],
) -> list[dict[str, Any]]:
    """Turn harvested codes into "start here" recommendations (§1.3 route 1).

    The lowest-``sequence_index`` **unlocked** point that fixes the code. When that point
    is locked, the learner is sent to the deepest unmet prerequisite instead, and told
    why — a locked door with no explanation is how a diagnostic path loses people.
    """
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for entry in codes:
        counts[entry["code"]] = counts.get(entry["code"], 0) + 1

    for entry in codes:
        code = str(entry["code"])
        if code in seen:
            continue
        seen.add(code)
        candidates = syllabus.points_fixing(points, code)
        if not candidates:
            continue
        target = next(
            (
                p
                for p in candidates
                if not syllabus.unmet_prerequisites(p, stages, points)
            ),
            candidates[0],
        )
        blocked = syllabus.unmet_prerequisites(target, stages, points)
        start_here = (
            syllabus.deepest_unmet_prerequisite(target.id, stages, points) if blocked else None
        )
        out.append({
            "code": code,
            "family": CODE_FAMILY.get(code),
            "count": counts.get(code, 1),
            "point_id": target.id,
            "point_title": target.title,
            "unlocked": not blocked,
            "start_here": start_here,
            "start_here_title": points[start_here].title if start_here else None,
            "why": (
                f"This comes from {points[start_here].title!r}, which you have not done "
                "yet. Two lessons and you will have it."
                if start_here
                else None
            ),
            "example": entry.get("quote"),
            "module": entry.get("module"),
        })
    out.sort(key=lambda r: (-int(r["count"]), r["point_id"]))
    return out


def wild_failure(
    session: Session,
    card: GrammarCard,
    *,
    code: str,
    module: str,
    source_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """The same error code, back again, in something the learner really wrote or said.

    The most important rule in §1.6. Green cards plus wrong essays is the exact pathology
    of SRS-only apps, and we are in the rare position of being able to see it, because the
    writing and speaking modules already produce structured feedback. **Card state is a
    proxy; the essay is the ground truth, and when they disagree the essay wins.**

    The point hard-drops to Choose, is forced into the next session, and opens on the
    contrast board rather than on a drill — a learner who has just got it wrong for real
    needs the decision restated, not another gap-fill.
    """
    now = now or sched.now_utc()
    stage_before = int(card.stage)
    card.stage = min(stage_before, LEECH_CAP_STAGE)
    card.stage_successes = 0
    card.stage_days_json = "[]"
    card.last_wild_failure_at = sched.iso(now)

    log = bridge.review(
        card,
        1,
        review_type="produce",
        outcome="fail",
        item_id=f"wild:{module}:{source_id}",
        stage_before=stage_before,
        error_codes=[code],
        elapsed_ms=None,
        now=now,
    )
    session.add(log)
    session.flush()
    return {
        "point_id": card.point_id,
        "stage_before": stage_before,
        "stage_after": int(card.stage),
        "code": code,
        "source": {"module": module, "id": source_id},
        "open_on": "contrast_board",
        "note": (
            "This one came back in your own writing, so it goes back a rung no matter "
            "what the card said. The card was a proxy; what you wrote is the evidence."
        ),
    }


def apply_wild_failures(
    session: Session,
    profile_id: str,
    points: dict[str, Point],
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Scan harvested codes for reappearances on points the learner has already built.

    Only fires on a card at stage ≥ 4 (F8) and only on evidence newer than the last wild
    failure recorded for that card, so re-reading the same submission cannot demote a point
    twice.
    """
    now = now or sched.now_utc()
    cards = bridge.cards_by_point(session, profile_id)
    if not cards:
        return []
    events: list[dict[str, Any]] = []
    for entry in harvest(session, profile_id):
        for point in syllabus.points_fixing(points, str(entry["code"])):
            card = cards.get(point.id)
            if card is None or int(card.stage) < 4:
                continue
            if card.last_wild_failure_at and str(entry["at"]) <= card.last_wild_failure_at:
                continue
            events.append(
                wild_failure(
                    session,
                    card,
                    code=str(entry["code"]),
                    module=str(entry["module"]),
                    source_id=str(entry["source_id"]),
                    now=now,
                )
            )
            break
    return events


# --------------------------------------------------------------------------------------
# 8. The session (§1.9)
# --------------------------------------------------------------------------------------


def _recent_register_bias(session: Session, profile_id: str) -> str | None:
    """Speaking lately? Ask for spoken sentences. Writing lately? Written ones (§1.5 r3)."""
    from bandready.db import models as m

    modules = (
        session.execute(
            select(m.PracticeSession.module)
            .where(m.PracticeSession.profile_id == profile_id)
            .order_by(m.PracticeSession.started_at.desc())
            .limit(2)
        )
        .scalars()
        .all()
    )
    if not modules:
        return None
    if all(str(mod) in ("speaking", "listening") for mod in modules):
        return "spoken"
    if all(str(mod) in ("writing", "reading") for mod in modules):
        return "written"
    return None


def _recent_topics(session: Session, profile_id: str, limit: int = 12) -> set[str]:
    """Topics the learner has been working, so grammar lands in familiar content (r4)."""
    from bandready.db import models as m

    rows = (
        session.execute(
            select(m.VocabEntry.topic_tags_json)
            .where(m.VocabEntry.profile_id == profile_id, m.VocabEntry.status == "active")
            .order_by(m.VocabEntry.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    topics: set[str] = set()
    for blob in rows:
        for tag in _json_list(blob):
            topics.add(tag if tag.startswith("topic_") else f"topic_{tag.replace('-', '_')}")
    return topics


def arrange(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Order one session's items so the constraints of §1.9 hold.

    Three rules, all of which exist because violating them makes the practice easier and
    the learning worse:

    * no more than two items in a row from the same point — otherwise a choice item
      degenerates into "the answer is whatever this block is about", and the learner
      passes every item and fails the exam;
    * no more than three of the same kind in a row;
    * a twin never within four items of its pair.
    """
    remaining = list(items)
    out: list[dict[str, Any]] = []
    while remaining:
        placed = False
        for index, candidate in enumerate(remaining):
            point_run = 0
            for previous in reversed(out):
                if previous.get("point_id") == candidate.get("point_id"):
                    point_run += 1
                else:
                    break
            kind_run = 0
            for previous in reversed(out):
                if previous.get("kind") == candidate.get("kind"):
                    kind_run += 1
                else:
                    break
            twin = candidate.get("twin_id")
            twin_too_close = bool(twin) and any(
                previous.get("item_id") == twin for previous in out[-TWIN_MIN_GAP:]
            )
            if (
                point_run < MAX_CONSECUTIVE_SAME_POINT
                and kind_run < MAX_CONSECUTIVE_SAME_TYPE
                and not twin_too_close
            ):
                out.append(remaining.pop(index))
                placed = True
                break
        if not placed:
            # Nothing satisfies every constraint — take the next one rather than loop.
            out.append(remaining.pop(0))
    return out


def seed_production_items(
    gram_items: list[dict[str, Any]],
    lex_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """§1.5 rule 7 — give each production prompt a word out of the due vocabulary queue.

    *"Write a sentence about **deteriorate** using the present perfect."* One answer, two
    cards reviewed. This is the owner's ask made literal — vocabulary practised inside a
    real sentence the learner composes, rather than on a list — and it is nearly free,
    because both queues are already in this function's hands.

    Only items whose author asked for it (``payload.seed_from_vocab_queue``) are seeded: a
    prompt whose content is already fixed by the task would be made incoherent by a word
    bolted onto it. Each word is used once per session, and when the vocabulary queue is
    empty or switched off the prompt stands on its own — the seed is an enrichment, never
    a dependency.

    Returns the seeded entries, so the caller can say which words the session expects to
    come back on a production answer.
    """
    available = [
        lex
        for lex in lex_items
        if lex.get("entry_id") and lex.get("headword")
    ]
    if not available:
        return []

    used: list[dict[str, Any]] = []
    index = 0
    for entry in gram_items:
        exercise = entry.get("exercise") or {}
        payload = exercise.get("payload") or {}
        if not payload.get("seed_from_vocab_queue"):
            continue
        if index >= len(available):
            break  # one word per prompt: repeating it inside a session is not two contexts
        lex = available[index]
        index += 1
        payload["seed_word"] = {
            "headword": lex["headword"],
            "definition": lex.get("definition"),
            "entry_id": lex["entry_id"],
        }
        exercise["payload"] = payload
        entry["exercise"] = exercise
        entry["seeds_from_vocab"] = True
        # The vocabulary card is rated through the SRS route, not this one: two cards, two
        # schedulers' worth of state, one sentence. The client is told, rather than left to
        # infer it from a headword appearing in a prompt.
        entry["also_reviews"] = {
            "family": "lex",
            "card_id": lex.get("card_id"),
            "entry_id": lex["entry_id"],
            "headword": lex["headword"],
            "review_via": "/api/v1/srs/review",
            "exercise_type": "use_in_sentence",
        }
        used.append(entry["also_reviews"])
    return used


def build_session(
    session: Session,
    profile_id: str,
    *,
    points: dict[str, Point] | None = None,
    lex_items: list[dict[str, Any]] | None = None,
    size: int = 16,
    now: datetime | None = None,
    rng: random.Random | None = None,
    allow_llm: bool = True,
) -> dict[str, Any]:
    """Compose the next session: warm-up, core, new, production. Production is always last.

    ``lex_items`` are rendered vocabulary exercises supplied by the caller — the route owns
    that rendering because it owns the vocabulary serialisation, and the mixing rule lives
    here because it is part of the algorithm. Roughly 60:40 lex:gram by item count.

    Two things this function will not do. It will not end the session on recognition: the
    last thing the learner does is the thing the exam asks for. And it will not let a
    ``confusion_set`` block go by without a sibling in it (§1.9's contrast constraint),
    because a choice item surrounded only by its own kind hands over the answer.
    """
    now = now or sched.now_utc()
    rng = rng or random.Random()
    points = points if points is not None else syllabus.load_points(session)
    lex_items = list(lex_items or [])

    register_bias = _recent_register_bias(session, profile_id)
    topic_bias = _recent_topics(session, profile_id)

    due = bridge.due_pairs(session, profile_id, now)
    gram_target = max(1, int(size / (1 + LEX_PER_GRAM)))
    chosen: list[dict[str, Any]] = []
    session_ids: list[str] = []
    used_cards: dict[str, GrammarCard] = {}

    for card, _row in due:
        if len(chosen) >= gram_target:
            break
        point = points.get(card.point_id)
        if point is None:
            continue
        ctx = SelectionContext(
            seen=_json_list(card.seen_items_json),
            session_item_ids=session_ids,
            register_bias=register_bias,
            topic_bias=topic_bias,
            allow_llm=allow_llm,
            leech_active=leech_capped(session, card, now),
            rng=rng,
        )
        item = select_item(point, card, ctx)
        if item is None:
            continue
        session_ids.append(str(item.get("id")))
        used_cards[card.point_id] = card
        chosen.append(_session_item(card, point, item, now))

    # --- the contrast constraint ------------------------------------------------------
    contrast_notes: list[dict[str, Any]] = []
    all_cards = bridge.cards_by_point(session, profile_id)
    for entry in list(chosen):
        card = used_cards.get(entry["point_id"])
        point = points.get(entry["point_id"])
        if card is None or point is None or int(card.stage) < 3 or not point.confusion_set:
            continue
        siblings = syllabus.siblings(points, point)
        already = any(
            other["point_id"] in {s.id for s in siblings} for other in chosen
        )
        if already:
            continue
        for sibling in siblings:
            sibling_card = all_cards.get(sibling.id)
            if sibling_card is None:
                continue
            ctx = SelectionContext(
                seen=_json_list(sibling_card.seen_items_json),
                session_item_ids=session_ids,
                register_bias=register_bias,
                topic_bias=topic_bias,
                allow_llm=allow_llm,
                leech_active=leech_capped(session, sibling_card, now),
                rng=rng,
            )
            item = select_item(sibling, sibling_card, ctx)
            if item is None:
                continue
            session_ids.append(str(item.get("id")))
            used_cards[sibling.id] = sibling_card
            chosen.append(_session_item(sibling_card, sibling, item, now))
            contrast_notes.append({
                "confusion_set": point.confusion_set,
                "points": [point.id, sibling.id],
                "note": (
                    "Both of these are about the same choice. That is the point — you are "
                    "not being asked to build a form, you are being asked to pick one."
                ),
            })
            break

    ordered = arrange(chosen)

    # §1.5 rule 7. A seeded word is answered *inside* the production sentence, so it comes
    # out of the vocabulary queue — asking for it twice in one session would be two
    # retrievals dressed up as one integration.
    seeds = seed_production_items(ordered, lex_items)
    seeded_entries = {s["entry_id"] for s in seeds}
    queued_lex = [lex for lex in lex_items if lex.get("entry_id") not in seeded_entries]

    # --- phases -----------------------------------------------------------------------
    warm_up = [i for i in ordered if i["stage"] <= 2][:4]
    warm_ids = {i["item_id"] for i in warm_up}
    production = [i for i in ordered if i["stage"] >= 4]
    production_ids = {i["item_id"] for i in production}
    core_gram = [
        i
        for i in ordered
        if i["item_id"] not in warm_ids and i["item_id"] not in production_ids
    ]

    merged_core = _interleave(core_gram, queued_lex)

    budget = bridge.new_point_budget(session, profile_id, now)
    new_point = None
    if budget["allowed"] > 0:
        stages = {pid: int(c.stage) for pid, c in all_cards.items()}
        candidate = next(
            (
                p
                for p in sorted(points.values(), key=lambda p: p.sequence_index)
                if p.id not in all_cards
                and not syllabus.unmet_prerequisites(p, stages, points)
            ),
            None,
        )
        if candidate is not None:
            new_point = {
                "point_id": candidate.id,
                "title": candidate.title,
                "estimated_minutes": candidate.estimated_minutes,
                "blocked": False,
            }

    phases = [
        {
            "name": "warm_up",
            "label": "Warm-up",
            "note": "Fast, high success. Nothing new here.",
            "items": warm_up,
        },
        {
            "name": "core",
            "label": "Core review",
            "note": "Your due queue, words and structures mixed.",
            "items": merged_core,
        },
        {
            "name": "new",
            "label": "New",
            "note": budget["reason"] or "One new point, taught in a block.",
            "items": [],
            "new_point": new_point,
        },
        {
            # Never end a session on recognition: the last thing the learner does should be
            # the thing the exam asks for (§1.4).
            "name": "production",
            "label": "Production",
            "note": "Your own sentence. This is what everything above is for.",
            "items": production,
        },
    ]
    return {
        "phases": phases,
        "items": [item for phase in phases for item in phase["items"]],
        "counts": bridge.counts(session, profile_id, now),
        "new_budget": budget,
        "contrast_notes": contrast_notes,
        # The words the production phase expects back, each inside a sentence the learner
        # writes rather than on a card of its own (§1.5 rule 7).
        "vocab_seeds": seeds,
        "register_bias": register_bias,
        "generated_at": sched.iso(now),
    }


def _interleave(gram: list[dict[str, Any]], lex: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mix the two queues without ever stacking more than three of one family."""
    out: list[dict[str, Any]] = []
    gi = li = 0
    run_family: str | None = None
    run = 0
    while gi < len(gram) or li < len(lex):
        prefer_lex = (li / max(1, len(lex) or 1)) <= (gi / max(1, len(gram) or 1))
        take_lex = li < len(lex) and (prefer_lex or gi >= len(gram))
        if run >= MAX_CONSECUTIVE_SAME_TYPE:
            take_lex = run_family == "gram" and li < len(lex)
            if not take_lex and gi >= len(gram):
                take_lex = li < len(lex)
        if take_lex:
            out.append(lex[li])
            li += 1
            family = "lex"
        elif gi < len(gram):
            out.append(gram[gi])
            gi += 1
            family = "gram"
        elif li < len(lex):
            out.append(lex[li])
            li += 1
            family = "lex"
        else:
            break
        run = run + 1 if family == run_family else 1
        run_family = family
    return out


def items_for_point(
    session: Session,
    card: GrammarCard,
    point: Point,
    *,
    count: int,
    now: datetime,
    rng: random.Random,
    allow_llm: bool = True,
    already_shown: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Up to ``count`` items from one point's bank, walking the card's own rung.

    The lesson-shaped session: same selector as the daily queue (§1.5's seven rules, the
    twin gap, the leech cap), just scoped to one point instead of to what is due. It stops
    early rather than repeating an item — a bank that has run out asks a lower rung's
    question, and when even that is exhausted the sitting is simply shorter.
    """
    shown = list(already_shown or [])
    out: list[dict[str, Any]] = []
    for _ in range(max(0, count)):
        ctx = SelectionContext(
            seen=_json_list(card.seen_items_json),
            session_item_ids=shown,
            allow_llm=allow_llm,
            leech_active=leech_capped(session, card, now),
            rng=rng,
        )
        item = select_item(point, card, ctx)
        if item is None or str(item.get("id")) in shown:
            break
        shown.append(str(item.get("id")))
        out.append(_session_item(card, point, item, now))
    return out


def _session_item(
    card: GrammarCard, point: Point, item: dict[str, Any], now: datetime
) -> dict[str, Any]:
    stage = int(item.get("stage") or 0)
    return {
        "family": "gram",
        "card_id": card.id,
        "point_id": point.id,
        "point_title": point.title,
        "grammar_name": point.grammar_name,
        "item_id": str(item.get("id")),
        "kind": str(item.get("kind")),
        "stage": stage,
        "stage_name": STAGE_NAMES.get(stage, ""),
        "card_stage": int(card.stage),
        "card_stage_name": STAGE_NAMES.get(int(card.stage), ""),
        "twin_id": item.get("twin_id"),
        "confusion_set": item.get("confusion_set"),
        "register": item.get("register"),
        "topic_id": item.get("topic_id"),
        "skill_hook": item.get("skill_hook"),
        # Whether a word was actually attached, not whether the author asked for one:
        # :func:`seed_production_items` sets this once the vocabulary queue has supplied it.
        "seeds_from_vocab": False,
        "reteach_first": bool(card.last_wild_failure_at) and int(card.stage) <= 3,
        "exercise": public_item(item),
    }


# --------------------------------------------------------------------------------------
# 9. Wire shapes — what the learner may see before answering, and after
# --------------------------------------------------------------------------------------

#: Fields that are the answer, or that give it away. Stripped on the way out, exactly as
#: the four skills gate their answers behind a real attempt.
_SECRET_KEYS = (
    "key", "reason_key", "accepted_orders", "scored_tokens", "acceptable", "follow_up",
)


def public_item(item: dict[str, Any]) -> dict[str, Any]:
    """The item as the learner first sees it — no key, no cue, no feedback.

    ``decision_cue`` in particular is withheld: it is the exact span of the context that
    decides the answer, and showing it up front turns a choice item into a reading
    comprehension question with the answer underlined.
    """
    payload = {k: v for k, v in (item.get("payload") or {}).items() if k not in _SECRET_KEYS}
    options = payload.get("options")
    if isinstance(options, list):
        payload["options"] = [
            (
                {"text": option.get("text")}
                if isinstance(option, dict)
                else {"text": option}
            )
            for option in options
        ]
    if item.get("kind") == "gap_fill":
        expected = item.get("expected") or []
        first = str(expected[0]) if expected else ""
        payload["hint_first_letter"] = first[:1] or None
        payload["hint_after_seconds"] = 10
    return {
        "item_id": str(item.get("id")),
        "kind": str(item.get("kind")),
        "stage": int(item.get("stage") or 0),
        "prompt": _prompt_for(item),
        "payload": payload,
    }


def _prompt_for(item: dict[str, Any]) -> str:
    kind = str(item.get("kind"))
    payload = item.get("payload") or {}
    return {
        "interpret": payload.get("question") or "What does this sentence tell you?",
        "gap_fill": "Fill the gap.",
        "order": "Put these in order.",
        "transform": payload.get("instruction") or "Rewrite the sentence.",
        "choose_form": "Which one does this situation want?",
        "contrast_pair": "Match each sentence to what it means.",
        "judge": "Is this sentence acceptable?",
        "both_ok": "Which one is right here?",
        "error_fix": "One thing here is wrong. Find it and fix it.",
        "dictation": "Listen, then type what you hear.",
        "combine": "Join these into one sentence.",
        "produce": payload.get("prompt_text") or "Write one sentence.",
        "speaking_drill": "Use it in the conversation.",
        "discover": "What is different about these?",
    }.get(kind, "Answer.")


def reveal(item: dict[str, Any], point: Point, grade: dict[str, Any]) -> dict[str, Any]:
    """What the learner sees *after* answering, and only then.

    The feedback names the meaning, never the verdict. "Incorrect — the answer is *have
    worked*" teaches nothing; "you chose *worked*; that says the six years are over"
    is a sentence a learner can act on tomorrow. Feedback at the "self" level ("great
    job!") is banned by name (§2.7).
    """
    payload = item.get("payload") or {}
    feedback = item.get("feedback") or {}
    options = payload.get("options")
    meanings = None
    if isinstance(options, list):
        meanings = [
            {
                "text": option.get("text") if isinstance(option, dict) else option,
                "why_this_means": (
                    option.get("why_this_means") if isinstance(option, dict) else None
                ),
            }
            for option in options
        ]
    return {
        "correct": grade.get("correct"),
        "close": grade.get("close"),
        "detail": grade.get("detail"),
        "expected": grade.get("expected"),
        "why_key": feedback.get("why_key"),
        "feed_forward": feedback.get("feed_forward"),
        "decision_cue": item.get("decision_cue"),
        "options": meanings,
        "follow_up": payload.get("follow_up"),
        "contrast_question": point.contrast.get("question"),
        "board_id": point.board_id,
        "rule_line": point.teach.get("rule_line"),
    }


# --------------------------------------------------------------------------------------
# 10. Progress (F4)
# --------------------------------------------------------------------------------------


def progress(
    session: Session,
    profile_id: str,
    *,
    points: dict[str, Point] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """What is costing marks, what has gone quiet, and where every point stands.

    The headline is deliberately not "Grammar 68%". It is the three codes costing the
    learner most, each of which is a button that assembles a drill of items carrying that
    code **across all points** — because the learner's problem is rarely confined to one
    unit. And the primary motivational number is the inverse: the codes that have gone
    quiet, which is a true statement about their competence and worth more to an adult
    with an exam date than a streak counter.
    """
    now = now or sched.now_utc()
    points = points if points is not None else syllabus.load_points(session)
    cards = bridge.cards_by_point(session, profile_id)

    logs = (
        session.execute(
            select(GrammarReviewLog)
            .join(GrammarCard, GrammarCard.id == GrammarReviewLog.card_id)
            .where(GrammarCard.profile_id == profile_id)
            .order_by(GrammarReviewLog.reviewed_at)
        )
        .scalars()
        .all()
    )

    two_weeks_ago = sched.iso(now - timedelta(days=14))
    totals: dict[str, int] = {}
    recent: dict[str, int] = {}
    earliest: dict[str, str] = {}
    for row in logs:
        for code in _json_list(row.error_codes_json):
            totals[code] = totals.get(code, 0) + 1
            earliest.setdefault(code, row.reviewed_at)
            if row.reviewed_at >= two_weeks_ago:
                recent[code] = recent.get(code, 0) + 1

    costing = sorted(
        (
            {
                "code": code,
                "family": CODE_FAMILY.get(code),
                "count": count,
                "recent": recent.get(code, 0),
            }
            for code, count in totals.items()
            if recent.get(code, 0) > 0
        ),
        key=lambda r: (-int(r["recent"]), -int(r["count"])),
    )[:3]

    gone_quiet = [
        {
            "code": code,
            "family": CODE_FAMILY.get(code),
            "was": count,
            "since": earliest.get(code),
            "line": (
                f"{code} — {count} in your first sessions, none in the last two weeks."
            ),
        }
        for code, count in sorted(totals.items(), key=lambda kv: -kv[1])
        if recent.get(code, 0) == 0 and count >= 2
    ][:5]

    mastered: list[dict[str, Any]] = []
    stalled: list[dict[str, Any]] = []
    for point_id, card in cards.items():
        point = points.get(point_id)
        if point is None:
            continue
        report = mastery_report(session, card, point, points)
        if report["mastered"]:
            mastered.append({"point_id": point_id, "can_do": report["can_do"]})
        elif int(card.leech or 0):
            stalled.append({
                "point_id": point_id,
                "title": point.title,
                "stage": int(card.stage),
                "note": "This one keeps slipping. It is capped at Choose until it settles.",
            })

    return {
        "headline": (
            f"{len(costing)} codes are costing you." if costing else "Nothing is repeating yet."
        ),
        "costing_you": costing,
        "gone_quiet": gone_quiet,
        "mastered": mastered,
        "keeps_slipping": stalled,
        "counts": bridge.counts(session, profile_id, now),
        "points_started": len(cards),
        "points_total": len(points),
        "honesty_note": (
            "Some points — third-person -s, articles, past endings — keep producing "
            "errors for months after they are learned. That is normal and it is not "
            "failure: instruction improves accuracy, it does not change the order in "
            "which features become reliable."
        ),
        "generated_at": sched.iso(now),
    }
