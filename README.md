<p align="center">
  <img alt="IELTS Prep" width="96" height="96" src="docs/brand/logo.svg">
</p>

<h1 align="center">IELTS Prep</h1>

<p align="center"><sub><b>BandReady</b></sub></p>

<p align="center">
  <b>Offline-first IELTS exam preparation for your own machine.</b><br/>
  All four skills, a live AI voice examiner you actually talk to, and band-descriptor scoring — running against AI models you choose, local or cloud. You supply the model; the app is free and there is no account.
</p>

<p align="center">
  <a aria-label="License: MIT" href="LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-0B7285.svg?style=flat-square&labelColor=000000" />
  </a>
  <a aria-label="No account, no telemetry" href="#-privacy-and-offline">
    <img alt="No account, no telemetry" src="https://img.shields.io/badge/Privacy-No%20account%20%C2%B7%20No%20telemetry-0B7285?style=flat-square&labelColor=000000" />
  </a>
  <a aria-label="Runs offline" href="#-faq">
    <img alt="Offline-first" src="https://img.shields.io/badge/AI-Local%20or%20cloud%2C%20your%20choice-2F9E44?style=flat-square&labelColor=000000" />
  </a>
  <a aria-label="Report an issue" href="https://github.com/Luxshan2000/ielts-prep/issues">
    <img alt="Report an issue" src="https://img.shields.io/badge/Issues-Report%20a%20bug-0B7285?style=flat-square&labelColor=000000&logo=github&logoColor=white" />
  </a>
</p>

<p align="center">
  <a aria-label="Install" href="#-install-users"><b>Install</b></a>
&ensp;•&ensp;
  <a aria-label="Build from source" href="#-build-from-source">Build from source</a>
&ensp;•&ensp;
  <a aria-label="Contributing" href="CONTRIBUTING.md">Contributing</a>
&ensp;•&ensp;
  <a aria-label="Report an issue" href="https://github.com/Luxshan2000/ielts-prep/issues">Report an issue</a>
</p>

<!--
  HERO SCREENSHOT PLACEHOLDER — drop the dashboard capture at docs/screenshots/dashboard.png
  (dark theme, 1440x900 at 2x, shipped content only, sidebar visible), then uncomment:

  <p align="center">
    <img alt="The BandReady dashboard" src="docs/screenshots/dashboard.png" width="100%">
  </p>

  docs/screenshots/README.md holds the full capture contract and the other five filenames.
-->

IELTS Prep is an exam room, not a chatbot wrapper. You get authentic question formats, real
timers, per-criterion band descriptors and longitudinal progress tracking. It is an Electron app
around a Python sidecar that binds to loopback only, so your essays, recordings and scores stay
on your disk unless you point it at a cloud provider yourself.

> **Not affiliated with the IELTS Partners** (British Council, IDP: IELTS Australia, and
> Cambridge University Press & Assessment). IELTS is a registered trademark of its owners. This
> is an independent, unofficial project; the name describes the exam it prepares you for and
> implies no endorsement by, or association with, the trademark holders. All practice material
> here is original and is not official IELTS test content. Band scores produced by this software
> are AI-generated estimates for practice only and do not predict official IELTS results.

## Table of contents

- [✨ Features](#-features)
- [🖼 Screenshots](#-screenshots)
- [📥 Install (users)](#-install-users)
- [🚀 Build from source](#-build-from-source)
- [⚙️ Configuration](#-configuration)
- [📚 Documentation](#-documentation)
- [🗺 Project layout](#-project-layout)
- [👏 Contributing](#-contributing)
- [❓ FAQ](#-faq)
- [📄 License](#-license)

## ✨ Features

### Speaking

- **A live voice examiner** — real-time WebRTC conversation over pipecat 1.5, SmallWebRTCTransport and Silero VAD. You speak, it answers, it follows up.
- **Full three-part mocks** — plus single-part drills, topic drills and quick chats when you have ten minutes rather than fifteen.
- **A scored report every time** — timed transcript, four criterion bands, quoted evidence for each judgement, and per-turn audio replay.
- **496 cue cards** across Parts 1 to 3, in 108 linked card sets over 20 topics.

The live call has been confirmed at a real microphone by the project owner. Headless Chromium
cannot establish the peer connection, so no automated test guards it.

### Writing

- **All three task types** — Academic Task 1 (charts, tables, processes and maps rendered from a structured chart spec), General Training Task 1 letters, and Task 2 essays.
- **A pre-check before you spend a model call** — it catches an off-topic or too-short answer while you can still fix it.
- **Character-anchored inline annotations** — each error is pinned to the exact offsets in your text, with a fix and an explanation.
- **A rewrite loop and an on-demand band 8/9 model answer**, so you can see the gap rather than guess at it.
- **102 prompts** with chart specs and band ladders.

### Reading

- **Full Academic and General Training tests** — 3 passages, 40 questions, 60 minutes — plus single-passage practice and question-type drills.
- **Every IELTS question type**, auto-marked with the real matching rules: case folding, abbreviations, thousands separators, hyphen and space equivalence, word limits.
- **A review that explains the trap** — answer key, anchoring paragraph, explanation, and a "why was I wrong?" analysis.
- **12 tests** (8 Academic, 4 General Training) over 36 passages, 480 questions, 15 question types.

### Listening

- **Audio synthesised on your machine** — Kokoro TTS renders each script per role and per accent on first play, then caches it. A test ships as kilobytes of script, not megabytes of audio.
- **Exam-faithful playback** — plays once, no seeking, with a proper transfer window.
- **Per-part practice with transcript reveal**, and the same auto-marking engine as Reading.
- **7 tests** over 43 scripts across UK, US and AU voices — 415 questions, 8 question types, including map labelling rendered from shipped SVGs.

### Vocabulary, grammar and theory

- **An FSRS bank fed by your own mistakes** — errors from your writing and speaking arrive as suggestions you accept or dismiss.
- **Six exercise types** — flip, cloze, use-in-sentence with LLM checking, collocation, audio recall and speaking drill.
- **A grammar syllabus, not a quiz bank** — 156 points, each naming the false rule learners are usually taught, drilled up a six-rung mastery ladder.
- **99 reference articles** across 8 chapters that are never locked, because someone who does not know what a modal is has to be able to look it up first.
- **An offline WordNet dictionary** for double-click lookups anywhere in the app.

### Pronunciation

- **Fluency signals from your own audio** — speech rate, pause profile, filled pauses, and low-confidence word flagging.
- **Minimal-pair perception drills and word-stress tapping**, with reference audio rendered on demand.
- **No accent score, ever.** IELTS marks intelligibility, not how close you sound to any particular English. These signals come from speech-recognition confidence, which can tell you a word was hard to make out but cannot tell you a sound was wrong. You get flags and drills, never a pronunciation band and never the word "mispronounced".

### The groundwork

- **A placement test that seeds a study plan** — four band estimates become a dated plan with daily sessions that adapts to your results.
- **Local SQLite with Alembic migrations**, so an update never means losing your history.
- **Jobs with real progress and cancellation** — anything slower than a second returns a job id you poll.
- **Importable and exportable `.brpack` content packs**, plus a full data export.
- **Dark and light themes**, and keyboard-usable timers and test players.

### Privacy and offline

- **The sidecar binds to loopback only** and requires a per-launch bearer token. Nothing else on your machine can call it.
- **Provider API keys are encrypted at rest** with a per-install key, masked in the UI, and redacted from every log line.
- **Recordings and transcripts stay in your data directory.** There is no BandReady server to send them to.
- **Cloud is opt-in and text-only for marking** — if you configure a cloud LLM, it sees the essay or transcript you are having marked, and nothing else.
- **Model weights are never bundled and never committed.** They download on first run into your data directory, or get hard-linked from caches you already have.

## 🖼 Screenshots

Not captured yet — they land with the first tagged release rather than sitting here as six
broken image icons.

| Screen | File to drop in | Screen | File to drop in |
|---|---|---|---|
| **Dashboard** — band trend, streak, today's session | `docs/screenshots/dashboard.png` | **Speaking** — a live session mid-turn | `docs/screenshots/speaking.png` |
| **Writing** — the desk with an annotated evaluation | `docs/screenshots/writing.png` | **Reading** — the test player and palette | `docs/screenshots/reading.png` |
| **Listening** — a test part with audio playing | `docs/screenshots/listening.png` | **Vocabulary** — the review player | `docs/screenshots/vocab.png` |

<!--
  Once those six files exist, delete the table above and uncomment this one. The paths already
  match. docs/screenshots/README.md holds the capture contract: dark theme, 1440x900 at 2x,
  shipped content only, sidebar visible in every shot, PNG under ~400 KB each.

  |  |  |
  |---|---|
  | <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%"> <br/> **Dashboard** | <img src="docs/screenshots/speaking.png" alt="Speaking" width="100%"> <br/> **Speaking** |
  | <img src="docs/screenshots/writing.png" alt="Writing" width="100%"> <br/> **Writing** | <img src="docs/screenshots/reading.png" alt="Reading" width="100%"> <br/> **Reading** |
  | <img src="docs/screenshots/listening.png" alt="Listening" width="100%"> <br/> **Listening** | <img src="docs/screenshots/vocab.png" alt="Vocabulary" width="100%"> <br/> **Vocabulary** |
-->

[`docs/screenshots/README.md`](docs/screenshots/README.md) holds the capture contract.

## 📥 Install (users)

Building from source is the supported route today, and it takes about fifteen minutes on a fast
connection. Two ways in:

1. **Build it from source.** This is the supported path, and it takes about fifteen minutes on a
   fast connection. Jump to [Build from source](#-build-from-source).
2. **Run the release workflow yourself.**
   [`.github/workflows/release.yml`](.github/workflows/release.yml) builds on Windows and macOS
   runners and attaches installers to a GitHub pre-release. It is `workflow_dispatch` only, so
   you need push access to this repository or to your own fork.

Whichever route you take, the first launch needs a network connection so it can fetch model
weights (roughly 340 MB for the voice, more if you want local speech-to-text). Everything after
that runs offline.

### Opening it the first time

Builds are unsigned, so both systems ask once before they will run a new app. This is what they
ask and what to press.

- **macOS** — open **System Settings → Privacy & Security**, scroll to the message about the app
  being blocked, and click **Open Anyway**. Right-click then Open no longer works on macOS 15.
- **Windows** — SmartScreen shows "Windows protected your PC". Click **More info**, then
  **Run anyway**.

After that first launch neither system asks again.

## 🚀 Build from source

> **Prerequisites**
>
> | Tool | Version | Why |
> |---|---|---|
> | [Node.js](https://nodejs.org) | 20 or newer | Electron shell and Vite renderer |
> | [pnpm](https://pnpm.io) | 9 (`corepack enable` pins 9.12.0) | workspace package manager |
> | [Python](https://python.org) | 3.11 | the sidecar |
> | [uv](https://docs.astral.sh/uv/) | latest | Python environment and lockfile |

**1. Clone and install the JavaScript workspace.**

```bash
git clone https://github.com/Luxshan2000/ielts-prep.git
cd bandready
pnpm install
```

**2. Install the Python sidecar.**

```bash
cd sidecar && uv sync --extra dev --extra voice && cd ..
```

The `voice` extra is large — pipecat, torch and faster-whisper come to roughly 2 to 3 GB of
wheels — but it is what makes the live speaking module work. Drop `--extra voice` for a
text-only install and everything except live speaking still runs.

**3. Start everything.**

```bash
node scripts/dev.mjs
```

That spawns the sidecar on a random loopback port, waits for the health handshake, starts Vite,
and opens Electron. Useful variants:

```bash
node scripts/dev.mjs --browser        # no Electron: fixed-port sidecar + Vite in a plain
                                      # browser (this is the mode the E2E suite drives)
node scripts/dev.mjs --no-mock        # use your real configured providers instead of mocks
node scripts/dev.mjs --port 5273 --sidecar-port 8710
```

**4. Run the tests** (optional, but it tells you the install is sound).

```bash
uv run --project sidecar pytest sidecar/tests/ -q      # 1,352 tests
uv run --project sidecar ruff check sidecar/bandready sidecar/tests
cd app && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test
```

**5. Package an installer** (optional). The bundle carries a relocatable CPython plus the
sidecar's venv, because the app has to run on a machine with no Python.

```bash
node scripts/stage-sidecar.mjs --arch arm64 --voice
pnpm --filter bandready-app build
node scripts/build-electron.mjs
cd app && pnpm exec electron-builder --config electron-builder.yml --mac dmg --arm64
```

Installers land in the repository-root `dist-electron/`. A macOS arm64 DMG comes to roughly
156 MB without the voice extra. `stage-sidecar.mjs` builds the venv for the *host* platform, so
a Windows installer cannot be produced from a Mac — that is what the release workflow is for.

## ⚙️ Configuration

BandReady never ships a model or an API key. You pick exactly one LLM, one STT and one TTS under
**Settings → Providers**. The screen detects what is already running on your machine and offers
it first, and **Verify** sends one real request and lists the models the endpoint actually
serves.

| Preset | Modalities | Kind | Key | Notes |
|---|---|---|---|---|
| **Ollama** | LLM | local server | none | The easy local start. `ollama pull qwen3:14b`, base URL `http://127.0.0.1:11434/v1`. |
| **OpenRouter** | LLM, STT, TTS | cloud | `sk-or-...` | One key covers all three. Base URL is locked to `https://openrouter.ai/api/v1`. |
| **Local Whisper** | STT | in-process | none | faster-whisper, int8 on CPU by default. Required for pronunciation feedback. |
| **MLX Whisper** | STT | in-process | none | Apple Silicon only. `large-v3-turbo` runs realtime on an M-series chip. |
| **Kokoro** | TTS | in-process | none | An 82M ONNX voice model. The default everywhere, and what renders listening audio. |
| **Custom OpenAI-compatible** | LLM, STT, TTS | anything | optional | Point it at OpenAI, Groq, DeepSeek, `mlx_lm.server`, `llama.cpp`, or your own gateway. Every field is editable. |

Two things are worth knowing. Model fields are closed dropdowns wherever the endpoint can be
asked what it serves — a plausible-looking model name that 404s deep inside a provider surfaces
three screens away as "the practice engine reported an error", and that is a bad afternoon for
someone who came here to practise English. And pronunciation feedback needs *local* Whisper: a
remote transcript carries no per-word confidence, so there is nothing for the fluency analysis
to read.

**Model weights are never bundled.** On first run, onboarding lists what your chosen presets
need and downloads it into `<data dir>/models/` as a resumable, cancellable background job.

| Artifact | Used by | Size |
|---|---|---|
| Kokoro TTS v1.0 (`.onnx` plus voice pack) | Listening audio, the examiner's voice | ~340 MB |
| faster-whisper `base` / `small` / `large-v3-turbo` | Local speech-to-text | 145 MB / 484 MB / 1.6 GB |
| MLX Whisper large-v3-turbo | Local speech-to-text on Apple Silicon | ~1.5 GB |
| English WordNet | Offline dictionary lookups | ~30 MB |

If you already have those files, the sidecar finds and **hard-links** them at startup rather
than downloading again — it checks `~/.cache/pipecat/kokoro-onnx/`, `~/.cache/huggingface/hub/`,
`$HF_HOME`, and anything on `BANDREADY_MODEL_SEARCH_PATH`. Adoption is instant, costs no extra
disk, and leaves the original untouched. Set `BANDREADY_ADOPT_LOCAL_MODELS=0` to keep BandReady
out of your caches entirely.

### Keeping a key off your disk

Set the API key field to the literal `${OPENROUTER_API_KEY}` (any `${VAR}` works) and the key is
read from the environment at request time instead of being stored:

```bash
export OPENROUTER_API_KEY='sk-or-...'
node scripts/dev.mjs
```

Only variables whose names end in `_API_KEY` reach the sidecar. A missing variable produces a
precise error naming it, never a silent auth failure. On macOS an app launched from Finder
inherits nothing from your shell, so put the value in `<data dir>/.env` instead — or just paste
the key into Settings, where it is encrypted at rest with a per-install key.

### Where your data lives

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/BandReady` |
| Windows | `%APPDATA%\BandReady` |
| Linux | `$XDG_DATA_HOME/BandReady` (default `~/.local/share/BandReady`) |

One SQLite database, your settings, the encryption key, downloaded models, generated audio,
voice recordings and installed content packs all live under that one directory. Deleting it
resets the app completely.

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, the module map, and how to add a route or
  a screen. The one document to read before your first change.
- **[SECURITY.md](SECURITY.md)** — the security model, what stays local, and how to report a
  vulnerability privately.
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — Contributor Covenant 2.1.
- **[CHANGELOG.md](CHANGELOG.md)** — what has changed, in Keep a Changelog format.
- **[docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md)** — what is built, what is
  not, and the evidence for each claim. The most honest file in the repository.
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — dev-mode architecture, debugging, log and
  data locations, resetting local state.
- **[docs/REPOSITORY.md](docs/REPOSITORY.md)** — the tree around the code: what is tracked, what
  is generated, and which docs to trust.
- **The content banks**, one document each — what ships, the schema, and how to author more:
  [reading](docs/READING-CONTENT.md) · [listening](docs/LISTENING-CONTENT.md) ·
  [speaking](docs/SPEAKING-CONTENT.md) · [grammar and vocabulary](docs/GRAMMAR-VOCAB.md) ·
  [theory](docs/THEORY-CONTENT.md). Writing has no such document yet.
- **[docs/plan/README.md](docs/plan/README.md)** — the index to twenty-two numbered design
  documents written before implementation began. This is design *intent*, not status. Much of it
  shipped differently, and where the plan and the code disagree the code is right.

## 🗺 Project layout

```
bandready/
├── app/                      Electron shell + React renderer (pnpm workspace "bandready-app")
│   ├── electron/             main, preload, sidecar spawn/health/teardown — the Node side
│   ├── src/features/<name>/  one directory per screen: route.tsx, page.tsx, store.ts
│   ├── src/components/ui/    the shared design-system kit
│   └── build/                electron-builder buildResources — NOT build output
├── sidecar/bandready/        the Python FastAPI backend
│   ├── server/routes/        one module per API family, auto-discovered at startup
│   ├── server/auth.py        loopback guard, origin guard, bearer token
│   ├── security/secrets.py   credential encryption and log redaction
│   ├── scoring/ srs/ curriculum/ voice/ audio/ pron/ providers/
│   └── db/ migrations/       SQLAlchemy 2.0 models + Alembic
├── content/core-en/          the shipped CC0 content pack, plus per-module authoring trees
├── tools/content/            the pack pipeline CLIs: merge_*.py, then build.py, then validate.py
├── scripts/                  dev.mjs, build-electron.mjs, stage-sidecar.mjs
├── e2e/                      Playwright specs, driven against a real sidecar in browser mode
└── docs/                     everything above, plus the numbered design set docs/plan/00 to 18
```

**Two seams are auto-discovered, and using them never means editing a registry.**

- **A sidecar route** is a new file in `sidecar/bandready/server/routes/` exposing a module-level
  `router`. `discover_routers()` imports every module in that package at startup; one that fails
  to import is logged and skipped, so a half-finished feature cannot stop the app booting.
- **A screen** is a new `app/src/features/<name>/route.tsx` that default-exports
  `defineFeatureRoute(...)`. `App.tsx` finds it with `import.meta.glob`, and the sidebar is
  built from the same objects.

Editing `server/app.py`, `App.tsx` or `Sidebar.tsx` to register something is a mistake, not a
shortcut. [CONTRIBUTING.md](CONTRIBUTING.md) sections 3 and 4 have a working template for each.

One collision to know about: repository-root `build/` is packaging output and is gitignored,
while `app/build/` is *tracked* electron-builder resources. Likewise root `dist-electron/` holds
installers and `app/dist-electron/` holds compiled bundles. The `.gitignore` rule is anchored
with a leading slash for exactly that reason.

## 👏 Contributing

Bug reports, content fixes and pull requests are welcome.
[CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the house rules, the two seams and the content
pipeline. Everyone taking part is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

The most useful thing you can send today is a wrong answer key, a broken question, or a report
that the app does not boot on your platform. The shipped keys were authored and
machine-validated, and nobody has independently checked them.

## ❓ FAQ

**Does it really work offline?**
Yes, once the models are on disk. The examiner, the transcription and the listening audio all
run locally, and the database is a file on your machine. Three exceptions, all of them things you
can see: the first run downloads model weights, any cloud provider you configure gets what you
send it, and a *packaged* build asks GitHub Releases every six hours whether a newer version
exists. That last one sends nothing about you, and it is off entirely in a dev build.

**Does my voice leave the machine?**
Not by default. Recordings are written to `<data dir>/media/speaking/<session id>/` and stay
there. If you choose a cloud speech-to-text provider, your audio goes to that provider — that is
what choosing it means. With local Whisper selected, no audio ever leaves.

**Do I need an API key?**
No, if you run everything locally: Ollama for the examiner, faster-whisper for speech-to-text,
Kokoro for the voice. Yes, if you would rather use OpenRouter or another cloud endpoint. There is
no BandReady account either way.

**Is it free?**
The software is MIT-licensed and the content is CC0. There is no subscription and nothing is
metered. If you point it at a paid API you pay that provider directly — writing evaluation
against a mid-size model measured at roughly $0.0002 per essay.

**How accurate are the band scores?**
Not proven. They are spot-checked against a real model (a strong essay scored 8.0, a weak one
5.0, both plausible) and have never been calibrated against expert-marked samples. Treat them as
directional feedback on your writing, not as a predicted result.

**What is missing?**
Code signing and notarization, any Windows or Linux build that a human has run, automated
coverage of the live voice call, scoring calibration, and an independent check of the answer
keys. [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) lists the rest without
flinching.

**Is this affiliated with IELTS?**
No. See the notice near the top. All practice material here is original and none of it is
official test content.

## 📄 License

BandReady is licensed under the [MIT License](LICENSE) — copyright © 2026 Luxshan Thavarasa.

The first-party practice content under `content/` is released separately as **CC0-1.0**, so you
can reuse, remix or ship it however you like. Models you download are covered by their own
licences, and BandReady redistributes none of them.

One caveat for anyone redistributing a build: the local TTS engine `kokoro-onnx` depends on
`phonemizer-fork` and `espeakng-loader`, which carry GPL-3.0 terms. If you ship a binary that
bundles the voice extra, the licence of that combined work is a question you need to answer for
yourself. The source in this repository is MIT.
