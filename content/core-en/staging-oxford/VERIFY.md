# staging-oxford — verification report

**Verdict: NOT fit to merge.** Six blocking problems, listed first. None of them is a
prose-quality problem. I read about 110 entries closely and spot-checked 71 high-risk IPA
transcriptions against British reference pronunciation, and the authored English is very
good — I found eleven content errors in the whole batch and zero wrong IPA. The blockers are
structural: nineteen headwords were never written, two required fields were authored as the
wrong JSON type across 1,433 entries, two more are simply absent from over half the batch,
and 1,501 topic tags point outside the closed set the app filters on.

This report supersedes the previous VERIFY.md, which was written when `lift-05.json` and
`phrase-03.json` did not yet exist and when 280 entries carried invalid `topic_id`s. Both of
those problems are now fixed. Every `topic_id` in the batch resolves against
`data/topics.jsonl`.

---

## 0. What is on disk

`content/` holds **12** files. Every one parses under `python3 -m json.tool`.

| block | worklist kind | worklist | authored | deck | status |
|---|---|---:|---:|---|---|
| core-01 | foundation-word | 395 | 390 | oxford-foundation | 5 short |
| core-02 | foundation-word | 395 | 390 | oxford-foundation | 5 short |
| core-03 | foundation-word | 395 | 391 | oxford-foundation | 4 short |
| core-04 | foundation-word | 395 | 390 | oxford-foundation | 5 short |
| lift-01 | band-word | 250 | 250 | oxford-core | complete |
| lift-02 | band-word | 250 | 250 | oxford-core | complete |
| lift-03 | band-word | 250 | 250 | oxford-core | complete |
| lift-04 | band-word | 250 | 250 | oxford-core | complete |
| lift-05 | band-word | 250 | 250 | oxford-core | complete |
| phrase-01 | phrase | 307 | 307 | oxford-phrases | complete |
| phrase-02 | phrase | 307 | 307 | oxford-phrases | complete |
| phrase-03 | phrase | 305 | 305 | oxford-phrases | complete |
| **total** | | **3,749** | **3,730** | | **99.5%** |

Deck split: `oxford-foundation` 1,561 · `oxford-core` 1,250 · `oxford-phrases` 919.

**What is already clean**, so that the blocking list below is read in proportion:

- Every row carries exactly the five columns `id · lemma · pos · deck · entry_json`. No row
  carries a sixth key, none is missing one.
- Every `pos` is inside the eight values `vocab_entries` permits. No `lemma`/`headword`
  disagreement, no `pos`/`entry_json.pos` disagreement.
- **Zero** duplicate ids, **zero** duplicate `lemma`+`pos` within the batch, **zero** id
  clashes with `data/vocab.jsonl`, and **zero** `lemma`+`pos` collisions with the 1,246
  shipped entries. Section 3 below has the detail. Nothing is being re-authored.
- **Zero** sentinels. I grepped every file for `__CURSOR__`, `PLACEHOLDER`, `TODO`, `TBD`,
  `FIXME`, `XXX`, `{{`, `<slot>` and `N/A`. Clean.
- Every one of the 2,381 entries whose worklist row carries an official CEFR level was
  authored at exactly that level. 0 mismatches. The source data was respected.
- Every `topic_id` present (1,919 of them) resolves against `data/topics.jsonl`.
- All 3,730 ids are `vocab_ox_`-prefixed and alphanumeric-plus-underscore.

---

## BLOCKING

### B1 — nineteen headwords are missing: every month and every weekday

Coverage against `worklists/*.json` is 3,730 of 3,749. Nothing was authored twice, nothing
was authored that is not on a worklist. The whole 19-item gap is this:

```
January  February  March   April   May     June    July
August   September October November December
Monday   Tuesday  Wednesday Thursday Friday Saturday Sunday
```

They are in `worklists/core-01`, `core-02`, `core-03` and `core-04` in correct capitalised
form. They are absent from the content blocks in every form — I searched the blocks for the
correct spellings *and* for the decapitated forms (`anuary`, `ebruary`, `onday` …) that the
earlier report recorded, and neither appears. So the blocks were authored against the
pre-repair worklist, the four authors each dropped the corrupt rows rather than repairing
them, and the worklist was then fixed upstream without the blocks being regenerated.

This violates the authoring contract ("author exactly the headwords in your worklist"), and
it is not a cosmetic gap: for the A1 learner this deck exists to serve, the days of the week
and the months are among the first fifty nouns anyone needs. The related phrase entries
`in April`, `in July, etc.`, `on Monday` and `on Tuesday, etc.` *were* authored in
`phrase-02` and `phrase-03`, so the pack would ship "on Monday" while not teaching "Monday".

**Fix:** author the nineteen into their assigned core blocks. `pos: "noun"`, `cefr_level`
per worklist. Note `Wednesday` /ˈwenzdeɪ/ and `February` /ˈfebruəri/ carry pronunciation
traps that deserve an `avoid` line.

### B2 — `chunk` is a string on all 919 phrase entries; the spec requires an object

`staging-grammar/DESIGN.md` §3.2 defines `chunk` as required when `unit_type` is `chunk` or
`frame`, and defines it as an object:

```jsonc
"chunk": {
  "shape": "stem from + NOUN",
  "fixed_part": "stem from",
  "open_slots": [ { "slot": "NOUN", "fills": [...] } ],
  "dependent_preposition": "from",   // "Drives the collocation drill."
  "is_frame": false
}
```

Every one of the 919 phrase entries authored it as a bare string instead:

| block | id | authored |
|---|---|---|
| phrase-01 | `vocab_ox_are_you_getting_on_` | `"Are you getting on?"` |
| phrase-02 | `vocab_ox_fall_off_sth` | `"fall off + sth"` |
| phrase-03 | `vocab_ox_next_time` | `"next time"` |

The strings are not useless — `"fall off + sth"` is a real shape — but `open_slots` and
`dependent_preposition` are gone, and `dependent_preposition` is the field the collocation
drill reads. The entire phrase tier, which is the reason the phrase blocks exist, ships with
its drill input missing. A consumer doing `entry.chunk.dependent_preposition` gets a
`TypeError` on a string, not a `None`.

**Fix:** mechanical for most rows — `fixed_part` is the invariant substring, `open_slots`
comes from the `sth`/`sb` markers already in the headword, `dependent_preposition` from the
`avoid` line, which in most entries already names it ("The preposition before the person is
'with'"). 919 rows, but the information is already in the file.

### B3 — `word_family` is a list of strings on 514 entries; the spec requires objects

Same section: `word_family` is `[{ "form": ..., "pos": ..., "note": ... }]`. Of the 1,919
entries that carry the field, 1,405 have it as `[]` and **514 have it populated entirely
with bare strings** — not one object anywhere in the batch.

| block | entries with a populated `word_family` |
|---|---:|
| lift-04 | 247 |
| lift-05 | 216 |
| phrase-02 | 51 |

The missing `pos` is what makes this a defect rather than a style choice: without it the
runtime cannot tell that `publication` → `publish` is the verb and `public` the adjective.
It also drives authors to smuggle the part of speech into the string, which is exactly what
happened:

- `lift-05` / `vocab_ox_struggle` → `["struggle (noun)"]` — a parenthetical annotation in a
  field that has a `pos` slot for precisely that.
- `lift-04` / `vocab_ox_pin` → `["pin up", "pinned"]` — `pinned` is an inflection, not a
  family member, and `pin up` is a phrasal verb.
- `lift-04` / `vocab_ox_ours` → `["we", "our", "us"]` — inflectional pronoun forms, not a
  derivational family.

Note also that `lift-01` and `lift-03` carry `word_family` on all 500 entries with an empty
list every time, including for words with obvious families (`analyse`/`analysis`/`analyst`,
`achievement`/`achieve`). The field was added to satisfy a shape check and never filled.

### B4 — `frequency_band` is absent on 2,061 entries, and wrong on 135 more

`frequency_band` is marked **REQ** in §3.2 and drives two things the DESIGN names
explicitly: the "at most one unfamiliar item per context" check, and SRS tail length.

Missing entirely on:

| block | rows |
|---|---:|
| core-01 · core-02 · core-03 · core-04 | 1,561 |
| lift-02 | 250 |
| lift-03 | 250 |
| **total** | **2,061** |

Worse than absence, in `lift-01` the scale was misread. The DESIGN's table says band 1 means
"Core, every learner has it by A2 — appears only as *frame vocabulary* inside contexts",
tail: **"never carded"**. `lift-01` assigns band 1 to **135 B1 entries** including
`achievement`, `analyse`, `assignment`, `captain` and `coal`. If the runtime honours the
table, a third of the first lift block never enters the SRS queue at all — the opposite of
what a band-7 lift deck is for.

The scale is also applied inconsistently between blocks, which shows it was judged relative
to each block rather than absolutely:

| block | bands used |
|---|---|
| lift-01 | 1, 2 only |
| lift-04 · lift-05 | 2, 3 only |
| lift-02 · lift-03 | none |
| phrase-01 | 1–4 |
| phrase-02 | 1–5 |
| phrase-03 | 2–4 |

**Fix:** the whole lift tier is B1–B2 target vocabulary, so bands 2–4 with band 1 reserved
for genuine A2 frame words. `lift-01`'s 135 band-1 rows should be band 2 or 3.

### B5 — `contexts` is absent on 1,560 of the 1,561 foundation entries

§3.2 calls `contexts` "REQ, ≥ 3. THE FIELD THAT MAKES §1.5 WORK." §1.5 is the rule that picks
the next item by biasing toward the register the learner has been using; §5 requires "≥ 3
contexts per vocabulary entry, spread across registers".

| block | 0 contexts | 2 contexts | 3 contexts |
|---|---:|---:|---:|
| core-01 | 389 | 1 | 0 |
| core-02 | 390 | 0 | 0 |
| core-03 | 391 | 0 | 0 |
| core-04 | 390 | 0 | 0 |
| lift-02 | 0 | 249 | 1 |
| phrase-03 | 0 | 250 | 55 |
| lift-01 · lift-03 · lift-04 · lift-05 · phrase-01 · phrase-02 | 0 | 0 | 1,614 |

So 1,560 entries have no contexts at all and a further 500 have two instead of three. Every
foundation entry — the entire tier aimed at the beginner this work exists for — will fall
back to the single `own_context_sentence` for cloze, and the register-bias rule has nothing
to select on. `lift-02` additionally omits `unique_answer` on all 501 of its contexts, and
88 contexts across `core-01`, `lift-01` and `phrase-03` have a null or missing `gap_span`,
which is the cloze blank itself.

### B6 — 1,501 topic tags fall outside the closed set the app filters on

`sidecar/bandready/server/routes/vocab.py:57` defines `TOPIC_TAGS` as a closed 20-value
tuple, and the bank listing filters with
`VocabEntry.topic_tags_json.like(f'%"{topic}"%')` (line 619). A tag outside that tuple is not
rejected on the way in from a pack file — it is simply never matched by any filter, so the
entry becomes invisible to topic browsing without anything failing loudly.

The batch uses **32 tag values that are not in the set, across 1,501 uses**:

| tag | uses | tag | uses | tag | uses |
|---|---:|---|---:|---|---:|
| work | 299 | tourism | 41 | communication | 14 |
| society | 259 | general | 40 | feelings | 13 |
| economy | 186 | travel | 32 | art | 12 |
| science | 114 | money | 32 | cities | 7 |
| culture | 79 | food | 31 | personal qualities | 4 |
| media | 61 | urbanisation | 31 | animals | 4 |
| family | 55 | sport | 30 | language | 4 |
| housing | 54 | city | 20 | + 9 more | 12 |
| crime | 47 | politics | 15 | | |

Most are the correct concept under the wrong name: `work` → `work-careers`, `society` →
`government-society`, `economy`/`money` → `money-economy`, `science` → `science-research`,
`family` → `family-relationships`, `travel`/`tourism` → `travel-tourism`,
`housing`/`urbanisation`/`city`/`cities` → `urbanisation-housing`, `crime` → `crime-law`,
`food` → `food-diet`, `sport` → `sport-fitness`, `media` → `media-advertising`, `culture`/
`art` → `art-culture`, `communication`/`language` → `language-communication`, `animals` →
`nature-animals`. `general`, `feelings`, `personal qualities`, `daily life`, `leisure`,
`shopping`, `history`, `geography`, `architecture`, `festivals` have no home and should be
dropped rather than invented.

By block: `phrase-02` and `phrase-03` used the correct closed set throughout and have zero
off-vocabulary tags. `lift-02` (329 uses, 24 distinct) and `phrase-01` (514 uses) are the
worst. The 1,246 shipped entries use only the 20 legal values, so this batch would be the
first to break the convention.

---

## SHOULD-FIX

### S1 — 56 `contexts[]` entries are grammar notes, not example sentences; 40 fail the gap-span gate

`phrase-02` systematically spends its third context on a metalinguistic note instead of a
third usage example. 53 of the 56 are in that one block.

| id | c3 `text` | c3 `gap_span` |
|---|---|---|
| `vocab_ox_get_in_touch` | "'Touch' has no article here, and 'in' never becomes 'into'." | `in touch` |
| `vocab_ox_have_fun` | "'Funny' means amusing or strange, and is not the adjective for 'enjoyable'." | `funny` |
| `vocab_ox_have_got_to` | "There is no past form: yesterday I had to leave early, not 'had got to'." | `had to` |
| `vocab_ox_in_addition` | "It must be followed by a full clause: not 'in addition the cost'." | `In addition` |
| `vocab_ox_in_practice` | "The British spelling of the verb is 'practise' with an s; the noun keeps the c." | `practice` |

Two separate problems. First, a context is the cloze source: served as an exercise, the
learner is asked to fill a blank in a sentence *about* English rather than a sentence *in*
English. Second, in **40** of these the `gap_span` is not a substring of the `text` at all —
`"in touch"` does not appear in "'Touch' has no article here…". `merge_grammar.py:531`
raises exactly this as a hard `problems` entry:

```
vocab {id}: gap_span {gap!r} is not a substring of its own context
```

so if the oxford merge reuses that gate, these 40 stop the merge before anything is written.
The content of the notes is good — it belongs in `avoid` or `confusables`, both of which
these entries already carry.

### S2 — two IPA conventions inside one batch

255 entries write the non-rhotic linking r as `(r)` — `ˈæktə(r)`, `bɪˈfɔː(r)` — and the rest
write a bare vowel. The split is by block, not by word:

| convention | blocks |
|---|---|
| uses `(r)` | core-01 (38), core-02 (48), core-03 (54), lift-01 (17), lift-02 (21), lift-03 (29), lift-04 (22), lift-05 (26) |
| never uses `(r)` | **core-04** (0 of 390), phrase-01, phrase-02, phrase-03 |

So `core-03`'s `number` is `/ˈnʌmbə(r)/` while `core-04`'s `winter` is `/ˈwɪntə/`, and 48
core-04 entries — `teacher`, `water`, `weather`, `writer`, `year`, `your`, `temperature`,
`sure`, `there`, `their` — drop a notation their neighbours keep. The 1,246 shipped entries
use no `(r)` at all, so the majority convention here is also the minority convention in the
pack. Pick one. If the choice is to keep `(r)`, core-04 and the three phrase blocks need it
added; if to drop it, 255 entries need it stripped.

### S3 — `avoid` and `confusables` coverage collapses in core-04

| block | `avoid` | `confusables` | of |
|---|---:|---:|---:|
| core-01 | 390 | 122 | 390 |
| core-02 | 390 | 95 | 390 |
| core-03 | 391 | 136 | 391 |
| **core-04** | **80** | **69** | **390** |
| lift-* , phrase-* | 100% | 100% | 2,169 |

`core-04` carries `avoid` on 80 of 390 rows where its three sibling blocks carry it on all
of theirs. Since `avoid` is where the L1-interference warnings live, and the four core blocks
are alphabetical slices of one list, the learner gets error warnings for words starting
a–r and mostly not for s–z.

Separately, 48 `avoid` strings exceed the §3.2 limit of 25 words, 19 of them in `phrase-03`.

### S4 — 43 `grammar_links` name grammar points that do not exist

19 distinct ids across the batch resolve against nothing in `data/grammar.jsonl` (156
points). The most-referenced: `gr_verb_patterns` ×10, `gr_verb_preposition` ×6,
`gr_state_verbs` ×4, `gr_adjective_preposition` ×4, `gr_gerund_after_preposition` ×2,
`gr_linking_adverbs` ×2, `gr_adverbs_of_frequency` ×2, `gr_spelling_doubling` ×2. The merge
treats unresolved links as a warning, not a problem, and the links are inert until those
points are authored — so this is a note, not a stop. Worth recording because the names are
plausible enough that nobody would notice them failing silently.

### S5 — two extraction artefacts are being shipped as cards

Both are on the worklists, so keeping them is the correct call under the authoring contract,
but neither should reach a learner.

1. `phrase-03` / `vocab_ox_verbs__compounds__collocations__prepositional_phrases_and_other_common_fixed_phrases_`
   — headword *"verbs, compounds, collocations, prepositional phrases and other common fixed
   phrases."*, a fragment of the Oxford Phrase List's own front matter. The author handled
   this honestly: `ipa` is `null`, and the definition opens "Not a phrase to learn… kept here
   only so that the block matches its worklist exactly", with an `avoid` telling an editor to
   remove it. That is the right behaviour and I am flagging it only so the editor actually
   does. Its id is also the one id in the batch over 80 characters (94).
2. `phrase-02` / `vocab_ox_might_happen_` — headword `"might happen."` with a trailing full
   stop carried through from the extraction. Unlike the case above this one is *not* flagged;
   it is authored as a normal entry and will render to the learner with the stop attached.
   The entry itself is fine — strip the `.` from `lemma` and `headword`.

---

## ACCURACY

I read 110 entries in full across all twelve blocks (10 from core-01, 10 core-02, 8 core-03,
8 core-04, 7 from each lift block, 10 from each phrase block, plus 34 targeted confusable
pairs), and separately verified 71 transcriptions chosen because they are the ones most
likely to be invented: silent letters, reduced syllables, `-ure`/`-ary`/`-ery` endings,
British-vs-American splits, and heteronyms whose stress moves with part of speech.

**IPA: zero errors.** This is the field the brief warned about and it is the field that holds
up best. Every heteronym is stressed correctly for its declared `pos` — noun `ˈkɒnflɪkt`,
`ˈkɒntrækt`, `ˈɒbdʒɪkt`, `ˈprəʊɡres`, `ˈprəʊtest`, `ˈrekɔːd`, `ˈdezət`, `ˈpreznt`,
`ˈsʌbdʒɪkt` against verb `ɪnˈkriːs`, `dɪˈkriːs`, `prəˈdjuːs`, `pəˈmɪt`, `səˈspekt`. British
forms are used consistently where they differ: `ˈʃedjuːl`, `ədˈvɜːtɪsmənt`, `ˈkætəɡəri`,
`ˈmedsn`, `ˈsekrətri`, `ˈviːəkl`, `ˈrestrɒnt`, `ˈtemprəri`. The silent-letter set is right:
`ˈaɪlənd`, `klaɪm`, `niː`, `naɪf`, `ˈnɒlɪdʒ`, `ˈɒnɪst`, `ˈaʊə(r)`, `rɪˈsiːt`, `ræp`,
`ˈbɪznəs`, `ˈberi`. Voicing is right where it distinguishes a pair: `use` verb `/juːz/`,
`advice /ədˈvaɪs/` against `advise /ədˈvaɪz/`, `loose /luːs/` against `lose /luːz/`. There is
exactly one `null` IPA in the batch, on the front-matter artefact in S5 — which is the
correct answer there.

**Confusable pairs: zero errors.** I checked all 34 present in the batch — affect/effect,
imply/infer, practice/practise, principle/principal, lie/lay, rise/raise, borrow/lend,
bring/take, teach/learn, among/between, amount/number, historic/historical,
classic/classical, continual/continuous, economic/economical, ensure/insure/assure,
loose/lose, sensible/sensitive, further/farther, accept/except. Every one states the
distinction correctly and in the right direction, including the two that are usually got
backwards ("The speaker implies; the listener infers"; "Raise needs an object").

**Content errors found — eleven, all correctable:**

| file | headword | problem | correction |
|---|---|---|---|
| core-01 | `boring` | `own_context_sentence` is incoherent: *"The lecture was interesting, but the room was so hot it felt boring."* A lecture that is interesting does not become boring because the room is hot; the two clauses contradict. | Replace, e.g. *"The lecture was well organised, but the speaker read every word from his notes and it soon became boring."* |
| core-01 | `develop` | `avoid` reads *"No double p in the base form: develop, but developed and developing."* — `developed` and `developing` have no double p either, so the sentence asserts a contrast that does not exist and implies the wrong spelling. | *"Do not double the p: developed and developing, never 'developped'."* |
| core-01 | `cry` | `burst into tears` is listed as a collocation of `cry`. It is a synonymous idiom, not a collocation — it does not contain the headword. | Replace with `cry over sth` or `make sb cry`. |
| core-04 | `temperature` | `/ˈtemprətʃə/` — correct in itself, but it is one of the 48 core-04 entries missing the `(r)` its sibling blocks use. See S2. | `/ˈtemprətʃə(r)/` if the `(r)` convention is kept. |
| lift-04 | `pin` | Second example is *"I've forgotten the PIN for my card."* PIN is an unrelated acronym; it does not illustrate the authored definition ("a short thin piece of metal with a sharp point"). The `avoid` note then discusses "PIN number", compounding it. | Replace the example, e.g. *"She used a pin to hold the pattern to the fabric."* Move the PIN material to `confusables`. |
| lift-04 | `pin` | `word_family: ["pin up", "pinned"]` — `pinned` is an inflection, `pin up` a phrasal verb. Neither is a derivational family member. | `["pin (noun)", "pinboard"]`, in object form per B3. |
| lift-04 | `ours` | `word_family: ["we", "our", "us"]` — inflectional forms of one pronoun, not a word family. | Drop, or reframe as a `confusables` entry against `our`. |
| lift-05 | `struggle` | `word_family: ["struggle (noun)"]` — the part of speech is written inside the string because the object form with its `pos` slot was not used. | `[{"form": "struggle", "pos": "noun"}]`. |
| phrase-02 | `get back` | Definition covers only *"to return to the place you came from"*, but the second example is *"I will get back to you as soon as I have spoken to the office"* — the reply sense, which the definition does not license. A learner reading both concludes `get back to sb` means physically returning to a person. | Either extend the definition to name the reply sense, or replace the example. |
| phrase-02 | `might happen.` | Trailing full stop in `headword` and `lemma`, an extraction artefact. See S5. | Strip the `.`. |
| phrase-03 | `verbs, compounds, …` | Not a headword. Flagged honestly by the author; needs an editor decision. See S5. | Remove at editorial review. |

Eleven defects in 3,730 entries is a low rate, and none of them is the kind of error the
brief was most worried about — a wrong definition or an invented IPA that a learner would
reproduce in an exam. The `boring` sentence and the `develop` note are the two I would fix
before anything else in this section, because both are actively misleading rather than merely
imprecise.

---

## THE A1 TEST

This is the section where the deck misses its own purpose, and it is a content problem rather
than a schema one, so I have kept it out of the blocking list — but it matters more than
several of the blockers.

I tested all **794 A1 foundation entries**, not a sample of 20, by checking every word in
each definition against two lists: the foundation worklist itself (the words a learner at
this level is being taught) and the lift worklists (the words this pack classifies as B1/B2 —
i.e. material the foundation learner has explicitly not met yet).

**187 of 794 A1 definitions — 23.6% — define an A1 word using a word this pack itself labels
B1 or B2.** After discounting participial false positives (`written`, `spoken`, `living`,
`being`, which are forms of A1 verbs), 106 distinct defining words are involved. The pattern
is systematic, not scattered — a small set of "dictionary-register" words is doing the work:

| defining word | level | A1 entries it gates | examples |
|---|---|---:|---|
| `cloth` | B1 | 8 | coat, dress, hat, jeans, shirt, skirt, sweater, trousers |
| `container` | B1 | 7 | bag, bath, bottle, box, cup, dish, glass |
| `pleasant` | B1 | 7 | beautiful, cool, friendly, good, music, nice, warm |
| `liquid` | B1 | 7 | bottle, cream, drink, juice, milk, soup, water |
| `surface` | B1 | 6 | floor, land, off, on, paint, road |
| `official` | B1 | 5 | exam, form, passport, police, rule |
| `lower` | B2 | 4 | below, down, downstairs, fall |
| `solid` | B1 | 4 | cheese, hard, ice, land |
| `opening` | B2 | 4 | cut, key, mouth, window |
| `effort` | B1 | 4 | easy, sport, try, work |
| `equal` | B1 | 4 | kilometre, metre, mile, quarter |
| `occasion` | B1 | 4 | meeting, often, sometimes, time |
| `fur` | B1 | 3 | cat, lion, mouse |
| `measure` / `length` | B1 | 3 each | kilometre, test, time / metre, period, short |

The worst individual cases, where the defining word is B2 and the headword A1:

- `sit` → *"to rest with your body **upright** and your weight on your bottom"*
- `eat` → *"to put food in your mouth and **swallow** it"*; `drink` → *"to take **liquid** into your mouth and **swallow** it"*
- `salt` → *"a white **substance** used to give food more taste"*; `sugar`, same word
- `bored` / `boring` → *"tired and **impatient**"*
- `mountain` → *"a very high hill with **steep** sides"*
- `salad` → *"a cold dish of **raw** vegetables"*
- `bird` → *"an animal with wings and **feathers**"*
- `banana` → *"a long **curved** yellow fruit"*
- `card` → *"a small piece of **stiff** paper"*
- `bill` → *"a piece of paper showing how much money you **owe**"*
- `dangerous` → *"likely to hurt or **harm** someone"*
- `plan` → *"something you have decided to do, worked out in **advance**"*

The author was aware of the problem in at least one place — `elephant` is defined as *"a very
large grey animal with a long nose called a trunk"*, glossing `trunk` inline rather than
assuming it. That technique, applied to the fourteen words in the table above, would fix most
of the 187. The rest need a plainer paraphrase: `container` → "a thing you keep things in";
`liquid` → "something you can pour, like water"; `cloth` → "the material clothes are made
of"; `pleasant` → "nice"; `upright` → "with your back straight".

Nothing here breaks. But the stated reason this deck exists is that "somebody who arrives
knowing almost nothing must have a path", and a beginner who does not know `container` cannot
read the definition of `bag`, `box`, `bottle`, `cup`, `dish`, `glass` or `bath`. One in four
A1 definitions currently requires vocabulary the same pack schedules for later.

---

## REGISTER

I checked 25 phrase entries chosen adversarially — I searched for the colloquialisms that
would be defects if marked `both`, rather than sampling at random.

**This section passes, and it is the strongest work in the batch.** Every spoken-only idiom I
looked for is marked `spoken`, and the `avoid` line names the exam consequence rather than
just labelling the register:

| headword | register | `avoid` |
|---|---|---|
| `at the end of the day` | spoken | "A spoken idiom and heavily overused. Keep it out of Task 2 and write 'ultimately'." |
| `loads of sb/sth` | spoken | "Never use it in Task 1 or Task 2. In Speaking it is fine and even natural." |
| `no way` | spoken | "Never write 'no way' in Task 1 or Task 2." |
| `or something` | spoken | "Keep it out of writing altogether." |
| `pretty much` | spoken | "Do not write it in the exam essay. Use 'almost', 'largely' or 'more or less'." |
| `hang on` | spoken | "Do not use it in Writing… in Task 1 letters 'please wait' is correct." |
| `a bit` / `a bit more` / `a bit of a…` | spoken | "Too informal for Task 2. Write 'slightly' or 'somewhat'." |
| `a lot of sth` | spoken | "Acceptable in Speaking, weak in Task 2." |
| `they say…` | spoken | "An unnamed 'they' is exactly the vague attribution examiners penalise." |
| `How are you?` / `What about…?` / `How long…?` | spoken | greeting/question frames, correctly confined |

The entries marked `both` are marked `both` correctly — `at least`, `in fact`, `of course`,
`after all`, `and so on`, `take care of`, `kind of sb/sth` — and where the tag is arguable the
`avoid` line does the work anyway: `a couple of sth` is `both` but warns "Fairly informal. If
the chart gives you the figure, write 'two'"; `and so on` is `both` but warns "Weak in Task 2.
An examiner cannot credit examples you did not give."

Batch-wide: 259 entries `spoken`, 782 `written`, 2,689 `both`. I found **no** idiom marked
`both` that an examiner would refuse in Task 2.

One note, not a defect: 1,850 `contexts[].register` values are `academic`, which is outside
the three-value set used at entry level. §3.2 permits `spoken | written | both | academic`,
so this is legal — I checked before flagging it.

---

## What has to happen before this merges

1. **B1** — author the 19 months and weekdays into core-01…core-04.
2. **B2** — convert `chunk` from string to object on 919 phrase entries.
3. **B3** — convert `word_family` from strings to objects on 514 entries.
4. **B4** — add `frequency_band` to 2,061 entries; re-band `lift-01`'s 135 band-1 rows.
5. **B5** — author 3 contexts for 1,560 foundation entries; top up `lift-02` and `phrase-03`
   from 2 to 3; add the 88 missing `gap_span`s and `lift-02`'s 501 missing `unique_answer`s.
6. **B6** — remap 1,501 topic tags onto the 20-value `TOPIC_TAGS` set.

Then S1 (the 40 gap-span failures will otherwise stop the merge outright), then S2 and S3,
then the eleven accuracy corrections, then the A1 defining-vocabulary pass.

B1, B2, B3, B4 and B6 are all mechanical — the information needed is already in the files or
in the worklists. B5 is the only one that is genuine authoring work, and it is 1,560 entries
of it.
