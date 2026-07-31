# GV-R3 — Acquisition Science: how vocabulary and grammar actually stick

**Briefing for the BandReady Grammar & Usage module and the vocabulary deepening work.**
Audience: the design agent who writes the module DESIGN.md, the content agents who author items,
and the verify agent who wires the schema. This document decides the **learning algorithm** — the
owner asked for one explicitly ("a proper ALGORITHM for how that is achieved"), and §9 is that
algorithm, specified concretely enough to implement against the existing
`sidecar/bandready/srs/` code.

Everything below is evidence-led. Where the evidence is contested I say so rather than picking the
tidier answer — §10 lists the places we are guessing.

---

## 0. The three findings that should drive every design decision

If the rest of this document is ignored, these three survive:

1. **Retrieval count in varied context beats depth of any single encounter.** Folse (2006) put
   three cheap fill-in-the-blank retrievals against one deep original-sentence-writing task on the
   same words with the same learners, and the three cheap retrievals won decisively. More
   retrievals, more contexts, more days — not longer exercises.
2. **Recognition does not become production on its own.** Receptive knowledge grows faster than
   productive knowledge, and *not all receptively known words ever become productive*. The
   crossing only happens when the learner is pushed to produce. A module made of flip cards and
   multiple choice will produce learners who understand grammar and cannot write it.
3. **For grammar specifically, explicit instruction wins.** Every large meta-analysis of the last
   25 years — Norris & Ortega (2000), Spada & Tomita (2010), Goo et al. (2015) — finds explicit
   treatments outperform implicit ones, for simple *and* complex features, with Spada & Tomita
   reporting d ≈ 0.73 for explicit instruction on simple forms. The owner's "someone with zero
   knowledge should be able to follow all of it" is not in tension with the research; it *is* the
   research. State the rule. Then make them use it.

---

## 1. How many exposures a word needs

### 1.1 The honest range

There is no single number, and any source giving you one is selling something. Across the
literature the threshold for "substantial gains" from **incidental** encounters runs roughly
**8–20 encounters**, varying by what you measure:

| What you're measuring | Encounters typically needed |
|---|---|
| Form recognition ("I've seen this word") | 2–6 |
| Meaning recognition (pick the right definition) | ~8–14 |
| Meaning **recall** (produce the meaning unprompted) | 10–18 |
| **Productive use** (use it correctly in your own sentence) | ~18+, and often never without explicit output practice |

Anchor points worth citing:

- **Webb (2007)** ran the cleanest controlled study: 1, 3, 7 and 10 encounters of nonsense words
  substituted into authentic text, measured across ten tests covering orthography, association,
  grammatical function, syntax, and form–meaning link. Every increase in repetitions produced gains
  in at least one aspect of knowledge. But even at ten encounters, **meaning recall was only 29%**.
  Ten encounters in context is not "learned" — it is a decent start on a *partially* known word.
- **Reviews converging on ~10** as the realistic target for triggering incidental acquisition in an
  informative context; L1 studies put the minimum near 10, L2 studies find measurable growth from 2
  and stronger effects from 6–8.
- The often-quoted figures of **~14 for recognition and ~18 for productive use** sit at the upper
  end and are the right numbers to plan against if you are relying on incidental exposure alone.
- The full spread reported in the literature for *some* aspect of word knowledge is **3–17**
  encounters, which tells you the variance is mostly about measurement, not about learners.

**Design consequence.** BandReady is not going to deliver 18 incidental encounters of 343+ words
through reading passages. It doesn't have the text volume, and neither does any app. So we do not
plan on incidental exposure as the main channel. We plan on **deliberate retrieval**, which is far
more efficient per encounter, and use the skills modules as the *incidental* top-up. See §1.3.

### 1.2 Why context beats a definition on a card

Three separate reasons, and they compound:

1. **A definition teaches one thing; a context teaches five.** Webb's ten-test design is the
   evidence: contextual encounters produce gains in grammatical function, syntactic behaviour,
   associations and collocation *at the same time* as the form–meaning link. A definition card
   teaches the form–meaning link and nothing else. A learner who knows `biodegradable = decays
   naturally` still does not know it is an adjective that sits attributively before `packaging`,
   `materials`, `waste` and almost never before `person`.
2. **Context supplies the retrieval cues the exam will supply.** Memory is cue-dependent. If the
   only cue ever paired with the word is the L1 gloss or an English definition, that is the only
   route into it. In a Task 2 essay nobody presents the definition — the cue is a *situation*.
   Practice must encode situation→word, because that is the direction the exam runs.
3. **Context is what makes the word usable rather than merely known.** Learners who meet a word
   only as a gloss reliably produce it in grammatically or collocationally impossible frames.
   Neglecting collocation "can lead to the misconception that words can be learned in isolation and
   used interchangeably with equivalent words from the first language" — this is the standard
   diagnosis of the advanced learner who is intelligible but obviously non-native.

### 1.3 But: deliberate word-card study is not the enemy

An important corrective, because a naive reading of the above leads to "throw away the flip cards".
**Elgort (2011)** taught pseudowords by deliberate word-card study and then probed them with masked
repetition priming, form priming and automatic semantic priming — the measures that detect *implicit*
lexical representation. She found prime lexicality, repetition priming and semantic priming effects
for the deliberately learned items, i.e. the deliberately learned words had been integrated into the
mental lexicon and were being accessed fluently and automatically, not merely memorised as facts.
Her conclusion: intentional word-card learning is a **very efficient** means of acquiring L2 words.

So the correct position is not "context instead of cards". It is: **cards, but the card is a
sentence.** Deliberate, scheduled, retrieval-based study gets the item into the lexicon fast; context
is what makes the resulting knowledge shaped correctly. BandReady already has the scheduler — the
gap the owner identified is exactly that the *item* needs to become sentence-shaped.

**Working target for BandReady: 8–12 successful deliberate retrievals per item, spread over ≥4
separate days and ≥3 distinct sentence contexts, before the item is treated as stable.** That is a
smaller number than the incidental-exposure literature because each deliberate retrieval is worth
several incidental encounters, and because retrievals in our system are always in context.

---

## 2. Receptive vs productive knowledge

### 2.1 The gap is real, large, and does not close by itself

Productive vocabulary is consistently smaller than receptive, receptive vocabulary grows faster, and
the gap only narrows as overall proficiency rises. The crucial finding for us: **not all words known
receptively ever become productive.** There is no automatic promotion. An item can sit at "I know
this when I read it" indefinitely, and a scheduler that only ever asks recognition questions will
happily keep it there while reporting green.

The same holds for multi-word items — Lee (2025) finds the receptive/productive split reproduces for
**collocations**, which matters because half our value proposition is phrase-level.

### 2.2 What moves an item across the line

The evidence points at one thing: **being pushed to produce it.**

- Intensive practice in *using* vocabulary in speech and writing is what produces productive
  learning; productive tasks beat receptive tasks regardless of repetition frequency (Teng & Xu,
  2022/2025).
- **Swain's output hypothesis** supplies the mechanism: in trying to produce, learners "notice a
  gap" between what they want to say and what they can actually say. That noticing is what makes
  the subsequent input useful. Russell (2014) showed pushed output *followed by* exposure to the
  target form in input produced inductive learning of the Spanish future — the order matters:
  **attempt first, model second.** BandReady's Coach UI already gates answers behind a real attempt.
  That gating is not a UX nicety; it is the acquisition mechanism, and Grammar must inherit it.
- **Schmidt's noticing hypothesis** is the input-side counterpart: forms present in input are
  acquired when consciously noticed. Learners with higher levels of awareness learn most. This is
  the argument for explicit rule statements and for highlighting the target form in worked examples.

### 2.3 How practice should differ for each

| | Receptive practice | Productive practice |
|---|---|---|
| Question shape | Recognise, match, judge, choose | Generate, transform, complete, say |
| Cue direction | form → meaning | meaning/situation → form |
| Cost per item | seconds | tens of seconds to minutes |
| Failure mode if used alone | "understands everything, writes badly" | overload, avoidance, guessing |
| Right time in the item's life | early, and as maintenance | from mid-life onward, always as the last thing in a session |
| Grading | deterministic | rubric + LLM, with a deterministic pre-check |

Both are needed. The Nation **four strands** framework is the standard way to keep the balance
honest: a course should split roughly 25% each between meaning-focused *input*, meaning-focused
*output*, **language-focused learning** (deliberate study of items and rules — this is what SRS is),
and **fluency development** (no new material, speed only). Language-focused learning **should not
exceed 25%** of total time. BandReady's four skills modules already carry the input and output
strands; Grammar & Vocabulary is the language-focused strand plus, if we build it, the fluency
strand. That is the argument for keeping SRS sessions short and always ending them in production.

### 2.4 One warning about "deeper is better"

The **Involvement Load Hypothesis** (Hulstijn & Laufer, 2001), built on Craik & Lockhart's depth of
processing, says retention scales with the *need*, *search* and *evaluation* a task imposes. It is
widely supported and it is the standard justification for elaborate production tasks.

But it is not the whole story, and two findings cut against a naive application:

- **Folse (2006)**, above: three shallow retrievals beat one deep sentence-writing task. Folse's
  interpretation — *retrieval frequency mattered more than processing depth*.
- **Barcroft's TOPRA model**: processing resources are finite, so increasing semantic processing can
  *decrease* learning of word **form**. Sentence writing has repeatedly shown significant negative
  effects on form learning when the word form is not yet secure (Wong & Pyun found strong negative
  effects for sentence writing on cued recall in L2 French and Korean).

**Consequence, and this is a real design rule:** do not put heavy meaning-work on an item whose form
is not yet secure. Early stages must be formally focused and cheap. Deep production comes *after*
the form is stable, not as the way to make it stable. This directly shapes the stage ladder in §9.

---

## 3. Spacing and retrieval — and exactly what FSRS does and does not do

### 3.1 The testing effect is the single largest lever we have

Karpicke & Roediger's foreign-language vocabulary experiments are the cleanest demonstration in the
literature. Items were studied to a first correct recall, then either **restudied** further or
**retested** further. One week later: **~80% recall for the extra-testing condition vs ~36% for the
extra-restudy condition.** Repeated studying after learning had essentially no effect on delayed
recall; repeated testing had a large one. Roediger & Karpicke's prose analogue: 61% retained after a
week with retrieval practice vs 40% with rereading.

Two riders that matter for UI design:

- **Learners cannot feel this.** In the same experiments the re-readers *predicted the best*
  performance and delivered the worst — fluency of recognition is mistaken for durability of recall.
  So we must not let the learner's subjective sense of ease drive the schedule. Concretely: a
  self-rated "easy" on a recognition item is weak evidence and should be discounted.
- **Recall > recognition, but not universally.** Production tasks generally give a bigger testing
  benefit than recognition tasks (Butler & Roediger 2007; Greving & Richter 2018), though some
  studies find no difference (Little et al. 2012; Smith & Karpicke 2014). The safe reading: recall
  is at least as good and usually better, and it is the format the exam uses, so prefer it once the
  item can support it.

### 3.2 Spacing

- **Cepeda et al. (2006)** — 839 assessments, 317 experiments — established the joint dependence:
  the optimal inter-study interval grows with the retention interval. Their headline ratio is
  **~10–20% of the target retention interval for delays of a few weeks, dropping to ~5% at one
  year.** For an exam eight weeks out, that puts optimal gaps around **4–10 days** for material you
  need on test day. Useful sanity check on whatever FSRS produces.
- **Expanding vs equal intervals: the effect is small.** Nakata (2015), 128 learners, 20 word pairs,
  manipulating both spacing type and spacing amount, found a statistically significant but *limited*
  advantage for expanding spacing, and explicitly cautioned that the effect sizes were small enough
  that the difference "may not be large enough to be meaningful for learners, teachers, and
  materials developers." **Do not spend engineering effort here.** The amount of spacing matters far
  more than its shape.
- **Spacing helps explicit knowledge more than tacit knowledge.** Nakata & Elgort (2021) found
  spacing facilitated acquisition of explicit but not tacit vocabulary knowledge. So spacing is
  necessary but is not by itself the thing that builds automatic use — §8.

### 3.3 Desired retention

Common practice and the FSRS community converge on **85–90%** target success as the efficient band:
below ~80% items decay before they consolidate; above ~95% you pay a large review cost for little
gain. This is consistent with Bjork's **desirable difficulties** framing — retrieval should be
effortful but usually successful. `DEFAULT_RETENTION = 0.9` in
`sidecar/bandready/srs/scheduler.py` sits at the top of that band and is a defensible default for
vocabulary. For grammar **choice** items I would argue for 0.85 (they are harder, more expensive per
review, and the cost of an occasional miss is low) — but flag this as a judgement call, not a
finding.

### 3.4 What FSRS gives us, and what it does not

FSRS models memory with three variables: **Difficulty** (inherent complexity of the item),
**Stability** (days for retrievability to fall from 100% to 90%) and **Retrievability** (probability
of recall right now). Parameters are fit to the individual's own review history. It is a genuinely
good scheduler and it is already wired into BandReady with `state/stability/difficulty/due_at/
reps/lapses`, ratings 1–4, `retrievability()`, `preview_intervals()` and per-day new/review caps.

**What FSRS does:**

- decides **when** an item should next be shown;
- estimates how well an item is currently held;
- adapts intervals to this learner's forgetting curve;
- gives us `stability` as a usable maturity signal (already exploited via `YOUNG_STABILITY_DAYS`).

**What FSRS categorically does not do — and this is the gap the algorithm in §9 fills:**

1. **It does not decide what a good review item is.** FSRS sees a rating, 1–4. It has no opinion on
   whether the question was "translate this word", "fill this gap", or "write a Task 2 sentence
   using this structure". A learner can max out stability on flip cards and be unable to produce a
   single one of those words. *Stability is not mastery.*
2. **It does not decide what enters the system**, or whether the learner ever understood the item in
   the first place. FSRS's first interval assumes the item was learned at introduction. If it
   wasn't, FSRS schedules a confusion very efficiently.
3. **It does not choose the sentence.** Which context, whether the context is diagnostic, whether it
   has been seen before — all outside the model. Reusing one sentence forever produces a learner who
   has memorised a sentence.
4. **It does not know about confusable siblings.** Present perfect and past simple are independent
   cards to FSRS. It will cheerfully schedule all the present perfect items in one session, which
   destroys the discrimination the learner actually needs (§6.4).
5. **It does not decide what a "pass" means.** For a rubric-graded production task, someone has to
   map a rubric outcome onto ratings 1–4. That mapping is a design decision with real consequences
   and it is ours.
6. **It does not model transfer to real use.** An item can be perfectly scheduled and still never
   appear in the learner's own writing.

So: **FSRS is the *when*. Everything else — the *what*, the *which sentence*, the *what counts*, the
*what happens next* — is the BandReady learning algorithm.** Keep that separation explicit in the
code: a `mastery_stage` field that the scheduler never touches, advanced only by evidence.

---

## 4. Formulaic language and chunks

### 4.1 How much of language is prefabricated

**Erman & Warren (2000)**, hand-analysing 19 extracts, estimated that "prefabs" constitute **58.6%
of spoken English and 52.3% of written English.** Other methodologies give figures from 17–30% up to
80%; the cautious consensus is **one third to one half** of running text. Corpus work on academic
prose puts multiword units around half, with some counts as high as 70%.

Whatever the exact figure, the implication is unavoidable: **a learner who assembles every sentence
word-by-word from grammar plus a dictionary is doing something native speakers do for a minority of
what they say.**

### 4.2 Why fluent users store chunks

Retrieving a stored multi-word unit costs one lookup; assembling it costs a lookup per word plus the
grammatical operations to join them. Under time pressure — a 40-second Part 3 answer, a 40-minute
Task 2 — that difference is the whole game. The shift from word-by-word production to chunk-based
retrieval is what reduces processing demand and produces fluent speech.

### 4.3 The evidence it can be taught and that it pays

**Boers et al. (2006)** is the study to cite. 32 English-major students, 22 teaching hours of
authentic listening and reading; the experimental group (n=17) was taught to *notice* standardised
word combinations, the control (n=15) kept the traditional grammar/lexis split. Two blind judges
rated the experimental group as **more orally proficient**. Two further blind judges counted
formulaic sequences in the interviews, and those counts **correlated with the proficiency ratings**.

That is close to a direct demonstration that phrase-level knowledge drives perceived proficiency —
which is what an IELTS-style examiner is measuring under "lexical resource".

Elgort's later work ("Multiword Units at the Interface") extends the deliberate-learning finding to
multiword units: chunks learned deliberately produce implicit knowledge gains too. So chunks are not
only worth teaching — they respond to exactly the SRS machinery we already have.

### 4.4 What this means for BandReady

- **A "vocabulary item" should not mean "a word."** The unit of learning is whatever is stored as a
  unit: single words, phrasal verbs, collocations, semi-fixed frames (`there is a widespread
  perception that ___`), discourse markers (`that said`, `by the same token`), and grammar-adjacent
  formulae (`had it not been for`, `no sooner had X than Y`). The existing `pos: "phrase"` on
  entries like `carbon footprint` shows the schema already tolerates this; the bank needs to lean
  into it hard.
- **Chunks are the bridge between the vocabulary module and the grammar module.** `If I were you,
  I'd ___` is simultaneously a second-conditional exemplar and a memorisable chunk. Teach it both
  ways: as a chunk you can deploy today, and as an instance of a pattern you'll generalise later.
  This is how a zero-knowledge learner gets something usable on day one without waiting for the
  grammar sequence to reach conditionals.
- **Target a share of the bank, not a token gesture.** If half of natural text is formulaic, a
  vocabulary bank that is 90% single words is misrepresenting the language. Aim for **≥40% of new
  entries to be multi-word units**, weighted toward the semi-fixed frames that carry essay and
  interview functions (contrast, concession, hedging, exemplification, cause).

---

## 5. Collocation: why a word without its partners is half-learned

### 5.1 The problem

Collocational knowledge is a strong index of L2 proficiency and one of the last things to develop.
Advanced learners' collocation errors are the classic residual error: `do a mistake`, `strong
rain`, `make a research`. Each of these is a word that was learned as a gloss and then combined
by analogy with L1. Corpus studies of learner writing find collocation errors persist well past the
point where grammatical accuracy is good.

Two structural reasons a gloss is insufficient:

1. **Collocation is arbitrary and not derivable from meaning.** Nothing about the meaning of
   `heavy` predicts `heavy rain` but not `heavy wind`. It cannot be inferred; it must be met.
2. **Collocation is what an examiner hears.** "Natural and appropriate" word choice — the phrasing
   that separates upper bands from mid bands in lexical-resource judgements — is largely
   collocational.

### 5.2 How to teach it

- **Teach the node with its partners from the first encounter.** The existing schema is already
  right here: `collocations: ["biodegradable packaging", "biodegradable materials", "biodegradable
  waste"]`. The gap is in *practice*: the `collocation` exercise kind exists but is currently only
  reachable at some stages. Make collocation a first-class recurring exercise, not a garnish.
- **Practise the partner as the blank, not just the node.** `Supermarkets now use biodegradable
  ______` (three answers accepted) is a different and more useful retrieval than blanking
  `biodegradable`. It trains the direction production runs in.
- **Teach the wrong partner explicitly.** Learners need `heavy rain ✓ / strong rain ✗` as a
  discrimination, not just `heavy rain ✓` as a fact. Prompts and contrasts beat exposure alone
  (§7).
- **Incidental acquisition of collocations from input is slower than for single words** (Majuddin
  et al.; SSLA work on collocation learning from lecture viewing). Another reason not to rely on
  input volume: collocations *especially* need deliberate treatment.
- **Corpus-informed selection.** Choose partners by actual frequency in academic/spoken English, not
  by what sounds nice to the author. Pick 3–5 per node; more is unusable.

---

## 6. Grammar specifically

### 6.1 Does explicit rule teaching help? Yes, clearly.

This was genuinely contested in the 1980s and is not any more. Three large meta-analyses —
**Norris & Ortega (2000)**, **Spada & Tomita (2010)**, **Goo et al. (2015)** — all find explicit
instruction outperforms implicit. Spada & Tomita, working over 41 studies coding features as simple
or complex, report **d = 0.73 (95% CI [0.58, 0.88]) for explicit instruction on simple forms**, and
found explicit treatments produced larger effects for **both** simple and complex features,
including on measures of spontaneous use — not just on controlled tests, which is the objection you
would expect and it doesn't hold.

**This licenses the module's whole shape.** State the rule in plain language. Do not hide it behind
discovery for its own sake. The owner's bar — zero-knowledge learner can follow all of it — is the
evidence-based design, not a compromise with it.

Nuance worth keeping: explicit knowledge is the *starting* point, not the endpoint. In DeKeyser's
skill-acquisition framing, explicit knowledge is what gets proceduralised. So the rule statement is
step one of five, not the deliverable.

### 6.2 Noticing and structured input

**Processing Instruction** (VanPatten) is the strongest evidence-based technique for the *input*
side. Learners are given "structured input" — input manipulated so that they cannot get the meaning
without attending to the target form — which pushes them off the default processing strategies that
make them skip grammatical morphology. Meta-analysis over 42 experiments in 33 studies finds PI more
effective than production-based instruction **for receptive knowledge**, while production-based
instruction is **just as effective as PI for productive knowledge**.

Read that carefully, because it is the key finding for us: **structured input builds understanding;
production practice builds production. Neither substitutes for the other.** A module built only on
structured input produces learners who parse conditionals correctly and cannot write one.

Practical structured-input item, and note what makes it structured: the learner cannot answer by
grammar-spotting, only by working out the meaning.

> Which happened first? — *By the time the results were published, the company had already closed.*
> (a) the results were published (b) the company closed

**Dictogloss** is the other well-supported noticing technique and it is buildable here: play or show
a short text, learner reconstructs it from notes, then compares their version against the original
and notices where the forms differ. It forces simultaneous attention to form and meaning and is
specifically documented as promoting syntactic processing and grammatical improvement. BandReady has
Kokoro TTS locally — a dictogloss exercise kind is cheap to build and is one of the few activities
that trains *noticing your own gap* directly, which is Swain's mechanism.

### 6.3 Order of acquisition — and whether teaching can change it

This is the most misused finding in the field, so state it precisely.

- There is a robust, replicated **order of acquisition** for English grammatical morphemes.
  **Goldschneider & DeKeyser (2001)** pooled oral production data from 12 studies, 924 subjects,
  25 years, and showed that a very large portion of the variance in that order is explained by five
  determinants: **perceptual salience, semantic complexity, morphophonological regularity, syntactic
  category, and frequency.** The order is not mystical — it falls out of how noticeable, how
  meaning-bearing, how regular and how frequent each form is. `-ing` is early because it is salient,
  regular and frequent; third-person `-s` is late because it is a tiny, redundant, unstressed
  suffix.
- **Pienemann's Processability Theory / Teachability Hypothesis** says the *syntactic* developmental
  sequence is constrained by processing procedures that build on each other, and therefore
  "there is no way to leave out a stage of the developmental sequence by means of formal teaching."
  Instruction cannot make a learner skip a stage; instruction is most effective when aimed at the
  stage the learner is approaching.

**What this does and does not mean for our sequencing:**

- It does **not** mean teaching is pointless or that we should abandon a curriculum. The same
  literature shows instruction speeds progress *through* the stages and raises the eventual level.
- It does mean **the sequence must be a real prerequisite graph, not an arbitrary syllabus order.**
  A zero-knowledge learner cannot practise the third conditional before they can build a past
  perfect; cannot handle reported speech before they can shift tenses; cannot use the passive
  meaningfully before they control auxiliary + participle. This is exactly the "nothing depends on
  something not yet taught" constraint in the task brief, and Processability Theory is its
  justification.
- It also means **be sceptical of items that instruction historically fails to move**, third-person
  `-s` being the canonical example. Goldschneider & DeKeyser's determinants tell us *why* it is
  hard (low salience, redundant, unstressed) and therefore what to do: raise salience artificially
  (highlight it, make it audible via TTS, make the exercise turn on it), because we cannot make it
  meaningful.
- Practical rule: sequence **grammar points** by prerequisite, but let **chunks** jump the queue. A
  beginner can hold `I'd rather not` as a chunk long before they can analyse it.

### 6.4 Contrast is the content, not a bonus

The owner named "when to use which" twice, and they are right that it is the hard part. The forms of
present perfect and past simple can be taught in ten minutes each; the choice takes months.

The design consequence is structural: **a contrast is its own item type with its own items.** Not
"present perfect items" plus "past simple items", but *choice items* where both structures are
grammatical and only one is right for the situation given. And they must be **interleaved with their
siblings**, because a choice item practised inside a block of present-perfect exercises teaches
nothing except "in this exercise, choose present perfect". This is the single most common failure
mode of grammar drills and it is entirely avoidable — see the `confusion_set` mechanism in §9.6.

The confusion sets that carry the most weight for an IELTS-style learner:

- present perfect ↔ past simple (finished time vs current relevance)
- will ↔ going to ↔ present continuous (prediction vs intention vs arrangement)
- 1st ↔ 2nd conditional (real possibility vs hypothetical) and 2nd ↔ 3rd (unreal present vs unreal past)
- active ↔ passive (agent unknown/irrelevant/deliberately backgrounded vs agent central)
- must ↔ have to ↔ should ↔ might (obligation source, strength, and hedging)
- present simple ↔ present continuous for states, trends, and Task 1 description
- used to ↔ would ↔ past simple for past habit

---

## 7. Error correction: what changes behaviour

### 7.1 The headline number

**Lyster & Ranta (1997)**, the study everyone cites: **recasts produced learner repair 18% of the
time; elicitation produced repair 46% of the time.** And teachers overwhelmingly used recasts
anyway. Lyster's later framing splits feedback into:

- **Reformulations** — recasts and explicit correction. The correct form is *given* to the learner.
- **Prompts** — elicitation, metalinguistic clues, clarification requests, repetition. The learner
  is *pushed to self-repair*.

Prompts generate self-repair at roughly two and a half times the rate of recasts. Self-correction is
not a nicety: producing the repaired form yourself is another retrieval, and it is the retrieval that
matters (§3.1). A recast gives the learner a chance to nod and move on — which is why it looks
polite and works poorly.

### 7.2 Explicit vs implicit, and the caveats

**Li (2010)**'s meta-analysis found corrective feedback effective overall, with explicit feedback
(metalinguistic, explicit correction) showing larger immediate effects, though the explicit/implicit
and prompts/recasts comparisons remain **genuinely inconsistent across studies** and the picture
depends on the feature and the context. Don't overclaim. The safe, well-supported positions:

1. **Feedback beats no feedback.** The Truscott position that correction is useless or harmful has
   not survived; Bitchener & Knoch and successors show accuracy gains on immediate *and delayed*
   post-tests.
2. **Focused beats unfocused.** Bitchener & Knoch (2010), 63 learners, found focused written
   corrective feedback effective at both immediate and delayed post-test. The theoretical reason is
   good: focused feedback targets one error type, so it is noticeable and does not overload;
   unfocused feedback across many error types imposes cognitive overload. Unfocused feedback shows
   inconsistent results, though some recent work finds gains for articles, prepositions and tense.
3. **Prompt before you tell.** Give the learner a chance to self-repair before supplying the form.

### 7.3 Design rules for BandReady

- **Never lead with the answer.** On a wrong production, the first response is a prompt: *"Check the
  verb — is this a finished time or a period that includes now?"* Only after a second attempt (or an
  explicit "show me") does the app supply the correct form and the rule.
- **Correct one thing.** When a learner's sentence has three errors, target the one the current item
  is about. Log the rest for later items; do not display them. This is "focused feedback" and it is
  the difference between actionable and demoralising.
- **Make the self-repair count.** A successful self-repair after a prompt should be graded as a
  *pass with effort* (FSRS rating 2, "hard") — not a fail. It is a genuine retrieval and it should
  extend the interval, just less than a clean pass.
- **Metalinguistic feedback needs learner-legible metalanguage.** "Non-finite clause" fails the
  zero-knowledge bar. "The -ing part can't be the only verb in the sentence" passes. Every rule
  string in the content must survive that test.
- **Route errors back into the system.** An error type detected in a Writing submission or Speaking
  transcript is the highest-quality signal we will ever get about what a learner needs. §9.3 uses
  it as an item-entry route and §9.5 uses it as a demotion trigger.

---

## 8. The productive-use bottleneck: understanding → using it under time pressure

This is the part most apps never solve, and it has a well-developed theory.

### 8.1 Skill acquisition theory

**DeKeyser**'s framework (drawn from ACT-R): knowledge moves through three phases —

1. **Declarative** — you know the rule as a fact. ("The passive puts the object first and uses
   be + past participle.")
2. **Procedural** — you can apply it, slowly and with attention, in a task.
3. **Automatised** — application is fast, accurate and effortless, following the **power law of
   practice**: reaction time falls as a power function of practice trials — big gains early, then
   diminishing but continuing improvement over many repetitions.

The bottleneck between (1) and (3) is **practice**, and DeKeyser is specific about the kind:
proceduralisation happens best when **the practice resembles the real communicative activity**. Gap
fills proceduralise gap-filling. If the target performance is "write a Task 2 body paragraph in
seven minutes", then some of the practice must look like that.

### 8.2 What the practice must have

- **Time pressure.** Automatisation is defined by speed. If nothing is ever timed, nothing ever
  automatises — you build a learner who is accurate with unlimited thinking time and falls apart in
  the exam room. Latency should be *measured* (the SRS `review()` already accepts `elapsed_ms` —
  use it) and should feed the mastery decision, not just analytics.
- **Repetition of the task, not just the item.** Task-repetition research: immediate aural-oral
  repetition improves fluency regardless of proficiency or task type; **speech-rate gains are
  largest across the first three performances and continue to about the fifth**; clause-final pauses
  drop by the second performance, mid-clause pauses by the fourth, self-repairs only after the
  fourth. So: **repeat a spoken task 3–5 times**, not twice. That is a concrete number we can build
  to.
- **Fluency activities using only known material.** Nation's fluency strand and the 4/3/2 family
  (deliver the same content in 4 minutes, then 3, then 2; or 60/45/30 seconds for our scale). The
  defining constraint is *no new language* — everything must already be known, so all the pressure
  goes onto speed. This is the strand BandReady is currently missing entirely, and it is the
  cheapest one to add on top of an SRS that already knows which items are mature.
- **Blocked first, then interleaved.** Interleaving is a classic desirable difficulty and produces
  better long-term retention and transfer than blocking in many domains (the volume-formula study:
  63% vs 20% at a one-week delay). But for language specifically the picture is more nuanced —
  effects are weaker for explicit, rule-based material, and Hwang et al. (2025), pointedly titled
  *"Undesirable Difficulty of Interleaved Practice"*, found **initial blocked practice is necessary
  for declarative knowledge development in lower-achieving learners**. Prior knowledge moderates the
  effect. So: **block at introduction, interleave for consolidation.** Do not interleave a structure
  the learner has not yet got a declarative grip on.

### 8.3 The bridge BandReady already owns

The most valuable asset here is that BandReady **already knows what the target performance looks
like** — 102 writing prompts, 108 speaking topic sets, band-style rubrics, timed mock conditions
enforced server-side. That means the final stage of every grammar item can be an actual exam-shaped
production slot rather than a synthetic one. A grammar point is not "mastered" because a card went
green; it is mastered when the learner produced it correctly, unaided, inside a timed Part 3 answer
or a Task 2 paragraph. **Make that the definition of mastery** (§9.7) and the entire module points at
the right target.

---

## 9. THE BANDREADY LEARNING ALGORITHM

What follows is the concrete proposal. It sits **on top of** FSRS, not instead of it: FSRS keeps
owning `due_at`; the algorithm owns everything else. New state per card: `mastery_stage` (0–5),
`stage_successes` (successes at the current stage), `stage_days` (distinct days with a success at
the current stage), `contexts_seen` (list of context ids), `last_wild_failure_at`.

### 9.1 The unit of learning

Three item families, one queue, one scheduler.

| Family | What an item is | Examples |
|---|---|---|
| `lex` | a lexical unit stored as a unit | `biodegradable`; `carbon footprint`; `give rise to`; `that said` |
| `gram_form` | a structure + how to build it | present perfect; passive with modals; third conditional |
| `gram_choice` | a **contrast**: two structures, one situation, one right answer | present perfect vs past simple; will vs going to |

`gram_choice` items are first-class and carry the "when to use which" that the owner named. They are
**not** derived from `gram_form` items at runtime — they are authored, because the interesting part
is the situation that disambiguates, and only a human (or a carefully prompted LLM with review) can
write a situation where both forms are grammatical and only one is right.

Every item declares:

```
id, family, stage_min, prereq_ids[],        # sequencing
confusion_set,                              # e.g. "past-time-reference"
contexts[] (>=3 lex, >=6 gram),             # each: text, register, topic_id, blank_spans
collocations[] (lex),
rule_plain (gram),                          # learner-legible, no jargon
skill_links[]                               # writing_prompt_id / speaking_card_id / band criterion
```

### 9.2 Entry gate — nothing is scheduled until it is understood

An item does not become an SRS card at the moment it is queued. It first passes a **first
encounter** (stage S0, unscheduled), which for both families is the same three beats:

1. **Meaning established.** `lex`: definition + one context sentence, form highlighted, TTS
   available. `gram`: 4–6 worked examples with the target form marked, learner is asked one
   guided-discovery question about them, **then** the plain-language rule is stated. (Discovery
   *then* explicit statement — Schmidt's noticing plus the explicit-instruction meta-analyses.)
2. **One worked example**, narrated: why this form here, what the alternative would have meant.
3. **One immediate successful retrieval** at S1 difficulty. If it fails twice, S0 repeats within the
   same session (up to twice) and the item is not carded today.

Only after beat 3 does `create_card()` run. This closes FSRS's blind spot #2 in §3.4.

### 9.3 Entry routes, in priority order

1. **Learner error harvest (highest priority).** An error type detected in a Writing submission or
   Speaking transcript queues the corresponding grammar item, or the intended-word/collocation as a
   `lex` item. This is the strongest route because the learner has already experienced the *need*
   (the Involvement Load "need" component, learner-generated rather than imposed) and has already
   noticed a gap in Swain's sense. Requires a mapping table from feedback error codes → grammar
   item ids; the content agents must author `fixes_errors[]` on each grammar point to make this
   possible.
2. **Curriculum sequence.** The grammar prerequisite DAG, walked in order; the vocabulary decks by
   topic, biased toward topics the learner has upcoming or recently practised.
3. **Encountered unknowns.** Words tapped in a Reading passage or a Listening script.
4. **Manual add.**

Daily new-item budget, gated on backlog: default **10 `lex` + 1 grammar point (which may expand to
3–5 items) per day**, and **zero new items if the due backlog exceeds 2× the review cap**. A learner
drowning in reviews must never be handed more.

### 9.4 The stage ladder

The core of the design. Stage determines **what kind of question**, independent of FSRS state.

| Stage | Name | What the learner does | `lex` exercise | `gram` exercise | Grading |
|---|---|---|---|---|---|
| **S0** | Encounter | meets it | teach card + TTS | worked examples → guided question → plain rule | not scheduled |
| **S1** | Recognition | recognises it | `flip`; meaning-match | grammaticality judgement; **structured input** (meaning-from-form) | deterministic |
| **S2** | Controlled recall | retrieves the form | `cloze` in a full sentence; `audio_recall` | gapped-verb cloze; short transform | deterministic + fuzzy match |
| **S3** | **Choice / discrimination** | picks the right one for the situation | near-synonym & register choice; `collocation` (partner as blank) | **`gram_choice`**: two grammatical options, one situation, justify briefly | deterministic + short LLM justification check |
| **S4** | Constrained production | builds it themselves | `use_in_sentence` with a **mandated collocate** and a given situation | respond-to-situation with a **mandated structure**; sentence completion; dictogloss reconstruction | deterministic pre-check → LLM rubric |
| **S5** | Free production under load | uses it in the real task, timed | write/say a 2-sentence exam-shaped answer using 2+ target items, timed | produce a Task 2 sentence / Part 3 answer that requires the structure, timed | LLM rubric on *use of the target*, not on essay quality |
| **S5+** | Maintenance | keeps it | rotates S3/S4/S5 only | rotates S3/S4/S5 only | as above |

Design notes on why the ladder is shaped this way:

- **S1 is deliberately thin.** 1–3 reps maximum, because recognition does not become production
  (§2.1) and because the existing `eligible_types()` already funnels new cards to `flip` only.
  The bug to avoid is items *lingering* at S1 because flip cards are easy and keep passing.
- **S2 is where most of the volume lives**, and this is Folse's finding operationalised: cheap,
  frequent, in-context retrievals in preference to one expensive production task. Aim for the
  majority of an item's 8–12 retrievals to happen at S2/S3.
- **S3 exists as its own stage** because "when to use which" is the named hard part and it is a
  distinct skill from producing the form. An item that can be produced but not *chosen* is not
  learned.
- **S4 is deferred until form is secure** — this is the TOPRA/Barcroft constraint (§2.4). Do not ask
  for original sentence production while the form is still shaky; it degrades form learning.
- **S5 is the point of the whole system** and must be reachable, not aspirational. It should reuse
  the existing writing prompts and speaking cards via `skill_links[]`.

### 9.5 Advancement, demotion, and what triggers a return to an earlier stage

**Advance** S(n) → S(n+1) when **all** hold:

- ≥ **2 successes** at the current stage,
- on ≥ **2 distinct days** (spacing between quality levels, not just between reps),
- on ≥ **2 distinct contexts** (S2+),
- most recent attempt was a clean pass — no hint used, and for S1–S3 latency below the stage
  threshold (suggested: S1 ≤ 5s, S2 ≤ 15s, S3 ≤ 20s; tune from observed data),
- and **never more than one stage advance per session per item.**

**Demote** on these triggers, in increasing severity:

| Trigger | Action |
|---|---|
| FSRS rating 1 (`again`) at S≥3 | drop **one** stage; next presentation is preceded by a re-teach card (rule + worked example) before the retry |
| 2 lapses within the last 3 reviews | drop **two** stages, mark `leech`, cap at S3 for 14 days |
| Hint used to pass at S4/S5 | no stage change, but `stage_successes` does not increment (a hinted pass buys nothing) |
| **Wild failure** — the same error type reappears in a Writing submission or Speaking transcript | **hard drop to S3** regardless of card state, set `last_wild_failure_at`, and force the item into the next session |
| Item mature but unproduced for 60+ days | **no demotion.** That is what FSRS's interval is for. Demote on evidence of failure only. |

The **wild failure** rule is the most important one in the table and the one nothing else on the
market does. Green cards plus wrong essays is the exact pathology of SRS-only apps, and BandReady is
in the rare position of being able to detect it because the writing and speaking modules already
produce structured feedback. Card state is a proxy; the essay is the ground truth. When they
disagree, the essay wins.

**Typos must not count as failures.** `normalize_answer_text()` and `word_variants()` already exist
in `exercises.py`; a near-miss should be surfaced as "close — check the spelling" and graded as a
pass-with-effort, not a lapse. A false lapse poisons FSRS's difficulty estimate for that card.

### 9.6 Choosing the sentence context

Rules, in priority order. These are also **authoring constraints** — the content agents must produce
material that satisfies them.

1. **Never repeat a context at consecutive presentations.** Varied contexts build a generalisable
   representation; a repeated context builds a memorised sentence. Rotate through `contexts[]`;
   only reuse once the list is exhausted, and prefer the least-recently-seen.
2. **≥3 contexts per `lex` item; ≥6 per grammar point**, spread across registers.
3. **Known-word coverage.** Every context must be ~95–98% known vocabulary apart from the target
   (Nation/Laufer's lexical thresholds: 95% is minimal comprehension, 98% is unassisted). Operational
   rule for authors: **a context sentence may contain at most one unfamiliar item — the target.**
   No second hard word. If the learner has to decode the frame, they cannot learn from it.
4. **Contexts must be diagnostic.** For a cloze, exactly one answer (or one small accepted set)
   should fit. If three plausible words fit the gap, the item is broken and teaches nothing. This is
   mechanically checkable: run the cloze past the configured LLM with the target removed and see
   what it proposes. Same test for `gram_choice`: the *wrong* option must be grammatical and only
   wrong given the situation — otherwise it's a form test wearing a choice-test costume.
5. **Register rotation.** Each item needs ≥1 context in speaking register (Part 1/3 style, contracted
   forms, personal) and ≥1 in academic writing register (Task 1/2 style). The choice for a given
   review is biased toward the module the learner has used most recently.
6. **Topic bias.** Prefer contexts whose `topic_id` (from `data/topics.jsonl`) matches a topic the
   learner has upcoming or has recently practised, so grammar practice doubles as topic-vocabulary
   exposure and vice versa.
7. **Formal focus early, semantic load late.** At S1–S2 keep contexts short and the cognitive load on
   form. Save the rich, meaning-heavy contexts for S3+ (TOPRA, §2.4).

### 9.7 Mastery

An item is `mastered` when **all** of:

- `mastery_stage == 5`,
- FSRS `stability >= 21` days,
- **≥1 correct unassisted production** — either a passed S5 exercise or a detected correct use in a
  real Writing/Speaking submission (the latter is worth more; record which),
- no lapse in the last 3 reviews,
- for grammar: at least one passed `gram_choice` item from the same `confusion_set` (you have not
  mastered the present perfect until you can decline to use it).

Mastered items stay in FSRS forever but are only ever presented at S3/S5 — never as flip cards.
Report mastery per grammar point and per deck, and surface it as "you can use this", not as a
percentage.

### 9.8 Interleaving grammar and vocabulary

**Within a session:**

- **Block at introduction.** A newly introduced grammar point gets 4–8 consecutive items in its
  first session (Hwang et al. 2025 — initial blocking is needed to build declarative knowledge, and
  low-prior-knowledge learners are hurt by premature interleaving). This is the only blocked segment.
- **Interleave from S2 onward.** Everything due at S2+ is shuffled: `lex` and `gram` in one queue.
- **Contrast constraint (the important one).** For any item at S3+ belonging to a `confusion_set`,
  the session builder **must** include at least one item from a *sibling* member of that set in the
  same session, and must not present more than 2 same-set-same-member items consecutively. Without
  this, choice items degenerate into "the answer is whatever this block is about".
- **Mix ratio:** ~60/40 `lex`:`gram` by item count, which lands near 50/50 by time since grammar
  items are slower. Tune against actual session length.

**Across a week:** every grammar point that reaches S4 should get at least one S5 slot inside a real
skills task within 7 days. If the learner isn't using the Writing/Speaking modules, the module
generates a self-contained S5 slot instead — but tag it, because a real submission is stronger
evidence.

### 9.9 Session shape

```
1. Warm-up          ~2 min   3–5 due items at S1/S2. Fast, high success. Builds momentum.
2. Core review     ~10–15    FSRS due queue. Stage table picks the exercise.
                             Interleaved; contrast constraint enforced.
3. New items        ~3–5     S0 packages. Blocked if new grammar. Skipped if backlog > 2× cap.
4. Production       ~5 min   1–3 items at S4/S5. TIMED. Always last — this is what
                             everything upstream exists to feed.
5. Fluency close   weekly    3–5 repetitions of a 60/45/30s spoken answer using
                   ~5 min    S4+ items ONLY. No new language. Speed is the only target.
                             (Task-repetition evidence: gains run to the 3rd–5th repetition.)
```

Never end a session on recognition. The last thing the learner does should be the thing the exam
asks for.

### 9.10 Mapping outcomes onto FSRS ratings

FSRS only sees 1–4 (`RATINGS = {1: "again", 2: "hard", 3: "good", 4: "easy"}`). The mapping is a
design decision and it must not be left to learner self-report, because learners systematically
mistake fluency of recognition for durability of recall (§3.1).

| Outcome | Rating |
|---|---|
| Wrong; needed the answer shown | 1 `again` |
| Wrong, then **self-repaired after a prompt** | 2 `hard` — a real retrieval, credit it |
| Correct but slow (over the stage latency threshold), or one hint used | 2 `hard` |
| Correct, within threshold | 3 `good` |
| Correct, fast, first attempt, **at a stage at or above the item's current stage** | 4 `easy` |
| Typo / near-miss caught by `normalize_answer_text` | 3 `good`, with a spelling note |

Self-rating may be offered at S1 only (where the app cannot see inside the learner's head on a flip
card). At S2–S5 the grading is the app's, not the learner's.

### 9.11 What this obliges the content agents to author

Falls directly out of the algorithm. Design agent should encode these as schema requirements so
`validate.py` can enforce them:

**Per `lex` item** — ≥3 contexts across ≥2 registers with `topic_id`; ≥3 collocations; ≥1 context
where the cloze has a unique answer; a confusable near-synonym where one exists (feeds S3).

**Per grammar point** — `rule_plain` in learner-legible language with zero unexplained jargon;
prerequisite ids; `confusion_set`; 6+ contexts across registers; **8+ `gram_choice` items where the
distractor is grammatical but situationally wrong**; 4+ S4 production prompts with mandated
structure; 1–2 S5 slots linked to a real `writing_prompt_id` / `speaking_card_id`; `fixes_errors[]`
mapping to writing-feedback error codes so the harvest route in §9.3 works; and the one-line "why
this matters" that names where it shows up in an IELTS-style task.

---

## 10. Where the evidence is thin — do not overclaim

Honest list, so the design agent knows which knobs are guesses:

- **Expanding vs equal intervals**: real but small (Nakata 2015). Not worth engineering effort.
- **Interleaving for grammar**: benefits are weaker for explicit rule-based material than in the
  motor/maths literature, and initial blocking may be *necessary* for lower-proficiency learners
  (Hwang et al. 2025). Our block-then-interleave rule is a reasonable synthesis, not a proven recipe.
- **Prompts vs recasts / explicit vs implicit feedback**: Lyster & Ranta's repair-rate gap is solid;
  the downstream learning comparisons are inconsistent across studies (Li 2010). We lean on prompts
  because self-repair is an extra retrieval — a mechanism argument, not a settled empirical one.
- **Involvement Load vs retrieval frequency**: partly in tension (Folse 2006 vs Hulstijn & Laufer
  2001). We resolve it in favour of frequency early and depth late; that resolution is our judgement.
- **Exact exposure numbers**: the 8–12 deliberate-retrieval target is an interpolation from the
  incidental-exposure literature adjusted for retrieval efficiency. Treat it as a starting parameter
  to be validated against BandReady's own review logs, not a constant.
- **0.85 vs 0.90 desired retention for grammar choice items**: a judgement call.
- **Latency thresholds** (5s/15s/20s): invented as starting values. They must be recalibrated from
  the `elapsed_ms` data the scheduler already collects.

---

## 11. One-paragraph summary for the design agent

Items enter only after an explicit, understood first encounter, with priority given to errors the
learner actually made. They climb a five-stage ladder from recognition through controlled recall to
**choice**, then constrained production, then timed production inside a real exam-shaped task —
because recognition never becomes production on its own, and because explicit rule teaching is
well-supported but is only the first of the five steps. FSRS decides *when*; the ladder decides
*what kind of question*, *which sentence*, and *what counts as a pass*. Practice is many cheap
retrievals in varied, diagnostic, level-appropriate contexts rather than a few expensive ones.
Vocabulary is chunk-first because half of natural English is prefabricated, and every word is taught
with its partners because a word without its collocates is half-learned. Grammar is sequenced by
real prerequisite because instruction cannot make learners skip developmental stages, and it is
practised **contrastively** because "when to use which" is where learners actually fail. Failure
demotes by one stage and re-teaches; failure detected in the learner's own writing or speech demotes
hard, because a green card and a wrong essay means the essay is right. Mastery is not a green card —
it is the learner using the thing correctly, unaided, under time pressure, in a task that looks like
the exam.

---

## SOURCES

**Exposure, repetition, incidental acquisition**
- Webb, S. (2007). *The Effects of Repetition on Vocabulary Knowledge.* Applied Linguistics 28(1), 46–65. — https://academic.oup.com/applij/article-abstract/28/1/46/174744 · https://eric.ed.gov/?id=EJ757328
- Uchihara, Webb & Yanagisawa. *The Effects of Repetition on Incidental Vocabulary Learning: A Meta-Analysis of Correlational Studies.* — https://www.researchgate.net/publication/330774796_The_Effects_of_Repetition_on_Incidental_Vocabulary_Learning_A_Meta-Analysis_of_Correlational_Studies
- Hulme et al. (2019). *Incidental Learning and Long-Term Retention of New Word Meanings From Stories: The Effect of Number of Exposures.* Language Learning. — https://onlinelibrary.wiley.com/doi/10.1111/lang.12313
- *The effects of context and word exposure frequency on incidental vocabulary acquisition and retention through reading.* Language Learning Journal 47(2). — https://www.tandfonline.com/doi/abs/10.1080/09571736.2016.1244217
- *Incidental L2 Vocabulary Acquisition From and While Reading.* SSLA. — https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/incidental-l2-vocabulary-acquisition-from-and-while-reading/791C52E20B00D64C4C2EC7CA7D735EC8
- *Effects of Exposure Frequency, Depth of Processing, and ...* — https://files.eric.ed.gov/fulltext/EJ1414704.pdf

**Receptive vs productive knowledge**
- Teng, M. & Xu, J. *Pushing vocabulary knowledge from receptive to productive mastery: Effects of task type and repetition frequency.* Language Teaching Research. — https://journals.sagepub.com/doi/abs/10.1177/13621688221077028
- Lee (2025). *The relationship between receptive and productive knowledge of L2 English collocations.* IJAL. — https://onlinelibrary.wiley.com/doi/10.1111/ijal.12605
- *Bridging the Gap between Receptive and Productive Vocabulary.* Reading Matrix. — https://www.readingmatrix.com/articles/september_2011/yamamoto.pdf
- *Exploring the Relationship between Receptive and Productive Vocabulary Knowledge.* — https://files.eric.ed.gov/fulltext/EJ1075480.pdf

**Depth of processing / involvement load / task type**
- Hulstijn, J. & Laufer, B. (2001). *Some Empirical Evidence for the Involvement Load Hypothesis in Vocabulary Acquisition.* Language Learning 51(3). — https://onlinelibrary.wiley.com/doi/abs/10.1111/0023-8333.00164
- Laufer & Hulstijn (2001). *Incidental vocabulary acquisition in a second language: the construct of task-induced involvement.* — https://www.academia.edu/102560013/The_involvement_load_hypothesis_an_inquiry_into_vocabulary_learning
- Folse, K. (2006). *The Effect of Type of Written Exercise on L2 Vocabulary Retention.* TESOL Quarterly 40(2). — https://onlinelibrary.wiley.com/doi/abs/10.2307/40264523 · https://eric.ed.gov/?id=EJ753068
- Barcroft, J. *The TOPRA model.* — https://sites.wustl.edu/barcroft/the-topra-model/ · *Lexical Input Processing and Vocabulary Learning* — https://benjamins.com/catalog/lllt.43
- *Semantic and Structural Tasks for the Mapping Component of L2 Vocabulary Learning.* SSLA. — https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/semantic-and-structural-tasks-for-the-mapping-component-of-l2-vocabulary-learning/E785E9225B1D21D5C5B0B2B7C1D0655C

**Retrieval practice / testing effect / spacing**
- Karpicke, J. & Roediger, H. (2008). *The Critical Importance of Retrieval for Learning.* Science. — http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Karpicke-Roediger-2008_Sci.pdf
- Karpicke & Roediger (2007). *Repeated retrieval during learning is the key to long-term retention.* JML. — https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JML.pdf
- Roediger & Karpicke (2006). *The Power of Testing Memory.* Perspectives on Psychological Science 1(3), 181–210.
- Cepeda, Pashler, Vul, Wixted & Rohrer (2006). *Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.* Psychological Bulletin. — https://augmentingcognition.com/assets/Cepeda2006.pdf · https://www.yorku.ca/ncepeda/publications/CPVWR2006.html
- Cepeda et al. (2008). *Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.* Psych Science. — https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf
- Nakata, T. (2015). *Effects of Expanding and Equal Spacing on Second Language Vocabulary Learning.* SSLA 37, 677–711. — https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-expanding-and-equal-spacing-on-second-language-vocabulary-learning/D1D796306985C52F9BE7A1200AC50DB9
- Nakata & Elgort (2021). *Effects of spacing on contextual vocabulary learning: Spacing facilitates the acquisition of explicit, but not tacit, vocabulary knowledge.* — https://journals.sagepub.com/doi/10.1177/0267658320927764
- Elgort, I. (2011). *Deliberate Learning and Vocabulary Acquisition in a Second Language.* Language Learning 61(2). — https://www.lextutor.ca/freq/lists_download/elgort_2011.pdf
- Elgort & Warren. *Multiword Units at the Interface: Deliberate Learning and Implicit Knowledge Gains.* — https://www.academia.edu/20065555/Multiword_Units_at_the_Interface_Deliberate_Learning_and_Implicit_Knowledge_Gains
- Bjork, R. & Bjork, E. *Introducing Desirable Difficulties Into Practice and Instruction.* — https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf · *Desirable Difficulties in Vocabulary Learning* — https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/11/ra_kroll_2015.pdf

**FSRS**
- *A technical explanation of FSRS* (Expertium). — https://expertium.github.io/Algorithm.html
- fsrs4anki tutorial (D/S/R model, parameters). — https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md
- Anki FAQ, *What spaced repetition algorithm does Anki use?* — https://faqs.ankiweb.net/what-spaced-repetition-algorithm

**Formulaic language and collocation**
- Erman, B. & Warren, B. (2000). *The idiom principle and the open choice principle.* Text 20(1) — 58.6% spoken / 52.3% written. Discussed in: Vilkaitė, L. *Formulaic language: Distribution, processing, and acquisition* — https://eprints.nottingham.ac.uk/35442/1/L.Vilkaite.%20Formulaic%20language.Distribution,%20processing%20and%20acquisition%20.pdf
- Boers, F., Eyckmans, J., Kappel, J., Stengers, H. & Demecheleer, M. (2006). *Formulaic sequences and perceived oral proficiency: putting a Lexical Approach to the test.* Language Teaching Research 10(3). — https://journals.sagepub.com/doi/10.1191/1362168806lr195oa
- Martinez, R. & Schmitt, N. (2012). *A Phrasal Expressions List.* Applied Linguistics 33(3). — https://www.lextutor.ca/tests/pvst/martinez_schmitt_2012.pdf
- *Formulaic language is not all the same: comparing the frequency of idiomatic phrases, collocations, lexical bundles, and phrasal verbs.* — https://www.researchgate.net/publication/291691467
- *Can explicit instruction of formulaic sequences enhance L2 oral fluency?* System. — https://www.sciencedirect.com/science/article/abs/pii/S0024384121000449
- *Incidental Learning of Single Words and Collocations Through Viewing an Academic Lecture.* SSLA. — https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/incidental-learning-of-single-words-and-collocations-through-viewing-an-academic-lecture/6CC8A382AD35543BBE79654AAC8DD5D4
- *EFL Learners' Collocation Acquisition and Learning in Corpus-Based Instruction: A Systematic Review.* Sustainability 15(17). — https://www.mdpi.com/2071-1050/15/17/13242
- el Majidi et al. (2026). *Collocation Instruction: Teachers' Beliefs, Knowledge, and Practices.* IJAL. — https://onlinelibrary.wiley.com/doi/10.1111/ijal.12773

**Grammar instruction, order of acquisition, noticing**
- Norris, J. & Ortega, L. (2000). *Effectiveness of L2 Instruction: A Research Synthesis and Quantitative Meta-analysis.* Language Learning 50(3). — https://www.researchgate.net/publication/228003219
- Spada, N. & Tomita, Y. (2010). *Interactions Between Type of Instruction and Type of Language Feature: A Meta-Analysis.* Language Learning 60(2). — https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9922.2010.00562.x
- Goo, Granena, Yilmaz & Novella (2015). *Norris & Ortega (2000) revisited and updated: Implicit and explicit instruction in L2 learning.* — https://benjamins.com/catalog/sibil.48.18goo
- Goldschneider, J. & DeKeyser, R. (2001/2005). *Explaining the "Natural Order of L2 Morpheme Acquisition" in English: A Meta-analysis of Multiple Determinants.* Language Learning. — https://onlinelibrary.wiley.com/doi/abs/10.1111/1467-9922.00147 · https://eric.ed.gov/?id=EJ621548
- Pienemann, M. *Language Processing and Second Language Development: Processability Theory.* — https://benjamins.com/catalog/sibil.15 · *Processability Theory* (Cambridge Elements) — https://www.cambridge.org/core/elements/abs/processability-theory/C7D6CA452FF361CC8F833D7D70F379FB · Teachability Hypothesis overview — https://en.wikipedia.org/wiki/Teachability_Hypothesis
- VanPatten, B. *Processing Instruction* — meta-analysis: *The effectiveness of processing instruction on L2 grammar acquisition: A meta-analysis.* — https://www.researchgate.net/publication/236032459 · review — https://www.academia.edu/34582985/Processing_Instruction_A_Review_of_Issues
- Schmidt, R. (2010). *Attention, awareness, and individual differences in language learning.* — https://nflrc.hawaii.edu/PDFs/SCHMIDT%20Attention,%20awareness,%20and%20individual%20differences.pdf
- Swain, M. — output hypothesis / noticing function. Russell, V. (2014). *A Closer Look at the Output Hypothesis: The Effect of Pushed Output on Noticing and Inductive Learning of the Spanish Future Tense.* Foreign Language Annals. — https://onlinelibrary.wiley.com/doi/abs/10.1111/flan.12077 · *Testing the Noticing Function of the Output Hypothesis* — https://files.eric.ed.gov/fulltext/EJ1095572.pdf
- Wajnryb, R. — dictogloss. *Children using dictogloss to focus on form* — https://www.nus.edu.sg/celc/wp-content/uploads/2022/11/47-61shak.pdf · *Dictogloss: Is It an Effective Language Learning Task?* — https://www.researchgate.net/publication/234771615

**Error correction**
- Lyster, R. & Ranta, L. (1997). *Corrective Feedback and Learner Uptake: Negotiation of Form in Communicative Classrooms.* SSLA 19. — https://www.researchgate.net/publication/252160472_Corrective_feedback_and_learner_uptake · https://escholarship.mcgill.ca/downloads/0p096b851
- Lyster, R. *Roles for Corrective Feedback in Second Language Instruction.* — https://onlinelibrary.wiley.com/doi/full/10.1002/9781405198431.wbeal1028.pub2
- Li, S. (2010). *The Effectiveness of Corrective Feedback in SLA: A Meta-Analysis.* Language Learning 60(2), 309–365. — https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9922.2010.00561.x
- Bitchener, J. & Knoch, U. (2010) and successors; *Efficacy of Written Corrective Feedback in Writing Instruction: A Meta-Analysis.* TESL-EJ 24. — https://tesl-ej.org/wordpress/issues/volume24/ej95/ej95a3/
- *The effects of focused and unfocused written corrective feedback in an EFL context.* System. — https://www.sciencedirect.com/science/article/abs/pii/S0346251X08000390
- *The effectiveness of unfocused corrective feedback on L2 writers' acquisition of English article, prepositional and verb tense usages.* Humanities & Social Sciences Communications (2025). — https://www.nature.com/articles/s41599-025-05126-x

**Skill acquisition, automatisation, fluency, interleaving**
- DeKeyser, R. *Automatization, Skill Acquisition, and Practice in Second Language Acquisition.* — https://onlinelibrary.wiley.com/doi/abs/10.1002/9781405198431.wbeal0067
- DeKeyser, R. & Suzuki, Y. (2025). *Skill acquisition theory.* In VanPatten, Keating & Wulff (eds.), *Theories in Second Language Acquisition* (4th ed.). — https://www.academia.edu/136849439
- Suzuki, Y. & DeKeyser, R. *Explicit knowledge and skill acquisition in second language learning.* — https://www.academia.edu/136849366
- *Task Repetition and Second Language Speech Processing.* SSLA. — https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/task-repetition-and-second-language-speech-processing/0EA95A4C7D9E90CD2AB30043F84A4635
- *Task repetition and L2 oral performance: A meta-analysis.* System. — https://sciencedirect.com/science/article/abs/pii/S0346251X25002787
- *Task repetition for language learning: A perspective from skill acquisition theory.* — https://www.researchgate.net/publication/345632347
- Hwang et al. (2025). *Undesirable Difficulty of Interleaved Practice: The Importance of Initial Blocked Practice for Declarative Knowledge Development in Low-Achieving Adolescents.* Language Learning. — https://onlinelibrary.wiley.com/doi/10.1111/lang.12659
- *The effects of interleaving and blocking practice on L2 contextualized grammar learning.* JSLS. — https://www.jbe-platform.com/content/journals/10.1075/jsls.00047.buh

**Course balance and lexical thresholds**
- Nation, I.S.P. *The Four Strands.* — https://www.academia.edu/41764855/The_Four_Strands · https://www.researchgate.net/publication/254301005_The_Four_Strands
- Nation, I.S.P. (2006). *How Large a Vocabulary Is Needed for Reading and Listening?* CMLR. — https://www.researchgate.net/publication/239928724
- Laufer, B. & Ravenhorst-Kalovski (2010). *Lexical threshold revisited: Lexical text coverage, learners' vocabulary size and reading comprehension.* Reading in a Foreign Language. — https://files.eric.ed.gov/fulltext/EJ887873.pdf

*IELTS is a registered trademark. BandReady is not affiliated with or endorsed by the IELTS
partners; all references here are to IELTS-style practice. All explanations, examples and exercise
designs in this document are original.*
