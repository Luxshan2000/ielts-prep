# BandReady — locked planning decisions (all authors MUST align with these)

> **Round-2 reconciliation rulings appended at the bottom of this file (2026-07-25) — they
> resolve every conflict in 17-review-findings.md and OVERRIDE any earlier doc text.**

Working title: **BandReady** (placeholder — "IELTS" is a trademark of British Council / IDP / Cambridge,
so the product name must not contain it; we describe the app as "IELTS-style exam preparation").
The vision doc owns final naming; everyone else just says "BandReady".

## Product

- **What**: an open-source, self-hosted, end-to-end IELTS preparation desktop app — all four skills
  (Speaking, Writing, Reading, Listening) + dynamic vocabulary banks with spaced repetition +
  pronunciation feedback + a guided curriculum from placement test to exam-ready.
- **Who**: IELTS candidates (Academic & General Training) who want unlimited private practice with
  their own AI models — local or any cloud key. First-mover OSS positioning: no complete open-source
  IELTS package exists.
- **Business/license**: fully OSS (Apache-2.0), separate repo/project from OpenVoiceUI. Open-core
  possible later; not planned in v1.
- **Single learner, local-first.** No accounts, no server auth/RBAC (unlike OpenVoiceUI). Optional
  multiple local profiles at most. All data stays on device.

## Stack (ADR summaries — 01-architecture.md elaborates)

- **ADR-001: Electron + React 18 + Vite + TypeScript + Tailwind — NOT React Native.**
  Rationale: reuse of the Pipecat JS client SDK (WebRTC voice), OpenVoiceUI's proven LiveCall
  patterns, and its entire Tailwind design-token system. react-native-macos/windows has no viable
  path for the Pipecat web SDK, weak WebRTC support, and would discard all existing UI knowledge.
  Electron ships one codebase to macOS + Windows (+ Linux for free).
- **ADR-002: Python FastAPI sidecar** spawned by Electron main process (localhost, random port,
  loopback-only, token-authenticated). It owns: Pipecat voice pipeline, SQLite, content bank,
  scoring orchestration. Electron renderer talks to it over HTTP/WebRTC exactly as OpenVoiceUI's
  SPA does. Packaged as a self-contained python runtime (PyInstaller or python-build-standalone +
  bundled venv — packaging doc decides).
- **DB**: SQLite (WAL, foreign_keys ON) via SQLAlchemy 2.0 + Alembic. Data dir:
  `~/Library/Application Support/BandReady` (mac) / `%APPDATA%/BandReady` (win).
- **Voice**: pipecat-ai pinned **1.5.0**, SmallWebRTCTransport, Silero VAD. The five gotchas from
  `_context/openvoiceui-findings.md` are law.
- **Providers**: everything through **OpenAI-compatible endpoints** where possible. ONE simplified
  settings page: the user configures exactly one LLM + one STT + one TTS (+ VAD tunables) —
  NOT OpenVoiceUI's multi-agent/multi-connection system. Keep OpenVoiceUI's `config_spec`-driven
  form idea and lockfile robustness (atomic writes, env interpolation), radically simplified.
- **Local engines**:
  - macOS (Apple Silicon): MLX family — `mlx-lm` server (OpenAI-compatible), `mlx_whisper` STT;
  - Windows/Linux: Ollama (OpenAI-compatible) + faster-whisper;
  - TTS default everywhere: Kokoro ONNX (local, fast);
  - any cloud OpenAI-compatible endpoint also works (OpenRouter, Groq, DeepSeek, ...).
  App detects installed engines and offers one-click guided setup.
- **UI look**: replicate OpenVoiceUI's design system (Inter Variable, 14px base, indigo-on-240°-neutral
  HSL token palette, dark default, rounded-xl cards). The design-system doc owns exact tokens.

## Conventions

- Plan docs live in `docs/plan/NN-topic.md`, numbered, one topic per file, each starting with:
  title, `Status: draft (2026-07-25)`, one-paragraph summary, then detail. Cross-reference sibling
  docs by filename (e.g. "see 11-data-model.md").
- Be CONCRETE: real schemas (SQL DDL), real prompt templates (verbatim, ready to paste), real
  component/file trees, real JSON shapes, real band-descriptor rubric text. No hand-waving,
  no "TBD" where a sensible default can be chosen — choose and flag it as a default.
- Every doc ends with an **Open questions** section (only genuinely open ones).
- IELTS content: we must author ORIGINAL practice materials in IELTS format (band descriptors
  are published publicly by IELTS partners and scoring criteria facts are not copyrightable, but
  actual past-paper content is — never copy it). 15-content-authoring-licensing.md owns this.

## Round-2 reconciliation rulings (2026-07-25)

These rulings resolve the conflicts/gaps in 17-review-findings.md. Where a ruling contradicts an
existing doc, the doc must be edited to match. Citations refer to 17's finding IDs.

- **R2-1 (C1/C2/G1) API contract**: `/api/v1` prefix for ALL routes. A new authoritative
  `18-api-contract.md` owns the complete route inventory (method, path, auth, request/response
  shape, owner doc). Speaking offer is `POST /api/v1/speaking/sessions/{session_id}/offer`
  (+ PATCH same URL for trickle ICE). All module docs reference 18 instead of inventing routes.
- **R2-2 (G2) Media & WebSocket auth**: bearer tokens stay for normal fetch/XHR. For `<audio>`
  elements and WebSockets (which can't set headers): short-lived signed tickets — renderer calls
  `POST /api/v1/tickets` (bearer) → `{ticket, expires_in: 60}`; media/WS URLs accept `?ticket=`.
  Tickets are single-audience (media-read or session-events), HMAC-signed with the sidecar token,
  never logged. 18-api-contract.md specs it.
- **R2-3 (G6) Job/progress transport**: exactly two mechanisms. (a) One-shot jobs (writing eval,
  content generation, model downloads) = `202 Accepted` + `GET /api/v1/jobs/{id}` polling with
  `{state, progress_pct, detail, result?}`. (b) Live speaking sessions = the per-session WebSocket
  `WS /api/v1/speaking/sessions/{id}/events` (04's design wins; 02's "RTVI server messages for
  session phases" is dropped — RTVI stays only for Pipecat's own transport events).
- **R2-4 (C9/G10) Rounding**: ONE shared `round_ielts()` — official rule, ties round UP
  (6.25→6.5, 6.75→7.0) — used by speaking, writing, and overall estimates. 05's conservative
  rounding is repealed. Servers ALWAYS recompute overall_band from criterion bands server-side
  (04 gets a post-processing section like 05 §6.3); the model's own overall value is ignored.
- **R2-5 (C4/C5/G4) Vocabulary + profiles**: 11-data-model.md is rewritten first and becomes
  canonical; 08 then conforms. Rulings: dedup key `(profile_id, lemma, pos)`; keep 08's four-table
  shape (vocab_entries, vocab_sources, srs_cards, srs_review_logs) ported into 11 with TEXT ULID
  PKs and profile_id scoping; add `fsrs_json`; unified status enum
  `suggested|active|suspended|known`; review_type enum = 08's six exercise types. Ingestion
  consent = suggested-inbox model (04/05 win): module-sourced entries land `status='suggested'`
  with NO srs_cards row until the learner accepts; only manual adds and accepted seed-deck opt-ins
  schedule immediately. Profiles: keep `profiles` table + `profile_id` on all learner-data roots
  (11 wins); v1 UI exposes exactly one profile via `settings.active_profile_id` — no switcher
  until v1.x; 10's `CHECK (id = 1)` single-row learner_profile is repealed.
- **R2-6 (C6/C7) Pronunciation storage & retention**: 11 adopts 09's source-polymorphic
  `pron_scores` (source ∈ speaking_turn|read_aloud|shadowing|minimal_pair, score INTEGER 0-100,
  nullable session linkage) plus `pron_drill_attempts`; `pron_word_scores` is deleted. Prompts
  serialize score/100 when a 0-1 float is needed. Audio retention: 11 §9's never-auto-evict rule
  for user recordings is canonical; 02 §5 and 09 §7's "20-session pruning" language is repealed
  (generated/cache audio may still be evicted; user recordings only on explicit session delete).
- **R2-7 (C8/G3) Curriculum tables**: 11 adopts 10's richer model: `placement_results`,
  `study_plans(horizon_weeks, weights_json, superseded_by)`, `plan_sessions` with blocks_json +
  phase build|taper + status incl. in_progress|partial, `adaptive_events`, `daily_activity`,
  `milestones`, `readiness_items`. Band estimates: append-only `band_estimates` snapshot log
  (11 wins) PLUS a recomputed per-skill cache exposed as a SQL VIEW `current_band_estimates`
  (range_low/high, confidence, n_eff). The estimator input is a new SQL VIEW `scored_attempts`
  (UNION over speaking_sessions/writing_submissions/reading_attempts/listening_attempts with
  uniform columns: skill, mode placement|mock|practice|micro, band, criteria_json, at) — 11 specs
  it; 10 references it. Speaking `mode` values align to that enum.
- **R2-8 (C12/G11) Content packs**: merged format, specced in 11: 15's manifest keys
  (manifest_version, id, publisher, checksums, disclaimer, ai_disclosure, built_with) + 11's
  `data/` JSONL layout + `.brpack` extension + reverse-DNS ids; add `vocab.jsonl` and
  `card_sets.jsonl`. Import = 11 §11.3's typed-table upsert; 15's `content_items` reference is
  repealed. Content tooling ships as `tools/content/` inside the main repo, importable as
  `bandready-content` (a thin PyPI package re-exporting `bandready.content` validators) — 15
  documents this factoring.
- **R2-9 (C3/G5) Repo layout**: 01 §7 is BINDING: `app/` (Electron+React, features under
  `app/src/features/<module>/`) + `sidecar/bandready/` + `content/` + `docs/`. The shared answer
  normalizer lives at `sidecar/bandready/scoring/answers.py` — one implementation imported by
  reading AND listening; normalization spec: 07's variant-aware article rule wins (strip leading
  article only if every stored variant lacks one). All other file paths in 02/06/07/09/16 are
  corrected to this layout.
- **R2-10 (C10) Fluency metrics contract**: 02 computes and 04's evaluator prompt consumes exactly:
  wpm, articulation_wpm, mean_pause_ms, long_pause_count (>=1500ms), pause_ratio,
  initial_latency_ms, filler_count, fillers_per_min, false_start_count,
  mean_length_of_run_words (added to 02), p2_long_turn_secs (computed at session layer, Part 2
  only). `self_corrections` and `long_pauses_over_1s` are deleted from 04's prompt.
- **R2-11 (C11) Session phase names**: 04 §3.1's state machine vocabulary is canonical
  (P1_QUESTIONS, P2_PREP, P2_LONG_TURN, P2_ROUNDING, P3_DISCUSSION, ...); 02 §6.3 and 12 §10
  adopt these exact names.
- **R2-12 (C13) Roadmap alignments — module docs win**: Windows v1 ships UNSIGNED with the
  documented SmartScreen flow (13 wins; 16's v1.0 exit gate becomes "signed+notarized macOS,
  documented unsigned-Windows flow"); paste allowed-but-recorded (05); autosave 10s (05);
  no splash — window shown only when healthy (01); crash-restart fatal after 5 failures (01);
  personas = one examiner + one coach (04).
- **R2-13 (C14) Content gate**: 16 §9.1's cadence numbers ARE the v1.0 gate; 15 §5's table is
  relabelled "content roadmap through v1.x" and its effort plan notes the second reviewer is
  post-v1.0 unless recruited earlier.
- **R2-14 (C15) Onboarding/placement**: 10 owns the wizard end-to-end; 12 §6.9 and 13 §7.1 are
  rewritten to reference it (13's model-download step becomes a step within 10's wizard).
  Placement is ~30 min with the speaking sampler skippable; skipping any section falls back to
  self-assessed level for that skill. 00's activation metric becomes "first speaking session
  within 20 minutes of install (placement deferrable)".
- **R2-15 (C16) Latency**: public target is "<1.5s p50 examiner response" (02's budget); 00 is
  corrected.
- **R2-16 (C17) Primary color**: TEAL stands (12's exact HSL triples are canonical). The earlier
  "indigo" wording in this file's UI-look bullet is hereby amended to "OpenVoiceUI's token system
  with BandReady's teal primary per 12-design-system.md". 06 §9's "indigo" is corrected.
- **R2-17 (C18) One-LLM lock**: absolute in-app. 06 §7's "different model configured" sentence is
  deleted; validation always uses the configured LLM (out-of-app authoring tooling may use any
  model — that's 15's domain, not the app's).
- **R2-18 (C19) Data-dir layout**: 11 §9's tree is canonical; add `media/vocab/` and
  `media/pron/ref/` to it; 01 §8 and 08 §5.3 / 09 §5.2 paths are corrected to match.
- **R2-19 (C20) Settings**: table name is `settings` (11 wins; `app_prefs` corrected in 03).
  API: `GET /api/v1/settings` returns the full document; `PATCH /api/v1/settings` does partial
  deep-merge (what 14's tests use); `PUT` is dropped. Mock providers: presets with
  `"hidden": true` registered only when `BANDREADY_ENABLE_MOCK=1` — 03 documents this as the
  test seam 14 relies on.
- **R2-20 (G7) Offline dictionary**: bundled WordNet (via the `wn` Python package + English
  WordNet 2023 data, ~35MB, permissive license) serves double-click lookups offline at
  `GET /api/v1/dictionary/{word}`; LLM enrichment stays an optional async upgrade on accepted
  vocab entries. 08 specs it; 06 references it.
- **R2-21 (G8) speaking_cards**: 11 adds a `card_sets` table (id, topic, part-coverage,
  pack_id) and `speaking_cards.card_set_id` FK so the Full-Mock least-recently-served-set picker
  is implementable; 04's card JSON maps 1:1 to these columns + payload_json for the rest.
- **R2-22 (G9) Placement content**: 15's launch targets add a "placement pack": 2 same-family
  reading passage pairs (band 5-6 / 7-8), 2 listening samplers, 4 short writing tasks (2 per
  variant), 4 speaking P1 topic minis. 16 P4 lists it as a deliverable.
- **R2-23 (G12) Frontend state**: convention documented in 01 — four global Zustand stores
  (session, settings, progress, srs) + per-feature ephemeral stores under
  `app/src/features/<module>/store.ts`; attempt-in-progress state is feature-local, never global.
- **R2-24 (G13) speaking_turns writer**: the session teardown (finally-block) flattens
  transcript_json into `speaking_turns` rows synchronously before writing the session row's
  `status='complete'`; 02 §2.4 documents it.
