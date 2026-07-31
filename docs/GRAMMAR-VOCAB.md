# Grammar & Usage, and the vocabulary bank behind it

What is in the bank, how the learning algorithm works, what the data looks like, how the
prerequisite graph is enforced, how mistakes from the four skills feed back in, and how to
author a new point.

Everything here describes what is **actually shipped and measured** as of this push. Where a
number falls short of what the design asks for, it says so.

---

## 1. What the bank holds today

### 1.1 Grammar

| | Shipped | Designed target |
|---|---|---|
| Grammar points (`data/grammar.jsonl`) | **35** | 154 |
| Units covered | **5** — u05, u08, u11, u16, u17 | 17 |
| Practice items (`grammar_items`, derived) | **444** | ~1,840 |
| Contrast boards | **4** | 19 |
| Confusion sets in use | **4** | 19 |
| Distinct error codes exercised | **34** of the closed 53 | 53 |

**By CEFR level:** A1 1 · A2 4 · B1 9 · B2 15 · C1 6.
**By role:** form 19 · choice 9 · accuracy 7.
**By unit:** u05 (nouns, articles, quantifiers) 7 · u08 (the passive) 9 ·
u11 (relative and participle clauses, clefts) 9 · u16 (cohesion) 9 · u17 (complex-sentence
control) 1.

**Items by kind:** produce 70 · interpret 61 · judge 59 · gap_fill 57 · transform 46 ·
choose_form 36 · dictation 35 · error_fix 28 · order 28 · contrast_pair 12 · both_ok 9 ·
combine 3.
**Items by ladder rung:** S1 96 · S2 166 · S3 109 · S4 38 · S5 35.

Dictation items sit on **every one of the 35 points** (35 items). 16 points carry
`gravity: "global"`. The `pays_in[]` hooks land as: writing_t2 33 · reading 28 ·
writing_t1_academic 18 · speaking_p3 13 · listening 7 · speaking_p2 7 · speaking_p1 5 ·
writing_t1_gt 1.

### 1.2 Vocabulary and phrases

| | Before | Now |
|---|---|---|
| Entries (`data/vocab.jsonl`) | 343 | **1,246** |
| Entries at `entry_json` schema v2 | 0 | **903** |
| Entries with ≥ 3 practice contexts | 0 | **903** (100 % of the v2 rows) |
| Total authored context sentences | 0 | **2,709** |
| Multi-word units (chunk / frame / collocation) | 110 | **582** |
| Entries with a confusable | 0 | **800** |
| Entries with `grammar_links[]` | 0 | **903** |
| Decks | 21 | **24** |

Unit types across the new 903: frame 225 · chunk 183 · collocation 174 · word 321. The three
new decks are `academic-core`, `frames-written` and `frames-spoken`; the frame decks hold the
launchable structures a speaker can commit to before they know how the sentence ends
(*What I'd say is …*, *It is widely accepted that …*).

**The 343 original entries are still schema v1.** They work — every consumer treats a v2
field as absent-by-default — but they have no `contexts[]`, so they still practise inside
their single `own_context_sentence`. Retrofitting them is unfinished work.

---

## 2. The learning algorithm, in plain terms

The owner asked for vocabulary and phrases practised in **real sentences**, with a proper
algorithm behind it. The algorithm is called **the Ladder**, and it sits on top of the FSRS
scheduler that already runs the vocabulary bank rather than replacing it.

### 2.1 Who decides what

There are two systems and exactly one job each. Letting either answer both questions is how
this kind of module rots.

| Question | Answered by |
|---|---|
| **When** does this come back? | FSRS, from stability and difficulty |
| **What kind** of question is asked? | The Ladder, from the card's rung |
| **Which sentence** is it asked in? | The Ladder |
| **What counts as a pass?** | The Ladder |
| **Is it ready to be scheduled at all?** | The Ladder's entry gate |
| **Is it mastered?** | The Ladder — stability is not mastery |

Mechanically: `srs.scheduler.review()` is called **unmodified** on a `grammar_cards` row,
because that table names its nine FSRS columns exactly as `srs_cards` names them. The FSRS
maths is not forked. The Ladder then updates the rung and writes the log in the same
transaction.

### 2.2 The six rungs

One point = one lesson = one card. The card's rung decides what it is allowed to ask.

| Rung | Name | What the learner does |
|---|---|---|
| S0 | **Meet** | Worked examples with a *meaning* question about each, then the rule. Not scheduled. |
| S1 | **Notice** | Reads a sentence and says what it means — never what it is called. |
| S2 | **Build** | Makes the shape: gap-fill, reorder, transform, dictation. |
| S3 | **Choose** | The point of the module: two grammatical options, one situation, one right answer. |
| S4 | **Use** | Their own sentence, under a content constraint that makes the structure the easy path. |
| S5 | **Under pressure** | The same structure inside a real Task 2 or Part 3 prompt. |

A rung is climbed on **repeated success on different days with different items**, not on one
lucky answer. A rung is lost when the learner lapses at S3 or above.

### 2.3 The entry gate — nothing is scheduled until it is understood

FSRS will happily schedule something the learner never understood, forever. So a card is not
created when a point is queued; it is created after the learner has actually been through the
lesson screen (the notice set, the worked example, the rule) and answered one item. That is
why opening `/grammar/point/{id}` does not create a card and starting practice does.

### 2.4 Choosing the sentence

Every rung asks its question **inside a sentence chosen by rule, not by accident**: never the
same context twice in a row, the whole bank exhausted before anything repeats, biased toward
the register and topics the learner has been working in, twins kept at least four items
apart, short contexts early and semantic load late. At S4 the production prompt **borrows a
word from the vocabulary queue**, so one sentence services a grammar card and a vocabulary
card on a single answer. That integration is the concrete form of "practised with real
sentences".

### 2.5 What counts as a pass, and the honest bit

Free production (`produce`, `combine`, dictogloss) is graded as **four independent binary
checks**, never a score:

* **A. Present** — is the target structure there? Answered *mechanically* by a detector, and
  the model is told the result rather than asked for it.
* **B. Well-formed** — is the structure itself correctly built? Model, binary.
* **C. Fits** — does the sentence make sense for the situation, given what the structure
  means? Model, binary.
* **D.** If B or C failed, what is the **smallest edit** that fixes it?

The verdict is `A && B && C`. Nothing else — not style, not length, not whether a native
would phrase it that way. Rejecting is deliberately expensive: a rejection that cannot quote
the offending words is thrown away and the answer accepted; a rejection is re-checked and if
the two checks disagree, the learner wins; and under every rejection there is an appeal that
re-judges with the learner's own gloss. A module that cannot be told it is wrong stays wrong.

### 2.6 Mastery, and the failure mode nobody else catches

The failure mode of every SRS-only app is **green cards and wrong essays**. A point is
mastered only when the learner has produced it correctly in a *real* Writing submission or
Speaking transcript, weeks after first meeting it — and when the same error code reappears in
a real submission, the point is **demoted** regardless of how healthy its card looks. The
card is a proxy; the essay is ground truth.

---

## 3. The data model

### 3.1 The pack file

`content/core-en/data/grammar.jsonl` → table `grammar_points`. One line per point, **exactly
eight columns**:

```jsonc
{
  "id": "gr_passive_when",          // the closed id set; never invented
  "unit_id": "u08",
  "sequence_index": 70,             // global teaching order, unique, topological
  "title": "Choosing which of the two things in an event my sentence should be about",
  "cefr_level": "B2",               // A1..C2
  "role": "choice",                 // form | choice | accuracy
  "topic_id": "topic_transport",    // must exist in data/topics.jsonl
  "point_json": { /* everything else */ }
}
```

**`title` is the can-do line, not the grammatical name.** The grammatical name lives in
`point_json.grammar_name` and is a subtitle. The path then reads as a list of things the
learner will be able to *do*.

**Every teaching field lives inside `point_json`.** `loader.TABLE_COLUMNS` copies only the
columns it lists, so an extra top-level key is silently dropped at import. Inside it:
`prerequisites[]`, `priority`, `register`, `risk_tier`, `error_surface`, `gravity`,
`confusion_set`, `structure_slug`, `signal_blocklist[]`, `fixes_errors[]`, `pays_in[]`,
`criteria[]`, `teach{}`, `contrast{}` (required iff `role == "choice"`), `errors[]`,
`used_in[]` and `items[]`.

### 3.2 The four tables

Grammar could not borrow the vocabulary SRS tables — `srs_cards.entry_id` is a unique FK to
`vocab_entries`, and `srs_review_logs.review_type` is CheckConstraint-ed to the six
vocabulary exercise kinds — so it has its own parallel set, created by Alembic revision
`0003_grammar_tables`:

| Table | What it is |
|---|---|
| `grammar_points` | The authored rows, upserted by the loader. `PackMixin` provenance. |
| `grammar_items` | **Derived** from `point_json.items[]`, rebuilt on every import, exactly like `reading_questions`. |
| `grammar_cards` | One card per point per profile: six ladder columns this module owns, plus nine FSRS columns named exactly as `srs_cards` names them. |
| `grammar_review_logs` | Append-only. `item_id` is **loose text, not an FK**. |

That last point matters and is the rule the derived reading/listening tables learned the hard
way: **the importer must never delete a row that attempt history references.**
`derive_grammar_items` deletes only the items a point no longer carries, and because
`grammar_review_logs.item_id` is not a foreign key, an item dropped by a later pack version
leaves the learner's history readable rather than aborting the upgrade.

### 3.3 The vocabulary extension

`entry_json` v2 is purely additive — every v1 field is kept, and the 343 v1 rows stay valid.
The fields that make sentence practice work:

```jsonc
{
  "schema_version": 2,
  "unit_type": "chunk",              // word | chunk | frame | collocation | family
  "register": "written",             // spoken | written | both | academic
  "frequency_band": 3,               // 1..5
  "chunk": { "shape": "stem from + NOUN", "fixed_part": "stem from",
             "dependent_preposition": "from", "is_frame": false },
  "contexts": [                      // >= 3. THE FIELD THAT MAKES SENTENCE PRACTICE WORK
    { "id": "c1", "text": "...", "register": "written", "topic_id": "topic_transport",
      "skill_hook": "writing_t2", "gap_span": "stem from", "unique_answer": true }
  ],
  "confusables": [ { "term": "result in", "difference": "...", "minimal_pair": ["...","..."] } ],
  "grammar_links": ["gr_nominalisation"],
  "avoid": "Not `stem of`."
}
```

**No migration was needed to reach the runtime.** `_opt_in` copies ten named fields into
`vocab_entries` and drops the rest, so the v2 payload is read back through the join that
already exists: `vocab_sources.session_id` holds the originating `vocab_pack_entries.id` for
every seeded entry (`srs/context.py::pack_payload`). That read is wired into the vocabulary
review queue (`routes/srs.py::_queue_items`), so a seeded card arrives at the UI carrying its
`contexts[]`, its `chunk` shape and its `confusables` — verified live: opting into a frames
deck and calling `GET /api/v1/srs/due` returns entries with 3 contexts each. A learner-added
entry returns `{}` and degrades to v1 behaviour, which is the right answer — nobody authored
contexts for a word the learner typed in last Tuesday.

**Still not switched on:** `build_exercise`'s `cloze` branch blanks `own_context_sentence`
directly rather than rotating through `contexts[]`. The sentences are now *present* on every
seeded card and the grammar module's own screens use them; the vocabulary module's cloze does
not rotate yet.

---

## 4. The prerequisite graph

**This is the zero-knowledge guarantee, and it is enforced, not promised.** Three checks run
at merge time (`tools/content/merge_grammar.py`) *and* at pack-validation time
(`bandready.content.validate.validate_grammar_graph`), and all three are **errors**:

1. **No cycles.** Kahn's algorithm must consume every node.
2. **Every edge runs forwards.** For every `A → B`, `A.sequence_index < B.sequence_index`, so
   following the sequence is sufficient — the learner never meets a point that leans on
   something taught later.
3. **`sequence_index` is unique**, and every item id is unique bank-wide.

Measured on the shipped file: **acyclic, 35/35 points reachable from a zero-knowledge start,
0 order inversions.**

**20 prerequisite edges name points this pack does not carry** — `gr_noun_plural`,
`gr_article_a_an`, `gr_past_participle`, `gr_clause_types` and the like, all of them in the
119 points not yet authored. These are reported as warnings rather than errors, and the
runtime treats an absent prerequisite as satisfied (`syllabus.unmet_prerequisites` filters on
`prereq in points`). That is the correct degradation — a partial syllabus opens rather than
locking the learner out of everything — but it does mean the shipped path starts at
"countable and uncountable nouns" rather than at "building a sentence".

Answer keys are checked too, because a wrong key silently teaches something false: every
choice item must have all-distinct options and exactly one defensible key, every
`contrast_pair` key must be a permutation, every `judge` reason list must be distinct, every
type-in item must have a non-empty `expected[]` with no repeats, and every twin pair must
share its options and differ in its key.

---

## 5. How mistakes from the four skills feed in

Four routes put something into the queue, in priority order:

1. **Learner error harvest.** An error code from a Writing submission or Speaking transcript
   queues the lowest-sequence *unlocked* point whose `fixes_errors[]` names that code. If its
   own prerequisites are unmet the learner is sent to the deepest unmet one, and told why.
2. **Curriculum sequence.** The next point in `sequence_index` order whose prerequisites are
   all at rung ≥ 3.
3. **Encountered unknowns.** A word tapped in a Reading passage; a structure tapped in a model
   answer.
4. **Manual add.**

Route 1 is the strongest, because the learner has already experienced the need — which is the
condition under which instruction lands. It is also what makes the module answer the
plateaued learner's real question: not "what level am I" but "what keeps costing me marks".

**Honest status:** the writing and speaking scorers do not yet emit `§2.8` error codes at
source. `practice.harvest` infers them from the free-text corrections those scorers already
produce, using 34 two-signal regex rules, and **drops anything it cannot match rather than
guessing**. So route 1 is best-effort today and route 2 carries the load. When the scorers
start emitting codes directly, `harvest` keeps its signature and loses the guesswork.

The reverse link is the **wild failure**: when a harvested code lands on a point the learner
has already built (rung ≥ 4), the card is demoted and the point comes back. That is the only
mechanism in the app that can tell the difference between knowing a rule and using it.

---

## 6. Authoring a new point

1. **Take an id from the closed set** in `content/core-en/staging-grammar/DESIGN.md` §4.2.
   Never invent one — the ids *are* the dependency graph.
2. **Write into a staging file**, `content/core-en/staging-grammar/content/<block>.json`:

   ```jsonc
   { "staging_version": 1, "block": "<filename stem>", "authored_by": "…",
     "points": [ /* grammar.jsonl rows */ ],
     "vocab_new": [ /* vocab.jsonl rows, entry_json v2 */ ],
     "vocab_updates": [ { "id": "hea_sedentary", "op": "replace_entry_json",
                          "entry_json": { /* the whole new blob */ } } ] }
   ```

   A point row carries exactly the eight columns; a vocabulary row exactly five. A top-level
   key starting with `_` is allowed and ignored.

3. **Meaning before form.** `teach.meaning` says what the form *does to a sentence*.
   `teach.form` is short — it is the part every book already does well.
4. **Name the false rule.** `teach.false_rule` is required on every point. Learners are taught
   "*already/yet/just* → present perfect" and then produce *"I've been to Rome last year"*.
   Killing the false rule is worth more than stating the true one twice.
5. **A choice point needs all five contrast parts**: the question, the fork, the minimal pair,
   what the other choice *would have meant*, and the edge case — plus exactly three worked
   pairs whose `deciding_span_*` are exact substrings of their own sentences.
6. **Meet the item floors**: ≥ 10 items for a form or accuracy point, ≥ 16 for a choice point,
   ≥ 6 distinct contexts, at least one spoken and one written, ≥ 2 topics, a `produce` item at
   S4 and one at S5, twin pairs on every `choose_form`, and at least one `both_ok` item —
   because a module with no "both are fine, and here is the difference" item teaches the lie
   that grammar is a series of right/wrong gates.
7. **Never write a regex.** Structure detection is the sidecar's job, keyed by
   `structure_slug` from the closed 31-slug set. A slug with no detector is a lint failure.
8. **Originality.** Grammar facts and terminology are free; explanations, example sentences
   and exercises must be original. If a sentence feels familiar, it is — throw it away and
   write another making the same point. Copy says "IELTS-style", never "IELTS".
9. **Merge, build, validate:**

   ```bash
   uv run --project sidecar python -m tools.content.merge_grammar content/core-en --lint-only
   uv run --project sidecar python -m tools.content.merge_grammar content/core-en
   uv run --project sidecar python -m tools.content.build    content/core-en
   uv run --project sidecar python -m tools.content.validate content/core-en
   ```

   The merge is mechanical and idempotent: re-running over unchanged staging files produces
   byte-identical output, and `--check` exits non-zero if the pack is stale. It refuses to
   write a pack it knows to be broken; `--allow-lint-failures` overrides, and should not be
   used casually.

---

## 7. Known gaps

* **35 of 154 points.** Units 1–4, 6, 7, 9, 10, 12–15 are unauthored, and most of u17. The
  shipped path therefore starts mid-syllabus; a true beginner has no A1 foundation to stand
  on yet.
* **20 dangling prerequisite edges** to unauthored points, treated as satisfied at runtime.
* **7 of the 34 exercised error codes carry fewer than 6 items**, below the diagnostic floor;
  19 of the 53 codes are not exercised at all.
* **4 of 19 contrast boards.**
* **The 343 original vocabulary entries are still v1** — no `contexts[]`, so they practise in
  one fixed sentence rather than rotating.
* **No article/quantifier/determiner detector family.** The whole u05 noun-phrase unit
  declares `structure_slug: null`, so its S4/S5 production falls through to the model instead
  of being checked mechanically first.
* **The writing and speaking scorers still do not emit error codes** (see §5).
* **The first sitting on a new point is short.** `POST /grammar/session {point_id}` builds
  the whole list up front and the ladder caps a new card at S1, so a cold point yields only
  as many items as its S1 bank holds (2 on `gr_countability`). Climbing to S2 needs a second
  request. Correct per the ladder, thin as a first lesson; the fix is a client-side
  continuation when the list runs out, not a wider stage ceiling.
* **The daily queue is empty for a brand-new profile** until something falls due, which is
  right — but it means the only useful entry point on day one is the Path.
