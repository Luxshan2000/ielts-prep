"""Writing routes (18-api-contract.md §4.8, behaviour owned by 05-writing-module.md).

    GET    /api/v1/writing/prompts                     browse/filter the prompt bank
    GET    /api/v1/writing/prompts/{id}
    POST   /api/v1/writing/prompts/generate            202 {job_id}  (writing_prompt_generate)
    POST   /api/v1/writing/prompts/{id}/model-answer   200 cache hit | 202 {job_id}
    GET    /api/v1/writing/templates                   phrase/framework library
    GET    /api/v1/writing/rubrics                     paraphrased band descriptors
    POST   /api/v1/writing/attempts                    201 {attempt_id}
    PATCH  /api/v1/writing/attempts/{id}               autosave (10 s)
    GET    /api/v1/writing/attempts/{id}/precheck      local gates before spending tokens
    POST   /api/v1/writing/attempts/{id}/submit        202 {job_id}  (writing_eval)
    GET    /api/v1/writing/attempts/{id}               attempt + feedback + annotations
    GET    /api/v1/writing/attempts                    history / lineage
    POST   /api/v1/writing/attempts/{id}/rewrite       201 child draft (05 §8)
    GET    /api/v1/writing/attempts/{id}/model-answer  exemplar for this attempt's prompt

Every ``/attempts`` path is also served at ``/submissions`` (same handler, hidden from the
schema): the wire noun is *attempt*, the table is ``writing_submissions``, and both names
appear in the plan docs.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.scoring import writing as scoring
from bandready.scoring.rubrics import rubric_payload
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager
from bandready.timeutil import iso
from bandready.writing import coach

_log = logging.getLogger("bandready.routes.writing")

router = APIRouter(
    prefix="/api/v1/writing",
    tags=["writing"],
    dependencies=[Depends(require_auth)],
)

MAX_LIMIT = 200
DEFAULT_LIMIT = 50


def _loads(raw: str | None, default: Any = None) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return default


# --------------------------------------------------------------------------------------
# Bodies
# --------------------------------------------------------------------------------------

class CreateAttemptBody(BaseModel):
    prompt_id: str
    mode: Literal["practice", "exam"] = "practice"


class PatchAttemptBody(BaseModel):
    essay_text: str | None = None
    outline_text: str | None = None
    seconds_elapsed: int | None = Field(default=None, ge=0)
    paste_events: int | None = Field(default=None, ge=0)
    #: words in the paste that just happened — >40 flags the attempt (05 §3).
    last_paste_words: int | None = Field(default=None, ge=0)


class SubmitBody(BaseModel):
    #: the learner clicked "Submit anyway" on the pre-check modal; recorded, never gates.
    acknowledge_warnings: bool = False


class RewriteBody(BaseModel):
    prefill: bool = True
    mode: Literal["practice", "exam"] | None = None


class GenerateBody(BaseModel):
    task_type: Literal["ac_task1", "gt_task1", "task2"]
    genre: str | None = None
    topic: str | None = None


class ModelAnswerBody(BaseModel):
    band: int = Field(default=8, ge=7, le=9)


# --------------------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------------------

def _prompt_payload(prompt: m.WritingPrompt) -> dict[str, Any]:
    meta = scoring.TASKS.get(prompt.task_type, {})
    return {
        "id": prompt.id,
        "task_type": prompt.task_type,
        "task_label": meta.get("label", prompt.task_type),
        "genre": prompt.genre,
        "difficulty": prompt.difficulty,
        "topic_id": prompt.topic_id,
        "topic_tags": _loads(prompt.topic_tags, []) or [],
        "prompt_text": prompt.prompt_text,
        "chart_spec": _loads(prompt.chart_spec),
        "letter_bullets": _loads(prompt.letter_bullets, []) or [],
        # The authored teaching layer, minus everything the attempt gate withholds.
        # Null on a prompt that carries none — the app must render "no teaching
        # material" rather than assume it is there. The model answers, the ladder, the
        # swap slots and the Academic overview's content are *not* here at any price:
        # they leave only through GET /writing/coach/prompts/{id}/teaching, which asks
        # the learner's attempt history first (writing/coach.py:redact_gated).
        "teaching": coach.redact_gated(_loads(getattr(prompt, "teaching_json", None))),
        "min_words": meta.get("min_words"),
        "time_limit_s": (int(meta["minutes"]) * 60) if meta.get("minutes") else None,
        "source": prompt.source,
        "license": prompt.license,
        "retired": bool(prompt.retired),
        "created_at": prompt.created_at,
    }


def _evaluation_payload(evaluation: m.WritingEvaluation | None) -> dict[str, Any] | None:
    if evaluation is None:
        return None
    payload = _loads(evaluation.annotations_json, {}) or {}
    return {
        "id": evaluation.id,
        "created_at": evaluation.created_at,
        "llm_evaluation_id": evaluation.llm_evaluation_id,
        "prompt_version": payload.get("prompt_version", scoring.WRITING_EVAL_PROMPT_VERSION),
        "overall_band": evaluation.overall_band,
        "bands": {
            "ta": evaluation.band_ta,
            "cc": evaluation.band_cc,
            "lr": evaluation.band_lr,
            "gra": evaluation.band_gra,
        },
        "criteria": payload.get("criteria", {}),
        "annotations": payload.get("annotations", []),
        "unanchored": payload.get("unanchored", []),
        "structure_analysis": payload.get("structure_analysis", {}),
        "model_answer_outline": payload.get("model_answer_outline", []),
        "prechecks": payload.get("prechecks", []),
        "vocab_suggestions": _loads(evaluation.vocab_suggestions_json, []) or [],
    }


def _latest_evaluation(session: Session, submission_id: str) -> m.WritingEvaluation | None:
    return session.scalars(
        select(m.WritingEvaluation)
        .where(m.WritingEvaluation.submission_id == submission_id)
        .order_by(m.WritingEvaluation.created_at.desc(), m.WritingEvaluation.id.desc())
        .limit(1)
    ).first()


def _attempt_summary(
    submission: m.WritingSubmission,
    envelope: m.PracticeSession | None = None,
) -> dict[str, Any]:
    return {
        "id": submission.id,
        "attempt_id": submission.id,
        "prompt_id": submission.prompt_id,
        "parent_attempt_id": submission.parent_submission_id,
        "mode": submission.mode,
        "status": submission.status,
        "word_count": submission.word_count,
        "seconds_elapsed": submission.seconds_elapsed,
        "overtime_seconds": submission.overtime_seconds,
        "paste_events": submission.paste_events,
        "integrity_flag": submission.integrity_flag,
        "submitted_at": submission.submitted_at,
        "overall_band": submission.overall_band,
        "started_at": envelope.started_at if envelope is not None else None,
    }


def _attempt_payload(
    session: Session,
    submission: m.WritingSubmission,
    *,
    with_parent: bool = True,
) -> dict[str, Any]:
    envelope = session.get(m.PracticeSession, submission.id)
    prompt = session.get(m.WritingPrompt, submission.prompt_id)
    evaluation = _latest_evaluation(session, submission.id)
    history = session.scalars(
        select(m.WritingEvaluation)
        .where(m.WritingEvaluation.submission_id == submission.id)
        .order_by(m.WritingEvaluation.created_at.desc())
    ).all()

    payload = _attempt_summary(submission, envelope)
    payload.update({
        "essay_text": submission.essay_text,
        "outline_text": submission.outline_text,
        "prompt": _prompt_payload(prompt) if prompt is not None else None,
        "min_words": scoring.min_words_for(prompt.task_type) if prompt is not None else None,
        "time_limit_s": scoring.time_limit_s(prompt.task_type) if prompt is not None else None,
        "evaluation": _evaluation_payload(evaluation),
        "evaluations": [
            {
                "id": row.id,
                "created_at": row.created_at,
                "overall_band": row.overall_band,
                "bands": {"ta": row.band_ta, "cc": row.band_cc,
                          "lr": row.band_lr, "gra": row.band_gra},
            }
            for row in history
        ],
        "children": [
            child_id
            for (child_id,) in session.execute(
                select(m.WritingSubmission.id).where(
                    m.WritingSubmission.parent_submission_id == submission.id
                )
            ).all()
        ],
    })

    parent_payload = None
    if with_parent and submission.parent_submission_id:
        parent = session.get(m.WritingSubmission, submission.parent_submission_id)
        if parent is not None:
            parent_eval = _latest_evaluation(session, parent.id)
            parent_body = _evaluation_payload(parent_eval)
            parent_payload = {
                "id": parent.id,
                "essay_text": parent.essay_text,
                "word_count": parent.word_count,
                "overall_band": parent.overall_band,
                "bands": (parent_body or {}).get("bands"),
                "annotations": (parent_body or {}).get("annotations", []),
                "submitted_at": parent.submitted_at,
            }
    payload["parent"] = parent_payload
    return payload


def _get_attempt(session: Session, attempt_id: str) -> m.WritingSubmission:
    submission = session.get(m.WritingSubmission, attempt_id)
    if submission is None:
        raise ApiError(404, "not_found", f"no writing attempt {attempt_id!r}")
    return submission


def _get_prompt(session: Session, prompt_id: str) -> m.WritingPrompt:
    prompt = session.get(m.WritingPrompt, prompt_id)
    if prompt is None:
        raise ApiError(404, "not_found", f"no writing prompt {prompt_id!r}")
    return prompt


# --------------------------------------------------------------------------------------
# Prompt bank
# --------------------------------------------------------------------------------------

@router.get("/prompts", summary="Browse the writing prompt bank")
def list_prompts(
    session: Session = Depends(get_session),
    task_type: str | None = Query(default=None),
    genre: str | None = Query(default=None),
    variant: str | None = Query(default=None, description="alias of genre"),
    difficulty: int | None = Query(default=None, ge=1, le=3),
    q: str | None = Query(default=None),
    include_retired: bool = Query(default=False),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    stmt = select(m.WritingPrompt)
    if task_type:
        if task_type not in scoring.TASK_TYPES:
            raise ApiError(422, "validation_error", f"unknown task_type {task_type!r}")
        stmt = stmt.where(m.WritingPrompt.task_type == task_type)
    wanted_genre = genre or variant
    if wanted_genre:
        stmt = stmt.where(m.WritingPrompt.genre == wanted_genre)
    if difficulty is not None:
        stmt = stmt.where(m.WritingPrompt.difficulty == difficulty)
    if q:
        stmt = stmt.where(m.WritingPrompt.prompt_text.ilike(f"%{q}%"))
    if not include_retired:
        stmt = stmt.where(m.WritingPrompt.retired == 0)
    if cursor:
        stmt = stmt.where(m.WritingPrompt.id > cursor)

    rows = session.scalars(stmt.order_by(m.WritingPrompt.id).limit(limit + 1)).all()
    page = rows[:limit]
    return {
        "items": [_prompt_payload(row) for row in page],
        "next_cursor": page[-1].id if len(rows) > limit and page else None,
    }


@router.get("/prompts/{prompt_id}", summary="One writing prompt")
def get_prompt(prompt_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    return _prompt_payload(_get_prompt(session, prompt_id))


@router.post("/prompts/generate", status_code=202, summary="Generate a new prompt")
async def generate_prompt(body: GenerateBody, response: Response) -> dict[str, Any]:
    scoring.task_meta(body.task_type)  # 422 before a job is created
    job_id = job_manager.submit(
        "writing_prompt_generate",
        lambda jid: scoring.generate_prompt(body.task_type, body.genre, body.topic, jid),
    )
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id}


@router.post("/prompts/{prompt_id}/model-answer", summary="AI exemplar for this prompt")
async def prompt_model_answer(
    prompt_id: str,
    body: ModelAnswerBody,
    response: Response,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _get_prompt(session, prompt_id)
    return _model_answer(prompt_id, body.band, response)


def _model_answer(prompt_id: str, band: int, response: Response) -> dict[str, Any]:
    cached = scoring.cached_model_answer(prompt_id, band)
    if cached:
        response.status_code = 200
        return {
            "prompt_id": prompt_id,
            "band": band,
            "text": cached.get("text", ""),
            "banner": scoring.MODEL_ANSWER_BANNER.format(band=band),
            "cached": True,
            "created_at": cached.get("created_at"),
        }
    job_id = job_manager.submit(
        "writing_model_answer",
        lambda jid: scoring.generate_model_answer(prompt_id, band, jid),
    )
    response.status_code = 202
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {"job_id": job_id, "prompt_id": prompt_id, "band": band}


# --------------------------------------------------------------------------------------
# Attempts
# --------------------------------------------------------------------------------------

@router.post("/attempts", status_code=201, summary="Start a writing attempt")
def create_attempt(
    body: CreateAttemptBody,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    prompt = _get_prompt(session, body.prompt_id)
    profile_id = current_profile_id(session)
    attempt_id = f"wa_{ULID()}"
    session.add(
        m.PracticeSession(
            id=attempt_id,
            profile_id=profile_id,
            module="writing",
            activity=prompt.task_type,
            started_at=iso(),
        )
    )
    session.add(
        m.WritingSubmission(
            id=attempt_id,
            prompt_id=prompt.id,
            mode=body.mode,
            status="draft",
            essay_text="",
            outline_text="",
            word_count=0,
            seconds_elapsed=0,
            overtime_seconds=0,
            paste_events=0,
        )
    )
    session.flush()
    submission = _get_attempt(session, attempt_id)
    payload = _attempt_payload(session, submission)
    payload["attempt_id"] = attempt_id
    return payload


@router.patch("/attempts/{attempt_id}", summary="Autosave a draft")
def patch_attempt(
    attempt_id: str,
    body: PatchAttemptBody,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    submission = _get_attempt(session, attempt_id)
    if submission.status not in ("draft", "failed"):
        raise ApiError(409, "conflict", "this attempt has already been submitted")

    previous_words = int(submission.word_count or 0)
    if body.essay_text is not None:
        submission.essay_text = body.essay_text
        submission.word_count = scoring.count_words(body.essay_text)
    if body.outline_text is not None:
        submission.outline_text = body.outline_text
    if body.seconds_elapsed is not None:
        submission.seconds_elapsed = int(body.seconds_elapsed)
    pasted_now = 0
    if body.paste_events is not None:
        if body.paste_events > int(submission.paste_events or 0):
            pasted_now = int(submission.word_count or 0) - previous_words
        submission.paste_events = int(body.paste_events)

    prompt = session.get(m.WritingPrompt, submission.prompt_id)
    if prompt is not None and submission.mode == "exam":
        limit = scoring.time_limit_s(prompt.task_type)
        submission.overtime_seconds = max(0, int(submission.seconds_elapsed or 0) - limit)

    flag_at = int(scoring.thresholds()["paste_flag_words"])
    big_paste = max(int(body.last_paste_words or 0), pasted_now)
    if big_paste > flag_at:
        submission.integrity_flag = "pasted"

    session.flush()
    return _attempt_summary(submission, session.get(m.PracticeSession, attempt_id))


def _precheck(session: Session, submission: m.WritingSubmission) -> dict[str, Any]:
    prompt = _get_prompt(session, submission.prompt_id)
    chart_spec = _loads(prompt.chart_spec)
    checks = scoring.run_prechecks(
        submission.essay_text or "",
        task_type=prompt.task_type,
        prompt_text=prompt.prompt_text,
        chart_summary=scoring.chart_to_text(chart_spec) if chart_spec else "",
        letter_bullets=_loads(prompt.letter_bullets, []) or [],
    )
    return {
        "attempt_id": submission.id,
        "verdict": scoring.precheck_verdict(checks),
        "checks": checks,
        "blocks": scoring.blocking_checks(checks),
        "warnings": scoring.warning_checks(checks),
        "word_count": scoring.count_words(submission.essay_text or ""),
        "min_words": scoring.min_words_for(prompt.task_type),
    }


@router.get("/attempts/{attempt_id}/precheck", summary="Local gates before submitting")
def precheck_attempt(
    attempt_id: str, session: Session = Depends(get_session)
) -> dict[str, Any]:
    return _precheck(session, _get_attempt(session, attempt_id))


@router.post("/attempts/{attempt_id}/submit", status_code=202, summary="Score this attempt")
async def submit_attempt(
    attempt_id: str,
    response: Response,
    body: SubmitBody | None = None,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    submission = _get_attempt(session, attempt_id)
    if submission.status == "scored":
        raise ApiError(409, "conflict", "this attempt has already been scored")

    result = _precheck(session, submission)
    if result["blocks"]:
        raise ApiError(422, "validation_error", result["blocks"][0]["message"])

    submission.word_count = result["word_count"]
    submission.status = "submitted"
    submission.submitted_at = iso()
    session.flush()
    # The evaluation job opens its own session, so the row must be visible before the
    # background task can possibly run.
    session.commit()

    job_id = job_manager.submit(
        "writing_eval", lambda jid: scoring.evaluate_submission(attempt_id, jid)
    )
    response.headers["Location"] = f"/api/v1/jobs/{job_id}"
    return {
        "job_id": job_id,
        "attempt_id": attempt_id,
        "warnings": result["warnings"],
        "acknowledged": bool(body.acknowledge_warnings) if body else False,
    }


@router.get("/attempts", summary="Attempt history / lineage")
def list_attempts(
    session: Session = Depends(get_session),
    prompt_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    mode: str | None = Query(default=None),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    stmt = (
        select(m.WritingSubmission, m.PracticeSession)
        .join(m.PracticeSession, m.PracticeSession.id == m.WritingSubmission.id)
        .where(m.PracticeSession.profile_id == profile_id)
    )
    if prompt_id:
        stmt = stmt.where(m.WritingSubmission.prompt_id == prompt_id)
    if status:
        stmt = stmt.where(m.WritingSubmission.status == status)
    if mode:
        stmt = stmt.where(m.WritingSubmission.mode == mode)
    if cursor:
        stmt = stmt.where(m.WritingSubmission.id < cursor)

    rows = session.execute(
        stmt.order_by(m.WritingSubmission.id.desc()).limit(limit + 1)
    ).all()
    page = rows[:limit]
    prompts = {
        p.id: p
        for p in session.scalars(
            select(m.WritingPrompt).where(
                m.WritingPrompt.id.in_({row[0].prompt_id for row in page} or {""})
            )
        ).all()
    }
    items = []
    for submission, envelope in page:
        item = _attempt_summary(submission, envelope)
        prompt = prompts.get(submission.prompt_id)
        item["prompt"] = (
            {
                "id": prompt.id,
                "task_type": prompt.task_type,
                "genre": prompt.genre,
                "prompt_text": prompt.prompt_text[:220],
            }
            if prompt is not None
            else None
        )
        items.append(item)
    return {
        "items": items,
        "next_cursor": page[-1][0].id if len(rows) > limit and page else None,
    }


@router.get("/attempts/{attempt_id}", summary="Attempt + feedback + annotations")
def get_attempt(attempt_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    return _attempt_payload(session, _get_attempt(session, attempt_id))


@router.post("/attempts/{attempt_id}/rewrite", status_code=201, summary="Rewrite with feedback")
def rewrite_attempt(
    attempt_id: str,
    body: RewriteBody | None = None,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or RewriteBody()
    parent = _get_attempt(session, attempt_id)
    prompt = _get_prompt(session, parent.prompt_id)
    profile_id = current_profile_id(session)
    child_id = f"wa_{ULID()}"
    essay = parent.essay_text if body.prefill else ""
    session.add(
        m.PracticeSession(
            id=child_id,
            profile_id=profile_id,
            module="writing",
            activity=prompt.task_type,
            started_at=iso(),
        )
    )
    session.add(
        m.WritingSubmission(
            id=child_id,
            prompt_id=parent.prompt_id,
            parent_submission_id=parent.id,
            mode=body.mode or "practice",
            status="draft",
            essay_text=essay,
            outline_text="",
            word_count=scoring.count_words(essay),
            seconds_elapsed=0,
            overtime_seconds=0,
            paste_events=0,
        )
    )
    session.flush()
    payload = _attempt_payload(session, _get_attempt(session, child_id))
    payload["attempt_id"] = child_id
    return payload


@router.get("/attempts/{attempt_id}/model-answer", summary="AI exemplar for this attempt")
async def attempt_model_answer(
    attempt_id: str,
    response: Response,
    band: int = Query(default=8, ge=7, le=9),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    submission = _get_attempt(session, attempt_id)
    return _model_answer(submission.prompt_id, band, response)


# --------------------------------------------------------------------------------------
# Library routes
# --------------------------------------------------------------------------------------

TEMPLATES: list[dict[str, str]] = [
    {
        "id": "t2-opinion-skeleton",
        "category": "task2_skeleton",
        "title": "Opinion essay skeleton",
        "body": (
            "Intro: paraphrase question + clear thesis (\"This essay strongly agrees "
            "that ...\")\n"
            "Body 1: strongest reason + example\n"
            "Body 2: second reason + example (or concession + rebuttal)\n"
            "Conclusion: restate position, no new ideas"
        ),
        "teaching_note": (
            "Examiners reward a position stated in the intro and never abandoned."
        ),
    },
    {
        "id": "t2-discussion-skeleton",
        "category": "task2_skeleton",
        "title": "Discuss both views skeleton",
        "body": (
            "Intro: paraphrase + say you will look at both sides and give your view\n"
            "Body 1: view A, why people hold it, one concrete example\n"
            "Body 2: view B, why people hold it, one concrete example\n"
            "Conclusion: state which view you find more convincing and why"
        ),
        "teaching_note": (
            "Both views must get real development — a one-sentence nod to side B costs "
            "you Task Response."
        ),
    },
    {
        "id": "t2-problem-solution-skeleton",
        "category": "task2_skeleton",
        "title": "Problem and solution skeleton",
        "body": (
            "Intro: paraphrase + name the problem area\n"
            "Body 1: the main cause(s), explained, with an effect\n"
            "Body 2: the most workable solution + who implements it + why it works\n"
            "Conclusion: summarise cause and remedy in one sentence each"
        ),
        "teaching_note": "One well-developed solution beats three listed ones.",
    },
    {
        "id": "letter-formal-frame",
        "category": "letter_opening_closing",
        "title": "Formal letter frame",
        "body": (
            "Dear Sir or Madam,\n"
            "I am writing to <purpose: complain about / request / apply for> ...\n"
            "...\n"
            "I look forward to your prompt response.\n"
            "Yours faithfully,\n"
            "<Full name>"
        ),
        "teaching_note": (
            "'Yours faithfully' pairs with 'Dear Sir or Madam'; 'Yours sincerely' pairs "
            "with a named recipient. Never open a formal letter with 'Hi'."
        ),
    },
    {
        "id": "letter-informal-frame",
        "category": "letter_opening_closing",
        "title": "Informal letter frame",
        "body": (
            "Hi Tom,\n"
            "How have you been? I thought I'd write because ...\n"
            "...\n"
            "Anyway, let me know what you think.\n"
            "Best wishes,\n"
            "<First name>"
        ),
        "teaching_note": (
            "Informal does not mean careless: contractions and phrasal verbs yes, slang "
            "and abbreviations no."
        ),
    },
    {
        "id": "t1-overview-language",
        "category": "t1_overview_language",
        "title": "Overview sentences for Task 1",
        "body": (
            "Overall, it is clear that ...\n"
            "In general, X remained the most/least ... throughout the period.\n"
            "The most striking feature is that ...\n"
            "Trend verbs: rose, climbed, surged / fell, dipped, plummeted / levelled off, "
            "fluctuated\n"
            "Comparative frames: twice as many as, slightly higher than, roughly the same as"
        ),
        "teaching_note": (
            "An answer with no overview is capped around band 5 for Task Achievement — "
            "write it as the second paragraph, before any detail."
        ),
    },
    {
        "id": "cohesion-bank",
        "category": "cohesion_bank",
        "title": "Linkers grouped by function",
        "body": (
            "Adding: moreover, in addition, what is more\n"
            "Contrasting: however, whereas, by contrast, even so\n"
            "Causing: as a result, consequently, which means that\n"
            "Exemplifying: for instance, to take one example, notably\n"
            "Conceding: admittedly, while it is true that"
        ),
        "teaching_note": (
            "Overusing 'Firstly / Secondly / In conclusion' reads as a template and caps "
            "Coherence around band 6. Vary the function, not just the word."
        ),
    },
]

TEMPLATE_CATEGORIES: tuple[str, ...] = (
    "task2_skeleton", "letter_opening_closing", "t1_overview_language", "cohesion_bank",
)


@router.get("/templates", summary="Frameworks and phrase library (05 §9)")
def list_templates(category: str | None = Query(default=None)) -> list[dict[str, str]]:
    if category:
        return [t for t in TEMPLATES if t["category"] == category]
    return list(TEMPLATES)


@router.get("/rubrics", summary="Paraphrased writing band descriptors")
def get_rubrics(task_type: str | None = Query(default=None)) -> dict[str, Any]:
    if task_type and task_type not in scoring.TASK_TYPES:
        raise ApiError(422, "validation_error", f"unknown task_type {task_type!r}")
    return rubric_payload("writing", task_type)


# --------------------------------------------------------------------------------------
# `/submissions` aliases — same handlers, hidden from the schema.
# --------------------------------------------------------------------------------------

def _install_submission_aliases() -> None:
    prefix = router.prefix
    for route in list(router.routes):
        path = getattr(route, "path", "")
        if not path.startswith(f"{prefix}/attempts"):
            continue
        relative = path[len(prefix):].replace("/attempts", "/submissions", 1)
        methods = sorted(set(getattr(route, "methods", set())) - {"HEAD", "OPTIONS"})
        if not methods:
            continue
        router.add_api_route(
            relative,
            route.endpoint,  # type: ignore[attr-defined]
            methods=methods,
            status_code=getattr(route, "status_code", None),
            include_in_schema=False,
            name=f"{getattr(route, 'name', 'route')}_submissions_alias",
        )


try:
    _install_submission_aliases()
except Exception:  # noqa: BLE001 — aliases are a convenience, never a boot blocker
    _log.exception("could not install the /submissions route aliases")
