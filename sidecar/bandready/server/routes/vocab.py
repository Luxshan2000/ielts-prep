"""Vocabulary bank routes (18-api-contract.md §4.11, behaviour per 08-vocabulary-srs.md).

Two ingest doors, and the difference between them is the whole point of ruling R2-5:

* ``POST /api/v1/vocab/suggestions`` — what *modules* call. Lands ``status='suggested'``
  with **no** ``srs_cards`` row. Nothing a module sends is ever scheduled silently.
* ``POST /api/v1/vocab/entries`` — what the *learner* triggers (bank UI, reading popover
  "Add"). Same normalise/dedup/merge pipeline, but inserts ``status='active'`` **with** its
  card, due now. Deck opt-in (§6.2) is the only other immediate-schedule path.

Dedup is `(profile_id, lemma, pos)` everywhere (§3.1); merges append a `vocab_sources` row
and never touch scheduling — except the one documented known→active misuse flip (§3.3).
"""

from __future__ import annotations

import base64
import json
import logging
import tempfile
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    Form,
    Query,
    Response,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select, text, tuple_
from sqlalchemy.orm import Session
from ulid import ULID

from pathlib import Path

from bandready.db import models as m
from bandready.speech import answers
from bandready.db.engine import get_session
from bandready.server.deps import current_profile_id, require_auth
from bandready.server.errors import ApiError
from bandready.srs import exercises as ex
from bandready.srs import scheduler as sched

_log = logging.getLogger("bandready.vocab")

router = APIRouter(prefix="/api/v1/vocab", tags=["vocab"])

POS_VALUES = ("noun", "verb", "adj", "adv", "prep", "phrase", "collocation", "other")
STATUS_VALUES = ("suggested", "active", "suspended", "known")
MODULES = ("speaking", "writing", "reading", "listening", "pronunciation", "seed", "manual")
TOPIC_TAGS = (
    "environment", "education", "technology", "health", "globalisation", "work-careers",
    "travel-tourism", "media-advertising", "crime-law", "family-relationships", "art-culture",
    "science-research", "urbanisation-housing", "transport", "food-diet", "sport-fitness",
    "money-economy", "government-society", "language-communication", "nature-animals",
)
MAX_EXAMPLES = 6
MAX_COLLOCATIONS = 8
PENDING_DEFINITION = "(pending)"


# --------------------------------------------------------------------------------------
# Wire models
# --------------------------------------------------------------------------------------


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SourceRef(_Model):
    kind: str = "manual"
    item_id: str | None = None
    detail: str | None = None


class IngestItem(_Model):
    term: str = Field(min_length=1, max_length=200)
    pos: str | None = None
    is_phrase: bool | None = None
    sentence_context: str | None = Field(default=None, max_length=2000)
    definition: str | None = None
    ipa: str | None = None
    cefr_level: str | None = None
    topic_tags: list[str] = Field(default_factory=list)
    example_sentences: list[str] = Field(default_factory=list)
    collocations: list[str] = Field(default_factory=list)
    misuse: bool = False
    source: SourceRef = Field(default_factory=SourceRef)


class SuggestionBatch(_Model):
    items: list[IngestItem] = Field(default_factory=list, max_length=200)


class ManualAdd(IngestItem):
    pass


class EntryPatch(_Model):
    headword: str | None = None
    pos: str | None = None
    ipa: str | None = None
    definition: str | None = None
    own_context_sentence: str | None = None
    example_sentences: list[str] | None = None
    collocations: list[str] | None = None
    topic_tags: list[str] | None = None
    cefr_level: str | None = None
    status: Literal["suggested", "active", "suspended", "known"] | None = None


class AcceptAll(_Model):
    ids: list[str] | None = None


class CheckSentence(_Model):
    entry_id: str
    sentence: str = Field(min_length=1, max_length=1000)


class LookupRequest(_Model):
    word: str = Field(min_length=1, max_length=200)
    sentence: str | None = None


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


def _loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return fallback
    return value if isinstance(value, type(fallback)) else fallback


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _clean_list(values: Any, limit: int) -> list[str]:
    out: list[str] = []
    for item in values or []:
        s = str(item).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def _module_of(kind: str | None) -> str:
    value = (kind or "manual").strip().lower()
    return value if value in MODULES else "manual"


def _encode_cursor(parts: list[str]) -> str:
    return base64.urlsafe_b64encode(_dumps(parts).encode()).decode().rstrip("=")


def _decode_cursor(cursor: str | None) -> list[str] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        parts = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception:  # noqa: BLE001 — an opaque cursor we cannot read is a bad request
        raise ApiError(422, "validation_error", "cursor is not valid") from None
    if not isinstance(parts, list) or not all(isinstance(p, str) for p in parts):
        raise ApiError(422, "validation_error", "cursor is not valid")
    return parts


def serialize_entry(
    entry: m.VocabEntry,
    card: m.SrsCard | None = None,
    source: m.VocabSource | None = None,
) -> dict[str, Any]:
    """The 08 §2 card JSON (``*_json`` columns returned unsuffixed)."""
    doc: dict[str, Any] = {
        "id": entry.id,
        "headword": entry.headword,
        "lemma": entry.lemma,
        "is_phrase": bool(entry.is_phrase),
        "ipa": entry.ipa,
        "pos": entry.pos,
        "definition": entry.definition,
        "own_context_sentence": entry.own_context_sentence,
        "own_context_origin": entry.own_context_origin,
        "example_sentences": _loads(entry.example_sentences_json, []),
        "collocations": _loads(entry.collocations_json, []),
        "topic_tags": _loads(entry.topic_tags_json, []),
        "cefr_level": entry.cefr_level,
        "audio_ref": entry.audio_ref or f"media/vocab/{entry.id}.wav",
        "audio_url": f"/api/v1/media/vocab/{entry.id}.wav",
        "status": entry.status,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "source": None,
        "srs": None,
    }
    if source is not None:
        doc["source"] = {
            "module": source.module,
            "session_id": source.session_id,
            "detail": source.detail,
        }
    if card is not None:
        doc["srs"] = sched.card_public(card)
    return doc


def _first_sources(session: Session, entry_ids: list[str]) -> dict[str, m.VocabSource]:
    if not entry_ids:
        return {}
    rows = (
        session.execute(
            select(m.VocabSource)
            .where(m.VocabSource.entry_id.in_(entry_ids))
            .order_by(m.VocabSource.entry_id, m.VocabSource.created_at, m.VocabSource.id)
        )
        .scalars()
        .all()
    )
    out: dict[str, m.VocabSource] = {}
    for row in rows:
        out.setdefault(row.entry_id, row)
    return out


def _serialize_many(session: Session, entries: list[m.VocabEntry]) -> list[dict[str, Any]]:
    ids = [e.id for e in entries]
    cards = sched.cards_for_entries(session, ids)
    sources = _first_sources(session, ids)
    return [serialize_entry(e, cards.get(e.id), sources.get(e.id)) for e in entries]


def _entry_or_404(session: Session, profile_id: str, entry_id: str) -> m.VocabEntry:
    entry = session.get(m.VocabEntry, entry_id)
    if entry is None or entry.profile_id != profile_id:
        raise ApiError(404, "not_found", f"no vocabulary entry {entry_id!r}")
    return entry


def _wordnet_definition(lemma: str, pos: str) -> str | None:
    """Instant offline definition (§3.4). Returns None when WordNet has no data installed."""
    try:
        import wn

        pos_map = {"noun": "n", "verb": "v", "adj": "a", "adv": "r"}
        kwargs = {"pos": pos_map[pos]} if pos in pos_map else {}
        synsets = wn.synsets(lemma, **kwargs)  # type: ignore[arg-type]
        for synset in synsets:
            definition = synset.definition()
            if definition:
                return str(definition).strip()
    except Exception as exc:  # noqa: BLE001 — no lexicon installed yet is the normal case
        _log.debug("wordnet lookup for %r unavailable: %s", lemma, exc)
    return None


def _resolve_pos(
    session: Session, profile_id: str, lemma: str, requested: str | None, is_phrase: bool
) -> str:
    """POS resolution + the §3.1 ambiguity default."""
    if requested and requested in POS_VALUES:
        return requested
    if is_phrase:
        return "phrase"
    existing = (
        session.execute(
            select(m.VocabEntry.pos).where(
                m.VocabEntry.profile_id == profile_id, m.VocabEntry.lemma == lemma
            )
        )
        .scalars()
        .all()
    )
    if len(existing) == 1:
        return str(existing[0])
    return "other"


# --------------------------------------------------------------------------------------
# Ingest pipeline (§3.2 / §3.3)
# --------------------------------------------------------------------------------------


def ingest_item(
    session: Session,
    profile_id: str,
    item: IngestItem,
    *,
    schedule: bool,
    status_on_create: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Normalise → dedup → merge-or-insert one term. Returns ``{id, merged, status}``."""
    now = now or _now()
    headword = ex.normalize_term(item.term)
    if not headword:
        raise ApiError(422, "validation_error", "term is empty after normalisation")
    is_phrase = item.is_phrase if item.is_phrase is not None else (" " in headword)
    lemma = ex.lemmatize(headword, is_phrase)
    pos = _resolve_pos(session, profile_id, lemma, item.pos, is_phrase)
    module = _module_of(item.source.kind)

    existing = session.execute(
        select(m.VocabEntry).where(
            m.VocabEntry.profile_id == profile_id,
            m.VocabEntry.lemma == lemma,
            m.VocabEntry.pos == pos,
        )
    ).scalar_one_or_none()

    if existing is not None:
        _merge_into(session, existing, item, module=module, now=now)
        entry = existing
        merged = True
    else:
        definition = (item.definition or "").strip() or _wordnet_definition(lemma, pos)
        entry = m.VocabEntry(
            id=f"ve_{ULID()}",
            profile_id=profile_id,
            headword=item.term.strip()[:200] or headword,
            lemma=lemma,
            pos=pos,
            is_phrase=1 if is_phrase else 0,
            ipa=(item.ipa or None),
            definition=definition or PENDING_DEFINITION,
            own_context_sentence=(item.sentence_context or "").strip() or None,
            own_context_origin="seed" if module == "seed" else "learner",
            example_sentences_json=_dumps(_clean_list(item.example_sentences, MAX_EXAMPLES)),
            collocations_json=_dumps(_clean_list(item.collocations, MAX_COLLOCATIONS)),
            topic_tags_json=_dumps(_clean_list(item.topic_tags, 4)),
            cefr_level=item.cefr_level if item.cefr_level in
            ("A1", "A2", "B1", "B2", "C1", "C2") else None,
            status=status_on_create,
            created_at=sched.iso(now),
            updated_at=sched.iso(now),
        )
        session.add(entry)
        session.flush()
        merged = False

    session.add(
        m.VocabSource(
            id=f"vs_{ULID()}",
            entry_id=entry.id,
            module=module,
            session_id=item.source.item_id,
            detail=item.source.detail,
            created_at=sched.iso(now),
        )
    )

    # §3.3 known→active misuse flip: re-encountering a "known" word as an error reschedules it.
    if merged and item.misuse and entry.status == "known" and module in ("speaking", "writing"):
        entry.status = "active"
        _ensure_card(session, entry, now, reset_due=True)
    elif schedule:
        if entry.status in ("suggested", "known"):
            entry.status = "active"
        _ensure_card(session, entry, now)

    entry.updated_at = sched.iso(now)
    return {"id": entry.id, "merged": merged, "status": entry.status, "term": headword}


def _merge_into(
    session: Session, entry: m.VocabEntry, item: IngestItem, *, module: str, now: datetime
) -> None:
    """§3.3 merge rules — provenance always, sets unioned, scheduling untouched."""
    tags = _loads(entry.topic_tags_json, [])
    for tag in item.topic_tags or []:
        tag = str(tag).strip()
        if tag and tag not in tags:
            tags.append(tag)
    entry.topic_tags_json = _dumps(tags[:6])

    sentence = (item.sentence_context or "").strip()
    if sentence and module != "seed":
        if not entry.own_context_sentence or entry.own_context_origin == "seed":
            entry.own_context_sentence = sentence
            entry.own_context_origin = "learner"
        elif sentence != entry.own_context_sentence:
            examples = _loads(entry.example_sentences_json, [])
            if sentence not in examples and len(examples) < MAX_EXAMPLES:
                examples.append(sentence)
                entry.example_sentences_json = _dumps(examples)

    examples = _loads(entry.example_sentences_json, [])
    entry.example_sentences_json = _dumps(
        _clean_list([*examples, *(item.example_sentences or [])], MAX_EXAMPLES)
    )
    collocations = _loads(entry.collocations_json, [])
    entry.collocations_json = _dumps(
        _clean_list([*collocations, *(item.collocations or [])], MAX_COLLOCATIONS)
    )

    if entry.definition in ("", PENDING_DEFINITION) and (item.definition or "").strip():
        entry.definition = item.definition.strip()
    if not entry.ipa and item.ipa:
        entry.ipa = item.ipa
    if not entry.cefr_level and item.cefr_level in ("A1", "A2", "B1", "B2", "C1", "C2"):
        entry.cefr_level = item.cefr_level
    entry.updated_at = sched.iso(now)


def _ensure_card(
    session: Session, entry: m.VocabEntry, now: datetime, *, reset_due: bool = False
) -> m.SrsCard:
    card = session.execute(
        select(m.SrsCard).where(m.SrsCard.entry_id == entry.id)
    ).scalar_one_or_none()
    if card is None:
        card = sched.create_card(entry.id, now)
        session.add(card)
        session.flush()
    elif reset_due:
        card.due_at = sched.iso(now)
    return card


# --------------------------------------------------------------------------------------
# Async LLM enrichment (§3.2) — never blocks scheduling or reviews
# --------------------------------------------------------------------------------------

ENRICH_PROMPT = """You are a lexicographer preparing an English vocabulary card for an \
IELTS learner.
Word or phrase: "{word}"
Context sentence (may be empty): "{context}"

Return ONLY a JSON object:
{{
  "ipa": "IPA transcription of the headword, no slashes",
  "pos": "noun|verb|adj|adv|prep|phrase|collocation|other",
  "definition": "one clear learner-friendly definition matching the context sense, max 20 words",
  "example_sentences": ["2 natural example sentences at IELTS band 7 level"],
  "collocations": ["3-5 common collocations containing the headword"],
  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "topic_tags": ["0-2 tags from: {topics}"]
}}
If the input is not a real English word or phrase, return {{"error": "not_a_word"}}."""


def _needs_enrichment(entry: m.VocabEntry) -> bool:
    return (
        not entry.ipa
        or entry.definition in ("", PENDING_DEFINITION)
        or not _loads(entry.example_sentences_json, [])
        or not _loads(entry.collocations_json, [])
        or not entry.cefr_level
    )


async def enrich_entry(entry_id: str) -> dict[str, Any]:
    """Fill missing card fields with one JSON-mode LLM call. Safe to fire and forget."""
    from bandready.db.engine import session_scope
    from bandready.providers.llm import chat_json

    with session_scope() as session:
        entry = session.get(m.VocabEntry, entry_id)
        if entry is None or not _needs_enrichment(entry):
            return {"entry_id": entry_id, "enriched": False}
        word = entry.headword
        context = entry.own_context_sentence or ""

    payload = await chat_json(
        [
            {
                "role": "user",
                "content": ENRICH_PROMPT.format(
                    word=word, context=context, topics=", ".join(TOPIC_TAGS)
                ),
            }
        ],
        mock_kind="generic",
        temperature=0.2,
    )
    if payload.get("error") == "not_a_word":
        return {"entry_id": entry_id, "enriched": False, "reason": "not_a_word"}

    with session_scope() as session:
        entry = session.get(m.VocabEntry, entry_id)
        if entry is None:
            return {"entry_id": entry_id, "enriched": False}
        changed = _apply_enrichment(entry, payload)
        entry.updated_at = sched.iso(_now())
    return {"entry_id": entry_id, "enriched": changed}


def _apply_enrichment(entry: m.VocabEntry, payload: dict[str, Any]) -> bool:
    changed = False
    # `ipa` doubles as the "has been enriched at least once" marker: only the first
    # enrichment pass may replace the WordNet placeholder definition (§3.4's division of
    # labour), so a later pass never clobbers a definition the learner edited by hand.
    first_pass = not entry.ipa
    ipa = str(payload.get("ipa") or "").strip().strip("/")
    if ipa and not entry.ipa:
        entry.ipa = f"/{ipa}/"
        changed = True
    definition = str(payload.get("definition") or "").strip()
    if definition and (first_pass or entry.definition in ("", PENDING_DEFINITION)):
        entry.definition = definition
        changed = True
    examples = _clean_list(payload.get("example_sentences"), MAX_EXAMPLES)
    if examples and not _loads(entry.example_sentences_json, []):
        entry.example_sentences_json = _dumps(examples)
        changed = True
    collocations = _clean_list(payload.get("collocations"), MAX_COLLOCATIONS)
    if collocations and not _loads(entry.collocations_json, []):
        entry.collocations_json = _dumps(collocations)
        changed = True
    cefr = str(payload.get("cefr_level") or "").strip().upper()
    if cefr in ("A1", "A2", "B1", "B2", "C1", "C2") and not entry.cefr_level:
        entry.cefr_level = cefr
        changed = True
    tags = [t for t in _clean_list(payload.get("topic_tags"), 2) if t in TOPIC_TAGS]
    if tags and not _loads(entry.topic_tags_json, []):
        entry.topic_tags_json = _dumps(tags)
        changed = True
    return changed


async def enrich_entries(entry_ids: list[str]) -> None:
    """Enrich a batch, one entry at a time, swallowing every failure (offline tolerant)."""
    for entry_id in entry_ids:
        try:
            await enrich_entry(entry_id)
        except Exception as exc:  # noqa: BLE001 — a retry happens on the next encounter
            _log.info("enrichment for %s deferred: %s", entry_id, exc)


def queue_enrichment(background: BackgroundTasks | None, entry_ids: list[str]) -> None:
    """Queue the enrichment call to run once this request's response is built.

    A FastAPI background task (rather than a `job_manager` job) keeps the work tied to the
    request that caused it and needs no job kind in 18 §3's closed list. **Callers must
    `session.commit()` first**: background tasks run before the `get_session` dependency
    tears down, so an uncommitted transaction would both hide the new row from the
    enrichment session and hold the SQLite write lock against it.
    """
    ids = [i for i in entry_ids if i]
    if not ids or background is None:
        return
    background.add_task(enrich_entries, ids)


# --------------------------------------------------------------------------------------
# Search
# --------------------------------------------------------------------------------------


def _fts_ids(session: Session, profile_id: str, query: str) -> list[str] | None:
    """FTS5 match over headword+definition. ``None`` when FTS is unavailable."""
    tokens = [t for t in ex.normalize_answer_text(query).split() if t]
    if not tokens:
        return None
    match = " ".join(f'"{t}"*' for t in tokens)
    try:
        rows = session.execute(
            text(
                "SELECT e.id FROM vocab_fts f JOIN vocab_entries e ON e.rowid = f.rowid "
                "WHERE vocab_fts MATCH :q AND e.profile_id = :pid LIMIT 500"
            ),
            {"q": match, "pid": profile_id},
        ).all()
    except Exception as exc:  # noqa: BLE001 — no FTS table (fresh DB) → LIKE fallback
        _log.debug("vocab_fts unavailable (%s); falling back to LIKE", exc)
        return None
    return [str(r[0]) for r in rows]


# --------------------------------------------------------------------------------------
# Routes — entries
# --------------------------------------------------------------------------------------


@router.get("/entries", summary="Browse or search the bank")
def list_entries(
    query: str | None = Query(default=None, max_length=200),
    topic: str | None = None,
    status: str | None = None,
    pos: str | None = None,
    sort: Literal["recent", "oldest", "alpha", "due"] = "recent",
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    stmt = select(m.VocabEntry).where(m.VocabEntry.profile_id == profile_id)

    if status:
        wanted = [s.strip() for s in status.split(",") if s.strip()]
        bad = [s for s in wanted if s not in STATUS_VALUES]
        if bad:
            raise ApiError(422, "validation_error", f"unknown status {bad[0]!r}")
        stmt = stmt.where(m.VocabEntry.status.in_(wanted))
    if pos:
        stmt = stmt.where(m.VocabEntry.pos == pos)
    if topic:
        stmt = stmt.where(m.VocabEntry.topic_tags_json.like(f'%"{topic}"%'))
    if query:
        ids = _fts_ids(session, profile_id, query)
        if ids is not None:
            stmt = stmt.where(m.VocabEntry.id.in_(ids or ["\x00none"]))
        else:
            like = f"%{query.strip().lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(m.VocabEntry.headword).like(like),
                    func.lower(m.VocabEntry.lemma).like(like),
                    func.lower(m.VocabEntry.definition).like(like),
                )
            )

    parts = _decode_cursor(cursor)
    if sort == "alpha":
        key = func.lower(m.VocabEntry.headword)
        stmt = stmt.order_by(key.asc(), m.VocabEntry.id.asc())
        if parts:
            stmt = stmt.where(tuple_(key, m.VocabEntry.id) > tuple_(parts[0], parts[1]))
    elif sort == "oldest":
        stmt = stmt.order_by(m.VocabEntry.created_at.asc(), m.VocabEntry.id.asc())
        if parts:
            stmt = stmt.where(
                tuple_(m.VocabEntry.created_at, m.VocabEntry.id) > tuple_(parts[0], parts[1])
            )
    elif sort == "due":
        stmt = stmt.join(m.SrsCard, m.SrsCard.entry_id == m.VocabEntry.id).order_by(
            m.SrsCard.due_at.asc(), m.VocabEntry.id.asc()
        )
        if parts:
            stmt = stmt.where(tuple_(m.SrsCard.due_at, m.VocabEntry.id) > tuple_(parts[0], parts[1]))
    else:
        stmt = stmt.order_by(m.VocabEntry.created_at.desc(), m.VocabEntry.id.desc())
        if parts:
            stmt = stmt.where(
                tuple_(m.VocabEntry.created_at, m.VocabEntry.id) < tuple_(parts[0], parts[1])
            )

    rows = session.execute(stmt.limit(limit + 1)).scalars().all()
    has_more = len(rows) > limit
    page = list(rows[:limit])
    items = _serialize_many(session, page)
    next_cursor = None
    if has_more and page:
        last = page[-1]
        if sort == "alpha":
            next_cursor = _encode_cursor([last.headword.lower(), last.id])
        elif sort == "due":
            card = sched.cards_for_entries(session, [last.id]).get(last.id)
            next_cursor = _encode_cursor([card.due_at if card else "", last.id])
        else:
            next_cursor = _encode_cursor([last.created_at, last.id])
    return {"items": items, "next_cursor": next_cursor}


@router.post("/entries", status_code=201, summary="Manual add — schedules immediately")
def add_entry(
    body: ManualAdd,
    background: BackgroundTasks,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    if not body.source.kind or body.source.kind == "manual":
        body.source.kind = "manual"
    result = ingest_item(
        session, profile_id, body, schedule=True, status_on_create="active"
    )
    entry = session.get(m.VocabEntry, result["id"])
    if entry is None:  # pragma: no cover — ingest_item always leaves the row present
        raise ApiError(500, "internal", "the entry disappeared during insert")
    # Commit before queueing enrichment: the background task uses its own connection and
    # would otherwise block on this transaction's write lock (and not see the new row).
    session.commit()
    if _needs_enrichment(entry):
        queue_enrichment(background, [entry.id])
    card = sched.cards_for_entries(session, [entry.id]).get(entry.id)
    return {**result, "entry": serialize_entry(entry, card)}


@router.get("/entries/{entry_id}", summary="One entry")
def get_entry(
    entry_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)
    card = sched.cards_for_entries(session, [entry.id]).get(entry.id)
    source = _first_sources(session, [entry.id]).get(entry.id)
    return serialize_entry(entry, card, source)


@router.patch("/entries/{entry_id}", summary="Edit fields / change status")
def patch_entry(
    entry_id: str,
    body: EntryPatch,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)
    now = _now()
    data = body.model_dump(exclude_unset=True)

    if data.get("pos") is not None:
        if data["pos"] not in POS_VALUES:
            raise ApiError(422, "validation_error", f"unknown pos {data['pos']!r}")
        entry.pos = data["pos"]
    if data.get("headword"):
        entry.headword = str(data["headword"]).strip()[:200]
        entry.lemma = ex.lemmatize(entry.headword, bool(entry.is_phrase))
    for field in ("ipa", "definition", "own_context_sentence", "cefr_level"):
        if field in data:
            value = data[field]
            if field == "cefr_level" and value not in (
                None, "A1", "A2", "B1", "B2", "C1", "C2"
            ):
                raise ApiError(422, "validation_error", f"unknown cefr_level {value!r}")
            setattr(entry, field, (str(value).strip() if isinstance(value, str) else value) or None)
    if entry.definition is None:
        entry.definition = PENDING_DEFINITION
    if data.get("example_sentences") is not None:
        entry.example_sentences_json = _dumps(
            _clean_list(data["example_sentences"], MAX_EXAMPLES)
        )
    if data.get("collocations") is not None:
        entry.collocations_json = _dumps(_clean_list(data["collocations"], MAX_COLLOCATIONS))
    if data.get("topic_tags") is not None:
        entry.topic_tags_json = _dumps(_clean_list(data["topic_tags"], 6))

    if data.get("status"):
        new_status = str(data["status"])
        entry.status = new_status
        if new_status == "active":
            _ensure_card(session, entry, now)
        # `known` / `suspended` keep the card row: scheduling is suppressed by the queue
        # filter, so un-suspending restores the learner's history (§2 field notes).
    entry.updated_at = sched.iso(now)
    session.flush()
    card = sched.cards_for_entries(session, [entry.id]).get(entry.id)
    return serialize_entry(entry, card, _first_sources(session, [entry.id]).get(entry.id))


@router.delete("/entries/{entry_id}", status_code=204, summary="Hard delete entry + card + logs")
def delete_entry(
    entry_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> Response:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)
    _delete_entry_rows(session, entry)
    return Response(status_code=204)


def _delete_entry_rows(session: Session, entry: m.VocabEntry) -> None:
    """Delete the entry and its dependents, plus any cached headword audio (11 §9)."""
    rel_path = entry.audio_ref or f"media/vocab/{entry.id}.wav"
    card_ids = (
        session.execute(select(m.SrsCard.id).where(m.SrsCard.entry_id == entry.id)).scalars().all()
    )
    if card_ids:
        session.execute(delete(m.SrsReviewLog).where(m.SrsReviewLog.card_id.in_(card_ids)))
        session.execute(delete(m.SrsCard).where(m.SrsCard.id.in_(card_ids)))
    session.execute(delete(m.VocabSource).where(m.VocabSource.entry_id == entry.id))
    session.delete(entry)
    try:
        session.execute(
            delete(m.MediaFile).where(
                m.MediaFile.rel_path == rel_path, m.MediaFile.kind == "vocab_audio"
            )
        )
        from bandready.config import get_settings

        path = get_settings().data_dir / rel_path
        if path.is_file():
            path.unlink()
    except Exception as exc:  # noqa: BLE001 — cache cleanup is best effort
        _log.debug("could not remove cached audio for %s: %s", entry.id, exc)


# --------------------------------------------------------------------------------------
# Routes — suggestion inbox (R2-5)
# --------------------------------------------------------------------------------------


@router.post("/suggestions", status_code=201, summary="Module-sourced batch ingest (no schedule)")
def post_suggestions(
    body: SuggestionBatch,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if not body.items:
        raise ApiError(422, "validation_error", "items must contain at least one term")
    profile_id = current_profile_id(session)
    now = _now()
    results: list[dict[str, Any]] = []
    for item in body.items:
        try:
            results.append(
                ingest_item(
                    session,
                    profile_id,
                    item,
                    schedule=False,
                    status_on_create="suggested",
                    now=now,
                )
            )
        except ApiError as exc:
            if exc.status != 422:
                raise
            _log.info("skipping unusable suggestion %r: %s", item.term, exc.detail)
    session.flush()
    return {"ids": [r["id"] for r in results], "items": results, "count": len(results)}


@router.get("/suggestions", summary="Suggestion inbox")
def list_suggestions(
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    stmt = (
        select(m.VocabEntry)
        .where(m.VocabEntry.profile_id == profile_id, m.VocabEntry.status == "suggested")
        .order_by(m.VocabEntry.created_at.desc(), m.VocabEntry.id.desc())
    )
    parts = _decode_cursor(cursor)
    if parts:
        stmt = stmt.where(
            tuple_(m.VocabEntry.created_at, m.VocabEntry.id) < tuple_(parts[0], parts[1])
        )
    rows = session.execute(stmt.limit(limit + 1)).scalars().all()
    has_more = len(rows) > limit
    page = list(rows[:limit])
    next_cursor = (
        _encode_cursor([page[-1].created_at, page[-1].id]) if has_more and page else None
    )
    return {
        "items": _serialize_many(session, page),
        "next_cursor": next_cursor,
        "total": session.execute(
            select(func.count())
            .select_from(m.VocabEntry)
            .where(m.VocabEntry.profile_id == profile_id, m.VocabEntry.status == "suggested")
        ).scalar_one(),
    }


def _accept(session: Session, entry: m.VocabEntry, now: datetime) -> dict[str, Any]:
    entry.status = "active"
    card = _ensure_card(session, entry, now, reset_due=True)
    entry.updated_at = sched.iso(now)
    return serialize_entry(entry, card, _first_sources(session, [entry.id]).get(entry.id))


@router.post("/suggestions/{entry_id}/accept", summary="Accept → active + scheduled now")
def accept_suggestion(
    entry_id: str,
    background: BackgroundTasks,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)
    doc = _accept(session, entry, _now())
    session.commit()  # see add_entry: enrichment runs on its own connection
    if _needs_enrichment(entry):
        queue_enrichment(background, [entry.id])
    return {"entry": doc}


@router.post("/suggestions/{entry_id}/dismiss", status_code=204, summary="Dismiss → deleted")
def dismiss_suggestion(
    entry_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> Response:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)
    _delete_entry_rows(session, entry)
    return Response(status_code=204)


@router.post("/suggestions/accept-all", summary="Accept the whole inbox (or a subset)")
def accept_all(
    background: BackgroundTasks,
    body: AcceptAll = Body(default_factory=AcceptAll),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    now = _now()
    stmt = select(m.VocabEntry).where(
        m.VocabEntry.profile_id == profile_id, m.VocabEntry.status == "suggested"
    )
    if body.ids:
        stmt = stmt.where(m.VocabEntry.id.in_(body.ids))
    entries = list(session.execute(stmt).scalars().all())
    for entry in entries:
        _accept(session, entry, now)
    session.commit()  # see add_entry: enrichment runs on its own connection
    queue_enrichment(background, [e.id for e in entries if _needs_enrichment(e)])
    return {"accepted": len(entries), "ids": [e.id for e in entries]}


# --------------------------------------------------------------------------------------
# Routes — seed decks (§6.2)
# --------------------------------------------------------------------------------------


def _deck_rows(session: Session) -> list[Any]:
    return session.execute(
        select(
            m.VocabPackEntry.deck,
            func.count().label("entries"),
            func.min(m.VocabPackEntry.pack_id).label("pack_id"),
        )
        .where(m.VocabPackEntry.retired == 0)
        .group_by(m.VocabPackEntry.deck)
        .order_by(m.VocabPackEntry.deck)
    ).all()


def _deck_kind(deck_id: str) -> str:
    if deck_id.startswith("topic-"):
        return "topic"
    if deck_id.startswith("awl"):
        return "awl"
    if deck_id.startswith("upgrade"):
        return "upgrade-pairs"
    return "other"


def _deck_label(deck_id: str) -> str:
    return deck_id.replace("topic-", "").replace("-", " ").strip().title()


def _decks_payload(session: Session, profile_id: str) -> list[dict[str, Any]]:
    decks = _deck_rows(session)
    owned = {
        (lemma, pos)
        for lemma, pos in session.execute(
            select(m.VocabEntry.lemma, m.VocabEntry.pos).where(
                m.VocabEntry.profile_id == profile_id
            )
        ).all()
    }
    out: list[dict[str, Any]] = []
    for deck_id, entries, pack_id in decks:
        pairs = session.execute(
            select(m.VocabPackEntry.lemma, m.VocabPackEntry.pos).where(
                m.VocabPackEntry.deck == deck_id, m.VocabPackEntry.retired == 0
            )
        ).all()
        in_bank = sum(1 for lemma, pos in pairs if (lemma, pos) in owned)
        out.append(
            {
                "deck_id": deck_id,
                "pack_id": pack_id,
                "label": _deck_label(deck_id),
                "kind": _deck_kind(deck_id),
                "entries": int(entries),
                "in_bank": in_bank,
                "opted_in": in_bank >= int(entries) and int(entries) > 0,
            }
        )
    return out


@router.get("/decks", summary="Seed decks available to opt in")
def list_decks(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    items = _decks_payload(session, profile_id)
    return {"items": items, "count": len(items)}


@router.get("/packs", summary="Seed decks (18 §4.11 alias of /decks)")
def list_packs(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return list_decks(_=None, session=session)


def _opt_in(session: Session, profile_id: str, deck_id: str) -> dict[str, Any]:
    rows = (
        session.execute(
            select(m.VocabPackEntry).where(
                m.VocabPackEntry.deck == deck_id, m.VocabPackEntry.retired == 0
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        raise ApiError(404, "not_found", f"no seed deck {deck_id!r} is installed")
    now = _now()
    imported = 0
    merged_count = 0
    for row in rows:
        payload = _loads(row.entry_json, {})
        item = IngestItem(
            term=str(payload.get("headword") or row.lemma),
            pos=payload.get("pos") or row.pos,
            definition=payload.get("definition"),
            ipa=payload.get("ipa"),
            cefr_level=payload.get("cefr_level"),
            sentence_context=payload.get("own_context_sentence"),
            example_sentences=payload.get("example_sentences") or [],
            collocations=payload.get("collocations") or [],
            topic_tags=payload.get("topic_tags") or [],
            source=SourceRef(kind="seed", item_id=row.id, detail=f"deck:{deck_id}"),
        )
        result = ingest_item(
            session, profile_id, item, schedule=True, status_on_create="active", now=now
        )
        if result["merged"]:
            merged_count += 1
        else:
            imported += 1
    session.flush()
    return {
        "deck_id": deck_id,
        "imported": imported,
        "merged": merged_count,
        "total": len(rows),
    }


@router.post("/decks/{deck_id}/opt-in", summary="Copy a seed deck into the bank (schedules now)")
def opt_in_deck(
    deck_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    return _opt_in(session, profile_id, deck_id)


@router.post("/packs/{pack_id}/import", summary="Seed-deck opt-in (18 §4.11 alias)")
def import_pack(
    pack_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    return _opt_in(session, profile_id, pack_id)


# --------------------------------------------------------------------------------------
# Routes — LLM helpers and stats
# --------------------------------------------------------------------------------------


@router.post("/check-sentence", summary="LLM check of a use-in-sentence answer (§5.2.3)")
async def check_sentence_route(
    body: CheckSentence,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, body.entry_id)
    return await ex.check_sentence(
        entry.headword, body.sentence, pos=entry.pos, definition=entry.definition
    )


@router.post("/lookup", summary="LLM enrichment preview without saving")
async def lookup(
    body: LookupRequest,
    _: None = Depends(require_auth),
) -> dict[str, Any]:
    from bandready.providers.llm import chat_json

    word = ex.normalize_term(body.word)
    if not word:
        raise ApiError(422, "validation_error", "word is empty")
    payload = await chat_json(
        [
            {
                "role": "user",
                "content": ENRICH_PROMPT.format(
                    word=word, context=body.sentence or "", topics=", ".join(TOPIC_TAGS)
                ),
            }
        ],
        mock_kind="generic",
        temperature=0.2,
    )
    if payload.get("error") == "not_a_word":
        return {"word": word, "found": False, "preview": None}
    pos = str(payload.get("pos") or "").strip()
    return {
        "word": word,
        "lemma": ex.lemmatize(word),
        "found": True,
        "preview": {
            "headword": word,
            "ipa": (f"/{str(payload['ipa']).strip('/')}/" if payload.get("ipa") else None),
            "pos": pos if pos in POS_VALUES else "other",
            "definition": str(payload.get("definition") or "").strip() or PENDING_DEFINITION,
            "example_sentences": _clean_list(payload.get("example_sentences"), MAX_EXAMPLES),
            "collocations": _clean_list(payload.get("collocations"), MAX_COLLOCATIONS),
            "cefr_level": str(payload.get("cefr_level") or "").strip().upper() or None,
            "topic_tags": [t for t in _clean_list(payload.get("topic_tags"), 2) if t in TOPIC_TAGS],
        },
    }


@router.get("/stats", summary="Vocabulary + SRS dashboard payload (§8)")
def vocab_stats(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    return sched.stats(session, profile_id)


# --------------------------------------------------------------------------------------
# Speaking a sentence instead of typing it
# --------------------------------------------------------------------------------------


def _speech_tmp_path() -> Path:
    """A scratch file for one recording. Deleted in a finally — this is user voice data and
    it has no reason to outlive the request that graded it (11 §9 rule 1)."""
    root = Path(tempfile.gettempdir()) / "bandready-speak"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{ULID()}.wav"


@router.post("/speak", summary="Say a use-in-sentence answer instead of typing it")
async def speak_sentence(
    wav: UploadFile = File(...),
    entry_id: str = Form(...),
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Transcribe a spoken answer, then grade it exactly as a typed one.

    A spoken answer is a typed answer that arrived by microphone: it becomes a string here
    and from this point runs through `check_sentence` unchanged, with the same prompt, the
    same offline-degrades-to-accepted behaviour and the same shape on the wire. There is no
    second grader, so there is nothing to drift.

    A refused recording — silence, room tone, one of Whisper's stock hallucinations — returns
    `graded: null` rather than a verdict. Marking somebody wrong when the microphone never
    heard them is worse than telling them nothing, and the two must be distinguishable.
    """
    profile_id = current_profile_id(session)
    entry = _entry_or_404(session, profile_id, entry_id)

    target = _speech_tmp_path()
    target.write_bytes(await wav.read())
    try:
        spoken = await answers.transcribe_answer(target)
    except answers.SpeechUnavailable as exc:
        raise ApiError(
            503,
            "speech_unavailable",
            "Speech-to-text is not set up on this machine, so a spoken answer cannot be "
            "checked. Type the sentence instead, or set up speech in Settings.",
        ) from exc
    finally:
        target.unlink(missing_ok=True)

    if not spoken.gradeable:
        return {**spoken.as_wire(), "graded": None}

    graded = await ex.check_sentence(
        entry.headword, spoken.transcript, pos=entry.pos, definition=entry.definition
    )
    return {**spoken.as_wire(), "graded": graded}
