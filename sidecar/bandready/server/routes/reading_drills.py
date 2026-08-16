"""Reading practice routes — the drills that turn a review into a behaviour change.

    GET  /api/v1/reading/practice/kinds       the four kinds and how each is graded
    GET  /api/v1/reading/practice/catalogue   what this pack can actually drill, counted
    GET  /api/v1/reading/practice/traps       the taxonomy + bank counts + your own losses
    POST /api/v1/reading/practice/sets        build one set (keys and traps stripped)
    POST /api/v1/reading/practice/grade       mark it, reveal it, record it
    POST /api/v1/reading/practice/explain-back  the one judgement call in the surface

**Why this is a second router rather than four more handlers in ``reading.py``.** That
module is the *player*: the bank, attempts, autosave, marking, review. Its
``GET /drills/{qtype}`` builds a set of one type and runs it as a scored attempt, and it
stays exactly as it is — this router does not shadow it or replace it. What it adds is
the three things a path parameter of question types cannot express: selection by **trap**
rather than by type, items **generated** from the teaching payload (paraphrase and skim)
rather than taken whole from the bank, and a per-item **reveal** that only opens once the
answer is in.

**Stateless by construction.** No set is stored. A set is a deterministic function of
``(kind, filters, seed)``, and grading re-derives the items from the same seed, so the
server keeps no drill state between the two calls and a reload costs the learner nothing
worse than a fresh seed. This is the same trick the speaking drills use for item ids.

**The key never travels early.** :func:`drills.strip_key` removes the answer key, the
authored trap slug and the device answer from every item before it is serialised. In a
trap drill the trap *is* the thing being measured, so naming it up front would turn the
drill into a matching exercise; in a paraphrase drill the device answer gives the key away
by elimination. Both are absent from the response body, not hidden behind a client flag.

**Exam conditions.** While an exam-mode reading attempt is open for this profile, every
route here 409s. Drills are coaching, and coaching is shut for the duration of a mock —
the same rule the speaking and writing mocks enforce.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.reading import drills
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.timeutil import iso

_log = logging.getLogger("bandready.reading.practice")

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/reading/practice", tags=["reading-drills"])


# --------------------------------------------------------------------------------------
# Static description of the surface — what each kind trains, and what grades it
# --------------------------------------------------------------------------------------

KIND_INFO: list[dict[str, Any]] = [
    {
        "kind": "trap",
        "title": "Trap drill",
        "subtitle": "TRUE / FALSE / NOT GIVEN, one named trap at a time",
        "trains": (
            "The FALSE / NOT GIVEN boundary, which is where more marks are lost than "
            "anywhere else in the paper. You answer first; the trap and the boundary open "
            "afterwards."
        ),
        "graded_by": "answer key match",
        "needs": "judgement questions carrying an authored trap slug",
        "options": ["trap", "size", "two_stage", "bounded", "format"],
        "seconds_per_item": drills.DRILL_SECONDS["trap"],
    },
    {
        "kind": "type",
        "title": "Type drill",
        "subtitle": "One question type, pulled from across the pack",
        "trains": (
            "Attacking one type on its own terms — matching headings is nothing like "
            "TRUE/FALSE/NOT GIVEN. Turn on bounded search and you get the paragraph band "
            "the answer must be in rather than the paragraph it is in."
        ),
        "graded_by": "answer key match",
        "needs": "at least three questions of the type in the bank",
        "options": ["qtype", "size", "bounded", "format"],
        "seconds_per_item": None,
    },
    {
        "kind": "paraphrase",
        "title": "Paraphrase gym",
        "subtitle": "One question phrasing, four extracts, one that means it",
        "trains": (
            "Paraphrase recognition, which is what reading comprehension mostly is. The "
            "three wrong extracts are the highest-word-overlap phrases in the bank, so "
            "keyword matching fails on purpose."
        ),
        "graded_by": "answer key, then the preserving / changing call",
        "needs": "authored paraphrase links — four in a passage before one item exists",
        "options": ["size", "passage_id", "format"],
        "seconds_per_item": drills.DRILL_SECONDS["paraphrase"],
    },
    {
        "kind": "skim",
        "title": "Timed skim",
        "subtitle": "A passage, a short window, then gist-only questions",
        "trains": (
            "Speed without over-reading. The passage closes when the window does, so every "
            "question has to be answered from the shape of the text rather than from a "
            "second pass through it."
        ),
        "graded_by": "answer key match",
        "needs": "an authored skim plan with a paragraph map, or skim-gear questions",
        "options": ["passage_id", "size"],
        "seconds_per_item": drills.DRILL_SECONDS["skim"],
    },
]


# --------------------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------------------

class BuildSet(BaseModel):
    kind: Literal["trap", "type", "paraphrase", "skim"] = "trap"
    qtype: str | None = None
    trap: str | None = None
    passage_id: str | None = None
    format: Literal["academic", "general_training"] | None = None
    size: int = Field(default=drills.DEFAULT_SIZE, ge=drills.MIN_SIZE, le=drills.MAX_SIZE)
    #: Show the paragraph band instead of the anchor paragraph (type and trap drills).
    bounded: bool = False
    #: Split each judgement item into GIVEN/NOT GIVEN, then TRUE/FALSE.
    two_stage: bool = False
    #: Supply it to rebuild the identical set; omitted, one is minted and returned.
    seed: str | None = None


class ItemResponse(BaseModel):
    item_id: str
    given: str | None = None
    #: Two-stage drills only: the GIVEN / NOT GIVEN pick that came first.
    stage_one: str | None = None
    #: Paraphrase drills only: ``preserving`` or ``changing``.
    device_choice: str | None = None
    #: The trap the learner thinks they fell into, from the item's own picker.
    self_trap: str | None = None
    #: Milliseconds spent on this item, when the client tracked it.
    time_ms: int | None = None


class GradeSet(BaseModel):
    kind: Literal["trap", "type", "paraphrase", "skim"] = "trap"
    qtype: str | None = None
    trap: str | None = None
    passage_id: str | None = None
    format: Literal["academic", "general_training"] | None = None
    size: int = Field(default=drills.DEFAULT_SIZE, ge=drills.MIN_SIZE, le=drills.MAX_SIZE)
    bounded: bool = False
    two_stage: bool = False
    seed: str
    responses: list[ItemResponse] = Field(default_factory=list)
    duration_s: int | None = None
    #: Off only for a client that is re-marking a set it has already recorded.
    record: bool = True


class ExplainBack(BaseModel):
    question_id: str
    sentence: str = Field(min_length=1, max_length=600)
    self_trap: str | None = None


# --------------------------------------------------------------------------------------
# Guards
# --------------------------------------------------------------------------------------

def _assert_no_open_mock(session: Session) -> None:
    """409 while an exam-conditions reading attempt is open for this profile.

    Checked against the attempt rows directly rather than through the mock module, so the
    guard holds whether or not a mock runner is installed: ``ReadingAttempt.mode`` is set
    to ``exam`` at creation whenever ``exam_conditions`` is passed, and that is the only
    fact the rule turns on.
    """
    profile_id = current_profile_id(session)
    open_attempt = session.scalars(
        select(m.ReadingAttempt)
        .join(m.PracticeSession, m.PracticeSession.id == m.ReadingAttempt.id)
        .where(
            m.ReadingAttempt.mode == "exam",
            m.ReadingAttempt.status == "in_progress",
            m.PracticeSession.profile_id == profile_id,
        )
        .limit(1)
    ).first()
    if open_attempt is not None:
        raise ApiError(
            409,
            "conflict",
            "A reading mock is in progress. Drills are coaching, and coaching is shut "
            "until you submit or abandon the sitting.",
        )


def _seed(value: str | None) -> str:
    from ulid import ULID

    return (value or "").strip() or str(ULID())


# --------------------------------------------------------------------------------------
# Set assembly — one function, so build and grade cannot drift apart
# --------------------------------------------------------------------------------------

def _row_ids(session: Session, candidates: list[dict[str, Any]]) -> dict[tuple[str, int], str]:
    pairs = [
        (str(c["doc"].get("passage_id")), int(c["question"].get("number") or 0))
        for c in candidates
    ]
    return drills.question_row_ids(session, pairs)


def _build(session: Session, body: BuildSet | GradeSet, seed: str) -> dict[str, Any]:
    """The set, keys included. Never returned raw — :func:`drills.strip_key` runs first."""
    kind = body.kind

    if kind == "skim":
        return _build_skim(session, body, seed)

    candidates = drills.select_questions(
        session,
        qtype=body.qtype,
        trap=body.trap,
        fmt=body.format,
        passage_id=body.passage_id,
        judgement_only=(kind == "trap"),
        # A paraphrase item needs three lures out of the same pool, so it is built from a
        # wider deal and then cut to size — some candidates will have no usable lures.
        size=body.size * 3 if kind == "paraphrase" else body.size,
        seed=seed,
    )
    if not candidates:
        raise ApiError(404, "not_found", _empty_reason(kind, body))

    row_ids = _row_ids(session, candidates)

    items: list[dict[str, Any]] = []
    if kind == "paraphrase":
        pool = [c for c in candidates if drills.paraphrase_link(c["question"])]
        for candidate in pool:
            if len(items) >= body.size:
                break
            passage_id = str(candidate["doc"].get("passage_id"))
            number = int(candidate["question"].get("number") or 0)
            item = drills.paraphrase_item(
                candidate, pool,
                index=len(items) + 1, seed=seed,
                question_id=row_ids.get((passage_id, number)),
            )
            if item is not None:
                items.append(item)
        if len(items) < drills.MIN_SIZE:
            raise ApiError(
                404,
                "not_found",
                "This pack has too few authored paraphrase links to build a drill yet — an "
                "item needs one real pair plus three near-miss extracts to sit against it.",
            )
    else:
        for candidate in candidates[: body.size]:
            passage_id = str(candidate["doc"].get("passage_id"))
            number = int(candidate["question"].get("number") or 0)
            question_id = row_ids.get((passage_id, number))
            index = len(items) + 1
            if kind == "trap":
                items.append(
                    drills.trap_item(
                        candidate, index=index, seed=seed, question_id=question_id,
                        bounded=body.bounded, two_stage=body.two_stage,
                    )
                )
            else:
                items.append(
                    drills.type_item(
                        candidate, index=index, seed=seed, question_id=question_id,
                        bounded=body.bounded,
                    )
                )

    return {
        "kind": kind,
        "seed": seed,
        "qtype": body.qtype,
        "trap": body.trap,
        "trap_info": (
            {"slug": body.trap, **drills.TRAPS[body.trap]}
            if body.trap in drills.TRAPS
            else None
        ),
        "bounded": bool(body.bounded),
        "two_stage": bool(body.two_stage),
        "items": items,
        "candidates": candidates,
    }


def _build_skim(session: Session, body: BuildSet | GradeSet, seed: str) -> dict[str, Any]:
    passage_id = (body.passage_id or "").strip()
    if not passage_id:
        raise ApiError(422, "validation_error", "a skim drill needs a passage_id")
    row = session.get(m.ReadingPassage, passage_id)
    if row is None or row.retired:
        raise ApiError(404, "not_found", f"no reading passage {passage_id!r}")

    doc = drills.passage_doc(row)
    sources = drills.skim_sources(doc)
    if not sources["items"]:
        raise ApiError(
            404,
            "not_found",
            "This passage carries no skim plan and no gist-taggable questions, so there is "
            "nothing here that can honestly be answered without reading it closely.",
        )
    numbers = [
        (passage_id, int(entry["question"].get("number") or 0))
        for entry in sources["items"]
        if entry["source"] == "bank"
    ]
    items = drills.skim_items(
        doc, sources, seed=seed, size=body.size,
        row_ids=drills.question_row_ids(session, numbers),
    )
    return {
        "kind": "skim",
        "seed": seed,
        "qtype": None,
        "trap": None,
        "trap_info": None,
        "bounded": False,
        "two_stage": False,
        "items": items,
        "candidates": [],
        "passage": {
            "id": passage_id,
            "title": doc.get("title"),
            "format": row.format,
            "gt_section": doc.get("gt_section"),
            "word_count": row.word_count,
            "texts": doc.get("texts") or [],
        },
        "window": {
            "seconds": sources["window_s"],
            "plan_kind": sources["plan_kind"],
            "read_first": sources["read_first"],
            "skip": sources["skip"],
            "fields": sources["fields"],
            "rule": (
                "Read the title and the whole first paragraph, then the first and last "
                "sentence of every other paragraph. Write nothing longer than four words "
                "per paragraph — a label, not a summary."
                if sources["plan_kind"] != "field_scan"
                else "Do not map this text. Hunt the fields listed above and nothing else."
            ),
        },
    }


def _empty_reason(kind: str, body: BuildSet | GradeSet) -> str:
    if kind == "trap" and body.trap:
        info = drills.TRAPS.get(body.trap)
        name = info["name"] if info else body.trap
        return (
            f"No judgement question in this pack is tagged “{name}” yet. The trap drill "
            "reads the authored trap slugs, so a pack without the teaching payload has "
            "nothing to filter on."
        )
    if kind == "type" and body.qtype:
        return f"No questions of type {body.qtype!r} in the bank."
    return "Nothing in the bank matches those filters."


# --------------------------------------------------------------------------------------
# GET /kinds, /catalogue, /traps
# --------------------------------------------------------------------------------------

@router.get("/kinds", summary="The four drill kinds and their contracts")
def get_kinds(_: Auth) -> dict[str, Any]:
    return {
        "kinds": KIND_INFO,
        "sizes": {"min": drills.MIN_SIZE, "default": drills.DEFAULT_SIZE, "max": drills.MAX_SIZE},
        "why_review": (
            "A test you do not review is a measurement, not practice. These four kinds are "
            "what a review turns into: the trap you keep falling for, the type you keep "
            "losing, the paraphrase you keep missing, and the minutes you keep overspending."
        ),
    }


@router.get("/catalogue", summary="What this pack can actually drill, counted")
def get_catalogue(
    _: Auth,
    session: Db,
    format: str | None = Query(default=None, pattern="^(academic|general_training)$"),
) -> dict[str, Any]:
    _assert_no_open_mock(session)
    counted = drills.census(session, fmt=format)
    return {
        "format": format,
        **counted,
        "trap_families": [
            {"family": key, "label": label} for key, label in drills.TRAP_FAMILIES.items()
        ],
    }


@router.get("/traps", summary="The trap taxonomy, the bank's coverage, and your own losses")
def get_traps(_: Auth, session: Db) -> dict[str, Any]:
    _assert_no_open_mock(session)
    profile_id = current_profile_id(session)
    counted = {row["slug"]: row for row in drills.census(session)["traps"]}
    return {
        "families": [
            {"family": key, "label": label} for key, label in drills.TRAP_FAMILIES.items()
        ],
        "traps": [
            {
                "slug": slug,
                **info,
                "count": counted.get(slug, {}).get("count", 0),
                "drillable": counted.get(slug, {}).get("drillable", False),
                "thin": counted.get(slug, {}).get("thin", False),
            }
            for slug, info in drills.TRAPS.items()
        ],
        "profile": drills.trap_profile(session, profile_id),
        "note": (
            "Form traps — word limit, spelling, running out of time — are counted apart "
            "from the rest on purpose. They need an answer-form or a pacing fix, not a "
            "reading one, and averaging them in hides both problems."
        ),
    }


# --------------------------------------------------------------------------------------
# POST /sets
# --------------------------------------------------------------------------------------

@router.post("/sets", status_code=status.HTTP_201_CREATED, summary="Build one drill set")
def build_set(body: BuildSet, _: Auth, session: Db) -> dict[str, Any]:
    _assert_no_open_mock(session)
    seed = _seed(body.seed)
    built = _build(session, body, seed)
    items = [drills.strip_key(item) for item in built["items"]]
    return {
        "kind": built["kind"],
        "seed": seed,
        "qtype": built["qtype"],
        "trap": built["trap"],
        "trap_info": built["trap_info"],
        "bounded": built["bounded"],
        "two_stage": built["two_stage"],
        "size": len(items),
        "seconds": sum(int(item.get("seconds") or 0) for item in items),
        "items": items,
        **({"passage": built["passage"]} if "passage" in built else {}),
        **({"window": built["window"]} if "window" in built else {}),
    }


# --------------------------------------------------------------------------------------
# POST /grade
# --------------------------------------------------------------------------------------

@router.post("/grade", summary="Mark a set, open its reveals, record the result")
def grade_set(body: GradeSet, _: Auth, session: Db) -> dict[str, Any]:
    _assert_no_open_mock(session)
    profile_id = current_profile_id(session)
    built = _build(session, body, body.seed)
    by_id = {item["item_id"]: item for item in built["items"]}
    if not by_id:
        raise ApiError(404, "not_found", "that set could not be rebuilt from its seed")

    candidates = {
        drills.item_id(
            built["kind"],
            str(c["doc"].get("passage_id")),
            int(c["question"].get("number") or 0),
            body.seed,
        ): c
        for c in built["candidates"]
    }
    responses = {r.item_id: r for r in body.responses}

    unknown = sorted(set(responses) - set(by_id))
    if unknown:
        raise ApiError(
            422,
            "validation_error",
            "those responses are not from this set — a set is a function of its seed, so "
            "regrade with the seed the set was built with",
        )

    results: list[dict[str, Any]] = []
    for item in built["items"]:
        response = responses.get(item["item_id"])
        results.append(_grade_one(session, built, item, candidates, response))

    total = len(results)
    correct = sum(1 for r in results if r["correct"])
    per_trap: dict[str, dict[str, int]] = {}
    for result in results:
        for slug in result.get("traps") or []:
            bucket = per_trap.setdefault(slug, {"seen": 0, "lost": 0})
            bucket["seen"] += 1
            bucket["lost"] += int(not result["correct"])

    agreed = [r for r in results if (r.get("self_diagnosis") or {}).get("comparable")]
    stage_one_lost = sum(
        1 for r in results
        if (r.get("two_stage") or {}).get("available")
        and not ((r["two_stage"].get("stage_one") or {}).get("correct"))
    )

    drill_id: str | None = None
    if body.record and total:
        drill_id = drills.record_set(
            session,
            profile_id=profile_id,
            kind=built["kind"],
            qtype=body.qtype,
            trap=body.trap,
            results=results,
            params={
                "seed": body.seed,
                "size": total,
                "bounded": bool(body.bounded),
                "two_stage": bool(body.two_stage),
                "format": body.format,
                "passage_id": body.passage_id,
            },
            duration_s=body.duration_s,
            now=iso(),
        )

    return {
        "drill_id": drill_id,
        "kind": built["kind"],
        "seed": body.seed,
        "n_items": total,
        "n_correct": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        # Deliberately no band. A drill is not an assessment instrument and a band after
        # eight questions would be a number with no meaning attached to it.
        "band": None,
        "per_trap": [
            {"slug": slug, **drills.TRAPS[slug], **stats}
            for slug, stats in sorted(per_trap.items(), key=lambda kv: -kv[1]["lost"])
            if slug in drills.TRAPS
        ],
        "self_diagnosis": {
            "compared": len(agreed),
            "agreed": sum(1 for r in agreed if r["self_diagnosis"]["agreed"]),
            "note": (
                "Naming the trap yourself before the reveal is what separates a log from a "
                "lesson. Disagreeing with the author is informative — it says the reveal is "
                "not landing yet."
            ),
        },
        "two_stage": (
            {
                "stage_one_lost": stage_one_lost,
                "note": (
                    "Every mark lost at stage one is a location failure wearing a "
                    "TRUE/FALSE costume. Fix the search, not the reasoning."
                ),
            }
            if body.two_stage
            else None
        ),
        "results": results,
    }


def _grade_one(
    session: Session,
    built: dict[str, Any],
    item: dict[str, Any],
    candidates: dict[str, dict[str, Any]],
    response: ItemResponse | None,
) -> dict[str, Any]:
    kind = built["kind"]
    payload = response.model_dump() if response is not None else {"given": ""}

    if kind == "paraphrase":
        marking = drills.grade_paraphrase(item, payload)
        return {
            "item_id": item["item_id"],
            "question_id": item.get("question_id"),
            "passage_id": item.get("passage_id"),
            "number": item.get("number"),
            "qtype": item.get("qtype"),
            "correct": marking["correct"],
            "marking": marking,
            "traps": [],
            "self_diagnosis": drills.self_diagnosis([], payload.get("self_trap")),
            "two_stage": None,
            "time_ms": payload.get("time_ms"),
            "reveal": {
                "kind": "paraphrase",
                "stem_phrase": item.get("stem_phrase"),
                "text_phrase": next(
                    (o["text"] for o in item["options"] if o["key"] == item["answer_key"]),
                    None,
                ),
                "key": item["answer_key"],
                "note": item.get("note"),
                "device": marking["device"],
                "source_prompt": item.get("source_prompt"),
                "passage_title": item.get("passage_title"),
            },
        }

    if item.get("source") == "map_label":
        marking = drills.grade_answer(
            qtype="matching_information",
            given=payload.get("given"),
            accepted=[item["answer_key"]],
        )
        return {
            "item_id": item["item_id"],
            "question_id": None,
            "passage_id": item.get("passage_id"),
            "number": None,
            "qtype": item.get("qtype"),
            "correct": marking["correct"],
            "marking": marking,
            "traps": [],
            "self_diagnosis": drills.self_diagnosis([], payload.get("self_trap")),
            "two_stage": None,
            "time_ms": payload.get("time_ms"),
            "reveal": {
                "kind": "map_label",
                "key": item["answer_key"],
                "label": item.get("label"),
                "note": (
                    "That is the label the author would write for this paragraph in a "
                    "two-minute map. Compare it with the words you would have written — the "
                    "gap between the two is the whole exercise."
                ),
            },
        }

    candidate = candidates.get(item["item_id"])
    if candidate is None:
        # Skim drills carry bank questions but deal no candidate list, so recover the
        # question from its own passage rather than failing the whole set.
        candidate = _recover(session, item)
    if candidate is None:
        raise ApiError(404, "not_found", f"could not re-read item {item['item_id']!r}")

    doc, group, question = candidate["doc"], candidate["group"], candidate["question"]
    qtype = str(group.get("type") or "")
    marking = drills.grade_answer(
        qtype=qtype,
        given=payload.get("given"),
        accepted=question.get("answers") or [],
        word_limit=drills.group_word_limit(group),
    )
    two_stage = None
    correct = marking["correct"]
    if built["two_stage"] and qtype in drills.JUDGEMENT_TYPES:
        two_stage = drills.grade_two_stage(
            qtype, drills.display_key(question, qtype), payload
        )
        if two_stage.get("available"):
            # The scaffold *is* the item when it is on: a learner who called it NOT GIVEN
            # at stage one has not answered the question, whatever they typed after.
            stage_two = two_stage.get("stage_two")
            correct = (
                bool(two_stage["stage_one"]["correct"])
                if stage_two is None
                else bool(stage_two["correct"])
            )
            marking = {**marking, "correct": correct}

    authored = drills.traps_of(question)
    return {
        "item_id": item["item_id"],
        "question_id": item.get("question_id"),
        "passage_id": item.get("passage_id"),
        "number": item.get("number"),
        "qtype": qtype,
        "correct": correct,
        "marking": marking,
        "traps": authored,
        "self_diagnosis": drills.self_diagnosis(authored, payload.get("self_trap")),
        "two_stage": two_stage,
        "time_ms": payload.get("time_ms"),
        "reveal": drills.reveal_for(
            doc, group, question, given=str(payload.get("given") or ""), correct=correct
        ),
    }


def _recover(session: Session, item: dict[str, Any]) -> dict[str, Any] | None:
    passage_id, number = item.get("passage_id"), item.get("number")
    if not passage_id or not number:
        return None
    row = session.get(m.ReadingPassage, str(passage_id))
    if row is None:
        return None
    doc = drills.passage_doc(row)
    group, question = drills.find_question(doc, int(number))
    if group is None or question is None:
        return None
    return {"row": row, "doc": doc, "group": group, "question": question}


# --------------------------------------------------------------------------------------
# POST /explain-back — the one place judgement is genuinely needed
# --------------------------------------------------------------------------------------

EXPLAIN_BACK_SYSTEM = """You mark one sentence of self-explanation from an IELTS-style
reading learner. The learner has already been marked right or wrong mechanically; you are
not re-marking the question and you must not say whether their answer was correct.

You are given the authored decision rule for the item — the reason this reading is forced
and no other is available — and the reusable rule it teaches. Judge one thing only: does
the learner's sentence give the same reason, in their own words?

Rules:
- Reward the reason, not the vocabulary. A learner who says "it only talks about one town,
  not the whole country" has given the same reason as "the statement generalises beyond
  the scope the text supports".
- "verdict" is exactly one of: "aligned" (same reason), "partial" (touches it but stops
  short, or adds a wrong reason alongside), "off" (a different reason, or a restatement of
  the answer with no reason in it).
- A learner who only restates the key ("because it is NOT GIVEN") is "off". Naming the
  verdict is not explaining it.
- "note" is at most 30 words, addressed to the learner as "you", and must say what is
  missing rather than praise what is there.
- Never invent anything about the passage. You have not read it.

Return JSON: { "verdict": "...", "note": "...", "missing": "..." }"""

EXPLAIN_BACK_USER = """Question type: {qtype}
The key: {key}
Authored decision rule: {decision_rule}
Reusable rule it teaches: {reusable_rule}
The learner wrote: \"\"\"{sentence}\"\"\""""


@router.post("/explain-back", summary="Judge a learner's own explanation of the key")
async def explain_back(body: ExplainBack, _: Auth, session: Db) -> dict[str, Any]:
    """One LLM call, after the mechanical verdict, and it may not change it.

    Everything else in this surface is a string comparison, and a string comparison
    answered by a model is a string comparison answered unreliably. This is the one thing
    here that no matcher can do: whether a sentence the learner composed gives the same
    reason as the authored decision rule. Explaining your own correction is what separates
    learners who improve from learners who read explanations and do not.
    """
    from bandready.providers.llm import chat_json

    _assert_no_open_mock(session)
    row = session.get(m.ReadingQuestion, body.question_id)
    if row is None:
        raise ApiError(404, "not_found", f"no reading question {body.question_id!r}")
    passage = session.get(m.ReadingPassage, row.passage_id)
    if passage is None:
        raise ApiError(404, "not_found", f"no reading passage {row.passage_id!r}")

    doc = drills.passage_doc(passage)
    group, question = drills.find_question(doc, row.number)
    if group is None or question is None:
        raise ApiError(404, "not_found", "that question is not in its passage document")

    teaching = drills.teaching_of(question)
    decision_rule = str(teaching.get("decision_rule") or "").strip()
    reusable_rule = str(teaching.get("reusable_rule") or "").strip()
    if not decision_rule:
        # No authored rule means nothing to compare against, and a model asked to invent
        # the standard would grade the learner against its own guess.
        raise ApiError(
            422,
            "validation_error",
            "This question predates the teaching payload, so there is no authored decision "
            "rule to check your explanation against.",
        )

    qtype = str(group.get("type") or "")
    analysis = await chat_json(
        [
            {"role": "system", "content": EXPLAIN_BACK_SYSTEM},
            {
                "role": "user",
                "content": EXPLAIN_BACK_USER.format(
                    qtype=qtype,
                    key=drills.display_key(question, qtype) or "—",
                    decision_rule=decision_rule,
                    reusable_rule=reusable_rule or "—",
                    sentence=" ".join(body.sentence.split()),
                ),
            },
        ],
        mock_kind="reading_explain_back",
        temperature=0.1,
    )
    verdict = str(analysis.get("verdict") or "").strip().lower()
    if verdict not in ("aligned", "partial", "off"):
        verdict = "partial"
    return {
        "question_id": body.question_id,
        "verdict": verdict,
        "note": str(analysis.get("note") or "").strip() or None,
        "missing": str(analysis.get("missing") or "").strip() or None,
        "decision_rule": decision_rule,
        "reusable_rule": reusable_rule or None,
        "self_diagnosis": drills.self_diagnosis(drills.traps_of(question), body.self_trap),
        "model": (analysis.get("_meta") or {}).get("model_id"),
    }
