# G-D1 — The Grammar & Usage module: the learning algorithm, the schema, the split, the features

**Status:** the authoring contract. Six authoring agents (G-A1–G-A6), one verify/merge agent and the
feature agents build to this document. Where this document and a research briefing disagree, **this
document wins** — it has already reconciled them, and §0.5 lists every place it overrode research.

**Companion artefact:** [`TEMPLATE.json`](TEMPLATE.json) — one complete grammar point (a contrast
pair, because that is the hard case) with its full item bank, plus one complete vocabulary entry and
one worked retrofit. Read it before you write anything. It is the ceiling and the floor.

**Inputs:** `staging-grammar/research/01-syllabus.md` (R1 — what is taught and in what order),
`02-what-moves-a-band.md` (R2 — what pays), `03-acquisition-science.md` (R3 — how it sticks),
`04-practice-pedagogy.md` (R4 — what it looks like on screen). Section references are to those files.
`staging/DESIGN.md` (speaking) and `staging-reading/DESIGN.md` (reading) are the quality bar; where a
shape already exists there we reuse it so the UI can be shared.

---

## 0. What we are building and why

Grammar today is **nothing**: no content file, no table, no route, no screen. The four skills
modules teach a learner to pass a test; this one teaches the language underneath the test, so it has
a different shape and it starts from zero.

We ship **154 grammar points in 17 units across 3 tracks, ~1,840 practice items, 19 contrast
boards**, and we grow the vocabulary bank from **343 entries to 583** with a schema that finally
lets a word be practised the way the owner asked for — inside real sentences, chosen deliberately,
under a rule.

The module has to do nine things nothing in this repo can do today:

1. take a learner with **zero English grammar** and walk them through a sequence where nothing
   depends on something not yet taught — R1's dependency graph, enforced as a merge lint, not as a
   promise;
2. teach **when to use which** as its own first-class item type with its own authored items, because
   the owner named it twice and because the corpus evidence says the top error categories are
   selection errors, not formation errors (R1 §1.4);
3. carry every point up a ladder that **ends in production** — a sentence the learner writes or says
   about a real topic, judged against the point's own criterion, because recognition does not become
   production on its own (R3 §2.1);
4. choose the **sentence** a learner practises in, at every rung, by rule rather than by accident —
   varied, diagnostic, register-tagged, topic-tagged, ~95–98% known vocabulary;
5. compose with the FSRS scheduler that already exists rather than inventing a second one: **FSRS
   decides when, the ladder decides what kind of question, which sentence, and what counts as a
   pass**;
6. detect the failure mode that kills every SRS-only app — **green cards and wrong essays** — by
   demoting a point when the same error reappears in a real Writing submission or Speaking
   transcript. The card is a proxy; the essay is ground truth;
7. interleave grammar and vocabulary in **one queue and one session**, with a shared production item
   that services a grammar card and a vocabulary card on a single answer;
8. route by **diagnosed error** rather than by level, so the band-5.5 plateau user — the modal user —
   gets a path built from what they actually get wrong;
9. connect back: every point names where it earns marks in an IELTS-style task, and every skill
   surface that can emit an error code routes into the point that fixes it.

Every field below exists to serve one of those nine. A field serving none of them was cut.

### 0.1 Grammar teaches differently — the shape of the payload

Reading's teaching unit is the **worked solution + distractor autopsy**. Speaking's and writing's is
the **band-graded model answer**. Neither works here, because grammar is not a task the learner
performs — it is a system they build, and the evidence of having built it is production in some
*other* task.

Grammar's teaching unit is the **decision, the ladder, and the bank**:

| # | Part | Field | Why it is obligatory |
|---|---|---|---|
| 1 | **The meaning, before the form** | `teach.meaning` | A learner who can conjugate the present perfect and cannot say when to reach for it has learned nothing usable (R4 §0.1) |
| 2 | **The form, stated once** | `teach.form` | Cheap. It is the part every book does well and the part that costs the fewest marks |
| 3 | **The decision** | `contrast` — five parts, REQ when `role: "choice"` | The owner's central ask. R1 §4's five-part shape: the question, the fork, the minimal pair, the wrong-choice note, the edge case |
| 4 | **The named errors** | `errors[]` with `code`, `wrong`, `right`, `why_it_happens`, `smallest_fix` | The broken form was produced by a *plausible* reasoning step. Teaching only the correct form leaves the plausible step in place (R2 §3.2) |
| 5 | **Where it pays** | `pays_in[]`, `criteria[]` | Answers "why am I learning this" with a specific answer instead of "it's grammar" |
| 6 | **The bank** | `items[]` — 10 for a form point, 16 for a choice point | A point that stops at recognition has not been taught (R1 §1.3) |

Plus the classification fields — `role`, `register`, `risk_tier`, `error_surface`, `gravity`,
`confusion_set`, `prerequisites[]` — which are what make the module a routable graph rather than a
list of lessons.

**There is no "model answer" field in this module and there must never be one.** The learner's own
sentence is the artefact; the app's job is to judge it fairly and say what a rejected version would
have meant.

### 0.2 Copyright — non-negotiable, read it twice

- **The facts and the terminology are free.** "Present perfect", "defining relative clause", the fact
  that `have/has + past participle` forms the present perfect, the fact that the passive is
  `be + past participle`, the CEFR level names — none of this is anyone's property. Use them.
- **The danger in grammar content is the canonical example sentence.** Every grammar book on earth
  teaches the third conditional; a distinctive *example* of it is an authored line and the tune is
  instantly recognisable. **The rule: if a sentence feels familiar, it is. Throw it away and write a
  different one.**
- **Named and banned**, from R1 §0.4, plus the ones this document adds. None of these may appear
  anywhere in the module, in any form, including as a "we know you've seen this one" joke:
  the cake sentence for the third conditional; "If it rains, the grass gets wet"; "Water boils at
  100°C" as an *example sentence* (fine as a stated fact, banned as the zero-conditional cliché);
  "I've lost my keys"; "John has been to Paris"; "The cat sat on the mat"; "My hovercraft is full of
  eels"; any sentence about someone called John, Mary, Tom, Sarah, Peter or Anna performing a
  textbook action; and any sentence whose subject is "Mr Smith".
- **Rules of thumb, mnemonics and cline diagrams can be authored expression.** The *idea* that the
  unreal past is a distancing device is a linguistic fact and free; a particular memorable
  formulation of it is not. Write our own formulation, in our own words, every time.
- **Band descriptors are copyrighted prose; the criteria are facts.** R2 §2's behavioural paraphrase
  is already clean-room original — reuse its wording, never a descriptor's.
- Product copy says **"IELTS-style"** and inherits the non-affiliation notice in `manifest.json`.
- Keep the house world: invented proper nouns, and the existing pack convention (Verdon, Norland,
  Ashfield, Sandmouth, Marlow, Brackenfield) so grammar examples read as the same world as the
  reading passages. No real organisations, no real statistics, no real named researchers.
- **Self-check on every sentence before you commit it:** did I read this sentence somewhere? If there
  is any doubt at all, throw it away and write a different one making the same point.

**Four claims that must not appear anywhere in our content or copy:**

1. **"78% of learner errors fall into five categories"** — widely repeated on commercial pages, no
   traceable primary citation (R1 §13, R2 §10.9). The *ranking* is safe; the percentage is not.
2. **"Three errors maximum for band 7"**, or any error-count threshold, or any "X% of sentences must
   be error-free" figure. No such threshold is published (R2 §10.1). We describe the property
   qualitatively: *frequent, complete, error-free complex sentences*.
3. **"Cambridge examiner training says…"** — asserted on several prep sites, unverifiable (R2 §10.3).
   Every claim in this module stands on the language, not on borrowed authority.
4. **Any per-structure frequency claim** ("the passive appears in 80% of Task 1 answers"). Safe
   phrasing: *"nearly every process description uses it"*, *"less common in speech"*.

### 0.3 Hard compatibility constraints (violating these breaks the running app)

Verified 2026-07-31 against `sidecar/bandready/content/validate.py`,
`sidecar/bandready/content/loader.py`, `sidecar/bandready/db/models.py`,
`sidecar/bandready/srs/scheduler.py`, `sidecar/bandready/srs/exercises.py`,
`sidecar/bandready/server/routes/vocab.py`, `sidecar/bandready/server/routes/srs.py` and
`tools/content/build.py`.

| Constraint | Why |
|---|---|
| `grammar.jsonl` needs a `ROW_SCHEMAS` entry, a `DATA_FILES` entry, a `TABLE_COLUMNS` entry and a place in `IMPORT_ORDER` | `validate_rows` (`validate.py:414`) warns-and-ignores any `data/*.jsonl` file it does not recognise, and `_read_rows` (`loader.py:663`) iterates `ROW_SCHEMAS`. Without all four the file validates as "not a recognised pack file", imports nothing, and the pack still reports OK |
| **All teaching data lives inside `point_json`** | `TABLE_COLUMNS` copies only the columns it lists, so **any extra top-level row key is silently dropped at import** (this is exactly what cost the writing module five code changes). One blob column, everything inside it |
| Row ids unique across the whole file | `validate_rows` rejects a duplicate and the pack fails **whole** |
| `topic_id` must exist in `data/topics.jsonl` | 20 ids available; `ensure_topics` will silently auto-create a typo'd one as a `general` topic, which is worse than failing |
| `tools.content.build` needs no change | `compute_counts` globs `data/*.jsonl` (`build.py:99`) and checksums every file under `data/` and `media/`. `grammar.jsonl` is counted and checksummed automatically |
| **`srs_cards.entry_id` is `ForeignKey("vocab_entries.id")` and `unique=True`** (`models.py:836`) | A grammar card **cannot** be an `srs_cards` row. `grammar_cards` is a parallel table — D1 |
| **`srs_review_logs.review_type` has `CheckConstraint("review_type IN ('flip','cloze','use_in_sentence','collocation','audio_recall','speaking_drill')")`** (`models.py:874`) | R4 §1.1 states this column is free text. **It is not.** Any grammar exercise kind written there raises an IntegrityError. Grammar logs to its own table — D1 |
| `drill_results.module` has `CheckConstraint("module IN ('reading','listening','vocab')")` (`models.py:643`) | A grammar micro-drill cannot be logged without a migration — D2 |
| Every scheduler query joins `VocabEntry` explicitly (`_scheduled_pairs`, `reviews_today`, `_log_rows`, `cards_for_entries`) | The grammar queue is a **new function alongside** `due_queue()`, never an edit to it |
| `create_card`, `review`, `preview_intervals`, `card_from_row`, `retrievability`, `_maturity`, `format_interval` touch only `state/step/stability/difficulty/due_at/last_review_at/reps/lapses/fsrs_json` | Give `grammar_cards` those nine columns and all seven functions work unmodified. **Do not fork the FSRS maths** |
| `YOUNG_STABILITY_DAYS = 7.0`, `MATURE_STABILITY_DAYS = 21.0`, `MAX_CONSECUTIVE_NEW = 3`, `SESSION_CHUNK = 20`, `DEFAULT_RETENTION = 0.9` | Import these constants. Introducing a third set of thresholds is how two schedulers start disagreeing |
| **`word_variants()` must never be used for grammar near-miss detection** (`exercises.py:177`) | It blindly generates `-s/-ed/-ing/-d/-ly`, so `grade_answer`'s `close` branch would score `walking` as "almost" when the answer is `walked`. In a tense unit that distinction *is the lesson*. Grammar gets its own near-miss policy — §2.9 |
| **`normalize_answer_text()` preserves apostrophes** (`_PUNCT_RE = [^\w\s'\-]`, `exercises.py:53`) | `don't` survives, and therefore `dont ≠ don't`. **Every item whose answer contains a contraction must list both spellings in `expected[]`.** Lint 34 |
| `vocab_entries` has **no column** for register, frequency band, word family or a context set, and `pos` is `CheckConstraint`-ed to 8 values (`models.py:787`) | The vocabulary extension ships inside `entry_json` and is read through from `vocab_pack_entries` — §3.3 |
| `_opt_in` → `IngestItem` (`vocab.py:69`, `vocab.py:1017`) copies exactly ten fields out of `entry_json` | **Every new vocabulary field is dropped at deck opt-in.** This is not a bug to route around silently; it is D3 |
| `MAX_EXAMPLES = 6`, `MAX_COLLOCATIONS = 8`, `topic_tags` clipped to 4 on create (`vocab.py:50`, `vocab.py:376`) | Author within these or the excess is discarded without warning |
| Routes and screens are **auto-discovered** — `discover_routers` (`app.py:206`) walks `server/routes/`, the renderer loads any feature exposing `route.tsx` | Grammar adds `server/routes/grammar.py` and `app/src/features/grammar/route.tsx`. **Nobody edits `app.py` or `App.tsx`** |

`point_json.schema_version` is `1` on every row this push authors. Consumers must treat every field
as **absent-by-default**.

### 0.4 THE DELIVERY BLOCKERS — read before writing a single row

Grammar cannot ship content-only. Unlike reading, there is no existing table to hang a blob on.
**Content agents do not make these changes.** Author as specified and report the dependency.

---

**D1 — the two new tables and the derived item table. Blocking; nothing works without it.**

`grammar_cards` cannot be `srs_cards` (`entry_id` is a unique FK to `vocab_entries`), and grammar
reviews cannot be logged to `srs_review_logs` (`review_type` is CheckConstraint-ed to the six vocab
kinds). Three tables, all additive, no migration of live data:

```python
class GrammarPoint(PackMixin, Base):                 # upserted by the loader from grammar.jsonl
    __tablename__ = "grammar_points"
    id: str = PK
    unit_id: str                                     # "u06"
    sequence_index: int                              # global teaching order, 1..154
    title: str                                       # the can-do line
    cefr_level: str                                  # A1..C1
    role: str                                        # form | choice | accuracy
    topic_id: str | None = FK topics.id
    point_json: str                                  # the whole teaching payload
    __table_args__ = (*pack_checks(),
        CheckConstraint("role IN ('form','choice','accuracy')", name="role"),
        CheckConstraint("cefr_level IN ('A1','A2','B1','B2','C1','C2')", name="cefr_level"),
        Index("ix_grammar_points_seq", "sequence_index", "retired"))

class GrammarItem(Base):                             # DERIVED, like reading_questions
    __tablename__ = "grammar_items"
    id: str = PK                                     # the authored item id
    point_id: str = FK grammar_points.id
    kind: str                                        # §2.8 enum
    stage: int                                       # 0..5
    register: str                                    # spoken | written | both
    confusion_set: str | None
    twin_id: str | None
    error_codes_json: str                            # '["tense_finished_time_with_perfect"]'
    topic_id: str | None
    item_json: str
    __table_args__ = (Index("ix_grammar_items_pick", "point_id", "stage", "kind"),
                      Index("ix_grammar_items_codes", "kind", "confusion_set"))

class GrammarCard(Base):                             # one card per POINT per profile
    __tablename__ = "grammar_cards"
    id: str = PK
    profile_id: str = FK profiles.id ondelete=CASCADE
    point_id: str = FK grammar_points.id
    # --- ladder state (this module owns these) ---
    stage: int = 0                                   # 0..5
    stage_successes: int = 0
    stage_days_json: str = "[]"                      # study-day keys with a success at this stage
    seen_items_json: str = "[]"                      # item ids already shown on this card
    last_wild_failure_at: str | None = None
    leech: int = 0
    # --- FSRS state (identical column names to srs_cards, so scheduler.py works unmodified) ---
    state: int = 0; step: int | None; stability: float | None; difficulty: float | None
    due_at: str; last_review_at: str | None; reps: int = 0; lapses: int = 0; fsrs_json: str
    __table_args__ = (UniqueConstraint("profile_id", "point_id"),
        CheckConstraint("state IN (0,1,2,3)", name="state"),
        CheckConstraint("stage BETWEEN 0 AND 5", name="stage"),
        Index("ix_grammar_cards_due", "profile_id", "due_at"))

class GrammarReviewLog(Base):                        # append-only, mirrors srs_review_logs
    __tablename__ = "grammar_review_logs"
    id: str = PK
    card_id: str = FK grammar_cards.id ondelete=CASCADE
    item_id: str | None                              # NOT an FK — items are re-derived on import
    rating: int                                      # 1..4
    review_type: str                                 # the §2.8 item-kind enum, 14 values
    outcome: str                                     # pass | pass_slow | self_repair | fail | hint
    stage_before: int
    error_codes_json: str = "[]"
    reviewed_at: str; elapsed_ms: int | None
    state_before: int; stability_before: float | None; difficulty_before: float | None
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 4", name="rating"),
        Index("ix_grammar_review_logs_card", "card_id", "reviewed_at"),
        Index("ix_grammar_review_logs_time", "reviewed_at"))
```

`grammar_items.id` is deliberately **not** an FK target from `grammar_review_logs`, and
`derive_grammar_items` must follow `derive_reading_questions`' hard-won rule: delete-then-upsert, and
**never delete a row an attempt references**. Since the log holds `item_id` as loose text, the
delete-and-rebuild is safe, and an item that disappears from a later pack version leaves the history
readable rather than aborting the import.

**D2 — `drill_results.module` must admit `'grammar'`.** One-line CheckConstraint change
(`models.py:643`). Needed by F4 (code-filtered drills) and by nothing else, so it is not blocking for
the teaching path — but F4 is the module's diagnostic spine, so it should land in the same push.

**D3 — the vocabulary v2 fields are dropped at deck opt-in.** `_opt_in` (`vocab.py:1017`) builds an
`IngestItem` from ten named keys and `ingest_item` writes a fixed column set. Every field §3 adds
(`unit_type`, `register`, `frequency_band`, `word_family`, `contexts[]`, `confusables[]`,
`grammar_links[]`, `chunk_slots`) is discarded. §3.3 specifies a **read-through with no migration** —
`vocab_sources.session_id` already holds the originating `vocab_pack_entries.id` for every seeded
entry, so the pack blob is one join away and nothing has to be copied. The verify agent must confirm
that join returns the v2 payload before declaring the push done.

**D4 — structure detectors live in the sidecar, keyed by slug.** R4 §11.2 asks where they go;
the answer is the sidecar (`bandready/grammar/detectors.py`), keyed by the `structure_slug` the point
declares. Content agents must not write regex — a bad regex in a content pack is a false rejection of
a correct learner sentence, which is the one failure this module cannot afford (R4 §5). §2.8 lists
the closed slug set; a point naming a slug with no detector is a **lint failure**, not a runtime
surprise.

**D5 — `POST /api/v1/srs/review` cannot rate a grammar card.** `ReviewRequest.exercise_type`
(`srs.py:42`) is a `Literal` of the six vocab kinds and the write path resolves an `entry_id`.
Grammar needs `POST /api/v1/grammar/review`. Same transaction shape, same FSRS call, its own log
table. Do not widen the vocab route.

**D6 — the writing and speaking scorers do not emit §2.8 error codes.** Without them, entry route 1
(learner error harvest) and the reverse link (a Task 2 feedback line becomes one tap into the point
that fixes it) do not exist. This is the single highest-value cross-module wire in the app and it is
a *spike*, not a certainty — R4 §11.3. **The module must be fully usable without it**: if no codes
arrive, entry route 1 is empty and route 2 (the curriculum sequence) carries the whole load. Design
for that, and treat D6 as an upgrade.

**Non-blocking defects reported, not fixed here:** `exercises.word_variants()` will happily call
`walking` a near-miss for `walked`, which is correct for vocabulary and wrong for grammar (§2.9
routes around it rather than changing it); `vocab.TOPIC_TAGS` (`vocab.py:43`) is a 20-slug enum that
does not match the 20 `topic_id` values in `topics.jsonl` (`work-careers` vs `topic_work`), so
`entry_json.topic_tags` and `entry_json.topic_id` are two vocabularies for the same thing and
`ingest_item` keeps only the first; `_clean_list(item.topic_tags, 4)` silently truncates.

### 0.5 Where this document overrides the research

| # | Source said | This document says | Why |
|---|---|---|---|
| 1 | R1 calls the teachable atom a **point** and the group of them a **unit**; R4 calls the 22–32-item teaching sitting a **unit** | **One point = one unit = one lesson = one card.** R1's 17 units become `unit_id`, a grouping for navigation only | R1's 154 points at 12–30 min each *are* R4's units. Two words for one object would have produced two schedulers |
| 2 | R3 §9.4 gives six ladder stages S0–S5; R4 §2 gives five teaching stages 0–4 | **Six stages, R3's numbering**, with R4's five mapped onto the first pass through a point — §1.4 | R3's ladder is card state over months; R4's is the shape of one sitting. They are different axes and both are needed |
| 3 | R3 §9.1 schedules an **item**; R4 §7.3 schedules a **unit** | **The card is the point.** Items are drawn fresh from the point's bank each review, tracked in `seen_items_json` | Scheduling items means the learner memorises items. The thing being scheduled is "can you still make this choice" |
| 4 | R4 §1.1: `srs_review_logs.review_type` is free text, so new kinds log without a schema change | **False.** It is CheckConstraint-ed to the six vocab kinds (`models.py:874`). Grammar gets `grammar_review_logs` | Verified in the code. R4's recommendation would have raised an IntegrityError on the first grammar review |
| 5 | R1 §2 lists conditionals as four types with `gr_cond_zero/first/second/third/mixed`; R1 §5 teaches two systems | Keep both: **two systems in the teaching, the numbers as labels applied afterwards**, and `gr_unreal_past` is a hard prerequisite of `gr_cond_second` | Learners arrive with the numbers and the rest of the internet uses them. Refusing the vocabulary helps nobody; refusing the *organising principle* is the point |
| 6 | R1 §9.2 offers scheduling exceptions or moving two points earlier | **Take both moves.** `gr_gerund_after_prep` moves to U9 (before `gr_despite_although`); `gr_noun_clause_that` moves to U9 (before `gr_passive_reporting`) | It reduces the whitelist from seven exceptions to five and removes two cross-track edges. R1 recommended it; we are doing it |
| 7 | R1 §10.5 budgets 8–12 items per form point and 14–18 per choice point | **10 and 16, as hard floors**, split into a teaching set and a review set — §2.7 | R4 §11.5 is right that a card which never repeats an item needs a review bank beyond the teaching bank. Fixed floors make the lint countable |
| 8 | R2 §0 ranks by payoff; R1 §9 orders by dependency | **Dependency decides the order; payoff decides the time budget and the diagnostic path.** `sequence_index` is topological; `priority` (1–3) is payoff | They conflict in exactly one place — sentence boundaries are R2's #1 and depend on `gr_clause_types`, which is mid-Track-B. A learner cannot be taught the comma splice before they have the word "clause" |
| 9 | R4 §6.4 proposes ~30–40 error-code slugs | **53, closed, in nine families** — §2.8 | The taxonomy is the join key for the progress screen, the drill selector, the rule sheet and (eventually) the writing scorer. Under-specifying it means merging codes later, which invalidates history |
| 10 | R4 §10 "explicitly not built" includes a grammar reference section | **Upheld, with one exception: the contrast boards are permanent screens** (F6) | A browse-all-rules section turns the module into a book. A board answering one question the learner keeps getting wrong is the screen they will come back to |
| 11 | R3 §9.3 sets the daily new budget at 10 lexical + 1 grammar point | **Kept, and made adaptive**: zero new items when the due backlog exceeds 2× the review cap, and zero new *grammar* when any point is sitting at stage ≤ 2 with a lapse in the last three reviews | A learner drowning in reviews must never be handed more, and a half-learned point must not be buried under a new one |
| 12 | R2 §3.1 puts negative inversion, clefts, mixed conditionals and inverted conditionals in Tier C ("do not put in front of a band-6 learner"); R1 keeps them as points | **Keep them as points, gate them on Track C entry, and ship the risk note in the point itself** | Cutting them leaves the learner to meet them on a prep site with no warning. Teaching them without the warning produces band-6 wreckage. The honest answer is both |

---

## 1. THE LEARNING ALGORITHM

This is the centrepiece. The owner asked for it by name: *more vocabulary and phrases, practised
with real sentences so they are actually memorised — with a proper algorithm for how that is
achieved.*

The algorithm is called **the Ladder**. It sits on top of FSRS, not instead of it. It is specified
here concretely enough that an engineer can build it, and it is designed so that a learner can *see*
it working — every screen names the rung they are on and what the next one asks for.

### 1.1 The authority boundary — where FSRS stops and the Ladder starts

The single most common way to get this wrong is to let one system answer both questions. State the
boundary once and enforce it in code review.

| Question | Answered by | Never answered by |
|---|---|---|
| **When** does this card come back? | FSRS, from `stability`/`difficulty`/rating | The Ladder. It never writes `due_at` |
| **What kind** of question is asked? | The Ladder, from `stage` | FSRS. It cannot see whether the question was a flip card or a Task 2 sentence |
| **Which sentence** is it asked in? | The Ladder, from §1.5's context rules | FSRS, which has no concept of context |
| **What counts as a pass?** | The Ladder, from §1.6 | FSRS, which is given a rating and takes it as truth |
| **Is this item ready to be scheduled at all?** | The Ladder's entry gate (§1.3) | FSRS, which has no idea whether the item was ever understood |
| **Is it mastered?** | The Ladder (§1.7) — five conditions, only one of which is FSRS's | FSRS. **Stability is not mastery.** A learner can max out stability on flip cards and produce none of it |
| **How many new items today?** | The Ladder's budget (§1.9) | FSRS |
| Does a rating of 1 mean a lapse? | FSRS, mechanically | — |

Concretely: `scheduler.review(card_row, rating, exercise_type=..., elapsed_ms=...)` is called
unmodified, on a `grammar_cards` row, with a rating the Ladder computed (§1.8). FSRS returns a new
`due_at`. The Ladder then, in the same transaction, updates `stage`, `stage_successes`,
`stage_days_json`, `seen_items_json` and writes the log row. **Two writes, one transaction, one
scheduler.**

### 1.2 The three item families, one queue

| Family | What an item is | Card table | Examples |
|---|---|---|---|
| `lex` | a lexical unit stored and retrieved as a unit | `srs_cards` (exists) | `deteriorate`; `carbon footprint`; `stem from`; `a growing body of evidence`; `that said` |
| `gram_form` | a structure plus how to build it | `grammar_cards` | the present perfect; the passive across tenses; `should have` |
| `gram_choice` | a **contrast** — two structures, one situation, one right answer | `grammar_cards` | present perfect vs past simple; `will` vs `going to`; active vs passive |

`gram_choice` items are **authored, never derived at runtime**. The interesting part of a choice item
is the situation that disambiguates it, and only a human can write a situation where both forms are
grammatical and only one is right. A runtime-generated choice item is a form test wearing a choice
test's costume.

Two card tables, **one session queue**. §1.9 says how they merge.

### 1.3 How an item enters — the gate, then four routes

**The gate: nothing is scheduled until it is understood.**

`create_card()` does **not** run when an item is queued. It runs after a first encounter (stage S0,
unscheduled) that the learner has actually passed. Three beats, identical in shape for both families:

1. **Meaning established.** `lex`: the definition, one context sentence with the target highlighted,
   TTS available. `gram`: **4–6 worked examples with the target form marked and a meaning question
   about each** (`interpret` items — the learner answers a question about the world, never about the
   grammar), then the plain-language rule. Discovery *then* explicit statement, in that order.
2. **One worked example, narrated.** Why this form here, and what the alternative would have meant.
   This is the `contrast.minimal_pair` for a choice point and `teach.worked_example` for a form point.
3. **One immediate successful retrieval** at S1 difficulty. If it fails twice, S0 repeats inside the
   same session (up to twice more) and **the item is not carded today**.

Only after beat 3 does the card exist. This closes FSRS's blind spot: it will happily schedule
something the learner never understood, forever.

**The four entry routes, in priority order.**

| # | Route | Trigger | What it queues |
|---|---|---|---|
| **1** | **Learner error harvest** | An error code emitted by a Writing submission, a Speaking transcript, a Reading review or a grammar item itself | The lowest-`sequence_index` **unlocked** point whose `fixes_errors[]` contains that code. If that point's prerequisites are unmet, queue the deepest unmet prerequisite instead and tell the learner why: *"This comes from `gr_clause_types`, which you haven't done yet — two lessons and you'll have it."* |
| **2** | **Curriculum sequence** | The learner has capacity and no harvested errors outstanding | The next point in `sequence_index` order whose prerequisites are all at `stage ≥ 3`. Vocabulary: the next deck entry, biased toward topics the learner has upcoming or recently practised |
| **3** | **Encountered unknowns** | A word tapped in a Reading passage or Listening script; a structure tapped in a model answer | A `lex` item, or the point owning that `structure_slug` |
| **4** | **Manual add** | The learner asks | Whatever they asked for, gate and all |

Route 1 is the strongest and it is why `fixes_errors[]` is a required field. The learner has already
experienced the need and already noticed the gap, which is the condition under which instruction
lands. It is also the route that makes the module answer the band-5.5 plateau user's real question,
which is not "what level am I" but "what keeps costing me marks".

**The daily new budget.**

```
new_lex_today   = 10   if backlog_ratio <= 2.0 else 0
new_gram_today  = 1    if backlog_ratio <= 2.0
                       and no owned point has (stage <= 2 and lapse in last 3 reviews)
                       else 0
backlog_ratio   = due_now / max(1, review_cap)
```

One new grammar point per day is not stingy: a point expands to 10–16 items and 12–30 minutes. The
cap exists because the failure mode of every grammar course is a learner who has met forty
structures and controls none of them.

### 1.4 The stage ladder — six rungs, and what is asked at each

**Stage determines the kind of question, independent of FSRS state.** The learner sees the rung name
on every screen; this is the "see the algorithm working" requirement.

| Stage | Learner-facing name | What the learner does | `gram` item kinds | `lex` exercise | Graded by |
|---|---|---|---|---|---|
| **S0** | **Meet** | Meets it: worked examples, a meaning question about each, then the rule | `interpret`, `discover`, then the rule card | teach card + TTS | not scheduled |
| **S1** | **Notice** | Decodes the form→meaning link without producing anything | `interpret`, `judge` | `flip` | deterministic |
| **S2** | **Build** | Produces the form with the meaning fixed — nothing to decide but the shape | `gap_fill`, `order`, `transform`, `dictation` | `cloze` in a full sentence, `audio_recall` | deterministic + typo-tolerant |
| **S3** | **Choose** | Both options are grammatical; the situation decides | `choose_form`, `contrast_pair`, `both_ok`, `judge`, `error_fix` | `collocation`, near-synonym choice | deterministic |
| **S4** | **Use** | Builds an original sentence to a specification | `produce`, `combine`, `dictation`(dictogloss mode) | `use_in_sentence` **with a mandated collocate** | mechanical pre-pass → LLM (§2.9) |
| **S5** | **Under pressure** | Uses it inside a task that would exist without it, timed | `produce`(`apply_to_task` mode), `speaking_drill` | 2-sentence exam-shaped answer using 2+ due items, timed | LLM on *use of the target only* |

Design notes, because the shape is load-bearing and someone will want to "simplify" it:

- **S1 is deliberately thin — 1 to 3 reps, then it is gone.** Recognition does not become production
  on its own. The bug to avoid is items lingering at S1 because flip cards are easy and keep passing.
  An item may not sit at S1 for more than three successful reviews; on the third it is promoted
  regardless of the two-day rule.
- **S2 carries most of the volume.** Many cheap in-context retrievals beat few expensive ones —
  Folse's finding is that three fill-in-the-blank retrievals outperformed one original-sentence task
  on the same words. Aim for the majority of a point's retrievals to land at S2 and S3.
- **S3 is its own stage because "when to use which" is a different skill from producing the form.**
  An item that can be produced but not *chosen* is not learned. This is the owner's ask, made
  structural.
- **S4 is deferred until the form is secure.** Barcroft's finding is that sentence writing can
  *hurt* form learning when form is not yet stable, because semantic processing competes for the same
  resources. Deep production comes after form stabilises, not as the means of stabilising it.
- **S5 is the point of the whole system and must be reachable, not aspirational.** It reuses the 102
  writing prompts and 108 speaking sets via `pays_in[]` and `used_in[]`. **Never end a session on
  recognition** — the last thing the learner does should be the thing the exam asks for.

**The maturity gate, mirroring `exercises.eligible_types()`.** Stage sets the *ceiling*; FSRS state
sets the *floor*, so a lapsed mature card gets an easier question than its stage alone would give:

```python
def eligible_kinds(point, card):
    stage, state = card.stage, card.state
    stability = card.stability or 0.0
    if state in (0, 1):                       ceiling = min(stage, 2)   # new / learning
    elif state == 3:                          ceiling = min(stage, 3)   # relearning: back off one
    elif stability < YOUNG_STABILITY_DAYS:    ceiling = min(stage, 3)   # young (< 7d)
    elif stability < MATURE_STABILITY_DAYS:   ceiling = min(stage, 4)   # (< 21d)
    else:                                     ceiling = stage           # mature
    return [k for k in KINDS_BY_STAGE[ceiling] if point.has_unseen_item(k)]
```

`YOUNG_STABILITY_DAYS` and `MATURE_STABILITY_DAYS` are imported from `srs.scheduler`. There is no
third set of thresholds.

### 1.5 Choosing the sentence — the rule that makes this "practised with real sentences"

The owner's point is that memorisation happens through real sentences rather than word lists. That is
an *authoring* constraint and a *selection* constraint, and both are specified.

**Selection rules, applied in order, at every review:**

1. **Never repeat a context at consecutive presentations.** Rotate through the point's bank;
   `seen_items_json` records what has been shown. Prefer the least-recently-seen. Varied contexts
   build a generalisable representation; a repeated context builds a memorised sentence.
2. **Exhaust the bank before repeating anything.** When it is exhausted, prefer `produce` items —
   they are infinite by construction because the learner supplies the content.
3. **Bias toward the register the learner has been using.** If the last two sessions were Speaking,
   pick a `register: "spoken"` item; if Writing, `"written"`. Every point must be able to answer both
   (§2.7 floors).
4. **Bias toward a `topic_id` the learner has upcoming or recently practised.** A learner working the
   environment deck meets the passive in environment sentences, and the two modules stop feeling like
   two products. This costs nothing and it is the cheapest integration in the brief.
5. **Twins are never adjacent.** A `choose_form` item and its `twin_id` must be ≥ 4 items apart or in
   different sessions. Enforced in the queue builder, never left to authoring order.
6. **Form focus early, semantic load late.** At S1–S2, prefer short contexts (`context_words ≤ 14`).
   Save the rich, meaning-heavy contexts for S3+.
7. **A `produce` item at S4 seeds its content word from the learner's due vocabulary queue** when one
   is available: *"Write a sentence about **deteriorate** using the present perfect."* One answer,
   two cards reviewed. This is literally the owner's ask and it is nearly free given both queues
   exist.

**Authoring constraints that make the above possible** — these are lints, not advice:

- **≥ 6 contexts per grammar point, ≥ 3 per vocabulary entry**, spread across registers, with at
  least one `spoken` and one `written` in each.
- **At most one unfamiliar item per context — the target.** If the learner has to decode the frame,
  they cannot learn from it. No second hard word, no proper noun that carries meaning, no
  low-frequency verb in the same clause as the target.
- **Contexts must be diagnostic.** For a `gap_fill`, exactly one answer (or one small authored set)
  fits. If three plausible forms fit the gap, the item is broken. For a `choose_form`, the
  **distractor must be grammatical and wrong only given the situation**.
- **Context ≤ 2 sentences, ≤ 30 words.** A paragraph of context turns a grammar item into a reading
  item.
- **Passive contrast items carry a preceding sentence.** The passive is chosen for discourse reasons,
  so a passive choice item is never one sentence — the rule is about what the previous sentence
  ended with. Without it the item is unanswerable and the learner learns that the passive is
  arbitrary.

### 1.6 Advancement, demotion, and the rule nothing else on the market has

**Advance S(n) → S(n+1) when all of these hold:**

- ≥ **2 successes** at the current stage;
- on ≥ **2 distinct study days** (the 4 AM rollover key from `scheduler.study_day_key`) — spacing
  between *quality levels*, not just between reps;
- on ≥ **2 distinct items** (S2 and above);
- the most recent attempt was a clean pass: no hint used, and latency below the stage threshold;
- **at most one stage advance per session per card.**

Latency thresholds, in `elapsed_ms`, which the scheduler already collects: **S1 ≤ 6 s, S2 ≤ 15 s,
S3 ≤ 20 s, S4/S5 untimed.** These are starting values, invented, and must be recalibrated from our
own logs once there are any. Ship them as a config constant, not as a literal.

**Demotion, in increasing severity:**

| Trigger | Action |
|---|---|
| Rating 1 (`again`) at S ≥ 3 | Drop **one** stage. The next presentation is preceded by a re-teach card — the rule line and one worked example — before the retry |
| 2 lapses within the last 3 reviews | Drop **two** stages, set `leech = 1`, cap at S3 for 14 days, and surface the point on the progress screen as *"this one keeps slipping"* |
| Hint used to pass at S4/S5 | No stage change, and `stage_successes` does **not** increment. A hinted pass buys nothing |
| **Wild failure** — the same `error_code` reappears in a real Writing submission or Speaking transcript | **Hard drop to S3** regardless of card state, set `last_wild_failure_at`, force the point into the next session, and open it on the contrast board rather than on a drill |
| Point mature but unproduced for 60+ days | **No demotion.** That is what FSRS's interval is for. Demote on evidence of failure only |

**The wild-failure rule is the most important row in that table.** Green cards plus wrong essays is
the exact pathology of SRS-only apps, and BandReady is in the rare position of being able to detect
it, because the writing and speaking modules already produce structured feedback. Card state is a
proxy. The essay is the ground truth. When they disagree, the essay wins.

**Typos are not failures.** `normalize_answer_text()` catches them; a near-miss is surfaced as
*"close — check the spelling"* and graded as a pass, not a lapse. A false lapse poisons FSRS's
difficulty estimate for that card and it poisons the learner's trust in the same move. But **a wrong
inflection on the target structure is wrong, full stop** — `walking` for `walked` in a tense point is
not a spelling slip, it is the lesson (§2.9).

### 1.7 Mastery

A point is `mastered` when **all five** hold:

1. `stage == 5`;
2. FSRS `stability >= MATURE_STABILITY_DAYS` (21 days);
3. **≥ 1 correct unassisted production** — a passed S5 item, or a detected correct use in a real
   Writing submission or Speaking transcript. Record which; the real submission is worth more and the
   UI says so;
4. no lapse in the last 3 reviews;
5. for a point in a `confusion_set`: **at least one passed `choose_form` item from a sibling member
   of that set.** You have not mastered the present perfect until you can decline to use it.

Mastered points stay in FSRS forever but are only ever presented at S3 or S5 — never as recognition
items. Mastery is reported as a sentence about the learner (*"You can say when something started and
is still going on"*), never as a percentage.

### 1.8 Outcome → FSRS rating

FSRS sees only 1–4. The mapping is a design decision and **it must not be left to learner
self-report**, because learners systematically mistake the fluency of recognition for the durability
of recall.

| Outcome | `outcome` value | Rating |
|---|---|---|
| Wrong; needed the answer shown | `fail` | 1 `again` |
| Wrong, then **self-repaired after a prompt** | `self_repair` | 2 `hard` — a real retrieval; credit it |
| Correct but over the stage latency threshold, or one hint used | `hint` / `pass_slow` | 2 `hard` |
| Correct, within threshold | `pass` | 3 `good` |
| Correct, fast, first attempt, at a stage **at or above** the card's current stage | `pass` | 4 `easy` |
| Typo caught by `normalize_answer_text` | `pass` | 3 `good`, with a spelling note |

Self-rating is offered at **S1 only**, where the app genuinely cannot see inside the learner's head.
At S2–S5 the grading is the app's. The existing policy that a returned rating is a *default the
learner may override* is kept — but the default is computed, not asked for.

### 1.9 Interleaving grammar and vocabulary in one session

**Within a session:**

- **Block at introduction.** A newly introduced grammar point gets its S0 package plus 4–8
  consecutive items in its first session. This is the **only** blocked segment. Forcing interleaving
  before declarative knowledge exists is an *undesirable* difficulty — Hwang's 2025 finding is
  explicit that lower-prior-knowledge learners are hurt by it.
- **Interleave from S2 onward.** Everything due at S2+ is shuffled into one queue: `lex` and `gram`
  together, drawn from `srs.due_queue()` and `grammar.due_queue()` and merged.
- **The contrast constraint, which is the one that matters.** For any card at S3+ belonging to a
  `confusion_set`, the session builder **must** include at least one item from a *sibling* member of
  that set in the same session, and must not present more than 2 same-member items consecutively.
  Without this, choice items degenerate into "the answer is whatever this block is about", and the
  learner passes every item and fails the exam.
- **`MAX_CONSECUTIVE_SAME_TYPE = 3`**, sibling of the existing `MAX_CONSECUTIVE_NEW = 3`.
- **Mix ratio ~60 : 40 `lex` : `gram` by item count**, which lands near 50 : 50 by time because
  grammar items are slower. Tune against observed session length, not against the ratio.
- **Modality alternates at least twice per session** — one audio-prompted item (`dictation`,
  `audio_recall`) and one drag/tap item (`order`, `contrast_pair`) break a wall of text, and the
  audio one is pedagogically load-bearing: learners cannot *hear* `'ve`, the reduction of `was`, the
  `'d` that is either `had` or `would`, or the `-ed` that vanishes before a consonant. If you cannot
  hear it, you do not produce it.

**Across a week:** every point that reaches S4 gets at least one S5 slot inside a real skills task
within 7 days. If the learner is not using Writing or Speaking, the module generates a self-contained
S5 slot — but tags it, because a real submission is stronger evidence and mastery condition 3 counts
them differently.

**The session shape:**

```
1  Warm-up        ~2 min    3–5 due items at S1/S2, interleaved lex+gram. Fast, high success.
2  Core review    ~10–15    The merged FSRS due queue. Stage picks the kind, §1.5 picks the
                            sentence, the contrast constraint is enforced here.
3  New            ~3–5      One S0 package. Blocked. Skipped entirely if the budget is 0.
4  Production     ~5 min    1–3 items at S4/S5. Timed. ALWAYS LAST — this is what everything
                            upstream exists to feed.
5  Fluency close  weekly    3–5 repetitions of one 60/45/30 s spoken answer using S4+ items only.
                 ~5 min     No new language. Speed is the only target.
```

### 1.10 The first session and the fiftieth

The owner's bar is that someone with zero knowledge can follow all of it. That means session one and
session fifty are genuinely different screens, and the algorithm produces the difference without a
mode switch.

| | Session 1 | Session 50 |
|---|---|---|
| **Composition** | 100% new. One S0 package (`gr_clause_svo`), 6 `lex` items | ~15% new, ~85% review across 4–6 points and 12–18 words |
| **Longest rung reached** | S1 | S3–S5; the session *ends* on production |
| **Item kinds seen** | `interpret`, `gap_fill` | `choose_form`, `both_ok`, `combine`, `produce`, `dictation` |
| **Grading** | Entirely mechanical. No LLM call is made | LLM on 1–3 items, mechanically pre-checked, with an appeal button |
| **Interleaving** | None. Blocked, single structure | Interleaved, with a forced sibling from the active confusion set |
| **Feedback** | *"Yes — the bridge is still closed. That's what this form tells you."* | *"You chose **worked**. That says the six years are over. She is still there, so English keeps the period open."* |
| **Progress shown** | The unit progress bar, 1 of 10 | Error codes that have gone quiet, and the structure board |
| **Time** | 12–15 min | 25–35 min |
| **What decides the next item** | The point's authored order | FSRS due order, filtered by the stage ceiling and the contrast constraint |

The learner is never told "you are a beginner". They are told what they can now do, one can-do line
at a time.

### 1.11 Worked trace — one point through the Ladder

`gr_pp_vs_past_simple`, from cold to mastered. This is the acceptance test for the whole algorithm.

| Day | Stage in | What the learner sees | Outcome | Rating | Stage out | `due_at` moves to |
|---|---|---|---|---|---|---|
| 1 | — | S0: six sentences with a meaning question about each; the rule; one `gap_fill` | pass | — (gate, unscheduled) | 1 | card created, due now |
| 1 | 1 | `interpret`: *"They've closed the coast road."* → *Is it open now?* | pass 4 s | 3 | 1 | +10 min |
| 1 | 1 | `judge`: *"I have finished the report yesterday."* → acceptable? | pass | 3 | 1 (1 day only) | +1 d |
| 2 | 1 | `interpret`, new sentence | pass 3 s | 4 | **2** (2 successes, 2 days, clean) | +3 d |
| 5 | 2 | `gap_fill`: *"The council ___ (publish) the figures every March since 2018."* | pass | 3 | 2 | +6 d |
| 5 | 2 | `transform`: two sentences → one with `since` | pass, slow | 2 | 2 | — |
| 11 | 2 | `gap_fill`, unseen | pass 9 s | 3 | **3** | +12 d |
| 23 | 3 | `choose_form` item A (period still open) | pass | 3 | 3 | +20 d |
| 23 | 3 | sibling from `cs_past_time_reference` (`gr_past_perfect_choice`) forced into the same session | — | — | — | — |
| 43 | 3 | `choose_form` item B — **the twin**, same sentence, opposite key | pass | 4 | **4** | +34 d |
| 43 | 4 | `produce`: *"Write one sentence about your current job using the present perfect."* Content word seeded from the due vocab queue: **deteriorate** | LLM accept | 3 | 4 | — |
| 60 | 4 | Writing module returns `tense_finished_time_with_perfect` on a Task 2 submission | **wild failure** | 1 | **3** (hard drop) | forced into next session |
| 61 | 3 | Contrast board opens, not a drill. Three worked pairs, deciding span highlighted | pass ×2 | 3, 3 | 4 | +8 d |
| 78 | 4 | `produce`, unseen prompt | pass | 3 | **5** | +21 d |
| 99 | 5 | `apply_to_task` on a real Task 2 body paragraph, timed | pass | 4 | 5 | +40 d |
| 99 | 5 | Mastery check: stage 5 ✓, stability 40 ✓, unassisted production ✓, no recent lapse ✓, sibling choice passed ✓ | **mastered** | | | |

Two things to read out of that table. First, the wild failure on day 60 is the only event that moved
the card backwards, and it came from outside the grammar module — that is the design working.
Second, the point took 99 days and 14 retrievals to reach mastery. That is the honest number, and
the app should show it, because a learner who thinks grammar takes three weeks quits in week four.

---

## 2. The grammar content schema

New pack file: **`content/core-en/data/grammar.jsonl`** → table `grammar_points`. One line per
grammar point, 154 lines when the push is complete.

### 2.1 The row — exactly eight keys, in this order

```jsonc
{
  "id": "gr_pp_vs_past_simple",   // R1's authored id. NEVER invent one; §4.2 is the closed list
  "unit_id": "u06",               // u01..u17
  "sequence_index": 61,           // global teaching order, 1..154, unique, topological
  "title": "Saying whether the time you mean is finished or still running",
  "cefr_level": "A2",             // A1 A2 B1 B2 C1 C2
  "role": "choice",               // form | choice | accuracy
  "topic_id": "topic_work",       // the point's default context topic; must exist in topics.jsonl
  "point_json": { /* everything below */ }
}
```

`title` is the **can-do line**, not the grammatical name. The unit is not called "Present Perfect
Simple"; it is called what the learner will be able to do, with the grammatical name as a subtitle
inside `point_json.teach.grammar_name`. The unit list then reads as a list of things the learner will
be able to *do*, and every completed point is a sentence about themselves that is now true. This is
the CEFR framing and it is the cheapest motivational change available to us.

Never author `source`, `pack_id`, `pack_version`, `license`, `retired` or `created_at` — the loader
supplies them from `PackMixin`.

### 2.2 `point_json` — top level

```jsonc
{
  "schema_version": 1,
  "grammar_name": "Present perfect vs past simple",   // the metalanguage, used as a subtitle only
  "prerequisites": ["gr_present_perfect", "gr_past_time_markers"],
  "unlocks_hint": "gr_pp_simple_vs_cont",             // optional, for "what this leads to"
  "priority": 1,                                       // 1..3, R2 payoff. 1 = the band-7 spine
  "insertable": false,                                 // true = no hard prereqs, usable as filler
  "register": "both",                                  // spoken | written | both
  "risk_tier": "A",                                    // A | B | C  (R2 §3.1)
  "error_surface": 2,                                  // integer: independent things that must be right
  "gravity": "local",                                  // global | local (R2 §8) — sets repair priority
  "confusion_set": "cs_past_time_reference",           // null for a point with no rival
  "structure_slug": "present_perfect",                 // sidecar detector key, D4; null if none
  "signal_blocklist": ["already", "yet", "just", "since", "ago", "yesterday"],
  "fixes_errors": ["tense_finished_time_with_perfect", "tense_open_time_with_past"],
  "pays_in": [ {"surface": "speaking_p1", "mode": "productive", "note": "..." } ],
  "criteria": ["gra"],
  "estimated_minutes": 22,
  "tool_surface": null,                                // "error_triage" | "register_switch" | null
  "teach":     { /* §2.3 */ },
  "contrast":  { /* §2.4 — REQUIRED when role == "choice", forbidden otherwise */ },
  "errors":    [ /* §2.5 */ ],
  "used_in":   [ /* §2.6 */ ],
  "items":     [ /* §2.7 */ ]
}
```

`error_surface` is our own term and it ships to learners: *the number of independent things that must
all be right for the sentence to come out clean.* `whereas` has an error surface of 1 — put it
between two full clauses and you are done. Negative-adverbial inversion has an error surface of 4.
Both read as "complex"; only one is worth a band-6 learner's nerve on test day. The number is
authored, it is an integer 1–5, and the UI shows it on Track C points as a risk warning.

### 2.3 `teach` — the explanation payload

```jsonc
"teach": {
  "can_do": "I can say whether a period of time is finished or still running.",
  "why_it_matters": "The single most common tense error in Task 2 and Part 1 — and it is a choice,
                     not a form. You can already build both.",           // ≤ 30 words
  "meaning": "…",              // REQ, 40–90 words. MEANING FIRST. What the form does to a sentence.
  "form": {                    // REQ. Short. This is the part every book already does well.
    "pattern": "have / has + past participle",
    "notes": ["`has` with he/she/it/a singular noun", "`'ve` and `'s` in speech and in a letter"],
    "negative": "have not / haven't + past participle",
    "question": "Have you + past participle …?"
  },
  "visual": {                  // REQ. One diagram, declared not drawn.
    "kind": "timeline",        // timeline | two_box | axis | cline | ladder
    "spec": { /* kind-specific, §2.3.1 */ }
  },
  "worked_example": {          // REQ. The narrated example from the entry gate, beat 2.
    "sentence": "The council has published the figures every March since 2018.",
    "why_this_form": "…",      // ≤ 35 words
    "what_the_other_would_mean": "…"   // ≤ 35 words. REQ. This is half the teaching.
  },
  "notice_set": [              // REQ, 4–6. The S0 structured-input sentences.
    { "sentence": "They've closed the coast road.",
      "question": "Is the road open now?",
      "options": ["Yes", "No", "The sentence doesn't say"],
      "key": 1,
      "why": "The present perfect ties the closing to now, so the result is still true." }
  ],
  "discovery": {               // OPTIONAL. One screen, before the rule card. Never replaces it.
    "prompt": "What is different about the situations on the left?",
    "pairs": [ ["…", "…"], ["…", "…"], ["…", "…"] ],
    "candidate_rules": [
      { "text": "…", "verdict": "right" },
      { "text": "…", "verdict": "too_narrow" },
      { "text": "…", "verdict": "keyword_trap" }   // REQ when `discovery` is present
    ]
  },
  "rule_line": "Ask: is the period of time I am talking about finished?",   // REQ, ≤ 18 words
  "false_rule": "…"            // REQ. The wrong rule the learner has probably been taught, named
                                //  and killed. ≤ 30 words.
}
```

Two fields carry unusual weight.

**`false_rule` is required on every point** and it is not decoration. Learners are taught
"*already/yet/just* → present perfect" and then produce *"I've been to Rome last year"*. Naming the
false rule and killing it is worth more than stating the true rule twice. Where you genuinely cannot
find a false rule in circulation, write the over-generalisation the form invites (`"the passive makes
writing academic, so use it everywhere"`), because that is the same failure by a different route.

**`discovery.candidate_rules` must include a `keyword_trap` distractor** when present — a
generalisation based on a signal word rather than on meaning. That distractor is the whole reason the
screen exists. Discovery without an explicit confirmation screen afterwards leaves half the learners
with a wrong rule, so `rule_line` and the rule card always follow.

#### 2.3.1 `visual.spec` by kind

| `kind` | Used for | `spec` |
|---|---|---|
| `timeline` | any tense or aspect point | `{ "now_label": "now", "marks": [{"at": -3, "label": "2018", "span_to": 0, "style": "bar"}], "caption": "…" }` — `at` is an abstract position −10..+10, `style` ∈ `point`, `bar`, `arrow`, `x` |
| `two_box` | active/passive, causative, transitivity | `{ "left": {"role": "doer", "text": "…"}, "right": {"role": "done to", "text": "…"}, "arrow": "left_to_right" \| "right_to_left", "caption": "…" }` |
| `axis` | real/unreal, near/far from reality | `{ "ends": ["this is the case", "this is not the case"], "marks": [{"pos": 0.2, "label": "…"}] }` |
| `cline` | modality (certainty, obligation), quantifiers | `{ "label": "how sure am I?", "steps": [{"text": "must", "gloss": "I'm nearly certain"}, …] }` |
| `ladder` | register, formality, politeness | `{ "rungs": [{"text": "…", "register": "spoken"}, …], "top_label": "…", "bottom_label": "…" }` |

The renderer owns the drawing. The content owns the data. **No SVG, no image files, no unicode
diagrams in strings.**

### 2.4 `contrast` — the five parts, REQUIRED when `role: "choice"`

This is the owner's central ask, and R1 §4 fixes its shape. All five parts are lint-enforced; a
choice point missing one **fails the merge gate**.

```jsonc
"contrast": {
  "with": ["gr_past_simple_regular"],       // REQ, 1–3 rival point ids, all real
  "board_id": "gb_pp_vs_past",              // REQ. The permanent contrast-board screen (F6)
  "question": "Is the period of time I am talking about finished?",    // 1. REQ, ≤ 16 words
  "fork": [                                                            // 2. REQ, 2–3 branches
    { "answer": "Finished — yesterday, in 2019, last month, when I was a student",
      "selects": "past simple",
      "point_id": "gr_past_simple_regular" },
    { "answer": "Still open or not named — today, this year, so far, since 2019, ever",
      "selects": "present perfect",
      "point_id": "gr_present_perfect" }
  ],
  "minimal_pair": {                                                    // 3. REQ
    "a": { "text": "I worked at the Marlow depot for six years.",
           "means": "The six years are over. I am not there now." },
    "b": { "text": "I have worked at the Marlow depot for six years.",
           "means": "The six years are still running. I am there now." },
    "only_difference": "worked / have worked"     // REQ, and it must really be the only difference
  },
  "wrong_choice_note": "…",                                            // 4. REQ, ≤ 45 words
  "edge_case": {                                                       // 5. REQ
    "text": "American English will often use the past simple where British English prefers the
             present perfect. Our content is British-standard. Know it exists; then ignore it.",
    "ignore_the_rest": true
  },
  "stronger_test": "…",         // OPTIONAL but strongly wanted: a test that needs no time expression
  "worked_pairs": [             // REQ, exactly 3. These render on the contrast board (F6).
    { "a": "…", "b": "…", "deciding_span_a": "…", "deciding_span_b": "…", "gloss": "…" }
  ]
}
```

**Part 4, `wrong_choice_note`, is the field most likely to be written badly.** It must say what the
other form *would communicate here* — not that it is wrong. "Incorrect — the answer is *have
worked*" teaches nothing. *"You chose **worked**. That says the six years are over. She is still
there, so English keeps the period open."* is a sentence a learner can act on tomorrow.

**`worked_pairs[].deciding_span_*` must be exact substrings** of the corresponding sentence. The UI
highlights them on reveal; a span that does not match silently highlights nothing and the feature
quietly dies.

### 2.5 `errors[]` — the anti-pattern cards

2–5 entries per point. These are as important as the teaching, because the broken form was produced
by a *plausible* reasoning step, and naming that step is what interrupts it.

```jsonc
"errors": [
  { "code": "tense_finished_time_with_perfect",   // REQ, from the §2.8 closed enum
    "wrong": "I have visited the Norland reserve in 2019.",     // REQ, authored, never copied
    "right": "I visited the Norland reserve in 2019.",          // REQ
    "why_it_happens": "The learner has been taught that the present perfect is the 'experience'
                       tense and reaches for it whenever the sentence is about experience — the
                       named date is not part of that rule, so it does not fire.",   // REQ, ≤ 45 words
    "smallest_fix": "Delete one word: `have`.",                 // REQ. One edit, named as an edit.
    "gravity": "local",                                          // global | local
    "frequency": "very_high",                                    // very_high | high | medium
    "l1_note": null                                              // OPTIONAL, ≤ 20 words
  }
]
```

**`smallest_fix` must be a single named edit** — delete one word, change one letter, move one word,
swap one form, change one punctuation mark. A learner can rehearse an edit. They cannot rehearse a
rule they have to reason from under time pressure.

**Every `wrong` string is authored by you and is displayed with error chrome** (a struck-through chip,
never plain prose the learner might read as a model), and its `right` counterpart is shown for at
least as long. Exactly one error per string. No `wrong` string may appear at stage 0–2.

### 2.6 `pays_in`, `criteria`, `used_in` — the connective tissue

```jsonc
"pays_in": [                     // REQ, 1–4 entries
  { "surface": "writing_t2",     // §2.8 enum, 8 values
    "mode": "productive",        // productive | receptive
    "note": "Comparing now with the past is half of every 'has X changed' essay.",   // ≤ 20 words
    "model": "Attitudes to commuting have shifted sharply since the pandemic." }     // REQ, authored
],
"criteria": ["gra"],             // REQ, 1–3 from: gra cohesion lexis task fluency pronunciation
"used_in": [                     // OPTIONAL, 0–3. Real ids from the existing packs.
  { "module": "writing", "ref_id": "wp_core_08", "quote": "…" }
]
```

**Never scope a point to "this improves your GRA".** Grammar leaks into the other three criteria
under other names — punctuation into Coherence, hedging into Task Response, referencing into
Cohesion, word form and dependent prepositions into Lexical Resource, mid-clause repair into
Fluency — and several of the highest-value points pay into two. That is why `criteria` is a list.

`pays_in[].mode` matters: Reading and Listening hooks are **receptive**. The learner is not being
asked to produce nominalisation in order to read; they are being asked to unpack it. A receptive hook
changes what the item looks like — `interpret` and `judge`, never `produce`.

`used_in[].ref_id` must resolve against `data/writing_prompts.jsonl`, `data/speaking_cards.jsonl`,
`data/reading_passages.jsonl` or `data/listening_scripts.jsonl`. A dangling ref is a lint failure; a
one-way link decays into a dead field.

### 2.7 `items[]` — the practice bank

**Floors, by role. These are hard lints.**

| `role` | Total | S1 `notice` | S2 `build` | S3 `choose` | S4/S5 `use` | Review reserve |
|---|---|---|---|---|---|---|
| `form` | **≥ 10** | ≥ 2 | ≥ 5 | ≥ 1 | ≥ 2 | ≥ 3 of the above marked `review_only` |
| `accuracy` | **≥ 10** | ≥ 2 | ≥ 4 | ≥ 2 | ≥ 2 | ≥ 3 |
| `choice` | **≥ 16** | ≥ 3 | ≥ 4 | **≥ 7** | ≥ 2 | ≥ 5 |

Plus, on every point regardless of role:

- **≥ 6 distinct contexts**, ≥ 1 `register: "spoken"` and ≥ 1 `register: "written"`;
- **≥ 1 `dictation` item** on any point whose form contains a reduced or contracted auxiliary
  (`'ve`, `'s`, `'d`, `was/were`, `-ed`, `have been`, `would have`);
- **≥ 2 distinct `topic_id` values** across the bank;
- **≥ 1 `produce` item at S4 and ≥ 1 at S5**; the S5 item's `payload.mode` is `apply_to_task` or
  `speaking_drill`.

And on every `choice` point additionally:

- **every `choose_form` item has a `twin_id`** pointing at an item with the same `options[]` and the
  opposite `key` — **≥ 2 complete twin pairs**;
- **≥ 1 `both_ok` item** — one item in five in a choice block should be one where both options are
  correct and mean different things. Without them the module teaches a lie, that English grammar is a
  series of right/wrong gates. With them it teaches the thing the owner actually asked for: that the
  choice carries meaning;
- **key balance 40–60%** across the options within the point;
- **no S3 `choose_form`, `contrast_pair` or `both_ok` item contains a signal word from the point's
  `signal_blocklist`** — `already`, `yet`, `just`, `last year`, `since`, `ago`, and whatever else
  mechanises this particular choice. Signal words are how learners avoid learning this; in a
  forced-choice item they hand over the key. At stage 3 they are contraband. They are *encouraged* at
  stage 2, where the meaning is fixed and only the shape is in question.
  **Carve-out:** `judge` and `error_fix` items may and often should contain one, because their task
  is to notice that the signal word and the verb form are in conflict. That is the opposite of a
  giveaway.

**The common item envelope.** Every item, every kind:

```jsonc
{
  "id": "gi_pp_vs_past_simple_09",          // §4.3 convention
  "kind": "choose_form",                     // §2.8 enum, 14 values
  "stage": 3,                                // 0..5
  "register": "spoken",                      // spoken | written | both
  "topic_id": "topic_work",                  // must exist in topics.jsonl
  "skill_hook": "speaking_p1",               // OPTIONAL, §2.8 enum
  "error_codes": ["tense_finished_time_with_perfect"],   // REQ, 1–2, closed enum
  "confusion_set": "cs_past_time_reference", // REQ on S3 items, else null
  "twin_id": "gi_pp_vs_past_simple_10",      // REQ on choose_form, else null
  "review_only": false,                       // true = never shown in the first pass; review bank
  "difficulty": 2,                            // 1..3, orders the bank inside a stage
  "decision_cue": "she is still there",       // REQ on choose_form/judge/both_ok/contrast_pair.
                                              // MUST be an exact substring of the item's context.
  "payload": { /* kind-specific, §2.7.1 */ },
  "expected": ["have worked", "'ve worked"],  // null when LLM-graded
  "feedback": {
    "why_key": "…",                           // REQ, ≤ 35 words. Names the MEANING, not the verdict.
    "feed_forward": "…"                       // REQ, ≤ 20 words, imperative. What to do next time.
  }
}
```

`feedback.feed_forward` is one imperative sentence and it is the only part that changes behaviour:
*"Before you choose, ask whether the time period has closed."* Feedback at the "self" level
("great job!", "you're a natural") is **banned by name** — it is the least effective level and it is
what most language apps ship.

`decision_cue` being a required, substring-checked span is the difference between a choice item and a
guessing game. **If the author cannot quote the words in the context that decide it, the item is
unanswerable and must be rewritten.** The UI highlights that span on reveal.

#### 2.7.1 `payload` by kind

```jsonc
// interpret — form → meaning. The cheapest item in the module and the most likely to be cut by
// someone who thinks it looks too easy. It cannot be answered by pattern-matching a keyword.
"payload": { "sentence": "…", "question": "Is the road open now?",
             "options": ["Yes", "No", "The sentence doesn't say"], "key": 1 }
// variant: timeline placement
"payload": { "sentence": "…", "question": "Where does this event sit?", "mode": "timeline",
             "slots": ["before now", "now", "after now"], "key": 0 }

// discover — one screen, opt-in, always followed by the rule card. See teach.discovery.
"payload": { "uses_teach_discovery": true }

// gap_fill — TWO BLANKS MAXIMUM. Type-in, never multiple choice. First-letter hint after 10 s.
"payload": { "context": "…", "stem": "The council ___ (publish) the figures every March since 2018.",
             "blanks": 1, "lemma_hints": ["publish"] }
// `expected` lists EVERY accepted surface form including contracted and un-apostrophed spellings.

// order — draggable chips. Best type in the module for word-order fossilisation.
"payload": { "tokens": ["nobody", "knows", "why", "the", "scheme", "failed"],
             "accepted_orders": [[0,1,2,3,4,5]], "context": "…" }
// The author lists every legal order. Refusing `Often, she goes` teaches a falsehood.

// transform — the workhorse, and the one most at risk of being graded unfairly.
"payload": { "given": "The council cut the budget in March.",
             "instruction": "Rewrite so the budget is what the sentence is about.",
             "starter": "The budget ___" }
// `expected` carries every accepted answer. The normaliser accepts contraction/expansion,
// optional `that` after a reporting verb, and either clause order when `either_order: true`.

// choose_form — the centre of the module.
"payload": { "context": "Nadia is showing a visitor round the depot where she still works.",
             "stem": "I ___ here for six years.",
             "options": [ { "text": "worked",
                            "why_this_means": "That the six years are over and she has left." },
                          { "text": "have worked",
                            "why_this_means": "That the six years are still running." } ],
             "key": 1 }
// EVERY option carries why_this_means. Every distractor is grammatical in isolation.

// contrast_pair — assign the meanings. The purest test of the form–meaning link we can build.
"payload": { "sentences": ["He's been repainting the hall.", "He's repainted the hall."],
             "meanings": ["You can see the paint on his hands.", "The hall is finished."],
             "key": [0, 1] }

// judge — two-stage: accept/reject, then (only on reject) pick the reason from a closed list.
"payload": { "context": "…", "sentence": "I have finished the report yesterday.",
             "acceptable": false,
             "reasons": ["the time is finished and named", "the action is not finished",
                         "the wrong verb form", "nothing wrong — it's fine"],
             "reason_key": 0 }

// both_ok — the honesty item. Both correct, different meanings.
"payload": { "context": "…", "stem": "She ___ in Ashfield for a decade.",
             "options": [ {"text": "lived", "why_this_means": "…"},
                          {"text": "has lived", "why_this_means": "…"} ],
             "key": "both",
             "follow_up": { "question": "Which one tells you she is still there?", "key": 1 } }

// error_fix — click the wrong span, type the replacement. One error per item. Never at stage ≤ 2.
"payload": { "sentence": "Despite the cost was high, the scheme went ahead.",
             "error_span": "Despite the cost was high",
             "accept_overlap_tokens": 1 }
// `expected` = ["although the cost was high", "despite the high cost", "despite the cost"]

// dictation — plays once at natural speed. Replay allowed and logged. GRADED ON TARGET TOKENS ONLY.
"payload": { "audio_text": "I'd been commuting for nearly two hours a day by then.",
             "scored_tokens": ["I'd", "been", "commuting"],
             "mode": "dictation",                    // dictation | dictogloss
             "speed": 1.0, "replay_slow": 0.8 }
// The targeted diff is the fairness trick. A whole-string grader fails good learners for
// spelling `commuting` wrong, and that is not what the item is testing.

// combine — two or three short sentences into one, using a named device. LLM-graded.
"payload": { "parts": ["The scheme cost forty million pounds.",
                       "It cut journey times by nine minutes.",
                       "Most commuters noticed nothing."],
             "required_device": "non_defining_relative",
             "model_combinations": ["…", "…", "…"] }
// Three models, shown AFTER the attempt, labelled "three ways, all fine". That is itself the lesson.

// produce — free production under a content constraint chosen so the structure is the path of
// least resistance. State the target explicitly; learners route around anything they don't want.
"payload": { "mode": "sentence",                     // sentence | apply_to_task | dictogloss
             "prompt_text": "Your city has just opened a new tram line. Say one thing that has
                             changed since it opened.",
             "required_structure": "present_perfect",
             "seed_from_vocab_queue": true,           // §1.5 rule 7
             "min_words": 8, "max_words": 30,
             "task_ref": null }                       // REQ when mode == "apply_to_task"

// speaking_drill — injects a structure target into the live voice session; the post-session
// evaluator confirms the structure appeared in the transcript. The plumbing already exists.
"payload": { "injection": "Ask the learner a question whose natural answer compares how something
                           is now with how it was before they arrived.",
             "required_structure": "present_perfect",
             "turns": 2 }
```

### 2.8 The closed enums

Every one of these is closed. A value outside the set is a merge-gate failure, because these are the
join keys between the content, the drill selector, the progress screen, the rule sheet and — when D6
lands — the writing scorer. Three vocabularies for one concept means none of them can aggregate.

**Item kinds — 14.**
`interpret` · `discover` · `gap_fill` · `order` · `transform` · `choose_form` · `contrast_pair` ·
`judge` · `both_ok` · `error_fix` · `dictation` · `combine` · `produce` · `speaking_drill`

Eleven of the fourteen are **fully mechanical**. Only `combine`, `produce` and the `dictogloss` mode
of `dictation` need a model call. This module works with the network off, and the LLM path degrades
to a `transform` or `order` item on the same structure — never to nothing.

**Error codes — 53, in nine families.** The slug is the join key; the family letter is only for
grouping on the progress screen.

*T — time and aspect (9):* `tense_finished_time_with_perfect` · `tense_open_time_with_past` ·
`tense_sequence_lost` · `tense_drift_in_paragraph` · `aspect_state_verb_continuous` ·
`aspect_result_vs_activity` · `future_will_in_time_clause` · `future_evidence_vs_intention` ·
`past_perfect_decorative`

*M — modality (6):* `modal_bare_infinitive` · `modal_strength_mismatch` · `modal_obligation_source` ·
`modal_deduction_negative` · `modal_perfect_form` · `hedge_missing_overclaim`

*V — voice (5):* `passive_be_missing` · `passive_participle_wrong` · `passive_on_intransitive` ·
`passive_unnecessary` · `passive_agent_needed`

*C — condition and the unreal (4):* `conditional_would_in_if` · `conditional_wrong_system` ·
`unreal_past_missing` · `unless_misused`

*S — sentence boundary and clause joining (7):* `comma_splice` · `fragment_no_main_verb` ·
`run_on_fused` · `double_connector` · `connector_relation_reversed` · `subordinator_vs_preposition` ·
`parallelism_broken`

*R — reference, relative and reporting (7):* `relative_pronoun_wrong` ·
`relative_resumptive_pronoun` · `relative_comma_meaning` · `participle_dangling` ·
`reference_ambiguous` · `embedded_question_inversion` · `reported_backshift_wrong`

*N — the noun phrase (7):* `article_missing_singular` · `article_generic_over_the` ·
`article_specific_missing_the` · `countable_uncountable` · `quantifier_wrong_class` ·
`agreement_subject_verb` · `agreement_across_distance`

*L — lexico-grammar (5):* `preposition_dependent` · `verb_pattern_wrong` · `word_form_wrong` ·
`comparative_form` · `word_order_adverb`

*G — register and texture (3):* `register_spoken_in_writing` · `register_written_in_speech` ·
`linker_overused`

The four codes in family L are **vocabulary problems wearing grammar clothes**. They are authored
here so the diagnosis is one taxonomy, but the *remedy* is an SRS card with sentence-level cloze and
collocation, not a grammar lesson. Roughly a fifth of the "grammar" a learner needs is chunk
knowledge, and saying so out loud is part of the teaching.

**Confusion sets — 19.**
`cs_past_time_reference` · `cs_perfect_aspect` · `cs_past_aspect` · `cs_present_aspect` ·
`cs_future_selection` · `cs_past_habit` · `cs_voice_choice` · `cs_conditional_system` ·
`cs_obligation_source` · `cs_certainty_strength` · `cs_relative_defining` · `cs_article_reference` ·
`cs_quantifier_polarity` · `cs_verb_pattern` · `cs_contrast_marker` · `cs_purpose_marker` ·
`cs_dummy_subject` · `cs_reporting_stance` · `cs_register_channel`

Every point with `role: "choice"` declares one. Every set must have **≥ 2 member points**, or it is
not a contrast and the point is mis-roled.

**Structure detector slugs — 31, owned by the sidecar (D4).**
`present_simple` · `present_continuous` · `present_perfect` · `present_perfect_continuous` ·
`past_simple` · `past_continuous` · `past_perfect` · `past_perfect_continuous` · `future_will` ·
`future_going_to` · `future_continuous` · `future_perfect` · `used_to` · `passive_any` ·
`passive_agentless` · `causative_have_get` · `modal_simple` · `modal_perfect` · `conditional_real` ·
`conditional_unreal_present` · `conditional_unreal_past` · `wish_unreal` · `relative_defining` ·
`relative_non_defining` · `participle_clause` · `noun_clause_that` · `embedded_question` ·
`reported_speech` · `gerund_after_preposition` · `comparative` · `cleft`

A point may declare `structure_slug: null` (most accuracy points have no detectable shape). A point
declaring a slug not in this list is a **lint failure** — the detector must exist before the content
references it, or S4/S5 grading silently falls back to asking the LLM whether the structure is
present, which is exactly the question §2.9 exists to keep away from the LLM.

**Skill surfaces — 8.**
`speaking_p1` · `speaking_p2` · `speaking_p3` · `writing_t1_academic` · `writing_t1_gt` ·
`writing_t2` · `reading` · `listening`

**Criteria — 6.** `gra` · `cohesion` · `lexis` · `task` · `fluency` · `pronunciation`

### 2.9 Grading — mechanical first, and the LLM answers only binary questions

The failure mode that kills modules is specific: **a learner writes a correct sentence the grader did
not anticipate, the grader says no, and the learner stops trusting the app.** Once trust is gone,
every subsequent correction is noise. So the grading is asymmetric by construction: **accepting is
cheap, rejecting is expensive.**

**Mechanical grading (11 of 14 kinds).** `normalize_answer_text()` then set membership against
`expected[]`, exactly as `grade_answer()` already does — with **one grammar-specific change that is
not optional**:

```python
def grammar_close(expected, given, item):
    """Grammar's own near-miss policy. NEVER call exercises.word_variants() here."""
    # A wrong inflection on the target is WRONG — in a tense point that distinction is the lesson.
    for e in expected:
        if levenshtein(e, given) <= 1 and same_inflection_class(e, given):
            return True          # a genuine spelling slip
    return False                 # everything else, including `walking` for `walked`
```

`same_inflection_class` compares the final morpheme: `walked`/`walkd` is a slip; `walked`/`walking`
is not. This is ten lines and it is the difference between a tense drill that teaches tense and one
that awards "almost" for the wrong tense.

**Free-production grading (`produce`, `combine`, `dictation` in `dictogloss` mode).** Four
independent binary checks. **Never a score** — LLM-as-judge alignment with human judgement is strong
for binary decisions and degrades as rubric granularity increases.

| Check | Question | Answered by |
|---|---|---|
| **A. Present** | Does the sentence contain the target structure? | **Mechanically, by the D4 detector.** The LLM is *told* the result |
| **B. Well-formed** | Is the target structure itself correctly built? | LLM, binary |
| **C. Fits** | Does the sentence make sense for the prompt's situation, given what this structure means? | LLM, binary |
| **D. Minimal fix** | If B or C failed, what is the smallest edit that fixes it? | LLM, string |

Verdict is `A && B && C`. Nothing else. Not style, not length, not "would a native say it that way",
not the quality of the opinion.

**If the detector does not fire, we still do not reject.** We ask the model which structure the
writer is using; if the answer is the target, we accept and log a detector gap for the content agent.
A detector that misses is our bug, not the learner's error.

The prompt keeps the four properties of `exercises.CHECK_SENTENCE_PROMPT` that already work — JSON
only, temperature 0, offline degradation to `{checked: false, suggested_rating: 3}` rather than an
exception — and adds four that are load-bearing:

1. **"The automatic check says the structure WAS/WAS NOT detected."** Hands the model the fact
   instead of asking it.
2. **"Only mark `structure_correct` false if you can quote the exact words that are wrong."** And
   then the *code* enforces it: **if `structure_correct` is false but `offending_span` is empty or is
   not a substring of the learner's sentence, the rejection is discarded and the answer is
   accepted.** Ten lines, and the strongest single fairness mechanism available to us.
3. **"Ignore every error that is not part of the target structure"** — spelling, articles,
   prepositions, punctuation and word choice elsewhere. Focused feedback outperforms unfocused
   feedback, especially for weaker learners, and it stops the module becoming a red-pen machine.
4. **"If you are unsure, answer true."** Deliberate leniency bias. Correct for a learning tool.

**Asymmetric confirmation.** Accept on one call. A rejection costs a second call at temperature 0
with the options shuffled; **if the two calls disagree, accept.**

**Never checked, ever, and this list goes in the code as a comment so no future prompt edit
reintroduces it:** topic · opinion · truth · length · formality (unless the point *is* about
register) · spelling outside the target span · punctuation outside the target span · vocabulary
choice · whether it is "natural" · whether a native would say it.

**The appeal.** Under every rejection: **"I think this is right"**. One text field ("what did you
mean?"), re-run with the learner's gloss appended and an explicit *"the learner says they meant X; if
the sentence can carry that meaning, accept it"*. If it now accepts, the card is rated normally and
the disagreement is logged. If it still rejects, the response leads with the learner's own meaning:
*"To say that, you'd write ___ — here's why your version says something different."* Every appeal is
a labelled data point about where our items and detectors are wrong. **A module that cannot be told
it is wrong will stay wrong.**

### 2.10 What `validate.py` and `loader.py` need — the exact wiring

For the verify agent. Six edits, all additive.

**`validate.py`**

```python
# 1. DATA_FILES
"grammar.jsonl": "grammar_points",

# 2. a row model
class GrammarPointRow(_Row):
    id: str
    unit_id: str
    sequence_index: int
    title: str
    cefr_level: str = "B1"
    role: str = "form"
    topic_id: str | None = None
    point_json: dict[str, Any] | str

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ("form", "choice", "accuracy"):
            raise ValueError("role must be form | choice | accuracy")
        return v

    @field_validator("cefr_level")
    @classmethod
    def _cefr(cls, v: str) -> str:
        if v not in ("A1", "A2", "B1", "B2", "C1", "C2"):
            raise ValueError("cefr_level must be A1..C2")
        return v

# 3. ROW_SCHEMAS
"grammar.jsonl": GrammarPointRow,

# 4. validate_relations — the checks that need the whole file, not one row
#    (a) every prerequisites[] id resolves to a row in this file or to an installed point;
#    (b) sequence_index is unique and every prerequisite's sequence_index is strictly lower,
#        except for the five whitelisted listing/order mismatches in §4.1;
#    (c) no cycle in the prerequisite graph (Kahn's algorithm over the parsed rows);
#    (d) every item id is unique across the whole file;
#    (e) every twin_id resolves to an item in the same point with the same options and a
#        different key;
#    (f) every contrast.with[] id resolves;
#    (g) every confusion_set has >= 2 member points.
#    (a)-(c) are the zero-knowledge guarantee. They must be errors, not warnings.

# 5. iter_grammar_items(row) -> Iterator[dict], the shared extractor, mirroring
#    iter_reading_questions: parse point_json, yield each items[] entry with its point id.
```

**`loader.py`**

```python
# 6. TABLE_COLUMNS
"grammar_points": (
    ("id", False), ("unit_id", False), ("sequence_index", False), ("title", False),
    ("cefr_level", False), ("role", False), ("topic_id", False), ("point_json", True),
),

# 7. IMPORT_ORDER — after topics.jsonl (FK on topic_id), position otherwise free
"grammar.jsonl",

# 8. derive_grammar_items(session, rows) — modelled EXACTLY on derive_reading_questions,
#    including its hard-won rule: delete the old set, then upsert. grammar_review_logs holds
#    item_id as loose text rather than as an FK, so the delete is unconditional and an item
#    dropped by a later pack version leaves the history readable instead of aborting the import.

# 9. import_pack — call it in the "deriving questions" phase:
counts["grammar_items"] = derive_grammar_items(session, rows_by_file.get("grammar.jsonl") or [])
```

`tools/content/build.py` needs **no change**: `compute_counts` globs `data/*.jsonl` and the checksum
walk covers everything under `data/`.

---

## 3. The vocabulary schema, extended

### 3.1 What the 343 entries lack, and why each gap costs something

The existing entry is a good word card. It is not enough to run §1's ladder, and the shortfalls are
specific:

| Missing | What breaks without it |
|---|---|
| **Chunks and phrases as first-class items** | 110 of 343 entries are multi-word (32%), but nothing in the schema says so, so a chunk is scheduled, clozed and graded as if it were a word. Roughly half of natural English is prefabricated — a bank that is two-thirds single words misrepresents the language, and it is the reason learners produce grammatically flawless sentences nobody would say |
| **`register`** | The learner produces essay grammar in Part 1 and spoken vocabulary in Task 2. §1.5 rule 3 cannot bias by register if no entry declares one |
| **`frequency_band`** | The scheduler cannot tell a C1 word that is worth a long tail from a B2 word that should be mastered and dropped, and the "at most one unfamiliar item per context" rule (§1.5) cannot be checked |
| **`word_family`** | Word form is a top-ten error and learners feel it as grammar (`economic` / `economical` / `economically`). Four cards for four forms is four times the work; one entry with a family is one card |
| **A real context set** | `own_context_sentence` is **one** sentence and it is also the cloze source, so the cloze is the *same sentence every time*. That is memorising a sentence, not learning a word. §1.5 rule 1 needs ≥ 3 rotating contexts |
| **`confusables`** | S3 for vocabulary is near-synonym discrimination, and there is nothing to discriminate against |
| **`grammar_links`** | The `produce` item cannot seed its content word from the vocabulary queue under a structural constraint (§1.5 rule 7) unless someone has said which words fit which structures |
| **Dependent prepositions as part of the item** | `depend on`, `a solution to`, `an increase in` are stored — if at all — inside a free-text `collocations[]` string with no marking, so they cannot be drilled as the chunk they are |

### 3.2 `entry_json` v2

Additive. Every v1 field is kept, unchanged, so the 343 existing rows stay valid while they are
retrofitted. Consumers treat every v2 field as absent-by-default.

```jsonc
{
  "schema_version": 2,

  // ---- v1, unchanged ----
  "headword": "stem from",
  "ipa": "stem frɒm",
  "pos": "phrase",                      // MUST stay inside the 8-value CheckConstraint (§0.3)
  "definition": "to be caused by something, or to have started from it",
  "own_context_sentence": "Most of the delays stem from a shortage of qualified drivers.",
  "example_sentences": ["…", "…"],      // ≤ 6, MAX_EXAMPLES
  "collocations": ["…"],                // ≤ 8, MAX_COLLOCATIONS
  "topic_tags": ["work"],               // ≤ 4 on create
  "topic_id": "topic_work",
  "cefr_level": "B2",

  // ---- v2 ----
  "unit_type": "chunk",                 // REQ. word | chunk | frame | collocation | family
  "register": "written",                // REQ. spoken | written | both | academic
  "frequency_band": 3,                  // REQ. 1..5 — see the table below
  "syllables": 2,                       // OPTIONAL, for the pronunciation hook
  "word_family": [                      // REQ when unit_type == "word" and a family exists
    { "form": "stem", "pos": "verb", "note": "the base; also a noun with a different meaning" }
  ],
  "chunk": {                            // REQ when unit_type is chunk | frame
    "shape": "stem from + NOUN",
    "fixed_part": "stem from",
    "open_slots": [ { "slot": "NOUN", "fills": ["a shortage", "poor planning", "the way X is funded"] } ],
    "dependent_preposition": "from",    // null when there is none. Drives the collocation drill.
    "is_frame": false                   // true = a sentence frame, not a phrase (e.g. "It is X that Y")
  },
  "contexts": [                          // REQ, ≥ 3. THE FIELD THAT MAKES §1.5 WORK.
    { "id": "c1",
      "text": "Most of the delays stem from a shortage of qualified drivers.",
      "register": "written",
      "topic_id": "topic_transport",
      "skill_hook": "writing_t2",
      "gap_span": "stem from",           // REQ, exact substring of `text`. The cloze blank.
      "unique_answer": true,             // REQ. Author asserts: only this fills the gap here.
      "note": null },
    { "id": "c2", "text": "…", "register": "spoken",  "topic_id": "topic_work",  "gap_span": "…",
      "unique_answer": true },
    { "id": "c3", "text": "…", "register": "academic","topic_id": "topic_economy","gap_span": "…",
      "unique_answer": true }
  ],
  "confusables": [                       // REQ where one honestly exists, 0–3 otherwise
    { "term": "result in",
      "difference": "`stem from` looks backwards to the cause; `result in` looks forwards to the
                     effect. They point in opposite directions.",
      "minimal_pair": ["The delays stem from underfunding.", "Underfunding results in delays."] }
  ],
  "grammar_links": ["gr_sub_reason_result", "gr_nominalisation"],   // 0–3 grammar point ids
  "avoid": "Not `stem of`, and not `stemmed from` for a cause that is still operating.",  // ≤ 25 words
  "audio_hint": null
}
```

**`frequency_band`** is a 1–5 judgement, not a corpus lookup, and it is used for the "at most one
unfamiliar item per context" check and for the SRS tail length:

| Band | Meaning | Tail |
|---|---|---|
| 1 | Core, every learner has it by A2 — appears only as *frame vocabulary* inside contexts | never carded |
| 2 | Common, B1 | short |
| 3 | The productive target zone — B2, high utility in the exam | standard |
| 4 | C1, precise, worth having but not worth grinding | standard |
| 5 | Low-frequency, kept only because a specific task needs it | long tail, recognition-biased |

**A context sentence may contain at most one item at band ≥ 4 — the target.** That is the operational
form of the 95–98% known-vocabulary rule and it is lint-checkable against our own bank.

**`contexts[].unique_answer`** is an assertion the author makes and the merge gate spot-checks: with
the `gap_span` removed, only the target (or one small authored set) fits. If three plausible items
fit the gap, the item is broken and teaches nothing. The check is mechanisable — run the gapped
sentence past the configured LLM and see what it proposes — and the verify agent should do it on a
sample rather than on all 583.

### 3.3 How v2 reaches the runtime without a migration

`_opt_in` → `IngestItem` → `ingest_item` copies ten named fields and drops the rest (D3). The fix is
not to widen `IngestItem` — that would mean a migration on `vocab_entries` for eight columns that are
pure content and never change per learner. **The join already exists:**

```
vocab_pack_entries.id ──┐
                        │  _opt_in passes SourceRef(kind="seed", item_id=row.id)
                        │  ingest_item writes it to vocab_sources.session_id
                        └─→ vocab_sources.session_id   WHERE module = 'seed'
                                    │
                                    └─→ vocab_sources.entry_id ─→ vocab_entries.id
```

So:

```python
def pack_payload(session, entry_id: str) -> dict[str, Any]:
    """The authored v2 blob behind a seeded vocab entry, or {} for a learner-added one."""
    row = session.execute(text(
        "SELECT p.entry_json FROM vocab_sources s "
        "JOIN vocab_pack_entries p ON p.id = s.session_id "
        "WHERE s.entry_id = :e AND s.module = 'seed' AND p.retired = 0 "
        "ORDER BY s.created_at LIMIT 1"), {"e": entry_id}).first()
    return json.loads(row[0]) if row else {}
```

One indexed lookup (`ix_vocab_sources_entry` exists), read-only, no migration, and it stays correct
across pack upgrades because the loader upserts `vocab_pack_entries` by authored id. The exercise
builder merges it under the serialized entry so `build_exercise` sees `contexts`, `confusables` and
`chunk` without knowing where they came from. **Learner-added entries return `{}` and degrade to v1
behaviour**, which is the correct outcome — nobody authored contexts for a word the learner typed in
last Tuesday.

Optional follow-up, recommended but not blocking: add `vocab_entries.pack_entry_id TEXT` and set it
in `ingest_item` when `source.kind == "seed"`, which turns the two-hop join into one column. It
changes nothing about the content.

### 3.4 What this changes about the vocabulary exercises

Three existing exercise kinds get better and none needs a new kind:

- **`cloze` stops repeating itself.** It currently blanks `own_context_sentence`, which is one fixed
  string. With `contexts[]` it rotates, and `cloze_from_sentence()` is called with
  `contexts[i].text` and `gap_span` instead of doing its own regex hunt — which also fixes the
  phrase case, where the existing matcher requires the chunk to appear in exactly its citation form.
- **`collocation` becomes the dependent-preposition drill.** `chunk.dependent_preposition` is the
  blank, `collocations[]` supplies the frames. `depend on`, `result in`, `a solution to`, `an
  increase in`, `aware of`, `responsible for` are not rule-derivable and must never be taught as if
  they were. They are chunks; chunks belong on the scheduler; the exercise kind already exists.
- **`use_in_sentence` becomes grammar's S4 rung.** Same exercise, one added constraint: *"Use
  **deteriorate** in a sentence with the present perfect."* One exercise, two teaching goals, one
  answer reviewing two cards. This is the single most valuable integration in the brief and it is
  what the owner meant by *vocabulary practised with real sentences*.

### 3.5 Bank targets

| | Now | After | Rule |
|---|---|---|---|
| Entries | 343 | **583** | 343 retrofitted to v2 + 240 new (40 per author) |
| Multi-word (`chunk` / `frame` / `collocation`) | 110 (32%) | **≥ 278 (48%)** | ≥ 28 of each author's 40 new entries are multi-word |
| Entries with ≥ 3 contexts | 0 | **583 (100%)** | lint |
| Entries with a `confusable` | 0 | **≥ 350** | where one honestly exists; do not invent one |
| Decks | 21 | **23** | adds `frames-written` and `frames-spoken`, 48 entries each |
| Entries with `grammar_links` | 0 | **≥ 200** | every grammar point wants 1–2 natural content words |

The two new decks hold **sentence frames** — `unit_type: "frame"`, `chunk.is_frame: true` — the
launchable structures a speaker can commit to before they know how the sentence ends (`The thing is
…`, `What I'd say is …`, `It depends on whether …`) and their written counterparts (`It is widely
accepted that …`, `A further consideration is …`, `While it is true that …, …`). Speech gives zero
build time, so it needs structures that open a frame and leave the content slot empty. Nothing in the
bank does that today, and it is the cheapest fluency intervention available.

---

## 4. The split — six authors, 154 points, 1,840 items, 583 vocabulary entries

### 4.1 Point allocation

Blocks are **thematically whole on purpose**: a `confusion_set` must never be split across two
authors, because twins, sibling items and contrast boards all need one hand and one voice.

| Agent | Block key | R1 units | Points | Choice pts | Items | Vocabulary |
|---|---|---|---|---|---|---|
| **G-A1** | `foundation` | U1 The English clause · U2 Present time and the auxiliary system · U3 Past time | 29 | 4 | **314** | retrofit `topic-education` `topic-family` `topic-communication` `topic-sport` (61) + 40 new |
| **G-A2** | `future-nouns` | U4 Future time · U5 Countability, quantity, articles · U14 Comparison and describing data | 22 | 7 | **262** | retrofit `topic-economy` `topic-money` `topic-transport` `topic-housing` (60) + 40 new |
| **G-A3** | `perfect-modality` | U6 The perfect · U7 Modality | 23 | 11 | **296** | retrofit `topic-health` `topic-food` `topic-science` (45) + 40 new |
| **G-A4** | `voice-patterns` | U8 Voice · U9 Coordination and adverbial subordination · U12 Verb patterns | 26 | 9 | **314** | retrofit `topic-environment` `topic-technology` `topic-work` (45) + 40 new |
| **G-A5** | `unreal-clauses` | U10 Conditionals and the unreal past · U11 Relative and noun clauses · U13 Reported speech | 25 | 9 | **304** | retrofit `topic-globalisation` `topic-culture` `topic-tourism` (45) + 40 new |
| **G-A6** | `accuracy-cohesion` | U15 Accuracy under load · U16 Cohesion and text grammar · U17 Range without wreckage | 29 | 10 | **350** | retrofit `topic-urbanisation` `topic-media` `topic-crime` `upgrade-pairs` (87) + 40 new |
| | | | **154** | **50** | **1,840** | **343 retrofit + 240 new = 583** |

Every author's 40 new entries split: **24 into their own topic decks** (≥ 12 multi-word) and **16
into the shared frame decks** — 8 to `frames-written`, 8 to `frames-spoken`, all multi-word, all
`unit_type: "frame"`.

**Phasing, if the whole thing cannot ship at once.** R1 §10.5 is right: the module is useful the day
Track B exists and useless with only Track A. Order of merge: **G-A3, G-A4, G-A5 first** (that is
Track B, 74 points, the band-6-to-7 core), then **G-A6** (Track C polish plus the accuracy cluster
that everything leaks into), then **G-A1, G-A2** (Track A foundation plus the noun phrase). A learner
entering at the band-5.5 plateau — the modal user — needs the first group and nothing else.

**The five whitelisted order/listing mismatches.** `unit_id` is thematic; `sequence_index` is
topological; they are not the same thing, and the lint must whitelist exactly these five rather than
treat them as cycles:

| Point | Listed in | Scheduled after | Owner |
|---|---|---|---|
| `gr_future_perfect` | U4 | `gr_perfect_concept` (U6) | G-A2 authors, G-A3's prerequisite |
| `gr_comparatives`, `gr_as_as` | U14 | — (schedule early, Track A) | G-A2 |
| `gr_prepositions_core` | U15 | — (schedule early, Track A) | G-A6 |
| `gr_passive_nonfinite` | U8 | `gr_verb_patterns_core` (U12) | G-A4 (both) |
| `gr_change_language` | U14 | `gr_prepositions_dependent` (U15) | G-A2 authors, G-A6's prerequisite |

R1's other two mismatches are removed by override 6: `gr_gerund_after_prep` moves into U9 and
`gr_noun_clause_that` moves into U9, both under **G-A4**, which makes `gr_despite_although` (U9,
G-A4) and `gr_passive_reporting` (U8, G-A4) clean.

**Cross-author prerequisites.** Four edges cross a block boundary and each is named so nobody blocks
on a conversation: `gr_past_participle` (G-A3) is required by `gr_passive_concept` (G-A4);
`gr_noun_clause_that` (G-A4) by `gr_reported_statements` (G-A5); `gr_modal_perfect` (G-A3) by
`gr_cond_third` (G-A5); `gr_quantifiers_fine` (G-A2) by `gr_relative_quantifier` (G-A5). The
prerequisite ids are fixed by R1 and by §4.2 — **you may reference a point you do not own, and you
may not rename one.**

### 4.2 The 154 ids — closed, from R1 §2, non-negotiable

The ids **are** the dependency graph. An author who invents one breaks the topological lint for
everybody. Author exactly these, one row each.

**G-A1 · `foundation` · 29 points**

```
u01  gr_clause_svo  gr_be_present  gr_pronoun_subject  gr_noun_plural  gr_article_a_an
     gr_adjective_position  gr_there_is  gr_possessive  gr_word_order_place_time
     gr_capital_fullstop
u02  gr_present_simple  gr_third_person_s  gr_aux_system  gr_questions_wh  gr_short_answers
     gr_adverb_frequency  gr_present_continuous  gr_stative_verbs  gr_pres_simple_vs_cont
     gr_imperative
u03  gr_past_simple_regular  gr_past_simple_irregular  gr_was_were  gr_past_aux_did
     gr_past_time_markers  gr_past_continuous  gr_past_simple_vs_cont  gr_used_to
     gr_narrative_sequence
```

**G-A2 · `future-nouns` · 22 points**

```
u04  gr_future_will  gr_future_going_to  gr_future_pres_cont  gr_future_pres_simple
     gr_future_choice  gr_future_time_clause  gr_future_continuous  gr_future_perfect
u05  gr_countability  gr_quantifiers_basic  gr_quantifiers_fine  gr_article_the
     gr_article_zero  gr_article_decision  gr_demonstratives
u14  gr_comparatives  gr_as_as  gr_comparative_grading  gr_double_comparative  gr_multiples
     gr_change_language  gr_superlative_hedge
```

**G-A3 · `perfect-modality` · 23 points**

```
u06  gr_past_participle  gr_perfect_concept  gr_present_perfect  gr_pp_for_since  gr_pp_adverbs
     gr_been_vs_gone  gr_pp_vs_past_simple  gr_pp_continuous  gr_pp_simple_vs_cont
     gr_past_perfect  gr_past_perfect_choice
u07  gr_modal_grammar  gr_modal_ability  gr_modal_permission  gr_modal_requests
     gr_modal_obligation  gr_must_vs_have_to  gr_mustnt_vs_dont_have_to  gr_modal_possibility
     gr_modal_deduction_present  gr_modal_past_forms  gr_modal_perfect  gr_modal_hedging
```

**G-A4 · `voice-patterns` · 26 points**

```
u08  gr_passive_concept  gr_passive_forms  gr_passive_when  gr_passive_by_agent
     gr_passive_process  gr_passive_not  gr_passive_reporting  gr_causative  gr_passive_nonfinite
u09  gr_coordination  gr_clause_types  gr_sub_reason_result  gr_sub_contrast  gr_gerund_after_prep
     gr_despite_although  gr_sub_time  gr_sub_purpose  gr_so_such_too_enough  gr_noun_clause_that
u12  gr_verb_patterns_core  gr_verb_obj_infinitive  gr_meaning_change_verbs  gr_gerund_subject
     gr_infinitive_purpose  gr_adj_prep_patterns  gr_causative_verbs
```

*(`gr_gerund_after_prep` and `gr_noun_clause_that` are listed in U9 by override 6; `gr_causative_verbs`
and the rest of U12 follow.)*

**G-A5 · `unreal-clauses` · 25 points**

```
u10  gr_cond_zero  gr_cond_first  gr_cond_first_uses  gr_unreal_past  gr_cond_second
     gr_cond_second_uses  gr_cond_third  gr_cond_mixed  gr_cond_alternatives  gr_wish_family
u11  gr_relative_defining  gr_relative_omission  gr_relative_nondefining
     gr_relative_prepositions  gr_relative_quantifier  gr_relative_which_clause
     gr_participle_clause  gr_embedded_question  gr_cleft
u13  gr_reported_statements  gr_backshift_choice  gr_reported_questions  gr_reported_commands
     gr_reporting_verbs  gr_reporting_academic
```

**G-A6 · `accuracy-cohesion` · 29 points**

```
u15  gr_sv_agreement_core  gr_sv_agreement_hard  gr_comma_splice  gr_comma_rules
     gr_punctuation_rest  gr_prepositions_core  gr_prepositions_dependent
     gr_prepositions_phrases  gr_word_order_adverbs  gr_dummy_subjects  gr_ed_ing_adjectives
     gr_confusable_pairs
u16  gr_reference_pronoun  gr_substitution_ellipsis  gr_linkers_by_function  gr_linker_restraint
     gr_given_new  gr_topic_sentence_grammar  gr_nominalisation  gr_noun_phrase_expansion
     gr_parallel_structure
u17  gr_inversion_negative  gr_inversion_conditional  gr_concession_structures
     gr_emphasis_structures  gr_stance_adverbials  gr_complex_sentence_control
     gr_spoken_vs_written_grammar  gr_error_triage
```

Two of G-A6's points carry `tool_surface`: `gr_error_triage` → `"error_triage"` and
`gr_spoken_vs_written_grammar` → `"register_switch"`. They are procedures over the whole module as
well as points inside it, so the app surfaces them twice — as a lesson in the path and as a tool
reachable from any writing or speaking screen. They still meet the item floors.

### 4.3 Id conventions — collision-proof by construction

```
Grammar point       gr_<slug>                     CLOSED SET, §4.2. Never invent one.
Practice item       gi_<point-slug>_<NN>          NN = 01.., zero-padded, unique within the point.
                                                  <point-slug> is the point id minus its `gr_`.
                                                  e.g. gi_pp_vs_past_simple_09
Contrast board      gb_<a>_vs_<b>                 e.g. gb_pp_vs_past, gb_must_vs_have_to.
                                                  19 of them, one per confusion_set.
Vocabulary (new)    <deck-prefix>_<slug>          Existing convention. Prefixes below.
Vocabulary (frame)  fw_<slug> / fs_<slug>         frames-written / frames-spoken
Template            gr_tm_00 / gi_tm_00_NN / vt_tm_stem_from    RESERVED — do not author
```

Deck prefixes, matching the 343 existing rows so nothing collides: `edu_` `fam_` `com_` `spo_`
(G-A1) · `eco_` `mon_` `tra_` `hou_` (G-A2) · `hea_` `foo_` `sci_` (G-A3) · `env_` `tec_` `wor_`
(G-A4) · `glo_` `cul_` `tou_` (G-A5) · `urb_` `med_` `cri_` `upg_` (G-A6). Check your prefix against
`data/vocab.jsonl` before you start; the merge gate fails on any duplicate id.

### 4.4 Bank-wide floors the verify agent checks after the merge

1. Exactly **154** rows in `grammar.jsonl`; `sequence_index` is a permutation of 1..154.
2. Every one of the **50 choice points** has a complete five-part `contrast` and ≥ 2 twin pairs.
3. Every one of the **19 confusion sets** has ≥ 2 member points and exactly one `board_id` shared by
   its members.
4. Every one of the **53 error codes** is carried by ≥ 6 items bank-wide, and by items from ≥ 2
   different points. A code exercised by one point is not a diagnosis, it is a label.
5. Every one of the **8 skill surfaces** appears in ≥ 8 points' `pays_in[]`; `reading` and
   `listening` appear with `mode: "receptive"` in ≥ 6 each — R2 §6.7 is a real gap and it must not be
   quietly dropped because it is unusual.
6. Every **risk tier** is represented: ≥ 10 points at `A`, and every point at `C` carries an explicit
   risk note in `teach.why_it_matters` naming what to do instead.
7. **≥ 45 points** carry `gravity: "global"`; those points' `sequence_index` values are, on average,
   lower than the local ones. Global errors come first in the sequence, always.
8. `dictation` items exist on ≥ 30 points and total ≥ 60 bank-wide.
9. **583** vocabulary entries; ≥ 278 multi-word; every entry `schema_version: 2` with ≥ 3 contexts.
10. No `topic_id` carries more than 14 points' worth of default context — grammar should not read as
    if it happens only in cities.

---

## 5. Staging format, the merge contract, and the lints

### 5.1 File location and shape

Each authoring agent writes **one** file:

```
content/core-en/staging-grammar/content/<block-key>.json
```

e.g. `content/core-en/staging-grammar/content/perfect-modality.json`. A single JSON object:

```jsonc
{
  "staging_version": 1,
  "block": "perfect-modality",          // must equal the filename stem and §4.1's block key
  "authored_by": "G-A3:perfect-modality",
  "points": [ /* the block's grammar.jsonl rows, in sequence_index order */ ],
  "vocab_new": [ /* new vocab.jsonl rows, entry_json at schema_version 2 */ ],
  "vocab_updates": [                     // retrofits of rows that already exist
    { "id": "hea_sedentary", "op": "replace_entry_json", "entry_json": { /* the WHOLE new blob */ } }
  ]
}
```

**A row is the JSONL row, not a nested wrapper.** A `points` entry has exactly the keys
`id · unit_id · sequence_index · title · cefr_level · role · topic_id · point_json`, in that order. A
`vocab_new` entry has exactly `id · lemma · pos · deck · entry_json`. Never author `source`,
`license`, `retired` or `created_at` — the loader supplies them.

A top-level key beginning with `_` (e.g. `_readme`) is permitted and ignored by the merge. Nothing
else outside the five named keys is.

`TEMPLATE.json` is itself a valid staging file, with one point, one new vocabulary entry and one
retrofit. It lives at `staging-grammar/TEMPLATE.json`, **outside** `staging-grammar/content/`, so the
merge glob never picks it up and its reserved ids never enter the pack. **Copy its shape exactly.**

### 5.2 The merge step (mechanical, no judgement)

```
for each file in staging-grammar/content/*.json, sorted by filename:
    for row in file.points:
        append json.dumps(row, ensure_ascii=False) + "\n"  ->  data/grammar.jsonl
    for row in file.vocab_new:
        append json.dumps(row, ensure_ascii=False) + "\n"  ->  data/vocab.jsonl
    for u in file.vocab_updates:
        find the single line in data/vocab.jsonl whose "id" == u.id
        replace ONLY its "entry_json" value; leave every other column untouched
        (if no such line exists, or more than one does, FAIL the merge)
then sort data/grammar.jsonl by sequence_index          # the only reordering the merge performs
then: uv run --project sidecar python -m tools.content.build content/core-en
```

Nothing else. No transformation, no id rewriting, no defaulting. If a merge needs to *fix* anything,
the staging file is wrong and must be sent back. Re-running the merge over the same staging files
must produce byte-identical outputs — that idempotence is what makes a re-run safe.

Expected counts after the full merge: **`grammar_points` 154 · `grammar_items` ~1,840 · `vocab`
583.** `tools.content.build` rewrites `manifest.counts` and `manifest.checksums` and re-validates the
whole pack. **Nobody hand-edits `manifest.json`.**

The merge is only useful once D1 has landed — `grammar.jsonl` will otherwise validate, checksum
cleanly, and be **ignored with a warning** by `validate_rows`. The verify agent must confirm
`GET /api/v1/grammar/points/gr_pp_vs_past_simple` returns a non-null `point_json.contrast` before
declaring the push done.

### 5.3 Lint rules the merge gate runs (write to pass these)

**Structural**

1. `block` == filename stem == §4.1's block key; every point id belongs to that block per §4.2.
2. Points carry exactly the 8 allowed keys; `vocab_new` exactly 5; `vocab_updates` exactly 3.
3. Every point id is in the §4.2 closed set, appears exactly once across all staging files, and is
   not already in `data/grammar.jsonl`.
4. `sequence_index` unique across all files; the union is exactly 1..154.
5. `unit_id` matches §4.2's allocation; `role` matches R1's Δ column; `cefr_level` within ±1 band of
   R1's assignment.
6. `topic_id` exists in `data/topics.jsonl`.

**The dependency graph — the zero-knowledge guarantee**

7. Every `prerequisites[]` id resolves to a point in some staging file or already in the pack.
8. **No cycles.** Kahn's algorithm over all 154 points must consume every node.
9. For every edge `A → B`, `A.sequence_index < B.sequence_index`, **except** for the five whitelisted
   pairs in §4.1. Any other inversion is an error, not a warning.
10. Every point's `teach.meaning`, `teach.form` and `contrast` strings use no grammatical term that
    is not introduced by a point with a lower `sequence_index`. The gate checks a 34-term glossary
    (`past participle`, `auxiliary`, `clause`, `subordinate`, `gerund`, `determiner`, …) against the
    point that introduces it. **This is the lint that makes "someone with zero knowledge can follow
    all of it" true rather than aspirational.**

**The teaching payload**

11. `teach` has `can_do`, `why_it_matters`, `meaning`, `form`, `visual`, `worked_example`,
    `notice_set` (4–6), `rule_line`, `false_rule`. All non-empty.
12. `worked_example.what_the_other_would_mean` is present and is not a restatement of
    `why_this_form`.
13. `visual.kind` is one of the five; `visual.spec` matches that kind's shape.
14. Every `notice_set[]` question asks about **the world**, not about the grammar. Gate heuristic: the
    question contains none of the glossary terms in lint 10 and none of `tense`, `form`, `correct`,
    `grammatical`.
15. `discovery`, when present, has exactly one `right` and one `keyword_trap` candidate rule.
16. `errors[]` has 2–5 entries; every `code` is in the §2.8 enum; every `smallest_fix` names exactly
    one edit (matches `^(Delete|Add|Change|Move|Swap|Insert) `).
17. `pays_in[]` has 1–4 entries with a real `surface`, a `mode`, and a non-empty authored `model`
    sentence. `used_in[].ref_id` resolves against the existing packs.
18. `contrast` is present **iff** `role == "choice"`; when present it has all five parts, `with[]`
    resolves, `board_id` is shared by every member of the `confusion_set`, `worked_pairs` has exactly
    3, and every `deciding_span_*` is an exact substring of its own sentence.
19. `minimal_pair.only_difference` really is the only difference: the two sentences differ in exactly
    the token(s) it names.
20. `structure_slug` is `null` or in the §2.8 detector set.

**The item bank**

21. Item floors met per role (§2.7 table), including the ≥ 3 / ≥ 5 `review_only` reserve.
22. Every item id matches §4.3, is unique bank-wide, and its `<point-slug>` matches its own point.
23. `kind` in the 14-value enum; `stage` in 0..5; the kind is legal at that stage (§1.4 table).
24. `error_codes[]` has 1–2 entries, all in the §2.8 enum.
25. `decision_cue` present and a **verbatim substring** of the item's `payload.context`, its
    `payload.sentence`, or one of its `payload.sentences[]`, on every `choose_form`, `judge`,
    `both_ok` and `contrast_pair` item.
26. Every `choose_form` has a `twin_id`; the twin exists in the same point, has an identical
    `options[].text` list, and a **different** `key`. **≥ 2 complete pairs per choice point.**
27. Key balance across each point's `choose_form` items is 40–60% per option.
28. **≥ 1 `both_ok` item per choice point**, with a `follow_up` that has a single key.
29. No S3 `choose_form`, `contrast_pair` or `both_ok` item contains a word from the point's
    `signal_blocklist`. (S2 items may and should; `judge` and `error_fix` are carved out at every
    stage, because noticing the clash between the signal word and the form *is* their task.)
30. Every `choose_form` distractor is grammatical in isolation — the gate checks it against the
    detector set and against the point's own `errors[].wrong` strings; a distractor that matches an
    authored error string is a form question wearing a choice question's clothes.
31. Every passive contrast item's `payload.context` contains ≥ 1 complete preceding sentence.
32. `gap_fill` has ≤ 2 blanks. `order` lists every legal token order. `error_fix` has exactly one
    error and never appears at `stage ≤ 2`.
33. `dictation.scored_tokens` are all present in `audio_text`; `audio_text` ≤ 16 words.
34. **Every `expected[]` containing an apostrophe also lists the un-apostrophed spelling**, and vice
    versa. (`normalize_answer_text` preserves apostrophes, so `dont ≠ don't`.)
35. `feedback.why_key` and `feedback.feed_forward` present on every item; `feed_forward` is
    imperative (begins with a verb) and ≤ 20 words; neither contains the strings `great`, `well done`,
    `you're doing`, `nice work`.
36. ≥ 6 distinct contexts per point, ≥ 1 `spoken` and ≥ 1 `written`, ≥ 2 distinct `topic_id`.
37. ≥ 1 `produce` at S4 and ≥ 1 at S5; the S5 item is `apply_to_task` or `speaking_drill`.

**Vocabulary**

38. Every `vocab_new` and every `vocab_updates` blob is `schema_version: 2` with `unit_type`,
    `register`, `frequency_band` and ≥ 3 `contexts[]`.
39. Every `contexts[].gap_span` is an exact substring of its own `text`; ≥ 1 `spoken` and ≥ 1
    `written`/`academic` context per entry.
40. No context contains a second item at `frequency_band ≥ 4` beyond the target — checked against the
    merged bank.
41. `chunk` present **iff** `unit_type` ∈ `chunk`/`frame`; `word_family` present when `unit_type ==
    "word"` and a family exists.
42. `pos` is one of the 8 values `vocab_entries` permits; `example_sentences` ≤ 6; `collocations`
    ≤ 8; `topic_tags` ≤ 4.
43. `grammar_links[]` resolve to real point ids.
44. 40 new entries per file, ≥ 28 multi-word, 8 in `frames-written` and 8 in `frames-spoken`.
45. Every `vocab_updates.id` exists in `data/vocab.jsonl` exactly once.

**Originality and safety**

46. **No 8-gram is shared between any two sentences** in the file, or with any string already in the
    pack. This catches an agent copy-pasting its own work as well as anything worse. **Five
    exemptions, because each is a duplicate the pedagogy requires** — the gate must whitelist exactly
    these and no others:
    (a) `errors[].wrong` against its own `errors[].right` — they differ by one token by design;
    (b) two items linked by `twin_id` — a twin pair shares its stem deliberately, and a twin pair
    that does *not* share it is a lint failure of its own (lint 26);
    (c) `teach.notice_set[].sentence` against `teach.discovery.pairs[][]` — discovery re-shows
    sentences the learner has already answered, which is the point of the screen;
    (d) `contrast.minimal_pair` against `contrast.worked_pairs[]` and against any `choose_form` stem
    in the same point;
    (e) a `vocab_updates` retrofit against the row it replaces — a retrofit keeps every v1 string and
    only adds v2 fields, so it will legitimately match the shipped pack everywhere.
47. No banned example sentence from §0.2 appears in any string, in any form.
48. No forbidden claim from §0.2 appears: no "78%", no error-count threshold, no "%" attached to a
    band, no "examiners are trained to", no per-structure frequency percentage.
49. No real organisation, real statistic or real named person appears in any sentence. Proper nouns
    come from the house world.
50. No string contains the word "IELTS" except in the phrase "IELTS-style".

### 5.4 Post-merge, before hand-off

```
uv run --project sidecar python -m tools.content.build content/core-en
uv run --project sidecar python -m tools.content.validate content/core-en
```

then a live check that the payload actually reaches the app and that the ladder actually runs:

```
GET  /api/v1/grammar/points                          → 154 rows, sequence_index ascending    (D1)
GET  /api/v1/grammar/points/gr_pp_vs_past_simple     → point_json.contrast present, 5 parts   (D1)
GET  /api/v1/grammar/next?limit=10                   → 10 items, none repeated, stage-legal   (D1)
POST /api/v1/grammar/review {card_id, rating, kind}  → 200, due_at moves, stage recomputed    (D5)
GET  /api/v1/grammar/drills?code=comma_splice        → ≥ 6 items from ≥ 2 points              (D2)
GET  /api/v1/vocab/entries/{seeded_id}               → entry.contexts present, ≥ 3            (D3)
```

The verify agent confirms all six before declaring the push done. **If D1 has not landed, the content
is still correct and still merges — but `validate_rows` warns "not a recognised pack file" and drops
all 154 rows, silently.** That must be reported as a release blocker, not quietly shipped.

---

## 6. Features, ranked by learner impact

Each feature names exactly which payload fields it consumes, so content and UI cannot drift. The
renderer lives at `app/src/features/grammar/`, exposing `route.tsx`; the sidecar at
`bandready/server/routes/grammar.py`, exposing `router`. Both are auto-discovered.

---

### F1 — The Path · impact **very high** · cost **M**

**Consumes:** `sequence_index`, `prerequisites[]`, `title`, `cefr_level`, `unit_id`, card `stage`.

The learning path a beginner walks, and the answer to "where do I start". A single vertical list of
**can-do lines**, grouped by unit, each in one of five states: locked · next · in progress ·
practised · mastered. A locked point says *why*: **"Needs: Main clause vs subordinate clause"**, and
the prerequisite is a tap away. Nothing is ever hidden; a beginner can see the whole 154-point road
and how far along it they are, which is the honest version of a progress bar.

Three entry points, because almost nobody does all 154:

- **Start at the beginning** — the full path. The app states the honest duration (~31 weeks at five
  sessions a week) rather than implying three.
- **Find my level** — a 20-item placement built from `interpret` and `choose_form` items across the
  five convergence nodes (`gr_aux_system`, `gr_past_participle`, `gr_clause_types`, `gr_unreal_past`,
  `gr_countability`). It sets the entry point, and it never sets a "level" label.
- **Fix what's costing me marks** — the diagnostic path. Built from harvested error codes (F4), not
  from level. This is the band-5.5 plateau user, who is the modal user, and this is the route the
  module is optimised for.

The path also states the thing no course says out loud: some points — third-person `-s`, articles,
past endings — **will keep producing errors for months after they are learned, and that is normal,
not failure**. Instruction improves accuracy; it does not change the order in which features become
reliable. A learner who is not told this concludes the module is not working.

---

### F2 — The point screen (six stages, one bar) · impact **very high** · cost **M**

**Consumes:** the whole `point_json`.

The container everything else lives in. One horizontal bar segmented by stage with the names visible
— **Meet · Notice · Build · Choose · Use · Under pressure** — so the learner can see the shape of the
next fifteen minutes *and that it ends*. `teach.can_do` pinned in the header, which is Hattie's
"where am I going" rendered as furniture. Exit resumes exactly where it stopped.

One rule with teeth: **the rule card cannot be opened before the `notice_set` items are answered.**
Same attempt-gating pedagogy as speaking F1 and reading F1, and the same justification — a rule read
before the learner has felt the problem is a fact to forget. The `discovery` screen, where authored,
sits between them and is skippable.

Nothing takes longer than one sitting. There is no "Present Perfect, part 3 of 5". The bar reaching
the end is the reward and it is reachable on a bad day.

---

### F3 — The Contrast Engine · impact **very high** · cost **M**

**Consumes:** `items[].payload.context`, `options[].text`, `options[].why_this_means`, `key`,
`decision_cue`, `twin_id`, `contrast.question`.

The owner's central ask, built as machinery rather than as a page. A `choose_form` item renders as:
one or two lines of context in a muted block, the stem with an inline blank, two or three option
chips, nothing else. **No "Grammar tip" box, no metalanguage on the front of the card.**

On answer: the chosen chip locks, the `decision_cue` span in the context **highlights**, and the
rejected option's `why_this_means` renders directly beneath the stem as a full sentence — not a
label, not "Incorrect".

On a **wrong** answer the sequence is three beats and the answer is never first (§6.1 of R4, and the
reason is that ~70% of recasts go unnoticed):

1. **Signal** — *"Not this one. Look at what she says in the second line."* The span highlights. No
   answer. The learner may re-answer.
2. **Elicit** — one retry, always. Forced choice dims the chosen option and leaves the rest live.
3. **Reveal** — only now. The key, the `decision_cue`, and `contrast.question`.

`grade_answer()` already pre-selects rating 2 on a second-try success; that mapping carries over
exactly.

The twin arrives ≥ 4 items later, or tomorrow. When the learner gets both halves right, one quiet
line appears: **"Same sentence, opposite answer. You read the situation."** That is the moment the
module exists to produce and it is worth one bespoke string.

---

### F4 — Error codes, the profile, and code-filtered drills · impact **very high** · cost **S–M**

**Consumes:** `grammar_review_logs.error_codes_json` aggregated across attempts, plus (when D6 lands)
codes emitted by the writing and speaking scorers.

Directly modelled on reading F4, which works. The progress screen's headline is not *"Grammar 68%"*.
It is:

> **Three codes are costing you.**
> `perfect_with_finished_time` — 9 · `conditional_would_in_if` — 6 · `article_generic_over_the` — 5

Each line is a button that assembles a 12-item drill of items carrying that code **across all
points** — a far better selector than "the present perfect unit", because the learner's problem is
rarely confined to one unit.

And the primary *motivational* number is the inverse: **the codes that have gone quiet.**
*"`comma_splice` — 7 errors in your first week, 0 in the last two."* That is a true statement about
the learner's competence and it is worth more to an adult with an exam date than an XP counter.

Needs D2.

---

### F5 — Fair free-production grading · impact **very high** · cost **M**

**Consumes:** `structure_slug` → the D4 detector, `teach.rule_line`, `items[].payload.prompt_text`;
LLM.

§2.9 in full: mechanical detection first, four binary checks, the span-quoting requirement with
code-side enforcement, the leniency bias, two-call confirmation for rejections only, offline
degradation to self-rating.

On screen: the learner's sentence stays visible and **unedited** at the top. Below it a green or
amber bar — **never red**; red in feedback is already banned across this app — the one-line `why`,
the `minimal_fix` rendered as an inline diff against their own words, and the **"I think this is
right"** appeal button. An *accepted* sentence that has a `minimal_fix` shows it as *"also fine, and
slightly more natural: …"* and never as a correction.

**This feature is the module's trust budget. Build it before building more content.**

---

### F6 — Contrast boards · impact **high** · cost **S**

**Consumes:** `contrast` in full from every member of a `confusion_set`, plus the learner's own hit
rate on that contrast.

One permanent screen per contrasted pair, 19 of them, keyed by `board_id`. The two forms; the
deciding question in one line; the three `worked_pairs` with `deciding_span` highlighted; the
`wrong_choice_note`; the learner's own accuracy on that contrast; and a **`Practise this contrast`**
button that assembles a 10-item drill from every member point's S3 bank.

Highest re-visit rate of anything in the module, the natural deep-link target from writing and
speaking feedback, and the screen a wild failure opens onto — because a learner who just got it wrong
in a real essay needs the decision restated, not another drill.

This is the one exception to "no reference section". A board answers one question the learner keeps
getting wrong. A reference section answers every question nobody asked.

---

### F7 — Apply to task · impact **high** · cost **S–M**

**Consumes:** `used_in[]`, `pays_in[]`, the learner's most recent writing submission or speaking
transcript, plus the 102 writing prompts and 108 speaking sets already in the pack.

The last screen of every point. A real prompt, a real paragraph — **the learner's own**, where they
have one, an authored one where they do not — one instruction, one sentence to write or say. *"Rewrite
one sentence of this paragraph so the concession comes first."* Graded by F5.

It answers *"why did I just spend fifteen minutes on this"* while the learner is still in the app,
which is where the answer has to arrive. Payoff today, not at the exam.

---

### F8 — Mistakes from the four skills · impact **very high** · cost **M**, and blocked on D6

**Consumes:** error codes emitted by writing feedback, speaking evaluation, reading review and
listening review; `fixes_errors[]` on every point.

The wire that makes the module part of the app rather than beside it, in both directions:

- **In.** A Task 2 feedback line carrying `conditional_would_in_if` becomes a one-tap route into
  `gr_cond_second`. If its prerequisites are unmet, the route lands on the deepest unmet one with an
  honest explanation. If the same code arrives again on a later submission for a point already at
  stage ≥ 4, that is a **wild failure** (§1.6) and the point hard-drops to S3 and is forced into the
  next session.
- **Out.** Speaking Part 2 cards already carry `error_watchlist` (speaking `DESIGN.md` §3.6) and
  reading completion questions already carry `grammar_cue` (reading `DESIGN.md` §1.5). Both should
  emit §2.8 codes so a speaking attempt can recommend a point by name and a reading question can
  answer "why does this blank need a plural?" one tap away.
- **Sideways.** Reading's `paraphrase_families` are grammar in disguise — nominalisation and voice
  change are the two commonest paraphrase devices in the paper — so `gr_nominalisation` and
  `gr_passive_when` link into reading practice as **receptive** hooks.

Until D6 lands the module runs on route 2 alone and loses none of its teaching. It loses its
diagnosis, which is why D6 is worth a spike.

---

### F9 — Grammar in the daily queue · impact **high** · cost **M**

**Consumes:** `grammar_cards`, `srs_cards`, the point item banks.

The merged session of §1.9: one warm-up, one queue, `lex` and `gram` interleaved, the contrast
constraint enforced, a fresh item every review, production last. This is what converts a finished
point into retained knowledge, and it is where §1's algorithm actually lives.

Two visible behaviours worth naming because they are the algorithm made legible: the stage name on
every card (*"Choose"*), and, when a sibling from the active confusion set is pulled in, a one-line
note — *"Both of these are about how you talk about past time. That's the point."*

---

### F10 — Targeted dictation · impact **high** · cost **S**

**Consumes:** `items[].payload.audio_text`, `scored_tokens[]`; Kokoro TTS, installed locally.

Learners cannot *hear* the grammar: the `'ve` in *I've been*, the reduction of *was*, the `'d` that
is either *had* or *would*, the `-ed` that disappears before a consonant. If you cannot hear it, you
do not produce it, and no amount of reading about the present perfect fixes that.

Play once at natural speed, one text field, replay allowed and logged. Graded on `scored_tokens`
only — a typo in an unscored word is shown and does not fail the item. That targeted diff is ~30
lines and it is the entire difference between a usable dictation feature and one that fails good
learners for misspelling *commuting*. After checking, offer replay at 0.8× with the target token
highlighted as it plays.

43 authored listening scripts are 43 more dictation sources, for free.

---

### F11 — Vocabulary in real sentences · impact **very high** · cost **S**

**Consumes:** `contexts[]`, `chunk`, `confusables[]`, `grammar_links[]`, the vocab due queue.

The owner's original ask, and three cheap changes deliver it:

1. **`cloze` rotates through `contexts[]`** instead of blanking one fixed sentence forever. A word
   met in three different sentences is learned; a word met in the same sentence twenty times is a
   sentence that has been learned.
2. **`collocation` becomes the dependent-preposition drill**, driven by `chunk.dependent_preposition`
   — the one part of "grammar" that is purely lexical and belongs on the scheduler.
3. **`produce` seeds its content word from the due vocabulary queue.** *"Write a sentence about
   **deteriorate** using the present perfect."* One sentence, one answer, two cards reviewed, and the
   vocabulary is practised inside a sentence the learner wrote under a structural constraint.

---

### F12 — Judge and diagnose · impact **medium-high** · cost **S**

**Consumes:** `items[].payload.sentence`, `context`, `acceptable`, `reasons[]`, `reason_key`.

Two taps: acceptable or not, then — only on "not" — the reason from a 4–6 item closed list. Trains
the monitoring skill that actually operates during a timed exam, and it converts a coin flip into a
diagnosis. It also produces a genuine metacognition signal: the learner's chosen reason against the
authored one, exactly as reading F2 does.

---

### F13 — Sentence combining · impact **high** · cost **S–M**

**Consumes:** `items[].payload.parts[]`, `required_device`, `model_combinations[]`; LLM.

The best-evidenced route from grammar knowledge to writing quality that exists — sentence combining
carries a real effect on writing quality where isolated grammar drill shows near-zero transfer. The
short sentences render as separate cards that visually **merge** into one field as the learner types,
which makes the operation concrete. Three model combinations after the attempt, labelled *"three
ways, all fine"*, which is itself the lesson.

---

### F14 — The personal rule sheet · impact **medium-high** · cost **S**

**Consumes:** rules added via `Add to my rules`, plus the learner's own wrong sentences and their
fixes.

Every revealed `rule_line` has an **Add to my rules** action (the same affordance as reading F1 and
speaking F1). The sheet is one scrollable, exportable page of the rules this learner has personally
been wrong about, each with **their own wrong sentence and its correction underneath**. It is the
artefact they read the night before, and it is the only place in the app where a learner's own error
is presented as a possession rather than a deficit.

---

### F15 — The range board · impact **medium-high** · cost **S**

**Consumes:** `structure_slug`, `risk_tier`, card `stage` across all points; optionally the learner's
last Task 2 draft.

Band-7 grammar is, in effect, a checklist: a variety of complex structures, most sentences clean. So
show a board of the structures the learner now controls — conditionals, relatives, passives,
participle clauses, hedges, concession — each in one of four states, with the count at `mastered`
next to a plain-English note about what range actually means.

And the honest framing, which belongs on the module's opening screen: **band 7 asks for more clean
complex sentences, not for fewer mistakes.** A learner who believes 7 means "no mistakes" writes
short safe sentences and lands at 6, because range is marked too. This is the single most useful
sentence we can say to a plateaued learner.

Where a draft exists, the board can also run R2 §7's countable checks over it: distinct subordination
types used, non-finite clauses, purposeful passives, hedges, concession pairs, sentence-length
variance, and **how many sentences begin with the grammatical subject** — the single most countable
band-6 tell, and something our app can measure where a textbook cannot.

---

### Explicitly not built

- **A grammar reference / browse-all-rules section.** Every learner says they want it; nobody uses
  it; it turns the module into a book. Rule cards are reachable from their points and from the
  contrast boards. That is enough.
- **Parsing and labelling exercises** ("identify the gerund"). Trains metalanguage, not language.
- **Whole-paragraph error hunts.** Unfocused feedback, and they maximise exposure to broken forms for
  the minimum return.
- **A numeric grammar score.** LLM-as-judge alignment degrades with rubric granularity; a 1–5
  "grammar score" would be noise dressed as measurement. Counts of quiet error codes instead.
- **The twelve-tense grid as a teaching object.** It may appear once, at the end of U6, labelled *"you
  already know all of this"*. The grid teaches learners to treat tense as a lookup table; the actual
  skill is choosing a meaning.
- **Timed items outside production.** Speed pressure on stage 2–3 items produces guessing.
- **Any streak, league, XP, hearts or loss-aversion mechanic.** Forbidden upstream by
  `docs/plan/10-curriculum-progress.md` §9, and correct for a single-learner tool with a real
  deadline. Skipped days create no debt; a half-done point resumes where it stopped; there is no
  decay animation.
- **A second scheduler.** FSRS is installed, tested and version-guarded. Use it.

---

## 7. Authoring checklist — run this before you write your file

Read in this order: this document, `TEMPLATE.json`, R1 §2 for your units, R2 §6 for where your
structures earn marks, R4 §3 if you own choice points.

**Before you start**

- [ ] I know my block key, my exact point ids (§4.2), my `sequence_index` range and my vocabulary
      decks.
- [ ] I have read every point in R1 §2 that my points depend on, including the ones I do not own, so
      my explanations do not forward-reference.
- [ ] I have listed the grammatical terms I intend to use and checked each is introduced by a point
      earlier than mine (lint 10).

**Per point**

- [ ] `title` is a can-do line a learner would recognise, not a grammatical name.
- [ ] `teach.meaning` comes before `teach.form` and is about what the form *does to a sentence*.
- [ ] `teach.false_rule` names a wrong rule that is genuinely in circulation.
- [ ] Every `notice_set` question is about the world. None of them contains a grammatical term.
- [ ] `worked_example.what_the_other_would_mean` says what the alternative would communicate.
- [ ] 2–5 `errors[]`, each with an authored wrong sentence, a one-edit fix, and *why the learner
      built it that way*.
- [ ] `pays_in[]` names a real place in a real task and carries a model sentence I wrote.
- [ ] If `role: "choice"`: all five `contrast` parts, three `worked_pairs`, every deciding span an
      exact substring.

**Per item**

- [ ] The context is ≤ 2 sentences, ≤ 30 words, and contains no second hard word.
- [ ] Only one answer fits. I have said it aloud and I would say it that way.
- [ ] `decision_cue` is a real span in the context I can point at.
- [ ] Both options are grammatical in isolation. The distractor is wrong *only here*.
- [ ] `why_this_means` on both options says what each would mean, not which is right.
- [ ] `feed_forward` is one imperative sentence I would actually say to a student.
- [ ] Every contraction in `expected[]` is listed both ways.
- [ ] Twins: same options, opposite key, and I could not tell them apart without reading the context.

**Before you commit**

- [ ] Every sentence in the file is mine. I did not read any of them somewhere.
- [ ] No banned example from §0.2. No `John`, `Mary`, `Tom`, `Sarah`, `Mr Smith`. No cake.
- [ ] No forbidden claim from §0.2. No percentage attached to a band. "IELTS-style" everywhere.
- [ ] Proper nouns are from the house world (Verdon, Norland, Ashfield, Sandmouth, Marlow,
      Brackenfield) or newly invented.
- [ ] My item floors are met, counted, not estimated.
- [ ] My 40 vocabulary entries: ≥ 28 multi-word, 8 written frames, 8 spoken frames, every one with
      ≥ 3 contexts across ≥ 2 registers.
- [ ] I have re-read the last five `feed_forward` lines I wrote and none of them says "great".

**The bar, in one line:** write like a teacher who has taught this for years and has stopped being
surprised by the mistake — not like a reference book, and never like a marketing page.



