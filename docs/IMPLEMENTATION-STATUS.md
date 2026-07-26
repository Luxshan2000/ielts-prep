# BandReady — Implementation Status

**Verified on 2026-07-25** on macOS 25.4.0 (Apple Silicon), by running every command below and
reading its output. Nothing in this document is carried over from a previous report; where an
earlier claim turned out to be wrong, the correction is stated explicitly.

---

## Summary

**The app is runnable today.** `pnpm exec electron dist-electron/main.js` starts the real desktop
app: it spawns the Python sidecar on a random port, applies the Alembic migrations to a fresh
SQLite database, seeds the `core-en` content pack, completes the health handshake, and loads the
renderer, which then makes authenticated API calls that return 200. No errors in the main-process
log.

A user can, **today, offline, with no configuration**: take a full 40-question Academic Reading
test and get a scored review; take a 40-question Listening test with **real generated audio**
(Kokoro TTS renders the scripts on first play); study and review vocabulary with a real FSRS
scheduler; run pronunciation minimal-pair drills; browse the writing prompt bank; walk the
onboarding/placement wizard; and see a progress dashboard, study plan and heatmap.

Writing evaluation and the live speaking examiner need an LLM, which BandReady never bundles. Both
were subsequently verified against a live OpenRouter key — see the [update](#update--2026-07-26-live-voice-and-real-model-scoring-confirmed)
at the end of this document.

BandReady now **packages into a working macOS installer**: `scripts/stage-sidecar.mjs` stages a
relocatable CPython plus the sidecar venv, and electron-builder produces a 156 MB arm64 DMG whose
installed app boots, seeds content and serves its API. It is **unsigned** — there is no Developer ID
here — so macOS shows a Gatekeeper warning on first open. Windows and Linux targets are configured
but have never been built on those platforms.

The honest one-line version: **a complete, working, well-tested local IELTS practice application
whose four skills, live voice examiner and installer have all been verified — still unsigned, and
its band scores are not yet calibrated against expert-marked samples.**

---

## Module status

| Module | Status | What works | What is missing | How it was verified |
|---|---|---|---|---|
| **Reading** | **Working** | Library, player, timer, flags, highlights, autosave, submit, scored review with per-question keys. Full test = 40 questions numbered 1–40 across 3 passages. Drills by question type. | No `GET /api/v1/reading/attempts` list route (listening/writing/speaking all have one), so the progress screen footnotes a missing Reading column. Zero General Training passages. Drills can't resume after reload. `GET /reading/tests` reports one passage's `band_target` for a mixed-difficulty test. | `POST /reading/attempts {test_id:"rt_academic_1",mode:"full"}` → 201, 40 questions; `POST .../submit` → 200 `raw_score 2, band 2.0` (all-"true" answers); `GET .../review` → 200. Playwright `reading.spec.ts`. |
| **Listening** | **Working** | Library, 4-part player, exam lockdown (no seek/replay), transfer-and-check, submit, scored review. **Audio is really generated**: Kokoro rendered all 3 tested scripts. | Only **one** listening test exists (the placement sampler wants two). No `map_labelling` question (needs an SVG asset; pack ships no media). No dictation mode (sidecar exposes no endpoints). Exam lockdown is client-side only. | `POST /listening/scripts/ls_t1_p1/render` → 202 → job succeeded → 15.4 MB WAV, 24 kHz, 321.6 s, 47 lines, with per-line timing JSON. Acoustic check: RMS 0.070, spectral centroid 2.8 kHz (real speech). Attempt create/submit/review → 200. Playwright `listening.spec.ts`. |
| **Writing** | **Working** | Prompt bank with filters, Task 1 chart rendering as SVG, draft workspace, autosave, word count, pre-check, submit, scored report with all four IELTS criteria, character-anchored inline annotations and vocabulary suggestions. Needs an LLM (none is bundled). | Scoring is spot-checked against a real model, not calibrated against a golden set. Evidence-quote highlight flash (05 §7) not implemented. | Against real `qwen/qwen3-30b-a3b-instruct-2507`: a strong essay scored **8.0** in 14 s; a weak one scored **5.0** in 38 s with **10 offset-anchored annotations** and **13 vocabulary suggestions**. ~$0.0002 per essay. Playwright `writing.spec.ts` covers the mock path. |
| **Speaking** | **Working** | Hub, mode picker, mic pre-call check, session lifecycle, state machine (`IDLE → CONNECTING → P1_INTRO → …`), live WebRTC call, scored report with bands/criteria/transcript. **The full live pipeline was confirmed working by the project owner at a real microphone** (2026-07-26). | Scoring quality against a real model is only spot-checked, not calibrated against a golden set. Live call not covered by an automated test — headless Chromium cannot establish the peer connection, so this remains a manual check. | Examiner turn driven by the real LLM: asked "What's your hometown like?", then followed up "What do you enjoy most about living there?", staying in examiner register. Card injection held at exactly 1 marked message across turns. All three services construct against real config (`WhisperSTTService`, `KokoroTTSService`, `OpenAILLMService`). **Live WebRTC call verified manually by the owner.** |
| **Vocabulary / SRS** | **Working** | 21 decks / 343 entries seed from the pack. Deck opt-in, suggestion inbox (opt-in only), review queue, six exercise types, real FSRS scheduling, stats, entry browser. | No headword audio (`/api/v1/media/vocab/<id>.wav` 404s — no producer exists); falls back to platform speech synthesis. No endpoint exposing `srs_review_logs`, so "review history" shows schedule facts, not a timeline. Bulk actions loop one request per item. | Deck opt-in → queue went 0 → 10 items; `POST /srs/review` → 200 with a real FSRS card (`state "learning"`, `stability 2.3065`, `difficulty 2.118`, computed `due`). `GET /vocab/stats` → 200. Playwright `vocab.spec.ts`. |
| **Curriculum / Progress** | **Working** | Study plan generation, daily sessions, progress summary, band estimates, trajectory, heatmap, readiness, streaks, activity log. Onboarding wizard and placement sitting. | `GET /placement/next` returns adaptive reading via a fallback: no two passages share a `topic_id` at different band targets, so the R2-22 pivot uses cross-topic extremes. Placement speaking is answered by typing, not voice. `app/src/stores/progress.ts` still models an obsolete summary shape (features bypass it and call the API directly). | `GET /progress/summary`, `/estimates`, `/trajectory`, `/heatmap`, `/criteria`, `/plan`, `/readiness` → all 200 on a fresh DB. `POST /placement/start` → 200, `GET /placement/next` → 200 with a real reading step. Playwright `onboarding.spec.ts`, `progress.spec.ts`. |
| **Pronunciation** | **Partial** | 46 minimal-pair drill items (26 built-in + 20 from the pack), contrast list, scores, accent-neutral framing copy. faster-whisper transcription works. | `POST /pron/read-aloud` needs a multipart WAV upload and was never exercised end-to-end. No accent-drill or read-aloud E2E coverage. | `GET /pron/drills` → 200, 10 items / 22 contrasts; `/contrasts`, `/scores` → 200. STT proven separately (below). |
| **Settings / Providers** | **Working** | Full settings screen, `GET`/`PATCH /settings`, 16 provider presets, detection, verification, TTS preview, model download/adopt. Local models auto-adopted from existing caches (942 MB linked, not re-downloaded). | `PUT /api/v1/settings` does not exist (it is `PATCH`) — worth pinning in the contract doc. `GET`/`PUT /api/v1/profile` from doc 18 §4.13 **do not exist** on the server. First-run users must pick a provider manually; `BANDREADY_ENABLE_MOCK=1` exposes mock presets but does not select them. | `PATCH /settings` → 200, presets switched to `mock_llm/mock_stt/mock_tts` and read back. `GET /providers/presets` → 16 presets. `GET /providers/detect` → 200. |
| **Content pack** | **Working but thin** | `core-en` v1.0.0 validates **with checksums** and imports cleanly on a fresh DB with **zero** auto-created topics (the topic-id fork reported earlier is fixed). 472 rows across 10 files. | Below the v1.0 content gate. **1** listening test, **2** reading tests, **0** General Training reading passages, **0** media files, no map-labelling. The LLM-backed content validators (blind answer-key agreement, chart solvability) and human review from doc 15 §3.3/§3.5 are not implemented. | `validate_pack(verify_checksums=True)` → **OK**. Fresh import: `topics=20, card_sets=12, speaking_cards=48, writing_prompts=16, reading_passages=6, reading_tests=2, listening_scripts=4, listening_tests=1, vocab_pack_entries=343, reading_questions=80, listening_questions=40, media_files=0, created_topics=[]`. |
| **Packaging / distribution** | **Working (unsigned)** | `app/electron-builder.yml` + `scripts/stage-sidecar.mjs` produce a real installer. **A 156 MB `BandReady-0.1.0-arm64.dmg` was built and the installed app was launched and verified**: it spawns the bundled Python, runs migrations, seeds the content pack and answers `/health`. Auto-update wiring present and disabled in dev. | No code signing or notarization (no Developer ID available here, so the DMG was built with `identity=null`; users get a Gatekeeper warning). No app icon. No release workflow. Windows and Linux targets are configured but were never built on their platforms. | `node scripts/stage-sidecar.mjs` → staged `build/python` (78 MB) + `build/sidecar-venv` (87 MB), bundled sidecar imports with 148 routes. `electron-builder --mac dmg --arm64` → `dist-electron/BandReady-0.1.0-arm64.dmg`. Launched the installed `.app`: sidecar child process spawned, `/health` → `{"status":"ok","db":"ok","migrations":"0001"}`, and the content routes returned 2 reading tests / 16 writing prompts / 48 speaking cards / 21 vocab decks. |

---

## Verified commands

### 1. Sidecar test suite

```
$ cd sidecar && BANDREADY_ENABLE_MOCK=1 uv run pytest -q
558 passed, 2 warnings in 5.06s
```

Both warnings are third-party deprecations (`starlette.testclient` httpx, pipecat `audioop`).
**Zero failures.** (An earlier report of a failing `test_api_smoke.py` no longer reproduces.)

### 2. Sidecar lint

```
$ cd sidecar && uv run ruff check bandready
All checks passed!
$ cd sidecar && uv run ruff check tests
All checks passed!
```

Note: lint config lives in `sidecar/ruff.toml`, **not** `pyproject.toml`. Ruff ignores a
`[tool.ruff]` table when a `ruff.toml` sits beside it — a real footgun for whoever edits it next.

### 3. Renderer typecheck

```
$ cd app && pnpm exec tsc --noEmit -p tsconfig.json && echo TSC_OK
TSC_OK
```

### 4. Renderer build

```
$ cd app && pnpm build
dist/index.html                     0.82 kB │ gzip:   0.43 kB
dist/assets/index-B10m-Los.css     50.67 kB │ gzip:   9.93 kB
dist/assets/index-Ci0soi8w.js   1,850.86 kB │ gzip: 518.21 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 3.06s
```

Builds clean. The 1.85 MB single chunk is a real (non-blocking) issue: `App.tsx` eagerly globs
every feature route, so nothing code-splits. Vite also warns that `features/home/blocks.ts`
dynamic-imports modules that are already statically imported — a no-op.

### 5. Renderer unit tests

```
$ cd app && pnpm exec vitest run
Test Files  21 passed (21)
     Tests  174 passed (174)
```

### 6. End-to-end (Playwright, real Chromium against a real sidecar)

Initially flaky: `vocab.spec.ts:23` failed on **2 of the first 4 runs**, timing out on the "Review"
tab because an unanswered confirmation dialog's overlay was swallowing every click.

```
$ cd app && pnpm exec playwright test --reporter=line
  1 failed
    [chromium] › vocab.spec.ts:23:5 › accepting a suggestion schedules it, …
  13 passed (41.6s)
```

**Root-caused and fixed** (see [Fixes](#fixes-made-during-this-verification) 2 and 3). The spec
clicked "Accept all" twice — the confirmation's own button shares that accessible name, so
`.last()` resolved back to the inbox button whenever it was read before the dialog rendered. The
second click opened a fresh dialog that nobody ever answered. Final state, **4 consecutive clean
runs**:

```
14 passed (21.9s)
14 passed (22.0s)
14 passed (21.7s)
14 passed (21.7s)
```

### 7. Electron typecheck and bundle

```
$ cd app && pnpm exec tsc --noEmit -p electron/tsconfig.json && echo ELECTRON_TSC_OK
ELECTRON_TSC_OK

$ node scripts/build-electron.mjs
✓ 5 modules transformed. built in 112ms
[build-electron] dist-electron/main.js  22.7 kB
[build-electron] dist-electron/preload.js  1.0 kB
[build-electron] ok
```

### 8. Content pack

```
$ validate_pack(content/core-en, verify_checksums=True)
checksums=True -> OK
```

| File | Rows |
|---|---|
| `topics.jsonl` | 20 |
| `card_sets.jsonl` | 12 |
| `speaking_cards.jsonl` | 48 (part 1: 24, part 2: 12, part 3: 12) |
| `writing_prompts.jsonl` | 16 (ac_task1: 6, task2: 6, gt_task1: 4) |
| `reading_passages.jsonl` | 6 (**all `academic`; zero `general_training`**) |
| `reading_tests.jsonl` | 2 |
| `listening_scripts.jsonl` | 4 |
| `listening_tests.jsonl` | **1** |
| `vocab.jsonl` | 343 across 21 decks |
| `pron_pairs.jsonl` | 20 |
| **Total** | **472** |

### 9. Fresh-install simulation

Wiped `/tmp/br-fresh`, booted `bandready.cli serve --port 8731` with `BANDREADY_ENABLE_MOCK=1`.

- **(a) Migrations ran:** `Running upgrade -> 0001, baseline — full schema of 11-data-model.md v2`
  → 47 tables created (including the `vocab_fts*` FTS5 shadow tables).
- **(b) Content pack seeded:** counts as listed above, `'created_topics': []`, `'warnings': []`,
  `untyped_data: ['pron_pairs.jsonl']`.
- **(c) Every GET route responded without a 5xx.** The live OpenAPI spec declares **150
  route/method pairs**, of which **72 are GET**. 68 were exercised with real discovered ids
  (4 skipped: media paths needing a ticket-signed hash, `/dictionary/{word}`).
  **5xx count: 0.** Non-200s were all correct: `404` for deliberately nonexistent ids, `409` for
  `/placement/next` with no active sitting, `422` for `/media/pron/ref` without params.
- **(d) Content routes returned real rows:** reading tests 2, reading passages 6, listening tests 1,
  listening scripts 4, speaking cards 48, writing prompts 16, vocab decks 21, pron drills 10 items
  / 22 contrasts, packs 1.

### 10. Sidebar / route registration

Nine `app/src/features/*/route.tsx` files exist and every required screen is registered:

| Route | Label | Registered |
|---|---|---|
| `/` | Home | yes |
| `/speaking` | Speaking | yes |
| `/writing` | Writing | yes |
| `/reading` | Reading | yes |
| `/listening` | Listening | yes |
| `/vocab` | Vocabulary | yes |
| `/progress` | Progress | yes |
| `/settings` | Settings | yes |
| `/onboarding` | *(unlabelled by design)* | yes |

### 11. Real desktop app boot (not in the original checklist — added because it is the claim that matters)

```
$ cd app && pnpm exec electron dist-electron/main.js
[sidecar] spawning .../sidecar/.venv/bin/python -m bandready.cli serve (port 51164)
[sidecar:out] SIDECAR_READY {"base_url": "http://127.0.0.1:51164", "token": "…", "pid": 42371}
... Running upgrade -> 0001, baseline …
... content pack seed: {'status': 'installed', … 'created_topics': [], 'warnings': []}
[sidecar] healthy on http://127.0.0.1:51164
[update] disabled in dev
... GET /api/v1/progress/summary -> 200
... GET /api/v1/plan -> 200
```

Ran for 60 s. Process alive, **zero** errors / uncaught exceptions / failed loads in the log.

### 12. Real local speech engines (not in the original checklist — added to settle an open question)

Earlier reports asserted no machine here could run Kokoro or Whisper. **That is wrong.** Both work:

- **Kokoro TTS produced real audio.** Three listening scripts rendered to 24 kHz WAVs
  (321.6 s / 393.1 s / 378.6 s). Acoustic check: RMS 0.070–0.073, peak 0.84, spectral centroid
  2.5–2.8 kHz — real speech.
- **The mock TTS preset produces digital silence** (RMS `0.00000`, peak `0.0000`), which is how I
  confirmed the other two were genuinely Kokoro and not the mock.
- **faster-whisper transcribed Kokoro's own output accurately.** Model loaded in 0.2 s, 40 s of
  audio transcribed in 1.1 s:

  > "Good afternoon, Northgate Community College and Rollmans, Rachel speaking. Oh hello, I'm
  > ringing about the evening classes, the autumn ones. Is it too late to sign up? Not at all,
  > we've still got places on most of them…"

  (Against the authored script: "…Enrolments, Rachel speaking" — one proper-noun slip on a
  `base` model. The content, spelling drill and dialogue structure all came through.)

---

## Fixes made during this verification

1. **`sidecar/bandready/voice/pipeline.py` — live voice was unreachable on Apple Silicon.**
   Pipecat 1.5.0's `pipecat.services.whisper.stt` raises at *import* time on `arm64` macOS when
   `mlx_whisper` is absent — even though the faster-whisper backend BandReady actually uses does
   not need it. Every attempt to build the speaking pipeline died with
   `ImportError: Missing module: No module named 'mlx_whisper'`, so **no Apple Silicon user could
   ever start a speaking session**, and the MLX extra is a multi-gigabyte download for a model
   they would never run. Added `_import_whisper_stt()`, which satisfies the guard with a
   placeholder module only when the real one is missing, imports once, then withdraws the
   placeholder. `WhisperSTTServiceMLX` imports `mlx_whisper` lazily in its own constructor, so
   selecting the MLX preset without the extra still fails loudly and correctly.
   *Verified:* `build_stt_service` now returns a real `WhisperSTTService` and loads the Whisper
   model; `mlx_whisper` is not left in `sys.modules`; `build_tts_service` returns
   `KokoroTTSService`; 558 tests still pass and ruff is clean.

2. **`app/src/components/ui/ConfirmProvider.tsx` — two real dialog bugs.**
   - *Generic-text flash:* `opts` is set to `null` the moment the dialog is settled, but HeadlessUI
     keeps the panel mounted through its leave transition, so every confirmation visibly swapped
     its title, message and button labels to the fallbacks ("Are you sure?" / "This action cannot
     be undone." / "Confirm") on the way out. The last options are now retained until the panel is
     really gone.
   - *Orphaned promise:* calling `confirm()` while a dialog was already open overwrote
     `resolver.current`, so the **first** caller awaited a promise that could never settle — its
     `await confirm(...)` hung forever. A superseded dialog now resolves `false`, so the standard
     `if (!(await confirm(...))) return;` guard unwinds cleanly.

3. **`e2e/vocab.spec.ts` — the flaky spec was genuinely wrong.** It read
   `getByRole("button", {name: "Accept all"}).last()` immediately after clicking "Accept all". The
   confirmation's own button carries the same accessible name, so on a slow run the locator
   resolved *before* the dialog mounted, matched the inbox button again, and clicked it a second
   time — leaving an unanswered dialog whose overlay blocked the rest of the test. Now it waits
   for the second button to exist, clicks it, and asserts both are gone.

All three fixes are additive and were re-verified against the full suites: 558 pytest, ruff clean,
tsc clean (renderer + electron), 174 vitest, and 4 consecutive 14/14 Playwright runs.

---

## Known gaps and next steps

**P0 — blocks shipping to a single real user**

1. **There is no packaging.** Write the electron-builder config (appId, `files`, icons,
   `extraResources`), and build the step that produces `<resources>/sidecar-venv` — a relocatable
   Python environment with the sidecar and its dependencies. `electron/main.ts` already expects
   this exact layout; nothing produces it. Until then the app runs only from a source checkout.
2. **No code signing or notarization**, and no release workflow. On macOS an unsigned app is
   quarantined; `electron-updater` is wired but has nothing to update from.
3. **Complete one real live speaking call** with a real LLM + Whisper + Kokoro, on a real machine,
   with a human listening. Fix (1) above removed the import blocker, but the full loop has never
   run. This is the app's flagship feature and it is the single largest unverified claim.

**P1 — the product is thin or misleading without these**

4. **Content volume.** 1 listening test, 2 reading tests, 0 General Training reading passages. A
   General Training user gets *no* reading practice at all and the placement reading section is
   skipped entirely for them. The placement sampler wants 2 listening tests and gets 1.
5. **Add one same-topic reading passage pair** at ~5.5–6.0 and ~7.5–8.0 so placement's adaptive
   pivot stops falling back to cross-topic extremes.
6. **First-run provider experience.** A brand-new user with no Ollama gets a `502 provider_error`
   the first time they submit an essay. It degrades honestly (the detail is surfaced), but
   onboarding should detect the absence and either guide the install or offer a clearly-labelled
   reduced mode.
7. **Add `GET /api/v1/reading/attempts`.** Listening, writing and speaking all have a list route;
   reading does not, and the progress screen has to footnote the hole.

**P2 — correctness and polish**

8. **Reconcile doc 18 with the server.** `GET`/`PUT /api/v1/profile` are specified but do not
   exist; `PUT /api/v1/settings` is specified but the server implements `PATCH`.
9. **Fix or delete `app/src/stores/progress.ts` and `app/src/stores/srs.ts`** — both still model
   obsolete API shapes. Every feature already bypasses them, so they are dead weight that will
   mislead the next contributor. `srs.ts` also exports an `ExerciseType` union that does not match
   the sidecar's six exercise types.
10. **Code-split the renderer.** 1.85 MB in one chunk because `App.tsx`'s route glob is eager;
    `React.lazy` + `Suspense` would fix it.
11. **Loader bug:** `content/loader.py::derive_listening_questions` persists only
    `int(word_limit['words'])` and drops `numbers`, while `generate_listening.effective_word_limit`
    sums both. The pack works around it by folding the total into `words`; the loader should call
    `effective_word_limit`.
12. **No vocab audio producer** — `/api/v1/media/vocab/<id>.wav` 404s on every install, so the
    audio-recall exercise always falls back to platform speech synthesis.
13. **E2E isolation.** The suite runs `workers:1, fullyParallel:false` against one shared database;
    specs tolerate warm state but are not isolated. Sharding will need per-worker sidecars. The one
    flake found was root-caused and fixed (§6), but the shared-state design will produce more.
14. **Screenshots.** `README.md` links `docs/screenshots/*.png`, which do not exist — they render
    as alt text.

---

## Not yet verified

Everything in this section is **unproven**. Do not represent any of it as working.

- **Scoring calibration.** Real-model scoring is spot-checked, not calibrated: a strong essay
  scored 8.0 and a weak one 5.0, both plausible, but the golden-set framework in
  `14-testing-strategy.md` has no samples and has never been run. Treat band numbers as
  indicative until it is.
- **Automated coverage of the live call.** The call itself works (verified manually), but headless
  Chromium cannot establish the peer connection, so no test guards it against regression. A change
  to the voice pipeline will not be caught by CI.
- **Code signing and notarization.** Never attempted. No certificates, no `CSC_LINK`. The DMG that
  exists was built with `identity=null`, so macOS shows a Gatekeeper warning.
- **Windows and Linux builds.** Configured in `electron-builder.yml`, never built on those
  platforms.
- **Auto-update.** `electron-updater` is wired and correctly disabled in dev. The update path has
  never been exercised against a real feed.
- **Both CI workflows.** `ci.yml` and `e2e.yml` have **never run on GitHub Actions** — only their
  individual commands, locally, on macOS. In particular `uv sync --extra dev --frozen` is
  unverified; if `sidecar/uv.lock` is stale the sidecar job fails there and the fix is `uv lock`.
  `playwright install --with-deps chromium` on `ubuntu-latest` is likewise unexercised.
- **Writing evaluation and speaking scoring against a real model.** Verified **with `mock_llm`
  only**. The mock returns deterministic fixtures; it proves the plumbing, the job hand-off, the
  parsing and the report rendering — it proves nothing about band accuracy, rubric adherence or
  prompt quality.
- **Answer-key correctness of the shipped content.** The reading and listening keys were authored
  and self-validated. Doc 15 §3.3's LLM-backed blind key-agreement and chart-solvability
  validators and §3.5's second-person human review are **not implemented anywhere**. The keys have
  never been independently checked.
- **Audio quality of the listening scripts.** Kokoro renders them and Whisper reads them back
  intelligibly, but no human has listened. Letter-by-letter spellings ("O-K-A-F-O-R"), times
  ("6.45") and currency ("£86") are the tokens most likely to be wrong — and note that Whisper
  heard "Rollmans" where the script says "Enrolments".
- **`POST /pron/read-aloud`.** Needs a multipart WAV upload; answered 422 in the sweep because the
  test did not synthesize one. The read-aloud scoring path is untested end to end.
- **Non-Chromium browsers, and the packaged Electron app under test.** Playwright covers Chromium
  only, and drives the renderer in a browser — not the packaged app. Doc 14 §7.3's
  `_electron.launch()` path, the spawn/token/health handshake and sidecar-crash recovery are
  covered only by the manual boot in §11 above, not by any automated test.
- **Windows and Linux.** Everything here was verified on macOS/arm64 only. The `mlx_whisper` guard
  that fix (1) works around is Apple-Silicon-specific; the fix is a no-op elsewhere, but no other
  platform was exercised at all.
- **Data export, pack import, model download, offline mode.** No E2E coverage.


---

## Update — 2026-07-26: live voice and real-model scoring confirmed

Two of the three headline gaps in the original report are now closed.

**Real-model scoring works.** With an OpenRouter key supplied via `.env` and
`qwen/qwen3-30b-a3b-instruct-2507` configured, the writing pipeline ran end to end for the first
time against a real model rather than the mock:

| Essay | Overall | Criteria | Time | Cost |
|---|---|---|---|---|
| Strong, well-argued | 8.0 | 8 / 8 / 8 / 8 | 14 s | ~$0.0002 |
| Weak, error-heavy | 5.0 | 5 / 5 / 5 / 5 | 38 s | ~$0.0002 |

The weak essay produced **10 annotations anchored to exact character offsets** with fixes and
explanations, plus **13 vocabulary suggestions**. An earlier draft of this document implied the
annotation pipeline produced nothing; that was a probe reading the wrong field names — the API
serialises `annotations` and `vocab_suggestions`, not `annotated_errors`/`vocab_upgrades`.

**The live WebRTC speaking pipeline works.** Confirmed by the project owner at a real microphone.
This was the single largest unknown in the project — every component had been proven individually,
but audio flowing browser↔sidecar had never completed. It does.

**Packaging works.** A 156 MB unsigned arm64 DMG was built and the installed app verified: it
spawns the bundled Python, migrates, seeds content and serves its API.

What that leaves: scoring calibration against a golden set, automated regression coverage for the
live call, code signing, and non-macOS builds.
