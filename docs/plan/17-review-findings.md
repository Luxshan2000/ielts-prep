# 17 — Consistency & completeness review findings

Status: draft (2026-07-25)

Cross-review of `_context/decisions.md` and docs 00–16. Overall the set is unusually concrete and most reconciliations 11-data-model.md claims are real — but several domains (vocabulary, curriculum/progress, pronunciation storage, API routing, repo layout, content targets) have two or more incompatible specifications, and the roadmap (16) contradicts locked module decisions in at least four places. Findings are grouped as Conflicts (two docs disagree, or a doc violates a locked decision), Gaps (a week-one implementer is blocked or must guess), and Risks, each with citations and suggested resolutions.

## Conflicts

### C1. API prefix: `/api/v1` vs `/api/` — two incompatible route namespaces
01-architecture.md §9 fixes the prefix as `/api/v1` ("unknown `/api/*` → 404"), and 13-packaging-distribution.md §7.3 (`/api/v1/models/*`) and 14-testing-strategy.md §3 (`/api/v1/sessions`, `/api/v1/voice/offer`, `/api/v1/settings/providers`) follow it. But every module doc uses un-versioned paths: 02-voice-pipeline.md §2.4 (`/api/speaking/sessions/{id}/offer`), 03-providers-and-settings.md §11 (`/api/settings`, `/api/providers/*`), 04 §10, 05 §11, 06 §9, 07 §11, 08 §9, 09 §4.6, 10 §11. There is no single route inventory anywhere.

### C2. Voice offer endpoint shape disagrees
01-architecture.md §6 and 14-testing-strategy.md §3 specify `POST /api/v1/voice/offer` (session referenced in body/before), while 02-voice-pipeline.md §2.4 and 04-speaking-module.md §10 specify `POST /api/speaking/sessions/{session_id}/offer`. Same handshake, two different URLs; the Playwright/aiortc regression tests in 14 §3 test the URL that 02/04 do not implement.

### C3. Repo layout: three different trees
- 01-architecture.md §7: `app/` (one package: `app/electron/`, `app/src/pages/...`) + `sidecar/bandready/...`.
- 16-roadmap.md §3 (P0 scaffold): `apps/desktop` + `apps/renderer` + `sidecar/`.
- 02-voice-pipeline.md §1 and 09-pronunciation-assessment.md §4.0: `packages/core/bandready/...` (OpenVoiceUI's layout, which decisions.md says this is a separate repo from).
- Frontend paths: `src/pages/...` (01 §7, 07 §file tree "webui/src/pages/listening/") vs `src/features/...` (05 §12, 06 §9) vs `webui/src/features/reading/` (06 §9).
An implementer cannot run `git init` + scaffold without picking a winner.

### C4. Vocabulary schema: 08 and 11 define incompatible models (largest conflict in the set)
08-vocabulary-srs.md §2 declares "All tables below are owned by 11-data-model.md; this doc is the functional source of truth" — but the two disagree on nearly everything:
- Tables: 08 has `vocab_entries` + `vocab_sources` + `srs_cards` + `srs_review_logs` (INTEGER PKs, `fsrs_json` blob column); 11 §6 has a single `vocab_cards` (TEXT ULID, FSRS columns inline, **no** `fsrs_json`, no sources table) + `vocab_reviews`.
- Dedup key: 08 §3.1 `(lemma, pos)` ("book (noun)" ≠ "book (verb)"); 11 §6 `UNIQUE (profile_id, lemma)` — pos-distinct entries impossible.
- Status enum: 08 `active|suspended|known`; 11 `suggested|active|suspended|archived` — 08 has no `suggested`, 11 has no `known` (which 08 §3.3 merge rules depend on).
- Review/exercise types: 08 §5.2 `flip|cloze|use_in_sentence|collocation|audio_recall|speaking_drill`; 11's `vocab_reviews.review_type CHECK IN ('recall','use_in_sentence','listen_repeat')` would reject four of 08's six types at INSERT time.
- profile scoping: 08 has none; 11 requires `profile_id`.

### C5. Vocab ingestion consent: auto-schedule vs suggested-inbox
04-speaking-module.md §8 and 05-writing-module.md §10 mandate that nothing enters the SRS silently (suggestion inbox, per-item learner acceptance; 04 names `POST /api/vocab/suggestions`). 08-vocabulary-srs.md §3.2's ingest flow (`POST /api/vocab/entries`, the endpoint "each module" calls) inserts the entry **and an srs_cards row with `due=now`** immediately — no suggested state exists in 08 at all. 07-listening-module.md §12 likewise "emits SRS candidates" automatically. 11's `status` default `'suggested'` supports 04/05; 08's flow contradicts both.

### C6. Pronunciation storage: 09 vs 11 tables are different and 11's cannot hold 09's data
09-pronunciation-assessment.md §7 defines `pron_scores` (source ∈ speaking_turn|read_aloud|shadowing|minimal_pair; `score INTEGER 0–100`; nullable session linkage) + `pron_drill_attempts`. 11-data-model.md §7 instead defines `pron_word_scores` with `turn_id TEXT NOT NULL REFERENCES speaking_turns(id)` and `score REAL 0–1`. Consequences: read-aloud/shadowing/minimal-pair production scores (09 §5) have **no storable home** in the canonical schema, the score scale differs (0–100 vs 0–1; 09 §6 additionally serializes 0–1 into the prompt), and `pron_drill_attempts` is absent from 11 entirely.

### C7. Audio retention: 09 contradicts 11's canonical never-evict policy
11-data-model.md §9 (explicitly "canonical — supersedes the 02 §5 sketch and answers 04 open question 5"): user recordings are **never auto-evicted**. 09-pronunciation-assessment.md §7 still says "the WAVs they reference follow 02/11's 20-session audio pruning — after pruning, replay buttons disable". 02 §5 also still carries the 20-session default. 09/02 were not synced to 11's decision.

### C8. Curriculum/progress tables: 10 and 11 disagree on nearly every table
10-curriculum-progress.md §11 ("11-data-model.md owns canonical DDL; column-level changes there must be reflected here") requires: `learner_profile` (single row, `daily_minutes`, `study_days`, `self_level`), `placement_results`, `study_plans(horizon_weeks, weights_json, superseded_by)`, `plan_sessions` (blocks_json, phase build|taper, status incl. `in_progress|partial`), `band_estimates` as a **one-row-per-skill recomputed cache** (range_low/high, confidence TEXT enum, n_eff), `adaptive_events`, `daily_activity`, `milestones`, `readiness_items`, and a generic `attempts` table. 11 §2/§8 instead has: multi-row `profiles` (no self_level/daily_minutes/study_days; `exam_format IN ('academic','general')` vs 10's `'general_training'`), `study_plans(goal_band, exam_date, rationale_json)` + flat `plan_items` (no phases, no blocks, status `pending|done|skipped`), and `band_estimates` as an **append-only snapshot log** (single `band REAL`, `confidence REAL 0–1`). `placement_results`, `adaptive_events`, `daily_activity`, `milestones`, `readiness_items` do not exist in 11 at all. These are not naming nits — the plan model (sessions-with-blocks vs flat items) and the estimate model (cache vs log) are architecturally different.

### C9. Overall-band rounding rules differ across 04, 05, and 10
- 04-speaking-module.md §6.1/§6.3: ties round **up** (".25 up to .5 and .75 up to the next whole").
- 05-writing-module.md §6.1: ties round **down** ("deliberately conservative"), reproduced in 14-testing-strategy.md §2.2 test cases (6.25→6.0).
- 10-curriculum-progress.md §6.3: the *official* rule rounds .25/.75 **up**, unit-tested per 14 §2.2.
Per-module divergence may be intentional (05 flags it), but 04 vs 05 give a learner different arithmetic on the two LLM-scored skills with no doc acknowledging the difference, and 14 tests both rules in adjacent bullets without noting they conflict.

### C10. Fluency-metrics contract: 04's evaluator input doesn't match what 02 computes
02-voice-pipeline.md §4.2 defines the metric set (`wpm`, `articulation_wpm`, `mean_pause_ms`, `long_pause_count` [threshold ≥1500 ms], `pause_ratio`, `initial_latency_ms`, `filler_count`, `false_start_count`, `fillers_per_min`). 04-speaking-module.md §6.3 `evaluate_user.txt` embeds a different shape: `long_pauses_over_1s` (different threshold), `filled_pauses`, `mean_length_of_run_words`, `self_corrections`, `p2_long_turn_secs` — the last three are computed nowhere in 02. The scoring prompt references data that will not exist.

### C11. Speaking session events: RTVI messages vs dedicated WebSocket
02-voice-pipeline.md §6.3 drives session-layer phases via "RTVI server messages from the state machine" (over the Pipecat channel); 04-speaking-module.md §3.3/§10 defines a separate `WS /api/speaking/sessions/{id}/events` carrying state/timer/cue_card/report events; 14-testing-strategy.md §4 harness subscribes to "the session WebSocket". Also the phase vocabularies differ three ways: 02 §6.3 `part2-monologue/part2-questions`, 04 §3.1 `P2_LONG_TURN/P2_ROUNDING`, 12 §10 `part2-talk`.

### C12. Content-pack format: 11 §11 and 15 §6 specify two different archives
- Extension/naming: 11 `.brpack`, reverse-DNS `org.bandready.core`; 15 plain zip dir `bandready-pack-core-en` (id = dirname).
- Manifest keys: 11 `format`/`format_version`/`counts`/`media[]`; 15 `manifest_version`/`id`/`publisher`/`checksums`/`disclaimer`/`ai_disclosure`/`built_with`. Neither is a superset.
- Layout: 11 puts JSONL under `data/`; 15 at top level, and 15 adds `card_sets.jsonl` and `vocab.jsonl` which 11's layout lacks (11 has no vocab pack path at all despite 08 §6 shipping ~2,000 entries in packs).
- 15 §6 import step says "upsert into `content_items` keyed (pack_id, item_id)" — `content_items` was 06's sketch that 11 §3 explicitly **replaced** with typed tables; 15 references a table that no longer exists.

### C13. Roadmap 16 contradicts module/packaging decisions it cites
- **Windows signing**: 13-packaging-distribution.md §8.2 decides "v1 Windows builds are unsigned" (SmartScreen flow documented); 16-roadmap.md P5 scope says "Windows code signing (OV cert default)" and the v1.0 exit gate requires "Signed + notarized installers … on both OSes". One of these blocks the launch.
- **Paste handling**: 05 §3 "Paste: allowed but recorded … never a block"; 16 P2 "paste-blocking toggle (default on in test mode)".
- **Autosave**: 05 §3 every 10 s; 16 P2 every 5 s.
- **Splash screen**: 01 §4.2 "a splash/loading state is unnecessary — window isn't shown until healthy"; 16 P0 "polls /health until ready (splash screen meanwhile)".
- **Crash-restart cap**: 01 §4.4 fatal after 5 consecutive failures; 16 P0 "max 3, then error dialog".
- **Personas**: 16 P1 ships `examiner-neutral|encouraging|strict`; 04 §4 defines exactly one examiner persona + one coach.

### C14. Launch content targets: 15 vs 16 don't reconcile
15-content-authoring-licensing.md §5 sets launch targets (60 speaking sets, 240 writing prompts, 8 reading tests, 4 listening tests, 2,000 vocab; explicitly superseding 04 §5 and 05 §2's smaller figures). 16-roadmap.md §9.1 cumulative deliverables through P5 are 20 speaking sets, 40 writing prompts, 4 reading + 2 listening tests (+P3.5's 2 GT reading/10 letters), vocab decks unsized. Roughly a third of 15's launch bar is scheduled; no doc says which number is the v1.0 gate. 15 §5's effort plan also requires a second recruited reviewer 16 never staffs.

### C15. Placement test: duration and flow specified three ways
10-curriculum-progress.md §2–3: 5-question wizard then a ~45-minute placement (Speaking ~6 + Writing ~18 + Reading ~12 + Listening ~8). 12-design-system.md §6.9: a different 5-step wizard (theme, variant, engine detection, mic check) ending in an "optional **25-min** placement test or 'skip, start at Band 5.5 plan'". 13-packaging-distribution.md §7.1 inserts model downloads as "Step 3 of onboarding". 00-vision.md §7's activation target says placement **plus first speaking session** "must be completable in < 20 minutes", arithmetically impossible against 10's 45-minute placement.

### C16. Latency target: 00 vs 02
00-vision.md §7 quality metric: "< 1.2 s median examiner response latency". 02-voice-pipeline.md §9: "Target: < 1.5 s … p50", with a budget that sums to ~1.5 s and a 600 ms VAD floor. The vision doc's public metric is unachievable per the pipeline doc's own budget.

### C17. Primary color: 12's teal vs locked indigo and 06's copy
decisions.md ("UI look") locks "replicate OpenVoiceUI's design system (… indigo-on-240°-neutral HSL token palette …)"; 12-design-system.md §1 deliberately switches primary to teal (flagged as a decision, arguably within "the design-system doc owns exact tokens"). But 06-reading-module.md §9 still says "dark default, **indigo** primary" — stale either way, and the decisions.md text should be amended if teal stands.

### C18. One-LLM lock vs cross-model validation language
decisions.md locks "exactly one LLM". 06-reading-module.md §7 Stage 3: "If a *different* model is configured as available, validation prefers it" — there is no mechanism to configure a second model (06's own open Q3 admits this). 14 §5.4's reference-model matrix and 15 §3.2's frontier authoring model are fine (out-of-app tooling), but 06's in-app sentence contradicts the lock.

### C19. Data-dir layout: 01 vs 02/11
01-architecture.md §8 shows `recordings/<session_id>/*.wav` and user packs under `content/`; 02 §5 and 11 §9 (canonical) use `media/speaking/<session_id>/` and `packs/<pack_id>/<version>/`. 08 §5.3 additionally writes `{data_dir}/audio/vocab/…` and 09 §5.2 `media/pron/ref/…` — neither appears in 11 §9's canonical tree or the media eviction policy.

### C20. Settings-vs-DB placement of prefs, and the settings API surface
03-providers-and-settings.md §2.3 says theme/appearance live in "the SQLite `app_prefs` table (11-data-model.md)"; 11 §2's table is named `settings`. 14-testing-strategy.md §3 tests `PUT /api/v1/settings/providers` with a partial body `{"llm": {"type": "mock"…}}`; 03 §11 defines only `PUT /api/settings` taking the full document — the mock-LLM registration seam 14 depends on doesn't exist in 03's API.

## Gaps

### G1. No API-route inventory / no versioning decision (blocks every route stub)
Given C1/C2/C20, there is no single authoritative list of sidecar routes, methods, auth requirements, or the prefix. Week-one FastAPI scaffolding requires it. (01 §7's `routes/` listing is the closest thing and omits writing/reading/listening/pron/progress entirely.)

### G2. Authenticated media & WebSocket access from the renderer is unspecified
Every route requires `Authorization: Bearer` (01 §5), but 07 §11 serves `GET /api/media/listening/{hash}.wav` to an `<audio>` element (which cannot set headers), 08 §9 streams vocab WAVs, 09 §5 replays clips, and 04 §10 opens a WebSocket (browser `WebSocket` cannot set headers either). No doc specifies the mechanism (token query param? one-time media tickets? cookie?) — this hits the first Listening or Speaking UI ticket and can force an auth redesign.

### G3. The attempts→band-estimate pipeline has no owner
10 §6 computes rolling estimates over "scored attempts" with weights by mode (`placement|mock|practice|micro`), but: 11's envelope `practice_sessions` has no `band`, `mode`, or `criteria_json`; bands live scattered in `writing_submissions.overall_band`, `reading_attempts.band`, `listening_attempts.band`, `llm_evaluations.overall_band`; no doc defines the query/view that feeds the estimator, who recomputes `band_estimates`, or where "mock vs practice" is recorded for speaking (speaking_sessions has `mode` but with different values). 10's required generic `attempts` table (§11 comment block) exists nowhere.

### G4. Profile scoping is half-designed
11 mandates `profile_id` on all learner-data roots and a `settings.active_profile_id` key, but no module API (04–10) accepts or resolves a profile; 10 §11 hard-codes single-learner `CHECK (id = 1)`; 10's open Q5 explicitly defers a decision that 11 has already taken the other way. Alembic baseline (P0) freezes one of these — must be decided before migration 0001.

### G5. Shared answer-normalizer location and single implementation
06 §4 places it at `bandready/scoring/reading.py`, 06 §9's file map at `bandready/reading/scoring.py`, 07 §file-tree at `listening/scoring.py` ("shared helpers imported by reading"), 14 §2.1 imports `bandready.scoring.reading`. Also the two normalizers differ subtly (06 §4.1 strips leading article unconditionally; 07 §5 strips it "only if every stored variant also lacks them"). The single most-tested function in the app (150+ case table) has no agreed home or single spec.

### G6. Job/progress transport convention is missing
Long-running work uses four different mechanisms: SSE (03 §6 setup), a per-speaking-session WS (04 §3.3), "progress events over the existing WS channel" for reading generation (06 §7 — no such channel exists outside speaking), 202+polling (05 §11 writing submit, 13 §7.3 model downloads). A generation-job or app-events channel needs one decision before P2/P3.

### G7. Offline dictionary for reading look-ups is unowned
06 open Q5 defers "bundled WordNet vs Wiktionary" to 08; 08 never addresses it — its `POST /api/vocab/lookup` is an LLM enrichment call, which fails the double-click-popover latency/offline expectation; 16 P4 asserts "offline WordNet-based definitions default" as if decided. No doc specs the bundled dictionary asset, size, or license.

### G8. `speaking_cards` columns vs 04's card schema are unreconciled in detail
11 §3 `speaking_cards` has `title`/`topic_id`/`payload_json`; 04 §5's JSON has `topic`, `tags`, `card_set` as a separate document. Where `card_set` rows live (11 has only a `card_set_id` column on cards; 15 §6 has `card_sets.jsonl`) is undefined — the Full-Mock picker (least-recently-served *sets*, 04 §2) can't be written against 11 as specced.

### G9. Placement content does not exist in any content plan
10 §3 needs adaptive 8-question reading/listening samplers (band-5–6 and band-7–8 sets "of the same passage family") and variant-specific short writing tasks; 15 §5's launch targets and 16 §9.1's cadence contain no placement items (16 P4 mentions "placement mini-test content" with no counts, and the adaptive same-family passage-pair requirement appears nowhere in 15's pipeline).

### G10. Speaking overall-band server recompute unspecified
05 §6.3 recomputes `overall_band` server-side and ignores the model's value; 04 §6.3 instructs the model to compute it and never states a server-side recompute. Given C9's rounding mess, 04 needs an explicit post-processing section mirroring 05's.

### G11. Content tooling packaging is undefined
15 §3 runs `python -m tools.content` from the app repo venv, while 15 §7's community CI runs `pip install bandready-content` — a PyPI package no doc defines (name, repo location, how validators shared with the sidecar (`bandready/content/`) are factored out).

### G12. Zustand store inventory conflicts and misses domains
01 §7 lists `stores/ session, settings, progress, srs`; 05/06 each add their own feature `store.ts`; 08 names `useVocabStore`/`useReviewStore`. Minor, but no doc owns frontend state conventions for writing/reading/listening attempt state vs the four global stores.

### G13. `speaking_turns` writer unspecified
11 §4.2 introduces `speaking_turns` as the queryable projection of `transcript_json`, but 02 §2.4's teardown persists only `speaking_sessions`/transcript+manifest; no doc says who flattens turns into rows (teardown? background job?) — pron scoring (09) and report playback both join on it.

## Risks

### R1. Schema authority is fractured — the Alembic baseline will be wrong on day one
11 claims canonical status but materially diverges from 08 (vocab), 09 (pron), and 10 (curriculum) — C4, C6, C8 — and those docs claim functional authority over the same tables. Whichever migration 0001 encodes, at least two module implementations will be built against a different shape. This is the highest-leverage fix: one reconciliation pass over 11 with sign-off from 08/09/10 before any code.

### R2. Roadmap arithmetic vs content reality
16's 31 solo-dev weeks assumes content at "~15% of phase effort", but 15's own launch targets cost ~136 review-bound hours **with a second reviewer who doesn't exist yet** (15 open Q5), and 16 only schedules ~35% of 15's targets (C14). Either v1.0 ships with a content bank far below the advertised "complete practice environment" (00 §1), or the schedule slips by months.

### R3. Scoring-trust chain has unfunded dependencies
The credibility story (00 §7, 14 §5, 16 R1) hinges on a ~50-sample expert-annotated golden set; expert sourcing is an open question in three docs (14 Q1, 15 Q5, 16 Q5) with cost "likely yes, unbudgeted". Without it the ±0.5 gates are self-referential and the "recommended model" machinery (03 §7, 14 §5.4) has no ground truth.

### R4. Voice stack single-point pin
Everything rests on pipecat-ai 1.5.0's five documented landmines (decisions.md, 02 §2.1). The mitigations are good (E2E harness, pinned CI guard), but the latency contradiction (C16) plus unverified Electron AEC on speakers (02 open Q) and Windows voice-CI uncertainty (14 Q2) mean the flagship demo path has the least cross-platform verification of any subsystem.

### R5. Auth model vs browser realities (G2)
If bearer-only auth survives until the Listening player is built, media and WS access will force either a token-in-URL hack (leaks into logs) or a mid-project auth redesign touching every route. Cheap to decide now, expensive in week six.

### R6. Windows distribution friction
Unsigned Windows builds (13 §8.2) + SmartScreen + an ~800 MB NSIS payload + AV heuristics on a bundled Python tree (16 R7) risks the primary Windows funnel converting badly at launch — and 16's v1.0 gate currently *requires* signing that 13 has decided not to do (C13), so this will surface as a launch-week dispute.

### R7. Multi-profile ambiguity compounds over time (G4)
Every week of building against `CHECK (id = 1)` tables while 11 mandates `profile_id` raises the retrofit cost; the decision is deferred in 10's open questions but already half-taken in 11.

### R8. Trademark clearance still open while the name is embedded everywhere
"BandReady" is used in package IDs, appIds (`dev.bandready.app`, 13 §4), data-dir names (decisions.md) and pack IDs before the WIPO/USPTO/UKIPO search (00 Q1, 15 Q1) has run. A late rename touches installers, data-dir migration, and update channels.

## Suggested resolutions

1. **Freeze a single API contract doc** (new `18-api-contract.md` or a section in 01): adopt `/api/v1` everywhere (01 §9 wins), module routes namespaced under it (`/api/v1/speaking/sessions/{id}/offer`), and fold in an auth decision for media/WS (recommend short-lived signed URL query tokens minted per session). Update 02–10 route lists to match; delete 14 §3's `settings/providers` seam or add it to 03.
2. **Run the 11-reconciliation pass it already promises**: rewrite 08 §2/DDL, 09 §7, 10 §11 against 11's tables *or* amend 11 — specifically resolve dedup key (recommend keep `(profile_id, lemma, pos)`), add `fsrs_json`, unify status/review-type enums with 08's exercise list, replace `pron_word_scores` with 09's source-polymorphic `pron_scores` + `pron_drill_attempts`, and pick one plan model (10's blocks model is the richer spec; port it into 11) and one `band_estimates` semantics (append-only log + a computed cache view). Then cut Alembic 0001.
3. **Decide ingestion consent once**: adopt the suggested-inbox model (04/05/11) and change 08 §3.2 so module-sourced ingests land `status='suggested'` with no srs_cards row until acceptance; only `manual`/`seed`-opted entries schedule immediately.
4. **Align 16 with the module docs it builds**: fix the six contradictions in C13 (signing gate, paste, autosave, splash, restart cap, personas) by editing 16 to cite the module decisions; explicitly state the v1.0 content bar (recommend: 16's cadence numbers are v1.0, 15's table is re-labelled "content roadmap through v1.x").
5. **Pick the repo layout in 01 and mark it binding**: recommend 01 §7 (`app/` + `sidecar/`) with `src/features/<module>/`; fix 02 §1, 09 §4.0, 16 P0, 06/07 file maps.
6. **Reconcile the metrics contract**: extend 02 §4.2 to compute `mean_length_of_run_words` and `self_corrections` (or delete them from 04 §6.3's prompt) and unify pause-threshold naming.
7. **Single rounding function**: one `round_ielts()` (ties up, per 10 §6.3 official rule) used by 04, 05, and 10; if 05 keeps conservative rounding, document the divergence in both 04 and 05 and fix 14 §2.2's test table.
8. **Merge the two pack formats**: take 15 §6's manifest (disclaimer/ai_disclosure/checksums) + 11 §11's `data/` layout, `.brpack` extension, reverse-DNS ids, and import algorithm; add `vocab.jsonl` and `card_sets.jsonl` to 11's layout; replace 15's `content_items` reference with the typed-table import of 11 §11.3.
9. **One onboarding doc**: 10 owns the wizard; 12 §6.9 and 13 §7.1 reference it. Set placement to one duration (recommend ~30 min with skippable speaking, resolving 16 Q4) and fix 00 §7's <20-minute activation metric.
10. **Fix the small-but-public numbers now**: latency target (make 00 say <1.5 s p50 per 02's budget), 06 §9 "indigo"→"teal" (and amend decisions.md's UI-look line), delete 06 §7's "different model configured" sentence, sync 02 §5/09 §7 retention language to 11 §9's never-evict policy, and settle `app_prefs`→`settings` naming in 03.

## Open questions

1. Does the teal-primary divergence (12 §1) need an explicit amendment to decisions.md's locked "indigo" wording, or is "the design-system doc owns exact tokens" sufficient authority?
2. Which side of the multi-profile fork is v1: 11's `profiles` scoping or 10's single-learner row? (Must be answered before migration 0001; everything else in this review can be fixed doc-by-doc.)
3. Is the v1.0 content gate 16 §9.1's cadence or 15 §5's launch table? Owner unclear — recommend 16 decides and 15 records it.

## Round-2 resolution status (2026-07-25)

Verified against the current doc text (not the fixers' claims), per the R2-1..R2-24 rulings in `_context/decisions.md`. All 33 findings are resolved.

| ID | Status | How |
|---|---|---|
| C1 | resolved | All docs use `/api/v1`; 18-api-contract.md is the single route inventory (R2-1); remaining un-versioned strings are OpenVoiceUI/Ollama references only |
| C2 | resolved | `POST`/`PATCH /api/v1/speaking/sessions/{id}/offer` everywhere (01/02/04/14/16/18); `/voice/offer` explicitly superseded |
| C3 | resolved | 01 §7 marked BINDING (`app/` + `sidecar/bandready/`, `app/src/features/<module>/`); 02/09/16/06/07 divergent trees corrected |
| C4 | resolved | 11 §6 rewritten to 08's four tables (TEXT ULID PKs, `fsrs_json`, dedup `(profile_id, lemma, pos)`, status `suggested\|active\|suspended\|known`, six review types); 08 conforms |
| C5 | resolved | 08 §3.2 is now suggested-inbox: module ingest via `POST /api/v1/vocab/suggestions` → `status='suggested'`, no `srs_cards` row until accepted; manual/seed-opt-in schedule immediately |
| C6 | resolved | 11 §7 carries 09's source-polymorphic `pron_scores` (0–100, nullable session linkage) + `pron_drill_attempts`; `pron_word_scores` deleted |
| C7 | resolved | 02 §5 and 09 §7 repeal the 20-session pruning; user recordings never auto-evicted per 11 §9 (canonical) |
| C8 | resolved | 11 §8 carries 10's richer model (`placement_results`, `study_plans` w/ horizon/weights/supersession, block-structured `plan_sessions`, `adaptive_events`, `daily_activity`, `milestones`, `readiness_items`); `band_estimates` log + `current_band_estimates` view; flat `plan_items` deleted |
| C9 | resolved | ONE shared `round_ielts()` (ties round UP, 6.25→6.5) in 04/05/10/14; 05's conservative rounding repealed with explicit test cases in 14 §2.2 |
| C10 | resolved | 02 §4.2 computes the exact R2-10 set incl. `mean_length_of_run_words` and session-layer `p2_long_turn_secs`; `self_corrections`/`long_pauses_over_1s` deleted from 04's prompt |
| C11 | resolved | 04 §3.1 vocabulary canonical (P1_INTRO…P2_LONG_TURN/P2_ROUNDING…); 02 §6.3 and 12 §10 use it verbatim, earlier strings repealed |
| C12 | resolved | Merged `.brpack` format canonical in 11 §11 (15's manifest keys + `data/` JSONL + `vocab.jsonl`/`card_sets.jsonl` + reverse-DNS ids); 15 §6 is a pointer; `content_items` import repealed |
| C13 | resolved | 16 aligned to module docs: Windows unsigned v1 gate, paste allowed-but-recorded, autosave 10 s, no splash, 5-failure crash cap, one examiner + one coach persona |
| C14 | resolved | 16 §9.1's table declared THE v1.0 content gate; 15 §5 relabelled "content roadmap through v1.x"; second reviewer noted post-v1.0 in 15's effort plan |
| C15 | resolved | 10 owns the wizard end-to-end (~30-min placement, speaking sampler skippable, skips fall back to self-assessed); 12 §6.9 and 13 §7.1 reference it; 00's activation metric now "first speaking session within 20 min, placement deferrable" |
| C16 | resolved | 00 §7 quality metric now "<1.5 s p50 examiner response" matching 02's budget |
| C17 | resolved | Teal canonical (12 §1 confirmed by R2-16); decisions.md UI-look bullet amended; 06 §9 says "teal primary per R2-16" |
| C18 | resolved | 06 §7's "different model configured" sentence deleted; validation always uses the configured LLM |
| C19 | resolved | 11 §9 tree canonical and now includes `media/vocab/` + `media/pron/ref/`; 01 §8, 08 §5.3, 09 §5.2 corrected to it |
| C20 | resolved | 03 uses table name `settings`; API is `GET`/`PATCH /api/v1/settings` (deep-merge), `PUT` dropped; hidden mock presets registered only under `BANDREADY_ENABLE_MOCK=1` (14's seam, documented in 03 §7.1) |
| G1 | resolved | 18-api-contract.md exists: conventions (prefix, auth, errors) + full route inventory with owner-doc citations + explicit supersession list |
| G2 | resolved | 18 §2 specs HMAC-signed single-audience tickets: `POST /api/v1/tickets` (bearer) → 60 s ticket used as `?ticket=` on media URLs and WS upgrades; never logged |
| G3 | resolved | SQL VIEW `scored_attempts` (11 §8.3, UNION over the four attempt tables) feeds 10 §6's estimator; `current_band_estimates` view is the cache; speaking `mode` aligned to the enum |
| G4 | resolved | `profiles` + `profile_id` on all learner-data roots (11); single v1 profile resolved via `settings.active_profile_id` (10 §2, 18's `/api/v1/profile`); 10's `CHECK (id = 1)` repealed |
| G5 | resolved | ONE normalizer at `sidecar/bandready/scoring/answers.py` imported by reading AND listening (06/07/14/01 all agree); 07's variant-aware article rule wins |
| G6 | resolved | Exactly two mechanisms: 202 + `GET /api/v1/jobs/{id}` polling (03 setup, 05 eval, 06 generate, 09 analyze, 13 downloads) and the speaking session WS; RTVI phase events dropped (02 §6.3) |
| G7 | resolved | 08 §3.4 specs bundled WordNet (`wn` + English WordNet 2023, ~35 MB) at `GET /api/v1/dictionary/{word}`; 06's popover references it; LLM enrichment stays async-optional |
| G8 | resolved | 11 §3 adds `card_sets` table + `speaking_cards.card_set_id` FK; 04 §5 maps card JSON 1:1 and the Full-Mock picker runs on `card_sets.last_served_at` |
| G9 | resolved | Placement pack specced in 15 §5 (2 same-family reading pairs, 2 listening samplers, 4 writing tasks, 4 speaking minis) and listed as a 16 P4 v1.0 deliverable |
| G10 | resolved | 04 §6.4 post-processing recomputes `overall_band` server-side via shared `round_ielts()`; model's own value ignored (mirrors 05 §6.3) |
| G11 | resolved | 15 §3 specs the factoring: `tools/content/` in the main repo, validators in `sidecar/bandready/content/`, thin `bandready-content` PyPI re-export for community CI |
| G12 | resolved | 01 §7.1 documents the convention: four global Zustand stores (session/settings/progress/srs) + per-feature ephemeral stores; attempt-in-progress state is feature-local, never global |
| G13 | resolved | 02 §2.4 teardown finally-block flattens `transcript_json` into `speaking_turns` rows synchronously before writing `status='complete'` |
