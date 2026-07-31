"""The skills bridge — what the learner met, or got wrong, in the four skills.

BandReady already knows more about this learner than any word list does. A Task 2
submission carries anchored error annotations against the learner's exact characters; a
speaking report carries verbatim quotes and the upgrade for each; a reading passage knows
which mined item blocked which question they got wrong; a listening script knows which
pre-taught term sat on top of the answer they missed. All of that is *evidence of need*,
and evidence of need is the condition under which teaching lands (GV-R3 §9.3, route 1).

This module turns that evidence into two things:

* **Suggestions** — :func:`harvest_lexis` produces ingest payloads, :func:`file_suggestions`
  files them. **Never scheduled.** Ruling R2-5 is the reason the inbox exists: nothing a
  module decides is worth learning becomes a card until the learner says so. Every call
  here goes through the existing ``ingest_item(schedule=False, status_on_create=
  "suggested")`` door — this file adds no second ingest path and no new tables.
* **The learner's own errors** — :func:`harvest_errors` produces the corpus that
  ``context.build("error_fix", ...)`` corrects. Own errors are strictly preferable to
  authored ones: maximum relevance, and zero risk of teaching a new error by exposure.

:func:`attach_learner_context` is where both meet the queue: it hands an entry its own
authored v2 payload, the sentences this learner actually met it in, and the mistakes they
actually made with it, so that :func:`bandready.srs.context.select_sentence` has something
better than an authored example to choose.

Everything reads; only :func:`file_suggestions` writes, and what it writes is a
``vocab_entries`` row with ``status='suggested'`` and a ``vocab_sources`` provenance row.
No ``srs_cards`` row is created on any path through this file.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.srs import context as ctx
from bandready.srs import exercises as ex
from bandready.srs import scheduler as sched

_log = logging.getLogger("bandready.srs.bridge")

__all__ = [
    "BRIDGE_MODULES",
    "BridgeHarvest",
    "LearnerError",
    "attach_learner_context",
    "file_suggestions",
    "harvest",
    "harvest_errors",
    "harvest_lexis",
    "run",
]

#: The four skills, in the order a session touches them. `pronunciation` is deliberately
#: absent: a mispronounced word is a phoneme problem, not a lexical one, and it already
#: has its own drill loop.
BRIDGE_MODULES: tuple[str, ...] = ("writing", "speaking", "reading", "listening")

#: Per-module ceiling on one harvest. Mining without a ceiling turns into collecting, and
#: an inbox with 200 unread items is an inbox the learner stops opening.
PER_MODULE_CAP = 12
ERROR_CAP = 40


@dataclass
class LearnerError:
    """One mistake this learner actually made, anchored to the sentence they made it in."""

    id: str
    module: str
    source_id: str
    sentence: str
    span: str
    fix: str
    kind: str = "grammar"
    explanation: str = ""
    created_at: str = ""

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "module": self.module,
            "source_id": self.source_id,
            "sentence": self.sentence,
            "span": self.span,
            "fix": self.fix,
            "kind": self.kind,
            "explanation": self.explanation,
            "created_at": self.created_at,
        }


@dataclass
class BridgeHarvest:
    """Everything one sweep of the four skills found. Nothing has been written yet."""

    lexis: list[dict[str, Any]] = field(default_factory=list)
    errors: list[LearnerError] = field(default_factory=list)
    by_module: dict[str, int] = field(default_factory=dict)

    def public(self) -> dict[str, Any]:
        return {
            "lexis": self.lexis,
            "errors": [e.public() for e in self.errors],
            "by_module": self.by_module,
        }


# --------------------------------------------------------------------------------------
# Small shared helpers
# --------------------------------------------------------------------------------------


def _loads(raw: Any, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return fallback
    return value if isinstance(value, type(fallback)) else fallback


def _clean(value: Any) -> str:
    return " ".join(str(value or "").replace("’", "'").split())


def _sessions(
    session: Session,
    profile_id: str,
    module: str,
    *,
    since: str | None = None,
    limit: int = 25,
) -> list[str]:
    """Recent practice-session ids for one module, newest first."""
    stmt = (
        select(m.PracticeSession.id)
        .where(m.PracticeSession.profile_id == profile_id, m.PracticeSession.module == module)
        .order_by(m.PracticeSession.started_at.desc())
        .limit(max(1, limit))
    )
    if since:
        stmt = stmt.where(m.PracticeSession.started_at >= since)
    return [str(row) for row in session.execute(stmt).scalars().all()]


def _topic_tag(topic_id: str | None) -> str | None:
    value = (topic_id or "").strip().lower()
    return value.removeprefix("topic_") or None


# ======================================================================================
# 1. Lexis — what the learner met, or reached for and missed
# ======================================================================================


def harvest_lexis(
    session: Session,
    profile_id: str,
    *,
    since: str | None = None,
    modules: Sequence[str] = BRIDGE_MODULES,
    cap: int = PER_MODULE_CAP,
) -> BridgeHarvest:
    """Ingest payloads for every item the four skills say is worth a card.

    Returns plain dicts in ``IngestItem`` shape, deliberately — the same convention
    ``reading.coach.suggestion_payloads`` and ``speaking.coach.suggestion_payloads``
    already follow, so this package stays out of the ingest pipeline and the HTTP layer
    keeps owning the door.
    """
    harvest = BridgeHarvest()
    wanted = [mod for mod in modules if mod in BRIDGE_MODULES]
    collectors = {
        "writing": _writing_lexis,
        "speaking": _speaking_lexis,
        "reading": _reading_lexis,
        "listening": _listening_lexis,
    }
    for module in wanted:
        try:
            found = collectors[module](session, profile_id, since=since, cap=cap)
        except Exception as exc:  # noqa: BLE001 — one broken module must not lose the rest
            _log.warning("bridge: %s harvest failed (%s)", module, exc)
            found = []
        harvest.by_module[module] = len(found)
        harvest.lexis.extend(found)
    return harvest


def _writing_lexis(
    session: Session, profile_id: str, *, since: str | None, cap: int
) -> list[dict[str, Any]]:
    """The upgrades the evaluator nominated: the word they reached for and missed."""
    submissions = _sessions(session, profile_id, "writing", since=since)
    if not submissions:
        return []
    rows = (
        session.execute(
            select(m.WritingEvaluation)
            .where(m.WritingEvaluation.submission_id.in_(submissions))
            .order_by(m.WritingEvaluation.created_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        for item in _loads(row.vocab_suggestions_json, []):
            if not isinstance(item, dict):
                continue
            term = _clean(item.get("term"))
            if not term:
                continue
            replaces = _clean(item.get("replaces"))
            sentence = _clean(item.get("sentence_context"))
            detail = f"upgrade for “{replaces}”" if replaces else "nominated by your feedback"
            out.append(
                {
                    "term": term,
                    "is_phrase": " " in term,
                    "sentence_context": sentence or None,
                    "example_sentences": [sentence] if sentence else [],
                    "source": {
                        "kind": "writing",
                        "item_id": row.submission_id,
                        "detail": detail,
                    },
                }
            )
            if len(out) >= cap:
                return out
    return out


def _speaking_lexis(
    session: Session, profile_id: str, *, since: str | None, cap: int
) -> list[dict[str, Any]]:
    """``vocab_to_bank`` from the speaking report — used well, or used badly and upgraded."""
    sessions = _sessions(session, profile_id, "speaking", since=since)
    if not sessions:
        return []
    rows = (
        session.execute(
            select(m.LlmEvaluation)
            .where(
                m.LlmEvaluation.subject_kind == "speaking_session",
                m.LlmEvaluation.subject_id.in_(sessions),
                m.LlmEvaluation.status == "ok",
            )
            .order_by(m.LlmEvaluation.created_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        report = _loads(row.parsed_json, {})
        for item in report.get("vocab_to_bank") or []:
            if not isinstance(item, dict):
                continue
            term = _clean(item.get("term"))
            if not term:
                continue
            quote = _clean(item.get("context_quote"))
            kind = str(item.get("type") or "word").strip().lower()
            out.append(
                {
                    "term": term,
                    "is_phrase": kind != "word" or " " in term,
                    "sentence_context": quote or None,
                    "example_sentences": [quote] if quote else [],
                    "source": {
                        "kind": "speaking",
                        "item_id": row.subject_id,
                        "detail": _clean(item.get("reason"))[:500] or "from your speaking report",
                    },
                }
            )
            if len(out) >= cap:
                return out
    return out


def _reading_lexis(
    session: Session, profile_id: str, *, since: str | None, cap: int
) -> list[dict[str, Any]]:
    """Mined items from passages, restricted to the questions they actually got wrong.

    A word you did not know **and did not need** is not worth a card; a word that blocked a
    mark is the definition of worth learning. That constraint lives in
    ``reading.coach.suggestion_payloads`` and is reused rather than re-implemented.
    """
    from bandready.reading import coach as reading_coach

    attempts = (
        session.execute(
            select(m.ReadingAttempt)
            .where(
                m.ReadingAttempt.id.in_(_sessions(session, profile_id, "reading", since=since)),
                m.ReadingAttempt.status == "submitted",
            )
            .order_by(m.ReadingAttempt.submitted_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[dict[str, Any]] = []
    for attempt in attempts:
        wrong = (
            session.execute(
                select(m.ReadingAnswer.question_id).where(
                    m.ReadingAnswer.attempt_id == attempt.id, m.ReadingAnswer.correct == 0
                )
            )
            .scalars()
            .all()
        )
        if not wrong:
            continue
        questions = (
            session.execute(
                select(m.ReadingQuestion).where(m.ReadingQuestion.id.in_(list(wrong)))
            )
            .scalars()
            .all()
        )
        missed: dict[str, set[int]] = {}
        for question in questions:
            missed.setdefault(question.passage_id, set()).add(int(question.number))
        for passage_id, numbers in missed.items():
            passage = session.get(m.ReadingPassage, passage_id)
            if passage is None:
                continue
            out.extend(
                reading_coach.suggestion_payloads(passage, missed_numbers=numbers)
            )
            if len(out) >= cap:
                return out[:cap]
    return out[:cap]


def _listening_lexis(
    session: Session, profile_id: str, *, since: str | None, cap: int
) -> list[dict[str, Any]]:
    """Pre-taught terms that sat on top of an answer they missed.

    ``pre_teach[].blocks_q`` is the mark the term cost, and ``line_index`` is where it was
    said — which makes the script line the context sentence, so the card arrives already
    attached to the moment the learner did not catch it.
    """
    from bandready.listening import coach as listening_coach

    attempts = (
        session.execute(
            select(m.ListeningAttempt)
            .where(
                m.ListeningAttempt.id.in_(
                    _sessions(session, profile_id, "listening", since=since)
                ),
                m.ListeningAttempt.status == "submitted",
            )
            .order_by(m.ListeningAttempt.submitted_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[dict[str, Any]] = []
    for attempt in attempts:
        wrong = (
            session.execute(
                select(m.ListeningAnswer.question_id).where(
                    m.ListeningAnswer.attempt_id == attempt.id, m.ListeningAnswer.correct == 0
                )
            )
            .scalars()
            .all()
        )
        if not wrong:
            continue
        questions = (
            session.execute(
                select(m.ListeningQuestion).where(m.ListeningQuestion.id.in_(list(wrong)))
            )
            .scalars()
            .all()
        )
        missed: dict[str, set[int]] = {}
        for question in questions:
            missed.setdefault(question.script_id, set()).add(int(question.number))
        for script_id, numbers in missed.items():
            script = session.get(m.ListeningScript, script_id)
            if script is None:
                continue
            doc = listening_coach.document(script)
            teaching = doc.get("teaching")
            pre_teach = (teaching or {}).get("pre_teach") if isinstance(teaching, dict) else None
            tag = _topic_tag(script.topic_id)
            for raw in pre_teach or []:
                if not isinstance(raw, dict):
                    continue
                term = _clean(raw.get("item"))
                blocks = raw.get("blocks_q")
                if not term or blocks is None or int(blocks) not in numbers:
                    continue
                line = listening_coach.line_text(doc, raw.get("line_index"))
                out.append(
                    {
                        "term": term,
                        "is_phrase": " " in term,
                        "definition": _clean(raw.get("gloss")) or None,
                        "sentence_context": _clean(line) or None,
                        "example_sentences": [_clean(line)] if line else [],
                        "topic_tags": [tag] if tag else [],
                        "source": {
                            "kind": "listening",
                            "item_id": script.id,
                            "detail": f"{script.title} · blocked Q{int(blocks)}",
                        },
                    }
                )
                if len(out) >= cap:
                    return out
    return out


# ======================================================================================
# 2. Errors — the sentences this learner actually got wrong
# ======================================================================================


def harvest_errors(
    session: Session,
    profile_id: str,
    *,
    since: str | None = None,
    limit: int = ERROR_CAP,
) -> list[LearnerError]:
    """Real mistakes, newest first: writing annotations and speaking error quotes.

    Reading and listening are absent on purpose — a wrong answer there is a comprehension
    failure, not a production error, and there is no learner-produced sentence to correct.
    """
    errors: list[LearnerError] = []
    try:
        errors.extend(_writing_errors(session, profile_id, since=since))
    except Exception as exc:  # noqa: BLE001
        _log.warning("bridge: writing error harvest failed (%s)", exc)
    try:
        errors.extend(_speaking_errors(session, profile_id, since=since))
    except Exception as exc:  # noqa: BLE001
        _log.warning("bridge: speaking error harvest failed (%s)", exc)
    errors.sort(key=lambda e: e.created_at, reverse=True)
    return errors[:limit]


#: Annotation types that describe something the learner *produced wrongly*. `task` and
#: `cohesion` are essay-level judgements with no correctable span, so they never become
#: an `error_fix` item.
CORRECTABLE_TYPES: tuple[str, ...] = ("grammar", "vocabulary", "spelling", "register")


def _writing_errors(
    session: Session, profile_id: str, *, since: str | None
) -> list[LearnerError]:
    submission_ids = _sessions(session, profile_id, "writing", since=since)
    if not submission_ids:
        return []
    rows = (
        session.execute(
            select(m.WritingEvaluation)
            .where(m.WritingEvaluation.submission_id.in_(submission_ids))
            .order_by(m.WritingEvaluation.created_at.desc())
        )
        .scalars()
        .all()
    )
    essays = {
        sub.id: (sub.essay_text or "")
        for sub in session.execute(
            select(m.WritingSubmission).where(m.WritingSubmission.id.in_(submission_ids))
        )
        .scalars()
        .all()
    }
    out: list[LearnerError] = []
    for row in rows:
        payload = _loads(row.annotations_json, {})
        essay = essays.get(row.submission_id, "")
        for index, raw in enumerate(payload.get("annotations") or []):
            if not isinstance(raw, dict):
                continue
            kind = str(raw.get("type") or "grammar")
            quote = _clean(raw.get("quote"))
            fix = _clean(raw.get("fix"))
            if kind not in CORRECTABLE_TYPES or not quote or not fix or fix == quote:
                continue
            start = raw.get("start")
            end = raw.get("end")
            sentence = (
                ctx.sentence_around(essay, int(start), int(end))
                if isinstance(start, int) and isinstance(end, int) and essay
                else quote
            )
            if quote.lower() not in sentence.lower():
                sentence = quote
            out.append(
                LearnerError(
                    id=f"{row.id}:{index}",
                    module="writing",
                    source_id=row.submission_id,
                    sentence=sentence,
                    span=quote,
                    fix=fix,
                    kind=kind,
                    explanation=_clean(raw.get("explanation")),
                    created_at=row.created_at,
                )
            )
    return out


def _speaking_errors(
    session: Session, profile_id: str, *, since: str | None
) -> list[LearnerError]:
    session_ids = _sessions(session, profile_id, "speaking", since=since)
    if not session_ids:
        return []
    rows = (
        session.execute(
            select(m.LlmEvaluation)
            .where(
                m.LlmEvaluation.subject_kind == "speaking_session",
                m.LlmEvaluation.subject_id.in_(session_ids),
                m.LlmEvaluation.status == "ok",
            )
            .order_by(m.LlmEvaluation.created_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[LearnerError] = []
    for row in rows:
        report = _loads(row.parsed_json, {})
        turns = [
            _clean(text)
            for text in session.execute(
                select(m.SpeakingTurn.text)
                .where(m.SpeakingTurn.session_id == row.subject_id, m.SpeakingTurn.role == "user")
                .order_by(m.SpeakingTurn.turn_index)
            )
            .scalars()
            .all()
        ]
        for index, raw in enumerate(report.get("errors") or []):
            if not isinstance(raw, dict):
                continue
            quote = _clean(raw.get("quote"))
            better = _clean(raw.get("better"))
            if not quote or not better or better == quote:
                continue
            out.append(
                LearnerError(
                    id=f"{row.id}:{index}",
                    module="speaking",
                    source_id=row.subject_id,
                    # The turn they said it in, when we can find it — a fragment out of
                    # context is much harder to repair than the sentence it lived in.
                    sentence=_turn_containing(turns, quote) or quote,
                    span=quote,
                    fix=better,
                    kind="grammar",
                    explanation=_clean(raw.get("issue")),
                    created_at=row.created_at,
                )
            )
    return out


def _turn_containing(turns: Iterable[str], quote: str) -> str | None:
    needle = ex.normalize_answer_text(quote)
    if not needle:
        return None
    for turn in turns:
        if needle in ex.normalize_answer_text(turn):
            # One sentence, not the whole turn: a 40-second answer is not a correctable item.
            for piece in ctx.split_sentences(turn) or [turn]:
                if needle in ex.normalize_answer_text(piece):
                    return piece
            return turn
    return None


# ======================================================================================
# 3. Filing — suggestions only, never cards
# ======================================================================================


def file_suggestions(
    session: Session,
    profile_id: str,
    payloads: Sequence[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """File harvested items into the suggestion inbox. **Nothing here is ever scheduled.**

    Three properties, each of which is a deliberate decision:

    1. ``schedule=False, status_on_create="suggested"`` — ruling R2-5. The inbox is opt-in
       by design and the bridge is a module, not the learner.
    2. ``misuse`` is never set. The documented known→active flip (vocab routes §3.3) is a
       *route*, owned by the module that watched the misuse happen; re-deriving it from
       stored evidence would silently reschedule a card every time this sweep runs.
    3. Already-filed items are skipped by ``(module, session_id, term)``, so running the
       sweep twice files nothing twice — dedup on ``(profile_id, lemma, pos)`` would merge
       them, but it would also append a duplicate provenance row each time.
    """
    from bandready.server.errors import ApiError
    from bandready.server.routes.vocab import IngestItem, ingest_item

    now = now or sched.now_utc()
    already = _already_filed(session, profile_id)
    filed: list[str] = []
    merged = 0
    skipped = 0

    for payload in payloads:
        data = dict(payload)
        data.pop("misuse", None)  # property 2, enforced rather than trusted
        source = dict(data.get("source") or {})
        key = (
            str(source.get("kind") or "manual"),
            str(source.get("item_id") or ""),
            ex.normalize_term(data.get("term") or ""),
        )
        if not key[2] or key in already:
            skipped += 1
            continue
        try:
            item = IngestItem(**data)
        except Exception as exc:  # noqa: BLE001 — a malformed payload is skippable, not fatal
            _log.info("bridge: skipping unusable payload %r (%s)", data.get("term"), exc)
            skipped += 1
            continue
        try:
            result = ingest_item(
                session,
                profile_id,
                item,
                schedule=False,
                status_on_create="suggested",
                now=now,
            )
        except ApiError as exc:
            if exc.status != 422:
                raise
            _log.info("bridge: skipping unusable suggestion %r: %s", item.term, exc.detail)
            skipped += 1
            continue
        already.add(key)
        filed.append(result["id"])
        if result["merged"]:
            merged += 1
    session.flush()
    return {
        "filed": len(filed),
        "merged": merged,
        "skipped": skipped,
        "ids": filed,
    }


def _already_filed(session: Session, profile_id: str) -> set[tuple[str, str, str]]:
    rows = session.execute(
        select(m.VocabSource.module, m.VocabSource.session_id, m.VocabEntry.lemma)
        .join(m.VocabEntry, m.VocabEntry.id == m.VocabSource.entry_id)
        .where(m.VocabEntry.profile_id == profile_id)
    ).all()
    return {(str(module), str(sid or ""), str(lemma)) for module, sid, lemma in rows}


def harvest(
    session: Session,
    profile_id: str,
    *,
    since: str | None = None,
    modules: Sequence[str] = BRIDGE_MODULES,
) -> BridgeHarvest:
    """One sweep: lexis and errors together, nothing written."""
    found = harvest_lexis(session, profile_id, since=since, modules=modules)
    found.errors = harvest_errors(session, profile_id, since=since)
    return found


def run(
    session: Session,
    profile_id: str,
    *,
    since: str | None = None,
    modules: Sequence[str] = BRIDGE_MODULES,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Harvest and file in one call — what a nightly job or a "refresh inbox" tap runs."""
    found = harvest(session, profile_id, since=since, modules=modules)
    result = file_suggestions(session, profile_id, found.lexis, now=now)
    return {
        **result,
        "by_module": found.by_module,
        "errors": len(found.errors),
        "harvested": len(found.lexis),
    }


# ======================================================================================
# 4. Handing the queue what it needs
# ======================================================================================


def attach_learner_context(
    session: Session,
    profile_id: str,
    entry: dict[str, Any],
    *,
    errors: Sequence[LearnerError] | None = None,
    since: str | None = None,
) -> dict[str, Any]:
    """Give one serialized entry everything the sentence selector can use.

    Adds three things and mutates nothing:

    * the authored **v2 payload** (`contexts[]`, `confusables[]`, `chunk`, `word_family`),
      resolved through the seed-provenance join so no migration is needed (DESIGN §3.3);
    * **`attempt_sentences`** — sentences from real attempts, ranked above authored prose
      by :data:`bandready.srs.context.SENTENCE_SOURCE_ORDER`;
    * **`learner_errors`** — the mistakes made with *this* item, which is what turns
      `error_fix` from an authored-error drill into a correction of their own sentence.

    ``errors`` may be passed in when the caller is decorating a whole queue, so the
    harvest runs once per session rather than once per card.
    """
    payload = ctx.pack_payload(session, str(entry.get("id") or ""))
    decorated = ctx.merge_pack_payload(entry, payload)

    pool = errors if errors is not None else harvest_errors(session, profile_id, since=since)
    matches = [e for e in pool if _mentions(e, decorated)]
    if matches:
        decorated["learner_errors"] = [e.public() for e in matches]

    attempts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for error in matches:
        text = _clean(error.sentence)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            attempts.append(
                {
                    "text": text,
                    "source": "learner_attempt",
                    "id": f"err:{error.id}",
                    "provenance": _MODULE_NOTE.get(error.module),
                }
            )
    if attempts:
        decorated["attempt_sentences"] = attempts
    return decorated


_MODULE_NOTE = {
    "writing": "from your Writing feedback",
    "speaking": "from your Speaking practice",
    "reading": "from your Reading session",
    "listening": "from your Listening practice",
}


def _mentions(error: LearnerError, entry: dict[str, Any]) -> bool:
    """Does this recorded mistake actually involve this item?"""
    headword = str(entry.get("headword") or entry.get("lemma") or "")
    if not headword:
        return False
    haystack = ex.normalize_answer_text(f"{error.span} {error.fix}")
    if not haystack:
        return False
    if " " in ex.normalize_term(headword):
        return ex.normalize_answer_text(headword) in haystack
    tokens = set(haystack.split())
    variants = {ex.normalize_answer_text(v) for v in ex.word_variants(headword, entry.get("lemma"))}
    return bool(tokens & variants)
