# BandReady

**A complete, offline-first IELTS-style exam prep desktop app.** All four skills, a live AI
voice examiner you actually talk to, band-descriptor scoring with inline feedback,
spaced-repetition vocabulary and a guided study plan — running on your own machine, with your
own AI models, with no account and no telemetry.

> **BandReady is an independent open-source project and is not affiliated with, endorsed by,
> or connected to the IELTS Partners (British Council, IDP: IELTS Australia, and Cambridge
> University Press & Assessment). IELTS is a registered trademark of its owners, used here
> only to describe the exam format this software helps you prepare for. All practice
> materials in BandReady are original and are not official IELTS test content. Band scores
> produced by this software are AI-generated estimates for practice purposes only and do not
> predict official IELTS results.**

**Status: alpha, pre-1.0.** The app runs end to end and the API is feature-complete, but
formats, the on-disk database and the content pack schema may still change between releases,
and there is no migration promise yet. Treat band estimates as directional — they are estimates
from a model you chose, not marks. [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md)
is the honest inventory of what is built, what is not, and what has never been independently
checked.

---

## Who it is for

- **Self-studying candidates** who cannot afford a monthly subscription or an hourly tutor, and
  who want unlimited speaking practice without booking anyone.
- **People with unreliable or expensive internet.** After setup, BandReady works entirely
  offline: local LLM, local speech-to-text, local text-to-speech, local database.
- **Privacy-conscious learners.** Your essays, recordings and scores never leave the machine.
  There is no server to send them to.
- **Teachers and tutors** who want a consistent, reproducible practice environment to assign,
  and who want to author their own content packs.
- **Developers** who want a real, non-trivial local-AI application to learn from or fork.

BandReady is **not** a chatbot wrapper. It is an exam room: authentic question formats, real
timers, per-criterion band descriptors, and longitudinal progress tracking.

## Screenshots

**Not captured yet.** They land with the first tagged release rather than sitting here as six
broken image links. [`docs/screenshots/README.md`](docs/screenshots/README.md) holds the capture
contract — the six filenames, dark theme at 1440×900 @2×, shipped content only, sidebar visible
in every shot — so the set reads as one product rather than six unrelated screenshots.

## Features

### Speaking — [`SPEAKING-CONTENT.md`](docs/SPEAKING-CONTENT.md)
Real-time voice conversation with an AI examiner over WebRTC (pipecat 1.5 +
SmallWebRTCTransport + Silero VAD), with sub-second turn-taking. Full 3-part mock interviews,
single-part drills, topic drills and quick chats. Every session produces a timed transcript,
per-criterion bands (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy,
Pronunciation), quoted evidence for each judgement, and per-turn audio replay.

### Writing — [`05-writing-module.md`](docs/plan/05-writing-module.md)
Academic Task 1 (charts, tables, processes, maps — rendered from a structured chart spec),
General Training Task 1 (letters) and Task 2 essays. Timed exam mode or untimed practice, with
word count, paste detection, and a pre-check that catches an off-topic or too-short answer
*before* you spend a model call on it. Feedback is per-criterion with character-anchored inline
annotations, evidence quotes, a rewrite loop, and an on-demand band-8/9 model answer.

### Reading — [`READING-CONTENT.md`](docs/READING-CONTENT.md)
Full Academic and General Training tests (3 passages, 40 questions, 60 minutes) plus
single-passage practice and question-type drills. Every IELTS question type is implemented and
auto-marked with the real answer-matching rules (case folding, abbreviations, thousands
separators, hyphen/space equivalence, word limits). Review mode shows the answer key, the
anchoring paragraph, an explanation, the trap you fell for, and a "why was I wrong?" analysis.

### Listening — [`LISTENING-CONTENT.md`](docs/LISTENING-CONTENT.md)
Four-part tests whose audio is synthesised locally by Kokoro TTS per role and per accent and
then cached, so a test ships as a few kilobytes of script rather than a large audio download.
Exam-faithful playback rules (plays once, no seeking), a transfer window, per-part practice with
transcript reveal, and the same auto-marking engine as Reading.

### Vocabulary + SRS — [`GRAMMAR-VOCAB.md`](docs/GRAMMAR-VOCAB.md)
An FSRS-scheduled bank fed automatically by your own writing and speaking errors, plus curated
topic decks and band-7 upgrade pairs from the content pack. Six exercise types (flip, cloze,
use-in-sentence with LLM checking, collocation, audio recall, speaking drill), an inbox of
suggestions you accept or dismiss, and an offline WordNet dictionary for double-click lookups.

### Pronunciation — [the research behind it](docs/research/pronunciation/)
Word-timing analysis over your speaking audio: fluency signals (speech rate, pause profile,
filled pauses), low-confidence word flagging, minimal-pair perception drills and word-stress
tapping, with reference audio rendered on demand.

**BandReady does not score your accent, and does not pretend to.** IELTS marks
*intelligibility* — whether a listener understands you — not how close you sound to any
particular English. The signals here are inferred from speech-recognition confidence, which can
tell you that a word was hard to make out; it cannot tell you a sound was wrong. So you get
flags and drills, never a pronunciation band and never the word "mispronounced". Every response
carries that caveat and the app shows it.

### Grammar & Usage — [`GRAMMAR-VOCAB.md`](docs/GRAMMAR-VOCAB.md)
A grammar syllabus rather than a quiz bank. Each point teaches what the form *does to a
sentence*, names the false rule learners are usually taught, and drills it up a six-rung mastery
ladder that will not schedule anything until you have shown you understand it. Choice points make
you pick between two correct forms and say what the other one would have meant. Mistakes from
your writing and speaking feed back in as error codes, so the grammar you practise is the grammar
you actually get wrong.

### Theory — the reference, always open — [`THEORY-CONTENT.md`](docs/THEORY-CONTENT.md)
Around a hundred plain-English articles across 8 chapters, from "what a sentence is made of" to conditionals
and the passive. **Unlike every practice screen, Theory is never locked.** A learner who does not
yet know what a modal *is* has to be able to look it up before being asked to practise it, so it
needs no attempt, no prerequisite and no unlock. Weighted towards A1/A2, because the reader who
most needs a reference is the one who cannot yet read the explanations in other books.

### Curriculum & progress — [`10-curriculum-progress.md`](docs/plan/10-curriculum-progress.md)
An adaptive placement test seeds four band estimates, which generate a dated study plan with
daily sessions. The plan adapts to your results, the dashboard shows band trajectories against
your target and exam date, and an exam-readiness checklist tells you honestly whether you are
there yet. Streaks respect the rest days you configure.

### Everything else
Local-first SQLite with Alembic migrations, encrypted provider credentials, a signed-ticket
scheme for media and WebSocket access, one-shot job tracking with progress and cancellation,
importable and exportable `.brpack` content packs, full data export, and dark and light themes.

## Quickstart

### Prerequisites

| Tool | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 or newer | Electron shell + Vite renderer |
| [pnpm](https://pnpm.io) | 9 (`corepack enable` pins 9.12.0) | workspace package manager |
| [Python](https://python.org) | 3.11 | the sidecar |
| [uv](https://docs.astral.sh/uv/) | latest | Python environment + lockfile |

### Run it

```bash
git clone https://github.com/Luxshan2000/bandready.git
cd bandready

# 1. JavaScript workspace (Electron shell + React renderer)
pnpm install

# 2. Python sidecar. The `voice` extra is large — pipecat, torch and faster-whisper come to
#    roughly 2-3 GB of wheels — but it is what makes the live speaking module work.
#    Drop `--extra voice` for a text-only install; everything except live speaking still runs.
cd sidecar && uv sync --extra dev --extra voice && cd ..

# 3. Start Electron + Vite + the sidecar
node scripts/dev.mjs
```

Useful variants of the dev orchestrator:

```bash
node scripts/dev.mjs --browser        # no Electron: sidecar on a fixed port + Vite, driven
                                      # from a plain browser (this is what the E2E suite uses)
node scripts/dev.mjs --no-mock        # use your real configured providers instead of the mocks
node scripts/dev.mjs --port 5273 --sidecar-port 8710
```

The first launch walks you through onboarding: exam format and target band, a placement test,
provider detection, model downloads, and a microphone check.

## Configuring an AI provider

BandReady never ships a model or an API key. You pick exactly **one LLM, one STT and one TTS**
in **Settings → Providers**, and any OpenAI-compatible endpoint works. The settings screen
detects what is already running on your machine and offers it first; **Verify** sends one real
request and lists the models the endpoint actually serves.

### Ollama — any platform, easiest start

```bash
ollama pull qwen3:14b            # or llama3.1:8b on a smaller machine
ollama serve                     # usually already running
```

| Field | Value |
|---|---|
| Preset | `Ollama` |
| Base URL | `http://127.0.0.1:11434/v1` |
| Model | `qwen3:14b` |
| API key | *(leave empty)* |

### MLX on Apple Silicon — the fastest local option on a Mac

```bash
uv tool install mlx-lm
mlx_lm.server --model mlx-community/Qwen3-14B-4bit --port 8080
```

| Field | Value |
|---|---|
| Preset | `MLX (mlx-lm server)` |
| Base URL | `http://127.0.0.1:8080/v1` |
| Model | `mlx-community/Qwen3-14B-4bit` |
| API key | *(leave empty)* |

Pair it with the `MLX Whisper` STT preset for a fully Metal-accelerated stack.

### A cloud OpenAI-compatible key — no local GPU needed

Anything that speaks the OpenAI chat-completions API works: OpenAI, OpenRouter, Groq, DeepSeek,
or your own gateway through the `Custom OpenAI-compatible…` preset.

| Field | OpenAI | OpenRouter | Groq |
|---|---|---|---|
| Base URL | `https://api.openai.com/v1` | `https://openrouter.ai/api/v1` | `https://api.groq.com/openai/v1` |
| Model | `gpt-4.1-mini` | `meta-llama/llama-3.3-70b-instruct` | `llama-3.3-70b-versatile` |
| API key | `sk-…` | `sk-or-…` | `gsk_…` |

Keys are encrypted at rest with a per-install key stored in your data directory, are never
written to a log (the logger redacts them), and come back to the UI masked as `•••• (stored)`.

### Keeping a key out of your disk entirely

Set the key field to the literal `${OPENROUTER_API_KEY}` (any `${VAR}` works) and BandReady
reads it from the environment at request time instead of storing anything:

```bash
export OPENROUTER_API_KEY='sk-or-…'
open -a BandReady          # or: node scripts/dev.mjs
```

Only variables whose names end in `_API_KEY` are forwarded to the sidecar — the rest of your
environment is not inherited. If the variable is missing you get a precise error naming it
(`OPENROUTER_API_KEY is not set in your environment`), never a silent auth failure.

> **macOS caveat:** an app launched from Finder or Spotlight inherits nothing from your shell,
> so a `${VAR}` reference cannot resolve there and you get
> `OPENROUTER_API_KEY is not set in your environment`. Either launch it from a terminal as
> above, or paste the key into Settings and let it be encrypted at rest.

> Speaking sessions are latency-sensitive. A cloud LLM works, but a local one on the same
> machine is what makes the examiner feel like a conversation rather than a form.

## How local models are downloaded

Nothing is bundled: the installer stays small and no model licence is redistributed. On first
run, onboarding lists the artifacts your chosen presets need and fetches them on demand.

| Artifact | Used by | Size |
|---|---|---|
| Kokoro TTS v1.0 (`.onnx` + voice pack) | Listening audio, the examiner's voice | ~340 MB |
| faster-whisper `base` / `small` / `large-v3-turbo` | Local speech-to-text | 145 MB / 484 MB / 1.6 GB |
| MLX Whisper large-v3-turbo | Local speech-to-text on Apple Silicon | ~1.5 GB |
| English WordNet | Offline dictionary lookups | ~30 MB |

Downloads are ordinary background jobs — resumable, cancellable, with live progress — and land
in `<data dir>/models/`. If you already have the files, **Settings → Models → Import** points
BandReady at them without downloading anything, which is the offline-install path. You can
re-open the download screen at any time; nothing is ever fetched silently.

### Reusing weights you already have

On a slow or metered connection, re-downloading a gigabyte you already own is the difference
between using the app today and not. So before fetching anything, the sidecar looks for these
exact files in the places they normally end up:

- `~/.cache/pipecat/kokoro-onnx/` — left by any other Pipecat app
- `~/.cache/huggingface/hub/` — left by `faster-whisper`, `transformers`, or a previous install
- `$HF_HOME`, `$OVUI_KOKORO_MODEL`, `$OVUI_KOKORO_VOICES` when they are set
- anything on `BANDREADY_MODEL_SEARCH_PATH` (`os.pathsep`-separated), for an external drive

Whatever it finds is **hard-linked** into `<data dir>/models/`, so adoption is instant, costs no
extra disk, and leaves the original untouched — the app that downloaded it keeps working. An
artifact is only adopted when every file it declares is present and non-empty, so a half-finished
download elsewhere can never be mistaken for a usable model.

This runs automatically at startup and is reported in the log:

```
adopted 3 local model artifact(s) (942 MB not downloaded): kokoro-v1.0, faster-whisper-base, faster-whisper-small
```

`GET /api/v1/models/local` previews what is reusable without changing anything, and
`POST /api/v1/models/local/adopt` performs it on demand. To keep BandReady out of your caches
entirely, set `BANDREADY_ADOPT_LOCAL_MODELS=0`.

## Where your data lives

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/BandReady` |
| Windows | `%APPDATA%\BandReady` |
| Linux | `$XDG_DATA_HOME/BandReady` (default `~/.local/share/BandReady`) |

One SQLite database, your settings, downloaded models, generated audio and installed content
packs all live under that single directory. Deleting it resets the app completely.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) has the full layout and the safe way to reset.

## What ships in the box

One content pack, `core-en`, imported on first run. It is first-party and CC0, so you can reuse
or fork it. The bank is still growing, so these counts are a snapshot taken on **2026-08-15**
rather than a promise:

| Bank | What is in it |
|---|---|
| Reading | 12 tests (8 Academic, 4 General Training) over 36 passages — 480 questions, 15 question types |
| Listening | 7 tests over 43 scripts — 415 questions, 8 question types, including map labelling |
| Writing | 102 prompts across Academic Task 1, General Training Task 1 and Task 2, with chart specs |
| Speaking | 496 cue cards across Parts 1–3 |
| Vocabulary | 1,246 entries with contexts, collocations and band-7 upgrade pairs |
| Grammar | 156 points with worked contrasts and graded item banks |
| Theory | 99 reference articles across 8 chapters |
| Pronunciation | 20 minimal-pair contrasts, plus the built-in set |

For today's numbers rather than that snapshot, ask the pack itself — it prints a count per bank
and verifies its own checksums:

```bash
uv run --project sidecar python -m tools.content.validate content/core-en
```

No audio is shipped: listening audio is synthesised locally by Kokoro on first play and cached,
which is why a test costs kilobytes rather than megabytes.

## How the repository is laid out

```
bandready/
├── app/              Electron shell + React renderer (pnpm workspace "bandready-app")
│   ├── electron/     main, preload, sidecar spawn/health/teardown — the Node side
│   ├── src/features/ one directory per screen; route.tsx, page.tsx, store.ts, components/
│   ├── src/components/ui/        the shared design-system kit
│   └── build/        electron-builder buildResources (entitlements, icon) — NOT build output
├── sidecar/bandready/            the Python backend
│   ├── server/routes/            one module per API family, auto-discovered
│   ├── scoring/ srs/ curriculum/ voice/ audio/ pron/ providers/
│   ├── db/ migrations/           SQLAlchemy models + Alembic
│   └── content/                  pack validation and import
├── content/core-en/  the shipped content pack, plus per-module authoring trees
├── tools/content/    the pack pipeline CLIs (merge → validate → build)
├── scripts/          dev.mjs (dev orchestrator), build-electron.mjs, stage-sidecar.mjs
├── e2e/              Playwright specs, driven against a real sidecar in browser mode
└── docs/             see below
```

**Two seams are auto-discovered, and you never edit a registry to use them.** A new sidecar route
is a new file in `sidecar/bandready/server/routes/` that exposes a module-level `router`. A new
screen is a new `app/src/features/<name>/route.tsx` that default-exports
`defineFeatureRoute(...)`. Editing `server/app.py`, `App.tsx` or `Sidebar.tsx` to register
something is a mistake, not a shortcut. [CONTRIBUTING.md](CONTRIBUTING.md) §3 and §4 walk through
both.

Two directory names collide, and the collision has bitten people: repository-root `build/` is
packaging output and is gitignored, while `app/build/` is tracked electron-builder resources.
Likewise root `dist-electron/` holds installers, `app/dist-electron/` holds compiled bundles.
[docs/REPOSITORY.md](docs/REPOSITORY.md) explains why the `.gitignore` rule is anchored.

## Working on it

```bash
# Typecheck and unit-test the renderer
cd app && npx tsc --noEmit && npx vitest run

# Sidecar tests and lint
uv run --project sidecar pytest sidecar/tests/ -q
uv run --project sidecar ruff check sidecar/bandready sidecar/tests

# End to end (needs the app running in browser mode)
node scripts/dev.mjs --browser        # in one terminal
cd app && npx playwright test         # in another
```

CI runs the two halves as independent jobs, so a broken renderer still tells you whether the
sidecar is green. The Playwright suite runs in its own workflow.

## Building an installer

The installer bundles a relocatable CPython plus the sidecar's venv, because the app has to run
on a machine with no Python. Model weights are deliberately **not** bundled — that keeps the
download small and redistributes nobody's model licence.

```bash
# 1. Stage the Python runtime and the sidecar venv into build/
#    --voice adds pipecat + faster-whisper (~2-3 GB, required for live speaking)
node scripts/stage-sidecar.mjs --arch arm64 --voice

# 2. Build the renderer and the main/preload bundles
pnpm --filter bandready-app build
node scripts/build-electron.mjs

# 3. Package
cd app && pnpm exec electron-builder --config electron-builder.yml --mac dmg --arm64
```

Installers land in the repository-root `dist-electron/`. A macOS arm64 DMG comes to roughly
156 MB without the voice extra.

**Builds are unsigned.** There is no Developer ID or Windows certificate for this project, so
macOS shows a Gatekeeper warning and Windows shows SmartScreen. `stage-sidecar.mjs` also builds
the venv for the *host* platform, so a Windows installer cannot be produced from a Mac — that is
what [`.github/workflows/release.yml`](.github/workflows/release.yml) is for. It builds on each
platform and attaches the results to a GitHub **pre-release**, with notarization explicitly
disabled and every build labelled so nobody mistakes a test build for a shipped one.

## Documentation

**Start here.**

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, the module map, and how to add a route or
  a screen. The one document to read before your first change.
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — dev-mode architecture, debugging, log and
  data locations, resetting local state.
- **[docs/REPOSITORY.md](docs/REPOSITORY.md)** — the tree around the code: what is tracked, what
  is generated, and which docs to trust.
- **[docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md)** — what is built, what is
  not, and the evidence for each claim.

**The content banks**, one document each — what ships, the schema, and how to author more:
[reading](docs/READING-CONTENT.md) · [listening](docs/LISTENING-CONTENT.md) ·
[speaking](docs/SPEAKING-CONTENT.md) · [grammar & vocabulary](docs/GRAMMAR-VOCAB.md) ·
[theory](docs/THEORY-CONTENT.md). *(Writing has no such document yet.)*

**[docs/plan/](docs/plan/README.md) is design intent, not status.** Twenty-two documents written
before implementation began, kept because the reasoning behind each decision is recorded nowhere
else. Much of it shipped differently. Where the plan and the code disagree, the code is right —
each document says so in its own header.

## License

BandReady is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE). The
first-party practice content under `content/` is released separately as **CC0-1.0**, so you can
reuse it however you like. Models you download are covered by their own licences.
