# TH-D1 — The Theory reference: the authoring contract

**What this document is.** The binding contract for the eight agents who author the Theory reference.
It fixes the chapter outline, the article schema, the gating rule, the zero-knowledge rule, the
writing standard and the quantity targets. An author follows it literally. Where it disagrees with a
research briefing, **this document wins**, and §0.3 records every place that happens.

**What this document is not.** It is not a syllabus (TH-R1 is), not a grammar (TH-R2 and TH-R3 are),
and not a pedagogy essay (TH-R4 is). It does not restate their content. It tells you what shape the
content has to come out in.

**Read before you author, in this order:**

| # | File | What you take from it |
|---|---|---|
| 1 | this file | the contract. Read it all |
| 2 | `staging-theory/TEMPLATE-THEORY.json` | three finished articles at the ceiling. Copy the shape exactly |
| 3 | `staging-theory/research/01-coverage-map.md` | **your chapter's areas**, their `†` flags, their deps, and §5's variation list |
| 4 | `staging-theory/research/02-paradigms.md` | the form tables. Every paradigm you ship comes from here |
| 5 | `staging-theory/research/03-when-to-use-which.md` | every comparison article's payload |
| 6 | `staging-theory/research/04-reference-pedagogy.md` | §10 the writing standard, §12 the L1 dossier |
| 7 | `staging-grammar/DESIGN.md` | §0.2 copyright, §2.8 the closed enums, §4.2 the 154 practice ids |
| 8 | `sidecar/bandready/grammar/syllabus.py` | `UNIT_TITLES`, and the practice ids you cross-link to |

---

## 0. Standing rules

### 0.1 What a theory article is

> **A theory article answers one question a learner actually has, completely, on one screen-stack,
> and can be the first page of this reference that the reader has ever opened.**

Three consequences, and they are the whole design:

1. **Complete, not sequenced.** A practice point teaches one slice. A theory article shows the whole
   system at once — every person, every polarity, every rival form. The all-at-once table is the
   article's reason to exist.
2. **Selection, not just formation.** The reader can usually build the form. What they cannot do is
   choose. Every article that has a rival ends in a `contrast` or a `decision_tree`.
3. **Page one, every time.** No article may assume the previous one was just read. Terms are chipped
   with their gloss on every use, not only the first.

**The hard boundary with the practice module, inherited from TH-R4 §1 and binding:**

- **T-BOUND-1 (amended).** A theory article contains no gradable, scored or stored item. `quick_check`
  is the single exception and it is bounded in §2.4.17.
- **T-BOUND-2.** A practice point is never the source of truth for a paradigm. If a learner needs the
  whole modal table, the point links here. Duplicated tables drift.
- **T-BOUND-3.** No example sentence is shared between a theory article and any practice item, or
  between two theory articles. A shared sentence turns the practice item into a memory test of the
  article.

### 0.2 Copyright — inherits `staging-grammar/DESIGN.md` §0.2 in full

Read that section. It binds here without amendment. The three things that bite hardest in a
reference:

- **The example sentence is the danger, not the fact.** "Present perfect", `be + past participle`,
  the CEFR level names, the twelve-cell grid — all free. A distinctive *example* of any of them is an
  authored line. **If a sentence feels familiar, it is. Throw it away.**
- **The banned list applies verbatim:** the cake sentence for the third conditional; "If it rains,
  the grass gets wet"; "Water boils at 100°C" *as an example sentence*; "I've lost my keys"; "John
  has been to Paris"; "The cat sat on the mat"; "My hovercraft is full of eels"; anyone called John,
  Mary, Tom, Sarah, Peter or Anna performing a textbook action; any subject called "Mr Smith".
- **The four banned claims apply:** no "78% of learner errors", no error-count band threshold, no
  "Cambridge examiner training says", no per-structure frequency percentage. Frequency is stated
  qualitatively or with the three-level weight marker (§2.4.6), never as a number.

**One risk that is specific to this module.** The *sequence of explanation* in a famous reference
chapter is itself recognisable. Do not reproduce a remembered chapter shape. The shape you use is
§2.5's skeleton, and it is deliberately not the conventional one.

**House world:** Verdon, Norland, Ashfield, Sandmouth, Marlow, Brackenfield. No real organisations,
no real statistics, no real named researchers. Theory examples and practice examples read as the same
world.

**Self-check before you commit any sentence:** *did I read this somewhere?* Any doubt at all → rewrite.

### 0.3 Where this contract overrides the research

TH-R4 §0 requires that a disagreement be declared rather than silently dropped. Five declarations.

| # | Research says | This contract says | Why |
|---|---|---|---|
| 1 | TH-R4 §1: *"A theory article MUST NOT contain a question the reader is expected to answer in place."* | A `quick_check` block is permitted, with the answer always visible or one tap away, never scored, never stored, never gating, max 3 items, max one block per article | The owner asked for it by name. The reason for the original ban is that a scored quiz duplicates the practice ladder and gates reading. A self-check with the answer shown does neither. §2.4.17 is written so that it cannot drift into a quiz |
| 2 | TH-R1 §2 headline: *"Groups A–Z total 337 areas"* | The enumerated ids A1–Z12 sum to **474**. 337 is a miscount in the headline, not in the map | The acceptance test for coverage is the **id list in TH-R1 §3**, not the headline number. Every one of the 474 ids is assigned to exactly one article in §1.3–§1.10 |
| 3 | TH-R1 §7.2 proposes **44 chapters**; TH-R4 §13.3 proposes **12 parts / ~84 articles** | **8 chapters, 175 articles** | Eight is fixed by the delivery constraint: one chapter per authoring agent. Eight also fits TH-R4 §13.2's requirement that the tab root fit on one screen better than twelve does. The 44-chapter structure survives as the *section* level inside a chapter; the 12-part structure is dropped |
| 4 | TH-R1 §8.2 recommends ~120 articles | 175 | 120 was "roughly one article per chapter section". Applying TH-R4 §3.3's one-question test to each of those sections splits about a third of them. The **word budget is unchanged** at ~145,000 — 175 shorter articles, not 175 long ones |
| 5 | TH-R4 §4.2 pins terms to its own chapter numbering (Ch 1, Ch 14, Ch 63…) | The term ledger in §4.3 is re-pinned to **article ids** in this contract's ordering | Chapter numbers changed, so the ledger had to be rebuilt. The *shape* — one global order, one introducing article, verbatim gloss reuse — is unchanged |

Nothing else in the four briefings is overridden. Where a briefing states a fact about English and
this contract is silent, the briefing binds.

### 0.4 Confidence and honesty

Three labels, used in article prose and in `variation` blocks:

- **Flat statement** — a description of English every major reference agrees on. State it bare, with
  no hedge (V6).
- **`variation` block** — usage genuinely differs by variety, by register, or between prescriptive
  tradition and observed usage. **Never resolved silently.** Both options named, a house default
  given, and the default labelled as a house choice rather than as a rule of English.
- **`false_rule` block** — a rule that is commonly taught and is wrong. Named in the wording the
  learner actually heard, then killed, then replaced with what to do instead.

TH-R1 §5 lists **42 variation points**. Every one of them must appear in a `variation` block in the
article that owns its area, and all 42 are collected into `th_where_english_varies` (Chapter 1,
article 20). A variation point that appears only in the collection article and not in its own
chapter is a lint failure — the reader meets it where they meet the structure.

**Never invent a citation.** No article contains a sentence of the form "X says Y". The facts stand
on the language.

---

## 1. THE CHAPTER OUTLINE

### 1.1 Eight chapters, one per author

| Chapter id | Learner-facing title | Also called | Groups | Areas | Articles | Body words |
|---|---|---|---|---|---|---|
| `thc_01` | How an English sentence is built | Sentence elements, word classes, phrases, clause patterns | A, B, C, D, Z6, Z11 | 54 + 2 | 20 | ~11,500 |
| `thc_02` | Nouns, and the words in front of them | Nouns, determiners, pronouns | E, F, G | 52 | 20 | ~15,000 |
| `thc_03` | Verbs, and talking about time | Verb forms, the auxiliary system, tense and aspect | H, I, Z1, Z7, Z8, Z9 | 54 + 4 | 23 | ~15,000 |
| `thc_04` | Making the verb fit: agreement, attitude and voice | Concord, modality, the passive | J, K, L, Z10 | 55 + 1 | 21 | ~15,500 |
| `thc_05` | Asking, denying, and what comes after a verb | Questions, negation, non-finite clauses and verb patterns | M, N, O, Z2 | 56 + 1 | 22 | ~16,000 |
| `thc_06` | Building bigger sentences | Clause combining, conditionals, reported speech | P, Q, R | 65 | 22 | ~17,000 |
| `thc_07` | Describing, comparing, and the small words | Adjectives, adverbs, comparison, prepositions, degree | S, T, V, Z3 | 55 + 1 | 22 | ~16,000 |
| `thc_08` | Putting the emphasis where you want it, and getting the surface right | Information structure, cohesion, punctuation, register | U, W, X, Y, Z4, Z12 | 71 + 2 | 25 | ~17,000 |
| | | | | **474** | **175** | **~123,000** |

Body words exclude example sentences, table cells, collapsed blocks and L1 boxes (§6.1). With those,
the shipped total is ~145,000 words, which is TH-R1 §8.3's budget.

**On balance.** Areas per chapter range 52–71 and articles 20–25. That spread is deliberate and the
balancing metric is **body words**, which range 11,500–17,000. Areas are not equal in size: `I2` is a
chapter section and `V6` is a paragraph. Two notes for the build agent:

- **Chapter 1 is the lightest in words and the heaviest in care.** It owns the term ledger (§4.3),
  every one of its articles is `foundation` kind with the tightest prose metrics, and it is the only
  chapter that may assume nothing at all. Its author also owns `th_where_english_varies`, which
  collects all 42 variation points from the other seven chapters — so it is authored **last**, after
  the other seven chapters exist.
- **Chapter 8 is the heaviest.** It carries the band-8 block *and* the whole surface layer *and* four
  appendix tables. If delivery is at risk, articles 15–21 (the punctuation run, X1–X13 + Z12) split
  cleanly to a ninth agent: they depend only on Chapter 1 (clause types) and Chapter 6 (relative
  clauses), and no other Chapter 8 article depends on them.

### 1.2 Chapter order is the ledger order

The chapter numbers are not a reading instruction — a reference is browsed, and §3 guarantees every
article is reachable from install. They are the **term ledger order**: an article may use a
technical term only if the article that introduces it is earlier in `(chapter_index, sequence_index)`.
That is a lint (§4.4). The order is inherited from TH-R1 §6.2's dependency chains and §7.1's
ordering principle: *build the sentence, then fill it, then join sentences, then arrange information,
then polish the surface.*

**The deliberate departure from convention.** Most references open with the tense system. This one
opens with the clause, and tense does not begin until Chapter 3. You cannot explain the present
perfect to somebody who does not have the words *subject*, *verb* and *helping verb*.

### 1.3 Chapter 1 · `thc_01` · How an English sentence is built

Zero grammar vocabulary assumed. Every term in the reference that other chapters lean on is born
here. No article in this chapter may open with a paradigm table.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_how_to_use` | How to use this reference | overview | orientation; house variety statement |
| 2 | `th_what_a_sentence_is` | What every English sentence needs | foundation | A1, A2, A3 |
| 3 | `th_who_does_what_to_what` | The thing the action lands on | foundation | A4, A5 |
| 4 | `th_describing_the_doer_back` | Sentences that describe instead of act | foundation | A6, A7 |
| 5 | `th_extra_information` | Saying when, where, why and how | foundation | A8 |
| 6 | `th_clause_vs_phrase` | Word groups with a verb, and word groups without | foundation | A9, A10, A11, A12 |
| 7 | `th_finite_and_nonfinite` | Verbs that carry a time, and verbs that do not | foundation | A13, A14 |
| 8 | `th_naming_and_doing_words` | Words for things, and words for what happens | foundation | B1, B2, B12 |
| 9 | `th_describing_words` | Words that describe things, and words that describe actions | foundation | B3, B4 |
| 10 | `th_stand_in_and_pointing_words` | Words that stand in for a noun, and words that go in front of one | foundation | B5, B6 |
| 11 | `th_joining_and_placing_words` | Small words that place things, and small words that join them | foundation | B7, B8, B9 |
| 12 | `th_helper_and_modal_verbs` | Verbs that help other verbs | foundation | B10, B11 |
| 13 | `th_word_building` | How one word turns into another | standard | B13, B14, B15 |
| 14 | `th_phrases` | Words that travel together | standard | C1–C7 |
| 15 | `th_clause_patterns` | The seven shapes an English clause takes | standard | D1–D6 |
| 16 | `th_transitivity_and_linking_verbs` | Verbs that need an object, and verbs that link | standard | D7, D8, D9 |
| 17 | `th_word_order` | The order English puts things in | standard | D10, D11, D12, D13 |
| 18 | `th_four_sentence_shapes` | One clause, two clauses, and clauses inside clauses | standard | D14, D15, D16, D17 |
| 19 | `th_what_sentences_do` | Statements, questions, instructions and exclamations | standard | D18 |
| 20 | `th_where_english_varies` | Where English genuinely has two right answers | paradigm | Z6, Z11 |

**Chapter notes.**

- **Article 6 is the most load-bearing article in the reference.** TH-R1 §4 item 1: every reference
  assumes *clause* and *phrase*; almost none defines them. Ship a **physical test**, not a
  definition: *does this group of words contain something the doer is doing?* Yes → clause. No →
  phrase. Apply it to at least twelve specimens in an `examples` block.
- **Articles 7 (A13/A14) must be here even though the reader will not use finite/non-finite until
  Chapter 5.** The fragment explanation in article 18 is unintelligible without it.
- **Article 16 ships the closed list of linking verbs** (`be, seem, become, appear, feel, look,
  sound, taste, smell, remain, stay, get, turn, grow`) and the fact that they take adjectives, not
  adverbs. TH-R1 flags D8 as under-taught with a high error cost.
- **Article 17 states verb–object adjacency once, as one rule** (D12), rather than as the family of
  separate errors most references treat one at a time.
- **Article 20 is authored last**, after the other seven chapters exist, because it collects their 42
  `variation` blocks. It is a `paradigm` article: one table per variation family, plus the standing
  statement that both varieties are correct, that this pack's examples use British conventions, and
  that **consistency inside one piece of writing is what matters**.

### 1.4 Chapter 2 · `thc_02` · Nouns, and the words in front of them

Placed before the verb chapters because countability and articles are the highest-frequency error
surface, and because the verb chapters need noun phrases to put in their examples.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_kinds_of_noun` | Ordinary names, specific names, and two nouns together | standard | E1, E9 |
| 2 | `th_countability` | Things you can count, and things you cannot | standard | E2, E5, E6, E7 |
| 3 | `th_plurals` | Making a noun mean more than one | paradigm | E3, E4, E18 |
| 4 | `th_group_nouns` | Words that name a group of people | standard | E8 |
| 5 | `th_possession` | Saying that something belongs to something | standard | E10, E11 |
| 6 | `th_article_a_an` | The word *a* in front of a noun | standard | F1 |
| 7 | `th_article_the` | The word *the*, and what it promises the reader | standard | F2, F5, F6 |
| 8 | `th_article_zero` | When a noun needs nothing in front of it | standard | F3, E17 |
| 9 | `th_article_decision` | Which little word goes in front of this noun? | comparison | F4, F7 |
| 10 | `th_this_that_my_your` | Pointing at things, and saying whose they are | standard | F8, F9 |
| 11 | `th_how_much_how_many` | Words for amount | standard | F10, F11, F12 |
| 12 | `th_all_each_every` | Words for the whole, and for every part of it | standard | F13, F14, F15, F18 |
| 13 | `th_numbers_and_shares` | Numbers, positions, and what share of the whole | standard | F16, F17 |
| 14 | `th_pronouns_core` | Words that stand in for a noun | paradigm | G1, G2, G3, G4, G5, G6 |
| 15 | `th_pronouns_pointing` | Making sure the reader knows what a pronoun points at | standard | G7, G8, G15, G16 |
| 16 | `th_relative_and_question_pronouns_named` | *Who*, *which* and *that*: named here, taught later | standard | G9, G10 |
| 17 | `th_people_in_general` | *You*, *one*, *they*, and singular *they* | standard | G13, G14 |
| 18 | `th_it_and_there_first_sight` | The *it* and the *there* that mean nothing | standard | G11, G12 |
| 19 | `th_bigger_noun_group` | Packing more into one noun group | standard | E12, E13, E14, E16 |
| 20 | `th_nominalisation` | Turning an action into a thing | standard | E15 |

**Chapter notes.**

- **Article 2 is upstream of every article error in the reference.** Ship the closed high-frequency
  list of nouns learners pluralise (`research, information, advice, equipment, knowledge, evidence,
  progress, feedback, machinery, accommodation`) and the partitive repair (`a piece of`, `an item
  of`, `a body of`).
- **Article 9 is a procedure, not a rule list.** A rule list cannot be executed mid-sentence. Ship
  the three-question procedure as a `decision_tree`, and make it the article the error-feedback
  "Why?" link lands on for `article_missing_singular`, `article_generic_over_the` and
  `article_specific_missing_the`.
- **Article 18 is an early sighting.** `There has been a sharp rise…` and `It is important to note
  that…` are needed in week one; the information-structure explanation needs Chapter 8. Ship the
  form and the use, one `early_sighting` block pointing at `th_there_is` and `th_it_with_no_meaning`,
  and stop.
- **Article 19 is where academic density comes from** (E13) and **article 20 is the largest single
  stylistic gap between band 6 and band 8 writing** (E15). TH-R1 §8.2 warns that this is exactly the
  material an author will be tempted to shorten because little is written about it elsewhere. Do not.
  Article 20 ships the mechanism in both directions — verb→noun and noun→verb — plus an
  over-nominalisation warning.
- **Article 17 covers singular *they*** and must give the fact **and** the politics: long-established
  for indefinite reference, now standard, and some readers still object.

### 1.5 Chapter 3 · `thc_03` · Verbs, and talking about time

The owner's first named ask, and the chapter with the most damage to undo from prior teaching. Seven
of its 23 articles are `paradigm` kind, so prose load is lower than the article count suggests.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_five_verb_forms` | The five shapes every English verb has | paradigm | H1, H2, H3, H4, H5 |
| 2 | `th_spelling_and_sound_of_endings` | Spelling and sound when you add an ending | paradigm | H6, H7, Z8 |
| 3 | `th_irregular_verbs` | The verbs that do not take *-ed* | paradigm | Z1 |
| 4 | `th_be_have_do` | The three verbs that do two jobs | paradigm | H8, H9, H10 |
| 5 | `th_the_helper_system` | One rule behind questions, negatives, short answers and emphasis | standard | H11, H13, H14 |
| 6 | `th_contractions` | Short forms, and the two that are ambiguous | paradigm | H12, Z9 |
| 7 | `th_state_action_and_objects` | States, actions, and what a verb needs around it | standard | H15, H16, H17, H18 |
| 8 | `th_time_and_tense` | Time in the world, and the shape of the verb | overview | I1, I2, I4, I5, Z7 |
| 9 | `th_present_simple` | Saying what is generally true | standard | I6 |
| 10 | `th_present_continuous` | Saying what is going on around now | standard | I7 |
| 11 | `th_present_choice` | Always, or just now? | comparison | I27 |
| 12 | `th_past_simple` | Talking about a finished event | standard | I10 |
| 13 | `th_past_continuous` | The background an event happened against | standard | I11, I28 |
| 14 | `th_used_to_and_would` | Talking about what you used to do | comparison | I32, I33 |
| 15 | `th_the_perfect_idea` | The idea behind every *have* + third form | standard | I3 |
| 16 | `th_present_perfect` | Saying that something before now still matters | standard | I8 |
| 17 | `th_present_perfect_continuous` | Saying how long something has been going on | standard | I9 |
| 18 | `th_pp_vs_past_simple` | Is the time you mean finished, or still open? | comparison | I29 |
| 19 | `th_pp_simple_vs_continuous` | The result, or how long it took? | comparison | I30 |
| 20 | `th_past_perfect` | The past before the past — and when you do not need it | standard | I12, I13, I31 |
| 21 | `th_the_futures` | The eight ways English talks about the future | paradigm | I14–I23, I26 |
| 22 | `th_future_choice` | Which future form does this sentence need? | comparison | I24, I25 |
| 23 | `th_tense_across_a_text` | Keeping tense steady, and tense in academic writing | standard | I34, I35, I36 |

**Chapter notes.**

- **Article 5 is the highest-leverage article in the whole reference.** Eight surface phenomena —
  questions, negatives, short answers, tags, agreement echoes, emphatic *do*, ellipsis, negative
  inversion — are one mechanism with four properties: **N**egation, **I**nversion, **C**ode
  (ellipsis), **E**mphasis. Teach the four properties, then five short applications. Most references
  teach five unrelated rules and the reader generalises none of them.
- **Article 8 must state the two-tense fact.** English marks only present and past on the verb;
  everything else is aspect and auxiliaries. The twelve-cell grid is a **teaching convention** and
  must be labelled as one in the article, not presented as twelve inflections. It also carries the
  full grid (Z7) with weight markers, defaulted to the weighted view.
- **Articles 1–4 use the two model verbs, *paint* (regular) and *write* (irregular), in every table,
  in every tense, without exception** (TH-R2 §0.1). For *paint*, past and past participle are the
  same string; for *write* they are not. A learner who only ever sees regular verbs cannot see that
  `I painted` and `I have painted` use two different forms, and will later produce *I have wrote*.
- **Article 16's false rule is the keyword rule** — *already / yet / just* → present perfect. It is
  the single most damaging thing taught to learners on this structure and it produces *I have visited
  Verdon last year*. Name it in the wording the learner heard, then kill it.
- **Article 20 must add the second condition to the past perfect**: use it only when the order of
  events is **not already obvious**. Stating only "the past before the past" produces massive
  over-use, where every second past verb becomes *had* + participle.
- **Article 21 covers eight future forms, not one.** `will`, `going to`, present continuous, present
  simple, `be about to`, `be to / be due to / be set to`, `shall`, and the future in the past. Article
  22 is the deciding table the owner asked for, and it must carry the no-`will`-after-*when* rule with
  its exception (embedded questions: *I do not know when it will open*).

### 1.6 Chapter 4 · `thc_04` · Making the verb fit: agreement, attitude and voice

Agreement comes after tense because it cannot be stated without the tense forms. Modality and voice
are the owner's second and third named asks.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_agreement_basics` | Making the verb match who you are talking about | standard | J1, J2, J5, J9 |
| 2 | `th_agreement_across_distance` | When something long sits between the subject and the verb | standard | J11, J12, J17 |
| 3 | `th_agreement_groups_and_amounts` | Groups, amounts, and words that end in *-s* but are not plural | standard | J3, J4, J6, J7, J8, J13, J14, J15, J16, J18 |
| 4 | `th_modal_grammar` | How *can*, *must* and *should* behave | paradigm | K1 |
| 5 | `th_semi_modals` | Helpers made of more than one word | standard | K15, K21 |
| 6 | `th_how_sure_am_i` | Saying how certain you are | standard | K2, K14 |
| 7 | `th_how_sure_about_the_past` | *Must have*, *can't have*, *might have* | standard | K3 |
| 8 | `th_how_necessary` | Rules, obligation, and where it comes from | standard | K4, K5 |
| 9 | `th_mustnt_vs_dont_have_to` | Two negatives that mean opposite things | comparison | K6, K7 |
| 10 | `th_advice` | *Should*, *ought to*, and the one that is a warning | standard | K11 |
| 11 | `th_ability_and_permission` | Saying what you can do, and what you are allowed to do | standard | K8, K9 |
| 12 | `th_requests_offers_suggestions` | Asking somebody to do something | standard | K10 |
| 13 | `th_will_and_would_for_habit` | *Will* and *would* for what typically happens | standard | K12, K13 |
| 14 | `th_modals_with_aspect_and_passive` | Putting a modal in front of a longer verb group | standard | K16, K17, K20 |
| 15 | `th_modals_at_a_glance` | Nine modals, four columns | paradigm | K19, Z10 |
| 16 | `th_hedging_with_modals` | Not claiming more than you can defend | standard | K18 |
| 17 | `th_the_passive_idea` | Putting the thing done to first | standard | L1 |
| 18 | `th_passive_forms` | Building the passive in every tense | paradigm | L2, L3 |
| 19 | `th_when_to_choose_the_passive` | Five reasons to choose the passive, and three not to | comparison | L4, L5, L16 |
| 20 | `th_causatives_and_get_passive` | Having something done, and getting something done | standard | L6, L8, L9 |
| 21 | `th_passive_special_cases` | The passives that behave differently | standard | L7, L10, L11, L12, L13, L14, L15 |

**Chapter notes.**

- **Article 3 carries ten areas because they share one principle**, which article 3 names: the verb
  sometimes follows the *sense* rather than the grammatical form. It is the article that ties `a
  number of` / `the number of`, `half of`, `ten years is`, and the collective nouns together. Ship
  `news / mathematics / politics / economics / physics` (always singular) and `means / series /
  species` (same form for one or many) as **two separate sets** — conflating them is the usual
  reference error.
- **Article 7 gets a full section, not a footnote.** Learners avoid the modal perfect entirely and
  lose the meaning. Paradigm: `must have`, `can't have`, `might have`, `should have` + past
  participle.
- **Article 9 is a meaning reversal produced with total confidence.** *You mustn't apply* and *You
  don't have to apply* are opposites. Minimal pair where the only difference is the negation, both
  meanings written out.
- **Article 17 teaches the passive as an information-ordering device first, formation second.**
  Most references drill formation and then say "the passive is more formal", which produces a learner
  who sprays passives across an essay and breaks their own cohesion. Article 19 ships the five
  conditions: agent unknown, agent obvious, agent irrelevant, focus on the affected thing, and
  **linking to the previous sentence**.
- **Article 21 ships the closed list of verbs that cannot go passive** (`happen, occur, resemble,
  lack, suit, fit, have`). Most references say nothing, and *The event was happened* is the result.

### 1.7 Chapter 5 · `thc_05` · Asking, denying, and what comes after a verb

Questions and negatives are applications of Chapter 3 article 5, which is why they come after it.
Verb patterns are the largest lexis-shaped area in grammar and the chapter must say so up front.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_yes_no_questions` | Questions you answer with yes or no | standard | M1 |
| 2 | `th_wh_questions` | Asking for information | standard | M2, M3 |
| 3 | `th_subject_questions` | Questions where you do not use *do* | standard | M4 |
| 4 | `th_questions_with_prepositions` | *Who did you speak to?* | standard | M5 |
| 5 | `th_short_answers` | *Yes, I have.* | standard | M9 |
| 6 | `th_tag_questions` | *…, isn't it?* | paradigm | M7, M17 |
| 7 | `th_other_question_types` | Negative, alternative, echo and reduced questions | standard | M6, M8, M10, M15, M16 |
| 8 | `th_indirect_and_embedded_questions` | Questions inside a longer sentence | standard | M11, M12, M13, M14 |
| 9 | `th_making_a_sentence_negative` | Putting *not* in the right place | standard | N1, N2 |
| 10 | `th_no_not_and_any` | *No*, *not*, *any*, and which one this sentence needs | standard | N3, N4, N6 |
| 11 | `th_semi_negative_words` | *Never*, *hardly*, *rarely* — negative without *not* | standard | N5, N9 |
| 12 | `th_where_the_not_belongs` | What exactly is being denied | standard | N7, N8, N13, N14 |
| 13 | `th_negative_prefixes_and_answering` | *Un-*, *in-*, *dis-*, and how to answer a negative question | standard | N10, N11, N12 |
| 14 | `th_to_do_and_doing` | The verb forms that carry no time | standard | O1, O2, O3, O4, O5 |
| 15 | `th_verbs_followed_by_ing_or_to` | Which verbs take *-ing* and which take *to* | standard | O6, O7, O13 |
| 16 | `th_verb_object_verb` | *Ask them to come*, *make them think* | standard | O8, O9, O11 |
| 17 | `th_meaning_change_verbs` | *Stop to check* is not *stop checking* | comparison | O12 |
| 18 | `th_that_clauses_after_verbs` | The third way a verb takes what follows | standard | O10 |
| 19 | `th_infinitives_after_adjectives_nouns_purpose` | *Hard to explain*, *the need to act*, *in order to* | standard | O14, O15, O16, O24 |
| 20 | `th_perfect_and_passive_nonfinites` | *To have done*, *being done*, *having been done* | standard | O17, O18, O20, O22, O23 |
| 21 | `th_participle_clauses` | Shortening a *because* or *when* clause | standard | O19, O21 |
| 22 | `th_verb_pattern_table` | Which pattern each verb takes | paradigm | O25, Z2 |

**Chapter notes.**

- **Article 3 gets its own article.** Subject *wh*-questions take no `do` and no inversion (*Who
  announced it?*). Buried in a table everywhere else, and *Who did write the report?* is the result.
  Contrast it explicitly against object questions.
- **Article 6 must ship the intonation**, not only the formation rule. Rising = a real question;
  falling = seeking agreement. Learners form tags correctly and use them wrongly because the meaning
  is carried entirely by intonation. Include the irregular tags: `I am → aren't I`, `let's → shall
  we`, imperative tags, same-polarity tags.
- **Article 8 teaches a word-order rule, not politeness.** *Could you tell me where is the office?*
  is one of the most persistent errors in the language. The same rule is reused verbatim by Chapter 6
  article 21 (reported questions) — link, do not re-teach.
- **Article 12 covers transferred negation** (*I don't think it will work*, not *I think it will not
  work*). Very high frequency, almost never taught.
- **Article 15 must say plainly, in its first screen, that most of this is a list and not a rule.**
  There is exactly **one real rule** (after a preposition, always `-ing`), **one closed
  meaning-change set** (article 17), and **a list** (article 22). Inventing explanations for why
  `enjoy` takes `-ing` makes the reader hunt for a rule that does not exist and stop trusting the
  reference.
- **Article 21 states the shared-subject requirement as the safety rule.** It is the source of the
  dangling-modifier error and the biggest untapped source of academic density at the same time.

### 1.8 Chapter 6 · `thc_06` · Building bigger sentences

The complexity block, and the owner's fifth named ask ("conditions"). Where band 6 becomes band 7.
Reported speech is here rather than with questions because it reuses noun clauses and embedded
questions, both of which are in this chapter or before it.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_joining_equal_clauses` | Joining two clauses that carry equal weight | standard | P1, P2, P29 |
| 2 | `th_hanging_a_clause_on` | Hanging a clause off a main clause | standard | P3, P30, P31 |
| 3 | `th_relative_defining` | Saying which one you mean | standard | P4, P6 |
| 4 | `th_relative_nondefining` | Adding extra information, and the comma that does it | standard | P5, P10 |
| 5 | `th_relative_details` | *Whose*, prepositions, and *many of whom* | standard | P7, P8, P9 |
| 6 | `th_reduced_relatives` | Cutting a *which* clause down to a phrase | standard | P11 |
| 7 | `th_that_clauses` | A whole clause used as a thing | standard | P12 |
| 8 | `th_wh_clauses_and_whether` | *Whether the policy works remains unclear* | standard | P13, P14, P15 |
| 9 | `th_pushing_the_long_part_to_the_end` | *It is widely accepted that…* | standard | P16, P17 |
| 10 | `th_time_and_place_clauses` | *When*, *while*, *until*, *once*, *where* | standard | P18, P19 |
| 11 | `th_reason_purpose_result_clauses` | *Because*, *so that*, *so … that* | standard | P20, P21, P22 |
| 12 | `th_contrast_and_concession` | *Although*, *whereas*, *despite* | standard | P23 |
| 13 | `th_manner_and_comparison_clauses` | *As if*, *than*, *the more … the more*, *except that* | standard | P25, P26, P27, P28 |
| 14 | `th_real_and_unreal` | The past form that is not about the past | standard | Q1 |
| 15 | `th_conditionals_real` | *If* about things that can happen | standard | Q2, Q3, P24 |
| 16 | `th_conditionals_unreal` | *If* about things that are not the case | standard | Q4, Q5, Q6 |
| 17 | `th_other_ways_to_say_if` | *Unless*, *provided that*, *in case*, *had we known* | standard | Q7, Q8, Q9, Q10, Q18 |
| 18 | `th_which_conditional` | Which *if*-sentence does this need? | comparison | Q21 |
| 19 | `th_wish_and_the_unreal_family` | *I wish*, *it's time*, *I'd rather*, *you'd better* | standard | Q11–Q17, Q19, Q20 |
| 20 | `th_reported_speech_and_backshift` | Saying what somebody said | paradigm | R1, R2, R3, R4, R13 |
| 21 | `th_reporting_questions_and_commands` | Reporting a question and reporting an instruction | standard | R5, R6, R7 |
| 22 | `th_reporting_verbs_and_stance` | Choosing the reporting verb on purpose | paradigm | R8, R9, R10, R11, R12 |

**Chapter notes.**

- **Article 4 teaches the meaning and derives the comma.** The comma is a *consequence* of whether
  you are narrowing down which one you mean. Taught as a punctuation rule to memorise, the reader
  punctuates by feel and changes the meaning of their own sentence.
- **Article 6 is the main source of academic noun-phrase density** and it must run in both
  directions: expand a reduced phrase into a relative clause, and reduce a relative clause into a
  phrase.
- **Article 14 names the unreal past once**, and then the second conditional, the third conditional,
  `wish`, `if only`, `would rather`, `it's time`, `as if` and polite distancing become one idea with
  eight wrappers instead of eight unrelated facts. Article 19 is the wrappers. **Do not author
  article 19 before article 14.**
- **Conditionals are taught as two systems with the numbers applied afterwards** (real / unreal),
  matching `staging-grammar/DESIGN.md` §0.5 row 5. The four numbered types are a starting grid, not
  the boundary — article 17 exists to say so.
- **Article 17 must give `unless` its equivalence and its boundary.** "`unless` = `if not`" produces
  *I'd be surprised unless she won*. Ship a worked non-equivalent pair. It also carries inverted
  conditionals with an explicit risk warning: high error surface, formal register only.
- **Article 20 must present backshift with its exceptions, never as obligatory.** Presenting it as
  obligatory is the commonest error in references and it makes learners misreport still-true facts.
  Four named exceptions, each with the reason (the reporter's own commitment to the truth of the
  claim).

### 1.9 Chapter 7 · `thc_07` · Describing, comparing, and the small words

Task 1 language is concentrated here. Half of group T is lexis wearing a grammar costume and the
chapter must say so out loud.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_adjective_position_and_order` | Where a describing word goes, and what order two of them take | standard | S1, S2, S3 |
| 2 | `th_ed_ing_adjectives` | *Frustrated* or *frustrating*? | comparison | S4 |
| 3 | `th_gradable_and_nongradable` | Words you can say *very* with, and words you cannot | standard | S5 |
| 4 | `th_compound_adjectives_and_adjectives_as_nouns` | *A five-year plan*, *the unemployed* | standard | S6, S7 |
| 5 | `th_adjective_patterns` | *Aware of*, *clear that*, *hard to justify* | standard | S8, S9 |
| 6 | `th_making_and_kinds_of_adverbs` | Making an adverb, and the nine kinds there are | standard | S10, S11 |
| 7 | `th_adverb_position` | Where the adverb goes | standard | S12, S13, S17 |
| 8 | `th_focus_and_stance_adverbs` | *Only*, *even*, *frankly*, *arguably* | standard | S14, S15, S16 |
| 9 | `th_degree_adverbs` | *Highly*, *considerably*, *slightly*, *barely* | standard | S18 |
| 10 | `th_comparatives_and_superlatives` | *-er* and *more*, *-est* and *most* | paradigm | S19, S20, S21, S22 |
| 11 | `th_as_as_and_fewer_less` | Saying two things are equal, and comparing downwards | standard | S23, S24 |
| 12 | `th_grading_a_comparison` | *Much bigger*, *twice as many*, *the more … the more* | standard | S25, S26, S27, S29 |
| 13 | `th_similarity_and_careful_superlatives` | *Similar to*, *different from*, *one of the largest* | standard | S30, S31 |
| 14 | `th_describing_change` | *Rose by*, *rose to*, *a rise in* | standard | S28 |
| 15 | `th_prepositions_of_time` | *At*, *on*, *in*, *for*, *since*, *by*, *until* | standard | T1 |
| 16 | `th_prepositions_of_place_and_movement` | Where something is, and which way it goes | standard | T2, T3 |
| 17 | `th_what_else_prepositions_do` | *By* or *with*, and prepositions made of several words | standard | T4, T5, T11 |
| 18 | `th_dependent_prepositions` | The prepositions that are decided for you | paradigm | T6, T7, T8, Z3 |
| 19 | `th_preposition_phrases_and_stranding` | *The rise in unemployment*, and ending with a preposition | standard | T9, T10 |
| 20 | `th_multi_word_verbs` | Verbs made of more than one word | standard | T12, T13, T14, T15, T16, T17 |
| 21 | `th_so_such_too_enough` | *So expensive*, *such a delay*, *too late*, *cheap enough* | standard | V1–V6, V8 |
| 22 | `th_so_do_i_and_mid_degree_words` | *So do I*, *neither do they*, *quite*, *rather* | standard | V7, V9, V10 |

**Chapter notes.**

- **Article 7 must state the mid-position rule precisely**: after the first helping verb, after *be*,
  before other main verbs. "Adverbs go before the main verb" is what references say and it is wrong
  often enough to be useless.
- **Article 8 shows *only* in three positions in the same sentence with three glosses.** A focus
  adverb in the wrong place changes the meaning silently, and the reader never finds out.
- **Article 14 is a Task 1 requirement.** *Rose by 5%* ≠ *rose to 5%* ≠ *a rise in prices*. Three
  prepositions, three meanings, one article.
- **Articles 18 and 20 must be labelled as lists, not rules.** Dependent prepositions are chunks. Say
  so, ship the list grouped by preposition **and** by base word so it can be searched either way, and
  point at the vocabulary module for the items. Article 20 kills the myth that multi-word verbs are
  informal: `carry out`, `point out`, `result in`, `bring about`, `account for` are register-neutral
  or academic; others are firmly spoken. It also ships the pronoun rule (*turn it down*, never *turn
  down it*), which is the single most useful rule in the area.
- **Article 1 gives adjective order as a strong tendency, not a law.** References disagree about the
  middle slots. Give the default that sounds right and say that it is a default.

### 1.10 Chapter 8 · `thc_08` · Putting the emphasis where you want it, and getting the surface right

The band-8 block plus the surface layer. It comes last because it is about *choosing between* the
structures the earlier chapters built.

| # | Article id | Title | Kind | Areas |
|---|---|---|---|---|
| 1 | `th_given_and_new` | Old information first, new information last | standard | U1, U2, U20 |
| 2 | `th_there_is` | Saying that something exists | paradigm | U15 |
| 3 | `th_it_with_no_meaning` | *It is important to…* | standard | U16, U17 |
| 4 | `th_there_or_it` | *There* or *it*? | comparison | U18 |
| 5 | `th_fronting` | Putting the unusual thing first | standard | U3 |
| 6 | `th_clefts` | *It was the bridge that…*, *What we need is…* | standard | U4, U5, U6, U7 |
| 7 | `th_inversion_for_emphasis` | *Never before had they…* | standard | U8, U9, U10, U11 |
| 8 | `th_other_ways_to_emphasise` | *I did check*, *the council itself*, *by far* | standard | U12, U13, U14, U19 |
| 9 | `th_reference_words` | Pointing back at something you already said | standard | W1, W9 |
| 10 | `th_this_plus_summary_noun` | *This approach*, *these findings* | standard | W2 |
| 11 | `th_substitution_and_ellipsis` | Saying it again with a short word, and leaving words out | standard | W3, W4 |
| 12 | `th_linking_words_by_function` | Linking words, sorted by what they do | paradigm | W5, W6, W7, Z4 |
| 13 | `th_although_vs_however` | *Although* and *however* are not interchangeable | comparison | W8 |
| 14 | `th_paragraphs_and_consistency` | The grammar of a first sentence, and staying consistent | standard | W10, W11, W14 |
| 15 | `th_capitals_stops_and_commas` | Capital letters, full stops and commas | standard | X1, X2, X3 |
| 16 | `th_comma_splice_and_its_repairs` | Joining two sentences with a comma, and the four legal repairs | standard | X4, X5, X6, X7 |
| 17 | `th_apostrophes` | Apostrophes, and *its* against *it's* | standard | X8, X9 |
| 18 | `th_quotation_hyphens_and_lists` | Quotation marks, hyphens, list punctuation | standard | X10, X11, X12, X13 |
| 19 | `th_numbers_dates_and_short_forms` | Numbers, dates, and *e.g.* against *i.e.* | standard | X14, X15, X16 |
| 20 | `th_spelling_and_confusable_words` | *-ise* or *-ize*, *their/there/they're*, paragraphs | standard | X17, X18, X19, X20 |
| 21 | `th_punctuation_at_a_glance` | Every mark, its jobs, and the error it is associated with | paradigm | Z12 |
| 22 | `th_spoken_grammar_is_not_broken` | Spoken grammar is different grammar, not worse grammar | standard | Y1–Y5, W12, W13 |
| 23 | `th_formality_hedging_and_boosting` | How formal is this, and how hard are you pushing? | standard | Y6, Y7, Y8, Y10, Y11, Y13 |
| 24 | `th_writing_without_i_and_being_polite` | Writing without *I*, and being polite by being indirect | standard | Y9, Y12, Y14 |
| 25 | `th_getting_it_right_under_pressure` | The last three minutes | standard | Y15, Y16, Y17 |

**Chapter notes.**

- **Article 1 comes before articles 2–8 because it is the principle they all implement.** Without
  given–new, the passive, the cleft, fronting and *there is* look like four arbitrary tricks. Teach
  it first; then each of the four becomes an application. It is also the article that closes the loop
  back to Chapter 4 article 19.
- **Articles 5, 6 and 7 ship with a risk warning.** Inversion after a negative adverbial has an error
  surface of four. A structure that half-works costs more than the simple one that works. Article 25
  makes that framing explicit and reusable.
- **Article 10 is the highest cohesion payoff per minute in the reference** and almost nobody teaches
  it. *This* on its own is vague; *this approach* / *these findings* / *this shift* is the move.
- **Article 12 is organised by function, never alphabetically**, and it puts the subordinator, the
  conjunct and the preposition version of each function **side by side in three columns**. That
  column layout is the whole fix for article 13's error, which is one of the most common in learner
  writing and which the learner believes is a stylish sentence.
- **Article 12 also carries linker restraint (W6).** Mechanical over-signposting is a band-limiting
  habit and this entry exists to undo damage the reader has already taken.
- **Article 22 is one of the most valuable articles in the reference.** Contractions, ellipsis, tags,
  `get`-passives, fronting, phrasal verbs, `going to` — right in one place, wrong in the other. It is
  the owner's "when to use which" applied to register instead of to form.
- **Article 25 converts 24 chapters of description into something executable**: agreement → articles
  → sentence boundaries → tense consistency. It is the page a reader reopens the night before a test.

### 1.11 The coverage acceptance test

**Every one of the 474 area ids in TH-R1 §3 is assigned to exactly one article above.** That is the
test, and it is mechanical:

1. Extract every `area_ids[]` value from every authored article.
2. The multiset must equal the id set A1–A14, B1–B15, C1–C7, D1–D18, E1–E18, F1–F18, G1–G16,
   H1–H18, I1–I36, J1–J18, K1–K21, L1–L16, M1–M17, N1–N14, O1–O25, P1–P31, Q1–Q21, R1–R13,
   S1–S31, T1–T17, U1–U20, V1–V10, W1–W14, X1–X20, Y1–Y17, Z1–Z12.
3. **No duplicates** (an area is owned by one article; other articles cross-link to it) and **no
   omissions**.
4. An area may be *mentioned* in another article as an `early_sighting`; that does not put it in
   `area_ids[]`.

**Nothing from the coverage map is dropped.** Three things are *relocated* rather than dropped, and
this is the record of it:

| Item | TH-R1 put it | This contract puts it | Why |
|---|---|---|---|
| Z5 — the glossary | Appendix E | **Not an authored article.** Built from the term ledger (§4.3) by the build step | It is a derived index, and hand-authoring it guarantees it drifts from the ledger |
| The 44-chapter structure | §7.2 | The *section* level inside 8 chapters | Eight authoring units. The 44 chapters survive as the heading structure inside a chapter's article run |
| The 12-part navigation | TH-R4 §13.2 | The 8 chapters are the Map | Eight rows fit on one screen better than twelve, which is what §13.2 was optimising for |

**And this is what TH-R1 §10 rules out of scope, restated so a reader can tell a gap from a
boundary.** Article 1 of Chapter 1 states this edge to the reader in plain words:

historical grammar and etymology; phonology beyond the `-s`/`-ed` endings, contractions and question
intonation; dialect grammar (named as existing and valid, then out of scope); the subjunctive beyond
`were` and the mandative; exhaustive irregular-verb coverage beyond the high-frequency set; `whom`
and the future perfect continuous as production targets (recognition only); syntactic trees; corpus
statistics; and any structure with no communicative payoff.

---

## 2. THE ARTICLE SCHEMA

### 2.1 Storage decision

Theory ships as a **fourth pack table**, `theory_articles`, with **one blob column**, `article_json`,
holding everything. This inherits the practice module's hard-won constraint
(`staging-grammar/DESIGN.md` §0.3): `TABLE_COLUMNS` copies only the columns it lists, so **any extra
top-level row key is silently dropped at import**. All payload lives in the blob.

```jsonc
// one row of data/theory.jsonl — exactly seven keys, in this order
{
  "id": "th_pp_vs_past_simple",
  "chapter_id": "thc_03",
  "sequence_index": 71,          // global, 1..175, unique, = ledger position
  "title": "Is the time you mean finished, or still open?",
  "kind": "comparison",          // foundation | standard | comparison | paradigm | overview | myth
  "cefr_level": "A2",            // A1 A2 B1 B2 C1 C2
  "article_json": { /* §2.2 */ }
}
```

`theory.jsonl` needs a `ROW_SCHEMAS` entry, a `DATA_FILES` entry, a `TABLE_COLUMNS` entry and a place
in `IMPORT_ORDER`, or `validate_rows` warns-and-ignores it, imports nothing, and the pack still
reports OK. **That is a build-agent dependency, not a content-agent one.** Author as specified and
report it.

Never author `source`, `pack_id`, `pack_version`, `license`, `retired` or `created_at` — the loader
supplies them.

### 2.2 `article_json` — top level

```jsonc
{
  "schema_version": 1,

  // ---- identity and framing -------------------------------------------------
  "also_called": "Present perfect or past simple?",   // REQ. The technical name. Subtitle only
  "one_line": "This lets you choose between two past forms that are both correct English, so the
               sentence says what you actually mean.",             // REQ, 12–30 words
  "short_answer": "Ask whether the time period is finished. Finished, use the past simple: closed
                   in 2019. Still open, use the present perfect: has closed since 2019.",
                                                                    // REQ, <= 25 words
  "question_in_learner_words": "How do I choose between I did and I have done?",  // REQ, <= 20 words

  // ---- placement ------------------------------------------------------------
  "area_ids": ["I29"],                       // REQ, >= 1. From TH-R1 §3. The coverage test
  "prerequisites": ["th_present_perfect", "th_past_simple"],   // REQ (may be []). ADVISORY ONLY, §3
  "register": "both",                        // REQ. spoken | written | both
  "risk_note": null,                         // REQ, null or <= 40 words. Non-null for high-risk forms
  "error_surface": 2,                        // REQ, integer 1–5. Independent things that must be right

  // ---- the body -------------------------------------------------------------
  "body": [ /* §2.4, ordered typed blocks */ ],

  // ---- the term ledger ------------------------------------------------------
  "terms_introduced": [                      // REQ (may be []). This article is the sole introducer
    { "term": "past participle", "gloss": "the third form: gone, eaten, written",
      "also_called": "third form", "ledger_position": 68 }
  ],
  "term_refs": ["tense", "past participle", "clause"],   // REQ. Every metalanguage term used here

  // ---- links out ------------------------------------------------------------
  "related_points": ["gr_pp_vs_past_simple", "gr_past_time_markers"],  // REQ, from the closed 154
  "no_practice_reason": null,                // REQ when related_points is []. <= 25 words
  "related_articles": [                      // REQ, 2–4, each with a reason
    { "id": "th_present_perfect", "reason": "how the form is built, in full" }
  ],
  "fixes_errors": ["tense_finished_time_with_perfect", "tense_open_time_with_past"],
                                             // REQ (may be []). From the 53-slug closed enum
  "confusion_set": "cs_past_time_reference", // REQ on kind: comparison, else null. Closed 19

  // ---- search and navigation ------------------------------------------------
  "aliases": ["present perfect vs past simple", "have done or did", "tenses past"],  // REQ, 2–6
  "intents": ["talk about something that happened before now and still matters"],    // REQ, 0–3
  "on_start_here_path": false,               // REQ. §3.4
  "variation_refs": [1],                     // REQ (may be []). TH-R1 §5 row numbers covered here
  "estimated_read_minutes": 6                // REQ, integer 2–9
}
```

**Field notes that carry weight.**

- **`short_answer` is the highest-value 25 words in the module.** It is what appears in a search
  result row, in a link preview from a practice point, and it is the whole article for a reader who
  arrived mid-task with 30 seconds. Its rule: *state the most common case as an instruction, with one
  example, and no hedging.* A `short_answer` that begins "The present perfect is a tense which may
  be used…" is a failure.
- **`question_in_learner_words` is the one-question test made into a field.** Write it before you
  write anything else. If it needs two sentences or a semicolon, you have two articles (§6.4).
- **`also_called` is the technical name and it is always second.** Plain-English name in `title`,
  technical name in `also_called`. Both always present, in that order, because a reader given only
  the plain name cannot look anything up anywhere else.
- **`error_surface` ships to the reader** on high-risk articles: *the number of independent things
  that must all be right for the sentence to come out clean.* `whereas` is 1. Negative-adverbial
  inversion is 4. Both read as "complex"; only one is worth a band-6 learner's nerve on test day.
- **`risk_note` is non-null on inversion, mixed conditionals, clefts, inverted conditionals and
  `whom`**, and it says what to use instead.
- **`fixes_errors[]` uses the same 53-slug closed enum as `staging-grammar/DESIGN.md` §2.8.** One
  taxonomy across practice items, error feedback, drills and theory. A second taxonomy means the
  "Why?" link from writing feedback resolves to nothing for half the codes.
- **`related_points[]` ids come from the closed 154 in `staging-grammar/DESIGN.md` §4.2.** Never
  invent one. Roughly seventy areas have no practice point at all — metalanguage, complete paradigms,
  recognition-only structures, written conventions, variation, organising concepts. Those articles
  set `related_points: []` and write `no_practice_reason`. That is expected and it is the reason the
  Theory tab exists.

### 2.3 The six article kinds

| `kind` | What it is | Body words | Headings | Tables | Examples | Required blocks |
|---|---|---|---|---|---|---|
| `foundation` | Chapter 1's articles. No assumed terms | 350–650 | 3–5 | 0–1 | 6–10 | `term_intro`, `rule`, `examples`, `summary` |
| `standard` | One structure, fully | 600–1,100 | 5–8 | 1–3 | 8–14 | `rule`, `examples`, `warning`, `false_rule`, `summary` |
| `comparison` | X against Y | 450–850 | 4–6 | 1–2 | 6–12, in pairs | `contrast`, `decision_tree`, `warning`, `false_rule`, `summary` |
| `paradigm` | The all-at-once table | ≤ 350 prose | 2–4 | 1 large | 1 per row group | `paradigm`, `examples`, `summary` |
| `overview` | A chapter or system opener | 200–400 | 2–3 | 1 | 0–3 | `table`, `summary` |
| `myth` | A false rule, killed | 200–450 | 3 fixed | 0 | 4–6 | `false_rule`, `examples` |

**Hard cap: 1,400 body words.** An article over the cap is **split, never compressed** (§6.3).
Compressed reference prose is the densest, least readable text there is, and it is where the passive
voice and the nominalisations creep back in.

`kind: myth` is used sparingly — only where a false rule is large enough to be the thing a reader
searches for (*"can you start a sentence with because"*). Otherwise a myth is a `false_rule` block
inside the article that owns the structure.

### 2.4 THE BLOCK TYPES

`body` is an **ordered array of typed blocks**. Nineteen types, closed set. A block is
`{"type": "<name>", …}`. Two fields are available on every block:

| Field | Type | Rules |
|---|---|---|
| `anchor` | string, kebab-case | Unique within the article. **Required** on `heading`, `paradigm`, `table`, `contrast`, `decision_tree`, `warning`, `summary`, `quick_check` — these are deep-link targets for the "Why?" link from error feedback |
| `collapsed` | boolean, default `false` | **Only permitted** on `exceptions`, `variation`, `l1_note`, `quick_check`. Collapsed content must be ≤ 40% of the article; more than that means it is really two articles |

Markup inside any string field is **inline-only and closed**: `*italic*` for a cited language form
(*have*, *the*, *-ing*), `**bold**` for a marked target or a term being named. Nothing else. No
Markdown headings, no links, no HTML, no tables-in-strings, no unicode diagrams.

#### 2.4.1 `heading`

```jsonc
{ "type": "heading", "level": 2, "text": "Is the time period finished, or still running?",
  "anchor": "is-the-period-finished" }
```

| Field | Req | Rules |
|---|---|---|
| `level` | ✔ | `2` or `3`. **Two levels only.** Three levels of nesting on a phone is unnavigable |
| `text` | ✔ | ≤ 12 words. **A full statement or a question, in the learner's vocabulary.** Never a topic label |
| `anchor` | ✔ | kebab slug, unique in article |

**Headings carry the content.** A reader who reads only your headings must come away with the rule.
That is not a stretch goal — it is how most readers read this reference.

| ✗ Topic heading | ✓ Statement or question |
|---|---|
| Form | How to build it |
| Usage | When you use it |
| Exceptions | Three cases where this does not apply |
| Present perfect vs past simple | Is the time period finished, or still running? |
| Adverbs of frequency | Where *always*, *often* and *never* go in a sentence |
| Notes | What to watch out for |
| Conclusion | *(delete — reference articles have no conclusions)* |

#### 2.4.2 `prose`

```jsonc
{ "type": "prose", "text": "English does not have a single way of talking about the future. It has
                            eight. Each one says something slightly different about how the speaker
                            sees the event." }
```

| Field | Req | Rules |
|---|---|---|
| `text` | ✔ | **One paragraph per block.** ≤ 60 words and ≤ 4 sentences (≤ 50 and ≤ 3 in `foundation`). Multiple paragraphs = multiple blocks |

Prose is for **reasons**. If the content is a grid, it is a `table`. If it is a list of things that go
together, it is a `list`. A paragraph that contains no "because", no "so" and no "but" is usually a
table in disguise.

#### 2.4.3 `list`

```jsonc
{ "type": "list", "style": "bullet",
  "lead_in": "The passive is the right choice in five situations:",
  "items": ["you do not know who did it",
            "everybody already knows who did it",
            "who did it does not matter",
            "the thing it was done to is what the sentence is about",
            "the previous sentence ended on the thing it was done to"] }
```

| Field | Req | Rules |
|---|---|---|
| `style` | ✔ | `bullet` or `number`. Use `number` only when order or count matters |
| `lead_in` | ✔ | One sentence ending in a colon. It says what the list is a list *of* |
| `items` | ✔ | 2–7 strings, each ≤ 20 words, each **grammatically parallel** with the others |

#### 2.4.4 `rule`

```jsonc
{ "type": "rule", "anchor": "the-rule",
  "text": "Use the present perfect when the period of time you are talking about is still open, or
           when you name no time at all." }
```

| Field | Req | Rules |
|---|---|---|
| `text` | ✔ | ≤ 30 words. **Stated bare. No hedges.** No "generally", "usually", "in most cases", "tends to" |

**The rule sentence carries no hedging, ever.** Hedges in a rule are how a rule becomes unusable —
the reader cannot tell whether they are allowed to apply it. The hedging goes in the `exceptions`
block, where it belongs and where it is counted, frequency-labelled and verdict-labelled.

Every `rule` block must be followed, before the next `rule` or `heading`, by an `examples` block with
**≥ 3 items**.

#### 2.4.5 `table`

```jsonc
{ "type": "table", "anchor": "which-future",
  "caption": "The evidence in front of you decides between will and going to.",
  "headers": ["What you have", "Use", "Example"],
  "rows": [
    ["a decision you just made", "*will*", "Fine — I'll ring the depot now."],
    ["a decision made earlier", "*going to*", "We're going to repaint the Verdon gates."],
    ["evidence you can point at", "*going to*", "Those clouds are heavy. It's going to rain."]
  ],
  "weight_column": false,
  "footnotes": ["Both are standard English. Neither is more formal than the other."] }
```

| Field | Req | Rules |
|---|---|---|
| `caption` | ✔ | ≤ 16 words. **States the takeaway, not the topic.** ✗ "Modal verbs" ✓ "*Must* is the strong one; *should* is advice; *might* is a maybe" |
| `headers` | ✔ | 2–5 columns on mobile. Beyond 4, a stacked-card fallback is required |
| `rows` | ✔ | ≥ 2 rows. Every row has exactly `headers.length` cells |
| `weight_column` | — | `true` adds a frequency-weight column (§2.4.6) |
| `footnotes` | — | 0–3 strings |

**Ten standards, all lintable.**

| # | Standard |
|---|---|
| TAB-1 | Never a one-row or one-column table. That is a sentence or a list |
| TAB-2 | **Cells ≤ 9 words.** If a cell needs a sentence, the content is prose |
| TAB-3 | The caption states the takeaway |
| TAB-4 | **The leftmost column is the thing the reader already has** — the meaning they want, the word they typed, the situation they are in. Never the grammatical name |
| TAB-5 | **The row-reads-aloud test.** Joining the row header to each cell with its column header must produce a true sentence. If it does not, the table has two ideas in it |
| TAB-6 | Every table is followed **immediately** by a worked example per row group, physically adjacent. Never "as shown in the table above" |
| TAB-7 | Wide tables scroll inside their own container, never the page |
| TAB-8 | **No abbreviations in cells.** No *sb*, no *sth*, no *V3*, no bare *+ing*. Learner references are full of these and they are a second language to learn |
| TAB-9 | Empty cells are `"—"` **and are explained** in `footnotes` or `gaps`. An unexplained empty cell reads as an authoring mistake |
| TAB-10 | Never use a table for: two forms whose difference is meaning (use `contrast`); a rule with nested conditions (use `decision_tree`); frequency advice (cells cannot hedge); fewer than four data points; exceptions (a table of exceptions looks like a rule) |

#### 2.4.6 `paradigm`

The article's reason to exist. This is what the owner asked for when they said *"include ALL so they
can view all structural things"*.

```jsonc
{ "type": "paradigm", "anchor": "present-perfect-forms",
  "caption": "Only have changes. The second word is always the third form.",
  "form_line": "have / has + third form",
  "model_verbs": ["paint", "write"],
  "headers": ["Who", "Positive", "Short form (spoken)", "Negative",
              "Short form (spoken)", "Question"],
  "rows": [
    { "cells": ["I", "I have painted", "I've painted", "I have not painted",
                "I haven't painted", "Have I painted?"], "weight": "high" },
    { "cells": ["he / she / it", "he **has** painted", "he's painted", "he has not painted",
                "he hasn't painted", "**Has** he painted?"], "weight": "high",
      "note": "This is the only row where the helper changes." }
  ],
  "sub_tables": [
    { "caption": "The short answer repeats only the helper.",
      "headers": ["Question", "Yes", "No"],
      "rows": [["Have you painted it?", "Yes, I have.", "No, I haven't."]] }
  ],
  "gaps": [{ "cell": "future perfect continuous, passive",
             "note": "This combination is not used. Rewrite in the active." }],
  "examples": [
    { "text": "The contractors have painted the Verdon river bridge.",
      "gloss": "The job is done and the bridge is painted now.", "register": "neutral" }
  ],
  "notes": ["*he's painted* is *he has painted*. The third form after it is the clue.",
            "Never *Yes, I've.* A short answer cannot end on a short form."] }
```

| Field | Req | Rules |
|---|---|---|
| `caption` | ✔ | The takeaway, ≤ 16 words |
| `form_line` | ✔ | The pattern in one line, in plain words. No abbreviations |
| `model_verbs` | ✔ for verb paradigms | **`["paint", "write"]` — one regular, one irregular, in every verb table without exception** |
| `headers` | ✔ | Must include a **negative** column and a **question** column (see PAR-3) |
| `rows[].cells` | ✔ | Strings, `"—"` for a deliberate gap |
| `rows[].weight` | ✔ on tense/modal grids | `high` \| `medium` \| `low`. Rendered ●●● / ●● / ● |
| `rows[].note` | — | ≤ 16 words |
| `sub_tables` | — | 0–3. Short answers, contracted negatives, question-word variants |
| `gaps` | ✔ when any cell is `"—"` | `{cell, note}`. The note says *why* the combination is not used |
| `examples` | ✔ | ≥ 1 per row group, physically adjacent, with `gloss` and `register` |
| `notes` | — | 0–5, each ≤ 25 words |

**Six standards specific to paradigms.**

| # | Standard |
|---|---|
| PAR-1 | **One regular and one irregular model verb, always.** For *paint*, past and past participle are the same string; for *write* they are not. A learner who only sees regular verbs cannot see that two different forms are hiding behind one spelling, and will later write *I have wrote* |
| PAR-2 | **A contracted / spoken column, explicitly labelled as speech**, on every auxiliated form. Never merged into the headline form, never omitted. Contractions are what the reader will *hear*; full forms are what an academic essay takes |
| PAR-3 | **Negative and question rows are part of the paradigm, not an afterthought.** Learners get positives right and negatives wrong. A table showing only affirmatives has taught a third of the form |
| PAR-4 | **Weight markers on any grid that implies a menu of equally available choices.** A twelve-cell tense table without them frightens a beginner and lies about frequency. Three levels only, qualitative, **never a percentage** |
| PAR-5 | **Ship the full paradigm in a `kind: paradigm` article, and never reproduce it inside a teaching article.** The present perfect article shows the present perfect, its negative and its question, and links to the big table. Two copies drift |
| PAR-6 | **Default the big grid to the weighted view**, with one tap to show everything. The beginner sees six forms; the curious learner sees twelve. Nothing is hidden and nothing is dumped |

#### 2.4.7 `examples`

```jsonc
{ "type": "examples",
  "lead_in": "Only the subject changes here. Watch what happens to *have*.",
  "dimension": "the subject",
  "items": [
    { "text": "I have signed the Norland form.", "gloss": "It is signed. It is done now.",
      "register": "neutral", "marks": [{ "span": "have signed", "role": "target" }] },
    { "text": "The inspector has signed the Norland form.", "gloss": "Same thing, one signer.",
      "register": "written_formal", "marks": [{ "span": "has signed", "role": "target" }] }
  ],
  "so_what": "Only the subject changed. *Have* became *has*, and the third form did not move." }
```

| Field | Req | Rules |
|---|---|---|
| `lead_in` | ✔ | One sentence. **Names the dimension that is varying** |
| `dimension` | ✔ | 1–4 words. What is being held still except one thing |
| `items` | ✔ | 3–8. Each `text` ≤ 16 words |
| `items[].gloss` | ✔ | What the sentence **means about the world**, not about the grammar |
| `items[].register` | ✔ | `spoken` \| `written_formal` \| `neutral` |
| `items[].marks` | — | `{span, role}`. `span` must be an **exact substring** of `text`. `role` ∈ `target` \| `deciding` \| `wrong` \| `fixed` |
| `so_what` | ✔ | One sentence. **What the reader should have seen**, not what the grammar is called |

**Rules on example sets.**

| # | Rule |
|---|---|
| EX-1 | **Vary one dimension at a time.** Four examples that differ in exactly one thing teach more than twelve that differ in all of them. Two short controlled sets beat one long uncontrolled set, every time |
| EX-2 | Any set of ≥ 4 contains **at least one `spoken` and at least one `written_formal`** item. A reference showing only written-academic examples teaches a learner to speak like an essay |
| EX-3 | `so_what` is required and must stand alone. ✓ *"Both are correct English. The difference is whether she is still there."* ✗ *"These examples illustrate the present perfect."* |
| EX-4 | A `wrong` role never appears in the first 120 words of an article, and never without a `fixed` counterpart on the same screen. Learners copy what they see first |
| EX-5 | House world. IELTS-adjacent topics: study, work, transport, environment, health, technology, city life |
| EX-6 | **At most one unfamiliar word per example**, and it is not the target's neighbour. If the reader must decode the frame, they cannot see the pattern |
| EX-7 | No proper noun carries the meaning of the example. Otherwise the reader learns a fact, not a form |
| EX-8 | Every example is **plausible in the house world**. A learner who notices an example is nonsense stops trusting the page |
| EX-9 | ≤ 16 words per example sentence |
| EX-10 | No example sentence is shared with a practice item or with another article (T-BOUND-3) |

**Per-article minima:** 3 examples per stated `rule`; 3 minimal pairs per `contrast`; 1 wrong+right
per `warning`; 6 examples minimum per article, 20 maximum.

#### 2.4.8 `contrast`

**The highest-value block in the module.** The owner asked for "when to use which" twice. Required on
every `kind: comparison` article, and permitted on any `standard` article whose structure has a rival.

```jsonc
{ "type": "contrast", "anchor": "which-past-form",
  "question": "Is the period of time I am talking about finished?",
  "options": [
    { "label": "past simple",
      "use_it_when": "The period is finished and usually named: *last month*, *in 2019*, *when I was a student*.",
      "example": "Applications closed at the end of March.",
      "point_id": "gr_past_simple_regular" },
    { "label": "present perfect",
      "use_it_when": "The period runs up to now — *since*, *so far*, *this year* — or no time is named at all.",
      "example": "Applications have closed twice since the scheme began.",
      "point_id": "gr_present_perfect" }
  ],
  "minimal_pairs": [
    { "a": { "text": "She taught at the Ashfield school for eleven years.",
             "means": "She does not teach there now. The eleven years are over.",
             "span": "taught" },
      "b": { "text": "She has taught at the Ashfield school for eleven years.",
             "means": "She still teaches there. The eleven years are still running.",
             "span": "has taught" },
      "only_difference": "taught / has taught" }
  ],
  "deciding_factor": "Find the time expression. If you can put a full stop after it and it means a
                      closed time, the verb is past simple.",
  "trap": "Learners are taught that the present perfect is the experience tense and reach for it
           whenever the sentence is about experience — which is most of the time.",
  "register_note": "Both, and it pays everywhere: Speaking Part 1, Task 1 with an open end date,
                    Task 2 background sentences." }
```

| Field | Req | Rules |
|---|---|---|
| `question` | ✔ | ≤ 16 words. **The single question that resolves the choice**, in plain words. A learner under time pressure can hold one question in their head, not a rule set |
| `options` | ✔ | 2–5. One row per rival form |
| `options[].label` | ✔ | The form's name, plain first where a plain name exists |
| `options[].use_it_when` | ✔ | ≤ 30 words. An instruction |
| `options[].example` | ✔ | One authored sentence, ≤ 16 words |
| `options[].point_id` | — | The practice point that drills this option, from the closed 154 |
| `minimal_pairs` | ✔ | **3–5.** Fewer than 3 and the reader thinks the two forms are synonyms |
| `…a.text` / `…b.text` | ✔ | **Both grammatical.** A pair whose B member is wrong is a `warning`, not a pair |
| `…a.means` / `…b.means` | ✔ | Full sentences **about the world**, not about the grammar. Drop these and you have a quiz |
| `…a.span` / `…b.span` | ✔ | **Exact substrings** of the corresponding `text`. The renderer highlights them; a span that does not match silently highlights nothing and the feature quietly dies |
| `only_difference` | ✔ | The human label for the change. It must really be the only difference |
| `deciding_factor` | ✔ | ≤ 35 words, one line the reader could write on their hand |
| `trap` | ✔ | The **plausible wrong reasoning** that produces the error, named out loud. Not "students often confuse these" |
| `register_note` | ✔ | ≤ 35 words. Which of these belongs in speech, which in writing, and where the decision pays |

**The four rules of a minimal pair.** Two sentences, two meanings, and the named difference. A pair
differs in **exactly one span** — not two, not "one plus a tiny word". Drop the meanings and you have
a quiz. Drop the named difference and the reader will notice the wrong thing, and what they notice
becomes their rule.

**Do not build a pair on a keyword.** If the only thing separating A from B is *already* or *since*,
the reader learns the keyword and not the decision. A pair that leans on a time expression must be
followed immediately by one that does not.

#### 2.4.9 `decision_tree`

For a rule with nested conditions, which a table cannot hold. Required on every `kind: comparison`
article and on the article-choice, future-choice and conditional-choice articles.

```jsonc
{ "type": "decision_tree", "anchor": "three-second-test",
  "intro": "Three questions, in this order. Stop at the first one that answers.",
  "steps": [
    { "id": "s1", "ask": "Is there a time expression in the sentence?",
      "branches": [
        { "answer": "Yes", "goto": "s2" },
        { "answer": "No", "goto": "s3" } ] },
    { "id": "s2", "ask": "Can you put a full stop after it and have it mean a closed time — *in 2019.* *last week.*?",
      "branches": [
        { "answer": "Yes",
          "verdict": { "use": "past simple", "example": "The line closed in 2018.",
                       "why": "A closed time and the present perfect cannot share a clause." } },
        { "answer": "No — *since 2015*, *so far*, *this year*",
          "verdict": { "use": "present perfect", "example": "The line has closed twice since 2015.",
                       "why": "The period is still running, so the verb stays open too." } } ] }
  ] }
```

| Field | Req | Rules |
|---|---|---|
| `intro` | ✔ | One sentence, says how many questions there are |
| `steps` | ✔ | 2–4 steps. **Maximum depth 3.** More than that is a flowchart, and a flowchart cannot be executed mid-sentence |
| `steps[].id` | ✔ | Unique within the block |
| `steps[].ask` | ✔ | ≤ 20 words, a yes/no or a short-choice question in plain words |
| `branches` | ✔ | 2–3 per step. Each has **either** `goto` **or** `verdict`, never both, never neither |
| `verdict.use` | ✔ | The form to use |
| `verdict.example` | ✔ | One authored sentence |
| `verdict.why` | ✔ | ≤ 25 words |

A `decision_tree` must terminate: every `goto` resolves to a later step in the same block, and every
path ends in a `verdict`. No cycles.

#### 2.4.10 `warning`

A common error, named with the reasoning step that produced it. 2–5 per `standard` article.

```jsonc
{ "type": "warning", "anchor": "finished-time-with-perfect",
  "code": "tense_finished_time_with_perfect",
  "wrong": "The council has approved the plan in 2019.",
  "right": "The council approved the plan in 2019.",
  "why_it_happens": "The writer is thinking about the result — the plan is still approved — and
                     reaches for the form that links back to now. But *in 2019* closes the period.",
  "smallest_fix": "Take the time expression out, or change *has approved* to *approved*." }
```

| Field | Req | Rules |
|---|---|---|
| `code` | ✔ | From the **53-slug closed enum** in `staging-grammar/DESIGN.md` §2.8. A value outside the set is a merge-gate failure |
| `wrong` | ✔ | Authored, never copied. A real learner sentence shape. Never in the first 120 words of the article |
| `right` | ✔ | The minimal repair. Shown at least as prominently as `wrong` |
| `why_it_happens` | ✔ | ≤ 45 words. **Name the plausible reasoning step.** The broken form came from somewhere sensible, and naming that step is what interrupts it. "Students often confuse these" names nothing |
| `smallest_fix` | ✔ | ≤ 25 words. An instruction |

`wrong` strings are indexed by search (a learner types the sentence they are worried about and lands
on the row that names it), so write them as the learner would really write them.

#### 2.4.11 `false_rule`

**Required on every `standard` and `comparison` article.** The reader has usually already been taught
something, badly, and a correct explanation that does not name and kill the wrong one loses, because
the false rule is louder and older.

```jsonc
{ "type": "false_rule",
  "heard": "If the sentence has *already*, *yet* or *just* in it, you must use the present perfect.",
  "also_known_as": ["the signal-word rule", "the keyword rule"],
  "truth": "Those words often turn up with it, but they do not decide it. The time period decides.
            *I have visited Verdon in 2019* is wrong even though it has no signal word in it at all.",
  "what_to_do": "Ignore the signal words. Ask whether the period of time is finished. If it is, use
                 the past simple, whatever words are in the sentence." }
```

| Field | Req | Rules |
|---|---|---|
| `heard` | ✔ | **The false rule in the wording the learner has actually heard.** If the reader does not recognise their own belief in this line, the debunking does not attach to it. No strawman |
| `also_known_as` | — | 0–3 other wordings in circulation |
| `truth` | ✔ | ≤ 60 words. The real rule, **with the reason** |
| `what_to_do` | ✔ | ≤ 40 words. The practical instruction, **including any real risk the myth was badly encoding** |

**`what_to_do` is the part authors drop and it is the part that matters.** Many myths encode a real
risk badly: "never start with *because*" is wrong as a rule about word position and *right* as a
warning about fragments. Debunking without replacing leaves the reader worse off than the myth did.

**Never ridicule the source.** Our readers were taught these by teachers they respect. *"Some
teachers still teach this"* is fine. *"A silly old rule"* is not — it makes the reader defend the
myth.

If no false rule is in circulation for a structure, set the article-level field
`"false_rule_absent_reason"` to a one-line justification. An empty `false_rule` with no justification
is a lint failure.

**The myth ledger is TH-R4 §8.3, twenty entries.** Every one of them must appear in a `false_rule`
block somewhere in the reference, and the lint checks that all twenty are claimed.

#### 2.4.12 `variation`

Where usage genuinely varies. **Never resolve a variation silently to keep an article tidy.** It is
the one thing a reference must never do: the reader meets the counter-example in the wild and stops
trusting the whole resource.

```jsonc
{ "type": "variation", "kind": "bre_ame", "collapsed": true,
  "variation_ref": 1,
  "what_varies": "Which form goes with *just*, *already* and *yet*.",
  "option_a": { "label": "British English", "form": "present perfect",
                "example": "The panel have just published the figures." },
  "option_b": { "label": "American English", "form": "past simple",
                "example": "The panel just published the figures." },
  "house_default": "British",
  "why_this_default": "The perfect version is accepted everywhere and never sounds wrong. This is
                       a house choice for our examples, not a rule of English.",
  "costs_marks": "no" }
```

| Field | Req | Rules |
|---|---|---|
| `kind` | ✔ | `bre_ame` \| `register` \| `prescriptive` |
| `variation_ref` | ✔ | The TH-R1 §5 row number. All 42 must be claimed exactly once |
| `what_varies` | ✔ | ≤ 20 words |
| `option_a` / `option_b` | ✔ | `{label, form, example}`. Both authored, both correct |
| `house_default` | ✔ | Which one this pack's examples use |
| `why_this_default` | ✔ | ≤ 40 words, and it **must label the default as a house choice**, not as the rule |
| `costs_marks` | ✔ | `"no"` \| `"only if mixed"` \| a ≤ 20-word string |

**Three rules.**

| # | Rule |
|---|---|
| VAR-1 | **Never present one variety's form as an error.** Write *"this is the American form"*, never *"this is wrong in British English"* — unless it genuinely is, in which case say so precisely |
| VAR-2 | Where a form is stigmatised in formal writing but normal in speech (*less* with countables, *if I was*, *who* for *whom*), **say both halves**. Hiding the speech form makes the learner think it is an error when they hear it; hiding the stigma costs them marks |
| VAR-3 | For `kind: prescriptive`, give **the fact and the politics**. The reader is going to be marked by a human. "Not an error, and here is who will still object" is the honest shape |

`collapsed: true` is the default for `variation`. It is a note attached to a clear main rule, never
the main content — otherwise the reader learns that English is arbitrary.

#### 2.4.13 `exceptions`

**An exception stated next to a rule destroys the rule. An exception contained, counted, and labelled
does not.**

```jsonc
{ "type": "exceptions", "collapsed": true,
  "label": "Three cases where this looks broken and is not",
  "items": [
    { "text": "*Since* can introduce a reason rather than a start point. Then no perfect is needed.",
      "example": "Since the depot moved, the run takes twenty minutes less.",
      "kind": "A", "how_often": "common", "verdict": "learn this now" },
    { "text": "After *this is the first time*, English uses the perfect even though the frame is present.",
      "example": "This is the first time the panel has met since March.",
      "kind": "A", "how_often": "common", "verdict": "learn this now" },
    { "text": "*Have got* means *have*. It is not a present perfect at all.",
      "example": "They've got two more sites to inspect.",
      "kind": "B", "how_often": "very common", "verdict": "recognise only" }
  ],
  "stop_line": "That is the whole list. Everything else follows the rule above. If you meet something
                that looks like a fourth exception, it is almost certainly one of these three." }
```

| Field | Req | Rules |
|---|---|---|
| `label` | ✔ | **States what is inside and roughly how much it matters**, so the reader makes an informed choice rather than a blind one |
| `items` | ✔ | 1–5 |
| `items[].kind` | ✔ | `A` = a different rule takes over (do **not** call it an exception — say *"a different rule takes over here"* and link). `B` = register or variety variation (label it and give the exam default). `C` = a genuine irregularity, a closed list with no principle (contain it, list it completely, say it is a list) |
| `items[].how_often` | ✔ | `very common` \| `common` \| `uncommon` \| `rare`. **No numbers** |
| `items[].verdict` | ✔ | `learn this now` \| `learn this later` \| `recognise only` \| `ignore` |
| `stop_line` | ✔ when > 3 items | The explicit closing of the list |

**`verdict` is the field that saves the rule.** A learner told "ignore this for now" by the resource
itself does not lose confidence in the rule. A learner who meets six unranked exceptions concludes
English has no rules.

**Never write these:**

| Anti-pattern | Why it is poison |
|---|---|
| "There are many exceptions to this rule." | Names a threat and gives no defence |
| "English is not logical." | Untrue, demoralising, and it licenses the reader to stop looking for patterns |
| "This is just something you have to memorise." (when it is not) | Readers believe it and stop reasoning |
| "Native speakers often get this wrong too." | Irrelevant to somebody being assessed |
| "Don't worry about this." with no reason | Reads as evasion. Say *why* it does not matter yet |
| A rule with three hedges | *"Generally speaking, in most cases you would usually…"* is not a rule |

#### 2.4.14 `term_intro`

The four-move introduction. **A term is introduced in exactly one article in the whole reference**
(§4). Later articles reference the glossary chip; they never re-teach.

```jsonc
{ "type": "term_intro",
  "term": "subject",
  "also_called": null,
  "gloss": "who or what the sentence is about — it comes before the verb",
  "show_first": [
    { "text": "The Sandmouth library opens at nine.", "mark": "The Sandmouth library" },
    { "text": "Two lorries blocked the Marlow road.", "mark": "Two lorries" },
    { "text": "My brother studies engineering at Brackenfield.", "mark": "My brother" }
  ],
  "name_line": "That part is called the **subject**.",
  "anchor_line": "Every English sentence needs one. Some languages let you leave it out because the
                  verb already says who. English does not.",
  "l1_hook": ["ta", "si", "es", "ar", "ru", "zh"],
  "ledger_position": 3 }
```

| Field | Req | Rules |
|---|---|---|
| `term` | ✔ | Exactly as it appears in the ledger (§4.3) |
| `also_called` | — | The other name for the same thing (*third form* / *past participle*) |
| `gloss` | ✔ | **Verbatim from the ledger.** Do not paraphrase a gloss between articles — the repeated exact wording is what makes it stick |
| `show_first` | ✔ | **Move 1: 2–3 examples where the reader can see the thing, before it is named.** `mark` must be an exact substring of `text` |
| `name_line` | ✔ | **Move 2.** One sentence, the term in bold |
| `anchor_line` | ✔ | **Move 4.** Points back at the examples, and where possible tells the reader they already do this in their own language |
| `l1_hook` | — | ISO 639-1 codes where this is a known transfer risk. Closed set: `ta si hi ar zh es ru` |
| `ledger_position` | ✔ | Must match §4.3 |

Move 3 (the gloss) is the `gloss` field, rendered between moves 2 and 4. The four moves are always
in this order and they are always in one block, so the renderer can present them identically
everywhere and the reader learns the shape.

#### 2.4.15 `visual`

**Declared, never drawn.** The content owns the data; the renderer owns the drawing. No SVG, no image
files, no unicode diagrams in strings, no network fetches.

```jsonc
{ "type": "visual", "kind": "timeline",
  "caption": "The period starts in the past and is still running now.",
  "spec": { "now_label": "now",
            "marks": [{ "at": -6, "label": "2019", "span_to": 0, "style": "bar" }] } }
```

| `kind` | Used for | `spec` |
|---|---|---|
| `timeline` | any tense or aspect article | `{now_label, marks: [{at, label, span_to?, style}], caption}`. `at` is an abstract position −10..+10; `style` ∈ `point`, `bar`, `arrow`, `x` |
| `two_box` | active/passive, causative, transitivity | `{left: {role, text}, right: {role, text}, arrow: "left_to_right"\|"right_to_left"}` |
| `axis` | real/unreal, near/far from reality | `{ends: [string, string], marks: [{pos, label}]}` |
| `cline` | certainty, obligation, quantifiers | `{label, steps: [{text, gloss}]}` |
| `ladder` | register, formality, politeness | `{rungs: [{text, register}], top_label, bottom_label}` |
| `slot_frame` | word order, question formation | `{slots: [{label, filler}], caption}` — the boxes-for-word-order picture |

The first five reuse the practice module's `visual.kind` enum and renderer verbatim
(`staging-grammar/DESIGN.md` §2.3.1). `slot_frame` is the one addition, and it exists because
question formation and word order are the two things a table cannot show.

**One metaphor per structure, stated once, never extended.** Extended metaphors produce sentences
like *"the present perfect throws a bridge from the island of the past to the shore of the present"*
— memorable, meaningless, untranslatable. If a metaphor cannot be cashed out into a decision the
reader makes, cut it.

#### 2.4.16 `summary`

**The table the reader comes back to.** Required on every article except `myth`. It is the last
non-link block.

```jsonc
{ "type": "summary", "anchor": "summary",
  "headline": "Find the time expression. It decides the verb.",
  "table": { "caption": "One row per situation.",
             "headers": ["If the time is…", "Use", "Example"],
             "rows": [["named and closed", "past simple", "closed in 2018"],
                      ["still running", "present perfect", "has closed since 2018"],
                      ["not mentioned", "present perfect, if the result matters now", "has closed"]] },
  "points": null }
```

| Field | Req | Rules |
|---|---|---|
| `headline` | ✔ | ≤ 16 words. The one line worth keeping |
| `table` | one of | Same rules as `table`. ≤ 5 rows |
| `points` | one of | 2–5 strings, each ≤ 20 words |

Exactly one of `table` and `points` is non-null. A summary is not a recap of the article — it is the
part the reader screenshots.

#### 2.4.17 `quick_check`

**This block is the bounded override of TH-R4's T-BOUND-1 (§0.3 row 1). Read the constraints before
you author one.**

```jsonc
{ "type": "quick_check", "anchor": "check", "collapsed": true,
  "note": "Answers are shown. Nothing here is recorded and nothing is marked.",
  "items": [
    { "prompt": "Which one is right? *The bridge reopened in May.* / *The bridge has reopened in May.*",
      "answer": "*The bridge reopened in May.*",
      "why": "*In May* is a closed time, so the verb has to be past simple." },
    { "prompt": "Why is *Since 2015 the number of applicants dropped* wrong?",
      "answer": "*Since* opens a period that runs up to now, so the verb has to stay open: *has dropped*.",
      "why": "The time expression and the verb have to agree about whether the period is finished." }
  ] }
```

| Field | Req | Rules |
|---|---|---|
| `note` | ✔ | Fixed purpose: says the answers are shown and nothing is recorded |
| `items` | ✔ | **2–3. Never more** |
| `items[].prompt` | ✔ | ≤ 25 words |
| `items[].answer` | ✔ | **Always present, always rendered.** At most one tap away, never withheld |
| `items[].why` | ✔ | ≤ 30 words |

**Six constraints, all of which the build agent must honour:**

| # | Constraint |
|---|---|
| QC-1 | **The answer is never withheld.** No reveal gate, no "check your answer" round trip that could fail, no scoring |
| QC-2 | **Nothing is recorded.** No FSRS card, no `grammar_review_logs` row, no read-state change, no analytics event that could later become a score |
| QC-3 | **Nothing is gated on it.** Getting it wrong changes nothing. Skipping it changes nothing |
| QC-4 | **At most one `quick_check` block per article**, and at most 3 items |
| QC-5 | **No item may share a sentence with a practice item or with this article's own examples.** If it did, the check would test recall of the page rather than the pattern |
| QC-6 | `collapsed: true` by default, so it never competes with the rule for the reader's first pass |

If any of QC-1 to QC-3 cannot be honoured by the runtime, **drop the block entirely** rather than
shipping a scored one. A quiz at the end of a reference article turns the reference into a bad course
and duplicates a scheduler that already exists.

#### 2.4.18 `early_sighting`

The mechanism for the seven accepted forward references (TH-R1 §6.3). **One sentence, with the gloss
inline, so the reader is never forced to leave.**

```jsonc
{ "type": "early_sighting",
  "term_or_structure": "there is / there are",
  "one_line": "To say that something exists, English starts the sentence with *there*: *There are
               two entrances.* The full story is in [th_there_is].",
  "full_treatment_article": "th_there_is" }
```

| Field | Req | Rules |
|---|---|---|
| `term_or_structure` | ✔ | What is being sighted |
| `one_line` | ✔ | **Exactly one sentence plus the pointer.** It must contain the plain gloss, so the reader can carry on without following the link |
| `full_treatment_article` | ✔ | Must resolve to a real article id |

The seven accepted forward references and where they sit:

| Sighting | Sighted in | Full treatment |
|---|---|---|
| prepositional phrases | `th_extra_information` | `th_prepositions_of_time` |
| subordinating conjunctions | `th_four_sentence_shapes` | `th_hanging_a_clause_on` |
| `there is / there are` | `th_it_and_there_first_sight` | `th_there_is` |
| `It is important to…` | `th_it_and_there_first_sight` | `th_it_with_no_meaning` |
| question formation | `th_the_helper_system` | `th_yes_no_questions` |
| the passive slot in the helper order | `th_the_helper_system` | `th_passive_forms` |
| `if`-clauses | `th_hanging_a_clause_on` | `th_conditionals_real` |
| comparatives | `th_adjective_position_and_order` | `th_comparatives_and_superlatives` |

An `early_sighting` does **not** put the sighted area into `area_ids[]`. Ownership stays with the
article that treats it fully.

#### 2.4.19 `l1_note`

First-language interference, pre-empted rather than diagnosed after the fact. **Opt-in and additive,
never gating** — a reader who sets no first language, or one we do not cover, sees a complete article.

```jsonc
{ "type": "l1_note", "collapsed": true,
  "lang": "ta",
  "mechanism": "Tamil puts the describing word straight after the subject and marks it there. No
                separate word does the job of *is*.",
  "wrong": "The Sandmouth library very old.",
  "right": "The Sandmouth library is very old.",
  "fix": "Put *is*, *am* or *are* in, even when the sentence feels finished without it.",
  "shared_with": ["si", "ar", "ru", "zh"] }
```

| Field | Req | Rules |
|---|---|---|
| `lang` | ✔ | ISO 639-1, closed set `ta si hi ar zh es ru` |
| `mechanism` | ✔ | **Describes the first language's own system, neutrally.** Never says a language "lacks" something it merely marks elsewhere |
| `wrong` / `right` | ✔ | Exactly one pair |
| `fix` | ✔ | An instruction |
| `shared_with` | — | Other languages with the same transfer, so the UI can say *"and four other languages we cover"* |

| # | Rule |
|---|---|
| L1-1 | ≤ 45 words for the whole block |
| L1-2 | Renders **after** the rule and its examples, never before. The article teaches English first |
| L1-3 | **At most 3 `l1_note` blocks per article.** More than three means the content belongs in the article body for everybody, not in per-language notes |
| L1-4 | A claim about a language you cannot state confidently does not go in. An inaccurate `mechanism` is worse than no note: it teaches the reader something false about their own language |

### 2.5 The article skeleton — the order blocks go in

Every `kind: standard` article follows this order. Parts marked *(may be empty)* need a stated reason
if omitted; the rest are required.

| # | Part | Blocks | Notes |
|---|---|---|---|
| 1 | **What this does to a sentence** | `heading`, `prose` ×1–2 | **Meaning before form.** What the structure does in the reader's terms. 60–140 words. No form yet |
| 2 | **How to build it** | `heading`, `paradigm` or `table`, `prose` ≤ 80 words | Affirmative, negative, question. Contracted forms listed and labelled |
| 3 | **Seeing it** | `examples` ×1–2, `visual` *(may be empty)* | Controlled sets, one dimension each, with `so_what` lines |
| 4 | **The rule** | `rule`, `examples` | The bare rule, then ≥ 3 examples |
| 5 | **When you use it, and when you do not** | `heading`, `contrast` or `decision_tree`, `prose` | **The highest-value part of the article.** 100–250 words plus the block |
| 6 | **What to watch out for** | `warning` ×2–5 | Never in the first 120 words |
| 7 | **Exceptions** *(may be empty)* | `exceptions`, collapsed | Counted, frequency-labelled, verdict-labelled, stop-lined |
| 8 | **Where usage varies** *(may be empty)* | `variation`, collapsed | Both options, house default, default labelled as a house choice |
| 9 | **You may have been told…** | `false_rule` | Required, or `false_rule_absent_reason` |
| 10 | **If your first language is…** *(may be empty)* | `l1_note` ×0–3, collapsed | After the rule, never before |
| 11 | **The take-away** | `summary` | The table the reader comes back to |
| 12 | **Check yourself** *(may be empty)* | `quick_check`, collapsed | 2–3 items, answers shown |

**`kind: comparison` promotes part 5 above parts 2, 3 and 4** — the reader arrived to settle a choice,
not to build a form. Order: 1 → 5 → 2 → 3 → 4 → 6 → 8 → 9 → 11 → 12.

**`kind: foundation` drops parts 2, 7 and 8** and adds `term_intro` blocks immediately after part 1.
Order: 1 → term_intro ×1–3 → 3 → 4 → 6 → 9 → 10 → 11 → 12.

**`kind: paradigm` is parts 2, 3 and 11 only**, with ≤ 350 words of prose around them.

Three rails render **outside** the body and are assembled by the renderer, not authored as blocks:

- **Terms used here** — collected from `term_refs[]`, each with its ledger gloss.
- **Practise this** — from `related_points[]`, showing item counts and estimated minutes, plus an
  honest third line when the point's own prerequisites are unmet: *"Not ready yet? This needs [X]
  first."* That reuses `deepest_unmet_prerequisite` from `sidecar/bandready/grammar/syllabus.py`.
- **Related** — from `related_articles[]`, each with its one-clause reason.

### 2.6 Structural density limits

| # | Limit |
|---|---|
| LEN-1 | Body words inside the band for the article's `kind` (§2.3) |
| LEN-2 | **No more than 120 consecutive body words without a landmark** — a heading, a table, an example block, a list or a callout. On a 390px phone that is roughly one screen. A reader who scrolls two full screens of unbroken prose has left |
| LEN-3 | ≥ 3 headings and ≤ 8 per article |
| LEN-4 | Paragraph ≤ 60 words and ≤ 4 sentences (≤ 50 / ≤ 3 in `foundation`) |
| LEN-5 | ≥ 1 example within the first 120 words of the body |
| LEN-6 | Collapsed blocks ≤ 40% of total article length. More than that and it is two articles |
| LEN-7 | ≤ 5 inline cross-references. More means the article is not self-contained |

---

## 3. THE GATING RULE

### 3.1 Theory is never locked

> **Every theory article is readable from the moment the pack is installed. There is no unlock, no
> prerequisite check, no greyed-out chapter, no "complete X first", and no progress requirement of
> any kind, anywhere in the Theory tab.**

This is not a preference. It is the reason the section exists. The owner's user is somebody who said
*"I don't know that much, we have to include ALL so they can view all structural things then they can
begin."* That person wants to **see the size of the thing before starting**. A beginner who finds the
Theory tab greyed out concludes the app is withholding.

The cost of an unlocked reference is thirty seconds: a beginner who opens "Mixed conditionals" on day
one will not understand it, will close it, and will have lost nothing. The cost of a locked one is
the whole feature.

**Build agent: do not copy the practice module's gate.** The practice path is gated because *teaching
order* matters. Reading order does not. Show the whole map. Recommend a route. Never lock a door.

### 3.2 What `prerequisites[]` is, and what it is not

`prerequisites[]` on an article is **advisory metadata**. It exists for three jobs and no others:

1. **The term-ledger lint** (§4.4) — it is how an author declares which earlier articles their
   terminology comes from.
2. **A "read this first" suggestion**, rendered as a hint, never as a barrier: *"This assumes the
   three forms of a verb. Here is the one-line version: …"* — with the one-line version present, so
   the reader can carry on.
3. **Ordering the Start-here path** (§3.4).

It is **never** read by an unlock computation. There is no `path_states` equivalent for theory, no
`locked` state, and no `deepest_unmet_prerequisite` call on an article.

### 3.3 What is *not* changed by this rule

Two things stay exactly as they are, and confusing them with this rule is the likely mistake:

| Unchanged | Why it is different |
|---|---|
| **The practice module's gate on the point ladder** (`staging-grammar/DESIGN.md` §1.3, `PREREQ_STAGE = 3`) | That gate is about *teaching order for drills*. It stays |
| **The practice module withholding `notice_set` answers until the learner has answered** | That is about not giving away the answer to a practice item the learner is about to attempt. A theory `quick_check` is the opposite case: it is a self-check whose answer is deliberately shown (QC-1) |

Withholding an answer to an item being scored, and locking a reference page, are two different
things. This contract locks nothing and withholds nothing.

### 3.4 Progress, read-state, and the absence of gamification

| Element | Ship? | Why |
|---|---|---|
| Read / unread tick per article | **yes** | Orientation. Answers "have I seen this?" |
| "3 of 16" on the Start-here path | **yes** | The path needs a position and an end |
| Bookmarks | **yes** | Re-consultation is the dominant mode |
| Recently viewed, last 5 | **yes** | Readers return to the same three articles |
| Streaks, XP, badges, leagues | **no** | `docs/plan/10-curriculum-progress.md` §9 forbids loss-aversion mechanics, and it binds here. Reading is a lookup, not an achievement |
| A percentage-read figure | **no** | Implies the goal is to read all 175 articles. It is not |
| Locked articles | **no** | §3.1 |
| Scored quizzes | **no** | §2.4.17 |

**The Start-here path** is an authored ordered list of **16 articles**, not the first 16 in any
subject ordering, because the pedagogically right first sixteen span four chapters. Articles on it
carry `on_start_here_path: true`. It ends — with a screen offering three routes by goal — because a
path with no end is a treadmill.

| # | Article | Why here |
|---|---|---|
| 1 | `th_how_to_use` | What this is, how big it is, and where the edge is |
| 2 | `th_what_a_sentence_is` | Subject and verb. Nothing works without them |
| 3 | `th_who_does_what_to_what` | Object |
| 4 | `th_clause_vs_phrase` | The most load-bearing pair of terms in the reference |
| 5 | `th_naming_and_doing_words` | Noun, verb, singular, plural |
| 6 | `th_describing_words` | Adjective, adverb |
| 7 | `th_stand_in_and_pointing_words` | Pronoun, determiner, article |
| 8 | `th_helper_and_modal_verbs` | The machinery every question and negative depends on |
| 9 | `th_four_sentence_shapes` | Where a sentence ends |
| 10 | `th_countability` | Upstream of every article error |
| 11 | `th_article_decision` | The first comparison, deliberately early. The top error surface |
| 12 | `th_five_verb_forms` | The three forms, before any tense |
| 13 | `th_present_simple` | The first tense |
| 14 | `th_past_simple` | The second |
| 15 | `th_yes_no_questions` | The helper system, applied |
| 16 | `th_making_a_sentence_negative` | The helper system, applied again |

**PATH-1.** For articles 1–9 — the true zero-knowledge stretch — every term used must be introduced
by an **earlier article on the path**. Beyond article 9, a term introduced off-path is permitted only
if it is rendered as a term chip with its gloss inline on first use in that article.

---

## 4. THE ZERO-KNOWLEDGE RULE

### 4.1 The guarantee

> **A reader who starts at article 1 of the Start-here path and reads forward will never meet a
> grammatical term that has not already been introduced, glossed and exemplified. A reader who
> arrives at any article by search will find every term on the page glossed where it stands.**

Note what this does **not** say. It does not say we avoid terminology. We do not. A learner who never
meets the words *clause* or *past participle* cannot read their own feedback, cannot search, cannot
use any other resource and cannot talk to a teacher. Terminology is **ordered and paid for**, not
hidden.

Four consequences:

- **Plain-English name first, technical name second, always in that order.** `title` is the plain
  name; `also_called` is the technical one. The reader learns "the *-ing* form" before "the present
  participle", and gets both, because the rest of the world uses the technical one.
- **Every technical term is defined at first use, inline, in plain words.** Not a footnote. Not a
  link to a glossary. The glossary is a *second* copy, for lookup, never the first.
- **A term may not be used in a definition unless it has already been defined.**
- **No article opens with a paradigm table.** It opens with what the thing does. The table follows.

### 4.2 How an author declares it

Two fields, both required on every article:

- **`terms_introduced[]`** — the terms this article is the sole introducer of. Each entry carries the
  `term`, the `gloss` **verbatim from the ledger**, an optional `also_called`, and the
  `ledger_position`. Every entry must be backed by a `term_intro` block in the body.
- **`term_refs[]`** — every metalanguage term used anywhere in the article, including in table
  headers, captions, example glosses and `so_what` lines.

An author's declaration is checked, not trusted. The lint extracts terms from the prose as well.

### 4.3 The term ledger

Position is `(chapter_index, sequence_index)` of the introducing article. **The gloss column is
reused verbatim** at every later chipped occurrence — do not paraphrase a gloss between articles; the
repeated exact wording is what makes it stick.

| # | Term | Plain gloss (verbatim, reused) | Introduced in |
|---|---|---|---|
| 1 | register | how formal or informal the language is, and whether it belongs in speech or writing | `th_how_to_use` |
| 2 | sentence | a group of words that says something complete | `th_what_a_sentence_is` |
| 3 | verb | the word that says what happens or what is | `th_what_a_sentence_is` |
| 4 | subject | who or what the sentence is about — it comes before the verb | `th_what_a_sentence_is` |
| 5 | object | who or what the action lands on — it comes after the verb | `th_who_does_what_to_what` |
| 6 | indirect object | the person something is given to or done for | `th_who_does_what_to_what` |
| 7 | complement | the part that finishes off the verb and describes the subject or the object | `th_describing_the_doer_back` |
| 8 | linking verb | a verb like *be*, *seem* or *become* that links a subject to a description | `th_describing_the_doer_back` |
| 9 | adverbial | a piece that says how, when, where or why | `th_extra_information` |
| 10 | clause | a group of words with its own subject and its own verb | `th_clause_vs_phrase` |
| 11 | phrase | a small group of words that works as one unit and has no verb in it | `th_clause_vs_phrase` |
| 12 | main clause | the part that can stand on its own | `th_clause_vs_phrase` |
| 13 | subordinate clause | the part that cannot stand on its own | `th_clause_vs_phrase` |
| 14 | finite verb | a verb with a time on it: *goes*, *went* | `th_finite_and_nonfinite` |
| 15 | non-finite verb | a verb with no time on it: *to go*, *going*, *gone* | `th_finite_and_nonfinite` |
| 16 | noun | a word for a person, a thing, a place or an idea | `th_naming_and_doing_words` |
| 17 | singular / plural | one / more than one | `th_naming_and_doing_words` |
| 18 | adjective | a word that describes a noun | `th_describing_words` |
| 19 | adverb | a word that says how, when or where something happens | `th_describing_words` |
| 20 | pronoun | a word that stands in for a noun | `th_stand_in_and_pointing_words` |
| 21 | determiner | the word before a noun that says which one or how many | `th_stand_in_and_pointing_words` |
| 22 | article | the little word *a*, *an* or *the* in front of a noun | `th_stand_in_and_pointing_words` |
| 23 | preposition | a small word that places something in time or space: *in*, *on*, *at*, *for* | `th_joining_and_placing_words` |
| 24 | conjunction | a word that joins two parts: *and*, *but*, *because*, *although* | `th_joining_and_placing_words` |
| 25 | auxiliary (helping) verb | a verb that helps the main verb: *be*, *do*, *have* | `th_helper_and_modal_verbs` |
| 26 | modal verb | a verb that adds an attitude: *can*, *must*, *might*, *should* | `th_helper_and_modal_verbs` |
| 27 | prefix / suffix | a piece added at the start / at the end of a word that changes it | `th_word_building` |
| 28 | head / modifier | the main word of a group / the words around it | `th_phrases` |
| 29 | transitive / intransitive | a verb that takes an object / one that does not | `th_transitivity_and_linking_verbs` |
| 30 | inversion | putting the helping verb in front of the subject | `th_word_order` |
| 31 | simple / compound / complex sentence | one clause / two equal clauses / a clause with another hanging off it | `th_four_sentence_shapes` |
| 32 | statement / question / instruction / exclamation | the four jobs a sentence can do | `th_what_sentences_do` |
| 33 | countable / uncountable | things you can count one by one / stuff you measure | `th_countability` |
| 34 | quantifier | a word for how much or how many: *some*, *many*, *a few* | `th_how_much_how_many` |
| 35 | possessive | the form that says something belongs to somebody: *the council's*, *my* | `th_possession` |
| 36 | antecedent | the noun a pronoun points back to | `th_pronouns_pointing` |
| 37 | relative pronoun | the joining word that starts a clause describing a noun: *who*, *which*, *that* | `th_relative_and_question_pronouns_named` |
| 38 | premodifier / postmodifier | words in front of the noun / words after it | `th_bigger_noun_group` |
| 39 | nominalisation | turning a verb into a noun: *decide* → *decision* | `th_nominalisation` |
| 40 | base form | the dictionary form of a verb: *paint*, *write* | `th_five_verb_forms` |
| 41 | past form | the form used for a finished event: *painted*, *wrote* | `th_five_verb_forms` |
| 42 | third form (past participle) | the form used after *have* and in passives: *painted*, *written* | `th_five_verb_forms` |
| 43 | the *-s* form | the form used with *he*, *she*, *it*: *paints*, *writes* | `th_five_verb_forms` |
| 44 | the *-ing* form | *painting*, *writing* | `th_five_verb_forms` |
| 45 | regular / irregular | verbs that add *-ed* / verbs that change shape instead | `th_five_verb_forms` |
| 46 | agree (subject–verb) | the verb changes its shape to match the subject | `th_five_verb_forms` |
| 47 | operator | the first helping verb in a sentence — the one that moves to make a question | `th_the_helper_system` |
| 48 | contraction | a shortened, run-together form: *I'm*, *don't*, *she'll* | `th_contractions` |
| 49 | state verb | a verb that describes a state, not an action | `th_state_action_and_objects` |
| 50 | tense | the form of a verb that shows when | `th_time_and_tense` |
| 51 | aspect | how the action is spread out in time | `th_time_and_tense` |
| 52 | simple | the plain form: no *be + -ing*, no *have* + third form | `th_time_and_tense` |
| 53 | continuous (progressive) | the *-ing* form, used for something in the middle of happening | `th_time_and_tense` |
| 54 | perfect | a form that links an earlier time to a later time | `th_time_and_tense` |
| 55 | agreement (concord) | the verb changing shape to match the subject | `th_agreement_basics` |
| 56 | semi-modal | a helper made of more than one word: *have to*, *be able to* | `th_semi_modals` |
| 57 | voice (active / passive) | which one the sentence puts first: the doer, or the thing done to | `th_the_passive_idea` |
| 58 | agent | the doer, when a passive sentence names it after *by* | `th_passive_forms` |
| 59 | causative | having somebody else do something for you | `th_causatives_and_get_passive` |
| 60 | question word | *who*, *what*, *which*, *where*, *when*, *why*, *how* | `th_wh_questions` |
| 61 | question tag | the short question added to the end: *…, isn't it?* | `th_tag_questions` |
| 62 | embedded question | a question put inside a longer sentence | `th_indirect_and_embedded_questions` |
| 63 | infinitive | the *to*-form of a verb: *to go* | `th_to_do_and_doing` |
| 64 | bare infinitive | the same form without *to*: *go* | `th_to_do_and_doing` |
| 65 | gerund | the *-ing* form used as a noun: *swimming is cheap* | `th_to_do_and_doing` |
| 66 | participle | a verb form used with a helper or as a describing word | `th_to_do_and_doing` |
| 67 | participle clause | a shortened clause that starts with an *-ing* or a third form | `th_participle_clauses` |
| 68 | coordination | joining two parts that carry equal weight | `th_joining_equal_clauses` |
| 69 | parallel structure | keeping the joined parts in the same shape | `th_joining_equal_clauses` |
| 70 | subordination | hanging a clause off a main clause | `th_hanging_a_clause_on` |
| 71 | relative clause | an extra piece that tells you which noun you mean | `th_relative_defining` |
| 72 | defining / non-defining | narrowing down which one / just adding extra information | `th_relative_defining` |
| 73 | noun clause | a whole clause used where a noun could go | `th_that_clauses` |
| 74 | unreal past | a past form used for something that is not true, not for past time | `th_real_and_unreal` |
| 75 | conditional | a sentence about an *if*-situation | `th_conditionals_real` |
| 76 | reported (indirect) speech | saying what somebody said, without their exact words | `th_reported_speech_and_backshift` |
| 77 | backshift | moving the verb one step further back when you report | `th_reported_speech_and_backshift` |
| 78 | comparative / superlative | *bigger* / *biggest* | `th_comparatives_and_superlatives` |
| 79 | gradable / non-gradable | a describing word you can say *very* with / one you cannot | `th_gradable_and_nongradable` |
| 80 | dependent preposition | a preposition that a particular word always takes: *depend **on*** | `th_dependent_prepositions` |
| 81 | multi-word verb | a verb made of two or three words: *carry out*, *put up with* | `th_multi_word_verbs` |
| 82 | given and new | what the reader already knows / what you are adding | `th_given_and_new` |
| 83 | cleft sentence | a sentence rearranged to put one part in the spotlight | `th_clefts` |
| 84 | cohesion | the way sentences hold on to each other | `th_reference_words` |
| 85 | ellipsis | leaving out words the reader can fill in | `th_substitution_and_ellipsis` |
| 86 | linking adverbial | a signpost word between sentences: *however*, *for example* | `th_linking_words_by_function` |
| 87 | hedging | softening a claim: *tends to*, *may* | `th_formality_hedging_and_boosting` |

**Ledger rules.**

| # | Rule |
|---|---|
| TERM-1 | No article uses a ledger term whose introducing article is later in the order. Lint |
| TERM-2 | The gloss is reused **verbatim**. Never paraphrase between articles |
| TERM-3 | Every ledger term is a glossary entry, and **every occurrence in body text is a tappable chip showing the gloss inline**. This is the mechanism that makes every page page one for a reader who arrived by search having skipped everything before it |
| TERM-4 | **A term not on the ledger may not be used at all.** If you need one, it goes through the ledger (raise it) or it gets a plain paraphrase (§4.5) |
| TERM-5 | A term is introduced in **exactly one** article. Later articles chip it; they never re-teach it |
| TERM-6 | The glossary (TH-R1's appendix Z5) is **built from this table**, not authored. Hand-authoring guarantees drift |

### 4.4 The lint, stated so it can be built

```
for each article A, in (chapter_index, sequence_index) order:
    for each term t used anywhere in A's strings:
        assert t in LEDGER                                 # TERM-4
        assert position(introducer(t)) <= position(A)      # TERM-1
        if position(introducer(t)) == position(A):
            assert A has a term_intro block for t          # declared introduction
            assert t in A.terms_introduced                 # declaration matches body
        assert gloss(t) is byte-identical to LEDGER[t]     # TERM-2
    assert every t in A.terms_introduced has exactly one introducer in the whole corpus  # TERM-5
    assert A.term_refs == set of terms actually found in A                # declaration is honest
```

Term detection runs over a **closed vocabulary list** — the 87 ledger terms plus their `also_called`
variants — not over a stemmer. That makes it exact and gives no false positives on ordinary English.

**TERM-1 failures are errors, not warnings.** They are the zero-knowledge guarantee, and the
equivalent of the practice module's acyclic-prerequisite check, which `syllabus.py` also treats as an
error for exactly this reason.

### 4.5 Terms you may not use, and what to write instead

Anything in the left column is outside the ledger. Use the right column in running prose. Where a left
column term is on the ledger, you may use it **after** it is introduced, and even then keep the gloss
nearby.

| Do not write | Write |
|---|---|
| copula | the linking verb *be* |
| morphology / inflection | the shape of the word / the ending that changes |
| perfective / imperfective | *(do not use at all — these are not English categories)* |
| declarative / interrogative / imperative | a normal statement / a question / an instruction |
| anaphora / cataphora | a word that points back / a word that points forward |
| predicate | everything after the subject |
| mood | *(avoid; name the specific thing instead)* |
| modality | how sure, how necessary, or how allowed |
| epistemic / deontic | how sure you are / what the rules say |
| ergative | *(never use — say "the thing seems to do it itself")* |
| valency | how many things a verb needs around it |
| grammaticalisation | *(never use)* |
| marked / unmarked | the unusual choice / the normal one |
| protasis / apodosis | the *if* part / the result part |
| relativiser | the joining word: *who*, *which*, *that* |
| restrictive / non-restrictive | narrowing down / just adding |
| dummy subject / expletive | the *it* or *there* that fills the subject slot and means nothing |
| zero article | no word at all in front of the noun |
| clefting | rearranging to put one part in the spotlight |
| discourse marker | a signpost word |
| notional concord | the verb following the sense rather than the shape |
| pluralia tantum | nouns that only come in plural shape |
| partitive | a counting phrase: *a piece of*, *an item of* |

### 4.6 Words that look plain and are not

These read as ordinary English, so authors use them without a gloss and the reader silently
mis-parses. Every one needs the same four-move treatment as a technical term.

| Word | Why it misleads | What to do |
|---|---|---|
| **subject** | in everyday English it means "topic" — and for Chinese speakers, topic is a real and different grammatical slot | gloss as *"who or what the sentence is about — it comes before the verb"*, and contrast it with topic explicitly in the Chinese L1 note |
| **object** | everyday meaning "a thing" | gloss as *"who or what the action lands on"* |
| **agree** | everyday meaning "say yes" | gloss as *"changes shape to match"* |
| **tense** | learners use it for *any* verb form, including passives and modals | say explicitly: the passive is not a tense; modals are not tenses |
| **perfect** | reads as "correct" or "complete" | gloss as *"links an earlier time to a later time"*, and say it does **not** mean finished |
| **continuous** | reads as "goes on for a long time" | gloss as *"in the middle of happening"* and give a short-duration example |
| **conditional** | reads as "conditional on approval" | gloss as *"about an if-situation"* |
| **article** | reads as "a piece of writing" | gloss it and repeat the gloss on every use through Chapter 2 |
| **voice** | reads as "speaking voice" | gloss as *"which one the sentence puts first"* |
| **person** (first / second / third) | reads as "a human being" | prefer *I / you / he, she, it*. Use the term only where a table header needs it |
| **regular / irregular** | learners assume irregular means rare | say plainly: the irregular verbs are the **most common** verbs |
| **simple** | reads as "easy" | prefer "plain form" in prose; keep "simple" only in table headers where it is the standard label |

### 4.7 Explaining without the term at all

Four devices, in descending preference. Reach for these before you reach for a new term.

| Device | How it works | Best for |
|---|---|---|
| **The question the reader asks themselves** | recast the rule as a decision procedure | choices between two forms |
| **The minimal pair** | two sentences differing in one thing, each with its meaning written out | anything where the difference is meaning, not correctness |
| **The physical picture, used once and dropped** | one concrete image, cashed out into a decision | time relationships, distance, containment |
| **The slot picture** (`visual.kind: slot_frame`) | show the sentence as boxes to be filled | word order, question formation |

<!-- SECTION-2-MARKER -->
