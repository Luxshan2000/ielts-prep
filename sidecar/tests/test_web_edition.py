"""The browser edition: the sidecar serving the app's pages, and the ``bandready`` launcher."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bandready import launch
from bandready.server.web import LAUNCH_SECRET_ENV, index_with_contract
from tests.test_api_smoke import _reset_process_state

TOKEN = "web-edition-token"
SECRET = "launch-secret-for-tests"
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
        mp.setenv("BANDREADY_PORT", "8765")
        mp.setenv(LAUNCH_SECRET_ENV, SECRET)
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


def test_the_launch_secret_opens_the_page_with_its_token(web_client: TestClient) -> None:
    page = web_client.get(f"/?launch={SECRET}")
    assert page.status_code == 200
    assert f'var t="{TOKEN}";' in page.text
    # A new token every launch, so the page must never come from a cache, and the address
    # with the secret in it must not travel on as a referrer.
    assert page.headers["cache-control"] == "no-store"
    assert page.headers["referrer-policy"] == "no-referrer"
    # No cookie: browsers share cookies across ports, so another account's server on
    # 127.0.0.1 would receive it. The page keeps the token in per-origin sessionStorage.
    assert "set-cookie" not in page.headers
    assert "sessionStorage.setItem" in page.text
    assert "history.replaceState" in page.text  # the secret leaves the address bar


def test_anyone_else_on_the_machine_gets_no_token(web_client: TestClient) -> None:
    # The page is reachable by every account on a shared computer. Without the launch
    # secret, which only the learner's own files and environment hold, it must not carry
    # the token that unlocks their essays, recordings and API keys.
    for resp in (
        web_client.get("/"),
        web_client.get("/index.html"),
        web_client.get("/?launch=guess"),
        web_client.get("/?launch="),
    ):
        assert TOKEN not in resp.text
        assert "var t=null;" in resp.text  # the app then shows the open-from-shortcut note
    assert web_client.get("/?launch=guess").status_code == 403


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


def test_a_rebound_host_is_refused(web_client: TestClient) -> None:
    # DNS rebinding: a hostile page reaches 127.0.0.1 under its own name.
    resp = web_client.get(f"/?launch={SECRET}", headers={"Host": "evil.example"})
    assert resp.status_code == 403
    assert TOKEN not in resp.text


def test_the_desktop_app_serves_no_pages(desktop_client: TestClient) -> None:
    # Electron loads the pages from disk; without BANDREADY_WEB nothing is mounted and the
    # exemption for non-API GETs does not exist.
    assert desktop_client.get("/").status_code == 401
    assert desktop_client.get("/assets/app.js").status_code == 401


def test_the_contract_script_cannot_be_closed_early() -> None:
    out = index_with_contract(PAGE, "</script><script>alert(1)</script>")
    assert out.count("</script>") == 1
    assert out.startswith("<!doctype html><html><head><script>(function(){var t=")


# --------------------------------------------------------------------------- launcher


def test_a_second_launch_opens_the_running_copy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / launch.STATE_FILE).write_text(
        json.dumps({"port": 9123, "launch": "s3cret"}), encoding="utf-8"
    )
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(
        launch, "_proves_secret", lambda port, secret, timeout=2.0: (port, secret) == (9123, "s3cret")
    )
    opened: list[str] = []
    monkeypatch.setattr(launch.webbrowser, "open", opened.append)

    def _must_not_serve(_argv: list[str]) -> int:
        raise AssertionError("a second server was started")

    monkeypatch.setattr("bandready.cli.main", _must_not_serve)
    assert launch.main([]) == 0
    # Through the redirect file, never with the secret in a URL on a command line.
    redirect = tmp_path / launch.OPEN_FILE
    assert opened == [redirect.as_uri()]
    assert "http://127.0.0.1:9123/?launch=s3cret" in redirect.read_text()


def test_a_busy_preferred_port_falls_back_to_a_free_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 8765 is taken by something that is not BandReady (it was, on the machine this was
    # written on), so the launcher must not report it as running or try to bind it.
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    for key in ("BANDREADY_WEB", "BANDREADY_HOST", "BANDREADY_PORT", LAUNCH_SECRET_ENV):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(launch, "_proves_secret", lambda port, secret, timeout=2.0: False)
    monkeypatch.setattr(launch, "_port_free", lambda port: port != launch.PREFERRED_PORT)
    monkeypatch.setattr(launch, "_any_free_port", lambda: 50123)
    served: list[list[str]] = []
    monkeypatch.setattr("bandready.cli.main", lambda argv: served.append(argv) or 0)

    assert launch.main(["--no-browser"]) == 0
    assert served == [["serve"]]
    assert os.environ["BANDREADY_PORT"] == "50123"
    assert os.environ["BANDREADY_WEB"] == "1"
    assert os.environ["BANDREADY_HOST"] == "127.0.0.1"
    state = json.loads((tmp_path / launch.STATE_FILE).read_text())
    assert state["port"] == 50123
    assert state["launch"] == os.environ[LAUNCH_SECRET_ENV]
    assert len(state["launch"]) >= 40


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")
def test_the_launch_secret_is_readable_by_its_owner_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = tmp_path / launch.STATE_FILE
    state.write_text("{}", encoding="utf-8")
    state.chmod(0o644)  # left by an older version, world-readable
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    for key in ("BANDREADY_WEB", "BANDREADY_HOST", "BANDREADY_PORT", LAUNCH_SECRET_ENV):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(launch, "_proves_secret", lambda port, secret, timeout=2.0: False)
    monkeypatch.setattr("bandready.cli.main", lambda argv: 0)

    assert launch.main(["--no-browser", "--port", "50124"]) == 0
    assert state.stat().st_mode & 0o777 == 0o600


def test_the_wheel_pack_location_is_a_candidate() -> None:
    from bandready.content.loader import DEFAULT_PACK_DIRNAME, candidate_pack_paths

    bundled = Path(launch.__file__).resolve().parent / "_bundle" / "content" / DEFAULT_PACK_DIRNAME
    assert bundled in candidate_pack_paths()


def test_only_the_real_server_can_prove_the_launch_secret(web_client: TestClient) -> None:
    from bandready.server.web import PROOF_PATH, launch_proof

    answer = web_client.get(PROOF_PATH, params={"challenge": "abc123"}).json()["proof"]
    assert answer == launch_proof(SECRET, "abc123")
    # The proof reveals nothing reusable: a different challenge gives an unrelated answer.
    assert answer != web_client.get(PROOF_PATH, params={"challenge": "abc124"}).json()["proof"]
    assert SECRET not in answer


def test_a_squatter_on_the_remembered_port_is_not_trusted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # BandReady was closed and something else now answers on its old port, /health and all.
    # The launcher must start a fresh server rather than open the squatter's page.
    (tmp_path / launch.STATE_FILE).write_text(
        json.dumps({"port": 9123, "launch": "old"}), encoding="utf-8"
    )
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    for key in ("BANDREADY_WEB", "BANDREADY_HOST", "BANDREADY_PORT", LAUNCH_SECRET_ENV):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(launch, "_port_free", lambda port: port != 9123)
    served: list[list[str]] = []
    monkeypatch.setattr("bandready.cli.main", lambda argv: served.append(argv) or 0)

    import http.server
    import threading

    class Squatter(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            body = b'{"status": "ok", "migrations": "0004", "proof": "made-up"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Squatter)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        assert launch._proves_secret(server.server_port, "old") is False
    finally:
        server.shutdown()

    assert launch.main(["--no-browser"]) == 0
    assert served == [["serve"]]
    assert json.loads((tmp_path / launch.STATE_FILE).read_text())["launch"] != "old"


def test_the_token_script_runs_ahead_of_the_pages_csp() -> None:
    # The shipped index.html forbids inline script through a <meta> CSP. A <meta> policy
    # only applies to what follows it, so the injected script must come first or the
    # browser refuses it and the app never learns its token.
    shipped = (Path(__file__).resolve().parents[2] / "app" / "index.html").read_text()
    assert "Content-Security-Policy" in shipped
    out = index_with_contract(shipped, "tok")
    assert out.index("__BANDREADY_SIDECAR__") < out.index("Content-Security-Policy")
