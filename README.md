# BandReady

Open-source, self-hosted IELTS-style exam prep desktop app — all four skills, a live AI voice examiner, spaced-repetition vocabulary, and a guided curriculum, running entirely on your machine with your own AI models.

**Status: planning complete, pre-implementation.** The full design lives in [docs/plan/README.md](docs/plan/README.md) — start there.

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or connected to the British Council, IDP: IELTS Australia, or Cambridge University Press & Assessment. IELTS is a registered trademark of its owners. BandReady provides original practice materials in the IELTS exam format and does not reproduce official test content.

## Locked stack

- **Shell**: Electron + React 18 + Vite + TypeScript + Tailwind (one codebase for macOS, Windows, and Linux)
- **Backend**: Python FastAPI sidecar spawned by Electron — loopback-only, random port, token-authenticated; owns voice, scoring, content, and data
- **Voice**: pipecat-ai 1.5.0 with SmallWebRTCTransport and Silero VAD for real-time speaking sessions
- **Data**: SQLite (WAL) via SQLAlchemy 2.0 + Alembic; local-first, single learner, no accounts, no telemetry
- **AI providers**: bring your own — exactly one LLM + one STT + one TTS, any OpenAI-compatible endpoint (MLX, Ollama, OpenRouter, Groq, ...) or in-process engines (faster-whisper, Kokoro ONNX)

## License

Apache-2.0 (application). First-party practice content is CC0-1.0.
