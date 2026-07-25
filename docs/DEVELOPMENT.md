# Development guide

How BandReady runs while you are working on it, where everything it writes ends up, and how to
get out of a bad state. For *what* to build and *why*, read [`plan/README.md`](plan/README.md);
for house rules and the two auto-discovery seams, read [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 1. The two processes

BandReady is one desktop app made of two processes that only ever talk over loopback HTTP.

```
┌─ Electron main (Node) ──────────────────────────────────────────┐
│  app/electron/main.ts                                           │
│    • creates the BrowserWindow                                  │
│    • app/electron/sidecar.ts spawns the Python process,         │
│      waits for one SIDECAR_READY line, then polls /health       │
│    • app/electron/ipc.ts exposes base_url + token to the        │
│      renderer through the contextIsolated preload bridge        │
│    • app/electron/update.ts — electron-updater                  │
└───────────────┬─────────────────────────────────────────────────┘
                │ spawn + stdout handshake
                ▼
┌─ Sidecar (Python, FastAPI/uvicorn) ─────────────────────────────┐
│  bandready-sidecar serve                                        │
│    • binds 127.0.0.1 on a RANDOM free port                      │
│    • a 256-bit token, generated per launch, never in argv       │
│    • a parent-PID watchdog exits if Electron disappears, so an  │
│      Electron crash cannot orphan a server on the SQLite WAL    │
│    • owns: DB, migrations, settings, content, scoring, voice    │
└─────────────────────────────────────────────────────────────────┘
                ▲
                │ fetch() with `Authorization: Bearer <token>`
┌─ Renderer (React SPA, Vite) ────────────────────────────────────┐
│  app/src — reaches the sidecar only through src/lib/api.ts      │
└─────────────────────────────────────────────────────────────────┘
```

The handshake is a single line on the sidecar's stdout:

```
SIDECAR_READY {"base_url": "http://127.0.0.1:52344", "token": "…"}
```

Three guards protect the server from other local processes and from DNS rebinding: the `Host`
header must name a loopback address, an `Origin` header (if present) must be an allowed app or
dev origin, and the bearer token must match. `GET /health` is the only exempt path. `<audio>`
elements and WebSockets cannot set headers, so they use short-lived signed tickets instead —
mint one with `api.mediaUrl()` / `api.wsUrl()`, which are **async**.

## 2. Dev modes

Everything goes through `node scripts/dev.mjs`. `Ctrl-C` tears every child down.

### Default: Electron + Vite

```bash
node scripts/dev.mjs
```

Builds the main/preload bundle, starts Vite on **5273**, and launches Electron, which spawns
its own sidecar on a random port with a random token — the same lifecycle the packaged app
uses. This is the mode to use when you are touching anything in `app/electron/`.

### `--browser`: no Electron

```bash
node scripts/dev.mjs --browser
```

Starts the sidecar on a **fixed** port (8710) with a **fixed** token (`dev-token`) and
`BANDREADY_ENABLE_MOCK=1`, plus Vite on 5273. The SPA runs in an ordinary browser, so you get
real devtools, React DevTools, and a stable URL. This is the mode the Playwright E2E suite
drives, and the fastest way to poke at the API by hand:

```bash
curl -s -H 'Authorization: Bearer dev-token' http://127.0.0.1:8710/api/v1/system/info | jq
```

Live speaking does not work in a plain browser tab against a mock TTS/STT; use the default mode
for voice work.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--browser` | off | browser mode, as above |
| `--port <n>` | 5273 | Vite port |
| `--sidecar-port <n>` | 8710 | sidecar port in browser mode |
| `--token <s>` | `dev-token` | sidecar token in browser mode |
| `--data-dir <path>` | `<repo>/.dev-data` | `BANDREADY_DATA_DIR` |
| `--no-mock` | mock on | use your real configured providers |
| `--dev-sidecar` | off | run the fixed-port sidecar *and* point Electron at it |
| `--no-electron-build` | off | skip rebuilding the main/preload bundle |

**Dev runs write to `<repo>/.dev-data`, not to your real application data directory.** Your
personal practice history is never touched by `pnpm dev`.

### Running the sidecar on its own

```bash
cd sidecar
BANDREADY_DATA_DIR=$PWD/../.dev-data \
BANDREADY_AUTH_TOKEN=dev-token \
BANDREADY_ENABLE_MOCK=1 \
uv run bandready-sidecar serve --port 8710 --log-level debug
```

Interactive API docs are then at <http://127.0.0.1:8710/api/v1/docs> (you still need the bearer
token — paste it into Swagger's *Authorize* box).

### Environment variables

Every key is prefixed `BANDREADY_`:

| Variable | Default | Notes |
|---|---|---|
| `BANDREADY_DATA_DIR` | per-OS app dir (§4) | everything the app writes lives here |
| `BANDREADY_HOST` / `BANDREADY_PORT` | `127.0.0.1` / `8710` | env wins over the CLI flags in a packaged app |
| `BANDREADY_AUTH_TOKEN` | generated | empty **disables** bearer auth — dev only |
| `BANDREADY_ENABLE_MOCK` | `0` | unlocks the hidden `mock_llm` / `mock_stt` / `mock_tts` presets |
| `BANDREADY_LOG_LEVEL` | `info` | `debug` prints every request |
| `BANDREADY_PARENT_PID` | unset | the watchdog exits when this pid disappears |
| `BANDREADY_CONTENT_DIR` | `<repo>/content/core-en` | where to look for the shipped pack |
| `BANDREADY_MODEL_MANIFEST` | built-in table | override the downloadable-model manifest |
| `BANDREADY_WORDNET_DIR` | `<data dir>/wordnet` | where the offline dictionary lives |

> Setting `BANDREADY_ENABLE_MOCK=1` only *unlocks* the mock presets. To actually use them,
> select them in Settings → Providers, or `patch_settings({"llm": {"preset": "mock_llm",
> "base_url": "mock://llm", "model": "mock-model-1"}})`. This is exactly what the test fixtures
> do, and forgetting it is why a test suddenly tries to open a socket to Ollama.

## 3. Debugging

**Renderer.** In `--browser` mode, use your browser's devtools normally. Under Electron,
`View → Toggle Developer Tools` (`Cmd/Ctrl+Shift+I`). Every failed request throws an `ApiError`
carrying `status`, `code` and `detail` — log the whole object, not just the message.

**Electron main.** `console.log` from `main.ts`/`sidecar.ts` goes to the terminal that ran
`node scripts/dev.mjs`, and is mirrored into `<userData>/logs/sidecar.log`. If the window never
appears, the sidecar almost certainly failed to answer `/health`: that log has the reason.

**Sidecar.** Logs go to stderr (and to `sidecar.log` under Electron). `--log-level debug` adds
one line per request. Secrets are redacted by a logging filter installed at startup, so an API
key never lands in a log even at debug level.

**A route that 500s.** Run the whole-API smoke test first — it calls every registered route and
prints the offenders in one go:

```bash
cd sidecar && uv run pytest tests/test_api_smoke.py -q
```

**A route that hangs.** Nothing points at it, so use pytest's faulthandler to get every
thread's stack:

```bash
uv run pytest tests/test_api_smoke.py -q -o faulthandler_timeout=30
```

Two causes account for most hangs: a blocking call inside an `async def` handler, and a
non-reentrant lock taken twice on the same thread.

**Which routes exist?** `app.routes` holds lazily-included wrapper objects in this FastAPI
version, so iterate `app.state.route_paths` instead:

```bash
cd sidecar && uv run python -c "
from bandready.server.app import create_app
print('\n'.join(create_app().state.route_paths))"
```

**The database.** It is plain SQLite in WAL mode — open `<data dir>/bandready.db` with any
client while the app runs. `sqlite3 bandready.db '.tables'` should list 47 tables.

**Voice sessions.** Chrome's `chrome://webrtc-internals` shows the peer connection. The
sidecar logs pipeline state transitions at info level; `--log-level debug` adds VAD and
turn-taking detail. The five version-specific pipecat gotchas are documented in
[`plan/02-voice-pipeline.md`](plan/02-voice-pipeline.md) — check there before assuming a bug.

## 4. Where things are written

The application data directory (`BANDREADY_DATA_DIR`, or the per-OS default):

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/BandReady` |
| Windows | `%APPDATA%\BandReady` |
| Linux | `$XDG_DATA_HOME/BandReady` (default `~/.local/share/BandReady`) |
| dev runs | `<repo>/.dev-data` |

Inside it:

```
BandReady/
├── bandready.db              SQLite (plus -wal and -shm while running)
├── settings.json             the settings document; credentials are encrypted
├── secret.key                the per-install key that encrypts them — never commit or share
├── logs/                     sidecar.log (Electron also writes the main-process log here)
├── models/                   downloaded Kokoro / Whisper artifacts
├── media/                    generated listening audio, speaking recordings, pron references
├── packs/                    installed content packs
├── exports/                  "Export my data" zips
└── wordnet/                  the offline dictionary
```

Electron's own `userData` directory (crash dumps, window state) is alongside it under the same
per-OS convention.

## 5. Resetting local state

Nothing here touches your real data directory unless you say so explicitly.

**Reset the dev sandbox** — the usual fix, and always safe:

```bash
rm -rf .dev-data
node scripts/dev.mjs
```

**Reset only settings and providers**, keeping practice history:

```bash
curl -X POST -H 'Authorization: Bearer dev-token' http://127.0.0.1:8710/api/v1/settings/reset
```

Deleting `settings.json` has the same effect on the next launch. Deleting `secret.key` as well
makes every stored API key undecryptable, so the app drops them and asks you to re-enter them.

**Reset only the database**, keeping downloaded models (they are the slow part):

```bash
rm -f "<data dir>/bandready.db"*      # the -wal and -shm files too
```

Migrations re-run and the shipped content pack re-seeds on the next launch.

**Reset everything**: delete the whole data directory. Export first if you care about the
history — Settings → Data → *Export my data*, or `POST /api/v1/data/export`, writes a zip
containing every table as JSONL plus all your recordings.

**Free disk space without losing anything**: Settings → Data → *Wipe recordings* keeps the
sessions and their scores but removes the audio; `POST /api/v1/media/cache/evict` prunes generated
listening audio back to its budget (it re-renders on demand).

**A migration that will not apply.** Check where the schema thinks it is, then upgrade by hand:

```bash
cd sidecar
uv run python -c "
from sqlalchemy import inspect, text
from bandready.db.engine import get_engine
with get_engine().connect() as c:
    print(c.execute(text('SELECT version_num FROM alembic_version')).scalar())
    print(len(inspect(get_engine()).get_table_names()), 'tables')"
```

If a dev database is wedged mid-migration, deleting it is almost always faster than repairing
it — there is no production data in `.dev-data`.

## 6. Before you push

```bash
cd sidecar && uv run pytest -q && uv run ruff check bandready tests
cd ../app && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test && pnpm build
```

That is exactly what [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs, minus the
E2E suite and minus the `voice` extra (too heavy for a hosted runner — so a change to
`bandready/voice/` must be exercised locally).
