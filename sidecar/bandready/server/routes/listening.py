"""Listening routes — tests, TTS rendering, attempts, scoring, review (18 §4.10/§4.16).

Everything the module needs over HTTP lives here:

* **content** — list/fetch tests and scripts, answer keys stripped unless asked for;
* **audio** — ``POST .../render`` (cache hit -> ``200``, miss -> ``202`` job) and the
  ticket-authed, ``Range``-capable media routes the ``<audio>`` element hits directly;
* **attempts** — create, autosave (``PATCH``), submit (deterministic scoring with the
  shared normalizer) and review (per question + transcript + audio timestamps);
* **generation** — ``POST /generate`` and ``POST /tests/generate`` as jobs.

Exam vs practice: the server records ``play_count`` and the attempt ``mode``; the
one-play/no-seek restriction itself is enforced by the renderer (07 §4 — single-user
local app, the server is not an adversary).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.audio import tts_render
from bandready.content.generate_listening import (
    answers_match,
    flatten_questions,
    is_near_miss,
    normalize_answer,
)
from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.scoring.answers import within_word_limit
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager
from bandready.server.tickets import require_ticket

_log = logging.getLogger("bandready.routes.listening")

router = APIRouter(tags=["listening"])

MODES = ("exam", "practice", "dictation", "accent_drill")

# 07 §7 — indicative raw/40 -> band table, shared with the progress engine.
RAW_TO_BAND: tuple[tuple[int, float], ...] = (
    (39, 9.0),
    (37, 8.5),
    (35, 8.0),
    (32, 7.5),
    (30, 7.0),
    (26, 6.5),
    (23, 6.0),
    (18, 5.5),
    (16, 5.0),
    (13, 4.5),
    (10, 4.0),
    (8, 3.5),
    (6, 3.0),
    (4, 2.5),
)


def raw_to_band(raw: int) -> float:
    """Raw score out of 40 -> IELTS listening band (07 §7). Below 4 raw reports 2.0."""
    for threshold, band in RAW_TO_BAND:
        if raw >= threshold:
            return band
    return 2.0


# --------------------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------------------


class GenerateBody(BaseModel):
    part: int | None = None
    topic: str | None = None
    target_band: float = 6.0
    accent_set: str | None = None


class TestGenerateBody(BaseModel):
    target_band: float = 6.0


class RenderBody(BaseModel):
    accent_set: str | None = None
    force: bool = False


class AttemptCreate(BaseModel):
    test_id: str | None = None
    script_id: str | None = None
    mode: str = "practice"
    answers: dict[str, str] | None = None


class AttemptPatch(BaseModel):
    answers: dict[str, str] | None = None
    seconds_elapsed: int | None = Field(default=None, ge=0)
    current_part: int | None = Field(default=None, ge=1, le=4)
    played_script_id: str | None = None
    play_count: int | None = Field(default=None, ge=0)
    status: str | None = None


# --------------------------------------------------------------------------------------
# Loading helpers
# --------------------------------------------------------------------------------------


def _parse_script_json(row: m.ListeningScript) -> dict[str, Any]:
    try:
        document = json.loads(row.script_json)
    except ValueError as exc:
        raise ApiError(
            500, "internal", f"listening script {row.id} holds unreadable JSON: {exc}"
        ) from exc
    if not isinstance(document, dict):
        raise ApiError(500, "internal", f"listening script {row.id} is not an object")
    return document


def _script_row(session: Session, script_id: str) -> m.ListeningScript:
    row = session.get(m.ListeningScript, script_id)
    if row is None:
        raise ApiError(404, "not_found", f"no listening script with id {script_id!r}")
    return row


def _test_row(session: Session, test_id: str) -> m.ListeningTest:
    row = session.get(m.ListeningTest, test_id)
    if row is None:
        raise ApiError(404, "not_found", f"no listening test with id {test_id!r}")
    return row


def _test_script_ids(row: m.ListeningTest) -> list[str]:
    return [row.p1_id, row.p2_id, row.p3_id, row.p4_id]


def _question_rows(session: Session, script_id: str) -> list[m.ListeningQuestion]:
    return list(
        session.execute(
            select(m.ListeningQuestion)
            .where(m.ListeningQuestion.script_id == script_id)
            .order_by(m.ListeningQuestion.number)
        )
        .scalars()
        .all()
    )


def _slots(row: m.ListeningQuestion) -> list[list[str]]:
    try:
        parsed = json.loads(row.answers_json)
    except ValueError:
        return []
    if not isinstance(parsed, list):
        return []
    out: list[list[str]] = []
    for slot in parsed:
        if isinstance(slot, str):
            out.append([slot])
        elif isinstance(slot, list):
            out.append([str(v) for v in slot])
    return out


def _question_meta(script: Mapping[str, Any]) -> dict[int, dict[str, Any]]:
    """Presentation fields (prompt, options, instruction) keyed by question number."""
    return {int(q["number"]): q for q in flatten_questions(script)}


def _authored_questions(script: Mapping[str, Any]) -> dict[int, Mapping[str, Any]]:
    """The **authored** question objects, keyed by number — teaching payload included.

    :func:`flatten_questions` deliberately rebuilds each question from a fixed allowlist,
    which is what keeps `_public_script` honest but also means the teaching payload never
    survives it. Review is the one place entitled to the whole authored object (L-D1), so
    it reads `script_json` directly rather than widening the allowlist everything else
    shares.
    """
    out: dict[int, Mapping[str, Any]] = {}
    for index, question in enumerate(script.get("questions") or []):
        if not isinstance(question, Mapping):
            continue
        try:
            number = int(question.get("n", question.get("number", index + 1)))
        except (TypeError, ValueError):
            number = index + 1
        out[number] = question
    return out


def _audio_status(row: m.ListeningScript, script: Mapping[str, Any]) -> dict[str, Any]:
    audio_hash = row.audio_hash or tts_render.script_audio_hash(script)
    cached = tts_render.cached_render(audio_hash)
    return {
        "audio_hash": audio_hash if cached else None,
        "expected_audio_hash": audio_hash,
        "ready": cached is not None,
        "duration_ms": (cached or {}).get("duration_ms", 0),
        "media_path": f"/api/v1/media/listening/{audio_hash}.wav",
        "timing_path": f"/api/v1/media/listening/{audio_hash}.timing.json",
        "accent_set": row.accent_set,
        "accent_label": tts_render.accent_label(row.accent_set),
    }


def _public_script(
    row: m.ListeningScript,
    session: Session,
    *,
    with_answers: bool = False,
    number_offset: dict[int, int] | None = None,
) -> dict[str, Any]:
    """One part as the client sees it. The transcript is withheld unless keys are asked
    for — revealing it during a test would defeat the point (07 §4)."""
    script = _parse_script_json(row)
    meta = _question_meta(script)
    questions: list[dict[str, Any]] = []
    for question in _question_rows(session, row.id):
        presented = meta.get(question.number, {})
        payload: dict[str, Any] = {
            "id": question.id,
            "number": (number_offset or {}).get(question.number, question.number),
            "source_number": question.number,
            "type": question.qtype,
            "instruction": presented.get("instruction"),
            "prompt": presented.get("prompt"),
            "options": presented.get("options"),
            "select_n": presented.get("select_n"),
            "asset": presented.get("asset"),
            "word_limit": question.word_limit,
            "slots": max(1, len(_slots(question))),
        }
        if with_answers:
            payload["answers"] = _slots(question)
            payload["cue_line_index"] = question.cue_line_index
            payload["explanation"] = question.explanation
        questions.append(payload)

    body: dict[str, Any] = {
        "id": row.id,
        "part": row.part,
        "title": row.title,
        "scenario": script.get("scenario"),
        "accent_set": row.accent_set,
        "target_band": row.target_band,
        "source": row.source,
        "speakers": script.get("speakers") or [],
        "questions": questions,
        "audio": _audio_status(row, script),
    }
    if with_answers:
        body["lines"] = script.get("lines") or []
    return body


def _renumber(scripts: Sequence[tuple[m.ListeningScript, list[m.ListeningQuestion]]]) -> dict[
    str, dict[int, int]
]:
    """Answer-sheet numbering for a whole test.

    Authored packs already number 1-40 across the four parts; generated parts sometimes
    each start at 1. Natural numbers are kept when they are unique across the test, and
    only re-indexed 1..N when they collide — so the narrator's "questions eleven to
    twenty" always matches the sheet.
    """
    natural = [q.number for _, questions in scripts for q in questions]
    if len(set(natural)) == len(natural):
        return {row.id: {} for row, _ in scripts}
    mapping: dict[str, dict[int, int]] = {}
    cursor = 1
    for row, questions in scripts:
        mapping[row.id] = {}
        for question in questions:
            mapping[row.id][question.number] = cursor
            cursor += 1
    return mapping


# --------------------------------------------------------------------------------------
# Content routes
# --------------------------------------------------------------------------------------


@router.get("/api/v1/listening/tests", summary="List listening tests")
def list_tests(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    stmt = select(m.ListeningTest).where(m.ListeningTest.retired == 0)
    if source:
        stmt = stmt.where(m.ListeningTest.source == source)
    if cursor:
        stmt = stmt.where(m.ListeningTest.id > cursor)
    rows = list(session.execute(stmt.order_by(m.ListeningTest.id).limit(limit + 1)).scalars())
    has_more = len(rows) > limit
    rows = rows[:limit]

    items: list[dict[str, Any]] = []
    for row in rows:
        script_ids = _test_script_ids(row)
        scripts = [session.get(m.ListeningScript, sid) for sid in script_ids]
        ready = 0
        for script in scripts:
            if script is None:
                continue
            if script.audio_hash and tts_render.cached_render(script.audio_hash):
                ready += 1
        items.append(
            {
                "id": row.id,
                "title": row.title,
                "source": row.source,
                "created_at": row.created_at,
                "script_ids": script_ids,
                "parts": [
                    {
                        "id": s.id,
                        "part": s.part,
                        "title": s.title,
                        "accent_set": s.accent_set,
                    }
                    for s in scripts
                    if s is not None
                ],
                "audio_ready": ready == len([s for s in scripts if s is not None]) and ready > 0,
                "audio_ready_parts": ready,
                "total_questions": sum(
                    len(_question_rows(session, sid)) for sid in script_ids
                ),
            }
        )
    return {"items": items, "next_cursor": rows[-1].id if has_more and rows else None}


@router.get("/api/v1/listening/scripts", summary="List listening part-scripts")
def list_scripts(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    part: int | None = Query(default=None, ge=1, le=4),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
) -> dict[str, Any]:
    stmt = select(m.ListeningScript).where(m.ListeningScript.retired == 0)
    if part:
        stmt = stmt.where(m.ListeningScript.part == part)
    if cursor:
        stmt = stmt.where(m.ListeningScript.id > cursor)
    rows = list(
        session.execute(stmt.order_by(m.ListeningScript.id).limit(limit + 1)).scalars()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        {
            "id": row.id,
            "part": row.part,
            "title": row.title,
            "accent_set": row.accent_set,
            "target_band": row.target_band,
            "source": row.source,
            "questions": len(_question_rows(session, row.id)),
            "audio": _audio_status(row, _parse_script_json(row)),
        }
        for row in rows
    ]
    return {"items": items, "next_cursor": rows[-1].id if has_more and rows else None}


def _answers_allowed(session: Session, with_answers: int | bool) -> bool:
    """``with_answers=1``, but never while a mock sitting is open (DESIGN §0.5, L-D2).

    The practice routes hand out the key and the transcript on request, which is right for
    practice and fatal during a sitting: the mock and the practice player draw the same
    four scripts, so a candidate mid-paper could fetch the answers to the paper in front of
    them. The mock's own routes withhold the key; this closes the side door.

    Deliberately silent rather than a 409 — a client asking for answers outside a sitting
    is normal, and one asking during a sitting simply gets the learner-facing projection.
    """
    if not with_answers:
        return False
    from bandready.listening import mock as listening_mock

    return listening_mock.exam_conditions(session) is None


@router.get("/api/v1/listening/scripts/{script_id}", summary="One listening part-script")
def get_script(
    script_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    with_answers: int = Query(default=0),
) -> dict[str, Any]:
    row = _script_row(session, script_id)
    return _public_script(
        row, session, with_answers=_answers_allowed(session, with_answers)
    )


@router.get("/api/v1/listening/tests/{test_id}", summary="One listening test")
def get_test(
    test_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    with_answers: int = Query(default=0),
) -> dict[str, Any]:
    row = _test_row(session, test_id)
    with_answers = int(_answers_allowed(session, with_answers))
    scripts: list[tuple[m.ListeningScript, list[m.ListeningQuestion]]] = []
    for sid in _test_script_ids(row):
        script = _script_row(session, sid)
        scripts.append((script, _question_rows(session, sid)))
    offsets = _renumber(scripts)
    parts = [
        _public_script(
            script,
            session,
            with_answers=bool(with_answers),
            number_offset=offsets.get(script.id),
        )
        for script, _ in scripts
    ]
    return {
        "id": row.id,
        "title": row.title,
        "source": row.source,
        "created_at": row.created_at,
        "total_questions": sum(len(p["questions"]) for p in parts),
        "audio_ready": all(p["audio"]["ready"] for p in parts) if parts else False,
        "parts": parts,
    }


# --------------------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------------------


def _render_payload(row: m.ListeningScript, script: Mapping[str, Any], result: Mapping[str, Any]) -> dict[str, Any]:
    audio_hash = str(result.get("audio_hash"))
    return {
        "script_id": row.id,
        "audio_hash": audio_hash,
        "duration_ms": result.get("duration_ms", 0),
        "cached": bool(result.get("cached")),
        "media_path": f"/api/v1/media/listening/{audio_hash}.wav",
        "timing_path": f"/api/v1/media/listening/{audio_hash}.timing.json",
        "accent_set": result.get("accent_set", row.accent_set),
        "accent_label": tts_render.accent_label(result.get("accent_set", row.accent_set)),
    }


@router.post("/api/v1/listening/scripts/{script_id}/render", summary="Render script audio")
async def render_script_route(
    script_id: str,
    response: Response,
    body: RenderBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    options = body or RenderBody()
    row = _script_row(session, script_id)
    script = _parse_script_json(row)
    accent = (options.accent_set or row.accent_set).lower()
    audio_hash = tts_render.script_audio_hash(script, options.accent_set)

    if not options.force:
        hit = tts_render.cached_render(audio_hash)
        if hit is not None:
            tts_render.touch_media(audio_hash)
            if row.audio_hash != audio_hash:
                row.audio_hash = audio_hash
                session.flush()
            response.status_code = 200
            return _render_payload(row, script, {**hit, "accent_set": accent})

    job_id = job_manager.submit(
        "listening_render",
        lambda jid: tts_render.render_script(
            script,
            accent_set=options.accent_set,
            script_id=row.id,
            job_id=jid,
            force=options.force,
        ),
    )
    response.status_code = 202
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id, "script_id": row.id, "expected_audio_hash": audio_hash}


@router.post("/api/v1/listening/tests/{test_id}/render", summary="Render a whole test")
async def render_test_route(
    test_id: str,
    response: Response,
    body: RenderBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    options = body or RenderBody()
    row = _test_row(session, test_id)
    parts: list[dict[str, Any]] = []
    pending: list[tuple[str, dict[str, Any]]] = []
    for sid in _test_script_ids(row):
        script_row = _script_row(session, sid)
        script = _parse_script_json(script_row)
        accent = (options.accent_set or script_row.accent_set).lower()
        audio_hash = tts_render.script_audio_hash(script, options.accent_set)
        hit = None if options.force else tts_render.cached_render(audio_hash)
        if hit is not None:
            tts_render.touch_media(audio_hash)
            if script_row.audio_hash != audio_hash:
                script_row.audio_hash = audio_hash
            parts.append(_render_payload(script_row, script, {**hit, "accent_set": accent}))
        else:
            pending.append((sid, script))
    session.flush()

    if not pending:
        return {"test_id": row.id, "cached": True, "parts": parts}

    async def run(job_id: str) -> dict[str, Any]:
        rendered: list[dict[str, Any]] = []
        for index, (sid, script) in enumerate(pending):
            job_manager.set_progress(
                job_id,
                int(100 * index / len(pending)),
                f"rendering part {index + 1} of {len(pending)}",
            )
            result = await tts_render.render_script(
                script,
                accent_set=options.accent_set,
                script_id=sid,
                force=options.force,
            )
            rendered.append({"script_id": sid, "audio_hash": result["audio_hash"]})
        job_manager.set_progress(job_id, 100, "audio ready")
        return {"test_id": row.id, "parts": rendered}

    job_id = job_manager.submit("listening_render", run)
    response.status_code = 202
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {
        "job_id": job_id,
        "test_id": row.id,
        "cached_parts": parts,
        "pending_parts": [sid for sid, _ in pending],
    }


# --------------------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------------------


@router.post("/api/v1/listening/generate", status_code=202, summary="Author a part-script")
async def generate_route(
    response: Response,
    body: GenerateBody | None = None,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    from bandready.content.generate_listening import generate_script

    options = body or GenerateBody()
    part = int(options.part or 1)
    if part not in (1, 2, 3, 4):
        raise ApiError(422, "validation_error", "part must be 1, 2, 3 or 4")

    job_id = job_manager.submit(
        "listening_generate",
        lambda jid: generate_script(
            part=part,
            topic=options.topic,
            target_band=options.target_band,
            accent_set=options.accent_set,
            job_id=jid,
        ),
    )
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id}


@router.post(
    "/api/v1/listening/tests/generate", status_code=202, summary="Author a 4-part test"
)
async def generate_test_route(
    response: Response,
    body: TestGenerateBody | None = None,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    from bandready.content.generate_listening import generate_test

    options = body or TestGenerateBody()
    job_id = job_manager.submit(
        "listening_generate",
        lambda jid: generate_test(target_band=options.target_band, job_id=jid),
    )
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id}


# --------------------------------------------------------------------------------------
# Attempts
# --------------------------------------------------------------------------------------


def _attempt_row(session: Session, attempt_id: str) -> m.ListeningAttempt:
    row = session.get(m.ListeningAttempt, attempt_id)
    if row is None:
        raise ApiError(404, "not_found", f"no listening attempt with id {attempt_id!r}")
    return row


def _envelope(session: Session, attempt_id: str) -> m.PracticeSession:
    row = session.get(m.PracticeSession, attempt_id)
    if row is None:  # pragma: no cover — the FK makes this impossible
        raise ApiError(404, "not_found", "the attempt envelope is missing")
    return row


def _draft(envelope: m.PracticeSession) -> dict[str, Any]:
    """In-progress answer sheet. Draft answers live in the envelope's ``summary_json``
    because ``listening_answers`` rows carry a NOT NULL ``correct`` — they are only
    materialised at submit time."""
    if not envelope.summary_json:
        return {}
    try:
        parsed = json.loads(envelope.summary_json)
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _save_draft(envelope: m.PracticeSession, draft: Mapping[str, Any]) -> None:
    envelope.summary_json = json.dumps(draft, ensure_ascii=False)


def _attempt_questions(
    session: Session, attempt: m.ListeningAttempt
) -> list[tuple[m.ListeningScript, m.ListeningQuestion, int]]:
    """``(script, question, display_number)`` in play order."""
    if attempt.test_id:
        test = _test_row(session, attempt.test_id)
        script_ids = _test_script_ids(test)
    else:
        script_ids = [str(attempt.script_id)]
    pairs: list[tuple[m.ListeningScript, list[m.ListeningQuestion]]] = []
    for sid in script_ids:
        script = _script_row(session, sid)
        pairs.append((script, _question_rows(session, sid)))
    offsets = _renumber(pairs)
    out: list[tuple[m.ListeningScript, m.ListeningQuestion, int]] = []
    for script, questions in pairs:
        mapping = offsets.get(script.id) or {}
        for question in questions:
            out.append((script, question, mapping.get(question.number, question.number)))
    return out


def _score_question(
    given: str, slots: Sequence[Sequence[str]], word_limit: int | None
) -> dict[str, Any]:
    """One question -> points, per-slot detail and the ``near_miss_spelling`` tag.

    A multi-answer question (``choose TWO letters``) contributes one raw point per slot,
    order-insensitive, exactly as real IELTS numbers them (07 §5.5).
    """
    max_points = max(1, len(slots))
    answer = (given or "").strip()
    if not answer:
        return {
            "points": 0,
            "max_points": max_points,
            "correct": False,
            "near_miss_spelling": False,
            "over_limit": False,
        }

    # Use the SHARED limit rule (06 §2.1), not a bare token count. "ONE WORD AND/OR A
    # NUMBER" allows one number *in addition to* the word allowance, and a run of adjacent
    # number tokens is one number -- so "01472 330915" and "86 pounds" are both legal at a
    # limit of 1. Counting tokens instead rejected 8 of this pack's own accepted answers,
    # including the Part 1 telephone number in six different tests.
    over_limit = word_limit is not None and not within_word_limit(answer, word_limit)
    if over_limit:
        return {
            "points": 0,
            "max_points": max_points,
            "correct": False,
            "near_miss_spelling": False,
            "over_limit": True,
        }

    if len(slots) <= 1:
        variants = list(slots[0]) if slots else []
        hit = answers_match(answer, variants)
        return {
            "points": 1 if hit else 0,
            "max_points": 1,
            "correct": hit,
            "near_miss_spelling": (not hit) and is_near_miss(answer, variants),
            "over_limit": False,
        }

    # Multi-select: split the learner's answer into tokens and match slots as a set.
    tokens = [t for t in _split_multi(answer) if t]
    remaining = list(range(len(slots)))
    points = 0
    for token in tokens:
        for slot_index in list(remaining):
            if answers_match(token, list(slots[slot_index])):
                points += 1
                remaining.remove(slot_index)
                break
    return {
        "points": points,
        "max_points": max_points,
        "correct": points == max_points,
        "near_miss_spelling": False,
        "over_limit": False,
    }


def _split_multi(answer: str) -> list[str]:
    parts = [p.strip() for p in answer.replace(";", ",").replace("/", ",").split(",")]
    if len(parts) > 1:
        return parts
    tokens = answer.split()
    if len(tokens) > 1:
        return tokens
    if len(answer) > 1 and answer.isalpha() and answer.isupper():
        return list(answer)  # "BD" -> ["B", "D"]
    return [answer]


def _band_for(raw: int, total: int, attempt: m.ListeningAttempt) -> float | None:
    """Bands only for full-test attempts (07 §7: partial practice reports raw only)."""
    if not attempt.test_id or total < 20:
        return None
    scaled = raw if total == 40 else round(raw * 40 / total)
    return raw_to_band(scaled)


@router.post("/api/v1/listening/attempts", status_code=201, summary="Start an attempt")
def create_attempt(
    body: AttemptCreate,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if bool(body.test_id) == bool(body.script_id):
        raise ApiError(
            422, "validation_error", "supply exactly one of test_id or script_id"
        )
    if body.mode not in MODES:
        raise ApiError(422, "validation_error", f"mode must be one of {', '.join(MODES)}")

    # A practice attempt opened mid-sitting defeats the sitting outright: it draws the same
    # four scripts, and the practice player mounts a full transport, so the "each recording
    # plays once" condition the mock enforces server-side (`/mock/sessions/{id}/play`
    # returns 409 on a second request) is bought back for free in another tab. The mock
    # screen already promises "while a mock is open you cannot start another attempt";
    # this is where that promise is kept. Drills already refuse the same way.
    from bandready.listening import mock as listening_mock

    conditions = listening_mock.exam_conditions(session)
    if conditions is not None:
        raise listening_mock.refusal(conditions)

    if body.test_id:
        _test_row(session, body.test_id)
    else:
        _script_row(session, str(body.script_id))

    attempt_id = f"la_{ULID()}"
    profile_id = current_profile_id(session)
    session.add(
        m.PracticeSession(
            id=attempt_id,
            profile_id=profile_id,
            module="listening",
            activity=body.mode,
            summary_json=json.dumps(
                {
                    "answers": dict(body.answers or {}),
                    "seconds_elapsed": 0,
                    "play_counts": {},
                    "play_count": 0,
                    "current_part": 1,
                }
            ),
        )
    )
    # The envelope must exist before the module row: listening_attempts.id is an FK onto
    # practice_sessions.id and models.py declares no relationship to order the inserts.
    session.flush()
    session.add(
        m.ListeningAttempt(
            id=attempt_id,
            test_id=body.test_id,
            script_id=body.script_id,
            mode=body.mode,
            status="in_progress",
        )
    )
    session.flush()

    attempt = _attempt_row(session, attempt_id)
    questions = _attempt_questions(session, attempt)
    return {
        "attempt_id": attempt_id,
        "mode": body.mode,
        "test_id": body.test_id,
        "script_id": body.script_id,
        "total_questions": sum(max(1, len(_slots(q))) for _, q, _ in questions),
        "question_numbers": [n for _, _, n in questions],
        "resume_state": {
            "answers": dict(body.answers or {}),
            "seconds_elapsed": 0,
            "play_count": 0,
            "current_part": 1,
        },
    }


@router.patch("/api/v1/listening/attempts/{attempt_id}", summary="Autosave an attempt")
def patch_attempt(
    attempt_id: str,
    body: AttemptPatch,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    attempt = _attempt_row(session, attempt_id)
    if attempt.status == "submitted":
        raise ApiError(409, "conflict", "this attempt has already been submitted")
    envelope = _envelope(session, attempt_id)
    draft = _draft(envelope)

    answers = dict(draft.get("answers") or {})
    if body.answers:
        # PATCH is a partial deep-merge (18 §1): only the keys sent are touched.
        answers.update({str(k): str(v) for k, v in body.answers.items()})
    draft["answers"] = answers

    if body.seconds_elapsed is not None:
        draft["seconds_elapsed"] = int(body.seconds_elapsed)
        attempt.duration_s = int(body.seconds_elapsed)
    if body.current_part is not None:
        draft["current_part"] = int(body.current_part)

    play_counts = dict(draft.get("play_counts") or {})
    if body.played_script_id:
        play_counts[body.played_script_id] = int(play_counts.get(body.played_script_id, 0)) + 1
        draft["play_counts"] = play_counts
        draft["play_count"] = int(draft.get("play_count", 0)) + 1
    if body.play_count is not None:
        draft["play_count"] = int(body.play_count)
    if body.status == "abandoned":
        attempt.status = "abandoned"

    _save_draft(envelope, draft)
    session.flush()
    return {
        "attempt_id": attempt_id,
        "status": attempt.status,
        "answered": len([v for v in answers.values() if str(v).strip()]),
        "seconds_elapsed": int(draft.get("seconds_elapsed", 0)),
        "play_count": int(draft.get("play_count", 0)),
        "play_counts": play_counts,
    }


@router.post("/api/v1/listening/attempts/{attempt_id}/submit", summary="Score an attempt")
def submit_attempt(
    attempt_id: str,
    body: AttemptPatch | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    attempt = _attempt_row(session, attempt_id)
    envelope = _envelope(session, attempt_id)
    draft = _draft(envelope)
    answers = dict(draft.get("answers") or {})
    if body is not None and body.answers:
        answers.update({str(k): str(v) for k, v in body.answers.items()})
    if body is not None and body.seconds_elapsed is not None:
        draft["seconds_elapsed"] = int(body.seconds_elapsed)

    if attempt.status == "submitted":
        raise ApiError(409, "conflict", "this attempt has already been submitted")

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    per_question: list[dict[str, Any]] = []
    per_type: dict[str, dict[str, int]] = {}
    raw = 0
    total = 0
    part_tally: dict[str, dict[str, Any]] = {}
    candidates: list[dict[str, Any]] = []

    session.execute(
        delete(m.ListeningAnswer).where(m.ListeningAnswer.attempt_id == attempt_id)
    )

    for script, question, number in _attempt_questions(session, attempt):
        slots = _slots(question)
        given = str(answers.get(str(number), "")).strip()
        result = _score_question(given, slots, question.word_limit)
        raw += int(result["points"])
        total += int(result["max_points"])

        bucket = per_type.setdefault(question.qtype, {"correct": 0, "total": 0})
        bucket["correct"] += int(result["points"])
        bucket["total"] += int(result["max_points"])

        tally = part_tally.setdefault(
            script.id,
            {"script_id": script.id, "part": script.part, "title": script.title,
             "correct": 0, "total": 0},
        )
        tally["correct"] += int(result["points"])
        tally["total"] += int(result["max_points"])

        session.add(
            m.ListeningAnswer(
                id=f"lan_{ULID()}",
                attempt_id=attempt_id,
                question_id=question.id,
                qtype=question.qtype,
                given=given,
                normalized=normalize_answer(given),
                correct=1 if result["correct"] else 0,
            )
        )
        per_question.append(
            {
                "number": number,
                "question_id": question.id,
                "script_id": script.id,
                "part": script.part,
                "type": question.qtype,
                "given": given,
                "correct": bool(result["correct"]),
                "points": int(result["points"]),
                "max_points": int(result["max_points"]),
                "over_limit": bool(result["over_limit"]),
                "near_miss_spelling": bool(result["near_miss_spelling"]),
                "accepted": [list(slot) for slot in slots],
            }
        )
        if not result["correct"] and slots:
            candidates.append(
                _srs_candidate(script, question, slots, bool(result["near_miss_spelling"]))
            )

    per_part: list[dict[str, Any]] = sorted(part_tally.values(), key=lambda p: p["part"])
    band = _band_for(raw, total, attempt)

    attempt.status = "submitted"
    attempt.raw_score = raw
    attempt.total_questions = total
    attempt.band = band
    attempt.submitted_at = now
    attempt.duration_s = int(draft.get("seconds_elapsed", attempt.duration_s or 0))

    draft["answers"] = answers
    draft["score"] = {
        "raw_score": raw,
        "total_questions": total,
        "band": band,
        "per_type": per_type,
    }
    _save_draft(envelope, draft)
    envelope.ended_at = now
    envelope.duration_s = attempt.duration_s
    session.flush()

    return {
        "attempt_id": attempt_id,
        "mode": attempt.mode,
        "status": attempt.status,
        "raw_score": raw,
        "total_questions": total,
        "band": band,
        "band_note": None if band is not None else "raw score only — bands need a full test",
        "duration_s": attempt.duration_s,
        "submitted_at": now,
        "per_question": per_question,
        "per_type": per_type,
        "per_part": per_part,
        "near_miss_spellings": [
            q["number"] for q in per_question if q["near_miss_spelling"]
        ],
        "srs_candidates": candidates,
    }


def _srs_candidate(
    script: m.ListeningScript,
    question: m.ListeningQuestion,
    slots: Sequence[Sequence[str]],
    near_miss: bool,
) -> dict[str, Any]:
    """07 §12 — a suggestion for the vocabulary inbox; nothing is auto-scheduled."""
    term = slots[0][0] if slots and slots[0] else ""
    sentence = ""
    if question.cue_line_index is not None:
        try:
            lines = _parse_script_json(script).get("lines") or []
            if 0 <= int(question.cue_line_index) < len(lines):
                sentence = str(lines[int(question.cue_line_index)].get("text") or "")
        except ApiError:  # pragma: no cover — unreadable script JSON
            sentence = ""
    return {
        "term": term,
        "sentence_context": sentence,
        "source": {"kind": "listening", "item_id": question.id},
        "card_type": "spelling" if near_miss else "listening_gap",
        "audio_line_ref": (
            {"script_id": script.id, "line_index": question.cue_line_index}
            if question.cue_line_index is not None
            else None
        ),
    }


@router.get("/api/v1/listening/attempts", summary="List listening attempts")
def list_attempts(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
) -> dict[str, Any]:
    # The envelope is joined for one field: `started_at`. Only a submitted attempt has a
    # `submitted_at`, so a list keyed on it can date the attempts that went well and none
    # of the ones that were walked out of — which is most of what a history screen is for.
    # The join is total: `listening_attempts.id` is an FK onto `practice_sessions.id`.
    stmt = select(m.ListeningAttempt, m.PracticeSession).join(
        m.PracticeSession, m.PracticeSession.id == m.ListeningAttempt.id
    )
    if cursor:
        stmt = stmt.where(m.ListeningAttempt.id < cursor)
    rows = list(session.execute(stmt.order_by(m.ListeningAttempt.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        {
            "attempt_id": row.id,
            "test_id": row.test_id,
            "script_id": row.script_id,
            "mode": row.mode,
            "status": row.status,
            "raw_score": row.raw_score,
            "total_questions": row.total_questions,
            "band": row.band,
            "duration_s": row.duration_s,
            "started_at": envelope.started_at,
            "submitted_at": row.submitted_at,
        }
        for row, envelope in rows
    ]
    return {"items": items, "next_cursor": rows[-1][0].id if has_more and rows else None}


@router.get("/api/v1/listening/attempts/{attempt_id}/review", summary="Review an attempt")
def review_attempt(
    attempt_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    attempt = _attempt_row(session, attempt_id)
    # The review body carries the full transcript, the key and now the teaching payload,
    # and in listening the transcript *is* the key. Serving it for an attempt still in
    # progress hands the learner the answers to the audio they are about to hear — the
    # one thing this module cannot take back, because the audio plays once (DESIGN §0.5).
    if attempt.status != "submitted":
        raise ApiError(
            409,
            "conflict",
            "this attempt has not been submitted yet — the transcript and the answers "
            "unlock after you submit",
        )
    envelope = _envelope(session, attempt_id)
    draft = _draft(envelope)
    stored = {
        row.question_id: row
        for row in session.execute(
            select(m.ListeningAnswer).where(m.ListeningAnswer.attempt_id == attempt_id)
        ).scalars()
    }
    answers = dict(draft.get("answers") or {})

    parts: dict[str, dict[str, Any]] = {}
    timings: dict[str, dict[str, Any]] = {}
    for script, question, number in _attempt_questions(session, attempt):
        document = _parse_script_json(script)
        meta = _question_meta(document).get(question.number, {})
        authored = _authored_questions(document).get(question.number, {})
        lines = document.get("lines") or []
        if script.id not in timings:
            timings[script.id] = (
                tts_render.load_timing(script.audio_hash) if script.audio_hash else None
            ) or {}
        timing = timings[script.id]
        part_entry = parts.get(script.id)
        if part_entry is None:
            part_entry = {
                "script_id": script.id,
                "part": script.part,
                "title": script.title,
                "accent_set": script.accent_set,
                "audio_hash": script.audio_hash,
                "media_path": (
                    f"/api/v1/media/listening/{script.audio_hash}.wav"
                    if script.audio_hash
                    else None
                ),
                # The transcript is unlocked only here, after submission (07 §4/§6).
                "transcript": {
                    "speakers": document.get("speakers") or [],
                    "lines": [
                        {
                            "index": i,
                            "speaker": line.get("speaker"),
                            "text": line.get("text"),
                            "start_ms": _line_start_ms(timing, i),
                        }
                        for i, line in enumerate(lines)
                        if isinstance(line, Mapping)
                    ],
                },
                # L-D1 (staging-listening/DESIGN.md §0.5). Every teaching field the
                # authors wrote lives under one key named `teaching` at each of the three
                # levels, so the projection is one `get()` per level — and it happens
                # *only* here, after submission, which is exactly the gate we want. The
                # practice player's own endpoints never see any of it.
                "teaching": document.get("teaching"),
                "groups": document.get("groups"),
                "questions": [],
            }
            parts[script.id] = part_entry

        given = str(answers.get(str(number), "")).strip()
        row = stored.get(question.id)
        slots = _slots(question)
        cue_index = question.cue_line_index
        cue_text = ""
        if cue_index is not None and 0 <= int(cue_index) < len(lines):
            cue_text = str(lines[int(cue_index)].get("text") or "")
        part_entry["questions"].append(
            {
                "number": number,
                "question_id": question.id,
                "type": question.qtype,
                "instruction": meta.get("instruction"),
                "prompt": meta.get("prompt"),
                "options": meta.get("options"),
                "word_limit": question.word_limit,
                "given": given,
                "correct": bool(row.correct) if row is not None else None,
                "accepted": [list(slot) for slot in slots],
                "explanation": question.explanation,
                # The prediction / signpost / distraction / form / recovery timeline,
                # served only here and only after submission (DESIGN §0.5, L-D1).
                "teaching": authored.get("teaching"),
                "cue_line_index": cue_index,
                "cue_text": cue_text,
                "audio_ms": _line_start_ms(timing, cue_index),
                "near_miss_spelling": (
                    bool(row is not None and not row.correct and is_near_miss(
                        given, [v for slot in slots for v in slot]
                    ))
                ),
            }
        )

    return {
        "attempt_id": attempt_id,
        "mode": attempt.mode,
        "status": attempt.status,
        "raw_score": attempt.raw_score,
        "total_questions": attempt.total_questions,
        "band": attempt.band,
        "duration_s": attempt.duration_s,
        "submitted_at": attempt.submitted_at,
        "play_count": int(draft.get("play_count", 0)),
        "parts": sorted(parts.values(), key=lambda p: p["part"]),
    }


def _line_start_ms(timing: Mapping[str, Any], index: int | None) -> int | None:
    """Where a script line begins in the rendered WAV, from the stitch offsets."""
    if index is None:
        return None
    for line in timing.get("lines") or []:
        if isinstance(line, Mapping) and int(line.get("index", -1)) == int(index):
            return int(line.get("start_ms", 0))
    return None


# --------------------------------------------------------------------------------------
# Media (ticket auth per R2-2, HTTP Range so the player can seek)
# --------------------------------------------------------------------------------------


def _media_auth(request: Request) -> None:
    """Bearer is accepted for XHR; anything else must present a ``media-read`` ticket."""
    if getattr(request.state, "auth_kind", None) == "bearer":
        return
    from bandready.config import get_settings

    if not get_settings().auth_token:
        return  # auth disabled (dev/headless) — the loopback bind is the only guard
    require_ticket(
        request.query_params.get("ticket"), "media-read", request.url.path
    )


def _media_file(audio_hash: str, suffix: str) -> Path:
    if "/" in audio_hash or "\\" in audio_hash or ".." in audio_hash:
        raise ApiError(404, "not_found", "no such media file")
    wav_path, timing_path = tts_render.listening_audio_paths(audio_hash)
    path = wav_path if suffix == "wav" else timing_path
    if not path.exists():
        raise ApiError(404, "not_found", "that audio has not been rendered yet")
    return path


def _parse_range(header: str, size: int) -> tuple[int, int] | None:
    """RFC 7233 single-range parsing. Returns ``(start, end)`` inclusive, or ``None``."""
    value = (header or "").strip().lower()
    if not value.startswith("bytes="):
        return None
    spec = value[6:].split(",")[0].strip()
    if "-" not in spec:
        return None
    first, _, last = spec.partition("-")
    try:
        if not first:  # suffix range: bytes=-500
            length = int(last)
            if length <= 0:
                return None
            return max(0, size - length), size - 1
        start = int(first)
        end = int(last) if last else size - 1
    except ValueError:
        return None
    if start >= size or start > end:
        return None
    return start, min(end, size - 1)


@router.get(
    "/api/v1/media/listening/{audio_hash}.timing.json",
    summary="Line timings for a rendered script",
)
def media_timing(audio_hash: str, request: Request) -> Response:
    _media_auth(request)
    path = _media_file(audio_hash, "timing")
    tts_render.touch_media(audio_hash)
    return Response(
        content=path.read_bytes(),
        media_type="application/json",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/api/v1/media/listening/{audio_hash}.wav", summary="Rendered listening audio")
def media_audio(audio_hash: str, request: Request) -> Response:
    _media_auth(request)
    path = _media_file(audio_hash, "wav")
    size = path.stat().st_size
    tts_render.touch_media(audio_hash)

    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": f'inline; filename="{audio_hash}.wav"',
    }
    range_header = request.headers.get("range")
    if not range_header:
        return Response(
            content=path.read_bytes(),
            media_type="audio/wav",
            headers={**base_headers, "Content-Length": str(size)},
        )

    parsed = _parse_range(range_header, size)
    if parsed is None:
        return Response(
            status_code=416,
            content=json.dumps({"detail": "invalid range", "code": "validation_error"}),
            media_type="application/json",
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )

    start, end = parsed
    with path.open("rb") as handle:
        handle.seek(start)
        chunk = handle.read(end - start + 1)
    return Response(
        status_code=206,
        content=chunk,
        media_type="audio/wav",
        headers={
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(len(chunk)),
        },
    )
