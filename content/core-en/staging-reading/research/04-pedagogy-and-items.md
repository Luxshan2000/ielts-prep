# R-R4 — Reading pedagogy and item writing: how BandReady teaches a receptive skill

Research briefing for the reading-module content push. Written 2026-07-27.
Scope: two halves. **Part A** — what actually makes reading practice raise a band, and how the
review step must be run. **Part B** — how a fair, defensible reading item is written, because we
are about to author several hundred of them and the teaching payload is only as good as the key
it explains. **Part C** turns both into a ranked feature wishlist with on-screen behaviour.

**Copyright posture.** Every example statement, stem, distractor and passage fragment below is
written from scratch to illustrate a technique. Nothing is transcribed from a past paper, a
Cambridge volume, or a coaching site. Where a source is a coaching provider I took the
*technique* — a fact about practice — and re-expressed it. Where a source is a testing body I took
the *principle*, never the wording. Item-writer guidelines from Cambridge/IELTS are not public
documents; nothing here is a leak or a paraphrase of one, only what the published research
literature and the public teacher-facing materials say. Product copy says **IELTS-style**.

---

## 0. Three theses, stated up front

**Thesis 1 — the attempt is not the lesson; the review is.** Reading is the one skill where the
learner produces nothing we can grade except a string match. All the teaching value therefore sits
in the interval between "you got 24/40" and "I now know what I do wrong." A practice test that is
scored and closed teaches almost nothing: the same errors reappear in the next attempt, and the
learner logs hours while the band sits still. Every feature in Part C is, ultimately, a device for
making the review unavoidable, specific and short.

**Thesis 2 — reading is paraphrase recognition under time pressure.** Nearly every keyed answer in
this paper is a rewording of something in the text. The subskill that separates band 6 from band 8
is not vocabulary size and not "reading speed" in the eye-movement sense; it is the speed and
reliability with which a candidate recognises that *the writer's phrase* and *the question's
phrase* denote the same proposition — and, equally, that a phrase which *looks* like a match is not
one. Our teaching payload must make that link explicit on every single question, and our items must
be built on real paraphrase rather than word repetition.

**Thesis 3 — a reading item is only as good as its silence.** The hardest thing in this whole
project is writing a Not Given statement that is genuinely not given, rather than merely hard to
find. Amateur item-writing fails here more than anywhere else, and a broken NG item does active
harm: it teaches the learner a rule that is wrong. Part B §10 is the most important section in this
document for the authoring agents.

---

# PART A — PEDAGOGY

## 1. Why more practice tests do not raise a reading band

### 1.1 The evidence

| Finding | Source | What it implies for us |
|---|---|---|
| In a review of ten study techniques, **practice testing and distributed practice were the only two rated "high utility"** | Dunlosky et al. (2013), reprised in Nature Reviews Psychology (2022) | Testing *is* the right modality. Reading practice tests are not the problem. Unreviewed reading practice tests are. |
| A meta-analysis over **242 studies / 1,619 effects / 169,179 participants** put distributed practice and practice testing at the top | Evidence Based Education synthesis; Nature Rev. Psych. (2022) | Spacing is a first-class scheduling feature, not a nicety. Re-serving missed questions at a delay is a cheap, evidence-backed win. |
| The testing effect is **strongly amplified by feedback**; retrieval without corrective feedback preserves errors | test-enhanced-learning literature; "Reversing the testing effect by feedback" (2020) | Immediate per-question feedback in drills is not a UX preference — it is the mechanism. |
| **Error logs produce measurable accuracy gains, but only when the learner can *explain* the correction.** Learners who wrote accurate explanations of their own corrections improved on later work; passive record-keeping did not predict gains | System (2024), error logs and engagement with written corrective feedback | Do not just show the explanation. Make the learner *state the cause first*, then reveal. This single design decision is the difference between a log and a lesson. |
| **Explicit reading-strategy instruction has moderate-to-large effects** on L2 comprehension (reported ranges g ≈ 0.45–1.55; a prototypical intervention ≈ 0.72) | meta-analyses of explicit L2 reading strategy training | Naming and teaching the technique is worth doing. But note the enormous variance — strategy taught without applied text practice is where the small effects live. |
| Learners **systematically overestimate their own performance**, and the weakest are the most overconfident. Metacognitive training — item-specific confidence judgements plus feedback — improved monitoring accuracy *over and above* repeated testing | metacognitive calibration literature; judgment-training study (2019) | A per-question confidence tag costs one tap and buys a genuinely new diagnostic: the "right by luck" rate. |
| Failing to retrieve an item **reduces** overconfidence and improves calibration | Metacognition study on failed retrieval (2014) | Do not soften the moment of being wrong. Show the miss plainly; that is the corrective signal. |
| Deliberate practice requires **a coach who sets refinement goals, immediate feedback, repetition, and a difficulty just above current level** | TESL-EJ (2025), deliberate/purposeful practice framework for L2 | "Do ten more tests" satisfies none of these four. Our drill mode must set a goal, feed back instantly, repeat the miss, and pitch difficulty. |
| Coaching consensus, stated in many places: candidates mark a score and move on, repeating the same errors indefinitely; error analysis is described by practitioners as the fastest single lever on a reading score | IELTS-GPT review guide; multiple teacher blogs | Aligns with the research. Treat as corroboration, not as evidence. |

### 1.2 The three diagnoses — a wrong answer is one of three different problems

Every reading error resolves to exactly one of these, and each has a different remedy. The app must
separate them, because pooling them produces the useless advice "read more."

| Diagnosis | Signature in the data | Remedy | Wrong remedy |
|---|---|---|---|
| **Technique** — the learner read the right words and still chose wrong | Wrong answer, evidence located correctly, low time spent | Trap analysis, per-type strategy, TFNG decision rules | More passages |
| **Location** — the learner never found the evidence | Wrong answer, evidence not located, high time spent | Scanning drills, paragraph-mapping, keyword→paraphrase training | Vocabulary lists |
| **Time** — the learner would have got it with two more minutes | Blank or rushed answers clustered in the last 10 minutes / last passage | Pacing ladder, abandon rule, question-order strategy | Trap analysis |

An attempt review that does not tell the learner which of these three cost them the marks has not
reviewed anything. This is the diagnostic backbone of the results screen (Part C, F6/F14).

### 1.3 The practice contract

Codify once; enforce in UI copy, drill scheduling and progress logic.

1. **No new full test until the previous one is reviewed.** Reviewing is defined as: every wrong
   answer opened, cause self-classified, evidence located. (Escape hatch exists; it is one click,
   and it is logged so the progress screen can say "you have 3 unreviewed attempts.")
2. **One full test per 2–3 days at most.** The days in between are review + type drills. A full
   test is an assessment instrument, not a training instrument; it is expensive in time and
   produces one number.
3. **Every miss comes back.** Wrong questions re-enter the queue at ~48 h and again at ~7 days.
4. **Feedback is immediate in drills, deferred to submission in tests.** Never mid-test.
5. **The band number is de-emphasised outside benchmark mode.** A raw band on a 10-question drill
   is noise and it moves attention from the task to the self.

---

## 2. The review step — what a learner must actually do with a wrong answer

### 2.1 The six-move review protocol

This is the sequence the app should walk, in this order, per wrong answer. Order matters: the
self-explanation must precede the reveal (§1.1, error-log finding).

1. **Re-decide blind.** Show the question and the passage again, with your previous answer hidden.
   Re-answer. (Roughly a third of misses are recovered here — those are time problems, not
   comprehension problems, and the app should say so.)
2. **Locate.** Select the span in the passage you believe decides it. The app checks the selection
   against the authored evidence span. Getting this wrong is the *location* diagnosis; getting it
   right and still failing is the *technique* diagnosis.
3. **Name the trap, before the explanation is revealed.** Pick from the closed taxonomy (§2.3). The
   list is short enough to scan and specific enough that picking is a real judgement.
4. **Read the worked solution** (§2.2) — now, and only now.
5. **State the rule in one line** — "when a statement adds a cause the writer never mentions, it's
   Not Given." Free text, optional LLM check that it matches the authored `reusable_rule`.
6. **Bank it.** The trap code goes to the learner's trap profile; the paraphrase pair goes to the
   vocabulary inbox; the question goes to the spaced retry queue.

Moves 1–3 take under a minute per question. Move 6 is automatic. A learner reviewing 12 wrong
answers spends 15 minutes and generates a specific, ranked profile of their own failure modes.

### 2.2 Anatomy of a worked solution — the five obligatory parts

This is the reading equivalent of speaking/writing's band-graded model answer, and it is the
central content deliverable of this push. A worked solution missing any of these five is not
actionable and should fail lint.

| Part | Field (proposed) | What it must contain | Failure mode if missing |
|---|---|---|---|
| **1. Location** | `anchor_paragraphs` + `evidence_quote` (verbatim substring, already validator-checked) | The exact words that decide it — the minimum span, not the whole paragraph. 5–25 words. | Learner can't tell whether they failed to find it or failed to read it. |
| **2. The paraphrase link** | `paraphrase_link: {stem_phrase, text_phrase, transformation}` | The phrase in the *question* and the phrase in the *text* that correspond, plus the named transformation (synonym, nominalisation, cause↔effect flip, superordinate, negation-of-antonym, quantifier restatement…). | The learner sees *that* it was the answer, not *why* it counted as the answer. This is the single highest-value field in the payload. |
| **3. The decision rule** | `decision_rule` | Why this reading is forced and no other is available, in the vocabulary of the type. For TFNG: which of the three conditions is met and why the other two aren't. ≤ 40 words. | "Because the text says so" — circular, unusable. |
| **4. Distractor autopsy** | `distractor_analysis: [{option, why_tempting, why_wrong}]` | One entry per wrong option (MCQ/headings/features/endings/bank) or, for TFNG/completion, per plausible wrong answer. **`why_tempting` is compulsory** — an entry that only says "it's wrong" is filler. | The marks are lost in the distractors; the explanation must go where the marks go. |
| **5. The reusable rule** | `reusable_rule` | One transferable sentence the learner can carry to a different passage. Must not mention this passage's content. ≤ 25 words. | The learner learns one item instead of one behaviour. |

Plus one classification field: **`trap_code`** from §2.3 (nullable — some questions have no trap;
say so rather than inventing one).

**Worked example** (original, illustrative):

> Statement: *The technique was abandoned once cheaper materials became available.*
> Key: **NOT GIVEN**
> - Location: "…workshops continued to use the method into the 1890s, by which time imported
>   substitutes cost roughly half as much."
> - Paraphrase link: stem "cheaper materials became available" ↔ text "imported substitutes cost
>   roughly half as much" — *quantifier→comparative restatement*. The link is real; the
>   **consequence** is not.
> - Decision rule: the text establishes both facts (the cheaper substitutes; the continued use) but
>   never states that one caused the other to stop. NOT GIVEN, not FALSE: nothing contradicts it.
> - Distractor autopsy — **FALSE** tempts because the text says workshops *continued* using it, which
>   feels like a contradiction of "abandoned"; but "continued into the 1890s" does not deny a later
>   abandonment. **TRUE** tempts because the causal story is the obvious one.
> - Reusable rule: a stated fact plus a stated fact does not equal a stated *link* between them.
> - Trap code: `causal_link_assumed`.

### 2.3 The trap taxonomy — closed enum, the spine of reading diagnostics

Per-type statistics ("you get 55% of TFNG") tell a learner what to practise. Per-**trap**
statistics tell them what to *change*. This taxonomy is the most reusable artefact in this
briefing: it is a content field, a review picker, a progress axis, a drill filter, and the
constrained vocabulary for the "why was I wrong" LLM call (which today invents its own six-label
list inline in the plan — that list should be replaced by this one so content and LLM agree).

| Code | Name | What happened | Types it bites |
|---|---|---|---|
| `lexical_lure` | Word match without meaning match | The learner matched a repeated word rather than the proposition | all |
| `paraphrase_missed` | Meaning match not recognised | The evidence was there but reworded past recognition | all |
| `scope_shift` | Quantifier / generalisation shift | some↔all, often↔always, many↔most, a study↔research generally | TFNG, YNNG, MCQ |
| `hedge_stripped` | Certainty inflated | "may reduce" read as "reduces"; "proposed" read as "done" | TFNG, YNNG, MCQ |
| `absence_read_as_contradiction` | NG answered FALSE | The text is silent; the learner heard a denial | TFNG, YNNG |
| `contradiction_read_as_absence` | FALSE answered NG | The text does contradict it; the learner didn't find where | TFNG, YNNG |
| `outside_knowledge` | True in the world, not in the text | The learner used what they know | TFNG, YNNG, MCQ |
| `causal_link_assumed` | Two facts read as one causal claim | The commonest genuine NG | TFNG, YNNG |
| `attribution_shift` | Right claim, wrong claimant | Attributed to the writer instead of a cited researcher, or to the wrong researcher | YNNG, matching_features, MCQ |
| `time_shift` | Wrong point on the timeline | Plan vs implementation, past practice vs current | TFNG, completion |
| `comparison_reversed` | Direction of comparison flipped | A exceeded B read as B exceeded A | TFNG, MCQ, completion |
| `negation_missed` | A not / rarely / failed to was skipped | | all |
| `detail_for_main_idea` | One sentence taken for the paragraph | The classic headings failure | matching_headings |
| `neighbour_answer` | Right answer, wrong question number | Answer belonged to the adjacent item | completion, matching |
| `partial_condition` | Only half the statement is supported | Compound statements where one clause holds and one doesn't | TFNG, MCQ |
| `form_error` | Content right, form wrong | Over the word limit, wrong part of speech, not verbatim, plural/singular | completion, short_answer |
| `ran_out_of_time` | Not a comprehension error at all | Blank or a guess under time pressure | all |

Two rules for using it: (a) `ran_out_of_time` and `form_error` must be separable in the stats,
because they need pacing and instruction fixes respectively, not reading fixes; (b) the learner's
*self-selected* code and the *authored* code are both stored — the disagreement rate is itself a
metacognition metric worth showing.

### 2.4 The right-for-the-wrong-reason problem

Reading has a high guess floor: TFNG is 1-in-3, a heading is 1-in-9 or so, MCQ 1-in-4. A learner
scoring 26/40 with a guess rate of 20% is not a band 6 reader; they are a band 5 reader with luck,
and their score will collapse under exam stress. The only cheap instrument that exposes this is a
**confidence tag at answer time** (sure / fairly sure / guess), which the calibration research
supports directly. It yields:

- **Lucky rate** = correct ∧ guessed. High → your real level is below your score; drill technique.
- **Unlucky rate** = wrong ∧ sure. High → you hold a wrong rule confidently; this is the most
  urgent thing to fix and the review must open on these first.
- **Calibration curve** — a one-line summary ("when you said 'sure' you were right 71% of the
  time") that is far more motivating and more honest than a band.

Cost: one tap per question, optional, off by default in exam-conditions mode.

---

## 3. Timed versus untimed, and how to sequence them

### 3.1 The arithmetic nobody shows the learner

Academic: 3 passages, ~2,150–2,750 words, 40 questions, **60 minutes, no transfer time**. That is:

- **90 seconds per question**, *including* all reading. Not 90 seconds of thinking.
- The conventional split is **15 / 20 / 25 minutes** across the three passages — deliberately
  front-loading speed on the easiest text to bank minutes for the hardest. Practitioner consensus,
  and it matches the difficulty gradient.
- Checkpoints: **~13–14 answers by 20 minutes, ~26–27 by 40 minutes.** These are the two numbers a
  learner should have in their head; everything else about pacing follows from them.
- **The 90-second abandon rule**: if a single question has consumed 90 seconds, mark it and move.
  One rescued mark at the end of passage 3 is worth more than one recovered mark in passage 2, and
  the emotional cost of being stuck is what causes the collapse in the last ten minutes.
- GT: same 60 minutes, but the band table is harsher at the top (40 for a 9.0; 34–35 for 7.0
  against 30–32 in Academic), so the marginal value of the last few marks — and therefore of
  pacing — is higher.

Show this arithmetic. Most learners have never done the division.

### 3.2 The sequencing ladder for the accurate-but-slow learner

This is the most common profile in the target population: a learner who scores well on untimed
practice and 5.5 on the clock. Speed must be built **on top of** accuracy, never traded against it,
and never introduced before the technique is stable — otherwise you are training fast wrong
answers. Four stages, each with an explicit exit criterion:

| Stage | Mode | Timer | Exit criterion |
|---|---|---|---|
| **1. Accuracy first** | Single passage, untimed. Full review protocol on every miss. | none, but **elapsed time is recorded and shown** | ≥ 80% correct on a passage at the target band, twice running |
| **2. Generous clock** | Single passage | 25 min (≈ 125% of exam pace) | ≥ 75% correct, finishing inside the timer, twice running |
| **3. Exam pace, one passage** | Single passage | 20 min hard | ≥ 70% correct, finishing, twice running |
| **4. Full paper** | 3 passages | 60 min, auto-submit | benchmark; run every 2–3 weeks, not weekly |

Rules that make the ladder work:
- **Never remove the clock entirely at stage 1** — record it invisibly. A learner who takes 47
  minutes on one passage needs to know that, but not to be punished for it yet.
- **Move one stage at a time, and drop back on failure** without ceremony.
- **Accuracy is the gate, always.** If accuracy falls when the timer tightens, the diagnosis is
  usually not speed — it is that the technique was never automatic, so it collapses under load.
- Interleave stage 2/3 sessions with type drills (§5); do not run five timed passages in a row.

### 3.3 Where the minutes actually go

Per-question timing data (we already store `time_ms`) supports a **time forensics** view that is
much more actionable than a timer: *"You spent 11 of your 60 minutes on 4 questions, and got 1 of
them right. Those 4 questions were worth 4 marks. In the same 11 minutes you left 6 questions
blank."* That sentence changes behaviour in a way no strategy article does.

---

## 4. Building speed without losing accuracy

### 4.1 What the evidence supports

- **Timed reading + repeated reading + extensive reading** produce reliable silent-reading rate
  gains while comprehension holds: a 12-week programme reported **+46 standard wpm with ≥75%
  comprehension**; a year-long four-group study found all fluency-treatment groups made significant
  rate gains without comprehension loss, and the group with the broadest treatment gained most;
  another reported **+50 wpm on controlled texts, +30 on other text types at ~70% comprehension**.
- The mechanism is not eye-training. It is **automaticity** — fewer regressions, faster word
  recognition, wider chunking through *repeated exposure to comprehensible text*, plus the
  vocabulary threshold effects in §6.
- Therefore: **a wpm figure is only meaningful with a comprehension floor attached.** Any speed
  metric we ship must be gated at ≥ 70–75% comprehension or it is a vanity number that rewards
  skimming without reading. This is a hard product rule.
- Realistic expectation to set with learners: on the order of **+3 to +5 wpm per week** sustained
  over 10–12 weeks with near-daily short sessions. Not "double your speed in a week."
- Practitioner ranges for orientation: adult readers ~200–300 wpm; a fluent reader handles an
  ~800-word academic text in roughly 4–5 minutes; a learner reading at 100 wpm needs ~8 minutes per
  text and has ~12 minutes left for 13 questions, which is the arithmetic of a 5.0.

### 4.2 Three gears, not one speed

The single most useful thing to teach here is that "reading speed" is three different behaviours
and the exam needs all three. Targets are for a band-7 candidate on band-7 material:

| Gear | Purpose | Target rate | Share of the passage | Trained by |
|---|---|---|---|---|
| **Survey / skim** | Build a paragraph map: what each paragraph is *for*, in 4–6 words | 250–350 wpm | 100% of it, once, ~2–3 min for 850 words | timed gist drill with a 3-question comprehension floor |
| **Scan / locate** | Find the zone that answers *this* question | not a wpm task — measure **median locate time; target < 12 s per target** | jumping, non-linear | keyword-locate drill (already specced) |
| **Close read** | Decide the answer on the evidence sentence and its neighbours | 100–150 wpm — deliberately *slower* than normal | 5–10% of the passage | TFNG decision drills, paraphrase gym |

The failure mode of speed advice is that learners apply the skim gear to close reading, which
converts a comprehension problem into a trap-vulnerability problem. Say explicitly: **the close-read
gear is meant to be slow; the time comes from the survey gear and from not being stuck.**

---

## 5. Does drilling one question type transfer?

### 5.1 An honest reading of the evidence

- Explicit strategy instruction has **moderate to large** effects on L2 comprehension, but with very
  wide variance, and the reviews that decompose it find the gains concentrated where instruction is
  **cognitive + direct + applied to real texts** rather than taught as decontextualised procedure.
- One intervention study explicitly testing **transfer to unseen texts without strategy prompting
  found the overall effect not statistically significant** — a caution worth taking seriously.
  Transfer is not automatic.
- Deliberate practice requires goal + immediate feedback + repetition + difficulty just above
  current level. Isolated type drilling satisfies these *if and only if* we supply the feedback and
  the goal; a bare drill of ten TFNG with a score at the end does not.
- Depth-of-processing work says the effort matters: tasks that force deeper processing produce
  better retention than tasks that are merely repeated.

### 5.2 The resolution — what we should actually build

**Drill the technique in isolation; verify it in a whole passage.** Concretely:

1. Type drills are **short (5–10 items), feedback-immediate, and explanation-mandatory** — the
   worked solution opens automatically on every miss, and the trap picker fires. Never a silent
   20-item block with a score at the end.
2. Drills are prescribed **from the diagnostic**, not chosen at random: the weakest *trap*, not just
   the weakest type. "You lose most marks to `scope_shift` — here are 8 items across three types
   that turn on quantifiers" is a better drill than "10 TFNG."
3. **Interleave.** After 2–3 blocked sessions on one type (blocking is right while a technique is
   being acquired), switch to mixed sets. Mixed practice is harder and feels worse, and it is what
   the exam is.
4. Every drill ends with a **transfer check**: the next single-passage session reports the drilled
   type's accuracy in context. If drill accuracy is 80% and in-passage accuracy is 50%, the problem
   was never the type — it is location or time (§1.2).
5. Drills present **anchor paragraphs only** (already specced) — correct for technique training,
   but it removes the locate step, which is exactly why the transfer check in (4) is necessary.

### 5.3 Per-type attack table — the strategy payload

Compact and complete; this is what the per-type coaching content must cover, and it doubles as the
authoring brief for Part B. "In order" = keyed answers follow passage order.

| Type | In order | Where the answer lives | Attack | Time budget | Dominant traps |
|---|---|---|---|---|---|
| `matching_headings` | **No** | The paragraph's controlling idea, usually but not always in the first or last sentence | Read headings first and group the near-identical ones; summarise each paragraph in ≤ 6 words *before* looking at the list; place the certain ones and eliminate; do the ambiguous pairs last | ~60–75 s/para | `detail_for_main_idea`, `lexical_lure` |
| `true_false_not_given` | **Yes** | One sentence, occasionally two adjacent | Break the statement into its claim + its qualifiers; locate the topic; ask *contradicted? stated? silent?* in that order; never reason beyond the sentence | 60–75 s | `absence_read_as_contradiction`, `causal_link_assumed`, `scope_shift`, `outside_knowledge` |
| `yes_no_not_given` | **Yes** | A stance sentence — the writer's, not a cited source's | Same procedure, but first establish *whose* view the text is expressing | 60–90 s | `attribution_shift`, `hedge_stripped` |
| `matching_information` | **No** | Anywhere; letters may repeat | Do it **last**, when the paragraph map already exists; work from the question's distinctive noun | 45–60 s | `lexical_lure`, `neighbour_answer` |
| `matching_features` | **No** | Clustered around named entities | Scan for the names first and mark them; then read each statement against its named zone | 45 s | `attribution_shift` |
| `matching_sentence_endings` | **Yes** | One sentence | Use grammar to shortlist (the stem's final word constrains the ending), then check meaning against the text — never grammar alone | 45–60 s | `partial_condition`, `lexical_lure` |
| `sentence_completion` | **Yes** | One sentence | Predict the part of speech and likely meaning from the gap *before* scanning; copy verbatim; count the words | 30–45 s | `form_error`, `neighbour_answer` |
| `summary_completion` (free) | Within its section | The section the summary covers, in order | Identify which part of the passage is summarised first — this is the step learners skip | 30–45 s | `form_error`, `paraphrase_missed` |
| `summary_completion_bank` | Within its section | ditto | Eliminate on grammar first, then on meaning; bank options include right-meaning-wrong-form lures | 30 s | `form_error`, `lexical_lure` |
| `note_completion` | Usually | Contiguous region | Read the note skeleton as a structure — the headings tell you the passage region | 30 s | `form_error` |
| `table_completion` | Usually | Contiguous region | Read **across rows**, and use the column header as the semantic constraint | 30 s | `neighbour_answer` |
| `flow_chart_completion` | Usually | A process description | Map chart steps to passage sentences before filling anything; watch for passive-voice restatement | 40 s | `time_shift`, `form_error` |
| `diagram_labelling` | Often not | The paragraph describing the object | Orient the diagram against the text's spatial vocabulary first; labels often run clockwise/left-to-right | 40 s | `paraphrase_missed` |
| `multiple_choice` | **Yes** | A short zone; all four options usually touch it | Locate the zone first, then evaluate options against the text — never options first | 75–90 s | `partial_condition`, `scope_shift`, `outside_knowledge` |
| `short_answer` | **Yes** | One sentence | Answer form is fixed by the question word; copy verbatim | 30 s | `form_error` |

The "in order" column has a direct authoring consequence and a direct UI consequence — see §11 and
feature F9.

---

## 6. Vocabulary from reading, without producing a word list

### 6.1 The thresholds that matter

- **98% lexical coverage** is the widely cited optimal threshold for unassisted comprehension
  (≈ the 6,000–8,000 most frequent word families); **95%** is the minimal threshold (≈ 4,000–5,000
  families). The 98% figure comes from a small original study and has been replicated and
  contested — treat it as a design heuristic, not a law.
- At 98% coverage, **2% of tokens are unknown** — about 17 words in an 850-word passage. That is
  *the level at which comprehension is possible*, not the level at which it is comfortable.
- The **AWL covers ~10% of academic text** (replicated at 10.0 / 10.6 / 11.6 / 10.07% across
  studies), on top of ~80% from high-frequency general vocabulary. So a genuinely academic register
  is ≈ 9–11% academic vocabulary — a useful calibration target for authoring (see §12).
- Words need roughly **8–10 encounters** for reliable learning of several aspects of knowledge, and
  the *informativeness of the context* matters as much as the count: the cumulative effect of
  repeated encounters appeared only in informative contexts.

### 6.2 The mining rule

The failure mode is obvious and universal: the learner highlights forty words, exports a list,
studies none of it, and has learned nothing about reading. Three rules kill it:

1. **Mine only what blocked an answer.** A word you didn't know and didn't need is not worth a
   card. The app already knows which questions were missed and which paragraphs they anchor to —
   restrict the "add to deck" prompt in review to *unknown words inside the evidence spans of missed
   questions*. Everything else is a lookup, not a card. Cap it: **≤ 5 items per passage.**
2. **The unit is the paraphrase pair, not the word.** For reading, the item worth learning is
   `text_phrase ↔ stem_phrase` — "cost roughly half as much ↔ cheaper" — because that is the thing
   that will be tested again. A single-headword card teaches a definition; a pair card teaches the
   recognition move. This is reading's answer to the collocation-first rule the speaking pack
   already enforces.
3. **Keep the sentence.** Cards carry the source sentence, the passage id and the paragraph id
   (the vocab-suggestion payload already supports this). Context is what makes the repeated
   encounters productive.

### 6.3 Where the encounters come from

Eight to ten encounters do not come from one passage. They come from (a) the SRS deck, (b) the same
word recurring across topically clustered passages — a reason to author passages in topic clusters,
so a learner working the "materials science" cluster meets the same academic vocabulary five times
in a week — and (c) extensive reading outside the app, which we should recommend and not try to
own.

---

## 7. Paraphrase recognition — the trainable core

Every practitioner source converges on this and it is consistent with what the item types actually
require: the exam almost never repeats the passage's wording in the question. What varies is
*which transformation* was applied. A closed transformation set is worth authoring against, because
it turns a vague skill into a drillable inventory:

| Code | Transformation | Illustration (original) |
|---|---|---|
| `synonym` | Lexical substitution | *scarce* → *in short supply* |
| `nominalisation` | Verb ↔ noun phrase | *the population grew* → *population growth* |
| `voice` | Active ↔ passive | *engineers redesigned it* → *it was redesigned* |
| `antonym_negation` | Negated opposite | *rarely fails* → *is usually reliable* |
| `superordinate` | Specific → category | *maize, wheat and rice* → *staple crops* |
| `causal_flip` | Cause ↔ effect ordering | *demand rose because prices fell* → *falling prices drove demand* |
| `quantifier_restatement` | Number ↔ expression | *from 20% to 40%* → *doubled* |
| `clause_restructure` | Subordination changes | *although X, Y* → *Y despite X* |
| `definition_swap` | Term ↔ its gloss | *photovoltaic panels* → *panels that convert light to electricity* |

**Design consequence.** Because we author every item with an `evidence_quote` and a stem, we get a
paraphrase corpus for free: (stem_phrase, text_phrase, transformation) triples. That corpus is a
drill generator — "which of these four phrases means the same as the underlined text?" — at
essentially zero marginal content cost. See feature F5; it is the highest ratio of learner value to
build cost in this document.

---

# PART B — ITEM WRITING

Everything in Part B is a constraint on the authoring agents. It exists because a teaching payload
attached to a broken item teaches a broken rule.

## 8. What makes a reading item fair

### 8.1 The five fairness tests

Every item must pass all five. These are lintable by a human reviewer in seconds and mostly
checkable by the blind re-answer pass (§13).

1. **Findable.** There is an identifiable span of text — nameable, quotable, ≤ ~2 sentences — that
   decides the answer. If the answer requires synthesising four scattered paragraphs, it is a
   different (and usually unfair) construct. Our schema enforces this structurally by demanding
   `evidence_quote` as a verbatim substring; do not let authors satisfy it mechanically with a span
   that doesn't actually decide anything.
2. **Unique.** Exactly one option/answer is defensible. The test: can I write a one-sentence
   argument for a second option that a reasonable band-7 reader would accept? If yes, the item is
   broken — fix the text or the option, do not add a note.
3. **Closed.** No outside knowledge is required or rewarded, and no outside knowledge *contradicts*
   the key. Both directions matter: an item that is answerable from general knowledge without
   reading is as invalid as one that needs knowledge we didn't supply.
4. **Independent.** The item does not give away, or depend on, another item. Watch for two questions
   keyed to the same sentence, and for a heading whose wording answers a later TFNG.
5. **Construct-relevant.** It tests reading — locating, paraphrase recognition, inference within the
   text, discourse structure — not memory of the passage, not general knowledge, not arithmetic.

### 8.2 The evidence-span discipline

Write the evidence span **first**, then the item. Authors who write the stem first drift into items
whose answer is "sort of in paragraph C." Practical rules:

- The span is the **minimum** text that forces the answer. If you need 60 words, you are anchoring
  the wrong thing or the item is unfair.
- Two items must not share the same span unless the type requires it (a summary of one section may
  legitimately cluster). Overlapping spans create `neighbour_answer` confusion that is *our* fault,
  not the learner's.
- Spread the spans. In a 13-question passage, spans should touch **most paragraphs**; a passage
  where 9 of 13 answers sit in paragraphs D–E is a badly built item set and will teach a false
  scanning heuristic.
- For **NOT GIVEN** items there is no evidence span by definition. Instead author a
  `nearest_text` field — the sentence that *tempts* — plus a statement of what it does and doesn't
  say. Never leave an NG item's explanation empty; the reason for its emptiness is the lesson.

---

## 9. Distractors that tempt for a reason

### 9.1 The principle

A distractor is plausible if it can be **falsified only by means relevant to the construct** and if
it represents a **common misconception**. Applied to reading: the only legitimate way to eliminate
a distractor must be to read the text accurately. Implausible distractors do not increase
discrimination — they simply shorten the item, and the research on nonfunctional distractors is
consistent about that. Cambridge's own stated practice, as reported in the public research
literature, is that all options including the key should sit in a **single coherent
lexico-grammatical category**.

### 9.2 The reading distractor taxonomy — six lures worth writing

Each lure below is a *reason a good reader could be tempted*, and each maps onto a trap code, so the
distractor analysis and the learner's diagnostics use the same vocabulary.

| Lure | Construction | Trap code |
|---|---|---|
| **Word-repeat lure** | Reuse a distinctive content word from the passage in an option that is not supported. The single most effective and most authentic distractor in reading. | `lexical_lure` |
| **Scope lure** | Take a true statement and widen or narrow it: *some regions* → *every region*; *one study* → *research consistently*. | `scope_shift` |
| **Certainty lure** | Strip or add a hedge: the text's *may account for* becomes *accounts for*. | `hedge_stripped` |
| **True-but-not-asked** | A statement that is entirely accurate about the passage but does not answer *this* question. Punishes reading the options before the stem. | `neighbour_answer` |
| **Half-right compound** | Two clauses; one supported, one not. Punishes stopping at the first match. | `partial_condition` |
| **Plausible-world lure** | Something obviously true in the world, absent from the text. Punishes outside knowledge — and doubles as excellent NG material. | `outside_knowledge` |

### 9.3 Flaws that leak the key — a do-not-do list

Straight from the item-writing-flaw literature; every one of these lets a test-wise candidate score
without reading, which corrupts both our items and any statistics we compute from them.

- **Length cue.** The key must not be the longest option (nor the shortest). Keep options within
  ~20% of each other in length. This is the most frequently violated rule in amateur item sets.
- **Absolutes.** Avoid *always / never / all / none* in options — candidates rightly learn to
  eliminate them, so an absolute distractor is free and an absolute key is unfair.
- **Grammatical cue.** Every option must fit the stem grammatically. In `matching_sentence_endings`
  and `summary_completion_bank` this is the *entire* discipline: if only one ending is grammatical,
  the item tests nothing. Ensure **at least three** endings are grammatically viable for each stem.
- **Convergence.** Do not build options that share features so the key is derivable by
  overlap-counting.
- **Word clueing / stem repetition.** If a distinctive word from the stem appears in exactly one
  option, that option is now the answer regardless of the text.
- **"All of the above" / "None of the above."** Not used in this exam. Don't invent them.
- **Negated stems.** Avoid; if unavoidable, mark the negation typographically and never combine
  with negated options.
- **Option order.** Keys must be distributed roughly evenly across A/B/C/D and across the roman
  numerals in headings — a run of four Cs is a real, checkable defect.

### 9.4 A caution from the research

A 2026 study comparing item writers' intentions with test-takers' reported processes found that
what writers *think* an item measures often diverges from what candidates actually do to answer it.
The practical implication for us: **the `why_tempting` field must describe a real candidate
process**, not the author's theory. Where possible, write it after doing the blind re-answer pass
(§13) and seeing what a naive solver actually picks.

---

## 10. The Not Given discipline — where amateur item-writing fails

### 10.1 The two failure modes

- **Failure A — "not given" really means "well hidden."** The author writes a statement that *is*
  supported, but three paragraphs away and heavily reworded, keys it NOT GIVEN, and has now taught
  the learner that not finding something means it isn't there. This is a catastrophic lesson,
  because the correct behaviour when you can't find something is to look harder in the right zone,
  not to answer NG.
- **Failure B — "not given" that's really FALSE (or the reverse).** The author's own F/NG boundary
  is fuzzy, so the key is arguable. Every arguable NG key we ship destroys trust in the entire bank
  the moment a learner disputes it — and TFNG is precisely the type where they will.

### 10.2 The construction procedure — build NG deliberately, never by accident

**Do not write a statement and then decide what it is.** Write to the target key. For NOT GIVEN:

1. Choose a sentence in the passage that is unambiguously about topic X.
2. Write a proposition that is **adjacent** to it — same topic, same entities, same register — and
   about which the passage is genuinely silent. The productive adjacencies are:
   - **the cause** the writer never gives (`causal_link_assumed` — the richest source);
   - **the comparison** the writer never makes (two facts stated, never compared);
   - **the motive or intention** behind a described action;
   - **the consequence or outcome** of a described event;
   - **the evaluation** — whether it was successful, popular, expensive;
   - **the extension in time or place** — whether it still happens, whether it happened elsewhere.
3. Apply the **silence test**, explicitly: *"Which sentence would have to exist in this passage for
   this to be TRUE? Which for FALSE?"* If you can name either sentence and it exists, the key isn't
   NG. If you can name neither and it exists nowhere, you have a clean NG.
4. Apply the **adversarial test**: hand the statement to a solver who wants it to be FALSE. If they
   can point at a sentence and argue contradiction, it's FALSE or it's broken.
5. Record `nearest_text` — the tempting sentence — and write the distractor analysis around it.

For FALSE, the mirror discipline: there must be a **specific, quotable contradiction**. Not "the
passage implies otherwise." Not "the tone suggests." A sentence that denies it. If your only
argument is inference, your key is NOT GIVEN.

For TRUE: the statement must be **fully** supported — every clause and every qualifier. A statement
whose main clause is supported and whose qualifier isn't is not TRUE (it is usually NG, sometimes
FALSE). This is where the `partial_condition` and `scope_shift` traps come from, and they should be
written on purpose.

### 10.3 The decision grid (this is also learner-facing content)

| Is the topic addressed in the passage at all? | Does the text state or entail the claim, including its qualifiers? | Does the text state something incompatible? | Key |
|---|---|---|---|
| Yes | Yes, fully | — | **TRUE** |
| Yes | No | Yes, specifically | **FALSE** |
| Yes | No | No — the text is silent on this aspect | **NOT GIVEN** |
| No | — | — | **NOT GIVEN** |

Note the second row's word *specifically*. And note that "the topic is discussed" is never
sufficient for TRUE — that conflation is the source of most learner errors.

### 10.4 Group-level rules

- **Every TFNG group must contain at least one of each key.** This is a genuine property of the
  exam, learners know it, and violating it makes our content feel wrong.
- Target distribution per group of 5–7: roughly **2–3 TRUE, 2 FALSE, 1–2 NOT GIVEN**. Never more
  than two consecutive identical keys.
- **Never mix TFNG and YNNG in one group** (the validator already rejects this).
- **YNNG is about the writer's stance**, and the discipline that makes it hard and fair is the
  distinction between *the writer's view*, *a view the writer reports*, and *a view the writer
  reports in order to reject*. Author at least one item per YNNG group that turns on exactly that,
  and pair it with the `attribution_shift` trap code. It requires the passage to actually contain
  attributed opinions — which is a constraint on the passage brief, not just the item.

---

## 11. Order, sequencing and group architecture

- **Keyed answers follow passage order** for TFNG, YNNG, MCQ, sentence/summary/note/table/flow-chart
  completion (within the section summarised) and short answer. They do **not** for matching headings,
  matching information, matching features, and often not for diagram labelling. See the table in
  §5.3.
- **Authoring consequence.** For in-order types, sort the group by the position of its evidence span
  before assigning question numbers, and **lint it**: a group whose spans run A, C, B, E is a defect
  even though nothing in the schema forbids it. This is a cheap, mechanical check we should add —
  compute each span's character offset in the concatenated passage and assert monotonicity for
  in-order types.
- **Group order across a passage** should mirror the real paper's logic: headings first (they force
  a global read and leave the candidate oriented), detail types in the middle, and a global
  question (best title, writer's overall purpose) last if used at all.
- **Anchor spread** (from §8.2) is a per-passage lint, not per-group.
- **Never let two groups key the same span**, and never let a heading's text hand over a later
  item's answer.

---

## 12. Pitching passage difficulty — what makes band-6 material band-8 material

### 12.1 The levers, ranked by how much they actually move difficulty

1. **Propositional / information density** — how many distinct claims per 100 words, and how many
   are qualified. The strongest lever and the least discussed.
2. **Abstraction** — concrete entities and events vs. processes, models, and claims about claims.
   A passage about how a bridge was built is easier than a passage about how engineers decide what
   counts as an acceptable risk, at identical readability scores.
3. **Cohesion explicitness** — how much of the connective tissue is stated (*because*, *however*,
   *as a result*) vs. left to be inferred. Removing connectives raises difficulty sharply and is
   the cleanest way to make a text harder without making it uglier.
4. **Lexical sophistication** — proportion of academic and low-frequency vocabulary. AWL-type
   coverage of ~10% is the authentic academic level.
5. **Syntactic complexity** — embedding depth and clause count. Note that **mean sentence length
   alone is a weak predictor** across levels: research aligning linguistic complexity with CEFR
   found sentence lengths are not proportional to level above A-level. Use it as a guardrail, not as
   the dial.
6. **Rhetorical structure** — chronological/descriptive (easy) → problem-solution (mid) →
   argument with counter-argument and hedged conclusion (hard). This lever is what makes YNNG items
   possible at all.

### 12.2 Authoring parameters by band target

Reconciling the plan document's generation defaults with the coverage research. Treat as targets
with tolerance, not as pass/fail gates except where marked.

| Parameter | Band ~6 | Band ~7 | Band ~8 |
|---|---|---|---|
| Word count | 700–850 | 800–900 | 850–950 |
| Paragraphs | 6–8 | 7–9 | 7–9 |
| Mean sentence length (guardrail) | 15–18 | 18–21 | 20–24 |
| Longest sentence | ≤ 32 | ≤ 38 | ≤ 45 |
| Academic (AWL-type) vocabulary | 5–7% | **8–11%** | 10–12% |
| Unknown-to-target-reader tokens | ≤ ~1.0% (≈ 8/850) | ≤ ~1.5% (≈ 12/850) | ≤ ~2.0% (≈ 17/850) — **hard cap** |
| Explicit connectives | high | moderate | sparse |
| Abstraction | concrete events, described processes | processes + one contested claim | competing interpretations, hedged conclusions |
| Attributed opinions | 0–1 | 2–3 (enables YNNG) | 3–4, at least one the writer rejects |
| Numbers / quantified comparisons | 2–3 | 3–4 | 4–5, at least one requiring a restatement |
| Flesch–Kincaid grade (guardrail only) | ~10 | ~12 | ~14 |

**Two corrections to the current generation defaults, argued:**

- The plan's band-8 target of **12% AWL is above authentic academic prose** (~10%). Pushing lexical
  sophistication past the authentic level to manufacture difficulty produces text that reads
  synthetic and, worse, makes items turn on vocabulary rather than reading. **Raise band-8
  difficulty through levers 1–3 and 6 (density, abstraction, implicit cohesion, argument structure)
  and hold AWL at 10–12%.** This is the single most important calibration note in Part B.
- The **≤ 2% unknown-token cap is a hard rule at every band**, from the 98% coverage threshold. It
  has a corollary that must be linted: **no keyed answer may depend on an off-list word whose
  meaning is not recoverable from its own sentence.** Otherwise we are testing vocabulary and
  calling it reading.

### 12.3 Item difficulty is a separate dial from text difficulty

Do not conflate them. A band-8 *passage* can carry band-5 items and vice versa. Item-level
difficulty comes from: distance between stem wording and text wording (paraphrase depth); whether
the evidence is in one sentence or spans two; how plausible the best distractor is; whether
qualifiers are load-bearing; and whether the answer requires resolving an anaphor or an attribution.
Each authored question already carries `difficulty` and `band_target` — use them for *item*
difficulty and keep the passage's `band_target` for *text* difficulty. **A well-built passage set
should span roughly band 5.5 to band 8 in item difficulty regardless of the passage's own level**,
because that is what discriminates.

---

## 13. Validation — making a key defensible

### 13.1 The blind re-answer check, and what it actually catches

The pipeline already specifies a blind re-answer stage. Its value is worth stating precisely,
because it should also be run over **human-authored** content, not only generated content.

A solver who sees the passage and the questions but not the key will catch:

- **items with two defensible answers** — the solver picks the other one, confidently;
- **NG items that are actually TRUE/FALSE** — the solver quotes a sentence we thought didn't exist.
  This is the highest-value catch in the whole pipeline;
- **unfindable answers** — the solver reports low confidence and no evidence;
- **answerable-without-reading items** — run a **second, passage-free pass**: give the solver the
  questions with no text. Anything it gets right at high confidence is testing world knowledge, not
  reading. This is a cheap, powerful check that the current plan does not include and should.
- **word-limit and form violations** — the solver produces a three-word answer to a two-word item,
  revealing that the natural phrasing doesn't fit the limit.

What it does **not** catch: items that are fair but trivially easy, distractors that are
non-functional, and mis-set difficulty. Those need human review or, later, response data (§13.3).

Confidence handling: agreement at high confidence = pass; disagreement = repair or discard;
**agreement at low confidence = review**, because it often signals an item that is right but
unfindable. And note the base rate reported in the LLM item-generation literature: roughly
**two-thirds of LLM-generated questions fail to meet quality objectives**, so plan on generating
~3× what you keep, and never ship generated items unbadged.

### 13.2 Static checks worth adding to the validator

All of these are mechanical, need no LLM, and are cheap. (Reported as suggestions for the verify
agent — this document does not modify the validator.)

1. `evidence_quote` is a verbatim substring of its anchor paragraph — *already specified*.
2. In-order types: evidence-span offsets increase monotonically with question number.
3. Anchor spread: no paragraph holds more than ~40% of a passage's answers; ≥ 70% of paragraphs are
   touched.
4. No two questions share an identical evidence span (unless same summary group).
5. Keyed text answers satisfy their own `word_limit` — *already specified*.
6. Keyed text answers appear verbatim in the passage for completion/short-answer types.
7. Option-length balance: max option length ≤ 1.4× min within a group.
8. Key distribution: no more than 2 consecutive identical keys; TFNG groups contain ≥ 1 of each.
9. Absolutes (*always/never/all/none*) not present in the key of an MCQ item.
10. Distinctive stem words do not appear in exactly one option.
11. Every question has non-empty `explanation` + `paraphrase_link`; every wrong option in a
    lettered type has a `why_tempting`.
12. `trap_code` ∈ the §2.3 enum or explicitly null.
13. NG items carry `nearest_text` and no `evidence_quote`.

### 13.3 Once we have response data

Facility (proportion correct) and discrimination become available as soon as attempts accumulate.
Useful thresholds from the item-analysis literature: facility roughly **0.30–0.70** is the
productive band for a proficiency test; discrimination **≥ 0.25** with higher being better. Also
track **distractor take-up**: an option chosen by <5% of candidates is non-functional and should be
rewritten. This is a later-phase feature (F15) but the data model should not preclude it — per-item
response counts are already implied by attempt storage.

---

# PART C — FEATURE WISHLIST FOR BANDREADY'S READING MODULE

Ranked by learner impact against build cost. Impact is judged against Part A's theses: does it make
the review unavoidable, does it train paraphrase recognition, does it fix pacing? Cost assumes the
existing UI (browser, split player, all answer inputs, review, results, dictionary popover, drill
pane) and the existing schema's `extra="allow"` tolerance, so most of these are additive fields
plus renderer work.

## Tier 1 — build first

### F1 — The Solution Card, gated behind the attempt · impact very high · cost M

The reading counterpart to the speaking/writing coach gate. On the review screen, each question
expands into a five-part card in a fixed order: **Location → Paraphrase link → Decision rule →
Distractor autopsy → Rule to reuse** (§2.2). It is unavailable until the attempt is submitted, and
per-question it stays collapsed until the learner has completed the self-diagnosis (F2).

On screen: clicking the card's **Location** row highlights the evidence span in the passage pane and
flashes the anchor paragraph (already specced). The **Paraphrase link** row renders as two chips —
the stem phrase and the text phrase — joined by a labelled arrow naming the transformation. The
**Distractor autopsy** renders one row per wrong option with `why_tempting` in normal weight and
`why_wrong` in muted; the option the learner actually chose is pinned to the top and outlined.

Content fields required: `paraphrase_link`, `decision_rule`, `distractor_analysis[]`,
`reusable_rule`, `trap_code`, `nearest_text` (NG only). Everything else exists.

### F2 — Self-diagnose before reveal · impact very high · cost S

On every wrong answer the review opens with two questions and nothing else: *"Where was the answer?"*
(select a span in the passage) and *"What went wrong?"* (pick from the §2.3 trap list, filtered to
the codes plausible for that type — usually 5–7 options). Only then does the Solution Card unlock.

This is the cheapest high-impact feature in the document. The evidence is direct: learners who can
explain their own corrections improve; learners who read explanations passively do not. It also
generates the disagreement metric (self-selected vs authored trap code) that powers F3.

Escape hatch: "I don't know" is always an option and is itself informative.

### F3 — Trap profile, not just type breakdown · impact very high · cost S–M

The results and progress screens gain a second axis. Today: "TFNG 2/6." Tomorrow, additionally:
*"You lost 9 marks to three traps: absence read as contradiction (4), scope shift (3), outside
knowledge (2)."* Each is a button that assembles a drill of items carrying that trap code across all
types and passages.

This is what turns the taxonomy from a content field into the product's diagnostic spine. It also
gives the drill engine something better to select on than `qtype`, which is what §5.2 argues for.

### F4 — Time forensics · impact very high · cost S

Post-submission panel built from data we already store (`time_ms` per question):

- a stacked bar of minutes per passage against the 15/20/25 benchmark;
- the checkpoint line: "at 20 min you had 9 answers; target is 13–14";
- **the money sentence**: "4 questions cost you 11 minutes and returned 1 mark; 6 questions were
  left blank";
- the three-way diagnosis from §1.2 with one recommended next action.

During the test, a lightweight **pacer** in the timer bar: a second marker showing where you should
be, and a one-time nudge at 90 seconds on a single question ("mark it and move" — suppressible,
off in exam-conditions mode).

### F5 — Paraphrase Gym · impact very high · cost M

A drill type that costs almost no new content because it is generated from the item bank's
`paraphrase_link` triples (§7). Three formats, 60–90 seconds each:

- **Match**: four text phrases, four stem phrases, pair them.
- **Spot**: one stem phrase, four candidate text phrases — three are word-overlap lures, one is the
  real paraphrase. (The lures come free from other items' distractors.)
- **Name it**: given a real pair, name the transformation from the §7 list.

Feed it from the learner's own missed items first, then from their topic clusters. This directly
trains Thesis 2's subskill and is the best value-per-build-hour item here.

### F6 — TFNG / YNNG Decision Trainer · impact very high · cost M

The highest-loss types deserve a bespoke trainer rather than a generic drill. One short text
excerpt (2–4 sentences) and one statement. The learner answers T/F/NG **and then must justify**:

- if TRUE or FALSE → select the deciding words in the excerpt;
- if NOT GIVEN → select from a short list which *aspect* is missing (the cause / the comparison /
  the outcome / the evaluation / the time or place — the same adjacency list authors used in §10.2).

Immediate feedback with the decision grid (§10.3) shown alongside. Progress is tracked as a
confusion matrix — the F-answered-NG and NG-answered-F cells are the two numbers a TFNG-weak learner
should watch, and they map one-to-one onto trap codes.

### F7 — Review gate on new tests · impact high · cost S

Starting a new full test when the previous attempt has unreviewed wrong answers shows an
interstitial: "3 wrong answers from Tuesday's test are unreviewed. Reviewing them takes about 4
minutes and is worth more than this test." Two buttons: *Review now* / *Start anyway*. Skips are
counted and surfaced on the progress screen. Not a hard block — a hard block is paternalistic and
gets uninstalled.

### F8 — The pacing ladder · impact high · cost S

Implement §3.2 as a visible four-stage progression with the stated exit criteria, an
auto-recommended current stage, and copy that explains *why* the untimed stage exists. Single
biggest fix for the accurate-but-slow profile, which is most of the target population. Mostly
configuration of the existing timer plus a small state machine on attempt history.

## Tier 2 — build after Tier 1 lands

### F9 — Confidence tagging and the calibration report · impact high · cost S

One three-state control per question (sure / fairly sure / guess), keyboard-accessible, entirely
optional, off in exam-conditions. Produces the lucky-rate / unlucky-rate / calibration line of §2.4.
Review order defaults to **wrong-and-sure first**, which is the correct clinical priority.

### F10 — Locate-first mode · impact high · cost M

A practice mode in which each question requires you to select the paragraph (or span) you believe
holds the answer *before* the answer input unlocks. Separates the location skill from the decision
skill (§1.2) and makes it measurable. Also the natural place to teach the in-order/not-in-order
distinction: in in-order groups the app can show a soft constraint ("the answer to Q14 is at or
after Q13's").

### F11 — Spaced retry queue · impact high · cost S

Every missed question re-enters at ~48 h and ~7 days, re-served in drill format with its anchor
paragraphs. Direct application of the two highest-utility learning techniques. Cheap: it is a table
and a scheduler; the drill runner already exists.

### F12 — Constrained vocabulary mining · impact medium-high · cost S

Implement §6.2: in review, the "add to deck" affordance is prominent only on unknown words inside
the evidence spans of missed questions, capped at 5 per passage; the card created is a
**paraphrase pair** (text phrase ↔ stem phrase) plus the source sentence, not a bare headword. The
vocab-suggestion endpoint already accepts the context payload.

### F13 — Gist trainer with a comprehension floor · impact medium · cost M

The specced skimming trainer, with one non-negotiable addition: **the WPM figure is only recorded
when gist accuracy ≥ 70%.** Otherwise the metric rewards the wrong behaviour. Show the pair
("265 wpm at 2/3 gist — the speed isn't real yet") and a 12-week trajectory with a realistic
+3–5 wpm/week slope so the learner's expectations are calibrated (§4.1).

### F14 — Next-best-action on the progress screen · impact medium · cost S

One sentence, computed from the three-way diagnosis + trap profile + ladder stage, with a single
button. "Your last two attempts lost most marks to scope shift, and you finished with 9 minutes
spare — technique, not time. 10-item scope-shift drill (6 min)." One recommendation, never a list;
the same discipline the speaking coach already follows.

## Tier 3 — worth doing, not urgent

### F15 — Item health dashboard (authoring-side) · impact medium (indirect) · cost M

Facility, discrimination and distractor take-up per item once response data exists (§13.3), plus a
blind-validation report viewer for generated content. Protects the bank's quality over time and is
the only way we will ever find our own broken NG items.

### F16 — Explain-back check · impact medium · cost S–M

After the Solution Card, the learner types one line stating the rule; a cheap LLM call compares it
to `reusable_rule` and either confirms or corrects. The error-log research suggests the *accuracy of
the learner's own explanation* is what predicts gains — this closes that loop. Keep it optional and
one call, cached.

### F17 — GT-specific drills · impact medium · cost S–M

General Training's Section 1–2 skills are genuinely different: locating a detail in a notice or a
timetable, and reading workplace prose for conditions and obligations (*must*, *is entitled to*,
*unless*). Two micro-drills — **detail-locate under 20 s** and **obligation vs option** — plus
authoring that treats scope/certainty traps as the GT staple. Cheap once GT content exists.

### F18 — Passage difficulty badge with a real basis · impact low-medium · cost S

Compute and display the §12.2 parameters per passage (AWL%, mean sentence length, unknown-token
estimate, FK) so learners pick material near their level rather than by title. Also a useful
authoring lint.

## Explicitly not built

- **Speed-reading eye-training** (chunk widening, peripheral drills, pacing wands). The fluency
  evidence supports timed and repeated reading of comprehensible text, not eye gymnastics. Shipping
  it would be a credibility cost.
- **A band score after every drill.** Self-level feedback on a 10-item sample is noise, and the
  feedback literature is clear that attention moving from the task to the self is where feedback
  starts hurting. Drills report accuracy, time and traps.
- **LLM explanation as the primary explanation.** Authored `explanation`/`decision_rule` first;
  "why was I wrong" is a *second* layer for the learner's specific wrong answer. An LLM that must
  invent the whole solution will occasionally invent the evidence too.
- **Exportable word lists.** §6.2. Mining is constrained on purpose.
- **Reading-aloud / prosody features.** Out of construct for this paper.

## Content-side summary — what the authoring agents must produce per question

Beyond today's `answers[]`, `anchor_paragraphs`, `evidence_quote`, `explanation`, `trap_note`,
`difficulty`, `band_target`:

| Field | Applies to | Notes |
|---|---|---|
| `paraphrase_link` `{stem_phrase, text_phrase, transformation}` | all except pure NG | `transformation` from the §7 enum |
| `decision_rule` | all | ≤ 40 words, in the type's vocabulary |
| `distractor_analysis[]` `{option, why_tempting, why_wrong}` | lettered types; TFNG/YNNG use the two non-keys | `why_tempting` compulsory and non-generic |
| `reusable_rule` | all | ≤ 25 words, passage-independent |
| `trap_code` | all | §2.3 enum or explicit null |
| `nearest_text` | NG/NOT-GIVEN keys | the tempting sentence, plus what it does not say |
| `time_budget_s` | group level | from §5.3, drives the pacer |
| `order_sensitive` | group level | boolean, from §5.3, drives the lint and F10 |

And per passage: the §12.2 parameters (`awl_pct`, `mean_sentence_length`, `unknown_token_pct`,
`abstraction`, `attributed_opinions`) so difficulty is a measured property rather than an assertion.

---

## 14. Where sources disagree, and how I resolved it

1. **Does type drilling transfer?** Strategy-instruction meta-analyses say moderate-to-large; the
   one transfer-specific study I found reported a null overall effect. Resolved by §5.2: drill the
   technique, but require an in-passage transfer check before claiming the type is fixed. We should
   not promise transfer we can't demonstrate — and we can actually demonstrate it, per learner,
   from our own data.
2. **95% vs 98% lexical coverage.** The 98% figure rests on a small original study and has been
   contested in replication work. Resolved by treating 98% as the *authoring* target (so that our
   items measure reading) while acknowledging 95% as the floor at which comprehension is possible.
3. **How much academic vocabulary makes a band-8 passage?** The plan's 12% exceeds authentic
   academic prose (~10%). Resolved in §12.2 in favour of the corpus evidence: hold AWL near
   authentic levels and raise difficulty through density, abstraction, implicit cohesion and
   argument structure.
4. **Sentence length as a difficulty dial.** Readability formulas lean on it; CEFR-alignment
   research finds it flat above A-level. Resolved: guardrail, not dial (§12.1).
5. **Confidence tagging vs exam realism.** Adding a metacognitive control makes practice less like
   the real test. Resolved: on in practice modes, off in exam-conditions mode.
6. **Immediate vs delayed feedback.** The retrieval literature supports both under different
   conditions. Resolved on task grounds: immediate in drills (deliberate practice needs it),
   deferred to submission in tests (the construct includes working without feedback).

---

## SOURCES

**Learning science — retrieval, spacing, feedback, calibration**
- Dunlosky et al. via *The science of effective learning with spacing and retrieval practice*, Nature Reviews Psychology (2022): https://www.nature.com/articles/s44159-022-00089-1
- *Retrieval and spaced practice: study strategies that must be combined*, Evidence Based Education: https://evidencebased.education/resource/retrieval-and-spaced-practice-study-strategies-that-must-be-combined/
- *Testing and spacing: effective learning strategies for the classroom*, Chartered College of Teaching: https://my.chartered.college/research-hub/testing-and-spacing-effective-learning-strategies-for-the-classroom/
- *Spaced retrieval practice: can restudying trump retrieval?*, Educational Psychology Review (2023): https://link.springer.com/article/10.1007/s10648-023-09809-2
- *Retrieval practice enhances new learning: the forward effect of testing*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3983480/
- *Reversing the testing effect by feedback is a matter of performance criterion at practice*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7498445/
- *Improving metacognitive accuracy: how failing to retrieve practice items reduces overconfidence*, Consciousness and Cognition (2014): https://www.sciencedirect.com/science/article/abs/pii/S1053810014001469
- *Enhanced monitoring accuracy and test performance: incremental effects of judgment training over and above repeated testing*: https://www.sciencedirect.com/science/article/abs/pii/S0959475218308788
- *Calibrating calibration: a meta-analysis of learning strategy instruction interventions to improve metacognitive monitoring accuracy*: https://www.researchgate.net/publication/349179781_Calibrating_Calibration_A_Meta-Analysis_of_Learning_Strategy_Instruction_Interventions_to_Improve_Metacognitive_Monitoring_Accuracy
- *Metacognition and confidence: comparing math to other academic subjects*, Frontiers in Psychology: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00742/full

**Error analysis and error logs**
- *Error logs in the second language classroom: exploring the relationship between learner engagement with written corrective feedback and improvements in writing accuracy*, System (2024): https://www.sciencedirect.com/science/article/abs/pii/S0346251X24001118
- *The role of error analysis in teaching and learning of second and foreign language*: https://www.researchgate.net/publication/281239780_The_Role_of_Error_Analysis_in_Teaching_and_Learning_of_Second_and_Foreign_Language
- *Error analysis and the EFL classroom teaching*, ERIC ED502653: https://files.eric.ed.gov/fulltext/ED502653.pdf

**L2 reading: strategy instruction, fluency, deliberate practice**
- *The effects of explicit reading strategy training on L2 reading comprehension: a meta-analysis*: https://www.researchgate.net/publication/256058095_The_Effects_of_Explicit_Reading_Strategy_Training_on_L2_Reading_Comprehension_A_Meta-Analysis
- *Impact of reading strategy instruction on improvement of strategy use and reading comprehension: a meta-analysis*: https://www.researchgate.net/publication/392698243_Impact_of_reading_strategy_instruction_on_improvement_of_strategy_use_and_reading_comprehension_A_meta-analysis
- *The effects of four instructional strategies on English learners' English reading comprehension: a meta-analysis*, Language Teaching Research (2024): https://journals.sagepub.com/doi/10.1177/1362168821994133
- *The impact of reading strategy instruction on reading comprehension, strategy use, motivation, and self-efficacy in Chinese university EFL students*, SAGE Open (2022): https://journals.sagepub.com/doi/10.1177/21582440221086659
- *The effects of combining timed reading, repeated oral reading, and extensive reading*, ERIC EJ1316861: https://files.eric.ed.gov/fulltext/EJ1316861.pdf
- *The effects of extensive reading, timed reading, and repeated oral reading on Japanese university L2 English learners' reading rates and comprehension over one academic year*, Reading in a Foreign Language (2023), ERIC EJ1399662: https://eric.ed.gov/?id=EJ1399662
- *Promoting L2 reading fluency at the tertiary level through timed and repeated reading*, System (2022): https://www.sciencedirect.com/science/article/abs/pii/S0346251X22000835
- *Deliberate and purposeful practice for second language learning: a framework*, TESL-EJ 29 (2025): https://tesl-ej.org/wordpress/issues/volume29/ej115/ej115a5/ (PDF: https://www.tesl-ej.org/pdf/ej115/a5.pdf)
- *A reading comprehension intervention for dual language learners with weak language and reading skills* (transfer-text measures), JSLHR: https://pubs.asha.org/doi/10.1044/2021_JSLHR-21-00266

**Vocabulary: thresholds, coverage, incidental learning**
- Nation, *How large a vocabulary is needed for reading and listening?* (2006): https://www.lextutor.ca/cover/papers/nation_2006.pdf
- *Unknown vocabulary density and reading comprehension: replicating Hu and Nation (2000)*, Language Learning (2023): https://onlinelibrary.wiley.com/doi/10.1111/lang.12622
- *How does lexical coverage affect the processing of L2 texts?*, Applied Linguistics (2024): https://academic.oup.com/applij/article/45/6/953/7841943
- *Lexical text coverage, learners' vocabulary size and reading comprehension*, ERIC EJ887873: https://files.eric.ed.gov/fulltext/EJ887873.pdf
- *The effects of context and word exposure frequency on incidental vocabulary acquisition and retention through reading*, Language Learning Journal: https://www.tandfonline.com/doi/abs/10.1080/09571736.2016.1244217
- *Learning English vocabulary from word cards: a research synthesis*, Frontiers in Psychology (2022): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.984211/full
- Coxhead's AWL and its ~10% coverage of academic text — *A note on "A new Academic Word List"*: https://www.uni-trier.de/fileadmin/fb2/ANG/Linguistik/Stubbs/teach-coxhead-AWL.pdf; *Frequency analysis of the words in the AWL and non-AWL content words in applied linguistics research papers*, ESP (2009): https://eric.ed.gov/?id=EJ824072

**Item writing, distractors, item analysis**
- *An evidence-based approach to distractor generation*, Cambridge English Research Notes 72: https://www.cambridgeenglish.org/Images/526186-research-notes-72.pdf
- *From item writing to item completion: investigating multiple-choice reading test items through item writer's intentions and test-takers' reported processes*, Language Testing in Asia (2026): https://link.springer.com/article/10.1186/s40468-026-00444-6
- *Test specifications and item writer guidelines in a multi-level exam*, ALTE 2014 (Tucker): http://events.cambridgeenglish.org/alte-2014/docs/presentations/alte2014-john-tucker.pdf
- NBME *Item-Writing Guide: constructing written test questions*: https://www.nbme.org/sites/default/files/2021-02/NBME_Item%20Writing%20Guide_R_6.pdf
- EBMA *Guidelines for writing multiple-choice questions*: https://www.ebma.eu/wp-content/uploads/2019/02/EBMA-guidelines-for-item-writing-version-2017_3.pdf
- *Examining the impact of specific types of item-writing flaws on student performance and psychometric properties of the multiple choice question*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10711986/
- *The impact of item-writing flaws and item complexity on examination item difficulty and discrimination value*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5041405/
- *Nonfunctional distractor analysis: an indicator for quality of multiple choice questions*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7372664/
- *The features of plausible but incorrect options: distractor plausibility in synonym-based vocabulary tests*: https://www.researchgate.net/publication/369865079_The_Features_of_Plausible_but_Incorrect_Options_Distractor_Plausibility_in_Synonym-Based_Vocabulary_Tests
- *Item analysis: how reliable is your test?*, ClarityEnglish: https://blog.clarityenglish.com/item-analysis-how-reliable-is-your-test/
- *Item analysis for language tests*, Radius English: https://www.radiusenglish.com/item-analysis-for-language-tests/
- *Detection of flawed multiple-choice questions in preclinical medical education using item difficulty and discrimination indices*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12805726/

**LLM-generated items — quality and validation**
- *Evaluating reading comprehension exercises generated by LLMs: a showcase of ChatGPT in education applications*, ACL BEA workshop: https://kpzhang.github.io/paper/ACL_SIGEDU.pdf
- *How useful are educational questions generated by large language models?*: https://arxiv.org/pdf/2304.06638
- *Enhancing student learning with LLM-generated retrieval practice questions*: https://arxiv.org/pdf/2507.05629
- *Difficulty-controllable multiple-choice question generation using LLMs and DPO*: https://arxiv.org/pdf/2510.19265
- *LLMs struggle to measure what distinguishes students of different proficiency levels: item discrimination in reading comprehension assessment*: https://arxiv.org/pdf/2606.18709

**Text difficulty and readability**
- *Aligning linguistic complexity with the difficulty of English texts for L2 learners based on CEFR levels*, SSLA: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/aligning-linguistic-complexity-with-the-difficulty-of-english-texts-for-l2-learners-based-on-cefr-levels/DB604DB02A205F0F172D6024137CBFE8
- *CEFR-based sentence difficulty annotation and assessment*: https://arxiv.org/pdf/2210.11766
- *Impact of readability and CEFR levels on EFL materials*: https://www.jetir.org/papers/JETIR2406007.pdf
- *Estimating CEFR reading comprehension text complexity*: https://www.researchgate.net/publication/336065671_Estimating_CEFR_reading_comprehension_text_complexity

**Exam format facts and teaching practice (technique only — no wording reused)**
- IELTS.org — General Training Reading format: https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading
- British Council — *Dealing with True, False, Not Given questions*: https://takeielts.britishcouncil.org/sites/default/files/dealing_with_true_false_not_given_questions.pdf
- British Council — *Dealing with completion questions*: https://takeielts.britishcouncil.org/sites/default/files/dealing_with_completion_questions.pdf
- British Council — GT Reading Section 1 practice: https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/reading/general-training/section-1
- Cambridge English — GT Reading task type 1 (multiple choice) activity: https://www.cambridgeenglish.org/images/ielts-general-training-reading-task-type-1-multiple-choice-activity.pdf
- IDP — Matching headings strategies: https://ielts.idp.com/prepare/article-ielts-reading-matching-headings
- IDP — 14 question types of the IELTS Reading test: https://ielts.idp.com/indonesia/about/news-and-articles/article-question-types-of-ielts-reading-test/en-gb
- IELTS Liz — TFNG essential tips: https://ieltsliz.com/ielts-true-false-not-given-essential-tips/ ; question types overview: https://ieltsliz.com/ielts-reading-question-types/ ; matching headings: https://ieltsliz.com/ielts-reading-matching-headings/ ; GT Reading information: https://ieltsliz.com/ielts-general-training-reading-information/
- IELTS Advantage — TFNG tips and strategy: https://www.ieltsadvantage.com/2015/04/27/ielts-reading-true-false-not-given-tips/
- IELTS-GPT — *How to review your IELTS practice tests effectively*: https://ielts-gpt.com/blog/review-ielts-practice-tests-effectively
- IELTSZone — *Paraphrasing in IELTS Reading*: https://ieltszone.org/paraphrasing-in-ielts-reading/
- IELTS ETC — five matching question types: https://ieltsetc.com/5-ielts-reading-matching-question-types-you-need-to-practise/
- My IELTS Classroom — *How to read faster: skimming, scanning and speed reading*: https://blog.myieltsclassroom.com/how-to-read-faster/
- Iris Reading — speeding up reading for IELTS: https://irisreading.com/how-to-speed-up-reading-in-ielts/
- Learn English Weekly — band 7 reading strategy: https://learnenglishweekly.com/ielts/reading/band-7-strategy ; keywords vs paraphrasing: https://learnenglishweekly.com/ielts/reading/keywords-vs-paraphrasing
- PastPaperHero — time management per passage: https://www.pastpaperhero.com/resources/ielts-reading-strategies-time-management-per-passage
- IELTS Jacky — table and flow-chart completion: https://www.ieltsjacky.com/ielts-reading-table-completion.html
- Edubenchmark — matching sentence endings: https://edubenchmark.com/blog/ielts-reading-sentence-endings-question/ ; summary completion: https://edubenchmark.com/blog/ielts-reading-summary-completion-question/ ; diagram completion: https://edubenchmark.com/blog/ielts-reading-diagram-completion-question/
