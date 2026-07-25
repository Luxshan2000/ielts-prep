"""Onboarding + placement sampler — 18-api-contract.md §4.13, owner doc 10 §2/§3.

A fixed-then-adaptive ~30-minute sampler. **Every section is individually skippable**
(R2-14) and a skipped section falls back to the self-assessed band for that skill with
``confidence: "low"``.

The in-progress sitting lives on a ``practice_sessions`` row with ``module='placement'``
(``summary_json`` holds the step plan, the answers and the pivot decision), so a crash or
an app restart resumes it instead of losing the sitting.

Flow:
    POST /placement/start     → profile is written, steps are planned, first step returned
    GET  /placement/next      → the current step, rendered from the content bank
    POST /placement/answer    → score/record one step, adaptive pivot, advance
    POST /placement/complete  → per-skill starting estimates + a generated study plan
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.curriculum.estimate import (
    SELF_LEVEL_BAND,
    SKILLS,
    SkillEstimate,
    iso,
    normalize_criteria,
    round_ielts,
    store_estimates,
    utcnow,
)
from bandready.curriculum.plan import WEEKDAYS, generate_plan
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.routes.placement")

router = APIRouter(prefix="/api/v1/placement", tags=["placement"])

# 10 §3 — objective → band conversion for the 8-question samplers.
OBJECTIVE_BAND: dict[int, float] = {
    0: 3.5, 1: 3.5, 2: 4.5, 3: 5.0, 4: 5.5, 5: 6.0, 6: 6.5, 7: 7.0, 8: 7.5,
}
SAMPLER_QUESTIONS = 8
SAMPLER_HALF = 4

SECTION_ORDER: tuple[str, ...] = ("reading", "listening", "writing", "speaking")
SECTION_MINUTES: dict[str, int] = {"reading": 8, "listening": 6, "writing": 10, "speaking": 6}

# The single rule-based pivot (10 §3): the doc's "≥ 7/8 on the first 4" is read as
# ≥ 75 % of the first half (3 of 4) → harder set; ≤ 25 % (1 of 4) → easier set.
PIVOT_UP_RATIO = 0.75
PIVOT_DOWN_RATIO = 0.25


# --------------------------------------------------------------------------------------
# Shared answer normalisation (falls back until bandready.scoring lands)
# --------------------------------------------------------------------------------------

try:  # pragma: no cover — bandready.scoring is owned by the reading/listening module
    from bandready.scoring.answers import answers_match, normalize_answer  # type: ignore
except Exception:  # noqa: BLE001
    _PUNCT = re.compile(r"[^\w\s'-]")
    _SPACE = re.compile(r"\s+")

    def normalize_answer(value: Any) -> str:
        raw = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
        raw = raw.replace("’", "'").lower().strip()
        raw = _PUNCT.sub(" ", raw)
        return _SPACE.sub(" ", raw).strip()

    def answers_match(given: Any, keyed: Any) -> bool:
        want = normalize_answer(given)
        if not want:
            return False
        for variant in _flatten_variants(keyed):
            if want == normalize_answer(variant):
                return True
        return False


def _flatten_variants(keyed: Any) -> list[Any]:
    """``answers`` ships as [{"value": …}] (reading) or [[…]] (listening)."""
    out: list[Any] = []
    if keyed is None:
        return out
    if isinstance(keyed, str):
        return [keyed]
    if isinstance(keyed, dict):
        return [keyed.get("value", keyed.get("answer"))]
    if isinstance(keyed, list):
        for item in keyed:
            out.extend(_flatten_variants(item))
    return [o for o in out if o is not None]


# --------------------------------------------------------------------------------------
# Bodies
# --------------------------------------------------------------------------------------


class StartBody(BaseModel):
    target_band: float = Field(default=6.5, ge=4.0, le=9.0)
    exam_date: str | None = None
    exam_format: str = "academic"
    self_level: str = "intermediate"
    daily_minutes: int = 60
    study_days: list[str] = Field(default_factory=lambda: list(WEEKDAYS[:6]))
    sections: list[str] | None = None

    @field_validator("exam_format")
    @classmethod
    def _format(cls, v: str) -> str:
        if v not in ("academic", "general_training"):
            raise ValueError("exam_format must be academic | general_training")
        return v

    @field_validator("self_level")
    @classmethod
    def _level(cls, v: str) -> str:
        if v not in SELF_LEVEL_BAND:
            raise ValueError(f"self_level must be one of {sorted(SELF_LEVEL_BAND)}")
        return v

    @field_validator("daily_minutes")
    @classmethod
    def _minutes(cls, v: int) -> int:
        if v not in (30, 60, 90):
            raise ValueError("daily_minutes must be 30, 60 or 90")
        return v

    @field_validator("study_days")
    @classmethod
    def _days(cls, v: list[str]) -> list[str]:
        days = [d for d in v if d in WEEKDAYS]
        if len(days) < 3:
            raise ValueError("select at least 3 study days")
        return days

    @field_validator("target_band")
    @classmethod
    def _half_steps(cls, v: float) -> float:
        return round(v * 2) / 2

    @field_validator("exam_date")
    @classmethod
    def _exam_date(cls, v: str | None) -> str | None:
        if not v:
            return None
        try:
            return date.fromisoformat(v[:10]).isoformat()
        except ValueError as exc:
            raise ValueError("exam_date must be an ISO date or null") from exc


class AnswerBody(BaseModel):
    placement_id: str | None = None
    step: str | None = None
    answers: dict[str, Any] | None = None
    essay_text: str | None = None
    transcript: str | None = None
    turns: list[dict[str, Any]] | None = None
    skip: bool = False
    seconds_elapsed: int | None = Field(default=None, ge=0, le=7200)


class CompleteBody(BaseModel):
    placement_id: str | None = None
    generate_plan: bool = True
    seed: int | None = None


class SkipAllBody(BaseModel):
    self_level: str | None = None


# --------------------------------------------------------------------------------------
# Profile writes
# --------------------------------------------------------------------------------------


def _write_profile(session: Session, profile_id: str, body: StartBody) -> None:
    session.execute(
        text(
            "UPDATE profiles SET exam_format = :fmt, target_band = :target, exam_date = :exam, "
            "self_level = :level, daily_minutes = :minutes, study_days_json = :days, "
            "onboarded_at = COALESCE(onboarded_at, :now) WHERE id = :pid"
        ),
        {
            "fmt": body.exam_format,
            "target": body.target_band,
            "exam": body.exam_date,
            "level": body.self_level,
            "minutes": body.daily_minutes,
            "days": json.dumps(body.study_days),
            "now": iso(utcnow()),
            "pid": profile_id,
        },
    )


def _profile_row(session: Session, profile_id: str) -> dict[str, Any]:
    row = session.execute(
        text(
            "SELECT exam_format, target_band, self_level, daily_minutes, exam_date, "
            "study_days_json, placement_completed_at FROM profiles WHERE id = :pid"
        ),
        {"pid": profile_id},
    ).mappings().first()
    return dict(row) if row else {}


# --------------------------------------------------------------------------------------
# Step planning
# --------------------------------------------------------------------------------------


def _pick_reading_pair(session: Session, exam_format: str) -> tuple[str | None, str | None]:
    """A same-family easy/hard passage pair (10 §3 adaptive pivot); best effort."""
    rows = session.execute(
        text(
            "SELECT id, topic_id, band_target FROM reading_passages "
            "WHERE retired = 0 AND format = :fmt ORDER BY band_target IS NULL, band_target"
        ),
        {"fmt": exam_format},
    ).mappings().all()
    if not rows:
        return None, None
    by_topic: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_topic.setdefault(str(row["topic_id"] or ""), []).append(dict(row))
    for topic, group in by_topic.items():
        if topic and len(group) >= 2:
            group.sort(key=lambda r: r["band_target"] or 0)
            return str(group[0]["id"]), str(group[-1]["id"])
    easy = str(rows[0]["id"])
    hard = str(rows[-1]["id"]) if len(rows) > 1 else easy
    return easy, hard


def _pick_listening_script(session: Session, self_level: str) -> str | None:
    part = 3 if self_level in ("upper", "advanced") else 2
    for wanted in (part, 2, 1, 4):
        row = session.execute(
            text(
                "SELECT id FROM listening_scripts WHERE retired = 0 AND part = :p "
                "ORDER BY target_band LIMIT 1"
            ),
            {"p": wanted},
        ).first()
        if row:
            return str(row[0])
    return None


def _pick_writing_prompt(session: Session, exam_format: str) -> str | None:
    task = "ac_task1" if exam_format == "academic" else "gt_task1"
    for wanted in (task, "task2"):
        row = session.execute(
            text(
                "SELECT id FROM writing_prompts WHERE retired = 0 AND task_type = :t "
                "ORDER BY difficulty LIMIT 1"
            ),
            {"t": wanted},
        ).first()
        if row:
            return str(row[0])
    return None


def _pick_speaking_card(session: Session) -> str | None:
    row = session.execute(
        text(
            "SELECT id FROM speaking_cards WHERE retired = 0 AND part = 1 "
            "ORDER BY difficulty, last_served_at IS NOT NULL, last_served_at LIMIT 1"
        )
    ).first()
    return str(row[0]) if row else None


def _question_ids(session: Session, table: str, parent_column: str, parent_id: str) -> list[str]:
    rows = session.execute(
        text(
            f"SELECT id FROM {table} WHERE {parent_column} = :pid ORDER BY number "
            f"LIMIT {SAMPLER_QUESTIONS}"
        ),
        {"pid": parent_id},
    ).all()
    return [str(r[0]) for r in rows]


def _plan_steps(session: Session, profile: dict[str, Any], sections: list[str]) -> list[dict[str, Any]]:
    exam_format = str(profile.get("exam_format") or "academic")
    self_level = str(profile.get("self_level") or "intermediate")
    steps: list[dict[str, Any]] = []

    if "reading" in sections:
        easy, hard = _pick_reading_pair(session, exam_format)
        questions = _question_ids(session, "reading_questions", "passage_id", easy) if easy else []
        steps.append(
            {
                "id": "reading_1",
                "skill": "reading",
                "half": 1,
                "passage_id": easy,
                "alt_passage_id": hard,
                "question_ids": questions[:SAMPLER_HALF],
                "minutes": SECTION_MINUTES["reading"] // 2,
                "unavailable": not questions,
            }
        )
        steps.append(
            {
                "id": "reading_2",
                "skill": "reading",
                "half": 2,
                "passage_id": easy,
                "alt_passage_id": hard,
                "question_ids": questions[SAMPLER_HALF:SAMPLER_QUESTIONS],
                "minutes": SECTION_MINUTES["reading"] - SECTION_MINUTES["reading"] // 2,
                "unavailable": len(questions) <= SAMPLER_HALF,
            }
        )
    if "listening" in sections:
        script = _pick_listening_script(session, self_level)
        questions = _question_ids(session, "listening_questions", "script_id", script) if script else []
        steps.append(
            {
                "id": "listening",
                "skill": "listening",
                "script_id": script,
                "question_ids": questions,
                "minutes": SECTION_MINUTES["listening"],
                "unavailable": not questions,
            }
        )
    if "writing" in sections:
        prompt = _pick_writing_prompt(session, exam_format)
        steps.append(
            {
                "id": "writing",
                "skill": "writing",
                "prompt_id": prompt,
                "minutes": SECTION_MINUTES["writing"],
                "word_target": [100, 150],
                "unavailable": prompt is None,
            }
        )
    if "speaking" in sections:
        card = _pick_speaking_card(session)
        steps.append(
            {
                "id": "speaking",
                "skill": "speaking",
                "card_id": card,
                "minutes": SECTION_MINUTES["speaking"],
                "skippable": True,
                "unavailable": card is None,
            }
        )
    return steps


# --------------------------------------------------------------------------------------
# Sitting state
# --------------------------------------------------------------------------------------


def _load_state(session: Session, placement_id: str, profile_id: str) -> dict[str, Any]:
    row = session.execute(
        text(
            "SELECT summary_json, profile_id FROM practice_sessions "
            "WHERE id = :id AND module = 'placement'"
        ),
        {"id": placement_id},
    ).mappings().first()
    if row is None:
        raise ApiError(404, "not_found", f"no placement sitting {placement_id}")
    if str(row["profile_id"]) != profile_id:
        raise ApiError(404, "not_found", f"no placement sitting {placement_id}")
    try:
        state = json.loads(row["summary_json"] or "{}")
    except ValueError:
        state = {}
    if not isinstance(state, dict):
        state = {}
    state["placement_id"] = placement_id
    return state


def _save_state(session: Session, placement_id: str, state: dict[str, Any]) -> None:
    session.execute(
        text("UPDATE practice_sessions SET summary_json = :s WHERE id = :id"),
        {"s": json.dumps(state, ensure_ascii=False), "id": placement_id},
    )


def _active_placement(session: Session, profile_id: str) -> str | None:
    row = session.execute(
        text(
            "SELECT id FROM practice_sessions WHERE profile_id = :pid AND module = 'placement' "
            "AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
        ),
        {"pid": profile_id},
    ).first()
    return str(row[0]) if row else None


def _resolve_id(session: Session, profile_id: str, placement_id: str | None) -> str:
    resolved = placement_id or _active_placement(session, profile_id)
    if resolved is None:
        raise ApiError(
            409,
            "conflict",
            "no placement sitting is in progress — POST /api/v1/placement/start first",
        )
    return resolved


# --------------------------------------------------------------------------------------
# Rendering a step
# --------------------------------------------------------------------------------------


def _render_reading(session: Session, step: dict[str, Any]) -> dict[str, Any]:
    passage_id = step.get("passage_id")
    if not passage_id or not step.get("question_ids"):
        return {"unavailable": True, "reason": "no_reading_content"}
    row = session.execute(
        text("SELECT title, passage_json, band_target FROM reading_passages WHERE id = :id"),
        {"id": passage_id},
    ).mappings().first()
    if row is None:
        return {"unavailable": True, "reason": "passage_missing"}
    questions = session.execute(
        text(
            "SELECT id, number, qtype, word_limit FROM reading_questions WHERE id IN "
            "(" + ",".join(f":q{i}" for i in range(len(step["question_ids"]))) + ") ORDER BY number"
        ),
        {f"q{i}": qid for i, qid in enumerate(step["question_ids"])},
    ).mappings().all()
    document = _loads(row["passage_json"]) or {}
    return {
        "passage_id": passage_id,
        "title": row["title"],
        "band_target": row["band_target"],
        "passage": document,
        "questions": [dict(q) for q in questions],
    }


def _render_listening(session: Session, step: dict[str, Any]) -> dict[str, Any]:
    script_id = step.get("script_id")
    if not script_id or not step.get("question_ids"):
        return {"unavailable": True, "reason": "no_listening_content"}
    row = session.execute(
        text(
            "SELECT title, part, script_json, audio_hash, target_band FROM listening_scripts "
            "WHERE id = :id"
        ),
        {"id": script_id},
    ).mappings().first()
    if row is None:
        return {"unavailable": True, "reason": "script_missing"}
    questions = session.execute(
        text(
            "SELECT id, number, qtype, word_limit FROM listening_questions WHERE id IN "
            "(" + ",".join(f":q{i}" for i in range(len(step["question_ids"]))) + ") ORDER BY number"
        ),
        {f"q{i}": qid for i, qid in enumerate(step["question_ids"])},
    ).mappings().all()
    return {
        "script_id": script_id,
        "title": row["title"],
        "part": row["part"],
        "target_band": row["target_band"],
        "audio_path": (
            f"/api/v1/media/listening/{row['audio_hash']}.wav" if row["audio_hash"] else None
        ),
        "script": _loads(row["script_json"]) or {},
        "questions": [dict(q) for q in questions],
    }


def _render_writing(session: Session, step: dict[str, Any]) -> dict[str, Any]:
    prompt_id = step.get("prompt_id")
    if not prompt_id:
        return {"unavailable": True, "reason": "no_writing_content"}
    row = session.execute(
        text(
            "SELECT task_type, genre, prompt_text, chart_spec, letter_bullets "
            "FROM writing_prompts WHERE id = :id"
        ),
        {"id": prompt_id},
    ).mappings().first()
    if row is None:
        return {"unavailable": True, "reason": "prompt_missing"}
    return {
        "prompt_id": prompt_id,
        "task_type": row["task_type"],
        "genre": row["genre"],
        "prompt_text": row["prompt_text"],
        "chart_spec": _loads(row["chart_spec"]),
        "letter_bullets": _loads(row["letter_bullets"]),
        "word_target": step.get("word_target", [100, 150]),
    }


def _render_speaking(session: Session, step: dict[str, Any]) -> dict[str, Any]:
    card_id = step.get("card_id")
    if not card_id:
        return {"unavailable": True, "reason": "no_speaking_content"}
    row = session.execute(
        text("SELECT title, payload_json FROM speaking_cards WHERE id = :id"),
        {"id": card_id},
    ).mappings().first()
    if row is None:
        return {"unavailable": True, "reason": "card_missing"}
    payload = _loads(row["payload_json"]) or {}
    questions = payload.get("questions") or payload.get("frames") or []
    return {
        "card_id": card_id,
        "title": row["title"],
        "questions": questions[:4],
        "payload": payload,
        "skippable": True,
        "skip_hint": "No mic handy? Skip for now — we'll use your self-rating for Speaking.",
    }


RENDERERS = {
    "reading": _render_reading,
    "listening": _render_listening,
    "writing": _render_writing,
    "speaking": _render_speaking,
}


def _render_step(session: Session, step: dict[str, Any]) -> dict[str, Any]:
    body = RENDERERS[step["skill"]](session, step)
    return {
        "step": step["id"],
        "skill": step["skill"],
        "minutes": step.get("minutes"),
        "half": step.get("half"),
        "skippable": True,
        "content": body,
        "unavailable": bool(body.get("unavailable")) or bool(step.get("unavailable")),
    }


def _progress(state: dict[str, Any]) -> dict[str, Any]:
    steps = state.get("steps") or []
    cursor = int(state.get("cursor") or 0)
    return {
        "placement_id": state.get("placement_id"),
        "step_index": min(cursor, len(steps)),
        "step_count": len(steps),
        "done": cursor >= len(steps),
        "sections": state.get("sections") or [],
        "skipped": sorted(set(state.get("skipped") or [])),
    }


def _advance(session: Session, state: dict[str, Any]) -> dict[str, Any] | None:
    """Skip past unavailable steps so an empty content bank cannot deadlock a sitting."""
    steps = state.get("steps") or []
    while int(state.get("cursor") or 0) < len(steps):
        step = steps[int(state["cursor"])]
        rendered = _render_step(session, step)
        if not rendered["unavailable"]:
            return rendered
        state.setdefault("skipped", []).append(step["skill"])
        state.setdefault("unavailable", []).append(step["id"])
        state["cursor"] = int(state["cursor"]) + 1
    return None


# --------------------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------------------


@router.post("/start", summary="Write the onboarding profile and open a placement sitting")
def placement_start(
    body: StartBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or StartBody()
    profile_id = current_profile_id(session)
    _write_profile(session, profile_id, body)
    profile = _profile_row(session, profile_id)

    sections = [s for s in (body.sections or list(SECTION_ORDER)) if s in SECTION_ORDER]
    if not sections:
        raise ApiError(422, "validation_error", "at least one placement section is required")

    # Abandon any half-finished sitting — one placement at a time.
    session.execute(
        text(
            "UPDATE practice_sessions SET ended_at = :now WHERE profile_id = :pid "
            "AND module = 'placement' AND ended_at IS NULL"
        ),
        {"now": iso(utcnow()), "pid": profile_id},
    )

    placement_id = f"pl_{ULID()}"
    steps = _plan_steps(session, profile, sections)
    state: dict[str, Any] = {
        "placement_id": placement_id,
        "sections": sections,
        "steps": steps,
        "cursor": 0,
        "answers": {},
        "results": {},
        "skipped": [],
        "self_level": profile.get("self_level") or body.self_level,
        "started_at": iso(utcnow()),
    }
    session.execute(
        text(
            "INSERT INTO practice_sessions (id, profile_id, module, activity, summary_json) "
            "VALUES (:id, :pid, 'placement', 'placement_sampler', :s)"
        ),
        {"id": placement_id, "pid": profile_id, "s": json.dumps(state, ensure_ascii=False)},
    )

    next_step = _advance(session, state)
    _save_state(session, placement_id, state)
    return {
        "placement_id": placement_id,
        "profile": {
            "target_band": body.target_band,
            "exam_date": body.exam_date,
            "exam_format": body.exam_format,
            "self_level": body.self_level,
            "daily_minutes": body.daily_minutes,
            "study_days": body.study_days,
        },
        "estimated_minutes": sum(SECTION_MINUTES[s] for s in sections),
        "progress": _progress(state),
        "next": next_step,
    }


@router.get("/next", summary="The next adaptive sampler item")
def placement_next(
    placement_id: str | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    resolved = _resolve_id(session, profile_id, placement_id)
    state = _load_state(session, resolved, profile_id)
    next_step = _advance(session, state)
    _save_state(session, resolved, state)
    return {"progress": _progress(state), "next": next_step}


@router.post("/answer", summary="Record one sampler step and advance")
def placement_answer(
    body: AnswerBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or AnswerBody()
    profile_id = current_profile_id(session)
    resolved = _resolve_id(session, profile_id, body.placement_id)
    state = _load_state(session, resolved, profile_id)
    steps = state.get("steps") or []
    cursor = int(state.get("cursor") or 0)
    if cursor >= len(steps):
        raise ApiError(409, "conflict", "this placement sitting has no steps left")

    step = steps[cursor]
    if body.step and body.step != step["id"]:
        raise ApiError(
            409, "conflict", f"expected an answer for step {step['id']!r}, got {body.step!r}"
        )

    if body.skip:
        state.setdefault("skipped", []).append(step["skill"])
        _skip_related_steps(state, step)
    else:
        _record_step(session, state, step, body)

    state["cursor"] = int(state["cursor"]) + 1
    next_step = _advance(session, state)
    _save_state(session, resolved, state)
    return {
        "progress": _progress(state),
        "recorded": step["id"],
        "skipped": bool(body.skip),
        "next": next_step,
    }


def _skip_related_steps(state: dict[str, Any], step: dict[str, Any]) -> None:
    """Skipping the first half of Reading skips its second half too."""
    if step["skill"] != "reading":
        return
    for other in state.get("steps") or []:
        if other["skill"] == "reading" and other["id"] != step["id"]:
            other["unavailable"] = True


def _record_step(
    session: Session, state: dict[str, Any], step: dict[str, Any], body: AnswerBody
) -> None:
    answers = state.setdefault("answers", {})
    if step["skill"] in ("reading", "listening"):
        graded = _grade_objective(session, step, body.answers or {})
        answers[step["id"]] = graded
        if step["id"] == "reading_1":
            _apply_pivot(session, state, graded)
        return
    if step["skill"] == "writing":
        answers[step["id"]] = {
            "essay_text": (body.essay_text or "").strip(),
            "prompt_id": step.get("prompt_id"),
            "seconds_elapsed": body.seconds_elapsed,
            "word_count": len((body.essay_text or "").split()),
        }
        return
    transcript = body.transcript or " ".join(
        str(t.get("text") or "") for t in (body.turns or [])
    )
    answers[step["id"]] = {
        "transcript": transcript.strip(),
        "card_id": step.get("card_id"),
        "turns": body.turns or [],
    }


def _grade_objective(
    session: Session, step: dict[str, Any], given: dict[str, Any]
) -> dict[str, Any]:
    table = "reading_questions" if step["skill"] == "reading" else "listening_questions"
    ids = step.get("question_ids") or []
    if not ids:
        return {"correct": 0, "of": 0, "per_question": []}
    rows = session.execute(
        text(
            f"SELECT id, number, answers_json FROM {table} WHERE id IN "
            "(" + ",".join(f":q{i}" for i in range(len(ids))) + ")"
        ),
        {f"q{i}": qid for i, qid in enumerate(ids)},
    ).mappings().all()

    per_question: list[dict[str, Any]] = []
    correct = 0
    for row in rows:
        keyed = _loads(row["answers_json"])
        response = given.get(str(row["id"]), given.get(str(row["number"])))
        ok = answers_match(response, keyed)
        correct += 1 if ok else 0
        per_question.append(
            {
                "question_id": row["id"],
                "number": row["number"],
                "given": response,
                "correct": bool(ok),
            }
        )
    per_question.sort(key=lambda q: q["number"])
    return {"correct": correct, "of": len(rows), "per_question": per_question}


def _apply_pivot(session: Session, state: dict[str, Any], graded: dict[str, Any]) -> None:
    """The single rule-based difficulty pivot for Reading (10 §3)."""
    of = int(graded.get("of") or 0)
    if of <= 0:
        return
    ratio = int(graded.get("correct") or 0) / of
    direction = "up" if ratio >= PIVOT_UP_RATIO else "down" if ratio <= PIVOT_DOWN_RATIO else None
    state["pivot"] = direction
    if direction != "up":
        return
    for step in state.get("steps") or []:
        if step.get("id") != "reading_2":
            continue
        alt = step.get("alt_passage_id")
        if not alt or alt == step.get("passage_id"):
            return
        questions = _question_ids(session, "reading_questions", "passage_id", alt)
        if len(questions) <= SAMPLER_HALF:
            return
        step["passage_id"] = alt
        step["question_ids"] = questions[SAMPLER_HALF:SAMPLER_QUESTIONS]
        step["pivoted"] = "up"
        step["unavailable"] = False


# --------------------------------------------------------------------------------------
# Completion
# --------------------------------------------------------------------------------------


async def _score_productive(skill: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    """One LLM rubric call for the writing / speaking sampler."""
    from bandready.providers.llm import chat_json

    text_body = payload.get("essay_text") if skill == "writing" else payload.get("transcript")
    if not (text_body or "").strip():
        return None
    criteria_names = (
        "Task Achievement, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy"
        if skill == "writing"
        else "Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation"
    )
    keys = "TA, CC, LR, GRA" if skill == "writing" else "FC, LR, GRA, P"
    prompt = (
        f"Score this IELTS {skill} placement sample against the public band descriptors for "
        f"{criteria_names}. It is a short placement sample, so band generously within the "
        "descriptors rather than penalising length.\n\n"
        f"SAMPLE:\n{str(text_body)[:6000]}\n\n"
        f'Return JSON only: {{"criteria": {{"{keys.split(", ")[0]}": 6.0, ...}}}} using the '
        f"keys {keys} with half-band values between 3.0 and 9.0."
    )
    try:
        response = await chat_json(
            [
                {"role": "system", "content": "You are an experienced IELTS examiner. JSON only."},
                {"role": "user", "content": prompt},
            ],
            mock_kind="writing_eval" if skill == "writing" else "speaking_eval",
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 — a provider outage must not lose the sitting
        _log.warning("placement %s scoring failed: %s", skill, exc)
        return None

    criteria = normalize_criteria(response.get("criteria") or response)
    if not criteria:
        return None
    # R2-4: the server always recomputes the overall band from the criterion bands.
    band = round_ielts(sum(criteria.values()) / len(criteria))
    return {"band": band, "criteria": criteria}


@router.post("/complete", summary="Finish placement: starting estimates + a study plan")
async def placement_complete(
    body: CompleteBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or CompleteBody()
    profile_id = current_profile_id(session)
    resolved = _resolve_id(session, profile_id, body.placement_id)
    state = _load_state(session, resolved, profile_id)
    profile = _profile_row(session, profile_id)
    self_level = str(state.get("self_level") or profile.get("self_level") or "intermediate")
    fallback = SELF_LEVEL_BAND.get(self_level, 5.5)

    answers = state.get("answers") or {}
    skipped = set(state.get("skipped") or [])
    estimates: dict[str, Any] = {}

    reading = _merge_objective(answers.get("reading_1"), answers.get("reading_2"))
    if reading and reading["of"] > 0:
        estimates["reading"] = {
            "band": _objective_band(reading["correct"], reading["of"]),
            "evidence": {
                "correct": reading["correct"],
                "of": reading["of"],
                "pivoted": state.get("pivot"),
            },
        }
    listening = answers.get("listening")
    if listening and int(listening.get("of") or 0) > 0:
        estimates["listening"] = {
            "band": _objective_band(int(listening["correct"]), int(listening["of"])),
            "evidence": {"correct": listening["correct"], "of": listening["of"]},
        }
    for skill in ("writing", "speaking"):
        payload = answers.get(skill)
        if not payload:
            continue
        scored = await _score_productive(skill, payload)
        if scored is None:
            continue
        estimates[skill] = {
            "band": scored["band"],
            "evidence": {"criteria": scored["criteria"]},
        }

    for skill in SKILLS:
        if skill in estimates:
            continue
        estimates[skill] = {
            "band": fallback,
            "skipped": True,
            "evidence": {"self_level": self_level, "reason": "section_skipped"},
        }
        skipped.add(skill)

    measured = [s for s in SKILLS if not estimates[s].get("skipped")]
    confidence = "medium" if len(measured) >= 2 else "low"
    result_id = f"pe_{ULID()}"
    taken_at = iso(utcnow())
    document = {
        "taken_at": taken_at,
        "estimates": estimates,
        "confidence": confidence,
        "sections_skipped": sorted(skipped),
        "self_level": self_level,
    }
    session.execute(
        text(
            "INSERT INTO placement_results (id, profile_id, taken_at, estimates_json) "
            "VALUES (:id, :pid, :at, :doc)"
        ),
        {"id": result_id, "pid": profile_id, "at": taken_at, "doc": json.dumps(document)},
    )
    session.execute(
        text(
            "UPDATE profiles SET placement_completed_at = :at, "
            "onboarded_at = COALESCE(onboarded_at, :at) WHERE id = :pid"
        ),
        {"at": taken_at, "pid": profile_id},
    )
    session.execute(
        text(
            "UPDATE practice_sessions SET ended_at = :at, summary_json = :s WHERE id = :id"
        ),
        {
            "at": taken_at,
            "s": json.dumps({**state, "completed": True, "result_id": result_id}),
            "id": resolved,
        },
    )
    _seed_estimates(session, profile_id, estimates, confidence, taken_at)

    plan = None
    if body.generate_plan:
        plan = generate_plan(session, profile_id, seed=body.seed)
    return {
        "placement_id": resolved,
        "result_id": result_id,
        "estimates": estimates,
        "confidence": confidence,
        "sections_skipped": sorted(skipped),
        "plan": plan,
        "disclaimer": "Estimated band — not a guarantee",
    }


@router.post("/submit", summary="Submit every section at once (18 §4.13 alias)")
async def placement_submit(
    body: CompleteBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return await placement_complete(body=body, session=session)


@router.post("/skip", summary="Skip placement entirely — self-rated starting estimates")
def placement_skip(
    body: SkipAllBody | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    body = body or SkipAllBody()
    profile_id = current_profile_id(session)
    profile = _profile_row(session, profile_id)
    self_level = str(body.self_level or profile.get("self_level") or "intermediate")
    band = SELF_LEVEL_BAND.get(self_level, 5.5)
    taken_at = iso(utcnow())

    estimates = {
        skill: {
            "band": band,
            "skipped": True,
            "evidence": {"self_level": self_level, "reason": "placement_skipped"},
        }
        for skill in SKILLS
    }
    session.execute(
        text(
            "UPDATE practice_sessions SET ended_at = :at WHERE profile_id = :pid "
            "AND module = 'placement' AND ended_at IS NULL"
        ),
        {"at": taken_at, "pid": profile_id},
    )
    session.execute(
        text("UPDATE profiles SET onboarded_at = COALESCE(onboarded_at, :at) WHERE id = :pid"),
        {"at": taken_at, "pid": profile_id},
    )
    _seed_estimates(session, profile_id, estimates, "low", taken_at)
    plan = generate_plan(session, profile_id)
    return {
        "estimates": estimates,
        "confidence": "low",
        "plan": plan,
        "nag": "Take the placement test (or 3 scored attempts per skill) to firm these up.",
    }


def _seed_estimates(
    session: Session,
    profile_id: str,
    estimates: dict[str, Any],
    confidence: str,
    taken_at: str,
) -> None:
    """Write the starting ``band_estimates`` rows (10 §3 seeds the engine at ×2 weight)."""
    rows: dict[str, SkillEstimate] = {}
    for skill in SKILLS:
        payload = estimates.get(skill) or {}
        band = float(payload.get("band") or 5.5)
        is_skipped = bool(payload.get("skipped"))
        evidence = payload.get("evidence") or {}
        rows[skill] = SkillEstimate(
            skill=skill,
            band=band,
            estimate_raw=band,
            range_low=max(0.0, band - 1.0),
            range_high=min(9.0, band + 1.0),
            confidence="low" if is_skipped else confidence,
            n_eff=0.0 if is_skipped else 2.0,
            attempts_used=0 if is_skipped else 1,
            newest_attempt_at=None if is_skipped else taken_at,
            criteria=normalize_criteria(evidence.get("criteria")),
            method="self_assessed" if is_skipped else "placement",
        )
    from bandready.curriculum.estimate import overall_estimate

    rows["overall"] = overall_estimate(rows)
    rows["overall"].method = "placement"
    store_estimates(session, profile_id, rows, force=True)


def _merge_objective(first: Any, second: Any) -> dict[str, Any] | None:
    parts = [p for p in (first, second) if isinstance(p, dict)]
    if not parts:
        return None
    return {
        "correct": sum(int(p.get("correct") or 0) for p in parts),
        "of": sum(int(p.get("of") or 0) for p in parts),
    }


def _objective_band(correct: int, of: int) -> float:
    """8-question sampler conversion, scaled when the bank had fewer questions."""
    if of <= 0:
        return 3.5
    scaled = round(correct / of * SAMPLER_QUESTIONS)
    return OBJECTIVE_BAND.get(max(0, min(SAMPLER_QUESTIONS, scaled)), 5.5)


def _loads(raw: Any) -> Any:
    if raw is None or isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


__all__ = ["router"]
