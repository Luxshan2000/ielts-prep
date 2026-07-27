# R-R1 — IELTS-style Reading: question types, answer-format rules, order behaviour, trap taxonomy

Research briefing for the BandReady Reading deepening. Written for the people who will author
passages, write question groups, and build the teaching payload. Everything here is either (a) a
format/rules fact taken from official IELTS-partner publications, (b) a measured fact about our own
repo, or (c) an explicitly-marked inference.

**Status:** research input, not a schema. The schema of record is `docs/plan/06-reading-module.md` §3
plus `ReadingPassageRow` / `ReadingTestRow` in `sidecar/bandready/content/validate.py`. Where this
briefing and the plan disagree, §11 below flags it; the plan wins until a human decides otherwise.

---

## 0. How to use this document, and its ground rules

### 0.1 Copyright — read it twice

The exam **format** is a fact. Question **types**, their **instruction patterns**, the **answer-format
rules**, the raw-score→band tables, and the **topic areas that recur** are all freely usable — they are
functional descriptions of a public test, published by the test owners themselves for candidates.

What is *not* usable: any passage, any question, any answer explanation, any distractor set, any
worked example from a real paper, a Cambridge book, or a coaching site. Every passage and every
question in our bank is **authored from scratch**. The passages named in §§1–9 below (Marie Curie,
the seawater greenhouse, caloric-restriction mimetics, the London-to-Brighton bike ride, the Chess
Turk, Kenyan cut flowers) appear here **only as evidence of what the type looks like in operation**
— they are named, never reproduced, and they are on the do-not-write list precisely because we read
them. If while authoring you notice you are reproducing a distinctive sentence or a distinctive
distractor you saw in research, rewrite it from the idea up.

Our copy says **"IELTS-style"** and carries the non-affiliation notice. 'IELTS' is a trademark.

### 0.2 Confidence key

Every claim in this briefing carries one of these:

| Tag | Meaning |
|---|---|
| **[OFFICIAL]** | Stated in an official IELTS-partner publication (ielts.org, IDP IELTS, British Council, Cambridge/UCLES). Treat as fact. |
| **[OFFICIAL-DERIVED]** | Not stated in one sentence, but follows directly from official sample tasks and their published answer keys. |
| **[CONSENSUS]** | Every substantial teaching source agrees, but no official statement found. Safe to teach; do not present as an exam rule. |
| **[CONTESTED]** | Sources disagree. §11 lists these individually. Never teach one side as fact. |
| **[OURS]** | A BandReady authoring decision proposed by this briefing. Needs a human sign-off before it becomes doctrine. |

### 0.3 What "teaching payload" means for a receptive skill

Speaking and Writing teach through band-graded model answers because the learner *produces*
language. Reading produces one thing: a key match. So the payload we build must be made of the
five things that actually decide a reading score:

1. **The worked solution** — anchor paragraph, the exact span that carries the answer, and the
   paraphrase bridge from question wording to text wording. Reading *is* paraphrase recognition.
2. **Distractor analysis** — for every wrong option, why it is wrong, in one actionable sentence.
   This is where the marks live.
3. **The named trap** — one slug from the taxonomy in §10, so a learner's error history becomes a
   diagnosis rather than a score.
4. **Per-type strategy** — attacking Matching Headings has nothing in common with attacking TFNG.
   §§3–9 carry the per-type attack plan.
5. **Time discipline** — the paper is a speed test as much as a comprehension test. §1.4.

There is no "model answer" field in reading and there should never be one.

---

## 1. The paper, measured

### 1.1 Academic Reading [OFFICIAL]

| | |
|---|---|
| Sections | 3, increasing difficulty |
| Questions | 40 |
| Total text length | 2,150–2,750 words across the three passages |
| Time | 60 minutes **including** transfer time |
| Marking | 1 mark per correct answer, no negative marking, no partial credit |
| Reporting | Band 1–9, whole and half bands |
| Passage sources (style) | Journals, books, magazines, newspapers — written for a non-specialist audience |

### 1.2 General Training Reading [OFFICIAL]

| | |
|---|---|
| Section 1 | "Social survival" — two or three short texts, or several shorter texts. Notices, advertisements, timetables, leaflets. |
| Section 2 | "Workplace survival" — two texts. Job descriptions, contracts, staff handbooks, training material. |
| Section 3 | "General reading" — one long text, descriptive or instructive, general interest. |
| Questions | 40 |
| Total text length | 2,150–2,750 words (same envelope as Academic) |
| Time | 60 minutes including transfer time |

Sections are of **increasing difficulty** in GT too, but the difficulty step from Section 1 to
Section 3 is much steeper than the Academic passage-1→3 step, because Section 1 is genuinely easy
everyday text and Section 3 is close to an Academic passage in register.

### 1.3 The transfer-time fact that matters strategically [OFFICIAL]

The Listening test gives paper-based candidates 10 extra minutes to transfer answers. **Reading gives
none.** The 60 minutes is inclusive. On computer-delivered IELTS there is nothing to transfer, so the
practical effect is that paper candidates have roughly 55 working minutes and CD candidates have 60.

Our plan doc's Reading table says "60 min, no transfer time" — that phrasing is correct and means
"no *extra* transfer time", but it reads ambiguously next to Listening. Worth a one-line clarification
in the UI: *"60 minutes total — unlike Listening, there is no extra time to write up answers."*

### 1.4 Time discipline — the number to teach

- 40 questions in 60 minutes = **90 seconds per question**, gross, including reading the passages.
- The passage-level budget every serious source teaches is **17 / 20 / 23 minutes** for Academic
  passages 1/2/3, or the coarser **20 / 20 / 20** with the instruction to bank time on passage 1.
  A common alternative is 15/20/25. [CONSENSUS — no official allocation exists]
- For GT the shape inverts at the start: Section 1's short texts are fast (target **12–15 min for
  ~14 questions**), Section 2 ~18 min, Section 3 gets the remaining ~27 min. [CONSENSUS]
- The single highest-value time rule: **never let one question consume more than ~2 minutes.** Flag
  and move. Unanswered = 0; a guess costs nothing (no negative marking) [OFFICIAL].
- Corollary worth surfacing in our results screen: a learner who leaves blanks has a *time* problem,
  not a comprehension problem, and the coaching for those two is completely different. Our
  `per_question.time_ms` already lets us detect this — see §12.

### 1.5 Where the marks actually are

40 questions, 1 mark each, and the band table is brutally steep in the middle: on the Academic table
in the plan doc §4.3, band 6.0 is 23–26 raw and band 7.0 is 30–32 raw. **Seven marks separate a 6.0
from a 7.0.** That is roughly one bad TFNG group. This is the single most motivating fact we can put
in front of a learner and it should appear in the Reading coach.

---

## 2. Answer-format rules that apply across types

These are the rules our scorer (`sidecar/bandready/scoring/answers.py`) and our `word_limit` object
must agree with. Read `answers.py` before authoring accepted-answer variants — do not invent a second
normalizer.

### 2.1 The word limit [OFFICIAL]

- A limit is stated in the instruction line, e.g. `NO MORE THAN TWO WORDS AND/OR A NUMBER`,
  `ONE WORD ONLY`, `NO MORE THAN THREE WORDS`.
- **Exceeding the limit loses the mark**, even if the correct words are inside your answer. [OFFICIAL]
  There is no partial credit anywhere in the Reading paper.
- The limit **changes between groups within one paper**. Candidates who read it once and assume it
  holds are a real loss category. Our player must re-render the instruction per group — the plan's
  "generate the instruction string from the `word_limit` object, never hand-type it" rule is exactly
  right and should be enforced by the validator.
- Observed limits in the official sample set: `ONE WORD ONLY` (note completion, sentence completion),
  `NO MORE THAN TWO WORDS` (flow-chart, summary), `NO MORE THAN THREE WORDS` (table completion,
  diagram labelling), `NO MORE THAN THREE WORDS AND/OR A NUMBER` (short answer). [OFFICIAL-DERIVED]

**Counting rules** [OFFICIAL for hyphens and contractions; the rest OFFICIAL-DERIVED]:

| Rule | Effect |
|---|---|
| Hyphenated compounds count as **one** word | `check-in`, `well-being`, `sub-tropical` = 1 |
| Contractions count as one word, but **are not tested** | `they're` will not be a key |
| Articles count | `the coal mine` is 3 words and fails a 2-word limit; `coal mine` passes |
| `AND/OR A NUMBER` | permits a number *in addition to* the word allowance |
| Numbers as digits or words | `2-5` and `two to five` both keyed in an official answer key |

Our `word_limit` object `{max_words, numbers_allowed}` covers every observed instruction line.
Keep it. Do not add a `min_words`.

### 2.2 Words must come from the passage — for completion types [OFFICIAL]

Sentence / summary / note / table / flow-chart / diagram / short-answer completion all say
"**from the passage**" or "**from the text**". The answer is a **verbatim, contiguous** span of the
passage. The candidate may not paraphrase, may not change the form of the word, may not join two
non-adjacent words.

This is an authoring constraint with teeth:

- **[OURS] Every completion answer we key must be checkable as a case-insensitive substring of the
  passage text**, in exactly the form keyed. Add this to the validator alongside the existing
  `evidence_quote` substring check. If we key `ceramic jar` where the passage says `ceramic jars`,
  we have authored a question that the real exam would mark differently from us.
- The plan's §3 example keys a singular variant with `"note": "singular accepted"`. That is
  **defensible for our scorer's leniency but pedagogically wrong to display**: the correct answer is
  the passage's form. Show the passage form as *the* answer, list variants as "also accepted here".
- The **summary-completion-with-a-word-bank** type is the exception: the bank words are chosen by the
  item writer and are frequently **synonyms of the passage wording, not the passage wording itself**
  [OFFICIAL-DERIVED — in the official sample the bank is `difficult / complex / original / admired /
  material / easy / fundamental` and matches the passage only in meaning]. This is why the type is
  harder than it looks and why it needs its own explanation slot.

### 2.3 Grammar of the gap [CONSENSUS, high confidence]

Completion answers must make the completed sentence grammatically correct. Item writers exploit
this deliberately: determiners (`many`, `each`, `a`), auxiliaries, and prepositions around the gap
constrain the answer's number and part of speech. Writing the singular where the passage has the
plural is one of the most common self-inflicted losses.

**[OURS] Authoring rule:** for every completion question, the gap's grammatical frame must uniquely
determine number and word class. If both `sensor` and `sensors` would read grammatically, the item is
ambiguous and must be rewritten. Our teaching payload should carry a `grammar_cue` note naming the
word that fixes the form ("`many` before the gap forces the plural").

### 2.4 Capitalisation, spelling, letters [OFFICIAL for spelling; CONSENSUS for case]

- **Spelling must be correct.** ielts.org states plainly that marks are lost for incorrect spelling
  and grammar. There is no fuzzy matching and our scorer is right to refuse edit-distance rescue.
- **Case is not marked.** `paris`, `Paris` and `PARIS` all score. Candidates are widely advised to
  write in capitals for legibility on paper. Our normalizer's case-folding is correct and should stay.
- **US/UK spellings** are both accepted where both are standard. Our variant expansion handles this;
  the official key for the table-completion sample literally prints `tunneling/tunnelling`.
  [OFFICIAL-DERIVED]
- **Letter answers** (matching types, MCQ, summary-with-bank) are letters or Roman numerals, not
  words. `NOT GIVEN` may be abbreviated in candidate handwriting but we should key the full form and
  accept `NG` — which `answers.py` already does.
- The official key convention prints alternatives separated by a slash — **"Alternative answers are
  separated by a slash (/)"** appears verbatim in the ielts.org sample answer key. Our review screen
  should use the same convention when showing accepted variants; it is what learners will meet.

### 2.5 What the scorer must *not* do [OURS]

Do not add equivalence rules beyond what `answers.py` already implements. Every extra leniency
teaches the learner that a wrong form is right, and the real exam will not agree. In particular:
never auto-accept a singular for a plural key, never accept a paraphrase, never accept an
over-limit answer that "contains" the right words.

---

## 3. The order table — the single most useful strategic fact per type

Whether answers run in passage order decides the entire attack strategy. Get this wrong in our
teaching and we make learners slower. This table is the spine of the per-type coaching.

| Type | Answers in passage order? | Source strength |
|---|---|---|
| Multiple choice (single answer) | **YES** — "presented in the same order as the information in the reading text" | [OFFICIAL] |
| Multiple choice (multi-answer / list selection) | **YES** as a group; the letters within one question are unordered | [OFFICIAL-DERIVED] |
| True / False / Not Given | **YES** — "The statements follow the order of information in the passage" | [OFFICIAL] |
| Yes / No / Not Given | **YES** — same mechanics | [OFFICIAL-DERIVED] |
| Matching **headings** | **NO** — headings are deliberately scrambled; you must read every paragraph | [CONSENSUS, universal] |
| Matching **information** ("which paragraph contains…") | **NO** — scattered by design | [CONSENSUS, universal] |
| Matching **features** | **NO** — Cambridge's own teacher's notes say "in this task type, unlike others, the statements are not in order" | [OFFICIAL] |
| Matching **sentence endings** | **YES** — "the answer to the first question in this group will be found before the answer to the second" | [OFFICIAL] |
| Sentence completion | **YES** — same official wording | [OFFICIAL] |
| Summary completion (both variants) | **NO** — "The answers will not necessarily occur in the same order as in the text" | [OFFICIAL] but **[CONTESTED]** in practice — see §11.1 |
| Note completion | **NO** — same family as summary | [OFFICIAL] |
| Table completion | **NO** in principle; in practice usually row-by-row | [OFFICIAL] + [CONTESTED] §11.1 |
| Flow-chart completion | **NO** in principle; in practice the chart is a process and the process is usually described in order | [OFFICIAL] + [CONTESTED] §11.1 |
| Diagram labelling | **NO** — "The answers do not necessarily occur in order in the passage" | [OFFICIAL] |
| Short answer | **YES** — "The questions are in the same order as the information in the text" | [OFFICIAL] |

**The one-line rule to teach:** *everything that is a "matching" task except sentence endings is
out of order; everything shaped like a summary or a picture is out of order; everything else runs
top to bottom.*

**The compensating rule for the out-of-order types:** the completion family (summary / note / table /
flow-chart / diagram) is drawn from **one section of the passage, not the whole text** [OFFICIAL].
So the learner's job is *locate the section once*, then work inside it. That single fact converts
the scariest-looking types into the fastest ones, and it belongs in our per-type strategy card.

**[OURS] Schema consequence.** Add an optional group-level field `answer_order: "sequential" |
"scattered" | "section_local"` and a `section_scope: [paragraph_ids]` for the completion family.
The player can then show the correct strategy hint, and the validator can assert that a
`sequential` group's `anchor_paragraphs` are non-decreasing across question numbers — which catches
a whole class of authoring error automatically.

---

## 4. Per-type dossiers — the matching family

Each dossier: **what it asks → instruction pattern → answer format → order → distribution → how
marks are lost → what our teaching payload must carry.**

Instruction patterns below are the standard functional wording published in official sample tasks.
Per the plan, we **generate** them from the group object rather than hand-typing them, so they stay
in sync with the scorer.

---

### 4.1 Matching headings

**Asks:** choose the heading that captures the *main idea* of each lettered paragraph or section.
Tests "the ability to recognise the main idea or theme in the paragraphs or sections of a text, and to
distinguish main ideas from supporting ones" [OFFICIAL].

**Instruction pattern** [OFFICIAL-DERIVED, from ielts.org sample tasks]:
```
Reading Passage 1 has five sections, A–E.
Choose the correct heading for each section from the list of headings below.
Write the correct number, i–viii, in boxes 1–4 on your answer sheet.

        List of Headings
   i    …
   ii   …
```
A GT variant seen in the official sample skips some paragraphs: *"Choose the correct heading for
paragraphs A, B and D–G"* — i.e. one paragraph is done as an example or simply not asked.

**Answer format:** a **Roman numeral**. Not a letter, not a word. This trips candidates who write
`iv` as `4` or as the heading text. There are always **more headings than paragraphs**; each heading
is used **once at most**.

**Order:** **NOT in passage order.** The headings list is randomised on purpose. There is no
"answer 2 is after answer 1" shortcut. The questions themselves are of course in paragraph order
(Paragraph A, then B, …) but that gives no locating advantage — you must read every paragraph.

**Distribution:** appears in roughly one group per paper, most often on **Passage 1 or Passage 2**
(Academic) and on **Section 3** (GT), sized **5–8 questions** — often the largest single group in the
paper. Very frequently the *first* group a candidate meets. [CONSENSUS; no official frequency data
exists — see §11.3]

**How marks are lost:**
1. Choosing a heading that matches a **vivid detail** inside the paragraph rather than its
   controlling idea. This is the designed trap and it accounts for most losses.
2. Choosing on a **shared keyword** — the heading and the paragraph share a noun, nothing else.
3. **Cascade failure**: one wrong assignment forces a second, because headings can't be reused. A
   single early error can cost three marks. This is why the type has the worst
   marks-lost-per-mistake ratio in the paper.
4. Spending 12 minutes on it because it looks like the easy warm-up.
5. Answering it *first* when it is the group that most rewards being answered *last* — after the
   other groups have forced you through the passage anyway.

**Attack plan to teach:**
- Read the paragraph, then say its job in six words *before* looking at the list. Then match.
- The main idea is usually carried by the **topic sentence plus the last sentence**; the middle is
  usually exemplification.
- Distinguish *topic* (what it's about) from *point* (what it says about it). Headings test the point.
- Do the certain ones, cross them off, and let elimination carry the doubtful ones.
- If two headings both seem to fit, one of them fits an **adjacent** paragraph better. Check the
  neighbours before deciding.

**Payload requirements:** per question — `anchor_paragraphs` (one), `evidence_quote` (the topic
sentence or the sentence that carries the point), `explanation` naming the controlling idea in our
own words, and **`distractors[]` with one line per unused-but-tempting heading** stating which
paragraph or which detail it actually belongs to. Matching headings without distractor analysis is
worth almost nothing as teaching.

---

### 4.2 Matching information ("which paragraph contains…")

**Asks:** find which lettered paragraph contains a specific piece of information — a detail, an
example, a reason, a description, a comparison, a summary, an explanation. Tests the ability to
**scan for specific information** [OFFICIAL]. Cambridge's own materials draw the contrast explicitly:
unlike matching headings, "this task is about locating specific information whereas Task Type 5 was
matching sentences containing the main idea of a paragraph" [OFFICIAL].

**Instruction pattern** [OFFICIAL-DERIVED]:
```
Reading Passage 2 has seven paragraphs, A–G.
Which paragraph contains the following information?
Write the correct letter, A–G, in boxes 14–19 on your answer sheet.
NB   You may use any letter more than once.
```
GT Section 1 has a distinctive multi-text variant: *"Look at the five advertisements, A–E. Which
advertisement mentions the following?"* — the "paragraphs" are separate short texts. This is a
first-class GT pattern and our GT Section 1 content should use it.

**Answer format:** a **paragraph letter**. Letters **may repeat** when the `NB` line is present;
some paragraphs go unused. There are typically **more paragraphs than questions**.

**Order:** **NOT in passage order**, and this is the defining difficulty. Cambridge's teacher notes
tell teachers to have students read paragraph A and then check *all* the information points against
it — i.e. work paragraph-first, not question-first.

**Distribution:** 4–7 questions, usually one group per paper, most often **Passage 2 or 3**
(Academic). Very common in **GT Section 1** in its multi-advertisement form. [CONSENSUS]

**How marks are lost:**
1. **Question-first searching.** Taking question 1 and scanning the whole passage for it, then
   question 2, then question 3 — this re-reads the passage six times. It is the single biggest time
   sink in the paper and is how candidates run out of clock before Passage 3.
2. Landing in a **decoy zone**: two paragraphs mention the keyword; only one contains the *type* of
   information asked for (a *reason* vs a *description* of the same thing).
3. Missing the paraphrase entirely — the item wording is deliberately abstract ("the relative merits
   of X and Y" for a paragraph that says "trains are cheaper but cars are more flexible").
4. Assuming each paragraph is used once, and refusing to repeat a letter.

**Attack plan to teach:**
- Read **all** the information points first, holding them loosely in mind.
- Then go **paragraph by paragraph**, asking "does this paragraph contain any of them?" One pass.
- Notice the *category word* in each item — detail, reason, example, comparison, prediction — and
  match on category, not just topic.
- Save this group for after you have read the passage for another group. It is the cheapest group to
  answer second.

**Payload requirements:** `anchor_paragraphs` (exactly one), an `evidence_quote` short enough to
show the actual span, an `explanation` that states the paraphrase bridge, and a
`decoy_paragraphs[]` list naming the paragraph a careless scanner would pick and why it fails.

---

### 4.3 Matching features

**Asks:** match a set of statements to a list of lettered options — researchers, theories, countries,
periods, categories. Tests "the ability to recognise relationships and connections between facts in
the text and… to recognise opinions and theories" [OFFICIAL].

**Instruction pattern** [OFFICIAL-DERIVED, from the ielts.org sample]:
```
Look at the following items (Questions 7–10) and the list of groups below.
Match each item with the group which first invented or used them.
Write the correct letter A–E in boxes 7–10 on your answer sheet.
NB   You may use any letter more than once.
```

**Answer format:** a **letter** from the feature list. Options may be reused (with the `NB` line) or
may go unused. The number of options is usually smaller than in matching headings — a short closed
set (A–E) with many items.

**Order:** **NOT in order.** Cambridge's own teacher's notes for this task say so directly and
draw the pedagogical consequence: since the statements are not in order, "they can save time by
keeping more than one in mind at a time, and so they should read all the statements first" [OFFICIAL].

**Distribution:** 4–6 questions, one group, most often **Passage 2 or 3** (Academic). Frequent when
the passage is a "competing theories" or "several researchers" text — which makes it an easy type
for *us* to author deliberately by choosing that passage shape. [CONSENSUS]

**How marks are lost:**
1. **Name-spotting.** The candidate finds "Harkness" and takes the nearest claim, without checking
   whether the sentence attributes that claim to Harkness or contrasts it with her.
2. **Reported-view confusion**: "X argued, against Y's claim that Z" — Z belongs to Y, not X.
3. Not noticing that a feature can be used twice, and forcing a one-to-one mapping.
4. Missing that the passage sometimes attributes a view to a *group* the option list names
   differently ("the Americans" vs "US researchers").

**Attack plan to teach:**
- Highlight every occurrence of every feature-name in the passage **first**. That map is the whole
  task.
- Read the sentence *around* the name, including the clause boundaries: "unlike", "whereas",
  "in contrast to" reverse attribution.
- Handle findings vs opinions separately — Cambridge's material makes exactly this distinction:
  findings use *shows / reveals / proves*, opinions use *believes / argues / claims*. Items often
  test which of those two a feature produced.

**Payload requirements:** `anchor_paragraphs`, `evidence_quote` including the attribution verb, an
`explanation` that shows the attribution chain, and a `distractors[]` entry for the feature that the
name-spotting route would produce.

---

### 4.4 Matching sentence endings

**Asks:** complete a sentence beginning with the correct ending from a lettered list. Tests "the
ability to understand the main ideas within a sentence" [OFFICIAL].

**Instruction pattern** [OFFICIAL, from the ielts.org sample task]:
```
Complete each sentence with the correct ending, A–F, below.
Write the correct letter, A–F, in boxes 1–3 on your answer sheet.
```

**Answer format:** a **letter**. There are always **more endings than beginnings**. Each ending is
used **once**.

**Order:** **YES — in passage order.** Official: "the answer to the first question in this group will
be found before the answer to the second question, and so on." This is the one matching type with the
sequential advantage, and learners systematically don't know it. Teaching it is worth real marks.

**Distribution:** 3–5 questions, one group at most, any passage. Less common than the other matching
types — it does not appear in every paper. [CONSENSUS]

**How marks are lost:**
1. Choosing an ending that is **true according to the passage but doesn't complete *this* stem**.
   Several endings in a well-built set are true statements. Truth is not the test; completion is.
2. Choosing on **grammar alone** — the endings are usually all grammatically compatible, deliberately.
   Conversely, an ending that is grammatically *impossible* can be eliminated for free, and
   candidates forget to use that.
3. Losing track of subject reference: stems alternate between `she` (the researcher) and `they`
   (the subjects), and endings do too. Mismatching those is a common silent error.
4. Ignoring the in-order property and hunting the whole passage for every stem.

**Attack plan to teach:**
- Read the stem and **predict the ending's meaning** before looking at the list.
- Use the passage order: answer 2 is below answer 1. This shrinks the search radius massively.
- Eliminate on subject/number agreement first, then on meaning.
- Read the completed sentence back and ask "does the passage actually say this whole sentence?"

**Payload requirements:** `evidence_quote` covering the *whole* proposition (stem + ending), and a
`distractors[]` entry for every unused ending. The most valuable single line we can write for this
type is *"Ending C is true of the passage but answers a different stem — it belongs to question 2."*

---

## 5. Per-type dossiers — multiple choice

### 5.1 Multiple choice, single answer

**Asks:** choose the one correct completion or answer from four options. Tests detailed
understanding of specific points or of the writer's overall opinion.

**Instruction pattern** [OFFICIAL]:
```
Choose the correct letter, A, B, C or D.
Write the correct letter in boxes 1–4 on your answer sheet.
```
Stems are typically either a question ("According to the writer, 'bridge' jobs …") or a sentence
opening ("In paragraph one, the writer suggests that companies could consider …").

**Answer format:** one letter, A–D.

**Order:** **YES — in passage order** [OFFICIAL]. One of the three fully sequential types.

**Distribution:** 3–6 questions, usually one group, on any passage; very common on **Passage 3**
(Academic) where the questions turn towards the writer's argument. Also used as the final
"overall purpose / best title" question at the end of a passage. [CONSENSUS]

**How marks are lost:**
1. **Option is true but doesn't answer the stem.** The classic. All four options can be defensible
   statements about the world; only one answers the question asked.
2. **Option is true of a different part of the passage.** Correct content, wrong location — this is
   why passage order matters: the answer is between the previous answer and the next one.
3. **Overstatement.** The passage says "may contribute"; the option says "causes". See
   `trap.modality_shift` in §10.
4. **Word-for-word lure.** The option that repeats the passage's exact vocabulary is very often the
   wrong one; the correct option is usually the paraphrase.
5. Reading the options before locating the relevant passage span, and being led by them.

**Attack plan:** locate first, read the span, answer in your own head, *then* look at the options.
Eliminate on a single disqualifying word rather than trying to prove the winner.

**Payload requirements:** this type demands the fullest distractor analysis in the whole module.
**One sentence per wrong option, always** — naming *which* failure mode it is
(`true_but_irrelevant`, `true_elsewhere`, `overstated`, `keyword_lure`, `not_stated`). This maps onto
the trap slugs in §10 and is the single richest teaching surface in reading.

### 5.2 Multiple choice, multi-answer / list selection

**Asks:** choose TWO from five/six options, or THREE from seven. Official IDP description confirms
three shapes: **1 of 4, 2 of 5, 3 of 7**.

**Instruction pattern** [OFFICIAL, from the ielts.org sample task]:
```
Choose TWO letters, A–G.
Write the correct letters in boxes 1 and 2 on your answer sheet.
The list below gives some of the advantages of employing older workers.
Which TWO advantages are mentioned by the writer of the text?
```

**Answer format:** letters, **order-insensitive**. Each selected letter is worth **one question
number** — "Questions 1 and 2" consume two of the 40 marks, so a "choose TWO" item is a 2-mark item.
[OFFICIAL-DERIVED from the numbering in the sample tasks.]

**Order:** the group sits in passage order relative to other groups; **within** the item the letters
are unordered, and the two/three correct options are usually clustered in one region of the passage.

**Distribution:** 2–4 marks, appears in maybe half of papers. [CONSENSUS]

**How marks are lost:**
1. **Selecting the wrong number of options.** Selecting three when TWO are asked scores zero on both.
   Our player must hard-enforce `select_count` and warn, not silently accept.
2. Choosing an option that is **mentioned** but not as the thing asked ("mentioned as a disadvantage"
   when the stem asks for advantages).
3. Choosing an option that is a **general truth** the passage never states.
4. Treating it as two independent questions and giving up after finding one.

**Attack plan:** find the region where the list-topic is discussed; then test each option against
that region only; count your selections before moving on.

**Our schema:** the plan already models this as `multiple_choice_multi` with `select_count` and one
question object per answer slot sharing a `set_id`. That is correct — keep it, and make the scorer
a **set match over the slot group**, never a per-slot match, or a learner who picks the right pair in
the "wrong order" is penalised for nothing.

---

## 6. Per-type dossiers — the completion family

The five completion layouts (sentence, summary, note, table, flow-chart) plus diagram labelling
share one scorer path and one set of answer rules (§2). They differ in layout, in order behaviour,
and in what they test.

### 6.1 Sentence completion

**Asks:** complete gapped sentences with words from the passage. Tests the ability to **locate detail
or specific information** [OFFICIAL].

**Instruction pattern** [OFFICIAL]:
```
Complete the sentences below.
Choose ONE WORD ONLY from the passage for each answer.
Write your answers in boxes 1–5 on your answer sheet.
```

**Answer format:** words from the passage, verbatim, within the limit. Gaps may be mid-sentence or
sentence-final.

**Order:** **YES — in passage order** [OFFICIAL]. Sequential.

**Distribution:** 3–6 questions, common on every passage and in GT Sections 2–3. One of the most
frequent types in the paper. [CONSENSUS]

**How marks are lost:** over the word limit; wrong grammatical form (singular for plural); copying a
word that fits grammatically but comes from the wrong sentence; paraphrasing instead of copying;
spelling the copied word wrong (which is pure carelessness and painful to lose).

**Attack plan:** read the whole gapped sentence and predict the *word class* and *number* before
searching; use the sequential property to bracket the search; copy exactly, then re-read the
completed sentence.

### 6.2 Summary completion — the two variants

**Variant A — words from the passage** ("productive" in official naming).
```
Complete the summary below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
```

**Variant B — from a list of words** ("selecting from a list").
```
Complete the summary using the list of words, A–G, below.
Write the correct letter, A–G, in boxes 1–4 on your answer sheet.
```
The bank always has **more options than gaps**.

**Asks:** understand the details and/or the main ideas of a **section** of text [OFFICIAL].

**Answer format:** Variant A = passage words within the limit. Variant B = a **letter**. Note the
implication: in Variant B the answer written on the sheet is a letter, and a candidate who writes the
word instead may be marked wrong — a genuinely common and entirely avoidable loss. Our player
should render Variant B as a select, never as free text.

**Order:** officially **not necessarily in order**, and drawn from **one section rather than the
whole text** [OFFICIAL]. See §11.1 — the practical behaviour is contested.

**Distribution:** 4–6 questions, at least one summary group in most papers; Variant A is markedly
more common than Variant B. [CONSENSUS]

**How marks are lost:**
- Variant A: the usual completion failures (§6.1), plus failing to first **locate the section** the
  summary covers and instead scanning the whole passage.
- Variant B: choosing the bank word that **echoes the passage vocabulary** rather than the one that
  fits the summary's meaning and grammar. Bank distractors are engineered as near-synonyms; two
  options will often be plausible on meaning and separated only by collocation or word class.
- Variant B: ignoring the surplus options and assuming every bank word is used.

**Attack plan:** for both variants — read the whole summary first to get its shape; identify the
section of the passage it covers from the summary's opening; work inside that section. For Variant B,
mark the required **word class** at each gap before looking at the bank; that alone eliminates half
the options.

**Payload requirements for Variant B:** a `bank_analysis[]` — one line per *unused* bank word,
saying which gap it was designed to tempt and what disqualifies it. Without this the type teaches
nothing.

### 6.3 Note completion

**Instruction pattern** [OFFICIAL]:
```
Complete the notes below.
Choose ONE WORD ONLY from the passage for each answer.
Write your answers in boxes 1–6 on your answer sheet.
```
The layout is a titled bullet list, each bullet a compressed proposition with a numbered gap. In the
official Academic sample the notes are headed with a topic line and six bullets, each bullet
corresponding to a different fact in one region of the passage.

**Everything else is as §6.2 Variant A.** Order: not necessarily sequential; drawn from one section.
Very common in **GT Sections 1–2**, where the "notes" summarise an advertisement or a policy.

**Type-specific loss:** notes drop function words, so candidates mis-read the relationship the note
encodes ("Purpose: …" vs "Result: …") and fill in a factually present but relationally wrong word.

**We do not have this type in the bank yet.** It is one of the four missing types and it is the
easiest of the four to author well.

### 6.4 Table completion

**Instruction pattern** [OFFICIAL]:
```
Complete the table below.
Choose NO MORE THAN THREE WORDS from the passage for each answer.
```
The layout is a real table: a column of entities (species, products, periods, countries) against a
row of attributes, with numbered gaps in cells.

**Order:** officially not necessarily sequential; in practice the table's row structure usually
mirrors the passage's structure, so it *reads* sequential. [OFFICIAL + CONTESTED §11.1]

**Distribution:** 4–6 gaps, appears where the passage is comparative. Strongly associated with
passages that compare 3+ things on 3+ dimensions — again, an authoring hook: **build the passage to
support the table.**

**Type-specific losses:** reading the wrong row/column intersection under time pressure; carrying an
answer across from the example row's format; and the classic — the answer must fit the **column
header's category** (a *climate* column takes `temperate`, not `spring`).

**Authoring note [OURS]:** a table group is only fair if every gap's row+column pair uniquely
identifies one passage fact. Where the passage gives the same attribute twice, the item is ambiguous.

### 6.5 Flow-chart completion

**Instruction pattern** [OFFICIAL]:
```
Complete the flow-chart below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
```
Layout: boxes or steps linked by **arrows** showing a sequence of events, some boxes gapped. Official
samples also show a **branching** shape (one process splitting into "Theory 1 / Theory 2"), not just a
linear chain — our `layout.flow_chart` model of a flat `steps[]` array cannot express that.

**[OURS] Schema gap:** extend the flow-chart layout to
`{kind:"flow_chart", nodes:[{id, text}], edges:[[from,to]]}` or at minimum add an optional
`branches[]`. A flat step list can only render the simplest half of the real type.

**A second official variant exists:** *flow-chart completion selecting from a list of words* — the
same layout with a lettered bank instead of free text. Both appear in the official sample set.

**Order:** officially not necessarily sequential, but a flow chart depicts a *process* and processes
are usually narrated in order, so this is the completion type most likely to run in passage order in
practice. [CONTESTED §11.1]

**Type-specific losses:** filling a box with the *result* when the box wants the *input*; ignoring
the arrow direction; and answers that fit the process logically but aren't the passage's words.

**We do not have this type in the bank yet.**

### 6.6 Diagram labelling

**Instruction pattern** [OFFICIAL]:
```
Label the diagram below.
Choose NO MORE THAN THREE WORDS from the passage for each answer.
```
Layout: a picture — machine, building, biological structure, apparatus — with numbered leader lines.

**Asks:** "understand a detailed description, and to relate it to information presented in the form
of a diagram" [OFFICIAL].

**Order:** **NOT in passage order** [OFFICIAL, explicit]. But the labels come from **one section**.

**Distribution:** 3–6 labels, one group; appears in maybe a third of Academic papers, essentially
always attached to a passage describing a physical process or device. Rare in GT.

**How marks are lost:** answering from the picture rather than the text (a candidate who knows what
a greenhouse looks like will label it from world knowledge and be wrong); spatial confusion between
adjacent labels; over the word limit because technical noun phrases are long.

**Type-specific teaching:** the diagram is a *comprehension aid*, not a source. Every answer is in
the prose. Orient the diagram to the passage first (find the sentence that describes the whole thing),
then work outward.

**This is the module's hardest content problem** — it needs an actual asset. The plan's open question
1 lists three options. **[OURS] Recommendation:** option (c) — author a **small library of original
SVG diagrams** (a solar still, a lock on a canal, a heat pump, a seed-dispersal mechanism, a
suspension bridge deck, a cochlea) and write passages *against* them. That gives us a real,
correctly-rendered `diagram_labelling` type in the bundled bank, and it also gives the generator a
fixed set of diagrams it can write new passages for. LLM-emitted SVG (option b) will not survive
contact with reality.

### 6.7 Short-answer questions

**Instruction pattern** [OFFICIAL, from the GT sample]:
```
Answer the questions below.
Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the text for each answer.
Write your answers in boxes 4–8 on your answer sheet.
```
Stems are direct wh-questions: *"What has been found in some Fancy Foods products?"*, *"Where can you
find the batch number on the jars?"*

**Asks:** "locate and understand precise information in the text" [OFFICIAL].

**Answer format:** words or a number from the text, within the limit. **The answer must be words that
actually occur in the passage** — this is an authoring rule for us and a strategy rule for the learner.

**Order:** **YES — in text order** [OFFICIAL].

**Distribution:** 3–5 questions. Extremely common in **GT Sections 1–2** (notices, product recalls,
procedures) because those texts are full of retrievable facts. Less common in Academic.

**How marks are lost:** answering in a full sentence and blowing the word limit; answering in the
candidate's own words; giving two candidate answers separated by a slash (an answer containing two
alternatives is marked wrong); and missing that the wh-word constrains the answer type (*Where* wants
a place, *How much* wants a quantity).

**Teaching hook:** the wh-word is a free filter. Teach learners to convert the question into the
answer's shape before searching.

---

## 7. TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN — the extended section

These are the highest-loss types in the paper. They typically account for **10–14 of the 40 marks**
across an Academic paper (usually two groups of 5–7), and candidates who are otherwise at band 7
routinely score 50% on them. Every hour we invest in teaching these two types returns more band than
an hour spent anywhere else in Reading.

### 7.1 What each one actually tests

**Identifying information — TRUE / FALSE / NOT GIVEN.** Official framing: the task "tests your ability
to find information in a reading passage, then to read it carefully to understand the details… used to
test your understanding of a **factual passage** about a specific subject."

The decision rule [OFFICIAL wording pattern from the sample tasks]:
```
Do the following statements agree with the information given in Reading Passage 1?

In boxes 1–3 on your answer sheet, write

   TRUE        if the statement agrees with the information
   FALSE       if the statement contradicts the information
   NOT GIVEN   if there is no information on this
```

**Identifying a writer's views or claims — YES / NO / NOT GIVEN.** Official: tests the ability to
"recognise opinions or ideas". Used with **discursive or argumentative** passages.
```
Do the following statements agree with the claims of the writer in Reading Passage 3?

In boxes 27–32 on your answer sheet, write

   YES         if the statement agrees with the claims of the writer
   NO          if the statement contradicts the claims of the writer
   NOT GIVEN   if it is impossible to say what the writer thinks about this
```

**The distinction that matters:** TFNG is about **information in the text**. YNNG is about **what the
writer thinks**. In YNNG, "NOT GIVEN" is best read as *"the writer never tells us their view on this"*
— the passage may discuss the topic at length and still be NOT GIVEN, because it never reveals the
writer's stance. That is a genuinely different test and our two question types must never be mixed in
one group (the plan's validator already rejects mixing — good).

### 7.2 Rules of the type, and why each one is a strategy

| Rule | Source | Strategic consequence |
|---|---|---|
| Statements follow the **order of information** in the passage | [OFFICIAL] | Bracket every search between the previous and next answers. This is the whole time-management strategy for the type. |
| Statements **paraphrase**; they are not the passage's wording | [OFFICIAL] | Keyword matching is a trap generator, not a method. |
| Statements do include some words and **names that also appear** in the passage | [OFFICIAL] | Proper nouns, numbers and un-paraphrasable technical words are the reliable anchors to scan for. |
| **NOT GIVEN statements still refer to a specific section** of text | [OFFICIAL — this is the most under-taught fact of the whole module] | You cannot conclude NOT GIVEN by failing to find anything. You must find the relevant section and confirm the passage is silent *there*. |
| Use **only** the passage; never outside knowledge | [OFFICIAL] | See `trap.outside_knowledge`. |
| **Never leave a box empty** | [OFFICIAL] | No negative marking; a guess is free. With three options a blind guess is ~33%. |
| Checking FALSE vs NOT GIVEN carefully is "especially important" | [OFFICIAL] | This is where the marks go. §7.3. |

### 7.3 The FALSE / NOT GIVEN boundary — stated precisely

This is *the* distinction. Stated as a decision procedure:

1. **Locate** the section the statement is about. (If you cannot locate it after a bounded search,
   you are probably in the wrong place, not looking at a NOT GIVEN.)
2. Ask: **does the passage make a claim about the same proposition?**
   - **No claim at all about that proposition** → **NOT GIVEN**. The passage is silent. It doesn't
     matter how obviously true or false the statement seems.
   - **A claim exists** → compare.
     - The claim and the statement **can both be true at once** → **TRUE**.
     - The claim and the statement **cannot both be true** → **FALSE**.

The test for FALSE is *logical incompatibility*, not difference of wording, not absence of
confirmation. If you can imagine a world where both the passage sentence and the statement are true,
the answer is not FALSE.

Two diagnostic reformulations worth putting in the UI:

- **"Would the writer object?"** If the writer would read the statement and say *"no, that's wrong"*
  → FALSE. If they would say *"I never said that"* → NOT GIVEN.
- **"Point at the contradiction."** If you cannot underline the specific words in the passage that
  make the statement impossible, you do not have a FALSE.

Cambridge's own teaching materials operationalise this as a **two-stage** procedure — first decide
*given* or *not given*, and only then, for the given ones, decide true or false. That staging is
worth building into our drill mode as a scaffold: a "GIVEN / NOT GIVEN" first pass, then a
"TRUE / FALSE" second pass on the survivors. It converts a three-way decision into two binary ones
and measurably reduces the FALSE/NG confusion. **[OURS] Build this as the TFNG drill's training
wheels mode.**

### 7.4 THE TRAP TAXONOMY

Each trap has a **stable slug**. Every TFNG/YNNG question we author must cite at least one, and the
review screen and the "why was I wrong" LLM prompt must use the same vocabulary so a learner's error
history is aggregatable. Slugs are stable identifiers — **never rename one after content ships**.

The plan doc's existing why-wrong prompt names six trap labels. Those are preserved below as the
`legacy` column so the shipped prompt keeps working; the taxonomy is a superset.

#### 7.4.1 The two boundary errors (the bulk of all losses)

| Slug | Name | What happens | Legacy label |
|---|---|---|---|
| `absence_read_as_contradiction` | **Phantom contradiction** | The answer is NOT GIVEN; the learner writes FALSE. The passage simply doesn't address the proposition, but its silence *feels* like denial — especially when the statement sounds unlikely. **The most common single error in the Reading paper.** | absence read as contradiction |
| `contradiction_read_as_absence` | **Missed contradiction** | The answer is FALSE; the learner writes NOT GIVEN. The contradiction is there but is carried by one word, or by a different sentence than the one the learner read, or by a negation they skimmed past. Usually a *searching* failure, not a reasoning failure. | contradiction read as absence |

Teaching line for the pair: *FALSE is a positive finding — you must be able to point at it. NOT GIVEN
is what remains after you have looked in the right place and found no claim.*

#### 7.4.2 Traps that manufacture a false FALSE (the statement looks contradicted but isn't)

| Slug | Name | Mechanism | Worked shape |
|---|---|---|---|
| `quantifier_swap` | **Quantifier swap** | The statement changes *some → all*, *many → most*, *often → always*, *few → none*. If the passage says "some" and the statement says "all", that **is** a contradiction → FALSE. If the passage says "all" and the statement says "some", it is **not** → TRUE. The direction decides. | Passage: "many species migrate." Statement: "All species migrate." → FALSE. Reverse it → TRUE. |
| `scope_shift` | **Scope shift** | The statement widens or narrows the class, region, or period the claim covers. Passage claims something of *Kenyan* growers; statement claims it of *African* growers → NOT GIVEN, not FALSE. | Right claim, wrong population. |
| `comparative_invention` | **Invented comparison** | The passage gives facts about A and about B separately; the statement ranks them. Unless the passage itself compares them, this is **NOT GIVEN**, however easy the arithmetic looks. | Passage: ultrasonic sensors work by sound; laser sensors by light. Statement: "Ultrasonic sensors are more reliable." → NOT GIVEN. |
| `unstated_causation` | **Unstated causation** | Passage reports X and then Y, or X alongside Y; the statement says X *caused* Y, or Y happened *because of* X. Sequence and correlation are not causation. Usually **NOT GIVEN**. | |
| `plausible_inference` | **Reasonable inference** | The statement follows *plausibly* but is not stated. IELTS does not reward inference in TFNG. If a step of reasoning is needed, it is NOT GIVEN. | |
| `outside_knowledge` | **Outside knowledge** | The learner answers from what they know about the world, the topic, or the researcher. Official guidance is explicit: use only the passage. | Especially dangerous on familiar topics. |
| `silent_gap` | **Silent gap** | The passage discusses the entity at length but never touches the specific attribute the statement asserts. Pure NOT GIVEN. | Passage covers a machine's history; statement claims its cost. |
| `entity_swap` | **Entity swap** | The fact is right; the actor, place, date, or institution is not. If the passage attributes it to someone else → FALSE. If it never says who → NOT GIVEN. | |

#### 7.4.3 Traps that manufacture a false TRUE

| Slug | Name | Mechanism |
|---|---|---|
| `keyword_lure` | **Keyword lure** | Statement and passage share vocabulary; the propositions differ. Word overlap is the trap's whole engine. *(legacy: keyword match without meaning match)* |
| `partial_match` | **Half true** | Half the statement is supported, half is not. A statement is TRUE only if **all** of it is supported. A statement with an unsupported second clause is NOT GIVEN (if the clause is unaddressed) or FALSE (if it's contradicted). This is the most under-taught trap after the FALSE/NG boundary. |
| `modality_shift` | **Modality shift** | Passage: *may*, *could*, *is thought to*, *suggests*. Statement: *does*, *will*, *proves*. Possibility asserted as certainty → FALSE if the passage explicitly hedges, NOT GIVEN if it never commits. |
| `absolute_language` | **Absolutes** | *only*, *never*, *always*, *the first*, *the most*, *all*. An absolute in the statement requires the passage to license the absolute, not merely the underlying fact. |
| `time_shift` | **Time shift** | Past vs present, *still* vs *no longer*, *used to* vs *does*. Passage says a practice was abandoned; statement says it happens → FALSE. Passage says it happened once; statement implies it continues → often NOT GIVEN. |
| `negation_flip` | **Negation flip** | The statement carries a negative (or a negative prefix: *un-*, *in-*, *dis-*), or the passage does. Under time pressure candidates invert. Double negatives in either place are pure item-writer cruelty and we should use them sparingly. |
| `paraphrase_missed` | **Paraphrase missed** | The passage *does* state it, fully, in different words; the learner didn't recognise the paraphrase and answered NOT GIVEN. The mirror image of `keyword_lure` and the reason reading is fundamentally a paraphrase skill. |

#### 7.4.4 Traps specific to YES/NO/NOT GIVEN

| Slug | Name | Mechanism |
|---|---|---|
| `attribution_shift` | **Whose view?** | The passage reports someone *else's* view ("Critics argue…", "It is often claimed…"). The statement attributes it to the writer. Unless the writer endorses it, → NOT GIVEN. Signalled by reporting verbs and by concessive framing. |
| `fact_vs_opinion` | **Fact treated as view** | The learner answers YNNG as if it were TFNG — checking whether the *information* is present rather than whether the *writer's stance* is expressed. The passage can state a fact clearly and still be NOT GIVEN on what the writer thinks about it. *(legacy: opinion vs fact)* |
| `concession_misread` | **Concession misread** | "Although the technique is expensive, it is remarkably effective." The writer's view is the main clause, not the concession. Learners take the concession as the stance and answer NO. |
| `stance_strength` | **Stance strength** | The writer is mildly favourable; the statement says they are enthusiastic, or convinced, or opposed. Strength of stance is part of the proposition. |

#### 7.4.5 Using the taxonomy

- Every TFNG/YNNG question we author carries `traps: ["quantifier_swap"]` (one or two slugs, never a
  list of five).
- **[OURS]** Add a group-level `answer_mix` assertion to the validator: a group of 6 TFNG items
  should key roughly **2 TRUE / 2 FALSE / 2 NOT GIVEN**, and must never be all-one-answer. Real
  papers are balanced-ish; an unbalanced group teaches guessing strategies rather than reading.
- **[OURS]** Add a `trap_coverage` lint across the pack: every trap slug in §7.4 must be exercised by
  at least three questions somewhere in the bank, or the drill mode cannot teach it.
- The review screen groups a learner's wrong answers by slug and produces the diagnosis:
  *"5 of your 7 TFNG errors were phantom contradictions — you are answering FALSE when the passage is
  simply silent."* That sentence is the product.

### 7.5 Authoring TFNG/YNNG items that are actually fair

This is where hand-authored content beats generated content, and where generated content most often
fails. Rules:

1. A **TRUE** item must be a genuine paraphrase — no content word shared with the source sentence
   where a natural synonym exists. If the item is a near-copy of the passage, it tests nothing.
2. A **FALSE** item must be **logically incompatible**, and you must be able to name the single word
   or phrase that makes it so. Write that word into `explanation`.
3. A **NOT GIVEN** item must be **about the same topic and locatable in the same section** — it must
   have a place to be looked for. A NOT GIVEN item on a topic the passage never raises at all is not
   a NOT GIVEN item, it is noise, and it teaches learners to answer NG whenever they feel lost.
4. NOT GIVEN items should be **individually plausible**. The best ones are things the passage almost
   says. The plan's generation prompt already asks Stage 1 to plant "one plausible-but-unstated idea
   a careless reader might assume" per passage — that is the right instinct and should be **one per
   NOT GIVEN item**, planted at authoring time.
5. Never make the answer turn on a word a band-6 reader wouldn't know. The trap must be in the
   *logic*, not the vocabulary.
6. YNNG items require a passage with a **visible authorial stance** — evaluative adjectives, hedges,
   first-person, "surprisingly", "unfortunately", "it is hard to see how". If our passage is neutral
   reportage, YNNG items on it are unfair by construction. **Passage design decides question type.**

---

## 8. Academic vs General Training — what actually differs

### 8.1 The question types are the same [OFFICIAL]

Both ielts.org format pages list the **same eleven task-type families**, and the official GT sample
task pack contains: flow-chart completion, identifying information (TFNG), matching information,
matching features, matching headings, note completion, sentence completion, short-answer questions,
summary completion (productive), and TFNG again. So there is **no question type that is exclusive to
either paper**. Any claim that GT "doesn't use matching headings" is false — the official GT sample
pack contains a matching-headings task.

### 8.2 What differs is the text, and therefore the type *mix* [OFFICIAL for texts, CONSENSUS for mix]

| | Academic | General Training |
|---|---|---|
| Text register | Journal/textbook/serious magazine, non-specialist audience, argued | S1–S2: functional and transactional. S3: magazine/newspaper feature |
| Text length | 3 passages, ~700–950 words each | S1: several short texts (~80–250 words each). S2: two texts. S3: one long text ~700–950 |
| Author stance | Frequently present → YNNG is at home | S1–S2 have essentially **no** authorial stance → YNNG is rare/absent there; it can appear in S3 |
| Dominant types | Matching headings, TFNG/YNNG, summary completion, MCQ, matching information/features | S1: matching information across texts, TFNG, note completion, short answer. S2: TFNG, matching, sentence/note completion. S3: the full Academic-style spread |
| Diagram labelling | Occasional | Rare |
| Question load | ~13 / 13 / 14 | ~14 / 13 / 13 |

**The consequences for our authoring are concrete:**

- **GT Section 1 needs the multi-text machinery.** The official GT matching-information sample is
  *"Look at the five advertisements, A–E. Which advertisement mentions the following?"* — the
  "paragraphs" are five separate short texts, each with its own heading. Our `texts[]` array already
  supports several texts per passage row, and the answer keys are then **text letters, not paragraph
  letters**. The validator and the player must both handle "letter identifies a text" as well as
  "letter identifies a paragraph". **This is the biggest GT-specific engineering item.**
- **Short answer and note completion carry GT Sections 1–2.** They fit notices, recalls, timetables,
  membership rules, and staff handbooks naturally. Our bank has 6 short-answer questions total and
  zero note completion — that is the gap.
- **YNNG should be near-absent from GT Sections 1–2** by design, and can appear in Section 3.
  Authoring YNNG on a bus timetable is not a hard exam-realism error, it is an impossible item.
- **The GT band table is harsher at the top** (plan §4.3: 40/40 for band 9, vs 39–40 Academic;
  30–31 for 6.0 vs 23–26 Academic). The learner-facing consequence is real and should be stated in
  the results screen: *the same raw score is a lower band on GT.*

### 8.3 GT text types worth authoring against [OFFICIAL list, our expansion]

- **Section 1:** notices, advertisements (courses, accommodation, services), timetables, leaflets,
  membership terms, product recalls and safety notices, community newsletters, event information
  packs, classified ads, library/leisure-centre information.
- **Section 2:** job descriptions and person specifications, contracts of employment, staff
  handbooks, training-course descriptions, workplace policies (leave, expenses, health and safety),
  induction material, pay and benefits documents, apprenticeship information.
- **Section 3:** general-interest feature writing — the same register as a good newspaper long-read.

---

## 9. Distribution — what a paper is made of

There is **no published official frequency data**, and I could not find any credible statistical
analysis of question-type frequency across Cambridge test books. Everything below is
**[CONSENSUS] / [OURS]** and should be treated as a design target, not an exam fact. See §11.3.

### 9.1 Observed structure of a real Academic paper [CONSENSUS]

- **3–4 question groups per passage**, 13–14 questions per passage.
- Groups are **contiguous in numbering** and run in passage order as a sequence of groups, even
  when a group's own answers are scattered.
- **Roughly 6–8 distinct types per paper.** No paper uses all fourteen.
- One TFNG **or** YNNG group is essentially guaranteed; many papers have one of each.
- Matching headings appears in most papers, usually once, usually as the first group of its passage.
- At least one completion-family group per passage is near-universal.
- Passage 3 skews towards MCQ, YNNG, matching features and summary — the "argument" types.
- Passage 1 skews towards TFNG, sentence completion, note/table completion — the "fact" types.

### 9.2 [OURS] Blueprint for a BandReady Academic test

A target mix for a 40-question Academic test, chosen to cover the type space fairly while staying
exam-plausible:

| Passage | Groups | Questions |
|---|---|---|
| 1 (easier, descriptive/factual) | matching headings (6) · TFNG (5) · note or table completion (3) | 14 |
| 2 (mid, comparative/process) | matching information (5) · sentence completion (4) · flow-chart or diagram labelling (4) | 13 |
| 3 (harder, argued) | YNNG (6) · matching features (4) · MCQ incl. one multi-answer (3) | 13 |

Rotate the completion sub-type and the matching sub-type across tests so that, over 4–6 tests, all
fourteen types are covered and each type accumulates enough items to fill a 20-question drill.

### 9.3 [OURS] Blueprint for a BandReady GT test

| Section | Texts | Groups | Questions |
|---|---|---|---|
| 1 | 3–5 short texts (80–200 words each) | matching information across texts (6) · TFNG (4) · short answer (4) | 14 |
| 2 | 2 workplace texts (~250–350 words each) | note completion (5) · TFNG (4) · matching features or sentence completion (4) | 13 |
| 3 | 1 long text (~750–900 words) | matching headings (6) · summary completion (4) · MCQ or YNNG (3) | 13 |

### 9.4 Drill-mode consequence

The drill mode pulls N questions of one type across the whole bank. For a 20-question drill to be
possible for every type, we need **≥20 questions of each of the fourteen types** in the bank — 280
questions minimum, i.e. **seven full tests**, before drills are meaningful for the rarer types. Our
current bank (measured: 80 questions, 11 types, max 14 of any one type) cannot fill a 20-question
drill for **any** type. That is the concrete content target this whole workstream exists to hit.

---

## 10. Cross-type trap slugs (non-TFNG)

The §7.4 taxonomy is TFNG/YNNG-specific. These slugs cover the other types, so that every wrong
answer anywhere in the module can be labelled.

| Slug | Applies to | Meaning |
|---|---|---|
| `heading_detail_lure` | matching headings | Heading matches a detail inside the paragraph, not its controlling idea |
| `heading_shared_keyword` | matching headings | Chosen on a shared noun with no shared claim |
| `heading_adjacent` | matching headings | Correct heading, wrong paragraph — it fits the neighbour |
| `heading_cascade` | matching headings | Error propagated from a previous wrong assignment (no-reuse) |
| `mc_true_but_irrelevant` | MCQ, sentence endings | Option is true of the passage but does not answer this stem |
| `mc_true_elsewhere` | MCQ, matching | Option is true of a different part of the passage |
| `mc_overstated` | MCQ | Option strengthens a hedged claim |
| `mc_wrong_count` | MCQ multi | Selected the wrong number of options |
| `decoy_zone` | matching information | Two paragraphs mention the keyword; picked the one with the wrong information *type* |
| `attribution_nearest_name` | matching features | Took the claim nearest the name without checking who it belongs to |
| `bank_synonym_decoy` | summary w/ bank | Chose the bank word that echoes passage vocabulary over the one that fits the gap's meaning |
| `bank_wordclass` | summary w/ bank | Chose a word of the wrong part of speech for the gap |
| `wrote_word_not_letter` | any letter-answer type | Wrote the option's text instead of its letter |
| `over_limit` | any completion | Answer exceeds the stated word limit |
| `form_mismatch` | any completion | Right word, wrong form — singular/plural, verb tense, derived form |
| `not_verbatim` | any completion | Paraphrased instead of copying from the passage |
| `spelling` | any completion | Correct word, mis-copied |
| `grammar_mismatch` | any completion | Answer doesn't fit the gap's grammatical frame |
| `wrong_row_column` | table completion | Read the wrong intersection |
| `diagram_from_picture` | diagram labelling | Answered from world knowledge of the object, not from the text |
| `order_ignored` | sequential types | Searched the whole passage for a question whose answer was bracketed |
| `blank` | any | Left it empty — a pure time or confidence failure, never a comprehension one |

---

## 11. Where sources disagree, and what we do about it

### 11.1 [CONTESTED] Do summary/note/table/flow-chart answers run in passage order?

- **Official (IDP IELTS, ielts.org type descriptions):** "The answers will not necessarily occur in
  the same order as in the text." Repeated across the summary/note/table/flow-chart family and for
  diagram labelling.
- **Coaching consensus (multiple large sites):** "the answers are usually in the same order in the
  text as the order of the missing words… once you find the first answer, the rest will follow."
- **Reconciliation:** both are right about different things. The *official* statement is a guarantee
  the test owner declines to make. The *practical* observation is that item writers usually build
  the summary by walking through the section. **A learner who assumes order will usually be right and
  occasionally lose a mark; a learner who assumes no order will always be slower.**
- **[OURS] What we teach:** *"Expect them roughly in order, but treat that as a hint, not a rule —
  and always locate the section first, because the officially-guaranteed fact is that the answers
  come from one section, not the whole text."* That sentence is honest and useful.
- **[OURS] What we author:** set `answer_order: "section_local"` on these groups and, within a
  group, key answers in passage order **unless** we deliberately author one out-of-order item per
  test to train the habit of checking.

### 11.2 [CONTESTED] "14 question types" vs "11 question types"

ielts.org and IDP both enumerate **11** families, collapsing summary/note/table/flow-chart into one.
Coaching sites variously say 11, 13 or 14 by splitting that family and by splitting MCQ into
single/multi. Our plan doc uses **14**, which is the right engineering decision (they need different
layouts, different scorer paths and different strategy cards) but the wrong *learner-facing* number.
**[OURS]** In the UI, present the official **11 families** and show the sub-variants inside them.
Keep 14 as the internal `type` enum.

### 11.3 [CONTESTED / UNKNOWN] Per-type frequency

No official data. No credible published analysis found. Everything in §9 is a design target derived
from the official sample-task pack and from consensus teaching material. **Do not put frequency
claims in learner-facing copy** ("matching headings appears in 80% of tests" is unsupportable).
Safe learner-facing phrasing: *"appears in most papers"*, *"less common"*, *"nearly always present"*.

### 11.4 [CONTESTED] Time allocation per passage

15/20/25 vs 17/20/23 vs 20/20/20 — no official recommendation exists. **[OURS]** Default to
**17/20/23** for Academic (it matches the difficulty gradient without the panic of a 15-minute first
passage) and **14/18/28** for GT; make it configurable; never present it as an exam rule.

### 11.5 [CONTESTED] Whether TFNG statements are *always* in passage order

Cambridge's student-facing material states it as a rule of the task, and it is presented that way in
official teaching notes. A minority of coaching sources hedge. **[OURS] We author it as always true**
— our items will be in order, and we teach it as reliable, because it is the type's main strategic
lever and the official teaching material asserts it.

### 11.6 Item we should not repeat from the plan doc

The plan's §4.1 normalization sketch mentions accepting a singular where a plural is keyed. Real
marking does not do this (§2.3). Whatever `answers.py` currently implements is the source of truth
for behaviour, but our **authored keys should never rely on that leniency**, and the **review screen
should always display the passage's exact form as the answer**.

---

## 12. What this means for the build — concrete asks

Collected so all the [OURS] items are in one place. None of these are decided; they are proposals
this research supports.

**Content (the main job):**
1. Author the four missing types: `note_completion`, `flow_chart_completion`, `diagram_labelling`,
   `matching_sentence_endings`.
2. Author a **General Training** bank from zero: at minimum 2 full GT tests (6 "passages" = ~14 short
   texts + 4 workplace texts + 2 long texts), built to §9.3's blueprint.
3. Reach ≥20 questions per type so drills work at every size (§9.4).
4. Every question gets: `anchor_paragraphs`, verbatim `evidence_quote`, `paraphrase_bridge`,
   `explanation`, `traps[]`, and — for every letter-answer and MCQ type — **`distractors[]` with one
   line per wrong option**.

**Schema (small, additive, non-breaking):**
5. Group-level `answer_order: sequential | scattered | section_local` and `section_scope[]` (§3).
6. Question-level `traps: [slug]` drawn from §§7.4/10, and `paraphrase_bridge: {question_words,
   passage_words}` — the pair of phrases that carry the paraphrase. This is the single most valuable
   new field for teaching reading and nothing in the current schema captures it.
7. `distractors: [{key, why_wrong, trap}]` on letter-answer groups.
8. `grammar_cue` on completion questions (§2.3).
9. Flow-chart layout must support branching, not just a flat step list (§6.5).
10. GT: letters that identify **texts**, not paragraphs, in matching-information groups (§8.2).

**Validator (all statically checkable, all cheap):**
11. Completion answers must be case-insensitive substrings of the passage (§2.2).
12. Sequential groups must have non-decreasing anchor positions across question numbers (§3).
13. TFNG/YNNG group answer balance and no all-one-answer groups (§7.4.5).
14. Every authored answer must satisfy its own group's `word_limit` (already in the plan — keep).
15. Trap-coverage lint across the pack (§7.4.5).

**UI / teaching:**
16. Per-type **strategy card** in the drill and review panes, built from §§4–7 — order behaviour,
    attack plan, the two ways this type eats marks.
17. TFNG **two-stage scaffold** drill mode: GIVEN/NOT-GIVEN pass, then TRUE/FALSE pass (§7.3).
18. Error report grouped by **trap slug**, producing a named diagnosis rather than a percentage.
19. Time-vs-accuracy split in results: blanks and >2-minute questions diagnosed as a *pacing*
    problem, not a comprehension one (§1.4).
20. Surface the "7 marks between band 6 and band 7" fact (§1.5).

---

## 13. Sources

Official IELTS-partner material (primary; used for every [OFFICIAL] tag):

- [IELTS Academic: Reading test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading)
- [IELTS General Training format: Reading — ielts.org](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading)
- [IELTS Academic Reading Sample Tasks (2023) — ielts.org, 46pp](https://ielts.org/cdn/Sample-tests/ielts-academic-reading-sample-tasks-2023.pdf) — verbatim instruction lines and official answer keys for matching features, table completion, flow-chart completion (both variants), TFNG, matching headings, matching sentence endings, MCQ single and multi, note completion, sentence completion, summary completion (both variants), diagram label completion.
- [IELTS General Training Reading Sample Tasks (2023) — ielts.org, 33pp](https://ielts.org/cdn/Sample-tests/ielts-general-reading-sample-tasks-2023.pdf) — GT instruction lines including the multi-text matching-information pattern and short-answer questions.
- [IELTS Academic sample test questions — ielts.org](https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test)
- [IELTS General Training sample test questions — ielts.org](https://ielts.org/take-a-test/preparation-resources/sample-test-questions/general-training-test)
- [Academic test format in detail — ielts.org](https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-academic-test/academic-test-format-in-detail) — transfer-time statement.
- [IELTS Academic Reading question types — IDP IELTS](https://ielts.idp.com/prepare/article-question-types-academic-reading) — the canonical per-type "order" statements quoted in §3.
- [IELTS General Training Reading question types — IDP IELTS](https://ielts.idp.com/canada/prepare/article-question-types-general-training-reading)
- [IELTS Academic Reading Task Type 4 (Matching Information) — Cambridge English / UCLES](https://www.cambridgeenglish.org/images/ielts-academic-reading-task-type-4-matching-information-activity.pdf) — the matching-information vs matching-headings contrast, letter reuse.
- [IELTS Academic Reading Task Type 6 (Matching Features) — Cambridge English / UCLES](https://www.cambridgeenglish.org/images/ielts-academic-reading-task-type-6-matching-features-activity.pdf) — "in this task type, unlike others, the statements are not in order"; findings-vs-opinions distinction.
- [IELTS Academic Reading Task Type 5 (Matching Headings) — Cambridge English / UCLES](https://www.cambridgeenglish.org/images/ielts-academic-reading-task-type-5-matching-headings-activity.pdf)
- [IELTS General Training Reading Task Type 5 (Matching Headings) — Cambridge English / UCLES](https://www.cambridgeenglish.org/images/ielts-general-training-reading-task-type-5-matching-headings.pdf)
- [IELTS Academic Reading — Task Type 1 Identifying Information, Student's Book extract (eltexampreparation.com)](https://www.eltexampreparation.com/sites/default/files/Academic%20Reading%20task_0.pdf) — the "About the task" rules and the 13 tips/tactics; source of the passage-order rule and "never leave a box empty".
- [IELTS Academic Reading — Task Type 1 Identifying Information, Teacher's Notes (eltexampreparation.com)](https://www.eltexampreparation.com/sites/default/files/Academic%20Reading%20task_Teacher's%20notes.pdf) — the two-stage GIVEN/NOT-GIVEN → TRUE/FALSE procedure and worked NOT GIVEN rationales.
- [Dealing with True/False/Not Given questions — British Council (takeielts)](https://takeielts.britishcouncil.org/sites/default/files/dealing_with_true_false_not_given_questions.pdf) *(referenced in search results; direct retrieval blocked by the host during this research — content corroborated by the two Cambridge PDFs above, so no claim here rests on it alone)*
- [Dealing with completion questions — British Council (takeielts)](https://takeielts.britishcouncil.org/sites/default/files/dealing_with_completion_questions.pdf) *(same caveat)*
- [Matching Headings — British Council (takeielts)](https://takeielts.britishcouncil.org/sites/default/files/reading_matching_headings_.pdf) *(same caveat)*
- [IELTS Guide for Teachers — British Council (takeielts)](https://takeielts.britishcouncil.org/sites/default/files/ielts_guide_for_teachers.pdf) *(same caveat)*

Secondary / teaching sources (used only for [CONSENSUS] tags, and only where several agreed):

- [IELTS Reading Question Types — IELTS Liz](https://ieltsliz.com/ielts-reading-question-types/) and its per-type pages ([matching headings](https://ieltsliz.com/ielts-reading-matching-headings/), [matching paragraph information](https://ieltsliz.com/ielts-reading-matching-paragraph-information-2/), [multiple choice](https://ieltsliz.com/ielts-reading-multiple-choice/), [sentence completion](https://ieltsliz.com/sentence-completion-questions-in-ielts-reading/), [capital letters](https://ieltsliz.com/capital-letters-in-ielts-will-it-affect-your-score/), [transferring answers](https://ieltsliz.com/transferring-answers-in-ielts-listening-and-reading/))
- [Matching Sentence Endings — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/28/ielts-reading-matching-sentence-endings-tips/) · [TFNG — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/27/ielts-reading-true-false-not-given-tips/) · [Multiple choice — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/30/ielts-reading-multiple-choice-questions/)
- [Which IELTS Reading answers are in order — All Ears English](https://www.allearsenglish.com/which-ielts-reading-answers-are-in-order/) and [which are NOT in order](https://www.allearsenglish.com/ielts-energy-1379-part-2-which-ielts-reading-answers-are-not-in-order/)
- [Summary completion — IELTS Jacky](https://www.ieltsjacky.com/ielts-reading-summary-completion.html) *(order claim; see §11.1)*
- [Matching Sentence Endings — IDP IELTS Vietnam](https://ielts.idp.com/vietnam/about/news-and-articles/article-ielts-reading-matching-sentence-endings/en-gb)
- [Matching headings strategies — IDP IELTS](https://ielts.idp.com/prepare/article-ielts-reading-matching-headings)
- Time-allocation consensus drawn from several independent coaching sources; no official figure exists (§11.4).

Repo facts (measured during this research, 2026-07-27):

- `content/core-en/data/reading_passages.jsonl` — 6 passages, all `format: "academic"`, 806–864 words,
  80 questions total, type counts: matching_headings 14, yes_no_not_given 10, true_false_not_given 9,
  matching_information 8, matching_features 7, sentence_completion 6, short_answer 6,
  multiple_choice 6, summary_completion_bank 6, summary_completion 4, table_completion 4.
  **Zero General Training rows. Zero note/flow-chart/diagram/sentence-endings questions.**
- `sidecar/bandready/content/validate.py` — `ReadingPassageRow{id, format, title, topic_id,
  word_count, band_target, passage_json}`, `ReadingTestRow{id, format, title, p1_id, p2_id, p3_id}`,
  plus `passage_document()` and `iter_reading_questions()` helpers.
- `sidecar/bandready/scoring/answers.py` — 696 lines, shared with Listening. Read before keying any
  accepted-answer variants; do not duplicate it.

---

*BandReady is not affiliated with, endorsed by, or connected to IELTS, IDP, the British Council, or
Cambridge Assessment English. 'IELTS' is a registered trademark of its owners. All BandReady passages
and questions are original works written for this project; no exam material is reproduced.*
