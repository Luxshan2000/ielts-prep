# 03 — Providers & settings

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read `sidecar/bandready/providers/` and `app/src/features/settings/`. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.

_Status: draft v2 (2026-07-25)_

BandReady radically simplifies OpenVoiceUI's multi-agent/multi-connection provider system down to
exactly **one LLM + one STT + one TTS (+ VAD tunables)**, configured on a single Settings page.
Everything goes through OpenAI-compatible HTTP endpoints where a server exists (LLM, cloud
STT/TTS); local STT/TTS run in-process inside the Python sidecar (faster-whisper / mlx-whisper /
Kokoro ONNX). Configuration lives in a single `settings.json` in the app data dir, written with
OpenVoiceUI's proven lockfile robustness (atomic mkstemp→fsync→replace→chmod 0600→fsync-dir,
corrupt-file quarantine, `${ENV_VAR}` interpolation). A small shipped **preset registry** (12
presets) plus OpenVoiceUI's `config_spec`-driven form idea render the whole Settings UI
generically — no provider-specific React code. The app probes localhost ports and PATH binaries to
auto-detect installed engines and offers one-click guided setup per engine. Secrets are encrypted
at rest with a per-install key (OS keychain deferred to v2). See 01-architecture.md for the
sidecar boundary, 02-voice-pipeline.md for how these services are instantiated, 11-data-model.md
for what does NOT live in settings.json (learner data), 13-packaging-distribution.md for bundling
of local model weights, and 18-api-contract.md for the authoritative route inventory (all routes
in this doc live under `/api/v1` per ruling R2-1).

## 1. Design principles

1. **One slot per modality.** `llm`, `stt`, `tts` are single objects, not arrays. No agents, no
   named connections, no per-module overrides in v1. Every module (04-speaking-module.md,
   05-writing-module.md, …) consumes the same three services.
2. **OpenAI-compatible or in-process.** An LLM is always `base_url + api_key + model` against
   `/v1/chat/completions`. STT/TTS are either an OpenAI-compatible endpoint
   (`/v1/audio/transcriptions`, `/v1/audio/speech`) or an in-process engine with no URL at all.
   One code path per shape; OpenVoiceUI proved a single `OpenAICompatLLM` adapter covers
   OpenAI/OpenRouter/Groq/DeepSeek/Ollama/vLLM/LM Studio/llama.cpp purely via `base_url` + key.
3. **Presets are data, not code.** A preset only pre-fills fields and declares which fields to
   show. The renderer is one generic React form driven by `config_spec` (§4).
4. **Renderer never sees secrets.** The Electron renderer gets masked keys; plaintext exists only
   in the sidecar process (§8).
5. **Settings are cheap to blow away.** `settings.json` contains zero learner data. Corrupt file →
   quarantine + factory defaults + Setup wizard reappears. Learner data lives in SQLite
   (11-data-model.md) and is never touched by settings failures.

## 2. `settings.json` — storage & robustness

Location (see 01-architecture.md for data dir resolution):

```
~/Library/Application Support/BandReady/settings.json      # macOS
%APPDATA%/BandReady/settings.json                          # Windows
~/.local/share/BandReady/settings.json                     # Linux
```

Owned and written **only by the Python sidecar** (Electron main/renderer go through
`PATCH /api/v1/settings`). Single-writer, no merge-with-shipped-defaults layer like OpenVoiceUI's
lockfile v2 — defaults are code constants; a missing file simply yields defaults + first-run flag.

### 2.1 Write path (verbatim port of `openvoiceui/models/lockfile.py:write`)

```python
def write_settings(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())          # 1. durable contents before rename
    os.replace(tmp, path)             # 2. atomic swap
    try:
        os.chmod(path, 0o600)         # 3. owner-only (holds encrypted keys)
    except OSError:
        pass
    try:                              # 4. fsync parent dir so the rename
        dfd = os.open(str(path.parent), os.O_RDONLY)   #    survives power loss
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    except OSError:
        pass
```

### 2.2 Read path

- Missing file → in-memory defaults, `first_run: true` in `GET /api/v1/settings` response.
- Parse/validation failure (Pydantic model `Settings.model_validate_json`) → rename to
  `settings.json.corrupt-<UTCts>` (best-effort `os.replace`), log loudly, return defaults.
  Never crash the sidecar on a bad byte.
- `${ENV_VAR}` interpolation (regex `\$\{([A-Z0-9_]+)\}`) applied **at use time**, recursively
  over strings/dicts/lists — the file on disk keeps the literal `${OPENROUTER_API_KEY}`.
  Divergence from OpenVoiceUI (which substitutes `""` silently): an unset variable is a
  **Verify-time error** surfaced as a Settings banner ("`OPENROUTER_API_KEY` is not set in your
  environment"), because a silently empty key produces a confusing 401 (default; flagged).

### 2.3 Schema (JSON Schema draft 2020-12, mirrored by a Pydantic model in the sidecar)

```json
{
  "$id": "bandready://settings.schema.json",
  "type": "object",
  "required": ["version", "llm", "stt", "tts", "vad"],
  "properties": {
    "version": { "const": 1 },
    "llm": {
      "type": "object",
      "required": ["preset", "base_url", "model"],
      "properties": {
        "preset":   { "type": "string" },
        "base_url": { "type": "string", "format": "uri" },
        "api_key":  { "type": "string", "default": "" },
        "model":    { "type": "string" },
        "params": {
          "type": "object",
          "properties": {
            "temperature": { "type": "number", "minimum": 0, "maximum": 2, "default": 0.7 },
            "max_tokens":  { "type": "integer", "minimum": 64, "default": 1024 },
            "timeout_s":   { "type": "number", "default": 30.0 },
            "max_retries": { "type": "integer", "default": 2 }
          }
        }
      }
    },
    "stt": {
      "type": "object",
      "required": ["preset"],
      "properties": {
        "preset":   { "type": "string" },
        "engine":   { "enum": ["faster_whisper", "mlx_whisper", "openai_compat"] },
        "model":    { "type": "string", "default": "base" },
        "device":   { "enum": ["cpu", "auto"], "default": "auto" },
        "compute_type": { "type": "string", "default": "int8" },
        "base_url": { "type": "string" },
        "api_key":  { "type": "string", "default": "" },
        "language": { "const": "en" }
      }
    },
    "tts": {
      "type": "object",
      "required": ["preset"],
      "properties": {
        "preset":     { "type": "string" },
        "engine":     { "enum": ["kokoro_onnx", "openai_compat"] },
        "voice":      { "type": "string", "default": "af_heart" },
        "speed":      { "type": "number", "minimum": 0.5, "maximum": 1.5, "default": 1.0 },
        "model_path": { "type": "string" },
        "voices_path":{ "type": "string" },
        "base_url":   { "type": "string" },
        "api_key":    { "type": "string", "default": "" },
        "model":      { "type": "string" }
      }
    },
    "vad": {
      "type": "object",
      "properties": {
        "confidence": { "type": "number", "minimum": 0.1, "maximum": 0.9, "default": 0.5 },
        "start_secs": { "type": "number", "minimum": 0.05, "maximum": 1.0, "default": 0.2 },
        "stop_secs":  { "type": "number", "minimum": 0.2,  "maximum": 3.0, "default": 0.6 },
        "min_volume": { "type": "number", "minimum": 0.0,  "maximum": 0.6, "default": 0.0 }
      }
    }
  }
}
```

Notes:
- `vad.min_volume` is **schema-clamped to ≤ 0.6** and defaults to `0.0` — gotcha #5 in
  `_context/openvoiceui-findings.md` (the Pipecat default 0.6 blocks normal speech). The
  sidecar additionally clamps at read time so a hand-edited file cannot regress it.
  `vad.stop_secs` also feeds `SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=stop_secs)`
  so the two stay in lockstep — see 02-voice-pipeline.md. The Speaking module may *raise*
  stop_secs per session type (exam-mode long pauses) but only via the same single setting.
- `stt.language` is pinned `"en"` — IELTS is English-only; pinning measurably improves whisper
  accuracy and latency.
- No `ui.theme` here — theme + appearance live in the SQLite `settings` table
  (11-data-model.md §2; R2-19 — the earlier `app_prefs` name is corrected) because they're
  learner-facing, not infrastructure.

### 2.4 Example files (ready to paste)

**macOS Apple Silicon, all local (MLX + mlx-whisper + Kokoro):**
```json
{
  "version": 1,
  "llm": {
    "preset": "mlx_lm",
    "base_url": "http://127.0.0.1:8080/v1",
    "api_key": "",
    "model": "mlx-community/Qwen3-14B-4bit",
    "params": { "temperature": 0.7, "max_tokens": 1024 }
  },
  "stt": { "preset": "mlx_whisper", "engine": "mlx_whisper",
           "model": "mlx-community/whisper-large-v3-turbo", "language": "en" },
  "tts": { "preset": "kokoro", "engine": "kokoro_onnx", "voice": "af_heart", "speed": 1.0 },
  "vad": { "confidence": 0.5, "start_secs": 0.2, "stop_secs": 0.6, "min_volume": 0.0 }
}
```

**Windows/Linux, all local (Ollama + faster-whisper + Kokoro):**
```json
{
  "version": 1,
  "llm": { "preset": "ollama", "base_url": "http://127.0.0.1:11434/v1",
           "api_key": "", "model": "qwen3:14b" },
  "stt": { "preset": "faster_whisper", "engine": "faster_whisper",
           "model": "small", "device": "auto", "compute_type": "int8", "language": "en" },
  "tts": { "preset": "kokoro", "engine": "kokoro_onnx", "voice": "af_heart" },
  "vad": { "confidence": 0.5, "start_secs": 0.2, "stop_secs": 0.6, "min_volume": 0.0 }
}
```

**Cloud LLM via OpenRouter (env-var key), local audio:**
```json
{
  "version": 1,
  "llm": { "preset": "openrouter", "base_url": "https://openrouter.ai/api/v1",
           "api_key": "${OPENROUTER_API_KEY}",
           "model": "anthropic/claude-sonnet-4.5" },
  "stt": { "preset": "faster_whisper", "engine": "faster_whisper", "model": "base" },
  "tts": { "preset": "kokoro", "engine": "kokoro_onnx", "voice": "bf_emma" },
  "vad": { "confidence": 0.5, "start_secs": 0.2, "stop_secs": 0.6, "min_volume": 0.0 }
}
```

**Groq for both LLM and STT (encrypted stored key), local TTS:**
```json
{
  "version": 1,
  "llm": { "preset": "groq", "base_url": "https://api.groq.com/openai/v1",
           "api_key": "enc:v1:gAAAAABm...", "model": "llama-3.3-70b-versatile" },
  "stt": { "preset": "groq_whisper", "engine": "openai_compat",
           "base_url": "https://api.groq.com/openai/v1",
           "api_key": "enc:v1:gAAAAABm...", "model": "whisper-large-v3-turbo",
           "language": "en" },
  "tts": { "preset": "kokoro", "engine": "kokoro_onnx", "voice": "af_heart" },
  "vad": { "confidence": 0.5, "start_secs": 0.2, "stop_secs": 0.6, "min_volume": 0.0 }
}
```

## 3. Preset registry

Shipped as `presets.json` inside the sidecar package (not user-editable; a custom endpoint is
just the `custom_openai` preset with everything unlocked). Served verbatim at
`GET /api/v1/providers/presets`.

| id               | label                    | modalities | kind          | base_url default                       | needs_key | platforms      | notes |
|------------------|--------------------------|------------|---------------|----------------------------------------|-----------|----------------|-------|
| `mlx_lm`         | MLX (mlx-lm server)      | llm        | local-server  | `http://127.0.0.1:8080/v1`             | no        | mac-arm64      | Fastest local LLM on Apple Silicon |
| `ollama`         | Ollama                   | llm        | local-server  | `http://127.0.0.1:11434/v1`            | no        | all            | Default local engine on Win/Linux |
| `lm_studio`      | LM Studio                | llm        | local-server  | `http://127.0.0.1:1234/v1`             | no        | all            | GUI-managed models |
| `llama_cpp`      | llama.cpp (llama-server) | llm        | local-server  | `http://127.0.0.1:8080/v1`             | no        | all            | Port collides with mlx-lm; detection disambiguates (§5) |
| `openai`         | OpenAI                   | llm,stt,tts| cloud         | `https://api.openai.com/v1`            | yes       | all            | Only preset covering all 3 modalities |
| `openrouter`     | OpenRouter               | llm        | cloud         | `https://openrouter.ai/api/v1`         | yes       | all            | One key, every frontier model |
| `groq`           | Groq                     | llm        | cloud         | `https://api.groq.com/openai/v1`       | yes       | all            | Lowest cloud latency |
| `groq_whisper`   | Groq Whisper (STT)       | stt        | cloud         | `https://api.groq.com/openai/v1`       | yes       | all            | Same key as `groq` |
| `deepseek`       | DeepSeek                 | llm        | cloud         | `https://api.deepseek.com/v1`          | yes       | all            | Cheap, strong scoring |
| `faster_whisper` | Local Whisper            | stt        | local-inproc  | —                                      | no        | all            | faster-whisper, int8 CPU default |
| `mlx_whisper`    | MLX Whisper              | stt        | local-inproc  | —                                      | no        | mac-arm64      | large-v3-turbo runs realtime on M-series |
| `kokoro`         | Kokoro (local TTS)       | tts        | local-inproc  | —                                      | no        | all            | 82M ONNX, default everywhere |

`custom_openai` (13th, hidden below a divider): label "Custom OpenAI-compatible…", modalities
llm|stt|tts, all fields editable. Registry entry shape:

```json
{
  "id": "openrouter",
  "label": "OpenRouter",
  "modalities": ["llm"],
  "kind": "cloud",
  "base_url": "https://openrouter.ai/api/v1",
  "base_url_locked": true,
  "needs_key": true,
  "key_env_hint": "OPENROUTER_API_KEY",
  "platforms": ["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"],
  "docs_url": "https://openrouter.ai/docs",
  "suggested_models": ["anthropic/claude-sonnet-4.5", "meta-llama/llama-3.3-70b-instruct"],
  "config_spec": [
    { "key": "api_key", "label": "API key", "type": "password", "required": true,
      "secret": true, "group": "connection", "placeholder": "sk-or-…",
      "help": "Or reference an env var: ${OPENROUTER_API_KEY}" },
    { "key": "model", "label": "Model", "type": "select", "required": true,
      "group": "connection", "options_from": "verify" },
    { "key": "temperature", "label": "Temperature", "type": "number",
      "group": "params", "default": 0.7 }
  ]
}
```

### 3.1 Hidden mock presets (test seam — R2-19)

Mock-provider presets — `mock_llm` (plus `mock_stt`/`mock_tts` for UI-state tests) — ship in
`presets.json` with `"hidden": true` and are **registered only when the sidecar starts with
`BANDREADY_ENABLE_MOCK=1`** in its environment. Without that variable they are absent from
`GET /api/v1/providers/presets` and any attempt to select them fails settings validation
(`validation_error`). With it, tests select them via the normal `PATCH /api/v1/settings` route
(e.g. `{"llm": {"preset": "mock_llm", "fixture_set": "default"}}`) — there is no separate
test-only endpoint (this supersedes 14 §3's earlier `PUT /api/v1/settings/providers` sketch,
per 18-api-contract.md §6). `mock_llm` selects the `MockLLM` adapter of 14-testing-strategy.md
§7.1: same adapter ABC as `OpenAICompatLLM`, canned fixture responses keyed by
`(route, fixture_set)` from `sidecar/bandready/adapters/mock/fixtures/*.json`, zero latency (or
a configurable `latency_ms` for loading-state tests) — so every test layer above unit tests
exercises the **real** scoring orchestration with deterministic fake model output. Hidden
presets never appear in the Settings UI preset dropdowns even when enabled — they are selectable
only via the API.

Direct port of OpenVoiceUI's idea (`adapters/base.py` `FieldSpec`/`ConfigSpec`,
`GET /api/adapters/config-spec`): the React form is a generic renderer over field specs; adding a
preset never touches TSX. TypeScript mirror:

```ts
type FieldType = "text" | "password" | "number" | "select" | "bool" | "slider";
interface FieldSpec {
  key: string; label: string; type: FieldType;
  required?: boolean; default?: unknown; options?: string[];
  options_from?: "verify";        // populate from Verify's model list
  secret?: boolean;               // masked; PATCH sends only if changed
  group: "connection" | "params";
  placeholder?: string; help?: string;
  min?: number; max?: number; step?: number;   // number/slider
}
```

Settings page layout (one page, three cards + VAD card):

```
+--Settings-------------------------------------------------------------+
| Language model                                              [Verified] |
|  Preset  [ Ollama            v]   Model [ qwen3:14b          v]        |
|  Base URL [http://127.0.0.1:11434/v1     ]  (locked for presets)       |
|  > Advanced: temperature, max tokens                                   |
|                                              [ Verify ]  42 ms        |
+------------------------------------------------------------------------+
| Speech-to-text                                              [Verified] |
|  Preset  [ Local Whisper     v]   Model [ small  v]  Device [auto v]   |
+------------------------------------------------------------------------+
| Text-to-speech                                              [Verified] |
|  Preset  [ Kokoro            v]   Voice [ af_heart v]  Speed [==1.0==] |
|                                              [ ▶ Preview voice ]       |
+------------------------------------------------------------------------+
| Microphone & turn-taking                                               |
|  Sensitivity (confidence)  [====0.5====]   Pause before reply  [0.6 s] |
|  > Advanced: start_secs, min_volume (max 0.6)                          |
+------------------------------------------------------------------------+
|                                        [ Discard ]  [ Save settings ]  |
+------------------------------------------------------------------------+
```

Save = one `PATCH /api/v1/settings` with the changed sections (partial deep-merge, R2-19; `PUT`
is dropped); sidecar merges, validates the merged document, writes atomically, and hot-applies
(next voice session picks up new services; no restart). Secret fields round-trip as
`"•••• (unchanged)"` sentinels unless edited — the deep-merge leaves the stored value untouched
when it receives the sentinel.

## 5. Engine auto-detection

`GET /api/v1/providers/detect` (runs all probes concurrently, ~1.5 s budget, 400 ms per-probe
timeout, cached 30 s):

1. **Platform**: `platform.system()` + `platform.machine()`; `("Darwin","arm64")` ⇒ Apple
   Silicon ⇒ prefer MLX presets, hide them elsewhere.
2. **Port probes** (loopback only):
   - `GET http://127.0.0.1:11434/api/tags` → Ollama; response's `models[].name` doubles as the
     model list.
   - `GET http://127.0.0.1:1234/v1/models` → LM Studio.
   - `GET http://127.0.0.1:8080/v1/models` → mlx-lm **or** llama.cpp (both default 8080).
     Disambiguate: model id containing `mlx-community/` or a `/health` llama.cpp response ⇒
     label accordingly; otherwise report generic "OpenAI-compatible server on :8080".
3. **PATH binaries**: `shutil.which()` for `ollama`, `mlx_lm.server`, `llama-server`, `lms`.
   Binary-present-but-port-dead ⇒ "installed, not running" state with a Start action.
4. **In-process engines**: check model weights on disk under `<datadir>/models/`
   (`kokoro-v1.0.onnx` + `voices-v1.0.bin`; whisper CTranslate2/MLX snapshots) ⇒
   "ready" vs "needs download (~N MB)".

Response shape:

```json
{
  "platform": { "os": "darwin", "arch": "arm64", "apple_silicon": true, "ram_gb": 16 },
  "engines": [
    { "id": "ollama",  "state": "running",   "via": "port:11434",
      "version": "0.9.2", "models": ["qwen3:14b", "llama3.1:8b"] },
    { "id": "mlx_lm",  "state": "installed", "via": "binary:mlx_lm.server" },
    { "id": "lm_studio", "state": "absent" },
    { "id": "kokoro",  "state": "needs_download", "download_mb": 340 },
    { "id": "faster_whisper", "state": "needs_download", "download_mb": 484 }
  ]
}
```

The first-run Setup wizard is just this endpoint + the preset registry: it proposes the best
detected local stack (or cloud fallback) as a one-click default.

## 6. Guided one-click setup flows

`POST /api/v1/providers/setup/{engine_id}` runs a step as a one-shot job: it returns
`202 {job_id}` (kind `provider_setup`) and the renderer polls `GET /api/v1/jobs/{id}` for
`{state, progress_pct, detail}` — e.g. `{"progress_pct": 42, "detail": "pulling manifest…"}`
(the earlier SSE progress stream is repealed by R2-3; see 18-api-contract.md §3). Exact
commands (shown to the user verbatim; "Run for me" executes them from the sidecar):

| Engine | Precondition | Command(s) the app runs / shows |
|---|---|---|
| Ollama | binary absent | Show install link `https://ollama.com/download` (we never sudo). Re-detect on window focus. |
| Ollama | binary present | `ollama pull qwen3:14b` (or tier-appropriate model, §7) — run for me, progress via job polling |
| mlx-lm | uv present | `uv tool install mlx-lm` then sidecar spawns managed child: `mlx_lm.server --model mlx-community/Qwen3-14B-4bit --port 8080` (default: **managed by BandReady**, auto-start with app, flagged as default) |
| mlx-lm | uv absent | Show `curl -LsSf https://astral.sh/uv/install.sh \| sh` (copy button only — never executed by the app) |
| llama.cpp | — | Manual-only: show `llama-server -m <gguf> --port 8080`; we detect, we don't install |
| LM Studio | — | Show link `https://lmstudio.ai`; instruct "Developer tab → Start server" |
| faster-whisper | always bundled | In-app download of CTranslate2 weights from HF hub into `<datadir>/models/whisper/<size>` with progress + SHA check |
| mlx-whisper | mac-arm64 | Same, `mlx-community/whisper-large-v3-turbo` snapshot into `<datadir>/models/mlx-whisper/` |
| Kokoro | always bundled code | Download `kokoro-v1.0.onnx` (~310 MB) + `voices-v1.0.bin` (~27 MB) from the kokoro-onnx GitHub release into `<datadir>/models/kokoro/`; paths written into `tts.model_path`/`tts.voices_path` |
| Cloud presets | — | Open `docs_url`, paste key, Verify |

Policy: the app executes only non-privileged, non-shell-pipe commands it fully controls
(`ollama pull`, `uv tool install`, its own downloads). Anything involving installers or `sudo`
is display-only.

## 7. Recommended models by hardware tier

Surfaced in the Setup wizard from `platform.ram_gb`. "Chat" = live examiner conversation
(04-speaking-module.md); "Scoring" = band evaluation against rubrics (04/05, 09-pronunciation-
assessment.md). Scoring is the harder task: rubric adherence and JSON reliability degrade
noticeably below ~14B.

| Tier | LLM (local default) | Chat quality | Scoring quality | STT | TTS |
|---|---|---|---|---|---|
| 8 GB RAM | `llama3.1:8b` q4 or `qwen3:8b` | Good | **Marginal** — wizard recommends a cloud key (DeepSeek/OpenRouter) for scoring runs | whisper `base` (74M, int8) | Kokoro `af_heart` |
| 16 GB RAM | `qwen3:14b` q4 (mac: `mlx-community/Qwen3-14B-4bit`) | Good | Acceptable | whisper `small`; mac: mlx-whisper `large-v3-turbo` | Kokoro |
| 32 GB+ RAM | `qwen3:32b` q4 / `gemma3:27b` | Excellent | Good | `large-v3-turbo` everywhere (faster-whisper or MLX) | Kokoro |
| Any + cloud key | OpenRouter/Groq/DeepSeek frontier model | Excellent | Excellent | Groq `whisper-large-v3-turbo` optional | Kokoro (cloud TTS rarely worth it) |

Defaults flagged as defaults; exact model ids live in `presets.json:suggested_models` so they can
be bumped without a code release mechanism change. STT note: whisper `base` is fine for the live
loop but under-transcribes fast/accented speech — pronunciation assessment
(09-pronunciation-assessment.md) re-transcribes recorded audio with the best available local
whisper regardless of the live STT choice. Kokoro voice suggestions for examiner personas:
`af_heart`, `bf_emma` (British, exam-authentic), `am_michael`.

## 8. Secrets handling

**Decision: encrypted-at-rest inside `settings.json`, per-install key — OpenVoiceUI's model.**
OS keychain (keytar/`safeStorage` in Electron main) is deferred to v2: it splits secret ownership
across the Electron/Python boundary, breaks headless sidecar tests, and keytar is
maintenance-risky. Flagged as a default worth revisiting.

- Per-install Fernet key auto-generated at first boot → `<datadir>/secret.key`, `chmod 0600`.
  No shared fallback key ever (OpenVoiceUI lesson).
- `PATCH /api/v1/settings` with a plaintext `api_key` ⇒ sidecar encrypts to `enc:v1:<fernet-token>`
  before the atomic write. `${ENV_VAR}` values are stored literally (never encrypted) and
  resolved at use time — power users keep keys out of the file entirely.
- `GET /api/v1/settings` masks: `enc:v1:…` → `"•••• (stored)"`, `${X}` → shown literally,
  plaintext never returned.
- Threat model honesty (documented in-app): `secret.key` sits beside the ciphertext, so this is
  obfuscation against casual reads/backup leaks, not against a local attacker with user
  privileges. That is the accepted v1 posture for a single-user local app.
- Decrypted values live only in sidecar process memory; never logged (redaction filter on the
  logger, ported from OpenVoiceUI's secrets module).

## 9. Verify semantics

One `POST /api/v1/providers/verify` with body `{"modality": "llm" | "stt" | "tts", "config": {…form values…}}`
(so users verify before saving). Behavior by kind:

- **LLM / cloud STT-TTS (server-backed)**:
  1. `GET {base_url}/models` — 4 s timeout, wall-clock latency recorded, `data[].id` extracted →
     populates the model `<select>` (`options_from: "verify"`). Ollama fallback: if `/v1/models`
     404s, retry `/api/tags` and map names.
  2. If a model is selected: 1-token round-trip probe — `POST /chat/completions`
     `{"model": m, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}` — proves
     the key has model access and measures TTFT (for STT presets: transcribe a bundled 1 s WAV;
     for TTS: synthesize the word "ready").
- **In-process engines**: check weight files exist and load metadata; no network.
  `detail: "local model — loads at pipeline start"` (OpenVoiceUI wording), plus
  `state: "needs_download"` when weights are absent (button flips to Download).

```json
{
  "ok": true,
  "latency_ms": 42,
  "ttft_ms": 380,
  "models": ["qwen3:14b", "llama3.1:8b"],
  "detail": "18 models available",
  "warnings": ["Selected model 'qwen3:32b' not in server list"]
}
```

Failures map to actionable copy: connection refused → "Is Ollama running? [Start it]"; 401 →
"Key rejected — check ${ENV_VAR} / pasted key"; env var unset → §2.2 banner. Verified state is
shown as a Badge on each card (design tokens per 12-design-system.md) and re-checked lazily on
Settings mount; a session start with a dead endpoint surfaces the same error copy in the module
UI (02-voice-pipeline.md owns in-call error frames).

## 10. One model, two jobs (chat vs scoring)

The single-LLM constraint is deliberate and **stays in v1**: one slot keeps Settings
comprehensible for non-technical candidates and avoids a config matrix. Consequences we accept
and design around:

- Scoring prompts (04/05) are engineered for mid-size open models: rubric text inlined verbatim,
  strict JSON schema output, low temperature override (modules may override `temperature`/
  `max_tokens` per request — that is a *request* parameter, not a second provider slot).
- The wizard steers 8 GB users toward a cloud key when they first request a scored assessment
  (interstitial: "Band scoring is more reliable with a larger model — use your current model
  anyway / add a cloud key").
- Score reports display the scoring model id (11-data-model.md `llm_evaluations.model_id`) so
  users can discount old scores after upgrading models.

Whether v2 adds a separate optional "evaluator model" slot is an open question below — the
plumbing cost is near-zero (a second `llm`-shaped object) but the UX cost of explaining two
models is real.

## 11. Sidecar API surface (this doc's routes)

**18-api-contract.md is the authoritative route inventory (R2-1)** — method, path, auth, and
wire shape live there (§4.2 Settings, §4.3 Providers); this doc owns the behavior behind each
route. For orientation, the routes this doc specs are:

```
GET   /api/v1/settings                    → masked settings + first_run flag (§2.2, §8)
PATCH /api/v1/settings                    → partial deep-merge, validate merged doc, encrypt
                                            secrets, atomic write, hot-apply (R2-19; PUT dropped)
GET   /api/v1/providers/presets           → shipped presets.json (§3; hidden mock presets only
                                            when BANDREADY_ENABLE_MOCK=1, §3.1)
GET   /api/v1/providers/detect            → §5 detection report (30 s cache; ?fresh=1 busts)
POST  /api/v1/providers/verify            → §9
POST  /api/v1/providers/setup/{engine_id} → §6 guided step → 202 {job_id}, kind provider_setup
                                            (job convention per R2-3, 18 §3)
POST  /api/v1/providers/tts-preview       → synthesize a fixed sentence with given tts config → WAV
```

All routes require bearer auth per 18 §1 (`Authorization: Bearer <token>`, 01-architecture.md).

## Open questions

1. **v2 evaluator-model slot**: add an optional second LLM used only for scoring (falls back to
   the main model when unset)? Cheap to build; the question is purely whether the Settings UX
   can carry it without confusing the target user.
2. **Managed local servers**: is BandReady spawning/supervising `mlx_lm.server` as a child
   process (§6 default) the right call, or should v1 be detect-only with the user running
   servers themselves? Lifecycle edge cases (port conflicts, orphaned processes after crash)
   belong to 01-architecture.md if we keep it.
3. **OS keychain migration path**: when v2 adopts Electron `safeStorage`, do we migrate existing
   `enc:v1:` values automatically, and what happens to sidecar-only headless usage (tests, CLI)?
4. **Port-8080 collision UX**: when both mlx-lm and llama.cpp users exist on one machine, is
   response-shape disambiguation reliable enough, or should the mlx-lm managed default move to
   an uncommon port (e.g. 10240)?
5. **Model recommendation freshness**: `suggested_models` ships frozen in `presets.json`; do we
   want an opt-in remote fetch of an updated recommendations file, given the app is otherwise
   fully offline? (Conflicts with the local-first promise; 16-roadmap.md to weigh.)
