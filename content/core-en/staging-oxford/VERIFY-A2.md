# VERIFY-A2 — does the foundation tier read at A2 now?

**Yes. The A2 half now reads at A2, and this pass is cleaner than the A1 pass was.**

A2 defining-vocabulary failures fell from **218 → 42 of 767 entries (28.4% → 5.5%)**. Of the 42,
25 are inflection artefacts of the measurement (`being`, `found`, `covered`, `relaxed`…) and
17 are genuine — and 5 of those 17 are a single word, `goods`, which core-04's repair agent
could not see because the scanner it wrote had a blind spot for it. Every named offender is
gone or nearly gone: `unpleasant` 5→0, `surface` 5→0, `cloth` 5→0, `liquid` 10→1, `goods` 7→5.

Four things a reader should know before calling this done:

1. **Nothing else moved, and for one file that is proven rather than inferred.** A genuine
   pre-repair snapshot of `core-03` exists. Diffed field by field against it, **only
   `definition` changed — on 110 entries, with zero changes to any other field**, same 391 ids
   in the same order. §2.
2. **The pass also repaired five A1 entries, on purpose, and the A1 metric got worse for it.**
   `water`, `tree`, `bird`, `sit` and `eat` — the five cases VERIFY-A1 named as wrong or
   untouched — are now all correct. A1 failures went **32 → 35**, entirely because the correct
   words (`liquid`, `branches`, `feathers`, `wings`) are graded B1/B2. Accuracy up, metric down.
   That is the right trade and it should not be reversed. §3.
3. **Accuracy held.** I read 136 before/after pairs. **Two are now less accurate than what they
   replaced** (`along`, `metal`) against three in the A1 pass — and neither is the category
   error `water` was. §4.
4. **`goods` is the one real gap.** Five core-04 entries (`ship`, `transport`, `truck`, `van`,
   `vehicle`) still say *goods*. They were never shown to the agent that could have fixed them.
   §1c explains exactly why, because the same bug will recur on the next block. 

All four files parse. §5.

---

## 1. The recount

**Method.** Identical to VERIFY-A1's, so the numbers are directly comparable. The B1+ set is
rebuilt from `worklists/*.json` — untouched since 15 Aug 19:44, so it predates every repair.
`lift-01…lift-05` give **1,250** headwords graded B1/B2; `core-01…core-04` give **1,580** graded
A1/A2. Every word of every A2 definition is tokenised: a token that is a foundation headword
passes, a token that is a B1/B2 headword fails, anything else is reduced (plural, `-ed`, `-ing`,
`-ly`, `-er`, `-est`, `y`→`ies`, consonant doubling) and retested, foundation winning ties.

| | A2 entries | failing | rate |
|---|---:|---:|---:|
| before (VERIFY-A1's control run, 01:46) | 767 | **218** | 28.4% |
| **after (this pass)** | **767** | **42** | **5.5%** |

Per block. The "before" column is reconstructed by reverting each block's rewrites from the
repair agents' own scratch artefacts and re-measuring with this matcher; `core-03` is exact,
from a real file snapshot; `core-02` left nothing on disk and is the residual.

| block | A2 entries | before | after |
|---|---:|---:|---:|
| core-01 | 196 | 52 | **12** |
| core-02 | 198 | 59 *(residual)* | **12** |
| core-03 | 191 | 56 *(exact)* | **5** |
| core-04 | 182 | 51 | **13** |
| **total** | **767** | **218** | **42** |

The words the brief named, counted as whole words in A2 definitions:

| word | before | after |
|---|---:|---:|
| liquid | 10 | **1** |
| goods | 7 | **5** |
| unpleasant | 5 | **0** |
| surface / surfaces | 5 | **0** |
| cloth | 5 | **0** |
| written | 2 | **0** |
| spoken | 1 | **0** |
| container | 1 | **0** |
| pleasant | 2 | **0** |
| expected | 2 | **1** |

**No entry was broken by a rewrite.** Where a before-state exists (`core-01`, `core-03`), every
entry failing now was already failing before: core-03 fixed 51 and newly broke **0**; core-01's
12 remaining are all drawn from its original 52.

### 1a. Genuine — the defining word is B1+ with no A1/A2 base in the pack (17)

| block | headword | definition | gated by |
|---|---|---|---|
| core-04 | ship | a large boat that carries people or **goods** on the sea | `goods` B1 |
| core-04 | transport | the system of moving people or **goods** from place to place | `goods` B1 |
| core-04 | truck | a large road vehicle for carrying **goods** | `goods` B1 |
| core-04 | van | a road vehicle for carrying **goods**, smaller than a lorry | `goods` B1 |
| core-04 | vehicle | a machine that carries people or **goods** on roads | `goods` B1 |
| core-01 | alive | **living**, not dead | `living` B1 |
| core-01 | biology | the study of **living** things | `living` B1 |
| core-04 | virus | a very small **living** thing that causes illness… | `living` B1 |
| core-04 | wild | **living** or growing in nature, not kept by people | `living` B1 |
| core-01 | blood | the red **liquid** that moves round inside your body | `liquid` B1 |
| core-01 | camp | a place where people stay in **tents** or simple buildings… | `tent` B1 |
| core-01 | camping | the activity of staying in a **tent** for a holiday | `tent` B1 |
| core-02 | divorced | …because the two people have ended the **marriage** by law | `marriage` B1 |
| core-02 | easily | without **difficulty** | `difficulty` B1 |
| core-02 | energy | …also the **strength** you need to be active | `strength` B1 |
| core-03 | monkey | a small animal with a long **tail** that lives in trees… | `tail` B1 |
| core-04 | smoking | the habit of **breathing** in smoke from cigarettes | `breathe` B1 |

`living` is a special case worth one line: its base `live` is in **neither** worklist, so the
pack never teaches it. Four entries lean on a word the deck does not own.

### 1b. Inflection artefacts — the base word is A1/A2 in this pack (25)

The class the original audit already discounted. The token is a separate B1/B2 headword in its
own right, but as used here it is an ordinary inflection of a word the learner has.

| gating token | level | base (level in pack) | A2 entries |
|---|---|---|---|
| `being` | B2 | be (untaught, but universal) | disappear, female, heat, illness, including, male, save |
| `found` / `finding` | B2 | find (A1) | discovery, lost, missing |
| `relaxed` | B1 | relax (A2) | chat, comfortable, informal |
| `planning` | B1 | plan (A1) | accident, borrow |
| `covered` | B1 | cover (A2) | forest, wet |
| `fighting` | B1 | fight (A2) | peace, war |
| `expected` | B1 | expect (A2) | already |
| `seriously` | B1 | serious (A2) | badly |
| `fixed` | B1 | fix (A2) | destroy |
| `lower` | B2 | low (A2) | drop |
| `means` | B2 | mean (A1) | understanding |
| `aged` | B1 | age (A2) | teenage |

`being` alone accounts for 7 of the 42. `to stop **being** seen`, `the state of **being**
unwell` — a learner who has `be` reads these without noticing. `lower` recurs from VERIFY-A1
§2b for the same reason.

**No repair agent's leave-behind list survives on disk.** The workflow asked each block agent to
name what it left and why, but those answers went into their structured returns, not into
`staging-oxford/`. So none of the 42 is *documented* as deliberate. The split above is my
judgement, not theirs.

### 1c. Why `goods` survived — a tooling bug, not a judgement call

`core-04`'s agent wrote its own scanner (`scan.py` in the session scratchpad). It builds a set
of hard word-forms, then deletes any form that is also an inflection of an A1/A2 word. `goods`
is `good` + `s`, so it was deleted — and *never shown to the agent at all*. Its own output
records 44 flagged entries with a top-offender list that does not contain `goods` anywhere,
in a block where five entries use it.

The same deletion silently hid `fighting`, `covered`, `relaxed`, `planning`, `expected`,
`seriously`, `fixed`, `lower`, `means` and `finding` from that agent. Most of those are the
harmless artefacts of §1b, which is why the bug mostly did no damage — but `goods` is not an
inflection of `good` in any sense a learner can use, and it cost five entries.

`core-01`'s agent used a different scanner (`scan2.py`) that checks exact headword membership
first and therefore *did* catch `goods` — which is why `airline` was fixed and `van` was not.
**Two agents, two scanners, two different answers to the same question.** If there is another
block after this, hand them one matcher.

### 1d. What the metric still cannot see

The B1+ set is 1,250 words; a defining word in *neither* worklist is invisible however hard it
is. **33 A2 entries use one that is plainly above A2:**

| headword | the word |
|---|---|
| charity, department, employee, service | `organisation` |
| arrange, hold | `organise` |
| jewellery | `decorative`, `necklaces` |
| pocket | `sewn` |
| belt | `waist` |
| spoon | `stirring` |
| cupboard | `shelves` |
| track | `rails` |
| mail | `parcels` |
| silver | `medals` |
| cigarette | `tobacco` |
| nut | `walnut`, `almond` |
| lemon | `sour` |
| illness | `unwell` |
| argument | `disagreement` |
| feature | `noticeable` |
| celebrate | `enjoyable` |
| identify | `recognise` |
| driving, independent | `controlled` / `controlling` |
| sort | `alike` |
| ah, unfortunately | `pity` |
| fortunately, happily | `luckily` |
| tidy | `untidy` |
| condition, to | grammar metalanguage: `plural`, `infinitive` |

Three of these are worse than hard, they are circular: `tidy` = *"not **untidy**"*,
`fortunately` = *"**luckily**"*, `happily` = *"…or **luckily**"*. None was rewritten this pass,
so none is a regression — but a learner meeting `tidy` learns nothing from its card.

Add the 17 genuine failures of §1a to the ~30 non-grammar rows above and the honest count of A2
entries a learner still cannot read is roughly **45 of 767 (5.9%)** — close to what the metric
says, but not the same entries.

---

## 2. Did anything else move?

**No. And unlike VERIFY-A1, part of this is proven.**

### 2a. core-03 — a real diff against a real snapshot

A pre-repair copy of `core-03.json` exists in the session scratchpad, written 01:34, before both
repair passes. Compared field by field:

| check | result |
|---|---|
| top-level keys, order and values (`staging_version`, `block`, `authored_by`, `points`, `vocab_updates`) | identical |
| entry count | 391 → 391 |
| ids, and their order | identical |
| key order within each row and each `entry_json` | identical |
| `definition` changed | 110 entries (57 A1 + 53 A2) |
| **every other field, on every one of the 391 entries** | **0 changes** |

Not one `ipa`, `example_sentences`, `collocations`, `confusables`, `avoid`, `own_context_sentence`,
`cefr_level`, `register` or `unit_type` value moved. The 57 A1 changes are the A1 pass; the 53 A2
changes are this one; they partition exactly, so neither pass strayed into the other's level.

### 2b. core-01, core-02, core-04 — no snapshot, so fingerprints

Every numeric fingerprint `VERIFY.md` (01:22) and `VERIFY-A1.md` (01:46) recorded, recomputed now:

| fingerprint | expected | measured |
|---|---|---|
| entry count core-01/02/03/04 | 390 / 390 / 391 / 390 | ✅ identical |
| `confusables` present | 122 / 95 / 136 / 69 | ✅ identical |
| `avoid` present | 390 / 390 / 391 / 80 | ✅ identical |
| `contexts` core-01 | 389 with none, 1 with two | ✅ identical |
| `contexts` core-02/03/04 | zero on all 1,171 | ✅ identical |
| IPA using the `(r)` convention | 38 / 48 / 54 / 0 | ✅ identical |
| `cefr_level` vs worklist | 0 mismatches | ✅ 0 |
| rows carrying exactly 5 keys | all | ✅ all |
| `lemma` ≠ `entry_json.headword` | 0 | ✅ 0 |
| `pos` ≠ `entry_json.pos` | 0 | ✅ 0 |
| duplicate ids | 0 | ✅ 0 |
| ids matching `vocab_ox_[A-Za-z0-9_]+` | all | ✅ all |
| `deck` values | `oxford-foundation` only | ✅ only |
| `frequency_band` / `word_family` / `topic_ids` | absent throughout core | ✅ absent |
| `points` / `vocab_updates` | empty on all four | ✅ empty |
| empty definitions | 0 | ✅ 0 |

**Entry sets still pinned to the worklists.** Authored `lemma` set vs worklist headword set:

```
core-01  395 worklist  390 authored  missing: January March May October Saturday      extra: none
core-02  395 worklist  390 authored  missing: December February September Thursday Wednesday  extra: none
core-03  395 worklist  391 authored  missing: April Friday Monday November            extra: none
core-04  395 worklist  390 authored  missing: August July June Sunday Tuesday         extra: none
```

The 19 gaps are covered exactly by the 19 entries in `core-05-calendar.json`. Coverage 1,580 of
1,580. **No entry added, removed, renamed or re-levelled.**

**The four fields the audit flagged as wrong are still wrong**, byte-identical to VERIFY-A1:

- `core-01` / `boring` — `own_context_sentence` still *"The lecture was interesting, but the room
  was so hot it felt boring."*
- `core-01` / `develop` — `avoid` still *"No double p in the base form…"*
- `core-01` / `cry` — `collocations` still contain `burst into tears`
- `core-04` / `temperature` — `ipa` still `ˈtemprətʃə`, still missing the `(r)`

Two passes have now walked past these without tidying them. That is the behaviour the brief asked
for and it is also the best available evidence the repairs stayed inside `definition`.

**Mechanism check.** `core-01`'s applier (`apply.py`, still on disk) is a literal
`"definition": "<old>"` → `"definition": "<new>"` string substitution, guarded by a
uniqueness assertion, run over the raw file text. It structurally cannot touch another field.

**Verdict: no silent regression found.** Proven for core-03, and every observable that survives
from before the repair is unchanged on the other three.

---

## 3. The five A1 entries this pass also fixed

The A2 brief carried VERIFY-A1's findings in its preamble, and the repair agents acted on them
even though the letter of the task was A2-only. All five of VERIFY-A1's outstanding A1 items are
now correct:

| entry | before (01:46) | now |
|---|---|---|
| `water` | *"the clear **drink** with no colour and no taste, that falls from the sky as rain"* — a category error its own examples contradicted | **"the clear liquid that falls as rain and fills rivers and seas, and that people drink"** ✅ |
| `tree` | *"a very tall plant with a thick hard **stem**"* — trees have trunks | **"a tall plant with a thick wooden trunk, branches and leaves"** ✅ |
| `bird` | *"two legs and can usually fly, such as a **chicken**"* — fit no bird uniquely | **"an animal with feathers and wings, that lays eggs and can usually fly"** ✅ |
| `sit` | *"to rest with your body **upright**…"* — the brief's headline case, untouched by the A1 pass | **"to put your body on a chair or the ground, with your back straight"** ✅ |
| `eat` | *"to put food in your mouth and **swallow** it"* — the other headline case | **"to put food in your mouth and take it down into your body"** ✅ |

**The A1 metric got worse as a direct result: 32 → 35.** The three new A1 failures are exactly
`water` (`liquid` B1), `tree` (`branches` → `branch` B1) and `bird` (`feathers` → `feather` B2,
`wings` → `wing` B1). Nothing else on the A1 side moved — the other 32 are the same 32 entries
VERIFY-A1 listed, unchanged.

This is the correct trade and it should be defended, not undone. Water *is* a liquid; a bird
*has* feathers. A deck that scores 32 by calling water a drink is worse than one that scores 35
by calling it a liquid.

One quibble on `sit`: *"with your back straight"* over-specifies — you can sit slouched — and
*"a chair or the ground"* leaves out sofas and beds. Better than `upright`; not yet right.

---

## 4. Accuracy of the rewrites

I read **136 before/after pairs** — every A2 rewrite in `core-01` (42), `core-03` (53) and
`core-04` (41), reconstructed from the pre-repair snapshot and the repair agents' own scan
output — plus 25 `core-02` definitions read on their own (that block left no before-state).

### 4a. Two rewrites are now less accurate than what they replaced

| entry | before | after | problem |
|---|---|---|---|
| `along` (core-01) | *"following the **length** of something from one end towards the other"* | **"moving forward next to something long, from one end towards the other"** | Two errors. *Next to* is wrong — you walk **along** a road by being **on** it. And *along* is not always motion: *"trees along the river"* is static, which the old wording covered and this does not. `length` (B1) was the only thing wrong with the original; the fix broke the sense. Suggest *"from one end of something long to the other, or all the way beside it"*. |
| `metal` (core-03) | *"a hard material such as **iron**, gold or **steel**"* | **"a hard, strong material such as gold or silver, used to make cars, keys and money"** | `iron` (B1) and `steel` (B2) were swapped out for gold and silver — and then the clause *"used to make cars"* was kept. Cars are not made of gold or silver. The examples and the uses now contradict each other, and the two most representative metals a learner meets are gone. Suggest *"a hard shiny material such as gold, or the grey kind that cars and keys are made of"*. |

Compare the A1 pass, which produced three (`water`, `tree`, `bird`) including one category
error. This is a better rate on a similar volume.

### 4b. Five that drift, none of which I would call wrong

- `mostly` → *"almost all of something, or most of the time"* — the first gloss is a quantity,
  not an adverb. It will not substitute: *"the shops are mostly closed"*.
- `brush` → *"short **hard** hairs"* (was *stiff*) — a paintbrush's are soft.
- `cigarette` → *"a thin **stick** of paper"* (was *tube*) — a stick is solid; a cigarette is not.
- `airline` → *"carries people **and** things"* (was *or*) — a freight airline carries no people.
- `degree` → *"the **title** you get when you finish a course at university"* — a degree is a
  qualification, not a title, and not every course awards one.

### 4c. Five that are now more accurate than before

Worth recording, because a repair pass is not supposed to be able to do this:

| entry | after |
|---|---|
| desert | *"a large dry area of land with very little rain, where few plants can grow"* — dropping *"covered in sand"* is **more** correct, not less |
| basketball | *"throw a ball into a high **basket**"* — was *"a high net"*, which is loose |
| oven | *"where you cook food with **heat all around it**"* — was *"bake or roast"*; the new clause is what actually distinguishes an oven |
| petrol | *"the material made from oil that most cars burn to make them go"* — was *"the liquid fuel"*, which explains nothing |
| link | *"a way that two things are joined, or a word **or picture** on a website that takes you to another page"* — the old one missed image links |

### 4d. The rest read clean

Sampled and verified across all four blocks: `adventure` `army` `attack` `average` `awful` `bar`
`bean` `bin` `blank` `boil` `boss` `bowl` `brain` `broken` `burn` `button` `cash` `castle`
`celebrity` `certainly` `church` `cloud` `complain` `completely` `connected` `crazy` `curly`
`danger` `deal` `deep` `definitely` `destroy` `detective` · `lorry` `mail` `male` `manage`
`manager` `mark` `material` `mathematics` `medical` `medicine` `middle` `moon` `nervous` `noise`
`noisy` `normally` `notice` `nut` `offer` `officer` `oil` `onto` `pants` `patient` `peace`
`penny` `pilot` `plastic` `pleased` `polite` `pollution` `prison` `professional` `professor`
`protect` `rate` `rather` `reach` `realize` `reception` `record` `recycle` `repair` `respond`
`response` `rude` `sadly` `safe` · `sauce` `separate` `shape` `sheet` `side` `silver` `simple`
`skin` `smile` `soap` `soft` `spider` `square` `straight` `stress` `stupid` `suddenly` `suit`
`surprised` `surprising` `technology` `term` `tie` `towel` `track` `tradition` `traditional`
`trouble` `unhappy` `virus` `war` `wave` `weak` `wedding` `wet` `wide` `wish` `worse` `worst`
`wow` `yours` · `document` `download` `dream` `earn` `earth` `employ` `engineer` `expect` `fit`
`forward` `gas` `gold` `golf` `greet` `hide` `human` `ill` `immediately` `incredible`
`invitation`.

**No A2 definition is circular** — not one contains its own headword. Housekeeping, unchanged
from before: `enormous` and `huge` still share *"extremely large"*, and ten glosses are under
three words (`asleep` = *"sleeping"*, `error` = *"a mistake"*, `guy` = *"a man"*).

---

## 5. Parse check

```
core-01.json  OK    core-03.json  OK    core-05-calendar.json  OK
core-02.json  OK    core-04.json  OK
```

All five foundation blocks parse under `python3 -m json.tool`. Every row still carries exactly
`id · lemma · pos · deck · entry_json`.

---

## 6. What is left

1. **`goods` × 5** — `ship`, `transport`, `truck`, `van`, `vehicle` in core-04. The only cluster
   that is both genuine and cheap. *"things that are bought and sold"* or just *"things"* clears
   all five. §1c explains why they were missed; fix the scanner before the next block.
2. **`living` × 4** — `alive`, `biology`, `virus`, `wild`. The pack never teaches `live`, so
   there is no base to fall back on. Either add `live` or reword: `alive` = *"not dead"* alone
   would do.
3. **The other 8 genuine failures** — `blood` (`liquid`), `camp`/`camping` (`tent`), `divorced`
   (`marriage`), `easily` (`difficulty`), `energy` (`strength`), `monkey` (`tail`), `smoking`
   (`breathing`). Seven words, eight entries.
4. **`along` and `metal`** — the two accuracy regressions in §4a. Both have a one-line fix.
5. **`sit`** — *"with your back straight"* over-specifies; *"a chair or the ground"* omits sofas.
6. **The 33 blind-spot entries in §1d** — in particular the three circular ones (`tidy` =
   *"not untidy"*, `fortunately` = *"luckily"*, `happily` = *"or luckily"*) and `organisation`,
   which gates four entries on its own.
7. **The 25 artefacts of §1b are not worth touching.** `being` (7) and `found` (3) are ordinary
   inflections of `be` and `find`. Rewriting around them would make definitions worse to satisfy
   a matcher. If anyone wants the number below 20, this is the honest place to stop counting.
8. **One matcher, next time.** The two block agents that left artefacts used two different
   scanners and got two different answers on the same question. That is what cost five entries.

**Where the foundation tier now stands:** A1 **35 of 813 (4.3%)**, A2 **42 of 767 (5.5%)**,
whole tier **77 of 1,580 (4.9%)** — down from 431 of 1,580 (27.3%) before either pass. The
foundation deck reads at foundation level.
