# W-R2 — Writing Task 2: the operational briefing

**Audience:** the writing design agent (who defines the `teaching` payload) and the Task 2 authoring
agents (who write prompts and model answers). This is a research briefing, not an authoring contract.
Where this file and the eventual `staging-writing/DESIGN.md` disagree, DESIGN.md wins.

**Method:** web research across official IELTS-owner pages (ielts.org, IDP, British Council) and the
better teaching literature, cross-checked against the repo's own constraints
(`sidecar/bandready/scoring/writing.py`, `sidecar/bandready/content/validate.py`,
`content/core-en/data/writing_prompts.jsonl`). Every claim below carries a confidence marker:

- **[F]** — fact about the exam, corroborated by an owner-operated source (ielts.org / IDP / British Council).
- **[C]** — consensus across three or more independent teaching sources; safe to teach.
- **[?]** — contested or single-source; teach the behaviour, not the claim. Flagged inline.

### Copyright posture for everything downstream

The exam's **format, timing, weighting, rubric structure, question types and recurring topic areas**
are facts about a public examination and are used freely here. **Band descriptor prose is
copyrighted text** — §8 below is a clean-room paraphrase describing *observable behaviours in a
script*, and downstream agents must reuse §8's wording rather than any descriptor wording.
**No prompt, no chart, no essay and no sentence in this file was transcribed from anywhere.** Topic
*areas* and *sub-angles* below are categories, deliberately written as noun phrases, never as
question wording — an authoring agent must compose the actual prompt sentence from scratch.
Product copy says "IELTS-style" and carries the non-affiliation notice.

---

## 1. The task, measured

| Property | Value | Conf |
|---|---|---|
| Time recommended | 40 minutes (of a 60-minute Writing paper) | **[F]** |
| Word minimum | 250 words | **[F]** |
| Weighting vs Task 1 | Task 2 carries **more weight**; the working formula in the teaching literature is `Writing = (T1 × 1/3) + (T2 × 2/3)`, rounded to the nearest half band | **[F]** that T2 weighs more (ielts.org states it explicitly); **[C]** for the exact 1/3–2/3 arithmetic |
| Criteria | Task Response · Coherence and Cohesion · Lexical Resource · Grammatical Range and Accuracy | **[F]** |
| Criterion weighting *within* the task | The four are weighted equally (25% each) | **[F]** — ielts.org: "the criteria are weighted equally" |
| Same task in Academic and General Training? | Yes — Task 2 is an essay in both. Only Task 1 differs (chart vs letter). GT Task 2 topics tend to be pitched slightly more everyday, Academic slightly more abstract | **[C]** |
| Typical planning split | ~5 min plan · ~30 min write · ~5 min check | **[C]** |
| Target length in practice | 260–290 words. Long enough to clear 250 comfortably after the examiner discounts copied prompt wording; short enough to finish and check | **[C]** |

### 1.1 The instruction line

The paper's rubric wraps the topic in fixed framing text: a line telling the candidate roughly how
long to spend, a "write about the following topic" line, then the topic statement, then the task
question, then a line asking for reasons and relevant examples from the candidate's own knowledge or
experience, then the word minimum. **[F]** — this framing is visible in the publicly published sample
tasks on ielts.org.

**The repo already implements this.** All six existing `task2` rows in
`content/core-en/data/writing_prompts.jsonl` use one house format, and every new Task 2 prompt must
match it exactly — the editor, timer, precheck and evaluator all key off it:

```
Write about the following topic:

<situation statement — 1 or 2 sentences setting up the issue>

<the task question — the line that decides the genre>

Give reasons for your answer and include any relevant examples from your own knowledge or experience.

Write at least 250 words.
```

Blank line between blocks; no bullet points; no heading. `chart_spec` and `letter_bullets` stay
`null` for `task2`.

### 1.2 What the situation statement is for

The two-sentence setup is not decoration. It is what stops a prompt being answerable from a
memorised essay: it narrows a broad theme ("technology") to a specific claim ("universities teaching
degree courses in English rather than the national language"). A prompt whose statement is as broad
as its theme is a bad prompt, because it can be answered without reading it. **[C]**, and it is the
single most useful authoring heuristic in this file.

---

## 2. The question types

The repo's `scoring/writing.py` fixes exactly five `task2` genres. **Do not invent a sixth.** The
real exam's question wordings are more numerous than five; they map onto these five as follows.

| Repo genre | Real wordings that live here | Opinion required? |
|---|---|---|
| `opinion` | "to what extent do you agree or disagree" · "do you agree or disagree" · "is this a positive or a negative development" · "is this a good thing or a bad thing" · "how far do you agree" | **Yes — always** |
| `discussion` | "discuss both these views and give your own opinion" · rarely "discuss both views" alone | **Yes**, unless the "and give your own opinion" clause is genuinely absent |
| `problem_solution` | "what problems does this cause and what can be done" · "what are the causes and what solutions can you suggest" · "why is this a problem and how could it be addressed" | No — but a recommendation is implicit |
| `two_part` | two direct questions, e.g. a *why* question plus an *effects* question, or a *why* plus a *positive/negative* | Only if one of the two questions asks for one |
| `advantages_disadvantages` | "discuss the advantages and disadvantages" (neutral) · "do the advantages outweigh the disadvantages" (evaluative) | **Only for the "outweigh" variant** |

Distribution in the wild is roughly: opinion and discussion together are about half of all tasks;
advantages/disadvantages and problem/solution make up most of the rest; two-part is the least
frequent but is over-represented in recent years. **[?]** — no owner-published frequency table exists;
this is aggregated from coaching-site question logs, so treat it as a sampling guide, not a fact.
Recommended pack distribution: opinion 30% · discussion 25% · advantages_disadvantages 18% ·
problem_solution 17% · two_part 10%.

---

### 2.1 `opinion` — agree/disagree, "to what extent", positive/negative

**What a full response requires**

1. A position stated **in the introduction**, not withheld until the conclusion.
2. The **same** position sustained through every body paragraph and restated in the conclusion.
3. Two (occasionally three) reasons, each **extended and supported**, not merely named.
4. The position must answer the *degree* the question asked for. "To what extent" invites a
   calibrated answer — largely, partly, only in one respect — and a calibrated answer is a valid
   band 9 answer **[C]**. A flat agree is also a valid band 9 answer. What is *not* valid is a
   position the reader has to infer.

**Legitimate shapes** (all can score at the top; the choice is strategic, not scored):

- **One-sided.** Both body paragraphs argue the same side. Structurally the safest — the essay cannot
  contradict itself — and the fastest to write. Recommend this as the default for time-pressured
  learners **[C]**.
- **Partial agreement.** Body 1: the respect in which the statement holds. Body 2: the respect in
  which it does not. The introduction must say *which way you lean*, or this collapses into a
  no-position essay.
- **Concede-then-argue.** A short concession inside body 1's opening, then the paragraph turns and
  argues your side. Cheap sophistication; low structural risk.

**How candidates under-answer it**

- **Fence-sitting.** They present both sides evenly and never say which they hold. This is read as
  *no position* and is a Task Response cap, not a stylistic preference.
- **Position drift.** Introduction agrees; body 2 argues against; conclusion hedges. Consistency is
  explicitly part of what Task Response measures **[F]**.
- **Answering the theme, not the claim.** The statement says *private cars banned from city centres*;
  the essay argues *pollution is bad*. Everything on the wider theme rather than the specific claim
  is irrelevant material **[C]** — and irrelevant material is not just unrewarded, it dilutes.
- **Ignoring "to what extent".** They write a binary answer when the question invited a degree — not
  fatal, but a missed opportunity that leaves the response thinner than it needed to be.
- **Positive/negative treated as advantages/disadvantages.** "Is this a positive or negative
  development" is an *opinion* question wearing a two-sided costume. Listing pros and cons and
  declining to judge under-answers it **[C]**.

---

### 2.2 `discussion` — "discuss both these views and give your own opinion"

**What a full response requires**

1. **View A discussed** — presented as somebody's position, with the reasoning behind it, extended.
2. **View B discussed** — same treatment, comparable depth. Grossly unequal coverage under-answers.
3. **The candidate's own opinion**, stated clearly, and — this is the part that separates 6 from 7 —
   **visible from the introduction onwards**, not smuggled into the last sentence.
4. The opinion must be *responsive* to the two views: it may side with one, side with one in a
   qualified way, or occupy a third position — but it must engage what was just discussed.

**The trap — call this out explicitly in the product**

> **Omitting the opinion is the single most damaging error in Task 2.** The task has three parts, not
> two. A candidate who discusses both views beautifully and never says what *they* think has not
> completed the task, and no quality of language rescues it. **[C]** — this is the most uniformly
> agreed point across every source consulted, and it deserves a dedicated UI surface: a
> "did you answer all parts?" checklist that names the opinion as a distinct part.

Two lesser variants of the same failure, both worth naming separately in teaching content:

- **The last-sentence opinion.** The opinion appears once, in the final clause of the conclusion.
  Technically present, but the position is not *clear throughout*, so it sits at the top of band 6
  rather than in band 7.
- **The invisible opinion.** Body paragraphs report "some people believe… others argue…" for 250
  words. The examiner can see the candidate's views nowhere in the essay.

**Other ways candidates under-answer it**

- **Lopsided discussion.** 180 words on view A, 40 on view B. Both views must be *discussed*, which
  means reasons and support for each, not a sentence of acknowledgement.
- **Straw-manning view B** so the opinion is unearned. If the opposing view is only stated to be
  demolished in one clause, it was not discussed.
- **Contradiction.** Body 1 argues *for* view A so persuasively that a conclusion siding with B reads
  as incoherent. Fix: signal the lean early, and write body 1 with reporting distance
  ("proponents point to…") rather than advocacy.
- **Turning it into agree/disagree.** Arguing only one side and never presenting the other. Half the
  task missing.

---

### 2.3 `problem_solution` — problems/solutions and causes/solutions

**What a full response requires**

1. Both halves answered, with roughly balanced weight.
2. **Solutions that address the causes actually named.** This is the criterion-relevant point and
   almost nobody teaches it: if body 1 blames weak regulation, body 2 must reach for regulation, not
   for an unrelated public-awareness campaign. Logical linkage between the halves is what makes the
   essay coherent rather than two essays stapled together **[C]**.
3. **Depth over breadth.** Two well-developed problems and two matching solutions beat five of each.
   The plural in the question wording does not mandate a long list; one problem and one solution,
   each fully developed, is acceptable and often stronger, though two/two is the safer default **[C]**.
4. Solutions must be **specific and agentive** — who does what. "The government should raise
   awareness" is an assertion; "requiring employers above a headcount threshold to fund a workplace
   scheme, as several health services already do for smoking" is a solution.

**Watch the wording carefully.** *Causes* and *problems* are not the same question. "Why is this
happening?" asks for causes (upstream). "What problems does this cause?" asks for effects
(downstream). A candidate who answers the wrong one has answered a different task.

**How candidates under-answer it**

- **Cause/effect confusion** — the error above; very common and completely invisible to the candidate.
- **Solutions detached from causes** — the two halves don't talk to each other.
- **The list essay.** Four problems and four solutions, one sentence each, nothing developed. This is
  the classic problem/solution failure mode because the question's plural invites listing.
- **Utopian solutions** with no mechanism ("people should be more responsible") — assertion dressed
  as a proposal.
- **Only one half answered.** Usually the solutions half, because the candidate runs out of time —
  which is a planning failure, not a language failure, and should be taught as one.

---

### 2.4 `two_part` — two direct questions

**Recognition:** two question marks, two genuinely different asks. Common pairings: *why + effects*,
*why + positive-or-negative*, *why + solutions*, *is this good + what should be done*.

**What a full response requires**

1. **Both questions answered, in comparable depth.** The default and safest structure is one body
   paragraph per question **[C]**.
2. **Both signalled in the introduction and both revisited in the conclusion.** This is what makes the
   completeness legible to a reader working fast.
3. If either sub-question asks for an opinion (*is this positive or negative?*), that opinion carries
   the same requirements as §2.1 — stated, clear, sustained.

**How candidates under-answer it**

- **One question swallows the essay.** Question 1 gets 200 words, question 2 gets 50. This is the
  dominant failure and it is caused by not planning both answers before writing the first.
- **Silently dropping a question.** They notice at the end and bolt one sentence onto the conclusion.
- **Answering an adjacent question.** Asked *why people prefer X*, they answer *what X is*, or drift
  into whether X is good.
- **Merging the two into one blurred paragraph** so neither is clearly answered.

---

### 2.5 `advantages_disadvantages`

Two sub-types that must be taught as different tasks, because the second requires something the
first does not.

**(a) "Discuss the advantages and disadvantages" — neutral.**
Requires: advantages presented and developed; disadvantages presented and developed; balanced
coverage. An opinion is *not* required, and the conclusion may fairly summarise both sides **[C]**.
Adding a light overall judgement is not penalised, so the safe teaching line is: a judgement is
optional here but never harmful.

**(b) "Do the advantages outweigh the disadvantages?" — evaluative.**
Requires everything in (a) **plus an explicit verdict**, stated in the introduction and restated in
the conclusion. "Outweigh" is a question about *weight*, not about *count* — three trivial advantages
do not outweigh one serious disadvantage, and saying so explicitly is exactly the kind of reasoning
that lifts Task Response **[C]**. The strongest version of this essay concedes that the losing side
is real and then explains *why* it weighs less.

**How candidates under-answer it**

- **Treating (b) as (a)** — listing both sides, no verdict. This is the advantages/disadvantages
  equivalent of the discussion-essay opinion trap and is nearly as common.
- **Counting instead of weighing** — "there are three advantages and two disadvantages, therefore…".
- **A verdict that appears only in the conclusion**, with two neutral body paragraphs before it.
- **Unbalanced coverage in the neutral variant** — 200 words of advantages, 40 of disadvantages.
- **Restating the same advantage twice** in different words to fill the paragraph.

---

## 3. Topic areas that recur, with sub-angles

Aggregated from owner-operated topic guidance (IDP's common-topics article) and from several
independent recent-question aggregations. Frequency shares quoted by aggregators — education ~22%,
technology ~20%, environment ~18%, health ~15%, government/society ~15%, crime ~10% — are **[?]**;
no owner publishes a distribution. Treat the *ordering* as reliable and the percentages as
indicative.

The right-hand column maps each area to the `topic_id`s available in `data/topics.jsonl`. Several
areas have no perfect home id; the mapping given is the nearest defensible one, and the design agent
should decide whether to add ids or accept the approximation. **Do not invent topic_ids** — validation
resolves them against `topics.jsonl`.

### Tier 1 — the spine (expect heavy coverage)

| # | Area | Sub-angles | `topic_id` |
|---|---|---|---|
| 1 | **Education** | online vs campus delivery · tuition fees and who pays · academic vs vocational training · exams as assessment · subject choice and compulsory subjects · class size and teacher pay · homework and school hours · single-sex vs mixed schooling · learning a second language young · parents' vs schools' share of moral education · university as a right vs a filter | `topic_education` |
| 2 | **Technology** | AI and employment · AI in creative work · social media and relationships · screen time and children · online privacy and surveillance · misinformation and platform responsibility · automation and deskilling · technology replacing face-to-face contact · digital divide by age and income · smartphones in classrooms · whether governments should regulate the internet | `topic_technology` |
| 3 | **Environment** | individual vs government responsibility · economic growth vs conservation · climate agreements and enforcement · renewable transition costs · plastic and packaging · recycling mandates vs producer liability · water scarcity and pollution · deforestation and land use · consumption habits and diet · wealthy nations funding poorer nations' transition | `topic_environment` |
| 4 | **Work and employment** | four-day week and productivity · remote and hybrid work · job-for-life vs frequent career change · retirement age and pensions · workplace equality and pay gaps · automation displacing roles · unpaid internships and entry to professions · work-life balance · gig and platform work · whether employers should fund retraining | `topic_work` |
| 5 | **Health** | prevention vs treatment funding · public vs private healthcare · junk-food advertising and taxation · sedentary lifestyles · mental health provision and stigma · ageing populations and care costs · sport and exercise as public policy · who is responsible for health outcomes · access to medicines | `topic_health` |
| 6 | **Crime and justice** | punishment vs rehabilitation · sentence length and deterrence · causes of crime (poverty, education, opportunity) · CCTV and surveillance vs privacy · youth crime and age of responsibility · prison overcrowding and alternatives · policing methods · whether crime reporting encourages crime | `topic_crime` |
| 7 | **Government spending and priorities** | arts and culture vs health/education · space exploration vs terrestrial needs · sport and stadiums vs grassroots facilities · defence vs services · heritage preservation vs new building · public transport vs road building · scientific research funding | `topic_economy` (arts angles → `topic_culture`; science angles → `topic_science`) |
| 8 | **Media and communication** | news on social platforms vs traditional outlets · advertising and its influence on children · celebrity culture · press freedom vs regulation · whether news should report more positively · privacy of public figures · media and body image | `topic_media`, `topic_communication` |
| 9 | **Globalisation and culture** | English as a global academic and business language · cultural homogenisation vs exchange · multinationals and local businesses · migration and integration · international aid effectiveness · loss of minority languages · global brands and local identity | `topic_globalisation`, `topic_culture` |
| 10 | **Urbanisation and cities** | rural-to-urban migration · housing shortage and affordability · congestion and public transport · green space in cities · out-of-town retail hollowing out centres · city size limits · rural depopulation and services | `topic_urbanisation`, `topic_housing`, `topic_transport` |
| 11 | **Family and children** | working parents and childcare · extended vs nuclear family · discipline and parenting styles · children's independence and unsupervised play · elderly relatives at home vs in care · pocket money and financial education · only children and siblings · family time vs individual schedules | `topic_family` |

### Tier 2 — frequent, and under-used by most prep material

| # | Area | Sub-angles | `topic_id` |
|---|---|---|---|
| 12 | **Transport** | car ownership vs restriction · public transport subsidy · cycling infrastructure · air travel and taxation · driverless vehicles · road safety and speed limits · freight and delivery traffic | `topic_transport` |
| 13 | **Tourism** | economic benefit vs cultural damage · overtourism and caps · ecotourism · tourism vs local housing costs · heritage sites and access · domestic vs international travel | `topic_tourism` |
| 14 | **Money and consumerism** | advertising-driven consumption · saving vs spending culture · wealth inequality · charitable giving and whether it should be compulsory · cheap goods and disposability · financial education in schools · whether high salaries in some professions are justified | `topic_money`, `topic_economy` |
| 15 | **Food and diet** | fast food regulation and taxes · cooking skills declining · imported vs local produce · food waste · vegetarianism and meat reduction · school meals · food labelling | `topic_food` |
| 16 | **Sport and leisure** | professional athletes' pay · sport in schools as compulsory · hosting international events · competitive vs participatory sport · leisure time and screen-based hobbies · funding elite vs community sport | `topic_sport` |
| 17 | **Science and research** | funding priorities and public benefit · space exploration · animal testing · genetic modification of food · scientists' vs governments' responsibility · public trust in science · research and commercial pressure | `topic_science` |
| 18 | **Housing and the built environment** | affordability and ownership vs renting · old buildings vs new development · high-rise living · building on green land · design quality and community · homelessness | `topic_housing` |
| 19 | **Ageing populations** | pension sustainability · retirement age · care responsibility (family vs state) · older workers in the workforce · intergenerational fairness · loneliness in old age | `topic_health`, `topic_family` |
| 20 | **Language and communication** | English as a lingua franca · minority language survival · translation technology reducing the need to learn languages · communication skills declining with messaging · formal vs informal register | `topic_communication`, `topic_globalisation` |
| 21 | **Arts and culture** | public funding for the arts · art in the school curriculum · museums free vs charging · traditional crafts disappearing · cultural heritage vs modernisation · streaming and how artists are paid | `topic_culture` |
| 22 | **Animals and nature** | zoos and captivity · wildlife conservation vs development · animal testing · pets and welfare · industrial farming · biodiversity loss | `topic_environment`, `topic_science` |
| 23 | **Community and society** | volunteering and whether it should be required · neighbourliness declining · social trust · isolation and loneliness · public spaces and who maintains them · community responsibility vs individual freedom | `topic_culture`, `topic_urbanisation` |
| 24 | **Consumption of time — leisure and childhood** | children's unstructured play · organised activities vs free time · holidays and their length · screen-based vs outdoor leisure | `topic_family`, `topic_sport` |
| 25 | **Economy and business** | small shops vs large chains · start-ups and entrepreneurship · foreign investment · unemployment and welfare · minimum wage · corporate social responsibility | `topic_economy`, `topic_money` |
| 26 | **Migration and mobility** | economic migration and skills · brain drain from developing countries · integration and language requirements · international students · remote work and where people live | `topic_globalisation`, `topic_work` |
| 27 | **Rules, law and freedom** | how far law should shape behaviour · censorship · smoking, alcohol and sugar restrictions · compulsory voting · privacy vs security · individual rights vs collective good | `topic_crime`, `topic_culture` |

### 3.1 Angles that appear across many areas — use these as cross-cutting axes

Nine argumentative axes recur regardless of subject, and they are what makes a prompt set feel
varied rather than a topic list. Every authored prompt should be classifiable on one:

1. **Individual responsibility vs state responsibility** (health, environment, crime, money)
2. **Regulation vs freedom** (media, food, technology, transport)
3. **Money spent here vs money spent there** (government spending — always a trade-off prompt)
4. **Modern vs traditional** (culture, education, family, food)
5. **Cause diagnosis vs remedy** (the problem/solution spine)
6. **Trend evaluation — is this change good?** (positive/negative development)
7. **Global vs local** (globalisation, business, language, tourism)
8. **Short-term cost vs long-term benefit** (environment, education, health, infrastructure)
9. **Who pays and who benefits** (education fees, healthcare, tourism, transport)

### 3.2 Coverage gap in the current pack

The six existing `task2` rows cover: environment (car-free centres, opinion) · education (online
degrees, discussion) · health (sedentary work, problem_solution) · work (career change, two_part) ·
globalisation (English-medium degrees, adv_disadv) · media (news on social platforms, two_part).

That leaves **21 of the 27 areas above completely unrepresented**, and `two_part` over-represented at
2 of 6. Do not re-author these six subjects.

---

## 4. Structures that work, with skeletons

The four-paragraph essay — introduction, two bodies, conclusion — is the default for every question
type, and the large majority of high-scoring scripts use it **[C]**. Five paragraphs (three bodies)
is legitimate and occasionally better, but costs time and usually thins each body. Two-paragraph and
one-paragraph essays are a Coherence and Cohesion cap.

**Proportions that hold across all types:** introduction 40–55 words · each body 85–110 words ·
conclusion 35–50 words. Bodies must be visibly the longest paragraphs; an introduction that rivals a
body in length is a diagnostic that the candidate is padding **[C]**.

Notation below: `TS` = topic sentence, `EXP` = explanation, `SUP` = support (example, consequence or
mechanism), `LINK` = a closing sentence that ties back to the position.

### 4.1 `opinion` — one-sided (default)

```
INTRO   1 paraphrased restatement of the issue (never copied wording)
        2 POSITION: state it, with the degree the question asked for
        3 (optional) outline: the two grounds you will argue

BODY 1  TS  first reason, phrased as a claim not a topic
        EXP why that reason holds — the mechanism
        SUP a concrete instance or a named consequence
        LINK back to the position

BODY 2  TS  second reason, different in kind from the first
        EXP + SUP as above
        LINK

CONCL   restate the position in new words + name the two grounds; no new idea
```

Position goes in the **introduction**. It does **not** evolve — an opinion essay that changes its
mind is incoherent, not nuanced.

### 4.2 `opinion` — partial agreement

```
INTRO   restatement + POSITION with an explicit qualifier ("largely, though not where X is concerned")
BODY 1  the respect in which the statement holds — TS/EXP/SUP/LINK
BODY 2  the respect in which it does not — TS/EXP/SUP/LINK, and it must be clear this is the
        SMALLER of the two, matching the qualifier you gave
CONCL   restate the calibrated position; say which side carries more weight
```

The position may be *calibrated* but never *reversed*. The introduction's qualifier and the
conclusion's must match.

### 4.3 `discussion` — discuss both views + own opinion

Two structures, both safe. Teach the first as default.

**S1 — opinion declared, then discussion (recommended)**

```
INTRO   restatement of the two views + YOUR OPINION, one clause, unmistakable
BODY 1  view you disagree with: TS ("Advocates of X argue…") / EXP their reasoning
        / SUP / then a TURN ("The difficulty with this is…") — the turn is where your
        opinion becomes visible mid-essay
BODY 2  view you hold: TS / EXP / SUP / LINK back to your opinion
CONCL   both views acknowledged in one clause + your opinion restated
```

**S2 — three bodies, opinion in its own paragraph**

```
INTRO   restatement + opinion signalled ("though the second case is stronger")
BODY 1  view A, discussed with reporting distance
BODY 2  view B, discussed with reporting distance
BODY 3  your opinion, with a reason of its own — not a summary of body 2
CONCL   restate
```

S2's risk is time and a thin body 3. Its advantage is that the "give your own opinion" part is
structurally impossible to forget — which makes it the right recommendation for a learner who has
already lost marks to that trap once.

**The rule that prevents the trap:** the opinion must be **visible in the introduction, visible
inside at least one body paragraph, and visible in the conclusion** — three touches. If a learner can
delete the last sentence and lose the opinion entirely, the essay is a band-6 discussion essay.

### 4.4 `problem_solution` (and causes/solutions)

```
INTRO   restatement + a one-clause preview naming BOTH halves
        ("...driven mainly by X, though a combination of Y and Z could reduce it")

BODY 1  problems / causes
        TS  problem or cause 1  → EXP mechanism → SUP consequence
        TS' problem or cause 2  → EXP → SUP        (two, developed; not five, listed)

BODY 2  solutions — each one answering a named cause above
        TS  solution to cause 1: WHO does WHAT → EXP how it works
            → SUP why it would plausibly help / where something similar operates
        TS' solution to cause 2: same

CONCL   the causes in one clause, the solutions in one clause, plus which matters most
```

Alternative for a tight two-body version: pair them — body 1 = cause 1 + its solution, body 2 =
cause 2 + its solution. This makes the causal linkage structurally unmissable and is the better
choice for a learner who keeps writing detached solutions.

No position is required. A **recommendation** — which solution matters most — is the cheapest
available lift, because it turns a description into an argument.

### 4.5 `two_part`

```
INTRO   restatement + a one-sentence preview that ANSWERS BOTH questions in compressed form
BODY 1  question 1, fully — TS/EXP/SUP/LINK
BODY 2  question 2, fully — TS/EXP/SUP/LINK
CONCL   one clause per question; nothing new
```

The introduction's compressed double answer is the device that guarantees both questions get
answered, because it forces the candidate to have an answer to question 2 before writing a word of
body 1. Make this explicit in the teaching payload.

If question 2 asks for an opinion, body 2 carries the same position requirements as §4.1 and the
conclusion must restate that opinion, not just summarise.

### 4.6 `advantages_disadvantages`

**Neutral variant**

```
INTRO   restatement + preview naming the main benefit and the main drawback
BODY 1  advantages — one or two, developed
BODY 2  disadvantages — one or two, developed, comparable weight
CONCL   summarise both; a judgement is optional and never harmful
```

**"Outweigh" variant**

```
INTRO   restatement + VERDICT ("the benefits are the more significant, though the costs are real")
BODY 1  the losing side, taken seriously — this is what earns the verdict
BODY 2  the winning side, developed further, with an explicit weighing sentence
        ("this matters more because it affects everyone, permanently, whereas...")
CONCL   restate the verdict and the reason for the weighting
```

Put the **losing side first**. Ending on the winning side makes the verdict feel earned and makes the
conclusion easy. The weighing sentence in body 2 is the single highest-value sentence in this essay
type and most candidates never write it.

---

## 5. What Task Response actually rewards

Four things, in this order **[F]** for the components, **[C]** for the ordering:

1. **Every part of the task addressed.** Not the topic — the *task*. A discussion essay has three
   parts; a two-part question has two; an "outweigh" question has three (advantages, disadvantages,
   verdict). Missing one is the largest single cause of a capped Task Response score.
2. **A clear position, consistently held.** Clear means a reader can state it after one pass.
   Consistent means the introduction, the bodies and the conclusion agree. Where the question does
   not ask for an opinion (neutral adv/disadv, problem/solution), the equivalent is a clear
   *stance on scope* — what the essay will treat and in what order.
3. **Main ideas that are extended and supported**, not just presented. See §5.1.
4. **Relevance.** Everything on the page must earn its place against *this* statement. Material on the
   wider theme is not neutral filler; it displaces development that would have scored.

### 5.1 Development, concretely — the difference between asserted and supported

This is the highest-value teaching content in the whole module, because "your ideas need more
development" is the note every band-6 writer receives and nobody can act on. Development is a
sentence pattern, and it can be taught as one.

**An asserted idea** is a claim followed by a restatement of the claim:

> *Online courses are convenient. Students can study whenever they want, which is very convenient
> for them. This convenience is a major advantage of online study.*

Three sentences, one idea, zero development. Examiners call this thin development; it is the most
common band-6 signature **[C]**.

**A supported idea** advances through four distinct moves:

| Move | Question it answers | Typical opener |
|---|---|---|
| **CLAIM** | What do you assert? | *The main benefit is that…* |
| **MECHANISM** | *Why* is that true — what causes what? | *This is because… / The reason is that…* |
| **EVIDENCE** | What instance, case or observable pattern shows it? | *A student working shifts, for instance, …* |
| **CONSEQUENCE** | So what — who is better or worse off? | *The result is that… / This means that…* |

> *The main benefit is that online delivery removes the timetable as a barrier. Because recorded
> material can be taken at any hour, the constraint stops being the university's schedule and becomes
> the student's own energy. A nurse on rotating shifts, for example, can no longer be excluded by a
> Tuesday-morning lecture. The effect is that a degree becomes reachable for a group that previously
> had to choose between qualifying and earning.*

Same length, one idea, fully developed. **Four moves, one idea, one paragraph** is the teachable
unit — and it is the exact thing a `teaching` payload should carry per prompt.

**Two rules that follow:**

- **Two developed ideas beat five listed ones.** A body paragraph should contain *one* argument, not
  three small ones **[C]**.
- **Evidence does not mean statistics.** Candidates are asked for examples from their own knowledge
  or experience, which means the observable world, not personal anecdote and not numbers **[F]** on
  the rubric wording, **[C]** on the interpretation. Invented statistics are contested territory —
  some coaching sources actively recommend fabricating research, others call it self-defeating **[?]**.
  **Our teaching line: never fabricate figures or studies.** A specific, plausible, unnumbered
  instance is stronger, faster to write, and cannot be caught sounding false. Teach *typical case*
  ("a commuter in a city with no evening service…"), *category* ("countries that introduced a deposit
  scheme…") and *consequence chain* instead of fake data.

---

## 6. Coherence and Cohesion

Coherence is whether the argument makes sense in the order it is given. Cohesion is whether the
sentences are tied together. They are scored as one criterion but they fail for different reasons,
and teaching material should keep them apart.

### 6.1 Paragraphing

- **One central idea per paragraph**, announced by a topic sentence that makes a *claim*, not one
  that names a *topic*. "Turning to the environmental side" is a label; "The environmental cost falls
  on people who never took the flight" is a topic sentence.
- **Four or five paragraphs.** Many two-sentence paragraphs signal under-development; one
  ten-sentence block signals no paragraphing at all. Both are penalised **[C]**.
- **Visible breaks.** In a typed answer, a blank line. In the app's editor this is trivial, but it is
  worth a precheck warning, because paragraph-less scripts are common under time pressure.

### 6.2 Referencing and substitution — the under-taught half

Cohesion is not only connectives. The devices that actually distinguish a band 7 script:

- **Pronoun and demonstrative reference:** *this*, *these*, *such*, *the latter* pointing
  unambiguously back to something already said.
- **Noun-phrase substitution:** naming the previous idea with a summary noun — *this shift*, *such
  measures*, *the practice*, *that assumption*. This is the highest-value cohesive move available and
  almost no candidate uses it.
- **Lexical chains:** the same idea carried across sentences with varied but accurate wording, rather
  than the same noun repeated eight times.
- **Ellipsis and parallelism** across a contrast.

Band-6 referencing fails by being *repetitive* (the noun repeated verbatim every sentence) or
*unclear* (a *this* with two possible antecedents) **[C]**.

### 6.3 Why stacking linkers lowers the score

The commonest false belief in IELTS preparation is that connectives are worth marks by the unit. They
are not, and the descriptor logic runs the other way: **mechanical, overused or inaccurate cohesive
devices are named as a band-6 characteristic, while flexible and appropriate use is what band 7 and
above look like** **[C]**. So an essay that opens every sentence with *Moreover / Furthermore /
In addition / Besides* is producing *evidence of band 6*, not evidence of range.

Three concrete failure modes to teach:

1. **Density.** One connective per sentence reads as machinery. One or two per paragraph, placed
   where the logic actually turns, is the target.
2. **Inaccuracy.** *Moreover* used for a contrast, *on the contrary* used for *on the other hand*,
   *Firstly/Secondly/Lastly* on a paragraph that is not a list. A misused connective is worse than no
   connective because it misdirects the reader.
3. **Front-loading only.** Every device sitting at the head of a sentence. Cohesion inside sentences
   — subordination, relative clauses, *which* commenting on the previous clause — is invisible to
   learners and is what makes band-8 text flow.

The teaching line: **cohesion should be felt, not counted.** If the connectives were deleted, a
coherent essay would still be followable. That is the test.

---

## 7. The most common failures, ranked by damage

Ordered by how much band they cost across all five question types. Ranking is our synthesis **[C]**;
the individual failures are corroborated widely.

| # | Failure | Where it bites | The fix, in one instruction |
|---|---|---|---|
| 1 | **Missing a part of the task** — no opinion in a discussion essay, no verdict in an "outweigh", one of two questions unanswered | Task Response, hard cap | Before writing, write the parts as a numbered list in the margin and tick them at the end |
| 2 | **Memorised template or memorised essay** | Task Response, severely | Never carry in a sentence you did not compose for *this* statement |
| 3 | **No clear position** / fence-sitting | Task Response | The position goes in sentence 2 of the introduction, in your own words |
| 4 | **Listing without developing** — many ideas, none extended | Task Response *and* Coherence | Two ideas per essay, four moves each (§5.1) |
| 5 | **Off-topic or over-broad content** — answering the theme, not the statement | Task Response | Underline the two or three content words in the statement; every paragraph must touch them |
| 6 | **Irrelevant or unusable examples** — a personal anecdote that proves nothing, or a fabricated statistic | Task Response | Use a typical case or a consequence chain, never invented numbers |
| 7 | **Mechanically stacked linkers** | Coherence and Cohesion | One or two per paragraph, and only where the logic turns |
| 8 | **Overlong introduction** — 90 words of background before the position | Coherence, and time | Two or three sentences: restate, position, (optional) outline |
| 9 | **Missing or one-line conclusion** | Coherence and Cohesion | Always write it; if time is short, write it *before* finishing body 2 |
| 10 | **Under length** | Task Response, indirectly | Aim 260–290; count in the editor, not on your fingers |
| 11 | **Copying the prompt wording verbatim** into the introduction | Lexical Resource; copied words are also discounted from the word count | Paraphrase by changing word class and structure, not just synonyms |
| 12 | **Position drift / self-contradiction** | Task Response and Coherence | Read the introduction and conclusion together before submitting |
| 13 | **Unbalanced halves** — 200 words on one side, 40 on the other | Task Response | Plan a word budget per paragraph, not just a plan |
| 14 | **New idea in the conclusion** | Coherence and Cohesion | The conclusion may only contain material already argued |

### 7.1 Notes on the contested items

- **Under-length penalty.** Sources disagree on mechanism. Historically an automatic Task Achievement
  deduction applied below the minimum; several reputable sources now state that the automatic penalty
  has been removed and that a short answer simply cannot demonstrate enough to score well **[?]**.
  Either way the behaviour we teach is identical — write 260–290 — so the product should state the
  *consequence* ("a short essay cannot develop enough to reach band 7") rather than assert a
  mechanical deduction.
- **Template penalty magnitude.** Coaching sources claim memorised templates are capped around band 4
  for Task Response and that examiners were retrained to detect them **[?]** — single-source, no
  owner confirmation. The *underlying* point is solid and safe to teach: memorised language does not
  address the specific statement, and material that does not address the statement does not score.
  A related tell is genuinely diagnostic: an essay whose framing sentences are far more polished than
  its content sentences reads as assembled rather than written.
- **Verbatim-copying deduction of "up to 0.5 bands" on Lexical Resource** **[?]** — single-source
  quantification. That copied wording is discounted from the word count is widely stated and safe.

---

## 8. Band ladder for Task 2 — observable behaviours (clean-room)

For the band 5–9 model-answer ladder. **This is a description of what is visible in a script**, written
from scratch; no descriptor wording is reproduced. Downstream agents should reuse *these* sentences.

| Band | Task Response | Coherence & Cohesion | Lexical Resource | Grammar |
|---|---|---|---|---|
| **5** | Answers around the question rather than it. Position present but wobbly or only implied. Ideas repeat rather than progress. Often short. | Organisation is attempted but the order does not carry an argument. Connectives are few, or wrong. Paragraphing may be absent or arbitrary. | Narrow range; the same handful of words carry everything; noticeable wrong-word choices. | Mostly simple sentences; complex attempts break; errors are frequent enough to slow a reader. |
| **6** | All parts touched, some only glancingly. Position visible but not sustained — often absent from the middle of the essay. Main ideas relevant but thinly developed: claim, restated claim. | Recognisable four-paragraph shape and a general forward movement. Connectives overused, mechanical or occasionally misused. Referencing repetitive. | Adequate for the topic; some ambitious words used inaccurately; collocations approximate. | A real mix of simple and complex forms; errors in the complex ones; punctuation slips but meaning holds. |
| **7** | Every part addressed, though one may get less. Position clear from the introduction and traceable throughout. Ideas extended and supported — mechanism and consequence present, not just assertion. | Logical progression a reader can follow without effort. Cohesive devices used flexibly and mostly correctly. Each paragraph has one identifiable central idea. | Enough range to be precise about an abstract topic; some less common items and collocations, with occasional slips. | Frequent error-free sentences; a genuine variety of structures; remaining errors do not impede. |
| **8** | Every part answered sufficiently and in proportion. Position is unambiguous and never wavers. Ideas well developed and relevant throughout, with no padding. | Information sequenced so well the structure is invisible. Cohesion largely internal to the sentences rather than bolted on the front. Paragraphing serves the argument. | Wide and fluent; word choice carries shades of meaning; rare items used where they belong, not for display. | Wide structural range; the majority of sentences error-free; slips are one-off, not patterned. |
| **9** | The task is answered completely and precisely, with a position held without strain and support that is consistently relevant. | The argument reads as a single continuous line of thought; nothing is signposted that does not need signposting. | Fully flexible and precise; the natural word appears in the natural place. | Full range used naturally; sentence boundaries and punctuation entirely controlled. |

**Conflict the design agent must resolve.** `sidecar/bandready/scoring/writing.py` currently declares
`MODEL_ANSWER_BANDS = (7, 8, 9)` — the live `GET /attempts/{id}/model-answer` endpoint generates
exemplars at 7/8/9 only. The brief for this push asks for a **5–9** ladder. Research supports 5–9:
the 5 and 6 rungs are where the learner actually is, and the 6→7 step is the one this module has to
teach. Authored content should ship all five rungs; whether `MODEL_ANSWER_BANDS` changes is a code
decision outside content's remit and must be raised, not silently assumed.

**Critical authoring note for the band ladder:** band 5 and band 6 models must be *plausible*, not
parodies. A band-6 essay is organised, relevant and readable; what caps it is thin development,
mechanical connectives and an intermittent position. Each model at bands 5–9 must argue **the same
position with the same ideas** — the whole point of the ladder is to isolate language and development
from content, exactly as the speaking module's 6/7/8 ladder does.

**Criterion codes — use the repo's, not new ones.** Verified in `sidecar/bandready/scoring/rubrics.py`:
`WRITING_CRITERIA = ("ta", "cc", "lr", "gra")`, lowercase. Criterion 1 is *labelled* **Task Response**
for `task2` and *Task Achievement* for Task 1 — the code is `ta` in both cases
(`writing_criterion1_name()` does the switch). Any `criterion` field in a teaching payload must use
`ta` / `cc` / `lr` / `gra` so annotations line up with evaluator output; there is no `TR` code in this
codebase.

---

## 9. Implications for the design and authoring agents

Things this research says the teaching payload must carry, which the current pack has none of:

1. **A parts checklist per prompt.** Machine-checkable: the discrete parts this specific task has
   (e.g. `["view A discussed", "view B discussed", "your own opinion, stated in the introduction"]`).
   This is the highest-impact single field in the module, because failure #1 is the biggest cost and
   it is the only one a checklist can eliminate outright.
2. **A band ladder 5→9, one position, one set of ideas** (§8), span-annotated against `ta`/`cc`/`lr`/`gra`.
3. **A development drill per prompt** built on the four moves in §5.1 — give the CLAIM, make the
   learner supply MECHANISM / EVIDENCE / CONSEQUENCE. This is the actionable-this-week item.
4. **A plan skeleton** matching the prompt's genre (§4), with a **word budget per paragraph**, not
   just paragraph labels. The budget is what prevents failure #13.
5. **A time plan for the 40 minutes** — 5 plan / 30 write / 5 check — with what to check, named.
   ("Read the introduction and conclusion together" is a check; "proofread" is not.)
6. **An idea bank per prompt**, framed as *arguments with mechanisms*, not vocabulary lists —
   two arguments per side, each with its mechanism and its consequence already named, so the learner
   practises the language rather than the ideation.
7. **A "sounds canned" negative exemplar** per prompt, exactly as the speaking pack does — the most
   likely memorised opening for this statement, shown beside a written-from-scratch one. This
   inoculates against failure #2 better than any warning.
8. **An error watchlist** of two or three items this *specific* statement provokes (e.g. an
   environment statement provokes over-generalisation and unhedged absolutes; a two-part question
   provokes dropping question 2).
9. **Model answers gated behind a real attempt.** Same rule as speaking, same reason: a model shown
   first is a template to memorise, and memorised text is the second-biggest failure on this list.

Authoring hygiene for prompts, from §1.2 and §3:

- The statement must narrow the theme to a specific claim. Test: *could a memorised essay on this
  theme answer it?* If yes, narrow further.
- The task question line must be unambiguously one of the five genres, and must match the `genre`
  field. `difficulty` 1–3 should track the abstraction of the topic and the number of parts, not
  vocabulary difficulty: 1 = everyday subject, one clear part; 2 = the norm; 3 = abstract subject or
  a three-part task (e.g. "outweigh" on a policy trade-off).
- Every statement should be classifiable on one of the nine axes in §3.1. If it is not, it is
  probably a topic rather than an argument.

---

## Sources

Owner-operated (highest weight):

- [IELTS — scoring in detail](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) — criteria names, Task 2 carries more weight, criteria weighted equally.
- [IELTS — writing key assessment criteria (PDF)](https://ielts.org/cdn/Guides/ielts-writing-key-assessment-criteria.pdf) — retrieved but not machine-readable in this environment; listed for a later manual pass.
- [IELTS — General Training Writing sample tasks (PDF)](https://ielts.org/cdn/Sample-tests/ielts-general-training-writing-sample-tasks-2023.pdf) — rubric framing and instruction line structure.
- [IDP — common topics for IELTS Writing Task 2](https://ielts.idp.com/prepare/article-common-topics-for-ielts-writing-task-2) — topic areas including government spending.
- [IDP — Task 2: facts, stats and examples](https://ielts.idp.com/prepare/article-task-2-facts-stats-and-examples) — what "examples from your own knowledge or experience" means.
- [IDP — two-part question format](https://ielts.idp.com/vietnam/about/news-and-articles/article-ielts-writing-task-2-two-part-question/en-gb)
- [IDP — advantage/disadvantage essays](https://ielts.idp.com/nepal/about/news-and-articles/article-advantage-disadvantage-essay-ielts)
- [IDP — positive or negative development](https://ielts.idp.com/vietnam/about/news-and-articles/article-positive-or-negative/en-gb)
- [British Council — Writing Task 2 tips](https://takeielts.britishcouncil.org/blog/ielts-writing-task-2-tips) (timed out on fetch; indexed via search results)
- [British Council — common mistakes in IELTS](https://takeielts.britishcouncil.org/blog/common-mistakes-ielts)

Teaching literature (used for consensus and for failure modes):

- [Magoosh — Task 2 question types](https://magoosh.com/ielts/ielts-writing-task-2-question-types/) · [complete guide](https://magoosh.com/ielts/ielts-writing-task-2/) · [causes and solutions](https://magoosh.com/ielts/ielts-writing-task-2-causes-solutions-sample-essay/) · [body paragraph structure](https://magoosh.com/ielts/ielts-writing-task-2-how-to-structure-body-paragraph/) · [word count penalty](https://magoosh.com/ielts/ielts-word-count-penalty/)
- [IELTS Liz — opinion essay: one side or partial agreement](https://ieltsliz.com/ielts-opinion-essay-choosing-one-side-or-partially-agreeing/) · [essay structure and paragraphs](https://ieltsliz.com/how-many-paragraphs-for-an-ielts-essay/) · [advantage/disadvantage model](https://ieltsliz.com/ielts-advantage-disadvantage-model-essay/) · [two-questions essay](https://ieltsliz.com/ielts-model-essay-two-questions/) · [linking words](https://ieltsliz.com/linking-words-for-writing/) · [under-word-count penalty](https://ieltsliz.com/ielts-penalty-for-writing-under-word-count/) · [writing scoring / task weighting](https://ieltsliz.com/ielts-writing-scoring/) · [100 essay questions](https://ieltsliz.com/100-ielts-essay-questions/)
- [How to do IELTS — discussion essays](https://howtodoielts.com/ielts-task-2-discussion-essay-discuss-both/) · [advantages and disadvantages](https://howtodoielts.com/ielts-task-2-advantages-disadvantages/) · [problem/solution structure](https://howtodoielts.com/ielts-writing-task-2-structure-problem-solution-essay/) · [positive/negative development](https://howtodoielts.com/ielts-task-2-positive-negative-development/)
- [TED IELTS — discussion essays](https://ted-ielts.com/discussion-essay/) · [outweigh questions](https://ted-ielts.com/outweigh/) · [cause and solution](https://ted-ielts.com/cause-and-solution/) · [two-part questions](https://ted-ielts.com/ielts-writing-task-2-two-part-questions/) · [essay structures](https://ted-ielts.com/ielts-writing-task-2-essay-structures/)
- [Cathoven — Task 2 band descriptors](https://resources.cathoven.com/ielts-writing-task-2/band-descriptors) · [essay structure](https://resources.cathoven.com/ielts-writing-task-2/essay-structure) · [common mistakes](https://resources.cathoven.com/ielts-writing-task-2/common-mistakes) · [introduction guide](https://resources.cathoven.com/ielts-writing-task-2/introduction) · [task weighting](https://resources.cathoven.com/ielts-writing-task-2/band-score-weighting) · [2026 topics](https://resources.cathoven.com/ielts-writing-task-2/topics-2026)
- [IELTS Advantage — discussion essay lesson](https://www.ieltsadvantage.com/2015/03/18/writing-task-2-discussion-essay-lesson/) · [advantages and disadvantages lesson](https://www.ieltsadvantage.com/2015/05/24/ielts-advantages-and-disadvantages-lesson/) · [Writing Task 2 hub](https://www.ieltsadvantage.com/writing-task-2/)
- [My IELTS Classroom — using examples](https://blog.myieltsclassroom.com/using-examples-ielts-essay/) · [never use fake examples](https://blog.myieltsclassroom.com/fake-examples-in-ielts-essays/) · [adding balance to agree/disagree](https://blog.myieltsclassroom.com/how-can-i-add-balance-to-my-ielts-agree-disagree-essay/)
- [IELTS Simon — how examiners score writing](https://www.ielts-simon.com/ielts-help-and-english-pr/2011/05/students-questions-how-examiners-score-writing.html) · [two-part question plan](https://www.ielts-simon.com/ielts-help-and-english-pr/2018/02/ielts-writing-task-2-two-part-question-plan.html)
- [IELTS Charlie — discuss both views: tips and common mistakes](https://courses.ieltscharlie.com/blog/ielts-discuss-both-views-essay-tips-common-mistakes-questions-essays) · [how to develop your ideas](https://ieltscharlie.com/how-to-develop-your-ideas-in-an-ielts-essay/)
- [IELTS Jacky — the 5 essay types](https://www.ieltsjacky.com/ielts-task-2.html) · [advantages and disadvantages](https://www.ieltsjacky.com/ielts-advantages-and-disadvantages-essays.html)
- [IELTS Podcast — essay structures (4 or 5 paragraphs)](https://www.ieltspodcast.com/writing-task-2/essay-structures/) · [positive/negative essays](https://www.ieltspodcast.com/writing-task-2/negative-positive-essay/)
- [IELTS Arena — 2026 essay topics](https://www.ieltsarena.com/blog/ielts-essay-topics-2026) · [discussion essays](https://www.ieltsarena.com/blog/ielts-discussion-essay) · [coherence and cohesion](https://www.ieltsarena.com/blog/ielts-coherence-and-cohesion)
- [IELTSFocus — cohesive devices](https://ieltsfocus.com/2017/07/20/cohesive-devices-in-ielts/)
- [BestMyTest — identifying two-part questions](https://www.bestmytest.com/blog/ielts/how-identify-answer-two-part-question-types-ielts-writing-task-2)
- [PrepEdu — developing ideas in Task 2](https://prepedu.com/en/blog/how-to-develop-ideas-in-writing-task-2) · [brainstorming for Task 2](https://prepedu.com/en/blog/brainstorming-for-ielts-writing-task-2)
- [The Critical Reader — should you make up evidence?](https://thecriticalreader.com/should-you-make-up-evidence-in-your-ielts-essays/)
- [IELTS-up — "to what extent" essays](https://ielts-up.com/writing/to-what-extent-agree-disagree-essay.html) · [causes and solutions](https://ielts-up.com/writing/causes-solutions-essay.html) · [writing marking scheme](https://ielts-up.com/writing/ielts-writing-marking.html)

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University
Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of them. No
exam material, prompt wording, band descriptor text or model answer is reproduced in this document;
all example sentences are original text authored for BandReady.*
