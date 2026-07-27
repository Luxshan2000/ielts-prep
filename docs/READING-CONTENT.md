# The reading bank

What ships in `content/core-en`, what the teaching payload contains, how General Training
differs from Academic, how a raw score becomes a band, how the 60-minute mock enforces exam
conditions, and how to author a new test.

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or
> connected to the IELTS Partners. IELTS is a registered trademark of its owners, used here only
> to describe the exam format this software helps you prepare for. Every passage, question and
> explanation in this bank is original. No past paper, official practice test or preparation book
> was used as a source, a reference or a paraphrase target. Band scores are estimates for
> practice and do not predict an official result.

---

## 1. What the bank holds

**12 tests · 36 passages · 480 questions · 29,623 words of original prose.**
Every question, every group and every passage carries a teaching payload — 480/480, 115/115,
36/36.

### 1.1 Tests

| Test | Format | Words | Difficulty gradient |
| --- | --- | ---: | --- |
| `rt_academic_1` | Academic | 2,497 | easy → medium → hard |
| `rt_academic_2` | Academic | 2,534 | easy → medium → hard |
| `rt_ac_08` | Academic | 2,649 | easy → medium → hard |
| `rt_ac_09` | Academic | 2,515 | easy → medium → hard |
| `rt_ac_bh_01` | Academic | 2,596 | easy → medium → hard |
| `rt_ac_bh_02` | Academic | 2,455 | easy → medium → hard |
| `rt_ac_sh_01` | Academic | 2,484 | easy → medium → hard |
| `rt_ac_sh_02` | Academic | 2,504 | easy → medium → hard |
| `rt_gt_01` | General Training | 2,364 | Section 1 → 2 → 3 |
| `rt_gt_02` | General Training | 2,367 | Section 1 → 2 → 3 |
| `rt_gt_03` | General Training | 2,359 | Section 1 → 2 → 3 |
| `rt_gt_04` | General Training | 2,299 | Section 1 → 2 → 3 |

8 Academic, 4 General Training. Every test is exactly 40 questions numbered **1–40 contiguously
across its three passages**, not restarting per passage — that is what makes the raw score
markable out of forty, and the merge tool refuses to write a pack where it does not hold.

### 1.2 Passages

* **By format** — 24 Academic, 12 General Training.
* **By difficulty** — 12 easy, 12 medium, 12 hard (one of each per test, in position order).
* **By band target** — 5.0 ×2 · 5.5 ×2 · 6.0 ×10 · 6.5 ×2 · 7.0 ×10 · 7.5 ×2 · 8.0 ×8.
* **Length** — 682–900 words, mean 823. Academic 781–900; General Training 682–867.
* **Topics** — 17 of the 20 `data/topics.jsonl` ids are used. The heaviest are
  `topic_environment`, `topic_technology` and `topic_work` at 4 passages each.
* **Text blocks** — 28 passages are a single text; 8 carry 2 or 3 (all General Training, §3).

### 1.3 Question types

All fifteen types the real paper uses. The four that did not exist before this push —
`note_completion`, `flow_chart_completion`, `diagram_labelling`, `matching_sentence_endings` —
are marked **new**.

| Type | Total | Academic | GT | Groups |
| --- | ---: | ---: | ---: | ---: |
| `true_false_not_given` | 57 | 36 | 21 | 12 |
| `matching_headings` | 56 | 46 | 10 | 10 |
| `matching_information` | 55 | 31 | 24 | 12 |
| `sentence_completion` | 44 | 22 | 22 | 11 |
| `multiple_choice` | 43 | 32 | 11 | 15 |
| `yes_no_not_given` | 40 | 40 | 0 | 8 |
| `short_answer` | 37 | 17 | 20 | 10 |
| `table_completion` | 28 | 12 | 16 | 7 |
| `note_completion` **new** | 26 | 10 | 16 | 7 |
| `matching_features` | 24 | 19 | 5 | 6 |
| `summary_completion_bank` | 24 | 20 | 4 | 6 |
| `matching_sentence_endings` **new** | 16 | 13 | 3 | 4 |
| `summary_completion` | 14 | 14 | 0 | 3 |
| `flow_chart_completion` **new** | 12 | 4 | 8 | 3 |
| `diagram_labelling` **new** | 4 | 4 | 0 | 1 |

`yes_no_not_given` and `matching_headings` never appear on a GT Section 1 or 2 row — those
sections are survival and workplace texts with no argued position to agree or disagree with.
Every test carries at least seven distinct group types.

### 1.4 The item-level guarantee

A wrong key in a reading bank does not fail loudly; it silently teaches the learner something
false. Two mechanical checks stand behind every item, and both run inside
`tools/content/merge_reading.py` before anything is written:

* **480/480 evidence quotes are a verbatim substring of their own anchor paragraph.** The review
  screen highlights that span in the passage, so a quote that does not resolve highlights
  nothing.
* **169/174 free-text keys appear verbatim in their anchor paragraph.** The other 5 are
  *secondary* variants the exam genuinely grants (`run-off` beside `runoff`, `1500` beside
  `1,500`); the primary key of all 174 is verbatim. No keyed answer is absent from its passage.

Beyond those, every letter answer names a real option, every judgement key is one of its three
legal values, every key fits its group's own word limit under the shared matcher, and every
test's numbers are exactly `{1..40}`.

The strongest check is end-to-end: **submitting the authored key for all 12 tests through the
live scoring route returns 40/40 on all 12.** Every one of the 480 keys round-trips through
`bandready.scoring.answers` — the same normalizer the learner's typing goes through.

---

## 2. The teaching payload

Reading is receptive. The learner produces nothing but an answer-key match, so a "model answer"
would be meaningless — the equivalent of speaking's band-graded models is the pair **the point
of right** and **the whole space of wrong**. The payload lives at three levels under a
`teaching` key, and the sidecar strips all three from the exam document (§5).

### 2.1 Per question — `question.teaching`

```jsonc
{
  "schema_version": 1,
  "paraphrase_link": {                     // the highest-value field in the module
    "stem_phrase": "the same for everyone",   // exact substring of the prompt or keyed option
    "text_phrase": "with no concessionary rate", // exact substring of an anchor paragraph
    "devices": ["negated_antonym", "gloss_swap"],
    "note": "A reduced rate that does not exist is another way of saying one price for all."
  },
  "decision_rule": "Only one listing states that no reduced price exists…",
  "distractors": [                         // the reading equivalent of a model answer
    { "key": "A",
      "why_tempting": "A gives one headline figure, so a reader who stops at the first number…",
      "why_wrong":    "The same sentence offers a lower figure to anyone claiming a benefit…",
      "diagnosis":    "partially_true" }   // one of 15 codes
  ],
  "reusable_rule": "When a question says everyone, look for a second figure later in the same sentence.",
  "traps": ["partial_condition"],          // slugs from the closed 27-slug taxonomy
  "gear": "scan",                          // skim | scan | read_closely | reread
  "grammar_cue": "…",                      // completion and short_answer only
  "nearest_text": "…"                      // NOT GIVEN items only: the sentence that tempted you
}
```

Reading is fundamentally paraphrase recognition, which is why `paraphrase_link` is the field
that carries the most. `stem_phrase` and `text_phrase` are both checked as exact substrings, so
the UI can render them as a matched pair rather than as prose about a match.

**Trap taxonomy** — 27 slugs in four families, defined once in
`sidecar/bandready/reading/drills.py::TRAPS`:

| Family | What it names | Drillable |
| --- | --- | --- |
| `judgement` (8) | TFNG / YNNG verdict errors — the highest-loss type in the paper | yes |
| `proposition` (7) | the statement matched the words but not the claim | yes |
| `locating` (7) | the answer was somewhere else, or the order was misread | yes |
| `form` (5) | over the word limit, wrong word form, spelling, ran out of time | no — diagnosed, never drilled |

The bank tags 544 trap instances across 463 of the 480 questions (17 carry none). All 25 slugs
used are inside the closed enum; nothing is silently dropped. Six slugs sit under the design's
"≥6 bank-wide" floor — see §8.

### 2.2 Per group — `group.teaching`

```jsonc
{
  "answer_order": "sequential" | "scattered" | "section_local",
  "section_scope": ["D", "E", "F"],   // present iff answer_order is section_local
  "strategy":   "Reduce each question to a single field first: price, equipment, booking…",
  "order_note": "Not in text order, and a letter may answer twice. Work listing by listing.",
  "time_budget_s": 275,
  "watch_out": "One listing answers two of these questions and two listings answer none."
}
```

`answer_order` is the single most useful thing to know before starting a group, because
attacking matching headings is nothing like attacking TFNG: a sequential group lets you walk
down the passage once, a scattered one does not.

### 2.3 Per passage — `passage_json.teaching`

`difficulty_rationale` (which levers make this passage hard), `skim_plan`, `paraphrase_families`
(4–6, each with a `passage_form` checked as a real substring), `hinge_words` (3–5, each naming
the question it decides), `mineable` (5–8 vocabulary items, each naming the question it blocks),
and `metrics` (measured difficulty: mean sentence length, longest sentence, AWL percentage,
unknown-token percentage, attributed opinions).

`skim_plan.kind` is **`field_scan`** on GT Sections 1–2 — a listings page is scanned for fields,
not mapped for argument — and **`paragraph_map`** everywhere else, with exactly one entry per
paragraph.

### 2.4 Where it surfaces

| Surface | Route | What it shows |
| --- | --- | --- |
| Solution Card | `GET /reading/attempts/{id}/review` → `per_question[].solution` | Location → paraphrase link → decision rule → distractor autopsy → rule to reuse, in that fixed order |
| Coach | `GET /reading/coach/passages/{id}/teaching` | strategy cards, skim plan, paraphrase families — attempt-gated |
| Drills | `GET /reading/practice/*` | trap-filtered, type, paraphrase and skim drills built from the payload |
| Mock report | `POST /reading/mock/sessions/{id}/submit` | trap profile, per-passage time forensics |

The review's Solution Card and the drill reveal are built by the **same** function
(`bandready.reading.drills.reveal_for`), so a change to the card's order cannot land in one
surface and not the other. On a judgement item the card opens with the verdict boundary —
what would have had to be printed for FALSE to have been right — because "the answer is NOT
GIVEN" teaches nothing on its own.

---

## 3. The General Training multi-text shape

GT is not Academic with easier words. It is three sections with different jobs, and Section 1 is
the one that breaks the "one passage, one text" assumption.

| Section | Job | Texts | Words | Register |
| --- | --- | --- | --- | --- |
| 1 | social survival | **2–3 short texts** in one row | 682–760 | notices, timetables, course listings, library rules |
| 2 | workplace | 1–2 texts | ~750–820 | policies, induction guides, health-and-safety procedures |
| 3 | general interest | 1 continuous text | ~820–870 | the section closest to an Academic passage |

A GT section is **one `reading_passages` row**, and its several texts live in `texts[]`:

```jsonc
{
  "id": "rp_gt_01_s1", "format": "general_training", "band_target": 5.0,
  "passage_json": {
    "schema_version": 2, "id": "p1", "position": 1, "gt_section": 1,
    "texts": [
      { "id": "t1", "heading": "Autumn short courses at Norland Community Centre",
        "paragraphs": [ { "id": "A", "text": "Bread and Baking. Thursdays, 18.30 to 21.00…" }, … ] },
      { "id": "t2", "heading": "Ashfield Central Library: using your card",
        "paragraphs": [ { "id": "G", "text": "…" }, … ] },
      { "id": "t3", "heading": "Notice to residents: changes to recycling collections",
        "paragraphs": [ { "id": "J", "text": "…" }, … ] }
    ],
    "question_groups": [ … ]
  }
}
```

Two rules make this work:

1. **Paragraph ids run continuously across the whole row**, not per text block — `A…F` in `t1`,
   `G…I` in `t2`, `J…L` in `t3`. An `anchor_paragraphs` entry is therefore unambiguous without
   naming its text, and the player's locate-in-passage needs no text id.
2. **Question numbering is per test, not per text.** A Section 1 row holding three notices still
   numbers 1–14 straight through.

8 of the 36 passages are multi-text, and all 8 are General Training.

---

## 4. Raw score → band: two tables, and they differ

Both tables are over 40 questions. General Training is harsher at the top, because its texts are
easier and the same raw score means less. A GT test scored on the Academic table is a real bug,
which is why `raw_to_band(raw, fmt)` takes the format and every attempt record carries it.

| Band | Academic raw | General Training raw |
| ---: | ---: | ---: |
| 9.0 | 39–40 | 40 |
| 8.5 | 37–38 | 39 |
| 8.0 | 35–36 | 37–38 |
| 7.5 | 33–34 | 36 |
| 7.0 | 30–32 | 34–35 |
| 6.5 | 27–29 | 32–33 |
| 6.0 | 23–26 | 30–31 |
| 5.5 | 19–22 | 27–29 |
| 5.0 | 15–18 | 23–26 |
| 4.5 | 13–14 | 19–22 |
| 4.0 | 10–12 | 15–18 |
| 3.5 | 8–9 | 12–14 |
| 3.0 | 6–7 | 9–11 |
| 2.5 | 4–5 | 6–8 |
| 2.0 | 0–3 | 0–5 |

The gap is worth a whole band in the middle: **30/40 is band 7.0 Academic and band 6.0 General
Training**; 23/40 is 6.0 Academic and 5.0 General Training. Both tables live as data in
`sidecar/bandready/server/routes/reading.py` (`ACADEMIC_BAND_TABLE`, `GT_BAND_TABLE`) and are
approximate — official conversions vary slightly between versions, which every band the app
reports says out loud.

An attempt shorter than 40 questions is projected onto the 40-question scale by `scaled_raw()`
and flagged `band_is_estimate: true`.

---

## 5. The mock, and its exam-conditions rule

`POST /api/v1/reading/mock/sessions` assembles a sittable paper — three distinct passages whose
numbers run 1–40 across the whole paper — opens a 60-minute clock, and **closes the coaching
surface for as long as the sitting is live**. Academic reading has no transfer time, so the hour
is the whole hour.

The rule is one function, `bandready.reading.mock.exam_conditions(session, profile_id)`, and
every surface that could hand over help consults it:

| Surface | Behaviour during a live sitting |
| --- | --- |
| `GET /reading/coach/**` | 409, or a *locked* payload naming the withheld fields |
| `GET /reading/practice/**` (drills) | 409 |
| `GET /api/v1/dictionary/{word}` | 409 — the clicked words are queued and returned in the report |
| `GET /reading/passages/{id}` · `/tests/{id}` | teaching stripped at question, group **and** passage level |
| `GET …?mode=review` | 403 until an attempt on that material is submitted |

The sitting reports what it is withholding rather than hiding the fact — 21 named affordances,
including `worked_solutions`, `decision_rules`, `distractor_analysis`, `skim_plan`, `dictionary`
and `why_wrong`. A mock you can look things up during measures reading-with-help, which the
exam does not measure.

The flow: **preflight** (`/reading/mock`, the commitment screen and the paper preview) →
**sitting** (`/reading/mock/sitting/:id`, autosave per passage with `active_position` so time is
attributed per passage) → **report** (`/reading/mock/report/:id`, leading with the time split,
then the band, then the trap profile). Abandoning reopens everything immediately.

### The review gate

`?mode=review` releases the key *and* the whole teaching payload, so it costs an attempt. Without
a submitted attempt on that test — or on any passage of it — it is a 403. A submitted *test*
attempt opens every passage in that test, which is the normal path off the results screen.

---

## 6. Authoring a new test

Everything is staged. Nobody edits `data/*.jsonl` or `manifest.json` by hand.

**1. Write one staging file** at `content/core-en/staging-reading/tests/<cluster-slug>.json`.
`cluster` must equal the filename stem. Copy `staging-reading/TEMPLATE.json`, which is itself a
valid staging file. The full field-by-field spec is `staging-reading/DESIGN.md`.

```jsonc
{
  "staging_version": 1,
  "cluster": "my-cluster",             // == filename stem
  "authored_by": "…",
  "tests": [
    { "test":     { "id": "rt_ac_10", "format": "academic", "title": "…",
                    "p1_id": "…", "p2_id": "…", "p3_id": "…" },   // exactly these 6 keys
      "passages": [ /* exactly 3 rows, in p1,p2,p3 order */ ] }   // exactly 7 keys each
  ],
  "standalone_passages": [],           // rows no test references (drill fodder)
  "updates": []                        // in-place edits to rows that already exist
}
```

A passage row has exactly `id · format · title · topic_id · word_count · band_target ·
passage_json`. Never author `source`, `retired`, `created_at` or `validation_report_json` — the
loader supplies them.

**2. Obey the invariants the merge gate enforces.** The ones that fail most often:

* Question numbers across a test's three rows are exactly `{1..40}`, ascending inside each row.
* `topic_id` exists in `data/topics.jsonl`.
* `format` on the test row equals `format` on all three passage rows.
* Paragraph ids are single uppercase letters, unique across the **row**, contiguous from `A`.
* `word_count` equals the true word total of `texts[]` (±2).
* Every `evidence_quote` is a verbatim substring of one of its `anchor_paragraphs`.
* The **first** entry of `answers[]` is the passage's own wording, verbatim. Later entries may be
  genuine alternatives (`run-off` for `runoff`); they may never grant leniency the exam does not
  ("singular accepted" is forbidden).
* Letter answers name a real option key. `multiple_choice` authors its options on the
  **question**; every matching type authors one shared list on the **group**.
* Option lists have more options than questions.

**3. Merge, idempotently.**

```
uv run --project sidecar python -m tools.content.merge_reading content/core-en --lint-only
uv run --project sidecar python -m tools.content.merge_reading content/core-en --check
uv run --project sidecar python -m tools.content.merge_reading content/core-en
```

`--lint-only` checks the staging file's shape and stops. `--check` performs the whole merge in
memory, runs the item-level gate, prints the resulting bank summary and exits non-zero if disk
would change — this is what CI runs. Without a flag it writes. A new id is appended in file
order; an id that already exists is replaced in place, which is what makes a second run
byte-identical rather than a duplicate. `updates[]` rewrites **only** `passage_json` on a row
that already exists, leaving every other column and the row's line position alone.

The merge refuses to write a pack it knows to be broken. `--allow-lint-failures` overrides that
and should be used only when you are deliberately merging known-bad content.

**4. Rebuild the manifest and validate.**

```
uv run --project sidecar python -m tools.content.build content/core-en
```

This is the only blessed writer of `manifest.counts` and `manifest.checksums`, and it
re-validates the whole pack with checksum verification afterwards. It must print
`OK — pack is valid.`

**5. Sit your own test.** Boot the sidecar against a fresh data dir, submit the authored key for
your new test, and confirm it scores 40/40. If it does not, the key and the passage disagree and
a learner would have been marked wrong for being right.

### Copyright

The exam **format**, the question **types**, the raw-score-to-band tables (facts) and the topic
areas that recur are freely usable. Passages, questions and explanations are not — every one in
this bank is original. Band descriptors are paraphrased in our own words. Invent every proper
noun: no real named researchers, no real organisations, no real statistics. Our copy says
"IELTS-style" and carries the non-affiliation notice.

---

## 7. Where things live

| Path | What |
| --- | --- |
| `content/core-en/data/reading_passages.jsonl` | the 36 passage rows |
| `content/core-en/data/reading_tests.jsonl` | the 12 test rows |
| `content/core-en/staging-reading/tests/*.json` | the staging files the rows are merged from |
| `content/core-en/staging-reading/DESIGN.md` | the full authoring spec (payload fields, enums, lints) |
| `tools/content/merge_reading.py` | the merge tool and the item-level gate |
| `tools/content/build.py` | manifest counts + checksums |
| `sidecar/bandready/content/validate.py` | `ReadingPassageRow`, `ReadingTestRow`, pack validation |
| `sidecar/bandready/scoring/answers.py` | the shared normalizer and matcher (also used by listening) |
| `sidecar/bandready/server/routes/reading.py` | attempts, scoring, review, both band tables |
| `sidecar/bandready/reading/drills.py` | the trap taxonomy and `reveal_for`, the Solution Card |
| `sidecar/bandready/reading/mock.py` | `exam_conditions()` — the one rule every surface consults |
| `app/src/features/reading/` | browser, player, review, coach, drills, mock |

---

## 8. Known gaps

Honest list. None of these is a wrong answer key.

1. **Six trap slugs are under the design's "≥6 questions bank-wide" floor**: `causal_link_assumed`
   5, `comparison_reversed` 4, `heading_too_broad` 3, `order_ignored` 1, and the two form traps
   `spelling` and `ran_out_of_time` at 0. The form pair is arguably correct — form errors are
   diagnosed from the learner's own answer, never drilled — but the first four mean a
   trap-filtered drill on those slugs is thin or empty. 17 of 480 questions carry no trap slug
   at all.
2. **Three questions share an `evidence_quote` with a question in another group** on the same
   passage (`rp_a2` 16/22, `rp_b2` 15/19, `rp_ac_09_p3` 31/39). The design allows a repeat only
   inside one summary/note group. Each pair tests something different from the same sentence, so
   no key is wrong, but the same sentence is mined twice. Two of the three are pre-existing rows.
3. **`rp_b3` group `g2` offers 4 options for 4 questions** — no unused option, which removes the
   elimination the type is supposed to train. Pre-existing content.
4. **`diagram_labelling` has one group and four questions**, and its SVG asset
   (`media/reading/diagrams/dg_front_pack_panel.svg`) does not exist. The renderer degrades
   honestly — "The diagram image is not available offline. Answer using the numbered gaps below."
   — and all four answers are fully determined by the prose, so the group is answerable. The
   asset and the coordinate convention (DESIGN §7.4 says 0–100 viewBox units; `LayoutRenderer`
   multiplies by 100, i.e. expects 0–1 fractions) still need reconciling before an SVG ships.
5. **`flow_chart_completion` charts are linear only.** `QuestionLayout.steps` is a flat
   `string[]`, so a branching chart cannot be expressed.
6. **`GET /reading/passages` does not project or filter `gt_section`**, so the browser cannot yet
   offer per-section GT practice even though every GT row carries it.
7. **`generate_reading.check_passage()` hard-codes Academic bounds** (780–900 words, 6–8
   paragraphs) and would reject every GT row. It only constrains *generated* passages, so the
   hand-authored bank is unaffected — but the generator still cannot produce GT content.
8. **Id conventions diverge.** Three clusters use the design's `rt_ac_<NN>` form (`rt_ac_08/09`)
   and two use a cluster-keyed form (`rt_ac_bh_01`, `rt_ac_sh_01`) chosen to avoid a collision
   during parallel authoring. Nothing breaks — ids are opaque — but `DESIGN.md` §9.2 should be
   amended to allow the second form or the tests renumbered centrally.
9. **`metrics.awl_pct` and `metrics.unknown_token_pct` are authored estimates** on most rows; no
   Academic Word List ships in the repo to compute them from. `mean_sentence_length` and
   `longest_sentence` are measured. Several pre-existing passages exceed the design's
   longest-sentence caps for their band.
10. **Real proper nouns survive in the six original passages** (`rp_a1`–`rp_b3`) — real
    organisations, real people, real statistics — which the current originality rule forbids.
    They predate the rule. Everything authored in this push invents its proper nouns. This needs
    a decision: grandfather the six, or rewrite that prose in a separate pass.
