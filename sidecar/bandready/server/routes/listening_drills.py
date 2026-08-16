"""Listening practice routes — the drills a review turns into.

    GET  /api/v1/listening/practice/kinds       the four kinds and how each is graded
    GET  /api/v1/listening/practice/catalogue   what this pack can actually drill, counted
    GET  /api/v1/listening/practice/profile     the learner's own dictation buckets
    POST /api/v1/listening/practice/sets        build one set (keys stripped)
    POST /api/v1/listening/practice/grade       mark it, open the reveals, record it
    POST /api/v1/listening/practice/synonym     the one judgement call in the surface

**Why a second router rather than more handlers in ``listening.py``.** That module is the
player: the bank, rendering, attempts, autosave, submit and review. It stays as it is. What
lives here is everything the attempt cannot express — a set built out of *fragments* of a
script rather than the whole part, a per-item reveal that opens as soon as the answer is in,
and grading that has nothing to do with a raw score out of forty.

**Stateless by construction.** No set is stored. A set is a deterministic function of
``(kind, filters, seed)``, and grading rebuilds it from the same seed, so a reload costs a
learner nothing worse than a fresh set and the server holds no drill state between the two
calls. Same trick the reading and speaking drills use.

**The key never travels early.** :func:`drills.strip_key` removes the dictated line, the
answer key, the signpost kind and the prediction slot from every item before it is
serialised. On a signpost item that also means removing the marker *as text*: a learner who
can read "moving on to" off the screen is doing a reading exercise, and the entire drill is
that they hear it.

**Exam conditions.** While an exam-mode listening attempt is open for this profile, every
route here 409s. Drills are coaching; coaching is shut for the duration of a mock. Same rule
the other three modules enforce.

**Audio.** Three of the four kinds need the script rendered, and the fourth deliberately does
not. A set whose script has no audio yet returns ``409`` naming the script, so the client can
send the learner to the existing render button rather than showing an empty player. Clips are
byte ranges of the part's own WAV — no new media is ever synthesized for a drill, which is
what makes these free to run.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.listening import drills
from bandready.providers.llm import chat_json
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.listening.practice")

Auth = Annotated[None, Depends(require_auth)]
Db = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/api/v1/listening/practice", tags=["listening-drills"])


# --------------------------------------------------------------------------------------
# Static description of the surface — what each kind trains, and what grades it
# --------------------------------------------------------------------------------------

KIND_INFO: list[dict[str, Any]] = [
    {
        "kind": "dictation",
        "title": "Dictation",
        "subtitle": "One line, unlimited replays, type every word",
        "trains": (
            "Decoding, with the comprehension removed. Most lost marks in listening are not "
            "failures to understand a word — they are failures to hear a word you already "
            "know, because connected speech does not pronounce it the way you store it."
        ),
        "graded_by": "word-by-word against the transcript, sorted into four diagnoses",
        "needs": "a rendered script",
        "audio": drills.AUDIO_NEED["dictation"],
        "modes": [],
        "seconds_per_item": drills.DRILL_SECONDS["dictation"],
        "max_size": drills.MAX_SIZE_BY_KIND["dictation"],
    },
    {
        "kind": "numbers",
        "title": "Numbers, names and spelling",
        "subtitle": "The answers that are pure transcription",
        "trains": (
            "The mechanically commonest lost mark. Spelled surnames, phone numbers, "
            "postcodes, prices and dates are decided entirely by what reaches the page, and "
            "a correctly heard answer written wrongly scores exactly zero."
        ),
        "graded_by": "the same exact matcher the test uses, with the spelling leak tagged",
        "needs": "keyed answers that are figures, codes or names",
        "audio": drills.AUDIO_NEED["numbers"],
        "modes": [
            {
                "mode": "transcribe",
                "label": "From the audio",
                "what": "Hear the line the answer was in, and write the answer.",
            },
            {
                "mode": "form",
                "label": "From what was said",
                "what": "No audio. Here is the speaker's wording — write what goes in the "
                        "box. 'Twenty-four pounds fifty' is not what you write down.",
            },
        ],
        "seconds_per_item": drills.DRILL_SECONDS["numbers"],
        "max_size": drills.MAX_SIZE,
    },
    {
        "kind": "signpost",
        "title": "Signposts",
        "subtitle": "The words that announce an answer is coming",
        "trains": (
            "Position-keeping. You get one pass, so what replaces re-reading is "
            "metadiscourse — the speaker constantly announcing what they are about to do. "
            "The inventory is closed and small, and it is learnable in a fortnight."
        ),
        "graded_by": "an exact pick, or how close your press was to the real moment",
        "needs": "authored signposts, and a rendered script",
        "audio": drills.AUDIO_NEED["signpost"],
        "modes": [
            {
                "mode": "recognise",
                "label": "What is coming",
                "what": "Hear the marker, say what kind of thing follows it.",
            },
            {
                "mode": "cue",
                "label": "When it is coming",
                "what": "Listen to a stretch and press the moment you think the answer is "
                        "starting. Early is fine. Late means you reacted to the answer.",
            },
        ],
        "seconds_per_item": drills.DRILL_SECONDS["signpost"],
        "max_size": drills.MAX_SIZE,
    },
    {
        "kind": "prediction",
        "title": "Prediction",
        "subtitle": "What kind of word has to go in this gap — before any audio",
        "trains": (
            "The strongest technique there is, and the one with the largest gains for weaker "
            "listeners. A candidate who has decided the gap needs a plural noun cannot write "
            "a number into it, and cannot be talked out of it by a distractor."
        ),
        "graded_by": "the authored slot for the gap",
        "needs": "an authored prediction slot — no audio at all",
        "audio": drills.AUDIO_NEED["prediction"],
        "modes": [],
        "seconds_per_item": drills.DRILL_SECONDS["prediction"],
        "max_size": drills.MAX_SIZE,
    },
]


# --------------------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------------------

Kind = Literal["dictation", "numbers", "signpost", "prediction"]


class SetFilters(BaseModel):
    kind: Kind = "dictation"
    #: Restrict to one script. Required for dictation and signpost, whose items only make
    #: sense inside one recording — a set that hops between four voices and four topics is
    #: four warm-ups rather than one exercise.
    script_id: str | None = None
    part: int | None = Field(default=None, ge=1, le=4)
    accent_set: Literal["uk", "us", "au"] | None = None
    #: ``numbers``: transcribe | form. ``signpost``: recognise | cue. Ignored elsewhere.
    mode: str | None = None
    size: int = Field(default=drills.DEFAULT_SIZE, ge=drills.MIN_SIZE, le=drills.MAX_SIZE)
    #: Supply it to rebuild the identical set; omitted, one is minted and returned.
    seed: str | None = None


class ItemResponse(BaseModel):
    item_id: str
    #: Dictation: the typed line. Numbers: the answer. Prediction/signpost-recognise: the
    #: chosen slug. Signpost-cue: the press position in milliseconds from the clip's start.
    given: str | None = None
    time_ms: int | None = None
    replays: int | None = None


class GradeSet(SetFilters):
    seed: str
    responses: list[ItemResponse] = Field(default_factory=list)
    duration_s: int | None = None
    #: Off only for a client re-marking a set it has already recorded.
    record: bool = True


class SynonymCheck(BaseModel):
    script_id: str
    number: int
    printed: str = Field(min_length=1, max_length=200)
    guesses: list[str] = Field(default_factory=list, max_length=5)


# --------------------------------------------------------------------------------------
# Guards
# --------------------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _assert_no_open_mock(session: Session) -> None:
    """409 while an exam-conditions listening attempt is open for this profile.

    Checked against the attempt rows directly rather than through a mock module, so the rule
    holds whether or not a mock runner is installed: ``ListeningAttempt.mode == "exam"`` is
    the only fact it turns on.
    """
    profile_id = current_profile_id(session)
    open_attempt = session.scalars(
        select(m.ListeningAttempt)
        .join(m.PracticeSession, m.PracticeSession.id == m.ListeningAttempt.id)
        .where(
            m.ListeningAttempt.mode == "exam",
            m.ListeningAttempt.status == "in_progress",
            m.PracticeSession.profile_id == profile_id,
        )
        .limit(1)
    ).first()
    if open_attempt is not None:
        raise ApiError(
            409,
            "conflict",
            "A listening mock is in progress. Drills are coaching, and coaching is shut "
            "until you submit or abandon the sitting.",
        )


def _seed(value: str | None) -> str:
    from ulid import ULID

    return (value or "").strip() or str(ULID())


def _mode_for(kind: str, requested: str | None) -> str:
    """Resolve the sub-mode, defaulting to the one that teaches most per minute."""
    modes = {
        "numbers": ("transcribe", "form"),
        "signpost": ("recognise", "cue"),
    }.get(kind)
    if not modes:
        return ""
    wanted = (requested or "").strip().lower()
    if wanted in modes:
        return wanted
    if wanted:
        raise ApiError(
            422, "validation_error", f"{kind} drills run in {' or '.join(modes)} mode"
        )
    return modes[0]


# --------------------------------------------------------------------------------------
# Set assembly — one function, so build and grade cannot drift apart
# --------------------------------------------------------------------------------------

def _pick_script(session: Session, body: SetFilters, seed: str) -> m.ListeningScript:
    """The script a set is built from.

    An explicit ``script_id`` wins. Otherwise one is chosen deterministically from the seed
    among the scripts that can actually supply this kind — which means "shuffle" gives the
    learner a different recording each time without ever landing on one with nothing in it.
    """
    if body.script_id:
        row = session.get(m.ListeningScript, body.script_id)
        if row is None or row.retired:
            raise ApiError(404, "not_found", f"no listening script {body.script_id!r}")
        return row

    rows = drills.live_scripts(session, part=body.part, accent_set=body.accent_set)
    usable = [
        row for row in rows
        if len(drills.SOURCES[body.kind](drills.script_doc(row))) >= drills.MIN_SIZE
    ]
    if not usable:
        raise ApiError(404, "not_found", _empty_reason(body.kind, body))
    rng = drills.rng_for(seed, f"script:{body.kind}")
    return rng.choice(sorted(usable, key=lambda row: row.id))


def _require_audio(doc: dict[str, Any], kind: str) -> dict[str, Any]:
    """The rendered timings, or a 409 the client can act on.

    409 rather than 404 because nothing is missing — the content exists and simply has not
    been synthesized yet, which is a one-click fix on a screen the app already has.
    """
    timing = drills.timing_for(doc)
    if timing is None:
        raise ApiError(
            409,
            "conflict",
            f"“{doc.get('title')}” has not been rendered yet, and a {kind} drill plays "
            "fragments of that recording. Prepare the audio for this part first — nothing "
            "new is synthesized for a drill.",
        )
    return timing


def _build(session: Session, body: SetFilters, seed: str) -> dict[str, Any]:
    """The set, keys included. Never returned raw — :func:`drills.strip_key` runs first."""
    kind = body.kind
    mode = _mode_for(kind, body.mode)
    row = _pick_script(session, body, seed)
    doc = drills.script_doc(row)
    sources = drills.SOURCES[kind](doc)
    if not sources:
        raise ApiError(404, "not_found", _empty_reason(kind, body, doc))

    needs_audio = kind in drills.AUDIO_KINDS or (kind == "numbers" and mode == "transcribe")
    timing = _require_audio(doc, kind) if needs_audio else drills.timing_for(doc)

    size = min(body.size, drills.MAX_SIZE_BY_KIND.get(kind, drills.MAX_SIZE))
    rng = drills.rng_for(seed, f"items:{kind}")
    pool = list(sources)
    if kind == "dictation":
        # `dictation_sources` is already ranked (answer lines first), so the deal is taken
        # from the head of that ranking and only shuffled for presentation order.
        pool = pool[: max(size * 2, size)]
    rng.shuffle(pool)

    items: list[dict[str, Any]] = []
    for source in pool:
        if len(items) >= size:
            break
        index = len(items) + 1
        item: dict[str, Any] | None
        if kind == "dictation":
            item = drills.dictation_item(doc, source, timing, index=index, seed=seed)
        elif kind == "numbers":
            item = drills.numbers_item(doc, source, timing, index=index, seed=seed, mode=mode)
        elif kind == "signpost":
            item = drills.signpost_item(
                doc, source, timing, sources, index=index, seed=seed, mode=mode
            )
        else:
            item = drills.prediction_item(doc, source, index=index, seed=seed)
        if item is not None:
            items.append(item)

    if len(items) < drills.MIN_SIZE:
        raise ApiError(404, "not_found", _empty_reason(kind, body, doc, built=len(items)))

    return {
        "kind": kind,
        "mode": mode or None,
        "seed": seed,
        "script": {
            "id": row.id,
            "title": row.title,
            "part": row.part,
            "accent_set": row.accent_set,
            "scenario": doc.get("scenario"),
            "audio": drills.audio_ref(doc),
        },
        "doc": doc,
        "timing": timing,
        "items": items,
    }


def _empty_reason(
    kind: str, body: SetFilters, doc: dict[str, Any] | None = None, built: int = 0
) -> str:
    where = f"“{doc.get('title')}”" if doc else "this pack"
    short = (
        f" It could only build {built} of the {drills.MIN_SIZE} a set needs."
        if built
        else ""
    )
    if kind == "signpost":
        return (
            f"{where} carries no authored signposts, so there is nothing to score a "
            "prediction of what is coming against. This drill reads the teaching payload; a "
            f"script without one cannot supply it.{short}"
        )
    if kind == "prediction":
        return (
            f"{where} carries no authored prediction slots. The slot is a judgement about "
            "what the printed frame constrains, and inferring it from the answer would show "
            f"you the thing you are supposed to be predicting.{short}"
        )
    if kind == "numbers":
        mode = (body.mode or "transcribe").lower()
        if mode == "form":
            return (
                f"{where} has no answer whose spoken form differs from its written one, so "
                f"every item here would be a copying exercise rather than a transcription "
                f"one.{short}"
            )
        return (
            f"{where} has no keyed answer that is a figure, a code, a date or a spelled "
            f"name.{short}"
        )
    if built:
        return (
            f"{where} could only build {built} dictation clips and a set needs "
            f"{drills.MIN_SIZE}. Its lines are outside the "
            f"{drills.DICTATION_MIN_WORDS}–{drills.DICTATION_MAX_WORDS} word range a "
            "dictated line has to sit in."
        )
    return f"{where} has nothing this drill can be built from."


# --------------------------------------------------------------------------------------
# GET /kinds, /catalogue, /profile
# --------------------------------------------------------------------------------------

@router.get("/kinds", summary="The four drill kinds and their contracts")
def get_kinds(_: Auth) -> dict[str, Any]:
    return {
        "kinds": KIND_INFO,
        "sizes": {
            "min": drills.MIN_SIZE,
            "default": drills.DEFAULT_SIZE,
            "max": drills.MAX_SIZE,
        },
        "buckets": [
            {"bucket": slug, **info} for slug, info in drills.DICTATION_BUCKETS.items()
        ],
        "why": (
            "The recording plays once and then it is gone, so none of these is “look at it "
            "again”. They are the four things still trainable afterwards: hearing the words "
            "(dictation), getting them onto the page (numbers and spelling), knowing when an "
            "answer is coming (signposts), and knowing what shape it will be before it "
            "arrives (prediction)."
        ),
        "honesty": (
            "Our voices are synthesized. They are clear and they are consistent, which makes "
            "them good for decoding practice, and they do not slur, hesitate or talk over "
            "each other the way a tired human at four in the afternoon does. Treat these "
            "drills as the floor, not the ceiling, and get real English into your week too."
        ),
    }


@router.get("/catalogue", summary="What this pack can actually drill, counted")
def get_catalogue(
    _: Auth,
    session: Db,
    part: int | None = Query(default=None, ge=1, le=4),
    accent_set: str | None = Query(default=None, pattern="^(uk|us|au)$"),
) -> dict[str, Any]:
    _assert_no_open_mock(session)
    return {
        "part": part,
        "accent_set": accent_set,
        **drills.census(session, part=part, accent_set=accent_set),
    }


@router.get("/profile", summary="Which kind of word you keep dropping")
def get_profile(_: Auth, session: Db) -> dict[str, Any]:
    _assert_no_open_mock(session)
    profile_id = current_profile_id(session)
    buckets = drills.bucket_profile(session, profile_id)
    return {
        "buckets": buckets,
        "note": (
            "Counted across your recent drills. One session's four missed grammar words is "
            "noise; “weak forms are most of everything you drop” is a diagnosis, and it has "
            "a different fix from a vocabulary gap."
        ),
        "form_note": (
            "Spelling is counted apart from the rest on purpose. A word you heard and "
            "mis-spelled is a hearing success and an exam zero, and a learner who is told to "
            "“practise listening” to fix it will practise the wrong thing for months."
        ),
    }


@router.get("/sessions", summary="Every drill set you have finished")
def list_sessions(
    _: Auth,
    session: Db,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    """The drill ledger, newest first — counts only, never the items.

    ``record_set`` has written one ``practice_sessions`` envelope and one ``drill_results``
    row per finished set since drills shipped, and nothing has ever read them back: the
    only surface that touched a drill result was the report the runner drew once, in
    memory, and then dropped. So a learner's own drill work was unreachable the moment the
    screen unmounted.

    Two decisions worth keeping:

    * **Aggregates only.** ``details_json`` holds the dictated line, the key and what the
      learner wrote. None of it comes out here — a history row needs "6 of 8, dictation,
      Tuesday", and shipping the key inside a list payload is how a reveal leaks.
    * **No mock gate.** Every other route in this module refuses while a sitting is open,
      because every other route hands back pack material the paper is about to test. This
      one hands back the learner's own past scores, which reveal nothing about the paper in
      front of them, and locking a history screen during a mock would be theatre.
    """
    profile_id = current_profile_id(session)
    rows = session.execute(
        select(m.DrillResult, m.PracticeSession)
        .join(m.PracticeSession, m.PracticeSession.id == m.DrillResult.id)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.DrillResult.module == "listening",
        )
        .order_by(m.PracticeSession.started_at.desc())
        .limit(limit)
    ).all()

    items: list[dict[str, Any]] = []
    for result, envelope in rows:
        params = _json_object(result.params_json)
        summary = _json_object(envelope.summary_json)
        items.append(
            {
                "session_id": result.id,
                # `drill_kind` is the stored taxonomy value ("numbers_spelling"); `kind` is
                # what the learner picked in the launcher ("numbers"). Both are here so a
                # client can label the row without having to reverse `RESULT_KINDS`.
                "kind": params.get("kind") or result.drill_kind,
                "drill_kind": result.drill_kind,
                "script_id": summary.get("script_id") or params.get("script_id"),
                "part": params.get("part"),
                "accent_set": params.get("accent_set"),
                "mode": params.get("mode"),
                "n_items": result.n_items,
                "n_correct": result.n_correct,
                "started_at": envelope.started_at,
                "ended_at": envelope.ended_at,
                "duration_s": envelope.duration_s,
            }
        )
    return {"items": items, "count": len(items)}


def _json_object(raw: str | None) -> dict[str, Any]:
    """A stored JSON column as a dict — never an exception, never a non-dict."""
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):  # pragma: no cover — a hand-edited row
        return {}
    return value if isinstance(value, dict) else {}


# --------------------------------------------------------------------------------------
# POST /sets
# --------------------------------------------------------------------------------------

@router.post("/sets", status_code=status.HTTP_201_CREATED, summary="Build one drill set")
def build_set(body: SetFilters, _: Auth, session: Db) -> dict[str, Any]:
    _assert_no_open_mock(session)
    seed = _seed(body.seed)
    built = _build(session, body, seed)
    items = [drills.strip_key(item) for item in built["items"]]
    return {
        "kind": built["kind"],
        "mode": built["mode"],
        "seed": seed,
        "script": built["script"],
        "size": len(items),
        "seconds": sum(int(item.get("seconds") or 0) for item in items),
        "items": items,
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

    responses = {r.item_id: r for r in body.responses}
    unknown = sorted(set(responses) - set(by_id))
    if unknown:
        raise ApiError(
            422,
            "validation_error",
            "those responses are not from this set — a set is a function of its seed, so "
            "regrade with the seed the set was built with",
        )

    doc = built["doc"]
    timing = built["timing"]
    results: list[dict[str, Any]] = []
    for item in built["items"]:
        response = responses.get(item["item_id"])
        results.append(_grade_one(doc, timing, item, response))

    total = len(results)
    correct = sum(1 for r in results if r["correct"])

    drill_id: str | None = None
    if body.record and total:
        drill_id = drills.record_set(
            session,
            profile_id=profile_id,
            kind=built["kind"],
            script_id=str(built["script"]["id"]),
            results=results,
            params={
                "seed": body.seed,
                "size": total,
                "mode": built["mode"],
                "script_id": built["script"]["id"],
                "part": built["script"]["part"],
            },
            duration_s=body.duration_s,
            now=_now(),
        )

    return {
        "drill_id": drill_id,
        "kind": built["kind"],
        "mode": built["mode"],
        "seed": body.seed,
        "script": built["script"],
        "n_items": total,
        "n_correct": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        # Deliberately no band. A band after six fragments of one recording would be a
        # number with nothing attached to it, and listening bands are five marks wide.
        "band": None,
        "summary": _summary(built["kind"], results),
        "results": results,
    }


def _grade_one(
    doc: dict[str, Any],
    timing: dict[str, Any] | None,
    item: dict[str, Any],
    response: ItemResponse | None,
) -> dict[str, Any]:
    kind = str(item.get("kind") or "")
    payload = response.model_dump() if response is not None else {"given": None}
    given = payload.get("given")

    if kind == "dictation":
        marking = drills.dictation_result(item, str(given or ""))
    elif kind == "numbers":
        marking = drills.grade_numbers(item, str(given or ""))
    elif kind == "signpost":
        marking = drills.grade_signpost(item, payload)
    else:
        marking = drills.grade_prediction(item, given)

    number = item.get("number") or item.get("question_number")
    question = drills.find_question(doc, number) if number else None
    return {
        "item_id": item["item_id"],
        "kind": kind,
        "mode": item.get("mode"),
        "index": item.get("index"),
        "script_id": item.get("script_id"),
        "number": number,
        "line_index": item.get("line_index"),
        "correct": bool(marking.get("correct")),
        "marking": marking,
        "time_ms": payload.get("time_ms"),
        "replays": payload.get("replays"),
        "reveal": drills.reveal_for(doc, item, timing, question),
    }


def _summary(kind: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    """The one paragraph the learner reads. Different per kind, because the lesson is."""
    if kind == "dictation":
        total = sum(int(r["marking"].get("total") or 0) for r in results)
        heard = sum(int(r["marking"].get("heard") or 0) for r in results)
        exact = sum(int(r["marking"].get("exact") or 0) for r in results)
        counts: dict[str, int] = {}
        for result in results:
            for bucket, count in (result["marking"].get("counts") or {}).items():
                counts[bucket] = counts.get(bucket, 0) + int(count)
        missed = total - heard
        function_missed = counts.get("function_word", 0)
        return {
            "words_total": total,
            "words_heard": heard,
            "words_exact": exact,
            "spelling_only": heard - exact,
            "headline": drills.dictation_headline(total, heard, missed, function_missed),
            "buckets": [
                {"bucket": bucket, "count": counts[bucket], **drills.DICTATION_BUCKETS[bucket]}
                for bucket in drills.DICTATION_BUCKETS
                if counts.get(bucket)
            ],
        }

    if kind == "numbers":
        leaks = [r for r in results if (r["marking"].get("near_miss_spelling"))]
        over = [r for r in results if (r["marking"].get("over_limit"))]
        return {
            "near_miss_spelling": len(leaks),
            "over_limit": len(over),
            "headline": (
                f"{len(leaks)} of your wrong answers were within a letter or two of the key. "
                "You heard those. They still scored zero, and that is an orthography fix, "
                "not a listening one."
                if leaks
                else "No spelling leaks in this set — what you heard is what reached the page."
            ),
        }

    if kind == "signpost":
        offsets = [
            int(r["marking"]["offset_ms"])
            for r in results
            if r["marking"].get("offset_ms") is not None
        ]
        late = sum(1 for value in offsets if value > drills.CUE_LATE_MS)
        return {
            "median_offset_ms": sorted(offsets)[len(offsets) // 2] if offsets else None,
            "late": late,
            "headline": (
                f"{late} of your presses came after the answer had already started. That is "
                "the reflex that loses the next question too — you are still on the last one."
                if late
                else "Your presses tracked the markers, which is what keeps you in position "
                     "when you lose one."
            ),
        }

    same_family = sum(1 for r in results if r["marking"].get("same_family"))
    wrong = sum(1 for r in results if not r["correct"])
    return {
        "same_family": same_family,
        "headline": (
            f"{same_family} of your {wrong} misses were the right family and the wrong "
            "shape — singular for plural, a time for a date. You read the frame and then "
            "did not use what it said."
            if same_family
            else "Where you were wrong, you were not reading the printed frame. The word "
                 "just before the gap decides this every time."
            if wrong
            else "Every gap slot-typed correctly. That is thirty seconds of preview doing "
                 "the work of the whole recording."
        ),
    }


# --------------------------------------------------------------------------------------
# POST /synonym — the one judgement call in the surface
# --------------------------------------------------------------------------------------

SYNONYM_SYSTEM = (
    "You are an IELTS-style listening tutor checking a learner's PREDICTIONS, not their "
    "answers. The learner has been shown a printed question phrase and asked to guess how a "
    "speaker might say the same idea out loud. Judge each guess only on whether a natural "
    "speaker of English could plausibly use it to mean the printed phrase in a spoken "
    "conversation or talk. Reward paraphrase; do not reward repeating the printed words. "
    'Reply with JSON: {"verdicts":[{"guess":"…","plausible":true,"why":"≤20 words"}],'
    '"note":"≤35 words of coaching"}. Never invent a guess the learner did not make, never '
    "mention the recording, and never state or imply the answer to the question."
)

SYNONYM_USER = (
    "Printed phrase: {printed}\n"
    "Learner's guesses at how it might be spoken:\n{guesses}\n"
    "Judge each guess."
)


@router.post("/synonym", summary="Judge the learner's guesses at how a phrase might be said")
async def synonym_check(body: SynonymCheck, _: Auth, session: Db) -> dict[str, Any]:
    """The synonym move on a prediction item — the only thing here a model marks.

    Listening's commonest *silent* loss is that the printed word is never spoken: the learner
    waits for it, hears nothing, and concludes the answer was never given. The cure is to
    rehearse the paraphrase before the audio. Whether "the garden-waste lorry" is a plausible
    spoken form of "Green waste collection" is a judgement no string test can make, so this
    is one ``chat_json`` call — and it runs *after* the mechanical slot verdict is already
    fixed, so it can never change a mark.

    The authored ``paraphrase_link.audio`` is returned alongside as the ground truth, because
    the model's opinion is a second layer and the author's is the first.
    """
    _assert_no_open_mock(session)
    row = session.get(m.ListeningScript, body.script_id)
    if row is None or row.retired:
        raise ApiError(404, "not_found", f"no listening script {body.script_id!r}")
    doc = drills.script_doc(row)
    question = drills.find_question(doc, body.number)
    if question is None:
        raise ApiError(404, "not_found", f"question {body.number} is not in that script")

    link = drills.sub_teaching(question, "paraphrase_link")
    guesses = [g.strip() for g in body.guesses if g and g.strip()][:5]
    if not guesses:
        raise ApiError(422, "validation_error", "give at least one way it might be said")

    analysis = await chat_json(
        [
            {"role": "system", "content": SYNONYM_SYSTEM},
            {
                "role": "user",
                "content": SYNONYM_USER.format(
                    printed=" ".join(body.printed.split()),
                    guesses="\n".join(f"- {g}" for g in guesses),
                ),
            },
        ],
        # Falls back to the generic fixture in mock mode, which is why every field below is
        # read defensively rather than trusted.
        mock_kind="listening_synonym_check",
        temperature=0.2,
    )

    raw = analysis.get("verdicts")
    verdicts: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            verdicts.append(
                {
                    "guess": str(entry.get("guess") or "").strip(),
                    "plausible": bool(entry.get("plausible")),
                    "why": str(entry.get("why") or "").strip() or None,
                }
            )
    return {
        "script_id": body.script_id,
        "number": body.number,
        "printed": body.printed,
        "guesses": guesses,
        "verdicts": verdicts,
        "note": str(analysis.get("note") or "").strip() or None,
        "authored": (
            {"printed": link.get("printed"), "audio": link.get("audio")} if link else None
        ),
        "authored_note": (
            "In listening the printed question is the paraphrase and the audio is the "
            "original — the opposite way round from a reading summary. Waiting for the "
            "printed word is why an answer can go past with no feeling of difficulty at all."
        ),
        "model": (analysis.get("_meta") or {}).get("model_id"),
    }
