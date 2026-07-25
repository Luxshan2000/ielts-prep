# 15 — Content authoring & licensing

Status: draft v2 (2026-07-25)

This doc owns BandReady's legal ground rules (trademark, copyright, disclaimer placement), the licensing of all first-party practice content (decision: **CC0-1.0**), the LLM-assisted authoring pipeline with automated validation and human review, verbatim generation prompt templates for each content type, the content roadmap through v1.x (60 speaking sets, 240 writing prompts, 8 reading tests, 4 listening tests, 2 000 vocab entries, plus the placement pack — **the v1.0 content gate is 16-roadmap.md §9.1's cadence numbers**, per R2-13) with an effort plan, the content-tooling factoring (`tools/content/` in the main repo + the thin `bandready-content` PyPI package, per R2-8), the community contribution workflow (packs as separate repos with validation CI), and the AI-generated-content disclosure policy. The content-pack format is now specced canonically in 11-data-model.md §11 (the R2-8 merged `.brpack` spec — this doc's manifest keys survived inside it); §6 here is a pointer plus the authoring-side rules this doc still owns. Every other doc that touches content (04, 05, 06, 07, 08) defers to this one for authoring and licensing policy; this one defers to them for content *schemas*.

## 1. Legal ground rules

### 1.1 Trademark: "IELTS" is a registered mark

Verified 2026-07-25: IELTS is a registered trademark jointly owned by the **IELTS Partners** — the British Council, IELTS Australia Pty Ltd (wholly owned by IDP Education Pty Ltd), and Cambridge English (part of Cambridge University Press & Assessment). US registration 3641568 (serial 76688547); the partners also register the mark's logos and non-Latin renderings (雅思, آيلتس) worldwide. Sources: [ielts.org copyright and trade mark statement](https://ielts.org/legal/ielts-copyright-and-trade-mark-statement), [Justia record for reg. 3641568](https://trademarks.justia.com/766/88/ielts-76688547.html).

BandReady is unaffiliated. Our use of the word "IELTS" rests entirely on **nominative fair use**: using a mark truthfully to refer to the markholder's product, because there is no other practical way to name it. Nominative fair use holds only while all three conditions do:

1. The product is not readily identifiable without the mark (true — "the four-skill English test administered by the British Council/IDP" is not a workable description).
2. We use only as much of the mark as necessary — the **word**, in plain text, never the IELTS logo, colors, or trade dress.
3. Nothing suggests sponsorship or endorsement.

**Binding usage rules** (repeated from 00-vision.md §8, enforced here):

- "IELTS" NEVER appears in: the product name, logo, app icon, domain names, package IDs (`com.bandready.*`, npm/PyPI names), repo name, or app-store listing titles. (00-vision.md records why "OpenIELTS" was rejected.)
- UI copy and README use descriptive phrasing: "prepares you for the IELTS exam", "IELTS-style practice tests". Prefer "IELTS-style" on first mention per screen.
- Never the word "official" adjacent to the mark; never "certified", "approved", or "partner".
- Never reproduce IELTS logos or scans of official materials, including in screenshots, marketing, or issue templates.
- The registered-trademark attribution lives in the disclaimer (below); we do not sprinkle ® through running copy (legally unnecessary for nominative use and reads as fake affiliation).

**Mandatory disclaimer** — canonical wording is owned by 00-vision.md §8 and reproduced verbatim here; this doc owns **placement**:

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or connected to the IELTS Partners (British Council, IDP: IELTS Australia, and Cambridge University Press & Assessment). IELTS is a registered trademark of its owners, used here only to describe the exam format this software helps you prepare for. All practice materials in BandReady are original and are not official IELTS test content. Band scores produced by this software are AI-generated estimates for practice purposes only and do not predict official IELTS results.

Placement rules (all mandatory):

| Surface | Form |
|---|---|
| Repo `README.md` | Full text, own section near the top (above the fold after the demo GIF) |
| App About screen | Full text, always visible (no "read more" fold) |
| Website footer | Full text (small type acceptable) |
| First-run onboarding | Sentence 4 only ("Band scores produced by this software are AI-generated estimates…") shown on the placement-test intro screen |
| Every content-pack `manifest.json` | `"disclaimer"` field carrying the full text (§6) |
| Score report screens (04, 05) | Sentence 4 only, persistent footer line |

Localization: v1 UI is English-only (00-vision.md), so the disclaimer ships in English only. When locales arrive, the disclaimer is translated with the rest of the UI but the English text remains authoritative and is shown alongside translations on the About screen (default, flagged).

### 1.2 Copyright: what we may and may not use

| Thing | Status | Our policy |
|---|---|---|
| Real past-paper content (passages, recordings, questions, cue cards from actual tests, Cambridge practice books 1–19, official sample PDFs) | Copyrighted | **NEVER copy, paraphrase-from, or fine-tune on.** Not even "for inspiration" — authors must not have official materials open while authoring (§3.5 checklist). |
| Exam **format and structure** — 4 skills, 3 speaking parts, 40 questions/60 min reading, question *types* (TFNG, matching headings…), timing, band scale 0–9 in 0.5 steps | Facts / ideas — not protectable | Freely used. All format facts are encoded in our schemas (06 §2, 07 §2, 04 §5). |
| Public band descriptors (the "public version" PDFs published on ielts.org) | The scoring **criteria** are facts; the descriptor **text** is copyrighted | **Paraphrase policy** (§1.3). Our rubrics in 04-speaking-module.md and 05-writing-module.md are original wordings of the four public criteria — those docs own the rubric text, this doc owns the rule. |
| Raw-score → band conversion tables (approximate tables published by IELTS partners) | Short factual data | Usable. 06/07 embed them, labelled "approximate, as published by the IELTS partners". |
| Question-type names ("True/False/Not Given", "matching headings") | Generic descriptive terms | Freely used. |
| Third-party datasets (e.g. `ielts-ai-dataset`) | Varies | §1.4 audit before any reuse. Default: not in first-party packs. |

### 1.3 Rubric paraphrase policy

Applies to every string in `prompts/**` and content packs that expresses scoring criteria:

1. Criteria names (Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation, Task Achievement/Response, Coherence and Cohesion) are facts and used as-is.
2. Descriptor sentences must be **original prose**. Hard rule: no run of **more than 5 consecutive words** in common with any public descriptor PDF, excluding the criteria names themselves.
3. Enforcement is human, at review time: any PR touching rubric text gets the label `rubric-change`, and the reviewer checks rule 2 against the current public PDFs side-by-side. We deliberately do NOT vendor the descriptor text into the repo for automated diffing — that would itself be redistribution of the copyrighted text. (Default, flagged: revisit if rubric churn makes manual checking painful; a maintainer-local, non-distributed fixture + n-gram script is the escape hatch.)
4. A `rubric-change` PR also triggers the scoring regression set (14-testing-strategy.md), because rubric wording is scoring behavior (04 §few-shot calibration note).

### 1.4 Third-party dataset audit (`ielts-ai-dataset` and friends)

00-vision.md open question 5 lands here. Audit procedure for ANY external content source:

1. **License check**: repo must carry an explicit OSI/CC license compatible with redistribution. "No license file" = all rights reserved = reject.
2. **Provenance check**: how was it made? AI-generated sets are only acceptable if the generating party asserts no official materials were used as verbatim source. If provenance is unverifiable, reject *for first-party packs*.
3. **Contamination spot-check**: sample ≥10% of items; web-search distinctive sentences to catch lifted past-paper text.
4. **Quality bar**: same validators as §3 (schema, blind-agreement, lexical level). Third-party items that fail are dropped, not fixed (fixing creates a derivative of unclear pedigree).

**Decision (default, flagged):** third-party datasets are never merged into the first-party CC0 packs (we cannot CC0 what we don't own, and provenance risk concentrates in our name). If a dataset passes audit, it is repackaged as a *community pack* (§7) under its own license with credit, or simply linked from the README.

## 2. Licensing

### 2.1 Code vs content

- **Code** (app, sidecar, validators, and the **prompt templates** in `prompts/` and this doc — they are functional instructions, part of the program): **Apache-2.0**, per decisions.md.
- **First-party practice content** (everything in shipped content packs: cards, prompts, passages, scripts, vocab, pre-rendered WAVs): **CC0-1.0** (public-domain dedication).

### 2.2 Why CC0 and not CC-BY-SA (decision + rationale)

Chosen: **CC0-1.0** for all first-party content.

1. **Honesty about AI-assisted authorship.** Our pipeline is LLM-generated + human-reviewed (§3). Under current US Copyright Office guidance, purely AI-generated expression is not copyrightable; only the human selection/arrangement/editing is. A CC-BY-SA claim over such content would assert copyright we may not fully hold — ShareAlike is unenforceable exactly where we'd want it. CC0 makes no claim that can be challenged.
2. **Zero friction with the Apache-2.0 app.** SA content bundled inside downstream forks, embedded in SQLite, quoted in screenshots, remixed into new packs, or used to fine-tune a local model would raise perpetual "is this a derivative/adaptation?" questions. CC0 answers every such question with "yes, go ahead", which matches the project's first-mover-OSS goal (00-vision.md §7: ≥10 community packs in year one — attribution/SA bookkeeping is a tax on that).
3. **The moat is not the content.** BandReady's value is the integrated local voice pipeline + scoring, not any individual passage. Protecting content with SA defends the wrong asset while annoying contributors.
4. Cost acknowledged: commercial competitors may ship our content. Accepted — they could regenerate equivalent content with the same LLMs anyway.

Community packs choose their own license from the allowlist `{CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0}` (§6 manifest field); the app displays pack license + attribution in the content manager UI.

## 3. Authoring pipeline

Every content item, first-party or community, flows through the same five stages. Tooling factoring (R2-8, resolves G11): the authoring CLI lives in the **main repo** at `tools/content/` (Python, runs inside the sidecar's venv, per the 01 §7 binding layout); the **validator implementations live in the sidecar package at `sidecar/bandready/content/`** (importable as `bandready.content`), because the sidecar itself runs the no-LLM subset of them at pack-import time (11 §11.3). For community CI (§7) the validators are also published to PyPI as **`bandready-content`** — a thin package that only re-exports the `bandready.content` validators plus a `validate` CLI entry point, with no app/voice dependencies. One implementation, three consumers: authoring CLI, sidecar import, community CI.

```
sidecar/bandready/content/     # validator implementations — the module `bandready.content`
├── schema.py                  # jsonschema/Pydantic checks per kind (schemas owned by 04/05/06/07)
├── blind_agreement.py         # §3.3 answer-key check (LLM-driven; not run at pack import)
├── lexical.py                 # §3.4 wordfreq profiling
├── listening_lint.py          # 07 rules: pause budget, spell-out lines, WPM, voice roles
└── speaking_lint.py           # 04 rules: 3–4 bullets, "and explain…", topic lineage

tools/content/                 # authoring CLI (main repo; imports bandready.content)
├── cli.py                     # `python -m tools.content <cmd>` — gen | validate | review | build
├── seeds/topics.yaml          # topic seed registry (§3.1)
├── prompts/                   # the generation templates of §4, one .md per content type
├── review/checklist.md        # §3.5, rendered into the review CLI
└── build.py                   # `.brpack` builder per 11 §11 (manifest + data/ JSONL + media, WAV pre-render via 07 renderer)
```

Pipeline: **topic seed → LLM generation → automated validation → human review → pack build.** Items carry `status ∈ draft | validated | approved | shipped`; only `approved` items enter a pack build.

### 3.1 Topic seeds

`seeds/topics.yaml` is the single source of topic diversity — generation prompts always take a seed, never invent topics freely (prevents topic collapse across a pack):

```yaml
- id: topic_urban_green_space
  domain: environment          # 12 domains: environment, education, technology, work,
                               # health, culture, travel, media, family, food, sport, science
  register: neutral            # neutral | academic | everyday
  formats: [speaking, task2, reading, listening]   # which content types may use it
  gt_suitable: true
  angle_hints:                 # optional nudges, ≤ 3
    - rooftop gardens in dense cities
    - who pays for public parks
```

Launch seed count: **120 topics** across the 12 domains (10 each, default). Rule: no two shipped items of the same kind share a seed unless `difficulty` differs.

### 3.2 Generation

`python -m tools.content gen --kind reading_test --seed topic_urban_green_space --band 7.0` renders the matching §4 template, calls the configured LLM (authoring uses a frontier model by policy — content quality is worth cloud tokens even though the *app* runs local; default: `claude-sonnet` class or better, flagged), and writes a `draft` item. Temperature 0.8 for passages/scripts/cards, 0.2 for question generation (accuracy-critical). Schema-invalid output is retried once with the validator errors appended; second failure discards the draft.

### 3.3 Automated validation

Run by `validate`, and again in pack-build and community CI. Per kind:

| Check | Applies to | Rule (defaults, flagged) |
|---|---|---|
| **Schema** | all | Pydantic/JSON-schema per 04 §5 / 05 §2 / 06 §3 / 07 §2; plus each module's invariants (question numbering 1–40 contiguous, `evidence_quote` substring-verified, cue-card bullet rules, listening voice roles). |
| **Blind answer-key agreement** | reading, listening | A *solver* LLM call (temperature 0, different prompt, answers stripped) sits the test cold. Its answers are normalized with the real scorer (the shared normalizer at `sidecar/bandready/scoring/answers.py`, variant-aware article rule per R2-9) and compared to the key. Pass: agreement ≥ 90% per passage/script (≥ 12/13 for a 13-question passage) AND every disagreement is human-adjudicated — adjudication may fix the key (typo) or the question (ambiguous), never auto-accept. TFNG "NOT GIVEN" disagreements are the expected hot spot; two solver runs on TFNG groups, both must agree. |
| **Blind solvability** | writing ac_task1 | Solver LLM is shown only the rendered chart-spec data and asked to state the 3 main features; a human confirms they match the author's intended key features. Catches unreadable/degenerate charts. |
| **Difficulty estimation** | reading, listening | Estimator LLM labels each question `band_target` (blind to the author's label); mean absolute disagreement > 1.0 band flags the item for review attention (advisory, not blocking). |
| **Lexical level** | reading passages, listening scripts | §3.4 wordfreq profile must fall in the target envelope. Blocking for reading, advisory for listening (dialogue is naturally more frequent-word). |
| **Listening lint** | listening | 07's rules: total rendered length 4–6 min at ≤ 160 wpm dialogue; ≥ 1 spelled-out proper noun in Parts 1–2; `pause_after_ms` present on narrator instruction lines; every question's `cue_line_index` valid; distractor-then-correction present for ≥ 2 answers. |
| **Speaking lint** | speaking | 04 §5 rules: cue card 3–4 bullets, last begins "and explain"; Part 3 shares topic lineage with Part 2; every P1/P3 question ends with "?". |
| **Duplication** | all | Jaccard 5-gram similarity vs all shipped items of the same kind; > 0.35 → reject as near-duplicate. |
| **Provenance sanity** | all | Item's `provenance` block (§8) present and complete. |

### 3.4 Lexical-level check (wordfreq)

Uses the `wordfreq` package's `zipf_frequency(token, 'en')` (Zipf scale: ~7 = "the", ~3 = 1-per-10M words). Procedure: tokenize, lowercase, drop punctuation/numbers, drop proper nouns (simple heuristic: capitalized mid-sentence), compute the Zipf distribution of remaining tokens. Envelope per passage difficulty (defaults, flagged — calibrate against our own approved passages once we have 10+):

| Passage difficulty | Median Zipf | % tokens with Zipf < 3.5 (rare) | Max % Zipf < 2.5 (very rare) |
|---|---|---|---|
| easy (band ≈ 5–6) | ≥ 4.6 | 2–5% | 1% |
| medium (band ≈ 6–7) | 4.3–4.8 | 4–8% | 2% |
| hard (band ≈ 7–8+) | 4.0–4.6 | 7–12% | 3% |

Out-of-envelope → validator error with the offending token list, so the reviewer can approve deliberate exceptions (`lexical_waiver: true` with a reason string).

### 3.5 Human review checklist (verbatim — rendered by `review` CLI, one item per screen)

```
BandReady content review — reviewer must be a different person than the item's author/generator-operator.
Official IELTS materials must NOT be open on your machine during this review.

ALL KINDS
[ ] Reads as natural English; no LLM tics ("delve", "tapestry", "it's worth noting").
[ ] Topic is culturally portable: no assumed nationality, religion-specific framing, or
    region-locked knowledge needed to answer.
[ ] No real living private individuals; public figures only in neutral factual contexts.
[ ] Invented proper nouns only (companies, towns, studies) — web-search any that sound real.
[ ] Nothing resembles a remembered real exam question ("this feels familiar" = escalate, don't approve).
[ ] Provenance block complete and truthful (§8).

READING
[ ] Solve the full passage yourself, cold, before looking at the key. Note your answers.
[ ] Every disagreement with the key resolved by editing question or key — no "close enough".
[ ] Each answer defensible from the evidence_quote alone; NOT GIVEN items are truly absent,
    not merely implied-false.
[ ] Distractors are plausible; no giveaway option lengths/patterns.

LISTENING
[ ] Full listen-through of the rendered WAV (not the script) at 1.0×.
[ ] Every answer clearly audible; spellings/numbers read at natural dictation pace.
[ ] Distractor-then-correction moments sound natural, not telegraphed.
[ ] Voices distinct enough to track who's speaking in multi-speaker parts.

SPEAKING
[ ] Every question answerable by an 18-year-old and a 45-year-old without embarrassment.
[ ] Part 2 card yields 2 minutes of talk from an ordinary life (no exotic-experience prerequisite).
[ ] Part 3 questions are genuinely abstract/discursive, not Part-1-style personal questions.

WRITING
[ ] ac_task1: chart renders correctly in ChartSvg; 2–4 clear main features exist; data is
    internally consistent (percentages sum, trends plausible).
[ ] task2/gt_task1: prompt is arguable from multiple positions; bullets (GT) are concrete.

VERDICT: approve | edit-and-reapprove | reject (reason logged to the item's review record)
```

## 4. Generation prompt templates (verbatim)

Stored under `tools/content/prompts/`. `{{double-brace}}` slots are filled by the CLI. All templates end with the same output contract line; JSON is parsed with a retry-on-invalid loop (§3.2).

### 4.1 Speaking topic set (`speaking_set.md`) — produces one 04 §5 `card_set` + its cards

```
You are writing original practice material for an IELTS-style speaking test simulator.
You must invent everything yourself: never reproduce, adapt, or approximate questions you
may have seen from real IELTS tests or preparation books.

Topic seed: {{seed.id}} — domain: {{seed.domain}}; angle hints: {{seed.angle_hints}}.
Difficulty: {{difficulty}} ("core" = accessible to band 5–6 candidates, "stretch" = band 7+).

Produce ONE linked topic set:

1. TWO Part 1 frames (everyday personal questions). Each frame: a short topic name and
   5 questions. Questions must be answerable in 2–4 sentences from ordinary personal
   experience, use simple direct grammar, and progress from concrete (habits, likes) to
   slightly reflective (comparisons, mild preferences). The first frame must relate to the
   seed domain; the second may be an adjacent everyday topic.

2. ONE Part 2 cue card on the seed topic. Format: an opening line "Describe ..." about a
   specific personal experience/thing/person/place, then exactly 3 or 4 bullet prompts.
   The final bullet MUST begin with "and explain". Bullets are noun/wh- phrases, not full
   questions. Add 2 "rounding_off" questions (short yes/no-ish follow-ups). The card must
   be doable by someone with a completely ordinary life.

3. ONE Part 3 card that generalizes the Part 2 topic. 2–3 themes; each theme has a title
   (lower-case gerund/noun phrase), 3 abstract discussion questions (about society, change
   over time, comparisons between groups, speculation about the future — never "you"), and
   one "counterpoint" (a defensible contrarian position the examiner can push, one clause).

Register: neutral spoken English. No brand names, no real small businesses, no questions
requiring specialist knowledge.

Return ONLY a JSON object, no markdown fence, with keys: "part1_frames" (array of 2:
{"topic": str, "questions": [str x5]}), "cue_card" ({"topic": str, "bullets": [str x3-4],
"rounding_off": [str x2]}), "part3" ({"themes": [{"title": str, "questions": [str x3],
"counterpoint": str} x2-3]}).
```

The CLI wraps the result into `speaking_card` / `card_set` documents (ids, tags from seed domain, difficulty) per 04 §5.

### 4.2 Academic Task 1: chart-spec + prompt (`ac_task1.md`) — produces a 05 §2.2 chart-spec

```
You are writing an original data-description writing task for an IELTS-style practice app.
Invent all data yourself. Use only invented place names, invented organization names, and
plausible round-ish numbers. Never reproduce a chart or scenario from real IELTS materials.

Topic seed: {{seed.id}} — domain: {{seed.domain}}. Chart kind: {{kind}}
(one of: bar, grouped_bar, stacked_bar, line, pie, table, process, map).
Difficulty: {{difficulty}} (1 = one clear trend, 2 = two series with a crossover or
exception, 3 = three-plus series or a two-chart-worth of data in one spec).

Requirements for the DATA:
- It must contain 2–4 genuinely describable "main features" (a biggest/smallest, a trend
  reversal, a convergence, a dominant category, a dramatic change) — list them.
- Numbers must be internally consistent (pie/stacked shares sum to 100; time series move
  plausibly; units stated). 4–6 categories, 1–{{max_series}} series, years if temporal.
- For kind=process: 5–8 steps, one optional branch. For kind=map: exactly 2 snapshots
  (e.g. "2005" and "present day") with 5–8 labelled features each on the 0–100 grid,
  where at least 3 features change between snapshots.

Requirements for the PROMPT TEXT: two sentences in this fixed frame — first sentence
states what the visual shows; second sentence is exactly: "Summarise the information by
selecting and reporting the main features, and make comparisons where relevant." Then the
standard constraint line: "Write at least 150 words."

Return ONLY a JSON object, no markdown fence, with keys:
"prompt_text": str,
"chart_spec": <object valid against the schema pasted below>,
"intended_main_features": [str, 2-4 items]   // used by the blind-solvability check, not shown to learners

CHART-SPEC JSON SCHEMA:
{{chart_spec_schema_json}}
```

### 4.3 Reading passage + 13 mixed questions (`reading_passage.md`) — produces one passage object per 06 §3

Authoring-pipeline variant of 06 §8's in-app generator (same schema, stricter constraints; run as ONE call here because a frontier authoring model handles it, unlike the in-app two-stage flow for local models — default, flagged).

```
You are writing an original academic reading test passage with questions for an IELTS-style
practice app. Everything must be invented or drawn from general knowledge and rewritten in
your own words. Never reproduce or adapt passages or questions from real IELTS tests or
preparation books. Invent the names of any researchers, studies, institutions, and projects
you cite — do not attribute claims to real people.

Topic seed: {{seed.id}} — domain: {{seed.domain}}; angle hints: {{seed.angle_hints}}.
Target difficulty: passage "{{difficulty}}", band_target {{band}}.

PASSAGE: 800–950 words, 6–8 paragraphs labelled A, B, C, … Each paragraph has ONE
controlling idea (required for matching_headings to work). Academic-neutral register,
varied sentence structure, concrete details and at least 4 specific figures/dates that can
anchor completion questions. No bullet lists, no headings inside the passage.

QUESTIONS: exactly 13, numbered {{q_start}}–{{q_start + 12}}, in 3 groups drawn from this
plan: {{group_plan}}   // e.g. "matching_headings x5, tfng x4, sentence_completion x4"
Rules:
- TFNG: statements checkable as facts against the passage; FALSE must CONTRADICT the
  passage, not merely be absent; exactly {{n_ng}} statements are NOT GIVEN, and those must
  be plausible-sounding but genuinely unaddressed.
- Completion types: answers are verbatim contiguous words from the passage, within the
  stated word limit; gaps target content words, never grammar words.
- matching_headings: one heading per paragraph in the group's range plus 2 distractor
  headings; headings paraphrase controlling ideas, never reuse 4+ consecutive passage words.
- Every question includes: answers (with US/UK spelling and natural singular/plural
  variants), anchor_paragraphs, a verbatim evidence_quote copied exactly from the passage,
  a 1–2 sentence explanation, a trap_note where a distractor is deliberate (else null),
  difficulty (easy|medium|hard), band_target.

Return ONLY a JSON object, no markdown fence: a single "passage" object valid against the
schema pasted below (fields: id, position, title, topic, word_count, difficulty,
gt_section: null, texts, question_groups).

PASSAGE JSON SCHEMA:
{{reading_passage_schema_json}}
```

### 4.4 Listening Part 3 script, 4 speakers (`listening_part3.md`) — produces one 07 §2 script

```
You are scripting an original Part-3-style listening dialogue for an IELTS-style practice
app: an academic discussion between students and a tutor. Invent everything — course
names, project titles, article authors. Never adapt dialogues from real IELTS recordings.

Topic seed: {{seed.id}} — domain: {{seed.domain}}. Questions {{q_start}}–{{q_start + 9}}
(10 questions). Question plan: {{q_plan}}   // default: multiple_choice x6, matching x4

SPEAKERS (exactly these 4, using these ids):
  narrator (role "narrator") — instructions and question-time framing only, never in the discussion
  s1 (role "female_1") — the tutor, guides and probes
  s2 (role "male_1")  — student A
  s3 (role "female_2") — student B
Students must be easy to tell apart by manner: give one a distinct verbal habit (e.g.
hedging: "I suppose…") and the other a different one (e.g. enthusiasm: "actually, that's
the interesting bit"). The tutor speaks least.

STRUCTURE:
1. narrator line introducing the scene and "you have some time to look at questions
   {{q_start}} to {{q_start+4}}" with pause_after_ms 30000.
2. Discussion covering the first 5 answers in question order.
3. narrator mid-break line for the remaining questions, pause_after_ms 20000.
4. Discussion covering the last 5 answers in question order.
5. narrator closing line, pause_after_ms 1000.

DIALOGUE RULES:
- 700–850 dialogue words total (≈ 4.5–5.5 minutes rendered); turns of 1–3 sentences;
  natural fillers ("well,", "right,", "hmm,") roughly every 4th turn; pause_after_ms
  200–400 on ordinary turns.
- Every answer is stated by a SPEAKER IN THE DISCUSSION (never the narrator) and each
  question's answer is attributable to one cue line.
- Include at least 3 distractor-then-correction moments: a speaker proposes a wrong
  option and is corrected ("I'd say the survey— " / "Actually no, we agreed the
  interviews came first.").
- For matching questions, the matched items must be discussed in question order, but not
  back-to-back-listy — weave them into the conversation.
- Multiple-choice options paraphrase the audio; the correct option must NOT share a
  distinctive content word with the cue line (anti-word-spotting rule).

Return ONLY a JSON object, no markdown fence, valid against the schema pasted below:
fields: schema_version, part: 3, title, accent: "{{accent}}", speakers (the 4 above with
voice: null so role×accent casting applies), lines (each {speaker, text, pause_after_ms}),
questions (10 items, each with number, type, prompt, options where applicable, answers,
cue_line_index, explanation).

SCRIPT JSON SCHEMA:
{{listening_script_schema_json}}
```

## 5. Content roadmap through v1.x & effort plan

This table is the **content roadmap through v1.x** (relabelled per R2-13) — it is NOT the v1.0 launch gate. **The v1.0 content gate is explicitly 16-roadmap.md §9.1's cadence numbers** (20 speaking sets, 40 writing prompts, 4 reading tests, 2 listening tests, the P3.5 GT items, vocab decks, plus the placement pack below, which 16 P4 lists as a v1.0 deliverable); v1.0 ships against those, and the bank grows to this table's figures across the v1.x releases. The figures here still supersede the earlier per-module working figures (04 §5's "30 P1 frames / 40 cue cards" and 05 §2's "~40 prompts per task type" — 04/05 to sync to this table).

| Kind | Launch target | Composition |
|---|---|---|
| Speaking topic sets | **60 sets** | 60 `card_set`s = 120 P1 frames, 60 cue cards, 60 P3 cards; ≥ 40 core / ≤ 20 stretch; all 12 domains covered ≥ 4× |
| Writing prompts | **80 per task type = 240** | ac_task1: 80 across all 8 chart kinds (≥ 6 each, incl. 8 process + 6 map); gt_task1: 80 across formal/semi-formal/informal ≥ 20 each; task2: 80 across the 5 essay types |
| Reading | **24 passages = 8 full tests** | 6 Academic tests (18 passages) + 2 GT tests (6 section-records) — GT depth pending 00-vision.md open Q3; ≥ 6 question types per test, all 14 types used ≥ 4× pack-wide |
| Listening | **16 scripts = 4 full tests** | 4 × Parts 1–4; accents per 07 defaults (us/uk mix); default pack ships pre-rendered WAVs (07 §first-run) |
| Vocabulary | **2 000 entries** | 08-vocabulary-srs.md schema; distribution by Zipf band: 600 @ 4.0–4.5, 900 @ 3.3–4.0, 500 @ 2.8–3.3; every entry has definition, example sentence (original), collocations, CEFR tag |
| Placement pack (R2-22 — **v1.0 deliverable**, 16 P4) | **2 reading pairs + 2 listening samplers + 4 writing tasks + 4 speaking minis** | 2 same-family reading passage pairs (each pair = a band-5–6 and a band-7–8 version of the same passage family, 8-question samplers per 10 §3's adaptive flow); 2 listening samplers; 4 short writing tasks (2 per variant, Academic/GT); 4 speaking Part 1 topic minis |

Effort model (defaults, flagged — recalibrate after the first 10 items of each kind):

| Kind | Gen+validate (operator min/item) | Human review min/item | Items | Total hours |
|---|---|---|---|---|
| Speaking set | 5 | 20 | 60 | 25 |
| ac_task1 prompt | 8 | 12 | 80 | 27 |
| gt_task1 / task2 prompt | 3 | 6 | 160 | 24 |
| Reading passage (solve-cold included) | 10 | 50 | 24 | 24 |
| Listening script (full listen incl.) | 10 | 50 | 16 | 16 |
| Vocab entry (batched ×100, 10% deep-review) | 0.2 | 0.4 | 2000 | 20 |
| Placement pack (mixed kinds, sampler-sized items) | — | — | 12 items | ≈ 8 (flagged estimate) |
| **Total** | | | | **≈ 144 h** |

Plan to hit it: 2 reviewers (maintainer + 1 recruited contributor), author/reviewer separation per §3.5. **The second reviewer is post-v1.0 unless recruited earlier (R2-13)** — until one materializes, review is maintainer-only and paces only the smaller v1.0 gate (16 §9.1); the ≈ 144 h figure is the v1.x total for this table with two reviewers. Week 1 = calibration: both reviewers review the same 5 items per kind, reconcile disagreements, tighten the checklist. Weeks 2–7 at ~12 reviewer-h/week each. Generation is front-loaded (a weekend of CLI runs); the schedule is review-bound. Rejection allowance baked in: generate 1.4× the target counts (LLM cost ≈ negligible vs review time). Tracking: a GitHub Project board in the content repo, one card per item, columns = pipeline stages.

## 6. Content-pack format (canonical spec: 11-data-model.md §11 — R2-8 merged format)

The pack format is owned end-to-end by **11-data-model.md §11**, which specs the R2-8 merged format: a **`.brpack`** archive (plain zip inside), a **reverse-DNS pack id** (e.g. `org.bandready.core`), `manifest.json` at the root, all JSONL under **`data/`** (`topics.jsonl`, `card_sets.jsonl`, `speaking_cards.jsonl`, `writing_prompts.jsonl`, `reading_passages.jsonl`, `reading_tests.jsonl`, `listening_scripts.jsonl`, `listening_tests.jsonl`, `vocab.jsonl`), and `media/` for pre-rendered audio (+ `.timing.json`) and diagram-labelling images. This doc's earlier plain-zip/dirname-id format is repealed; its manifest keys survived the merge — `manifest_version`, `id`, `publisher`, `checksums`, `disclaimer`, `ai_disclosure`, `built_with` are all mandatory in 11 §11.2's manifest, and `card_sets.jsonl` + `vocab.jsonl` are part of the canonical `data/` layout. The full manifest example lives in 11 §11.2 (the `disclaimer` wording rule stays §1.1's; the `ai_disclosure` value rule stays §8's).

**Import** is 11 §11.3's typed-table upsert: verify every checksum → validate every JSONL row (Pydantic schemas + the no-LLM §3.3 validators) → in one transaction, upsert rows by their stable authored `id` into the **typed tables** (`topics`, `card_sets`, `speaking_cards`, `writing_prompts`, `reading_passages` with derived `reading_questions`, `reading_tests`, `listening_scripts` with derived `listening_questions`, `listening_tests`, `vocab_pack_entries`). There is **no `content_items` step** — that table was 06's sketch, replaced by 11 §3's typed tables; this doc's earlier "upsert into `content_items` keyed `(pack_id, item_id)`" instruction is repealed (R2-8).

Authoring-side rules this doc still owns (referenced by 11 §11.2):

- Pack `license` is the default for every item; an individual item may carry `"license": "CC-BY-4.0", "attribution": "…"` to override (needed for mixed community packs).
- `version` is semver — content edits bump patch, additions bump minor, schema/id changes bump major.
- A pack that fails any blocking validator is rejected whole (partial imports create un-debuggable states).
- No signing in v1 (local-first, user-initiated side-loading; default, flagged).
- `locale_hint` stays reserved and unvalidated in v1 (§9).

## 7. Community contribution workflow

- **Packs are separate git repos**, one pack per repo, never PRs into the app repo (keeps app CI fast and licensing untangled). We publish `bandready-pack-template` containing: the 11 §11.1 `.brpack` layout, `topics.yaml` stub, a GitHub Actions workflow, `CONTRIBUTING.md` embedding §3.5's checklist and §1's legal rules.
- **Validation CI** (in the template): `pip install bandready-content && bandready-content validate .` (the thin PyPI re-export of the `bandready.content` validators, §3 — same checks the sidecar enforces at import) runs every §3.3 check that needs no LLM key on every push; blind-agreement and difficulty-estimation run when the repo sets an `OPENAI_COMPAT_*` secret, else CI passes with a `needs-llm-checks` warning label that the app's import step will still enforce locally.
- **Quality bar for a "listed" pack** (linked from the app repo's README pack list — the only registry in v1 per 00-vision.md): all blocking validators pass including blind-agreement; manifest complete with license from the §2.2 allowlist and truthful `ai_disclosure`; a signed-off statement in the repo README: "This pack contains no material copied or adapted from official IELTS tests or preparation materials." Maintainers spot-review 3 random items before listing and on major-version bumps.
- Contributor licensing: by publishing a pack, the publisher licenses it under the manifest license; no CLA (packs never enter our repo). Content PRs *to first-party packs* require the contributor to agree to CC0 dedication (stated in that repo's CONTRIBUTING.md).

## 8. AI-generated-content disclosure policy

Every content item carries a provenance block (validated by §3.3):

```json
"provenance": {
  "method": "ai_assisted",              // "human" | "ai_assisted" (AI draft + human review/edit)
                                        // | "ai_generated" (validated but not human-reviewed)
  "model": "claude-sonnet-4-…",        // generation model id, null when method=human
  "generated_at": "2026-07-25",
  "reviewed_by": "gh:someuser",         // GitHub handle or "unreviewed"
  "review_date": "2026-07-28"
}
```

Policy: (a) first-party shipped packs contain only `human` or `ai_assisted` items — `ai_generated` is allowed only for in-app on-demand generation (06 §8, 05 §2 generator), which the UI already labels; (b) pack-level `ai_disclosure` in the manifest = the "strongest" method present (`ai_generated` > `ai_assisted` > `human`); (c) the app's content manager shows the pack's disclosure and the About screen states: "Practice materials in BandReady are drafted with AI assistance and reviewed by humans; items generated on your device by your configured model are labelled as such." (d) We never present AI-drafted content as human-authored — this is both an honesty norm and forward-compat with AI-labelling regulation (EU AI Act transparency obligations are phasing in; a truthful provenance field is cheap insurance).

Related privacy note (00-vision.md open Q2 lands here): the opt-in "share anonymized progress stats" action, if shipped, sends ONLY aggregate per-skill band estimates and item-difficulty outcomes (no text, no audio, no transcripts, no identifiers beyond a random install UUID regenerated on demand), off by default, one-shot per explicit click (no background telemetry), payload previewed to the user before send. Full mechanism spec belongs to 14-testing-strategy.md's calibration section if adopted.

## 9. Per-locale / accent variants (future)

Noted, not in v1: (a) listening accent packs — 07's role×accent voice map already makes scripts accent-portable; true Australian voices wait on TTS engine support (07 §3); (b) L1-targeted vocab packs (e.g. false-friends lists for specific first languages) — the pack format supports them today via `data/vocab.jsonl` + manifest `"locale_hint"` field (reserved, unvalidated in v1); (c) UI-language localization of instructions inside content (the disclaimer localization rule in §1.1 applies). No schema changes required now; reserve `locale_hint` in the manifest so v1 apps ignore it gracefully.

## Open questions

1. **Trademark clearance for "BandReady"** remains open in 00-vision.md (WIPO/USPTO/UKIPO classes 9 & 41); this doc's rules assume the name clears.
2. **GT depth at launch** (00-vision.md Q3): the 8-test reading split above assumes 6 Academic + 2 GT — if the roadmap picks "Academic-complete first", the 2 GT tests move to v1.1 and the review-hours drop by ~6 h.
3. **Diagram-labelling assets** (06 open Q1): does the first-party pack ship a small library of pre-made labelable SVGs (and how many), or is `diagram_labelling` bundled-content-only at launch? Blocks the final `media/images/` list.
4. **Blind-agreement solver model**: same frontier model as the generator (cheap, but correlated errors) vs a second, different-family model (better independence, more setup)? Default in §3.3 assumes "different prompt, same model is acceptable" — needs an empirical check on the first 5 reading tests.
5. **wordfreq envelope calibration**: §3.4 thresholds are educated defaults; lock them only after profiling the first ~10 approved passages against reviewer difficulty judgments.
