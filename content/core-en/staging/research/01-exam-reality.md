# R1 — Exam Reality: how an IELTS-style Speaking test is actually run

**Status:** research briefing, internal. Not shipped content.
**Audience:** the agents authoring speaking packs, examiner-frame copy, teaching notes and the
practice-session UX. Everything below is either a documented fact about the exam or a clearly
labelled convention/inference.
**Date of research:** 27 July 2026. All URLs in [Sources](#sources) were read for this briefing.

---

## 0. How to use this document, and the copyright line

IELTS test *materials* (past questions, task cards, the examiner's scripted frame, the band
descriptor prose) are copyrighted, and "IELTS" is a trademark. What is **fact**, and therefore
freely usable, is the exam's *format, timing, sequence of moves, and the functions those moves
perform*. This briefing deliberately records **function and register**, not wording.

Concretely, for downstream authors:

* ✅ Use: "at the start of Part 2 the examiner hands over the card, states the talk length, says
  the candidate may make notes, and warns that they will be stopped."
* ❌ Do not use: the actual sentences an official frame uses to do that. Where I read official
  frames (the ielts.org sample-task PDF has full transcripts), I have paraphrased them into
  **our own authored equivalents** in §7. Those equivalents are original text written for
  BandReady and are safe to ship.
* ❌ Never lift a task-card topic line, bullet set, or Part 3 question verbatim from any source —
  official, coaching blog, or "predicted questions" list. Author in the same *areas*; write the
  sentences yourself.
* Product copy says **"IELTS-style"** and carries the non-affiliation notice.

One structural warning: several of the most useful facts below (e.g. exactly what an examiner may
and may not do when a candidate misunderstands) come from *examiner-sourced teaching material*
rather than published partner documentation, because the real instructions-to-examiners document
is confidential. Those are flagged **[convention]** and their confidence is stated in §12.

---

## 1. The test at a glance

| | Length | Interaction pattern | Candidate output |
|---|---|---|---|
| **Whole test** | 11–14 min | face-to-face (in person or video call) with one certificated examiner | — |
| **Part 1** — Introduction & interview | 4–5 min | short Q→A, examiner-led | short answers, 2–4 sentences each |
| **Part 2** — Individual long turn | 3–4 min *including* 1 min prep | monologue, examiner silent | 1–2 min uninterrupted talk |
| **Part 3** — Two-way discussion | 4–5 min | genuine discussion, examiner probes | extended, analytical answers |

Facts confirmed on ielts.org (Academic and General Training speaking format pages are identical for
Speaking — **the Speaking test is the same for Academic and General Training**) and repeated by
British Council and IDP.

Other whole-test facts:

* **One examiner, one candidate.** No paired or group format (unlike Cambridge Main Suite).
* **Every test is recorded.** Recording exists for monitoring, remarking and malpractice
  investigation; it is not itself a second marking pass in the normal case.
* **The examiner both runs the test and marks it,** in real time, from a rating form. There is no
  separate interlocutor/assessor split.
* **The rating covers the whole test,** not part-by-part. A weak Part 2 is not a "Part 2 score";
  it is evidence folded into four whole-test criterion ratings (Cambridge's assessment-training
  material is explicit that marks reflect performance across the whole exam, not one part).
* **Total time is not a signal.** 11 minutes and 14 minutes are both normal; IDP explicitly lists
  "a short test means a bad score" as a myth.

### Delivery modes as of 2026 — important for our UX

* Paper-based IELTS is being retired; from **mid-2026 all IELTS is delivered on computer**.
* Speaking is **never** computer-marked or delivered to a bot. It is a live human examiner, either
  in the room or over **video call (VCS)**. IELTS Online is video call by definition.
* Partner research and partner FAQ both state face-to-face and video-call delivery are equivalent
  in content, timing, structure and scoring.
* **Implication for BandReady:** a video-call-shaped practice UI (examiner audio, candidate mic,
  a card that appears on screen, a visible countdown) is *closer* to the modern exam reality than a
  "sitting across a desk" metaphor. In VCS the card is shown on screen and note-taking is on the
  paper provided at the test centre — so "card on screen + notes elsewhere" is authentic.

---

## 2. Part 1 — introduction and interview (4–5 min)

**Sequence of moves**

1. **Greeting and self-introduction by the examiner.** Brief, warm, functional.
2. **Identity check.** The examiner asks the candidate to state their full name, often asks what
   they like to be called, and asks to see the ID document. This is a procedural move, *not* a
   test question — the candidate's answer here is not rated as a "response". (ID is normally also
   checked before entry to the room; the in-test check is a second verification tied to the
   recording.)
3. **Frame 1 — the obligatory personal frame.** Always about the candidate's immediate life:
   whether they work or study, and their home/where they live. The examiner branches on the
   answer ("do you work or are you a student?" → work questions or study questions). **[convention,
   very widely attested]** — official pages say only "familiar topics such as home, family, work,
   studies and interests"; the *obligatoriness* of the work/study + home frame is examiner-sourced
   but essentially unanimous across teaching sources and matches the published sample, whose first
   two frames are home town/village and accommodation.
4. **Frames 2 and 3 — two further everyday topic areas,** announced by an explicit topic-shift
   move. Typical areas: routines, food, weather, transport, hobbies, technology in daily life,
   music, shopping, sleep, festivals, animals, colours, hometown, friends.

**Shape and quantity**

* Roughly **3 frames × ~4 questions**, i.e. **≈ 10–12 questions**, in 4–5 minutes. Sources vary:
  British Council practice material describes "4–6 questions on familiar topics"; teaching sources
  commonly say ~12 questions over 3 topics. The reconcilable reading is 4–6 questions *per topic
  frame*, 2–3 frames. **Confidence: medium-high on 3 frames, high on 4–5 minutes.**
* Answers are meant to be **short** — roughly 5–20 seconds, two to four sentences. Part 1 is not
  where you demonstrate essay-length answers; over-long Part 1 answers get cut off because the
  examiner has a fixed number of questions to get through.
* Questions are **scripted** — the examiner reads from a prepared frame and does not invent new
  Part 1 questions. This is why they cannot rephrase (see §8).
* Tense demands are real and are the hidden difficulty of Part 1: present simple (habits), present
  perfect (how long), past simple (childhood/last time), future/conditional (would you like to…).
  A single frame routinely crosses three tenses.

**Register**: friendly, brisk, slightly clipped. The examiner is warm but is visibly working
through a list. Very little uptake of content ("oh really?" is rare) — see §8.

---

## 3. Part 2 — the individual long turn (3–4 min including prep)

### 3.1 The card

The official card layout is a **topic line + three "you should say" bullets + a final line that
asks the candidate to explain something**. The ielts.org sample card (an object important to the
candidate) is exactly: topic sentence → three factual/descriptive bullets (where from, how long,
what for) → a final *and explain why…* line.

* **Is the fourth line always an "explain" prompt?** The official format page states the card
  "instructs you to explain one aspect of the topic" — so **yes, the fourth line is always an
  explanatory/evaluative prompt, by design.** Its surface form varies: explain *why*, explain
  *how you felt*, explain *what you learned/liked/would change*. It is not always literally the
  word "explain", but it is always the move that shifts from description to reason/evaluation.
  **Confidence: high** on the design principle, high on surface variation.
* The first three bullets are **descriptive scaffolding** — they establish who/what/where/when and
  are answerable factually. The escalation from three concrete bullets to one abstract/evaluative
  bullet is the whole pedagogical point of the card: it forces a tense and register shift inside a
  two-minute monologue.
* **Bullets are not compulsory.** Nothing is scored on covering all four. They are a planning aid.
  A candidate who ignores them entirely but talks fluently and relevantly for two minutes is not
  penalised by any criterion — "task achievement" does not exist in Speaking. In practice, using
  them is the single best defence against drying up, so we should teach them as scaffolding, not
  as a checklist obligation.
* Cards are almost always **personal and narrative-friendly**: describe a person / a place / an
  object / an event / an experience / a habit or activity / a plan or wish / a media item. That
  taxonomy (person–place–object–event–experience–activity–plan) is the standard classification and
  is the right axis for us to generate breadth against.

### 3.2 The one minute of preparation

* The examiner hands over the card **plus paper and a pencil** and states that the candidate may
  make notes.
* The examiner then **times one minute in silence**. They do not coach, do not answer content
  questions, do not comment on the notes. **[convention]** — the silence is not documented in
  partner copy but is universal in every recorded test and every examiner account.
* Notes are the candidate's own; they are collected/discarded at the end and are **never marked**.
* The prep minute is short enough that a *method* matters more than inspiration. This is a prime
  hook for our teaching content (see §11).

### 3.3 The talk

* The instruction given is "**1 to 2 minutes**", with an explicit reassurance that the examiner
  will stop the candidate and that being stopped is normal.
* The examiner cues the start explicitly. From that moment the examiner is **silent** — no
  backchannelling, no "mm-hm", no follow-up mid-talk. This one-sided silence is the single most
  unnerving feature of the exam for first-timers and is worth simulating faithfully.
* **At two minutes the examiner stops the candidate**, mid-sentence if necessary, with a brief
  closing acknowledgment. Being cut off at 2:00 is a *good* sign — it means the candidate
  sustained the turn. It carries **no penalty**; ielts.org/partner sources and examiner sources
  agree the score reflects the language produced, not whether the talk "finished".
* **If the candidate stops early:** below ~1 minute, the examiner will normally prompt once to
  elicit more — typically by pointing back at an uncovered bullet or asking for more detail on
  what was just said. **[convention; medium confidence on the exact trigger point.]** After one
  prompt, if the candidate still has nothing, the examiner moves on. There is no explicit penalty
  clause, but a short turn is self-penalising: the Fluency & Coherence criterion is built around
  *willingness and ability to speak at length*, so a 40-second turn simply supplies no evidence of
  band 7 fluency.
* **If the candidate goes off topic:** the examiner does **not** intervene or redirect. Relevance
  is not separately scored. However, an off-topic talk usually correlates with the coherence
  problems that *are* scored, and it wastes the candidate's best evidence-gathering opportunity.

### 3.4 Rounding-off questions

* After the talk the examiner asks **one or two short questions on the same topic**. The official
  sample labels these "rounding off questions", and its examples are simple, near-closed, and tied
  directly to what the candidate has just described — for a card about a possession, the two
  follow-ups probe its monetary worth and how replaceable it is. Author your own in that register;
  do not lift published examples.
* **Function:** decompression and re-entry. They pull the candidate out of monologue mode and back
  into dialogue mode before the demands of Part 3. They are deliberately *easier* than Part 3.
* **Are they always asked? No.** If the talk ran the full two minutes and Part 2 has consumed its
  3–4 minutes, the examiner may skip straight to Part 3. Candidates should be told that skipping
  is neutral-to-positive, not a bad sign. **Confidence: high** (partner sample says "one or two
  questions"; the skip behaviour is examiner-sourced but consistently reported).
* **Expected answer length: short.** One or two sentences. Launching into another 90-second answer
  here is a misread of the move.
* **Design implication for us:** every Part 2 card should carry **2 rounding-off questions**, both
  answerable in one or two sentences, both derived from the talk rather than from the topic in the
  abstract. Our existing `cue_card.rounding_off[]` field is exactly right; keep it at 2.

---

## 4. Part 3 — two-way discussion (4–5 min)

* **Relation to Part 2:** Part 3 is thematically anchored to the Part 2 topic but pivots from
  *personal* to *general*. If Part 2 was "describe a place near you that has changed", Part 3 is
  about how neighbourhoods and cities change, who decides, and what is lost. The examiner makes
  this pivot explicit with a bridging move that names the previous topic and announces a shift to
  broader questions.
* **Internal structure:** typically **two (sometimes three) sub-topic areas**, each introduced by
  its own signposting move, with a handful of questions each — roughly **4–6 questions total**,
  plus improvised follow-ups. The official sample shows exactly this: a first area (how values
  change) and a final area (the role of advertising), each announced.
* **Escalation is real and deliberate.** Within an area, the examiner typically moves:
  *state an opinion* → *justify it* → *compare or contrast* → *speculate about the future or a
  counterfactual* → *evaluate a trade-off*. The examiner probes upward until the candidate's
  ceiling is visible, then stops. Being asked harder and harder questions is a sign the examiner is
  probing an upper band, not a sign of failure.
* **Question archetypes** worth authoring against (this is the taxonomy our Part 3 cards should
  cover deliberately):
  1. **Opinion** — should X be done / is X a good thing?
  2. **Cause** — why does X happen / why has X increased?
  3. **Comparison** — how does X differ between generations, countries, city vs country, then vs now?
  4. **Evaluation / trade-off** — what are the benefits and drawbacks; who gains and who loses?
  5. **Speculation about the future** — will X continue; what will X look like in 30 years?
  6. **Hypothetical / counterfactual** — what would happen if X; how would things differ if Y?
  7. **Responsibility / agency** — whose job is it: government, schools, families, individuals,
     companies?
* **The examiner genuinely interacts here.** They may pick up something the candidate said and
  push on it, ask for elaboration ("can you say a bit more about that?"-type moves), or offer a
  mild counter-position to see whether the candidate can concede and rebut. They are *not*
  disagreeing personally; it is a probe. Candidates who capitulate to every counter-position lose
  the chance to show concessive and argumentative language.
* **The examiner may rephrase in Part 3** (unlike Part 1). See §8.
* **Language demanded:** hedging and modality (*tends to, is likely to, arguably, by and large*),
  concession (*admittedly… but*), abstract noun phrases, conditionals, comparative structures,
  and the ability to give an example that supports rather than replaces the argument. This is where
  bands 7+ are separated from band 6.
* **Answer length:** noticeably longer than Part 1 — roughly 30–60 seconds, or 4–6 developed
  sentences. Not a monologue; the examiner needs room for 4–6 questions in 4–5 minutes.

### The single most transferable Part 3 answer shape

Position → reason → concrete example → concession/counterweight → (optional) restatement.
The **concession** step is what most band-6 candidates omit, and it is the cheapest, most reliable
upgrade we can teach. Our existing Part 3 payloads already carry a `counterpoint` string per theme
— that field is the right hook for teaching this, and should be used to seed a concession the
candidate must answer, not just a fact.

---

## 5. What is assessed

Four criteria, **equally weighted (25% each)**, rated across the whole test, reported in whole and
half bands. Paraphrased in our own words (the descriptor prose itself is copyrighted — never
reproduce it; these are our summaries of *what the criterion is about*):

1. **Fluency and coherence** — can the candidate keep going at a natural pace, and does the talk
   hang together? Sub-features: answer length appropriate to the task; amount of hesitation,
   self-correction and repetition; whether hesitation is for *content* (fine) or for *language*
   (costly); range and appropriacy of discourse markers and cohesive devices; logical sequencing.
   A signature band-6 pattern from Cambridge's own worked example: speaks the full two minutes at a
   natural pace but becomes hesitant and repetitive late in the turn and over-relies on *so* and
   *and* instead of varied connectives.
2. **Lexical resource** — range (everyday + less common + idiomatic/colloquial), and above all
   **appropriacy**: word form, collocation, and the ability to **paraphrase around a gap**. The
   worked example scores errors of collocation (`make an internship`, `charge them into my
   computer`) as lexical, not grammatical. Paraphrase ability is explicitly a rated sub-feature —
   a candidate who can talk *around* a missing word rather than stalling is demonstrating exactly
   what the criterion asks for.
3. **Grammatical range and accuracy** — control of simple forms (agreement, tense, pronoun) *and*
   presence of complex forms (relative clauses, non-finite clauses, conditionals, passives) *and*
   their accuracy. Both range and accuracy; neither alone is enough. Errors in *simple* forms are
   disproportionately damaging because they suggest the base is unstable.
4. **Pronunciation** — intelligibility first, then the features that create it: individual sounds,
   word stress, sentence stress, rhythm, intonation. Assessed on *how easy you are to follow*.

## 6. What is NOT assessed

This list matters more than the previous one, because most learner anxiety attaches to things that
carry no marks:

* **Accent.** Explicitly not graded. Partner guidance states plainly that candidates do not need to
  change their natural accent, and that examiners are trained across global accents. Only
  intelligibility counts. There is no preferred "British" or "American" target.
* **The opinions held.** No mark for agreeing with the examiner or holding a "good" view. Partner
  guidance lists "you must agree with the examiner" as a myth.
* **Factual truth.** Answers need not be true. Invented but coherent content is perfectly
  acceptable — and often better, because a fluent invention beats an honest struggle. (Caution to
  teach: a fabricated story you cannot sustain under Part 3 probing is worse than a real one.)
* **Knowledge.** Not knowing anything about the subject is not penalised; partner guidance says
  examiners assess how you communicate, not what you know. The correct move is to say so *in
  English* and pivot to experience or speculation, which itself demonstrates language.
* **Task completion / covering the bullets.** No task-achievement criterion exists in Speaking.
* **Politeness, charm, eye contact, posture, clothing.** Not criteria.
* **Test length, being interrupted, being stopped at 2 minutes.** Not criteria.
* **Handwriting or content of the Part 2 notes.** Never seen by anyone but the candidate.
* **Speed.** Fluency is about continuity and rhythm, not words per minute. Fast, breathless,
  unintelligible speech scores *worse*.

**Actively penalised (the inverse case):** obviously **memorised, rehearsed material**. The
descriptor scale itself treats "memorised utterances" as a low-band phenomenon, and a delivery that
switches register into a recited block is transparent to a trained examiner. This is the single
strongest argument against the "learn 50 model answers" study strategy our competitors sell, and it
should shape our product's teaching stance.

---

## 7. The examiner's frame — function, register, and our authored equivalents

The examiner works from a **scripted frame**. Parts 1 and 2 are delivered close to verbatim
(which is precisely why the examiner cannot paraphrase in Part 1); Part 3 has a scripted skeleton
with genuine discretion in probing. The register throughout is: **professional-warm, economical,
first-person-plural for topic moves, no evaluation, no small talk beyond the opening**.

Below: each move, its **function**, its **register markers**, and an **original BandReady
equivalent** (written for this project — safe to ship; do **not** replace these with wording copied
from any official frame).

| # | Move | Function | Register markers | BandReady equivalent (original) |
|---|---|---|---|---|
| 1 | Opening greeting + self-ID | establish who is running the test; start the recording cleanly | brisk, friendly, complete sentences, no filler | "Good morning. My name's Alex Hardy, and I'll be your examiner today." |
| 2 | Name request | identity verification for the recording | direct request, softened by *could/can* | "Could you tell me your full name, please?" |
| 3 | Preferred-name request | reduces distance for the interview | light, optional-sounding | "And what would you like me to call you?" |
| 4 | ID check | procedural verification | flat, procedural | "Thank you. Could I see your identification, please?" |
| 5 | Part 1 launch | signal the shift from admin to test | explicit metacomment on the phase, sometimes with a tag inviting assent | "Thank you. We'll begin with a few everyday questions about you and your life." |
| 6 | Topic-frame opener | announce the topic area before the first question of a frame | first-person-plural hortative naming the area | "Let's start with where you live." |
| 7 | Topic-frame shift | close one area and open the next without evaluating | *now / next / turning to* + hortative | "Now I'd like to turn to food and cooking." |
| 8 | Extension prompt | elicit more when an answer is too short | one word or a fragment, never a full new question | "Why is that?" / "And why not?" |
| 9 | Part 2 launch | flag the change of task type | metacomment, slower delivery | "In this next part I'll give you a subject to speak about on your own, for up to two minutes." |
| 10 | Card + materials handover | give the card, paper and pencil; license note-taking | sequenced imperatives, unhurried | "This is your subject, and this is paper and a pencil for jotting things down." |
| 11 | Prep instruction | start the one minute; make the limit explicit | numeric, unambiguous | "Take sixty seconds to plan it out, and jot down anything that helps." |
| 12 | Reassurance about the cut-off | pre-empt panic at being stopped | explicitly permissive, reduces threat | "It's completely normal for me to cut in at the two-minute mark, so please don't let that throw you." |
| 13 | Start cue | hand the floor over unmistakably | short, polite imperative | "Whenever you're ready, please begin." |
| 14 | (during the talk) silence | protect the long turn; give no feedback signal | *absence* of backchannel is the marker | — (simulate genuine silence) |
| 15 | Stop at 2:00 | end the turn on time, mid-sentence if needed | one-word acknowledgment, no evaluation | "Thank you." |
| 16 | Rounding-off question | ease back into dialogue | short, concrete, tied to what was just said | "Do you still use it as much as you used to?" |
| 17 | Part 3 bridge | connect Part 2's topic to the general discussion | names the old topic, announces abstraction | "Your subject there was a place that has changed. I'd now like to broaden that out and look at the wider picture." |
| 18 | Sub-topic signpost | open each Part 3 area | hortative + abstract noun phrase | "First, let's think about how cities change." / "Finally, I'd like to ask about who pays for that change." |
| 19 | Probe | push for depth on what the candidate said | short, contingent on the answer, often a bare question | "Why do you think that is?" / "Could you expand on that a little?" |
| 20 | Counter-probe | test concessive/argumentative range | mild, impersonal, framed as *some people* | "Some people would say the opposite. What would you say to them?" |
| 21 | Closing | end the test cleanly, give no result | flat, final, no feedback | "Thank you, that's the end of the speaking test." |

**Register rules our examiner voice must obey**

* Never evaluate. No "good", "excellent", "that's interesting", no visible approval or
  disappointment. A candidate reading the examiner's face for feedback is reading noise.
* Never teach or correct. No recasts, no supplying a missing word, no vocabulary help in Parts 1–2.
* Never volunteer personal information or answer questions about the examiner's own life.
* Never give a score, an estimate, or a hint at the end.
* Keep the transitions crisp: the examiner's job is to maximise the candidate's talking time, so
  examiner turns are short by design. Roughly, **the candidate should hold ~80% of the airtime**.
* Consistency over personality: the frame exists so that every candidate worldwide gets the same
  test. Our synthetic examiner should sound the same at question 1 and question 30.

---

## 8. Interaction rules — the things candidates actually get wrong

**Does the examiner correct you?** No. Never. Not a word, not a recast, not a facial reaction.
**Does the examiner help you?** Only within tightly bounded limits, and the limits differ by part:

| Situation | Part 1 | Part 2 | Part 3 |
|---|---|---|---|
| Candidate asks for the question to be **repeated** | Yes — the examiner may repeat it, once. | The task instructions/card wording are not re-explained; the card stays in front of the candidate for the whole turn, so re-reading is the remedy. | Yes, and more freely. |
| Candidate asks for a **rephrase / explanation of a word** | **No.** The frame is scripted and the examiner may not paraphrase or gloss vocabulary. | No. | **Yes** — the examiner may reword the question and explain terms. |
| Candidate asks the examiner's **opinion** | Deflected. | n/a | Deflected — politely turned back to the candidate. |
| Candidate says something factually wrong | No reaction. | No reaction. | No reaction (a counter-probe is not a correction). |

**Confidence:** the Part 1 "repeat but not rephrase" / Part 3 "rephrase allowed" asymmetry is
**[convention]** — it is not published on partner sites, but it is stated consistently and
independently by multiple former-examiner sources, and it follows logically from Part 1 being a
verbatim script and Part 3 being a discussion. **Medium-high confidence. Teach it as "expect this",
not as "the rules say".**

**Score impact of asking:** asking for a repetition or a clarification once or twice costs nothing.
It is not marked. What *does* cost is doing it habitually — every repetition is dead airtime that
produces no ratable language, and a pattern of non-comprehension is itself evidence about listening
and processing. Teach: **ask once, cleanly, in good English** ("Sorry, could you repeat that?" is
itself a piece of ratable language), then commit to an answer.

**Misunderstanding the question.** If a candidate answers a different question, the examiner does
not correct them; they simply move on. Given that, the candidate's best insurance is a
**one-clause confirmation opener** ("So, whether children today spend enough time outdoors —") that
both buys thinking time and surfaces a misunderstanding in Part 3 where the examiner *is* allowed to
help.

**Stopping early.** Part 1: examiner prompts with a short extension move ("Why?") and moves on.
Part 2: examiner prompts once, then moves on. Part 3: examiner probes. In no case is there an
explicit penalty; in every case the cost is the same — less language produced, less evidence, lower
fluency evidence.

**Being interrupted.** Interruption is a **time-management tool**, not a judgement. Examiners
interrupt because they have a fixed frame to get through and because once a language function has
been demonstrated there is no value in more of it. This is worth stating loudly and repeatedly in
our teaching copy: many candidates leave the test believing an interruption at Part 2's two-minute
mark meant they failed.

**Silence.** There is no rule against a short pause to think. Long silence is expensive because it
is scored under fluency; brief, *marked* thinking time ("That's an interesting one — I suppose…")
is not, because it is language. Teaching candidates to convert dead silence into hedged,
low-risk filler language is one of the highest-leverage interventions available.

---

## 9. Myths worth correcting for learners

Ranked by how much damage they do:

1. **"Memorise model answers."** The most damaging. Rehearsed blocks are detectable, and the band
   scale itself treats memorised utterance as a low-band feature. Memorise *frames and functions*,
   never *content*.
2. **"Use the biggest words you know."** Lexical resource marks *appropriacy* as heavily as range.
   A misused advanced word costs more than a correctly used ordinary one. Partner guidance says
   this explicitly.
3. **"You must speak for exactly two minutes / you failed if you were cut off."** Being stopped at
   2:00 is the intended outcome.
4. **"You need a British/American accent."** Explicitly not assessed. Intelligibility is.
5. **"You must give true answers."** No. Fluent and coherent beats true.
6. **"You must have an interesting opinion / must agree with the examiner."** Neither is marked.
7. **"A short test (11 min) means I did badly."** Length is not a criterion.
8. **"Asking the examiner to repeat loses marks."** It does not, in moderation.
9. **"The examiner's poker face means I'm doing badly."** Neutrality is mandatory professional
   behaviour, not feedback.
10. **"Speaking fast sounds fluent."** It sounds unintelligible. Rhythm and continuity, not speed.
11. **"You must cover all the bullet points on the card."** No task-achievement criterion exists.
12. **"Speaking is scored per part."** It is one rating over the whole test.
13. **"Part 3 questions are getting harder because I'm doing badly."** Escalation is how the
    examiner locates your ceiling.
14. **"Idioms will raise my band."** Only if natural and accurate; forced idiom is a classic
    band-6 tell.
15. **"Academic and General Training have different Speaking tests."** They do not.

---

## 10. Where the current pack already matches reality (and where it does not)

Checked against `content/core-en/data/speaking_cards.jsonl` and
`sidecar/bandready/content/validate.py`.

**Already faithful:**

* Part 2 `cue_card.bullets[4]` with the fourth entry as an *and explain…* line mirrors the real
  card exactly (3 descriptive + 1 evaluative). Keep this invariant — it should be enforced
  editorially, and ideally asserted in a lint script: **bullet 4 must be an explain/evaluate move.**
* `cue_card.rounding_off[]` with 2 short questions matches the "one or two questions" move.
* Part 3 `part3_themes[]` with 2 themes × 3 questions matches the two-sub-topic structure and the
  4–6-question volume.
* Part 1 `questions[5]` sits at the right size for a single frame.

**Gaps worth closing in the expansion (evidence-backed, for later agents):**

1. **Part 1 packs a single frame, but a real Part 1 is three frames including an obligatory
   work/study + home frame.** A realistic Part 1 session needs a *sequence*: personal frame first,
   then two topic frames. `card_sets` already lists `part1_card_ids[]` (plural) — the fix is
   editorial (author a personal frame per set, or a shared reusable one) rather than structural.
2. **Nothing currently encodes tense demand,** yet crossing tenses inside a frame is the real
   difficulty of Part 1 and the thing prep advice most reliably fixes. A `target_grammar` or
   `tense_focus` field in `payload_json` costs nothing (free-form payload, no migration) and
   unlocks targeted teaching.
3. **Nothing encodes the escalation ladder in Part 3.** The archetype taxonomy in §4 should be
   attached per question (`archetype: "speculation"`) so a session can escalate deliberately and so
   we can guarantee coverage across the pack.
4. **`counterpoint` exists but is under-specified.** Per §4, its highest value is as a *counter-probe
   the candidate must concede-and-rebut*, which is the band-6→7 lever. Author it as something an
   examiner would actually push back with.
5. **No field carries the examiner's frame moves.** If we want a faithful session (silence during
   the long turn, a stop at 2:00, a skip of rounding-off when the talk ran long), the moves in §7
   need to live somewhere — either as a shared examiner-script resource or per-card overrides.
6. **Timing constants to hard-code in the practice UI:** Part 1 answer target 5–20 s; Part 2 prep
   exactly 60 s, talk 60–120 s with a hard stop at 120 s; rounding-off ≤ 2 questions and skippable
   if the talk ran ≥ 115 s; Part 3 answer target 30–60 s; whole session 11–14 min.

---

## 11. Teaching hooks this research directly justifies

Each of these is grounded in a specific finding above, and each is actionable within a week:

* **A 60-second prep method** (the prep minute is silent, unaided and short): pick a real memory in
  10 s → fix the tense in 5 s → note 4 keyword clusters, one per bullet, not sentences → reserve the
  last 10 s for the *explain* line, because that is the bullet candidates reach unprepared.
* **Rescue language for "I don't know"** (knowledge is not assessed, silence is): a stock of
  hedged pivots that convert ignorance into ratable language.
* **Concession drills** (band 6→7 lever, and Part 3's counter-probe is guaranteed).
* **Paraphrase-around-the-gap drills** (paraphrase is a *named* lexical sub-feature; stalling on a
  missing word is the failure mode it targets).
* **Cut-off inoculation** — practise being stopped at exactly 2:00 so the real thing is a
  non-event.
* **Discourse-marker range** beyond *so/and* — Cambridge's own worked band-6 example names
  over-reliance on *so* and *and* as the coherence weakness.
* **Tense-matching drill** — answer in the tense the question was asked in, then extend into
  another tense deliberately; partner guidance lists this as an examiner-approved tip.
* **Anti-memorisation stance in product copy** — teach frames, refuse to ship "model answers to
  recite". This is a differentiator, not a limitation.

---

## 12. Confidence notes and points where sources disagree

| Claim | Confidence | Note |
|---|---|---|
| 11–14 min total; 4–5 / 3–4 / 4–5 min split | **High** | Identical on ielts.org, British Council and IDP. |
| Speaking is identical for Academic and GT | **High** | Both ielts.org format pages carry the same description. |
| One minute prep, paper and pencil provided, 1–2 min talk, stop at 2 min | **High** | Official format pages. |
| Card = topic + 3 bullets + final explain line | **High** | Official sample task card; format page says the card "instructs you to explain one aspect". Coaching sites often render it as "4 bullets" — same thing, different typography. Our 4-element `bullets[]` array is compatible. |
| Rounding-off = 1–2 questions, easier than Part 3 | **High** | Officially labelled and exemplified in the sample task. |
| Rounding-off is sometimes skipped when the talk ran long | **Medium-high** | Examiner-sourced; not in partner copy. Consistent across sources. |
| Part 1 = ~3 topic frames, first one obligatory work/study + home | **Medium-high** | **Sources disagree on count.** British Council practice copy says "4–6 general questions"; teaching sources say ~12 questions over 3 topics. Best reading: 4–6 questions *per frame*, 2–3 frames. Treat "3 frames" as a design target, not a documented rule. |
| Part 1: repeat allowed, rephrase not; Part 3: rephrase allowed | **Medium-high** | **[convention]** — consistently reported by former examiners, never published by the partners. Present to learners as "expect this", not "the rules state". |
| Examiner prompts once if the Part 2 talk stops before ~1 minute | **Medium** | Widely reported; the exact trigger point is not documented and likely varies. |
| Examiner stays completely silent during the long turn | **Medium-high** | Universal in recorded tests and examiner accounts; not written down in partner copy. |
| Four criteria equally weighted at 25% each | **Medium-high** | IDP's pronunciation article states 25% for pronunciation, implying equal weighting; ielts.org lists the four criteria without an explicit weighting statement. No source contradicts equal weighting. |
| Whole-test rating rather than per-part | **High** | Cambridge's assessment-training material states marks reflect the whole exam. |
| Accent not assessed; opinions not assessed; knowledge not assessed | **High** | Stated directly by IDP partner articles and implicit in the criterion set. |
| Memorised material is penalised | **Medium-high** | The public band scale treats "memorised utterances" as a low-band feature; the *detection and penalty* process is not published in detail. State it as "recited answers read as low-band language", not as "you will be disqualified" (that is a separate malpractice matter). |
| Every test is recorded | **High** | Partner FAQ / privacy notices. |
| All IELTS on computer from mid-2026; Speaking still live human, in person or video call | **High** | ielts.org "ways to take IELTS", British Council booking pages, IDP F2F-vs-VCS page. Worth re-checking annually. |
| Video call and in-person are equivalent in scoring | **High** | Backed by published IELTS partner research reports on VCS development and cross-mode performance. |

**Things I could not verify and deliberately did not assert:** the exact contents of the
instructions-to-examiners document; whether examiners are formally required to prompt a short Part
2 turn; the precise arithmetic used to combine four criterion ratings into a reported half band;
whether any given test-day frame contains two or three Part 1 topic areas. Two official PDFs
(`ielts_guide_for_teachers.pdf`, `ielts_speaking_band_descriptors.pdf` on the British Council site)
returned bot-blocked responses and could not be read directly; their content is covered indirectly
via the Cambridge assessment-training PDF, which reproduces the public band descriptors.

---

## Sources

Official IELTS partner material (highest weight):

* IELTS Academic — Speaking test format — https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking
* IELTS General Training — Speaking test format — https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-speaking
* IELTS Speaking Sample Tasks (2023 PDF, full examiner frames + transcripts for Parts 1–3, including an official Part 2 task card and its rounding-off questions) — https://ielts.org/cdn/ielts-sample-tests/ielts-speaking-sample-tasks-2023.pdf
* Ways to take IELTS: online, computer or paper — https://ielts.org/take-a-test/why-choose-ielts/ways-to-take-ielts
* IELTS Online (Academic) — https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-online
* Research report — Development of the IELTS Video Call Speaking Test — https://ielts.org/researchers/our-research/research-reports/development-of-the-ielts-video-call-speaking-test
* Research report — Performance across two delivery modes (F2F vs video conferencing), phase 2 — https://www.ielts.org/researchers/our-research/research-reports/exploring-performance-across-two-delivery-modes-for-the-ielts-speaking-test-face-to-face-and-video-conferencing-delivery-phase-2
* British Council — IELTS test format explained — https://takeielts.britishcouncil.org/take-ielts/test-format
* British Council — IELTS on computer — https://takeielts.britishcouncil.org/take-ielts/book/ielts-on-computer
* British Council — paper / computer / online — https://takeielts.britishcouncil.org/take-ielts/book/paper-computer
* British Council — FAQs (recording, ID) — https://takeielts.britishcouncil.org/frequently-asked-questions
* British Council — IELTS assessment information — https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment
* British Council — practice speaking test Part 1 / Part 2 / Part 3 — https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/speaking/part-1 · /part-2 · /part-3 *(pages bot-blocked to direct fetch; content corroborated via search summaries)*
* British Council — Speaking Part 2 PPF strategy handout (PDF) — https://takeielts.britishcouncil.org/sites/default/files/speaking_part_2_-_ppf_strategy.pdf
* British Council — IELTS Guide for Teachers (PDF) — https://takeielts.britishcouncil.org/sites/default/files/ielts_guide_for_teachers.pdf *(fetch blocked; listed for completeness)*
* Cambridge / UCLES — *Assessing Speaking Performance: IELTS* (PDF; public band descriptors plus four worked criterion analyses of a real candidate) — https://ielts.ch/wp-content/uploads/2021/04/assessing-IELTS-speaking.pdf
* Cambridge English — IELTS Speaking band descriptors, public version (PDF) — https://assets.cambridgeenglish.org/webinars/ielts-speaking-band-descriptors.pdf *(surfaced in search; not fetched directly — the same public descriptors are reproduced in the Cambridge PDF above, which was read in full)*
* IDP — Myths about the IELTS Speaking test — https://ielts.idp.com/prepare/article-ielts-speaking-test-myths-debunk
* IDP — 10 examiner-approved Speaking tips — https://ielts.idp.com/prepare/article-examiner-approved-tips-for-the-ielts-speaking-test
* IDP — Does IELTS Speaking assess your accent? — https://ielts.idp.com/prepare/article-does-ielts-speaking-assess-your-accent
* IDP — Is my accent hurting my Speaking score? — https://ielts.idp.com/prepare/article-accents-ielts-speaking-scores
* IDP — How Speaking scores are calculated — https://ielts.idp.com/results/scores/speaking
* IDP — Speaking practice questions and sample tasks — https://ielts.idp.com/prepare/article-free-speaking-practice-questions
* IDP — Face-to-face vs Video Call Speaking (VCS) formats — https://ielts.idp.com/thailand/prepare/speaking/ielts-speaking-format
* IDP — Tips for IELTS VCS — https://ielts.idp.com/prepare/article-tips-for-ielts-vcs-video-call-speaking
* IDP — Cue card topics for the Speaking test — https://ielts.idp.com/thailand/about/news-and-articles/article-cue-card-topics-for-speaking-test

Examiner-sourced and credible teaching material (used only for **[convention]** claims, flagged as
such above):

* IELTS Liz (former examiner) — why the examiner stops your answer — https://ieltsliz.com/why-the-ielts-speaking-examiner-stops-your-answer/
* IELTS Liz — rounding-off questions in Part 2 — https://ieltsliz.com/rounding-off-questions-in-ielts-speaking-part-2/
* IELTS Liz — asking the examiner questions — https://ieltsliz.com/ielts-speaking-tips-asking-the-examiner-questions/
* Keith Speaking Academy (former examiner) — Speaking test format — https://keithspeakingacademy.com/ielts-speaking-test-format/
* Keith Speaking Academy — Speaking Part 1 topics and questions — https://keithspeakingacademy.com/ielts-speaking-part-1/
* IELTS Advantage — asking the examiner questions — https://www.ieltsadvantage.com/2015/07/07/speaking-asking-the-examiner-questions/
* IELTS Buddy — can I ask the examiner to repeat or rephrase? — https://www.ieltsbuddy.com/can-i-ask-the-examiner-to-repeat-or-rephrase-a-question.html
* Magoosh — asking for clarification in IELTS Speaking — https://magoosh.com/ielts/clarification-ielts-speaking/

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge
University Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any
of them. No exam material is reproduced in this document; all example wording in §7 is original
text authored for BandReady.*
