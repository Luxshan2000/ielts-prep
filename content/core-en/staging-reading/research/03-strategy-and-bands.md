# R-R3 — Strategy and Bands: how IELTS-style Reading is actually scored, and what actually raises the band

Research briefing for BandReady **reading**-content authors.
Compiled 2026-07-27. Consumers: the reading design agent (schema owner), the Academic and General
Training passage/question authoring agents, the drill-content agent, the verify/merge agent, and
the coaching copy in `docs/plan/06-reading-module.md` §§4–8.

Companions: `content/core-en/staging/research/03-bands-and-errors.md` (speaking) and
`content/core-en/staging-writing/research/03-bands-and-errors.md` (writing). **Do not port their
shape.** Speaking and Writing are productive skills marked against four descriptor criteria, so
their teaching payload is band-graded model answers. Reading is receptive and marked by a key: the
learner produces nothing that can be graded. Everything below is therefore organised around the
four things that actually decide a reading raw score — **locating**, **paraphrase recognition**,
**trap resistance**, and **answer-form discipline** — plus the clock that governs all four.

> **Copyright note for anyone reading or extending this file.** Everything below is either (a) a
> statement of fact about how the test works, (b) our own clean-room description of publicly
> published scoring mechanics, or (c) original teaching material authored for BandReady. **No
> passage, question, option, answer key or explanation from any past paper, textbook, practice site
> or preparation blog is reproduced anywhere in this file.** Every example sentence, paraphrase
> pair, trap illustration and worked pattern below was written from scratch for BandReady and may
> be reused freely inside the pack. If you extend this file, keep that rule: if you can remember
> reading a sentence somewhere, throw it away and write a different one about the same thing. Our
> product copy says **"IELTS-style"** and carries the non-affiliation notice.

---

## 0. TL;DR for authors — the fourteen things worth teaching

Ordered by band movement bought per hour of learner effort. If a per-question teaching note has
room for one point, it should come from this list.

1. **Reading is paraphrase recognition, not reading.** The passage and the question almost never
   share their content words. The whole test is: can you tell that two differently-worded
   propositions are the same proposition? Teach the rewording devices explicitly (§4).
2. **Locate first, verify second — and never skip the verify.** The commonest band-6 behaviour is
   finding the right region and then answering from the region rather than from the sentence.
   Every explanation we author should show the *verification sentence*, not just the region.
3. **"Not Given" means the passage does not say. It does not mean you can't find it.** The single
   highest-loss confusion in the paper (§6.1). FALSE requires an actual contradiction in the text.
4. **The clock is the second examiner.** 60 minutes, 40 questions, **no transfer time at all**
   (unlike Listening). ~90 seconds per question, all-in, including reading the passage (§3).
5. **Never leave a blank.** No negative marking, no partial credit, every question worth exactly
   1 mark whatever its type or difficulty. An unanswered question is a guaranteed zero; a guess on
   a 3-option TFNG is a free 33%.
6. **Answer-form discipline is worth 2–4 raw marks to almost everyone.** Over the word limit =
   wrong even when the content is right. Misspelt = wrong. Wrong plural = wrong. These are marks
   lost by candidates who understood the text perfectly (§7.5–§7.7).
7. **Question order is a tool.** Groups whose answers run in passage order act as a ratchet — each
   answer bounds the search zone for the next. Whole-passage tasks (matching information, matching
   headings) are cheapest once the paragraph map exists (§5.4).
8. **Build a paragraph map in the first two minutes, then stop skimming.** Two to four words per
   paragraph. That map is what turns every later question from a passage search into a
   one-paragraph search (§5.3).
9. **Careful reading is a scalpel, not a mode.** Deploy it inside the located zone — typically two
   to four sentences — and nowhere else. The arithmetic of careful-reading 2,500 words is in §3.4.
10. **Distractors are engineered, and the engineering repeats.** Same-keyword-wrong-relation,
    right-fact-wrong-paragraph, quantifier shift, modality shift, attribution shift. Name the trap
    in the teaching note so the learner can recognise the *type*, not the instance (§6).
11. **Quantifiers, hedges and comparatives decide more marks than topic vocabulary.** `some / most
    / all / only / few`, `may / tends to / is likely to`, `more than / no greater than`. About 200
    closed-class items; they are the hinge of nearly every TFNG (§6.2, §8.3).
12. **Yes/No/Not Given is about the writer's position, not about the world.** If a claim is
    attributed to a named researcher and the writer does not endorse it, the writer's view on it is
    NOT GIVEN (§6.1 trap T8).
13. **Vocabulary raises the ceiling, not the floor.** Below roughly 95% lexical coverage of the
    text, locating still works but verification collapses — and verification is where the marks
    are. Coverage research and what to actually study in §8.
14. **The band-6 → band-8 gap is about 11 questions on Academic — roughly 3–4 per passage.** It is
    not a different kind of reader; it is the same reader who stopped losing marks in five
    identifiable places (§9).

---

## 1. Marking mechanics — facts, freely usable

All of this is published operational fact about the exam and is safe to state, implement and teach.

- **40 questions** in the Reading test, Academic and General Training alike.
- **Each correct answer receives exactly 1 mark.** No question is worth more than another. A
  matching-headings item and a one-word gap fill are worth the same. ([ielts.org — scoring in
  detail](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail); [ielts.org —
  Academic Reading format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading))
- **No half marks exist at the item level.** The raw score is an integer 0–40. Half-*bands* exist,
  but they come out of the conversion table, never out of an item.
- **No negative marking.** A wrong answer costs nothing beyond the mark you did not get, so a blank
  is strictly dominated by a guess. IDP's own guidance says to answer every question and make an
  educated guess. ([IDP — manage time in IELTS
  Reading](https://ielts.idp.com/prepare/article-manage-time-in-ielts-reading))
- **No partial credit.** A two-word gap with one word right scores 0. A "choose TWO letters" item
  where one of the two is right scores 1 out of 2 only because the item occupies two *numbers* —
  the set is scored per number, not per item.
- **Spelling must be correct.** Misspelt answers in Reading and Listening are marked wrong. There
  is no edit-distance tolerance and no examiner discretion. ([ielts.org — Academic Reading
  format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading);
  [IDP — common spelling
  mistakes](https://ielts.idp.com/canada/prepare/article-ielts-common-spelling-mistakes))
- **Word limits are hard.** "NO MORE THAN TWO WORDS AND/OR A NUMBER" means the mark is lost for
  writing three, even if the extra word is an article and the content is right.
- **60 minutes, and the transfer happens inside it.** ielts.org states plainly that answers must be
  transferred during the hour given for Reading and that, unlike the Listening test, **no extra
  transfer time is given.** This is the single most under-taught operational fact in the paper.
- **Academic and GT are reported on the same 9-band scale**, but the raw→band conversions differ,
  because GT texts are easier; a GT candidate needs more correct answers for the same band.
- **The exact thresholds vary slightly between test versions.** ielts.org says so explicitly. Our
  tables are therefore *indicative*, and every band we display must carry that caveat.

### 1.1 Text and structure facts we author against

| | Academic | General Training |
|---|---|---|
| Texts | 3 long passages | Section 1: 2–3 short everyday texts; Section 2: 2 workplace texts; Section 3: 1 long text |
| Total length | 2,150–2,750 words across the paper | comparable total, front-loaded with short texts |
| Sources (style) | books, journals, magazines, newspapers, online — written for a **non-specialist** audience | notices, advertisements, timetables, handbooks, job descriptions, contracts, training material, general-interest articles |
| Section 3 style (GT) | — | descriptive and instructive |
| Difficulty curve | increases across the three passages | increases across the three sections |

Sources: [ielts.org — Academic Reading
format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading);
[ielts.org — General Training Reading
format](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading).

**Authoring consequence:** "written for a non-specialist audience" is a hard constraint on our
Academic passages. A passage that requires domain knowledge to follow is not exam-realistic, and it
also breaks the NOT-GIVEN construct (a candidate who knows the field will answer from knowledge).
Every technical term must be either glossed in-text or fully inferable from its sentence.

---

## 2. Raw score → band, as data

Two tables. Reported bands are whole and half bands only.

### 2.1 Academic Reading

| Raw (out of 40) | Band |
|---|---|
| 39–40 | 9.0 |
| 37–38 | 8.5 |
| 35–36 | 8.0 |
| 33–34 | 7.5 |
| 30–32 | 7.0 |
| 27–29 | 6.5 |
| 23–26 | 6.0 |
| 19–22 | 5.5 |
| 15–18 | 5.0 |
| 13–14 | 4.5 |
| 10–12 | 4.0 |
| 8–9 | 3.5 |
| 6–7 | 3.0 |
| 4–5 | 2.5 |
| 3 | 2.0 |
| 2 | 1.5 |
| 1 | 1.0 |
| 0 | 0 |

### 2.2 General Training Reading

| Raw (out of 40) | Band |
|---|---|
| 40 | 9.0 |
| 39 | 8.5 |
| 37–38 | 8.0 |
| 36 | 7.5 |
| 34–35 | 7.0 |
| 32–33 | 6.5 |
| 30–31 | 6.0 |
| 27–29 | 5.5 |
| 23–26 | 5.0 |
| 19–22 | 4.5 |
| 15–18 | 4.0 |
| 12–14 | 3.5 |
| 9–11 | 3.0 |
| 6–8 | 2.5 |
| 0–5 | ≤2.0 |

Table source, cross-checked: [TypoGrammar — reading raw score to band
conversion](https://typogrammar.com/ielts/reading-raw-score-to-band-conversion/), corroborated
against the anchor thresholds published by [ielts.org — scoring in
detail](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) and
[ieltsidpindia.com — reading band scores](https://ieltsidpindia.com/information/ielts-band-scores/reading).

### 2.3 Cross-check against the official anchor thresholds

ielts.org publishes only four anchor points per format. Our tables must contain them.

| Anchor (ielts.org) | Academic | our table | GT | our table |
|---|---|---|---|---|
| Band 4 | — | — | 15 marks | 15–18 → 4.0 ✅ |
| Band 5 | 15 marks | 15–18 → 5.0 ✅ | 23 marks | 23–26 → 5.0 ✅ |
| Band 6 | 23 marks | 23–26 → 6.0 ✅ | 30 marks | 30–31 → 6.0 ✅ |
| Band 7 | 30 marks | 30–32 → 7.0 ✅ | 35 marks | 34–**35** → 7.0 ⚠️ |
| Band 8 | 35 marks | 35–36 → 8.0 ✅ | — | — |

⚠️ **One discrepancy to record.** The official indicative GT anchor for band 7 is 35 marks; the
widely-circulated table (and our implementation) grants band 7 at 34. This is inside the "varies
slightly between test versions" tolerance ielts.org states, and 34 is the more commonly published
boundary in preparation material. **Recommendation: keep 34, keep the disclaimer.** But note it, so
we never claim our conversion is authoritative.

### 2.4 Check against our implementation

Our tables live inline in `sidecar/bandready/server/routes/reading.py` as `ACADEMIC_BAND_TABLE` and
`GT_BAND_TABLE`, consumed by `raw_to_band(raw, fmt)`. Verified 2026-07-27: **both tables match
§2.1/§2.2 exactly from band 2.5 upward.** Two observations for whoever owns that file (this is a
report, not an edit — the file is outside reading-content ownership):

1. **Sub-2.5 collapse.** Both implemented tables end `(0, 3, 2.0)` / `(0, 5, 2.0)`, so an Academic
   raw of 1 reports band 2.0 where the published table gives 1.0. This only matters for near-zero
   attempts, but a learner who answers one question right and is told "band 2.0" is being told
   something false. Low priority, trivially fixable.
2. **`scaled_raw()` projects short attempts onto 40.** A 13-question single-passage practice run is
   multiplied up before conversion. That is a reasonable UX device but it is **not** an IELTS
   conversion, and its variance is large: on 13 questions, one extra correct answer moves the
   projected raw by 3. The band shown after single-passage practice must be labelled as an estimate
   from a short sample, more loudly than the full-test disclaimer. Prefer showing raw + percentage
   as primary and the projected band as secondary.

### 2.5 What the tables mean pedagogically — teach this

- **The middle is crowded and the top is a cliff.** On Academic, 23→26 is all one band (6.0); a
  learner can gain three questions and see no movement. But 30→33 crosses two half-bands. Learners
  who "plateau at 6.0" are often improving invisibly inside a four-mark band. **Our progress UI
  should show raw score as the primary metric and band as secondary**, precisely because raw score
  moves when the band does not.
- **GT punishes carelessness far more.** At the top, GT bands are one or two marks wide: 40 = 9.0,
  39 = 8.5, 37–38 = 8.0. A single misspelt one-word answer in an easy Section 1 notice costs half a
  band. This is why GT teaching payload must weight **answer-form discipline** (§7.5–§7.7) much
  more heavily than Academic payload does, and why our GT Section 1/2 items should carry explicit
  spelling/plural/word-limit warnings even though the texts are easy.
- **Useful conversions for goal-setting:**
  - Academic 6.0 → 7.0 = **7 more questions** (23 → 30), about 2–3 per passage.
  - Academic 6.0 → 8.0 = **12 more questions** (23 → 35), about 4 per passage.
  - Academic 6.5 → 7.0 = **3 more questions**. One recovered TFNG group can do it.
  - GT 6.0 → 7.0 = **4 more questions** (30 → 34).
  - Academic band 8 tolerates **5 wrong out of 40**. Band 9 tolerates **1**.

---

## 3. Time discipline

### 3.1 The hard facts

- 60 minutes. 40 questions. 3 passages/sections.
- **No transfer time.** ielts.org: answers must be transferred during the hour; unlike Listening,
  no extra transfer time is given. On paper, that means writing on the answer sheet as you go —
  writing in the question booklet and "copying up at the end" is how candidates lose whole question
  groups. On computer-delivered, the typed answer *is* the answer sheet and this risk disappears,
  which is a real and under-stated advantage of the computer mode.
- Average budget: **90 seconds per question**, and that 90 seconds must also pay for reading the
  passage. There is no separate reading time anywhere in the paper.

### 3.2 Per-passage budgets teachers actually recommend

Two positions, both defensible:

- **Flat 20 / 20 / 20.** IDP's own advice is to spend no more than 20 minutes on each part.
  Virtue: simple, self-checking, needs one wall-clock glance per passage.
- **Graduated, front-loaded saving.** Widely taught: finish passage 1 fast because it is the
  easiest, and bank the surplus for passage 3, which is the hardest and carries the same 13–14
  marks. Typical shapes: 15 / 20 / 25, or 17 / 20 / 23.

**Our recommendation (state it as ours, with the reasoning):**

| | Academic | General Training |
|---|---|---|
| Passage/Section 1 | 16 min | 15 min (Section 1 — short texts, easiest marks, highest carelessness risk) |
| Passage/Section 2 | 20 min | 18 min (Section 2 — workplace texts) |
| Passage/Section 3 | 22 min | 25 min (Section 3 — the one long text) |
| Reserve | 2 min | 2 min |

The reserve is not for "checking answers" in the vague sense. It is for one specific pass: **sweep
the answer sheet / question palette for blanks and for over-limit answers.** That pass is worth
more than re-thinking any single question, because it recovers guaranteed zeros.

Rationale for front-loading the save rather than splitting evenly: every passage carries roughly
the same number of marks but not the same cost per mark. Passage 1 marks are cheap; passage 3 marks
are expensive. Spending equal time on unequal costs leaves the expensive marks underfunded. On GT
the shape inverts at the front — Section 1 is *very* cheap, so it should be finished in 15 minutes
or less, but it must not be rushed to the point of answer-form errors, which is exactly where GT
candidates bleed (§2.5).

### 3.3 Falling behind — the protocol to teach

A protocol, not advice. Learners need something executable under pressure.

1. **Set two checkpoints, not a running clock.** At **20:00 elapsed** you should be starting
   passage 2. At **40:00 elapsed** you should be starting passage 3 (Academic; on GT, 15:00 and
   33:00). Glancing at the clock more often than this costs time and raises anxiety without
   changing behaviour.
2. **The two-minute rule.** No single question gets more than two minutes. At two minutes: enter
   your current best guess, flag it, move on. A flagged guess is a mark you might get; a blank
   after four minutes of staring is a mark you definitely did not get plus three lost minutes.
3. **If you hit a checkpoint late, do not "catch up by reading faster".** Reading faster degrades
   accuracy across everything. Instead, **change what you attempt**: move immediately to the next
   passage, and in that passage do the *localising* groups first (completion, TFNG/YNNG, MCQ —
   §5.4) and leave the whole-passage groups (matching information, matching headings) to whatever
   is left, guessing them from the paragraph map if necessary.
4. **At 55:00, stop answering and start sweeping.** Fill every blank in the palette with a
   plausible guess. On letter types, guess a letter not yet used in a no-reuse group; on TFNG,
   guess the option you have used least in that group. This is not superstition — it is a weak but
   free prior, and the alternative is a certain zero.
5. **Never abandon a whole passage.** Passage 3 marks are worth the same as passage 1 marks. A
   candidate who spends 35 minutes on passages 1–2 and 25 on passage 3 will outscore one who spends
   45 and 15, even though the first two passages are easier.

**Product hook:** BandReady should surface these as *live* checkpoints, not post-hoc analytics —
a soft marker in the timer bar at the 20/40-minute lines and a "you are N minutes behind pace" hint
in practice mode (never in exam-conditions mode). Post-attempt, the per-question `time_ms` we
already record makes the two-minute rule auditable: report "you spent over 2 minutes on 5
questions, and got 1 of them right — that cost you roughly 8 minutes and 4 marks elsewhere."

### 3.4 The arithmetic that justifies not reading everything carefully

Teach this as a calculation the learner does once and never forgets.

The paper holds 2,150–2,750 words. A competent L2 reader reading *carefully* — for full
propositional comprehension, which is what "reading the passage properly first" means — runs
roughly 100–150 words per minute on unfamiliar academic prose. At 125 wpm, 2,500 words is **20
minutes**, and that is before a single question has been looked at, before any re-reading, and
before any answer is written. It leaves ~40 minutes for 40 questions, each of which will still
require returning to the text.

That is the whole argument. It is not that careful reading is bad — it is that careful reading is
too expensive to spend on 100% of the text when perhaps 25% of the text carries answers. Careful
reading is what you do **in the located zone**.

(The 100–150 wpm figure is our own working estimate for L2 careful reading of unfamiliar academic
prose, used to make the arithmetic concrete; treat it as an order-of-magnitude teaching device, not
a cited constant. The conclusion is robust to any plausible value: even at 200 wpm the full-careful
strategy consumes a fifth of the paper before answering anything.)

---

## 4. The core skill: paraphrase recognition

**The claim, stated flatly:** an IELTS-style reading question is a proposition rewritten so that it
shares as little surface form with the passage as the item writer can manage while preserving (or
deliberately not preserving) meaning. The candidate's job is to decide whether question-proposition
and text-proposition are the same proposition. Everything else — skimming, scanning, time
management — exists to get the candidate to the right two sentences fast enough to do that job.

This is why keyword hunting caps out around band 6. Keyword hunting finds the *region*; it cannot
decide the *relation*. And the relation is what is marked.

### 4.1 The rewording device taxonomy

Twelve devices. Item writers combine two or three per question. Authors should be able to name
which devices they used in each item, and the teaching note should name them back to the learner.

| # | Device | What changes | Typical effect on the candidate |
|---|---|---|---|
| D1 | **Lexical synonym** | one content word swapped | mild; the workhorse device |
| D2 | **Superordinate / generalisation** | specific → category (`larch and spruce` → `conifers`) | learner scans for the specific word and never finds it |
| D3 | **Specification / hyponym** | category → instance | learner scans for the category word and never finds it |
| D4 | **Nominalisation** | verb/adjective → noun (`the ice retreated` → `the retreat of the ice`) | breaks part-of-speech-based scanning |
| D5 | **Verbalisation** | noun → verb (`a reduction in cost` → `costs fell`) | same, reversed |
| D6 | **Voice change (± agent deletion)** | active ↔ passive; the *by*-phrase often disappears | agent deletion is a NOT GIVEN factory — the text may simply not say who did it |
| D7 | **Converse / perspective flip** | `A supplied B to C` ↔ `C obtained B from A`; `X exceeds Y` ↔ `Y falls short of X` | learner reverses the relation and answers FALSE |
| D8 | **Negation of the antonym** | `few adopted it` ↔ `it was not widely adopted`; `remained` ↔ `did not leave` | double-negative processing load; high error rate under time pressure |
| D9 | **Compression / expansion** | multiword ↔ single word (`people who move from rural areas to cities` ↔ `urban migrants`) | the answer's length changes, breaking word-limit expectations |
| D10 | **Clause restructuring** | relative clause → participle → separate sentence; cause expressed as `because` / `owing to` / `led to` / `resulted from` | the proposition is split across sentence boundaries |
| D11 | **Quantifier / scope shift** | `some` ↔ `most` ↔ `all` ↔ `only`; `in one region` ↔ `everywhere` | **not a paraphrase — a trap.** See §6.2 |
| D12 | **Modality / evidentiality shift** | `may reduce` ↔ `reduces`; `suggests` ↔ `demonstrates`; `is thought to` ↔ `is` | **not a paraphrase — a trap.** See §6.2 |

D1–D10 are *meaning-preserving* and produce TRUE/YES answers and correct completions. **D11 and
D12 are meaning-changing and produce FALSE/NO answers.** Teaching the learner to sort a rewording
into "preserving" vs "changing" is, more or less, teaching TFNG.

### 4.2 Worked patterns

Ten original worked pairs. Authors: this is the format the per-question `explanation` should
follow — passage span, question span, device names, verdict. All sentences below are invented for
this document.

> **P1 — D1 + D4 (synonym + nominalisation).**
> Text: *Rainfall in the valley declined sharply after 1960.*
> Question: *There was a marked reduction in valley precipitation in the second half of the century.*
> `declined sharply` → `a marked reduction` (verb+adverb nominalised to noun+adjective);
> `rainfall` → `precipitation` (D1). Meaning preserved → **TRUE**.

> **P2 — D6 with agent deletion (the NOT GIVEN factory).**
> Text: *The embankment was reinforced in 1908.*
> Question: *The town council reinforced the embankment in 1908.*
> The passive has no *by*-phrase; the text never says **who** did it. Plausible, unstated →
> **NOT GIVEN**. Candidates answer TRUE because everything they can check is confirmed.
> *Teaching line: when a passive loses its agent, any statement naming an agent is unverifiable.*

> **P3 — D7 (converse flip).**
> Text: *Coastal settlements imported grain from the interior.*
> Question: *The interior supplied grain to coastal settlements.*
> `A imported from B` ≡ `B supplied to A`. Same proposition, opposite viewpoint → **TRUE**.
> The mirror trap: *Coastal settlements supplied grain to the interior* reverses the flow →
> **FALSE**.

> **P4 — D8 (negated antonym).**
> Text: *Few of the smaller mills survived the reorganisation.*
> Question: *Most small mills did not remain in operation after the reorganisation.*
> `few survived` ≡ `most did not remain` — two inversions cancelling. Meaning preserved → **TRUE**.
> Under time pressure this reads as a contradiction because of the surface `few` vs `most`.

> **P5 — D11 (quantifier shift — a trap, not a paraphrase).**
> Text: *Several of the older bridges were strengthened before the flood.*
> Question: *All the older bridges were strengthened before the flood.*
> `several` ≠ `all`. The text supports a weaker claim than the question makes → **FALSE**.
> *Teaching line: a stronger claim than the text makes is contradicted by the text, not merely
> unsupported — because the text's `several` implies not-all.*

> **P6 — D12 (modality shift — a trap).**
> Text: *The authors suggest that soil compaction may have contributed to the decline.*
> Question: *The authors demonstrated that soil compaction caused the decline.*
> `suggest` → `demonstrated` and `may have contributed` → `caused` both raise certainty. The text
> does not support that strength → **NO/FALSE**, depending on the group type.

> **P7 — D2 (superordinate) inside a completion item.**
> Text: *Carvers favoured lime and willow because both cut cleanly across the grain.*
> Question: *Carvers preferred ____________ because of how they cut across the grain.*
> The gap wants `lime and willow`. A learner scanning for the question's word `preferred` finds
> nothing (D1 hid it as `favoured`), and a learner expecting a category word writes `softwoods` —
> a paraphrase, and therefore **wrong**, because completion answers must be the passage's own
> words. *Teaching line: completion answers are copied, never paraphrased. The paraphrasing runs
> only one way — from text to question stem.*

> **P8 — D9 (compression) breaking a word limit.**
> Text: *…workers who had moved from the countryside within the previous decade…*
> Question (NO MORE THAN TWO WORDS): *The survey focused on ____________.*
> The tempting answer, `workers who had moved from the countryside`, is right in content and
> **wrong** on submission. The keyable answer must be a ≤2-word span the text actually contains.
> *Authoring rule: if the passage does not contain a span within the limit that answers the gap,
> the item is broken — fix the passage or the limit, never the key.*

> **P9 — D10 (clause restructuring across a sentence boundary).**
> Text: *Sediment cores were taken from three lakes. Two of them showed the same ash layer.*
> Question: *An identical ash layer was found in most of the lakes sampled.*
> The proposition is assembled from two sentences: three sampled, two matching, and `two of three`
> = `most`. Meaning preserved → **TRUE**. Single-sentence verification would miss it.
> *Teaching line: the verification span is sometimes two sentences. Read the sentence after the
> one you located.*

> **P10 — D1 + D11 combined (the classic band-6 loss).**
> Text: *Most households in the district already had piped water by 1930.*
> Question: *Every household in the district was connected to the water supply by 1930.*
> `piped water` → `connected to the water supply` is a clean D1/D9 paraphrase — three content words
> match, so a keyword matcher is confident. But `most` → `every` is D11 → **FALSE**. The correct
> paraphrase in the question is precisely what makes the trap work.

### 4.3 The drill this implies

**Paraphrase-pair drill.** Show a passage sentence and a rewritten statement. The learner answers
two things: (a) same or different proposition, (b) which device(s) were used. Two-part feedback
teaches the device inventory, not just the verdict. This maps cleanly onto our existing drill
runner and needs no new content type — the pairs can be harvested automatically from any authored
item's `evidence_quote` + question `prompt`, which is a strong argument for keeping
`evidence_quote` verbatim and tight (one sentence where possible).

**Authoring instruction:** every item's teaching payload should record the devices used, e.g.
`paraphrase_devices: ["D1", "D6"]`. That single field powers the drill, the "why wrong" prompt, and
per-learner analytics of the form "you lose TFNG items involving quantifier shift specifically."

---

## 5. Skimming, scanning, search reading and careful reading

### 5.1 The four gears (and the one nobody teaches)

The standard research taxonomy is Urquhart & Weir's, formalised for test validation by Khalifa &
Weir (2009): reading is **careful** or **expeditious**, and **local** or **global**.

| Gear | Definition | Used in IELTS Reading for |
|---|---|---|
| **Skimming** (expeditious, global) | sampling text rapidly for gist / superordinate idea | the two-minute paragraph map; matching headings; main-idea MCQs |
| **Scanning** (expeditious, local) | reading highly selectively for a specific word, name, figure or phrase you already know the form of | dates, proper nouns, numbers, percentages, capitalised terms |
| **Search reading** (expeditious, local→global) | hunting for information on a topic when you do **not** know what words it will be in | **almost everything else** — completion, TFNG location, matching information |
| **Careful reading** (careful, local or global) | slow, linear, incremental processing for full meaning | the two-to-four-sentence verification zone, once located |

**Search reading is the gear that IELTS actually demands most, and it is the one preparation
material almost never names.** "Scanning" as usually taught — look for the keyword — only works
when the question's word survives into the text, which §4 says it usually does not. Search reading
is scanning *for a meaning* rather than for a string, and it is trainable: the learner scans for
the semantic field (any word about water, any word about cost) rather than for the token.

Source for the taxonomy: [Weir et al., *The cognitive processes underlying the academic reading
construct as measured by IELTS*, IELTS Research Reports
(2009)](https://cdn.ielts.org/Research/cognitive-processes-underlying-academic-reading-construct-as-measured-by-ielts-wier-et-al-2009.pdf);
[Bax, *The cognitive processing of candidates during reading tests: evidence from eye-tracking*,
Language Testing (2013)](https://journals.sagepub.com/doi/10.1177/0265532212473244).

### 5.2 What the evidence says about the strategies

Three findings worth building teaching on.

1. **Successful test-takers locate faster; unsuccessful ones look at the whole text longer.** Bax's
   eye-tracking work found significant differences between successful and unsuccessful candidates
   in their ability to read expeditiously and in where they directed attention; unsuccessful
   readers spent longer sweeping the whole text, which implies they could not find the answer's
   location efficiently. ([Bax 2013](https://journals.sagepub.com/doi/10.1177/0265532212473244);
   [Bax, IELTS Research Reports 2015/2 — eye-tracking with multinational
   readers](https://www.ielts.org/researchers/our-research/research-reports/using-eye-tracking-to-research-the-cognitive-processes-of-multinational-readers-during-an-ielts-reading-test))
   *(A "57% faster completion" figure circulates in secondary summaries of this work; we could not
   verify it against the primary text and do not use it.)*
2. **Expeditious reading is near-universal and is not sufficient.** A retrospective-protocol study
   of EAP students on a mock IELTS Academic Reading test found that the overwhelming majority of
   reported strategies were expeditious, that comprehension consequently stayed at a
   *local-literal* level rather than a *global-interpretive* one, and — crucially — that **test
   scores did not necessarily rise as a result.** ([Reading strategies in IELTS tests: prevalence
   and impact on outcomes, Griffith
   Research Online](https://research-repository.griffith.edu.au/server/api/core/bitstreams/1a90b1d3-167c-5d8d-a7f6-3e77670aa35e/content))
   This is the single most important research finding in this briefing: **teaching more skimming
   and scanning to a candidate who already skims and scans will not move their band.** The missing
   step is verification, and the missing capability is paraphrase recognition.
3. **The item type determines the gear, and the paper mixes gears deliberately.** Weir et al. found
   the three passages of a paper elicit noticeably different processing profiles — one passage may
   be answerable largely expeditiously, another demands careful global synthesis. A candidate with
   only one gear will be exposed by whichever passage does not suit them.

**Synthesis for our teaching:** the value proposition is not "learn to skim". It is "learn which
gear each question wants, get into the zone fast, then downshift into careful reading and actually
check". Our per-question payload should therefore carry an explicit gear/strategy tag.

### 5.3 Is reading the whole passage first worth the time?

**No — and there is official teaching guidance saying so.** ielts.org's own article for teachers on
matching headings names reading the whole passage thoroughly before attempting the task as the
error to avoid, and recommends analysing the headings first, then skimming for topic sentences.
IDP's time-management guidance likewise says not to read every sentence in detail.
([ielts.org — preparing learners for matching
headings](https://www.ielts.org/news-and-insights/how-to-prepare-learners-for-matching-headings-task-on-the-ielts-reading-test);
[IDP — manage time in IELTS
Reading](https://ielts.idp.com/prepare/article-manage-time-in-ielts-reading))

But the opposite extreme — going straight to question 1 with no orientation — costs more, because
every subsequent question becomes a full-passage search. The defensible middle, and what we should
teach:

**The two-minute paragraph map.**

1. Read the title and, if the passage has one, the first paragraph in full (≈30 s). It usually
   frames the whole text.
2. For each remaining paragraph, read the first sentence and the last sentence only. If the first
   sentence is a question, an example, or a quotation, read the second sentence too — the topic
   sentence has been displaced.
3. Write **two to four words** in the margin (or, in our player, in the note tool) per paragraph.
   Not a summary. A label: *"cost objections"*, *"1890s expansion"*, *"critics"*.
4. Stop. Do not go back and fill in gaps.

Cost: ~2 minutes of a 16–22 minute budget, roughly 10%. Return: every later question starts as a
one-or-two-paragraph search instead of a seven-paragraph one, and matching-information and
matching-headings groups become near-free. This is the highest-ROI two minutes in the paper, and it
is also what turns a keyword hunter into a reader who knows the shape of the argument.

**Do not teach the map for GT Sections 1–2.** Those are short texts with headings, prices, times
and conditions; the structure is visible without mapping, and the marks are lost to answer-form
errors rather than to location errors. Map only GT Section 3.

### 5.4 Order of attack within a passage

There is **no published controlled study** showing that a particular question-type order raises
scores — anyone claiming otherwise is claiming more than the literature supports. What we can argue
from is search cost, which is measurable and not in dispute.

**The ratchet principle.** Groups whose answers appear in passage order — TFNG, YNNG,
sentence completion, short answer, MCQ, and note/table/flow-chart items drawn from one continuous
section — bound each other. Once you have located Q14, Q15 is *below* it. Each answer shrinks the
search space for the next. Doing these first builds the map further at no extra cost.

**The whole-passage tasks** — matching information ("which paragraph contains…"), matching features,
and to a lesser extent matching headings — have answers that are **not** in passage order and may
reuse letters. Every one of them is, in the worst case, a full-passage search. They get
dramatically cheaper once the ratchet groups have already forced you through most of the paragraphs.

So the search-cost-optimal order within a passage is:

1. **Matching headings** — *either* first (as your paragraph map, since the task is the map) *or*
   last (as a free ride on the map you built). Never in the middle: in the middle you pay for the
   global pass twice.
2. **Ratchet groups in their printed order** — TFNG/YNNG, completion, MCQ, short answer.
3. **Matching information / matching features** — last, when you can answer most of them from
   memory and only verify the doubtful ones.

**Caveat to teach honestly:** the exam usually prints matching headings first for a reason — doing
them first forces the global read that everything else benefits from. Both orders are defensible;
what is *not* defensible is doing the whole-passage tasks in the middle, or doing them cold before
any orientation. And a candidate should settle on one order in practice and not improvise it on
test day.

**On "easier types first" generally:** the honest position is that difficulty is
learner-specific, not type-intrinsic — every question is worth 1 mark, so the only rational
ordering criterion is *marks per minute for this learner*. That is a per-learner empirical fact,
and we already have the data to compute it: `per_type` accuracy plus per-question `time_ms` gives
marks-per-minute by type for each user. **This is a real product opportunity**: after a handful of
attempts, show the learner their own ordering — "your cheapest marks are sentence completion (1.4
marks/min) and your most expensive are matching information (0.4) — attempt completion first."
That is a genuinely evidence-based recommendation because the evidence is the learner's own.

---

## 6. The trap taxonomy

This is where the marks are lost, and it is the heart of the reading teaching payload. Authors
should tag every item with the trap it is built on and every wrong option with why it is wrong.

### 6.1 Named traps

Proposed canonical codes so `trap_note` is machine-groupable and the drill engine can target a trap
type. These extend the six trap names already in the "why was I wrong" prompt in
`docs/plan/06-reading-module.md` §6.1 — that prompt should be widened to this list.

| Code | Trap | Looks like | Correct handling |
|---|---|---|---|
| **T1** | **Absence read as contradiction** | learner answers FALSE/NO; text simply never addresses it | ask "which sentence contradicts this?" If you cannot point at one, it is NOT GIVEN. |
| **T2** | **Contradiction read as absence** | learner answers NOT GIVEN; text does contradict, in different words | the contradiction is usually one paraphrased word (`rose` vs `fell`, `rejected` vs `adopted`). Locate before deciding "not there". |
| **T3** | **Outside knowledge** | statement is true in the world, unstated in the text | the only evidence is the text. Being right about reality is worth 0. |
| **T4** | **Keyword match, wrong relation** | all content words present, relation reversed or misassigned | verify the *verb and its arguments*, not the nouns. (D7 in §4.1.) |
| **T5** | **Quantifier / scope shift** | `some` → `all`, `in one district` → `nationally`, `often` → `always` | circle every quantifier in the statement before looking at the text. |
| **T6** | **Modality / certainty shift** | `may` → `does`, `suggests` → `proves`, `is thought to` → `is` | match the strength, not just the content. |
| **T7** | **Comparison reversed or invented** | text gives two values; statement asserts a comparison the text never makes, or reverses it | comparisons are checkable arithmetic — do the arithmetic. |
| **T8** | **Attribution shift** | claim belongs to a named researcher; statement attributes it to the writer (or vice versa) | **the defining YNNG trap.** If the writer only reports someone's view without endorsing it, the writer's view is NOT GIVEN. |
| **T9** | **Time / tense shift** | text says it *was* so; statement says it *is* so | anchor every claim to its period. |
| **T10** | **Causation from correlation / condition** | text says two things co-occur or that X is needed for Y; statement says X causes Y, or that X guarantees Y | `necessary` ≠ `sufficient`; `associated with` ≠ `causes`. |
| **T11** | **Part read as whole** | true of one group/site/period, asserted of all | check the subject's scope as carefully as the predicate. |
| **T12** | **Parallel-location decoy** | the passage discusses the same topic in two paragraphs; the answer is in the second, the decoy in the first | when an answer looks obvious early, check whether the topic returns later. Extremely common in matching information. |
| **T13** | **Right answer, wrong form** | content correct, over the word limit / misspelt / wrong plural / paraphrased instead of copied | §7.5–§7.7. Costs the same mark as not knowing. |
| **T14** | **Heading too narrow / too broad** | heading names a real detail from the paragraph but not its controlling idea, or names the topic of the whole text | matching headings only. Ask "is this what the paragraph is *doing*, or just something it mentions?" |

**Authoring rule:** every TFNG/YNNG group we author should contain at least one T1 item and at
least one T2 item, because these two are inverse errors and a learner who over-corrects for one
walks straight into the other. A group with three NOT GIVENs and no genuine contradiction teaches
the wrong prior.

**Distribution rule:** in real papers the three TFNG options are roughly balanced within a group,
with NOT GIVEN typically the least frequent. We should author groups of 5–7 with no option
appearing more than 3 times and every option appearing at least once. This is a defensible,
originally-derived constraint, not a reproduction of anything.

### 6.2 Why quantifiers and modals deserve their own teaching unit

T5 and T6 are not vocabulary problems — the learner knows what `most` means. They are *attention*
problems: the words are grammatical, unstressed and skipped under time pressure. The fix is a
mechanical habit, and mechanical habits are exactly what a drill can install:

**The circle-before-you-look habit.** Before going to the text, mark in the statement: every
quantifier (`all, most, many, some, few, only, none, each, every`), every frequency adverb
(`always, usually, often, sometimes, rarely, never`), every modal or hedge (`may, might, could,
must, will, tends to, is likely to, appears to`), every comparative, and every time reference.
Then locate. Then check those marked words *specifically* against the text.

The closed-class inventory that decides most TFNG items is about **200 items** across quantifiers,
frequency adverbs, modals, hedging verbs (`suggest, claim, argue, assume, imply, indicate,
demonstrate, establish`), comparatives, and connectives of cause/contrast/concession. Two hundred
items is a fortnight's work and it is worth more marks than two thousand topic nouns. See §8.

**Product hook:** a dedicated "hedge and quantifier" drill built from single sentence pairs is
cheap to author, needs no passage, and targets the highest-loss trap class directly.

### 6.3 Distractor analysis — what our payload must say about wrong options

For letter-answer types (MCQ, matching headings, matching features, sentence endings, summary with
bank), the marks are lost *between two plausible options*, so a teaching note that only justifies
the key teaches nothing. Every distractor needs a one-line diagnosis drawn from a fixed vocabulary:

- **`true_but_not_asked`** — the statement is accurate but does not answer the question.
- **`right_words_wrong_paragraph`** — lifted from a different part of the text (T12).
- **`overstated`** — correct direction, too strong (T5/T6).
- **`understated`** — correct direction, too weak.
- **`partially_true`** — half of it is supported, half is not. The most dangerous distractor type,
  because the supported half is what the learner checks.
- **`unstated`** — plausible, never said (T3).
- **`too_narrow`** / **`too_broad`** — headings and main-idea items (T14).
- **`reversed`** — the relation runs the other way (T4/D7).

**Authoring rule: every non-key option carries exactly one of these codes plus one sentence of
explanation.** This is what makes reading review teachable, and it is the reading equivalent of the
band-graded model answer in speaking/writing — it shows the learner the *space of wrong* rather
than only the point of right.

---

## 7. Why candidates plateau — cause and specific fix

Eight causes. For each: the mechanism, the fix the learner performs, and the hook in our product.

### 7.1 Running out of time

**Mechanism.** Not slow reading per se — unbudgeted reading. Time disappears in three places:
careful-reading the whole passage (§3.4), over-dwelling on two or three hard items, and re-reading
because nothing was retained the first time.
**Fix.** The checkpoint protocol (§3.3): two clock glances, a two-minute cap per question, a 55:00
sweep. Practise passage 3 *first* sometimes, so the hardest text is not always met exhausted.
**Product.** Live pace hint in practice mode; post-attempt "questions over 2 minutes" report;
per-passage time in the results screen next to per-passage accuracy — the diagnostic pattern is
high accuracy on passage 1 and low on passage 3 with time skewed to passage 1.

### 7.2 Over-reading

**Mechanism.** Treating comprehension as the goal. The test does not reward understanding the
passage; it rewards answering 40 questions. A candidate who understands the passage beautifully and
answers 28 scores the same as one who barely followed it and answered 28.
**Fix.** Question-first discipline: read the question, decide what kind of answer it needs
(a date? a noun phrase? a paragraph letter? a verdict?), *then* go to the text. Never read a
paragraph without a question in mind after the initial map.
**Product.** The drill runner already shows anchor paragraphs only, not the full passage — that is
exactly the right training constraint. Consider a "gist first" mode that hides the passage until
the learner has read the question group.

### 7.3 Keyword matching without checking meaning

**Mechanism.** The dominant band-6 failure and the one with research behind it: expeditious
strategies are used almost to the exclusion of anything else, comprehension stays local-literal,
and scores do not follow (§5.2, Griffith). The learner locates a region containing the question's
words and answers from the region.
**Fix.** A named two-step: **Locate → Verify.** Verification means reading the located sentence
*and the one after it* in full, and articulating the text's proposition in your own words before
comparing. If you cannot say what the sentence claims, you have not verified it.
**Product.** This is the most valuable thing our review mode can drill. Every item's payload should
carry the **verification sentence** as `evidence_quote` (verbatim, tight — one sentence where
possible) and the explanation should explicitly contrast *what a keyword matcher would conclude*
with *what the sentence actually says*. That contrast, item after item, is the intervention.

### 7.4 Not Given confusion

**Mechanism.** Two inverse errors (T1 and T2) that a learner oscillates between. Over-correcting
for one produces the other. Compounded by the honest difficulty that "prove a negative" feels
unbounded — how long do you search before concluding "not there"?
**Fix.** Three rules, in order.
(a) **The contradiction test**: to answer FALSE/NO you must be able to point at a specific span that
says the opposite. No span, no FALSE.
(b) **The bounded search**: TFNG answers run in passage order, so the answer to Q_n lies between
where you found Q_{n-1} and where you find Q_{n+1}. Search that band, not the passage. If it is not
in the band, it is NOT GIVEN. This turns an unbounded search into a bounded one and is the single
most useful thing to teach about NOT GIVEN.
(c) **The 45-second cap**: NOT GIVEN items are the ones most likely to eat four minutes. Cap and
flag.
**Product.** A TFNG-specific drill with the anchor band shown (not the whole passage) trains rule
(b) directly. The `why-wrong` prompt should return the trap code from §6.1 so we can chart
"you fell for T1 six times this week".

### 7.5 Spelling errors in completion answers

**Mechanism.** Completion answers are *copied from the passage*, so a spelling error is a
transcription error, not a knowledge gap — which makes it pure, avoidable loss. Risk is highest for
long words, unfamiliar technical terms, and words the learner "knows" and therefore types from
memory rather than copying.
**Fix.** Copy character by character from the text, then read your answer back **against the text**,
not against your memory. Never type a completion answer without the source span visible.
**Product.** Our scorer is deliberately strict (exact after normalisation, no edit distance) — that
is correct and must not be softened. But review mode should *diagnose*: when a wrong answer is
within an edit distance of 1–2 of a key variant, label it explicitly as `spelling` rather than as a
comprehension error, and count it separately in the results breakdown. "You lost 3 marks to
spelling" is actionable in a way "you got 3 wrong" is not. This is a scoring-adjacent *reporting*
feature and does not change `is_correct()`.

### 7.6 Exceeding the word limit

**Mechanism.** The learner finds the right span and copies too much of it — usually by including an
article, a preposition, or a modifying phrase. Articles count. `the coal seam` is three words.
**Fix.** Before writing, ask "what is the minimum that completes the sentence grammatically?" Then
count on your fingers. Hyphenated compounds count as one; contractions count as one; a number
counts as a number.
**Product.** The live word counter is already specced and is the right control. Add: at submission,
the confirm dialog should list over-limit answers explicitly ("3 answers exceed their word limit"),
because these are certain zeros the learner can still fix. That is not a hint about correctness, so
it is legitimate even in exam-conditions mode.

### 7.7 Transferring answers wrongly

**Mechanism.** Paper mode only, and the reason it is so damaging is §1: **there is no transfer
time.** The candidate who answers in the booklet intending to copy up at the end either runs out of
time or copies under panic, and a single row offset destroys a whole question group. Adjacent risk:
writing a letter answer in the box for a word answer, or writing TRUE where the group wants YES.
**Fix.** Write on the answer sheet as you go, group by group. After finishing each group, check
that the last answer's number matches the last box number — an offset caught within a group costs
seconds; an offset caught at the end costs the group.
**Product.** Computer-delivered mode eliminates this class of error entirely, and our player is
computer-delivered by construction. But we should still **teach** it, because many users will sit
the paper test: a short "paper vs computer" briefing in the reading module, plus the per-group
number check as a habit. Our question palette already gives the computer-mode equivalent — a
number-by-number completeness view — and the 55:00 sweep should be framed as "the palette is your
answer sheet; no cell may be empty."

### 7.8 One more the brief did not list: never revising the strategy

**Mechanism.** Candidates repeat full mock tests, see the same band, and conclude they need more
mocks. Practice without diagnosis is measurement, not training. The Griffith finding generalises:
doing the thing you already do, faster, does not change the outcome.
**Fix.** After every attempt, one question: *which of the fourteen §0 items lost me the most
marks?* Then drill that, not another mock.
**Product.** This is precisely what our per-type breakdown plus trap codes plus the weakest-type
surfacing is for. Make the post-attempt screen end in a **single recommended action**, not a table.

---

## 8. Vocabulary — how much it really constrains the band

### 8.1 The coverage research

The relationship between vocabulary size and reading comprehension is one of the better-established
findings in applied linguistics, and it is a **threshold** relationship, not a linear one.

- Nation's position: **98% lexical coverage** of a text is the level at which most learners have a
  good chance of adequate unassisted comprehension. Laufer's, applied to a lower bar of *minimally
  acceptable* comprehension: **95%**.
- Laufer & Ravenhorst-Kalovski (2010) propose two thresholds: an **optimal** one at roughly **8,000
  word families ≈ 98% coverage**, and a **minimal** one at roughly **4,000–5,000 word families
  ≈ 95% coverage** (both counting proper nouns).
- Coxhead's Academic Word List: **570 word families** accounting for around **10%** of running
  words in academic text — a very high return per family learned, for Academic Reading specifically.
- Ackermann & Chen's Academic Collocation List: **2,469 academic collocations** derived from a
  corpus of written academic English — the collocational companion to the AWL.

Sources: [Laufer & Ravenhorst-Kalovski, *Lexical threshold revisited*, Reading in a Foreign Language
(2010)](https://files.eric.ed.gov/fulltext/EJ887873.pdf); [Nation, *How large a vocabulary is needed
for reading and listening?*
(2006)](https://www.researchgate.net/publication/239928724_How_Large_a_Vocabulary_Is_Needed_for_Reading_and_Listening);
[Academic Collocation List — EAP
Foundation](https://www.eapfoundation.com/vocab/academic/acl/); [Ackermann & Chen, *Developing the
Academic Collocation List*
(2013)](https://www.researchgate.net/publication/259161085_Developing_the_Academic_Collocation_List_ACL_-_A_corpus-driven_and_expert-judged_approach).

### 8.2 What that means for a reading band — stated carefully

There is **no published mapping from vocabulary size to IELTS reading band**, and any source giving
one ("band 7 = 8,000 words") is extrapolating. What is defensible, and what we should teach:

- **At 95% coverage, one word in twenty is unknown** — about one per two lines of an exam passage.
  That is survivable for *locating*: you can still find the region, because location relies on
  proper nouns, numbers and general vocabulary. It is corrosive for *verifying*, because
  verification turns on a single sentence, and a single sentence containing one unknown content
  word may be exactly the sentence that decides TRUE from NOT GIVEN.
- Hence the shape of the constraint: **vocabulary sets the ceiling, strategy sets the floor.** A
  candidate with weak strategy and strong vocabulary underperforms their knowledge. A candidate
  with excellent strategy and 3,000 word families will locate everything and misjudge the close
  ones — and the close ones are the difference between 27 and 33.
- The consoling and true thing to tell learners: **IELTS passages are written for a non-specialist
  audience**, so the 2–5% of words that are genuinely specialist are normally recoverable from
  context or irrelevant to any key. The words that block you are rarely the exotic ones; they are
  mid-frequency academic verbs (`attribute, undermine, offset, warrant, preclude`) that carry the
  relation the question is testing.

### 8.3 What vocabulary work actually helps

Ranked by return, and all of it is receptive work — reading needs recognition, not production.

1. **Paraphrase families, not words.** A family is one concept plus the four to six re-wordings an
   item writer would plausibly use: *decline / fall / drop / decrease / reduction / downturn /
   contraction*, with their part-of-speech variants and the prepositions they take. This is
   directly the D1/D4/D5 device from §4.1 turned into study material. **This is the single most
   reading-specific vocabulary activity there is**, and almost nobody does it, because word lists
   are organised by topic rather than by synonymy.
2. **The 200-item hinge set** (§6.2): quantifiers, frequency adverbs, modals and hedging reporting
   verbs, comparatives, and connectives of cause / contrast / concession / condition. Highest
   marks-per-item in the whole language.
3. **Academic collocation** — the ACL's territory. `draw a distinction`, `a marked increase`,
   `broadly consistent with`, `at odds with`. Collocations matter for reading because item writers
   paraphrase *chunks*, and a reader who processes `bear little resemblance to` as three separate
   words loses the proposition.
4. **AWL coverage** for Academic candidates — 570 families, ~10% of the text, and disproportionately
   the words that carry relations rather than topics.
5. **Morphology.** Prefixes, suffixes and part-of-speech families, because D4/D5 (nominalisation
   and verbalisation) are the devices that most often defeat scanning. A learner who sees
   `retreat`, `retreated`, `retreating` and `the retreat of` as one item has effectively quadrupled
   the yield of that item.
6. **Bottom of the list: topic word lists with L1 glosses.** They fail for reading because the exam
   never tests word meaning in isolation; it tests whether two propositions match. A learner can
   know every word in a sentence and still answer T5 wrong.

**Product hooks.** Our vocabulary SRS already ingests `{term, sentence_context}` from double-click
lookups in the reading player, which is the right capture mechanism (context, not gloss). Two
extensions that would make it reading-specific:
- a **paraphrase-family card type**: prompt shows a passage sentence, the learner produces or
  recognises the exam-style rewording;
- **auto-harvest of hinge-set items** encountered in TFNG evidence quotes, so the learner's deck
  fills with the words that actually decided their wrong answers.

---

## 9. Band 6 vs band 8 — the behavioural contrast

IELTS publishes no reading-specific band descriptors; the nine-band scale descriptors are general
(band 6 "competent user", band 8 "very good user") and describe overall language ability, not
reading behaviour. **The contrast below is our own clean-room behavioural model**, calibrated to
what the raw scores actually require: Academic band 6 = 23–26/40 (14–17 wrong), band 8 = 35–36/40
(4–5 wrong). Roughly eleven questions, three or four per passage.

The useful insight is that the gap is **not** "understands more English". It is five specific
behaviours.

| | Band 6 reader | Band 8 reader |
|---|---|---|
| **Orientation** | Starts at question 1 with no map of the passage, or careful-reads the whole text first and arrives at the questions with 12 minutes gone | Spends ~2 minutes building a paragraph map, then never reads unpurposefully again |
| **Locating** | Searches for the question's words; when they are absent, sweeps the passage repeatedly | Searches for the question's *meaning*; expects the words to have changed; uses passage-order bounds to shrink the search |
| **Deciding** | Answers from the located region — "this bit is about the same thing, so TRUE" | Answers from a specific sentence and can say which one; reads the following sentence before committing |
| **Quantifiers and modals** | Reads over them; sees content words match and commits | Marks them before looking; treats `most→all` and `may→does` as decisive |
| **NOT GIVEN** | Oscillates: FALSE when nothing is said, NOT GIVEN when the contradiction is paraphrased | Applies the contradiction test — no contradicting span, no FALSE — and bounds the search by passage order |
| **Getting stuck** | Spends four minutes on one item, and often still gets it wrong | Guesses at 2:00, flags, moves; returns only if time remains |
| **Time shape** | Rich on passage 1, panicked on passage 3, several blanks at the end | Slightly ahead at each checkpoint; zero blanks; 2 minutes spare for the sweep |
| **Answer form** | Loses 2–4 marks to spelling, plurals, over-limit answers and paraphrased completions | Copies exactly, counts words, re-reads the answer against the text |
| **Distractors** | Picks the option sharing the most words with the passage | Eliminates on a stated ground — too narrow, unstated, overstated, reversed |
| **Self-knowledge** | "I'm bad at reading" | "I lose TFNG items with quantifier shifts and matching information under time pressure" |

**The line worth putting in the product:** *a band 8 reader is not reading more of the passage than
you. They are reading much less of it, far more carefully, in exactly the right places — and they
check.*

---

## 10. Direct instructions to the reading authoring agents

Distilled from everything above. These are the concrete asks.

**Per-question teaching payload — minimum viable set.** The schema in
`docs/plan/06-reading-module.md` §3 already carries `anchor_paragraphs`, `evidence_quote`,
`explanation`, `trap_note`, `difficulty`, `band_target`. Fill all six on every question, and:

- `evidence_quote` must be the **verification sentence**, verbatim, as short as possible while
  remaining decisive. Not a paragraph. This one field powers locate-in-passage, the why-wrong
  prompt, the paraphrase-pair drill, and vocabulary harvesting.
- `explanation` must follow the §4.2 shape: *what the text says* → *which rewording devices link it
  to the question* → *verdict*. Name the devices. An explanation that only restates the answer is a
  filler and fails review.
- `trap_note` must name a trap code from §6.1 (T1–T14) plus one sentence. If an item has no trap,
  say so rather than inventing one — not every item is a trap, and pretending otherwise trains
  paranoia.

**Recommended schema extensions** (for the design agent to rule on):

| Field | Value | Why |
|---|---|---|
| `paraphrase_devices` | `["D1","D6"]` from §4.1 | powers the paraphrase drill and per-learner device analytics |
| `trap_code` | `"T5"` from §6.1 | machine-groupable; lets the drill engine target a trap class |
| `strategy_id` | which gear/technique the item wants (§5.1) | per-question strategy coaching, per-type strategy pages |
| `option_diagnosis` | per non-key option, one of the §6.3 codes + one sentence | **the reading equivalent of the model answer** — the highest-value addition on this list |
| `expected_seconds` | authored time budget | powers the "you spent 4× the budget here" report |

**Group-level rules to obey while authoring:**

- TFNG/YNNG groups of 5–7: no option more than 3 times, every option at least once, at least one T1
  item and one T2 item per group.
- Every completion answer must be a **verbatim contiguous span of the passage** that fits inside the
  group's word limit. If no such span exists, fix the passage, not the key (§4.2 P8).
- YNNG groups require the passage to contain **real writer stance** — hedged evaluative sentences,
  not just facts — and at least one clearly *attributed* third-party claim so a T8 item is possible.
- Every Academic passage needs at least one plausible-but-unstated proposition planted deliberately
  as NOT GIVEN fuel, and at least one agent-deleted passive (§4.2 P2).
- Matching-headings option lists must include one `too_narrow` and one `too_broad` distractor,
  diagnosed as such (§6.3, T14).
- GT Sections 1–2 items should skew toward answer-form discipline: exact figures, times, prices,
  conditions, plurals. That is where GT candidates lose the marks that cost them half a band (§2.5).

**Copy we owe the learner, outside the item payload:**

- a per-question-type strategy page (what the type tests, the gear it wants, the order to attempt
  it in, its characteristic traps, its time budget);
- the timing protocol of §3.3 as a one-screen briefing before the first mock;
- a "paper vs computer" note covering transfer (§7.7);
- the band-table caveat on every band we display.

---

## 11. Confidence and disputed points

Recorded so nobody downstream treats a soft claim as hard.

1. **Hard, official, safe to state as fact:** 40 questions; 1 mark each; whole and half bands; no
   transfer time in Reading; spelling and word-limit penalties; text sources and lengths; GT needs
   more correct answers than Academic; thresholds vary by version. All from ielts.org pages cited
   in §1.
2. **Well-corroborated but indicative:** the full raw→band tables of §2. Only four anchor points per
   format are officially published. The GT band-7 boundary is our one known divergence (§2.3).
3. **Research-supported:** the careful/expeditious × local/global taxonomy (Weir et al.; Khalifa &
   Weir); successful readers locating faster and unsuccessful ones sweeping the whole text (Bax);
   near-universal expeditious strategy use not translating into higher scores (Griffith); lexical
   coverage thresholds (Nation; Laufer & Ravenhorst-Kalovski); AWL and ACL sizes.
4. **Teacher consensus, not evidence:** per-passage minute budgets; attempt-order recommendations;
   "do matching information last". Widely taught, internally coherent, no controlled study.
   Presented above with the search-cost reasoning that justifies them, and labelled as ours.
5. **Rejected as unverifiable.** A "57% faster completion for successful test-takers" figure
   attributed to the Bax eye-tracking work appears in secondary summaries; we could not confirm it
   in the primary text and it is not used. A claim that "explicit strategy instruction plus error
   categorisation improved TFNG accuracy by 22% over six weeks versus 9% for timed practice",
   attributed to a 2022 ELT journal article, appears in commercial preparation content with no
   traceable citation; it looks fabricated and **must not be repeated in our product copy**. The
   underlying pedagogical claim — that categorising your errors beats undirected practice — is
   defensible on other grounds (§7.8) and should be stated on those grounds, without a number.
6. **Our own inventions, clearly ours:** the D1–D12 device taxonomy, the T1–T14 trap codes, the
   §6.3 distractor diagnosis vocabulary, the two-minute paragraph map, the checkpoint protocol, the
   band 6 vs band 8 behaviour table, the 200-item hinge set, and every example sentence in §4.2.
   All original, all reusable inside the pack, none derived from any source consulted.

---

## 12. Sources

**Official (used as authority for §1, §2.3, §3.1, §5.3):**

- [IELTS scoring in detail — ielts.org](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) — 40 questions, 1 mark each, whole and half bands, Academic vs GT on the same scale, anchor thresholds, version variation.
- [IELTS Academic: Reading test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading) — 60 minutes including transfer, "unlike the Listening test, no extra transfer time is given", spelling and word-limit penalties, text sources and lengths.
- [IELTS General Training: Reading test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading) and [General Training test format in detail — ielts.org](https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail) — three sections, section content, task-type inventory.
- [How to prepare learners for the matching headings task — ielts.org](https://www.ielts.org/news-and-insights/how-to-prepare-learners-for-matching-headings-task-on-the-ielts-reading-test) — what the task assesses, reading the whole passage first named as the error to avoid, headings-first technique, guessing.
- [IELTS Reading test — how to manage your time — IDP](https://ielts.idp.com/prepare/article-manage-time-in-ielts-reading) — no more than 20 minutes per part, do not read every sentence in detail, answer every question / educated guessing.
- [IELTS common spelling mistakes — IDP](https://ielts.idp.com/canada/prepare/article-ielts-common-spelling-mistakes) and [How to improve your spelling — IDP](https://ielts.idp.com/prepare/article-ielts-how-to-spell) — misspelt answers marked wrong in Reading and Listening.
- [IELTS Reading band scores — IDP India](https://ieltsidpindia.com/information/ielts-band-scores/reading) — one mark per answer, no negative marking, Academic/GT threshold difference.

**Peer-reviewed / research reports (used as authority for §5, §7.3, §8):**

- [Weir, Hawkey, Green, Unaldi & Devi, *The cognitive processes underlying the academic reading construct as measured by IELTS*, IELTS Research Reports (2009)](https://cdn.ielts.org/Research/cognitive-processes-underlying-academic-reading-construct-as-measured-by-ielts-wier-et-al-2009.pdf) — careful/expeditious × local/global processing, differing processing profiles across the three passages.
- [Bax, *The cognitive processing of candidates during reading tests: evidence from eye-tracking*, Language Testing 30(4) (2013)](https://journals.sagepub.com/doi/10.1177/0265532212473244) — successful vs unsuccessful test-taker behaviour, expeditious reading, item-focus differences.
- [Bax, *Using eye-tracking to research the cognitive processes of multinational readers during an IELTS reading test*, IELTS Research Reports 2015/2](https://www.ielts.org/researchers/our-research/research-reports/using-eye-tracking-to-research-the-cognitive-processes-of-multinational-readers-during-an-ielts-reading-test) — replication and extension; unsuccessful readers sweeping the whole text.
- [*Reading strategies in IELTS tests: prevalence and impact on outcomes* — Griffith Research Online](https://research-repository.griffith.edu.au/server/api/core/bitstreams/1a90b1d3-167c-5d8d-a7f6-3e77670aa35e/content) — overwhelming prevalence of expeditious strategies, local-literal comprehension, scores not necessarily rising. The key finding behind §7.3.
- [Laufer & Ravenhorst-Kalovski, *Lexical threshold revisited: lexical text coverage, learners' vocabulary size and reading comprehension*, Reading in a Foreign Language 22(1) (2010)](https://files.eric.ed.gov/fulltext/EJ887873.pdf) — the 95%/98% coverage thresholds and the 4,000–5,000 / 8,000 word-family figures.
- [Nation, *How large a vocabulary is needed for reading and listening?* (2006)](https://www.researchgate.net/publication/239928724_How_Large_a_Vocabulary_Is_Needed_for_Reading_and_Listening) — the 98% threshold and 8,000–9,000 families for written text.
- [Ackermann & Chen, *Developing the Academic Collocation List (ACL)* (2013)](https://www.researchgate.net/publication/259161085_Developing_the_Academic_Collocation_List_ACL_-_A_corpus-driven_and_expert-judged_approach) and [Academic Collocation List — EAP Foundation](https://www.eapfoundation.com/vocab/academic/acl/) — 2,469 academic collocations; AWL as 570 families ≈ 10% of academic text.

**Teacher / preparation commentary (treated as informed opinion, used only for §3.2, §5.4, §6, §7):**

- [Conversion tables for IELTS Listening and Reading band scores — IDP Qatar / IFI](https://ifi.qa/using-conversion-tables-to-find-out-your-ielts-listening-and-reading-scores/) and [IELTS reading raw score to band conversion — TypoGrammar](https://typogrammar.com/ielts/reading-raw-score-to-band-conversion/) — the full tables in §2, cross-checked against the official anchors.
- [IELTS Reading question types — IELTS Liz](https://ieltsliz.com/ielts-reading-question-types/) and [Matching headings — IELTS Liz](https://ieltsliz.com/ielts-reading-matching-headings/) — which types run in passage order and which do not; the ordering argument in §5.4.
- [True/False/Not Given essential tips — IELTS Liz](https://ieltsliz.com/ielts-true-false-not-given-essential-tips/) and [TFNG tips and strategy — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/27/ielts-reading-true-false-not-given-tips/) — the FALSE-vs-NOT-GIVEN distinction and the outside-knowledge error behind T1–T3.
- [Yes/No/Not Given vs True/False/Not Given — Simply IELTS](https://simplyielts.com/ielts-reading-yes-no-not-given-vs-true-false-not-given/) and [Yes/No/Not Given — IELTS Jacky](https://www.ieltsjacky.com/ielts-reading-yes-no-not-given.html) — writer's-position framing behind T8.
- [Matching headings strategies — IDP](https://ielts.idp.com/prepare/article-ielts-reading-matching-headings) and [Matching headings — IELTS Advantage](https://www.ieltsadvantage.com/2015/03/04/ielts-reading-matching-headings-tips-and-strategy/) — topic sentences, too-narrow/too-broad distractors behind T14.
- [Summary completion — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/29/ielts-reading-summary-completion/) and [Sentence completion — IELTS Jacky](https://www.ieltsjacky.com/ielts-reading-sentence-completion.html) — predict word class before scanning; answers copied not paraphrased (§4.2 P7).
- [Paraphrasing techniques — IELTS Simon](https://www.ielts-simon.com/ielts-help-and-english-pr/2019/02/ielts-vocabulary-paraphrasing-techniques.html) and [Paraphrasing in IELTS Reading — IELTS Focus](https://ieltsfocus.com/2019/06/07/paraphrasing-ielts-reading/) — used to confirm the device inventory of §4.1 is complete; no example reused.
- [Skimming and scanning for IELTS Reading — British Council](https://takeielts.britishcouncil.org/blog/skimming-and-scanning-for-ielts-reading) — the standard skim/scan framing that §5.1 extends with search reading.
- [Computer-delivered IELTS pros and cons — IELTS Liz](https://ieltsliz.com/computer-delivered-ielts-pros-cons/) and [Computer-delivered or paper-based IELTS — IDP](https://ielts.idp.com/about/article-computer-delivered-paper-based-ielts-comparison) — highlighting, side-by-side layout, typed answers; the transfer-risk asymmetry in §7.7.
- [Why IELTS band scores don't improve — Learn English Weekly](https://learnenglishweekly.com/ielts/examiner/why-ielts-band-scores-dont-improve) and [Overcoming the 6.5 plateau — Aviontus](https://www.aviontus.com/post/overcome-the-ielts-6-5-plateau-effectively-ielts-plateau-improvement-tips) — used only to identify the plateau claims in circulation for §7; the mechanisms and fixes in §7 are argued from §§1–6, not from these pages.

**Not used as authority:** AI-scoring vendor blogs, "band 9 answer" collections, "updated 2026 band
descriptor" listicles, and any page reproducing past-paper passages or questions. Where a claim
appeared only in that tier it is either omitted or explicitly rejected in §11.5. No passage,
question, option or explanation was read for content or reused in any form.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge
University Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of
them. No exam material is reproduced in this document; every example sentence, paraphrase pair,
trap illustration, device code, distractor diagnosis and worked pattern above is original text
authored for BandReady.*
