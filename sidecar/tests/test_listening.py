"""Listening module tests (07-listening-module.md, 18 §4.10/§4.16).

Three things are worth pinning down and all three run with no TTS engine and no network,
using the hidden mock providers (``BANDREADY_ENABLE_MOCK=1``):

1. the **stitch maths** — line offsets and total duration must come from sample counts,
   because ``timing.json`` is what the practice player seeks with;
2. the **media route** — ticket auth (401 without one) and HTTP ``Range`` (206) so the
   ``<audio>`` element can seek at all;
3. the **submit -> score** flow — deterministic, spelling-strict scoring and the
   raw-to-band conversion.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from bandready import settings_store
from bandready.audio import stitch as stitch_mod
from bandready.audio import tts_render
from bandready.config import reset_settings_cache
from bandready.content import generate_listening as gen
from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import session_scope
from bandready.server.app import create_app
from bandready.server.routes import listening as routes
from bandready.server.tickets import issue_ticket

TOKEN = "listening-test-token"
RATE = stitch_mod.TARGET_RATE


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


def _reset_caches() -> None:
    reset_settings_cache()
    settings_store.invalidate_cache()
    db_engine.reset_engine()


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    directory = tmp_path_factory.mktemp("bandready-listening")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(directory))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        _reset_caches()
        try:
            yield directory
        finally:
            _reset_caches()


@pytest.fixture(scope="module")
def client(data_dir: Path) -> Iterator[TestClient]:
    app = create_app()
    # Host must look like loopback or the DNS-rebinding guard answers 403 (auth.py).
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        # Select the hidden mock providers through the normal settings document (R2-19).
        settings_store.patch_settings(
            {
                "llm": {
                    "preset": "mock_llm",
                    "engine": "mock",
                    "base_url": "mock://llm",
                    "model": "mock-model-1",
                },
                "tts": {
                    "preset": "mock_tts",
                    "engine": "mock",
                    "base_url": "mock://tts",
                    "voice": "mock_voice",
                },
            }
        )
        test_client.headers["Authorization"] = f"Bearer {TOKEN}"
        yield test_client


@pytest.fixture(scope="module")
def anon(data_dir: Path) -> Iterator[TestClient]:
    """A client with no bearer header — what an ``<audio>`` element looks like."""
    with TestClient(create_app(), base_url="http://127.0.0.1:8710") as test_client:
        yield test_client


def _script_document(part: int, q_start: int) -> dict[str, Any]:
    lines: list[dict[str, Any]] = [
        {
            "speaker": "narrator",
            "text": (
                f"Part {part}. You will hear a short recording. First, you have thirty "
                f"seconds to look at questions {q_start} to {q_start + 4}."
            ),
            "pause_after_ms": 30000,
        }
    ]
    questions: list[dict[str, Any]] = []
    for offset in range(10):
        number = q_start + offset
        lines.append(
            {
                "speaker": "s1" if offset % 2 == 0 else "s2",
                "text": f"So for number {number}, the word you need is answer{number}.",
                "pause_after_ms": 300,
            }
        )
        questions.append(
            {
                "n": number,
                "type": "note_completion",
                "instruction": "Write ONE WORD for each answer.",
                "word_limit": {"words": 1, "numbers": 0},
                "prompt": f"Question {number}: ______",
                "answers": [[f"answer{number}"]],
                "cue_line_index": offset + 1,
            }
        )
    return {
        "schema_version": 1,
        "part": part,
        "title": f"Seeded part {part}",
        "scenario": "A seeded recording used by the test-suite.",
        "accent_set": "uk" if part != 2 else "us",
        "target_band": 6.0,
        "speakers": [
            {"id": "narrator", "name": "Narrator", "role": "narrator", "accent": "uk"},
            {"id": "s1", "name": "Speaker one", "role": "female_1", "accent": "uk"},
            {"id": "s2", "name": "Speaker two", "role": "male_1", "accent": "uk"},
        ],
        "lines": lines,
        "questions": questions,
    }


@pytest.fixture(scope="module")
def seeded(client: TestClient) -> dict[str, Any]:
    """A full 4-part / 40-question test in the database."""
    documents = [_script_document(part, (part - 1) * 10 + 1) for part in (1, 2, 3, 4)]
    with session_scope() as session:
        script_ids = [
            gen.persist_script(session, document, source="user") for document in documents
        ]
        test_id = "lt_seeded_test"
        session.add(
            m.ListeningTest(
                id=test_id,
                title="Seeded listening test",
                p1_id=script_ids[0],
                p2_id=script_ids[1],
                p3_id=script_ids[2],
                p4_id=script_ids[3],
                source="user",
            )
        )
    return {"test_id": test_id, "script_ids": script_ids, "documents": documents}


@pytest.fixture(scope="module")
def rendered(client: TestClient, seeded: dict[str, Any]) -> dict[str, Any]:
    """Part 1 rendered to a real WAV through the mock TTS provider."""
    document = seeded["documents"][0]
    result = asyncio.run(
        tts_render.render_script(document, script_id=seeded["script_ids"][0])
    )
    return result


# --------------------------------------------------------------------------------------
# 1. Stitch offset + duration maths
# --------------------------------------------------------------------------------------


def test_clamp_pause_bounds() -> None:
    assert stitch_mod.clamp_pause(-5) == 0
    assert stitch_mod.clamp_pause(300) == 300
    assert stitch_mod.clamp_pause(999_999) == stitch_mod.MAX_PAUSE_MS
    assert stitch_mod.clamp_pause(None) == 0
    assert stitch_mod.clamp_pause("450") == 450


def test_stitch_offsets_are_sample_accurate() -> None:
    # Three one-second lines with 500 ms / 30 s / 0 ms trailing pauses.
    pieces = [
        (np.ones(RATE, dtype=np.float32) * 0.5, RATE, 500),
        (np.ones(RATE, dtype=np.float32) * 0.5, RATE, 30_000),
        (np.ones(RATE, dtype=np.float32) * 0.5, RATE, 0),
    ]
    result = stitch_mod.stitch(pieces, normalize=False)

    assert [(t.start_ms, t.end_ms) for t in result.timings] == [
        (0, 1000),
        (1500, 2500),
        (32500, 33500),
    ]
    assert result.duration_ms == 33_500
    assert result.audio.size == stitch_mod.ms_to_samples(33_500, RATE)
    assert result.sample_rate == RATE
    # The silences really are silent, and the speech really is not.
    assert float(np.max(np.abs(result.audio[RATE : RATE + 100]))) == 0.0
    assert float(np.max(np.abs(result.audio[:100]))) > 0.0


def test_stitch_matches_the_predicted_duration_and_resamples() -> None:
    pieces = [
        (np.ones(16_000, dtype=np.float32) * 0.2, 16_000, 250),  # 1 s @ 16 kHz
        (np.ones(48_000, dtype=np.float32) * 0.2, 48_000, 0),  # 1 s @ 48 kHz
    ]
    result = stitch_mod.stitch(pieces, normalize=False)
    assert result.duration_ms == stitch_mod.expected_duration_ms(pieces)
    assert result.duration_ms == 2250
    assert result.timings[1].start_ms == 1250


def test_stitch_pause_clamping_is_applied_to_offsets() -> None:
    pieces = [
        (np.zeros(RATE, dtype=np.float32), RATE, 10**9),
        (np.zeros(RATE, dtype=np.float32), RATE, 0),
    ]
    result = stitch_mod.stitch(pieces, normalize=False)
    assert result.timings[0].pause_after_ms == stitch_mod.MAX_PAUSE_MS
    assert result.timings[1].start_ms == 1000 + stitch_mod.MAX_PAUSE_MS


def test_timing_document_round_trips(tmp_path: Path) -> None:
    pieces = [(np.zeros(1200, dtype=np.float32), RATE, 100)]
    result = stitch_mod.stitch(pieces, normalize=False)
    path = tmp_path / "x.timing.json"
    stitch_mod.write_timing(path, result.timing_document())
    document = json.loads(path.read_text(encoding="utf-8"))
    assert document["lines"][0]["index"] == 0
    assert document["duration_ms"] == result.duration_ms
    assert result.start_ms_for_line(0) == 0


def test_normalize_loudness_leaves_silence_alone_and_caps_peaks() -> None:
    silence = np.zeros(1000, dtype=np.float32)
    assert float(np.max(np.abs(stitch_mod.normalize_loudness(silence)))) == 0.0
    loud = np.ones(1000, dtype=np.float32)
    peak = float(np.max(np.abs(stitch_mod.normalize_loudness(loud))))
    assert peak <= 10 ** (stitch_mod.PEAK_CEILING_DBFS / 20.0) + 1e-6


# --------------------------------------------------------------------------------------
# 2. Voice resolution + content hashing
# --------------------------------------------------------------------------------------


def test_voices_resolve_from_role_and_accent() -> None:
    document = _script_document(1, 1)
    assert tts_render.resolve_voices(document, "uk") == {
        "narrator": "bm_george",
        "s1": "bf_emma",
        "s2": "bm_lewis",
    }
    assert tts_render.resolve_voices(document, "us")["s1"] == "af_heart"
    # No Australian Kokoro voices exist: `au` falls back to British ones and says so.
    assert tts_render.resolve_voices(document, "au")["narrator"] == "bm_george"
    assert "British" in tts_render.accent_label("au")


def test_audio_hash_tracks_content_not_metadata() -> None:
    document = _script_document(1, 1)
    base = tts_render.script_audio_hash(document, "uk")
    assert base == tts_render.script_audio_hash(dict(document, title="renamed"), "uk")
    assert base != tts_render.script_audio_hash(document, "us")
    edited = json.loads(json.dumps(document))
    edited["lines"][1]["text"] = "something else entirely"
    assert base != tts_render.script_audio_hash(edited, "uk")


def test_mock_render_writes_wav_timing_and_media_row(
    rendered: dict[str, Any], seeded: dict[str, Any]
) -> None:
    audio_hash = rendered["audio_hash"]
    wav_path, timing_path = tts_render.listening_audio_paths(audio_hash)
    assert wav_path.exists() and wav_path.stat().st_size > 44  # more than a WAV header
    assert timing_path.exists()
    assert rendered["duration_ms"] > 30_000  # the 30 s preview pause is in there
    assert len(rendered["lines"]) == 11

    with session_scope() as session:
        media = session.get(m.MediaFile, audio_hash)
        assert media is not None
        assert media.kind == "listening_render"
        assert media.rel_path == f"listening/{audio_hash}.wav"
        script = session.get(m.ListeningScript, seeded["script_ids"][0])
        assert script is not None and script.audio_hash == audio_hash

    # Re-rendering identical content is a cache hit, not a second synthesis.
    again = asyncio.run(
        tts_render.render_script(
            seeded["documents"][0], script_id=seeded["script_ids"][0]
        )
    )
    assert again["cached"] is True
    assert again["audio_hash"] == audio_hash


# --------------------------------------------------------------------------------------
# 3. Media route: ticket auth + Range
# --------------------------------------------------------------------------------------


def test_media_requires_a_ticket(anon: TestClient, rendered: dict[str, Any]) -> None:
    path = f"/api/v1/media/listening/{rendered['audio_hash']}.wav"
    unauthenticated = anon.get(path)
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["code"] == "unauthorized"

    # A well-formed ticket for a DIFFERENT resource must not open this file.
    wrong = issue_ticket("media-read", "/api/v1/media/listening/deadbeef.wav")
    mismatched = anon.get(path, params={"ticket": wrong})
    assert mismatched.status_code == 401
    assert mismatched.json()["code"] == "ticket_invalid"


def test_media_serves_full_body_and_ranges(
    anon: TestClient, client: TestClient, rendered: dict[str, Any]
) -> None:
    path = f"/api/v1/media/listening/{rendered['audio_hash']}.wav"
    ticket = issue_ticket("media-read", path)

    full = anon.get(path, params={"ticket": ticket})
    assert full.status_code == 200
    assert full.headers["content-type"] == "audio/wav"
    assert full.headers["accept-ranges"] == "bytes"
    size = int(full.headers["content-length"])
    assert size == len(full.content) > 44

    # The same ticket is reusable inside its TTL — that is what seeking needs.
    partial = anon.get(path, params={"ticket": ticket}, headers={"Range": "bytes=0-99"})
    assert partial.status_code == 206
    assert partial.headers["content-range"] == f"bytes 0-99/{size}"
    assert len(partial.content) == 100
    assert partial.content == full.content[:100]

    tail = anon.get(path, params={"ticket": ticket}, headers={"Range": "bytes=-64"})
    assert tail.status_code == 206
    assert tail.content == full.content[-64:]

    open_ended = anon.get(
        path, params={"ticket": ticket}, headers={"Range": f"bytes={size - 10}-"}
    )
    assert open_ended.status_code == 206
    assert open_ended.headers["content-range"] == f"bytes {size - 10}-{size - 1}/{size}"

    unsatisfiable = anon.get(
        path, params={"ticket": ticket}, headers={"Range": f"bytes={size + 5}-"}
    )
    assert unsatisfiable.status_code == 416
    assert unsatisfiable.headers["content-range"] == f"bytes */{size}"

    # Bearer auth also works, for XHR/fetch callers (18 §4.16).
    assert client.get(path).status_code == 200


def test_a_media_ticket_outlives_a_listening_part(client: TestClient) -> None:
    """L-V1 regression: a 60-second media ticket cannot serve a 30-minute paper.

    An ``<audio>`` element holds ONE url for the life of the element and re-presents
    it on every Range request, so the ticket has to outlive the whole sitting and the
    review that follows. At the old 60-second TTL, "Replay from 1:28" in review died
    with MEDIA_ERR_NETWORK — the 401 reached a no-cors media request, so the browser
    surfaced it only as ERR_BLOCKED_BY_ORB.
    """
    from bandready.server.tickets import DEFAULT_TTL, ttl_for

    path = "/api/v1/media/listening/deadbeef.wav"
    res = client.post(
        "/api/v1/tickets", json={"audience": "media-read", "resource": path}
    )
    assert res.status_code == 201
    expires_in = res.json()["expires_in"]

    # Longer than a full four-part paper plus its check step, with room for review.
    assert expires_in >= 40 * 60, f"media ticket lives only {expires_in}s"
    assert expires_in == ttl_for("media-read")
    # A socket presents its ticket once, at connect, and keeps the short default.
    assert ttl_for("session-events") == DEFAULT_TTL


def test_timing_sidecar_route(client: TestClient, rendered: dict[str, Any]) -> None:
    path = f"/api/v1/media/listening/{rendered['audio_hash']}.timing.json"
    response = client.get(path)
    assert response.status_code == 200
    document = response.json()
    assert document["lines"][0]["start_ms"] == 0
    assert document["lines"][1]["start_ms"] == document["lines"][0]["end_ms"] + 30_000
    assert client.get("/api/v1/media/listening/nosuchhash.wav").status_code == 404


# --------------------------------------------------------------------------------------
# 4. Content routes
# --------------------------------------------------------------------------------------


def test_test_document_hides_the_answer_key(client: TestClient, seeded: dict[str, Any]) -> None:
    response = client.get(f"/api/v1/listening/tests/{seeded['test_id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["total_questions"] == 40
    assert [part["part"] for part in body["parts"]] == [1, 2, 3, 4]

    first = body["parts"][0]
    assert "lines" not in first  # transcript withheld until review (07 §4)
    assert [q["number"] for q in first["questions"]] == list(range(1, 11))
    for question in first["questions"]:
        assert "answers" not in question
        assert "cue_line_index" not in question
        assert question["word_limit"] == 1

    keyed = client.get(
        f"/api/v1/listening/tests/{seeded['test_id']}", params={"with_answers": 1}
    ).json()
    assert keyed["parts"][0]["questions"][0]["answers"] == [["answer1"]]
    assert keyed["parts"][0]["lines"]

    listed = client.get("/api/v1/listening/tests").json()
    assert seeded["test_id"] in [item["id"] for item in listed["items"]]
    assert client.get("/api/v1/listening/tests/nope").status_code == 404


def test_render_route_returns_the_cached_hash(
    client: TestClient, seeded: dict[str, Any], rendered: dict[str, Any]
) -> None:
    response = client.post(
        f"/api/v1/listening/scripts/{seeded['script_ids'][0]}/render", json={}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["audio_hash"] == rendered["audio_hash"]
    assert body["cached"] is True
    assert body["media_path"] == f"/api/v1/media/listening/{rendered['audio_hash']}.wav"


def test_a_warm_wav_with_no_media_row_still_renders(
    client: TestClient, seeded: dict[str, Any], rendered: dict[str, Any]
) -> None:
    """L-V1 regression: the WAV can outlive its ``media_files`` row.

    LRU eviction, a restored media directory or a reset database all leave a warm
    cache with no row behind it. ``listening_scripts.audio_hash`` is a foreign key
    onto that row, so the render route used to observe the cache hit, link the
    script and blow up on the FK at flush — a 500 that retrying could never clear,
    because the retry hit the same cache. ``cached_render`` now re-registers.
    """
    from sqlalchemy import text as sql

    from bandready.db.engine import session_scope

    audio_hash = rendered["audio_hash"]
    with session_scope() as session:
        session.execute(
            sql("UPDATE listening_scripts SET audio_hash = NULL WHERE audio_hash = :h"),
            {"h": audio_hash},
        )
        session.execute(sql("DELETE FROM media_files WHERE hash = :h"), {"h": audio_hash})
    assert tts_render.cached_render(audio_hash) is not None  # the file is still there

    response = client.post(
        f"/api/v1/listening/scripts/{seeded['script_ids'][0]}/render", json={}
    )
    assert response.status_code == 200, response.text
    assert response.json()["audio_hash"] == audio_hash

    with session_scope() as session:
        row = session.execute(
            sql("SELECT hash FROM media_files WHERE hash = :h"), {"h": audio_hash}
        ).first()
    assert row is not None, "the media_files row was not re-registered"


def test_render_route_queues_a_job_on_a_cache_miss(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    from bandready.server.jobs import job_manager

    script_id = seeded["script_ids"][3]  # part 4 has never been rendered
    response = client.post(f"/api/v1/listening/scripts/{script_id}/render", json={})
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    assert response.headers["location"] == f"/api/v1/jobs/{job_id}"

    deadline = time.time() + 30
    job: dict[str, Any] | None = None
    while time.time() < deadline:
        job = job_manager.get(job_id)
        if job and job["state"] in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    assert job is not None, "the render job never appeared"
    assert job["state"] == "done", job.get("error")
    assert job["kind"] == "listening_render"
    audio_hash = job["result"]["audio_hash"]
    assert tts_render.cached_render(audio_hash) is not None


# --------------------------------------------------------------------------------------
# 5. Attempt lifecycle: create -> autosave -> submit -> review
# --------------------------------------------------------------------------------------


def test_submit_scores_deterministically_and_converts_to_a_band(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    created = client.post(
        "/api/v1/listening/attempts",
        json={"test_id": seeded["test_id"], "mode": "exam"},
    )
    assert created.status_code == 201
    attempt_id = created.json()["attempt_id"]
    assert created.json()["total_questions"] == 40
    assert created.json()["question_numbers"][:3] == [1, 2, 3]

    # 31 of 40 right: 28 exact plus a punctuation/case variant and a casing variant.
    answers: dict[str, str] = {str(n): f"answer{n}" for n in range(1, 29)}
    answers["29"] = "  ANSWER29. "
    answers["30"] = "Answer30"
    answers["31"] = "answr31"  # edit distance 1 -> wrong, but tagged
    answers["32"] = "answer32 extra"  # over the one-word limit -> wrong
    # The article tolerance never rescues an over-limit answer (06 §4.1 / R2-9).
    answers["33"] = "the answer33"
    # 34-40 left blank.

    saved = client.patch(
        f"/api/v1/listening/attempts/{attempt_id}",
        json={"answers": answers, "seconds_elapsed": 1800, "played_script_id": seeded["script_ids"][0]},
    )
    assert saved.status_code == 200
    assert saved.json()["answered"] == 33
    assert saved.json()["play_count"] == 1

    # PATCH is a partial merge: a later call must not wipe the earlier answers.
    merged = client.patch(
        f"/api/v1/listening/attempts/{attempt_id}", json={"answers": {"34": "answer34"}}
    )
    assert merged.json()["answered"] == 34

    submitted = client.post(f"/api/v1/listening/attempts/{attempt_id}/submit")
    assert submitted.status_code == 200
    score = submitted.json()
    assert score["total_questions"] == 40
    assert score["raw_score"] == 31  # 28 exact + 29 + 30 + 34
    assert score["band"] == 7.0  # 30-31 raw -> band 7.0 (07 §7)
    assert score["duration_s"] == 1800
    assert score["per_type"]["note_completion"] == {"correct": 31, "total": 40}
    assert 31 in score["near_miss_spellings"]

    by_number = {q["number"]: q for q in score["per_question"]}
    assert by_number[29]["correct"] is True
    assert by_number[30]["correct"] is True
    assert by_number[31]["near_miss_spelling"] is True
    assert by_number[32]["over_limit"] is True and by_number[32]["correct"] is False
    assert by_number[33]["over_limit"] is True and by_number[33]["correct"] is False
    assert by_number[40]["given"] == ""
    assert [p["correct"] for p in score["per_part"]] == [10, 10, 10, 1]

    # SRS candidates are only ever *suggested* (07 §12 / R2-5).
    terms = {c["term"] for c in score["srs_candidates"]}
    assert "answer35" in terms
    spelling_cards = [c for c in score["srs_candidates"] if c["card_type"] == "spelling"]
    assert spelling_cards and spelling_cards[0]["sentence_context"]

    # Re-submitting is a conflict, and the rows really landed.
    assert client.post(f"/api/v1/listening/attempts/{attempt_id}/submit").status_code == 409
    with session_scope() as session:
        rows = session.execute(
            m.ListeningAnswer.__table__.select().where(
                m.ListeningAnswer.attempt_id == attempt_id
            )
        ).all()
        assert len(rows) == 40
        attempt = session.get(m.ListeningAttempt, attempt_id)
        assert attempt is not None
        assert attempt.status == "submitted"
        assert attempt.raw_score == 31
        assert attempt.band == 7.0

    review = client.get(f"/api/v1/listening/attempts/{attempt_id}/review")
    assert review.status_code == 200
    detail = review.json()
    assert detail["band"] == 7.0
    assert detail["play_count"] == 1
    part1 = detail["parts"][0]
    # The transcript is unlocked after submission, with audio offsets to jump to.
    assert part1["transcript"]["lines"][0]["text"].startswith("Part 1.")
    assert part1["transcript"]["lines"][1]["start_ms"] > 0
    first_question = part1["questions"][0]
    assert first_question["accepted"] == [["answer1"]]
    assert first_question["cue_text"].startswith("So for number 1")
    assert first_question["audio_ms"] == part1["transcript"]["lines"][1]["start_ms"]


def test_practice_attempt_on_one_script_reports_raw_only(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    created = client.post(
        "/api/v1/listening/attempts",
        json={"script_id": seeded["script_ids"][1], "mode": "practice"},
    )
    assert created.status_code == 201
    attempt_id = created.json()["attempt_id"]
    assert created.json()["question_numbers"] == list(range(11, 21))

    score = client.post(
        f"/api/v1/listening/attempts/{attempt_id}/submit",
        json={"answers": {"11": "answer11", "12": "answer12"}},
    ).json()
    assert score["raw_score"] == 2
    assert score["total_questions"] == 10
    assert score["band"] is None  # 07 §7 — partial practice reports raw only
    assert score["band_note"]


def test_the_attempt_list_dates_the_attempts_that_were_never_submitted(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    """`submitted_at` is null for anything walked out of, so the list carries `started_at`.

    A history screen keyed on `submitted_at` alone can date the attempts that went well and
    none of the ones that did not, which is most of what it exists to show.
    """
    created = client.post(
        "/api/v1/listening/attempts",
        json={"script_id": seeded["script_ids"][0], "mode": "practice"},
    )
    attempt_id = created.json()["attempt_id"]

    row = next(
        item
        for item in client.get("/api/v1/listening/attempts?limit=200").json()["items"]
        if item["attempt_id"] == attempt_id
    )
    assert row["submitted_at"] is None
    assert row["started_at"], "an unfinished attempt still has to carry a date"
    assert row["status"] == "in_progress"

    client.post(f"/api/v1/listening/attempts/{attempt_id}/submit", json={})
    after = next(
        item
        for item in client.get("/api/v1/listening/attempts?limit=200").json()["items"]
        if item["attempt_id"] == attempt_id
    )
    assert after["started_at"] == row["started_at"]
    assert after["submitted_at"]


def test_attempt_validation(client: TestClient, seeded: dict[str, Any]) -> None:
    both = client.post(
        "/api/v1/listening/attempts",
        json={"test_id": seeded["test_id"], "script_id": seeded["script_ids"][0]},
    )
    assert both.status_code == 422
    assert both.json()["code"] == "validation_error"
    assert client.post("/api/v1/listening/attempts", json={"mode": "practice"}).status_code == 422
    bad_mode = client.post(
        "/api/v1/listening/attempts",
        json={"test_id": seeded["test_id"], "mode": "sideways"},
    )
    assert bad_mode.status_code == 422
    missing = client.post(
        "/api/v1/listening/attempts", json={"test_id": "lt_nope", "mode": "exam"}
    )
    assert missing.status_code == 404
    assert client.patch("/api/v1/listening/attempts/la_nope", json={}).status_code == 404


# --------------------------------------------------------------------------------------
# 6. Scoring rules and the raw-to-band table
# --------------------------------------------------------------------------------------


def test_raw_to_band_table_matches_the_doc() -> None:
    expected = {
        40: 9.0, 39: 9.0, 38: 8.5, 37: 8.5, 36: 8.0, 35: 8.0, 34: 7.5, 32: 7.5,
        31: 7.0, 30: 7.0, 29: 6.5, 26: 6.5, 25: 6.0, 23: 6.0, 22: 5.5, 18: 5.5,
        17: 5.0, 16: 5.0, 15: 4.5, 13: 4.5, 12: 4.0, 10: 4.0, 9: 3.5, 8: 3.5,
        7: 3.0, 6: 3.0, 5: 2.5, 4: 2.5, 3: 2.0, 0: 2.0,
    }
    assert {raw: routes.raw_to_band(raw) for raw in expected} == expected


def test_scoring_rules() -> None:
    one_word = 1
    assert routes._score_question("centre", [["centre", "center"]], one_word)["correct"]
    assert routes._score_question("CENTER ", [["centre", "center"]], one_word)["correct"]
    # Spelling is strict: a near miss is wrong, but flagged for the spelling drills.
    near = routes._score_question("centr", [["centre", "center"]], one_word)
    assert near["correct"] is False and near["near_miss_spelling"] is True
    # Over the word limit is wrong even when it contains the answer (07 §5.2).
    over = routes._score_question("the city centre", [["centre"]], one_word)
    assert over["correct"] is False and over["over_limit"] is True
    # Variant-aware article rule (R2-9).
    assert routes._score_question("the ceramic jars", [["ceramic jars"]], 3)["correct"]
    assert not routes._score_question("jars", [["the ceramic jars"]], 3)["correct"]
    # Numbers: digits and words are equivalent.
    assert routes._score_question("twenty", [["20"]], one_word)["correct"]
    # Hyphen == space.
    assert routes._score_question("well being", [["well-being"]], 2)["correct"]
    # Multi-select is order-insensitive and worth one point per slot.
    multi = routes._score_question("D, B", [["b"], ["d"]], None)
    assert multi == {
        "points": 2,
        "max_points": 2,
        "correct": True,
        "near_miss_spelling": False,
        "over_limit": False,
    }
    assert routes._score_question("BD", [["b"], ["d"]], None)["points"] == 2
    assert routes._score_question("B, E", [["b"], ["d"]], None)["points"] == 1
    # A blank answer is simply wrong.
    assert routes._score_question("", [["centre"]], one_word)["points"] == 0


def test_a_spaced_number_is_one_number_not_two_words() -> None:
    """L-V1 regression: "ONE WORD AND/OR A NUMBER" allows a spaced number.

    `_score_question` used to count bare tokens, so the Part 1 telephone number --
    the single most common Part 1 answer there is -- was rejected as over-limit
    against its own answer key. Eight accepted answers in the shipped pack, across
    eight scripts, were unearnable.
    """
    one_word = 1
    for spaced in ("01472 330915", "214 555 0983", "0412 663 941", "49 22 16"):
        got = routes._score_question(spaced, [[spaced]], one_word)
        assert got["over_limit"] is False, f"{spaced} wrongly over-limit"
        assert got["correct"] is True, f"{spaced} did not match itself"

    # a number PLUS one word is still inside "one word and/or a number"
    assert routes._score_question("86 pounds", [["86 pounds"]], one_word)["correct"]
    # a number spelled in words is one number, not two words
    assert routes._score_question("six hundred", [["six hundred"]], one_word)["correct"]
    # and the limit still bites on actual extra words
    assert routes._score_question("the city centre", [["centre"]], one_word)["over_limit"]


def test_word_limit_glue() -> None:
    assert gen.effective_word_limit({"words": 1, "numbers": 1}) == 2
    assert gen.effective_word_limit({"words": 3}) == 3
    assert gen.effective_word_limit(None) is None
    assert gen.effective_word_limit("NO MORE THAN TWO WORDS") is None
    assert gen.effective_word_limit(2) == 2
    assert gen.count_words("well-being") == 1
    assert gen.count_words("the city centre") == 3


# --------------------------------------------------------------------------------------
# 7. Generation (mock LLM)
# --------------------------------------------------------------------------------------


def test_generate_script_persists_questions(client: TestClient) -> None:
    result = asyncio.run(gen.generate_script(part=1, topic="a cycling tour"))
    script_id = result["script_id"]
    assert script_id and result["questions"] == 2  # the mock fixture carries 2 questions
    assert result["validation"]["ok"] is True

    with session_scope() as session:
        row = session.get(m.ListeningScript, script_id)
        assert row is not None
        assert row.source == "generated"
        assert row.part == 1
        questions = session.execute(
            m.ListeningQuestion.__table__.select().where(
                m.ListeningQuestion.script_id == script_id
            )
        ).all()
        assert len(questions) == 2

    document = client.get(
        f"/api/v1/listening/scripts/{script_id}", params={"with_answers": 1}
    ).json()
    assert document["questions"][0]["answers"] == [["bramley"]]
    assert document["audio"]["ready"] is False


def test_lint_rejects_a_broken_script() -> None:
    document = _script_document(1, 1)
    document["questions"][0]["cue_line_index"] = 99
    report = gen.lint_script(document, strict=True)
    assert not report.ok
    assert any("does not exist" in error for error in report.errors)

    short = _script_document(1, 1)
    short["questions"] = short["questions"][:3]
    assert not gen.lint_script(short, strict=True).ok
    assert gen.lint_script(short, strict=False).ok  # mock-mode fixtures stay usable


def test_lint_accepts_a_full_length_script_and_warns_about_spellings() -> None:
    document = _script_document(2, 11)
    document["questions"][0]["answers"] = [["centre"]]
    document["lines"][1]["text"] = "So for number 11, the word you need is centre."
    # Pad to a realistic 4.5-6.5 minute part so the duration heuristic is satisfied.
    document["lines"].extend(
        {
            "speaker": "s1",
            "text": (
                f"Filler turn {i}: this is the kind of unremarkable connective chatter "
                "that carries a real listening part between its answer lines."
            ),
            "pause_after_ms": 300,
        }
        for i in range(30)
    )
    report = gen.lint_script(document, strict=True)
    assert report.ok, report.errors
    assert any("centre/center" in warning for warning in report.warnings)
