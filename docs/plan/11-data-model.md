# 11 — Data model

Status: draft v2 (2026-07-25)

This document is the **canonical schema** for BandReady's single SQLite database (WAL,
`foreign_keys=ON`, SQLAlchemy 2.0 + Alembic — see 01-architecture.md). This v2 is the round-2
reconciliation pass mandated by `_context/decisions.md` (rulings R2-4..R2-8, R2-18, R2-21,
R2-24): the vocabulary domain now carries 08-vocabulary-srs.md's four-table shape, pronunciation
carries 09-pronunciation-assessment.md's source-polymorphic `pron_scores`, curriculum/progress
carries 10-curriculum-progress.md's richer plan/estimate model plus the `scored_attempts` and
`current_band_estimates` SQL views, and the content-pack format merges 15-content-authoring-
licensing.md §6's manifest with this doc's `data/` JSONL layout. Where this doc and a module doc
disagree, **this doc wins and the module doc must be edited to match** (08/09/10/15 conform on
their next edit). It also fixes the ID and timestamp conventions, the JSON-column policy, the
on-disk media layout and eviction policy, the Alembic migration strategy for SQLite, the indexes
that serve the app's hot queries, and retention/deletion rules including full data export.

## 1. Conventions (apply to every table)

- **IDs**: `TEXT` ULIDs with a short type prefix (`ss_`, `wr_`, `rd_`, `ls_`, `st_`, `ve_`,
  `sc_`, `pe_`, …), generated in Python (`ulid-py`). Sortable by creation time (lexicographic
  order = creation order — the `current_band_estimates` view relies on this), safe to merge
  across exports. Exception: **content-bank rows shipped in packs use stable authored slugs**
  (e.g. `card_p2_journey_001`) so re-imports are idempotent. This supersedes the
  `INTEGER PRIMARY KEY` sketches in 07-listening-module.md §11, 08 §2, 09 §7, and 10 §11.
- **Timestamps**: `TEXT` ISO-8601 UTC with milliseconds; column default
  `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`. Named `*_at`. Durations are `INTEGER` `*_ms` or `*_s`.
- **Booleans**: `INTEGER NOT NULL DEFAULT 0 CHECK (col IN (0,1))`.
- **Bands**: `REAL CHECK (col BETWEEN 0 AND 9)`; app writes only 0.5 steps.
- **JSON columns**: `TEXT`, named `*_json`, validated by Pydantic before write. Policy in §10.
  (08's unsuffixed JSON columns — `example_sentences`, `collocations`, `topic_tags` — gain the
  `_json` suffix here; 08 conforms.)
- **FKs**: `ON DELETE CASCADE` for parent→child ownership; `ON DELETE RESTRICT` (SQLite default:
  plain FK) from attempts to content, so content referenced by history can never be hard-deleted
  (content is *retired* instead — §11.4).
- **SQLite version floor**: ≥ 3.38 (json_object in views, `->>` operator). Python 3.12's bundled
  SQLite satisfies this; the sidecar asserts it at boot.
- All DDL below is the Alembic-generated end state; pragmas per connection:
  `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL` (default,
  flagged — WAL makes NORMAL durable enough for a desktop app).

Entity overview:

```
profiles ─┬─ practice_sessions (envelope, shared PK with module rows)
          │     ├─ speaking_sessions ── speaking_turns
          │     ├─ writing_submissions ── writing_evaluations ─┐
          │     ├─ reading_attempts ── reading_answers          ├─ llm_evaluations
          │     ├─ listening_attempts ── listening_answers      │   (polymorphic subject)
          │     └─ drill_results                               ─┘
          ├─ vocab_entries ─┬─ vocab_sources
          │                 └─ srs_cards ── srs_review_logs
          ├─ pron_scores · pron_drill_attempts
          ├─ placement_results
          ├─ study_plans ── plan_sessions
          ├─ band_estimates ──▶ VIEW current_band_estimates
          ├─ adaptive_events · daily_activity · milestones · readiness_items
          └─ activity_log
VIEW scored_attempts (UNION over the four module attempt tables) ──▶ estimator (10 §6)
content_packs → topics / card_sets / speaking_cards / writing_prompts
                / reading_passages(+questions) / reading_tests
                / listening_scripts(+questions) / listening_tests / vocab_pack_entries
media_files (hash-addressed cache index)
```

## 2. Core

```sql
-- Managed by Alembic itself; listed for completeness. We do NOT create a separate
-- schema_migrations table — alembic_version IS the migration ledger.
CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);

CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,                 -- 'default' for the auto-created first profile
  name          TEXT NOT NULL,
  exam_format   TEXT NOT NULL DEFAULT 'academic'
                CHECK (exam_format IN ('academic','general_training')),  -- R2-7: 'general' repealed
  target_band   REAL CHECK (target_band BETWEEN 4 AND 9),
  exam_date     TEXT,                             -- ISO date, NULL = not booked
  -- onboarding-wizard fields absorbed from 10 §2's learner_profile (R2-5 repeals CHECK (id = 1)):
  self_level    TEXT CHECK (self_level IN ('beginner','intermediate','upper','advanced')),
  daily_minutes INTEGER NOT NULL DEFAULT 60 CHECK (daily_minutes IN (30,60,90)),
  study_days_json TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri","sat"]',
  onboarded_at  TEXT,
  placement_completed_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- App + module settings as a KV of JSON values. 03-providers-and-settings.md owns the keys
-- (provider config lives in the lockfile on disk, NOT here; theme tokens, module tunables,
-- media budget, active_profile_id, etc. live here).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                       -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

**Profiles ruling (R2-5, canonical):** one database, multi-row `profiles`, `profile_id` on every
learner-data **root** table (`practice_sessions`, `vocab_entries`, `pron_scores`,
`pron_drill_attempts`, `placement_results`, `study_plans`, `band_estimates`, `adaptive_events`,
`daily_activity`, `milestones`, `readiness_items`, `activity_log`); children inherit via their
parent. 10 §11's single-row `learner_profile CHECK (id = 1)` is **repealed**. The v1 UI exposes
exactly one profile, resolved via `settings.active_profile_id` — no profile switcher until v1.x.
A per-profile-DB design was rejected because the content bank and media cache are shared and
cross-profile FKs would be impossible.

## 3. Content bank

Shared columns on every content table (the "pack provenance" block referenced below as
`/* pack cols */`):

```sql
  source        TEXT NOT NULL DEFAULT 'pack' CHECK (source IN ('pack','generated','user')),
  pack_id       TEXT,            -- NULL unless source='pack'
  pack_version  TEXT,            -- pack version that installed/last-updated this row
  license       TEXT,            -- SPDX id; NULL inherits content_packs.license
  retired       INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0,1)),  -- hidden from pickers, kept for history (§11.4)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
```

```sql
CREATE TABLE content_packs (
  pack_id       TEXT NOT NULL,                 -- reverse-DNS id, e.g. 'org.bandready.core' (R2-8)
  version       TEXT NOT NULL,                 -- semver
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  publisher     TEXT NOT NULL DEFAULT '',      -- manifest 'publisher' (was 'author')
  homepage      TEXT,                          -- manifest 'homepage' (was 'source_url')
  license       TEXT NOT NULL,                 -- SPDX, e.g. 'CC0-1.0'
  ai_disclosure TEXT NOT NULL DEFAULT 'human'
                CHECK (ai_disclosure IN ('human','ai_assisted','ai_generated')),  -- 15 §8
  manifest_json TEXT NOT NULL,                 -- full manifest as imported (§11.2)
  enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  installed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (pack_id, version)
);

-- Shared topic taxonomy; content rows point at it for curriculum coverage tracking
-- (10-curriculum-progress.md). Free-form tags stay in per-row tags_json.
CREATE TABLE topics (
  id        TEXT PRIMARY KEY,                  -- slug, e.g. 'environment'
  label     TEXT NOT NULL,                     -- 'Environment & climate'
  category  TEXT NOT NULL DEFAULT 'general'    -- coarse grouping: everyday|academic|abstract|general
);

-- R2-21: card_sets is a real table so the Full-Mock least-recently-served-SET picker (04 §2)
-- is implementable. One set groups the P1/P2/P3 cards of one mock topic; 04 §5's card_set JSON
-- maps 1:1 onto these columns, anything extra goes in payload_json.
CREATE TABLE card_sets (
  id             TEXT PRIMARY KEY,             -- authored slug, e.g. 'set_journeys_01'
  title          TEXT NOT NULL,
  topic_id       TEXT REFERENCES topics(id),
  parts_json     TEXT NOT NULL DEFAULT '[1,2,3]',  -- part coverage, e.g. [1,2,3]
  payload_json   TEXT,                         -- remainder of 04 §5's card_set document
  last_served_at TEXT,                         -- least-recently-served SET sampling (04 §2/§9)
  /* pack cols */
);
CREATE INDEX ix_card_sets_pick ON card_sets(retired, last_served_at);

-- 04-speaking-module.md §5 owns the payload JSON schema (speaking_card.schema.json).
CREATE TABLE speaking_cards (
  id             TEXT PRIMARY KEY,             -- authored slug or ULID 'sc_…'
  part           INTEGER NOT NULL CHECK (part BETWEEN 1 AND 3),
  card_set_id    TEXT REFERENCES card_sets(id),  -- R2-21: real FK (nullable — standalone cards allowed)
  topic_id       TEXT REFERENCES topics(id),
  title          TEXT NOT NULL,                -- display title / P1 frame name
  difficulty     TEXT NOT NULL DEFAULT 'core' CHECK (difficulty IN ('core','stretch')),
  tags_json      TEXT NOT NULL DEFAULT '[]',
  payload_json   TEXT NOT NULL,                -- full card per 04 §5 schema
  last_served_at TEXT,                         -- least-recently-served CARD sampling (04 §9)
  /* pack cols */
);
CREATE INDEX ix_speaking_cards_pick ON speaking_cards(part, difficulty, retired, last_served_at);
CREATE INDEX ix_speaking_cards_set  ON speaking_cards(card_set_id);

-- Adopted verbatim from 05-writing-module.md §2.1 + pack cols; chart_spec JSON schema is
-- 05 §2.2 ('bandready:chart-spec:v1').
CREATE TABLE writing_prompts (
  id             TEXT PRIMARY KEY,
  task_type      TEXT NOT NULL CHECK (task_type IN ('ac_task1','gt_task1','task2')),
  genre          TEXT NOT NULL,                -- chart kind | letter register | essay type
  topic_id       TEXT REFERENCES topics(id),
  topic_tags     TEXT NOT NULL DEFAULT '[]',   -- JSON array
  difficulty     INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
  prompt_text    TEXT NOT NULL,
  chart_spec     TEXT,                         -- JSON (05 §2.2); NULL unless ac_task1
  letter_bullets TEXT,                         -- JSON array of 3 bullets; gt_task1 only
  /* pack cols */
);
CREATE INDEX ix_writing_prompts_pick ON writing_prompts(task_type, genre, difficulty, retired);

-- RECONCILIATION with 06-reading-module.md: 06 sketched a generic content_items table with
-- kind='reading_test' JSON bodies. Canonical model instead uses typed tables below (and 15 §6's
-- import step is corrected accordingly — content_items does not exist; see §11.3).
-- passage_json remains the single rendering source (full §3 document from 06: sections,
-- paragraphs, question groups with layout); reading_questions is a FLATTENED projection
-- (one row per numbered question) generated at import/generation time, because per-question
-- rows are aggregated (per-type accuracy → weakness detector) and answered against.
CREATE TABLE reading_passages (
  id            TEXT PRIMARY KEY,
  format        TEXT NOT NULL CHECK (format IN ('academic','general_training')),
  title         TEXT NOT NULL,
  topic_id      TEXT REFERENCES topics(id),
  word_count    INTEGER NOT NULL,
  band_target   REAL CHECK (band_target BETWEEN 0 AND 9),
  passage_json  TEXT NOT NULL,                 -- 06 §3 passage document incl. question groups
  validation_report_json TEXT,                 -- blind-validation report for generated content (06 §Stage 3)
  /* pack cols */
);
CREATE INDEX ix_reading_passages_pick ON reading_passages(format, band_target, retired);

CREATE TABLE reading_questions (
  id               TEXT PRIMARY KEY,           -- 'rq_…' or '<passage_id>#<number>' for pack rows
  passage_id       TEXT NOT NULL REFERENCES reading_passages(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL,           -- 1..14 within the passage
  group_index      INTEGER NOT NULL,           -- which question group in passage_json
  qtype            TEXT NOT NULL,              -- one of the 14 type slugs (06 §2)
  word_limit       INTEGER,                    -- text-answer types only
  answers_json     TEXT NOT NULL,              -- pre-expanded exact variant set (06 §4.1 import-time expansion)
  anchor_paragraphs_json TEXT,                 -- for drills + review
  evidence_quote   TEXT,
  explanation      TEXT,
  trap_note        TEXT,
  UNIQUE (passage_id, number)
);
CREATE INDEX ix_reading_questions_type ON reading_questions(qtype);

CREATE TABLE reading_tests (
  id         TEXT PRIMARY KEY,
  format     TEXT NOT NULL CHECK (format IN ('academic','general_training')),
  title      TEXT NOT NULL,
  p1_id      TEXT NOT NULL REFERENCES reading_passages(id),
  p2_id      TEXT NOT NULL REFERENCES reading_passages(id),
  p3_id      TEXT NOT NULL REFERENCES reading_passages(id),
  /* pack cols */
);

-- Per 07-listening-module.md §11, with TEXT ids, pack cols, and a flattened question table
-- (same rationale as reading_questions; script_json keeps the full §2 document for rendering
-- and audio synthesis).
CREATE TABLE listening_scripts (
  id           TEXT PRIMARY KEY,
  part         INTEGER NOT NULL CHECK (part BETWEEN 1 AND 4),
  title        TEXT NOT NULL,
  topic_id     TEXT REFERENCES topics(id),
  accent_set   TEXT NOT NULL DEFAULT 'uk' CHECK (accent_set IN ('uk','us','au')),
  target_band  REAL NOT NULL CHECK (target_band BETWEEN 0 AND 9),
  script_json  TEXT NOT NULL,                  -- 07 §2 schema (lines, speakers, cue indexes)
  audio_hash   TEXT REFERENCES media_files(hash), -- NULL until first render (07 §3)
  /* pack cols */
);
CREATE INDEX ix_listening_scripts_pick ON listening_scripts(part, target_band, retired);

CREATE TABLE listening_questions (
  id            TEXT PRIMARY KEY,
  script_id     TEXT NOT NULL REFERENCES listening_scripts(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,              -- 1..10 within the part
  qtype         TEXT NOT NULL,                 -- 07 §4 type slugs
  word_limit    INTEGER,
  answers_json  TEXT NOT NULL,                 -- pre-expanded variant set
  cue_line_index INTEGER,                      -- script line where the answer is spoken (review sync)
  explanation   TEXT,
  UNIQUE (script_id, number)
);
CREATE INDEX ix_listening_questions_type ON listening_questions(qtype);

CREATE TABLE listening_tests (
  id     TEXT PRIMARY KEY,
  title  TEXT NOT NULL,
  p1_id  TEXT NOT NULL REFERENCES listening_scripts(id),
  p2_id  TEXT NOT NULL REFERENCES listening_scripts(id),
  p3_id  TEXT NOT NULL REFERENCES listening_scripts(id),
  p4_id  TEXT NOT NULL REFERENCES listening_scripts(id),
  /* pack cols */
);

-- R2-8: content-side home for pack vocab (data/vocab.jsonl). Rows here are SHIPPED CONTENT,
-- not learner data — opting a deck in copies entries into the active profile's vocab_entries
-- (+ srs_cards, scheduled immediately per the R2-5 seed-opt-in rule) through 08 §3's dedup/merge.
CREATE TABLE vocab_pack_entries (
  id          TEXT PRIMARY KEY,                -- authored slug, e.g. 'env_biodegradable'
  lemma       TEXT NOT NULL,
  pos         TEXT NOT NULL DEFAULT 'other',
  deck        TEXT NOT NULL,                   -- 'topic-environment' | 'awl-1' | 'upgrade-pairs' | …
  entry_json  TEXT NOT NULL,                   -- full 08 §6.1 entry object (incl. upgrade_of)
  /* pack cols */
);
CREATE INDEX ix_vocab_pack_entries_deck ON vocab_pack_entries(deck, retired);
```

## 4. Sessions & attempts

### 4.1 The generic envelope

Every practice activity — any module — is one `practice_sessions` row. Module-specific tables
**share the same primary key** (their `id` IS the envelope `id`, FK with cascade). One table to
scan for the dashboard feed, streaks, time-on-task, and the curriculum's "what did you do today";
one delete to cascade an entire activity away.

```sql
CREATE TABLE practice_sessions (
  id          TEXT PRIMARY KEY,                -- module-prefixed ULID: ss_|wr_|rd_|ls_|dr_|vr_
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module      TEXT NOT NULL CHECK (module IN
                ('speaking','writing','reading','listening','vocab','drill','placement')),
  activity    TEXT NOT NULL,                   -- module-specific kind, e.g. 'full_mock','task2'
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at    TEXT,
  duration_s  INTEGER,                         -- wall-clock, set on close
  summary_json TEXT                            -- tiny module-written blob for dashboard cards
);
CREATE INDEX ix_practice_sessions_feed ON practice_sessions(profile_id, started_at DESC);
CREATE INDEX ix_practice_sessions_mod  ON practice_sessions(profile_id, module, started_at DESC);
```

### 4.2 Speaking (reconciles 04 §10 + 02 §4/§5; R2-4, R2-7, R2-21, R2-24)

**`mode` is the estimator weight class (R2-7)** — aligned to the `scored_attempts` enum
`placement|mock|practice|micro` — NOT the activity kind. The activity kind lives on the envelope
(`practice_sessions.activity`). Mapping of 04's session types:

| `practice_sessions.activity` | `speaking_sessions.mode` |
|---|---|
| `full_mock` | `mock` |
| `placement_sampler` | `placement` |
| `single_part:{1,2,3}`, `topic_drill` | `practice` |
| `quick_chat`, vocab warm-up drills | `micro` |

```sql
CREATE TABLE speaking_sessions (
  id              TEXT PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('placement','mock','practice','micro')),
  part            INTEGER CHECK (part BETWEEN 1 AND 3),   -- single_part only
  card_set_id     TEXT REFERENCES card_sets(id),          -- R2-21: real FK; NULL for quick_chat
  state           TEXT NOT NULL,               -- final state-machine phase (04 §3.1 vocabulary, per R2-11)
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','complete','aborted','failed')),
  transcript_json TEXT,                        -- {"turns":[{role,text,t_ms,dur_ms,segments,audio_file}]} (02 §4.1)
  metrics_json    TEXT,                        -- per-part fluency metrics (02 §4.2, R2-10 metric set)
  overall_band    REAL CHECK (overall_band BETWEEN 0 AND 9),  -- SERVER-recomputed via round_ielts (R2-4)
  criteria_json   TEXT,                        -- {"FC":6.0,"LR":6.0,"GRA":5.5,"P":6.5} from post-processing
  pron_summary_json TEXT                       -- session-level pronunciation aggregate (09)
);

-- Flattened turn rows: audio index + per-turn metrics. transcript_json stays the verbatim
-- envelope; turns are the queryable copy.
CREATE TABLE speaking_turns (
  id           TEXT PRIMARY KEY,               -- 'st_…'
  session_id   TEXT NOT NULL REFERENCES speaking_sessions(id) ON DELETE CASCADE,
  turn_index   INTEGER NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text         TEXT NOT NULL,
  t_ms         INTEGER NOT NULL,               -- offset from session start
  dur_ms       INTEGER,
  segments_json TEXT,                          -- [{t_start_ms,t_end_ms}] speech segments (user turns)
  audio_path   TEXT,                           -- relative to media/speaking/<session_id>/, user turns only
  metrics_json TEXT,                           -- per-turn fluency metrics (02 §4.2); NULL for assistant
  UNIQUE (session_id, turn_index)
);
```

**Turn-row writer (R2-24, canonical):** the session **teardown finally-block** (02 §2.4) flattens
`transcript_json` into `speaking_turns` rows **synchronously, in the same transaction, BEFORE**
writing `speaking_sessions.status='complete'`. No background job, no lazy projection: any session
with `status='complete'` is guaranteed to have its turn rows, so 09's pron analysis and report
playback can join on `speaking_turns` unconditionally. A teardown that crashes mid-flatten leaves
`status='active'`; the startup sweep re-runs the flatten from `transcript_json` (idempotent —
`UNIQUE (session_id, turn_index)` upsert) and then marks the session `complete` or `aborted`.

**Server-side band recompute (R2-4):** `overall_band` is ALWAYS recomputed server-side from the
criterion bands via the shared `round_ielts()` (ties round up); the model's own overall value is
ignored (04 gets a post-processing section mirroring 05 §6.3). `overall_band`/`criteria_json`
here are the denormalized results of that post-processing — the audit trail stays in
`llm_evaluations` (§5).

Delta vs 04 §10: `speaking_reports` is **not** a separate table — a speaking report is an
`llm_evaluations` row (`subject_kind='speaking_session'`, §5). The report route (18-api-contract.md)
reads it; every column 04 required (`overall_band`, `report_json`→`parsed_json`, `model_id`,
`prompt_version`, `created_at`) exists there. 04 should drop its sketch on next edit.

### 4.3 Writing (reconciles 05 §4)

Delta vs 05: `writing_attempts` is renamed **`writing_submissions`** (envelope-PK pattern), and
the inline `feedback_json` moves to a `writing_evaluations` row so rescores (the rewrite loop,
05 §8) keep full history instead of overwriting.

```sql
CREATE TABLE writing_submissions (
  id                 TEXT PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
  prompt_id          TEXT NOT NULL REFERENCES writing_prompts(id),
  parent_submission_id TEXT REFERENCES writing_submissions(id),  -- rewrite lineage (05 §8)
  mode               TEXT NOT NULL CHECK (mode IN ('exam','practice')),
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','scored','failed')),
  essay_text         TEXT NOT NULL DEFAULT '',
  outline_text       TEXT NOT NULL DEFAULT '',
  word_count         INTEGER NOT NULL DEFAULT 0,
  seconds_elapsed    INTEGER NOT NULL DEFAULT 0,
  overtime_seconds   INTEGER NOT NULL DEFAULT 0,
  paste_events       INTEGER NOT NULL DEFAULT 0,
  integrity_flag     TEXT,                     -- 'pasted' | NULL (05 §3: allowed but recorded)
  submitted_at       TEXT,
  overall_band       REAL CHECK (overall_band BETWEEN 0 AND 9)  -- denormalized from latest evaluation
);
CREATE INDEX ix_writing_submissions_prompt ON writing_submissions(prompt_id);
CREATE INDEX ix_writing_submissions_parent ON writing_submissions(parent_submission_id);

CREATE TABLE writing_evaluations (
  id               TEXT PRIMARY KEY,           -- 'we_…'
  submission_id    TEXT NOT NULL REFERENCES writing_submissions(id) ON DELETE CASCADE,
  llm_evaluation_id TEXT NOT NULL,             -- → llm_evaluations.id (no FK; see §5 cleanup note)
  band_ta          REAL NOT NULL CHECK (band_ta  BETWEEN 0 AND 9),  -- Task Achievement/Response
  band_cc          REAL NOT NULL CHECK (band_cc  BETWEEN 0 AND 9),
  band_lr          REAL NOT NULL CHECK (band_lr  BETWEEN 0 AND 9),
  band_gra         REAL NOT NULL CHECK (band_gra BETWEEN 0 AND 9),
  overall_band     REAL NOT NULL CHECK (overall_band BETWEEN 0 AND 9), -- server-computed via round_ielts (R2-4)
  annotations_json TEXT NOT NULL,              -- offset-based inline highlights, resolved (05 §7)
  vocab_suggestions_json TEXT,                 -- upgrades fed to the vocab suggestion inbox (§6, R2-5)
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_writing_evals_sub ON writing_evaluations(submission_id, created_at DESC);
```

### 4.4 Reading (reconciles 06)

```sql
CREATE TABLE reading_attempts (
  id           TEXT PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
  test_id      TEXT REFERENCES reading_tests(id),      -- full test
  passage_id   TEXT REFERENCES reading_passages(id),   -- single-passage practice
  mode         TEXT NOT NULL CHECK (mode IN ('exam','practice')),
  status       TEXT NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress','submitted','abandoned')),
  raw_score    INTEGER,
  total_questions INTEGER,
  band         REAL CHECK (band BETWEEN 0 AND 9),      -- NULL unless a banded conversion applies
               -- (full exam-mode test: 06's conversion table; 8-question samplers: 10 §3's table)
  duration_s   INTEGER NOT NULL DEFAULT 0,
  state_json   TEXT,                                   -- autosave: highlights, notes, flags, timer (06 §7)
  submitted_at TEXT,
  CHECK ((test_id IS NULL) <> (passage_id IS NULL))    -- exactly one target
);

CREATE TABLE reading_answers (
  id          TEXT PRIMARY KEY,
  attempt_id  TEXT NOT NULL REFERENCES reading_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES reading_questions(id),
  qtype       TEXT NOT NULL,                   -- denormalized for cheap per-type aggregation
  given       TEXT NOT NULL DEFAULT '',
  normalized  TEXT NOT NULL DEFAULT '',        -- output of the shared normalizer (R2-9: scoring/answers.py)
  correct     INTEGER NOT NULL CHECK (correct IN (0,1)),
  trap_analysis_json TEXT,                     -- cached "why was I wrong" (06 §5), per (attempt,question)
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX ix_reading_answers_type ON reading_answers(qtype, correct);
CREATE INDEX ix_reading_answers_q    ON reading_answers(question_id);
```

Delta vs 06: `answers_json` blobs are replaced by `reading_answers` rows because per-type accuracy
is aggregated across attempts (weakness detector, 10-curriculum-progress.md). The `drill_results`
table 06 references:

```sql
CREATE TABLE drill_results (
  id          TEXT PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
  module      TEXT NOT NULL CHECK (module IN ('reading','listening','vocab')),
  drill_kind  TEXT NOT NULL,                   -- 'question_type'|'skim'|'scan'|'dictation'|…
  qtype       TEXT,                            -- for question-type drills
  n_items     INTEGER NOT NULL,
  n_correct   INTEGER NOT NULL,
  params_json TEXT,                            -- wpm target, drill size, accent, …
  details_json TEXT                            -- per-item outcomes; only the drill UI reads it
);
CREATE INDEX ix_drill_results_kind ON drill_results(module, drill_kind, qtype);
```

(Pronunciation perception drills do NOT use `drill_results` — they have their own
`pron_drill_attempts` table, §7, per R2-6.)

### 4.5 Listening (reconciles 07 §11)

```sql
CREATE TABLE listening_attempts (
  id           TEXT PRIMARY KEY REFERENCES practice_sessions(id) ON DELETE CASCADE,
  test_id      TEXT REFERENCES listening_tests(id),
  script_id    TEXT REFERENCES listening_scripts(id),  -- single-part practice
  mode         TEXT NOT NULL CHECK (mode IN ('exam','practice','dictation','accent_drill')),
  status       TEXT NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress','submitted','abandoned')),
  raw_score    INTEGER,
  total_questions INTEGER,
  band         REAL CHECK (band BETWEEN 0 AND 9),      -- NULL unless a banded conversion applies (as 4.4)
  duration_s   INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  CHECK ((test_id IS NULL) <> (script_id IS NULL))
);

CREATE TABLE listening_answers (
  id          TEXT PRIMARY KEY,
  attempt_id  TEXT NOT NULL REFERENCES listening_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES listening_questions(id),
  qtype       TEXT NOT NULL,                   -- denormalized (same rationale as reading)
  given       TEXT NOT NULL DEFAULT '',
  normalized  TEXT NOT NULL DEFAULT '',
  correct     INTEGER NOT NULL CHECK (correct IN (0,1)),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX ix_listening_answers_type ON listening_answers(qtype, correct);
CREATE INDEX ix_listening_answers_q    ON listening_answers(question_id);
```

## 5. Evaluations — `llm_evaluations`

One row per scoring/analysis LLM call, whatever the module. This is the calibration audit trail
14-testing-strategy.md depends on: **raw response is always kept**, and `prompt_version` +
`model_id` are mandatory so band drift can be attributed to prompt changes vs model changes.
(03-providers-and-settings.md refers to this table's `model_id` as `assessments.model_id` — same
column, this name is canonical.)

```sql
CREATE TABLE llm_evaluations (
  id             TEXT PRIMARY KEY,             -- 'le_…'
  subject_kind   TEXT NOT NULL CHECK (subject_kind IN
                   ('speaking_session','writing_submission','reading_attempt',
                    'listening_attempt','vocab_entry','placement')),
  subject_id     TEXT NOT NULL,                -- polymorphic; no FK (see cleanup note)
  purpose        TEXT NOT NULL CHECK (purpose IN
                   ('score','rescore','trap_analysis','coach','generation_validation')),
  model_id       TEXT NOT NULL,                -- e.g. 'mlx-community/Qwen3-14B-4bit'
  provider_id    TEXT NOT NULL,                -- lockfile provider id (03)
  prompt_version TEXT NOT NULL,                -- e.g. 'speaking-eval/v3' — bump on ANY template change
  temperature    REAL NOT NULL,
  raw_response   TEXT NOT NULL,                -- verbatim model output, pre-extraction
  parsed_json    TEXT,                         -- NULL when status != 'ok'
  overall_band   REAL CHECK (overall_band BETWEEN 0 AND 9),  -- extracted for trend queries
  status         TEXT NOT NULL CHECK (status IN ('ok','parse_failed','api_failed')),
  latency_ms     INTEGER,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_llm_evals_subject ON llm_evaluations(subject_kind, subject_id, created_at DESC);
CREATE INDEX ix_llm_evals_calib   ON llm_evaluations(prompt_version, model_id, status);
```

**Cleanup note (default):** the polymorphic `subject_id` cannot cascade. Deletion of any
practice session runs a Python cleanup that deletes matching `llm_evaluations` rows in the same
transaction, plus a startup orphan sweep (`DELETE … WHERE subject not found`, batched). Chosen
over per-subject FK columns or triggers for schema simplicity — flagged as a default.

## 6. Vocabulary (R2-5 — canonical; 08-vocabulary-srs.md conforms)

The former single-table `vocab_cards`/`vocab_reviews` design is **replaced** by 08's four-table
shape, ported to this doc's conventions: TEXT ULID PKs, `profile_id` scoping on the root
(`vocab_entries` — children inherit), `_json` suffixes, `*_at` timestamp names.

Rulings applied (R2-5):
- **Dedup key `UNIQUE (profile_id, lemma, pos)`** — "book (noun)" ≠ "book (verb)"; the former
  `(profile_id, lemma)` key is repealed. POS-unknown ingest resolution is 08 §3.1's job.
- **Status enum `suggested|active|suspended|known`** — unified; 08's missing `suggested` and this
  doc's former `archived` are both repealed. `known` = removed from scheduling but suppresses
  re-ingestion (08 §3.3's known→active misuse-flip rule stands).
- **`review_type` enum = 08's six exercise types** (08 calls the column `exercise_type`; this
  name is canonical, 08 conforms).
- **`fsrs_json`** carries the verbatim py-fsrs `Card.to_dict()` for forward compatibility; the
  mirrored real columns exist for the hot due-queue query. Scheduler params live in `settings`
  key `vocab.fsrs_params`.

**Suggested-inbox semantics (R2-5, canonical — 08 §3.2's auto-schedule flow is repealed):**

- Module-sourced ingests (speaking/writing/reading/listening/pronunciation) create a
  `vocab_entries` row with `status='suggested'` and **NO `srs_cards` row**. Nothing enters the
  SRS silently (04 §8 / 05 §10 win).
- Learner acceptance (the suggestion-inbox UI, route per 18-api-contract.md) flips
  `status='active'` and creates the `srs_cards` row (`state=0`, `due_at=now`).
- Only **manual adds** and **accepted seed-deck opt-ins** (copies from `vocab_pack_entries`, §3)
  skip the inbox and schedule immediately (`status='active'` + `srs_cards` row at insert).
- Rejecting a suggestion deletes the entry (its `vocab_sources` rows cascade); re-suggestion of
  the same `(lemma, pos)` is allowed later — dedup only merges into *existing* rows.
- A duplicate ingest of an existing entry (any status) never resets scheduling; it merges per
  08 §3.3 and appends a `vocab_sources` row.

```sql
CREATE TABLE vocab_entries (
  id                   TEXT PRIMARY KEY,       -- 've_…'
  profile_id           TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  headword             TEXT NOT NULL,          -- display form as the learner met it
  lemma                TEXT NOT NULL,          -- lowercase lemma; phrases: normalized text (08 §3.1)
  pos                  TEXT NOT NULL DEFAULT 'other'
                       CHECK (pos IN ('noun','verb','adj','adv','prep','phrase','collocation','other')),
  is_phrase            INTEGER NOT NULL DEFAULT 0 CHECK (is_phrase IN (0,1)),
  ipa                  TEXT,
  definition           TEXT NOT NULL DEFAULT '',   -- '(pending)' until enrichment succeeds (08 §3.2)
  own_context_sentence TEXT,
  own_context_origin   TEXT NOT NULL DEFAULT 'seed'
                       CHECK (own_context_origin IN ('seed','learner')),  -- learner wins (08 §3.3)
  example_sentences_json TEXT NOT NULL DEFAULT '[]',
  collocations_json    TEXT NOT NULL DEFAULT '[]',
  topic_tags_json      TEXT NOT NULL DEFAULT '[]',
  cefr_level           TEXT CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  audio_ref            TEXT,                   -- relative path under media/vocab/ (§9, R2-18)
  status               TEXT NOT NULL DEFAULT 'suggested'
                       CHECK (status IN ('suggested','active','suspended','known')),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (profile_id, lemma, pos)
);
CREATE INDEX ix_vocab_entries_browse ON vocab_entries(profile_id, status);
CREATE INDEX ix_vocab_entries_lemma  ON vocab_entries(profile_id, lemma);

-- Full provenance history: one row per (re-)encounter. 08 §1's inflow table is the functional
-- source of truth for module/detail values.
CREATE TABLE vocab_sources (
  id         TEXT PRIMARY KEY,                 -- 'vs_…'
  entry_id   TEXT NOT NULL REFERENCES vocab_entries(id) ON DELETE CASCADE,
  module     TEXT NOT NULL CHECK (module IN
               ('speaking','writing','reading','listening','pronunciation','seed','manual')),
  session_id TEXT,                             -- module session/attempt id; NULL for seed/manual
  detail     TEXT,                             -- e.g. 'pack:topic-environment' or 'passage:env-04'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_vocab_sources_entry ON vocab_sources(entry_id);

-- One card per SCHEDULED entry. Suggested-inbox rule: no row until acceptance (see above).
CREATE TABLE srs_cards (
  id             TEXT PRIMARY KEY,             -- 'sc_…'
  entry_id       TEXT NOT NULL UNIQUE REFERENCES vocab_entries(id) ON DELETE CASCADE,
  state          INTEGER NOT NULL DEFAULT 0 CHECK (state IN (0,1,2,3)),
                                               -- 0 new, 1 learning, 2 review, 3 relearning (py-fsrs)
  step           INTEGER,                      -- learning/relearning step index (py-fsrs)
  stability      REAL,                         -- days; NULL until first review
  difficulty     REAL,                         -- 1..10; NULL until first review
  due_at         TEXT NOT NULL,
  last_review_at TEXT,
  reps           INTEGER NOT NULL DEFAULT 0,   -- our counter (py-fsrs no longer tracks it)
  lapses         INTEGER NOT NULL DEFAULT 0,   -- increments on Again while state=2
  fsrs_json      TEXT NOT NULL                 -- verbatim py-fsrs Card.to_dict() — forward compat
);
CREATE INDEX ix_srs_cards_due ON srs_cards(due_at);

-- Append-only: input for stats (08 §8) and future FSRS parameter optimization (08 §4.4).
CREATE TABLE srs_review_logs (
  id                TEXT PRIMARY KEY,          -- 'rl_…'
  card_id           TEXT NOT NULL REFERENCES srs_cards(id) ON DELETE CASCADE,
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),  -- Again|Hard|Good|Easy
  review_type       TEXT NOT NULL CHECK (review_type IN
                      ('flip','cloze','use_in_sentence','collocation','audio_recall','speaking_drill')),
  reviewed_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  elapsed_ms        INTEGER,
  state_before      INTEGER NOT NULL,
  stability_before  REAL,
  difficulty_before REAL
);
CREATE INDEX ix_srs_review_logs_card ON srs_review_logs(card_id, reviewed_at);
CREATE INDEX ix_srs_review_logs_time ON srs_review_logs(reviewed_at);
```

Bank search (08 §9's browse endpoint) is an FTS5 external-content table over
`vocab_entries(headword, definition)`, created via `op.execute` in the migration (Alembic does
not autogenerate virtual tables):

```sql
CREATE VIRTUAL TABLE vocab_fts USING fts5(
  headword, definition,
  content='vocab_entries', content_rowid='rowid', tokenize='unicode61'
);
CREATE TRIGGER vocab_fts_ai AFTER INSERT ON vocab_entries BEGIN
  INSERT INTO vocab_fts(rowid, headword, definition)
  VALUES (new.rowid, new.headword, new.definition);
END;
CREATE TRIGGER vocab_fts_ad AFTER DELETE ON vocab_entries BEGIN
  INSERT INTO vocab_fts(vocab_fts, rowid, headword, definition)
  VALUES ('delete', old.rowid, old.headword, old.definition);
END;
CREATE TRIGGER vocab_fts_au AFTER UPDATE OF headword, definition ON vocab_entries BEGIN
  INSERT INTO vocab_fts(vocab_fts, rowid, headword, definition)
  VALUES ('delete', old.rowid, old.headword, old.definition);
  INSERT INTO vocab_fts(rowid, headword, definition)
  VALUES (new.rowid, new.headword, new.definition);
END;
```

## 7. Pronunciation (R2-6 — canonical; 09-pronunciation-assessment.md conforms)

The former `pron_word_scores` (turn-only, `score REAL 0–1`) is **deleted**. Canonical storage is
09 §7's **source-polymorphic `pron_scores`** — one row per analyzed word occurrence from any of
the four production sources — plus `pron_drill_attempts` for perception drills, both ported to
this doc's conventions (TEXT ULID PKs, `profile_id` root scoping). Scores are stored as
**INTEGER 0–100**; wherever a prompt needs a 0–1 float (09 §6's `pron_signals_json`), the
serializer emits `score/100` — the DB never stores the float.

```sql
CREATE TABLE pron_scores (
  id             TEXT PRIMARY KEY,             -- 'pw_…'
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source         TEXT NOT NULL CHECK (source IN
                   ('speaking_turn','read_aloud','shadowing','minimal_pair')),
  session_id     TEXT REFERENCES speaking_sessions(id) ON DELETE CASCADE,
                                               -- NULL unless source='speaking_turn'
  turn_id        TEXT REFERENCES speaking_turns(id) ON DELETE CASCADE,
                                               -- NULL unless source='speaking_turn'
  passage_id     TEXT,                         -- content id for read_aloud/shadowing/minimal_pair
  audio_path     TEXT,                         -- relative to <data_dir>/media/ (NULL if recording deleted)
  method         TEXT NOT NULL CHECK (method IN ('proxy-v1','local-gop','azure','speechace')),
  word           TEXT NOT NULL,                -- lower-cased
  word_index     INTEGER NOT NULL,
  score          INTEGER CHECK (score BETWEEN 0 AND 100),  -- NULL = skipped/proxy-unscored
  expected_ipa   TEXT,
  heard_approx   TEXT,
  t_start_ms     INTEGER,
  t_end_ms       INTEGER,
  phone_detail_json TEXT,                      -- [{ipa,score,t_start_ms,t_end_ms}] (local-gop only)
  issues_json    TEXT,                         -- tags: ['th_substitution','final_consonant_drop',…]
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_pron_scores_session ON pron_scores(session_id, turn_id);
CREATE INDEX ix_pron_scores_word   ON pron_scores(profile_id, word, created_at);  -- worst-words + per-word trend

-- Perception-drill attempts (minimal-pair A/B listening, stress taps) — no audio scoring involved.
CREATE TABLE pron_drill_attempts (
  id          TEXT PRIMARY KEY,                -- 'pd_…'
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  drill_type  TEXT NOT NULL CHECK (drill_type IN ('minimal_pair_ab','word_stress_tap')),
  item_id     TEXT NOT NULL,                   -- pair_id or word
  contrast    TEXT,                            -- e.g. 'ɪ–iː'
  correct     INTEGER NOT NULL CHECK (correct IN (0,1)),
  response_ms INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_pron_drills_contrast ON pron_drill_attempts(profile_id, contrast, created_at);
```

Retention (R2-6): `pron_scores`/`pron_drill_attempts` rows are tiny and kept forever (they power
10's trend charts). The WAVs they reference follow §9's canonical policy: **user recordings are
never auto-evicted** — 02 §5 and 09 §7's "20-session pruning" language is **repealed**. Audio
disappears only on explicit session/recording deletion, at which point `audio_path` is NULLed and
replay buttons disable; scores remain.

## 8. Curriculum & progress (R2-7 — canonical; 10-curriculum-progress.md conforms)

This section adopts 10 §11's richer model wholesale (with this doc's ID/timestamp conventions and
`profile_id` scoping): `placement_results`, `study_plans` with horizon/weights/supersession,
block-structured `plan_sessions` with build/taper phases, `adaptive_events`, `daily_activity`,
`milestones`, `readiness_items`. The former flat `plan_items` table is **deleted**. Band
estimates are BOTH: the append-only `band_estimates` snapshot log (this doc's model — trend chart
is a straight scan, model changes stay attributable) AND a per-skill "current" cache exposed as
the SQL view `current_band_estimates`. The estimator's input is the SQL view `scored_attempts`.

### 8.1 Placement & plans

```sql
CREATE TABLE placement_results (
  id             TEXT PRIMARY KEY,             -- 'pe_…'
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  taken_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  estimates_json TEXT NOT NULL                 -- shape in 10 §3 (per-skill band + evidence + confidence)
);
CREATE INDEX ix_placement_results_profile ON placement_results(profile_id, taken_at DESC);

CREATE TABLE study_plans (
  id             TEXT PRIMARY KEY,             -- 'pln_…'
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_band      REAL NOT NULL CHECK (goal_band BETWEEN 4 AND 9),
  exam_date      TEXT,                         -- ISO date; NULL = rolling 8-week horizon (10 §4)
  horizon_weeks  INTEGER NOT NULL,
  weights_json   TEXT NOT NULL,                -- weights_by_week, shape in 10 §4.4
  rationale_json TEXT,                         -- generator inputs snapshot (placement result, weaknesses, seed)
  superseded_by  TEXT REFERENCES study_plans(id),  -- regeneration keeps history; active plan =
                                               -- newest row per profile with superseded_by IS NULL
  generated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_study_plans_profile ON study_plans(profile_id, generated_at DESC);

CREATE TABLE plan_sessions (
  id            TEXT PRIMARY KEY,              -- 'ses_…'
  plan_id       TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,                 -- ISO date
  phase         TEXT NOT NULL CHECK (phase IN ('build','taper')),
  duration_min  INTEGER NOT NULL,
  blocks_json   TEXT NOT NULL,                 -- [{kind, minutes, module?, activity?, params?}] (10 §4.4)
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','in_progress','completed','partial','skipped')),
  minutes_logged INTEGER NOT NULL DEFAULT 0,
  current_block INTEGER                        -- crash-resume pointer (10 §5 lifecycle)
);
CREATE INDEX ix_plan_sessions_day ON plan_sessions(plan_id, date);
```

### 8.2 Band estimates: append-only log + `current_band_estimates` view

One row appended per estimator run (after every scored attempt, per skill affected, and for
`overall`). The columns carry everything 10 §6's cache shape needs, so "current" is just the
latest row per `(profile_id, skill)`:

```sql
CREATE TABLE band_estimates (
  id            TEXT PRIMARY KEY,              -- 'be_…' — ULID: lexicographic max = newest (§1)
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill         TEXT NOT NULL CHECK (skill IN ('speaking','writing','reading','listening','overall')),
  estimate_raw  REAL,                          -- pre-rounding float, e.g. 6.32
  band          REAL NOT NULL CHECK (band BETWEEN 0 AND 9),  -- display band (nearest 0.5; overall via round_ielts)
  range_low     REAL CHECK (range_low  BETWEEN 0 AND 9),
  range_high    REAL CHECK (range_high BETWEEN 0 AND 9),
  confidence    TEXT NOT NULL CHECK (confidence IN ('insufficient','low','medium','high')),  -- 10 §6.2
  n_eff         REAL NOT NULL DEFAULT 0,       -- effective sample size Σ(w_i)
  attempts_used INTEGER NOT NULL DEFAULT 0,
  criteria_json TEXT,                          -- per-criterion estimates (radar chart), NULL for R/L/overall
  method        TEXT NOT NULL CHECK (method IN ('estimator','placement','self_assessed','manual')),
  model_id      TEXT,                          -- configured LLM at compute time (trend caveats, 10 open Q4)
  newest_attempt_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_band_estimates_trend ON band_estimates(profile_id, skill, created_at);
```

```sql
-- Latest snapshot per (profile, skill) — the "recomputed cache" of 10 §6.4, as a view so it can
-- never drift from the log. ULID ids sort by creation time, so max(id) = newest row.
CREATE VIEW current_band_estimates AS
SELECT *
FROM band_estimates
WHERE id IN (SELECT max(id) FROM band_estimates GROUP BY profile_id, skill);
```

### 8.3 `scored_attempts` view — the estimator input (owns G3)

Uniform columns over the four module attempt tables: `attempt_id`, `profile_id`, `skill`,
`mode` (values `placement|mock|practice|micro` — a view cannot carry a CHECK; the underlying
`speaking_sessions.mode` CHECK and the CASE mappings below guarantee the domain), `band`,
`criteria_json`, `at`. Only finished, banded attempts appear. 10 §6 reads exclusively from this
view; the estimator writes `band_estimates` rows.

```sql
CREATE VIEW scored_attempts AS
SELECT ss.id             AS attempt_id,
       ps.profile_id     AS profile_id,
       'speaking'        AS skill,
       ss.mode           AS mode,           -- already the canonical enum (R2-7, §4.2)
       ss.overall_band   AS band,
       ss.criteria_json  AS criteria_json,
       COALESCE(ps.ended_at, ps.started_at) AS at
FROM   speaking_sessions ss
JOIN   practice_sessions ps ON ps.id = ss.id
WHERE  ss.status = 'complete' AND ss.overall_band IS NOT NULL

UNION ALL

SELECT ws.id, ps.profile_id, 'writing',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN ws.mode   = 'exam'      THEN 'mock'
            ELSE 'practice' END,
       ws.overall_band,
       (SELECT json_object('TA', we.band_ta, 'CC', we.band_cc,
                           'LR', we.band_lr, 'GRA', we.band_gra)
        FROM   writing_evaluations we
        WHERE  we.submission_id = ws.id
        ORDER  BY we.created_at DESC LIMIT 1),
       COALESCE(ws.submitted_at, ps.ended_at, ps.started_at)
FROM   writing_submissions ws
JOIN   practice_sessions ps ON ps.id = ws.id
WHERE  ws.status = 'scored' AND ws.overall_band IS NOT NULL

UNION ALL

SELECT ra.id, ps.profile_id, 'reading',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN ra.mode = 'exam' AND ra.test_id IS NOT NULL THEN 'mock'
            ELSE 'practice' END,
       ra.band,
       NULL,                                -- objective skills: no criterion bands
       COALESCE(ra.submitted_at, ps.ended_at, ps.started_at)
FROM   reading_attempts ra
JOIN   practice_sessions ps ON ps.id = ra.id
WHERE  ra.status = 'submitted' AND ra.band IS NOT NULL

UNION ALL

SELECT la.id, ps.profile_id, 'listening',
       CASE WHEN ps.module = 'placement' THEN 'placement'
            WHEN la.mode = 'exam' AND la.test_id IS NOT NULL THEN 'mock'
            WHEN la.mode IN ('dictation','accent_drill') THEN 'micro'
            ELSE 'practice' END,
       la.band,
       NULL,
       COALESCE(la.submitted_at, ps.ended_at, ps.started_at)
FROM   listening_attempts la
JOIN   practice_sessions ps ON ps.id = la.id
WHERE  la.status = 'submitted' AND la.band IS NOT NULL;
```

Notes: `micro` rows come from speaking micro sessions (quick_chat / warm-up drills, which the
evaluator scores) and any banded dictation/accent drills; unbanded drills (`drill_results`) never
feed the estimator. Estimator weights by mode (`placement`/`mock` ×2.0, `practice` ×1.0, `micro`
×0.5) and the half-life decay are 10 §6's business logic, applied in Python over this view.

### 8.4 Adaptive engine, activity, milestones, readiness

```sql
CREATE TABLE adaptive_events (
  id            TEXT PRIMARY KEY,              -- 'ae_…'
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id       TEXT NOT NULL,                 -- 10 §8 rule ids, e.g. 'gra-low-streak'
  fired_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  evidence_json TEXT NOT NULL,                 -- attempt ids + trigger values (auditable callouts)
  action_json   TEXT NOT NULL,
  dismissed_at  TEXT
);
CREATE INDEX ix_adaptive_events_feed ON adaptive_events(profile_id, fired_at DESC);

-- Heatmap + streak source of truth (10 §7/§9). One row per profile-day; day boundary is the
-- 4 AM local rollover (08 §7).
CREATE TABLE daily_activity (
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,               -- ISO date
  minutes         INTEGER NOT NULL DEFAULT 0,
  goal_met        INTEGER NOT NULL DEFAULT 0 CHECK (goal_met IN (0,1)),
  is_rest_day     INTEGER NOT NULL DEFAULT 0 CHECK (is_rest_day IN (0,1)),
  streak_repaired INTEGER NOT NULL DEFAULT 0 CHECK (streak_repaired IN (0,1)),
  PRIMARY KEY (profile_id, date)
);

CREATE TABLE milestones (
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL,                  -- 'streak-14', 'first-mock', … (10 §9 list)
  achieved_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (profile_id, milestone_id)
);

CREATE TABLE readiness_items (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,                    -- 'auto-two-mocks', 'manual-exam-booked', … (10 §10)
  kind       TEXT NOT NULL CHECK (kind IN ('auto','manual')),
  checked    INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
  checked_at TEXT,
  PRIMARY KEY (profile_id, item_id)
);

-- Append-only misc event feed ("recent activity" list: pack installs, plan regenerations, …).
-- Streaks and the heatmap come from daily_activity, NOT from this table. Never joined for
-- correctness — safe to prune (default: keep 400 days).
CREATE TABLE activity_log (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event_type TEXT NOT NULL,                    -- 'session_completed','plan_regenerated','pack_installed',…
  ref_kind   TEXT,
  ref_id     TEXT,
  meta_json  TEXT
);
CREATE INDEX ix_activity_log_feed ON activity_log(profile_id, at DESC);
```

## 9. Media: cache table + on-disk layout (R2-18)

```sql
-- Index over hash-addressed cache files. User recordings are NOT in this table — they are
-- owned by speaking_turns.audio_path / pron_scores.audio_path and never subject to eviction.
CREATE TABLE media_files (
  hash          TEXT PRIMARY KEY,              -- sha256 hex of file content
  kind          TEXT NOT NULL CHECK (kind IN
                  ('listening_render','tts_line','vocab_audio','pron_ref','pack_media')),
  rel_path      TEXT NOT NULL,                 -- relative to <data_dir>/media/
  bytes         INTEGER NOT NULL,
  pinned        INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),  -- pack media = 1
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_access_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_media_evict ON media_files(pinned, kind, last_access_at);
```

On-disk layout under the data dir (01-architecture.md: `~/Library/Application Support/BandReady`
mac, `%APPDATA%/BandReady` win). **This tree is canonical (R2-18)** — 01 §8's
`recordings/`/`content/` paths, 08 §5.3's `audio/vocab/`, and 09 §5.2's bare `media/pron/ref/`
citation are corrected to match:

```
<data_dir>/
├── bandready.db                     # + -wal, -shm
├── media/
│   ├── speaking/<session_id>/       # user recordings (02 §5): turn-004.wav, manifest.json
│   ├── pron/
│   │   ├── ref/<voice_id>/<sha1>.wav   # Kokoro reference audio cache (09 §5.2) — evictable
│   │   └── attempts/<ulid>.wav         # read-aloud/shadowing/MP-production user recordings
│   │                                   #   (default location, flagged; referenced by pron_scores.audio_path)
│   ├── vocab/<entry_id>.wav         # Kokoro word audio (08 §5.3) — evictable, lazily regenerated
│   ├── listening/<hash>.wav         # rendered part audio + <hash>.timing.json (07 §3)
│   └── tts-lines/<hash>.wav         # per-line TTS cache (07) + E2E-harness utterances
├── models/pron/                     # on-demand GOP model download (09 §4.0)
├── packs/<pack_id>/<version>/       # extracted read-only pack media (pinned, never evicted)
└── exports/                         # user-triggered export zips (§13)
```

**Eviction policy (canonical — R2-6 reaffirms; supersedes 02 §5's and 09 §7's "20 most recent
sessions" pruning, which is repealed, and answers 04 open question 5):**

1. **User recordings (`media/speaking/…` and `media/pron/attempts/…`) are NEVER auto-evicted.**
   They are deleted only when their session/attempt is deleted (single delete or bulk "wipe
   recordings", §13) — replay is a core feature and silently losing a learner's own voice data
   is unacceptable.
2. **Generated/cache audio** (`kind IN ('listening_render','tts_line','vocab_audio','pron_ref')`,
   `pinned=0`): LRU by `last_access_at`, pruned after each render until total ≤ budget.
   Default budget **2 GB** (settings key `media.cache_budget_mb`, flagged default per 07 §11).
   Eviction deletes the file, the `media_files` row, and NULLs any cache pointer
   (`listening_scripts.audio_hash`, `vocab_entries.audio_ref`) — re-render is idempotent and
   cheap (cache miss just re-synthesizes).
3. **Pack media** is `pinned=1`, lives under `packs/`, and is removed only by pack uninstall.
4. Settings screen shows disk usage per category (recordings / cache / packs) with per-category
   actions; recordings display a projected size (~1 MB/min mono 16 kHz WAV, so a 14-min Full
   Mock ≈ 7 MB of user turns).

## 10. JSON-column policy

**Rule: JSON for shapes only one module reads; real columns (or child rows) for anything
queried, filtered, or aggregated by SQL.** Applied throughout:

| Stored as JSON (single reader) | Stored relationally (queried/aggregated) |
|---|---|
| `speaking_sessions.transcript_json`, `metrics_json` | `speaking_turns` rows (audio index, per-turn playback) |
| `speaking_cards.payload_json`, `reading_passages.passage_json`, `listening_scripts.script_json` (render-only documents) | picker metadata: `part`, `qtype`, `difficulty`, `band_target`, `topic_id`, `retired` |
| `writing_evaluations.annotations_json` (editor overlay) | criterion bands as columns (trend charts) |
| `srs_cards.fsrs_json` (py-fsrs round-trip blob) | `state`, `due_at`, `stability` columns (due-queue query) |
| `pron_scores.phone_detail_json` | `word`, `score` columns (worst-words query) |
| `plan_sessions.blocks_json` (session runner reads it) | `date`, `phase`, `status` columns (today's-plan query) |
| `llm_evaluations.raw_response`, `parsed_json` | `model_id`, `prompt_version`, `status`, `overall_band` (calibration queries) |
| `drill_results.details_json` | `n_items`, `n_correct`, `qtype` |
| answer variant sets (`answers_json` — read only by the scorer) | `reading_answers`/`listening_answers` rows with `qtype`, `correct` (weakness detector) |
| `band_estimates.criteria_json` (radar chart payload) | `band`, `confidence`, `n_eff` columns (tiles, gating) |

Corollaries: never `json_extract` in a hot query (add a column instead — cheap via batch
migration); the `json_object` subquery inside `scored_attempts` is the one sanctioned exception
(estimator runs are seconds-scale batch reads, not hot-path). JSON shapes carry no
schema_version field — the **Alembic revision is the schema version** for JSON columns too, and
migrations rewrite JSON blobs when shapes change.

## 11. Content-pack import/export format (R2-8 — merged format, canonical; 15 §6 conforms)

The two divergent specs (this doc's old §11 and 15 §6) are merged as follows: **this doc's**
`.brpack` extension, reverse-DNS pack ids, `data/` JSONL layout, and typed-table import
algorithm; **15's** manifest keys (`manifest_version`, `id`, `publisher`, `checksums`,
`disclaimer`, `ai_disclosure`, `built_with`) and the `vocab.jsonl` + `card_sets.jsonl` files.
15 §6's plain-dirname pack ids, top-level JSONL placement, and `content_items` upsert are all
**repealed** (`content_items` does not exist — it was replaced by the typed tables in §3).
Content tooling factoring (repo `tools/content/`, PyPI `bandready-content` re-exporting
`bandready.content` validators) is 15's domain per R2-8.

### 11.1 Archive layout

A pack is a `.zip` (extension `.brpack`, plain zip inside):

```
org.bandready.core-1.2.0.brpack
├── manifest.json
├── data/
│   ├── topics.jsonl
│   ├── card_sets.jsonl              # one card_sets row per line (R2-21)
│   ├── speaking_cards.jsonl
│   ├── writing_prompts.jsonl
│   ├── reading_passages.jsonl       # passage_json documents; questions derived on import
│   ├── reading_tests.jsonl
│   ├── listening_scripts.jsonl
│   ├── listening_tests.jsonl
│   └── vocab.jsonl                  # one vocab_pack_entries row per line (08 §6.1 entry shape)
└── media/
    ├── audio/<sha256>.wav           # optional pre-rendered listening audio + .timing.json
    └── images/…                     # diagram-labelling assets (06 open Q1)
```

Every `data/*.jsonl` file is optional (a vocab-only pack ships just `vocab.jsonl`). Each JSONL
line is one row keyed by its stable authored `id`; column names match the DDL (§3), minus the
pack-provenance columns (filled in at import).

### 11.2 manifest.json (merged key set)

```json
{
  "manifest_version": 1,
  "id": "org.bandready.core",
  "version": "1.2.0",
  "name": "BandReady Core Bank",
  "description": "Original IELTS-style practice content, all four skills.",
  "publisher": "BandReady contributors",
  "homepage": "https://github.com/bandready/content-core",
  "license": "CC0-1.0",
  "min_app_version": "0.3.0",
  "disclaimer": "BandReady is an independent open-source project and is not affiliated with, endorsed by, or connected to the IELTS Partners (British Council, IDP: IELTS Australia, and Cambridge University Press & Assessment). IELTS is a registered trademark of its owners, used here only to describe the exam format this software helps you prepare for. All practice materials in BandReady are original and are not official IELTS test content. Band scores produced by this software are AI-generated estimates for practice purposes only and do not predict official IELTS results.",
  "ai_disclosure": "ai_assisted",
  "built_with": { "tool": "bandready-content", "tool_version": "0.3.0" },
  "counts": { "card_sets": 60, "speaking_cards": 240, "writing_prompts": 240,
              "reading_passages": 24, "reading_tests": 8,
              "listening_scripts": 16, "listening_tests": 4, "vocab": 2000 },
  "checksums": { "data/speaking_cards.jsonl": "sha256:…",
                 "data/vocab.jsonl": "sha256:…",
                 "media/audio/ab12….wav": "sha256:…" }
}
```

Key deltas vs the two old formats: `format`/`format_version` → `manifest_version`; `pack_id` →
`id` (reverse-DNS required); `author` → `publisher`; `source_url` → `homepage`; the old `media[]`
array is replaced by `checksums` (which must list **every** `data/` and `media/` file — a file
absent from `checksums` fails import). `disclaimer` and `ai_disclosure` are mandatory
(15 §1.1/§8 own their wording rules); per-item `license`/`attribution` overrides and semver
bumping rules are 15 §6's and stand unchanged. `locale_hint` stays reserved/unvalidated (15 §9).

### 11.3 Import algorithm (typed-table upsert; idempotent by `(id, version)`)

1. Validate manifest (`manifest_version` supported, `min_app_version` satisfied, `id` reverse-DNS,
   `disclaimer`/`ai_disclosure` present); **verify every checksum** (15 §6); validate every JSONL
   row against its Pydantic schema and run the 15 §3.3 no-LLM validators. Any failure → reject
   the whole pack (partial imports create un-debuggable states).
2. If a `content_packs` row with this `(pack_id, version)` exists → **no-op** (report "already
   installed"); a `--repair` re-import re-verifies rows/media and rewrites divergences.
3. In one transaction: **upsert rows by `id` into the typed tables** — `topics`, `card_sets`,
   `speaking_cards`, `writing_prompts`, `reading_passages`, `reading_tests`,
   `listening_scripts`, `listening_tests`, `vocab_pack_entries` — setting `source='pack'`,
   `pack_id`, `pack_version`, `license`; derive `reading_questions`/`listening_questions` from
   the passage/script documents (expanding answer variants per 06 §4.1 / the R2-9 shared
   normalizer spec); insert the `content_packs` row; register `media_files`
   (`kind='pack_media'`, `pinned=1`) pointing into `packs/<pack_id>/<version>/`.
   (There is NO `content_items` step — 15 §6's reference is repealed.)
4. **Upgrade** (same `pack_id`, higher version): rows present in the new version are updated in
   place; rows absent from it are set `retired=1` — **never deleted**, because attempt history
   FK-references them (§1). Old `content_packs` row is kept (history), `enabled=0`.
5. Vocab decks are NOT pushed into any profile at import — `vocab_pack_entries` is content.
   Deck opt-in (08 §6.2 flow) copies entries into the active profile's `vocab_entries` +
   `srs_cards` via the §6 seed-opt-in rule.

### 11.4 Retire, don't delete

`retired=1` content is excluded from all pickers/generators but still renders in past-attempt
review. The same flag serves user-hidden content ("don't show me this prompt again").

## 12. Migrations (Alembic from day one)

- Initial revision creates the full schema above — including the two views (§8.2/§8.3) and the
  FTS5 table + triggers (§6) via `op.execute` — then sidecar startup runs `upgrade head` under
  the boot flock (same pattern as OpenVoiceUI: migrations → seed pack import → serve).
- **SQLite batch-alter caveats**: SQLite cannot `ALTER` most things. All alterations use
  `op.batch_alter_table` (Alembic's copy-rename dance); `context.configure(render_as_batch=True)`
  in `env.py`. This REQUIRES a constraint **naming convention** from day one (anonymous
  constraints cannot be dropped in batch mode):

```python
naming_convention = {
  "ix": "ix_%(column_0_label)s",
  "uq": "uq_%(table_name)s_%(column_0_name)s",
  "ck": "ck_%(table_name)s_%(constraint_name)s",
  "fk": "fk_%(table_name)s_%(referenced_table_name)s_%(column_0_name)s",
  "pk": "pk_%(table_name)s",
}
metadata = MetaData(naming_convention=naming_convention)
```

- Batch mode rebuilds tables → run `PRAGMA foreign_keys=OFF` for the migration connection (Alembic
  batch handles ordering, but FK enforcement must be off during table swap; re-enable after).
- **Views**: any migration that batch-alters a table referenced by `scored_attempts` or
  `current_band_estimates` must `DROP VIEW` first and re-`CREATE VIEW` after (SQLite views bind
  by name at query time, but a column rename silently breaks them — recreating in the same
  revision keeps the pair atomic). Same rule for the FTS triggers when `vocab_entries` changes.
- Downgrades are written but not supported in production — the app never auto-downgrades; opening
  a DB whose `alembic_version` is *newer* than the app shows a "created by a newer BandReady"
  error instead of touching the file.
- Data migrations that rewrite JSON blobs iterate in batches of 500 rows inside the revision.
- Before `upgrade head` on a non-empty DB, the sidecar copies `bandready.db` to
  `bandready.db.bak-<rev>` (kept: last 2) — cheap insurance on a desktop app.

## 13. Retention, deletion, portability

- **Delete one session**: `DELETE FROM practice_sessions WHERE id=?` cascades through the module
  row, turns/answers/evaluations (writing/child rows) and — via the nullable FKs — any
  `pron_scores` rows tied to a speaking session, then Python cleanup removes matching
  `llm_evaluations` (§5 note) and `media/speaking/<id>/` recursively — all in one transaction +
  post-commit file delete (files orphaned by a crash are caught by the startup sweep).
- **Wipe recordings** (keep history): delete all `media/speaking/` and `media/pron/attempts/`
  files, set `speaking_turns.audio_path=NULL` and `pron_scores.audio_path=NULL`; transcripts,
  metrics, scores, reports untouched. Exposed in settings.
- **Delete a vocab entry**: `DELETE FROM vocab_entries WHERE id=?` cascades `vocab_sources`,
  `srs_cards`, and (via the card) `srs_review_logs`; the FTS triggers keep `vocab_fts` in sync;
  Python cleanup removes `media/vocab/<entry_id>.wav` if present.
- **Wipe profile**: `DELETE FROM profiles WHERE id=?` cascades everything learner-owned
  (§2 root list); content bank (`vocab_pack_entries` included) and media cache untouched.
- **Export all (data portability)**: settings → "Export my data" writes
  `exports/bandready-export-<date>.zip`: `manifest.json` (`format:"bandready-export"`, app +
  schema versions), `data/<table>.jsonl` for every table (content-bank tables included so the
  export is self-contained; views and `vocab_fts` are derived and NOT exported), and `media/`
  with all user recordings. Same reader tooling as packs; a future "import export" restores onto
  a fresh install (roadmap, 16-roadmap.md).
- `activity_log` pruned to 400 days (default); everything else is kept indefinitely — text is
  tiny (a heavy year of use is well under 100 MB excluding audio).

## 14. Hot queries and the indexes that serve them

| Query (owner) | SQL shape | Served by |
|---|---|---|
| Dashboard recent activity (10) | `practice_sessions WHERE profile_id=? ORDER BY started_at DESC LIMIT 20` | `ix_practice_sessions_feed` |
| Band trend chart per skill (10) | `band_estimates WHERE profile_id=? AND skill=? ORDER BY created_at` | `ix_band_estimates_trend` |
| Current skill tiles (10) | `SELECT * FROM current_band_estimates WHERE profile_id=?` | view over `max(id)` group scan (small table) |
| Estimator input (10 §6) | `SELECT * FROM scored_attempts WHERE profile_id=? AND skill=?` | module-table PK joins + envelope indexes |
| Vocab due queue (08) | `srs_cards c JOIN vocab_entries e ON e.id=c.entry_id WHERE e.profile_id=? AND e.status='active' AND c.due_at<=? ORDER BY c.due_at LIMIT 50` | `ix_srs_cards_due` + `ix_vocab_entries_browse` |
| Bank search (08 §9) | `vocab_fts MATCH ?` joined back to `vocab_entries` | FTS5 index |
| Weakness detector: accuracy by question type (10) | `reading_answers GROUP BY qtype` (+ same for listening) | `ix_reading_answers_type`, `ix_listening_answers_type` |
| Full-Mock set picker, least-recently-served (04 §2, R2-21) | `card_sets WHERE retired=0 ORDER BY last_served_at LIMIT 1` | `ix_card_sets_pick` |
| Card picker, least-recently-served (04) | `speaking_cards WHERE part=? AND retired=0 ORDER BY last_served_at LIMIT 1` | `ix_speaking_cards_pick` |
| Prompt picker (05) | `writing_prompts WHERE task_type=? AND retired=0 AND difficulty=?` | `ix_writing_prompts_pick` |
| Worst pronounced words (09) | `pron_scores WHERE profile_id=? GROUP BY word HAVING avg(score)<60 ORDER BY avg(score)` | `ix_pron_scores_word` |
| Per-contrast drill accuracy (09) | `pron_drill_attempts WHERE profile_id=? GROUP BY contrast` | `ix_pron_drills_contrast` |
| Calibration regression set (14) | `llm_evaluations WHERE prompt_version=? AND model_id=? AND status='ok'` | `ix_llm_evals_calib` |
| Latest evaluation for a subject (04/05) | `llm_evaluations WHERE subject_kind=? AND subject_id=? ORDER BY created_at DESC LIMIT 1` | `ix_llm_evals_subject` |
| Today's plan (10) | `plan_sessions WHERE plan_id=? AND date=?` | `ix_plan_sessions_day` |
| Streak/heatmap (10 §7) | `daily_activity WHERE profile_id=? AND date>=?` | PK `(profile_id, date)` |
| Cache eviction scan (§9) | `media_files WHERE pinned=0 ORDER BY last_access_at LIMIT …` | `ix_media_evict` |
| Rewrite lineage (05 §8) | `writing_submissions WHERE parent_submission_id=?` | `ix_writing_submissions_parent` |

Everything else is PK lookups or small joins under WAL on a local NVMe — no further tuning
budgeted for v1; `EXPLAIN QUERY PLAN` checks for the queries above are part of the test suite
(14-testing-strategy.md).

## Open questions

1. **`llm_evaluations` polymorphic cleanup** — app-level delete + orphan sweep is the flagged
   default; if orphan bugs show up in practice, switch to per-subject nullable FK columns with
   cascade (schema-noisier but airtight). Decide after the first E2E deletion tests (14).
2. **Derived question rows vs source documents** — `reading_questions`/`listening_questions` are
   projections of `passage_json`/`script_json`; if a pack author hot-edits a document row via
   SQL, projections drift. Is import-time derivation + a `--repair` re-derive command enough, or
   do we want a checksum column and a startup consistency check?
3. **FSRS parameter optimization** — `srs_review_logs` snapshots enough state to re-fit FSRS
   weights per learner. Ship default weights only in v1, or include the optimizer (adds a torch
   dependency and a background job)? Leaning default-weights-only; 08 §4.4 / open Q3 decide with
   13-packaging-distribution.md.
4. **Media budget floor for low-disk machines** — 2 GB cache default is fine for typical laptops;
   should first-run detect free disk and scale the default (e.g. min(2 GB, 5% free))? Needs a
   packaging-time decision with 13-packaging-distribution.md.
5. **Multi-profile content generated by one profile** — generated content (`source='generated'`)
   currently has no owner and is visible to all profiles. Acceptable for a shared-machine family?
   If not, add nullable `created_by_profile_id` to content tables (cheap batch migration later).
6. **`scored_attempts` staleness of the writing criteria subquery** — the latest-evaluation
   correlated subquery runs per writing row; fine at desktop scale, but if the estimator ever
   goes hot-path, denormalize `criteria_json` onto `writing_submissions` (mirroring speaking).
   Revisit after the first `EXPLAIN QUERY PLAN` pass (14).
