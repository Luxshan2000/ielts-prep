"""The Listening Mock — four parts, forty questions, audio once, then the check window.

A listening mock is **not** four part-practices in a row, and the difference is larger
here than in any other module. Four practices are four clocks, four submits and a break in
between, and every one of those breaks hands the candidate back something the real paper
never gives them: a chance to reset their attention. The exam does not stop for you. It
runs for about half an hour, it plays each recording once, and the only thing standing
between a competent listener and a bad score is whether they can stay on the page for that
long without their eyes drifting to the question they already lost.

Six rules run this module.

**1. The audio plays once, and the server enforces it.** :func:`play` records each part as
it starts and refuses a second play of the same part. This is not theatre for the
renderer's benefit: it is the single defining constraint of the paper, it is the reason
every technique this module teaches exists, and a mock that quietly allowed a rewind would
measure a skill nobody is ever tested on.

**2. The audio must exist before the sitting opens.** A mock that stalls in the middle of
Part 3 to synthesize Part 4 is worthless — the pause is not in the exam and the anxiety it
produces is ours, not the test's. So :func:`create` checks every part against the render
cache and, if anything is missing, submits a ``listening_render`` job and holds the sitting
at ``preparing``. :func:`start` refuses with a 409 until all four parts are ready.

**3. We model the computer-delivered test, and we say so in the response.** The
distinction matters and almost nobody explains it: **computer gets 2 minutes to check,
paper gets 10 minutes to transfer.** The mnemonic that stops the confusion is that paper
gets ten minutes because paper has to *move* the answers to a separate sheet; computer
gets two because the answers are already where they need to be. The ten minutes is a
clerical allowance, not a thinking period, and treating it as one is how paper candidates
lose marks they had. ``delivery`` selects between them, ``computer`` is the default, and
every response says which one is being modelled so the UI can tell the learner.

**4. The coach is shut for the duration.** :func:`exam_conditions` closes the whole
teaching layer while a sitting is open — the transcript, the timelines, the predictions,
the strategy cards, the signpost map, the trap labels — *even for a part the learner sat
and legitimately unlocked last week*. It closes from the moment the sitting is created,
including while the audio is still rendering, because a learner reading transcripts during
the render queue is a learner who has already sat the paper.

**5. One clock, derived from the audio.** The recordings budget their own time: the
previews and end-of-part checks are baked into the rendered WAV as authored pauses, so the
sitting's length is the sum of the four parts plus the final window. Listening is the only
paper in IELTS with no time-management problem, and precisely because of that it is the
only one where attention management is the whole game.

**6. One submit, marked deterministically.** Marking is delegated wholesale to the existing
player: :mod:`bandready.server.routes.listening` flattens the same questions, runs the same
shared normalizer at :mod:`bandready.scoring.answers`, writes the same ``listening_answers``
rows and converts raw to band through the same published table. What this module adds is
the sitting, and a report that leads with the raw score — because band 5.5 is *five marks
wide* and a learner who goes 19 to 22 has improved by fifteen per cent and been told
nothing.

One table serves Academic and General Training, and that is worth saying out loud because
learners hunt for "GT listening practice" and it does not exist as a distinct thing:
listening is literally the same test for both. Reading is the opposite, and the contrast is
one of the most useful facts we can hand over.

State lives in ``listening_mocks``, a small side table created on demand (see
:func:`ensure_schema`). The sitting itself is an ordinary ``listening_attempts`` row in
``mode: "exam"`` sharing the sitting's id, so every existing autosave, submit and review
surface keeps working on it unchanged — and so a finished mock opens the coach's gate on
all four of its parts, which is exactly the behaviour wanted.
"""

from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.listening import coach
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.listening.mock")

MOCK_SCHEMA_VERSION = 1


# ======================================================================================
# The format. Every number here is a fact about the paper, not a preference.
# ======================================================================================


@dataclass(frozen=True)
class DeliveryMode:
    """One of the two ways the paper is actually sat.

    ``window_s`` is the only figure that differs, and it is the whole distinction: the
    computer test gives two minutes to *check* answers already typed into their boxes; the
    paper test gives ten minutes to *transfer* answers from the question booklet onto an
    answer sheet. Ten minutes sounds generous and is not — it is a clerical allowance, and
    a candidate who spends it rethinking a question they lost arrives at the end with
    twelve boxes still empty.
    """

    slug: str
    label: str
    window_s: float
    window_label: str
    note: str


DELIVERY: dict[str, DeliveryMode] = {
    "computer": DeliveryMode(
        slug="computer",
        label="Computer-delivered",
        window_s=120.0,
        window_label="2-minute check",
        note=(
            "Computer gets 2 minutes because the answers are already where they need to "
            "be. You type into the box as you hear it, and at the end you check — you do "
            "not copy anything anywhere."
        ),
    ),
    "paper": DeliveryMode(
        slug="paper",
        label="Paper-based",
        window_s=600.0,
        window_label="10-minute transfer",
        note=(
            "Paper gets 10 minutes because paper has to move the answers onto a separate "
            "sheet. It is a clerical allowance, not a thinking period: spend it copying "
            "and checking form, never on the question you lost in Part 3."
        ),
    ),
}

DEFAULT_DELIVERY = "computer"

DELIVERY_MNEMONIC = (
    "Paper gets ten minutes because paper has to move the answers. Computer gets two "
    "because the answers are already where they need to be."
)

WHY_COMPUTER = (
    "We model the computer-delivered test by default. It is the realistic assumption for "
    "most candidates now — the hybrid 'IELTS on Computer (Writing on Paper)' still keeps "
    "Listening on a computer, and One Skill Retake, which is what makes an isolated "
    "listening score actionable, is computer-only. Paper mode is offered because it drills "
    "a genuinely different skill: deferred decision-making."
)

PARTS_PER_TEST = 4
QUESTIONS_PER_TEST = 40

MOCK_STATUSES: tuple[str, ...] = (
    "preparing",  # audio is rendering; the sitting cannot start yet
    "ready",  # every part is rendered; waiting for the learner to press start
    "in_progress",  # the clock is running
    "complete",
    "abandoned",
)

#: The statuses that hold the coach shut. ``preparing`` is in the list deliberately: a
#: learner reading transcripts while their mock audio renders has already sat the paper.
LIVE_STATUSES: tuple[str, ...] = ("preparing", "ready", "in_progress")

#: How long an unfinished sitting keeps the coach shut. A learner who closed the laptop
#: mid-mock must not find the teaching layer bricked tomorrow morning.
STALE_AFTER_S = 4 * 3600.0

#: Everything exam conditions withhold, named so the UI can say why a panel is dark.
WITHHELD: tuple[str, ...] = (
    "transcript",
    "timelines",
    "answer_quotes",
    "accepted_answers",
    "explanations",
    "predictions",
    "signposts",
    "signpost_map",
    "distractions",
    "trap_labels",
    "recovery_notes",
    "option_diagnosis",
    "strategy_cards",
    "pre_teach",
    "replay",
    "review",
    "drills",
    "generation",
    "dictionary",
    "prediction_gate",
)

EXAM_CONDITIONS_MESSAGE = (
    "You are in a listening mock. The coach is closed until you submit — no transcript, "
    "no timelines, no predictions, no strategy cards. That is the point: the transcript is "
    "the answer key, and a mock you can read it during measures nothing at all. Each part "
    "plays once and the server will not play it twice."
)

BRIEFING_TITLE = "Before you start"

#: Said once, before the clock starts, and never again.
def briefing(mode: DeliveryMode) -> list[str]:
    return [
        (
            "Each recording plays once. There is no pause, no rewind and no second play — "
            "the server refuses one, so do not plan around it."
        ),
        (
            "Use every preview pause on the protocol: read the instruction, slot-type every "
            "gap, underline one anchor per stem, then read the LAST question of the set so "
            "you know where it ends."
        ),
        coach.LAST_VALUE_RULE
        + " A speaker who corrects themselves always says so out loud.",
        (
            f"You are sitting the {mode.label.lower()} format: {mode.window_label} at the "
            f"end. {mode.note}"
        ),
        (
            "Part 4 previews all ten questions at once and then runs without a break. If "
            "you lose one, skip forward to the next printed heading and rejoin there — "
            "never hunt backwards, because the audio is not going back either."
        ),
        "Leaving the sitting needs an explicit confirmation, and the clock does not pause.",
    ]


#: What makes a test sittable at all. Failing either of these is a 422, not a warning: a
#: sitting whose numbering is broken cannot be marked out of forty.
HARD_CHECKS: tuple[str, ...] = ("four_parts", "numbers_contiguous")
#: Reported and sat anyway. A generated test may be short of forty, and a learner who knows
#: the paper is 37 questions long can still use it.
SOFT_CHECKS: tuple[str, ...] = ("forty_questions", "parts_in_order", "accent_spread")


# ======================================================================================
# Small helpers
# ======================================================================================


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(moment: datetime | None = None) -> str:
    return (moment or _now()).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    raw = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _since(value: Any) -> float:
    started = _parse_iso(value)
    if started is None:
        return 0.0
    return max(0.0, (_now() - started).total_seconds())


def _minutes(seconds: float) -> float:
    return round(float(seconds) / 60.0, 1)


def _delivery(slug: str | None) -> DeliveryMode:
    key = (slug or DEFAULT_DELIVERY).strip().lower()
    if key not in DELIVERY:
        raise ApiError(
            422, "validation_error", f"delivery must be one of {', '.join(sorted(DELIVERY))}"
        )
    return DELIVERY[key]


# ======================================================================================
# Storage
# ======================================================================================

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS listening_mocks (
        mock_id     TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        status      TEXT NOT NULL,
        seed        INTEGER,
        delivery    TEXT,
        test_id     TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        doc_json    TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_listening_mocks_live
        ON listening_mocks (profile_id, status, created_at)
    """,
)


def ensure_schema(session: Session) -> None:
    """Create the mock side table if it is not there yet.

    Created here rather than in a migration because this module owns the table and nothing
    else reads it; the DDL is idempotent and costs a no-op statement per call. The
    attempt's own ``summary_json`` was not an option: the sitting has to be findable by
    profile and status without parsing every attempt in the database, and the render state
    belongs to the sitting rather than to the answer sheet.
    """
    for statement in _DDL:
        session.execute(sa_text(statement))


def _save(session: Session, doc: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(session)
    if doc.get("status") not in MOCK_STATUSES:  # pragma: no cover — a typo'd status
        raise ApiError(500, "internal", f"unknown mock status {doc.get('status')!r}")
    doc["updated_at"] = _iso()
    session.execute(
        sa_text(
            "INSERT INTO listening_mocks "
            "  (mock_id, profile_id, status, seed, delivery, test_id, created_at, "
            "   updated_at, doc_json) "
            "VALUES (:mid, :pid, :status, :seed, :delivery, :test, :created, :updated, :doc) "
            "ON CONFLICT(mock_id) DO UPDATE SET "
            "  status = excluded.status, updated_at = excluded.updated_at, "
            "  doc_json = excluded.doc_json"
        ),
        {
            "mid": doc["mock_id"],
            "pid": doc["profile_id"],
            "status": doc["status"],
            "seed": doc.get("seed"),
            "delivery": doc.get("delivery"),
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
        sa_text("SELECT doc_json FROM listening_mocks WHERE mock_id = :mid"),
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
        raise ApiError(404, "not_found", f"no listening mock {mock_id!r}")
    return doc


def _live_row(session: Session, profile_id: str) -> dict[str, Any] | None:
    """The one sitting that is still open and not stale, if there is one."""
    ensure_schema(session)
    placeholders = ", ".join(f"'{status}'" for status in LIVE_STATUSES)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, created_at, doc_json FROM listening_mocks "
            f"WHERE profile_id = :pid AND status IN ({placeholders}) "
            "ORDER BY created_at DESC"
        ),
        {"pid": profile_id},
    ).all()
    for mock_id, created_at, doc_json in rows:
        if _since(created_at) > STALE_AFTER_S:
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
    script_ids: tuple[str, str, str, str]
    last_sat_at: str | None


def _last_sat(session: Session, profile_id: str) -> dict[str, str]:
    """When this learner last sat each test.

    ``listening_tests`` carries no ``last_served_at`` column, so least-recently-served is
    derived from the learner's own history rather than from a global counter — the better
    signal anyway. Handing back the paper somebody sat on Tuesday is the thing to avoid,
    and whether another profile saw it is beside the point.
    """
    rows = session.execute(
        sa_text(
            "SELECT la.test_id, MAX(ps.started_at) FROM listening_attempts la "
            "JOIN practice_sessions ps ON ps.id = la.id "
            "WHERE ps.profile_id = :pid AND la.test_id IS NOT NULL "
            "GROUP BY la.test_id"
        ),
        {"pid": profile_id},
    ).all()
    return {str(test_id): str(seen) for test_id, seen in rows if seen}


def _candidates(session: Session, profile_id: str) -> list[_Candidate]:
    """Every live test, in least-recently-served order."""
    seen = _last_sat(session, profile_id)
    rows = session.execute(
        sa_text(
            "SELECT id, title, p1_id, p2_id, p3_id, p4_id FROM listening_tests "
            "WHERE retired = 0 ORDER BY id"
        )
    ).all()
    out = [
        _Candidate(
            test_id=str(row[0]),
            title=str(row[1] or row[0]),
            script_ids=(str(row[2]), str(row[3]), str(row[4]), str(row[5])),
            last_sat_at=seen.get(str(row[0])),
        )
        for row in rows
    ]
    # Never-sat tests sort first, then the oldest, exactly as the reading mock does.
    out.sort(key=lambda c: (c.last_sat_at is not None, c.last_sat_at or "", c.test_id))
    return out


def _numbers_of(doc: dict[str, Any]) -> list[int]:
    numbers: list[int] = []
    for question in coach.iter_questions(doc):
        value = question.get("n") if question.get("n") is not None else question.get("number")
        try:
            numbers.append(int(value))
        except (TypeError, ValueError):
            continue
    return numbers


def _expected_hash(doc: dict[str, Any]) -> str:
    from bandready.audio import tts_render

    return tts_render.script_audio_hash(doc)


def _render_state(doc: dict[str, Any]) -> dict[str, Any]:
    """Is this part's audio on disk, and how long is it?

    Keyed on the **content hash** rather than on ``listening_scripts.audio_hash``, because
    the column records the last render and the hash records what the current script would
    render to. A script edited after its last render has a stale column and no usable
    audio, and a mock that trusted the column would open and then play the wrong recording.
    """
    from bandready.audio import tts_render

    audio_hash = _expected_hash(doc)
    cached = tts_render.cached_render(audio_hash)
    return {
        "audio_hash": audio_hash,
        "ready": cached is not None,
        "duration_ms": int((cached or {}).get("duration_ms") or 0),
        "media_path": f"/api/v1/media/listening/{audio_hash}.wav",
        "timing_path": f"/api/v1/media/listening/{audio_hash}.timing.json",
    }


def inspect(session: Session, candidate: _Candidate) -> dict[str, Any]:
    """Everything the assembler needs to know about one test, checks included.

    Question numbers are the check that matters. They run 1–40 contiguously across the
    whole test rather than restarting per part — the narrator says "questions eleven to
    twenty" and the answer sheet has to agree — and a paper that breaks that cannot be
    marked out of forty, so it is refused rather than sat and quietly mis-scored.
    """
    numbers: list[int] = []
    parts: list[dict[str, Any]] = []
    accents: list[str] = []
    ordered = True

    for position, script_id in enumerate(candidate.script_ids, start=1):
        row = session.get(m.ListeningScript, script_id)
        if row is None:
            continue
        doc = coach.document(row)
        own = sorted(_numbers_of(doc))
        numbers.extend(own)
        accents.append(str(row.accent_set))
        if int(row.part) != position:
            ordered = False
        teaching = coach.script_teaching(doc)
        pause_plan = teaching.get("pause_plan") if isinstance(teaching, dict) else None
        parts.append(
            {
                "position": position,
                "script_id": row.id,
                "part": int(row.part),
                "title": row.title,
                "scenario": (doc.get("scenario") or None),
                "topic_id": row.topic_id,
                "accent_set": row.accent_set,
                "target_band": row.target_band,
                "questions": len(own),
                "first_number": own[0] if own else None,
                "last_number": own[-1] if own else None,
                "question_types": sorted(
                    {
                        str(g.get("type"))
                        for g in coach.groups_of(doc)
                        if g.get("type")
                    }
                    or {
                        str(q.get("type"))
                        for q in coach.iter_questions(doc)
                        if q.get("type")
                    }
                ),
                "preview_blocks": len(
                    [b for b in (pause_plan or {}).get("blocks") or [] if isinstance(b, dict)]
                )
                if isinstance(pause_plan, dict)
                else None,
                "audio": _render_state(doc),
            }
        )

    sorted_numbers = sorted(numbers)
    contiguous = bool(sorted_numbers) and sorted_numbers == list(
        range(1, len(sorted_numbers) + 1)
    )
    checks = {
        "four_parts": len(parts) == PARTS_PER_TEST
        and len({p["script_id"] for p in parts}) == PARTS_PER_TEST,
        "numbers_contiguous": contiguous,
        "forty_questions": len(sorted_numbers) == QUESTIONS_PER_TEST,
        "parts_in_order": ordered,
        "accent_spread": len(set(accents)) > 1,
    }
    warnings: list[str] = []
    if not checks["forty_questions"]:
        warnings.append(
            f"this paper carries {len(sorted_numbers)} questions rather than 40 — the band "
            "is projected onto the 40-question scale and is an estimate"
        )
    if not checks["parts_in_order"]:
        warnings.append(
            "a script's authored part number does not match its slot in the test; it is "
            "played in the slot the test gives it"
        )
    if not checks["accent_spread"]:
        warnings.append(
            "every part uses the same accent set. The real paper spreads accents across "
            "the four parts rather than saving them for the end — plan extra exposure"
        )

    return {
        "test_id": candidate.test_id,
        "title": candidate.title,
        "last_sat_at": candidate.last_sat_at,
        "parts": parts,
        "question_count": len(sorted_numbers),
        "checks": checks,
        "warnings": warnings,
        "sittable": all(checks[name] for name in HARD_CHECKS),
    }


def timing_plan(parts: list[dict[str, Any]], mode: DeliveryMode) -> dict[str, Any]:
    """The sitting's length, derived from the audio rather than chosen.

    The previews and the end-of-part checks are **inside** the rendered WAV — they are
    authored ``pause_after_ms`` values on the narrator lines, so ``stitch`` has already
    baked them into the file and ``timing.json`` already knows how long the result is.
    That means there is no per-part time budget to invent here and no pacing decision for
    the learner to get wrong: the recording spends the time for them. All this function
    adds is the final window, which is the one phase the audio does not contain.
    """
    audio_ms = sum(int(p["audio"].get("duration_ms") or 0) for p in parts)
    ready = all(bool(p["audio"].get("ready")) for p in parts) and bool(parts)
    return {
        "delivery": mode.slug,
        "delivery_label": mode.label,
        "audio_s": round(audio_ms / 1000.0, 1),
        "window_s": mode.window_s,
        "window_label": mode.window_label,
        "window_note": mode.note,
        "total_s": round(audio_ms / 1000.0 + mode.window_s, 1),
        "derived_from_audio": ready,
        "parts": [
            {
                "position": p["position"],
                "script_id": p["script_id"],
                "audio_s": round(int(p["audio"].get("duration_ms") or 0) / 1000.0, 1),
                "ready": bool(p["audio"].get("ready")),
            }
            for p in parts
        ],
        "mnemonic": DELIVERY_MNEMONIC,
        "why_computer": WHY_COMPUTER,
        "note": (
            "The preview pauses and the end-of-part checks are inside the recordings, so "
            "there is nothing to allocate. Listening is the only paper with no "
            "time-management problem, and that is exactly why attention management is the "
            "whole game."
        ),
    }


def assemble(
    session: Session,
    profile_id: str,
    *,
    delivery: str = DEFAULT_DELIVERY,
    seed: int | None = None,
    test_id: str | None = None,
) -> dict[str, Any]:
    """Build one sittable paper. Pure — it reads history and writes nothing.

    Unseeded, the pool arrives least-recently-served first and the first sittable test
    wins, so a repeat mock is a different paper. Seeded, the pool is shuffled by the seed
    instead, because the whole point of a seed is that the same number produces the same
    paper tomorrow, and least-recently-served order changes every time a mock is sat.
    """
    mode = _delivery(delivery)

    pool = _candidates(session, profile_id)
    if test_id:
        pool = [c for c in pool if c.test_id == test_id]
        if not pool:
            raise ApiError(404, "not_found", f"listening test {test_id!r} is not a live test")
    if not pool:
        raise ApiError(
            422,
            "validation_error",
            "the pack cannot open a listening mock — it carries no live listening test",
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
                "delivery": mode.slug,
                "delivery_label": mode.label,
                "seed": seed,
                "test_id": plan["test_id"],
                "title": plan["title"],
                "question_count": plan["question_count"],
                "parts": plan["parts"],
                "timing": timing_plan(plan["parts"], mode),
                "coherence": {
                    "checks": plan["checks"],
                    "warnings": plan["warnings"],
                    "hard_checks": list(HARD_CHECKS),
                    "soft_checks": list(SOFT_CHECKS),
                    "rejected": rejected,
                },
                "briefing": {
                    "title": BRIEFING_TITLE,
                    "points": briefing(mode),
                    "delivery_note": mode.note,
                    "mnemonic": DELIVERY_MNEMONIC,
                },
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
        f"no live listening test can be sat as a mock: {failures}. A sitting needs four "
        "parts whose question numbers run 1..N without a gap.",
    )


# ======================================================================================
# Pre-rendering — the sitting cannot open on audio that does not exist
# ======================================================================================


def audio_progress(session: Session, doc: dict[str, Any]) -> dict[str, Any]:
    """Which parts are rendered, and how the render job is getting on.

    Re-checked against the cache on every call rather than trusted from the stored
    document, because the job that renders the audio runs in another thread with its own
    session and the only thing both sides agree on is the file on disk.
    """
    from bandready.server.jobs import job_manager

    parts: list[dict[str, Any]] = []
    for entry in doc.get("parts") or []:
        row = session.get(m.ListeningScript, entry["script_id"])
        state = (
            _render_state(coach.document(row))
            if row is not None
            else {"ready": False, "duration_ms": 0, "audio_hash": None}
        )
        parts.append(
            {
                "position": entry.get("position"),
                "script_id": entry["script_id"],
                "title": entry.get("title"),
                **state,
            }
        )
    ready_count = sum(1 for p in parts if p["ready"])
    job_id = doc.get("render_job_id")
    job = job_manager.get(job_id) if job_id else None
    return {
        "ready": bool(parts) and ready_count == len(parts),
        "ready_parts": ready_count,
        "total_parts": len(parts),
        "pct": int(100 * ready_count / len(parts)) if parts else 0,
        "parts": parts,
        "job_id": job_id,
        "job_state": (job or {}).get("state"),
        "job_progress_pct": (job or {}).get("progress_pct"),
        "job_detail": (job or {}).get("detail"),
        "job_error": (job or {}).get("error"),
        "note": (
            "Every part is rendered before the sitting opens. A mock that stopped in the "
            "middle of Part 3 to synthesize Part 4 would be teaching you to tolerate a "
            "pause the exam never gives you."
        ),
    }


def _render_one(script_doc: dict[str, Any], script_id: str) -> dict[str, Any]:
    """Render one part, synchronously, on whatever thread calls this."""
    import asyncio

    from bandready.audio import tts_render

    return asyncio.run(tts_render.render_script(script_doc, script_id=script_id))


def _submit_render_job(session: Session, doc: dict[str, Any]) -> str | None:
    """Render the parts that are missing, as one background job. Returns the job id.

    Each part is rendered **on a worker thread**, not on the serving event loop, and that
    is load-bearing rather than an optimisation. ``render_script`` writes a
    ``media_files`` row for every synthesized line, and those writes are ordinary blocking
    SQLite statements. Run on the loop they deadlock outright: the request that submitted
    this job has not released its own session yet — the dependency teardown is itself a
    loop callback — so the job blocks on the writer lock, the loop cannot run the teardown
    that would release it, and every statement burns the five-second ``busy_timeout``
    before the next one tries again. Handing the work to a thread keeps the loop free, the
    teardown runs, the lock is released, and the render proceeds.
    """
    from bandready.server.jobs import job_manager

    pending: list[tuple[str, dict[str, Any]]] = []
    for entry in doc.get("parts") or []:
        row = session.get(m.ListeningScript, entry["script_id"])
        if row is None:  # pragma: no cover — the assembler just read it
            continue
        script_doc = coach.document(row)
        if not _render_state(script_doc)["ready"]:
            pending.append((row.id, script_doc))
    if not pending:
        return None

    async def run(job_id: str) -> dict[str, Any]:
        import asyncio

        rendered: list[dict[str, Any]] = []
        for index, (script_id, script_doc) in enumerate(pending):
            job_manager.set_progress(
                job_id,
                int(100 * index / len(pending)),
                f"rendering part {index + 1} of {len(pending)}",
            )
            result = await asyncio.to_thread(_render_one, script_doc, script_id)
            rendered.append({"script_id": script_id, "audio_hash": result["audio_hash"]})
        job_manager.set_progress(job_id, 100, "audio ready")
        return {"mock_id": doc["mock_id"], "parts": rendered}

    return job_manager.submit("listening_render", run)


def refresh(session: Session, doc: dict[str, Any]) -> dict[str, Any]:
    """Promote ``preparing`` to ``ready`` once the last part lands. Idempotent."""
    if doc.get("status") != "preparing":
        return doc
    progress = audio_progress(session, doc)
    if progress["ready"]:
        doc["status"] = "ready"
        doc["timing"] = timing_plan(
            _parts_with_audio(session, doc), _delivery(doc.get("delivery"))
        )
        _save(session, doc)
    return doc


def _parts_with_audio(session: Session, doc: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in doc.get("parts") or []:
        row = session.get(m.ListeningScript, entry["script_id"])
        state = (
            _render_state(coach.document(row))
            if row is not None
            else {"ready": False, "duration_ms": 0}
        )
        out.append({**entry, "audio": state})
    return out


# ======================================================================================
# The sitting: create, start, read, autosave, play
# ======================================================================================


def create(
    session: Session,
    profile_id: str,
    *,
    delivery: str = DEFAULT_DELIVERY,
    seed: int | None = None,
    test_id: str | None = None,
) -> dict[str, Any]:
    """Assemble a paper, queue its audio, and open the sitting. One per learner, by design.

    The sitting *is* a ``listening_attempts`` row in ``mode: "exam"``, sharing the
    sitting's id. That is deliberate and load-bearing: the existing marker and review
    screen key off an attempt id, so a finished mock is reviewable through surfaces that
    know nothing about mocks, and it opens the coach's gate on all four of its parts
    because it genuinely is a submitted attempt on each of them.

    Exam conditions bite from this moment, not from :func:`start`. The audio may take a
    minute to render and a learner who spends that minute reading the transcript of Part 2
    has sat the paper already.
    """
    ensure_schema(session)

    existing = _live_row(session, profile_id)
    if existing is not None:
        raise ApiError(
            409,
            "conflict",
            f"listening mock {existing['mock_id']} is still open — submit it, or "
            "POST …/abandon, before starting another",
        )

    plan = assemble(
        session, profile_id, delivery=delivery, seed=seed, test_id=test_id
    )

    mock_id = f"lm_{ULID()}"
    created = _iso()
    total = int(plan["question_count"])

    session.add(
        m.PracticeSession(
            id=mock_id,
            profile_id=profile_id,
            module="listening",
            activity="listening_mock",
            started_at=created,
            summary_json=json.dumps(
                {
                    "answers": {},
                    "seconds_elapsed": 0,
                    "play_counts": {},
                    "play_count": 0,
                    "current_part": 1,
                    "mock_id": mock_id,
                    "exam_conditions": True,
                }
            ),
        )
    )
    # The envelope must exist before the module row: listening_attempts.id is an FK onto
    # practice_sessions.id and models.py declares no relationship to order the inserts.
    session.flush()
    session.add(
        m.ListeningAttempt(
            id=mock_id,
            test_id=plan["test_id"],
            script_id=None,
            mode="exam",
            status="in_progress",
            total_questions=total,
        )
    )
    session.flush()

    doc: dict[str, Any] = {
        "schema_version": MOCK_SCHEMA_VERSION,
        "mock_id": mock_id,
        "attempt_id": mock_id,
        "profile_id": profile_id,
        "status": "preparing",
        "created_at": created,
        "updated_at": created,
        "started_at": None,
        "finished_at": None,
        "render_job_id": None,
        "plays": {},
        "clock": {
            "seconds_elapsed": 0.0,
            "phase": "not_started",
            "current_part": 1,
            "last_patch_at": None,
        },
        "report": None,
        **plan,
    }

    job_id = _submit_render_job(session, doc)
    doc["render_job_id"] = job_id
    if job_id is None:
        doc["status"] = "ready"
    _save(session, doc)
    return doc


def start(session: Session, mock_id: str) -> dict[str, Any]:
    """Begin the clock. Refuses until every part's audio exists.

    The refusal is the feature. Rendering four parts of Kokoro speech takes long enough to
    notice, and a sitting that opened optimistically would either stall between parts or
    silently serve a part with no audio at all — and a learner who reaches Part 4 and finds
    silence has lost the sitting, not a minute.
    """
    doc = refresh(session, load(session, mock_id))
    status = doc.get("status")
    if status == "in_progress":
        return doc
    if status in ("complete", "abandoned"):
        raise ApiError(409, "conflict", f"listening mock {mock_id} is {status}")
    if status != "ready":
        progress = audio_progress(session, doc)
        raise ApiError(
            409,
            "conflict",
            f"the audio for this sitting is not ready yet — {progress['ready_parts']} of "
            f"{progress['total_parts']} parts rendered. Poll GET …/sessions/{mock_id} "
            "until status is 'ready'.",
        )

    started = _iso()
    doc["status"] = "in_progress"
    doc["started_at"] = started
    doc["timing"] = timing_plan(
        _parts_with_audio(session, doc), _delivery(doc.get("delivery"))
    )
    doc["clock"] = {
        "seconds_elapsed": 0.0,
        "phase": "audio",
        "current_part": 1,
        "last_patch_at": started,
    }
    envelope = session.get(m.PracticeSession, mock_id)
    if envelope is not None:
        envelope.started_at = started
    session.flush()
    _save(session, doc)
    return doc


def clock_view(doc: dict[str, Any]) -> dict[str, Any]:
    """The one clock, as the top bar renders it.

    Two phases, not one, because they are different instructions: while ``audio`` is
    running the learner types as they hear; when the phase turns to ``check`` the audio is
    gone forever and the only thing left to do is form repair.
    """
    clock = doc.get("clock") or {}
    timing = doc.get("timing") or {}
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    audio_s = float(timing.get("audio_s") or 0.0)
    window_s = float(timing.get("window_s") or 0.0)
    total = float(timing.get("total_s") or (audio_s + window_s))
    remaining = total - elapsed
    phase = str(clock.get("phase") or "not_started")
    if phase in ("audio", "check"):
        phase = "check" if elapsed >= audio_s else "audio"
    return {
        "phase": phase,
        "delivery": timing.get("delivery"),
        "window_label": timing.get("window_label"),
        "duration_s": round(total, 1),
        "audio_s": round(audio_s, 1),
        "window_s": round(window_s, 1),
        "seconds_elapsed": round(elapsed, 1),
        "remaining_s": round(remaining, 1),
        # Past zero the countdown inverts and counts up rather than snatching the paper
        # away; overtime is recorded and shown in the report.
        "overtime_s": round(max(0.0, -remaining), 1),
        "expired": remaining <= 0,
        "window_remaining_s": round(max(0.0, total - elapsed), 1) if elapsed >= audio_s else None,
        "current_part": int(clock.get("current_part") or 1),
    }


def plays_view(doc: dict[str, Any]) -> dict[str, Any]:
    """Which parts have been played, and which can still be.

    ``played`` is the enforcement surface, and it is worth returning even before the
    learner presses play: a UI that can grey out a part it already used is a UI that never
    has to explain a 409.
    """
    plays = dict(doc.get("plays") or {})
    parts = doc.get("parts") or []
    return {
        "played": {str(k): int(v) for k, v in plays.items()},
        "remaining": [
            p["script_id"] for p in parts if int(plays.get(p["script_id"], 0) or 0) == 0
        ],
        "plays_allowed": 1,
        "note": (
            "Each recording plays once. A second request for the same part is refused by "
            "the server, not hidden by the player."
        ),
    }


def _attempt(session: Session, doc: dict[str, Any]) -> m.ListeningAttempt:
    row = session.get(m.ListeningAttempt, doc.get("attempt_id") or doc["mock_id"])
    if row is None:  # pragma: no cover — created with the sitting
        raise ApiError(500, "internal", f"listening mock {doc['mock_id']} has lost its attempt")
    return row


def exam_parts(session: Session, doc: dict[str, Any]) -> list[dict[str, Any]]:
    """The four parts as the sitting shows them: no key, no transcript, no teaching.

    Built through the player's own ``_public_script`` with ``with_answers=False``, which
    is an **allowlist** rather than a stripper — the accepted answers, the cue line
    indices, the explanations and the spoken lines are not omitted from a larger object,
    they are never put into one. The authored ``teaching`` objects are not on that
    allowlist either, at any of the three depths, so there is nothing to reveal with a
    devtools toggle.
    """
    from bandready.server.routes.listening import (
        _public_script,
        _question_rows,
        _renumber,
        _script_row,
    )

    rows = [_script_row(session, entry["script_id"]) for entry in doc.get("parts") or []]
    # The same answer-sheet numbering the marker will use, so the narrator's "questions
    # eleven to twenty" and the boxes on screen cannot disagree.
    offsets = _renumber([(row, _question_rows(session, row.id)) for row in rows])

    out: list[dict[str, Any]] = []
    for entry, row in zip(doc.get("parts") or [], rows, strict=False):
        payload = _public_script(
            row, session, with_answers=False, number_offset=offsets.get(row.id)
        )
        payload["position"] = entry.get("position")
        payload["coaching_included"] = False
        out.append(payload)
    return out


def view(
    session: Session, doc: dict[str, Any], *, include_parts: bool = True
) -> dict[str, Any]:
    """What ``GET /mock/sessions/{id}`` answers: the paper, the clock, the saved state."""
    from bandready.server.routes.listening import _draft

    envelope = session.get(m.PracticeSession, doc.get("attempt_id") or doc["mock_id"])
    draft = _draft(envelope) if envelope is not None else {}
    live = doc.get("status") in LIVE_STATUSES
    return {
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "status": doc.get("status"),
        "delivery": doc.get("delivery"),
        "delivery_label": doc.get("delivery_label"),
        "delivery_note": (doc.get("briefing") or {}).get("delivery_note"),
        "modelled": (
            f"{doc.get('delivery_label')} IELTS-style listening — "
            f"{(doc.get('timing') or {}).get('window_label')} at the end"
        ),
        "seed": doc.get("seed"),
        "test_id": doc.get("test_id"),
        "title": doc.get("title"),
        "created_at": doc.get("created_at"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "question_count": doc.get("question_count"),
        "audio": audio_progress(session, doc),
        "timing": doc.get("timing"),
        "clock": clock_view(doc),
        "plays": plays_view(doc),
        "part_meta": doc.get("parts"),
        "parts": exam_parts(session, doc) if include_parts else None,
        "coherence": doc.get("coherence"),
        "briefing": doc.get("briefing"),
        "answers_included": False,
        "coaching_included": False,
        "resume_state": {
            "answers": draft.get("answers") or {},
            "seconds_elapsed": int(draft.get("seconds_elapsed") or 0),
            "current_part": int(draft.get("current_part") or 1),
            "play_counts": draft.get("play_counts") or {},
        },
        "exam_conditions": _conditions(doc) if live else None,
        "report": doc.get("report"),
    }


@dataclass(frozen=True)
class MockPatch:
    """One autosave from the player."""

    answers: dict[str, Any] | None = None
    seconds_elapsed: float | None = None
    current_part: int | None = None
    phase: str | None = None


def patch(session: Session, mock_id: str, change: MockPatch) -> dict[str, Any]:
    """Autosave the answer sheet and the one clock.

    Answer merging and the "in progress" guard are the player's, reused verbatim rather
    than reimplemented — this is the same attempt row the ordinary practice screen writes,
    and two implementations of "a partial deep-merge" would eventually disagree.

    The renderer owns the clock because it knows about tab visibility and the learner's
    machine going to sleep. There is no per-part attribution to do, unlike reading: the
    recordings spend the time, so the only thing worth recording is which part is on screen
    and whether the audio has finished.
    """
    from bandready.server.routes.listening import AttemptPatch, patch_attempt

    doc = load(session, mock_id)
    if doc.get("status") != "in_progress":
        raise ApiError(
            409,
            "conflict",
            f"listening mock {mock_id} is {doc.get('status')} — it can no longer be edited",
        )

    clock = doc.setdefault(
        "clock",
        {"seconds_elapsed": 0.0, "phase": "audio", "current_part": 1, "last_patch_at": None},
    )
    positions = {int(p["position"]): p["script_id"] for p in doc.get("parts") or []}
    if change.seconds_elapsed is not None:
        clock["seconds_elapsed"] = max(0.0, float(change.seconds_elapsed))
    if change.current_part is not None:
        if int(change.current_part) not in positions:
            raise ApiError(
                422, "validation_error", f"current_part must be one of {sorted(positions)}"
            )
        clock["current_part"] = int(change.current_part)
    if change.phase is not None:
        if change.phase not in ("audio", "check"):
            raise ApiError(422, "validation_error", "phase must be audio | check")
        clock["phase"] = change.phase
    clock["last_patch_at"] = _iso()

    attempt_id = doc.get("attempt_id") or doc["mock_id"]
    saved = patch_attempt(
        attempt_id,
        AttemptPatch(
            answers={str(k): str(v) for k, v in (change.answers or {}).items()} or None,
            seconds_elapsed=(
                int(clock["seconds_elapsed"]) if change.seconds_elapsed is not None else None
            ),
            current_part=change.current_part,
        ),
        _=None,
        session=session,
    )
    _save(session, doc)
    return {
        **view(session, doc, include_parts=False),
        "answered": saved["answered"],
    }


def play(session: Session, mock_id: str, script_id: str) -> dict[str, Any]:
    """Record that a part has started playing, and refuse the second request.

    This is the exam condition that defines the paper, and it is enforced here rather than
    in the player because a renderer's promise not to rewind is not an exam condition, it
    is a preference. The refusal is a 409 with the part named, so the UI can say *"Part 2
    has already been played"* rather than failing silently.
    """
    doc = load(session, mock_id)
    if doc.get("status") != "in_progress":
        raise ApiError(
            409,
            "conflict",
            f"listening mock {mock_id} is {doc.get('status')} — press start first",
        )
    known = {p["script_id"]: p for p in doc.get("parts") or []}
    entry = known.get(script_id)
    if entry is None:
        raise ApiError(404, "not_found", f"script {script_id!r} is not part of this sitting")

    plays = doc.setdefault("plays", {})
    played = int(plays.get(script_id, 0) or 0)
    if played:
        raise ApiError(
            409,
            "conflict",
            f"part {entry.get('position')} has already been played. Each recording plays "
            "once — that is the exam condition this sitting exists to reproduce.",
        )
    plays[script_id] = played + 1
    doc["clock"]["current_part"] = int(entry.get("position") or 1)

    from bandready.server.routes.listening import AttemptPatch, patch_attempt

    patch_attempt(
        doc.get("attempt_id") or doc["mock_id"],
        AttemptPatch(played_script_id=script_id, current_part=int(entry.get("position") or 1)),
        _=None,
        session=session,
    )
    _save(session, doc)
    row = session.get(m.ListeningScript, script_id)
    return {
        "mock_id": doc["mock_id"],
        "script_id": script_id,
        "position": entry.get("position"),
        "audio": _render_state(coach.document(row)) if row is not None else None,
        "plays": plays_view(doc),
    }


def abandon(session: Session, mock_id: str) -> dict[str, Any]:
    """Walk out of a sitting — and reopen the coach.

    Without this an abandoned mock locks the teaching layer until it goes stale, which
    would make one closed laptop cost a learner an afternoon. The attempt is marked
    ``abandoned`` rather than submitted, so it does *not* open the part gate: nobody who
    walked out has earned the transcript.
    """
    doc = load(session, mock_id)
    if doc.get("status") in LIVE_STATUSES:
        doc["status"] = "abandoned"
        doc["finished_at"] = _iso()
        attempt = _attempt(session, doc)
        if attempt.status == "in_progress":
            attempt.status = "abandoned"
        _close_envelope(session, doc)
        session.flush()
        _save(session, doc)
    return view(session, doc, include_parts=False)


def _close_envelope(session: Session, doc: dict[str, Any]) -> None:
    finished = doc.get("finished_at") or _iso()
    envelope = session.get(m.PracticeSession, doc["mock_id"])
    if envelope is None or envelope.ended_at is not None:
        return
    envelope.ended_at = finished
    started = _parse_iso(envelope.started_at)
    ended = _parse_iso(finished)
    envelope.duration_s = (
        int(max(0.0, (ended - started).total_seconds())) if started and ended else 0
    )


# ======================================================================================
# Exam conditions — the rule that makes a mock mean anything
# ======================================================================================


def exam_conditions(
    session: Session | None = None, profile_id: str | None = None
) -> dict[str, Any] | None:
    """The open sitting holding the coach shut, or ``None``.

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
        _log.debug("listening exam-conditions lookup failed", exc_info=True)
        return None


def _conditions(doc: dict[str, Any]) -> dict[str, Any]:
    clock = doc.get("clock") or {}
    return {
        "active": True,
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "status": doc.get("status"),
        "started_at": doc.get("started_at"),
        "delivery": doc.get("delivery"),
        "test_id": doc.get("test_id"),
        "current_part": clock.get("current_part"),
        "script_ids": [p.get("script_id") for p in doc.get("parts") or []],
        "withheld": list(WITHHELD),
        "plays_allowed": 1,
        "dictionary_enabled": False,
        "prediction_gate_enabled": False,
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
# Submit — one paper, marked deterministically, raw score first
# ======================================================================================

RAW_FIRST_NOTE = (
    "Raw score is the headline and the band is secondary, because the middle of the table "
    "is a swamp: 18 to 22 is a five-mark-wide band 5.5. A learner who goes from 19 to 22 "
    "has improved by fifteen per cent, and a band-first report tells them nothing happened."
)

ONE_TABLE_NOTE = (
    "One conversion table serves Academic and General Training, because Listening is "
    "literally the same test for both. Your listening band means the same thing whichever "
    "test you sat; your reading band does not. Seven marks separate band 6.0 from band "
    "7.0 — under two questions per part."
)

PART_NOTE = (
    "'Parts 3 and 4 are the hard ones' is not a usable diagnosis. Part 3 punishes losing "
    "track of who thinks what; Part 4 punishes losing your place. Those need completely "
    "different practice."
)

FORM_NOTE = (
    "These are form losses, not listening losses. You heard them. They need an answer-form "
    "fix and they are the cheapest marks on the paper to get back — three weeks of work, "
    "not six months."
)


def _key_index(session: Session, doc: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """Per-question authored material, keyed by question number across the whole paper."""
    index: dict[int, dict[str, Any]] = {}
    for entry in doc.get("parts") or []:
        row = session.get(m.ListeningScript, entry["script_id"])
        if row is None:  # pragma: no cover
            continue
        script_doc = coach.document(row)
        for question in coach.iter_questions(script_doc):
            raw_number = (
                question.get("n") if question.get("n") is not None else question.get("number")
            )
            try:
                number = int(raw_number)
            except (TypeError, ValueError):
                continue
            teaching = question.get("teaching")
            teaching = teaching if isinstance(teaching, dict) else {}
            distraction = teaching.get("distraction")
            distraction = distraction if isinstance(distraction, dict) else {}
            index[number] = {
                "script_id": row.id,
                "title": row.title,
                "part": int(row.part),
                "position": entry.get("position"),
                "qtype": str(question.get("type") or ""),
                "traps": [
                    str(distraction.get(key))
                    for key in ("trap", "trap_2")
                    if str(distraction.get(key) or "") in coach.TRAPS
                ],
                "recovery": teaching.get("recovery"),
            }
    return index


def _band_ladder(raw: int, total: int) -> dict[str, Any]:
    """The current band, the next one, and how many marks away it is.

    The most motivating single number available, and pure arithmetic on a published table.
    Seven marks separate band 6.0 from band 7.0, which is under two questions per part.
    """
    from bandready.server.routes.listening import RAW_TO_BAND, raw_to_band

    projected = raw if total in (0, 40) else round(raw * 40 / max(1, total))
    band = raw_to_band(projected)
    higher = [entry for entry in RAW_TO_BAND if entry[1] > band]
    next_band = min(higher, key=lambda e: e[1]) if higher else None
    width = next(
        (
            len(range(low, high + 1))
            for low, high in _band_bounds()
            if raw_to_band(low) == band and low <= projected <= high
        ),
        None,
    )
    return {
        "raw": raw,
        "projected_raw_40": projected,
        "band": band,
        "band_is_estimate": total != 40,
        "next_band": next_band[1] if next_band else None,
        "marks_to_next_band": max(0, next_band[0] - projected) if next_band else None,
        "band_width": width,
        "disclaimer": (
            "Indicative only. The marks needed for each band vary slightly from version "
            "to version of the real test."
        ),
        "note": RAW_FIRST_NOTE,
        "one_table_note": ONE_TABLE_NOTE,
    }


def _band_bounds() -> list[tuple[int, int]]:
    """``(low, high)`` for every band in the published table, so widths are computable."""
    from bandready.server.routes.listening import RAW_TO_BAND

    thresholds = sorted({entry[0] for entry in RAW_TO_BAND})
    out: list[tuple[int, int]] = []
    for index, low in enumerate(thresholds):
        high = (thresholds[index + 1] - 1) if index + 1 < len(thresholds) else 40
        out.append((low, high))
    return out


def _cascade_report(
    record: dict[str, Any], index: dict[int, dict[str, Any]]
) -> dict[str, Any]:
    """Consecutive misses following a single one — the module's best single analytic.

    "You got three wrong" is not actionable. "You lost Q17, and then you lost 18 and 19,
    which were easier" is, because it names a different failure: not comprehension, but
    the failure to rejoin the recording after losing your place. Runs are computed inside
    one part only, since every part boundary hands the learner a preview pause and a fresh
    start — a miss in Part 2 cannot cascade into Part 3.
    """
    marked = sorted(
        (q for q in record.get("per_question") or []),
        key=lambda q: int(q.get("number") or 0),
    )
    runs: list[dict[str, Any]] = []
    current: list[int] = []
    current_script: str | None = None

    def close(run: list[int], script_id: str | None) -> None:
        if len(run) < 3:
            return
        trigger = run[0]
        follow_on = run[1:]
        meta = index.get(trigger) or {}
        after = index.get(run[1]) or {}
        runs.append(
            {
                "trigger": trigger,
                "lost_after": follow_on,
                "marks_lost_to_the_cascade": len(follow_on),
                "script_id": script_id,
                "part": meta.get("part"),
                "verdict": (
                    f"You lost Q{trigger}, and then you lost "
                    f"{', '.join(str(n) for n in follow_on)}. One miss cost you "
                    f"{len(run)} marks."
                ),
                # The handhold that was available and unused, from the question *after*
                # the miss — which is the only place a recovery note can help.
                "recovery": after.get("recovery"),
            }
        )

    for entry in marked:
        number = int(entry.get("number") or 0)
        meta = index.get(number) or {}
        script_id = meta.get("script_id")
        if entry.get("correct"):
            close(current, current_script)
            current = []
            current_script = script_id
            continue
        if current and script_id != current_script:
            close(current, current_script)
            current = []
        current_script = script_id
        current.append(number)
    close(current, current_script)

    total_lost = sum(run["marks_lost_to_the_cascade"] for run in runs)
    return {
        "runs": runs,
        "count": len(runs),
        "marks_lost_to_cascades": total_lost,
        "note": (
            "A cascade is not three comprehension failures, it is one miss plus a failure "
            "to rejoin. The fix is a habit, not vocabulary: on a miss, jump forward to the "
            "next printed anchor and wait there. Never hunt backwards — the audio is not "
            "going back either."
            if runs
            else "No cascades: every miss stayed a single miss. That is the habit to keep."
        ),
    }


def _trap_report(
    record: dict[str, Any], index: dict[int, dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Marks lost per trap, with the form-and-process losses counted separately.

    The separation is the whole point and it must never be folded into "wrong". A learner
    who lost three marks to spelling heard all three answers correctly: telling them to
    listen harder sends them to re-do a skill they already have, and telling them it is a
    three-week orthography fix is the single most motivating diagnosis this module can
    produce.

    Form losses are derived from **what the learner actually wrote**, never from the
    authored ``form.risk``. That field records the risk the item carries; it is not
    evidence that this learner hit it, and classifying every wrong answer on a
    spelling-risky item as a spelling error would manufacture the report's most flattering
    diagnosis out of nothing.
    """
    from bandready.scoring.answers import LETTER_TYPES, normalize_letters

    lost: dict[str, list[int]] = {}
    form: dict[str, list[int]] = {}
    for entry in record.get("per_question") or []:
        if entry.get("correct"):
            continue
        number = int(entry.get("number") or 0)
        meta = index.get(number) or {}
        given = str(entry.get("given") or "").strip()
        qtype = str(entry.get("type") or meta.get("qtype") or "")
        if not given:
            form.setdefault("blank", []).append(number)
        elif entry.get("over_limit"):
            form.setdefault("over_limit", []).append(number)
        elif entry.get("near_miss_spelling"):
            form.setdefault("spelling", []).append(number)
        elif qtype in LETTER_TYPES and not normalize_letters(given):
            form.setdefault("wrote_word_not_letter", []).append(number)
        for slug in meta.get("traps") or []:
            lost.setdefault(slug, []).append(number)

    comprehension: list[dict[str, Any]] = []
    for slug, numbers in lost.items():
        entry = coach.TRAPS.get(slug)
        if entry is None:  # pragma: no cover
            continue
        comprehension.append(
            {
                "slug": slug,
                "label": entry["label"],
                "family": entry["family"],
                "family_label": coach.TRAP_FAMILIES[entry["family"]],
                "what_happened": entry["what_happened"],
                "signal": entry["signal"],
                "fix": entry["fix"],
                "marks_lost": len(numbers),
                "questions": sorted(numbers),
            }
        )
    comprehension.sort(key=lambda e: (-e["marks_lost"], e["slug"]))

    form_rows: list[dict[str, Any]] = []
    for slug, numbers in form.items():
        entry = coach.FORM_RISKS.get(slug) or coach.PROCESS.get(slug)
        if entry is None:  # pragma: no cover
            continue
        form_rows.append(
            {
                "slug": slug,
                "label": entry["label"],
                "what_happened": entry["what_happened"],
                "fix": entry["fix"],
                "marks_lost": len(numbers),
                "questions": sorted(numbers),
            }
        )
    form_rows.sort(key=lambda e: (-e["marks_lost"], e["slug"]))

    summary = {
        "rows": form_rows,
        "marks_lost_to_form": sum(row["marks_lost"] for row in form_rows),
        "blank": len(form.get("blank", [])),
        "spelling": len(form.get("spelling", [])),
        "over_limit": len(form.get("over_limit", [])),
        "note": FORM_NOTE,
    }
    return comprehension, summary


def _next_actions(
    per_part: list[dict[str, Any]],
    per_type: list[dict[str, Any]],
    traps: list[dict[str, Any]],
    form_summary: dict[str, Any],
    cascades: dict[str, Any],
    ladder: dict[str, Any],
) -> list[str]:
    """One recommended action, then at most two more. Never a table of percentages."""
    actions: list[str] = []
    if form_summary["blank"]:
        actions.append(
            f"{form_summary['blank']} box(es) went in blank. There is no negative marking, "
            "so in the check window every empty box gets the most plausible item of its "
            "predicted slot type. That is free marks and a process fix, not a listening fix."
        )
    if form_summary["spelling"]:
        actions.append(
            f"{form_summary['spelling']} mark(s) went to spelling — you heard those answers. "
            "Run a dictation drill on the lines you missed; this is a three-week fix."
        )
    if cascades["runs"]:
        worst = max(cascades["runs"], key=lambda r: r["marks_lost_to_the_cascade"])
        actions.append(
            f"{worst['verdict']} Drill recovery: on a miss, jump to the next printed "
            "anchor and rejoin there rather than hunting backwards."
        )
    if traps:
        lead = traps[0]
        actions.append(f"{lead['label']} cost {lead['marks_lost']} mark(s). {lead['fix']}")
    weakest_part = min(
        (p for p in per_part if p["total"] >= 5),
        key=lambda p: p["correct"] / p["total"],
        default=None,
    )
    if weakest_part and weakest_part["correct"] < weakest_part["total"]:
        actions.append(
            f"Part {weakest_part['part']}: {weakest_part['correct']}/{weakest_part['total']}. "
            + (
                "Part 3 punishes losing track of who thinks what — practise attribution."
                if weakest_part["part"] == 3
                else "Part 4 punishes losing your place — practise signpost tracking."
                if weakest_part["part"] == 4
                else "Practise this part's types before your next full paper."
            )
        )
    weakest_type = min(
        (t for t in per_type if t["total"] >= 3),
        key=lambda t: t["correct"] / t["total"],
        default=None,
    )
    if weakest_type and weakest_type["correct"] < weakest_type["total"]:
        actions.append(
            f"{weakest_type['label']}: {weakest_type['correct']}/{weakest_type['total']}. "
            "Drill that type before your next full paper."
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
    """Close the sitting, mark it, and report raw score first.

    Marking is not reimplemented here. ``POST /listening/attempts/{id}/submit`` already
    flattens the questions out of the content documents, runs every comparison through the
    shared normalizer at :mod:`bandready.scoring.answers`, handles the multi-slot "choose
    TWO" rule, tags near-miss spellings, writes the ``listening_answers`` rows and converts
    raw to band with the published table. Calling it means a mock and a practice attempt
    can never disagree about whether an answer was right, which is the only acceptable
    relationship between them.
    """
    from bandready.server.routes.listening import AttemptPatch, submit_attempt

    doc = load(session, mock_id)
    if doc.get("status") == "complete" and doc.get("report") and not force:
        return doc["report"]
    if doc.get("status") in ("preparing", "ready"):
        raise ApiError(
            409,
            "conflict",
            f"listening mock {mock_id} has not been started — there is nothing to mark",
        )
    if doc.get("status") == "abandoned":
        # Nobody who walked out has earned a band, and marking a walk-out would open the
        # coach's gate on four parts that were never really sat.
        raise ApiError(
            409, "conflict", f"listening mock {mock_id} was abandoned and cannot be marked"
        )

    clock = doc.setdefault("clock", {})
    if seconds_elapsed is not None:
        clock["seconds_elapsed"] = max(0.0, float(seconds_elapsed))
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    limit = float((doc.get("timing") or {}).get("total_s") or 0.0)
    # A sitting whose clock has run out was ended by the clock whatever the client says.
    auto = bool(auto_submitted or (limit and elapsed >= limit))

    attempt_id = doc.get("attempt_id") or doc["mock_id"]
    record = submit_attempt(
        attempt_id,
        AttemptPatch(seconds_elapsed=int(elapsed)),
        _=None,
        session=session,
    )

    doc["status"] = "complete"
    doc["finished_at"] = doc.get("finished_at") or _iso()
    _close_envelope(session, doc)

    report = _build_report(session, doc, record, auto_submitted=auto)
    doc["report"] = report
    session.flush()
    _save(session, doc)
    return report


def _build_report(
    session: Session,
    doc: dict[str, Any],
    record: dict[str, Any],
    *,
    auto_submitted: bool,
) -> dict[str, Any]:
    index = _key_index(session, doc)
    raw = int(record.get("raw_score") or 0)
    total = int(record.get("total_questions") or 0)

    per_part_raw = {p["script_id"]: p for p in record.get("per_part") or []}
    per_part: list[dict[str, Any]] = []
    for entry in doc.get("parts") or []:
        marks = per_part_raw.get(entry["script_id"]) or {}
        part_total = int(marks.get("total") or entry.get("questions") or 0)
        correct = int(marks.get("correct") or 0)
        per_part.append(
            {
                "position": entry.get("position"),
                "part": int(marks.get("part") or entry.get("part") or entry.get("position") or 0),
                "script_id": entry["script_id"],
                "title": entry.get("title"),
                "accent_set": entry.get("accent_set"),
                "correct": correct,
                "total": part_total,
                "pct": round(100.0 * correct / part_total, 1) if part_total else None,
                "played": int((doc.get("plays") or {}).get(entry["script_id"], 0) or 0),
            }
        )
    per_part.sort(key=lambda p: (p["position"] or 0))

    per_type: list[dict[str, Any]] = []
    for qtype, stats in (record.get("per_type") or {}).items():
        static = coach.TYPE_STRATEGY.get(qtype)
        type_total = int(stats.get("total") or 0)
        correct = int(stats.get("correct") or 0)
        per_type.append(
            {
                "qtype": qtype,
                "label": static.label if static else qtype.replace("_", " "),
                "correct": correct,
                "total": type_total,
                "pct": round(100.0 * correct / type_total, 1) if type_total else None,
                "rule": static.rule if static else None,
            }
        )
    per_type.sort(key=lambda t: (t["pct"] if t["pct"] is not None else 101, t["qtype"]))

    traps, form_summary = _trap_report(record, index)
    cascades = _cascade_report(record, index)
    ladder = _band_ladder(raw, total)
    actions = _next_actions(per_part, per_type, traps, form_summary, cascades, ladder)

    clock = doc.get("clock") or {}
    timing = doc.get("timing") or {}
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    unplayed = [
        p["script_id"]
        for p in doc.get("parts") or []
        if int((doc.get("plays") or {}).get(p["script_id"], 0) or 0) == 0
    ]

    return {
        "mock_id": doc["mock_id"],
        "attempt_id": doc.get("attempt_id") or doc["mock_id"],
        "status": "complete",
        "delivery": doc.get("delivery"),
        "delivery_label": doc.get("delivery_label"),
        "modelled": (
            f"{doc.get('delivery_label')} format — {timing.get('window_label')} at the end. "
            f"{DELIVERY_MNEMONIC}"
        ),
        "test_id": doc.get("test_id"),
        "title": doc.get("title"),
        "seed": doc.get("seed"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "auto_submitted": bool(auto_submitted or record.get("auto_submitted")),
        # Raw score leads. Deliberately the first substantive key and the first thing the
        # UI renders — the band is a five-mark-wide bucket in the middle of the table.
        "score": {
            "raw_score": raw,
            "total_questions": total,
            "projected_raw_40": ladder["projected_raw_40"],
            "band": record.get("band") if record.get("band") is not None else ladder["band"],
            "band_is_estimate": ladder["band_is_estimate"],
            "note": RAW_FIRST_NOTE,
            "one_table_note": ONE_TABLE_NOTE,
        },
        "band_ladder": ladder,
        # Then the per-part split, because "parts 3 and 4 are the hard ones" is not a
        # diagnosis and the two parts fail for completely different reasons.
        "per_part": per_part,
        "per_part_note": PART_NOTE,
        "per_type": per_type,
        # Then the form/comprehension split, then the cascade.
        "per_trap": traps,
        "answer_form": form_summary,
        "cascades": cascades,
        "per_question": record.get("per_question"),
        "near_miss_spellings": record.get("near_miss_spellings") or [],
        "srs_candidates": record.get("srs_candidates") or [],
        "timing": {
            "delivery": timing.get("delivery"),
            "window_label": timing.get("window_label"),
            "audio_minutes": _minutes(float(timing.get("audio_s") or 0.0)),
            "window_minutes": _minutes(float(timing.get("window_s") or 0.0)),
            "elapsed_minutes": _minutes(elapsed),
            "check_protocol": list(coach.CHECK_PROTOCOL),
            "check_note": coach.CHECK_NOTE,
        },
        "unplayed_parts": unplayed,
        "next_actions": actions,
        "review_url": f"/api/v1/listening/attempts/{doc.get('attempt_id') or doc['mock_id']}/review",
        "coach_reopened": True,
    }


# ======================================================================================
# History — the trajectory the Progress screen plots
# ======================================================================================


def history(session: Session, profile_id: str, *, limit: int = 25) -> dict[str, Any]:
    """Every sitting this learner has taken, newest first, plus the plottable trajectory.

    Raw score is the trajectory's primary series and the band is secondary, for the same
    reason the report says so: 18 to 22 is one band, and a learner improving inside it must
    be able to see the improvement.
    """
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, status, created_at, doc_json FROM listening_mocks "
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
        items.append(
            {
                "mock_id": mock_id,
                "attempt_id": doc.get("attempt_id") or mock_id,
                "status": status,
                "delivery": doc.get("delivery"),
                "test_id": doc.get("test_id"),
                "title": doc.get("title"),
                "seed": doc.get("seed"),
                "created_at": doc.get("created_at") or created_at,
                "started_at": doc.get("started_at"),
                "finished_at": doc.get("finished_at"),
                "raw_score": score.get("raw_score"),
                "total_questions": score.get("total_questions"),
                "band": score.get("band"),
                "part_scores": [p.get("correct") for p in report.get("per_part") or []],
                "marks_lost_to_form": (report.get("answer_form") or {}).get(
                    "marks_lost_to_form"
                ),
                "cascades": (report.get("cascades") or {}).get("count"),
                "weakest_type": (report.get("per_type") or [{}])[0].get("qtype")
                if report.get("per_type")
                else None,
            }
        )

    scored = [i for i in items if i["raw_score"] is not None]
    trajectory = [
        {
            "mock_id": i["mock_id"],
            "at": i["finished_at"] or i["started_at"] or i["created_at"],
            "raw_score": i["raw_score"],
            "band": i["band"],
            "part_scores": i["part_scores"],
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
    "BRIEFING_TITLE",
    "DEFAULT_DELIVERY",
    "DELIVERY",
    "DELIVERY_MNEMONIC",
    "EXAM_CONDITIONS_MESSAGE",
    "LIVE_STATUSES",
    "MOCK_STATUSES",
    "PARTS_PER_TEST",
    "QUESTIONS_PER_TEST",
    "WITHHELD",
    "DeliveryMode",
    "MockPatch",
    "abandon",
    "assemble",
    "audio_progress",
    "briefing",
    "clock_view",
    "create",
    "ensure_schema",
    "exam_conditions",
    "exam_parts",
    "find",
    "history",
    "inspect",
    "load",
    "locked_gate",
    "patch",
    "play",
    "plays_view",
    "refresh",
    "refusal",
    "start",
    "submit",
    "timing_plan",
    "view",
]
