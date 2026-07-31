# GV-R4 — Practice pedagogy: how grammar is actually learned, and what that has to look like on screen

**Scope.** How grammar and vocabulary are effectively taught and practised; the controlled→free
progression; how to teach *when to use which*; the exercise catalogue with grading routes; how to
grade free production fairly; feedback that changes behaviour; session shape; motivation; and the
bridge back to the four skills. Ends in a ranked feature wishlist with concrete on-screen behaviour.

**Audience.** The design agent writing `DESIGN.md` for the grammar module, the content agents
writing items, and the verify agent wiring `validate.py` / `loader.py`.

**Read alongside:** `content/core-en/staging/DESIGN.md` §7 (speaking features),
`content/core-en/staging-reading/DESIGN.md` §10 (reading features) — this document deliberately
mirrors their shape so the three modules argue from the same premises.

---

## 0. The eleven claims this briefing commits to

Everything below follows from these. If the design agent disagrees with one, say so explicitly and
say what replaces it — do not silently drop it.

1. **Grammar is a form–meaning mapping, not a form.** A learner who can conjugate the present
   perfect and cannot say when to reach for it has learned nothing usable. Every unit is therefore
   organised around a *choice*, not a paradigm.
2. **Interpretation comes before production.** The learner must be able to hear the difference the
   form makes before being asked to make it. This is the single strongest structural finding
   available to us (VanPatten's processing instruction — structured input beats output-first
   practice on form–meaning connection).
3. **Rules are cheap; proceduralization is the work.** DeKeyser's skill-acquisition account
   (declarative → procedural → automatic) is the right mental model, and his 1997 finding that
   proceduralization was essentially complete after the *first* 16-item practice block sets our item
   budget: ~15–20 controlled items per structure per sitting, then stop. Grinding item 40 buys
   speed, not knowledge.
4. **Block first, interleave later.** Interleaving improves tense discrimination, but Hwang's 2025
   *Undesirable Difficulty of Interleaved Practice* shows lower-achieving learners need an initial
   blocked run to build declarative knowledge before interleaving pays. Within a unit: blocked.
   Across sessions and in review: interleaved. This is a scheduling rule, not a preference.
5. **Spacing is what makes it stick, and longer is better for delayed recall.** Kim & Webb's 2022
   meta-analysis (48 experiments, 3,411 participants) found a medium-to-large spacing effect, with
   longer spacing outperforming shorter on delayed post-tests and *equal spacing statistically
   equivalent to expanding*. We already own an FSRS scheduler that does exactly this. Use it for
   grammar; do not invent a second algorithm.
6. **Output is where the gap gets noticed.** Swain's point stands: producing the language is what
   forces the learner to discover that they do not actually know the form. A unit that never pushes
   production has taught a fact, not a skill.
7. **Prompting beats telling.** Lyster & Ranta found ~70% of teacher recasts went unnoticed by
   learners; Lyster & Saito's meta-analysis found prompts, recasts and explicit correction all
   effective, with prompts uniquely good at eliciting learner-generated repair. On screen: signal
   the problem, make them fix it, *then* show the answer. Never show the answer first.
8. **Focused feedback beats scattergun feedback.** The written-CF literature (Bitchener & Knoch,
   Ferris) is consistent that feedback focused on one targeted structure outperforms unfocused
   feedback, especially for weaker learners. Our grader must therefore ignore unrelated errors in a
   free-production answer, by instruction, not by luck.
9. **Feedback must answer three questions.** Hattie & Timperley: *Where am I going* (feed up) /
   *How am I going* (feed back) / *Where to next* (feed forward), at the task, process and
   self-regulation levels — never at the "self" level ("you're so good at this"). Every feedback
   panel in this module carries a feed-forward line.
10. **Grammar-in-context beats grammar-in-isolation for productive gain.** Sentence combining is
    the single best-evidenced grammar-adjacent writing intervention (Graham & Perin's *Writing Next*
    put it at effect size ~0.50; Hillocks reached the same conclusion decades earlier), while
    isolated traditional grammar drill shows near-zero transfer to writing quality. Every unit must
    terminate in something that looks like a real task.
11. **Motivation here is mastery-shaped, not streak-shaped.** `docs/plan/10-curriculum-progress.md`
    §9 already forbids loss-aversion mechanics, leagues and "your streak is about to die" copy. That
    constraint is binding on this module. Duolingo's streak numbers are real (a 14% D14 retention
    lift from streak wagers is reported) and we are still not doing it. What we do instead is §8.

---

## 1. What the existing engine already gives us

Read of `sidecar/bandready/srs/exercises.py` (603 lines) and `scheduler.py` (762 lines), in full.
This section is the constraint list the design agent must build against.

### 1.1 Reusable as-is

- **The exercise envelope.** `build_exercise()` returns
  `{"type", "prompt", "payload", "expected"}` — `payload` is everything the renderer needs,
  `expected` is a list of normalised accepted strings or `None` for "not auto-checked". This is a
  good, general contract. **Grammar items must use the identical envelope** so one renderer serves
  both banks and the review shell does not fork.
- **`grade_answer()`** compares `normalize_answer_text(answer)` against `expected` and returns
  `{checked, correct, close, suggested_rating, detail, expected}`. The rating it returns is an FSRS
  *default* the learner can override — that policy ("FSRS ratings stay learner-final") should hold
  for grammar too.
- **`normalize_answer_text()`** lowercases, strips accents, strips punctuation *except apostrophes
  and hyphens*, collapses whitespace. Apostrophe preservation is a gift for grammar: `don't`,
  `he's`, `I'd`, `would've` survive intact. **But it also means `dont` ≠ `don't`.** Every grammar
  item whose answer contains a contraction must list both spellings in `expected`. Make this a lint.
- **The FSRS core is card-shape-agnostic.** `create_card()`, `review()`, `preview_intervals()`,
  `card_from_row()`, `retrievability()`, `_maturity()` touch only attributes
  (`state/step/stability/difficulty/due_at/last_review_at/reps/lapses/fsrs_json`). Give a
  `grammar_cards` table the same columns and those five functions work unmodified.
- **`review(..., exercise_type=...)`** writes `srs_review_logs.review_type` as free text, so new
  grammar exercise kinds log without a schema change *on that column*.
- **`_interleave()` with `MAX_CONSECUTIVE_NEW = 3`** and `SESSION_CHUNK = 20` are exactly the
  ergonomics we want. Add one sibling rule (§7.3): `MAX_CONSECUTIVE_SAME_TYPE = 3`.
- **`eligible_types()` is already a controlled→free ladder.** New/learning → `flip` only;
  young (stability < 7d) → `cloze`/`collocation`; mature (≥ 7d) → `use_in_sentence` (free
  production) unlocks. That is the right shape. Grammar needs its own table with the same logic
  (§2.6).
- **`check_sentence()`** is the LLM free-production grader, with a temperature-0 JSON call, an
  offline degradation path that returns `checked: false` and lets the learner self-rate rather than
  raising, and a `{acceptable, issues[], better_version}` return shape. Keep all three properties.
  The *prompt* is vocab-shaped and must be replaced for grammar (§5).

### 1.2 Hard blockers the design agent must route around

- **`srs_cards.entry_id` is `ForeignKey("vocab_entries.id")` and `unique=True`.** A grammar card
  cannot be an `srs_cards` row. Options: (a) a parallel `grammar_cards` table with identical
  scheduling columns — recommended, keeps the vocab hot query untouched; (b) a polymorphic
  `subject_kind`/`subject_id` pair, which forces a migration of a live table and rewrites of
  `_scheduled_pairs`, `counts`, `stats`, `due_queue`, `reviews_today`, `sources_breakdown`. (a) is
  smaller and does not risk existing attempt history.
- **Every scheduler query joins `VocabEntry` explicitly** (`_scheduled_pairs`, `reviews_today`,
  `_log_rows`, `cards_for_entries`). A grammar queue is a *new function alongside* `due_queue()`,
  not an edit to it.
- **`drill_results.module` has `CheckConstraint("module IN ('reading','listening','vocab')")`.**
  A grammar micro-drill cannot be logged there without a migration. Flagging, not fixing — owned by
  the design/verify agents.
- **`word_variants()` must not be used for grammar near-miss detection.** It blindly generates
  `-s/-ed/-ing/-d/-ly` forms, so `grade_answer`'s `close` branch would score `walking` as "almost"
  when the answer is `walked`. In a tense unit that distinction *is the entire lesson*. Grammar
  grading needs its own near-miss policy: a wrong inflection on the target structure is **wrong**,
  full stop; only spelling slips and accepted stylistic variants are "close".
- **`use_in_sentence` requires `allow_llm` and a definition.** The grammar analogue must degrade
  when the LLM is unreachable — to a `transform` or `order` item on the same structure, never to
  nothing.

---

## 2. The progression: five stages, named

Textbook methodology gives us controlled → semi-controlled → free (the practice half of PPP).
That's the right spine but too coarse to build from, and it starts in the wrong place: PPP puts
*production* immediately after presentation, whereas the processing-instruction evidence says
comprehension of the form–meaning link should come first. Our ladder therefore has five rungs, and
the first two are input-only.

| # | Stage | Learner does | Item types | Grading | Budget per unit |
|---|---|---|---|---|---|
| 0 | **Notice** | Reads/hears 4–6 sentences containing the structure and answers a *meaning* question about each | `interpret` | mechanical | 4–6 items, ~2 min |
| 1 | **Get the rule** | Sees the two-line rule, the decision cue, and the timeline/diagram; optionally derives it first | `rule_card`, `discover` | none / mechanical | 1 screen, ~1 min |
| 2 | **Controlled** | Produces the form with meaning held constant — nothing to decide but the shape | `gap_fill`, `order`, `transform` | mechanical | 8–12 items, ~4 min |
| 3 | **Choice** | Both forms are grammatical; context decides. **The centre of the module.** | `choose_form`, `contrast_pair`, `judge`, `both_ok` | mechanical | 6–10 items, ~4 min |
| 4 | **Free** | Produces own content carrying the structure, under a real-task constraint | `produce`, `combine`, `dictogloss`, `speaking_drill` | LLM (+ mechanical pre-pass) | 2–4 items, ~4 min |

Total ~22–32 items, 14–17 minutes. That is one unit. It is finishable in a sitting and it is the
whole unit — there is no "part 2 of the present perfect" that the learner never reaches.

### 2.1 Stage 0 — Notice (structured input)

The learner is shown a sentence and asked a question **about the world, not about the grammar**.
This is the processing-instruction move: the learner cannot answer correctly without having decoded
the form, but is never asked to name it.

> *"They've closed the bridge."* — **Is the bridge open now?** Yes / No / Can't tell
>
> *"They closed the bridge."* — **Is the bridge open now?** Yes / No / Can't tell → *Can't tell*

Two-thirds of stage-0 items are like this. The other third are **timeline placement**: drag the
event onto a line marked `before now | now | after now`, or `finished | still going`.

Why it earns its place: it is the cheapest item in the module to author and to grade, it is
impossible to answer by pattern-matching a keyword, and it gets the learner to the form–meaning
link before their working memory is spent on producing anything. Do **not** substitute bolding the
target form in a passage and hoping — textual enhancement's meta-analytic effect (Lee & Huang 2008)
is small, and it only works when the enhanced input carries a task. Ours carries a task.

### 2.2 Stage 1 — Get the rule

Two shapes, and the design agent should ship both because the evidence between them is a genuine
tie (the deductive-vs-inductive meta-analytic picture is mixed; both beat no instruction, and guided
induction *followed by* an explicit statement is the safe blend).

- **Deductive (default):** the rule card. Two lines maximum for the rule, one line for the decision
  cue, one visual (timeline for tenses, two-box agent/patient diagram for the passive, a
  real/unreal axis for conditionals). A third line names the **most common learner error** for this
  structure, in the learner's likely wording.
- **Inductive (`discover`, opt-in per unit):** three sentence pairs already answered in stage 0 are
  re-shown together with the question *"What is different about the situations on the left?"* and
  three candidate generalisations, one correct, one too narrow, one keyword-based-and-wrong. This is
  Ellis's consciousness-raising task compressed to one screen. **It must always be followed by the
  explicit rule card** — discovery without confirmation leaves half the class with a wrong rule.

The keyword-based-and-wrong distractor matters. Learners are taught "*already/yet/just* → present
perfect" and then produce *"I've been to Rome last year"*. Naming the false rule and killing it is
worth more than stating the true rule twice.

### 2.3 Stage 2 — Controlled

Meaning is fixed by the prompt; only the form is in question. `gap_fill` with a bracketed lemma
(`She ___ (live) here since March.`), `order` (drag six tokens into a sentence), `transform`
(rewrite active → passive with the agent given). Mechanically graded, instant, and the place where
the learner discovers they can't spell *taught*.

Cap this. DeKeyser's proceduralization curve flattens fast; a 30-item controlled block is a way of
feeling busy. 8–12 items, then move.

### 2.4 Stage 3 — Choice

Its own section, §3. This is what the owner asked for twice.

### 2.5 Stage 4 — Free

The learner writes or says their own sentence, with the target structure required and a **content
constraint** that makes the structure natural. Loschky & Bley-Vroman's distinction governs the
design here: a task can make a structure *natural*, *useful*, or *essential*, and in production
essentiality is very hard to achieve — learners route around any structure they don't want. So we
do two things:

1. **State the target explicitly** ("use *by the time* + past perfect"). Honest, and it works.
2. **Choose the content constraint so the structure is the path of least resistance.** For the
   second conditional: *"Your city gets one extra hour of daylight every day. Say one thing you
   would do."* For the passive: *"Describe what happens to a plastic bottle after you drop it in a
   recycling bin — you don't know who does any of it."* The agent is genuinely unknown, so the
   passive stops being a stylistic choice and becomes the obvious sentence.

Free items go **last**, when the learner is warmed up, never first, and never more than two in a
row.

### 2.6 The grammar maturity ladder (mirror of `eligible_types`)

| Card state | Eligible item kinds |
|---|---|
| New / Learning (state 0,1) | `interpret`, `gap_fill`, `order` |
| Relearning (state 3) | `interpret`, `gap_fill`, `choose_form` |
| Review, stability < 7d | `gap_fill`, `transform`, `choose_form`, `judge` |
| Review, stability ≥ 7d | `choose_form`, `contrast_pair`, `both_ok`, `produce`, `dictation`, `combine` |
| Review, stability ≥ 21d ("mature") | `produce`, `dictogloss`, `speaking_drill`, `apply_to_task` |

Same shape as `exercises.eligible_types()`, same `YOUNG_STABILITY_DAYS = 7.0` /
`MATURE_STABILITY_DAYS = 21.0` boundaries already in the codebase. Reuse the constants; do not
introduce a third set of thresholds.

---

## 3. Teaching "when to use which" — the contrast engine

This is the highest-value machinery in the module and it deserves to be over-engineered relative to
everything else. The design principle in one line:

> **The unit of authoring is not the item. It is the pair.**

### 3.1 Why the pair, not the item

A single forced-choice item is defeatable. Show a learner ten items in a present-perfect unit and
nine of the keys are the present perfect; they will stop reading the context. Worse, they will learn
the *wrong* rule ("when the app is teaching X, answer X") and it will hold up beautifully until the
exam.

So: **every `choose_form` item is authored as a twin.** Same two options, minimally different
context, opposite key. The twins are never shown in the same screen and never adjacent in a queue
(§7.3 spacing rule) — the learner meets one today and its twin four items later or tomorrow, and
the only way to get both right is to have read the situation.

**Worked pair — present perfect vs past simple**

> **Item A.** Nadia is showing a visitor around the lab where she works.
> "I `____` here for six years."   → *worked* / **have worked**
> Decision cue: *the six years are still running.*
>
> **Item B (twin).** Nadia is clearing her desk on her last day at the lab.
> "I `____` here for six years."   → **worked** / *have worked*
> Decision cue: *the six years closed today.*

Identical sentence. Identical options. Opposite answers. One sentence of context does all the work.
A learner who gets both is not guessing.

**Worked pair — *will* vs *going to***

> **A.** You look up and the sky has gone black. "It `____` rain." → **'s going to** (the evidence
> is in front of you)
> **B.** Your friend says the ladder is still in the garden. "I `____` get it." → **'ll** (you
> decided as you spoke)

**Worked pair — active vs passive.** Passive items are different in kind and the design agent must
know why: *the passive is chosen for discourse reasons, so a passive contrast item is never one
sentence.* The rule is about what the previous sentence ended with.

> **A.** *"The samples arrived on Tuesday. They `____` to 60 °C for an hour."*
> → **were then heated** (the samples are the topic; keep them in subject position)
> **B.** *"Our team had two jobs that week. We `____` the samples and logged the results."*
> → **heated** (the team is the topic)

Lint rule: **every passive contrast item carries at least one preceding sentence.** Without it the
item is unanswerable and the learner learns that the passive is arbitrary.

**Worked pair — which conditional**

> **A.** *"I'm not a doctor."* → *"If I `____` a doctor, I `____` in a hospital."*
> → **were / would work** (unreal present)
> **B.** *"I might apply to medical school next year."* → *"If I `____` in, I `____`."*
> → **get / will go** (real future — it could actually happen)
> **C (mixed, mature only).** *"I studied law instead."* → *"If I `____` medicine, I `____` in a
> hospital now."* → **had studied / would be working**

The C item is where the meaning question earns its keep: after answering, the learner is asked
**"Did she study medicine?"** — *No*. That one question is the difference between having drilled a
pattern and having understood it.

**Worked pair — modal choice (source of obligation)**

> **A.** *"The lab rules say goggles at all times."* → *"You `____` wear goggles."* → **have to**
> (external rule)
> **B.** *"You're my friend and I'm worried about you."* → *"You `____` see a doctor."* → **must**
> / **really should** (the speaker's own insistence)

And the deduction sense as its own pair — *must* / *might* / *can't* over evidence:
*"Her coat's gone and the light's off. She `____` have left."* → **must**.

### 3.2 The four contrast item kinds

**(a) `choose_form` — forced choice in context.** Two or three options, all grammatical in
isolation, exactly one fitting the context. Mechanically graded (`expected` = the option text).
Payload carries `context`, `stem` with a `____` marker, `options[]`, `key`, and per-option
`why_this_means` — a one-line gloss of what the *rejected* option would have meant. That gloss is
the teaching; a bare "Incorrect" teaches nothing (§6.2).

**(b) `contrast_pair` — assign the meanings.** Both sentences shown side by side, plus two meaning
cards; the learner matches. No production, no elimination-by-guessing beyond 50%, and it is the
purest test of the form–meaning link we can build.

> *"He's been painting the fence."* / *"He's painted the fence."*
> Match to: *the fence is finished* · *you can see the paint on his hands*

**(c) `judge` — acceptable or not, and why.** Grammaticality judgement, but two-stage: first
accept/reject the sentence in its context, then — only if rejected — pick the reason from a short
closed list (*wrong time reference · this action is finished · the agent matters here · too strong
for this situation · nothing wrong, it's fine*). Two-alternative forced choice is the psychometrically
cleanest form of the judgement task and the reason-picker converts a coin flip into a diagnosis. It
also mirrors the reading module's "Self-diagnose before reveal" (reading `DESIGN.md` F2), which is
already the cheapest high-impact feature that module has.

**(d) `both_ok` — the honesty item.** About one item in five in a choice block should be one where
**both options are correct and mean different things**. The learner picks "both work" and then says
what changes. Graded mechanically by a follow-up match ("which version suggests she's still
annoyed?").

Without `both_ok` items the module teaches a lie — that English grammar is a series of right/wrong
gates. With them, it teaches the thing the owner actually asked for: that the choice carries
meaning. Lint: **every unit that contrasts two structures ships ≥ 1 `both_ok` item.**

### 3.3 Authoring rules for contrast items (write these into DESIGN as lints)

1. **Every `choose_form` item has a `twin_id`** pointing at an item with the same options and the
   opposite key. Lint fails on an unpaired item.
2. **Within a unit, key distribution must be within 40–60%** across each option. Lint counts keys.
3. **Every distractor must be grammatical in isolation.** A malformed distractor makes the item a
   form question wearing a choice question's clothes. Lint: distractors never contain a form the
   unit itself teaches as wrong.
4. **`decision_cue` is a required non-empty field** — the specific words in the context that decide
   it, quoted. The UI highlights that span on reveal (§6.3). If the author cannot quote a span, the
   item is unanswerable and must be rewritten.
5. **Context ≤ 2 sentences, ≤ 30 words.** A paragraph of context turns a grammar item into a
   reading-comprehension item.
6. **Passive items carry a preceding sentence** (§3.1).
7. **No item's context may contain a "signal word" that makes the choice mechanical** (*already*,
   *yet*, *last year*) unless the item is explicitly a stage-2 controlled item. Signal words are how
   learners avoid learning this. In stage 3 they are contraband. Lint: a keyword blocklist per unit.
8. **Every unit contributes ≥ 4 contrast items to the shared bank**, tagged with both structures, so
   the cross-unit review queue (§7.2) has material.

### 3.4 The contrast board

Each pair of contrasted structures gets one permanent screen: the two forms, the one-line decision
question that separates them, three worked pairs with the deciding span highlighted, and the
learner's own hit rate on that contrast. `Practise this contrast` assembles a 10-item drill from
the shared bank. This is the reading module's "Paraphrase Gym" pattern (`DESIGN.md` F5) applied to
grammar, and it is the screen a learner will come back to.

---

## 4. The exercise catalogue

Twelve types. For each: what it trains, how it's graded, and whether it needs a model call. **Nine
of the twelve are fully mechanical** — this module is not LLM-dependent and must work with the
network off.

| # | Type | Trains | Graded by | LLM? |
|---|---|---|---|---|
| 1 | `interpret` | form → meaning decoding | option index | no |
| 2 | `gap_fill` | form production, meaning fixed | `expected[]` string set | no |
| 3 | `order` | constituent order, clause position | token sequence | no |
| 4 | `transform` | form flexibility, structural equivalence | `expected[]` + normaliser | no* |
| 5 | `choose_form` | **when to use which** | option index | no |
| 6 | `contrast_pair` | form ↔ meaning mapping | matching | no |
| 7 | `judge` | monitoring / error sensitivity | binary + reason index | no |
| 8 | `both_ok` | that the choice carries meaning | option + follow-up match | no |
| 9 | `error_fix` | editing own output | span + replacement | no* |
| 10 | `dictation` | perception of unstressed grammar | targeted token diff | no |
| 11 | `combine` | syntactic range for writing | — | **yes** |
| 12 | `produce` / `dictogloss` / `speaking_drill` | free production | — | **yes** |

\* mechanical for the authored answer set, with an optional LLM fallback that only ever *upgrades* a
mechanical rejection to an acceptance (§5.4).

### 4.1 `gap_fill`
Bracketed lemma, one blank per item, `expected[]` holds every accepted surface form including the
contracted spelling and the un-apostrophed variant. **Two blanks maximum** — beyond that the item is
scored partially and the learner can't tell which half they got wrong. On-screen: type-in, not
multiple choice; a `Check` button; first-letter hint after 10s (matching the vocab shell's
convention in `08-vocabulary-srs.md` §5.1).

### 4.2 `order`
Tokens as draggable chips. Best type in the module for word-order structures where English learners
fossilise: adverb placement, question inversion, indirect questions, *not until*/*only then*
fronting with inversion. Graded on exact sequence, with **accepted alternate orders listed by the
author** (`She often goes` / `Often, she goes` — both fine, and refusing the second teaches a
falsehood). Mobile-friendly; no typing.

### 4.3 `transform`
The workhorse of the module and the one most at risk of being graded unfairly. Active↔passive,
direct↔reported, two clauses→conditional, positive→negative-with-*until*, *because*→*despite*.
Grading: normalise, then compare against an authored set of accepted answers. The normaliser must
(a) accept contraction/expansion (`did not` ≡ `didn't`), (b) accept optional *that* after reporting
verbs, (c) accept both orders of a two-clause conditional when the author flags it, (d) ignore
terminal punctuation and case. `normalize_answer_text()` already does (d) and half of (a) — the rest
is a small grammar-specific normaliser layered on top.

### 4.4 `error_fix`
Learner clicks the wrong word/span and types the replacement. Two sources, and the distinction is
important:

- **Own errors (preferred).** Sentences the learner actually produced in this module, in writing
  submissions, or in speaking transcripts, with the error preserved. Maximum relevance, zero risk of
  teaching a new error.
- **Authored errors (necessary, used sparingly).** ELT practice has a live concern about
  fossilisation through repeated exposure to incorrect forms. Mitigations that must be in the
  design: exactly **one** error per item, the error is always **visibly marked as broken** in the UI
  chrome (a struck-through chip, never plain prose the learner might read as a model), the corrected
  version is shown for **at least as long** as the broken one, and no error item ever appears in
  stage 0–2.

Graded mechanically: the span must match an authored error span (accepting an overlapping selection
of ±1 token) and the replacement must be in `expected[]`.

### 4.5 `dictation`
Kokoro is installed locally and can synthesise any sentence, which unlocks the single most
under-served grammar problem: **learners cannot hear the grammar.** *'ve* in *I've been*, the
reduction of *was/were*, the *'d* that is either *had* or *would*, the *-ed* that disappears before
a consonant. If you can't hear it, you don't produce it.

Two variants:
- **`dictation`** — plays once at natural speed (replay allowed, but the replay is logged), learner
  types the sentence. **Graded on the target tokens only.** The item declares
  `scored_tokens: ["had", "'d", "been"]`; a typo in an unscored word is shown but does not fail the
  item. This targeted diff is the fairness trick that makes dictation usable — an ordinary
  whole-string dictation grader fails good learners for spelling *restaurant* wrong.
- **`dictogloss`** — plays twice, learner reconstructs the *meaning* in their own words while
  keeping the structure. LLM-graded (§5). This is the classic pushed-output task and the research on
  it is explicitly about noticing the gap.

Both feed the listening module's transfer-answers phase for free.

### 4.6 `combine`
Two or three short sentences → one, using a named device (relative clause, participle clause,
*although*, *which* referring to a whole clause). This is the only type in the catalogue with a
direct, well-replicated effect on writing quality, and it is the natural bridge to Task 2.

> *The scheme cost £40m. It cut journey times by nine minutes. Most commuters noticed nothing.*
> → **combine using a relative clause and a concession.**

Graded by LLM, but with a mechanical pre-check that the named device is present (§5.2). Three
authored model combinations are shown after the attempt, not before — and shown *as alternatives*,
plural, so the learner sees there is no single right answer.

### 4.7 `produce`
"Write one sentence about [constraint] using [structure]." §5 is entirely about grading this fairly.

### 4.8 `speaking_drill` (grammar)
Reuse the existing pattern verbatim: `08-vocabulary-srs.md` §5.2.6 already injects a marked system
message into the live voice session ("Ask the learner a question that invites using *mitigate*").
The grammar version injects a *structure* target — "Ask a question whose natural answer uses a
second conditional" — and the post-session evaluator confirms whether the structure appeared in the
transcript. Same `review()` call, `exercise_type="speaking_drill"`. This is the cheapest possible
route to spoken free production and the plumbing exists.

### 4.9 `apply_to_task`
Not really an exercise — the unit's terminal move. §9.

---

## 5. Grading free production fairly

The failure mode is specific and it kills modules: **a learner writes a correct sentence the grader
did not anticipate, the grader says no, and the learner stops trusting the app.** Once trust is
gone, every subsequent correction is noise. So the grading design is asymmetric by construction:
*accepting is cheap, rejecting is expensive.*

The GEC literature says the same thing from the other direction — reference-based metrics penalise
valid alternative corrections, LLMs over-correct because their pre-training pushes them toward
fluency rather than minimal edits, and minimal-edit benchmarks deliberately weight precision above
recall because a wrong correction costs more than a missed one. And the LLM-as-judge literature
adds: alignment with human judgement is strong for **binary** decisions and degrades as rubric
granularity increases. Both point at the same architecture.

### 5.1 Decompose into binary checks, never a score

Never ask the model "rate this sentence 1–5". Ask four independent yes/no questions:

| Check | Question | Who answers |
|---|---|---|
| **A. Present** | Does the sentence contain the target structure? | **mechanical first**, LLM only as a fallback |
| **B. Well-formed** | Is the target structure itself correctly formed? | LLM, binary |
| **C. Fits** | Does the sentence make sense given the prompt's situation, with the meaning this structure carries? | LLM, binary |
| **D. Minimal fix** | If B or C failed, what is the smallest edit that fixes it? | LLM, string |

The verdict is `A && B && C`. Nothing else. Not style, not length, not "would a native say it that
way", not the quality of the opinion.

### 5.2 Check A is mechanical, and that is the main defence

Before the model sees anything, run an authored **structure detector** over the learner's sentence:
a small regex/pattern per structure, authored in the unit alongside the rule.

```
second_conditional : \bif\b .* \b(were|was|[a-z]+ed|<irregular past>)\b .* \b(would|'d|could|might)\b
present_perfect    : \b(have|has|'ve|'s)\b\s+(\w+\s+)?\b<past participle>\b
passive             : \b(am|is|are|was|were|be|been|being|get|got)\b\s+(\w+ly\s+)?\b<past participle>\b
```

If the detector fires, **check A is settled as `true` and the LLM is told so in the prompt.** The
model is never given the opportunity to claim the learner didn't use the structure when they
demonstrably did. This single move removes the most common and most infuriating false rejection.

If the detector does *not* fire, we do not reject either — we ask the LLM "which of these structures
is the writer using?" and if the answer is the target, we accept and log a detector gap for the
content agent. A detector that misses is our bug, not the learner's error.

### 5.3 The grading prompt (shape, for the design agent to finalise)

Adapted from the existing `CHECK_SENTENCE_PROMPT` in `exercises.py`, which is already well-built —
same JSON-only, temperature-0, offline-degrading contract.

```
You are checking one sentence written by an English learner who was asked to
practise a specific grammatical structure.

Target structure: {structure_name} — {one_line_rule}
The task they were given: {prompt_text}
Their sentence: "{sentence}"
Automatic check: the target structure {WAS / WAS NOT} detected in the sentence.

Answer only these questions:
1. structure_correct — is the target structure itself grammatically well formed?
2. meaning_fits — does the sentence make sense for the situation described in the
   task, given what this structure means?

Rules you must follow:
- If the automatic check says the structure WAS detected, do not claim it is absent.
- Ignore every error that is not part of the target structure: spelling, articles,
  prepositions, punctuation, and word choice elsewhere in the sentence.
- Ignore length, style, register and formality.
- Do not judge whether the opinion or the facts are true or sensible.
- A sentence you would have written differently is still correct. Only mark
  structure_correct false if you can quote the exact words that are wrong.
- If you are unsure, answer true.

Return ONLY:
{
  "structure_correct": true/false,
  "meaning_fits": true/false,
  "offending_span": "the exact words that are wrong, or an empty string",
  "why": "one short sentence naming the problem in plain words, or empty",
  "minimal_fix": "their sentence with the smallest possible change, or empty"
}
```

Four properties of that prompt are load-bearing and must survive review:

- **"the automatic check says…"** — hands the model the fact instead of asking it.
- **"only mark false if you can quote the exact words that are wrong"** — and then the *code*
  enforces it: **if `structure_correct` is false but `offending_span` is empty or is not a substring
  of the learner's sentence, the rejection is discarded and the answer is accepted.** This is the
  strongest single fairness mechanism available and it costs ten lines.
- **"If you are unsure, answer true."** — deliberate leniency bias, correct for a learning tool.
- **"Ignore every error that is not part of the target structure"** — this is focused CF, which the
  written-CF literature says outperforms unfocused CF, especially for weaker learners. It also stops
  the module from becoming a demoralising red-pen machine.

### 5.4 Asymmetric confirmation

- **Accept on one call.** Rejections cost a second call at temperature 0 with the options shuffled;
  if the two calls disagree, **accept**. (Same logic as edit-level majority voting in the GEC
  literature, at 2× cost instead of 5×.)
- **Never reject on an LLM failure.** `check_sentence()` already degrades to
  `{checked: false, suggested_rating: 3}` with an honest "could not reach the language model"
  message on any exception. Keep that exactly.

### 5.5 The appeal button

Under every rejection: **"I think this is right"**. Clicking it opens one text field ("what did you
mean?"), re-runs the check with the learner's gloss appended and an explicit
*"the learner says they meant X; if the sentence can carry that meaning, accept it"* instruction, and:

- if it now accepts, the card is rated normally and the disagreement is logged;
- if it still rejects, the response must lead with the learner's own meaning: *"To say that, you'd
  write ___ — here's why your version says something different."*

The appeal is not a courtesy. Every appeal is a labelled data point about where our items and
detectors are wrong, surfaced on an internal screen for the content agents. A module that cannot be
told it is wrong will stay wrong.

### 5.6 What is never checked

Topic. Opinion. Truth. Length. Formality (unless the unit *is* about formality). Spelling outside
the target span. Punctuation outside the target span. Vocabulary choice. Whether it is "natural".
Whether a native would say it. Enumerate this list in DESIGN so no future prompt edit reintroduces
it.

---

## 6. Feedback that changes behaviour

### 6.1 Prompt, then reveal — never reveal first

Lyster & Ranta's finding that ~70% of recasts went unnoticed is the whole argument. A screen that
answers the question for you produces no repair. So every wrong answer runs a three-beat sequence:

1. **Signal** — *"Not this one. Look at what she says in the second line."* The deciding span is
   highlighted. No answer given. The learner may re-answer.
2. **Elicit** — one retry, always. If the type allows it (`gap_fill`, `transform`, `produce`), the
   input stays live. If it's forced choice, the chosen option is dimmed and the rest remain.
3. **Reveal + rule** — only now. The key, the `decision_cue`, and the one-line rule.

`grade_answer()` already tracks `attempts` and pre-selects `rating: 2` on a second-try success —
that mapping is exactly right and should carry over.

### 6.2 Feedback names the *meaning*, not the verdict

The most valuable string in a contrast item is not "Correct" — it's what the rejected option would
have meant. Every `choose_form` option carries `why_this_means`:

> You chose **worked**. That says the six years are over. She's still there, so English keeps the
> period open: **have worked**.

That is a sentence a learner can act on tomorrow. "Incorrect — the answer is *have worked*" is not.

### 6.3 Three questions, always (Hattie & Timperley)

Every feedback panel, mechanically graded or not, renders in three fixed zones:

- **Where am I going** (feed up) — the unit's can-do line, persistently in the header:
  *"I can say when something started and is still going on."*
- **How am I going** (feed back) — this item's verdict + the meaning gloss + the deciding span.
- **Where to next** (feed forward) — **one imperative sentence**, and it is the only part that
  changes behaviour: *"Before you choose, ask whether the time period has closed."* /
  *"You've got the form. Next: three items where both options are possible."*

Feedback at the "self" level ("great job!", "you're a natural") is banned by name — it is the level
Hattie & Timperley identify as least effective, and it is what most language apps ship.

### 6.4 The error code taxonomy

Every wrong answer writes a **typed error code**, not just a boolean. The reading module already
proved the pattern: its 26-slug trap taxonomy (`DESIGN.md` §5.1) is what turns "TFNG 2/6" into "you
lost 9 marks to three named traps", and that is the module's diagnostic spine.

Grammar needs the same, roughly 30–40 slugs. A first cut:

`tense_finished_vs_open` · `tense_sequence_broken` · `perfect_with_finished_time` ·
`prediction_vs_intention` · `aspect_state_vs_action` · `agreement_subject_verb` ·
`agreement_quantifier` · `article_missing` · `article_generic_vs_specific` · `plural_uncountable` ·
`conditional_wrong_type` · `conditional_would_in_if_clause` · `passive_agent_should_be_named` ·
`passive_unnecessary` · `passive_form_be_missing` · `modal_strength_too_strong` ·
`modal_obligation_source` · `modal_deduction_wrong` · `modal_perfect_form` ·
`reported_backshift_missing` · `reported_question_word_order` · `relative_pronoun_wrong` ·
`relative_comma_meaning` · `word_order_adverb` · `word_order_question` · `preposition_after_verb` ·
`gerund_vs_infinitive` · `comparative_form` · `linker_meaning_reversed` · `fragment_no_main_verb` ·
`run_on_comma_splice` · `overuse_avoids_complexity`

These codes are the join key for everything downstream: the progress screen, the drill selector, the
personal rule sheet, and the writing module's feedback (if the writing scorer can emit the same
codes, a Task 2 error becomes a one-tap route into the grammar unit that fixes it).

### 6.5 The personal rule sheet

Every revealed rule has an `Add to my rules` action (same affordance as reading F1's "Add to my
rules" and speaking F1's "Add to bank"). The sheet is a single scrollable page of one-line rules the
learner has personally been wrong about, each with **their own wrong sentence and its correction
underneath**. It is reviewable, printable, and it is the artefact a learner takes into the exam.

---

## 7. Session shape and length

### 7.1 Fit into what exists

`10-curriculum-progress.md` §5 fixes the daily skeleton: warm-up (SRS vocab, 5–10 min) → main
activity (20–60) → micro-drill (5–15) → wrap-up. Grammar occupies three different slots depending
on the session:

| Slot | Grammar shape | Length | Items |
|---|---|---|---|
| **Main activity** | A full **unit** (stages 0→4) | 14–17 min | 22–32 |
| **Micro-drill** | **Contrast drill** on one pair, or one error code | 5–8 min | 10–14 |
| **Warm-up** | Grammar cards interleaved into the SRS queue | 2–4 min | 4–8 |

`10 §5` already names "grammar transformations" as a micro-drill kind, so the slot is reserved.

### 7.2 Unit internal sequence (the anti-monotony rules)

The five stages give natural variety, but within them:

1. **Never more than 3 consecutive items of the same type.** (`MAX_CONSECUTIVE_SAME_TYPE = 3`,
   sibling of the existing `MAX_CONSECUTIVE_NEW`.)
2. **Alternate input modality at least twice per unit** — at least one `dictation` or audio-prompted
   item breaks up a wall of text, and it is pedagogically load-bearing (§4.5), not decoration.
3. **Alternate response modality** — type, tap, drag, speak. An `order` item after four `gap_fill`s
   changes the physical action and resets attention for free.
4. **Free production last, never more than two consecutive.**
5. **Blocked within the unit, interleaved across units.** Hwang 2025's warning is explicit: forcing
   interleaving before declarative knowledge exists is an *undesirable* difficulty. So one unit =
   one structure, blocked. The review queue = mixed, interleaved, and only ever draws structures the
   learner has already completed a unit for.
6. **Twins never adjacent.** A `choose_form` item and its `twin_id` must be ≥ 4 items apart or in
   different sessions. Enforced in the queue builder, not left to authoring order.

### 7.3 Review scheduling

Straight FSRS on the grammar card, one card per **unit** (not per item) — the thing being scheduled
is "can you still make this choice", and the item shown is drawn fresh from the unit's bank each
time. This is important: **a grammar card must not show the same item twice**, or the learner
memorises the item instead of the rule. Track `seen_item_ids` per card; exhaust the bank before
repeating; when the bank is exhausted, prefer `produce` items (infinite by construction).

Kim & Webb's meta-analysis found equal and expanding spacing statistically equivalent and longer
spacing better on delayed tests, so FSRS's defaults with our existing `DEFAULT_RETENTION = 0.9` and
365-day cap need no adjustment for grammar.

### 7.4 Honest mastery gate

A unit is not "learned" when the learner finishes it. It is learned when they get a **free-production
item right on a later day**. This kills the illusion-of-competence problem that makes people fail
exams they felt ready for, and it costs nothing to implement: the progress state machine is
`not started → in progress → practised → mastered`, and only a stage-4 item on a card with
`state == REVIEW` moves the last arrow.

---

## 8. Motivation — where grammar study dies

The honest baseline: grammar is where learners quit. It is abstract, the payoff is deferred, and
most products make it a wall of drills.

Duolingo's answer — streaks, leagues, loss aversion — measurably works (streak wagers reportedly
lift D14 retention ~14%) and is **explicitly forbidden by `10-curriculum-progress.md` §9**: no shame,
no loss-aversion mechanics, no leagues, no "your streak is about to die" copy. That constraint is
correct for a single-learner exam-prep tool with a real deadline, and it is binding. So the
motivation design must be mastery-shaped. Six choices:

**M1. Nothing takes longer than one sitting.** A unit is 14–17 minutes and always completable. There
is no "Present Perfect, part 3 of 5". The progress bar reaching the end is the reward, and it is
reachable on a bad day.

**M2. Can-do statements, not topic names.** The unit is not called *"Present Perfect Simple"*. It is
called **"Saying that something started before now and is still true"**, with the grammatical name
as a subtitle. The unit list becomes a list of things the learner will be able to *do*, and every
completed unit is a sentence about themselves that is now true. This is the CEFR framing and it is
the single cheapest motivational change available.

**M3. Payoff today, not at the exam.** Every unit ends in `apply_to_task` (§9): the structure placed
into a real Task 2 sentence or a real Part 3 answer, from the 102 writing prompts and 108 speaking
sets the app already has. The learner sees the point of the fifteen minutes before they close the
laptop.

**M4. Errors falling, not points rising.** The progress screen's primary number is **the error codes
that have gone quiet**: *"`perfect_with_finished_time` — 7 errors in your first week, 0 in the last
two."* That is a true statement about the learner's competence, and it is far more motivating to an
adult with an exam date than an XP counter.

**M5. A visible range board.** IELTS-style band-7 grammar descriptors are, in effect, a checklist:
a variety of complex structures with most sentences error-free. So show a board of the structures
the learner now controls — conditionals, relatives, passives, participle clauses, cleft sentences —
each in one of four states, with the count of structures at `mastered` beside a plain-English note
about what range means for the band. Non-affiliation notice applies; the copy says *IELTS-style*.

**M6. Never punish a gap.** Skipped days do not create debt (10 §5 already says skipped sessions
aren't rescheduled). A unit left half-done resumes where it stopped. There is no decay animation.

**Explicitly rejected:** leaderboards, XP, hearts/lives, timed pressure outside the mock, streak
loss messaging, gem economies, "you're on fire" copy. All of these are already ruled out upstream
and would contradict the product's stated tone.

---

## 9. Connecting to the four skills

A grammar point is worth learning because it shows up in a Task 2 essay or a Part 3 answer, and this
app already knows exactly what those look like. That is a genuine advantage over every standalone
grammar reference on the market and it should be exploited in five specific places.

**Every unit carries a `used_in[]` field** — an array of `{module, ref_id, quote}` pointing at real
authored content in the existing packs. Concretely:

1. **→ Writing.** `apply_to_task` renders the learner's own most recent Task 2 body paragraph (or an
   authored one if they have none) with an instruction: *"Rewrite one sentence of this paragraph
   using a concessive clause."* Graded like a `produce` item. If the writing scorer emits the §6.4
   error codes, the reverse link also exists: a Task 2 feedback line becomes a one-tap route into the
   unit that fixes it, which is the single highest-value cross-module wire in the app.
2. **→ Speaking.** The `speaking_drill` injection already exists in the voice pipeline (§4.8). Also:
   speaking `DESIGN.md` §3.6 defines `error_watchlist` on Part 2 cards — those entries should be
   emitted as §6.4 error codes so a speaking attempt can recommend a grammar unit by name.
3. **→ Reading.** Reading `DESIGN.md` §1.5 already has a `grammar_cue` field on completion
   questions. Grammar units link to the questions carrying their cue, so "why does this blank need a
   plural?" has an answer one tap away. Reading's `paraphrase_families` are also grammar in
   disguise — nominalisation and voice change are the two commonest paraphrase devices in the paper.
4. **→ Listening.** 43 authored scripts are 43 dictation sources. A `dictation` item drawn from a
   real listening script trains the target structure and the transfer-answers skill in one action.
5. **→ Vocabulary.** Two directions, both cheap. (a) A `produce` item **seeds its content word from
   the learner's due SRS queue** — "write a second conditional about *mitigate*" — so one item
   services two cards and the vocab word gets used in a real sentence, which is exactly what the
   owner asked for. (b) The 41 upgrade-pairs are frequently grammatical upgrades
   (verb → nominalisation, simple clause → participle clause) and belong on the contrast board.

**Bidirectional by contract:** every grammar unit names the skill surfaces it serves, and every
skill surface that can emit an error code can route into a grammar unit. Neither direction is
optional; a one-way link decays into a dead field.

---

## 10. Feature wishlist, ranked by learner impact against build cost

Each feature names the payload fields it consumes, in the house style of speaking `DESIGN.md` §7 and
reading `DESIGN.md` §10, so content and UI cannot drift.

---

### F1 — The Contrast Engine · impact **very high** · cost **M**
**Consumes:** `item.context`, `options[].text`, `options[].why_this_means`, `key`, `decision_cue`,
`twin_id`, `unit.rule_line`.

The owner's central ask, built as machinery rather than as a page. A `choose_form` item renders as:
one or two lines of context in a muted block, the stem with an inline blank, two or three option
chips, nothing else. No "Grammar tip" box, no metalanguage on the front of the card.

On answer: the chosen chip locks; the deciding span in the context **highlights**; the rejected
option's `why_this_means` renders directly beneath the stem as a full sentence, not a label. On a
wrong answer the highlight fires *before* the answer is shown and the learner gets one retry (§6.1).

The twin arrives ≥ 4 items later. When the learner gets both halves of a pair right, a single quiet
line appears: **"Same sentence, opposite answer. You read the situation."** That is the moment the
module exists to produce, and it is worth one bespoke string.

Requires: `twin_id` integrity lint, key-balance lint, signal-word blocklist (§3.3).

---

### F2 — Meaning-first items (structured input) · impact **very high** · cost **S**
**Consumes:** `item.sentence`, `question`, `options[]`, `key`.

The cheapest high-impact feature in the module, and the one most likely to be cut by someone who
thinks it looks too easy. A sentence, a question about the world, two or three options. No
production, no metalanguage, ~6 seconds each.

Opens every unit (stage 0) and reappears in review as a fast, confidence-restoring item type. Also
the correct degradation target when the LLM is unreachable and a `produce` item can't run.

---

### F3 — Fair free-production grading · impact **very high** · cost **M**
**Consumes:** `unit.structure_detector`, `unit.rule_line`, `item.prompt_text`; LLM.

§5 in full: mechanical structure detection first; four binary checks; span-quoting requirement with
code-side enforcement; leniency bias; two-call confirmation for rejections only; offline degradation
to self-rating.

On screen: the learner's sentence stays visible and **unedited** at the top. Below it, a green or
amber bar (**never red** — speaking `DESIGN.md` R4 §7.2 rule 10 already bans red in feedback), the
one-line `why`, the `minimal_fix` rendered as an inline diff against their own words, and the
**"I think this is right"** appeal button (§5.5). Accepted sentences with a `minimal_fix` show it as
*"also fine, and slightly more natural: …"* — never as a correction.

This feature is the module's trust budget. Build it before building more content.

---

### F4 — Error codes, the profile, and code-filtered drills · impact **very high** · cost **S–M**
**Consumes:** `item.error_codes[]` aggregated across attempts.

Directly modelled on reading F4, which works. The progress screen gains a second axis: not
*"Grammar 68%"* but *"Three codes are costing you: `perfect_with_finished_time` (9),
`conditional_wrong_type` (6), `article_generic_vs_specific` (5)."* Each line is a button that
assembles a 12-item drill of items carrying that code **across all units** — a far better selector
than "the present perfect unit".

Needs an `error_codes_json` column on the grammar attempt row to be selectable, and a migration for
`drill_results.module` (§1.2).

---

### F5 — The unit shell (five stages, one progress bar) · impact **very high** · cost **M**
**Consumes:** the whole unit payload.

The container everything else lives in. A single horizontal progress bar segmented by stage, with
the stage names visible (*Notice · Rule · Build · Choose · Use*) so the learner can see the shape of
the next fifteen minutes and that it ends. The can-do line pinned in the header (feed up). Exit
resumes exactly where it stopped.

One rule with teeth: **the rule card cannot be opened before the stage-0 items are answered.** Same
attempt-gating pedagogy as speaking F1 and reading F1, and the same justification — a rule read
before the learner has felt the problem is a fact to forget.

---

### F6 — Contrast boards · impact **high** · cost **S**
**Consumes:** the shared contrast bank, `unit.contrast_with[]`, learner hit rate per contrast.

One permanent screen per contrasted pair (§3.4): the two forms, the deciding question in one line,
three worked pairs with spans highlighted, the learner's own accuracy, and a `Practise this
contrast` button. Roughly 12–18 boards cover the module (`will`/`going to`, present perfect/past
simple, present perfect/present perfect continuous, past simple/past continuous, past
simple/past perfect, the four conditional patterns pairwise, active/passive, `must`/`have to`,
deduction modals, `should`/`had better`, gerund/infinitive, defining/non-defining relatives).

Highest re-visit rate of anything in the module. Also the natural deep-link target from writing and
speaking feedback.

---

### F7 — Apply-to-task · impact **high** · cost **S–M**
**Consumes:** `unit.used_in[]`, the learner's most recent writing submission or speaking transcript.

The last screen of every unit. Real prompt, real paragraph, one instruction, one sentence to write
or say. Graded by F3. Answers *"why did I just spend fifteen minutes on this"* while the learner is
still in the app.

---

### F8 — Targeted dictation · impact **high** · cost **S**
**Consumes:** `item.audio_text`, `scored_tokens[]`; Kokoro TTS (installed).

§4.5. The targeted-token diff is what makes it fair and it is ~30 lines. Renders as a play button, a
single text field, and after checking, the learner's text with **only the scored tokens** marked,
plus the option to replay at 0.8× with the target token highlighted as it plays. Unlocks the weak-form
problem that no amount of reading about the present perfect will fix.

---

### F9 — Sentence combining · impact **high** · cost **S–M**
**Consumes:** `item.parts[]`, `required_device`, `model_combinations[]`; LLM.

§4.6. The best-evidenced route from grammar knowledge to writing quality that exists. Renders the
short sentences as separate cards that visually **merge** into one field as the learner types — a
small animation that makes the operation concrete. Three model combinations shown after, labelled
*"three ways, all fine"*, which is itself the lesson.

---

### F10 — Judge-and-diagnose · impact **medium-high** · cost **S**
**Consumes:** `item.sentence`, `context`, `acceptable`, `reason_codes[]`.

§3.2(c). Two taps: acceptable/not, then — only on "not" — the reason from a 4–6 slug closed list.
Trains the monitoring skill that actually operates during a timed exam, and produces a genuine
metacognition signal (learner-selected code vs authored code) exactly as reading F2 does.

---

### F11 — Personal rule sheet · impact **medium-high** · cost **S**
**Consumes:** rules added via `Add to my rules`, plus the learner's own wrong sentences and fixes.

§6.5. One page, exportable. The thing they read the night before.

---

### F12 — Grammar cards in the SRS queue · impact **high** · cost **M**
**Consumes:** `grammar_cards` (new table, §1.2), the unit item bank.

Grammar units enter the existing daily warm-up alongside vocabulary, scheduled by the same FSRS
instance, with a fresh item each review (§7.3). This is what converts a finished unit into retained
knowledge, and it is the only feature here that requires a new table.

---

### F13 — Guided discovery (`discover`) · impact **medium** · cost **S**
**Consumes:** `unit.discovery_sets[]`, `candidate_rules[]`.

§2.2. One optional screen before the rule card. Worth building because it is cheap and because the
wrong-rule distractor kills a specific fossilised misconception per unit — but the evidence for
induction over deduction is genuinely mixed, so it is opt-in and never replaces the explicit rule.

---

### F14 — Vocabulary-seeded production · impact **medium-high** · cost **S**
**Consumes:** the vocab SRS due queue + `produce` items.

§9.5(a). A `produce` item pulls its content word from the learner's due vocabulary cards, so one
sentence services a grammar card and a vocab card, and — this is the point the owner made — the
vocabulary is practised in a **real sentence the learner wrote**, under a structural constraint,
rather than in isolation. Both cards get reviewed on one answer. Nearly free given both queues
exist.

---

### Explicitly not built

- **A grammar reference/browse-all-rules section.** Every learner says they want it; nobody uses it;
  it turns the module into a book. The rule cards are reachable from their units and from the
  contrast boards, which is enough.
- **Parsing/labelling exercises** ("identify the gerund"). Trains metalanguage, not language.
- **Whole-paragraph error hunts.** Unfocused feedback, contradicts §0.8, and maximises exposure to
  broken forms for minimum return.
- **Numeric grammar scores.** LLM-as-judge alignment degrades with rubric granularity; a 1–5
  "grammar score" would be noise dressed as measurement. Counts of quiet error codes instead.
- **Timed grammar items outside the mock.** Speed pressure on stage 2–3 items produces guessing.
- **Any streak/loss-aversion mechanic** (§8, and `10-curriculum-progress.md` §9 forbids it).
- **A second scheduler.** FSRS is installed, tested, and version-guarded. Use it.

---

## 11. Open questions for the design agent

1. **`grammar_cards` table vs polymorphic `srs_cards`** — §1.2 recommends the former; the data-model
   owner should confirm before content is authored against either.
2. **Where the structure detectors live** — authored per unit in the content pack (portable,
   reviewable, but content agents must write regex) or coded in the sidecar keyed by structure slug
   (safer, but a new structure needs a code change). Recommendation: sidecar, keyed by slug, with the
   pack naming the slug — content agents should not be writing regex.
3. **Whether the writing scorer can emit §6.4 error codes.** If yes, F4 becomes the app's spine
   rather than a grammar-module feature. Worth a spike before F4 is scoped.
4. **`drill_results.module` migration** to admit `'grammar'` — needed by F4, blocked on the data-model
   owner.
5. **Item bank depth per unit.** F12 requires a unit to never repeat an item across reviews. At ~8
   reviews in the first 90 days and 1 item per review, a unit needs ≥ 10 review-eligible items beyond
   its 22–32 teaching items. That roughly doubles the authoring load and must be budgeted now, not
   discovered later.

---

## Sources

Practice progression and lesson staging
- [Planning a grammar lesson — TeachingEnglish (British Council / BBC)](https://www.teachingenglish.org.uk/article/planning-grammar-lesson)
- [Controlled, Semi-Controlled, and Free Practice — Conestoga Faculty Learning Hub](https://tlconestoga.ca/controlled-semi-controlled-and-free-practice/)
- [Controlled vs. Freer Practice Activities — Grade University](https://grade-university.com/blog/controlled-vs-freer-practice-activities-the-power-of-freer-practice-in-grammar-instruction)

Input processing, form–meaning connection
- [Explanation versus Structured Input in Processing Instruction — Studies in Second Language Acquisition (Cambridge)](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/explanation-versus-structured-input-in-processing-instruction/CADC0357472A2FF7A8195A3A58A8E602)
- [Input processing in second language acquisition: the pioneering work of Bill VanPatten — John Benjamins](https://benjamins.com/catalog/sibil.62.01lee)
- [Processing Instruction: Theory, Research and Commentary — TESL-EJ review (PDF)](http://www.tesl-ej.org/pdf/ej35/r5.pdf)

Focus on form, consciousness-raising, induction vs deduction
- [Rod Ellis's essential bookshelf: Focus on form — Language Teaching (Cambridge)](https://www.cambridge.org/core/journals/language-teaching/article/rod-elliss-essential-bookshelf-focus-on-form/896AFFA93A6703A70E22C0187E3C34CB)
- [The effectiveness of guided induction versus deductive instruction — SSLA (Cambridge)](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effectiveness-of-guided-induction-versus-deductive-instruction-on-the-development-of-complex-spanish-gustar-structures/0A256FD27F2DF9B1C21C577FA0A24725)
- [The effectiveness of deductive, inductive, implicit and incidental grammatical instruction — System](https://www.sciencedirect.com/science/article/abs/pii/S0346251X14000980)

Output, noticing, dictogloss
- [Pushed Output and Noticing in a Dictogloss (PDF)](https://pdfs.semanticscholar.org/cf35/f64aea5db72a7a4cfda787932233aebd98e4.pdf)
- [Output and Beyond to Dialogue: a review of Merrill Swain's approach — JALT](https://jalt-publications.org/tlt/articles/2198-output-and-beyond-dialogue-review-merrill-swains-current-approach-sla)

Task design and target structures
- [Grammar and task-based methodology (Loschky & Bley-Vroman's natural/useful/essential distinction)](https://www.researchgate.net/publication/312465115_Grammar_and_task-based_methodology)
- [The addition of a target structure to task repetition as an accuracy enhancement — Languages](https://doi.org/10.3390/languages10060128)

Skill acquisition and automatization
- [DeKeyser & Suzuki (2025), Skill Acquisition Theory — preprint (PDF)](https://yuichisuzuki.net/wp-content/uploads/2025/07/PreprintDeKeyser-R.-M.-Suzuki-Y.-2025.-Skill-acquisition-theory.-In-B.-VanPatten-G.-D.-Keating-S.-Wulff-Eds.-Theories-in-second-language-acquisition-An-introduction-4th-ed.-pp.-157-182-.pdf)
- [Automatization, Skill Acquisition, and Practice in SLA — Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1002/9781405198431.wbeal0067)

Spacing, retrieval, interleaving
- [Kim & Webb (2022), The Effects of Spaced Practice on Second Language Learning: A Meta-Analysis — Language Learning](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)
- [Hwang et al. (2025), Undesirable Difficulty of Interleaved Practice — Language Learning](https://onlinelibrary.wiley.com/doi/10.1111/lang.12659)
- [Interleaved practice enhances grammar skill learning for similar and dissimilar tenses — Learning and Instruction](https://www.sciencedirect.com/science/article/abs/pii/S0959475224001725)
- [Repetition, Retrieval, and Spaced Practice — Wiley](https://onlinelibrary.wiley.com/doi/10.1002/9781405198431.wbeal20349)

Corrective feedback
- [Lyster & Ranta / Lyster & Saito — Corrective feedback, learner uptake (ERIC PDF)](https://files.eric.ed.gov/fulltext/EJ1134390.pdf)
- [Roles for Corrective Feedback in Second Language Instruction — Lyster, Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/9781405198431.wbeal1028.pub2)
- [Direct versus Indirect Grammar Feedback — Bitchener, Wiley](https://onlinelibrary.wiley.com/doi/full/10.1002/9781118784235.eelt0055)
- [Assessing the effect of focused direct and focused indirect written corrective feedback — Language Testing in Asia](https://languagetestingasia.springeropen.com/articles/10.1186/s40468-019-0084-9)
- [Hattie & Timperley feedback model — feed up / feed back / feed forward](https://sola.kau.se/keeponteaching/about-feedback-feed-up-feed-back-och-feed-forward/?lang=en)

Judgement tasks and assessment format
- [Acceptability judgment task — overview](https://en.wikipedia.org/wiki/Acceptability_judgment_task)
- [Assessing the reliability of grammaticality judgement tests](https://www.researchgate.net/publication/257714804_Assessing_the_reliability_of_grammaticality_judgment_tests)

Sentence combining and grammar-in-context
- [Graham & Perin, Writing Next — Carnegie Corporation (PDF)](https://media.carnegie.org/filer_public/3c/f5/3cf58727-34f4-4140-a014-723a00ac56f7/ccny_report_2007_writing.pdf)
- [Sentence Combining — Keys to Literacy](https://keystoliteracy.com/blog/sentence-combining/)
- [A meta-analysis of relationships between syntactic features and writing performance — Journal of Second Language Writing](https://www.sciencedirect.com/science/article/pii/S1075293524001028)

Input enhancement (why we don't over-invest in it)
- [Effects of textual enhancement on L2 development: a meta-analysis — IRAL](https://www.degruyterbrill.com/document/doi/10.1515/iral-2025-0118/html)
- [The effects of input enhancement on grammar learning and comprehension — SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-input-enhancement-on-grammar-learning-andcomprehension/FA73F01ADB6A7B4148AD25D697F401D7)

Sequencing and level description
- [The English Grammar Profile of learner competence: methodology and key findings — IJCL](https://benjamins.com/catalog/ijcl.14086.oke)
- [Understanding (and using) CEFR criterial features for grammar instruction — Cambridge](https://www.cambridge.org/elt/blog/2021/06/23/using-cefr-criterial-features-for-grammar-instruction/)
- [Teachability Hypothesis (Pienemann) — overview](https://en.wikipedia.org/wiki/Teachability_Hypothesis)
- [An Outline of Processability Theory — Language Learning](https://onlinelibrary.wiley.com/doi/10.1111/lang.12095)

Automated grading — over-correction and judge reliability
- [Adapting LLMs for Minimal-edit Grammatical Error Correction (arXiv)](https://arxiv.org/pdf/2506.13148)
- [Edit-level Majority Voting Mitigates Over-Correction in LLM-based GEC (arXiv)](https://arxiv.org/html/2605.13624)
- [Prompting open-source and commercial language models for GEC of English learner text (arXiv)](https://arxiv.org/pdf/2401.07702)
- [Rubric-Conditioned LLM Grading: Alignment, Uncertainty, and Robustness (arXiv)](https://arxiv.org/pdf/2601.08843)
- [How Trustworthy Are LLM-as-Judge Ratings for Interpretive Responses? (arXiv)](https://arxiv.org/pdf/2604.00008)

Motivation and session design
- [Duolingo gamification and retention — StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [What 1,000 days of Duolingo taught me about microlearning and gamification — ATD](https://www.td.org/content/atd-blog/what-1-000-days-of-duolingo-taught-me-about-microlearning-and-gamification)
- [The psychology behind Duolingo's streak feature](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)

Band-descriptor framing (paraphrased, never quoted; *IELTS-style*, non-affiliated)
- [IELTS Writing Task 2 band descriptors — Cathoven](https://resources.cathoven.com/ielts-writing-task-2/band-descriptors)
- [Writing Task 2: Grammatical Range and Accuracy — IELTSTutors](https://ieltstutors.org/lessons/writing-task-2-grammatical-range-and-accuracy/)

Internal (read in full, not summarised from memory)
- `sidecar/bandready/srs/exercises.py`, `sidecar/bandready/srs/scheduler.py`, `sidecar/bandready/srs/__init__.py`
- `sidecar/bandready/db/models.py` (`SrsCard`, `SrsReviewLog`, `VocabEntry`, `DrillResult`)
- `docs/plan/08-vocabulary-srs.md` §5, `docs/plan/10-curriculum-progress.md` §5, §9
- `content/core-en/staging/DESIGN.md` §7, `content/core-en/staging-reading/DESIGN.md` §10

---

*This module is not affiliated with, endorsed by, or connected to IELTS, the British Council, IDP
Education, or Cambridge Assessment English. All explanations, example sentences and exercise items
described here are original and must be authored originally.*
