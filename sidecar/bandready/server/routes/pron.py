"""Pronunciation routes — 18-api-contract.md §4.12, owner doc 09 §4.6/§5/§7.

**v1 only**: ``method='proxy-v1'`` everywhere. Session analysis is a §3 job
(``kind='pron_analyze'``) because it re-transcribes every turn WAV; read-aloud is a single
short recording and stays synchronous.

Every response carries ``accent_notice`` — 09 §0's fixed copy is a product requirement,
not decoration: IELTS accepts all accents and the UI must say so on every screen.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db.engine import get_session
from bandready.pron import analyze as pron
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.server.jobs import job_manager

_log = logging.getLogger("bandready.routes.pron")

router = APIRouter(prefix="/api/v1/pron", tags=["pron"])

MAX_UPLOAD_BYTES = 32 * 1024 * 1024


class AnalyzeBody(BaseModel):
    session_id: str


class DrillAttemptBody(BaseModel):
    correct: bool
    drill_type: str = "minimal_pair_ab"
    contrast: str | None = None
    response_ms: int | None = Field(default=None, ge=0, le=600000)


class DrillResultBody(BaseModel):
    drill_type: str = "minimal_pair_ab"
    item_id: str
    contrast: str | None = None
    correct: bool
    response_ms: int | None = Field(default=None, ge=0, le=600000)


# --------------------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------------------


def _assert_session(session: Session, session_id: str) -> str:
    row = session.execute(
        text(
            "SELECT ps.profile_id FROM speaking_sessions ss "
            "JOIN practice_sessions ps ON ps.id = ss.id WHERE ss.id = :sid"
        ),
        {"sid": session_id},
    ).first()
    if row is None:
        raise ApiError(404, "not_found", f"no speaking session {session_id}")
    return str(row[0])


def _analyze_job(session_id: str, profile_id: str) -> Any:
    async def run(job_id: str) -> dict[str, Any]:
        from bandready.db.engine import session_scope

        def progress(pct: float, detail: str) -> None:
            job_manager.set_progress(job_id, pct, detail)

        with session_scope() as session:
            return await pron.analyze_session(
                session, session_id, profile_id, progress=progress
            )

    return run


@router.post(
    "/analyze",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Analyze a speaking session's WAVs (202 job)",
)
def analyze(
    body: AnalyzeBody,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = _assert_session(session, body.session_id)
    job_id = job_manager.submit("pron_analyze", _analyze_job(body.session_id, profile_id))
    return {
        "job_id": job_id,
        "kind": "pron_analyze",
        "session_id": body.session_id,
        "method": pron.METHOD,
        "accent_notice": pron.ACCENT_NOTICE,
    }


@router.post(
    "/sessions/{session_id}/analyze",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Analyze a speaking session's WAVs (18 §4.12 path)",
)
def analyze_session_route(
    session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = _assert_session(session, session_id)
    job_id = job_manager.submit("pron_analyze", _analyze_job(session_id, profile_id))
    return {
        "job_id": job_id,
        "kind": "pron_analyze",
        "session_id": session_id,
        "method": pron.METHOD,
        "accent_notice": pron.ACCENT_NOTICE,
    }


@router.get("/sessions/{session_id}", summary="Per-turn results and session aggregates")
def get_session_results(
    session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _assert_session(session, session_id)
    return pron.session_results(session, session_id)


@router.get("/sessions/{session_id}/signals", summary="pron_signals_json for the evaluator")
def get_signals(
    session_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _assert_session(session, session_id)
    return pron.pron_signals(session, session_id)


@router.get("/scores", summary="Per-word scores (worst first) with per-word history")
def get_scores(
    session_id: str | None = Query(default=None),
    word: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    clauses = ["profile_id = :pid"]
    params: dict[str, Any] = {"pid": profile_id, "limit": limit}
    if session_id:
        clauses.append("session_id = :sid")
        params["sid"] = session_id
    if word:
        clauses.append("word = :word")
        params["word"] = word.strip().lower()
    if cursor:
        clauses.append("id < :cursor")
        params["cursor"] = cursor

    rows = session.execute(
        text(
            "SELECT id, source, session_id, turn_id, passage_id, word, word_index, score, "
            "expected_ipa, heard_approx, t_start_ms, t_end_ms, issues_json, method, created_at "
            "FROM pron_scores WHERE " + " AND ".join(clauses) + " ORDER BY id DESC LIMIT :limit"
        ),
        params,
    ).mappings().all()

    # The stored number is the recogniser's confidence, which is worth keeping — it ranks
    # which words are worth replaying. It is only wrong when published as a judgement, so it
    # travels under its own name and `score` stays null until a method exists that earns it.
    items = []
    for row in rows:
        entry = dict(row)
        stored = entry.pop("score", None)
        entry["confidence_score"] = stored
        entry["score"] = stored if pron.SCORE_IS_PRONUNCIATION else None
        items.append(entry)

    unsure = [
        {**row, "confidence_score": row.pop("score", None), "score": None}
        for row in pron.worst_words(session, profile_id, limit=8)
    ]

    return {
        "items": items,
        "next_cursor": items[-1]["id"] if len(items) == limit else None,
        # Renamed from worst_words. Ordering by ASR confidence and calling the result a
        # learner's worst pronunciation is the same defect as banding a single word, and it
        # lands harder here because this list is what a progress screen would render.
        "words_the_recogniser_was_unsure_of": unsure,
        "worst_words": unsure if pron.SCORE_IS_PRONUNCIATION else [],
        "method": pron.METHOD,
        "method_note": (
            "These are words the recogniser found hard to catch. They are worth listening to "
            "again. They are not a score, and a strong accent is not a mistake."
        ),
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# Read-aloud (sync)
# --------------------------------------------------------------------------------------


def _attempt_path() -> Path:
    root = pron.media_root() / "pron" / "attempts"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{ULID()}.wav"


@router.post("/read-aloud", summary="Analyze one read-aloud recording (synchronous)")
async def read_aloud(
    wav: UploadFile = File(...),
    passage_id: str | None = Form(default=None),
    reference_text: str | None = Form(default=None),
    source: str = Form(default="read_aloud"),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if source not in ("read_aloud", "shadowing", "minimal_pair"):
        raise ApiError(422, "validation_error", f"unsupported source {source!r}")
    payload = await wav.read()
    if not payload:
        raise ApiError(422, "validation_error", "the uploaded recording is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ApiError(422, "validation_error", "recording exceeds the 32 MB upload limit")

    profile_id = current_profile_id(session)
    target = _attempt_path()
    target.write_bytes(payload)
    # 11 §9 rule 1: this is user voice data — it is NOT registered in media_files and is
    # therefore never reachable by the LRU cache sweep.
    rel = target.relative_to(pron.media_root()).as_posix()

    result = await pron.analyze_wav(target, reference_text=reference_text)
    result.audio_path = rel
    pron.persist_standalone(session, profile_id, result, source, passage_id, rel)

    scored = [w.score for w in result.words if w.score is not None]
    unsure = sorted(
        (w for w in result.words if w.score is not None and w.score < pron.BAND_AMBER),
        key=lambda w: w.score or 0,
    )

    # Did speech-to-text actually run on this recording?
    #
    # When it cannot (no local Whisper model on a fresh install, no STT provider, an
    # undecodable upload), ``analyze_wav`` falls back to the caller's text. On a speaking
    # turn that text is what the learner really said, so the fallback is sound. Here it is
    # the sentence they were *asked* to say — so publishing it unmarked told a learner who
    # recorded silence "what was heard: <their sentence>" and no words to work on, which is
    # praise for something that never happened. The transcript is withheld instead, and the
    # note says what to do about it.
    recognised = result.transcript_source == "recogniser"
    checked = result.read_aloud

    # What the learner is actually shown. When a reference text came in and speech-to-text
    # ran, the read-aloud method has real findings — words that did not survive the
    # recogniser, each with the sounds that changed — and those replace the "words the
    # recogniser was unsure of" list, which was only ever a stand-in for this.
    sounds_note = (
        "Each word below was heard as something else. The sounds listed are the ones that "
        "changed. Your accent is not being marked — only whether the word came through."
        if checked and checked.flagged
        else "Every word came through clearly."
        if checked
        else None
    )

    return {
        **result.as_wire(),
        "recognised": recognised,
        "transcript": result.transcript if recognised else "",
        # Present only on the reference-text path; null elsewhere, so the free-speech
        # payload keeps exactly the shape it had.
        "checked_against_reference": bool(checked),
        "intelligibility": checked.intelligibility if checked else None,
        "word_error_rate": checked.word_error_rate if checked else None,
        "phone_error_rate": checked.phone_error_rate if checked else None,
        "coverage": checked.coverage if checked else None,
        "words_to_work_on": [w.as_wire() for w in checked.flagged][:8] if checked else None,
        "sounds_note": sounds_note,
        "audio_path": rel,
        "media_url": f"/api/v1/media/pron/attempts/{target.name}",
        "passage_id": passage_id,
        # An average of recogniser confidences is not an overall pronunciation score, so
        # proxy-v1 returns none. `mean_confidence` is the same number under its real name,
        # for anybody debugging the recogniser rather than the learner.
        "overall": round(sum(scored) / len(scored)) if scored and pron.SCORE_IS_PRONUNCIATION else None,
        "mean_confidence": round(sum(scored) / len(scored)) if scored else None,
        # Renamed from words_to_work_on, which claimed more than the method can support.
        # These are words the recogniser hesitated on: worth replaying and listening to
        # together, not words the learner has been judged to have said badly.
        "words_the_recogniser_was_unsure_of": [w.as_wire() for w in unsure][:5],
        "method_note": (
            "This compares what you said against the words on the page. A word is listed "
            "only when it came out as a different word — the check ignores accent "
            "differences, so sounding British, Indian or Australian costs you nothing. It "
            "can miss things: anything listed here is real, but subtle slips may not show."
            if checked
            else "This check listens for words the recogniser found hard to catch. It does "
            "not score your pronunciation, and a strong accent is not a mistake."
            if recognised
            else "Your recording was saved, but this computer could not turn it into text, "
            "so there is nothing to check yet. Turn on speech-to-text in Settings and "
            "record again."
        ),
        "accent_notice": pron.ACCENT_NOTICE,
    }


# --------------------------------------------------------------------------------------
# Drills (09 §5.3/§5.4) — perception only in v1, no scoring model needed
# --------------------------------------------------------------------------------------


@router.get("/drills", summary="Minimal-pair / word-stress drill items")
def get_drills(
    type: str = Query(default="minimal_pair_ab", alias="type"),
    contrast: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if type not in pron.DRILL_TYPES:
        raise ApiError(422, "validation_error", f"drill type must be one of {pron.DRILL_TYPES}")
    profile_id = current_profile_id(session)
    items = pron.drill_items(type, contrast, limit)
    return {
        "drill_type": type,
        "contrast": contrast,
        "items": items,
        "contrasts": pron.contrasts(),
        "accuracy": pron.contrast_accuracy(session, profile_id),
        "accent_notice": pron.ACCENT_NOTICE,
        "empty_reason": None if items else "no_items_for_contrast",
    }


@router.post(
    "/drills/{item_id}/attempt",
    status_code=status.HTTP_201_CREATED,
    summary="Record one perception-drill response",
)
def drill_attempt(
    item_id: str,
    body: DrillAttemptBody,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    item = pron.find_drill_item(item_id)
    if item is None:
        raise ApiError(404, "not_found", f"no drill item {item_id}")
    drill_type = str(item.get("drill_type") or body.drill_type)
    if drill_type not in pron.DRILL_TYPES:
        raise ApiError(422, "validation_error", f"drill type must be one of {pron.DRILL_TYPES}")
    profile_id = current_profile_id(session)
    recorded = pron.record_drill_attempt(
        session,
        profile_id,
        drill_type,
        item_id,
        body.correct,
        contrast=body.contrast or item.get("contrast"),
        response_ms=body.response_ms,
    )
    return {**recorded, "accuracy": pron.contrast_accuracy(session, profile_id)}


@router.post(
    "/drills/results",
    status_code=status.HTTP_201_CREATED,
    summary="Record one perception-drill response (18 §4.12 path)",
)
def drill_results(
    body: DrillResultBody,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if body.drill_type not in pron.DRILL_TYPES:
        raise ApiError(422, "validation_error", f"drill type must be one of {pron.DRILL_TYPES}")
    profile_id = current_profile_id(session)
    item = pron.find_drill_item(body.item_id)
    recorded = pron.record_drill_attempt(
        session,
        profile_id,
        body.drill_type,
        body.item_id,
        body.correct,
        contrast=body.contrast or (item or {}).get("contrast"),
        response_ms=body.response_ms,
    )
    return {**recorded, "accuracy": pron.contrast_accuracy(session, profile_id)}


@router.get("/contrasts", summary="Per-contrast accuracy over time")
def get_contrasts(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    return {
        "contrasts": pron.contrasts(),
        "accuracy": pron.contrast_accuracy(session, profile_id),
        "accent_notice": pron.ACCENT_NOTICE,
    }


__all__ = ["router"]
