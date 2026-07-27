# W-D1 — Teaching-grade writing content: schema, chart_spec v2, clusters, features

**Status:** the authoring contract. Six authoring agents (W-A1–W-A6), one verify/merge agent and the
feature agents build to this document. Where this document and a research briefing disagree, **this
document wins** — it has already reconciled them, and §0.4 lists every place it overrode research.

**Companion artefact:** [`TEMPLATE.json`](TEMPLATE.json) — three complete prompts, one per task type,
authored to the standard. Read it before you write anything. It is the ceiling and the floor.

**Inputs:** `staging-writing/research/01-academic-task1.md` (R1), `02-task2.md` (R2),
`03-bands-and-errors.md` (R3), `04-gt-and-pedagogy.md` (R4). Section references are to those files.
The speaking contract `staging/DESIGN.md` is the quality bar; where a shape already exists there, we
reuse it so the UI can be shared.

---

## 0. What we are building and why

The pack ships **16 writing prompts** with **zero teaching payload**. Six Academic Task 1 (exactly one
of each chart kind), four GT letters (three purposes), six Task 2 essays. The UI is good and has
nothing to show. This push adds **84 new prompts** (6 clusters × 14) to reach **100 total**, and adds a
teaching payload to *every* new prompt so the app can do nine things it currently cannot:

1. show three renderings of the *same* answer at bands 6, 7 and 8, span-annotated against
   `ta`/`cc`/`lr`/`gra`, gated behind a real attempt;
2. tell an Academic Task 1 learner, **for this exact chart**, what the overview must capture, which
   figures to cite and which data to throw away — the single biggest scoring lever in the task (R1 §3);
3. tell a letter writer the register, the greeting/sign-off pair, and what each bullet must *do* and
   how to *extend* it — the #1 band-6 ceiling in the task (R4 §4);
4. tell an essay writer the discrete parts this question has, so the missing-opinion failure becomes
   impossible to make by accident (R2 §9.1);
5. coach the 20 or 40 minutes as a procedure with a worked plan for *this* prompt, not a countdown;
6. hand over a bank of slotted frames with a plausible canned negative beside each;
7. name the two errors this prompt's topic and grammar will provoke, before they are made;
8. open the report on **one** thing to change, with a retry attached (R4 §7.3);
9. run a **60-minute writing mock** — Task 1 then Task 2, one clock, no coaching — and lead the report
   with the time-allocation verdict, which is the most expensive error in the module (R3 §4 row 12).

Every field below exists to serve one of those nine. A field serving none of them was cut.

### 0.1 Copyright — non-negotiable, read it twice

- The exam's **format, timing, word minima, task types, criteria and the topic areas that recur** are
  facts. Use them freely.
- The **standard Task 1 rubric line** and the **Task 2 framing lines** are functional instructions
  already shipped in our pack. Reproduce them **unvaried** (R1 §1.3, R2 §1.1). Everything else you
  write is composed from scratch.
- **Every prompt, chart dataset, letter situation, bullet, frame, model answer and teaching note is
  authored by you.** Never transcribe from a past paper, a "band 9 samples" page, a prediction list, a
  coaching PDF or a YouTube transcript. **Never reproduce a real dataset** — a real dataset is
  somebody's copyright and a wrong-looking one is a teaching liability (R3 §8).
- Official band descriptor prose is copyrighted text. The criteria and what they assess are facts.
  **R3 §2 and R2 §8 are already clean-room paraphrases — reuse their wording, never the descriptors'.**
- **Self-check before you commit any sentence:** did I read this sentence somewhere? If there is any
  doubt at all, throw it away and write a different one on the same subject.
- Invented toponyms only, and keep the existing house convention (Verdon, Norland, Ashfield,
  Sandmouth) so the bank reads as one world. No real organisations, cities or published statistics.
- Product copy says **"IELTS-style"**; the pack manifest carries the non-affiliation notice.

Three claims research found circulating that **must not appear anywhere in our content or copy**
(R4 §0.1, R3 §9): "a missed bullet caps Task Achievement at band 5"; "examiners were retrained to cap
templates at band 4"; "a register mistake costs one band". None has any published basis. Teach the
mechanism instead: an uncovered bullet is an uncovered task requirement, and unaddressed requirements
are what criterion 1 measures.

### 0.2 Hard compatibility constraints (violating these breaks the running app)

Verified against `sidecar/bandready/content/validate.py`, `sidecar/bandready/content/loader.py`,
`sidecar/bandready/scoring/writing.py`, `sidecar/bandready/scoring/rubrics.py` and
`app/src/features/writing/`.

| Constraint | Why |
|---|---|
| `task_type` ∈ `{ac_task1, gt_task1, task2}` | `WritingPromptRow._task_type` |
| `difficulty` ∈ `1..3` (int) | `WritingPromptRow._difficulty` |
| `genre` must be in `TASKS[task_type]["genres"]` | `scoring/writing.py:58`. **Do not invent a genre.** ac_task1: `bar grouped_bar stacked_bar line pie table process map mixed` · gt_task1: `formal semi_formal informal` · task2: `opinion discussion problem_solution two_part advantages_disadvantages` |
| `topic_id` must exist in `data/topics.jsonl` | FK; the loader will silently auto-create a topic otherwise, which is worse than failing |
| Criterion codes are **`ta` `cc` `lr` `gra`**, lowercase | `rubrics.py:53`. There is no `TR` code in this codebase; criterion 1 is *labelled* Task Response for `task2` and Task Achievement for Task 1, but the code is `ta` in both |
| `chart_spec` non-null **only** for `ac_task1`; `letter_bullets` non-null **only** for `gt_task1` (exactly 3) | `_prompt_payload`, `PromptPanel.tsx` |
| Chart series ≤ **5**, categories ≤ **12** | `SERIES_MAX` in `chart/palette.ts`, `MAX_SERIES`/`MAX_CATEGORIES` in `scoring/writing.py:359`. Over-limit specs silently downgrade to a table with a warning banner |
| Row ids unique across the whole file | `validate_rows` rejects a duplicate and the pack fails **whole** |
| `min_words` and `time_limit_s` are **derived** from `task_type`, never authored | `_prompt_payload` reads `TASKS` |

### 0.3 THE DELIVERY BLOCKER — read this before writing a single row

`WritingPromptRow` is `extra="allow"`, so an extra key **validates**. But unlike speaking cards, a
writing prompt has **no `payload_json` column**. `loader.upsert_rows` copies only the columns listed in
`TABLE_COLUMNS["writing_prompts"]`, and `writing.py:_prompt_payload` serialises only a fixed key set.
**An extra top-level key on a writing prompt row is silently dropped at import and never reaches the
app.** R1 §10.6 and R3 §8 both assumed otherwise; they are wrong.

The teaching payload therefore ships under the key **`teaching_json`** — named to map 1:1 onto a
column, exactly like `payload_json`/`tags_json` on speaking cards — and three one-line code changes are
a **hard prerequisite** for any of this content being visible:

```
1. sidecar/bandready/migrations/versions/<new>.py
     ALTER TABLE writing_prompts ADD COLUMN teaching_json TEXT
2. sidecar/bandready/db/models.py            WritingPrompt
     teaching_json: Mapped[str | None] = mapped_column(Text)
3. sidecar/bandready/content/loader.py       TABLE_COLUMNS["writing_prompts"]
     + ("teaching_json", True)               # jsonify=True — dict in, TEXT out
4. sidecar/bandready/server/routes/writing.py  _prompt_payload
     "teaching": _loads(prompt.teaching_json),
5. app/src/features/writing/store.ts         WritingPrompt
     teaching: WritingTeaching | null;
```

`validate.py` should also gain `teaching_json: dict[str, Any] | str | None = None` on
`WritingPromptRow` so a malformed payload fails the pack rather than the UI. **Content agents do not
make these changes.** Author `teaching_json` as specified and report the dependency.

**Consumers must treat every teaching field as absent-by-default** — the existing 16 rows have none,
and they are not being retrofitted in this push.

### 0.4 Where this document overrides the research

| # | Research said | This document says | Why |
|---|---|---|---|
| 1 | Band ladder 5→9 (R2 §8, R4 §8.3) | **Exactly three model answers: 6, 7, 8.** Band 5 is served by a 4-rung `sentence_ladder`; band 9 is not authored at all | §5.1 |
| 2 | Mock hides Task 2 while writing Task 1 (R4 §11.3) | **Both tasks visible from minute 0, free allocation, one clock** | §9 F8 — the real exam does this, and free allocation *is* the lesson |
| 3 | Teaching payload rides as extra top-level keys (R1 §10.6, R3 §8) | `teaching_json`, plus five code changes | §0.3 |
| 4 | Process `phases` are a chart-design constraint (R1 §6.2) | Phases are a **constraint on the step list** but live in `teaching_json.overview_brief.phases`, **never in `chart_spec`** | Putting phase names on the diagram hands the learner the band-7 overview |
| 5 | A pie pair could be a `mixed` spec (R1 §9.2) | A pie pair is `kind: "pie"` with 2–3 series. `mixed` is reserved for two visuals of **different** kinds | §6.4 |
| 6 | Register/purpose split (R4 §17.3) | Confirmed: `genre` stays the register; `purpose` lives in `teaching_json.letter_brief.purpose` | Do not break the scorer |

---

## 1. `teaching_json` — the common payload

Every new prompt carries this object. Fields marked **REQ** are lint-enforced. All limits are in
**words** unless stated. Everything is JSON-serialisable: objects, arrays, strings, ints, bools.

| Field | Type | Req | Rules |
|---|---|---|---|
| `schema_version` | int | **REQ** | Always `1` |
| `cluster` | string | **REQ** | Your cluster slug, e.g. `ac1-trends`. Must equal the staging filename stem |
| `teaches` | string | **REQ** | ≤ 25 words. A **capability**, not a topic: "Group five categories into two behaviours and say which one income does not touch." |
| `band_move` | string | **REQ** | ≤ 22 words. The **one** behaviour this prompt trains, phrased as an instruction. This is the rankable top item the report headline uses |
| `exam_note` | string | OPT | ≤ 35 words. One exam-reality fact this prompt is a good moment to say out loud |
| `time_plan` | object[] | **REQ** | §1.1 — exactly 4 phases, minutes fixed by task type |
| `plan` | object | **REQ** | §1.2 |
| `structure_plan` | object[] | **REQ** | §1.3 |
| `parts_checklist` | object[] | **REQ** | §1.4 — 2–4 entries |
| `language_bank` | object | **REQ** | §1.5 |
| `collocations` | object[] | **REQ** | §1.6 — 6–10 items |
| `upgrade_pairs` | object[] | **REQ** | §1.7 — 3–5 items |
| `target_structures` | object[] | **REQ** | §1.8 — 1–2 items |
| `error_watchlist` | object[] | **REQ** | §1.9 — 2–3 items, highest-impact first |
| `checklist` | string[] | **REQ** | §1.10 — 4–6 items, each ≤ 14 words |
| `rewrite_focus` | object | **REQ** | §1.11 |
| `sentence_ladder` | object | **REQ** | §5.2 |
| `swap_slots` | object[] | REQ for `gt_task1` (3–4), OPT elsewhere | §5.3 |
| `model_answers` | object[] | **REQ** | §5 — exactly 3, `band_target` `[6,7,8]` |
| `overview_brief` | object | **REQ iff `ac_task1`** | §2 |
| `letter_brief` | object | **REQ iff `gt_task1`** | §3 |
| `essay_brief` | object | **REQ iff `task2`** | §4 |

Exactly one of `overview_brief` / `letter_brief` / `essay_brief` is present, and it must match
`task_type`. Lint 14.

### 1.1 `time_plan` — four phases, fixed minutes

```jsonc
[ { "phase": "decode", "minutes": 3,  "does": "<≤16 words, worded for THIS prompt>" },
  { "phase": "plan",   "minutes": 2,  "does": "<≤16 words>" },
  { "phase": "write",  "minutes": 12, "does": "<≤16 words>" },
  { "phase": "check",  "minutes": 3,  "does": "<≤16 words>" } ]
```

`phase` enum is closed: `decode` · `plan` · `write` · `check`, always in that order.
**Minutes are fixed by `task_type` and may not be changed** — only `does` varies per prompt:

| `task_type` | decode | plan | write | check | total |
|---|---|---|---|---|---|
| `ac_task1` | 3 | 2 | 12 | 3 | 20 (R1 §1.2) |
| `gt_task1` | 2 | 3 | 13 | 2 | 20 (R4 §1.3) |
| `task2` | 2 | 5 | 28 | 5 | 40 (R4 §9.2) |

The asymmetry is the teaching. A letter needs *less* planning and *more* checking than an essay,
because its content is prescribed by the bullets and its losses are at surface level. Task 2 planning
is capped at 5 minutes deliberately: prewriting *time* scores 0.32 and a planning *procedure* scores
0.82, so beyond five minutes the marginal minute is worth more as on-line planning (R4 §9.1–9.2).

`does` must be an instruction someone can execute, worded for this prompt. Not "plan your answer" —
"Commit to the two overview statements and both groupings before writing a word."

### 1.2 `plan` — the worked plan for this exact prompt

```jsonc
"plan": {
  "lines": [                                  // REQ — 3 to 5, ordered
    { "label": "<enum>", "note": "<≤90 characters, NOTE FORM>" } ],
  "test":  "<≤25 words>",                     // REQ — how the learner knows the plan is good enough
  "trap":  "<≤25 words>"                      // REQ — shown AFTER submit only, never before
}
```

`label` enum by task type — closed, and the UI renders these as the scratchpad's ghost text:

| task_type | labels (in order) |
|---|---|
| `ac_task1` | `TENSE` · `OVERVIEW` · `GROUP 1` · `GROUP 2` · `RISK` |
| `gt_task1` | `GREETING` · `BULLET 1` · `BULLET 2` · `BULLET 3` · `RISK` |
| `task2` | `POSITION` · `BODY 1` · `BODY 2` · `RISK` |

**The 90-character cap is the "notes, not prose" rule made structural.** Write cells the way somebody
under time pressure actually writes them — arrows, abbreviations, no finite verbs — not the way a
textbook would. `eating out 10->29, staples 26->12 : income changes these` is a note.
`The chart shows that as income rises, spending on eating out increases` is prose, and prose in a plan
is a draft the learner will copy.

`test` is R4 §9.3's discriminator, instantiated: *could a stranger write the answer from this plan?*
`trap` names the specific omission **this** prompt provokes, and is surfaced only in the report, as a
check ("Most people forget to say what did *not* change on this chart — you covered it ✓").

### 1.3 `structure_plan` — paragraph roles, worded for this prompt

```jsonc
[ { "para": 1, "role": "<enum>", "words": 26, "must_do": "<≤20 words>" } ]
```

`role` enum: `introduction` · `overview` · `detail_group` · `opening` · `bullet` · `body` ·
`conclusion` · `closing`.

| task_type | paragraphs | roles |
|---|---|---|
| `ac_task1` | 4 | `introduction`, `overview`, `detail_group`, `detail_group` (R1 §3.4) |
| `gt_task1` | 5 | `opening`, `bullet`, `bullet`, `bullet`, `closing` (R4 §1.2) |
| `task2` | 4 | `introduction`, `body`, `body`, `conclusion` (R2 §4) |

`words` is a budget, not a count, and the sum must land inside the target band for the task type
(§5.1). Body/detail paragraphs must be visibly the longest — an introduction that rivals a body in
length is padding (R2 §4). `must_do` is written for this prompt: not "state your position" but
"Say the caps are worth it, and name the condition you attach — where the money goes."

### 1.4 `parts_checklist` — the discrete parts of *this* task

```jsonc
[ { "part": "<≤12 words>", "evidence_question": "<≤18 words>" } ]   // 2 to 4
```

The highest-impact single field in the module, because missing a part of the task is the biggest
single cause of a capped criterion-1 score (R2 §7 row 1) and it is the only failure a checklist can
eliminate outright. `part` names the requirement; `evidence_question` is the question the learner (and
the report, feature F4) answers by pointing at a sentence.

Per-type minimums:

- `ac_task1` — must include a figure-free overview, grouping rather than listing, and figures used
  comparatively and accurately.
- `gt_task1` — must include all three bullets **covered and extended**, and register held from greeting
  to sign-off. (The per-bullet detail lives in `letter_brief.bullet_notes`; this is the coarse strip.)
- `task2` — must enumerate the question's genuine parts. `discussion` has **three** (view A, view B,
  your opinion). `advantages_disadvantages` "outweigh" has **three** (advantages, disadvantages,
  verdict); the neutral variant has two. `two_part` has two. Getting this count right is the whole
  point of the field.

### 1.5 `language_bank` — functional frames, grouped by move

```jsonc
"language_bank": {
  "warning": "<15–30 words>",             // REQ — why these must not be recited; vary it per prompt
  "moves": [                              // REQ — 3 to 5
    { "move": "<enum>",                   // REQ
      "why_here": "<≤15 words>",          // REQ — why THIS prompt pulls THIS move
      "grammar": "<≤10 words>",           // REQ — what the frames showcase
      "frames": [                         // REQ — 2 or 3, never more
        { "frame": "<slotted, contains ___>", "slot_hint": "<≤15 words>" } ],
      "avoid": "<one full canned sentence>" } ]   // REQ — the negative exemplar
}
```

`move` enum (closed — the app renders the same labels everywhere):
`describing_trend` · `comparing` · `grouping` · `sequencing` · `locating` · `hedging` · `conceding` ·
`exemplifying` · `evaluating` · `proposing` · `requesting` · `apologising` · `referencing`

Typical draws: `ac_task1` from {describing_trend, comparing, grouping, sequencing, locating, hedging,
referencing}; `gt_task1` from {requesting, apologising, proposing, evaluating, exemplifying, hedging,
referencing}; `task2` from {evaluating, conceding, exemplifying, hedging, comparing, proposing,
referencing}. Cross-draws are allowed where the prompt genuinely pulls them.

Rules:
- **Every frame contains at least one `___`.** A frame with no gap is a sentence, and a sentence is a
  script (R4 §8.3 rule 5).
- `avoid` must be a *plausible* canned sentence a learner would really find on a phrase-bank site, not
  a strawman. It sits beside the good version; the contrast is the teaching.
- Do not ship `describing_trend` on a chart with no time axis — a ranking has no trend, and writing
  "the trend shows" on a single-period chart is a content error (R1 §5.7).
- `referencing` should appear on at least one move-set in every file. It is the under-taught half of
  cohesion and almost no candidate uses it (R2 §6.2, R3 §3.5).

### 1.6 `collocations` — partners first, never bare words

```jsonc
{ "chunk": "accounted for a third of the total",   // REQ — includes its preposition
  "example": "<one natural WRITTEN sentence, 10–24 words, in this prompt's subject>",  // REQ
  "cefr": "B2" | "C1" }                            // REQ
```

6–10 items. Rules, all lintable:
- **Every item must carry its partners and its preposition.** `a solution to`, `an increase in`,
  `a reason for`, `an impact on`, `responsible for`, `concerned about`. Prepositions are a collocation
  problem wearing a grammar costume (R3 §3.4).
- **At most 2 single-word items.** Lexical Resource is lost to wrong partners, not missing words
  (R3 §3.4, and the corpus study putting word choice first at ~24%).
- At least 3 items at `C1`. Nothing below B2 — this is written register, not spoken.
- `example` must be a sentence that belongs in *this* answer. If it would fit any prompt, rewrite it.
- No `chunk` may repeat inside your cluster file.
- For `ac_task1`, at least 3 items must come from the trend/comparison/share bank appropriate to **this
  chart kind** (R1 §5, R3 §3.4). For `gt_task1`, at least 3 from **this register's** bank (R3 §3.4,
  R4 §2.3).

### 1.7 `upgrade_pairs`

```jsonc
{ "vague": "<what a band-6 writer writes>", "precise": "<the upgrade>", "why": "<≤14 words>" }
```

3–5 items in this prompt's subject matter. **At least one must be an over-generalisation → hedged
pair** (`everyone / in most industrialised economies`), because over-reach is the named band-7 residue
(R3 §3.2). **Never ship a thesaurus reach as an upgrade** — a misused rare word costs twice and is
direct counter-evidence against the awareness of style and collocation the descriptor credits
(R3 §6.2). `utilise` is not an upgrade on `use`.

### 1.8 `target_structures`

```jsonc
{ "name": "<≤6 words — from R3 §3.3(a), or another structure this prompt genuinely pulls>",
  "model": "<one authored sentence in this prompt's subject>",
  "trap":  "<the accuracy failure this structure carries, ≤20 words, wrong → right>" }
```

1–2 items. Choose the structure **this prompt's content pulls**, not one you like. Band 6 already
attempts complexity; landing it is the upgrade, so every entry ships the trap with the structure
(R3 §3.3). Across your 14 prompts you must use at least **5 distinct** `name` values.

### 1.9 `error_watchlist`

```jsonc
{ "pattern": "<name from R3 §5.1 or R1 §8, ≤6 words>",
  "wrong": "<the error, in THIS prompt's content>",
  "right": "<the fix, same sentence>",
  "why":   "<≤14 words — a rule the learner can apply>",
  "criterion": "ta" | "cc" | "lr" | "gra" }
```

**Exactly 2 or 3, ordered highest-impact first.** The report surfaces one improvement, so index 0 is
the one it gets — that is a decision, and you make it. Choose the patterns this prompt's content
*forces*. Pairs worth copying:

| Prompt shape | `error_watchlist[0..1]` |
|---|---|
| Any chart with percentages | percentage-point vs per cent · `by` vs `to` with figures |
| Any dated chart | tense consistency from the data's dates · subject–verb agreement across a long subject |
| Share data (pie, stacked) | share vs amount (a smaller share is not less money) · `the number of` vs `the amount of` |
| Process | passive on a man-made process (or active on a natural cycle) · sequencer-initial sentence chains |
| Map | tense for the date pair · locating nothing (the compass rule) |
| Formal letter | register drift at bullet 3 and the closing line · present perfect for a running problem |
| Informal letter | over-formal opening · missing contractions reading as wrong |
| Task 2 opinion | position drift between intro and conclusion · unhedged absolutes |
| Task 2 problem/solution | solutions detached from the causes named · `suggest to do` → `suggest doing` |
| Task 2 discussion | opinion visible only in the last sentence · `people which` |

### 1.10 `checklist` — the last three minutes

4–6 strings, ≤ 14 words each, **prompt-specific and in execution order**. Not "proofread" — that finds
nothing. "Read the introduction and the conclusion together: same position?" is a check. For `task2`
always include the topic-sentence cover test (R3 §3.1). For `gt_task1` always include the
greeting/sign-off pairing check first, because it is the fastest fix and the most avoidable loss
(R4 §1.6). For `ac_task1` always include a figures-transcribed-correctly pass.

### 1.11 `rewrite_focus` — the one change that would most raise this script

```jsonc
{ "focus": "<≤20 words — a BEHAVIOUR, imperative>",
  "why":   "<≤25 words — what it buys, named by criterion>",
  "drill": "<≤30 words — a timed retry the learner does now>" }
```

This drives the targeted-rewrite screen (F6). It must be a behaviour with a retry attached; a piece of
feedback with no "try it now" is a note, not coaching (R4 §7.3). `drill` must name a duration.

---

## 2. `overview_brief` — Academic Task 1 only, and first-class

The overview is named explicitly at three consecutive bands and is what separates them: band 5
recounts detail mechanically with no clear overview, band 6 has one with information appropriately
selected, band 7 has a **clear** overview of the main trends, differences or **stages** (R1 §3.2). It
is the single biggest scoring lever in the task, so it is a required, structured field — not a
sentence in a note.

```jsonc
"overview_brief": {
  "must_capture": [ "<≤25 words>", "<≤25 words>" ],   // REQ — EXACTLY 2 whole-data statements
  "model_overview": "<1–2 sentences, 25–45 words, CONTAINS NO DIGITS>",   // REQ
  "weak_overview": {                                   // REQ — the plausible bad one
    "text": "<one full sentence a real learner would write>",
    "failure": "W1".."W10" },                          // REQ — the R1 §3.5 taxonomy code
  "group_as": {                                        // REQ — the two body paragraphs
    "body1": "<≤20 words>", "body2": "<≤20 words>",
    "why":   "<≤25 words — why this grouping beats the obvious one>" },
  "must_report": [ "<≤18 words>" ],                    // REQ — 4 to 6 features/figures
  "omit":        [ "<≤15 words>" ],                    // REQ — 2 to 4
  "figure_budget": { "min": <int>, "max": <int> },     // REQ — inside 6..16, and min < max
  "tense": "<≤18 words — which tense, derived from the DATES, and why>",   // REQ
  "phases": [ { "name": "<≤5 words>", "step_ids": ["<id>", ...] } ]        // REQ iff genre==process
}
```

**Rules**

1. `must_capture` is **exactly two**. One statement is thin; three is a body paragraph (R1 §3.6). Each
   must pass the strong-overview test: someone who never saw the visual could repeat it and be right;
   it is true of the *whole* data set; it would still be worth saying with every number deleted.
2. `model_overview` **must contain no digit characters**. This is lint-enforced. The figure-free rule
   is a heuristic dressed as a rule, and we teach it as an absolute below band 7 because the failure it
   prevents — an overview decaying into a data sentence — is far more damaging than the stiffness it
   causes (R1 §3.4).
3. `weak_overview` is the negative exemplar, and `failure` codes it against R1 §3.5:
   `W1` absent · `W2` data sentence in disguise · `W3` title restatement · `W4` counting not shaping ·
   `W5` detail promoted · `W6` explanatory · `W7` hedged into nothing · `W8` one-sided ·
   `W9` unsignposted · `W10` contradicts the body. It must be *plausible* — write what a real band-6
   candidate would write for this chart, not a parody.
4. `group_as` is authored **before the data** (R1 §9.3 rule 3). Two body paragraphs means exactly two
   groups. The diagnostic for failure is machine-checkable: **if the order of the sentences matches the
   order of the labels on the visual, the learner has not grouped.**
5. `figure_budget` derives from the 150-word arithmetic: a good answer cites roughly 8–14 figures
   across 4–6 comparative claims, because a comparative claim costs 18–25 words and a bare data
   sentence costs 8–14 (R1 §4.2). Set it from the chart's own richness; never above 16.
6. `omit` must name real things in *this* visual that the learner should deliberately not mention. If
   nothing can be omitted, the chart is too thin (§6.2).
7. `tense` is derived from the dates in the description line, not from the chart: a period ending in a
   past year takes past simple; an undated chart, a process or a map "as it is now" takes present
   simple; projected years take `is expected to` (R3 §5.1).
8. `phases` (process only) is the authority behind the band-7 overview. **Author the phase names
   first, then the steps inside them.** If you cannot write the band-7 overview from your own step
   list, the step list is wrong (R1 §6.2). Every `step_ids` entry must be an id present in
   `chart_spec.steps`, every step must belong to exactly one phase, and there must be **2–4 phases**.
   Phases live here and **never in `chart_spec`** — putting them on the diagram hands the learner the
   overview.
9. On a `map`, one `must_capture` statement must be about **what did not change**. On two-period share
   data, one must be about **stability** and one about **change**. On a `mixed` task, one statement
   must *relate* the two visuals — covering only one is failure W8 and is the type's signature loss
   (R1 §3.6).

---

## 3. `letter_brief` — General Training Task 1 only

Register is inside Task Achievement, not style: the criterion covers tone appropriate to the recipient
and **held consistently** (R4 §1.4). That is why it gets structured fields and a deterministic checker
(F7).

```jsonc
"letter_brief": {
  "purpose":       "P1".."P21",                       // REQ — R4 §3.2 code
  "purpose_label": "<≤5 words, learner-facing>",      // REQ — e.g. "apology"
  "register":      "formal" | "semi_formal" | "informal",   // REQ — MUST equal row.genre
  "recipient":     "<≤18 words — who they are AND why that register follows>",  // REQ
  "greeting":      "<exact string, e.g. 'Dear Ms Okonjo,'>",   // REQ
  "signoff":       "<exact string, e.g. 'Yours sincerely,'>",  // REQ
  "moves":         [ "<≤12 words>" ],                 // REQ — 4 to 7, ordered
  "bullet_notes":  [                                  // REQ — EXACTLY 3, indexes 0,1,2
    { "bullet_index": 0,
      "function":       "<≤10 words — the speech act this bullet performs>",
      "must_include":   "<≤20 words — the concrete thing the learner has to supply>",
      "extension_move": "<≤20 words — the SECOND sentence that extends it>",
      "tone_note":      "<≤18 words — how the register is modulated for THIS bullet>" } ],
  "register_signals": [                               // REQ — 3 or 4
    { "signal": "<enum>", "do": "<short example>", "dont": "<short example>" } ],
  "drift_watch": "<≤25 words — where drift will happen in THIS letter>"   // REQ
}
```

**Rules**

1. `greeting` must appear **verbatim as the last line of `prompt_text`** (the house format ends
   `Begin your letter as follows:\n\nDear …,`). Lint-enforced.
2. `signoff` must pair with `greeting` per R4 §2.2. Lint-enforced against this table:
   `Dear Sir or Madam,` → `Yours faithfully,` · `Dear <Title Surname>,` → `Yours sincerely,` (or
   `Kind regards,` / `Best regards,` at `semi_formal`) · `Dear <FirstName>,` / `Hi <FirstName>,` →
   `Best wishes,` / `All the best,` / `Take care,` / `Speak soon,`.
   **`Dear Sir or Madam,` + `Yours sincerely,` is the classic error and must never appear as a model.**
3. `bullet_notes` has exactly one entry per `letter_bullets` element, contiguous from 0.
   **`extension_move` is the whole point of the field**: coverage without extension is the commonest
   band-6 ceiling on this task and is invisible to a checklist (R4 §4 row 1). It must be a *different*
   sentence that adds something the bullet did not say — a date, an amount, a consequence, a named
   preference — not a restatement.
4. `tone_note` encodes the bullet × tone interaction (R4 §4): one register for the letter, modulated
   per bullet. In a formal complaint, bullet 1 can be plain and bullet 3 carries the heaviest
   politeness machinery; learners do the opposite.
5. `register_signals[].signal` enum: `contractions` · `verb_stock` · `modality` · `opening_move` ·
   `sentence_length` · `hedging` · `exclamations` · `questions` · `naming_the_reader` · `closing_move`.
   Choose the 3–4 signals this letter's content actually stresses.
6. `drift_watch` names one of R4 §2.4's four drift sites instantiated for this letter: bullet 3 in a
   formal letter, the closing sentence, the first line of an informal letter, or the emotional peak of
   a complaint.
7. `purpose` must be compatible with `register` per R4 §3.3's matrix. Never author `P7 application` as
   informal or `P15 asking advice` as formal.

---

## 4. `essay_brief` — Task 2 only

```jsonc
"essay_brief": {
  "question_type":     "<≤10 words — the real wording family this prompt uses>",   // REQ
  "obligatory_shape":  "<≤30 words — what a FULL response must do, stated as a rule>",  // REQ
  "axis":              1..9,                       // REQ — the R2 §3.1 argumentative axis
  "axis_label":        "<≤8 words>",               // REQ
  "position":          "<one sentence, ≤30 words — the position the models argue>",  // REQ
  "position_touchpoints": [ "<≤15 words>", "<≤15 words>", "<≤15 words>" ],  // REQ — EXACTLY 3
  "idea_bank": [                                   // REQ — EXACTLY 4, 2 per side
    { "side": "<≤6 words>",
      "claim":       "<≤20 words>",
      "mechanism":   "<≤25 words — WHY the claim follows; what causes what>",
      "evidence":    "<≤25 words — a typical case or a category, NEVER a statistic>",
      "consequence": "<≤20 words — so what; who is better or worse off>" } ],
  "development_drill": { "claim": "<one claim, ≤20 words>", "ask": "<≤25 words>" },  // REQ
  "memorisation_test": "<≤25 words — why a memorised essay on this theme cannot answer THIS prompt>"
}
```

**Rules**

1. `obligatory_shape` fixes the failure that costs the most band (R2 §7 row 1). Write it as a rule the
   learner can check: for `discussion`, "Three parts, not two — view A, view B, and *your* opinion,
   which must be visible before the conclusion." For "outweigh", "A verdict in the introduction and
   again in the conclusion; weight, not count."
2. `position_touchpoints` is exactly three — introduction, inside a body paragraph, conclusion. **If
   deleting the last sentence removes the opinion, it is a band-6 essay** (R2 §4.3). The three
   touchpoints make the rule authorable and checkable.
3. `idea_bank` is **arguments with mechanisms, not vocabulary**, and it is exactly R2 §5.1's four moves
   made into fields. This is the single most actionable thing the payload carries and it is what the
   band 6→7 step actually consists of. Two ideas per side so the learner practises the *language*
   rather than the ideation.
4. **`evidence` must never be a statistic or a study.** Invented figures are self-defeating and
   contested; a specific, plausible, unnumbered instance is stronger, faster to write and cannot be
   caught sounding false (R2 §5.1). Use a *typical case* ("a commuter in a city with no evening
   service…"), a *category* ("countries that introduced a deposit scheme…") or a *consequence chain*.
5. `development_drill` gives the CLAIM and makes the learner supply MECHANISM / EVIDENCE /
   CONSEQUENCE. The `ask` must name what they produce and how long they have.
6. `memorisation_test` is the authoring gate applied to your own prompt: *could a memorised essay on
   this theme answer it?* If yes, the situation statement is not narrow enough — narrow it and rewrite
   the field.
7. `axis` codes R2 §3.1: 1 individual vs state · 2 regulation vs freedom · 3 spending trade-off ·
   4 modern vs traditional · 5 cause vs remedy · 6 is this change good · 7 global vs local ·
   8 short-term cost vs long-term benefit · 9 who pays and who benefits. Across your 14 prompts you
   must use **at least 6 distinct axes**. A prompt that fits no axis is a topic, not an argument.

---

## 5. Model answers — three bands, one answer

### 5.1 `model_answers`

**Exactly three entries, `band_target` `6` then `7` then `8`, in that order.** All three say the *same*
thing with the *same* content. Only the language and the density of relevant detail differ. That is the
whole design: it isolates language from content, so the learner cannot conclude that band 8 means
better ideas (R3 §3.6, R4 §8.3 rule 2).

"Same content" is concrete and lint-checkable per task type:

- `ac_task1` — the three answers cite **the same figures**, make the same overview claims and use the
  same grouping. Nothing may appear in the band-8 answer that is a *new fact from the chart*.
- `gt_task1` — the same three bullet specifics (the same dates, amounts, names, requests).
- `task2` — the same position and the same two ideas from `idea_bank`, in the same order.

```jsonc
{ "band_target": 6 | 7 | 8,
  "label": "<≤8 words>",                  // REQ — e.g. "Where most candidates land"
  "word_count": <int>,                    // REQ — the true count of `text`, ±2
  "text": "<string, \n\n between paragraphs>",   // REQ
  "what_caps_it":  [ { "criterion": "ta"|"cc"|"lr"|"gra", "point": "<≤20 words>" } ],
  "what_lifts_it": [ { "criterion": "ta"|"cc"|"lr"|"gra", "point": "<≤20 words>" } ],
  "annotations":   [ { "span": "<EXACT substring of THIS text>",
                       "kind": "<enum>",
                       "criterion": "ta"|"cc"|"lr"|"gra",
                       "label": "<≤8 words>",
                       "why":   "<≤20 words, phrased as something to do next time>",
                       "transferable": true|false } ] }
```

`kind` enum: `move` · `overview` · `grammar` · `lexis` · `cohesion` · `register` · `data` · `avoid`.

Per-band requirements:

| | band 6 | band 7 | band 8 |
|---|---|---|---|
| `word_count`, Task 1 (`ac_task1`/`gt_task1`) | 155–175 | 170–195 | 175–200 |
| `word_count`, `task2` | 250–275 | 265–295 | 275–305 |
| Annotations | 5–7 | 7–10 | 4–6 |
| Required kinds | ≥ 3 × `avoid`, ≥ 1 non-`avoid` (something it does right) | ≥ 1 × `grammar`, ≥ 1 × `lexis`, ≥ 1 × `cohesion`, **0 × `avoid`** | ≥ 1 × `grammar`, ≥ 1 × `lexis`, **0 × `avoid`** |
| Extra required kind | — | `ac_task1` → ≥ 1 × `overview`; `gt_task1` → ≥ 1 × `register`; `task2` → ≥ 1 × `move` | — |
| `what_caps_it` | exactly 3, three different criteria | `[]` | `[]` |
| `what_lifts_it` | `[]` | exactly 3, vs band 6 | exactly 3, vs band 7 |

**Every `span` must be an exact substring of its own `text`.** Lint-enforced; the UI locates
annotations by string search and a near-miss breaks the highlight silently. Spans within one model must
not overlap. Copy the span out of the text — do not retype it.

**Writing the band 6.** It must be *plausible*, not a parody. A band-6 script is organised, relevant
and readable; a reader follows it without effort. What caps it: an overview that is present but
mechanical or a position that vanishes from the middle of the essay; ideas announced and never
explained (claim, restated claim); connectives stacked at the head of every sentence; the same noun
repeated where a reference belongs; approximate collocations; errors in every paragraph that a reader
steps over rather than trips on (R2 §8, R3 §2). Include at least one thing it does *right* and annotate
it non-`avoid` — the learner needs to know what to keep.

**Writing the band 7.** The diagnostics from R3 §3 are what you are demonstrating: a topic sentence
that makes a claim rather than naming a subject; four-move development on one idea; a genuine run of
error-free complex sentences; `whereas` / `while` / a non-defining relative doing real work; a
reference or substitution replacing a repeat; precise partners rather than rare words. On `ac_task1`
add the separated figure-free overview and comparison as the default grammar. On `gt_task1` add one
specific per bullet and a correctly paired sign-off.

**Writing the band 8.** One further step, not a different universe. Band 8 is *most* sentences
error-free plus density of relevant detail — on a letter the 7→8 jump is largely a **content** jump
(reader-consideration moves like offering two options), not a vocabulary jump (R4 §5). Show one cleft
or one nominalisation, one hedge that is a precision device, and cohesion that has moved inside the
sentences rather than sitting on the front of them. **Do not pack it with rare vocabulary** — that is
the band-6 failure mode wearing a costume (R3 §6.2).

**Band 5 and band 9 are not authored.** Band 5 is served far more cheaply by `sentence_ladder` (§5.2):
the 5→6 difference is accuracy, which is legible in one sentence and does not need a 170-word script,
and a full band-5 model is the least imitable text we could ship. Band 9 is dropped: the published
scale gives no countable property to author against (R3 §9.9), band 8 is already "most sentences
error-free", and a band-9 model teaches admiration rather than attribution (R4 §8.2).

### 5.2 `sentence_ladder` — the cheap band-5 rung

```jsonc
"sentence_ladder": {
  "idea": "<≤15 words — the single thing all four rungs say>",
  "rungs": [ { "band": 5, "text": "<one or two sentences>" },
             { "band": 6, "text": "..." },
             { "band": 7, "text": "..." },
             { "band": 8, "text": "..." } ] }        // REQ — exactly 4, bands 5,6,7,8
```

Same content, four renderings, in this prompt's subject. The band-6/7/8 rungs should be **liftable from
the corresponding `model_answers[].text`** wherever possible, so the ladder and the models agree; the
band-5 rung is authored fresh. What must change between rungs, and what the annotation copy should say:
5→6 is *accuracy*; 6→7 is *specificity plus flexible structure*; 7→8 is *density of relevant detail and
reader consideration* (R4 §5). This is the whole band-5 lesson at a twentieth of the authoring cost.

### 5.3 `swap_slots` — anti-memorisation

```jsonc
[ { "span": "<EXACT substring of the BAND-7 model text>",
    "prompt": "<≤25 words — what the learner must put there instead>" } ]
```

**Required for `gt_task1` (3–4 entries), optional elsewhere.** A letter model necessarily invents
dates, amounts and names; those must be visibly not the learner's to keep. Cover at minimum the date or
reference, the concrete specific under one bullet, and the request. The `prompt` must demand
specificity — a vague replacement leaves the model memorisable.

For `task2` and `ac_task1` this is usually unnecessary (the specifics are arguments and given figures),
but use it if a model contains an invented instance a learner would be tempted to carry wholesale.

---

## 6. `chart_spec` v2

### 6.1 What changes

v1 is `bandready:chart-spec:v1` in `docs/plan/05-writing-module.md` §2.2 and it is **not broken by this
revision** — every existing spec stays valid and every field keeps its meaning. v2 adds exactly three
things:

| Addition | Shape | Renderer work |
|---|---|---|
| **Combined task** | `kind: "mixed"` + `panels: [spec, spec]` + `panel_link` | **Required — blocker** |
| **Multiple pies** | `kind: "pie"` with 2–3 `series`, one pie per series | **Required — blocker** |
| **Caption note** | `notes: "<≤120 chars>"` | Trivial (one line in `figcaption`) |

Mark a spec as v2 with `"spec_version": 2`. Absent means 1. Only specs using a v2 addition need it.

```jsonc
{
  "spec_version": 2,                 // OPT — present only when a v2 addition is used
  "kind": "bar"|"grouped_bar"|"stacked_bar"|"line"|"pie"|"table"|"process"|"map"|"mixed",
  "title": "<string>",               // REQ
  "unit":  "<string>",               // REQ for numeric kinds; the unit must be repeatable in prose
  "notes": "<≤120 chars>",           // OPT — a caption, e.g. rounding or a multiple-response note
  "x_axis": { "label": "...", "categories": ["..."] },   // ≤ 12 categories
  "y_axis": { "label": "...", "min": <num>, "max": <num> },
  "series": [ { "name": "...", "values": [<num>, ...] } ],   // ≤ 5 series
  "rows":   [ [<header cells>], [<data row>], ... ],         // table only; row 0 is the header
  "steps":  [ { "id": "...", "label": "...", "next": ["..."] } ],   // process only
  "snapshots": [ { "label": "...", "features": [ { "label","shape","x","y","w","h" } ] } ],  // map, exactly 2
  "panels": [ <complete child spec>, <complete child spec> ],       // mixed only, exactly 2
  "panel_link": "<≤30 words>"                                       // mixed only — the relationship
}
```

### 6.2 The describability budget (R1 §9.1)

A **cell** is one reportable value: `categories × series` for cartesian kinds, segments × pies for pie,
`(rows−1) × (columns−1)` for a table, steps for a process, features in the larger snapshot for a map,
and the **sum across panels** for `mixed`.

| Cells | Verdict |
|---|---|
| ≤ 6 | **Reject.** Nothing to select; the learner reports everything, hits 110 words and pads |
| 8–14 | Acceptable at difficulty 1 |
| **15–28** | **The sweet spot.** Reporting everything is impossible in 180 words; grouping is forced |
| 29–40 | Difficulty 3 only, and only with a very clean structure |
| > 45 | **Reject.** Tests reading speed and panic, not writing; also breaks legibility |

Difficulty calibration (R1 §9.5), which `difficulty` must honour:

| | 1 | 2 | 3 |
|---|---|---|---|
| Cells | 6–12 | 13–24 | 22–35 |
| Dimensions | 1 series, or 1 time axis | 2–3 series, or 2 dimensions | 3+ series, or 2 dimensions × time, or 2 units |
| Grouping | Obvious | A choice between two defensible groupings | A choice where the obvious grouping is the worse one |
| Traps | none | one | one or two |
| Typical genres | single `bar`, single `pie`, simple `line` | 3-series `line`, `grouped_bar`, two-period `pie`, `map`, linear `process` | two-unit `table`, `stacked_bar`, `mixed`, branching `process` |

### 6.3 Per-kind requirements

Author `overview_brief.must_capture` and `overview_brief.group_as` **before** the numbers, then build
the data so those sentences are true and are the best two available (R1 §9.3 rule 2). If you cannot,
the data has no structure.

- **`bar`** — single series, 6–8 categories, **difficulty 1 only**. Required: a clear leader, a cluster
  of 2–3 near-equal middle values, a clear tail. Cannot train trend language; use sparingly.
- **`line`** — 2–4 series × 5–7 evenly spaced human time points (years, every 2 years, decades), target
  15–24 cells. **Required: one crossover or ranking reversal, one flat/stable series, and different
  *shapes* among the risers** (one linear, one accelerating). Never 13 points.
- **`grouped_bar`** — 4–6 categories × 2–3 groups, 12–18 cells. **Required: one pattern holding across
  most categories plus exactly one category that breaks it.** Naming the exception in the overview is
  what separates 7 from 6 here. Richness without pattern is the most seductive authoring mistake.
- **`stacked_bar`** — 4–5 stacks × 3–4 components, 12–20 cells, components summing to 100 or to a
  stated total. **Required: one component whose share rises across the stacks, one that falls, one that
  holds.** Verify visually before shipping — stacked bars go through the same cartesian path as grouped.
- **`pie`** — 5–7 segments. **Prefer a pair or trio to a single pie**; a single pie is difficulty 1
  only. Segments must sum to 100 exactly (a pie summing to 99 is a data bug the learner will lose time
  over) and at most one segment may be under 5%. For a pair, required: at least one segment holding its
  rank (stability) and at least one changing share sharply (change).
- **`table`** — 4–5 data rows × 3–4 data columns, 12–20 cells, never more than 5 columns. **Required:
  either two different units/measures or two time points across all rows, plus one row that behaves
  differently.** The best vehicle for "you cannot report all of this"; push toward the top of the range.
  Keep row labels short.
- **`process`** — **6–9 steps that group into 2–4 nameable phases** (`overview_brief.phases`), a named
  input and a named output (or an explicit return-to-start for a cyclical process). Step labels are
  noun-phrase or short-clause **fragments**, never full sentences — a finished sentence on the diagram
  will be copied, and copying is penalised. Recommended: one step carrying a stated condition or
  duration (`heated to 900°C`, `left to dry for 48 hours`) — one or two, not six. Author **both** a
  man-made process (passive throughout) and a natural cycle (active present simple); the grammar
  differs and drilled-on-passive learners write nonsense on cycles.
- **`map`** — 7–10 features per snapshot, 4–7 differences, exactly 2 snapshots on a 0–100 × 0–100 grid
  with features ≥ 8 units apart. **Required: at least one feature unchanged and present in both; at
  least one conversion, one addition and one removal; features spread across the compass, not clustered;
  one orienting linear feature (road, river, coastline) in both.** `shape` ∈
  `rect|circle|road|river|tree` — anything else falls back to a labelled block.
- **`mixed`** — §6.4.

**Reject a spec if any of these are true** (R1 §9.6): the whole visual is truthfully describable in
three sentences · all series move the same way at the same rate · there is no exception, crossover,
plateau or disproportion anywhere · the learner would have to report every cell to reach 150 words ·
two decimal places, or values that cannot be read off the axis · a pie not summing to 100 or with two
sub-5% segments · a process whose steps do not group into nameable phases · a map where everything
changed · a `mixed` task whose panels share no population · more than 5 series or 12 categories · a
description line that pre-supplies the overview.

### 6.4 `mixed` — the combined task

`kind: "mixed"` carries **exactly two `panels`**, each a complete child spec with its own `kind`,
`title`, `unit` and data. Panels must be **different kinds** (pie + bar, table + line, bar + pie are the
common real pairings) — two pies of the same categories are a pie *pair*, which is §6.5, not a mixed
task.

```jsonc
{ "spec_version": 2, "kind": "mixed",
  "title": "Water use in Verdon, 2018–2024",
  "panel_link": "The pie shows how the total is split; the line shows how the total itself moved.",
  "panels": [ { "kind": "pie",  "title": "...", "unit": "...", "x_axis": {...}, "series": [...] },
              { "kind": "line", "title": "...", "unit": "...", "x_axis": {...}, "y_axis": {...},
                "series": [...] } ] }
```

Rules: total cells across both panels **16–26** — each panel should be *slightly thin on its own*, which
is the point; neither is worth 180 words alone. **The two panels must share a population and be
interpretable together**; two unrelated visuals stapled together is not a mixed task, it is two tasks.
`panel_link` states the relationship in the author's words and is teaching data, not rendered chrome.
The description line introduces both visuals and the standard rubric line follows once. A child panel
may not itself be `mixed`, and `SERIES_MAX`/`MAX_CATEGORIES` apply **per panel**.

### 6.5 Pie pairs and trios

`kind: "pie"` with **2 or 3 series**. `x_axis.categories` carries the segment labels, shared by all
pies; `series[i].name` is that pie's caption (the year, the place, the group); `series[i].values` are
its shares and must sum to 100. The renderer draws one ring per series, side by side, with the series
name beneath.

This is the most valuable missing shape after `mixed` (R1 §9.2) because it converts a ranking task into
a change-of-share task, and the universal overview shape for share data — **stability plus change** —
becomes available.

### 6.6 Renderer and serialiser work required

Stated plainly so the feature agents can scope it and so authoring agents know what is blocked.

| # | Change | Files | Blocks |
|---|---|---|---|
| 1 | `mixed`: recurse over `panels` | `chart/ChartRenderer.tsx` (add `mixed` before the `DRAWABLE` check; render each panel through the existing dispatch with its own `figcaption`), `chart/summary.ts`, `store.ts` (`ChartKind` += `"mixed"`, `ChartSpec.panels`/`panel_link`), `scoring/writing.py` (`CHART_KINDS` += `mixed`; `validate_chart_spec` recursive branch; `chart_to_text` emits `Visual 1: …` / `Visual 2: …`) | **Every `mixed` prompt.** Today a `mixed` spec falls through to a raw data table and the evaluator receives only a title |
| 2 | Pie pairs: one ring per series | `chart/PieChart.tsx` (loop over `series`, lay rings out horizontally, wrap at narrow widths), `chart/summary.ts` and `scoring/writing.py:chart_to_text` (per-series `Segments in <name>: …`), `validate_chart_spec` (allow 1–3 pie series, each summing to ~100 ±1) | **Every pie pair/trio prompt** |
| 3 | `notes` caption | `chart/ChartRenderer.tsx` figcaption | Nothing — purely additive |
| 4 | — | `grouped_bar`, `stacked_bar`, multi-series `line` | **No work.** Already supported and used by nothing |
| 5 | `validate_chart_spec` rebuilds the spec from a fixed key list and **drops `spec_version`, `notes`, `panels`, `panel_link`** | `scoring/writing.py:374` | Nothing today — it is called only from `_coerce_generated` (the LLM prompt-generation path, line 1543), and **pack rows bypass it entirely**, so authored v2 keys survive into the database. But it must learn the v2 keys before the generator can produce a `mixed` or pie-pair prompt, and the pack loader currently applies **no** chart validation at all, which is why lints 11–13 exist in this document |

**W-A3 must confirm with the verify agent that changes 1 and 2 have landed before authoring any
`mixed` or pie-pair prompt.** If they have not, W-A3 substitutes per the fallback in §7.3.

### 6.7 Description-line authoring rules (R1 §9.4)

One sentence, 18–30 words, naming the visual type, the measured variable, the **unit**, the
population/place and the time scope. It must be **paraphrasable** — give at least two elements with
real synonyms, or the learner cannot avoid copying it and we have designed a trap. Never smuggle a
cause or an evaluation into it ("…showing the success of the new tram network"), which invites the
invented-causes failure the task is defined against.

The instruction line is fixed and unvaried on **every** `ac_task1` prompt including process and map:

```
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
```

followed by a blank line and `Write at least 150 words.` For `gt_task1` and `task2`, copy the house
format exactly as the existing 16 rows use it — the editor, timer, precheck and evaluator key off it.

---

## 7. Cluster assignments

Six agents, **14 prompts each, 84 new**, taking the bank to **100**. Clusters are non-overlapping by
task type and by subject.

### 7.1 Global rules

**Difficulty mix — per cluster, exactly: 3 × difficulty 1, 7 × difficulty 2, 4 × difficulty 3.**

**Do not re-author an existing subject.** The 16 shipped prompts are listed in §7.8.

**Reserved:** the three `TEMPLATE.json` subjects (§7.7) belong to the template and must not be
re-authored.

**topic_id** must come from `data/topics.jsonl` and no cluster may use one topic_id more than **4**
times in its 14 prompts. Available: `topic_environment` `topic_education` `topic_technology`
`topic_health` `topic_globalisation` `topic_urbanisation` `topic_work` `topic_media` `topic_culture`
`topic_transport` `topic_crime` `topic_tourism` `topic_family` `topic_science` `topic_economy`
`topic_food` `topic_sport` `topic_housing` `topic_communication` `topic_money`.

**`topic_tags`** — 3 lowercase tags per row, free text, at least one not equal to the topic_id's stem.

### 7.2 `W-A1 · ac1-trends` — cartesian Academic Task 1 · id prefix `wp_a1_`

The numeric family: the trend-language engine and the two-dimensional organisation test the pack has
**zero** of today.

| Genre | Count | Notes |
|---|---|---|
| `line` | 5 | The most under-supplied type in the bank — one existing prompt trains the whole trend system. At least 2 must have a crossover; at least 1 must be a period ending "at present" so the tense system changes; at least 1 must carry a projected series (`is expected to`) |
| `grouped_bar` | 4 | Zero exist. At least 2 must be *two-period* (same categories, two dates) so change language sits on top of the two-dimensional organisation |
| `stacked_bar` | 3 | Zero exist. Components sum to 100 |
| `bar` | 2 | Difficulty 1 only, single series |

Subject areas (pick 14 distinct): energy and fuel mix · rail and road freight · household expenditure ·
enrolment by subject · hospital waiting times · internet access by age · recycling rates by material ·
crop yields · library and museum visits · water consumption by sector · employment by sector ·
mobile vs fixed-line subscriptions · rainfall and reservoir levels · overseas student numbers.

Teaching centre of gravity: `describing_trend` and `grouping`; the noun+adjective nominalisation
(`there was a sharp rise in…`) which is the highest-value structural upgrade in Task 1; the `by`/`to`
preposition trap on every prompt with a figure; adverb–verb intensity matching (`plummeted slightly` is
a lexical error, not a style choice).

### 7.3 `W-A2 · ac1-shapes` — non-cartesian and composite Academic Task 1 · id prefix `wp_a2_`

| Genre | Count | Notes |
|---|---|---|
| `pie` | 3 | **At least 2 must be pairs or trios** (§6.5). Single pie at difficulty 1 only |
| `table` | 3 | At least 1 with two different units, at least 1 with two time points across all rows |
| `process` | 3 | **At least one man-made (passive throughout) and at least one natural cycle (active present simple)**; at least one cyclical; one may branch (difficulty 3) |
| `map` | 3 | At least one past→past pair, one ending "the present day", and **one competing-proposals map** (present vs proposed) to exercise the future-passive row of R1 §7.2 |
| `mixed` | 2 | Different kinds per panel; difficulty 3 |

**Fallback if §6.6 changes 1 and 2 have not landed:** substitute the 2 `mixed` with 1 extra `table` +
1 extra `process`, and the 2 pie pairs with 2 single pies at difficulty 1 **only as a last resort** —
report the substitution, because it re-creates the exact gap this push exists to close.

Subject areas: bottle/paper/textile recycling · water treatment and desalination alternatives ·
chocolate, cheese or brick manufacture · the water cycle · a moth or frog life cycle · coffee or olive
processing · a village becoming a commuter town · a hospital or campus site redevelopment · a seafront
or harbour · two proposals for a town square · household spending shares · tourism arrivals by region ·
energy sources by share · a university's applications, offers and enrolments.

Teaching centre of gravity: `sequencing` and `locating`; passive vs active by process type; the map
tense matrix (past→past = past perfect for the earlier state; →present day = present perfect passive;
→proposed = future passive; two proposals = comparison, not change); "what remained unchanged" as
compulsory overview material.

### 7.4 `W-A3 · gt-formal` — formal letters · id prefix `wp_a3_`

14 letters, **all `genre: "formal"`**. Purposes (R4 §3.2), no purpose more than twice:
**P1** complaint · **P2** enquiry · **P3** request · **P7** application · **P8** resignation ·
**P10** explanation · **P13** recommendation · **P14** suggestion · **P17** chasing ·
**P18** notifying a change · **P19** purchase/claim · **P21** offering help.

Cover at least **10 distinct purposes**. Split the greeting form roughly evenly between
`Dear Sir or Madam,` (→ `Yours faithfully,`) and a named recipient (→ `Yours sincerely,`) so both
pairings are practised. At the 4 difficulty-3 slots, use **two purposes in one letter** (apologise *and*
propose a new arrangement; explain *and* request) — that is where the interesting teaching is and the
pack has nothing.

Teaching centre of gravity: `requesting` and `proposing`; polite modal requests
(`I would be grateful if you could…`); present perfect for a running problem; register *coldness* in a
complaint (formal complaint register is cold and evidenced, not hot); and R4 §2.4 drift sites —
bullet 3 and the closing line.

### 7.5 `W-A4 · gt-personal` — semi-formal and informal letters · id prefix `wp_a4_`

14 letters: **8 × `semi_formal`, 6 × `informal`**. Purposes: **P4** apology · **P5** invitation ·
**P6** accepting/declining · **P9** thanks · **P11** news/update · **P12** arrangements ·
**P15** asking advice · **P16** giving advice · **P20** congratulations/sympathy · plus semi-formal
**P1**/**P14** to a landlord, neighbour, tutor or club.

Cover at least **9 distinct purposes**. At the 4 difficulty-3 slots use a face-threatening act in
semi-formal register (declining a neighbour, correcting a tutor, asking a colleague for a favour they
will find awkward).

Teaching centre of gravity: `apologising`, `evaluating`, `exemplifying`; the informal drift trap in
reverse (learners trained on formal templates open a letter to a friend with `I am writing to inform
you that…`); contractions as *correct* in informal register and their absence reading as wrong; the
"decline without ever saying no" failure; and the concrete-specific rule — one concrete detail is worth
ten adjectives.

### 7.6 `W-A5 · t2-people` and `W-A6 · t2-systems` — Task 2 · id prefixes `wp_a5_`, `wp_a6_`

14 essays each. **Genre distribution per agent (identical for both):**
`opinion` 4 · `discussion` 4 · `advantages_disadvantages` 3 · `problem_solution` 2 · `two_part` 1.

`two_part` is capped at 1 because it is already over-represented at 2 of the existing 6 and is the
least frequent type in the wild (R2 §2). Of the 3 `advantages_disadvantages`, **at least 2 must be the
"outweigh" (evaluative) variant** — it requires a verdict the neutral variant does not, and candidates
collapse the two into one listing essay.

| Agent | Topic areas (R2 §3) | Suggested `topic_id`s |
|---|---|---|
| **W-A5 `t2-people`** | education · health · family and children · work and employment · media and communication · arts and culture · sport and leisure · food and diet · ageing populations · language | `topic_education` `topic_health` `topic_family` `topic_work` `topic_media` `topic_culture` `topic_sport` `topic_food` `topic_communication` |
| **W-A6 `t2-systems`** | environment · technology · government spending priorities · globalisation · urbanisation and cities · transport · crime and justice · money and consumerism · science and research · tourism · housing · rules, law and freedom | `topic_environment` `topic_technology` `topic_economy` `topic_globalisation` `topic_urbanisation` `topic_transport` `topic_crime` `topic_money` `topic_science` `topic_tourism` `topic_housing` |

Between them the two agents must cover **at least 20 of R2 §3's 27 areas** — 21 are entirely
unrepresented today — and each agent must use **at least 6 of the 9 argumentative axes** (§4 rule 7).

**Task 2 gets twice the content**, because it is worth twice the band. That is honoured in the payload,
not the count: `essay_brief.idea_bank` is 4 fully-developed arguments, the models run 250–305 words,
and `language_bank.moves` should be 4–5 rather than 3.

Teaching centre of gravity: the four-move paragraph (CLAIM → MECHANISM → EVIDENCE → CONSEQUENCE),
which is what the 6→7 step actually consists of; the three-touch opinion rule on every `discussion`;
the weighing sentence on every "outweigh"; solutions that address the causes actually named; and
`referencing` as the under-taught half of cohesion.

### 7.7 Reserved — the `TEMPLATE.json` subjects

Do not author these: **the share of a weekly food budget spent on five food categories by three income
groups** (grouped_bar) · **an apology to a community-centre manager for the state a hired room was left
in** (formal letter) · **daily caps and charges at heavily visited sites** (advantages_disadvantages).

### 7.8 Do-not-repeat — the 16 existing subjects

`ac_task1`: journeys per person by six transport modes · electricity from three renewable sources ·
a city council budget by area · city tourism comparison table · desalination process · the Sandmouth
map pair.
`gt_task1`: bus-service complaint (formal) · course deferral request (formal) · landlord repairs
(semi-formal) · thanks and invitation to a friend (informal).
`task2`: banning private cars from city centres (opinion) · online-only university courses
(discussion) · the sedentary working day (problem_solution) · frequent career change (two_part) ·
English-medium degrees (advantages_disadvantages) · news on social platforms (two_part).

### 7.9 Resulting coverage

| | existing | new | total |
|---|---|---|---|
| `ac_task1` | 6 | 28 | **34** |
| `gt_task1` | 4 | 28 | **32** |
| `task2` | 6 | 28 | **34** |
| **Total** | 16 | 84 | **100** |

Academic chart kinds after the merge: `line` 6 · `bar` 3 · `grouped_bar` 4 · `stacked_bar` 3 ·
`pie` 4 · `table` 4 · `process` 4 · `map` 4 · `mixed` 2. Every kind reaches the 3-per-kind minimum the
practice ladder needs (R4 §17.6), and both currently-zero kinds are covered.
Letters: ≥ 19 distinct purposes across 3 registers, with ≥ 3 prompts per (purpose × register)
combination we ship — which is what makes the transfer stage of the practice ladder possible at all.

---

## 8. Staging format, ids, merge contract and lints

### 8.1 File location and shape

Each authoring agent writes **one** file:

```
content/core-en/staging-writing/prompts/<cluster-slug>.json
```

e.g. `content/core-en/staging-writing/prompts/ac1-trends.json`. A single JSON object:

```jsonc
{
  "staging_version": 1,
  "cluster": "ac1-trends",              // must equal the filename stem and every row's teaching_json.cluster
  "authored_by": "W-A1:ac1-trends",
  "prompts": [ /* EXACTLY 14 complete writing_prompts.jsonl rows */ ]
}
```

**A row is the JSONL row, not a nested wrapper**, with exactly these keys in this order:

```
id · task_type · genre · topic_id · topic_tags · difficulty · prompt_text · chart_spec ·
letter_bullets · teaching_json
```

`chart_spec` is `null` unless `ac_task1`; `letter_bullets` is `null` unless `gt_task1`. Never author
`min_words`, `time_limit_s`, `source`, `license`, `retired` or `created_at` — the loader and
`_prompt_payload` supply them. `TEMPLATE.json` is itself a valid staging file (with `prompts` of length
3) — copy its shape exactly.

### 8.2 Id convention — collision-proof by construction

```
wp_<agent><serial>_<genre-or-purpose-slug>_<subject-slug>
```

- `<agent>` ∈ `a1 a2 a3 a4 a5 a6`; `<serial>` is `01`–`14`, zero-padded, unique within your file.
- `<genre-or-purpose-slug>`: the `genre` for charts and essays (`line`, `grouped_bar`, `opinion`,
  `discussion`, …); for letters, the register short form plus the purpose (`formal_complaint`,
  `informal_invitation`).
- `<subject-slug>` is 2–4 words, lowercase `[a-z0-9_]`.
- Example: `wp_a1_03_line_rail_freight`, `wp_a3_11_formal_chasing_deposit`.
- **All 16 existing ids begin `wp_core_`, so nothing can collide.** Template ids begin `wp_tm_` and are
  reserved.

### 8.3 The merge step (mechanical, no judgement)

```
for each file in staging-writing/prompts/*.json, sorted by filename:
    for each row in file.prompts:
        append json.dumps(row, ensure_ascii=False) + "\n"  ->  content/core-en/data/writing_prompts.jsonl
then: uv run --project sidecar python -m tools.content.build content/core-en
```

Nothing else. No transformation, no id rewriting, no defaulting. If a merge needs to *fix* anything,
the staging file is wrong and must be sent back. Expected count after the merge:
`writing_prompts` **100**. **Nobody hand-edits `manifest.json`.**

The merge is only useful once §0.3's code changes have landed — `teaching_json` will otherwise validate,
merge, checksum cleanly and be dropped at import. The verify agent must confirm the column exists and
that `GET /api/v1/writing/prompts/{id}` returns a non-null `teaching` before declaring the push done.

### 8.4 Lint rules the merge gate runs (write to pass these)

**Structural**
1. `prompts` has exactly 14 entries (3 in `TEMPLATE.json`); every row has exactly the 10 keys in §8.1.
2. Every `id` matches §8.2, is unique in the file, is unique across all staging files, and does not
   exist in `data/writing_prompts.jsonl`.
3. `task_type` valid; `genre` ∈ `TASKS[task_type]["genres"]`; `difficulty` ∈ 1..3;
   `topic_id` exists in `topics.jsonl`; `topic_tags` has exactly 3 strings.
4. `chart_spec` non-null **iff** `ac_task1`; `letter_bullets` non-null **iff** `gt_task1` and has
   exactly 3 strings.
5. Cluster mix: exactly 3 × difficulty 1, 7 × difficulty 2, 4 × difficulty 3; genre counts match §7;
   no `topic_id` used more than 4 times.
6. `teaching_json.cluster` == the file's `cluster` == the filename stem.

**Prompt text**
7. `ac_task1.prompt_text` contains the fixed instruction line verbatim and ends
   `Write at least 150 words.`; the description line is 18–30 words and contains no digit that
   pre-supplies a finding.
8. `gt_task1.prompt_text` follows the house format and its final line is exactly
   `letter_brief.greeting`.
9. `task2.prompt_text` opens `Write about the following topic:` and contains the reasons/examples line
   and `Write at least 250 words.`
10. **No 8-gram is shared between any two rows in the file** (catches an agent copy-pasting its own
    work), and no 8-gram is shared with any existing row.

**chart_spec**
11. Series ≤ 5, categories ≤ 12, per panel. Every series has `len(values) == len(categories)`.
12. Cell count inside the difficulty band of §6.2. Pie series each sum to 100 ± 1, ≤ 1 segment below 5.
    Table has a header row plus ≥ 2 data rows. Process has 6–9 steps, every `next` id resolving.
    Map has exactly 2 snapshots, 7–10 features each, ≥ 1 label present in both.
    `mixed` has exactly 2 panels of different kinds, neither itself `mixed`.
13. No value has more than one decimal place.

**teaching_json**
14. Exactly one of `overview_brief` / `letter_brief` / `essay_brief` present, matching `task_type`.
15. `time_plan` is the 4 fixed phases with the minutes of §1.1 for this task type.
16. `plan.lines` uses the §1.2 label set for this task type, in order; every `note` ≤ 90 characters.
17. `structure_plan` has the paragraph count and role sequence of §1.3; `sum(words)` inside the target
    band.
18. `parts_checklist` 2–4; `language_bank.moves` 3–5 (4–5 for `task2`), every `frame` contains `___`,
    every move has an `avoid`; `collocations` 6–10 with ≤ 2 single-word items and ≥ 3 at C1;
    `upgrade_pairs` 3–5 with ≥ 1 overreach→hedged; `target_structures` 1–2;
    `error_watchlist` 2–3 with `criterion` ∈ {ta,cc,lr,gra}; `checklist` 4–6.
19. `model_answers` length 3 with `band_target == [6,7,8]`; per-band `word_count` inside §5.1's band and
    equal to the true count of `text` ± 2; annotation counts and required kinds per §5.1;
    `what_caps_it` / `what_lifts_it` exactly as tabulated.
20. **Every annotation `span` is an exact substring of its own `text`; spans within a model do not
    overlap; every `swap_slots[].span` is an exact substring of the band-7 `text`.**
21. `sentence_ladder.rungs` is exactly 4 with `band == [5,6,7,8]`.
22. `ac_task1`: `overview_brief.model_overview` contains **no digit**; `must_capture` length 2;
    `must_report` 4–6; `omit` 2–4; `figure_budget.min < max ≤ 16`; for `process`, `phases` present with
    2–4 entries partitioning `chart_spec.steps` ids exactly.
23. `gt_task1`: `letter_brief.register == genre`; `greeting` is the final line of `prompt_text`;
    `(greeting, signoff)` is a legal pair per §3 rule 2; `bullet_notes` length 3 with contiguous
    `bullet_index`; `swap_slots` 3–4.
24. `task2`: `essay_brief.position_touchpoints` length 3; `idea_bank` length 4 with ≥ 2 distinct
    `side` values; `axis` ∈ 1..9; across the file ≥ 6 distinct `axis` values.
25. All word and character limits in §1–§5 respected.
26. **No forbidden claim** (§0.1) appears in any string: no "band 5 cap", no "band 4 template cap", no
    numeric penalty attached to register, no fabricated statistic or study in any `evidence` or model.

### 8.5 Post-merge, before hand-off

```
uv run --project sidecar python -m tools.content.build content/core-en
```

recomputes `manifest.counts` and `manifest.checksums`, then re-validates the whole pack with checksum
verification.

---

## 9. Features, ranked by learner impact

Each feature names exactly which payload fields it consumes, so content and UI cannot drift.

### F1 — Writing Coach: the attempt-gated band ladder · impact very high · cost M

**Consumes:** `teaching.model_answers[]`, `sentence_ladder`, `swap_slots[]`, `rewrite_focus`.

The speaking module's Compare screen, transplanted. A **Compare** tab exists on every prompt and is
**locked until the learner has submitted an attempt on that prompt**. The lock is the pedagogy, not a
paywall: a model shown before the attempt is a template to memorise, and memorised language is exactly
what the descriptors refuse to credit (R4 §8.1). Locked state shows the reason in one line plus a
Start-attempt button.

Unlocking does **not** open the model. It opens a **find-the-difference gate** (R4 §8.2): one paragraph
of the band-6 model beside the same paragraph of the band-7 model, and a text input — *"Name two things
that changed."* The learner answers; only then do the annotations render, with their answers listed
alongside and matched where we can. Ten seconds of friction converts a 0.25-effect-size activity into a
noticing task, and the noticing is where the effect lives.

Past the gate the screen is two columns. Left: **Your answer**, never changing. Right: **One way to
write it**, with a three-position band selector `6 · 7 · 8` defaulting to **one band above the
learner's own criterion-1 score**, not a fixed value. Between them, a strip renders `what_lifts_it` for
the selected band — three lines, each badged `TA / CC / LR / GRA`. On band 6 it renders `what_caps_it`
instead, same shape.

Annotations are inline dots on the model text, coloured by criterion, resolved by exact string search
(hence lint 20). Tapping opens a popover: `label` bold, `why` beneath, criterion badge. `kind: "avoid"`
dots — band 6 only — use a distinct neutral marker. **No red anywhere.**

A right rail, **Steal this**, lists every `transferable: true` annotation as a chip carrying its
`label`, each with `Add to bank` wired to the vocab suggestion inbox (`lexis` → collocation,
`grammar` → phrase, `move`/`overview`/`cohesion` → technique, not bankable).

`swap_slots` spans render as visibly shaded regions with their `prompt` on hover — the anti-memorisation
device. The learner must see that the specifics are not theirs to keep.

Below the columns, the **sentence ladder**: four rungs of one idea at bands 5–8, with the change between
each rung labelled (*accuracy · specificity · detail and reader consideration*). This is where band 5
lives.

Bottom of the screen: `rewrite_focus.drill` with its named timer and a Start button. **The Compare
screen is not finished until the learner has re-produced the move in their own words.**

### F2 — Plan and time plan in the editor · impact high · cost S–M

**Consumes:** `teaching.time_plan`, `plan`, `structure_plan`.

The outline scratchpad gains this prompt's `plan.lines` as **ghost text** — labelled lines with the
worked `note` greyed as placeholder, cleared on typing. Never pre-filled; it stays free text, never a
form. `plan.test` sits beneath it as one permanent line.

The editor timer gains four phase segments from `time_plan`, rendered as a thin segmented bar. At each
boundary one unobtrusive line appears for four seconds — `Planning time is up — start writing.` No
modal, no block. Overtime per phase is recorded and reported.

`structure_plan` renders in practice mode only, as a collapsed paragraph-roles card with the word
budget per paragraph. `plan.trap` is shown **after** submit, never before, and only as a check.

**Report:** the plan-vs-execution audit (R4 §9.4). `outline_text` is already captured, stored and passed
to the evaluator and nothing is done with it. One line: *"You planned a concession in body 2. There is
no concession in what you wrote."* Nearly free, and it is how you get learners to keep planning.

### F3 — Overview Builder · impact very high · cost M · `ac_task1` only

**Consumes:** `teaching.overview_brief` in full, plus `chart_spec`.

The single biggest scoring lever gets its own surface. Two halves.

**Before writing (practice mode only).** A two-minute step between reading the chart and opening the
editor: two empty boxes headed *"Two things that are true of the whole chart"*, and a rule under them —
**no figures**. A live check greys the Continue button while a box contains a digit, which is the
figure-free rule made structural rather than advised. On Continue, the learner's two statements are
stored (not scored) and the editor opens. Nothing from `overview_brief` is shown yet.

**After submit.** The strip opens the report: the learner's two statements beside `must_capture`, then
`model_overview`, then `weak_overview` labelled with its failure code as the negative exemplar. Below,
a **grouping verdict**: did the sentence order match the order of the labels on the visual? That is
machine-checkable from `chart_spec` and it is the exact diagnostic for "you have not grouped"
(R1 §4.3). Then `group_as` as the alternative, with `why`.

`figure_budget` drives one deterministic line: *"You cited 19 figures; a 180-word answer has room for
8–14, and each extra one costs a comparison."* `omit` names what should have been left out;
`must_report` names anything in the chart the response never mentioned — which we can compute exactly
because we store charts as data, not images. That is a capability an image-based system does not have
and it should be a headline, not a footnote.

### F4 — Parts and bullets coverage strip · impact very high · cost S

**Consumes:** `teaching.parts_checklist`, `letter_brief.bullet_notes` (letters).

A strip above everything else in the report. One row per part (or per bullet): `covered & extended` /
`mentioned only` / `not addressed`, each anchored to the exact sentence from the learner's own text
using the existing offset machinery. For the amber state, the row carries the one question that would
have extended it — taken from `bullet_notes[].extension_move` for letters, from
`parts_checklist[].evidence_question` otherwise. *"What would 'soon' be as a date?"*

In the **editor**, the same list renders in the prompt panel as a self-monitoring checklist the learner
ticks. Never scored, never enforced.

This costs one extra field in the evaluator's JSON and attacks the largest single cause of a capped
criterion-1 score.

### F5 — Language bank and watchlist · impact high · cost M

**Consumes:** `teaching.language_bank`, `collocations`, `upgrade_pairs`, `target_structures`,
`error_watchlist`.

A per-prompt tab, **always available** — this is preparation material, not a model answer, so it is not
attempt-gated. `language_bank.warning` sits at the top, never dismissible. One accordion per `move`,
showing `why_here` as subtitle, `grammar` as a badge, the 2–3 frames with the `___` rendered as an
actual input the learner types into, and the `avoid` line beneath a divider labelled **Sounds canned**.
The negative exemplar is what inoculates against the phrase lists that cause band-6 plateaus.

`collocations` render as `chunk` + `cefr` badge, `example` on tap, `Add to bank` into the vocab SRS.
Chunks graduate with **use-in-sentence exercises only, never flip** — a chunk is not learned until it
has been used about the learner's own subject.

`error_watchlist` is shown **before** the attempt in practice mode as a two-item forewarning
("This chart will pull two errors out of you: …"), and **after** submission it re-orders which of the
evaluator's annotations get surfaced first. Never shown in exam mode or in the mock.

**Copy to clipboard only, never auto-insert.** The pedagogy is internalisation, not templating.

### F6 — One-fix-first report and targeted rewrite · impact very high · cost S

**Consumes:** `teaching.band_move`, `rewrite_focus`, `error_watchlist[0]`, `checklist`.

The report opens on a **single full-width card**: `rewrite_focus.focus` as a behaviour, `why` beneath
it, one verbatim quote of the learner's own sentence that shows it, and one button — **Try this now** —
which starts a targeted rewrite. Bands sit below. Annotations sit below that, collapsed behind
`Show all 12 notes`.

Over a third of feedback interventions in the literature make performance *worse*, and the mechanism is
attention dispersal (R4 §7.2). Thirty-odd feedback items on a 180-word letter is that failure mode
exactly. The evaluator keeps generating everything — it is a valuable archive and it drives the drill
queue — but the first screen shows one thing.

**Coded annotations by default (R4 §7.3 rule 4).** Spans render underlined with a short code badge
(`tense`, `article`, `partner`, `register`, `cohesion`) and **no fix visible**. Clicking opens an inline
input: *rewrite this span*. Only after the learner attempts the repair is the correction and
explanation revealed. Indirect coded feedback with self-repair is what carries into new writing; direct
correction is the copying condition. A `Show fixes` escape hatch exists, off by default.

The **targeted rewrite** screen opens with exactly two named goals — `rewrite_focus.focus` and
`error_watchlist[0].pattern` — a five-minute suggested timer, and the previous annotations collapsed.
On resubmit the delta strip leads with **goal completion and behaviour deltas** ("bullets extended
1→3", "register lapses 4→0") and shows the band delta second. Band deltas across a rewrite are noisy
and invite gaming.

`checklist` renders as the pre-submit modal's content — four to six prompt-specific lines, in order,
each tickable, none blocking.

### F7 — Register and sign-off pre-check · impact high · cost very low · `gt_task1` only

**Consumes:** `teaching.letter_brief.greeting`, `signoff`, `register`, `register_signals[]`.

Runs locally in the existing pre-check, **before a single token is spent**. Deterministic, no LLM:
detect the greeting form, detect the sign-off form, look the pair up in §3's table; count contractions,
exclamation marks and hits from a small register-marked word list. On a mismatch the pre-check modal
says exactly what and why — *"You opened 'Dear Sir or Madam' and closed 'Yours sincerely'. With no
name, the pairing is 'Yours faithfully.'"* — with **Fix it** (returns to the editor with the sign-off
selected) and **Submit anyway**. Never a block.

Cheapest high-value feature in the module: it catches the most avoidable loss in the task, it works
offline, and register lives inside Task Achievement so this is a task check, not a style check.

### F8 — The 60-minute Writing Mock · impact high · cost M

**Consumes:** nothing new. Deliberately consumes **no** teaching field — that is the point.

One session, **60 minutes, one clock, Task 1 then Task 2, one submit for both.** Task 1 is an
`ac_task1` or `gt_task1` prompt matching the learner's declared exam module; Task 2 is a `task2`
prompt. Both attempts are created with `mode: "exam"` and linked by a shared mock id.

**Both tasks are visible and switchable from minute zero, and allocation is free.** This overrides
R4 §11.3, which recommends hiding Task 2: the real paper hands the candidate both tasks and lets them
spend the hour however they like, and that freedom *is* the trap we are teaching. Hiding Task 2 would
remove the lesson and reduce fidelity at the same time.

**Exam conditions, enforced:**

| Condition | Enforcement |
|---|---|
| One clock | A single 60:00 countdown in the top bar. Per-task elapsed time is tracked silently and never shown during the mock |
| No auto-submit | At 0:00 the clock turns destructive and counts up; overtime is recorded on both attempts |
| No coaching, anywhere | The Coach, Language bank, Templates drawer, Overview Builder, `error_watchlist` forewarning, `plan.lines` ghost text and `structure_plan` are **not mounted** — not hidden behind a flag, absent from the tree, so there is nothing to reveal with a devtools toggle |
| No models | The Compare tab is locked for the duration and the model-answer endpoint is not reachable from the mock |
| No spellcheck | `spellcheck=false` on both editors |
| No regeneration | Prompts are fixed at mock creation; `POST /prompts/generate` is unreachable from this route |
| Planning allowed | The outline scratchpad stays — the real exam allows planning on paper. Ghost text does not |
| Paste | Recorded, never blocked (it is the learner's own tool). A single paste over 40 words sets `integrity_flag` |
| Pre-checks | Only the hard block (< 50 words, language sanity) runs. Warns are recorded and shown **after**, not as a modal that would coach mid-exam |
| Leaving | Navigating away requires an explicit **Abandon mock** confirmation; the clock does not pause |

**The report leads with time allocation, before any band.** Minutes spent on each task against the
20/40 target, and what that cost, stated plainly: a band 6 on Task 1 with a band 7.5 on Task 2 reports
as 7.0, while the reverse reports as 6.5, so time spent perfecting Task 1 is the worst trade available
(R3 §7.1). Then the two band sets, then the weighted figure.

**The weighted figure is labelled an estimate, always.** We compute
`round_ielts((T1 + 2 × T2) / 3)` using the existing shared rounding helper, and we label it
*"Estimated Writing band"* with a footnote saying the 1:2 weighting is consistently reported but is not
printed in the published descriptor document and the rounding order is unpublished (R3 §9.1). **The
mock is the only place in the app where a combined Writing band is shown.**

### F9 — Chart coverage report · impact high · cost S · `ac_task1` only

**Consumes:** `chart_spec` (structure), `overview_brief.must_report`, `omit`.

Because we store charts as structured data rather than images, we can compute exactly which series and
categories the response mentions, and say so: *"You never mentioned the walking-and-bus category."*
That omission is precisely what an official band-4 comment names, a human tutor finds it slowly, and an
image-based system cannot find it at all. Renders as a coverage grid — one cell per series × category,
shaded by whether the response referenced it — with `must_report` items flagged when missed and `omit`
items flagged when reported at length.

### Explicitly not built

Model answers shown before an attempt · a bank of "band 9 expressions" · a band-9 model · real-time
correction while writing · bands in drills or targeted rewrites · a combined Writing band anywhere
except the mock · a numeric under-length deduction table · any claim that a template, a linker or a
register slip carries a fixed penalty · auto-insertion of any authored phrase into the editor.

---

## 10. Authoring checklist — run this before you write the file

1. **Read every sentence of a prompt aloud as if you were the examiner.** If a description line hides
   its unit, if a letter situation leaves "who am I to this person?" unanswered, or if an essay
   statement is as broad as its theme, rewrite it. An under-specified letter has an unmarkable
   register; an over-broad essay statement can be answered from memory.
2. **Chart authors: write the two overview sentences first, then build the numbers so they are true and
   are the best two available.** Then name the two body groups. Only then fill in `chart_spec`. If you
   cannot name the groups, the data has no structure and the prompt is unusable.
3. **Letter authors: derive the register from the recipient, then pair the sign-off, then write the
   bullets.** Check the purpose × register matrix before you commit. Bullet 3 is the payload and must
   come last.
4. **Essay authors: apply the memorisation test to your own prompt before writing anything else.**
   Could a memorised essay on this theme answer it? If yes, narrow the situation statement.
5. Three model answers, bands 6/7/8, **the same content in all three**, every span copied out of its
   own text, every invented specific in a letter inside a swap slot.
6. Teaching notes must be **actionable this week**. "Improve your cohesion" is not a note. "Replace the
   second *Moreover* with a *this shift* reference back to the previous sentence" is.
7. Everything rankable. `band_move` is the one thing; `error_watchlist[0]` is the top error;
   `rewrite_focus.focus` is the one change. Somebody has to decide — that is you.
8. **Never fabricate a figure or a study**, in a model answer, in an `evidence` field or anywhere else.
   A specific unnumbered instance is stronger and cannot be caught sounding false.
9. **Vary your own wording across your 14 prompts.** Fourteen `language_bank.warning` strings built
   from one sentence, or fourteen identical `plan.test` lines, is a tell that this was generated rather
   than authored. Lint 10 catches the crude version; you must catch the rest.
10. **Copyright self-check on every sentence before you commit it.** Did I read this somewhere? If
    there is any doubt, throw it away and write a different one on the same subject.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University
Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of them. No exam
material is reproduced in this document or in `TEMPLATE.json`; all prompts, datasets, letters, model
answers and example wording are original text authored for BandReady.*
