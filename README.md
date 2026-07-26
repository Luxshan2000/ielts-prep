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
and there is no migration promise yet. Treat band estimates as directional. See
[the roadmap](docs/plan/16-roadmap.md) for what lands next.

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

_Placeholders until the first tagged release. Drop the real captures into
`docs/screenshots/` under these filenames and they appear here._

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png)<br>**Dashboard** — band trend, streak, what to do today | ![Speaking](docs/screenshots/speaking.png)<br>**Speaking** — live voice examiner, Parts 1–3 |
| ![Writing](docs/screenshots/writing.png)<br>**Writing desk** — timed editor with inline annotations | ![Reading](docs/screenshots/reading.png)<br>**Reading** — timed test player with question palette |
| ![Listening](docs/screenshots/listening.png)<br>**Listening** — 4-part test, audio generated locally | ![Vocabulary](docs/screenshots/vocab.png)<br>**Vocabulary** — FSRS spaced repetition fed by your own errors |

## Features

### Speaking — [`04-speaking-module.md`](docs/plan/04-speaking-module.md)
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

### Reading — [`06-reading-module.md`](docs/plan/06-reading-module.md)
Full Academic and General Training tests (3 passages, 40 questions, 60 minutes) plus
single-passage practice and question-type drills. Every IELTS question type is implemented and
auto-marked with the real answer-matching rules (case folding, abbreviations, thousands
separators, hyphen/space equivalence, word limits). Review mode shows the answer key, the
anchoring paragraph, an explanation, the trap you fell for, and a "why was I wrong?" analysis.

### Listening — [`07-listening-module.md`](docs/plan/07-listening-module.md)
Four-part tests whose audio is synthesised locally by Kokoro TTS per role and per accent and
then cached, so a test ships as a few kilobytes of script rather than a large audio download.
Exam-faithful playback rules (plays once, no seeking), a transfer window, per-part practice with
transcript reveal, and the same auto-marking engine as Reading.

### Vocabulary + SRS — [`08-vocabulary-srs.md`](docs/plan/08-vocabulary-srs.md)
An FSRS-scheduled bank fed automatically by your own writing and speaking errors, plus curated
topic decks and band-7 upgrade pairs from the content pack. Six exercise types (flip, cloze,
use-in-sentence with LLM checking, collocation, audio recall, speaking drill), an inbox of
suggestions you accept or dismiss, and an offline WordNet dictionary for double-click lookups.

### Pronunciation — [`09-pronunciation-assessment.md`](docs/plan/09-pronunciation-assessment.md)
Word-timing analysis over your speaking audio: fluency signals (speech rate, pause profile,
filled pauses), low-confidence word flagging, minimal-pair perception drills and word-stress
tapping, with reference audio rendered on demand.

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

> **macOS caveat:** an app launched from Finder or Spotlight does not inherit your shell's
> environment, so a `${VAR}` reference will not resolve there. Either launch it from a terminal
> as above, or paste the key into Settings, where it is stored encrypted.

> **If you use a `${VAR}` reference, start BandReady from a shell that has the variable.** The
> app forwards only variables named `*_API_KEY` to the sidecar, and a macOS app launched from
> Finder or Spotlight inherits nothing, so the reference cannot resolve there — you will get
> `OPENROUTER_API_KEY is not set in your environment`. Either launch it as
> `OPENROUTER_API_KEY=sk-or-… open -a BandReady`, or just paste the key into Settings and let it
> be encrypted at rest.

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

## Documentation

- **[docs/plan/README.md](docs/plan/README.md)** — the complete design: vision, architecture,
  every module, the data model, the API contract, the testing and packaging strategy. Read it
  before changing anything non-trivial.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, the module map, and how to add a route or
  a screen (both are auto-discovered; you never edit a registry).
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — dev-mode architecture, debugging, log and
  data locations, resetting local state.

## License

BandReady is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE). The
first-party practice content under `content/` is released separately as **CC0-1.0**, so you can
reuse it however you like. Models you download are covered by their own licences.
