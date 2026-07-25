# OpenVoiceUI — verified technical findings (source material for BandReady planning)

This is a condensed, verified map of the sibling project at
`/Users/luxshanthavarasa/Desktop/Lux's Projects/openvoiceui`. BandReady (the IELTS practice app)
reuses its proven concepts. Everything below was confirmed by direct code exploration on 2026-07-25.
When in doubt, read the referenced source files directly.

## 1. Voice pipeline (Pipecat 1.5.0 — PIN THIS VERSION)

Assembly lives in two files:
- `packages/core/openvoiceui/voice/pipeline.py` — pipeline build + run
- `packages/core/openvoiceui/voice/runtime.py` — SmallWebRTC signaling (offer/ICE) + greeting + teardown

Pipeline order (`pipeline.py:192-203`):
```
transport.input() → VADProcessor → RTVIProcessor → stt →
  aggregator.user() → [RAGProcessor?] → llm →
  tts → transport.output() → aggregator.assistant()
```

Exact working params:
- VAD: `VADProcessor(vad_analyzer=SileroVADAnalyzer(params=VADParams(confidence=0.5, start_secs=0.2, stop_secs=0.6, min_volume=0.0)))`
- Turn stop: `LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(user_turn_strategies=UserTurnStrategies(stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)])))`
- Task: `PipelineParams(enable_metrics=True, allow_interruptions=True)`
- Transport: `SmallWebRTCTransport(webrtc_connection=connection, params=TransportParams(audio_in_enabled=True, audio_out_enabled=True))`
- Signaling: module-level `SmallWebRTCRequestHandler(ice_servers=[])`; trickle ICE arrives as PATCH to the same `/offer` URL → `handle_patch_request` (accept both snake_case and camelCase keys)
- Greeting: `on_client_connected` → `task.queue_frames([TTSSpeakFrame(greeting)])`
- Hangup: `on_client_disconnected` → `task.cancel()` (finally-block writes the call log)
- Local fallbacks: `WhisperSTTService(model=Model.BASE, device="cpu")`, `KokoroTTSService(voice_id="af_heart", model_path=..., voices_path=...)`

Frontend (`packages/webui/src/pages/LiveCall.tsx`):
- `new SmallWebRTCTransport({ webrtcRequestParams: { endpoint: '/api/.../offer' } })` → `new PipecatClient({ transport, enableMic: true, enableCam: false })`
- **`await client.initDevices()` BEFORE `await client.connect()`** — mic is never published otherwise
- `<PipecatClientAudio />` for playback; `usePipecatConversation()` for transcript; `usePipecatClientTransportState()`; `RTVIEvent.BotStartedSpeaking/BotStoppedSpeaking`
- `describeError()` maps `NotAllowedError`/`NotFoundError` to user-facing mic-permission copy

### THE FIVE GOTCHAS (version-specific to pipecat-ai 1.5.0 — do not regress)
1. `TransportParams(vad_analyzer=…)` is INERT. You MUST place an explicit `VADProcessor` right after `transport.input()`. Without it: audio flows, zero speech events, silent failure.
2. The default turn-stop strategy is Smart Turn and it hangs. Pass `SpeechTimeoutUserTurnStopStrategy` explicitly.
3. Browser mic is not published unless `client.initDevices()` is called before `client.connect()`.
4. Trickle ICE is a PATCH to the same `/offer` URL, routed through `handle_patch_request`.
5. `VADParams` default `min_volume=0.6` blocks normal speech — set `0.0` with `confidence=0.5`; clamp any user-supplied value ≤ 0.6.

Also: MCP client start+run+close must happen in one asyncio task (anyio scope requirement). Canonical doc: `openvoiceui/docs/plan/32-turn-taking.md`.

## 2. Provider abstraction

- ABC + dataclasses in `packages/core/openvoiceui/adapters/base.py`: `Modality{stt,llm,tts,s2s}`, `FieldSpec`/`FieldType`/`ConfigSpec` (fields grouped `"connection"` | `"params"`), `Capabilities`, `ConnectionView`, `ServiceContext`, `VerifyResult`. Contract: `build_service(ctx) -> Pipecat service`, `quick_test`, `verify(connection)`, dynamic `config_spec_for(...)` / `capabilities_for(...)`.
- Registry: `@register` decorator keyed on `type_id`; `for_provider(provider_id, modality)` falls back to any adapter with `openai_compatible = True`.
- **One adapter covers all OpenAI-compatible LLMs** (`adapters/openai/llm.py`, `OpenAICompatLLM`): OpenAI/OpenRouter/Groq/Mistral/Together/Fireworks/DeepSeek/xAI/Ollama/vLLM/LM Studio/llama.cpp/LocalAI — differentiated purely by `base_url` + key. `build_service` → `OpenAILLMService(api_key, base_url, model, timeout=30.0, max_retries=2)`. `verify()` GETs `{base_url}/models`.
- Local adapters (whisper STT, kokoro TTS) need no connection: `VerifyResult(ok=True, detail="local model — loads at pipeline start")`.
- Lockfile v2 (`models/lockfile.py`, `models/store.py`): shipped defaults + user file merged `{**defaults, **user}`; atomic writes (mkstemp → fsync → os.replace → chmod 0600 → fsync parent dir); corrupt file quarantined to `.corrupt-<ts>` instead of crashing; `${ENV_VAR}` interpolation.
- Provider catalog: `defaults/catalog.json` — 53 providers with `{id, name, hosting, modalities[], openai_compatible, auth, base_url, docs_url, models[]}`. Compat caveats in `docs/model-catalog-notes.md`.
- Spec-driven UI: `GET /api/adapters/config-spec` feeds the settings form — fields rendered from adapter `config_spec`, never hard-coded in React.

## 3. Backend stack

- FastAPI factory `server/app.py:create_app()`; startup runs migrations → seeds → adapter discovery → store init.
- SQLAlchemy 2.0 + Alembic; SQLite pragmas `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`; lazily built engine so tests can set env first; flock boot lock around migrations.
- Per-install secret auto-generated to `~/.openvoiceui/secret.key` (0600), never a shared dev fallback. Secrets encrypted at rest (`security/secrets.py`).
- SPA serving: mount `/assets` StaticFiles + catch-all returning `index.html`, `api/` explicitly 404'd.
- All processes run `workers=1` — in-memory + WebRTC state is per-process (documented contract).

## 4. Frontend stack

React 18.3 + Vite 5.4 + TS 5.6, `@` → `src` alias, dev proxy `/api` → `127.0.0.1:8000`.
- State: Zustand 5 only, tiny stores. No react-query; pages call `api.*` in `useEffect` with an `active` cancellation flag.
- API client: single `req<T>()` wrapper, `credentials: "include"`, `ApiError(status, detail)`.
- Theme bootstraps BEFORE first paint (`bootstrapTheme().finally(mount)`) to avoid flash; dark is default.
- UI kit `src/components/ui/`: Button (5 variants × 4 sizes; `loading` overlays spinner without width change), Card, Badge, Input, Textarea, Select, Modal, Drawer, Field, Spinner, ConfirmProvider/useConfirm. Headless UI 2.2 primitives; lucide-react icons.
- Shells: PageShell, Sidebar (NAV array), ModalityTabs, ViewToggle, TestDrawer/TestPanel.

## 5. Design system (REPLICATE THIS LOOK)

Tailwind 3.4 + CSS custom properties (shadcn-style token names, no shadcn dep).
- 19 HSL-triple tokens in `:root` / `.dark`: background, foreground, card, card-foreground, muted, muted-foreground, border, input, ring, primary, primary-foreground, accent, accent-foreground, sidebar, sidebar-foreground, destructive, destructive-foreground, success, warning.
- Tokens mapped in tailwind.config.js as `hsl(var(--token))` so opacity modifiers work; `darkMode: ["class"]`.
- Palette: indigo primary `243 75% 59%` light / `243 75% 66%` dark; light bg `0 0% 100%`, fg `240 10% 8%`; dark bg `240 6% 7%`, card `240 5% 10%`, sidebar `240 6% 5%` (sidebar darker than content); success `142 71% 40%`, warning `38 92% 50%`, destructive `0 72% 51%`; all neutrals on the 240° hue.
- Typography: Inter Variable (`@fontsource-variable/inter`); base 14px, line-height 1.5, letter-spacing -0.006em, `font-feature-settings: "cv11","ss01"`, `"opsz" 32`, antialiased. Headings font-semibold, letter-spacing -0.02em. Deliberate odd small sizes: `text-[13px]`, `text-[11px]`.
- Radii: lg 0.75rem / md 0.5rem / sm 0.375rem. Cards rounded-xl, buttons rounded-lg, badges rounded-md.
- `* { @apply border-border }`, selection = primary/25%, `.scrollbar-thin`, fade-in + shimmer keyframes.
- Runtime theming: tokens stored in a settings table, validated server-side against an allowlist + strict HSL regex (values are injected into a `<style>` tag — validation is a security measure).

## 6. Packaging / build lessons

- No Electron in OpenVoiceUI (it's server-deployed). BandReady adds Electron — new ground.
- Python: hatchling, `requires-python >=3.11`. Key resolved versions: `pipecat_ai 1.5.0`, `fastapi 0.139.x`, `sqlalchemy 2.0.51`, `aiortc 1.15`, `faster_whisper 1.2.1`, `kokoro_onnx 0.5.0`, `mlx_whisper 0.4.3`.
- Extras pattern: `voice = ["pipecat-ai[silero,webrtc,openai,whisper,kokoro,mcp]>=1.5", ...]`.
- **Known wheel gotcha:** OpenVoiceUI's SPA dist is NOT in the wheel (`_DIST` resolved relative to source tree; dist gitignored; no force-include). For BandReady, use `[tool.hatch.build] force-include` mapping the built webui into the package and compute the path from `Path(__file__).parent`.
- Mixed npm/pnpm in OpenVoiceUI — pick ONE package manager for BandReady.
- CLI gotcha: argparse default host `127.0.0.1` ignores env var — bind host must be explicit.

## 7. Reusable gems for an IELTS app

- **Headless voice E2E harness** `openvoiceui/eval/{speech,client,harness,certify}.py`: TTS-synthesizes a caller utterance (Kokoro, macOS `say` fallback, on-disk cache keyed by hash), places a real WebRTC call via aiortc `MediaPlayer`, polls call_logs for the transcript, asserts on it. Cheapest path to automated speaking-module tests.
- **`voice/transcript.py`** `TranscriptObserver(BaseObserver)`: builds `{"turns":[{role,text,t_ms}]}` from `TranscriptionFrame` / `LLMFullResponseStart/Text/EndFrame`, deduping by `id(frame)`. Directly reusable as the source for IELTS scoring input.
- **`voice/rag_processor.py`** `build_messages()`: pure function injecting a single marked system message before the last user turn, stripping the previous one so injected knowledge never accumulates. Same pattern works for injecting question cards / rubrics into a live speaking session.
- **Skills = composable prompt fragments** merged into the system prompt in order (`defaults/skills.json`: friendly-tone, concise-voice-style, grammar-coach). Natural fit for examiner personas + band-descriptor rubrics.
- Design-doc convention worth copying: `docs/plan/NN-topic.md`, one spec per file, status header, "verified on <date>" notes.
