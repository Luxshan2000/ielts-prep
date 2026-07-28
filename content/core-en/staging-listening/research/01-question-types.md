# L-R1 — IELTS-style Listening: question types, answer-format rules, order behaviour, distraction taxonomy

Research briefing for the BandReady Listening deepening. Written for the people who will author
scripts, write question groups, build the teaching payload and design the Coach UI. Everything here
is either (a) a format/rules fact taken from official IELTS-partner publications, (b) a measured
fact about our own repo, or (c) an explicitly-marked inference.

**Status:** research input, not a schema. The schema of record is `docs/plan/07-listening-module.md`
§2 plus `ListeningScriptRow` / `ListeningTestRow` in `sidecar/bandready/content/validate.py`. Where
this briefing and the plan disagree, §11 flags it; the plan wins until a human decides otherwise.

**Companion briefings** (not yet written at time of writing): 02 (scripts, speech and TTS), 03
(strategy and bands), 04 (pedagogy and item design). Cross-references to them are marked *(L-R2)*
etc. so the DESIGN agent can resolve them later.

---

## 0. How to use this document, and its ground rules

### 0.1 Copyright — read it twice

The exam **format** is a fact. Question **types**, their **instruction-line patterns**, the
**answer-format rules**, the raw-score→band table and the **situation types that recur** are all
freely usable — they are functional descriptions of a public test, published by the test owners
themselves for candidates and teachers.

What is *not* usable: any script, any transcript, any question, any option set, any answer key, any
map, any worked explanation from a real paper, a Cambridge volume, a coaching site or a YouTube
walkthrough. **Every script, every line of dialogue, every question, every option, every map and
every teaching note in our bank is authored from scratch.**

Six official sample tasks were read in the course of this research and their subject matter is now
on the **do-not-write list**:

| Sample | Situation | Never author |
|---|---|---|
| Form completion (Part 1) | shipping agency quotation, box to Kenya | any shipping-quote form; the surname/postcode/dimensions gap pattern is fine, the situation is not |
| Multiple choice (Part 1) | insurance tier + delivery destination | any insurance-tier MCQ on a shipping call |
| Short answer (Part 2) | talk on social contact in the UK for new arrivals | "how to meet people in a new country" talk |
| Sentence completion (Part 3) | two friends discussing distance-learning study | Open-University-shaped study-mode discussion |
| Matching ×2 (Part 3 / Part 1) | course options with a tutor; five hotels at a tourist office | the five-hotels tourist-office task in any form; the "which optional course will you take" tutorial |
| Plan labelling (Part 2) | librarian giving a tour of a new town library | **any library tour**, and specifically any plan with a librarian's desk by the entrance |
| Note + table completion (Part 2) | radio programme about a National Arts Centre | arts-centre radio feature; the day/time/event/venue/price table on a listings programme |

Those tasks are named here **only as evidence of what the type looks like in operation.** If while
authoring you notice you are reproducing a distinctive line, a distinctive distractor or a
distinctive gap sequence you saw here, throw it away and build a different one from the idea up.

Invent every proper noun and keep the house convention already in the pack (Verdon, Norland,
Ashfield, Sandmouth, Marlow, Brackenfield, Fairhaven) so the bank reads as one world. No real
organisations, no real people, no real published statistics.

Product copy says **"IELTS-style"** and carries the non-affiliation notice. 'IELTS' is a trademark.

### 0.2 Confidence key

Every claim in this briefing carries one of these:

| Tag | Meaning |
|---|---|
| **[OFFICIAL]** | Stated in an official IELTS-partner publication (ielts.org, IDP IELTS, British Council, Cambridge/UCLES). Treat as fact. |
| **[OFFICIAL-DERIVED]** | Not stated in one sentence, but follows directly from official sample tasks and their published answer keys. |
| **[CONSENSUS]** | Every substantial teaching source agrees, but no official statement found. Safe to teach; never present as an exam rule. |
| **[CONTESTED]** | Sources disagree. §11 lists these individually. Never teach one side as fact. |
| **[MEASURED]** | Read directly out of this repo on 2026-07-28, with a file:line reference. |
| **[OURS]** | A BandReady authoring decision proposed by this briefing. Needs a human sign-off before it becomes doctrine. |

### 0.3 What "teaching payload" means when the audio plays once

Reading teaches through worked solutions because the text stays on the page. **Listening's defining
constraint is that the audio plays once and then is gone**, so a worked solution that only says
*where* the answer was is a post-mortem, not a lesson. The learner cannot re-derive it; they can
only be told what they should have been doing at that moment.

That makes the listening payload a **timeline**, not a location. Four things happen around every
answer and all four are teachable:

```
   BEFORE                    APPROACH                THE MOMENT              AFTER
   ─────────────────────────────────────────────────────────────────────────────────────
   prediction                signposting             the answer +            recovery
   (what class of thing      (the marker that        its distraction         (how not to lose
    can fill this gap?)       announces it)           pattern                 the next three)
   ─────────────────────────────────────────────────────────────────────────────────────
   §2.6, §4 per type         §7                      §6 taxonomy             §8.4
```

Plus a fifth thing that has no equivalent in reading at all: **form**. A correctly heard answer
spelled wrongly, pluralised wrongly or written over the word limit scores **zero** [OFFICIAL], and
in our implementation the match is exact (`sidecar/bandready/scoring/answers.py`). Half of what a
band-6 listener loses is form, not comprehension, and it must be counted separately or the learner
will "practise listening" to fix a spelling problem.

So: five payload parts, one per column plus form. Not one "explanation" field.

There is no model answer in this module and there must never be a field pretending to be one.

### 0.4 What BandReady has today [MEASURED]

Read on 2026-07-28 from `content/core-en/data/listening_scripts.jsonl` and
`listening_tests.jsonl`:

| | |
|---|---|
| Tests | **1** (`lt_test_1`) |
| Script rows | **4** — `ls_t1_p1` … `ls_t1_p4` |
| Questions | **40** |
| Accents | `uk` ×3, `us` ×1. **No `au` row exists.** |
| Question types in use | `form_completion` 6, `note_completion` 17, `multiple_choice` 7, `matching` 10 |
| Types never used | `table_completion`, `sentence_completion`, `map_labelling` — all three are supported by the renderer and by the scorer and have **zero** content |
| Teaching payload | `explanation` (a single string) on some questions. Nothing else. No trap label, no prediction, no signpost, no distractor analysis, no per-group strategy |
| Script `lines` per part | 47 / 30 / 48 / 31 |
| `script_json` keys | `schema_version, part, title, scenario, accent_set, target_band, speakers, lines, questions` |
| Question keys | `n, type, instruction, prompt, options, word_limit, answers, cue_line_index, explanation` |

The UI is well ahead of the content: `app/src/features/listening/` already ships `TestRunner`,
`PartPlayer`, `AnswerSheet`, `CheckStep`, `ReviewScreen`, `TranscriptPanel`, `AccentDrill`,
`MapAsset`, `SpellingNotice`, `PrepareAudioPanel`, `QuestionBlock`, `RecentAttempts`. Nothing in
that list is blocked on engineering; it is blocked on content.

---

## 1. The paper, measured

### 1.1 Structure [OFFICIAL]

| | |
|---|---|
| Parts | 4 |
| Questions | 10 per part, **40** total, numbered 1–40 continuously |
| Marks | 1 per question, no penalty for a wrong answer |
| Audio | ~30 minutes; **you hear the recording once only** |
| Transfer | **paper: +10 minutes** at the end to copy answers to the answer sheet. **Computer-delivered: 2 minutes** to check, because answers are already typed |
| Same for Academic and General Training | yes — the Listening and Speaking papers are identical across formats |
| Accents | "British, Australian, New Zealand and North American" are named on ielts.org |

| Part | Register | Speakers | Situation |
|---|---|---|---|
| 1 | everyday / social | 2 | transactional conversation — booking, enquiry, registration, complaint |
| 2 | everyday / social | 1 | monologue — facility tour, event briefing, local-radio feature, guided walk |
| 3 | educational / training | 2–4 | discussion — students with each other or with a tutor about an assignment or project |
| 4 | educational / training | 1 | academic monologue — a lecture segment |

Difficulty ramps 1→4 and also *within* each part [CONSENSUS]. The mechanism is not vocabulary; it
is (a) more speakers, (b) longer stretches between answers, (c) answers carried by paraphrase
rather than by the question's own words, (d) more distraction per answer. *(L-R4 territory.)*

**The BandReady decision already taken:** we model the **computer-delivered** test — typed answers,
2-minute check step, no 10-minute transfer (`docs/plan/07-listening-module.md` §1). This is right
for a desktop app, and it eliminates an entire class of real-exam error (transfer slips: wrong row,
skipped number, unreadable handwriting). **Because we eliminate it, we must teach it explicitly** for
users who will sit the paper test. See §8.5.

### 1.2 The accent fact, and our gap [OFFICIAL] + [MEASURED]

ielts.org names British, Australian, New Zealand and North American accents. Our bank has UK and US
only, and Kokoro v1.0 has **no Australian voices at all**
(`sidecar/bandready/audio/tts_render.py:42–66` — `VOICE_MAP["au"]` falls back to British voices
`bf_alice / bf_lily / bm_daniel / bm_fable`, and `ACCENT_LABELS["au"]` reads *"Australian
(approximated with British voices)"*).

Two consequences for authoring, both [OURS]:

1. **`accent_set: "au"` is honest as a *voice-rotation* device, not as an accent claim.** The four
   `au` voices are a genuinely different British cast from the four `uk` voices, so setting a part
   to `au` does buy voice variety and does exercise the accent-drill re-render path. It does not
   buy an Australian accent, and the UI already says so.
2. **Lexical accent is available even when phonetic accent is not.** A script can be recognisably
   Australian or North American in its *words* — `car park` vs `parking lot`, `autumn` vs `fall`,
   `mobile` vs `cell`, `rubbish` vs `trash`, `chemist` vs `drugstore`, `note` vs `bill`,
   `postcode` vs `zip code`, `ground floor` vs `first floor`. **The `ground floor` / `first floor`
   pair is a genuine map-labelling trap** and is worth building a question on. This is the only
   accent training we can currently deliver, and it is not nothing.

### 1.3 Where the marks actually are [OFFICIAL] + [OURS]

Official indicative Listening conversion, published by IDP:

| Raw /40 | Band | | Raw /40 | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 18–22 | 5.5 |
| 37–38 | 8.5 | | 16–17 | 5.0 |
| 35–36 | 8.0 | | 13–15 | 4.5 |
| 32–34 | 7.5 | | 11–12 | 4.0 |
| 30–31 | 7.0 | | | |
| 26–29 | 6.5 | | | |
| 23–25 | 6.0 | | | |

ielts.org's own scoring page gives only four anchor points — **band 5 = 16, band 6 = 23, band 7 =
30, band 8 = 35** — and states: *"The precise number of marks needed to achieve these band scores
will vary slightly from test version to test version."* All four anchors agree exactly with the IDP
table, so the IDP table is safe to ship with an indicative disclaimer.

Our implemented table (`docs/plan/07-listening-module.md` §7) matches at every band **except the
bottom**: we give band 4.0 at raw 10–12 where IDP gives 11–12, and we add 3.5/3.0/2.5 rows below
that which no partner publishes. That divergence is below any band a learner is aiming for; keep it,
keep the disclaimer, and do not "fix" the rows above 12. §11.4.

**The teachable numbers:**

- **Seven marks separate band 6.0 from band 7.0** (23 → 30). That is under two questions per part.
- **The 5.5 band is 5 marks wide (18–22) and every band above it is 2–4 marks wide.** A learner
  parked at 5.5 sees no movement for five questions and then jumps twice in six. Show **raw score
  primary, band secondary**, exactly as the Reading module decided.
- **The cheapest marks in the paper are in Part 1 and they are lost to spelling, not to
  listening.** Part 1 is a transactional dialogue with numbers, names and addresses, spoken slowly
  and often spelled out. A learner who loses three of them has a form problem with a
  three-week fix, not a listening problem with a six-month fix. This is the single most motivating
  diagnosis the module can produce and it is why `near_miss_spelling` (already implemented,
  `routes/listening.py:673`) must be surfaced as its own number, not folded into "wrong".

---

## 2. Answer-format rules that apply across every type

These are the rules that decide whether a correctly heard answer scores. They are the same for
Academic and General Training. **§2.1–2.5 are the marking rules; §2.6 is the authoring consequence.**

### 2.1 The word limit [OFFICIAL]

The instruction line carries the limit and **exceeding it makes the answer wrong even when it
contains the right words**. Official wording seen in the 2023 sample tasks:

```
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
Write NO MORE THAN TWO WORDS for each answer.
```

Current papers and IDP's own guidance also use the shorter modern forms:

```
Write ONE WORD ONLY for each answer.
Write ONE WORD AND/OR A NUMBER for each answer.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```

Both families are in circulation. §11.1 records the disagreement; the practical rule is that the
limit is whatever the instruction says, and **the instruction is always printed above the group**.

Counting rules [OFFICIAL, IDP]:

| Token | Counts as |
|---|---|
| a hyphenated compound — `check-in`, `time-management`, `part-time` | **one word** |
| a numeral — `1700`, `363`, `£4.50`, `BS8 9PU` | **one word** (and see the AND/OR clause below) |
| a date — `14 March`, `19/02` | one word if written as digits; `14 March` is a number plus a word |
| an article — `the`, `a` | **a word**, and it counts. This is where over-limit answers come from |
| a contraction — `they're` | one word, but contractions are **not tested** [OFFICIAL, IDP] |

**"AND/OR A NUMBER" means one number *in addition to* the word allowance.** So
`ONE WORD AND/OR A NUMBER` accepts `modules`, accepts `363`, and accepts `363 days`. It does not
accept `the modules`.

> **[MEASURED — DELIVERY BLOCKER B1]** Our listening scorer does not implement that clause.
> `sidecar/bandready/server/routes/listening.py:656` is
> `over_limit = bool(limit) and count_words(answer) > int(limit)`, where `limit` is the DB column
> `listening_questions.word_limit`, which `sidecar/bandready/content/loader.py:350–352` fills from
> `word_limit["words"]` **only** — the `numbers` half of the authored `{"words": 1, "numbers": 1}`
> object is dropped at import. So an authored `ONE WORD AND/OR A NUMBER` question marks `363 days`
> over-limit and wrong.
> Worse, `app/src/features/listening/qtypes.ts:79–83` renders the label
> *"ONE WORD AND/OR A NUMBER"* from that same folded integer — **the UI promises an allowance the
> scorer refuses.**
> The correct implementation already exists three files away: `answers.py:395` `within_word_limit()`
> handles the clause properly, including "twenty two is one number, not two" (`answers.py:416`).
> The fix is to carry `{max_words, numbers_allowed}` through the loader and call
> `within_word_limit()` instead of `count_words()`.
> **Content agents do not make this change.** Author to the real IELTS rule and report the
> dependency. Until it lands, an author who wants `363 days` to score must key `word_limit:
> {"words": 2, "numbers": 1}`, which mislabels the group in the UI — so prefer gaps whose answer is
> a bare number or a bare word until B1 is fixed.

### 2.2 Must the answer be the exact word heard? [OFFICIAL] with an important qualification

Coaching sources say, universally and emphatically: *use the exact words you hear; do not
paraphrase; do not change the form; `laboratories` is not `laboratory`.* IDP's own page says
"use the exact words you hear". That is the right thing to **teach**.

But it is **not** what the official answer keys do. From the 2023 sample tasks, verbatim:

```
4   0.75 m/metre(s)/meter(s) (wide) / three(-)quarter(s) (of) (a) metre/meter (wide)
    / ¾ m (wide) / 75 cm(s) (wide)
5   0.5 m/metre(s)/meter(s) (high/deep) / (a) half (a) metre/meter (high/deep)
    / ½ m (high/deep) / 50 cm(s) (high/deep)
6 & 7  in either order — (some) books / (some) toys
11  classical music (concerts) / (classical) (music) concerts
14  1983 / (the) 1980s
15  (the) City Council
27  motivation      28  time(-)management      29  modules      30  summer school(s)
```

Read what that key actually permits: a **unit conversion that was never spoken** (`75 cm` for
`0.75 m`), a **decade for a year** (`the 1980s` for `1983`), an **optional hyphen**
(`time-management` or `time management`), an **optional plural** (`summer school` or `summer
schools`), **optional determiners** (`the City Council` or `City Council`), and **word-order
variants** (`classical music concerts` or `concerts`).

The reconciliation, and it matters for how we key answers:

> **The candidate should be taught to write exactly what they hear, because that is the only
> strategy that is always safe. The marking key is more generous than that, because the marker
> accepts anything that proves the candidate heard the fact.** Teaching the generosity would train
> paraphrasing, which fails far more often than it rescues. Keying only the verbatim form would
> mark real candidates wrong on answers a real examiner accepts.

**[OURS] Authoring rule:** key like the official key, teach like the coach. Every question's
`answers[]` carries the verbatim form **first** (it is what `explanation` and the SRS candidate use
— `routes/listening.py:963` takes `slots[0][0]` as the term), then every equivalent a real marker
would accept.

> **[MEASURED — this is already easy.]** `answers.py:475 _expand_parens()` and
> `answers.py:493 expand_variants()` expand parenthesised optionals **and** slash alternatives at
> match time. So an author can literally write the official key's own notation:
> `"(the) City Council"` → matches both. `"0.75 m/metre/metres"` → matches all three.
> `"summer school(s)"` → matches both. `"time(-)management"` → **does not work**, because the
> paren-expansion produces `time-management` and `timemanagement`; author it as
> `["time-management", "time management"]` instead. Hyphens normalise to `-` but are not deleted
> (`answers.py:124` `_DASHES`).

### 2.3 Grammar of the gap [CONSENSUS, high confidence]

The gapped line fixes the answer's word class and number before the audio plays, and reading it is
the whole of prediction (§2.6). `many ______` forces a plural. `a ______ of` forces a singular
noun. `must be ______ before` forces a past participle. `without ______` forces an `-ing` form.

**The item-writing consequence is a hard rule:** if both the singular and the plural read
grammatically in the gap, the item is ambiguous and must be **rewritten, not annotated**. A learner
who hears the fact correctly and writes the wrong number has been failed by the item, not by their
ear. This is the most common way an authored completion item goes bad.

### 2.4 Numbers, dates, times, money [OFFICIAL, IDP]

- **Write digits, not words.** Faster, and it removes a spelling risk. `363`, not `three hundred
  and sixty-three`.
- **Currency:** `$4.50` and `four dollars fifty` are both acceptable; usually the symbol is already
  printed in the task (`£ ______`) so only the digits are wanted. Note that our normaliser converts
  `£4.50` to `4.50 pounds` internally (`answers.py:143–144`), so `£4.50` and `4.50 pounds` match
  each other without the author keying both — but `4.50` alone does **not**, so key it if the task
  prints the symbol.
- **Measurements:** `60 kilometres`, `60 km`, `60 kms` are all acceptable. Key all three.
- **Dates:** `March 5th`, `5 March`, `03/05`, `5th of March` are all acceptable. Beware the
  US/UK day-month order when keying numeric forms; key both.
- **Times:** `6:45` and `quarter to seven` are both acceptable. Our normaliser preserves the colon
  and the decimal point through punctuation-stripping (`answers.py:140` `_INNER_NUMERIC`), so
  `9.30`, `9:30` and `9.30am` are **three distinct keys** and each must be authored.
- **Spoken conventions the script must use and the learner must recognise:** `0` read as **"oh"**;
  repeated digits read as **"double four"** / **"triple seven"**; a four-digit year read as
  **"nineteen eighty-three"** not "one thousand nine hundred…"; a decimal read as **"nought point
  seven five"** or **"zero point seven five"**. Our scorer already auto-equates digit and
  spelled-out integers 0–100 and four-digit years (`answers.py:204–312`), so the learner is covered
  either way — but the **script** must use the spoken form, because that is what is being tested.
- **Large numbers:** `1700` and `1,700` both score; our normaliser strips thousands separators
  (`answers.py:137` `_THOUSANDS`).
- **Postcodes and reference codes:** letters are capitalised in the key (`BS8 9PU`), spacing does
  not matter, and they are **always spelled out in the recording** when they are the answer.

### 2.5 Capitalisation, spelling and letters [OFFICIAL]

- **Case is not marked.** Lower case, Title Case and ALL CAPS all score. `NORWAY`, `Norway` and
  `norway` are all correct. Our matcher lower-cases everything (`answers.py:150 _fold`), so this is
  already true in the app; say it in the UI so the learner stops worrying about it.
- **Spelling must be correct. A misspelled answer scores zero.** No fuzzy matching, no partial
  credit. This is the hardest single difference between Listening and Speaking for a learner to
  internalise.
- **Both British and American spellings are accepted.** `centre`/`center`, `organise`/`organize`.
  `answers.py:515–533` holds a ~50-pair `US_UK_PAIRS` table but the comment at `:512` is explicit:
  it is an **authoring** helper, **deliberately not consulted at match time**. So both spellings
  must be **authored into `answers[]`** or the learner loses the mark. This is a lint the merge
  gate must run.
- **Letter answers are letters.** On a matching or MCQ question, writing the option's *words*
  instead of its letter scores zero. `app/src/features/listening/qtypes.ts:55` stores multi-letter
  answers as `"B, D"` and the sidecar splits on the comma.
- **Roman numerals and letters are case-insensitive** in our matcher
  (`answers.py:564 normalize_letters`).

### 2.6 Prediction — the pre-listening move, and why it belongs in the payload [OURS]

Every part gives the candidate 20–45 seconds to read the questions before the audio starts
[OFFICIAL — the narrator says *"Now you have some time to look at Questions 11 to 15"*]. What a
strong candidate does in those seconds is not "read the questions". It is:

1. **Type the gap.** Is it a number, a name, a date, a place, a plural noun, an adjective, a verb?
   The gap's grammar (§2.3) plus the label to its left decide this before a word is spoken.
2. **Guess the register.** A "Cost:" row wants a currency figure. A "Contact:" row wants a name or a
   phone number. A "Reason for:" row wants a noun phrase, and probably an abstract one.
3. **Underline the one word in the stem that will be paraphrased.** In listening the *question* is
   the paraphrase and the *audio* is the original — the opposite of a summary task. The learner
   must decide, in advance, what the speaker might say instead.
4. **Notice the word limit and the number of gaps per line.**

**This is the highest-value teachable field in the module and it costs the author one line per
question.** Proposed shape (for the DESIGN agent to accept or reject):

```jsonc
"prediction": {
  "expects": "number" | "name" | "place" | "date" | "time" | "money" | "noun_singular"
           | "noun_plural" | "adjective" | "verb_ing" | "verb_past" | "noun_phrase" | "letter",
  "cue": "<the word in the gapped line that fixes it, verbatim>",
  "note": "<=18 words — what a strong candidate writes in the margin before the audio starts>"
}
```

`expects` is a closed enum so the app can build a "predict the gap" drill from existing content at
zero marginal authoring cost: hide the audio, show the task, ask the learner to classify every gap,
score it against `expects`. That drill is *listening practice with no audio*, which means it is
cheap, replayable and immune to the once-only constraint.

---

## 3. THE ORDER TABLE — the single most useful strategic fact, per type

### 3.1 The rule [OFFICIAL]

> *"The questions are in the same order as the information in the recording, so the answer to the
> first question will be before the answer to the second question, and so on."* — ielts.org,
> Listening test format.

**This is the largest single difference between Listening and Reading**, and it is worth saying to
the learner in exactly those terms. In Reading, `matching_headings` and `matching_information`
scatter across the passage and the whole strategy is built around that. **In Listening nothing
scatters.** The learner is on a conveyor belt: the answers arrive in numbered order and never
double back.

Everything that follows is a refinement of that one rule, not an exception to it.

### 3.2 Per type

| Type | Answers in audio order? | Confidence | What the learner does with it |
|---|---|---|---|
| form completion | **Yes** | [OFFICIAL] | Track the form top-to-bottom; the speaker walks the form with you |
| note completion | **Yes** | [OFFICIAL] | Same; the notes' headings are the talk's sections |
| table completion | **Yes, row-major** | [OFFICIAL-DERIVED] | Read **across each row, then down** — see §4.3, this is the one layout where "in order" needs explaining |
| flow-chart completion | **Yes, along the arrows** | [OFFICIAL-DERIVED] | The chart's direction *is* the audio's chronology |
| sentence completion | **Yes** | [OFFICIAL] | One sentence per stretch of audio, in order |
| summary completion | **Yes** | [OFFICIAL] | The summary is a linear précis of a linear stretch |
| multiple choice (single) | **Yes** | [OFFICIAL] | Q17's answer is after Q16's. If you are lost, jump forward, never back |
| multiple choice (choose TWO/THREE) | **The pair as a block is in order; the two letters within it are in either order** | [OFFICIAL] | Both letters are somewhere in one stretch. Write them in any order |
| matching — categorising (A/B/C reusable) | **Yes** | [OFFICIAL-DERIVED] | The numbered items are discussed in list order |
| matching — from a box (A–E, each used once) | **Yes for the questions; the box is not in order** | [OFFICIAL-DERIVED] | The **options** are alphabetical or arbitrary; the **questions** track the audio |
| plan/map/diagram labelling (letters) | **Yes** | **[OFFICIAL]** — see below | Follow the speaker's route; the letters are spatial, not sequential |
| plan/map/diagram labelling (words) | **Yes** | [OFFICIAL-DERIVED] | Same |
| short answer | **Yes**, except that a "list TWO/THREE" bullet group is **in either order** | [OFFICIAL] | Two bullets = two marks, either way round |

**The map-labelling order fact is genuinely official and almost never taught.** Cambridge/UCLES's
own teacher's notes for Task Type 3 say, of the letters A–I: *"some of these will be used on the
recording to label rooms 11 – 15 and that they will follow the order of the recording."* That single
sentence converts map labelling from the scariest type in the paper into a tracking task: you are
never hunting the map, you are walking it with the speaker.

### 3.3 The "in either order" cases, precisely [OFFICIAL]

Three places in the paper where order genuinely does not apply, all visible in the official answer
keys as the literal phrase **`in either order`**:

1. **`Choose TWO letters, A–E.`** The task occupies two question numbers (e.g. 11 & 12), carries two
   marks, and the letters may be written in either box.
2. **A short-answer question that asks for a list** — *"What TWO factors can make social contact in
   a foreign country difficult?"* with bullets numbered 11 and 12. The official key reads
   `11 & 12 in either order — language / customs`.
3. **A note or form gap that asks for a list** — the same sample's `6 & 7 in either order —
   (some) books / (some) toys`, where the form row simply says `Contents: clothes / 6 …… / 7 ……`.

**[MEASURED — DELIVERY BLOCKER B2]** Our data model cannot express this. Each question `n` is scored
independently against its own `answers[]` (`routes/listening.py:864–866`), so an author must either
(a) key **both** acceptable values into **both** questions — which then marks a learner who writes
`books` in both boxes as 2/2 — or (b) key them positionally, which marks a correct learner who
wrote them the other way round as 0/2. Neither is right.
**The minimal fix** is a group-level `either_order: [6, 7]` on the script document plus a set-match
pass in `_submit`. Until it lands, **[OURS] author no either-order groups**, and prefer stems that
force a single ordering (*"the first thing mentioned"* / *"the second thing"* is bad item writing —
instead ask two *different* questions). Report the dependency.

### 3.4 The one thing that is genuinely out of order, and it is not the answers

**The distractors are out of order.** This is the whole art of the type. In the official five-hotels
matching task the audio introduces Carlton House and the Imperial *first*, then the Royal Oak, then
the Bridge and the Majestic — but the answers run Royal Oak (Q1), Carlton House (Q2), Imperial (Q3),
Bridge (Q4). Every hotel is named before its answer arrives, and two of them are named twice.

So the honest one-line rule for the learner is:

> **The answers arrive in order. The words don't.** Hearing an option's name is not hearing its
> answer. Wait for the *property* the question asks about, not the *noun* the question names.

Cambridge's own teacher's note for that task tells students to *"listen for the answers by keeping
more than one question in mind at a time"* — which is exactly this.

---

## 4. Per-type dossiers

Each dossier is: **what it is → instruction line → answer format → order → where it appears →
how marks are lost → authoring notes.**

Types are named with the slugs the codebase already uses
(`app/src/features/listening/types.ts:26–33`, `answers.py:76–109`). Where a real IELTS type has no
slug, the proposed slug is marked [OURS].

### 4.0 Type inventory and slug map

**The single most useful fact about our renderer** [MEASURED]: `QuestionBlock.tsx` **does not branch
on the type slug at all.** It branches on the *shape of the data*:

```
QuestionBlock.tsx:44   isLetterQuestion = optionEntries(question.options).length > 0
                       → LetterAnswer (radio/checkbox + typed letter)  else  TextAnswer
QuestionBlock.tsx:69   question.asset present            → render <MapAsset> above the question
QuestionBlock.tsx:137  isMarkdownTable(prompt)           → render a real <table> grid
QuestionBlock.tsx:139  GAP_RE.test(prompt)               → render the prompt with the gap inline
                       otherwise                          → render the prompt as a paragraph
```

`typeLabel()` is used only for a badge on the answer sheet and the review screen
(`AnswerSheet.tsx:45`, `ReviewScreen.tsx:456`), and `groupQuestions()` groups consecutive questions
by `(instruction, type)` pair. **`LAYOUT_TYPES` (`qtypes.ts:16`) is exported and never imported by
anything** — it is a dead constant; do not reason from it.

Two consequences, and both are load-bearing for authoring:

1. **A new type slug costs almost nothing.** Any slug renders correctly as long as the data has the
   right shape. Unknown slugs get a badge from `typeLabel()`'s `type.replace(/_/g, " ")` fallback.
2. **`options` is the switch.** A completion question that accidentally carries a non-empty
   `options` object renders as a letter picker and becomes unanswerable. Lint it.

| IELTS type | Our slug | Renders correctly today? | Content today |
|---|---|---|---|
| Form completion | `form_completion` | yes — gap-in-prompt layout | 6 questions |
| Note completion | `note_completion` | yes — gap-in-prompt layout | 17 questions |
| Table completion | `table_completion` | yes — markdown pipe table → real grid (`qtypes.ts:105`) | **0** |
| Flow-chart completion | **`flow_chart_completion`** [OURS] | **as text only** — the arrow-chain layout of §4.4 renders as a gapped paragraph. No chart component exists | 0 |
| Sentence completion | `sentence_completion` | yes | **0** |
| Summary completion | **`summary_completion`** [OURS] | yes as a gapped paragraph; the **banked** variant ships as `matching` with a lettered bank (§4.6) | 0 |
| Multiple choice, single | `multiple_choice` | yes, via `options` | 7 questions |
| Multiple choice, multi | `multiple_choice` + `select_n` | yes — `letterCount()` (`qtypes.ts:50`) reads `select_n` then `slots` | **0** |
| Matching | `matching` | yes, via `options` | 10 questions |
| Plan/map/diagram labelling | `map_labelling` | yes — `asset` triggers `MapAsset`; `options` chooses letters vs typed words, so **both §5.2 formats work today** | **0** |
| Short answer | **`short_answer`** [OURS] | **yes** — no `options`, so it falls through to `TextAnswer`. The slug is already in `answers.py:107 TEXT_TYPES`; it is absent from `ListeningQuestionType` and `TYPE_LABELS`, which costs only a prettier badge | 0 |

**[OURS] Only one thing here genuinely needs engineering:** a flow-chart component, and §4.4 gives a
substitute that needs none. Everything else in this table is authorable today. The real blockers are
in §11 and none of them is a missing renderer.

---

### 4.1 Form completion

**What it is.** A pre-printed form — a booking, a registration, an enquiry record, a membership
application — with fields down the left and gaps on the right. One speaker is filling it in while
talking to the other, which is why the type only really works as a **dialogue**.

**Instruction line** [OFFICIAL]:
```
Complete the form below.
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
```
(or `ONE WORD AND/OR A NUMBER`, or `NO MORE THAN TWO WORDS AND/OR A NUMBER`).

**The Example convention** [OFFICIAL-DERIVED]. Part 1 forms carry an **`Example`** row with its
answer already filled in — in the sample, `Example: Country of destination — Kenya`. It sits above
question 1, it is not numbered, and the corresponding fact is spoken in the audio before the first
real answer. Its job is to calibrate: it shows the learner what "the right kind of thing" looks like
in this form. **[OURS] Every Part 1 completion group we author carries an Example row**, expressed
in the `prompt` layout, never as a question.

**Answer format.** Verbatim from the audio, within the limit. Overwhelmingly: surnames, street
names, town names, postcodes, phone numbers, dates, times, prices, quantities, dimensions, one-word
categories (`clothes`, `books`).

**Order.** Sequential, and unusually tight: the agent asks for the fields in the order they appear
on the form, so the learner's eye tracks down the page with the audio.

**Where.** **Part 1, almost always.** Occasionally Part 2 (a booking form for an event). Never Part
4. Typically 6–8 of Part 1's 10 questions, with the remaining 2–4 as MCQ or a short matching set —
exactly the shape of the official sample (Q1–8 form, Q9–10 MCQ) and of our own `ls_t1_p1`.

**How marks are lost — in descending order of frequency:**

1. **Spelling of a name that was spelled out.** The audio says `M-K-E-R-E` and the learner writes
   `Mkeere`. Pure form loss; zero marks; entirely fixable.
2. **Mishearing a letter pair.** English letter names cluster: `B/P/V/D/E/G/T`, `M/N`, `S/F`, `I/Y`,
   `A/8`, `J/G`. This is why the spelling in a real script is often disambiguated —
   *"Is that 'M' for mother?"* in the official sample.
3. **The postcode / reference code.** Mixed letters and digits, spoken fast, and the learner is
   still writing the previous answer.
4. **A number said twice.** *"one thousand five hundred… plus another two hundred… so I'd put down
   one thousand seven hundred."* The key is `1,700`. Three numbers were spoken; only the last one
   is the total. See §6, `number_arithmetic`.
5. **Over-limit.** Writing `0.75 m wide` when the row already says `Width:`.

**Authoring notes** [OURS]:

- **Spell out every proper noun that is an answer**, letter by letter with hyphens
  (`B-R-A-M-L-E-Y`), the first time it answers a question. Kokoro pronounces hyphenated capitals as
  letter names reliably (`docs/plan/07-listening-module.md` §2). Add a natural confirmation turn
  after it — *"So that's Bramley with an E?"* / *"That's right."* — because that is what real
  speakers do and it gives the learner a second pass without breaking the once-only rule.
- **Put a distraction on at least half the gaps** and vary the pattern (§6). A form with eight clean
  gaps is a dictation exercise, not an IELTS item.
- **Never gap two adjacent lines with no speech between them.** The learner needs 2–4 seconds of
  writing time between answers or the item tests handwriting speed. In our TTS pipeline that is
  `pause_after_ms` on the answer-bearing line plus one non-answer turn.
- Field labels must be **short and left-aligned**: `Surname:`, `Postcode:`, `Cost per session:`.
  They are the prediction cue (§2.6) and a long label buries it.

---

### 4.2 Note completion

**What it is.** A skeleton of headed notes — the shape a competent student's own notes would take —
with gaps. Bullets, sub-bullets, section headings, dashes.

**Instruction line** [OFFICIAL]:
```
Complete the notes below.
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
```

**Answer format.** Verbatim. Content words: nouns, noun phrases, occasionally adjectives or
`-ing` forms. Rarely a bare number (that is table/form territory).

**Order.** Sequential, and the note headings are the talk's own section boundaries — which makes the
skeleton a **map of the talk**, and reading it in the preview is the single best use of those 30
seconds. Teach the note skeleton as a prediction artefact, not just as a place to write.

**Where.** Parts 2, 3 and 4. **Part 4 is now overwhelmingly note completion** [CONTESTED as to the
exact proportion — §11.2 — but every source agrees on the direction]. Our own `ls_t1_p4` is 10/10
note completion, which is representative.

**How marks are lost:**

1. **Losing your place in a long monologue.** Part 4 has no turn-taking to re-anchor on. One missed
   gap becomes three because the learner keeps listening for gap 32's answer while gap 33's goes
   past. **This is the recovery failure and it is the biggest single loss in Part 4.**
2. **Writing the paraphrase instead of the word.** The lecturer says *"which is what we call
   thermal lag"* and the learner writes `heat delay`. Zero.
3. **Grammatical form.** The note reads `caused by ______ of the soil` and the learner writes
   `compact` where the audio said `compaction`.
4. **Over-limit** on abstract noun phrases, which are long.

**Authoring notes** [OURS]:

- **The heading structure must be genuinely informative.** `Background`, `Method`, `Two problems`,
  `What happens next` are headings a learner can navigate by. `Point 1 / Point 2 / Point 3` is not.
- **Signpost every section boundary in the script** (§7) — *"Right, so that's the background. Now,
  how do we actually measure it?"* — because the note heading and the signpost are the pair that
  lets a lost learner re-enter. **This is the mechanism by which recovery is taught**, and it must be
  authored deliberately, not left to chance.
- Aim for **one gap per 25–45 spoken words** in Part 4, rising through the part. Denser than that and
  it is a transcription test.
- **Never gap a word the learner cannot spell from the audio alone** unless the spelling is the
  point. Technical terms that are answers must be either (a) common, or (b) spelled out, or (c) not
  answers.

---

### 4.3 Table completion

**What it is.** A grid: usually one row per item and one column per attribute. Days × events;
courses × cost × duration; materials × property × use.

**Instruction line** [OFFICIAL]:
```
Complete the table below.
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
```

**Answer format.** Verbatim, and disproportionately **numbers, times, prices and proper nouns**,
because that is what tabulates.

**Order — and this is the fact the type turns on.** Answers run **across each row, then down to the
next row** [OFFICIAL-DERIVED from the sample: gaps 17 (venue, Mon/Tue row), 18 (title, Wed row), 19
(price, Wed row), 20 (title, Sat/Sun row) — the audio delivers exactly that sequence]. A learner who
reads the table **column-wise** — all the venues, then all the prices — is guaranteed to be in the
wrong cell for eight of the ten questions. **Teach row-major explicitly.** It is a 10-second
intervention worth several marks and nobody teaches it because it looks too obvious to say.

**Where.** Parts 1, 2 and 4. Often as a **second group inside a part** whose first group is note
completion — the official Part 2 sample is exactly that (notes Q11–16, table Q17–20), and it is a
good shape because it changes the visual mode halfway through a monologue and re-engages attention.

**How marks are lost:**

1. **Wrong cell.** Column-wise reading, or losing a row on a 5-row table.
2. **The already-filled cells are ignored.** A table's filled cells are the strongest prediction cue
   in the paper: if the `Ticket price` column already contains `from £8.00` and `free`, the gap in
   that column is a price. Learners read the gaps and skip the givens.
3. **Units.** `£4.50` vs `4.50` when the column header already says `Ticket price`.

**Authoring notes** [OURS] + [MEASURED]:

- **The renderer parses a markdown pipe table out of `prompt`.** `qtypes.ts:93 isMarkdownTable()`
  fires when ≥2 lines contain `|`; `qtypes.ts:105 parseMarkdownTable()` strips a `|---|---|`
  separator row and treats the first remaining row as the header. So author the layout as:
  ```
  | Day | Time | Event | Venue | Ticket price |
  |---|---|---|---|---|
  | Monday and Tuesday | 7.30 p.m. | 'The Fen Suite' (opera) | **17** ______ | from £8.00 |
  ```
  Gap markers are `______` (`qtypes.ts:86 GAP_RE` matches `_{2,}`, `\.{4,}` or `…+`).
- **Fill at least 60% of the cells.** A table that is mostly gaps is a note list wearing a grid.
- **Three to five columns, three to five rows.** Wider than five columns and the split pane
  scrolls horizontally, which destroys the row-major reading the type depends on.
- **Do not put two gaps in the same row unless the audio delivers them adjacently**, and if it does,
  give the learner a filled cell between them to land on.

---

### 4.4 Flow-chart completion

**What it is.** Boxes joined by arrows, describing a **process or a procedure** in the order it
happens: how to apply for something; how a material is manufactured; the stages of a study.

**Instruction line** [OFFICIAL pattern, reconstructed]:
```
Complete the flow-chart below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```
or, for the banked variant:
```
Complete the flow-chart below.
Choose FOUR answers from the box and write the correct letter, A-G, next to questions 32-35.
```

**Answer format.** Two variants, and the instruction line is the discriminator [CONSENSUS]:
free text from the recording, or **letters from a box**. In the banked variant the learner writes
**only the letter**; writing the word scores zero.

**Order.** Sequential, along the arrows. This type has the strongest order guarantee in the paper,
because the chart's topology *is* the chronology — which is precisely why it is the easiest type to
recover from: if you are lost, the next box tells you what to listen for.

**Where.** Parts 2 and 4, and rare in both [CONSENSUS]. It is the least frequent completion variant.

**How marks are lost:**

1. **Writing the word instead of the letter** in the banked variant.
2. **Missing a stage.** The audio compresses two boxes into one sentence.
3. **Choosing a bank word that fits the meaning but not the grammar of the box.**

**Authoring notes** [OURS] + **[B3, and it is smaller than it looks]**:

- **There is no flow-chart component**, and `ListeningQuestionType` (`types.ts:26–33`) has no
  `flow_chart_completion`. But `QuestionBlock` renders any prompt containing a gap marker as a
  gapped layout regardless of slug (§4.0), so an arrow chain renders correctly **today**.
- **[OURS] Ship it as `note_completion` with an arrow-chain layout in `prompt`.** This reads
  correctly, scans correctly and needs zero engineering:
  ```
  Collect application pack from the **1** ______ office
        ↓
  Complete Form B and attach two references
        ↓
  Submit by **2** ______ at the latest
  ```
  It is not a flow chart. It teaches the same skill (process order + stage vocabulary) and it does
  not block 400 questions on one component. Revisit if a renderer lands.
- **Author linear chains only.** Branching charts cannot be expressed in either shape.

---

### 4.5 Sentence completion

**What it is.** Free-standing sentences, each with one gap, each summarising one fact from the
recording. No shared layout, no headings — the sentences *are* the structure.

**Instruction line** [OFFICIAL]:
```
Complete the sentences below.
Write NO MORE THAN TWO WORDS for each answer.
```
Note the sample uses `NO MORE THAN TWO WORDS` with **no** `AND/OR A NUMBER` — sentence completion
is the type most often keyed to words alone, because the facts it targets are qualities and
processes rather than quantities.

**Answer format.** Verbatim, and **more abstract than form or table answers**: `motivation`,
`time-management`, `modules`, `summer schools`. The gaps are usually at or near the end of the
sentence.

**Order.** Sequential, one sentence per stretch.

**Where.** Parts 2, 3 and 4. In **Part 3 it is the type that carries the discussion's conclusions**
and it pairs naturally with MCQ.

**How marks are lost:**

1. **Paraphrasing.** The stem is already a paraphrase of the audio, which primes the learner to keep
   paraphrasing into the gap. `Studying with the Open University demanded a great deal of ______`
   where the speaker said *"I found I needed to maintain a high level of motivation"* — the learner
   writes `effort`, which is true, is what the sentence means, and scores zero.
2. **Word class.** The stem says `improved Rachel's ______ skills`, forcing a modifier; the audio
   says *"I got very good at time-management"*. `manage time` reads as sense and scores zero.
3. **Over-limit** on a two-word cap, which is tight.

**Authoring notes** [OURS]:

- **The stem must be a genuine paraphrase, never the audio's own sentence with a hole in it.** If
  the learner can complete the item by waiting for the stem's words, the item tests nothing. This is
  the single biggest quality difference between an authored listening item and a generated one.
- **The gap should sit in the last third of the sentence.** A gap in the first three words gives the
  learner nothing to predict from.
- **The answer must be a content word or a tight two-word chunk**, never a clause.
- Cap the group at **4–6 sentences**. Longer and the learner loses the layout advantage of the type.

---

### 4.6 Summary completion

**What it is.** A single continuous paragraph that précises a stretch of the recording, with gaps.
Two variants: free text from the recording, or **words chosen from a box**.

**Instruction line** [OFFICIAL pattern]:
```
Complete the summary below.
Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.
```
banked:
```
Complete the summary below.
Choose FIVE answers from the box and write the correct letter, A-H, next to questions 31-35.
```

**Answer format.** Free variant: verbatim. **Banked variant: the bank words are the item-writer's
synonyms, not the speaker's words** [OFFICIAL-DERIVED, and the same rule the Reading module
documents]. That is exactly why the banked variant is harder than it looks: the learner is listening
for a meaning and matching it to a word they will *not* hear.

**Order.** Sequential.

**Where.** Part 4 mainly; occasionally Part 3. Uncommon in Listening — much more a Reading type
[CONSENSUS].

**How marks are lost:**

1. **In the banked variant, matching on sound instead of meaning.** The bank contains a word the
   speaker actually said, attached to a different gap.
2. **Grammar.** A bank word that fits the meaning but is the wrong word class for the slot.
3. **In the free variant, the same paraphrase failure as §4.5.**

**Authoring notes** [OURS]:

- **Ships as `note_completion` today.** A gapped paragraph is what `note_completion` already renders;
  no engineering needed. The instruction line is what tells the learner it is a summary.
- **The banked variant needs `options` on every question in the group and a shared bank.** Our
  `matching` type already carries `options` (`types.ts:49`) and `LETTER_TYPES` handles letter
  matching, so the banked variant is expressible **as `matching`** with a lettered word bank.
  [OURS] Do that rather than waiting for a `summary_completion_bank` slug.
- **At least two bank words must be unused, and every unused word must be designed to tempt a named
  gap.** A bank word that tempts nobody is padding.

---

### 4.7 Multiple choice, single answer

**What it is.** A question or a sentence-stem with **three** options, A, B and C. (Listening uses
three; the five- and seven-option forms belong to the multi-answer variant.)

**Instruction line** [OFFICIAL]:
```
Choose the correct letter, A, B or C.
```

**Answer format.** One letter. **Writing the option's words scores zero.**

**Order.** Sequential.

**Where.** All four parts, but it is the **signature type of Part 3** [CONSENSUS], where the
question is often *which view did this speaker hold* or *what did they decide to do*. In Part 1 it
appears as a small tail group (Q9–10) after a form. In Part 2 it alternates with map labelling.

**How marks are lost — and this is the type with the most specific failure mode:**

1. **All three options are mentioned in the audio.** This is not an accident; it is how the type is
   built. In the official Part 1 sample, the agent names *Premium*, *Standard* **and** *Economy* in
   one breath, and then the customer chooses by describing it — *"I'll go for the highest"* —
   without naming it. A learner listening for the option words hears all three and picks the last
   one they heard.
2. **The keyed option is never spoken in the option's words.** The key is `C — Premium`, but the word
   `Premium` in the audio is attached to the *definition*, not to the choice. **The choice is made in
   a paraphrase.** This is the defining MCQ trap in Listening.
3. **The stem's constraint is skipped.** "What does the tutor **suggest** he do?" vs "what does he
   **decide** to do?" — different speakers, different verbs, one mark.
4. **Reading the options during the audio** and missing the answer to the next question.

**Authoring notes** [OURS]:

- **Every option must be mentioned or clearly evoked in the audio.** An option that is never raised
  is dead weight and reduces the item to a two-way choice.
- **The key must be expressed as a paraphrase, and at least one distractor should be expressed
  verbatim.** That inverts the lexical-matching strategy, which is what the type is for. (John Field's
  cognitive-validity work on IELTS Listening found that candidates under test conditions process
  superficially and "focus on lexical matches instead of the overall meaning" — this item design is
  the direct counter to that.)
- **Options must be short and parallel.** Three to eight words each, same grammatical shape. An
  option that is visibly longer than the others reads as the answer.
- **Keep the stem's decisive verb in bold-able position** so the Coach can highlight it in review.
- **Never key an option that requires arithmetic or two-step inference.** Listening MCQ tests
  comprehension of a decision, not reasoning about it.

---

### 4.8 Multiple choice, multi-answer ("Choose TWO letters")

**What it is.** One longer list — five options (A–E) or seven (A–G) — from which **two** or **three**
must be chosen. It occupies **that many question numbers** and carries **that many marks**.

**Instruction line** [OFFICIAL]:
```
Choose TWO letters, A-E.
```
usually printed above a stem like *"Which TWO problems does the speaker mention?"* with the answer
boxes numbered, e.g., `11` and `12`.

**Answer format.** One letter per box, **in either order** (§3.3).

**Order.** The block sits in sequence with the questions around it; the letters inside it do not.

**Where.** Parts 2 and 3 mainly.

**How marks are lost:**

1. **Choosing the wrong number of letters.** Three letters on a "choose TWO" scores zero for both,
   not one out of two.
2. **All five options are mentioned.** Same mechanism as §4.7, at higher volume — five plausible
   things are said and two of them answer the stem.
3. **The stem's qualifier.** *"Which TWO problems did the students **encounter**"* — as opposed to
   anticipated, were warned about, or solved.
4. **Locking in the first two that sound right** and stopping listening.

**Authoring notes** [OURS] + **[DELIVERY BLOCKER B2]**:

- Our schema expresses this as **one slot per required letter** (`docs/plan/07-listening-module.md`
  §2), and `routes/listening.py:677–693` does implement an order-insensitive set match across slots
  — **so multi-select already works**, provided the two answers live in **one** question object with
  two slots. What does *not* work is two separate numbered questions in either order (§3.3).
- **Set `select_n`** so `qtypes.ts:50 letterCount()` renders the right number of checkboxes and the
  UI can warn on the wrong count.
- **Five options minimum, seven maximum.** Fewer than five and the guess rate is too high.
- **Both keyed options must be delivered in different sentences**, at least one turn apart, or the
  item is one answer wearing two marks.

---

### 4.9 Matching

**This is two different types wearing one name**, with **opposite reuse rules**, and the instruction
line is the only thing that tells them apart. Both are [OFFICIAL], both from the 2023 sample tasks.

#### 4.9a Categorising — a small reusable option set

```
What does Jack tell his tutor about each of the following course options?

A   He'll definitely do it.
B   He may or may not do it.
C   He won't do it.

Write the correct letter, A, B or C, next to questions 21-25.
You may choose any letter more than once.
```

**Three options, five items, options reusable.** The options are *attitudes*, *decisions*,
*time periods*, *speakers*, or *categories*. This is the workhorse of **Part 3**.

**Where the marks go.** The option text is abstract (`may or may not do it`) and the audio never
says anything like it. Cambridge's own teaching materials for this task build a paraphrase inventory
before the listening, and it is worth reproducing the *shape* of it (never the content) because it
shows exactly what the type demands:

| A — will definitely | B — may or may not | C — won't |
|---|---|---|
| *I'll sign up for that* · *put me down for that* · *that one's for me* | *I'll think about that one* · *I might wait to decide* · *it depends who's teaching it* | *I'll give that a miss* · *I'd rather do something completely new* · *I'll forget about that one* |

**Every one of those is an idiom, and none of them contains the words in the option.** So the
teachable unit for this type is not a strategy, it is a **phrase bank** — and building it is a
content asset the module does not currently have. *(Flagged for L-R4 / the vocabulary layer.)*

**Authoring notes** [OURS]: three options, five items, and **every option must be used at least
once**. Keep the option text short and mutually exclusive. Discuss the items in list order (order is
sequential). Give at least one item a **reversal** — the speaker leans one way and then lands the
other — because that is the type's characteristic distraction (§6 `agreement_shift`).

#### 4.9b Matching from a box — a larger single-use option set

```
Which hotel matches each description?
Choose your answers from the box and write the correct letter, A-E, next to questions 1-4.

    Hotels
    A   The Bridge Hotel
    B   Carlton House
    C   The Imperial
    D   The Majestic
    E   The Royal Oak
```

**Five (or more) options, four (or fewer) items, each option used once, some options unused.**
Cambridge's teacher's notes state the rule explicitly: *"they should only use each answer choice once
and all the answer choices may not be used."*

The options here are **proper nouns**, and Cambridge notes the consequence: *"the names of the
hotels will be the same in the listening text… as they are proper nouns."* **The options are not
paraphrased; the question stems are.** `is in a rural area` → *"out in the country, about ten
kilometres away, very peaceful"*. That is the inverse of 4.9a and it changes the strategy completely:
in 4.9a you listen for a paraphrased option, in 4.9b you listen for a paraphrased stem.

**Where.** Parts 1, 2 and 3.

**How marks are lost:**

1. **Answering on the first mention.** Every option is named before its answer arrives (§3.4).
2. **Cascade.** Options are single-use, so one misplacement forces a second. Worst
   marks-lost-per-mistake ratio in Listening, exactly as `heading_cascade` is in Reading.
3. **Not using the unused options as information.** With 5 options and 4 items, one is a pure decoy
   and the audio will say something attractive about it.

**Authoring notes** [OURS]:

- **Exactly one or two more options than items.** Five options / four items is the official shape.
- **Order the box alphabetically or by some visible non-audio logic**, so the box order carries no
  information about the answer order. In the official sample the box is alphabetical by hotel name
  while the audio order is completely different — that is deliberate and we should copy the
  principle.
- **Every unused option must be given an attractive near-miss property** in the audio (the Majestic
  is *planning* a pool; the Royal Oak has an *outdoor* pool).
- **The option set must be a closed, nameable set** — hotels, courses, departments, materials,
  speakers. If a learner cannot hold the five names in mind, the item tests memory.

---

### 4.10 Short-answer questions

**What it is.** Direct questions, answered in a few words. Frequently arranged as **grouped bullets
under one stem**.

**Instruction line** [OFFICIAL]:
```
Answer the questions below.
Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.
```

with the task laid out as, verbatim from the sample:

```
What TWO factors can make social contact in a foreign country difficult?
•  11 ...............
•  12 ...............
```

**Answer format.** Verbatim, short — *"concrete facts, such as places, prices or times"* [OFFICIAL,
IDP]. Officially keyed generously: `(the) (public) library/libraries`, `(the) town hall`.

**Order.** Sequential between stems; **in either order within a bulleted list** (§3.3, and the
official key says so in as many words).

**Where.** Parts 1, 2 and 4 [CONSENSUS]. It is the least common of the major types in modern papers
[CONTESTED — §11.2].

**How marks are lost:**

1. **Answering in a sentence.** `The language is difficult` for a 3-word limit.
2. **Missing the second bullet** because the two facts are adjacent in one sentence — *"not just
   because of the language, but because customs may be different"* — and the learner writes the
   first and looks up.
3. **Including the article** on a tight limit.

**Authoring notes** [OURS] + **[DELIVERY BLOCKER B2]**: bulleted either-order groups are the type's
natural shape and we cannot score them yet. Until B2 lands, author short-answer as **single
questions with distinct stems**, which loses a little authenticity and no teaching value.
`short_answer` is absent from `ListeningQuestionType`, but this is cosmetic: with no `options` the
question falls through to `TextAnswer` (`QuestionBlock.tsx:44`, verified 2026-07-28) and scores as a
`TEXT_TYPES` member (`answers.py:107`). Only the type badge is auto-generated.

---

## 5. PLAN, MAP AND DIAGRAM LABELLING — the extended section

This is the type candidates most often meet unprepared. It is worth its own section for four
reasons: it has a spatial-language prerequisite no other type has; it has an **official** order
guarantee almost nobody teaches; it has **zero** content in our bank; and it is the only type whose
delivery depends on an art asset, which means it can fail silently.

### 5.1 The three sub-types [OFFICIAL, IDP]

| Sub-type | What is drawn | Speaker's job | Typical part |
|---|---|---|---|
| **Plan** | the inside of a building or a site: rooms, halls, courts, stalls | a tour, an orientation, a "where you'll find what" briefing | 2 |
| **Map** | an area: streets, a park, a campus, a town centre | directions, a walking route, "how to get here" | 2 |
| **Diagram** | an object or a process: a machine, a tool, a piece of equipment, an anatomy | a description of parts and how they fit | 4, occasionally 2 |

Cambridge's own teacher's notes are explicit that all three share one task type: *"the visual in this
task-type may also be a diagram (e.g. a piece of equipment), a set of pictures or a map (e.g. of part
of a town)."*

### 5.2 The two answer formats

**Format A — letters from a box.** The visual has lettered positions; the questions name the things
to be placed.
```
Label the plan below.
Choose FIVE answers from the box and write the correct letters, A-I, next to questions 11-15.
```
This is the official sample's shape: **nine lettered positions, five questions, four unused.** The
answer key is `11 H · 12 G · 13 D · 14 B · 15 F` — note that the letters are **not** in alphabetical
or spatial sequence. **The letters are positions; the questions are the order.**

**Format B — words onto the visual.** The visual has numbered gaps; the learner writes the name.
```
Label the diagram below.
Write NO MORE THAN TWO WORDS for each answer.
```
This variant reintroduces spelling risk, which Format A removes entirely.

Format A is the more common in Parts 1–2; Format B is more common on diagrams in Part 4 [CONSENSUS].

### 5.3 The order guarantee [OFFICIAL] — teach this loudly

Cambridge/UCLES, Task Type 3 teacher's notes:

> *"…explain that some of these will be used on the recording to label rooms 11 – 15 and that they
> will follow the order of the recording."*

So: **the questions follow the audio.** The learner is not searching the map; they are **walking it
with the speaker**. Every question they answer narrows the next one, because a route is continuous —
the next place is adjacent to this one.

The corollary is the recovery rule, and it is stronger here than anywhere else in the paper:
**if you lose the speaker on a map, you can re-find them geometrically.** You know which question
they are on (the numbers are in order), you know roughly where they were, and the next spatial
phrase will re-anchor you. On a note-completion monologue a lost learner has nothing; on a map they
have the map.

### 5.4 The orientation move, and why it is the whole type [OFFICIAL-DERIVED]

Cambridge's procedure has the teacher stop the recording after the speaker's first orienting sentence
— *"as you see, my desk is just on your right as you go in"* — and check that every student can point
to where they are.

That is the type in one move. **Before any label is placed, the learner must fix (a) where they are
standing and (b) which way they are facing.** Every subsequent `left`, `right`, `beyond`, `past` and
`opposite` is relative to that, and a learner who fixed it wrong will place every label wrong while
following the description perfectly. It is the only type in the paper where you can be listening
correctly and score zero.

**[OURS] Authoring consequence, non-negotiable:** every authored map script opens with an explicit
orientation sentence naming a marked feature, before the first answer, and the pause before the first
answer is at least 1200 ms.

### 5.5 The spatial-language inventory

This is the type's vocabulary prerequisite and it is closed and small enough to teach exhaustively.
Compiled from IDP's own map/plan/diagram guidance and from the official sample scripts.

**Position, static**
`opposite` · `next to` · `beside` · `adjacent to` · `between … and …` · `across from` · `facing` ·
`behind` · `in front of` · `above` / `below` · `at the corner of` · `on the corner` ·
`in the top/bottom left-hand corner` · `at the far end` · `at the near end` · `at the back` ·
`along the far wall` · `on either side of` · `surrounded by` · `set back from` · `overlooking`

**Position, relative to a route**
`on your left / right` · `as you go in` · `as you come out of` · `just past` · `immediately after` ·
`just before` · `beyond` · `further along` · `further in` · `at the end of the corridor` ·
`through the far door` · `the first / second / third on your left` · `the one after that` ·
`straight ahead of you` · `directly opposite` · `you'll see it in front of you`

**Movement**
`go straight on` · `carry straight on` · `turn left / right` · `turn sharp right` · `go past` ·
`go through` · `go round` · `follow the path` · `head towards` · `come out of` · `cross` ·
`take the second turning` · `double back`

**Compass** (used on outdoor maps, rarely on interior plans)
`north` · `south` · `east` · `west` · `north-east` · `south-west` · `in the north-west corner` ·
`to the south of` · `on the eastern side`

**Shape and size** (diagrams especially)
`square` · `circular` · `triangular` · `rectangular` · `oval` · `hexagonal` · `curved` · `narrow` ·
`the wider end` · `the tapered end` · `the upper section`

**[OURS]** Every authored map script uses **at least eight** distinct items from this list, drawn
from at least three of the groups, and the per-question teaching names which phrase decided the
answer. That turns the inventory into a measurable coverage target instead of a word list.

### 5.6 How marks are lost, in order of damage

1. **Wrong orientation at the start** (§5.4). Catastrophic and invisible — every subsequent answer is
   consistently wrong.
2. **Left/right confusion under time pressure.** Universal, and worse for learners whose L1 uses
   absolute (compass) rather than relative (body-centred) spatial reference.
3. **Answering on the first plausible location.** IDP's guidance names exactly this: candidates
   *"write down the first thing or place that you hear"* rather than waiting for the description to
   complete. Compounded because the speaker often mentions a landmark to give directions *from*
   before naming the thing being placed.
4. **A landmark used as a reference point mistaken for an answer.** *"Just beyond the librarian's
   desk on the right…"* — the desk is a signpost, not a label.
5. **Losing the sequence** on a 9-option box and skipping a letter, so every later placement shifts.
6. **In Format B: spelling**, and using more words than the limit for a room name.
7. **Reusing a letter** in a single-use box.

### 5.7 What an authored map must contain — the checklist [OURS]

This is the deliverable spec for whoever draws our maps. A map that misses any of these produces an
item that is unfair, unanswerable, or trivially guessable.

**The visual**

1. **An orientation anchor that is drawn and named.** `ENTRANCE`, a `YOU ARE HERE` marker, a compass
   rose, or a named fixed feature. Without it §5.4 is impossible.
2. **Two to four named, unlettered landmarks** — the reference points the speaker gives directions
   from. These must be *on the visual with their names printed*, and they must never be answers.
3. **Letters (Format A) or numbered gaps (Format B) placed on the positions.** Format A: **N+3 to
   N+5 letters for N questions** — the official sample used 9 for 5. Format B: one gap marker per
   question, numbered with the actual question number.
4. **Real adjacency that creates real distractors.** At least two lettered positions must be
   adjacent, and at least one pair must be *mirror-image* across a corridor or a street, so
   `opposite` genuinely discriminates.
5. **A walkable route.** Every lettered position must be reachable in one continuous pass that a
   speaker can narrate without teleporting. Draw the route before drawing the rooms.
6. **Legible at 420 px tall.** `MapAsset.tsx:64` caps the rendered image at `max-h-[420px]` with
   `object-contain`. Anything with more than ~12 labelled elements will not read.
7. **Theme-neutral.** The app has light and dark themes; the asset renders on `bg-card` with a
   border and `p-2` padding. Line art with transparent background, or a light fill that reads in
   both — not a white-background screenshot.
8. **SVG preferred, PNG acceptable.** SVG scales and stays crisp on the 420 px cap.

**The plumbing** [MEASURED]

9. **`asset` on every question in the group.** `types.ts:39` accepts a bare string or
   `{src|path, alt}`. `qtypes.ts:123 assetMediaPath()` resolves it: a path starting `packs/` becomes
   `/api/v1/media/packs/<rest>`; anything else is prefixed with `/api/v1/media/packs/`; a path
   already starting `api/v1/media/` is used as-is. **Author `packs/core-en/maps/<slug>.svg`.**
10. **`alt` text on the object form.** `assetAlt()` (`qtypes.ts:134`) falls back to the question
    label, which is a poor screen-reader experience for a spatial task. Write a real one: *"Plan of a
    two-storey community centre; entrance bottom centre; nine lettered rooms A to I."*
11. **The asset must be in the pack manifest and checksummed** like other media. Verify the pack
    build picks up `maps/` before authoring — this is the same asset-pipeline question the Reading
    module flagged as its D4 blocker.

**[DELIVERY BLOCKER B4 — the placeholder is wrong for Format A.]** When the asset is missing,
`MapAsset.tsx:43–53` renders: *"The map for this question isn't in the installed content pack. The
audio still names each location, so you can answer from what you hear."* That is true for **Format
B** and **false for Format A** — without the plan you cannot know which position is `H`, and the
question is unanswerable. Two options, both cheap: make the copy conditional on whether the question
has `options`, or (simpler, and [OURS] recommended) **author Format A only when the asset is
guaranteed to ship, and prefer Format B for any map that might not have art yet.** Format B also
keeps the spelling dimension, which is on-brand for this module.

### 5.8 Situation ideas that are safe to author [OURS]

Original, and deliberately far from the library plan we read: a **community garden allotment site**
(plots, shed, composting area, water point, gate); a **small regional airport arrivals level**; a
**restored watermill** open to visitors; a **university sports centre** across two floors (and the
`ground floor` / `first floor` accent trap, §1.2); a **farmers' market layout** in a square; a
**wildlife hide and boardwalk** on a wetland reserve; a **campsite**; a **hospital outpatients wing**;
and for diagrams: a **wormery**, a **bicycle repair stand**, a **coffee roaster**, a **rainwater
harvesting system**, a **beehive**.

---

## 6. THE DISTRACTION TAXONOMY

Listening's signature trap is the speaker who says a thing and then unsays it. There is no equivalent
in Reading, because in Reading the retraction is still on the page. **These are named so that
per-question teaching can cite them**, exactly as the Reading module cites its Not Given traps, and
so that a learner's error history becomes a diagnosis ("6 of your 9 losses were `late_correction`")
rather than a percentage.

**Rules for using it** [OURS]: author **0–2 slugs per question**, most decisive first. `[]` is legal
and correct — not every item is a trap, and pretending otherwise trains paranoia. Every slug in
families **C, R and F** should be exercised by **at least six questions** across the merged bank or
the trap drill cannot teach it.

### Family C — the speaker takes it back (the signature family)

| Slug | Name | What happens | The signal |
|---|---|---|---|
| `self_correction` | Immediate self-correction | Speaker states the wrong value and replaces it in the same breath. **The single most characteristic listening trap.** | *sorry* · *no* · *I mean* · *actually* · *rather* · *let me correct that* · *make that* |
| `late_correction` | Deferred correction | The correction arrives one or more turns later, after the learner has written and moved on | *oh, hang on* · *sorry, I said X, it's actually Y* · *did I say X? I meant Y* |
| `third_party_correction` | Corrected by the other speaker | A corrects B. Common in Part 1 (agent corrects caller) and Part 3 (tutor corrects student) | *are you sure? I thought it was…* · *no, that was last year* |
| `readback_correction` | Correction inside a read-back | The listener repeats the value for confirmation and is corrected mid-repeat. Very natural in Part 1 forms | *so that's B-R-A-M…* / *…actually it's with a Y* |
| `spelling_correction` | Correction inside a spelling | A letter is given wrong and re-given. Brutal and fair, because real speakers do it | *S for sugar — sorry, F for Freddie* |

### Family R — the option that was raised and rejected

| Slug | Name | What happens | The signal |
|---|---|---|---|
| `rejected_option` | Considered, then declined | An option is raised, discussed positively, and turned down | *we did think about…* · *we looked at… but* · *that would have been ideal, except* |
| `concession_flip` | The point is after the contrast | A positive claim is made and reversed. The mark is on the second clause | *but* · *however* · *although* · *even so* · *mind you* · *the thing is* |
| `hypothetical_only` | Planned, not done | Stated as intention, proposal or possibility that has not happened | *is planning to* · *we're hoping to* · *should be ready by* · *there's talk of* |
| `past_state` | Was true, isn't now | Formerly the case, explicitly superseded | *it used to be* · *originally* · *that's been moved* · *up until last year* |
| `negated_fact` | The fact is inside a negation | The right words are present and the polarity is wrong. Skipping one unstressed `not` costs the mark | *not* · *isn't* · *doesn't* · *no longer* · *apart from* · *except* · *rather than* · *instead of* |
| `agreement_shift` | Proposed then rejected between speakers | Part 3's defining pattern: one speaker proposes, the other disagrees, and the **joint** decision is the answer | *do you think we should…?* / *I'm not sure, because…* |
| `attribution_shift` | Whose view is it? | The opinion belongs to the tutor, the other student, or a cited source — not to the speaker the stem asks about | *my supervisor thought* · *the reading says* · *Katie reckons* |

### Family N — numbers, quantities and codes

| Slug | Name | What happens |
|---|---|---|
| `number_superseded` | A figure is given and then revised — a quote, then a discounted quote; a time, then a changed time |
| `number_arithmetic` | Two or more figures are given and the answer is the one that follows from them (`£1500` + `£200` → *"I'd put down £1700"*). Only the stated total is the key; never require the learner to compute |
| `unit_switch` | Same quantity, different unit. `0.75 m` and `75 cm`. Both are keyed; a learner who converts wrongly is not |
| `adjacent_numbers` | Two numbers in one sentence, only one answers the stem — full price vs reduced price, weeks of course vs week of exam |
| `digit_reading` | The spoken convention is the difficulty: `oh` for zero, `double four`, `nineteen eighty-three`, `nought point seven five` |
| `date_ambiguity` | `03/05` — March 5 or 3 May. Key both, and never make the ambiguity the point |

### Family L — the words don't match the meaning

| Slug | Name | What happens |
|---|---|---|
| `lexical_lure` | The question's own keyword is spoken, attached to a different fact. **The trap Field's research says candidates are structurally most vulnerable to**, because superficial lexical matching is the strategy they fall back on under pressure |
| `synonym_only` | The answer is never spoken in the question's words at all. A learner waiting for the keyword hears nothing and concludes the answer wasn't given |
| `option_never_named` | MCQ: the keyed option is chosen by description, never by its printed label (*"I'll go for the highest"* for `Premium`) |
| `all_options_named` | MCQ: every option is spoken, so option-spotting is worthless by construction |
| `decoy_first` | The distractor is spoken **before** the answer. Structural, and near-universal: the earlier plausible candidate is nearly always the trap |
| `paraphrased_stem` | Box-matching (§4.9b): the option is a proper noun spoken verbatim, the **stem** is the paraphrase — the reverse of the categorising variant |

### Family F — form, not comprehension. Counted separately.

| Slug | Name | What happens |
|---|---|---|
| `spelling` | Heard correctly, written wrongly. Already detected at runtime as `near_miss_spelling` (`routes/listening.py:673`) |
| `plural_form` | Singular for plural or vice versa, where the gap's grammar decided it |
| `word_class` | Right root, wrong form — `manage` for `management` |
| `over_limit` | Right content, too many words. Usually an article |
| `wrote_word_not_letter` | Letter types: the option's words instead of its letter |
| `wrong_letter_count` | "Choose TWO" answered with one or three |
| `case_anxiety` | Not an error at all — a learner losing time worrying about capitals. Worth a one-line reassurance in the UI (§2.5) |

### Family P — pacing and recovery

| Slug | Name | What happens |
|---|---|---|
| `overrun` | The next answer is spoken while the learner is still writing the last one. The mechanical cause of most consecutive-miss pairs |
| `cascade` | One miss becomes three because the learner keeps listening for the answer they missed. **The behaviour the recovery drill exists to break** |
| `preview_overrun` | The learner is still reading ahead when the audio starts |
| `blank` | Left empty. There is no penalty for a wrong answer; a blank is a guaranteed zero and a guess is not |

### 6.1 What the payload does with a slug [OURS]

A trap slug is only worth storing if it changes what the learner is told. Proposal:

```jsonc
"distraction": {
  "slug": "self_correction",
  "decoy": "Tuesday",                       // the wrong value the audio actually offered
  "decoy_line_index": 21,                   // where it was said
  "signal": "sorry, no",                    // the exact words that announced the correction
  "note": "<=25 words — what the learner should have done at that instant>"
}
```

`decoy` and `decoy_line_index` make three features free: highlighting the decoy in the transcript
panel next to the answer; a **"why did you write that?"** check on review that compares the learner's
wrong answer against the authored decoy and says *"you wrote the value the speaker withdrew"*; and a
**re-listen drill** that plays only the 8 seconds around the correction. None of those needs a new
component; `TranscriptPanel` and the timing sidecar already carry per-line start offsets.

---

## 7. SIGNPOSTING — the markers that announce an answer is coming

Prediction says *what* to expect. Signposting says *when*. It is the half of listening strategy that
teaching material almost never makes concrete, and it is fully authorable because we write the
scripts.

### 7.1 The inventory

**Answer is imminent (Part 1, transactional)**
`Can I take your…` · `And what was the…?` · `Could you spell that for me?` · `So that'll be…` ·
`Let me just put you down for…` · `And the address is…?` · `Just to confirm…` ·
`Right, I've got that.`

**Structure of a talk (Parts 2 and 4)**
`I'll start by…` · `First of all…` · `Now, moving on to…` · `That brings me to…` ·
`Before I go on, let me just…` · `The other thing to mention is…` · `Finally…` ·
`So to sum up…` · `One last point…`

**A list is coming, and it will be numbered**
`There are three main…` · `We look at two things…` · `A couple of points here…` — the number in the
announcement tells the learner how many gaps to expect and is the strongest recovery anchor in a
monologue.

**Emphasis — this is the bit that matters**
`The important thing is…` · `What's crucial here is…` · `Do bear in mind…` · `Note that…` ·
`Interestingly…` · `And this is the part people get wrong…`

**Definition — a term is about to be named** (very common in Part 4, and the term is often the key)
`which we call…` · `known as…` · `or, to give it its proper name…` · `what's sometimes referred to
as…`

**Reformulation — the same idea again in easier words** (a second chance at a missed fact)
`in other words` · `that is to say` · `which basically means` · `put another way`

**Contrast — the answer is on the far side** (see `concession_flip`)
`but` · `however` · `although` · `whereas` · `on the other hand` · `having said that` · `mind you`

**Correction — the answer is about to change** (see Family C)
`sorry` · `no, actually` · `I mean` · `rather` · `make that` · `hang on`

**Decision reached (Part 3)**
`Let's go with…` · `Shall we say…?` · `OK, that's settled` · `I'll put us down for…` ·
`So we're agreed on…`

### 7.2 The authoring rule [OURS]

**Every keyed answer must be preceded, within two clauses, by a signpost from this inventory or by an
authored distraction from §6 — and the per-question payload names which.** That is a lint, and it is
what makes the script *teachable* rather than merely accurate. A script whose answers arrive
unannounced is harder than the real exam and teaches nothing transferable, because the learner's
correct conclusion is "I should have concentrated more", which is not a skill.

Proposed field:

```jsonc
"signpost": {
  "phrase": "The important thing is",     // verbatim from the cue line or the line before it
  "line_index": 34,
  "kind": "emphasis"                       // imminent | structure | list | emphasis | definition
                                           // | reformulation | contrast | correction | decision
}
```

`kind` is a closed enum, so the app can build a **signpost drill**: play 6-second clips, ask what
kind of thing is coming next. Again, free from existing content.

---

## 8. What a paper is made of, and what ours should be

### 8.1 Types per paper [OFFICIAL-ish]

ielts.org says the paper uses *"a variety of tasks"* with types *"chosen from"* the list. IDP-adjacent
material says a given test will contain **around five** of the types. **No official per-type
frequency data is published** [CONTESTED — §11.2], so:

**[OURS] Safe learner-facing phrasing:** *"appears in most papers"*, *"nearly always in Part 2"*,
*"less common"*. **Never** *"matching appears in 60% of tests"*. That is the same discipline the
Reading module adopted and for the same reason.

### 8.2 What each part typically contains [CONSENSUS, with our own sample as one data point]

| Part | Near-certain | Common | Occasional |
|---|---|---|---|
| 1 | form / note completion (6–10 questions) | a 2–4 question MCQ or matching tail | table completion; short answer |
| 2 | **plan/map labelling OR a completion set** | MCQ; matching; note completion | table; sentence completion; short answer |
| 3 | **MCQ and/or matching** (the two carry most of it) | sentence completion | flow-chart; note completion |
| 4 | **note completion**, often 10/10 | sentence or summary completion; table | diagram labelling; MCQ |

### 8.3 [OURS] Blueprint for a BandReady listening test

Four scripts, 40 questions, and a type spread that guarantees every type gets exercised across the
bank rather than every test being identical:

| Part | Groups | Type mix | Accent |
|---|---|---|---|
| 1 | 2 | `form_completion` ×7 + `multiple_choice` ×3 | rotate uk / us |
| 2 | 2 | `map_labelling` ×5 + `note_completion` ×5 — **or** `note_completion` ×6 + `table_completion` ×4 | rotate |
| 3 | 2 | `multiple_choice` ×5 + `matching` ×5 (alternate 4.9a and 4.9b across tests) | rotate |
| 4 | 1–2 | `note_completion` ×10, or ×6 + `sentence_completion` ×4 | rotate |

**Pack-level coverage targets** so the drill modes have material:

- every type in §4.0 that ships appears in **≥3 tests**;
- `map_labelling` appears in **≥4 tests** (it is the weakest link and needs the most practice
  material);
- every §6 slug in families C, R and F is carried by **≥6 questions**;
- across the bank, `accent_set` is roughly balanced across `uk` / `us` / `au`, with no test using a
  single accent for all four parts.

### 8.4 Recovery — the drill the module is missing [OURS]

Everything above is about getting answers right. **Recovery is about the answers you get right after
getting one wrong**, and it is the only strategy that is worth more in listening than in any other
paper, because the cascade is unique to a once-only medium.

The three moves, in the order a learner should learn them:

1. **Abandon immediately.** The moment you realise you missed one, stop looking for it. It is gone.
   Its value is 1 mark; the next three are worth 3.
2. **Re-enter at the next visible anchor.** Not "start listening harder" — *look at the next
   question* and take its prediction (§2.6). On a map, use the geometry (§5.3). In notes, use the
   next heading and wait for its signpost (§7).
3. **Guess before you move on, never after.** A plausible guess written now costs two seconds; a
   blank you intend to come back to costs the two seconds *plus* the attention you spend remembering
   it. There is no penalty for a wrong answer.

**This is directly drillable with our existing machinery.** Take an authored script, deliberately
suppress the audio for the 6 seconds around question *n*, and score questions *n+1 … n+3*. The
learner's own cascade rate becomes a number. It needs no new content — only a range on the timing
sidecar we already generate.

### 8.5 The paper-test facts we must teach because our app removes them [OURS]

We model computer-delivered IELTS (§1.1), which is right. But a learner sitting the paper test faces
three things our app will never show them, and they are cheap to teach as a briefing card:

- **10 minutes of transfer time, and it is not free.** Answers are written on the question paper
  during the audio and copied to the answer sheet afterwards. Copying introduces its own errors:
  wrong row, skipped number, a `1` that reads as `7`.
- **Numbering discipline.** After a skipped question, every subsequent answer can land one row
  early. Number the rows before transferring.
- **Legibility is a marking criterion in practice.** An answer a marker cannot read is wrong.

---

## 9. What this means for the teaching payload — the shape this briefing recommends

Consolidated from §§2.6, 6.1, 7.2. **Proposal only** — the DESIGN agent owns the schema. The one
structural claim worth defending is that **everything goes inside `script_json`**, because the
loader copies only the declared columns and any extra top-level key on the row is silently dropped
at import (the same fact `staging-reading/DESIGN.md` §0.3 records for reading passages).

**Per question:**

| Field | Serves | Why it is not optional |
|---|---|---|
| `prediction` | BEFORE | Turns 30 seconds of dead time into the highest-leverage move in the paper, and yields a no-audio drill |
| `signpost` | APPROACH | The only teachable answer to "how was I supposed to know it was coming" |
| `distraction` | THE MOMENT | Names the trap and stores the decoy, so review can say *why* the wrong answer was written |
| `form_risk` | FORM | Which of the Family-F slugs this item can produce, and the one-line fix |
| `recovery` | AFTER | Only on items that follow a hard one — what to do if this is the one you lost |
| `cue_line_index` | all | **already exists and is already populated.** It is what makes every one of the above locatable in the audio |

**Per group:** the instruction line (rendered, never hand-typed — `answers.py:425 instruction_for()`
exists and is shared with reading), the order behaviour from §3.2 with a one-line consequence, the
preview budget in seconds, and a strategy written for *this* task rather than for the type in
general.

**Per part:** the situation, the speaker cast, the signpost inventory used, and a difficulty
rationale. **Per test:** nothing authored — `ListeningTestRow` has six columns and no payload
(`validate.py:231–237`), so the band table and the pacing plan must be **derived**, exactly as the
Reading module concluded for `ReadingTestRow`.

---

## 10. Where sources disagree, and what we do about it

### 10.1 [CONTESTED] "Use the exact words you hear"

Every coaching source states it as an absolute rule. IDP's own page states it. But the official
answer keys accept unit conversions, decades for years, optional plurals, optional determiners and
optional hyphens (§2.2). **Resolution:** teach the rule, key the generosity. Documented in §2.2 as
an authoring rule; the DESIGN agent should lint that every completion answer carries at least the
verbatim form plus any official-style optionals.

### 10.2 [CONTESTED] Per-type frequency

Claims like *"99% of Part 4 is note completion in 2021"* circulate widely and are traceable to
teachers counting Cambridge volumes, not to any published statistic. The **direction** is well
supported (Part 4 has narrowed towards note completion; short answer has become less common). The
**numbers** are not. §8.1 fixes our phrasing.

### 10.3 [CONTESTED] The instruction-line wording

`NO MORE THAN THREE WORDS AND/OR A NUMBER` appears in the 2023 official sample; `ONE WORD ONLY` and
`ONE WORD AND/OR A NUMBER` appear in IDP guidance and in recent Cambridge volumes. Both are live.
**Resolution:** never hand-type the line. `instruction_for()` already renders every form we need from
`{max_words, numbers_allowed}` and it is the same function reading uses. Author the limit, not the
sentence.

### 10.4 [CONTESTED] The bottom of the band table

IDP publishes band 4.0 at raw 11–12 and publishes nothing below it. Our implementation gives 4.0 at
10–12 and adds 3.5 / 3.0 / 2.5 rows. ielts.org's four anchor points (16 / 23 / 30 / 35) agree with
IDP exactly and say nothing about the bottom. **Resolution:** keep ours, keep the "indicative" note,
never present the sub-4.0 rows as official.

### 10.5 [CONTESTED] Whether Part 2 is "always" a map

Widely repeated; not official. Part 2 is a monologue on an everyday topic and a map is common in it,
not guaranteed. Teach *"Part 2 is where a map is most likely"*, never *"Part 2 has a map"*.

### 10.6 Items in our own plan doc that this briefing corrects

- `docs/plan/07-listening-module.md` §5 lists `matching` as one type. It is **two types with
  opposite reuse rules** (§4.9). The instruction line must state which, and the teaching must
  differ.
- §5 calls `map_labelling` *"curated content only — LLMs cannot reliably author spatial maps"*. That
  is right about maps and wrong about **diagrams**, and it also under-sells the constrained case: a
  **grid-based plan with a fixed template** (a 3×3 room grid, entrance at a fixed edge) is
  authorable and renderable deterministically. Worth revisiting once §5.7's checklist exists.
- §9's generator prompt says *"Answers appear in question order"* — correct — and *"for at least 4
  questions, a plausible wrong answer is mentioned first and then corrected"*, which is one slug
  (`self_correction` / `decoy_first`) out of the ~30 in §6. The prompt should take the taxonomy as a
  constrained vocabulary, the way the Reading module passes its trap enum to the LLM.

---

## 11. Concrete asks for the build

Ordered by what blocks the most content.

| # | Ask | Severity | Owner |
|---|---|---|---|
| **B1** | Word limit drops the `AND/OR A NUMBER` allowance between the loader and the scorer, while the UI advertises it. `loader.py:350` keeps only `word_limit["words"]`; `routes/listening.py:656` uses `count_words()` instead of `answers.py:395 within_word_limit()` | **High — marks correct answers wrong** | sidecar |
| **B2** | No way to express "in either order" (§3.3). Affects short-answer lists, list-shaped note gaps, and any two-number answer pair | **High — blocks an official task shape** | sidecar + schema |
| **B3** | No flow-chart component. §4.4's arrow-chain substitute renders correctly as a gapped paragraph, so this is a polish item, not a blocker | Low — workaround verified | app |
| **B4** | `MapAsset` missing-asset copy is wrong for letter-answer maps (§5.7) | Medium — silently unanswerable items | app |
| **B5** | No map asset pipeline confirmed: where `packs/core-en/maps/*.svg` lives, how the manifest checksums it. Must be settled **before** any `map_labelling` authoring | **High — blocks the whole type** | packaging |
| **B6** | `short_answer` and `summary_completion` are absent from `ListeningQuestionType` / `TYPE_LABELS`. They render correctly (§4.0 — the renderer branches on data shape, not slug); the only cost is an ugly auto-generated badge. Add the labels | Low — cosmetic | app |
| **B6b** | `LAYOUT_TYPES` (`qtypes.ts:16`) is exported and imported by nothing. Delete it or wire it, but do not let an author reason from it | Low | app |
| **B6c** | `QuestionBlock` picks the letter input purely from `options` being non-empty (`:44`). A completion question with a stray `options` key becomes an unanswerable letter picker. Needs a merge-gate lint | Low — silent, total item failure | verify agent |
| **B7** | US/UK spelling variants are never inferred at match time (`answers.py:512`). Every pair must be authored. Needs a merge-gate lint over `US_UK_PAIRS` | Medium — silent mark loss | verify agent |
| **B8** | No `au` script exists and Kokoro has no AU voices. Decide whether `accent_set: "au"` ships as a voice-rotation label (§1.2) or is dropped from content until a cloud TTS is configured | Medium — affects the accent drill's value | product |
| **B9** | Review/teaching payload must be stripped from in-progress attempts. Reading's `_SECRET_FIELDS` precedent (`staging-reading/DESIGN.md` §0.4 D2) applies verbatim: put **all** teaching data under one key so one `pop()` removes it | **High — a mock that serves its own answers is not a mock** | sidecar |
| **B10** | `_score_question` calls `answers_match()` with **no** `question_type` (`routes/listening.py:668, 683`), so letter answers take the free-text branch rather than `LETTER_TYPES`. Single letters work by accident; verify before relying on it for multi-letter or roman-numeral options | Low–Medium | sidecar |

**Content-side asks that need no code:** the §6 taxonomy as a closed enum; the §7 signpost enum; the
§5.5 spatial inventory as a coverage target; the §5.7 map checklist handed to whoever draws the art;
and a per-question `prediction` field, which is the cheapest high-value thing in this whole document.

---

## 12. Sources

Official IELTS-partner publications (treat as fact):

- [IELTS Listening — Sample Tasks (2023 PDF, ielts.org)](https://ielts.org/cdn/ielts-sample-tests/ielts-listening-sample-tasks-2023.pdf) — the primary source for §§2.1–2.5, §3.3, §4.1–4.10 instruction lines and answer-key conventions. Eight sample tasks with tapescripts and keys.
- [IELTS Academic: Listening test format (ielts.org)](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening) — §1.1 structure, the order rule, accents, transfer time.
- [IELTS scoring in detail (ielts.org)](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) — §1.3 band anchors and the version-variation caveat.
- [IELTS Listening question types (IDP IELTS)](https://ielts.idp.com/prepare/article-question-types-listening) — per-type descriptions, "exact words you hear", hyphen counting, contractions not tested.
- [IELTS Listening tips for map, plan and diagram questions (IDP IELTS)](https://ielts.idp.com/prepare/article-ielts-listening-tips-for-map-plan-diagram-questions) — §5.1, §5.5, §5.6.
- [How to write numbers in IELTS (IDP IELTS)](https://ielts.idp.com/prepare/article-how-to-write-numbers-in-ielts) — §2.4.
- [How to calculate the IELTS Listening band score (IDP IELTS)](https://ielts.idp.com/egypt/results/scores/listening) — the full §1.3 table.
- [IELTS on computer vs IELTS on paper (IDP IELTS)](https://ielts.idp.com/prepare/article-ielts-on-computer-vs-ielts-on-paper) — §1.1 transfer time, §8.5.
- [IELTS Listening Task Type 2 (Matching) teacher's notes 1 — UCLES/Cambridge](https://www.cambridgeenglish.org/images/ielts-listening-task-type-2-matching-1.pdf) — §4.9a, the paraphrase inventory shape.
- [IELTS Listening Task Type 2 (Matching) teacher's notes 2 — UCLES/Cambridge](https://www.cambridgeenglish.org/Images/ielts-listening-task-type-2-matching-2.pdf) — §4.9b, the single-use rule, the proper-noun rule.
- [IELTS Listening Task Type 3 (Plan, Map, Diagram Labelling) activity — UCLES/Cambridge](https://www.cambridgeenglish.org/Images/ielts-listening-task-type-3-plan-map-diagram-labelling-activity.pdf) — **§5.3's order guarantee**, §5.4's orientation move, the sub-type list.
- [British or American English in the IELTS test (British Council)](https://takeielts.britishcouncil.org/blog/british-or-american-english-ielts) — §2.5.

Research literature:

- [The cognitive validity of the lecture-based question in the IELTS Listening paper — John Field, IELTS Research Reports](https://ielts.org/researchers/our-research/research-reports/the-cognitive-validity-of-the-lecture-based-question-in-the-ielts-listening-paper) — the finding that candidates under test conditions process superficially and match lexically rather than by meaning. Cited in §4.7 and §6 Family L as the justification for building items that punish lexical matching.
- [Assessing Second Language Listening Over the Past Twenty Years (Frontiers in Psychology, 2020)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.02123/full) — background on the socio-cognitive framework and test-wise strategy behaviour.

Teaching sources (used for [CONSENSUS] claims only, never for facts):

- [Common traps in IELTS Listening: distractors, self-corrections and similar options (Cursa)](https://cursa.app/en/page/common-traps-in-ielts-listening-distractors-self-corrections-and-similar-options) — §6 signal phrases.
- [IELTS Map Listening Practice (IELTS Liz)](https://ieltsliz.com/ielts-map-listening-practice/) — §5.5 spatial inventory, §5.6 error list.
- [IELTS Listening Part 3 guide (goarno.io)](https://goarno.io/blog/listening-part-3-guide-ielts/) — §6 `agreement_shift`, §8.2 Part 3 type mix.
- [IELTS Listening Part 4 (My IELTS Classroom)](https://blog.myieltsclassroom.com/ielts-listening-part-4/) — §8.2 Part 4 narrowing (direction only; the percentage is not reproduced as fact).
- [IELTS Listening sentence completion (IDP)](https://ielts.idp.com/prepare/article-ielts-listening-test-sentence-completion-questions) — §4.5.

Repo, read 2026-07-28 [MEASURED]:

`sidecar/bandready/content/validate.py:206–237` (row schemas) · `:533` (`iter_listening_questions`) ·
`sidecar/bandready/content/loader.py:343–365` (listening question projection, the word-limit fold) ·
`sidecar/bandready/scoring/answers.py:76–109` (type families) `:325–447` (normalise, word limit,
`instruction_for`) `:475–554` (variant expansion, US/UK pairs) `:611–661` (`answers_match`) ·
`sidecar/bandready/server/routes/listening.py:164` (`_slots`) `:636–693` (`_score_question`)
`:864–976` (submit, SRS candidates) · `sidecar/bandready/audio/tts_render.py:42–78` (`VOICE_MAP`,
`ACCENT_LABELS`) `:144–170` (audio hash, line cache) · `app/src/features/listening/types.ts:26–60` ·
`app/src/features/listening/qtypes.ts:13–137` · `app/src/features/listening/components/MapAsset.tsx`
· `content/core-en/data/listening_scripts.jsonl` · `content/core-en/data/topics.jsonl` (20 topic ids:
`topic_environment`, `topic_education`, `topic_technology`, `topic_health`, `topic_globalisation`,
`topic_urbanisation`, `topic_work`, `topic_media`, `topic_culture`, `topic_transport`, `topic_crime`,
`topic_tourism`, `topic_family`, `topic_science`, `topic_economy`, `topic_food`, `topic_sport`,
`topic_housing`, `topic_communication`, `topic_money`).
