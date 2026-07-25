"""Data portability + retention routes (11-data-model.md §13, exercised by settings → Data).

Both routes touch the filesystem, so every test runs against a throwaway data dir and
asserts on the real archive/real unlinks rather than on mocks.
"""

from __future__ import annotations

import asyncio
import json
import zipfile
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
    return tmp_path_factory.mktemp("bandready-data-routes")


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


async def _await_job(client: httpx.AsyncClient, job_id: str) -> dict[str, Any]:
    for _ in range(200):
        resp = await client.get(f"/api/v1/jobs/{job_id}")
        assert resp.status_code == 200
        job = resp.json()
        if job["state"] in ("done", "error", "cancelled"):
            return job
        await asyncio.sleep(0.02)
    raise AssertionError(f"job {job_id} never reached a terminal state")


# ------------------------------------------------------------------------ export


async def test_export_requires_auth(app: Any) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as anon:
        assert (await anon.post("/api/v1/data/export")).status_code == 401
        assert (await anon.post("/api/v1/data/wipe-recordings")).status_code == 401


async def test_export_writes_a_self_contained_archive(
    client: httpx.AsyncClient, data_dir: Path
) -> None:
    resp = await client.post("/api/v1/data/export")
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]
    assert resp.headers["Location"] == f"/api/v1/jobs/{job_id}"

    job = await _await_job(client, job_id)
    assert job["state"] == "done", job["error"]
    assert job["kind"] == "data_export"

    path = Path(job["result"]["path"])
    assert path.is_file()
    assert path.parent == data_dir / "exports"
    assert path.name.startswith("bandready-export-") and path.suffix == ".zip"
    # The partial file is renamed into place, never left behind.
    assert not list(path.parent.glob("*.partial"))

    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))
        profiles = zf.read("data/profiles.jsonl").decode()
        topics = zf.read("data/topics.jsonl").decode()

    assert manifest["format"] == "bandready-export"
    assert manifest["schema_version"], "the alembic head must be recorded for a future restore"
    assert manifest["app_version"]

    # Every ORM table is present; derived objects are not.
    from bandready.db.models import Base

    for table in Base.metadata.tables:
        assert f"data/{table}.jsonl" in names, table
    assert "data/vocab_fts.jsonl" not in names
    assert "data/current_band_estimates.jsonl" not in names

    # Content-bank rows ride along so the archive restores without the original pack.
    assert manifest["counts"]["topics"] > 0
    assert manifest["counts"]["vocab_pack_entries"] > 0

    # JSONL really is one JSON object per line (profiles is created lazily, so a
    # fresh install exports it empty — topics always has the seeded pack's rows).
    assert profiles == "" or all(json.loads(line) for line in profiles.splitlines() if line)
    rows = [json.loads(line) for line in topics.splitlines() if line]
    assert rows and "id" in rows[0]
    assert job["result"]["rows"] == sum(manifest["counts"].values())


# ------------------------------------------------------------------ wipe recordings


async def test_wipe_deletes_recordings_and_clears_the_db_references(
    client: httpx.AsyncClient, data_dir: Path
) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    media = data_dir / "media"
    speaking = media / "speaking" / "sp_wipe_me"
    speaking.mkdir(parents=True, exist_ok=True)
    (speaking / "turn-001.wav").write_bytes(b"\0" * 4096)
    (speaking / "manifest.json").write_text('{"turns": []}')
    attempts = media / "pron" / "attempts"
    attempts.mkdir(parents=True, exist_ok=True)
    (attempts / "at_1.wav").write_bytes(b"\0" * 2048)

    # A cache file that must survive: only the two recording subtrees are in scope.
    listening = media / "listening"
    listening.mkdir(parents=True, exist_ok=True)
    (listening / "abc.wav").write_bytes(b"\0" * 512)

    with session_scope() as s:
        from bandready.server.deps import current_profile_id

        profile_id = current_profile_id(s)
        s.execute(
            sa_text(
                "INSERT INTO practice_sessions"
                " (id, profile_id, module, activity, started_at)"
                " VALUES ('sp_wipe_me', :p, 'speaking', 'quick_chat', '2026-01-01T00:00:00Z')"
            ),
            {"p": profile_id},
        )
        s.execute(
            sa_text(
                "INSERT INTO speaking_sessions (id, mode, state, status)"
                " VALUES ('sp_wipe_me', 'practice', 'ended', 'complete')"
            )
        )
        s.execute(
            sa_text(
                "INSERT INTO speaking_turns"
                " (id, session_id, turn_index, role, t_ms, audio_path, text)"
                " VALUES ('st_1', 'sp_wipe_me', 0, 'user', 10, 'turn-001.wav', 'hello')"
            )
        )

    resp = await client.post("/api/v1/data/wipe-recordings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["removed"] == 3
    assert body["failed"] == []
    assert body["cleared_refs"] == 1
    assert body["freed_mb"] >= 0

    assert not (speaking / "turn-001.wav").exists()
    assert not (attempts / "at_1.wav").exists()
    assert (listening / "abc.wav").exists(), "cache media is not a recording"

    # The learner's history survives the wipe — only the audio pointer is cleared.
    with session_scope() as s:
        row = s.execute(
            sa_text("SELECT text, audio_path FROM speaking_turns WHERE id='st_1'")
        ).first()
    assert row is not None
    assert row[0] == "hello"
    assert row[1] is None


async def test_wipe_is_idempotent(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/data/wipe-recordings")
    assert resp.status_code == 200
    assert resp.json()["removed"] == 0


# --------------------------------------------------------------- speaking transcript


async def test_transcript_route_reads_the_persisted_record(client: httpx.AsyncClient) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    record = {
        "turns": [
            {"role": "assistant", "text": "Where are you from?", "t_ms": 1200},
            {
                "role": "user",
                "text": "I am from Colombo.",
                "t_ms": 4200,
                "segments": [{"t_start_ms": 3000, "t_end_ms": 4200}],
                "audio_file": "turn-002.wav",
                "part": 1,
                "card_id": "p1-hometown",
            },
        ]
    }
    with session_scope() as s:
        s.execute(
            sa_text(
                "UPDATE speaking_sessions SET transcript_json = :t WHERE id = 'sp_wipe_me'"
            ),
            {"t": json.dumps(record)},
        )

    resp = await client.get("/api/v1/speaking/sessions/sp_wipe_me/transcript")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "sp_wipe_me"
    assert [t["role"] for t in body["turns"]] == ["assistant", "user"]
    assert body["turns"][1]["card_id"] == "p1-hometown"
    assert body["turns"][1]["segments"][0]["t_end_ms"] == 4200


async def test_transcript_falls_back_to_the_flattened_turns(client: httpx.AsyncClient) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(
            sa_text("UPDATE speaking_sessions SET transcript_json = NULL WHERE id = 'sp_wipe_me'")
        )

    resp = await client.get("/api/v1/speaking/sessions/sp_wipe_me/transcript")
    assert resp.status_code == 200
    turns = resp.json()["turns"]
    assert len(turns) == 1
    assert turns[0]["text"] == "hello"
    assert turns[0]["role"] == "user"


async def test_transcript_404s_for_an_unknown_session(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/speaking/sessions/sp_nope/transcript")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"
