# R3 — Bands and Errors: how IELTS-style Speaking is actually marked

Research briefing for BandReady speaking-content authors.
Compiled 2026-07-27. Consumers: the per-topic teaching-note authoring agents, the coach persona
prompts, and the feedback/report copy in `docs/plan/04-speaking-module.md` §6.

> **Copyright note for anyone reading or extending this file.** Everything below is either (a) a
> statement of fact about how the test works, (b) our own paraphrase of publicly published band
> descriptors, or (c) original teaching material authored for BandReady. No descriptor sentence,
> no past-paper question, and no third-party model answer is reproduced. If you extend this file,
> keep that rule. The band tables below are *our wording of the criteria*, not the descriptors.
> Our product copy says "IELTS-style" and carries the non-affiliation notice.

---

## 0. TL;DR for authors — the ten things worth teaching

If a teaching note only has room for one point, it should come from this list.

1. **Hesitate for ideas, not for words.** Where the pause falls is the single clearest 6/7 signal.
2. **Answer, then extend with a reason and an example.** Two-move minimum on every Part 1 answer.
3. **Precision beats size in vocabulary.** One exactly-right common word outranks one wrong rare word.
4. **Collocation is the vocabulary skill actually being marked** — `heavy traffic`, `make a decision`,
   `a strong accent`, `run a business`. Wrong partner words cost marks even when every word is known.
5. **Complex grammar means dependent clauses, not long sentences.** `which`, `although`, `whereas`,
   `if`, `because`, `so that`, `-ing` clauses.
6. **Errors that persist under pressure are the ones that cap you.** Fix a small number of
   high-frequency patterns (articles, third-person -s, past tense on narrative verbs) to
   automaticity rather than learning ten new tenses.
7. **Word stress and sentence stress do more for clarity than individual sounds.**
8. **Don't memorise answers.** Rehearsed speech is detectable and is marked as what it is — a
   failure to produce spontaneous language.
9. **Don't speak fast.** Fluency is *continuity*, not speed. Rushing hurts pronunciation and coherence.
10. **Paraphrase around a word you don't have; never stop dead.** The recovery move is itself scored.

---

## 1. The marking mechanics (facts, freely usable)

- Four criteria, **equally weighted**: Fluency & Coherence (FC), Lexical Resource (LR),
  Grammatical Range & Accuracy (GRA), Pronunciation (PRON).
- Each criterion is awarded a **whole band, 0–9**. The Speaking sub-score is the mean of the four,
  reported in whole or half bands. (Our `round_ielts()` helper already implements the ties-up rule.)
- **The same descriptors apply to Academic and General Training.** There is no separate speaking test.
- Assessment covers the **whole test**, all three parts together — not a score per part. Our Full
  Mock report correctly awards one score set with per-part evidence.
- The examiner **never teaches, corrects, praises or gives feedback during the test**. Silence or a
  neutral face is not a verdict. (Worth saying explicitly in learner-facing copy: candidates
  routinely misread examiner neutrality as disapproval and it degrades their performance.)
- **Accent is not penalised.** Only the effect of pronunciation on how easily a listener follows you.
- **Content is not marked.** Opinions, factual truth, how interesting your story is — none of it
  scores. Only the language does. Invented answers are permitted and are not "cheating"; they just
  don't earn anything by being impressive.
- Two descriptor documents exist: a **public version** (what we and every learner can see) and a
  more granular internal version used in examiner training and standardisation. Claims circulating
  online about the internal version's exact wording are unverifiable — we do not repeat them, and
  no BandReady copy should imply we know them.

**Interaction with our scoring pipeline.** Because FC and PRON are judged on delivery, the
transcript alone under-determines them — this is exactly why `04-speaking-module.md` §6.3 forces
the evaluator to reconcile FC against measured fluency metrics and to base PRON on the
pronunciation signals. Teaching notes should mirror that split: FC/PRON advice must be about
*behaviour in the moment*; LR/GRA advice can be about *what to prepare beforehand*.

---

## 2. The four criteria, bands 5→8, in our own words

Paraphrased from the publicly published band descriptors. These are for authors' calibration and
for learner-facing "what does this band mean" copy. Deliberately behavioural — written so an author
can turn a row directly into a teaching note.

### 2.1 Fluency & Coherence — can you keep going, and can I follow you?

| Band | What it looks and sounds like |
|---|---|
| **5** | Speech keeps moving, but only because the speaker repeats themselves, restarts, or slows right down to buy time. Genuinely smooth stretches happen only when the language is simple; as soon as the idea gets harder the flow breaks. The same two or three linkers (`and`, `but`, `because`, `so`) carry every connection, and they get used where they don't quite fit. |
| **6** | Clearly willing to talk at length, and does. But the thread is dropped from time to time — a repetition here, a restart there, a pause while the right form is hunted down. A wider set of linkers is available, and some of them land in the wrong place. The listener follows, with occasional effort. |
| **7** | Keeps going for as long as needed without visible strain and without losing the thread. Hesitation still happens and is sometimes language-driven, but it is occasional and doesn't derail the answer. Repetition and self-correction appear but are small and quickly absorbed. Linkers and discourse markers are varied and used with some choice rather than by reflex. |
| **8** | Talks at length easily; repetition and self-correction are rare, and pauses are almost always the speaker deciding *what* to say next, not *how*. Topics are opened, developed and closed in a logical shape without being told to. |

### 2.2 Lexical Resource — do you have the right words, and are they the right words?

| Band | What it looks and sounds like |
|---|---|
| **5** | Can talk about familiar things, and can attempt unfamiliar ones, but with little room to manoeuvre — the same word is used for several different jobs. Paraphrase is attempted when a word is missing, and works maybe half the time. |
| **6** | Has enough vocabulary to keep a topic going at length and to make the point clearly, even though some word choices are off. Paraphrase generally works: when a word is missing, the speaker gets round it and the listener understands. |
| **7** | Moves flexibly across topics rather than pushing everything through one register. Reaches for less common items and some idiomatic usage, and shows an ear for which word belongs in which situation and which words go together — with some choices still landing wrong. Paraphrase is effective and unobtrusive. |
| **8** | A wide vocabulary used readily and precisely: the word chosen carries a specific shade of meaning rather than a general one. Idiom and less common items are used skilfully, with only occasional inaccuracy. Paraphrase works whenever it's needed. |

### 2.3 Grammatical Range & Accuracy — how much structure can you use, and how much of it survives?

| Band | What it looks and sounds like |
|---|---|
| **5** | Basic sentence patterns come out reasonably accurately. More complex structures are attempted, but they usually go wrong, and sometimes badly enough that the listener has to work out what was meant. |
| **6** | Simple and complex forms are both present, but the complex ones are a small fixed set used the same way each time. Mistakes inside complex sentences are frequent; they usually don't stop the message getting through. |
| **7** | A range of complex structures, used with some flexibility — the same idea can be built more than one way. Whole error-free sentences occur often, though a residue of errors persists throughout. |
| **8** | A wide range of structures used naturally; most sentences come out clean, with occasional slips or slightly unnatural choices rather than systematic errors. |

### 2.4 Pronunciation — how much work is the listener doing?

| Band | What it looks and sounds like |
|---|---|
| **5** | Some effective features are there — a correct stress pattern, a bit of intonation — but they aren't sustained across the answer. Mispronounced words make the listener stop and re-parse now and then. |
| **6** | A range of pronunciation features is present but control over them is uneven. Understandable throughout, though individual words or sounds come out wrong often enough to blur clarity in places. |
| **7** | Everything band 6 does well, plus real stretches of band-8 control. Lapses happen but rarely cost the listener the meaning. |
| **8** | A wide range of features used flexibly and to purpose — stress placed for emphasis, intonation carrying attitude, phrasing grouped into sensible chunks. Easy to understand throughout; a first-language accent barely registers as an obstacle. |

**Structural quirk worth knowing (bands 5 and 7 in PRON and GRA/LR):** the published scale defines
band 7 partly as *"all the good things at 6, plus some but not all of the good things at 8"*, and
band 5 the same way relative to 4 and 6. Practical consequence for teaching: **band 7
pronunciation is not "no more errors" — it is "band 6 plus intermittent band 8 stretches."** A
learner does not need flawless pronunciation to reach 7; they need visible, repeated evidence of
higher-level control. That reframing alone unsticks a lot of candidates and should appear in our
PRON teaching notes.

---

## 3. What a band 7 actually *does* that a band 6 does not

This is the section authors should mine hardest. Each item is observable in a transcript or in an
audio signal, which means our report can point at it.

### 3.1 Where the hesitation falls (the highest-value single distinction)

- **Band 6 hesitation is language-driven**: the pause sits immediately *before* a content word or
  *inside* a verb phrase — `I went to… to… the, the place where they…`. The speaker is retrieving
  form.
- **Band 7 hesitation is idea-driven**: the pause sits at a *clause boundary*, before the speaker
  commits to a direction — `Honestly, I'd never thought about that. … I suppose the main reason is
  that…`. The language is available; the position is not yet decided.
- Teachable move: **make the thinking audible and grammatical.** `That's an interesting one — let
  me think.` then pause. A silent mid-phrase stall reads as a gap in the language; a framed pause
  reads as a gap in the thought. Same delay, different diagnosis.
- Our `initial_latency_ms`, `mean_pause_ms` and `long_pause_count` metrics are proxies for this;
  the position of the pause relative to clause boundaries is the thing the *report* should
  comment on.

### 3.2 Self-correction pattern

- Band 6: corrections are **frequent, backwards, and destructive** — the speaker restarts the whole
  clause, loses the original thread, and sometimes replaces a correct form with a wrong one.
  `They was— they were— people was going…`
- Band 7: corrections are **rare, forward-moving, and repaired inside the same breath** —
  `it cost, sorry, it *costs* about…` and the sentence continues.
- Teachable rule: **repair only when the error changes the meaning; otherwise keep moving.** A
  small uncorrected slip costs a little in GRA. A stall-and-restart costs in FC *and* usually leaves
  the error in anyway. (This is coaching consensus rather than published policy — see §9.)

### 3.3 Answer architecture

- Band 6 Part 1 answer: one move. `Yes, I like cooking. It's fun.` Then stops and waits.
- Band 7 Part 1 answer: two or three moves — **claim → reason → concrete detail**, then stop
  cleanly. `Yes, quite a lot — mainly because it's the one part of the day nobody needs anything
  from me. I usually cook something slow at the weekend, and it ends up being about an hour of
  quiet.`
- Band 6 Part 3 answer: one undifferentiated block of opinion.
- Band 7 Part 3 answer: **signposted and dimensioned** — takes a position, names the dimension it's
  arguing on, concedes something, then closes. `I'd say it's mostly positive, at least
  economically. Socially it's more mixed, because…`
- Length calibration to teach explicitly: Part 1 ≈ 2–4 sentences, Part 2 the full 1–2 minutes,
  Part 3 ≈ 4–6 sentences with a visible shape. Band 6 is often *under*-length in Part 1 and
  *shapeless* in Part 3.

### 3.4 Dependent-clause range

Count the clause types a candidate actually produces. Band 6 typically has three live patterns:
`because`, `if` (first conditional), and `that`-clauses after `think`. Band 7 shows a visibly wider
inventory, used across topics:

| Function | Structure to teach | Model (original) |
|---|---|---|
| add non-essential info | non-defining relative `, which …` | `We moved to a smaller flat, which turned out to be the best decision we'd made.` |
| concede | `although` / `even though` / `while` | `Although it's cheaper, it takes almost twice as long.` |
| contrast two things | `whereas` | `My father reads on paper, whereas I've switched to a screen entirely.` |
| unreal present | second conditional | `If I had more space, I'd probably cook far more.` |
| regret / hindsight | third conditional | `If I'd known how competitive it was, I would have applied much earlier.` |
| purpose | `so that` / `in order to` | `They redesigned the junction so that cyclists didn't have to cross twice.` |
| time-anchored background | past perfect | `By the time we arrived, the exhibition had already closed.` |
| compressed sequence | `-ing` participle clause | `Having grown up near the coast, I take swimming completely for granted.` |
| hedged generalisation | `tend to` / `it depends on whether` | `People here tend to eat late, though it depends on whether they're working shifts.` |

**Teaching note pattern we should ship**: for each topic, one or two of these structures nominated
as the *natural* fit for that topic's questions (e.g. third conditional for "a decision you regret";
`whereas` for any past-vs-present comparison; second conditional for every "would you…" question).
Grammar taught in the topic where it belongs is grammar that survives test conditions.

### 3.5 Vocabulary: less common items *with correct partners*

- The band 7 signal is **not rare words**. It is (a) a topic-specific item used correctly and
  (b) a natural collocation the speaker clearly didn't assemble word-by-word.
- Band 6 failure mode: right meaning, wrong partner — `do a decision`, `very much traffic`,
  `strong rain`, `open the light`, `I have interest on music`. Every word is known; the combination
  isn't.
- Band 6 failure mode #2: a memorised "advanced" word dropped into a slot it doesn't fit —
  `plethora`, `myriad`, `detrimental` used as a general intensifier. This **lowers** LR, because the
  descriptor at 7+ rewards awareness of style and collocation, and a register mismatch is evidence
  of the opposite.
- Band 7 texture is mostly **mid-frequency precision plus phrasal/idiomatic ease**: `it's grown on
  me`, `I'm not particularly fussy`, `it more or less doubled`, `a fair few`, `to be honest with
  you`, `that's a tough one to call`. Conversational idiom, used where a conversation would use it.
- **Rule for our teaching notes: teach collocations and chunks, not single words.** Every vocabulary
  item we surface should be shipped with its natural partners and a model sentence. Our
  `vocab_to_bank` schema already supports `type: "collocation"` — authors should prefer it.
- Risk calibration to teach: reach for a phrase you're reasonably (not completely) sure of. Chronic
  simplification is a systematic penalty; an occasional misfire is not. Retreating to safe language
  is what keeps people at 6.

### 3.6 Discourse markers used with choice, not reflex

- Band 6 marker set: `and`, `but`, `so`, `because`, `also`, `for example`, plus one or two
  written-register imports used aloud (`Moreover`, `Firstly… Secondly… In conclusion`) which sound
  wrong in speech and read as rehearsed.
- Band 7 spoken markers do a *job*, and the job varies:
  - **framing** — `The thing is…`, `What I'd say is…`, `To be fair…`
  - **conceding** — `Granted, …`, `I can see why people say that, but…`
  - **contrasting** — `Whereas…`, `Then again…`, `Having said that…`
  - **exemplifying** — `Take my hometown, for instance…`
  - **hedging** — `I'd imagine…`, `As far as I know…`, `More often than not…`
  - **closing** — `So on balance, …`, `Which is basically why…`
- Teachable: **one marker per function, learned to automaticity**, beats twenty markers half-known.
  And spoken markers, not essay markers.

### 3.7 Pronunciation control that's audible in an answer

- **Sentence stress used contrastively**: `I don't mind the *cost* — it's the *time* that puts me
  off.` Band 6 typically delivers this flat, and the contrast has to be inferred from the words alone.
- **Chunking**: grouping words into thought-groups with pauses at the joins, rather than pausing
  mid-phrase. Band 6 pauses land inside noun phrases (`the… main reason`); band 7 pauses land
  between them.
- **Intonation carrying attitude**: falling for a committed statement, rising-falling for
  reservation. Flat delivery over a whole long turn is the commonest 6-level PRON limiter and maps
  to our `intonation_flatness` signal.
- **Weak forms and linking**: `and` as /ən/, `to` as /tə/, `a lot of it` linked into one run. Their
  absence produces the syllable-by-syllable, slightly staccato delivery that costs PRON marks even
  when every individual sound is correct.

---

## 4. Why candidates plateau at 6.0–6.5, and the fix for each

Ordered by how often the cause shows up in examiner-side and teacher-side commentary. Each fix is
scoped to be actionable inside one week — that is our quality bar for teaching notes.

| # | The plateau cause | What it sounds like | The fix to teach |
|---|---|---|---|
| 1 | **Under-length, unextended answers in Part 1** | Correct, accurate, three words long. The candidate treats Part 1 as an interview to survive. | Drill the two-move habit: every answer = direct answer + one reason or example. Ban one-clause answers in Topic Drill mode. This costs nothing in accuracy and buys FC and LR range immediately. |
| 2 | **Fluent, but only in easy language** | Smooth on hometown and food; slows down and simplifies the moment Part 3 turns abstract. | Practise the *same* opinion across three registers of difficulty. Pre-load abstract framing language (`in the long run`, `at a policy level`, `for the average person`) so the abstract shift doesn't cost retrieval time. |
| 3 | **A small set of complex structures, reused** | Every complex sentence is `because` or `I think that`. | Structure-of-the-week: pick two from §3.4, force them into every practice answer for a week until they arrive unbidden. Range is what's being marked, so three reliable new patterns move GRA more than fifty new words move LR. |
| 4 | **Vocabulary is broad but imprecise** | Understandable but generic: `good`, `bad`, `very`, `things`, `people`. Word choices are "near enough". | Replace the top five vague words with three precise alternatives each, in collocation, per topic. `very tired` → `absolutely shattered`; `a big problem` → `a serious drawback`. Precision, not rarity. |
| 5 | **Forced "impressive" vocabulary** | Memorised academic words shoehorned in, wrong register, wrong collocates. Often *lowers* LR. | Rule: never use a word aloud that you haven't heard used by someone else in the same kind of sentence. Prefer natural spoken idiom over academic nouns. |
| 6 | **Persistent basic errors under pressure** | Third-person -s dropping, articles missing, past tense flattening to present mid-narrative. | Personal error list of *three* patterns max, drilled to automaticity via targeted re-speaking (our "say it better" flow is the right vehicle). Frequency of the *same* error matters more than variety of errors. |
| 7 | **Flat delivery / no use of stress and intonation** | Every sentence the same pitch and volume; the listener does the interpretive work. | Sentence-stress drill: take one sentence, say it four times stressing a different word, notice the meaning shift. Then apply to one prepared answer per day. Highest-leverage PRON fix that isn't about individual sounds. |
| 8 | **Memorised chunks and rehearsed answers** | Register jumps: conversational, then a suspiciously polished 20 seconds, then conversational again. | Kill the script. Practise the *ideas* and the *structures*, never the sentences. See §7. |
| 9 | **Part 2 collapses at 45 seconds** | Bullets rushed in 30s, then silence or filler. | Teach the prep minute as an *outline*, not a script: one keyword per bullet, and deliberately load the final bullet (the "explain why…" one) with the most material — it's the one that can absorb 40 seconds and it's where evaluative language lives. |
| 10 | **Written-essay English spoken aloud** | `Firstly… Moreover… In conclusion…` in a two-minute personal story. | Swap essay connectives for spoken ones (§3.6). Speech that sounds like writing reads as rehearsed and misses the natural-speech features 7+ requires. |
| 11 | **Retaking the test instead of changing the input** | Same score three times. | Say it plainly in our copy: a plateau is a language ceiling, not a technique ceiling. Half a band typically takes ~2–3 months of consistent work; a retake without changed practice reproduces the score. |
| 12 | **Never hearing themselves** | Candidate is unaware which words they mispronounce or how flat they sound. | Record, listen, transcribe one 90-second answer per week. This is the single highest-yield unsupervised activity, and it is exactly what our session recording + report replay affords. |

---

## 5. High-frequency error patterns to target

These are the patterns worth building explicit correction content around. For each: the trigger
context where it surfaces (so authors know which topics to attach it to), and the fix.

### 5.1 Grammar

| Pattern | Typical error (authored examples) | Where it surfaces | Fix to teach |
|---|---|---|---|
| **Tense consistency in narrative** | `So we go to the station and then it was closed, and I am so annoyed.` | Any Part 2 story card; "describe a time when…" | Choose the tense before speaking; anchor with a time phrase in the first sentence (`A couple of years ago…`) and stay in it. Drill: retell one story twice, once fully in past. |
| **Third-person -s** | `My brother work in a hospital. It take about an hour.` | Part 1 people/routine topics; present-tense generalisation in Part 3 | Highest-frequency, most-noticed slip. Drill in *description of habits* specifically, where the -s density is highest. |
| **Articles** | `I am student at university.` / `The nature is important.` / `I like the classical music.` | Everywhere; heaviest in abstract Part 3 nouns | Three rules only: (a) singular countable nouns need a determiner; (b) uncountable/plural generalisations take zero article (`Traffic is a problem`, not `The traffic is a problem` when speaking generally); (c) `the` for things already identified. Don't teach the full system. |
| **Plural / countability** | `many informations`, `a lot of advices`, `two furnitures`, `people is` | Education, work, media, money topics | Ship a short uncountable list per topic (`advice, research, equipment, traffic, accommodation, information, knowledge, feedback, homework, machinery`) plus the counter phrase (`a piece of advice`, `a lot of research`). |
| **Prepositions** | `depends of`, `discuss about`, `married with`, `interested on`, `arrive to`, `good in sports` | Every topic | Learn prepositions **inside the chunk**, never as a table: `depend on`, `discuss something`, `married to`, `keen on`, `arrive at/in`, `good at`. This is a collocation problem, not a grammar problem. |
| **Subject–verb agreement with distance** | `The number of cars are increasing.` `One of my friends live abroad.` | Part 3 trend statements | Teach the head-noun trick: find the noun the verb belongs to, ignore what sits between. `The number … is`, `One … lives`. |
| **Third conditional / hypothetical past** | `If I would know, I will go.` `If I didn't miss the train, I wasn't late.` | Regret, decisions, "a time you…" cue cards | Drill as a **fixed frame**, not as a rule: `If I'd + past participle, I would have + past participle`. Attach it to regret/decision topics where it's the natural thing to say. |
| **Word form** | `I want to success.` `It was very boring for me — I felt so bored… I mean boring.` `The different is…` | Everywhere | Teach word families in fours (`success / succeed / successful / successfully`), and the -ed/-ing adjective contrast explicitly — it's both frequent and meaning-changing. |
| **Modal / verb-pattern slips** | `I am agree with…`, `I can to say…`, `must to`, `enjoy to do` | Part 3 opinion turns | Frame-level fix: memorise the correct opinion openers (`I'd agree that…`, `I'm inclined to think…`) so the broken one never gets built. |
| **Question-form intrusion in statements** | `I don't know what is the reason.` `I'm not sure where does he live.` | Part 3 hedging | Teach the embedded-question order once: `what the reason is`, `where he lives`. Very visible to examiners, very fixable. |
| **Comparatives** | `more better`, `more cheaper`, `expensiver`, `same like` | Housing, transport, money, technology comparisons | One rule + the `the same as` / `similar to` pair. |
| **Countable-time / duration** | `I live here since five years.` | Part 1 hometown/work | `for` + duration, `since` + start point, with present perfect. Attach to hometown/work/study frames. |

**Prioritisation guidance for authors:** do not attach ten of these to one topic. Attach **two**,
chosen because the topic's questions naturally force them (past narration → tense consistency +
third conditional; trends in Part 3 → agreement-with-distance + articles with generalisations).

### 5.2 Pronunciation contrasts that most damage intelligibility

Evidence here is genuinely mixed (see §9), so this list is ordered by **consensus damage**, not by
one framework.

**Tier 1 — reliably damages understanding; teach first**

1. **Consonant cluster simplification or epenthesis** — dropping or inserting inside clusters
   (`street` → `est-reet` / `s-treet`, `asked` → `ask`, `texts` → `tex`). Strongly implicated in
   real intelligibility breakdowns.
2. **Final consonants dropped or devoiced** — `bag`/`back`, `hard`/`heart`, `need`/`neat`. Loses
   grammatical information as well as lexical (past-tense `-ed`, plural `-s`).
3. **/l/–/r/ and /v/–/w/–/b/ confusions** — minimal-pair collisions that produce real word
   substitutions (`collect`/`correct`, `vine`/`wine`/`bine`).
4. **/θ/, /ð/ realised in a way that collides with an existing word** — note carefully: substituting
   /t/ or /d/ or /s/ for `th` is extremely common and, on its own, is one of the *least* damaging
   substitutions in international-listener research. It costs less than teachers usually claim. Do
   not spend a learner's week on it.
5. **Word stress on the wrong syllable in a low-frequency word**, especially when combined with a
   segment error — the combination is what breaks the listener, more than stress alone.

**Tier 2 — costs marks under the pronunciation criterion even when meaning survives; teach second**

6. **Flat intonation across long turns** — the biggest single Part 2 pronunciation limiter.
7. **No sentence stress / equal stress on every word** — syllable-timed delivery of a stress-timed
   language. Especially relevant for L1s with syllable-timed rhythm; teach content-word stressing
   and function-word reduction as one package.
8. **No weak forms / no linking** — `a lot of it` said as three separate words.
9. **Chunking at the wrong places** — pausing inside a noun phrase.
10. **Vowel length contrasts** (`ship`/`sheep`, `full`/`fool`) — traditionally taught as critical;
    the research is genuinely split (§9). Teach it, but after Tiers 1 and the rhythm items.
11. **-ed endings** (/t/, /d/, /ɪd/) and **-s endings** (/s/, /z/, /ɪz/) — these matter doubly
    because they carry grammar. A dropped `-ed` reads to an examiner as a tense error *and* a
    pronunciation lapse.

**Framing for learner copy:** the goal is never "sound native". It is "the listener never has to
work". That is literally what the criterion measures.

---

## 6. Fluency strategies worth teaching

Each of these is a small, drillable move. They belong in teaching notes as *scripts the learner
owns*, not as lists to admire.

### 6.1 Buying time without sounding like you're buying time

- **Comment on the question, honestly**: `That's not something I've ever really thought about.` /
  `Hmm, tough one.` / `Let me think about that for a second.`
- **Echo-and-reframe** (also earns LR credit): restate the question in different words while your
  brain assembles the answer. Q about whether cities should limit cars → `Whether cities ought to
  cut down on private vehicles… I'd say yes, on balance.` Note: *reframe*, don't repeat verbatim —
  parroting the question back word-for-word is a well-known stalling tic and buys nothing lexically.
- **Narrow the question**: `It depends what kind of travel we're talking about — for commuting, I'd
  say…`. Buys time and produces a better-structured answer.
- **What to avoid**: strings of `um`, `you know`, `like`, `actually` used as ballast; and equally,
  a memorised stalling phrase deployed before *every* answer, which is just as detectable as a
  memorised answer. **Rotate two or three, don't run one on a loop.** (Our `filler_count` /
  `fillers_per_min` metrics let the report show this concretely.)

### 6.2 Paraphrasing round a word you don't have

Teach the four escape routes, in order of preference:

1. **Function** — `the thing you use to…` / `it's what you do when…`
2. **Category + distinguisher** — `a kind of tool that…` / `a sort of festival, but for children`
3. **Example instead of category** — `things like tram lines, cycle paths, that sort of thing`
4. **Approximate + flag it** — `I'm not sure of the exact word — the place where trains stop
   overnight?`

Critical framing for learners: **this is not damage control, it's a scored skill.** Successful
paraphrase is explicitly part of what separates band 6 from band 7 in Lexical Resource. Stopping
dead, switching to L1, or asking the examiner for the word all cost more than a clumsy successful
paraphrase.

### 6.3 Extending an answer without rambling

Teach named extension moves so a learner can *choose* one rather than trailing off:

| Move | Trigger phrase (originals) |
|---|---|
| Reason | `mainly because…`, `the main reason being…` |
| Example | `Take last winter, for instance…` |
| Contrast with the past | `It didn't use to be like that — ten years ago…` |
| Contrast with others | `A lot of people I know feel the opposite, actually.` |
| Consequence | `which means…`, `and the upshot is…` |
| Qualification | `though that's only really true in the cities.` |
| Personal angle | `Speaking for myself…` |

**Stop rule** (equally important, and rarely taught): finish on a closing move — `so yes, on the
whole I'd say I do` — then stop and let the examiner take the turn. Rambling until interrupted
costs coherence. Two extension moves, then close, is the reliable Part 1/Part 3 shape.

### 6.4 Signposting in Part 3

Part 3 answers are marked partly on whether the listener can see the structure coming. Teach four
spoken frames:

- **Position first, then support**: `Broadly, yes — for two reasons.` … `The first is…` … `And the
  other thing is…`
- **Two-sided then commit**: `There's a case both ways. On one hand… on the other… but if I had to
  pick, I'd go with…`
- **Concede then counter**: `I can see why people argue that. That said, …`
- **Time axis**: `It's already changed a lot — and I'd expect that to accelerate, because…`

Also teach the **honest non-answer**, which is a legitimate band-7 move: `I genuinely don't know
enough about that to say — but if I had to guess, …`. Candidates believe they must have an opinion
on everything; they don't. They must produce good *language* about not knowing.

### 6.5 Recovering from a false start

Teach one recovery script and drill it until it's automatic:

- **Abandon cleanly and re-launch**: `Sorry — let me start that again.` Then a fresh, simpler
  sentence.
- **Repair inline** (preferred for small slips): `…it cost, sorry, *costs* about ten pounds` and
  keep going.
- **Reframe instead of finishing a sentence that's gone wrong**: if you've built a clause you can't
  land, don't fight it — `…what I mean is, it's simply too expensive.`

Anti-pattern to name explicitly: rewinding to the start of the clause more than once. Two failed
restarts of the same sentence read as a language breakdown to any examiner. **Land any grammatical
sentence and move on.**

### 6.6 The Part 2 minute

- Notes = **keywords, not sentences**. Sentences get read aloud, and read-aloud speech loses
  fluency marks.
- Load the last bullet (the `and explain why…` one). It is where evaluative and hypothetical
  language naturally appears and it can absorb the back half of the long turn.
- If the topic doesn't fit your life, **adapt rather than invent from nothing** — a real memory
  bent to fit produces far better language than a fabricated one, because the detail is retrievable.
  Content isn't marked; retrievability is what matters.
- If you finish early, don't stop — return to the most interesting bullet and add a detail or a
  reflection. Being stopped at two minutes is the *intended* outcome, not a failure.

---

## 7. What candidates wrongly believe helps

Worth shipping as a short "myths" surface in the app — these beliefs actively cost bands.

| Belief | Reality | What to do instead |
|---|---|---|
| **"Memorise good answers for common topics."** | Rehearsed speech is detectable — register shifts, unnatural polish, an answer that doesn't quite match the question asked. Official IELTS guidance is explicit that examiners are trained to spot it and that it does the candidate no good; examiners can also simply take the conversation off-script. The language you memorised also cannot demonstrate the thing being marked, which is spontaneous production. | Prepare **ideas and structures**, not sentences. Know two or three developable examples per topic area, and the grammar frames you'll build them with. |
| **"Big words score higher."** | Rarity isn't the criterion; appropriacy and collocation are. A mis-collocated advanced word is evidence *against* style awareness and pulls LR down. Reported analyses suggest most Lexical Resource loss is unnatural word combination, not missing vocabulary. | Precision at mid-frequency, plus natural spoken idiom. Learn words with their partners. |
| **"Speak fast to sound fluent."** | Fluency is continuity and coherence, not rate. Speed degrades pronunciation, hides stress patterns, and produces more errors. Steady speech with well-placed pauses scores better. | Aim for an even, unhurried pace with pauses at clause boundaries. |
| **"You need a British or American accent."** | Accent is explicitly not penalised. Intelligibility is. | Work on stress, rhythm and clarity — not accent imitation. Faking an accent adds errors. |
| **"Long answers always score higher."** | Rambling costs coherence, and Part 1 over-answering wastes the examiner's question budget. | Full but shaped: 2–4 sentences in Part 1, 4–6 with structure in Part 3, and close deliberately. |
| **"Idioms are a shortcut to band 7."** | Official guidance warns against overuse and against idioms that don't fit the topic. Forced idioms read as memorised. | A few natural conversational phrases, used where a native conversation would use them. Zero is safer than five wrong ones. |
| **"I must have a strong opinion on every Part 3 question."** | Content is not marked. Hedging, admitting uncertainty and speculating are *high-level* language functions. | Learn hedging and speculation language; use it honestly. |
| **"Correct every mistake I notice."** | Frequent self-correction is itself a fluency penalty and often replaces a correct form with a wrong one. | Repair only meaning-changing errors; otherwise keep the flow. |
| **"The examiner's face tells me how I'm doing."** | Examiners are trained to be neutral and give no feedback during the test. | Ignore it entirely. Reading the examiner degrades performance. |
| **"Fabricating an impressive story helps."** | Official guidance says invented backstories don't raise the score. They usually *lower* it, because unfamiliar content is harder to talk about. | Use real, retrievable material, adapted to fit. |
| **"Retaking the test will nudge 6.5 to 7."** | A plateau is a language ceiling. Without changed practice, the score reproduces. | Change the input: targeted error work, structure range, recorded self-review. Budget months, not days. |
| **"Filler phrases from a list will fix my fluency."** | One stalling phrase on a loop is as detectable as a memorised answer, and heavy filler use signals retrieval difficulty. | Rotate two or three natural framing phrases; work on the underlying retrieval speed. |

---

## 8. How this should land in our content (recommendation to authoring agents)

`payload_json` is free-form, so teaching material can ride along without a migration. Suggested
per-card teaching fields — **proposal, not a decision**; the schema owner should confirm against
`sidecar/bandready/content/validate.py` before adoption:

- `teaching.target_structures[]` — 1–2 items from §3.4, chosen because *this topic forces them*.
- `teaching.error_watchlist[]` — 2 patterns from §5.1 with an authored wrong/right pair in this
  topic's context.
- `teaching.collocations[]` — 5–8 items, each `{chunk, model_sentence}`; prefer collocations over
  single words (feeds `vocab_to_bank` with `type: "collocation"`).
- `teaching.upgrade_pairs[]` — `{vague, precise}` for this topic (`a big problem` → `a serious
  drawback`).
- `teaching.band_move` — one sentence naming the specific 6→7 behaviour this card trains
  (from §3), so the coach persona can say something concrete after an answer.
- `teaching.pronunciation_focus` — one Tier-1 or Tier-2 item from §5.2 relevant to this topic's
  high-frequency words (e.g. `-ed` endings on any past-narrative cue card).
- `teaching.model_moves[]` — the extension/signposting moves from §6.3/§6.4 that fit this topic.

Constraints authors should honour:

- The **coach persona gives exactly one improvement per answer** (`coach.txt` in
  `docs/plan/04-speaking-module.md` §4.5). Teaching notes must therefore be *rankable*: mark which
  item is the highest-impact one for that card.
- Everything must be **originally authored**. Model sentences in this file are written for
  BandReady and may be reused; do not import model answers from elsewhere.
- Teaching content never appears during a Full Mock or Single Part session — the examiner persona
  is forbidden from teaching. It surfaces in Topic Drill coaching and in the report screen.

---

## 9. Where sources disagree (be honest about this in our copy)

1. **Word stress and intelligibility.** IELTS partner material and virtually all coaching material
   treat correct word stress as central to being understood. English-as-a-lingua-franca research
   (Jenkins' Lingua Franca Core and subsequent testing of it) reports that word-stress errors on
   their own rarely cause breakdowns between non-native interlocutors, and become damaging mainly
   when combined with a segment error. **Our resolution:** teach word stress, because the
   pronunciation criterion marks the *range and control of pronunciation features*, not
   intelligibility alone — but rank consonant clusters and final consonants above it when a learner
   has limited time.
2. **Vowel length contrasts.** The Lingua Franca Core treats long/short vowel distinction as core;
   at least one experimental study found removing that distinction did not make speech
   unintelligible to its listener group. Genuinely unsettled. We teach it, but not first.
3. **The `th` sounds.** ELF research consistently finds these among the *least* intelligibility-
   critical features; most classroom material treats them as a priority. We deprioritise them and
   say why.
4. **Penalties for memorised answers.** Official IELTS material states clearly that examiners are
   trained to identify memorised responses and that this does not help the candidate. Various
   coaching sites go further and assert specific mechanical penalties (e.g. "capped at 5 or 6", or
   "the examiner discards the answer"). **No published rule of that kind exists.** Our copy should
   say memorised answers are detectable and self-defeating; it must not invent a penalty table.
5. **Self-correction advice.** The published scale simply treats rare self-correction as a
   higher-band feature. The widely taught rule "only self-correct when meaning changes" is sensible
   coaching consensus, not published policy. We present it as a strategy.
6. **Filler-phrase lists.** Coaching material widely promotes memorised "gap fillers"; the same
   material elsewhere warns that memorised language is penalised. Both are true within limits —
   we present rotation and naturalness as the resolving principle.
7. **Error-frequency data.** The ranked ESL error studies available (subject–verb agreement > tense
   > noun/number > preposition > article) are largely drawn from **writing**, and often from
   tertiary-level academic writing. Spoken error profiles differ (articles and third-person `-s`
   are relatively more prominent under real-time pressure; punctuation-driven errors vanish).
   Treat the ordering in §5.1 as our informed judgement for *speech*, not as a citation of
   measured spoken frequencies.
8. **"2026 updates" blog posts.** Several commercial sites advertise updated descriptors. Nothing
   in the official public descriptor document supports a substantive change to the four criteria or
   their band-level content. We treat the criteria as stable and cite only the published version.

---

## 10. Sources

Official / test-partner sources (preferred, and weighted highest above):

- [SPEAKING: Band Descriptors (public version) — IELTS (Cambridge / British Council / IDP), PDF](https://idc.edu/IELTS-Speaking-Writing-Band-descriptors.pdf) — the published four-criterion scale, bands 0–9. Primary source for §2; paraphrased, never quoted.
- [Speaking Band Descriptors — British Council (takeielts) PDF](https://takeielts.britishcouncil.org/sites/default/files/ielts_speaking_band_descriptors.pdf) — same published scale, partner-hosted.
- [Comparing IELTS Speaking band scores: Band 6 vs Band 7 — IELTS Australia (IDP)](https://ielts.com.au/australia/about/news-and-articles/article-speaking-band-6-vs-band-7) — partner-authored 6-vs-7 comparison across all four criteria; backbone of §3.
- [The Difference Between a Band 6 and 7 on the IELTS — IDP IELTS Canada](https://ielts.idp.com/canada/prepare/article-difference-between-band-6-and-7-ielts)
- [Understanding the IELTS Speaking band descriptors — IDP IELTS](https://ielts.idp.com/prepare/article-understanding-the-ielts-speaking-band-descriptors) — criterion definitions; names articles, prepositions and subject–verb agreement as the common GRA problem areas.
- [Pronunciation skills: word stress, sentence stress and intonation — IDP IELTS](https://ielts.idp.com/prepare/article-pronunciation-skills-word-sentence-stress-intonation-ielts-speaking) — §5.2 Tier 2 and §3.7.
- [Mastering IELTS Speaking: Enhancing Fluency and Coherence — IDP IELTS](https://ielts.idp.com/prepare/article-ielts-speaking-fluency-and-coherence)
- [Don't overdo it: How to ace your IELTS Speaking test — ielts.org](https://ielts.org/news-and-insights/dont-overdo-it-how-to-ace-your-ielts-speaking-test) — official statement on memorised answers, fabricated stories, faked accents, over-agreeing. Primary source for §7.
- [How to use idioms in the IELTS Speaking test — ielts.org](https://ielts.org/news-and-insights/how-to-use-idioms-in-the-ielts-speaking-test) — official warning against overuse and topic-mismatched idioms.
- [Ten don'ts for the IELTS speaking test — British Council Voices](https://www.britishcouncil.org/voices-magazine/ten-donts-ielts-speaking-test) — referenced in search results; the page itself timed out on fetch, so nothing above rests on it alone.
- [Assessing Speaking Performance — IELTS (partner-hosted PDF)](https://ielts.ch/wp-content/uploads/2021/04/assessing-IELTS-speaking.pdf) — examiner-facing overview of the assessment procedure. Listed for completeness; **could not be fetched** from this environment (domain-verification failure), so no claim above depends on it.

Research literature (pronunciation and intelligibility, §5.2 and §9):

- [Lingua Franca Core — overview](https://en.wikipedia.org/wiki/Lingua_Franca_Core)
- [Testing the Lingua Franca Core: the intelligibility of flaps — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2590291122000675)
- [Effect of altering three phonetic features on intelligibility of English as a lingua franca — Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/13488678.2018.1536817) — the vowel-length counter-finding cited in §9.2.
- [Teaching English pronunciation to multi-dialect first language learners: reviving the Lingua Franca Core — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0346251X17307005)
- [The impact of Jenkins' Lingua Franca Core on pronunciation teaching (CELTA/DELTA) — IH Journal](http://ihjournal.com/the-impact-of-jenkins%E2%80%99-lingua-franca-core-on-the-teaching-of-pronunciation-on-celta-and-delta-courses-by-eleanor-spicer)

Error-frequency literature (§5.1, with the writing-vs-speech caveat in §9.7):

- [Grammar Errors Made by ESL Tertiary Students in Writing — ERIC (EJ1137462)](https://files.eric.ed.gov/fulltext/EJ1137462.pdf) — the subject–verb agreement > tense > noun > preposition > article ranking.
- [5 Common Subject-Verb Agreement Mistakes of ESL Students — EnglishClub](https://www.englishclub.com/efl/articles/grammar/subject-verb-agreement-mistakes/)
- [Common ESL Grammar Mistakes and How to Correct Them — ULC](https://www.ulc.com.sg/blogs/common-esl-grammar-mistakes-and-how-to-correct-them/)

Teacher / examiner commentary (used for §4 and §6; treated as informed opinion, not authority):

- [IELTS Speaking Band 6: Why you are stuck — Keith Speaking Academy](https://keithspeakingacademy.com/ielts-speaking-band-6-to-band-7-stuck/) — the "lower 6 needs general English, upper 6 needs technique" split used in §4 row 11.
- [IELTS Pronunciation: The Ultimate Guide — Keith Speaking Academy](https://keithspeakingacademy.com/ielts-speaking-pronunciation-features-practice/)
- [Why do some learners get stuck on 6.5 in IELTS? An examiner's perspective — LearnInSync](https://learninsync.in/why-do-some-learners-get-stuck-on-6-5-in-ielts/) — discourse-marker poverty, connected-speech absence, ~8–12 weeks per half band.
- [Why Students Get Stuck at Band 6.5 — Aviontus](https://www.aviontus.com/post/why-students-get-stuck-at-band-6-5-in-ielts-and-how-to-break-through)
- [How to get Band 7 in IELTS when you're stuck at 6.5 — IELTS ETC](https://ieltsetc.com/2019/10/have-you-hit-an-ielts-plateau/)
- [Should You Correct Yourself or Keep Talking? — Love to Learn English](https://lovetolearnenglish.com/tips-for-ielts-and-toefl/2024/9/10/should-you-correct-yourself-or-keep-talking-in-the-ielts-speaking-exam) — §3.2 repair strategy.
- [Detailed Summary of IELTS Speaking Band Descriptors — Love to Learn English](https://lovetolearnenglish.com/tips-for-ielts-and-toefl/2024/9/12/detailed-summary-of-ielts-speaking-band-descriptors)
- [How to Use Sentence Stress in IELTS Speaking — Love to Learn English](https://lovetolearnenglish.com/tips-for-ielts-and-toefl/2024/9/10/how-to-use-sentence-stress-in-ielts-speaking-exams)
- [IELTS speaking: Part 1 — Fluency and Coherence — EFL Magazine](https://eflmagazine.com/fluency-and-coherence-ielts-speaking/) — content-related vs language-related hesitation.
- [IELTS Speaking Explained: Fluency & Coherence — IELTS Vancouver](https://ieltsvancouver.com/2023/03/03/ielts-speaking-explained-fluency-coherence/)
- [7 IELTS Fluency Problems — IELTS Advantage](https://www.ieltsadvantage.com/2016/08/12/ielts-improve-fluency/)
- [IELTS Speaking Part 3 Guide — IELTS Advantage](https://www.ieltsadvantage.com/2015/03/25/ielts-speaking-part-3-guide/)
- [Fillers for IELTS Speaking — IELTS Buddy](https://www.ieltsbuddy.com/fillers-for-ielts-speaking.html)
- [Band 7 Speaking: paraphrasing and complex structures — IELTS Podcast](https://www.ieltspodcast.com/ielts-speaking/band-7/) — the "use a phrase you're ~80% sure of" risk calibration in §3.5.
- [Stop Memorizing IELTS Answers — ListenAct](https://listenact.ca/stop-memorizing-ielts-answers/)

**Not used as authority:** commercial "band descriptors 2026 / updated criteria" listicles and
AI-scoring vendor blogs surfaced in search. Where a point appears only in that tier, it is either
omitted above or flagged in §9.
