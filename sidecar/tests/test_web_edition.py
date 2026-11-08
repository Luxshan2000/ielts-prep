"""The browser edition: the sidecar serving the app's pages, and the ``bandready`` launcher."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bandready import launch
from bandready.server.web import index_with_contract
from tests.test_api_smoke import _reset_process_state

TOKEN = "web-edition-token"
BASE = "http://127.0.0.1:8765"
PAGE = "<!doctype html><html><head><title>BandReady</title></head><body></body></html>"


def _make_app(tmp_path: Path, *, web: bool) -> Iterator[FastAPI]:
    from bandready.server.app import create_app

    pages = tmp_path / "web"
    (pages / "assets").mkdir(parents=True)
    (pages / "index.html").write_text(PAGE, encoding="utf-8")
    (pages / "assets" / "app.js").write_text("console.log('hi')", encoding="utf-8")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(tmp_path / "data"))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_WEB_DIR", str(pages))
        if web:
            mp.setenv("BANDREADY_WEB", "1")
        else:
            mp.delenv("BANDREADY_WEB", raising=False)
        _reset_process_state()
        yield create_app()
        _reset_process_state()


@pytest.fixture
def web_client(tmp_path: Path) -> Iterator[TestClient]:
    for app in _make_app(tmp_path, web=True):
        yield TestClient(app, base_url=BASE)


@pytest.fixture
def desktop_client(tmp_path: Path) -> Iterator[TestClient]:
    for app in _make_app(tmp_path, web=False):
        yield TestClient(app, base_url=BASE)


def test_the_page_carries_the_token_the_api_client_reads(web_client: TestClient) -> None:
    resp = web_client.get("/")
    assert resp.status_code == 200
    assert f'window.__BANDREADY_SIDECAR__={{"token": "{TOKEN}"}}' in resp.text
    # A new token every launch, so the page must never come from a cache.
    assert resp.headers["cache-control"] == "no-store"
    assert web_client.get("/index.html").text == resp.text


def test_the_pages_assets_load_without_the_token(web_client: TestClient) -> None:
    resp = web_client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "console.log" in resp.text


def test_the_api_still_needs_the_token(web_client: TestClient) -> None:
    assert web_client.get("/api/v1/system/info").status_code == 401
    authed = web_client.get(
        "/api/v1/system/info", headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert authed.status_code == 200


def test_a_rebound_host_cannot_read_the_page(web_client: TestClient) -> None:
    # DNS rebinding: a hostile page reaches 127.0.0.1 under its own name. The Host guard
    # is the only thing standing between it and the token in index.html.
    assert web_client.get("/", headers={"Host": "evil.example"}).status_code == 403


def test_the_desktop_app_serves_no_pages(desktop_client: TestClient) -> None:
    # Electron loads the pages from disk; without BANDREADY_WEB nothing is mounted and the
    # exemption for non-API GETs does not exist.
    assert desktop_client.get("/").status_code == 401
    assert desktop_client.get("/assets/app.js").status_code == 401


def test_the_contract_script_cannot_be_closed_early() -> None:
    out = index_with_contract(PAGE, "</script><script>alert(1)</script>")
    assert out.count("</script>") == 1
    assert out.startswith("<!doctype html><html><head><script>window.__BANDREADY_SIDECAR__=")


# --------------------------------------------------------------------------- launcher


def test_a_second_launch_opens_the_running_copy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / launch.STATE_FILE).write_text(json.dumps({"port": 9123}), encoding="utf-8")
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(launch, "_is_bandready", lambda port, timeout=1.0: port == 9123)
    opened: list[str] = []
    monkeypatch.setattr(launch.webbrowser, "open", opened.append)

    def _must_not_serve(_argv: list[str]) -> int:
        raise AssertionError("a second server was started")

    monkeypatch.setattr("bandready.cli.main", _must_not_serve)
    assert launch.main([]) == 0
    assert opened == ["http://127.0.0.1:9123/"]


def test_a_busy_preferred_port_falls_back_to_a_free_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 8765 is taken by something that is not BandReady (it was, on the machine this was
    # written on), so the launcher must not report it as running or try to bind it.
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    for key in ("BANDREADY_WEB", "BANDREADY_HOST", "BANDREADY_PORT"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(launch, "_is_bandready", lambda port, timeout=1.0: False)
    monkeypatch.setattr(launch, "_port_free", lambda port: port != launch.PREFERRED_PORT)
    monkeypatch.setattr(launch, "_any_free_port", lambda: 50123)
    served: list[list[str]] = []
    monkeypatch.setattr("bandready.cli.main", lambda argv: served.append(argv) or 0)

    assert launch.main(["--no-browser"]) == 0
    assert served == [["serve"]]
    import os

    assert os.environ["BANDREADY_PORT"] == "50123"
    assert os.environ["BANDREADY_WEB"] == "1"
    assert os.environ["BANDREADY_HOST"] == "127.0.0.1"
    assert json.loads((tmp_path / launch.STATE_FILE).read_text())["port"] == 50123


def test_the_wheel_pack_location_is_a_candidate() -> None:
    from bandready.content.loader import DEFAULT_PACK_DIRNAME, candidate_pack_paths

    bundled = Path(launch.__file__).resolve().parent / "_bundle" / "content" / DEFAULT_PACK_DIRNAME
    assert bundled in candidate_pack_paths()
