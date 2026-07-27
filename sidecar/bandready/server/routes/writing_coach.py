"""Writing coach routes — the teaching layer of the writing pack.

    GET  /api/v1/writing/coach/prompts/{prompt_id}/teaching   full payload (gated)
    GET  /api/v1/writing/coach/language-bank                  frames, pack-wide
    GET  /api/v1/writing/coach/plan/{prompt_id}               the planning screen
    POST /api/v1/writing/coach/compare                        script vs model at a band
    GET  /api/v1/writing/coach/exam-conditions                is the coach shut, and why

These are the *coach's* routes and they are separate from ``routes/writing.py`` on
purpose: that module is the workspace — the prompt bank, drafts, autosave, submit, the
report — and none of it is allowed to know about model answers.

**The gate.** ``…/teaching`` withholds the model answers, the sentence ladder, the swap
slots, ``plan.trap`` and the Academic overview brief until the learner has submitted an
attempt on that prompt. Unlocking happens one of two ways — ``?attempted=true``, the
editor attesting that the learner has just written one the server has not seen submitted
yet, or a submitted attempt found in the database. A draft does not count: the gate must
not open for somebody who opened the editor and switched tabs.

**Exam conditions.** While a 60-minute mock is open the whole surface shuts: ``…/teaching``
returns a payload with nothing taught in it, and the other three refuse with 409. The
rule is enforced inside :mod:`bandready.writing.coach`, not here, so it holds for every
caller rather than for every caller that remembered to check.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.writing import coach, mock

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/writing/coach", tags=["writing-coach"])


class CompareBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    prompt_id: str | None = None
    #: The learner's own text. Left empty, ``attempt_id`` supplies it.
    script: str = ""
    band_target: int = coach.DEFAULT_BAND
    #: Read the script (and the prompt) from an existing attempt instead of inlining it.
    attempt_id: str | None = None


# --------------------------------------------------------------------------------------
# Teaching payload
# --------------------------------------------------------------------------------------


@router.get(
    "/prompts/{prompt_id}/teaching", summary="The teaching payload for one prompt"
)
def prompt_teaching(
    prompt_id: str,
    attempted: Annotated[
        bool,
        Query(
            description=(
                "The caller attests the learner has already written on this prompt. "
                "Required to receive model answers when no submitted attempt exists."
            )
        ),
    ] = False,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Model answers, the ladder, the frames, the plan, the briefs, the watchlist.

    Model answers are **absent** unless the gate opens. That is the whole feature: a
    model read before the attempt is a template to memorise, and memorised language is
    what the descriptors decline to credit. ``model_answer_bands`` still tells the UI the
    ladder exists, so it renders a locked tab rather than an empty one.
    """
    prompt = coach.get_prompt(s, prompt_id)
    profile_id = current_profile_id(s)
    gate = coach.gate_state(s, profile_id, prompt_id, attested=attempted)

    conditions = mock.exam_conditions(s, profile_id)
    if conditions is not None:
        # Not "compute it and strip it" — nothing coaching is assembled at all.
        return {**mock.locked_teaching_payload(s, prompt, conditions), "gate": gate}

    payload = coach.teaching_payload(s, prompt, unlocked=gate["unlocked"])
    return {**payload, "gate": gate, "exam_conditions": None}


# --------------------------------------------------------------------------------------
# Language bank
# --------------------------------------------------------------------------------------


@router.get("/language-bank", summary="Functional frames across the writing pack")
def language_bank(
    move: str | None = None,
    task_type: str | None = None,
    genre: str | None = None,
    topic: str | None = None,
    prompt_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Frames grouped by functional move, with the "sounds canned" negative beside each.

    Not attempt-gated — a frame with an open slot is preparation material, not a model
    answer, which is exactly why every authored frame is required to carry a ``___``.
    ``topic`` accepts either ``environment`` or ``topic_environment``.
    """
    return coach.language_bank(
        s,
        move=move,
        task_type=task_type,
        genre=genre,
        topic=topic,
        prompt_id=prompt_id,
        limit=limit,
    )


# --------------------------------------------------------------------------------------
# The planning screen
# --------------------------------------------------------------------------------------


@router.get("/plan/{prompt_id}", summary="The time plan and paragraph skeleton")
def prompt_plan(
    prompt_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The twenty or forty minutes as a procedure, plus the paragraph roles and budget.

    ``post_submit`` is separated on purpose. ``plan.trap`` names the omission this prompt
    provokes and is shown *after* the answer is in, as a check — never as a warning read
    while planning, which would turn the trap into an instruction.
    """
    prompt = coach.get_prompt(s, prompt_id)
    profile_id = current_profile_id(s)
    conditions = mock.exam_conditions(s, profile_id)
    if conditions is not None:
        raise mock.refusal(conditions)
    gate = coach.gate_state(s, profile_id, prompt_id)
    return {**coach.plan_payload(s, prompt, unlocked=gate["unlocked"]), "gate": gate}


# --------------------------------------------------------------------------------------
# Compare
# --------------------------------------------------------------------------------------


@router.post("/compare", summary="The learner's script against the model at a band")
async def compare(
    body: CompareBody,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """What the model does that the learner did not, per criterion, plus what to do next.

    Grounded in this prompt's own teaching payload — the model answer at the requested
    band, its criterion-by-criterion account, the task's own requirements, the frames this
    prompt pulls and the errors its content provokes — rather than in generic band advice.
    Which frames went unused is decided by string matching here, not by the model; the
    model only says where each one would have fitted in the learner's own script.
    """
    prompt_id = body.prompt_id
    script = body.script.strip()
    if body.attempt_id:
        attempt_script, row = coach.attempt_script(s, body.attempt_id)
        prompt_id = prompt_id or row.prompt_id
        script = script or attempt_script.strip()
    if not prompt_id:
        raise ApiError(
            422, "validation_error", "compare needs a prompt_id or an attempt_id"
        )

    prompt = coach.get_prompt(s, prompt_id)
    if body.band_target not in coach.BANDS:
        raise ApiError(
            422,
            "validation_error",
            f"band_target must be one of {', '.join(str(b) for b in coach.BANDS)}",
        )

    # Comparing against a model you have not earned is the gate with an extra step, so it
    # is refused for the same reason and in the same words.
    gate = coach.gate_state(s, current_profile_id(s), prompt_id, attested=bool(script))
    if not gate["unlocked"]:
        raise ApiError(409, "conflict", gate["message"] or coach.LOCK_MESSAGE)

    result = await coach.compare_answer(s, prompt, script, body.band_target)
    return {**result, "attempt_id": body.attempt_id, "gate": gate}


# --------------------------------------------------------------------------------------
# Exam conditions
# --------------------------------------------------------------------------------------


@router.get("/exam-conditions", summary="Is the coach shut, and why")
def read_exam_conditions(_: Auth = None, s: Db = None) -> dict[str, Any]:
    """What the coach will refuse right now.

    The client does not need this to be correct — the coach refuses regardless — but a UI
    that greys the Coach tab out beats one that offers it and then shows a 409.
    """
    conditions = mock.exam_conditions(s, current_profile_id(s))
    if conditions is None:
        return {
            "active": False,
            "mock_id": None,
            "coaching_available": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
