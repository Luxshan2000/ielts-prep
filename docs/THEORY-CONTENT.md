# Theory — the grammar reference

Measured against the shipped pack on **2026-08-15**. Every number below was counted from
`content/core-en/data/theory.jsonl` or read back from a running sidecar, not carried over from
a plan.

Theory is the browsable grammar reference: eight chapters, 99 articles, readable from the
moment the app opens. It is the one part of BandReady that is **not** gated, and that is a
requirement rather than an oversight. Read §1 before changing anything in `theory.py`,
`TheoryScreen.tsx` or `ArticleBody.tsx`.

---

## 1. Theory is the deliberate exception to the gate

Everywhere else in BandReady, model answers, transcripts and worked solutions stay hidden until
a real attempt exists. **Theory does not work that way and must not be changed to.**

The distinction the gate actually draws is between *answers to practice items* and
*explanations of the language*. Withholding the first is what makes an attempt honest.
Withholding the second is what makes a reference useless:

> A learner who does not yet know what a modal *is* has to be able to survey the language
> before being asked to practise it, and a reference you must earn access to is not a
> reference.
>
> — `sidecar/bandready/server/routes/theory.py`, module docstring

So `/api/v1/theory/*` takes no learner state, checks no prerequisite, requires no card and
records no attempt. It authenticates (every route does) and then serves. The grammar practice
module's gate is untouched by this and stays exactly as it is.

**If you are reading the plan docs and find the gate stated unconditionally, the plan is
incomplete, not the code.** The plan tree predates Theory entirely — see §7. Do not "fix"
`TheoryScreen.tsx` to respect a gate; that silently takes reference material away from the
learners who need it most.

The same reasoning appears in `tools/content/merge_theory.py`: Theory has no prerequisite graph
to keep acyclic and no ordering that can strand a beginner, because an article out of order is
merely an odd table of contents, where a grammar point out of order is a wall.

---

## 2. What ships today

99 articles across 8 chapters, counted from `data/theory.jsonl` on **2026-08-15**. The bank is
still being authored, so re-count rather than quoting this table if the number matters:
`uv run --project sidecar python -m tools.content.validate content/core-en`.

| Chapter | Title | Articles |
|---|---|---|
| `thc_01` | The basics: what a sentence is made of | 17 |
| `thc_02` | Tenses: talking about time | 19 |
| `thc_03` | Modal verbs: how sure, how necessary, how allowed | 13 |
| `thc_04` | Questions and negatives | 9 |
| `thc_05` | Conditionals: if, and things that are not real | 6 |
| `thc_06` | Active and passive | 5 |
| `thc_07` | Nouns, articles and describing words | 15 |
| `thc_08` | Building longer sentences | 15 |

**By CEFR level:** A1 23 · A2 25 · B1 31 · B2 17 · C1 3. The weighting is deliberate — 48 of
99 articles sit at A1/A2, because the reader who most needs a reference is the one who cannot
yet parse the practice module's feedback.

**By kind:** `standard` 70 · `foundation` 11 · `comparison` 9 · `paradigm` 7 · `overview` 2.

Chapter titles and blurbs are **not** in the pack. They live in `CHAPTER_TITLES` and
`CHAPTER_BLURBS` in `routes/theory.py`, because they are navigation rather than content: a pack
that ships only half the chapters must still produce a sensible index. A chapter id the build
has no title for still lists, under its raw id — dropping it would hide real content.

---

## 3. How a learner reaches it

`/grammar` → the **Theory** tab (`app/src/features/grammar/page.tsx`; the tab set is
`path | theory | progress | phrases`). `TheoryScreen.tsx` renders the index and
`ArticleBody.tsx` renders one article.

Theory has no `route.tsx` of its own, so it has no sidebar entry — it is reachable only by
first landing on Grammar and knowing to change tabs. See §7 for why that is a real problem and
who owns fixing it.

---

## 4. The two endpoints

A reference is used two ways: read straight through from chapter one, or looked up when a
specific question bites. So there are two routes and no more.

```
GET /api/v1/theory/chapters       the index: chapters, each with its articles
GET /api/v1/theory/articles/{id}  one article, with its neighbours for prev/next
```

`/chapters` returns article **summaries**, not bodies — `id`, `chapter_id`, `sequence_index`,
`title`, `kind`, `cefr_level`, `also_called`, `one_line`, `estimated_read_minutes`. That is
enough to choose an article without shipping a megabyte of prose to draw a table of contents.
It also returns `article_count` and `start_here` (the id of the very first article, whatever it
is — the front door for a complete beginner).

`/articles/{id}` returns the full row plus its neighbours, so prev/next needs no second call.
Retired articles are excluded from both.

---

## 5. The article schema

One row per article in `data/theory.jsonl`. Seven authored columns — `id`, `chapter_id`,
`sequence_index`, `title`, `kind`, `cefr_level`, `article_json` — and everything else lives
inside `article_json`. `tools/content/merge_theory.py::COLUMNS` is the authority on that list
and `loader.TABLE_COLUMNS` copies it exactly.

The fields inside `article_json` that a renderer depends on:

| Field | What it is for |
|---|---|
| `one_line` | The index blurb. One sentence, learner-facing. |
| `short_answer` | The answer for someone who arrived with a question and does not want the article. |
| `question_in_learner_words` | The question this article exists to answer, phrased as a learner would phrase it. |
| `also_called` | The other names for this structure, so search finds it. |
| `aliases`, `intents` | Search surface — the words a learner actually types. |
| `body` | The article itself: an ordered list of typed blocks (§5.1). |
| `terms_introduced`, `term_refs` | The running glossary; each term is introduced exactly once. |
| `prerequisites`, `related_articles`, `related_points` | Navigation only. **Not a gate** — see §1. |
| `no_practice_reason` | Why this article has no drill behind it. Set on 5 articles — the ones that genuinely have nothing to drill. |
| `false_rule_absent_reason` | Why no `false_rule` block appears. Set on 7 articles. |
| `estimated_read_minutes` | Shown in the index so a reader can decide before clicking. |
| `on_start_here_path` | Marks the beginner's through-line. |

Two of those deserve comment. `no_practice_reason` and `false_rule_absent_reason` exist so that
an *absence* can be made explicit: where a page has no drill behind it, or corrects no myth, the
author states why rather than leaving the reader to wonder whether the page is finished. They
are set only where the absence is the notable thing — 5 and 7 articles respectively — so an
empty one is not a gap in the data. Same instinct as the app's empty states.

### 5.1 Body blocks

`body` is a list of blocks, each with a `type`. `ArticleBody.tsx` must render every type it may
receive; a block with an unknown type is a hole the reader cannot interpret, which is exactly
what `merge_theory.py` rejects at merge time.

The 19 types in use, by frequency across the shipped articles (counted at 91 articles; the ordering has held as the bank grew):

| Type | Count | | Type | Count |
|---|---|---|---|---|
| `heading` | 381 | | `contrast` | 36 |
| `prose` | 252 | | `visual` | 29 |
| `warning` | 232 | | `exceptions` | 20 |
| `examples` | 196 | | `paradigm` | 15 |
| `table` | 104 | | `list` | 14 |
| `summary` | 91 | | `decision_tree` | 12 |
| `false_rule` | 86 | | `variation` | 9 |
| `rule` | 79 | | `early_sighting` | 4 |
| `term_intro` | 57 | | | |
| `l1_note` | 41 | | | |
| `quick_check` | 41 | | | |

`warning` being the third most common block is the shape of the whole reference: 232 places
where the article stops to say *this is where people go wrong*. `false_rule` (86) is its
sibling — a rule the learner was probably taught and that is not true. `l1_note` (41) addresses
a specific first language directly.

`summary` appears exactly 91 times: once per article, always.

---

## 6. Authoring and merging

Chapter authors write one file per chapter at
`content/core-en/staging-theory/content/<key>.json`, each holding an `articles[]` array of the
seven authored columns. Merge them:

```bash
uv run --project sidecar python -m tools.content.merge_theory content/core-en
uv run --project sidecar python -m tools.content.merge_theory content/core-en --check
```

The result is `data/theory.jsonl`, sorted by `sequence_index`. Then regenerate the manifest and
validate, as for any content change:

```bash
uv run --project sidecar python -m tools.content.build content/core-en
```

`TEMPLATE-THEORY.json` is merged too, but **only while no real chapter files exist**. Its
exemplars are complete, correct articles, so the reference is never empty while chapters are
still being written — and they stop shipping the moment a real chapter lands, because by then
they are near-duplicates of it.

The merge checks only what can still go wrong for a reference: a duplicate id (two chapters
claiming the same article), a body that is not a list of blocks, and a block with no type. The
authoring contract is `staging-theory/DESIGN-THEORY.md` plus the four research briefs under
`staging-theory/research/`.

The database side is `sidecar/bandready/migrations/versions/0004_theory_articles.py`.

---

## 7. Known gaps

* **No sidebar entry.** Theory is reachable only as a tab inside `/grammar`. A learner looking
  for "how do I use *the*" has no reason to go to Grammar first. Splitting it into
  `app/src/features/theory/route.tsx` would give it its own sidebar entry for free — the
  auto-discovery seam means no registry edit. *Owner: whoever owns `app/src/features/`.*

* **Theory is absent from the plan tree.** `docs/plan/` has 22 design documents and none of
  them mentions Theory; it was designed and built after the plan was written. The gate
  exception in §1 exists in `routes/theory.py` and in this file and nowhere else. If the plan
  docs are ever reconciled with the code, that exception is the first thing that must survive.

* **C1 coverage is thin** — 3 articles. A band-8 candidate looking up a fine distinction will
  usually not find it. This is a defensible place to be thin (the reference is aimed at the
  learner who cannot yet read their own feedback), but it is thin.

* **`thc_06` (active and passive) has 5 articles** against `thc_01`'s 17. The passive is one of
  the highest-frequency Academic Writing Task 1 structures; the chapter is the shallowest in the
  book relative to how much learners need it.

* **Search is authored but unexercised.** `aliases` and `intents` are populated on every
  article and no endpoint queries them — `/chapters` and `/articles/{id}` are the only two
  routes. The lookup half of "read through, or look up" is not built yet. *Owner: whoever owns
  `sidecar/bandready/server/routes/`.*
