# R-D1 — Teaching-grade reading content: schema, clusters, features

**Status:** the authoring contract. Six authoring agents (R-A1–R-A6), one verify/merge agent and the
feature agents build to this document. Where this document and a research briefing disagree, **this
document wins** — it has already reconciled them, and §0.5 lists every place it overrode research or
the task brief.

**Companion artefact:** [`TEMPLATE.json`](TEMPLATE.json) — one complete Academic passage, 14
questions, three groups, full teaching payload. Read it before you write anything. It is the ceiling
and the floor.

**Inputs:** `staging-reading/research/01-question-types.md` (R1), `02-general-training.md` (R2),
`03-strategy-and-bands.md` (R3), `04-pedagogy-and-items.md` (R4). Section references are to those
files. The speaking contract `staging/DESIGN.md` and the writing contract `staging-writing/DESIGN.md`
are the quality bar; where a shape already exists there we reuse it so the UI can be shared.

---

## 0. What we are building and why

The pack ships **6 Academic passages, 2 tests, 80 questions, zero General Training content and zero
teaching payload.** Every question carries `explanation` and sometimes `trap_note`; nothing else. The
UI is already good — browser, split player, an input for every answer form, review, results,
dictionary popover, drill pane — and it has nothing to teach with.

This push adds **10 new tests (30 passage rows, 400 questions) plus 3 standalone drill passages
(~40 questions)**, retrofits the teaching payload onto the **6 existing passages**, and takes the
bank to **12 tests · 39 passage rows · ~520 questions · both formats**. Every new and retrofitted
question carries a teaching payload so the app can do nine things it cannot do today:

1. show, for a wrong answer, the exact span of text that decides it — and highlight it in the passage
   pane, because the span is stored as a verbatim substring;
2. spell out the **paraphrase link**: which phrase in the question corresponds to which phrase in the
   text, and by which named transformation. Reading *is* paraphrase recognition (R3 §4, R4 thesis 2);
3. name, for every wrong option, why a good reader would be tempted by it — the marks are lost
   between two plausible options, so an explanation that only justifies the key teaches nothing;
4. label every error with a **trap slug** from one closed taxonomy, so a learner's history becomes a
   diagnosis ("5 of your 7 TFNG errors were phantom contradictions") rather than a percentage;
5. force the learner to locate the evidence and name the trap **before** the solution is revealed —
   the one design decision the error-log research says separates a log from a lesson (R4 §1.1);
6. hand each question group the strategy for *that type on this passage*, including whether its
   answers run in passage order, which is the single most useful strategic fact per type (R1 §3);
7. run the two-minute paragraph map as a coached procedure, with the authored map to compare against;
8. mine vocabulary the way reading actually needs it — as paraphrase *families* and a closed hinge
   set of quantifiers and hedges, not topic word lists (R3 §8.3);
9. sit a **60-minute mock** — 3 passages, 40 questions, one clock, no transfer time, no coaching —
   under conditions enforced in the sidecar, not in the renderer.

Every field below exists to serve one of those nine. A field serving none of them was cut.

### 0.1 Reading teaches differently — the shape of the payload

Speaking and Writing teach through band-graded model answers because the learner produces language.
Reading is receptive: the learner produces a string that either matches a key or does not. **There is
no model answer in this module and there must never be a field pretending to be one.**

The reading equivalent of the band-6/7/8 ladder is the pair **worked solution + distractor autopsy**.
It shows the learner the point of *right* and the whole space of *wrong*, which is where the marks
are. Five obligatory parts, from R4 §2.2, all lint-enforced:

| # | Part | Field | Why it is obligatory |
|---|---|---|---|
| 1 | **Location** | `anchor_paragraphs` + `evidence_quote` | Distinguishes "I never found it" from "I found it and misread it" — two different diagnoses with two different remedies (R4 §1.2) |
| 2 | **Paraphrase link** | `teaching.paraphrase_link` | The learner sees *that* it was the answer, not *why* it counted as the answer. Highest-value field in the payload |
| 3 | **Decision rule** | `teaching.decision_rule` | Why this reading is forced and no other is available, in the vocabulary of the type |
| 4 | **Distractor autopsy** | `teaching.distractors[]` with compulsory `why_tempting` | The marks are lost in the distractors, so the explanation must go where the marks go |
| 5 | **Reusable rule** | `teaching.reusable_rule` | Otherwise the learner learns one item instead of one behaviour |

Plus the classification field `teaching.traps[]`, which is what makes the review screen a diagnosis.

### 0.2 Copyright — non-negotiable, read it twice

- The exam **format, timing, question types, instruction-line patterns, answer-format rules, the
  raw-score-to-band tables and the topic areas that recur** are facts about a public test, published
  by the test owners for candidates. Use them freely.
- **Every passage, every text block, every question, every option, every heading, every explanation
  and every teaching note is authored by you from scratch.** Never transcribe from a past paper, a
  Cambridge volume, a practice site, a prediction list, a coaching PDF or a YouTube transcript.
  R1 §0.1 names six passages the researcher read; those subjects are on the do-not-write list.
- Band descriptors are copyrighted prose. The criteria are facts. R3 §9's band-6-vs-band-8 behaviour
  table is already a clean-room original — reuse its wording, never a descriptor's.
- **Self-check on every sentence before you commit it:** did I read this sentence somewhere? If there
  is any doubt at all, throw it away and write a different one on the same subject.
- Invent every proper noun. Keep the house convention already in the pack (Verdon, Norland, Ashfield,
  Sandmouth, Marlow, Brackenfield) so the bank reads as one world. No real organisations, no real
  published statistics, no real named researchers. A named researcher in a matching-features group is
  an invented person with an invented finding.
- Product copy says **"IELTS-style"** and carries the non-affiliation notice.

**Three claims in circulation that must not appear anywhere in our content or copy** (R3 §11.5):
a "57% faster completion for successful test-takers" figure attributed to the eye-tracking research;
a "22% TFNG improvement over six weeks" figure attributed to a 2022 ELT article (it looks fabricated
and has no traceable citation); and any per-type frequency claim ("matching headings appears in 80%
of tests" — no published frequency data exists, R1 §11.3). Safe learner-facing phrasing for
frequency: *"appears in most papers"*, *"less common"*, *"nearly always present"*.

### 0.3 Hard compatibility constraints (violating these breaks the running app)

Verified 2026-07-27 against `sidecar/bandready/content/validate.py`,
`sidecar/bandready/content/loader.py`, `sidecar/bandready/scoring/answers.py`,
`sidecar/bandready/server/routes/reading.py` and `app/src/features/reading/`.

| Constraint | Why |
|---|---|
| `ReadingPassageRow` keys are exactly `id, format, title, topic_id, word_count, band_target, passage_json` | `validate.py:180`. `_Row` is `extra="allow"` so an extra key validates — but `TABLE_COLUMNS["reading_passages"]` (`loader.py:157`) copies only these seven plus `validation_report_json`, so **any extra top-level key is silently dropped at import**. Never put teaching data on the row |
| **All teaching data lives inside `passage_json`** | `passage_json` is a whole-blob JSON column. Anything inside it survives the loader, the DB and the API unchanged. **This is why reading needs no migration where writing needed five code changes** |
| `format` ∈ `{academic, general_training}` | `ReadingPassageRow._format` |
| `ReadingTestRow` keys are exactly `id, format, title, p1_id, p2_id, p3_id` | `validate.py:197` + `loader.py:162`. **A test row cannot carry a payload.** See §4 — per-test teaching is derived, not authored |
| Every question needs an integer `number` and a non-empty `answers[]` | `validate_relations`, `validate.py:468–479`. Duplicate numbers **within a row** fail the pack |
| Question numbers run **1–40 contiguously across a test**, not per passage | Not enforced by the validator (it only checks within a row) — this is a merge-gate lint, §9.4 lint 12 |
| Paragraph ids must be **unique across the whole row** and **a single character** | `PassagePane.tsx:129` builds one flat `Map` over every block's paragraphs; `PassagePane.tsx:308` prints the id in a ~28 px gutter as the learner-visible letter. Duplicate ids silently send notes, highlights and "locate the evidence" to the wrong text |
| `question_groups[]` is flat — all groups for all text blocks live in one array | `iter_reading_questions`, `validate.py:523` |
| Never hand-type an instruction line | `instruction_for(word_limit)` renders it server-side (`reading.py:210`). Set `word_limit`, never `instructions` |
| Spelling variants are **not** inferred at match time | `answers.py:512–541`. Every accepted spelling, number format and singular/plural must be authored explicitly into `answers[]` |
| Letter-answer types compare **upper-cased letter sets**, order-insensitive | `answers.py:639` |
| Row ids unique across the whole file | `validate_rows` rejects a duplicate and the pack fails **whole** |

`passage_json.schema_version` goes from `1` to `2` on every row carrying a teaching payload — new and
retrofitted alike. Consumers must treat every teaching field as **absent-by-default**.

### 0.4 THE DELIVERY BLOCKERS — read before writing a single row

Content ships with no migration. But three code facts stand between the content and the learner, and
two of them are **security holes in the mock**, not conveniences. **Content agents do not make these
changes.** Author as specified and report the dependency.

**D1 — `?mode=review` hands over the entire key with no attempt check. The mock is defeatable
today.**
`reading.py:415–433`: `get_test` and `get_passage` both end
`return payload if mode == "review" else _payload_without_key(payload)`. Nothing checks that the
caller has an attempt, let alone a submitted one. Any client — including the running renderer during
an exam-conditions mock — can fetch the answers, explanations and evidence quotes for the test it is
sitting. Required fix:

```
GET /tests/{id}?mode=review    → 403 unless the current profile has a SUBMITTED attempt on this test
GET /passages/{id}?mode=review → 403 unless the current profile has a SUBMITTED attempt on this passage
```

This is the attempt gate, and it must live in the sidecar. Everything in §10 F1 depends on it.

**D2 — `_SECRET_FIELDS` does not know about the teaching payload.**
`reading.py:220`: `_SECRET_FIELDS = ("answers", "explanation", "trap_note", "evidence_quote")`, and
`_strip_key` pops those four **from questions only**. Our per-question teaching object contains the
decision rule and the distractor autopsy; our group and passage objects contain the strategy, the
skim plan and the vocabulary. All of it would be served, in full, inside an in-progress mock.

This is why **every teaching field in this document lives under one key named `teaching`**, at each
of the three levels. The fix is small and total:

```python
_SECRET_FIELDS = ("answers", "explanation", "trap_note", "evidence_quote", "teaching")

def _strip_key(doc):
    out = copy.deepcopy(doc)
    out.pop("teaching", None)                       # passage-level coaching
    for group in out.get("question_groups") or []:
        group.pop("teaching", None)                 # per-type strategy
        for question in group.get("questions") or []:
            for field in _SECRET_FIELDS:
                question.pop(field, None)
    return out
```

Coaching is then **absent from the response body** during a mock, not hidden behind a renderer flag.
That is the enforcement standard the writing mock already sets (`staging-writing/DESIGN.md` §9 F8)
and reading must match it.

**D3 — the drill payload cannot reach the teaching fields.**
`reading_questions` (`db/models.py:315`) is a flat projection carrying only `evidence_quote`,
`explanation`, `trap_note`. `_drill_payload` (`reading.py:482`) already re-reads the full passage doc
to recover `prompt` and `options`, so it can recover `teaching` the same way with **no migration** —
it simply does not project it today. Add `"teaching": question.get("teaching")` to the item dict, and
strip it until the item has been answered.

Trap-filtered drills (§10 F4) are the one thing that *does* want a column: `_drill_items`
(`reading.py:459`) selects on `qtype` alone. Either add `trap_codes_json TEXT` to `reading_questions`
and derive it in `loader.derive_reading_questions`, or scan the docs in Python. **Recommended:** the
column, because trap drills are the diagnostic spine of the module.

**D4 — `diagram_labelling` has no asset pipeline.** `QuestionLayout.image` is a string
(`types.ts:57`) and there is no convention for where a diagram lives in a pack or how the manifest
checksums it. §7.4 specifies the convention; **R-A5 must confirm it has landed before authoring any
`diagram_labelling` group**, and substitutes per §7.4's fallback if it has not.

**D5 — flow-chart layout is a flat `steps[]`.** `types.ts:52` has `steps?: string[]`, so a branching
flow-chart (the shape official samples actually use, R1 §6.5) cannot be expressed. §7.2 specifies the
additive extension. Until it lands, **author linear chains only.**

**Non-blocking defects reported, not fixed here:** `generate_reading.check_passage()` hard-codes
Academic bounds (780–900 words, 6–8 paragraphs) and will reject valid GT Section 1 and 2 documents
(R2 §11.1); `GT_TYPE_POOL` omits `flow_chart_completion` and `table_completion` (R2 §11.3);
`GET /passages` has no `gt_section` filter (R2 §11.6); `validate_relations` does not check paragraph-id
uniqueness (R2 §11.7); `docs/plan/06-reading-module.md:14` under-specifies GT text length so badly
that a GT paper would floor at ~1,020 words against an official 2,150 minimum (R2 §11.8); the
implemented band tables collapse everything below raw 4 to band 2.0 where the published table gives
1.0 (R3 §2.4).

### 0.5 Where this document overrides the research or the task brief

| # | Source said | This document says | Why |
|---|---|---|---|
| 1 | Three trap taxonomies: R1 §§7.4/10 (~47 slugs), R3 §6.1 (T1–T14), R4 §2.3 (17 codes) | **One closed 26-slug enum, §5.1**, with a mapping column from all three | Three vocabularies means the content, the review picker, the drill filter and the LLM prompt cannot aggregate. One enum or none |
| 2 | R3 recommends `paraphrase_devices`, R4 recommends `transformation` | **One field, `paraphrase_link.devices[]`, on R3's D-set extended to 14**, §5.2 | Same reason. R3's set is the superset and it carries the crucial meaning-preserving vs meaning-changing split |
| 3 | Task brief: "PER TEST: the raw-to-band table and a pacing plan" | **Derived, never authored** — §4 | `ReadingTestRow` has no payload column and `TABLE_COLUMNS` drops extra keys. Band table is a pure function of `format`; the pacing plan is the three passages' authored `time_budget_min` plus a fixed reserve. Authoring it would be data that never reaches the app |
| 4 | R1 §3 proposes group-level `answer_order` chosen by the author | **`answer_order` is fixed per type by the table in §5.4 and lint-checked** | It is a property of the question type, published by the test owner. An author who "chooses" it is authoring a wrong strategy card |
| 5 | R1 §11.1: summary/note/table/flow-chart answers "not necessarily in order" (official) vs "usually in order" (coaching) | We author **in order within the group**, tag the group `section_local`, and teach the honest line in §5.4 | Both sources are right about different things. The officially-guaranteed fact — one section, not the whole text — is the useful one |
| 6 | R2 §8.2 calls letter-identifies-a-text "the biggest GT-specific engineering item" | **No engineering needed: one advertisement = one paragraph = one letter**, §6.3 | The letter the learner sees *is* the paragraph id. Making each lettered item exactly one paragraph makes text-letters and paragraph-letters the same token |
| 7 | R1 §6.6 recommends a library of original SVG diagrams | Kept, but **scoped to one agent, three diagrams, with a stated fallback** — §7.4 | It is the only genuinely blocked type; it must not hold up 500 questions |
| 8 | R4 §12.2 sets band-8 AWL at 10–12%; the plan's generator default is 12% | **Hold AWL at 9–11% at every band and raise difficulty through density, abstraction, implicit cohesion and argument structure** | Authentic academic prose is ~10%. Past that the items start turning on vocabulary and we are no longer testing reading |
| 9 | R4 §6.2 caps vocabulary mining at 5 items per passage | The cap is a **UI** rule; authored `mineable[]` is **5–8**, each naming the question it could block | The cap governs what the learner is offered, not what the author supplies |
| 10 | Plan §6.1's why-wrong prompt names six inline trap labels | Replace with the §5.1 enum, passed to the LLM as a constrained vocabulary | The LLM's labels and the content's labels must be the same strings or the trap profile is noise |

---

## 1. The per-question `teaching` object

Lives at `passage_json.question_groups[].questions[].teaching`. Fields marked **REQ** are
lint-enforced. Limits are in **words** unless stated. Everything is JSON-serialisable.

```jsonc
"teaching": {
  "schema_version": 1,                         // REQ — always 1
  "paraphrase_link": { … },                    // REQ except pure NOT GIVEN — §1.1
  "decision_rule": "<≤40 words>",              // REQ — §1.2
  "distractors": [ … ],                        // REQ — §1.3
  "reusable_rule": "<≤25 words>",              // REQ — §1.4
  "traps": ["<slug>"],                         // REQ (may be []) — §5.1
  "nearest_text": "<verbatim substring>",      // REQ iff the key is NOT GIVEN; forbidden otherwise
  "grammar_cue": "<≤18 words>",                // REQ for completion + short_answer types
  "gear": "skim"|"scan"|"search"|"close"       // REQ — §5.5
}
```

The six existing question fields are unchanged and all six stay **REQ** on every question:
`answers[]`, `anchor_paragraphs[]`, `evidence_quote`, `explanation`, `difficulty`, `band_target`.
`trap_note` stays and becomes the one-line human rendering of `teaching.traps[0]` (or `null` when
`traps` is empty) — nothing downstream breaks.

`difficulty` and `band_target` on a question are **item** difficulty, not text difficulty (R4 §12.3).
A band-8 passage carries band-5.5 items and vice versa; a well-built passage set spans roughly band
5.5 to band 8 in item difficulty regardless of the passage's own level, because that is what
discriminates. `difficulty` ∈ `easy | medium | hard`; `band_target` ∈ 5.0–8.5 in half steps.

### 1.1 `paraphrase_link` — the highest-value field in the module

```jsonc
"paraphrase_link": {
  "stem_phrase": "<EXACT substring of this question's prompt (or of the chosen option's text)>",
  "text_phrase": "<EXACT substring of the anchor paragraph>",
  "devices": ["synonym", "nominalisation"],     // 1–3, from the §5.2 enum
  "note": "<≤20 words — what the transformation did, in the learner's terms>"
}
```

**Both phrases are lint-checked as exact substrings.** `stem_phrase` must occur in `prompt`, or — for
letter-answer types where the proposition lives in the option — in the keyed option's `text`.
`text_phrase` must occur in the text of one of this question's `anchor_paragraphs`.

This is the field the Paraphrase Gym (F5) is built from, at zero marginal content cost, and it is
what turns "the answer is in paragraph C" into a teachable move. Rules:

- The two phrases must be the **corresponding** pair, not the whole sentence. 2–9 words each.
- `devices` names what actually changed. Do not list `synonym` on a pair that shares its content word.
- **A TRUE/YES key may not list `scope_change` or `modality_change`.** Those two devices are
  meaning-*changing*; if one is genuinely present, the key is FALSE/NO, not TRUE/YES (R3 §4.1).
  Lint-enforced, and it catches a whole class of authoring error.
- A **pure NOT GIVEN** item has no paraphrase link, because there is nothing in the text to link to.
  Omit the field and supply `nearest_text` instead. Where a NOT GIVEN statement *does* have a partly
  matching phrase worth naming, supply both — that is usually the most instructive case, because the
  link is real and the consequence is not.

### 1.2 `decision_rule`

≤ 40 words, written in the vocabulary of the type. Why this reading is forced and no other is
available. For TFNG/YNNG it must name **which of the three conditions is met and why the other two
are not** — that is the whole type. For matching headings it names the paragraph's controlling idea
as distinct from what the paragraph merely mentions. For completion it names the constraint that
fixes the answer's form.

"Because the text says so" is circular and fails review. So does restating `explanation`.
`explanation` says *what the text says*; `decision_rule` says *why that settles it*.

### 1.3 `distractors[]` — the reading equivalent of the model answer

```jsonc
[ { "key": "iii",                              // REQ — the option letter/numeral, or the wrong choice
    "why_tempting": "<≤25 words>",             // REQ — a real candidate process, never "it is wrong"
    "why_wrong":    "<≤25 words>",             // REQ
    "diagnosis":    "<code>" } ]               // REQ — from the §5.3 enum
```

Coverage requirement per type — lint-enforced:

| Type family | `distractors[]` must cover |
|---|---|
| `true_false_not_given`, `yes_no_not_given` | **both** non-keyed choices — exactly 2 entries |
| `multiple_choice` | **every** wrong option — exactly 3 (or 4 on an A–E stem) |
| `multiple_choice_multi`, `list_selection` | every unselected option — at least 3 |
| `matching_headings` | **≥2 entries per question**, and — across the group as a whole — **every unused heading must be covered at least once**. Cover a *used* heading too whenever a plausible misreading would put it here |
| `matching_features`, `matching_sentence_endings` | every unused option, minimum 2 |
| `matching_information` | the 1–2 paragraphs a careless scanner lands in. Minimum 1 |
| `summary_completion_bank` | handled at group level by `bank_analysis[]` (§2.2); per question, the 1–2 bank words that fit the gap's meaning but not its grammar. Minimum 1 |
| completion + `short_answer` (free text) | the 1–2 wrong spans the passage actually offers — the span from the neighbouring sentence, the over-limit span, the paraphrase the learner would invent. Minimum 1. `key` is the wrong string itself |

**`why_tempting` is compulsory and must describe a real candidate process** (R4 §9.4: item writers'
theories about their own items diverge from what candidates actually do). "A learner who has already
placed heading v on paragraph C has nothing left that mentions cost" is a process. "It is plausible"
is not, and fails review.

### 1.4 `reusable_rule`

≤ 25 words, **and it must not mention this passage's content**. Lint: no proper noun from the passage
and no content word that appears in `evidence_quote`. It is the sentence the learner carries to a
different passage, and it is what the explain-back check (F16 in R4) compares against.

Good: *"A passive with no 'by' phrase names no agent — any statement that names one is unverifiable."*
Bad: *"Remember that the pallet standard was a compromise."*

### 1.5 `grammar_cue` — completion types only

≤ 18 words, naming **the word in the gapped line that fixes the answer's number and word class**.
"`many` before the gap forces the plural"; "the gap follows `without`, so the answer is an `-ing`
form". R1 §2.3: if both the singular and the plural would read grammatically, the item is ambiguous
and must be rewritten, not annotated.

### 1.6 The completion-answer rule that governs authoring, not just teaching

Completion, short-answer and diagram answers are **verbatim contiguous spans of the passage** (R1
§2.2, official). Three consequences, all lintable and all non-negotiable:

1. **Every keyed answer for a `TEXT_TYPES` question must be a case-insensitive substring of the text
   of one of its `anchor_paragraphs`, in exactly the form keyed.** §9.4 lint 21.
2. **Every keyed answer must pass `within_word_limit` against its own group's `word_limit`.**
   §9.4 lint 22. Never key a variant you would not accept on paper.
3. **Do not key leniency the real exam does not grant.** The existing bank keys
   `{"value": "generation", "note": "singular accepted"}` where the passage says `generations`; that
   is a scorer kindness, not a marking rule, and displaying it as an accepted answer teaches a wrong
   habit. **New content keys the passage's form only.** Key genuine alternatives — an authored US/UK
   pair, an unpunctuated number, a parenthesised optional word — and nothing else. §9.4 lint 23.

Number and date formats in General Training are the one place to be generous, because the text
genuinely supports several written forms (R2 §9.7): key `"£25"`, `"25"` and `"25 pounds"` where the
text supports them; `"9.30"`, `"9:30"` and `"9.30am"`; `"14 March"` and `"March 14"`. Decimal points
and clock colons survive normalisation, so each is a distinct key and each must be authored.

---

## 2. The per-group `teaching` object

Lives at `passage_json.question_groups[].teaching`.

```jsonc
"teaching": {
  "schema_version": 1,                     // REQ
  "answer_order": "sequential",            // REQ — FIXED by type, §5.4. Not an authorial choice
  "section_scope": ["E", "F"],             // REQ iff answer_order == "section_local"; else null
  "strategy": "<25–45 words>",             // REQ — this type, on THIS passage
  "order_note": "<≤22 words>",             // REQ — what the order behaviour buys the learner here
  "time_budget_s": 350,                    // REQ — whole group, §5.4
  "watch_out": "<≤25 words>",              // REQ — the loss this group is built to provoke
  "bank_analysis": [ … ]                   // REQ iff type == summary_completion_bank; §2.2
}
```

### 2.1 `strategy` and `order_note`

`strategy` is the attack plan for this type **instantiated for this passage** — not the generic
per-type page (which is static app copy, §10 F3, written once from R1 §§4–7 and R4 §5.3). It names
what to do first with *these* paragraphs.

- Generic, and therefore useless: *"Read each paragraph and match the best heading."*
- Instantiated, and therefore teaching: *"Three of these paragraphs open with a concession, so the
  first sentence is not the point. Say each paragraph's job in six words before you look at the list,
  and place D and E first — they are the two you will be certain of."*

`order_note` states the consequence of `answer_order` **for this group**, in the imperative. For a
sequential group: *"Q9's answer is below Q8's — search that band, not the passage."* For a scattered
group: *"Do this last: by then you have read every paragraph for another group."* For a section-local
group: *"Everything is in E–F. Locate the section once, then work inside it."*

### 2.2 `bank_analysis[]` — summary completion with a word bank

The one exception to the verbatim rule: bank words are the item writer's synonyms, not the passage's
wording (R1 §2.2). That is why the type is harder than it looks and why it needs its own field.

```jsonc
[ { "key": "F",                            // REQ — an UNUSED bank option
    "designed_to_tempt": <int>,            // REQ — the question number it was built to attract
    "why_wrong": "<≤22 words>" } ]         // REQ
```

One entry per **unused** bank option, and there must be at least two unused options. Every entry must
name a gap; a bank word designed to tempt nobody is padding and should be cut from the bank.

---

## 3. The per-passage `teaching` object

Lives at `passage_json.teaching`.

```jsonc
"teaching": {
  "schema_version": 1,                     // REQ
  "time_budget_min": 16,                   // REQ — §4
  "difficulty_rationale": { … },           // REQ — §3.1
  "skim_plan": { … },                      // REQ — §3.2
  "paraphrase_families": [ … ],            // REQ — 4–6, §3.3
  "hinge_words": [ … ],                    // REQ — 3–5, §3.3
  "mineable": [ … ],                       // REQ — 5–8, §3.4
  "metrics": { … }                         // REQ — §3.5
}
```

### 3.1 `difficulty_rationale`

```jsonc
{ "levers": ["density", "abstraction"],    // REQ — 2–3 from the §5.6 enum, ordered by contribution
  "note": "<≤35 words>",                   // REQ — why this text sits at its band_target
  "hardest_paragraph": "E",                // REQ — a paragraph id on this row
  "why_hardest": "<≤25 words>" }           // REQ
```

Difficulty is a property of the levers in R4 §12.1, ranked: propositional density, abstraction,
cohesion explicitness, lexical sophistication, syntactic complexity, rhetorical structure. **Mean
sentence length is a guardrail, not a dial** — it is a weak predictor above CEFR A-level. If your
`levers` are `["sentence_length"]` you have not made the text harder, only longer.

### 3.2 `skim_plan` — two shapes, and the GT one is different

```jsonc
{ "kind": "paragraph_map" | "field_scan",  // REQ
  "read_first": "<≤25 words>",             // REQ
  "skip": "<≤25 words>",                   // REQ — what NOT to read, named concretely
  "budget_s": 120,                         // REQ — 90–150 for paragraph_map, 45–75 for field_scan
  "map": [ { "paragraph": "A", "label": "<≤5 words>" } ],   // REQ iff paragraph_map — one per paragraph
  "fields": [ "<≤6 words>" ] }             // REQ iff field_scan — 4–7 entries
```

**`paragraph_map`** is R3 §5.3's two-minute map: read the title and the whole first paragraph, then
the first and last sentence of each remaining paragraph, and write two to four words per paragraph.
`map[].label` is the worked example — a *label*, not a summary: `cost objections`, `1890s expansion`,
`critics`. It is revealed only after the learner has written their own (F6). Required for every
Academic passage and every GT Section 3.

**`field_scan`** is the GT Section 1–2 replacement. R3 §5.3 is explicit: **do not teach the paragraph
map for GT Sections 1–2.** Those texts have visible structure and their marks are lost to answer-form
errors, not to location errors. `fields[]` names the field types this text is dense in and that the
questions will turn on: `dates and deadlines`, `price tiers`, `who is eligible`, `what is excluded`,
`must vs is advised to`, `how to apply`. Required for every GT Section 1 and Section 2 row.

### 3.3 `paraphrase_families` and `hinge_words` — reading's vocabulary, not topic lists

R3 §8.3 ranks vocabulary work by return. Paraphrase families are first; the closed hinge set is
second; topic word lists are last, because the exam never tests word meaning in isolation.

```jsonc
"paraphrase_families": [
  { "concept": "<≤4 words>",                       // REQ
    "passage_form": "<EXACT substring of a paragraph>",   // REQ
    "paragraph": "C",                              // REQ
    "rewordings": ["…", "…", "…", "…"],            // REQ — 4–6, exam-realistic, NONE in the passage
    "cefr": "B2" | "C1" }                          // REQ
]
```

4–6 families per passage. `passage_form` is substring-checked. **No `rewordings` entry may itself
appear in the passage** — the point is the words the item writer would use *instead*, and a reworder
that is already in the text teaches nothing. Lint 27.

```jsonc
"hinge_words": [
  { "word": "largely",                             // REQ — must occur in the passage
    "kind": "quantifier"|"frequency"|"modal"|"hedging_verb"|"comparative"|"connective",  // REQ
    "why_here": "<≤18 words — which question this word decides>" }                       // REQ
]
```

3–5 per passage, drawn from the ~200-item closed class in R3 §6.2 that decides most TFNG items.
`why_here` must name a question number. These are the words a learner reads over because they are
grammatical and unstressed, and they are worth more marks than two thousand topic nouns.

### 3.4 `mineable` — constrained vocabulary mining

```jsonc
[ { "item": "<≤4 words — a chunk, not a bare headword where a chunk exists>",   // REQ
    "paragraph": "D",                              // REQ
    "cefr": "B2" | "C1",                           // REQ
    "meaning": "<≤12 words, learner-facing>",      // REQ
    "blocks_q": <int> } ]                          // REQ — the question this word could cost you
```

5–8 items. **`blocks_q` is the whole discipline** (R4 §6.2): a word you did not know and did not need
is not worth a card. Every entry must name a real question number on this row whose evidence span or
whose decision turns on the item. At most 2 entries may be single words; the rest carry their
partners and their prepositions, because item writers paraphrase *chunks*.

### 3.5 `metrics` — difficulty as a measured property

```jsonc
{ "awl_pct": 9.4,                    // REQ — 5–7 at band 6, 8–11 at band 7, 9–11 at band 8 (§0.5 #8)
  "mean_sentence_length": 19,        // REQ — guardrail: 15–18 / 18–21 / 20–24 by band
  "longest_sentence": 34,            // REQ — cap 32 / 38 / 45 by band
  "unknown_token_pct": 1.2,          // REQ — HARD CAP 2.0 at every band
  "attributed_opinions": 2,          // REQ — 0–1 / 2–3 / 3–4 by band. ≥2 is required for a YNNG group
  "quantified_comparisons": 3,       // REQ — 2–3 / 3–4 / 4–5 by band
  "abstraction": "concrete"|"process"|"contested" }   // REQ
```

Authors compute these honestly; the verify agent spot-checks. Two rules carry real weight:

- **`unknown_token_pct` ≤ 2.0 is a hard rule at every band**, from the 98% coverage threshold, with a
  corollary: **no keyed answer may depend on an off-list word whose meaning is not recoverable from
  its own sentence.** Otherwise we are testing vocabulary and calling it reading (R4 §12.2).
- **`attributed_opinions` ≥ 2 is a precondition for authoring a `yes_no_not_given` group.** YNNG is
  about the writer's stance; on neutral reportage the items are unfair by construction (R1 §7.5
  rule 6). The passage design decides the question type, not the other way round.

---

## 4. Per-test: derived, never authored

`ReadingTestRow` has six columns and no payload, and `TABLE_COLUMNS["reading_tests"]` drops anything
else. Authoring a test-level teaching object would produce data that validates, merges, checksums
cleanly and is thrown away at import — exactly the failure `staging-writing/DESIGN.md` §0.3
documents. So the per-test layer is **computed from `format` plus the three passages**.

### 4.1 The band table

A pure function of `test.format`, already implemented as `ACADEMIC_BAND_TABLE` / `GT_BAND_TABLE` in
`reading.py:56/75` and consumed by `raw_to_band(raw, fmt)`. **Both tables are correct — verified
against three independent published tables (R2 §5.2) and against the four official anchor thresholds
(R3 §2.3). Do not "fix" them.** One known divergence to record and not repeat as fact: the official
indicative GT band-7 anchor is 35 marks, our table grants band 7 at 34. That is inside the
version-to-version tolerance ielts.org states; keep 34, keep `BAND_DISCLAIMER`.

The teachable facts, which belong in the Reading coach and the results screen:

- **Seven marks separate band 6.0 from band 7.0 on Academic** (23–26 → 30–32). That is roughly one bad
  TFNG group, and it is the most motivating single number available (R1 §1.5).
- **30/40 is band 7.0 on Academic and band 6.0 on General Training.** The same raw score, a full band
  apart. Band 6 on GT means dropping no more than 10 of 40, and since Sections 1–2 supply 27 of the
  marks and are the easy ones, near-full accuracy on Q1–27 is the band-6 lever (R2 §5.2).
- **The middle of the Academic table is crowded and the top is a cliff.** 23→26 is all band 6.0, so a
  learner gains three questions and sees nothing move. **Show raw score as the primary metric and band
  as secondary** (R3 §2.5) — and label the band from a single-passage attempt loudly as an estimate,
  because `scaled_raw()` projects 13 questions onto 40 and one extra correct answer moves the
  projection by three.

### 4.2 The pacing plan

A constant per format, and the only authored input is each passage's `teaching.time_budget_min`.
Recommended location: a `READING_PACING` dict beside the band tables.

| | Academic | General Training |
|---|---|---|
| Passage / Section 1 | **16 min** | **15 min** (Section 1 — short texts, cheapest marks, highest carelessness risk) |
| Passage / Section 2 | **20 min** | **18 min** |
| Passage / Section 3 | **22 min** | **25 min** |
| Reserve | **2 min** | **2 min** |
| Checkpoints (elapsed) | 16:00 → start P2 · 36:00 → start P3 | 15:00 → start S2 · 33:00 → start S3 |
| Sweep begins | 58:00 | 58:00 |

**Lint:** the three passages of a test must carry exactly these `time_budget_min` values for their
format and position (§9.4 lint 13). The budgets are front-loaded, not flat, because every passage
carries roughly the same marks at very different cost per mark; spending equal time on unequal costs
leaves the expensive marks underfunded (R3 §3.2).

Three operational facts that ride with the pacing plan and belong in the mock briefing:

- **60 minutes, and the transfer happens inside it.** Unlike Listening, Reading gives no extra
  transfer time — the most under-taught operational fact in the paper (R3 §1). Our player is
  computer-delivered, which eliminates that class of error entirely, so we must teach it explicitly
  for users who will sit the paper test.
- **The two-minute rule.** No single question gets more than two minutes: enter your best guess, flag
  it, move on. A flagged guess is a mark you might get; a blank after four minutes is a mark you
  definitely did not get plus three lost minutes.
- **Never leave a blank.** No negative marking, no partial credit, 1 mark per question whatever the
  type. At 58:00 stop answering and sweep the palette.
---

## 5. The closed enums

Every enum here is **closed**. Slugs are stable identifiers used simultaneously as a content field, a
review picker, a progress axis, a drill filter and the constrained vocabulary for the "why was I
wrong" LLM call. **Never rename one after content ships.**

### 5.1 `teaching.traps[]` — the trap taxonomy, 26 slugs

One taxonomy, reconciled from R1 §§7.4/10, R3 §6.1 and R4 §2.3. The mapping column exists so nobody
re-derives it. Author **0–2 slugs** per question, most-decisive first. `[]` is legal and correct: not
every item is a trap, and pretending otherwise trains paranoia (R3 §10).

**Family J — judgement (TFNG / YNNG, and the MCQ items that turn on the same thing)**

| Slug | Name | What happened | R1 / R3 / R4 |
|---|---|---|---|
| `absence_read_as_contradiction` | Phantom contradiction | Key is NOT GIVEN, learner wrote FALSE. The passage is silent and the silence felt like a denial. **The single commonest error in the paper** | same / T1 / same |
| `contradiction_read_as_absence` | Missed contradiction | Key is FALSE, learner wrote NOT GIVEN. The contradiction is there, carried by one word or by the next sentence. A searching failure, not a reasoning failure | same / T2 / same |
| `causal_link_assumed` | Two facts, one invented link | The text states X and states Y and never states that X caused Y. The richest genuine NOT GIVEN | `unstated_causation` / T10 / same |
| `plausible_inference` | Reasonable inference | It follows plausibly and is not stated. If a step of reasoning is needed, it is NOT GIVEN | same / — / — |
| `comparison_invented` | Invented comparison | Facts about A and about B given separately; the statement ranks them. NOT GIVEN however easy the arithmetic | `comparative_invention` / T7 / — |
| `comparison_reversed` | Comparison flipped | A exceeded B read as B exceeded A. FALSE, and quotable | — / T7 / same |
| `attribution_shift` | Whose view? | The claim belongs to a cited person or to "critics"; the statement gives it to the writer, or to the wrong person. **The defining YNNG trap** | same + `entity_swap` / T8 / same |
| `outside_knowledge` | True in the world, not in the text | Answered from what the learner knows. Most dangerous on familiar topics | same / T3 / same |

**Family P — proposition matching (every type)**

| Slug | Name | What happened | R1 / R3 / R4 |
|---|---|---|---|
| `lexical_lure` | Word match, no meaning match | Content words all present, relation different or reversed | `keyword_lure` / T4 / same |
| `paraphrase_missed` | Meaning match not recognised | The text does state it, fully, in other words; the learner answered NOT GIVEN or picked nothing | same / — / same |
| `scope_shift` | Quantifier or scope shift | some↔all, often↔always, one district↔nationally, a study↔research generally | `quantifier_swap` + `scope_shift` / T5 + T11 / same |
| `hedge_stripped` | Certainty inflated or deflated | *may reduce* read as *reduces*; *suggests* as *proves*; also *only / never / the first* asserted without licence | `modality_shift` + `absolute_language` / T6 / same |
| `time_shift` | Wrong point on the timeline | Plan vs implementation; *used to* vs *does*; past practice asserted as current | same / T9 / same |
| `negation_missed` | A *not / rarely / failed to* was skipped | Includes negative prefixes and the double negation of a negated antonym | `negation_flip` / — / same |
| `partial_condition` | Half true | One clause supported, one not. TRUE requires **all** of it. The most under-taught trap after the F/NG boundary | `partial_match` / — / same |

**Family L — locating and choosing between options**

| Slug | Name | What happened | R1 / R3 / R4 |
|---|---|---|---|
| `detail_for_main_idea` | A detail taken for the point | The heading matches something the paragraph mentions, not what it does. The classic headings failure | `heading_detail_lure` / T14 / same |
| `heading_too_broad` | The topic of the whole text | The heading names the passage's subject rather than this paragraph's contribution | — / T14 / — |
| `heading_cascade` | Error propagated | One wrong placement forced a second, because headings cannot be reused. Worst marks-lost-per-mistake ratio in the paper | `heading_cascade` / — / — |
| `parallel_decoy` | The topic returns later | Two paragraphs discuss the same thing; the answer is in the second, the decoy in the first | `decoy_zone` / T12 / — |
| `true_but_not_asked` | Accurate, irrelevant | The option is true of the passage and does not answer this stem. Punishes reading the options before the stem | `mc_true_but_irrelevant` / code / lure |
| `neighbour_answer` | Right answer, wrong number | The answer belonged to the adjacent item | `heading_adjacent` / — / same |
| `order_ignored` | Searched the whole passage | The group runs in passage order and the answer was already bracketed | same / — / — |

**Family F — form and process. Never a comprehension failure, and counted separately.**

| Slug | Name | What happened | R1 / R3 / R4 |
|---|---|---|---|
| `over_limit` | Over the word limit | Right content, wrong length. Articles count. A certain zero | same / T13 / `form_error` |
| `spelling` | Mis-copied | The answer was on the screen. Pure avoidable loss, and the highest-value thing to count separately for GT | same / T13 / `form_error` |
| `form_error` | Right word, wrong form | Singular for plural, wrong word class, paraphrased instead of copied, does not fit the gap's frame | `form_mismatch` + `not_verbatim` + `grammar_mismatch` / T13 / same |
| `wrong_option_form` | Wrote the word, not the letter — or the wrong number of letters | Letter-answer types and "choose TWO" | `wrote_word_not_letter` + `mc_wrong_count` + `bank_wordclass` / — / — |
| `ran_out_of_time` | Not a comprehension error | Blank, or a guess under the clock | `blank` / — / same |

**Rules for using it**

- The **authored** trap and the learner's **self-selected** trap are both stored. Their disagreement
  rate is itself a metacognition metric worth showing (R4 §2.3).
- `ran_out_of_time`, `over_limit` and `spelling` must be separable in the stats, because they need
  pacing and answer-form fixes rather than reading fixes.
- **Group rule for TFNG/YNNG:** every group must contain at least one
  `absence_read_as_contradiction` item and at least one `contradiction_read_as_absence` item. They
  are inverse errors, and a learner who over-corrects for one walks straight into the other (R3 §6.1).
- **Pack rule:** every slug in Family J, P and L must be exercised by **at least six questions**
  across the merged bank, or the trap drill cannot teach it. §9.4 lint 34.

### 5.2 `paraphrase_link.devices[]` — 14 devices

R3 §4.1's D1–D12 with readable slugs, extended by two from R4 §7. The D-codes are documentation; the
slugs are the data.

| Slug | D | What changes | Meaning |
|---|---|---|---|
| `synonym` | D1 | one content word swapped | preserving |
| `superordinate` | D2 | specific → category (`larch and spruce` → `conifers`) | preserving |
| `hyponym` | D3 | category → instance | preserving |
| `nominalisation` | D4 | verb/adjective → noun (`the ice retreated` → `the retreat of the ice`) | preserving |
| `verbalisation` | D5 | noun → verb (`a reduction in cost` → `costs fell`) | preserving |
| `voice_shift` | D6 | active ↔ passive, often with the agent deleted | preserving — **but agent deletion is a NOT GIVEN factory** |
| `converse` | D7 | `A supplied B to C` ↔ `C obtained B from A` | preserving; **reversing it makes FALSE** |
| `negated_antonym` | D8 | `few adopted it` ↔ `it was not widely adopted` | preserving; high error rate under time pressure |
| `compression` | D9 | multiword ↔ single word | preserving; **changes the answer's length, so it breaks word limits** |
| `clause_restructure` | D10 | relative → participle → separate sentence; cause re-expressed | preserving; the proposition may cross a sentence boundary |
| `gloss_swap` | D13 | term ↔ its definition (`photovoltaic panels` → `panels that turn light into electricity`) | preserving |
| `figure_restatement` | D14 | number ↔ expression (`from 20% to 40%` → `doubled`) | preserving |
| `scope_change` | **D11** | `some` ↔ `most` ↔ `all`; `in one region` ↔ `everywhere` | **CHANGING — yields FALSE** |
| `modality_change` | **D12** | `may reduce` ↔ `reduces`; `suggests` ↔ `demonstrates` | **CHANGING — yields FALSE** |

Teaching a learner to sort a rewording into *preserving* vs *changing* is, more or less, teaching
TFNG. Which is why lint 25 exists: a TRUE/YES key may not list `scope_change` or `modality_change`.

### 5.3 `distractors[].diagnosis` — 15 codes

R3 §6.3's nine, plus three for the failure modes that only completion and dating produce, plus three
that only TFNG/YNNG produces. The code names **why that option fails**, from the marker's side.

**General** — `true_but_not_asked` · `right_words_wrong_paragraph` · `overstated` · `understated` ·
`partially_true` · `unstated` · `too_narrow` · `too_broad` · `reversed`

**Attribution and dating** — `wrong_claimant` · `wrong_period`

**Answer form** — `wrong_form` (right content, wrong number, word class or verbatim form; the standard
diagnosis for a completion distractor)

**Judgement types only** — `no_contradiction` (FALSE/NO chosen and nothing in the text contradicts) ·
`contradiction_present` (NOT GIVEN chosen and the text does contradict) · `support_present`
(NOT GIVEN chosen and the text does state it). Without these three, a TFNG distractor entry cannot be
diagnosed at all, because the wrong option is a verdict rather than a proposition.

`partially_true` is the most dangerous distractor type and the one to write most often, because the
supported half is what the learner checks.

### 5.4 `answer_order` and `time_budget_s` — fixed per type

**`answer_order` is not an authorial choice.** It is a published property of the question type
(R1 §3), and an author who gets it wrong ships a wrong strategy card. Lint 14 checks this table.

| Type | `answer_order` | Per-question seconds |
|---|---|---|
| `multiple_choice` | `sequential` | 85 |
| `multiple_choice_multi` / `list_selection` | `sequential` | 85 |
| `true_false_not_given` | `sequential` | 70 |
| `yes_no_not_given` | `sequential` | 80 |
| `matching_sentence_endings` | `sequential` | 55 |
| `sentence_completion` | `sequential` | 40 |
| `short_answer` | `sequential` | 30 |
| `matching_headings` | `scattered` | 70 |
| `matching_information` | `scattered` | 55 |
| `matching_features` | `scattered` | 45 |
| `summary_completion` | `section_local` | 40 |
| `summary_completion_bank` | `section_local` | 30 |
| `note_completion` | `section_local` | 30 |
| `table_completion` | `section_local` | 30 |
| `flow_chart_completion` | `section_local` | 40 |
| `diagram_labelling` | `section_local` | 40 |

`time_budget_s` = question count × the per-question figure, ±20%. Lint 15.

**The one-line rule the learner gets:** *everything that is a "matching" task except sentence endings
is out of order; everything shaped like a summary or a picture is out of order; everything else runs
top to bottom.* Matching sentence endings is the one matching type with the sequential advantage, and
learners systematically do not know it — teaching it is worth real marks (R1 §4.4).

**The compensating fact for `section_local`, which is officially guaranteed and badly under-taught:**
those answers come from **one section of the passage, not the whole text**. Locate the section once,
then work inside it. That converts the scariest-looking types into the fastest ones.

**The honest line on order inside a `section_local` group** (R1 §11.1 is contested): *"Expect them
roughly in order, but treat that as a hint rather than a rule — the guaranteed fact is that they come
from one section."* **We author them in passage order within the group**, except that each agent
authors exactly **one** deliberately out-of-order `section_local` group across their whole allocation,
to train the habit of checking. Flag it with `watch_out`.

### 5.5 `teaching.gear` — 4 values

R3 §5.1's careful/expeditious × local/global taxonomy, made per-question so the coach can say which
gear the item wants.

| Value | Definition | What it is for |
|---|---|---|
| `skim` | expeditious, global — sampling for gist | matching headings; a best-title MCQ |
| `scan` | expeditious, local — hunting a form you already know: a date, a name, a figure | short answer, table completion, most GT Section 1 |
| `search` | expeditious, local→global — hunting a *meaning* when you do not know its wording | **most of the paper**: TFNG location, matching information, completion |
| `close` | careful — full processing of two to four sentences | the verification zone, once located; every TFNG/YNNG decision |

`search` is the gear IELTS demands most and the one preparation material almost never names. If your
whole passage is tagged `scan`, you have written keyword-findable items and the passage is too easy.

### 5.6 `difficulty_rationale.levers[]` — 6 values

`density` · `abstraction` · `implicit_cohesion` · `lexis` · `syntax` · `argument_structure`

Ranked by how much they actually move difficulty (R4 §12.1). `syntax` and `lexis` are the two most
reached for and the two that move it least.

---

## 6. General Training — the shape

BandReady ships **zero** GT content. Everything below is the sole authority for it, from R2, verified
against the running code.

### 6.1 One row per section; three rows per test

```
reading_tests   rt_gt_01   format=general_training
  ├── p1_id → rp_gt_01_s1   Section 1 · questions  1–14
  ├── p2_id → rp_gt_01_s2   Section 2 · questions 15–27
  └── p3_id → rp_gt_01_s3   Section 3 · questions 28–40
```

**Never put a whole GT test in one row.** `passage_document()` (`validate.py:513`) has a legacy branch
that silently returns only the first passage of a whole-test document; that path must not be
exercised.

### 6.2 Row and document fields

| Field | Section 1 | Section 2 | Section 3 |
|---|---|---|---|
| `id` | `rp_gt_<NN>_s1` | `rp_gt_<NN>_s2` | `rp_gt_<NN>_s3` |
| `format` | `general_training` | same | same |
| `title` | a human section name — `"Around Marlow"` | `"Working at Brackenfield"` | the article's own title |
| `topic_id` | see §6.6 | usually `topic_work` | any |
| `word_count` | sum across **all** `texts[]` | same | same |
| `band_target` | 5.0–5.5 | 6.0–6.5 | 7.0–7.5 |
| `passage_json.id` | `"p1"` | `"p2"` | `"p3"` |
| `passage_json.position` | 1 | 2 | 3 |
| `passage_json.gt_section` | **1** | **2** | **3** |
| `passage_json.difficulty` | `easy` | `medium` | `hard` |
| `texts` | **3–5 blocks** | **2 blocks** | **1 block** |
| `question_groups` | 2–3 groups, Q1–14 | 2–3 groups, Q15–27 | 3–4 groups, Q28–40 |
| `teaching.skim_plan.kind` | `field_scan` | `field_scan` | `paragraph_map` |

`gt_section` is `null` on Academic rows and **must** be `1|2|3` on GT rows — it drives the
`Section N` badge (`PassagePane.tsx:267`) and is how per-section practice will filter.

### 6.3 A multi-text section, expressed in `texts[]`

`texts[]` already supports this with **no schema change and no renderer change**:
`PassagePane.tsx:280` maps over `passage.texts` and renders each block as its own `<section>` with
`block.heading` as an `<h3>`. That is the answer to the module's central GT question.

```jsonc
"texts": [
  { "id": "t1",
    "heading": "Five weekend classes at Harlow Community Centre",   // REQUIRED on every GT block
    "paragraphs": [
      { "id": "A", "text": "Beginners' pottery — Saturdays 10.00–12.00 …" },
      { "id": "B", "text": "Conversational Spanish — Saturdays 14.00–15.30 …" },
      { "id": "C", "text": "…" }, { "id": "D", "text": "…" }, { "id": "E", "text": "…" } ] },
  { "id": "t2",
    "heading": "Using the Harlow leisure card",
    "paragraphs": [ { "id": "F", "text": "…" }, { "id": "G", "text": "…" },
                    { "id": "H", "text": "…" } ] }
]
```

Rules, all lint-enforced:

1. **`heading` is required on every GT text block.** The renderer stacks blocks with only a margin
   between them; without a heading the learner cannot tell where one document ends and the next
   begins. It may stay `null` on Academic rows, as today.
2. **Letters run continuously across the whole row.** `t1` uses A–E, `t2` continues at F. **Never
   restart at A in a second block** — paragraph ids are looked up in one flat map across all blocks
   (§0.3), so a duplicate silently corrupts notes, highlights and evidence-locating. Where a real
   paper letters A–E twice, we use A–E and F–J. The learner experience is identical.
3. **One advertisement = one paragraph = one letter.** This is the whole of R2's
   "letter-identifies-a-text" problem, dissolved: because each lettered item is exactly one paragraph,
   the letter the learner writes is simultaneously the text id and the paragraph id, and
   `anchor_paragraphs`, `options[].key` and `answers[].value` are all the same token. **No engineering
   is required.** If an advert needs a name line, fold it into the paragraph's opening clause; never
   split one advert across two letters.
4. In a continuous short text (a notice, a policy) paragraphs are ordinary paragraphs and the letters
   just continue the sequence.
5. **Section 1 carries 3–5 blocks maximum.** More and the split pane becomes a scroll marathon.
6. **Tabular content has no renderer.** Timetables, price lists and opening hours are authored as a
   paragraph of line-shaped entries with a consistent separator:
   `"Monday to Friday — 9.00 to 17.30; Saturday — 9.00 to 13.00; Sunday and public holidays —
   closed."` It reads correctly, it scans correctly, and it keeps `evidence_quote` quotable.

### 6.4 Word counts and numbering

| Section | Blocks | Words per block | Section total |
|---|---|---|---|
| 1 | 3–5 | lettered items 60–110 each; continuous short texts 180–280 | **550–750** |
| 2 | 2 | 370–450 each | **750–900** |
| 3 | 1 | — | **850–1,000** |
| **Test** | | | **2,150–2,650** |

The official whole-paper envelope is 2,150–2,750 words and it is **the same for both formats** — GT
simply spreads it over 5–7 texts instead of 3. Never let a GT test total fall below 2,150. Section 3
must be the longest single text in the paper by a clear margin.

Numbering is **continuous 1–40 across the three rows** — 1–14, 15–27, 28–40 — exactly as in Academic.
Within a row, groups appear in ascending number order, numbers inside a group are contiguous, and a
group may not ask about a text block that appears after the block covered by a later group.

### 6.5 Type mix by section

GT is *completion-heavy and matching-information-heavy* where Academic is *headings-heavy and
judgement-heavy*. Two placements are hard rules:

- **`matching_headings` is Section 3 only.** Sections 1 and 2 have no paragraph structure to have a
  main idea about.
- **`yes_no_not_given` is Section 3 only, and only where the writer takes a position.** Sections 1–2
  have no authorial stance; a YNNG item on a staff handbook is not a hard question, it is an
  impossible one.

| Section | Groups | Draw from |
|---|---|---|
| **1** (14 q) | one `matching_information` group over a lettered cluster (5–7 q) + 1–2 groups over the second cluster | `true_false_not_given`, `sentence_completion`, `table_completion`, `short_answer`, `note_completion` |
| **2** (13 q) | 2–3 groups, **at least two from the completion family**, each text getting its own group(s) | `note_completion`, `flow_chart_completion`, `sentence_completion`, `table_completion`, `summary_completion`, plus `true_false_not_given` or `matching_features` |
| **3** (13 q) | 3–4 groups | `matching_headings` or `matching_information`, `multiple_choice`, `matching_sentence_endings` or `matching_features`, one completion or `short_answer`, `yes_no_not_given` where earned |

Across a whole GT test: **≥7 distinct types**, and at least one of the four types missing from the
bank. Section 2 is the natural home for `note_completion` and `flow_chart_completion`.

### 6.6 GT register — what makes a text convincing

GT texts carry the load in the **detail**, not the syntax. Academic hides answers behind
nominalisation and subordination; GT hides them behind quantities and conditions. Put these on the
page and the questions write themselves:

dates and windows · price tiers (full / concession / family / member) · times and days that differ at
weekends · eligibility rules (age, length of service, residence, membership) · conditions and
exclusions (*provided that*, *unless*, *this does not apply to*, *except where*) · **obligations vs
permissions** (*must*, *may*, *should*, *are advised to*, *are required to*) · named contacts and
channels · quantities and limits.

Person and mood: **S1** impersonal or second person, imperative in notices. **S2** second person and
institutional third person. **S3** third person, expository, one authorial voice. Mean sentence
length 12–16 / 16–20 / 18–24. Lexis everyday and semi-technical, *not* academic — except inside S2,
where a policy document legitimately uses *entitlement*, *probationary*, *reimbursement*, *pro rata*,
*in lieu*. That contrast between plain and bureaucratic wording inside one S2 text is itself a
paraphrase-recognition target and should be exploited.

**The GT-authentic trap is modality and conditions.** The difference between *must* and *is
recommended* is a whole TFNG item, and the answer routinely sits in a subordinate clause. At least
one item per GT Section 2 TFNG group must turn on a modal or a condition, with the trap named.

**GT teaching weights answer-form discipline much more heavily than Academic does**, because at the
top of the GT table the bands are one or two marks wide (40 = 9.0, 39 = 8.5, 37–38 = 8.0). A single
misspelt one-word answer in an easy Section 1 notice costs half a band. Every GT Section 1–2
completion group must carry a `watch_out` naming an answer-form loss.

`topic_id` for GT rows: **S1** from `topic_tourism` `topic_transport` `topic_housing` `topic_food`
`topic_sport` `topic_culture` `topic_education` `topic_money` `topic_health`; **S2** almost always
`topic_work`, with `topic_health` for safety documents, `topic_money` for pay and benefits,
`topic_education` for training schemes; **S3** anything, favouring `topic_environment`
`topic_transport` `topic_science` `topic_culture` `topic_food` `topic_urbanisation`.

---

## 7. The four missing types

`note_completion`, `flow_chart_completion`, `matching_sentence_endings` and `diagram_labelling` do
not exist in the bank. The answer matcher already handles all four (`answers.py:76/97`) and
`qtypes.ts:79–88` already labels and renders inputs for all four. Only `diagram_labelling` is
genuinely blocked.

### 7.1 `note_completion` — the easiest of the four, and the GT workhorse

```jsonc
"layout": { "kind": "note",
            "title": "<≤8 words>",
            "lines": [ "Tags have been fitted to pooled pallets since the {{12}}.", … ] }
```

The layout is a titled skeleton of compressed propositions with `{{n}}` gap markers, `n` being the
absolute question number. Each `question.prompt` restates its own line with `{{gap}}` in place of the
marker — that is the shape the existing `summary_completion` groups already use and the renderer
already handles. 4–7 lines, at most one gap per line.

**The type-specific loss:** notes drop function words, so candidates mis-read the relationship the
note encodes — `Purpose:` versus `Result:` — and fill in a word that is factually present and
relationally wrong. Every note group's `watch_out` should name that.

Author these in GT Section 2 above all, over policies and procedures, and in Academic passage 1 over
a descriptive region.

### 7.2 `flow_chart_completion` — linear only until D5 lands

```jsonc
"layout": { "kind": "flow_chart",
            "title": "<≤8 words>",
            "steps": [ "Incident reported to the {{21}} on duty",
                       "Written record made within {{22}} hours", … ] }
```

`types.ts:52` types `steps` as a flat `string[]`, so **only a linear chain can be rendered today**.
Official samples branch (R1 §6.5), which is why D5 asks for an additive extension:

```jsonc
"layout": { "kind": "flow_chart",
            "nodes": [ { "id": "n1", "text": "…{{21}}…" } ],
            "edges": [ ["n1","n2"], ["n1","n3"] ] }      // renderer falls back to `steps` order
```

**Until D5 lands, author linear chains of 4–7 steps only.** R-A5 may author one branching chart if and
only if the extension has shipped, and substitutes a linear one otherwise, reporting the substitution.

Type-specific losses: filling a box with the *result* where it wants the *input*; ignoring arrow
direction; and answers that fit the process logically but are not the passage's words. GT Section 2
procedures — grievance stages, incident reporting, an application route — are the natural material,
and GT uses this type more than Academic does.

### 7.3 `matching_sentence_endings` — the sequential matching type

```jsonc
{ "type": "matching_sentence_endings",
  "allow_reuse": false,
  "options": [ { "key": "A", "text": "…" }, … ],       // ALWAYS more endings than stems
  "questions": [ { "number": 31, "prompt": "Because the pallet belongs to nobody in the chain,", … } ] }
```

3–5 questions, options A–F or A–G, each ending used **once**, more endings than beginnings.

Three authoring rules that make it fair rather than free:

1. **At least three endings must be grammatically viable for every stem.** If only one ending fits
   grammatically the item tests nothing (R4 §9.3). Conversely a grammatically impossible ending can be
   eliminated for free, so never build a set where that is the whole discipline.
2. **Several endings must be true of the passage.** Truth is not the test; *completion of this stem*
   is. The most valuable single line we can write for this type is a `why_wrong` reading
   *"Ending C is true of the passage but completes a different stem — it belongs to question 32."*
3. Keep subject reference straight across stems and endings. Stems that alternate between the
   researcher and the subjects, with endings that do the same, produce silent errors that are our
   fault rather than the learner's.

`answer_order: sequential` — and `order_note` must say so, because this is the fact learners do not
have.

### 7.4 `diagram_labelling` — blocked on D4, scoped to one agent

The module's hardest content problem: it needs a real asset, and an LLM cannot draw one that survives
contact with reality. **Recommendation adopted from R1 §6.6: a small library of original SVG diagrams,
with passages written *against* them.**

**The convention D4 must establish** (specified here so the owner can implement it exactly):

```
content/core-en/media/reading/diagrams/dg_<slug>.svg     — checksummed by manifest.checksums like any media file
"layout": { "kind": "diagram",
            "image": "media/reading/diagrams/dg_solar_still.svg",   // pack-relative, always this prefix
            "alt": "<≤25 words — REQUIRED, and it must not contain any keyed answer>",
            "labels": [ { "number": 26, "x": 62, "y": 18 } ] }      // 0–100 viewBox coordinates
```

SVG requirements: a `viewBox="0 0 100 100"`, no external references, no embedded raster, no text that
gives away a label, monochrome strokes so it renders in both themes, and a leader line ending at each
`(x, y)`.

**Author the diagram first, then the passage that describes it.** Every answer must be in the prose;
the diagram is a comprehension aid, never a source. The signature loss is
`diagram_from_picture` — a learner who knows what the object looks like labels it from world
knowledge — so the passage must name each labelled part in words the picture cannot supply.

**Fallback if D4 has not landed when R-A5 authors:** substitute one `flow_chart_completion` group and
one `table_completion` group for the diagram group, and **report the substitution**, because it
re-creates the exact gap this push exists to close.

Three diagrams, all original, none of them a real device documented anywhere in detail:
a **solar still** (band 6, water), a **canal lock** (band 6.5, transport), a **ground-source heat
pump loop** (band 7, energy).
---

## 8. Cluster assignments

Six agents. **10 new tests · 33 new passage rows · 442 new questions**, plus a full teaching retrofit
of the 6 existing passages (80 questions). The bank finishes at **12 tests · 39 passage rows ·
522 questions · both formats**.

### 8.1 Global rules that apply to every cluster

**Passage difficulty inside a test is fixed by position.** Academic: passage 1 `band_target` 6.0 and
`difficulty: "easy"`, passage 2 → 7.0 / `medium`, passage 3 → 8.0 / `hard`. General Training: Section
1 → 5.0–5.5 / `easy`, Section 2 → 6.0–6.5 / `medium`, Section 3 → 7.0–7.5 / `hard`. The gradient is a
published property of both papers.

**Item difficulty is independent of it.** Every passage set must span roughly band 5.5 to band 8 in
question `band_target` regardless of the passage's own level, because that is what discriminates
(R4 §12.3). A passage whose 13 questions are all `band_target: 7.0` is not calibrated, it is flat.

**Word counts.** Academic 780–900 words, 6–8 paragraphs, per passage; a test totals 2,400–2,700. GT
per §6.4; a test totals 2,150–2,650.

**Distinct types per test: ≥7.** Groups per passage: 3, occasionally 4. Questions per Academic
passage: 13 / 13 / 14 (any order that sums to 40). GT: 14 / 13 / 13, fixed.

**Anchor spread.** Within a passage, no paragraph may hold more than 40% of the answers, and at least
70% of paragraphs must be touched. A passage where 9 of 13 answers sit in two paragraphs teaches a
false scanning heuristic (R4 §8.2).

**Every Academic passage must contain**, planted deliberately at authoring time: at least one
agent-deleted passive (`voice_shift` with no *by*-phrase — the NOT GIVEN factory), at least one
plausible-but-unstated proposition, at least one quantified comparison that requires restatement, and
— for any passage carrying a YNNG group — at least two attributed opinions of which the writer
endorses one and declines to endorse another.

**`topic_id`** must exist in `data/topics.jsonl` (20 ids, listed in R2 §9.9). No cluster may use one
`topic_id` more than **3** times.

**Do-not-repeat — the 6 existing subjects and the template subject.** Urban river daylighting · grid
electricity storage · the museum wall label · the refrigerated food chain · the fifteen-minute city ·
the attention economy in media · **the shipping pallet (reserved for `TEMPLATE.json`)**.

### 8.2 The six clusters

| Agent | Cluster slug | Owns | Rows | New questions |
|---|---|---|---|---|
| **R-A1** | `ac-core` | Academic tests **3 and 4** | 6 | 80 |
| **R-A2** | `ac-argued` | Academic tests **5 and 6** | 6 | 80 |
| **R-A3** | `gt-social` | General Training tests **1 and 2** | 6 | 80 |
| **R-A4** | `gt-work` | General Training tests **3 and 4** | 6 | 80 |
| **R-A5** | `new-types` | Academic test **7** + **3 standalone drill passages** | 6 | 82 |
| **R-A6** | `gt-long-retrofit` | General Training test **5** + **retrofit of all 6 existing passages** | 3 new + 6 updated | 40 new + 80 retrofitted |

---

#### R-A1 · `ac-core` — the factual/descriptive Academic core · ids `rt_ac_03`, `rt_ac_04`

The types a candidate meets on passages 1 and 2: headings, TFNG, completion, matching information.

| Type | Questions | Notes |
|---|---|---|
| `matching_headings` | 12 | Two groups of 6. Each option list must contain one `too_narrow` and one `too_broad` distractor, diagnosed as such |
| `true_false_not_given` | 12 | Two groups of 5–7. Each group: ≥1 `absence_read_as_contradiction`, ≥1 `contradiction_read_as_absence` |
| `sentence_completion` | 10 | |
| `matching_information` | 8 | `allow_reuse: true` on at least one group |
| `summary_completion` | 8 | Free-text variant, `section_local` |
| `multiple_choice` | 7 | Including one `multiple_choice_multi` "choose TWO" item (2 numbers) |
| `matching_features` | 6 | Needs a passage with 3–5 named, invented people or schemes |
| `short_answer` | 6 | |
| `summary_completion_bank` | 6 | With `bank_analysis[]`, ≥2 unused options |
| `note_completion` | 5 | |

Subject areas (pick 6, all distinct, all non-specialist): the standardisation of time zones · seed
banks and how they choose what to keep · the rediscovery of urban beekeeping · why bridges are
painted · the economics of the second-hand book · how a national mapping agency works · the return of
the cargo sail · lighthouse automation.

Teaching centre of gravity: the paragraph map and `search` reading; the FALSE/NOT-GIVEN boundary as a
procedure; the compensating "one section, not the whole text" fact for the completion family.

---

#### R-A2 · `ac-argued` — argued Academic, where the writer has a position · ids `rt_ac_05`, `rt_ac_06`

The types a candidate meets on passage 3: YNNG, matching features, MCQ, sentence endings.

| Type | Questions | Notes |
|---|---|---|
| `yes_no_not_given` | 10 | **Two groups.** Each passage carrying one needs `metrics.attributed_opinions ≥ 2` and at least one item turning on `attribution_shift` |
| `true_false_not_given` | 10 | |
| `matching_headings` | 9 | |
| `multiple_choice` | 8 | Including one "best title / writer's overall purpose" item, placed last in its passage |
| `matching_features` | 8 | Competing-theories passages; `allow_reuse: true` on at least one group |
| `summary_completion` | 10 | |
| `sentence_completion` | 8 | |
| `matching_sentence_endings` | 6 | |
| `matching_information` | 6 | |
| `summary_completion_bank` | 5 | |

Subject areas (pick 6): whether museums should return objects · the case against open-plan offices ·
what counts as evidence in nutrition advice · the argument over rewilding farmland · whether
handwriting still matters · how cities decide what to demolish · the reliability of eyewitness
memory · the ethics of predictive maintenance.

Teaching centre of gravity: *whose view is this?* — the writer's, a reported view, or a reported view
the writer rejects. `concession_misread` (the writer's position is the main clause, not the
concession). `hedge_stripped` and `partial_condition` in MCQ options.

---

#### R-A3 · `gt-social` — General Training, social survival first · ids `rt_gt_01`, `rt_gt_02`

| Type | Questions | Notes |
|---|---|---|
| `matching_information` | 12 | Two Section-1 groups over lettered clusters. `allow_reuse: true`. One advert = one paragraph = one letter |
| `true_false_not_given` | 12 | Section 1 and 2. ≥1 item per Section-2 group turning on a modal or an exclusion clause |
| `short_answer` | 12 | The Section-1 workhorse. wh-word constrains the answer form |
| `sentence_completion` | 12 | |
| `note_completion` | 8 | Section 2 |
| `table_completion` | 8 | Over price/eligibility grids |
| `multiple_choice` | 6 | Sections 2–3 |
| `matching_features` | 5 | Section 2: departments, grades, schemes |
| `matching_headings` | 5 | **Section 3 only** |

Section 1 genres (6 needed, all distinct, from R2 §3.1): classified advertisement set · evening-course
listings · leisure-attraction leaflet · library information sheet · transport travelcard leaflet ·
event programme · council notice to residents · museum visitor information.
Section 2 genres (4 needed): staff handbook section · leave and absence policy · pay and benefits ·
induction guide · workplace facilities.
Section 3 genres (2 needed): natural-history feature · place portrait · craft or trade profile ·
everyday-technology story.

Teaching centre of gravity: **answer-form discipline**, because the GT table charges half a band for
one misspelt word in an easy notice. Every Section 1–2 completion group's `watch_out` names an
answer-form loss. Plus the non-sequential letter cluster: letters may repeat, questions are not in
text order.

---

#### R-A4 · `gt-work` — General Training, workplace survival · ids `rt_gt_03`, `rt_gt_04`

| Type | Questions | Notes |
|---|---|---|
| `true_false_not_given` | 11 | |
| `matching_information` | 10 | |
| `sentence_completion` | 10 | |
| `note_completion` | 8 | Section 2 |
| `table_completion` | 8 | |
| `short_answer` | 8 | |
| `flow_chart_completion` | 8 | **Two groups**, both Section 2 procedures. Linear chains unless D5 has landed |
| `matching_headings` | 5 | Section 3 only |
| `multiple_choice` | 5 | |
| `summary_completion_bank` | 4 | Section 3 |
| `matching_sentence_endings` | 3 | Section 3 |

Section 2 genres (4 needed, none shared with R-A3): contract of employment extract ·
health-and-safety procedure · grievance and appeal procedure · training and development scheme ·
flexible-working policy · performance-review guidance.
Section 1 genres (4 needed, none shared with R-A3): accommodation information for new arrivals ·
local-services directory · health-centre registration · membership/club joining information ·
product information card · timetable with notes.
Section 3 genres (2 needed): transport or infrastructure history · institution profile ·
health-and-lifestyle feature · practical instructional article.

Teaching centre of gravity: **modality collapse** — *must* / *should* / *is advised to* / *may* are
not equivalent, and in a staff handbook the difference is exactly one mark. Plus the exclusion clause:
the answer to a GT TFNG routinely sits in a subordinate clause (*unless you are a member*, *provided
you have completed probation*) that a keyword matcher never reaches.

---

#### R-A5 · `new-types` — the four missing types, at volume · ids `rt_ac_07`, `rp_dx_a5_01..03`

The only agent authoring `diagram_labelling` and the only one who may author a branching flow-chart.
**Read §7 in full before starting, and confirm with the verify agent whether D4 and D5 have landed.**

`rt_ac_07` (Academic, 40 questions):

| Passage | Groups |
|---|---|
| p1 (band 6.0, 14 q) | `matching_headings` 5 · `note_completion` 5 · `true_false_not_given` 4 |
| p2 (band 7.0, 13 q) | `diagram_labelling` 4 · `flow_chart_completion` 5 · `sentence_completion` 4 |
| p3 (band 8.0, 13 q) | `matching_sentence_endings` 4 · `multiple_choice` 5 · `yes_no_not_given` 4 |

Three standalone drill passages, each 14 questions, **not part of any test** (`position: 1`, no test
row references them — they exist so a drill can be filled without burning a whole test):

| Id | Shape | Groups |
|---|---|---|
| `rp_dx_a5_01` | Academic, process, band 6.5 | `flow_chart_completion` 5 · `diagram_labelling` 4 · `note_completion` 5 |
| `rp_dx_a5_02` | Academic, comparative, band 7.0 | `diagram_labelling` 4 · `matching_sentence_endings` 5 · `table_completion` 5 |
| `rp_dx_a5_03` | **General Training Section 2** standalone, band 6.0 | `note_completion` 6 · `flow_chart_completion` 4 · `true_false_not_given` 4 |

Three original SVG diagrams to author (§7.4): a **solar still**, a **canal lock**, a **ground-source
heat pump loop**. Author each diagram first, then the passage that describes it in prose.

Subject areas: desalination by solar still · how a canal lock raises a boat · ground-source heat ·
how a suspension-bridge deck is assembled · the making of a cast bell · how a reed bed cleans water ·
(GT S2) reporting an accident at work.

Teaching centre of gravity: process language, and the two type-specific losses that define these
types — filling a flow-chart box with the *result* where it wants the *input*, and labelling a diagram
from world knowledge of the object rather than from the text.

---

#### R-A6 · `gt-long-retrofit` — GT test 5 and the retrofit · ids `rt_gt_05`, updates to `rp_a1`–`rp_b3`

Two jobs. The second is the larger one.

**New:** `rt_gt_05`, three GT rows, 40 questions —
S1 `matching_information` 6 · `true_false_not_given` 4 · `short_answer` 4;
S2 `note_completion` 5 · `table_completion` 4 · `true_false_not_given` 4;
S3 `matching_headings` 5 · `multiple_choice` 4 · `matching_sentence_endings` 4.
Section 1 and 2 genres must not duplicate R-A3's or R-A4's. Section 3 must be the longest single text
in the pack's GT content.

**Retrofit:** the six existing Academic passages — `rp_a1` (urban rivers), `rp_a2` (grid storage),
`rp_b1` (cold chain), `rp_b2` (fifteen-minute city), `rp_b3` (attention economy) and `rp_a3` (museum
labels) — get the complete teaching payload at all three levels, and nothing else changes. Rules:

- **Do not rewrite a single word of passage prose, a prompt, an option or an answer key.** The
  passages are good and the tests are in use. This is an additive edit.
- `passage_json.schema_version` goes `1` → `2`.
- Add `teaching` at passage, group and question level per §§1–3.
- `explanation` may be **extended** where it currently only restates the answer, but never replaced
  with a different claim.
- Two existing keys must be repaired, because they teach a wrong habit (§1.6 rule 3): `rp_a2` q21 keys
  `{"value": "generation", "note": "singular accepted"}` where the passage says `generations`; drop
  the singular variant and say so in `explanation`. Sweep the other five rows for the same pattern and
  report every instance found.
- Where an existing item has no trap, author `traps: []` rather than inventing one.

R-A6 delivers 80 retrofitted question payloads and 40 new questions. It is the heaviest teaching-only
load in the push and it is what makes the two existing tests worth sitting.

### 8.3 Resulting coverage — floors the verify agent checks

| Type | Existing | R-A1 | R-A2 | R-A3 | R-A4 | R-A5 | R-A6 | **Total** | Floor |
|---|---|---|---|---|---|---|---|---|---|
| `true_false_not_given` | 9 | 12 | 10 | 12 | 11 | 8 | 8 | **70** | 60 |
| `matching_headings` | 14 | 12 | 9 | 5 | 5 | 5 | 5 | **55** | 45 |
| `sentence_completion` | 6 | 10 | 8 | 12 | 10 | 4 | 0 | **50** | 48 |
| `matching_information` | 8 | 8 | 6 | 12 | 10 | 0 | 6 | **50** | 45 |
| `multiple_choice` (+multi) | 6 | 7 | 8 | 6 | 5 | 5 | 4 | **41** | 38 |
| `note_completion` | 0 | 5 | 0 | 8 | 8 | 16 | 5 | **42** | 38 |
| `short_answer` | 6 | 6 | 0 | 12 | 8 | 0 | 4 | **36** | 34 |
| `table_completion` | 4 | 0 | 0 | 8 | 8 | 5 | 4 | **29** | 26 |
| `matching_features` | 7 | 6 | 8 | 5 | 0 | 0 | 0 | **26** | 24 |
| `yes_no_not_given` | 10 | 0 | 10 | 0 | 0 | 4 | 0 | **24** | 22 |
| `summary_completion` | 4 | 8 | 10 | 0 | 0 | 0 | 0 | **22** | 20 |
| `matching_sentence_endings` | 0 | 0 | 6 | 0 | 3 | 9 | 4 | **22** | 20 |
| `flow_chart_completion` | 0 | 0 | 0 | 0 | 8 | 14 | 0 | **22** | 20 |
| `summary_completion_bank` | 6 | 6 | 5 | 0 | 4 | 0 | 0 | **21** | 20 |
| `diagram_labelling` | 0 | 0 | 0 | 0 | 0 | 12 | 0 | **12** | 12 |
| **Total** | **80** | **80** | **80** | **80** | **80** | **82** | **40** | **522** | |

Fourteen of the fifteen types clear 20 questions, so a 20-question drill becomes possible for all of
them — today the bank cannot fill one for *any* type (R1 §9.4). **`diagram_labelling` reaches 12 and
no further**, because three original SVG diagrams is the honest ceiling for this push; drill sizes 5
and 10 work for it, size 20 does not, and the drill picker must say so rather than serving a short set
silently.

---

## 9. Staging format, ids, merge contract and lints

### 9.1 File location and shape

Each authoring agent writes **one** file:

```
content/core-en/staging-reading/tests/<cluster-slug>.json
```

e.g. `content/core-en/staging-reading/tests/ac-core.json`. A single JSON object:

```jsonc
{
  "staging_version": 1,
  "cluster": "ac-core",                  // must equal the filename stem
  "authored_by": "R-A1:ac-core",
  "tests": [                             // 0–2 entries
    { "test":     { /* one reading_tests.jsonl row, verbatim, exactly 6 keys */ },
      "passages": [ /* exactly 3 reading_passages.jsonl rows, in p1,p2,p3 order */ ] }
  ],
  "standalone_passages": [ /* 0–3 reading_passages.jsonl rows not referenced by any test */ ],
  "updates": [                           // in-place edits to rows that already exist
    { "id": "rp_a1", "op": "replace_passage_json", "passage_json": { /* the WHOLE new document */ } }
  ]
}
```

**A row is the JSONL row, not a nested wrapper.** A `passages` entry has exactly the keys
`id · format · title · topic_id · word_count · band_target · passage_json`, in that order. A `test`
entry has exactly `id · format · title · p1_id · p2_id · p3_id`. Never author `source`, `retired`,
`created_at` or `validation_report_json` — the loader supplies them.

`TEMPLATE.json` is itself a valid staging file with one `standalone_passages` entry. Copy its shape
exactly.

### 9.2 Id convention — collision-proof by construction

```
Academic test          rt_ac_<NN>            NN = 03..07
Academic test passage  rp_ac_<NN>_p<K>       K = 1|2|3
GT test                rt_gt_<NN>            NN = 01..05
GT section passage     rp_gt_<NN>_s<K>       K = 1|2|3
Standalone passage     rp_dx_<agent><NN>     agent = a1..a6, NN = 01..
Template               rp_tm_00_p1  /  rt_tm_00      RESERVED — do not author
```

Row-local ids: text blocks `t1`, `t2`, …; groups `g1`, `g2`, …; paragraphs single uppercase letters
running continuously across the whole row (§6.3 rule 2). The passage document's own `id` is
`"p1"`/`"p2"`/`"p3"` by test position (this is the in-document id the renderer uses, not the row id).

The six existing rows are `rp_a1 rp_a2 rp_a3 rp_b1 rp_b2 rp_b3` and the two existing tests are
`rt_academic_1 rt_academic_2`, so **no new id can collide with anything shipped**.

### 9.3 The merge step (mechanical, no judgement)

```
for each file in staging-reading/tests/*.json, sorted by filename:
    for each entry in file.tests:
        for row in entry.passages:  append json.dumps(row, ensure_ascii=False)+"\n" -> data/reading_passages.jsonl
        append json.dumps(entry.test, ensure_ascii=False)+"\n"                      -> data/reading_tests.jsonl
    for row in file.standalone_passages:
        append json.dumps(row, ensure_ascii=False)+"\n"                             -> data/reading_passages.jsonl
    for u in file.updates:
        find the single line in data/reading_passages.jsonl whose "id" == u.id
        replace ONLY its "passage_json" value with u.passage_json; leave every other column untouched
        (if no such line exists, or more than one does, FAIL the merge)
then: uv run --project sidecar python -m tools.content.build content/core-en
```

Nothing else. No transformation, no id rewriting, no defaulting, no re-ordering of existing lines. If
a merge needs to *fix* anything, the staging file is wrong and must be sent back. The update path is
idempotent: re-running the merge over the same staging files must produce a byte-identical
`reading_passages.jsonl`, which is the property that makes a re-run safe.

Expected counts after the full merge: **`reading_passages` 39 · `reading_tests` 12 ·
`reading_questions` 522**. `tools.content.build` rewrites `manifest.counts` and `manifest.checksums`
and re-validates the whole pack. **Nobody hand-edits `manifest.json`.**

### 9.4 Lint rules the merge gate runs (write to pass these)

**Structural**

1. `cluster` == filename stem == every row's cluster allocation in §8.2.
2. Every `passages` array has exactly 3 rows; `test.p1_id/p2_id/p3_id` equal their `id`s in order.
3. Every id matches §9.2 and its cluster's block; no duplicate id anywhere in the pack; no `updates`
   id that is absent from `data/reading_passages.jsonl`.
4. Passage rows carry exactly the 7 allowed keys; test rows exactly the 6 allowed keys.
5. `format` on a test row equals `format` on all three of its passage rows.
6. `topic_id` exists in `data/topics.jsonl`; no cluster uses one `topic_id` more than 3 times.
7. `passage_json.id` ∈ `{p1,p2,p3}` and `position` ∈ `{1,2,3}` matching the test slot; standalone rows
   use `p1` / `position: 1`.
8. `passage_json.schema_version == 2` on every new and every updated row.
9. Row `word_count` equals the true word total of `texts[]` (±2); per-passage and per-test totals inside
   §8.1 / §6.4 bands.
10. `band_target` and `difficulty` match the position gradient of §8.1.
11. Paragraph ids are unique across the **row**, single uppercase characters, and contiguous from `A`.
12. **Question numbers across a test's three rows are exactly `{1..40}`**, contiguous, ascending inside
    each row, contiguous inside each group, and groups appear in ascending number order.
13. `teaching.time_budget_min` matches §4.2 for this format and position; the three sum to 58.
14. `group.teaching.answer_order` equals the §5.4 value for the group's `type`.
15. `group.teaching.time_budget_s` == question count × §5.4's per-question seconds, ±20%.
16. `section_scope` present and non-empty **iff** `answer_order == "section_local"`, and every entry is
    a paragraph id on this row.
17. TFNG and YNNG never appear in the same group; `matching_headings` and `yes_no_not_given` never
    appear on a GT Section 1 or 2 row.
18. ≥7 distinct group types per test; the §8.3 floors are met bank-wide.

**Answers and evidence**

19. Every question has an integer `number` and non-empty `answers[]`.
20. `evidence_quote` is a verbatim substring of the text of one of its `anchor_paragraphs`.
    Every `anchor_paragraphs` entry exists as a paragraph id on the same row.
21. Every keyed answer on a `TEXT_TYPES` question is a case-insensitive substring of one of its
    anchor paragraphs, in exactly the form keyed.
22. Every keyed answer passes `within_word_limit` against its own group's `word_limit`.
23. No `answers[]` entry carries a `note` that describes leniency the exam does not grant (no
    "singular accepted", no "plural accepted"). Authored variants may only be genuine alternatives.
24. Letter-answer groups: every `options[].key` referenced by a key exists; `allow_reuse: false` groups
    have no repeated key; option lists always have **more options than questions**.
25. **In-order groups are monotonic**: for `answer_order: "sequential"`, the character offset of each
    question's `evidence_quote` in the concatenated passage is non-decreasing with question number.
26. Anchor spread: no paragraph holds >40% of a passage's answers; ≥70% of paragraphs are touched.
27. No two questions share an identical `evidence_quote` (except inside one summary/note group).
28. Option-length balance inside a group: longest option ≤ 1.4 × shortest.
29. Key distribution: no more than 2 consecutive identical keys in any group; every TFNG/YNNG group
    contains at least one of each of its three keys and no key more than 3 times in a group of 5–7.
30. No absolute (`always`, `never`, `all`, `none`) appears in an MCQ **key**; no distinctive stem word
    appears in exactly one option.

**Teaching payload**

31. Every question has `teaching` with `schema_version`, `decision_rule`, `distractors`,
    `reusable_rule`, `traps`, `gear`.
32. `paraphrase_link.stem_phrase` is an exact substring of `prompt` or of the keyed option's `text`;
    `paraphrase_link.text_phrase` is an exact substring of an anchor paragraph. Absent **only** on a
    pure NOT GIVEN item.
33. `nearest_text` present and a verbatim passage substring **iff** the key is `NOT GIVEN`;
    `evidence_quote` on such an item points at the tempting sentence, not at a decisive one.
34. **No TRUE/YES key lists `scope_change` or `modality_change` in `paraphrase_link.devices`.**
35. `distractors[]` meets the per-type coverage table of §1.3 — including that a `matching_headings`
    group covers **every unused heading** somewhere across its questions; every entry has a
    non-generic `why_tempting` and a `diagnosis` from §5.3.
36. `reusable_rule` contains no proper noun from the passage and no content word from
    `evidence_quote`.
37. `grammar_cue` present on every completion and `short_answer` question.
38. `traps[]` values are all in the §5.1 enum; every slug in families J, P and L is exercised by ≥6
    questions bank-wide; every TFNG/YNNG group carries ≥1 `absence_read_as_contradiction` and ≥1
    `contradiction_read_as_absence`.
39. `bank_analysis[]` present on every `summary_completion_bank` group, one entry per unused option,
    ≥2 unused options, every entry naming a real question number.
40. Passage `teaching`: `skim_plan.kind` is `field_scan` on GT Sections 1–2 and `paragraph_map`
    everywhere else; a `paragraph_map` has exactly one entry per paragraph; `paraphrase_families` 4–6
    with `passage_form` substring-checked and **no `rewordings` entry occurring in the passage**;
    `hinge_words` 3–5, each occurring in the passage, each naming a question number; `mineable` 5–8,
    each `blocks_q` a real question number on this row, ≤2 single-word items.
41. `metrics.unknown_token_pct` ≤ 2.0 on every passage; `metrics.awl_pct` in 5–11;
    `metrics.attributed_opinions` ≥ 2 on any passage carrying a `yes_no_not_given` group.
42. All word and character limits in §§1–3 respected.

**Originality and safety**

43. No 8-gram is shared between any two passages in the file, or with any existing passage.
44. No forbidden claim from §0.2 appears in any string: no "57% faster", no "22% improvement", no
    per-type frequency percentage, no real organisation, no real named researcher, no real statistic.
45. `alt` text on a diagram layout contains none of that group's keyed answers.

### 9.5 Post-merge, before hand-off

```
uv run --project sidecar python -m tools.content.build content/core-en
```

then a live check that the payload actually reaches the app and that the mock actually hides it:

```
GET /api/v1/reading/passages/rp_ac_03_p1                      → question.teaching absent
GET /api/v1/reading/passages/rp_ac_03_p1?mode=review          → 403 with no submitted attempt   (D1)
GET /api/v1/reading/attempts/{submitted}/review               → question.teaching present        (D2)
GET /api/v1/reading/drills/note_completion?size=20            → 20 items                         (D3)
```

The verify agent must confirm all four before declaring the push done. If D1 and D2 have not landed,
**the content is still correct and still merges — but the mock leaks it**, and that must be reported
as a release blocker rather than quietly shipped.

---

## 10. Features, ranked by learner impact

Each feature names exactly which payload fields it consumes, so content and UI cannot drift.

### F1 — The Solution Card, attempt-gated · impact very high · cost M

**Consumes:** `question.teaching` in full, plus `anchor_paragraphs`, `evidence_quote`, `explanation`.

The reading counterpart of the speaking Compare screen and the writing band ladder. On the review
screen every question expands into a five-part card in a **fixed order**:

**Location → Paraphrase link → Decision rule → Distractor autopsy → Rule to reuse.**

- **Location** renders `evidence_quote` as a button; clicking it highlights the span in the passage
  pane and flashes the anchor paragraph. The highlight is an exact substring search, which is why
  lint 20 exists — a near-miss breaks it silently and invisibly.
- **Paraphrase link** renders as two chips, the stem phrase and the text phrase, joined by a labelled
  arrow carrying the device names. This is the single most valuable row on the card.
- **Decision rule** is one line.
- **Distractor autopsy** is one row per wrong option: `why_tempting` in normal weight, `why_wrong`
  muted, `diagnosis` as a small badge. **The option the learner actually chose is pinned to the top
  and outlined.**
- **Rule to reuse** sits at the bottom with an `Add to my rules` action.

The card is **unavailable until the attempt is submitted**, and that lock is enforced in the sidecar
by D1, not by the renderer. On a NOT GIVEN item the Location row shows `nearest_text` under the
heading *"The sentence that tempts you"*, because the reason for the emptiness is the lesson.

### F2 — Self-diagnose before reveal · impact very high · cost S

**Consumes:** `question.teaching.traps` (as the answer key to the picker), `anchor_paragraphs`.

The cheapest high-impact feature in the module. On every **wrong** answer the review opens with two
questions and nothing else:

1. *"Where was the answer?"* — select a span in the passage. Checked against the authored evidence
   span. Right selection + wrong answer = a **technique** problem. Wrong selection = a **location**
   problem. Two different diagnoses with two different remedies (R4 §1.2).
2. *"What went wrong?"* — pick from the §5.1 trap list, filtered to the 5–7 slugs plausible for this
   type. `I don't know` is always present and is itself informative.

Only then does F1 unlock. The evidence is direct: learners who can explain their own corrections
improve; learners who read explanations passively do not. It also produces the disagreement metric —
self-selected trap versus authored trap — which is a genuine metacognition signal.

### F3 — The strategy card · impact high · cost S

**Consumes:** `group.teaching.strategy`, `order_note`, `answer_order`, `watch_out`, `time_budget_s`,
plus a **static per-type page** written once from R1 §§4–7 and R4 §5.3.

Two surfaces. In the **drill pane and the review pane**, a collapsible card above the group carrying
this group's authored `strategy` and `order_note` — the attack plan for this type on this passage. In
the **type browser**, the static page: what the type tests, the gear it wants, whether its answers run
in passage order, its two characteristic losses, its per-question time budget.

`answer_order` renders as a single unmissable badge — **In passage order** / **Not in order** /
**All in one section** — because it is the highest-value strategic fact per type and most learners do
not have it. Never shown during a mock.

### F4 — Trap profile and trap-filtered drills · impact very high · cost S–M

**Consumes:** `question.teaching.traps[]` aggregated across attempts.

The results and progress screens gain a second axis. Today: *"TFNG 2/6."* Tomorrow, additionally:
*"You lost 9 marks to three traps: phantom contradiction (4), scope shift (3), outside knowledge (2)."*
Each line is a button that assembles a drill of items carrying that trap **across all types and all
passages** — which is a better selector than `qtype` and is what turns the taxonomy from a content
field into the product's diagnostic spine.

Needs D3's `trap_codes_json` column on `reading_questions` to be selectable. The drill runner already
exists and already shows anchor paragraphs only, which is the correct training constraint.

**Two drill modes worth building on top:**
- **TFNG two-stage scaffold** (R1 §7.3): a first pass answering only GIVEN / NOT GIVEN, then a second
  pass answering TRUE / FALSE on the survivors. It converts a three-way decision into two binaries and
  attacks the highest-loss error in the paper directly. Cambridge's own teaching materials use exactly
  this staging.
- **Bounded search**: on a `sequential` group, show only the paragraph band between the previous and
  next answers. This trains the single most useful thing there is to teach about NOT GIVEN — that the
  search is bounded, so "I could not find it" becomes a decision rather than a surrender.

### F5 — The Paraphrase Gym · impact very high · cost M

**Consumes:** `question.teaching.paraphrase_link` triples and `passage.teaching.paraphrase_families`.

A drill type that costs **no new content**, because it is generated from fields the item bank already
carries. Three formats, 60–90 seconds each:

- **Match** — four text phrases, four stem phrases, pair them.
- **Spot** — one stem phrase, four candidate text phrases; three are word-overlap lures (free, from
  other items' distractors), one is the real paraphrase.
- **Name it** — given a real pair, name the device from §5.2, with the meaning-preserving vs
  meaning-changing split as the scored distinction. Sorting a rewording into those two buckets *is*
  TFNG, which is why this is the highest value-per-build-hour item in the module.

Fed from the learner's own missed items first, then from `paraphrase_families` in their topic
clusters.

### F6 — The two-minute map · impact high · cost S–M

**Consumes:** `passage.teaching.skim_plan`.

Before a single-passage practice run (never in a mock), a `skim_plan.budget_s` countdown and a column
of empty boxes, one per paragraph, each capped at **four words** with a visible counter. The cap is
"a label, not a summary" made structural rather than advised. `read_first` and `skip` show as one line
each above it. On expiry the boxes lock and the questions open; the learner's labels stay visible,
greyed, beside the passage for the rest of the attempt.

Afterwards, and only afterwards, the authored `map` renders beside the learner's own. The comparison
is the teaching. On GT Sections 1–2 the surface changes shape entirely: `field_scan` renders as a
checklist of the field types to hunt (dates, price tiers, who is eligible, what is excluded), because
those texts do not want a paragraph map and teaching one wastes the learner's minutes.

### F7 — Constrained vocabulary mining · impact medium-high · cost S

**Consumes:** `passage.teaching.mineable`, `paraphrase_families`, `hinge_words`.

In review, the `Add to deck` affordance is prominent **only** on items in `mineable` whose `blocks_q`
is a question the learner got wrong, capped at 5 per passage. Everything else stays a lookup. The card
created is a **paraphrase pair** — text phrase ↔ stem phrase, plus the source sentence, the passage id
and the paragraph id — not a bare headword, because the pair is the thing that will be tested again.

`hinge_words` feed a separate, tiny, permanently-available deck: the ~200 quantifiers, frequency
adverbs, modals, hedging verbs, comparatives and connectives that decide most TFNG items. It is a
fortnight's work and it is worth more marks than two thousand topic nouns. **No exportable word
lists** — the constraint is the point.

### F8 — Time forensics and live pacing · impact very high · cost S

**Consumes:** `passage.teaching.time_budget_min`, the §4.2 constants, and `time_ms` per question,
which we already store and do nothing with.

**During** a practice attempt (never a mock): a second marker in the timer bar showing where you
should be, and a one-time nudge at 2:00 on a single question — *"mark it and move"* — suppressible.

**After** submission, a panel built from data we already have:
- minutes per passage against the §4.2 benchmark, as a stacked bar;
- the checkpoint line: *"at 16 minutes you had 9 answers; the target is 14"*;
- **the money sentence**: *"4 questions cost you 11 minutes and returned 1 mark; 6 questions were left
  blank"*;
- the three-way verdict — **technique / location / time** — and one recommended next action, never a
  list.

Blanks and >2-minute questions are a *pacing* diagnosis, not a comprehension one, and the coaching for
the two is completely different. Today the results screen cannot tell them apart.

### F9 — The 60-minute Mock · impact high · cost M

**Consumes:** nothing. Deliberately consumes **no** teaching field — that is the point.

One session: **3 passages, 40 questions, 60 minutes, one clock, one submit.** Format follows the
learner's declared module. The attempt is created with `mode: "full", exam_conditions: true`, which
already writes `ReadingAttempt.mode = "exam"`.

**Exam conditions, enforced server-side:**

| Condition | Enforcement |
|---|---|
| No key, ever, during the attempt | `_payload_without_key` already strips `answers`, `explanation`, `trap_note`, `evidence_quote` from the response body |
| **No coaching, anywhere** | **D2**: `teaching` is in `_SECRET_FIELDS` and `_strip_key` pops it at passage, group and question level. The Solution Card, the strategy card, the skim plan, the vocabulary and the trap names are **absent from the response**, not hidden behind a renderer flag — there is nothing to reveal with a devtools toggle |
| The review endpoint is unreachable | **D1**: `?mode=review` on `/tests/{id}` and `/passages/{id}` 403s without a submitted attempt by this profile. `/attempts/{id}/review` already 409s until submitted, and `/why-wrong` already requires a submitted attempt |
| No generation, no drills, no second attempt | While an exam-mode attempt is `in_progress` for the profile, `POST /reading/generate` and `GET /reading/drills/{qtype}` return 409 |
| One clock | A single 60:00 countdown. Per-passage elapsed time is tracked silently and never shown during the mock |
| **No transfer time** | Stated once in the pre-mock briefing and nowhere else: *"60 minutes total — unlike Listening, there is no extra time to write up answers."* Our player is computer-delivered so the risk does not exist here; users sitting the paper test need to know it does exist there |
| Auto-submit at 0:00 | Already implemented; `auto_submitted: true` on the score record |
| Dictionary popover disabled | Already specced: the word is queued silently to a "looked up later" list shown after submission |
| Pacing hints off | F8's live marker and the 2:00 nudge are not mounted |
| Confidence tagging off | Adding a metacognitive control makes practice less like the test |
| Highlights and notes stay on | Computer-delivered IELTS has them. Fidelity cuts both ways |
| Leaving | Navigating away requires an explicit **Abandon mock** confirmation; the clock does not pause |

**The report leads with pacing, then raw score, then band.** Minutes per passage against 16/20/22 (or
15/18/25), then raw out of 40 with the per-type and per-trap breakdowns, then the band **with
`BAND_DISCLAIMER`**. Raw score is the headline number because the middle of the Academic table is four
marks wide and a learner improving inside it must be able to see it.

### F10 — The review gate · impact high · cost S

**Consumes:** attempt history only.

Starting a new full test while the previous attempt has unreviewed wrong answers shows an
interstitial: *"3 wrong answers from Tuesday's test are unreviewed. Reviewing them takes about four
minutes and is worth more than this test."* Two buttons: **Review now** / **Start anyway**. Skips are
counted and surfaced. **Never a hard block** — a hard block is paternalistic and gets uninstalled.

The practice contract behind it, which the copy should state plainly: a full test is an assessment
instrument, not a training instrument. One per two or three days at most; the days between are review
and trap drills. Every miss re-enters the queue at about 48 hours and again at about 7 days.

### Explicitly not built

A model answer, or any field pretending to be one · the Solution Card before an attempt · a band score
after a drill · an LLM explanation as the *primary* explanation (authored `decision_rule` first;
"why was I wrong" is a second layer for the learner's specific wrong answer, and an LLM asked to
invent the whole solution will occasionally invent the evidence too) · exportable word lists ·
speed-reading eye-training, chunk widening or pacing wands · a WPM figure without a comprehension
floor of 70–75% · any per-type frequency claim · any numeric penalty attached to a strategy.

---

## 11. Authoring checklist — run this before you write the file

1. **Write the passage first, and write it as an item writer, not as an essayist.** Third person,
   informational, paragraph-structured, non-specialist audience. Every technical term glossed in its
   own sentence or fully inferable from it. If a reader needs the field to follow it, it is not
   exam-realistic and it breaks the NOT GIVEN construct, because a candidate who knows the field will
   answer from knowledge.
2. **Write the evidence span before the item.** Authors who write the stem first drift into items
   whose answer is "sort of in paragraph C". The span is the *minimum* text that forces the answer —
   5 to 25 words. If you need 60, you are anchoring the wrong thing or the item is unfair.
3. **Write NOT GIVEN to target; never classify a statement after the fact.** Pick a sentence that is
   unambiguously about topic X, then write a proposition *adjacent* to it — the cause the writer never
   gives, the comparison never made, the motive, the consequence, the evaluation, the extension in
   time or place. Then apply the **silence test**: which sentence would have to exist for this to be
   TRUE, and which for FALSE? If you can name either and it exists, the key is not NOT GIVEN. Then the
   **adversarial test**: hand it to someone who wants it to be FALSE; if they can point at a sentence,
   it is FALSE or it is broken.
4. **FALSE requires a quotable contradiction.** Not "the passage implies otherwise", not "the tone
   suggests". A sentence that denies it, and you must be able to name the single word that does the
   denying. If your only argument is inference, your key is NOT GIVEN.
5. **TRUE requires *all* of it** — every clause and every qualifier. A statement whose main clause is
   supported and whose qualifier is not is usually NOT GIVEN, occasionally FALSE, and never TRUE.
   That is where `partial_condition` and `scope_shift` come from, and you should write them on purpose.
6. **Run the five fairness tests on every item**: findable (a nameable span decides it) · unique (you
   cannot write a one-sentence argument for a second option that a band-7 reader would accept) ·
   closed (no outside knowledge required *or* rewarded, and none contradicting the key) · independent
   (no item gives away or depends on another; watch for a heading whose wording answers a later TFNG)
   · construct-relevant (it tests reading, not memory, not arithmetic, not general knowledge).
7. **Run the passage-free pass on yourself.** Read your questions with the passage covered. Anything
   you can answer confidently is testing world knowledge, not reading — rewrite it. This is the check
   the existing generation pipeline does not have and it is cheap.
8. **Every wrong option must be falsifiable only by reading the text.** Options within ~20% of each
   other in length; no absolutes in a key; at least three grammatically viable endings per stem in a
   sentence-endings set; keys spread across the letters and numerals; no distinctive stem word
   appearing in exactly one option.
9. **`why_tempting` describes a real candidate process, not your theory of the item.** Write it after
   you have tried to answer your own item wrongly and seen what you reach for.
10. **Teaching notes must be actionable this attempt.** "Read more carefully" is not a note. "The
    passive here has no *by* phrase, so nobody is named — a statement that names an agent cannot be
    checked" is.
11. **Vary your own wording across your six passages.** Six `strategy` fields built from one sentence,
    or six identical `watch_out` lines, is a tell that this was generated rather than authored. Lint
    43 catches the crude version; you must catch the rest.
12. **Copyright self-check on every sentence before you commit it.** Did I read this somewhere? If
    there is any doubt at all, throw it away and write a different one on the same subject.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University
Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of them. No exam
material is reproduced in this document or in `TEMPLATE.json`; every passage, question, option,
heading, explanation, trap name, device code and example above is original text authored for
BandReady.*
