# GV-R1 — The Grammar Syllabus: a sequenced, prerequisite-checked map from zero to band 7

**Status:** research briefing. Input to the design agent (which writes `staging-grammar/DESIGN.md`),
to the content-authoring agents, and to the feature agents. **This file decides *what* is taught and
*in what order*. It does not decide the JSON schema, the exercise algorithm, or the UI** — those are
GV-R2/R3/design. Where a later document contradicts this one on sequencing, this one loses (design
wins), but it must say so explicitly and give a reason, because every edge in §9's dependency graph
was placed deliberately.

**Bar set by the owner:** *someone opening the app with zero knowledge should be able to follow all
of it.* That single sentence is the constraint that produced most of the decisions below — in
particular §1.2 (no forward references) and §2 (Stage 0 exists at all).

**Quality reference:** `staging/DESIGN.md` (speaking) and `staging-reading/DESIGN.md` (reading).
Those two set the house standard: dense, decided, no hedging, every field justified by a learner
behaviour it enables.

---

## 0. Method, scope and how to read this

### 0.1 What I did

Searched across four literatures and reconciled them by hand:

1. **CEFR level inventories** — the Council of Europe level system, the British Council/EAQUALS
   *Core Inventory for General English* (2011), the Cambridge **English Grammar Profile** (the
   corpus-derived list of "criterial features" — the structures whose *appearance* marks the
   boundary between one level and the next), and a public level-mapped grammar syllabus
   (Tracktest) used as a cross-check on level assignment.
2. **Acquisition-order research** — Brown (1973) and the L2 morpheme-order studies, and
   Goldschneider & DeKeyser's meta-analysis of what actually predicts the order (perceptual
   salience, semantic complexity, morphophonological regularity, syntactic category, frequency).
3. **Learner-error frequency** — corpus studies of what learners actually get wrong, at what rate.
4. **IELTS-style teaching practice** — what the Grammatical Range and Accuracy criterion rewards at
   band 7 versus band 6, and which structures the four skills modules in this repo already lean on.

Everything in §3–§8 was then rewritten from the underlying facts. **No example sentence in this
file was copied from any source I read.** Grammar terminology and the facts of English grammar are
not copyrightable; explanations and examples are, so all of both are original here. See §0.4.

### 0.2 Confidence policy

Every substantive claim carries a marker. Treat them as instructions about how much to argue with me.

| Marker | Meaning | What the design agent should do |
|---|---|---|
| **[H]** | High — multiple independent sources agree, or it is a plain fact about English | Build on it |
| **[M]** | Medium — the field broadly agrees but the boundary is fuzzy (most CEFR level assignments live here) | Build on it, allow the level to move ±1 band |
| **[L]** | Low — my pedagogical judgement, thinly sourced | Argue with it if you have a reason |
| **[JUDGEMENT]** | I am overriding a source, or filling a gap the sources leave open | Read the reason before changing it |

### 0.3 Vocabulary of this document

- **Point** — one teachable item (e.g. *present perfect for unfinished time*). The atom of the
  syllabus. 154 of them. Each gets an authored id.
- **Unit** — a coherent group of points taught together (17 of them).
- **Track** — Foundation / Core / Band-7 Polish. Three of them. A track is a place a learner can be
  *placed* by diagnostic.
- **Choice point** — a point whose difficulty is *not the form* but *knowing when to select it over
  a rival form*. 50 of the 154. These are the owner's "when to use which, and where", and they are
  the highest-value content in the module. They get a different content shape (§4).
- **Prerequisite** — point A is a prerequisite of B if B's explanation cannot be written without
  using A. This is a strict test and it is what makes §9 a real graph rather than a vibe.

### 0.4 Copyright — the specific risks in *grammar* content

Grammar content has a copyright profile unlike the four skills modules, and it is worth naming:

- **The facts and the terminology are free.** "Present perfect", "third conditional", "defining
  relative clause", the fact that `have/has + past participle` forms the present perfect, the fact
  that the passive is `be + past participle` — none of this is anyone's property.
- **The danger is the canonical example sentence.** Every grammar book on earth teaches the third
  conditional; a distinctive *example* of it ("If I had known you were coming, I'd have baked a
  cake") is an authored line and the tune is instantly recognisable. **The rule for authors: if a
  sentence feels familiar, it is. Throw it away.** Named-and-banned canonical examples, none of
  which may appear anywhere in this module: the cake one; "If it rains, the grass gets wet";
  "Water boils at 100°C" (fine as a *fact*, banned as an *example sentence* — it is the universal
  zero-conditional cliché); "I've lost my keys"; "John has been to Paris"; any sentence about
  someone called John, Mary, Tom or Sarah doing a textbook action.
- **Cline diagrams, "rules of thumb" and mnemonics can be authored expression.** The *idea* that
  the unreal past is a "distancing" device is a linguistic fact and free; a particular memorable
  formulation of it is not. Write our own formulation.
- **Band descriptors are copyrighted prose; the criteria are facts.** Reuse the clean-room
  paraphrase already in `staging/research/03-bands-and-errors.md`; never a descriptor's wording.
- Product copy says **"IELTS-style"** and inherits the non-affiliation notice in `manifest.json`.
- Keep the house world: invented proper nouns, and the existing pack convention (Verdon, Norland,
  Ashfield, Sandmouth, Marlow, Brackenfield) so grammar examples read as the same world as the
  reading passages.

### 0.5 Where I overrode the sources

| # | Source position | What I do instead | Why |
|---|---|---|---|
| O1 | CEFR inventories present grammar as a **flat list per level** | I present a **dependency graph**, and level is an attribute of a node, not the organising axis | A flat per-level list has no answer to "what must I already know to understand this?" The owner's zero-knowledge bar makes that question the whole job. |
| O2 | Tracktest and similar place **zero conditional, will/going to, gerund/infinitive at A1** | I place them A2–B1 | Those lists are testing *recognition*. This module is productive (§1.3). A learner who cannot yet form a negative with *do* cannot produce a conditional. |
| O3 | The twelve-tense **grid** is the standard presentation | I organise tenses by **what they do** (§3), and never show a 12-cell grid as a teaching object | The grid teaches the forms and hides the meanings. The meanings are the difficulty. |
| O4 | Most syllabi treat conditionals as **four numbered types** | I teach **two systems** (real / unreal) and the numbers as labels applied afterwards (§5) | The numbering is an artefact of teaching, not a fact about English. Learners who learn "the four types" cannot handle mixed conditionals, `wish`, `would rather` or `it's time`, which are the *same* unreal-past machinery. |
| O5 | The morpheme-order research is sometimes read as "teach in acquisition order" | I sequence by **dependency and utility**, not acquisition order | The research itself says instruction improves accuracy but does not change acquisition order. So acquisition order is not an instructional variable — it is a prediction about *when accuracy will arrive*, useful for setting expectations (§10.4), not for ordering lessons. **[H]** |
| O6 | IELTS prep material typically teaches "advanced structures" (inversion, cleft) as band-8 decoration | I keep them, but in a track explicitly labelled as **optional polish**, behind an accuracy gate | Band 7 rewards frequent error-free sentences. Handing a shaky B1 learner `Not only did...` produces band-6 wreckage. §11.3. |

---

## 1. The six theses this syllabus rests on

**1.1 — A grammar syllabus is a graph, not a list. [H]**
The single failure mode of every grammar course is the forward reference: explaining the present
perfect using the words "past participle" before past participles exist, or explaining reported
questions before embedded questions. §9 exists so that a learner opening the app at point 1 never
meets a term, form or concept that has not been taught. Every point in §2 carries its prerequisites,
and §9.3 records the topological check.

**1.2 — The auxiliary system is the true foundation, and it is usually taught by accident. [H][JUDGEMENT]**
English builds questions, negatives, short answers, tags, emphasis and ellipsis out of one mechanism:
put an auxiliary in front of the subject; if there isn't one, borrow `do`. A learner who has *this*
as an explicit system gets questions, negatives, tags, `so do I`, `neither have they`, echo
questions and reported-question word order for free. A learner who has memorised "add *do* for
questions" as a rule about the present simple has to relearn it eleven more times. I have made this
an explicit early point (`gr_aux_system`) rather than leaving it implicit inside the present simple.
This is one of the gaps the owner asked to be filled — see §8.14.

**1.3 — Grammar is only learned by producing it, so the syllabus must be written toward production. [H]**
Recognition ("choose the correct form") tests whether a learner can *identify* a form under ideal
conditions. It does not predict whether the form will appear in a two-minute Part 2 answer. The
established sequence — present the form, practise it under control, then produce it freely — is
sound; the failure is that most courses stop at controlled practice. **Every point in this syllabus
must terminate in a free-production task**, which for this app means a sentence the learner writes
or says about a real topic, judged by the LLM against the point's own criterion. The design agent
should treat "does this point have a free-production terminus?" as a lint.

**1.4 — The choice points carry more marks than the forms. [H]**
Corpus work on learner error consistently finds a small number of categories carrying most of the
errors — articles, verb tense/aspect selection, subject-verb agreement, prepositions and
countability. Note what that list is: **it is almost entirely selection errors, not formation
errors.** Learners can form the present perfect; they choose it wrongly. They can form a passive;
they use it where an active reads better. So the 50 choice points (§4) get: a decision rule stated
as a *question the learner asks themselves mid-sentence*, a minimal pair, a "why the other one is
wrong here" note, and forced-choice practice under time pressure. Everything else gets ordinary
treatment.

**1.5 — Accuracy beats range, and the syllabus must say so out loud. [H]**
The band-7 grammar standard is *frequent error-free sentences* alongside a *variety* of structures —
not maximal complexity. A correct simple sentence outscores a broken complex one. This has a direct
syllabus consequence: **Track C (polish) is gated on Track B accuracy**, and the module's own copy
must repeatedly tell learners that reaching for a structure they cannot control costs marks. Any
content that reads as "use these impressive structures" is off-brief.

**1.6 — A grammar point earns its place by appearing in something the app already does. [H]**
This repo has 108 speaking sets, 102 writing prompts, 36 reading passages and 43 listening scripts.
Every point in §2 carries a **skill hook** — where it pays off. Points with no hook were cut
(examples of what I cut: the future perfect continuous as a productive target; `shall` beyond fixed
offers; subjunctive `I demand that he be` beyond recognition; whom as a productive target). They are
recognition-only footnotes at most.

---

## 2. The unit map — the backbone

Seventeen units, three tracks, 154 points. IDs use the pack's snake convention: `gr_<slug>`.
`CEFR` = the level at which a learner is expected to **produce** this reliably (English Grammar
Profile / Core Inventory alignment where they speak, my judgement where they don't — see §0.5 O2).
`Pre` lists prerequisite point ids; `—` means it depends only on the unit's own predecessor.

Column `Δ` marks the point's role: **F** = form-led (the difficulty is the shape), **C** = choice
point (the difficulty is the selection — §4), **A** = accuracy point (the difficulty is remembering
it under load).

---

### TRACK A — FOUNDATION (zero → A2). Units 1–5, 44 points.

*Entry condition: none. This is the "zero knowledge" entry point and it must be genuinely usable by
someone whose only English is the alphabet. Track A is not IELTS-shaped and should not pretend to be
— the skill hooks here are thin on purpose.*

#### U1 — The English clause: what a sentence must have (A1). 10 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_clause_svo` | Every English clause needs a subject and a verb; basic S–V–O order | A1 | F | — | The root node. Everything else is a modification of this. |
| `gr_be_present` | `be` in the present: am / is / are, contractions, negatives | A1 | F | `gr_clause_svo` | The first verb, and irregular, so it must be learned as a special case before the regular system. |
| `gr_pronoun_subject` | Subject pronouns; English never drops the subject | A1 | A | `gr_clause_svo` | L1s that drop subjects (Spanish, Italian, Chinese, Japanese) produce *Is raining* for years. Name it on day one. |
| `gr_noun_plural` | Regular `-s` plurals, spelling rules, common irregulars | A1 | F | `gr_clause_svo` | Prerequisite for agreement, quantifiers and articles. |
| `gr_article_a_an` | `a` / `an` for a singular countable noun mentioned for the first time | A1 | F | `gr_noun_plural` | Introduced early and deliberately *incomplete* — the full article system is U6. |
| `gr_adjective_position` | Adjectives before the noun; adjectives never take `-s` | A1 | A | `gr_noun_plural` | *Two reds cars* is a first-week error that survives to B2 if unaddressed. |
| `gr_there_is` | `there is` / `there are` for existence | A1 | F | `gr_be_present`, `gr_noun_plural` | Distinct from `it is`; the confusion starts here so the fix starts here. |
| `gr_possessive` | `my/your/his…`, and possessive `'s` | A1 | F | `gr_pronoun_subject` | Needed for `whose` (U11) and for the apostrophe rules (U15). |
| `gr_word_order_place_time` | Where adverbials go: verb → object → place → time | A1 | A | `gr_clause_svo` | English is rigid here and most languages aren't. Cheap to teach, expensive to leave. |
| `gr_capital_fullstop` | Sentence boundaries: capital letter, full stop, one finite verb per clause | A1 | A | `gr_clause_svo` | The comma splice (U15) is unteachable without this. |

#### U2 — Present time and the auxiliary system (A1–A2). 10 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_present_simple` | Present simple for habits, routines, permanent situations and facts | A1 | F | `gr_clause_svo` | |
| `gr_third_person_s` | Third-person `-s`, spelling and the `/s/ /z/ /ɪz/` pronunciation | A1 | A | `gr_present_simple` | Acquired late in the natural order (**[H]**) — so expect errors long after teaching, and drill it long after teaching. |
| `gr_aux_system` | **The auxiliary rule:** questions and negatives move an auxiliary; if there is none, use `do/does` | A1 | F | `gr_present_simple`, `gr_be_present` | Thesis 1.2. Taught as one mechanism, not as a fact about one tense. |
| `gr_questions_wh` | `wh-` questions; subject questions take no `do` (`Who wrote it?` vs `What did she write?`) | A2 | C | `gr_aux_system` | The subject/object question split is a real choice point and is almost never taught. |
| `gr_short_answers` | Short answers and agreement echoes (`So do I`, `Neither have they`) | A2 | F | `gr_aux_system` | Free once the auxiliary system exists; enormous payoff in Speaking Part 1. |
| `gr_adverb_frequency` | Frequency adverbs and their position (before the main verb, after `be`) | A1 | A | `gr_present_simple` | |
| `gr_present_continuous` | Present continuous for now, for temporary situations, for changing trends | A1 | F | `gr_be_present` | `be + -ing` — also the first participle, so it seeds the passive and the perfect continuous. |
| `gr_stative_verbs` | Stative verbs and why they resist the continuous; the verbs that do both (`think`, `have`, `see`) | A2 | C | `gr_present_continuous` | `*I am knowing` is a fossilising error. |
| `gr_pres_simple_vs_cont` | **Choice:** present simple vs present continuous | A2 | C | `gr_present_simple`, `gr_present_continuous`, `gr_stative_verbs` | The first real choice point. Rule in §4.6. |
| `gr_imperative` | Imperatives, and `let's` | A1 | F | `gr_clause_svo` | Needed for instructions, and for reported commands in U13. |

#### U3 — Past time (A1–A2). 9 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_past_simple_regular` | Past simple, regular `-ed`, spelling, `/t/ /d/ /ɪd/` | A1 | F | `gr_present_simple` | |
| `gr_past_simple_irregular` | The irregular past — taught as a managed list, not a wall | A1 | F | `gr_past_simple_regular` | Feeds the SRS directly; see §10.5. |
| `gr_was_were` | `was` / `were` | A1 | F | `gr_be_present` | |
| `gr_past_aux_did` | `did` for past questions and negatives; the bare infinitive after `did` | A1 | A | `gr_aux_system`, `gr_past_simple_regular` | `*Did you went?` — one rule, applied. |
| `gr_past_time_markers` | `yesterday`, `last…`, `ago`, `in 2019`, `when I was…` | A1 | A | `gr_past_simple_regular` | These markers are the evidence the present-perfect choice rule (§4.1) runs on, so they must exist first. |
| `gr_past_continuous` | Past continuous: a longer action in progress at a past moment | A2 | F | `gr_present_continuous`, `gr_was_were` | |
| `gr_past_simple_vs_cont` | **Choice:** past simple vs past continuous — event vs setting | A2 | C | `gr_past_simple_regular`, `gr_past_continuous` | Rule in §4.3. |
| `gr_used_to` | `used to` for past habits and past states that are over | A2 | F | `gr_past_simple_regular` | |
| `gr_narrative_sequence` | Telling a sequence: past simple chain + `then / after that / while` | A2 | F | `gr_past_simple_vs_cont` | The grammar of Speaking Part 2, which is a narrative task. |

#### U4 — Future time (A2–B1). 8 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_future_will` | `will` for prediction, instant decision, offer, promise, refusal | A1 | F | `gr_clause_svo` | |
| `gr_future_going_to` | `be going to` for intention and for evidence-based prediction | A1 | F | `gr_present_continuous` | |
| `gr_future_pres_cont` | Present continuous for fixed arrangements | A2 | F | `gr_present_continuous` | |
| `gr_future_pres_simple` | Present simple for timetables and scheduled events | A2 | F | `gr_present_simple` | |
| `gr_future_choice` | **Choice:** will vs going to vs present continuous vs present simple | A2 | C | all four above | Rule in §4.4. The owner named this pair explicitly. |
| `gr_future_time_clause` | After `when / as soon as / before / until / by the time`, use a **present** form, not `will` | B1 | A | `gr_future_will`, `gr_present_simple` | *When I will arrive* is one of the most common B1 errors and is invisible to learners. |
| `gr_future_continuous` | Future continuous: in progress at a future time; also as a neutral, non-intentional future | B1 | F | `gr_future_will`, `gr_present_continuous` | The second use (`Will you be using the room?` — asking without pressure) is the useful one and is rarely taught. |
| `gr_future_perfect` | Future perfect: finished before a future point (`by 2040, the city will have doubled`) | B2 | F | `gr_present_perfect`, `gr_future_will` | Task 1 projections and Task 2 forecasts. Depends on the perfect, so it sits after U5 in the graph even though it is listed here. **See §9.2 — this is the one deliberate out-of-order listing.** |

#### U5 — Countability, quantity and the article system (A1–B2, spiralled). 7 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_countability` | Countable vs uncountable; the mass nouns learners pluralise (`research`, `information`, `advice`, `equipment`, `knowledge`, `evidence`) | A2 | A | `gr_noun_plural` | Article choice is *downstream of* countability judgement — the research is explicit that this is where the article problem actually starts. **[H]** |
| `gr_quantifiers_basic` | `some` / `any` / `much` / `many` / `a lot of` | A1 | F | `gr_countability` | |
| `gr_quantifiers_fine` | `a few` vs `few`, `a little` vs `little`, `plenty of`, `the majority of`, `a significant proportion of` | B1 | C | `gr_quantifiers_basic` | `few`/`a few` is a meaning reversal, not a register nicety. The upper half is Task 1's whole vocabulary of proportion. |
| `gr_article_the` | `the`: second mention, unique reference, defined by what follows, superlatives | A2 | C | `gr_article_a_an` | |
| `gr_article_zero` | Zero article: generic plurals, generic uncountables, abstract nouns, most proper nouns | A2 | C | `gr_article_the`, `gr_countability` | `*The computers have changed society` — the single most common article error in Task 2, because generic reference in English is bare and in most L1s it is not. **[H]** |
| `gr_article_decision` | **Choice:** the three-question article procedure (§4.11) | B1 | C | `gr_article_a_an`, `gr_article_the`, `gr_article_zero` | Articles are among the last things acquired even by advanced learners, so the module must give a *procedure*, not a feeling. **[H]** |
| `gr_demonstratives` | `this / that / these / those` as determiners and as text reference | A2 | F | `gr_article_the` | Seeds the cohesion unit (U16). |

---

### TRACK B — CORE (A2 → B2). Units 6–13, 74 points.

*Entry condition: Track A diagnostic passed. This is where band 6 is won and where the owner's four
named areas live. **Track B is the module.** If only one track ships, it is this one.*

#### U6 — The perfect: linking two times (A2–B2). 11 points.

*The hardest single area in English for learners, and the one where the form is easy and the choice
is brutal. Taught as one idea — **a perfect form links two moments in time** — before any individual
tense.*

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_past_participle` | The third form: regular and irregular past participles | A2 | F | `gr_past_simple_irregular` | Shared prerequisite of the perfect *and* the passive. Teaching it once, explicitly, as its own object saves it being smuggled into two later units. |
| `gr_perfect_concept` | What "perfect" means: a form that connects an earlier event to a later reference point | A2 | F | `gr_past_participle` | **[JUDGEMENT]** Most syllabi skip this and teach three unrelated tenses. Teaching the concept once makes past perfect and future perfect nearly free. |
| `gr_present_perfect` | Present perfect: life experience, present result, unfinished time | A2 | F | `gr_perfect_concept` | Three meanings, taught as three, because they behave differently. |
| `gr_pp_for_since` | `for` vs `since`; `How long…?` | A2 | C | `gr_present_perfect` | |
| `gr_pp_adverbs` | `already`, `yet`, `just`, `still`, `ever`, `never`, `so far`, `recently` | A2 | A | `gr_present_perfect` | |
| `gr_been_vs_gone` | `has been to` vs `has gone to` | B1 | C | `gr_present_perfect` | Small, cheap, permanently confusing. |
| `gr_pp_vs_past_simple` | **Choice:** present perfect vs past simple | A2 | C | `gr_present_perfect`, `gr_past_time_markers` | Rule in §4.1. Owner-named. The highest-traffic choice point in the module. |
| `gr_pp_continuous` | Present perfect continuous: duration and ongoing activity | B1 | F | `gr_present_perfect`, `gr_present_continuous` | |
| `gr_pp_simple_vs_cont` | **Choice:** present perfect simple vs continuous | B1 | C | `gr_pp_continuous`, `gr_stative_verbs` | Rule in §4.2. Owner-named. |
| `gr_past_perfect` | Past perfect: an event earlier than another past event | B1 | F | `gr_perfect_concept`, `gr_past_simple_regular` | |
| `gr_past_perfect_choice` | **Choice:** when the past perfect is *needed* vs when past simple already shows the order | B1 | C | `gr_past_perfect`, `gr_narrative_sequence` | Rule in §4.5. Over-use of the past perfect is as marked as under-use, and nobody teaches that. |

#### U7 — Modality: certainty, obligation and social distance (A2–C1). 12 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_modal_grammar` | How modals behave: bare infinitive, no `-s`, no `do`, no stacking | A2 | F | `gr_aux_system` | Modals *are* auxiliaries, so this is one paragraph if `gr_aux_system` exists and a chapter if it doesn't. |
| `gr_modal_ability` | `can` / `could` / `be able to`; why `be able to` exists (it can go where modals can't) | A1 | F | `gr_modal_grammar` | |
| `gr_modal_permission` | `can` / `may` / `could` / `be allowed to`; the politeness cline | A2 | C | `gr_modal_grammar` | |
| `gr_modal_requests` | Requests and offers: `Could you…`, `Would you mind…`, `Shall I…` | A2 | F | `gr_modal_permission` | |
| `gr_modal_obligation` | `must`, `have to`, `need to`, `should`, `ought to`, `had better` | A2 | F | `gr_modal_grammar` | |
| `gr_must_vs_have_to` | **Choice:** `must` (speaker's own authority) vs `have to` (external rule) | B1 | C | `gr_modal_obligation` | Rule in §4.8. |
| `gr_mustnt_vs_dont_have_to` | **Choice:** `mustn't` (prohibited) vs `don't have to` (optional) | B1 | C | `gr_modal_obligation` | Not a nuance — a meaning inversion. Consistently mis-taught as a pair of synonyms. |
| `gr_modal_possibility` | `may` / `might` / `could` for possibility; the strength cline against `will` and `must` | A2 | C | `gr_modal_grammar` | |
| `gr_modal_deduction_present` | Deduction now: `must be` / `can't be` / `might be`; why `mustn't be` isn't the opposite of `must be` | B1 | C | `gr_modal_possibility` | |
| `gr_modal_past_forms` | Past modality: `had to`, `could` vs `was able to`, `was allowed to` | B1 | F | `gr_modal_obligation`, `gr_past_simple_regular` | Must precede perfect modals, or `must have` gets confused with `had to`. |
| `gr_modal_perfect` | **The forms learners avoid:** `must have`, `can't have`, `might have`, `should have`, `could have`, `needn't have` | B2 | F | `gr_modal_deduction_present`, `gr_past_participle` | §6.3. Owner-named. Systematically avoided because avoidance is invisible — a learner who never says `should have` never makes an error, and never scores for range either. |
| `gr_modal_hedging` | Academic hedging: `may`, `tends to`, `appears to`, `is likely to`, `arguably` | B2 | C | `gr_modal_possibility` | Task 2 lives on this. Unhedged absolute claims are a band-6 signature. |

#### U8 — Voice: active and passive (B1–C1). 9 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_passive_concept` | What the passive does: it changes what the sentence is *about*, not what happened | B1 | F | `gr_past_participle`, `gr_be_present` | §7.1. Framing it as a topic-management device rather than a transformation is the whole game. |
| `gr_passive_forms` | The passive across tenses: `is built`, `was built`, `is being built`, `has been built`, `will be built` | B1 | F | `gr_passive_concept`, `gr_present_perfect` | |
| `gr_passive_when` | **Choice:** the five conditions under which the passive is the *right* choice | B2 | C | `gr_passive_forms` | §7.2. Owner-named, twice. |
| `gr_passive_by_agent` | When to keep `by + agent` and when it is noise | B2 | C | `gr_passive_when` | |
| `gr_passive_process` | Process description: the passive chain, sequencing adverbials, `where`/`which` links | B2 | F | `gr_passive_when` | Academic Task 1 process diagrams are structurally a passive chain. Owner-named. |
| `gr_passive_not` | **When the passive is wrong:** natural processes, agentive human action, and the clarity cost | B2 | C | `gr_passive_when` | The module must not create passive-overusers. Naming the anti-pattern is half the teaching. |
| `gr_passive_reporting` | `It is widely believed that…` / `X is thought to be…` — the impersonal reporting passive | C1 | F | `gr_passive_forms`, `gr_noun_clause_that` | The most valuable single structure in academic writing. Attributes a claim without owning it. |
| `gr_causative` | `have / get something done` | B2 | F | `gr_passive_concept` | |
| `gr_passive_nonfinite` | Passive infinitives and gerunds (`needs to be replaced`, `without being noticed`) | C1 | F | `gr_passive_forms`, `gr_verb_patterns_core` | |

#### U9 — Joining clauses I: coordination and adverbial subordination (A2–B2). 8 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_coordination` | `and / but / or / so`, and the comma rule that goes with them | A1 | F | `gr_capital_fullstop` | |
| `gr_clause_types` | Main clause vs subordinate clause; what makes a fragment | B1 | F | `gr_coordination` | The concept that makes complex sentences teachable at all, and the antidote to fragments. |
| `gr_sub_reason_result` | Reason and result: `because`, `since`, `as`, `so`, `therefore`, `consequently` | A2 | C | `gr_clause_types` | The conjunction/adverb split (`because` joins clauses, `therefore` starts a sentence) is where comma splices are born. |
| `gr_sub_contrast` | Contrast: `although`, `even though`, `while`, `whereas` | B1 | F | `gr_clause_types` | |
| `gr_despite_although` | **Choice:** `despite / in spite of` + noun or `-ing` vs `although` + clause | B1 | C | `gr_sub_contrast`, `gr_gerund_after_prep` | *Despite he was tired* — top-five B1 written error. |
| `gr_sub_time` | Time clauses: `when`, `while`, `as`, `before`, `after`, `until`, `as soon as` | A2 | F | `gr_clause_types`, `gr_future_time_clause` | |
| `gr_sub_purpose` | Purpose: `to`, `in order to`, `so as to`, `so that` | B1 | C | `gr_clause_types` | `so that` + clause vs `to` + infinitive — depends on whether the subject changes. |
| `gr_so_such_too_enough` | Degree and result: `so…that`, `such…that`, `too…to`, `enough…to` | B1 | C | `gr_clause_types` | |

#### U10 — Conditionals and the unreal past (A2–C1). 10 points.

*Taught as **two systems**, not four types — see §5.*

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_cond_zero` | Zero conditional: general truths, rules, scientific and procedural statements | A2 | F | `gr_present_simple`, `gr_sub_time` | |
| `gr_cond_first` | First conditional: a real future possibility and its consequence | A2 | F | `gr_cond_zero`, `gr_future_will`, `gr_future_time_clause` | |
| `gr_cond_first_uses` | What the first conditional *does*: warning, promise, threat, offer, negotiation, policy argument | B1 | C | `gr_cond_first` | The form is trivial; the functions are why anyone needs it. Task 2 argument runs on it. |
| `gr_unreal_past` | **The distancing principle:** shifting a verb back one step signals *unreal*, not *past* | B1 | F | `gr_past_simple_regular`, `gr_past_perfect` | §5.2. The single idea behind second conditional, third conditional, `wish`, `if only`, `it's time`, `would rather` and polite distancing. Teach it once, spend it six times. **[JUDGEMENT]** |
| `gr_cond_second` | Second conditional: unreal or unlikely present/future — hypothesis, advice, speculation | B1 | F | `gr_unreal_past`, `gr_modal_grammar` | |
| `gr_cond_second_uses` | `If I were you…` for advice; hypothetical policy argument; softened suggestion | B1 | C | `gr_cond_second` | |
| `gr_cond_third` | Third conditional: an alternative past — regret, criticism, counterfactual analysis | B2 | F | `gr_unreal_past`, `gr_past_perfect`, `gr_modal_perfect` | |
| `gr_cond_mixed` | Mixed conditionals: past condition → present result, and present condition → past result | B2 | C | `gr_cond_second`, `gr_cond_third` | The point at which "the four types" collapses and the two-system model pays off. |
| `gr_cond_alternatives` | `unless`, `provided that`, `as long as`, `in case`, `otherwise`, `even if`, `supposing` | B2 | C | `gr_cond_first` | `unless` ≠ `if not` in every case, and learners assume it is. |
| `gr_wish_family` | `wish` / `if only` / `it's (high) time` / `would rather` — the same unreal past, three more places | B2 | F | `gr_unreal_past` | Free, once §5.2 exists. |

#### U11 — Joining clauses II: relative and noun clauses (B1–C1). 10 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_relative_defining` | Defining relative clauses: `who`, `which`, `that`, `whose`, `where`, `when` | B1 | F | `gr_clause_types` | The workhorse of complex sentences and the cheapest route out of short simple sentences. |
| `gr_relative_omission` | Dropping the relative pronoun when it is the object | B1 | C | `gr_relative_defining` | |
| `gr_relative_nondefining` | Non-defining relative clauses, the commas, and why `that` is banned in them | B2 | C | `gr_relative_defining` | The comma changes the *meaning*, not the punctuation. Taught as a meaning point. |
| `gr_relative_prepositions` | `the city in which…`, `a group of whom…` — formal preposition placement | C1 | C | `gr_relative_defining` | Register choice: fronted preposition = academic, stranded = spoken. |
| `gr_relative_quantifier` | `many of which`, `some of whom`, `the majority of which` | C1 | F | `gr_relative_prepositions`, `gr_quantifiers_fine` | High-value in Task 1 and Task 2; compresses two sentences into one. |
| `gr_relative_which_clause` | `which` referring back to a whole clause (`…, which suggests that…`) | B2 | F | `gr_relative_nondefining` | The commentary move that turns data into analysis. |
| `gr_participle_clause` | Reduced relatives and participle clauses (`the policy introduced in 2019`, `having reviewed the data`) | C1 | F | `gr_relative_defining`, `gr_passive_forms` | The main densifier of academic prose. |
| `gr_noun_clause_that` | `that`-clauses as subject and object (`The fact that… / It is clear that…`) | B1 | F | `gr_clause_types` | Prerequisite for reported speech, the reporting passive, and every stance structure. |
| `gr_embedded_question` | Indirect/embedded questions: statement word order after the wh-word | B1 | A | `gr_questions_wh`, `gr_noun_clause_that` | Criterial for B1 in the corpus work (**[M]**), and the strict prerequisite of reported questions. |
| `gr_cleft` | Cleft sentences and fronting for emphasis (`What matters is…`, `It is X that…`) | C1 | F | `gr_noun_clause_that` | Track C in practice; listed here because it belongs to this grammar family. |

#### U12 — Verb patterns: gerunds, infinitives and what follows what (B1–C1). 8 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_verb_patterns_core` | Verb + `to`-infinitive vs verb + `-ing`: the high-frequency lists, learned as chunks | B1 | A | `gr_present_simple` | Lexico-grammatical: not rule-derivable, so it is SRS material, not explanation material. §8.6. |
| `gr_gerund_after_prep` | After a preposition, always `-ing` | B1 | A | `gr_verb_patterns_core` | The one hard rule in the area. Also the fix for `despite`. |
| `gr_verb_obj_infinitive` | Verb + object + infinitive (`allow people to…`, `encourage students to…`) | B1 | F | `gr_verb_patterns_core` | The backbone of Task 2 policy sentences. |
| `gr_meaning_change_verbs` | Verbs where the pattern changes the meaning: `remember`, `forget`, `stop`, `try`, `regret`, `mean`, `go on` | B2 | C | `gr_verb_patterns_core` | |
| `gr_gerund_subject` | `-ing` as subject (`Reducing emissions requires…`) | B2 | F | `gr_verb_patterns_core` | The most natural abstract subject available to a B2 learner. |
| `gr_infinitive_purpose` | Infinitive of purpose, and why `for + -ing` is not its substitute | B1 | C | `gr_sub_purpose` | *For to improve* / *for improving my English* — very common. |
| `gr_adj_prep_patterns` | Adjective + preposition + `-ing` (`responsible for cutting`, `capable of adapting`) | B2 | A | `gr_gerund_after_prep` | |
| `gr_causative_verbs` | `make`, `let`, `have`, `get`, `help` + object + verb form | B2 | A | `gr_verb_obj_infinitive` | Each takes a different form; a five-item closed set worth memorising. |

#### U13 — Reported speech and reporting (B1–C1). 6 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_reported_statements` | Reporting statements; backshift; pronoun, time and place shifts | B1 | F | `gr_noun_clause_that`, `gr_past_perfect` | |
| `gr_backshift_choice` | **Choice:** when *not* to backshift — still true, general truth, recent report | B2 | C | `gr_reported_statements` | Backshift is optional far more often than courses admit, and mechanical backshift sounds odd. |
| `gr_reported_questions` | Reported questions: no `do`, no inversion, `if/whether` for yes-no | B1 | A | `gr_reported_statements`, `gr_embedded_question` | |
| `gr_reported_commands` | Reported commands and requests: `told/asked + object + to` | B1 | F | `gr_verb_obj_infinitive` | |
| `gr_reporting_verbs` | Reporting verbs with their patterns: `suggest that`, `admit -ing`, `deny`, `claim`, `argue`, `point out`, `propose`, `warn against` | B2 | C | `gr_reported_statements`, `gr_verb_patterns_core` | The verb *chosen* encodes the writer's stance. This is where reporting becomes argument. |
| `gr_reporting_academic` | Attribution in academic writing: `Critics argue that…`, `It has been suggested that…` | C1 | F | `gr_reporting_verbs`, `gr_passive_reporting` | Task 2 and Reading paraphrase-recognition both run on this. |

---

### TRACK C — BAND-7 POLISH (B2 → C1). Units 14–17, 36 points.

*Entry condition: **Track B complete AND the learner's error rate on Track B production is below a
threshold.** Thesis 1.5 — this gate is not decoration. A learner who is still producing article and
agreement errors gets sent back to U15, not forward to inversion.*

#### U14 — Comparison, degree and describing data (A2–B2). 7 points.

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_comparatives` | Comparative and superlative adjectives and adverbs; spelling; irregulars | A1 | F | `gr_adjective_position` | Listed in Track C by unit number only — **it is scheduled in Track A/B**, see §9.2. |
| `gr_as_as` | `as…as`, `not as…as`, `the same as`, `similar to`, `different from` | A2 | A | `gr_comparatives` | `*as same as`, `*different than` — persistent. |
| `gr_comparative_grading` | Grading a comparison: `far`, `much`, `slightly`, `considerably`, `marginally`, `nowhere near` | B2 | C | `gr_comparatives` | Precision of degree is a genuine band-7 marker and costs nothing to learn. |
| `gr_double_comparative` | `the more…, the more…`; `increasingly` | B2 | F | `gr_comparatives` | |
| `gr_multiples` | `twice as many`, `three times higher`, `more than double`, `a tenfold increase` | B2 | C | `gr_as_as` | Academic Task 1 arithmetic-in-words. |
| `gr_change_language` | The grammar of change: `rise in` vs `rise to` vs `rise by`, `from…to`, `peak at`, `level off` | B2 | A | `gr_prepositions_dependent` | Dependent prepositions here are the most error-dense square inch of Task 1. |
| `gr_superlative_hedge` | `one of the largest`, `among the most` + plural noun | B2 | A | `gr_comparatives` | `*one of the largest city` — endemic. |

#### U15 — Accuracy under load: the error-dense areas (B1–C1). 12 points.

*This unit is not new grammar. It is the set of points that corpus evidence says learners get wrong
most often, gathered so they can be drilled deliberately rather than hoped for. **[H]** on the
selection: articles, tense selection, subject-verb agreement, prepositions and countability are the
recurring top categories across learner-corpus studies.*

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_sv_agreement_core` | Subject-verb agreement basics | A1 | A | `gr_third_person_s` | |
| `gr_sv_agreement_hard` | The hard cases: long subjects with intervening phrases, `each/every`, `neither…nor`, `a number of` vs `the number of`, collective nouns, `there is/are` + list | B2 | A | `gr_sv_agreement_core`, `gr_relative_defining` | Agreement errors rise sharply as sentences get longer — so they are a *side effect* of the complexity Track C encourages, and must be drilled alongside it. |
| `gr_comma_splice` | The comma splice, the run-on, and the fragment: three ways to break a sentence boundary | B1 | A | `gr_capital_fullstop`, `gr_clause_types` | The most damaging punctuation error in Task 2 because it makes the examiner re-read. |
| `gr_comma_rules` | Commas: fronted adverbial, non-defining clause, list, and the comma that must *not* appear (between subject and verb) | B2 | A | `gr_comma_splice`, `gr_relative_nondefining` | |
| `gr_punctuation_rest` | Semicolon, colon, apostrophe (possessive vs contraction vs plural), capitalisation, quotation | B2 | A | `gr_comma_rules`, `gr_possessive` | `*1990's` for a decade; `*Its important` — small, visible, cheap to fix. |
| `gr_prepositions_core` | `in / on / at` for time and place | A1 | A | `gr_word_order_place_time` | Listed here, **scheduled in Track A** (§9.2). |
| `gr_prepositions_dependent` | Dependent prepositions on verbs, adjectives and nouns (`depend on`, `result in`, `aware of`, `an increase in`, `a solution to`) | B2 | A | `gr_prepositions_core` | Not rule-governed. SRS material, chunk-learned with the vocabulary deck. §8.3. |
| `gr_prepositions_phrases` | Prepositional phrases as adverbials, and where they sit | B2 | A | `gr_prepositions_core` | |
| `gr_word_order_adverbs` | Adverb placement: mid-position, end-position, and what may not be split | B2 | A | `gr_adverb_frequency` | `*I like very much this idea` — an ordering error, not a vocabulary error. |
| `gr_dummy_subjects` | `it` vs `there` as subject; `It is important to…`, `There has been a rise in…` | B1 | C | `gr_there_is` | Two of the most useful sentence openers in Task 2, and constantly swapped. |
| `gr_ed_ing_adjectives` | `-ed` vs `-ing` adjectives (`concerned` / `concerning`) | B1 | C | `gr_adjective_position` | |
| `gr_confusable_pairs` | The lexico-grammatical minefield: `affect/effect`, `rise/raise`, `lie/lay`, `advice/advise`, `practice/practise`, `economic/economical` | B2 | A | `gr_countability` | Every one of these appears in Task 1 or Task 2 topics this pack already covers. |

#### U16 — Cohesion and text grammar (B2–C1). 9 points.

*Grammar above the sentence. The owner named "linking and cohesion"; this unit is deliberately
larger than "a list of connectors", because a list of connectors is exactly what produces the
mechanical band-6 essay.*

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_reference_pronoun` | Referring back clearly: pronouns, `this`/`these`, `such`, and the ambiguous-reference trap | B2 | A | `gr_demonstratives` | Vague `this` is a coherence error the learner cannot see. |
| `gr_substitution_ellipsis` | Substitution and ellipsis: `one`, `do so`, `so`, `neither`, and leaving words out | B2 | F | `gr_short_answers` | The natural alternative to repetition, and almost never taught to IELTS candidates. |
| `gr_linkers_by_function` | Linking adverbials organised by function: add, contrast, cause, result, exemplify, concede, sequence, summarise | B1 | C | `gr_sub_reason_result` | Organised by *function*, never as an alphabetical list. |
| `gr_linker_restraint` | **When not to use a linker** — the mechanical-connector anti-pattern | B2 | C | `gr_linkers_by_function` | Over-signposting is explicitly penalised at band 6 (**[H]**), and every prep site on the internet teaches the opposite. This point exists to undo that. |
| `gr_given_new` | Old information first, new information last; end-weight | C1 | C | `gr_passive_when` | The real reason the passive exists (§7.2 condition 3), and the difference between a paragraph that flows and one that lurches. |
| `gr_topic_sentence_grammar` | The grammar of a topic sentence: abstract subject + stance verb | B2 | F | `gr_gerund_subject`, `gr_noun_clause_that` | |
| `gr_nominalisation` | Turning verbs and clauses into noun phrases (`prices rose sharply` → `the sharp rise in prices`) | C1 | C | `gr_gerund_subject`, `gr_prepositions_dependent` | The density engine of academic register — and the thing that most changes how a Task 2 essay *sounds*. Comes with an explicit warning about over-nominalising into unreadability. |
| `gr_noun_phrase_expansion` | Pre- and post-modification: building a long precise noun phrase | C1 | F | `gr_participle_clause`, `gr_relative_defining` | |
| `gr_parallel_structure` | Parallelism in lists and comparisons | B2 | A | `gr_coordination` | Visible, mechanical, easy to mark, easy to fix. |

#### U17 — Range without wreckage: the band-7 structures (B2–C1). 8 points.

*Every point here is optional and each one carries an explicit risk note. Thesis 1.5.*

| id | Point | CEFR | Δ | Pre | Why it is here |
|---|---|---|---|---|---|
| `gr_inversion_negative` | Inversion after negative adverbials (`Not only…`, `Rarely…`, `Under no circumstances…`) | C1 | F | `gr_aux_system` | Trivial *if* the auxiliary system is explicit; impossible otherwise. Thesis 1.2 pays off here. |
| `gr_inversion_conditional` | Conditional inversion (`Had the policy been introduced earlier…`) | C1 | F | `gr_cond_third`, `gr_inversion_negative` | |
| `gr_concession_structures` | Conceding then rebutting: `While it is true that…`, `Admittedly…, however…`, `granted` | B2 | C | `gr_sub_contrast` | The structure of a band-7 Task 2 body paragraph. Higher value than inversion and lower risk. |
| `gr_emphasis_structures` | Cleft sentences and fronting in production | C1 | F | `gr_cleft` | |
| `gr_stance_adverbials` | Stance and evaluation: `arguably`, `crucially`, `to a large extent`, `on balance` | B2 | C | `gr_modal_hedging` | |
| `gr_complex_sentence_control` | Building a two-clause and three-clause sentence deliberately, and knowing when to stop | B2 | C | `gr_relative_defining`, `gr_sub_contrast`, `gr_comma_rules` | The actual band-7 skill: *variety* of sentence length, most of them clean. |
| `gr_spoken_vs_written_grammar` | Register: contractions, phrasal verbs, `get`-passives and fronting are right in Speaking and wrong in Task 2 — and vice versa | B2 | C | `gr_passive_when`, `gr_linkers_by_function` | A gap nobody fills. Learners transplant essay grammar into Part 1 and sound robotic, or spoken grammar into Task 2 and lose marks. §8.13. |
| `gr_error_triage` | Self-editing: the four checks to run in the last three minutes, in priority order | B2 | A | `gr_sv_agreement_hard`, `gr_article_decision`, `gr_comma_splice` | Turns the whole module into a procedure the learner can execute under exam pressure. |

**Totals: 17 units · 154 points · Track A 44 · Track B 74 · Track C 36 · 50 choice points ·
104 form/accuracy points.** (Counts machine-verified against the tables above, 2026-07-31.)

---

## 3. All the tenses — organised by what they do

**Design rule: the twelve-cell grid never appears as a teaching object.** It may appear once, at the
end of U6, as a *review* artefact, clearly labelled "you already know all of this". **[JUDGEMENT],
overriding the near-universal convention (§0.5 O3).** The grid teaches learners to think of tense as
a lookup table; the actual skill is choosing a meaning.

English verb forms combine **three independent dials**. Teach the dials, and the twelve forms are
consequences rather than facts.

| Dial | Options | What it encodes |
|---|---|---|
| **Time** | present / past / future | Where the reference point sits |
| **Aspect: perfect?** | yes / no | Is this connected *back* to an earlier moment? |
| **Aspect: continuous?** | yes / no | Am I viewing this as an activity in progress rather than a whole event? |

Two dials × three times = twelve forms. A learner who has `gr_perfect_concept` and
`gr_present_continuous` has already met both dials by the middle of Track B, and every remaining
"tense" is one dial turn from something they know.

### 3.1 The twelve, by the job they do

| Form | The job it does | Time it points at | Unit |
|---|---|---|---|
| Present simple | Permanent situations, habits, facts, states; timetabled future; procedural/scientific statement | Now, generally, or always | U2 |
| Present continuous | In progress now; temporary; a developing trend; a fixed arrangement ahead | Around now, or a planned future | U2 |
| Present perfect | An earlier event with present relevance: experience, present result, unfinished period | Past event, present reference point | U6 |
| Present perfect continuous | The duration or ongoing nature of something reaching up to now, often explaining a present state | Past through to now | U6 |
| Past simple | A completed event in a finished time; a past state; a step in a narrative chain | A closed past | U3 |
| Past continuous | The situation already in progress when something else happened; setting a scene | A past stretch | U3 |
| Past perfect | An event earlier than the past moment being talked about | Past-before-past | U6 |
| Past perfect continuous | Duration up to a past moment, usually explaining a past state | Past stretch before a past point | U6 |
| Future (`will`) | Prediction from knowledge or belief; decision made as you speak; offer, promise, refusal | Ahead | U4 |
| Future continuous | In progress at a future moment; also a *neutral* future asking about arrangements without pressure | Ahead, mid-event | U4 |
| Future perfect | Completed before a future point — projections, deadlines, targets | Ahead, looking back | U4 |
| Future perfect continuous | Duration up to a future point | Ahead, looking back over a stretch | Recognition only |

**What I cut and why.** Future perfect continuous is recognition-only: I found no natural place for
it in any of the four skills, and a productive target that never gets produced is dead weight. Past
perfect continuous is Track B but low-priority. `shall` survives only in `Shall I…?` offers.
**[JUDGEMENT]**

### 3.2 The three things about tense nobody tells learners

1. **Tense is a choice about presentation, not a report of when something happened.** *The
   population grew* and *the population has grown* describe the same events; they differ in whether
   the speaker is treating the period as closed. Once a learner accepts this, the choice rules stop
   feeling arbitrary. This framing goes in `gr_perfect_concept`.
2. **The continuous is about the speaker's viewpoint, not about duration.** *I'm living in Marlow*
   and *I live in Marlow* can both be true for ten years; the first frames it as temporary.
3. **English uses present forms for the future constantly.** Timetables, arrangements, and every
   subordinate time clause and conditional. Learners who believe "future = will" produce
   `*when I will arrive` for years.

---

## 4. The choice points — decision rules a learner can apply mid-sentence

**Format requirement for the design agent.** Every choice point ships with exactly five parts, and
this is the module's equivalent of reading's *worked solution + distractor autopsy*:

| # | Part | What it is |
|---|---|---|
| 1 | **The question** | One question the learner asks themselves *while speaking or writing*. Not a rule — a question with an answer they can actually get at. |
| 2 | **The fork** | What each answer to the question selects |
| 3 | **The minimal pair** | Two sentences differing only in the target form, with the meaning difference spelled out |
| 4 | **The wrong-choice note** | What the other form would *communicate* here — not "it's wrong", but "it would mean this instead" |
| 5 | **The edge case** | The one exception worth knowing, and an explicit "ignore the rest" |

Below, parts 1 and 2 for the **20 highest-traffic choice points** — every one the owner named, plus
the ones I added that carry the most marks. Content agents write parts 3–5 for these and author all
five parts for the remaining 30 choice points marked `C` in §2, using the same five-part shape. **The
lint is: a point flagged as a choice point must have all five parts, or it fails the merge gate.**

### 4.1 Present perfect vs past simple *(owner-named — the highest-traffic rule in the module)*

> **Ask: is the time period I am talking about finished?**

- Finished period (`yesterday`, `in 2019`, `last month`, `when I was a student`) → **past simple**.
- Period still open or not specified (`today`, `this year`, `so far`, `ever`, `in my life`,
  `since 2019`) → **present perfect**.

**The stronger test, because it needs no time expression:** the present perfect *refuses* a specific
finished past time. If you can attach "…at 3pm on Tuesday" without the sentence breaking, you are in
past simple.

**The pattern that makes it feel natural — the zoom-in.** Present perfect opens a topic; past simple
supplies the detail. *I've visited three of the coastal reserves. The one at Sandmouth was the best
organised.* Teach this as a two-sentence move, because it is how the pair actually behaves in
speech, and Speaking Part 1 answers are built from it. **[H]**

**Edge case, stated once and then dropped:** American English tolerates past simple where British
English prefers the present perfect (`Did you eat yet?`). Our content is British-standard; mention
it so learners exposed to US media aren't confused, then move on.

### 4.2 Present perfect simple vs continuous *(owner-named)*

> **Ask: am I pointing at a result, or at the activity itself?**

- Result, completion, quantity, "how many/how much" → **simple**. *I've written two of the three
  sections.*
- Duration, ongoing activity, or explaining a state you can see right now → **continuous**.
  *I've been writing since seven — that's why the desk looks like this.*

Secondary tests, in order of usefulness: a **countable result** pushes simple; **`How long…?`**
pushes continuous; a **stative verb** forbids continuous outright (so `gr_stative_verbs` is a
prerequisite, not a nicety).

### 4.3 Past simple vs past continuous *(owner-named)*

> **Ask: is this the event, or the setting the event happened inside?**

- The setting — longer, already running → **past continuous**.
- The event — shorter, complete, it *lands* → **past simple**.

**Two-word test:** if `while` fits in front, it's continuous; if `then` or `suddenly` fits, it's
simple. **The hard half nobody teaches:** a sequence of completed events is *all past simple*.
Learners who over-learn the continuous narrate an entire story in it. Say so explicitly.

### 4.4 will vs going to vs present continuous vs present simple *(owner-named)*

> **Ask: where does this future live — in my head right now, in my intention, in the diary, or on a
> timetable?**

| Where it lives | Form | Example type |
|---|---|---|
| Decided **as I speak** — offer, promise, refusal, instant reaction | `will` | *I'll email the coordinator this afternoon.* |
| Prediction from **belief or knowledge** | `will` (+ hedge in writing) | *Coastal cities will face higher insurance costs.* |
| Prediction from **evidence in front of me** | `going to` | *The queue isn't moving — we're going to miss the session.* |
| An **intention** already formed, no fixed arrangement | `going to` | *I'm going to apply for the graduate scheme.* |
| An **arrangement**, with a time and usually another person | present continuous | *I'm meeting my supervisor at four.* |
| A **timetable** fixed by an institution | present simple | *The last bus leaves at eleven.* |

**Mid-sentence shortcut:** *Can I point at the evidence right now?* → `going to`. *Am I deciding as I
speak?* → `will`. *Is it in the diary with someone else?* → present continuous.

**Register note the module must carry (skill hook):** in Task 2, predictions take `will` plus a hedge
(`will probably`, `is likely to`), not `going to`. `going to` is a spoken-register form and reads as
informal in academic writing. This is exactly the kind of "where" the owner asked for. **[M]**

### 4.5 Past simple vs past perfect *(added)*

> **Ask: is the order of the two past events already obvious?**

If a time word (`before`, `after`, `then`) or the natural sequence already makes the order clear,
past simple is enough and the past perfect is unnecessary weight. Use the past perfect when you are
**going back** out of sequence — flashback, explanation, or a cause discovered after the effect.
Over-use is as marked as under-use. **[M]**

### 4.6 Present simple vs present continuous *(added — foundation for §4.1)*

> **Ask: is this how things generally are, or what is happening around now?**
Plus the hard gate: if the verb is stative, the continuous is not available regardless of meaning.

### 4.7 used to vs would vs past simple *(owner-named)*

> **Ask two questions in order. (1) Is it a state? (2) Have I already established the past scene?**

- **A past state** that is no longer true → `used to` only. *There used to be a ferry from the
  harbour.* **`would` cannot carry a state** — this is the rule that decides most cases.
- **A repeated past action**, with the past time frame already set up → `would` is available, and
  reads as reflective or nostalgic. *Every summer we would walk the ridge path before breakfast.*
- **A single event, or a stated frequency, or no "not any more" contrast** → past simple. *I went
  three times that year.*

`used to` carries an implication: **not any more**. If that implication is false, don't use it.

**Taught adjacent, because it is the same words and a different structure entirely:** `be used to`
(= accustomed to) and `get used to` (= becoming accustomed), both followed by a noun or `-ing`.
Learners conflate all three. Putting them side by side is the only reliable fix. **[H]**

### 4.8–4.20 The remaining choice points, in one line each

| # | Choice | The question to ask |
|---|---|---|
| 4.8 | `must` vs `have to` | Is the obligation mine, or imposed from outside? |
| 4.9 | `mustn't` vs `don't have to` | Am I forbidding it, or saying it isn't required? (Opposite meanings.) |
| 4.10 | Active vs passive | Who or what should this sentence be *about*? (§7.2) |
| 4.11 | `a` / `the` / zero | (1) Countable and singular? (2) Can the listener identify which one I mean? (3) Am I talking about the category in general? — §8.1 |
| 4.12 | `few` vs `a few`, `little` vs `a little` | Am I emphasising the shortage, or the existence? |
| 4.13 | `although` vs `despite` | Is what follows a full clause, or a noun/`-ing`? |
| 4.14 | `so that` vs `to` (purpose) | Does the subject change between the two halves? |
| 4.15 | Defining vs non-defining relative | Does the clause tell you *which one*, or just add information? (Commas follow the answer.) |
| 4.16 | Gerund vs infinitive after `remember/stop/try/regret/mean/go on` | Which came first — the thinking or the doing? |
| 4.17 | Backshift or not in reported speech | Is it still true now? |
| 4.18 | Which conditional | What am I claiming about reality? (§5.3) |
| 4.19 | `it` vs `there` as subject | Am I introducing existence (`there`), or commenting on something (`it`)? |
| 4.20 | Linker or no linker | Would a reader be lost without it? If not, cut it. (`gr_linker_restraint`) |

---

## 5. Conditionals — taught as two systems, not four types

### 5.1 Why the numbers are the wrong organising principle

"First/second/third conditional" is a teaching convention, not a fact about English, and it fails at
exactly the moment learners need it: mixed conditionals, `wish`, `if only`, `it's time`,
`would rather`, polite distancing and conditional inversion are all the *same* machinery, and none
of them has a number. **[JUDGEMENT] — §0.5 O4.** We keep the labels, because learners arrive with
them and the rest of the internet uses them, but we teach the systems and apply the labels
afterwards.

### 5.2 The two systems

**System 1 — REAL.** The speaker treats the condition as genuinely possible. Verb forms behave
normally; the only special rule is that the `if`-clause takes a **present** form even for future
time (which is `gr_future_time_clause`, already taught).
- **Zero conditional** (present + present): this is always what happens. Rules, scientific
  processes, procedures, cause-and-effect generalisations. `if` ≈ `when`.
- **First conditional** (present + `will`/modal/imperative): a specific future possibility and its
  consequence.

**System 2 — UNREAL.** The speaker signals *this is not the case*. Achieved by one mechanism:
**shift the verb one step further back than the time you mean.** That backward shift does not mean
past time — it means **distance from reality**. This is `gr_unreal_past`, taught once and spent six
times.

| You mean | You use | Result |
|---|---|---|
| Unreal **now / future** | past form | second conditional |
| Unreal **past** | past perfect | third conditional |
| Unreal past cause → unreal present result | past perfect + `would` | mixed (backward) |
| Unreal present cause → unreal past result | past + `would have` | mixed (forward) |

The same shift, outside `if`: `I wish I knew` (now), `I wish I had known` (past), `It's time we
left`, `I'd rather you didn't`, and the politeness shift in `I was wondering whether…`. Teaching
`gr_unreal_past` before the second conditional makes all of these one lesson instead of six. **[H]**
on the linguistic claim; **[M]** that teaching it this way is measurably better — it is my judgement,
supported by the fact that the distancing analysis is standard in descriptive grammar.

### 5.3 What each conditional is *for* — the part that makes them worth learning

| Type | Real-world job | Where it pays off in this app |
|---|---|---|
| Zero | State a rule, a mechanism, a physical or social regularity | Academic Task 1 process descriptions; Reading science passages |
| First | Warn, promise, threaten, offer, negotiate; **argue that a policy will have an effect** | Task 2 argument body paragraphs; Speaking Part 3 |
| Second | Hypothesise; give advice (`If I were you`); speculate about an imagined situation; **soften a suggestion** so it isn't a demand | Speaking Part 3 hypotheticals ("what would happen if…"); Task 2 counterfactual argument |
| Third | Regret; criticise after the event; analyse what would have followed from a different past | Speaking Part 2 reflection; Task 2 historical analysis |
| Mixed | Connect a past cause to a present state, or a present state to a past outcome — **the most analytically useful of the five and the least taught** | Part 3 "looking back" answers; Task 2 cause-and-consequence |

**Uses learners are almost never shown, and which we will teach:** the second conditional as
*politeness* (`It would help if you could send the figures` is a request, not a hypothesis); the
first conditional as *negotiation*; the third conditional as *criticism* without accusation
(`A shorter consultation would have avoided the delay`).

**`unless` warning (`gr_cond_alternatives`):** `unless` means *except if*, and it does not
substitute for `if…not` in every context — it is wrong where the condition is a hypothetical
consequence rather than an exception (`I'd be surprised if she didn't accept`, not `*unless she
accepted`). Teach `unless` as a restricted tool. **[M]**

---

## 6. Modals — the certainty scale, the obligation scale, and the past

### 6.1 Teach modals as two scales, not two lists

Every modal a learner needs sits on one of two clines. Presenting them as clines makes "when to use
which" visible, which a list never does.

**Certainty (how sure am I?):**
`will / must` (certain) → `should / ought to` (expected) → `may / might / could` (possible) →
`may not / might not` (possibly not) → `can't / couldn't` (impossible)

Two traps, both worth a point of their own: `must` and `can't` are the *opposite ends*, not `must`
and `mustn't`; and `may not` (= possibly not) is not `cannot` (= impossible).

**Obligation (how strong is the pressure, and where does it come from?):**
`must / have to` (required) → `need to` (necessary) → `should / ought to` (advisable) →
`had better` (advisable, with a threat attached) → `could` (an option) → `don't have to` (optional) →
`mustn't` (forbidden)

The **source** dimension crosses this: `must` is the speaker's own authority (and in writing, the
writer's argument — *governments must act*), `have to` is an external rule. That distinction is what
makes `must` the right modal in a Task 2 recommendation and `have to` the right one in a description
of regulation. **[M]**

### 6.2 Ability, permission, requests

- **Ability:** `can` / `could`; `be able to` exists to fill the slots modals can't reach (after
  another modal, as an infinitive, in the perfect). The `could` vs `was able to` split — general
  past ability vs one successful occasion — is a genuine choice point.
- **Permission:** `can` (neutral) / `could` (tentative) / `may` (formal) / `be allowed to`
  (reporting a rule).
- **Requests:** the politeness ladder, and the fact that it is built out of the same distancing
  mechanism as §5.2 (`Could you…` is more distant, therefore more polite, than `Can you…`). Point
  this out — it turns two unrelated-looking areas into one idea.

### 6.3 The past forms learners systematically avoid *(owner-named)*

**`gr_modal_perfect` is the most under-taught high-value point in the module.** The avoidance is
invisible: a learner who never says *should have* never makes an error with it, and so no teacher
ever corrects it — but they also never score for range, and they cannot express regret, retrospective
criticism, or a deduction about the past at all.

| Form | What it means | A situation it belongs in |
|---|---|---|
| `must have` | I deduce this happened — I'm nearly certain | Explaining evidence: *The path must have flooded overnight.* |
| `can't have` / `couldn't have` | I deduce this did **not** happen | The negative of `must have` — **never `mustn't have`** |
| `might have` / `may have` / `could have` | It possibly happened | Hedged explanation in academic writing |
| `should have` | It didn't happen and it should have — regret or criticism | Reflection in Speaking Part 2; retrospective policy critique in Task 2 |
| `could have` (second sense) | It was possible and didn't happen | Missed opportunity — distinct from the deduction sense, and worth separating |
| `needn't have` | It happened but was unnecessary | Contrast with `didn't need to` (it didn't happen) — a real trap |

Two errors to pre-empt by name: `*can have` for past speculation (positive speculation is
`could have`, though the negative `can't have` is fine), and confusing `must have` (deduction) with
`had to` (past obligation). **[H]**

### 6.4 Hedging — modality as academic register *(added)*

`gr_modal_hedging` is a modality point wearing writing clothes. A band-6 Task 2 asserts
(*Technology destroys community life*); a band-7 Task 2 calibrates (*Technology may be weakening
community ties, at least in urban areas*). The tools are modal (`may`, `might`, `could`), semi-modal
(`tends to`, `appears to`, `is likely to`), and adverbial (`arguably`, `to some extent`,
`in most cases`). Learners are rarely told that hedging is *grammar*, so they never practise it as
grammar. We will.

---

## 7. Voice — and specifically when the passive is right

### 7.1 Frame the passive correctly on first contact

**Do not teach the passive as a transformation of the active.** Transformation drills
(*rewrite in the passive*) produce learners who can convert sentences and cannot decide. Teach it as
what it is: **a device for choosing what the sentence is about.** English strongly prefers the topic
in subject position; the passive is how you get it there when the topic is not the doer.

### 7.2 The five conditions — when the passive is the right choice *(owner-named)*

The passive is *correct* whenever the form is right. It is **the right choice** when one of these
holds. If none holds, the active is better and the passive costs clarity.

| # | Condition | Signal | Example type |
|---|---|---|---|
| 1 | **The agent is unknown, obvious or irrelevant** | You would have written "someone", "people" or "they" | *The sluice gates are opened twice a day.* |
| 2 | **The process matters more than the operator** — a manufactured or engineered sequence | You are describing steps, not people | *The pulp is pressed into sheets and left to dry.* |
| 3 | **Topic continuity** — this sentence's topic is the previous sentence's object | The subject you want is not the doer | *The proposal was submitted in March. It was rejected six weeks later.* |
| 4 | **Formality and impersonality** — the institutional or scientific voice | You want no `I`/`we` and no accusation | *Applicants are notified by email.* |
| 5 | **End-weight** — the agent is long and belongs at the end | The doer is a heavy noun phrase | *The scheme was funded by a consortium of regional transport authorities.* |

**Condition 3 is the one that matters most and is almost never taught.** It is the same principle as
`gr_given_new`, which is why those two points are linked in the graph. The passive is not primarily a
formality device; it is primarily an **information-ordering** device, and formality is a side effect.
**[M] — the sources emphasise conditions 1, 2 and 4; condition 3 is standard in discourse grammar and
is my priority ranking.**

### 7.3 The Task 1 process hook *(owner-named)*

Academic Task 1 process diagrams are structurally a passive chain: `gr_passive_process` teaches the
whole package — present simple passive throughout, sequencing adverbials (`initially`,
`at this stage`, `once X has been Y-ed`), relative and participle links between stages, and a
consistent grammatical subject that tracks the material through the process. This is the single
clearest case in the whole module of a grammar point that exists because a task demands it.

### 7.4 When the passive is wrong *(added — and it must be in the module)*

- **Natural processes with a natural agent take the active.** *Water evaporates*, not
  *\*water is evaporated*, unless something is evaporating it. Learners taught "use the passive for
  processes" produce exactly this error. **[H]**
- **When the doer is the point**, the passive buries it: *Councils cut the budget* says something
  *The budget was cut* does not.
- **Chained passives are unreadable.** Three in a row and the reader has lost the thread. Mixed
  voice reads better than uniform passive, and the module should say so where every prep site says
  the opposite.
- **`get`-passives** (*it got cancelled*) are spoken register — correct in Speaking, wrong in Task 2.
  A `gr_spoken_vs_written_grammar` case.

---

## 8. Everything else a zero-knowledge learner needs — including what the owner missed

The owner listed: articles, countability, prepositions, relative clauses, gerunds vs infinitives,
reported speech, comparatives, quantifiers, word order, subject-verb agreement, punctuation, linking
and cohesion. All are in §2. §8.1–8.9 give the treatment notes for those. **§8.10–8.16 are the gaps
I added, with reasons** — the owner asked explicitly for this.

### 8.1 Articles — a procedure, not an intuition

Articles are among the last features acquired, and are still error-prone in advanced learners,
particularly for speakers of article-less L1s (Chinese, Japanese, Korean, Russian, Hindi and others).
**[H]** Two design consequences:

1. **Teach countability first.** The error is usually upstream: the learner mis-judged whether the
   noun was countable in this use, and the article error follows automatically.
2. **Ship a three-question procedure**, not a rule list, because a rule list cannot be executed in
   real time:
   - **Q1: Am I talking about the category in general?** → zero article with a plural or an
     uncountable. *Renewable energy is expensive to store.*
   - **Q2: Can my reader identify exactly which one I mean?** (Mentioned before? Unique? Defined by
     what follows? A superlative?) → `the`.
   - **Q3: Otherwise** — singular countable → `a`/`an`; plural or uncountable → zero.

`gr_article_zero` carries the highest-frequency Task 2 article error: `*The computers have
transformed education` for generic reference. **[H]**

### 8.2 Countability

Beyond the concept: the closed list of nouns learners reliably pluralise wrongly (`research`,
`information`, `advice`, `equipment`, `knowledge`, `evidence`, `progress`, `feedback`, `staff`),
nouns countable in one sense and uncountable in another (`experience`, `time`, `paper`, `work`), and
the partitives that make an uncountable countable (`a piece of research`, `an item of equipment`).
This overlaps the vocabulary module — the design agent should decide where it lives so it isn't
taught twice. Recommendation: **grammar owns the concept, vocabulary owns the list.**

### 8.3 Prepositions — a vocabulary problem in grammar's clothing

Core spatial and temporal `in/on/at` is rule-shaped and belongs in Track A. **Dependent
prepositions are not rule-derivable and must not be taught as if they were.** `depend on`,
`result in`, `an increase in`, `a solution to`, `aware of`, `responsible for` — these are chunks, and
chunks belong in the SRS with a collocation-style exercise, exactly like the vocabulary deck's
`collocations` field. This is a direct hook into the existing SRS engine and the design agent should
take it.

Special case with its own point: the prepositions of data description (`gr_change_language`), where
`rise in` / `rise to` / `rise by` are three different meanings and Task 1 answers turn on them.

### 8.4 Relative clauses

Two things to get right. **First, the defining/non-defining distinction is semantic, not
punctuational** — the comma is the *consequence* of the meaning, so teach the meaning and derive the
comma. Second, relative clauses are the cheapest route from short simple sentences to controlled
complex ones, so they arrive early in Track B and get more production practice than anything else in
U11. Reduced relatives and participle clauses (`gr_participle_clause`) are the C1 continuation and
are where academic density actually comes from.

### 8.5 Gerunds vs infinitives

One real rule (`gr_gerund_after_prep`: after a preposition, always `-ing`), one closed
meaning-changing set worth explicit teaching, and a long tail that is pure lexis. Treat the tail as
SRS chunks. Do not invent explanations for why `enjoy` takes `-ing` and `want` takes `to` — there
isn't one, and pretending there is wastes the learner's attention. **[H]**

### 8.6 Reported speech

Sequenced strictly after `gr_embedded_question`, because reported-question word order *is* embedded
question word order and teaching it twice is a wasted lesson. The high-value half is
`gr_reporting_verbs`: the choice between `said`, `claimed`, `argued`, `pointed out`, `admitted` and
`conceded` is a stance choice, which makes it Task 2 grammar and Reading-paraphrase grammar at once.

### 8.7 Comparatives

Beyond forms: **grading** (`considerably`, `marginally`, `nowhere near`), **multiples**
(`twice as many`, `a threefold increase`) and the **language of change** — all three are Academic
Task 1 requirements and all three are usually left to vocabulary lists.

### 8.8 Quantifiers

`few`/`a few` and `little`/`a little` are meaning reversals and get a choice point. The upper end
(`the majority of`, `a significant proportion of`, `barely any`) is Task 1 proportion language and
sits with `gr_quantifiers_fine`.

### 8.9 Word order, agreement, punctuation, cohesion

- **Word order:** the adverbial ordering rule in Track A (`gr_word_order_place_time`), adverb
  mid-position in Track C, and the embedded-question inversion error in U11. Split deliberately —
  basic order is a day-one need, adverb placement is a polish concern.
- **Agreement:** basic in Track A; the hard cases in Track C, adjacent to the complexity that causes
  them.
- **Punctuation:** the comma splice gets its own point because it is the most damaging and most
  common of the sentence-boundary errors in Task 2.
- **Cohesion:** a whole unit (U16), organised by function, with `gr_linker_restraint` as a
  first-class point because over-signposting is explicitly penalised. **[H]**

---

### THE GAPS I ADDED — and why

**8.10 `gr_aux_system` — the auxiliary as one explicit mechanism.** *Why:* questions, negatives,
short answers, tags, agreement echoes, emphatic `do`, ellipsis and negative inversion are all the
same rule. Taught once as a system, they cost one lesson; taught implicitly, they cost eight and
never quite cohere. This is the highest-leverage addition in the whole syllabus. **[JUDGEMENT]**

**8.11 `gr_perfect_concept` and `gr_unreal_past` — the two "teach once, spend six times" concepts.**
*Why:* four perfect tenses share one idea; the second conditional, third conditional, mixed
conditionals, `wish`, `if only`, `it's time`, `would rather` and polite distancing share another.
Every syllabus I looked at teaches the instances and never states the principle, which is why
learners who "know the third conditional" cannot produce `I wish I had`. **[JUDGEMENT]**

**8.12 `gr_dummy_subjects` — `it` vs `there`.** *Why:* `It is important to…` and `There has been a
significant increase in…` are two of the highest-frequency sentence openers in Academic Writing, and
learners swap them constantly. Small point, enormous frequency. **[M]**

**8.13 `gr_spoken_vs_written_grammar` — register as grammar.** *Why:* a genuine hole in the field.
Learners transplant essay grammar into Speaking Part 1 (and sound like a press release) or spoken
grammar into Task 2 (and lose marks). Contractions, phrasal verbs, `get`-passives, fronting, `going
to`, question tags and ellipsis are all right in one place and wrong in the other. This is the
purest form of the owner's "when to use which, **and where**". **[JUDGEMENT]**

**8.14 `gr_linker_restraint` — when *not* to link.** *Why:* mechanical over-use of cohesive devices
is explicitly a band-6 signature, and the prep internet teaches the opposite (memorise 50 linking
phrases). This point exists to undo damage the learner has probably already taken. **[H]**

**8.15 `gr_nominalisation` and `gr_noun_phrase_expansion` — the academic density engine.** *Why:*
the biggest single stylistic gap between a band-6 and a band-8 Task 2 is not clause complexity but
noun-phrase complexity (`prices rose sharply` → `the sharp rise in prices`). It is teachable, it is
mechanical, and it is almost never on a grammar syllabus because it sits between grammar and
vocabulary. It ships with a warning about over-nominalising. **[M]**

**8.16 `gr_error_triage` — the last-three-minutes checklist.** *Why:* accuracy under time pressure is
a *procedure*, not a knowledge state. Four checks in priority order — verb agreement, articles,
sentence boundaries, tense consistency — chosen because those are the highest-frequency error
categories in the corpus evidence. Turns 154 points into something executable. **[JUDGEMENT]**

**Also added, smaller:** subject vs object questions (`gr_questions_wh`); `been` vs `gone`;
`needn't have` vs `didn't need to`; the future continuous's neutral-enquiry use; `be used to` /
`get used to` taught adjacent to `used to`; substitution and ellipsis (`gr_substitution_ellipsis`);
parallel structure; the inflection-pronunciation links (`-s` as /s/ /z/ /ɪz/, `-ed` as /t/ /d/ /ɪd/)
folded into `gr_third_person_s` and `gr_past_simple_regular` as a hook into the existing
pronunciation feature. **[M]**

**Explicitly out of scope, so nobody adds them later:** the full subjunctive beyond `suggest that
X do`; `whom` as a productive target (recognition only); future perfect continuous production;
archaic conditional forms; exhaustive irregular-verb coverage beyond the high-frequency set;
phonology beyond the three inflection endings; and any grammar point with no hook into the four
skills (thesis 1.6).

---

## 9. The dependency graph

### 9.1 What the graph guarantees

For every point P, every term, form and concept used in P's explanation is introduced by a point
that appears **earlier in the total order**. This is what makes the zero-knowledge entry point real
rather than aspirational, and it should be **enforced as a lint by the verify agent**, not trusted:
each point declares `prerequisites[]`, and the merge gate must confirm (a) no cycles, (b) every
prerequisite id exists, (c) every prerequisite's scheduled position is earlier.

### 9.2 The deliberate order/listing mismatches — all eight of them

**Unit membership is thematic; teaching order is topological. They are not the same thing, and the
design agent must keep `unit_id` and `sequence_index` as separate fields** or this syllabus cannot be
expressed. I ran a machine topological check over §2 (154 points, every prerequisite id resolves, no
cycles) and it reports exactly the following mismatches between *listing* order and *dependency*
order. Each is deliberate; each is listed here so the verify agent's lint can whitelist them rather
than treat them as errors.

| Point | Listed in | Must be scheduled after | Why the listing is still right |
|---|---|---|---|
| `gr_future_perfect` | U4 (future) | `gr_perfect_concept` (U6) | It is a future; a learner looking for future forms should find it with the others |
| `gr_comparatives`, `gr_as_as` | U14 | — (schedule in Track A / early Track B) | Day-one needs. U14 is where the *advanced* comparison work lives, so the family stays together |
| `gr_prepositions_core` | U15 | — (schedule in Track A) | Same: a day-one need, listed with the accuracy cluster it belongs to conceptually |
| `gr_despite_although` | U9 | `gr_gerund_after_prep` (U12) | It is a contrast point and belongs with the other contrast points; the `-ing` rule is its enabling prerequisite. **Alternative fix: move `gr_gerund_after_prep` forward into U9.** I recommend this — it is one rule, it is needed here, and it removes a cross-track edge |
| `gr_passive_reporting` | U8 (voice) | `gr_noun_clause_that` (U11) | Voice family. Cheap alternative: pull `gr_noun_clause_that` back to U9, where `gr_clause_types` already is. **Also recommended** |
| `gr_passive_nonfinite` | U8 | `gr_verb_patterns_core` (U12) | Voice family; genuinely needs verb patterns first. Schedule it late; do not relist it |
| `gr_change_language` | U14 | `gr_prepositions_dependent` (U15) | Task 1 data language belongs with comparison. Schedule after U15, or accept that U14 and U15 interleave |

Two of the seven have a cleaner fix than a scheduling exception — moving `gr_gerund_after_prep` and
`gr_noun_clause_that` earlier. **I recommend the design agent take both moves**, which reduces the
exception list to five and leaves only mismatches that are genuinely unavoidable.

### 9.3 Critical paths — the longest chains

These are the chains that constrain the whole ordering. Everything else fits around them.

```
CLAUSE      gr_clause_svo → gr_capital_fullstop → gr_coordination → gr_clause_types
              → gr_relative_defining → gr_relative_nondefining → gr_participle_clause
              → gr_noun_phrase_expansion

AUXILIARY   gr_clause_svo → gr_present_simple → gr_aux_system → gr_questions_wh
              → gr_embedded_question → gr_reported_questions
            gr_aux_system → gr_modal_grammar → gr_modal_possibility
              → gr_modal_deduction_present → gr_modal_perfect
            gr_aux_system → gr_inversion_negative

PARTICIPLE  gr_past_simple_irregular → gr_past_participle → ┬ gr_perfect_concept → gr_present_perfect
                                                            └ gr_passive_concept → gr_passive_forms
                                                                → gr_passive_when → gr_passive_process

UNREAL      gr_past_simple_regular → gr_past_perfect → gr_unreal_past
              → gr_cond_second → gr_cond_third → gr_cond_mixed → gr_inversion_conditional
            gr_unreal_past → gr_wish_family

NOUN        gr_noun_plural → gr_countability → gr_article_the → gr_article_zero
              → gr_article_decision
            gr_countability → gr_quantifiers_basic → gr_quantifiers_fine → gr_relative_quantifier

INFORMATION gr_passive_when → gr_given_new → gr_nominalisation → gr_noun_phrase_expansion
```

**Longest chain: 8 nodes** (CLAUSE and PARTICIPLE→passive). That is the depth of the module, and it
means no point is more than eight lessons from the entry point — which is the concrete form of "a
zero-knowledge learner can follow all of it".

### 9.4 The five convergence nodes

Five points are prerequisites of an unusually large number of others. They are the module's load
bearers, they must be taught with the most care, and they are the right places to put a mastery gate
before the learner is allowed forward:

| Node | Feeds | Why it is load-bearing |
|---|---|---|
| `gr_aux_system` | 11 downstream points | Thesis 1.2 |
| `gr_past_participle` | 9 | Both the perfect and the passive |
| `gr_clause_types` | 9 | Every complex sentence |
| `gr_unreal_past` | 6 | Every unreal structure |
| `gr_countability` | 6 | The entire article and quantifier system |

### 9.5 What is *not* in the graph

Points with no prerequisites beyond their unit's entry are free-floating and can be inserted anywhere
in a learner's path — useful for the scheduler, which can use them as filler when a learner is
blocked. Roughly 30 of the 154, mostly in U15 (accuracy) and U16 (cohesion). The design agent should
mark them `insertable: true`.

---

## 10. The learning path — how much, in what order, at what pace

### 10.1 Shape

| Track | Units | Points | Choice points | Entry | Exit |
|---|---|---|---|---|---|
| **A — Foundation** | 1–5 | 44 | 9 | none | Can produce accurate simple sentences in three time frames |
| **B — Core** | 6–13 | 74 | 29 | A diagnostic | Can produce accurate complex sentences and select forms deliberately — **this is band 6.5–7 territory** |
| **C — Polish** | 14–17 | 36 | 12 | B complete **and** accuracy gate | Range with control — band 7+ |

### 10.2 Pace and duration

Assume a self-directed adult doing 25–35 minutes a day, which is the realistic figure for this app's
users. **[L] on the estimate; [M] on the ratios.**

| Unit of work | Content | Time |
|---|---|---|
| One point | Explanation → recognition check → controlled practice → free production | 12–20 min for a form point; 20–30 for a choice point |
| One session | 1 new point + SRS review of 6–10 due items | 25–35 min |
| One unit | 6–12 points + a unit consolidation task | 8–14 sessions |

Full path at one point per session, five sessions a week: **A ≈ 9 weeks, B ≈ 15 weeks, C ≈ 7 weeks —
roughly 31 weeks end to end.** That is the honest number and the app should show it, because a
learner who thinks grammar takes three weeks quits in week four.

### 10.3 The three realistic entry points

Almost nobody does all 154 points. The diagnostic must support three real journeys:

1. **True beginner** — the full path. 31 weeks.
2. **The band-5.5 plateau (the modal user)** — Track A skipped by diagnostic, Track B in full,
   Track C selectively. ~18 weeks. This is the user the module should be optimised for.
3. **The band-6.5 pusher** — a targeted path of ~55 points chosen by *diagnosed error*, not by
   level: the choice points, plus U15 accuracy, plus U16 cohesion, plus 4–5 of U17. ~8 weeks.

**Journey 3 requires the module to route by error rather than by level.** That is a design
requirement, and the strongest argument for making every practice item carry an error-tag the way
reading questions carry trap slugs — so a learner's history becomes a diagnosis, not a percentage.
The precedent is `staging-reading/DESIGN.md`; grammar should copy it deliberately.

### 10.4 A pacing expectation the module should state out loud

The acquisition-order research is clear that instruction improves accuracy but **does not change the
order in which features become reliable** (**[H]**). Practical consequence: some points —
third-person `-s`, articles, past-tense endings on irregular verbs — will keep producing errors for
months after they are "learned", and this is normal, not failure. The app should say so, because the
alternative is a learner who concludes the module isn't working. It also means those late-acquired
points need **long SRS tails**, not mastery-and-done.

### 10.5 Practice volume — the floor for the content agents

Per point: **8–12 practice items minimum**, spread across the difficulty ladder (recognition →
controlled → guided → free). Choice points need more, and specifically need **forced-choice minimal
pairs under time pressure**, because the skill is speed of selection, not knowledge of the rule.

| | Points | Items/point | Items |
|---|---|---|---|
| Form and accuracy points | 104 | 8–10 | ~940 |
| Choice points | 50 | 14–18 | ~800 |
| **Total** | **154** | | **~1,740** |

Plus 154 explanation payloads, 50 decision-rule payloads, and 17 unit consolidation tasks.
**Recommended phasing:** Phase 1 ships **Track B's 74 points** — the module is useful the day Track B
exists, and useless with only Track A. Phase 2 adds Track C, Phase 3 backfills Track A.

### 10.6 The practice ladder every point must climb

Non-negotiable, from thesis 1.3. A point that stops at rung 3 has not been taught.

| Rung | What the learner does | Judged by |
|---|---|---|
| 1 Notice | Sees the target inside a real sentence and identifies it | Exact match |
| 2 Recognise | Chooses between forms in a given context | Exact match |
| 3 Manipulate | Completes, transforms or corrects | Exact match / pattern |
| 4 Produce (guided) | Writes a sentence to a specification, on a given topic | LLM against the point's criterion |
| 5 Produce (free) | Uses the target in a task that would exist without it — a Part 3 answer, a Task 2 body sentence | LLM against the point's criterion + the task's |

Rungs 4 and 5 are why the module needs the LLM that is already configured. Rungs 1–3 must work
offline.

---

## 11. Connecting grammar to the four skills

### 11.1 Every point carries a skill hook

Thesis 1.6. Suggested field: `skill_hooks[]`, values drawn from
`speaking_p1 | speaking_p2 | speaking_p3 | writing_t1_academic | writing_t1_gt | writing_t2 |
reading | listening`. This is what lets the app answer the learner's real question — *why am I
learning this?* — with a specific answer instead of "it's grammar".

### 11.2 The heaviest hooks, by skill

| Skill | The grammar it actually runs on |
|---|---|
| **Speaking Part 1** | Present simple vs continuous · frequency adverbs · short answers and echoes · `used to` · contractions and spoken register |
| **Speaking Part 2** | Past narrative (simple/continuous/perfect) · sequencing · `used to`/`would` · `should have` reflection |
| **Speaking Part 3** | Second and mixed conditionals · modal hedging · comparatives · `it`/`there` subjects · concession |
| **Writing Task 1 (Academic)** | Passive process chains · comparatives, multiples and grading · `rise in/to/by` · quantifiers of proportion · relative `which` commentary |
| **Writing Task 1 (GT)** | Register and modality (requests, complaints) · first conditional · reported speech |
| **Writing Task 2** | Conditionals for argument · modal hedging · reporting verbs for stance · nominalisation · concession · linker restraint · article accuracy |
| **Reading** | Passive and nominalisation *for decoding* · relative and participle clauses · reference tracking · reporting verbs (attribution questions) |
| **Listening** | Weak forms and contracted auxiliaries · `-ed`/`-s` endings · negative contractions · number and quantity language |

**Reading and Listening are receptive hooks and must be labelled as such.** The learner is not being
asked to *produce* nominalisation in order to read; they are being asked to *unpack* it. The design
agent should carry a `hook_mode: productive | receptive` distinction, because it changes what the
practice item looks like.

### 11.3 The band-7 spine — if only 60 points could ship

Ranked by marks-per-hour, this is the shortlist the fast path in §10.3 journey 3 should draw from:
article decision · subject-verb agreement (hard cases) · present perfect vs past simple · sentence
boundaries and comma splices · relative clauses (both kinds) · the passive and *when* to use it ·
second and third conditionals · modal hedging · perfect modals · verb patterns · dependent
prepositions · linker restraint and reference · concession structures · complex sentence control ·
error triage.

### 11.4 Grammar ↔ vocabulary — the join the owner asked for

The owner wants vocabulary practised in **real sentences**. Grammar is the machine that makes a
sentence real. Three joins the design agent should take:

1. **Every grammar practice sentence is topic-tagged** with a `topic_id` from `data/topics.jsonl`
   (20 available), so a learner working on `topic_environment` vocabulary meets the passive in
   environment sentences. This costs nothing and makes both modules feel like one product.
2. **Dependent prepositions and verb patterns are lexico-grammar and belong in the existing SRS**,
   using the `collocation` exercise kind that already exists in `sidecar/bandready/srs/exercises.py`.
   Grammar supplies the items; the vocabulary scheduler runs them. No new engine.
3. **`use_in_sentence` becomes the shared production rung.** The vocabulary module already has an
   LLM-judged "use this word in a sentence" exercise. Grammar's rung 4 is the same exercise with a
   grammatical constraint added: *use `deteriorate` in a sentence with the present perfect*. One
   exercise, two teaching goals, and it is exactly the "practised with real sentences" the owner
   asked for. **This is the single most valuable integration in the brief and I recommend the design
   agent build for it explicitly.**

---

## 12. Open questions for the design agent

1. **Does a point need sub-items?** Several points (`gr_present_perfect` with its three meanings,
   `gr_modal_perfect` with its six forms) are large. Either the schema supports sub-points or those
   points split. I lean towards **splitting**, so the SRS scheduler can hold three separate
   confidence estimates for the three present-perfect meanings — the learner who has *experience*
   and not *unfinished time* is common and the module should be able to see it.
2. **How is the accuracy gate on Track C measured?** It needs a number. My suggestion: a rolling
   error rate on rung-4/5 production over the last 20 items, threshold set by pilot. **[L]**
3. **Do choice points get their own row type or a flag?** They have a different content shape (§4's
   five parts). A flag plus optional fields is probably enough, but the lint must require all five
   parts when the flag is set.
4. **Where does countability's word list live** — grammar or vocabulary? §8.2. Pick one.
5. **Are `gr_error_triage` and `gr_spoken_vs_written_grammar` grammar points or features?** They are
   procedures over the whole module rather than points in it. They may want to be surfaced as tools
   rather than lessons.

---

## 13. Sources and confidence

Grouped by what they were used for. Confidence in the third column is confidence **in the claim I
took from the source**, not in the source generally.

**CEFR level assignment and grammar inventories**
- British Council / EAQUALS, *Core Inventory for General English* (2011) —
  https://www.eaquals.org/wp-content/uploads/EAQUALS_British_Council_Core_Curriculum_April2011.pdf —
  **[M]**. *Note: the PDF would not convert to text through my fetch tool, so I used it via its
  documented structure and secondary descriptions rather than reading it line by line. Level
  assignments in §2 should be treated as **[M]**, not **[H]**, on that basis, and a human with the
  PDF open should spot-check Track B.*
- Cambridge English, *Understanding (and Using) CEFR Criterial Features for Grammar Instruction* —
  https://www.cambridge.org/elt/blog/2021/06/23/using-cefr-criterial-features-for-grammar-instruction/
  — **[H]** for the criterial-feature concept and the direct-questions → indirect-questions →
  reported-speech ordering, which I have encoded as a hard prerequisite chain in §9.3.
- Cambridge Core, *NLP-powered quantitative verification of the English Grammar Profile's
  structure-level assignment* —
  https://www.cambridge.org/core/journals/annual-review-of-applied-linguistics/article/nlppowered-quantitative-verification-of-the-english-grammar-profiles-structurelevel-assignment/8323F1AD466EF982EA47DEFBB0D740D5
  — **[M]**. Corroborates that EGP level assignments are corpus-derived and broadly hold up, which
  is why I trusted the general shape while allowing ±1 band.
- Tracktest, *English grammar CEF level requirements* —
  https://tracktest.eu/english-grammar-cef-level-requirements/ — **[L]** as authority, **[M]** as a
  cross-check. Used only to confirm that my level assignments were not eccentric. I overrode it on
  A1 placement of conditionals, futures and gerund/infinitive (§0.5 O2).

**Acquisition order**
- Goldschneider & DeKeyser, *Explaining the "Natural Order of L2 Morpheme Acquisition" in English: A
  Meta-analysis of Multiple Determinants*, Language Learning (2001/2005) —
  https://onlinelibrary.wiley.com/doi/abs/10.1111/1467-9922.00147 — **[H]** for the five
  determinants and **[H]** for the finding that instruction improves accuracy without changing
  order. This is the source for §0.5 O5 and §10.4.
- Brown (1973) morpheme-order work, via the survey literature — **[H]** for the existence of a
  stable order, **[M]** for its exact content in L2.

**Learner error frequency**
- *Identifying Grammatical Errors and Mistakes via a Written Learner Corpus in a Foreign Language
  Context*, Journal of Language Research —
  https://dergipark.org.tr/en/pub/jlr/article/1553484 — **[M]**. Verb conjugation, prepositions,
  articles, number and voice as the leading categories.
- *Common Errors Made in English Writing by Malaysian [learners]*, ERIC —
  https://files.eric.ed.gov/fulltext/EJ1348597.pdf — **[M]**. Corroborating population.
- *Most of ESL students have trouble with the articles*, ERIC —
  https://files.eric.ed.gov/fulltext/EJ903889.pdf — **[H]** for the claim that the article problem
  is downstream of the countability judgement, which is the basis of §8.1's ordering.
- General corpus summaries putting articles / tense / agreement / prepositions at the top of the
  error distribution — **[M]** individually, **[H]** in aggregate because every independent source
  produced the same top five. *Caution: one widely repeated figure ("78% of errors fall into five
  categories, from 20M+ learner texts") appears on commercial blog pages without a traceable primary
  citation. **Do not put that number in learner-facing copy.** The ranking is safe; the percentage
  is not.*

**Passive voice and academic register**
- IELTS.org, *Grammar essentials – the passive voice* —
  https://ielts.org/news-and-insights/grammar-essentials-the-passive-voice — **[H]** for the
  unknown/obvious/unimportant-agent condition.
- IDP IELTS, *Passive voice for IELTS Writing test* —
  https://ielts.idp.com/prepare/article-when-to-use-the-passive-voice — **[H]** for the process-
  description use and the formality/objectivity use.
- British Council, *Using active vs passive voice in IELTS Writing and Speaking* —
  https://takeielts.britishcouncil.org/blog/active-vs-passive-voice — **[H]**.
- The active-for-natural-processes rule (§7.4) appears in several teaching sources — **[M]** as
  stated, **[H]** as a fact about English.
- Condition 3 (topic continuity / information ordering) is my priority ranking, standard in
  discourse grammar but *not* emphasised by the IELTS-facing sources — **[M], [JUDGEMENT]**.

**Band 7 grammar and cohesion**
- Multiple analyses of the Grammatical Range and Accuracy criterion converging on: *frequent
  error-free sentences*, variety over maximal complexity, accuracy beating ambition — **[H]** in
  aggregate. Individual prep-site sources **[L]**; I used them only where they agreed with each
  other and with the published criterion names. **No specific error-count threshold ("three errors
  maximum for band 7") may enter our content — that figure is folklore.**
- Cohesion: convergent sources that over-used, mechanical connectors are a band-6 signature and that
  referencing and substitution distinguish band 7 — **[H]** in aggregate. Basis for
  `gr_linker_restraint`, §8.14.

**Choice-point decision rules**
- The finished-vs-open time-frame rule for present perfect vs past simple, and the
  name-the-time-frame-before-choosing procedure — **[H]**; multiple independent teaching sources,
  and it matches the descriptive grammar.
- The unreal-past-as-distancing analysis behind §5.2 — **[H]** as description; **[M], [JUDGEMENT]**
  that teaching it as a single principle before the conditionals is pedagogically better.
- `used to` / `would` / past simple: the "`would` cannot carry a state" rule — **[H]**.
- Perfect modals and the `can have` / `could have` / `can't have` asymmetry, and `must have` vs
  `had to` — **[H]**; British Council *Modals: deductions about the past* —
  https://learnenglish.britishcouncil.org/free-resources/grammar/b1-b2/modals-deductions-about-past

**Pedagogy**
- The present → controlled practice → free production sequence, and the standard critique that it
  is over-used and under-delivers at the production stage — **[H]** that the sequence is standard,
  **[M]** on the critique. Basis for thesis 1.3 and the five-rung ladder in §10.6. My position: keep
  the sequence, make rungs 4–5 obligatory, which is where the criticism actually bites.

**Repo, read directly (not web sources)**
- `content/core-en/staging/DESIGN.md`, `content/core-en/staging-reading/DESIGN.md` — quality bar and
  the trap-slug/diagnosis pattern §10.3 borrows.
- `content/core-en/data/topics.jsonl` — the 20 topic ids §11.4 requires.
- `content/core-en/data/vocab.jsonl`, `sidecar/bandready/srs/exercises.py` — the six exercise kinds
  (`flip`, `cloze`, `use_in_sentence`, `collocation`, `audio_recall`, `speaking_drill`) that §11.4
  proposes to reuse rather than duplicate.
- `sidecar/bandready/content/validate.py` — `ROW_SCHEMAS` is keyed by filename, so a new
  `grammar_points.jsonl` (or similar) needs a row model and a `ROW_SCHEMAS` entry. **The design
  agent specifies it; the verify agent wires it. Not this file's call.**

---

## 14. What I am least sure about

Stated plainly so the design agent knows where to push.

1. **Exact CEFR levels in Track B.** The Core Inventory PDF did not convert to text for me, so
   levels come from secondary descriptions and my own judgement. The *ordering* is solid; the
   *labels* may be off by a band in places. Nothing downstream should depend on the label.
2. **154 points is my number, not a sourced one.** It is what falls out of the coverage the owner
   asked for at a granularity where each point is one 20-minute session. A different granularity
   would give 90 or 250 and be equally defensible.
3. **The Track C accuracy gate is right in principle and unspecified in practice** (§12 Q2).
4. **Whether `gr_unreal_past` before the second conditional actually helps learners** is my strong
   pedagogical judgement, not a measured result. It is testable once the module has users, and it is
   the first thing I would A/B.
5. **The 31-week full-path estimate** is a defensible guess **[L]**. The ratios between tracks are
   more trustworthy than the absolute number.
