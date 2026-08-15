# 18 — API contract (authoritative sidecar route inventory)

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read `sidecar/bandready/server/routes/` — 33 modules, several route families newer than this doc. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.
>
> **Do not trust this file for a route name.** It calls itself the authoritative inventory and predates the grammar, theory, coach, drills and mock route families. Two drifts are already recorded in IMPLEMENTATION-STATUS.md: `PUT /api/v1/settings` does not exist (it is `PATCH`), and `GET`/`PUT /api/v1/profile` from §4.13 do not exist at all. Read the route modules.

_Status: draft (2026-07-25)_

This doc is the single authoritative contract for the FastAPI sidecar's HTTP/WebSocket surface, created by ruling R2-1 (see `_context/decisions.md`, "Round-2 reconciliation rulings"). It fixes the conventions every route follows (prefix, auth, errors, pagination, ids), specs the two cross-cutting mechanisms — signed tickets for media/WebSocket auth (R2-2) and the one-shot job convention (R2-3) — and lists every route the module docs need, normalized to `/api/v1` and the round-2 rulings. Module docs (01–10, 13–14) reference this inventory instead of inventing routes; where their earlier route sketches disagreed with the rulings, this doc is the corrected form and wins. Owner-doc citations point at the doc that specs each route's behavior in depth; this doc owns method, path, auth, and wire shape.

## 1. Conventions

- **Base prefix**: every route lives under `/api/v1`. Unknown `/api/*` paths return 404 JSON, never HTML (01 §9). The single exception is `GET /health`, which sits outside the prefix and is the only unauthenticated route (01 §5).
- **Transport**: loopback only (`127.0.0.1`, random port chosen at sidecar launch), one uvicorn worker (`workers=1` contract). The renderer learns `{base_url, token}` from the Electron preload bridge (main process spawns the sidecar with the token in its env and hands it to the renderer over IPC — 01 §5).
- **Auth**: `Authorization: Bearer <token>` on every request, where `<token>` is the 256-bit per-launch random sidecar token from the preload bridge. Constant-time compare; failures are `401 {"detail": "unauthorized", "code": "unauthorized"}` with no further detail. The two contexts that cannot set headers — `<audio>`/`<video>` elements and browser `WebSocket` — use signed tickets instead (§2).
- **Bodies**: JSON, `snake_case` keys, UTF-8. Multipart only where a route explicitly says so (audio upload). Timestamps are UTC ISO-8601 strings with `Z` suffix.
- **Error envelope**: every non-2xx response body is `{"detail": "<human-readable message>", "code": "<machine code>"}`. Codes (extensible, kebab-free snake_case): `unauthorized`, `not_found`, `validation_error` (422; `detail` summarizes field errors), `conflict` (409, e.g. second concurrent speaking session), `provider_error` (upstream LLM/STT/TTS failure; `detail` includes the provider's message, never its key), `job_failed`, `ticket_invalid`, `ticket_expired`, `rate_limited`, `internal`.
- **Ids**: TEXT ULIDs (26-char Crockford base32) as defined by 11-data-model.md, with a short type prefix on wire-visible ids (e.g. `sr_01J8...` for speaking reports, `wa_01J8...` for writing attempts). The wire id is the DB primary key.
- **Pagination**: list endpoints that can grow unbounded (vocab entries, attempts, jobs) accept `?limit=` (default 50, max 200) and `?cursor=` (opaque, ULID-ordered) and return `{"items": [...], "next_cursor": "<opaque>" | null}`. Small fixed collections (presets, installed packs, readiness items) return plain arrays.
- **Partial updates**: `PATCH` = partial deep-merge of the JSON body into the resource (R2-19; this is what autosave and the settings page use). `PUT` is reserved for full-document replace and is used only where a doc explicitly kept it (`/profile`, `/readiness/{id}`).
- **Mock providers** (test seam, R2-19): provider presets carrying `"hidden": true` are registered only when `BANDREADY_ENABLE_MOCK=1`; tests select them via the normal `PATCH /api/v1/settings` route (03 documents; 14 relies on it — 14 §3's `PUT /api/v1/settings/providers` is superseded).

## 2. Ticket mechanism (media & WebSocket auth — R2-2)

Bearer tokens stay for all fetch/XHR. For URL-only contexts the renderer mints a short-lived signed ticket first:

```
POST /api/v1/tickets                     (bearer)
{ "audience": "media-read" | "session-events",
  "resource": "<exact request path | session_id>" }

201 → { "ticket": "<opaque string>", "expires_in": 60 }
```

- **Single-audience**: a ticket is valid for exactly one audience.
  - `media-read` — `resource` is the exact request path of one media file (e.g. `/api/v1/media/listening/ab34f0…9c.wav`). Valid only for `GET` of that path.
  - `session-events` — `resource` is a speaking `session_id`. Valid only for opening `WS /api/v1/speaking/sessions/{session_id}/events`.
- **Construction**: `payload = "{audience}|{resource}|{exp_unix}"` where `exp_unix = now + 60`;
  `sig = HMAC-SHA256(key = sidecar bearer token, msg = payload)`;
  `ticket = b64url(payload) + "." + b64url(sig)`. No DB row, no server-side state — verification recomputes the HMAC (constant-time compare), checks `exp_unix > now`, checks the audience matches the route class, and checks `resource` equals the requested path / session id.
- **Usage**: appended as a query param — `GET /api/v1/media/listening/ab34…wav?ticket=<ticket>`, `new WebSocket(base + "/api/v1/speaking/sessions/" + id + "/events?ticket=" + t)`.
- **TTL 60 s, reusable within TTL**: a media ticket may be presented on multiple Range requests for the same file (audio-element seeking); the renderer re-mints on 401 `ticket_expired`. WS tickets are checked only at upgrade time — an established socket outlives its ticket.
- **Never logged**: the access-log middleware redacts the `ticket` query param before writing any log line, and tickets never appear in error `detail` strings. (They are derived from the bearer token; leaking one in a log would leak a 60-second capability.)
- **Failures**: bad signature / audience / resource → `401 {"detail": "invalid ticket", "code": "ticket_invalid"}`; expired → `401 {"code": "ticket_expired"}`.

Example round-trip:

```
POST /api/v1/tickets
Authorization: Bearer 9f2c…e1
{ "audience": "media-read", "resource": "/api/v1/media/listening/ab34f09c.wav" }

201 { "ticket": "bWVkaWEtcmVhZHwvYXBpL3YxL21lZGlhL2xpc3RlbmluZy9hYjM0ZjA5Yy53YXZ8MTc4NDE4MjQ2NA.pXo3…Zg",
      "expires_in": 60 }

<audio src="http://127.0.0.1:52344/api/v1/media/listening/ab34f09c.wav?ticket=bWVkaWEt…Zg">
```

## 3. Job convention (one-shot long-running work — R2-3)

Exactly two progress transports exist in the app. Live speaking sessions use the per-session WebSocket (§5). **Everything else** long-running — writing evaluation, content generation, model downloads, guided provider setup, pronunciation analysis, pack import — uses the job convention (03 §6's SSE progress stream and 06 §7's "progress events over the existing WS channel" are repealed by R2-3):

1. The initiating `POST` returns `202 Accepted` with `{"job_id": "job_01J8..."}` (plus a `Location: /api/v1/jobs/{id}` header). Routes with a cache (listening render, model answers) return `200` with the finished result directly on a cache hit.
2. The renderer polls:

```
GET /api/v1/jobs/{id}   (bearer)
200 → { "id": "job_01J8...", "kind": "writing_eval",
        "state": "queued" | "running" | "done" | "error" | "cancelled",
        "progress_pct": 0-100 | null,
        "detail": "verifying checksum…" | null,     // human-readable substage
        "result": { … } | null,                     // present iff state == "done"; shape per kind
        "error": { "detail": "...", "code": "..." } | null,
        "created_at": "…", "updated_at": "…" }
```

3. `POST /api/v1/jobs/{id}/cancel` requests cancellation (best-effort; `409 conflict` if already terminal). `GET /api/v1/jobs?kind=&state=` lists recent jobs (paginated) — this is how the Models settings page shows in-flight downloads (supersedes 13 §7.3's `GET /api/v1/models/downloads` and per-download cancel route).

**Enumerated job kinds** (closed list; adding one is a doc change here):

| kind | started by | result shape | owner |
|---|---|---|---|
| `writing_eval` | `POST /writing/attempts/{id}/submit` | `{attempt_id}` (feedback then fetched via GET attempt) | 05 |
| `writing_prompt_generate` | `POST /writing/prompts/generate` | `{prompt_id}` | 05 |
| `writing_model_answer` | `POST /writing/prompts/{id}/model-answer` (cache miss) | `{prompt_id, band, text}` | 05 |
| `reading_generate` | `POST /reading/generate` | `{test_id | passage_id}` | 06 |
| `listening_generate` | `POST /listening/generate`, `POST /listening/tests/generate` | `{script_id | test_id}` | 07 |
| `listening_render` | `POST /listening/scripts/{id}/render` (cache miss) | `{audio_hash}` | 07 |
| `pron_analyze` | `POST /pron/sessions/{id}/analyze` | `{session_id}` (results via GET pron session) | 09 |
| `model_download` | `POST /models/download` | `{artifact_id, path}` | 13 |
| `provider_setup` | `POST /providers/setup/{engine_id}` | `{engine_id, state}` (detection re-run result) | 03 |
| `pack_import` | `POST /packs/import` | `{pack_id, version, counts}` | 11/15 |

Jobs are in-process (`asyncio` tasks + a small `jobs` table for restart visibility); `workers=1` means no cross-process queue is needed in v1.

## 4. Route inventory

Auth legend: `bearer` = Authorization header; `ticket` = §2 query-param ticket (bearer also accepted on media routes for XHR fetches); `none-loopback` = unauthenticated, loopback binding is the only guard.

### 4.1 System / health

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/health` *(no `/api/v1` prefix)* | none-loopback | — → `{status:"ok", version, db:"ok", migrations:"<head-rev>"}` | 01 §5 |

### 4.2 Settings (R2-19)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/settings` | bearer | — → full settings document, secrets masked (`enc:v1:…` → `"•••• (stored)"`), plus `first_run: bool` | 03 |
| PATCH | `/api/v1/settings` | bearer | partial document → merged+validated document (deep-merge; sidecar encrypts plaintext `api_key`s, writes atomically, hot-applies). `PUT` is dropped. | 03 |

### 4.3 Providers / detection / verify

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/providers/presets` | bearer | — → shipped `presets.json` array (hidden mock presets only when `BANDREADY_ENABLE_MOCK=1`) | 03 |
| GET | `/api/v1/providers/detect` | bearer | `?fresh=1` busts 30 s cache → detection report `{engines:[{id, state, download_mb?, models?}]}` | 03 §5 |
| POST | `/api/v1/providers/verify` | bearer | `{modality:"llm"|"stt"|"tts", config:{…}}` → `{ok, latency_ms, detail?}` | 03 §9 |
| POST | `/api/v1/providers/setup/{engine_id}` | bearer | `{step?}` → `202 {job_id}` (kind `provider_setup`; SSE repealed per R2-3) | 03 §6 |
| POST | `/api/v1/providers/tts-preview` | bearer | `{config:{…}}` → `200 audio/wav` bytes (fixed sentence; small + sync, played via blob URL) | 03 |

### 4.4 Tickets (§2)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/tickets` | bearer | `{audience:"media-read"|"session-events", resource}` → `201 {ticket, expires_in:60}` | 18 §2 |

### 4.5 Jobs (§3)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/jobs/{id}` | bearer | — → job object (§3) | 18 §3 |
| GET | `/api/v1/jobs` | bearer | `?kind=&state=&limit=&cursor=` → `{items:[job], next_cursor}` | 18 §3 |
| POST | `/api/v1/jobs/{id}/cancel` | bearer | — → `202` (best-effort) \| `409` if terminal | 18 §3 |

### 4.6 Dictionary (R2-20)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/dictionary/{word}` | bearer | — → `{word, lemma, found, senses:[{pos, definition, examples[], synonyms[]}]}` — bundled WordNet (`wn` package + English WordNet 2023, ~35 MB), fully offline, no LLM; serves the reading double-click popover (06 §5). LLM enrichment remains a separate async upgrade on accepted vocab entries (08). | 08 |

### 4.7 Speaking (04, 02)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/speaking/sessions` | bearer | `{mode:"full_mock"|"single_part"|"topic_drill"|"quick_chat", part?, card_set_id?|topic?}` → `201 {session_id, offer_url, events_url}`; `409 conflict` if a session is live (workers=1) | 04 §10 |
| GET | `/api/v1/speaking/sessions/{id}` | bearer | — → session record `{id, mode, state, started_at, report_id?}` (14 §4 polls this for the final record) | 04 |
| POST | `/api/v1/speaking/sessions/{id}/offer` | bearer | `{sdp, type, pc_id?, restart_pc?}` → SDP answer (R2-1; supersedes 01/14's `/voice/offer`) | 02 §2.4 |
| PATCH | `/api/v1/speaking/sessions/{id}/offer` | bearer | trickle-ICE candidates → `200` — same URL as POST (Pipecat gotcha #4); accepts both snake_case and camelCase candidate keys | 02 §2.4, 14 §3 |
| WS | `/api/v1/speaking/sessions/{id}/events` | ticket (`session-events`) | server→client event stream, catalog in §5 | 04 §3.3 |
| POST | `/api/v1/speaking/sessions/{id}/hangup` | bearer | — → `200` (→ ABORTED or WRAP_UP per state machine) | 04 §10 |
| POST | `/api/v1/speaking/sessions/{id}/score` | bearer | — → `200 {report_id}` (idempotent; re-runnable after ERROR). Server recomputes `overall_band` from criterion bands with shared `round_ielts()` — model's own overall ignored (R2-4). | 04 §6 |
| GET | `/api/v1/speaking/reports/{id}` | bearer | — → full report (criteria bands, feedback, fluency metrics per R2-10, pron signals) | 04 §7, 11 §5 |
| GET | `/api/v1/speaking/cards` | bearer | `?part=&tag=` → card list (drill topic picker; card_set columns per R2-21) | 04 §5 |

### 4.8 Writing (05)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/writing/prompts` | bearer | `?task_type=&genre=&difficulty=&q=&limit=&cursor=` → `{items, next_cursor}` | 05 §11 |
| POST | `/api/v1/writing/prompts/generate` | bearer | `{task_type, genre?, topic?}` → `202 {job_id}` (kind `writing_prompt_generate`) | 05 §11 |
| POST | `/api/v1/writing/attempts` | bearer | `{prompt_id, mode:"practice"|"exam"}` → `201 {attempt_id}` | 05 §11 |
| PATCH | `/api/v1/writing/attempts/{id}` | bearer | `{essay_text?, outline_text?, seconds_elapsed?, paste_events?}` → `200` (autosave every 10 s; paste allowed-but-recorded per R2-12) | 05 §3 |
| POST | `/api/v1/writing/attempts/{id}/submit` | bearer | — → `202 {job_id}` (kind `writing_eval`; pre-checks may return `422`). Overall band recomputed server-side with `round_ielts()` — ties round UP; 05's conservative rounding repealed (R2-4). | 05 §6 |
| GET | `/api/v1/writing/attempts/{id}` | bearer | — → attempt + feedback + annotations | 05 §11 |
| GET | `/api/v1/writing/attempts` | bearer | `?prompt_id=&limit=&cursor=` → lineage/history | 05 §11 |
| POST | `/api/v1/writing/attempts/{id}/rewrite` | bearer | `{prefill?: bool}` → `201 {attempt_id}` (child draft, `parent_attempt_id` set) | 05 §8 |
| POST | `/api/v1/writing/prompts/{id}/model-answer` | bearer | `{band}` → `200 {text}` on cache hit \| `202 {job_id}` (kind `writing_model_answer`) | 05 §9 |
| GET | `/api/v1/writing/templates` | bearer | `?category=` → template array | 05 §9 |

### 4.9 Reading (06)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/reading/tests` | bearer | `?format=&difficulty=&source=&limit=&cursor=` → metadata list | 06 §9 |
| GET | `/api/v1/reading/tests/{id}` | bearer | `?mode=exam` strips answers → full test document | 06 §9 |
| POST | `/api/v1/reading/attempts` | bearer | `{test_id, mode, exam_conditions}` → `201 {attempt_id, resume_state}` | 06 §9 |
| PATCH | `/api/v1/reading/attempts/{id}` | bearer | `{answers?, highlights?, notes?, timer_s?, flags?}` → `200` (autosave) | 06 §9 |
| POST | `/api/v1/reading/attempts/{id}/submit` | bearer | — → `200` score record (deterministic; shared normalizer at `sidecar/bandready/scoring/answers.py`, variant-aware article rule per R2-9) | 06 §4 |
| GET | `/api/v1/reading/attempts/{id}/review` | bearer | — → score + key + explanations + evidence quotes | 06 §9 |
| POST | `/api/v1/reading/attempts/{id}/why-wrong` | bearer | `{number}` → `200` LLM analysis (cached; always the one configured LLM — R2-17) | 06 §7 |
| POST | `/api/v1/reading/generate` | bearer | `{format, topic?, band_target, scope:"test"|"passage"}` → `202 {job_id}` (kind `reading_generate`) | 06 §7 |
| GET | `/api/v1/reading/drills/{type}` | bearer | `?size=` → drill question set | 06 §8 |
| POST | `/api/v1/reading/drills/results` | bearer | drill outcome → `201` | 06 §8 |

### 4.10 Listening (07)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/listening/generate` | bearer | `{part?, topic?, target_band?, accent_set?}` → `202 {job_id}` (kind `listening_generate`; validation failure surfaces as job `error` with `validation_error`) | 07 §11 |
| POST | `/api/v1/listening/tests/generate` | bearer | `{target_band?}` → `202 {job_id}` (4 scripts) | 07 §11 |
| POST | `/api/v1/listening/scripts/{id}/render` | bearer | `{accent_set?}` → `200 {audio_hash}` on cache hit \| `202 {job_id}` (kind `listening_render`) | 07 §11 |
| GET | `/api/v1/listening/tests/{id}` | bearer | `?with_answers=1` → test + scripts (answers stripped by default) | 07 §11 |
| POST | `/api/v1/listening/attempts` | bearer | `{test_id|script_id, mode, answers}` → `200` scored attempt (deterministic; same shared normalizer as reading) | 07 §11 |

### 4.11 Vocabulary & SRS (08, R2-5)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/vocab/entries` | bearer | manual add `{lemma|term, pos?, sentence_context?, …}` → `201 {id, merged}` — manual adds schedule an `srs_cards` row immediately (R2-5); dedup on `(profile_id, lemma, pos)` | 08 §3 |
| POST | `/api/v1/vocab/suggestions` | bearer | batch module-sourced ingest `{items:[{term, sentence_context, source:{kind, item_id}}]}` → `201 {ids}` — lands `status='suggested'`, **no** `srs_cards` row (suggested-inbox model; 04 §8 / 05 §10 win) | 04 §8, 08 |
| GET | `/api/v1/vocab/suggestions` | bearer | `?limit=&cursor=` → inbox `{items:[entry], next_cursor}` | 08 |
| POST | `/api/v1/vocab/suggestions/{id}/accept` | bearer | — → `200 {entry}` (`status→'active'`, `srs_cards` row created `due=now`) | 08 |
| POST | `/api/v1/vocab/suggestions/{id}/dismiss` | bearer | — → `204` (entry deleted) | 08 |
| GET | `/api/v1/vocab/entries` | bearer | `?query=&topic=&status=&pos=&sort=&limit=&cursor=` → FTS-backed browse (status enum `suggested|active|suspended|known`) | 08 §9 |
| PATCH | `/api/v1/vocab/entries/{id}` | bearer | field edits, e.g. `{"status":"known"}` → `200` | 08 §9 |
| DELETE | `/api/v1/vocab/entries/{id}` | bearer | — → `204` (entry + card + logs) | 08 §9 |
| POST | `/api/v1/vocab/lookup` | bearer | `{word, sentence}` → enrichment-shaped preview **without** saving (LLM; the offline path is §4.6's dictionary) | 08 §9 |
| POST | `/api/v1/vocab/check-sentence` | bearer | `{entry_id, sentence}` → `{acceptable, issues, better_version}` | 08 §5.2.3 |
| GET | `/api/v1/vocab/stats` | bearer | — → stats payload | 08 §8 |
| GET | `/api/v1/vocab/packs` | bearer | — → seed-deck list | 08 §6.2 |
| POST | `/api/v1/vocab/packs/{pack_id}/import` | bearer | — → `200` — explicit seed-deck opt-in; schedules immediately (R2-5) | 08 §6.2 |
| GET | `/api/v1/srs/queue` | bearer | `?limit=20` → next session chunk, each item with chosen `exercise_type` (08's six types) + rendered payload | 08 §7 |
| POST | `/api/v1/srs/review` | bearer | `{card_id, rating, exercise_type, elapsed_ms}` → updated card + next-interval preview | 08 §4.3 |

### 4.12 Pronunciation (09)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/pron/sessions/{session_id}/analyze` | bearer | — → `202 {job_id}` (kind `pron_analyze`, over all turn WAVs) | 09 §4.6 |
| GET | `/api/v1/pron/sessions/{session_id}` | bearer | — → `{status, turns:[TurnPronResult], aggregates}` (scores 0–100 int per R2-6) | 09 §4.6 |
| POST | `/api/v1/pron/read-aloud` | bearer | multipart `{passage_id|text, wav}` → `200 TurnPronResult` (sync) | 09 §4.6 |
| GET | `/api/v1/pron/drills` | bearer | `?type=minimal_pair_ab|word_stress_tap&contrast=` → drill items (authored content) | 09 §5.3–5.4 |
| POST | `/api/v1/pron/drills/results` | bearer | `{drill_type, contrast, correct, …}` → `201` (`pron_drill_attempts` row) | 09 §7 |

### 4.13 Progress / plan / placement (10)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/profile` | bearer | — → active profile (resolved via `settings.active_profile_id`; single profile in v1 UI per R2-5) | 10 §2 |
| PUT | `/api/v1/profile` | bearer | full profile doc → `200` | 10 §2 |
| POST | `/api/v1/placement/start` | bearer | `{sections?}` → placement session (speaking sampler skippable; skipped section → self-assessed fallback, R2-14) | 10 §3 |
| POST | `/api/v1/placement/submit` | bearer | section answers → `{placement_id, per_skill_bands}` | 10 §3 |
| GET | `/api/v1/plan` | bearer | — → current study plan (blocks/phases model per R2-7) | 10 §4 |
| POST | `/api/v1/plan/regenerate` | bearer | — → new plan (previous `superseded_by` set) | 10 §5 |
| POST | `/api/v1/plan/sessions/{id}/start` | bearer | — → `200` | 10 §5 |
| POST | `/api/v1/plan/sessions/{id}/complete` | bearer | — → `200` | 10 §5 |
| POST | `/api/v1/plan/sessions/{id}/skip` | bearer | — → `200` | 10 §5 |
| GET | `/api/v1/progress/summary` | bearer | — → tiles + callouts + streak (band estimates read from `current_band_estimates` view, R2-7) | 10 §7 |
| GET | `/api/v1/progress/trajectory` | bearer | `?skill=` → time series | 10 §7 |
| GET | `/api/v1/progress/criteria` | bearer | `?skill=` → per-criterion breakdown | 10 §7 |
| GET | `/api/v1/progress/heatmap` | bearer | `?weeks=16` → daily activity grid | 10 §7 |
| GET | `/api/v1/readiness` | bearer | — → readiness checklist | 10 §9 |
| PUT | `/api/v1/readiness/{id}` | bearer | `{checked}` → `200` | 10 §9 |

### 4.14 Content packs (11 §11, 15 — merged format per R2-8)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/packs` | bearer | — → installed packs `[{pack_id, version, publisher, counts, imported_at}]` | 11 §11 |
| POST | `/api/v1/packs/import` | bearer | `{path}` (local `.brpack`) → `202 {job_id}` (kind `pack_import`; checksum verify + typed-table upsert per 11 §11.3) | 11 §11 |
| POST | `/api/v1/packs/{pack_id}/repair` | bearer | — → `202 {job_id}` (re-verify rows/media, rewrite divergences) | 11 §11 |
| DELETE | `/api/v1/packs/{pack_id}` | bearer | — → `204` (learner data referencing pack content is kept) | 11 §11 |

### 4.15 Models (13 §7.3)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| POST | `/api/v1/models/download` | bearer | `{artifact_id}` → `202 {job_id}` (kind `model_download`; progress/cancel via §4.5 jobs routes) | 13 §7.3 |
| POST | `/api/v1/models/import` | bearer | `{artifact_id, source_path}` → `200` (offline USB import, checksum-verified) | 13 §7.3 |
| GET | `/api/v1/models/installed` | bearer | — → `[{artifact_id, path, verified_at}]` | 13 §7.3 |

### 4.16 Media (streams consumed by `<audio>` — ticket auth per §2; layout mirrors 11 §9's data dir per R2-18)

| Method | Path | Auth | Request → Response | Owner |
|---|---|---|---|---|
| GET | `/api/v1/media/listening/{hash}.wav` | ticket | — → `audio/wav`, Range-capable (practice-mode seek) | 07 §11 |
| GET | `/api/v1/media/listening/{hash}.timing.json` | ticket (bearer OK) | — → word-timing JSON | 07 §11 |
| GET | `/api/v1/media/speaking/{session_id}/{turn_file}.wav` | ticket | — → per-turn candidate audio (report replay; never auto-evicted per R2-6) | 04 §7, 11 §9 |
| GET | `/api/v1/media/vocab/{entry_id}.wav` | ticket | — → headword audio; generated via Kokoro on miss then cached | 08 §5.3 |
| GET | `/api/v1/media/pron/ref` | ticket | `?text=` → Kokoro-rendered reference WAV (cached; replaces 09's `/api/pron/reference-audio`) | 09 §5.2 |

## 5. Speaking session WebSocket event catalog

Channel: `WS /api/v1/speaking/sessions/{id}/events?ticket=…` (audience `session-events`). Server→client JSON messages, one object per frame; the client never advances state — it mirrors (R2-3: this channel is the only live-session transport; RTVI messages remain solely Pipecat's own transport events on the WebRTC channel).

**Canonical phase names** (04 §3.1's state machine is the canonical vocabulary per R2-11; these exact strings are the wire values — 02 §6.3's `part2-monologue` and 12 §10's `part2-talk` are repealed):

```
IDLE, CONNECTING,
P1_INTRO, P1_QA,
P2_INTRO, P2_PREP, P2_LONG_TURN, P2_ROUNDING,
P3_DISCUSS,
WRAP_UP, SCORING, FEEDBACK,
RECONNECTING, ABORTED, ERROR,
COACH_QA, COACH_FEEDBACK,        -- Topic Drill mode
CHAT                             -- Quick Chat mode
```

Event types:

```json
{ "type": "state",    "state": "P2_PREP", "part": 2, "deadline_utc": "2026-07-25T10:31:04Z" }
{ "type": "cue_card", "card": { "topic": "…", "bullets": ["…", "…"] } }
{ "type": "timer",    "id": "p2_prep", "remaining_ms": 42000 }
{ "type": "scoring",  "status": "running" }
{ "type": "report",   "report_id": "sr_01J8…" }
{ "type": "error",    "detail": "evaluation failed", "code": "provider_error", "recoverable": true }
```

- `state` fires on every transition (including `RECONNECTING`/`ABORTED`/`ERROR`). `deadline_utc` present only for timer-bound states; the renderer displays countdowns from `timer` events and never enforces timing itself (all timers are server-side asyncio tasks — 04 §3.2).
- `timer` ids: `p1_budget`, `p2_prep`, `p2_long_turn_min`, `p2_long_turn_max`, `p3_budget`, `silence`, `reconnect_grace` (04 §3.2's table).
- `cue_card` fires on entering `P2_INTRO`.
- `scoring.status` ∈ `running|retrying`; terminal success is the `report` event; terminal failure is `error` with `recoverable: true` (client may then call `POST …/score` to retry — the route is idempotent).
- Reconnect: if the socket drops, the client mints a fresh `session-events` ticket and reopens; the server replays the current `state` (and `cue_card` if in Part 2) on attach. During transport `RECONNECTING` the 15 s grace timer runs server-side.
- Client→server messages: none in v1. Control actions (hangup, score) are HTTP POSTs.

## 6. Superseded route sketches (for editors of docs 01–14)

- All unversioned `/api/...` paths in 02 §2.4, 03 §11, 04 §10, 05 §11, 06 §9, 07 §11, 08 §9, 09 §4.6, 10 §11 → the `/api/v1` forms above (C1).
- `POST /api/v1/voice/offer` (01 §6, 14 §3) and `POST /api/v1/sessions` (14 §3) → `/api/v1/speaking/sessions[…]/offer` (C2, R2-1).
- `PUT /api/settings` (03) and `PUT /api/v1/settings/providers` (14 §3) → `GET`/`PATCH /api/v1/settings` (R2-19).
- SSE progress on provider setup (03 §6) and "progress events over the existing WS channel" for reading generation (06 §7) → the §3 job convention (R2-3).
- `GET /api/v1/models/downloads` + per-download cancel (13 §7.3) → `GET /api/v1/jobs?kind=model_download` + `POST /api/v1/jobs/{id}/cancel` (R2-3).
- `POST /api/vocab/entries` as the endpoint modules call for ingest (08 §3.2) → `POST /api/v1/vocab/suggestions` (R2-5); `/api/v1/vocab/entries` remains for manual adds only.
- `GET /api/vocab/entries/{id}/audio` (08 §9) → `GET /api/v1/media/vocab/{entry_id}.wav`; `GET /api/pron/reference-audio` (09) → `GET /api/v1/media/pron/ref` (media routes unified under ticket auth, R2-2/R2-18).

## Open questions

1. **WS ticket rotation for long sessions**: a `session-events` socket outlives its 60 s ticket by design (checked at upgrade only). Is that acceptable for a loopback-only, per-launch-token app, or should the server ping-close sockets after N minutes and force a re-ticketed reconnect?
2. **Job retention**: how long do terminal job rows stay queryable (`GET /api/v1/jobs`)? Default proposal: 7 days or last 200 rows, whichever is smaller — needs a decision before the `jobs` table lands in Alembic 0001.
3. **`why-wrong` latency**: `POST /reading/attempts/{id}/why-wrong` is specced sync (single-question LLM call). If local-model latency in practice exceeds ~10 s, should it move to the job convention? (Would be the only per-question job in the app.)
4. **Media path shape for speaking turns**: `{turn_file}.wav` assumes the turn manifest names files; confirm against 02 §2.4's teardown manifest (R2-24) once 02 is edited, and lock the exact filename scheme here.
5. **`PUT /api/v1/profile` vs PATCH**: kept as `PUT` to match 10 §11; if 10's rewrite (R2-7) adopts partial edits, switch this row to `PATCH` for consistency with settings.
