# VERIFY-A1 — does the foundation tier read at A1 now?

**Yes for the A1 half, with four caveats worth reading before anyone calls this done.**

The A1 defining-vocabulary failure rate fell from **213 → 32 of 813 entries (26.2% → 3.9%)**.
Of the 32 that remain, only about 10 are a beginner genuinely cannot read; the rest are
inflection artefacts of the measurement. Every word named in the brief as a repeat offender
is gone or nearly gone: `written` 12→0, `surface` 9→0, `means` 9→0, `spoken` 8→0,
`pleasant` 7→0, `liquid` 6→0, `container` 7→2, `expected` 6→4.

The four caveats:

1. **The two cases the brief called the worst were not touched at all.** `sit` still reads
   *"to rest with your body **upright** and your weight on your bottom"* and `eat` still
   reads *"to put food in your mouth and **swallow** it"* — byte-identical to the strings the
   audit quoted. They survive the recount only because `upright` and `swallow` are not in any
   worklist, so the pack's own metric cannot see them.
2. **The metric has a blind spot and 28 A1 entries sit in it** — `flesh`, `obtain`,
   `carriages`, `rails`, `stem`, `pedals`, `threads`, `enjoyment`, `midday`, `sleeves`,
   `collar`, `ink`, `cocoa`, `roasted`, `brick`, `organisation`. §3.
3. **Three rewrites traded a hard word for an inaccurate one.** `water` is now defined as a
   drink, which its own examples contradict; `tree` now has a *stem* rather than a trunk;
   `bird` lost feathers and gained an example that contradicts its own clause. §5.
4. **The A2 half of the same tier was never in scope and still fails at 28.4%** (218 of 767).
   The foundation deck as a whole does not read at A1 yet — its A1 entries do.

Nothing else moved. All four files parse. §4 sets out how far that claim can be verified,
because no pre-repair copy of the files exists anywhere on disk.

---

## 1. The recount

**Method.** The B1+ word set was rebuilt from `worklists/*.json`, which have not been written
to since 15 Aug 19:44 and so predate every repair. `lift-01…lift-05` supply **1,250** headwords
graded B1 or B2; `core-01…core-04` supply **1,580** graded A1 or A2. *There is no C1 word
anywhere in the worklists* — C1 appears only as a `cefr_level` on 39 phrase entries in
`phrase-01`, none of which is a single word. So "B1, B2 or C1" is in practice B1/B2, and the
set is the 1,250.

Every word of every A1 definition is tokenised and tested: a token that is itself a foundation
headword passes; a token that is itself a B1/B2 headword fails; anything else is reduced
(plural, `-ed`, `-ing`, `-ly`, `-er`, `-est`, `y`→`ies`, consonant doubling) and re-tested,
foundation winning ties. This is the same shape as the original audit — it reproduces the
audit's own participial false positives (`written`, `spoken`, `living`, `being` are separate
B1 headwords in `lift-05`/`lift-02`, which is why they were counted before and are counted now).

| | A1 entries | failing | rate |
|---|---:|---:|---:|
| before (inherited from the repair brief) | 813 | **213** | 26.2% |
| before (VERIFY.md's own earlier run, pre-calendar) | 794 | 187 | 23.6% |
| **after (this pass)** | **813** | **32** | **3.9%** |

Per block:

| block | A1 entries | failing |
|---|---:|---:|
| core-01 | 194 | 9 |
| core-02 | 192 | 15 |
| core-03 | 200 | 4 |
| core-04 | 208 | 4 |
| core-05-calendar | 19 | 0 |
| **total** | **813** | **32** |

**Is the matcher calibrated, or did it just get lenient?** The A2 entries in the same four
files were not in scope for repair, which makes them a control group. Run through the identical
matcher they fail at **28.4% (218 of 767)** — the same order as the 23.6%/26.2% the A1 tier
used to show, with the same words doing the work (`liquid` ×10, `goods` ×7, `unpleasant` ×5,
`surface` ×5, `cloth` ×5, `written` ×3). The matcher is not lenient. The A1 drop is real.

**The 213 baseline is inherited, not recomputed.** The pre-repair files were overwritten in
place; there is no git repo, no `.bak`, and no copy in any scratch directory. The 187 in
VERIFY.md and the 213 in the brief are two runs of slightly different matchers on slightly
different corpora (VERIFY predates `core-05-calendar.json`, which added the 19 months and
weekdays). I can vouch for the 32 and for the control; I am quoting the 213.

---

## 2. Every entry still failing

**No repair agent left a note.** `staging-oxford/` contains only `VERIFY.md`, `content/` and
`worklists/` — nothing naming a deliberate exclusion. So none of the 32 below is documented as
an intentional leave-behind; they are simply what is left.

### 2a. Genuine — the defining word is B1 with no A1/A2 base in the pack (10)

| block | headword | definition | gated by |
|---|---|---|---|
| core-01 | air | the gas all around us that we **breathe** | `breathe` B1 |
| core-01 | beach | the area of **sand** or small stones next to the sea | `sand` B1 |
| core-01 | beer | a yellow-brown drink with **alcohol** in it, made from a plant | `alcohol` B1 |
| core-02 | dish | a flat **container** you serve food in; also, food cooked in a particular way | `container` B1 |
| core-02 | glass | the hard clear material that windows are made of; also a **container** for drinking | `container` B1 |
| core-02 | guitar | a musical instrument with **strings** that you play with your fingers | `string` B1 |
| core-03 | nose | the part of your face that you use for **breathing** and smelling | `breathe` B1 |
| core-03 | pepper | the hot black **powder** you add to food… | `powder` B1 |
| core-04 | salt | the white **powder** you add to food to make it taste better | `powder` B1 |
| core-04 | tennis | a game for two or four players who hit a ball over a **net** | `net` B1 |

`dish` and `glass` are the last two of the seven `container` cases the brief called out — the
other five (`bag`, `bath`, `bottle`, `box`, `cup`) were all rewritten. `salt` is the one that
should sting: it was the brief's headline example, and the repair swapped `substance` (B1) for
`powder` (B1). Same failure, different word.

### 2b. `lower` — comparative of `low`, which the pack grades A2 (4)

| block | headword | definition |
|---|---|---|
| core-01 | below | at or to a **lower** level than something |
| core-02 | down | towards or in a **lower** place |
| core-02 | downstairs | to or on a **lower** floor of a building |
| core-02 | fall | to move down towards the ground; also to become **lower** in number or level |

`lower` is a B2 headword in `lift-03` in its verb sense ("lower the price"). Used here it is
just the comparative of `low`. Defensible to leave; worth one sentence in a note.

### 2c. Inflection artefacts — base word is A1/A2, the inflected form happens to be a separate B1/B2 headword (18)

| gating token | level | base | A1 entries |
|---|---|---|---|
| `living` | B1 | live (untaught in the pack) | animal, die, flat, plant |
| `expected` | B1 | expect (A2) | early, even, extra, late |
| `being` | B2 | be | happen, subject |
| `found` | B2 | find (A1) | common |
| `opening` | B2 | open (A1) | key |
| `arms` | B2 | arm (A1) | swim |
| `spending` | B1 | spend (A1) | friend |
| `heating` | B1 | heat (A2) | cook |
| `prepared` | B1 | prepare (A1) | kitchen |
| `coloured` | B1 | colour (A1) | pencil |
| `addition` | B1 | add (A1) | also |

These are the class the original audit already discounted. `swim` → *"using your **arms** and
legs"* is the clearest case: `arms` is only B2 in the weapons sense. I would fix `expected`
(four entries, and `expect` is A2 so the participle is a genuine stretch) and leave the rest.

---

## 3. What the metric cannot see

The B1+ set is 1,250 words. A defining word that is in *neither* worklist is invisible to the
test no matter how hard it is — which is exactly how `upright` and `swallow`, the brief's two
worst cases, pass. Filtering out function words and inflections, **28 A1 entries use a word
that is in neither list and is plainly above A1**:

| headword | definition | word |
|---|---|---|
| sit | to rest with your body **upright** and your weight on your bottom | upright |
| eat | to put food in your mouth and **swallow** it | swallow |
| fat | having too much **flesh** on the body | flesh |
| get | to receive or **obtain** something; also to become | obtain |
| train | a line of **carriages** pulled along **rails** | carriages, rails |
| tree | a very tall plant with a thick hard **stem** and many leaves | stem |
| hair | the thin **threads** that grow on your head and body | threads |
| bicycle | a vehicle with two wheels that you ride by pushing **pedals** | pedals |
| fun | **enjoyment**; a good time | enjoyment |
| afternoon | the part of the day between **midday** and the evening | midday |
| south | the direction that is on your right when you look at the **sunrise** | sunrise |
| coat / sweater | a piece of clothing with long **sleeves**… | sleeves |
| shirt | …with a **collar** and buttons | collar |
| pen | a thin object filled with **ink** that you use for writing | ink |
| chocolate | a sweet brown food made from **cocoa** beans | cocoa |
| coffee | a hot brown drink made from **roasted** beans | roasted |
| compare | to look at two or more things to see how they are **alike** or different | alike |
| wall | …a long high line of stone or **brick** between two areas of land | brick |
| website | a set of pages on the internet belonging to one person or **organisation** | organisation |
| free | costing no money; or not busy, or not **controlled** by anyone | controlled |
| post | the system of sending letters and **parcels** | parcels |
| have / pretty / so / him / them / they / us / we / auxiliary / modal | grammar metalanguage: **tenses**, **verb(s)**, **adjective**, **grammar** | — |

The grammar-metalanguage group is a separate judgement call: `we` → *"the speaker and other
people, as the subject of a **verb**"* is precise, and arguably a learner meeting `we` on a
card is being taught grammar anyway. The first twenty rows are not a judgement call.

Add rows 1–20 to the 10 genuine failures in §2a and the honest count of A1 entries a beginner
still cannot read is roughly **30 of 813 (3.7%)** — coincidentally almost the same number as
the metric reports, but not the same entries.

---

## 4. Did anything else move?

**The limit of this check, stated first.** No pre-repair copy of the four files exists — not
in git (the project is not a repo), not as a backup, not in any scratch directory. A
field-by-field diff is therefore impossible. What follows is the strongest substitute
available: fourteen numeric fingerprints that `VERIFY.md` recorded at 01:22, before the
repairs at 01:33–01:34, recomputed now. Every one matches.

| fingerprint (from VERIFY.md) | expected | measured |
|---|---|---|
| entry count core-01/02/03/04 | 390 / 390 / 391 / 390 | ✅ identical |
| `confusables` present | 122 / 95 / 136 / 69 | ✅ identical |
| `avoid` key present | 390 / 390 / 391 / 80 | ✅ identical |
| `contexts` — core-01 | 389 with none, 1 with two | ✅ identical |
| `contexts` — core-02/03/04 | zero on all 1,171 | ✅ identical |
| IPA using the `(r)` convention | 38 / 48 / 54 / 0 | ✅ identical |
| `cefr_level` vs worklist | 0 mismatches | ✅ 0 |
| rows carrying exactly 5 keys | all | ✅ all |
| `lemma` ≠ `entry_json.headword` | 0 | ✅ 0 |
| `pos` ≠ `entry_json.pos` | 0 | ✅ 0 |
| duplicate ids | 0 | ✅ 0 |
| ids matching `vocab_ox_[A-Za-z0-9_]+` | all | ✅ all |
| `deck` values | `oxford-foundation` only | ✅ only |
| `frequency_band` / `word_family` / `topic_ids` present | absent throughout core | ✅ absent |

**Entry sets are pinned to an immutable input.** The worklists have not been written since
15 Aug 19:44. Authored `lemma` set vs worklist headword set, per file:

```
core-01  395 worklist  390 authored  missing: January March May October Saturday   extra: none
core-02  395 worklist  390 authored  missing: December February September Thursday Wednesday  extra: none
core-03  395 worklist  391 authored  missing: April Friday Monday November        extra: none
core-04  395 worklist  390 authored  missing: August July June Sunday Tuesday     extra: none
```

The 19 gaps are covered exactly — no more, no less — by the 19 entries in
`core-05-calendar.json`. Total foundation coverage 1,580 of 1,580. **No entry was added,
removed, renamed or re-levelled.**

**Four fields the audit flagged as wrong were left wrong**, which is the behaviour the brief
asked for and is also evidence the repair stayed inside `definition`:

- `core-01` / `boring` — `own_context_sentence` still *"The lecture was interesting, but the
  room was so hot it felt boring."* (the contradiction VERIFY §ACCURACY flagged), while the
  definition beside it was rewritten.
- `core-01` / `develop` — `avoid` still *"No double p in the base form: develop, but developed
  and developing."* (the assertion VERIFY called non-existent).
- `core-01` / `cry` — `collocations` still contain `burst into tears`.
- `core-04` / `temperature` — `ipa` still `ˈtemprətʃə`, still missing the `(r)` its sibling
  blocks use.

A repair that had wandered outside `definition` would almost certainly have tidied at least
one of these.

**Verdict on §2 of the task: no silent regression found.** Every observable that survives from
before the repair is unchanged. I cannot prove an untracked field such as
`example_sentences` is byte-identical; I can say that nothing countable moved and that four
known defects sitting immediately beside rewritten definitions were left untouched.

Housekeeping note, not a regression: `definition` is non-empty on all 1,580 foundation
entries; lengths run 1–27 words, mean ~10. Five terse glosses share text with a sibling
(`everybody`/`everyone`, `somebody`/`someone`, `photo`/`photograph`, `fantastic`/`wonderful`/
`excellent` = *"extremely good"*, `huge`/`enormous` = *"extremely large"*). Legitimate for
synonyms, but two cards with identical fronts-and-backs are hard to tell apart in review.

---

## 5. Accuracy of the rewrites

I read **93** definitions in full — every entry named in VERIFY's A1 table, every worst-case
example it quoted, and the whole of the `written`/`spoken`-gated group. Where VERIFY quoted the
old text I can show the actual before/after.

### 5a. Three rewrites are now less accurate than the thing they replaced

| entry | before | after | problem |
|---|---|---|---|
| `water` | *(used `liquid`)* | **"the clear drink with no colour and no taste, that falls from the sky as rain"** | Water is not a drink; it is a substance that can be drunk. The entry's own `own_context_sentence` is *"Clean water is still not available to everyone in the world"* and its own example is *"The water in the river is much cleaner than it was"* — neither is a drink. A learner is taught a category error, and the card contradicts itself two lines down. Also *"clear… with no colour"* says the same thing twice. |
| `tree` | — | **"a very tall plant with a thick hard stem and many leaves"** | A tree has a trunk, not a stem. The pack teaches the word `trunk` inline at `elephant` (*"a long nose called a trunk"*), so the right word was available and already glossed. |
| `bird` | *"an animal with wings and feathers"* | **"an animal that has two legs and can usually fly, such as a chicken"** | Feathers are the defining feature of a bird and both defining features were dropped, leaving a description that fits no bird uniquely. Worse, the example chosen to illustrate *"can usually fly"* is a chicken. |

Two more I would change but would not call errors: `fat` → *"having too much **flesh** on the
body"* (flesh is harder than the headword, and fat is not flesh), and `bag` → *"a **soft**
thing that you put things in"* (rules out most bags a learner owns).

### 5b. Two entries changed word but not level

- `salt`: *"a white **substance** used to give food more taste"* → *"the white **powder** you
  add to food to make it taste better"*. `substance` is B1; `powder` is B1. Sideways.
- `mountain`: *"a very high hill with **steep** sides"* → *"a very high hill with sides that go
  up quickly"*. Simpler and not wrong, but "quickly" reads as speed rather than slope.

### 5c. The rest are accurate, and most are better

Sampled across the gated groups, all verified correct:

| entry | after |
|---|---|
| drink (v) | to put water, tea or juice in your mouth and take it down into your body |
| bored | feeling tired and not happy because nothing interesting is happening |
| salad | a cold dish of vegetables that are not cooked, often eaten with a meal |
| banana | a long yellow fruit with a soft skin that you take off before you eat it |
| card | a small piece of hard paper or plastic used for paying, writing on or playing games |
| bill | a piece of paper that shows how much money you have to pay |
| dangerous | not safe, because it can hurt someone |
| plan | something you have decided to do, thought out before you do it |
| coat / hat / skirt / sweater / jeans | *"a piece of clothing…"* — the `cloth` group, all eight rewritten cleanly |
| bag / bath / bottle / box / cup | the `container` group, five of seven rewritten |
| beautiful / cool / friendly / good / nice / warm | the `pleasant` group, all seven, none circular |
| cream / juice / milk / soup | the `liquid` group |
| exam / form / passport / police / rule | the `official` group |
| cheese / hard / ice | the `solid` group |
| kilometre / metre / mile / quarter | the `equal` group — and the arithmetic checks out: 1,000 m, 100 cm, "about one point six kilometres" |
| cat / lion / mouse | the `fur` group; `lion`'s *"Africa and parts of Asia"* is correct |
| test / period / short | the `measure`/`length` group |
| letter / word / news / book / newspaper / story / page / pen / note / list / message / spelling / title / email | the `written` group — 12 entries were gated, none is now, and every one I read is accurate |
| language / answer / question / please / sorry / thanks / name | the `spoken` group — 8 were gated, none is now, all accurate |

Two small internal inconsistencies, flagged for completeness rather than as defects: `box` is
*"usually made of **card**, wood or plastic"*, where `card` means cardboard — a sense the
pack's own `card` entry ("a small piece of hard paper or plastic used for paying…") does not
license; and `milk` is *"the white **drink** that comes from cows"*, which narrows both the
animal and the use (milk in cooking is not a drink).

**Net: 3 accuracy regressions and 2 sideways swaps in 93 definitions read.** That is the
failure mode the task was most worried about, and it did occur — but at a low rate, and
`water` is the only one a learner would carry into an exam.

---

## 6. Parse check

```
core-01.json          OK      core-04.json          OK
core-02.json          OK      core-05-calendar.json OK
core-03.json          OK
```

All five foundation blocks parse under `python3 -m json.tool`. Every row still carries exactly
`id · lemma · pos · deck · entry_json`.

---

## 7. What is left

1. `water` — redefine without "drink". *"the clear liquid…"* is what it is, but `liquid` is
   B1; *"what rain and rivers are made of, that you drink and wash in"* keeps it at A1.
2. `tree` — `stem` → `trunk`, glossed as `elephant` already glosses it.
3. `bird` — put feathers back; change the example off `chicken`.
4. `sit` and `eat` — the brief's two headline cases, still untouched. `upright` → *"with your
   back straight"*; `swallow` → *"and take it down into your body"*, which is the phrasing the
   `drink` rewrite already uses successfully.
5. The 10 genuine failures in §2a — five words carry all ten: `container` (2), `powder` (2),
   `breathe` (2), plus `sand`, `alcohol`, `strings`, `net`.
6. The 20 blind-spot entries in §3 — `flesh`, `obtain`, `carriages`, `rails`, `stem`,
   `pedals`, `threads`, `enjoyment`, `sleeves`, `collar`, `ink`, `cocoa`, `roasted`, `brick`,
   `organisation`, `midday`, `sunrise`, `alike`, `parcels`, `controlled`.
7. **The A2 half of the foundation tier: 218 of 767 entries, 28.4%.** It was never in scope
   and it is the same defect at the same rate the A1 half used to have — `liquid` ×10,
   `goods` ×7, `unpleasant` ×5, `surface` ×5, `cloth` ×5. The A1 tier now reads at A1. The
   foundation deck does not yet.

Note also that the 19 months and weekdays still live in a fifth file, `core-05-calendar.json`,
rather than in the four core blocks their worklists assign them to. Not a defect of this pass —
but whoever merges needs to know the block-to-worklist mapping no longer holds for those 19.
