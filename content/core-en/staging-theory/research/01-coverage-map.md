# TH-R1 — The coverage map: every structural area of English, from absolute zero to band 8

**Status:** research briefing. Input to the Theory module's design agent (TH-D1) and to every
theory-authoring agent. It says **what must be covered, at what level, in what order, and what
depends on what**. It does not say what the JSON looks like — that is TH-D1's job.

**Companion inputs already in the repo (read them, do not duplicate them):**

| File | What it gives you | How Theory relates to it |
|---|---|---|
| `staging-grammar/research/01-syllabus.md` | 154 practice points, 17 units, 3 tracks, a dependency graph | Theory covers a **superset**: everything the practice syllabus teaches, plus the connective structure a reference needs and a drill syllabus can skip |
| `staging-grammar/research/02-what-moves-a-band.md` | what actually earns marks | Sets **depth**, not coverage. A high-payoff area gets a long chapter section; a low-payoff one still gets an entry |
| `staging-grammar/research/03-acquisition-science.md` | how it sticks | Mostly irrelevant here. Reading a table is not acquisition. Theory's job is **orientation**, not retention |
| `staging-grammar/research/04-practice-pedagogy.md` | what a drill looks like | Explicitly not what Theory looks like |
| `staging-grammar/DESIGN.md` | the practice module's contract, incl. §0.2 copyright and §4.2's closed point-id list | **Binding on Theory too** for copyright, for the banned example sentences, and for point ids used in cross-links |
| `sidecar/bandready/grammar/syllabus.py` | `UNIT_TITLES` u01–u17, `UNIT_TRACKS`, the `Point` dataclass | Theory cross-links **into** these ids; it must never invent one |

---

## 0. Method, scope, and how to read this document

### 0.1 What the owner asked for, in their words

> *"I need theory section tab too … tenses, modals, active passive, WH questions, conditions and so
> on. I don't know that much, we have to include ALL so they can view all structural things then they
> can begin. Research more and add more, I just told a few I know."*

Three instructions are buried in that sentence and all three shape this map.

1. **"then they can begin"** — Theory is read *before* practice. It is a map, not a walking route.
   The reader is orienting, not training. This means the organising principle is **the structure of
   the language**, not the order of acquisition. The practice syllabus is ordered by dependency;
   Theory is ordered so that a reader can *find* things and see how they connect.
2. **"view all structural things"** — completeness is the deliverable. A reference with a hole in it
   is worse than useless, because the reader cannot tell the hole from the edge of the language.
3. **"I just told a few I know"** — the owner has explicitly delegated the enumeration. Anything the
   owner did not name and that belongs in a complete reference is **in scope by default**, and this
   document is the place where that judgement is made and recorded.

### 0.2 What a theory article is NOT

This must be stated before the map, because the single most likely failure of this module is that it
becomes a second copy of the practice module with the drills removed.

| Practice point (existing module) | Theory article (this module) |
|---|---|
| One decision, bite-sized, 12–30 minutes | One **system**, laid out whole |
| Meaning first, form stated once, briefly | **Complete paradigm tables** — every person, every tense, every form, positive/negative/question |
| Two or three examples, all authored fresh | Many examples, still all authored fresh, organised as a **specimen set** the reader can pattern-match against |
| Teaches one contrast (`contrast` block, five parts) | Teaches **the whole contrast family at once** — a comparison table with every rival in it |
| Ends in production | Ends in **a table the reader can come back to** |
| Sequenced so nothing depends on what is untaught | Sequenced so nothing is *explained* using an undefined term, but freely **forward-links** to fuller treatment later |
| `teach.rule_line` ≤ 18 words | Rules stated in full, with the exceptions, and with the honest "this varies" note |
| Never a reference section (grammar `DESIGN.md` §0.5 row 10 explicitly ruled one out for *that* module) | This **is** the reference section, requested separately by the owner. The two decisions are not in conflict: the practice module still has no browse-all-rules screen; Theory is its own tab |

**The relationship in one line:** Theory shows the reader the whole board; the practice module teaches
them to play one square at a time. A theory chapter that cannot be read cover-to-cover by someone who
will never open the practice module has failed.

### 0.3 The zero-knowledge rule, stated as a hard constraint

The reader has **no grammar terminology at all**. Not "noun". Not "verb". Not "subject".

Therefore:

- **Every technical term is defined at its first appearance, in plain words, before it is used.** The
  definition is inline, not a footnote and not a glossary link. The glossary (Appendix E) is a
  *second* copy, for lookup, never the first.
- **A term may not be used in a definition unless it has already been defined.** This is a lint, and
  it is the theory analogue of the practice module's dependency graph. Chapter order below is built
  to satisfy it.
- **Plain-English name first, technical name second, always in that order.** The reader learns
  "the -ing form" before "the present participle", and both are given, because the rest of the
  internet uses the technical one and a reader who has only been given the plain name cannot look
  anything up.
- **No chapter may open with a paradigm table.** It opens with what the thing *does*. The table
  follows.
- Where a chapter genuinely needs something from a later chapter, it gets a **one-sentence early
  sighting** (§7.4) rather than a forward reference the reader cannot resolve.

### 0.4 Confidence policy

Every claim in this document is one of:

- **[FACT]** — a description of English that every major descriptive reference agrees on. Stated flat.
- **[VARIES]** — usage genuinely differs by variety (British/American), by register (formal/informal,
  spoken/written), or between prescriptive tradition and observed usage. **These are never resolved
  silently.** The variation is named, both options given, and — where the module has to pick one for
  its own examples — the pick is stated as a house choice, not as a rule of English. §5 collects
  every one of them in a single table so nothing is hidden inside a chapter.
- **[JUDGEMENT]** — my call about what belongs in a reference and where. Argued, not asserted.

**No source is cited in this document, because no source needs to be.** Everything here is either a
description of English that any reference grammar contains, or my own structural judgement. The
prohibition in the task brief on inventing citations is honoured by citing nothing: there is no
sentence below of the form "X says Y". Where I say a distinction is "traditional" or "widely
taught", that is a claim about the state of published teaching materials in general, not about a
specific book, and it is marked **[JUDGEMENT]** wherever it carries weight.

### 0.5 Copyright — inherits grammar `DESIGN.md` §0.2 in full

Repeated here because theory articles are *more* exposed than practice items: a reference chapter is
exactly the shape of an existing published chapter.

- Facts and terminology are free. "Present perfect", "defining relative clause", `be + past
  participle`, the CEFR level names — use them.
- **Example sentences are the danger.** Every canonical grammar-book example is an authored line. If
  a sentence feels familiar, it is. Throw it away.
- The banned list from grammar `DESIGN.md` §0.2 applies verbatim: the cake sentence for the third
  conditional; "If it rains, the grass gets wet"; "Water boils at 100°C" as an example sentence;
  "I've lost my keys"; "John has been to Paris"; "The cat sat on the mat"; anyone called John, Mary,
  Tom, Sarah, Peter or Anna doing a textbook action; any subject called "Mr Smith".
- Keep the house world: Verdon, Norland, Ashfield, Sandmouth, Marlow, Brackenfield. Theory examples
  and practice examples should read as the same world.
- **A structural warning specific to this module:** the *sequence of explanation* in a famous grammar
  reference can itself be recognisable. Do not reproduce a remembered chapter shape. The chapter
  shape in §7 is ours, derived from the dependency constraints in §6, and it is deliberately not the
  conventional one (the conventional one opens with the tense system; ours opens with the clause).
- The four banned claims from grammar `DESIGN.md` §0.2 apply: no "78% of learner errors", no error-
  count band thresholds, no "Cambridge examiner training says", no per-structure frequency
  percentages.

### 0.6 How to read the coverage tables in §3

Every area gets one row with eight fields.

| Column | What it means |
|---|---|
| **ID** | Stable id for this area, `TH-<group letter><number>`. Used by the chapter map (§7) and by TH-D1 to key articles. Never renumber; append instead |
| **Plain-English name** | What a beginner would call it. This is the name the UI shows |
| **Technical name** | The metalanguage. Shown as a subtitle, and it is what the reader needs in order to search the rest of the internet |
| **Why it matters** | **What the learner cannot say without it.** Not "it is important" — a specific communicative loss |
| **CEFR** | The level at which a learner is normally expected to control this productively. A1 A2 B1 B2 C1 C2. For reference material the level is advisory: a reference is browsed out of order by definition |
| **F/C** | **F** = FORM problem (the difficulty is building the shape). **C** = CHOICE problem (the difficulty is picking between two shapes that are both correct English). **F+C** = genuinely both. See §1.3 — this column is the most useful one in the document |
| **Deps** | Area ids that must be understood first. `—` = depends only on the chapter's own opening |
| **†** | Flagged as **routinely under-explained** by references. Expanded in §4 |

---

## 1. Six design principles that fall out of "it is a map, not a route"

### 1.1 The reference must answer "which one do I use?", not just "how do I build it?"

The practice module already made this its central bet, and the corpus reality behind it is that the
expensive errors are selection errors, not formation errors. A reference makes this *worse*, not
better, if it is organised the traditional way: one section per form, each ending before the
comparison begins, so that the reader who has just read four sections about four past forms still
cannot pick one.

**Therefore every chapter that contains rival forms ends with a `DECIDING` section** — a table whose
rows are situations and whose columns are the rival forms, with the deciding question stated as a
question the reader can ask themselves mid-sentence. §3's **F/C** column is what tells the author
which chapters need one. There are 41 areas marked **C** or **F+C**; each is either a DECIDING
section or the reason one exists.

### 1.2 Complete paradigms, once, in one place

A learner cannot see a system from four examples. Every inflected or auxiliated structure gets its
full table at least once:

- all six person/number slots where the form actually varies (`be` is the only English verb with more
  than two present-tense shapes);
- positive, negative, question, negative question, short answer;
- contracted and full forms side by side, because contractions are what the reader will *hear*;
- the passive counterpart where one exists, and an explicit note where one does not.

This is the single biggest difference from the practice module, whose `teach.form` block is
deliberately four lines.

### 1.3 FORM vs CHOICE is the organising axis of the whole map

This distinction decides what the article has to contain.

| | FORM area | CHOICE area |
|---|---|---|
| The reader's question | "What does it look like?" | "Which one goes here?" |
| What the article needs | A paradigm table, spelling rules, an irregularity list | A **comparison table**, a decision question, minimal pairs where the *only* difference is the target |
| How it fails | The reader builds it wrong | The reader builds something correct and says something they did not mean |
| Typical example | Forming the passive | Choosing the passive |
| How to check the article | Can the reader produce every cell? | Can the reader, given a situation, name the form **and say what the other one would have meant**? |

The trap: presenting a CHOICE area as if it were a FORM area. Most references do this with the
present perfect, with articles, with the passive, and with all four conditionals. It produces a
learner who can conjugate perfectly and chooses wrongly. **[JUDGEMENT]**

The mirror trap: presenting a FORM area as if it were a CHOICE area, which produces invented
"rules" for things that are simply lexical facts (which verbs take `-ing`, which adjective takes
which preposition). Where the honest answer is "there is no rule, this is a list", the reference must
say so and give the list.

### 1.4 State the false rule, not just the true one

The practice module requires a `false_rule` on every point. Theory needs the same discipline for a
different reason: the reader has usually already been taught something, badly, and a correct
explanation that does not name and kill the wrong one loses. The high-value false rules are collected
in §4 and each is attached to an area.

### 1.5 Where usage varies, say so — never pick silently

Rule 5 of the brief, and it is also the honest-reference principle. Three kinds of variation:

- **British / American** — different systems, both correct.
- **Formal / informal, written / spoken** — the same speaker uses both, correctly, in different
  places. This is *the* band-7-to-8 discrimination and it is under-taught everywhere. **[JUDGEMENT]**
- **Prescriptive / descriptive** — a rule that is taught, enforced by some readers, and not
  descriptive of educated usage (the split infinitive; terminal prepositions; singular `they`).
  The reference must give the reader **both the fact and the politics**, because the reader is going
  to be marked by a human.

§5 is the complete table. Every `[VARIES]` in this document appears in it.

### 1.6 A reference is browsed, not read — so every chapter is an entry point

Consequences for authoring: no chapter may assume the previous one was just read; each opens with a
one-paragraph "what this chapter is about, in words with no grammar in them"; every technical term
gets a hover-definition even on its fiftieth use; and the cross-links are dense and two-directional.
The chapter *order* in §7 exists for the reader who does start at the beginning, and for the term-
definition lint — not as an assumption about reading behaviour.

---

## 2. The map at a glance — twenty groups, 337 areas

| Group | Name | Areas | Weight | Chapters |
|---|---|---|---|---|
| **A** | Foundations: what a sentence is made of | 14 | The whole reference stands on it | 1–2 |
| **B** | Word classes (parts of speech) | 15 | Vocabulary of the vocabulary | 3 |
| **C** | Phrases | 7 | The missing rung between word and clause | 4 |
| **D** | Clause patterns, elements and word order | 18 | Where "why is my sentence wrong" is answered | 5–6 |
| **E** | Nouns and the noun phrase | 18 | The band-8 density engine lives here | 8, 12 |
| **F** | Determiners: articles and quantifiers | 18 | Highest-frequency error surface in writing | 9–10 |
| **G** | Pronouns | 16 | Cohesion depends on it | 11 |
| **H** | Verb forms and the auxiliary system | 18 | One mechanism behind eight surface rules | 13 |
| **I** | Tense and aspect | 36 | The owner's first named ask | 14–18 |
| **J** | Subject–verb agreement | 18 | The most-noticed accuracy error | 19 |
| **K** | Modality | 21 | The owner's second named ask; also hedging | 20 |
| **L** | Voice: active and passive | 16 | The owner's third named ask | 21 |
| **M** | Questions | 17 | The owner's fourth named ask (WH questions) | 22 |
| **N** | Negation | 14 | Assumed known; systematically isn't | 23 |
| **O** | Non-finite clauses and verb patterns | 25 | Biggest lexis-shaped area in grammar | 28 |
| **P** | Clause combining: relative, noun, adverbial | 31 | Complexity, and where complexity breaks | 25–27 |
| **Q** | Conditionals and the unreal past | 21 | The owner's fifth named ask ("conditions") | 29 |
| **R** | Reported speech | 13 | Plus academic reporting, which is Task 2 grammar | 30 |
| **S** | Adjectives, adverbs, comparison | 28 | Task 1 lives here | 31–33 |
| **T** | Prepositions and multi-word verbs | 17 | Half lexis, and must be labelled as such | 34–35 |
| **U** | Information structure and emphasis | 20 | The band-8 differentiator nobody teaches | 36–37 |
| **V** | Degree and result structures | 10 | Small, high-frequency, always scattered | 38 |
| **W** | Cohesion and discourse | 14 | Over-taught badly; under-taught well | 39 |
| **X** | Punctuation, spelling and conventions | 20 | Cheap marks, routinely dropped | 40–41 |
| **Y** | Register, style and accuracy under pressure | 17 | Where band 7 becomes band 8 | 42–44 |
| **Z** | Reference tables and appendices | 12 | The part that gets used most | Appendices |

Groups A–Z total **337 areas** (some groups appear in more than one chapter; the count is of areas,
not of article files — TH-D1 decides the article granularity, and my recommendation in §8.2 is
roughly one article per chapter *section*, giving ~120 articles, not 337).

---

## 3. THE COVERAGE MAP

### 3.A Foundations — what a sentence is made of

Chapter 1–2. **Nothing in this group may be explained with a term from any other group.** This is the
root of the definition graph.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| A1 | A sentence | sentence | Without it, the reader has no unit to hang anything on | A1 | F | — | |
| A2 | The doer | subject | Cannot say who did anything; English never leaves it out | A1 | F | A1 | |
| A3 | The action or state word | verb / predicator | The one obligatory element; a group of words with no verb is not a sentence | A1 | F | A1 | |
| A4 | The thing the action lands on | (direct) object | Cannot say *what* was done, only that something was | A1 | F | A2, A3 | |
| A5 | The person it is done for or to | indirect object | Cannot say who received it without a preposition | A2 | F | A4 | |
| A6 | Words that describe the doer back | subject complement | Cannot say *X is Y* and understand why there is no object | A1 | F | A2, A3 | |
| A7 | Words that describe the object back | object complement | Cannot say *they made it easier* structurally | B1 | F | A4, A6 | |
| A8 | Extra information: when, where, why, how | adverbial / adjunct | Every sentence longer than three words has one | A1 | F | A1 | |
| A9 | A group of words with its own doer and verb | clause | The single most load-bearing term in the whole reference | A2 | F | A2, A3 | † |
| A10 | A group of words with no verb in it | phrase | Distinguishes *the tall man* from *the man is tall* | A2 | F | A9 | † |
| A11 | A clause that can stand alone | main / independent clause | Names what a full stop must come after | A2 | F | A9 | |
| A12 | A clause that cannot stand alone | subordinate / dependent clause | The whole of complex sentence-building rests on this | B1 | F | A9, A11 | |
| A13 | Verbs that carry a time and a doer | finite verb | Explains why *to go* and *going* cannot be a sentence's only verb | B1 | F | A3 | † |
| A14 | Verbs with no time on them | non-finite verb (infinitive, -ing, -ed) | Same; and it is the gateway to Chapter 28 | B1 | F | A13 | † |

**Authoring notes for group A.**

- A9 and A10 are the two terms that make the rest of the book compressible. Every reference assumes
  them; almost none defines them. **The chapter must give a physical test**, not a definition:
  *does this group of words contain something the doer is doing?* If yes, clause. If no, phrase.
- A13/A14 must be introduced here even though the reader will not use them until Chapter 28, because
  the sentence-fragment explanation in Chapter 6 is unintelligible without them.
- Do not teach "a sentence expresses a complete thought". It is not a test — it cannot be applied
  by someone who does not already know the answer. Teach: **a sentence needs a subject and a finite
  verb, and the two must agree.**

### 3.B Word classes (parts of speech)

Chapter 3. The reader's mental filing cabinet. Kept deliberately short: word-class labels are a tool
for talking about grammar, not a topic in themselves.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| B1 | Naming words | noun | Cannot use a dictionary or any later chapter without it | A1 | F | A2 | |
| B2 | Doing and being words | verb | As above | A1 | F | A3 | |
| B3 | Describing words for things | adjective | Cannot follow the article or comparison chapters | A1 | F | B1 | |
| B4 | Describing words for actions | adverb | Systematically confused with B3; the `-ly` shortcut fails often | A2 | F | B2 | † |
| B5 | Stand-in words for nouns | pronoun | Every cohesive text depends on these | A1 | F | B1 | |
| B6 | Little words in front of nouns | determiner | The class that contains articles; naming it early makes Ch 9–10 possible | A2 | F | B1 | † |
| B7 | Position and relation words | preposition | Cannot express place, time or relation | A1 | F+C | B1 | |
| B8 | Joining words | conjunction | The complex-sentence chapters need the class name | A2 | F | A9 | |
| B9 | Words that stand outside the sentence | interjection / discourse marker | Small; matters for spoken naturalness | A2 | F | — | |
| B10 | Helper verbs | auxiliary verb | The mechanism behind questions, negatives, tags and emphasis | A2 | F | B2 | † |
| B11 | Certainty and obligation helpers | modal verb | A distinct sub-class with its own grammar | A2 | F | B10 | |
| B12 | Number words | numeral (cardinal, ordinal, fraction) | Task 1 depends on them | A1 | F | B1 | |
| B13 | Words that change class | conversion / zero-derivation (`a rise` / `to rise`) | Explains why a dictionary lists the same word twice | B1 | F | B1, B2 | † |
| B14 | Word endings that change the class | derivational suffix (`-tion`, `-ise`, `-ment`, `-al`) | The mechanical engine of nominalisation (E15) | B2 | F | B13 | † |
| B15 | Word beginnings that change the meaning | prefix (`un-`, `in-`, `dis-`, `over-`, `re-`) | Half of academic negation | B1 | F | B14 | |

**Authoring notes.** B13–B15 sit on the boundary with the vocabulary module. Grammar owns the
*mechanism* (a verb can become a noun and the sentence must then be rebuilt around it); vocabulary
owns the *lists*. Say that out loud in the chapter so the reader knows where to look.

Do not teach "an adverb describes a verb" as the whole story (B4 †) — adverbs also modify adjectives
(*genuinely difficult*), other adverbs (*almost never*), and whole clauses (*Frankly, the scheme
failed*). The `-ly` test fails in both directions: *friendly*, *likely*, *costly* are adjectives;
*fast*, *hard*, *late*, *well* are adverbs with no `-ly`.

### 3.C Phrases — the rung between word and clause

Chapter 4. Short chapter, disproportionate payoff: it is what lets Chapter 12 talk about noun-phrase
expansion and what lets Chapter 32 talk about adverbial position.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| C1 | A noun with its baggage | noun phrase | The unit that fills subject and object slots; band 8 is built here | A2 | F | A10, B1 | † |
| C2 | The verb with its helpers | verb phrase | Explains where `not` goes and why | A2 | F | A10, B10 | |
| C3 | A describing word with its own modifiers | adjective phrase | *very hard to justify* is one unit, not three | B1 | F | B3 | |
| C4 | An adverb with its own modifiers | adverb phrase | *far more quickly* | B1 | F | B4 | |
| C5 | A position word plus its noun | prepositional phrase | The most common adverbial and the most common postmodifier | A2 | F | B7, C1 | |
| C6 | The centre of a phrase and its trimmings | head and modifier | Explains agreement across distance (J11) | B1 | F | C1 | † |
| C7 | What goes before the head vs after it | premodification / postmodification | The whole of E12–E13 and Ch 25 | B2 | F | C6 | † |

### 3.D Clause patterns, sentence elements and word order

Chapters 5–6.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| D1 | Doer + action | SV (intransitive) | The minimum sentence | A1 | F | A2, A3 | |
| D2 | Doer + action + thing | SVO (monotransitive) | The default English sentence | A1 | F | D1, A4 | |
| D3 | Doer + action + person + thing | SVOO (ditransitive) | *We sent the council a letter* | A2 | F | D2, A5 | |
| D4 | Doer + linking verb + description | SVC (copular) | *The scheme is expensive*; explains why *is* takes no object | A1 | F | D1, A6 | † |
| D5 | Doer + action + thing + description of the thing | SVOC (complex-transitive) | *The delay made the plan unworkable* | B2 | F | D2, A7 | |
| D6 | Patterns that need a where/how | SVA / SVOA (`He put it on the shelf`) | Explains why some sentences feel unfinished without an adverbial | B1 | F | D2, A8 | † |
| D7 | Verbs that need an object vs verbs that don't | transitivity | Explains *\*He disappeared the file* and *\*She enjoyed* | A2 | F+C | D1, D2 | † |
| D8 | Verbs that link rather than act | linking / copular verbs (`be, seem, become, appear, feel, look, sound, taste, smell, remain, stay, get, turn, grow`) | These take adjectives, not adverbs: *it looks bad*, not *\*badly* | A2 | F+C | D4 | † |
| D9 | The two ways of saying who received it | dative alternation (`give X to Y` / `give Y X`) | Which verbs allow which is lexical, not free | B1 | F+C | D3 | † |
| D10 | The normal order of an English sentence | canonical word order (S–V–O) | English has almost no case marking, so order carries meaning | A1 | F | D2 | |
| D11 | Where the extra information goes | adverbial position; manner–place–time ordering | *We met at the depot on Tuesday*, not the reverse | A2 | F+C | A8, D10 | † |
| D12 | Nothing may come between the verb and its object | verb–object adjacency | The rule that blocks *\*I like very much this idea* | A2 | F | D2 | † |
| D13 | When the order flips | inversion (overview) | Questions, negative fronting, conditionals — one mechanism, four uses | B1 | F | D10, B10 | † |
| D14 | One clause on its own | simple sentence | The baseline for everything below | A1 | F | A11 | |
| D15 | Two equal clauses joined | compound sentence | The first step out of short choppy writing | A2 | F | D14, P1 | |
| D16 | A main clause with a clause hanging off it | complex sentence | Where band 6 becomes band 7 | B1 | F | D14, A12 | |
| D17 | Both at once | compound-complex sentence | The band-7/8 default | B2 | F | D15, D16 | |
| D18 | Sentences by what they do | declarative / interrogative / imperative / exclamative | Distinguishes structure from function; needed for Ch 22–24 | A2 | F | D14 | † |

**Authoring notes.** D8 † is a genuinely under-taught area with a high error cost: learners produce
*\*The results looked badly* because they were taught "adverbs modify verbs" and were never given the
linking-verb exception. Ship the closed list.

D12 † is the rule behind a whole family of errors that references treat one at a time. State it once:
in English an object stays glued to its verb, so anything long or adverbial goes after the object,
not between.

### 3.E Nouns and the noun phrase

Chapters 8 and 12.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| E1 | Ordinary names vs specific names | common / proper nouns | Drives capitalisation (X1) and article choice (F3) | A1 | F | B1 | |
| E2 | Things you can count vs things you can't | countability | **Upstream of every article error.** Wrong here, and F1–F4 cannot be applied | A1 | F+C | B1 | † |
| E3 | Adding `-s` | regular plural formation and its spelling rules | Cannot say "more than one" | A1 | F | E2 | |
| E4 | Odd plurals | irregular plurals (`children`, `criteria`, `analyses`, `phenomena`) | Academic writing is full of Greek/Latin plurals | A2 | F | E3 | |
| E5 | Words that look countable and are not | non-count nouns learners pluralise (`research`, `information`, `advice`, `equipment`, `knowledge`, `evidence`, `progress`, `feedback`, `machinery`, `accommodation`) | A closed high-frequency list; each mistake is highly visible | A2 | F | E2 | † |
| E6 | Words that are both, with different meanings | dual-membership nouns (`experience`, `time`, `paper`, `work`, `business`, `light`, `room`) | *a paper* ≠ *paper*; the article follows the sense | B1 | C | E2, E5 | † |
| E7 | How to count an uncountable thing | partitives (`a piece of`, `an item of`, `a body of`, `a great deal of`) | The repair for E5 | B1 | F | E5 | |
| E8 | Words for groups | collective nouns (`team`, `government`, `committee`, `staff`, `public`) | Agreement varies — see J3 and §5 | B1 | F+C | E2 | |
| E9 | Two nouns stuck together | compound nouns (`traffic congestion`, `energy policy`) | The commonest way English packs meaning; the first noun is singular | A2 | F | E1 | † |
| E10 | Saying something belongs to something | possessive `'s` / `of`-genitive | *the council's decision* vs *the decision of the council*: animacy and weight decide | A2 | F+C | E1, X8 | † |
| E11 | `a friend of mine` | double genitive | Blocks *\*a friend of me* | B1 | F | E10, G3 | |
| E12 | Words in front of the noun | premodification (determiner + adjective + noun modifier) | The order is fixed; see S3 and F15 | A2 | F | C7 | |
| E13 | Words after the noun | postmodification (prepositional phrase, relative clause, `-ing`/`-ed` clause, `to`-infinitive) | **This is where academic density comes from** | B2 | F | C7, P11 | † |
| E14 | Renaming a thing right after it | apposition (`the scheme, a ten-year plan, was …`) | A cheap, safe complexity move; punctuated with commas | B2 | F | E13, X3 | † |
| E15 | Turning an action into a thing | nominalisation (`prices rose` → `the rise in prices`) | **The largest single stylistic gap between band 6 and band 8 writing** | C1 | F+C | B14, E13 | † |
| E16 | Building a long, dense noun group | noun-phrase expansion | Lets one sentence carry what previously took three | C1 | F | E12, E13, E15 | † |
| E17 | Talking about things in general | generic reference | *Renewable energy is expensive* vs *\*The renewable energies are expensive* | B1 | C | E2, F3 | † |
| E18 | Nouns that only come in plural shape | pluralia tantum (`scissors`, `trousers`, `savings`, `outskirts`, `premises`) | Agreement and counting both behave oddly | B1 | F | E3 | |

### 3.F Determiners: articles and quantifiers

Chapters 9–10. **The single highest-frequency error surface in learner writing**, and the area where
a rule list is least useful and a procedure is most useful.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| F1 | `a` and `an` | indefinite article | First mention of one countable thing | A1 | F+C | E2 | |
| F2 | `the` | definite article | Reader can identify which one | A1 | C | F1 | † |
| F3 | No article at all | zero article | Generic plurals and uncountables; the commonest article error in academic writing | A2 | C | F1, F2, E17 | † |
| F4 | How to decide in three questions | the article decision procedure | A rule list cannot be executed mid-sentence; a three-question procedure can | B1 | C | F1–F3 | † |
| F5 | `the` because there is only one | unique reference, superlatives, ordinals, `same`, `only` | *the best result*, *the first stage*, *the sun* | A2 | C | F2 | |
| F6 | `the` because you said it already, or because of what comes next | anaphoric and cataphoric `the` | *the report I mentioned*; the `of`-phrase trigger | B1 | C | F2, E13 | † |
| F7 | Places and institutions | `in hospital` / `at university` / `to school` (BrE) vs `in the hospital` (AmE) | **[VARIES]** — see §5 | B1 | C | F3 | |
| F8 | `this, that, these, those` | demonstrative determiners | Distance, and text reference (W2) | A1 | F+C | B6 | |
| F9 | `my, your, his, her, its, our, their` | possessive determiners | Cannot express belonging without repetition | A1 | F | B6, G3 | |
| F10 | `some, any, no` | assertive / non-assertive determiners | The offer-and-request exception to "any in questions" | A1 | C | B6, N6 | † |
| F11 | `much, many, a lot of, plenty of` | quantifiers of large amount | Countability decides which | A1 | C | E2 | |
| F12 | `few / a few`, `little / a little` | quantifiers of small amount | **A meaning reversal**: *few* is negative, *a few* is positive | B1 | C | F11 | † |
| F13 | `all, both, half, each, every, either, neither` | distributive and total quantifiers | Each has a different agreement and a different `of`-pattern | A2 | F+C | F11, J5 | † |
| F14 | `most of the`, `some of these` | quantifier + `of` + determiner | *most students* ≠ *most of the students*, and the second needs the determiner | B1 | F+C | F13, F2 | † |
| F15 | The order little words go in | predeterminer + central determiner + postdeterminer (`all the many reasons`) | Explains *\*the all reasons* | B2 | F | F13 | † |
| F16 | Numbers, positions and parts | cardinals, ordinals, fractions, percentages | Task 1 cannot be written without them | A1 | F | B12 | |
| F17 | Saying what share of the whole | proportion language (`the majority of`, `a significant proportion of`, `barely any`, `one in four`) | Academic Task 1 requirement; agreement traps built in | B2 | F+C | F14, J7 | † |
| F18 | `such`, `what`, `quite`, `rather` before the article | predeterminers with `a/an` | *such a delay*, *quite a change*, *rather a shame*; the article moves | B2 | F | F15 | † |

### 3.G Pronouns

Chapter 11.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| G1 | `I, you, he, she, it, we, they` | subject pronouns | English never drops the subject — the day-one rule for pro-drop L1s | A1 | F | A2 | † |
| G2 | `me, you, him, her, it, us, them` | object pronouns | After verbs and after every preposition | A1 | F | A4, B7 | |
| G3 | `mine, yours, his, hers, ours, theirs` | possessive pronouns | Distinguished from possessive determiners (F9) — *my book* vs *mine* | A2 | F | F9 | † |
| G4 | `myself, yourself, …` | reflexive pronouns | Needed when subject and object are the same person | A2 | F | G2 | |
| G5 | `himself` for emphasis | emphatic (intensive) use of reflexives | *The minister himself signed it* | B2 | F | G4, U13 | |
| G6 | `each other`, `one another` | reciprocal pronouns | Blocks *\*They helped themselves* for a mutual action | B1 | F | G4 | † |
| G7 | `this, that, these, those` standing alone | demonstrative pronouns | Text reference; the commonest source of vague reference | A2 | F+C | F8, W2 | |
| G8 | `someone, anything, nobody, everywhere` | indefinite compound pronouns | Agreement (singular) plus the `any`/`some` split | A2 | F+C | F10, J4 | |
| G9 | `who, which, that, whose` inside a sentence | relative pronouns (pointer to P4–P10) | Named here, taught in Ch 25 | B1 | F | G1, A12 | |
| G10 | `who, what, which, whose, whom` at the front | interrogative pronouns (pointer to M2–M4) | Named here, taught in Ch 22 | A1 | F | G1 | |
| G11 | `It` that means nothing | dummy / anticipatory `it` (weather, time, distance, extraposition) | *It is important to note that…* — one of the highest-frequency academic openers | A2 | F+C | A2, U16 | † |
| G12 | `There` that means nothing | existential `there` | *There has been a sharp increase in…* — the other one | A2 | F+C | G11, U15 | † |
| G13 | `you`, `one`, `they` meaning people in general | generic pronouns | Register-loaded: `one` is formal, generic `you` is spoken, `they` is vague | B2 | C | G1 | † |
| G14 | `they` for one person | singular `they` | **[VARIES]** — long-established, now standard for unknown/indefinite reference; some readers still object. §5 | B2 | C | G1 | † |
| G15 | Making sure it is clear what a pronoun points back to | pronoun reference / antecedent ambiguity | The commonest cohesion failure in learner writing | B1 | C | G1, W1 | † |
| G16 | `one` / `ones` replacing a noun | substitution with `one` | *the red one*; part of W3 | A2 | F | G7, W3 | |

### 3.H Verb forms and the auxiliary system

Chapter 13. **The highest-leverage chapter in the reference.** Eight surface phenomena are one
mechanism. **[JUDGEMENT]**

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| H1 | The five shapes every verb has | base, `-s`, past, past participle, `-ing` | Every tense in Chapters 14–18 is built from these five | A1 | F | B2 | † |
| H2 | Adding `-ed` | regular past and past participle | The default past | A1 | F | H1 | |
| H3 | Verbs that don't play by the rules | irregular verbs | High-frequency verbs are almost all irregular | A1 | F | H2 | |
| H4 | Adding `-s` for he/she/it | third-person singular `-s` | Its absence is the most-noticed error in speech | A1 | F | H1, J1 | |
| H5 | Adding `-ing` | the `-ing` form (present participle / gerund) | Feeds every continuous tense and all of Chapter 28 | A1 | F | H1 | |
| H6 | Spelling when you add an ending | inflectional spelling rules (consonant doubling, `y`→`i`, silent `e`, `c`→`ck`) | Cheap, mechanical marks | A1 | F | H2, H4, H5 | |
| H7 | How the endings sound | `-s` as /s/ /z/ /ɪz/; `-ed` as /t/ /d/ /ɪd/ | **If you cannot hear it you will not write it** | A2 | F | H2, H4 | † |
| H8 | `be` | the verb `be` — all eight forms | The only English verb with more than two present shapes; irregular everywhere | A1 | F | H1 | |
| H9 | `have` | the verb `have` — main verb and auxiliary | Two different jobs in one word | A1 | F | H1 | † |
| H10 | `do` | the verb `do` — main verb and auxiliary | The auxiliary that appears only when no other one is there | A1 | F | H1 | † |
| H11 | The helper system, stated once | the auxiliary system: **N**egation, **I**nversion, **C**ode (ellipsis), **E**mphasis | Questions, negatives, short answers, tags, agreement echoes, emphatic `do`, ellipsis and negative inversion are **one rule** | A2 | F | H8, H9, H10 | † |
| H12 | Short forms | contractions (`'s`, `'ve`, `'d`, `'ll`, `n't`) | *`'d`* is `had` **or** `would`; *`'s`* is `is` **or** `has`. Listening depends on it | A1 | F+C | H11 | † |
| H13 | Which verb carries the time | finite verb within the verb phrase | Only the first verb in a chain is marked for time and person | B1 | F | A13, C2 | † |
| H14 | The order helpers come in | auxiliary ordering: modal → `have` → `be`(perfect) → `be`(passive) → main verb | Explains *would have been being examined* and why nobody says it | B2 | F | H11 | † |
| H15 | Verbs about states, not actions | stative verbs | *\*I am knowing* — but the list is a **use**, not a fixed set of words | A2 | C | B2 | † |
| H16 | Verbs that need an object, verbs that don't, verbs that do both | transitivity revisited at the lexical level | Decides what can be made passive (L13) | B1 | F+C | D7 | |
| H17 | Verbs where the thing does it to itself | ergative / labile verbs (`the door opened`, `sales increased`) | Task 1 depends on them; explains why `increase` needs no passive | B2 | C | H16, L15 | † |
| H18 | Verbs made of two or three words | multi-word verbs (pointer to T12–T16) | Named here so Chapter 13 can say where they live | A2 | F | B2, B7 | |

### 3.I Tense and aspect — the owner's first named ask

Chapters 14–18. The largest group, and the one with the most damage from bad teaching.

#### 3.I.1 The framework

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| I1 | Time vs the shape of the verb | tense vs time | *I leave on Friday* is present in shape and future in time. Without this the reader cannot understand any later chapter | A2 | C | H1 | † |
| I2 | Why books say twelve tenses | tense × aspect: the 12-cell grid, and the fact that English has **two** morphological tenses | **[FACT]** English marks only present and past on the verb; everything else is aspect and auxiliaries. The 12-cell grid is a teaching convention and must be labelled as one | B1 | F | I1 | † |
| I3 | The "finished / not finished" idea | perfect aspect, as one concept | Four tenses share one idea; teaching them separately costs four lessons and yields none | B1 | C | I2, H9 | † |
| I4 | The "in progress" idea | continuous / progressive aspect, as one concept | Same argument | B1 | C | I2, H8 | † |
| I5 | The "just states it" idea | simple aspect | The unmarked choice — and it must be presented as a *choice*, not as an absence | A2 | C | I3, I4 | † |

#### 3.I.2 The twelve cells

Each row: how it is built, what it means, and where it is genuinely used. **Every cell gets a full
paradigm table with positive, negative, question and short answer.**

| ID | Plain-English name | Technical name | Built from | Why it matters | CEFR | F/C | † |
|---|---|---|---|---|---|---|---|
| I6 | What is generally true; timetables | present simple | base / base+`-s` | Facts, habits, opinions, states — the default tense of academic writing | A1 | F+C | |
| I7 | What is happening now, and around now | present continuous | `am/is/are` + `-ing` | Temporary situations, changing trends, and **arrangements in the future** | A1 | F+C | |
| I8 | Past action, present relevance | present perfect | `have/has` + past participle | Cannot say "this has happened and it matters now" any other way | A2 | F+C | † |
| I9 | How long it has been going on | present perfect continuous | `have/has been` + `-ing` | Duration of an activity up to now | B1 | F+C | |
| I10 | Finished past | past simple | past form | The narrative default | A1 | F | |
| I11 | What was going on when | past continuous | `was/were` + `-ing` | Background for an interrupting event | A1 | F+C | |
| I12 | The past before the past | past perfect | `had` + past participle | Cannot make sequence explicit when the order is not obvious | B1 | F+C | † |
| I13 | How long something had been going on | past perfect continuous | `had been` + `-ing` | Duration up to a past point | B2 | F | |
| I14 | Predictions and decisions | future simple (`will`) | `will` + base | Predictions, instant decisions, promises, offers | A1 | F+C | |
| I15 | What will be going on at a future time | future continuous | `will be` + `-ing` | Also the neutral enquiry: *Will you be using the hall?* | B1 | F+C | † |
| I16 | Finished by a future point | future perfect | `will have` + past participle | *By 2035 the depot will have closed* | B2 | F | |
| I17 | Duration up to a future point | future perfect continuous | `will have been` + `-ing` | Rare; recognition-level only | C1 | F | |

#### 3.I.3 The other future forms — because there are eight, not one

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| I18 | `going to` | `be going to` future | Intentions already formed, and predictions from present evidence | A1 | F+C | I7 | |
| I19 | Present continuous for the future | future arrangements | *We're meeting the contractor on Thursday* — a fixed arrangement | A2 | C | I7 | † |
| I20 | Present simple for the future | timetable future | *The ferry leaves at six* — schedules only | A2 | C | I6 | † |
| I21 | `be about to`, `be on the point of` | imminent future | Very near future | B2 | F | I18 | |
| I22 | `be to`, `be due to`, `be set to` | formal / scheduled future | Newspaper and formal register; common in reading texts | B2 | F+C | I20 | † |
| I23 | `shall` | `shall` as future / offer / suggestion | **[VARIES]** — receding as a pure future marker; alive in offers/suggestions (*Shall I…?*) and in legal register. §5 | B1 | C | I14 | † |
| I24 | Picking a future form | the future-form decision | **The owner named this.** Five common forms, one deciding question each | B1 | C | I14, I18, I19, I20 | † |
| I25 | No `will` after `when` | future in time and conditional clauses | *When the work finishes* — present form, future meaning. Very high-frequency error | B1 | F+C | I24, P18 | † |
| I26 | Talking about a future seen from the past | future in the past (`was going to`, `would`, `was to`) | Narrative and reported speech both need it | B2 | F | I18, R2 | † |

#### 3.I.4 The choices — every DECIDING section in the tense chapters

| ID | The choice | Rivals | The deciding question | CEFR | Deps | † |
|---|---|---|---|---|---|---|
| I27 | Now vs always | present simple / present continuous | Is this a permanent state of affairs or a temporary/changing one? | A2 | I6, I7 | |
| I28 | Two past shapes | past simple / past continuous | Was it a whole finished event, or the background it happened against? | A2 | I10, I11 | |
| I29 | **Is the period finished?** | present perfect / past simple | Is the time period I am talking about finished? | A2 | I8, I10 | † |
| I30 | Result vs duration | present perfect simple / continuous | Am I interested in the completed result, or in how long the activity ran? | B1 | I8, I9 | † |
| I31 | Making order explicit | past simple / past perfect | Is the order of events already obvious from the sentence? If yes, past perfect is unnecessary | B1 | I10, I12 | † |
| I32 | Repeated past | `used to` / `would` / past simple | Is it a state? Then `used to` or past simple only — never `would` | B1 | I10, I33 | † |
| I33 | `used to` vs `be used to` | past habit vs being accustomed | Two unrelated structures that look identical; the second takes `-ing` | B1 | I32, O13 | † |
| I34 | Keeping tense steady | tense consistency across a text; narrative sequencing | A tense that slips mid-paragraph is highly visible and cheap to fix | B2 | I10, I12 | † |
| I35 | Tenses in academic writing | tense choice for claims, evidence, methods, trends | Present simple for accepted claims; present perfect for the research record; past for a completed study | C1 | I6, I8 | † |
| I36 | Telling a story in the present | historic / narrative present | Recognition mainly; occasional Speaking Part 2 use | B2 | I6 | |

### 3.J Subject–verb agreement

Chapter 19. Placed after tense because agreement cannot be stated without the tense forms.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| J1 | He/she/it takes `-s` | third-person singular concord | The single most-noticed accuracy error | A1 | F | H4 | |
| J2 | `am / is / are`, `was / were` | agreement with `be` | `be` agrees in more places than any other verb | A1 | F | H8 | |
| J3 | Group words | collective-noun agreement | **[VARIES]** BrE allows *the committee have*; AmE prefers *has*. §5 | B2 | C | E8 | † |
| J4 | `everyone`, `each`, `nobody` | indefinite-pronoun agreement | Grammatically singular; the pronoun that refers back is often `they` (G14) | A2 | F+C | G8 | † |
| J5 | `each` and `every` | distributive agreement | Both take a singular verb even with a plural sense | A2 | F | F13 | |
| J6 | `a number of` vs `the number of` | notional vs grammatical concord | *A number of studies **show*** / *The number of studies **is*** | B2 | F+C | F14 | † |
| J7 | `most of`, `some of`, `half of` | quantifier concord — the verb follows the **noun after `of`** | *Half of the budget **was*** / *Half of the councils **were*** | B2 | F+C | F14 | † |
| J8 | `none` | `none` agreement | **[VARIES]** Traditionally singular; plural agreement is standard in modern usage. §5 | B2 | C | J7 | † |
| J9 | Two subjects joined by `and` | coordinated-subject concord | Plural — unless the two names one thing (*research and development is*) | A2 | F | P1 | |
| J10 | `either … or`, `neither … nor` | proximity concord | The verb agrees with the **nearer** subject | B2 | F | P2 | † |
| J11 | When something long sits between | agreement across intervening material | *The list of approved contractors **was***, not *were*. Very common error in complex sentences | B1 | F | C6, E13 | † |
| J12 | Agreement inside a `who`/`which` clause | relative-clause concord | *one of the schemes that **have*** vs *the only scheme that **has*** | C1 | F+C | P4 | † |
| J13 | Words that end in `-s` but are not plural | two separate sets: (a) `news`, `mathematics`, `politics`, `economics`, `physics` — **always singular**; (b) `means`, `series`, `species` — **invariable**, same form for one or many, so the verb follows the sense (*one means **is*** / *several means **are***) | Conflating the two sets is the usual reference error | B1 | F | E3 | † |
| J14 | Words that are plural without `-s` | `people`, `police`, `cattle`, `staff` (BrE), `clergy` | *The police **are***, never *is* | A2 | F | E8 | † |
| J15 | `data`, `media`, `criteria` | Latin/Greek plurals in modern usage | **[VARIES]** `data` is now widely singular in general use, plural in strict scientific writing. §5 | C1 | C | E4 | † |
| J16 | Amounts, distances and times | measurement concord | *Ten years **is** a long commitment* — one quantity, singular verb | B2 | F+C | F16 | † |
| J17 | `There is` / `There are` | existential concord | The verb agrees with what comes **after** it | A2 | F | G12 | † |
| J18 | What the sentence is really about | notional concord in general | Names the principle that ties J3, J6, J7, J16 together | C1 | C | J3, J6, J7 | † |

### 3.K Modality — the owner's second named ask

Chapter 20. Organised as **two scales plus the past**, not as an alphabetical list of nine words.
**[JUDGEMENT]**

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| K1 | How helper-verbs of certainty behave | modal grammar: bare infinitive, no `-s`, no `do`, no `to`, no two in a row | One paradigm covers all nine core modals | A2 | F | H11, B11 | |
| K2 | How sure am I? | epistemic modality — the certainty scale (`must` → `will` → `should/ought to` → `may/might/could` → `can't`) | Cannot express degrees of confidence; central to academic hedging | B1 | C | K1 | † |
| K3 | How sure am I about the past? | modal perfect: `must have`, `can't have`, `might have`, `should have` + past participle | **The owner named this.** Learners systematically avoid it and lose the meaning entirely | B2 | F+C | K2, I8 | † |
| K4 | How necessary is it? | deontic modality — the obligation scale (`must` → `have to` → `should/ought to` → `needn't` → `mustn't`) | Rules, advice, prohibition | A2 | C | K1 | † |
| K5 | `must` vs `have to` | internal vs external obligation | A tendency, not an absolute: `must` is the speaker's own authority, `have to` an outside rule. `must` has **no past** — use `had to` | B1 | C | K4 | † |
| K6 | `mustn't` vs `don't have to` | prohibition vs absence of obligation | **A meaning reversal.** *You mustn't apply* ≠ *You don't have to apply* | B1 | C | K5 | † |
| K7 | `needn't have` vs `didn't need to` | unnecessary action done vs no necessity | **[VARIES]** The distinction is standard in reference grammars; in practice `didn't need to` is often used for both. Say both | C1 | C | K3, K6 | † |
| K8 | Can, could, be able to, managed to | ability, and the one-off past success | *I could swim* (general past ability) vs *I managed to swim* (one occasion) | A2 | F+C | K1 | † |
| K9 | Asking and giving permission | `can`, `could`, `may`, `be allowed to` | Politeness cline; `may` is the formal end | A2 | C | K8 | |
| K10 | Asking someone to do something | requests, offers, suggestions (`Could you…`, `Would you mind…`, `Shall I…`, `Why don't we…`) | Speaking Part 3 and everyday function | A2 | C | K9 | |
| K11 | Giving advice | `should`, `ought to`, `had better`, `might want to` | `had better` is a **warning**, not neutral advice — and it is not past | B1 | C | K4 | † |
| K12 | Typical behaviour | `will` and `would` for characteristic habit | *The old boiler will cut out if you overload it* | C1 | C | K2, I32 | † |
| K13 | Refusal | `won't` / `wouldn't` for unwillingness | *The lock wouldn't turn* — a very common natural use | B1 | C | K12 | † |
| K14 | `may` and `might` | possibility vs permission — two jobs, one word | Ambiguity that context resolves; worth naming | B1 | C | K2, K9 | |
| K15 | Helpers made of more than one word | semi-modals (`have to`, `have got to`, `be able to`, `be allowed to`, `be supposed to`, `be going to`, `had better`, `would rather`, `used to`, `need to`, `dare`) | These supply the past and future forms that true modals lack | B1 | F | K1 | † |
| K16 | Modals with continuous and perfect | `must be working`, `might have been waiting` | Lets modality combine with aspect | B2 | F | K1, I4 | † |
| K17 | Modals in the passive | `can be seen`, `must have been decided` | Very high frequency in academic writing | B2 | F | K1, L2 | |
| K18 | Softening a claim | hedging with modality (`may`, `might`, `tend to`, `appear to`, `it is possible that`) | **Overclaiming is a band-limiting habit**; hedging is how academic English states caution | C1 | C | K2, Y7 | † |
| K19 | What the past forms actually are | modal past-form summary table | `must`→`had to`; `can`→`could`; `may`→`was allowed to`; `will`→`would`; `shall`→`should` | B2 | F | K3, K5 | † |
| K20 | Modals in `if`-sentences | modality in conditionals (pointer to Q7) | `would`, `might`, `could` in main clauses; `should` in the `if`-clause | B2 | F+C | K1, Q3 | |
| K21 | `dare`, `need`, `used to` | marginal modals | Behave as both modal and ordinary verb; a genuine oddity worth one box | C1 | F | K15 | † |

### 3.L Voice — the owner's third named ask

Chapter 21.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| L1 | Putting the thing done first | the passive: concept | Lets the sentence start with what the reader already knows about | A2 | C | D2, A4 | † |
| L2 | Building it in every tense | passive formation: `be` + past participle across the grid | The complete table is what a reference is for | B1 | F | L1, H1, I2 | |
| L3 | Saying who did it | the `by`-agent, and why it is usually left out | The agent is included only when it is news | B1 | C | L1 | † |
| L4 | **When the passive is the right choice** | passive selection: five conditions (agent unknown / obvious / irrelevant; focus on the affected thing; **linking to the previous sentence**; describing a process; institutional distance) | **The owner named this.** The passive is an information-ordering device, not a formality device | B2 | C | L1, U1 | † |
| L5 | When the passive is wrong | passive overuse | Agentless passives that hide who is responsible; passives that break the given-new chain | C1 | C | L4, U1 | † |
| L6 | `get` instead of `be` | the `get`-passive | Informal, dynamic, often bad-news or good-news events: *the application got rejected*. Not for written Task 2 | B2 | C | L2, Y1 | † |
| L7 | `It is said that…` | impersonal / reporting passive, both patterns (`It is believed that X…` and `X is believed to…`) | The standard academic way to report an unattributed claim | C1 | F+C | L2, P12 | † |
| L8 | Having something done for you | causative `have`/`get` + object + past participle | *We had the roof replaced* — cannot be said any other way | B2 | F+C | L2 | † |
| L9 | Making someone do something | `have someone do`, `get someone to do`, `make someone do`, `let someone do` | Four patterns, four different infinitive shapes | B2 | F | L8, O9 | † |
| L10 | Passives that keep their preposition | prepositional passive (`the proposal was looked into`) | Blocks *\*the proposal was looked* | C1 | F | L2, T12 | † |
| L11 | Two-object verbs going passive | double-object passive (*the residents were sent a notice* / *a notice was sent to the residents*) | Two possible passives; English prefers the person as subject | B2 | F+C | D3, L2 | † |
| L12 | Passive `-ing` and `to` forms | non-finite passive (`being examined`, `to be examined`, `having been examined`) | Needed for reduced relatives and participle clauses | C1 | F | L2, O18 | † |
| L13 | Verbs that cannot go passive | intransitive and stative verbs (`happen`, `occur`, `resemble`, `lack`, `suit`, `fit`, `have`) | Blocks *\*The event was happened* — a very common error | B1 | F | H16, L1 | † |
| L14 | Describing a process | passive in process description | Nearly every process description is built on it | B2 | C | L4 | |
| L15 | When the thing seems to do it itself | ergative use (`sales rose`, `the door opened`) | The alternative to a passive — and the natural choice in data description | B2 | C | H17, L1 | † |
| L16 | Passive vs active as a style decision | voice choice as a whole | The DECIDING table for the chapter | C1 | C | L4, L5 | |

### 3.M Questions — the owner's fourth named ask ("WH questions")

Chapter 22.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| M1 | Yes-or-no questions | polar / yes-no questions; subject–auxiliary inversion | The first question type; requires H11 | A1 | F | H11 | |
| M2 | Question words | `wh`-words: `who, what, which, whose, where, when, why, how` (+ `how much/many/long/often/far`) | Cannot ask for information without them | A1 | F | M1 | |
| M3 | Questions about the object | object `wh`-questions | *What did the council announce?* — auxiliary + inversion | A1 | F | M2 | |
| M4 | Questions about the doer | **subject `wh`-questions** | *Who announced it?* — **no `do`, no inversion.** Systematically under-taught | A2 | F | M3 | † |
| M5 | Questions with position words | `wh`-questions with prepositions (*Who did you speak to?* / *To whom did you speak?*) | **[VARIES]** stranded (normal) vs fronted (formal). §5 | B1 | F+C | M3, T10 | † |
| M6 | `A or B?` | alternative questions | Intonation-marked; different answer type from a yes-no question | A2 | F | M1 | |
| M7 | `…, isn't it?` | question tags — all patterns, incl. `I am → aren't I`, `let's → shall we`, imperative tags, same-polarity tags | Speaking naturalness; and the intonation changes the meaning | B1 | F+C | H11, M1 | † |
| M8 | `Didn't you…?` | negative questions | Expresses surprise or expects agreement; the yes/no answer is genuinely ambiguous | B1 | C | M1, N1 | † |
| M9 | `Yes, I have.` | short answers | Ellipsis with the auxiliary — the C in H11 | A1 | F | H11 | |
| M10 | `Oh, did they?` | reply questions / echo questions | Shows engagement; pure spoken grammar | B2 | F | M1, Y1 | † |
| M11 | Polite, wrapped-up questions | indirect questions (`Could you tell me where the office is?`) | **No inversion in the second half** — the classic error | B1 | F | M3, P13 | † |
| M12 | Questions inside statements | embedded questions (`I don't know why it closed`) | Same word-order rule as M11; the base of reported questions (R6) | B1 | F | M11 | † |
| M13 | `what to do` | question word + `to`-infinitive | Compresses an embedded question | B2 | F | M12, O1 | |
| M14 | Questions that are not questions | rhetorical questions | Speaking Part 3 and essay openers — with a warning about overuse in Task 2 | B2 | C | M1, Y6 | |
| M15 | Statements said as questions | declarative questions (*You're leaving already?*) | Spoken only; recognition | B2 | C | M1, Y1 | |
| M16 | `Any idea when…?` | reduced / elliptical questions | Spoken register | B2 | F | M9, W4 | |
| M17 | How a question sounds | question intonation (rise vs fall) and what it changes | The tag's meaning is carried entirely by intonation | B1 | C | M7 | † |

### 3.N Negation

Chapter 23. Assumed known by most references; it is not.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| N1 | `not` after the helper | verb negation with auxiliaries | The N in H11 | A1 | F | H11 | |
| N2 | `don't`, `doesn't`, `didn't` | `do`-support in negation | When there is no other helper, `do` appears | A1 | F | N1, H10 | |
| N3 | `no` vs `not` | determiner negation vs verb negation | *There is no evidence* vs *There isn't any evidence* — register differs | B1 | C | N1, F10 | † |
| N4 | Negative words in front | negative determiners and pronouns (`no`, `none`, `nobody`, `nothing`, `neither`) | One negative per clause in standard English | A2 | F | N3 | |
| N5 | `never, hardly, rarely, seldom, barely, scarcely` | negative and semi-negative adverbs | Grammatically negative — they block a second negative and they trigger inversion (U8) | B2 | F+C | N4, S11 | † |
| N6 | `any` in negatives and questions | non-assertive forms | *I haven't got any* / *\*I haven't got some* — plus the offer exception (*Would you like some?*) | A2 | C | F10 | † |
| N7 | `I don't think it will…` | transferred / raised negation | English negates the reporting verb, not the clause. Very high frequency, rarely taught | B2 | C | N1, P12 | † |
| N8 | What exactly is being denied | scope of negation | *All the schemes did not succeed* is ambiguous; *None of the schemes succeeded* is not | C1 | C | N4 | † |
| N9 | `…either`, `neither`, `nor` | negative agreement and addition | *I didn't either* / *Neither did I* / *Nor was it cheap* | B1 | F | N1, V7 | |
| N10 | `un-`, `in-`, `dis-`, `non-` | negative affixation | Often the more academic way to negate | B2 | F | B15 | † |
| N11 | Two negatives in one clause | double negation | **[VARIES]** Non-standard in most dialects for a single negative meaning; standard when deliberate understatement (*not uncommon*). §5 | C1 | C | N4 | † |
| N12 | Answering a negative question | answering polarity | *Didn't you apply?* — *No* means you didn't. A genuine confusion for many L1s | B1 | C | M8, N1 | † |
| N13 | Saying "not" before `to do` / `doing` | negating non-finite forms (`not to be`, `not having`) | *He decided **not to** appeal*, not *\*He didn't decide to appeal* if the meaning is different | B2 | F+C | O1, O3 | † |
| N14 | Negative + modal | scope with modals (`may not` = permission denied or possibility denied; `cannot` = both) | Genuine ambiguity worth naming | C1 | C | K2, N1 | † |

### 3.O Non-finite clauses and verb patterns

Chapter 28. The largest lexis-shaped area. **The chapter must state, up front and plainly, that most
of this is a list and not a rule.** [JUDGEMENT]

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| O1 | `to do` | `to`-infinitive | One of the two ways a verb follows a verb | A1 | F | A14 | |
| O2 | `do` with no `to` | bare infinitive | After modals, after `make`/`let`, after `had better`/`would rather` | A2 | F | O1, K1 | |
| O3 | `doing` used as a thing | gerund | The other way; also a noun-slot filler | A2 | F | H5 | |
| O4 | `doing` used as a describing word or a clause | present participle | *the team **running** the trial* | B2 | F | H5, P11 | |
| O5 | `done` used as a describing word or a clause | past participle clause | *the figures **published** last week* | B2 | F | H1, P11 | |
| O6 | Verbs followed by `-ing` | verb + gerund (`enjoy, avoid, consider, suggest, deny, risk, involve, practise, mind, finish, delay, imagine`) | **A list. There is no rule.** Saying so saves the reader weeks | B1 | F | O3 | † |
| O7 | Verbs followed by `to do` | verb + `to`-infinitive (`decide, hope, refuse, manage, offer, agree, fail, seem, appear, tend, afford, arrange`) | Same | B1 | F | O1 | † |
| O8 | Verbs with a person then `to do` | verb + object + `to`-infinitive (`want, ask, tell, allow, encourage, persuade, expect, force, enable, remind`) | **The `enable/allow` pattern is the workhorse of academic writing** | B1 | F | O7 | † |
| O9 | Verbs with a person then a bare verb | verb + object + bare infinitive (`make`, `let`, `have`; and `help` with either) | *made them **rethink***; the passive of `make` restores `to` (*were made **to** rethink*) | B2 | F | O2, L9 | † |
| O10 | Verbs followed by `that…` | verb + `that`-clause (pointer to P12) | The third way a verb takes a complement | B1 | F | P12 | |
| O11 | Verbs with a position word then `-ing` | verb + preposition + `-ing` (`insist on`, `succeed in`, `result in`, `object to`) | The `to` in `object to doing` is a preposition, not an infinitive marker — a classic trap | B2 | F | O13, T6 | † |
| O12 | Verbs where the ending changes the meaning | meaning-change verbs: `remember, forget, regret, stop, try, go on, mean, need, come, propose` | *stop **to** check* ≠ *stop **checking***. A closed set and genuinely rule-shaped | B2 | C | O6, O7 | † |
| O13 | `-ing` after every position word | gerund after preposition | **The one real rule in the whole area**: after a preposition, always `-ing` | A2 | F | O3, B7 | † |
| O14 | `to` meaning "in order to" | infinitive of purpose (`to`, `in order to`, `so as to`) | The cheapest purpose structure; `for` + `-ing` is a common wrong substitute | A2 | F+C | O1, P21 | † |
| O15 | `hard to explain` | adjective + `to`-infinitive | Very high frequency, incl. `it is difficult to…` (G11) | B1 | F | O1, C3 | |
| O16 | `the need to act` | noun + `to`-infinitive | Compresses a whole clause into a noun phrase | B2 | F | O1, E13 | † |
| O17 | `to have done` | perfect infinitive | *seems **to have been** overlooked*; carries "earlier than the main verb" | C1 | F | O1, I3 | † |
| O18 | `to be done`, `being done`, `having been done` | passive and perfect non-finites | Needed for L12 and academic reporting | C1 | F | O17, L12 | † |
| O19 | `-ing` as the subject | gerund as subject | *Replacing the culverts proved expensive* — an easy complexity win | B2 | F | O3, A2 | † |
| O20 | `his leaving` vs `him leaving` | possessive with gerund | **[VARIES]** possessive is formal, object form is normal in speech. §5 | C1 | C | O3, F9 | † |
| O21 | Shortening a `because`/`when` clause | participle (reduced adverbial) clause: *Having reviewed the data, the panel…* | **Academic density, and the source of the dangling modifier error** | C1 | F+C | O4, O5, P18 | † |
| O22 | Clauses with their own subject | absolute construction (*The survey complete, work began*) | Rare, formal, recognition-level | C2 | F | O21 | |
| O23 | `to boldly go` | split infinitive | **[VARIES]** Not an error; the "rule" is a prescriptive invention. §5 | B2 | C | O1 | † |
| O24 | `too … to`, `enough … to` | infinitive after degree words (pointer to V4–V6) | Extremely high frequency | A2 | F | O1, V4 | |
| O25 | Which pattern a verb takes | verb-pattern reference table | **The chapter's deliverable is the table** (Appendix B), not the prose | B2 | F | O6–O12 | † |

### 3.P Clause combining: relative, noun and adverbial clauses

Chapters 25–27. Where band 6 becomes band 7.

#### 3.P.1 Joining and coordination

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| P1 | `and, but, or, so, yet, for, nor` | coordinating conjunctions | Joins equals; and the comma rule that goes with it | A1 | F | D15 | |
| P2 | `both … and`, `either … or`, `neither … nor`, `not only … but also` | correlative conjunctions | Balanced pairs — and `not only` at the front triggers inversion (U8) | B2 | F | P1, P29 | † |
| P3 | Hanging a clause off a main clause | subordination: the concept | The gateway to all of Chapters 25–29 | B1 | F | A12 | |

#### 3.P.2 Relative clauses (Chapter 25)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| P4 | Saying which one you mean | defining (restrictive) relative clause | The cheapest route from short sentences to controlled complex ones | B1 | F | P3, C7 | |
| P5 | Adding extra information | non-defining (non-restrictive) relative clause | **The comma is a consequence of the meaning, not a rule to memorise** | B2 | F+C | P4, X3 | † |
| P6 | Leaving the joining word out | zero relative (omission when the relative is the object) | *the report (that) the panel produced* — cannot be omitted when it is the subject | B1 | F+C | P4 | † |
| P7 | `in which` vs `which … in` | relative clauses with prepositions | **[VARIES]** fronted = formal writing; stranded = everything else. `that` cannot follow a preposition | B2 | F+C | P4, T10 | † |
| P8 | `whose` | possessive relative — for people **and** things | *the company whose accounts…* is correct; learners avoid it | B2 | F | P4, E10 | † |
| P9 | `some of which`, `many of whom` | quantifier + relative | A high-value, low-risk complexity structure | C1 | F | P4, F14 | † |
| P10 | `…, which meant that…` | sentential (connective) relative — refers to the whole clause | One of the most useful C1 structures and almost never taught | C1 | F+C | P5 | † |
| P11 | Cutting the relative clause down | reduced relative clauses (`-ing`, `-ed`, `to`-infinitive) | *the residents living nearby*; **the main source of academic noun-phrase density** | C1 | F | P4, O4, O5 | † |

#### 3.P.3 Noun clauses (Chapter 26)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| P12 | `that …` as a thing | `that`-clause as subject, object, complement or in apposition | *The fact **that** the scheme failed…* — the base of academic argument | B1 | F | P3, A4 | |
| P13 | `what/where/whether …` as a thing | `wh`-clause / nominal clause | *Whether the policy works remains unclear* | B2 | F | P12, M12 | |
| P14 | `whether` vs `if` | indirect yes-no clauses | `whether` before `or not`, before `to`-infinitive, and after prepositions; `if` cannot do those | B2 | C | P13 | † |
| P15 | `What we need is…` | nominal relative clause | Doubles as a cleft (U5) | C1 | F | P13, U5 | |
| P16 | Pushing the long bit to the end | extraposition with `it` | *It is widely accepted that…* — **the highest-frequency academic sentence opener** | B2 | F+C | G11, P12 | † |
| P17 | `recommend that it be reviewed` | mandative subjunctive | **[VARIES]** bare form is standard in AmE and formal BrE; `should` + base is the usual BrE alternative. §5 | C1 | C | P12, K4 | † |

#### 3.P.4 Adverbial clauses (Chapter 27)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| P18 | When | time clauses (`when, while, as, before, after, until, since, once, as soon as, by the time`) | Plus the no-`will` rule (I25) | A2 | F+C | P3, I25 | † |
| P19 | Where | place clauses (`where`, `wherever`) | Small but complete | B1 | F | P3 | |
| P20 | Why | reason clauses (`because, since, as, seeing that`) and `because of` + noun | *because* + clause vs *because of* + noun — a constant error | A2 | F+C | P3 | † |
| P21 | What for | purpose clauses (`so that`, `in order that`) and purpose infinitives | *so that they **could** apply* — the modal is obligatory | B1 | F | P3, O14 | † |
| P22 | What happened as a result | result clauses (`so … that`, `such … that`, `with the result that`) | Distinguished from purpose — a genuine confusion | B2 | F+C | P21, V3 | † |
| P23 | Contrast and "even though" | concession and contrast (`although, though, even though, while, whereas`) and `despite`/`in spite of` + noun/`-ing` | **`despite` never takes a clause** unless followed by `the fact that` | B1 | F+C | P3, O13 | † |
| P24 | If | conditional clauses (pointer to Chapter 29) | Named here so the chapter's map is complete | A2 | F+C | Q1 | |
| P25 | How | manner clauses (`as`, `as if`, `as though`, `the way`) | Also feeds Q17 | B2 | F+C | P3 | |
| P26 | Comparison as a clause | comparative clauses (`than`, `as … as` + clause) | *than had been expected* | B2 | F | S18, S24 | |
| P27 | The more … the more | proportional clauses | A high-value, memorable C1 structure | C1 | F | S21 | † |
| P28 | Except when | exception clauses (`except that`, `apart from`, `other than`) | Small, useful, always omitted from syllabi | C1 | F | P3 | † |
| P29 | Keeping the two halves the same shape | parallel structure | Broken parallelism in lists is highly visible and cheap to fix | B2 | F | P1, P2 | † |
| P30 | Where the subordinate clause goes | clause position and its punctuation | Front position takes a comma; end position usually does not | B1 | F+C | P3, X3 | † |
| P31 | Not overdoing it | complex-sentence control; sentence-length variation | **Long is not the same as good.** The band-7 property is *complete, error-free* complex sentences | C1 | C | D17, P30 | † |

### 3.Q Conditionals and the unreal past — the owner's fifth named ask ("conditions")

Chapter 29. Taught as **two systems with numbers applied afterwards**, matching the practice module's
resolved position (grammar `DESIGN.md` §0.5 row 5).

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| Q1 | Real vs imaginary | the real/unreal distinction, and the **unreal past** as one device | One idea underlies second and third conditionals, `wish`, `if only`, `would rather`, `it's time` and polite distancing | B1 | C | I10, P3 | † |
| Q2 | Always-true `if` | zero conditional (`if` + present, present) | Rules, scientific fact, habitual results | A2 | F | Q1, I6 | |
| Q3 | Likely future `if` | first conditional (`if` + present, `will`/modal/imperative) | Real future possibility | A2 | F | Q2, I25 | |
| Q4 | Imaginary present `if` | second conditional (`if` + past, `would` + base) | Hypothetical present or unlikely future | B1 | F+C | Q1, K1 | † |
| Q5 | Imaginary past `if` | third conditional (`if` + past perfect, `would have` + past participle) | Regret and counterfactual reasoning | B2 | F | Q4, I12 | |
| Q6 | Crossed times | mixed conditionals (past condition → present result; present condition → past result) | Where real reasoning about consequences lives | C1 | F+C | Q5 | † |
| Q7 | Other helpers in `if`-sentences | modals in conditionals (`might`, `could`, `may`, `should` in the `if`-clause) | The four numbered types are a starting grid, not the boundary | B2 | F+C | Q3, K20 | † |
| Q8 | `Had we known…` | conditional inversion (`Were I…`, `Had we…`, `Should you…`) | Formal register; **high error surface**, so it ships with a risk warning | C1 | F | Q5, D13 | † |
| Q9 | `unless` | `unless` and why it is **not** always "if not" | *I'd be surprised if it didn't pass* cannot become *unless it passed* | B2 | C | Q3 | † |
| Q10 | Other ways to say `if` | `provided/providing that`, `as long as`, `on condition that`, `in case`, `otherwise`, `but for`, `even if`, `only if`, `supposing`, `what if`, `imagine` | `in case` ≠ `if`: it means "as a precaution" | B2 | C | Q3, Q9 | † |
| Q11 | Wanting the present to be different | `wish` / `if only` + past simple | *I wish I lived closer* | B1 | F+C | Q1, Q4 | † |
| Q12 | Regretting the past | `wish` / `if only` + past perfect | *I wish I had applied* | B2 | F | Q11, Q5 | |
| Q13 | Complaining about someone's behaviour | `wish` + `would` | *I wish they would publish the figures* — **not usable about yourself** | B2 | C | Q11 | † |
| Q14 | `I'd rather` | `would rather` + bare infinitive (same subject) / + past simple (different subject) | Two structures, one phrase — a real trap | B2 | F+C | Q1, O2 | † |
| Q15 | `You'd better` | `had better` (+ bare infinitive) | A **warning**, not neutral advice; and it is not a past tense | B1 | F+C | K11, O2 | † |
| Q16 | `It's time we…` | `it's (high) time` + past simple | Unreal past again — same device, different wrapper | B2 | F | Q1 | † |
| Q17 | `as if`, `as though` | unreal comparison | *He talks as if he owned the place* | C1 | F+C | P25, Q1 | † |
| Q18 | `If I were` | the `were`-subjunctive | **[VARIES]** `were` in formal/hypothetical use; `was` is normal in speech. §5 | B2 | C | Q4 | † |
| Q19 | Politeness by distancing | past forms for politeness (`I was wondering whether…`, `Would you mind…`) | The same unreal-past device used socially | B2 | C | Q1 | † |
| Q20 | Careful claims in essays | conditional and hypothetical hedging (`if this trend continues, …`) | Lets a writer reason about consequences without overclaiming | C1 | C | Q3, K18 | |
| Q21 | Which one to use | the conditional DECIDING table | The chapter's payload: one table, five rows, one deciding question | B2 | C | Q2–Q6 | † |

### 3.R Reported speech

Chapter 30. Placed after Chapter 26 (noun clauses) and Chapter 22 (questions) because it reuses both.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| R1 | Saying what someone said, without quoting | indirect / reported speech: the concept | Half of Speaking Part 3 and most of academic citation | B1 | F | P12 | |
| R2 | Moving the tense back | backshift — the full table | The mechanical core | B1 | F | R1, I12 | |
| R3 | When you do **not** move it back | backshift exceptions: still true, general truth, present reporting verb, immediate report, already-past modals | **Presenting backshift as obligatory is the commonest error in references** | B2 | C | R2 | † |
| R4 | Changing `I`, `here`, `yesterday` | deictic shifts (pronouns, time, place, demonstratives) | Without it the report is incoherent | B1 | F | R2, G1 | † |
| R5 | Reporting a statement | reported statements | The base pattern | B1 | F | R2 | |
| R6 | Reporting a question | reported questions: **statement word order**, `if`/`whether`, no question mark | Reuses M11/M12 exactly — teaching it twice is a wasted lesson | B1 | F | M12, P14 | † |
| R7 | Reporting an order or a request | reported commands (`told … to`, `asked … not to`) | Uses the O8 pattern | B1 | F | O8 | |
| R8 | Reporting offers, suggestions, promises | reporting verbs with varied patterns (`offered to`, `suggested -ing/that`, `promised to/that`, `refused to`, `admitted -ing`) | The pattern is a property of the verb, not of the meaning | B2 | F | O6, O7, O8 | † |
| R9 | Which pattern each reporting verb takes | reporting-verb pattern table | The chapter's deliverable | B2 | F | R8, O25 | † |
| R10 | Choosing the reporting verb on purpose | reporting verbs and stance (`said`, `claimed`, `argued`, `pointed out`, `admitted`, `conceded`, `maintained`) | **The choice is an argument move.** Task 2 grammar and reading-paraphrase grammar at once | C1 | C | R9, Y7 | † |
| R11 | Citing sources in an essay | academic reporting (`X argues that…`, `it has been suggested that…`) | Where R10 and L7 meet | C1 | C | R10, L7 | † |
| R12 | `It is reported that…` | reporting passives (pointer to L7) | Named here for completeness | C1 | F | L7 | |
| R13 | `say` vs `tell` | complementation of `say`/`tell` | *tell **someone** something*; *say something (**to** someone)* | A2 | F | R5 | † |

### 3.S Adjectives, adverbs and comparison

Chapters 31–33.

#### 3.S.1 Adjectives (Chapter 31)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| S1 | Before the noun or after `be` | attributive vs predicative position | Two slots, and some adjectives only take one | A1 | F | B3, D4 | |
| S2 | Adjectives that only go in one place | position-restricted adjectives (`main`, `sole`, `former` — attributive only; `asleep`, `afraid`, `alone`, `content` — predicative only) | Blocks *\*the asleep child* | B2 | F | S1 | † |
| S3 | What order two adjectives go in | adjective ordering (opinion → size → physical quality → shape → age → colour → origin → material → type/purpose) | **[VARIES]** a strong tendency, not an absolute law, and references disagree on the middle slots. §5 | B1 | F | S1 | † |
| S4 | `-ed` vs `-ing` describing words | participial adjectives (`frustrated` vs `frustrating`) | *\*I am boring* says something quite different | A2 | C | S1, H5 | † |
| S5 | Words you can and can't say `very` with | gradable vs non-gradable (absolute/classifying) adjectives, and their intensifiers (`very` vs `absolutely`, `completely`, `entirely`) | *\*very essential*, *\*absolutely difficult* | B2 | C | S1, S20 | † |
| S6 | Joined-up describing words | compound adjectives and their hyphens (`a five-year plan`, `well-documented`) | Hyphenation before the noun only; and no plural on the number | B2 | F | S1, X11 | † |
| S7 | `the poor`, `the unemployed` | adjectives used as nouns | Standard in academic writing about groups | B2 | F | S1, E1 | † |
| S8 | Adjective + position word | adjective + dependent preposition (`aware of`, `responsible for`, `similar to`) | Not derivable; it is a list | B1 | F | T7 | † |
| S9 | Adjective + `that` / + `to do` | adjective complementation | *It is clear that…* / *hard to justify* | B2 | F | O15, P12 | |

#### 3.S.2 Adverbs and adverbials (Chapter 32)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| S10 | Making an adverb from an adjective | `-ly` formation and its spelling changes | Plus the irregulars (`good`→`well`, `fast`, `hard`, `late`) | A1 | F | B4, S1 | † |
| S11 | The kinds of adverb | manner, place, time, frequency, degree, focus, viewpoint, stance, connective | Position depends on kind — this is the whole chapter | A2 | F | B4 | † |
| S12 | Where an adverb goes | front / mid / end position, and the mid-position rule (**after the first auxiliary, after `be`, before other main verbs**) | **Routinely under-explained**, and wrong placement is highly visible | B1 | F+C | S11, H14 | † |
| S13 | `always, often, rarely` | frequency adverbs and their position | Different position with `be` than with other verbs | A1 | F | S12 | † |
| S14 | `only`, `even`, `also`, `just` | focus adverbs — position changes the meaning | *Only the council approved it* ≠ *The council only approved it* | B2 | C | S12 | † |
| S15 | `frankly`, `arguably`, `admittedly` | stance / comment adverbials | How a writer signals attitude without saying "I think" | C1 | C | S11, Y7 | † |
| S16 | Adverbs that join sentences | conjuncts / linking adverbials (pointer to W5) | Different punctuation from conjunctions — see W8 | B1 | F | S11, W5 | † |
| S17 | Two or more adverbials in one sentence | adverbial ordering (manner → place → time) and end-weight | *\*We arrived on Tuesday at the depot* reads wrong | B1 | F+C | D11, S12 | † |
| S18 | Adverbs that modify adjectives | degree adverbs / intensifiers and downtoners (`highly`, `considerably`, `slightly`, `somewhat`, `barely`) | Precision in Task 1 and hedging in Task 2 | B2 | F+C | S5 | † |

#### 3.S.3 Comparison (Chapter 33)

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| S19 | `-er` and `more` | comparative formation, incl. the syllable rule and its grey zone | **[VARIES]** two-syllable adjectives often allow both (`commoner`/`more common`). §5 | A1 | F | S1 | † |
| S20 | `-est` and `most` | superlative formation, and the obligatory `the` | *the most efficient* | A1 | F | S19 | |
| S21 | `good/better/best` | irregular comparison (`good, bad, far, little, many/much`) | Small closed list | A1 | F | S19 | |
| S22 | `farther` vs `further` | irregular comparison variation | **[VARIES]** §5 | B2 | C | S21 | |
| S23 | `as … as` | equative comparison, and `not as/so … as` | The third comparison structure, and the one learners avoid | A2 | F | S19 | |
| S24 | `less` and `least` | comparison downwards, and `fewer` vs `less` | **[VARIES]** prescriptive `fewer` with countables. §5 | B1 | F+C | S19, E2 | † |
| S25 | `much bigger`, `slightly higher` | comparative modifiers / graders (`far`, `a lot`, `considerably`, `marginally`, `nowhere near`, `no`) | **Task 1 precision lives here**, and it is usually taught as vocabulary | B2 | F+C | S19, S18 | † |
| S26 | `the more … the more` | double / correlative comparative | High-value C1 structure | C1 | F | S19, P27 | † |
| S27 | `twice as many`, `a threefold increase` | multiples and proportional comparison | Academic Task 1 requirement | B2 | F | S23, F16 | † |
| S28 | Describing a rise or a fall | the language of change (`rise/fall` as verb and noun; `by` vs `to` vs `in`; `peak`, `plateau`, `fluctuate`) | *rose **by** 5%* ≠ *rose **to** 5%* ≠ *a rise **in** prices*. Three prepositions, three meanings | B2 | F+C | S25, T6 | † |
| S29 | `than I` vs `than me`; `like` vs `as` | comparison-clause detail | **[VARIES]** both pairs are register splits, not right/wrong. §5 | C1 | C | S19, P26 | † |
| S30 | `the same as`, `similar to`, `different from` | similarity and difference structures | **[VARIES]** `different from/to/than`. §5 | B1 | F+C | S23, T7 | † |
| S31 | Careful superlatives | superlative hedging (`one of the most…`, `among the largest`) | Avoids the overclaiming that a bare superlative causes | C1 | C | S20, K18 | † |

### 3.T Prepositions and multi-word verbs

Chapters 34–35. **Half of this group is lexis wearing a grammar costume, and the chapter must say
so.** [JUDGEMENT]

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| T1 | When: `at`, `on`, `in` | prepositions of time, plus `by/until`, `for/since`, `during/while`, `from…to` | The `for`/`since` and `during`/`while` pairs are the expensive ones | A1 | F+C | B7 | † |
| T2 | Where: `at`, `on`, `in` | prepositions of place, plus `above/over`, `below/under`, `between/among`, `beside/besides`, `opposite/across from` | Spatial description in Task 1 maps | A1 | F+C | B7 | |
| T3 | Which way | prepositions of movement (`to`, `into`, `onto`, `through`, `across`, `along`, `past`, `towards`, `off`, `out of`) | *to* vs *into* vs *in* is a genuine three-way choice | A2 | F+C | T2 | |
| T4 | Other jobs prepositions do | `by`/`with` (agent vs instrument), `of`, `for`, `about`, `as`, `like` | *written **by** hand* vs *written **with** a pen* | B1 | C | T1, T2 | † |
| T5 | A preposition then `-ing` | preposition + gerund (pointer to O13) | The one hard rule of the area | A2 | F | O13 | |
| T6 | Verbs that come with a fixed preposition | dependent prepositions after verbs (`depend on`, `result in`, `consist of`, `contribute to`, `benefit from`) | **Not rule-derivable. These are chunks and must be labelled as chunks** | B1 | F | T4 | † |
| T7 | Adjectives with a fixed preposition | dependent prepositions after adjectives (`aware of`, `responsible for`, `capable of`, `consistent with`) | Same | B1 | F | S8 | † |
| T8 | Nouns with a fixed preposition | dependent prepositions after nouns (`an increase **in**`, `a solution **to**`, `a reason **for**`, `the effect **on**`) | Nominalisation (E15) fails without these | B2 | F | E15, T6 | † |
| T9 | Preposition phrases describing a noun | prepositional postmodification (`the rise in unemployment among graduates`) | Stacked `of`-phrases are the commonest density device — and the commonest overuse | B2 | F+C | E13, C5 | † |
| T10 | A preposition left at the end | preposition stranding | **[VARIES]** Standard English. "Never end a sentence with a preposition" is a prescriptive myth. §5 | B2 | C | T4, P7 | † |
| T11 | Prepositions made of several words | complex prepositions (`in accordance with`, `with regard to`, `in the light of`, `owing to`) | Formal register; a compact way to build an adverbial | C1 | F | T4 | |
| T12 | Verbs with a little word stuck on | multi-word verbs: the four types (intransitive phrasal; transitive separable; prepositional; phrasal-prepositional) | The distinction decides whether the object can move | B1 | F | H18, B7 | † |
| T13 | Where the object goes | separability, and the **pronoun rule** (a pronoun object must go in the middle: *turn it down*, not *\*turn down it*) | The single most useful rule in the area | B1 | F | T12 | † |
| T14 | Are they informal? | register of multi-word verbs | **A myth worth killing**: many are register-neutral or academic (`carry out`, `point out`, `result in`, `bring about`, `account for`). Others are firmly spoken | B2 | C | T12, Y1 | † |
| T15 | Three-word verbs | phrasal-prepositional verbs (`put up with`, `look forward to`, `come up with`) | Never separable | B2 | F | T12 | |
| T16 | Which is which | distinguishing phrasal from prepositional verbs (the movement test, the stress test) | Explains T13 rather than asking the reader to memorise it | C1 | F | T12, T13 | † |
| T17 | Multi-word verbs that go passive | phrasal-verb passives (pointer to L10) | *The claim was **followed up*** | C1 | F | L10 | |

### 3.U Information structure and emphasis

Chapters 36–37. **The band-8 differentiator that almost no syllabus contains.** [JUDGEMENT]

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| U1 | Old information first, new information last | given–new ordering / information structure | **The principle behind the passive, the cleft, fronting and `there is`.** Without it those four are arbitrary tricks | C1 | C | D10, L4 | † |
| U2 | Long things go at the end | end-weight and end-focus | Explains extraposition (P16) and the dative alternation (D9) | C1 | C | U1 | † |
| U3 | Putting the unusual thing first | fronting / preposing (*That argument I find hard to accept*) | Spoken emphasis and written contrast | C1 | F+C | U1, D13 | † |
| U4 | `It was the bridge that…` | `it`-cleft | Singles out one element for contrast | C1 | F | G11, U1 | † |
| U5 | `What we need is…` | `wh`-cleft (pseudo-cleft) | The most useful cleft in speech and in essay openers | C1 | F | P15 | † |
| U6 | `More staff is what we need` | reversed `wh`-cleft | The mirror of U5 | C2 | F | U5 | |
| U7 | `All I want is…` | `all`-cleft | Restrictive emphasis | C1 | F | U5 | |
| U8 | `Never before had they…` | inversion after negative and restrictive adverbials (`never`, `rarely`, `seldom`, `not only`, `no sooner … than`, `hardly … when`, `under no circumstances`, `little did …`) | High impact, **high error surface** — ships with a risk warning | C1 | F | D13, N5 | † |
| U9 | `Only after the review did…` | inversion after `only` + adverbial | Same family, same warning | C1 | F | U8 | |
| U10 | `So severe was the delay that…` | inversion after fronted `so`/`such` | Same family | C2 | F | U8, V3 | |
| U11 | `Along the canal stood…` | inversion after a fronted place adverbial with an intransitive verb | Descriptive writing; **subject–verb** inversion, not subject–auxiliary | C1 | F | D13 | † |
| U12 | `I did check` | emphatic `do` | Only in affirmative present/past simple with no other auxiliary — the E in H11 | B2 | F+C | H11 | † |
| U13 | `The council itself` | reflexive emphasis | Cheap, safe emphasis | B2 | F | G5 | |
| U14 | `the very`, `at all`, `whatsoever`, `by far` | lexical emphasisers | Small, high-frequency | B2 | F | S18 | |
| U15 | `There is / There are` | existential `there` — the full paradigm across tenses and with modals | *There has been*, *There must have been*, *There seem to be* | A2 | F+C | G12, J17 | † |
| U16 | `It is…` with no real subject | dummy `it`: weather, time, distance, and evaluation | *It is essential that…* | A2 | F | G11 | † |
| U17 | `It is clear that…` | `it`-extraposition (pointer to P16) | The most useful single pattern in academic writing | B2 | F | P16 | † |
| U18 | `there` or `it`? | choosing between existential `there` and dummy `it` | **Learners swap them constantly.** `there` introduces existence; `it` anticipates a clause | B1 | C | U15, U16 | † |
| U19 | The passive as an ordering tool | voice and information structure (pointer to L4) | Closes the loop with Chapter 21 | C1 | C | L4, U1 | |
| U20 | What the sentence is "about" | theme / topic selection | Why two grammatical sentences can be differently good in the same paragraph | C1 | C | U1, W10 | † |

### 3.V Degree and result structures

Chapter 38. Small group, very high frequency, and always scattered across four chapters elsewhere.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| V1 | `so` + describing word | `so` + adjective/adverb | *so expensive* | A2 | F | S1 | |
| V2 | `such` + a noun | `such` + (a/an) + adjective + noun | *such a sharp increase* — the article moves inside | B1 | F | V1, F18 | † |
| V3 | `so … that`, `such … that` | degree + result | *so expensive that the scheme stalled* | B1 | F+C | V1, V2, P22 | † |
| V4 | `too` + describing word + `to do` | excessive degree | *too expensive (for the council) to justify* | A2 | F | O1 | |
| V5 | `enough` after the describing word | sufficiency with adjectives/adverbs | *cheap enough*, never *\*enough cheap* | A2 | F | V4 | † |
| V6 | `enough` before the noun | sufficiency with nouns | *enough funding* | A2 | F | V5 | |
| V7 | `So do I`, `Neither do they` | additive agreement with inversion | Speaking naturalness; reuses H11 | B1 | F | H11, N9 | † |
| V8 | `too` vs `very` | excess vs high degree | *\*It's too good* when you mean *very good* | A2 | C | V4 | † |
| V9 | `quite`, `rather`, `fairly`, `pretty` | mid-degree adverbs | **[VARIES]** `quite` means "fairly" or "completely" depending on the adjective and the variety. §5 | B2 | C | S18 | † |
| V10 | `hardly`, `barely`, `scarcely` | near-negative degree | Grammatically negative — see N5 | B2 | F+C | N5 | † |

### 3.W Cohesion and discourse

Chapter 39. **Over-taught badly (memorise 50 linkers) and under-taught well.**

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| W1 | Pointing back to something already said | reference: anaphora (and cataphora) | The main thing that makes a text a text rather than a list | B1 | C | G1, G15 | † |
| W2 | `this`, `that`, `these`, `those` pointing at ideas | demonstrative text reference, and the `this + summary noun` move (`this approach`, `these findings`) | **The highest-value cohesion device there is**, and it is almost never taught | C1 | C | G7, W1 | † |
| W3 | Saying it again with a short word | substitution (`one`, `do so`, `so`, `such`) | *The council did so in March* | B2 | F+C | G16, H11 | † |
| W4 | Leaving words out | ellipsis (nominal, verbal, clausal) | The C in H11; and half of natural speech | B2 | F+C | H11, M9 | † |
| W5 | Joining words between sentences | linking adverbials by function: addition, contrast, cause, result, exemplification, sequence, concession, clarification, summary | Organised by **function**, never as an alphabetical list | B1 | F+C | S16 | † |
| W6 | Not linking everything | linker restraint | **Mechanical over-signposting is a band-limiting habit.** This entry exists to undo damage the reader has already taken | C1 | C | W5 | † |
| W7 | Where the linker goes, and its commas | position and punctuation of linking adverbials | Front, mid and end positions all exist; the comma is not optional at the front | B2 | F | W5, X3 | † |
| W8 | `although` vs `however` | subordinator vs conjunct — **they are not interchangeable** | *\*However the cost was high, the scheme went ahead* is ungrammatical, and this is one of the most common errors in learner writing | B2 | F+C | W5, P23 | † |
| W9 | Repeating the idea with a different word | lexical cohesion (repetition, synonymy, superordinates) | The alternative to over-linking | B2 | C | W1 | † |
| W10 | The grammar of a first sentence | topic-sentence grammar | Paragraph structure is a grammar problem, not just a planning one | C1 | C | U20 | † |
| W11 | Keeping tense and reference steady | text-level consistency (tense, number, reference) | Paragraph-level accuracy; the errors are invisible sentence by sentence | B2 | C | I34, W1 | † |
| W12 | Signposting out loud vs on paper | discourse organisation in speech vs writing | *What I mean is…* belongs in speech; *In conclusion* belongs on paper | B2 | C | W5, Y1 | † |
| W13 | `well`, `actually`, `I mean`, `you know` | spoken discourse markers | Fluency markers; **wrong in Task 2, right in Speaking** | B2 | C | B9, Y1 | † |
| W14 | Two sentences or one? | sentence boundaries as a cohesion decision | Where the comma splice (X4) meets the given-new principle | B2 | C | X4, U1 | † |

### 3.X Punctuation, spelling and written conventions

Chapters 40–41. Cheap marks, routinely dropped, and completely absent from most grammar references.

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| X1 | Capital letters | capitalisation (sentence-initial, proper nouns, `I`, languages, nationalities, days, months, titles; **not** seasons or general subjects) | Highly visible, entirely mechanical | A1 | F | E1 | |
| X2 | Full stops | the sentence boundary | Requires A11 and A13 | A1 | F | A11 | |
| X3 | Commas | comma uses: lists; after a fronted adverbial or clause; around non-defining material; before a coordinating conjunction joining two clauses; with linking adverbials | The most-used and most-misused mark | A2 | F+C | X2, P30 | † |
| X4 | Joining two sentences with a comma | the comma splice | **The most damaging sentence-boundary error in learner writing** | B1 | F | X3, D15 | † |
| X5 | Semicolons | the semicolon: joining two independent clauses; separating complex list items | The clean fix for X4 | B2 | F+C | X4 | † |
| X6 | Colons | the colon: introducing a list, an explanation, or an example | Under-used by learners; safe and useful | B2 | F | X5 | |
| X7 | Dashes and brackets | parenthetical punctuation | Register: dashes informal-leaning, brackets neutral | B2 | C | X3 | |
| X8 | Apostrophes | possessive `'s`, plural possessive `s'`, and contraction apostrophes | Two unrelated jobs sharing one mark | A2 | F | E10, H12 | † |
| X9 | `its` vs `it's` | the highest-frequency apostrophe error in English | Worth its own entry | A2 | F | X8, F9 | † |
| X10 | Quotation marks | direct-speech punctuation | **[VARIES]** BrE single vs AmE double; and punctuation inside vs outside the closing mark. §5 | B1 | F | R1 | † |
| X11 | Hyphens | compound modifiers, prefixes, number compounds | *a well-known scheme* before the noun, *the scheme is well known* after | B2 | F+C | S6 | † |
| X12 | Question and exclamation marks | terminal punctuation | Exclamation marks are wrong in academic writing — say it | A1 | F | X2 | |
| X13 | Lists | list punctuation and parallelism | **[VARIES]** the serial (Oxford) comma. §5 | B2 | F | X3, P29 | |
| X14 | Numbers in writing | numerals vs words; percentages; units | Task 1 convention: spell out one to ten, use figures for data | B1 | F | F16 | † |
| X15 | Dates and times | date conventions | **[VARIES]** `31 July 2026` (BrE) vs `July 31, 2026` (AmE). §5 | A2 | F | X14 | |
| X16 | Short forms | abbreviations, acronyms, `e.g.`/`i.e.`/`etc.` | `e.g.` ≠ `i.e.`; and both are usually better spelled out in an essay | B2 | F+C | X14 | † |
| X17 | `-ise` or `-ize`? | spelling variation | **[VARIES]** both correct in BrE; `-ize` in AmE; a separate `-yse`/`-yze` split. §5 | B2 | C | H6 | † |
| X18 | Words people mix up | commonly confused spellings (`their/there/they're`, `affect/effect`, `practice/practise` (BrE), `then/than`, `lose/loose`, `principal/principle`) | Highly visible, entirely learnable | B1 | F | X9 | † |
| X19 | BrE vs AmE spelling | `-our/-or`, `-re/-er`, `-ll-/-l-`, `-ogue/-og` | **[VARIES]** Pick one and be consistent. §5 | B2 | C | X17 | † |
| X20 | Paragraphs | paragraphing conventions | A grammar reference should not pretend paragraphs are someone else's problem | B1 | F | W10 | |

### 3.Y Register, style and accuracy under pressure

Chapters 42–44. Where band 7 becomes band 8, and the group most likely to be cut for being "not
grammar". It is grammar. **[JUDGEMENT]**

| ID | Plain-English name | Technical name | Why it matters | CEFR | F/C | Deps | † |
|---|---|---|---|---|---|---|---|
| Y1 | Spoken grammar is different grammar, not worse grammar | spoken vs written grammar | **The purest form of "when to use which, and where."** Contractions, ellipsis, tags, `get`-passives, fronting, phrasal verbs, `going to` — right in one place, wrong in the other | B2 | C | H12, W4 | † |
| Y2 | Short forms in writing | contractions and register | Fine in Speaking and informal writing; avoided in Task 2 | B1 | C | H12, Y1 | |
| Y3 | Leaving words out when speaking | spoken ellipsis (*Been there yet?*) | Natural speech; wrong on paper | B2 | F+C | W4, Y1 | † |
| Y4 | `The thing is, …` / `…, that scheme` | headers and tails | Spoken structures with no written equivalent | C1 | F | Y1, U3 | † |
| Y5 | `sort of`, `a bit`, `and that kind of thing` | vague language | Natural in Speaking; **not** a weakness there. It is a weakness in writing | B2 | C | Y1 | † |
| Y6 | How formal is this? | the formality cline as a grammatical property | Nominalisation, passives, complex prepositions and `-ing` clauses all move a text up it | C1 | C | Y1, E15 | † |
| Y7 | Not claiming more than you can defend | hedging (modals, `tend to`, `appear`, `it is likely that`, cautious quantifiers) | Overclaiming is a band-limiting habit; hedging is the repair | C1 | C | K18, S31 | † |
| Y8 | Saying it more strongly on purpose | boosting (`clearly`, `undoubtedly`, `it is evident that`) | The other end of the same scale; overuse reads as shouting | C1 | C | Y7 | † |
| Y9 | Writing without `I` | impersonal structures (`it`-extraposition, passives, `there is`, abstract subjects) | The mechanical toolkit for academic distance | C1 | F+C | P16, L4 | † |
| Y10 | `all`, `never`, `every` | overgeneralisation as a grammar choice | Quantifier choice is an argument choice | B2 | C | F13, Y7 | † |
| Y11 | Thing-style vs action-style | nominal vs verbal style | Explains **why** nominalisation raises formality — and when it makes writing worse | C1 | C | E15, Y6 | † |
| Y12 | Can I write "I"? | first person in academic writing | **[VARIES]** by field and by task. §5 | C1 | C | Y9 | † |
| Y13 | `carry out` or `conduct`? | multi-word verb vs single-word Latinate verb | The clearest single register lever a writer has | C1 | C | T14, Y6 | † |
| Y14 | Being polite by being indirect | politeness and distancing grammar (past forms, modals, questions instead of statements) | Speaking Parts 1 and 3 | B2 | C | Q19, K10 | † |
| Y15 | The last three minutes | error-triage checklist: agreement → articles → sentence boundaries → tense consistency | **Accuracy under time pressure is a procedure, not a knowledge state** | B2 | F | J1, F4, X4, I34 | † |
| Y16 | When not to use the clever structure | complexity risk: inversion, mixed conditionals, clefts, `whom` | A structure with a high error surface that half-works costs more than the simple one that works | C1 | C | U8, Q6, Q8 | † |
| Y17 | How many things must be right | error surface as a concept the reader can use | Lets a reader budget their own risk. Ours: `whereas` = 1; negative inversion = 4 | C1 | C | Y16 | † |

### 3.Z Reference tables and appendices

Not chapters. **The part of a reference that actually gets used.**

| ID | Appendix | What is in it | Feeds |
|---|---|---|---|
| Z1 | A — Irregular verbs | Base / past / past participle for the high-frequency set, grouped by pattern rather than alphabetically, with the `-en`, vowel-change and no-change groups named | H3 |
| Z2 | B — Verb patterns | Every verb in the reference, with the pattern(s) it takes: `+ -ing`, `+ to-inf`, `+ obj + to-inf`, `+ obj + bare inf`, `+ that`, `+ prep + -ing`, and the meaning-change set | O25, R9 |
| Z3 | C — Dependent prepositions | Verb + prep, adjective + prep, noun + prep, grouped by preposition **and** by base word so it can be searched either way | T6, T7, T8 |
| Z4 | D — Linking words by function | Nine functions, each with the subordinator, the conjunct and the preposition version side by side — because W8's error comes from not seeing them as three different word classes | W5, W8 |
| Z5 | E — Glossary | **Every technical term used anywhere in the reference**, defined in plain words, with the plain-English name and the chapter where it is introduced. A lint must verify completeness | all |
| Z6 | F — British and American English | One table: spelling, vocabulary, tense preference, collective agreement, `have got`, `gotten`, dates, quotation marks, `in hospital`, prepositions of time | §5 |
| Z7 | G — The tense grid on one page | 12 cells × (form, meaning, one example), plus the eight future forms | I2 |
| Z8 | H — Spelling rules for endings | Consonant doubling, `y`→`i`, silent `e`, `-ie`→`-y`, plural `-es`, and the `-s`/`-ed` pronunciation table | H6, H7 |
| Z9 | I — Contractions | Every contraction, what it expands to, and the **ambiguous** ones (`'d` = `had`/`would`; `'s` = `is`/`has`) | H12 |
| Z10 | J — Modals at a glance | Nine core modals × (certainty use, obligation use, past form, negative meaning) | K19 |
| Z11 | K — Where usage genuinely varies | §5 of this document, shipped as a reader-facing appendix | §5 |
| Z12 | L — Punctuation quick table | Each mark, its jobs, one example each, and the one error it is associated with | Ch 40 |

---

## 4. The areas references routinely under-explain

Everything marked † above. Here are the thirty that cost the most, with the specific failure and the
specific repair. **These are the sections an authoring agent should spend disproportionate effort on.**

| # | Area | What references typically do | What actually goes wrong | The repair |
|---|---|---|---|---|
| 1 | A9/A10 **clause vs phrase** | Assume the terms | Every later explanation is unintelligible; the reader nods and retains nothing | A physical test in Chapter 2, applied to twenty specimens |
| 2 | H11 **the auxiliary system** | Teach questions, negatives, tags, short answers and emphatic `do` as five unrelated rules | The reader memorises five things that are one thing, and generalises none of them | One chapter, four properties (negation, inversion, ellipsis, emphasis), then five short applications |
| 3 | I2 **"the twelve tenses"** | Present the grid as fact | The reader believes English has twelve tense inflections and cannot understand why `will` behaves like a modal | State the two-tense fact, then present the grid explicitly as a **teaching convention** |
| 4 | I3 **the perfect as one idea** | Four separate chapters | A learner who "knows the third conditional" cannot produce `I wish I had…` | One section on the perfect idea, then the four cells as applications |
| 5 | I8/I29 **present perfect** | Teach it via signal words (`already`, `yet`, `just`, `since`, `ever`) | Produces *\*I've been to Rome last year*. **The keyword rule is the false rule** | Teach the deciding question — *is the period finished?* — and name the keyword rule as the trap |
| 6 | I12/I31 **past perfect** | "The past before the past" | Massive over-use: every second past verb becomes `had` + participle | Add the second condition: **only when the order is not already obvious** |
| 7 | I25 **no `will` after `when`** | One line in the future chapter | *\*When I will finish…* survives to C1 | Its own section, with the exception (embedded questions: *I don't know when it will open*) |
| 8 | H15 **stative verbs** | A memorisable list | Reader believes `have`, `think`, `see` can never be continuous, then meets *I'm having trouble* | Teach it as a **use**, not a word list: the same verb is stative in one sense and dynamic in another |
| 9 | K3 **past deduction** | A footnote to the modal chapter | Learners avoid it entirely and lose the whole meaning | A full section with a paradigm: `must have` / `can't have` / `might have` / `should have` |
| 10 | K6 **`mustn't` vs `don't have to`** | Listed adjacently without warning | A meaning reversal produced with total confidence | A minimal pair where the only difference is the negation, with both meanings spelled out |
| 11 | L1/L4 **the passive as a choice** | Formation drills, then "the passive is more formal" | Reader sprays passives across their essay and breaks their own cohesion | Teach it as an **information-ordering** device first; formation second; and give the five conditions |
| 12 | L13 **verbs that cannot passivise** | Silence | *\*The event was happened* | Name the class and give the closed high-frequency list |
| 13 | M4 **subject questions** | Buried in a table | *\*Who did write the report?* | Its own section, with the contrast against object questions |
| 14 | M11/M12 **indirect questions** | Taught as politeness | *\*Could you tell me where is the office?* is one of the most persistent errors in the language | Teach the **word order** rule as the point, and link it forward to reported questions (R6) |
| 15 | M7/M17 **tag questions** | The formation rule only | Reader forms them correctly and uses them wrongly, because the **intonation** carries the meaning | Rising = a real question; falling = seeking agreement. Both, with audio |
| 16 | N7 **transferred negation** | Silence | *\*I think it will not work* where a native says *I don't think it will work* | One section; very high frequency |
| 17 | O6/O7 **gerund vs infinitive** | Invented explanations for why `enjoy` takes `-ing` | Reader hunts for a rule that does not exist and stops trusting the book | Say plainly: **one real rule** (O13), **one closed meaning-change set** (O12), and **a list** (Z2) |
| 18 | O21 **participle clauses** | C1 afterthought | The single biggest untapped source of academic density; and the dangling-modifier error is never explained | Full section, with the **shared-subject requirement** stated as the safety rule |
| 19 | P5/P6 **relative clause commas** | A punctuation rule to memorise | Reader punctuates by feel and changes the meaning of their own sentence | **Teach the meaning; derive the comma.** The comma is a consequence |
| 20 | P11 **reduced relatives** | Omitted | Reader writes six short relative clauses where one reduced phrase would do | Full section, both directions (expand and reduce) |
| 21 | P10 **sentential `which`** | Omitted | A very natural C1 move the reader never acquires | One section |
| 22 | Q1 **the unreal past** | Never named | Second conditional, third conditional, `wish`, `it's time`, `would rather` and polite distancing are learned as six unrelated facts | Name the device once; the six become one idea with six wrappers |
| 23 | Q9 **`unless`** | "`unless` = `if not`" | Produces *\*I'd be surprised unless she won* | Give the equivalence **and its boundary**, with a worked non-equivalent pair |
| 24 | R3 **backshift** | Presented as obligatory | Reader backshifts still-true statements and misreports facts | Rule + four named exceptions, with the *why* (the reporter's own commitment to the truth of the claim) |
| 25 | S12 **adverb position** | "Adverbs go before the main verb" | Wrong placement is highly visible and never corrected | The three positions, the mid-position rule stated precisely, and the kinds that can't move |
| 26 | S14 **focus adverbs** | Treated as free | *only* in the wrong place changes the meaning of the sentence silently | One section, with three positions of `only` in the same sentence and three glosses |
| 27 | E15/E16 **nominalisation and noun-phrase expansion** | Absent from grammar syllabi (it sits between grammar and vocabulary) | The band-6 ceiling: clause complexity rises, noun-phrase complexity does not | Full chapter section, mechanical, both directions, **with an over-nominalisation warning** |
| 28 | U1 **given–new** | Absent | The passive, clefts, fronting and `there is` all look arbitrary without it | Teach it **before** the structures that implement it |
| 29 | W2 **`this` + summary noun** | Absent | Learners repeat whole phrases or write vague `this` with no noun | One section; the highest cohesion payoff per minute in the reference |
| 30 | W8 **`although` vs `however`** | Both listed under "contrast linkers" | Produces an ungrammatical sentence that the reader believes is a stylish one | Teach the **word class** difference: subordinator vs conjunct vs preposition, three columns, one table (Z4) |

Five more that nearly made the list and should still get careful treatment: **D8** linking verbs take
adjectives; **F12** `few`/`a few` reversal; **J11** agreement across intervening material; **T13**
the phrasal-verb pronoun rule; **Y1** spoken grammar as legitimate grammar.

---

## 5. Where usage genuinely varies — the complete list

Rule 5 of the brief. **Every one of these is stated in the article as a variation, with both options,
never resolved silently.** The "house choice" column is what our own example sentences use, and the
article must label it as a house choice, not as the rule.

### 5.1 British / American

| # | Area | British | American | House choice |
|---|---|---|---|---|
| 1 | I29 present perfect vs past simple | `Have you finished yet?` | `Did you finish yet?` is normal | British |
| 2 | J3 collective nouns | `the committee **have** decided` is available | `the committee **has** decided` strongly preferred | British, with the American pattern shown |
| 3 | H3 `get` | past participle `got` | `gotten` (distinct from `got`) | British |
| 4 | K15 `have got` | `I've got a meeting` common in speech | less common; `I have` | British |
| 5 | F7 institutions | `in hospital`, `at university`, `to school` | `in the hospital`, `at the university` | British |
| 6 | I23 `shall` | alive in offers and formal/legal writing | rare outside legal register | British; `shall` restricted to offers/suggestions in our examples |
| 7 | X10 quotation marks | single marks common; punctuation placed logically | double marks; commas and full stops inside | British |
| 8 | X13 serial comma | optional; often omitted | commonly used | Omitted, except where needed for clarity |
| 9 | X15 dates | `31 July 2026` | `July 31, 2026` | British |
| 10 | X17 `-ise`/`-ize` | **both correct**; `-ize` is the Oxford house style | `-ize` | `-ise`, stated as a house choice |
| 11 | X17 `-yse`/`-yze` | `analyse`, `paralyse` | `analyze`, `paralyze` | British |
| 12 | X19 other spelling | `-our`, `-re`, `travelled`, `catalogue` | `-or`, `-er`, `traveled`, `catalog` | British |
| 13 | S22 `farther`/`further` | `further` for both distance and "additional" | `farther` for physical distance is commoner | `further` |
| 14 | T1 time prepositions | `at the weekend` | `on the weekend` | British |
| 15 | P17 mandative subjunctive | `recommend that it **should be** reviewed` is usual | `recommend that it **be** reviewed` is usual | Show both; prefer the `should` form in our examples and note the bare form is fully correct |
| 16 | S30 `different from/to/than` | `from` and `to` both used | `from` and `than` both used | `from` |
| 17 | O9 `have someone do` | `get someone to do` commoner | `have someone do` commoner | Show both |

**The reference must say once, in Chapter 1, that both varieties are correct, that our examples use
British conventions, and that consistency within a piece of writing is what matters** — not which
variety is chosen.

### 5.2 Formal / informal, written / spoken

| # | Area | Informal / spoken | Formal / written | Note |
|---|---|---|---|---|
| 18 | H12 contractions | `it's`, `they've`, `won't` | full forms | Contractions are correct English; they are simply marked informal |
| 19 | P7/T10 preposition placement | `the scheme **which** they objected **to**` | `the scheme **to which** they objected` | Both correct |
| 20 | M5 `who`/`whom` | `Who did you ask?` | `Whom did you ask?` | `whom` is receding; obligatory only after a preposition in formal writing |
| 21 | L6 `get`-passive | `the bid got rejected` | `the bid was rejected` | Never in Task 2 |
| 22 | O20 possessive + gerund | `him leaving early` | `his leaving early` | Both standard; the possessive is the formal one |
| 23 | S29 `than I` / `than me` | `taller than me` | `taller than I am` | Rewriting with a verb dodges the issue entirely |
| 24 | S29 `like` / `as` | `like I said` | `as I said` | `as` before a clause is the formal choice |
| 25 | Q18 `if I was` / `if I were` | `if I was you` occurs | `if I were you` | `were` in all hypothetical writing |
| 26 | J17 `there's` + plural | `there's two options` common in speech | `there are two options` | Written form only in our examples |
| 27 | Y13 phrasal vs Latinate | `carry out`, `set up` | `conduct`, `establish` | **But many multi-word verbs are register-neutral** — do not over-apply |
| 28 | W13 discourse markers | `well`, `I mean`, `actually` | `moreover`, `nevertheless` | Right in Speaking, wrong in Task 2, and vice versa |
| 29 | Y3 spoken ellipsis | `Been there yet?` | `Have you been there yet?` | Natural speech, not sloppy speech |
| 30 | V9 `quite` | can mean "fairly" or "completely" | ambiguous; avoid in precise writing | With a gradable adjective, "fairly"; with a non-gradable one, "completely" |

### 5.3 Prescriptive tradition / observed usage

**These are the ones where a reader will be told they are wrong by someone who is themselves wrong.
Give the reader the fact and the politics.**

| # | Area | The traditional rule | What educated usage actually does | What we tell the reader |
|---|---|---|---|---|
| 31 | O23 split infinitive | "Never put a word between `to` and the verb" | Splitting is normal and often clearer | Not an error. Avoid only if the reader is writing for a known prescriptivist |
| 32 | T10 terminal preposition | "Never end a sentence with a preposition" | Stranding is standard and often the only natural option | Not an error. Fronting is a formality choice |
| 33 | G14 singular `they` | "`they` cannot be singular" | Long-established for indefinite reference; now standard | Use it. Note that some readers object |
| 34 | S24 `less`/`fewer` | "`fewer` with countables, `less` with uncountables" | `less` with countables is very common in speech | Use `fewer` in writing. The distinction is a style expectation, not a grammatical necessity |
| 35 | J8 `none` | "`none` is singular" | Plural agreement is standard and older than the rule | Either is correct; be consistent |
| 36 | P7 `that`/`which` | "`that` for defining, `which` for non-defining" | A style convention enforced in much American editing; British usage allows `which` in defining clauses | **The comma is the real signal.** The `that`/`which` split is a house-style preference |
| 37 | P1 starting with `and`/`but` | "Never begin a sentence with a conjunction" | Common in good prose | Not an error; but sparing use in an exam essay is wiser |
| 38 | N11 double negation | "Two negatives make a positive" | Standard dialects use one negative per clause; many non-standard varieties use negative concord systematically | One negative per clause in exam writing. **Not** a sign of poor thinking in the varieties that use it |
| 39 | J15 `data` | "`data` is plural" | Singular mass use is now normal in general writing; plural persists in strict scientific style | Either; be consistent |
| 40 | Y12 first person in essays | "Never write `I`" | Varies by discipline and task; a personal-opinion prompt invites it | Use it where the task asks for your view; prefer impersonal structures for claims about the world |
| 41 | S3 adjective order | Presented as a fixed sequence | A strong tendency; the middle slots vary between references and speakers | Give the order as a default that sounds right, not as a law |
| 42 | S19 two-syllable comparatives | "Two syllables take `more`" | Many take either (`commoner`/`more common`) | Give the safe default and note the flexibility |

**42 variation points.** Appendix K (Z11) is this section, shipped to the reader.

---

## 6. Dependencies: what must be understood before what

### 6.1 The five root concepts

Nothing in the reference can be explained without these, and none of them can be explained using the
others. They go in Chapters 1–2 and nowhere else.

| Root | Area | Everything downstream that needs it |
|---|---|---|
| **The clause** | A9 | Every chapter from 5 onwards |
| **Subject and verb** | A2, A3 | Agreement, questions, passives, all clause combining |
| **Finite vs non-finite** | A13, A14 | Fragments, non-finite clauses, reduced relatives, participle clauses |
| **The auxiliary** | B10/H11 | Questions, negatives, tags, short answers, emphasis, ellipsis, inversion |
| **Countability** | E2 | Articles, quantifiers, agreement, `less`/`fewer` |

These are the theory analogue of the practice module's five convergence nodes (`gr_aux_system`,
`gr_past_participle`, `gr_clause_types`, `gr_unreal_past`, `gr_countability`). Four of the five match;
the theory set replaces `gr_past_participle` with the finite/non-finite distinction, because a
reference needs the *category* more than it needs the *form*.

### 6.2 The long dependency chains

The longest chains decide the chapter order. Each of these must run forwards, never backwards.

| Chain | Length |
|---|---|
| clause (A9) → subordinate clause (A12) → relative clause (P4) → reduced relative (P11) → postmodification (E13) → noun-phrase expansion (E16) → nominal style (Y11) | 7 |
| subject/verb (A2/A3) → auxiliary (H11) → inversion (D13) → negative adverbials (N5) → negative inversion (U8) → complexity risk (Y16) | 6 |
| countability (E2) → articles (F1–F3) → generic reference (E17) → article procedure (F4) → error triage (Y15) | 5 |
| past simple (I10) → unreal past (Q1) → second conditional (Q4) → third conditional (Q5) → mixed (Q6) → inverted (Q8) | 6 |
| perfect concept (I3) → present perfect (I8) → pp vs past simple (I29) → past perfect (I12) → backshift (R2) → backshift exceptions (R3) | 6 |
| `-ing` form (H5) → gerund (O3) → gerund after preposition (O13) → `despite`/`in spite of` (P23) → participle clause (O21) → academic density (E16) | 6 |
| given–new (U1) → passive choice (L4) → cleft (U4) → fronting (U3) → theme selection (U20) → cohesion (W10) | 6 |

### 6.3 The seven forward references we accept

A reference book cannot be perfectly topologically ordered — some areas are mutually dependent. These
seven are resolved with a **one-sentence early sighting** in the earlier chapter and a full treatment
later. Each early sighting must be marked in the UI as a forward link.

| Early sighting, in | Full treatment, in | Why it cannot wait |
|---|---|---|
| `there is / there are` — Ch 8 (nouns) | Ch 36 (U15) | A beginner needs it in week one; the information-structure explanation needs Ch 36 |
| `It is important to…` — Ch 11 (pronouns, G11) | Ch 36 (U16/U17) | Highest-frequency academic opener; must not wait 25 chapters |
| Question formation — Ch 13 (H11) | Ch 22 | The auxiliary chapter must show what auxiliaries are *for* |
| Comparatives — Ch 31 (adjectives) | Ch 33 | Day-one need; the advanced comparison work belongs together in Ch 33 |
| Prepositions of time and place — Ch 5 (adverbials) | Ch 34 | A sentence with an adverbial cannot be exemplified without them |
| `if`-clauses — Ch 27 (P24) | Ch 29 | Adverbial-clause map would have a hole otherwise |
| The passive — Ch 13 (H14, auxiliary order) | Ch 21 | The auxiliary-ordering table has a passive slot in it |

### 6.4 What the theory map has that the practice syllabus does not

The practice syllabus has 154 points; this map has 337 areas. The difference is not padding. It is
these categories:

| Category | Why practice can skip it, and a reference cannot | Examples |
|---|---|---|
| **Metalanguage** | A drill never has to define "clause"; a reference must | A1–A14, B1–B15, C1–C7 |
| **Completeness of paradigm** | A drill teaches one cell; a reference shows all twelve | I6–I17, K19, Z7, Z9, Z10 |
| **Structures worth recognising but not producing** | A drill on a receptive-only structure wastes a slot | O22 absolutes, U6 reversed clefts, I17 future perfect continuous, K21 marginal modals, `whom` |
| **Written conventions** | Not practisable as a grammar card | X1–X20 |
| **Variation and politics** | A drill needs one right answer | §5, all 42 points |
| **Organising concepts** | Not drillable, but they make everything else compressible | I2, I3, I4, U1, U2, H11, Q1, Y17 |
| **Lists that are lists** | The SRS owns the items; the reference owns the map | Z1, Z2, Z3, Z4 |

Conversely, everything in the practice syllabus's 154 points appears somewhere in this map. §9 is the
cross-reference that proves it.

---

## 7. The proposed chapter order

### 7.1 The ordering principle

**Build the sentence, then fill it, then join sentences, then arrange information, then polish the
surface.** Concretely:

1. **Chapters 1–7 — the skeleton.** No content areas at all: what a sentence is, what the pieces are
   called, how they are ordered, how clauses join. A reader who stops here can still read every other
   chapter.
2. **Chapters 8–12 — the noun side.** Placed before the verb side because articles and countability
   are the highest-frequency error surface and because the verb chapters need noun phrases to put in
   their examples.
3. **Chapters 13–21 — the verb side.** The auxiliary system first (it is the mechanism), then time,
   then agreement, then modality, then voice.
4. **Chapters 22–24 — what sentences do.** Questions, negatives, commands. All three are applications
   of Chapter 13, which is why they come after it and not in Part 1.
5. **Chapters 25–30 — bigger sentences.** Relative, noun, adverbial, non-finite, conditional,
   reported. This is the complexity block.
6. **Chapters 31–35 — modification.** Adjectives, adverbs, comparison, prepositions, multi-word verbs.
7. **Chapters 36–39 — arranging information.** The band-8 block, and it must come after the passive
   (Ch 21) and after clause combining, because it is about choosing between them.
8. **Chapters 40–44 — the surface and the register.** Punctuation, conventions, spoken vs written,
   academic register, accuracy under pressure.
9. **Appendices A–L.**

**The deliberate departure from convention:** most references open with the tense system. Ours opens
with the clause, and the tense system does not begin until Chapter 14. This is forced by §0.3 — you
cannot explain the present perfect to someone who does not have the words "subject", "verb" or
"auxiliary", and every reference that opens with tense either assumes those words or defines them in
passing, badly. **[JUDGEMENT]**

### 7.2 The 44 chapters, with every area assigned

| Part | Ch | Chapter title (learner-facing) | Technical scope | Areas | CEFR spread |
|---|---|---|---|---|---|
| **0** | 1 | How to use this book, and the words we need first | orientation; metalanguage policy; BrE/AmE statement | — (uses Z5, Z6) | — |
| **1** | 2 | What a sentence is | sentence, clause, phrase, subject, verb, object, complement, adverbial, finite/non-finite | A1–A14 | A1–B1 |
| | 3 | The kinds of word | the nine word classes, auxiliaries and modals as classes, word formation | B1–B15 | A1–B2 |
| | 4 | Words that travel together | the five phrase types, head and modifier, pre/postmodification | C1–C7 | A2–B2 |
| | 5 | The shapes a clause can take | the seven clause patterns, transitivity, linking verbs, the dative alternation | D1–D9 | A1–B2 |
| | 6 | The order words go in | canonical order, adverbial ordering, verb–object adjacency, inversion overview | D10–D13 | A1–B1 |
| | 7 | Joining clauses: the four sentence shapes | simple/compound/complex/compound-complex, sentence functions, fragments and run-ons | D14–D18 | A1–B2 |
| **2** | 8 | Nouns: counting them, and not counting them | common/proper, countability, plurals, irregulars, uncountables, partitives, collectives, compounds, plural-only nouns | E1–E9, E18 | A1–B2 |
| | 9 | `a`, `an`, `the`, and nothing at all | the three articles, the decision procedure, unique reference, anaphoric/cataphoric `the`, institutions | F1–F7, E17 | A1–B2 |
| | 10 | How many, how much, which one | demonstratives, possessives, quantifiers, `few`/`a few`, distributives, `of`-patterns, determiner order, numbers, proportions | F8–F18 | A1–B2 |
| | 11 | Words that stand in for nouns | all pronoun types, dummy `it` and existential `there` (first sighting), generic and singular `they`, reference clarity | G1–G16 | A1–C1 |
| | 12 | Building a bigger noun group | possession, pre/postmodification, apposition, nominalisation, noun-phrase expansion | E10–E16 | A2–C1 |
| **3** | 13 | Verbs, their five shapes, and the helper system | the five forms, spelling, pronunciation of endings, `be`/`have`/`do`, **the auxiliary system**, contractions, auxiliary order, stative use, transitivity, ergatives | H1–H18 | A1–C1 |
| | 14 | Talking about now | present simple, present continuous, and choosing between them | I6, I7, I27 | A1–A2 |
| | 15 | Talking about the past | past simple, past continuous, past perfect, past perfect continuous, `used to`/`would`, narrative sequencing | I10–I13, I28, I31, I32, I33, I34, I36 | A1–B2 |
| | 16 | The perfect: linking two times | the perfect idea, present perfect, present perfect continuous, and the two big choices | I3, I8, I9, I29, I30 | A2–B1 |
| | 17 | Talking about the future | all eight future forms, the deciding table, no-`will` clauses, future in the past | I14–I26 | A1–B2 |
| | 18 | The whole system on one page | tense vs time, the two-tense fact, the 12-cell grid, aspect as one idea, tense across a text, tense in academic writing | I1, I2, I4, I5, I35 + Z7 | B1–C1 |
| | 19 | Making the verb match the subject | all eighteen agreement areas | J1–J18 | A1–C1 |
| | 20 | Certainty, obligation, and the past | modal grammar, both scales, modal perfects, semi-modals, hedging, the summary table | K1–K21 | A2–C1 |
| | 21 | Active and passive | concept, formation across the grid, agent, **the five conditions**, misuse, `get`-passive, impersonal passive, causatives, prepositional and double-object passives, non-finite passives, non-passivisable verbs, ergatives | L1–L16 | A2–C1 |
| **4** | 22 | Asking questions | yes/no, `wh`, subject vs object, prepositions, alternatives, tags, negative questions, short answers, indirect and embedded, `wh` + infinitive, intonation | M1–M17 | A1–B2 |
| | 23 | Saying no | verb negation, `do`-support, `no`/`not`, negative words, semi-negatives, `any`, transferred negation, scope, `neither`/`nor`, prefixes, double negation, answering negative questions, negating non-finites | N1–N14 | A1–C1 |
| | 24 | Telling, asking and exclaiming | imperatives, `let's`, exclamatives, sentence function vs sentence form | D18 (expanded), B9 | A1–B1 |
| **5** | 25 | Adding information about a noun | defining, non-defining, omission, prepositions, `whose`, quantifier relatives, sentential `which`, reduced relatives | P4–P11 | B1–C1 |
| | 26 | Whole clauses used as things | `that`-clauses, `wh`-clauses, `whether`/`if`, nominal relatives, extraposition, mandative subjunctive | P12–P17 | B1–C1 |
| | 27 | When, why, although, so that | all eleven adverbial-clause meanings, clause position, parallel structure, sentence-length control | P1–P3, P18–P31 | A2–C1 |
| | 28 | Verbs after verbs | infinitives, gerunds, participles, all the verb patterns, meaning-change verbs, purpose infinitives, participle clauses, the split-infinitive note | O1–O25 | A2–C2 |
| | 29 | If, and things that are not true | the unreal past, all conditional types, mixed, inversion, `unless`, the alternatives, `wish`/`if only`, `would rather`, `had better`, `it's time`, `as if`, politeness distancing | Q1–Q21 | A2–C1 |
| | 30 | Saying what other people said | concept, backshift and its exceptions, deictic shifts, statements/questions/commands, reporting-verb patterns, stance, academic citation, `say` vs `tell` | R1–R13 | B1–C1 |
| **6** | 31 | Describing things | position, restricted adjectives, order, `-ed`/`-ing`, gradability, compounds, adjectives as nouns, adjective + preposition, adjective complements | S1–S9 | A1–C1 |
| | 32 | Describing how, where and when | adverb formation, the nine kinds, position rules, frequency, focus adverbs, stance adverbials, conjuncts, adverbial ordering, degree adverbs | S10–S18 | A1–C1 |
| | 33 | Comparing, and describing change | comparatives, superlatives, irregulars, `as…as`, `less`/`fewer`, graders, double comparatives, multiples, **the language of change**, comparison clauses, similarity, superlative hedging | S19–S31 | A1–C1 |
| | 34 | Small words with big jobs | time, place, movement, other meanings, dependent prepositions (verb/adjective/noun), postmodifying phrases, stranding, complex prepositions | T1–T11 | A1–C1 |
| | 35 | Verbs made of more than one word | the four types, separability, the pronoun rule, register, three-word verbs, telling them apart, phrasal passives | T12–T17 | B1–C1 |
| **7** | 36 | `There is` and `It is` | existential `there` in full, dummy `it`, extraposition, and **choosing between them** | U15–U18 | A2–C1 |
| | 37 | Putting the emphasis where you want it | given–new, end-weight, fronting, four cleft types, five inversion types, emphatic `do`, reflexive and lexical emphasis, theme selection | U1–U14, U19, U20 | B2–C2 |
| | 38 | `so`, `such`, `too`, `enough` | all ten degree and result structures | V1–V10 | A2–B2 |
| | 39 | Making a text hold together | reference, `this` + summary noun, substitution, ellipsis, linkers by function, restraint, position and punctuation, `although` vs `however`, lexical cohesion, topic sentences, consistency, spoken vs written signposting | W1–W14 | B1–C1 |
| **8** | 40 | Punctuation | capitals, full stops, commas, the comma splice, semicolons, colons, dashes and brackets, apostrophes, `its`/`it's`, quotation marks, hyphens, terminal marks, lists | X1–X13 | A1–C1 |
| | 41 | Spelling, numbers and conventions | numbers, dates, abbreviations, `-ise`/`-ize`, confusable spellings, BrE/AmE spelling, paragraphing | X14–X20 | A2–C1 |
| | 42 | Spoken English is not broken English | spoken vs written grammar, contractions, spoken ellipsis, headers and tails, vague language, spoken discourse markers | Y1–Y5, W12, W13 | B1–C1 |
| | 43 | Sounding academic without sounding fake | the formality cline, hedging, boosting, impersonal structures, overgeneralisation, nominal vs verbal style, first person, phrasal vs Latinate, politeness | Y6–Y14 | B2–C1 |
| | 44 | Getting it right when the clock is running | the error-triage checklist, complexity risk, error surface | Y15–Y17 | B1–C1 |
| **App** | A–L | Twelve reference tables | Z1–Z12 | Z1–Z12 | all |

### 7.3 Area → chapter index

Every area id, in order, with its chapter. **This is the acceptance test for coverage: if an area
appears in §3 and not here, the map has a hole.**

| Areas | Chapter |
|---|---|
| A1–A14 | 2 |
| B1–B15 | 3 |
| C1–C7 | 4 |
| D1–D9 | 5 |
| D10–D13 | 6 |
| D14–D18 | 7 (D18 revisited in 24) |
| E1–E9, E18 | 8 |
| E10–E16 | 12 |
| E17 | 9 |
| F1–F7 | 9 |
| F8–F18 | 10 |
| G1–G16 | 11 |
| H1–H18 | 13 |
| I1, I2, I4, I5, I35 | 18 |
| I3, I8, I9, I29, I30 | 16 |
| I6, I7, I27 | 14 |
| I10–I13, I28, I31–I34, I36 | 15 |
| I14–I26 | 17 |
| J1–J18 | 19 |
| K1–K21 | 20 |
| L1–L16 | 21 |
| M1–M17 | 22 |
| N1–N14 | 23 |
| O1–O25 | 28 |
| P1–P3 | 27 (first sighting in 7) |
| P4–P11 | 25 |
| P12–P17 | 26 |
| P18–P31 | 27 |
| Q1–Q21 | 29 |
| R1–R13 | 30 |
| S1–S9 | 31 |
| S10–S18 | 32 |
| S19–S31 | 33 |
| T1–T11 | 34 |
| T12–T17 | 35 |
| U1–U14, U19, U20 | 37 |
| U15–U18 | 36 |
| V1–V10 | 38 |
| W1–W11, W14 | 39 |
| W12, W13 | 42 |
| X1–X13 | 40 |
| X14–X20 | 41 |
| Y1–Y5 | 42 |
| Y6–Y14 | 43 |
| Y15–Y17 | 44 |
| Z1–Z12 | Appendices A–L |

### 7.4 The early sightings, restated as a build instruction

| Chapter | Early sighting | One-line form the chapter may use | Full treatment |
|---|---|---|---|
| 5 | prepositional phrases | "A group starting with a small word like `at`, `on` or `after` and ending in a noun — Chapter 34 has them all" | 34 |
| 7 | subordinating conjunctions | "Words like `because`, `although`, `when` that make a clause unable to stand alone — Chapter 27" | 27 |
| 8 | `there is / there are` | "To say something exists, English starts with `there` — the full story is Chapter 36" | 36 |
| 11 | `It is important to…` | "`it` here stands in for a whole clause that comes later — Chapter 36" | 36 |
| 13 | the passive slot in the auxiliary order | "The `be` that makes a passive — Chapter 21" | 21 |
| 13 | question formation | "This is what auxiliaries are for; Chapter 22 is the whole chapter" | 22 |
| 27 | `if`-clauses | "Conditions have their own chapter because there are six patterns — Chapter 29" | 29 |
| 31 | comparatives | "`-er` and `more` — the full comparison chapter is 33" | 33 |

### 7.5 Three reading paths through the same 44 chapters

A reference is browsed. Ship at least these three entry paths in the UI. **[JUDGEMENT]**

| Path | For | Chapters, in order |
|---|---|---|
| **Start from zero** | No grammar at all | 1 → 2 → 3 → 5 → 7 → 8 → 9 → 13 → 14 → 15 → 22 → 23 → 19 → 10 → 11 → 17 → 16 |
| **I can speak but I make mistakes** | The plateau reader | 1 → 19 → 9 → 16 → 40 → 27 → 25 → 21 → 29 → 44 |
| **I want the last band** | B2 heading to C1 | 12 → 21 → 25 (P11) → 28 (O21) → 36 → 37 → 39 → 43 → 44 |

---

## 8. Notes for TH-D1 (the design agent)

### 8.1 Six decisions this map does not make

1. **Article granularity.** 337 areas is not 337 files. My recommendation: **one article per chapter
   section**, giving roughly 120 articles, each 600–1,500 words, each independently addressable and
   linkable. A whole chapter is a container, not a document.
2. **Whether theory articles are a new pack file or a new content type.** Note the practice module's
   hard-won constraint (grammar `DESIGN.md` §0.3): any new `data/*.jsonl` file needs a `ROW_SCHEMAS`
   entry, a `DATA_FILES` entry, a `TABLE_COLUMNS` entry and a place in `IMPORT_ORDER`, or it
   validates as "not a recognised pack file" and imports nothing while still reporting OK. And all
   payload must live in **one blob column** or extra top-level keys are silently dropped.
3. **How tables are represented.** They are the payload of this module. They must be structured data,
   not markdown strings, or the renderer cannot make them responsive, searchable or dark-mode-aware.
   Same principle as `teach.visual` in the practice schema: **the content owns the data, the renderer
   owns the drawing.**
4. **How the glossary is enforced.** My recommendation: a lint that extracts every term marked as
   technical in any article and fails the merge if it is not in Z5 with a definition, and fails again
   if it is used in a chapter earlier than the one that introduces it.
5. **Cross-linking direction.** A theory area should link **out** to the practice points that drill it
   (§9), and every practice point screen should offer "read the whole system" pointing back. The ids
   in §9 are from the closed set in grammar `DESIGN.md` §4.2 — none is invented.
6. **Whether theory tracks read/unread state.** It is a reference, so probably not progress-tracked —
   but "chapters you have opened" is cheap and would let the Path suggest a chapter before a unit.

### 8.2 Five things that would make the module worse

1. **Adding exercises.** The practice module exists. A quiz at the end of a theory chapter turns the
   reference into a bad course and duplicates a scheduler.
2. **Cutting the metalanguage chapters** (2, 3, 4) because they "aren't real grammar". They are the
   reason the other 41 chapters are readable by the intended reader.
3. **Sorting the linkers alphabetically.** Z4 is organised by function and by word class because
   that is what makes W8's error stop happening.
4. **Resolving a §5 variation silently** to keep a chapter tidy. It is the one thing a reference
   must never do.
5. **Letting chapter length track how much has been written about a topic elsewhere.** Chapter 39
   (cohesion) will be tempting to inflate because the internet is full of linker lists; Chapter 12
   (noun-phrase expansion) will be tempting to shorten because almost nothing is written about it.
   The correct lengths are the other way round.

### 8.3 Length budget

| Part | Chapters | Suggested words | Rationale |
|---|---|---|---|
| 0–1 | 1–7 | 12,000 | Every term in the book is defined here; density is the enemy |
| 2 | 8–12 | 14,000 | Articles alone justify 5,000 |
| 3 | 13–21 | 32,000 | The largest part, and the owner's first three named asks |
| 4 | 22–24 | 8,000 | Owner's fourth named ask |
| 5 | 25–30 | 26,000 | The complexity block; owner's fifth named ask sits here |
| 6 | 31–35 | 18,000 | Task 1 language is concentrated here |
| 7 | 36–39 | 14,000 | Small area count, high value per word |
| 8 | 40–44 | 12,000 | Mostly tables |
| Appendices | A–L | 10,000 | Almost entirely tables |
| **Total** | **44 + 12** | **~146,000** | A real reference. Roughly 120 articles |

---

## 9. Cross-reference: theory areas → existing practice point ids

Proof that the map is a superset, and the wiring instruction for the "practise this" link. Point ids
are from the closed set in grammar `DESIGN.md` §4.2 / `syllabus.py`. **No id here is invented; where a
theory area has no practice point, the cell says so, and that is information TH-D1 should keep** —
it marks the areas the reference alone must carry.

| Theory areas | Practice point ids | Practice unit |
|---|---|---|
| A1–A8, D1–D2, D10 | `gr_clause_svo` | u01 |
| A9, A11, A12, D14–D17 | `gr_clause_types` | u09 |
| A13, A14 | *(no practice point — reference only)* | — |
| B1–B15 | *(no practice point — reference only)* | — |
| C1–C7 | *(partly `gr_noun_phrase_expansion`)* | u16 |
| D3, D9 | *(no practice point — reference only)* | — |
| D4, D8 | `gr_be_present` | u01 |
| D11, S17 | `gr_word_order_place_time`, `gr_word_order_adverbs` | u01, u15 |
| D13, U8 | `gr_inversion_negative` | u17 |
| D18, Ch 24 | `gr_imperative` | u01 |
| E2, E5–E7 | `gr_countability` | u05 |
| E3, E4 | `gr_noun_plural` | u01 |
| E10, E11 | `gr_possessive` | u05 |
| E13, E16 | `gr_noun_phrase_expansion` | u16 |
| E15, Y11 | `gr_nominalisation` | u16 |
| E17, F3 | `gr_article_zero` | u05 |
| F1 | `gr_article_a_an` | u05 |
| F2, F5, F6 | `gr_article_the` | u05 |
| F4 | `gr_article_decision` | u05 |
| F8 | `gr_demonstratives` | u05 |
| F11, F13 | `gr_quantifiers_basic` | u05 |
| F12, F17 | `gr_quantifiers_fine` | u14 |
| G1, G15 | `gr_pronoun_subject`, `gr_reference_pronoun` | u01, u16 |
| G11, G12, U15, U16, U18 | `gr_dummy_subjects`, `gr_there_is` | u15, u01 |
| G16, W3, W4 | `gr_substitution_ellipsis` | u16 |
| H1, H3 | `gr_past_participle` | u03 |
| I3 (the perfect idea itself), I5 | `gr_perfect_concept` | u06 |
| H4, H7 | `gr_third_person_s` | u02 |
| H8 | `gr_be_present`, `gr_was_were` | u01, u03 |
| H10, H11, H12, M1, N1, N2, M9, U12 | `gr_aux_system`, `gr_short_answers` | u02, u04 |
| H15 | `gr_stative_verbs` | u02 |
| I6 | `gr_present_simple` | u02 |
| I7 | `gr_present_continuous` | u02 |
| I8 | `gr_present_perfect`, `gr_pp_for_since`, `gr_pp_adverbs`, `gr_been_vs_gone` | u06 |
| I9, I30 | `gr_pp_continuous`, `gr_pp_simple_vs_cont` | u06 |
| I10 | `gr_past_simple_regular`, `gr_past_simple_irregular`, `gr_past_aux_did`, `gr_past_time_markers` | u03 |
| I11, I28 | `gr_past_continuous`, `gr_past_simple_vs_cont` | u03 |
| I12, I31 | `gr_past_perfect`, `gr_past_perfect_choice` | u06 |
| I14 | `gr_future_will` | u04 |
| I15 | `gr_future_continuous` | u04 |
| I16 | `gr_future_perfect` | u04 |
| I18 | `gr_future_going_to` | u04 |
| I19 | `gr_future_pres_cont` | u04 |
| I20 | `gr_future_pres_simple` | u04 |
| I24 | `gr_future_choice` | u04 |
| I25 | `gr_future_time_clause` | u04 |
| I27 | `gr_pres_simple_vs_cont` | u02 |
| I29 | `gr_pp_vs_past_simple` | u06 |
| I32, I33 | `gr_used_to` | u03 |
| I34 | `gr_narrative_sequence` | u13 |
| J1, J2 | `gr_sv_agreement_core` | u02 |
| J3, J6–J18 | `gr_sv_agreement_hard` | u15 |
| K1 | `gr_modal_grammar` | u07 |
| K2 | `gr_modal_deduction_present`, `gr_modal_possibility` | u07 |
| K3 | `gr_modal_perfect`, `gr_modal_past_forms` | u07 |
| K4 | `gr_modal_obligation` | u07 |
| K5 | `gr_must_vs_have_to` | u07 |
| K6 | `gr_mustnt_vs_dont_have_to` | u07 |
| K8 | `gr_modal_ability` | u07 |
| K9 | `gr_modal_permission` | u07 |
| K10 | `gr_modal_requests` | u07 |
| K18, Y7 | `gr_modal_hedging` | u17 |
| L1, L3 | `gr_passive_concept`, `gr_passive_by_agent` | u08 |
| L2 | `gr_passive_forms` | u08 |
| L4, L16 | `gr_passive_when` | u08 |
| L5 | `gr_passive_not` | u08 |
| L7, R12 | `gr_passive_reporting` | u08 |
| L8, L9 | `gr_causative`, `gr_causative_verbs` | u08, u12 |
| L12 | `gr_passive_nonfinite` | u08 |
| L14 | `gr_passive_process` | u08 |
| M2–M5 | `gr_questions_wh` | u02 |
| M11, M12 | `gr_embedded_question` | u11 |
| N5, N9, V7 | *(partly `gr_inversion_negative`)* | u17 |
| N3, N6, N7, N8, N11–N14 | *(no practice point — reference only)* | — |
| O1, O3, O6, O7 | `gr_verb_patterns_core` | u12 |
| O8 | `gr_verb_obj_infinitive` | u12 |
| O12 | `gr_meaning_change_verbs` | u12 |
| O13 | `gr_gerund_after_prep` | u09 |
| O14 | `gr_infinitive_purpose` | u09 |
| O19 | `gr_gerund_subject` | u12 |
| O21 | `gr_participle_clause` | u11 |
| P1 | `gr_coordination` | u09 |
| P4 | `gr_relative_defining` | u11 |
| P5 | `gr_relative_nondefining` | u11 |
| P6 | `gr_relative_omission` | u11 |
| P7 | `gr_relative_prepositions` | u11 |
| P9 | `gr_relative_quantifier` | u11 |
| P10 | `gr_relative_which_clause` | u11 |
| P12, P16 | `gr_noun_clause_that` | u09 |
| P18 | `gr_sub_time` | u09 |
| P20, P22 | `gr_sub_reason_result` | u09 |
| P21 | `gr_sub_purpose` | u09 |
| P23 | `gr_sub_contrast`, `gr_despite_although`, `gr_concession_structures` | u09, u17 |
| P29 | `gr_parallel_structure` | u16 |
| P31 | `gr_complex_sentence_control` | u17 |
| Q1, Q18, Q19 | `gr_unreal_past` | u10 |
| Q2 | `gr_cond_zero` | u10 |
| Q3 | `gr_cond_first`, `gr_cond_first_uses` | u10 |
| Q4 | `gr_cond_second`, `gr_cond_second_uses` | u10 |
| Q5 | `gr_cond_third` | u10 |
| Q6 | `gr_cond_mixed` | u10 |
| Q8 | `gr_inversion_conditional` | u17 |
| Q9, Q10 | `gr_cond_alternatives` | u10 |
| Q11–Q13 | `gr_wish_family` | u10 |
| Q14, Q15 | *(no practice point — reference only)* | — |
| R1, R2, R5 | `gr_reported_statements` | u13 |
| R3 | `gr_backshift_choice` | u13 |
| R6 | `gr_reported_questions` | u13 |
| R7 | `gr_reported_commands` | u13 |
| R9, R10 | `gr_reporting_verbs` | u13 |
| R11 | `gr_reporting_academic` | u13 |
| S1, S3 | `gr_adjective_position` | u01 |
| S4 | `gr_ed_ing_adjectives` | u14 |
| S8 | `gr_adj_prep_patterns` | u15 |
| S10–S13 | `gr_adverb_frequency`, `gr_word_order_adverbs` | u02, u15 |
| S15 | `gr_stance_adverbials` | u17 |
| S19–S21 | `gr_comparatives` | u14 |
| S23 | `gr_as_as` | u14 |
| S25 | `gr_comparative_grading` | u14 |
| S26, P27 | `gr_double_comparative` | u14 |
| S27 | `gr_multiples` | u14 |
| S28 | `gr_change_language` | u14 |
| S31 | `gr_superlative_hedge` | u17 |
| T1–T3 | `gr_prepositions_core` | u15 |
| T6–T8 | `gr_prepositions_dependent` | u15 |
| T9 | `gr_prepositions_phrases` | u15 |
| U1, W10 | `gr_given_new`, `gr_topic_sentence_grammar` | u16 |
| U3–U7, U13, U14 | `gr_cleft`, `gr_emphasis_structures` | u17 |
| V1–V6 | `gr_so_such_too_enough` | u14 |
| W1 | `gr_reference_pronoun` | u16 |
| W5, W7, W8 | `gr_linkers_by_function` | u16 |
| W6 | `gr_linker_restraint` | u16 |
| X1, X2 | `gr_capital_fullstop` | u01 |
| X3 | `gr_comma_rules` | u15 |
| X4 | `gr_comma_splice` | u15 |
| X5–X13 | `gr_punctuation_rest` | u15 |
| X18 | `gr_confusable_pairs` | u15 |
| Y1–Y5, W12, W13, T14 | `gr_spoken_vs_written_grammar` | u17 |
| Y15 | `gr_error_triage` | u15 |
| Y16, Y17 | *(no practice point — reference only; the risk framing lives in `point_json.error_surface`)* | — |

**Areas with no practice point at all: 11 rows above, covering roughly 70 areas.** These are exactly
the categories in §6.4 — metalanguage, complete paradigms, recognition-only structures, written
conventions, variation, and organising concepts. They are the reason the Theory tab has to exist.
Conversely, **every one of the 154 practice point ids appears in the table above**, which is the
superset proof the owner asked for when they said "we have to include ALL".

---

## 10. What is deliberately out of scope

Recorded so nobody adds it later, and so the reader can be told where the edge is. **A reference must
have a stated edge, or the reader cannot tell a gap from a boundary.**

| Excluded | Why |
|---|---|
| Historical grammar and etymology | Interesting, not usable |
| Phonology beyond H7 (the `-s`/`-ed` endings), H12 (contractions) and M17 (question intonation) | The pronunciation feature owns it. These three are included only because they change what the reader writes or hears |
| Dialect grammar (regional, AAVE, Scots, Indian English syntax) | Named as existing and valid in Chapter 1, then out of scope. The exam has a target variety |
| The full subjunctive beyond `were` (Q18) and the mandative (P17) | Vestigial; formulaic uses (`be that as it may`, `if need be`) go in a single recognition box |
| Exhaustive irregular-verb coverage | Z1 covers the high-frequency set. A 470-verb table is a dictionary, not a reference chapter |
| `whom` as a production target | Recognition only, with the register note (§5 #20) |
| Future perfect continuous (I17) as a production target | Listed for completeness in the grid; recognition only |
| Syntactic trees, X-bar, transformational analysis | The reader has no grammar at all. A tree diagram is a second language |
| Corpus statistics and frequency percentages | Banned by grammar `DESIGN.md` §0.2 claim 4 |
| Any structure with no communicative payoff | The test applied to every candidate area: *what can the reader not say without it?* |

---

## 11. What I am least sure about

Stated plainly, because a briefing that hides its soft joints costs more than one that names them.
**[JUDGEMENT] throughout.**

1. **The noun side before the verb side (Chapters 8–12 before 13–21).** It is right for error
   frequency and wrong for motivation — a reader who came for tenses has to travel four chapters to
   reach them. Mitigated by §7.5's three reading paths, but if user testing says readers bounce, swap
   Parts 2 and 3. Nothing in the dependency graph forbids it except E2 → J7 and E2 → S24, both of
   which are late in their chapters.
2. **Whether Chapter 13 (the auxiliary system) can carry that much weight.** It is 18 areas and it is
   the mechanism behind five later chapters. It might need splitting into 13a (verb forms) and 13b
   (the helper system). I have left it whole because the whole point is that it is one thing.
3. **The 337-area count.** Some of my areas are one paragraph (V6) and some are a chapter section
   (I2). A different splitter would produce 280 or 400. The count is not the deliverable; the
   completeness is.
4. **CEFR levels in the C-range.** A1–B1 assignments are safe. C1 vs C2 is my judgement and it varies
   by structure and by L1. Treat the C-range levels as advisory ordering, not as gates.
5. **Whether §5's 42 variation points are too many for a beginner-facing reference.** The honest
   answer is that the reader meets them anyway — on prep sites, from teachers, from other apps — and
   meets them as contradictions with no explanation. My call is that naming them is kinder. But they
   must be presented as **notes attached to a clear main rule**, never as the main content, or the
   reader learns that English is arbitrary.
6. **Group Y (register and style) being called grammar.** Some readers will expect a grammar
   reference to stop at Chapter 41. I think Y1 (spoken vs written) is one of the most valuable
   chapters in the book and is precisely the owner's "when to use which" applied to register rather
   than to form. But it is the group most likely to be cut, and if anything is cut it should be Y8,
   Y12 and Y14 rather than Y1.
7. **Whether Chapter 44 (accuracy under pressure) belongs in a reference at all.** It is a procedure,
   not a description of English. I have kept it because it is the page a reader will actually reopen
   the night before a test, and because it converts 43 chapters of description into something
   executable.
