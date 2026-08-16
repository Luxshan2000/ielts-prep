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


# ------------------------------------------------------------ wipe generated audio


def _register(hash_: str, kind: str, rel_path: str, *, pinned: int = 0) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(
            sa_text(
                "INSERT INTO media_files (hash, kind, rel_path, bytes, pinned)"
                " VALUES (:h, :k, :r, :b, :p)"
            ),
            {"h": hash_, "k": kind, "r": rel_path, "b": 1024, "p": pinned},
        )


def _seed_generated_audio(data_dir: Path) -> dict[str, Path]:
    """One file of every kind the purge is meant to reach, plus the ones it must not."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    media = data_dir / "media"
    paths: dict[str, Path] = {}

    # Earlier tests in this module leave files behind; start from a known cache state so
    # the counts below mean exactly what they say.
    from bandready.server.routes.data import GENERATED_DIRS

    for sub in GENERATED_DIRS:
        root = media / sub
        if root.is_dir():
            for stale in root.rglob("*"):
                if stale.is_file():
                    stale.unlink()
    with session_scope() as s:
        s.execute(sa_text("UPDATE listening_scripts SET audio_hash = NULL"))
        s.flush()
        s.execute(sa_text("DELETE FROM media_files"))

    render = "a" * 64
    (media / "listening").mkdir(parents=True, exist_ok=True)
    paths["render"] = media / "listening" / f"{render}.wav"
    paths["render"].write_bytes(b"\0" * 3000)
    # The word-timing sidecar is never registered in media_files — nothing else removes it.
    paths["timing"] = media / "listening" / f"{render}.timing.json"
    paths["timing"].write_text('{"lines": []}')
    _register(render, "listening_render", f"listening/{render}.wav")

    line = "b" * 64
    (media / "tts-lines").mkdir(parents=True, exist_ok=True)
    paths["line"] = media / "tts-lines" / f"{line}.wav"
    paths["line"].write_bytes(b"\0" * 2000)
    _register(line, "tts_line", f"tts-lines/{line}.wav")

    ref = "c" * 64
    (media / "pron" / "ref" / "bf_emma").mkdir(parents=True, exist_ok=True)
    paths["ref"] = media / "pron" / "ref" / "bf_emma" / "deadbeef.wav"
    paths["ref"].write_bytes(b"\0" * 1000)
    _register(ref, "pron_ref", "pron/ref/bf_emma/deadbeef.wav")

    vocab = "d" * 64
    (media / "vocab").mkdir(parents=True, exist_ok=True)
    paths["vocab"] = media / "vocab" / f"{vocab}.wav"
    paths["vocab"].write_bytes(b"\0" * 500)
    _register(vocab, "vocab_audio", f"vocab/{vocab}.wav")

    # Untracked leftovers: a render whose row is gone (restored backup / reset db).
    paths["orphan"] = media / "listening" / "orphaned-render.wav"
    paths["orphan"].write_bytes(b"\0" * 700)
    paths["orphan_timing"] = media / "listening" / "orphaned-render.timing.json"
    paths["orphan_timing"].write_text("{}")

    # A pinned cache row: pack-shipped audio is not the learner's to lose.
    pinned = "e" * 64
    paths["pinned"] = media / "listening" / f"{pinned}.wav"
    paths["pinned"].write_bytes(b"\0" * 400)
    _register(pinned, "listening_render", f"listening/{pinned}.wav", pinned=1)

    # MUST SURVIVE — the learner's own voice, living one directory away from pron/ref.
    attempts = media / "pron" / "attempts"
    attempts.mkdir(parents=True, exist_ok=True)
    paths["attempt"] = attempts / "at_keep.wav"
    paths["attempt"].write_bytes(b"\0" * 1500)
    speaking = media / "speaking" / "sp_keep"
    speaking.mkdir(parents=True, exist_ok=True)
    paths["turn"] = speaking / "turn-001.wav"
    paths["turn"].write_bytes(b"\0" * 1500)

    with session_scope() as s:
        s.execute(
            sa_text("UPDATE listening_scripts SET audio_hash = :h WHERE id = ("
                    "SELECT id FROM listening_scripts LIMIT 1)"),
            {"h": render},
        )
    return paths


async def test_generated_audio_survey_counts_without_deleting(
    client: httpx.AsyncClient, data_dir: Path
) -> None:
    paths = _seed_generated_audio(data_dir)

    resp = await client.get("/api/v1/data/generated-audio")
    assert resp.status_code == 200
    body = resp.json()

    # 4 registered + its timing sidecar + 2 orphans = 7. The pinned row is not counted.
    assert body["files"] == 7
    assert body["by_kind"] == {
        "listening_render": 4,  # render + its timing sidecar + the orphaned pair
        "tts_line": 1,
        "pron_ref": 1,
        "vocab_audio": 1,
    }
    assert body["freed_mb"] >= 0
    assert body["kept_recordings"] == 2, "the learner's two files are reported as kept"

    # Nothing moved. This is the number the confirmation dialog quotes, not an action.
    for key in ("render", "timing", "line", "ref", "vocab", "orphan", "pinned"):
        assert paths[key].exists(), key


async def test_wipe_generated_audio_removes_engine_output_only(
    client: httpx.AsyncClient, data_dir: Path
) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    paths = _seed_generated_audio(data_dir)
    render_hash = "a" * 64

    resp = await client.post("/api/v1/data/wipe-generated-audio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["removed"] == 7
    assert body["failed"] == []
    assert body["by_kind"]["tts_line"] == 1
    assert body["kept_recordings"] == 2

    # Generated audio is gone, including the unregistered timing sidecars.
    for key in ("render", "timing", "line", "ref", "vocab", "orphan", "orphan_timing"):
        assert not paths[key].exists(), key

    # Hard rule: the learner's own voice is never in scope for this button.
    assert paths["attempt"].exists(), "pron/attempts is the learner's voice, not generated"
    assert paths["turn"].exists(), "media/speaking is the learner's voice, not generated"
    # Pinned pack audio is content, not cache.
    assert paths["pinned"].exists()

    with session_scope() as s:
        rows = s.execute(sa_text("SELECT hash, pinned FROM media_files")).all()
        dangling = s.execute(
            sa_text("SELECT COUNT(*) FROM listening_scripts WHERE audio_hash = :h"),
            {"h": render_hash},
        ).scalar_one()
    assert [r[0] for r in rows] == ["e" * 64], "only the pinned row survives"
    assert dangling == 0, "a script must not point at a render that no longer exists"


async def test_wipe_generated_audio_is_idempotent(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/data/wipe-generated-audio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["removed"] == 0
    assert body["failed"] == []
    survey = (await client.get("/api/v1/data/generated-audio")).json()
    assert survey["files"] == 0


async def test_generated_audio_routes_require_auth(app: Any) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as anon:
        assert (await anon.get("/api/v1/data/generated-audio")).status_code == 401
        assert (await anon.post("/api/v1/data/wipe-generated-audio")).status_code == 401


async def test_a_cache_row_pointing_at_a_recording_is_refused(
    client: httpx.AsyncClient, data_dir: Path
) -> None:
    """The second guard. A cache `kind` on a recording path is a bug, and a delete path
    that meets a bug must decline rather than proceed."""
    media = data_dir / "media"
    attempts = media / "pron" / "attempts"
    attempts.mkdir(parents=True, exist_ok=True)
    victim = attempts / "mislabelled.wav"
    victim.write_bytes(b"\0" * 900)
    _register("f" * 64, "pron_ref", "pron/attempts/mislabelled.wav")

    survey = (await client.get("/api/v1/data/generated-audio")).json()
    assert survey["files"] == 0

    resp = await client.post("/api/v1/data/wipe-generated-audio")
    assert resp.status_code == 200
    assert resp.json()["removed"] == 0
    assert victim.exists(), "is_user_recording() vetoes the row whatever its kind says"


# ------------------------------------------------- the purge is not the only mechanism

# The escape hatch above exists so a learner can start over deliberately. It is not what
# keeps them safe: what keeps them safe is that a provider switch re-keys the audio on its
# own, so an old render simply stops being addressed. If that were not true the purge would
# be a lie — you could delete everything, press Prepare, and get the same engine's bytes
# back under the same name. These two assert it by value rather than by inspection.


def test_switching_the_tts_provider_changes_the_render_key() -> None:
    from bandready.audio import tts_render

    script = {"lines": [{"speaker": "narrator", "text": "Good morning, everyone."}]}
    local = {"preset": "kokoro", "engine": "kokoro_onnx", "speed": 1.0}
    remote = {
        "preset": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "deepgram/aura-2",
        "api_key": "sk-secret",
    }

    kokoro = tts_render.script_audio_hash(script, "uk", config=local)
    openrouter = tts_render.script_audio_hash(script, "uk", config=remote)

    assert kokoro != openrouter, (
        "same script, two providers, one hash — the Kokoro render would be served "
        "forever after the learner switched to OpenRouter"
    )
    # And rotating the key is not a provider change: it must not cost a re-render.
    assert openrouter == tts_render.script_audio_hash(
        script, "uk", config=dict(remote, api_key="sk-rotated")
    )


def test_switching_the_tts_provider_changes_the_line_key_too() -> None:
    """The second half, and the one that would have made the first half useless.

    Kokoro's voice ids are engine-independent, so a re-keyed script whose *lines* still
    hit `media/tts-lines/` would be re-stitched byte-for-byte from the old provider's
    audio and stored under the new name.
    """
    from bandready.audio import tts_render

    local = {"preset": "kokoro", "engine": "kokoro_onnx", "speed": 1.0}
    remote = {
        "preset": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "deepgram/aura-2",
    }

    assert tts_render.line_cache_key(
        "bf_emma", "Good morning, everyone.", config=local
    ) != tts_render.line_cache_key("bf_emma", "Good morning, everyone.", config=remote)
