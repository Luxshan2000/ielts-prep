"""The placement sampler must not hand over the answers, and must not fake a listening test.

Both of these were live against the shipped ``core-en`` pack:

* ``/placement/start`` returned the raw ``passage_json`` — 36 KB carrying the key, the
  evidence quote, the examiner's explanation and the distractor analysis for every
  question. The listening step returned ``script_json``, which includes ``lines``: the
  full spoken transcript of the audio the learner is meant to be listening to.
* the listening step was offered whenever the *questions* existed, regardless of whether
  any audio did. On a fresh install there is none — the examiner voice is a model download
  that happens after onboarding — so a learner got eight questions about a recording that
  could not play, answered nothing, and scored 0/8, which converts to band 3.5 and seeds
  the study plan with it.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

TOKEN = "placement-token-0123456789abcdef"
BASE = "http://127.0.0.1"


@pytest.fixture(scope="module")
def app(tmp_path_factory: pytest.TempPathFactory) -> Iterator[FastAPI]:
    from bandready.server.app import create_app

    data_dir: Path = tmp_path_factory.mktemp("bandready-placement")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.delenv("BANDREADY_PARENT_PID", raising=False)

        from bandready.db.engine import run_migrations
        from bandready.settings_store import invalidate_cache, patch_settings

        run_migrations()
        invalidate_cache()
        patch_settings(
            {
                "llm": {"preset": "mock_llm", "base_url": "mock://llm", "model": "mock-model-1"},
                "stt": {"preset": "mock_stt", "base_url": "mock://stt", "model": "mock-stt"},
                "tts": {"preset": "mock_tts", "base_url": "mock://tts", "voice": "mock_voice"},
            }
        )
        yield create_app()


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, base_url=BASE) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TOKEN}"})
        yield test_client


#: Every field that would tell a learner the answer, or read them the audio.
SECRETS = (
    '"answers"',
    '"explanation"',
    '"evidence_quote"',
    '"trap_note"',
    '"teaching"',
    '"lines"',
    '"answer_quote"',
)


def _start(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/v1/placement/start", json={})
    assert response.status_code == 200, response.text
    return response.json()


def test_reading_step_ships_the_passage_but_not_the_key(client: TestClient) -> None:
    step = _start(client)["next"]
    assert step["skill"] == "reading"
    payload = json.dumps(step["content"])
    for secret in SECRETS:
        assert secret not in payload, f"{secret} reached the browser during a placement"

    # What the screen actually needs is all still there.
    content = step["content"]
    assert content["passage"]["texts"][0]["paragraphs"], "the passage body was stripped too"
    group = content["passage"]["question_groups"][0]
    assert group["questions"][0]["prompt"], "the question prompts were stripped too"
    assert group["instructions_extra"], "the group rubric was stripped too"
    assert content["questions"][0]["qtype"], "the qtype the UI picks its control from is gone"


def test_listening_is_skipped_when_no_audio_has_been_rendered(client: TestClient) -> None:
    """A fresh install has the scripts and none of the speech."""
    start = _start(client)
    placement_id = start["placement_id"]
    seen: list[str] = []
    step = start["next"]
    while step is not None:
        seen.append(step["skill"])
        step = client.post(
            "/api/v1/placement/answer",
            json={"placement_id": placement_id, "step": step["step"], "skip": True},
        ).json()["next"]

    assert "listening" not in seen, (
        "listening was offered with no audio on disk — every answer would be blank, "
        "and 0/8 converts to band 3.5"
    )
    progress = client.get(
        "/api/v1/placement/next", params={"placement_id": placement_id}
    ).json()["progress"]
    assert "listening" in progress["skipped"], "an unrunnable section must fall back honestly"


def test_listening_step_hides_the_transcript_once_audio_exists(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from bandready.audio import tts_render

    monkeypatch.setattr(tts_render, "cached_render", lambda _hash: {"duration_ms": 1000})

    start = _start(client)
    placement_id = start["placement_id"]
    client.post(
        "/api/v1/placement/answer",
        json={"placement_id": placement_id, "step": "reading_1", "skip": True},
    )
    step = client.get(
        "/api/v1/placement/next", params={"placement_id": placement_id}
    ).json()["next"]

    assert step["skill"] == "listening"
    assert step["content"]["audio_path"], "audio is on disk, so the part must be playable"
    payload = json.dumps(step["content"])
    for secret in SECRETS:
        assert secret not in payload, f"{secret} reached the browser during a placement"
    # The rubric and the gapped prompts are what the screen renders, and they survive.
    question = step["content"]["script"]["questions"][0]
    assert question["prompt"] and question["instruction"]
    assert step["content"]["script"]["scenario"]
