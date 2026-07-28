# L-D1 — Teaching-grade listening content: schema, audio contract, clusters, features

**Status:** the authoring contract. Six authoring agents (L-A1–L-A6), one verify/merge agent and the
feature agents build to this document. Where this document and a research briefing disagree, **this
document wins** — it has already reconciled them, and §0.6 lists every place it overrode research.

**Companion artefact:** [`TEMPLATE.json`](TEMPLATE.json) — one complete Part 2 script: 22 lines,
10 questions, three question groups, a map-labelling group, a spelled-aloud answer, a self-correction,
and the full teaching payload at all three levels. **Read it before you write anything.** It is the
ceiling and the floor.

**Inputs:** `research/01-question-types.md` (R1), `02-sections-accents-delivery.md` (R2),
`03-strategy-and-bands.md` (R3), `04-pedagogy-and-audio.md` (R4). Section references are to those
files. `staging-reading/DESIGN.md` is the closest analogue and its *discipline* is reused; its
*shapes* are not, for the reason in §0.2.

---

## 0. What we are building and why

### 0.1 The measured starting point

Read on 2026-07-28 from `content/core-en/data/listening_scripts.jsonl`, `listening_tests.jsonl` and
`manifest.json`:

| | |
|---|---|
| Tests | **1** (`lt_test_1`) |
| Script rows | **4** (`ls_t1_p1`…`ls_t1_p4`) |
| Questions | **40** |
| Accents | `uk` ×3, `us` ×1. **No `au` row exists** |
| Types in use | `note_completion` 17, `matching` 10, `multiple_choice` 7, `form_completion` 6 |
| Types with **zero** content | `table_completion`, `sentence_completion`, `map_labelling` — all three fully supported by renderer *and* scorer |
| Teaching payload | one `explanation` string on some questions. **Nothing else.** No prediction, no signpost, no trap label, no distractor record, no per-group strategy, no per-script coaching |

The UI is far ahead of the content. `app/src/features/listening/` already ships `TestRunner`,
`PartPlayer`, `AnswerSheet`, `CheckStep`, `ReviewScreen`, `TranscriptPanel`, `AccentDrill`,
`MapAsset`, `SpellingNotice`, `PrepareAudioPanel`, `QuestionBlock`, `RecentAttempts`. Not one of
those is blocked on engineering. They are blocked on content that has something to say.

**This push takes the bank to 10 tests · 48 script rows · 480 questions**, every one of them
carrying a teaching payload, plus a full retrofit of the four existing scripts. That lets the app do
nine things it cannot do today:

1. tell a learner, **before the audio plays**, what *kind* of word each gap needs and why — from the
   printed grammar around it, which is the highest-yield technique in the paper (R3 §5);
2. name the **signpost** that announced each answer, and store its line index, so "how was I
   supposed to know it was coming" has a concrete answer;
3. record the **decoy** — the wrong value the speaker actually offered — with its line index, so the
   review screen can play the wrong line and the right line **back to back**. That is listening's
   equivalent of the reading module's distractor autopsy and it is the single highest-value review
   feature available to us (R3 §7);
4. separate **form loss** from **comprehension loss** in the results, because a misspelt answer and a
   missed answer need completely different remedies and today they are one number;
5. name the **recovery** handhold for the item after a hard one, because one miss costs four marks
   and four marks is the whole 6.5→7.0 gap (R3 §8.1);
6. hand each question group the strategy for *that task on this script*, plus the order badge;
7. run a **preview-pause drill with no audio at all** — show the task, run 30 seconds, ask the
   learner to slot-type every gap, score against the authored `prediction.slot`;
8. run **dictation, number-and-spelling, signpost and recovery drills** off content we already have;
9. sit a **mock under computer-delivered timing** — audio once, typed answers, a 2-minute check —
   with the coaching absent from the response body, not hidden behind a renderer flag.

Every field below serves one of those nine. A field serving none of them was cut.

### 0.2 Listening teaches differently — the payload is a TIMELINE, not a location

Speaking and Writing teach through band-graded model answers because the learner produces language.
Reading teaches through worked solutions because the text stays on the page and can be re-read.
**Listening's audio plays once and then is gone.** A worked solution that says "the answer was at
line 34" is a post-mortem: the learner already knows they missed line 34. What they do not know is
why their ear did not stop there.

So the payload is organised as the four moments around every answer, plus a fifth axis that has no
equivalent in reading at all:

```
   BEFORE                  APPROACH             THE MOMENT            AFTER
   ───────────────────────────────────────────────────────────────────────────────
   prediction              signpost             answer_quote          recovery
   what class of thing     the marker that      + distraction         the next handhold
   can fill this gap?      announces it         (decoy + line)        if you lost this one
   ───────────────────────────────────────────────────────────────────────────────
   §1.1                    §1.2                 §1.3 / §1.5           §1.7

                              ┌──────────────────────────┐
                              │  FORM — §1.6             │
                              │  heard right, written    │
                              │  wrong. Counted apart.   │
                              └──────────────────────────┘
```

**There is no model answer in this module and there must never be a field pretending to be one.**

Three rules fall straight out of the once-only constraint and govern everything below:

- **Nothing may depend on re-hearing.** A teaching note whose advice is "listen again more carefully"
  fails review. Every note must name something the learner could have done *at that instant* or *in
  the pause beforehand*.
- **Roughly 90% of a part contains no answer.** The marks live in ten 2–4 second bursts (R3 §3.4).
  Prediction tells the learner what the burst will sound like; the signpost tells them it is
  starting. Together they convert an impossible 6-minute vigilance task into ten sustainable ones.
  Every payload field exists to serve that conversion.
- **The answers arrive in order; the words do not** (R1 §3.4). Nothing in listening scatters. That
  single fact is the spine of the module and it must be stated in exactly those terms.

### 0.3 Copyright — non-negotiable, read it twice

- The exam **format, timing, question types, instruction-line patterns, answer-format rules, the
  raw-score-to-band table, the announcer's move sequence and the situation types that recur** are
  facts about a public test, published by the test owners for candidates. Use them freely.
- **Every script, every line of dialogue, every question, every option, every map, every answer key
  and every teaching note in our bank is authored from scratch.** Never transcribe from a past paper,
  a Cambridge volume, a practice site, a prediction list, a coaching PDF or a YouTube walkthrough.
- **The do-not-write list** (situations the researchers read in official samples — R1 §0.1): a
  shipping-agency quotation call; an insurance-tier choice on a shipping call; a "how to meet people
  in a new country" talk; an Open-University-shaped distance-study discussion; a five-hotels
  tourist-office matching task; **any library tour**, and specifically any plan with a librarian's
  desk by the entrance; an arts-centre radio feature with a day/time/event/venue/price table. The
  question *shapes* are free; those situations are not.
- Invent every proper noun. Keep the house convention already in the pack (Verdon, Norland, Ashfield,
  Sandmouth, Marlow, Brackenfield, Fairhaven, Northgate) so the bank reads as one world. No real
  organisations, no real people, no real published statistics, no real place that could be looked up.
- **Self-check on every sentence before you commit it:** did I read or hear this sentence somewhere?
  If there is any doubt at all, throw it away and write a different one on the same subject.
- Product copy says **"IELTS-style"** and carries the non-affiliation notice.

**Claims in circulation that must never appear in our content or copy:**

| Claim | Why it is banned |
|---|---|
| "58% of test-takers score 5.5–6.5" · "67% are stuck at 6.0–6.5" | Commercial blogs only, no traceable source (R3 §13.6) |
| "Candidates score 0.5–0.8 marks fewer per question in Part 4" attributed to Cambridge 2024 data | Dimensionally incoherent on a 1-mark-per-question paper; dataset untraceable (R2 §2.4) |
| "The test now uses South Asian / African / East Asian accents" · "background noise" · "new You-Are-Here markers" | 2026 SEO pages; ielts.org's live page (fetched 2026-07-28) still lists four native varieties and no board announcement exists (R2 §5.5) |
| "The example question was removed in 2023" | It was removed **4 January 2020** (R2 §6.3) |
| Any per-type frequency percentage ("matching appears in 60% of tests") | No published frequency data exists (R1 §8.1) |

Safe learner-facing frequency phrasing: *"appears in most papers"*, *"nearly always in Part 2"*,
*"less common"*.

### 0.4 Hard compatibility constraints (violating these breaks the running app)

Verified 2026-07-28 against `sidecar/bandready/content/validate.py`, `content/loader.py`,
`scoring/answers.py`, `audio/tts_render.py`, `audio/stitch.py`,
`server/routes/listening.py`, `server/routes/media.py` and `app/src/features/listening/`.

| Constraint | Why |
|---|---|
| `ListeningScriptRow` keys are exactly `id, part, title, topic_id, accent_set, target_band, script_json, audio_hash` | `validate.py:206`. `_Row` is `extra="allow"` so an extra key validates — but `TABLE_COLUMNS["listening_scripts"]` (`loader.py:166`) copies only these eight, so **any extra top-level key is silently dropped at import**. Never put teaching data on the row |
| **All teaching data lives inside `script_json`** | `script_json` is a whole-blob JSON column. Anything inside it survives the loader and the DB unchanged. This is why listening needs no migration |
| `part` ∈ 1–4; `accent_set` ∈ `{uk, us, au}` | `ListeningScriptRow._part`, `._accent` |
| `ListeningTestRow` keys are exactly `id, title, p1_id, p2_id, p3_id, p4_id` | `validate.py:231` + `loader.py:171`. **A test row cannot carry a payload.** See §4 — per-test teaching is derived, never authored |
| Every question needs an integer `n` and a non-empty `answers[]`; numbers unique **within a row** | `validate_relations`, `validate.py:483–492` |
| Question numbers run **1–40 across a test**, 1–10 per part | Not enforced by the validator; it is a merge-gate lint (§9.4 lint 9). `_renumber` (`listening.py:248`) silently re-indexes 1..N if numbers collide across the four parts, which would desynchronise the narrator's spoken "questions eleven to twenty" from the answer sheet |
| `script_json.questions[]` is a **flat array**. There is no `question_groups` key | `iter_listening_questions`, `validate.py:533`. §2 adds a parallel `groups[]` index that does **not** replace it |
| The UI groups questions by the **`(instruction, type)` pair of consecutive questions** | `qtypes.ts:146 groupQuestions()`. Two questions that should share a strategy card must carry byte-identical `instruction` and `type`, and must be adjacent in `questions[]`. §9.4 lint 12 |
| **`options` is the switch between a letter input and a text input** | `QuestionBlock.tsx:44` — `isLetterQuestion = optionEntries(question.options).length > 0`. A completion question carrying a stray `options` key becomes an unanswerable letter picker. §9.4 lint 13 |
| A map asset is hoisted to the group **only when every question in the group serialises its `asset` identically** | `AnswerSheet.tsx:33` compares `JSON.stringify(q.asset)`. Different key order on one question renders the plan once per question. §9.4 lint 24 |
| `instruction` is what the learner sees, so it must carry the limit — but the limit sentence is **generated, not written** | `_public_script` passes the authored `instruction` straight through; nothing renders the limit server-side today. So `instruction` = *task line* + `" "` + the exact output of `instruction_for(word_limit)` (`answers.py:425`, shared with reading), and lint 12b checks the suffix matches byte for byte. This kills the commonest bug in the format — an instruction saying ONE WORD over a two-word key |
| `{"words": N}` alone means **`numbers_allowed: True`** | `word_limit_of()` defaults it. To get *"NO MORE THAN TWO WORDS"* with no number allowance you must author `{"words": 2, "numbers": 0}`. Executed and confirmed |
| Spelling variants are **not** inferred at match time | `answers.py:512`. `answers_match('center', ['centre'])` is **False** (executed, R3 §13.8). Every US/UK pair must be authored explicitly |
| Letter answers are stored as `"B, D"` and split on commas | `qtypes.ts:55 joinLetters`; the sidecar splits |
| `pause_after_ms` is clamped to **[0, 60000]**; default 300 when absent | `stitch.clamp_pause`, `MAX_PAUSE_MS`; `tts_render.py:518` |
| `audio_hash` is derived from `{schema_version, accent_set, lines:[{voice, text, pause}]}` only | `tts_render.script_audio_hash`. **Editing a title, a question or any teaching payload does not invalidate the render.** Editing one character of `lines[].text`, a `pause_after_ms` or a voice re-renders that line only |
| Row ids unique across the whole file | `validate_rows` rejects a duplicate and the pack fails **whole** |

`script_json.schema_version` goes from `1` to `2` on every row carrying a teaching payload — new and
retrofitted alike. Consumers must treat every teaching field as **absent-by-default**.

### 0.5 THE DELIVERY BLOCKERS — read before writing a single row

Content ships with no migration. But eight code facts stand between the content and the learner, and
two of them mean the mock is defeatable today. **Content agents do not make these changes.** Author
as specified and report the dependency.

**L-D1 — the teaching payload is never served, at all. This is the opposite of reading's problem.**
Reading serves the whole `passage_json` blob and therefore needs *stripping*. Listening builds every
response field-by-field from an **allowlist** and therefore needs *adding*:

- `_public_script()` (`listening.py:200–232`) constructs each question from a fixed key list —
  `id, number, source_number, type, instruction, prompt, options, select_n, asset, word_limit, slots`,
  plus `answers, cue_line_index, explanation` when `with_answers`. Nothing else in the authored
  question object reaches the client, ever.
- `derive_listening_questions()` (`loader.py:331`) projects only
  `number, qtype, word_limit, answers_json, cue_line_index, explanation` into `listening_questions`.
- `review_attempt()` (`listening.py:1018`) builds each review question from that DB row plus
  `meta` — which *is* the authored question object, read straight out of `script_json`.

So the fix is small and lands in one place. In `review_attempt`, the per-question dict gains:

```python
"teaching": meta.get("teaching"),
```

and the per-part dict gains `"teaching": document.get("teaching")` plus
`"groups": document.get("groups")`. That is three lines and it delivers the whole payload **only**
through the review endpoint, which is exactly the gate we want — no stripping logic required
anywhere. **Every teaching field in this document therefore lives under one key named `teaching`**,
at each of the three levels, so the projection is one `get()` per level.

**L-D2 — the review endpoint has no submitted check, and `?with_answers=1` has no gate at all.**
`review_attempt` (`listening.py:1018`) loads the attempt and returns the full transcript, the
accepted answers and the explanations **without looking at `attempt.status`**. And
`GET /scripts/{id}?with_answers=1` / `GET /tests/{id}?with_answers=1` (`listening.py:367`, `:378`)
are behind `require_auth` and nothing else. During an exam-mode attempt, any client — including the
running renderer — can fetch the key and the transcript for the test it is sitting. Required:

```
GET /listening/attempts/{id}/review        → 409 unless attempt.status == "submitted"
GET /listening/scripts/{id}?with_answers=1 → 403 unless this profile has a SUBMITTED attempt on it
GET /listening/tests/{id}?with_answers=1   → 403 unless this profile has a SUBMITTED attempt on it
```

Everything in §10 F1 depends on this. It is a release blocker, not a nicety.

**L-D3 — the AND/OR A NUMBER allowance is dropped between the loader and the scorer, while the UI
advertises it.** `loader.py:350` keeps only `word_limit["words"]`; `listening.py:656` then uses
`count_words()` instead of the correct `within_word_limit()` that already sits at `answers.py:395`
and handles the clause properly. Meanwhile `qtypes.ts:79` renders the label *"ONE WORD AND/OR A
NUMBER"* from the same folded integer. **The UI promises an allowance the scorer refuses.** Fix:
carry `{max_words, numbers_allowed}` through the loader and call `within_word_limit()`.
**Until it lands, prefer gaps whose answer is a bare number or a bare word**, and never key a value
that needs the allowance (`363 days`) unless you also raise `words` — which mislabels the group.

**L-D4 — "in either order" cannot be expressed.** Each question is scored independently against its
own `answers[]` (`listening.py:864`), so a bulleted two-mark list can only be keyed by double-counting
(marking `books` in both boxes 2/2) or positionally (marking a correct learner 0/2). Minimal fix: a
group-level `either_order: [6, 7]` plus a set-match pass in `_submit`. **Until it lands, author no
either-order groups.** Prefer two questions with genuinely different stems; never
*"the first thing mentioned"* / *"the second thing"*, which is bad item writing.

**L-D5 — `MapAsset`'s missing-asset copy is wrong for letter maps.** `MapAsset.tsx:43` says
*"The audio still names each location, so you can answer from what you hear."* True for Format B,
**false for Format A** — without the plan you cannot know which position is `H`, and the item is
silently unanswerable. Until the copy is made conditional on `options` being present,
**author Format A only when the asset is confirmed to ship** (§7.3).

**L-D6 — `tts_render.py:295` hardcodes `lang="en-us"` for every voice, including all eight British
ones.** Measured (R4 §8.7): the TRAP–BATH split, rhoticity, the LOT vowel and final schwa are all
wrong, and `Z.` renders as **"zee"** instead of "zed" — so a British enrolments officer currently
spells a surname in an American alphabet. One-line fix: derive lang from the `bf_`/`bm_` prefix.
**It does not change `audio_hash`**, so caches must be invalidated explicitly (bump
`schema_version` on affected rows, or clear `media/tts-lines/`).

**L-D7 — two casts in `VOICE_MAP` are unusable for dialogue.** Measured F0 (R4 §7.3):
`au/male_1 = bm_daniel` (131.5 Hz) and `au/male_2 = bm_fable` (124.4 Hz) are **7 Hz apart** — a
two-male Australian Part 3 is effectively one voice — and `au` shares its narrator `bm_george` with
`uk`, so the accent drill opens on an identical voice. **New this document:** `us` is just as bad —
`us/narrator = am_michael` (125.3) vs `us/male_1 = am_adam` (132.6) is **7 Hz**, and
`us/female_1 = af_heart` (201.7) vs `us/female_2 = af_bella` (210.5) is **9 Hz**. §6.2 gives the
recast. This matters because the accent drill's forced re-render **overrides every authored voice**
(`resolve_voice(..., forced=True)`), so an authored cast cannot rescue a bad `VOICE_MAP` row.

**L-D8 — `short_answer` and `summary_completion` are absent from `ListeningQuestionType` and
`TYPE_LABELS`, and `LAYOUT_TYPES` (`qtypes.ts:16`) is exported and imported by nothing.** The first
is cosmetic — the renderer branches on data shape, not on the slug, so both types render correctly
and only the badge is auto-generated from `type.replace(/_/g, " ")`. The second is dead code; do not
reason from it.

**Reported, not fixed:** `stitch.estimate_speech_ms` assumes a flat 15 chars/sec where the measured
range is 3.9 (digit-heavy) to 19.3 (prose), so any lint using it for exam timing will pass parts that
are minutes too long (R4 §7.5); trailing silence varies 97–538 ms by voice so authored pauses are
lower bounds (R4 §7.4, fix once in `stitch`); `_score_question` calls `answers_match()` with no
`question_type` (`listening.py:668`), so letter answers take the free-text branch and single letters
work by accident; `raw_to_band` collapses everything below raw 4 to band 2.0 where the published
scale gives 1.0; `expand_variants(['km/h'])` yields `['km/h','km','h']`, so a one-letter answer
scores against a unit key (never put `/` inside a unit in a key).

### 0.6 Where this document overrides the research

| # | Source said | This document says | Why |
|---|---|---|---|
| 1 | Three trap vocabularies: R1 §6 (~30 slugs, 6 families), R3 §7 (L1–L14), R4 C-9 (5 kinds) | **One closed 24-slug enum for `distraction.trap`** (§5.1), plus a separate 6-slug `form.risk` enum (§5.2) and a 4-slug **derived-only** process enum the app computes and nobody authors (§5.3) | Three vocabularies means the content, the review picker, the drill filter and the LLM prompt cannot aggregate. And form errors and cascades are not distractions — mixing them into one list is what makes a "trap profile" unreadable |
| 2 | R1 §2.6 proposes `prediction.expects` (13 values); R3 §5.2 proposes P1–P14 | **One 14-slug enum with readable names**, P-codes kept as documentation (§5.4) | Same reason. R3's set is the superset; readable slugs survive better than codes |
| 3 | R1 §7.2 proposes `signpost.kind` (9 values); R3 §6 proposes SG-A…SG-E | **11 kinds** (§5.5), with `dictation` split out of SG-A | The dictation cue is the one signal that means *stop comprehending, start transcribing*. Folding it into "imminent" loses the highest-value instruction in Part 1 |
| 4 | Task brief: "PER TEST: the raw-to-band table and a pacing plan" | **Derived, never authored** — §4 | `ListeningTestRow` has six columns and `TABLE_COLUMNS` drops extra keys. The band table is a constant already implemented and already correct; the pacing plan is a pure function of the four parts' authored pause plans |
| 5 | R1 §3.2 gives a per-type order table | **`answer_order` is the constant `"sequential"` for every listening group**, lint-checked to that value (§2.1) | Officially, nothing in Listening scatters (R1 §3.1). The field survives because it drives a UI badge and because the *contrast with Reading* is one of the most useful things we can teach |
| 6 | R1 §4.4 wants a flow-chart component; R1 §4.6 wants a `summary_completion_bank` slug | **Neither.** Flow charts ship as `note_completion` with an arrow-chain layout; banked summaries ship as `matching` with a lettered word bank (§7.2) | The renderer branches on data shape. Both render correctly today and neither is worth blocking 480 questions on |
| 7 | R2 §12.1 asks whether we ship an `nz` accent set | **No.** `accent_set` stays `{uk, us, au}` — the validator only accepts those three — and NZ is covered in the teaching layer plus the `au` lexis contract | A fifth approximated set costs more credibility than it returns, and adding one is a schema change |
| 8 | R2 §10.2 recommends relabelling `au` as an Australian *variety* set | **Adopted as an authoring contract** (§6.3), and the `ACCENT_LABELS` change is reported, not made | The label is not our path. The contract is, and it is where the value is |
| 9 | R3 §12.2: "author both singular and plural whenever the frame permits both" | **Only where the frame genuinely permits both.** Where it does not, key one form and say so | Keying leniency the exam does not grant teaches a wrong habit — the same rule reading adopted after finding `{"value":"generation","note":"singular accepted"}` in its bank |
| 10 | R1 §4.1: "spell out every proper noun that is an answer… with hyphens (`B-R-A-M-L-E-Y`)" | **Dots and spaces, never hyphens** (§6.4) | R4 §8.1 measured it: hyphens are stripped and the letter names concatenate into a pseudo-word. ASR heard `O-K-A-F-O-R` as *"OK FOA, or CAFA"*. R1 was written before the measurement |
| 11 | Plan `07-listening-module.md` §10: "at least 4 questions per part carry a correction pattern" | **A distribution requirement instead** (§3.3): per part ≥1 correction-family, ≥1 raised-then-dropped, ≥1 lexical, ≥1 negation-or-unasked, and **4–6 trapped items, never ten** | A part built entirely on self-correction teaches one reflex and no discrimination; a part where every item is a trap trains paranoia and produces learners who overwrite correct answers (R3 §7) |

---

## 1. The per-question `teaching` object

Lives at `script_json.questions[].teaching`. Fields marked **REQ** are lint-enforced. Limits are in
**words** unless stated. Everything is JSON-serialisable.

```jsonc
"teaching": {
  "schema_version": 1,                 // REQ — always 1
  "prediction":   { … },               // REQ — §1.1
  "signpost":     { … },               // REQ — §1.2
  "answer_quote": "<verbatim>",        // REQ — §1.3
  "paraphrase_link": { … } | null,     // REQ on completion types; null only when the stem's
                                       //   anchor word is spoken verbatim — §1.4
  "distraction":  { … } | null,        // REQ key, null value allowed — §1.5
  "form":         { … } | null,        // REQ key; non-null when the answer is a name, number,
                                       //   date, unit or a plural-sensitive noun — §1.6
  "recovery":     "<≤25 words>" | null,// REQ key — §1.7
  "option_diagnosis": [ … ]            // REQ for letter types, forbidden otherwise — §1.8
}
```

The existing question fields are unchanged and all stay **REQ**: `n`, `type`, `instruction`,
`word_limit`, `prompt`, `answers[]`, `cue_line_index`, `explanation`. Plus `options`/`select_n` on
letter types and `asset` on map types.

**`cue_line_index` is the anchor for the whole payload.** It already exists, is already projected
into `listening_questions`, and already drives `cue_text` and `audio_ms` on the review screen
(`listening.py:1080–1099`). Do not duplicate it. Everything in `teaching` that refers to "the answer
line" means `lines[cue_line_index]`.

`explanation` stays, and its **shape is now fixed** (R3 §12.1). Five moves, in this order, ≤55 words:

> **what you should have predicted → what announced it → what the audio actually said → what the
> trap was → how to write it.**

*"The answer is in line 42"* fails review, because on test day there is no line 42.

### 1.1 `prediction` — the highest-yield field in the module

```jsonc
"prediction": {
  "slot": "noun_plural",              // REQ — §5.4, 14 values
  "cue":  "six",                      // REQ — EXACT substring of this question's `prompt`,
                                      //   or null on map_labelling and letter types
  "range": "6–40" | null,             // REQ (non-null) for quantity/code/date/time; else null
  "note": "<≤20 words>"               // REQ — what a strong candidate writes in the margin
}
```

**`cue` is null on exactly three types and nowhere else:** `map_labelling` (a Format B prompt is a
bare gap marker; the constraint comes from the drawn plan), `multiple_choice` and `matching` (there
is no written form to fix). On those, `note` must carry the constraint that replaces the cue — the
spatial relation, or the stem's decisive question word. Everywhere else,

`cue` is **lint-checked as an exact substring of `prompt`** (§9.4 lint 16). It is the printed word
that fixes the slot — the determiner, the printed unit, the column header, the parallel `-ing`
forms. If you cannot point at one, the item does not constrain its answer and **must be rewritten,
not annotated**: an item where both the singular and the plural read grammatically has failed the
learner, not the other way round (R1 §2.3).

`note` is the margin note, not a description of the note. Good: *"plural noun, a thing you borrow —
not the verb."* Bad: *"the learner should predict a plural noun."*

`range` exists because magnitude plausibility is what catches a mis-heard number **at the moment of
writing**, which is the only moment there will ever be (R3 §5.4). A seminar-room capacity of `250`
is not a near miss; it is a decodable error the learner could have rejected.

**This is the field that makes the no-audio preview drill possible** (§10 F4), at zero marginal
authoring cost, and it is the cheapest high-value thing in this whole document.

### 1.2 `signpost` — the only teachable answer to "how was I supposed to know"

```jsonc
"signpost": {
  "phrase": "The first thing on your left",   // REQ — EXACT substring of lines[line_index].text
  "line_index": 4,                            // REQ — cue_line_index, or the line immediately before
  "kind": "imminent"                          // REQ — §5.5, 11 values
}
```

**Lint (§9.4 lint 17):** `phrase` must appear verbatim in `lines[line_index].text`, and `line_index`
must equal `cue_line_index` or `cue_line_index - 1`. A signpost two turns away is not a signpost.

**The authoring rule this enforces (R1 §7.2):** *every keyed answer must be preceded, within two
clauses, by a signpost from the §5.5 inventory or by an authored distraction from §5.1.* A script
whose answers arrive unannounced is harder than the real exam and teaches nothing transferable,
because the learner's only available conclusion is "I should have concentrated more", which is not a
skill.

### 1.3 `answer_quote` — the verbatim line, and the lint that makes the audio jump work

```jsonc
"answer_quote": "the compost bays. Three of them, side by side"
```

**REQ. A verbatim substring of `lines[cue_line_index].text`, 4–25 words**, and — on completion types —
containing the keyed answer (§9.4 lint 18). On a letter type the key is a letter, so the quote is the
span that *decides* the letter instead. This is the exact discipline the reading module applies to
`evidence_quote`,
and it exists for the same reason: the review screen highlights it by substring search, so a
near-miss breaks the highlight **silently and invisibly**. It is also what lets the coach replay
just the answer window — `timing.json` gives sample-accurate `start_ms`/`end_ms` per line, so
`start_ms(cue) − 3000` to `end_ms(cue) + 1500` is a 5-second clip with no new data.

The quote is what the *speaker said*, not what the learner should write. Where the two differ —
`"twenty-four pounds a year"` for a key of `24` — that difference is the lesson and the `form` note
must name it.

### 1.4 `paraphrase_link` — listening's version of the reading module's highest-value field

```jsonc
"paraphrase_link": {
  "printed": "Green waste collection",     // REQ — EXACT substring of `prompt` on a completion type;
                                           //   EXACT substring of the KEYED OPTION's text on a
                                           //   letter type (see below)
  "audio":   "the garden-waste lorry"      // REQ — EXACT substring of lines[cue_line_index].text
}
```

**On a letter type the printed side lives in `options`, not in `prompt`.** An MCQ stem
(*"What does the coordinator say about the site's water supply?"*) contains no paraphrase — the
paraphrase relation is between the **keyed option** (*"It is unreliable in dry weather"*) and what
the audio actually said (*"in a dry August it can drop to a trickle"*). So on `multiple_choice`,
`matching` and any other type carrying `options`, lint 19 resolves `printed` against
`options[<keyed letter>]`; everywhere else it resolves against `prompt`. This is also the only place
`paraphrase_link` and `option_diagnosis` overlap, and they say different things: `paraphrase_link`
explains why the **right** option was hard to hear, `option_diagnosis` explains why the **wrong**
ones were easy to hear.

Both sides substring-checked (§9.4 lint 19). **In listening the printed question is the paraphrase
and the audio is the original — the opposite of a reading summary task**, and learners systematically
wait for the printed word, hear nothing, and conclude the answer was never given. That failure
(`synonym_only`) is the commonest *silent* loss in the paper: it generates no feeling of difficulty,
which is why it persists.

Set it to `null` **only** when the stem's anchor word is genuinely spoken verbatim, which should be
rare outside Part 1. A part where every `paraphrase_link` is null is a part whose items can be
answered by keyword spotting, and it is too easy.

This field powers the synonym-prediction drill (§10 F7d) with no new content.

### 1.5 `distraction` — the decoy, recorded

```jsonc
"distraction": {
  "trap": "self_correction",              // REQ — §5.1, 24 values
  "decoy": "Tuesday",                     // REQ — the wrong value the audio actually offered
  "decoy_line_index": 14,                 // REQ — where it was said
  "signal": "um, actually, no, sorry",    // REQ — EXACT substring of lines[decoy_line_index].text
  "note": "<≤25 words>"                   // REQ — what to do at that instant, not afterwards
} | null
```

`decoy` + `decoy_line_index` are what make three features free and none of them needs a new
component: highlighting the decoy in `TranscriptPanel`; a **"why did you write that?"** check that
compares the learner's wrong answer against the authored decoy and says *"you wrote the value the
speaker withdrew"*; and a **back-to-back replay** of the wrong line and the right line. R3 §7 is
unambiguous that this replay is the highest-value single feature in the whole review experience,
because it shows the learner the exact three seconds where their mark was lost.

**A second trap slug may be supplied as `trap_2`** (0–2 slugs per question, most decisive first,
same discipline reading uses). `[]` is not the shape — `distraction: null` is, and it is legal and
correct on a clean item.

Rules:

- **`note` must be executable at the moment.** *"Wait for the topic to move on before you commit"* is
  a note. *"Be careful of corrections"* is not.
- **`signal` must be lexically present in the audio.** Kokoro will not deliver contrastive stress
  (R4 §8.3, R3 §6.7), so a correction marked only by prosody **does not exist in our render** and the
  item is broken. Every correction carries a §5.5 `correction`-kind phrase. This is a fairness rule,
  not a style preference.
- **Never build an item on a stress-only minimal pair** (`thirteen`/`thirty`, `fifteen`/`fifty`)
  unless a confirm-back turn disambiguates it in the script. Measured: the `-teen`/`-ty` contrast
  *does* synthesize correctly (R4 §8.2), so it is a legitimate item — but only with the confirm-back,
  because an ambiguous item is unfair rather than difficult.
- **Never make a date ambiguity the point.** `03/05` is March 5 in one convention and 3 May in the
  other; key both and build the item on something else.

### 1.6 `form` — counted separately, because it is not a listening failure

```jsonc
"form": {
  "risk": "spelling",                  // REQ — §5.2, 6 values
  "note": "<≤22 words>"                // REQ — the specific fix, this item
} | null
```

Non-null whenever the answer is a **proper name, a number, a date, a time, a unit, a currency
figure, or a noun whose number the frame decides**. Null on a letter answer.

A correctly heard answer spelled wrongly scores zero, and in our implementation the match is exact.
Half of what a band-6 listener loses is form, not comprehension, and **it must be counted separately
or the learner will "practise listening" to fix a spelling problem**. A typical band-6.5 candidate
loses 2–4 marks to spelling, plurals and word limits alone — that is the entire 6.5→7.0 gap,
available without hearing one extra word of English. Say it in exactly those terms.

`near_miss_spelling` is already computed at runtime (`listening.py:1103`) and must be surfaced as its
own number in the results, never folded into "wrong".

### 1.7 `recovery` — what to do if this is the one you lost

`≤25 words`, or `null`. **REQ (non-null) on the question immediately following any question whose
`distraction` is non-null, and on every Part 4 question**, because Part 4 has no mid-part pause and
therefore no reset (R2 §7.3).

It names the **next handhold**, concretely: *"If Q17 went past, do not hunt. The table's next row is
the rent, and the word 'Rent' is spoken."* It never says "listen more carefully".

The arithmetic behind the field, which belongs in the coaching copy: the candidate misses Q17, keeps
listening for Q17, and the ratchet has already moved to Q18 and Q19. **One miss, four marks** —
26→30 is the whole 6.5→7.0 gap. *"The most expensive thing you can do in this test is care about a
question you have already lost."*

Part-specific re-anchors, which is what a good `recovery` note draws on (R3 §8.5):

| Part | Re-anchor on | Why it works |
|---|---|---|
| 1 | the form-field label being spoken (*"and your postcode?"*) | the audio narrates its own answer sheet |
| 2 | sequence and place words (*"as you come out of…"*, *"the next one along"*) | the route is the map; geometry re-anchors you |
| 3 | **a speaker change** | a new voice very often means a new sub-topic and a new question zone |
| 4 | a structure marker (`signpost.kind == "structure"`) | the outline is the only map; the topic words are unfamiliar by design |

### 1.8 `option_diagnosis` — required on every letter type

```jsonc
[ { "key": "A",                          // REQ — every option that is NOT keyed
    "why_tempting": "<≤25 words>",       // REQ — a real candidate process
    "why_wrong":    "<≤22 words>",       // REQ
    "heard_at": 17 } ]                   // REQ — the line index where this option is evoked
```

One entry per **non-keyed** option — so exactly 2 on an A/B/C multiple choice, and one per unused
letter on a box-matching group. Forbidden on completion types (use `distraction` instead).

`heard_at` is the enforcement mechanism for the type's defining rule: **every option must be
mentioned or clearly evoked in the audio** (R1 §4.7). An option that is never raised is dead weight
and silently reduces a three-way choice to a two-way one. Lint 20 checks that every `heard_at` is a
valid line index and that no two options on one question share it.

`why_tempting` must describe **a real candidate process**, not your theory of the item. *"The
speaker says the council might replace the pipe, so a learner listening for 'replace' hears their
option"* is a process. *"It is plausible"* is not, and fails review.

---

## 2. The per-group `teaching` object, and the `groups[]` index

`script_json.questions[]` is flat and the loader iterates it. So groups are added as a **parallel
index**, not as a nesting change:

```jsonc
"groups": [
  { "id": "g1",                                   // REQ — row-local, g1, g2, …
    "type": "map_labelling",                      // REQ — equal to every member question's `type`
    "instruction": "Label the plan below.",       // REQ — byte-identical to every member's
    "questions": [11, 12, 13, 14, 15],            // REQ — contiguous ascending
    "teaching": { … } }
]
```

**Lint 12 is the load-bearing one:** `groups[]` must partition `questions[]` exactly (every number in
exactly one group), each group's numbers must be contiguous and ascending, and the group's `type` and
`instruction` must equal those of every one of its member questions. The UI derives its own blocks
from consecutive `(instruction, type)` pairs (`qtypes.ts:146`); if the authored group and the derived
block disagree, the strategy card attaches to the wrong questions and nobody notices.

```jsonc
"teaching": {
  "schema_version": 1,                      // REQ
  "answer_order": "sequential",             // REQ — always this literal string, §5.6
  "order_note": "<≤22 words>",              // REQ — the consequence for THIS group
  "strategy": "<25–45 words>",              // REQ — this task, on THIS script
  "preview_focus": "<≤30 words>",           // REQ — what to do in the pause before this group
  "watch_out": "<≤25 words>",               // REQ — the loss this group is built to provoke
  "spatial_cues": [ "…" ],                  // REQ iff type == map_labelling — §7.3
  "bank_note": "<≤25 words>" | null         // REQ iff the group carries a shared lettered bank
}
```

### 2.1 `answer_order` and `order_note`

`answer_order` is the literal string `"sequential"` on every listening group, lint-checked (§9.4
lint 14). Officially, *"the questions are in the same order as the information in the recording"* and
**nothing in Listening scatters** (R1 §3.1). The field survives for two reasons: the UI renders it as
an unmissable **In recording order** badge, and the contrast with Reading is one of the highest-value
things we teach — in Reading, matching headings and matching information scatter and the whole
strategy is built on that; in Listening the learner is on a conveyor belt.

The one place order genuinely does not apply is a bulleted "in either order" list, and **we do not
author those** until L-D4 lands (§0.5).

`order_note` states the consequence **for this group**, in the imperative:

- map group: *"You are not searching the plan — you are walking it. Each answer narrows the next."*
- table group: *"Read across each row, then down. Column-wise reading puts you in the wrong cell."*
- Part 4 notes: *"If you hear a heading from lower down the page, the gaps above it are gone."*

**Two order facts almost nobody teaches, both official, both worth a full sentence each:**

1. **Map/plan/diagram labelling answers follow the order of the recording** (Cambridge/UCLES Task
   Type 3 teacher's notes, R1 §5.3). That converts the scariest type in the paper from a spatial
   search into a tracking task, and gives it the strongest recovery property in the paper, because a
   route is continuous — the next place is adjacent to this one.
2. **Table completion runs row-major** — across each row, then down (R1 §4.3). A learner who reads
   column-wise is guaranteed to be in the wrong cell. It is a ten-second intervention worth several
   marks and nobody says it because it looks too obvious to say.

### 2.2 `strategy` and `preview_focus`

`strategy` is the attack plan for this type **instantiated for this script** — never the generic
per-type page, which is static app copy written once from R1 §§4–5 (§10 F5).

- Generic and useless: *"Listen carefully and label the plan."*
- Instantiated and teaching: *"The gate is the only fixed point on this plan. Put your finger on it
  before the audio starts and keep it there — every 'left' and 'right' in this talk is measured from
  someone standing at the gate looking up the page."*

`preview_focus` is what the learner does in the ~30 seconds before this group, and it must be specific
enough to execute. It is the group-level half of the five-step preview protocol (R3 §5.5):

| Time | Step |
|---|---|
| 0–3 s | Read the instruction line. How many words? Is a number allowed? |
| 3–10 s | Slot-type every gap — one `prediction.slot` per box. **Never drop this step** |
| 10–20 s | Underline one anchor per stem: the word most likely to be paraphrased |
| 20–26 s | Read the **last** question of the set, so you know where the set ends |
| 26–30 s | Look at the first two again — the first answer often arrives seconds after the cue |

### 2.3 `watch_out`

The loss the group is built to provoke, named. Every completion group's `watch_out` must name an
**answer-form** loss at least once per script, because that is where the cheapest marks are. Every
letter group's `watch_out` must name an **attribution or elimination** loss.

---

## 3. The per-script `teaching` object

Lives at `script_json.teaching`.

```jsonc
"teaching": {
  "schema_version": 1,                  // REQ
  "what_makes_this_hard": { … },        // REQ — §3.1
  "pre_teach": [ … ],                   // REQ — 5–8 entries, §3.2
  "pause_plan": { … },                  // REQ — §3.3
  "signpost_map": [ … ],                // REQ — 5–10 entries, §3.4
  "accent_note": "<≤35 words>" | null,  // REQ (non-null) on every `au` row, §6.3
  "metrics": { … }                      // REQ — §3.5
}
```

### 3.1 `what_makes_this_hard`

```jsonc
{ "levers": ["cue_answer_distance", "distraction_density"],   // REQ — 2–3 from §5.7, ordered
  "note": "<≤35 words>",                                      // REQ
  "hardest_question": 15,                                     // REQ — a question number on this row
  "why_hardest": "<≤25 words>" }                              // REQ
```

Difficulty in listening is **not** vocabulary and it is **not** the TTS speed knob. Most of the
perceived speed increase from Part 1 to Part 4 is lexical density and syntactic complexity, not
articulation rate (R2 §6.5); a Kokoro `speed` of 0.98 for Part 1 and 1.04 for Part 4 is the outer
bound of what sounds natural, and **`speed` is a global setting that re-renders everything**, so it
is not an authoring dial at all. Raise difficulty through the §5.7 levers or not at all.

**What learners wrongly assume escalates and does not** (R2 §3): accent difficulty (accents are
distributed across the paper, not saved for the end); audio clarity (studio-clean throughout); and
spelling burden, which is **front-loaded** — Part 1 carries far more spell-from-dictation risk than
Part 4. Say that inversion out loud.

### 3.2 `pre_teach` — the vocabulary worth pre-teaching

```jsonc
[ { "item": "<≤4 words — a chunk where a chunk exists>",   // REQ
    "gloss": "<≤12 words, learner-facing>",                // REQ
    "line_index": 5,                                       // REQ — where it is spoken
    "blocks_q": 12 } ]                                     // REQ — the question it could cost you
```

5–8 entries. **`blocks_q` is the whole discipline:** a word you did not know and did not need is not
worth a card. Every entry must name a real question number on this row whose answer or whose
signpost turns on the item. At most two entries may be single words; the rest carry their partners
and their prepositions, because it is the *chunk* that goes past at speed.

Draw from, in this order of return:

1. **The signpost inventory** (§5.5) — a closed set of maybe 150 markers, learnable in a fortnight,
   and the only handholds in Part 4.
2. **Spatial language** on map scripts (§7.3) — closed, small, and the type's prerequisite.
3. **The idiom bank for categorising matching** (R1 §4.9a) — *I'll give that a miss*, *put me down
   for that*, *it depends who's teaching it*. Every one is an idiom and none contains the words in
   the printed option. This is the type's real teachable unit and the bank does not have it.
4. Topic lexis, last, and only where an answer or a cue depends on it.

### 3.3 `pause_plan` — the audio structure as data

```jsonc
{ "blocks": [
    { "questions": [11, 15], "orient_line_index": 0,
      "preview_line_index": 0, "preview_ms": 30000, "cue_line_index": 1 },
    { "questions": [16, 20],
      "preview_line_index": 10, "preview_ms": 30000, "cue_line_index": 11 } ],
  "close_line_index": 21,                 // REQ — the "That is the end of Part N" narrator line
  "check_ms": 30000,                      // REQ — always 30000
  "whole_test_intro": false }             // REQ — true only on the Part 1 script of a test
```

**Lint 15:** the blocks must cover every question number in the row exactly once, in ascending order;
Parts 1–3 have **exactly two blocks**, Part 4 has **exactly one**; each `preview_ms` is 30000 for a
two-block part and 40000 for Part 4's single block; each `cue_line_index` is `preview_line_index + 1`
and its line is a narrator line; every group in `groups[]` lies entirely inside one block.

**Part 4 has no mid-part pause.** All ten questions are previewed at once and the lecture runs
continuously (R2 §7.3, confirmed by our own `ls_t1_p4`). That is the structural reason a single miss
cascades in Part 4 and it is the anchor for every Part 4 `recovery` note.

The full audio framing this encodes is §6.6.

### 3.4 `signpost_map` — the script's own structure markers

```jsonc
[ { "line_index": 12, "phrase": "Right, the practical side", "kind": "structure" } ]
```

**10–16 entries per script**, and the floor is arithmetic, not taste: every row carries ten questions,
every question carries a `signpost` (§1.2), and **every one of those must also appear here**, deduped
on `(line_index, phrase)`. So the map is *the ten answer signposts, minus any duplicates, plus the
structure markers that carry no answer* — and it can only fall below 10 when two questions genuinely
share one marker. Above 16 the drill stops discriminating, because everything is a signpost.

Two things depend on it: the **signpost drill** (play a clip, ask what kind of thing is coming next)
and the **position-tracking drill** (play the part with questions hidden, learner taps each topic
shift, scored against these line indices). Both are scored against these line indices, so an entry
whose `phrase` is not verbatim in `lines[line_index].text` silently breaks them — same lint as §1.2.

**Part 4 scripts must carry a dense structure skeleton** — at minimum an opening frame, three
sequencing markers, one digression-and-return pair, and a summary marker — because those markers *are*
the recovery handholds we promise, and if they are not in the script the teaching is a lie (R3 §12.2).

### 3.5 `metrics`

```jsonc
{ "spoken_words": 653,                  // REQ — words in non-narrator lines. Target §8.1
  "words_per_answer": 65,               // REQ — spoken_words / 10. Target 55–95 (Part 4: 45–70)
  "trapped_items": 6,                   // REQ — questions with distraction != null. HARD 4–6
  "clean_items": 4,                     // REQ — 10 − trapped_items
  "spelled_out_answers": 1,             // REQ — ≥1 on every Part 1 script, 0 or more elsewhere
  "speakers": 1,                        // REQ — must match part: 2 / 1 / 2–4 / 1
  "longest_line_chars": 268 }           // REQ — HARD CAP 350, §6.7
```

Authors compute these honestly; the verify agent recomputes them mechanically.

---

## 4. Per-test: derived, never authored

`ListeningTestRow` has six columns and no payload, and `TABLE_COLUMNS["listening_tests"]` drops
anything else. Authoring a test-level teaching object would produce data that validates, merges,
checksums cleanly and is thrown away at import. So the per-test layer is **computed from the four
scripts plus two constants**.

### 4.1 The band table — already implemented and already correct

`RAW_TO_BAND` (`listening.py:54`) matches **all four official ielts.org anchor thresholds exactly** —
band 5 = 16, band 6 = 23, band 7 = 30, band 8 = 35 — with none of the fudge the Reading GT table
needed (R3 §2.2). **Do not "fix" it.** Keep the sub-4.0 rows and keep the indicative disclaimer;
ielts.org states plainly that the marks needed vary slightly from version to version.

| Raw | Band | | Raw | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 18–22 | 5.5 |
| 37–38 | 8.5 | | 16–17 | 5.0 |
| 35–36 | 8.0 | | 13–15 | 4.5 |
| 32–34 | 7.5 | | 10–12 | 4.0 |
| 30–31 | 7.0 | | 8–9 | 3.5 |
| 26–29 | 6.5 | | 6–7 | 3.0 |
| 23–25 | 6.0 | | 4–5 | 2.5 |

The teachable facts, which belong in the coach and the results screen:

- **One table for Academic and General Training.** Listening is literally the same test for both, and
  the format toggle must visibly change nothing here. Reading is the opposite, and the contrast is
  worth teaching: *"Your Listening band means the same thing whichever test you sat. Your Reading
  band does not."* Learners hunt for "GT listening practice"; it does not exist as a distinct thing,
  and one sentence defuses that.
- **Seven marks separate band 6.0 from band 7.0** (23 → 30). Under two questions per part.
- **The middle is a swamp and the top is a cliff.** 18–22 is a *five-mark-wide* band 5.5; above 30
  bands are two marks wide. So **show raw score as the primary metric and band as secondary** — a
  learner who goes 19 → 22 has improved by 15% and been told nothing.
- **Listening is marginally more forgiving than Academic Reading at 5.5, 6.5 and 7.5** (one mark
  fewer) and one mark harsher at 5.0. Both bands sit side by side on the progress screen and learners
  compare them.
- **`_band_for` refuses to band a short attempt** (`total >= 20` and a `test_id` required) — that is
  correct and better than reading's behaviour. Preserve it. On a 20-question two-part attempt each
  question is worth two projected raw marks, so any projected band must be labelled an estimate.

### 4.2 The pacing plan — a constant, plus the authored pause plans

There is no per-test pacing *choice* to make: the audio budgets the time for the learner. **Listening
is the only paper in IELTS with no time-management problem and, precisely because of that, the only
one where attention management is the whole game.** Recommended location for the constant: a
`LISTENING_PACING` dict beside `RAW_TO_BAND`.

| Phase | Computer-delivered (**what we model**) | Paper (taught, not simulated) |
|---|---|---|
| Part 1 | preview 30 s · audio · mid-part 30 s · audio · check 30 s | same |
| Part 2 | same | same |
| Part 3 | same | same |
| Part 4 | preview **40 s** · audio (no mid-part pause) · check 30 s | same |
| After Part 4 | **2 minutes to check** | **10 minutes to transfer** |
| Total block | ~32 min | ~40 min |

Derived per test: `sum(part.teaching.pause_plan preview_ms + check_ms) + rendered audio duration`,
which the app already knows from each part's `timing.json`.

**The 2-minute check protocol is a fixed executable list, not advice** (R3 §3.2), and it belongs in
the UI verbatim:

1. **Blanks first.** Every empty box gets the most plausible item of its predicted slot type. There
   is no negative marking; a blank is a guaranteed zero and a guess is not.
2. **Word limits second.** Anything over the limit is a certain zero. Cut to the shortest span that
   still answers. Articles are words.
3. **Plurals third.** Re-read the printed frame: does `some ___` / `a ___` / `two ___` force a number
   on the noun you wrote?
4. **Doubled answers fourth.** Any box containing two candidates (`Tuesday/Thursday`, `gap(s)`) is
   marked wrong. Pick one.
5. **Spelling last, and only on words you copied from a spelled-out name.**

Note what is *not* on the list: rethinking a question you got lost on. The audio is gone. **Content
recovery is impossible; only form recovery is possible.** That distinction is the single most useful
thing to say about the check step and almost nobody says it.

---

## 5. The closed enums

Every enum here is **closed**. Slugs are stable identifiers used simultaneously as a content field, a
review picker, a progress axis, a drill filter and the constrained vocabulary for the "why was I
wrong" LLM call. **Never rename one after content ships.**

### 5.1 `distraction.trap` — 24 slugs, five families

Reconciled from R1 §6 and R3 §7. The mapping column exists so nobody re-derives it. Author **0–2
slugs** per question (`trap` and optional `trap_2`), most decisive first. `distraction: null` is legal
and correct on a clean item.

**Family C — the speaker takes it back. The signature family, and it has no equivalent in reading.**

| Slug | What happens | Lexical signal that MUST be in the audio | R1 / R3 |
|---|---|---|---|
| `self_correction` | States the wrong value and replaces it in the same breath. **The single most characteristic listening trap** | *sorry* · *no* · *I mean* · *actually* · *rather* · *make that* | C / L1 |
| `late_correction` | The correction arrives a turn or more later, after the learner has written and moved on | *oh, hang on* · *did I say X? I meant Y* | C / L1 |
| `third_party_correction` | A corrects B. Common in Part 1 and Part 3 | *are you sure? I thought…* · *no, that was last year* | C / L2 |
| `readback_correction` | Correction inside a read-back. Very natural in Part 1 forms | *so that's B. R. A. M.* / *…actually it's with a Y* | C / L1+L2 |
| `spelling_correction` | A letter is given wrong and re-given. Brutal and fair, because real speakers do it | *S for sugar — sorry, F for Freddie* | C / L10 |

**Family R — raised and then dropped**

| Slug | What happens | Signal | R1 / R3 |
|---|---|---|---|
| `rejected_option` | Raised, discussed positively, declined | *we did think about…* · *that would've been ideal, except* | R / L4 |
| `concession_flip` | A positive claim reversed; the mark is on the second clause | *but* · *however* · *mind you* · *the thing is* | R / — |
| `hypothetical_only` | Stated as intention or possibility that has not happened | *is planning to* · *there's talk of* · *should be ready by* | R / — |
| `past_state` | Was true, explicitly superseded | *it used to be* · *up until last year* · *that's been moved* | R / L3 |
| `negated_fact` | The right words are present and the polarity is wrong. One unstressed *not* costs the mark | *not* · *no longer* · *apart from* · *rather than* | R / L11 |

**Family A — attribution and agreement. Part 3's whole difficulty.**

| Slug | What happens | R1 / R3 |
|---|---|---|
| `attribution_shift` | The opinion belongs to the tutor, the other student or a cited source — not to the speaker the stem asks about | R / L12 |
| `agreement_shift` | Proposed, resisted, modified, agreed. **The keyed answer is the settled position, and it is stated least emphatically**, because by then everyone agrees and agreement is spoken quietly | R / L12 |

**Family N — numbers, quantities and codes**

| Slug | What happens | R1 / R3 |
|---|---|---|
| `number_superseded` | A figure is given and revised — a quote then a discount; a price then this year's price | N / L1+L3 |
| `number_arithmetic` | Several figures given and the answer is the stated total. **Only the stated total is the key; never require the learner to compute** | N / L5 |
| `adjacent_numbers` | Two numbers in one sentence, only one answers the stem — full price vs concession, weeks of course vs week of exam | N / L5 |
| `unit_switch` | Same quantity, different unit (`0.75 m` / `75 cm`). Both keyed; a learner who converts wrongly is not | N / — |
| `digit_reading` | The spoken convention is the difficulty: *oh* for zero, *double four*, *nineteen eighty-three* | N / L9 |

**Family L — the words do not match the meaning**

| Slug | What happens | R1 / R3 |
|---|---|---|
| `lexical_lure` | The question's own keyword is spoken, attached to a different fact. **The trap Field's IELTS research says candidates are structurally most vulnerable to**, because superficial lexical matching is the strategy they fall back on under pressure | L / L7 |
| `synonym_only` | The answer's trigger is a synonym; the printed word is never spoken. The **commonest silent failure** — the learner never knows the burst happened | L / L8 |
| `option_never_named` | MCQ: the keyed option is chosen by description, never by its printed label (*"I'll go for the highest"*) | L / — |
| `all_options_named` | MCQ: every option is spoken, so option-spotting is worthless by construction | L / — |
| `decoy_first` | The distractor is spoken **before** the answer. Structural and near-universal: the earlier plausible candidate is nearly always the trap | L / L6 |
| `paraphrased_stem` | Box-matching: the option is a proper noun spoken verbatim, the **stem** is the paraphrase — the exact inverse of the categorising variant | L / — |
| `plausible_but_unasked` | An option is stated and true, but does not answer this stem. *Why* vs *what* vs *when* decides it | L / L14 |

**Distribution rules (§9.4 lint 21), replacing the plan's flat "at least 4 corrections per part":**

- Per part: **≥1 from family C**, **≥1 from family R**, **≥1 from family L**, and **≥1** of
  `negated_fact` / `plausible_but_unasked`. A part built entirely on self-correction teaches one
  reflex and no discrimination.
- Per part: **4–6 trapped items, never ten.** Roughly half the items must be clean. A part where
  every item is a trap trains paranoia and produces learners who overwrite correct answers.
- Per test: **≥1 from family A** (Part 3), **≥1 from family N** (Part 1 or 2).
- Bank-wide: every slug in families C, R, A, N and L must be carried by **≥8 questions**, or the trap
  drill cannot teach it.

### 5.2 `form.risk` — 6 slugs, counted separately from traps

| Slug | What happened |
|---|---|
| `spelling` | Heard correctly, written wrongly. Already detected at runtime as `near_miss_spelling` |
| `plural_form` | Singular for plural or vice versa, where the printed frame decided it |
| `word_class` | Right root, wrong form — `manage` for `management`, `check` for `checking` |
| `over_limit` | Right content, too many words. Usually an article, or the speaker's natural phrase |
| `wrote_word_not_letter` | Letter types: the option's words instead of its letter. Scores zero |
| `wrong_letter_count` | "Choose TWO" answered with one or three. Scores zero for both, not one of two |

These are **never** comprehension failures and must be separable in the stats, because they need
answer-form fixes rather than listening fixes.

### 5.3 The process enum — derived by the app, never authored

Four slugs the review screen computes from the attempt and its timings. **No author ever writes
these**; they exist here so the review picker, the progress axis and this document share one
vocabulary.

`overrun` (the next answer was spoken while the learner was still writing the last — the mechanical
cause of most consecutive-miss pairs) · `cascade` (one miss became three; the behaviour the recovery
drill exists to break) · `preview_overrun` (still reading ahead when the audio started) ·
`blank` (left empty — a guaranteed zero where a guess is free).

### 5.4 `prediction.slot` — 14 slugs

R3 §5.2's P-codes with readable names. P-codes are documentation; the slugs are the data.

| Slug | P | Listening for | Characteristic hazard |
|---|---|---|---|
| `quantity` | P1 | a bare figure, price, count, capacity, distance, age | 13/30, 15/50; repeating a printed unit |
| `code` | P2 | phone, postcode, membership, room, reference — digits and letters, said slowly | mis-hearing *oh* as a letter; losing a *double* |
| `date` | P3 | day, day+month, sometimes year (day-of-week lives here too) | ordinal suffixes; day/month order |
| `time` | P4 | clock time or a duration | am/pm; duration confused with start time |
| `proper_name` | P5 | a name, usually spelled out | pure transcription — **the whole mark is orthography** |
| `address` | P6 | number + street name + type | the street *type* is part of the answer and is dropped |
| `noun_singular` | P7 | a noun after `a` / `an` / `each` / `one` | writing the plural |
| `noun_plural` | P8 | a noun after `some` / `two` / `several` / `a range of` | dropping the `-s` |
| `noun_uncountable` | P9 | `equipment`, `advice`, `access`, `funding`, `transport` | adding an illegal `-s` |
| `adjective` | P10 | after `is` / `are` / `very`, or before a printed noun | writing the noun instead |
| `verb` | P11 | base after `to`, `-ing` after a preposition, past in a narrative frame | right verb, wrong inflection |
| `noun_phrase` | P12 | modifier + head, spoken as one prosodic chunk | writing three words |
| `letter` | P13 | not a gap — a choice between candidates all of which get mentioned | choosing the first mentioned |
| `category` | P14 | the superordinate the speaker never says, or the instance where the class was given | the paraphrase gap |

**The cue table** — how the printed frame fixes the slot. A learner who internalises twenty rows of
this can slot-type a whole question set in fifteen seconds, and it is the single most drillable thing
in the module.

| Printed cue | Slot | Note |
|---|---|---|
| `a ___` | `noun_singular` | **`an ___` additionally tells you the answer begins with a vowel sound** — a free constraint that eliminates half the candidates |
| `some / several / many / two / a range of ___` | `noun_plural` | |
| `much / amount of / level of / access to ___` | `noun_uncountable` | never `-s` |
| `Cost / Fee / Price / Deposit: ___` | `quantity` | check whether the symbol is already printed |
| `Tel / Ref / Membership no.: ___` | `code` | expect *double* and *oh* |
| `___ per person / per night` | `quantity` | |
| `on ___` | `date` or `noun_singular` | a day, a date, or a surface |
| `at ___` | `time` or a place | |
| `by ___` | `verb` (`-ing`) or an agent noun | |
| `to ___` | `verb`, base form | |
| `is / are / was ___` | `adjective` or `noun_singular` | |
| `very / quite / fairly ___` | `adjective` | |
| `___ + printed noun` | `adjective` or `noun_phrase` | |
| a printed unit after the gap (`___ km`) | `quantity` | write the bare figure only |
| a printed symbol before the gap (`$___`) | `quantity` | do **not** repeat the symbol |
| the column's other cells are `-ing` forms | `verb` | parallelism is a hard constraint |
| the stem asks `Why…` / `What was the reason…` | `letter` | expect several reasons mentioned, one endorsed |
| the stem names two people (Part 3) | `letter` | attribution trap incoming |

### 5.5 `signpost.kind` — 11 slugs

Reconciled from R1 §7.1 and R3 §6.2–§6.6. These are closed sets — perhaps 150 items in total, they
recur in every listening text in English, and they are learnable in a fortnight. In Reading the skill
that decides the band is recognising that two differently-worded propositions match. In Listening you
get one pass, so what you get instead is **metadiscourse**: the speaker constantly announcing what
they are about to do.

| Slug | Means | Examples |
|---|---|---|
| `imminent` | the answer is arriving within a clause | *the ___ is…* · *that'll be…* · *you'll need…* · *what you want is…* · *just to confirm…* · *so we've got you down for…* |
| `dictation` | **stop comprehending, start transcribing** | *that's spelt…* · *shall I spell that?* · *double-…* · *hyphen* · *all one word* · *with a K* |
| `structure` | a new section of the talk | *I'll start by…* · *moving on to…* · *which brings me to…* · *having covered…* · *to get back to* |
| `list` | N things are coming — **the strongest recovery anchor in a monologue**, because the announced number tells you how many gaps to expect | *there are three main…* · *a couple of points here…* |
| `emphasis` | this is the one that counts | *the important thing is…* · *what's crucial here…* · *the main reason…* · *what swung it was…* |
| `definition` | a term is about to be named — very common in Part 4, and **the term is often the key** | *which we call…* · *known as…* · *to give it its proper name…* |
| `reformulation` | the same idea again in easier words — **a second chance at a missed fact** | *in other words* · *that is to say* · *which basically means* |
| `contrast` | the answer is on the far side | *but* · *however* · *whereas* · *on the other hand* · *having said that* |
| `correction` | the value is about to change | *sorry* · *no, actually* · *I mean* · *rather* · *make that* · *hang on* |
| `decision` | a settled outcome (Part 3) | *let's go with…* · *shall we say…?* · *OK, that's settled* |
| `negation` | polarity or exclusion, and missing one inverts the answer | *apart from* · *except for* · *rather than* · *no longer* · *unless* · *only* |

**The one line worth putting in the product, from the correction inventory:**

> **The answer is the last value stated for that slot before the speaker moves on. Never the first.**

### 5.6 `answer_order` — one value

`"sequential"`. Always. §2.1 explains why the field exists anyway.

### 5.7 `what_makes_this_hard.levers[]` — 8 slugs

From R2 §3, ordered by how much each actually moves difficulty between Part 1 and Part 4:

`lexical_density` · `cue_answer_distance` · `paraphrase_distance` · `syntax` · `answer_abstraction` ·
`distraction_density` · `speaker_tracking` (Part 3 only) · `no_reset` (Part 4 only).

`speech_rate` is deliberately **not** on the list. It escalates mildly and it is not an authoring
dial (§3.1).

---

## 6. THE AUDIO CONTRACT — binding on every authoring agent

**A script that renders badly is worse than one that reads badly.** Everything in this section was
measured against the Kokoro build actually installed on this machine (R4 Part B), not assumed. Treat
it as a hard style guide.

### 6.1 What the pipeline does

Per script, `render_script()` resolves every speaker to a voice, synthesizes **each line
independently** (cached at `media/tts-lines/<sha24>.wav` keyed on `voice + text + speed`),
concatenates with the authored pauses recording sample-accurate offsets, and writes
`media/listening/<audio_hash>.wav` plus `<audio_hash>.timing.json`.

| Property | Value |
|---|---|
| Output | 16-bit PCM mono WAV, 24 000 Hz, RMS-normalised to −16 dBFS, peak −1.5 dBFS |
| `pause_after_ms` | clamped to [0, 60000]; default 300 |
| Timing | `{index, start_ms, end_ms, pause_after_ms}` per line, computed from **sample counts** — it cannot drift from the audio |
| `start_ms` semantics | start of the *spoken* line; the pause belongs to the line **before** it |
| Cache key | `sha256({schema_version, accent_set, lines:[{voice, text, pause}]})` |
| Editing a title, a question or any teaching payload | **does not re-render** |
| Editing one character of `text`, a pause, or a voice | re-renders **that line only** |

So: **rewrite teaching payloads fearlessly; rewrite `lines` deliberately.**

### 6.2 Voice casting — the binding table

Two layers, because `resolve_voice()` honours an authored `voice` **unless forced**, and the accent
drill's re-render forces the whole cast onto one accent set (`forced=True`).

**Layer 1 — the authored cast (binding).** Every speaker object carries an explicit `voice`.

Measured median F0 (R4 §7.3). **The rule: two speakers in one dialogue must be ≥40 Hz apart or of
different sexes.** Sex is the primary cue; F0 is the fallback.

| Accent set | narrator | female_1 | female_2 | male_1 | male_2 |
|---|---|---|---|---|---|
| `uk` | `bm_george` 150 | `bf_emma` 187 | `bf_alice` 226 | `bm_lewis` 98 | `bm_daniel` 131 |
| `us` | `am_michael` 125 | `af_heart` 202 | `af_nicole` 162 | `am_onyx` 91 | `am_adam` 133 |
| `au` | `bm_daniel` 131 | `bf_lily` 199 | `bf_alice` 226 | `bm_george` 150 | `bm_lewis` 98 |

**Approved dialogue pairs** — use these, do not improvise:

| Part shape | `uk` | `us` | `au` |
|---|---|---|---|
| Two speakers (Parts 1, 3) — **default, mixed sex** | `bf_emma` + `bm_lewis` (89 Hz) | `af_heart` + `am_adam` (69 Hz) | `bf_lily` + `bm_george` (49 Hz) |
| Two speakers, alternate cast | `bf_alice` + `bm_daniel` (95 Hz) | `af_nicole` + `am_onyx` (71 Hz) | `bf_alice` + `bm_lewis` (128 Hz) |
| Three speakers (Part 3 tutorial) | `bf_emma` + `bm_lewis` + `bf_alice` (f/f 39 Hz) | `af_heart` + `am_adam` + `af_nicole` (f/f 40 Hz) | `bf_lily` + `bm_george` + `bm_lewis` (m/m 52 Hz) |
| Monologue (Parts 2, 4) | any, **including `bm_fable`** | any, **including `am_onyx`** | any |

**Never pair, in any part:** `bf_emma`+`bf_lily` (12 Hz) · `bf_isabella`+`bf_alice` (12 Hz) ·
`bm_daniel`+`bm_fable` (7 Hz) · `af_bella`+`af_sarah` (identical 210.5 Hz) ·
`am_michael`+`am_adam` (7 Hz) · `af_heart`+`af_bella` (9 Hz).

**`bm_fable` and `am_onyx` are banned from dialogue.** Measured trailing silence 538 ms and 692 ms —
every turn lands with nearly a second of dead air. They are excellent for a Part 4 lecture, where the
measured pace reads as authority; there, subtract their trailing silence from your authored pause
(write 0–150 ms where you would otherwise write 400–600).

**Layer 2 — the `VOICE_MAP` recast (reported, not ours to make).** The forced re-render ignores
authored voices, so a bad `VOICE_MAP` row cannot be rescued by casting. The table above **is** the
recommended `VOICE_MAP`, and it differs from the shipped one in four cells:

| Row/role | Shipped | Recommended | Why |
|---|---|---|---|
| `us/female_2` | `af_bella` 210.5 | `af_nicole` 161.6 | 9 Hz from `af_heart`; `af_nicole` is 40 Hz away **and** markedly slower |
| `us/male_1` | `am_adam` 132.6 | `am_onyx` 90.6 | `am_michael`(narrator) and `am_adam` are 7 Hz apart |
| `us/male_2` | `am_eric` 162.2 | `am_adam` 132.6 | follows from the above; m1/m2 becomes 42 Hz |
| `au/narrator` | `bm_george` | `bm_daniel` | `au` and `uk` currently share a narrator, so the accent drill opens on an identical voice |
| `au/male_1` | `bm_daniel` | `bm_george` | |
| `au/male_2` | `bm_fable` 124.4 | `bm_lewis` 98.4 | 7 Hz from `bm_daniel`; and `bm_fable` is banned from dialogue |

**Honest note on `au`:** there are eight British voices and `uk` already uses five, so `au` cannot
have a disjoint cast. Every `au` role above differs from its `uk` counterpart, which is the best
achievable; the accent drill's audible change is the narrator plus a different leading voice. **The
real Australian training is the lexis layer (§6.3), not the phonology.**

### 6.3 `accent_set` — what each one actually means

`accent_set` ∈ `{uk, us, au}`, validator-enforced. There is no `nz`.

- **`uk`** — mainstream Southern British. Non-rhotic, TRAP/BATH split. British spelling and
  conventions (`car park`, `pavement`, `mobile`, `postcode`, `ground floor`, `bank holiday`,
  `chemist`, `timetable`, `autumn`, `queue`, `GP`, `Year 13`).
- **`us`** — General American. **Author the lexis, because the phonology already works** (`am_`/`af_`
  voices genuinely get `lang="en-us"`): `parking lot`, `sidewalk`, `cell phone`, `zip code`,
  `first floor` (for what British calls ground floor), `fall`, `line`, `vacation`, `schedule`,
  `drugstore`, `elevator`, `apartment`, `gas station`, `résumé`.
- **`au` is an Australian *variety* set, not an accent claim.** Kokoro v1.0 ships no Australian
  voice; the code already says so and `ACCENT_LABELS["au"]` already reads *"Australian (approximated
  with British voices)"*. What we **can** deliver fully, and must:

| Layer | Deliverable? | The contract |
|---|---|---|
| Vowel shifts, rhoticity | **No** | — |
| High rising terminal | Partially | a `?` induces a rise, unreliably. **Teach HRT explicitly instead** (§6.3 below) |
| Lexis and idiom | **Yes, fully** | `uni`, `chemist`, `footpath`, `unit` (flat), `public holiday`, `mobile`, `TAFE`, `Year 12`, `GP`, `esky`, `bushwalk`, `ATM`, `tram` |
| Institutional detail | **Yes, fully** | Australian invented place names, semesters, state-level services, AUD, day-first dates, drought/reef/bushfire content |
| Spelling | **Yes** | `-ise`, `-our`, `-re`; `program` (AU) rather than `programme` |
| Number conventions | **Yes** | day-first dates, *double* for repeated digits, **"zed" not "zee"** — blocked on L-D6 |
| Discourse style | **Yes** | more informal address, tag questions, *no worries*, *how're you going* |

**Every `au` script's `teaching.accent_note` is required** and must say what is and is not
approximated, plus the one AU fact that actually costs marks: **the High Rising Terminal**. In
Australian and NZ English a rising tone on a statement is a checking-in device, not a question. A
learner who does not know that will hear an Australian receptionist give them the correct room number
and keep listening for the "real" answer. It is a pragmatic trap, not a phonetic one, and it is
teachable in a paragraph.

**Treat slang as flavour only.** `arvo`, `servo`, `barbie`, `Woolies` may appear in a line; **never
key an answer on a slang item**, because the exam uses mainstream registers.

**Accent mixing.** `resolve_voices()` honours a **per-speaker `accent`** when the script's
`accent_set` is not forced — a capability our content does not currently use at all, and the cheapest
realism win available. The real test mixes accents *within* a conversation (a British caller, an
Australian officer). **At least four scripts across the bank must use per-speaker accents**, and
`accent_set` then names the dominant one.

### 6.4 Spelled-aloud answers — dots and spaces, never hyphens

This is the most important measured finding in the whole audio contract, and **the shipped bank is
currently broken by it**: `ls_t1_p1` contains `O-K-A-F-O-R` and `B-E-L-L-F-I-E-L-D`. The hyphens are
stripped and the letter names concatenate into a single pseudo-word with no boundaries. Transcribed
back with faster-whisper, `O-K-A-F-O-R` was heard as **"OK FOA, or CAFA"**. A candidate cannot
possibly transcribe it.

```
✅  "It's Okafor. O. K. A. F. O. R."
✅  "That's Hyde — H. Y. D. E. Then Ferrand. F. E. R. R. A. N. D."
✅  "M. E. double R. Y. F. I. E. L. D."
❌  "It's Okafor. O-K-A-F-O-R."          hyphens are stripped, letters concatenate
❌  "It's Okafor. O K A F O R."           a bare `A` phonemizes as the article "uh"
❌  "It's OKAFOR."                        all-caps without dots renders as the word
```

Space-separation fails for a specific reason: the letter **A** standing alone is phonemized as the
article `ɐ`, not the letter name `ˈeɪ`. All 26 letters are correct in dot form. `Y. M. C. A.` is
required for any acronym ending in A; `RSPB` and `NHS` are already fine.

**The transcript will show the dotted form.** That is accepted for now — it reads acceptably. The
proper fix is a per-line `say_as` field separating what is spoken from what is displayed (R4 C-6);
it is reported, not authored around.

**Every Part 1 script carries at least one spelled-out proper noun**, and at least one of them per
test carries a **doubled letter** (spoken as *"double R"*) or a hyphen, because that is the
transcription skill we owe (R3 §12.2). The read-back is what makes it fair and realistic:

```
s1: "Could you spell that for me?"
s2: "It's Merryfield. M. E. R. Y. — no, sorry, there are two R's. M. E. double R. Y. F. I. E. L. D."
s1: "Merryfield, two R's. Got it."
```

That is one line of authoring and it delivers a `spelling_correction` trap, a `dictation` signpost, a
confirm-back and a second pass, all without breaking the once-only rule.

**Do not invent a name that Kokoro mangles.** Spot-checked failures: `Cholmondeley`,
`Featherstonehaugh`, `Magdalen`. Prefer names the phonemizer handles; a counter-intuitive surname is
a legitimate and excellent Part 1 item but it needs the `phonemes` escape hatch, which does not exist
yet. **Run `Tokenizer.phonemize()` over every invented proper noun before shipping** — no synthesis
needed, ~0.3 s to load the model.

### 6.5 Numbers — write them the way they are said

Measured. `text` carries the **spoken** form; `answers[]` carries the **written** form. They are
already separate fields; use that.

| Kind | Write in `text` | Never | Key in `answers[]` |
|---|---|---|---|
| Phone / reference / account / extension / room 4-digit | `"oh two oh, double seven, four one"` | `0207741` → *"zeroonewunseven, four hundred and ninety-six"* | `"020 7741"` |
| Decimal | `"twelve point five"` | `12.5` → the point is **silently dropped**, "twelve five" | `"12.5"` |
| Money | `"forty-two pounds fifty"` | `£42.50` → *"pound forty-two fifty"*, symbol read as a prefix word | `["42.50", "£42.50"]` |
| 20th-century year | `"nineteen ninety-four"` | `1994` → *"nineteen hundred and ninety-four"* | `"1994"` |
| 21st-century year | `2019` ✅ safe as digits | | |
| Clock time | `6.30`, `6.45` ✅ safe — read as "six thirty" | | `["6.30","6:30","half past six"]` |
| Quantity | `a 1500 word essay` ✅ safe at any length | | |
| Postcode / flat / room short code | `B4 7QT`, `flat 2B`, `Room A4` ✅ safe | | |
| Dates / ordinals | `14 March 2019`, `the 1st of October` ✅ safe | | |
| Repeated digits | `"double seven"`, `"treble two"` ✅ and worth using — it is a real listening skill | | |
| `-teen` / `-ty` | synthesizes correctly, so it is a legitimate item — **with a confirm-back turn** | | |

### 6.6 Pauses and the announcer framing

**Punctuation controls prosody, not silence.** Measured: commas, full stops, semicolons, dashes and
newlines all produced **zero** internal silence; only `...` gave a reliable 108 ms. A bare `-` is
worse than useless — it is stripped from the audio while remaining in the transcript, so audio and
transcript diverge. **The only reliable pause is `pause_after_ms`.**

**Authored pauses are lower bounds.** Each voice adds 97–538 ms of its own trailing silence
(`bm_fable` 538, `bf_isabella` 286, `bf_alice` 188, `bm_daniel` 144, most others ~100), so
`pause_after_ms: 300` renders as 434–941 ms depending on the voice. Do **not** compensate per-voice
in the content — that is a one-line fix in `stitch` (reported). Author the pause you mean.

| Situation | `pause_after_ms` |
|---|---|
| Latched interruption (the next speaker cuts in mid-clause) | **0** |
| Quick agreement, backchannel (`Mm.` / `Right.`) | 150 |
| Normal turn in fast dialogue | 250 |
| Considered answer, topic shift inside a turn | 400–600 |
| **Before a correction lands** | **400–600** — this substitutes for the prosodic repair boundary Kokoro cannot deliver |
| After a correction lands | 250–300 |
| After a spelled-out name (writing time) | 600–900 |
| After an answer-bearing line, before the next answer | **≥800**, or ≥15 spoken words of non-answer material |
| Orientation before the first map answer | **≥1200** |
| Question preview | **30000** (Part 4: **40000**) |
| End-of-part check | **30000** |

**The five-move announcer framing, authored as narrator lines** (R2 §7.2 — write our own wording,
never a board's):

```
1. ORIENT      "Part two. You will hear <who> <doing what, to whom>."
                 one sentence naming the speakers and the situation. This is the candidate's
                 ONLY context. It is not decorative.
2. PREVIEW     "First, you have some time to look at questions eleven to fifteen."
                 → pause_after_ms: 30000
3. CUE         "Now listen carefully and answer questions eleven to fifteen."
                 → pause_after_ms: 800–1000, then the audio begins
   ── first question group ──
4. MID-PART    "Before you hear the rest of the talk, you have some time to look at
                 questions sixteen to twenty."       → 30000
                "Now listen and answer questions sixteen to twenty."   → 800–1000
   ── second question group ──
5. CLOSE       "That is the end of Part two. You now have half a minute to check your answers."
                 → pause_after_ms: 30000
```

**Two gaps in the shipped scripts that every new script must close:**

1. **The CUE move is missing.** Our narrator goes from the preview straight into the pause and then
   into the dialogue. That line is the audible signal that the pause has ended; without it a
   candidate who looked away has no cue that the audio has restarted.
2. **There is no whole-test intro.** The **Part 1 script of every test** opens with the framing
   before its ORIENT line, so the once-only rule is stated by the audio as it is in the exam:

```
"This is the IELTS-style Listening practice test. You will hear four separate recordings and
 answer questions on each. Each recording is played once only. You will be given time to read the
 questions before each recording and a short time to check your answers afterwards.
 The test has four parts."     → pause_after_ms: 1200
```

Set `teaching.pause_plan.whole_test_intro: true` on that script and `false` everywhere else.

**Part 4 has exactly one preview block at 40000 ms and no mid-part pause.** Do not add one.

### 6.7 Making a synthesized script sound spoken

Techniques measured to survive Kokoro:

- **Contractions everywhere** (*I'll, we've, that's, don't, there's, it'd*) — the single biggest
  naturalness lever.
- **Fillers liberally, at turn starts** — *um, er, well, right, OK, so, I mean, sort of, you know*.
  Measured to render cleanly and recovered near-verbatim by ASR. They are most of what makes a script
  sound spoken rather than read.
- **Self-corrections as `<wrong>. <filler> <marker> <right>`** — `"It's on the fourth floor. Um,
  actually, no — the fifth."` Measured 405 ms and 123 ms internal gaps for free, which is both the
  prosodic reset and a usable beat.
- **Short turns and backchannels on their own lines** (`"Mm."` / `"Right."` / `"Yeah, exactly."`)
  with small `pause_after_ms` — that is what creates conversational rhythm.
- **Vary the turn pause.** A uniform 300 ms is the giveaway that it is synthetic.
- **Never abbreviate in `text`.** Measured: `Dr.` → "doctor" ✅ but `St.` → "**saint**" ❌ and
  `Rd.` → spelled "**R D**" ❌. Write `Doctor`, `Saint`, `Street`, `Road`, `Avenue`, `approximately`.
- **Lines under 350 characters.** Not because Kokoro fails — it handled 1367 characters / 74 seconds
  with no truncation — but because a line is the unit of pausing, of transcript highlighting and of
  audio seeking. A 70-second line makes `TranscriptPanel` useless and gives the learner no seek
  granularity.

**What we cannot render, and the workarounds:**

| Feature | Renderable? | Workaround |
|---|---|---|
| Genuine overlapping speech | **No** — `Kokoro.create()` takes one voice; `stitch` concatenates on a monotonic cursor | **latched turns**: `pause_after_ms: 0` and begin the next speaker mid-clause (`"…start with the questionnaire—"` / `"—the questionnaire, yes, but only if…"`). Also *reported* overlap (`"Sorry, you go — no, after you."`). And test **recovery after interruption**, which is the actual skill |
| Contrastive stress on a repair | **Weak** | mark it lexically, always (§1.5) |
| Australian / NZ phonology | **No** | the §6.3 variety contract |
| Phone-line acoustics | **No** | say it in the ORIENT line (*"a telephone conversation"*) |
| Laughter, coughs, tone of voice | **No** | omit — the real exam is studio-clean. **No item may depend on tone** |

**Do not try to fake overlap by mixing rendered WAVs.** It defeats the line cache, breaks
`timing.json` monotonicity, and `TranscriptPanel` assumes non-overlapping windows.

**Set the expectation in the UI.** One honest line — *"voices are synthesized; use the accent drill
and plan extra exposure to real recordings"* — costs nothing, buys trust, and converts a limitation
into the rationale for extensive listening.

---

## 7. The four types with zero content, and the map contract

`table_completion`, `sentence_completion` and `map_labelling` have zero questions in the bank and are
fully supported by both the renderer and the scorer. `short_answer` and `summary_completion` render
correctly too (§0.5 L-D8). Nothing here is blocked on engineering except the map **asset**.

### 7.1 `table_completion` — the markdown grid

`qtypes.ts:93 isMarkdownTable()` fires when ≥2 lines of `prompt` contain `|`, and
`parseMarkdownTable()` strips a `|---|` separator and treats the first remaining row as the header.
So author the layout inside `prompt`:

```
| Activity | When | Details |
|---|---|---|
| Key collection | any weekday | ask for ______ (surname) |
| Green waste collection | ______ | leave bags by the main gate |
| Plot rent | due in October | ______ pounds a year |
```

Gap markers are `______` (`GAP_RE` matches `_{2,}`, `\.{4,}` or `…+`). Every question in a table group
repeats the **whole table** in its own `prompt` — that is how the existing renderer works and how the
learner keeps the grid in view.

Rules: **fill at least 60% of the cells** (a mostly-gapped table is a note list wearing a grid);
**three to five columns, three to five rows** (wider scrolls horizontally and destroys the row-major
reading the type depends on); and never put two gaps in the same row unless the audio delivers them
adjacently. The already-filled cells are the strongest prediction cue in the paper and learners skip
them — say so in `preview_focus`.

### 7.2 The types that ship as something else

- **Flow-chart completion → `note_completion`** with an arrow-chain layout in `prompt`. It reads
  correctly, scans correctly and needs zero engineering. **Linear chains of 4–7 steps only**; branching
  cannot be expressed in any available shape.
  ```
  Collect the application pack from the ______ office
        ↓
  Complete Form B and attach two references
        ↓
  Submit by ______ at the latest
  ```
- **Summary completion, free variant → `note_completion`** with a gapped paragraph. The instruction
  line is what tells the learner it is a summary.
- **Summary completion, banked variant → `matching`** with a lettered word bank on `options`. The
  bank words are the item-writer's synonyms, not the speaker's words, which is exactly why the type
  is harder than it looks: the learner is listening for a meaning and matching it to a word they will
  **not** hear. At least two bank words must be unused and **every unused word must be designed to
  tempt a named gap** — record that in `bank_note`. A bank word that tempts nobody is padding.
- **`short_answer`** ships under its own slug. No `options`, so it falls through to `TextAnswer` and
  scores as a `TEXT_TYPES` member; only the badge is auto-generated. **Author single questions with
  distinct stems**, never bulleted either-order lists (L-D4).

### 7.3 `map_labelling` — the contract, and the guard

The type candidates most often meet unprepared, with zero content in our bank and the only delivery
that can fail silently.

**Two formats.**

| | Format A — letters | Format B — words |
|---|---|---|
| Visual carries | lettered positions A–I | numbered gaps 11, 12, … |
| `options` | required (the letter bank) | **absent** |
| `prompt` | the thing to be placed (*"Compost bays"*) | a bare gap marker `"______"` |
| Answer | a letter | 1–2 words, **spelled** |
| Spelling risk | none | yes — on-brand for this module |
| Safe without art? | **No** — silently unanswerable (L-D5) | Yes, degraded |

**Author Format B by default.** Author Format A only when the verify agent has confirmed the SVG
ships. That is the whole of L-D5's mitigation and it also keeps the spelling dimension.

**The order guarantee, which is official and almost never taught:** Cambridge/UCLES's own Task Type 3
teacher's notes say the letters *"will follow the order of the recording."* **You are not searching
the plan — you are walking it with the speaker.** State it in `order_note` on every map group.

**The orientation move is the whole type.** Before any label is placed the learner must fix (a) where
they are standing and (b) which way they are facing. Every subsequent `left`, `right`, `beyond`,
`past` and `opposite` is relative to that, and a learner who fixed it wrong will place every label
wrong while following the description perfectly. **It is the only type in the paper where you can
listen correctly and score zero.**

> **Binding, non-negotiable:** every map script opens with an explicit orientation sentence naming a
> drawn, printed feature, before the first answer, and the pause before the first answer is
> **≥1200 ms**.

**What the drawn asset must contain** — hand this checklist to whoever draws it:

1. **An orientation anchor that is drawn and named** — `ENTRANCE`, a compass rose, or a named fixed
   feature. Without it the orientation move is impossible.
2. **Two to four named, unlettered landmarks** — the reference points the speaker gives directions
   *from*. Printed with their names, and **never answers**.
3. Format A: **N+3 to N+5 letters for N questions.** Format B: one numbered gap per question, carrying
   the actual question number.
4. **Real adjacency.** At least two positions adjacent, and at least one *mirror-image* pair across a
   path or street, so `opposite` genuinely discriminates.
5. **A walkable route.** Every position reachable in one continuous pass a speaker can narrate without
   teleporting. **Draw the route before drawing the rooms.**
6. **Legible at 420 px tall** — `MapAsset.tsx:64` caps at `max-h-[420px]` with `object-contain`.
   More than ~12 labelled elements will not read.
7. **Theme-neutral.** Renders on `bg-card` in light and dark. Line art on transparent, or a light fill
   that reads in both — not a white-background screenshot.
8. **SVG**, `viewBox`, no external references, no embedded raster.

**The plumbing, verified end to end:**

```
file      content/core-en/media/listening/maps/lm_<slug>.svg
authored  "asset": { "src": "media/listening/maps/lm_<slug>.svg", "alt": "<≤25 words>" }
resolves  qtypes.ts:123 assetMediaPath()  →  /api/v1/media/packs/media/listening/maps/lm_<slug>.svg
serves    media.py:365 get_media(kind="packs") → _pack_asset() suffix-matches media_files.rel_path
checksum  tools/content/build.py compute_checksums() digests every file under media/ automatically
```

This is exactly the convention the reading module already uses for
`media/reading/diagrams/dg_front_pack_panel.svg`, verified present in `manifest.checksums`. **Nothing
new is needed.**

Two lints that matter more than they look:

- **`alt` is required and must not contain any keyed answer.** `assetAlt()` falls back to
  *"Map for question 14"*, which is a useless screen-reader experience for a spatial task. Write a
  real one: *"Plan of an allotment site; entrance at the bottom; main path running up the middle;
  five numbered positions."*
- **The `asset` object must serialise identically on every question of the group** —
  `AnswerSheet.tsx:33` hoists a shared asset by comparing `JSON.stringify(q.asset)`. A different key
  order on one question renders the plan five times.

**`spatial_cues[]` on the group is required** and must list the phrases the script actually uses.
**At least eight distinct items from at least three of these groups per map script:**

*Static position* — `opposite` · `next to` · `adjacent to` · `between … and …` · `across from` ·
`behind` · `in front of` · `at the corner of` · `at the far end` · `along the far wall` ·
`on either side of` · `backing onto` · `set back from` · `overlooking`

*Relative to a route* — `on your left / right` · `as you come through` · `as you come out of` ·
`just past` · `immediately after` · `just before` · `beyond` · `further along` ·
`at the end of the path` · `the first / second on your left` · `straight ahead of you` ·
`directly opposite`

*Movement* — `go straight on` · `carry on` · `turn left / right` · `go past` · `go through` ·
`go round` · `follow the path` · `head towards` · `cross` · `double back`

*Compass* (outdoor maps only) — `north` · `south-west` · `in the north-west corner` ·
`on the eastern side`

*Shape and size* (diagrams) — `circular` · `rectangular` · `curved` · `the wider end` ·
`the tapered end` · `the upper section`

**Safe original situations** (deliberately far from anything on the do-not-write list): a community
garden allotment site · a small regional airport arrivals level · a restored watermill · a university
sports centre across two floors (and the `ground floor`/`first floor` accent trap) · a farmers' market
in a square · a wetland hide and boardwalk · a campsite · a hospital outpatients wing. Diagrams: a
wormery · a bicycle repair stand · a coffee roaster · a rainwater harvesting system · a beehive.

---

## 8. Cluster assignments

Six agents. **9 new tests · 36 new script rows · 8 standalone drill scripts · 440 new questions**,
plus a full teaching retrofit of the 4 existing scripts (40 questions). The bank finishes at
**10 tests · 48 script rows · 480 questions**.

### 8.1 Global rules that apply to every cluster

**Part shape is fixed by position** (R2 §2, §7.3), and it is not negotiable:

| Part | Voices | Register | Question groups | Preview blocks | `target_band` |
|---|---|---|---|---|---|
| 1 | **2** | everyday transactional | 2 | 2 × 30 s | 5.0–5.5 |
| 2 | **1** | everyday informational | 2–3 | 2 × 30 s | 5.5–6.0 |
| 3 | **2–4** (2–3 typical) | academic conversational | 2–3 | 2 × 30 s | 6.5–7.0 |
| 4 | **1** | academic expository | 1–2 | **1 × 40 s, no mid-part pause** | 7.0–7.5 |

**Item difficulty is independent of part difficulty.** Every part must span roughly band 5.5 to 8 in
question-level demand regardless of its own `target_band`, because that is what discriminates. A part
whose ten items are all equally hard is not calibrated, it is flat.

**Spoken-word budget per part** (R2 §6.5): **700–950 words** of non-narrator speech, giving
`words_per_answer` of 55–95 (Part 4 may run denser, 45–70). Narrator lines do not count. A part under
600 spoken words is not an exam part; it is an exercise.

**Per-part content requirements, all lint-checked:**

- **Part 1** — ≥1 spelled-out proper noun (dotted form), ≥2 numeric answers, ≥1 read-back or
  confirm-back turn. Every Part 1 completion group carries an **Example row** in the layout (a filled
  field above question 1, not a question), because that is how the type calibrates the learner.
- **Part 2** — an *audience-directed* voice: second person, deixis (*just here*, *behind you*),
  explicit sequencing (*before we go in*, *on your way out*). The natural rhythm is
  **orientation → enumeration → practicalities**, and the group boundary usually straddles two of them.
- **Part 3** — every keyed opinion attributable to exactly one speaker, and **the other speaker must
  have said something adjacent-but-different**, or matching items do not discriminate. ≥1 negotiated
  outcome (proposal → objection → modification → agreement) where the key is the **settled position**,
  not the loudest turn. ≥1 item from trap family A. Simulate overlap with latched turns.
- **Part 4** — a **visible skeleton** (background → problem → factors → findings → implications),
  because the notes on the page mirror it and the candidate navigates by that mirror. **Every keyed
  term must be defined in the lecture**, and the definition must be what lets you spell it. Exactly
  **one digression of 15–30 seconds with no answer inside it**, and an audible return marker. Answers
  skew to concrete nouns and short noun phrases.

**Type mix per test** — a blueprint, not a straitjacket. Every test must use **≥6 distinct types**:

| Part | Draw from |
|---|---|
| 1 | `form_completion` 6–8 + a 2–4 question `multiple_choice` or `matching` tail; occasionally `table_completion` or `short_answer` |
| 2 | **`map_labelling` 5 + `note_completion` 5** — or `note_completion` 6 + `table_completion` 4 — or `sentence_completion` 4 + `multiple_choice` 3 + `matching` 3 |
| 3 | `multiple_choice` 5 + `matching` 5, alternating the categorising and box variants across tests; `sentence_completion` where the discussion reaches conclusions |
| 4 | `note_completion` 10 — or `note_completion` 6 + `sentence_completion` 4 / `table_completion` 4 / `summary_completion` 4 |

**Matching is two types with opposite reuse rules** and the instruction line is the only thing that
distinguishes them. Author both, and alternate them:

- **Categorising** — three reusable options (A/B/C), five items, *"You may choose any letter more
  than once"*, every option used at least once. The options are abstract attitudes and **the audio
  never says anything like them**, so the teachable unit is a phrase bank. Give at least one item a
  **reversal** (the speaker leans one way and lands the other). Part 3's workhorse.
- **Box matching** — five or more single-use options, four or fewer items, *"you may not need to use
  all the answer choices"*. The options are **proper nouns spoken verbatim** and the **stems** are
  the paraphrases — the exact inverse. Order the box alphabetically so its order carries no
  information. **Every unused option must be given an attractive near-miss property in the audio.**
  One misplacement forces a second, which is the worst marks-lost-per-mistake ratio in the paper.

**`topic_id`** must exist in `data/topics.jsonl` (20 ids). No cluster may use one `topic_id` more
than **4** times.

**Do-not-repeat — the four existing subjects and the template subject:** enrolling on an evening
course (`ls_t1_p1`) · a sports-centre duty-manager briefing (`ls_t1_p2`) · a student river-survey
tutorial (`ls_t1_p3`) · an urban-heat lecture (`ls_t1_p4`) · **a community allotment site induction
(reserved for `TEMPLATE.json`)**.

### 8.2 The six clusters

| Agent | Cluster slug | Owns | Script rows | New questions |
|---|---|---|---|---|
| **L-A1** | `core-transactional` | tests `lt_02`, `lt_03` | 8 | 80 |
| **L-A2** | `maps-and-places` | tests `lt_04`, `lt_05` | 8 | 80 |
| **L-A3** | `us-variety` | tests `lt_06`, `lt_07` | 8 | 80 |
| **L-A4** | `au-variety` | tests `lt_08`, `lt_09` | 8 | 80 |
| **L-A5** | `academic-depth` | test `lt_10` + 4 standalone drill scripts | 8 | 80 |
| **L-A6** | `retrofit-and-drills` | retrofit of `ls_t1_p1`–`ls_t1_p4` + 4 standalone drill scripts | 4 updated + 4 new | 40 retrofitted + 40 new |

**Accent allocation** — target ≈50% `uk`, 25% `us`, 22% `au` across the 48 rows, mixed *within*
tests. **No test may use one accent set for all four parts** (§9.4 lint 8).

| Agent | `uk` | `us` | `au` |
|---|---|---|---|
| L-A1 | 5 | 2 | 1 |
| L-A2 | 4 | 2 | 2 |
| L-A3 | 3 | 4 | 1 |
| L-A4 | 3 | 1 | 4 |
| L-A5 | 4 | 2 | 2 |
| L-A6 (new only) | 1 | 2 | 1 |
| existing (unchanged) | 3 | 1 | 0 |
| **Total (48)** | **23** | **14** | **11** |

At least **four scripts across the bank** must use **per-speaker `accent`** rather than a uniform
cast (§6.3) — L-A1, L-A2, L-A3 and L-A4 each author one.

---

#### L-A1 · `core-transactional` — Part 1's real work · ids `lt_02`, `lt_03`

Where the cheapest marks in the paper are, and where they are lost to spelling rather than listening.

| Type | Questions | Notes |
|---|---|---|
| `form_completion` | 14 | Two Part 1 groups. **Example row on every one** |
| `note_completion` | 20 | Parts 2 and 4 |
| `multiple_choice` | 14 | Including one `select_n: 2` "Choose TWO letters" item — one question object, two slots, order-insensitive set match already works (`listening.py:677`) |
| `matching` | 10 | One categorising group and one box group, one per test |
| `table_completion` | 10 | Part 1 and Part 2 |
| `sentence_completion` | 8 | Part 3 conclusions |
| `short_answer` | 4 | Part 2, single distinct stems |

Part 1 situations (pick 4, all distinct, none on the do-not-write list): reporting a lost item on a
bus · a bike repair booking · a storage-unit hire enquiry · a childcare-club place · a driving-lesson
booking · a council recycling-permit enquiry · a group restaurant booking · a casual-work enquiry.

**Teaching centre of gravity:** answer-form discipline and the read-back. Every Part 1 group's
`watch_out` names an answer-form loss. Both tests must exercise `spelling_correction`,
`readback_correction` and `digit_reading`, and `metrics.spelled_out_answers ≥ 1` on all four Part 1s.

---

#### L-A2 · `maps-and-places` — the type with zero content · ids `lt_04`, `lt_05`

**The only agent authoring `map_labelling`, and the owner of the SVG assets.** Read §7.3 in full and
confirm with the verify agent whether the asset pipeline has been exercised before authoring Format A.

| Type | Questions | Notes |
|---|---|---|
| `map_labelling` | 20 | **Four groups of 5** — two per test, one in each Part 2, plus one Part 4 diagram group. Format B unless the asset is confirmed |
| `note_completion` | 18 | |
| `form_completion` | 12 | |
| `multiple_choice` | 12 | |
| `matching` | 10 | |
| `sentence_completion` | 8 | |

Four original SVGs to author, drawn **before** the script that describes them:
`lm_market_square.svg` (a farmers' market layout) · `lm_wetland_hide.svg` (a boardwalk and hide on a
reserve) · `lm_sports_centre.svg` (two floors — carries the `ground floor`/`first floor` lexical
accent trap) · `lm_wormery.svg` (a Part 4 diagram).

**Teaching centre of gravity:** the orientation move, the official order guarantee, and the landmark
that is a reference point rather than an answer. Every map group carries ≥8 `spatial_cues` from ≥3
groups and at least one `decoy_first` on a landmark.

---

#### L-A3 · `us-variety` — North American lexis and conventions · ids `lt_06`, `lt_07`

The only cluster where the phonology genuinely matches the label, so the lexis must too.

| Type | Questions | Notes |
|---|---|---|
| `note_completion` | 22 | |
| `multiple_choice` | 16 | Part 3-heavy |
| `matching` | 14 | Both variants |
| `form_completion` | 10 | zip codes, `first floor`, `cell` |
| `table_completion` | 8 | |
| `sentence_completion` | 6 | |
| `summary_completion` | 4 | Part 4, gapped paragraph under `note_completion` |

**Teaching centre of gravity:** North American lexis as a comprehension blocker (a learner cannot
infer a word they have never met, however clearly it is pronounced) and the flapped `/t/` in numbers
(*twenty* → "twenny"). At least six answers across the two tests must be US/UK spelling pairs, **each
keyed with both forms** — this cluster is the module's stress test for §9.4 lint 26.

---

#### L-A4 · `au-variety` — the accent set that does not exist yet · ids `lt_08`, `lt_09`

**No `au` row exists in the bank today.** Read §6.3 before writing a line.

| Type | Questions | Notes |
|---|---|---|
| `note_completion` | 20 | |
| `form_completion` | 12 | day-first dates, *double* for repeats |
| `multiple_choice` | 14 | |
| `matching` | 12 | |
| `table_completion` | 10 | |
| `sentence_completion` | 8 | |
| `short_answer` | 4 | |

Every `au` script carries a non-null `teaching.accent_note`. Every `au` script uses **≥5 items from
the AU lexis contract** in `lines[]`, and **at least two of them appear in `pre_teach`**. Answers use
`-ise` and `-our`; `program` rather than `programme`. **Never key an answer on a slang item.**

**Teaching centre of gravity:** the High Rising Terminal, taught explicitly in `accent_note` and
exercised by at least one item per test where a statement-final rise carries a fact; plus the
institutional vocabulary (`uni`, `TAFE`, `Year 12`, `unit`, `public holiday`, `GP`, `footpath`) that
blocks comprehension in a way no amount of ear training fixes.

---

#### L-A5 · `academic-depth` — Parts 3 and 4, where the band is decided · id `lt_10` + 4 drill scripts

Parts 1–2 are near-ceiling for anyone at band 6; **the difference between 6.5 and 7.5 lives almost
entirely in the second half of the test** (R3 §10.5). This cluster builds the material that makes a
Part-3-only or Part-4-only drill possible.

`lt_10` (40 questions, all four parts, normal shape). Then four standalone drill scripts, **not
referenced by any test row** — they exist so a drill can be filled without burning a whole test:

| Id | Part | Shape | Questions |
|---|---|---|---|
| `ls_dx_a501` | 3 | three-speaker tutorial — `matching` (categorising) 5 + `multiple_choice` 5 | 10 |
| `ls_dx_a502` | 3 | two-speaker method argument — `multiple_choice` 6 + `sentence_completion` 4 | 10 |
| `ls_dx_a503` | 4 | lecture — `note_completion` 10 with a dense structure skeleton | 10 |
| `ls_dx_a504` | 4 | lecture — `note_completion` 6 + `table_completion` 4 | 10 |

Part 4 fields (pick 4, none repeated across the cluster): plant science · archaeology dating methods ·
materials failure · child development · history of a technology's diffusion · urban street design ·
sports science · applied economics of tourism.

**Teaching centre of gravity:** attribution and the settled position (Part 3); structure-marker
navigation and recovery (Part 4). Every `ls_dx_a50*` Part 4 script must carry a `signpost_map` with
≥12 entries including the digression-and-return pair, because those four scripts are the raw material
for the signpost and recovery drills.

---

#### L-A6 · `retrofit-and-drills` — the heaviest teaching-only load · updates + 4 drill scripts

Two jobs. The first is the larger one.

**Retrofit:** `ls_t1_p1`–`ls_t1_p4` get the complete teaching payload at all three levels, and
almost nothing else changes. Rules:

- **Do not rewrite a prompt, an option, an answer key, a question or a scenario.** The test is in use.
- `script_json.schema_version` goes `1` → `2`.
- Add `teaching` at script, group and question level per §§1–3, plus the `groups[]` index per §2.
- `explanation` may be **rewritten into the §1 five-move shape**, but never to a different claim.
- **Three `lines[]` edits are mandatory and they are the only line edits permitted:**
  1. **`ls_t1_p1` line 8 and line 12: replace `O-K-A-F-O-R` and `B-E-L-L-F-I-E-L-D` with
     `O. K. A. F. O. R.` and `B. E. L. L. F. I. E. L. D.`** These two lines render unintelligibly
     today (§6.4) and they are the bank's two highest-severity content defects. Sweep all four
     scripts for the pattern `\b(?:[A-Za-z]-){2,}[A-Za-z]\b` and report every hit.
  2. **Add the missing CUE narrator line** after every preview pause in all four scripts (§6.6).
  3. **Add the whole-test intro** to `ls_t1_p1` before its ORIENT line, and set
     `pause_plan.whole_test_intro: true`.
  These change `audio_hash`, so the four parts must be re-rendered. Flag it in the handover.
- Where an existing item has no trap, author `distraction: null` rather than inventing one.

**New:** four standalone drill scripts sized for the mini-modes:

| Id | Part | Purpose | Questions |
|---|---|---|---|
| `ls_dx_a601` | 1 | **number and spelling density** — 10 answers, every one a `proper_name`, `code`, `quantity`, `date` or `time`; ≥3 spelled out; ≥2 confirm-back turns | 10 |
| `ls_dx_a602` | 1 | **correction density** — every item carries a family-C or family-N trap, varied across all five C slugs. The one place the "4–6 trapped items" rule is deliberately waived, and `what_makes_this_hard.note` must say so | 10 |
| `ls_dx_a603` | 2 | **signpost density** — a `signpost_map` of ≥12 entries covering ≥8 of the 11 kinds | 10 |
| `ls_dx_a604` | 2 | **dictation source** — a monologue authored for 20–40 second clips: clean connected speech, weak forms, linking, no unusual proper nouns | 10 |

**Teaching centre of gravity:** the retrofit is what makes the one test we already have worth sitting,
and the four drill scripts are what make the drill modes real instead of theoretical.

### 8.3 Resulting coverage — floors the verify agent checks

| Type | Existing | L-A1 | L-A2 | L-A3 | L-A4 | L-A5 | L-A6 | **Total** | Floor |
|---|---|---|---|---|---|---|---|---|---|
| `note_completion` | 17 | 20 | 18 | 22 | 20 | 26 | 12 | **135** | 110 |
| `multiple_choice` | 7 | 14 | 12 | 16 | 14 | 20 | 6 | **89** | 70 |
| `matching` | 10 | 10 | 10 | 14 | 12 | 10 | 4 | **70** | 60 |
| `form_completion` | 6 | 14 | 12 | 10 | 12 | 4 | 10 | **68** | 56 |
| `table_completion` | 0 | 10 | 0 | 8 | 10 | 8 | 4 | **40** | 32 |
| `map_labelling` | 0 | 0 | 20 | 0 | 0 | 4 | 0 | **24** | 20 |
| `sentence_completion` | 0 | 8 | 8 | 6 | 8 | 6 | 2 | **38** | 32 |
| `short_answer` | 0 | 4 | 0 | 0 | 4 | 2 | 2 | **12** | 10 |
| `summary_completion` | 0 | 0 | 0 | 4 | 0 | 0 | 0 | **4** | 4 |
| **Total** | **40** | **80** | **80** | **80** | **80** | **80** | **40** | **480** | |

Six types clear 30 questions, so a 20-question drill becomes possible for all of them — today the
bank cannot fill one for **any** type. **`map_labelling` reaches 24 and no further**, because four
original SVGs is the honest ceiling for this push; the drill picker must say so rather than serving a
short set silently. `summary_completion` reaches 4 and is a demonstration, not a drill.

---

## 9. Staging format, ids, merge contract and lints

### 9.1 File location and shape

Each authoring agent writes **one** file:

```
content/core-en/staging-listening/tests/<cluster-slug>.json
```

A single JSON object:

```jsonc
{
  "staging_version": 1,
  "cluster": "core-transactional",          // must equal the filename stem
  "authored_by": "L-A1:core-transactional",
  "tests": [                                // 0–2 entries
    { "test":    { /* one listening_tests.jsonl row, exactly 6 keys */ },
      "scripts": [ /* exactly 4 listening_scripts.jsonl rows, in p1,p2,p3,p4 order */ ] }
  ],
  "standalone_scripts": [ /* 0–4 script rows not referenced by any test */ ],
  "updates": [                              // in-place edits to rows that already exist
    { "id": "ls_t1_p1", "op": "replace_script_json", "script_json": { /* the WHOLE new document */ } }
  ],
  "assets": [                               // files the agent also wrote, for the checksum sweep
    "media/listening/maps/lm_market_square.svg"
  ]
}
```

**A row is the JSONL row, not a nested wrapper.** A `scripts` entry has exactly the keys
`id · part · title · topic_id · accent_set · target_band · script_json · audio_hash`, in that order,
with `"audio_hash": null` (the renderer fills it). A `test` entry has exactly
`id · title · p1_id · p2_id · p3_id · p4_id`. Never author `source`, `retired`, `created_at` or
`validation_report_json` — the loader supplies them.

`TEMPLATE.json` is itself a valid staging file with one `standalone_scripts` entry. Copy its shape
exactly.

### 9.2 Id convention — collision-proof by construction

```
Test                  lt_<NN>                NN = 02..10
Test part script      ls_<NN>_p<K>           K = 1|2|3|4
Standalone drill      ls_dx_<agent><NN>      agent = a5|a6, NN = 01..04
Map / diagram asset   media/listening/maps/lm_<slug>.svg
Template              ls_tm_00_p2            RESERVED — do not author
```

Row-local ids: speakers `narrator`, `s1`, `s2`, `s3`; groups `g1`, `g2`, `g3`.

The four existing rows are `ls_t1_p1 ls_t1_p2 ls_t1_p3 ls_t1_p4` and the one existing test is
`lt_test_1`, so **no new id can collide with anything shipped** — the `ls_t1_*` and `lt_test_*` forms
are never reissued.

### 9.3 The merge step (mechanical, no judgement)

**The merge is an UPSERT KEYED ON `id`, never a blind append.** That single choice is what makes a
re-run safe, and it is worth stating as code because an append-based merge run twice produces
duplicate ids, which `validate_rows()` rejects (`validate.py:435`) — turning a harmless second run
into a whole-pack failure that looks like a content bug.

```
load data/listening_scripts.jsonl  -> scripts: ordered dict keyed by id, insertion order preserved
load data/listening_tests.jsonl    -> tests:   ordered dict keyed by id

for each file in staging-listening/tests/*.json, sorted by filename:
    for each entry in file.tests:
        for row in entry.scripts:
            if row.id in scripts and row.id not in this_run_wrote:  FAIL  # cross-agent collision
            scripts[row.id] = row                                   # new id -> appended at the end
        if entry.test.id in tests and not in this_run_wrote:        FAIL
        tests[entry.test.id] = entry.test
    for row in file.standalone_scripts:  (same rule)
    for u in file.updates:
        if u.id not in scripts:                                     FAIL  # nothing to update
        assert u.op == "replace_script_json"
        scripts[u.id]["script_json"] = u.script_json                # ONLY this column
        # audio_hash is left as-is here and invalidated by the re-render step below

write both files back in dict order, one json.dumps(row, ensure_ascii=False) per line
then: uv run --project sidecar python -m tools.content.build content/core-en
```

Nothing else. No transformation, no id rewriting, no defaulting, no re-ordering of existing lines —
an upsert on an existing key overwrites in place and keeps its original position, so the four
retrofitted rows stay lines 1–4 of the file.

**Idempotency is the acceptance test for the merge tool, not an aspiration.** Run it twice over the
same staging files; the second run must leave `listening_scripts.jsonl` and `listening_tests.jsonl`
**byte-identical**. If it does not, the merge tool is wrong. Diff the two runs before believing it.

Expected counts after the full merge: **`listening_scripts` 48 · `listening_tests` 10 ·
`listening_questions` 480**. `tools.content.build` rewrites `manifest.counts` and
`manifest.checksums` (including every new SVG under `media/`) and re-validates the whole pack.
**Nobody hand-edits `manifest.json`.**

**Audio re-render is a separate, required step.** The four retrofitted rows change `audio_hash`
because L-A6 edits their `lines[]`. Every new row has no render at all. After the merge:

```
POST /api/v1/listening/tests/{id}/render      for lt_test_1 .. lt_10
POST /api/v1/listening/scripts/{id}/render    for every ls_dx_* row
```

### 9.4 Lint rules the merge gate runs (write to pass these)

**Structural**

1. `cluster` == filename stem == the §8.2 allocation.
2. Every `scripts` array has exactly 4 rows with `part` 1,2,3,4 in order; `test.p1_id`…`p4_id` equal
   their `id`s in order.
3. Every id matches §9.2; no duplicate id anywhere in the pack; no `updates` id absent from
   `data/listening_scripts.jsonl`.
4. Script rows carry exactly the 8 allowed keys; test rows exactly the 6 allowed keys;
   `audio_hash` is `null` on every authored row.
5. `topic_id` exists in `data/topics.jsonl`; no cluster uses one `topic_id` more than 4 times.
6. `script_json.part` == row `part`; `script_json.accent_set` == row `accent_set`;
   `script_json.target_band` == row `target_band`; `schema_version == 2`.
7. `speakers[]` count matches the part (2 / 1 / 2–4 / 1); every speaker has `id`, `name`, `role`,
   `accent`, `voice`; every `voice` is a real Kokoro id; every dialogue pair is on the §6.2 approved
   list; `bm_fable` and `am_onyx` never appear in a multi-speaker script.
8. Across a test's four rows, `accent_set` takes **≥2 distinct values**.
9. **Question numbers across a test's four rows are exactly `{1..40}`**, contiguous, ascending inside
   each row, 10 per row. Standalone rows use 1–10.
10. `part` ∈ 1–4; `accent_set` ∈ `{uk,us,au}`; `target_band` inside the §8.1 band for its part.
11. `metrics` recomputes correctly; `spoken_words` 700–950 (600–950 for a standalone drill row);
    `trapped_items` 4–6 (waived only for `ls_dx_a602`, which must say so in `what_makes_this_hard`);
    `longest_line_chars` ≤ 350.
12. **`groups[]` partitions `questions[]` exactly**; each group's numbers contiguous and ascending;
    each group's `type` and `instruction` equal those of **every** member question, byte for byte.
13. **No completion-type question carries a non-empty `options`**; every letter-type question does.
14. `group.teaching.answer_order == "sequential"` on every group.
15. `pause_plan` covers every question number once; Parts 1–3 have exactly 2 blocks, Part 4 exactly 1;
    `preview_ms` 30000 (Part 4: 40000); each `cue_line_index == preview_line_index + 1` and both are
    narrator lines; every group lies inside one block; `check_ms == 30000`.

**Answers, evidence and the audio**

16. `teaching.prediction.cue` is an exact substring of that question's `prompt`; `range` non-null iff
    `slot` ∈ {`quantity`, `code`, `date`, `time`}.
17. `teaching.signpost.phrase` is an exact substring of `lines[signpost.line_index].text`, and
    `signpost.line_index` ∈ {`cue_line_index`, `cue_line_index - 1`}.
18. **`teaching.answer_quote` is an exact substring of `lines[cue_line_index].text`**, 4–25 words, and
    contains at least one keyed answer variant (case-insensitively, after `normalize_answer`).
19. `paraphrase_link.printed` is an exact substring of `prompt` on a completion type, or of
    `options[<the keyed letter>]` on a letter type (§1.4); `paraphrase_link.audio` is an exact
    substring of `lines[cue_line_index].text`.
20. `distraction.signal` is an exact substring of `lines[distraction.decoy_line_index].text`;
    `decoy_line_index` is a valid index; `option_diagnosis[].heard_at` are valid indices, distinct
    within a question, and cover every non-keyed option exactly once.
21. Trap distribution per §5.1; bank-wide every family C/R/A/N/L slug carried by ≥8 questions.
22. Every keyed answer passes `within_word_limit()` against its own `word_limit`; **every keyed
    answer for a `TEXT_TYPES` question is spoken in `lines[cue_line_index].text`** in exactly the form
    keyed (after `normalize_answer` on both sides).
23. Letter groups: every keyed letter exists in `options`; a single-use box group has no repeated key;
    option lists have **more options than questions**; a categorising group uses every option ≥ once.
24. **Every question in a `map_labelling` group serialises `asset` identically** (same keys, same
    order); `asset.alt` present, ≤25 words, and containing **no keyed answer**; the referenced SVG
    exists under `content/core-en/media/`.
25. `answers[]` carries no `note` describing leniency the exam does not grant. Authored variants are
    genuine alternatives only.
26. **Every keyed answer containing a word from `answers.US_UK_PAIRS` carries both spellings.** Run
    `spelling_variants()` over every variant of every key; a missing partner fails the merge. *(This
    is the single most likely way for our pack to mark a correct answer wrong: `answers_match('center',
    ['centre'])` is `False`.)*
27. No key contains `/` inside a unit (`km/h` expands to `h`); no key contains a currency symbol
    unless the bare-figure form is keyed alongside it; no key is a homophone whose partner the audio
    cannot disambiguate (`fair`/`fare`, `stationary`/`stationery`, `site`/`sight`,
    `practice`/`practise`).

**Audio rendering (the phonemizer gate — run before the merge, not after)**

28. **No `lines[].text` matches `\b(?:[A-Za-z]-){2,}[A-Za-z]\b`** (a hyphen-spelled name).
29. No `lines[].text` contains a 4+-digit run except a 21st-century year in a date context, or a
    genuine quantity; no `\d+\.\d+` except a clock time `\b\d{1,2}\.[0-5]\d\b`; no `[£$€]\d`;
    no 20th-century year as digits; no `\b(?:Dr|St|Rd|Ave|Mt|Prof)\.`; no bare ` - `.
30. `pause_after_ms` present on every line, inside [0, 60000], and following §6.6's table: ≥800 after
    any answer-bearing line unless ≥15 spoken words of non-answer material precede the next answer;
    ≥1200 before the first map answer; 400–600 before every `distraction.signal` line.
31. **Every invented proper noun passes `Tokenizer.phonemize()`** without producing a pseudo-word; the
    verify agent runs it and reports any that need the (unavailable) `phonemes` escape hatch.

**Teaching payload**

32. Every question has `teaching` with `schema_version`, `prediction`, `signpost`, `answer_quote`, and
    the keys `paraphrase_link`, `distraction`, `form`, `recovery` present (values may be null per §1).
33. `option_diagnosis` present on every letter-type question and absent on every other.
34. `form` non-null on every answer that is a name, number, date, time, unit or plural-sensitive noun.
35. `recovery` non-null on every question following a trapped question, and on every Part 4 question.
36. Group `teaching` complete per §2; `spatial_cues` present with ≥8 entries drawn from ≥3 of the
    §7.3 **cue families** (static position / relative-to-route / movement / compass / shape) on every
    `map_labelling` group; `bank_note` present on every group with a shared lettered bank.
37. Script `teaching` complete per §3; `pre_teach` 5–8 entries each naming a real `blocks_q` on this
    row and a valid `line_index`; `signpost_map` 10–16 entries (≥12 on Part 4 and on `ls_dx_a603`),
    each `phrase` an exact substring of `lines[line_index].text`, and **every per-question
    `teaching.signpost` present in it** as a `(line_index, phrase)` pair;
    `accent_note` non-null on every `au` row.
38. `explanation` follows the five-move shape (§1) and never says "the answer is in line N".
39. All word and character limits in §§1–3 respected.

**Originality and safety**

40. No 8-gram is shared between any two scripts in the file, or with any existing script.
41. No banned claim from §0.3 appears in any string; no situation from the do-not-write list; no real
    organisation, real person or real statistic.
42. No item depends on tone of voice, on genuine overlap, or on a stress-only minimal pair without a
    confirm-back turn.

### 9.5 Post-merge, before hand-off

```
uv run --project sidecar python -m tools.content.build content/core-en
```

then re-render the audio (§9.3), then a live check that the payload reaches the app and that the mock
does not leak it:

```
GET  /api/v1/listening/scripts/ls_04_p2                            → question.teaching absent
GET  /api/v1/listening/scripts/ls_04_p2?with_answers=1             → 403 with no submitted attempt   (L-D2)
GET  /api/v1/listening/attempts/{in_progress}/review               → 409                             (L-D2)
GET  /api/v1/listening/attempts/{submitted}/review                 → question.teaching present       (L-D1)
GET  /api/v1/media/packs/media/listening/maps/lm_market_square.svg → 200                             (§7.3)
GET  /api/v1/media/listening/{hash}.timing.json                    → line count == len(lines)
```

The verify agent must confirm all six before declaring the push done. If L-D1 has not landed, **the
content is correct and merges, but the Coach has nothing to render** — report it as a release blocker.
If L-D2 has not landed, **the mock serves its own answers** — report that as a release blocker too.

---

## 10. Features, ranked by learner impact

Each feature names exactly which payload fields it consumes, so content and UI cannot drift.

### F1 — The Listening Coach, attempt-gated · impact very high · cost M

**Consumes:** `question.teaching` in full, `cue_line_index`, `explanation`, the part transcript, and
`timing.json`.

The listening counterpart of the reading Solution Card, but built as a **timeline** rather than a
worked solution. On the review screen every question expands into a five-part card in a **fixed
order**, matching §0.2:

1. **BEFORE — "What you could have known."** `prediction.slot` as a chip, `prediction.cue`
   highlighted inside the prompt, `prediction.note` as one line. If the learner used the prediction
   gate (F4), their own guess is shown beside the authored slot.
2. **APPROACH — "What announced it."** `signpost.phrase` as a button; pressing it seeks the audio to
   `start_ms(signpost.line_index)` and highlights the phrase in `TranscriptPanel`. The `kind` renders
   as a small badge.
3. **THE MOMENT — "What was actually said."** `answer_quote` highlighted inside its line, with a
   **Replay this** button covering `start_ms(cue) − 3000` to `end_ms(cue) + 1500`. Where
   `paraphrase_link` is present it renders as two chips joined by an arrow — the printed phrase and
   the spoken phrase — which is listening's version of the reading module's paraphrase link and the
   most valuable single row on the card.
4. **THE TRAP — the back-to-back replay.** Where `distraction` is non-null, the decoy line and the
   answer line play **consecutively**, the decoy struck through in amber with `signal` boxed, the
   answer in green. Then `distraction.note`. This is the highest-value single element in the whole
   module: it shows the learner the exact three seconds where their mark was lost.
5. **AFTER — `recovery`**, plus `form.note` when the answer was a near miss.

On letter types, part 4 is replaced by `option_diagnosis`, one row per non-keyed option, **the option
the learner actually chose pinned to the top and outlined**, each with a seek button to `heard_at`.

The card is **unavailable until the attempt is submitted**, and that lock lives in the sidecar
(L-D2), not the renderer.

### F2 — Cause-before-reveal · impact very high · cost S

**Consumes:** `question.teaching.distraction.trap` and `form.risk` as the answer key to the picker.

The cheapest high-impact feature in the module, and the one the pedagogy research is most direct
about: the first thing shown after a miss must be **a question, not an explanation**. Four buttons,
nothing else visible:

> ◦ I didn't hear it at all
> ◦ I heard it but I was still writing the last one
> ◦ I wrote the first thing I heard, and they changed it
> ◦ I heard it right but I spelled it wrong

Each maps to a different remedy and a different drill, and the fourth is the one that must be
**praised as a hearing success while still scoring zero** — the two have to be reported separately or
the learner draws exactly the wrong lesson. Only then does F1 unlock.

The learner's self-diagnosis and the authored `trap`/`form.risk` are both stored, and **their
disagreement rate is itself a metacognition metric** worth showing.

### F3 — The trap profile and trap-filtered drills · impact very high · cost S–M

**Consumes:** `distraction.trap` and `form.risk` aggregated across attempts.

Today the results screen says *"note completion 6/10."* Tomorrow, additionally: *"You lost 9 marks to
three things: self-correction (4), synonym-only (3), spelling (2)."* Each line assembles a drill of
items carrying that slug **across all types and all parts**, which is a far better selector than
`qtype`.

**`form.risk` must be a separate headline number**, never folded into "wrong". *"You lost 3 marks to
spelling — that is the whole 6.5 to 7.0 gap, and it needs three weeks, not six months."* That is the
single most motivating diagnosis the module can produce, and `near_miss_spelling` already computes
the trigger.

Needs a `trap_codes_json` column on `listening_questions`, derived in `derive_listening_questions`, to
be selectable without scanning every document in Python.

### F4 — The prediction gate in the preview pause · impact very high · cost low

**Consumes:** `question.teaching.prediction.slot` and `.note`.

Turns the 30-second preview from dead air into the module's signature interaction. During the
existing preview pause, each visible question shows a row of slot chips. The learner taps one. On
review: *"You predicted a number. It was a plural noun — that's why 'twenty' looked plausible."*

Auto-gradeable, four seconds per item, and it directly trains the behaviour that separates competent
candidates from anxious ones. It is also the cheapest thing here that no competitor does well.

**Off in exam mode**, because adding a metacognitive control makes practice less like the test.

### F5 — The strategy card · impact high · cost S

**Consumes:** `group.teaching` in full, plus a **static per-type page** written once from R1 §§4–5.

In the review and drill panes, a collapsible card above each group carrying its authored `strategy`,
`order_note`, `preview_focus` and `watch_out`. In the type browser, the static page: what the type
tests, its two characteristic losses, whether its answers run in recording order, its per-question
budget.

`answer_order` renders as a single unmissable **In recording order** badge on every group — because
in Listening it is *always* true, which is exactly the fact learners coming from Reading do not have.
Never shown during a mock.

### F6 — The cascade detector · impact very high · cost S

**Consumes:** attempt data only, plus `recovery`.

Consecutive wrong answers following a single miss are a distinct diagnostic pattern, and we already
store the per-question data to compute it. *"You lost Q17. Then you lost 18 and 19, and those were
easier. That one miss cost you three marks — and four marks is the whole 6.5 to 7.0 gap."*

Far more actionable than "you got three wrong", and it is the highest-value single analytic in the
module. The debrief ends with the authored `recovery` note for the question **after** the miss, which
is the specific handhold that was available and unused.

### F7 — The drills · impact high · cost M

All five are seeded from content this push authors. None needs new audio.

**a. Dictation.** A 20–40 second clip, unlimited replay, free-text box. Grade into **four buckets**,
never a single WER percentage: *missed function word* (weak-form deafness — the highest-signal bucket
and the one learners never notice), *wrong word right sounds* (segmentation), *right word wrong
spelling* (orthography, not hearing), *nothing heard* (overload). Headline:
*"you heard 34 of 41 words; 5 of the 7 you missed were function words."* Extend `near_miss()` in
`answers.py` — do **not** write a second Levenshtein. Prescribe it on evidence: a learner with ≥2
`near_miss_spelling` tags in an attempt is routed straight into a dictation session seeded with
exactly those cue lines.

**b. Number and spelling.** Phone numbers, postcodes, prices, dates, `-teen`/`-ty`, spelled names.
Generative — synthesize on demand, no scripts needed — scored exactly, and it targets the
mechanically commonest lost marks. `ls_dx_a601` is its authored anchor set.

**c. Signpost recognition.** Play a 6-second clip from `signpost_map`, ask what kind of thing is
coming next, four options drawn from the same script's other kinds. Also the **position-tracking**
variant: play a part with the questions hidden and have the learner tap each topic shift, scored
against `signpost_map` line indices. `ls_dx_a603` is the anchor.

**d. Prediction, with no audio at all.** Show a question set, run a 30-second timer, ask the learner
to slot-type every gap, reveal the authored `prediction.slot`. **Listening practice with no audio** —
cheap, replayable, and immune to the once-only constraint. Extends into the synonym variant: show the
printed stem, ask for three ways a speaker might say it, reveal `paraphrase_link.audio`.

**e. Recovery.** Take an authored script, suppress the audio for the six seconds around question *n*,
and score questions *n+1* … *n+3*. The learner's own cascade rate becomes a number. Needs only a range
on the `timing.json` we already generate.

### F8 — The Mock · impact high · cost M

**Consumes:** nothing. Deliberately consumes **no** teaching field — that is the point.

**One session: 4 parts, 40 questions, audio once, then a 2-minute check, one submit.** The attempt is
created with `mode: "exam"`, which `MODES` already accepts.

**We model the computer-delivered test, and the reasoning is dated and specific.** IDP announced in
July 2026 that IELTS in India — the single largest market — goes computer-delivered only from
September 2026, and even the "IELTS on Computer (Writing on Paper)" hybrid keeps Listening on
computer; One Skill Retake, which makes an isolated listening score directly actionable, is available
on computer only. The realistic assumption for a BandReady user is that they will type answers as they
hear them and get about two minutes to check. `CHECK_SECONDS = 120` already implements it.

**Paper mode is offered as an explicit alternative, not the default** — answers into a scratch layer
during the audio, then a **10-minute transfer** phase. It is worth keeping because it drills a
genuinely different skill (deferred decision-making) and because paper is still the format in many
countries. The mnemonic that stops the confusion, and it belongs in the briefing: *paper gets 10
minutes because paper has to move the answers; computer gets 2 because the answers are already where
they need to be.* The 10 minutes is a clerical allowance, not a thinking period.

**Exam conditions, enforced server-side:**

| Condition | Enforcement |
|---|---|
| The audio plays **once** | `play_count` is already recorded per script and per attempt (`listening.py:810`). In exam mode a second play request on the same script is **refused by the server**, not hidden by the renderer |
| No pause, no seek, no rewind | The player exposes no transport controls in exam mode, and the server does not issue a second media ticket for a script already played |
| No key, ever, during the attempt | `_public_script` omits `answers`, `cue_line_index` and `explanation` unless `with_answers` — which **L-D2 must gate behind a submitted attempt** |
| No transcript | `_public_script` withholds `lines` unless `with_answers`; the review endpoint is the only source, and **L-D2 must 409 it until submitted** |
| **No coaching, anywhere** | **L-D1**: `teaching` is projected *only* by the review endpoint. It is absent from the in-attempt response body, not hidden behind a flag — there is nothing to reveal with a devtools toggle |
| No drills, no generation, no second attempt | While an exam-mode attempt is `in_progress` for the profile, drill and generate endpoints return 409 |
| One clock | A single countdown across the four parts, then the 2-minute check |
| Prediction gate off | F4 is not mounted |
| Auto-submit at 0:00 | Already implemented by `CheckStep` |
| Leaving | Navigating away requires an explicit **Abandon mock** confirmation; the clock does not pause |

**The report leads with raw score, then the per-part split, then the band with its disclaimer.** Raw
score is the headline because band 5.5 is five marks wide and a learner improving inside it must be
able to see it. The per-part split is second because *"Parts 3–4 are the hard ones"* is not a usable
diagnosis: **Part 3 punishes losing track of who thinks what; Part 4 punishes losing your place**, and
those need completely different practice. Then the form/comprehension split (F3), then the cascade
(F6), then **one recommended next action** — never a table of percentages.

### The briefing cards we owe the learner, outside the item payload

Short, static, written once: the **preview protocol** (§2.2) · **spelling and form** (§1.6 — the
highest marks-per-word copy in the module) · the **correction trap** and the last-value-wins rule
(§5.5) · **recovery and the cascade arithmetic** (§1.7) · **Part 4 expectations** — *you are not
supposed to understand the lecture; you are supposed to catch ten short bursts inside it* ·
**paper vs computer** (F8) · the **accent disclosure**, stated plainly: *"BandReady's synthesised
voices cover British and North American English. Our Australian sets use Australian vocabulary and
conventions with approximated voices. The real test also uses Australian and New Zealand speakers —
plan extra exposure."* · and the **band-table caveat** with the Academic/GT identity note.

One more piece of honesty worth shipping, because it is more motivating than the alternative: much of
what this module teaches **is test-wiseness**. Field's own IELTS-commissioned research found
candidates adopting routines tailored to the test method. That is legitimate — the learner needs the
band — but say it: *"these techniques are for the exam; the dictation and accent drills are for your
English. Do both."*

### Explicitly not built

A model answer, or any field pretending to be one · the Coach before an attempt · a band score after a
single-part drill · replaying the audio during an exam-mode attempt · an LLM explanation as the
*primary* explanation (authored payload first; "why was I wrong" is a second layer for the learner's
specific wrong answer) · a capitalisation warning on any answer field, or a review screen that
highlights a case difference as an error — case is not marked, and flagging it teaches a false rule ·
any per-type frequency claim · any numeric penalty attached to a strategy · an item that hinges on
tone of voice.

---

## 11. Authoring checklist — run this before you write the file

1. **Choose the situation first. It is 60% of writing the items.** Each situation type carries a
   characteristic set of things that can be asked and a characteristic distractor move. Pick from R2
   §4's inventories (24 Part 1, 22 Part 2, 21 Part 3, 24 Part 4 fields) and check it against the
   do-not-write list.
2. **Write the script before the questions, and write it as speech.** Contractions, fillers at turn
   starts, short reactive turns, self-interruption. If it reads like written prose, the learner is
   practising the wrong thing. Then read it aloud; anything you stumble over, Kokoro will too.
3. **Plant the answers, then write the questions around them.** Every keyed completion answer must be
   a span the script actually speaks, within the stated limit. If the natural utterance has no ≤N-word
   span that answers the gap, **fix the script or the limit — never the key.**
4. **Write the printed stem as a genuine paraphrase**, never the audio's own sentence with a hole in
   it. If the learner can complete the item by waiting for the stem's words, the item tests nothing.
   This is the single biggest quality difference between an authored listening item and a generated one.
5. **Check the gap's grammar fixes the answer's form.** If both singular and plural read
   grammatically, **rewrite the item**. A learner who heard the fact and wrote the wrong number has
   been failed by the item.
6. **Plant the traps deliberately, to the §5.1 distribution, and leave half the items clean.** Then
   record `decoy` and `decoy_line_index` for every one — that is what the back-to-back replay runs on.
7. **Mark every correction lexically and give it a 400–600 ms run-up.** Our audio has no contrastive
   stress. A correction the render cannot signal is a broken item, not a hard one.
8. **Run the audio gate before anything else:** no hyphen-spelled names, no bare digit runs, no
   currency symbols, no 20th-century years as digits, no abbreviations, no bare dashes. Then
   `Tokenizer.phonemize()` every proper noun and every number line. It takes 0.3 s to load the model
   and it catches essentially every defect in §6.
9. **Check speaker F0 separation before finalising any same-sex dialogue**, and prefer mixed-sex casts
   — which is also what the exam does.
10. **Run the no-audio pass on yourself.** Read your questions with the script covered. Anything you
    can answer confidently is testing world knowledge, not listening — rewrite it.
11. **Every teaching note must be executable at the moment it describes.** "Read more carefully" is
    not a note. "The frame says *three*, so you were already waiting for a plural — write the `-s`
    before you look up" is.
12. **Vary your own wording across your eight scripts.** Eight `strategy` fields built from one
    sentence, or eight identical `watch_out` lines, is a tell that this was generated rather than
    authored. Lint 40 catches the crude version; you must catch the rest.
13. **Copyright self-check on every sentence before you commit it.** Did I read or hear this
    somewhere? If there is any doubt at all, throw it away and write a different one.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University
Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of them. No exam
material is reproduced in this document or in `TEMPLATE.json`; every script line, question, option,
answer key, trap name, slot code, signpost inventory and example above is original text authored for
BandReady.*
