"""Grammar & Usage routes — ``/api/v1/grammar`` (auto-discovered; nobody edits ``app.py``).

The surface is small on purpose, because the module's intelligence lives in
:mod:`bandready.grammar.practice` and not in the wire format:

===================================  =================================================
``GET  /path``                       the syllabus as a prerequisite graph with the
                                     learner's state on every node (F1)
``GET  /points/{id}``                one point's full teaching payload (F2)
``POST /points/{id}/start``          the S0 package — meet it before it is scheduled
``POST /points/{id}/gate``           the one retrieval that creates the card (§1.3)
``GET  /session``                    the next session, composed by the Ladder (F9)
``POST /answer``                     grade, move the rung, run FSRS, log — one call
``POST /review``                     rate a card directly (D5; S1 self-rating)
``POST /appeal``                     "I think this is right" (§2.9)
``GET  /progress``                   what is costing marks and what has gone quiet (F4)
``GET  /boards`` / ``/boards/{id}``  the contrast boards (F6)
``GET  /mistakes``                   errors harvested from Writing and Speaking (F8)
``GET  /drills``                     a drill of every item carrying one error code (F4)
===================================  =================================================

Two conventions inherited from the four skills and kept deliberately:

* **answers are gated behind a real attempt.** No key, no ``decision_cue`` and no feedback
  leaves the server until an answer has been submitted, and a first wrong answer gets the
  *signal* beat — the deciding span highlights and the learner tries again — before the
  answer is ever shown (F3).
* **grading is the server's.** The client never decides whether something was right.
"""

from __future__ import annotations

import json
import logging
import random
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.grammar import grading, practice, syllabus
from bandready.grammar import scheduler_bridge as bridge
from bandready.grammar.tables import GrammarCard, ensure_grammar_tables
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.srs import scheduler as sched

_log = logging.getLogger("bandready.grammar.routes")

router = APIRouter(prefix="/api/v1/grammar", tags=["grammar"])

DEFAULT_SESSION_SIZE = 16


def grammar_session(session: Session = Depends(get_session)) -> Session:
    """The request session, with the grammar tables guaranteed to exist.

    ``ensure_grammar_tables`` is a ``create_all(checkfirst=True)`` over four tables and
    caches per engine, so this costs one ``PRAGMA`` on the first grammar request of the
    process and nothing afterwards. It exists because D1's Alembic revision is not this
    agent's file to write; once it lands, this call finds everything already there.
    """
    ensure_grammar_tables(session.get_bind())
    return session


def _now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------------------


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    item_id: str
    point_id: str | None = None
    card_id: str | None = None
    #: The screen sends one identifier per sitting so an answer can be tied to the session
    #: it came from. Nothing is stored under it — every answer is already written when it
    #: is made — but it is what lets ``/session/{id}/finish`` be a real call.
    session_id: str | None = None
    #: A ``both_ok`` item asks a second question after the learner has said "both". It
    #: rides along with the main answer rather than costing a second round trip.
    follow_up: int | None = None
    #: ``dictation`` only: logged, never punished.
    replays: int | None = None
    #: An option index, a typed string, a list of indices, or the small dicts the
    #: two-stage kinds use (``judge``: ``{"acceptable": bool, "reason": int}``).
    answer: Any = None
    #: ``attempt`` is the screen's spelling of the same number (1 on the first try, 2 after
    #: the elicit beat). One field, two names, so neither side has to translate.
    attempts: int = Field(default=1, ge=1, le=5, alias="attempt")
    hint_used: bool = False
    revealed: bool = False
    elapsed_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    session_started_at: str | None = None
    #: S1 only: the learner may override the computed rating (§1.8).
    self_rating: int | None = Field(default=None, ge=1, le=4)


class ReviewRequest(BaseModel):
    """D5 — ``POST /api/v1/srs/review`` cannot rate a grammar card, so this exists."""

    model_config = ConfigDict(extra="ignore")

    card_id: str | None = None
    point_id: str | None = None
    rating: int = Field(ge=1, le=4)
    review_type: str = "interpret"
    item_id: str | None = None
    elapsed_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    session_started_at: str | None = None


class GateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    item_id: str | None = None
    answer: Any = None
    attempts: int = Field(default=1, ge=1, le=3)
    elapsed_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class AppealRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    item_id: str
    point_id: str | None = None
    card_id: str | None = None
    #: Optional: the screen does not resend the sentence it just submitted, so when it is
    #: absent we recall what was actually answered (:data:`_LAST_PRODUCTION`).
    sentence: str = ""
    meant: str = ""
    session_id: str | None = None


class SessionRequest(BaseModel):
    """The four ways into a sitting. Exactly one selector is ever set."""

    model_config = ConfigDict(extra="ignore")

    mode: str = "daily"
    point_id: str | None = None
    code: str | None = None
    board_id: str | None = None
    limit: int = Field(default=DEFAULT_SESSION_SIZE, ge=1, le=40)
    seed: int | None = None
    include_vocabulary: bool = True
    allow_llm: bool = True


class RuleRequest(BaseModel):
    """F14 — "Add to my rules", from a revealed rule line or a wrong sentence."""

    model_config = ConfigDict(extra="ignore")

    point_id: str
    rule_line: str
    learner_sentence: str | None = None
    correction: str | None = None


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _points(session: Session) -> dict[str, syllabus.Point]:
    points = syllabus.load_points(session)
    if not points:
        raise ApiError(
            404,
            "not_found",
            "no grammar points are installed — the content pack has not been imported yet",
        )
    return points


def _point_or_404(session: Session, point_id: str) -> syllabus.Point:
    point = _points(session).get(point_id)
    if point is None:
        raise ApiError(404, "not_found", f"no grammar point with id {point_id!r}")
    return point


def _stages(session: Session, profile_id: str) -> dict[str, int]:
    return {
        point_id: int(card.stage)
        for point_id, card in bridge.cards_by_point(session, profile_id).items()
    }


def _card_for(
    session: Session, profile_id: str, *, card_id: str | None, point_id: str | None
) -> GrammarCard:
    card: GrammarCard | None = None
    if card_id:
        card = session.get(GrammarCard, card_id)
    elif point_id:
        card = session.execute(
            select(GrammarCard).where(
                GrammarCard.profile_id == profile_id, GrammarCard.point_id == point_id
            )
        ).scalar_one_or_none()
    else:
        raise ApiError(422, "validation_error", "card_id or point_id is required")
    if card is None or card.profile_id != profile_id:
        raise ApiError(
            404,
            "not_found",
            "this point has not been started yet — open it first so it can be taught "
            "before it is scheduled",
        )
    return card


def _lex_items(
    session: Session, profile_id: str, limit: int, *, rng: random.Random, now: datetime
) -> list[dict[str, Any]]:
    """Vocabulary cards for the merged queue (§1.9), rendered by the existing engine.

    The grammar module renders no vocabulary of its own: it borrows ``srs.due_queue`` and
    ``srs.exercises`` whole, so a word reviewed inside a grammar session is the same card
    with the same schedule as a word reviewed anywhere else.
    """
    if limit <= 0:
        return []
    from bandready.server.routes.vocab import serialize_entry
    from bandready.srs import exercises as ex

    out: list[dict[str, Any]] = []
    for card, entry in sched.due_queue(session, profile_id, limit, now):
        doc = serialize_entry(entry, card)
        kind = ex.choose_exercise(doc, doc["srs"], rng=rng)
        exercise = ex.build_exercise(kind, doc, doc["srs"], rng=rng)
        exercise.pop("expected", None)
        out.append(
            {
                "family": "lex",
                "card_id": card.id,
                "entry_id": entry.id,
                "headword": entry.headword,
                # Carried for §1.5 rule 7: a `produce` item can borrow this word, and the
                # learner needs its meaning in front of them to use it in their own sentence.
                "definition": entry.definition,
                "kind": exercise["type"],
                "stage": 2,
                "stage_name": practice.STAGE_NAMES[2],
                "item_id": f"lex:{entry.id}",
                "point_id": None,
                "exercise": exercise,
                "review_via": "/api/v1/srs/review",
            }
        )
    return out


# --------------------------------------------------------------------------------------
# The wire shape the screens render
# --------------------------------------------------------------------------------------
#
# Everything above composes the module; everything here translates it into the flat item
# the practice screen draws. Keeping the translation in one place is what stops the
# renderer growing knowledge of the ladder's internals — it receives an item, draws it,
# and posts back what the learner did.

#: Kinds that get the elicit beat: wrong once, the deciding span highlights, one more try.
#: A free-production kind is not retryable because there is no single answer to converge on,
#: and a `judge` item is not, because its second stage *is* the retry.
RETRYABLE_KINDS: frozenset[str] = frozenset(
    {"interpret", "gap_fill", "order", "transform", "choose_form", "contrast_pair", "error_fix"}
)

#: The last free-production sentence per (profile, item), so an appeal can re-judge what
#: was actually written without the screen having to send it twice. Bounded and in-process:
#: an appeal follows its rejection within seconds, and losing one on a restart costs the
#: learner one re-typed sentence rather than any recorded progress.
_LAST_PRODUCTION: dict[tuple[str, str], str] = {}
_LAST_PRODUCTION_MAX = 512


class _NoCard:
    """Stand-in for "this point has no card", so a lookup can be read without a branch."""

    stage = 0


_NO_CARD = _NoCard()


def _remember_production(profile_id: str, item_id: str, sentence: str) -> None:
    if len(_LAST_PRODUCTION) >= _LAST_PRODUCTION_MAX:
        _LAST_PRODUCTION.clear()
    _LAST_PRODUCTION[(profile_id, item_id)] = sentence


def _next_label(card: GrammarCard, now: datetime) -> str | None:
    """"in 4 days" — the interval the rating just bought, in the learner's words."""
    due = sched.parse_iso(card.due_at)
    if due is None:
        return None
    delta = due - now
    if delta.total_seconds() <= 60:
        return "again in this session"
    return f"in {sched.format_interval(delta)}"


def _ui_item(entry: dict[str, Any]) -> dict[str, Any]:
    """One composed queue entry — grammar or vocabulary — as the screen receives it.

    The answer keys never travel: :func:`practice.public_item` has already stripped them,
    and ``decision_cue`` is withheld here too because it is the span that decides the
    answer and painting it on the front of the card turns a choice item into a reading
    comprehension question with the answer underlined.
    """
    exercise = entry.get("exercise") or {}
    kind = str(exercise.get("kind") or entry.get("kind") or "interpret")
    payload = dict(exercise.get("payload") or {})
    if entry.get("family") == "lex":
        # A vocabulary card borrows the grammar renderer: the prompt is the exercise's own,
        # and the answer still goes to the SRS route it came from.
        payload.setdefault("question", exercise.get("prompt"))
    reteach = None
    if entry.get("reteach_first"):
        reteach = {
            "rule_line": entry.get("rule_line"),
            "worked_example": entry.get("worked_example"),
        }
    return {
        "id": str(entry.get("item_id")),
        "point_id": entry.get("point_id"),
        "point_title": entry.get("point_title"),
        "card_id": entry.get("card_id"),
        "family": entry.get("family", "gram"),
        "kind": kind,
        "stage": int(entry.get("stage") or exercise.get("stage") or 0),
        "stage_name": entry.get("stage_name"),
        "register": entry.get("register"),
        "topic_id": entry.get("topic_id"),
        "confusion_set": entry.get("confusion_set"),
        "sibling_note": entry.get("sibling_note"),
        "decision_cue": None,
        "reteach": reteach,
        "prompt": exercise.get("prompt"),
        "payload": payload,
        "retryable": kind in RETRYABLE_KINDS,
        "needs_model": kind in grading.FREE_PRODUCTION_KINDS,
        "review_via": entry.get("review_via"),
        "entry_id": entry.get("entry_id"),
    }


def _drill_entries(
    session: Session,
    points: dict[str, syllabus.Point],
    *,
    code: str | None,
    board_id: str | None,
    size: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Items carrying one error code, or one contrast, from every point that has them.

    Assembled across all points rather than inside one unit, because the learner's problem
    is rarely confined to a unit — "you keep splicing commas" is true of their writing, not
    of chapter nine.
    """
    pool: list[dict[str, Any]] = []
    for point in points.values():
        if board_id and point.board_id != board_id:
            continue
        for item in point.items:
            if board_id and int(item.get("stage") or 0) != 3:
                continue
            if code and code not in [str(c) for c in (item.get("error_codes") or [])]:
                continue
            if str(item.get("kind")) in grading.FREE_PRODUCTION_KINDS:
                continue
            pool.append(
                {
                    "family": "gram",
                    "point_id": point.id,
                    "point_title": point.title,
                    "item_id": str(item.get("id")),
                    "kind": str(item.get("kind")),
                    "stage": int(item.get("stage") or 0),
                    "stage_name": practice.STAGE_NAMES.get(int(item.get("stage") or 0)),
                    "register": item.get("register"),
                    "topic_id": item.get("topic_id"),
                    "confusion_set": item.get("confusion_set"),
                    "twin_id": item.get("twin_id"),
                    "exercise": practice.public_item(item),
                }
            )
    rng.shuffle(pool)
    return practice.arrange(pool[:size])


# --------------------------------------------------------------------------------------
# The Path and the point screen
# --------------------------------------------------------------------------------------


@router.get("/path", summary="The whole syllabus with the learner's state on every point")
def get_path(
    unit_id: str | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    stages = _stages(session, profile_id)
    cards = bridge.cards_by_point(session, profile_id)

    mastered = set()
    for point_id, card in cards.items():
        point = points.get(point_id)
        if point is not None and practice.mastery_report(session, card, point, points)["mastered"]:
            mastered.add(point_id)

    rows = syllabus.path_states(points, stages, mastered=mastered)
    for row in rows:
        card = cards.get(row["id"])
        row["mastered"] = row["id"] in mastered
        row["due_at"] = card.due_at if card is not None else None
        row["leech"] = bool(int(card.leech or 0)) if card is not None else False
        row["wild_failure"] = bool(card.last_wild_failure_at) if card is not None else False
    if unit_id:
        rows = [row for row in rows if row["unit_id"] == unit_id]

    units: dict[str, dict[str, Any]] = {}
    for row in rows:
        unit = units.setdefault(
            row["unit_id"],
            {"unit_id": row["unit_id"], "points": [], "done": 0, "total": 0},
        )
        unit["points"].append(row)
        unit["total"] += 1
        if row["state"] in ("practised", "mastered"):
            unit["done"] += 1

    total_minutes = sum(p.estimated_minutes for p in points.values())
    started = sum(1 for row in rows if row["state"] != "locked" and row["stage"] is not None)
    practised = sum(1 for row in rows if row["state"] in ("practised", "mastered"))
    next_point = next((row["id"] for row in rows if row.get("is_next_up")), None)
    queue = bridge.counts(session, profile_id)
    for unit in units.values():
        unit["title"] = syllabus.UNIT_TITLES.get(unit["unit_id"], unit["unit_id"])
        unit["track"] = syllabus.UNIT_TRACKS.get(unit["unit_id"])
        unit["point_ids"] = [row["id"] for row in unit["points"]]
        unit["summary"] = None
    return {
        "units": list(units.values()),
        "points": rows,
        # The shape the Path screen renders. Kept alongside the raw rows above rather than
        # replacing them, because the raw rows are what the tests and the drill selector
        # read and the two must not drift apart.
        "summary": {
            "total_points": len(points),
            "started": started,
            "practised": practised,
            "mastered": len(mastered),
            "next_point_id": next_point,
            "due_now": int(queue.get("due_now") or 0),
            "harvested_codes": len(practice.harvest(session, profile_id)),
            "pace_note": (
                f"The whole path is {len(points)} points and about "
                f"{max(1, round(total_minutes / 60))} hours of work."
            ),
        },
        "counts": bridge.counts(session, profile_id),
        "entry_points": [
            {
                "id": "start_at_the_beginning",
                "label": "Start at the beginning",
                "note": (
                    f"The whole path is {len(points)} points and about "
                    f"{round(total_minutes / 60)} hours of work. At five sessions a week "
                    "that is around "
                    f"{max(1, round(total_minutes / 60 / 4))} months. That is the honest "
                    "number."
                ),
            },
            {
                "id": "find_my_level",
                "label": "Find my level",
                "note": "Twenty questions across the five points everything else leans on.",
                "nodes": [n for n in syllabus.PLACEMENT_NODES if n in points],
            },
            {
                "id": "fix_what_costs_marks",
                "label": "Fix what's costing me marks",
                "note": "Built from your own Writing and Speaking errors, not from a level.",
            },
        ],
        "honesty_note": (
            "Some points keep producing errors for months after they are learned. That is "
            "how acquisition works, not a sign this is not working."
        ),
    }


@router.get("/points/{point_id}", summary="One point's full teaching payload")
def get_point(
    point_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    point = points.get(point_id)
    if point is None:
        raise ApiError(404, "not_found", f"no grammar point with id {point_id!r}")

    stages = _stages(session, profile_id)
    card = bridge.cards_by_point(session, profile_id).get(point_id)
    blocking = syllabus.unmet_prerequisites(point, stages, points)

    # The notice-set keys are only unlocked once the point has actually been opened.
    payload = syllabus.teaching_payload(point, reveal_notice=card is not None)
    payload["stages"] = [
        {"stage": stage, "name": name, "reached": bool(card and int(card.stage) >= stage)}
        for stage, name in practice.STAGE_NAMES.items()
    ]
    payload["locked"] = bool(blocking) and card is None
    payload["blocked_by"] = [{"id": pid, "title": points[pid].title} for pid in blocking]
    payload["start_here"] = (
        syllabus.deepest_unmet_prerequisite(point_id, stages, points) if blocking else None
    )
    if card is not None:
        payload["card"] = {
            **bridge.card_public(card),
            "card_id": card.id,
            "stage": int(card.stage),
            "stage_name": practice.STAGE_NAMES[int(card.stage)],
            "stage_successes": int(card.stage_successes or 0),
            "leech": bool(int(card.leech or 0)),
            "last_wild_failure_at": card.last_wild_failure_at,
            "wild_failure_at": card.last_wild_failure_at,
            # Rungs the learner has actually cleared, for the stage bar. Stage is a high-water
            # mark in this module — the ladder only demotes on a real failure — so everything
            # up to and including the current rung has genuinely been passed.
            "cleared_stages": list(range(int(card.stage) + 1)),
        }
        report = practice.mastery_report(session, card, point, points)
        payload["mastery"] = report
        payload["card"]["mastered"] = bool(report["mastered"])
    else:
        payload["card"] = None
        payload["mastery"] = None

    # --- the shape the point screen renders ------------------------------------------
    # `point_json` is the whole authored payload the UI walks (teach, contrast, errors,
    # pays_in, used_in). It is assembled from the same fields as the flat keys above rather
    # than replacing them, so the existing consumers keep working.
    payload["point_json"] = {
        "schema_version": 1,
        "grammar_name": point.grammar_name,
        "prerequisites": list(point.prerequisites),
        "priority": point.priority,
        "register": point.register,
        "risk_tier": point.risk_tier,
        "error_surface": point.error_surface,
        "confusion_set": point.confusion_set,
        "structure_slug": point.structure_slug,
        "fixes_errors": list(point.fixes_errors),
        "pays_in": point.pays_in,
        "criteria": payload.get("criteria"),
        "estimated_minutes": point.estimated_minutes,
        "teach": payload["teach"],
        "contrast": point.contrast or None,
        "errors": point.errors,
        "used_in": point.used_in,
    }
    all_rows = {
        row["id"]: row
        for row in syllabus.path_states(points, stages, mastered=set())
    }
    payload["state"] = all_rows.get(point_id, {}).get("state", "locked")
    payload["prerequisites"] = [
        {
            "id": pid,
            "title": points[pid].title,
            "state": all_rows.get(pid, {}).get("state", "locked"),
        }
        for pid in point.prerequisites
        if pid in points
    ]
    payload["unlocks"] = [
        {"id": other.id, "title": other.title}
        for other in sorted(points.values(), key=lambda p: p.sequence_index)
        if point_id in other.prerequisites
    ]
    bank: dict[str, int] = {}
    for item in point.items:
        bank[f"s{int(item.get('stage') or 0)}"] = bank.get(f"s{int(item.get('stage') or 0)}", 0) + 1
    payload["bank"] = bank
    return payload


@router.post("/points/{point_id}/start", summary="The S0 package — meet it before it is scheduled")
def start_point(
    point_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    point = points.get(point_id)
    if point is None:
        raise ApiError(404, "not_found", f"no grammar point with id {point_id!r}")

    stages = _stages(session, profile_id)
    blocking = syllabus.unmet_prerequisites(point, stages, points)
    if blocking:
        start_here = syllabus.deepest_unmet_prerequisite(point_id, stages, points)
        raise ApiError(
            409,
            "conflict",
            f"{point.title!r} needs {points[blocking[0]].title!r} first"
            + (f" — start with {points[start_here].title!r}" if start_here else ""),
        )

    package = practice.open_point(point)
    gate = practice.gate_item(point)
    package["gate_item"] = practice.public_item(gate) if gate else None
    return package


@router.post("/points/{point_id}/gate", summary="Pass the entry gate — this creates the card")
def pass_gate(
    point_id: str,
    body: GateRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """The gate of §1.3: **nothing is scheduled until it is understood.**

    ``create_card`` runs here and nowhere else. FSRS will happily schedule something the
    learner never understood, forever; this is the check that closes that blind spot.
    """
    profile_id = current_profile_id(session)
    point = _point_or_404(session, point_id)

    gate = practice.gate_item(point)
    if body.item_id:
        gate = point.item(body.item_id) or gate
    if gate is None:
        raise ApiError(422, "validation_error", "this point has no item usable as a gate")

    grade = grading.grade_item(gate, body.answer)
    passed = bool(grade.get("correct")) or bool(grade.get("close"))
    if not passed:
        remaining = max(0, 2 - int(body.attempts))
        return {
            "passed": False,
            "attempts_left": remaining,
            "card": None,
            "reveal": practice.reveal(gate, point, grade) if remaining == 0 else None,
            "note": (
                "Not yet — have another look at the examples. Nothing goes into your "
                "review queue until this one lands, which is the point."
                if remaining
                else "We will go round the examples once more before this gets scheduled."
            ),
        }

    card = practice.pass_gate(session, profile_id, point)
    session.flush()
    return {
        "passed": True,
        "card_id": card.id,
        "stage": int(card.stage),
        "stage_name": practice.STAGE_NAMES[int(card.stage)],
        "reveal": practice.reveal(gate, point, grade),
        "rule_card": point.teach,
        "note": (
            "That is the point open and scheduled. From here the app decides when it comes "
            "back; what it asks you depends on how far up you are."
        ),
    }


# --------------------------------------------------------------------------------------
# The session
# --------------------------------------------------------------------------------------


@router.get("/session", summary="The next practice session, composed by the Ladder")
def get_practice_session(
    size: int = Query(default=DEFAULT_SESSION_SIZE, ge=1, le=40),
    seed: int | None = None,
    include_vocabulary: bool = True,
    allow_llm: bool = True,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    now = _now()
    rng = random.Random(seed) if seed is not None else random.Random()

    # A wild failure outranks everything: check for one before composing (§1.6, F8).
    wild = practice.apply_wild_failures(session, profile_id, points, now=now)

    gram_target = max(1, int(size / (1 + practice.LEX_PER_GRAM)))
    lex = (
        _lex_items(session, profile_id, size - gram_target, rng=rng, now=now)
        if include_vocabulary
        else []
    )
    composed = practice.build_session(
        session,
        profile_id,
        points=points,
        lex_items=lex,
        size=size,
        now=now,
        rng=rng,
        allow_llm=allow_llm,
    )
    composed["wild_failures"] = wild
    composed["session_started_at"] = sched.iso(now)
    composed["stage_names"] = practice.STAGE_NAMES
    if not composed["items"] and not composed["new_budget"]["allowed"]:
        composed["empty_note"] = (
            "Nothing is due. That is the schedule doing its job — come back when it is."
        )
    return composed


@router.post("/session", summary="Build one sitting — the daily queue, a lesson, a drill")
def post_practice_session(
    body: SessionRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """The four ways in (F1), each returning the same flat list of items.

    ``point_id`` studies one lesson end to end. **A cold point has no card yet**, and this
    is where it gets one: the learner has just been through the point screen — the worked
    examples, the meaning questions, the rule — which is beats 1 and 2 of §1.3's entry
    gate, and the first item of this session is beat 3. The card is created at S1 and the
    ladder demotes it if that first retrieval fails, which is the same outcome the gate
    describes without making the learner answer the same question twice.
    """
    profile_id = current_profile_id(session)
    points = _points(session)
    now = _now()
    rng = random.Random(body.seed) if body.seed is not None else random.Random()
    mode = body.mode or ("point" if body.point_id else "daily")
    session_id = f"gs_{int(now.timestamp() * 1000)}_{rng.randrange(1 << 24):06x}"

    if body.code or body.board_id or mode in ("code", "board"):
        items = _drill_entries(
            session,
            points,
            code=body.code,
            board_id=body.board_id,
            size=body.limit,
            rng=rng,
        )
        return {
            "session_id": session_id,
            "items": [_ui_item(entry) for entry in items],
            "counts": {"total": len(items), "gram": len(items), "lex": 0, "new_points": 0},
            "plan": [{"phase": "drill", "label": "One decision, many sentences", "count": len(items)}],
            "empty_reason": (
                None
                if items
                else "Nothing in the bank carries that code yet — try the daily queue."
            ),
        }

    if body.point_id or mode in ("point", "placement"):
        point_ids = (
            [body.point_id]
            if body.point_id
            else [p for p in syllabus.PLACEMENT_NODES if p in points]
        )
        entries: list[dict[str, Any]] = []
        seen_ids: list[str] = []
        for point_id in point_ids:
            point = points.get(str(point_id))
            if point is None:
                continue
            card = practice.pass_gate(session, profile_id, point, now=now)
            picked = practice.items_for_point(
                session,
                card,
                point,
                count=max(1, body.limit // max(1, len(point_ids))),
                now=now,
                rng=rng,
                allow_llm=body.allow_llm,
                already_shown=seen_ids,
            )
            seen_ids.extend(str(entry["item_id"]) for entry in picked)
            entries.extend(picked)
        session.flush()
        return {
            "session_id": session_id,
            "items": [_ui_item(entry) for entry in entries],
            "counts": {
                "total": len(entries),
                "gram": len(entries),
                "lex": 0,
                "new_points": len(point_ids),
            },
            "plan": [
                {"phase": "lesson", "label": "This lesson, one rung at a time", "count": len(entries)}
            ],
            "empty_reason": (
                None if entries else "This point's bank is empty — nothing to practise here."
            ),
        }

    # The daily queue: grammar and vocabulary interleaved (F9, §1.9).
    practice.apply_wild_failures(session, profile_id, points, now=now)
    gram_target = max(1, int(body.limit / (1 + practice.LEX_PER_GRAM)))
    lex = (
        _lex_items(session, profile_id, body.limit - gram_target, rng=rng, now=now)
        if body.include_vocabulary
        else []
    )
    composed = practice.build_session(
        session,
        profile_id,
        points=points,
        lex_items=lex,
        size=body.limit,
        now=now,
        rng=rng,
        allow_llm=body.allow_llm,
    )
    entries = composed["items"]
    return {
        "session_id": session_id,
        "items": [_ui_item(entry) for entry in entries],
        "counts": {
            "total": len(entries),
            "gram": sum(1 for e in entries if e.get("family") != "lex"),
            "lex": sum(1 for e in entries if e.get("family") == "lex"),
            "new_points": int(composed["new_budget"].get("allowed") or 0),
        },
        "plan": [
            {"phase": phase["name"], "label": phase["label"], "count": len(phase["items"])}
            for phase in composed["phases"]
            if phase["items"]
        ],
        "session_started_at": composed["generated_at"],
        "empty_reason": (
            None
            if entries
            else "Nothing is due. That is the schedule doing its job — come back when it is."
        ),
    }


@router.post("/session/{session_id}/finish", summary="Close a sitting")
def finish_practice_session(
    session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """Nothing to save — every answer was written when it was made.

    This exists so the client has one honest place to say "the learner stopped", and so a
    slammed laptop lid costs at most the item on screen. It is deliberately not where
    progress is recorded: a session that is never finished must still count.
    """
    return {"ok": True, "session_id": session_id}


@router.post("/answer", summary="Grade one answer, move the rung, run FSRS, log it")
async def post_answer(
    body: AnswerRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """One call does everything, in this order: grade → rung → FSRS → log.

    A first wrong answer on a mechanical item does **not** commit. It returns the *signal*
    beat — the deciding span highlights, the answer does not appear, and the learner
    re-answers. Roughly seven in ten recasts go unnoticed; showing the answer first is how
    a correction becomes wallpaper (F3).

    **A drill item from a point that has never been taught is graded but not recorded.** A
    code drill and a contrast board both assemble items from every point that carries them,
    including points the learner has not reached, and answering one of those must not
    create a card: FSRS would then be scheduling something nobody has explained, which is
    precisely the blind spot §1.3's entry gate exists to close. The learner gets the full
    reveal — that is the whole value of a diagnostic drill — plus the lesson that teaches it.
    """
    profile_id = current_profile_id(session)
    points = _points(session)
    card: GrammarCard | None = None
    if body.card_id or body.point_id:
        card = session.execute(
            select(GrammarCard).where(
                GrammarCard.profile_id == profile_id,
                (GrammarCard.id == body.card_id)
                if body.card_id
                else (GrammarCard.point_id == body.point_id),
            )
        ).scalar_one_or_none()
    point = points.get(card.point_id) if card is not None else points.get(body.point_id or "")
    if point is None:
        raise ApiError(
            404,
            "not_found",
            "this item's grammar point is not installed" if body.point_id else
            "card_id or point_id is required",
        )
    item = point.item(body.item_id)
    if item is None:
        raise ApiError(404, "not_found", f"no item {body.item_id!r} in {point.id}")

    if card is None:
        grade = grading.grade_item(item, body.answer)
        return {
            "committed": False,
            "beat": "reveal",
            "correct": bool(grade.get("correct") or grade.get("close")),
            "reveal": practice.reveal(item, point, grade),
            "outcome": None,
            "next_label": None,
            "note": (
                f"Graded, but not added to your schedule — “{point.title}” has not been "
                "taught yet. Open the lesson and it starts coming back on its own."
            ),
            "teach_point_id": point.id,
        }

    kind = str(item.get("kind"))
    now = _now()

    if kind in grading.FREE_PRODUCTION_KINDS:
        payload = item.get("payload") or {}
        verdict = await grading.judge_production(
            str(body.answer or ""),
            structure_slug=(payload.get("required_structure") or point.structure_slug),
            prompt_text=str(payload.get("prompt_text") or payload.get("injection") or ""),
            rule_line=str(point.teach.get("rule_line") or ""),
            min_words=int(payload.get("min_words") or 0),
        )
        grade = {
            "checked": verdict["checked"],
            "correct": verdict["accepted"],
            "close": False,
            "detail": verdict["detail"],
            "expected": None,
        }
        if not verdict["checked"]:
            # Offline: the learner rates themselves rather than being told they are wrong.
            return {
                "committed": False,
                "beat": "self_rate",
                "production": verdict,
                "note": verdict["detail"],
            }
        outcome = practice.outcome_for(
            grade,
            item_stage=int(item.get("stage") or 4),
            attempts=body.attempts,
            hint_used=body.hint_used,
            revealed=body.revealed,
            elapsed_ms=body.elapsed_ms,
        )
    else:
        grade = grading.grade_item(item, body.answer)
        if not grade.get("checked"):
            outcome = "pass"
        else:
            wrong = not (grade.get("correct") or grade.get("close"))
            if wrong and body.attempts < 2 and not body.revealed:
                # Beat 1 — signal. No answer, no write, one retry always.
                return {
                    "committed": False,
                    "beat": "signal",
                    "item_id": body.item_id,
                    "hint": {
                        "decision_cue": item.get("decision_cue"),
                        "look_again_at": point.contrast.get("question")
                        or point.teach.get("rule_line"),
                    },
                    "note": "Not this one. Look again at what the situation tells you.",
                    "attempts_left": 1,
                }
            outcome = practice.outcome_for(
                grade,
                item_stage=int(item.get("stage") or 1),
                attempts=body.attempts,
                hint_used=body.hint_used,
                revealed=body.revealed,
                elapsed_ms=body.elapsed_ms,
            )
        verdict = None

    # Self-rating is honoured at S1 only (§1.8) — everywhere else the grading is the app's.
    rating_override = (
        body.self_rating if (body.self_rating and int(item.get("stage") or 0) <= 1) else None
    )
    result = practice.apply_outcome(
        session,
        card,
        point,
        item,
        outcome=outcome,
        grade=grade,
        elapsed_ms=body.elapsed_ms,
        now=now,
        session_started_at=body.session_started_at,
        rating_override=rating_override,
    )
    result["committed"] = True
    result["beat"] = "reveal"
    result["reveal"] = practice.reveal(item, point, grade)
    if verdict is not None:
        result["production"] = verdict
        _remember_production(profile_id, body.item_id, str(body.answer or ""))
    result["mastery"] = practice.mastery_report(session, card, point, points)
    if result["mastery"]["mastered"]:
        result["mastery_line"] = f"You can now: {result['mastery']['can_do']}"
    result["mastered"] = bool(result["mastery"]["mastered"])
    result["correct"] = bool(grade.get("correct") or grade.get("close"))
    result["next_label"] = _next_label(card, now)
    if item.get("twin_id"):
        # The one bespoke string in the module (F3): getting both halves of a twin right is
        # the evidence that the learner is reading the situation and not the shape.
        result["twin_note"] = (
            "There is a mirror of this one in the bank — same sentence, other answer. "
            "Getting both right is the whole test."
        )

    # The `both_ok` follow-up rides along with the main answer, so it is graded here rather
    # than in a second call. It never changes the rating: the learner has already shown
    # they know both are possible, and this asks which one carries which meaning.
    follow = (item.get("payload") or {}).get("follow_up") or {}
    if body.follow_up is not None and follow:
        result["reveal"]["follow_up_key"] = follow.get("key")
        result["follow_up_correct"] = body.follow_up == follow.get("key")
    return result


@router.post("/review", summary="Rate a grammar card directly (D5)")
def post_review(
    body: ReviewRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """``/api/v1/srs/review`` cannot do this: its ``exercise_type`` is a ``Literal`` of the
    six vocabulary kinds and its write path resolves a ``vocab_entries`` id. Same
    transaction shape, same FSRS call, its own log table — and no widening of the vocab
    route, which would put grammar kinds into a CheckConstraint that rejects them.
    """
    profile_id = current_profile_id(session)
    points = _points(session)
    card = _card_for(session, profile_id, card_id=body.card_id, point_id=body.point_id)
    point = points.get(card.point_id)
    if point is None:
        raise ApiError(404, "not_found", "this card's point is no longer installed")

    item = point.item(body.item_id) if body.item_id else None
    outcome = {1: "fail", 2: "pass_slow", 3: "pass", 4: "pass"}[int(body.rating)]
    result = practice.apply_outcome(
        session,
        card,
        point,
        item or {"id": body.item_id, "kind": body.review_type, "stage": int(card.stage)},
        outcome=outcome,
        grade={"correct": body.rating > 1},
        elapsed_ms=body.elapsed_ms,
        session_started_at=body.session_started_at,
        rating_override=int(body.rating),
    )
    result["committed"] = True
    return result


@router.post("/appeal", summary="“I think this is right” — re-judge with the learner's meaning")
async def post_appeal(
    body: AppealRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """Every appeal is a labelled data point about where our items and detectors are wrong.

    A module that cannot be told it is wrong will stay wrong (§2.9). If the re-judge
    accepts, the card is rated normally; if it still rejects, the answer leads with the
    learner's own meaning rather than with the verdict.
    """
    profile_id = current_profile_id(session)
    points = _points(session)
    card = _card_for(session, profile_id, card_id=body.card_id, point_id=body.point_id)
    point = points.get(card.point_id)
    if point is None:
        raise ApiError(404, "not_found", "this card's point is no longer installed")
    item = point.item(body.item_id)
    if item is None:
        raise ApiError(404, "not_found", f"no item {body.item_id!r} in {point.id}")

    sentence = body.sentence or _LAST_PRODUCTION.get((profile_id, body.item_id), "")
    if not sentence.strip():
        raise ApiError(
            422,
            "validation_error",
            "we no longer have the sentence that was rejected — write it again and we will "
            "look at it properly",
        )
    payload = item.get("payload") or {}
    verdict = await grading.judge_production(
        sentence,
        structure_slug=(payload.get("required_structure") or point.structure_slug),
        prompt_text=str(payload.get("prompt_text") or ""),
        rule_line=str(point.teach.get("rule_line") or ""),
        appeal_gloss=body.meant,
    )
    if verdict["accepted"]:
        result = practice.apply_outcome(
            session,
            card,
            point,
            item,
            outcome="pass",
            grade={"correct": True},
        )
        result["upheld"] = True
        result["production"] = verdict
        result["note"] = "You were right and we were not. It is marked as a pass."
        _log.info(
            "grammar appeal upheld on %s/%s — item or detector needs review",
            point.id,
            body.item_id,
        )
        return result
    return {
        "upheld": False,
        "production": verdict,
        "note": (
            f"To say “{body.meant or 'that'}”, you would write: "
            f"“{verdict.get('minimal_fix') or '—'}”. Here is why your version says "
            "something different."
        ),
    }


# --------------------------------------------------------------------------------------
# Progress, boards, mistakes, drills
# --------------------------------------------------------------------------------------


@router.get("/progress", summary="What is costing marks, and what has gone quiet (F4)")
def get_progress(
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    report = practice.progress(session, profile_id, points=points)
    stages = _stages(session, profile_id)
    cards = bridge.cards_by_point(session, profile_id)
    mastered_ids = {row["point_id"] for row in report["mastered"]}
    rows = {
        row["id"]: row
        for row in syllabus.path_states(points, stages, mastered=mastered_ids)
    }

    # How many drill items exist for a code, so the "practise this" button can say whether
    # there is anything behind it rather than opening an empty drill.
    drillable: dict[str, int] = {}
    for point in points.values():
        for item in point.items:
            for code in item.get("error_codes") or []:
                drillable[str(code)] = drillable.get(str(code), 0) + 1

    def _stat(code: str, count: int, *, was: int | None = None) -> dict[str, Any]:
        fixes = syllabus.points_fixing(points, code)
        target = next((p for p in fixes if not syllabus.unmet_prerequisites(p, stages, points)), None)
        blocked = fixes[0] if (fixes and target is None) else None
        deepest = (
            syllabus.deepest_unmet_prerequisite(blocked.id, stages, points) if blocked else None
        )
        return {
            "code": code,
            "count": count,
            "was": was,
            "from_skills": None,
            "point_id": target.id if target else None,
            "point_title": target.title if target else None,
            "blocked_by_point_id": deepest,
            "blocked_by_title": points[deepest].title if deepest in points else None,
            "drillable": drillable.get(code, 0),
        }

    harvested = practice.harvest(session, profile_id)
    report["costing"] = [_stat(r["code"], int(r["recent"])) for r in report["costing_you"]]
    report["quiet"] = [_stat(r["code"], 0, was=int(r["was"])) for r in report["gone_quiet"]]
    # Shaky and solid are the same rows the Path paints, split on whether the learner has
    # got the point to the rung where it produces rather than recognises.
    report["shaky"] = [
        rows[pid]
        for pid, card in cards.items()
        if pid in rows and (int(card.leech or 0) or int(card.stage) <= 2)
    ]
    report["solid"] = [
        rows[pid]
        for pid, card in cards.items()
        if pid in rows and not int(card.leech or 0) and int(card.stage) >= 4
    ]
    report["harvested"] = [
        {
            "id": f"h_{i}",
            "code": str(code),
            "module": "writing",
            "learner_text": None,
            "fixed_text": None,
            "created_at": report["generated_at"],
            "point_id": (_stat(str(code), 0)["point_id"]),
            "point_title": (_stat(str(code), 0)["point_title"]),
            "wild_failure": False,
        }
        for i, code in enumerate(harvested)
    ]
    report["harvest_available"] = bool(harvested)
    # F15 — the structures the learner now controls. **One row per structure, not per
    # point**: several points teach `passive_any` between them, and a board that listed the
    # slug five times would be answering "which lessons have I opened" when the question is
    # "what can I reach for". The furthest-on point wins the row.
    _RANK = {"unmet": 0, "learning": 1, "controlled": 2, "mastered": 3}
    range_rows: dict[str, dict[str, Any]] = {}
    for point in sorted(points.values(), key=lambda p: p.sequence_index):
        if not point.structure_slug:
            continue
        state = (
            "mastered"
            if point.id in mastered_ids
            else "controlled"
            if int((cards.get(point.id) or _NO_CARD).stage) >= 4
            else "learning"
            if point.id in cards
            else "unmet"
        )
        current = range_rows.get(point.structure_slug)
        if current is not None and _RANK[state] <= _RANK[str(current["state"])]:
            continue
        range_rows[point.structure_slug] = {
            "slug": point.structure_slug,
            "label": point.grammar_name,
            "state": state,
            "point_id": point.id,
            "risk_tier": point.risk_tier,
        }
    report["range"] = list(range_rows.values())
    report["summary"] = {
        "total_points": len(points),
        "started": len(cards),
        "practised": sum(1 for c in cards.values() if int(c.stage) >= 4),
        "mastered": len(mastered_ids),
        "next_point_id": next(
            (row["id"] for row in rows.values() if row.get("is_next_up")), None
        ),
        "due_now": int(report["counts"].get("due_now") or 0),
        "harvested_codes": len(harvested),
        "pace_note": None,
    }
    return report


@router.get("/boards", summary="Every contrast board (F6)")
def list_boards(
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    points = _points(session)
    return {
        "boards": [
            {
                **board,
                # The board is named by the question it settles, not by a pair of
                # grammatical labels: "is the period of time finished?" is what the learner
                # comes back for.
                "question": (points[board["points"][0]].contrast or {}).get("question")
                or board["title"],
                "members": [points[pid].grammar_name for pid in board["points"] if pid in points],
                "accuracy": None,
            }
            for board in syllabus.boards(points)
        ]
    }


@router.get("/boards/{board_id}", summary="One contrast board, with the learner's hit rate")
def get_board(
    board_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    payload = syllabus.board(points, board_id)
    if payload is None:
        raise ApiError(404, "not_found", f"no contrast board with id {board_id!r}")

    cards = bridge.cards_by_point(session, profile_id)
    member_cards = [cards[p["id"]] for p in payload["points"] if p["id"] in cards]
    hits = misses = 0
    if member_cards:
        from bandready.grammar.tables import GrammarReviewLog

        rows = (
            session.execute(
                select(GrammarReviewLog.outcome).where(
                    GrammarReviewLog.card_id.in_([c.id for c in member_cards]),
                    GrammarReviewLog.review_type.in_(("choose_form", "both_ok", "contrast_pair")),
                )
            )
            .scalars()
            .all()
        )
        hits = sum(1 for outcome in rows if outcome in practice.SUCCESS_OUTCOMES)
        misses = len(rows) - hits
    payload["your_record"] = {
        "correct": hits,
        "wrong": misses,
        "line": (
            f"You have got this one right {hits} times out of {hits + misses}."
            if hits + misses
            else "You have not been asked to make this choice yet."
        ),
    }
    payload["practise_url"] = f"/api/v1/grammar/drills?board_id={board_id}"
    payload["accuracy"] = {"correct": hits, "total": hits + misses} if hits + misses else None

    stages = _stages(session, profile_id)
    states = {
        row["id"]: row["state"]
        for row in syllabus.path_states(points, stages, mastered=set())
    }
    fork = {
        str(branch.get("point_id")): str(branch.get("selects") or "")
        for branch in (payload.get("fork") or [])
        if isinstance(branch, dict)
    }
    payload["members"] = [
        {
            "point_id": member["id"],
            "title": member["title"],
            "grammar_name": member["grammar_name"],
            "selects": fork.get(member["id"]),
            "state": states.get(member["id"], "locked"),
        }
        for member in payload["points"]
    ]
    payload["drillable"] = sum(
        1
        for pid in (m["point_id"] for m in payload["members"])
        if pid in points
        for item in points[pid].items
        if int(item.get("stage") or 0) == 3
    )
    return payload


@router.get("/patterns", summary="The sentence-level vocabulary surface (F11)")
def get_patterns(
    q: str | None = None,
    unit_type: str | None = None,
    point_id: str | None = None,
    with_preposition: bool = False,
    limit: int = Query(default=60, ge=1, le=200),
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """``/vocab`` owns the bank; this owns the **sentence**.

    The multi-word chunks and frames, the preposition welded to a word, the near-synonym
    that has to be told apart, and which grammar point each of them lives inside. Nothing
    here duplicates the bank — an entry the learner has opted into shows its own status and
    links straight back to it.

    Read through ``vocab_pack_entries.entry_json``, which is where the v2 payload actually
    lives: ``_opt_in`` copies ten named fields into ``vocab_entries`` and drops the rest
    (D3), so the contexts and the chunk shape are only ever one join away, never in the
    learner's own row.
    """
    profile_id = current_profile_id(session)
    needle = (q or "").strip().lower()
    wanted_types = (
        {t.strip() for t in unit_type.split(",") if t.strip()}
        if unit_type
        else {"chunk", "frame", "collocation"}
    )

    rows = session.execute(
        text(
            "SELECT id, lemma, pos, deck, entry_json FROM vocab_pack_entries "
            "WHERE retired = 0 ORDER BY lemma"
        )
    ).all()

    owned = {
        str(r[0]).strip().lower(): (r[1], r[2])
        for r in session.execute(
            text(
                "SELECT e.headword, e.status, c.due_at FROM vocab_entries e "
                "LEFT JOIN srs_cards c ON c.entry_id = e.id WHERE e.profile_id = :p"
            ),
            {"p": profile_id},
        ).all()
    }

    entries: list[dict[str, Any]] = []
    linked: dict[str, int] = {}
    v2_seen = 0
    for row_id, lemma, pos, _deck, blob in rows:
        try:
            doc = json.loads(blob) if isinstance(blob, str) else (blob or {})
        except (TypeError, ValueError):
            continue
        if int(doc.get("schema_version") or 1) < 2:
            continue
        v2_seen += 1
        for link in doc.get("grammar_links") or []:
            linked[str(link)] = linked.get(str(link), 0) + 1

        if point_id and point_id not in [str(x) for x in (doc.get("grammar_links") or [])]:
            continue
        if str(doc.get("unit_type") or "word") not in wanted_types:
            continue
        chunk = doc.get("chunk") or {}
        if with_preposition and not chunk.get("dependent_preposition"):
            continue
        if needle and needle not in str(lemma).lower() and needle not in str(
            doc.get("definition") or ""
        ).lower():
            continue

        status, due_at = owned.get(str(lemma).strip().lower(), (None, None))
        entries.append(
            {
                "entry_id": str(row_id),
                "headword": doc.get("headword") or lemma,
                "pos": pos,
                "definition": doc.get("definition"),
                "cefr_level": doc.get("cefr_level"),
                "register": doc.get("register"),
                "frequency_band": doc.get("frequency_band"),
                "unit_type": doc.get("unit_type"),
                "chunk": chunk or None,
                "contexts": doc.get("contexts") or [],
                "confusables": doc.get("confusables") or [],
                "grammar_links": doc.get("grammar_links") or [],
                "avoid": doc.get("avoid"),
                "in_bank": status is not None,
                "status": status,
                "due_at": due_at,
            }
        )

    points = syllabus.load_points(session)
    return {
        "entries": entries[:limit],
        "total": len(entries),
        "linked_points": [
            {"id": pid, "title": points[pid].title, "count": count}
            for pid, count in sorted(linked.items(), key=lambda kv: -kv[1])
            if pid in points
        ],
        "v2_available": v2_seen > 0,
    }


@router.post("/rules", summary="Add a line to the learner's own rule sheet (F14)")
def post_rule(
    body: RuleRequest,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """A rule the learner chose to keep, in their own collection.

    Written to ``activity_log`` rather than to a table of its own: the sheet is a list of
    strings the learner curated, it is never joined for correctness, and it is safe to
    prune — which is exactly what that table is for.
    """
    profile_id = current_profile_id(session)
    points = _points(session)
    if body.point_id not in points:
        raise ApiError(404, "not_found", f"no grammar point with id {body.point_id!r}")
    session.execute(
        text(
            "INSERT INTO activity_log (id, profile_id, event_type, ref_kind, ref_id, meta_json) "
            "VALUES (:id, :p, 'grammar_rule', 'grammar_point', :ref, :meta)"
        ),
        {
            "id": f"al_{int(_now().timestamp() * 1000)}_{random.randrange(1 << 20):05x}",
            "p": profile_id,
            "ref": body.point_id,
            "meta": json.dumps(
                {
                    "rule_line": body.rule_line,
                    "learner_sentence": body.learner_sentence,
                    "correction": body.correction,
                },
                ensure_ascii=False,
            ),
        },
    )
    return {"ok": True}


@router.get("/mistakes", summary="Errors harvested from your Writing and Speaking (F8)")
def get_mistakes(
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    points = _points(session)
    codes = practice.harvest(session, profile_id)
    routes = practice.route_codes(codes, points, _stages(session, profile_id))
    return {
        "harvested": codes,
        "recommendations": routes,
        "note": (
            "These come from what you actually wrote and said. A code here means you have "
            "already met the problem, which is the moment instruction lands."
            if routes
            else "Nothing to route yet — do a Writing or Speaking task and check back."
        ),
        "coverage_note": (
            "Codes are inferred from the feedback your Writing and Speaking scorers "
            "already produce. Some errors will not map to a code and are simply not shown."
        ),
    }


@router.get("/drills", summary="A drill of every item carrying one error code (F4)")
def get_drill(
    code: str | None = None,
    board_id: str | None = None,
    size: int = Query(default=12, ge=4, le=30),
    seed: int | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """Assembled by error code **across all points**, which is a far better selector than
    "the present perfect unit" — the learner's problem is rarely confined to one unit.
    """
    if not code and not board_id:
        raise ApiError(422, "validation_error", "code or board_id is required")
    points = _points(session)
    rng = random.Random(seed) if seed is not None else random.Random()

    pool: list[dict[str, Any]] = []
    for point in points.values():
        if board_id and point.board_id != board_id:
            continue
        for item in point.items:
            if board_id and int(item.get("stage") or 0) != 3:
                continue
            if code and code not in [str(c) for c in (item.get("error_codes") or [])]:
                continue
            if str(item.get("kind")) in grading.FREE_PRODUCTION_KINDS:
                continue
            pool.append(
                {
                    "point_id": point.id,
                    "point_title": point.title,
                    "item_id": str(item.get("id")),
                    "kind": str(item.get("kind")),
                    "stage": int(item.get("stage") or 0),
                    "twin_id": item.get("twin_id"),
                    "exercise": practice.public_item(item),
                }
            )
    rng.shuffle(pool)
    items = practice.arrange(pool[:size])
    return {
        "code": code,
        "board_id": board_id,
        "family": practice.CODE_FAMILY.get(code or ""),
        "items": items,
        "size": len(items),
        "note": (
            "Every one of these is the same decision in a different sentence, from "
            "wherever in the course it appears."
        ),
    }


# --------------------------------------------------------------------------------------
# Speaking a produced answer instead of typing it
# --------------------------------------------------------------------------------------


def _speech_tmp_path() -> Path:
    """Scratch file for one recording, deleted in a finally: user voice data has no reason
    to outlive the request that graded it (11 §9 rule 1)."""
    root = Path(tempfile.gettempdir()) / "bandready-speak"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{ULID()}.wav"


@router.post("/answer/spoken", summary="Say a produced answer instead of typing it")
async def post_answer_spoken(
    wav: UploadFile = File(...),
    item_id: str = Form(...),
    point_id: str | None = Form(default=None),
    card_id: str | None = Form(default=None),
    session_id: str | None = Form(default=None),
    attempt: int = Form(default=1),
    elapsed_ms: int | None = Form(default=None),
    session_started_at: str | None = Form(default=None),
    _: None = Depends(require_auth),
    session: Session = Depends(grammar_session),
) -> dict[str, Any]:
    """Transcribe the recording, then run the ordinary answer path with it.

    Everything after the transcription is `post_answer` unchanged: same grader, same rung
    movement, same FSRS write, same log row. `judge_production` already takes a string, and
    its three fairness mechanisms — span-quoting enforcement, two-call confirmation, and
    offline-counts-as-a-pass — are the reason a spoken answer must arrive as a string rather
    than through a parallel path that would reimplement them worse.

    A refused recording never reaches the grader and never touches the card. Silence must not
    cost a learner a rung.
    """
    target = _speech_tmp_path()
    target.write_bytes(await wav.read())
    try:
        spoken = await answers.transcribe_answer(target)
    except answers.SpeechUnavailable as exc:
        raise ApiError(
            503,
            "speech_unavailable",
            "Speech-to-text is not set up on this machine, so a spoken answer cannot be "
            "checked. Type your answer instead, or set up speech in Settings.",
        ) from exc
    finally:
        target.unlink(missing_ok=True)

    if not spoken.gradeable:
        # Not a wrong answer — no grading, no rung change, no log row.
        return {**spoken.as_wire(), "graded": None, "spoken": True}

    graded = await post_answer(
        AnswerRequest(
            item_id=item_id,
            point_id=point_id,
            card_id=card_id,
            session_id=session_id,
            answer=spoken.transcript,
            attempt=attempt,
            elapsed_ms=elapsed_ms,
            session_started_at=session_started_at,
        ),
        None,
        session,
    )
    return {**graded, **spoken.as_wire(), "graded": graded, "spoken": True}
