"""`/api/v1/theory` — the browsable grammar reference.

Theory is the map; the practice module is the walking route. Everything here is readable the
moment the app opens: no prerequisite gate, no card, no learner state. That is not an
oversight, it is the requirement — a learner who does not yet know what a modal *is* has to
be able to survey the language before being asked to practise it, and a reference you must
earn access to is not a reference.

(The practice module's gate stays exactly as it is. It withholds *answers to practice items*
until a real attempt, which is a different thing from withholding an explanation.)

Two endpoints, because a reference is used two ways: read straight through from chapter one,
or looked up when a specific question bites.

    GET /api/v1/theory/chapters       the index: chapters, each with its articles
    GET /api/v1/theory/articles/{id}  one article, with its neighbours for prev/next
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.db.engine import get_session
from bandready.server.deps import require_auth
from bandready.server.errors import ApiError

router = APIRouter(prefix="/api/v1/theory", tags=["theory"])

#: Chapter titles are learner-facing and plain — the same voice as the unit titles. Held here
#: rather than in the pack because they are navigation, not content, and a pack that ships
#: only half the chapters must still produce a sensible index.
CHAPTER_TITLES: dict[str, str] = {
    "thc_01": "The basics: what a sentence is made of",
    "thc_02": "Tenses: talking about time",
    "thc_03": "Modal verbs: how sure, how necessary, how allowed",
    "thc_04": "Questions and negatives",
    "thc_05": "Conditionals: if, and things that are not real",
    "thc_06": "Active and passive",
    "thc_07": "Nouns, articles and describing words",
    "thc_08": "Building longer sentences",
}

CHAPTER_BLURBS: dict[str, str] = {
    "thc_01": "Start here if you have never studied grammar. Every word is explained.",
    "thc_02": "All twelve tenses as one system, and which one to use when.",
    "thc_03": "can, must, should, might — what each one really claims.",
    "thc_04": "How to ask anything, including the question types learners get wrong.",
    "thc_05": "The four conditionals, mixed ones, and wishes.",
    "thc_06": "How to form the passive, and when it is the better choice.",
    "thc_07": "a, an, the, and the words that go in front of a noun.",
    "thc_08": "Relative clauses, reported speech, and joining ideas cleanly.",
}


def _decode(article: m.TheoryArticle) -> dict[str, Any]:
    raw = article.article_json
    body = json.loads(raw) if isinstance(raw, str) else (raw or {})
    return {
        "id": article.id,
        "chapter_id": article.chapter_id,
        "sequence_index": int(article.sequence_index),
        "title": article.title,
        "kind": article.kind,
        "cefr_level": article.cefr_level,
        **body,
    }


def _summary(article: m.TheoryArticle) -> dict[str, Any]:
    """The index entry — enough to choose an article, without shipping its whole body."""
    raw = article.article_json
    body = json.loads(raw) if isinstance(raw, str) else (raw or {})
    return {
        "id": article.id,
        "chapter_id": article.chapter_id,
        "sequence_index": int(article.sequence_index),
        "title": article.title,
        "kind": article.kind,
        "cefr_level": article.cefr_level,
        "also_called": body.get("also_called"),
        "one_line": body.get("one_line"),
        "estimated_read_minutes": body.get("estimated_read_minutes"),
    }


def _live(session: Session) -> list[m.TheoryArticle]:
    return list(
        session.execute(
            select(m.TheoryArticle)
            .where(m.TheoryArticle.retired == 0)
            .order_by(m.TheoryArticle.sequence_index)
        ).scalars()
    )


@router.get("/chapters", summary="The reference index — every chapter and its articles")
def list_chapters(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    articles = _live(session)

    by_chapter: dict[str, list[dict[str, Any]]] = {}
    for article in articles:
        by_chapter.setdefault(article.chapter_id, []).append(_summary(article))

    # Every chapter that has content, in id order, plus its title. An unknown chapter id
    # still lists — a pack may ship a chapter this build has no title for, and dropping it
    # would hide real content.
    chapters = [
        {
            "id": chapter_id,
            "title": CHAPTER_TITLES.get(chapter_id, chapter_id),
            "blurb": CHAPTER_BLURBS.get(chapter_id),
            "articles": sorted(items, key=lambda a: a["sequence_index"]),
            "count": len(items),
        }
        for chapter_id, items in sorted(by_chapter.items())
    ]

    return {
        "chapters": chapters,
        "article_count": len(articles),
        # The front door for a complete beginner: the very first article, whatever it is.
        "start_here": articles[0].id if articles else None,
    }


@router.get("/articles/{article_id}", summary="One article, with its neighbours")
def get_article(
    article_id: str,
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    articles = _live(session)
    index = next((i for i, a in enumerate(articles) if a.id == article_id), None)
    if index is None:
        raise ApiError(404, "not_found", f"no theory article with id {article_id!r}")

    article = articles[index]
    payload = _decode(article)
    payload["chapter_title"] = CHAPTER_TITLES.get(article.chapter_id, article.chapter_id)
    # Reading straight through is a first-class way to use this, so every article knows what
    # comes before and after it across the whole reference, not just inside its chapter.
    payload["previous"] = _summary(articles[index - 1]) if index > 0 else None
    payload["next"] = _summary(articles[index + 1]) if index + 1 < len(articles) else None
    payload["position"] = {"index": index + 1, "total": len(articles)}
    return payload
