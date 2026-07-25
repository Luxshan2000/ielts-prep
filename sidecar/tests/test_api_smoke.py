"""Whole-API smoke test — every registered route answers, and none of them 5xx (14 §4).

This is the cheapest regression guard in the project. It costs one process, one temp data
dir and about a second, and it catches the class of break that unit tests miss entirely: a
route module that no longer imports, a dependency that stopped resolving, a response model
that a refactor made unserialisable, a SQL statement that references a dropped column.

How it works
------------
1. Build the real app against a throwaway data dir with the mock providers selected, so the
   shipped ``core-en`` pack is imported by the ordinary startup path and nothing touches the
   network.
2. Enumerate every registered route. ``app.state.route_paths`` is the documented
   introspection surface (this FastAPI version includes routers lazily, so ``app.routes``
   holds opaque wrappers); :func:`iter_routes` walks the same structure but keeps the HTTP
   methods, and :func:`test_route_enumeration_matches_app_state` pins the two together.
3. Discover real ids — passages, scripts, prompts, decks — and create real attempts, a real
   plan and a real placement sitting, so path params resolve to rows that actually exist and
   the handlers run their real bodies rather than bailing out on the first lookup.
4. Call every ``(method, path)`` pair. Anything below 500 passes: ``404`` for an id we chose
   not to create and ``422`` for a body we chose not to hand-author are both honest answers
   from a working route. ``>= 500`` is a failure, and every one of them is reported at once.

Calls are ordered GET → write → destructive so that a route which resets settings or deletes
recordings cannot invalidate the fixtures the earlier calls depend on.

Adding a route? You do not have to touch this file: auto-discovery picks it up and the sweep
calls it with ``{}``. Add an entry to :data:`BODIES` / :data:`QUERIES` if a real body gets you
better coverage than a 422.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

TOKEN = "smoke-token-0123456789abcdef"
BASE = "http://127.0.0.1"

#: `{name}` and `{name:path}`, including converters glued to a suffix (`{audio_hash}.wav`).
PARAM_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)(?::[a-z]+)?\}")

HTTP_METHODS = frozenset({"GET", "POST", "PATCH", "PUT", "DELETE"})

#: A Task 2 draft over the 250-word floor, so the pre-check passes and ``POST .../submit``
#: really queues an evaluation instead of stopping at a 422. Content is irrelevant — the
#: mock LLM returns a canned evaluation — but the length is not.
DRAFT_ESSAY = " ".join(
    [
        "Some people believe that public transport should be free for every resident,",
        "while others argue that fares are necessary to fund the network.",
        "This essay considers both positions before reaching a conclusion.",
    ]
    + [
        (
            "Free travel would reduce private car use, cut urban air pollution and give"
            " low income households genuine access to work and education."
        )
    ]
    * 12
    + ["In my view a subsidised fare with free travel for students is the fairer compromise."]
)


# --------------------------------------------------------------------------------------
# Route enumeration
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Route:
    path: str
    methods: frozenset[str]
    websocket: bool


def iter_routes(app: FastAPI) -> list[Route]:
    """Every registered route, flattened through the lazy ``_IncludedRouter`` wrappers.

    Mirrors ``bandready.server.app.route_paths`` but keeps the methods, which the sweep needs
    in order to issue the right verb.
    """
    found: list[Route] = []

    def walk(routes: Any) -> None:
        for route in routes or []:
            path = getattr(route, "path", None)
            if isinstance(path, str):
                methods = getattr(route, "methods", None)
                found.append(
                    Route(
                        path=path,
                        methods=frozenset(methods or ()),
                        websocket=not methods,
                    )
                )
                continue
            inner = getattr(route, "original_router", None)
            if inner is not None:
                walk(getattr(inner, "routes", None))
            elif hasattr(route, "routes"):
                walk(route.routes)

    walk(app.routes)
    merged: dict[str, Route] = {}
    for route in found:
        existing = merged.get(route.path)
        if existing is None:
            merged[route.path] = route
        else:
            merged[route.path] = Route(
                path=route.path,
                methods=existing.methods | route.methods,
                websocket=existing.websocket and route.websocket,
            )
    return [merged[key] for key in sorted(merged)]


# --------------------------------------------------------------------------------------
# The app under test
# --------------------------------------------------------------------------------------


def _reset_process_state() -> None:
    """Drop every module-level cache so the temp data dir is really the only state."""
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


def _select_mock_providers() -> None:
    """Point all three modalities at the hidden ``mock_*`` presets (03 §3.1, R2-19).

    ``BANDREADY_ENABLE_MOCK=1`` only *unlocks* them; without this the seeded default is the
    local Ollama endpoint and every LLM-backed route tries to open a socket.
    """
    from bandready.db.engine import run_migrations
    from bandready.settings_store import invalidate_cache, patch_settings

    run_migrations()
    invalidate_cache()
    patch_settings(
        {
            "llm": {
                "preset": "mock_llm",
                "base_url": "mock://llm",
                "model": "mock-model-1",
                "api_key": "",
            },
            "stt": {"preset": "mock_stt", "base_url": "mock://stt", "model": "mock-stt"},
            "tts": {"preset": "mock_tts", "base_url": "mock://tts", "voice": "mock_voice"},
        }
    )


@pytest.fixture(scope="module")
def app(tmp_path_factory: pytest.TempPathFactory) -> Iterator[FastAPI]:
    from bandready.server.app import create_app

    data_dir: Path = tmp_path_factory.mktemp("bandready-smoke")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.delenv("BANDREADY_PARENT_PID", raising=False)

        # POST /dictionary/install and the auto-install inside a lookup both download the
        # English WordNet lexicon. Stub the one function that reaches the network so the
        # routes still run their real state machine and CI stays offline.
        from bandready import dictionary as wordnet

        def _offline(_spec: str | None = None) -> str:
            raise RuntimeError("network disabled in tests")

        mp.setattr(wordnet, "install_lexicon", _offline)

        _reset_process_state()
        _select_mock_providers()
        yield create_app()
        _reset_process_state()


@pytest.fixture(scope="module")
def client(app: FastAPI) -> Iterator[TestClient]:
    # The auth middleware rejects any non-loopback Host header, so TestClient's default
    # "testserver" base_url would 403 every request.
    with TestClient(app, base_url=BASE) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TOKEN}"})
        yield test_client


# --------------------------------------------------------------------------------------
# Path-parameter resolution
# --------------------------------------------------------------------------------------


@dataclass
class Ids:
    """Resolved path-parameter values.

    Keys are ``(path_prefix, param_name)``; ``prefix=""`` is the catch-all. The prefix matters
    because ``{test_id}`` means a reading test under ``/api/v1/reading`` and a listening test
    under ``/api/v1/listening``.
    """

    values: dict[tuple[str, str], str] = field(default_factory=dict)

    def put(self, prefix: str, param: str, value: str | None) -> None:
        if value:
            self.values[(prefix, param)] = value

    def get(self, path: str, param: str) -> str:
        best: str | None = None
        best_len = -1
        for (prefix, name), value in self.values.items():
            if name != param or not path.startswith(prefix):
                continue
            if len(prefix) > best_len:
                best, best_len = value, len(prefix)
        # A synthetic id is a perfectly good probe: the route must answer 404, not blow up.
        return best or f"smoke-missing-{param.replace('_', '-')}"

    def substitute(self, path: str) -> str:
        return PARAM_RE.sub(lambda m: self.get(path, m.group(1)), path)


def _dig_ids(payload: Any, key: str = "id", depth: int = 0) -> list[str]:
    """Every ``key`` value in the first list of objects found anywhere in ``payload``."""
    if depth > 4:
        return []
    if isinstance(payload, list):
        return [str(row[key]) for row in payload if isinstance(row, dict) and row.get(key)]
    if isinstance(payload, dict):
        for candidate in ("items", "results", "cards", "entries", "sessions", "decks", "packs"):
            if candidate in payload:
                found = _dig_ids(payload[candidate], key, depth + 1)
                if found:
                    return found
        for value in payload.values():
            if isinstance(value, (list, dict)):
                found = _dig_ids(value, key, depth + 1)
                if found:
                    return found
    return []


def _first(client: TestClient, path: str, key: str = "id", **params: Any) -> str | None:
    response = client.get(path, params=params or None)
    if response.status_code != 200:
        return None
    try:
        found = _dig_ids(response.json(), key)
    except ValueError:
        return None
    return found[0] if found else None


def _created(response: Any) -> str | None:
    if response.status_code >= 400:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    # The specific keys come first on purpose: a reading attempt echoes the passage under
    # "id" as well, so a plain "id"-first search would hand back the wrong row.
    for key in ("attempt_id", "session_id", "placement_id", "report_id", "job_id", "id"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
        for holder in ("attempt", "session", "placement", "plan"):
            nested = body.get(holder)
            if isinstance(nested, dict) and isinstance(nested.get(key), str):
                return str(nested[key])
    return None


@pytest.fixture(scope="module")
def ids(client: TestClient) -> Ids:
    """Discover pack content, then create one real row per lifecycle the API exposes."""
    out = Ids()

    # --- content shipped by the core-en pack -------------------------------------------
    passage = _first(client, "/api/v1/reading/passages")
    reading_test = _first(client, "/api/v1/reading/tests")
    script = _first(client, "/api/v1/listening/scripts")
    listening_test = _first(client, "/api/v1/listening/tests")
    prompt = _first(client, "/api/v1/writing/prompts")
    deck = _first(client, "/api/v1/vocab/decks", key="deck_id")
    pack = _first(client, "/api/v1/packs", key="pack_id")
    drill_item = _first(client, "/api/v1/pron/drills")
    # PUT /readiness/{item_id} only accepts a *manual* item; the auto ones are derived.
    readiness_item = next(
        (
            str(item["id"])
            for item in client.get("/api/v1/readiness").json().get("items", [])
            if item.get("kind") == "manual" and item.get("id")
        ),
        None,
    )

    out.put("/api/v1/reading", "passage_id", passage)
    out.put("/api/v1/reading", "test_id", reading_test)
    out.put("/api/v1/listening", "script_id", script)
    out.put("/api/v1/listening", "test_id", listening_test)
    out.put("/api/v1/writing", "prompt_id", prompt)
    out.put("/api/v1/vocab/decks", "deck_id", deck or "")
    out.put("/api/v1/vocab/packs", "pack_id", deck or "")
    out.put("/api/v1/pron/drills", "item_id", drill_item)
    out.put("/api/v1/readiness", "item_id", readiness_item)
    out.put("/api/v1/reading/drills", "qtype", "true_false_not_given")
    out.put("/api/v1/dictionary", "word", "ubiquitous")
    out.put("/api/v1/media", "kind", "packs")
    out.put("/api/v1/media", "path", "core-en/no-such-asset.png")
    # `/packs/{pack_id}` only carries DELETE and repair — both destructive, so the real pack
    # id is deliberately withheld and those routes probe a non-existent pack instead.
    assert pack is None or isinstance(pack, str)

    # --- one real row per lifecycle ------------------------------------------------------
    if passage:
        out.put(
            "/api/v1/reading",
            "attempt_id",
            _created(
                client.post(
                    "/api/v1/reading/attempts",
                    json={"passage_id": passage, "mode": "passage"},
                )
            ),
        )
    if script:
        out.put(
            "/api/v1/listening",
            "attempt_id",
            _created(client.post("/api/v1/listening/attempts", json={"script_id": script})),
        )
    if prompt:
        attempt_id = _created(
            client.post("/api/v1/writing/attempts", json={"prompt_id": prompt, "mode": "practice"})
        )
        out.put("/api/v1/writing", "attempt_id", attempt_id)
        if attempt_id:
            # Long enough to clear the Task 2 pre-check, so POST .../submit really queues an
            # evaluation job against the mock LLM instead of stopping at a 422.
            client.patch(
                f"/api/v1/writing/attempts/{attempt_id}", json={"essay_text": DRAFT_ESSAY}
            )

    out.put(
        "/api/v1/speaking",
        "session_id",
        _created(client.post("/api/v1/speaking/sessions", json={"mode": "full_mock"})),
    )

    entry_id = _created(
        client.post(
            "/api/v1/vocab/entries",
            json={"term": "ubiquitous", "pos": "adjective", "definition": "found everywhere"},
        )
    )
    out.put("/api/v1/vocab/entries", "entry_id", entry_id)
    # The suggestion routes take an entry id too, but accepting/dismissing one *consumes* it,
    # so the inbox gets its own row and the manual entry above survives to be deleted later.
    client.post(
        "/api/v1/vocab/suggestions",
        json={"items": [{"term": "corroborate", "source": {"kind": "writing"}}]},
    )
    out.put(
        "/api/v1/vocab/suggestions",
        "entry_id",
        _first(client, "/api/v1/vocab/suggestions"),
    )
    card_id = _first(client, "/api/v1/srs/queue", key="card_id")

    client.post("/api/v1/plan/generate", json={})
    out.put("/api/v1/plan", "plan_session_id", _first(client, "/api/v1/plan", key="session_id"))

    placement_id = _created(client.post("/api/v1/placement/start", json={}))
    out.put("/api/v1/placement", "placement_id", placement_id)

    # A real, finished job so GET /jobs/{job_id} and POST /jobs/{job_id}/cancel are more than
    # a 404 probe. Prompt generation runs against the mock LLM, so it costs nothing.
    out.put("/api/v1/jobs", "job_id", _created(
        client.post("/api/v1/writing/prompts/generate", json={"task_type": "task2"})
    ))

    # Values the body/query tables need but which are not path params.
    out.put("__body__", "entry_id", entry_id)
    out.put("__body__", "card_id", card_id)
    out.put("__body__", "drill_item_id", drill_item)
    out.put("__body__", "placement_id", placement_id)
    return out


# --------------------------------------------------------------------------------------
# Request shaping
# --------------------------------------------------------------------------------------


def _pack_path() -> str:
    from bandready.content.loader import default_pack_path

    found = default_pack_path()
    return str(found) if found else "/nonexistent/pack"


def bodies(ids: Ids) -> dict[tuple[str, str], dict[str, Any]]:
    """Minimal *valid* bodies. Anything absent is sent ``{}`` and may answer 422."""
    entry_id = ids.values.get(("__body__", "entry_id"), "smoke-missing-entry")
    card_id = ids.values.get(("__body__", "card_id"))
    drill_item = ids.values.get(("__body__", "drill_item_id"), "smoke-missing-item")
    placement_id = ids.values.get(("__body__", "placement_id"))
    return {
        ("POST", "/api/v1/tickets"): {
            "audience": "media-read",
            "resource": "/api/v1/media/packs/core-en/cover.png",
        },
        ("POST", "/api/v1/packs/validate"): {"path": _pack_path(), "verify_checksums": False},
        ("POST", "/api/v1/packs/import"): {"path": _pack_path()},
        # Re-importing the shipped pack over itself is exactly what repair does.
        ("POST", "/api/v1/packs/{pack_id}/repair"): {"path": _pack_path()},
        # A real artifact id would start a multi-gigabyte download; the 404 path is what we
        # want from a smoke test.
        ("POST", "/api/v1/models/download"): {"artifact_id": "smoke-missing-artifact"},
        ("POST", "/api/v1/models/downloads"): {"artifact_id": "smoke-missing-artifact"},
        ("POST", "/api/v1/models/import"): {
            "artifact_id": "smoke-missing-artifact",
            "source_path": "/nonexistent/model.gguf",
        },
        ("POST", "/api/v1/providers/verify"): {"modality": "llm"},
        ("POST", "/api/v1/providers/tts-preview"): {"config": {"preset": "mock_tts"}},
        ("PATCH", "/api/v1/settings"): {"llm": {"params": {"timeout_s": 60.0}}},
        ("POST", "/api/v1/reading/attempts"): {"passage_id": ids.get("/api/v1/reading", "passage_id"), "mode": "passage"},
        ("PATCH", "/api/v1/reading/attempts/{attempt_id}"): {"answers": {"1": "true"}},
        # A deliberately wrong answer so `.../why-wrong` has something to explain.
        ("POST", "/api/v1/reading/attempts/{attempt_id}/submit"): {"answers": {"1": "zzz"}},
        ("POST", "/api/v1/reading/attempts/{attempt_id}/why-wrong"): {"number": 1},
        ("POST", "/api/v1/reading/drills/results"): {"qtype": "matching_headings", "n_items": 5, "n_correct": 3},
        ("POST", "/api/v1/reading/generate"): {"format": "academic", "scope": "passage"},
        ("POST", "/api/v1/listening/attempts"): {"script_id": ids.get("/api/v1/listening", "script_id")},
        ("PATCH", "/api/v1/listening/attempts/{attempt_id}"): {"answers": {"1": "library"}},
        ("POST", "/api/v1/listening/attempts/{attempt_id}/submit"): {"answers": {"1": "library"}},
        ("POST", "/api/v1/listening/generate"): {"part": 1, "target_band": 6.0},
        ("POST", "/api/v1/listening/tests/generate"): {"target_band": 6.0},
        ("POST", "/api/v1/writing/attempts"): {"prompt_id": ids.get("/api/v1/writing", "prompt_id")},
        ("POST", "/api/v1/writing/submissions"): {"prompt_id": ids.get("/api/v1/writing", "prompt_id")},
        ("PATCH", "/api/v1/writing/attempts/{attempt_id}"): {"essay_text": DRAFT_ESSAY},
        ("POST", "/api/v1/writing/attempts/{attempt_id}/submit"): {"acknowledge_warnings": True},
        ("POST", "/api/v1/writing/submissions/{attempt_id}/submit"): {"acknowledge_warnings": True},
        ("PATCH", "/api/v1/writing/submissions/{attempt_id}"): {"essay_text": DRAFT_ESSAY},
        ("POST", "/api/v1/writing/prompts/generate"): {"task_type": "task2", "genre": "opinion"},
        ("POST", "/api/v1/vocab/entries"): {"term": "salient", "definition": "most noticeable"},
        ("POST", "/api/v1/vocab/suggestions"): {
            "items": [{"term": "mitigate", "source": {"kind": "writing", "item_id": "smoke"}}]
        },
        ("POST", "/api/v1/vocab/suggestions/accept-all"): {"ids": []},
        ("PATCH", "/api/v1/vocab/entries/{entry_id}"): {"cefr_level": "C1"},
        ("POST", "/api/v1/vocab/lookup"): {"word": "ubiquitous"},
        ("POST", "/api/v1/vocab/check-sentence"): {
            "entry_id": entry_id,
            "sentence": "Smartphones are ubiquitous in modern classrooms.",
        },
        ("POST", "/api/v1/srs/review"): (
            {"card_id": card_id, "rating": 3, "exercise_type": "flip"} if card_id else {"rating": 3}
        ),
        ("POST", "/api/v1/pron/analyze"): {"session_id": "smoke-missing-session"},
        ("POST", "/api/v1/pron/drills/{item_id}/attempt"): {"correct": True},
        ("POST", "/api/v1/pron/drills/results"): {"item_id": drill_item, "correct": True},
        ("PUT", "/api/v1/readiness/{item_id}"): {"checked": True},
        ("POST", "/api/v1/plan/generate"): {"seed": 7},
        ("POST", "/api/v1/plan/regenerate"): {"seed": 7},
        ("POST", "/api/v1/plan/sessions/{plan_session_id}/complete"): {"minutes": 20},
        ("POST", "/api/v1/placement/start"): {"target_band": 6.5, "exam_format": "academic"},
        ("POST", "/api/v1/placement/answer"): {"placement_id": placement_id, "skip": True},
        ("POST", "/api/v1/placement/submit"): {"placement_id": placement_id, "skip": True},
        ("POST", "/api/v1/placement/skip"): {"self_level": "intermediate"},
        ("POST", "/api/v1/placement/complete"): {
            "placement_id": placement_id,
            "generate_plan": False,
        },
        ("POST", "/api/v1/speaking/sessions"): {"mode": "quick_chat"},
        ("POST", "/api/v1/speaking/sessions/{session_id}/end"): {"score": False},
        ("POST", "/api/v1/speaking/sessions/{session_id}/hangup"): {"score": False},
    }


QUERIES: dict[tuple[str, str], dict[str, Any]] = {
    # install_missing=0 keeps the lookup offline; the install route is exercised separately
    # against a stubbed downloader.
    ("GET", "/api/v1/dictionary/{word}"): {"install_missing": 0},
    ("GET", "/api/v1/media/pron/ref"): {"text": "the quick brown fox"},
    ("GET", "/api/v1/reading/drills/{qtype}"): {"size": 4},
    ("GET", "/api/v1/pron/drills"): {"type": "minimal_pair_ab", "limit": 5},
    ("GET", "/api/v1/progress/heatmap"): {"days": 30},
    ("GET", "/api/v1/jobs"): {"limit": 5},
}

#: Routes the sweep must not call, each with the reason. Keep this list as short as the
#: honest answer allows — every entry is coverage the guard does not give us.
SKIPPED: dict[tuple[str, str], str] = {
    ("POST", "/api/v1/speaking/sessions/{session_id}/offer"): (
        "needs a live WebRTC peer connection and a real SDP offer — covered by test_speaking"
    ),
    ("PATCH", "/api/v1/speaking/sessions/{session_id}/offer"): (
        "trickle-ICE candidates for a peer connection that only exists in a browser"
    ),
    ("POST", "/api/v1/providers/setup/{engine_id}"): (
        "guided setup shells out to the engine's own installer (brew/ollama pull)"
    ),
}

#: Called last: each of these invalidates state the earlier calls rely on. Keyed by
#: ``(method, path)`` and not by path alone — ``DELETE /vocab/entries/{id}`` must run late,
#: but ``GET`` on the same path must run early, while the entry still exists.
DESTRUCTIVE: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/v1/settings/reset"),
        ("POST", "/api/v1/data/wipe-recordings"),
        ("POST", "/api/v1/media/cache/evict"),
        ("POST", "/api/v1/packs/{pack_id}/repair"),
    }
)


def _phase(method: str, path: str) -> int:
    if method == "DELETE" or (method, path) in DESTRUCTIVE:
        return 2
    return 0 if method == "GET" else 1


# --------------------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------------------


def test_route_enumeration_matches_app_state(app: FastAPI) -> None:
    """The walker this test relies on sees exactly what the app advertises."""
    walked = {route.path for route in iter_routes(app)}
    assert walked == set(app.state.route_paths)
    assert len(walked) > 100, "the sidecar should register well over a hundred paths"


def test_every_route_module_registered(app: FastAPI) -> None:
    """A route module that fails to import is logged and skipped — that must never pass CI."""
    import pkgutil

    from bandready.server import routes as routes_pkg

    expected = {
        info.name for info in pkgutil.iter_modules(routes_pkg.__path__)
        if not info.name.startswith("_")
    }
    assert set(app.state.registered_routes) == expected


def test_the_websocket_route_is_the_only_non_http_route(app: FastAPI) -> None:
    websockets = [route.path for route in iter_routes(app) if route.websocket]
    assert websockets == ["/api/v1/speaking/sessions/{session_id}/events"]


def test_skip_list_only_names_real_routes(app: FastAPI) -> None:
    """A skip entry that no longer matches a route is dead weight hiding real coverage."""
    live = {(method, route.path) for route in iter_routes(app) for method in route.methods}
    assert set(SKIPPED) <= live
    assert set(QUERIES) <= live
    assert not (set(SKIPPED) & set(QUERIES))


def test_health_needs_no_token(client: TestClient) -> None:
    response = client.get("/health", headers={"Authorization": ""})
    assert response.status_code == 200
    assert response.json()["status"] in ("ok", "starting", "degraded")


def test_an_unknown_token_is_rejected_everywhere(client: TestClient) -> None:
    response = client.get("/api/v1/settings", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_every_registered_route_answers_without_a_server_error(
    app: FastAPI, client: TestClient, ids: Ids
) -> None:
    """Call all 140+ routes. 404 and 422 are fine; 5xx is not, and every one is reported."""
    body_table = bodies(ids)
    calls: list[tuple[str, str]] = [
        (method, route.path)
        for route in iter_routes(app)
        if not route.websocket
        for method in sorted(route.methods & HTTP_METHODS)
    ]
    calls.sort(key=lambda c: (_phase(*c), c[1], c[0]))

    failures: list[str] = []
    attempted: set[tuple[str, str]] = set()
    succeeded = 0

    for method, template in calls:
        if (method, template) in SKIPPED:
            continue
        url = ids.substitute(template)
        params = QUERIES.get((method, template))
        json_body: dict[str, Any] | None = None
        if method in ("POST", "PATCH", "PUT"):
            json_body = body_table.get((method, template), {})

        response = client.request(method, url, params=params, json=json_body)
        attempted.add((method, template))
        succeeded += response.status_code < 400

        if response.status_code >= 500:
            failures.append(
                f"{method} {url} -> {response.status_code}  {response.text[:300]}"
            )

    assert not failures, "routes returned a server error:\n  " + "\n  ".join(sorted(failures))

    expected = {c for c in calls if c not in SKIPPED}
    assert attempted == expected
    assert len(attempted) >= 140, f"only swept {len(attempted)} routes — coverage regressed"
    # A sweep where everything 404s would pass the 5xx check while proving nothing. The real
    # run answers ~133/156 with a 2xx; the floor guards against the fixtures quietly breaking.
    assert succeeded >= 120, (
        f"only {succeeded}/{len(attempted)} calls answered 2xx — the id/body fixtures have "
        "stopped resolving, so the sweep is no longer exercising the handlers"
    )


def test_the_core_read_surface_actually_returns_200(client: TestClient, ids: Ids) -> None:
    """A route that 404s on every id would pass the sweep above but be useless.

    These are the reads the app performs on first paint; they must succeed against the
    shipped pack, which proves the content actually imported.
    """
    must_work = [
        "/health",
        "/api/v1/system/info",
        "/api/v1/settings",
        "/api/v1/providers/presets",
        "/api/v1/packs",
        "/api/v1/reading/passages",
        "/api/v1/reading/tests",
        "/api/v1/listening/scripts",
        "/api/v1/listening/tests",
        "/api/v1/writing/prompts",
        "/api/v1/writing/rubrics",
        "/api/v1/writing/templates",
        "/api/v1/speaking/cards",
        "/api/v1/vocab/decks",
        "/api/v1/vocab/stats",
        "/api/v1/srs/stats",
        "/api/v1/progress/summary",
        "/api/v1/readiness",
        "/api/v1/pron/contrasts",
        "/api/v1/models/manifest",
    ]
    broken = {
        path: client.get(path).status_code
        for path in must_work
        if client.get(path).status_code != 200
    }
    assert not broken, f"first-paint reads did not answer 200: {broken}"


def test_the_shipped_pack_imported_content(client: TestClient) -> None:
    """`seed_if_empty` runs at startup; if the pack manifest drifts it silently ships empty."""
    for path, key in (
        ("/api/v1/reading/passages", "reading passages"),
        ("/api/v1/listening/scripts", "listening scripts"),
        ("/api/v1/writing/prompts", "writing prompts"),
        ("/api/v1/speaking/cards", "speaking cards"),
        ("/api/v1/vocab/decks", "vocabulary decks"),
    ):
        payload = client.get(path).json()
        assert _dig_ids(payload) or _dig_ids(payload, "deck_id"), f"the core pack shipped no {key}"
