# TH-R4 — Reference pedagogy: how to write a grammar reference that a learner with zero grammar knowledge can actually use

**Scope.** How learners consult a reference grammar and how to serve both consultation modes; how
long an article may be before it stops being read; how to explain a concept without terminology the
reader does not yet have; when a table beats prose and when it does not; how to use examples so the
pattern is visible; how to present exceptions and false rules; how a reference connects back to
practice. Ends in a concrete **writing standard** the authoring agents work from, a **worked
before/after**, a **first-language interference dossier** for the seven language groups our users
skew towards, and a **navigation recommendation** for the Theory tab.

**Audience.** The design agent writing `staging-theory/DESIGN.md`; the authoring agents writing
theory chapters; the verify agent building the lints.

**Read alongside:** `staging-grammar/research/01-syllabus.md` (what is taught and in what order),
`02-what-moves-a-band.md` (what pays), `03-acquisition-science.md` (how it sticks),
`04-practice-pedagogy.md` (what practice looks like on screen), and
`staging-grammar/DESIGN.md` (the practice authoring contract). This document is deliberately the
mirror of `staging-grammar/research/04-practice-pedagogy.md`: that one governs the walking route,
this one governs the map.

**Standing constraint from the practice module, restated because it is easy to get wrong.**
`staging-grammar/DESIGN.md` §0.5 row 10 says a browse-all-rules section "turns the module into a
book" and was explicitly *not* built there. That decision was correct **for the practice module**.
It is not a veto on this one. The owner has since asked for the map by name. The resolution is a
hard boundary, stated in §1 and enforced by lint: **Theory articles never contain practice items,
and practice points never contain reference paradigms.** Two artefacts, two jobs, one set of links
between them. If the boundary blurs, we ship a book with a quiz in it and neither half works.

---

## 0. The eighteen claims this briefing commits to

Everything below follows from these. If the design agent disagrees with one, say so explicitly in
`DESIGN.md` §"Where this document overrides the research" and say what replaces it. Do not silently
drop one.

1. **Nobody reads a reference the way it was written.** They arrive in the middle, from a link or a
   search, with a question. Every article must therefore work as the *first* page the reader ever
   sees — Mark Baker's "every page is page one" principle, imported wholesale.
2. **There are four consultation modes, not two.** Look-up and read-through are the obvious pair.
   The other two — *orientation* ("what even is there to know?") and *verification* ("I wrote this;
   is it wrong?") — have different needs and are the two the market serves worst.
3. **Users scan before they read, and they scan headings.** NN/g's eyetracking work shows the
   layer-cake pattern — fixations on headings and subheadings with occasional dips into body text —
   is the most *effective* scanning pattern, and it only happens when headings are visually distinct
   and genuinely descriptive. Headings are therefore the primary content, not decoration.
4. **The active-user paradox applies to us.** Carroll & Rosson: users do not read the manual first;
   they start doing the thing and consult only when stuck. A theory section designed on the
   assumption that learners will read chapters 1–12 before practising will be read by nobody. It
   must *also* reward the person who arrives at chapter 34 by search at 11 p.m. because they cannot
   decide between *have been* and *was*.
5. **But a beginner genuinely needs a route.** The owner's user is someone who says "I don't know
   that much." For them, the absence of a linear path is not freedom, it is paralysis. The answer is
   not to pick a side: it is **one linear "Start here" path laid over a non-linear library**, where
   the path is a curated ordering of articles that also stand alone.
6. **Terminology is a barrier, not a shortcut — but hiding it permanently is a worse barrier.** A
   learner who never meets the words *past participle* or *clause* cannot use any other grammar
   resource, cannot read their own feedback, and cannot search. Every term is therefore **taught,
   once, in a fixed global order, with a plain gloss that is repeated at every later use** — not
   avoided, and not assumed.
7. **The explanation must be written below the level of the thing it explains.** A B2 structure
   explained in C1 prose teaches nothing. The prose vocabulary ceiling is a lint, not an aspiration.
8. **Meaning before form, in reference as much as in practice.** The first thing an article says is
   what the structure *does to a sentence*, not how it is built. Form is cheap and every book does
   it well; the choice is what learners get wrong.
9. **The comparison is the highest-value article type we can ship.** "When do I use which" is the
   owner's stated ask and the corpus evidence says selection errors dominate formation errors. A
   reference whose comparison chapters are an afterthought has missed its own point.
10. **Tables are for paradigms and comparisons; prose is for reasons.** A table with sentences in
    its cells is prose wearing a costume, and it is harder to read than the prose was. Sweller's
    split-attention work says the corollary: the example must sit *inside* the thing it illustrates,
    never in a "see the table above".
11. **A pattern becomes visible through controlled variation, not through volume.** Four examples
    that differ in exactly one dimension teach more than twelve that differ in all of them.
12. **An exception stated next to a rule destroys the rule; an exception contained and
    frequency-labelled does not.** Every exception carries an explicit verdict on whether the reader
    should care yet.
13. **False rules must be named and killed, not silently avoided.** "Never start a sentence with
    *because*" is already in the learner's head. Not mentioning it leaves it there. This mirrors the
    practice module's required `teach.false_rule` field and reuses its content.
14. **Where usage genuinely varies, say so and give a default.** British/American, formal/informal,
    prescriptive/descriptive. Hiding variation to keep the rule tidy is the thing that makes learners
    distrust the whole resource the first time they meet a counter-example in the wild.
15. **First-language interference is predictable and should be pre-empted, not diagnosed after the
    fact.** Swan & Smith's *Learner English* is the canonical demonstration that error patterns
    cluster by L1. We can put the warning in the article before the learner makes the mistake.
16. **L1 notes are opt-in and additive, never gating.** A learner who does not set an L1, or who sets
    one we do not cover, must see a complete article. The L1 box is a bonus lane.
17. **Reading must be able to turn into doing in one tap, and doing must be able to turn into
    reading in one tap.** A reference with no route into practice is a book. A practice module with
    no route into reference is a maze.
18. **No gamification of reading.** `docs/plan/10-curriculum-progress.md` §9 forbids loss-aversion
    mechanics and that constraint binds here. Read-state is a quiet tick, not a streak. Reading is
    not an achievement; it is a lookup.

---

## 1. What a theory article is, and what it must never become

The single most likely failure of this push is that the theory articles come out as re-formatted
practice points. They share subject matter and nothing else. State the boundary once, hard.

| Dimension | Practice point (`grammar_points`) | Theory article (`theory_articles`) |
|---|---|---|
| **Unit of thought** | one decision the learner must be able to make | one *question the learner has* |
| **Coverage** | deliberately partial — one slice, sequenced | deliberately complete — the whole paradigm at once |
| **Order** | topological; nothing before its prerequisites | free; any article may be the first one read |
| **Length** | 12–30 minutes of *doing* | 2–6 minutes of *reading* |
| **Assumes** | everything earlier in `sequence_index` | nothing except the term ledger up to its own point |
| **Contains items?** | yes, 10–16, that is the whole point | **never.** Links out to practice; holds no bank |
| **Contains full paradigms?** | no — a form line, not a table of twelve tenses | **yes.** The all-at-once table is its reason to exist |
| **Contains exceptions?** | one at most, contained in `contrast.edge_case` | yes, all the ones that matter, frequency-labelled |
| **Success looks like** | the learner produces the form correctly under pressure | the learner closes the article and knows what to do next |
| **Failure looks like** | green cards and wrong essays | a wall of text that is scrolled past |
| **Progress model** | FSRS card state, stages, mastery | read/unread. Nothing else |
| **Gating** | locked until prerequisites are met | **never locked.** Everything is browsable from install |

**Three rules that follow, and that a lint can check:**

- **T-BOUND-1.** A theory article MUST NOT contain a question the reader is expected to answer in
  place. Rhetorical section headings that are questions are fine and encouraged (§10.7); interactive
  items are not. If the reader can get something wrong, it belongs in practice.
- **T-BOUND-2.** A practice point MUST NOT be the source of truth for a paradigm. If a learner needs
  the whole modal table, the point links to the theory chapter. Duplicated tables drift.
- **T-BOUND-3.** Example sentences MUST NOT be shared between a theory article and its linked
  practice point. Shared sentences turn the item into a memory test of the article.

**Why "never locked" is not negotiable.** The practice path is gated because teaching order matters.
Reading order does not: a beginner who opens "The third conditional" on day one will not understand
it, will close it, and will have lost thirty seconds. A beginner who finds the Theory tab greyed out
concludes the app is withholding, and the owner's stated user — someone who says "I don't know that
much" — is exactly the person who wants to *see the size of the thing* before starting. Show them
the whole map. Recommend a route. Never lock a door.

---

## 2. How learners actually consult a reference

### 2.1 The four modes

The literature that exists is mostly on **dictionary** consultation rather than grammar reference
consultation — Nesi's work on dictionary skills and Tono's eye-tracking of look-up behaviour are the
solid anchors, and the Hong Kong large-scale survey is the biggest behavioural dataset. Grammar
look-up is under-studied, so the honest position is: **borrow the dictionary findings where the task
shape matches, borrow the technical-documentation findings where it does not, and label which is
which.** Both literatures agree on the important thing — consultation is short, goal-driven, and
abandoned quickly when the first screen does not pay.

| Mode | Trigger | What they bring | What they want | Time budget | Fails when |
|---|---|---|---|---|---|
| **A. Look-up** | mid-task; stuck on one choice | a half-formed sentence, often the wrong term for it | the answer in the first screen | 20–90 s | the answer is in paragraph 4 |
| **B. Read-through** | deliberate study session | time, and no specific question | a route, and a sense of progress | 5–20 min | there is no order, or the order is invisible |
| **C. Orientation** | first open of the tab; "what is there?" | anxiety about scope | a map they can see the edges of | 30–120 s | the top level has 70 items |
| **D. Verification** | after writing or after feedback | a sentence they suspect is wrong | a yes/no plus the smallest fix | 15–60 s | the article explains but never adjudicates |

**Mode A is the majority of all sessions** and the one the design must be optimised for, because it
is the one that recurs. Mode B happens a handful of times per learner. Mode C happens once or twice.
Mode D is the highest-leverage — the learner has already noticed a gap, which is the condition under
which instruction lands (this is the same argument the practice module uses for entry route 1).

**Mode C is the one that is almost always botched.** A reference whose front door is a list of 70
chapter titles is answering "where is X" for a reader whose actual question is "how big is this and
where do I start". §13 fixes this with a two-level map that fits on one screen.

### 2.2 What the reading-behaviour evidence says

| Finding | Source | Consequence for us |
|---|---|---|
| Users scan rather than read; concise, scannable, objective writing measured 47–58% better on usability than promotional prose | NN/g, *How Users Read on the Web* | The prose budget is small and every word must survive a "does this help someone deciding?" test |
| Four scan patterns: F, spotted, layer-cake, commitment. Layer-cake (headings + dips into text) is the most efficient and depends on headings being descriptive and visually distinct | NN/g, *The Layer-Cake Pattern*; *Text Scanning Patterns* | **Headings carry the content.** A reader who reads only our headings must still get the rule |
| Scanning is optimised for the *current task*; readers commit to full reading only when the page has already proved relevant | NN/g, *Scanning Patterns … Optimized for the Current Task* | The relevance proof must be above the fold: title + one-line answer |
| Users do not read manuals; they start the task and consult only on failure, even though reading first would be faster | Carroll & Rosson, *Paradox of the Active User* | Do not design a curriculum-shaped reference. Design a consultable one with a curriculum laid over it |
| Topics should be self-contained and function alone; no "previous/next" dependency | Baker, *Every Page is Page One* | Each article restates the two or three terms it needs rather than assuming the reader read chapter 3 |
| Look-up is abandoned early; learners frequently take the *first* candidate answer they see | dictionary-use literature (Nesi; Hong Kong survey) | The first candidate answer on the screen must be the *most common* case, never the interesting edge case |
| Split attention: two sources that must be mentally integrated raise load and hurt learning; physical integration removes the cost | Sweller / Chandler, split-attention effect | The example goes *under the row it illustrates*. Never "as shown in the table above" |

### 2.3 Four worked consultation traces

These are the acceptance tests for the navigation design in §13. If the IA cannot serve all four,
it is wrong.

**Trace A — look-up, mid-writing.**
> Learner is writing a Task 2 body paragraph. Types *"The government have introduce a new rule"* and
> feels something is off. Opens Theory. Does not know the words *subject-verb agreement* or *past
> participle*. Types **"have introduce"** in search.
>
> Required: search must match on **example-sentence text and on malformed strings**, not only on
> chapter titles. Result 1: *"have / has + past participle — the three-form verb table"* with the
> one-line answer visible in the result row: *After* have *or* has*, use the third form:*
> introduced*.* Tap → lands on the form table with `introduce / introduced / introduced` highlighted.
> **Total: 2 taps, 15 seconds, no grammar vocabulary required.**

**Trace B — read-through, beginner, day one.**
> Learner has never studied grammar. Opens Theory. Sees a one-screen map: 11 parts, each with a
> plain title and a chapter count. A single primary button: **Start here — 12 chapters, about 40
> minutes.** Taps it. Gets a numbered path with progress, each chapter 400–700 words, each ending in
> *Next: …* and a *Practise this* link.
>
> Required: the "Start here" path is authored as an ordered list, not derived from the chapter tree,
> because the pedagogically right first twelve chapters are not the first twelve in any subject
> ordering.

**Trace C — orientation.**
> Learner opens Theory out of curiosity. Wants to know whether this covers "conditions" (their word
> for conditionals) and "WH questions" (their words).
>
> Required: an **intent index** keyed on learner vocabulary — *"if sentences"*, *"question words"*,
> *"was/were sentences"* — mapping to chapters. And an alias table so that search for **"conditions"**
> returns the conditionals part. This is authored data, not a stemmer.

**Trace D — verification, after feedback.**
> Writing module returns an error code `art_missing_definite`. Feedback line has a *Why?* link. Tap
> → lands on the **Articles** chapter, scrolled to the section that adjudicates the exact case, with
> the learner's own sentence echoed at the top and the smallest fix named.
>
> Required: articles carry `fixes_errors[]` using the **same 53-slug closed taxonomy** as the
> practice module (`staging-grammar/DESIGN.md` §2.8). One taxonomy, three consumers. Do not invent a
> second.

### 2.4 Serving look-up and read-through without writing everything twice

The temptation is two products: a "course" and a "reference". Do not. Two artefacts means two
sources of truth and one of them goes stale. Instead, use **one article body with a layered
surface**:

| Layer | Length | Serves | Always visible? |
|---|---|---|---|
| **L0 — Title** | ≤ 9 words, a question or a can-do | all four modes | yes |
| **L1 — The short answer** | ≤ 25 words, in a boxed callout directly under the title | look-up (A), verification (D) | yes |
| **L2 — Descriptive headings** | 4–8 per article, each a full statement or question | scanners in all modes | yes |
| **L3 — Body prose + tables + examples** | the article | read-through (B), and A once L1 was not enough | yes |
| **L4 — Contained extras** | exceptions, myths, L1 notes, register variation | the reader who wants them | **collapsed by default** |
| **L5 — Links** | practise / related / glossary | turning reading into doing | yes, at the end |

**L1 is the highest-value 25 words in the whole push.** It is what appears in search results, what
appears in a link preview from practice, and what a mode-A reader reads instead of the article. Its
authoring rule: *state the most common case as an instruction, with one example, and no hedging.*

> ✅ **Short answer.** Use *have* or *has* + the third form of the verb: *has finished*, *have
> gone*. It links something earlier to now.

> ❌ **Short answer.** The present perfect is a tense which may be used in a variety of contexts to
> express a relationship between a past event and the present moment, subject to certain
> restrictions.

**Progressive disclosure is the mechanism for L4.** Collapsing exceptions is not hiding them: it is
refusing to let them compete with the rule for the reader's first pass. Every collapsed block has a
label that says what is inside and roughly how much it matters — *"Exceptions (3) — you can skip
these until B2"* — so the reader makes an informed choice rather than a blind one.

---

## 3. How much goes in one article

### 3.1 The numbers we commit to

There is no clean empirical answer to "how long is too long" for a grammar article; the honest basis
is the scanning evidence (§2.2), the plain-language convention that comprehension degrades sharply
above ~25-word average sentences, and the operational fact that our reader is reading in a second
language, which roughly doubles the cost of every word. So we set the budgets deliberately low and
treat them as lints.

| Article type | Body words | Headings | Tables | Examples | Reading time (L2 reader, ~120 wpm) |
|---|---|---|---|---|---|
| **Foundation** (`kind: foundation`) — the first 12, no assumed terms | 350–650 | 3–5 | 0–1 | 6–10 | 3–5 min |
| **Standard** (`kind: standard`) — one structure, fully | 600–1,100 | 5–8 | 1–3 | 8–14 | 5–9 min |
| **Comparison** (`kind: comparison`) — X vs Y | 450–850 | 4–6 | 1–2 | 6–12 (in pairs) | 4–7 min |
| **Paradigm** (`kind: paradigm`) — the all-at-once table | ≤ 350 prose | 2–4 | 1 large | 1 per row-group | 2–4 min + browse |
| **Overview** (`kind: overview`) — the part opener | 200–400 | 2–3 | 1 (contents) | 0–3 | 2–3 min |
| **Myth** (`kind: myth`) — a false rule, killed | 200–450 | 3 fixed | 0 | 4–6 | 2–3 min |

**Hard cap: 1,400 body words.** An article above the cap does not get shortened; it gets **split**,
and the split is announced (§3.2). Word counts exclude example sentences, table cells, L1 boxes and
collapsed exception blocks — those are cheap to skip and expensive to cut.

**Density lints (checkable):**

| Lint | Rule |
|---|---|
| T-LEN-1 | Body words within the band for `kind` |
| T-LEN-2 | No more than **120 consecutive body words** without a heading, table, example block or list |
| T-LEN-3 | Every article has ≥ 3 headings and ≤ 8 |
| T-LEN-4 | Paragraph ≤ 60 words and ≤ 4 sentences |
| T-LEN-5 | ≥ 1 example within the first 120 words of the body |
| T-LEN-6 | Collapsed (L4) content ≤ 40% of total article length — if it is more, the article is really two articles |

### 3.2 Split, don't shorten

When an article exceeds the cap, the wrong fix is compression: compressed reference prose is the
densest, least readable text there is, and it is where the passive voice and the nominalisations
creep back in. The right fix is one of three splits:

| Split | Use when | Example |
|---|---|---|
| **By form vs choice** | the article both builds a structure and adjudicates between it and a rival | "The present perfect: how to build it" + "Present perfect or past simple?" |
| **By common vs advanced** | 80% of the value is in the first third | "Relative clauses: which, who, that" + "Relative clauses: the harder cases (whose, prepositions, reduced)" |
| **By paradigm extraction** | the article is mostly a table | "Irregular verbs: the three forms" pulled out as `kind: paradigm`, linked from six places |

**The split must be announced in both halves.** The first ends with *"This chapter covered the
common cases. The harder ones are in [X]."* The second opens with *"This assumes you have read [Y].
Here is the one-line version of it: …"* — the one-line restatement is what makes the second half
still "page one" for someone who arrives by search.

### 3.3 The one-question test

Before writing, the author states the article's question in the learner's own words, in one
sentence, with no grammar terminology. If it needs two sentences or a semicolon, it is two articles.

| Article | Its question | Verdict |
|---|---|---|
| Present perfect | "How do I say something started before now and still matters?" | one question ✓ |
| Present perfect + past simple + past perfect | "How do I talk about the past?" | too broad — that is a *part*, not an article ✗ |
| Modals | "How do I say how sure / how necessary / how allowed something is?" | three questions ✗ → split into three chapters plus one paradigm table |
| Articles (*a/an/the*) | "Which little word goes in front of a noun, if any?" | one question ✓ |
| Conditionals (all types) | "How do I talk about if-situations?" | one *part* — one overview + four chapters + one comparison ✗ as a single article |

### 3.4 The three-screen rule

On a 390 px-wide phone at our body size, roughly 90–110 words fill one screen. An article should
present **a structural landmark at least once per screen** — a heading, a table, a marked example
block, a callout. A reader who scrolls two full screens of unbroken prose has left. This is the
operational form of T-LEN-2 and it is the single most reliable predictor of whether the article gets
read.

---

## 4. Explaining without terminology the reader does not have

This is the hardest requirement in the brief and the one most references fail on page one.

### 4.1 The zero-terminology guarantee, stated precisely

> **A reader who starts at the first chapter of the "Start here" path and reads forward will never
> meet a grammatical term that has not already been introduced, glossed and exemplified.**

Note what it does *not* say. It does not say we avoid terminology — we do not, for the reason in
claim 6: a learner without the words cannot read feedback, cannot search, cannot use any other
resource, and cannot talk to a teacher. It says terminology is **ordered and paid for**.

The guarantee is enforced by a **term ledger**: a single authored file that lists every metalanguage
word we use, in the order it is introduced, with the article that introduces it. An article may use
term *t* only if `ledger_position(t) ≤ ledger_position(article)`. That is a lint, and it is the
theory module's equivalent of the practice module's prerequisite graph.

### 4.2 The term ledger — the proposed order

Rows marked **F** are introduced in the twelve foundation chapters and are therefore available
everywhere. This is a proposal for the design agent to finalise; the *shape* is the load-bearing
part.

| # | Term | Plain gloss (this exact wording is reused at every later first-use-in-article) | Introduced in | Tier |
|---|---|---|---|---|
| 1 | sentence | a group of words that says something complete | Ch 1 | F |
| 2 | verb | the word that says what happens or what is | Ch 1 | F |
| 3 | subject | who or what the sentence is about — it comes before the verb | Ch 1 | F |
| 4 | object | who or what the action lands on — it comes after the verb | Ch 1 | F |
| 5 | noun | a word for a person, a thing, a place or an idea | Ch 2 | F |
| 6 | adjective | a word that describes a noun | Ch 2 | F |
| 7 | adverb | a word that says how, when or where something happens | Ch 2 | F |
| 8 | preposition | a small word that places something in time or space: *in*, *on*, *at*, *for* | Ch 2 | F |
| 9 | singular / plural | one / more than one | Ch 3 | F |
| 10 | article | the little word *a*, *an* or *the* in front of a noun | Ch 3 | F |
| 11 | tense | the form of a verb that shows when | Ch 4 | F |
| 12 | agree (subject–verb) | the verb changes its shape to match the subject | Ch 4 | F |
| 13 | auxiliary (helping) verb | a verb that helps the main verb: *be*, *do*, *have* | Ch 5 | F |
| 14 | base form / second form / third form | *go / went / gone* — the three shapes a verb has | Ch 5 | F |
| 15 | negative | a sentence with *not* in it | Ch 6 | F |
| 16 | question form | the shape a sentence takes when you ask something | Ch 6 | F |
| 17 | phrase | a small group of words that works as one unit | Ch 7 | F |
| 18 | clause | a group of words with its own subject and its own verb | Ch 7 | F |
| 19 | main clause / subordinate clause | the part that can stand alone / the part that cannot | Ch 7 | F |
| 20 | conjunction (joining word) | a word that joins two parts: *and*, *but*, *because*, *although* | Ch 8 | F |
| 21 | countable / uncountable | things you can count one by one / stuff you measure | Ch 9 | F |
| 22 | determiner | the word before a noun that says *which one* or *how many* | Ch 9 | F |
| 23 | continuous (progressive) | the *-ing* form, used for something in the middle of happening | Ch 10 | F |
| 24 | perfect | a form that links an earlier time to a later time | Ch 11 | F |
| 25 | past participle | the third form: *gone*, *eaten*, *written* — same thing as "third form" | Ch 11 | F |
| 26 | modal verb | a verb that adds an attitude: *can*, *must*, *might*, *should* | Ch 12 | F |
| 27 | infinitive | the *to*-form of a verb: *to go* | Ch 14 | — |
| 28 | gerund | the *-ing* form used as a noun: *swimming is cheap* | Ch 14 | — |
| 29 | voice (active / passive) | which one the sentence puts first: the doer, or the thing done to | Ch 21 | — |
| 30 | transitive / intransitive | a verb that takes an object / one that does not | Ch 21 | — |
| 31 | relative clause | an extra piece that tells you *which* noun you mean | Ch 30 | — |
| 32 | defining / non-defining | narrowing down which one / just adding extra information | Ch 31 | — |
| 33 | inversion | putting the helping verb in front of the subject | Ch 34 | — |
| 34 | reported (indirect) speech | saying what someone said, without their exact words | Ch 38 | — |
| 35 | backshift | moving the verb one step further back when you report | Ch 38 | — |
| 36 | conditional | a sentence about an *if*-situation | Ch 41 | — |
| 37 | unreal past | a past form used for something that is not true, not for past time | Ch 42 | — |
| 38 | quantifier | a word for *how much* or *how many*: *some*, *many*, *a few* | Ch 46 | — |
| 39 | comparative / superlative | *bigger* / *biggest* | Ch 48 | — |
| 40 | cohesion | the way sentences hold on to each other | Ch 55 | — |
| 41 | register | how formal or informal the language is | Ch 58 | — |
| 42 | collocation | words that habitually go together: *heavy rain*, not *strong rain* | Ch 59 | — |
| 43 | subjunctive | a bare verb form after certain verbs: *insist that he* **be** *told* | Ch 61 | — |
| 44 | ellipsis | leaving out words the reader can fill in | Ch 62 | — |
| 45 | cleft sentence | a sentence rearranged to put one part in the spotlight | Ch 63 | — |

**Rules on the ledger:**

- **T-TERM-1.** No article uses a ledger term above its own position. Lint.
- **T-TERM-2.** The gloss column is **verbatim reused**. Do not paraphrase a gloss between articles;
  the repeated exact wording is what makes it stick.
- **T-TERM-3.** Every ledger term is a glossary entry, and every occurrence in body text is a
  tappable term chip showing the gloss inline. This is the mechanism that lets an article be "page
  one" for a reader who arrived from search having skipped chapters 1–12.
- **T-TERM-4.** Terms **not** on the ledger may not be used at all. If an author needs one, it goes
  through the ledger, or it gets a plain paraphrase.

### 4.3 The four-move term introduction

Every term is introduced with exactly these four moves, in this order, in one block:

1. **Show it first, unnamed.** Two or three examples where the reader can see the thing.
2. **Name it.** Bold. One sentence. *"The part before the verb is called the **subject**."*
3. **Gloss it.** The ledger gloss, verbatim, in parentheses or a following sentence.
4. **Anchor it.** Point back at the examples with the thing marked, and — where possible — tell the
   reader they already do this in their own language.

Worked:

> Look at these three sentences. The word in bold is the one doing something.
>
> - **The council** closed the bridge.
> - **Rain** delayed the match at Norland.
> - **My sister** works in Ashfield.
>
> That word is called the **subject**. The subject is who or what the sentence is about — it comes
> before the verb.
>
> Every English sentence needs one. This is different from some languages, where you can leave it
> out because the verb already tells you who. In English, you cannot: *Is raining* is wrong;
> ***It** is raining* is right.

Note move 4 doing double duty: it introduces the term *and* pre-empts the pro-drop error that
Spanish, Arabic and Russian speakers all make (§12). That is the pattern to aim for.

### 4.4 Substitution table — technical term → what to write instead

Use the right-hand column in running prose. Use the left-hand column **only** after the term is on
the ledger and has been introduced, and even then keep the gloss nearby.

| Technical term | Write this instead (or alongside) |
|---|---|
| auxiliary verb | helping verb (*be*, *do*, *have*) |
| copula | the linking verb *be* |
| finite verb | a verb with a time on it (*goes*, *went*) |
| non-finite | a verb with no time on it (*to go*, *going*, *gone*) |
| past participle | the third form (*gone*, *eaten*, *written*) |
| present participle | the *-ing* form |
| aspect | how the action is spread out in time |
| perfective / imperfective | (do not use at all — these are not English categories) |
| morphology | the shape of the word |
| inflection | the ending that changes on a word |
| declarative | a normal statement |
| interrogative | a question |
| imperative | an instruction (*Close the door.*) |
| anaphora / cataphora | a word that points back / forward to something |
| antecedent | the noun a pronoun points back to |
| adverbial | a piece that says how, when, where or why |
| complement | the part that finishes off the verb |
| predicate | everything after the subject |
| nominalisation | turning a verb into a noun (*decide* → *decision*) |
| determiner | the word before a noun that says which one or how many |
| quantifier | a word for how much or how many |
| mood | (avoid; name the specific thing instead) |
| modality | how sure, how necessary, or how allowed |
| epistemic / deontic | how sure you are / what the rules say |
| ergative | (never use) |
| valency | how many things a verb needs around it |
| grammaticalisation | (never use) |
| marked / unmarked | the unusual choice / the normal one |
| conditional protasis / apodosis | the *if* part / the result part |
| relativiser | the joining word (*who*, *which*, *that*) |
| restrictive / non-restrictive | narrowing down / just adding |
| dummy subject / expletive | the *it* or *there* that fills the subject slot but means nothing |
| zero article | no word at all in front of the noun |
| clefting | rearranging to spotlight one part |
| discourse marker | a signpost word (*however*, *for example*) |
| hedging | softening a claim (*tends to*, *may*) |

### 4.5 Words that look plain but are not

These are the trap: they read as ordinary English, so authors use them without a gloss, and the
learner silently mis-parses. Every one of these needs the same four-move treatment as a technical
term.

| Word | Why it misleads | What to do |
|---|---|---|
| **subject** | in everyday English it means "topic" — and for Chinese speakers "topic" is a *real, different* grammatical slot | gloss as "who or what the sentence is about — it comes before the verb" and contrast with topic explicitly in the Chinese L1 note |
| **object** | everyday meaning "a thing" | gloss as "who or what the action lands on" |
| **agree** | everyday meaning "say yes" | gloss as "changes shape to match" |
| **tense** | learners use it for *any* verb form, including the passive and modals | say explicitly: *the passive is not a tense; modals are not tenses* |
| **perfect** | reads as "correct" / "complete" | gloss as "links an earlier time to a later time" and say it does **not** mean finished |
| **continuous** | reads as "goes on for a long time" | gloss as "in the middle of happening" and give a short-duration example |
| **conditional** | reads as "conditional on approval" | gloss as "about an *if*-situation" |
| **article** | reads as "a piece of writing" | gloss and repeat the gloss every time for the first ten chapters |
| **voice** | reads as "speaking voice" | gloss as "which one the sentence puts first" |
| **person** (first/second/third) | reads as "a human being" | prefer "*I* / *you* / *he, she, it*" and only name the term where needed for a table header |
| **regular / irregular** | fine, but learners assume irregular = rare | say plainly: the irregular verbs are the *most common* verbs |
| **simple** | reads as "easy" | prefer "plain form" in prose; keep "simple" only in table headers where it is the standard label |

### 4.6 Explaining without the term at all — the four devices

Sometimes the honest move is not to introduce a term but to explain without one. Four devices, in
descending preference:

| Device | How it works | Best for | Example |
|---|---|---|---|
| **The question the reader asks themselves** | recast the rule as a decision procedure | choices between two forms | *"Ask: is the period of time I am talking about finished?"* |
| **The minimal pair** | two sentences differing in one thing, each with its meaning stated | anything where the difference is meaning, not correctness | *I worked at the Marlow depot for six years.* / *I have worked at the Marlow depot for six years.* |
| **The physical metaphor, used once and dropped** | one concrete image | time relationships, distance, containment | the unreal past as "stepping back from the real world" |
| **The slot picture** | show the sentence as boxes to be filled | word order, question formation | `[Wh-] [helping verb] [subject] [main verb] …?` |

**The metaphor rule.** One metaphor per structure, stated once, never extended. Extended metaphors
are how references produce sentences like *"the present perfect throws a bridge from the island of
the past to the shore of the present"*, which is memorable, meaningless and untranslatable. If the
metaphor cannot be cashed out into a decision the reader makes, cut it.

---

## 5. Table, prose, or diagram

### 5.1 The decision rule

> **Use a table when the content is a grid: two or more things compared on two or more fixed
> dimensions, or one thing across a fixed set of slots. Use prose for anything containing the word
> "because". Use a diagram when the relationship is spatial or temporal.**

| Content shape | Format | Why |
|---|---|---|
| one verb across I/you/he/we/they | **table** | fixed slots, one dimension, short cells |
| *will* vs *going to* vs present continuous, on {certainty, evidence, arrangement, register} | **table** | 3 × 4 grid, and the grid *is* the answer |
| the twelve tense forms of one verb | **table** (paradigm article) | this is the "map" the owner asked for, literally |
| irregular verbs | **table**, sorted, searchable | a list is a one-column table and should be a list |
| why the passive is chosen | **prose** | it is a reason, and reasons have connectives |
| how to form a question | **diagram** (slot picture) + short prose | it is about order |
| present perfect and its relation to now | **diagram** (timeline) | it is about time |
| how sure *must / might / could / may* are | **diagram** (cline) | it is a scale |
| active vs passive: who is where | **diagram** (two boxes and an arrow) | it is about roles |
| formality of *get* vs *obtain* vs *acquire* | **diagram** (ladder) | it is a rank order |
| one rule with one exception | **prose** + a contained block | a two-row table is not a table |
| a list of five things that go together | **bulleted list** | not a table |

**Reuse the practice module's `visual.kind` enum** — `timeline`, `two_box`, `axis`, `cline`,
`ladder` (`staging-grammar/DESIGN.md` §2.3.1). Same renderer, same spec shapes, zero new drawing
code. Theory articles will need *more* of them and larger ones, but a new kind should be added only
if none of the five fits; the likely additions are `slot_frame` (the boxes-for-word-order picture)
and `tree_lite` (a two-level bracketing for clause structure — and only if a designer confirms it
reads on a phone).

### 5.2 What tables are good at, and what they lie about

| Tables are good at | Tables are bad at |
|---|---|
| showing that a system is *closed* — "there are exactly these" | anything with a reason attached |
| letting a reader find one cell fast | conveying frequency (every row looks equally likely) |
| exposing gaps ("there is no cell here") | conveying register (every row looks equally usable) |
| supporting comparison across a dimension | nuance (cells have no room to hedge) |
| being re-consulted a hundred times | being read once, linearly |

**The frequency lie is the dangerous one.** A twelve-cell tense table implies twelve equally
available choices. In real English a handful carry almost all the load. Every paradigm table
therefore carries a **weight column or a visual weight marker** — three levels is enough:

| Marker | Meaning | Example cells |
|---|---|---|
| ●●● | you will use this constantly | present simple, past simple, present perfect |
| ●● | you will need this, less often | past continuous, past perfect, future with *will* |
| ● | recognise it; you may never need to produce it | future perfect continuous, past perfect continuous |

This single column is the difference between a table that orients a beginner and a table that
frightens one. It is also honest: it is a claim about how much of the language a form covers, which
is safe to make qualitatively, and it must be stated qualitatively — **never as a percentage**
(`staging-grammar/DESIGN.md` §0.2, banned claim 4).

### 5.3 Table design standards

| # | Standard |
|---|---|
| T-TAB-1 | **Never a one-row or one-column table.** That is a sentence or a list |
| T-TAB-2 | **Cells ≤ 9 words.** If a cell needs a sentence, the content is prose |
| T-TAB-3 | **The caption states the takeaway, not the topic.** ✗ "Table 3: modal verbs" ✓ "*Must* is the strong one; *should* is advice; *might* is a maybe" |
| T-TAB-4 | **Leftmost column is the thing the reader already has** — the meaning they want, the word they typed, the situation they are in. Not the grammatical name |
| T-TAB-5 | **The row-reads-aloud test.** Joining the row header to each cell with its column header must produce a true sentence. If it does not, the table has two ideas in it |
| T-TAB-6 | **Every table is followed immediately by one worked example per row-group**, physically adjacent (split-attention) |
| T-TAB-7 | **Wide tables scroll inside their own container**, never the page. Beyond 4 columns on mobile, provide a stacked-card fallback |
| T-TAB-8 | **No abbreviations in cells** (no *sb/sth*, no *V3*, no *+ing* without the gloss nearby). Learner references are full of these and they are a second language to learn |
| T-TAB-9 | **Empty cells are labelled** — "—" with a footnote saying *this combination is not used*, because an empty cell reads as an authoring mistake |
| T-TAB-10 | **Weight markers on any paradigm table** (§5.2) |
| T-TAB-11 | **Negative and question rows are part of the paradigm, not an afterthought.** Learners get positives right and negatives wrong. If the table shows only affirmatives, it has taught a third of the form |

### 5.4 Paradigm tables: full or reduced?

The owner asked to "include ALL so they can view all structural things". That is a real need — the
map has to show the whole territory — and it collides with the frequency lie. The resolution:

- **Ship the full paradigm, in a dedicated `kind: paradigm` article.** All twelve tense forms, all
  modals, all irregular verbs, the full set of relative pronouns. One place, complete, weighted.
- **Never reproduce the full paradigm inside a teaching chapter.** The present perfect chapter shows
  the present perfect, its negative and its question, and links to the big table.
- **Default the big table to the weighted view**, with a toggle to "show everything". The beginner
  sees six forms; the curious learner taps once and sees twelve. Nothing is hidden, nothing is
  dumped.
- **Give the big table its own entry in navigation** (§13.5, the "Tables" index), because it is the
  single most re-consulted screen we will ship and it should be two taps from anywhere.

### 5.5 When a table must not be used

| Situation | Why not | Do this |
|---|---|---|
| Two forms whose difference is *meaning* | a table implies a checklist; meaning needs a paired sentence | minimal pair with both meanings written out |
| A rule with conditions ("use X unless Y, and even then Z") | conditions nest; tables do not | prose with the decision as a question, plus a slot picture if it is about order |
| Frequency or usage advice | cells cannot hedge | prose with an explicit frequency label |
| Anything with three or fewer data points | overhead exceeds payload | a sentence or a short list |
| Exceptions | a table of exceptions looks like a rule | contained block, frequency-labelled |
| Pronunciation | phonetic symbols in cells are unreadable to our audience | audio + a respelling, in prose |

---

## 6. Examples: making the pattern visible

### 6.1 How many, and of what kind

| Context | Minimum | Ideal | Cap |
|---|---|---|---|
| Per **rule** stated | 3 | 4–6 | 8 |
| Per **paradigm table row-group** | 1 | 1–2 | 3 |
| Per **contrast** (X vs Y) | 1 pair | 3 pairs | 4 pairs |
| Per **exception** | 1 | 2 | 2 |
| Per **error / watch-out** | 1 wrong + 1 right | 1 wrong + 1 right | 1 wrong + 1 right |
| Per **article**, total | 6 | 8–14 | 20 |

**Register coverage.** Of every example set of 4+, at least one must be plainly spoken and at least
one plainly written-formal, and both must be labelled. A reference that only shows written-academic
examples teaches a learner to speak like an essay, which is a real and marked IELTS Speaking
problem; a reference that only shows chatty examples fails them in Task 2.

### 6.2 The minimal pair is the engine

For anything involving a choice — and comparison chapters are the highest-value article type we
ship — the minimal pair is not one device among several. It *is* the explanation. Everything else is
scaffolding around it.

**Anatomy of a well-formed pair:**

```
A   I worked at the Marlow depot for six years.
    → The six years are over. I am not there now.

B   I have worked at the Marlow depot for six years.
    → The six years are still running. I am there now.

Only difference: worked / have worked
```

Four required parts: **the two sentences, the two meanings, and the named difference.** Drop the
meanings and you have a quiz. Drop the named difference and the learner does not know where to look
— they will notice the wrong thing, and what they notice becomes their rule (this is the
`keyword_trap` failure the practice module guards against).

**Lints:**

| # | Rule |
|---|---|
| T-EX-1 | A pair differs in **exactly one** span. Not two. Not "one plus a tiny word" |
| T-EX-2 | Both members are **grammatical**. A pair whose B member is wrong is an error card, not a pair |
| T-EX-3 | Both meanings are written out as full sentences about the world, not about the grammar |
| T-EX-4 | The named difference is an **exact substring** of both sentences (reuse the practice module's `deciding_span` convention so the renderer can highlight it) |
| T-EX-5 | The pair does not depend on a time expression the learner could use as a keyword shortcut, unless a second pair without one immediately follows |

### 6.3 Controlled variation — the example set

The pattern becomes visible when everything except the pattern holds still. An example set of four
should vary **one dimension at a time** and the dimension should be named in a lead-in line.

> **Bad set** (four things vary at once — the reader cannot tell what the rule is about):
> - She has finished.
> - The reports have been sent to the Verdon office by the committee since March.
> - Have you eaten?
> - It has been raining all morning and the pitch is unplayable.

> **Good set** (subject varies; everything else holds):
> - **I** have finished the form.
> - **She** has finished the form.
> - **The committee** has finished the form.
> - **The inspectors** have finished the form.
>
> *Only the subject changed. Watch what happened to* have.

Then a second set varying the next dimension:

> - She has **finished** the form. *(finished — third form of* finish*)*
> - She has **written** the form. *(written — third form of* write*)*
> - She has **sent** the form. *(sent — third form of* send*)*
>
> *Only the verb changed.* Has *stayed the same. The second word is always the third form.*

Two short controlled sets beat one long uncontrolled set, every time.

### 6.4 Marking conventions

One convention, used identically everywhere, declared in the schema so the renderer does the work:

| Mark | Means | Rendered as |
|---|---|---|
| `target` | the structure being taught | bold, plus a subtle underline |
| `deciding` | the span that makes the choice | highlight background |
| `wrong` | a learner error, verbatim | struck through, error-coloured chip, **never plain prose** |
| `fixed` | the corrected version | shown adjacent, at least as prominent as the wrong version |
| `gloss` | the meaning, written out | indented, arrow-prefixed, different type colour |
| `register` | spoken / written-formal / neutral | small label at the end of the line |

**T-EX-6.** A `wrong` string never appears without its `fixed` counterpart on the same screen, and
never appears in the first 120 words of an article. Learners copy what they see first; the first
thing they see must be correct.

### 6.5 What the examples are about

| Rule | Reason |
|---|---|
| Use the house world — Verdon, Norland, Ashfield, Sandmouth, Marlow, Brackenfield | Continuity with the reading and speaking packs, and no real organisations |
| Use IELTS-adjacent topics: study, work, transport, environment, health, technology, city life | The learner meets the structure in the content they will be tested on, and the vocabulary is pre-familiar |
| At most **one** unfamiliar word per example — and it should not be the target structure's neighbour | Same rule as the practice module §1.5. If the reader must decode the frame, they cannot see the pattern |
| No proper noun that carries the meaning of the example | Otherwise the reader learns a fact, not a form |
| No sentence you have read before | `staging-grammar/DESIGN.md` §0.2 — if a sentence feels familiar, it is. Throw it away |
| No named person doing a textbook action | Same source. No John, Mary, Tom, Sarah, Peter, Anna, no Mr Smith |
| No real statistics, no real researchers, no real institutions | Same source |
| Examples must be **true or plausible in the house world** | A learner who notices an example is nonsense stops trusting the page |

**Banned-example self-check, verbatim from the practice contract and binding here:** the cake
sentence for the third conditional; "If it rains, the grass gets wet"; "Water boils at 100°C" as an
example sentence; "I've lost my keys"; "John has been to Paris"; "The cat sat on the mat". If in
doubt, rewrite.

### 6.6 The "so what" line

Every example set ends with one line that says what the reader should have noticed. Not what the
grammar is called — what they should have *seen*.

> ✅ *Only the subject changed. Watch what happened to* have.
> ✅ *Both are correct English. The difference is whether she is still there.*
> ❌ *These examples illustrate the present perfect.*

Without it, the reader has scanned four sentences and extracted nothing. This line is often the only
sentence a mode-A reader reads after the short answer, so it should be able to stand alone.

---

## 7. Exceptions, without making the rule feel useless

### 7.1 Three kinds of exception, and only one is real

Most "exceptions" in learner grammars are not exceptions. Classify before writing.

| Kind | What it actually is | How to present |
|---|---|---|
| **A. A different rule** | the case is governed by another principle the reader has not met | Do **not** call it an exception. Say *"a different rule takes over here — see [chapter]"* and link |
| **B. Register or variety variation** | the "exception" is the informal, or American, or spoken form | Label it as variation, give the default, and say which one to use in an exam |
| **C. A genuine irregularity** | a closed list with no principle | Contain it, list it completely, say it is a list to learn |

Worked classification:

| "Exception" | Kind | Treatment |
|---|---|---|
| "*Some* is used in questions when you offer something: *Would you like some tea?*" | A | different rule: *some* vs *any* is about expectation, not about question form |
| "You can say *If I was* instead of *If I were*" | B | variation: *were* is the formal/traditional choice and the safer one in writing; *was* is extremely common in speech. Say both |
| "*Go / went / gone*" | C | irregularity: it is a list, and it is the most common verbs, so learn it |
| "You can't say *I am knowing*" | A | different rule: some verbs describe states, not actions, and states do not take the *-ing* form |
| "*Whom* instead of *who* after a preposition" | B | variation: formal written English; *who* is normal everywhere else |
| "*The* with some country names: *the Netherlands*, *the Philippines*" | C | irregularity: short closed list, learn it |

### 7.2 The containment pattern

```
[ RULE — stated bare, with no qualifiers, and examples ]

▸ Exceptions (3) — worth knowing at B1                    [collapsed by default]
    1. …  How often: uncommon.        Does it matter for you now? Not yet.
    2. …  How often: very common.     Does it matter for you now? Yes — learn this one.
    3. …  How often: rare.            Does it matter for you now? No. Recognise it only.
```

**Four requirements:**

1. **The rule is stated bare first.** No "generally", "usually", "in most cases" in the rule
   sentence itself. Hedges in the rule sentence are how a rule becomes unusable — the reader cannot
   tell whether they are allowed to apply it. Put the hedging in the exception block, where it
   belongs.
2. **Exceptions are collapsed and counted.** The count is in the label so the reader can judge
   whether to open it.
3. **Every exception carries a frequency label** from a closed set: *very common / common /
   uncommon / rare*. No numbers.
4. **Every exception carries a verdict** from a closed set: *learn this now / learn this later /
   recognise only / ignore*. This is the field that saves the rule. A learner who is told "ignore
   this for now" by the resource itself does not lose confidence in the rule; a learner who meets
   six unranked exceptions concludes English has no rules.

### 7.3 The stop-line

Every chapter that has more than three exceptions ends its exception block with an explicit
stop-line, adapted from the practice module's `edge_case.ignore_the_rest` flag:

> **That is the whole list.** Everything else follows the rule above. If you meet something that
> looks like another exception, it is almost certainly one of the three cases here.

This sentence does more work than it looks like it does. The learner's real fear is not the
exceptions they can see; it is the suspicion that there are hundreds more they cannot. Closing the
list closes the fear.

### 7.4 Never write these

| Anti-pattern | Why it is poison |
|---|---|
| "There are many exceptions to this rule." | Names a threat and gives no defence |
| "English is not logical." | Untrue, demoralising, and it licenses the learner to stop looking for patterns |
| "This is just something you have to memorise." (when it is not) | Learners believe it and stop reasoning |
| "Native speakers often get this wrong too." | Irrelevant to someone being assessed |
| "Don't worry about this." with no reason | Reads as evasion. Say *why* it does not matter yet |
| A rule stated with three hedges | *"Generally speaking, in most cases you would usually use…"* is not a rule |

---

## 8. False rules: the "never start a sentence with *because*" family

### 8.1 Why they have to be named

The learner already has these in their head, from a teacher, a school textbook, a prep site or a
YouTube video. A reference that quietly states the truth without naming the false rule loses the
argument, because the false rule is louder and older. The practice module makes `teach.false_rule` a
**required** field on every point for exactly this reason. Theory inherits the requirement in a
stronger form: **`myths[]` is a required array on every article, and it may be empty only if the
author has written a one-line justification that no false rule is in circulation for this
structure.**

### 8.2 The naming pattern

Three fixed headings, in this order, in a visually distinct block:

```
❝ You may have been told…       [the false rule, stated fairly, in its usual wording]
✔ What is actually true          [the real rule, with the reason]
→ What to do in your writing     [the practical instruction, including any real risk]
```

The third heading matters. Many myths encode a real risk badly: "never start with *because*" is
wrong as a rule about word position and *right* as a warning about sentence fragments. Debunking
without replacing leaves the learner worse off than the myth did.

### 8.3 The myth ledger

Every one of these is in circulation among our users. Each gets a treatment — either a `myths[]`
entry inside the relevant chapter, or its own `kind: myth` article where the myth is big enough.

| # | The myth | The truth | What to actually do | Where it goes |
|---|---|---|---|---|
| 1 | Never start a sentence with *because* | You can. *Because the bridge was closed, the bus took the long way.* is a normal, correct sentence. The real problem is a **fragment**: *Because the bridge was closed.* on its own is not a sentence | Start with *because* whenever it helps. Just make sure the sentence also contains a main clause — the part that could stand alone | Ch on subordinate clauses + own myth article |
| 2 | Never start a sentence with *and* or *but* | You can, and good writers do it often | Fine in Task 2 in moderation; it reads as emphatic. Do not do it in three sentences running | Ch on conjunctions |
| 3 | Never end a sentence with a preposition | You can. *Which department is she in?* is normal English. Rearranging to *In which department is she?* is stiffer, and sometimes absurd | End with the preposition when it sounds natural. Use the fronted version only in formal writing where it is genuinely smoother | Ch on questions; ch on relative clauses |
| 4 | Never split an infinitive | *to quickly review* is grammatical and has been for centuries. The prohibition was invented in the 19th century | Split it when the alternative is ambiguous or clumsy. Avoid splitting with a long phrase (*to, over the following months, review*) | Ch on infinitives |
| 5 | Never use *I* in academic writing | Style advice, not grammar — and it does not apply to an IELTS-style opinion essay, which asks for your view | Use *I* where the task asks for your opinion. Avoid *I think* in every sentence — that is a repetition problem, not a grammar rule | Ch on register |
| 6 | Never use the passive | The passive is the normal choice when the doer is unknown, irrelevant or obvious — which is most of a process description | Use it deliberately: when the doer does not matter, or to keep the topic of the previous sentence at the front | Ch on the passive |
| 7 | Always use the passive in academic writing | The opposite over-correction. Modern academic English uses both | Choose per sentence, on the doer test | Ch on the passive |
| 8 | *Shall* is the correct future for *I* and *we* | A 19th-century prescription. *Will* is standard everywhere now; *shall* survives in offers and suggestions (*Shall I open a window?*) and in legal English | Use *will*. Use *shall* only for an offer or suggestion | Ch on the future |
| 9 | *Whom* is always required after a preposition | *Whom* is correct and formal; *who* is standard in speech and most writing | In writing, *whom* directly after a preposition is safe: *to whom*. Everywhere else, *who* is fine | Ch on relative clauses |
| 10 | *They* cannot be singular | Singular *they* has centuries of use and is now standard for an unspecified person | *If a student misses the deadline, they must email the office.* is correct and is the natural choice | Ch on pronouns |
| 11 | Double negatives are always wrong | In standard English *I didn't see nothing* is nonstandard. But *not unusual* (a negative + a negative word) is a normal, useful device | Do not stack *not* with *nothing/nobody/never*. *Not un-* is fine and slightly formal | Ch on negatives |
| 12 | *Less* can never be used with countable nouns | The traditional rule is *fewer* with countables. *Less* with countables is very common in speech and in signage | In writing, use *fewer* for things you count. In speech nobody will notice either way | Ch on quantifiers |
| 13 | *Data* is always plural | Both are current. *The data are* is traditional and common in science writing; *the data is* is standard in general use | Pick one and be consistent inside one piece of writing | Ch on countability |
| 14 | *Which* can never introduce a defining clause | A US style preference (*that* for defining, *which* for non-defining), widely followed in American editing. British usage allows defining *which* freely | Use *that* for defining clauses — it is never wrong in either variety. Always use a comma before a non-defining *which* | Ch on relative clauses |
| 15 | The Oxford comma is a grammar rule | It is a style choice | Be consistent. Use it when it removes ambiguity | Ch on punctuation |
| 16 | Every sentence must have a verb and a subject, always | True for standard written English, and the right default. Note that instructions have an invisible *you* (*Close the door.*) | Keep the default. Check every sentence has a main clause | Ch 1 |
| 17 | *Since* always needs the present perfect | Usually, but not always: *since* can introduce a reason (*Since the office moved, the commute is shorter*) and can appear with the past perfect | Ask what *since* is doing: marking a start point, or giving a reason? | Ch on the present perfect |
| 18 | *Already / yet / just* mean you must use the present perfect | The single most damaging keyword rule taught to learners. It produces *I have been to Verdon last year* | Ignore the keyword. Ask whether the time period is finished. (American English also uses the past simple with *just* and *already*) | Ch on present perfect vs past simple |
| 19 | *Will* is the future tense and *going to* is informal | Both are standard. The difference is evidence and prior decision, not formality | Use *going to* when the decision was already made or the evidence is present; *will* for a decision made now or a prediction with no present evidence | Ch on the future |
| 20 | You must never use contractions in writing | Not a grammar rule. It is a formality convention, and it is a real one for Task 2 | Avoid contractions in a formal essay; use them freely in speech and informal writing | Ch on register |

**T-MYTH-1.** Every myth entry states the false rule **in the wording the learner has actually
heard**, not in a strawman version. If the reader does not recognise their own belief in the ❝ line,
the debunking does not attach to it.

**T-MYTH-2.** No myth entry ridicules the source. Our readers were taught these by teachers they
respect. *"Some teachers still teach this"* is fine; *"a silly old rule"* is not — it makes the
reader defend the myth.

### 8.4 Where usage genuinely varies — the honesty rule

**T-VAR-1.** Where British and American English, or formal and informal register, or prescriptive
and descriptive practice genuinely differ, the article states both, labels which is which, and gives
a **default** with a reason.

The template:

> **Two versions of this exist.** In British English, … In American English, …
> **Our default: British.** IELTS-style tasks accept both consistently used, and this app's content
> is British-standard, so that is what we show. If you have learned the American form, keep it —
> just do not mix the two inside one piece of writing.

The variation ledger the theory section must cover (each gets a labelled note in its chapter, and
they are collected in one `kind: paradigm` article, "British and American: the differences that
matter"):

| Area | British | American | Our default | Does it cost marks? |
|---|---|---|---|---|
| Present perfect with *just / already / yet* | *I've just seen it* | *I just saw it* | British | No, if consistent |
| Past participle of *get* | *got* | *gotten* | British | No |
| *have got* for possession | common | less common; *have* | British | No |
| Collective nouns | *the team are* (also *is*) | *the team is* | Either; be consistent | No |
| Preposition with weekends/dates | *at the weekend*, *at university* | *on the weekend*, *in college* | British | No |
| *shall* for offers | more common | rare | British | No |
| Defining *which* | permitted | *that* preferred | Use *that* — safe in both | No |
| *needn't* | used | rare; *don't need to* | Either | No |
| Mandative subjunctive | *insist that he should be told* (also bare form) | *insist that he be told* | Either | No |
| Spelling: *-ise/-ize*, *-our/-or*, *-re/-er*, *travelling/traveling* | *organise, colour, centre, travelling* | *organize, color, center, traveling* | British; **consistency is what is assessed** | Only if mixed |
| *different from / to / than* | *from*, *to* | *from*, *than* | *from* — safe everywhere | No |

**T-VAR-2.** Never present one variety's form as an error. Write *"this is the American form"*,
never *"this is wrong in British English"*, unless it genuinely is (e.g. *the team are* is not
available in American English as a normal choice, but *the team is* is available in British English —
say so precisely).

**T-VAR-3.** Where a form is genuinely stigmatised in formal writing but normal in speech (*less*
with countables, *If I was*, *who* for *whom*), say both halves. Hiding the speech form makes the
learner think it is an error when they hear it; hiding the stigma costs them marks.

---

## 9. Turning reading into doing

### 9.1 The four link types

| Link | Direction | Placement | Payload |
|---|---|---|---|
| **Practise this** | theory → practice | end of every article, and after any comparison section | `point_ids[]` — the practice points this article covers |
| **Read the theory** | practice → theory | on a point's teach screen, and on any feedback panel | `article_id` |
| **See the whole table** | article → paradigm article | inline, wherever a partial paradigm is shown | `article_id` + anchor |
| **Why?** | error feedback → theory | on any writing/speaking feedback line carrying an error code | resolved via `fixes_errors[]` |

**T-LINK-1.** Every article has ≥ 1 `point_ids[]` entry, or an explicit `no_practice_reason` string.
A theory chapter with nothing to practise is either an overview, a paradigm or a mistake.

**T-LINK-2.** Every practice point has exactly one `article_id`. Not zero — a learner stuck on a
point must have somewhere to read. Not many — many means the article boundaries are wrong.

**T-LINK-3.** `fixes_errors[]` on articles uses the **same 53-slug closed enum** as
`staging-grammar/DESIGN.md` §2.8. One taxonomy across practice items, error feedback, drills and
theory. A second taxonomy would mean the "Why?" link resolves to nothing for half the codes.

### 9.2 The "Practise this" block

Not a bare link. Three lines, because the transition from reading to doing is where learners drop
out:

```
Practise this
  ▸ Saying whether a period of time is finished          8 items · about 6 min     [Start]
  ▸ Present perfect or past simple?                      16 items · about 12 min   [Start]
Not ready yet? This needs "The three forms of a verb" first.      [Read that]
```

The third line is the honest one. If the practice point's prerequisites are unmet, say so and route
to the prerequisite rather than starting a session the learner will fail. This mirrors the practice
module's entry-route-1 behaviour (*"This comes from `gr_clause_types`, which you haven't done yet"*)
and reuses `deepest_unmet_prerequisite` from `sidecar/bandready/grammar/syllabus.py`.

### 9.3 The reverse link, and why it is worth more

Reading→practice is the obvious direction. Practice→reading is the valuable one, because the learner
arriving from a failed item has already noticed the gap.

Three reverse surfaces:

| Surface | Trigger | Lands on |
|---|---|---|
| Point teach screen | always available, small, secondary | the article's L1 short answer, expandable |
| Wrong-choice feedback | after a failed `choose_form` item | the article's comparison section, anchored |
| Writing/Speaking feedback line | an emitted error code | the article section that adjudicates that code |

**The third depends on D6** in the practice contract (scorers emitting error codes), which is a
spike, not a certainty. **Design so that theory is fully usable without it.** If no codes arrive,
surfaces 1 and 2 carry the load.

### 9.4 Anti-patterns

| Anti-pattern | Why it kills the section |
|---|---|
| Theory articles required before their practice points unlock | Turns the map into a gate. Violates claim 5 and the never-locked rule |
| A quiz at the end of each article | Now it is a course, and the practice module's ladder is bypassed. T-BOUND-1 |
| "Recommended reading" lists with no articulation of why | Reads as filler; nobody taps |
| The same example in article and item | The item becomes a memory test of the article. T-BOUND-3 |
| Practice points that restate the article's paradigm | Two sources of truth; one goes stale. T-BOUND-2 |
| Progress bars on reading | Gamifies the wrong behaviour. Reading is a lookup, not an achievement |

---

## 10. THE WRITING STANDARD

This section is the deliverable the authoring agents work from. It is written as rules, numbered so
the verify agent can cite them.

### 10.1 Voice — ten rules

| # | Rule | Why |
|---|---|---|
| V1 | **Second person.** *You use*, *you will hear*, *ask yourself*. Never *the student*, *the learner*, *one* | It is a conversation about the reader's decision |
| V2 | **Present tense throughout.** *English puts the subject first.* Not *English will put* / *has traditionally put* | Reference prose is timeless |
| V3 | **Active voice in the prose**, whatever the article is about. Do not explain the passive in the passive | The prose must be easier than the subject |
| V4 | **Give an instruction, not a description, wherever you can.** *Use* have *with* I, you, we, they. — not *The form* have *is used with…* | Instructions are actionable; descriptions are not |
| V5 | **Name the decision the reader is making**, in the reader's terms, before you name the grammar | Claim 8: meaning before form |
| V6 | **No hedging in a rule sentence.** Hedge in the exception block instead | §7.2 requirement 1 |
| V7 | **No enthusiasm, no reassurance-by-adjective.** Ban *simply*, *just*, *easy*, *obviously*, *of course*, *as you know*, *don't worry*, exclamation marks | *"This is simple"* to someone who finds it hard is an insult and a trust-breaker |
| V8 | **No apology for English.** Never *"English is illogical"*, *"unfortunately"*, *"annoyingly"* | §7.4 |
| V9 | **Concrete over abstract.** Say *"put* have *in front of it"*, not *"the perfect auxiliary precedes"* | The reader is decoding in a second language |
| V10 | **One idea per sentence.** If the sentence has *and* joining two clauses, consider two sentences | §10.2 |

### 10.2 Metrics — hard numbers

| # | Metric | Foundation articles | All other articles |
|---|---|---|---|
| M1 | Median prose sentence length | 10–14 words | 12–17 words |
| M2 | Maximum prose sentence length | **20 words** | **25 words** |
| M3 | Subordinate clauses per sentence | ≤ 1 | ≤ 1 |
| M4 | Words per paragraph | ≤ 50 | ≤ 60 |
| M5 | Sentences per paragraph | ≤ 3 | ≤ 4 |
| M6 | Consecutive body words with no landmark | ≤ 100 | ≤ 120 |
| M7 | Passive-voice sentences in the prose | 0 | ≤ 5% |
| M8 | Nominalisations per 100 words | ≤ 1 | ≤ 2 |
| M9 | Prose vocabulary outside the top 2,000 word families + ledger terms | 0 without a gloss | 0 without a gloss |
| M10 | Prose CEFR level | ≤ A2 | **one level below the structure taught**, floor A2, cap B1 |

**M10 is the rule most likely to be violated and the most important.** A chapter on the third
conditional (C1 structure) is written in B2 prose. A chapter on the present simple (A1 structure) is
written in A1–A2 prose. The prose is never harder than what it teaches, and never above B1 anywhere
in the section, because a learner reading a reference is by definition not yet fluent in the thing
the reference is about.

**M9 is the second most likely violation.** Words that authors reach for without noticing:
*utilise, denote, signify, comprise, constitute, respectively, hence, thus, whereby, henceforth,
notwithstanding, per se, ubiquitous, myriad, salient, pertinent, aforementioned, elucidate,
delineate, nuance, subtle, arbitrary, inherent, implicit, explicit, canonical, paradigm*. If a word
on that list is genuinely needed, it gets a gloss and joins the glossary.

### 10.3 Sentence patterns to prefer

| Instead of | Write |
|---|---|
| *The present perfect is formed by…* | *To make the present perfect, put* have *or* has *in front of the third form.* |
| *It is used to indicate that…* | *Use it when you want to say that…* |
| *This construction is employed in contexts where…* | *You need this when…* |
| *Care must be taken not to…* | *Watch out: do not…* |
| *It should be noted that…* | (delete — say the thing) |
| *There are three cases in which this occurs.* | *This happens in three situations. Here they are.* |
| *The auxiliary precedes the subject in interrogatives.* | *In a question, the helping verb comes before the subject: **Have** you finished?* |
| *One may optionally omit the relative pronoun.* | *You can leave out* who *or* that *when it is the object. Both are correct.* |

### 10.4 The term introduction macro

Every term introduction is authored as a structured block, not free prose, so the renderer can
present it consistently and the lint can check it.

```jsonc
"term_intro": {
  "term": "subject",
  "gloss": "who or what the sentence is about — it comes before the verb",  // verbatim from ledger
  "show_first": [                        // move 1: 2–3 examples, unnamed, target marked
    { "text": "The council closed the bridge.", "mark": "The council" },
    { "text": "Rain delayed the match at Norland.", "mark": "Rain" },
    { "text": "My sister works in Ashfield.", "mark": "My sister" }
  ],
  "name_line": "That word is called the **subject**.",                       // move 2
  "anchor": "Every English sentence needs one.",                            // move 4
  "l1_hook": ["es", "ar", "ru"],         // languages where this is a known transfer risk
  "ledger_position": 3
}
```

**T-TERM-5.** A term may be introduced in exactly one article. Later articles reference the glossary
chip; they do not re-teach.

### 10.5 Examples per rule — restated as a lint

| # | Rule |
|---|---|
| T-EX-7 | Minimum 3 examples per stated rule; 1 minimal pair per stated choice |
| T-EX-8 | Every example set of ≥ 4 has at least one spoken-register and one written-formal member, labelled |
| T-EX-9 | Every example set has a "so what" line (§6.6) |
| T-EX-10 | Every example set varies one dimension, and the lead-in names it |
| T-EX-11 | No example sentence exceeds 16 words |
| T-EX-12 | No example sentence is shared with a practice item or another article |

### 10.6 Headings as questions or statements

**T-HEAD-1.** Every heading is a full statement or a question, in the learner's vocabulary. A reader
who reads only the headings must come away with the rule.

| ✗ Topic heading | ✓ Statement / question heading |
|---|---|
| Form | How to build it |
| Usage | When you use it |
| Exceptions | Three cases where this does not apply |
| Present perfect vs past simple | Is the time period finished, or still running? |
| Notes | What to watch out for |
| Adverbs of frequency | Where *always*, *often* and *never* go in a sentence |
| The passive | When you want the thing done to first |
| Conclusion | (delete — reference articles have no conclusions) |

**T-HEAD-2.** Heading depth ≤ 2 levels inside an article. Three levels of nesting on a phone is
unnavigable.

### 10.7 The nine-part article skeleton

Every `kind: standard` article has these nine parts, in this order. Parts 6 and 8 may be empty with
a stated reason; the rest are required.

| # | Part | Field | Length | Notes |
|---|---|---|---|---|
| 1 | **Title** | `title` | ≤ 9 words | A can-do or a question, in learner vocabulary. Grammar name goes in `grammar_name` as a subtitle |
| 2 | **Short answer** | `short_answer` | ≤ 25 words | The L1 layer. Most-common case, as an instruction, one example, no hedging |
| 3 | **What it does** | `meaning` | 60–140 words | Meaning before form. What this does to a sentence, in the reader's terms |
| 4 | **How to build it** | `form` | table + ≤ 80 words | Affirmative, negative, question. Contractions listed. Third form named |
| 5 | **Examples** | `examples[]` | 6–14 | Controlled sets, marked, register-labelled, with "so what" lines |
| 6 | **When you use it / when you don't** | `choosing` | 100–250 words | The comparison section. Minimal pairs live here. **This is the highest-value part of the article** |
| 7 | **Watch out** | `errors[]` | 2–5 | Reuse the practice module's error shape: wrong, right, why it happens, smallest fix |
| 8 | **You may have been told…** | `myths[]` | 0–3 | §8.2 three-heading pattern |
| 9 | **Practise this / Related** | `links` | — | §9.2 block, plus 2–4 related articles with a reason each |

Plus these always-on rails, rendered outside the body:

- **Terms used here** — auto-collected from `term_refs[]`, each with its gloss.
- **If your first language is …** — the L1 boxes (§12.10), shown only when a matching L1 is set.
- **Where this pays** — reuse `pays_in[]` from the practice point so the reader knows why they are
  reading this. One line.

`kind: comparison` articles use the same skeleton with part 6 promoted above parts 4 and 5, because
the reader arrived to settle a choice, not to build a form.

### 10.8 Banned in our prose

| Category | Banned | Use instead |
|---|---|---|
| Register | *utilise, employ (=use), commence, endeavour, ascertain, in order to, prior to, subsequent to, with regard to* | *use, start, try, find out, to, before, after, about* |
| Filler | *It should be noted that, It is important to remember that, As previously mentioned, In this section we will, Let us now consider* | delete and say the thing |
| Hollow intensifiers | *very, really, quite, extremely, highly* (in explanatory prose) | delete, or use a precise word |
| Reassurance | *simply, just, easy, obviously, of course, as you know, don't worry* | delete |
| Vagueness | *some, certain, various, a number of* (when a number or a list is available) | give the number or the list |
| Metalanguage without gloss | any term not on the ledger | the substitution table (§4.4) |
| Punctuation | semicolons in body prose; em-dash chains; parentheses inside parentheses | full stops |
| Typography | ALL CAPS, bold for emphasis in prose (bold is reserved for marking targets and terms) | restructure the sentence |
| Claims | any percentage about learner errors, any error-count band threshold, any appeal to examiner training, any per-structure frequency figure | qualitative statements (`staging-grammar/DESIGN.md` §0.2) |

### 10.9 Pre-commit self-check for an authoring agent

Run this list on every article before committing. It is ordered so the expensive checks come last.

1. Can I state this article's question in one sentence with no grammar words? (§3.3)
2. Is the short answer ≤ 25 words, an instruction, with one example, no hedge?
3. Does the article read correctly if the reader has read **no other article**? (Baker's test)
4. Do the headings alone convey the rule?
5. Is every ledger term used at or below its position? Does each first use have a chip?
6. Is any prose sentence over the M2 cap? Any paragraph over M4/M5?
7. Is any prose word outside the top-2,000 + ledger, without a gloss? (M9)
8. Is the prose one level below the structure taught? (M10)
9. Does every rule have ≥ 3 examples, and every choice a full minimal pair with both meanings and
   the named difference?
10. Does every example set have a "so what" line and vary one dimension?
11. Is every table justified — a real grid, cells ≤ 9 words, takeaway caption, examples adjacent,
    weight markers if a paradigm?
12. Is every exception classified (A/B/C), contained, frequency-labelled and verdict-labelled? Is
    there a stop-line if there are more than three?
13. Is every false rule in circulation named, in its real wording, with the three headings?
14. Is every genuine variation labelled with a default and a reason?
15. Is there a `wrong` string in the first 120 words? (There must not be.)
16. Are all example sentences original, house-world, ≤ 16 words, not shared with practice?
17. Does the article link to ≥ 1 practice point, and does the point link back?
18. Have I read any of these sentences somewhere before? If there is any doubt, rewrite.

---

## 11. Worked before/after

### 11.1 A badly written reference paragraph

This is the kind of paragraph that fills reference grammars. It is not stupid. Every statement in it
is true. It is unusable.

> **BEFORE**
>
> **The Present Perfect**
>
> The present perfect tense is formed with the auxiliary verb *have* (or *has* in the third person
> singular) followed by the past participle of the main verb. It is employed to denote an action
> which commenced in the past and which either continues into the present or whose consequences
> remain relevant at the moment of speaking. It should be noted that the present perfect cannot be
> used in conjunction with adverbials denoting finished time, such as *yesterday* or *in 2019*,
> although it should also be borne in mind that in American English the simple past is frequently
> substituted in contexts where British English would prefer the present perfect. The present
> perfect is also commonly used with *since* and *for*, the former being used with points in time
> and the latter with durations, though care must be taken as *for* may also occur with the simple
> past. Compare: *I have lived in Ashfield for six years* / *I lived in Ashfield for six years*.

**Diagnosis — thirteen defects:**

| # | Defect | Rule broken |
|---|---|---|
| 1 | Title is the grammatical name, not the reader's question | T-HEAD-1, skeleton part 1 |
| 2 | No short answer; a mode-A reader gets nothing in the first screen | Skeleton part 2 |
| 3 | Form before meaning | Claim 8 |
| 4 | Five ungloassed terms in sentence 1: *tense, auxiliary verb, third person singular, past participle, main verb* | T-TERM-1/3 |
| 5 | Sentence 2 is 34 words; sentence 3 is 52 words | M2 |
| 6 | *employed, denote, commenced, adverbials, in conjunction with, borne in mind* — all above the vocabulary ceiling | M9, §10.8 |
| 7 | Passive prose throughout (*is formed, is employed, is substituted, must be taken*) | V3, M7 |
| 8 | Exception (finished time) is welded into the rule sentence, so the rule cannot be extracted | §7.2 req. 1 |
| 9 | The American variation is dropped in mid-sentence with no default and no advice | T-VAR-1 |
| 10 | The *since/for* rule and its caveat arrive together, so both are unusable | §7.2 |
| 11 | One example pair, unlabelled, with no meanings written out and no named difference | T-EX-1/3/4 |
| 12 | One paragraph, no headings — nothing to scan | T-LEN-2/3, layer-cake |
| 13 | No link to practice; the reader finishes with nothing to do | T-LINK-1 |

### 11.2 The rewrite

> **AFTER**
>
> # Saying that something started before now and still matters
> *Grammar name: the present perfect*
>
> > **Short answer.** Use *have* or *has* + the third form of the verb: *has closed*, *have worked*.
> > It ties something earlier to now.
>
> ## What it does
>
> This form connects an earlier action to the present. It does not tell you *when* the action
> happened. It tells you that the action still counts now.
>
> Compare these two. Both are correct English.
>
> - The council **closed** the Marlow bridge. → *You are told about a past event. It may be open again.*
> - The council **has closed** the Marlow bridge. → *The bridge is shut now. That is the point.*
>
> **Only difference:** *closed* / *has closed*. The first is about the past. The second is about now.
>
> ## How to build it
>
> *have* or *has* + the **third form** of the verb (*gone*, *closed*, *written*).
>
> | | Positive | Negative | Question |
> |---|---|---|---|
> | I / you / we / they | I **have** finished · I**'ve** finished | I **have not** finished · I **haven't** finished | **Have** I finished? |
> | he / she / it / one thing | She **has** finished · She**'s** finished | She **has not** finished · She **hasn't** finished | **Has** she finished? |
>
> *Every row has the same second word: the third form. Only* have */* has *changes.*
>
> - The inspectors **have** arrived. *(written)*
> - She**'s** already sent it. *(spoken —* she's *is* she has *here, not* she is*)*
> - **Have** you booked the room? *(spoken)*
> - The department **has not** replied. *(written-formal)*
>
> ## When you use it
>
> Ask yourself one question: **is the period of time I am talking about finished?**
>
> | Your answer | Use | Example |
> |---|---|---|
> | Finished — *yesterday, in 2019, last month* | past simple | I **applied** in March. |
> | Still running, or not named at all | present perfect | I **have applied** to four universities. |
>
> **This is the choice that costs the most marks.** Not the form — the choice.
>
> ### *Since* and *for*
>
> - **since** + the moment it started: *since March*, *since I moved to Verdon*
> - **for** + how long it has lasted: *for six years*, *for two weeks*
>
> - I **have worked** at the Norland depot **for** six years. → *I still work there.*
> - I **worked** at the Norland depot **for** six years. → *That is over. I work somewhere else now.*
>
> **Only difference:** *have worked* / *worked*. Both are correct. They say different things.
>
> ## Watch out
>
> | Wrong | Right | Why it happens | Smallest fix |
> |---|---|---|---|
> | ~~I have visited the Norland reserve in 2019.~~ | I visited the Norland reserve in 2019. | You were taught this is the "experience" form, and the named year does not stop that rule firing | Delete one word: *have* |
> | ~~I am living in Ashfield since 2019.~~ | I have lived in Ashfield since 2019. | Many languages use a present form with *since*. English does not | Change *am living* to *have lived* |
>
> > **You may have been told…** that *already*, *yet* and *just* mean you must use the present perfect.
> > **What is actually true:** those words often appear with it, but they do not decide it. The
> > finished-or-not question decides it. That keyword rule is what produces *I have been to Verdon
> > last year*.
> > **What to do:** ignore the keyword. Ask whether the time period is finished.
>
> ▸ **Exceptions (1)** — worth knowing at B1
> > **American English.** American English often uses the past simple where British English uses the
> > present perfect: *I just saw it* / *I've just seen it*. **Our default is British.** Both are
> > accepted in IELTS-style tasks if you are consistent. How often: very common. Does it matter for
> > you now? Only for consistency.
>
> ## Practise this
> ▸ Saying whether a period of time is finished — 8 items · about 6 min
> ▸ Present perfect or past simple? — 16 items · about 12 min
>
> **Related:** The three forms of a verb · Past simple · Present perfect continuous

**What changed, measured:**

| | Before | After |
|---|---|---|
| Longest sentence | 52 words | 18 words |
| Headings | 0 | 5 |
| Terms used without a gloss | 5 | 0 |
| Passive sentences in prose | 4 of 5 | 0 |
| Examples | 2 | 12 |
| Minimal pairs with meanings written out | 0 | 2 |
| Register labels | 0 | 4 |
| Exception status | welded into the rule | contained, labelled, verdict given |
| Variation status | dropped mid-sentence | labelled with a default and a reason |
| Myth named | none | one, the highest-frequency one |
| Reader can act after reading | no | yes — one question to ask, two links |
| Body word count | 168 | ~430 |

Note the last row. **The good version is longer.** Shortening was never the goal; *scannability and
actionability* were. A reader can extract the whole rule from the after version in fifteen seconds
by reading only the title, the short answer and the five headings — which is what most of them will
do.

### 11.3 A bad table, rewritten

> **BEFORE**
>
> | Tense | Structure | Usage |
> |---|---|---|
> | Present Perfect Simple | have/has + V3 | Actions occurring at an unspecified time before now, with present relevance; also with *since*/*for* for actions beginning in the past and continuing to the present; also for repeated actions in an unfinished period |
> | Present Perfect Continuous | have/has been + V-ing | Actions which began in the past and continue into the present, with emphasis on duration |

Defects: cells are paragraphs (T-TAB-2); abbreviations *V3*, *V-ing* (T-TAB-8); leftmost column is
the grammatical name rather than the reader's situation (T-TAB-4); no caption (T-TAB-3); no examples
(T-TAB-6); the rows do not read aloud (T-TAB-5); the "usage" column contains three rules crammed
into one cell.

> **AFTER**
>
> **Both are about something that started earlier and touches now. The difference is what you are
> pointing at.**
>
> | You want to point at… | Use | Example |
> |---|---|---|
> | the result — it is done, and here is what changed | *have/has* + third form | The council **has repaired** the footbridge. *(so it is usable now)* |
> | how long it has been going on | *have/has been* + *-ing* | The council **has been repairing** the footbridge **since April**. *(and it is still not finished)* |
>
> *Say the row out loud: "I want to point at the result, so I use* have *plus the third form."*

Two columns became three, every cell fits on one line, the leftmost column is the reader's intention
rather than a grammatical label, the caption is the takeaway, and the examples sit inside the table
where the split-attention rule wants them.

---

## 12. First-language interference: the seven groups

### 12.0 How to use this section without stereotyping

**T-L1-1.** L1 notes describe **a predictable transfer risk**, never a property of a person. Write
*"Tamil places the verb at the end of the sentence, so this order can feel wrong at first"*, never
*"Tamil speakers struggle with word order"*.

**T-L1-2.** L1 notes are **additive and opt-in**. The article is complete without them. A learner
who sets no L1, or an L1 we do not cover, loses nothing.

**T-L1-3.** L1 notes **explain the mechanism**, because the mechanism is what interrupts the
transfer. *"Your language does X; English does Y; that is why the sentence comes out as Z"* is
actionable. *"Watch out for articles"* is not.

**T-L1-4.** L1 notes are ≤ 45 words and contain exactly one wrong→right pair.

**T-L1-5.** Do not claim a language lacks a category it merely marks differently. Tamil has no
articles; it *does* have definiteness, expressed by other means. Chinese has no tense inflection; it
*does* express time, with adverbs and aspect particles. Getting this wrong is both linguistically
false and demoralising — it tells learners their language is missing something. It is not; it is
different.

**Evidence base and its honest limits.** The canonical reference is Swan & Smith, *Learner English:
A Teacher's Guide to Interference and Other Problems* (Cambridge, 2nd ed. 2001), which has dedicated
chapters for South Asian languages, Dravidian languages, Arabic, Chinese, Spanish and Russian. Where
this section cites peer-reviewed error-analysis studies below, they are named. Where the only
available sources are teaching blogs and practitioner lists — which is the case for several of the
Spanish and Sinhala items — the item is marked **[practitioner]** and the design agent should treat
it as a hypothesis to confirm with our own error logs once we have them, not as a finding.

### 12.1 The cross-language matrix

`●` = strong, well-attested risk. `○` = present but weaker or proficiency-dependent. Blank = not a
notable transfer source for that L1.

| Error | Ta | Si | Hi | Ar | Zh | Es | Ru |
|---|---|---|---|---|---|---|---|
| Articles omitted (*a/an/the*) | ● | ● | ● | ○ | ● | | ● |
| Articles over-used (*the* with generics) | | | | ● | | ● | |
| *be* dropped (*He teacher*) | ○ | ● | ○ | ● | ● | | ● |
| Subject dropped (*Is raining*) | ○ | ○ | | ● | ○ | ● | ○ |
| Third-person *-s* omitted | ● | ● | ● | ○ | ● | ○ | ○ |
| Plural *-s* omitted | ○ | ○ | ○ | | ● | | ○ |
| Past *-ed* omitted / tense not marked | ○ | ● | ○ | ○ | ● | | ○ |
| Present perfect ↔ past simple confusion | ● | ● | ● | ● | ● | ● | ● |
| Present simple used for duration (*I live here since 2019*) | ● | ● | ● | ● | ○ | ● | ● |
| Continuous with state verbs (*I am knowing*) | ● | ● | ● | | ○ | ○ | ○ |
| Word order: verb late / SOV leakage | ● | ● | ● | | ○ | | ○ |
| Question without inversion (*You are coming?*) | ● | ● | ● | ○ | ● | ● | ● |
| Inversion kept in an embedded question (*I don't know where is it*) | ● | ● | ● | ● | ● | ● | ● |
| No *do*-support (*I no like*, *You like it?*) | ○ | ○ | ○ | ○ | ○ | ● | ● |
| Resumptive pronoun in relative clause (*the man who I saw him*) | ● | ● | ● | ● | ○ | ○ | ○ |
| Relative clause placed before the noun | ● | ● | ○ | | ● | | |
| Double negative | | | | | | ● | ● |
| Countability (*informations*, *advices*) | ● | ● | ● | ● | ● | ● | ● |
| Preposition choice (*discuss about*, *depend of*) | ● | ● | ● | ● | ● | ● | ● |
| Adjective after noun | | | | ○ | | ● | |
| *he/she* confusion in speech | | ● | ○ | | ● | | |
| Run-on sentences / comma splice | ○ | ○ | ○ | ● | ● | ● | ○ |
| Capitalisation of days/months/nationalities | | | | ● | | ● | ● |
| Existential *there is/are* replaced by *have* | | | ○ | ○ | ● | ○ | ○ |
| Invariant tag question (*isn't it?*) | ● | ● | ● | | | ○ | |
| Passive avoided / over-used | ○ | ○ | ○ | ○ | ● | ○ | ○ |

**The five that appear for six or seven of the seven groups are our highest-value pre-emptions**:
articles, present-perfect-vs-past-simple, present simple used for duration with *since/for*,
embedded-question inversion, and countability. Every one of them must have a dedicated chapter, an
explicit "if your language does not have this" framing, and a comparison section.

### 12.2 Tamil

Dravidian; subject–object–verb; postpositions rather than prepositions; agglutinative; no articles;
relative clauses formed with a participle placed **before** the noun; questions formed with a
particle rather than by moving words.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| T1 | *I bought book yesterday* — no article | Tamil has no *a/an/the*. Definiteness is carried by other means (case, word order, *oru* "one") | Articles chapter opens with: *"Your language may show 'which one' in another way. English uses a small word in front of the noun, and it is almost never optional."* Give the three-way test: is it one of many, the one we both know, or a general idea? |
| T2 | *I yesterday the report finished* — verb late | Tamil is verb-final; the order feels natural | The very first chapter shows the fixed English frame `[subject] [verb] [object]` as a slot picture and says explicitly that English order is not free, because English does not mark who-does-what on the words |
| T3 | *the yesterday I bought book* / *the man who I met him* | Tamil relative clauses come before the noun and use a participle, with no relative pronoun; a pronoun may remain inside | Relative-clause chapter shows the English pattern as `noun + who/which/that + rest`, and has a "delete the extra pronoun" example: ~~the officer who I spoke to **him**~~ → *the officer who I spoke to* |
| T4 | *You are coming tomorrow?* | Tamil marks a question with a particle (*-ā*); no word moves | Questions chapter leads with the slot picture and states: *"In English a question changes the order. Rising intonation alone is possible in speech but is not the standard written form."* |
| T5 | *He is having two cars* / *I am knowing him* | South Asian English extends the *-ing* form to states; Tamil has no equivalent restriction | Continuous chapter contains the state-verb list and the rule as a decision: *"Is this something happening, or something that is simply true? If it is simply true, use the plain form."* |
| T6 | *We discussed about the plan* | Tamil postpositions do not line up with English prepositions | Prepositions chapter carries the closed "no preposition needed" list: *discuss, enter, marry, approach, reach, contact, resemble, lack, emphasise* |
| T7 | *He came yesterday only* / *I did it myself only* | Tamil *tāṉ* is an emphatic particle with no single English equivalent | Register chapter: *"This is normal Sri Lankan and Indian English. In an IELTS-style essay, use* only *before the word it limits, or use* just*."* |
| T8 | *You are coming, isn't it?* | Invariant tag, calqued from a single L1 particle | Question-tags chapter shows that English tags copy the helping verb and flip the polarity, with a table |
| T9 | *He is a teacher* pronounced/written with p/b, t/d confusion | Tamil stops have no phonemic voicing contrast; voicing is positional | Not a grammar issue. Flag in the pronunciation/spelling note only: spelling errors like *pest* for *best* have this source |
| T10 | *I have finished it yesterday* | Perfect/past mapping differs | Present perfect chapter, the finished-time question |

### 12.3 Sinhala

Indo-Aryan; subject–object–verb; no definite article (indefiniteness marked by a suffix); no present
copula in equational sentences; **gender-neutral third-person pronoun** in colloquial use;
relative clauses pre-nominal; question particle rather than inversion. Error-analysis studies of
Sinhala-speaking undergraduates report omission and misuse as the two dominant error types, and
specifically identify the collapse of present simple and present continuous in colloquial Sinhala as
a source of tense error.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| S1 | *I eat rice now* for *I am eating rice* — and the reverse | Colloquial Sinhala uses one form where English uses two (present simple and present continuous) | The present-simple-vs-continuous chapter is a **comparison chapter**, not two form chapters, and it opens on the decision: *"routine or right now?"* Give four pairs |
| S2 | *He very tired* | Sinhala equational sentences have no *is* | Chapter 1 states that English needs a verb in every sentence, and that *be* is a verb: *He **is** very tired.* Repeat in the adjectives chapter |
| S3 | *My sister, he works in Colombo* | Colloquial Sinhala *eyā* covers both *he* and *she* | Pronouns chapter carries an explicit box: English chooses *he* or *she* by the person, and gets it wrong-sounding immediately if you slip. Also introduce singular *they* as the correct choice when the person is unspecified |
| S4 | *I went to shop* — article missing | No articles in Sinhala | Same as T1 |
| S5 | *Where you are going?* | Question particle *-da*; no movement | Same as T4, with the embedded-question contrast: *I don't know where you are going.* (no inversion) vs *Where are you going?* (inversion) |
| S6 | *I am living here since 2019* | Sinhala uses a present form with a since-phrase | The *since/for* section of the present perfect chapter, with the wrong→right pair given explicitly |
| S7 | *The teacher who I met her* | Pre-nominal relative participle; retained pronoun | Same as T3 |
| S8 | *He is having a car* | Same South Asian state-verb extension | Same as T5 |
| S9 | *two book*, *many student* | Sinhala plural marking is not obligatory in the same environments | Countability chapter: after a number or *many*, the noun **must** take *-s*. Give the four-example controlled set |
| S10 | *I have gone there last month* | Perfect/past mapping | Present perfect chapter |

### 12.4 Hindi (and, largely, Urdu, Bengali, Marathi, Gujarati, Nepali)

Indo-Aryan; subject–object–verb; postpositions; grammatical gender on nouns, adjectives and verbs;
no articles; an invariant question tag *nā*; a present-tense copula that *is* present, unlike Arabic
or Russian.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| H1 | *I went to market* | No articles | Same as T1 |
| H2 | *I am living in Delhi since 2019* | Hindi uses a present form with *se* ("since/from") | The single highest-value pre-emption for this group. Put it in the short answer of the *since/for* section, with the wrong→right pair |
| H3 | *I am having a doubt* / *She is knowing the answer* | State verbs in the *-ing* form; established in Indian English | Same as T5, plus a register note: this is normal in Indian English and is marked in an IELTS-style essay |
| H4 | *You will come tomorrow, isn't it?* | Invariant tag from *nā* | Same as T8 |
| H5 | *We discussed about it* / *I am married with her* / *different than* | Postposition–preposition mismatch | Prepositions chapter's closed lists, and the *married to / different from* pairs |
| H6 | *He told me that he is coming yesterday* | Hindi does not backshift the way English optionally does | Reported speech chapter: backshift is the default; it is optional when the thing is still true; it is **not** optional when the time has changed |
| H7 | *cousin brother*, *real brother*, *out of station* | Calques established in Indian English | Vocabulary/register note, not grammar. Give the neutral equivalents |
| H8 | *small small pieces* | Hindi reduplication for distributive meaning | Register note: use *several small pieces*, *a few small pieces* |
| H9 | *Yesterday I to the office went* under pressure | SOV leakage under cognitive load, especially in long sentences | Chapter 1's slot picture, and the sentence-boundaries chapter's "find the verb" check |
| H10 | *He did not came* | The base form after *did* is not obvious when the L1 marks tense elsewhere | Auxiliary chapter's rule as a slogan: *only one word in the verb group carries the time. If* did *is there, the main verb goes back to its plain form* |

### 12.5 Arabic

Semitic; root-and-pattern morphology; verb-initial and subject-initial orders both available;
definite article *al-* with no indefinite counterpart; **no copula in the present tense**; relative
clauses take a resumptive pronoun; possession expressed prepositionally rather than with a verb
"have"; heavy clause coordination in written style; no letter case. Article research on Arabic
speakers finds a distinctive pattern: reasonable accuracy on *the* for previously-mentioned
referents, but **omission with unique nouns and over-use with indefinite singulars**.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| A1 | *He teacher* / *The room very cold* | Arabic present-tense sentences do not need a copula | Chapter 1 and the *be* chapter both state it: English will not let you leave out *is/are/am*. Give three wrong→right pairs |
| A2 | *The life is difficult* / *The people they are worried* | Arabic uses the definite article with generic and abstract nouns | Articles chapter has a dedicated section: *generic statements in English usually take no article with plurals and uncountables*: *Life is difficult.* *People are worried.* |
| A3 | *He is teacher* | Arabic has no indefinite article, so the slot is simply left empty | Same chapter, the other direction: singular countable nouns almost always need *a/an* or *the* |
| A4 | *The report which I read it was long* | Arabic relative clauses require the resumptive pronoun | Relative clauses chapter: *"Your language keeps the pronoun inside. English deletes it."* One struck-through pair |
| A5 | *Is important to arrive early* | Arabic is pro-drop, and has no dummy subject | The *it* and *there* chapter: English sentences need a subject even when there is nothing to be the subject. *It is important…*, *There are three reasons…* |
| A6 | *With me a car* / *I have not any experience* | Arabic expresses possession with a preposition | The *have* chapter with the possession pattern spelled out, and the *any/some* rule |
| A7 | Very long sentences chained with *and* | Arabic written style coordinates heavily; it is a genre norm, not an error in Arabic | Sentence-boundaries chapter, framed as register: *"English written style prefers shorter sentences and different joining words. This is a difference in taste between the two written traditions, not a mistake in yours."* Give the connective menu |
| A8 | *a car red* | Arabic places adjectives after the noun | Adjectives chapter: English puts the adjective before the noun. Give the order table for multiple adjectives |
| A9 | *in january*, *he is arabic* | Arabic script has no upper case | Punctuation and capitals chapter, with the closed list: days, months, nationalities, languages, names, *I* |
| A10 | *three books were arrived* | The English passive is over-generalised to intransitive verbs, since Arabic passive morphology is regular | Passive chapter states the gate plainly: *only verbs that can take an object can go passive*. Give three verbs that cannot: *arrive, happen, sleep* |
| A11 | *bicture*, *fery* | Arabic lacks /p/ and /v/ | Pronunciation/spelling note only |

### 12.6 Chinese (Mandarin; most items hold for Cantonese)

Isolating — no inflection at all; topic-prominent as well as subject-prominent; aspect particles
rather than tense; no articles; measure words; adjectival predicates without a copula; relative
clauses pre-nominal; question particle rather than inversion; a spoken third-person pronoun that
does not distinguish gender. Corpus work on Chinese learner writing consistently ranks tense/verb
form, article omission and plural *-s* omission at the top.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| C1 | *Yesterday I go to the library* | Chinese has no tense inflection; time is carried by adverbs | The past simple chapter states: *"English marks the time on the verb as well as in the time word. Both must agree."* Give the *yesterday → -ed* controlled set |
| C2 | *three book*, *many student* | No obligatory plural marking; number is carried by the numeral and measure word | Countability chapter, same set as S9 |
| C3 | *She go to work by bus* | No subject–verb agreement in Chinese | The *-s* chapter, framed as: *"only* he*,* she*,* it *and one-thing subjects add* -s*, and only in the present."* Table with four rows |
| C4 | *I bought book* | No articles | Same as T1 |
| C5 | *She very tired* | Chinese adjectives function as predicates without a copula; *hěn + adj* is a complete sentence | Same as A1, and repeated in the adjectives chapter, because this one is extremely persistent |
| C6 | *This book I have read it* / *About the traffic, it is serious* | Chinese is topic-prominent: the topic goes first and need not be the subject | **Chapter 1 must contrast "topic" and "subject" explicitly**, because the word *subject* misleads exactly this group (§4.5). Show the English repair: make the topic the subject, or use a passive |
| C7 | *Although it was raining, but we went* / *Because it rained, so we stayed* | Chinese uses paired connectives | Conjunctions chapter: *"English uses one joining word, not two. Choose the front one or the middle one."* Two wrong→right pairs |
| C8 | *In the room has three chairs* | Chinese existential uses *yǒu* ("have") | The *there is/are* chapter: existence takes *there*, not *have* |
| C9 | *the I bought book* | Chinese relative clauses precede the noun | Same as T3, with the order rule stated as a slot picture |
| C10 | Comma-spliced run-ons | Chinese punctuation permits comma-chaining across clauses | Sentence-boundaries chapter — this is R2's #1 payoff item and this group is its largest constituency. Give the three repairs: full stop, semicolon, joining word |
| C11 | *My sister, he is a nurse* | Spoken Chinese *tā* is gender-neutral | Same as S3 |
| C12 | *I yesterday evening went to the shop* | Chinese places time and place before the verb | Adverbs chapter: English puts time and place after the verb phrase, or at the front of the sentence, but not between subject and verb |
| C13 | Passive avoided | The Chinese *bèi* passive carries an adversative flavour, so it is used less and feels marked | The passive chapter's "why you need this" line: in a process description, nearly every sentence uses it |
| C14 | *You are coming?* | Question particle *ma*, no movement | Same as T4 |

### 12.7 Spanish

Romance; pro-drop; SVO but with flexible order; grammatical gender; adjectives after nouns; no
*do*-support; negative concord; the present tense used for duration with *desde hace*; a large
false-friend inventory with English. Several items below are widely reported by teachers but not, as
far as I can verify, quantified in a peer-reviewed corpus study; they are marked **[practitioner]**.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| E1 | *Is very interesting* / *Is raining* | Spanish drops subject pronouns because the verb ending identifies the subject | The *it*/*there* chapter, exactly as A5. This is the same error from a different cause and one section serves both |
| E2 | *The people are worried about the pollution* (meaning people in general) | Spanish uses the definite article for generic reference | Same as A2 |
| E3 | *I have 25 years* / *I have hunger* | Spanish uses *tener* ("have") for age and physical states | The *be* chapter: English uses *be* for age, hunger, cold, fear: *I am 25.* *I am hungry.* |
| E4 | *You like it?* / *I no like it* | Spanish has no *do*-support and negates with a single preverbal particle | The questions and negatives chapters, with the *do/does/did* frame as a slot picture |
| E5 | *I don't know nothing* | Spanish requires negative concord | Negatives chapter: *"English uses one negative word per clause."* Two repairs shown: *I don't know anything* / *I know nothing* |
| E6 | *I live here since 2019* | Spanish present tense + *desde* | Same as H2 — the same section serves Hindi, Sinhala, Tamil, Spanish and Russian, which is why it deserves its own heading |
| E7 | *differents ideas* / *a car red* | Spanish adjectives inflect for number and follow the noun | Adjectives chapter: English adjectives never take *-s*, and they go before the noun |
| E8 | *Explain me the rule* | Spanish *explicar* takes an indirect object clitic | Verb-patterns chapter: the closed list of verbs that need *to* before the person — *explain, say, describe, suggest, mention, report, recommend* — contrasted with *tell, give, show, send*, which do not |
| E9 | *It depends of the weather* / *consist in* | Preposition mismatch with the Spanish verb | Prepositions chapter's verb+preposition list |
| E10 | *Actually I am studying medicine* (meaning "currently") | *actualmente* = "currently" | False-friends box in the vocabulary/register chapter. High-frequency set: *actually/actualmente, assist/asistir, realise/realizar, sensible/sensible, library/librería, carpet/carpeta, discuss/discutir, support/soportar, career/carrera, embarrassed/embarazada* |
| E11 | *I am agree* | Calque of *estoy de acuerdo* **[practitioner]** | Common-errors box in the *be* chapter: *agree* is a verb — *I agree* |
| E12 | *Before to go, check the times* | Spanish uses the infinitive after prepositions | Gerunds chapter: after a preposition, English uses the *-ing* form: *Before going…* |
| E13 | *I have finished it yesterday* | Spanish *pretérito perfecto* covers more ground than the English present perfect, and its coverage differs by region | Present perfect chapter, with a note that the Spanish form's range varies between Spain and Latin America |
| E14 | Long comma-spliced sentences | Spanish written style tolerates longer sentences | Sentence-boundaries chapter |
| E15 | *in the last years* | Calque of *en los últimos años* **[practitioner]** | Fixed-phrase box: *in recent years*, *over the past few years* |

### 12.8 Russian

Slavic; no articles; **no present-tense copula**; case marking rather than fixed word order; a
perfective/imperfective aspect system that does not map onto the English tense set; negative
concord; no *do*-support; no capitalisation of days, months, nationalities or languages. Corpus work
on Russian-speaking learners identifies article omission as the dominant error type, and a
longitudinal study finds copula acquisition genuinely difficult for this group though it improves
with exposure.

| # | Error | Why it happens | How the article pre-empts it |
|---|---|---|---|
| R1 | *She is student at university* | No articles in Russian; nothing occupies the slot | Same as T1. Because this is the single largest error category for this group, the articles chapter must be early, complete, and linked from everywhere |
| R2 | *He doctor* / *She very clever* | Russian present-tense sentences have no copula | Same as A1 |
| R3 | *I was reading this book and I read it* — aspect mapped wrongly | Russian encodes completion in the verb stem, not in the tense; learners map *perfective→past simple, imperfective→continuous* and it half-works | The tense-overview paradigm article should carry a short note: *"If your language marks whether an action was completed, do not map it directly. English marks* when *on the verb and* how it is spread out *separately."* Then the comparison chapters do the work |
| R4 | *Yesterday came to us a delegation* | Russian word order is free because case marks the roles | Chapter 1's slot picture, plus the cleft/*there*-sentence chapter for the cases where English *does* let you delay the subject |
| R5 | *I didn't see nobody* | Russian requires negative concord | Same as E5 |
| R6 | *You like coffee?* | No *do*-support in Russian | Same as E4 |
| R7 | *on the picture*, *in the university*, *in Monday* | Russian preposition–noun pairings differ | Prepositions chapter, with the time/place tables and the *in/on/at* decision picture |
| R8 | *He gave me many advices* / *informations* | Russian equivalents are countable | Countability chapter's uncountable list: *advice, information, research, equipment, furniture, luggage, knowledge, progress, evidence, work* — with the counting phrases: *a piece of advice*, *two pieces of research* |
| R9 | *in january*, *he speaks russian* | Russian does not capitalise these | Same as A9 |
| R10 | *the brother of my friend* | Russian genitive maps to *of* | Possessives chapter: for people, English strongly prefers *'s* — *my friend's brother* |
| R11 | *He said he is tired* | Russian does not backshift in reported speech | Reported speech chapter. **Careful:** English backshift is optional when the state still holds, so this is a *soft* error. Say precisely: *"Both are possible when it is still true. Backshift is safer in formal writing, and required when the situation has changed."* |
| R12 | *I am agree*, *I feel myself bad* **[practitioner]** | Calques of reflexive constructions | Common-errors box |
| R13 | *very* used where English needs a different intensifier | Russian *очень* is broader | Register/collocation chapter |

### 12.9 The shared pre-emption plan

The seven groups converge on a small number of high-frequency errors. Rather than scattering L1
boxes, put the weight in these chapters and make them excellent:

| Chapter | Serves | What it must do |
|---|---|---|
| **Articles: *a*, *an*, *the*, or nothing** | Ta, Si, Hi, Ar, Zh, Ru (6/7) | Complete decision procedure; generic reference section; the "your language does this differently" framing; the closed list of no-article contexts |
| **Every English sentence needs a subject and a verb** | Ar, Es, Ru, Si, Zh | Copula requirement; dummy *it*/*there*; the fragment test |
| **Is the time period finished?** (present perfect vs past simple) | all 7 | Comparison chapter; the finished-time question; the *since/for* section; the *already/yet/just* myth |
| **Saying how long: *since*, *for*, and which tense** | Ta, Si, Hi, Ar, Es, Ru | The *I am living here since 2019* error, named for what it is, with the repair |
| **Asking questions — and asking inside a sentence** | all 7 | Inversion in direct questions; **no inversion** in embedded questions; the wh-subject exception (*Who broke it?* — no *did*) |
| **How many, how much: countable and uncountable** | all 7 | The uncountable list; counting phrases; *many/much/a few/a little* |
| **Where one sentence ends and the next begins** | Ar, Zh, Es | Comma splice, run-on, fragment; the three repairs. R2's #1 payoff item |
| **Which one? Clauses that describe a noun** | Ta, Si, Hi, Ar, Zh | Resumptive pronoun deletion; clause order; *who/which/that* |
| **Prepositions: the ones that are decided for you** | all 7 | Verb+preposition list; the "no preposition needed" list; time/place tables |

### 12.10 The L1 box specification

```jsonc
"l1_notes": [
  {
    "lang": "ta",                       // ISO 639-1; closed set: ta si hi ar zh es ru (+ more later)
    "mechanism": "Tamil shows 'which one' through case and word order, not through a separate word.",
    "wrong": "I bought book yesterday.",
    "right": "I bought a book yesterday.",
    "fix": "Put a small word in front of every singular countable noun.",
    "shared_with": ["si", "hi", "zh", "ru"]      // so the UI can say 'and four other languages'
  }
]
```

| # | Rule |
|---|---|
| T-L1-6 | ≤ 45 words total per note; exactly one wrong→right pair |
| T-L1-7 | `mechanism` describes the **L1's system**, neutrally, and never says the L1 "lacks" something it merely marks elsewhere |
| T-L1-8 | Boxes render **after** the rule and its examples, never before — the article teaches English first |
| T-L1-9 | A chapter carries at most 3 L1 boxes. More than 3 means the content belongs in the shared chapter (§12.9), not in per-language notes |
| T-L1-10 | `shared_with` exists so we can tell the learner they are in good company. *"This is one of the most common errors for speakers of five of the languages we cover"* removes shame, which is the thing that stops learners re-reading their own writing |

---

## 13. Navigating the Theory tab

### 13.1 What each mode needs

| Mode (§2.1) | Needs | Surface |
|---|---|---|
| A — look-up | fast text matching on *their* words, including malformed ones | Search, with an alias index |
| B — read-through | an authored order with visible position and an end | "Start here" path |
| C — orientation | a whole-map view that fits on one screen | The Map (tab root) |
| D — verification | a deep link straight to the adjudicating section | `fixes_errors[]` resolution from feedback |
| — | re-consultation of a table seen once | Tables index |
| — | "I want to say X" | Intent index |
| — | "what does this word mean?" | Glossary |

Seven surfaces. That sounds like a lot; four of them are indexes over the same content and cost
almost nothing once the articles carry the right metadata.

### 13.2 The recommended information architecture

```
THEORY  (tab root = "The Map")
│
├── [ Start here — 12 chapters · about 45 minutes ]        ← single primary button
│
├── The Map                                                ← the default view, ONE screen
│     Part 1  How an English sentence is built        (6)
│     Part 2  Talking about time                     (11)
│     Part 3  Saying how sure, how necessary          (5)
│     Part 4  Questions and negatives                 (5)
│     Part 5  Nouns: how many, which one              (7)
│     Part 6  Putting the important thing first       (3)
│     Part 7  Joining ideas into one sentence         (9)
│     Part 8  If, and things that are not true        (6)
│     Part 9  Describing and comparing                (6)
│     Part 10 Making a text hold together             (5)
│     Part 11 Choosing between two forms             (14)   ← the comparison chapters
│     Part 12 Tables, myths and variation             (7)
│
├── 🔍 Search                                              ← persistent, top of every screen
├── ≡  All chapters (A–Z)                                  ← flat alphabetical list
├── 💬 I want to say…                                      ← intent index
├── ▦  Tables                                              ← every paradigm, one tap
├── ⇄  X or Y?                                             ← every comparison, one tap
└── 📖 Word list                                           ← glossary of every ledger term
```

**Justification, surface by surface.**

**The Map is the default view, and it must fit on one screen.** Mode C is the first thing that
happens and it decides whether the learner ever comes back. Twelve parts with counts is scannable in
five seconds and answers "how big is this". Seventy chapter titles is not, and it answers nothing.
Tapping a part expands it in place; it does not navigate away, because a beginner who navigates
three levels deep loses the map.

**"Start here" is a single primary button, above the map.** This is the direct answer to the owner's
user. It is an **authored ordered list**, not the first twelve chapters of part 1, because the right
first twelve span parts 1, 2, 4 and 5. It shows position (*"3 of 12"*), an honest total time, and it
ends — with a screen that says *"That is the foundation. Here is what to read next, and here is what
to practise."* A path with no end is a treadmill.

**Search is persistent and is the most important surface.** §13.5 specifies it.

**"All chapters (A–Z)"** exists for the learner who knows the name of the thing. It is cheap and
some people only navigate this way.

**"I want to say…" is the surface that no competitor does well** and the one that fits our audience
best. It is a functional index: the learner picks what they want to *do*, and gets chapters. §13.6.

**"Tables" and "X or Y?"** are filtered views over `kind: paradigm` and `kind: comparison`. They are
free to build and they are the two things learners re-consult. Making the comparison chapters
first-class navigation is the structural expression of the owner's central ask.

**"Word list"** is the glossary. It must be reachable from anywhere, because a reader who arrives at
chapter 40 by search has skipped the ledger.

### 13.3 The chapter list, concretely

A proposed mapping onto the practice module's 17 units, so the two modules can cross-link without a
translation table. Chapter counts are targets for the design agent, not commitments; the *shape* is
the recommendation. Total ≈ 84 articles, of which ~14 are comparisons and ~7 are paradigms.

| Part | Title (learner-facing) | Chapters | Maps to units | Notes |
|---|---|---|---|---|
| 1 | How an English sentence is built | 6 | u01 | The foundation. Subject, verb, object; *be*; word order; what a clause is; fragments; punctuation basics |
| 2 | Talking about time | 11 | u02, u03, u04, u06 | Present simple, present continuous, past simple, past continuous, present perfect, present perfect continuous, past perfect, futures (×3), the big tense table |
| 3 | Saying how sure, how necessary, how allowed | 5 | u07 | Certainty; obligation; permission; ability; past modals (*should have*) |
| 4 | Questions and negatives | 5 | u01, u15 | Yes/no; wh-; wh-subject questions; embedded questions; negatives and tags |
| 5 | Nouns: how many, which one | 7 | u05 | Countable/uncountable; plurals; articles ×2; quantifiers; possessives; pronouns |
| 6 | Putting the important thing first | 3 | u08 | The passive; when to choose it; the passive across tenses |
| 7 | Joining ideas into one sentence | 9 | u09, u11, u12, u13 | Coordination; subordination; relative clauses ×2; reported speech ×2; verb + *-ing*/*to*; noun clauses; sentence boundaries |
| 8 | If, and things that are not true | 6 | u10 | The two systems (real/unreal); zero/first; second; third; mixed; *wish* and *if only* |
| 9 | Describing and comparing | 6 | u14 | Adjectives and order; adverbs and position; comparatives; superlatives; describing change; prepositions |
| 10 | Making a text hold together | 5 | u16 | Linking words; reference words; paragraph shape; register; punctuation |
| 11 | **Choosing between two forms** | 14 | across | The comparison chapters. One per confusion set from the practice module's `confusion_set` values |
| 12 | Tables, myths and variation | 7 | u17 + cross | The 12-tense table; irregular verbs; modals at a glance; verb patterns; British vs American; myths; the high-risk structures and when not to use them |

**Part 11 deserves comment.** It is the largest part after part 2 and it is the one the owner asked
for twice. Its chapters are generated one-per-`confusion_set`, so they align exactly with the
practice module's contrast boards (F6) and can share the `worked_pairs` data. That is the cheapest
high-value integration available in this push.

**Part 12's final chapter — "the high-risk structures and when not to use them"** — is the theory
counterpart of `risk_tier: C` and `error_surface`. A learner who has read on a prep site that
negative inversion impresses examiners needs somewhere honest to land. Say what it is, show it, and
say plainly that it costs more than it pays below band 7.

### 13.4 The "Start here" path

Twelve chapters, authored as an ordered list, drawn from parts 1, 2, 4 and 5. Proposed:

| # | Chapter | Why here |
|---|---|---|
| 1 | What a sentence is: who, does what, to what | Introduces subject, verb, object. Nothing works without it |
| 2 | The verb *be* | Pre-empts copula omission for four L1 groups on day one |
| 3 | Nouns, and the little word in front of them | Articles, early, because it is the #1 error for six of seven groups |
| 4 | One or more than one | Plurals, countability |
| 5 | Talking about now: two ways | Present simple vs present continuous — the first comparison, deliberately early |
| 6 | Talking about the past | Past simple, regular and irregular; the three forms |
| 7 | Helping verbs: *be*, *do*, *have* | The machinery all questions and negatives depend on |
| 8 | Asking a question | Inversion, *do*-support, wh-words, the wh-subject exception |
| 9 | Saying no | Negatives, one-negative rule, tags |
| 10 | Talking about the future: three ways | The second comparison |
| 11 | Joining two ideas | *and, but, because, although*; what a clause is; where a sentence ends |
| 12 | Where to go next | The map again, with three recommended routes by goal |

**Chapter 12 is not filler.** A path that ends without a next step wastes the reader's momentum. It
offers three routes — *"I want to write better essays"* → parts 6, 7, 10; *"I want to speak more
naturally"* → parts 3, 4, 9; *"I keep making the same mistakes"* → the diagnostic, which routes into
practice.

**Progress display:** a plain "3 of 12" and a thin bar. No streaks, no badges, no "you're on fire".
Claim 18.

### 13.5 Search — the surface most references get wrong

Learners search with the words they have, which are usually not the words we have. Search must index
**eight fields**, not one:

| # | Indexed | Example query it serves |
|---|---|---|
| 1 | Chapter titles and headings | *"present perfect"* |
| 2 | Ledger terms **and their plain glosses** | *"third form"* → past participle |
| 3 | **Every example sentence, in full** | *"have been"*, *"I have worked"* |
| 4 | **`wrong` strings from error tables** | *"I have finished yesterday"* → lands on the exact error row |
| 5 | Myth statements in their real wording | *"start a sentence with because"* |
| 6 | `fixes_errors[]` slugs and their learner-facing names | from a feedback deep link |
| 7 | The **alias table** (authored) | *"conditions"* → conditionals; *"WH questions"* → wh-questions |
| 8 | Intent phrases (§13.6) | *"how to be polite"* |

**Field 4 is the one nobody builds and it is the highest-value one.** A learner who types the
sentence they are worried about should land on the error row that names it. This is mode D served
directly.

**The alias table** is authored data, not stemming. Required entries at minimum:

| Learner's word | Maps to |
|---|---|
| conditions, if sentences, if clauses | conditionals |
| WH questions, question words | wh-questions |
| V1 V2 V3, first/second/third form, base form | the three forms of a verb |
| ing form, continuous, progressive | continuous |
| helping verb, auxiliary | auxiliary verbs |
| a an the, articles, determiners | articles |
| passive voice, active voice, voice | the passive |
| reported speech, indirect speech, narration | reported speech |
| tenses, tense chart, all tenses | the twelve-form table |
| linkers, linking words, connectors, cohesive devices | linking words |
| phrasal verbs | verb + particle |
| gerund, infinitive, to+verb, ing after verb | verb patterns |
| direct speech, quotation | reported speech |
| subject verb agreement, concord | agreement |
| punctuation, comma, full stop, period | punctuation |
| relative pronouns, who which that | relative clauses |

**Search result rows must show the short answer**, not a snippet of body prose. A mode-A reader
should often be able to stop at the results screen. That is a success, not a bounce.

**Empty-result behaviour:** never a dead end. Offer the three nearest chapters by part, plus *"Ask
this in your own words"* → the intent index.

### 13.6 The intent index — "I want to say…"

Roughly 40–60 authored entries. Each maps a communicative intent, in learner language, to 1–3
chapters. This is the surface that serves someone who does not know that what they want is called
"the second conditional".

| I want to… | Chapters |
|---|---|
| …talk about something that happened before now and still matters | Present perfect; Present perfect or past simple? |
| …say how long I have been doing something | *Since* and *for*; Present perfect continuous |
| …talk about tomorrow | The three futures; *will* or *going to*? |
| …imagine something that is not true | Second conditional; The unreal past |
| …talk about a regret | Third conditional; *should have* |
| …be polite when I ask for something | Modals for requests; Register |
| …say something is not certain | Modals of certainty; Hedging |
| …describe a process | The passive; Sequencing words |
| …describe a graph or a trend | Describing change; Comparatives |
| …give my opinion without saying "I think" every time | Register; Hedging; Noun clauses |
| …join two short sentences | Coordination; Subordination; Relative clauses |
| …avoid repeating the same word | Reference words; Substitution |
| …ask a question inside a sentence | Embedded questions |
| …say what someone told me | Reported speech |
| …compare two things | Comparatives; *as … as* |
| …talk about rules and things I must do | Obligation modals |
| …sound less certain on purpose | Hedging; Modals |
| …stop writing very long sentences | Where a sentence ends |
| …stop making the same mistake | The diagnostic → practice |

### 13.7 Cross-reference rules

| # | Rule |
|---|---|
| T-NAV-1 | Every cross-reference states **why** to follow it: *"For the full list of irregular verbs, see [X]"*, never *"see [X]"* |
| T-NAV-2 | ≤ 5 inline cross-references per article. More means the article is not self-contained |
| T-NAV-3 | Never a bare "see above" or "see below" — anchors, or restate |
| T-NAV-4 | Every article ends with 2–4 "Related", each with a one-clause reason |
| T-NAV-5 | Forward references (to a chapter later in the ledger) are allowed but must carry the plain gloss inline, so the reader is not forced to leave |

### 13.8 Read-state, bookmarks and the absence of gamification

| Element | Ship? | Why |
|---|---|---|
| Read/unread tick per chapter | **yes** | Orientation. Cheap. Answers "have I seen this?" |
| "3 of 12" on the Start-here path | **yes** | The path needs an end and a position |
| Bookmarks / "save for later" | **yes** | Directly serves re-consultation, which is the dominant mode |
| Recently viewed (last 5) | **yes** | Learners return to the same three chapters; make it one tap |
| Streaks, XP, badges, leagues | **no** | `docs/plan/10-curriculum-progress.md` §9. Reading is a lookup, not an achievement |
| A percentage-read figure | **no** | Implies the goal is to read everything. It is not |
| Locked chapters | **no** | §1 |
| Quizzes at chapter end | **no** | T-BOUND-1 |

### 13.9 Layout notes

- **Mobile is the design target**; desktop gets a persistent left-hand chapter tree and the article
  in a max-width column. Do not let the article run the full width of a laptop — line length above
  ~90 characters measurably hurts scanning, and our reader is decoding.
- **Sticky in-article contents** on desktop; a collapsed "in this chapter" list at the top on mobile.
  This is what makes the layer-cake pattern usable.
- **Tables scroll inside their own container**, never the page (T-TAB-7).
- **Term chips** are tappable inline, opening a small sheet with the gloss and a link to the chapter
  that introduces the term. This is the mechanism that makes every page page one.
- **Offline-first**: everything ships in the pack. No network calls, no remote fonts, no external
  images. Diagrams are declared as data and drawn by the renderer (`visual.spec`), never shipped as
  images — same rule as the practice module.
- **Text size and contrast** are user-controlled and the layout must survive 200% text. Our readers
  read slowly and many will size up.

---

## 14. The quality gate — lints for the verify agent

Collected from above, in the order they are cheapest to run.

| ID | Check |
|---|---|
| T-BOUND-1 | No article contains an answerable question |
| T-BOUND-2 | No practice point contains a full paradigm table |
| T-BOUND-3 | No example sentence appears in both an article and a practice item |
| T-LEN-1..6 | Length, heading density, paragraph size, first-example position, collapsed ratio |
| T-TERM-1 | No ledger term used above its position |
| T-TERM-2 | Glosses match the ledger verbatim |
| T-TERM-3 | Every ledger term has a glossary entry; every first use is chipped |
| T-TERM-4 | No metalanguage term outside the ledger |
| T-TERM-5 | Each term introduced in exactly one article |
| M1..M10 | Sentence length, clause count, paragraph size, passive ratio, nominalisation rate, vocabulary ceiling, prose level |
| T-HEAD-1..2 | Headings are statements or questions; ≤ 2 levels |
| T-EX-1..12 | Minimal-pair integrity; example counts; register coverage; "so what" lines; controlled variation; length; no sharing |
| T-TAB-1..11 | Table shape, cell length, caption, column order, row-reads-aloud, adjacency, scrolling, no abbreviations, labelled gaps, weight markers, negatives and questions present |
| T-VAR-1..3 | Variation labelled, defaulted, never presented as error |
| T-MYTH-1..2 | Myth stated in real wording; no ridicule |
| T-L1-1..10 | Mechanism framing, length, one pair, placement, ≤ 3 per chapter |
| T-LINK-1..3 | Article→point, point→article, shared error taxonomy |
| T-NAV-1..5 | Cross-reference discipline |
| Copyright | No banned sentence; no familiar example; no real institution, statistic or researcher; no band-descriptor prose; no banned claim from `staging-grammar/DESIGN.md` §0.2 |

**Two lints deserve special attention because they cannot be automated fully and must be a human or
model review pass:**

- **The "page one" check.** Open the article cold, with no context. Is every term glossed? Is the
  short answer enough for a mode-A reader? Would a beginner who arrived here by search leave with
  something correct?
- **The familiarity check.** Read every example sentence and ask: have I seen this before? This is
  the copyright defence and it cannot be run by a script.

---

## 15. Open questions for the design agent

1. **Storage.** Does `theory_articles` become a fourth pack table (`ROW_SCHEMAS` + `DATA_FILES` +
   `TABLE_COLUMNS` + `IMPORT_ORDER`, per `staging-grammar/DESIGN.md` §0.3), or do articles ship as
   Markdown assets under `media/`? Recommendation: **a table with a single `article_json` blob**,
   for the same reason the grammar module made that choice — extra top-level keys are silently
   dropped at import, and we need `fixes_errors[]`, `point_ids[]` and `term_refs[]` to be queryable.
2. **Rich text.** How is article body markup represented? Recommendation: **a small closed block
   schema** (`paragraph`, `heading`, `example_set`, `table`, `visual`, `callout`, `myth`, `errors`,
   `l1_notes`, `collapse`, `links`) rather than free Markdown, so the lints in §14 can run over
   structure rather than over a string, and so the renderer can implement term chips and marking
   without parsing.
3. **The term ledger's home.** Sidecar constant, like `UNIT_TITLES` in
   `bandready/grammar/syllabus.py`, or pack data? Recommendation: **pack data**, because it is
   content and it will change as chapters are authored, with a sidecar lint that reads it.
4. **Does the intent index get its own table** or is it derived from an `intents[]` field on each
   article? Recommendation: derived — one source of truth per article.
5. **Search implementation.** Full-text over eight fields, offline, in a desktop app. Is this SQLite
   FTS5, or an in-memory index built at load? The `wrong`-string index (§13.5 field 4) needs
   tolerant matching, which FTS5 does not give for free.
6. **How many articles do we actually ship in push one?** ~84 is the full map. A defensible first
   push is **parts 1, 2, 4, 5 and 11 (≈ 43 articles)** — the foundation, time, questions, nouns and
   all the comparisons — which covers every one of the shared pre-emptions in §12.9 and the owner's
   named list (tenses, WH questions, conditions is part 8, so add part 8 → ≈ 49).
7. **Does the L1 setting come from the profile or from a Theory-tab preference?** Recommendation:
   profile, asked once, skippable, changeable, and never used for anything except L1 boxes.
8. **Do comparison chapters share `worked_pairs` data with the practice module's contrast boards
   (F6), or duplicate it?** Recommendation: share, with the article as the display surface and the
   board as the drill surface. Duplication will drift.
9. **What happens to `staging-grammar/DESIGN.md` §0.5 row 10?** It should be amended in that
   document to point here, so a future reader does not conclude the reference section was forbidden.

---

## Sources

**Reading behaviour, scanning, and reference-document design**
- [How Users Read on the Web — Nielsen Norman Group](https://www.nngroup.com/articles/how-users-read-on-the-web/)
- [F-Shaped Pattern For Reading Web Content (original eyetracking research) — NN/g](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/)
- [F-Shaped Pattern of Reading on the Web: Misunderstood, But Still Relevant — NN/g](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)
- [The Layer-Cake Pattern of Scanning Content on the Web — NN/g](https://www.nngroup.com/articles/layer-cake-pattern-scanning/)
- [Text Scanning Patterns: Eyetracking Evidence — NN/g](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/)
- [Scanning Patterns on the Web Are Optimized for the Current Task — NN/g](https://www.nngroup.com/articles/eyetracking-tasks-efficient-scanning/)
- [Paradox of the Active User — NN/g](https://www.nngroup.com/articles/paradox-of-the-active-user/)
- [Carroll & Rosson, *Paradox of the Active User* (original chapter, PDF)](https://research.cs.vt.edu/ns/cs5724papers/4.mental.mental.carroll.paradox.pdf)
- [John Carroll's *The Nurnberg Funnel* and minimalist documentation (overview)](https://www.academia.edu/32432164/John_Carrolls_The_Nurnberg_Funnel_and_minimalist_documentation)
- [Mark Baker, *Every Page is Page One* — the book](https://everypageispageone.com/the-book/)
- [Every Page is Page One: Topic-Based Authoring for Tech Comm — TechWhirl](https://techwhirl.com/every-page-page-one-topic-based-authoring-tech-comm-web/)
- [*Every Page is Page One* — XML Press](https://xmlpress.net/publications/eppo/)

**Plain language and readability**
- [Federal Plain Language Guidelines (PDF)](https://wid.org/wp-content/uploads/2022/03/FederalPLGuidelines.pdf)
- [NIH — Plain Language: Getting Started or Brushing Up (PDF)](https://www.nih.gov/sites/default/files/2025-02/nih-plain-language-getting-started-brushing-up.pdf)
- [CDC — Plain Language Materials & Resources](https://www.cdc.gov/health-literacy/php/develop-materials/plain-language.html)
- [Readability Guidelines — Sentence length](http://readabilityguidelines.wikidot.com/sentence-length)

**Cognitive load, worked examples, split attention**
- [The Split-Attention Effect — Springer (chapter)](https://link.springer.com/chapter/10.1007/978-1-4419-8126-4_9)
- [Split attention effect — overview](https://en.wikipedia.org/wiki/Split_attention_effect)
- [Cognitive Load Theory and Instructional Design (PDF)](https://www.uky.edu/~gmswan3/544/Cognitive_Load_&_ID.pdf)
- [Cognitive load theory: research that teachers really need to understand — NSW CESE (PDF)](https://education.nsw.gov.au/content/dam/main-education/about-us/educational-data/cese/2017-cognitive-load-theory.pdf)
- [Cognitive Architecture and Instructional Design: 20 Years Later — Educational Psychology Review](https://link.springer.com/article/10.1007/s10648-019-09465-5)

**Reference consultation and look-up behaviour (dictionary literature)**
- [Nesi, *Assessing dictionary skills* — Lexicography](https://link.springer.com/article/10.1007/s40607-015-0019-2)
- [The Dictionary Look-up Behavior of Hong Kong Students: A Large-Scale Survey](https://www.researchgate.net/publication/234770445_The_Dictionary_Look-up_Behavior_of_Hong_Kong_Students_A_Large-Scale_Survey)
- [Application of Eye-Tracking in EFL Learners' Dictionary Look-Up Process Research](https://www.researchgate.net/publication/273857123_Application_Of_Eye-Tracking_In_Efl_Learners'_Dictionary_Look-Up_Process_Research)

**First-language interference — the canonical reference**
- [Swan & Smith (eds.), *Learner English: A Teacher's Guide to Interference and Other Problems*, Cambridge — SSLA review](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/learner-english-a-teachers-guide-to-interference-and-other-problems-michael-swan-and-bernard-smith-eds-new-york-cambridge-university-press-1987-pp-xv-265/B3FC4A69B69DF30D63CB8FFEA634FED3)
- [*Learner English* — Internet Archive record](https://archive.org/details/learnerenglishte00swan)

**Tamil**
- [The Influence of L1 (Tamil) in the Writing of L2 (English)](https://www.researchgate.net/publication/344840512_THE_INFLUENCE_OF_L1_TAMIL_LANGUAGE_IN_THE_WRITING_OF_L2_ENGLISH)
- [Word Order in English and Tamil, with orientation to Translation](https://www.academia.edu/34584307/Word_Order_in_English_and_Tamil_with_orientation_to_Translation)
- [Dravidian languages — grammatical features (Britannica)](https://www.britannica.com/topic/Dravidian-languages/Grammatical-features-and-changes)
- [Phonological Interference in Learning English through Tamil (PDF)](https://www.languageinindia.com/july2018/shanmugamtamilphonologicalinterference.pdf)

**Sinhala**
- [An Analysis of Errors in English Writing of Sinhala Speaking Undergraduates](https://www.researchgate.net/publication/266608376_An_Analysis_of_Errors_in_English_Writing_of_Sinhala_Speaking_Undergraduates)
- [Two Aspects of English Syntax That Trouble Adult Sinhala Learners (tenses and complex sentences)](https://www.academia.edu/30679808/TWO_ASPECTS_OF_ENGLISH_SYNTAX_THAT_TROUBLE_ADULT_SINHALA_LEARNERS_WHEN_ACQUIRING_ENGLISH_AS_A_SECOND_LANGUAGE_A_Comparative_Study_on_Tenses_and_Complex_Sentences_in_English_and_Sinhala)
- [An Investigation into the Reasons for the Grammatical Errors Made by Junior Secondary Level Second Language Learners in English Writing — HLT Magazine](https://www.hltmag.co.uk/aug23/an-investigation-into-the-reasons)

**Arabic**
- [Definiteness at the syntax–semantics interface: English articles by Kuwaiti Arabic speakers in relative clause contexts — Language Testing in Asia](https://languagetestingasia.springeropen.com/articles/10.1186/s40468-025-00351-2)
- [The Acquisition of English Restrictive Relative Clauses by Arab Adult EFL Learners — Advances in Language and Literary Studies](https://journals.aiac.org.au/index.php/alls/article/view/1986)
- [Negative Transfer: Arabic Language Interference (PDF, Arab World English Journal)](https://awej.org/images/AllIssues/Specialissues/Translation4/17.pdf)

**Chinese**
- [A Corpus-based Study of the Misuse of Tenses (PDF, ERIC)](https://files.eric.ed.gov/fulltext/EJ1081034.pdf)
- [An Analysis of Errors in English Writing Made by Chinese Students (PDF)](https://www.academypublication.com/issues/past/tpls/vol03/08/06.pdf)
- [Ungrammatical Patterns in Chinese EFL Learners' Free Writing (PDF)](https://pdfs.semanticscholar.org/0ba2/a36510ce3a9c9ef5f3db1aebef53fdc985d8.pdf)
- [YACLC: A Chinese Learner Corpus with Multidimensional Annotation (arXiv)](https://arxiv.org/pdf/2112.15043)

**Russian**
- [Corpus-based evidence of article omissions by Russian-speaking English learners](https://www.researchgate.net/publication/342960793_Corpus-based_evidence_of_article_omissions_by_Russian_speaking_English_learners_A_new_pedagogical_list)
- [The acquisition of the copula *be* in present simple tense in English by native speakers of Russian — System](https://www.sciencedirect.com/science/article/abs/pii/S0346251X12000322)
- [Errors in foreign language acquisition as a multifaceted phenomenon: the case of Russian aspect — Russian Linguistics](https://link.springer.com/article/10.1007/s11185-023-09287-8)
- [RILEC: Detection and Generation of L1 Russian Interference Errors in English Learner Texts (arXiv)](https://arxiv.org/pdf/2603.07366)

**Spanish** *(the strongest sources here are practitioner-level; treat the marked items as hypotheses)*
- [Common Grammar Errors Made by Spanish Students of English — TALK](https://blog.talk.edu/grammar/common-grammar-errors-made-by-spanish-students-of-english/)
- [10 common Spanish speaker mistakes — engVid](https://www.engvid.com/10-spanish-speaker-mistakes/)
- [The Most Common Mistakes in English for Spanish Speakers — Leonardo English](https://www.leonardoenglish.com/blog/the-most-common-mistakes-in-english-for-spanish-speakers)

**Usage myths and variation**
- [*Split infinitive* — Merriam-Webster](https://www.merriam-webster.com/dictionary/split%20infinitive)
- [Merriam-Webster on ending a sentence with a preposition — CBC coverage](https://www.cbc.ca/radio/asithappens/sentence-preposition-webster-1.7127397)
- [Five Grammar Myths Debunked — BriefCatch](https://blog.briefcatch.com/bc/articles/five-grammar-myths-debunked)
- [Most of What You Think You Know About Grammar Is Wrong — Smithsonian](https://www.smithsonianmag.com/arts-culture/most-of-what-you-think-you-know-about-grammar-is-wrong-4047445/)
- [How awkwardly to avoid split infinitives — Stan Carey](https://stancarey.wordpress.com/2012/07/11/how-awkwardly-to-avoid-split-infinitives/)

**Internal (read, not summarised from memory)**
- `content/core-en/staging-grammar/DESIGN.md` §0.1–0.5, §1.1–1.11, §2.1–2.6
- `content/core-en/staging-grammar/research/04-practice-pedagogy.md` (§0 claims, §2 stages, §3 contrast engine, §6 feedback, §10 feature list)
- `sidecar/bandready/grammar/syllabus.py` — `UNIT_TITLES`, `UNIT_TRACKS`, `PREREQ_STAGE`, `Point`
- `content/core-en/staging-grammar/content/*.json` — authored `teach` blocks

---

*This module is not affiliated with, endorsed by, or connected to IELTS, the British Council, IDP
Education, or Cambridge Assessment English. All explanations and example sentences described here
are original and must be authored originally.*
