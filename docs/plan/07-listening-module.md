# 07 — Listening module

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read [LISTENING-CONTENT.md](../LISTENING-CONTENT.md). Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.

_Status: draft v2 (2026-07-25)_

The Listening module reproduces the IELTS Listening test (4 parts, 40 questions, ~30 minutes of
audio + a 2-minute check step, identical for Academic and General Training) with one core
innovation: all audio is **TTS-generated from scripted dialogues**. A listening script is a JSON
document (speakers, lines, pauses, questions) rendered to a single WAV via Kokoro multi-voice
synthesis in the Python sidecar, stitched with pydub/ffmpeg, and cached by script hash in the media
cache. This makes practice material effectively unlimited (LLM-authored, text-validated via a
blind-answer agreement check like 06-reading-module.md), enables accent-switching drills (same
script, different voices) and a dictation mini-mode, and keeps everything local-first. Scoring is
deterministic and spelling-strict per real IELTS rules. Missed answers feed 08-vocabulary-srs.md.

Cross-references: 01-architecture.md (sidecar), 03-providers-and-settings.md (TTS provider),
06-reading-module.md (shared validation + scoring machinery), 08-vocabulary-srs.md,
10-curriculum-progress.md (band tracking), 11-data-model.md (canonical DDL),
13-packaging-distribution.md (content packs + Kokoro model shipping),
15-content-authoring-licensing.md, 18-api-contract.md (canonical route inventory, ticket auth,
job convention).

## 1. Test structure (fidelity target)

| Part | Format | Context | Speakers | Questions |
|---|---|---|---|---|
| 1 | Dialogue | Everyday social/transactional (booking, enquiry, form-filling) | 2 | 10 |
| 2 | Monologue | Everyday social (facility tour, event announcement) | 1 | 10 |
| 3 | Discussion | Academic/training (students + tutor discussing an assignment) | 2–4 | 10 |
| 4 | Lecture | Academic monologue on one subject | 1 | 10 |

- 40 questions, 1 raw point each, no penalty for wrong answers. Same test for Academic and GT.
- Audio duration target: 4.5–6.5 min per part, ~23–26 min total; with intra-part reading pauses
  and the check step the full experience is ~32–35 min.
- We model the **computer-delivered** test: answers are typed during listening, then a **2-minute
  check step** at the end (not the paper test's 10-minute transfer). Rationale: BandReady is
  screen-based; CD-IELTS is what a desktop app can faithfully simulate. (Default; flagged.)
- Each part's audio embeds the exam framing as synthesized speech: intro line ("Part 1. You will
  hear…"), "You now have 30 seconds to look at questions 1 to 5" pauses, and mid-part breaks —
  these are ordinary script lines spoken by a dedicated `narrator` speaker, so the rendered WAV is
  self-contained and exam-faithful.
- Difficulty ramps Part 1 → Part 4, and within each part. The generator prompt (§9) encodes this.

## 2. Listening script JSON schema

One script = one part. A full test row groups 4 script ids (see §11). Stored in
`listening_scripts.script_json`; JSON Schema enforced by Pydantic in `listening/schemas.py`.

```json
{
  "schema_version": 1,
  "part": 1,
  "title": "Booking a city cycling tour",
  "scenario": "A caller books a guided cycling tour; the agent collects personal details and explains options.",
  "accent_set": "uk",
  "target_band": 6.0,
  "speakers": [
    { "id": "narrator", "name": "Narrator", "voice": "bm_george",  "accent": "uk", "role": "narrator" },
    { "id": "s1", "name": "Agent (Karen)", "voice": "bf_emma",     "accent": "uk", "role": "female_1" },
    { "id": "s2", "name": "Caller (Tom)",  "voice": "bm_lewis",    "accent": "uk", "role": "male_1" }
  ],
  "lines": [
    { "speaker": "narrator", "text": "Part one. You will hear a man booking a cycling tour. First, you have thirty seconds to look at questions one to five.", "pause_after_ms": 30000 },
    { "speaker": "s1", "text": "Good morning, City Cycle Tours, Karen speaking.", "pause_after_ms": 300 },
    { "speaker": "s2", "text": "Oh hello. I'd like to book a place on one of your harbour tours, please.", "pause_after_ms": 250 },
    { "speaker": "s1", "text": "Of course. Could I take your surname first?", "pause_after_ms": 250 },
    { "speaker": "s2", "text": "It's Bramley. That's B-R-A-M-L-E-Y.", "pause_after_ms": 400 }
  ],
  "questions": [
    {
      "n": 1,
      "type": "form_completion",
      "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
      "word_limit": { "words": 1, "numbers": 1 },
      "prompt": "Surname: ______",
      "answers": [["bramley"]],
      "cue_line_index": 4
    },
    {
      "n": 6,
      "type": "multiple_choice",
      "instruction": "Choose the correct letter, A, B or C.",
      "prompt": "The tour departs from",
      "options": { "A": "the ferry terminal", "B": "the railway station", "C": "the market square" },
      "answers": [["B"]],
      "cue_line_index": 27
    }
  ]
}
```

Field rules:
- `speakers[].role` ∈ `narrator | female_1 | female_2 | male_1 | male_2` — abstract casting slots;
  `voice` is resolved from `role` × `accent` via the mapping table (§3) at render time, so scripts
  are portable across accents. An explicitly set `voice` wins (authoring override).
- `lines[].pause_after_ms`: 200–500 ms between conversational turns (default 300), 800–1500 ms at
  topic shifts, 20000–45000 ms for question-preview pauses. The renderer clamps to [0, 60000].
- `lines[].text` is plain text; spellings-read-aloud are written letter-by-letter with hyphens
  ("B-R-A-M-L-E-Y") — Kokoro pronounces hyphenated capitals as letters reliably.
- `questions[].answers` is a list of answer slots; each slot is a list of acceptable variants
  (lowercase canonical form). Single-answer questions have one slot. Multi-select MCQ ("choose TWO
  letters") uses one slot per required letter, order-insensitive (§5).
- `cue_line_index` points at the line containing the answer — used by practice-mode transcript
  highlighting and by the dictation mini-mode; not shown in exam mode.

## 3. Audio rendering pipeline (sidecar)

`listening/render.py`. Kokoro ONNX (`kokoro_onnx 0.5.0`, 24 kHz mono output) is the default local
TTS per decisions.md; any OpenAI-compatible TTS endpoint may be substituted (§7).

Pipeline per script:
1. Resolve voices: for each speaker, `voice = override or VOICE_MAP[accent][role]`.
2. Synthesize each line independently: `kokoro.create(text, voice=voice_id, speed=1.0)` → float32
   PCM @ 24 kHz. Lines are cached individually at
   `media/tts-lines/<sha256(voice + "\x00" + text)[:24]>.wav` so an edited script only re-renders
   changed lines.
3. Stitch with pydub: `AudioSegment` concat, inserting `AudioSegment.silent(duration=pause_after_ms)`
   after each line. Record per-line start offsets while stitching → timing sidecar JSON.
4. Loudness-normalize the stitched file with ffmpeg: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 24000 out.wav`
   (two-pass loudnorm is overkill for speech; single-pass default, flagged).
5. Write to media cache: `media/listening/<audio_hash>.wav` plus `<audio_hash>.timing.json`
   where `audio_hash = sha256(canonical_json(lines + resolved voices + schema_version))[:16]`.
   One WAV per script hash; changing accent set or any line text yields a new hash. Cache lookup
   before rendering makes replays and repeated tests free.

```json
// <audio_hash>.timing.json — drives practice-mode transcript sync
{ "lines": [ { "index": 0, "start_ms": 0, "end_ms": 8420 }, { "index": 1, "start_ms": 38420, "end_ms": 41080 } ] }
```

Rendering a full 4-part test takes roughly 30–90 s of CPU on Apple Silicon (Kokoro ONNX is ~5–10×
realtime); the UI shows a "Preparing audio…" progress state (job polling per 18-api-contract.md §3
— render is a `listening_render` job on cache miss) and renders parts in order so Part 1
can start while Part 4 finishes. Default-bank tests ship pre-rendered (§7) so first-run is instant.

### Voice mapping table (role × accent → Kokoro voice id)

Kokoro v1.0 ships American (`af_*`/`am_*`) and British (`bf_*`/`bm_*`) English voices only —
**there are no Australian Kokoro voices**. `accent: "au"` therefore falls back to British voices
and the UI labels the audio "Australian (approximated with British voices)"; true AU accents
require a cloud OpenAI-compatible TTS (§7). Defaults, flagged:

| Role | `uk` (British) | `us` (American) | `au` (fallback → uk) |
|---|---|---|---|
| narrator | bm_george | am_michael | bm_george |
| female_1 | bf_emma | af_heart | bf_alice |
| female_2 | bf_isabella | af_bella | bf_lily |
| male_1 | bm_lewis | am_adam | bm_daniel |
| male_2 | bm_daniel | am_eric | bm_fable |

The map lives in `listening/voices.py` as data (`VOICE_MAP: dict[str, dict[str, str]]`) so users
can override it in settings (03-providers-and-settings.md exposes it under an "Advanced" group).
Real IELTS mixes accents across parts; the default test template assigns `uk` to Parts 1/4, `us`
to Part 2, `uk` to Part 3 (default, flagged) and the accent-drill feature (§8) covers the rest.

## 4. Playback rules

| Capability | Exam mode | Practice mode |
|---|---|---|
| Plays | ONCE, auto-advances Part 1→4 | Unlimited replays |
| Pause / seek | Disabled (pause allowed only via "abandon test" confirm) | Full seek bar + 5 s skip buttons |
| Speed | 1.0× fixed | 0.75× / 0.9× / 1.0× / 1.1× / 1.25× (audio element `playbackRate`, `preservesPitch: true`) |
| Transcript | Never shown during test; available in review screen after submission | Hidden until the question is answered, then revealed with the cue line highlighted (timing sidecar) |
| Check step | 2:00 countdown after Part 4, answers editable, then auto-submit | No timer; submit anytime |

Enforcement is client-side only (single-user local app — the renderer simply doesn't mount seek
controls in exam mode); the attempt row records `mode`, which the `scored_attempts` view
(11-data-model.md §8.3, R2-7) maps to the estimator's weight class — full exam-mode test → `mock`,
other banded attempts → `practice`, dictation/accent-drill → `micro`. Only banded attempts feed
the predicted band in 10-curriculum-progress.md; unbanded practice attempts (raw score only, §7)
never do.

Player wireframe (exam mode):

```
+----------------------------------------------------------------------+
| Part 2 of 4          ● playing            Questions 11–20            |
|  ~~~~~~~~~~ waveform / progress (no seek) ~~~~~~~~~~   12:41 / 05:23 |
+-------------------------------+--------------------------------------+
| QUESTIONS (scrollable)        |  ANSWER SHEET                        |
|                               |   11 [ leisure centre   ]            |
| Questions 11–14               |   12 [ 1892            ]             |
| Complete the notes.           |   13 [                 ] ← focused   |
| Write NO MORE THAN TWO WORDS  |   14 [                 ]             |
| ...                           |   ...                                |
+-------------------------------+--------------------------------------+
```

## 5. Question types and scoring

Supported types (discriminated by `questions[].type`):

| type | Notes |
|---|---|
| `form_completion` | Part 1 staple; gap in a form field |
| `note_completion` | Gaps in notes; Parts 2–4 |
| `table_completion` | `prompt` carries a markdown table with `______` gaps; rendered as a grid |
| `sentence_completion` | Gap at sentence end |
| `multiple_choice` | Single answer (A–C) or multi-select ("choose TWO letters, A–E"): `select_n` field |
| `matching` | `options` = lettered list, several numbered items each map to one letter |
| `map_labelling` | Requires an SVG asset (`asset` field, e.g. `packs/core/maps/museum-plan.svg`); **curated content only** — LLMs cannot reliably author spatial maps, so generated tests never include this type (flagged limitation) |

### Deterministic scoring (shared normalizer: `sidecar/bandready/scoring/answers.py`)

The answer normalizer + matcher are ONE shared implementation at
`sidecar/bandready/scoring/answers.py` (R2-9), imported by this module AND 06-reading-module.md —
never duplicated. The normalization spec below is the canonical one (including the variant-aware
article rule in step 1, which R2-9 rules wins over 06's earlier unconditional strip); 06 conforms.
Listening-specific pieces (word-limit glue, `RAW_TO_BAND`) live in
`sidecar/bandready/listening/scoring.py`. Per real IELTS rules:
**misspelled answers are wrong** — there is no fuzzy matching in exam scoring. Steps:

1. Normalize user answer and every variant: lowercase → trim → collapse internal whitespace →
   strip surrounding punctuation (`.,;:!?"'`) → strip leading articles `a|an|the` **only if** every
   stored variant also lacks them (default: variants are authored article-free) → normalize
   hyphens/en-dashes to `-`.
2. Word-limit check: if `word_limit` present, count words (hyphenated compound = 1 word, numerals
   = numbers); over-limit ⇒ wrong even if it contains the right words (IELTS rule).
3. Exact match against the variant list ⇒ correct.
4. Number equivalence: `"20"` ≡ `"twenty"`, `"1892"` ≡ `"eighteen ninety-two"` — variants are
   authored to include both forms; the scorer additionally auto-equates pure-digit ↔ spelled-out
   integers 0–100 and 4-digit years as a safety net.
5. Multi-select MCQ / matching: set comparison, order-insensitive; each correct letter = 1 point
   in its own question slot (IELTS numbers them as separate questions).

Both US and UK spellings are acceptable (real IELTS accepts both): variants must include e.g.
`["centre", "center"]`. The generator prompt (§9) demands this; the validator checks it for a
hard-coded list of ~40 common -re/-er, -our/-or, -ise/-ize pairs.

Wrong-but-close answers (edit distance 1–2 from a variant) are scored wrong but tagged
`near_miss_spelling` in the attempt detail — this powers the "spelling leaks" review panel and the
SRS feed (§10) and dictation suggestions (§9).

## 6. Answer entry UX and check step

- **Type-as-you-listen answer sheet** (right panel, wireframe §4): one input per question number,
  Tab/Enter advances, auto-focus follows the audio position in practice mode (via
  `cue_line_index` + timing sidecar); in exam mode focus is purely manual, as in CD-IELTS.
- Inputs accept free text for completion types; MCQ/matching render as radio/checkbox groups but
  also accept typing the letter.
- After Part 4 audio ends, exam mode enters **Check (2:00)**: the four parts' answer sheets are
  shown as one 40-row grid, unanswered rows highlighted `warning`; countdown in the header;
  auto-submit at 0:00 or on "Submit now".
- Review screen (both modes): per-question row = your answer / accepted answers / cue-line excerpt
  with the answer phrase highlighted / transcript-jump link that seeks the (now unlocked) player.

## 7. Raw score → band conversion

Listening bands are identical for Academic and GT. IELTS does not publish an official table; the
partners publish indicative equivalences, which we use (default, flagged as indicative):

| Raw /40 | Band | | Raw /40 | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 18–22 | 5.5 |
| 37–38 | 8.5 | | 16–17 | 5.0 |
| 35–36 | 8.0 | | 13–15 | 4.5 |
| 32–34 | 7.5 | | 10–12 | 4.0 |
| 30–31 | 7.0 | | 8–9 | 3.5 |
| 26–29 | 6.5 | | 6–7 | 3.0 |
| 23–25 | 6.0 | | 4–5 | 2.5 |

Below 4 raw: band 2.0 and under — reported as "below 2.5". Table lives in
`sidecar/bandready/listening/scoring.py:RAW_TO_BAND` and is shared with the progress engine
(10-curriculum-progress.md). Practice-mode partial attempts report raw score only, no band.

## 8. Audio-quality risks, mitigations, accent drills

Risks and mitigations:
- **Kokoro naturalness limits**: flat prosody on long lectures, no true disfluencies, occasional
  number/abbreviation misreads. Mitigations: (a) generator writes short spoken-style sentences and
  spells out problem tokens ("nineteen ninety-two", letter-by-letter spellings); (b) per-line
  re-render makes fixing a bad line cheap; (c) authored scripts include natural fillers ("well,",
  "let me see…") which Kokoro renders acceptably.
- **No speaker overlap / interruption**: TTS stitching is strictly turn-based. Acceptable — real
  IELTS audio is also clean turn-taking. Not mitigated further in v1.
- **Same-voice fatigue**: role-based casting rotates concrete voices across a test's parts.
- **Higher realism**: settings allow pointing TTS at any OpenAI-compatible `/audio/speech`
  endpoint (03-providers-and-settings.md) — the renderer only needs `(text, voice) → wav`; the
  voice map then lists provider voice names instead of Kokoro ids. This is the path to genuine
  Australian/Indian accents and studio-quality audio.
- **First-run quality + latency**: the default content pack ships **pre-generated WAVs** for its
  test bank (rendered at pack build time with Kokoro; see 13-packaging-distribution.md and
  15-content-authoring-licensing.md), so out-of-the-box tests are instant and QA-listened.

**Accent training drills**: because voices resolve from `role × accent` at render time, "same
script, different accent" is just a second render with `accent_set` overridden → new audio hash,
same questions. UI: after any practice attempt, "Replay in American / British" button; the drill
view plays both versions of a chosen 30–60 s segment back-to-back. Attempts on re-accented scripts
are stored as practice attempts linked to the same script id.

## 9. Dictation mini-mode

Spelling practice built from existing scripts — no new content type:
- Source: lines whose text contains an answer phrase (`cue_line_index` lines), plus a curated
  "hard-spelling" pool (addresses, surnames, numbers, dates) authored in the content pack.
- Flow: play one line (replayable ×3, speed selectable) → user types the full sentence → diff
  against the true text (word-level LCS diff, case/punctuation-insensitive) → mistakes highlighted
  inline; per-word error counts persisted.
- A 10-item dictation session is auto-suggested when an exam attempt has ≥2 `near_miss_spelling`
  tags, seeded with exactly those words' cue lines.
- Misspelled words feed 08-vocabulary-srs.md (§10).

## 10. Script authoring / generation pipeline

`listening/generate.py` + `listening/validate.py`. Uses the single configured LLM
(03-providers-and-settings.md). Two-step: generate, then validate **via text** — a blind-answer
agreement check identical in spirit to 06-reading-module.md (no audio round-trip needed: if the
questions are answerable from the script text by a model that never saw the answer key, they will
be answerable from faithful TTS audio of that text).

Generation prompt (verbatim template, `listening/prompts/generate_part.txt`):

```
You are an expert IELTS listening-test author. Write an ORIGINAL Part {part} listening script
and questions. Never reproduce or imitate any real past-paper content.

Requirements:
- Context: {context_description}   # from the part table, e.g. "everyday transactional dialogue, 2 speakers"
- Topic: {topic}
- Target difficulty: band {target_band}
- Speakers: use exactly these speaker ids: {speaker_ids}. Include a "narrator" speaker who reads
  the exam framing: part introduction, "You now have thirty seconds to look at questions N to M"
  (use pause_after_ms 30000 on that line), and mid-part question-preview breaks.
- Length: 55-75 dialogue lines (excluding narrator), 4.5-6.5 minutes when spoken.
- Write for the EAR: short sentences, contractions, natural fillers. Spell out numbers that must
  be dictated ("double four seven") and spell names letter-by-letter with hyphens ("B-R-A-M-L-E-Y")
  the first time they answer a question.
- Include the standard IELTS distractor pattern: for at least 4 questions, a plausible wrong
  answer is mentioned first and then corrected or superseded ("...actually, make that Thursday").
- Questions: exactly 10, numbered {q_start}-{q_end}, using only these types: {allowed_types}.
  Every answer must be spoken verbatim (or as a number) in exactly one line; set that line's index
  as cue_line_index. Answers appear in question order. Respect the stated word limit.
- answers: give every acceptable variant, lowercase, including both UK and US spellings and both
  digit and word forms of numbers.

Return ONLY JSON matching this schema, no commentary:
{schema_json}
```

Validation passes (all must pass or the script is regenerated, max 3 attempts, then surfaced to
the user as "generation failed" — the `listening_generate` job ends in state `error` with code
`validation_error`, 18-api-contract.md §3):
1. **Schema + lint**: Pydantic parse; 10 questions; answers-in-order; every `cue_line_index`
   line actually contains an answer variant as a substring (after normalization); narrator pauses
   present; line count and estimated duration (chars ÷ 15 chars/s heuristic) within range;
   UK/US variant pairs present for the known-pairs list (§5).
2. **Blind-answer agreement**: a second LLM call receives ONLY the dialogue lines (no answers, no
   cue indices) plus the questions, and answers them. Prompt
   (`listening/prompts/blind_answer.txt`): "You are a strong IELTS candidate. Using only the
   transcript below, answer questions {q_start}-{q_end}. Return JSON {"answers": {"<n>": "<answer>"}}."
   Score with the real scorer; require **≥ 9/10 agreement**. Below that, the questions are
   ambiguous or unanswerable — regenerate.
3. **Distractor sanity (MCQ only)**: blind answerer must not be told options are shuffled; a third
   micro-check asks the LLM to quote the transcript line justifying each MCQ answer and verifies
   the quote exists in the script.
4. **Render smoke test**: synthesize line 0 and the longest line; assert non-empty PCM.

Full tests are assembled from 4 validated part-scripts sharing a topic-diversity constraint (no
two parts on the same topic). The default bank's scripts went through the same pipeline plus
human listen-through at pack build time (15-content-authoring-licensing.md).

## 11. Data model (summary — canonical DDL in 11-data-model.md §3/§4.5)

11-data-model.md v2 owns the DDL; this doc's earlier INTEGER-PK sketch is superseded (11 §1).
Canonical shape, summarized:

- **`listening_scripts`** — TEXT PK (authored slug for pack rows, ULID for generated), `part`,
  `title`, `topic_id → topics`, `accent_set uk|us|au`, `target_band`, `script_json` (the §2
  document), `audio_hash → media_files(hash)` (NULL until first render, §3), plus the shared
  pack-provenance columns (`source pack|generated|user`, `pack_id`, `pack_version`, `license`,
  `retired`).
- **`listening_questions`** — flattened one-row-per-numbered-question projection of
  `script_json`, generated at import/generation time (`script_id`, `number`, `qtype`,
  `word_limit`, `answers_json` pre-expanded variant set, `cue_line_index`, `explanation`) so
  per-type accuracy can be aggregated across attempts.
- **`listening_tests`** — `title` + `p1_id..p4_id` FKs to scripts, plus pack cols.
- **`listening_attempts`** — envelope-PK row (its `id` IS the `practice_sessions.id`, 11 §4.1),
  `test_id|script_id` (exactly one), `mode exam|practice|dictation|accent_drill`,
  `status in_progress|submitted|abandoned`, `raw_score`, `total_questions`, `band` (NULL unless a
  banded conversion applies), `duration_s`, `submitted_at`.
- **`listening_answers`** — one row per answered question (`question_id`, `given`, `normalized`
  — output of the shared normalizer (§5), `correct`, denormalized `qtype`); replaces this doc's
  earlier `answers_json` blob so the weakness detector can aggregate by type.

Media cache (outside SQLite, under the data dir — canonical tree in 11 §9, R2-18):
`media/listening/<hash>.wav`, `<hash>.timing.json`, `media/tts-lines/<hash>.wav`. Generated/cache
audio is LRU-pruned to the `media.cache_budget_mb` budget (2 GB default, flagged — 11 §9's
eviction policy; eviction NULLs `listening_scripts.audio_hash`, re-render is idempotent);
pack-shipped WAVs live in the read-only pack directory (`pinned=1`) and are never pruned.

### API routes (canonical inventory: 18-api-contract.md §4.10/§4.16 — R2-1)

All routes live under `/api/v1`, bearer-authenticated per 18 §1. Generation and rendering are
long-running, so they follow the job convention (18 §3: `202 Accepted` + `GET /api/v1/jobs/{id}`
polling):

```
POST /api/v1/listening/generate            {part?, topic?, target_band?, accent_set?} → 202 {job_id}
                                           (kind listening_generate; §10 validation failure ends the
                                            job in state error with code validation_error)
POST /api/v1/listening/tests/generate      {target_band?} → 202 {job_id}  (4 scripts)
POST /api/v1/listening/scripts/{id}/render {accent_set?} → 200 {audio_hash} on cache hit
                                           | 202 {job_id}  (kind listening_render)
GET  /api/v1/listening/tests/{id}          → test + scripts (answers stripped unless ?with_answers=1)
POST /api/v1/listening/attempts            {test_id|script_id, mode, answers} → 200 scored attempt
GET  /api/v1/media/listening/{hash}.wav          → audio (ticket auth; Range-capable for practice seek)
GET  /api/v1/media/listening/{hash}.timing.json  → timing sidecar (ticket auth; bearer also accepted)
```

The `<audio>` element cannot set an `Authorization` header, so media URLs carry a short-lived
signed ticket instead: the renderer calls `POST /api/v1/tickets` (bearer, audience `media-read`,
resource = the exact media path) and appends `?ticket=` to the URL (R2-2; mechanism specced in
18 §2).

### Module file tree (repo layout per 01 §7, binding — R2-9)

```
sidecar/bandready/scoring/answers.py   # SHARED answer normalizer + matcher (R2-9) —
                                       #   ONE implementation imported by listening AND reading
sidecar/bandready/listening/
  __init__.py
  schemas.py      # Pydantic models for §2
  voices.py       # VOICE_MAP + resolution
  render.py       # kokoro/openai-compat synth, pydub stitch, ffmpeg loudnorm, cache
  scoring.py      # word-limit glue + RAW_TO_BAND; imports the normalizer from bandready.scoring.answers
  generate.py     # LLM generation, 3-attempt loop
  validate.py     # lint + blind-answer + distractor checks
  router.py       # FastAPI routes above (18-api-contract.md)
  prompts/generate_part.txt
  prompts/blind_answer.txt
app/src/features/listening/
  ListeningHome.tsx  ExamPlayer.tsx  PracticePlayer.tsx  AnswerSheet.tsx
  CheckStep.tsx  ReviewScreen.tsx  DictationDrill.tsx  AccentDrill.tsx
  store.ts        # feature-local attempt-in-progress state (R2-23; never in the global stores)
```

## 12. SRS integration (08-vocabulary-srs.md; suggested-inbox model per R2-5)

After every scored attempt, the module emits SRS **candidates** — these land in the vocabulary
suggestion inbox as `vocab_entries` rows with `status='suggested'` and **no** `srs_cards` row;
nothing is ever auto-scheduled. Scheduling happens only when the learner accepts a suggestion in
the inbox UI (04 §8 / 05 §10's consent model wins; 08 conforms). Candidates:
- every wrong completion-type answer → the **correct** word/phrase, with the cue-line sentence as
  its example context and card type `listening_gap`;
- every `near_miss_spelling` tag → card type `spelling` (the SRS front plays the cue line's TTS
  audio — reusing the cached per-line WAV — and asks for typed spelling; effectively a one-item
  dictation);
- dictation-mode per-word errors ≥2 occurrences → `spelling` card.

Dedup and scheduling are owned by 08-vocabulary-srs.md; this module only POSTs candidates in
batch to `POST /api/v1/vocab/suggestions` (18-api-contract.md §4.11):
`{items: [{term, sentence_context, source: {kind: "listening", item_id}, audio_line_ref?,
card_type?}]}` — the extra fields ride along for 08's card rendering.

## Open questions

- Should exam mode optionally simulate the **paper** test (10-minute transfer, answers written
  only after audio) for candidates taking paper-based IELTS, or is CD-only fidelity enough for v1?
- Kokoro `speed` parameter vs. browser `playbackRate` for slow practice audio: pre-rendering a
  0.85× variant sounds more natural than browser time-stretch but doubles cache size — worth it?
- Map/plan labelling in generated tests: is there a viable constrained generator (LLM emits a
  small grid/graph DSL we render to SVG deterministically), or does this stay pack-curated forever?
- Does the blind-answer agreement threshold (≥9/10) need to vary by part? Part 3/4 inference
  questions may legitimately sit at 8/10 with a strong script; needs measurement once the
  generator runs against real local models (14-testing-strategy.md eval harness).
