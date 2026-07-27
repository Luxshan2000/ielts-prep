# W-R1 — Academic Writing Task 1: operational research briefing

**Purpose.** This is the evidence base for the design agent that defines the writing teaching payload,
and for the authoring agents that write `ac_task1` prompts and `chart_spec` data. It is written to be
*used*, not admired: every section ends in something authorable or lintable.

**Method and source policy.** Everything marked **[OFFICIAL]** comes from IELTS-partner material —
ielts.org, its published sample-task and examiner-comment PDFs, the public band-descriptor PDF hosted
on the partners' asset CDN, and the British Council / IDP preparation pages. Everything marked
**[TEACHING CONSENSUS]** is the convergent view of reputable coaching material, used only where the
partners are silent; where coaching sources contradict each other or the partners, I say so.
Everything marked **[OUR ANALYSIS]** is reasoning I did for this project — mostly the data-shape
arithmetic in §9 — and carries no external authority at all. Confidence notes are in §13.

**Copyright.** No exam prompt, chart, dataset or candidate script from any source is reproduced here.
Band-descriptor content is paraphrased in my own words throughout; the descriptor wording itself is
copyrighted and appears nowhere in this file. The one exception is the standard Task 1 instruction
line, which is a functional rubric sentence, is already present in our shipped `writing_prompts.jsonl`,
and is reproduced because prompts are unusable without it.

---

## 1. The task, exactly

### 1.1 What the candidate is given

**[OFFICIAL]** ielts.org's Academic writing format page describes the Task 1 input as *one or more*
graphs, charts or tables, **or** a diagram of an object, device, process or event. Note the "one or
more": multi-visual tasks are official, not a coaching invention. The candidate must describe the
visual information **in their own words**.

The task on the paper has three fixed layers:

```
You should spend about 20 minutes on this task.

<the description line — varies per task>

Summarise the information by selecting and reporting the main features,
and make comparisons where relevant.

Write at least 150 words.
```

**[OFFICIAL]** The 2023 ielts.org sample-tasks PDF shows this exact three-layer shape on all three of
its Academic Task 1 samples — a chart task, a graph task and a **process-diagram** task. The middle
instruction line is *identical on the process task*. This kills a widespread coaching claim that
process and map tasks get a different rubric ("describe the process", "describe the changes"). They do
not, in current official material. See §1.3 for the wording variants that do exist.

The description line is one sentence and does three jobs: it names the visual
(`The bar chart below shows…`), names the variable and unit, and names the population and the
time/place scope. Our authored description lines must do all three, because the introduction the
learner writes is a paraphrase of that line and cannot be graded if the line is under-specified.

### 1.2 Word minimum and time — the real arithmetic

**[OFFICIAL]** Minimum 150 words; suggested 20 minutes; Task 2 is 250 words / 40 minutes and carries
**twice the weight** in the Writing band. ielts.org explicitly warns that a *long* Task 1 is a
self-inflicted wound: no penalty for length itself, but it steals time from the task worth double.

**[OFFICIAL]** Under-length is penalised, and the penalty runs through Task Achievement — the
criterion is defined as how fully, appropriately, accurately and relevantly the response meets the
task requirements *using the minimum of 150 words*. Wording copied straight from the prompt does not
count towards that minimum: an examiner comment in the ielts.org sample set states plainly that copied
rubric earns no credit.

**[TEACHING CONSENSUS + OUR ANALYSIS]** The workable target band is **165–195 words**. Below ~160
there is no safety margin against a miscount; above ~210 the time cost is real and the extra words are
almost always mechanical data listing, which *lowers* Task Achievement (§4.5). Our UI should treat
150 as a hard floor, 165 as a soft target, and >220 as a gentle warning, not an error.

**[OUR ANALYSIS] Time split inside the 20 minutes** — this is the shape the teaching payload should
encode, because "spend 20 minutes" is not a plan:

| Phase | Minutes | What actually happens |
|---|---|---|
| Read + decode the visual | 2–3 | Identify variable, unit, population, time scope; find the two or three groupings |
| Decide the overview | 1–2 | Commit to 2 statements before writing anything |
| Write intro + overview | 3 | ~50–70 words |
| Write body 1 | 5 | ~60–70 words |
| Write body 2 | 5 | ~60–70 words |
| Check | 2 | Tense consistency, singular/plural, figures transcribed correctly |

The decisive move is that **the overview is decided before the body is written**, not discovered
afterwards. A learner who writes the body first will write a list, then summarise their own list — and
a summary of a list is a list.

### 1.3 Rubric wording: variants and where sources disagree

**[OFFICIAL]** Current partner material uses `and make comparisons where relevant`.

**[TEACHING CONSENSUS — sources disagree]** Archives of older tasks and reproduction sites show two
further surface forms: `…and make comparisons where necessary`, and a shortened
`Summarise the information and make comparisons where relevant`. Some older process/map tasks are
reproduced without the comparison clause at all. Reproduction sites also introduce their own typos and
US spellings, so I treat every non-official variant as unverified.

**Decision for BandReady:** use the current official form verbatim and unvaried on **every**
`ac_task1` prompt including process and map. Consistency is also a UX property — the learner should
learn to stop reading the rubric line and start reading the description line, which is where the
information actually is. If we later want to teach rubric-variant robustness, do it as a drill, not by
scattering variants through the bank.

### 1.4 How the response is judged

**[OFFICIAL]** Four equally weighted criteria: Task Achievement, Coherence and Cohesion, Lexical
Resource, Grammatical Range and Accuracy. Two facts about Task Achievement matter more than anything
else in this document:

1. **[OFFICIAL, near-verbatim paraphrase]** Academic Task 1 is characterised by the partners as an
   *information-transfer* task with a defined input and a largely predictable output, tied narrowly to
   the factual content of the visual — and explicitly **not** to speculative explanation lying outside
   the data. This is the authority behind "never invent causes" (§8.4). It is not a style preference;
   it is the definition of the criterion.
2. **[OFFICIAL]** Responses are penalised for note form or bullet points *anywhere* in the answer, and
   penalised severely for plagiarism. Connected prose only.

**[OFFICIAL]** Register: academic or semi-formal/neutral. No contractions, no "you", no rhetorical
questions, no personal comment. One examiner comment in the sample set caps an otherwise
high-proficiency process answer at Band 7 for Task Achievement partly because it opened in a
*letter-like* register and included personal remarks — a format failure, punished independently of
language quality.

---

## 2. The visual types and how often each appears

### 2.1 The type inventory

Our `TASKS["ac_task1"]["genres"]` (in `sidecar/bandready/scoring/writing.py`) already allows nine:
`bar`, `grouped_bar`, `stacked_bar`, `line`, `pie`, `table`, `process`, `map`, `mixed`.
That maps onto the real type space cleanly. Grouped by the *skill* they test:

| Family | Genres | Core demand |
|---|---|---|
| **Static comparison** | `bar`, `grouped_bar`, `pie`, most `table` | Rank, group, compare magnitudes and proportions. No time. |
| **Change over time** | `line`, time-series `bar`, two-period `table`, two-period `pie` | Trend verbs + adverbs, time prepositions, past vs present tense |
| **Two-dimensional** | `grouped_bar`, `stacked_bar`, multi-column `table` | Compare *within* a group and *across* groups — the hardest thing to organise |
| **Non-numeric sequence** | `process` | Passive voice, sequencing, stage-grouping |
| **Non-numeric spatial** | `map` | Spatial prepositions, change verbs, tense selection |
| **Composite** | `mixed` | Everything above plus *relating two visuals* |

**Sub-genres that matter and are easy to miss when authoring:**

- **Two-period pies / bars** (same categories, two dates). Far more common in the real exam than the
  single pie, and much richer: they convert a ranking task into a change-of-share task.
- **Process, man-made vs natural.** Manufacturing/recycling processes take passive throughout; natural
  cycles (water, carbon, an insect's life cycle) take active present simple. Candidates who are drilled
  on "always use the passive" write nonsense on natural cycles. Author both.
- **Cyclical process** (ends where it starts) vs **linear process** (ends in a product). The overview
  sentence differs — see §6.2.
- **Map: change over time** (same place, two dates) vs **map: competing proposals** (same place, two
  plans, one of which is hypothetical). The tense systems are different (§7.2) and almost nobody
  teaches the second.
- **Table with two units** (e.g. counts *and* a rate). Forces the learner to keep two comparisons
  separate. High value, high difficulty.

### 2.2 Frequency — what can and cannot be claimed

**No partner publishes a frequency distribution.** Any percentage you see on a coaching site is
invented or derived from self-reported student memories. I searched for one specifically and there
isn't one. Treat all of the following as **[TEACHING CONSENSUS]** at low-to-medium confidence:

- Line graphs and bar charts are the most frequent, and between them account for roughly half of tasks.
- Tables are common and under-practised.
- Pie charts appear regularly but less often than bars/lines, and usually as a **pair or trio**, not
  singly.
- **Combined/"mixed" tasks are a standard category**, not an oddity. The Cambridge past-paper indexes
  that circulate list "Mix chart" as one of the seven headings alongside line/bar/pie/table/map/diagram,
  and Cambridge IELTS 19 contains a pie+bar combined Task 1. Multiple independent teaching sites treat
  the combined task as a routine exam type requiring its own lesson.
- Process diagrams and maps are the least frequent individually, but together they are a meaningful
  slice, and they are the two types candidates most often meet cold. Their *low* frequency is exactly
  why candidates are unprepared: they rationally skip them in practice and then get one.

**[OUR ANALYSIS] Planning weighting for the bank.** Frequency is the wrong optimisation target for a
prep app anyway. We want *coverage of demand types* weighted mildly by frequency, with deliberate
over-supply of the types that are under-practised elsewhere. Suggested allocation for an expanded
Academic Task 1 bank:

| Genre | Share | Rationale |
|---|---|---|
| `line` | ~18% | Most frequent; the trend-language engine |
| `bar` + `grouped_bar` + `stacked_bar` | ~26% | Most frequent family; grouped/stacked carry the hard organisation problem and we currently ship **zero** |
| `table` | ~14% | Common, under-practised, best vehicle for "you cannot report all of this" |
| `pie` | ~12% | Mostly as pairs/trios; single pie only at difficulty 1 |
| `mixed` | ~12% | Standard type, we ship **zero**, and it is the only type that trains cross-visual synthesis |
| `process` | ~10% | Different grammar system entirely |
| `map` | ~8% | Different grammar system entirely |

### 2.3 Audit of what we currently ship

Measured from `content/core-en/data/writing_prompts.jsonl` (6 `ac_task1` rows):

| id | genre | diff | data shape | verdict |
|---|---|---|---|---|
| `wp_core_ac1_bar_transport_modes` | bar | 1 | 6 categories × 1 series = **6 cells** | Thin. Legitimate at difficulty 1, but one series and no time dimension means no trend language at all. |
| `wp_core_ac1_line_renewable_electricity` | line | 2 | 7 points × 3 series = **21 cells** | **Good.** Crossover, one flat series, one accelerating series. This is the shape to copy. |
| `wp_core_ac1_pie_council_budget` | pie | 1 | 6 segments = **6 cells** | Thin, and a *single* pie — the least common and least rich pie form. Needs a two-period partner. |
| `wp_core_ac1_table_city_tourism` | table | 3 | 4 rows × 4 metrics = **16 cells**, two units | **Good.** Genuinely requires selection. |
| `wp_core_ac1_process_desalination` | process | 3 | 8 steps, linear | Reasonable; check the stage grouping supports a 2-stage overview. |
| `wp_core_ac1_map_sandmouth` | map | 2 | 7 → 9 features | Reasonable. |

**Gaps, in priority order:** (1) no `mixed` at all; (2) no `grouped_bar` or `stacked_bar` at all, so no
two-dimensional organisation practice; (3) exactly one instance of every type, so no difficulty ladder
*within* a type; (4) no two-period pie/bar; (5) no natural-cycle or cyclical process; (6) no
competing-proposals map; (7) only one time-series task in the entire Academic Task 1 bank, which means
the trend-language system is trained by a single prompt.

---

## 3. The overview requirement — the single biggest scoring lever

### 3.1 What an overview is

An overview is **one or two sentences that state the shape of the whole data set without reporting
individual figures**. It answers "if the reader could see only one sentence, what would they need to
know?" It is a claim about the data as a whole: what dominates, what direction things moved, what the
biggest gap is, how the beginning compares to the end.

It is not: an introduction (that paraphrases the description line), a conclusion (Task 1 has no
argument to conclude), an opinion, an explanation, or a data point.

### 3.2 The band ladder — why this is *the* lever

**[OFFICIAL, paraphrased from the public Task 1 descriptors]** The Task Achievement column names the
overview explicitly at three consecutive bands, and it is the feature that separates them:

- **Band 5:** the description recounts detail mechanically **with no clear overview**; there may also
  be no figures supporting the description.
- **Band 6:** an overview is present, with information selected appropriately.
- **Band 7:** the overview is **clear**, and covers the main trends, differences or **stages**.
- **Band 8–9:** the overview is no longer named separately because the descriptor moves up a level of
  generality — all task requirements covered sufficiently, key features presented, highlighted and
  illustrated clearly; a fully developed response at 9.

Three consequences that should be stated to learners in these words:

1. **No overview caps Task Achievement at Band 5**, regardless of how good the English is. Not
   "loses a few marks" — the band-5 descriptor is *defined* by its absence and the band-6 descriptor is
   *defined* by its presence.
2. Task Achievement is 25% of the Task 1 score, and Task 1 is one third of the Writing band. A Task
   Achievement drop from 7 to 5 costs roughly **0.5 of a Writing band** on its own — before the
   knock-on damage to Coherence, since a response with no overview usually has no organising principle
   either.
3. Band 7 needs the overview to be **clear**, i.e. explicit and findable. An overview buried mid-paragraph
   and unsignposted is worth less than the same sentence set apart.

The word **"stages"** in the band-7 wording is the direct authority for requiring an overview on
**process** tasks, and "differences" covers **maps**. There is no visual type that is exempt.

### 3.3 What official examiner comments actually say

The ielts.org sample-task PDF and the computer-delivered sample-response PDF between them contain six
Academic Task 1 examiner comments. Paraphrased (not quoted):

- A **Band 5** process answer: the process itself is accurately described, but the response **fails to
  present an overview** and some key features are not adequately covered. Its opening sentence may have
  been an attempted overview but only caused confusion.
- A **Band 6** line-graph answer: coverage is good, but to score higher for content the candidate would
  have needed to summarise the graph's most important features in an overview — and the examiner
  supplies a model of the *kind* of statement wanted: a single sentence naming when each of the two
  series peaks. **That is the clearest official statement of what an overview looks like anywhere in
  partner material.** It is one sentence, it names a pattern, it contains no numbers.
- A **Band 7** process answer with sophisticated lexis and a wide range of accurate structures: capped
  at 7 because of an inappropriate letter-like format, some irrelevant content, and **no clear
  overview**. Strong language did not rescue it.
- A **Band 8.5** process answer: an overview is present in the first paragraph and states that the
  process has a fixed number of consecutive steps — but the examiner says that for the highest score a
  **fuller** overview would be needed, one that names the major stages rather than counting the steps.
  **This is the single most useful line in the corpus for us:** "seven steps" is a *quantity*, not a
  *shape*. The band-9 overview groups the steps into named phases.
- A **Band 6** bar-chart answer (computer-delivered set): the overview is in the **final** paragraph and
  is credited as relevant; the limiting factors are mechanical reporting and figures supporting only
  some descriptions.
- A **Band 4** bar-chart answer: key features not adequately covered, an entire category ignored, no
  clear progression.

Two things fall out of this that most coaching material gets wrong:

- **Position is flexible; presence and clarity are not.** An end-position overview was explicitly
  credited at Band 6. IDP's own guidance says the overview can go at the end of the introduction *or*
  as a separate final paragraph.
- **An overview can exist and still be weak.** Counting the steps, or restating the title, satisfies
  presence but not "clear overview of main trends, differences or stages".

### 3.4 Where to put it — our teaching position

**[OUR ANALYSIS, grounded in 3.3]** Teach **paragraph 2, immediately after the introduction, opening
with an explicit signpost**. Reasons: it is legal, it is what most band-8 exemplars do, it is trivially
findable by an examiner reading fast, and — the real reason — writing it second forces the learner to
decide the shape of the data *before* choosing what to report, which is the behaviour we actually want.
Accept an end-position overview in feedback without penalty; do not model it.

Four-paragraph architecture to teach as the default:

```
¶1  Introduction   1 sentence, ~20-28 words   paraphrase of the description line
¶2  Overview       1-2 sentences, ~30-45 w    2 whole-data statements, NO figures
¶3  Body 1         ~60-70 words               group A, 2-3 supported claims
¶4  Body 2         ~60-70 words               group B, 2-3 supported claims
```

**The "no figures in the overview" rule.** Partner-adjacent guidance is unusually direct here: the
ielts.org teaching article says the overview should not include specific data from the chart, and IDP
says there is no need for figures and no need to mention every category. This is a real rule, but it is
a *heuristic dressed as a rule*: one anchoring figure in an overview is not an error and appears in
high-band exemplars. **Teach it as an absolute for learners below Band 7** (because the failure it
prevents — an overview that decays into a data sentence — is far more damaging than the stylistic
stiffness it causes) and relax it above.

### 3.5 What makes an overview weak — a taxonomy for the error watchlist

Ranked by how often it happens and how much it costs:

| # | Failure | What it looks like | Why it fails |
|---|---|---|---|
| W1 | **Absent** | Intro then straight into data | Caps TA at 5 |
| W2 | **Data sentence in disguise** | "Overall, car use was 1.42 and walking 0.95." | Reports two points; makes no whole-data claim |
| W3 | **Title restatement** | "Overall, the chart shows journeys by six transport modes in Verdon." | Zero information beyond the prompt; also duplicates ¶1 |
| W4 | **Counting, not shaping** | "Overall, there are seven stages in the process." | The official Band-8.5 comment names exactly this as insufficient |
| W5 | **Detail promoted** | Picks a minor category because it looked interesting | An overview must be about the dominant pattern, not a curiosity |
| W6 | **Explanatory** | "Overall, car use rose because public transport was poor." | Speculation outside the data; hits TA directly |
| W7 | **Hedged into nothing** | "Overall, there were some changes in the figures." | True of every chart ever drawn |
| W8 | **One-sided** | States the rise, never the fall; or covers one visual of two | On a `mixed` task this is near-automatic and is the type's signature failure |
| W9 | **Unsignposted** | The overview sentence is real but sits mid-body | Fails "clear"; the examiner has to hunt |
| W10 | **Contradicts the body** | Overview says "steady growth", body describes a fall | Accuracy failure on top of everything else |

**The strong-overview test — three questions, all must be yes:**
1. Could someone who has never seen the visual repeat this sentence and be *right* about the data?
2. Is it true of the **whole** data set (all series, all periods, both visuals), not one part of it?
3. Would it still be worth saying if you deleted every number from the visual?

### 3.6 Overview recipes by visual type

Each recipe yields two statements. Two is the target: one is thin, three is a body paragraph.

- **Single-series bar / single pie (no time):** (a) what dominates or what the rank order is;
  (b) the size of the gap between the top and the rest, or where the cluster of similar values sits.
- **Multi-series time-series (line, grouped bar over time):** (a) the overall direction of the whole
  system — did everything rise, or did some rise while others fell; (b) which series leads at the end
  vs at the start, i.e. whether the ranking changed. A crossover, if present, is always overview
  material.
- **Two-period pie/bar (share data):** (a) which category dominated in both periods (stability);
  (b) which share moved most (change). Stability + change is the universal shape for share data.
- **Grouped/stacked bar (two dimensions):** (a) the pattern that holds across the grouping variable;
  (b) the group that breaks it. Naming the exception in the overview is what separates a 7 from a 6 here.
- **Table:** (a) the dominant pattern in the primary measure; (b) the row or column that behaves
  differently. If the table has two units, the overview should touch both.
- **Process:** (a) the number of stages **and their named phases** — e.g. an extraction phase, a
  treatment phase, a distribution phase; (b) whether it is linear or cyclical, and what raw material
  goes in / what product comes out. Never the step count alone (W4).
- **Map:** (a) the direction of the overall change in one word — the place became more built-up / more
  commercial / more accessible / greener; (b) what survived unchanged. "What stayed the same" is the
  most consistently omitted overview element on maps.
- **Mixed (two visuals):** (a) one statement per visual, or better, (b) one statement that *relates*
  them — the relationship is the reason the two visuals were put together. Covering only one visual is
  failure W8 and is the commonest way the type is lost.

---

## 4. "Select and report the main features" in practice

### 4.1 What counts as a main feature

**[TEACHING CONSENSUS, convergent across sources]** A main feature is one of:

- the largest and smallest values (only when the gap is meaningful);
- the biggest change — steepest rise, sharpest fall, largest absolute or proportional shift;
- a **crossover or reversal** — where one series overtakes another (almost always the single most
  important feature present, and the most frequently missed);
- a **plateau or flat series** — no change is a finding, and learners systematically ignore it;
- an **outlier or exception** — the one category that breaks the pattern;
- a **turning point** — a peak, a trough, the year the direction changed;
- a **cluster** — three categories that are near-identical, which lets you report three data points in
  one clause.

Not main features: every intermediate value on a line; a difference of 1–2 percentage points on a
noisy series; any category the learner personally finds interesting but which is small and unmoving.

**[OFFICIAL]** IDP's own analysis guidance names highest and lowest figures, greatest and smallest
differences, and exceptions to trends as the things to look for.

### 4.2 How much data — the 150-word budget, worked

**[OUR ANALYSIS]** This is the arithmetic that should drive both our teaching payload and our chart
design. Take a 180-word response:

| Element | Words | Data points consumed |
|---|---|---|
| Introduction | 24 | 0 |
| Overview (2 statements) | 38 | 0 (no figures) |
| Body: 5 supported claims @ ~20 w | 100 | 8–14 |
| Cohesion/tail | 18 | 0 |

**A well-written Task 1 answer cites roughly 8–14 individual figures across 4–6 comparative claims.**
That is the whole budget. Everything else in the visual is deliberately not mentioned.

A *comparative claim with figures* costs 18–25 words:

> "Car journeys were the most frequent at 1.42 per person per day, roughly 50 per cent more than
> walking, the next highest at 0.95." — 25 words, 2 figures, 1 ratio, 1 rank statement.

A *bare data sentence* costs 10–14 words and buys almost nothing:

> "Bus journeys were 0.61 per person per day." — 8 words, 1 figure, 0 comparisons.

Twelve of those and you have 150 words, no overview, no grouping, and a Band 5. **This is the precise
mechanism by which "listing every number" destroys the score** — not that listing is inelegant, but
that at the exam's word budget, listing consumes the entire response and leaves no room for the
comparative and summarising language the descriptors reward.

### 4.3 Grouping — the organising decision

Grouping is what turns selection into structure. Two body paragraphs means exactly **two groups**. The
grouping choice is the highest-leverage decision after the overview, and there is usually more than one
defensible answer — the ielts.org teaching article says exactly this: there is no single correct
organisation and the candidate must judge it from the data.

Grouping strategies, by data shape:

| Data shape | Group by | ¶3 / ¶4 |
|---|---|---|
| Multi-series over time | Direction | risers / fallers-and-flat |
| Multi-series over time, with a crossover | Position | the two that swap places / the rest |
| Single-series ranking | Magnitude | the dominant few / the small remainder |
| Two-period shares | Behaviour | shares that grew / shares that shrank or held |
| Grouped bar (categories × groups) | The dimension with fewer members | group A across all categories / group B across all categories |
| Table with two units | Measure | measure 1 across all rows / measure 2 across all rows |
| Two-period comparison of 4+ entities | Pattern conformity | those following the main pattern / the exception(s) |
| Process | Phase | preparation & processing / finishing & distribution |
| Map | Area, or change type | what changed / what remained — or north half / south half |
| Mixed | Visual | visual 1 / visual 2, with an explicit link sentence between them |

**Anti-grouping (what learners do instead):** one paragraph per category, or strict left-to-right
order across the x-axis, or chronological march through every year. All three produce a list. The
diagnostic is trivial and machine-checkable: **if the order of your sentences matches the order of the
labels on the visual, you have not grouped.**

### 4.4 What to leave out

- Every intermediate point on a smooth line. Report the start, the end, the turning point.
- Values that differ by less than the visual's own resolution.
- Categories that are small *and* stable — one clause covering all of them together is enough
  ("the remaining three categories each accounted for under 10 per cent and changed little").
- Any second decimal place. Round and mark it as rounding (§5.4).
- The axis labels as prose. Those belong in the introduction, once.
- On a map: shrubs, individual trees, decorative features that did not change.
- On a process: the internal detail of a step that the diagram merely labels.

**[OFFICIAL]** Note the counterweight, from a Band 5 examiner comment: a response that describes the
overall trends but includes **no figures at all** is also penalised — the reader is left without
important information. Selection means *fewer, chosen, supported* figures, not *no* figures. Both
failure directions exist and our feedback must distinguish them.

### 4.5 Why listing scores badly — the four-criterion damage report

Worth stating in exactly this form in the teaching payload, because learners think listing is a
*style* problem:

| Criterion | Damage done by listing |
|---|---|
| **Task Achievement** | Mechanical recounting with no clear overview is the band-5 descriptor almost verbatim. Also guarantees key features are buried among trivia. |
| **Coherence & Cohesion** | A list has no progression: every sentence is at the same altitude, so there is nothing to sequence. Cohesive devices become mechanical ("Firstly… Secondly… Thirdly…"), which is itself named as a band-6 limiter. |
| **Lexical Resource** | Listing needs one verb ("was") and one noun ("the figure"), repeated. Repetition is the explicit band-limiter. There is no occasion to use comparison or trend lexis. |
| **Grammatical Range** | Listing is a sequence of simple SVC clauses. Comparison, concession and relative clauses have nowhere to attach, so complex structures never appear. |

Listing does not cost one criterion. It costs all four, which is why it is the most expensive single
habit in Task 1.

---

## 5. Comparison language — the grammar and lexis this task forces

The inventories below are the raw material for a `language_bank`-equivalent on writing prompts. They
are organised by *function*, because that is how they will be surfaced.

### 5.1 Trend: change over time

**Verb + adverb** (the productive pattern, and the one that generates the most errors):

- *rise, increase, grow, climb, go up, expand, surge, rocket, more than double*
- *fall, decrease, decline, drop, dip, sink, plummet, plunge, halve*
- *fluctuate, vary, oscillate, level off, plateau, stabilise, remain steady, hold constant, stay flat*
- *peak (at), bottom out (at), reach a high/low of, hit a trough*

Adverbs, graded, and **they must match the verb's own intensity** — `plummeted slightly` is a lexical
error, not a stylistic one:

| Size | Adverbs | Speed | Adverbs |
|---|---|---|---|
| tiny | marginally, slightly, negligibly | slow | gradually, steadily, progressively |
| moderate | moderately, noticeably | — | — |
| large | significantly, substantially, considerably, markedly | fast | sharply, steeply, rapidly, abruptly, dramatically |

**Noun + adjective** (the nominalised form — the single highest-value structural upgrade in Task 1,
because it enables `there was a…` and `a … in X was followed by…`):

- *a rise / an increase / a growth / a climb / a surge / an upturn*
- *a fall / a decrease / a decline / a drop / a dip / a downturn / a slump*
- *a fluctuation / a levelling-off / a plateau / a recovery / a rebound / a reversal*
- adjectives: *slight, marginal, gradual, steady, steep, sharp, dramatic, substantial, modest, sustained,
  brief, temporary, marked*

**The transformation drill** (worth building as a drill kind):
`X rose sharply` → `there was a sharp rise in X` → `X saw a sharp rise` → `a sharp rise in X occurred`.
Same fact, four structures, and Grammatical Range is measured on exactly this.

### 5.2 Magnitude, proportion and share

- **Multiples:** *twice as many as, three times higher than, half as many as, a third of, double,
  treble, ten-fold*
- **Fractions/proportions:** *a quarter, a third, two thirds, three quarters, a fifth, the majority of,
  a minority of, the bulk of, the remainder, a significant proportion, a negligible share*
- **Share language (pies, stacked bars):** *accounted for, made up, represented, comprised,
  constituted, was responsible for, at X per cent, X per cent of the total*
- **Rank:** *the highest / lowest, the second most common, the top three, the least popular, ranked
  first, was outnumbered by, was outstripped by, led the field, lagged behind*
- **Difference:** *by a factor of, by X percentage points, a gap of, the difference between A and B
  widened / narrowed / closed / reversed*

**The percentage-point trap.** A share moving from 20% to 30% has risen **by 10 percentage points**, or
**by 50 per cent**. Both are right; `by 10 per cent` is wrong. This is a genuine accuracy error under
Task Achievement, not a nitpick, and it is worth an `error_watchlist` slot on every share-data task.

### 5.3 Time expressions and prepositions

The preposition set is small, closed, and heavily errored:

| Pattern | Correct | Common error |
|---|---|---|
| Endpoint of a change | *rose **to** 40* | rose *in* 40 |
| Size of a change | *rose **by** 15* | rose *of* 15 |
| Range of a change | *rose **from** 25 **to** 40* | rose from 25 *until* 40 |
| Time span | *between 2010 **and** 2022*, *from 2010 to 2022*, *over the period*, *over the following decade* | between 2010 *to* 2022 |
| Point in time | *in 2015*, *by 2015* (= at or before), *at the start of the period* | *on* 2015 |
| Rate | *at a rate of*, *at around 30 per year* | — |
| Sequence | *before, after, prior to, following, thereafter, subsequently* | — |

Also: *throughout the period*, *for the remainder of the period*, *in the final five years*,
*the period under review*, *at the outset*, *by the end of the period*.

### 5.4 Approximation and hedging

Reading a chart is estimation, and saying so is a *precision* move, not a weakness:

*approximately, roughly, around, about, just over, just under, slightly more than, marginally below,
nearly, almost, close to, in the region of, some (some 40 million), in excess of, no more than, or so*

Two rules worth teaching hard: (1) approximate **once per figure**, not twice — *"approximately around
40"* is an error; (2) approximation is for values you are reading off a scale, not for values printed
in a table. On a table, quote the number.

### 5.5 Contrast, similarity and concession

- **Contrast (clause-level):** *whereas, while, by contrast, in contrast, conversely, on the other hand,
  however*
- **Contrast (phrase-level, and the higher-band move):** *unlike X, compared with X, as against,
  in comparison with*
- **Similarity:** *similarly, likewise, in the same way, as with X, both A and B, neither A nor B,
  A and B alike, comparable to, on a par with, mirrored the pattern of*
- **Concession/exception:** *with the exception of, apart from, aside from, the sole exception being,
  although, despite, notwithstanding*
- **Addition within a group:** *in addition, moreover, a similar pattern was seen in*

**[OFFICIAL]** Two examiner comments in the sample corpus penalise **over-use** of connectives, and a
Band 7.5 Task 2 comment flags a run of sequencers in a single paragraph. Cohesion is scored on
appropriacy, not density. The teaching line: *one connective per sentence maximum, and prefer the
phrase-level contrast (`unlike`, `compared with`) which is scored more generously than the clause-level
one because it is harder.*

### 5.6 The grammar this task actually forces

Ranked by how much of it a Task 1 answer contains:

1. **Tense selection, and holding it.** Past simple for a completed past period; present simple for
   present/undated data and for processes; present perfect for a period reaching now; future/modal
   (*is projected to*, *is expected to*) for forecast data. Mixed tenses across a single time frame is
   the highest-frequency GRA error in this task, and it is flagged explicitly in the official examiner
   comments (errors in tense, verb form and voice).
2. **Comparatives and superlatives.** *higher than, the highest, far higher, considerably lower,
   the second highest, three times as high as, not nearly as high as.* Traps: double comparatives
   (*more higher*), missing *than*, *the most highest*, and comparing a count to a rate.
3. **The passive.** Compulsory on processes (§6.3), heavy on maps (§7.4), occasional elsewhere
   (*the data was collected*).
4. **Complex noun phrases and nominalisation.** *the number of journeys made per person*,
   *the proportion of household income spent on housing*, *a steady decline in bus use*. This is where
   Lexical Resource and Grammatical Range are jointly won, and it is trainable.
5. **Subject–verb agreement across a long subject.** *The number of children who travelled by car
   **was** …* vs *A number of children **were** …* — the error rate here is very high because the head
   noun is five words from the verb.
6. **Articles and countability.** *the number of* vs *the amount of*; *the figure for X*;
   *the percentage of people who*; *X per cent of respondents were*. Uncountables that recur in this
   task: *information, spending, expenditure, consumption, output, research, travel*.
7. **Relative clauses to compress.** *Bus use, which had been the second most common mode in 1990,
   had fallen to fourth by 2010.* One clause, three facts, one comparison.
8. **Participle clauses for sequence and result.** *rising steadily to peak in 2018 before falling
   back*, *having reached a low of 12 in 2014*. The single most efficient way to fit two facts into one
   sentence within the word budget.

### 5.7 Lexical traps specific to this task

- *amount* (uncountable) vs *number* (countable). Very frequent.
- *percentage* / *proportion* / *rate* / *ratio* used interchangeably. They are not.
- *figure* meaning "a number in the data" vs "a chart". Use *figure* for the number only.
- *statistics* is plural; *data* is treated as plural in academic register (*the data show*), though
  singular is now widely accepted — do not penalise either.
- *trend* requires time. A ranking without a time axis has no trend; writing "the trend shows car use
  is highest" on a single-period bar chart is a content error.
- *dramatically*, *rocketed*, *plummeted* are strong words. On a series that moved 3% they are
  inaccurate, and inaccuracy of degree is a Lexical Resource error.
- *respectively* — useful and almost always misused. `A and B were 20 and 30 respectively` is correct;
  it must map two lists of equal length in matching order.

---

## 6. Process diagrams

### 6.1 What the task is

A diagram of stages, either **man-made** (manufacture, recycling, water treatment, production) or
**natural** (a cycle, a life cycle, a geological or biological sequence), either **linear**
(raw material → product) or **cyclical** (returns to its starting point). **[OFFICIAL]** The official
sample set includes a manufacturing process and applies the standard rubric line to it.

There are no numbers. That removes the entire trend-language system and replaces it with two others:
sequencing and the passive. Learners who have only practised charts arrive with no usable language at
all — this is the "meets it unprepared" failure, and it is why we must ship several.

### 6.2 The overview for a process

**[OFFICIAL, from the Band 8.5 examiner comment]** Counting the steps is not enough; the highest score
needs an overview that names the **major stages**. So:

- **Weak:** "Overall, the process has seven stages."
- **Adequate:** "Overall, the process has seven stages, beginning with the extraction of raw clay and
  ending with delivery of the finished bricks."
- **Strong:** "Overall, the process falls into three broad phases — extraction and preparation of the
  raw material, shaping and firing, and finally packaging for distribution — and it is entirely linear,
  with no material returned to an earlier stage."

The strong version does what the descriptor asks: it *summarises the stages*. The authoring
consequence is direct: **a process we author must be groupable into 2–4 named phases.** A flat sequence
of eight unrelated steps cannot produce a band-7 overview no matter how good the candidate is. This is
a chart-design constraint, not a teaching point (§9.2).

Overview elements for a process: number of stages; the named phases; input and output; linear vs
cyclical; and whether the process is manual, mechanised or natural, if the diagram shows it.

### 6.3 The passive — the rules, including the exceptions

**[TEACHING CONSENSUS, and consistent with the register requirement]**

- **Man-made processes take the passive throughout.** The agent is irrelevant and usually unstated:
  *the clay **is extracted**, the mixture **is heated** to 900°C, the bottles **are then washed***. This
  is not a stylistic preference; naming an unspecified agent ("workers take the clay") introduces
  information not in the diagram, which is the same error class as inventing causes.
- **Natural processes take the active present simple.** *Water **evaporates** from the ocean surface and
  **condenses** into cloud; the larva **emerges** and **feeds** on the leaf.* Writing "the water is
  evaporated" is wrong — nothing evaporates it.
- **Mixed diagrams exist** (a natural cycle with human intervention). The learner must switch. This is
  a genuinely difficult, genuinely testable skill and a good difficulty-3 design.
- **Tense is present simple**, active or passive, because a process is a general truth. Past passive
  only if the diagram is explicitly historical.
- **Modal passives for purpose/possibility:** *the water **can then be piped** to households*,
  *any residue **must be removed** before the next stage*.

Passive forms worth listing explicitly, because learners know only the first:
*is heated* · *is being heated* (rare here) · *has been heated* (for a completed prior stage) ·
*can be heated* · *must be removed* · *is left to cool* (passive + infinitive) ·
*is allowed to settle* · *undergoes filtration* (active verb doing passive work) ·
*passes through a filter* · *is subjected to* · *is fed into* · *is transferred to*.

**Agentless-active alternatives** that prevent seven consecutive passives — high value, rarely taught:
*the mixture then **passes** into…*, *the process **begins** with…*, *the residue **settles** at the
bottom*, *the vapour **rises** through…*, *this **results in**…*, *this **produces**…*,
*the next stage **involves**…*, *the final step **consists of**…*.

### 6.4 Sequencing inventory

- **Opening:** *initially, to begin with, in the first stage, the process begins with, at the outset,
  first of all*
- **Middle:** *next, then, after this, following this, subsequently, thereafter, at this point,
  in the second stage, once X has been completed, having been X-ed, after being X-ed, before being
  X-ed, meanwhile (parallel branches), simultaneously*
- **Closing:** *finally, lastly, in the final stage, at which point the process is complete,
  the end product is then…*
- **Cyclical closing:** *the cycle then repeats, at which point the process begins again,
  the material re-enters the first stage*
- **Branching:** *the flow divides, one branch is directed to…, while the remainder is…*

**[TEACHING CONSENSUS]** The commonest process failure after the missing overview is starting every
sentence with a sequencer — "Firstly… Secondly… Thirdly…" — which official comments elsewhere flag as
mechanical cohesion and a band-6 limiter. The fix is subordination: put the sequence *inside* the
sentence. *Once the clay has been shaped, it is left to dry for two days.* / *Having been sorted by
colour, the glass is washed under high pressure.*

### 6.5 Process failure modes

1. No overview, or a step-count overview (§6.2).
2. Active voice on a man-made process, which forces an invented agent.
3. Passive voice on a natural cycle.
4. Sequencer-initial sentence chains.
5. Copying the diagram's step labels verbatim instead of turning them into clauses — this is both a
   paraphrase failure and, if extensive, a plagiarism-adjacent problem under the "own words" rule.
6. Explaining *why* a stage exists (invented process knowledge — the same TA violation as inventing
   causes on a chart).
7. Losing the material thread: forgetting to say what is being acted on, so the reader cannot follow
   what "it" refers to. Referencing failures on processes are specifically flagged in the official
   comments.
8. Writing in the wrong register entirely — one official Band 7 script was capped partly for a
   letter-like opening.

### 6.6 Maps and processes share one grammatical property

Both are describable **without a single number**, which means both are pure grammar-and-cohesion tests.
For a learner whose Lexical Resource is propped up by memorised trend phrases, these two types remove
the crutch. That makes them diagnostically valuable — a learner who scores 6.5 on line graphs and 5.5
on processes has a grammar problem being masked by phrase memorisation. Worth surfacing in progress
tracking.

---

## 7. Maps

### 7.1 The two sub-genres

- **Change over time.** The same place at two (occasionally three) dates. One or both may be in the
  past; one may be "the present day".
- **Competing proposals / planned development.** The place today plus a proposed plan for a future
  date. Rarer, and it flips the tense system into the future/conditional.

### 7.2 Tense selection — the matrix nobody teaches

This is the map task's real difficulty, and it depends entirely on the dates in the description line:

| Map pair | Tense for map 1 | Tense for map 2 | Tense for the changes |
|---|---|---|---|
| 1920 → 1990 (both past) | past simple (*there was a…*) | past simple | **past perfect** for the earlier state, past simple for the later (*the woodland **had been** cleared and a car park **was** built*) |
| 1990 → present day | past simple | present simple (*there is now…*) | **present perfect passive** (*the woodland **has been replaced** by housing*) |
| present → proposed future | present simple | future / modal (*will be, is to be, is expected to be*) | future passive (*a footbridge **will be built***); conditional if framed as a proposal |
| two competing proposals, same date | present/future | present/future | comparative, not change (*whereas plan A **places** the car park to the north, plan B **locates** it…*) |

The commonest error is using present perfect on a past→past pair, or past simple on a
present→future pair. Both are pure tense-logic errors and both are trainable in five minutes — which
makes this excellent teaching payload.

### 7.3 Spatial language inventory

- **Cardinal:** *in the north / south / east / west*, *in the north-east*, *in the south-western
  corner*, *along the eastern edge*, *to the north of*, *due south of*
- **Relative position:** *adjacent to, next to, beside, opposite, facing, alongside, bordering,
  surrounded by, enclosed by, in the middle of, at the centre of, on the outskirts of, on the far side
  of, across from, between A and B, within the grounds of, just outside*
- **Distance and extent:** *a short distance from, some way from, immediately to the left of,
  stretching from A to B, running the length of, spanning, covering an area of*
- **Linear features:** *a road **runs** east–west*, *the river **flows** through*, *a path **winds**
  along*, *the railway **cuts across***, *a bridge **spans** the river*
- **Orientation of the description:** *moving clockwise from the north*, *working from west to east*,
  *in the upper half of the map*

**The compass rule:** every feature mentioned must be located. A map answer that says "a supermarket
was built" without saying where has reported an event, not a spatial fact, and has thrown away the
entire lexical system the task exists to test.

### 7.4 Change verbs — the map-specific set

Nearly all take the passive:

- **Added:** *was built, was constructed, was erected, was added, was introduced, appeared,
  was developed, sprang up*
- **Removed:** *was demolished, was knocked down, was cleared, was removed, disappeared,
  was pulled down, made way for*
- **Converted:** *was converted into, was turned into, was replaced by, gave way to, was redeveloped as,
  was transformed into, now occupies the site of*
- **Extended/reduced:** *was extended, was expanded, was enlarged, was widened, was reduced in size,
  was cut back*
- **Relocated:** *was relocated to, was moved to*
- **Unchanged:** *remained unchanged, was left intact, was retained, is still in place,
  the only feature to survive*

**[OUR ANALYSIS]** *"Remained unchanged"* deserves its own teaching note. Learners describe only the
changes, because the task felt like it was about change — and then their overview says nothing about
stability, which is half the comparison. On maps and on share data alike, **what did not change is
always overview material.**

### 7.5 Map failure modes

1. No overview, or an overview that says only "there were many changes".
2. Feature-by-feature listing in map order — the map equivalent of chart listing, and equally fatal.
   Group by **area** (north half / south half) or by **change type** (built / removed / retained).
3. Wrong tense for the date pair (§7.2).
4. Locating nothing — see the compass rule.
5. Inventing purposes ("a car park was built **to attract more tourists**"). Same TA violation.
6. Describing map 1 in full, then map 2 in full, with no comparison. This produces two descriptions and
   zero comparisons, and the rubric line asks for comparisons.
7. Omitting scale/direction changes that are the point — a village becoming a town, a coastline being
   built over.

---

## 8. The most common failures, ranked

Ordered by expected cost × frequency. Each is written so it can become an `error_watchlist` entry, and
each carries a note on whether we can detect it automatically.

| # | Failure | Criterion | Cost | Auto-detectable? |
|---|---|---|---|---|
| 1 | **No overview** | TA | Caps TA at 5; ≈0.5 band overall | Partially — look for a whole-data claim without figures near ¶1–2 or the final ¶. LLM judge is reliable here. |
| 2 | **Mechanical data listing / no grouping** | TA + CC + LR + GRA | All four (§4.5) | Yes — high ratio of numerals to words; sentence order matching label order; low count of comparison markers. |
| 3 | **Inventing causes or explanations** | TA | Direct; contradicts the information-transfer definition | Yes — flag causal connectives (*because, due to, as a result of, this is why, owing to*) applied to the data rather than within it. |
| 4 | **Copying the prompt** | TA + LR | Copied words don't count towards 150; reveals inability to paraphrase | Yes — already have `prompt_copy_run` in `DEFAULT_THRESHOLDS` (20-word run). Consider lowering to ~12 for Task 1, where the rubric is short. |
| 5 | **Under 150 words** | TA | Explicit penalty | Yes — trivially. |
| 6 | **Mixed / drifting tenses** | GRA | Named in official comments | Partially — compare tense of main verbs against the prompt's time frame. |
| 7 | **Overview present but weak** (W2–W10, §3.5) | TA | Caps at 6 rather than 5 | LLM judge only. |
| 8 | **No figures at all** | TA | Band-5 descriptor also names absent supporting data | Yes — numeral count ≈ 0. |
| 9 | **Key feature omitted** (an entire series/category/visual ignored) | TA | Named in a Band 4 official comment | Yes — we hold `chart_spec`, so we can check series/category coverage against the text. **This is a real advantage of storing charts as data.** |
| 10 | **Over-used / mechanical connectives** | CC | Caps CC at 6 | Yes — density of *firstly/secondly/moreover/furthermore/in addition*. |
| 11 | **Wrong register** (personal comment, contractions, letter-style opening, questions) | TA + LR | Capped a Band-7-language script at 7 in official material | Yes — first/second person pronouns, contractions, question marks. |
| 12 | **Note form / bullet points** | TA | Explicit official penalty | Yes — line-initial hyphens/digits, absent finite verbs. |
| 13 | **Percentage vs percentage-point confusion; amount/number confusion** | LR | Accuracy of expression | Yes — pattern match. |
| 14 | **Adverb–verb intensity mismatch** (*plummeted slightly*) | LR | Precision | Yes — small collocation blocklist. |
| 15 | **Concluding like an essay** ("In conclusion, this chart is very interesting") | TA | Wasted words, wrong genre | Yes — trailing paragraph starting *In conclusion* with no data claim. |

**Note on #9.** Because we store `chart_spec` as structured data rather than an image, we can compute
which series and categories the response actually mentions and report coverage precisely — something a
human tutor does slowly and an image-based system cannot do at all. That should be a headline feature
of our Task 1 report, not a footnote.

---

## 9. What makes a good task — the authoring spec for `chart_spec`

This section is **[OUR ANALYSIS]** throughout, derived from the 150-word budget in §4.2. It is the part
of this briefing that most directly constrains the authoring agents.

### 9.1 The describability budget

Define a **cell** as one reportable value: `categories × series` for cartesian charts, segments for a
pie, `(rows−1) × (columns−1)` for a table, steps for a process, features for a map snapshot.

| Cells | Verdict | What happens to the learner |
|---|---|---|
| ≤ 6 | **Too thin** | Nothing to select; they report everything, hit 110 words, pad with repetition and restate the overview as a conclusion. They cannot practise selection, which is the skill being tested. |
| 8–14 | Acceptable at difficulty 1 | Selection is mild but real |
| **15–28** | **The sweet spot** | Reporting everything is impossible in 180 words; grouping is forced; 4–6 claims fit exactly |
| 29–40 | Difficulty 3 only | Genuine selection pressure; needs a very clean structure to be fair |
| > 45 | **Overwhelming** | Failure becomes about reading speed and panic, not about writing. Also breaks our renderer's legibility. |

**Hard constraints from the codebase:** `SERIES_MAX = 5` in
`app/src/features/writing/components/chart/palette.ts` — more than five series renders as a table
instead of a chart. The plan document (`docs/plan/05-writing-module.md` §2.2) states the validator
clamps series ≤ 5 and categories ≤ 12. **So the authorable maximum is 5 × 12 = 60 cells, and the
recommended maximum is far lower.**

Our current bank sits at 6, 21, 6, 16 cells — two thin, two good.

### 9.2 Shape requirements per genre, with worked examples

All data below is **invented for this briefing** as a shape illustration; do not copy it into prompts.

---

**`line` — the trend engine**

- 3 series (2 minimum, 4 maximum), 5–7 time points. Target 15–24 cells.
- The time points must be evenly spaced and human (years, every 2 years, decades). Never 13 points.
- **Required features:** at least one **crossover** (or a clear ranking reversal), at least one
  **flat/stable** series, and different *shapes* between the risers (one linear, one accelerating).

*Good shape* — 3 × 7 = 21 cells:
```
Years:  2000 2004 2008 2012 2016 2020 2024
A:        45   42   38   30   22   15   11    steady decline, halved
B:         8   12   19   28   34   38   40    growth that decelerates; crosses A around 2012
C:        26   27   25   28   26   27   28    flat throughout — the "no change is a finding" teaching point
```
Overview writes itself: A and B swapped places in the early 2010s while C barely moved. Grouping writes
itself: ¶3 the two that swapped, ¶4 the one that didn't.

*Bad shape 1 — too thin* — 2 × 4 = 8 cells, both rising in parallel: two sentences of content, no
crossover, no exception, nothing to group.

*Bad shape 2 — overwhelming* — 5 × 11 = 55 cells with noisy year-on-year wobble: the learner cannot see
a pattern to summarise, so the task tests chart-reading rather than writing, and it fails our
legibility budget.

*Bad shape 3 — trivially uniform* — 4 series all rising at the same rate: one sentence covers the whole
chart, so there is no second body paragraph.

---

**`bar` (single series, no time)**

- 6–8 categories. 6–8 cells. **Only ever difficulty 1.**
- **Required:** a clear leader, a clear cluster of 2–3 near-equal middle values (so the learner can
  practise grouping in one clause), and a clear tail.
- Use sparingly. A single-series bar cannot train trend language and is our weakest existing shape.

---

**`grouped_bar` — the organisation test (we have none; highest priority to add)**

- 4–6 categories × 2–3 groups. Target 12–18 cells.
- The groups are the second dimension: two countries, two years, male/female, two age bands.
- **Required:** one pattern that holds across most categories, plus **exactly one category that breaks
  it**. The exception is what the overview must name and what separates band 6 from band 7.

*Good shape* — 5 × 2 = 10 cells:
```
             Housing  Food  Transport  Leisure  Other
Country X:      31     18       14        12      25
Country Y:      22     27       10         8      33
```
X leads on housing, transport and leisure; Y leads on food and other. The pattern-plus-exception is
present. A two-year version of the same shape adds change language on top.

*Bad shape* — 8 categories × 3 groups = 24 cells with no consistent pattern: it looks rich, but with no
pattern there is nothing to summarise and the learner must list. **Richness without pattern is the most
seductive authoring mistake.**

---

**`stacked_bar` — share within a whole, across a dimension (we have none)**

- 4–5 stacks × 3–4 components = 12–20 cells. Components should sum to 100 (or to a stated total).
- **Required:** one component whose share rises consistently across the stacks, one that falls, one
  that holds. That gives the three-way grouping directly.
- Warning: our renderer treats stacked bars through the same cartesian path as grouped bars; verify
  visually before shipping any stacked prompt.

---

**`pie` — shares**

- **Prefer two or three pies over one.** A single pie should exist only at difficulty 1.
- 5–7 segments per pie; with two pies that is 10–14 cells, which lands in the sweet spot.
- **Required for a pie pair:** at least one segment that holds its rank (stability), at least one that
  changes share sharply (change), and no more than one segment below 5% (slivers are unreadable and
  unreportable).
- Segments must sum to 100. Round so they actually do — a pie summing to 99 is a data bug the learner
  will notice and lose time over.

*Good pair* — 2 × 6 = 12 cells:
```
              2005   2025
Category A:     42     31     still the largest, but down 11 points
Category B:     11     26     more than doubled — the headline change
Category C:     20     18     essentially stable
Category D:     14     13     essentially stable
Category E:      8      7     essentially stable
Category F:      5      5     unchanged
```
Overview: A dominated in both years but its lead narrowed sharply as B more than doubled; the rest
barely moved. That is a band-7 overview and the data made it available.

**Structural note:** the existing pie spec stores segment labels in `x_axis.categories` and values in a
single `series[0]`. A *pair* of pies therefore has to be modelled either as one spec with two series
(and a renderer that draws two rings), or as a `mixed` spec. **This needs a decision from the design
agent — see §10.**

---

**`table`**

- 4–5 data rows × 3–4 data columns = 12–20 cells.
- Tables are the best vehicle for "you cannot report all of this", so push toward the top of the range.
- **Required:** either two different units/measures (counts + a rate, volume + a per-capita figure), or
  two time points across all rows. Both is a good difficulty 3.
- **Required:** one row that behaves differently from the rest.
- Keep row labels short — the renderer has to fit them.
- Never more than 5 columns; a table wider than that becomes a reading-comprehension test.

---

**`process`**

- **6–9 steps.** Below 6 there is not enough to write 150 words about; above 9 the learner cannot hold
  the sequence and the diagram gets unreadable at panel width.
- **Required: the steps must group into 2–4 nameable phases** (§6.2). Author the phase names first,
  then the steps inside them. If you cannot write the band-7 overview from your own step list, the
  step list is wrong.
- **Required:** a named input and a named output (or an explicit return-to-start for a cyclical
  process).
- **Recommended:** one step with a stated condition or duration (*left to dry for 48 hours*, *heated to
  900°C*), because that is where the higher-band grammar attaches. One or two such details, not six.
- **Recommended for difficulty 3:** one branch (the flow divides), which forces *while*/*meanwhile* and
  parallel-structure language. Our `steps[].next` is a list, so branching is already expressible.
- Step labels should be **noun-phrase or short-clause fragments**, not full sentences — if the diagram
  hands the learner a finished sentence, they will copy it, and copying is penalised.
- Author both a man-made process (passive) and a natural cycle (active), because the grammar differs.

---

**`map`**

- **7–10 features per snapshot**, with **4–7 differences** between the two snapshots.
- **Required:** at least one feature that is **unchanged** and present in both snapshots (the stability
  half of the overview, §7.4).
- **Required:** at least one *conversion* (X became Y), at least one *addition*, at least one *removal*.
  Three change types means three verb families get exercised.
- **Required:** features distributed across the compass, not clustered in one corner — otherwise the
  spatial language collapses to "in the middle".
- Keep one orienting linear feature (a road, a river, a coastline) present in both snapshots. It gives
  the learner a spatial anchor and licenses *runs*, *flows*, *spans*, *along*.
- Coordinates are on a 0–100 × 0–100 grid; keep features ≥ 8 units apart so labels do not collide.
- Author at least one **competing-proposals** map (present vs proposed) to exercise the future-tense
  row of §7.2.

---

**`mixed` — the missing type**

- Two visuals of **different kinds** (pie + bar, table + line, bar + pie are the common real pairings).
- Total cells across both: **16–26**. Each visual on its own should be *slightly thin* — that is the
  point. Neither visual is worth 180 words alone; together they are exactly right.
- **Required: a genuine relationship between the two.** The two visuals must be about the same
  population and must be *interpretable together* — e.g. a pie showing how a total is composed, plus a
  bar showing how that total changed over time; or a table of quantities plus a bar of the reasons.
  Two unrelated visuals stapled together is not a `mixed` task, it is two tasks.
- The description line must introduce both, and the standard rubric line follows once.
- The signature teaching point: the overview must cover **both** visuals, ideally in a sentence that
  links them. Failure W8 (§3.5) is the type's characteristic loss.

*Good pairing example:* a pie of how a city's water is used by sector, plus a line of total water
consumption over six years. The overview: consumption fell overall while one sector continued to
dominate use. Neither visual gives you that sentence alone.

*Bad pairing:* a pie of transport modes plus a table of exam results. No shared population, no
relationship, nothing to link.

### 9.3 Data design rules that apply to every genre

1. **Every task must contain at least one thing worth saying that isn't a rank.** A crossover, a
   reversal, an exception, a plateau, a disproportion. If the only true sentences are "A is biggest and
   E is smallest", the task cannot produce a band-7 answer.
2. **Author the overview before the data.** Write the two overview sentences you intend a band-7
   candidate to produce, then build the numbers so those sentences are true and are the *best* two
   sentences available. This is the single highest-value authoring discipline in the section.
3. **Author the grouping before the data.** Know which two body paragraphs the data supports. If you
   cannot name them, the data has no structure.
4. **Numbers must be humanly readable off a chart.** Round to values a learner can estimate: whole
   numbers, or one decimal place only where the unit demands it (our transport chart's 1.42 is at the
   limit). Never two decimals.
5. **Units must be stated and consistent**, and the unit must be repeatable in prose — "journeys per
   person per day" works; "index (2010 = 100)" invites confusion about what changed.
6. **Percentages must sum correctly** where they are shares; make clear when they don't (multiple
   response).
7. **Plausibility.** Invented places and invented data, but the magnitudes must be believable. A city
   with 400 million tourists is a distraction.
8. **No real organisations, real cities, or real published statistics.** Invented toponyms
   (Verdon, Norland, Ashfield in our existing bank) — keep that convention and keep it consistent so
   the bank feels like one world.
9. **Time frames must be internally consistent** with the tense the task expects: a period ending in a
   past year takes past simple; a period ending "at present" changes the tense system. Vary this
   deliberately across the bank so learners meet both.
10. **One trap per task, at most.** A percentage-point trap, or a two-unit table, or a natural-cycle
    passive trap — not three at once.

### 9.4 The description line — authoring rules

- One sentence. 18–30 words.
- Must contain: the visual type, the measured variable, the **unit**, the population/place, and the
  time scope. Our existing lines do this well; keep the standard.
- **It must be paraphrasable.** If the line uses words with no synonyms, the learner cannot avoid
  copying it and we have designed a trap. Give at least two paraphrasable elements — *shows* → *illustrates/
  gives information about*; *the number of journeys made* → *how many trips were taken*.
- Never smuggle a cause or an evaluation into the line ("…showing the success of the new tram
  network"). That invites the invented-causes failure we are trying to prevent.
- Word count of the line matters for our copy-detection threshold: a 25-word rubric plus a 30-word
  description means a learner who copies both has 55 uncredited words.

### 9.5 Difficulty calibration

`difficulty` is an int 1–3 in `WritingPromptRow`. Concrete definitions so the ladder means something:

| | Difficulty 1 | Difficulty 2 | Difficulty 3 |
|---|---|---|---|
| Cells | 6–12 | 13–24 | 22–35 |
| Series/dimensions | 1 series, or 1 time axis | 2–3 series, or 2 dimensions | 3+ series, or 2 dimensions × time, or 2 units |
| Grouping | Obvious (big / small) | Requires a choice between two defensible groupings | Requires a choice, and the obvious grouping is the worse one |
| Language load | Ranking + proportion | Trend + comparison | Trend + comparison + exception + approximation |
| Traps | None | One | One or two |
| Genres typical here | single `bar`, single `pie`, simple `line` | `line` 3-series, `grouped_bar`, two-period `pie`, `map`, `process` linear | `table` two-unit, `stacked_bar`, `mixed`, branching `process`, three-period data |

### 9.6 Anti-pattern catalogue — reject a `chart_spec` if any of these are true

- The whole visual can be truthfully described in three sentences.
- All series move in the same direction at the same rate.
- There is no exception, crossover, plateau or disproportion anywhere.
- The learner would have to report every cell to reach 150 words.
- Two decimal places, or values that can't be read off the axis.
- A pie whose segments don't sum to 100, or with more than one segment under 5%.
- A process whose steps don't group into nameable phases.
- A map where every feature changed (nothing to say about stability) or where the features cluster in
  one region.
- A `mixed` task whose two visuals share no population.
- More than 5 series or more than 12 categories (renderer limits).
- A description line that pre-supplies the overview ("…showing a steady rise in all three sources").

---

## 10. Repo findings the design agent must act on

Found while checking constraints. Reported here rather than fixed, per the ownership rule.

1. **`mixed` is allowed but not implemented.** `TASKS["ac_task1"]["genres"]` includes `mixed`, and
   `app/src/features/writing/store.ts` even carries the label "Two visuals" for it — but
   `ChartRenderer.tsx` has `DRAWABLE = {bar, grouped_bar, stacked_bar, line, pie, process, map}`, so a
   `kind: "mixed"` spec falls through to the raw data table, and `chart_to_text()` in
   `sidecar/bandready/scoring/writing.py` has no `mixed` branch, so the evaluator would receive only a
   title. **Authoring a combined task requires either a renderer/serialiser change or a modelling
   decision** (e.g. `chart_spec` as a list of two child specs, or a `panels: []` key). This is the
   single biggest blocker on the §2.2 content gap and needs deciding before any `mixed` prompt is
   written.
2. **Two-pie tasks have no representation either.** The pie path reads `series[0]` only. A pie *pair*
   is the most valuable missing shape after `mixed` and hits the same modelling question.
3. **`grouped_bar` and `stacked_bar` are supported by the renderer and used by nothing.** No blocker —
   just unwritten content.
4. `SERIES_MAX = 5`; over-limit specs silently downgrade to a table with a warning banner. Authors must
   treat 5 as hard.
5. `DEFAULT_THRESHOLDS["prompt_copy_run"] = 20` words. For Task 1, where the fixed rubric line is 17
   words and description lines run 18–30, a 20-word run is generous — a learner can copy the entire
   rubric line and not trip it. Worth a task-type-specific threshold.
6. `WritingPromptRow` is `extra="allow"`, so a teaching payload can be added to `writing_prompts.jsonl`
   with no schema migration — same property the speaking pack relied on.

---

## 11. Copyright position for this module

- The **format**, **timing**, **word minima**, **task types**, **the four criteria and what they
  assess**, and **the topic areas that recur** are facts about the exam. Freely usable.
- The **rubric instruction line** is a functional instruction, already shipped in our pack, and is
  reproduced unchanged so prompts are usable. It is one sentence of pure instruction with no expressive
  content.
- **Band descriptor wording is copyrighted text.** Everywhere this file describes the descriptors it
  paraphrases them. §3.2 is a clean-room paraphrase; downstream agents should reuse §3.2's wording
  rather than going back to the descriptor PDF.
- **No prompt, dataset, map, process diagram or candidate script from any source is reproduced.** All
  example data in §9 is invented for this briefing and is illustrative of *shape* only — do not paste
  it into prompts either; author fresh numbers.
- Product copy says **"IELTS-style"** and carries the non-affiliation notice.

---

## 12. Sources

Official / partner-published (primary):

- [IELTS Academic Writing Sample Tasks (2023 PDF, ielts.org)](https://ielts.org/cdn/Sample-tests/ielts-academic-writing-sample-tasks-2023.pdf) — the three-layer task shape, the rubric line on chart/graph/process tasks, the four criteria, the information-transfer definition of Task Achievement, the note/bullet-point and plagiarism penalties, and six Academic Task 1 examiner comments at Bands 5, 6, 7 and 8.5.
- [Sample Candidate Writing Responses and Examiner Comments (computer-delivered set, ielts.org)](https://ielts.org/cdn/computer-delivered-sample-tests-academic-writing/ielts-academic-writing-example-responses-to-parts-1-and-2-with-band-scores-and-examiner-comments.pdf) — Band 6 and Band 4 Task 1 responses with examiner commentary; the end-position overview being credited; "key features not adequately covered".
- [IELTS Writing Band Descriptors, Task 1 and Task 2, public version (partner-hosted PDF)](https://assets.ctfassets.net/unrdeg6se4ke/19SJoSvnUYjrHgVhWvuMnC/42f1b0cb0d7709646a1392d8418646d0/writingbanddescriptorstask1and2.pdf) — the Band 5/6/7 overview ladder in §3.2 (paraphrased, not quoted).
- [IELTS Academic: Writing test format (ielts.org)](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing) — "one or more graphs, charts or tables"; word count and timing; register; connected-prose requirement; under-length and plagiarism penalties; the Task-2-is-worth-double warning.
- [Preparing learners for Task 1 on the IELTS Academic Writing test (ielts.org news and insights)](https://ielts.org/news-and-insights/preparing-learners-for-task-1-on-the-ielts-academic-writing-test) — overview of one or two sentences with no specific data; no conclusion needed; overview may go at the end; not all data needs to be included; no single correct organisation; sequencers for processes.
- [How to analyse graphs, charts and other visuals (IDP IELTS)](https://ielts.idp.com/prepare/article-ielts-academic-writing-task-1-how-to-analyse-graphs) — the four-part structure; highest/lowest/greatest-difference/exceptions as the key-feature heuristic; overview without figures and without every category.
- [IELTS practice Academic Writing test — Task 1 (British Council)](https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/writing/academic/task-1) — practice task in the official format. *(Fetched via search result metadata only; the page itself timed out on direct fetch — see §13.)*
- [IELTS Academic Writing Task 1 Activity, teacher's notes (Cambridge English)](https://www.cambridgeenglish.org/images/ielts-academic-writing-task-1-activity.pdf) — retrieved but the PDF's text layer would not extract; **not used as evidence** for any claim in this file.

Teaching-consensus sources (secondary; used only where partners are silent, and labelled as such in
the text):

- [Common Task 1 types (IDP IELTS Canada)](https://ielts.idp.com/canada/prepare/article-common-task-1-types) and [Writing Task 1 question types (IDP IELTS)](https://ielts.idp.com/prepare/article-ielts-writing-task-1-question-types) — the type inventory.
- [Latest IELTS Writing Task 1 (howtodoielts.com)](https://howtodoielts.com/ielts-writing-task-1/) — recent-task reporting (403 on direct fetch; used via search snippets only).
- [Recent IELTS Academic Writing Task 1 charts, Q4 2025 (simplyielts.com)](https://simplyielts.com/recent-ielts-academic-writing-task-1-charts-q4-2025-quarterly-review/) — student-reported recent task types.
- [IELTS Academic Writing Task 1 map topics (writing9.com)](https://writing9.com/ielts-academic-writing-task-1-topics/maps) — evidence on rubric-wording variants for map tasks.
- Process/passive-voice and map-tense guidance triangulated across [ieltsbuddy passive voice](https://www.ieltsbuddy.com/passive-voice.html), [ieltsbuddy map tenses](https://www.ieltsbuddy.com/ielts-task-1-map.html), [Cathoven process diagram](https://resources.cathoven.com/ielts-writing-task-1/process-diagram) and [TED-IELTS Task 1 types](https://ted-ielts.com/ielts-academic-writing-task-1-types/).
- Key-feature selection guidance triangulated across [IELTS Advantage Task 1](https://www.ieltsadvantage.com/writing-task-1/), [IELTS Jacky Academic Task 1](https://www.ieltsjacky.com/ielts-academic-writing-task-1.html) and [fastforwardielts on choosing key features](https://www.fastforwardielts.com/post/academic-writing-task-1-how-to-choose-key-features-for-the-overview).
- [Cambridge 19 Test 4 Writing Task 1 (pie chart and bar chart)](https://thewonderfulworldofjazz.blogspot.com/2025/02/cambridge-19-test-4-writing-task-1-pie.html) — evidence that combined tasks appear in current official practice material.

---

## 13. Confidence notes

**High confidence (official, directly evidenced):**
- Word minimum, timing, Task 2 double weighting, the rubric line, the four criteria.
- The information-transfer definition of Task Achievement and the explicit exclusion of speculative
  explanation. This is the strongest single piece of evidence in the file.
- The overview band ladder (absent → present → clear) and its consequences.
- The bullet-point/note-form and plagiarism penalties; copied rubric earning no credit.
- The overview may sit at the end and still be credited.
- "Counting the stages is not a sufficient overview" — from a Band 8.5 examiner comment.
- Register failures cap Task Achievement independently of language quality.
- The same rubric line applies to process tasks.

**Medium confidence:**
- Relative frequency of visual types. Directionally reliable (line and bar most common; process and map
  least) but **no partner publishes numbers and none should be quoted as if they did**. §2.2's weighting
  table is a planning decision, not a finding.
- Combined/`mixed` being a routine type. Well-attested across teaching sources and confirmed by a
  current Cambridge test, but I did not verify a Cambridge volume directly.
- Rubric-wording variants for map and older process tasks. Non-official reproductions only, and those
  sites introduce their own errors.
- The optimal answer length of 165–195 words. Consensus, not official; the only official number is the
  150 floor.
- Map tense guidance (§7.2). Consistent across teaching sources and linguistically sound, but not
  addressed in partner material at all.

**Low confidence / clearly labelled as our own reasoning:**
- **All of §9.** The cell-count bands, the difficulty calibration and the per-genre shape requirements
  are derived from the word-budget arithmetic in §4.2 and from what our renderer can draw. They are
  defensible and internally consistent, but no external source states them. They should be reviewed
  against the first batch of authored charts and revised if the arithmetic doesn't survive contact.
- The §1.2 time split. A reasonable plan, not an official one.
- The claim that process/map performance is diagnostic of masked grammar weakness (§6.6). A plausible
  hypothesis about our own learners; worth testing against our data once we have any, not worth
  asserting to users yet.

**Known gaps I could not close:**
- No published frequency distribution of Task 1 visual types exists.
- The Cambridge teacher's-notes PDF would not yield text; its content is not represented here.
- I found no official statement on how many figures a good answer should cite. §4.2's 8–14 is derived,
  not sourced.
- No official guidance exists on the two-pie or combined-visual overview specifically; §3.6's recipes
  for those are consensus plus reasoning.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University
Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of them. No exam
material is reproduced in this document; all example data and example sentences are original text
authored for BandReady.*
