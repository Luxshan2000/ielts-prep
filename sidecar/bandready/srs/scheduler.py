"""FSRS scheduling for the vocabulary bank (08-vocabulary-srs.md §4, §7, §8).

All scheduling maths comes from the MIT-licensed ``fsrs`` package (open-spaced-repetition
/py-fsrs); we write none of it ourselves. This module owns three things:

1. **Mapping** between the library's ``Card`` object and our ``srs_cards`` row — the
   verbatim ``Card.to_dict()`` lives in ``fsrs_json`` for forward compatibility, and
   ``state/step/stability/difficulty/due_at/last_review_at/reps/lapses`` are mirrored into
   real columns so the hot due-queue query never parses JSON (11 §6).
2. **The daily queue** (§7): new-per-day and review-cap gating against the 4 AM local
   rollover, retrievability-first backlog ordering, relearning → learning → review → new
   with new cards interleaved no more than 3 deep.
3. **Stats** (§8): true 30-day retention, streak, maturity counts, forecast, sources.

The `fsrs` public API has changed shape across major versions (strings vs `timedelta`
learning steps, `New` state present or absent, keyword names on `review_card`). Every call
into it here is introspected/guarded so a version bump degrades rather than crashes.
"""

from __future__ import annotations

import inspect
import json
import logging
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m

_log = logging.getLogger("bandready.srs")

__all__ = [
    "DAY_ROLLOVER_HOUR",
    "DEFAULT_MAXIMUM_INTERVAL",
    "DEFAULT_NEW_PER_DAY",
    "DEFAULT_RETENTION",
    "DEFAULT_REVIEW_CAP",
    "MATURE_STABILITY_DAYS",
    "RATINGS",
    "counts",
    "create_card",
    "day_start",
    "due_queue",
    "format_interval",
    "get_scheduler",
    "iso",
    "now_utc",
    "parse_iso",
    "preview_intervals",
    "retrievability",
    "review",
    "stats",
]

# --------------------------------------------------------------------------------------
# Defaults (08 §4.1, §7)
# --------------------------------------------------------------------------------------

DEFAULT_RETENTION = 0.9
DEFAULT_MAXIMUM_INTERVAL = 365  # days — py-fsrs' 36500 is meaningless for exam prep
LEARNING_STEPS = (timedelta(minutes=1), timedelta(minutes=10))
RELEARNING_STEPS = (timedelta(minutes=10),)
DEFAULT_NEW_PER_DAY = 10
DEFAULT_REVIEW_CAP = 120
SESSION_CHUNK = 20
MAX_CONSECUTIVE_NEW = 3
MATURE_STABILITY_DAYS = 21.0
YOUNG_STABILITY_DAYS = 7.0  # §5.2 exercise-eligibility boundary
DAY_ROLLOVER_HOUR = 4  # local time, Anki convention

RATINGS: dict[int, str] = {1: "again", 2: "hard", 3: "good", 4: "easy"}

#: Mirrored ``state`` column values. py-fsrs >= 5 has no ``New`` member — a card that has
#: never been rated is written as 0 by us and is what §8's "new" count means.
STATE_NEW = 0
STATE_LEARNING = 1
STATE_REVIEW = 2
STATE_RELEARNING = 3


# --------------------------------------------------------------------------------------
# Time helpers
# --------------------------------------------------------------------------------------


def now_utc() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    """UTC ISO-8601 with a ``Z`` suffix and millisecond precision (18 §1).

    Every timestamp this module writes uses this exact format, which makes the string
    comparisons in the due-queue SQL correct lexicographically.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def day_start(now: datetime | None = None) -> datetime:
    """Start of the current study day in UTC — local 4:00 AM rollover (§7)."""
    now = now or now_utc()
    local = now.astimezone()
    boundary = local.replace(hour=DAY_ROLLOVER_HOUR, minute=0, second=0, microsecond=0)
    if local < boundary:
        boundary -= timedelta(days=1)
    return boundary.astimezone(UTC)


def study_day_key(moment: datetime) -> str:
    """``YYYY-MM-DD`` of the study day a moment belongs to (4 AM local rollover)."""
    local = moment.astimezone() - timedelta(hours=DAY_ROLLOVER_HOUR)
    return local.date().isoformat()


def format_interval(delta: timedelta) -> str:
    """``10m`` / ``2d`` / ``1.5mo`` — what the rating buttons show (§4.3)."""
    seconds = max(0.0, delta.total_seconds())
    if seconds < 60:
        return f"{int(seconds)}s"
    minutes = seconds / 60
    if minutes < 60:
        return f"{round(minutes)}m"
    hours = minutes / 60
    if hours < 24:
        return f"{round(hours)}h"
    days = hours / 24
    if days < 30:
        return f"{round(days)}d" if days >= 1 else "1d"
    months = days / 30.44
    if months < 12:
        return f"{months:.1f}mo".replace(".0mo", "mo")
    return f"{days / 365.25:.1f}y".replace(".0y", "y")


# --------------------------------------------------------------------------------------
# fsrs adapter — every call is introspected so a library bump degrades, never crashes
# --------------------------------------------------------------------------------------

_scheduler_cache: dict[tuple[float, int], Any] = {}


def _fsrs() -> Any:
    import fsrs

    return fsrs


def _build_scheduler(desired_retention: float, maximum_interval: int) -> Any:
    fsrs = _fsrs()
    params = inspect.signature(fsrs.Scheduler.__init__).parameters
    wanted: dict[str, Any] = {}
    if "desired_retention" in params:
        wanted["desired_retention"] = desired_retention
    if "maximum_interval" in params:
        wanted["maximum_interval"] = maximum_interval
    if "enable_fuzzing" in params:
        wanted["enable_fuzzing"] = True
    steps_variants: list[dict[str, Any]] = []
    if "learning_steps" in params and "relearning_steps" in params:
        steps_variants.append(
            {"learning_steps": LEARNING_STEPS, "relearning_steps": RELEARNING_STEPS}
        )
        steps_variants.append(
            {"learning_steps": ("1m", "10m"), "relearning_steps": ("10m",)}
        )
    steps_variants.append({})

    last_error: Exception | None = None
    for steps in steps_variants:
        try:
            return fsrs.Scheduler(**wanted, **steps)
        except Exception as exc:  # noqa: BLE001 — signature drift across fsrs majors
            last_error = exc
    _log.warning("fsrs.Scheduler rejected our defaults (%s); using library defaults", last_error)
    return fsrs.Scheduler()


def get_scheduler(
    desired_retention: float | None = None, maximum_interval: int | None = None
) -> Any:
    """Process-cached ``fsrs.Scheduler`` (stateless per call, so sharing is safe)."""
    retention = float(desired_retention if desired_retention is not None else DEFAULT_RETENTION)
    retention = min(0.95, max(0.80, retention))
    interval = int(maximum_interval or DEFAULT_MAXIMUM_INTERVAL)
    key = (round(retention, 3), interval)
    scheduler = _scheduler_cache.get(key)
    if scheduler is None:
        scheduler = _build_scheduler(retention, interval)
        _scheduler_cache[key] = scheduler
    return scheduler


def scheduler_from_settings() -> Any:
    """Scheduler built from the learner's study settings (falls back to defaults)."""
    retention, _new_per_day, _cap = study_limits()
    return get_scheduler(retention)


def study_limits() -> tuple[float, int, int]:
    """``(desired_retention, new_per_day, review_cap)`` from the settings document."""
    try:
        from bandready.settings_store import load_settings

        study = load_settings().get("study") or {}
    except Exception:  # noqa: BLE001 — settings are optional for pure scheduling
        study = {}
    retention = float(study.get("srs_desired_retention", DEFAULT_RETENTION) or DEFAULT_RETENTION)
    new_per_day = int(study.get("srs_new_per_day", DEFAULT_NEW_PER_DAY) or 0)
    cap = int(study.get("srs_max_reviews_per_day", DEFAULT_REVIEW_CAP) or 0)
    return retention, max(0, new_per_day), max(0, cap)


def _new_fsrs_card(due: datetime) -> Any:
    """A fresh library card due at ``due``, whatever the constructor looks like."""
    fsrs = _fsrs()
    params = inspect.signature(fsrs.Card.__init__).parameters
    if "due" in params:
        try:
            return fsrs.Card(due=due)
        except Exception as exc:  # noqa: BLE001 — constructor drift across fsrs majors
            _log.debug("fsrs.Card(due=...) rejected (%s); using the default constructor", exc)
    return fsrs.Card()


def card_from_row(row: m.SrsCard) -> Any:
    """Rehydrate the library card, rebuilding it from the mirrored columns if needed."""
    fsrs = _fsrs()
    try:
        data = json.loads(row.fsrs_json)
        if isinstance(data, dict):
            return fsrs.Card.from_dict(data)
    except Exception as exc:  # noqa: BLE001 — corrupt blob must not lose the card
        _log.warning("srs card %s has an unreadable fsrs_json (%s); rebuilding", row.id, exc)
    due = parse_iso(row.due_at) or now_utc()
    return _new_fsrs_card(due)


def _state_value(card: Any) -> int:
    state = getattr(card, "state", STATE_LEARNING)
    return int(getattr(state, "value", state))


def _card_due(card: Any) -> datetime:
    due = getattr(card, "due", None)
    if isinstance(due, datetime):
        return due if due.tzinfo else due.replace(tzinfo=UTC)
    return now_utc()


def _review_card(scheduler: Any, card: Any, rating: int, moment: datetime) -> tuple[Any, Any]:
    fsrs = _fsrs()
    rating_obj = fsrs.Rating(int(rating))
    try:
        return scheduler.review_card(card, rating_obj, review_datetime=moment)
    except TypeError:
        return scheduler.review_card(card, rating_obj, moment)


def retrievability(card: Any, moment: datetime | None = None, scheduler: Any = None) -> float:
    """Recall probability right now — the backlog ordering key (§7)."""
    scheduler = scheduler or get_scheduler()
    moment = moment or now_utc()
    getter = getattr(scheduler, "get_card_retrievability", None)
    if getter is not None:
        for kwargs in ({"current_datetime": moment}, {}):
            try:
                return float(getter(card, **kwargs))
            except TypeError:
                continue
            except Exception:  # noqa: BLE001
                break
    getter = getattr(card, "get_retrievability", None)
    if getter is not None:
        try:
            return float(getter(moment))
        except Exception as exc:  # noqa: BLE001 — treat an unknown API as "fully recalled"
            _log.debug("card retrievability unavailable (%s)", exc)
    return 1.0


# --------------------------------------------------------------------------------------
# Row lifecycle
# --------------------------------------------------------------------------------------


def create_card(entry_id: str, now: datetime | None = None) -> m.SrsCard:
    """A brand-new scheduled card, due immediately (§3.2 accept / manual add).

    The caller adds it to the session — this keeps the function usable in tests without a
    database.
    """
    now = now or now_utc()
    card = _new_fsrs_card(now)
    return m.SrsCard(
        id=f"sc_{ULID()}",
        entry_id=entry_id,
        state=STATE_NEW,
        step=int(getattr(card, "step", 0) or 0),
        stability=getattr(card, "stability", None),
        difficulty=getattr(card, "difficulty", None),
        due_at=iso(now),
        last_review_at=None,
        reps=0,
        lapses=0,
        fsrs_json=json.dumps(card.to_dict()),
    )


def review(
    card_row: m.SrsCard,
    rating: int,
    now: datetime | None = None,
    *,
    exercise_type: str = "flip",
    elapsed_ms: int | None = None,
    scheduler: Any = None,
) -> tuple[m.SrsCard, m.SrsReviewLog]:
    """Apply one rating (§4.3). Mutates and returns ``card_row`` plus its new log row.

    The log row is *not* added to the session — the caller owns the transaction.
    """
    rating = int(rating)
    if rating not in RATINGS:
        raise ValueError(f"rating must be 1-4, got {rating!r}")
    now = now or now_utc()
    scheduler = scheduler or scheduler_from_settings()

    state_before = int(card_row.state)
    stability_before = card_row.stability
    difficulty_before = card_row.difficulty

    card = card_from_row(card_row)
    updated, _log_obj = _review_card(scheduler, card, rating, now)

    card_row.fsrs_json = json.dumps(updated.to_dict())
    card_row.state = _state_value(updated)
    step = getattr(updated, "step", None)
    card_row.step = int(step) if step is not None else None
    card_row.stability = (
        float(updated.stability) if getattr(updated, "stability", None) is not None else None
    )
    card_row.difficulty = (
        float(updated.difficulty) if getattr(updated, "difficulty", None) is not None else None
    )
    card_row.due_at = iso(_card_due(updated))
    card_row.last_review_at = iso(now)
    card_row.reps = int(card_row.reps or 0) + 1
    if rating == 1 and state_before == STATE_REVIEW:
        card_row.lapses = int(card_row.lapses or 0) + 1

    log_row = m.SrsReviewLog(
        id=f"rl_{ULID()}",
        card_id=card_row.id,
        rating=rating,
        review_type=exercise_type,
        reviewed_at=iso(now),
        elapsed_ms=int(elapsed_ms) if elapsed_ms is not None else None,
        state_before=state_before,
        stability_before=stability_before,
        difficulty_before=difficulty_before,
    )
    return card_row, log_row


def preview_intervals(
    card_row: m.SrsCard, now: datetime | None = None, scheduler: Any = None
) -> dict[str, dict[str, Any]]:
    """What each rating button would schedule — computed on throwaway copies (§4.3)."""
    now = now or now_utc()
    scheduler = scheduler or scheduler_from_settings()
    out: dict[str, dict[str, Any]] = {}
    for value, label in RATINGS.items():
        try:
            copy = card_from_row(card_row)
            updated, _ = _review_card(scheduler, copy, value, now)
            delta = _card_due(updated) - now
            out[label] = {
                "rating": value,
                "interval_s": max(0, int(delta.total_seconds())),
                "label": format_interval(delta),
                "due_at": iso(_card_due(updated)),
            }
        except Exception as exc:  # noqa: BLE001 — a preview must never break a review
            _log.debug("interval preview failed for rating %s: %s", value, exc)
            out[label] = {"rating": value, "interval_s": None, "label": "—", "due_at": None}
    return out


def card_public(card_row: m.SrsCard, now: datetime | None = None) -> dict[str, Any]:
    """The ``srs`` block of the card JSON in 08 §2."""
    now = now or now_utc()
    try:
        r = round(retrievability(card_from_row(card_row), now), 4)
    except Exception:  # noqa: BLE001
        r = None
    state_names = {0: "new", 1: "learning", 2: "review", 3: "relearning"}
    return {
        "card_id": card_row.id,
        "state": state_names.get(int(card_row.state), "new"),
        "state_code": int(card_row.state),
        "step": card_row.step,
        "stability": card_row.stability,
        "difficulty": card_row.difficulty,
        "due": card_row.due_at,
        "last_review": card_row.last_review_at,
        "reps": int(card_row.reps or 0),
        "lapses": int(card_row.lapses or 0),
        "retrievability": r,
        "maturity": _maturity(card_row),
    }


def _maturity(card_row: m.SrsCard) -> str:
    if int(card_row.state) == STATE_NEW:
        return "new"
    if int(card_row.state) in (STATE_LEARNING, STATE_RELEARNING):
        return "learning"
    stability = float(card_row.stability or 0.0)
    return "mature" if stability >= MATURE_STABILITY_DAYS else "young"


# --------------------------------------------------------------------------------------
# Queue (§7)
# --------------------------------------------------------------------------------------

CardPair = tuple[m.SrsCard, m.VocabEntry]


def _scheduled_pairs(session: Session, profile_id: str) -> list[CardPair]:
    stmt = (
        select(m.SrsCard, m.VocabEntry)
        .join(m.VocabEntry, m.VocabEntry.id == m.SrsCard.entry_id)
        .where(m.VocabEntry.profile_id == profile_id, m.VocabEntry.status == "active")
    )
    return [(card, entry) for card, entry in session.execute(stmt).all()]


def reviews_today(session: Session, profile_id: str, now: datetime | None = None) -> dict[str, int]:
    """``{'total', 'new_introduced', 'reviews'}`` since the 4 AM rollover."""
    since = iso(day_start(now))
    rows = session.execute(
        select(m.SrsReviewLog.state_before, func.count())
        .join(m.SrsCard, m.SrsCard.id == m.SrsReviewLog.card_id)
        .join(m.VocabEntry, m.VocabEntry.id == m.SrsCard.entry_id)
        .where(m.VocabEntry.profile_id == profile_id, m.SrsReviewLog.reviewed_at >= since)
        .group_by(m.SrsReviewLog.state_before)
    ).all()
    new_introduced = 0
    reviews = 0
    for state_before, count in rows:
        if int(state_before) == STATE_NEW:
            new_introduced += int(count)
        else:
            reviews += int(count)
    return {
        "total": new_introduced + reviews,
        "new_introduced": new_introduced,
        "reviews": reviews,
    }


def _interleave(main: list[CardPair], new: list[CardPair]) -> list[CardPair]:
    """Merge new cards into the due stream, never more than 3 new in a row (§7)."""
    if not new:
        return list(main)
    if not main:
        return list(new)
    out: list[CardPair] = []
    main_i = 0
    new_i = 0
    run = 0
    # Roughly even spread: one new card every `gap` due cards.
    gap = max(1, len(main) // max(1, len(new)))
    since_new = 0
    while main_i < len(main) or new_i < len(new):
        take_new = (
            new_i < len(new)
            and run < MAX_CONSECUTIVE_NEW
            and (main_i >= len(main) or since_new >= gap)
        )
        if take_new:
            out.append(new[new_i])
            new_i += 1
            run += 1
            since_new = 0
        elif main_i < len(main):
            out.append(main[main_i])
            main_i += 1
            run = 0
            since_new += 1
        else:  # only new cards left but the run cap tripped — the cap is advisory here
            out.append(new[new_i])
            new_i += 1
            run = 1
    return out


def due_queue(
    session: Session,
    profile_id: str,
    limit: int = SESSION_CHUNK,
    now: datetime | None = None,
) -> list[CardPair]:
    """The next chunk of the review queue in §7 order, daily caps applied."""
    now = now or now_utc()
    now_iso = iso(now)
    limit = max(1, min(200, int(limit)))
    retention, new_per_day, review_cap = study_limits()
    scheduler = get_scheduler(retention)
    done = reviews_today(session, profile_id, now)

    pairs = _scheduled_pairs(session, profile_id)
    relearning: list[CardPair] = []
    learning: list[CardPair] = []
    review_due: list[CardPair] = []
    new_cards: list[CardPair] = []

    for card, entry in pairs:
        state = int(card.state)
        if state == STATE_NEW:
            new_cards.append((card, entry))
            continue
        if card.due_at > now_iso:
            continue
        if state == STATE_RELEARNING:
            relearning.append((card, entry))
        elif state == STATE_LEARNING:
            learning.append((card, entry))
        else:
            review_due.append((card, entry))

    relearning.sort(key=lambda p: p[0].due_at)
    learning.sort(key=lambda p: p[0].due_at)
    # Backlog priority: most-forgotten first (ascending retrievability).
    review_due.sort(key=lambda p: (retrievability(card_from_row(p[0]), now, scheduler), p[0].due_at))
    # Organic entries first — they carry the learner's own context sentence (§7).
    new_cards.sort(
        key=lambda p: (0 if p[1].own_context_origin == "learner" else 1, p[1].created_at, p[0].id)
    )

    remaining_reviews = max(0, review_cap - done["reviews"]) if review_cap else len(review_due)
    remaining_new = max(0, new_per_day - done["new_introduced"])
    main = relearning + learning + review_due[:remaining_reviews]
    fresh = new_cards[:remaining_new]
    return _interleave(main, fresh)[:limit]


def counts(session: Session, profile_id: str, now: datetime | None = None) -> dict[str, int]:
    """Queue-shaped counters for the dashboard and the SRS store."""
    now = now or now_utc()
    now_iso = iso(now)
    _retention, new_per_day, review_cap = study_limits()
    done = reviews_today(session, profile_id, now)

    tallies = {
        "new": 0,
        "learning": 0,
        "relearning": 0,
        "young": 0,
        "mature": 0,
        "due_now": 0,
        "scheduled": 0,
    }
    for card, _entry in _scheduled_pairs(session, profile_id):
        tallies["scheduled"] += 1
        state = int(card.state)
        maturity = _maturity(card)
        if maturity in tallies:
            tallies[maturity] += 1
        if state == STATE_RELEARNING:
            tallies["relearning"] += 1
        if state != STATE_NEW and card.due_at <= now_iso:
            tallies["due_now"] += 1

    status_rows = session.execute(
        select(m.VocabEntry.status, func.count())
        .where(m.VocabEntry.profile_id == profile_id)
        .group_by(m.VocabEntry.status)
    ).all()
    by_status = {str(status): int(count) for status, count in status_rows}

    remaining_new = max(0, new_per_day - done["new_introduced"])
    return {
        **tallies,
        "new_available": min(tallies["new"], remaining_new),
        "new_remaining_today": remaining_new,
        "reviews_done_today": done["total"],
        "reviews_remaining_today": (
            max(0, review_cap - done["reviews"]) if review_cap else tallies["due_now"]
        ),
        "due_today": min(
            tallies["due_now"],
            max(0, review_cap - done["reviews"]) if review_cap else tallies["due_now"],
        )
        + min(tallies["new"], remaining_new),
        "suggested": by_status.get("suggested", 0),
        "active": by_status.get("active", 0),
        "suspended": by_status.get("suspended", 0),
        "known": by_status.get("known", 0),
        "entries": sum(by_status.values()),
    }


# --------------------------------------------------------------------------------------
# Stats (§8)
# --------------------------------------------------------------------------------------


def _log_rows(session: Session, profile_id: str, since: str | None = None) -> Sequence[Any]:
    stmt = (
        select(m.SrsReviewLog.rating, m.SrsReviewLog.state_before, m.SrsReviewLog.reviewed_at)
        .join(m.SrsCard, m.SrsCard.id == m.SrsReviewLog.card_id)
        .join(m.VocabEntry, m.VocabEntry.id == m.SrsCard.entry_id)
        .where(m.VocabEntry.profile_id == profile_id)
    )
    if since:
        stmt = stmt.where(m.SrsReviewLog.reviewed_at >= since)
    return session.execute(stmt).all()


def retention_30d(session: Session, profile_id: str, now: datetime | None = None) -> float | None:
    """True retention: ratings ≥ Hard over review-state reviews in the trailing 30 days."""
    now = now or now_utc()
    since = iso(now - timedelta(days=30))
    rows = [r for r in _log_rows(session, profile_id, since) if int(r.state_before) == STATE_REVIEW]
    if not rows:
        return None
    passed = sum(1 for r in rows if int(r.rating) >= 2)
    return round(passed / len(rows), 4)


def streak(session: Session, profile_id: str, now: datetime | None = None) -> int:
    """Consecutive study days (4 AM boundary) with at least one review."""
    now = now or now_utc()
    days = {
        study_day_key(parse_iso(r.reviewed_at) or now)
        for r in _log_rows(session, profile_id)
        if r.reviewed_at
    }
    if not days:
        return 0
    today = study_day_key(now)
    cursor = datetime.fromisoformat(today)
    if today not in days:
        cursor -= timedelta(days=1)
        if cursor.date().isoformat() not in days:
            return 0
    count = 0
    while cursor.date().isoformat() in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def forecast(
    session: Session, profile_id: str, days: int = 14, now: datetime | None = None
) -> list[dict[str, Any]]:
    """Due-per-day histogram for the next N days (§8)."""
    now = now or now_utc()
    buckets: dict[str, int] = {}
    for i in range(max(1, days)):
        buckets[(now + timedelta(days=i)).date().isoformat()] = 0
    overdue = 0
    for card, _entry in _scheduled_pairs(session, profile_id):
        if int(card.state) == STATE_NEW:
            continue
        due = parse_iso(card.due_at)
        if due is None:
            continue
        key = due.date().isoformat()
        if due <= now:
            overdue += 1
        elif key in buckets:
            buckets[key] += 1
    out = [{"date": date, "count": count} for date, count in sorted(buckets.items())]
    if out:
        out[0]["count"] += overdue
    return out


def sources_breakdown(session: Session, profile_id: str) -> list[dict[str, Any]]:
    rows = session.execute(
        select(m.VocabSource.module, func.count(func.distinct(m.VocabSource.entry_id)))
        .join(m.VocabEntry, m.VocabEntry.id == m.VocabSource.entry_id)
        .where(m.VocabEntry.profile_id == profile_id)
        .group_by(m.VocabSource.module)
    ).all()
    total = sum(int(c) for _mod, c in rows) or 1
    return sorted(
        (
            {"module": str(mod), "entries": int(count), "pct": round(100 * int(count) / total)}
            for mod, count in rows
        ),
        key=lambda r: -r["entries"],
    )


def stats(session: Session, profile_id: str, now: datetime | None = None) -> dict[str, Any]:
    """The §8 dashboard payload."""
    now = now or now_utc()
    tallies = counts(session, profile_id, now)
    done = reviews_today(session, profile_id, now)
    all_logs = _log_rows(session, profile_id)
    return {
        "counts": {
            "new": tallies["new"],
            "learning": tallies["learning"] + tallies["relearning"],
            "young": tallies["young"],
            "mature": tallies["mature"],
            "suspended": tallies["suspended"],
            "known": tallies["known"],
            "suggested": tallies["suggested"],
            "active": tallies["active"],
            "entries": tallies["entries"],
            "scheduled": tallies["scheduled"],
        },
        "due_today": tallies["due_today"],
        "due_now": tallies["due_now"],
        "new_available": tallies["new_available"],
        "reviews_today": done["total"],
        "reviews_total": len(all_logs),
        "retention_30d": retention_30d(session, profile_id, now),
        "streak": streak(session, profile_id, now),
        "forecast": forecast(session, profile_id, 14, now),
        "sources": sources_breakdown(session, profile_id),
        "limits": dict(
            zip(
                ("desired_retention", "new_per_day", "review_cap"),
                study_limits(),
                strict=True,
            )
        ),
        "generated_at": iso(now),
    }


def cards_for_entries(session: Session, entry_ids: Iterable[str]) -> dict[str, m.SrsCard]:
    ids = [e for e in entry_ids]
    if not ids:
        return {}
    rows = session.execute(select(m.SrsCard).where(m.SrsCard.entry_id.in_(ids))).scalars().all()
    return {row.entry_id: row for row in rows}
