# R-R2 — General Training Reading: research briefing and authoring spec

**Status:** research + authoring spec. No content rows are produced by this document.
**Audience:** the R-R3…R-Rn content agents who will author GT passage rows, and the verify agent.
**Owned path:** this file only.

BandReady currently ships **zero** General Training reading content. Every GT row that will ever
exist in the pack is authored from this briefing, so it is written to be sufficient on its own: the
paper's real anatomy, the text types, the band arithmetic, the error taxonomy, and then a
schema-exact authoring spec checked against the code that is actually running in this repo.

---

## 0. Copyright — read before you author

- IELTS past papers, their passages, their questions and their published explanations are
  copyrighted. **We reproduce none of them.** This document deliberately describes *structure and
  genre* of official samples and never quotes their content.
- What is free to use: the **format**, the **question types**, the **raw-score-to-band tables**
  (they are facts), the **topic areas that recur**, and band descriptors **paraphrased in our own
  words**.
- The genre lists in §3 are recurrence patterns, not copies. When you author "a notice about a
  library's summer opening hours", invent the library, the town, the hours, the prices and the
  rules. If a sentence you are typing feels like one you read while researching, rewrite it.
- Copy says **"IELTS-style"**. "IELTS" is a trademark; the non-affiliation notice applies to
  everything shipped.

---

## 1. The paper, verified

Official (ielts.org / IDP), cross-checked across three pages:

| Fact | Value |
| --- | --- |
| Time | **60 minutes**, and — as in Academic — that 60 minutes **includes** answer-sheet transfer. Unlike Listening there is **no extra transfer time.** |
| Sections | **3**, in ascending difficulty |
| Texts | Section 1: **2–3 short texts, or several shorter ones** (official sample material runs to **five** short texts in a section). Section 2: **2 texts**. Section 3: **1 long text**. So **5–7 discrete texts** across the paper, versus Academic's flat 3. |
| Questions | **40**, one mark each, no negative marking |
| Total text length | **2,150–2,750 words** across the whole paper |
| Sources | "books, magazines, newspapers, notices, advertisements, company handbooks and guidelines"; Section 3 specifically "newspapers, magazines, books and online resources" |
| Reporting | band 1–9 in whole and half bands |
| Spelling | both British and American spellings accepted, but must be internally consistent; a misspelt answer is simply wrong |

### 1.1 Question counts per section

Not fixed by the specification — sections carry **12–14 questions** each and the split varies by
paper. The modal Cambridge split, and the one we standardise on, is:

| Section | Questions | Numbering |
| --- | --- | --- |
| 1 — social survival | 14 | **1–14** |
| 2 — workplace survival | 13 | **15–27** |
| 3 — general interest | 13 | **28–40** |

Numbering is **continuous 1–40 across the paper**, exactly as in Academic. It does **not** restart
per section. This is already an invariant our validator half-enforces (see §9.2).

### 1.2 Timing — what we actually teach

The naive "20 minutes per section" advice is wrong and costs marks, because Section 3 is the
hardest text with the same number of marks as Section 1. The GT time plan we teach:

| Phase | Minutes | Cumulative |
| --- | --- | --- |
| Section 1 (Q1–14) | **15** | 15 |
| Section 2 (Q15–27) | **17** | 32 |
| Section 3 (Q28–40) | **22** | 54 |
| Sweep: blanks, word limits, plurals, spelling | **6** | 60 |

Rationale to surface in the UI: Section 1 marks are the cheapest in the whole paper — pure
scanning against dates, prices and eligibility rules — so time spent there beyond ~1 minute per
mark is time stolen from Section 3, where each mark costs real reading. The single most common
GT-specific loss pattern is a candidate arriving at Section 3 with 12 minutes left.

---

## 2. Section anatomy

### 2.1 Section 1 — "social survival"

The tested construct is *retrieving factual information from the printed matter of daily life in an
English-speaking country*. Not gist, not argument, not opinion. Scanning and precise matching.

Structural signature:
- Usually **two clusters**. A cluster is either (a) a set of 4–6 tiny lettered items — five
  restaurant listings, five evening courses, five campsites — or (b) one short continuous text of
  200–300 words such as a railcard leaflet or an evacuation notice.
- A very common shape is **cluster of lettered items + matching-information questions**
  ("which advertisement mentions…"), then a second cluster with completion or TFNG.
- Items are **factual, not descriptive**. Dense with numbers.
- There is no argument and no author voice, so **YNNG never appears here**.

### 2.2 Section 2 — "workplace survival"

Tested construct: *understanding the documents an employee receives*. The register shifts to
institutional-formal: policies, entitlements, obligations, procedures.

Structural signature:
- **Two texts**, each with its own question set, typically 6–7 questions apiece.
- Question types skew hard toward **gap-fill families** — note completion, table completion,
  summary completion, sentence completion, flow-chart completion (procedures are natural
  flow-charts), plus short answer.
- Texts are conditional-heavy: *if you have been employed for more than 12 months…*, *staff on
  Grade 4 and above may…*, *this does not apply to casual staff*. The marks live in the
  qualifiers.
- Five recurring content families: work advice (leadership, CVs, resigning, work-life balance,
  grievances); safety guidance (equipment, kitchens, ladders, machinery); role/skill guides (what
  a plumber, barista, taxi driver needs); company policy (parking, dress code, maternity, leave,
  performance pay); and workplace advertisements (vacancies, courses, partnership offers).

### 2.3 Section 3 — "general reading"

Tested construct: *extended reading of a structured text on a topic of general interest*. Officially
"generally descriptive and instructive". Not the argumentative, evidence-weighing register of
Academic Passage 3 — but close to Academic in raw difficulty, and this is where GT candidates lose
most.

Structural signature:
- **One text, the longest in the paper.** Multi-paragraph, paragraph-labelled A, B, C…
- Because it has labelled paragraphs and a discernible structure, it is the **only** place in the
  GT paper where **matching headings** and **matching information (paragraph letters)** are
  natural, and the main place for multiple choice and matching sentence endings.
- Topic space: natural history, transport and infrastructure history, social phenomena, a place, a
  craft, an institution, a technology in everyday life. Descriptive/expository, third person.
- **YNNG can appear** here when the writer takes a position, but it is rarer than in Academic.

---

## 3. Text types — the authoring menu

Every one of these is a recurrent genre, not a specific paper. Each entry says what it looks like
on the page, because the *shape* is what makes a GT item feel authentic.

### 3.1 Section 1 — 16 usable genres

| # | Genre | What it looks like |
| --- | --- | --- |
| 1 | **Classified advertisement set** (4–6 lettered items) | Each 40–90 words: name, one-line pitch, then price, opening times, location, one restriction. Restaurants, campsites, guest houses, bike shops, market stalls. |
| 2 | **Evening/short-course listings** | Course title, tutor, level, dates, fee, concession rule, "no experience necessary", enrolment deadline. |
| 3 | **Public notice** | A single framed instruction set: building evacuation, pool rules, recycling collection changes, roadworks, park by-laws. Imperative mood, "must", "may not". |
| 4 | **Timetable / schedule + notes** | A service or event schedule expressed as lines (day, time, service, note), plus a short prose block of exceptions ("no service on public holidays"). |
| 5 | **Library / community-centre information sheet** | Membership categories, loan limits, renewal, fines, computer booking, room hire. Number-dense. |
| 6 | **Leisure-attraction leaflet** | Zoo, heritage railway, castle, garden: admission tiers, family ticket rules, last entry, dogs, accessibility, café hours. |
| 7 | **Transport discount / travelcard leaflet** | Eligibility by age or status, price, validity period, where it can be bought, blackout times, what it does not cover. |
| 8 | **Accommodation information for new arrivals** | Student halls or shared housing: deposit, bills included/excluded, notice period, guests, what the landlord provides. |
| 9 | **Local-services directory entries** | Plumber, locksmith, dog walker, tutor: call-out fee, hours, coverage area, guarantee. |
| 10 | **Menu / price list with conditions** | Set-lunch rules, service charge, group booking policy, dietary marks, "cash only after 9pm". |
| 11 | **Museum / gallery visitor information** | Free days, ticketed exhibition, cloakroom, photography rule, guided-tour times, under-16 rule. |
| 12 | **Event programme** | A festival's day-by-day listing with venues, start times, ticket categories, "unticketed but arrive early". |
| 13 | **Council / utility letter or notice to residents** | Bin collection change, water shut-off, permit scheme, how to apply, deadline, penalty. |
| 14 | **Health-centre / clinic registration information** | Who can register, documents needed, appointment booking, out-of-hours number, repeat prescriptions. |
| 15 | **Product / appliance information card** | Warranty length, what voids it, care instructions, returns window, helpline hours. |
| 16 | **Membership / club joining information** | Sports club, allotment society, film club: fee tiers, waiting list, committee, AGM, guest rules. |

### 3.2 Section 2 — 15 usable genres

| # | Genre | What it looks like |
| --- | --- | --- |
| 1 | **Job advertisement / vacancy notice** | Role, salary band, hours, essential vs desirable criteria, closing date, how to apply, "references required". |
| 2 | **Job description / person specification** | Purpose of post, reporting line, numbered duties, competency list. |
| 3 | **Contract of employment extract** | Probation, notice periods each way, hours and overtime, confidentiality, variation clause. Highly conditional. |
| 4 | **Staff handbook section** | Dress code, IT and email use, personal phones, expenses, gifts and hospitality. |
| 5 | **Leave and absence policy** | Annual leave accrual, carry-over cap, sickness self-certification, medical certificates, unpaid leave, compassionate leave. |
| 6 | **Pay and benefits statement** | Pay dates, grades and increments, overtime multipliers, on-call allowance, pension contribution tiers, salary sacrifice. |
| 7 | **Induction / new-starter guide** | First-day checklist, who to see, mandatory training in the first month, probation review points. |
| 8 | **Training and staff-development scheme** | Course catalogue, who may apply, funding limits, study leave, the clawback rule if you leave within N months. |
| 9 | **Health-and-safety procedure** | Numbered steps, PPE, reporting an incident, first-aiders, what to do on hearing the alarm. Natural flow-chart material. |
| 10 | **Grievance / disciplinary procedure** | Informal stage, written stage, hearing, right to be accompanied, appeal, time limits at each stage. |
| 11 | **Performance-review / appraisal guidance** | Cycle dates, self-assessment, objective-setting, rating scale, link to performance pay. |
| 12 | **Flexible-working and remote-working policy** | Eligibility (service length), how to request, the decision window, trial period, equipment provided. |
| 13 | **Workplace facilities and practical information** | Parking permits, lockers, canteen hours, cycle scheme, site access outside hours. |
| 14 | **Career-advice article for employees** | "How to negotiate a salary", "how to resign well", "making the most of a mentor". Second person, instructive. |
| 15 | **Volunteer / apprentice / work-placement information** | Hours, expenses, supervision, what the placement does and does not guarantee, registration steps. |

### 3.3 Section 3 — 12 usable genres

| # | Genre | What it looks like |
| --- | --- | --- |
| 1 | **Natural-history feature** | A species or habitat: description, behaviour, human contact, conservation. Warm, magazine register. |
| 2 | **Transport / infrastructure history** | A bridge, a tunnel, a postbus network, a canal: why it was built, how, what changed. |
| 3 | **Place portrait** | An island, a valley, a small city: geography, economy, life there now. |
| 4 | **Craft or trade profile** | Bell-founding, thatching, boatbuilding: process, decline, revival. |
| 5 | **Everyday-technology story** | The zip, the barcode, refrigeration, the emoji: origin, spread, consequence. |
| 6 | **Institution profile** | A library service, a lifeboat charity, a national park authority: how it works and who pays. |
| 7 | **Social-phenomenon feature** | Commuting, allotments, night shifts, second-hand markets. Descriptive with light interpretation. |
| 8 | **Food-system feature** | Where a staple comes from, how it reaches a shelf, seasonality, waste. |
| 9 | **Health-and-lifestyle feature** | Sleep, walking, hearing, hydration. Instructive, cites researchers by name — good matching-features material. |
| 10 | **Practical instructional article** | Choosing and maintaining something substantial (a bicycle, a wood stove, a garden pond). Officially "instructive". |
| 11 | **Biographical / organisational narrative** | A founder, a first crossing, a rescue service's origin story. Chronological — good for flow-charts. |
| 12 | **Environment-and-community feature** | Rewilding a river, a community energy scheme, a repair café: what was done, by whom, with what result. |

---

## 4. Register and content signature of GT texts

This is the part that most distinguishes a convincing GT text from a shrunken Academic one.

**GT texts carry the load in the detail, not in the syntax.** Academic hides answers behind
nominalisation and subordination; GT hides them behind *quantities and conditions*. So author with
these on the page:

- **Dates and windows** — "applications close on 14 March", "valid for twelve months from purchase".
- **Prices and tiers** — full, concession, family, member; deposit vs balance; "£4.50 per session,
  or £40 for ten".
- **Times and days** — opening hours that differ at weekends; last entry; a service that does not
  run on public holidays.
- **Eligibility rules** — age bands, length of service, residence, membership, "students in full-time
  education only".
- **Conditions and exclusions** — "provided that…", "unless…", "this does not apply to…",
  "except where…", "subject to availability".
- **Obligations vs permissions** — *must*, *may*, *should*, *are advised to*, *are required to*.
  The difference between *must* and *is recommended* is a whole TFNG item.
- **Named contacts and channels** — a desk, a form number, a phone line, an email, "in person only".
- **Quantities and limits** — six books at a time, two guests per member, a 20 kg allowance.

Person and mood by section: **S1** — impersonal or second person, imperative in notices. **S2** —
second person and institutional third person ("employees are entitled to…"). **S3** — third
person, expository, past and present tense, one authorial voice.

Sentence length: S1 short (12–16 words average) with fragments allowed inside listings; S2 medium
(16–20) with heavy subordination in the conditional clauses; S3 longest (18–24) and the only place
where a genuinely complex period is appropriate.

Lexis: everyday and semi-technical, **not** academic. "Set up" not "establish", "pay" not
"remuneration" — except in S2, where a policy document legitimately uses *entitlement*,
*probationary*, *reimbursement*, *statutory*. That contrast between plain and bureaucratic
vocabulary inside S2 is itself a paraphrase-recognition target.

---

## 5. GT vs Academic — length, difficulty, scoring

### 5.1 Length and difficulty

| | Academic | General Training |
| --- | --- | --- |
| Texts | 3 | 5–7 (S1 up to 5 short) |
| Structure | 3 long passages, roughly equal | Ascending: several short → two medium → one long |
| Total words | 2,150–2,750 | 2,150–2,750 (**the same** — GT spreads it over more texts) |
| Longest single text | ~900 | ~900 (Section 3) |
| Shortest single text | ~700 | ~60 (one lettered advert) |
| Sources | journals, books, periodicals — academic-adjacent | everyday print, workplace documents, general press |
| Register | formal expository/argumentative | practical, instructional, institutional; expository only in S3 |
| Dominant skill | paraphrase recognition across dense prose; argument tracking | scanning for specifics; matching conditions; then, in S3, real paraphrase reading |
| Discipline knowledge | assumed academic reading habits | assumed none |
| Difficulty curve | high and flat | low → medium → **near-Academic** in S3 |

The honest summary to give learners: **GT is easier to read and harder to score.** Sections 1 and 2
are gettable in full; the band table then charges you for every one you drop.

### 5.2 Raw-score-to-band tables

Both tables below are the widely published consensus conversions and match multiple independent
sources. They are approximations of a per-paper calibration — real conversions vary by about ±1
mark between versions, which is why our UI ships `BAND_DISCLAIMER`.

**Academic Reading** (`ACADEMIC_BAND_TABLE`, `sidecar/bandready/server/routes/reading.py:56`)

| Band | Raw /40 |
| --- | --- |
| 9.0 | 39–40 |
| 8.5 | 37–38 |
| 8.0 | 35–36 |
| 7.5 | 33–34 |
| 7.0 | 30–32 |
| 6.5 | 27–29 |
| 6.0 | 23–26 |
| 5.5 | 19–22 |
| 5.0 | 15–18 |
| 4.5 | 13–14 |
| 4.0 | 10–12 |
| 3.5 | 8–9 |
| 3.0 | 6–7 |

**General Training Reading** (`GT_BAND_TABLE`, same file, line 75)

| Band | Raw /40 |
| --- | --- |
| 9.0 | 40 |
| 8.5 | 39 |
| 8.0 | 37–38 |
| 7.5 | 36 |
| 7.0 | 34–35 |
| 6.5 | 32–33 |
| 6.0 | 30–31 |
| 5.5 | 27–29 |
| 5.0 | 23–26 |
| 4.5 | 19–22 |
| 4.0 | 15–18 |
| 3.5 | 12–14 |
| 3.0 | 9–11 |

**Verification result: the tables already in the repo are correct.** I checked
`GT_BAND_TABLE` against two independent published tables that agree with it exactly
(ieltsbeacon, simplyielts), and against a third (ielts9.io) which differs only at 8.0/7.5 — it
gives 38→8.0 and 36–37→7.5 where the consensus gives 37–38→8.0 and 36→7.5. **No change needed;**
do not "fix" this table.

**The delta, which is the thing to teach:**

| Band | Academic min | GT min | GT costs you |
| --- | --- | --- | --- |
| 9.0 | 39 | 40 | +1 |
| 8.0 | 35 | 37 | +2 |
| 7.0 | 30 | 34 | **+4** |
| 6.5 | 27 | 32 | **+5** |
| 6.0 | 23 | 30 | **+7** |
| 5.5 | 19 | 27 | **+8** |
| 5.0 | 15 | 23 | **+8** |

Two facts worth putting in front of a GT learner:

1. **30/40 is band 7.0 on Academic and band 6.0 on General Training.** Same raw score, a full band
   apart.
2. **Band 6 on GT means 30 right — you may drop only 10 of 40.** Since Sections 1 and 2 supply 27
   of those marks and are the easy ones, the practical target is *near-full marks on Q1–27*, which
   makes Section 1 accuracy — not Section 3 heroics — the band-6 lever. That is a genuinely
   different study strategy from Academic and our GT coaching copy should say so.

---

## 6. Question types — inventory and GT skew

All eleven official task families are permitted in GT; the specification lists the same set for
both modules. What differs is **frequency and placement**.

| Type (our slug) | GT frequency | Where in GT | Notes |
| --- | --- | --- | --- |
| `matching_information` | **very high** | S1 above all, also S3 | In S1 this is the "which advertisement/notice mentions X" item. The letters are the *short texts*, not paragraphs. Reusable letters; non-sequential. |
| `true_false_not_given` | **very high** | S1, S2 | The workhorse. In S2 it bites on conditions and modality. |
| `sentence_completion` | **very high** | S1, S2 | Word-limited; answers in text order. |
| `note_completion` | **high** | S2 above all | A headed note-page skeleton over a policy or procedure. **Not yet present in our bank.** |
| `table_completion` | **high** | S1, S2 | Natural over price/eligibility grids. |
| `short_answer` | **high** | S1, S2, S3 | Word-limited; "How much…", "When…", "Who…". |
| `multiple_choice` | **high** | S2, S3 | Four options, single answer, in text order. |
| `summary_completion` | medium | S2, S3 | From text. |
| `summary_completion_bank` | medium | S3 | From a word list. |
| `flow_chart_completion` | medium | **S2 especially** | Procedures — grievance stages, safety steps, application process. **Not yet present in our bank.** GT uses this more than Academic does. |
| `matching_features` | medium | S2, S3 | People/schemes/departments → statements. |
| `matching_sentence_endings` | medium | S3 | **Not yet present in our bank.** |
| `matching_headings` | **low** | **S3 only** | Needs a paragraph-structured text; S1/S2 have none. Much rarer than in Academic. |
| `yes_no_not_given` | **low** | S3 only, and only if the writer takes a position | Rare in GT. Do not force it. |
| `diagram_labelling` | low | S2/S3, only where a diagram is genuinely apt | **Not yet present in our bank.** Requires the `layout.image` path — see §11. |

**Type skew in one line:** GT is *completion-heavy and matching-information-heavy*; Academic is
*headings-heavy and judgement-heavy*. `GT_TYPE_POOL` in
`sidecar/bandready/content/generate_reading.py:104` already excludes `matching_headings` and
`yes_no_not_given` from GT generation — that is the right call and matches the research.

**GT type-mix target per section** (what a hand-authored GT test should look like):

- **S1 (14 q):** one `matching_information` group over a lettered cluster (5–7 q) + one of
  {`true_false_not_given`, `sentence_completion`, `table_completion`, `short_answer`} over the
  second cluster (7–9 q). Two groups, occasionally three.
- **S2 (13 q):** two or three groups, at least two from the completion family
  (`note_completion`, `sentence_completion`, `flow_chart_completion`, `table_completion`,
  `summary_completion`), plus `true_false_not_given` or `matching_features`. Each text gets its
  own group(s).
- **S3 (13 q):** three or four groups spanning `matching_headings` **or** `matching_information`,
  `multiple_choice`, `matching_sentence_endings` **or** `matching_features`, and one completion or
  `short_answer`. `yes_no_not_given` only where the text has a real authorial claim.

Across a whole GT test, aim for **≥7 distinct types**, and include at least one of the four types
missing from our bank (`note_completion`, `flow_chart_completion`, `matching_sentence_endings`,
`diagram_labelling`) — GT Section 2 is the natural home for the first two.

---

## 7. Candidate errors specific to General Training

Generic reading errors (blind word-matching, over-thinking Not Given, running out of time) apply to
both modules and belong in the Academic briefing. These are the ones the **GT paper** manufactures.

1. **Pacing to the wrong curve.** Treating three sections as three equal 20-minute blocks. Section
   1 is worth 14 marks and takes 15 minutes; Section 3 is worth 13 and needs 22. Candidates arrive
   at Section 3 short of time and lose the marks they can least afford under the GT band table.
2. **Under-respecting Section 1.** Because the texts look trivial, candidates skim and misread a
   qualifying detail — "under 16s free **when accompanied by an adult**", "£40 **for ten
   sessions**". These are the cheapest marks in the paper and they are dropped by carelessness,
   not by ability.
3. **The band-table blind spot.** A GT candidate who is used to Academic mark schemes thinks 30/40
   is "a comfortable 7". It is a 6.0. This causes systematically miscalibrated self-assessment and
   under-preparation.
4. **Missing the exclusion clause.** GT texts are built on conditions. The answer to a TFNG is
   routinely in a subordinate clause — *unless you are a member*, *except during school holidays*,
   *provided you have completed probation*. Candidates read the main clause, match the keywords,
   and answer TRUE where the text says the opposite for their case.
5. **Modality collapse.** Treating *must* / *should* / *is advised to* / *may* as equivalent. In a
   staff handbook the difference between an obligation and a recommendation is exactly one mark,
   and this is the highest-yield TFNG trap in Section 2.
6. **Non-sequential search on lettered clusters.** In S1 matching-information, questions do **not**
   follow text order and letters may repeat. Candidates who read the clusters top-to-bottom in
   order waste minutes; candidates who assume each letter is used once force wrong answers.
7. **Copying the whole phrase into a gap.** GT completion answers are short and lifted verbatim,
   so candidates over-copy: "a **valid student** card" when the gap allowed two words and wanted
   "student card". Our matcher enforces the limit (`within_word_limit`), and an over-limit answer
   scores zero even when the content is right.
8. **Number formatting.** GT is number-dense, so this bites more here than in Academic: writing
   "twenty-five pounds" where "£25" was wanted, dropping the currency symbol, "9.30am" vs "9:30",
   "14 March" vs "March 14". Accepted variants must be authored generously (§10.6).
9. **Singular/plural slips when copying.** "two references" copied as "reference". A dropped *s* is
   a dropped mark.
10. **Section-2 vocabulary shock.** Candidates expect "easy English" throughout and are ambushed by
    *statutory*, *pro rata*, *in lieu*, *clawback*, *probationary period*. They then guess rather
    than reading the surrounding definition, which GT policy texts almost always supply.
11. **Assuming Section 3 is a soft Academic passage.** It is nearly as hard, and it is the section
    where the type mix is widest — headings, MCQ, sentence endings — so candidates who have drilled
    only completion tasks on S1/S2 meet unfamiliar tasks at the moment they are most tired.
12. **Reading Section 3 for argument.** It is descriptive/instructive; there is often no thesis to
    track. Candidates hunting a position waste time and then over-select "NO" on YNNG items that
    are really "NOT GIVEN".
13. **Forgetting there is no transfer time.** Same as Academic, but GT candidates are more often
    first-timers who have heard about Listening's extra ten minutes and assume Reading has it too.

---

## 8. What our schema already supports — verified against the code

I read the code rather than the plan. Findings:

### 8.1 `texts[]` **can** carry multiple short texts — confirmed

- `sidecar/bandready/content/validate.py:180` — `ReadingPassageRow` is
  `{id, format, title, topic_id, word_count, band_target, passage_json}` with
  `format ∈ {"academic","general_training"}`. `passage_json` is a free-form dict; the model is
  `extra="allow"`. **Nothing constrains `texts[]` to length 1.**
- `app/src/features/reading/types.ts:29` — `TextBlock = {id, heading?, paragraphs?}` and
  `PassageDoc.texts?: TextBlock[]`.
- `app/src/features/reading/components/PassagePane.tsx:280` — the renderer **maps over
  `passage.texts` and renders each block as its own `<section>`, printing `block.heading` as an
  `<h3>` above its paragraphs.** Multi-text sections therefore already render, stacked vertically
  with headings, with no code change.
- `PassagePane.tsx:267` already renders a `Section {gt_section}` badge.

**Conclusion: a GT section = one `reading_passages` row whose `passage_json.texts[]` holds 2–5
blocks. No schema change and no renderer change is required.** This is the answer to the question
the task posed.

### 8.2 Two constraints the renderer imposes that the validator does not

Both are real and must be honoured by authors:

1. **Paragraph ids must be unique across the whole row, not per text block.**
   `PassagePane.tsx:129` builds `paragraphTexts` as a **flat `Map`** over *all* blocks'
   paragraphs keyed by paragraph id. Highlights, notes (`noteKey(passageId, paragraphId)`),
   evidence locating and `paragraphDomId()` all key on paragraph id alone. Two blocks both using
   `A` collide: notes and highlights land on the wrong text and "locate the evidence" jumps to the
   wrong place.
2. **The paragraph id is learner-visible.** `PassagePane.tsx:308–314` prints it in a `w-7`
   (≈28 px) gutter in bold. It is the letter the candidate sees and writes as an answer. So it
   must be a **single character** (a two-character id will be cramped) and it must be the letter
   the question options refer to.

Together these force the rule in §10.3: **one continuous A, B, C… sequence across the entire GT
section row, never restarting per text block.**

### 8.3 Question shape and validation

- `iter_reading_questions()` (`validate.py:523`) walks `passage_json.question_groups[].questions[]`.
  **All groups for all texts in a section live in the one row's `question_groups[]` array.** There
  is no per-text question container and none is needed.
- `validate_relations()` (`validate.py:468`) enforces, **per row**: every question has an integer
  `number`; every question has a non-empty `answers[]`; no duplicate numbers within the row.
  It does **not** check cross-row contiguity of 1–40 for a test. That invariant is on us — see
  §10.5 and the lint in §10.8.
- `ReadingTestRow` (`validate.py:197`) is `{id, format, title, p1_id, p2_id, p3_id}`. Exactly three
  slots, which maps cleanly onto GT's three sections: **p1 = Section 1, p2 = Section 2,
  p3 = Section 3.**

### 8.4 The answer matcher already covers every GT type

`sidecar/bandready/scoring/answers.py`:

- `LETTER_TYPES` (line 76) includes `matching_information`, `matching_features`,
  `matching_sentence_endings`, `matching_headings`, `summary_completion_bank`, `multiple_choice`.
- `TEXT_TYPES` (line 97) includes `note_completion`, `flow_chart_completion`, `table_completion`,
  `diagram_labelling`, `sentence_completion`, `summary_completion`, `short_answer`.
- `CHOICE_TYPES` = TFNG, YNNG.
- `within_word_limit()` (line 395) implements IELTS counting: hyphenated compound = 1 word,
  contraction = 1, a number token = 1 and **"AND/OR A NUMBER" allows one number *in addition to*
  the word allowance**; articles count as words.
- `instruction_for()` (line 425) renders the instruction string. **Never hand-type
  "NO MORE THAN TWO WORDS…" into a group — set `word_limit` and let this render it.**
- `spelling_variants()` (line 541) generates UK/US pairs at authoring time; the matcher does
  **not** consult them at match time, so **every accepted spelling must be authored explicitly
  into `answers[]`.**

`app/src/features/reading/qtypes.ts` already lists and labels all four "missing" types, so the
answer inputs render for them today.

---

## 9. AUTHORING SPEC — General Training reading rows

### 9.1 One row per section

A GT test is **three `reading_passages` rows + one `reading_tests` row**.

```
reading_tests row  rt_gt_01
  ├── p1_id → rp_gt_01_s1   (Section 1, questions 1–14)
  ├── p2_id → rp_gt_01_s2   (Section 2, questions 15–27)
  └── p3_id → rp_gt_01_s3   (Section 3, questions 28–40)
```

Do **not** put a whole GT test in one row. `passage_document()` has a legacy branch for a
whole-test document that silently returns only the first passage — that path must not be exercised.

### 9.2 Row fields

| Field | Section 1 | Section 2 | Section 3 |
| --- | --- | --- | --- |
| `id` | `rp_gt_<NN>_s1` | `rp_gt_<NN>_s2` | `rp_gt_<NN>_s3` |
| `format` | `"general_training"` | same | same |
| `title` | a human section name, e.g. `"Around the town"` | `"Working at Brackenfield"` | the article's own title |
| `topic_id` | from `content/core-en/data/topics.jsonl` — see §9.9 | usually `topic_work` | any |
| `word_count` | sum of **all** words across all `texts[]` | same | same |
| `band_target` | `5.0`–`5.5` | `6.0`–`6.5` | `7.0`–`7.5` |
| `passage_json` | see below | | |

`passage_json`:

| Key | Section 1 | Section 2 | Section 3 |
| --- | --- | --- | --- |
| `schema_version` | as the existing Academic rows | | |
| `id` | `"p1"` | `"p2"` | `"p3"` |
| `position` | `1` | `2` | `3` |
| `title` | mirrors the row title | | |
| `topic` | human label of `topic_id` | | |
| `difficulty` | `"easy"` | `"medium"` | `"hard"` |
| **`gt_section`** | **`1`** | **`2`** | **`3`** |
| `word_count` | mirrors the row | | |
| `texts` | **3–5 blocks** | **2 blocks** | **1 block** |
| `question_groups` | 2–3 groups, Q1–14 | 2–3 groups, Q15–27 | 3–4 groups, Q28–40 |

`gt_section` is `null` on Academic rows and **must** be `1|2|3` on GT rows — it drives the
`Section N` badge in `PassagePane` and is how the drill/browse UI can filter by section.

### 9.3 Representing a multi-text section

A **text block** = one self-contained document (one advertisement set, one notice, one policy).

```jsonc
"texts": [
  {
    "id": "t1",
    "heading": "Weekend classes at Harlow Community Centre",   // shown as <h3>; REQUIRED for GT
    "paragraphs": [
      { "id": "A", "text": "Beginners' pottery — Saturdays 10.00–12.00 …" },
      { "id": "B", "text": "Conversational Spanish — Saturdays 14.00–15.30 …" },
      { "id": "C", "text": "…" },
      { "id": "D", "text": "…" },
      { "id": "E", "text": "…" }
    ]
  },
  {
    "id": "t2",
    "heading": "Using the Harlow leisure card",
    "paragraphs": [
      { "id": "F", "text": "…" },
      { "id": "G", "text": "…" },
      { "id": "H", "text": "…" }
    ]
  }
]
```

Rules:

- **`heading` is required on every GT text block** (it may stay `null` on Academic rows, as today).
  Without it the learner cannot tell where one document ends and the next begins, since the
  renderer stacks them with only a margin between.
- **Letters run continuously across the whole row**: `t1` uses A–E, `t2` continues at F. **Never
  restart at A in a second block** — §8.2 explains why. Where a real paper would relabel A–E twice,
  we use A–E and F–J; the learner experience is identical and our highlight/note/locate machinery
  keeps working.
- In a **lettered cluster** (advertisement set, course listing), **one advert = exactly one
  paragraph = one letter**. If an advert needs a name line, fold the name into the first sentence
  or into the paragraph's opening clause. Do not split one advert across two letters — the letter
  *is* the answer token for `matching_information`.
- In a **continuous short text** (a notice, a policy), paragraphs are ordinary paragraphs and the
  letters just continue the sequence.
- Section 1 total: **3–5 blocks maximum**. More than that and the split pane becomes a scroll
  marathon.

**Tabular content** (timetables, price lists, opening hours) has no table renderer inside
`texts[]`. Author it as a paragraph of line-shaped entries with a consistent separator, e.g.
`"Monday to Friday — 9.00 to 17.30; Saturday — 9.00 to 13.00; Sunday and public holidays — closed."`
It reads correctly, it is scannable, and it keeps the answer spans quotable for `evidence_quote`.
See §11 for the enhancement request.

### 9.4 Word-count targets

Official whole-paper total is **2,150–2,750 words**. Allocation:

| Section | Blocks | Words per block | Section total |
| --- | --- | --- | --- |
| 1 | 3–5 | lettered items 60–110 each; continuous short texts 180–280 | **550–750** |
| 2 | 2 | 370–450 each | **750–900** |
| 3 | 1 | — | **850–1,000** |
| **Test** | | | **2,150–2,650** |

Never let a GT test total fall below **2,150**. Section 3 must be the longest single text in the
paper by a clear margin.

Note: `check_passage()` in `generate_reading.py:344` enforces 780–900 words and 6–8 paragraphs on
*generated* passages. Those bounds are Academic-shaped and will reject valid GT Section 1 and
Section 2 documents. That is a **generator** constraint, not a content-validator constraint, so it
does not block hand-authored rows — but it is logged as a defect in §11.

### 9.5 Question numbering

- **1–40 continuous across the three rows.** Section 1 row carries 1–14, Section 2 row 15–27,
  Section 3 row 28–40.
- Within a row, `question_groups[]` appear in ascending number order and the numbers inside a group
  are contiguous.
- A group's questions must all attach to text blocks that appear **before or at** the group's
  position in reading order — never ask about `t2` in the first group when the second group covers
  `t1`.
- `validate_relations()` catches duplicates and missing numbers **within a row only**. The
  cross-row 1–40 check is a merge-gate lint (§9.8).

### 9.6 Question groups and answers

Group shape, matching the Academic rows already in the bank:

```jsonc
{
  "id": "g1",
  "type": "matching_information",
  "instructions_extra": "Look at the five weekend classes, A–E. Which class …?",
  "word_limit": null,                 // set for TEXT_TYPES; null for letter/choice types
  "allow_reuse": true,                // matching_information over a lettered cluster: usually true
  "options": [                        // letter types only
    { "key": "A", "text": "Beginners' pottery" },
    { "key": "B", "text": "Conversational Spanish" }
  ],
  "layout": null,                     // note/table/flow-chart/diagram groups fill this
  "questions": [ … ]
}
```

Question shape (unchanged from the Academic bank — the teaching payload from R-R1 extends this,
it does not replace it):

```jsonc
{
  "number": 3,
  "prompt": "…",
  "answers": [ { "value": "B" } ],
  "anchor_paragraphs": ["B"],
  "evidence_quote": "no experience is necessary",
  "explanation": "…",
  "trap_note": "…",
  "difficulty": "easy",
  "band_target": 5.0
}
```

Per-type rules for GT:

- **`matching_information` over a lettered cluster**: `options[].key` must be exactly the paragraph
  letters of that cluster, and only that cluster's letters. `allow_reuse: true` unless the item set
  genuinely uses each once. Questions are **not** in text order — that is the point of the type.
  `anchor_paragraphs` is the single letter that holds the answer.
- **`true_false_not_given`**: `answers: [{"value":"TRUE"|"FALSE"|"NOT GIVEN"}]`, upper case, one
  space in `NOT GIVEN`. In S2, at least one item per group should turn on a modal or a condition —
  that is the GT-authentic trap, and `trap_note` must name it.
- **Completion family** (`sentence_completion`, `note_completion`, `table_completion`,
  `flow_chart_completion`, `summary_completion`, `short_answer`): set `word_limit` as
  `{"max_words": N, "numbers_allowed": true|false}`. **Do not write the instruction sentence
  yourself** — `instruction_for()` renders it. Answers are lifted **verbatim** from the text; check
  every authored answer against its own limit with `within_word_limit`.
- **`note_completion` / `table_completion` / `flow_chart_completion`** fill `layout`:
  `{kind, title, lines[]}`, `{kind:"table", columns[], rows[][]}`, `{kind:"flow_chart", steps[]}`
  respectively — the shapes in `app/src/features/reading/types.ts:44`. Gaps are written into the
  layout strings; the renderer already handles these.
- **`matching_sentence_endings`**: more endings than questions, endings lettered from the group's
  `options[]`, questions in text order, `allow_reuse: false`.
- **`matching_headings`**: Section 3 only, and only over a paragraph-structured block. More
  headings than paragraphs; headings as roman numerals in `options[]`.
- **`yes_no_not_given`**: Section 3 only, only where an authorial claim exists. Do not force it
  into a policy document — a staff handbook has no opinions.

### 9.7 Accepted-answer variants

Read `sidecar/bandready/scoring/answers.py` before authoring answer lists; do not reimplement any
of it. The matcher normalises case, strips most punctuation, folds number words to digits and
handles leading articles variant-awarely. What it will **not** do for you:

- **Spelling variants are not inferred at match time.** If both "organise" and "organize" are
  acceptable, both must be in `answers[]`. `spelling_variants()` exists to generate them at
  authoring time.
- **Number formats.** GT is number-dense. For a price, author the forms a candidate will
  legitimately write: `"£25"`, `"25"`, `"25 pounds"` where the text supports them. For a time:
  `"9.30"`, `"9:30"`, `"9.30am"`. For a date: `"14 March"`, `"March 14"`. Decimal points and clock
  colons survive punctuation stripping, so both forms are distinct keys and both need authoring.
- **Singular/plural.** If the text says "two references" and the gap could take either, author
  both. If only the plural is correct, author only the plural and say so in `explanation` — the
  plural slip is error #9 in §7 and the review screen should teach it.
- **Parenthesised optional parts** are expanded by `_expand_parens()`, so `"(a) student card"`
  yields both forms. Use this rather than listing near-duplicates.

### 9.8 Ids, staging and merge lints

- Passage ids: `rp_gt_<NN>_s<K>` where `NN` is the two-digit GT test number and `K` ∈ {1,2,3}.
  Standalone GT practice passages not belonging to a test: `rp_gt_x<NN>_s<K>`.
- Test ids: `rt_gt_<NN>`.
- Group ids are row-local: `g1`, `g2`, … Text block ids are row-local: `t1`, `t2`, …
- Content agents write **only** their own staging file under
  `content/core-en/staging-reading/`. The verify agent merges into
  `content/core-en/data/reading_passages.jsonl` and `reading_tests.jsonl`.

Lints the merge gate should run on GT rows, over and above `validate_pack`:

1. `format == "general_training"` ⇒ `passage_json.gt_section ∈ {1,2,3}` and equals `position`.
2. The three rows of a `reading_tests` row with `format == "general_training"` carry
   `gt_section` 1, 2, 3 in `p1_id`/`p2_id`/`p3_id` order.
3. Union of question `number`s across the three rows is **exactly** `{1..40}`.
4. Section 1 row has `len(texts) >= 2`; Section 3 row has `len(texts) == 1`.
5. Every text block on a GT row has a non-empty `heading`.
6. Paragraph ids are unique across the **row** (not merely within a block) and are single
   characters.
7. Every `options[].key` in a letter-type group exists as a paragraph id or as an explicit option
   list of that group's own cluster.
8. Every `anchor_paragraphs` entry exists as a paragraph id on the same row.
9. Every `evidence_quote` occurs as a substring of the text of one of its `anchor_paragraphs`
   (the `locate` feature in `PassagePane` finds the quote by substring — a quote that does not
   match silently does nothing).
10. Every `answers[].value` on a `TEXT_TYPES` question passes `within_word_limit` against its own
    group's `word_limit`.
11. Row `word_count` equals the actual word total of `texts[]`, and the three rows sum to
    2,150–2,750.
12. `topic_id` exists in `content/core-en/data/topics.jsonl`.
13. Across the test, `len(distinct group types) >= 7`.

### 9.9 Topic assignment

`content/core-en/data/topics.jsonl` currently holds 20 ids and GT rows must use them:

`topic_environment`, `topic_education`, `topic_technology`, `topic_health`, `topic_globalisation`,
`topic_urbanisation`, `topic_work`, `topic_media`, `topic_culture`, `topic_transport`,
`topic_crime`, `topic_tourism`, `topic_family`, `topic_science`, `topic_economy`, `topic_food`,
`topic_sport`, `topic_housing`, `topic_communication`, `topic_money`.

Practical mapping:

- **Section 1** → `topic_tourism`, `topic_transport`, `topic_housing`, `topic_food`, `topic_sport`,
  `topic_culture`, `topic_education`, `topic_money`, `topic_health`.
- **Section 2** → `topic_work` almost always; `topic_health` for safety documents, `topic_money`
  for pay and benefits, `topic_education` for training schemes.
- **Section 3** → anything, but favour `topic_environment`, `topic_transport`, `topic_science`,
  `topic_culture`, `topic_food`, `topic_urbanisation` for descriptive/instructive features.

A section's row carries one `topic_id` even when its blocks span two everyday domains; pick the
dominant one.

### 9.10 A worked skeleton — GT test 01

```
rt_gt_01  "General Training Test 1"  format=general_training

rp_gt_01_s1  "Around Marlow"           topic_tourism   ~640 words  band_target 5.0
  texts:  t1 "Five places to eat in Marlow"        A–E   (5 listings, ~80 w each)
          t2 "Marlow Leisure Card"                 F–H   (~230 w)
  groups: g1 matching_information  Q1–7   options A–E, allow_reuse true
          g2 true_false_not_given  Q8–14  over t2

rp_gt_01_s2  "Working at Brackenfield" topic_work      ~830 words  band_target 6.0
  texts:  t1 "Annual leave and time off"           A–D   (~410 w)
          t2 "Reporting an accident at work"       E–H   (~420 w)
  groups: g1 note_completion       Q15–20  layout kind=note, word_limit {max_words:2}
          g2 flow_chart_completion Q21–24  layout kind=flow_chart, over t2
          g3 true_false_not_given  Q25–27  modality/condition traps

rp_gt_01_s3  "The last of the ferrymen" topic_transport ~910 words  band_target 7.0
  texts:  t1 (untitled block, heading = article standfirst)  A–H
  groups: g1 matching_headings          Q28–33  roman numerals, 10 headings for 8 paras
          g2 multiple_choice            Q34–37
          g3 matching_sentence_endings  Q38–40

total 2,380 words · questions 1–40 · 7 distinct types
```

---

## 10. Coverage plan for the GT bank

To reach parity with Academic (which has 6 passages / 2 tests) and give GT learners a real
runway, the minimum viable GT bank is:

- **4 complete GT tests** = 12 passage rows, 160 questions. Enough for two diagnostic sittings and
  two later mocks.
- Section-1 genre spread across those 4 tests: no genre from §3.1 used twice.
- Section-2 genre spread: cover at least contract/handbook, leave-or-pay policy, safety procedure,
  and grievance-or-appraisal across the four tests.
- Section-3 genre spread: four different families from §3.3.
- Every one of the four currently-missing types (`note_completion`, `flow_chart_completion`,
  `matching_sentence_endings`, `diagram_labelling`) appears at least twice.
- Plus **6 standalone GT practice sections** (2 per section number) for the drill pane, so
  per-section practice does not require burning a whole test.

---

## 11. Problems and enhancement requests for other agents

Not my owned paths — reported, not touched.

1. **`generate_reading.check_passage()` is Academic-only.**
   `sidecar/bandready/content/generate_reading.py:69` fixes `MIN_WORDS = 780`, `MAX_WORDS = 900`,
   `MIN_PARAGRAPHS = 6`, `MAX_PARAGRAPHS = 8` and applies them to GT too. A GT Section 1 (~640
   words, 8 short listings) and Section 2 (~830) will fail these checks, so `POST /generate` with
   `format=general_training` is effectively broken for Sections 1 and 2. Needs per-`gt_section`
   bounds: S1 550–750/6–12 paras, S2 750–900/6–10, S3 850–1000/7–9.
2. **The generator emits a single text block for GT.**
   `generate_reading.py:414` hard-codes `"texts": [{"id": "t1", "heading": None, "paragraphs": …}]`
   regardless of format, so generated GT Section 1 can never have the multi-document shape the
   paper requires. Same for `providers/llm.py:522`, which stubs `gt_section: None`.
3. **`GT_TYPE_POOL` is missing GT's characteristic types.**
   `generate_reading.py:104` lists 8 types but omits `flow_chart_completion` and
   `table_completion`, both of which are more common in GT Section 2 than several of the types it
   does list. It correctly omits `matching_headings` and `yes_no_not_given`.
4. **No table rendering inside `texts[]`.** GT Section 1 genuinely uses timetables, price lists and
   opening-hours grids. The workaround in §9.3 (line-shaped paragraph text) is acceptable but a
   `TextBlock.table` variant, or letting `paragraphs[].text` carry a small pipe-table that
   `PassagePane` renders, would materially improve GT authenticity. UI-owner call.
5. **`diagram_labelling` has no asset pipeline.** `QuestionLayout.image` is a string in
   `types.ts:57` but there is no convention for where a diagram image lives in a content pack or
   how it is checksummed by the manifest. Until that exists, GT rows should avoid
   `diagram_labelling` even though the type is otherwise fully supported end to end.
6. **`gt_section` is never used to filter.** `GET /api/v1/reading/passages` takes a `format` query
   param (`routes/reading.py:293`) but no `gt_section`. Once GT content lands, per-section practice
   ("give me five Section 2 sets") needs it.
7. **Paragraph-id uniqueness is unvalidated.** §8.2 shows duplicate paragraph ids across text
   blocks silently corrupt notes, highlights and evidence-locating. `validate_relations()` should
   gain the check; lint 6 in §9.8 is the interim.
8. **`docs/plan/06-reading-module.md:14` under-specifies GT length.** It gives "Section 1–2 texts
   80–250 words each", which at 2–3 texts per section floors the whole paper around 1,020 words —
   well under the official 2,150 minimum. §9.4 supersedes it. The plan doc is not my owned path;
   flagging for whoever owns it.
9. **`ACADEMIC_BAND_TABLE` bottom rows are non-contiguous with the published table.** Ours adds
   3.5 → 8–9, 3.0 → 6–7, 2.5 → 4–5, 2.0 → 0–3, which is a reasonable extrapolation below the
   commonly published floor. Not a defect; noting it so nobody "corrects" it against a source that
   simply stops at band 3.

---

## 12. Verified-in-repo checklist for the authoring agents

| Claim | Where I checked it |
| --- | --- |
| `texts[]` can hold several short texts | `validate.py:180` (no constraint), `PassagePane.tsx:280` (renders each block) |
| Text-block headings render | `PassagePane.tsx:281–283` |
| `gt_section` badge already exists | `PassagePane.tsx:267` |
| Paragraph id is the visible label | `PassagePane.tsx:308–314` |
| Paragraph ids are looked up in a flat map | `PassagePane.tsx:129–135` |
| All groups live in one `question_groups[]` | `validate.py:523` |
| Duplicate numbers / missing answers are caught per row | `validate.py:468–479` |
| 1–40 across a test is **not** validated | `validate.py:453–459` only checks id references |
| A test row has exactly 3 passage slots | `validate.py:197` |
| GT band table is correct | `routes/reading.py:75`, matched against two independent published tables |
| Matcher covers all four missing types | `answers.py:76`, `answers.py:97` |
| Word-limit instruction is generated, not typed | `answers.py:425` |
| Spelling variants must be authored explicitly | `answers.py:512–541` |
| UI already labels all four missing types | `app/src/features/reading/qtypes.ts:79–88` |
| Valid `topic_id`s | `content/core-en/data/topics.jsonl` (20 ids) |

---

## Sources

Official:
- [IELTS General Training format: Reading (ielts.org)](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading)
- [General Training test format in detail (ielts.org)](https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-general-training-test/general-training-test-format-in-detail)
- [IELTS General Training sample test questions (ielts.org)](https://ielts.org/take-a-test/preparation-resources/sample-test-questions/general-training-test)
- [IELTS scoring in detail: band scores explained (ielts.org)](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail)
- [Question types in the General Training Reading test (IDP)](https://ielts.idp.com/prepare/article-question-types-general-training-reading)
- [Official prep materials for IELTS General Training Reading (IDP)](https://ielts.idp.com/about/general-training-reading)
- [General Training Reading practice — Section 1 (British Council)](https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/reading/general-training/section-1)
- [General Training Reading activities PDF (British Council)](https://takeielts.britishcouncil.org/sites/default/files/general_training_reading.pdf)
- [Matching Features task-type sheet (British Council)](https://takeielts.britishcouncil.org/sites/default/files/reading_matching_features_.pdf)
- [Matching Headings task-type sheet (British Council)](https://takeielts.britishcouncil.org/sites/default/files/reading_matching_headings_.pdf)
- [GT Reading task type 4 — matching information (Cambridge English)](https://www.cambridgeenglish.org/Images/ielts-general-training-reading-task-type-4-matching-information-1.pdf)

Band conversion (cross-checked, three independent tables):
- [IELTS Reading raw score to band: Academic vs General Training (ielts9.io)](https://ielts9.io/blog/ielts-reading-raw-score-to-band-conversion)
- [IELTS Reading band scores, score-to-band conversion table (IELTS Beacon)](https://ieltsbeacon.com/ielts-band-scores/reading/)
- [IELTS Reading score chart — complete band conversion guide (Simply IELTS)](https://simplyielts.com/ielts-reading-score-chart-band-conversion-guide-2026/)
- [IELTS Reading band scores (Cathoven)](https://resources.cathoven.com/ielts-reading/band-scores)

Teaching sources for structure, genre and error patterns:
- [IELTS General Training Reading test (IELTS with Fiona / ieltsetc)](https://ieltsetc.com/general-training-reading/)
- [GT Reading Section 2 — the topic of work (ieltsetc)](https://ieltsetc.com/ielts-general-training-reading-section-2/)
- [IELTS General Training Reading: information and tips (IELTS Liz)](https://ieltsliz.com/ielts-general-training-reading-information/)
- [IELTS General Reading — information and sample tests (IELTS Jacky)](https://www.ieltsjacky.com/ielts-general-reading.html)
- [GT reading practice sets index — genre patterns by section (IELTS Mentor)](https://www.ielts-mentor.com/reading-sample/gt-reading)
- [GT Reading Section 1 practice — structure (IELTS Buddy)](https://www.ieltsbuddy.com/ielts-general-reading-practice-test-1.html)
- [GT reading matching-information type (IELTS Buddy)](https://www.ieltsbuddy.com/ielts-general-reading-matching-information.html)
- [All 13 IELTS general reading question types and skills tested (Kanan)](https://www.kanan.co/ielts/general/reading/question-types/)
- [IELTS General Training Reading: format and task types (Study.com)](https://study.com/academy/popular/ielts-general-training-reading-format-task-types.html)
- [Academic vs General Training reading differences (3D Universal)](https://3d-universal.com/en/blogs/ielts-reading-academic-vs-general-training-reading-differences.html)
- [IELTS Academic Reading vs General Training Reading: key differences (IELTS Arena)](https://www.ieltsarena.com/blog/ielts-academic-reading-vs-general)
- [IELTS Reading time management (Lingua Learn)](https://lingua-learn.com/blogs/ielts-reading-time-management/)
- [Avoid these IELTS reading mistakes (Lingua Learn)](https://lingua-learn.ae/blogs/ielts-reading-mistakes-to-avoid/)
- [Common mistakes in IELTS Reading (Neethus Academy)](https://neethusacademy.com/common-mistakes-in-ielts-reading-how-to-avoid/)
- [How to improve your spelling for Reading, Listening and Writing (IDP)](https://ielts.idp.com/prepare/article-ielts-how-to-spell)
- [The IELTS Reading paper (Manhattan Review)](https://www.manhattanreview.com/ielts-reading/)

**Non-affiliation:** BandReady is not affiliated with, endorsed by or connected to the IELTS
partners (British Council, IDP: IELTS Australia, Cambridge University Press & Assessment). "IELTS"
is a registered trademark of those organisations. All BandReady content is original and
IELTS-style.
