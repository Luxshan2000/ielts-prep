"""The Full Mock engine — one continuous sitting under exam conditions.

A Full Mock is **not** three practices in a row. Three practices are three chances to
look something up between them; a mock is one unbroken 11–14 minutes in which nobody
helps you, the long turn is cut at two minutes whether or not you were finished, and the
score covers the whole sitting rather than the part you happened to do well in. Those
differences are the entire product value, so all three are enforced here, server-side,
where the renderer cannot negotiate with them.

Four rules run this module.

**1. The sitting is coherent.** Part 3 descends from the Part 2 card that was actually
set — same card set, same lineage — because a Part 3 that does not grow out of the long
turn tests nothing the real exam tests. Part 1 is the exception, and deliberately: a real
Part 1 opens on an obligatory personal frame (work or study, and where you live) that has
nothing to do with the cue card, so :func:`assemble` puts a ``frame_kind == "personal"``
frame first even when it has to borrow one from another set.

**2. The coach is shut for the duration.** :func:`install_exam_conditions_guards` closes
every teaching route while a mock is in progress — model answers, the prep-minute plan,
the language bank, the topic vocabulary, the compare screen. It closes them *even for a
card the learner has already attempted and legitimately unlocked*, because a mock in
which you can read the band-8 answer during the prep minute measures your reading speed.

**3. Time is exam time.** The numbers below are the researched exam shape (R1
§1, §2, §3): Part 1 4–5 min across 2–3 frames, Part 2 exactly 60 s of prep then 60–120 s
of talk with a hard stop at 120, Part 3 4–5 min, whole test 11–14 min. Rounding-off
questions are skipped when the long turn ran to ~115 s or beyond — in the real exam that
is the examiner protecting the clock, and being skipped is neutral-to-positive.

**4. The score is a whole-test score.** Scoring is delegated wholesale to
:mod:`bandready.scoring.speaking`; this module only *frames* the result — evidence
attributed back to the part it was spoken in, a measured part breakdown, and next actions
tied to the specific cards that were sat.

State lives in ``speaking_mocks``, a small side table created on demand (see
:func:`ensure_schema`). It is deliberately not ``practice_sessions.summary_json``:
``voice.runtime.finalize`` overwrites that column wholesale when a live call ends, which
would take the sitting plan with it.
"""

from __future__ import annotations

import functools
import json
import logging
import random
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.server.errors import ApiError
from bandready.speaking import coach
from bandready.timeutil import iso, parse_iso, seconds_since

_log = logging.getLogger("bandready.speaking.mock")

MOCK_SCHEMA_VERSION = 1


# ======================================================================================
# The exam clock (R1 §1–§4). Every number here is a researched fact about the format,
# not a preference — change one and the sitting stops being a rehearsal of the real thing.
# ======================================================================================


@dataclass(frozen=True)
class MockTimings:
    """Per-stage budgets for one sitting, in seconds.

    ``budget`` values are what the plan schedules. ``hard`` values are the only two the
    machine enforces against the candidate: the prep minute is exactly sixty seconds, and
    the long turn is cut at two minutes. Everything else is a soft budget the examiner
    manages, exactly as in the real test.
    """

    #: Part 1 — 4–5 min *including* the greeting and identity check.
    part1_total_s: float = 270.0
    part1_intro_s: float = 25.0

    #: Part 2 — 3–4 min including prep.
    part2_intro_s: float = 25.0       # handing over the card and the instructions
    part2_prep_s: float = 60.0        # HARD, and exactly 60
    part2_talk_min_s: float = 60.0    # soft floor — under this the examiner prompts once
    part2_talk_s: float = 105.0       # what the plan schedules
    part2_talk_max_s: float = 120.0   # HARD stop, mid-sentence if necessary
    part2_rounding_s: float = 40.0    # 1–2 short questions, skippable

    #: Part 3 — 4–5 min of genuine discussion across two (sometimes three) themes.
    part3_total_s: float = 270.0

    wrap_up_s: float = 20.0

    def part1_frame_s(self, frames: int) -> float:
        return max(30.0, (self.part1_total_s - self.part1_intro_s) / max(1, frames))

    def part3_theme_s(self, themes: int) -> float:
        return max(60.0, self.part3_total_s / max(1, themes))


TIMINGS = MockTimings()

#: The whole test, 11–14 min (R1 §1). A plan whose scheduled total falls outside this
#: window is a bug in the budgets above, and :func:`assemble` refuses to hand it out.
EXAM_WINDOW_MIN_S = 660.0
EXAM_WINDOW_MAX_S = 840.0

#: A long turn that reached this mark has consumed Part 2's share of the clock, so the
#: examiner goes straight to Part 3 (R1 §3.4 — examiner-sourced, consistently reported).
ROUNDING_SKIP_AT_S = 115.0

#: Part 1 runs 2–3 topic frames; 3 is the design target (R1 §2).
PART1_FRAMES_MIN = 2
PART1_FRAMES_MAX = 3
PART1_FRAMES_DEFAULT = 3

#: Part 3 covers two, occasionally three, sub-topic areas (R1 §4).
PART3_THEMES_MAX = 3

#: Questions per Part 1 frame the examiner would get through in the time.
PART1_QUESTIONS_MAX = 6
#: One or two rounding-off questions, never more (R1 §3.4).
ROUNDING_QUESTIONS_MAX = 2

#: Difficulty tiers a mock can be requested at. ``challenging`` is the round-2 tier and
#: lives in the set payload's ``challenge_tier``, since ``speaking_cards.difficulty`` is
#: constrained to core/stretch at the schema level.
TIERS: tuple[str, ...] = ("core", "stretch", "challenging")

#: How long an unfinished mock keeps the coach shut. A learner who closed the laptop
#: mid-sitting must not find the teaching layer bricked tomorrow morning.
STALE_AFTER_S = 3 * 3600.0

MOCK_STATUSES: tuple[str, ...] = ("in_progress", "complete", "abandoned")

#: Everything exam conditions withhold, named so the UI can say why a tab is dark.
WITHHELD: tuple[str, ...] = (
    "model_answers",
    "swap_slots",
    "band_move",
    "prep_plan",
    "structure_plan",
    "language_bank",
    "vocabulary",
    "error_watchlist",
    "pronunciation_focus",
    "compare",
)

EXAM_CONDITIONS_MESSAGE = (
    "You are in a mock exam. The coach is closed until the sitting ends — no model "
    "answers, no frames, no vocabulary, no prep plan. That is the point: a mock you can "
    "look things up during measures your reading, not your speaking."
)


# ======================================================================================
# Small helpers
# ======================================================================================


def _round1(value: float) -> float:
    return round(float(value) + 0.0, 1)


def _strings(value: Any, limit: int) -> list[str]:
    out: list[str] = []
    for item in value or []:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


_WS = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^\w\s']+", re.UNICODE)


def _normalise(text: str) -> str:
    """Comparison form for quote anchoring — same shape the scorer's anchor pass uses."""
    return _WS.sub(" ", _NON_WORD.sub(" ", (text or "").lower())).strip()


# ======================================================================================
# Storage
# ======================================================================================

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS speaking_mocks (
        session_id  TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        status      TEXT NOT NULL,
        seed        INTEGER,
        card_set_id TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        doc_json    TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_speaking_mocks_live
        ON speaking_mocks (profile_id, status, created_at)
    """,
)


def ensure_schema(session: Session) -> None:
    """Create the mock side table if it is not there yet.

    Created here rather than in a migration because this module owns the table and
    nothing else reads it; the DDL is idempotent and costs a no-op statement per call.
    A migration should adopt it the next time the schema moves — see the module docstring
    for why ``practice_sessions.summary_json`` was not an option.
    """
    for statement in _DDL:
        session.execute(sa_text(statement))


def _save(session: Session, doc: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(session)
    if doc.get("status") not in MOCK_STATUSES:  # pragma: no cover — a typo'd status
        raise ApiError(500, "internal", f"unknown mock status {doc.get('status')!r}")
    doc["updated_at"] = iso()
    session.execute(
        sa_text(
            "INSERT INTO speaking_mocks "
            "  (session_id, profile_id, status, seed, card_set_id, created_at, updated_at, doc_json) "
            "VALUES (:sid, :pid, :status, :seed, :set_id, :created, :updated, :doc) "
            "ON CONFLICT(session_id) DO UPDATE SET "
            "  status = excluded.status, updated_at = excluded.updated_at, "
            "  doc_json = excluded.doc_json"
        ),
        {
            "sid": doc["session_id"],
            "pid": doc["profile_id"],
            "status": doc["status"],
            "seed": doc.get("seed"),
            "set_id": doc.get("card_set_id"),
            "created": doc["created_at"],
            "updated": doc["updated_at"],
            "doc": json.dumps(doc, ensure_ascii=False),
        },
    )
    return doc


def load(session: Session, session_id: str) -> dict[str, Any]:
    doc = find(session, session_id)
    if doc is None:
        raise ApiError(404, "not_found", f"no mock sitting {session_id!r}")
    return doc


def find(session: Session, session_id: str) -> dict[str, Any] | None:
    ensure_schema(session)
    row = session.execute(
        sa_text("SELECT doc_json FROM speaking_mocks WHERE session_id = :sid"),
        {"sid": session_id},
    ).first()
    if row is None:
        return None
    try:
        doc = json.loads(row[0] or "{}")
    except (TypeError, ValueError):
        return None
    return doc if isinstance(doc, dict) else None


def _live_row(session: Session, profile_id: str) -> dict[str, Any] | None:
    """The one mock that is still in progress and not stale, if there is one."""
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT session_id, created_at, doc_json FROM speaking_mocks "
            "WHERE profile_id = :pid AND status = 'in_progress' "
            "ORDER BY created_at DESC"
        ),
        {"pid": profile_id},
    ).all()
    for session_id, created_at, doc_json in rows:
        if seconds_since(created_at) > STALE_AFTER_S:
            continue
        try:
            doc = json.loads(doc_json or "{}")
        except (TypeError, ValueError):
            continue
        if isinstance(doc, dict):
            doc.setdefault("session_id", session_id)
            return doc
    return None


# ======================================================================================
# Assembly
# ======================================================================================


def _tier_of(set_payload: dict[str, Any]) -> str:
    """``core`` | ``stretch`` | ``challenging`` for one card set."""
    challenge = str(set_payload.get("challenge_tier") or "").strip().lower()
    if challenge == "challenging":
        return "challenging"
    difficulty = str(set_payload.get("difficulty") or "core").strip().lower()
    return difficulty if difficulty in TIERS else "core"


@dataclass(frozen=True)
class _Candidate:
    """One card set that could carry a whole sitting."""

    set_id: str
    title: str
    topic_id: str | None
    tier: str
    family: str | None
    last_served_at: str | None
    part2_card_id: str
    part3_card_id: str
    part1_card_ids: tuple[str, ...]


def _candidates(session: Session, tier: str | None) -> list[_Candidate]:
    """Every card set that can run a coherent sitting, in least-recently-served order.

    Eligibility is structural, not editorial: a set needs a Part 2 card *and* a Part 3
    card, because a mock whose Part 3 does not descend from the long turn is the thing
    this engine exists to stop happening.
    """
    parts: dict[str, dict[int, list[str]]] = {}
    for card_id, set_id, part in session.execute(
        sa_text(
            "SELECT id, card_set_id, part FROM speaking_cards "
            "WHERE retired = 0 AND card_set_id IS NOT NULL ORDER BY part, id"
        )
    ).all():
        parts.setdefault(str(set_id), {}).setdefault(int(part), []).append(str(card_id))

    out: list[_Candidate] = []
    for row in session.execute(
        sa_text(
            "SELECT id, title, topic_id, payload_json, last_served_at FROM card_sets "
            "WHERE retired = 0"
        )
    ).all():
        set_id, title, topic_id, payload_json, last_served_at = row
        by_part = parts.get(str(set_id)) or {}
        if not by_part.get(2) or not by_part.get(3):
            continue
        try:
            payload = json.loads(payload_json or "{}")
        except (TypeError, ValueError):
            payload = {}
        payload = payload if isinstance(payload, dict) else {}
        set_tier = _tier_of(payload)
        if tier and set_tier != tier:
            continue
        # The payload's declared frame order is the author's running order; the table is
        # the fallback for sets that never listed one.
        available = list(by_part.get(1) or [])
        declared = [
            str(cid) for cid in (payload.get("part1_card_ids") or []) if cid in available
        ]
        frame_ids = declared + [cid for cid in available if cid not in declared]

        out.append(
            _Candidate(
                set_id=str(set_id),
                title=str(title or set_id),
                topic_id=str(topic_id) if topic_id else None,
                tier=set_tier,
                family=str(payload.get("family")) if payload.get("family") else None,
                last_served_at=str(last_served_at) if last_served_at else None,
                # The payload's declared ids win when present (they encode the authored
                # lineage); the table is the fallback for sets that never listed them.
                part2_card_id=str(payload.get("part2_card_id") or by_part[2][0]),
                part3_card_id=str(payload.get("part3_card_id") or by_part[3][0]),
                part1_card_ids=tuple(frame_ids),
            )
        )

    # NULL last_served_at (never served) sorts first, exactly as the drill picker does.
    out.sort(key=lambda c: (c.last_served_at is not None, c.last_served_at or "", c.set_id))
    return out


def _choose(candidates: list[_Candidate], seed: int | None) -> _Candidate:
    """Least-recently-served, or a reproducible pick when a seed is given.

    A seeded pick deliberately ignores ``last_served_at``: the whole point of a seed is
    that the same number produces the same sitting tomorrow, and least-recently-served
    order changes every time a mock is taken.
    """
    if seed is None:
        return candidates[0]
    ordered = sorted(candidates, key=lambda c: c.set_id)
    return random.Random(seed).choice(ordered)


def _frame_doc(card: m.SpeakingCard, payload: dict[str, Any]) -> dict[str, Any]:
    """One Part 1 frame, exam layer only."""
    kind = str(payload.get("frame_kind") or "").strip().lower()
    tier = payload.get("frame_tier")
    return {
        "card_id": card.id,
        "card_set_id": card.card_set_id,
        "topic": str(payload.get("topic") or card.title),
        "questions": _strings(payload.get("questions"), PART1_QUESTIONS_MAX),
        "frame_kind": kind if kind in ("personal", "topic") else None,
        "frame_tier": tier if isinstance(tier, int) else None,
    }


def _is_personal(frame: dict[str, Any]) -> bool:
    return frame.get("frame_kind") == "personal" or frame.get("frame_tier") == 1


def _borrow_frames(
    session: Session,
    *,
    want_personal: bool,
    count: int,
    exclude: set[str],
    seed: int | None,
) -> list[dict[str, Any]]:
    """Part 1 frames from elsewhere in the pack.

    Two reasons this exists. A real Part 1 always opens on the personal frame (work or
    study, and where you live), and twelve legacy sets carry no ``frame_kind`` at all —
    so the obligatory frame frequently has to come from another set. And a set that ships
    only two frames still gets the researched three.
    """
    if count <= 0:
        return []
    rows = list(
        session.execute(
            sa_text(
                "SELECT id FROM speaking_cards "
                "WHERE part = 1 AND retired = 0 "
                "ORDER BY (last_served_at IS NOT NULL), last_served_at, id "
                "LIMIT 120"
            )
        )
        .scalars()
        .all()
    )
    pool: list[dict[str, Any]] = []
    for card_id in rows:
        if card_id in exclude:
            continue
        card = session.get(m.SpeakingCard, card_id)
        if card is None:
            continue
        frame = _frame_doc(card, coach.payload_of(card))
        if not frame["questions"]:
            continue
        if _is_personal(frame) != want_personal:
            continue
        pool.append(frame)

    if not pool:
        return []
    if seed is not None:
        pool = sorted(pool, key=lambda f: f["card_id"])
        random.Random(seed).shuffle(pool)
    return pool[:count]


def _part1_frames(
    session: Session,
    candidate: _Candidate,
    *,
    wanted: int,
    seed: int | None,
) -> list[dict[str, Any]]:
    """The frame set for this sitting: personal frame first, then topic frames.

    Part 1 is the one part of a mock that is *not* anchored to the cue card, and that is
    faithful rather than sloppy — in the real exam the opening frame is about the
    candidate's own life and has no relationship to the Part 2 topic at all.
    """
    own: list[dict[str, Any]] = []
    for position, card_id in enumerate(candidate.part1_card_ids):
        card = session.get(m.SpeakingCard, card_id)
        if card is None or card.retired:
            continue
        frame = _frame_doc(card, coach.payload_of(card))
        if frame["questions"]:
            own.append({**frame, "_position": position})
    # Frame tier is the authored running order; sets that predate it keep the order their
    # author listed them in, which is the next best statement of the same intent.
    own.sort(key=lambda f: (f["frame_tier"] or 9, f["_position"]))

    personal = [f for f in own if _is_personal(f)]
    topics = [f for f in own if not _is_personal(f)]
    used = {f["card_id"] for f in own}

    frames: list[dict[str, Any]] = []
    if personal:
        frames.append(personal[0])
        topics = personal[1:] + topics
    else:
        borrowed = _borrow_frames(
            session, want_personal=True, count=1, exclude=used, seed=seed
        )
        frames.extend(borrowed)
        used.update(f["card_id"] for f in borrowed)

    frames.extend(topics)
    if len(frames) < wanted:
        borrowed = _borrow_frames(
            session,
            want_personal=False,
            count=wanted - len(frames),
            exclude=used,
            seed=seed,
        )
        frames.extend(borrowed)
    return [
        {k: v for k, v in frame.items() if not k.startswith("_")}
        for frame in frames[:wanted]
    ]


def _cue_card(card: m.SpeakingCard) -> dict[str, Any]:
    payload = coach.payload_of(card)
    cue = payload.get("cue_card") if isinstance(payload.get("cue_card"), dict) else {}
    return {
        "card_id": card.id,
        "topic": str(cue.get("topic") or payload.get("topic") or card.title),
        "bullets": _strings(cue.get("bullets"), 6),
        "rounding_off": _strings(cue.get("rounding_off"), ROUNDING_QUESTIONS_MAX),
    }


def _themes(card: m.SpeakingCard) -> list[dict[str, Any]]:
    """Part 3 themes, exam layer only.

    ``counterpoint``, ``counter_probe`` and the per-question notes are examiner sparring
    material. They stay out of the plan the client renders — a candidate who can read the
    counterpoint before the question is asked is not being tested on anything.
    """
    payload = coach.payload_of(card)
    out: list[dict[str, Any]] = []
    for theme in payload.get("part3_themes") or []:
        if not isinstance(theme, dict):
            continue
        questions = _strings(theme.get("questions"), 5)
        if not questions:
            continue
        out.append(
            {
                "card_id": card.id,
                "title": str(theme.get("title") or "the topic"),
                "questions": questions,
            }
        )
        if len(out) >= PART3_THEMES_MAX:
            break
    return out


def _stage(
    index: int,
    key: str,
    phase: str,
    part: int | None,
    label: str,
    budget_s: float,
    *,
    card_id: str | None = None,
    content: dict[str, Any] | None = None,
    hard: bool = False,
    min_s: float | None = None,
    max_s: float | None = None,
    skippable: bool = False,
    examiner_silent: bool = False,
) -> dict[str, Any]:
    return {
        "index": index,
        "key": key,
        "phase": phase,
        "part": part,
        "label": label,
        "card_id": card_id,
        "budget_s": _round1(budget_s),
        "hard": hard,
        "min_s": _round1(min_s) if min_s is not None else None,
        "max_s": _round1(max_s) if max_s is not None else None,
        "skippable": skippable,
        "examiner_silent": examiner_silent,
        "content": content or {},
    }


def build_stages(
    frames: list[dict[str, Any]],
    cue: dict[str, Any],
    themes: list[dict[str, Any]],
    timings: MockTimings = TIMINGS,
) -> list[dict[str, Any]]:
    """The sitting as an ordered list of stages, with the exam clock attached."""
    stages: list[dict[str, Any]] = []

    def push(**kwargs: Any) -> None:
        stages.append(_stage(len(stages), **kwargs))

    push(
        key="p1_intro",
        phase="P1_INTRO",
        part=1,
        label="Introduction and identity check",
        budget_s=timings.part1_intro_s,
        content={
            # Procedural moves, not test questions: the candidate's answers here are not
            # rated (R1 §2). The examiner branches on work-or-study before frame 1.
            "moves": ["greeting", "identity_check", "work_or_study_branch"],
        },
    )

    frame_budget = timings.part1_frame_s(len(frames))
    for position, frame in enumerate(frames, start=1):
        push(
            key=f"p1_frame_{position}",
            phase="P1_QA",
            part=1,
            label=f"Part 1 frame {position} — {frame['topic']}",
            budget_s=frame_budget,
            card_id=frame["card_id"],
            content={
                "topic": frame["topic"],
                "questions": frame["questions"],
                "frame_kind": frame["frame_kind"],
                "answer_shape": "short — two to four sentences",
            },
        )

    push(
        key="p2_intro",
        phase="P2_INTRO",
        part=2,
        label="Part 2 — the card is handed over",
        budget_s=timings.part2_intro_s,
        card_id=cue["card_id"],
        content={
            "cue_card": {"topic": cue["topic"], "bullets": cue["bullets"]},
            "moves": ["hand_over_card", "state_one_to_two_minutes", "notes_allowed",
                      "warn_you_will_be_stopped"],
        },
    )
    push(
        key="p2_prep",
        phase="P2_PREP",
        part=2,
        label="One minute to prepare",
        budget_s=timings.part2_prep_s,
        card_id=cue["card_id"],
        hard=True,
        min_s=timings.part2_prep_s,
        max_s=timings.part2_prep_s,
        examiner_silent=True,
        content={
            "cue_card": {"topic": cue["topic"], "bullets": cue["bullets"]},
            "notes_allowed": True,
            # No idea prompt, no note grid, no target language. Those belong to the Topic
            # Coach, and the coach is shut.
            "coaching": None,
        },
    )
    push(
        key="p2_long_turn",
        phase="P2_LONG_TURN",
        part=2,
        label="The long turn",
        budget_s=timings.part2_talk_s,
        card_id=cue["card_id"],
        hard=True,
        min_s=timings.part2_talk_min_s,
        max_s=timings.part2_talk_max_s,
        examiner_silent=True,
        content={
            "cue_card": {"topic": cue["topic"], "bullets": cue["bullets"]},
            "hard_stop_s": timings.part2_talk_max_s,
            "note": (
                "The examiner will not speak, back-channel or prompt. Being stopped at "
                "two minutes is normal and carries no penalty."
            ),
        },
    )
    push(
        key="p2_rounding",
        phase="P2_ROUNDING",
        part=2,
        label="Rounding-off questions",
        budget_s=timings.part2_rounding_s,
        card_id=cue["card_id"],
        skippable=True,
        content={
            "questions": cue["rounding_off"][:ROUNDING_QUESTIONS_MAX],
            "answer_shape": "one or two sentences",
            "skip_rule": (
                f"skipped when the long turn reached {ROUNDING_SKIP_AT_S:.0f}s — being "
                "skipped is neutral-to-positive"
            ),
        },
    )

    theme_budget = timings.part3_theme_s(len(themes))
    for position, theme in enumerate(themes, start=1):
        push(
            key=f"p3_theme_{position}",
            phase="P3_DISCUSS",
            part=3,
            label=f"Part 3 theme {position} — {theme['title']}",
            budget_s=theme_budget,
            card_id=theme["card_id"],
            content={
                "title": theme["title"],
                "questions": theme["questions"],
                "answer_shape": "extended and analytical — 30 to 60 seconds",
            },
        )

    push(
        key="wrap_up",
        phase="WRAP_UP",
        part=None,
        label="End of the test",
        budget_s=timings.wrap_up_s,
        content={"moves": ["close_the_test"]},
    )
    return stages


def _plan_timing(stages: list[dict[str, Any]]) -> dict[str, Any]:
    by_part: dict[str, float] = {}
    for stage in stages:
        key = str(stage["part"]) if stage["part"] else "wrap"
        by_part[key] = by_part.get(key, 0.0) + float(stage["budget_s"])
    total = sum(by_part.values())
    return {
        "total_s": _round1(total),
        "by_part_s": {k: _round1(v) for k, v in sorted(by_part.items())},
        "exam_window_s": [EXAM_WINDOW_MIN_S, EXAM_WINDOW_MAX_S],
        "within_exam_window": EXAM_WINDOW_MIN_S <= total <= EXAM_WINDOW_MAX_S,
        "part2_prep_s": TIMINGS.part2_prep_s,
        "part2_talk_range_s": [TIMINGS.part2_talk_min_s, TIMINGS.part2_talk_max_s],
        "rounding_skip_at_s": ROUNDING_SKIP_AT_S,
    }


def assemble(
    session: Session,
    *,
    seed: int | None = None,
    card_set_id: str | None = None,
    difficulty: str | None = None,
    frames: int = PART1_FRAMES_DEFAULT,
    stamp: bool = True,
    timings: MockTimings = TIMINGS,
) -> dict[str, Any]:
    """Build one coherent sitting. Pure apart from the least-recently-served stamp."""
    tier = (difficulty or "").strip().lower() or None
    if tier and tier not in TIERS:
        raise ApiError(
            422, "validation_error", f"difficulty must be one of {', '.join(TIERS)}"
        )
    wanted = max(PART1_FRAMES_MIN, min(PART1_FRAMES_MAX, int(frames)))

    pool = _candidates(session, tier)
    if card_set_id:
        pool = [c for c in pool if c.set_id == card_set_id]
        if not pool:
            raise ApiError(
                404,
                "not_found",
                f"card set {card_set_id!r} cannot carry a mock — it needs a Part 2 card "
                "and a Part 3 card that descends from it",
            )
    if not pool:
        raise ApiError(
            422,
            "validation_error",
            f"no card set can carry a mock at difficulty {tier!r} — the pack has none "
            "with both a Part 2 and a Part 3 card at that tier",
        )

    candidate = _choose(pool, seed)
    part2 = session.get(m.SpeakingCard, candidate.part2_card_id)
    part3 = session.get(m.SpeakingCard, candidate.part3_card_id)
    if part2 is None or part3 is None:
        raise ApiError(500, "internal", f"card set {candidate.set_id!r} lost a card")

    cue = _cue_card(part2)
    themes = _themes(part3)
    if not cue["bullets"] or not themes:
        raise ApiError(
            422,
            "validation_error",
            f"card set {candidate.set_id!r} has no usable cue card or Part 3 themes",
        )

    frame_docs = _part1_frames(session, candidate, wanted=wanted, seed=seed)
    if len(frame_docs) < PART1_FRAMES_MIN:
        raise ApiError(
            422,
            "validation_error",
            "the pack does not hold enough Part 1 frames to open a mock",
        )

    stages = build_stages(frame_docs, cue, themes, timings)
    timing = _plan_timing(stages)
    if not timing["within_exam_window"]:  # pragma: no cover — a budget regression
        raise ApiError(
            500,
            "internal",
            f"the assembled sitting runs {timing['total_s']}s, outside the 11–14 minute "
            "exam window",
        )

    if stamp:
        _stamp_served(session, candidate.set_id, [f["card_id"] for f in frame_docs]
                      + [part2.id, part3.id])

    return {
        "card_set_id": candidate.set_id,
        "card_set_title": candidate.title,
        "topic_id": candidate.topic_id,
        "difficulty": candidate.tier,
        "family": candidate.family,
        "seed": seed,
        "part1_card_ids": [f["card_id"] for f in frame_docs],
        "part2_card_id": part2.id,
        "part3_card_id": part3.id,
        "part2_topic": cue["topic"],
        "borrowed_part1_card_ids": [
            f["card_id"] for f in frame_docs if f["card_set_id"] != candidate.set_id
        ],
        "stages": stages,
        "timing": timing,
        "frames": len(frame_docs),
        "themes": len(themes),
    }


def _stamp_served(session: Session, set_id: str, card_ids: list[str]) -> None:
    """Least-recently-served bookkeeping, so a repeat mock is a different sitting."""
    stamp = iso()
    session.execute(
        sa_text("UPDATE card_sets SET last_served_at = :at WHERE id = :sid"),
        {"at": stamp, "sid": set_id},
    )
    for card_id in {c for c in card_ids if c}:
        session.execute(
            sa_text("UPDATE speaking_cards SET last_served_at = :at WHERE id = :cid"),
            {"at": stamp, "cid": card_id},
        )


# ======================================================================================
# The sitting: create, read, advance
# ======================================================================================


def create(
    session: Session,
    profile_id: str,
    *,
    seed: int | None = None,
    card_set_id: str | None = None,
    difficulty: str | None = None,
    frames: int = PART1_FRAMES_DEFAULT,
) -> dict[str, Any]:
    """Assemble a sitting and open it. One in-progress mock per learner, by design."""
    install_exam_conditions_guards()
    ensure_schema(session)

    existing = _live_row(session, profile_id)
    if existing is not None:
        raise ApiError(
            409,
            "conflict",
            f"mock sitting {existing['session_id']} is still in progress — finish it, or "
            "POST …/abandon, before starting another",
        )

    plan = assemble(
        session,
        seed=seed,
        card_set_id=card_set_id,
        difficulty=difficulty,
        frames=frames,
    )

    session_id = f"ss_{ULID()}"
    started = iso()
    doc: dict[str, Any] = {
        "schema_version": MOCK_SCHEMA_VERSION,
        "session_id": session_id,
        "profile_id": profile_id,
        "status": "in_progress",
        "created_at": started,
        "updated_at": started,
        "started_at": started,
        "finished_at": None,
        "cursor": 0,
        "log": [{"index": 0, "key": plan["stages"][0]["key"],
                 "part": plan["stages"][0]["part"], "started_at": started,
                 "ended_at": None, "duration_s": None, "skipped": False,
                 "skip_reason": None, "hard_stopped": False}],
        **plan,
    }
    doc["card_ids"] = [
        *doc["part1_card_ids"],
        doc["part2_card_id"],
        doc["part3_card_id"],
    ]

    session.add(
        m.PracticeSession(
            id=session_id,
            profile_id=profile_id,
            module="speaking",
            activity="full_mock",
            started_at=started,
        )
    )
    session.add(
        m.SpeakingSession(
            id=session_id,
            mode="mock",
            part=None,
            card_set_id=doc["card_set_id"],
            state=plan["stages"][0]["phase"],
            status="active",
        )
    )
    _save(session, doc)
    return doc


def _stage_at(doc: dict[str, Any], index: int) -> dict[str, Any] | None:
    stages = doc.get("stages") or []
    return stages[index] if 0 <= index < len(stages) else None


def current_stage(doc: dict[str, Any]) -> dict[str, Any] | None:
    if doc.get("status") != "in_progress":
        return None
    return _stage_at(doc, int(doc.get("cursor") or 0))


def view(doc: dict[str, Any]) -> dict[str, Any]:
    """What ``GET /mock/sessions/{id}`` answers: where we are, and what comes next."""
    stages = doc.get("stages") or []
    stage = current_stage(doc)
    entry = (doc.get("log") or [])[-1] if doc.get("log") else None
    elapsed = seconds_since(entry.get("started_at")) if stage is not None and entry else 0.0
    budget = float(stage["budget_s"]) if stage else 0.0
    hard_cap = stage.get("max_s") if stage else None

    completed = [e for e in (doc.get("log") or []) if e.get("ended_at")]
    spent = sum(float(e.get("duration_s") or 0.0) for e in completed)

    upcoming = _stage_at(doc, int(doc.get("cursor") or 0) + 1) if stage else None
    return {
        "session_id": doc["session_id"],
        "status": doc["status"],
        "stale": doc["status"] == "in_progress" and seconds_since(doc.get("created_at")) > STALE_AFTER_S,
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "sitting": sitting_header(doc),
        "stage": (
            {
                **stage,
                "elapsed_s": _round1(elapsed),
                "remaining_s": _round1(max(0.0, budget - elapsed)),
                "over_budget": elapsed > budget,
                "hard_stop_due": bool(hard_cap is not None and elapsed >= float(hard_cap)),
            }
            if stage
            else None
        ),
        "next": (
            {k: upcoming[k] for k in ("index", "key", "phase", "part", "label")}
            if upcoming
            else None
        ),
        "progress": {
            "stage_index": int(doc.get("cursor") or 0),
            "stages_total": len(stages),
            "stages_done": len(completed),
            "elapsed_s": _round1(spent + elapsed),
            "planned_total_s": doc.get("timing", {}).get("total_s"),
        },
        "timing": doc.get("timing"),
        "exam_conditions": {
            "active": doc["status"] == "in_progress",
            "coaching_available": False,
            "withheld": list(WITHHELD),
            "message": EXAM_CONDITIONS_MESSAGE,
        },
        "log": doc.get("log") or [],
    }


def sitting_header(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "card_set_id": doc.get("card_set_id"),
        "card_set_title": doc.get("card_set_title"),
        "topic_id": doc.get("topic_id"),
        "difficulty": doc.get("difficulty"),
        "family": doc.get("family"),
        "seed": doc.get("seed"),
        "part2_topic": doc.get("part2_topic"),
        "part1_card_ids": doc.get("part1_card_ids") or [],
        "part2_card_id": doc.get("part2_card_id"),
        "part3_card_id": doc.get("part3_card_id"),
        "borrowed_part1_card_ids": doc.get("borrowed_part1_card_ids") or [],
        "frames": doc.get("frames"),
        "themes": doc.get("themes"),
    }


def advance(
    session: Session,
    session_id: str,
    *,
    elapsed_s: float | None = None,
    skip: bool = False,
) -> dict[str, Any]:
    """Close the current stage and open the next one.

    ``elapsed_s`` is the measured length of the stage that just ended. The renderer sends
    it because it owns the audio clock; when it is omitted the wall clock since the stage
    opened is used instead. Two rules fire here and nowhere else:

    * a long turn is recorded as no longer than 120 s — the examiner stopped it;
    * a long turn that reached ~115 s consumes the rounding-off questions, which are
      marked skipped rather than silently dropped.
    """
    doc = load(session, session_id)
    if doc.get("status") != "in_progress":
        raise ApiError(
            409, "conflict", f"this mock is {doc.get('status')} — there is nothing to advance"
        )
    stage = current_stage(doc)
    log: list[dict[str, Any]] = doc.get("log") or []
    if stage is None or not log:  # pragma: no cover — cursor corruption
        raise ApiError(500, "internal", "this mock has lost its stage cursor")

    entry = log[-1]
    measured = (
        float(elapsed_s) if elapsed_s is not None else seconds_since(entry.get("started_at"))
    )
    measured = max(0.0, measured)

    hard_stopped = False
    cap = stage.get("max_s")
    if cap is not None and measured > float(cap):
        hard_stopped = True
        measured = float(cap)

    now = iso()
    entry["ended_at"] = now
    entry["duration_s"] = _round1(measured)
    entry["hard_stopped"] = hard_stopped
    entry["budget_s"] = stage["budget_s"]

    next_index = int(doc["cursor"]) + 1
    events: list[dict[str, Any]] = []

    if stage["key"] == "p2_long_turn":
        entry["reached_min"] = measured >= float(stage.get("min_s") or 0.0)
        following = _stage_at(doc, next_index)
        if (
            following is not None
            and following["key"] == "p2_rounding"
            and measured >= ROUNDING_SKIP_AT_S
        ):
            reason = (
                f"the long turn ran to {_round1(measured)}s; Part 2 has used its share of "
                "the clock, so the examiner goes straight to Part 3"
            )
            log.append(
                {
                    "index": following["index"],
                    "key": following["key"],
                    "part": following["part"],
                    "started_at": now,
                    "ended_at": now,
                    "duration_s": 0.0,
                    "skipped": True,
                    "skip_reason": reason,
                    "hard_stopped": False,
                }
            )
            events.append({"type": "rounding_off_skipped", "detail": reason})
            next_index += 1

    if skip:
        following = _stage_at(doc, next_index)
        if following is None or not following.get("skippable"):
            raise ApiError(
                422,
                "validation_error",
                "only the rounding-off questions may be skipped by the examiner",
            )
        log.append(
            {
                "index": following["index"],
                "key": following["key"],
                "part": following["part"],
                "started_at": now,
                "ended_at": now,
                "duration_s": 0.0,
                "skipped": True,
                "skip_reason": "skipped by the examiner",
                "hard_stopped": False,
            }
        )
        events.append({"type": "rounding_off_skipped", "detail": "skipped by the examiner"})
        next_index += 1

    following = _stage_at(doc, next_index)
    if following is None:
        doc["cursor"] = len(doc["stages"])
        doc["status"] = "complete"
        doc["finished_at"] = now
        _close_session_row(session, doc)
        events.append({"type": "sitting_finished", "detail": "the test is over"})
    else:
        doc["cursor"] = next_index
        log.append(
            {
                "index": following["index"],
                "key": following["key"],
                "part": following["part"],
                "started_at": now,
                "ended_at": None,
                "duration_s": None,
                "skipped": False,
                "skip_reason": None,
                "hard_stopped": False,
            }
        )
        row = session.get(m.SpeakingSession, session_id)
        if row is not None and row.status == "active":
            row.state = following["phase"]

    doc["log"] = log
    _save(session, doc)
    return {**view(doc), "events": events}


def abandon(session: Session, session_id: str) -> dict[str, Any]:
    """End a sitting without finishing it — and reopen the coach."""
    doc = load(session, session_id)
    if doc.get("status") == "in_progress":
        doc["status"] = "abandoned"
        doc["finished_at"] = iso()
        entry = (doc.get("log") or [])[-1] if doc.get("log") else None
        if entry is not None and entry.get("ended_at") is None:
            entry["ended_at"] = doc["finished_at"]
            entry["duration_s"] = _round1(seconds_since(entry.get("started_at")))
        _close_session_row(session, doc, status="aborted")
        _save(session, doc)
    return view(doc)


def _close_session_row(
    session: Session, doc: dict[str, Any], status: str = "complete"
) -> None:
    """Close the envelope so the sitting shows up in history and can be scored.

    A live WebRTC mock is closed by ``voice.runtime.finalize`` instead; this only fills in
    what a headless sitting would otherwise leave open, and never overwrites a transcript
    or a status the runtime already wrote.
    """
    session_id = doc["session_id"]
    row = session.get(m.SpeakingSession, session_id)
    if row is not None and row.status == "active":
        row.state = "WRAP_UP" if status == "complete" else "ABORTED"
        # Leave `status` alone when a transcript is still expected from the runtime: the
        # scorer refuses an empty sitting, and `runtime.finalize` is the one writer that
        # knows whether any speech arrived.
        if row.transcript_json:
            row.status = status
    envelope = session.get(m.PracticeSession, session_id)
    if envelope is not None and envelope.ended_at is None:
        envelope.ended_at = doc.get("finished_at") or iso()
        envelope.duration_s = int(
            max(0.0, (parse_iso(envelope.ended_at) - parse_iso(envelope.started_at)).total_seconds())
            if parse_iso(envelope.started_at) and parse_iso(envelope.ended_at)
            else 0
        )


# ======================================================================================
# Exam conditions — the rule that makes a mock mean anything
# ======================================================================================


def exam_conditions(session: Session | None = None, profile_id: str | None = None) -> dict[str, Any] | None:
    """The in-progress mock holding the coach shut, or ``None``.

    Takes the caller's session when it has one and opens its own read scope when it does
    not — :func:`coach.structure_plan` has no session in its signature, and the guard has
    to answer for it anyway.
    """
    if session is not None:
        pid = profile_id
        if pid is None:
            from bandready.server.deps import current_profile_id

            pid = current_profile_id(session)
        doc = _live_row(session, pid)
        return None if doc is None else _conditions(doc)

    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id

    try:
        with session_scope() as scoped:
            pid = profile_id or current_profile_id(scoped)
            doc = _live_row(scoped, pid)
            return None if doc is None else _conditions(doc)
    except Exception:  # noqa: BLE001 — the guard must never break a coach request
        _log.debug("exam-conditions lookup failed", exc_info=True)
        return None


def _conditions(doc: dict[str, Any]) -> dict[str, Any]:
    stage = current_stage(doc)
    return {
        "active": True,
        "session_id": doc["session_id"],
        "started_at": doc.get("started_at"),
        "stage": stage["key"] if stage else None,
        "part": stage["part"] if stage else None,
        "card_set_id": doc.get("card_set_id"),
        "withheld": list(WITHHELD),
        "message": EXAM_CONDITIONS_MESSAGE,
    }


def locked_gate(conditions: dict[str, Any]) -> dict[str, Any]:
    """The gate state the coach reports during a mock: shut, and saying why."""
    return {
        "unlocked": False,
        "reason": "exam_conditions",
        "attempts": 0,
        "last_attempt_session_id": None,
        "gated_fields": list(coach.GATED_FIELDS),
        "message": EXAM_CONDITIONS_MESSAGE,
        "mock_session_id": conditions["session_id"],
    }


def locked_teaching_payload(card: Any, conditions: dict[str, Any]) -> dict[str, Any]:
    """The teaching document during a mock: the card's identity and nothing taught.

    Built here rather than by stripping :func:`coach.teaching_payload` so that no
    coaching field is ever *computed*, let alone serialised — the shape stays compatible
    with the unlocked document so the client renders the same screen with dark tabs.
    """
    payload = coach.payload_of(card)
    try:
        schema_version = int(payload.get("schema_version") or 1)
    except (TypeError, ValueError):
        schema_version = 1
    return {
        "card_id": card.id,
        "part": card.part,
        "card_set_id": card.card_set_id,
        "topic_id": card.topic_id,
        "topic": str(payload.get("topic") or card.title)[:600],
        "title": card.title,
        "difficulty": card.difficulty,
        "schema_version": schema_version,
        "tags": [],
        "teaching_available": False,
        "set": None,
        "band_move": None,
        "tense_focus": None,
        "examiner_note": None,
        "bridge": None,
        "transfer_drill": None,
        "functional_language": {"warning": None, "targeted": [], "functions": []},
        "vocabulary": [],
        "structure_plan": None,
        "questions": None,
        "themes": None,
        "common_errors": [],
        "pronunciation_focus": None,
        "model_answer_bands": [],
        "model_answers": [],
        "swap_slots": [],
        "exam_conditions": conditions,
    }


def _refuse(conditions: dict[str, Any]) -> ApiError:
    return ApiError(
        409,
        "conflict",
        f"{EXAM_CONDITIONS_MESSAGE} (sitting {conditions['session_id']})",
    )


_GUARD_FLAG = "__bandready_mock_guard__"


def install_exam_conditions_guards() -> bool:
    """Close every coach entry point for the duration of a mock. Idempotent.

    The coach package is not this agent's to edit, so the rule is installed by wrapping
    :mod:`bandready.speaking.coach`'s public entry points at import time. The route module
    resolves them by attribute on every call, so the wrap takes effect regardless of
    import order. The wrappers are pure pass-throughs whenever no mock is in progress,
    which is the overwhelmingly common case.

    The right long-term home for this is two lines inside ``coach.gate_state`` itself;
    until that lands, this is the enforcement, and it is server-side.
    """
    if getattr(coach.gate_state, _GUARD_FLAG, False):
        return False

    original_gate = coach.gate_state
    original_teaching = coach.teaching_payload
    original_plan = coach.structure_plan
    original_vocab = coach.vocabulary_for_set
    original_bank = coach.language_bank
    original_compare = coach.compare_answer

    @functools.wraps(original_gate)
    def gate_state(session: Any, profile_id: str, card: Any, *, attested: bool = False) -> dict[str, Any]:
        conditions = exam_conditions(session, profile_id)
        if conditions is not None:
            return locked_gate(conditions)
        return original_gate(session, profile_id, card, attested=attested)

    @functools.wraps(original_teaching)
    def teaching_payload(session: Any, card: Any, *, unlocked: bool) -> dict[str, Any]:
        conditions = exam_conditions(session)
        if conditions is not None:
            return locked_teaching_payload(card, conditions)
        return original_teaching(session, card, unlocked=unlocked)

    @functools.wraps(original_plan)
    def structure_plan(card: Any, teaching: dict[str, Any]) -> dict[str, Any] | None:
        conditions = exam_conditions()
        if conditions is not None:
            raise _refuse(conditions)
        return original_plan(card, teaching)

    @functools.wraps(original_vocab)
    def vocabulary_for_set(session: Any, card_set_id: str) -> dict[str, Any]:
        conditions = exam_conditions(session)
        if conditions is not None:
            raise _refuse(conditions)
        return original_vocab(session, card_set_id)

    @functools.wraps(original_bank)
    def language_bank(session: Any, **kwargs: Any) -> dict[str, Any]:
        conditions = exam_conditions(session)
        if conditions is not None:
            raise _refuse(conditions)
        return original_bank(session, **kwargs)

    @functools.wraps(original_compare)
    async def compare_answer(session: Any, card: Any, transcript: str, band_target: int) -> dict[str, Any]:
        conditions = exam_conditions(session)
        if conditions is not None:
            raise _refuse(conditions)
        return await original_compare(session, card, transcript, band_target)

    for wrapper in (
        gate_state, teaching_payload, structure_plan,
        vocabulary_for_set, language_bank, compare_answer,
    ):
        setattr(wrapper, _GUARD_FLAG, True)

    coach.gate_state = gate_state
    coach.teaching_payload = teaching_payload
    coach.structure_plan = structure_plan
    coach.vocabulary_for_set = vocabulary_for_set
    coach.language_bank = language_bank
    coach.compare_answer = compare_answer
    _log.info("exam-conditions guards installed over the speaking coach")
    return True


# ======================================================================================
# Whole-test scoring
# ======================================================================================

PART_LABELS = {1: "Part 1 — interview", 2: "Part 2 — long turn", 3: "Part 3 — discussion"}

WHOLE_TEST_NOTE = (
    "This is one band set for the whole sitting, which is how the real test is rated — "
    "there is no Part 2 score. The breakdown below is measured evidence of where you "
    "were strongest and weakest, not four separate marks."
)

#: A comfortable examiner-facing speech rate; the distance from it is the fluency signal.
TARGET_WPM = 140.0


def _turns_of(session: Session, session_id: str) -> list[dict[str, Any]]:
    row = session.get(m.SpeakingSession, session_id)
    if row is None:
        return []
    record = coach.loads(row.transcript_json, {})
    turns = record.get("turns") if isinstance(record, dict) else None
    return [t for t in (turns or []) if isinstance(t, dict)]


_PHASE_PART = {
    "P1_INTRO": 1, "P1_QA": 1,
    "P2_INTRO": 2, "P2_PREP": 2, "P2_LONG_TURN": 2, "P2_ROUNDING": 2,
    "P3_DISCUSS": 3,
}


def _part_of(turn: dict[str, Any]) -> int | None:
    part = turn.get("part")
    if part in (1, 2, 3):
        return int(part)
    return _PHASE_PART.get(str(turn.get("phase") or ""))


def _candidate_text_by_part(turns: list[dict[str, Any]]) -> dict[int, list[str]]:
    out: dict[int, list[str]] = {1: [], 2: [], 3: []}
    for turn in turns:
        if turn.get("role") != "user":
            continue
        part = _part_of(turn)
        text = str(turn.get("text") or "").strip()
        if part in out and text:
            out[part].append(text)
    return out


#: Roughly what a band-7 candidate produces in each part: ten short Part 1 answers, a
#: two-minute long turn, and four or five extended Part 3 answers. Used only to notice
#: when a part supplied far less evidence than it asked for.
EXPECTED_WORDS = {1: 130, 2: 220, 3: 200}

#: Floor under the "is there anything here to read" test. The real bar is proportional —
#: fifteen words is one Part 1 answer but a collapsed long turn — so it scales with what
#: the part asked for. Below the bar no index is offered, because a flattering number
#: computed from three careful sentences is worse than saying there was nothing to read.
MIN_ASSESSABLE_WORDS = 25


def _assessable_bar(part: int) -> int:
    return max(MIN_ASSESSABLE_WORDS, round(EXPECTED_WORDS.get(part, 180) * 0.15))


def _strength_index(
    part: int, part_metrics: dict[str, Any], words: int, text: str, errors: int
) -> float | None:
    """A measured 0–100 signal for one part. Explicitly **not** a band.

    Six observable things, weighted: how close the speech rate sits to a comfortable
    examiner-facing pace, how much of the part was silence, how thick the filled pauses
    were, how varied the vocabulary was, how many of the scorer's error quotes landed in
    this part, and how much the candidate actually produced against what the part asked
    for. That last term matters: fifteen careful words are not a strong Part 1, and
    Fluency & Coherence is built around willingness to speak at length.

    Every input is counted, not judged, so this number never argues with the examiner's
    bands — it only says where the evidence behind them was thinnest.
    """
    if words < _assessable_bar(part):
        return None
    wpm = float(part_metrics.get("wpm") or 0.0)
    pause_ratio = float(part_metrics.get("pause_ratio") or 0.0)
    fillers_pm = float(part_metrics.get("fillers_per_min") or 0.0)

    pace = 1.0 - min(1.0, abs(wpm - TARGET_WPM) / 80.0) if wpm > 0 else 0.4
    flow = 1.0 - min(1.0, pause_ratio / 0.45)
    clean = 1.0 - min(1.0, fillers_pm / 12.0)

    tokens = [t for t in _normalise(text).split() if len(t) > 2]
    variety = min(1.0, (len(set(tokens)) / len(tokens)) / 0.55) if tokens else 0.0
    accuracy = 1.0 - min(1.0, errors / 5.0)
    coverage = min(1.0, words / float(EXPECTED_WORDS.get(part, 180)))

    score = (
        0.25 * pace
        + 0.15 * flow
        + 0.10 * clean
        + 0.20 * variety
        + 0.15 * accuracy
        + 0.15 * coverage
    )
    return round(max(0.0, min(1.0, score)) * 100, 1)


#: A near-quote has to share at least this many consecutive words with what was actually
#: said before it is attributed to a part. Below it, "the candidate said something like
#: this here" stops being a claim anyone can check.
MIN_ANCHOR_RUN = 4


def _attribute(quote: str, by_part: dict[int, str]) -> int | None:
    """Which part a scorer's quote was spoken in, by anchoring it in that part's text.

    Exact containment first. Failing that, the longest run of consecutive words the quote
    shares with each part — examiners' evidence lines are frequently near-quotes ("I am
    agree with this idea" for "I am agree with the idea"), and dropping those would empty
    the breakdown of exactly the evidence it exists to place. A tie between two parts
    attributes to neither, because a quote that fits both places nothing.
    """
    needle = _normalise(quote)
    head = _normalise(quote.split("—")[0])
    for part, haystack in by_part.items():
        if needle and needle in haystack:
            return part
        if head and len(head) > 8 and head in haystack:
            return part

    tokens = (head or needle).split()
    if len(tokens) < MIN_ANCHOR_RUN:
        return None
    best_part: int | None = None
    best_run = MIN_ANCHOR_RUN - 1
    tied = False
    for part, haystack in by_part.items():
        run = _longest_run(tokens, haystack)
        if run > best_run:
            best_part, best_run, tied = part, run, False
        elif run == best_run and best_part is not None:
            tied = True
    return None if tied else best_part


def _longest_run(tokens: list[str], haystack: str) -> int:
    """Longest run of consecutive ``tokens`` appearing verbatim in ``haystack``."""
    if not haystack:
        return 0
    best = 0
    for start in range(len(tokens)):
        for end in range(len(tokens), start + best, -1):
            if " ".join(tokens[start:end]) in haystack:
                best = end - start
                break
    return best


def _timing_report(doc: dict[str, Any]) -> dict[str, Any]:
    """Actual per-stage durations against the plan — requirement 3's other half."""
    by_part: dict[str, float] = {}
    stages: list[dict[str, Any]] = []
    long_turn: float | None = None
    rounding_skipped = False
    hard_stopped = False
    for entry in doc.get("log") or []:
        duration = float(entry.get("duration_s") or 0.0)
        key = str(entry.get("part")) if entry.get("part") else "wrap"
        by_part[key] = by_part.get(key, 0.0) + duration
        stages.append(
            {
                "key": entry.get("key"),
                "part": entry.get("part"),
                "planned_s": entry.get("budget_s"),
                "actual_s": entry.get("duration_s"),
                "skipped": bool(entry.get("skipped")),
                "skip_reason": entry.get("skip_reason"),
                "hard_stopped": bool(entry.get("hard_stopped")),
            }
        )
        if entry.get("key") == "p2_long_turn":
            long_turn = duration
            hard_stopped = bool(entry.get("hard_stopped"))
        if entry.get("key") == "p2_rounding" and entry.get("skipped"):
            rounding_skipped = True

    total = sum(by_part.values())
    return {
        "stages": stages,
        "actual_by_part_s": {k: _round1(v) for k, v in sorted(by_part.items())},
        "actual_total_s": _round1(total),
        "planned_total_s": doc.get("timing", {}).get("total_s"),
        "within_exam_window": EXAM_WINDOW_MIN_S <= total <= EXAM_WINDOW_MAX_S,
        "long_turn_s": _round1(long_turn) if long_turn is not None else None,
        "long_turn_hard_stopped": hard_stopped,
        "long_turn_reached_min": (
            long_turn >= TIMINGS.part2_talk_min_s if long_turn is not None else None
        ),
        "rounding_off_skipped": rounding_skipped,
    }


def _card_actions(session: Session, doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Next actions tied to the cards actually sat — not generic band advice.

    Read straight from each card's authored teaching payload, which is safe now and only
    now: the sitting is over, so this is the debrief rather than a hint.
    """
    actions: list[dict[str, Any]] = []

    part2 = session.get(m.SpeakingCard, doc.get("part2_card_id") or "")
    if part2 is not None:
        teaching = coach.teaching_of(part2)
        move = str(teaching.get("band_move") or "").strip()
        if move:
            actions.append(
                {
                    "action": move,
                    "card_id": part2.id,
                    "part": 2,
                    "source": "the long turn you sat",
                    "topic": doc.get("part2_topic"),
                }
            )
        watchlist = [w for w in (teaching.get("error_watchlist") or []) if isinstance(w, dict)]
        if watchlist:
            top = watchlist[0]
            right, wrong = str(top.get("right") or "").strip(), str(top.get("wrong") or "").strip()
            if right and wrong:
                why = str(top.get("why") or "").strip()
                actions.append(
                    {
                        "action": f'Say "{right}", not "{wrong}"' + (f" — {why}" if why else ""),
                        "card_id": part2.id,
                        "part": 2,
                        "source": "the error this card provokes",
                        "criterion": str(top.get("criterion") or "").upper() or None,
                    }
                )
        drill = str(teaching.get("transfer_drill") or "").strip()
        if drill:
            actions.append(
                {
                    "action": drill,
                    "card_id": part2.id,
                    "part": 2,
                    "source": "transfer drill for this card",
                }
            )

    part3 = session.get(m.SpeakingCard, doc.get("part3_card_id") or "")
    if part3 is not None:
        move = str(coach.teaching_of(part3).get("band_move") or "").strip()
        if move:
            actions.append(
                {
                    "action": move,
                    "card_id": part3.id,
                    "part": 3,
                    "source": "the discussion you sat",
                }
            )
    return actions


def _next_actions(
    session: Session,
    doc: dict[str, Any],
    report: dict[str, Any],
    weakest: int | None,
) -> list[dict[str, Any]]:
    criteria = report.get("criteria") or {}
    bands = {
        key: block.get("band")
        for key, block in criteria.items()
        if isinstance(block, dict) and block.get("band") is not None
    }
    actions: list[dict[str, Any]] = []
    if bands:
        lowest = min(bands, key=lambda k: bands[k])
        improvements = (criteria.get(lowest) or {}).get("improvements") or []
        if improvements:
            actions.append(
                {
                    "action": str(improvements[0]),
                    "card_id": None,
                    "part": weakest,
                    "criterion": lowest.upper(),
                    "source": f"your weakest criterion this sitting (band {bands[lowest]})",
                }
            )

    seen = {a["action"] for a in actions}
    for action in _card_actions(session, doc):
        if action["action"] in seen:
            continue
        seen.add(action["action"])
        actions.append(action)
    return actions[:4]


def part_breakdown(
    session: Session,
    doc: dict[str, Any],
    report: dict[str, Any],
    metrics: dict[str, Any],
) -> tuple[list[dict[str, Any]], int | None, int | None]:
    """Where the candidate was strongest and weakest, with evidence from each part."""
    turns = _turns_of(session, doc["session_id"])
    text_by_part = _candidate_text_by_part(turns)
    haystacks = {part: _normalise(" ".join(lines)) for part, lines in text_by_part.items()}

    evidence: dict[int, list[dict[str, str]]] = {1: [], 2: [], 3: []}
    for key, block in (report.get("criteria") or {}).items():
        if not isinstance(block, dict):
            continue
        for quote in block.get("evidence") or []:
            part = _attribute(str(quote), haystacks)
            if part in evidence:
                evidence[part].append({"criterion": key.upper(), "quote": str(quote)})

    errors: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: []}
    for error in report.get("errors") or []:
        if not isinstance(error, dict):
            continue
        part = _attribute(str(error.get("quote") or ""), haystacks)
        if part in errors:
            errors[part].append(error)

    best_moments: dict[int, list[str]] = {1: [], 2: [], 3: []}
    for moment in report.get("best_moments") or []:
        part = _attribute(str(moment), haystacks)
        if part in best_moments:
            best_moments[part].append(str(moment))

    parts_metrics = (metrics.get("parts") or {}) if isinstance(metrics, dict) else {}
    cards_by_part = {
        1: list(doc.get("part1_card_ids") or []),
        2: [doc.get("part2_card_id")],
        3: [doc.get("part3_card_id")],
    }

    rows: list[dict[str, Any]] = []
    for part in (1, 2, 3):
        lines = text_by_part[part]
        joined = " ".join(lines)
        words = len(joined.split())
        part_metrics = parts_metrics.get(str(part)) or {}
        index = _strength_index(part, part_metrics, words, joined, len(errors[part]))
        rows.append(
            {
                "part": part,
                "label": PART_LABELS[part],
                "cards": [c for c in cards_by_part[part] if c],
                "turns": len(lines),
                "words": words,
                "metrics": {
                    k: part_metrics.get(k)
                    for k in ("wpm", "articulation_wpm", "pause_ratio",
                              "long_pause_count", "fillers_per_min",
                              "mean_length_of_run_words")
                },
                "evidence": evidence[part][:4],
                "best_moments": best_moments[part][:3],
                "errors": errors[part][:4],
                "strength_index": index,
                "assessable_from_words": _assessable_bar(part),
                "verdict": (
                    "too little speech here to read anything from" if index is None
                    else "strong" if index >= 70
                    else "solid" if index >= 55
                    else "this is where the evidence thinned out"
                ),
            }
        )

    scored = [r for r in rows if r["strength_index"] is not None]
    strongest = max(scored, key=lambda r: r["strength_index"])["part"] if len(scored) > 1 else None
    weakest = min(scored, key=lambda r: r["strength_index"])["part"] if len(scored) > 1 else None
    return rows, strongest, weakest


async def score(session_id: str, *, force: bool = False) -> dict[str, Any]:
    """Score the whole sitting. Scoring itself belongs to ``scoring/speaking.py``.

    This function finalises the sitting, delegates, then frames the result as a whole-test
    report: the overall band recomputed once more through ``round_ielts`` so nothing but
    this server ever decides it, evidence attributed to the part it was spoken in, and
    next actions naming the cards that were actually sat.
    """
    from bandready.db.engine import session_scope
    from bandready.scoring.speaking import evaluate_session, recompute_overall, round_ielts
    from bandready.voice import runtime

    live = runtime.get(session_id)
    if live is not None and not live.ended:
        # Scoring reads the persisted transcript, so the call has to be torn down first.
        await runtime.finalize(session_id)

    with session_scope() as s:
        doc = load(s, session_id)
        if doc.get("status") == "in_progress":
            doc["status"] = "complete"
            doc["finished_at"] = iso()
            entry = (doc.get("log") or [])[-1] if doc.get("log") else None
            if entry is not None and entry.get("ended_at") is None:
                entry["ended_at"] = doc["finished_at"]
                entry["duration_s"] = _round1(seconds_since(entry.get("started_at")))
            _save(s, doc)
        row = s.get(m.SpeakingSession, session_id)
        if row is not None and row.status == "active" and row.transcript_json:
            row.status = "complete"
            row.state = "WRAP_UP"

    report = await evaluate_session(session_id, force=force)

    with session_scope() as s:
        doc = load(s, session_id)
        metrics = report.get("metrics") or {}
        rows, strongest, weakest = part_breakdown(s, doc, report, metrics)
        actions = _next_actions(s, doc, report, weakest)
        _close_session_row(s, doc)

    # R2-4 once more, in this module's own words: the overall band is the mean of the
    # criterion bands through round_ielts, and nothing else is ever shown.
    recomputed = recompute_overall(report.get("criteria") or {})
    overall = round_ielts(recomputed) if recomputed is not None else None

    return {
        **report,
        "overall_band": overall,
        "scored_as": "whole_test",
        "whole_test_note": WHOLE_TEST_NOTE,
        "sitting": {
            **sitting_header(doc),
            "status": doc.get("status"),
            "started_at": doc.get("started_at"),
            "finished_at": doc.get("finished_at"),
            "timing": _timing_report(doc),
        },
        "part_breakdown": rows,
        "strongest_part": strongest,
        "weakest_part": weakest,
        "strength_index_note": (
            "A measured signal (pace, silence, filled pauses, lexical variety, errors "
            "anchored to that part, and how much you actually produced) — not a band. "
            "IELTS does not score parts separately."
        ),
        "next_actions": actions,
    }


# ======================================================================================
# History — the mock trajectory the Progress screen plots
# ======================================================================================


def history(session: Session, profile_id: str, *, limit: int = 25) -> dict[str, Any]:
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mk.session_id, mk.status, mk.created_at, mk.doc_json, "
            "       ss.overall_band, ss.card_set_id, ps.started_at, ps.ended_at, ps.duration_s "
            "FROM speaking_mocks mk "
            "LEFT JOIN speaking_sessions ss ON ss.id = mk.session_id "
            "LEFT JOIN practice_sessions ps ON ps.id = mk.session_id "
            "WHERE mk.profile_id = :pid "
            "ORDER BY mk.created_at DESC LIMIT :limit"
        ),
        {"pid": profile_id, "limit": int(limit)},
    ).all()

    items: list[dict[str, Any]] = []
    for row in rows:
        try:
            doc = json.loads(row.doc_json or "{}")
        except (TypeError, ValueError):
            doc = {}
        log = doc.get("log") or []
        items.append(
            {
                "session_id": row.session_id,
                "status": row.status,
                "started_at": row.started_at or doc.get("started_at"),
                "ended_at": row.ended_at or doc.get("finished_at"),
                "duration_s": row.duration_s,
                "overall_band": row.overall_band,
                "card_set_id": row.card_set_id or doc.get("card_set_id"),
                "card_set_title": doc.get("card_set_title"),
                "part2_topic": doc.get("part2_topic"),
                "difficulty": doc.get("difficulty"),
                "family": doc.get("family"),
                "seed": doc.get("seed"),
                "stages_done": len([e for e in log if e.get("ended_at")]),
                "stages_total": len(doc.get("stages") or []),
                "long_turn_s": next(
                    (e.get("duration_s") for e in log if e.get("key") == "p2_long_turn"), None
                ),
                "rounding_off_skipped": any(
                    e.get("key") == "p2_rounding" and e.get("skipped") for e in log
                ),
            }
        )

    scored = [i for i in items if i["overall_band"] is not None]
    trajectory = [
        {"session_id": i["session_id"], "at": i["ended_at"] or i["started_at"],
         "overall_band": i["overall_band"]}
        for i in reversed(scored)
    ]
    latest = scored[0]["overall_band"] if scored else None
    first = scored[-1]["overall_band"] if scored else None
    return {
        "items": items,
        "count": len(items),
        "trajectory": trajectory,
        "scored": len(scored),
        "latest_band": latest,
        "best_band": max((i["overall_band"] for i in scored), default=None),
        "delta": (
            round(float(latest) - float(first), 1)
            if latest is not None and first is not None and len(scored) > 1
            else None
        ),
    }


__all__ = [
    "EXAM_CONDITIONS_MESSAGE",
    "EXAM_WINDOW_MAX_S",
    "EXAM_WINDOW_MIN_S",
    "PART1_FRAMES_MAX",
    "PART1_FRAMES_MIN",
    "ROUNDING_SKIP_AT_S",
    "TIERS",
    "TIMINGS",
    "WITHHELD",
    "MockTimings",
    "abandon",
    "advance",
    "assemble",
    "build_stages",
    "create",
    "ensure_schema",
    "exam_conditions",
    "find",
    "history",
    "install_exam_conditions_guards",
    "load",
    "locked_gate",
    "locked_teaching_payload",
    "part_breakdown",
    "score",
    "sitting_header",
    "view",
]
