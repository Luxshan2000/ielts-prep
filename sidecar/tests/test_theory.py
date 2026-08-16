"""The browsable reference — `/api/v1/theory`.

The route had no test of its own, which is how the reading order stayed broken: the pack
numbers ``sequence_index`` per chapter (chapter 2 and chapter 7 both run 21–35, chapter 6
sits below chapter 4), so ordering the whole reference by that number alone interleaved the
chapters. Next stepped from a tense to a noun article and back, and "12 of 99" counted along
that scrambled order.

What is proved here:

* nothing is gated — a learner with no history at all can open any article, which is the one
  requirement the reference exists to meet;
* a straight read through visits all 99 articles, in chapter order, entering each chapter
  once;
* the index carries the learner's own words for an article, because the titles are written
  as answers and searching for "present simple" has to find something.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from bandready.server.jobs import job_manager

TOKEN = "test-token-0123456789"
BASE = "http://127.0.0.1"


def _reset_process_state() -> None:
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine
    from bandready.security import secrets as secrets_mod
    from bandready.settings_store import invalidate_cache

    reset_settings_cache()
    invalidate_cache()
    secrets_mod.reset_key_cache()
    db_engine.reset_engine()


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("bandready-theory")


@pytest.fixture(scope="module")
def app(data_dir: Path) -> Iterator[Any]:
    from bandready.server.app import create_app, run_startup

    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        _reset_process_state()
        application = create_app()
        run_startup()
        try:
            yield application
        finally:
            job_manager.clear()
    _reset_process_state()


@pytest.fixture
async def client(app: Any) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url=BASE,
        headers={"Authorization": f"Bearer {TOKEN}"},
    ) as ac:
        yield ac


async def test_index_lists_every_chapter_and_a_way_in(client: httpx.AsyncClient) -> None:
    index = (await client.get("/api/v1/theory/chapters")).json()

    assert index["article_count"] == sum(c["count"] for c in index["chapters"])
    assert index["start_here"], "a complete beginner needs a front door"
    assert [c["id"] for c in index["chapters"]] == sorted(c["id"] for c in index["chapters"])
    for chapter in index["chapters"]:
        assert chapter["title"] != chapter["id"], f"{chapter['id']} shows its id as its title"
        assert chapter["articles"], "a chapter with no articles should not be listed"


async def test_the_index_carries_the_words_a_learner_would_search_with(
    client: httpx.AsyncClient,
) -> None:
    """Titles are answers, so the search terms have to travel with them."""
    index = (await client.get("/api/v1/theory/chapters")).json()
    articles = [a for c in index["chapters"] for a in c["articles"]]

    assert all("aliases" in a for a in articles)
    with_terms = [a for a in articles if a["aliases"] or a["question_in_learner_words"]]
    assert len(with_terms) == len(articles)

    # The concrete case: nothing in this article's title or one-liner says "present simple".
    def searchable(a: dict[str, Any]) -> str:
        parts = [a["title"], a["also_called"], a["one_line"], a["question_in_learner_words"]]
        return " ".join([*(p for p in parts if p), *a["aliases"]]).lower()

    assert any("present simple" in searchable(a) for a in articles)


async def test_reading_straight_through_stays_in_one_chapter_at_a_time(
    client: httpx.AsyncClient,
) -> None:
    index = (await client.get("/api/v1/theory/chapters")).json()
    total = index["article_count"]

    seen: list[str] = []
    chapters: list[str] = []
    current: str | None = index["start_here"]
    while current is not None:
        article = (await client.get(f"/api/v1/theory/articles/{current}")).json()
        seen.append(article["id"])
        if not chapters or chapters[-1] != article["chapter_id"]:
            chapters.append(article["chapter_id"])
        assert article["position"] == {"index": len(seen), "total": total}
        current = article["next"]["id"] if article["next"] else None

    assert len(seen) == total, "Next must reach every article"
    assert len(set(seen)) == total
    # Each chapter is entered once and finished before the next one starts.
    assert chapters == sorted(set(chapters))
    assert len(chapters) == len(index["chapters"])


async def test_previous_and_next_agree(client: httpx.AsyncClient) -> None:
    index = (await client.get("/api/v1/theory/chapters")).json()
    first = (await client.get(f"/api/v1/theory/articles/{index['start_here']}")).json()
    assert first["previous"] is None

    second = (await client.get(f"/api/v1/theory/articles/{first['next']['id']}")).json()
    assert second["previous"]["id"] == first["id"]


async def test_nothing_is_gated(client: httpx.AsyncClient) -> None:
    """No learner state exists in this fixture, and every article still opens."""
    index = (await client.get("/api/v1/theory/chapters")).json()
    last_chapter = index["chapters"][-1]
    last_article = last_chapter["articles"][-1]["id"]

    resp = await client.get(f"/api/v1/theory/articles/{last_article}")
    assert resp.status_code == 200
    assert resp.json()["body"], "the last article of the last chapter opens on day one"


async def test_an_unknown_article_is_a_clean_404(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/theory/articles/th_not_a_real_article")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


async def test_the_reference_needs_auth(app: Any) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as anon:
        assert (await anon.get("/api/v1/theory/chapters")).status_code == 401
