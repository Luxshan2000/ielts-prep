# Contributing to BandReady

Thanks for helping. BandReady is a local-first desktop app: an Electron shell around a React
renderer, talking to a Python FastAPI sidecar over loopback HTTP. This document covers how to
get running, where things live, and the two seams — routes and screens — that are
**auto-discovered**, so adding one never means editing a registry.

Before anything non-trivial, read [`docs/plan/README.md`](docs/plan/README.md). The design is
written down in full, module by module, and most "why is it like this?" questions are answered
there. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) covers dev-mode architecture and debugging.

---

## 1. Dev setup

| Tool | Version |
|---|---|
| Node.js | 20+ |
| pnpm | 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`) |
| Python | 3.11 |
| uv | latest |

```bash
pnpm install                                        # JS workspace
cd sidecar && uv sync --extra dev --extra voice     # Python sidecar (drop --extra voice for
cd ..                                               # a text-only install, ~2-3 GB smaller)

node scripts/dev.mjs                                # Electron + Vite + sidecar
node scripts/dev.mjs --browser                      # sidecar + Vite only, no Electron
```

`--browser` runs the sidecar on a fixed port (8710) with a fixed token (`dev-token`) and mock
providers enabled, and serves the SPA at `http://127.0.0.1:5273`. It is the mode the E2E suite
drives, and the fastest way to poke at the API with `curl`.

## 2. Repository map

```
bandready/
├── app/                        Electron shell + React renderer (pnpm workspace "bandready-app")
│   ├── electron/               main.ts, preload.ts, sidecar.ts (spawn/health/teardown),
│   │                           ipc.ts, update.ts — the Node side, never imported by the SPA
│   └── src/
│       ├── App.tsx             route auto-discovery — DO NOT EDIT to add a screen
│       ├── components/shell/   Sidebar (nav auto-discovery), PageShell, error boundary
│       ├── components/ui/      the 24-component design-system kit (Button, Card, Modal,
│       │                       BandScore, CircularTimer, QuestionPalette, Heatmap, …)
│       ├── features/<name>/    one folder per screen: route.tsx, page.tsx, store.ts,
│       │                       components/, __tests__/
│       ├── lib/                api.ts (the only HTTP client), featureRoute.ts, cn.ts,
│       │                       format.ts, theme.ts
│       ├── stores/             global zustand stores: settings, session, progress, srs
│       └── styles/             Tailwind entry + design tokens
├── sidecar/
│   ├── bandready/
│   │   ├── server/
│   │   │   ├── app.py          the app factory + route auto-discovery — DO NOT EDIT to add
│   │   │   │                   a route
│   │   │   ├── routes/         one module per API family; every one is imported automatically
│   │   │   ├── auth.py         loopback + origin + bearer guards
│   │   │   ├── deps.py         require_auth, current_profile_id, get_session
│   │   │   ├── errors.py       ApiError + the JSON error envelope
│   │   │   ├── jobs.py         the 202 + poll job manager
│   │   │   └── tickets.py      short-lived signed tickets for <audio> and WebSocket
│   │   ├── db/                 SQLAlchemy models, engine, session_scope
│   │   ├── migrations/         Alembic
│   │   ├── content/            pack validation (validate.py owns the schemas) + import
│   │   ├── scoring/            band tables, rubrics, answer matching, writing/speaking scoring
│   │   ├── srs/                FSRS scheduling + exercise generation
│   │   ├── curriculum/         placement → estimates → plan → adaptive rules → progress
│   │   ├── voice/              the pipecat pipeline, state machine, recorder, transcript
│   │   ├── audio/              TTS render + stitch (Kokoro / OpenAI-compatible / mock)
│   │   ├── pron/               word timings, fluency signals, minimal-pair drills
│   │   ├── providers/          presets, detection, the LLM/STT/TTS clients
│   │   ├── security/           credential encryption + log redaction
│   │   ├── settings_store.py   the settings document (deep-merge patching, env interpolation)
│   │   └── dictionary.py       offline WordNet
│   ├── tests/                  pytest — see §5
│   └── ruff.toml               lint config (supersedes [tool.ruff] in pyproject.toml)
├── content/core-en/            the shipped content pack: manifest.json + data/*.jsonl
├── tools/content/              pack build + validate CLIs (run from the repository root)
├── e2e/                        Playwright specs
├── docs/plan/                  the design documents, 00 through 18
└── scripts/dev.mjs             the dev orchestrator
```

## 3. How to add a route (sidecar)

**Never edit `sidecar/bandready/server/app.py`.** `discover_routers()` imports every module
under `bandready.server.routes` at startup and includes its module-level `router`. A module
that fails to import is logged and skipped, so one half-finished feature can never stop the app
from booting.

Create `sidecar/bandready/server/routes/<name>.py`:

```python
"""One-line summary + the doc section this implements (e.g. 18-api-contract.md §4.12)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.server.deps import current_profile_id, get_session, require_auth
from bandready.server.errors import ApiError

router = APIRouter(prefix="/api/v1/widgets", tags=["widgets"])   # the name MUST be `router`


@router.get("", summary="List widgets")
def list_widgets(
    _: None = Depends(require_auth),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    profile_id = current_profile_id(session)
    rows = session.query(m.Widget).filter_by(profile_id=profile_id).all()
    return {"items": [{"id": r.id} for r in rows], "count": len(rows)}


@router.get("/{widget_id}", summary="One widget")
def get_widget(widget_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    row = session.get(m.Widget, widget_id)
    if row is None:
        raise ApiError(404, "not_found", f"no widget {widget_id!r}")
    return {"id": row.id}
```

House rules for routes:

- `require_auth` on every route. The only exempt path in the whole app is `GET /health`.
- Raise `ApiError(status, code, detail)` — never `HTTPException`. The error envelope
  (`{"detail": …, "code": …}`) is what `app/src/lib/api.ts` parses.
- Anything that can take more than about a second returns `202` plus a `job_id` from
  `job_manager.submit(...)`, and the client polls `GET /api/v1/jobs/{job_id}`.
- Sync (`def`) handlers run in a worker thread — that is fine, including for `job_manager`.
  Async (`async def`) handlers must not block the loop; push blocking work through
  `asyncio.to_thread`.
- Add the family to [`docs/plan/18-api-contract.md`](docs/plan/18-api-contract.md) and to the
  `KNOWN_KINDS` tuple in `jobs.py` if you introduced a new job kind.
- `tests/test_api_smoke.py` picks the new route up automatically. If a real request body gets
  better coverage than a `422`, add one to its `bodies()` table.

## 4. How to add a screen (frontend)

**Never edit `app/src/App.tsx` or `app/src/components/shell/Sidebar.tsx`.** `App.tsx`
discovers screens with `import.meta.glob('./features/*/route.tsx')`, and the sidebar is built
from the same objects.

Create `app/src/features/<name>/route.tsx`:

```tsx
import { BookOpen } from 'lucide-react'
import { defineFeatureRoute } from '@/lib/featureRoute'
import { WidgetsPage } from './page'
import { WidgetDetail } from './components/WidgetDetail'

export default defineFeatureRoute({
  path: '/widgets',
  label: 'Widgets',        // omit to hide the route from the sidebar (e.g. /onboarding)
  icon: BookOpen,          // lucide-react only — the design system allows no other icon set
  order: 70,               // ascending sidebar order
  element: <WidgetsPage />,
  children: [{ path: ':widgetId', element: <WidgetDetail /> }],
})
```

House rules for screens:

- Talk to the sidecar only through `@/lib/api`:
  `api.get/post/patch/put/del`, `api.pollJob`, and the **async** `api.mediaUrl(path)` /
  `api.wsUrl(path)` (both must be awaited before you assign the result to a `src`).
- Import UI from `@/components/ui` and wrap the page in `PageShell`. Read the component's
  props before using it, and do not edit the shared kit to make one screen work.
- Every screen handles four states honestly: **loading** (`Skeleton`), **empty**
  (`EmptyState` with copy that says what to do next), **error** (the `ApiError` detail plus a
  retry affordance), and **success**. No white screens, no silent `catch`.
- Keyboard-accessible: visible focus rings, sane tab order, `Escape` closes overlays, timers
  and test players usable without a mouse.
- Correct in **both** themes. The app defaults to dark; check contrast in light too.
- Feature-local state goes in `features/<name>/store.ts`. Only genuinely cross-cutting state
  belongs in `app/src/stores/`.

## 5. Tests

```bash
# Sidecar
cd sidecar
uv run pytest -q                        # the whole suite
uv run pytest tests/test_reading.py -q  # one file
uv run ruff check bandready tests       # lint (must be clean)

# Frontend
cd app
pnpm exec tsc --noEmit -p tsconfig.json # typecheck (must be clean)
pnpm test                               # vitest
pnpm build                              # the renderer bundle must build

# End to end (needs the app running in browser mode)
node scripts/dev.mjs --browser          # in one terminal
cd app && pnpm test:e2e                 # in another
```

`tests/test_api_smoke.py` calls **every** registered route and fails on any `5xx`. It is the
cheapest guard in the repo — if you break a route module's import, a dependency, or a response
model, it tells you in about a second. Keep it green.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs exactly the commands above,
minus E2E and minus the `voice` extra (it is far too heavy for a hosted runner).

## 6. Code style

**Python**

- `ruff` is the only formatter/linter opinion that counts; 100-column lines, target 3.11.
- Full type annotations on anything public. `from __future__ import annotations` at the top.
- Module docstrings state *what this file owns* and cite the design doc section it implements.
  Comments explain **why**, never what — the code already says what.
- SQLAlchemy 2.0 style. Use `session_scope()` for transactions outside a request; use the
  `get_session` dependency inside one.
- No bare `except:`. Catch what you can handle, log the rest with context, and let the error
  handler turn it into an envelope.

**TypeScript / React**

- Strict TypeScript; no `any` in a public signature, no `@ts-ignore` without a reason next to
  it. Function components with typed props; no class components.
- Tailwind utility classes with the project's design tokens. No hard-coded hex colours, no
  inline `style` for anything a token covers.
- Compose `clsx`/`tailwind-merge` through `cn()` rather than string-concatenating classes.
- Colocate tests as `features/<name>/__tests__/*.test.tsx` and query by role or label — not by
  class name or test id.

**Both**

- Small, focused commits with a message that says why. Match the surrounding style; if a file
  disagrees with this document, the file wins locally — raise it in an issue rather than
  reformatting half the repo in an unrelated PR.
- New content for `content/core-en/` must pass
  `uv run --project sidecar python -m tools.content.validate content/core-en` from the
  repository root, and the manifest checksums must be regenerated with `tools.content.build`.

## 7. Licensing of contributions

By contributing you agree that your code is licensed under **Apache-2.0** and that any
first-party practice content you add under `content/` is released under **CC0-1.0**. Do not
paste text, questions or audio from official IELTS materials or from any other copyrighted
test-prep product — everything in this repository is original by construction, and that is what
keeps it distributable.
