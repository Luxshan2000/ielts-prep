# Voice pipeline and sidecar gotchas

Status: verified working configuration. Treat the parameter values here as law until someone
re-verifies them against a newer pipecat-ai release.

This is the engineering BandReady's live voice examiner, provider layer, and packaging depend on.
Most of it is version-specific to **pipecat-ai 1.5.0**, which is why that version is pinned in
`sidecar/pyproject.toml`. Every item below caused a real failure at least once; several fail
*silently*, which is why they are written down rather than left to be rediscovered.

Cited from: 00-vision.md, 02-voice-pipeline.md, 03-providers-and-settings.md,
04-speaking-module.md, 13-packaging-distribution.md, 14-testing-strategy.md, 16-roadmap.md.

---

## 1. The Pipecat 1.5.0 live-voice pipeline

### 1.1 Processor order

```
transport.input() → VADProcessor → RTVIProcessor → stt →
  aggregator.user() → [injector] → llm →
  tts → [recorder] → transport.output() → aggregator.assistant()
```

The two BandReady insertions (question/rubric injector, session recorder) are specified in
02-voice-pipeline.md §2. Everything else is the order that works; reordering it is a change,
not a refactor.

### 1.2 Parameters that are known to work

- VAD: `VADProcessor(vad_analyzer=SileroVADAnalyzer(params=VADParams(confidence=0.5,
  start_secs=0.2, stop_secs=0.6, min_volume=0.0)))`
- Turn stop: `LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(
  user_turn_strategies=UserTurnStrategies(stop=[SpeechTimeoutUserTurnStopStrategy(
  user_speech_timeout=0.6)])))`
- Task: `PipelineParams(enable_metrics=True, allow_interruptions=True)`
- Transport: `SmallWebRTCTransport(webrtc_connection=connection,
  params=TransportParams(audio_in_enabled=True, audio_out_enabled=True))`
- Signaling: a module-level `SmallWebRTCRequestHandler(ice_servers=[])`
- Greeting: `on_client_connected` queues `TTSSpeakFrame(greeting)` so the examiner speaks first
- Hangup: `on_client_disconnected` calls `task.cancel()`; the session record is written from the
  `finally` block, so it survives an abrupt disconnect
- Local services: `WhisperSTTService(model=Model.BASE, device="cpu")` and
  `KokoroTTSService(voice_id="af_heart", model_path=..., voices_path=...)`

### 1.3 The five gotchas

These are silent-failure landmines. Four of the five produce a session that connects, streams
audio, and does nothing at all, with no exception anywhere.

1. **`TransportParams(vad_analyzer=...)` is inert.** An explicit `VADProcessor` must sit
   immediately after `transport.input()`. Without it, audio flows and zero speech events are
   emitted. Nothing logs an error.
2. **The default turn-stop strategy is Smart Turn, and it hangs.** Pass
   `SpeechTimeoutUserTurnStopStrategy` explicitly. Otherwise the user's turn never ends and the
   LLM is never invoked.
3. **The browser microphone is not published unless `client.initDevices()` is awaited before
   `client.connect()`.** Connection succeeds either way; only the uplink is missing.
4. **Trickle ICE arrives as a `PATCH` to the same `/offer` URL**, routed to
   `handle_patch_request`. Accept both snake_case and camelCase keys in the body. Miss this and
   connections work on a LAN and fail across NAT.
5. **`VADParams` defaults to `min_volume=0.6`, which blocks normal speech.** Set `0.0` with
   `confidence=0.5`. Any user-supplied value is clamped to `<= 0.6` (03-providers-and-settings.md
   §4), because a higher value is indistinguishable from a broken microphone.

A sixth, narrower rule: an MCP client's start, run, and close must all happen inside one asyncio
task. The anyio cancel-scope contract requires it, and splitting them across tasks raises at
teardown rather than at the mistake.

### 1.4 Browser client

`@pipecat-ai/client-js` + `@pipecat-ai/client-react` + `@pipecat-ai/small-webrtc-transport`.

```
new SmallWebRTCTransport({ webrtcRequestParams: { endpoint: '/api/v1/.../offer' } })
new PipecatClient({ transport, enableMic: true, enableCam: false })
await client.initDevices()   // before connect(), see gotcha 3
await client.connect()
```

Playback is `<PipecatClientAudio />`. Transcript comes from `usePipecatConversation()`, phase
from `usePipecatClientTransportState()`, and examiner speech boundaries from
`RTVIEvent.BotStartedSpeaking` / `BotStoppedSpeaking`.

`getUserMedia` failures need a human-readable mapping: `NotAllowedError` and `NotFoundError` both
surface as microphone-permission copy with a deep link to the OS privacy pane, never as a raw
DOM exception. BandReady's implementation is `describeError()` in
`app/src/features/speaking/components/phases.ts`.

---

## 2. Provider adapters and settings persistence

### 2.1 Adapter shape

An adapter is a class registered by `type_id` that declares what it needs and how to build it:

- `Modality` covers `stt`, `llm`, `tts`, `s2s`.
- `FieldSpec` / `FieldType` / `ConfigSpec` describe configuration fields, grouped into
  `"connection"` and `"params"`. The settings form renders from the spec, so adding a provider
  never means editing React.
- `Capabilities`, `ConnectionView`, `ServiceContext`, `VerifyResult` are the supporting types.
- The contract: `build_service(ctx)` returns a Pipecat service, plus `quick_test`,
  `verify(connection)`, and the dynamic `config_spec_for(...)` / `capabilities_for(...)`.

**One adapter covers every OpenAI-compatible LLM.** OpenAI, OpenRouter, Groq, Mistral, Together,
Fireworks, DeepSeek, xAI, Ollama, vLLM, LM Studio, llama.cpp, and LocalAI differ only by
`base_url` and key. `build_service` returns `OpenAILLMService(api_key, base_url, model,
timeout=30.0, max_retries=2)` and `verify()` does a `GET {base_url}/models`. Writing a second
adapter for any of them is a mistake.

Local adapters have no connection to verify and return
`VerifyResult(ok=True, detail="local model, loads at pipeline start")`.

Because the adapter ABC is the only seam the scoring code sees, a mock adapter registered under
`type_id="mock"` can serve canned fixtures through the real orchestration path. That is how
14-testing-strategy.md §7 tests scoring without a model.

### 2.2 The settings write path

Settings live in one JSON file in the data dir, and it must survive a crash mid-write, a full
disk, and a power cut:

```
mkstemp in the same directory → write → fsync the file →
os.replace onto the target → chmod 0600 → fsync the parent directory
```

Same directory matters, because `os.replace` is only atomic within a filesystem. The parent-dir
fsync is what makes the rename itself durable; skip it and a power cut can leave the old inode.

Two further rules:

- A corrupt or unparseable file is renamed to `.corrupt-<timestamp>` and replaced with defaults.
  Never crash the sidecar on boot because of a bad settings file: the user cannot reach the UI to
  fix it.
- `${ENV_VAR}` interpolation resolves at read time. An **unset** variable is an error, not an
  empty string. Substituting `""` produces an unauthenticated request and a confusing 401 several
  layers away from the cause.

These rules are directly testable and 14-testing-strategy.md §4.2 tests each one.

---

## 3. Sidecar process model

- **`workers=1`, always.** WebRTC connections, the active pipeline task, and speaking-session
  state are per-process in-memory objects. A second worker gets a second, empty copy of all of
  it, and requests land on the wrong one at random. This is a contract, not a default: it is
  passed explicitly to uvicorn and asserted in the packaging smoke test.
- **Boot order is migrations, then seed import, then serve**, under a `flock` so that two
  processes racing at first launch cannot both migrate.
- SQLite pragmas: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`. The engine is built
  lazily so tests can set env before it exists.
- **The per-install secret key is generated on first run**, written 0600 into the data dir, and
  used to encrypt provider keys at rest. There is never a shared fallback key. A key baked into
  the source of an open-source app encrypts nothing.
- **Environment beats argparse.** An argparse default is not `None`, so it silently shadows the
  environment variable it was meant to fall back to: the flag "wins" even when the user never
  passed it. Flag defaults must be `None` and the environment value must win. In packaged mode
  the environment is the only source of host, port, token, and data dir; the flags exist for dev.
- The bind host is explicit (`127.0.0.1`) and passed through to uvicorn. Never rely on a
  framework default for what interface a local sidecar listens on.

---

## 4. Transcripts and mid-session prompt injection

### 4.1 Transcript capture

A `BaseObserver` subclass taps `TranscriptionFrame` and
`LLMFullResponseStartFrame` / `TextFrame` / `LLMFullResponseEndFrame`, deduplicating by
`id(frame)`, and builds:

```json
{"turns": [{"role": "user", "text": "...", "t_ms": 1234}]}
```

Frames are delivered more than once in some paths, so the dedupe is required, not defensive.
This structure is the input to speaking scoring (04-speaking-module.md §7) and the assertion
target for the E2E harness (§5).

### 4.2 Injecting a question card without prompt bloat

The injector is a pure function over the message list. It inserts **one** marked system message
immediately before the last user turn, and strips the previously marked one first. The marker is
what makes removal reliable.

The property that matters: switching Part 1 to Part 2 to Part 3 swaps the active instructions
instead of appending them. Without the strip, a fifteen-minute session accumulates three sets of
contradictory examiner instructions, the context grows monotonically, and the model starts
obeying the oldest one.

Keep the injector pure and test it as a list-in, list-out function. It needs no pipeline to test.

### 4.3 Prompts are composable fragments

Examiner personas, part-specific instructions, and band-descriptor rubrics are separate prompt
fragments merged into the system prompt in a defined order, not one monolithic string. Shipped
defaults live in the package; user-editable copies live in the data dir. Composition order is
part of the contract, since later fragments qualify earlier ones.

---

## 5. Headless voice E2E harness

The cheapest automated test of a real voice session is a real voice session with a synthetic
caller. The shape:

- **`say(text)`**: synthesize an utterance with Kokoro, falling back to the macOS `say` binary,
  cached on disk by hash of the text. Synthesis dominates runtime; the cache is what makes the
  suite usable.
- **`ScriptedAudioTrack`**: an aiortc audio track that plays queued s16 mono 48 kHz utterances
  and emits silence when idle, paced off a monotonic clock so it does not drift over a long
  session.
- **`place_call()`**: a real `RTCPeerConnection` against the sidecar's offer endpoint, with a
  `MediaBlackhole` or recorder on the downlink.
- **Turn taking**: enqueue the next scripted utterance when the examiner stops speaking. Detect
  that from the incoming track (silence longer than about 1.2 s) rather than a fixed per-turn
  sleep, so the test does not break when the examiner is more verbose than last week.
- **Assertions**: subscribe to the session event WebSocket to observe state transitions live,
  and poll the session record for the final result.

Assert transcripts loosely. STT is imperfect; check that a good majority of content words
survived, never an exact string.

This suite is the living regression test for §1.3. If the `VADProcessor` is dropped, the
turn-stop strategy regresses, or `min_volume` drifts upward, no turn ever transcribes and the
suite fails loudly rather than subtly.

---

## 6. Packaging

- **Built frontend assets are not in the wheel unless you force-include them.** Resolving the
  dist directory relative to the source tree works in dev and produces a wheel with no UI in it,
  and the failure only shows up in the packaged app. Use
  `[tool.hatch.build] force-include` to map the built frontend into the package, and compute the
  runtime path from `Path(__file__).parent`, never from the working directory or a source-tree
  relative path.
- CI needs a **wheel-content guard**: assert the built artifact actually contains the frontend
  dist, the migrations, the seed content, and the model files (or the documented
  download-on-first-run marker), and that path resolution finds them from the installed location.
- **One JavaScript package manager, repo-wide.** Mixing npm and pnpm gives you two lockfiles that
  disagree and a CI cache that hits neither. BandReady uses pnpm (01-architecture.md §7).
- Python builds with hatchling, `requires-python >= 3.11`. Voice dependencies go in an extra:
  `voice = ["pipecat-ai[silero,webrtc,openai,whisper,kokoro,mcp]>=1.5", ...]`.
- Known-good resolved versions: `pipecat_ai 1.5.0`, `fastapi 0.139.x`, `sqlalchemy 2.0.51`,
  `aiortc 1.15`, `faster_whisper 1.2.1`, `kokoro_onnx 0.5.0`, `mlx_whisper 0.4.3`.
