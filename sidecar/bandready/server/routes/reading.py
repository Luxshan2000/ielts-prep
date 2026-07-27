"""Reading module HTTP surface (18-api-contract.md §4.9, behaviour in 06-reading-module.md).

Scoring here is fully deterministic and offline: every comparison goes through the shared
normalizer at ``bandready.scoring.answers`` (R2-9 — the same functions the listening module
uses), and the raw-score→band conversion uses the published approximate tables of 06 §4.3.
The LLM is touched by exactly two routes: ``POST /generate`` (the 06 §7 pipeline) and
``POST /attempts/{id}/why-wrong`` (the 06 §6.1 trap analysis).

Answer keys never leave the sidecar during a test: ``GET /tests/{id}`` and
``GET /passages/{id}`` strip ``answers``, ``explanation``, ``trap_note`` and
``evidence_quote`` unless ``?mode=review`` is passed *and* the attempt is submitted, which
only the review screen does.
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.scoring.answers import (
    CHOICE_TYPES,
    LETTER_TYPES,
    MULTI_TYPES,
    answers_match,
    expand_variants,
    instruction_for,
    near_miss,
    normalize_answer,
    normalize_letters,
    word_limit_of,
)
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.reading")

router = APIRouter(prefix="/api/v1/reading", tags=["reading"])

# --------------------------------------------------------------------------------------
# 06 §4.3 — raw score → band, the published approximate tables (data, not logic)
# --------------------------------------------------------------------------------------

#: ``(min_raw, max_raw, band)`` over 40 questions. Academic Reading.
ACADEMIC_BAND_TABLE: tuple[tuple[int, int, float], ...] = (
    (39, 40, 9.0),
    (37, 38, 8.5),
    (35, 36, 8.0),
    (33, 34, 7.5),
    (30, 32, 7.0),
    (27, 29, 6.5),
    (23, 26, 6.0),
    (19, 22, 5.5),
    (15, 18, 5.0),
    (13, 14, 4.5),
    (10, 12, 4.0),
    (8, 9, 3.5),
    (6, 7, 3.0),
    (4, 5, 2.5),
    (0, 3, 2.0),
)

#: General Training Reading — harsher at the top.
GT_BAND_TABLE: tuple[tuple[int, int, float], ...] = (
    (40, 40, 9.0),
    (39, 39, 8.5),
    (37, 38, 8.0),
    (36, 36, 7.5),
    (34, 35, 7.0),
    (32, 33, 6.5),
    (30, 31, 6.0),
    (27, 29, 5.5),
    (23, 26, 5.0),
    (19, 22, 4.5),
    (15, 18, 4.0),
    (12, 14, 3.5),
    (9, 11, 3.0),
    (6, 8, 2.5),
    (0, 5, 2.0),
)

BAND_DISCLAIMER = (
    "Approximate band — official conversions vary slightly between test versions."
)

TIMER_DEFAULTS = {"full": 3600, "passage": 1200, "drill": 90}
DRILL_SIZES = (5, 10, 20)


def raw_to_band(raw: int, fmt: str) -> float:
    """Convert a raw score out of 40 to a half-band (06 §4.3)."""
    table = GT_BAND_TABLE if fmt == "general_training" else ACADEMIC_BAND_TABLE
    raw = max(0, min(40, int(raw)))
    for low, high, band in table:
        if low <= raw <= high:
            return band
    return 2.0


def scaled_raw(correct: int, total: int) -> int:
    """Project a short attempt onto the 40-question scale the band tables assume."""
    if total <= 0:
        return 0
    if total == 40:
        return int(correct)
    return round(correct / total * 40)


# --------------------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------------------

class StartAttempt(BaseModel):
    test_id: str | None = None
    passage_id: str | None = None
    mode: Literal["full", "passage", "drill"] = "full"
    exam_conditions: bool = False
    qtype: str | None = None
    size: int = 10
    timer_s: int | None = None


class Autosave(BaseModel):
    answers: dict[str, Any] | None = None
    flags: list[int] | None = None
    highlights: list[dict[str, Any]] | None = None
    notes: dict[str, Any] | None = None
    timer_s: int | None = None
    looked_up: list[str] | None = None


class SubmitAttempt(BaseModel):
    auto_submitted: bool = False
    duration_s: int | None = None
    answers: dict[str, Any] | None = None


class WhyWrong(BaseModel):
    number: int


class GenerateRequest(BaseModel):
    format: Literal["academic", "general_training"] = "academic"
    topic: str | None = None
    band_target: float = Field(default=7.0, ge=4.0, le=9.0)
    scope: Literal["test", "passage"] = "passage"


class DrillResultIn(BaseModel):
    drill_kind: Literal["question_type", "skim", "scan"] = "question_type"
    qtype: str | None = None
    n_items: int = Field(ge=0)
    n_correct: int = Field(ge=0)
    params: dict[str, Any] | None = None
    details: dict[str, Any] | None = None


# --------------------------------------------------------------------------------------
# Content loading helpers
# --------------------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except ValueError:
        _log.warning("could not parse stored JSON; using the fallback")
        return fallback


def _passage_row(session: Session, passage_id: str) -> m.ReadingPassage:
    row = session.get(m.ReadingPassage, passage_id)
    if row is None:
        raise ApiError(404, "not_found", f"no reading passage {passage_id!r}")
    return row


def _test_row(session: Session, test_id: str) -> m.ReadingTest:
    row = session.get(m.ReadingTest, test_id)
    if row is None:
        raise ApiError(404, "not_found", f"no reading test {test_id!r}")
    return row


def _passage_doc(row: m.ReadingPassage) -> dict[str, Any]:
    doc = _loads(row.passage_json, {})
    if not isinstance(doc, dict):
        doc = {}
    doc.setdefault("id", row.id)
    doc["passage_id"] = row.id
    doc.setdefault("title", row.title)
    doc.setdefault("word_count", row.word_count)
    for group in doc.get("question_groups") or []:
        group["instructions"] = instruction_for(group.get("word_limit"))
    return doc


def _iter_questions(doc: dict[str, Any]):
    for group_index, group in enumerate(doc.get("question_groups") or []):
        for question in group.get("questions") or []:
            yield group_index, group, question


#: Question-level fields that hand over the key.
#:
#: ``teaching`` is on this list because the authored payload (staging-reading/DESIGN.md §1)
#: carries ``decision_rule``, ``distractors[]`` and ``paraphrase_link.text_phrase`` — between
#: them they name the answer outright, so shipping it during a sitting defeats the test.
_SECRET_FIELDS = ("answers", "explanation", "trap_note", "evidence_quote", "teaching")

#: Group- and passage-level teaching (DESIGN §2, §3): the strategy card, the skim plan, the
#: paraphrase families, the hinge words. None of it names an answer — it is preparation
#: material, and the coach reads it off this document to teach a passage *before* it is sat.
#: So it survives an ordinary exam-mode fetch and is dropped only under exam conditions,
#: where 06 §5 has the learner sit the paper unaided.
_SECRET_CONTAINER_FIELDS = ("teaching",)


def _coaching_is_shut(session: Session | None) -> bool:
    """True while a reading mock is in progress for this profile (DESIGN §10 F9)."""
    if session is None:
        return False
    try:
        from bandready.reading import mock as reading_mock

        return reading_mock.exam_conditions(session) is not None
    except Exception:  # noqa: BLE001 — the guard must never break a document fetch
        _log.debug("reading exam-conditions lookup failed", exc_info=True)
        return False


def _strip_key(doc: dict[str, Any], *, strip_coaching: bool = False) -> dict[str, Any]:
    """Remove everything that would give the answer away, keeping the exam payload intact.

    ``anchor_paragraphs`` deliberately survives: the question palette scrolls the passage to
    the group's first anchor during the test (06 §5) and knowing which paragraph a question
    is about is part of the real exam layout, not part of the key.

    ``strip_coaching`` additionally removes the passage- and group-level teaching. That is
    not a key either, but it is help, and a mock you can take help during measures something
    the exam does not measure.
    """
    out = copy.deepcopy(doc)
    if strip_coaching:
        for field in _SECRET_CONTAINER_FIELDS:
            out.pop(field, None)
        for group in out.get("question_groups") or []:
            if isinstance(group, dict):
                for field in _SECRET_CONTAINER_FIELDS:
                    group.pop(field, None)
    for _index, _group, question in _iter_questions(out):
        for field in _SECRET_FIELDS:
            question.pop(field, None)
    return out


def _question_index(
    session: Session, passage_ids: list[str]
) -> dict[tuple[str, int], m.ReadingQuestion]:
    if not passage_ids:
        return {}
    rows = session.scalars(
        select(m.ReadingQuestion).where(m.ReadingQuestion.passage_id.in_(passage_ids))
    ).all()
    return {(r.passage_id, r.number): r for r in rows}


def _test_payload(session: Session, test: m.ReadingTest) -> dict[str, Any]:
    passages = [
        _passage_doc(_passage_row(session, pid))
        for pid in (test.p1_id, test.p2_id, test.p3_id)
    ]
    for position, passage in enumerate(passages, start=1):
        passage["position"] = position
    return {
        "schema_version": 1,
        "id": test.id,
        "format": test.format,
        "title": test.title,
        "source": test.source,
        "passages": passages,
    }


def _passage_payload(row: m.ReadingPassage) -> dict[str, Any]:
    doc = _passage_doc(row)
    doc["position"] = 1
    return {
        "schema_version": 1,
        "id": row.id,
        "format": row.format,
        "title": row.title,
        "source": row.source,
        "band_target": row.band_target,
        "passages": [doc],
    }


# --------------------------------------------------------------------------------------
# GET /tests, GET /passages
# --------------------------------------------------------------------------------------

def _paginate(items: list[Any], limit: int) -> tuple[list[Any], str | None]:
    page = items[:limit]
    next_cursor = page[-1] if len(items) > limit and page else None
    return page, next_cursor


@router.get("/tests", summary="Reading tests (metadata only)")
def list_tests(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    format: str | None = Query(default=None, pattern="^(academic|general_training)$"),
    source: str | None = Query(default=None, pattern="^(pack|generated|user)$"),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
) -> dict[str, Any]:
    stmt = select(m.ReadingTest).where(m.ReadingTest.retired == 0)
    if format:
        stmt = stmt.where(m.ReadingTest.format == format)
    if source:
        stmt = stmt.where(m.ReadingTest.source == source)
    if cursor:
        stmt = stmt.where(m.ReadingTest.id > cursor)
    rows = session.scalars(stmt.order_by(m.ReadingTest.id).limit(limit + 1)).all()
    page, next_cursor = _paginate(list(rows), limit)

    passage_ids = {pid for row in page for pid in (row.p1_id, row.p2_id, row.p3_id)}
    passages = {
        p.id: p
        for p in session.scalars(
            select(m.ReadingPassage).where(m.ReadingPassage.id.in_(passage_ids or {""}))
        ).all()
    }
    counts = _question_counts(session, list(passage_ids))
    items = []
    for row in page:
        pids = [row.p1_id, row.p2_id, row.p3_id]
        items.append(
            {
                "id": row.id,
                "format": row.format,
                "title": row.title,
                "source": row.source,
                "generated": row.source == "generated",
                "created_at": row.created_at,
                "total_questions": sum(counts.get(pid, 0) for pid in pids),
                "band_target": next(
                    (passages[pid].band_target for pid in pids if pid in passages), None
                ),
                "passages": [
                    {
                        "id": pid,
                        "title": passages[pid].title if pid in passages else pid,
                        "word_count": passages[pid].word_count if pid in passages else None,
                        "questions": counts.get(pid, 0),
                    }
                    for pid in pids
                ],
            }
        )
    return {"items": items, "next_cursor": next_cursor.id if next_cursor else None}


def _question_counts(session: Session, passage_ids: list[str]) -> dict[str, int]:
    if not passage_ids:
        return {}
    rows = session.execute(
        select(m.ReadingQuestion.passage_id, m.ReadingQuestion.number).where(
            m.ReadingQuestion.passage_id.in_(passage_ids)
        )
    ).all()
    counts: dict[str, int] = {}
    for passage_id, _number in rows:
        counts[passage_id] = counts.get(passage_id, 0) + 1
    return counts


@router.get("/passages", summary="Single passages for passage practice")
def list_passages(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    format: str | None = Query(default=None, pattern="^(academic|general_training)$"),
    difficulty: str | None = Query(default=None, pattern="^(easy|medium|hard)$"),
    source: str | None = Query(default=None, pattern="^(pack|generated|user)$"),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
) -> dict[str, Any]:
    stmt = select(m.ReadingPassage).where(m.ReadingPassage.retired == 0)
    if format:
        stmt = stmt.where(m.ReadingPassage.format == format)
    if source:
        stmt = stmt.where(m.ReadingPassage.source == source)
    if cursor:
        stmt = stmt.where(m.ReadingPassage.id > cursor)
    rows = list(session.scalars(stmt.order_by(m.ReadingPassage.id).limit(limit + 1)).all())
    counts = _question_counts(session, [r.id for r in rows])

    items: list[dict[str, Any]] = []
    for row in rows:
        doc = _loads(row.passage_json, {})
        row_difficulty = (
            str(doc.get("difficulty") or "medium") if isinstance(doc, dict) else "medium"
        )
        if difficulty and row_difficulty != difficulty:
            continue
        types = sorted(
            {
                str(g.get("type"))
                for g in (doc.get("question_groups") or [])
                if isinstance(g, dict) and g.get("type")
            }
        ) if isinstance(doc, dict) else []
        items.append(
            {
                "id": row.id,
                "format": row.format,
                "title": row.title,
                "topic": doc.get("topic") if isinstance(doc, dict) else None,
                "difficulty": row_difficulty,
                "word_count": row.word_count,
                "band_target": row.band_target,
                "source": row.source,
                "generated": row.source == "generated",
                "questions": counts.get(row.id, 0),
                "question_types": types,
                "created_at": row.created_at,
            }
        )
    page, next_cursor = _paginate(items, limit)
    return {"items": page, "next_cursor": next_cursor["id"] if next_cursor else None}


def _has_submitted_attempt(
    session: Session, *, test_id: str | None = None, passage_id: str | None = None
) -> bool:
    """Has this profile finished this test/passage at least once?

    ``?mode=review`` hands over the whole key and the whole teaching payload, so it has to
    cost an attempt — otherwise the Solution Card is one URL away and the module stops
    teaching anything (06 §6, DESIGN §10 F10). A submitted attempt on *any* of the three
    passages of a test also opens that test, because that is how the review screen walks a
    finished paper.
    """
    profile_id = current_profile_id(session)
    stmt = select(m.ReadingAttempt.id).join(
        m.PracticeSession, m.PracticeSession.id == m.ReadingAttempt.id
    )
    stmt = stmt.where(
        m.PracticeSession.profile_id == profile_id,
        m.ReadingAttempt.status == "submitted",
    )
    if test_id is not None:
        passage_ids = [
            pid
            for pid in session.execute(
                select(m.ReadingTest.p1_id, m.ReadingTest.p2_id, m.ReadingTest.p3_id).where(
                    m.ReadingTest.id == test_id
                )
            ).first()
            or ()
            if pid
        ]
        clause = m.ReadingAttempt.test_id == test_id
        if passage_ids:
            clause = clause | m.ReadingAttempt.passage_id.in_(passage_ids)
        stmt = stmt.where(clause)
    else:
        # A submitted *test* attempt covers every passage in that test — reviewing passage 2
        # of a paper you have just sat is the normal path off the results screen.
        parent_tests = select(m.ReadingTest.id).where(
            (m.ReadingTest.p1_id == passage_id)
            | (m.ReadingTest.p2_id == passage_id)
            | (m.ReadingTest.p3_id == passage_id)
        )
        stmt = stmt.where(
            (m.ReadingAttempt.passage_id == passage_id)
            | m.ReadingAttempt.test_id.in_(parent_tests)
        )
    return session.scalars(stmt.limit(1)).first() is not None


_REVIEW_LOCKED = (
    "review mode is available only after you have submitted an attempt on this material"
)


@router.get("/tests/{test_id}", summary="Full test document (answers stripped)")
def get_test(
    test_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    mode: str = Query(default="exam", pattern="^(exam|review)$"),
) -> dict[str, Any]:
    row = _test_row(session, test_id)
    if mode == "review" and not _has_submitted_attempt(session, test_id=row.id):
        raise ApiError(403, "forbidden", _REVIEW_LOCKED)
    payload = _test_payload(session, row)
    if mode == "review":
        return payload
    return _payload_without_key(payload, strip_coaching=_coaching_is_shut(session))


@router.get("/passages/{passage_id}", summary="Single passage document (answers stripped)")
def get_passage(
    passage_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    mode: str = Query(default="exam", pattern="^(exam|review)$"),
) -> dict[str, Any]:
    row = _passage_row(session, passage_id)
    if mode == "review" and not _has_submitted_attempt(session, passage_id=row.id):
        raise ApiError(403, "forbidden", _REVIEW_LOCKED)
    payload = _passage_payload(row)
    if mode == "review":
        return payload
    return _payload_without_key(payload, strip_coaching=_coaching_is_shut(session))


def _payload_without_key(
    payload: dict[str, Any], *, strip_coaching: bool = False
) -> dict[str, Any]:
    out = dict(payload)
    out["passages"] = [
        _strip_key(p, strip_coaching=strip_coaching) for p in payload.get("passages") or []
    ]
    out["answers_included"] = False
    out["coaching_included"] = not strip_coaching
    return out


# --------------------------------------------------------------------------------------
# Attempts
# --------------------------------------------------------------------------------------

def _attempt_row(session: Session, attempt_id: str) -> m.ReadingAttempt:
    row = session.get(m.ReadingAttempt, attempt_id)
    if row is None:
        raise ApiError(404, "not_found", f"no reading attempt {attempt_id!r}")
    return row


def _attempt_state(row: m.ReadingAttempt) -> dict[str, Any]:
    state = _loads(row.state_json, {})
    return state if isinstance(state, dict) else {}


def _drill_items(session: Session, qtype: str, size: int) -> list[m.ReadingQuestion]:
    rows = list(
        session.scalars(
            select(m.ReadingQuestion)
            .join(m.ReadingPassage, m.ReadingPassage.id == m.ReadingQuestion.passage_id)
            .where(m.ReadingQuestion.qtype == qtype, m.ReadingPassage.retired == 0)
            .order_by(m.ReadingQuestion.id)
            .limit(max(1, size))
        ).all()
    )
    return rows


def _options_of(group: dict[str, Any] | None, question: dict[str, Any] | None) -> Any:
    """Where a question's option list actually lives.

    Every matching type shares one list on the group, but ``multiple_choice`` gives each stem
    its own A–D and authors it on the question. Reading only the group drops the options for
    most of the MCQs in the bank, which leaves the review screen saying "you answered B, the
    answer was C" without printing either.
    """
    if question and question.get("options"):
        return question["options"]
    return (group or {}).get("options")


def _anchor_texts(doc: dict[str, Any], anchors: list[str]) -> list[dict[str, str]]:
    wanted = {str(a) for a in anchors}
    out: list[dict[str, str]] = []
    for text_block in doc.get("texts") or []:
        for para in text_block.get("paragraphs") or []:
            if str(para.get("id")) in wanted:
                out.append({"id": str(para.get("id")), "text": str(para.get("text") or "")})
    return out


def _drill_payload(session: Session, rows: list[m.ReadingQuestion]) -> list[dict[str, Any]]:
    docs: dict[str, dict[str, Any]] = {}
    items: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        if row.passage_id not in docs:
            docs[row.passage_id] = _passage_doc(_passage_row(session, row.passage_id))
        doc = docs[row.passage_id]
        group = question = None
        for _gi, candidate_group, candidate in _iter_questions(doc):
            if int(candidate.get("number") or 0) == row.number:
                group, question = candidate_group, candidate
                break
        anchors = _loads(row.anchor_paragraphs_json, [])
        prompt = str((question or {}).get("prompt") or "")
        word_limit = (
            {"max_words": row.word_limit, "numbers_allowed": True} if row.word_limit else None
        )
        items.append(
            {
                "index": index,
                "question_id": row.id,
                "passage_id": row.passage_id,
                "passage_title": doc.get("title"),
                "number": row.number,
                "qtype": row.qtype,
                "prompt": prompt,
                "options": _options_of(group, question),
                "word_limit": word_limit,
                "instructions": instruction_for(word_limit),
                "anchor_paragraphs": anchors,
                "anchor_texts": _anchor_texts(doc, list(anchors)),
                # DESIGN §10 F3/F4: a drill is practice, not a sitting, so the strategy card
                # and the per-question payload travel with the item.
                "group_teaching": (group or {}).get("teaching"),
                "teaching": (question or {}).get("teaching"),
            }
        )
    return items


@router.post("/attempts", status_code=status.HTTP_201_CREATED, summary="Start an attempt")
def start_attempt(
    body: StartAttempt,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    attempt_id = f"rd_{ULID()}"
    state: dict[str, Any] = {
        "mode": body.mode,
        "exam_conditions": bool(body.exam_conditions),
        "answers": {},
        "flags": [],
        "highlights": [],
        "notes": {},
        "looked_up": [],
    }
    payload: dict[str, Any]

    if body.mode == "drill":
        qtype = (body.qtype or "").strip()
        if not qtype:
            raise ApiError(422, "validation_error", "a drill needs a qtype")
        size = body.size if body.size in DRILL_SIZES else 10
        rows = _drill_items(session, qtype, size)
        if not rows:
            raise ApiError(404, "not_found", f"no questions of type {qtype!r} in the bank")
        items = _drill_payload(session, rows)
        state["drill"] = {
            "qtype": qtype,
            "question_ids": [r.id for r in rows],
            "items": [
                {"index": i["index"], "question_id": i["question_id"],
                 "passage_id": i["passage_id"], "number": i["number"], "qtype": i["qtype"]}
                for i in items
            ],
        }
        state["timer_s"] = body.timer_s or TIMER_DEFAULTS["drill"] * len(rows)
        total = len(rows)
        target = {"test_id": None, "passage_id": rows[0].passage_id}
        payload = {"drill": {"qtype": qtype, "items": items}}
    elif body.mode == "passage":
        if not body.passage_id:
            raise ApiError(422, "validation_error", "passage practice needs a passage_id")
        row = _passage_row(session, body.passage_id)
        payload = _payload_without_key(_passage_payload(row))
        total = sum(
            len(g.get("questions") or []) for g in
            (payload["passages"][0].get("question_groups") or [])
        )
        state["timer_s"] = body.timer_s or TIMER_DEFAULTS["passage"]
        target = {"test_id": None, "passage_id": row.id}
    else:
        if not body.test_id:
            raise ApiError(422, "validation_error", "a full test attempt needs a test_id")
        test = _test_row(session, body.test_id)
        payload = _payload_without_key(_test_payload(session, test))
        total = sum(
            len(g.get("questions") or [])
            for p in payload["passages"]
            for g in (p.get("question_groups") or [])
        )
        state["timer_s"] = body.timer_s or TIMER_DEFAULTS["full"]
        target = {"test_id": test.id, "passage_id": None}

    state["total_questions"] = total
    session.add(
        m.PracticeSession(
            id=attempt_id,
            profile_id=profile_id,
            module="reading",
            activity={"full": "full_test", "passage": "single_passage", "drill": "drill"}[
                body.mode
            ],
        )
    )
    session.flush()
    session.add(
        m.ReadingAttempt(
            id=attempt_id,
            test_id=target["test_id"],
            passage_id=target["passage_id"],
            # 11 §4's column enum is exam|practice; the richer full|passage|drill mode the
            # player uses lives in state_json (and in practice_sessions.activity).
            mode="exam" if body.exam_conditions else "practice",
            status="in_progress",
            total_questions=total,
            state_json=json.dumps(state, ensure_ascii=False),
        )
    )
    session.flush()
    return {
        "attempt_id": attempt_id,
        "mode": body.mode,
        "exam_conditions": bool(body.exam_conditions),
        "timer_s": state["timer_s"],
        "total_questions": total,
        "resume_state": {
            "answers": {},
            "flags": [],
            "highlights": [],
            "notes": {},
            "timer_s": state["timer_s"],
        },
        **payload,
    }


@router.patch("/attempts/{attempt_id}", summary="Autosave attempt state")
def autosave(
    attempt_id: str,
    body: Autosave,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = _attempt_row(session, attempt_id)
    if row.status != "in_progress":
        raise ApiError(409, "conflict", "this attempt has already been submitted")
    state = _attempt_state(row)

    if body.answers is not None:  # partial deep-merge per R2-19
        answers = dict(state.get("answers") or {})
        for key, value in body.answers.items():
            if value is None or value == "":
                answers.pop(str(key), None)
            else:
                answers[str(key)] = value
        state["answers"] = answers
    if body.notes is not None:
        notes = dict(state.get("notes") or {})
        for key, value in body.notes.items():
            if value is None:
                notes.pop(str(key), None)
            else:
                notes[str(key)] = value
        state["notes"] = notes
    if body.flags is not None:
        state["flags"] = sorted({int(f) for f in body.flags})
    if body.highlights is not None:
        state["highlights"] = list(body.highlights)
    if body.looked_up is not None:
        state["looked_up"] = list(body.looked_up)
    if body.timer_s is not None:
        state["timer_s"] = max(0, int(body.timer_s))

    row.state_json = json.dumps(state, ensure_ascii=False)
    session.flush()
    return {
        "attempt_id": attempt_id,
        "saved_at": _now(),
        "answered": len(state.get("answers") or {}),
        "flagged": len(state.get("flags") or []),
        "timer_s": state.get("timer_s"),
    }


@router.get("/attempts/{attempt_id}", summary="Attempt record and resume state")
def get_attempt(
    attempt_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = _attempt_row(session, attempt_id)
    state = _attempt_state(row)
    return {
        "attempt_id": row.id,
        "test_id": row.test_id,
        "passage_id": row.passage_id,
        "mode": state.get("mode") or ("exam" if row.mode == "exam" else "practice"),
        "exam_conditions": bool(state.get("exam_conditions")),
        "status": row.status,
        "raw_score": row.raw_score,
        "total_questions": row.total_questions,
        "band": row.band,
        "duration_s": row.duration_s,
        "submitted_at": row.submitted_at,
        "resume_state": {
            "answers": state.get("answers") or {},
            "flags": state.get("flags") or [],
            "highlights": state.get("highlights") or [],
            "notes": state.get("notes") or {},
            "looked_up": state.get("looked_up") or [],
            "timer_s": state.get("timer_s"),
        },
    }


# --------------------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------------------

class _Scorable:
    """One markable question, flattened out of the content documents."""

    __slots__ = (
        "anchor_paragraphs", "answers", "doc", "evidence_quote", "explanation", "group",
        "group_id", "group_teaching", "key", "number", "options", "passage_id",
        "passage_title", "prompt", "qtype", "question", "question_id", "teaching",
        "trap_note", "word_limit",
    )

    def __init__(self, **kw: Any) -> None:
        for name in self.__slots__:
            setattr(self, name, kw.get(name))


def _scorables(session: Session, row: m.ReadingAttempt, state: dict[str, Any]) -> list[_Scorable]:
    mode = str(state.get("mode") or "passage")
    if mode == "drill":
        items = (state.get("drill") or {}).get("items") or []
        question_rows = {
            r.id: r
            for r in session.scalars(
                select(m.ReadingQuestion).where(
                    m.ReadingQuestion.id.in_([i["question_id"] for i in items] or [""])
                )
            ).all()
        }
        docs: dict[str, dict[str, Any]] = {}
        out: list[_Scorable] = []
        for item in items:
            qrow = question_rows.get(item["question_id"])
            if qrow is None:
                continue
            if qrow.passage_id not in docs:
                docs[qrow.passage_id] = _passage_doc(_passage_row(session, qrow.passage_id))
            doc = docs[qrow.passage_id]
            group = question = None
            for _gi, candidate_group, candidate in _iter_questions(doc):
                if int(candidate.get("number") or 0) == qrow.number:
                    group, question = candidate_group, candidate
                    break
            limit = (
                {"max_words": qrow.word_limit, "numbers_allowed": True}
                if qrow.word_limit
                else (group or {}).get("word_limit")
            )
            out.append(
                _Scorable(
                    key=str(item["index"]),
                    number=int(item["index"]),
                    question_id=qrow.id,
                    passage_id=qrow.passage_id,
                    passage_title=doc.get("title"),
                    group_id=f"drill:{qrow.id}",
                    qtype=qrow.qtype,
                    answers=_loads(qrow.answers_json, []),
                    word_limit=word_limit_of(limit),
                    prompt=str((question or {}).get("prompt") or ""),
                    options=_options_of(group, question),
                    anchor_paragraphs=_loads(qrow.anchor_paragraphs_json, []),
                    evidence_quote=qrow.evidence_quote,
                    explanation=qrow.explanation,
                    trap_note=qrow.trap_note,
                    teaching=(question or {}).get("teaching"),
                    group_teaching=(group or {}).get("teaching"),
                    doc=doc,
                    group=group,
                    question=question,
                )
            )
        return out

    if row.test_id:
        test = _test_row(session, row.test_id)
        passage_rows = [
            _passage_row(session, pid) for pid in (test.p1_id, test.p2_id, test.p3_id)
        ]
    else:
        passage_rows = [_passage_row(session, str(row.passage_id))]

    index = _question_index(session, [p.id for p in passage_rows])
    out = []
    for passage_row in passage_rows:
        doc = _passage_doc(passage_row)
        for _group_index, group, question in _iter_questions(doc):
            number = int(question.get("number") or 0)
            qrow = index.get((passage_row.id, number))
            out.append(
                _Scorable(
                    key=str(number),
                    number=number,
                    question_id=qrow.id if qrow else None,
                    passage_id=passage_row.id,
                    passage_title=doc.get("title"),
                    group_id=f"{passage_row.id}:{group.get('id')}",
                    qtype=str(group.get("type") or ""),
                    answers=question.get("answers") or [],
                    word_limit=word_limit_of(group.get("word_limit")),
                    prompt=str(question.get("prompt") or ""),
                    options=_options_of(group, question),
                    anchor_paragraphs=question.get("anchor_paragraphs") or [],
                    evidence_quote=question.get("evidence_quote"),
                    explanation=question.get("explanation"),
                    trap_note=question.get("trap_note"),
                    teaching=question.get("teaching"),
                    group_teaching=group.get("teaching"),
                    doc=doc,
                    group=group,
                    question=question,
                )
            )
    return out


def _mark(scorables: list[_Scorable], answers: dict[str, Any]) -> dict[str, bool]:
    """Correctness per scorable key. Pure — no DB, no network, no LLM."""
    verdict: dict[str, bool] = {}
    multi_groups: dict[str, list[_Scorable]] = {}
    for item in scorables:
        if item.qtype in MULTI_TYPES:
            multi_groups.setdefault(item.group_id, []).append(item)
            continue
        given = answers.get(item.key)
        verdict[item.key] = answers_match(
            given, item.answers, question_type=item.qtype, word_limit=item.word_limit
        )

    # "Choose TWO letters" — the group is one checkbox set and each correct letter earns its
    # own mark (06 §2 type 1/14), so the marks are awarded across the group's numbers.
    for members in multi_groups.values():
        members.sort(key=lambda s: s.number)
        required: set[str] = set()
        for member in members:
            for value in expand_variants(member.answers):
                required |= set(normalize_letters(value))
        chosen: set[str] = set()
        for member in members:
            chosen |= set(normalize_letters(str(answers.get(member.key) or "")))
        hits = len(chosen & required)
        if len(chosen) > len(required):  # over-selecting is wrong in real marking
            hits = 0
        for position, member in enumerate(members):
            verdict[member.key] = position < hits
    return verdict


def _score_record(
    row: m.ReadingAttempt,
    state: dict[str, Any],
    scorables: list[_Scorable],
    answers: dict[str, Any],
    fmt: str,
    *,
    auto_submitted: bool,
    duration_s: int,
) -> dict[str, Any]:
    verdict = _mark(scorables, answers)
    flags = {int(f) for f in (state.get("flags") or [])}
    mode = str(state.get("mode") or "passage")

    per_question: list[dict[str, Any]] = []
    per_type: dict[str, dict[str, int]] = {}
    per_passage: dict[str, dict[str, Any]] = {}
    for item in scorables:
        given_raw = answers.get(item.key)
        given = "" if given_raw is None else str(given_raw)
        correct = bool(verdict.get(item.key))
        per_question.append(
            {
                "number": item.number,
                "question_id": item.question_id,
                "passage_id": item.passage_id,
                "qtype": item.qtype,
                "given": given,
                "correct": correct,
                "flagged": item.number in flags,
                "answered": bool(given.strip()),
                "near_miss_spelling": (
                    not correct
                    and item.qtype not in LETTER_TYPES | CHOICE_TYPES
                    and near_miss(given, item.answers)
                ),
            }
        )
        bucket = per_type.setdefault(item.qtype, {"correct": 0, "total": 0})
        bucket["total"] += 1
        bucket["correct"] += int(correct)
        pbucket = per_passage.setdefault(
            item.passage_id, {"passage_id": item.passage_id,
                              "title": item.passage_title, "correct": 0, "total": 0}
        )
        pbucket["total"] += 1
        pbucket["correct"] += int(correct)

    total = len(scorables)
    raw = sum(1 for q in per_question if q["correct"])
    projected = scaled_raw(raw, total)
    band: float | None = None
    if mode != "drill" and total:
        band = raw_to_band(projected, fmt)

    weakest = None
    ranked = [
        (name, stats) for name, stats in per_type.items() if stats["total"] >= 2
    ]
    if ranked:
        name, stats = min(ranked, key=lambda kv: kv[1]["correct"] / kv[1]["total"])
        if stats["correct"] < stats["total"]:
            weakest = {"qtype": name, **stats}

    return {
        "attempt_id": row.id,
        "mode": mode,
        "format": fmt,
        "raw_score": raw,
        "total_questions": total,
        "scaled_raw_40": projected,
        "band": band,
        "band_is_estimate": bool(band is not None and total != 40),
        "band_disclaimer": BAND_DISCLAIMER,
        "per_question": per_question,
        "per_type": per_type,
        "per_passage": list(per_passage.values()),
        "weakest_type": weakest,
        "duration_s": duration_s,
        "auto_submitted": auto_submitted,
    }


def _attempt_format(session: Session, row: m.ReadingAttempt) -> str:
    if row.test_id:
        return _test_row(session, row.test_id).format
    if row.passage_id:
        return _passage_row(session, row.passage_id).format
    return "academic"


@router.post("/attempts/{attempt_id}/submit", summary="Score an attempt (deterministic)")
def submit_attempt(
    attempt_id: str,
    body: SubmitAttempt = Body(default_factory=SubmitAttempt),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = _attempt_row(session, attempt_id)
    state = _attempt_state(row)
    if row.status == "submitted":
        stored = state.get("score")
        if isinstance(stored, dict):
            return stored  # idempotent re-submit
        raise ApiError(409, "conflict", "this attempt has already been submitted")

    if body.answers:
        merged = dict(state.get("answers") or {})
        merged.update({str(k): v for k, v in body.answers.items()})
        state["answers"] = merged
    answers = {str(k): v for k, v in (state.get("answers") or {}).items()}

    scorables = _scorables(session, row, state)
    if not scorables:
        raise ApiError(422, "validation_error", "this attempt has no questions to mark")

    timer_s = int(state.get("timer_s") or 0)
    duration = body.duration_s
    if duration is None:
        started = TIMER_DEFAULTS.get(str(state.get("mode") or "passage"), 0)
        duration = max(0, (state.get("timer_start_s") or started) - timer_s)
    fmt = _attempt_format(session, row)
    record = _score_record(
        row, state, scorables, answers, fmt,
        auto_submitted=body.auto_submitted, duration_s=int(duration or 0),
    )

    session.query(m.ReadingAnswer).filter(m.ReadingAnswer.attempt_id == row.id).delete()
    for item, marked in zip(scorables, record["per_question"], strict=True):
        if not item.question_id:
            continue  # generated-in-memory question with no bank row — nothing to key to
        session.add(
            m.ReadingAnswer(
                id=f"ra_{ULID()}",
                attempt_id=row.id,
                question_id=item.question_id,
                qtype=item.qtype,
                given=marked["given"],
                normalized=normalize_answer(
                    marked["given"], variants=expand_variants(item.answers)
                ),
                correct=int(marked["correct"]),
            )
        )

    state["score"] = record
    row.raw_score = record["raw_score"]
    row.total_questions = record["total_questions"]
    row.band = record["band"]
    row.duration_s = record["duration_s"]
    row.status = "submitted"
    row.submitted_at = _now()
    row.state_json = json.dumps(state, ensure_ascii=False)

    practice = session.get(m.PracticeSession, row.id)
    if practice is not None:
        practice.ended_at = row.submitted_at
        practice.duration_s = record["duration_s"]
        practice.summary_json = json.dumps(
            {
                "raw_score": record["raw_score"],
                "total_questions": record["total_questions"],
                "band": record["band"],
                "per_type": record["per_type"],
                "auto_submitted": record["auto_submitted"],
            },
            ensure_ascii=False,
        )
    session.flush()
    return record


def _solution_for(item: _Scorable, given: str, correct: bool) -> dict[str, Any] | None:
    """The Solution Card for one reviewed question (staging-reading/DESIGN.md §10 F1).

    Built by ``bandready.reading.drills.reveal_for`` rather than assembled here, so the
    review screen and the drill reveal are the same card in the same order — location,
    paraphrase link, decision rule, distractor autopsy, rule to reuse — and a change to
    that order cannot land in one place and not the other.
    """
    if not (item.doc and item.group and item.question):
        return None
    try:
        from bandready.reading import drills

        return drills.reveal_for(
            item.doc, item.group, item.question, given=given, correct=correct
        )
    except Exception:  # noqa: BLE001 — a malformed payload must not break the review
        _log.warning("could not build a solution card for q%s", item.number, exc_info=True)
        return None


@router.get("/attempts/{attempt_id}/review", summary="Score plus the key and explanations")
def review_attempt(
    attempt_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = _attempt_row(session, attempt_id)
    if row.status != "submitted":
        raise ApiError(409, "conflict", "review is available only after the attempt is submitted")
    state = _attempt_state(row)
    record = state.get("score")
    if not isinstance(record, dict):
        raise ApiError(404, "not_found", "this attempt has no stored score record")

    scorables = {s.key: s for s in _scorables(session, row, state)}
    stored_analysis = {
        answer.question_id: _loads(answer.trap_analysis_json, None)
        for answer in session.scalars(
            select(m.ReadingAnswer).where(m.ReadingAnswer.attempt_id == row.id)
        ).all()
    }

    questions: list[dict[str, Any]] = []
    for marked in record.get("per_question") or []:
        item = scorables.get(str(marked["number"]))
        if item is None:
            continue
        questions.append(
            {
                **marked,
                "prompt": item.prompt,
                "options": item.options,
                "word_limit": item.word_limit,
                "instructions": instruction_for(item.word_limit),
                "accepted_answers": expand_variants(item.answers),
                "explanation": item.explanation,
                "trap_note": item.trap_note,
                # Locate-in-passage (06 §6.1): the paragraph to scroll to plus the exact
                # substring to highlight inside it.
                "locate": {
                    "passage_id": item.passage_id,
                    "paragraph_id": (item.anchor_paragraphs or [None])[0],
                    "anchor_paragraphs": item.anchor_paragraphs,
                    "evidence_quote": item.evidence_quote,
                },
                "why_wrong": stored_analysis.get(item.question_id),
                "can_ask_why": bool(not marked["correct"] and item.question_id),
                # DESIGN §10 F1 — the Solution Card. The attempt is submitted, so the whole
                # authored payload is released here and nowhere earlier.
                "teaching": item.teaching,
                "group_teaching": item.group_teaching,
                "solution": _solution_for(
                    item, str(marked.get("given") or ""), bool(marked.get("correct"))
                ),
            }
        )

    return {
        **{k: v for k, v in record.items() if k != "per_question"},
        "per_question": questions,
        "submitted_at": row.submitted_at,
    }


# --------------------------------------------------------------------------------------
# "Why was I wrong?" (06 §6.1)
# --------------------------------------------------------------------------------------

WHY_WRONG_SYSTEM = """You are an IELTS reading tutor. A learner answered a question incorrectly.
Explain the error in <=120 words. Structure: (1) what the text actually says,
quoting <=15 words; (2) the specific trap the learner fell for — for
True/False/Not Given name it as one of: "contradiction read as absence"
(FALSE vs NOT GIVEN confusion), "absence read as contradiction",
"outside knowledge", "keyword match without meaning match",
"scope/quantifier shift" (e.g. 'some' vs 'all'), "opinion vs fact";
(3) one reusable tip. Address the learner as "you". Do not restate the
question. Do not invent text that is not in the passage excerpt."""

WHY_WRONG_USER = """Question type: {qtype}
Question: {prompt}
Correct answer: {answer}  Learner answered: {given}
Relevant passage excerpt (paragraphs {anchors}):
\"\"\"{anchor_texts}\"\"\"
Authored explanation: {explanation}

Return JSON: {{ "explanation": "...", "trap": "...", "tip": "..." }}"""


async def _run_why_wrong(attempt_id: str, number: int) -> dict[str, Any]:
    from bandready.db.engine import session_scope
    from bandready.providers.llm import chat_json

    with session_scope() as session:
        row = _attempt_row(session, attempt_id)
        state = _attempt_state(row)
        item = {s.key: s for s in _scorables(session, row, state)}.get(str(number))
        if item is None:
            raise ApiError(404, "not_found", f"question {number} is not in this attempt")
        doc = _passage_doc(_passage_row(session, item.passage_id))
        anchor_texts = _anchor_texts(doc, list(item.anchor_paragraphs or []))
        given = str((state.get("answers") or {}).get(item.key) or "")
        payload = {
            "qtype": item.qtype,
            "prompt": item.prompt,
            "answer": ", ".join(expand_variants(item.answers)) or "—",
            "given": given or "(no answer)",
            "anchors": ", ".join(str(a) for a in item.anchor_paragraphs or []) or "—",
            "anchor_texts": "\n\n".join(f"[{a['id']}] {a['text']}" for a in anchor_texts),
            "explanation": item.explanation or "—",
        }
        question_id = item.question_id

    analysis = await chat_json(
        [
            {"role": "system", "content": WHY_WRONG_SYSTEM},
            {"role": "user", "content": WHY_WRONG_USER.format(**payload)},
        ],
        mock_kind="why_wrong",
        temperature=0.2,
    )
    result = {
        "number": number,
        "explanation": str(analysis.get("explanation") or analysis.get("text") or "").strip(),
        "trap": analysis.get("trap"),
        "tip": analysis.get("tip"),
        "model": (analysis.get("_meta") or {}).get("model_id"),
    }

    with session_scope() as session:
        answer = session.scalars(
            select(m.ReadingAnswer).where(
                m.ReadingAnswer.attempt_id == attempt_id,
                m.ReadingAnswer.question_id == question_id,
            )
        ).first()
        if answer is not None:
            answer.trap_analysis_json = json.dumps(result, ensure_ascii=False)
        session.add(
            m.LlmEvaluation(
                id=f"le_{ULID()}",
                subject_kind="reading_attempt",
                subject_id=attempt_id,
                purpose="trap_analysis",
                model_id=str(result["model"] or "unknown"),
                provider_id="llm",
                prompt_version="reading-why-wrong/v1",
                temperature=0.2,
                raw_response=json.dumps(analysis, ensure_ascii=False),
                parsed_json=json.dumps(result, ensure_ascii=False),
                status="ok" if result["explanation"] else "parse_failed",
            )
        )
    return result


@router.post("/attempts/{attempt_id}/why-wrong", summary="LLM trap analysis (cached)")
async def why_wrong(  # async: job_manager.submit() needs the running event loop
    attempt_id: str,
    body: WhyWrong,
    response: Response,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = _attempt_row(session, attempt_id)
    if row.status != "submitted":
        raise ApiError(409, "conflict", "ask this after submitting the attempt")
    state = _attempt_state(row)
    item = {s.key: s for s in _scorables(session, row, state)}.get(str(body.number))
    if item is None:
        raise ApiError(404, "not_found", f"question {body.number} is not in this attempt")

    stored = session.scalars(
        select(m.ReadingAnswer).where(
            m.ReadingAnswer.attempt_id == attempt_id,
            m.ReadingAnswer.question_id == item.question_id,
        )
    ).first()
    if stored is not None and stored.correct:
        raise ApiError(422, "validation_error", "that answer was correct")
    if stored is not None and stored.trap_analysis_json:
        cached = _loads(stored.trap_analysis_json, None)
        if isinstance(cached, dict):
            return {"cached": True, **cached}

    number = int(body.number)
    job_id = job_manager.submit(
        "reading_why_wrong", lambda: _run_why_wrong(attempt_id, number)
    )
    response.status_code = status.HTTP_202_ACCEPTED
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id, "cached": False}


# --------------------------------------------------------------------------------------
# Generation (06 §7)
# --------------------------------------------------------------------------------------

@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate a passage or a full test (job)",
)
async def generate(  # async: job_manager.submit() needs the running event loop
    body: GenerateRequest,
    response: Response,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    from bandready.content.generate_reading import generate_reading

    params = body.model_dump()
    job_id = job_manager.submit(
        "reading_generate", lambda jid: generate_reading(params, jid)
    )
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id}


# --------------------------------------------------------------------------------------
# Drills (06 §6.2, §8)
# --------------------------------------------------------------------------------------

@router.get("/drills/{qtype}", summary="A drill question set of one type")
def get_drill(
    qtype: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    size: int = Query(default=10, ge=1, le=40),
) -> dict[str, Any]:
    rows = _drill_items(session, qtype, size)
    if not rows:
        raise ApiError(404, "not_found", f"no questions of type {qtype!r} in the bank")
    return {
        "qtype": qtype,
        "size": len(rows),
        "seconds_per_question": TIMER_DEFAULTS["drill"],
        "items": _drill_payload(session, rows),
    }


@router.post("/drills/results", status_code=status.HTTP_201_CREATED, summary="Record a drill")
def post_drill_result(
    body: DrillResultIn,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    drill_id = f"dr_{ULID()}"
    now = _now()
    session.add(
        m.PracticeSession(
            id=drill_id,
            profile_id=profile_id,
            module="reading",
            activity=f"drill:{body.drill_kind}",
            ended_at=now,
            summary_json=json.dumps(
                {"n_items": body.n_items, "n_correct": body.n_correct, "qtype": body.qtype},
                ensure_ascii=False,
            ),
        )
    )
    session.flush()
    session.add(
        m.DrillResult(
            id=drill_id,
            module="reading",
            drill_kind=body.drill_kind,
            qtype=body.qtype,
            n_items=body.n_items,
            n_correct=body.n_correct,
            params_json=json.dumps(body.params or {}, ensure_ascii=False),
            details_json=json.dumps(body.details or {}, ensure_ascii=False),
        )
    )
    session.flush()
    return {"drill_id": drill_id, "recorded_at": now}
