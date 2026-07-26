# R4 — Speaking pedagogy: how to make BandReady coach, not just score

Research briefing for the speaking-module content push. Written 2026-07-27.
Scope: what the evidence says about teaching spoken English and IELTS-style speaking, translated
into content fields and product features BandReady can actually ship.

**Copyright posture for everything below.** Every example question, frame, chunk and model
sentence in this document is authored from scratch. Nothing is transcribed from a past paper, a
prediction list, or a coaching site. Where a source is a coaching provider, I took the *technique*
(a fact about practice) and re-expressed it, never their wording. Official band descriptors are
referenced as criteria, never quoted beyond the short public phrases already discussed in
`docs/plan/04-speaking-module.md §6.2`, which are paraphrased there.

**One-line thesis.** The single biggest lever is not more content and not better scoring — it is
*narrowing* what we say after each performance to one actionable thing, and forcing a
self-comparison against a model **after** the learner has already spoken. Everything else in this
briefing is downstream of those two moves.

---

## 1. What actually makes speaking feedback change behaviour

### 1.1 The evidence

| Finding | Source | What it implies for us |
|---|---|---|
| Corrective feedback has a **medium overall effect (d ≈ 0.64)** on L2 development, and the effect is durable over delayed post-tests | Li (2010) meta-analysis | Feedback works. The question is *which kind*, not *whether*. |
| **Explicit** feedback beats implicit on immediate and short-delayed measures | Li (2010) | Say the rule/name the problem. Don't hint. "Your past-simple endings dropped on three verbs" beats a raised eyebrow. |
| **Prompts beat recasts.** Recasts (silently reformulating the learner's sentence) produced *no uptake* roughly 69% of the time; prompts (elicitation, clarification requests, metalinguistic cues, repetition) withhold the correct form and provoke self-repair | Lyster & Ranta; Lyster & Saito classroom meta-analysis (15 studies, N = 827); Chinese high-school OCF corpus study | Our coach persona currently *models the corrected sentence out loud* — that is a recast. Keep it, but only **after** one prompt attempt. Ask "how would you say that again?" first, then supply. |
| Effects were **largest on free constructed responses**, not on discrete-item tests | Lyster & Saito | Judge our own success by whether the learner speaks better in the *next unscripted* session, not by a quiz score. |
| Over **one-third of feedback interventions in a 600-study meta-analysis made performance worse**; effectiveness falls as attention moves *up* the hierarchy from the task toward the self | Kluger & DeNisi (1996), Feedback Intervention Theory | A big number labelled "you are a 5.5" is self-level feedback. It is exactly the kind that can backfire. Band scores must be de-emphasised in practice modes and reserved for benchmarks. |
| Timing: **no reliable winner** between immediate and delayed. Some hybrid studies favour immediate; retrieval-practice studies favour delayed for long-term retention; a 2025 study using Feedback Intervention Theory found both beat no-feedback with no significant difference between them | Cambridge *Language Teaching* review on CF timing; systematic review of CF timing (2023); Nature *HSSC* (2024) feedback-timing + retrieval study | We can choose timing on UX grounds. Choose: **never interrupt a long turn** (that's an anxiety and fluency cost with no learning payoff), give feedback **at the seam** — end of an answer in Drill, end of the part in Single Part, end of the test in Full Mock. |
| **Noticing** is the mechanism: learners must consciously register the gap between what they said and what the target is | Schmidt's Noticing Hypothesis, as operationalised in the CF literature | Feedback that the learner reads passively is weaker than feedback they *derive*. Build a step where they find the gap themselves. |
| **Self-transcription** of one's own recorded speech reliably produces noticing and measurable accuracy gains; in one study, transcription errors fell from 19 to 13 between a first and second presentation | Lynch, *ELT Journal* "Students transcribing tasks"; Chilean ELT self-transcribing study | We already store per-turn audio and a transcript. A "listen back and mark one thing" step is nearly free and is one of the highest-yield features in this document. |
| Rubrics used for **self-assessment reduce cognitive load and increase accuracy** of self-evaluation, and drive goal-setting | *Metacognition and Learning* (2022); criteria-referenced self-assessment studies | Show the paraphrased descriptor row *before* the AI band, ask the learner to pick their own band, then reveal. The gap between the two is itself a teachable object. |
| **Model texts / reformulations** work chiefly through the *comparison stage*: learners notice most of the differences between their own output and the reformulated version, and this induces productive cognitive conflict | Adams (2003) on reformulation and noticing; Yang & Zhang (2010) reformulation vs. model text; *Frontiers in Psychology* (2023) on model texts as feedback | The model answer must arrive **after** the attempt, presented **beside** the learner's own words, never before it as a thing to study. |

### 1.2 The feedback contract BandReady should adopt

Codify this once and enforce it in prompts, UI and content:

1. **One primary fix per performance.** Not one per criterion — one, full stop. Everything else is collapsed behind "more detail". Rationale: Kluger & DeNisi's harm finding is driven by attention dispersal and self-focus; the coach persona already says "ONE improvement only", and the *report* should obey the same rule.
2. **The fix is a behaviour, not a deficit.** "Practise linking contrast with *whereas*" is a behaviour. "Your cohesion is weak" is a deficit restatement. The evaluation prompt already forbids restatements — extend that rule to the report headline.
3. **Prompt before recast.** In any interactive coaching moment: elicit a self-repair first ("Say that sentence again — one word is off"), supply the corrected form only if the retry misses.
4. **Explicit label, plain words.** Name the category in learner-friendly terms ("verb tense", "missing article", "word partner"), not grammar-book jargon.
5. **Never interrupt.** Feedback lands at a seam. Real examiners never correct; our coach corrects only *between* answers.
6. **Self-comparison before verdict.** Learner listens back / self-rates / marks one thing, *then* the AI speaks. This is the noticing step and it is where the learning is.
7. **Bands are for benchmarks only.** Full Mock and Single Part show bands. Topic Drill and Quick Chat show *behaviours and deltas* (words per minute, long pauses, whether the retry beat the first attempt) and no band number anywhere.
8. **Every fix is retryable in under 60 seconds.** If a piece of feedback has no "try it now" affordance attached, it is a note, not coaching.

**Known problem in the current plan (report to owner):** `docs/plan/04-speaking-module.md §6.3` lets the evaluation JSON contain up to **12 improvements** (1–3 × 4 criteria), 10 errors, 5 best moments and 8 vocab items — 35 items of feedback on one performance. That is the failure mode Kluger & DeNisi describe. The fix is presentational and cheap: keep generating them (they are useful as a searchable archive) but the report must open on exactly one.

---

## 2. Model answers without producing parrots

### 2.1 The constraint is real and official

IELTS partner guidance is explicit that memorised answers are counterproductive: memorised language does not give the examiner a measure of the candidate's actual English, examiners can tell, and it can affect the score. The public Speaking band descriptors themselves carry the phrase "no rateable language unless memorised" at the bottom of the scale — memorised content is treated as *not evidence of ability*. IDP's descriptor explainer separately warns candidates off memorised clichéd phrases in Lexical Resource, and off relying on a handful of over-used linkers in Fluency & Coherence.

So a model answer shipped as a script is not just pedagogically weak — it actively trains a behaviour the exam punishes. Some coaching sources (e.g. EFL Magazine's teaching guide) go all the way to "no model answers at all". That is an overcorrection: the reformulation/model-text literature shows models *do* work — **when the learner produces first and compares second**.

### 2.2 Design rules for model answers

1. **Attempt-gated.** The model answer UI is locked until the learner has recorded their own attempt on that card. No exceptions, no "peek".
2. **Presented as a diff, not a text.** Two columns: *You said* / *One way to say it*. The learner's own transcript is on the left. This is the reformulation comparison stage, which is where noticing happens.
3. **Annotated for technique, not content.** The annotations are the product; the prose is scaffolding. (Schema in §2.3.)
4. **Content-neutral.** A model must never assert a personal fact the learner would have to borrow ("my grandmother's house in the mountains"). Write models whose specifics sit in **swap slots** — visibly marked spans the learner is required to replace with their own life. A model with a named town in it will be memorised as-is; a model with `[a place you know well]` cannot be.
5. **Ship a contrast pair, not a single exemplar.** One weaker version and one stronger version of the *same* answer, differing in exactly 2–3 identifiable moves. Learners cannot extract technique from a single perfect specimen — there's nothing to compare against. A band-5-ish and a band-7-ish rendering of the same idea makes the technique visible.
6. **Every model ends in a transfer drill.** "Now say the same three sentences about *your* commute. 45 seconds. Go." The model is not finished until it has been re-produced with different content — that is procedural repetition (§6), not parroting.
7. **Text-first, audio-optional.** Audio models invite shadowing (good, §5) but also invite rote imitation of a whole answer. Ship the audio at *sentence* granularity, not answer granularity.

### 2.3 What a model answer should be annotated with

This is the concrete authoring spec. Annotations are spans over the model transcript, each carrying a `kind`, a short learner-facing `label`, a `why`, and a `transferable` flag. Only `transferable: true` spans appear in the "steal this" summary strip.

| `kind` | What it marks | Example label (original wording) | Why the learner cares |
|---|---|---|---|
| `move` | A rhetorical move in the answer's architecture | "Answers the question in the first six words" | Teaches structure, which transfers to every topic |
| `chunk` | A formulaic sequence with an open slot | "*the thing that stands out most is …*" | Directly reusable; see §4 |
| `grammar` | A structure being showcased deliberately | "Past perfect to set the scene before the main event" | Feeds Grammatical Range; nameable and drillable |
| `lexis` | A precise or less-common item, or a collocation | "*a steady stream of* — a word partner for traffic/visitors" | Feeds Lexical Resource and the vocab SRS inbox |
| `prosody` | A stress or intonation choice worth hearing | "Stress falls on *worse*, which is the contrast word" | Feeds Pronunciation, which is otherwise invisible in text |
| `repair` | A natural self-correction or hesitation that *doesn't* hurt | "Pauses to think of an idea, not a word — this is fine" | Reduces the fear that all hesitation is fatal |
| `swap` | A span the learner must replace with their own content | "[your own example goes here]" | The anti-memorisation device |
| `avoid` | Present only on the *weaker* contrast version | "Three linkers in one sentence — sounds rehearsed" | Negative exemplar; makes the target visible by contrast |

Annotation writing rules: `label` ≤ 8 words, `why` ≤ 20 words and always phrased as something the learner can do next time. Aim for **6–10 annotations** on a two-minute model — dense enough to be worth opening, sparse enough to read in 40 seconds. At least 3 must be `move` (structure transfers; vocabulary transfers less).

**Proposed `payload_json` extension for Part 2 cards** (free-form field, no migration needed; `SpeakingCardRow` in `sidecar/bandready/content/validate.py` is `extra="allow"` and `payload_json` is an untyped dict, so this is additive and safe):

```jsonc
"teaching": {
  "schema_version": 1,
  "model_answer": {
    "band_target": 7,
    "transcript": "…the whole two-minute answer, one paragraph per bullet…",
    "annotations": [
      { "span": "The place I want to talk about is",
        "kind": "move", "label": "Names the topic in the first sentence",
        "why": "Signposts immediately so the examiner hears you on-task", "transferable": true }
    ],
    "swap_slots": [
      { "span": "a small covered market two streets from my flat",
        "prompt": "Your own place — one specific detail, not a general one" }
    ],
    "steal_this": ["the thing that stands out most is …", "what really changed it was …"],
    "contrast": {
      "weaker": "…same content, thinner language…",
      "differences": ["No time reference before the main event",
                      "Repeats 'nice' three times",
                      "Ends abruptly instead of evaluating"]
    },
    "transfer_drill": "Say the same three moves about a place you pass every day. 45 seconds."
  }
}
```

---

## 3. Teaching the Part 2 long turn

Part 2 is where candidates lose the most and where a product can help the most, because it is the
only part with a *procedure* that can be taught.

### 3.1 The one-minute preparation

Official IELTS guidance on the prep minute breaks into three steps: understand the task (and if a
word on the card is unclear, ask **at the beginning** of the minute, not the end), pick something
you can genuinely describe — real beats invented — and make notes that are **in English**, **in
phrases not full sentences**, **in the order you'll speak them**, and legible.

The reason "phrases not sentences" is non-negotiable: full sentences cannot be written in 60
seconds, and any that are get *read aloud*, which flattens intonation and reads to an examiner as
scripted. Notes exist to jog memory, not to be performed.

Coaching practice adds a defensible time split, which multiple independent providers converge on:
roughly **10–15 seconds choosing the idea, ~45 seconds building structure**. The most common
self-inflicted wound is spending 40 seconds hunting for the "best" story. The instruction we should
give is blunt: *take the first thing you could describe for two minutes and commit*. A merely
adequate topic spoken fluently outscores a perfect topic spoken hesitantly, because this is a
language test, not a content test.

Note format: a four-cell grid (draw a cross, ~4 seconds) mapping one cell to each bullet, 2–4 words
per cell. This gives a visual position to return to when the mind blanks at 70 seconds (§3.3), and
it makes the final "explain" bullet visually impossible to forget — the single most common
omission.

**What BandReady should show during the 60 seconds** (design detail in §8, Feature 4): the cue card,
a four-cell note grid pre-labelled with the card's four bullets, and a segmented countdown that
visibly changes at 0:45 ("stop choosing — start noting") and at 0:10 ("read your grid once,
top to bottom"). Notes stay on screen through the long turn. They are never sent to the LLM.

### 3.2 Architecture of the two minutes

Four bullets, ~120 seconds, but **not** 30 seconds each. The bullets are not equal: the first three
are descriptive and the fourth is almost always an *explain/why/how-you-felt* bullet, which is
where the abstract language, the complex structures and the evaluation live. That is the bullet the
descriptors reward. A workable budget to teach:

| Segment | Target | Function | Language it pulls |
|---|---|---|---|
| Opening move | 0:00–0:10 | Name the thing and orient the listener | Present/past framing, one preview clause |
| Bullets 1–2 | 0:10–0:50 | Concrete description: where, what, who, when | Past simple/continuous, place and time phrases, concrete nouns |
| Bullet 3 | 0:50–1:20 | The turn: what happened / how it changed | Sequencing, past perfect, contrast |
| Bullet 4 ("explain…") | 1:20–1:55 | Evaluation and reason — the band-carrying section | Reason clauses, hedging, comparatives, abstract nouns |
| Landing | 1:55–2:00 | One closing sentence, ideally a forward or general statement | Conditional or general-truth present |

Teach the budget as *thirds*: describe, develop, evaluate. Learners who allocate evenly across four
bullets run out of description at 90 seconds and then stop — the classic 90-second collapse.

The two failure modes are symmetrical and both need a named remedy:

- **Under-running** (stops at 70–90 s) → the recovery ladder, §3.3.
- **Over-compressing** (races through all four bullets in 50 s because of nerves) → the fix is
  pacing, not content. Providers consistently flag the nervous speed-up at the start of the long
  turn. Our fluency metrics already compute `wpm` and `articulation_wpm`; a post-turn "your first
  20 seconds ran at 180 wpm, your average was 120" is a concrete, measurable, fixable observation.

### 3.3 Running dry at 70 seconds — the recovery ladder

This deserves to be taught as an explicit, memorised *procedure* (procedures are fine to memorise;
answers are not). Six moves, ordered by how little new content they require. Teach them as a
numbered ladder the learner climbs when they blank:

1. **Zoom in on a detail.** Pick any noun already said and describe it — colour, size, sound, smell,
   who else was there. Costs no new idea and reliably yields 15–20 seconds.
2. **Add time depth.** Say what it was like before, or what it's like now by comparison. This buys
   a tense change (good for Grammatical Range) as well as time.
3. **Bring in another person.** What someone else said, thought, or did about it. Reported speech is
   a range-showcase and there is always another person available.
4. **Contrast with the opposite.** "It's very different from…" — one sentence of comparison generates
   comparative structures and another 15 seconds.
5. **Speculate.** What would have happened otherwise, or what might happen next time. Conditionals
   are directly band-relevant and require no factual recall at all.
6. **Evaluate out loud.** Say why it mattered, whether you'd repeat it, what you'd change. If the
   fourth bullet hasn't been covered yet, this *is* the fourth bullet, so this move is never wasted.

Two escape hatches worth teaching explicitly, both attested in coaching practice and both perfectly
legitimate: if you genuinely have no experience of the card topic, **talk about someone else's**;
and if you truly cannot find an example, **talk about why you don't have one** — that is still
extended, on-topic, assessable speech. The exam scores language, not autobiography.

What we must *not* teach: filler stalling ("that's a very interesting question, let me think about
that for a moment") as a time strategy. It's transparent, it's the most parroted move in the whole
exam, and it produces zero rateable language.

**Proposed content field** (Part 2 cards): a `recovery_moves` array of 3–4 card-specific instances of
the ladder, so the generic procedure lands as concrete prompts on this particular topic — e.g. for a
"place that changed" card, move 2 becomes "what did it look like five years ago?".

### 3.4 Notes: answering the plan's open question

`docs/plan/04-speaking-module.md` open question 2 asks whether the notes textarea should be logged.
Yes — log `note_char_count` and `note_line_count` only (never the content, which stays local).
Rationale: heavy note-writing is a documented proxy for the read-aloud failure mode, and if we can
show a learner "you wrote 340 characters of notes and your speech rate dropped 25% versus your
average", that is an unusually concrete, unusually actionable observation that no human tutor could
make. Cheap to compute, high explanatory value. Plain text only — no OCR, no handwriting.

---

## 4. Functional / formulaic language, without sounding canned

### 4.1 Why chunks, and the tension

Estimates in the formulaic-language literature put **55–80% of native speech** in prefabricated
sequences, and explicit instruction in formulaic sequences has repeatedly produced measurable oral
fluency gains for intermediate learners (experimental groups outperforming controls on post-tests;
correlations between formulaic use and oral proficiency). Chunks work because they are retrieved
whole, bypassing the formulation bottleneck that causes hesitation.

The tension: IDP's own descriptor guidance warns candidates off memorised clichéd phrases and
over-used linkers, and the "no rateable language unless memorised" clause means an answer built
entirely out of borrowed phrases scores *nothing*. Both things are true. The resolution is
**frames with open slots**, not sentences.

### 4.2 The resolution: five rules

1. **Teach frames, not sentences.** A frame has at least one open slot the learner must fill from
   their own meaning. "*What tends to happen is …*" is a frame. "In my humble opinion, it goes
   without saying that this is a double-edged sword" is a sentence, and a notorious one.
2. **Two or three exponents per function, never ten.** A learner who owns three hedges and uses them
   accurately outperforms one who half-owns twelve. Depth beats breadth here.
3. **Never two markers in one sentence.** Discourse-marker stacking is the loudest audible signal of
   rehearsal. One per idea, maximum.
4. **Earn it in production within 24 hours.** A chunk is not learned until it has been *spoken* in an
   answer about the learner's own life. This maps directly onto our vocab SRS: chunk items should
   get the `use-in-sentence` and `speaking-drill` exercise types, not `flip`.
5. **Grade for register.** Speaking is spoken. "*I'd say* …" is better speaking English than
   "*It is widely believed that* …", which is written English wearing a costume and reads as
   transplanted from an essay.

### 4.3 Function inventory (author these into content, originally worded)

Six communicative functions carry almost all of Part 3 and the fourth bullet of Part 2. For each,
ship 2–3 spoken-register frames, one negative exemplar, and the grammar it showcases. Frames below
are illustrative and original — the authoring pass should write a full set per topic domain.

| Function | Spoken-register frames (2–3, slotted) | Sounds canned — avoid | Grammar showcased |
|---|---|---|---|
| **Giving an opinion** | "*The way I see it, …*" · "*I'd probably say …*" · "*For me it comes down to …*" | "In my humble opinion" · "I strongly believe that" | Nominal *that*-clauses |
| **Hedging** | "*It tends to be …*" · "*More often than not, …*" · "*at least where I'm from*" | "It goes without saying" | Modals, adverbs of frequency |
| **Comparing** | "*Compared with X, Y is far more …*" · "*X is nothing like as … as Y*" | "On the one hand… on the other hand" (used reflexively) | Comparatives, *as…as* |
| **Speculating** | "*I imagine that would …*" · "*If that happened, we'd probably …*" · "*It's likely to …*" | "It is highly probable that" | 2nd conditional, *would* |
| **Conceding** | "*I can see why people say that, but …*" · "*That's fair up to a point — though …*" | "Every coin has two sides" | Concessive clauses, *although/though* |
| **Exemplifying** | "*Take X, for instance …*" · "*A good example would be …*" · "*This happened to me once — …*" | "For example" repeated four times | Fronting, apposition |

The `avoid` column is not decoration. Showing the canned version next to the natural one is the
same contrast mechanism as §2.5, and it inoculates learners against the phrase lists circulating
online, which is where most band-6 plateaus come from.

**Proposed content field:** on Part 3 cards, a per-theme `target_functions: ["conceding",
"speculating"]` plus `frames: [{function, frame, slot_hint}]`. On Part 2 cards, attach the frames
the fourth bullet naturally pulls. This lets the coach persona and the report both reference the
*same* named inventory, so a learner sees "hedging" mean one consistent thing across the app.

---

## 5. Pronunciation and fluency drills — what the evidence actually supports

### 5.1 Shadowing

A 2025 systematic review of shadowing for L2 pronunciation teaching finds consistent gains for
**prosody** — intonation contours, rhythm, pitch — and calls the evidence for **segmentals
inconclusive**. Individual studies report large effects, but the review is the more reliable read:
shadowing is a prosody and fluency tool, not a substitute for phoneme work.

Dosage from the literature: Hamada found significant gains for lower-intermediate learners at
**10–15 minutes, 3–4 times a week, for six weeks**. Tamai's original work used 15–20 minutes daily.
Practitioner reports converge on noticeable prosodic change in 2–3 weeks and fluency change in
2–4 months. **Ship 10–15 minute sessions. Do not ship 45-minute sessions — nobody completes them.**

Progression that matches how shadowing is actually taught: listen → silent shadow (mouth only) →
mumble shadow (hum the contour) → full shadow with text → full shadow without text. Text-free
shadowing is the goal; text-supported shadowing is the on-ramp.

### 5.2 High-variability phonetic training (minimal pairs)

An HVPT meta-analysis over **79 studies** reports **medium-to-large effects on L2 speech
perception**, with retention over time and generalisation to novel stimuli; a separate meta-analysis
of the perception→production link finds transfer to production as well, though smaller. The active
ingredient is in the name: **multiple talkers, varied phonetic contexts**. Single-voice minimal-pair
drills lose most of the effect.

This is an unusually good fit for BandReady's stack. Kokoro ships **multiple voices**, so
multi-talker stimuli cost nothing but a voice-id loop over the same `pron_pairs.jsonl` rows — and
`pron_pairs.jsonl` is already an accepted pack file in `validate.py`. Getting HVPT right is close to
free for us and is genuinely hard for competitors who buy TTS per-character.

Sessions in the literature run short and frequent; identification tasks with immediate right/wrong
feedback are the standard format. 5–8 minutes, 10–20 trials, is a realistic in-app unit.

### 5.3 ASR-based pronunciation feedback (what we're actually building)

The most directly relevant meta-analysis (15 studies, 38 effect sizes, 2008–2021) puts ASR-based
pronunciation training at **g ≈ 0.69**, with four moderators that read like a product spec:

- **Explicit corrective feedback is largely effective; indirect feedback (plain dictation, "did the
  recogniser understand you?") is only moderately effective.** → Don't ship a dictation game. Name
  the sound, show the target, show what was heard.
- **Large effect on segmentals, small on suprasegmentals.** → ASR carries the phoneme work; shadowing
  carries the prosody work. They are complements, not alternatives. This directly supports the split
  in `docs/plan/09-pronunciation-assessment.md`.
- **Medium-to-long treatment duration is needed; short duration shows no advantage.** → A one-off
  pronunciation screen is worthless. It must be a recurring, scheduled activity or it should not
  ship at all.
- **Practising with a peer yields a large effect; practising alone, a small one.** → This is the
  uncomfortable one for a desktop app. The mitigation is to make the app behave like a partner
  rather than a mirror: it responds, it disagrees, it asks for a retry, it remembers last week's
  target sound. A silent scoring meter is the "alone" condition, and the "alone" condition is where
  the effect nearly vanishes.

### 5.4 Read-aloud and 4/3/2

Read-aloud has a narrow but real use: chunking and prosody practice on *known* text, where the
learner has no formulation load and can spend all attention on delivery. It does not build
spontaneous fluency and should never be positioned as speaking practice.

**Nation's 4/3/2** is the strongest cheap fluency intervention available. The learner delivers the
same talk three times to fresh listeners in 4, then 3, then 2 minutes. Nation (1989) and Arevart &
Nation (1991) report increased words per minute, fewer hesitations per 100 words, and fewer
grammatical errors in the repeated portions. The shrinking clock forces automatisation of the same
content; the changing audience keeps the communication genuine.

For IELTS timings, use **2:00 → 1:30 → 1:00 on the same cue card**. This is the single best-value
drill in this document: the content already exists (every Part 2 card), the mechanic is a timer,
and the payoff is measurable in metrics we already compute.

### 5.5 Realistic session lengths

| Activity | Session | Frequency | First visible change |
|---|---|---|---|
| Shadowing | 10–15 min | 3–4×/week | Prosody at ~3 weeks; fluency at 2–3 months |
| Minimal-pair / HVPT | 5–8 min | 3–5×/week | Perception at 2–4 weeks; production later and smaller |
| 4/3/2 cue-card cycle | 8–10 min (one card) | 2–3×/week | Within the session itself; carry-over over weeks |
| Topic Drill (Q-by-Q coaching) | 10–15 min | 3×/week | 2–3 weeks |
| Full Mock | 15 min + 5 min report | 1×/week max | Weekly benchmark only |
| Quick Chat warm-up | 3–5 min | Before anything scored | Immediate (anxiety) |

Full Mock more than weekly is a trap — it is testing, not practice, and it eats the content bank
(§6). The app should gently discourage back-to-back mocks.

---

## 6. Spaced practice for speaking, and sequencing topics

### 6.1 Spacing

Cepeda et al.'s spacing work gives a usable rule: the **optimal gap before review is roughly 10–30%
of the retention interval** — about 20–40% for a one-week horizon, dropping toward 5–10% for a
one-year horizon. Because IELTS candidates have a *known test date*, we can compute this rather than
guess.

| Test in | Retention interval | Optimal review gap | Practical schedule for one topic |
|---|---|---|---|
| 4 weeks | 28 days | ~3–8 days | Day 0 → Day 3 → Day 9 → Day 20 |
| 8 weeks | 56 days | ~6–15 days | Day 0 → Day 5 → Day 16 → Day 38 |
| 12 weeks | 84 days | ~8–25 days | Day 0 → Day 7 → Day 24 → Day 55 |

A test-date field is therefore not a nice-to-have — it is the input that makes the whole schedule
principled. `docs/plan/10-curriculum-progress.md` should own it.

### 6.2 Repetition type: what to repeat when a topic comes back

The task-repetition literature distinguishes two kinds, and they buy different things:

- **Exact repetition** (same task again) → **fluency**: faster retrieval, fewer pauses.
- **Procedural repetition** (same procedure, new content) → **syntactic complexity** and transfer.

But *massed* exact repetition is explicitly described as a **double-edged sword** — a Cambridge
*SSLA* study found drawbacks for speed fluency and repair fluency when the same task was repeated
back-to-back en masse, and the schedule literature favours **spaced** over massed repetition
schedules.

Translated into a recycling rule for one topic:

| Encounter | Gap | Repetition type | Format | Goal |
|---|---|---|---|---|
| 1 | Day 0 | New | Part 1 questions (Topic Drill) | Concrete, personal, low load |
| 2 | +2–3 days | **Exact** | Same Part 2 cue card, 4/3/2 cycle | Fluency: automatise the content |
| 3 | +7–10 days | **Procedural** | *Different* cue card, same topic domain | Complexity: transfer the moves |
| 4 | +3–4 weeks | Procedural + stretch | Part 3 discussion on the same domain | Abstraction under pressure |

Encounter 2 is exact and encounter 3 is procedural — that ordering matters. Automatise first, then
restructure. Which is exactly what the sequencing model below predicts.

### 6.3 Sequencing concrete → abstract

Robinson's **SSARC** model (Stabilise, Simplify, Automatise, Restructure, Complexify) argues
sequencing should be driven by cognitive demand and should run **simple → complex**. It separates
two dimensions:

- **Resource-dispersing** variables (planning time, single vs. multiple tasks, prior knowledge) —
  these just add load without pushing language development. Relax these first.
- **Resource-directing** variables (number of elements, here-and-now vs. there-and-then, reasoning
  demands) — these *direct* attention to specific language and drive development. Tighten these
  later.

Empirical work on simple→complex sequencing under SSARC reports gains in syntactic complexity,
accuracy, lexical complexity and fluency versus other orderings, for both writing and oral
performance.

The IELTS Speaking test is *already* an SSARC ladder, which is a genuinely useful thing to tell
learners: **Part 1** is here-and-now, personal, few elements, no reasoning demand. **Part 2** is
there-and-then (past, narrative), more elements, with planning time deliberately provided. **Part 3**
is abstract, many elements, high reasoning demand, zero planning time. Teaching this explicitly
("Part 3 feels harder because it *is* harder, in these three specific ways") reframes struggle as
expected rather than as personal failure — which matters for §7.

A **topic-level ladder** for our content, in `difficulty` terms:

1. `core`, Part 1: personal, present tense, concrete nouns (your home, your food, your commute).
2. `core`, Part 2: personal narrative, past tense, one event, with the prep minute (a journey,
   a person, a change near you).
3. `core`, Part 3: local generalisation — "people in your country", still fairly concrete.
4. `stretch`, Part 3: societal abstraction, causation, futures, trade-offs — "what should governments
   prioritise", "how will this change in twenty years".

Content implication: the `difficulty: core | stretch` field already in the schema should be used to
encode *this* ladder, not a vague notion of vocabulary hardness. Add a `cognitive_load` hint in
`payload_json` naming which resource-directing dimension a stretch card pushes (`elements`,
`reasoning`, `there_and_then`) so the scheduler can pick a next card that raises exactly one
dimension.

---

## 7. Motivation and anxiety: the skill learners avoid

### 7.1 What the research says

Foreign-language anxiety produces an explicit avoidance cycle: anxious learners refuse to speak, go
silent, withdraw from speaking activities — and avoidance lowers willingness to communicate, which
raises anxiety further. Speaking is the most anxiety-loaded of the four skills, and a solo desktop
app is competing with the option of doing nothing.

Interventions with support in the literature:

- **Preparation and positive thinking correlate positively with willingness to communicate.** The
  prep minute is not just an exam artefact; preparation is itself anxiolytic.
- **Avoiding immediate correction** is repeatedly listed among anxiety-reducing teacher behaviours —
  which happily coincides with the "never interrupt" rule from §1.2.
- **Scaffolded discussion, mock tasks and guided practice** produced statistically significant gains
  across fluency, confidence, participation and language use in intervention studies.
- **Chatbot-assisted interaction significantly reduced speaking anxiety** and improved fluency —
  with an important caveat: **personalised feedback increased engagement while rigid chatbot
  structures created barriers**. A scripted, inflexible examiner bot can *cause* the problem it is
  meant to solve.
- **Positive self-talk and low-stakes framing** show effects; so does contracting/goal-setting.

On streaks: Duolingo-style mechanics do drive frequency (reported 2.3× daily engagement past a
7-day streak, and churn reductions), but streak *loss* is a documented abandonment trigger, and
gamified minimalism can encourage doing the bare minimum rather than the useful thing.

### 7.2 Design choices that reduce avoidance

1. **A 3-minute unscored warm-up before anything scored.** Quick Chat already exists; make it the
   default landing action and the mandatory precursor to a first-ever Full Mock. Nobody's first
   experience of the app should be a graded exam.
2. **A visible "this is not scored" state.** An explicit, prominent unscored badge on Drill and Chat.
   The presence of a scoring engine makes learners assume everything is being judged.
3. **Never show a band in practice modes.** Kluger & DeNisi: self-level feedback is where the harm
   is. Show behaviours and deltas instead.
4. **Progress by minutes spoken, not bands.** "You have spoken 4h 20m of English in this app" is a
   mastery metric the learner fully controls. Bands are noisy (±1.0 by our own honesty copy) and
   demotivating when they wobble sideways for three weeks.
5. **Forgiving streaks.** Weekly targets ("4 speaking days this week") rather than daily chains, plus
   one automatic freeze per week. Preserve the frequency benefit, remove the cliff.
6. **Retry is one tap and always available.** The single strongest anti-avoidance affordance: knowing
   a bad attempt can be immediately overwritten removes most of the stakes.
7. **Open with a strength.** Every feedback surface leads with one specific thing that worked,
   quoted back verbatim. The coach persona already does this; the report should too.
8. **Difficulty is chosen, not imposed.** Let learners drop from `stretch` to `core` at any moment
   without ceremony. Forced difficulty is an avoidance generator.
9. **Warmth is a feature, not decoration** — but only in coach modes. The examiner persona must stay
   neutral, or Full Mock loses the desensitisation value that makes it worth doing.
10. **No red.** Error highlighting uses a neutral underline, not the colour of failure. (Design-system
    call, but pedagogically motivated.)

---

## 8. Feature wishlist for BandReady's speaking module

Ranked by learner impact ÷ build cost. **Cost**: S ≈ under a day, M ≈ a few days, L ≈ a week+.
"Content" = requires an authoring pass on the pack, which is the point of this whole push.

### Tier 1 — do these first

| # | Feature | Impact | Cost | Depends on |
|---|---|---|---|---|
| 1 | One-Thing Report headline | Very high | S | prompt + report UI |
| 2 | Listen-Back Noticing step | Very high | S–M | existing per-turn audio |
| 3 | Attempt-gated annotated model answers | Very high | M | **content** |
| 4 | Guided prep-minute with note grid | High | M | **content** (prep plans) |
| 5 | 4/3/2 cue-card fluency cycle | High | M | existing metrics |
| 6 | Recovery ladder (live, practice modes) | High | S–M | **content** |
| 7 | Self-rate before reveal | High | S | descriptor rows exist |

**1. One-Thing Report headline.**
*Screen:* The report opens with a single full-width card above the band block: **"This week's one
thing"** — a behaviour-phrased instruction ("Put a time phrase before each past event — you dropped
them in 4 of 6 stories"), one verbatim quote showing the moment it failed, the corrected version,
and two buttons: `▷ Hear it` and `🎙 Say it now`. Everything else — the four criterion accordions,
the 10 errors, the vocab list — sits below the fold, collapsed. Same JSON, different information
architecture.
*Why:* §1.2 rule 1. This is the highest impact-per-line-of-code item in the document.

**2. Listen-Back Noticing step.**
*Screen:* Between `WRAP_UP` and the report (or between answers in Drill), an interstitial: the
learner's own audio with a waveform and their transcript, and the prompt *"Before we score this —
listen once and tap the part you'd change."* Tapping a span opens a two-field mini-form: what's
wrong (free text or a chip from a short list: tense · word choice · article · too short · lost the
thread) and, optionally, how they'd fix it. Then, and only then, the report loads — and the report
explicitly acknowledges the overlap: *"You spotted 2 of the 3 things I found."*
*Why:* Self-transcription is one of the best-evidenced noticing interventions available, and we
already persist per-turn audio and transcripts. The "you spotted N of M" line is also a calibration
signal we can track over time — self-noticing accuracy rising is real progress.

**3. Attempt-gated annotated model answers.**
*Screen:* On any Part 2 card the learner has attempted, a `Compare` tab. Two columns: *Your answer*
(their transcript, their audio) and *One way to say it* (the model). Annotation markers are inline
dots on the model; tapping one opens a small popover with the label and the 20-word why. A
right-hand rail called **Steal this** lists the `transferable` spans as chips, each with an `Add to
bank` button wired to the existing vocab suggestion inbox. A toggle switches the model column to the
**weaker version** with its `differences` list — the contrast pair. At the bottom, the
`transfer_drill` with a 45-second timer and a record button.
*Why:* §2. Locked until an attempt exists — the lock is the pedagogy, not a paywall.

**4. Guided prep-minute with note grid.**
*Screen:* During `P2_PREP`, replace the plain textarea with a 2×2 grid, each cell headed by one cue
bullet, each cell capped at ~40 characters with a visible counter (the cap *is* the "phrases not
sentences" rule, enforced structurally). A segmented ring countdown with two labelled marks: at
0:45 the banner flips from "Pick something — anything you can describe" to "Now note, don't write";
at 0:10 it flips to "Read your grid once, top to bottom". Grid persists on screen through
`P2_LONG_TURN`, greyed but legible. Optional per-card `prep_plan.trap` shown *after* the turn, never
during ("Most people forget the last bullet on this card — you covered it ✓").
*Why:* §3.1. Official guidance, made structural rather than advisory.

**5. 4/3/2 cue-card fluency cycle.**
*Screen:* A drill mode on any Part 2 card: three consecutive takes at 2:00 / 1:30 / 1:00, same card,
no feedback between takes. After take 3, one chart: words per minute, long pauses (≥1.5 s) and
filled pauses across the three takes — three bars each. Headline computed, not LLM-written:
*"Take 3 was 22% faster with half the long pauses. That's automatisation — the same thing that
happens on test day when a topic feels familiar."*
*Why:* §5.4. Content is free (every existing cue card works), metrics already exist per R2-10, and
the within-session improvement is nearly guaranteed — which makes it the best confidence-builder in
the app.

**6. Recovery ladder, live.**
*Screen:* In Single Part / Drill (never Full Mock — fidelity), a silent panel beside the timer
labelled **Stuck? Climb one rung.** appears automatically after 4 seconds of silence past the
0:60 mark. Three of the six moves (§3.3), rendered as this card's `recovery_moves` — concrete, not
generic. No sound, no examiner speech, no scoring penalty. Post-turn, the report notes whether a
rung was used and whether the turn reached 2:00.
*Why:* §3.3. Turns the most common panic moment into a trainable procedure.

**7. Self-rate before reveal.**
*Screen:* Before the band block renders, four sliders (FC / LR / GRA / PRON) with the paraphrased
descriptor row for the currently-selected band shown live underneath each. Submit → the AI bands
appear alongside as ghost markers, with a one-line gap read: *"You under-rate your vocabulary and
over-rate your fluency — that's the most common pattern at your level."* Track calibration gap over
time in the progress module.
*Why:* Rubric-referenced self-assessment improves self-evaluation accuracy and reduces cognitive
load; the gap itself is a coaching object.

### Tier 2 — build after Tier 1 lands

**8. Function chunk trainer.** A drill fed by the §4.3 inventory, targeted by the learner's actual
gaps (report says "your Part 3 answers never concede a point" → three conceding frames queued).
*Screen:* one function at a time; the frame with its slot highlighted; three prompts requiring the
learner to *speak* a filled version about their own life; ASR checks the frame is present and the
slot is non-empty; a "sounds canned" warning if two markers land in one sentence. Items graduate
into the vocab SRS as `phrase` type with `use-in-sentence` / `speaking-drill` exercises only.
*Cost:* M. *Depends on:* content (frames per topic), vocab module.

**9. Spaced topic recycling scheduler.** The §6.2 ladder made real. *Screen:* the speaking home shows
**Due today** — topic name, which encounter number, which format, and why ("Transport, encounter 3 —
new cue card, same domain. You automatised this on 14 July; today we transfer it."). Requires a
test-date field to set the spacing constants (§6.1); without one, fall back to 0/3/10/30 days.
*Cost:* M. *Depends on:* progress module, test-date input.

**10. Shadowing lab.** Sentence-level, seeded from the learner's own `best_moments` and from model
answers. *Screen:* one sentence, a waveform of the reference, a record button, an overlay of the two
pitch/energy contours, and a four-step progression selector (silent → mumble → with text → without
text). 10–15 minutes = roughly 12–15 sentences. Session ends with a prosody-only note, never a band.
*Cost:* M–L. *Depends on:* pronunciation module, TTS timing data.
*Evidence note:* target prosody claims only. Do not claim segmental gains from shadowing.

**11. Multi-talker minimal-pair trainer (HVPT).** *Screen:* hear a word, choose which of two written
minimal-pair options it was, immediate right/wrong, 15 trials, ~5 minutes. **Cycle Kokoro voices
across trials** — talker variability is the active ingredient and for us it is free. Pairs come from
`pron_pairs.jsonl` (already a supported pack file), selected by the learner's L1 profile and by GOP
scores from real sessions. Perception trials first; a production trial every fifth item.
*Cost:* M. *Depends on:* content (`pron_pairs.jsonl` authoring), multi-voice TTS.
*This is the highest evidence-per-build-hour item in the pronunciation space.*

**12. Warm-up gate.** A 3-minute Quick Chat offered (not forced) before every scored session, and
required exactly once — before the learner's first-ever Full Mock. *Screen:* two friendly questions,
a visible "not scored" badge, and a "start the test" button that only lights up after ~90 seconds of
speech. *Cost:* S. *Depends on:* nothing.

**13. Part 1 answer-shape overlay.** *Screen:* during Part 1 Drill, a three-dot indicator beside the
timer that fills as the learner's answer hits: ● direct answer · ● reason · ● one detail. Post-answer
feedback references the shape ("You answered and gave a reason — one concrete detail would have
taken this from 2 to 4 sentences"). *Cost:* S–M. *Depends on:* content (per-question `answer_shape`).

### Tier 3 — worth doing, not urgent

**14. Part 3 stance sparring.** The examiner pushes back once per answer using the card's
`counterpoint`, and the report scores *whether the learner conceded and then held or revised their
position* — the specific Part 3 skill. *Cost:* M. *Content:* counterpoints already in the schema.

**15. Fluency curve per topic.** Words per minute and long-pause rate plotted per topic domain rather
than per session. Shows the learner that "transport" is now automatic while "science" still stalls —
which is a far better study signal than a global band. *Cost:* M.

**16. Forgiving weekly goal.** "4 speaking days this week", one free freeze, minutes-spoken as the
headline number. *Cost:* S.

**17. Notes-vs-speech insight.** Using the logged `note_char_count` (§3.4): flag over-noting when it
correlates with a speech-rate drop. Cheap, novel, and answers open question 2 in the plan doc.
*Cost:* S.

**18. Self-noticing accuracy trend.** From Feature 2: "you now catch 60% of the issues the examiner
catches, up from 25%." This is the metric that proves the app *taught* rather than tested.
*Cost:* S once Feature 2 exists.

### Content-side summary (what the authoring agents must produce)

Per **Part 2** card: `teaching.model_answer` (transcript + 6–10 annotations + swap slots +
contrast pair + transfer drill), `teaching.prep_plan` (idea prompt, 4-cell note grid, one trap),
`teaching.time_plan`, `teaching.recovery_moves` (3–4, card-specific), `teaching.target_language`
(frames the fourth bullet pulls), `teaching.examiner_note`.

Per **Part 1** card: per-question `answer_shape` (direct answer → reason → one detail), one
`extend_move`, one `common_error` typical of this question type.

Per **Part 3** card/theme: `target_functions` from the §4.3 inventory, `frames`, an
`abstraction_ladder` (a concrete → local-general → societal-abstract version of the same question),
plus the existing `counterpoint`.

Per **card set**: `cognitive_load` dimension raised by any `stretch` member, and the existing
`lineage` string extended to say *what the set teaches*, not just what links it.

All of this lives inside `payload_json`, which `SpeakingCardRow`/`CardSetRow` accept as a free dict
(`extra="allow"` on `_Row`), so none of it needs a schema change or a migration.

---

## 9. What I would deliberately *not* build

- **Full-length written model answers presented before the attempt.** Straight path to parroting and
  to the exact behaviour the descriptors refuse to credit.
- **A phrase bank of 100 "band 9 expressions".** This is the single most common product in the IELTS
  space and it is the mechanism by which learners plateau at 6. Three owned frames beat fifty
  borrowed ones (§4.2).
- **Real-time correction during a long turn.** No evidence advantage from immediate over delayed
  feedback, a clear anxiety cost, and it destroys exam fidelity.
- **Segmental claims for shadowing.** The systematic review says inconclusive. Don't market it.
- **Daily-chain streaks with loss.** Frequency benefit is real, the cliff is a documented abandonment
  trigger. Use weekly goals with a freeze.
- **A single global band as the headline progress metric.** ±1.0 noise by our own honesty copy, plus
  it is self-level feedback in the Kluger & DeNisi sense.

---

## 10. Where sources disagree, and how I resolved it

1. **Model answers: use them or ban them?** Coaching sources split — some teaching guides say
   flatly "no memorising, no models", while the reformulation/model-text research shows models are
   effective *as feedback*. **Resolution:** both are right about different placements. Model before
   attempt = script to memorise. Model after attempt, side by side, annotated = reformulation
   feedback with good evidence. We gate on the attempt.
2. **Feedback timing.** Genuinely unsettled: hybrid-CF studies favour immediate, retrieval-practice
   studies favour delayed, a 2025 FIT-framed study finds both beat nothing and neither beats the
   other. **Resolution:** since the learning evidence is a wash, decide on affect and fidelity —
   never interrupt, always feed back at a seam.
3. **Task repetition.** Beneficial for fluency, but massed repetition is described as a
   double-edged sword with drawbacks for speed and repair fluency. **Resolution:** 4/3/2 is massed
   *within* a session (that's the whole mechanic and it's well attested), but topic recycling across
   sessions must be spaced, and the *second* return switches to procedural repetition.
4. **Shadowing.** Individual studies report large pronunciation gains; the 2025 systematic review
   restricts confident claims to prosody. **Resolution:** trust the review. Prosody and fluency only.
5. **Prompts vs. recasts.** Prompts win on uptake and self-repair; but our coach persona's
   "model the corrected sentence out loud" is a recast, and recasts remain the most common teacher
   move for a reason (they're gentle, and gentleness matters for anxious learners, §7).
   **Resolution:** prompt first, recast second — one elicitation attempt, then supply.
6. **Official vs. coaching sources on the prep minute.** Official IELTS guidance gives principles
   (English, phrases, in speaking order, ask about unknown words early); the 10–15 s / 45 s split and
   the four-cell grid come from coaching practice, where several independent providers converge.
   **Resolution:** treat the official principles as rules and the timings as a defensible default we
   present as a suggestion, not as an official requirement. Our copy should not imply otherwise.

---

## SOURCES

**Official / test-partner (highest weight)**
- IELTS — *How to use the preparation time in IELTS Speaking Part 2*: https://ielts.org/news-and-insights/how-to-use-the-preparation-time-in-ielts-speaking-part-2
- IDP IELTS — *Understanding the IELTS Speaking band descriptors*: https://ielts.idp.com/prepare/article-understanding-the-ielts-speaking-band-descriptors
- IDP IELTS — *How to perform at your best in the Part 2 long turn*: https://ielts.idp.com/prepare/article-ielts-speaking-test-long-turn-part-2
- IDP IELTS — *How to perform at your best in the Part 3 discussion*: https://ielts.idp.com/prepare/article-ielts-speaking-test-part-3
- IDP IELTS — *Speaking Part 2: how to speak confidently for 2 minutes*: https://ielts.idp.com/cyprus/news-and-articles/article-ielts-speaking-part-2-how-to-speak-confidently-for-2-minutes
- IDP IELTS — *10 tips for IELTS Speaking*: https://ielts.idp.com/prepare/article-10-tips-ielts-speaking
- British Council — *Speaking band descriptors (public version)*: https://takeielts.britishcouncil.org/sites/default/files/ielts_speaking_band_descriptors.pdf
- British Council — *IELTS assessment guide*: https://takeielts.britishcouncil.org/teach-ielts/test-information/assessment
- Cambridge English — *IELTS Speaking band descriptors (public version)*: https://assets.cambridgeenglish.org/webinars/ielts-speaking-band-descriptors.pdf

**Feedback, corrective feedback, noticing**
- Li, S. (2010). *The effectiveness of corrective feedback in SLA: a meta-analysis*, Language Learning 60: https://www.researchgate.net/publication/229940242_The_Effectiveness_of_Corrective_Feedback_in_SLA_A_Meta-Analysis
- Lyster & Saito — *Oral feedback in classroom SLA*, SSLA: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/oral-feedback-in-classroom-sla/4999EE1C8379B2BF026B148EAF373CA1
- Lyster & Ranta / Ammar & Spada — *Prompts versus recasts in dyadic interaction*: https://escholarship.mcgill.ca/downloads/2j62s874g
- *The comparative effectiveness of recasts and prompts in second language classrooms*: https://www.repository.cam.ac.uk/bitstreams/d59d993c-128b-46f3-b4d7-e4d752ad25a5/download
- *Oral corrective feedback and learner uptake* (2025 classroom corpus): https://www.tandfonline.com/doi/full/10.1080/19463014.2025.2474233
- Kluger & DeNisi (1996). *The effects of feedback interventions on performance*, Psychological Bulletin 119: https://mrbartonmaths.com/resourcesnew/8.%20Research/Marking%20and%20Feedback/The%20effects%20of%20feedback%20interventions.pdf
- *The timing of corrective feedback in second language learning*, Language Teaching: https://www.cambridge.org/core/journals/language-teaching/article/timing-of-corrective-feedback-in-second-language-learning/0E8856852D0183E9DD91EDB4C249E245
- *Optimal timing of treatment for errors in L2 learning — a systematic review of CF timing*: https://pmc.ncbi.nlm.nih.gov/articles/PMC9995700/
- *Immediate vs. delayed feedback timing on motivation and language learning outcomes* (Feedback Intervention Theory, 2025): https://www.sciencedirect.com/science/article/abs/pii/S0023969025000396
- *Timing of feedback and retrieval practice: a laboratory study with EFL students*, Humanities & Social Sciences Communications: https://www.nature.com/articles/s41599-024-03983-6

**Models, reformulation, self-transcription, self-assessment**
- Adams, R. (2003). *L2 output, reformulation and noticing*: https://journals.sagepub.com/doi/10.1191/1362168803LR127OA
- Yang & Zhang (2010). *Reformulations and a model text in EFL students' writing performance*: https://journals.sagepub.com/doi/10.1177/1362168810375369
- *Using model texts as a type of feedback in EFL writing*, Frontiers in Psychology (2023): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1156553/full
- Lynch — *Students transcribing tasks: noticing fluency, accuracy, and complexity*, ELT Journal 64/4: https://academic.oup.com/eltj/article-abstract/64/4/445/388060
- *Developing the metacognitive skill of noticing the gap through self-transcribing*: https://revistas.udistrital.edu.co/index.php/calj/article/view/4989
- *Rubrics enhance accuracy and reduce cognitive load in self-assessment*, Metacognition and Learning (2022): https://link.springer.com/article/10.1007/s11409-022-09302-1
- *How do students self-assess? Examining the metacognitive processes of student self-assessment* (2025): https://link.springer.com/article/10.1007/s11409-025-09430-4

**Formulaic language**
- *Can explicit instruction of formulaic sequences enhance L2 oral fluency?*, System: https://www.sciencedirect.com/science/article/abs/pii/S0024384121000449
- *Intermediate EFL learners' formulaic language speaking proficiency: where does the teaching of lexical chunks figure?*, Frontiers in Psychology (2022): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.949675/full
- Yan (2020). *Unpacking the relationship between formulaic sequences and speech fluency*, TESOL Quarterly: https://onlinelibrary.wiley.com/doi/10.1002/tesq.556
- Oberg — *Formulaic sequences for improving oral fluency*: https://minds.wisconsin.edu/bitstream/handle/1793/65364/KristopherOberg.pdf

**Pronunciation and fluency training**
- *A systematic review of research on the use of shadowing for second language pronunciation teaching* (2025): https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827
- *High variability phonetic training (HVPT): a meta-analysis of L2 perceptual training studies*, SSLA: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6
- *Does perceptual HVPT improve L2 speech production? A meta-analysis of the perception–production connection*, Applied Psycholinguistics: https://www.cambridge.org/core/journals/applied-psycholinguistics/article/does-perceptual-high-variability-phonetic-training-improve-l2-speech-production-a-metaanalysis-of-perceptionproduction-connection/E38D8F5CE65DC708137B0E95F97C6BC7
- Thomson — *High Variability Pronunciation Training (HVPT): a proven technique…*, JSLP: https://benjamins.com/catalog/jslp.17038.tho
- *Effects of practice variability on second-language speech production training*: https://pmc.ncbi.nlm.nih.gov/articles/PMC8050114/
- *The effectiveness of automatic speech recognition in ESL/EFL pronunciation: a meta-analysis*, ReCALL: https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D
- *A systematic literature review of research on ASR in EFL pronunciation* (2025): https://www.tandfonline.com/doi/full/10.1080/2331186X.2025.2466288
- *Improving speaking fluency through the 4/3/2 technique and self-assessment*, TESL-EJ 26/2: https://tesl-ej.org/wordpress/issues/volume26/ej102/ej102a1/
- *Fluency development through repetition: 4/3/2 versus 3/3/3*, VUB research portal: https://researchportal.vub.be/en/publications/fluency-development-through-repetition-432-versus-333/
- NZ Ministry of Education ESOL Online — *4-3-2 speaking strategy*: https://esolonline.tki.org.nz/ESOL-Online/Planning-for-my-students-needs/Resources-for-planning/ESOL-teaching-strategies/Oral-Language/Speaking-strategies/4-3-2

**Repetition, spacing, task sequencing**
- *Massed task repetition is a double-edged sword for fluency development*, SSLA: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/massed-task-repetition-is-a-doubleedged-sword-for-fluency-development/D28EDD7E3D0FA15630165538D706E80F
- *The role of task repetition in L2 performance development: what needs to be repeated?*, System: https://www.sciencedirect.com/science/article/abs/pii/S0346251X13001140
- *The effects of task repetition schedules on L2 fluency enhancement*, Languages 8(4): https://www.mdpi.com/2226-471X/8/4/252
- Cepeda, Vul, Rohrer, Wixted & Pashler (2008). *Spacing effects in learning: a temporal ridgeline of optimal retention*, Psychological Science: https://journals.sagepub.com/doi/abs/10.1111/j.1467-9280.2008.02209.x
- *The effects of distributed practice on second language fluency development*, SSLA: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/effects-of-distributed-practice-on-second-language-fluency-development/4F6787916C198376CAD222934D3B37E4
- Robinson — *The Cognition Hypothesis, the Triadic Componential Framework and the SSARC model*, Cambridge Handbook of TBLT: https://www.cambridge.org/core/books/abs/cambridge-handbook-of-taskbased-language-teaching/cognition-hypothesis-the-triadic-componential-framework-and-the-ssarc-model/053ED33294C6DCFFD9AFDE6E663BD383
- Malicka (2020). *The role of task sequencing in fluency, accuracy, and complexity: investigating the SSARC model*: https://journals.sagepub.com/doi/abs/10.1177/1362168818813668
- *Exploring the effects of task sequencing on L2 oral performance from the perspective of the SSARC model*, System (2025): https://www.sciencedirect.com/science/article/abs/pii/S0346251X25001873

**Anxiety, willingness to communicate, motivation**
- *Exploring foreign language anxiety in higher education: causes, impacts, coping strategies* (2025): https://www.sciencedirect.com/science/article/pii/S2590291125000919
- *Reducing anxiety in the foreign language classroom: a positive psychology approach*, System: https://www.sciencedirect.com/science/article/abs/pii/S0346251X21001585
- *Foreign language speaking anxiety online: mitigating strategies and speaking practices*, ReCALL: https://www.cambridge.org/core/journals/recall/article/foreign-language-speaking-anxiety-online-mitigating-strategies-and-speaking-practices/C797CBC137CB31D0C346533938B7BA37
- *The role of EFL learners' grit and foreign language anxiety in their willingness to communicate*: https://pmc.ncbi.nlm.nih.gov/articles/PMC9516278/
- *Helping students overcome foreign language speaking anxiety*, ERIC EJ1065743: https://files.eric.ed.gov/fulltext/EJ1065743.pdf
- *Contracting students for the reduction of foreign language classroom anxiety*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7381164/
- *How Duolingo's gamification mechanics drive customer loyalty* (industry data on streaks): https://www.openloyalty.io/insider/how-duolingos-gamification-mechanics-drive-customer-loyalty
- *Risks and opportunities of gamification in language learning*: https://promova.com/blog/gamified-language-learning-apps

**Coaching practice (technique only — no wording reused)**
- Keith Speaking Academy — Part 2 techniques: https://keithspeakingacademy.com/ielts-speaking-part-2-tips-resources-techniques/
- Keith Speaking Academy — Part 3 tips: https://keithspeakingacademy.com/ielts-speaking-part-3-tips/
- IELTS Podcast — making notes on cue cards: https://www.ieltspodcast.com/ielts-speaking/making-notes-on-cue-cards/
- My IELTS Classroom — never running out of things to say in Part 2: https://blog.myieltsclassroom.com/never-run-out-of-things-to-say-in-speaking-part-2/
- E2Language — Part 2 strategy: https://blog.e2language.com/ielts-speaking-part-2-topics-and-practice/
- EFL Magazine — *How to teach IELTS speaking* (the "no model answers" position): https://eflmagazine.com/how-to-teach-ielts-speaking/
- IELTS Answers — memorised phrases in the IELTS exam: https://www.ieltsanswers.com/memorised-phrases-ielts-exam.html
