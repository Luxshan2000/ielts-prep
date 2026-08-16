# VERIFY-READING — the eight standalone practice passages

**Scope:** `staging-reading/tests/practice-01.json` … `practice-08.json`, eight
`standalone_passages[]` rows, `rp_dx_pr01`–`rp_dx_pr08`, 112 questions.
**Method:** every passage read in full; **all 112 questions worked as a candidate, key hidden**,
then compared against the authored key; plus a mechanical pass over §9.4's lint list, an 8-gram
originality diff against the 36 exam passages, and a factual check of each subject against the real
world.

**Verdict: ship, after the three fixes in §2.** No wrong key. No rewritten exam passage. No
collision between the eight. The defects that exist are metadata and coverage defects, not
content defects.

---

## 1. Headline numbers

| Check | Result |
|---|---|
| `python3 -m json.tool` on all 8 files | **8/8 parse** |
| Questions worked independently, key hidden | **112/112 agree with the key** |
| TFNG / YNNG judgement items re-argued individually | **34/34 correct** |
| 8-grams shared with any of the 36 exam passages | **0** |
| 8-grams shared between any two of the eight | **0** |
| `evidence_quote` verbatim in an anchor paragraph | 112/112 |
| Completion / short-answer keys verbatim in an anchor, within `word_limit` | 46/46 |
| `nearest_text` present iff key is NOT GIVEN, and a real passage substring | 9/9 |
| `paraphrase_link` stem/text phrases substring-checked | 106/106 |
| Sequential groups monotonic by evidence offset | pass |
| Letter keys exist in `options[]`; more options than questions; no illegal reuse | pass |
| Trap slugs / devices / diagnosis codes / gear against the closed enums | **0 invalid** |
| Sentinel strings (`__CURSOR__`, `PLACEHOLDER`, `TBD`, …) | **0** |
| Duplicate `evidence_quote` within a row | 0 |
| Anchor spread (≤40% in one paragraph, ≥70% touched) | 8/8 pass |
| Forbidden claims (§0.2): real orgs, real researchers, real statistics, the three banned figures | **0** |
| Row `word_count` vs true text count | 8/8 exact |

The specific failure modes named in the brief — invented `slots`/`mode` payloads, sequence_index
collisions, decision cues that are not substrings, invented structure slugs and error codes,
sentinel strings, mismatched gap spans — **none of them occurs.** Gap markers `{{1}}`…`{{14}}` in
every `layout` match their group's question numbers exactly; every completion `prompt` carries
`{{gap}}`.

---

## 2. Problems, ranked by whether they would teach a learner something false

### Would teach something false — none affecting an answer

There is no wrong key in the set. Nothing below causes a learner to mark a correct answer wrong.

### MAJOR — teaches a false expectation about the paper (fix before merge)

**M1. `practice-08` is labelled GT Section 1 but is a Section 2 row in every measurable property.**

| Property | practice-08 has | §6.4 / §8.1 require for Section 1 |
|---|---|---|
| text blocks | 2 | 3–5 |
| total words | 826 | 550–750 |
| `band_target` | 6.5 | 5.0–5.5 |
| `difficulty` | `medium` | `easy` |

Every one of those four figures is Section **2**'s (2 blocks, 750–900 words, band 6.0–6.5, medium),
which the row matches exactly. Only the `gt_section: 1` label and the subject matter (tenant
repairs and ending a tenancy — social survival, genuinely Section 1 territory) point the other way.
Its type mix (`matching_information` + `sentence_completion` + `true_false_not_given`) is §6.5's
Section 1 draw list.

Nothing breaks — `skim_plan.kind` is `field_scan`, which is correct for Sections 1 *and* 2, and no
test references the row. But the strategy card will tell a learner "this is a Section 1 text" over a
text twice the length of one, at a band a Section 1 never reaches. Either relabel `gt_section: 2`
(cheapest, and consistent with the shape) or cut it to 550–750 words in 3–5 blocks and drop the band
to 5.5 / `easy`.

**M2. `practice-07` is labelled GT Section 2 but carries Section 1's band, difficulty and type mix.**

The shape is right — 2 blocks of 429 and 445 words, 874 total, squarely inside Section 2's envelope.
The metadata is not:

- `band_target` 5.5, where §8.1 fixes Section 2 at 6.0–6.5;
- `difficulty: "easy"`, where Section 2 is `medium`;
- group types `note_completion` + `true_false_not_given` + `short_answer`. §6.5 does not list
  `short_answer` in the Section 2 draw at all (it is a Section 1 type), and requires **at least two
  groups from the completion family**; this row has one.

M1 and M2 read as if the two GT agents each took half of the other's section spec. Neither error
changes an answer; both mis-teach what a GT section looks like, which is exactly the kind of thing a
learner cannot check for themselves.

### MEDIUM — coverage, not correctness

**M3. Four question types have zero practice items, so four drill kinds will be empty screens.**

Type coverage across the eight rows:

```
5 true_false_not_given   3 matching_information   3 sentence_completion
2 short_answer           2 yes_no_not_given       2 note_completion
1 matching_headings      1 multiple_choice        1 summary_completion
1 matching_features      1 matching_sentence_endings
1 table_completion       1 flow_chart_completion

NO PRACTICE ITEM AT ALL:
  diagram_labelling · list_selection · multiple_choice_multi · summary_completion_bank
```

Under `staging-practice/DESIGN.md` §2 consequence 1 ("drills draw from the practice pool only — not
'prefer', only") and consequence 2 ("an empty practice pool is an empty state, not a fallback"),
those four drill kinds go dark the moment the code change lands. That is the honest behaviour the
design asks for, but it should be a known and stated consequence, not a surprise.

`multiple_choice` is the next thinnest: **4 items in the entire practice pool**, which is under one
sitting's worth, so a learner drilling MCQ will recognise items immediately — the original
complaint, displaced rather than solved.

**M4. Volume is under the work list.** §5.1 asks for 9 Academic + 3 GT standalone rows; delivered
6 + 2. The pool is no longer empty, which was the urgent thing, but it is not yet big enough for
"three drills a week without recognising items" on the thinner types.

### MINOR

**m5. `practice-06` g3 is missing its task instruction.** `instructions_extra` reads only
`"NB You may use any letter more than once."` The `matching_information` line itself — *"Which
paragraph contains the following information?"* — is absent. `practice-01` g2 and `practice-08` g1
both carry it. A learner meeting this group in a drill is shown an NB with no task.

**m6. `practice-03` Q12's summary line overstates the study's scope.** The line reads *"One survey
of a mid-sized city found average `{{12}}` in the licensed bands below fifteen per cent."* The
passage says *"average occupancy below fifteen per cent **outside the broadcasting and mobile
allocations**"* — and those allocations are themselves licensed. The key (`occupancy`) is
unaffected, but a summary is a paraphrase and this one drops the qualifier that makes the finding
true.

**m7. `practice-06` ¶D arithmetic is only just consistent.** "Land of that kind has sold for three
or four times the price per square metre" plus "gives up two fifths of an area" gives 0.6 × 3 = 1.8×
to 0.6 × 4 = 2.4×. The following clause, "may still finish with a holding worth more than twice the
old one", holds only at the top of that range. The hedge *may* carries it, but a numerate candidate
who checks will hesitate.

**m8. Cross-agent proper-noun collisions.** `Halden` is a surname in practice-03 ("the engineer
Halden Rees") and a device brand in practice-07 ("the Halden fob"). `Priya` is the first name of two
different invented researchers — Priya Nandalal (practice-03) and Priya Iyer (practice-05). Both are
cosmetic; a bank-wide name registry would have caught them.

**m9. Both GT rows are set at a housing trust** — Kelmore Housing Trust (staff lone-working
procedure) and Ellersby Housing Trust (tenant repairs guide). Different audiences, different
content, zero text overlap. But a learner who drills both in a week will feel the institutional
repetition.

**m10. `practice-04` and `practice-05` carry an undeclared top-level `note` key** not in §9.1's file
shape. The merge is mechanical and reads only `tests` / `standalone_passages` / `updates`, so it is
harmless — but it is non-conforming and a stricter gate would reject it.

**m11. `practice-02`'s item band spread is 5.5–7.0.** §8.1 asks every passage set to span roughly
5.5 to 8.0. It is the only one of the eight that tops out below 7.5; the other seven reach 7.5 or
8.0.

**m12. `practice-05` Q1 is harder than its band says.** The stem "Because the premium is spread
across many separate purchases," admits ending B ("no national statistic records what has been
paid") on a loose reading of ¶G as well as the keyed D. D is right — it is ¶A's own clause, and the
sequential convention puts Q1 in ¶A — and the author anticipated B precisely, diagnosing it
`true_but_not_asked`. This is a well-built hard item, not an error. But `band_target: 6.0` under-rates
an item whose whole difficulty is discriminating two true statements.

---

## 3. The four questions the brief asked

### 3.1 Is each one genuinely new material?

**Yes. No agent rewrote an exam passage.** Zero shared 8-grams with any of the 36, and — the check
that actually matters — no shared argument structure. Subjects:

| Row | Subject | Nearest of the 36 | Verdict |
|---|---|---|---|
| pr01 | fog-water harvesting from coastal cloud | none | new field |
| pr02 | hospital deconditioning and ward mobility | *Working Through the Night* (shift work), *The Night Shift* (**moth pollination**, not wards) | new |
| pr03 | radio spectrum: licensed vs unlicensed vs tiered | *The Grid Learns to Wait* (grid storage) | new |
| pr04 | measuring forest carbon: stock vs flux | *Reading the Peat* | **checked closely — see below** |
| pr05 | the poverty premium | *The Economics of Waiting*, *The Money That Goes Home* | new |
| pr06 | land readjustment for urban expansion | *Cities Measured in Minutes* | new |
| pr07 | lone-working procedure + a personal-alarm device | 4 existing GT Section 2 workplace texts | new |
| pr08 | tenant repairs and ending a tenancy | *Settling into Norland* (GT S1) | new |

The one pair worth arguing is **pr04 vs *Reading the Peat***, since both are carbon in a natural
system. They are not the same passage. *Reading the Peat* runs mechanism → drainage → restoration →
finance, with one measurement paragraph (dipwells). pr04 is a survey-of-methods passage organised
around six invented researchers, arguing that stock and flux are different questions answered by
instruments that disagree. Different arc, different trap positions, different question shapes,
zero lexical overlap.

The GT pair is the other place a rewrite could hide, because the existing Section 1 rows are all
**listings** (course listings, flat listings). pr08 is continuous prose in two headed parts — a
different text form, which fills a gap rather than duplicating one.

### 3.2 Did the eight collide with each other?

**No subject overlap.** Zero shared 8-grams between any pair. The highest lexical Jaccard is 0.165
(the two GT rows), which is procedural-register vocabulary, not subject: one is a staff safety
procedure, the other a tenant handbook. The only real collisions are the cosmetic ones at m8 and m9
— a reused surname, a reused first name, and both GT texts being set at a housing trust.

### 3.3 Is every answer correct and derivable?

**Yes, on all 112.** I worked every question before looking at any key — not a sample. Full
agreement, including the ten completion answers where a wrong word form would have been easy to key
(`tear`, `set off`, `reserve plots`, `registered title`, `twenty-four hours`, `coastal radar`).
Every completion key is a verbatim contiguous span within its own word limit, and no `answers[]`
entry keys leniency the exam does not grant — the "singular accepted" pattern §1.6 warns about does
not appear anywhere in the eight.

Two answer sets key a genuine article variant (`"the top button"` / `"top button"`; `"the response
centre"` / `"response centre"`). That is permitted by §1.6 and is the right call.

### 3.4 TFNG and YNNG — is every NOT GIVEN really not given, every FALSE really contradicted?

**All 34 judgement items are correct.** This is the boundary I re-argued hardest, item by item.

The nine NOT GIVENs are all genuine absences with a tempting neighbour, and every one carries a
`nearest_text` pointing at the tempting sentence rather than a decisive one:

- pr01 Q1 — the passage names distance as the price driver and is simply silent on village size.
  Naming one cause does not deny another. Correct NG.
- pr01 Q4 — panels are sited in an agentless passive; villagers appear nowhere in ¶D. ¶F's "who owns
  the nets" is about maintenance, not siting. Correct NG.
- pr02 Q6 — ¶B gives one recovery profile for everyone and never separates patients by prior
  fitness. ¶G's baseline detects decline, it does not predict recovery. Correct NG.
- pr03 Q2 — the sharpest of them. ¶B gives auction revenue and never states the old administrative
  system's. ¶C's "no payment was made" is about the ISM bands, not the old regime, so the inference
  is unavailable. Correct NG.
- pr03 Q5, pr04 Q11, pr05 Q6, pr07 Q8, pr08 Q14 — all the same clean shape.

The eleven FALSE/NO items are all genuinely contradicted, most by a clause the reader has to finish
reading to reach — pr01 Q3 (the denial is the word *compromise* and the fraction after it), pr02 Q8
("generates no report at all" arrives in the next sentence), pr03 Q3 (after a colon), pr03 Q6,
pr05 Q8, pr05 Q10 ("more popular than either and **less reliable**"), pr07 Q9, pr08 Q11, Q13.
None is a stretch; none should have been NOT GIVEN.

The fourteen TRUE/YES items are all fully supported, and pr07 Q7 deserves a note as a good one:
"a fob that is fully charged will **normally** last a week" is TRUE against "holds enough power for
a full week of ordinary use, **although cold weather shortens that noticeably**" — the hedge in the
statement is what makes the exception clause survivable, and that is precisely the discrimination
the type exists to test.

Every TFNG/YNNG group contains all three keys, no key more than three times, and every group carries
both `absence_read_as_contradiction` and `contradiction_read_as_absence` in its traps, as §9.4 lint
38 requires.

### 3.5 Is there real information worth a learner's evening?

**Yes, in all eight.** None is filler shaped like a passage. Each carries a transferable idea and
usable vocabulary:

- **pr01** — why a *tighter* mesh catches *less* water (blocked air flows around the net), and that
  fog schemes fail on maintenance and ownership, not physics.
- **pr02** — that a treatment can succeed while the patient declines, and that wards optimise what
  is measured. The lesson about asymmetric measurement generalises far past hospitals.
- **pr03** — that interference is a property of equipment, not of air; the distinction between a
  price that tracks a cost and one that does not.
- **pr04** — **stock vs flux**, the single most useful distinction in the set, with the reservoir/river
  image that makes it stick.
- **pr05** — the poverty premium, and the cost/transfer line that decides which remedy works.
- **pr06** — land readjustment: owners surrender *area* rather than *ownership*. Genuinely unfamiliar
  and cleanly explained.
- **pr07** — a real lone-working routine, including the amber/red alert distinction and the trap that
  pressing the button twice cancels nothing.
- **pr08** — condensation vs penetrating damp, and the rent-runs-to-key-return rule. Both are things
  a real tenant is better off knowing.

Vocabulary is exam-useful and life-useful: *deconditioning · incumbency · guard band · allometric
conversion · flux · recharge · deduction · frontage · escalation · slack · occupancy*. AWL
percentage sits between 6.0 and 9.2 on every row (§3.5 wants 5–11) and unknown-token percentage
between 0.6 and 1.7 (ceiling 2.0).

### 3.6 Is anything factually wrong about the real world?

**No.** I checked each subject against how the thing actually works. Every one holds:

- **pr01** — fog droplets at "a few thousandths of a millimetre" (i.e. a few microns) is right;
  mesh shading "rather less than half the frame" matches real Raschel practice; double-layer meshes
  are standard; the 1 m² standard fog collector survey over a full year is exactly the real siting
  method; 3–10 L/m²/day is the real yield range and the 40 m² → 200 L arithmetic is internally
  consistent; mature trees stripping fog on their foliage (fog drip) is real and correctly presented
  as the older mechanism.
- **pr02** — ten days of bed rest producing measurable leg-muscle loss in healthy older volunteers is
  right, as is "the strength goes faster than the bulk"; the recovery asymmetry is right;
  *deconditioning* is the correct clinical term; the falls-are-counted / decline-is-not asymmetry is
  a real and well-documented feature of ward incentives.
- **pr03** — the strongest one. ISM bands set aside for equipment leakage, the unprotected
  must-accept-interference status, the 1980s permission for low-power spread-spectrum communication,
  unlicensed traffic overtaking licensed mobile, frequency hopping and listen-before-talk, spectrum
  occupancy surveys returning low double digits, and a three-tier database-coordinated band whose
  incumbent is coastal radar — all accurate.
- **pr04** — girth at chest height converted by an equation calibrated on a small destructively
  sampled set; eddy-covariance towers sampling CO₂ and air movement many times a second; a drought
  year flipping a forest from sink to source; roughly half of temperate woodland carbon below ground;
  the soil-detection problem (tiny annual change against a huge stock); airborne laser canopy-height
  saturation understating the tallest stands; and system-boundary disagreements (soil depth, dead
  wood, harvested timber) — all correct.
- **pr05** — the poverty premium is real and correctly characterised; prepayment meters historically
  dearer per unit; instalment surcharges not disclosed as interest; postcode-rated insurance;
  small-sum credit being the dearest; the price-cap risk that a supplier refuses the customer instead.
  The ~£490/£60 figures are attributed to an invented survey in an invented district, as the genre
  requires.
- **pr06** — land readjustment as practised: pooling, replanning, deductions of a quarter to a half
  with ~40% where a park is needed, reserve plots sold to fund the works, a majority threshold
  counted by number *and* area, replotting by value with a proximity constraint, unregistered
  occupiers served worst, and the two external prerequisites (a sound land register, a live market).
  All correct, including the falling-market failure mode.
- **pr07 / pr08** — UK social-housing and lone-working practice: repair priority bands, the annual gas
  safety check as the one legally unavoidable visit, 24 hours' written notice before entry, four
  weeks' notice ending on a Sunday, recharges for lock changes and missed appointments, condensation
  as the most misdiagnosed damp, forwarding addresses visible to other social landlords. All
  realistic.

All proper nouns are invented and follow the house convention (Ashfield, Norland reappear from the
existing bank; Tarnbeck, Carrow Ridge, Elsdale, Kelmore, Ellersby, Cadeley are new). No real
organisation, no real named researcher, no real published statistic. None of §0.2's three banned
figures appears; every percentage in the eight is spelled out and attributed to an invented study.

---

## 4. What to do

1. **Fix M1 and M2** — the two GT rows' `gt_section` / `band_target` / `difficulty` / type-mix
   inconsistency. Cheapest coherent fix: relabel practice-08 as `gt_section: 2` (its shape already
   is), and raise practice-07 to `band_target: 6.0` / `difficulty: "medium"` while swapping its
   `short_answer` group for a second completion group. Metadata only — do not touch the text or the
   keys.
2. **Fix m5** — restore the task line to `practice-06` g3's `instructions_extra`.
3. **Fix m6** — reword `practice-03` Q12's summary line to keep the passage's qualifier.
4. **Then merge.** Everything else in this report is either cosmetic (m7–m12) or a scope statement
   for the next authoring pass (M3, M4).
5. **State M3 as a release note**, not a bug: with the drill query restricted to the practice pool,
   `diagram_labelling`, `list_selection`, `multiple_choice_multi` and `summary_completion_bank`
   drills will show the empty state, and `multiple_choice` will have four items. That is the design
   working as written; it should not surprise anyone on the day it lands.

**Note on merge state.** The merge has already been run: `data/reading_passages.jsonl` now holds 44
rows — the 36 referenced by the 12 tests, plus all eight `rp_dx_pr*` rows byte-identical to their
staging source. The practice pool is therefore no longer empty, which was the urgent problem. Since
§9.3's merge is idempotent, applying the fixes above to the staging files and re-running the merge
is safe and will not disturb the exam pool. Verified from the pack, not from the staging files:

```
tests 12 · passages 44 · referenced by a test 36 · standalone 8
```

The four post-merge checks in §9.5 (`D1`–`D3`, drill fill from the practice pool) were **not** run by
this verification and remain outstanding.
