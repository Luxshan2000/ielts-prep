"""The 60-minute Writing Mock — one sitting, two tasks, one clock (content DESIGN §9 F8).

A writing mock is **not** two practices in a row. Two practices are two clocks, two
submits and a coffee in between; the real paper is one hour in which the candidate is
handed both tasks at minute zero and has to decide, alone and under pressure, how much of
that hour each one deserves. Almost everybody decides wrongly, and it is the most
expensive error in the module — which is why the report here leads with the time verdict
and only then shows a band.

Four rules run this module.

**1. One sitting, both tasks, free allocation.** Task 1 and Task 2 are both visible and
editable from the first second. Research suggested hiding Task 2 until Task 1 is done;
that was overruled in the content contract and it is overruled here, because the freedom
*is* the lesson. Hiding half the paper would remove the trap we exist to teach and reduce
fidelity at the same time.

**2. The coach is shut for the duration.** :func:`exam_conditions` closes the whole
teaching layer while a sitting is open — model answers, the sentence ladder, the plan,
the language bank, the error watchlist, the compare screen — *even for a prompt the
learner has already attempted and legitimately unlocked*. A mock you can look things up
during measures your reading, not your writing. The refusal happens server-side, in
:mod:`bandready.writing.coach`, where the renderer cannot negotiate with it.

**3. The clock is a single hour.** Sixty minutes for the pair; the 20/40 split is a
*target*, not an enforcement. Per-task time is attributed silently from the autosave
stream and never shown during the sitting — showing it would coach the very decision
being measured. Nothing auto-submits at zero: the clock turns over and counts up, and
overtime is recorded on both attempts.

**4. One submit, both scored, Task 2 weighted double.** Scoring itself is delegated
wholesale to :mod:`bandready.scoring.writing` — the same evaluator, the same anchoring,
the same audit rows as a practice attempt. What this module adds is the combination:
``round_ielts((T1 + 2 × T2) / 3)`` through the one shared rounding helper, labelled an
**estimate** every time it is shown, with a footnote saying why. This is the only place in
the app where a combined Writing band appears at all.

State lives in ``writing_mocks``, a small side table created on demand (see
:func:`ensure_schema`). The two attempts are ordinary ``writing_submissions`` rows in
``mode: "exam"``, so every existing autosave, pre-check, report and history surface keeps
working on them unchanged.
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
from bandready.scoring import writing as scoring
from bandready.scoring.bands import round_ielts
from bandready.server.errors import ApiError
from bandready.writing import coach

_log = logging.getLogger("bandready.writing.mock")

MOCK_SCHEMA_VERSION = 1


# ======================================================================================
# The exam clock and the weighting. Every number here is a fact about the format.
# ======================================================================================


@dataclass(frozen=True)
class MockTimings:
    """The sitting's budget, in seconds.

    ``total_s`` is the only figure enforced against the candidate, and even it is
    enforced softly: at zero the clock inverts and counts up rather than snatching the
    paper away. The per-task figures are the *recommended* split — the thing the learner
    is being taught to hit and the thing the report measures them against.
    """

    total_s: float = 3600.0
    task1_target_s: float = 1200.0   # 20 minutes
    task2_target_s: float = 2400.0   # 40 minutes

    def target_for(self, slot: str) -> float:
        return self.task1_target_s if slot == "task1" else self.task2_target_s


TIMINGS = MockTimings()

SLOTS: tuple[str, ...] = ("task1", "task2")

#: Which Task 1 the learner sits is a property of the exam they booked, not a preference.
MODULES: tuple[str, ...] = ("academic", "general_training")
TASK1_TYPE: dict[str, str] = {"academic": "ac_task1", "general_training": "gt_task1"}

#: Task 2 is worth twice Task 1. Consistently reported, not printed in the published
#: descriptor document — hence the label and the footnote that travel with every figure.
TASK2_WEIGHT = 2

WEIGHTING_LABEL = "Estimated Writing band"
WEIGHTING_FORMULA = "round_ielts((Task 1 + 2 × Task 2) / 3)"
WEIGHTING_FOOTNOTE = (
    "An estimate. Task 2 counting double is consistently reported but is not printed in "
    "the published band descriptor document, and the order in which the two tasks are "
    "combined and rounded is not published either. Treat it as a direction of travel, "
    "not a result."
)

#: How long an unfinished sitting keeps the coach shut. A learner who closed the laptop
#: mid-mock must not find the teaching layer bricked tomorrow morning.
STALE_AFTER_S = 4 * 3600.0

MOCK_STATUSES: tuple[str, ...] = ("in_progress", "complete", "abandoned")

#: Everything exam conditions withhold, named so the UI can say why a tab is dark.
WITHHELD: tuple[str, ...] = (
    "model_answers",
    "sentence_ladder",
    "swap_slots",
    "plan",
    "structure_plan",
    "time_plan",
    "parts_checklist",
    "language_bank",
    "collocations",
    "upgrade_pairs",
    "target_structures",
    "error_watchlist",
    "checklist",
    "rewrite_focus",
    "overview_brief",
    "letter_brief",
    "essay_brief",
    "compare",
    "templates",
)

EXAM_CONDITIONS_MESSAGE = (
    "You are in a writing mock. The coach is closed until you submit — no model answers, "
    "no frames, no plan, no watchlist. That is the point: a mock you can look things up "
    "during measures your reading, not your writing."
)

#: What a coherent pairing means, and the order the constraints are given up in when a
#: thin pack cannot satisfy them all. Tags go first (softest), difficulty next, and the
#: distinct topic last — sitting two tasks on the same subject is the one pairing that
#: actively teaches the wrong thing, because one set of ideas would serve both answers.
COHERENCE_RULES: tuple[str, ...] = ("distinct_topic", "distinct_tags", "difficulty_within_one")
RELAX_ORDER: tuple[str, ...] = ("distinct_tags", "difficulty_within_one", "distinct_topic")


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


def _tags(raw: Any) -> set[str]:
    return {str(tag).strip().lower() for tag in coach.loads(raw, []) if str(tag).strip()}


# ======================================================================================
# Storage
# ======================================================================================

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS writing_mocks (
        mock_id     TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        status      TEXT NOT NULL,
        seed        INTEGER,
        module      TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        doc_json    TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_writing_mocks_live
        ON writing_mocks (profile_id, status, created_at)
    """,
)


def ensure_schema(session: Session) -> None:
    """Create the mock side table if it is not there yet.

    Created here rather than in a migration because this module owns the table and
    nothing else reads it; the DDL is idempotent and costs a no-op statement per call.
    ``practice_sessions.summary_json`` was not an option — the two attempts each own their
    own envelope row, and the sitting is the thing that joins them.
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
            "INSERT INTO writing_mocks "
            "  (mock_id, profile_id, status, seed, module, created_at, updated_at, doc_json) "
            "VALUES (:mid, :pid, :status, :seed, :module, :created, :updated, :doc) "
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
            "created": doc["created_at"],
            "updated": doc["updated_at"],
            "doc": json.dumps(doc, ensure_ascii=False),
        },
    )
    return doc


def find(session: Session, mock_id: str) -> dict[str, Any] | None:
    ensure_schema(session)
    row = session.execute(
        sa_text("SELECT doc_json FROM writing_mocks WHERE mock_id = :mid"),
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
        raise ApiError(404, "not_found", f"no writing mock {mock_id!r}")
    return doc


def _live_row(session: Session, profile_id: str) -> dict[str, Any] | None:
    """The one sitting that is still open and not stale, if there is one."""
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, created_at, doc_json FROM writing_mocks "
            "WHERE profile_id = :pid AND status = 'in_progress' "
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
    """One prompt that could carry half a sitting."""

    prompt_id: str
    task_type: str
    genre: str
    topic_id: str | None
    tags: frozenset[str]
    difficulty: int
    last_seen_at: str | None


def _last_seen(session: Session, profile_id: str) -> dict[str, str]:
    """When this learner last wrote on each prompt.

    ``writing_prompts`` carries no ``last_served_at`` column, so least-recently-served is
    derived from the learner's own history instead of from a global counter — which is
    the better signal anyway. Handing back the chart somebody sat on Tuesday is the thing
    to avoid, and whether another profile saw it is beside the point.
    """
    rows = session.execute(
        sa_text(
            "SELECT ws.prompt_id, MAX(ps.started_at) FROM writing_submissions ws "
            "JOIN practice_sessions ps ON ps.id = ws.id "
            "WHERE ps.profile_id = :pid GROUP BY ws.prompt_id"
        ),
        {"pid": profile_id},
    ).all()
    return {str(prompt_id): str(seen) for prompt_id, seen in rows if seen}


def _candidates(
    session: Session,
    profile_id: str,
    task_type: str,
    *,
    difficulty: int | None = None,
) -> list[_Candidate]:
    """Every live prompt of one task type, in least-recently-served order."""
    seen = _last_seen(session, profile_id)
    params: dict[str, Any] = {"task_type": task_type}
    where = ["retired = 0", "task_type = :task_type"]
    if difficulty is not None:
        where.append("difficulty = :difficulty")
        params["difficulty"] = int(difficulty)
    rows = session.execute(
        sa_text(
            "SELECT id, task_type, genre, topic_id, topic_tags, difficulty "
            f"FROM writing_prompts WHERE {' AND '.join(where)} ORDER BY id"
        ),
        params,
    ).all()

    out = [
        _Candidate(
            prompt_id=str(row[0]),
            task_type=str(row[1]),
            genre=str(row[2] or ""),
            topic_id=str(row[3]) if row[3] else None,
            tags=frozenset(_tags(row[4])),
            difficulty=int(row[5] or 2),
            last_seen_at=seen.get(str(row[0])),
        )
        for row in rows
    ]
    # Never-written prompts sort first, then the oldest, exactly as the drill picker does.
    out.sort(key=lambda c: (c.last_seen_at is not None, c.last_seen_at or "", c.prompt_id))
    return out


def _coherent(a: _Candidate, b: _Candidate, enforced: set[str]) -> bool:
    """Whether these two prompts make one sitting rather than two unrelated exercises."""
    if "distinct_topic" in enforced and a.topic_id and b.topic_id and a.topic_id == b.topic_id:
        return False
    if "distinct_tags" in enforced and a.tags & b.tags:
        return False
    return not (
        "difficulty_within_one" in enforced and abs(a.difficulty - b.difficulty) > 1
    )


def _pair(
    task1: list[_Candidate], task2: list[_Candidate], seed: int | None
) -> tuple[_Candidate, _Candidate, list[str]]:
    """Pick one Task 1 and one Task 2 that belong in the same hour.

    Unseeded, the pools arrive least-recently-served first and the first coherent pair
    wins — so a repeat mock is a different sitting. Seeded, both pools are shuffled by the
    seed instead, because the whole point of a seed is that the same number produces the
    same paper tomorrow, and least-recently-served order changes every time a mock is sat.

    Constraints are given up one at a time, softest first, and every relaxation is
    reported rather than hidden: a two-prompt pack should still be able to open a mock,
    and the caller deserves to know the pairing was compromised.
    """
    if seed is not None:
        rng = random.Random(seed)
        task1 = sorted(task1, key=lambda c: c.prompt_id)
        task2 = sorted(task2, key=lambda c: c.prompt_id)
        rng.shuffle(task1)
        rng.shuffle(task2)

    for dropped in range(len(RELAX_ORDER) + 1):
        relaxed = list(RELAX_ORDER[:dropped])
        enforced = set(COHERENCE_RULES) - set(relaxed)
        for a in task1:
            for b in task2:
                if _coherent(a, b, enforced):
                    return a, b, relaxed
    # Unreachable: with every rule relaxed `_coherent` is unconditionally true and both
    # pools are non-empty by the time we are called.
    raise ApiError(500, "internal", "could not pair a writing mock")  # pragma: no cover


def assemble(
    session: Session,
    profile_id: str,
    *,
    module: str = "academic",
    seed: int | None = None,
    task1_prompt_id: str | None = None,
    task2_prompt_id: str | None = None,
    difficulty: int | None = None,
) -> dict[str, Any]:
    """Build one coherent sitting. Pure — it reads history but writes nothing."""
    wanted_module = (module or "academic").strip().lower()
    if wanted_module not in MODULES:
        raise ApiError(
            422, "validation_error", f"module must be one of {', '.join(MODULES)}"
        )
    task1_type = TASK1_TYPE[wanted_module]

    pool1 = _candidates(session, profile_id, task1_type, difficulty=difficulty)
    pool2 = _candidates(session, profile_id, "task2", difficulty=difficulty)
    if task1_prompt_id:
        pool1 = [c for c in pool1 if c.prompt_id == task1_prompt_id]
        if not pool1:
            raise ApiError(
                404,
                "not_found",
                f"writing prompt {task1_prompt_id!r} is not a live {task1_type} prompt",
            )
    if task2_prompt_id:
        pool2 = [c for c in pool2 if c.prompt_id == task2_prompt_id]
        if not pool2:
            raise ApiError(
                404,
                "not_found",
                f"writing prompt {task2_prompt_id!r} is not a live task2 prompt",
            )
    if not pool1 or not pool2:
        raise ApiError(
            422,
            "validation_error",
            f"the pack cannot open a {wanted_module} writing mock — it needs at least one "
            f"live {task1_type} prompt and one live task2 prompt"
            + (f" at difficulty {difficulty}" if difficulty else ""),
        )

    first, second, relaxed = _pair(pool1, pool2, seed)
    tasks = [_task_doc("task1", first), _task_doc("task2", second)]
    return {
        "module": wanted_module,
        "seed": seed,
        "duration_s": TIMINGS.total_s,
        "tasks": tasks,
        "coherence": {
            "distinct_topic": first.topic_id != second.topic_id,
            "shared_tags": sorted(first.tags & second.tags),
            "difficulty_delta": abs(first.difficulty - second.difficulty),
            "relaxed": relaxed,
            "rules": list(COHERENCE_RULES),
        },
    }


def _task_doc(slot: str, candidate: _Candidate) -> dict[str, Any]:
    meta = scoring.TASKS.get(candidate.task_type, {})
    return {
        "slot": slot,
        "attempt_id": None,
        "prompt_id": candidate.prompt_id,
        "task_type": candidate.task_type,
        "task_label": meta.get("label", candidate.task_type),
        "genre": candidate.genre,
        "topic_id": candidate.topic_id,
        "difficulty": candidate.difficulty,
        "min_words": meta.get("min_words"),
        "target_s": TIMINGS.target_for(slot),
        "target_minutes": int(TIMINGS.target_for(slot) // 60),
    }


# ======================================================================================
# The sitting: create, read, autosave
# ======================================================================================


def create(
    session: Session,
    profile_id: str,
    *,
    module: str = "academic",
    seed: int | None = None,
    task1_prompt_id: str | None = None,
    task2_prompt_id: str | None = None,
    difficulty: int | None = None,
) -> dict[str, Any]:
    """Assemble a sitting and open it. One in-progress mock per learner, by design."""
    ensure_schema(session)

    existing = _live_row(session, profile_id)
    if existing is not None:
        raise ApiError(
            409,
            "conflict",
            f"writing mock {existing['mock_id']} is still in progress — submit it, or "
            "POST …/abandon, before starting another",
        )

    plan = assemble(
        session,
        profile_id,
        module=module,
        seed=seed,
        task1_prompt_id=task1_prompt_id,
        task2_prompt_id=task2_prompt_id,
        difficulty=difficulty,
    )

    mock_id = f"wm_{ULID()}"
    started = _iso()

    # The sitting gets its own envelope row so it shows up in the generic practice feed
    # as one hour of work rather than as two unrelated attempts.
    session.add(
        m.PracticeSession(
            id=mock_id,
            profile_id=profile_id,
            module="writing",
            activity="writing_mock",
            started_at=started,
        )
    )

    for task in plan["tasks"]:
        attempt_id = f"wa_{ULID()}"
        task["attempt_id"] = attempt_id
        session.add(
            m.PracticeSession(
                id=attempt_id,
                profile_id=profile_id,
                module="writing",
                activity=task["task_type"],
                started_at=started,
            )
        )
        session.add(
            m.WritingSubmission(
                id=attempt_id,
                prompt_id=task["prompt_id"],
                # `exam` is not decoration: the existing PATCH handler reads it to decide
                # whether overtime is tracked at all.
                mode="exam",
                status="draft",
                essay_text="",
                outline_text="",
                word_count=0,
                seconds_elapsed=0,
                overtime_seconds=0,
                paste_events=0,
            )
        )

    doc: dict[str, Any] = {
        "schema_version": MOCK_SCHEMA_VERSION,
        "mock_id": mock_id,
        "profile_id": profile_id,
        "status": "in_progress",
        "created_at": started,
        "updated_at": started,
        "started_at": started,
        "finished_at": None,
        "clock": {
            "seconds_elapsed": 0.0,
            "active_slot": "task1",
            "task1_seconds": 0.0,
            "task2_seconds": 0.0,
            "attributed": False,
            "last_patch_at": started,
        },
        "report": None,
        **plan,
    }
    session.flush()
    _save(session, doc)
    return doc


def _task(doc: dict[str, Any], slot: str) -> dict[str, Any]:
    for task in doc.get("tasks") or []:
        if task.get("slot") == slot:
            return task
    raise ApiError(422, "validation_error", f"unknown task slot {slot!r}")


def clock_view(doc: dict[str, Any]) -> dict[str, Any]:
    """The single hour, as the top bar renders it.

    ``task1_seconds`` / ``task2_seconds`` are deliberately **not** in here. They are
    tracked from the first autosave and reported the moment the sitting ends, but showing
    them during the hour would coach the exact decision the mock exists to measure.
    """
    clock = doc.get("clock") or {}
    elapsed = float(clock.get("seconds_elapsed") or 0.0)
    total = float(doc.get("duration_s") or TIMINGS.total_s)
    remaining = total - elapsed
    return {
        "duration_s": total,
        "seconds_elapsed": round(elapsed, 1),
        "remaining_s": round(remaining, 1),
        # Past zero the countdown inverts and counts up. Nothing auto-submits: taking the
        # paper away mid-sentence teaches panic, and overtime is more useful recorded.
        "overtime_s": round(max(0.0, -remaining), 1),
        "expired": remaining <= 0,
        "active_slot": clock.get("active_slot") or "task1",
    }


def view(session: Session, doc: dict[str, Any]) -> dict[str, Any]:
    """What ``GET /mock/sessions/{id}`` answers: the two tasks, the clock, the state."""
    tasks: list[dict[str, Any]] = []
    for task in doc.get("tasks") or []:
        row = session.get(m.WritingSubmission, task.get("attempt_id"))
        prompt = session.get(m.WritingPrompt, task.get("prompt_id"))
        tasks.append(
            {
                **task,
                "prompt_text": prompt.prompt_text if prompt is not None else None,
                "chart_spec": coach.loads(prompt.chart_spec, {}) or None
                if prompt is not None
                else None,
                "letter_bullets": (
                    coach.loads(prompt.letter_bullets, []) if prompt is not None else []
                ),
                "essay_text": row.essay_text if row is not None else "",
                "outline_text": row.outline_text if row is not None else "",
                "word_count": int(row.word_count or 0) if row is not None else 0,
                "status": row.status if row is not None else None,
                "paste_events": int(row.paste_events or 0) if row is not None else 0,
                "integrity_flag": row.integrity_flag if row is not None else None,
            }
        )
    return {
        "mock_id": doc["mock_id"],
        "status": doc.get("status"),
        "module": doc.get("module"),
        "seed": doc.get("seed"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "clock": clock_view(doc),
        "tasks": tasks,
        "coherence": doc.get("coherence"),
        "exam_conditions": _conditions(doc) if doc.get("status") == "in_progress" else None,
        "weighting": {
            "label": WEIGHTING_LABEL,
            "formula": WEIGHTING_FORMULA,
            "footnote": WEIGHTING_FOOTNOTE,
        },
        "report": doc.get("report"),
    }


@dataclass(frozen=True)
class TaskPatch:
    """One task's slice of an autosave."""

    slot: str
    essay_text: str | None = None
    outline_text: str | None = None
    paste_events: int | None = None
    last_paste_words: int | None = None


def patch(
    session: Session,
    mock_id: str,
    *,
    seconds_elapsed: float | None = None,
    active_slot: str | None = None,
    tasks: list[TaskPatch] | None = None,
) -> dict[str, Any]:
    """Autosave both scripts and the one clock.

    Per-task time is attributed here and nowhere else. The renderer owns the clock (it
    knows about tab visibility and the learner's machine going to sleep), so it sends the
    sitting's elapsed seconds and which task was on screen; the delta since the last
    autosave is credited to that task. It is an approximation by construction — a ten
    second poll cannot see a five second glance — and it is the only honest per-task
    number available without pretending the server can see the screen.
    """
    doc = load(session, mock_id)
    if doc.get("status") != "in_progress":
        raise ApiError(
            409,
            "conflict",
            f"writing mock {mock_id} is {doc.get('status')} — it can no longer be edited",
        )

    clock = doc.setdefault(
        "clock",
        {
            "seconds_elapsed": 0.0,
            "active_slot": "task1",
            "task1_seconds": 0.0,
            "task2_seconds": 0.0,
            "attributed": False,
            "last_patch_at": doc.get("started_at"),
        },
    )
    previous_slot = clock.get("active_slot") or "task1"

    if seconds_elapsed is not None:
        new_elapsed = max(0.0, float(seconds_elapsed))
        delta = new_elapsed - float(clock.get("seconds_elapsed") or 0.0)
        if delta > 0:
            # The slice that just elapsed belongs to whatever was on screen *during* it,
            # which is the slot named by the previous autosave, not the new one.
            key = f"{previous_slot}_seconds"
            clock[key] = float(clock.get(key) or 0.0) + delta
            clock["attributed"] = True
        clock["seconds_elapsed"] = new_elapsed
    if active_slot:
        if active_slot not in SLOTS:
            raise ApiError(
                422, "validation_error", f"active_slot must be one of {', '.join(SLOTS)}"
            )
        clock["active_slot"] = active_slot
    clock["last_patch_at"] = _iso()

    flag_at = int(scoring.thresholds()["paste_flag_words"])
    for change in tasks or []:
        task = _task(doc, change.slot)
        row = session.get(m.WritingSubmission, task.get("attempt_id"))
        if row is None:  # pragma: no cover — the row is created with the sitting
            continue
        previous_words = int(row.word_count or 0)
        if change.essay_text is not None:
            row.essay_text = change.essay_text
            row.word_count = scoring.count_words(change.essay_text)
        if change.outline_text is not None:
            # The scratchpad stays: the real exam allows planning on paper. What it does
            # not do is offer ghost text, and nothing here supplies any.
            row.outline_text = change.outline_text
        pasted_now = 0
        if change.paste_events is not None:
            if change.paste_events > int(row.paste_events or 0):
                pasted_now = int(row.word_count or 0) - previous_words
            row.paste_events = int(change.paste_events)
        # Paste is recorded, never blocked — it is the learner's own tool, and a flag the
        # report can explain beats a keystroke the editor swallowed.
        big_paste = max(int(change.last_paste_words or 0), pasted_now)
        if big_paste > flag_at:
            row.integrity_flag = "pasted"

    _write_task_clocks(session, doc)
    session.flush()
    _save(session, doc)
    return view(session, doc)


def _write_task_clocks(session: Session, doc: dict[str, Any]) -> None:
    """Push the attributed per-task seconds down onto the two submission rows."""
    clock = doc.get("clock") or {}
    for task in doc.get("tasks") or []:
        row = session.get(m.WritingSubmission, task.get("attempt_id"))
        if row is None:  # pragma: no cover
            continue
        seconds = float(clock.get(f"{task['slot']}_seconds") or 0.0)
        row.seconds_elapsed = int(seconds)
        row.overtime_seconds = int(max(0.0, seconds - float(task.get("target_s") or 0.0)))


def abandon(session: Session, mock_id: str) -> dict[str, Any]:
    """Walk out of a sitting — and reopen the coach.

    Without this an abandoned mock locks the teaching layer until it goes stale, which
    would make one closed laptop cost a learner an afternoon.
    """
    doc = load(session, mock_id)
    if doc.get("status") == "in_progress":
        doc["status"] = "abandoned"
        doc["finished_at"] = _iso()
        _write_task_clocks(session, doc)
        _close_envelopes(session, doc)
        _save(session, doc)
    return view(session, doc)


def _close_envelopes(session: Session, doc: dict[str, Any]) -> None:
    finished = doc.get("finished_at") or _iso()
    for session_id in [doc["mock_id"], *[t.get("attempt_id") for t in doc.get("tasks") or []]]:
        envelope = session.get(m.PracticeSession, session_id) if session_id else None
        if envelope is None or envelope.ended_at is not None:
            continue
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
        _log.debug("writing exam-conditions lookup failed", exc_info=True)
        return None


def _conditions(doc: dict[str, Any]) -> dict[str, Any]:
    clock = doc.get("clock") or {}
    return {
        "active": True,
        "mock_id": doc["mock_id"],
        "started_at": doc.get("started_at"),
        "module": doc.get("module"),
        "active_slot": clock.get("active_slot"),
        "prompt_ids": [t.get("prompt_id") for t in doc.get("tasks") or []],
        "withheld": list(WITHHELD),
        "message": EXAM_CONDITIONS_MESSAGE,
    }


def locked_gate(conditions: dict[str, Any]) -> dict[str, Any]:
    """The gate state the coach reports during a mock: shut, and saying why."""
    return {
        "unlocked": False,
        "reason": "exam_conditions",
        "attempts": 0,
        "last_attempt_id": None,
        "last_attempt_words": None,
        "min_attempt_words": coach.MIN_ATTEMPT_WORDS,
        "gated_fields": list(coach.GATED_FIELDS),
        "message": EXAM_CONDITIONS_MESSAGE,
        "mock_id": conditions["mock_id"],
    }


def locked_teaching_payload(
    session: Session, prompt: Any, conditions: dict[str, Any]
) -> dict[str, Any]:
    """The teaching document during a mock: the prompt's identity and nothing taught.

    Built here rather than by stripping :func:`coach.teaching_payload` so that no coaching
    field is ever *computed*, let alone serialised. The shape stays key-compatible with
    the unlocked document so the client renders the same screen with dark tabs instead of
    crashing on a missing key.
    """
    return {
        **coach.prompt_header(prompt, {}),
        "teaching_available": False,
        "teaches": None,
        "band_move": None,
        "exam_note": None,
        "time_plan": [],
        "plan": {"lines": [], "test": None, "trap": None, "trap_locked": True},
        "structure_plan": [],
        "word_budget": None,
        "parts_checklist": [],
        "language_bank": {"warning": None, "moves": []},
        "collocations": [],
        "upgrade_pairs": [],
        "target_structures": [],
        "error_watchlist": [],
        "checklist": [],
        "rewrite_focus": None,
        "overview_brief": None,
        "letter_brief": None,
        "essay_brief": None,
        "model_answer_bands": [],
        "model_answers": [],
        "sentence_ladder_bands": [],
        "sentence_ladder": None,
        "swap_slots": [],
        "exam_conditions": conditions,
    }


def refusal(conditions: dict[str, Any]) -> ApiError:
    """The 409 every coach route other than ``…/teaching`` raises during a sitting."""
    return ApiError(
        409,
        "conflict",
        f"{EXAM_CONDITIONS_MESSAGE} (sitting {conditions['mock_id']})",
    )


# ======================================================================================
# Submit — both tasks, scored together, Task 2 weighted double
# ======================================================================================

TIME_NOTE = (
    "Time comes first because it is the most expensive decision in the paper. Task 2 is "
    "worth twice Task 1, so a minute moved from Task 1 to Task 2 is worth twice as much "
    "band."
)

WHOLE_TEST_NOTE = (
    "One sitting, two tasks, one hour. Each task is marked on its own four criteria; the "
    "combined figure below is the only place in this app where the two are put together, "
    "and it is an estimate."
)


def _time_verdict(doc: dict[str, Any]) -> dict[str, Any]:
    """The report's opening line: where the hour went, and what that cost."""
    clock = doc.get("clock") or {}
    total_s = float(clock.get("seconds_elapsed") or 0.0)
    limit_s = float(doc.get("duration_s") or TIMINGS.total_s)
    attributed = bool(clock.get("attributed"))

    rows: list[dict[str, Any]] = []
    for task in doc.get("tasks") or []:
        spent = float(clock.get(f"{task['slot']}_seconds") or 0.0)
        target = float(task.get("target_s") or 0.0)
        rows.append(
            {
                "slot": task["slot"],
                "task_type": task["task_type"],
                "minutes": _minutes(spent),
                "target_minutes": _minutes(target),
                "delta_minutes": round(_minutes(spent) - _minutes(target), 1),
            }
        )

    overtime = max(0.0, total_s - limit_s)
    lines: list[str] = []
    if not attributed:
        lines.append(
            "Your hour was not split between the two tasks in a way this sitting could "
            "measure, so only the total is reported."
        )
    else:
        first = next((r for r in rows if r["slot"] == "task1"), None)
        second = next((r for r in rows if r["slot"] == "task2"), None)
        if first and second:
            if first["delta_minutes"] >= 5 and second["delta_minutes"] <= -5:
                lines.append(
                    f"You spent {first['minutes']:g} minutes on Task 1 and "
                    f"{second['minutes']:g} on Task 2. That is the worst trade on the "
                    "paper: the task worth twice as much got the smaller half of the hour."
                )
            elif second["delta_minutes"] <= -8:
                lines.append(
                    f"Task 2 got {second['minutes']:g} minutes against a 40-minute "
                    "target, and it carries twice the weight of Task 1."
                )
            elif first["delta_minutes"] >= 8:
                lines.append(
                    f"Task 1 ran {first['delta_minutes']:g} minutes over its 20-minute "
                    "share. Task 1 has a ceiling; Task 2 has twice the weight."
                )
            else:
                lines.append(
                    "Your allocation was close to the 20/40 split — that is the habit to "
                    "keep."
                )
    if overtime > 0:
        lines.append(
            f"You ran {_minutes(overtime):g} minutes past the hour. In the real paper "
            "those words would not exist."
        )

    return {
        "total_minutes": _minutes(total_s),
        "limit_minutes": _minutes(limit_s),
        "overtime_minutes": _minutes(overtime),
        "attributed": attributed,
        "tasks": rows,
        "verdict": " ".join(lines),
        "note": TIME_NOTE,
    }


def _criteria_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    criteria = payload.get("criteria") if isinstance(payload, dict) else {}
    out: list[dict[str, Any]] = []
    for key in coach.CRITERIA:
        block = (criteria or {}).get(key)
        if not isinstance(block, dict):
            continue
        out.append(
            {
                "criterion": key,
                "band": block.get("band"),
                "comment": block.get("comment"),
                "evidence_quotes": block.get("evidence_quotes") or [],
                "evidence_ranges": block.get("evidence_ranges") or [],
            }
        )
    return out


def combine(task1_band: float | None, task2_band: float | None) -> float | None:
    """``round_ielts((T1 + 2 × T2) / 3)`` — and ``None`` if either task went unscored.

    Deliberately refuses to extrapolate from one task. A combined band computed from half
    a paper is a number with no meaning that would nonetheless be plotted on a chart and
    believed.
    """
    if task1_band is None or task2_band is None:
        return None
    total = float(task1_band) + TASK2_WEIGHT * float(task2_band)
    return round_ielts(total / (1 + TASK2_WEIGHT))


def _weak_action(tasks: list[dict[str, Any]]) -> str | None:
    """The lowest criterion band across the sitting, turned into one instruction."""
    weakest: tuple[float, str, str] | None = None
    for task in tasks:
        for row in task.get("criteria") or []:
            band = row.get("band")
            if band is None:
                continue
            if weakest is None or float(band) < weakest[0]:
                weakest = (float(band), row["criterion"], task["slot"])
    if weakest is None:
        return None
    band, criterion, slot = weakest
    labels = {
        "ta": "covering the task",
        "cc": "paragraphing and referencing",
        "lr": "word partners and precision",
        "gra": "sentence variety and accuracy",
    }
    label = labels.get(criterion, criterion)
    where = "Task 1" if slot == "task1" else "Task 2"
    return (
        f"Your lowest criterion was {criterion.upper()} on {where} at band {band:g}. "
        f"Take the {label} note from that report into your next practice attempt."
    )


async def submit(mock_id: str, *, force: bool = False) -> dict[str, Any]:
    """Close the sitting, score both tasks, and combine them.

    Runs in three phases with the request's own session released between them, because
    :func:`scoring.evaluate_submission` opens its own transactions and has to survive an
    ``await``: SQLite has one write lock and two holders is a deadlock, not a race.

    1. Finalise the clock, mark both attempts submitted, record the pre-checks.
    2. Score each task through the ordinary evaluator — same prompt, same anchoring, same
       audit row as a practice attempt. Sequentially, for the same lock reason.
    3. Read the two reports back and frame them: time first, then the two band sets, then
       the weighted estimate.
    """
    from bandready.db.engine import session_scope

    # ---- phase 1: close the sitting ---------------------------------------------------
    scorable: list[str] = []
    with session_scope() as s:
        doc = load(s, mock_id)
        if doc.get("status") == "complete" and doc.get("report") and not force:
            return doc["report"]
        if doc.get("status") == "in_progress":
            doc["status"] = "complete"
            doc["finished_at"] = _iso()
        _write_task_clocks(s, doc)

        for task in doc.get("tasks") or []:
            row = s.get(m.WritingSubmission, task.get("attempt_id"))
            prompt = s.get(m.WritingPrompt, task.get("prompt_id"))
            if row is None or prompt is None:  # pragma: no cover
                continue
            row.word_count = scoring.count_words(row.essay_text or "")
            chart = coach.loads(prompt.chart_spec, {}) if prompt.chart_spec else {}
            checks = scoring.run_prechecks(
                row.essay_text or "",
                task_type=prompt.task_type,
                prompt_text=prompt.prompt_text,
                chart_summary=scoring.chart_to_text(chart) if chart else "",
                letter_bullets=coach.loads(prompt.letter_bullets, []) or [],
            )
            blocks = scoring.blocking_checks(checks)
            task["word_count"] = row.word_count
            task["warnings"] = scoring.warning_checks(checks)
            task["block"] = blocks[0] if blocks else None
            task["integrity_flag"] = row.integrity_flag
            if blocks:
                continue
            if row.status in ("draft", "failed"):
                row.status = "submitted"
                row.submitted_at = _iso()
            if row.status != "scored" or force:
                scorable.append(str(row.id))
        _close_envelopes(s, doc)
        _save(s, doc)

    # ---- phase 2: score, one at a time ------------------------------------------------
    failures: dict[str, str] = {}
    for attempt_id in scorable:
        try:
            await scoring.evaluate_submission(attempt_id)
        except ApiError as exc:
            _log.warning(
                "writing mock %s: task %s failed to score: %s",
                mock_id, attempt_id, exc.detail,
            )
            failures[attempt_id] = exc.detail
        except Exception as exc:  # noqa: BLE001 — one bad task must not lose the other
            _log.exception("writing mock %s: task %s failed to score", mock_id, attempt_id)
            failures[attempt_id] = str(exc)

    # ---- phase 3: frame the result ----------------------------------------------------
    with session_scope() as s:
        doc = load(s, mock_id)
        report = _build_report(s, doc, failures)
        doc["report"] = report
        doc["status"] = "complete"
        _save(s, doc)
    return report


def _evaluation_of(session: Session, attempt_id: str) -> tuple[Any, dict[str, Any]]:
    from sqlalchemy import select

    row = session.scalars(
        select(m.WritingEvaluation)
        .where(m.WritingEvaluation.submission_id == attempt_id)
        .order_by(m.WritingEvaluation.created_at.desc(), m.WritingEvaluation.id.desc())
        .limit(1)
    ).first()
    payload = coach.loads(row.annotations_json, {}) if row is not None else {}
    return row, dict(payload)


def _build_report(
    session: Session, doc: dict[str, Any], failures: dict[str, str]
) -> dict[str, Any]:
    timing = _time_verdict(doc)
    tasks: list[dict[str, Any]] = []

    for task in doc.get("tasks") or []:
        attempt_id = task.get("attempt_id")
        row = session.get(m.WritingSubmission, attempt_id)
        prompt = session.get(m.WritingPrompt, task.get("prompt_id"))
        evaluation, payload = _evaluation_of(session, attempt_id)
        scored = evaluation is not None
        entry: dict[str, Any] = {
            "slot": task["slot"],
            "attempt_id": attempt_id,
            "prompt_id": task.get("prompt_id"),
            "task_type": task.get("task_type"),
            "task_label": task.get("task_label"),
            "genre": task.get("genre"),
            "topic_id": task.get("topic_id"),
            "prompt_text": prompt.prompt_text if prompt is not None else None,
            "word_count": int(row.word_count or 0) if row is not None else 0,
            "min_words": task.get("min_words"),
            "under_length": bool(
                row is not None
                and task.get("min_words")
                and int(row.word_count or 0) < int(task["min_words"])
            ),
            "minutes": next(
                (r["minutes"] for r in timing["tasks"] if r["slot"] == task["slot"]), 0.0
            ),
            "target_minutes": task.get("target_minutes"),
            "integrity_flag": row.integrity_flag if row is not None else None,
            "warnings": task.get("warnings") or [],
            "block": task.get("block"),
            "error": failures.get(str(attempt_id)),
            "scored": scored,
            "overall_band": evaluation.overall_band if scored else None,
            "bands": {
                "ta": evaluation.band_ta,
                "cc": evaluation.band_cc,
                "lr": evaluation.band_lr,
                "gra": evaluation.band_gra,
            }
            if scored
            else None,
            "criteria": _criteria_rows(payload) if scored else [],
            "annotation_count": len(payload.get("annotations") or []) if scored else 0,
        }
        tasks.append(entry)

    first = next((t for t in tasks if t["slot"] == "task1"), {})
    second = next((t for t in tasks if t["slot"] == "task2"), {})
    band1 = first.get("overall_band")
    band2 = second.get("overall_band")
    estimated = combine(band1, band2)

    combined: dict[str, Any] = {
        "estimated_band": estimated,
        "available": estimated is not None,
        "label": WEIGHTING_LABEL,
        "formula": WEIGHTING_FORMULA,
        "weighting": "Task 2 counts double",
        "footnote": WEIGHTING_FOOTNOTE,
        "task1_band": band1,
        "task2_band": band2,
        "unavailable_reason": None
        if estimated is not None
        else "Both tasks have to be scored before the two can be combined.",
    }
    # The lesson the weighting actually teaches, made arithmetic: the same two bands the
    # other way round are not the same result.
    if estimated is not None and band1 != band2:
        swapped = combine(band2, band1)
        combined["trade"] = {
            "as_written": estimated,
            "if_swapped": swapped,
            "note": (
                f"Band {band1:g} on Task 1 with band {band2:g} on Task 2 reports as "
                f"{estimated:g}. The same two bands the other way round report as "
                f"{swapped:g}. Minutes are worth more on Task 2."
            ),
        }

    actions: list[str] = []
    if timing["attributed"]:
        row1 = next((r for r in timing["tasks"] if r["slot"] == "task1"), None)
        if row1 and row1["delta_minutes"] >= 5:
            actions.append(
                "Next sitting, stop Task 1 at twenty minutes even if it is unfinished, "
                "and give the rest of the hour to Task 2."
            )
    if timing["overtime_minutes"] > 0:
        actions.append(
            "Practise finishing inside the hour: start the conclusion at fifty-five "
            "minutes whatever state the body is in."
        )
    for task in tasks:
        if task["under_length"]:
            actions.append(
                f"{'Task 1' if task['slot'] == 'task1' else 'Task 2'} came in under "
                f"{task['min_words']} words. Under-length answers cannot cover the task."
            )
            break
    weak = _weak_action(tasks)
    if weak:
        actions.append(weak)

    return {
        "mock_id": doc["mock_id"],
        "status": "complete",
        "module": doc.get("module"),
        "seed": doc.get("seed"),
        "started_at": doc.get("started_at"),
        "finished_at": doc.get("finished_at"),
        "scored_as": "whole_test",
        "whole_test_note": WHOLE_TEST_NOTE,
        # Time leads. Deliberately the first key and the first thing the UI renders.
        "time": timing,
        "tasks": tasks,
        "combined": combined,
        "next_actions": actions[:3],
        "coach_reopened": True,
    }


# ======================================================================================
# History — the mock trajectory the Progress screen plots
# ======================================================================================


def history(session: Session, profile_id: str, *, limit: int = 25) -> dict[str, Any]:
    ensure_schema(session)
    rows = session.execute(
        sa_text(
            "SELECT mock_id, status, created_at, doc_json FROM writing_mocks "
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
        clock = doc.get("clock") or {}
        report_tasks = {t.get("slot"): t for t in (report.get("tasks") or [])}
        items.append(
            {
                "mock_id": mock_id,
                "status": status,
                "module": doc.get("module"),
                "seed": doc.get("seed"),
                "started_at": doc.get("started_at") or created_at,
                "finished_at": doc.get("finished_at"),
                "minutes": _minutes(float(clock.get("seconds_elapsed") or 0.0)),
                "task1_minutes": _minutes(float(clock.get("task1_seconds") or 0.0)),
                "task2_minutes": _minutes(float(clock.get("task2_seconds") or 0.0)),
                "estimated_band": (report.get("combined") or {}).get("estimated_band"),
                "task1_band": (report_tasks.get("task1") or {}).get("overall_band"),
                "task2_band": (report_tasks.get("task2") or {}).get("overall_band"),
                "prompt_ids": [t.get("prompt_id") for t in doc.get("tasks") or []],
            }
        )

    scored = [i for i in items if i["estimated_band"] is not None]
    trajectory = [
        {
            "mock_id": i["mock_id"],
            "at": i["finished_at"] or i["started_at"],
            "estimated_band": i["estimated_band"],
            "task1_band": i["task1_band"],
            "task2_band": i["task2_band"],
            "task1_minutes": i["task1_minutes"],
            "task2_minutes": i["task2_minutes"],
        }
        for i in reversed(scored)
    ]
    latest = scored[0]["estimated_band"] if scored else None
    first = scored[-1]["estimated_band"] if scored else None
    return {
        "items": items,
        "count": len(items),
        "trajectory": trajectory,
        "scored": len(scored),
        "latest_band": latest,
        "best_band": max((i["estimated_band"] for i in scored), default=None),
        "delta": (
            round(float(latest) - float(first), 1)
            if latest is not None and first is not None and len(scored) > 1
            else None
        ),
        "label": WEIGHTING_LABEL,
        "footnote": WEIGHTING_FOOTNOTE,
    }


__all__ = [
    "EXAM_CONDITIONS_MESSAGE",
    "MODULES",
    "SLOTS",
    "TASK1_TYPE",
    "TASK2_WEIGHT",
    "TIMINGS",
    "WEIGHTING_FOOTNOTE",
    "WEIGHTING_LABEL",
    "WITHHELD",
    "MockTimings",
    "TaskPatch",
    "abandon",
    "assemble",
    "clock_view",
    "combine",
    "create",
    "ensure_schema",
    "exam_conditions",
    "find",
    "history",
    "load",
    "locked_gate",
    "locked_teaching_payload",
    "patch",
    "refusal",
    "submit",
    "view",
]
