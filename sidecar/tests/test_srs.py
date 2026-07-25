"""Vocabulary bank + SRS tests (08-vocabulary-srs.md, 18-api-contract.md §4.11).

The load-bearing behaviours proved here:

* FSRS progression — ``Good`` pushes the due date forward, ``Again`` pulls it back to a
  learning step, and lapses are counted only from the Review state.
* Ruling R2-5 — a module ingest creates **no** ``srs_cards`` row; only accept (or a manual
  add / deck opt-in) schedules.
* Dedup on ``(profile_id, lemma, pos)`` with the §3.3 merge rules.
* The six exercise types render and grade.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import run_migrations, session_scope
from bandready.srs import exercises as ex
from bandready.srs import scheduler as sched

PROFILE = "default"
AUTH = {"Authorization": "Bearer test-token"}


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migrated_db(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    data_dir = tmp_path_factory.mktemp("bandready-srs")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        from bandready.config import reset_settings_cache

        reset_settings_cache()
        db_engine.reset_engine()
        run_migrations()
        # Deterministic, network-free LLM for the use_in_sentence / lookup paths.
        from bandready.settings_store import patch_settings

        patch_settings(
            {"llm": {"preset": "mock_llm", "base_url": "mock://llm", "model": "mock-model-1"}}
        )
        try:
            yield data_dir
        finally:
            db_engine.reset_engine()
            reset_settings_cache()


@pytest.fixture()
def db(migrated_db: Path) -> Iterator[Path]:
    """A clean bank with the default profile present."""
    with session_scope() as s:
        s.execute(delete(m.SrsReviewLog))
        s.execute(delete(m.SrsCard))
        s.execute(delete(m.VocabSource))
        s.execute(delete(m.VocabEntry))
        s.execute(delete(m.VocabPackEntry))
        if s.get(m.Profile, PROFILE) is None:
            s.add(m.Profile(id=PROFILE, name="Test Learner", exam_format="academic"))
    yield migrated_db


@pytest.fixture()
def client(db: Path) -> Iterator[TestClient]:
    from bandready.server.app import create_app

    # base_url must be loopback: the auth middleware rejects any other Host header.
    with TestClient(create_app(), base_url="http://127.0.0.1:8710") as c:
        c.headers.update(AUTH)
        yield c


def make_entry(
    session,
    lemma: str = "mitigate",
    *,
    pos: str = "verb",
    status: str = "active",
    sentence: str = "Governments must act now to mitigate the effects of climate change.",
    collocations: tuple[str, ...] = ("mitigate the effects of", "mitigate risk"),
    schedule: bool = True,
) -> tuple[m.VocabEntry, m.SrsCard | None]:
    import json

    from ulid import ULID

    entry = m.VocabEntry(
        id=f"ve_{ULID()}",
        profile_id=PROFILE,
        headword=lemma,
        lemma=lemma,
        pos=pos,
        definition="to make something less harmful or severe",
        own_context_sentence=sentence,
        own_context_origin="learner",
        example_sentences_json=json.dumps(["Planting trees can mitigate urban heat."]),
        collocations_json=json.dumps(list(collocations)),
        topic_tags_json=json.dumps(["environment"]),
        cefr_level="C1",
        status=status,
        created_at=sched.iso(sched.now_utc()),
        updated_at=sched.iso(sched.now_utc()),
    )
    session.add(entry)
    session.flush()
    card = None
    if schedule:
        card = sched.create_card(entry.id)
        session.add(card)
        session.flush()
    return entry, card


# --------------------------------------------------------------------------------------
# Scheduler unit tests
# --------------------------------------------------------------------------------------


def test_good_pushes_due_forward_and_again_resets_it(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        _entry, card = make_entry(s)
        assert card is not None
        assert card.state == 0 and card.reps == 0

        # Rate Good repeatedly: the card graduates and the interval grows.
        moment = now
        graduated_interval = timedelta(0)
        for _ in range(4):
            card, log = sched.review(card, 3, moment, exercise_type="flip", elapsed_ms=1200)
            s.add(log)
            due = sched.parse_iso(card.due_at)
            assert due is not None
            assert due > moment, "a Good rating must schedule the card in the future"
            graduated_interval = due - moment
            moment = due + timedelta(seconds=1)

        assert card.state == 2, "four Good ratings graduate the card into Review"
        assert card.reps == 4
        assert card.lapses == 0
        assert graduated_interval > timedelta(days=1)

        # Again from Review: back to relearning, due within the relearning step.
        card, log = sched.review(card, 1, moment, exercise_type="cloze")
        s.add(log)
        again_interval = sched.parse_iso(card.due_at) - moment
        assert again_interval < graduated_interval
        assert again_interval <= timedelta(hours=1)
        assert card.state == 3, "Again from Review moves the card to Relearning"
        assert card.lapses == 1, "a lapse is counted only from the Review state"
        assert card.reps == 5


def test_review_mirrors_fsrs_state_into_columns_and_logs(db: Path) -> None:
    import json

    with session_scope() as s:
        _entry, card = make_entry(s)
        card, log = sched.review(card, 3, exercise_type="cloze", elapsed_ms=900)
        s.add(log)
        s.flush()
        blob = json.loads(card.fsrs_json)
        assert blob["state"] == card.state
        assert blob["due"].startswith(card.due_at[:16])
        assert card.stability is not None and card.difficulty is not None
        assert log.review_type == "cloze"
        assert log.state_before == 0
        assert log.elapsed_ms == 900


def test_lapse_not_counted_from_learning_state(db: Path) -> None:
    with session_scope() as s:
        _entry, card = make_entry(s)
        card, log = sched.review(card, 1)
        s.add(log)
        assert card.lapses == 0
        assert card.state in (1, 3)


def test_preview_intervals_are_ordered(db: Path) -> None:
    with session_scope() as s:
        _entry, card = make_entry(s)
        card, log = sched.review(card, 3)
        s.add(log)
        preview = sched.preview_intervals(card)
        assert set(preview) == {"again", "hard", "good", "easy"}
        assert preview["again"]["interval_s"] <= preview["good"]["interval_s"]
        assert preview["good"]["interval_s"] <= preview["easy"]["interval_s"]
        assert preview["good"]["label"]


def test_due_queue_respects_new_per_day_cap(db: Path) -> None:
    with session_scope() as s:
        for i in range(15):
            make_entry(s, lemma=f"word{i}", pos="noun", sentence=f"A word{i} sentence.")
    with session_scope() as s:
        queue = sched.due_queue(s, PROFILE, limit=50)
        # Default new-per-day is 10 (08 §7) even though 15 cards exist.
        assert len(queue) == 10
        tallies = sched.counts(s, PROFILE)
        assert tallies["new"] == 15
        assert tallies["new_available"] == 10


def test_due_queue_orders_relearning_and_learning_before_new(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        _e, due_card = make_entry(s, lemma="ubiquitous", pos="adj")
        due_card, log = sched.review(due_card, 3, now - timedelta(days=10))
        s.add(log)
        due_card.due_at = sched.iso(now - timedelta(days=1))  # overdue
        for i in range(3):
            make_entry(s, lemma=f"fresh{i}", pos="noun", sentence=f"A fresh{i} sentence.")
    with session_scope() as s:
        queue = sched.due_queue(s, PROFILE, limit=10)
        assert queue, "the overdue card plus the new ones should be queued"
        assert queue[0][1].lemma == "ubiquitous"


def test_stats_counts_retention_and_streak(db: Path) -> None:
    now = sched.now_utc()
    with session_scope() as s:
        _e, card = make_entry(s, lemma="pivotal", pos="adj")
        moment = now - timedelta(days=3)
        for _ in range(4):
            card, log = sched.review(card, 3, moment)
            s.add(log)
            moment = sched.parse_iso(card.due_at) + timedelta(seconds=1)
        card, log = sched.review(card, 3, now)  # a Review-state pass today
        s.add(log)
        card.stability = 30.0  # force maturity for the count assertion
    with session_scope() as s:
        payload = sched.stats(s, PROFILE)
        assert payload["counts"]["mature"] == 1
        assert payload["retention_30d"] == 1.0
        assert payload["streak"] >= 1
        assert len(payload["forecast"]) == 14
        assert payload["limits"]["new_per_day"] == 10


# --------------------------------------------------------------------------------------
# Exercises
# --------------------------------------------------------------------------------------


def test_lemmatize_and_dedup_key() -> None:
    assert ex.lemmatize("Mitigating") == "mitigate"
    assert ex.lemmatize("effects") == "effect"
    assert ex.lemmatize("studies") == "study"
    assert ex.lemmatize("a double-edged sword") == "a double-edged sword"
    assert ex.lemmatize("  In Terms Of. ") == "in terms of"


def test_cloze_blanks_inflected_occurrences() -> None:
    cloze = ex.cloze_from_sentence(
        "Governments must mitigate risk by mitigating emissions.", "mitigate", "mitigate"
    )
    assert cloze["blanks"] == 2
    assert "mitigate" not in cloze["masked"]
    assert "_____" in cloze["masked"]


def test_build_all_six_exercise_types(db: Path) -> None:
    with session_scope() as s:
        entry, card = make_entry(s)
        from bandready.server.routes.vocab import serialize_entry

        doc = serialize_entry(entry, card)
        for kind in ex.EXERCISE_TYPES:
            built = ex.build_exercise(kind, doc, doc["srs"], distractors=["reduce", "cause", "aid"])
            assert built["type"] in ex.EXERCISE_TYPES
            assert built["prompt"]
            assert isinstance(built["payload"], dict)


def test_grade_answer_rating_defaults(db: Path) -> None:
    with session_scope() as s:
        entry, card = make_entry(s)
        from bandready.server.routes.vocab import serialize_entry

        doc = serialize_entry(entry, card)
        cloze = ex.build_exercise("cloze", doc, doc["srs"])
        assert ex.grade_answer(cloze, "mitigate", entry=doc)["suggested_rating"] == 3
        wrong = ex.grade_answer(cloze, "ignore", entry=doc)
        assert wrong["suggested_rating"] == 1 and wrong["correct"] is False
        second_try = ex.grade_answer(cloze, "mitigate", entry=doc, attempts=2)
        assert second_try["suggested_rating"] == 2
        flip = ex.build_exercise("flip", doc, doc["srs"])
        assert ex.grade_answer(flip, "")["checked"] is False


@pytest.mark.anyio
async def test_check_sentence_uses_the_mock_llm(db: Path) -> None:
    result = await ex.check_sentence(
        "mitigate", "We must mitigate the effects.", pos="verb", definition="reduce severity"
    )
    assert {"acceptable", "issues", "better_version"} <= set(result)
    assert result["checked"] is True, "the mock LLM preset must answer without a network call"
    assert result["acceptable"] is True
    assert result["issues"] == []
    assert result["suggested_rating"] == 3


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"


# --------------------------------------------------------------------------------------
# HTTP: suggestion inbox (R2-5)
# --------------------------------------------------------------------------------------


def test_module_ingest_creates_no_srs_card_until_accepted(client: TestClient) -> None:
    payload = {
        "items": [
            {
                "term": "mitigate",
                "sentence_context": "We should mitigate the effects of pollution.",
                "source": {"kind": "speaking", "item_id": "sp_123"},
            }
        ]
    }
    res = client.post("/api/v1/vocab/suggestions", json=payload)
    assert res.status_code == 201, res.text
    entry_id = res.json()["ids"][0]

    with session_scope() as s:
        entry = s.get(m.VocabEntry, entry_id)
        assert entry is not None and entry.status == "suggested"
        cards = s.execute(select(m.SrsCard).where(m.SrsCard.entry_id == entry_id)).scalars().all()
        assert cards == [], "R2-5: module ingest must NOT schedule anything"

    inbox = client.get("/api/v1/vocab/suggestions").json()
    assert inbox["total"] == 1
    assert inbox["items"][0]["srs"] is None
    assert inbox["items"][0]["source"]["module"] == "speaking"

    # The queue is empty while the suggestion is unaccepted.
    assert client.get("/api/v1/srs/due").json()["items"] == []

    accepted = client.post(f"/api/v1/vocab/suggestions/{entry_id}/accept")
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["entry"]["status"] == "active"
    assert accepted.json()["entry"]["srs"]["state"] == "new"

    with session_scope() as s:
        cards = s.execute(select(m.SrsCard).where(m.SrsCard.entry_id == entry_id)).scalars().all()
        assert len(cards) == 1, "accept creates exactly one card"
        assert cards[0].due_at <= sched.iso(sched.now_utc())

    queue = client.get("/api/v1/srs/due").json()
    assert [i["entry_id"] for i in queue["items"]] == [entry_id]
    assert queue["counts"]["new"] == 1


def test_suggestions_dedup_on_profile_lemma_pos(client: TestClient) -> None:
    body = {
        "items": [
            {
                "term": "mitigating",
                "pos": "verb",
                "sentence_context": "Mitigating risk is essential.",
                "source": {"kind": "writing", "item_id": "wa_1"},
            },
            {
                "term": "Mitigate",
                "pos": "verb",
                "sentence_context": "We must mitigate the damage.",
                "source": {"kind": "reading", "item_id": "rd_1"},
            },
        ]
    }
    res = client.post("/api/v1/vocab/suggestions", json=body)
    assert res.status_code == 201, res.text
    items = res.json()["items"]
    assert items[0]["merged"] is False
    assert items[1]["merged"] is True, "the same lemma+pos must merge, not duplicate"
    assert items[0]["id"] == items[1]["id"]

    # A different POS for the same lemma is a distinct card (§3.1).
    other = client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "mitigate", "pos": "noun", "source": {"kind": "reading"}}]},
    )
    assert other.json()["items"][0]["merged"] is False
    assert other.json()["ids"][0] != items[0]["id"]

    with session_scope() as s:
        rows = (
            s.execute(select(m.VocabEntry).where(m.VocabEntry.lemma == "mitigate"))
            .scalars()
            .all()
        )
        assert {r.pos for r in rows} == {"verb", "noun"}
        sources = (
            s.execute(select(m.VocabSource).where(m.VocabSource.entry_id == items[0]["id"]))
            .scalars()
            .all()
        )
        assert len(sources) == 2, "every encounter appends provenance (§3.3)"
        entry = s.get(m.VocabEntry, items[0]["id"])
        assert entry.own_context_sentence == "Mitigating risk is essential."
        assert "We must mitigate the damage." in entry.example_sentences_json


def test_dismiss_deletes_the_entry(client: TestClient) -> None:
    res = client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "ephemeral", "source": {"kind": "reading"}}]},
    )
    entry_id = res.json()["ids"][0]
    assert client.post(f"/api/v1/vocab/suggestions/{entry_id}/dismiss").status_code == 204
    assert client.get(f"/api/v1/vocab/entries/{entry_id}").status_code == 404
    with session_scope() as s:
        assert s.get(m.VocabEntry, entry_id) is None


def test_accept_all(client: TestClient) -> None:
    client.post(
        "/api/v1/vocab/suggestions",
        json={
            "items": [
                {"term": "resilient", "source": {"kind": "listening"}},
                {"term": "scarcity", "source": {"kind": "reading"}},
            ]
        },
    )
    res = client.post("/api/v1/vocab/suggestions/accept-all", json={})
    assert res.status_code == 200, res.text
    assert res.json()["accepted"] == 2
    assert client.get("/api/v1/vocab/suggestions").json()["total"] == 0
    with session_scope() as s:
        assert len(s.execute(select(m.SrsCard)).scalars().all()) == 2


# --------------------------------------------------------------------------------------
# HTTP: manual add, browse, patch, delete
# --------------------------------------------------------------------------------------


def test_manual_add_schedules_immediately(client: TestClient) -> None:
    res = client.post(
        "/api/v1/vocab/entries",
        json={
            "term": "ubiquitous",
            "pos": "adj",
            "sentence_context": "Smartphones are ubiquitous in modern life.",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["merged"] is False
    assert body["entry"]["status"] == "active"
    assert body["entry"]["srs"] is not None, "manual adds schedule immediately (R2-5)"
    assert body["entry"]["audio_url"].endswith(".wav")

    listed = client.get("/api/v1/vocab/entries", params={"query": "ubiquitous"}).json()
    assert [i["id"] for i in listed["items"]] == [body["id"]]

    patched = client.patch(
        f"/api/v1/vocab/entries/{body['id']}", json={"status": "known", "cefr_level": "C1"}
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "known"
    assert client.get("/api/v1/srs/due").json()["items"] == [], "known cards leave the queue"

    assert client.delete(f"/api/v1/vocab/entries/{body['id']}").status_code == 204
    assert client.get(f"/api/v1/vocab/entries/{body['id']}").status_code == 404


def test_browse_filters_and_pagination(client: TestClient) -> None:
    for word in ("alpha", "beta", "gamma", "delta"):
        client.post(
            "/api/v1/vocab/entries",
            json={"term": word, "pos": "noun", "topic_tags": ["environment"]},
        )
    client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "omega", "source": {"kind": "reading"}}]},
    )

    active = client.get("/api/v1/vocab/entries", params={"status": "active"}).json()
    assert len(active["items"]) == 4
    suggested = client.get("/api/v1/vocab/entries", params={"status": "suggested"}).json()
    assert [i["headword"] for i in suggested["items"]] == ["omega"]
    by_topic = client.get("/api/v1/vocab/entries", params={"topic": "environment"}).json()
    assert len(by_topic["items"]) == 4

    page1 = client.get(
        "/api/v1/vocab/entries", params={"limit": 2, "sort": "alpha", "status": "active"}
    ).json()
    assert [i["headword"] for i in page1["items"]] == ["alpha", "beta"]
    assert page1["next_cursor"]
    page2 = client.get(
        "/api/v1/vocab/entries",
        params={"limit": 2, "sort": "alpha", "status": "active", "cursor": page1["next_cursor"]},
    ).json()
    assert [i["headword"] for i in page2["items"]] == ["delta", "gamma"]


def test_deck_opt_in_copies_and_schedules(client: TestClient) -> None:
    import json

    from ulid import ULID

    with session_scope() as s:
        for word, definition in (("biodegradable", "able to decay naturally"),):
            s.add(
                m.VocabPackEntry(
                    id=f"vp_{ULID()}",
                    lemma=word,
                    pos="adj",
                    deck="topic-environment",
                    entry_json=json.dumps(
                        {
                            "headword": word,
                            "pos": "adj",
                            "definition": definition,
                            "own_context_sentence": "Shops now offer biodegradable packaging.",
                            "collocations": ["biodegradable packaging"],
                            "topic_tags": ["environment"],
                            "cefr_level": "B2",
                        }
                    ),
                    source="pack",
                    pack_id="org.bandready.core",
                )
            )

    decks = client.get("/api/v1/vocab/decks").json()
    assert decks["items"][0]["deck_id"] == "topic-environment"
    assert decks["items"][0]["entries"] == 1
    assert decks["items"][0]["opted_in"] is False

    res = client.post("/api/v1/vocab/decks/topic-environment/opt-in")
    assert res.status_code == 200, res.text
    assert res.json()["imported"] == 1

    with session_scope() as s:
        entry = s.execute(
            select(m.VocabEntry).where(m.VocabEntry.lemma == "biodegradable")
        ).scalar_one()
        assert entry.status == "active"
        assert entry.own_context_origin == "seed"
        card = s.execute(
            select(m.SrsCard).where(m.SrsCard.entry_id == entry.id)
        ).scalar_one_or_none()
        assert card is not None, "seed opt-in schedules immediately (§6.2)"

    assert client.get("/api/v1/vocab/decks").json()["items"][0]["opted_in"] is True
    assert client.post("/api/v1/vocab/decks/nope/opt-in").status_code == 404


# --------------------------------------------------------------------------------------
# HTTP: review flow
# --------------------------------------------------------------------------------------


def test_review_route_schedules_and_logs(client: TestClient) -> None:
    created = client.post(
        "/api/v1/vocab/entries",
        json={
            "term": "mitigate",
            "pos": "verb",
            "sentence_context": "We must mitigate the effects of climate change.",
        },
    ).json()
    queue = client.get("/api/v1/srs/due", params={"limit": 5}).json()
    item = queue["items"][0]
    assert item["entry_id"] == created["id"]
    assert item["exercise"]["type"] in ex.EXERCISE_TYPES
    assert set(item["intervals"]) == {"again", "hard", "good", "easy"}

    before_due = item["entry"]["srs"]["due"]
    res = client.post(
        "/api/v1/srs/review",
        json={
            "card_id": item["card_id"],
            "rating": 3,
            "exercise_type": "flip",
            "elapsed_ms": 4200,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["card"]["due"] > before_due, "Good must push the due date forward"
    assert body["card"]["reps"] == 1
    assert body["next_intervals"]["good"]["label"]

    with session_scope() as s:
        logs = s.execute(select(m.SrsReviewLog)).scalars().all()
        assert len(logs) == 1
        assert logs[0].review_type == "flip" and logs[0].rating == 3

    stats = client.get("/api/v1/srs/stats").json()
    assert stats["reviews_today"] == 1
    assert stats["streak"] == 1

    # An unknown card id is a clean 404 in the standard envelope.
    missing = client.post("/api/v1/srs/review", json={"card_id": "sc_nope", "rating": 3})
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


def test_session_route_composes_a_chunk(client: TestClient) -> None:
    for i in range(4):
        client.post(
            "/api/v1/vocab/entries",
            json={
                "term": f"lexis{i}",
                "pos": "noun",
                "sentence_context": f"The lexis{i} appears in academic writing.",
            },
        )
    res = client.get("/api/v1/srs/session", params={"count": 3, "seed": 7})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["size"] == 3
    assert sum(body["mix"].values()) == 3
    assert body["counts"]["new"] == 4
    assert body["remaining_after"] >= 1
    assert client.get("/api/v1/srs/queue", params={"limit": 2}).json()["items"]


def test_check_sentence_route(client: TestClient) -> None:
    created = client.post("/api/v1/vocab/entries", json={"term": "pivotal", "pos": "adj"}).json()
    res = client.post(
        "/api/v1/vocab/check-sentence",
        json={"entry_id": created["id"], "sentence": "Her role was pivotal in the project."},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["checked"] is True and body["acceptable"] is True
    assert body["issues"] == [] and body["better_version"] == ""

    assert client.post(
        "/api/v1/vocab/check-sentence", json={"entry_id": "ve_nope", "sentence": "x"}
    ).status_code == 404


def test_known_word_misused_flips_back_to_active(client: TestClient) -> None:
    """§3.3's one documented exception: a misuse from speaking/writing reschedules a
    'known' card. Every other re-encounter leaves scheduling untouched."""
    created = client.post(
        "/api/v1/vocab/entries", json={"term": "mitigate", "pos": "verb"}
    ).json()
    client.patch(f"/api/v1/vocab/entries/{created['id']}", json={"status": "known"})

    # A plain re-encounter does not resurrect it.
    client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "mitigate", "pos": "verb", "source": {"kind": "reading"}}]},
    )
    assert client.get(f"/api/v1/vocab/entries/{created['id']}").json()["status"] == "known"

    # A misuse reported by speaking does.
    client.post(
        "/api/v1/vocab/suggestions",
        json={
            "items": [
                {
                    "term": "mitigate",
                    "pos": "verb",
                    "misuse": True,
                    "sentence_context": "I mitigate to school every day.",
                    "source": {"kind": "speaking", "item_id": "sp_9"},
                }
            ]
        },
    )
    doc = client.get(f"/api/v1/vocab/entries/{created['id']}").json()
    assert doc["status"] == "active"
    assert doc["srs"]["due"] <= sched.iso(sched.now_utc())
    assert [i["entry_id"] for i in client.get("/api/v1/srs/due").json()["items"]] == [
        created["id"]
    ]


def test_stats_lookup_and_packs_routes(client: TestClient) -> None:
    client.post("/api/v1/vocab/entries", json={"term": "scarcity", "pos": "noun"})

    stats = client.get("/api/v1/vocab/stats").json()
    assert stats["counts"]["active"] == 1
    assert stats["sources"][0]["module"] == "manual"
    assert stats["sources"][0]["pct"] == 100

    preview = client.post(
        "/api/v1/vocab/lookup", json={"word": "mitigate", "sentence": "We must mitigate risk."}
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["lemma"] == "mitigate"
    assert body["found"] is True and isinstance(body["preview"], dict)

    packs = client.get("/api/v1/vocab/packs").json()
    assert packs["items"] == [], "no seed decks are installed in this fixture"


def test_accept_runs_enrichment_after_the_commit(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The async enrichment upgrade (§3.2) must see the committed row and fill the gaps."""
    import bandready.providers.llm as llm_mod

    async def fake_chat_json(messages, mock_kind=None, **kw):
        assert "lexicographer" in messages[0]["content"]
        return {
            "ipa": "ˈmɪtɪɡeɪt",
            "pos": "verb",
            "definition": "to make something less harmful or severe",
            "example_sentences": ["Planting trees can mitigate urban heat."],
            "collocations": ["mitigate risk", "mitigate the effects of"],
            "cefr_level": "C1",
            "topic_tags": ["environment"],
        }

    monkeypatch.setattr(llm_mod, "chat_json", fake_chat_json)

    res = client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "mitigate", "source": {"kind": "reading"}}]},
    )
    entry_id = res.json()["ids"][0]
    assert client.post(f"/api/v1/vocab/suggestions/{entry_id}/accept").status_code == 200

    doc = client.get(f"/api/v1/vocab/entries/{entry_id}").json()
    assert doc["ipa"] == "/ˈmɪtɪɡeɪt/"
    assert doc["definition"] == "to make something less harmful or severe"
    assert doc["collocations"] == ["mitigate risk", "mitigate the effects of"]
    assert doc["cefr_level"] == "C1"
    assert doc["topic_tags"] == ["environment"]
    assert doc["srs"] is not None


def test_routes_are_registered() -> None:
    from bandready.server.app import create_app, route_paths

    paths = route_paths(create_app())
    for path in (
        "/api/v1/vocab/entries",
        "/api/v1/vocab/suggestions",
        "/api/v1/vocab/suggestions/{entry_id}/accept",
        "/api/v1/vocab/decks",
        "/api/v1/srs/due",
        "/api/v1/srs/review",
        "/api/v1/srs/stats",
        "/api/v1/srs/session",
    ):
        assert path in paths, f"{path} is not registered"
