"""Reading coach routes — the teaching layer of the reading pack.

    GET  /api/v1/reading/coach/passages/{passage_id}/teaching   full payload (gated)
    GET  /api/v1/reading/coach/strategy                         per-type strategy, pack-wide
    GET  /api/v1/reading/coach/paraphrase/{passage_id}          the paraphrase links (gated)
    POST /api/v1/reading/coach/paraphrase/{passage_id}/push     → vocab suggestion inbox
    POST /api/v1/reading/coach/why-wrong                        one missed question, explained
    GET  /api/v1/reading/coach/traps                            the trap taxonomy
    GET  /api/v1/reading/coach/exam-conditions                  is the coach shut, and why

These are the *coach's* routes. ``routes/reading.py`` remains the player — the passage
bank, attempts, autosave, marking and review — and holds no teaching of its own; nothing
here is reachable during a mock.

**The gate.** ``…/teaching`` and ``…/paraphrase`` withhold the worked solutions, the
evidence spans, the paraphrase links, the trap labels and the authored skim map until the
learner has **submitted an attempt containing that passage**. Unlike the speaking coach
there is no ``?attempted=true`` attestation: a reading attempt is written to the database
by its own submit call before that call returns, so there is never a window in which the
learner has attempted and the sidecar cannot see it. A live mock shuts the gate for every
passage regardless of history — that is the property a mock has no value without.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from bandready.db.engine import get_session
from bandready.reading import coach
from bandready.reading import mock as reading_mock
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/reading/coach", tags=["reading-coach"])


class MinePushBody(BaseModel):
    """Which mined items to file, and which attempt earns them.

    ``attempt_id`` is not bookkeeping. F7's whole discipline is that a word you did not
    know **and did not need** is not worth a card, so naming the attempt lets the server
    keep only the items whose ``blocks_q`` is a question this learner actually got wrong.
    """

    model_config = ConfigDict(extra="ignore")

    items: list[str] = Field(default_factory=list, max_length=20)
    attempt_id: str | None = None
    #: Off by default. Set it to file items the learner asked for by name regardless of
    #: whether they blocked a mark — the affordance exists, it is just never prominent.
    ignore_missed_filter: bool = False


class WhyWrongBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attempt_id: str = Field(min_length=1)
    number: int = Field(ge=1, le=40)


def _guard(session: Session) -> dict[str, Any] | None:
    """The live sitting, if there is one. Every route below consults it."""
    return reading_mock.exam_conditions(session, current_profile_id(session))


# --------------------------------------------------------------------------------------
# The teaching payload
# --------------------------------------------------------------------------------------


@router.get("/passages/{passage_id}/teaching", summary="The teaching payload for one passage")
def passage_teaching(
    passage_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Worked solutions, distractor autopsies, strategy, skim plan, paraphrase material.

    The worked solutions are **absent** unless the gate opens — not truncated, absent.
    That is the whole feature. In reading the solution *is* the answer: ``evidence_quote``
    quotes the sentence that decides the item, the paraphrase link points at it and a
    trap slug announces the verdict. Reading one before the attempt teaches nothing and
    permanently spends a passage that can only be sat once. ``solutions_available`` still
    tells the UI how many exist, so it can render a locked card rather than a blank one.
    """
    row = coach.get_passage(s, passage_id)
    conditions = _guard(s)
    if conditions is not None:
        return {
            **coach.locked_teaching_payload(row, conditions),
            "gate": reading_mock.locked_gate(conditions),
        }
    gate = coach.gate_state(s, current_profile_id(s), passage_id)
    payload = coach.teaching_payload(row, unlocked=gate["unlocked"])
    return {**payload, "gate": gate}


# --------------------------------------------------------------------------------------
# Strategy
# --------------------------------------------------------------------------------------


@router.get("/strategy", summary="Per-question-type strategy across the pack")
def strategy(
    type: str | None = Query(default=None, description="One question type slug"),
    format: str | None = Query(
        default=None, pattern="^(academic|general_training)$"
    ),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The static per-type page plus every authored attack plan for that type.

    Never gated by an attempt — a strategy card says how to attack the type, not what the
    answer is, and it is worth most *before* the passage is sat. It **is** refused during
    a mock, because during a mock nothing is preparation.

    The highest-value fact per type is ``answer_order``, and most learners do not have
    it: matching sentence endings is the one matching type whose answers run in passage
    order, and everything shaped like a summary, a table or a picture comes from a single
    section of the text rather than from all of it.
    """
    conditions = _guard(s)
    if conditions is not None:
        raise reading_mock.refusal(conditions)
    return coach.strategy(s, qtype=type, fmt=format, limit=limit)


@router.get("/traps", summary="The trap taxonomy, grouped by family")
def traps(_: Auth = None, s: Db = None) -> dict[str, Any]:
    """The closed taxonomy the review picker, the drills and the stats all share.

    Family F is separated on purpose. Running out of time, going over the word limit and
    mis-copying a word are form and process losses, never comprehension losses; coaching
    them as reading problems sends the learner to re-read a passage they understood.
    """
    conditions = _guard(s)
    if conditions is not None:
        raise reading_mock.refusal(conditions)
    families: dict[str, list[dict[str, Any]]] = {key: [] for key in coach.TRAP_FAMILIES}
    for slug, entry in coach.TRAPS.items():
        families[entry["family"]].append({"slug": slug, **entry})
    return {
        "families": [
            {"family": key, "label": label, "traps": families[key]}
            for key, label in coach.TRAP_FAMILIES.items()
        ],
        "count": len(coach.TRAPS),
        "devices": {slug: dict(entry) for slug, entry in coach.DEVICES.items()},
        "diagnoses": dict(coach.DIAGNOSES),
        "gears": dict(coach.GEARS),
    }


# --------------------------------------------------------------------------------------
# Paraphrase — the core skill
# --------------------------------------------------------------------------------------


@router.get("/paraphrase/{passage_id}", summary="Paraphrase links and families")
def paraphrase(
    passage_id: str,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """The material the Paraphrase Gym is built from, at zero marginal content cost.

    Reading is, at bottom, paraphrase recognition: the item writer restates a proposition
    in different words and the candidate has to see that it is the same proposition. The
    **families** are the passage's own concepts with four to six exam-realistic
    rewordings each, none of which appear in the text — preparation material, never
    gated. The **links** are the per-item stem ↔ text pairs, and they arrive with the
    solutions, because a link's text phrase is an exact substring of the anchor
    paragraph, which is to say it is the answer's address.
    """
    row = coach.get_passage(s, passage_id)
    conditions = _guard(s)
    if conditions is not None:
        raise reading_mock.refusal(conditions)
    gate = coach.gate_state(s, current_profile_id(s), passage_id)
    return {**coach.paraphrase_payload(row, unlocked=gate["unlocked"]), "gate": gate}


@router.post(
    "/paraphrase/{passage_id}/push",
    status_code=201,
    summary="File mined vocabulary as suggestions",
)
def push_vocabulary(
    passage_id: str,
    body: MinePushBody = Body(default_factory=MinePushBody),
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Push mined items into the **suggestion inbox** — never straight into SRS.

    A thin adapter over ``POST /api/v1/vocab/suggestions``: the same normalise → dedup →
    merge pipeline, the same provenance row, and the same ruling that nothing a module
    sends is ever scheduled silently. The learner accepts from the inbox, and only then
    does a card exist.

    What this adds is reading's own discipline. Mining is constrained to the passage's
    authored ``mineable`` list, filtered to the items whose ``blocks_q`` is a question
    the learner actually got wrong, and capped at five per passage — because a word you
    did not know and did not need is not worth a card, and an unconstrained *Add to deck*
    button turns review into collecting. The card carries the **paraphrase pair** and the
    source sentence rather than a bare headword, since the pair is what will be tested
    again.
    """
    from bandready.server.routes.vocab import IngestItem, SuggestionBatch, post_suggestions

    conditions = _guard(s)
    if conditions is not None:
        raise reading_mock.refusal(conditions)

    row = coach.get_passage(s, passage_id)
    items = coach.mineable_terms(row)
    if not items:
        raise ApiError(
            422,
            "validation_error",
            f"passage {passage_id!r} carries no mineable vocabulary list",
        )
    missing = coach.unknown_terms(items, body.items)
    if missing:
        raise ApiError(
            422, "validation_error", f"this passage has no mineable item {missing[0]!r}"
        )

    missed: set[int] | None = None
    if body.attempt_id and not body.ignore_missed_filter:
        missed = _missed_numbers(s, body.attempt_id)

    payloads = coach.suggestion_payloads(
        row, wanted=body.items, missed_numbers=missed, cap=coach.MINE_CAP
    )
    if not payloads:
        raise ApiError(
            422,
            "validation_error",
            "none of this passage's mineable items blocked a question you got wrong — "
            "a word you did not know and did not need is not worth a card",
        )
    batch = SuggestionBatch(items=[IngestItem(**payload) for payload in payloads])
    result = post_suggestions(body=batch, _=None, session=s)
    return {
        "passage_id": passage_id,
        "requested": len(payloads),
        "cap": coach.MINE_CAP,
        "filtered_to_missed": missed is not None,
        **result,
    }


def _missed_numbers(session: Session, attempt_id: str) -> set[int]:
    """Question numbers this learner got wrong in a submitted attempt."""
    from bandready.server.routes.reading import _attempt_row, _attempt_state

    row = _attempt_row(session, attempt_id)
    if row.status != "submitted":
        raise ApiError(409, "conflict", "that attempt has not been submitted yet")
    record = _attempt_state(row).get("score")
    if not isinstance(record, dict):
        return set()
    return {
        int(q.get("number") or 0)
        for q in record.get("per_question") or []
        if not q.get("correct")
    }


# --------------------------------------------------------------------------------------
# Why was I wrong?
# --------------------------------------------------------------------------------------


@router.post("/why-wrong", summary="One missed question, explained from its own autopsy")
async def why_wrong(
    body: WhyWrongBody,
    _: Auth = None,
    s: Db = None,
) -> dict[str, Any]:
    """Grounded in *this* item's distractor analysis and trap label, not in generic advice.

    The five parts come back in the order the Solution Card renders them — location,
    paraphrase link, decision rule, distractor autopsy, rule to reuse — with the option
    the learner actually chose pulled out as ``your_option`` so the UI can pin it to the
    top. The trap that leads is decided by the learner's own answer: an over-length
    answer is a form loss even on an item whose authored trap is a scope shift, and
    telling that learner to read more carefully would be the wrong lesson entirely.

    The authored payload is preferred over the model every time it exists. The model is
    the second layer, for passages authored before the teaching pass, and it is given the
    closed trap vocabulary so its answer lands on the same taxonomy the drills filter by.
    """
    return await coach.explain_wrong(s, body.attempt_id, body.number)


# --------------------------------------------------------------------------------------
# Exam conditions
# --------------------------------------------------------------------------------------


@router.get("/exam-conditions", summary="Is the coach shut, and why")
def read_exam_conditions(_: Auth = None, s: Db = None) -> dict[str, Any]:
    conditions = _guard(s)
    if conditions is None:
        return {
            "active": False,
            "mock_id": None,
            "coaching_available": True,
            "dictionary_enabled": True,
            "withheld": [],
            "message": None,
        }
    return {**conditions, "coaching_available": False}
