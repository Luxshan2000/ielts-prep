"""The 60-minute Reading Mock — three passages, forty questions, one clock.

A reading mock is **not** three passage practices in a row. Three practices are three
clocks, three submits and a break in between; the real paper is one hour in which the
candidate is handed the whole booklet and has to decide, alone and under pressure, how
much of that hour each passage deserves. Almost everybody decides wrongly, and the way
they decide wrongly is specific: passage 1 is the cheapest and gets the most time, and
passage 3 — the hardest and the most expensive per mark — gets whatever is left.

Five rules run this module.

**1. One sitting, three passages, forty questions, free allocation.** Every passage is
visible from minute zero and the learner may work them in any order. The allocation is
the lesson, so hiding a passage would remove the trap the mock exists to teach.

**2. There is no transfer time.** Unlike Listening, Reading gives no extra minutes at the
end to write answers up — the most under-taught operational fact in the paper. Our player
is computer-delivered so the risk does not exist here; a candidate sitting the paper test
needs to know it exists there, which is why the briefing says it once, before the clock
starts, and the coach never mentions it again.

**3. The coach is shut for the duration.** :func:`exam_conditions` closes the whole
teaching layer while a sitting is open — worked solutions, evidence spans, paraphrase
links, trap labels, strategy cards, the skim plan, vocabulary mining and the dictionary —
*even for a passage the learner attempted and legitimately unlocked last week*. A mock
you can look things up during measures your reading speed with help, which is not a
thing the exam measures. The refusal happens server-side, in
:mod:`bandready.reading.coach`, where the renderer cannot negotiate with it. Words the
learner clicks are queued silently to a "looked up later" list and shown in the report.

**4. The clock is a single hour.** Sixty minutes for the three; the 16/20/22 (Academic)
or 15/18/25 (General Training) split is a *target*, not an enforcement. Per-passage time
is attributed silently from the autosave stream and never shown during the sitting —
showing it would coach the very decision being measured.

**5. One submit, marked deterministically.** Marking is delegated wholesale to the
existing player: :mod:`bandready.server.routes.reading` flattens the same scorables, runs
the same shared normalizer at :mod:`bandready.scoring.answers`, writes the same
``reading_answers`` rows and converts raw to band through the same published tables. What
this module adds is the sitting: the assembly, the clock, the exam conditions, and a
report that leads with pacing because pacing is the decision, then raw score, then band.

The band conversion is where Academic and General Training genuinely differ, and the
difference is worth teaching rather than hiding: **30/40 is band 7.0 on Academic and band
6.0 on General Training.** The same raw score, a full band apart, because GT's texts are
easier and the standard compensates.

State lives in ``reading_mocks``, a small side table created on demand (see
:func:`ensure_schema`). The sitting itself is an ordinary ``reading_attempts`` row in
``mode: "exam"`` sharing the sitting's id, so every existing autosave, submit, review and
"why was I wrong" surface keeps working on it unchanged — and so a finished mock opens
the coach's gate on all three of its passages, which is exactly the behaviour wanted.
"""

from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.reading import coach
from bandready.scoring.answers import expand_variants, word_limit_of
from bandready.server.errors import ApiError
from bandready.timeutil import iso, parse_iso, seconds_since

_log = logging.getLogger("bandready.reading.mock")

MOCK_SCHEMA_VERSION = 1


# ======================================================================================
# The format. Every number here is a fact about the paper, not a preference.
# ======================================================================================


@dataclass(frozen=True)
class MockTimings:
    """The sitting's budget, in seconds.

    ``total_s`` is the only figure enforced, and softly: at zero the clock inverts and
    counts up. Nothing is snatched away mid-sentence — the real paper does end at sixty
    minutes, but a mock that deletes your last answer teaches panic, and overtime is far
    more useful recorded and shown in the report.
    """

    total_s: float = 3600.0
    sweep_at_s: float = 3480.0  # 58:00 — stop answering, sweep the palette
    question_cap_s: float = 120.0  # the two-minute rule, per question


TIMINGS = MockTimings()

MODULES: tuple[str, ...] = ("academic", "general_training")
QUESTIONS_PER_TEST = 40
PASSAGES_PER_TEST = 3

MOCK_STATUSES: tuple[str, ...] = ("in_progress", "complete", "abandoned")

#: How long an unfinished sitting keeps the coach shut. A learner who closed the laptop
#: mid-mock must not find the teaching layer bricked tomorrow morning.
STALE_AFTER_S = 4 * 3600.0

#: Everything exam conditions withhold, named so the UI can say why a panel is dark.
WITHHELD: tuple[str, ...] = (
    "worked_solutions",
    "accepted_answers",
    "evidence_quotes",
    "explanations",
    "paraphrase_links",
    "decision_rules",
    "distractor_analysis",
    "trap_labels",
    "reusable_rules",
    "strategy_cards",
    "skim_plan",
    "paraphrase_families",
    "hinge_words",
    "vocabulary_mining",
    "dictionary",
    "why_wrong",
    "review",
    "drills",
    "generation",
    "pacing_hints",
    "confidence_tagging",
)

EXAM_CONDITIONS_MESSAGE = (
    "You are in a reading mock. The coach is closed until you submit — no worked "
    "solutions, no evidence spans, no strategy cards, no dictionary. That is the point: "
    "a mock you can look things up during measures your reading with help, which is not "
    "something the exam measures. Words you click are saved for afterwards."
)

BRIEFING_TITLE = "Before you start"

#: Said once, before the clock starts, and never again.
BRIEFING: tuple[str, ...] = (
    coach.NO_TRANSFER_TIME,
    coach.TWO_MINUTE_RULE,
    coach.NEVER_BLANK,
    (
        "Highlights and notes stay on — computer-delivered IELTS has them, and fidelity cuts "
        "both ways. The dictionary does not: every word you click is queued silently and "
        "shown to you after you submit."
    ),
    "Leaving the sitting needs an explicit confirmation, and the clock does not pause.",
)

#: What makes a test sittable at all. Failing either of these is a 422, not a warning:
#: a sitting whose numbering is broken cannot be marked out of forty.
HARD_CHECKS: tuple[str, ...] = ("three_passages", "numbers_contiguous")
#: Reported and sat anyway. A generated test may be short of forty, and a learner who
#: knows the paper is 37 questions long can still use it.
SOFT_CHECKS: tuple[str, ...] = ("forty_questions", "distinct_topics", "format_matches")


# ======================================================================================
# Small helpers
# ======================================================================================


def _minutes(seconds: float) -> float:
    return round(float(seconds) / 60.0, 1)


# ======================================================================================
# Storage
# ======================================================================================

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS reading_mocks (
        mock_id     TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        status      TEXT NOT NULL,
        seed        INTEGER,
        module      TEXT,
        test_id     TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        doc_json    TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_reading_mocks_live
        ON reading_mocks (profile_id, status, created_at)
    """,
)


def ensure_schema(session: Session) -> None:
    """Create the mock side table if it is not there yet.

    Created here rather than in a migration because this module owns the table and
    nothing else reads it; the DDL is idempotent and costs a no-op statement per call.
    ``reading_attempts.state_json`` was not an option: the sitting has to be findable by
    profile and status without parsing every attempt in the database, and the clock
    attribution belongs to the sitting rather than to the attempt.
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
            "INSERT INTO reading_mocks "
            "  (mock_id, profile_id, status, seed, module, test_id, created_at, "
            "   updated_at, doc_json) "
            "VALUES (:mid, :pid, :status, :seed, :module, :test, :created, :updated, :doc) "
            "ON CONFLICT(mock_id) DO UPDATE SET "
            "  status = excluded.status, updated_at = excluded.updated_at, "
            "  doc_json = excluded.doc_json"
        ),
        {
            "mid": doc["mock_id"],
            "pid": doc["profile_id"],
            "status": doc["status"],
            "seed": doc.get("seed"),
            "module": doc.get("module"),
            "test": doc.get("test_id"),
            "created": doc["created_at"],
            "updated": doc["updated_at"],
            "doc": json.dumps(doc, ensure_ascii=False),
        },
    )
    return doc


def find(session: Session, mock_id: str) -> dict[str, Any] | None:
    ensure_schema(session)
    row = session.execute(
        sa_text("SELECT doc_json FROM reading_mocks WHERE mock_id = :mid"),
        {"mid": mock_id},
    ).first()
    if row is None:
        return None
    try:
        doc = json.loads(row[0] or "{}")
    except (TypeError, ValueError):
        return None
    return doc if isinstance(doc, dict) else None


def load(session: Session, mock_id: str) -> dict[str, Any]:
    doc = find(session, mock_id)
    if doc is None:
        raise ApiError(404, "not_found", f"no reading mock {mock_id!r}")
    return doc


def _live_row(session: Session, profile_id: str) -> dict[str, Any] | None:
    """The one sitting that is still open and not stale, if there is one."""
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, created_at, doc_json FROM reading_mocks "
            "WHERE profile_id = :pid AND status = 'in_progress' "
            "ORDER BY created_at DESC"
        ),
        {"pid": profile_id},
    ).all()
    for mock_id, created_at, doc_json in rows:
        if seconds_since(created_at) > STALE_AFTER_S:
            continue
        try:
            doc = json.loads(doc_json or "{}")
        except (TypeError, ValueError):
            continue
        if isinstance(doc, dict):
            doc.setdefault("mock_id", mock_id)
            return doc
    return None


# ======================================================================================
# Assembly
# ======================================================================================


@dataclass(frozen=True)
class _Candidate:
    """One test that could be sat."""

    test_id: str
    title: str
    fmt: str
    passage_ids: tuple[str, str, str]
    last_sat_at: str | None


def _last_sat(session: Session, profile_id: str) -> dict[str, str]:
    """When this learner last sat each test.

    ``reading_tests`` carries no ``last_served_at`` column, so least-recently-served is
    derived from the learner's own history rather than from a global counter — the better
    signal anyway. Handing back the paper somebody sat on Tuesday is the thing to avoid,
    and whether another profile saw it is beside the point.
    """
    rows = session.execute(
        sa_text(
            "SELECT ra.test_id, MAX(ps.started_at) FROM reading_attempts ra "
            "JOIN practice_sessions ps ON ps.id = ra.id "
            "WHERE ps.profile_id = :pid AND ra.test_id IS NOT NULL "
            "GROUP BY ra.test_id"
        ),
        {"pid": profile_id},
    ).all()
    return {str(test_id): str(seen) for test_id, seen in rows if seen}


def _candidates(session: Session, profile_id: str, module: str) -> list[_Candidate]:
    """Every live test of one module, in least-recently-served order."""
    seen = _last_sat(session, profile_id)
    rows = session.execute(
        sa_text(
            "SELECT id, title, format, p1_id, p2_id, p3_id FROM reading_tests "
            "WHERE retired = 0 AND format = :fmt ORDER BY id"
        ),
        {"fmt": module},
    ).all()
    out = [
        _Candidate(
            test_id=str(row[0]),
            title=str(row[1] or row[0]),
            fmt=str(row[2]),
            passage_ids=(str(row[3]), str(row[4]), str(row[5])),
            last_sat_at=seen.get(str(row[0])),
        )
        for row in rows
    ]
    # Never-sat tests sort first, then the oldest, exactly as the writing mock does.
    out.sort(key=lambda c: (c.last_sat_at is not None, c.last_sat_at or "", c.test_id))
    return out


def _passage_docs(
    session: Session, passage_ids: tuple[str, ...]
) -> list[tuple[Any, dict[str, Any]]]:
    out: list[tuple[Any, dict[str, Any]]] = []
    for passage_id in passage_ids:
        row = session.get(m.ReadingPassage, passage_id)
        if row is None:
            continue
        out.append((row, coach.document(row)))
    return out


def _numbers_of(doc: dict[str, Any]) -> list[int]:
    numbers: list[int] = []
    for _gi, _group, question in coach.iter_questions(doc):
        try:
            numbers.append(int(question.get("number")))
        except (TypeError, ValueError):
            continue
    return numbers


def inspect(session: Session, candidate: _Candidate) -> dict[str, Any]:
    """Everything the assembler needs to know about one test, checks included.

    Question numbers are the check that matters. They run 1–40 contiguously across the
    whole test rather than restarting per passage, and a paper that breaks that cannot be
    marked out of forty — so it is refused rather than sat and quietly mis-scored.
    """
    loaded = _passage_docs(session, candidate.passage_ids)
    numbers: list[int] = []
    passages: list[dict[str, Any]] = []
    topics: list[str] = []
    formats_match = True

    for position, (row, doc) in enumerate(loaded, start=1):
        own = sorted(_numbers_of(doc))
        numbers.extend(own)
        teaching = coach.passage_teaching(doc)
        authored = teaching.get("time_budget_min")
        try:
            authored_min = int(authored) if authored is not None else None
        except (TypeError, ValueError):
            authored_min = None
        topic = str(doc.get("topic") or row.topic_id or "").strip().lower()
        if topic:
            topics.append(topic)
        if row.format != candidate.fmt:
            formats_match = False
        passages.append(
            {
                "position": position,
                "passage_id": row.id,
                "title": row.title,
                "topic": doc.get("topic"),
                "topic_id": row.topic_id,
                "gt_section": doc.get("gt_section"),
                "difficulty": doc.get("difficulty"),
                "word_count": row.word_count,
                "band_target": row.band_target,
                "questions": len(own),
                "first_number": own[0] if own else None,
                "last_number": own[-1] if own else None,
                "question_types": sorted(
                    {
                        str(g.get("type"))
                        for g in (doc.get("question_groups") or [])
                        if isinstance(g, dict) and g.get("type")
                    }
                ),
                **coach.pacing_for(candidate.fmt, position, authored_min),
            }
        )

    ordered = sorted(numbers)
    contiguous = bool(ordered) and ordered == list(range(1, len(ordered) + 1))
    checks = {
        "three_passages": len(loaded) == PASSAGES_PER_TEST
        and len({p["passage_id"] for p in passages}) == PASSAGES_PER_TEST,
        "numbers_contiguous": contiguous,
        "forty_questions": len(ordered) == QUESTIONS_PER_TEST,
        "distinct_topics": len(set(topics)) == len(topics),
        "format_matches": formats_match,
    }
    warnings: list[str] = []
    if not checks["forty_questions"]:
        warnings.append(
            f"this paper carries {len(ordered)} questions rather than 40 — the band is "
            "projected onto the 40-question scale and is an estimate"
        )
    if not checks["distinct_topics"]:
        warnings.append(
            "two of the three passages share a topic, so one set of background knowledge "
            "serves both — less discriminating than a real paper"
        )
    if not checks["format_matches"]:
        warnings.append(
            "a passage's format does not match the test's; it is sat as the test's module"
        )

    return {
        "test_id": candidate.test_id,
        "title": candidate.title,
        "format": candidate.fmt,
        "last_sat_at": candidate.last_sat_at,
        "passages": passages,
        "question_count": len(ordered),
        "checks": checks,
        "warnings": warnings,
        "sittable": all(checks[name] for name in HARD_CHECKS),
    }


def assemble(
    session: Session,
    profile_id: str,
    *,
    module: str = "academic",
    seed: int | None = None,
    test_id: str | None = None,
) -> dict[str, Any]:
    """Build one sittable paper. Pure — it reads history and writes nothing.

    Unseeded, the pool arrives least-recently-served first and the first sittable test
    wins, so a repeat mock is a different paper. Seeded, the pool is shuffled by the seed
    instead, because the whole point of a seed is that the same number produces the same
    paper tomorrow, and least-recently-served order changes every time a mock is sat.
    """
    wanted = (module or "academic").strip().lower()
    if wanted not in MODULES:
        raise ApiError(422, "validation_error", f"module must be one of {', '.join(MODULES)}")

    pool = _candidates(session, profile_id, wanted)
    if test_id:
        pool = [c for c in pool if c.test_id == test_id]
        if not pool:
            raise ApiError(
                404,
                "not_found",
                f"reading test {test_id!r} is not a live {wanted} test",
            )
    if not pool:
        raise ApiError(
            422,
            "validation_error",
            f"the pack cannot open a {wanted} reading mock — it carries no live "
            f"{wanted} test",
        )
    if seed is not None:
        shuffled = sorted(pool, key=lambda c: c.test_id)
        random.Random(seed).shuffle(shuffled)
        pool = shuffled

    rejected: list[dict[str, Any]] = []
    for candidate in pool:
        plan = inspect(session, candidate)
        if plan["sittable"]:
            return {
                "module": wanted,
                "seed": seed,
                "test_id": plan["test_id"],
                "title": plan["title"],
                "format": plan["format"],
                "duration_s": TIMINGS.total_s,
                "question_count": plan["question_count"],
                "passages": plan["passages"],
                "coherence": {
                    "checks": plan["checks"],
                    "warnings": plan["warnings"],
                    "hard_checks": list(HARD_CHECKS),
                    "soft_checks": list(SOFT_CHECKS),
                    "rejected": rejected,
                },
                "pacing": coach.pacing_plan(wanted),
                "briefing": {"title": BRIEFING_TITLE, "points": list(BRIEFING)},
            }
        rejected.append(
            {
                "test_id": plan["test_id"],
                "failed": [name for name in HARD_CHECKS if not plan["checks"][name]],
            }
        )

    failures = ", ".join(
        f"{entry['test_id']} ({'; '.join(entry['failed'])})" for entry in rejected
    )
    raise ApiError(
        422,
        "validation_error",
        f"no live {wanted} reading test can be sat as a mock: {failures}. A sitting needs "
        "three passages whose question numbers run 1..N without a gap.",
    )


# ======================================================================================
# The sitting: create, read, autosave
# ======================================================================================


def create(
    session: Session,
    profile_id: str,
    *,
    module: str = "academic",
    seed: int | None = None,
    test_id: str | None = None,
) -> dict[str, Any]:
    """Assemble a paper and open the sitting. One in-progress mock per learner, by design.

    The sitting *is* a ``reading_attempts`` row in ``mode: "exam"``, sharing the sitting's
    id. That is deliberate and load-bearing: the existing marker, review screen and "why
    was I wrong" all key off an attempt id, so a finished mock is reviewable through
    surfaces that know nothing about mocks, and it opens the coach's gate on all three of
    its passages because it genuinely is a submitted attempt on each of them.
    """
    ensure_schema(session)

    existing = _live_row(session, profile_id)
    if existing is not None:
        raise ApiError(
            409,
            "conflict",
            f"reading mock {existing['mock_id']} is still in progress — submit it, or "
            "POST …/abandon, before starting another",
        )

    plan = assemble(session, profile_id, module=module, seed=seed, test_id=test_id)

    mock_id = f"rm_{ULID()}"
    started = iso()
    total = int(plan["question_count"])

    session.add(
        m.PracticeSession(
            id=mock_id,
            profile_id=profile_id,
            module="reading",
            activity="reading_mock",
            started_at=started,
        )
    )
    session.flush()
    state = {
        "mode": "full",
        "exam_conditions": True,
        "answers": {},
        "flags": [],
        "highlights": [],
        "notes": {},
        "looked_up": [],
        "timer_s": TIMINGS.total_s,
        "timer_start_s": TIMINGS.total_s,
        "total_questions": total,
        "mock_id": mock_id,
    }
    session.add(
        m.ReadingAttempt(
            id=mock_id,
            test_id=plan["test_id"],
            passage_id=None,
            mode="exam",
            status="in_progress",
            total_questions=total,
            state_json=json.dumps(state, ensure_ascii=False),
        )
    )
    session.flush()

    doc: dict[str, Any] = {
        "schema_version": MOCK_SCHEMA_VERSION,
        "mock_id": mock_id,
        "attempt_id": mock_id,
        "profile_id": profile_id,
        "status": "in_progress",
        "created_at": started,
        "updated_at": started,
        "started_at": started,
        "finished_at": None,
        "clock": {
            "seconds_elapsed": 0.0,
            "active_position": 1,
            "passage_seconds": {p["passage_id"]: 0.0 for p in plan["passages"]},
            "attributed": False,
            "last_patch_at": started,
        },
        "report": None,
        **plan,
    }
    _save(session, doc)
    return doc


def clock_view(doc: dict[str, Any]) -> dict[str, Any]:
    """The single hour, as the top bar renders it.

    ``passage_seconds`` is deliberately **not** in here. It is tracked from the first
    autosave and reported the moment the sitting ends, but showing it during the hour
    would coach the exact decision the mock exists to measure.
    """
    clock = doc.get("clock") or {}
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    total = float(doc.get("duration_s") or TIMINGS.total_s)
    remaining = total - elapsed
    return {
        "duration_s": total,
        "seconds_elapsed": round(elapsed, 1),
        "remaining_s": round(remaining, 1),
        # Past zero the countdown inverts and counts up rather than snatching the paper
        # away; overtime is recorded and shown in the report.
        "overtime_s": round(max(0.0, -remaining), 1),
        "expired": remaining <= 0,
        "sweep_at_s": TIMINGS.sweep_at_s,
        "sweep_due": elapsed >= TIMINGS.sweep_at_s,
        "active_position": int(clock.get("active_position") or 1),
        # No transfer time: the clock the learner sees is the whole paper.
        "transfer_time_s": 0,
    }


def _attempt(session: Session, doc: dict[str, Any]) -> m.ReadingAttempt:
    row = session.get(m.ReadingAttempt, doc.get("attempt_id") or doc["mock_id"])
    if row is None:  # pragma: no cover — created with the sitting
        raise ApiError(500, "internal", f"reading mock {doc['mock_id']} has lost its attempt")
    return row


def exam_document(session: Session, doc: dict[str, Any]) -> list[dict[str, Any]]:
    """The three passages as the sitting shows them: no key, and no teaching.

    Two strippers, composed, and both are needed. ``_strip_key`` removes the answers,
    explanations, trap notes and evidence quotes the player already knows to hide.
    :func:`coach.strip_teaching` removes the teaching objects at passage, group and
    question level, which post-date it: the strategy card, the skim plan, the paraphrase
    links and the trap slugs are **absent from the response**, not hidden behind a
    renderer flag, so there is nothing to reveal with a devtools toggle.
    """
    from bandready.server.routes.reading import _passage_doc, _passage_row, _strip_key

    out: list[dict[str, Any]] = []
    for position, entry in enumerate(doc.get("passages") or [], start=1):
        row = _passage_row(session, entry["passage_id"])
        payload = coach.strip_teaching(_strip_key(_passage_doc(row)))
        payload["position"] = position
        out.append(payload)
    return out


def view(session: Session, doc: dict[str, Any], *, include_passages: bool = True) -> dict[str, Any]:
    """What ``GET /mock/sessions/{id}`` answers: the paper, the clock, the saved state."""
    attempt = session.get(m.ReadingAttempt, doc.get("attempt_id") or doc["mock_id"])
    state = coach.loads(attempt.state_json, {}) if attempt is not None else {}
    live = doc.get("status") == "in_progress"
    return {
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "status": doc.get("status"),
        "module": doc.get("module"),
        "format": doc.get("format"),
        "seed": doc.get("seed"),
        "test_id": doc.get("test_id"),
        "title": doc.get("title"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "question_count": doc.get("question_count"),
        "clock": clock_view(doc),
        "passage_meta": doc.get("passages"),
        "passages": exam_document(session, doc) if include_passages else None,
        "coherence": doc.get("coherence"),
        "pacing": doc.get("pacing"),
        "briefing": doc.get("briefing"),
        "answers_included": False,
        "resume_state": {
            "answers": state.get("answers") or {},
            "flags": state.get("flags") or [],
            "highlights": state.get("highlights") or [],
            "notes": state.get("notes") or {},
            "looked_up": state.get("looked_up") or [],
        },
        "exam_conditions": _conditions(doc) if live else None,
        "report": doc.get("report"),
    }


@dataclass(frozen=True)
class MockPatch:
    """One autosave from the player."""

    answers: dict[str, Any] | None = None
    flags: list[int] | None = None
    highlights: list[dict[str, Any]] | None = None
    notes: dict[str, Any] | None = None
    looked_up: list[str] | None = None
    seconds_elapsed: float | None = None
    active_position: int | None = None


def patch(session: Session, mock_id: str, change: MockPatch) -> dict[str, Any]:
    """Autosave the answers, the flags and the one clock.

    Answer merging, flag handling and the "in progress" guard are the player's, reused
    verbatim rather than reimplemented — this is the same attempt row the ordinary
    practice screen writes, and two implementations of "empty string deletes the answer"
    would eventually disagree.

    Per-passage time is attributed here and nowhere else. The renderer owns the clock (it
    knows about tab visibility and the learner's machine going to sleep), so it sends the
    sitting's elapsed seconds and which passage was on screen; the delta since the last
    autosave is credited to that passage. It is an approximation by construction — a ten
    second poll cannot see a five second glance — and it is the only honest per-passage
    number available without pretending the server can see the screen.
    """
    from bandready.server.routes.reading import Autosave, autosave

    doc = load(session, mock_id)
    if doc.get("status") != "in_progress":
        raise ApiError(
            409,
            "conflict",
            f"reading mock {mock_id} is {doc.get('status')} — it can no longer be edited",
        )

    clock = doc.setdefault(
        "clock",
        {
            "seconds_elapsed": 0.0,
            "active_position": 1,
            "passage_seconds": {},
            "attributed": False,
            "last_patch_at": doc.get("started_at"),
        },
    )
    positions = {p["position"]: p["passage_id"] for p in doc.get("passages") or []}
    previous = int(clock.get("active_position") or 1)

    if change.seconds_elapsed is not None:
        new_elapsed = max(0.0, float(change.seconds_elapsed))
        delta = new_elapsed - float(clock.get("seconds_elapsed") or 0.0)
        if delta > 0:
            # The slice that just elapsed belongs to whatever was on screen *during* it,
            # which is the passage named by the previous autosave, not the new one.
            key = positions.get(previous)
            if key:
                seconds = clock.setdefault("passage_seconds", {})
                seconds[key] = float(seconds.get(key) or 0.0) + delta
                clock["attributed"] = True
        clock["seconds_elapsed"] = new_elapsed
    if change.active_position is not None:
        if change.active_position not in positions:
            raise ApiError(
                422,
                "validation_error",
                f"active_position must be one of {sorted(positions)}",
            )
        clock["active_position"] = int(change.active_position)
    clock["last_patch_at"] = iso()

    attempt_id = doc.get("attempt_id") or doc["mock_id"]
    saved = autosave(
        attempt_id,
        Autosave(
            answers=change.answers,
            flags=change.flags,
            highlights=change.highlights,
            notes=change.notes,
            # The dictionary is closed during a sitting; the words the learner clicked
            # are queued here and handed back in the report.
            looked_up=change.looked_up,
            timer_s=(
                int(max(0.0, float(doc.get("duration_s") or TIMINGS.total_s) - float(clock["seconds_elapsed"])))
                if change.seconds_elapsed is not None
                else None
            ),
        ),
        _=None,
        session=session,
    )
    _save(session, doc)
    return {
        **view(session, doc, include_passages=False),
        "saved_at": saved["saved_at"],
        "answered": saved["answered"],
        "flagged": saved["flagged"],
    }


def abandon(session: Session, mock_id: str) -> dict[str, Any]:
    """Walk out of a sitting — and reopen the coach.

    Without this an abandoned mock locks the teaching layer until it goes stale, which
    would make one closed laptop cost a learner an afternoon. The attempt is marked
    ``abandoned`` rather than submitted, so it does *not* open the passage gate: nobody
    who walked out has earned the worked solutions.
    """
    doc = load(session, mock_id)
    if doc.get("status") == "in_progress":
        doc["status"] = "abandoned"
        doc["finished_at"] = iso()
        attempt = _attempt(session, doc)
        if attempt.status == "in_progress":
            attempt.status = "abandoned"
        _close_envelope(session, doc)
        session.flush()
        _save(session, doc)
    return view(session, doc, include_passages=False)


def _close_envelope(session: Session, doc: dict[str, Any]) -> None:
    finished = doc.get("finished_at") or iso()
    envelope = session.get(m.PracticeSession, doc["mock_id"])
    if envelope is None or envelope.ended_at is not None:
        return
    envelope.ended_at = finished
    started = parse_iso(envelope.started_at)
    ended = parse_iso(finished)
    envelope.duration_s = (
        int(max(0.0, (ended - started).total_seconds())) if started and ended else 0
    )


# ======================================================================================
# Exam conditions — the rule that makes a mock mean anything
# ======================================================================================


def exam_conditions(
    session: Session | None = None, profile_id: str | None = None
) -> dict[str, Any] | None:
    """The in-progress sitting holding the coach shut, or ``None``.

    Takes the caller's session when it has one and opens its own read scope when it does
    not, and never raises: a failure to answer this question must degrade to "no mock is
    running", never to a 500 on the coach.
    """
    try:
        if session is not None:
            pid = profile_id
            if pid is None:
                from bandready.server.deps import current_profile_id

                pid = current_profile_id(session)
            doc = _live_row(session, pid)
            return None if doc is None else _conditions(doc)

        from bandready.db.engine import session_scope
        from bandready.server.deps import current_profile_id

        with session_scope() as scoped:
            pid = profile_id or current_profile_id(scoped)
            doc = _live_row(scoped, pid)
            return None if doc is None else _conditions(doc)
    except Exception:  # noqa: BLE001 — the guard must never break a coach request
        _log.debug("reading exam-conditions lookup failed", exc_info=True)
        return None


def _conditions(doc: dict[str, Any]) -> dict[str, Any]:
    clock = doc.get("clock") or {}
    return {
        "active": True,
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "started_at": doc.get("started_at"),
        "module": doc.get("module"),
        "test_id": doc.get("test_id"),
        "active_position": clock.get("active_position"),
        "passage_ids": [p.get("passage_id") for p in doc.get("passages") or []],
        "withheld": list(WITHHELD),
        "dictionary_enabled": False,
        "message": EXAM_CONDITIONS_MESSAGE,
    }


def locked_gate(conditions: dict[str, Any]) -> dict[str, Any]:
    """The gate state the coach reports during a sitting: shut, and saying why."""
    return {
        "unlocked": False,
        "reason": "exam_conditions",
        "attempts": 0,
        "last_attempt_id": None,
        "last_submitted_at": None,
        "last_raw_score": None,
        "evidence": None,
        "gated_fields": list(coach.GATED_FIELDS),
        "message": EXAM_CONDITIONS_MESSAGE,
        "mock_id": conditions["mock_id"],
    }


def refusal(conditions: dict[str, Any]) -> ApiError:
    """The 409 every coach route other than ``…/teaching`` raises during a sitting."""
    return ApiError(
        409, "conflict", f"{EXAM_CONDITIONS_MESSAGE} (sitting {conditions['mock_id']})"
    )


# ======================================================================================
# Submit — one paper, marked deterministically, reported pacing first
# ======================================================================================

PACING_NOTE = (
    "Pacing leads because it is the decision the paper actually asks you to make. The "
    "three passages carry roughly the same marks at very different cost per mark, so "
    "equal time on unequal costs leaves the expensive marks underfunded."
)

RAW_FIRST_NOTE = (
    "Raw score is the headline and the band is secondary, because the middle of the "
    "conversion table is four marks wide: on Academic, 23, 24, 25 and 26 are all band "
    "6.0. A learner improving inside that range needs to be able to see it."
)

MODULE_BAND_NOTE = (
    "30 out of 40 is band 7.0 on Academic and band 6.0 on General Training. The same raw "
    "score, a full band apart — General Training's texts are easier and the standard "
    "compensates, so a GT candidate needs near-full accuracy on the cheap early sections."
)


def _key_index(session: Session, doc: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """Per-question authored material, keyed by question number across the whole paper."""
    index: dict[int, dict[str, Any]] = {}
    for entry in doc.get("passages") or []:
        row = session.get(m.ReadingPassage, entry["passage_id"])
        if row is None:  # pragma: no cover
            continue
        passage_doc = coach.document(row)
        for _gi, group, question in coach.iter_questions(passage_doc):
            try:
                number = int(question.get("number"))
            except (TypeError, ValueError):
                continue
            teaching = question.get("teaching")
            index[number] = {
                "passage_id": row.id,
                "passage_title": row.title,
                "position": entry.get("position"),
                "qtype": str(group.get("type") or ""),
                "word_limit": word_limit_of(group.get("word_limit")),
                "accepted": expand_variants(question.get("answers") or []),
                "traps": [
                    str(slug)
                    for slug in (teaching or {}).get("traps") or []
                    if str(slug) in coach.TRAPS
                ]
                if isinstance(teaching, dict)
                else [],
            }
    return index


def _pacing_report(doc: dict[str, Any], per_passage: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Where the hour went, against the benchmark, and what it cost."""
    clock = doc.get("clock") or {}
    spent = clock.get("passage_seconds") or {}
    total_s = float(clock.get("seconds_elapsed") or 0.0)
    limit_s = float(doc.get("duration_s") or TIMINGS.total_s)
    attributed = bool(clock.get("attributed"))

    rows: list[dict[str, Any]] = []
    for entry in doc.get("passages") or []:
        passage_id = entry["passage_id"]
        minutes = _minutes(float(spent.get(passage_id) or 0.0))
        target = float(entry.get("target_minutes") or 0)
        marks = per_passage.get(passage_id) or {}
        correct = int(marks.get("correct") or 0)
        rows.append(
            {
                "position": entry.get("position"),
                "passage_id": passage_id,
                "title": entry.get("title"),
                "minutes": minutes,
                "target_minutes": target,
                "delta_minutes": round(minutes - target, 1),
                "questions": int(marks.get("total") or entry.get("questions") or 0),
                "correct": correct,
                "minutes_per_mark": (
                    round(minutes / correct, 2) if correct and minutes else None
                ),
            }
        )

    overtime = max(0.0, total_s - limit_s)
    lines: list[str] = []
    if not attributed:
        lines.append(
            "Your hour was not split between the passages in a way this sitting could "
            "measure, so only the total is reported."
        )
    else:
        worst = max(rows, key=lambda r: r["delta_minutes"], default=None)
        last = rows[-1] if rows else None
        if worst and worst["delta_minutes"] >= 5:
            lines.append(
                f"Passage {worst['position']} took {worst['minutes']:g} minutes against a "
                f"{worst['target_minutes']:g}-minute share — {worst['delta_minutes']:g} "
                "minutes over."
            )
        if last and last["delta_minutes"] <= -5:
            lines.append(
                f"Passage {last['position']} got {last['minutes']:g} minutes against "
                f"{last['target_minutes']:g}. It is the hardest passage and the most "
                "expensive per mark, and it was the one you starved."
            )
        if not lines:
            lines.append(
                "Your allocation was close to the benchmark on all three passages — that "
                "is the habit to keep."
            )
    if overtime > 0:
        lines.append(
            f"You ran {_minutes(overtime):g} minutes past the hour. There is no transfer "
            "time in Reading, so in the real paper those answers would not exist."
        )

    return {
        "total_minutes": _minutes(total_s),
        "limit_minutes": _minutes(limit_s),
        "overtime_minutes": _minutes(overtime),
        "attributed": attributed,
        "passages": rows,
        "verdict": " ".join(lines),
        "note": PACING_NOTE,
        "no_transfer_time": coach.NO_TRANSFER_TIME,
    }


def _band_ladder(raw: int, fmt: str) -> dict[str, Any]:
    """The current band, the next one, and how many marks away it is.

    The most motivating single number available, and pure arithmetic on a published
    table: seven marks separate band 6.0 from band 7.0 on Academic, which is roughly one
    bad True/False/Not Given group.
    """
    from bandready.server.routes.reading import (
        ACADEMIC_BAND_TABLE,
        BAND_DISCLAIMER,
        GT_BAND_TABLE,
        raw_to_band,
    )

    table = GT_BAND_TABLE if fmt == "general_training" else ACADEMIC_BAND_TABLE
    band = raw_to_band(raw, fmt)
    higher = [entry for entry in table if entry[2] > band]
    next_band = min(higher, key=lambda e: e[2]) if higher else None
    return {
        "raw": raw,
        "band": band,
        "format": fmt,
        "next_band": next_band[2] if next_band else None,
        "marks_to_next_band": max(0, next_band[0] - raw) if next_band else None,
        "band_width": next(
            (high - low + 1 for low, high, value in table if value == band), None
        ),
        "disclaimer": BAND_DISCLAIMER,
        "note": RAW_FIRST_NOTE,
        "module_note": MODULE_BAND_NOTE,
    }


def _trap_report(
    record: dict[str, Any], index: dict[int, dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Marks lost per trap, with the form-and-process losses counted separately.

    The separation is the point. ``ran_out_of_time``, ``over_limit`` and ``spelling`` need
    a pacing fix and an answer-form fix; coaching them as comprehension problems sends
    the learner to re-read a passage they understood perfectly.
    """
    lost: dict[str, list[int]] = {}
    form: dict[str, list[int]] = {}
    for marked in record.get("per_question") or []:
        if marked.get("correct"):
            continue
        number = int(marked.get("number") or 0)
        meta = index.get(number)
        if meta is None:
            continue
        derived = coach.form_traps(
            str(marked.get("given") or ""),
            meta["qtype"],
            meta["word_limit"],
            meta["accepted"],
        )
        for slug in derived:
            form.setdefault(slug, []).append(number)
        for slug in meta["traps"]:
            lost.setdefault(slug, []).append(number)

    def _rows(source: dict[str, list[int]]) -> list[dict[str, Any]]:
        out = []
        for slug, numbers in source.items():
            entry = coach.TRAPS.get(slug)
            if entry is None:  # pragma: no cover
                continue
            out.append(
                {
                    "slug": slug,
                    "label": entry["label"],
                    "family": entry["family"],
                    "family_label": coach.TRAP_FAMILIES[entry["family"]],
                    "what_happened": entry["what_happened"],
                    "fix": entry["fix"],
                    "marks_lost": len(numbers),
                    "questions": sorted(numbers),
                }
            )
        out.sort(key=lambda e: (-e["marks_lost"], e["slug"]))
        return out

    comprehension = _rows(lost)
    form_rows = _rows(form)
    summary = {
        "blank": sum(len(v) for k, v in form.items() if k == "ran_out_of_time"),
        "over_limit": sum(len(v) for k, v in form.items() if k == "over_limit"),
        "spelling": sum(len(v) for k, v in form.items() if k == "spelling"),
        "wrong_option_form": sum(
            len(v) for k, v in form.items() if k == "wrong_option_form"
        ),
        "note": (
            "These are form and process losses, not comprehension losses. They need a "
            "pacing fix and an answer-form fix, and they are the cheapest marks on the "
            "paper to get back."
        ),
    }
    return comprehension + form_rows, summary


def _next_actions(
    pacing: dict[str, Any],
    per_type: list[dict[str, Any]],
    traps: list[dict[str, Any]],
    form_summary: dict[str, Any],
    ladder: dict[str, Any],
) -> list[str]:
    """At most three, ranked by what would move the score most. Never a list of ten."""
    actions: list[str] = []
    if form_summary["blank"]:
        actions.append(
            f"{form_summary['blank']} question(s) went in blank. There is no penalty for a "
            "wrong answer, so at 58 minutes fill every empty box with a guess — that is "
            "free marks and a pacing fix, not a reading fix."
        )
    if pacing["attributed"]:
        starved = [p for p in pacing["passages"] if p["delta_minutes"] <= -5]
        if starved:
            worst = min(starved, key=lambda p: p["delta_minutes"])
            actions.append(
                f"Passage {worst['position']} got {worst['minutes']:g} minutes against "
                f"{worst['target_minutes']:g}. Next sitting, leave passage 1 at its "
                "benchmark even if two questions are unfinished — the marks are the same "
                "size and the later ones cost more to earn."
            )
    if form_summary["over_limit"] or form_summary["spelling"]:
        actions.append(
            "Answer form cost you marks you had already read correctly: count the words of "
            "every completion answer and copy it letter by letter from the passage."
        )
    if traps:
        lead = traps[0]
        actions.append(f"{lead['label']} cost {lead['marks_lost']} mark(s). {lead['fix']}")
    weakest = min(
        (t for t in per_type if t["total"] >= 3),
        key=lambda t: t["correct"] / t["total"],
        default=None,
    )
    if weakest and weakest["correct"] < weakest["total"]:
        actions.append(
            f"{weakest['label']}: {weakest['correct']}/{weakest['total']}. Drill that type "
            "before your next full paper."
        )
    if ladder["marks_to_next_band"]:
        actions.append(
            f"{ladder['marks_to_next_band']} more correct answers would put you at band "
            f"{ladder['next_band']:g}."
        )
    return actions[:3]


def submit(
    session: Session,
    mock_id: str,
    *,
    auto_submitted: bool = False,
    seconds_elapsed: float | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Close the sitting, mark it, and report pacing first.

    Marking is not reimplemented here. ``POST /reading/attempts/{id}/submit`` already
    flattens the scorables out of the content documents, runs every comparison through
    the shared normalizer, handles the "choose TWO" group rule, writes the
    ``reading_answers`` rows and converts raw to band with the published table for the
    module. Calling it means a mock and a practice attempt can never disagree about
    whether an answer was right, which is the only acceptable relationship between them.
    """
    from bandready.server.routes.reading import SubmitAttempt, submit_attempt

    doc = load(session, mock_id)
    if doc.get("status") == "complete" and doc.get("report") and not force:
        return doc["report"]

    clock = doc.setdefault("clock", {})
    if seconds_elapsed is not None:
        clock["seconds_elapsed"] = max(0.0, float(seconds_elapsed))
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    limit = float(doc.get("duration_s") or TIMINGS.total_s)
    # A sitting whose clock has run out was ended by the clock whatever the client says.
    auto = bool(auto_submitted or elapsed >= limit)

    attempt_id = doc.get("attempt_id") or doc["mock_id"]
    record = submit_attempt(
        attempt_id,
        SubmitAttempt(auto_submitted=auto, duration_s=int(elapsed)),
        _=None,
        session=session,
    )

    doc["status"] = "complete"
    doc["finished_at"] = doc.get("finished_at") or iso()
    _close_envelope(session, doc)

    report = _build_report(session, doc, record)
    doc["report"] = report
    session.flush()
    _save(session, doc)
    return report


def _build_report(
    session: Session, doc: dict[str, Any], record: dict[str, Any]
) -> dict[str, Any]:
    index = _key_index(session, doc)
    fmt = str(doc.get("format") or doc.get("module") or "academic")

    per_passage_raw = {p["passage_id"]: p for p in record.get("per_passage") or []}
    pacing = _pacing_report(doc, per_passage_raw)

    per_passage: list[dict[str, Any]] = []
    for entry in doc.get("passages") or []:
        marks = per_passage_raw.get(entry["passage_id"]) or {}
        total = int(marks.get("total") or 0)
        correct = int(marks.get("correct") or 0)
        per_passage.append(
            {
                "position": entry.get("position"),
                "passage_id": entry["passage_id"],
                "title": entry.get("title"),
                "correct": correct,
                "total": total,
                "pct": round(100.0 * correct / total, 1) if total else None,
                "minutes": next(
                    (
                        p["minutes"]
                        for p in pacing["passages"]
                        if p["passage_id"] == entry["passage_id"]
                    ),
                    0.0,
                ),
                "target_minutes": entry.get("target_minutes"),
            }
        )

    per_type: list[dict[str, Any]] = []
    for qtype, stats in (record.get("per_type") or {}).items():
        static = coach.TYPE_STRATEGY.get(qtype)
        total = int(stats.get("total") or 0)
        correct = int(stats.get("correct") or 0)
        per_type.append(
            {
                "qtype": qtype,
                "label": static.label if static else qtype,
                "correct": correct,
                "total": total,
                "pct": round(100.0 * correct / total, 1) if total else None,
                "order_badge": coach.ORDER_BADGES.get(
                    static.answer_order if static else "", None
                ),
                "seconds_per_question": static.seconds_per_question if static else None,
            }
        )
    per_type.sort(key=lambda t: (t["pct"] if t["pct"] is not None else 101, t["qtype"]))

    traps, form_summary = _trap_report(record, index)
    raw = int(record.get("raw_score") or 0)
    projected = int(record.get("scaled_raw_40") or raw)
    ladder = _band_ladder(projected, fmt)
    actions = _next_actions(pacing, per_type, traps, form_summary, ladder)

    attempt = session.get(m.ReadingAttempt, doc.get("attempt_id") or doc["mock_id"])
    state = coach.loads(attempt.state_json, {}) if attempt is not None else {}

    return {
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "status": "complete",
        "module": doc.get("module"),
        "format": fmt,
        "test_id": doc.get("test_id"),
        "title": doc.get("title"),
        "seed": doc.get("seed"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "scored_as": "whole_test",
        "auto_submitted": bool(record.get("auto_submitted")),
        # Pacing leads. Deliberately the first substantive key and the first thing the UI
        # renders — the allocation is the decision the paper asks the candidate to make.
        "pacing": pacing,
        # Then the raw score, then the band. Not the other way round.
        "score": {
            "raw_score": raw,
            "total_questions": record.get("total_questions"),
            "scaled_raw_40": projected,
            "band": record.get("band"),
            "band_is_estimate": bool(record.get("band_is_estimate")),
            "band_disclaimer": record.get("band_disclaimer"),
            "note": RAW_FIRST_NOTE,
        },
        "band_ladder": ladder,
        "per_passage": per_passage,
        "per_type": per_type,
        "per_trap": traps,
        "answer_form": form_summary,
        "per_question": record.get("per_question"),
        # The dictionary was closed for the hour; here is everything you reached for.
        "looked_up": list(state.get("looked_up") or []),
        "next_actions": actions,
        "review_url": f"/api/v1/reading/attempts/{doc.get('attempt_id') or doc['mock_id']}/review",
        "coach_reopened": True,
    }


# ======================================================================================
# History — the trajectory the Progress screen plots
# ======================================================================================


def history(session: Session, profile_id: str, *, limit: int = 25) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory.

    Raw score is the trajectory's primary series and the band is secondary, for the same
    reason the report says so: the middle of the Academic table is four marks wide, and a
    learner improving inside it must be able to see the improvement.
    """
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, status, created_at, doc_json FROM reading_mocks "
            "WHERE profile_id = :pid ORDER BY created_at DESC LIMIT :limit"
        ),
        {"pid": profile_id, "limit": int(limit)},
    ).all()

    items: list[dict[str, Any]] = []
    for mock_id, status, created_at, doc_json in rows:
        try:
            doc = json.loads(doc_json or "{}")
        except (TypeError, ValueError):
            doc = {}
        report = doc.get("report") or {}
        score = report.get("score") or {}
        clock = doc.get("clock") or {}
        items.append(
            {
                "mock_id": mock_id,
                "attempt_id": doc.get("attempt_id") or mock_id,
                "status": status,
                "module": doc.get("module"),
                "test_id": doc.get("test_id"),
                "title": doc.get("title"),
                "seed": doc.get("seed"),
                "started_at": doc.get("started_at") or created_at,
                "finished_at": doc.get("finished_at"),
                "minutes": _minutes(float(clock.get("seconds_elapsed") or 0.0)),
                "raw_score": score.get("raw_score"),
                "total_questions": score.get("total_questions"),
                "band": score.get("band"),
                "passage_minutes": [
                    p.get("minutes") for p in (report.get("pacing") or {}).get("passages") or []
                ],
                "weakest_type": (report.get("per_type") or [{}])[0].get("qtype")
                if report.get("per_type")
                else None,
            }
        )

    scored = [i for i in items if i["raw_score"] is not None]
    trajectory = [
        {
            "mock_id": i["mock_id"],
            "at": i["finished_at"] or i["started_at"],
            "raw_score": i["raw_score"],
            "band": i["band"],
            "minutes": i["minutes"],
            "passage_minutes": i["passage_minutes"],
        }
        for i in reversed(scored)
    ]
    latest = scored[0] if scored else None
    first = scored[-1] if scored else None
    return {
        "items": items,
        "count": len(items),
        "scored": len(scored),
        "trajectory": trajectory,
        "latest_raw": latest["raw_score"] if latest else None,
        "latest_band": latest["band"] if latest else None,
        "best_raw": max((i["raw_score"] for i in scored), default=None),
        "delta_raw": (
            int(latest["raw_score"]) - int(first["raw_score"])
            if latest and first and len(scored) > 1
            else None
        ),
        "primary_metric": "raw_score",
        "note": RAW_FIRST_NOTE,
    }


__all__ = [
    "BRIEFING",
    "EXAM_CONDITIONS_MESSAGE",
    "MODULES",
    "PASSAGES_PER_TEST",
    "QUESTIONS_PER_TEST",
    "TIMINGS",
    "WITHHELD",
    "MockPatch",
    "MockTimings",
    "abandon",
    "assemble",
    "clock_view",
    "create",
    "ensure_schema",
    "exam_conditions",
    "exam_document",
    "find",
    "history",
    "inspect",
    "load",
    "locked_gate",
    "patch",
    "refusal",
    "submit",
    "view",
]
