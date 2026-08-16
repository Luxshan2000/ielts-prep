# P-D1 — Practice content that is not the exam content

**Status:** the authoring contract for the practice pool. Where this document and a room's own
DESIGN.md disagree about *shape*, that room's document wins; where they disagree about *which pool a
row belongs in*, this document wins.

**Companions:** `staging-reading/DESIGN.md` and its `TEMPLATE.json`; `staging-listening/DESIGN.md`.
Read the one for the room you are authoring before you write a line. This document adds a rule and a
work list. It does not restate their schemas and it does not replace their templates.

---

## 1. The complaint, and the measurement behind it

The learner said it plainly:

> I am seeing several practice questions same as final, or you choose practice question set as a
> subset of final. I don't like it, gives the feel like leaked questions.

They are right, and it is worse in reading than they know.

| Pack | Rows | Used by a test | Left for practice |
|---|---|---|---|
| `reading_passages.jsonl` | 36 | **36** | **0** |
| `listening_scripts.jsonl` | 43 | 28 | 15 |

Twelve reading tests times three passages is thirty-six, and the pack holds exactly thirty-six
passages. Every reading drill a learner has ever done was built out of a passage sitting inside a
test they have not sat yet.

This was not an oversight in the design. `staging-reading/DESIGN.md` §9 planned three standalone
passages — `rp_dx_a5_01`, `rp_dx_a5_02`, `rp_dx_a5_03` — and said why, in almost the learner's own
words: *they exist so a drill can be filled without burning a whole test*. They were never authored.
`grep -c rp_dx_a5 content/core-en/data/reading_passages.jsonl` returns 0, and the R-A5 staging file
they were to ship in is not in `staging-reading/tests/`. The seam was cut and nothing was put
through it.

Listening leaks for a different reason. Fifteen practice-only scripts do exist, and
`listening/drills.py:840` ignores the distinction:

```python
query = select(m.ListeningScript).where(m.ListeningScript.retired == 0)
```

Every script, test or not. The module docstring even states the intent: *built from the pack's own
keyed answers so the practice is the test*. That is a defensible idea for fidelity and an
indefensible one for a learner who then meets the same item on exam day.

Writing (102 prompts) and speaking (496 cards) carry no pool marking at all. With banks that size a
collision is unlikely rather than certain, so they are a lower priority, but the rule below still
applies to them.

## 2. The rule

**A row belongs to exactly one pool, and the pools never mix.**

- **Exam pool** — anything a test or mock can serve. Reading: any passage referenced by a
  `reading_tests` row. Listening: any script carried by a `listening_tests` entry.
- **Practice pool** — everything else. Reading: `standalone_passages[]`. Listening:
  `standalone_scripts[]`. Both keys already exist in the merge tools
  (`merge_reading.py:223`, `merge_listening.py:232`), so **no schema change is needed**. The
  plumbing is there; the content is not.

Three consequences, all of which are code changes, not content:

1. **Drills draw from the practice pool only.** Not "prefer". Only. A drill that falls back to an
   exam passage when the practice pool runs dry re-creates the leak precisely when the bank is
   thinnest, which is now.
2. **An empty practice pool is an empty state, not a fallback.** "No practice items for that
   question type yet" is an honest screen. Serving an exam item and saying nothing is not.
3. **Mocks and tests draw from the exam pool only**, which is already true, and must stay true when
   the practice pool grows.

## 3. What "similar patterns with modifications" means

The learner asked for practice built *by following similar patterns with modifications*. That phrase
has a narrow reading and a wrong one.

**Right:** same question-type mix, same band target, same group structure, same teaching payload
depth as an exam item of that kind. A learner drilling `true_false_not_given` should meet exactly the
shape they will meet in the paper.

**Wrong:** a reworded exam passage. Changing the nouns in an exam text leaves the argument structure,
the trap positions and the answer pattern intact, which is the part that leaks. Somebody who drills a
paraphrase of Test 4 Passage 2 has effectively sat Test 4 Passage 2.

So: **new subject, new text, same machinery.** Pick a topic no exam passage covers, write it from
scratch, and build the same question shapes over it. If you find yourself consulting a specific exam
passage while writing, you are writing the wrong thing.

## 4. What every row must earn

Two things, and the second is the one that gets forgotten.

**It must be IELTS.** Real question types from the closed taxonomy, real band targets, real timing
pressure, the same instruction wording the paper uses. Practice that is merely English exercises does
not prepare anybody for this exam.

**It must be worth doing for its own sake.** The learner's words: *all should be focused toward IELTS
and personal English skill improvements*. A drill item is a few minutes of somebody's evening. It
should leave them knowing a word, a structure or a listening habit they did not have before, whether
or not it ever appears in their test. Topics that carry real information, vocabulary a person can use
outside an exam hall, and teaching payloads that explain the language and not only the answer.

An item that is technically valid and teaches nothing is a rejected item.

## 5. Work list

Volumes are floors, not targets. A drill pool has to be big enough that a learner doing three drills
a week does not recognise items, which means comfortably more than one sitting's worth per question
type.

### 5.1 Reading — the urgent one, because the pool is empty

Author into `staging-reading/tests/<slug>.json` under `standalone_passages[]`, following
`staging-reading/DESIGN.md` §9 exactly, including its id convention `rp_dx_<agent><NN>`.

| Need | Count | Notes |
|---|---|---|
| Academic standalone passages | 9 | 14 questions each, bands 6.0–7.5, spread across the type taxonomy |
| General Training standalone | 3 | Section 1 and 2 shapes |

Cover every question type the drill kinds need, and weight toward the two the drills lean on hardest:
`true_false_not_given` / `yes_no_not_given` for the trap drill, and authored `teaching.paraphrase_link`
pairs for the paraphrase drill, which needs four links in a passage before a single item exists.

### 5.2 Listening — cheap, because the content is half there

1. **Code first.** Restrict the drill query at `listening/drills.py:840` to scripts no test carries.
   That alone stops the leak using content that already exists, and it is a small change.
2. Then author standalone scripts to widen the pool, into `staging-listening/` under
   `standalone_scripts[]`, four parts represented, all three accent sets.

### 5.3 Writing and speaking — mark the pools

No new content required yet. Decide which prompts and cards the mock may serve, mark the rest as
practice, and make the mock builders respect it. Say in the report how the split was chosen.

## 6. How this gets verified

A finished pass proves all four, with commands and output:

1. `standalone` rows exist in the built pack, and no test references one.
2. Every drill kind can fill a full set from the practice pool alone.
3. The exam pool is unchanged: same test ids, same passage ids, same question counts.
4. `tools/content/validate.py` passes on the whole pack.

The pipeline is unchanged: staging blocks → `merge_*.py` → `build.py` → `validate.py`. Never
hand-edit `content/core-en/data/*.jsonl`.
