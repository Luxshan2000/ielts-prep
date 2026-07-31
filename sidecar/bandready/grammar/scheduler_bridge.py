"""The FSRS boundary. Read this file before changing anything about scheduling.

Grammar `DESIGN.md` §1.1 states the boundary once, and this module is where it is
enforced. Stated as code ownership:

======================================  ==================  ==========================
Question                                Answered by         Written by
======================================  ==================  ==========================
**When** does this card come back?      FSRS                this module, via
                                                            ``srs.scheduler.review``
**What kind** of question is asked?     the Ladder          ``grammar.practice``
**Which sentence** is it asked in?      the Ladder          ``grammar.practice``
**What counts as a pass?**              the Ladder          ``grammar.practice``
**Is it ready to be scheduled at all?** the Ladder's gate   ``grammar.practice``
**Is it mastered?**                     the Ladder          ``grammar.practice``
**How many new points today?**          the Ladder's budget this module (§1.3 formula)
======================================  ==================  ==========================

So: **this module never writes ``stage``**, and ``practice`` never writes ``due_at``,
``stability``, ``difficulty``, ``state``, ``reps`` or ``lapses``. If you find yourself
about to break that in either direction, the thing you actually want is a new function on
the other side of the line.

The FSRS maths is not reimplemented, forked or wrapped. ``grammar_cards`` carries the same
nine mirrored columns as ``srs_cards``, so ``scheduler.review``, ``card_from_row``,
``retrievability``, ``preview_intervals``, ``card_public``, ``_maturity`` and
``format_interval`` all accept a grammar row unchanged (§0.3), and the constants come from
there too — introducing a third set of thresholds is how two schedulers start disagreeing.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.grammar.tables import GrammarCard, GrammarPoint, GrammarReviewLog
from bandready.srs import scheduler as sched

_log = logging.getLogger("bandready.grammar.scheduler")

__all__ = [
    "BACKLOG_STOP_RATIO",
    "MATURE_STABILITY_DAYS",
    "NEW_GRAMMAR_PER_DAY",
    "YOUNG_STABILITY_DAYS",
    "card_public",
    "cards_for_profile",
    "counts",
    "create_card",
    "due_pairs",
    "new_point_budget",
    "preview_intervals",
    "review",
    "reviews_today",
]

# Imported, never redefined (§0.3).
YOUNG_STABILITY_DAYS = sched.YOUNG_STABILITY_DAYS
MATURE_STABILITY_DAYS = sched.MATURE_STABILITY_DAYS
MAX_CONSECUTIVE_NEW = sched.MAX_CONSECUTIVE_NEW
SESSION_CHUNK = sched.SESSION_CHUNK

#: One new point a day is not stingy: a point expands to 10–16 items and 12–30 minutes.
#: The cap exists because the failure mode of every grammar course is a learner who has met
#: forty structures and controls none of them (§1.3).
NEW_GRAMMAR_PER_DAY = 1

#: No new anything once the due backlog is more than twice what the learner can clear
#: today. A learner drowning in reviews must never be handed more (§0.5 override 11).
BACKLOG_STOP_RATIO = 2.0


# --------------------------------------------------------------------------------------
# Row lifecycle
# --------------------------------------------------------------------------------------


def create_card(profile_id: str, point_id: str, now: datetime | None = None) -> GrammarCard:
    """A brand-new grammar card, due immediately.

    Called by the Ladder's entry gate and **nowhere else** — a card exists only after the
    learner has met the point and passed one retrieval (§1.3). That is what closes FSRS's
    blind spot: it will happily schedule something the learner never understood, forever.

    The initial FSRS state is taken from ``scheduler.create_card`` rather than
    reconstructed here, so there is exactly one place in the codebase that knows what a
    fresh ``fsrs.Card`` looks like. The throwaway ``SrsCard`` it returns is never added to
    a session.
    """
    now = now or sched.now_utc()
    seed = sched.create_card(entry_id=point_id, now=now)
    return GrammarCard(
        id=f"gc_{ULID()}",
        profile_id=profile_id,
        point_id=point_id,
        stage=0,
        stage_successes=0,
        stage_days_json="[]",
        seen_items_json="[]",
        last_wild_failure_at=None,
        leech=0,
        state=seed.state,
        step=seed.step,
        stability=seed.stability,
        difficulty=seed.difficulty,
        due_at=seed.due_at,
        last_review_at=None,
        reps=0,
        lapses=0,
        fsrs_json=seed.fsrs_json,
    )


def review(
    card: GrammarCard,
    rating: int,
    *,
    review_type: str,
    outcome: str,
    item_id: str | None,
    stage_before: int,
    error_codes: list[str] | None = None,
    elapsed_ms: int | None = None,
    now: datetime | None = None,
) -> GrammarReviewLog:
    """Run the FSRS half of one review and return the log row (unadded).

    The rating is computed by the Ladder (§1.8) and handed here as fact; FSRS takes a
    rating and takes it as truth. This function mutates the nine FSRS columns and
    ``nothing else`` — the caller updates ``stage`` and friends in the same transaction.
    Two writes, one transaction, one scheduler.

    ``stage_before`` is a **required argument rather than a read of ``card.stage``**. By
    the time this runs the Ladder has already moved the rung, so reading it here would
    record the rung the learner is going to, not the rung the question was asked at — and
    the whole of :func:`practice._logs_at_current_stage` and the one-advance-per-session
    guard read that column to segment history.
    """
    now = now or sched.now_utc()
    state_before = int(card.state)
    stability_before = card.stability
    difficulty_before = card.difficulty

    # `scheduler.review` duck-types on the mirrored columns, so a grammar row is a valid
    # argument. It also builds an `SrsReviewLog` we do not want; we discard it, and we
    # hand it a vocabulary-legal `exercise_type` so that even if some future refactor
    # added it to a session it could not violate the CheckConstraint on that table.
    sched.review(card, rating, now, exercise_type="flip", elapsed_ms=elapsed_ms)

    return GrammarReviewLog(
        id=f"grl_{ULID()}",
        card_id=card.id,
        item_id=item_id,
        rating=int(rating),
        review_type=review_type,
        outcome=outcome,
        stage_before=int(stage_before),
        error_codes_json=json.dumps(list(error_codes or []), ensure_ascii=False),
        reviewed_at=sched.iso(now),
        elapsed_ms=int(elapsed_ms) if elapsed_ms is not None else None,
        state_before=state_before,
        stability_before=stability_before,
        difficulty_before=difficulty_before,
    )


def preview_intervals(card: GrammarCard, now: datetime | None = None) -> dict[str, Any]:
    """What each rating would schedule — delegated, never recomputed."""
    return sched.preview_intervals(card, now)


def card_public(card: GrammarCard, now: datetime | None = None) -> dict[str, Any]:
    """The FSRS half of the card, in the same wire shape the vocabulary cards use."""
    return sched.card_public(card, now)


# --------------------------------------------------------------------------------------
# Queue
# --------------------------------------------------------------------------------------

CardPair = tuple[GrammarCard, GrammarPoint]


def cards_for_profile(session: Session, profile_id: str) -> list[CardPair]:
    """Every grammar card with its (non-retired) point."""
    stmt = (
        select(GrammarCard, GrammarPoint)
        .join(GrammarPoint, GrammarPoint.id == GrammarCard.point_id)
        .where(GrammarCard.profile_id == profile_id, GrammarPoint.retired == 0)
    )
    return [(card, point) for card, point in session.execute(stmt).all()]


def cards_by_point(session: Session, profile_id: str) -> dict[str, GrammarCard]:
    rows = (
        session.execute(select(GrammarCard).where(GrammarCard.profile_id == profile_id))
        .scalars()
        .all()
    )
    return {row.point_id: row for row in rows}


def reviews_today(
    session: Session, profile_id: str, now: datetime | None = None
) -> dict[str, int]:
    """Grammar reviews since the 4 AM rollover, split new / repeat.

    Mirrors ``scheduler.reviews_today`` exactly, against the grammar tables. It is a new
    function alongside the vocabulary one and never an edit to it (§0.3) — every query in
    ``scheduler`` joins ``VocabEntry`` explicitly and cannot be widened.
    """
    since = sched.iso(sched.day_start(now))
    rows = session.execute(
        select(GrammarReviewLog.state_before, func.count())
        .join(GrammarCard, GrammarCard.id == GrammarReviewLog.card_id)
        .where(GrammarCard.profile_id == profile_id, GrammarReviewLog.reviewed_at >= since)
        .group_by(GrammarReviewLog.state_before)
    ).all()
    new_introduced = 0
    reviews = 0
    for state_before, count in rows:
        if int(state_before) == sched.STATE_NEW:
            new_introduced += int(count)
        else:
            reviews += int(count)
    return {
        "total": new_introduced + reviews,
        "new_introduced": new_introduced,
        "reviews": reviews,
    }


def due_pairs(
    session: Session,
    profile_id: str,
    now: datetime | None = None,
) -> list[CardPair]:
    """Grammar cards due now, in ``scheduler``'s order: relearning → learning → review.

    Review-state cards are ordered most-forgotten-first (ascending retrievability), the
    same backlog rule the vocabulary queue uses — a learner returning after a break should
    meet the things they are closest to losing, first.
    """
    now = now or sched.now_utc()
    now_iso = sched.iso(now)
    retention, _new_per_day, _cap = sched.study_limits()
    scheduler = sched.get_scheduler(retention)

    relearning: list[CardPair] = []
    learning: list[CardPair] = []
    review_due: list[CardPair] = []
    for card, point in cards_for_profile(session, profile_id):
        state = int(card.state)
        if state == sched.STATE_NEW:
            # A new-state card is one the gate has just created: due immediately.
            review_due.append((card, point))
            continue
        if card.due_at > now_iso:
            continue
        if state == sched.STATE_RELEARNING:
            relearning.append((card, point))
        elif state == sched.STATE_LEARNING:
            learning.append((card, point))
        else:
            review_due.append((card, point))

    relearning.sort(key=lambda p: p[0].due_at)
    learning.sort(key=lambda p: p[0].due_at)
    review_due.sort(
        key=lambda p: (
            0 if p[0].last_wild_failure_at else 1,  # a wild failure jumps the queue (§1.6)
            sched.retrievability(sched.card_from_row(p[0]), now, scheduler),
            p[0].due_at,
        )
    )
    return relearning + learning + review_due


def new_point_budget(
    session: Session,
    profile_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """How many new grammar points may be introduced today, and why (§1.3).

    ::

        new_gram_today = 1 if backlog_ratio <= 2.0
                           and no owned point is at stage <= 2 with a lapse
                              in its last 3 reviews
                         else 0

    The second clause is the one that matters: a half-learned point must not be buried
    under a new one.
    """
    now = now or sched.now_utc()
    done = reviews_today(session, profile_id, now)
    _retention, _new_per_day, review_cap = sched.study_limits()
    due_now = len(due_pairs(session, profile_id, now))
    backlog_ratio = due_now / max(1, review_cap or sched.DEFAULT_REVIEW_CAP)

    shaky: str | None = None
    for card, _point in cards_for_profile(session, profile_id):
        if int(card.stage) > 2:
            continue
        recent = (
            session.execute(
                select(GrammarReviewLog.rating)
                .where(GrammarReviewLog.card_id == card.id)
                .order_by(GrammarReviewLog.reviewed_at.desc())
                .limit(3)
            )
            .scalars()
            .all()
        )
        if any(int(r) == 1 for r in recent):
            shaky = card.point_id
            break

    if backlog_ratio > BACKLOG_STOP_RATIO:
        allowed, reason = 0, (
            "There is a backlog to clear first. New material starts again when it is down."
        )
    elif shaky is not None:
        allowed, reason = 0, (
            "One point you are already on keeps slipping. That one gets today, not a new one."
        )
    elif done["new_introduced"] >= NEW_GRAMMAR_PER_DAY:
        allowed, reason = 0, "You have already started a new point today."
    else:
        allowed, reason = NEW_GRAMMAR_PER_DAY - done["new_introduced"], None

    return {
        "allowed": max(0, allowed),
        "reason": reason,
        "backlog_ratio": round(backlog_ratio, 3),
        "due_now": due_now,
        "blocked_by_point": shaky,
    }


def counts(session: Session, profile_id: str, now: datetime | None = None) -> dict[str, int]:
    """Queue-shaped counters for the dashboard, mirroring ``scheduler.counts``."""
    now = now or sched.now_utc()
    now_iso = sched.iso(now)
    tallies = {
        "new": 0,
        "learning": 0,
        "relearning": 0,
        "young": 0,
        "mature": 0,
        "due_now": 0,
        "scheduled": 0,
        "leech": 0,
    }
    by_stage: dict[int, int] = {stage: 0 for stage in range(6)}
    for card, _point in cards_for_profile(session, profile_id):
        tallies["scheduled"] += 1
        by_stage[int(card.stage)] = by_stage.get(int(card.stage), 0) + 1
        if int(card.leech):
            tallies["leech"] += 1
        state = int(card.state)
        # One shared maturity rule, not two: `new` / `learning` / `young` / `mature` must
        # mean the same thing on a grammar card as on a vocabulary card.
        maturity = sched._maturity(card)
        if maturity in tallies:
            tallies[maturity] += 1
        if state == sched.STATE_RELEARNING:
            tallies["relearning"] += 1
        if state == sched.STATE_LEARNING:
            tallies["learning"] += 1
        if card.due_at <= now_iso:
            tallies["due_now"] += 1
    done = reviews_today(session, profile_id, now)
    return {
        **tallies,
        **{f"stage_{stage}": count for stage, count in by_stage.items()},
        "reviews_done_today": done["total"],
    }
