# W-R3 — Bands and Errors: how IELTS-style Writing is actually marked

Research briefing for BandReady **writing**-content authors.
Compiled 2026-07-27. Consumers: the writing design agent (schema owner), the per-prompt
teaching-note authoring agents, the model-answer authors, and the evaluator/report copy in
`docs/plan/05-writing-module.md` §6.

Companion: `content/core-en/staging/research/03-bands-and-errors.md` is the **speaking**
equivalent. Where a point holds for both skills it is stated here in its written form and
cross-referenced as *(cf. speaking R3 §x)* rather than repeated.

> **Copyright note for anyone reading or extending this file.** Everything below is either (a) a
> statement of fact about how the test works, (b) our own clean-room paraphrase of the publicly
> published Writing band descriptors, or (c) original teaching material authored for BandReady.
> The published descriptor tables were read in order to paraphrase them accurately; **no descriptor
> sentence, no past-paper prompt, no third-party chart data and no third-party model answer is
> reproduced anywhere in this file.** Every wrong/right pair, model sentence and collocation list
> below was written from scratch for BandReady and may be reused freely inside the pack. If you
> extend this file, keep that rule: if you can remember reading a sentence somewhere, throw it away
> and write a different one about the same thing. Our product copy says **"IELTS-style"** and
> carries the non-affiliation notice.

---

## 0. TL;DR for authors — the twelve things worth teaching

If a per-prompt teaching note has room for one point, it should come from this list. They are
ordered by how much band movement they buy per hour of learner effort.

1. **Answer the question that was asked, in the shape it was asked.** "To what extent do you agree"
   answered as "here are both sides" is the single commonest reason a competent essay scores 6.
2. **Two developed ideas beat four announced ones.** Development — not length, not vocabulary — is
   what the criterion-1 descriptor is looking for above band 6.
3. **Task 1 lives or dies on the overview.** A separate one-or-two-sentence statement of the biggest
   pattern, containing *no figures*, is the highest-value sentence in the whole report.
4. **Band 7 grammar is accuracy inside complexity, not the presence of complexity.** Band 6 already
   attempts complex sentences. Band 7 lands them — repeatedly, cleanly, in a visible run.
5. **Collocation is where Lexical Resource is actually lost.** Not missing words — wrong partners.
   `make a research`, `strongly increase`, `give a solution`, `pay attention on`.
6. **A wrong rare word scores lower than a right plain word.** The 7+ descriptors credit *awareness
   of style and collocation*; a thesaurus misfire is direct evidence against that awareness.
7. **Referencing and substitution are the invisible half of cohesion.** Band 6 repeats the noun.
   Band 7 uses `it`, `this shift`, `the former`, `does so`, `such measures`.
8. **One idea per paragraph, announced in its first line.** Topic sentences are named explicitly in
   the Task 2 band-7 descriptor. Nothing else in coherence is that cheap to fix.
9. **Linking words are a garnish, not a structure.** `Firstly / Moreover / Furthermore / In
   conclusion` on every sentence is a band-6 tell and is penalised as over-use.
10. **Register is a scored, binary-ish thing on GT Task 1** and a slow leak on Task 2. Contractions,
    `you`, rhetorical questions and `&` cost marks in an academic task and are correct in an
    informal letter. Decide the register before the first word.
11. **Budget three minutes at the end of each task to re-read.** Most band-6 error density is
    *known* errors the writer would have caught. Proofreading is a scoring strategy, not tidiness.
12. **Copying the prompt does not count.** Copied strings are discounted from the word count and
    demonstrate no vocabulary. Paraphrase the task in the first sentence or lose it twice.

---

## 1. The marking mechanics (facts, freely usable)

- The Writing test is **60 minutes, two tasks, one continuous sitting**. Task 1 is advised at
  20 minutes, Task 2 at 40. There is no enforced split — the candidate can spend the hour however
  they like, which is itself a trap (see §4 row 12).
- Four criteria, **equally weighted within a task**: Task Achievement (Task 1) / Task Response
  (Task 2), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).
- Each criterion is awarded a **whole band 0–9**. The band for a *task* is the mean of its four
  criteria. (Our `round_ielts()` helper already implements the ties-up rule.)
- **Task 1 and Task 2 use different descriptor tables.** CC, LR and GRA are worded identically
  across the two tables; only criterion 1 differs — and within Task 1, criterion 1 carries
  **separate Academic and General Training bullets** at bands 4–7. This matters to us: see §8.1.
- **Task 2 counts twice as much as Task 1** in the reported Writing sub-score. The formula reported
  consistently across preparation sources is `writing = round_to_half((T1 + 2×T2) / 3)`. It is not
  printed in the public descriptor document — see §9.1.
- **Academic and General Training are marked to the same CC/LR/GRA descriptors.** Only Task 1's
  criterion 1 diverges (chart/process/map description vs. letter purpose-and-tone), and the two
  versions' Task 1 tasks are of course different.
- **Content is not marked for truth or interest.** Invented examples, invented statistics inside a
  Task 2 essay, and invented personal circumstances in a GT letter are all fine and are standard
  practice. Only the *language* and the *task handling* score. (Task 1 Academic is the exception:
  the figures there are given to you and inventing them **is** a task-achievement error.)
- **Opinion is not wanted in Academic Task 1.** Interpreting the data, speculating about causes, or
  saying which trend is good is off-task there — but is exactly what Task 2 demands. Candidates
  routinely transfer the wrong habit in one direction or the other.
- Handwriting legibility is a real factor on paper-based tests; **irrelevant to us**, we are
  typing-only (05 §Open questions 4).
- **The zero band is not only for a blank page.** The published scale places a *completely
  memorised response* alongside non-attendance and non-attempt at band 0. This is a stronger
  published statement than anything in the speaking scale, and our copy may state it as fact —
  carefully (§7.4).

**Interaction with our pipeline.** Unlike speaking, the written script *is* the whole evidence
base: there is no delivery channel the transcript under-determines. That makes writing feedback
much more anchorable — every claim our evaluator makes can point at a character offset (05 §7). It
also means our teaching notes can be far more concrete than the speaking ones: we can name the
sentence pattern, the collocation and the paragraph move, and the report can show whether the
learner produced it.

---

## 2. The four criteria, bands 5→8, in our own words

Clean-room paraphrase for authors' calibration and for learner-facing "what does this band mean"
copy. Written **behaviourally** — an author should be able to turn a cell straight into a teaching
note. `T1-A` = Academic Task 1, `T1-G` = General Training Task 1 (letter), `T2` = essay.

### 2.1 Criterion 1 — Task Achievement (Task 1) / Task Response (Task 2)

This is the criterion where the three task types genuinely diverge, so it gets three tables.

**T1-A — Academic Task 1 (chart, table, process, map)**

| Band | What the script does |
|---|---|
| **5** | Works through the visual detail by detail with no statement of the big picture anywhere. Reads like a caption list. Often drifts into detail on one series while ignoring another, or describes shape without ever attaching a number to it. The format may wobble — a paragraph that turns into an essay, or an opinion that has no business being there. |
| **6** | Does state the big picture, and picks broadly the right things to state — but the supporting detail is uneven: a figure misread, a comparison that isn't really the interesting one, a stray irrelevance. Everything the task asks for is present; the selection judgement is only average. |
| **7** | Everything the task asks for is delivered, and the overview is unmistakable — main trends, the main differences, or the stages of the process, stated as such. Key features are picked out and made to stand out. The one thing missing is depth: a supported comparison would have gone one step further than it does. |
| **8** | The task's requirements are met with room to spare. The features that matter are not just selected but *illustrated* — the right figures attached to the right claims, the right comparisons made explicitly, nothing padded and nothing missing. |

**T1-G — General Training Task 1 (letter)**

| Band | What the script does |
|---|---|
| **5** | The reason for writing can be worked out, but not immediately, and it moves around. The tone is unstable — a formal opening followed by chatty middles, or an apologetic register in a letter that is meant to complain. The three bullets are all touched but at least one is a single clause with nothing behind it. |
| **6** | Why the letter exists is broadly clear. Tone is mostly right with visible slips — a contraction in a formal complaint, an over-stiff sentence to a friend. All three bullets appear; the detail under them is sometimes generic or slightly off what was asked. |
| **7** | The purpose is stated early and never in doubt, and the tone matches the recipient from greeting to sign-off without a single jarring sentence. All three bullets are covered and each one has something specific under it. What holds it below 8 is extension: a bullet answered adequately rather than fully. |
| **8** | Purpose, tone and coverage are all handled so consistently that the reader stops noticing them. Each bullet is developed into something a real recipient could act on — dates, amounts, named consequences, a specific request. |

**T2 — the essay (identical for Academic and General Training)**

| Band | What the script does |
|---|---|
| **5** | Engages with the topic rather than the question. The writer's position exists somewhere in the essay but has to be assembled by the reader, and the ending doesn't commit to it. Ideas are named and then left — two or three sentences of restatement where an explanation should be. Often carries a paragraph of material that belongs to a different question. |
| **6** | Every part of the question is touched, but not evenly: one half of a two-part question gets a full paragraph and the other gets a sentence. A position is present and recognisable, but the conclusion either restates the introduction word-for-word or drifts into a slightly different claim. Main ideas are relevant; at least one of them is announced and never explained. |
| **7** | Every part is addressed, and the same position is visible in the introduction, in each body paragraph and in the conclusion — no drift. Ideas are extended and supported rather than listed. The remaining weakness is focus: a claim that overreaches ("everyone", "always", "in every country"), or a supporting example that illustrates something adjacent to the point it is attached to. |
| **8** | All parts covered properly, and the argument is *developed*: each main idea has a mechanism behind it, a consequence in front of it, and support that is specific enough to be checkable. Nothing in the essay is there to fill space. |

### 2.2 Coherence and Cohesion (same descriptor for both tasks; one extra band-7 requirement on T2)

| Band | What the script does |
|---|---|
| **5** | There is *some* shape — an opening, a middle — but no sense of progression: the third paragraph could swap places with the second and nothing would be lost. Linkers are either too few, wrong, or the same three on a loop. Paragraphs may be missing entirely or arrive in the wrong places (T2 especially). Nouns are repeated in full every time because the writer has no referencing to fall back on. |
| **6** | The reader can follow it, and there is a real overall direction. The joins are the problem: a `Moreover` between two sentences that don't add to each other, a `However` where nothing is being contrasted, and pronouns whose antecedent takes a second to find. Paragraphs exist but their boundaries are sometimes arbitrary — a new idea starting mid-paragraph, or one paragraph carrying two. |
| **7** | The order of ideas is deliberate and the reader can feel the argument advancing. A genuine range of cohesive devices is in play and mostly used well — the residual fault is quantity, not choice: two too many in one paragraph, none at all in the next. **On Task 2, each paragraph has one central topic and says what it is in its first line.** |
| **8** | Sequencing is logical from the first line to the last, all the machinery of cohesion — connectors, reference, substitution, ellipsis, parallel structure — is handled without visible effort, and paragraphs are the right size in the right places. Cohesion stops being something the reader notices. |

### 2.3 Lexical Resource (identical for both tasks)

| Band | What the script does |
|---|---|
| **5** | Enough words to do the job, and barely more. The same nouns and verbs recycle; ideas get squeezed into whichever words are available rather than the ones that fit. Spelling and word-form mistakes are frequent enough that the reader stumbles — sometimes has to re-read a clause to work out which word was meant. |
| **6** | A workable range for the task. Less common items are attempted, and roughly half of them land — the other half are the right idea in the wrong partner or the wrong register. Spelling and word-form errors are still there but never actually block the meaning. |
| **7** | The range is sufficient to say things *precisely* rather than approximately, and to say the same thing two ways when the first way would repeat. Less common items appear and are mostly right, with visible awareness of which word belongs in which kind of sentence and which words pair with which. Occasional slips in choice, spelling or word formation persist. |
| **8** | Wide vocabulary used fluently and, crucially, to convey exact shades of meaning. Uncommon items are handled skilfully, with only the occasional collocation that a native writer wouldn't have chosen. Spelling and word-formation errors become rare rather than occasional. |

### 2.4 Grammatical Range and Accuracy (identical for both tasks)

| Band | What the script does |
|---|---|
| **5** | A narrow set of structures. Complex sentences are attempted and are noticeably worse than the simple ones — that gap is the diagnostic. Grammar errors are frequent and punctuation is unreliable (comma splices, missing full stops), and between them they cost the reader real time. |
| **6** | Simple and complex forms both present, in a real mix. Errors in grammar and punctuation are there in every paragraph, but they are the kind a reader steps over rather than trips on. The complex forms tend to be a small repertoire reused: `because`, `which`, `if`, `although`. |
| **7** | A genuine variety of complex structures, and — this is the part candidates miss — **whole sentences that come out clean, often enough that the reader notices the run of them**. Grammar and punctuation are under control; a few errors survive but they are individually minor. |
| **8** | Wide structural range, and *most* sentences in the script are error-free. What remains is the occasional slip or a phrasing that is grammatical but not quite what a proficient writer would have chosen. |

### 2.5 Two structural facts about the scale that change how we teach

1. **Band 7 GRA is defined by a positive, countable property, not by an absence.** The scale asks
   for frequent error-free sentences — not for an essay without errors. A learner who believes 7
   means "no mistakes" writes short safe sentences and lands at 6, because range is also being
   marked. Our GRA teaching should be framed as *"produce more clean complex sentences"*, never as
   *"make fewer mistakes"*. This is the writing analogue of the speaking R3 §2.5 reframe, and it is
   the single most useful thing we can tell a plateaued learner.
2. **Band 6 and band 7 are separated by consistency far more than by ceiling.** Band-6 scripts
   routinely contain band-7 and even band-8 sentences. What they don't contain is a band-7
   *paragraph*. Every teaching note should therefore target a repeatable habit, not a one-off
   flourish.

---

## 3. What a band 7 script actually *does* that a band 6 does not

This is the section authors should mine hardest. Every item is visible in the text, which means our
annotated report can point at it and our model answers can demonstrate it. All examples below are
originally authored for BandReady.

### 3.1 Paragraph topic sentences (the cheapest single upgrade)

The band-7 Task 2 descriptor names this explicitly, which makes it the only coherence feature with
a direct, checkable requirement attached.

- **Band 6 paragraph opening:** `Another thing is about the environment.` — announces a subject
  area, not a claim, and commits the paragraph to nothing.
- **Band 7 paragraph opening:** `The more serious cost, however, is environmental: cheap air travel
  has made short trips routine that would never have been taken at a realistic price.` — a claim,
  a stance marker, and a scope the rest of the paragraph must now honour.

Teachable test a learner can run on their own draft: **cover everything but the first sentence of
each paragraph. Can you still tell what the essay argues, and in what order?** If not, the topic
sentences aren't doing their job. This is a two-minute self-check and it belongs in our report copy.

On Task 1 the equivalent is different and must be taught differently: the paragraph roles are fixed
(paraphrased task → overview → detail group 1 → detail group 2) and the "topic sentence" of a
detail paragraph is a **grouping statement**: `The three service categories behaved very
differently over the period.`

### 3.2 Development: what "extend and support" means in sentences

The band-7 criterion-1 descriptor asks for main ideas that are extended *and* supported. Band-6
scripts almost always present and then stop. The observable difference is a **four-move paragraph**:

| Move | What it does | Band-6 script | Band-7 script (authored) |
|---|---|---|---|
| Claim | states the idea | `Public transport is good for cities.` | `Investing in public transport does more for congestion than any road-building programme.` |
| Mechanism | *why* the claim follows | — usually skipped | `A bus lane moves the same number of people through the same width of street as several lanes of cars, so capacity rises without any new land being bought.` |
| Consequence / who it lands on | makes it concrete | `It reduces traffic and pollution.` | `That matters most to the people who commute furthest, who are typically the ones priced out of living near the centre.` |
| Support | a specific instance or a named limit | `For example, in many countries public transport is very useful.` | `The catch is coverage: a network that stops short of the suburbs simply relocates the queue to the park-and-ride.` |

The band-6 failure mode is not laziness — it is **listing three ideas instead of developing two**.
Three shallow reasons produce three paragraphs of two sentences each, which caps criterion 1 and
drags CC down with it. Teach the trade explicitly: *drop your third reason and spend its words on
your first.*

**Diagnostic an author can put in a teaching note:** count the sentences in each body paragraph that
begin with a *new* idea versus ones that push the current idea further. Band 6 is roughly 1:1.
Band 7 is roughly 1:3.

The other band-7 residue named in the descriptor is **over-generalising**. Teach the hedge as a
precision device, not as a politeness: `In most industrialised economies…`, `for households on low
and middle incomes…`, `at least in the short term…`. Every unqualified `everyone` / `always` /
`all countries` in a draft is a marked target.

### 3.3 Complex sentences — and their accuracy

Band 6 already attempts complexity. The band-6 descriptor says so, and the band-5 descriptor says
the attempts come out worse than the simple sentences. So *attempting complexity is not the
upgrade* — **landing it is**.

Two things are being marked and they must be taught as two things:

**(a) Range.** Band 6 typically has four live patterns: `because`, defining `which/that`, first
conditional `if`, and `although`. A band-7 script visibly reaches past them:

| Function | Structure | Authored model sentence |
|---|---|---|
| concede then hold | `While … , …` fronted | `While the initial cost is undeniably high, it is recovered within a decade of lower maintenance bills.` |
| contrast two things | `whereas` | `Rural clinics lost a third of their staff over the decade, whereas urban hospitals grew slightly.` |
| add a non-essential comment | non-defining `, which …` | `Fees were introduced in 2011, which coincided with the first fall in applications for a generation.` |
| compress a cause | `-ing` participle clause | `Facing a shortfall of qualified teachers, several districts raised starting salaries.` |
| compress a result | `, leaving/making/allowing …` | `Demand outstripped supply for six consecutive years, leaving the waiting list twice as long as it had been.` |
| unreal present | second conditional | `If housing were taxed on value rather than transaction, mobility would almost certainly rise.` |
| emphasise the point | cleft `What … is / It is … that` | `What makes the policy unpopular is not its cost but its visibility.` |
| depersonalise a claim | passive with agent dropped | `Recycling targets were repeatedly revised downwards.` |
| range on a noun phrase | reduced relative | `Households living within walking distance of a station drove a third fewer miles.` |
| hedge a generalisation | `tend to` / `is likely to` / `broadly` | `Households on lower incomes tend to spend a larger share of income on essentials.` |

**(b) Accuracy inside them.** The commonest band-6 complex-sentence failures, with authored
wrong/right pairs — these are worth shipping verbatim in `error_watchlist` entries:

- Double connector: `Although the cost is high, but the benefits are clear.` → `Although the cost is
  high, the benefits are clear.`
- Fragment from a fronted subordinate clause: `Because more people are working from home. Traffic
  has fallen.` → `Because more people are working from home, traffic has fallen.`
- Resumptive pronoun in a relative clause: `The problem which the government is trying to solve it
  is complex.` → `The problem the government is trying to solve is complex.`
- `people which` → `people who`; `the reason why … is because` → `the reason … is that`.
- Conditional tense mixing: `If the government would invest more, the problem will be solved.` →
  `If the government invested more, the problem would be solved.`
- Dangling participle: `Having introduced the charge, congestion fell by a fifth.` (the congestion
  did not introduce the charge) → `After the charge was introduced, congestion fell by a fifth.`

**Teach the sentence pair, not the rule.** For each prompt, name one structure the topic naturally
pulls and one accuracy trap that structure carries.

### 3.4 Collocation precision

Lexical Resource is lost to **wrong partners**, not to missing words (cf. speaking R3 §3.5, and the
corpus study in §10 which found word-choice errors the single largest category in IELTS essays).
Authored upgrade pairs, grouped so authors can attach the right cluster to the right prompt:

**Academic register verbs (Task 2 everywhere)**

| Common wrong partner | Natural |
|---|---|
| `make a research` | `conduct research` / `carry out research` |
| `do a decision` | `make a decision` / `reach a decision` |
| `give a solution` | `offer a solution` / `propose a solution` / `a solution **to** the problem` |
| `solve a challenge` | `address a challenge` / `meet a challenge` |
| `arise awareness` | `raise awareness **of/about**` |
| `pay attention on` | `pay attention **to**` |
| `take an action` | `take action` (uncountable here) |
| `do a mistake` | `make a mistake` |
| `bring benefits for` | `bring benefits **to**` / `benefit somebody` |
| `play an important role **in**` ✓ | (correct — ship it as a positive model, it is over-used but not wrong) |

**Trend and quantity language (Academic Task 1 — the highest-yield vocabulary set in the module)**

| Common wrong partner | Natural |
|---|---|
| `strongly increased` | `rose sharply` / `increased significantly` / `climbed steeply` |
| `increased by 20% **to** 2010` | `rose **to** 20% **by** 2010` (see the by/to trap, §5.1) |
| `the graph shows about the number` | `the chart shows the number of…` |
| `was in the first place` | `ranked first` / `was the largest category` |
| `stayed in the same` | `remained stable` / `held steady` / `levelled off` / `plateaued` |
| `go up and down` | `fluctuated (between X and Y)` |
| `the most highest` | `the highest` / `peaked at` |
| `big difference` | `a marked difference` / `a substantial gap` |
| `small increase` (fine, but flat) | `a marginal rise` / `a modest increase` / `edged up` |
| — | `bottomed out at`, `the gap narrowed / widened`, `roughly doubled`, `fell by half`, `accounted for a third of`, `overtook`, `was outstripped by` |

**Letter language (GT Task 1)**

| Register | Authored chunks |
|---|---|
| formal | `I am writing to enquire about…`, `I would be grateful if you could…`, `at your earliest convenience`, `I look forward to your response`, `Yours faithfully` (unnamed recipient) / `Yours sincerely` (named) |
| semi-formal | `I hope you don't mind me writing…`, `I wondered whether it would be possible to…`, `Do let me know what suits you`, `Best wishes` |
| informal | `I've been meaning to write for ages`, `Any chance you could…?`, `Let me know either way`, `Take care` |

**Rule for our teaching notes:** every vocabulary item we surface ships **with its partners and a
model sentence**, never as a bare word. In writing specifically, also ship the *preposition* —
`a solution to`, `an increase in`, `a reason for`, `access to`, `an impact on`, `responsible for`,
`attitude towards`, `an alternative to`, `concerned about`. Prepositions are a collocation problem
wearing a grammar costume.

### 3.5 Referencing and substitution

Named directly in the descriptors: at band 6, referencing is not always clear or appropriate; at
band 5, the script is repetitive *because* referencing and substitution are missing. It is the
half of cohesion that nobody teaches because it is invisible when it works.

**Band 6 (authored):**
> `Governments should invest in public transport. Public transport reduces the number of cars on the
> road. Public transport is also cheaper for people on low incomes.`

**Band 7 (same content, authored):**
> `Governments should invest in public transport. Done properly, it takes cars off the road — and,
> unlike most environmental measures, it does so while cutting costs for the people least able to
> absorb them.`

What changed, itemised for an annotation payload:
- **Pronoun reference**: `it` for the whole noun phrase.
- **Verb substitution**: `does so` replacing a repeat of the whole predicate.
- **Ellipsis**: `Done properly` — subject and auxiliary dropped.
- **Lexical substitution / down-ranking**: `most environmental measures` as a superordinate that
  covers the previous idea without naming it.
- **Definite reference forward**: `the people least able to absorb them` — a described referent
  rather than a repeated one.

The five devices worth teaching by name, because each is drillable in a single rewrite exercise:
`it / they / this / these` · `such measures / this shift / the former / the latter` ·
`do so / does / did` · `one / ones` · dropped-subject participial openers.

**Anti-pattern to name explicitly:** replacing a repeated noun with a *thesaurus synonym* instead of
a reference. `Public transport → mass conveyance systems` is worse than the repetition: it costs LR
and it makes the reader check whether a new thing has been introduced. Pronouns and demonstratives
first, synonyms only where the synonym is genuinely idiomatic.

### 3.6 Flexibility of expression

Band 7 LR asks for enough range to be flexible *and* precise. The observable version of "flexible"
is: **the writer can say the same thing a second way rather than repeating themselves, and can
choose the version that fits the sentence they are in.** Drill shape for a teaching note — one idea,
three renderings, all authored:

> - `Cheap flights have made weekend trips abroad normal.`
> - `Falling airfares have turned the weekend break into an ordinary purchase.`
> - `What used to be an annual holiday is now, for many households, a monthly one — largely because
>   flying has stopped being expensive.`

The third is band-8 territory (cleft + hedged scope + causal tail). The point of showing all three
together is the speaking-module point transplanted: **the gap between bands is language, not
content.** Every model answer we ship should honour that — same argument, same examples, different
language (cf. speaking DESIGN.md §3.8).

### 3.7 Task 1 Academic: the four things band 7 does that band 6 does not

1. **A real overview, separated out.** One or two sentences, its own position (conventionally after
   the paraphrased task line, or at the very end), **containing no specific figures**, stating the
   biggest movement / the biggest difference / the number and nature of the stages.
   Authored model: `Overall, the two categories moved in opposite directions: what began as the
   smallest share finished as the largest, while the early leader more than halved.`
2. **Selection instead of enumeration.** Band 6 walks the chart. Band 7 decides which three or four
   things carry the story and groups the rest. A useful rule to ship: *if a figure isn't the
   biggest, the smallest, a crossover, a turning point, or the exception to the pattern you just
   stated, it probably doesn't need its own sentence.*
3. **Comparison as the default grammar.** Band 6 writes serial descriptions (`X was 40%. Y was
   25%.`). Band 7 writes relations: `X was well over half as large again as Y`, `the two converged
   in 2015 and diverged again after 2018`, `Y accounted for roughly a quarter of the total
   throughout`.
4. **Data accuracy.** Misread figures are a criterion-1 error, not a lexis one, and the descriptors
   flag inaccurate detail at band 6 explicitly. Our evaluator already gets `chart_to_text`, so we
   can catch this properly — and our teaching notes should say plainly that an invented number is
   worth more damage than a clumsy sentence.

For **process** and **map** visuals the equivalents are: an overview that states *how many stages
and where the material starts and ends* (process) or *what kind of change the site underwent*
(map); passive voice as the default register for a process (`the pulp is then fed into…`); and
position/direction language for maps (`to the north of`, `on the site formerly occupied by`,
`was replaced by`, `extended eastwards`).

### 3.8 GT Task 1: the register test

Register is the fastest thing to lose a band on in a letter, because it is visible in the first
line and it is either sustained or it isn't.

- **Decide from the recipient, not from the topic.** Institution / stranger / someone in a role →
  formal. Colleague, neighbour, landlord you know, classmate → semi-formal. Friend or family →
  informal.
- **The three markers that give it away:** contractions (`I'd`, `don't`), direct address of the
  reader as an equal (`Hey`, `you guys`, imperatives), and phrasal verbs vs. Latinate verbs
  (`put up with` vs `tolerate`, `find out` vs `ascertain`).
- **Sign-off pairing is mechanical and free marks:** `Dear Sir or Madam` → `Yours faithfully`;
  `Dear Ms Patel` → `Yours sincerely`; `Dear Anna` → `Best wishes` / `All the best`; `Hi Tom` →
  `See you soon`.
- **Bullet coverage is not the same as bullet extension.** Band 6 answers all three bullets in a
  sentence each. Band 7 gives each bullet a short paragraph with something specific in it — a date,
  an amount, a consequence, a concrete request.
- **A contraction in an informal letter is correct**, and its absence makes the letter read wrong.
  Our error-detection copy must not flag contractions globally; it must flag them *by register*.

---

## 4. Why candidates plateau at 6.0–6.5 in writing, and the fix for each

Ordered by how often the cause appears in examiner-facing and teacher-facing commentary. Each fix
is scoped to be actionable inside one week — that is our quality bar for teaching notes.

| # | The plateau cause | What it looks like on the page | The fix to teach |
|---|---|---|---|
| 1 | **Answering the topic, not the question** | An `agree or disagree` prompt answered as a balanced discussion; a `two-part question` with the second part unanswered; a `problem/solution` essay that is all problems. | Before writing, copy the *task verb* to the top of the plan and write the required shape beside it. Our prompt browser should show the essay type as a badge and our teaching note should state the obligatory shape for that type in one line. Band 6→7 lives here more than anywhere else. |
| 2 | **Three thin ideas instead of two developed ones** | Body paragraphs of two or three sentences; every idea introduced and none explained. | The four-move paragraph (§3.2). Rule: **two body paragraphs, two main ideas, minimum five sentences each.** Cut the third reason and spend its 60 words on the first. |
| 3 | **Memorised template intro/conclusion** | A polished, faintly generic opening followed by visibly weaker body prose. Examiners read the seam. | Keep the *plan*, kill the *sentences*. The introduction should contain a paraphrase of the task in the learner's own words plus a thesis with the essay's actual content in it — a thesis that could be pasted onto another essay is worth nothing. |
| 4 | **Linking-word carpet bombing** | `Firstly / Moreover / In addition / Furthermore / Last but not least / In conclusion`, one per sentence. | Cap it: **at most two explicit connectors per paragraph**, and make the rest of the cohesion come from reference and substitution (§3.5). Over-use is named in the band-7 descriptor as a *fault*, so this is a direct, checkable fix. |
| 5 | **Complexity attempted, not landed** | Long sentences that break in the middle: double connectors, fragments, tense-mixed conditionals. | Two structures per week from §3.3(a), each drilled with its specific accuracy trap, until a whole clean sentence is the default output. Then re-read every complex sentence in the draft on its own — half the errors are visible in isolation. |
| 6 | **Repetition where referencing should be** | The prompt's key noun phrase appearing eight times. | Rewrite drill: take a marked paragraph, replace every repeat with a reference, substitution or ellipsis (§3.5). Fifteen minutes, immediately visible. |
| 7 | **No overview / a buried overview (Task 1)** | The main pattern never stated, or stated inside a detail paragraph with figures attached. | A separate paragraph, no numbers, starting `Overall,` until the habit is automatic. This one sentence is the difference between the band-5 and band-7 Academic descriptors. |
| 8 | **Enumerating instead of selecting and comparing (Task 1)** | Every category, every year, one sentence each, no relations. | Grouping rule + the comparison-grammar bank (§3.7). Force a maximum of four detail sentences per paragraph and require a comparative in each. |
| 9 | **Register leak** | `Don't`, `you`, `a lot of`, a rhetorical question, `&`, `etc.` in an academic essay — or stiff Latinate prose in a letter to a friend. | Named register checklist per task type, run in the proofread pass. On Task 2: no contractions, no second person, no rhetorical questions, no abbreviations. On GT: match the recipient, then check the sign-off pairs (§3.8). |
| 10 | **Word-count anxiety producing padding** | A 320-word essay in which 70 words restate the question and the conclusion is the introduction again. | Target **270–290** on Task 2 and **170–190** on Task 1. That is comfortably over the floor and leaves time to think. Padding costs on all four criteria; there is no length credit above the minimum. |
| 11 | **Never proofreading** | Third-person `-s`, missing articles, `it's/its`, plural agreement — errors the writer can find. | Reserve the last 3 minutes of each task for one targeted pass, hunting **your own top two error patterns only** (not a general read-through, which finds nothing). Our rewrite loop is the right vehicle: show the learner their repeat offenders across attempts. |
| 12 | **Task 1 overrunning into Task 2 time** | A polished report and a rushed, conclusion-less essay. Task 2 is worth twice as much, so this is the most expensive time-management error available. | Hard stop at 20 minutes on Task 1 even if unfinished. Suggested budgets: T1 = 4 plan / 13 write / 3 check; T2 = 6 plan / 31 write / 3 check. Our exam timer should show *both* budgets, not just the current task's. |
| 13 | **Practising volume without feedback** | Forty essays, the same eleven errors in all forty. | A plateau is a language ceiling, not an effort ceiling (cf. speaking R3 §4 row 11). Fewer attempts, each followed by a targeted rewrite of the same prompt. Our improvement loop (05 §8) exists for exactly this and our copy should say so. |
| 14 | **Vocabulary "upgrading" that makes things worse** | Thesaurus substitutions that break collocation, and register mismatches. | §6. One exactly-right common word beats one wrong rare word, every time, and the descriptor is on our side here. |

---

## 5. High-frequency error patterns to target

For each: the trigger context (so authors know which prompts to attach it to) and the fix. All
wrong/right pairs are authored for BandReady. **Do not attach ten of these to one prompt — attach
two**, chosen because that prompt's content forces them.

### 5.1 Grammar

| Pattern | Authored wrong → right | Where it surfaces | Fix to teach |
|---|---|---|---|
| **Articles** | `Government should invest in education.` → `Governments should invest in education.` / `The government should…` · `The society has changed.` → `Society has changed.` · `In the modern society` → `In modern society` | Everywhere; densest in Task 2 abstract nouns and Task 1 category names | Three rules only: (a) a singular countable noun always needs a determiner; (b) generalisations use bare plural or bare uncountable — `Children learn…`, `Pollution is…`; (c) `the` once the thing has been identified, and with superlatives and ordinals (`the highest figure`, `the first stage`). Don't teach the whole system. |
| **Subject–verb agreement across distance** | `The number of students have risen.` → `has risen.` · `One of the main reasons are cost.` → `is cost.` · `Each of the categories show a different trend.` → `shows` | Task 1 trend statements; Task 2 `one of the…` openings | Head-noun trick: find the noun the verb actually belongs to and ignore everything between. Note `the number of X **is**` vs `a number of X **are**` — different heads. |
| **Countability** | `many informations` → `a great deal of information` · `advices` → `advice` / `pieces of advice` · `researches` → `research` / `studies` · `equipments`, `knowledges`, `staffs`, `moneys` · `less people` → `fewer people` | Education, work, media, money, science prompts | Ship the uncountable list **with its counter phrase**: `a piece of advice`, `an item of equipment`, `a body of research`, `a great deal of information`. Plus `fewer` + countable / `less` + uncountable, and `amount of` vs `number of`. |
| **Prepositions** | `discuss about` → `discuss` · `emphasise on` → `emphasise` · `comprise of` → `comprise` / `consist of` · `reason of` → `reason for` · `impact to` → `impact on` · `solution of` → `solution to` · `depend of` → `depend on` · `according to me` → `in my view` | Every prompt | Learn them **inside the chunk**, never from a table. Ship the preposition attached to the noun or verb in every vocabulary item we surface (§3.4). |
| **Tense consistency — Task 1** | `The chart showed the number of visitors and it will rise steadily after 2005.` → `The chart shows… the number rose steadily after 2005.` | Any dated chart; charts with a projection | Decide the tense from the **data's dates**, not the chart's: past dates → past simple; no dates / a process / a map "as it is now" → present simple; projected years → `is expected to` / `is projected to`. Write the chosen tense at the top of the plan. |
| **Tense consistency — Task 2** | `In the past, people are less mobile and travel was rare.` → `In the past, people were less mobile and travel was rare.` | Any prompt with a then-vs-now comparison | Present simple is the default for general truths; switch deliberately with an explicit time marker (`Until the 1990s…`, `Over the last decade…`) and switch back. |
| **`by` vs `to` with figures** | `Sales increased by 40% in 2010` when 40% is the level, not the change → `Sales increased **to** 40% in 2010.` · `rose to 20%` when 20 points is the change → `rose **by** 20 percentage points` | Every line, bar and table prompt | `by` = the size of the change; `to` = the level reached. Also `from X to Y` for a span, and `percentage points` vs `per cent` when the unit is itself a percentage. This error is nearly universal and nearly free to fix. |
| **Run-ons and comma splices** | `Cities are growing rapidly, this puts pressure on housing.` → `…rapidly, **and** this puts…` / `…rapidly. This puts…` / `…rapidly; this puts…` | Everywhere; worst in unplanned second halves written under time pressure | Teach the test: *if both sides could stand alone as sentences, a comma alone is not enough.* Three legal fixes: full stop, semicolon, or a coordinator after the comma. Punctuation sits inside GRA — it is not cosmetic. |
| **Word form** | `Technology has bring many benefit to the society.` → `…has brought many benefits to society.` · `The government should take responsible.` → `…take responsibility.` · `economical growth` → `economic growth` · `It is very interesting for me` → `I find it very interesting` (`-ed`/`-ing` adjectives) | Everywhere; a large slice of what examiners record under LR | Learn word families in fours: `success / succeed / successful / successfully`; `economy / economic / economical / economically`; `pollute / pollution / polluted / polluting`; `compete / competition / competitive / competitively`. Note `economic` (of the economy) vs `economical` (cheap to run) — a meaning distinction, not a spelling one. |
| **Relative clauses** | `people which` → `people who` · `The problem which we are facing it` → `The problem we are facing` · `Cars, which are expensive, and pollute.` (broken non-defining) → `Cars, which are expensive, also pollute.` | Task 2 body paragraphs; Task 1 category descriptions | Two rules: defining clause = no commas and no resumptive pronoun; non-defining = comma before *and after*, and the main clause must still be complete if you delete it. |
| **Modal / verb-pattern slips** | `I am agree with` → `I agree with` · `must to` → `must` · `can to reduce` → `can reduce` · `suggest to build` → `suggest building` / `suggest that they build` · `allow to do` → `allow people to do` | Task 2 opinion and solution paragraphs | Fix at the frame level, so the broken version never gets built: memorise correct stance openers (`I would argue that…`, `In my view…`, `There is a strong case for…`) and correct solution verbs (`suggest + -ing`, `recommend + -ing`, `propose + -ing`, `urge somebody to`). |
| **Conditionals** | `If the government would ban cars, the air will be cleaner.` → `If the government banned cars, the air would be cleaner.` | Solution and hypothetical prompts | Drill as a **fixed frame**, not a rule: `If + past simple, would + infinitive` for the unreal present. Attach it to every `what should be done` prompt, where it is the natural thing to write. |
| **Comparatives and superlatives** | `more higher` · `the most highest` · `same like` → `the same as` · `twice more than` → `twice as many as` / `twice the number of` | Every Task 1 prompt; any Task 2 comparison | One page: `-er/more`, `the -est/the most`, `as … as`, `twice/three times as … as`, `the same as`, `similar to`, `X times higher than`. Task 1 cannot be written without these. |

### 5.2 Punctuation and mechanics (inside GRA)

Named directly in the descriptors from band 5 upward, and one of the few places where a candidate
can lose marks for something they already know.

1. **Comma splice** — the single most common punctuation error in IELTS essays (§5.1).
2. **Missing comma after a fronted element** — `However the situation has changed.` →
   `However, the situation has changed.` Also after fronted subordinate clauses and adverbials:
   `Over the same period, …`.
3. **Comma incorrectly separating subject from verb** — `The rapid growth of online shopping, has
   changed the high street.`
4. **Capitalisation** — sentence-initial capitals, `I`, proper nouns, and *no* mid-sentence capitals
   on common nouns (`the Government should…` is a slip, not a style).
5. **Apostrophes** — `it's` (it is) vs `its` (possessive); `students'` vs `student's`; never on
   plurals (`1990s`, not `1990's`).
6. **Full stop discipline** — one idea, one sentence, one full stop. Very long sentences without
   punctuation read as loss of control even when technically legal.
7. **Quotation marks and exclamation marks** — no place in an academic script. Exclamation marks are
   acceptable in an informal GT letter and nowhere else.
8. **Paragraph breaks must be visible** — in a typed answer, a blank line or a clear indent. A wall
   of text with no breaks damages CC directly.

### 5.3 Register and appropriacy

| Slip | Where it is wrong | Where it is right |
|---|---|---|
| Contractions (`don't`, `it's`, `I'd`) | Task 2 essay; formal GT letter | Informal GT letter — and their absence there reads as wrong |
| Second person `you` | Task 2 (`you can see that…`) — use `one`, the passive, or a plural noun | Any GT letter, obviously |
| Rhetorical questions | Task 2 body paragraphs — they substitute for an argument | Informal letters, sparingly |
| `etc.`, `&`, `e.g.` mid-sentence, `govt`, `ppl` | Everywhere in a scored script | Nowhere |
| `a lot of`, `things`, `stuff`, `kids`, `big` | Task 2 — replace with `a substantial proportion of`, `factors`, `children`, `considerable` | Informal letters |
| Emotive intensifiers (`totally`, `absolutely`, `super`) | Task 2, formal letters | Informal letters |
| First person `I` | **Not** a slip in a Task 2 opinion essay — a clear position is required. But vary the stance markers: `In my view`, `I would argue`, `It seems to me`, `There is a strong case for` | — |

### 5.4 Spelling and word formation (inside LR)

- Spelling sits under **Lexical Resource**, not GRA, and the band-7 boundary is roughly "occasional"
  errors versus band 6's "some". A learner with fifteen misspellings will not reach 7 on LR
  regardless of range.
- **British and American spellings are both acceptable; mixing them within one script is not a
  formal penalty but reads as unreliable spelling.** Pick one and stay in it: `organise/organize`,
  `centre/center`, `programme/program`, `travelled/traveled`, `analyse/analyze`.
- The error cluster worth drilling is **word-formation spelling**, where adding a suffix changes the
  stem: `maintain → maintenance`, `pronounce → pronunciation`, `argue → argument`,
  `nine → ninth`, `benefit → benefiting/benefited` (one `t` in BrE too),
  `develop → development` (no `e`), `occur → occurring/occurrence`.
- Typing-specific note for us: our exam mode disables spellcheck (05 §3), which is correct for
  fidelity, and it means our annotation type `spelling` will carry real signal.

---

## 6. Vocabulary: what "less common lexis" means at band 7+, and the thesaurus trap

### 6.1 What it actually means

The band-7 descriptor asks for less common lexical items used with some awareness of **style and
collocation**. Every clause of that matters:

- **"Less common" means less common among learners, not rare in English.** Roughly C1 general-
  academic vocabulary — the kind of language an advanced coursebook teaches. `a shortage of
  affordable housing`, `disposable income`, `public health outcomes`, `an ageing population`,
  `to offset`, `to curb`, `to exacerbate`, `to phase out`, `a trade-off`, `at the expense of`,
  `on balance`, `to a limited extent`. Not `plethora`, `myriad`, `paradigm`, `ubiquitous`.
- **"With awareness of style"** means the word belongs in this genre. `Get worse` is fine
  conversationally; `deteriorate` is the essay word; `go downhill` is the letter-to-a-friend word.
  Using the wrong one is a style error even when the meaning is right.
- **"And collocation"** means the partners are right. This is the majority of what is actually lost
  (§3.4).

Three places band-7 lexis is visible in a script, and they are all teachable per-prompt:

1. **Precise verbs where band 6 uses a general one.** `The policy reduced congestion` → `the policy
   eased congestion` / `curbed`, `alleviated`, `blunted` — chosen for shade, not for size.
2. **Topic-specific noun phrases.** Every one of our twenty topics has ten of them and they are what
   makes a script sound like it is about something. `road pricing`, `catchment area`, `renewable
   capacity`, `screen time`, `job security`, `a skills shortage`, `crop yields`, `waste to landfill`.
3. **Evaluative and hedging language.** `arguably`, `on balance`, `to a degree`, `at least in the
   short term`, `broadly speaking`, `it is far from clear that`. This is where a band-7 script
   sounds like it is thinking rather than asserting, and it directly fixes the over-generalisation
   named in the band-7 criterion-1 descriptor.

### 6.2 Why a thesaurus word used wrongly scores *lower* than a plain word used correctly

This should be said explicitly in learner copy, because the belief that rare = high is the single
most damaging vocabulary myth in the module.

- A plain, correct word costs **nothing**. It is simply not evidence of range; range comes from
  elsewhere in the script.
- A misused rare word costs **twice**: it is a word-choice error *and*, almost always, a collocation
  error — and the band-7 descriptor's phrasing makes awareness of style and collocation the thing
  being credited, so a misfire is direct counter-evidence. It can also make the sentence harder to
  read, which touches CC.
- Authored examples of the trap, with what to write instead:

| The reach | Why it misfires | Write instead |
|---|---|---|
| `a plethora of people` | `plethora` means an unhealthy excess, and it doesn't partner with people | `a significant proportion of people` |
| `a gargantuan problem` | register: fits a comic novel, not a report | `a pressing problem` / `a serious problem` |
| `ameliorate the citizens` | you ameliorate a condition, not a person | `improve conditions for residents` |
| `escalate the number of graduates` | `escalate` is for conflicts and costs getting worse | `increase the number of graduates` |
| `paramount` used for every important thing | over-strong, and it collocates with `importance`, not with objects | `crucial`, `central`, `a priority` |
| `utilise` for `use` | grammatical, adds nothing, and marks the script as trying | `use` |
| `mass conveyance systems` for `public transport` | invented collocation; costs LR and CC (§3.5) | `public transport`, then `it` |

- **The rule to ship, in our words:** *reach for the less common item only where you have seen it in
  this exact partnership. Where you haven't, the exactly-right common word is the higher-scoring
  choice.* Chronic simplification is a systematic penalty and a genuine ceiling; an occasional
  misfire is not. The calibration is "reach where you are reasonably sure", not "never reach"
  (cf. speaking R3 §3.5).

---

## 7. How the two tasks combine, and the penalty structure

### 7.1 Combining the tasks

- Each task is scored independently on its own four criteria and its own descriptor table.
- The reported Writing sub-score weights **Task 2 twice as heavily as Task 1**, i.e.
  `(T1 + 2×T2) / 3`, rounded to the nearest half band.
- Consequence worth teaching: **a band 6 on Task 1 and a band 7.5 on Task 2 still reports as 7.0**,
  while the reverse (7.5 / 6) reports as 6.5. Time spent perfecting Task 1 at Task 2's expense is
  the worst trade in the module (§4 row 12).
- **Uncertainty**: the 1:2 weighting is consistently reported across preparation sources and is
  treated as settled by teachers, but it is **not printed in the public band-descriptor document**,
  and the exact rounding step (whether the weighted mean is rounded once at the end or the task
  bands are rounded first) is not published either. See §9.1 for what our copy should say.

### 7.2 Under-length

- The minimums are **150 words (Task 1)** and **250 words (Task 2)**.
- The public descriptors carry **no numeric word-count penalty table**. An under-length answer is
  marked down under **criterion 1** for the straightforward reason that it cannot have covered the
  task fully, and it usually drags CC (no room to develop or to paragraph) and LR (no room to show
  range) with it. So the effect is compounding rather than a flat deduction.
- Older preparation material describes a mechanical deduction; current material describes the
  criterion-1 route. **Both agree the answer is that under-length is expensive** — we should teach
  the compounding version, which is both more accurate and more motivating, and we should not
  invent a deduction table. (§9.2)
- Practical target to teach: **170–190** on Task 1, **270–290** on Task 2. Comfortably clear of the
  floor, and short enough to leave proofreading time. There is **no credit for extra length**, and
  long answers acquire more errors.
- Our pre-check (05 §5) already implements this correctly: a hard block below 50 words, a warn below
  the minimum, and the shortfall passed to the evaluator so criterion 1 is marked as an examiner
  would mark it.

### 7.3 Off-topic and partly off-topic

- The public scale is explicit at the bottom end: an answer **completely unrelated** to the task
  sits at the floor of criterion 1, and an answer **barely related** to it sits just above. So
  off-topic is a criterion-1 phenomenon, not a global disqualification.
- The far more common and more teachable case is **partial off-topic**: an essay that answers the
  general subject rather than the specific question, or that answers only one half of a two-part
  question. That lands in the band-5/6 region on criterion 1 and is what §4 row 1 attacks.
- The other three criteria are still marked on the language that is there. A fluent, well-organised
  off-topic essay does not score zero — it scores a low criterion 1 and a normal-ish CC/LR/GRA,
  which is exactly why the arithmetic still hurts (one criterion at 4 pulls a 7/7/7 script to 6.25
  → 6.5 on that task).
- Our off-topic pre-check (05 §5, Jaccard < 0.03) is a *warn*, never a block. That is the right
  call — the learner's judgement, and a genuinely creative but on-topic essay can score low overlap.

### 7.4 Memorised responses and templates

- **Fact, publishable:** the published scale's zero band covers, alongside not attending and not
  attempting the task, a response that is **entirely memorised**. This is a stronger statement than
  the speaking scale makes and we may state it as a fact about the scale.
- **Not a fact, and we must not imply it is:** that a memorised *introduction*, a template
  structure, or a stock linking phrase triggers that band. It does not. What actually happens to
  templated writing is more mundane and more useful to teach: (a) memorised sentences are usually
  generic, so they carry no task-specific content and earn nothing on criterion 1; (b) they create
  a visible quality seam between the polished template and the candidate's own prose; (c) heavy
  templating is marked down as mechanical/formulaic under CC and LR.
- **What to teach instead:** prepare *structures and language functions*, not sentences (cf.
  speaking R3 §7). A skeleton that tells you what each paragraph must *do* is preparation; a
  skeleton with the words already in it is a script.
- Our own templates library (05 §9) is on the right side of this line by design — it ships
  frameworks and functional language, never auto-inserts, and copies to clipboard rather than to the
  editor. The `teaching_note` on every template should say *why* it is a shape and not a sentence.

### 7.5 Copying from the prompt

- Strings copied verbatim from the task are **discounted from the word count** by the examiner, and
  they demonstrate no vocabulary, so they cost on LR as well. This is stated in official preparation
  guidance for Academic Task 1 and applies across the module.
- Practical rule: paraphrase the task line in the first sentence, and accept that **technical terms
  that have no synonym stay as they are** — you cannot paraphrase `carbon dioxide`, `unemployment
  rate` or the axis labels of a chart, and trying to is itself a lexical error.
- Our prompt-copy pre-check (05 §5, longest common run ≥ 20 words) is well-calibrated for this.

### 7.6 Format and note form

- Criterion 1 at band 5 flags an inappropriate **format**. In practice this covers: an essay
  submitted as bullet points or notes, a letter without a greeting or sign-off, a report written as
  a personal opinion piece, and an Academic Task 1 answer written as an essay with a thesis.
- **Uncertainty:** we found no published statement of a specific mechanical penalty for note-form
  answers beyond the criterion-1 format bullet. Our copy should say the format is marked under
  criterion 1 and stop there. (§9.5)

---

## 8. How this should land in our content (recommendation to the design agent)

`WritingPromptRow` is `extra="allow"` (verified in `sidecar/bandready/content/validate.py:151`), so
teaching material can ride along on `writing_prompts.jsonl` rows with no migration and no code
change. Suggested per-prompt fields — **proposal, not a decision**; the design agent owns the final
schema:

- `teaching.band_move` — one sentence naming the specific 6→7 behaviour this prompt trains, drawn
  from §3. This is the rankable top item the report headline uses (cf. speaking DESIGN.md F5).
- `teaching.task_shape` — the obligatory paragraph plan for this task type and genre
  (§3.1/§3.7/§3.8). For `task2` this is where §4 row 1 gets fixed: the essay type's required move.
- `teaching.model_answers[]` — **bands 5/6/7/8 or 6/7/8 telling the SAME argument with the SAME
  examples**, span-annotated against the four criteria, so the learner sees that the gap is language
  and not ideas. This is the speaking module's highest-impact surface transplanted (DESIGN.md §3.8),
  and it is the single biggest content gap in writing today. Gate it behind a real attempt.
- `teaching.error_watchlist[]` — exactly **2** patterns from §5, chosen because *this prompt's
  content forces them*, each with an authored wrong/right pair **in this prompt's subject matter**
  and a criterion tag (`GRA` | `LR` | `CC` | `TA`). Ordered highest-impact first.
- `teaching.collocations[]` — 6–10 items, each `{chunk, model_sentence}`, with prepositions
  attached. For `ac_task1` this must include the trend/comparison bank for *this chart kind*
  (§3.4); for `gt_task1` the register bank for *this register* (§3.8).
- `teaching.upgrade_pairs[]` — `{vague, precise}` in this prompt's subject (§6.1), plus at least one
  `{overreach, hedged}` pair to attack over-generalisation.
- `teaching.target_structures[]` — 1–2 from §3.3(a), each shipped with the accuracy trap it carries.
- `teaching.plan` — the time budget for this task type (§4 row 12) plus a worked outline in
  note form, capped short so it cannot be copied as prose.
- `teaching.checklist[]` — 4–6 items the learner runs in the last three minutes, prompt-specific
  (§4 row 11). For `task2`, always include the topic-sentence cover test (§3.1).

Constraints authors should honour:

- **Rankable.** The report gives one headline improvement, so `band_move` and `error_watchlist[0]`
  must be a decision, not a list.
- **Actionable this week.** "Improve your cohesion" is not a note. "Replace the second `Moreover`
  with a `this shift` reference back to the previous sentence" is.
- **Originally authored, always.** Model answers, chart data, letter scenarios and essay prompts are
  all written from scratch. Chart numbers must be invented and internally consistent — a real
  dataset is somebody's copyright and a wrong-looking dataset is a teaching liability.
- **Task 2 gets twice the content.** It is worth twice the band (§7.1) and our curriculum already
  targets a 2:1 practice ratio (05 §1).

### 8.1 Two findings that need a product decision

1. **Our rubric collapses a distinction the real scale makes.** `WRITING_DESCRIPTORS["ta"]` in
   `sidecar/bandready/scoring/rubrics.py` carries one paraphrase per band for criterion 1, but the
   published scale has **three variants**: Academic Task 1, General Training Task 1, and Task 2 —
   and they diverge substantially at bands 5, 6 and 7 (§2.1). The evaluator prompt (05 §6.2) already
   branches per task type in its instructions, but the descriptor table it renders does not. §2.1's
   three tables are drop-in replacements. Recommendation: make `descriptor_table` take the task
   type for `ta` and return the right variant, and surface the right one in the report.
2. **There is no "Writing overall" surface.** We score a submission; we never combine a Task 1 and a
   Task 2 attempt into a reported Writing band with the 1:2 weighting (§7.1). Until we do, a learner
   cannot see the thing they actually care about, and cannot learn the time-allocation lesson in
   §4 row 12. Recommendation: a paired-attempt estimator on the writing home screen, with the
   weighting stated and the uncertainty in §9.1 acknowledged in a footnote.

---

## 9. Where sources disagree, or are silent (be honest about this in our copy)

1. **The 1:2 task weighting.** Universally reported by preparation providers and teachers, and
   coherent with the time and word-count allocation. **Not stated in the public band-descriptor
   document**, and the rounding order is not published anywhere authoritative. Our copy should say
   "Task 2 is worth roughly twice Task 1" and, where we compute a combined figure, label it an
   **estimate**. We must not present our arithmetic as the official calculation.
2. **The under-length penalty.** Older material describes a mechanical word-count deduction; current
   material describes a criterion-1 penalty. The public descriptors specify neither. We teach the
   criterion-1 route (§7.2) and we do not publish a deduction table.
3. **"No overview caps Academic Task 1 at band 5."** Very widely taught. What is actually published
   is that the band-5 Academic bullet describes detail recounted mechanically with no clear
   overview, while band 7 requires a clear overview. The "cap" is a reasonable *inference* from
   those two bullets, not a published rule, and it ignores that criterion 1 is one of four criteria.
   Our copy should say the overview is what separates the band-5 and band-7 descriptions of
   criterion 1 — which is true, checkable, and just as motivating.
4. **Memorised answers.** The zero band covering a totally memorised response is published fact
   (§7.4). Claims that templated introductions, memorised linkers or "known template structures"
   trigger a zero, a disqualification, or a fixed cap are **not** supported by any published rule
   and we must not repeat them. Our copy should say memorised prose earns nothing on task response,
   is visible as a quality seam, and is marked down as formulaic.
5. **Note-form and format penalties.** Beyond the criterion-1 format bullet, no published mechanical
   penalty was found. Say what the descriptor says; say nothing more.
6. **British vs American spelling.** Both are accepted; the claim that *mixing* them is itself
   penalised is teacher consensus rather than published policy. We teach consistency as a signal of
   reliable spelling, not as a rule (§5.4).
7. **Error-frequency ordering.** The IELTS-specific corpus study we found (70 essays, 589 coded
   errors) puts **word choice** first at ~24% and **verb form** second at ~18%. Broader ESL writing
   studies rank subject–verb agreement, tense, noun/number, preposition and article differently.
   The ordering in §5.1 is **our informed judgement for IELTS-style writing**, weighted towards
   errors that are (a) frequent, (b) visible to an examiner, and (c) fixable in a week — not a
   citation of measured frequencies. The one strong cross-source signal we do rely on: *lexical
   choice and collocation, not missing vocabulary, is where LR is lost* (§3.4, §6.2).
8. **"Band descriptors updated for 2025/2026" posts.** Several commercial sites advertise revised
   criteria. Nothing in the published public descriptor document supports a substantive change to
   the four criteria or their band content. We treat the criteria as stable and cite the published
   version only.
9. **Number of error-free sentences needed for band 7.** No published threshold exists. Coaching
   material offers various fractions. We describe the property qualitatively — *clean sentences
   often enough that the reader notices a run of them* — and never quote a percentage.

---

## 10. Sources

**Official / test-partner (weighted highest; read to paraphrase, never reproduced):**

- [WRITING TASK 1 and TASK 2: Band Descriptors (public version) — IELTS (British Council / IDP / Cambridge), PDF](https://assets.ctfassets.net/unrdeg6se4ke/19SJoSvnUYjrHgVhWvuMnC/42f1b0cb0d7709646a1392d8418646d0/writingbanddescriptorstask1and2.pdf) — the primary source for §2 and §7.3/§7.4/§7.6. Both task tables, bands 0–9, all four criteria, including the Academic/General Training split on Task 1 criterion 1 and the band-0 memorised-response bullet.
- [Preparing learners for Task 1 on the IELTS Academic Writing test — ielts.org](https://ielts.org/news-and-insights/preparing-learners-for-task-1-on-the-ielts-academic-writing-test) — official guidance on selecting key features, the figure-free overview, and copied prompt language not counting toward the word count (§3.7, §7.5).
- [A close look at what IELTS Writing band scores mean — IDP IELTS](https://ielts.idp.com/results/scores/writing) — criterion definitions; confirms the criteria are identical for Academic and General Training and that the two tasks are scored separately.
- [The A to Z of IELTS: G is for Grammatical Range and Accuracy — IDP IELTS](https://ielts.idp.com/canada/prepare/article-grammatical-range-accuracy) — official statement that an error-free script written entirely in short sentences cannot score highly, and that comma-for-full-stop run-ons are the commonest punctuation fault (§2.5, §5.2).
- [IELTS writing prep: coherence and cohesion — IDP IELTS](https://ielts.idp.com/prepare/article-ielts-writing-prep-coherence-and-cohesion) — coherence-vs-cohesion definition used in §3.5.
- [Your Guide to IELTS Writing Coherence and Cohesion — IELTS Australia (IDP)](https://ielts.com.au/australia/about/news-and-articles/article-ielts-writing-guide-coherence-cohesion)
- [IELTS General Training Writing Task 1: how to write a letter — IDP IELTS](https://ielts.idp.com/prepare/article-ielts-general-training-writing-task-1-write-a-letter) — register selection from the recipient (§3.8).
- [The A to Z of IELTS: L is for Lexical Resource — IDP IELTS](https://ielts.idp.com/prepare/article-l-is-for-lexical-resource) — §6.1.
- [IELTS Academic Writing test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing) — timings, word minimums, task structure.
- [IELTS Common Spelling Mistakes — IDP IELTS Canada](https://ielts.idp.com/canada/prepare/article-ielts-common-spelling-mistakes) and [Common spelling mistakes in the IELTS test — IELTS Australia](https://ielts.co.nz/newzealand/about/news-and-articles/article-ielts-common-spelling-mistakes) — §5.4.

**Research literature (§5.1, §9.7):**

- [A Corpus-based Study of EFL Learners' Errors in IELTS Essay Writing — Academia.edu](https://www.academia.edu/86936550/A_Corpus_based_Study_of_EFL_Learners_Errors_in_IELTS_Essay_Writing) — 70 IELTS essays, 589 errors across 13 categories; word choice ~24.4% and verb form ~17.7% are the two largest. The main quantitative support for §3.4's claim that LR is lost to choice and collocation.
- [Grammar Errors Made by ESL Tertiary Students in Writing — ERIC (EJ1137462)](https://files.eric.ed.gov/fulltext/EJ1137462.pdf) — the broader subject–verb agreement > tense > noun/number > preposition > article ranking, referenced with the caveat in §9.7.

**Teacher / examiner commentary (treated as informed opinion, not authority — used for §3, §4, §5):**

- [IELTS Writing Penalty for Being Under Words — IELTS Liz](https://ieltsliz.com/ielts-penalty-for-writing-under-word-count/) and [New IELTS Word Count Rules — My IELTS Classroom](https://blog.myieltsclassroom.com/new-ielts-word-count-rules/) — the two positions on under-length reconciled in §7.2/§9.2.
- [IELTS Writing Scoring: are Task 1 and Task 2 equal value? — IELTS Liz](https://ieltsliz.com/ielts-writing-scoring/) and [Task 1 / Task 2 weighting explained — Cathoven](https://resources.cathoven.com/ielts-writing-task-2/band-score-weighting) — §7.1.
- [How IELTS Writing Task 1 is Scored: Bands 5 to 8 — IELTS Liz](https://ieltsliz.com/ielts-writing-task-1-band-scores/) — §2.1 calibration for Academic Task 1.
- [IELTS Writing Task 1 Overview Paragraph — Cathoven](https://resources.cathoven.com/ielts-writing-task-1/overview) and [IELTS Writing Task 1 Band Score Guide: what examiners actually mark — Career Wise English](https://careerwiseenglish.com.au/ielts-writing-task-1-band-score-guide/) — the "no overview" claim examined in §9.3.
- [What Are Less Common Lexical Items? — IELTS Charlie](https://ieltscharlie.com/less-common-lexical-items/) — the C1-not-rare framing in §6.1.
- [5 Common IELTS Lexical Resource Mistakes — My IELTS Classroom](https://blog.myieltsclassroom.com/5-common-ielts-lexical-resource-mistakes/) — the thesaurus trap (§6.2).
- [Collocations in IELTS: learn collocations to get Band 7+ — IELTS Focus](https://ieltsfocus.com/2017/08/02/collocations-ielts/) — §3.4.
- [IELTS Mistakes: The Comma Splice — TED IELTS](https://ted-ielts.com/ielts-mistakes-the-comma-splice/) and [IELTS Punctuation: Commas — My IELTS Classroom](https://blog.myieltsclassroom.com/ielts-punctuation-commas/) — §5.2.
- [IELTS Task 2 Idea Development: how to improve Task Response — Learn English Weekly](https://learnenglishweekly.com/ielts/task-2/idea-development) and [Why you need to support your main ideas — How to do IELTS](https://howtodoielts.com/ielts-writing-task-2-why-support-main-ideas/) — the development argument behind §3.2.
- [How to improve IELTS Writing Task 2 from Band 6.5 to 7 — Career Wise English](https://careerwiseenglish.com.au/how-to-improve-ielts-writing-task-2-from-band-6-5-to-7/), [Why you're stuck at 6.5 in IELTS Writing — Tiju's Academy](https://tijusacademy.com/blogs/ielts/ielts-writing/why-youre-stuck-at-6-5-in-ielts-writing), [Why IELTS band scores don't improve — Learn English Weekly](https://learnenglishweekly.com/ielts/examiner/why-ielts-band-scores-dont-improve), [Have you hit an IELTS plateau? — IELTS ETC](https://ieltsetc.com/2019/10/have-you-hit-an-ielts-plateau/) — the plateau causes in §4.
- [Tackling common errors in IELTS Academic Task 1 — IDP Qatar / IFI](https://ifi.qa/ielts-academic-writing-task-1-common-errors/) and [Task 1 common issues — IELTS Answers](https://www.ieltsanswers.com/task-1-common-issues.html) — §3.7 and the `by`/`to` trap in §5.1.
- [IELTS General Task 1: tone mistakes to avoid — IELTS International](https://www.ielts.international/ielts-preparation-tips/writing-task-1-general) — §3.8.
- [Want to improve your IELTS paraphrasing? — My IELTS Classroom](https://blog.myieltsclassroom.com/ielts-paraphrasing/) and [How to paraphrase in IELTS — IELTS Liz](https://ieltsliz.com/how-to-paraphrase-in-ielts/) — §7.5, including the "some terms have no synonym" point.
- [Should you memorise sample essays for IELTS? — IELTS Mumbai](https://ieltsmumbai.com/blog/ielts-writing-task-2-should-you-memorize-sample-essays-for-ielts) and [How to avoid getting penalised or disqualified — IELTS-Blog](https://www.ielts-blog.com/ielts-preparation-tips/ielts-writing-how-to-avoid-getting-penalized-or-disqualified/) — used only to identify the *claims in circulation* that §9.4 rejects; no claim in §7.4 rests on them.
- [IELTS Spelling: British or American? — IELTS-Blog](https://www.ielts-blog.com/ielts-preparation-tips/writing-tips/ielts-spelling-british-or-american/) — §5.4, with the caveat in §9.6.

**Not used as authority:** commercial "band descriptors 2025/2026 updated" listicles, AI-scoring
vendor blogs, and any page offering "band 9 sample essays". Where a point appeared only in that
tier it is either omitted above or flagged in §9. No sample answer from any source was read for
content or reused in any form.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge
University Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of
them. No exam material is reproduced in this document; every example sentence, wrong/right pair,
collocation and model phrase above is original text authored for BandReady.*
