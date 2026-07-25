# 06 — Reading Module

Status: draft v2 (2026-07-25)

The Reading module delivers IELTS-style reading practice for both Academic and General Training formats: full timed tests (3 passages/sections, 40 questions, 60 minutes, auto-submit), single-passage practice, and question-type drills. All 14 IELTS reading question types are supported with faithful answer-format rules (word limits, letter answers, TFNG semantics). Scoring is fully deterministic and offline — no LLM needed to mark a test — via a normalization pipeline (case/article/hyphen tolerance, keyed acceptable variants) and the published approximate raw-score→band tables. The LLM (single configured provider, see 03-providers-and-settings.md) is used for three optional enrichments: infinite passage+question generation with a blind self-validation pass, "why was I wrong" trap analysis in review mode, and skimming/scanning coaching. Content lives in the FastAPI sidecar's SQLite content bank as JSON documents conforming to the schema below (storage detail in 11-data-model.md; authoring/licensing rules in 15-content-authoring-licensing.md). Double-click vocabulary lookups feed the SRS deck (08-vocabulary-srs.md).

## 1. Test formats

| | Academic | General Training |
|---|---|---|
| Structure | 3 passages, increasing difficulty | Section 1 (2–3 short everyday texts: notices, ads, timetables), Section 2 (2 workplace texts: contracts, staff handbooks, job descriptions), Section 3 (1 long general-interest passage) |
| Questions | 40 total (~13/13/14) | 40 total (~14/13/13) |
| Time | 60 min, no transfer time | 60 min, no transfer time |
| Passage length | 700–950 words each, ~2,150–2,750 total | Section 1–2 texts 80–250 words each; Section 3 passage 700–950 words |
| Sources (style) | Journals, magazines, textbooks — academic register | Notices, advertisements, manuals, newspapers — everyday/workplace register |
| Band table | Academic table (§4.3) | GT table (§4.3) — harsher at the top |

A reading test (`reading_tests` row, 11-data-model.md) bundles 3 passages (`reading_passages` rows; a GT "passage" record may contain multiple short texts as sections — see schema §3). Both formats share the same player, scorer, and review mode; only the band table and content differ.

## 2. Question types — complete enumeration

Every type below is a `question.type` enum value. "Answer form" is what the learner enters and what the scorer compares.

| # | `type` | Answer form | Rules enforced by player + scorer |
|---|---|---|---|
| 1 | `multiple_choice` | One letter A–D (or A–E) | Radio group. Variant `multiple_choice_multi`: "Choose TWO letters" — checkbox group, `select_count` enforced, each correct letter = 1 question number (order-insensitive set match). |
| 2 | `true_false_not_given` | `TRUE` / `FALSE` / `NOT GIVEN` | Three-button choice. Used only for factual passages. TRUE = agrees with the text; FALSE = contradicts the text; NOT GIVEN = no information. Scorer accepts `T`/`F`/`NG` and `true/false/not given` case-insensitively. |
| 3 | `yes_no_not_given` | `YES` / `NO` / `NOT GIVEN` | Same mechanics as TFNG but about the *writer's claims/opinions*. Never mix TFNG and YNNG in one question group (validator rejects). |
| 4 | `matching_headings` | Roman numeral (i–x) per paragraph | Word bank of headings, more headings than paragraphs, each heading usable once (player greys out used headings; `allow_reuse: false`). Answers keyed by paragraph id. |
| 5 | `matching_information` | Paragraph letter (A–G) | "Which paragraph contains…". Letters MAY repeat ("NB You may use any letter more than once" shown when `allow_reuse: true`). |
| 6 | `matching_features` | Letter from feature list | Match statements to features (researchers, dates, theories). `allow_reuse` per group; NB line auto-rendered when true. |
| 7 | `matching_sentence_endings` | Letter A–F | More endings than stems; each ending used once. Completed sentence must be grammatical (authoring rule, validator-checked). |
| 8 | `sentence_completion` | Word(s) from the passage | Text input. `word_limit` enforced (see §2.1). Answers appear in passage order. |
| 9 | `summary_completion_bank` | Letter from word bank | Summary paragraph with numbered gaps + lettered bank (more options than gaps). Answer = letter. |
| 10 | `summary_completion` | Word(s) from the passage | Same rendering as 9 but free text input, `word_limit` enforced. Gaps may not follow passage order (summary of one section only). |
| 11 | `note_completion` / `table_completion` / `flow_chart_completion` | Word(s) from the passage | Structured layout (`layout` field carries the note/table/flow-chart skeleton with `{{n}}` gap markers). Text input per gap, `word_limit` enforced. Flow-chart arrows rendered; answers may be out of passage order. |
| 12 | `diagram_labelling` | Word(s) from the passage | SVG/PNG asset with numbered label callouts (`layout.image`, `layout.labels[]` with x/y anchors). Text input per label, `word_limit` enforced. |
| 13 | `short_answer` | Word(s)/number from the passage | Direct question, text input, `word_limit` enforced. Answers must be words that actually occur in the passage (authoring rule). |
| 14 | `list_selection` | Letters (multi) | "Which THREE of the following…?" from list A–G. Checkbox group, set-match, each letter = 1 question number. (Default: modeled as `multiple_choice_multi` with `options` > 5 — flagged as default; kept as alias, not a separate scorer path.) |

### 2.1 Word-limit rules (`word_limit` object)

Instruction strings are generated from the object, never hand-typed, so the player and scorer always agree:

```json
{ "max_words": 2, "numbers_allowed": true }
```

| `max_words` | `numbers_allowed` | Rendered instruction |
|---|---|---|
| 1 | false | "Write ONE WORD ONLY for each answer." |
| 1 | true | "Write ONE WORD AND/OR A NUMBER for each answer." |
| 2 | true | "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer." |
| 3 | true | "Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer." |
| null (numbers only) | — | "Write A NUMBER for each answer." (`max_words: 0, numbers_allowed: true`) |

Counting rules (enforced identically in the input widget's live word counter and the scorer):

- Hyphenated compounds count as ONE word (`well-being` = 1).
- A number counts as a number whether written as digits (`72`) or words (`seventy-two` = 1 word); "AND/OR A NUMBER" permits one number in addition to the word limit.
- Articles count as words: `the coal mine` is 3 words and FAILS a 2-word limit even though `coal mine` would be correct. The player warns live ("3 words — over the limit") but never blocks submission.
- Contractions count as one word (`don't` = 1).
- An over-limit answer is scored WRONG even if it contains the correct words (real IELTS behavior; no partial credit).

## 3. Content JSON schema

One `reading_test` document. Storage (11-data-model.md §3, canonical — this doc's earlier generic `content_items` sketch is repealed): each passage object below is stored whole in `reading_passages.passage_json` (the single rendering source), its questions are additionally flattened into `reading_questions` rows at import/generation time (one row per numbered question, for per-type aggregation and answering), and a full test is a `reading_tests` row referencing its three passages. Single-passage practice items are a `reading_passages` row with the same passage object.

```json
{
  "schema_version": 1,
  "id": "rt_acad_0001",
  "format": "academic",                  // "academic" | "general_training"
  "title": "Academic Reading Test 1",
  "source": "generated",                 // "bundled" | "generated" | "imported"
  "band_target": 7.0,                    // difficulty the set was authored/generated for
  "generation": {                        // present only when source == "generated"
    "model": "…", "validated": true, "validation_report_id": "vr_0042"
  },
  "passages": [
    {
      "id": "p1",
      "position": 1,
      "title": "The Silk Roads of the Sea",
      "topic": "maritime trade history",
      "word_count": 861,
      "difficulty": "medium",            // "easy" | "medium" | "hard"
      "gt_section": null,                // GT only: 1 | 2 | 3
      "texts": [                          // GT sections 1–2 have 2–3 short texts; Academic always exactly 1
        {
          "id": "t1",
          "heading": null,
          "paragraphs": [
            { "id": "A", "text": "For more than a millennium before the age of European expansion, …" },
            { "id": "B", "text": "Archaeological evidence from shipwrecks off the coast of …" }
          ]
        }
      ],
      "question_groups": [
        {
          "id": "g1",
          "type": "matching_headings",
          "instructions_extra": null,     // optional NB line etc.; standard instructions are generated
          "word_limit": null,
          "allow_reuse": false,
          "options": [
            { "key": "i",  "text": "The decline of a trading network" },
            { "key": "ii", "text": "Evidence preserved beneath the waves" }
          ],
          "layout": null,                 // note/table/flow-chart skeleton or diagram asset, else null
          "questions": [
            {
              "number": 1,
              "prompt": "Paragraph A",
              "answers": [ { "value": "iv" } ],
              "anchor_paragraphs": ["A"],
              "evidence_quote": "For more than a millennium before …",
              "explanation": "Paragraph A's controlling idea is the scale of pre-European trade; heading iv paraphrases this as 'An overlooked commercial world'.",
              "trap_note": "Heading ii is a trap: shipwrecks appear only in paragraph B.",
              "difficulty": "medium",
              "band_target": 6.5
            }
          ]
        },
        {
          "id": "g2",
          "type": "sentence_completion",
          "word_limit": { "max_words": 2, "numbers_allowed": true },
          "allow_reuse": false,
          "options": null,
          "layout": null,
          "questions": [
            {
              "number": 8,
              "prompt": "Cargoes were sealed inside {{gap}} to protect them from seawater.",
              "answers": [
                { "value": "ceramic jars" },
                { "value": "ceramic jar", "note": "singular accepted" }
              ],
              "anchor_paragraphs": ["B"],
              "evidence_quote": "goods sealed in ceramic jars survived centuries underwater",
              "explanation": "'Protect them from seawater' paraphrases 'survived centuries underwater'.",
              "trap_note": null,
              "difficulty": "easy",
              "band_target": 5.5
            }
          ]
        }
      ]
    }
  ]
}
```

Schema invariants (enforced by the content validator on import/generation):

- Question `number` values are 1–40, unique, contiguous across the whole test, ascending across groups.
- Every question has ≥1 `answers[]` entry; letter-answer types have exactly the keys present in `options`.
- `answers[].value` for text types must satisfy the group's `word_limit` (an authored answer that breaks its own limit is a validator error).
- Every question carries `anchor_paragraphs` + `evidence_quote` (a verbatim substring of the passage — validator substring-checks it). This powers locate-in-passage highlighting in review mode.
- `multiple_choice_multi` groups carry `select_count` and one question object per answer-slot number sharing a `set_id`.
- TFNG groups must reference factual claims; YNNG groups must reference writer opinion (checked by the generation validator, §7; not statically checkable for imports — flagged default).

`layout` shapes: `table` = `{ "kind": "table", "columns": [...], "rows": [["cell", "{{14}}", ...]] }`; `flow_chart` = `{ "kind": "flow_chart", "steps": ["First, {{18}} is applied", ...] }` (arrows between consecutive steps); `note` = `{ "kind": "note", "lines": ["• Purpose: {{21}}", ...] }`; `diagram` = `{ "kind": "diagram", "image": "assets/rt_acad_0001_p3.svg", "labels": [{ "number": 27, "x": 0.62, "y": 0.31 }] }`.

## 4. Auto-scoring

Scoring is pure Python in the sidecar, deterministic, and needs no network. The normalize/match core lives in the **shared** `sidecar/bandready/scoring/answers.py` — ONE implementation imported by both reading and listening (R2-9; 07-listening-module.md imports the same functions). 1 raw point per question number, no negative marking, no partial credit.

### 4.1 Text-answer normalization

Applied to BOTH the learner's answer and every keyed variant before comparison:

```python
import re, unicodedata

_ARTICLES = ("a ", "an ", "the ")
_NUMBER_WORDS = { "one": "1", "two": "2", ..., "twenty": "20",
                  "thirty": "30", ..., "hundred": "100", "thousand": "1000" }  # full map in code

def normalize(raw: str) -> str:
    s = unicodedata.normalize("NFKC", raw).strip().lower()
    s = s.replace("’", "'")                    # curly → straight apostrophe
    s = re.sub(r"[.,;:!?\"()]", "", s)              # strip punctuation EXCEPT hyphen & apostrophe
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(\d),(\d{3})\b", r"\1\2", s)       # 1,500 → 1500
    s = number_words_to_digits(s)                    # "seventy-two" → "72", "twenty percent" → "20 percent"
    s = re.sub(r"(\d+)\s*%", r"\1 percent", s)      # 20% ≡ 20 percent
    s = re.sub(r"\$\s*(\d+)", r"\1 dollars", s)     # $40 ≡ 40 dollars
    return s

def strip_leading_article(s: str) -> str:
    for art in _ARTICLES:
        if s.startswith(art):
            return s[len(art):]
    return s

def is_correct(learner: str, question, word_limit) -> bool:
    if word_limit and count_words(learner) > effective_limit(word_limit):
        return False                                 # over-limit = wrong, even if content matches
    n = normalize(learner)
    variants = {normalize(a.value) for a in question.answers}
    variants |= {re.sub(r"-", " ", v) for v in variants}   # hyphen ≡ space ≡ closed? NO — see policy
    # Variant-aware article rule (R2-9 — 07 §5's spec is canonical): strip the
    # learner's leading article ONLY if every stored variant itself lacks one.
    if not any(v.startswith(_ARTICLES) for v in variants):
        n = strip_leading_article(n)
    return n in variants
```

Exactness policy (locked defaults, mirrors real IELTS marking):

- **Case-insensitive** always (real IELTS accepts any casing).
- **Leading article tolerance — variant-aware (R2-9)**: the learner's leading article is stripped only when EVERY keyed variant lacks a leading article, so `the ceramic jars` matches key `ceramic jars`; if any variant is authored with an article, the comparison stays literal. The tolerance never rescues an over-limit answer (the limit check runs on the raw answer first, so `the coal mine` still fails a 2-word limit; this matches real marking).
- **Spelling must be exact** after normalization. `enviroment` for `environment` is WRONG — no fuzzy matching, no edit distance. Both US/UK spellings are accepted only if authored as variants (`colour`/`color`); the generation pipeline auto-adds the US/UK pair from a built-in mapping table.
- **Hyphens**: `hyphen ≡ space` (`well being` matches `well-being`) because IELTS markers accept both; the closed form (`wellbeing`) matches only if authored as a variant. (Flagged default: strictest defensible reading.)
- **Numbers**: digits ≡ words (`72` ≡ `seventy-two`), thousands separators ignored, `%` ≡ `percent`, `$N` ≡ `N dollars`.
- **Letter answers** (types 1,4,5,6,7,9,14): trimmed, upper-cased, `NOT GIVEN`/`NG`/`N.G.` all accepted; multi-select compared as sets.
- **Alternative answers**: only via `answers[]` variants — the scorer never invents equivalences beyond the rules above. `answers[].value` may itself contain an authored slash form (`(sea) turtles`) — the validator expands parenthesized-optional and slash forms into concrete variants at import time so the runtime match is always exact-set.

### 4.2 Score record

```json
{
  "attempt_id": "rd_01J8…",
  "raw_score": 31,
  "band": 7.0,
  "per_question": [
    { "number": 1, "given": "iv", "correct": true, "flagged": false, "time_ms": 41200 }
  ],
  "per_type": { "true_false_not_given": { "correct": 4, "total": 6 } },
  "per_passage": [ { "passage_id": "p1", "correct": 11, "total": 13 } ],
  "duration_s": 3421,
  "auto_submitted": false
}
```

### 4.3 Raw-score → band conversion (published approximate tables)

These are the approximate tables published by IELTS partners ("band score tables are indicative"); half-band granularity. Stored as data (`sidecar/bandready/scoring/band_tables.py`), not code.

Academic Reading:

| Raw | Band | | Raw | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 19–22 | 5.5 |
| 37–38 | 8.5 | | 15–18 | 5.0 |
| 35–36 | 8.0 | | 13–14 | 4.5 |
| 33–34 | 7.5 | | 10–12 | 4.0 |
| 30–32 | 7.0 | | 8–9 | 3.5 |
| 27–29 | 6.5 | | 6–7 | 3.0 |
| 23–26 | 6.0 | | 4–5 | 2.5 |
| | | | 0–3 | ≤2.0 |

General Training Reading:

| Raw | Band | | Raw | Band |
|---|---|---|---|---|
| 40 | 9.0 | | 23–26 | 5.0 |
| 39 | 8.5 | | 19–22 | 4.5 |
| 37–38 | 8.0 | | 15–18 | 4.0 |
| 36 | 7.5 | | 12–14 | 3.5 |
| 34–35 | 7.0 | | 9–11 | 3.0 |
| 32–33 | 6.5 | | 6–8 | 2.5 |
| 30–31 | 6.0 | | 0–5 | ≤2.0 |
| 27–29 | 5.5 | | | |

The results screen always shows "approximate band — official conversions vary slightly between test versions."

## 5. Timed test player UX

Split view, resizable divider, passage left / questions right (the layout used by computer-delivered IELTS — deliberate familiarity training):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BandReady · Academic Reading Test 1        ⏱ 42:17     [Review flags] [⏸] │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ PASSAGE 1  The Silk Roads of the… │ Questions 1–7 · Matching Headings        │
│                                   │ Choose the correct heading for each      │
│ A  For more than a millennium     │ paragraph from the list below.           │
│    before the age of European…    │                                          │
│    ~~~~~highlighted text~~~~~ 📝  │  i   The decline of a trading network    │
│                                   │  ii  Evidence preserved beneath…  (used) │
│ B  Archaeological evidence from   │                                          │
│    shipwrecks off the coast of…   │  1. Paragraph A   [ iv ▾ ]        🚩     │
│                                   │  2. Paragraph B   [ –  ▾ ]               │
│         (scrolls independently)   │           (scrolls independently)        │
├───────────────────────────────────┴──────────────────────────────────────────┤
│ Passage: [1] [2] [3]   1✓ 2  3  4🚩 5✓ 6  7 … 40        Answered 18/40      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Timer**: counts down from 60:00 (configurable per practice mode); turns `warning` at 10:00, `destructive` at 2:00; at 0:00 the attempt auto-submits with whatever is entered (`auto_submitted: true`). Pause allowed in practice mode only, never in "exam conditions" mode (a toggle at test start; exam conditions also disables highlights list and note tool per real CD-IELTS — flagged default: highlights stay ON even in exam mode, since CD-IELTS has them).
- **Question palette** (bottom bar): one cell per question number; states — empty, answered (✓), flagged (🚩), current (ring). Click jumps to the question AND scrolls the passage to the group's first `anchor_paragraph`. Flagging via the 🚩 button or `Ctrl/Cmd+F` on the focused question.
- **Highlight tool**: select passage text → floating mini-toolbar `[Highlight] [Note] [Look up]`. Highlights persist per attempt (stored as `{text_id, paragraph_id, start_offset, end_offset, color}` character offsets into the paragraph's plain text). Notes attach a small 📝 marker with a popover textarea.
- **Look up / double-click**: double-clicking any word (or `Look up` on a selection) opens the vocab popover — the definition comes from `GET /api/v1/dictionary/{word}` (bundled WordNet, fully offline, no LLM — R2-20; specced in 08-vocabulary-srs.md) + "Add to deck" which POSTs `{term, sentence_context, source: {kind:"reading", item_id, paragraph_id}}` to `POST /api/v1/vocab/suggestions` (suggested-inbox ingest per R2-5; routes in 18-api-contract.md). In exam-conditions mode the popover is disabled; the word is silently queued to a "looked-up later" list shown after submission.
- **Answer inputs** live-render the word counter for text answers ("2 / max 2 words") and grey out used bank options where `allow_reuse: false`.
- Attempt state autosaves to SQLite every answer change and every 15 s (timer value included) — quitting the app mid-test resumes exactly, with the timer NOT running while the app is closed (practice-friendly; exam-conditions mode instead burns the elapsed wall-clock, flagged default).
- Keyboard: `Alt+←/→` prev/next question, `Alt+1..3` switch passage, `Ctrl/Cmd+Enter` submit (confirm dialog listing unanswered + flagged counts).

## 6. Review mode & practice modes

### 6.1 Review mode (after submit)

Results header: band + raw score + per-passage and per-type breakdown bars (weakest type surfaced: "Your weakest type this attempt: True/False/Not Given — 2/6. [Drill it]").

Per-question review row → expands to:

1. Your answer vs. correct answer(s) (all accepted variants shown).
2. **Locate in passage**: clicking the question highlights `evidence_quote` in the passage pane and scrolls to it (exact-substring match; anchor paragraph flashes).
3. Authored `explanation` and `trap_note`.
4. **"Why was I wrong?" (LLM, on demand)** — button appears on wrong answers; most valuable for TFNG/YNNG traps. One call per click, cached per (attempt, question). Prompt (verbatim, system + user):

```
SYSTEM:
You are an IELTS reading tutor. A learner answered a question incorrectly.
Explain the error in <=120 words. Structure: (1) what the text actually says,
quoting <=15 words; (2) the specific trap the learner fell for — for
True/False/Not Given name it as one of: "contradiction read as absence"
(FALSE vs NOT GIVEN confusion), "absence read as contradiction",
"outside knowledge", "keyword match without meaning match",
"scope/quantifier shift" (e.g. 'some' vs 'all'), "opinion vs fact";
(3) one reusable tip. Address the learner as "you". Do not restate the
question. Do not invent text that is not in the passage excerpt.

USER:
Question type: {{type}}
Question: {{prompt}}
Correct answer: {{answer}}  Learner answered: {{given}}
Relevant passage excerpt (paragraphs {{anchor_paragraphs}}):
"""{{anchor_paragraph_texts}}"""
Authored explanation: {{explanation}}
```

### 6.2 Practice modes

| Mode | Content | Timer | Notes |
|---|---|---|---|
| Full test | 3 passages, 40 Q | 60:00, auto-submit | Optional exam-conditions toggle. Feeds band history in 10-curriculum-progress.md. |
| Single passage | 1 passage, its 13–14 Q | 20:00 default (off-able) | Recommended entry point; passage picker filters by difficulty/topic/type-coverage. |
| Question-type drill | N questions of ONE type pulled across the bank (e.g. "10 TFNG in a row"), each with its anchor paragraphs only (not the full passage) | Per-question soft timer (90 s default) | Immediate per-question feedback + explanation; wrong answers auto-enqueue a retry at the end. Drill size 5/10/20. Type stats feed the curriculum's weakness detector (10-curriculum-progress.md). |
| Skimming/scanning trainers | See §8 | Hard timers | Not band-scored; tracked as WPM/accuracy metrics. |

## 7. LLM passage-generation pipeline

Goal: infinite original practice at a controlled level. Runs in the sidecar as a 4-stage one-shot job: `POST /api/v1/reading/generate` returns `202 {job_id}` (kind `reading_generate`) and the renderer polls `GET /api/v1/jobs/{id}` for `{state, progress_pct, detail, result?}` — the shared job convention of 18-api-contract.md §3 (R2-3; there is no generation WS channel). Single configured LLM from 03-providers-and-settings.md. All prompts request `response_format: json_object` where the endpoint supports it; otherwise output is fenced-JSON parsed with one repair retry.

**Stage 1 — passage.** Input: `{format, topic (or "random from topic wheel"), band_target, gt_section?}`. Difficulty is controlled by explicit constraints, not vibes:

```
SYSTEM:
You write original IELTS-style reading passages. Never reproduce or closely
paraphrase any real IELTS test content.

USER:
Write an Academic-style reading passage.
Topic: {{topic}}. Target reader level: IELTS band {{band_target}}.
Constraints:
- 780-900 words, 6-8 paragraphs. Label paragraphs A, B, C, ...
- Register: popular-science journal. No headings inside the passage.
- Lexical control for band {{band_target}}: roughly {{awl_pct}}% academic
  (AWL-type) vocabulary; average sentence length {{sent_len}} words;
  at most {{rare_word_cap}} words a band-{{band_target}} reader would not know,
  each inferable from context.   // defaults: band 6→(6%, 16, 8); band 7→(9%, 19, 12); band 8→(12%, 22, 18)
- Include: at least 2 writer-opinion sentences, 2 factual claims with numbers,
  1 quantified comparison, and 1 plausible-but-unstated idea a careless reader
  might assume (fuel for NOT GIVEN questions).
Return JSON: { "title": ..., "paragraphs": [ { "id": "A", "text": ... }, ... ] }
```

Post-check (code, not LLM): word count in range; paragraph count; Flesch-Kincaid grade within ±2 of the band's target band-to-FK mapping (band 6→FK 10, band 7→12, band 8→14 — flagged defaults); regenerate once on failure, else surface the job as failed.

**Stage 2 — questions.** One call per question group (types chosen by a coverage planner so a full generated test spans ≥6 types, always including one TFNG or YNNG group). The prompt embeds the full passage and the schema from §3, plus type-specific rules ("TFNG statements must be checkable as facts; exactly {{n_ng}} of them NOT GIVEN; FALSE statements must contradict, not merely be absent"; "completion answers must be verbatim contiguous words from the passage within the word limit"). Must return, per question: `answers` (with US/UK + singular variants where natural), `anchor_paragraphs`, verbatim `evidence_quote`, `explanation`, `trap_note`, `difficulty`, `band_target`.

**Stage 3 — blind validation (the quality gate).** A separate call re-answers every question WITHOUT seeing the key. Prompt (verbatim):

```
SYSTEM:
You are sitting an IELTS reading test. Answer strictly from the passage; use
no outside knowledge. For True/False/Not Given: TRUE only if the passage
states it, FALSE only if the passage contradicts it, NOT GIVEN if the passage
does not say. Respect word limits exactly. For every answer, also report a
confidence from 0.0 to 1.0 and quote the minimal passage evidence (<=20 words,
or "NONE" for NOT GIVEN answers).

USER:
PASSAGE:
"""{{full_passage_with_paragraph_ids}}"""

QUESTIONS (answer every one; instructions per group are included):
{{rendered_question_groups_without_answers}}

Return JSON:
{ "answers": [ { "number": 1, "answer": "...", "confidence": 0.0,
                 "evidence": "..." } ] }
```

Validation logic (code): compare blind answers to the key using the §4.1 scorer. Gate rules (defaults): a question **passes** if the blind answer matches with confidence ≥ 0.6; **auto-repair** (one regeneration of that question) if mismatch or confidence < 0.6; **discard the group** if >30% of its questions fail after repair; **discard the test** if <36 of 40 questions survive (regenerate the deficit). Additionally, `evidence_quote` substring-check and word-limit self-consistency run on every question. The whole report is stored (`validation_report_id`) and viewable in a "Generated content → inspect" screen. Validation always uses the one configured LLM at temperature 0 (R2-17 — the one-LLM lock is absolute in-app; out-of-app authoring tooling is 15-content-authoring-licensing.md's domain).

**Stage 4 — finalize.** Assemble the §3 document, run the static validator (invariants list), auto-expand answer variants (US/UK map, parenthesized optionals), insert into the content bank tagged `source: "generated"`. Generated tests are visually badged in pickers and excluded from the "official-style mock" flow in 10-curriculum-progress.md until the user opts in.

## 8. Skimming & scanning trainers

Two micro-drill types, reusing bank passages (or single generated paragraphs):

- **Timed gist reading (skimming).** Show a full passage with a hard timer scaled to a target WPM (defaults: 3:00 for ~850 words ≈ 280 WPM skim; user-adjustable 200–400). When time expires the passage disappears and the learner answers 3 gist questions: pick the best main-idea summary (MCQ, 1 correct + 2 distractors: one too-narrow, one too-broad — generation prompt enforces this), pick the best-fit heading, and one "was X mentioned at all?" yes/no. Tracks gist-accuracy vs WPM over time.
- **Keyword locate (scanning).** The passage renders; a target appears ("Find: the year the treaty was signed", "Find: a percentage"). The learner clicks the word/number in the passage; timer per target (20 s default), 8 targets per round. Targets are auto-derived from the passage: named entities, numbers, dates, and question `evidence_quote` spans. Tracks median locate-time; the results screen maps it to advice ("Under 12 s median — exam ready for scanning").

Both record to `drill_results` (11-data-model.md) and surface in the progress dashboard; neither produces a band score.

## 9. API surface & module file map (sidecar)

All routes live under the `/api/v1` prefix; **18-api-contract.md §4.9 is the authoritative inventory** (method, path, auth, wire shape — R2-1). Recap of the reading surface:

```
GET   /api/v1/reading/tests?format=&difficulty=&source=&limit=&cursor=   → test list (metadata only)
GET   /api/v1/reading/tests/{id}                            → full §3 document (minus answers when ?mode=exam)
POST  /api/v1/reading/attempts    {test_id, mode, exam_conditions}  → attempt id + resume state
PATCH /api/v1/reading/attempts/{id}  {answers?, highlights?, notes?, timer_s?, flags?}   (autosave)
POST  /api/v1/reading/attempts/{id}/submit                  → §4.2 score record
GET   /api/v1/reading/attempts/{id}/review                  → score + key + explanations + evidence quotes
POST  /api/v1/reading/attempts/{id}/why-wrong {number}      → LLM analysis (cached)
POST  /api/v1/reading/generate    {format, topic?, band_target, scope: "test"|"passage"}  → 202 {job_id} (§7)
GET   /api/v1/reading/drills/{type}?size=                   → drill question set
POST  /api/v1/reading/drills/results                        → drill outcome
```

(The vocab popover additionally calls `GET /api/v1/dictionary/{word}` and `POST /api/v1/vocab/suggestions` — §5, 18-api-contract.md §§4.6/4.11.)

Answers are stripped server-side for in-progress attempts (`?mode=exam` and any attempt without `submitted_at`) — the renderer never holds the key during a test.

File paths follow the binding repo layout of 01-architecture.md §7 (R2-9):

```
sidecar/bandready/scoring/
  answers.py                     # SHARED normalize()/is_correct() — one implementation,
                                 # imported by reading AND listening (R2-9, §4.1)
  band_tables.py                 # raw→band tables (§4.3), data not code
sidecar/bandready/reading/
  router.py                      # endpoints above (contract owned by 18-api-contract.md §4.9)
  scoring.py                     # attempt scoring: applies scoring/answers.py + band_tables
  validator.py                   # §3 invariants + variant expansion
  generation.py                  # 4-stage pipeline, prompts as module constants
  drills.py                      # skim/scan target derivation
app/src/features/reading/
  TestPlayer.tsx  SplitPane.tsx  PassagePane.tsx  QuestionPane.tsx
  QuestionPalette.tsx  TimerBar.tsx  HighlightLayer.tsx  VocabPopover.tsx
  inputs/{McqInput,TfngInput,BankSelect,GapText,TableLayout,FlowChart,DiagramLabels}.tsx
  ReviewScreen.tsx  DrillRunner.tsx  SkimTrainer.tsx  ScanTrainer.tsx
  store.ts                       # feature-local ephemeral Zustand store: attempt state, autosave queue (R2-23)
```

UI follows 12-design-system.md tokens (dark default, teal primary per R2-16, rounded-xl cards); question palette cells use `success`/`warning`/`primary` token colors.

## Open questions

1. **Diagram assets for generated content**: Stage 2 can't draw. Options: (a) skip `diagram_labelling` in generated tests (current default), (b) LLM-emitted SVG with labeled anchors, (c) a small library of pre-made labelable diagrams the generator writes questions against. Needs a decision before 15-content-authoring-licensing.md finalizes the bundled asset list.
2. **Hyphen policy edge**: should the closed compound (`wellbeing`) be auto-accepted whenever the hyphenated form is keyed, rather than requiring an authored variant? Real-marker behavior is inconsistent in published guidance; current default is strict.
3. **GT Section 1 multi-text rendering**: tabs vs vertically stacked short texts in the passage pane — needs a quick prototype; stacked is the provisional default.
