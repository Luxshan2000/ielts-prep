# D1 — Teaching-grade speaking content: schema, clusters, features

**Status:** the authoring contract. Seven authoring agents (D2–D8) and two feature agents build to
this document. Where this document and a research briefing disagree, this document wins — it has
already reconciled them.

**Companion artefact:** [`TEMPLATE.json`](TEMPLATE.json) — one complete set, authored to the
standard. Read it before you write anything. It is the ceiling and the floor.

**Inputs:** `staging/research/01-exam-reality.md` (R1), `02-topic-pool.md` (R2),
`03-bands-and-errors.md` (R3), `04-pedagogy.md` (R4). Section references below are to those files.

---

## 0. What we are building and why

The pack ships 12 speaking sets. They *test*; they do not *teach*. This push adds **56 new sets**
(7 clusters × 8) and, more importantly, adds a teaching payload to every card so the app can do
seven things it currently cannot:

1. show a learner three renderings of the *same* two-minute answer at bands 6, 7 and 8, annotated
   with which criterion each difference belongs to;
2. hand them a topic-scoped bank of functional frames with open slots, and an explicit "this is the
   canned version" negative exemplar beside each;
3. coach the sixty-second prep minute as a procedure rather than a countdown;
4. give them a named recovery move when they dry up at seventy seconds;
5. name the two errors this specific topic will provoke, before they make them;
6. tell them which pronunciation feature this topic's vocabulary actually stresses;
7. show them how a Part 3 question climbs away from the Part 2 story, one rung at a time.

Every field below exists to serve one of those seven. A field that serves none of them was cut.

### 0.1 Copyright — non-negotiable, read it twice

- The exam's **format, timing and sequence of moves** are facts. Use them freely.
- The **subject areas** that recur are facts about the exam, widely documented. Use them freely.
- **Every question, bullet, frame, model answer and teaching note you write must be composed from
  scratch.** Never transcribe from a past paper, a prediction list, a coaching blog, a YouTube
  transcript or a "band 9 sample answers" page.
- Official band descriptor prose is copyrighted text. The *criteria* and what they assess are facts.
  Paraphrase in your own words. R3 §2 is already a clean-room paraphrase — reuse R3's wording, never
  the descriptors'.
- **Self-check before you commit any sentence:** did I read this sentence somewhere? If there is any
  doubt at all, throw it away and write a different one on the same subject.
- Never write a distinctive proper noun that could only have come from a real exam paper.
- Product copy says **"IELTS-style"**. The pack manifest already carries the non-affiliation notice.

### 0.2 Hard compatibility constraints (violating these breaks the running app)

Verified against `sidecar/bandready/content/validate.py` and
`sidecar/bandready/voice/state_machine.py`:

| Constraint | Why |
|---|---|
| `speaking_cards.payload_json.questions` must stay a **flat array of strings** | `CardBundle.from_payloads` does `str(q)` over it and feeds the result to the examiner TTS. An object would be spoken as a Python dict. **All Part 1 and Part 3 teaching data therefore lives in a parallel array indexed by `q_index`.** |
| `part3_themes[].questions` must stay a **flat array of strings** | Same reason. |
| `payload_json` must carry `id`, `part`, `topic` | The state machine reads `payload["id"]`, `payload["part"]`, `payload["topic"]`. |
| `cue_card` keeps exactly `topic`, `bullets`, `rounding_off` | `CueCard.spoken_topic_line()` joins `bullets` into the examiner's spoken card. |
| `difficulty` ∈ `{core, stretch}` only | `SpeakingCardRow._difficulty` rejects anything else. |
| `part` ∈ `{1,2,3}` only | `SpeakingCardRow._part`. |
| Row ids unique **across the whole file** | `validate_rows` rejects a duplicate id and the pack fails **whole**. |

Everything else is additive: `_Row` is `extra="allow"` and `payload_json` is an untyped dict, so no
schema migration and no code change is needed to ship any field in this document.

`schema_version` goes from `1` to `2` on every new row. The existing 12 sets stay at `1`. Consumers
must tolerate both — treat every teaching field as absent-by-default.

---

## 1. The card_set payload (`schema_version: 2`)

The set is where **topic-scoped** material lives: the language bank and the vocabulary belong to the
subject, not to a part. One set has exactly one Part 2 card, so there is no ambiguity about scope.

| Field | Type | Req | Rules |
|---|---|---|---|
| `schema_version` | int | **REQ** | Always `2` |
| `difficulty` | `"core"` \| `"stretch"` | **REQ** | Mirrors the Part 2 card's difficulty |
| `tags` | string[] | **REQ** | 3–6, lowercase kebab-case |
| `part1_card_ids` | string[] | **REQ** | Exactly 2 |
| `part2_card_id` | string | **REQ** | |
| `part3_card_id` | string | **REQ** | |
| `cluster` | string | **REQ** | Your cluster slug, e.g. `c3-work-money` |
| `family` | `"F1"`–`"F8"` | **REQ** | The Part 2 cue-card family (R2 §2.1) |
| `cognitive_load` | `"elements"` \| `"reasoning"` \| `"there_and_then"` \| `null` | **REQ** | Non-null **iff** `difficulty == "stretch"`. Names the one resource-directing dimension this set raises (R4 §6.3) |
| `lineage` | string | **REQ** | 25–60 words. Must name the Part 2 instance, both Part 3 theme titles, and the M-codes used (R2 §3.1) |
| `teaches` | string | **REQ** | ≤ 25 words. A capability, not a topic: "Hold one past tense across two minutes, then concede in Part 3 without abandoning the position." |
| `exam_note` | string | OPT | ≤ 35 words. One *exam-reality* fact from R1 that this set is a good moment to say out loud |
| `language_bank` | object | **REQ** | §1.1 |
| `vocabulary` | object[] | **REQ** | §1.2, 8–12 items |

### 1.1 `language_bank` — functional language, grouped by function

```jsonc
"language_bank": {
  "warning": "<string, 15–30 words>",     // REQ — why these must not be recited
  "functions": [                          // REQ — 3 to 6 entries
    {
      "function": "<enum>",               // REQ
      "why_here": "<≤15 words>",          // REQ — why THIS topic pulls THIS function
      "grammar": "<≤10 words>",           // REQ — what the frames showcase
      "frames": [                         // REQ — 2 or 3, never more (R4 §4.2 rule 2)
        { "frame": "<slotted, with ___>", "slot_hint": "<≤15 words, what fills the gap>" }
      ],
      "avoid": "<one full canned sentence>"  // REQ — the negative exemplar
    }
  ]
}
```

`function` enum (closed — the app renders the same eight labels everywhere):
`opinion` · `hedging` · `comparing` · `speculating` · `conceding` · `exemplifying` · `narrating` ·
`evaluating`

Rules:
- Every `frame` must contain at least one `___` slot. A frame with no gap is a sentence, and a
  sentence is a script (R4 §4.2).
- `avoid` must be a *plausible* canned sentence a learner would actually find on a phrase-bank site,
  not a strawman. It is shown beside the good version; the contrast is the teaching (R4 §4.3).
- The `warning` string must say, in your own words, that these are frames with gaps and that a
  frame delivered whole is audible as a recital. Vary the wording per set.
- Functions must be chosen because the *questions in this set* pull them. Do not ship `speculating`
  on a set with no forward-looking question.

### 1.2 `vocabulary` — collocations first, single words last

```jsonc
{ "item": "get nowhere with something",
  "type": "collocation" | "chunk" | "phrasal_verb" | "idiom" | "word",   // REQ
  "cefr": "B1" | "B2" | "C1",                                            // REQ
  "meaning": "<≤12 words, learner-facing, not a dictionary definition>", // REQ
  "example": "<one natural SPOKEN sentence, 8–20 words>",                // REQ
  "used_in": "part1" | "part2" | "part3" | "any" }                       // REQ
```

Rules (all lintable):
- 8–12 items per set.
- **At most 2 items may have `type: "word"`.** R3 §3.5: Lexical Resource is lost to wrong partners,
  not to missing words. Ship the partners.
- At least 2 items at `cefr: "C1"`, at least 4 at `"B2"`. Nothing below B1.
- `example` must be a sentence someone would say aloud, contractions and all. If it reads like an
  essay, rewrite it.
- No item may repeat inside your cluster file.

---

## 2. The Part 1 card payload (`schema_version: 2`)

Unchanged fields: `id`, `part`, `topic`, `difficulty`, `tags`, `questions`.
New: `frame_tier`, `frame_kind`, `teaching`.

| Field | Type | Req | Rules |
|---|---|---|---|
| `frame_tier` | 1 \| 2 \| 3 | **REQ** | R2 §1.2 tier of the subject area |
| `frame_kind` | `"personal"` \| `"topic"` | **REQ** | `personal` = the obligatory work/study \| hometown \| home frame |
| `questions` | string[] | **REQ** | **5** (4–6 permitted). Each answerable in 2–4 sentences. No specialist knowledge. |
| `teaching.schema_version` | int | **REQ** | `1` |
| `teaching.tense_focus` | string | **REQ** | ≤ 15 words. Which tenses this frame crosses (R1 §10 gap 2) |
| `teaching.band_move` | string | **REQ** | ≤ 20 words. The **one** behaviour this frame trains. The coach persona gives one improvement — this is the rankable top item (R3 §8) |
| `teaching.questions` | object[] | **REQ** | Exactly one per question, `q_index` 0-based and contiguous |

Per-question object:

```jsonc
{ "q_index": 0,
  "angle": "A1".."A10",                    // REQ — R2 §1.1 angle grid; no repeats within a frame
  "answer_shape": "<≤20 words>",           // REQ — worded for THIS question, not generic
  "extend_move": "<≤20 words>",            // REQ — a sentence the learner can literally say
  "common_error": { "wrong": "...", "right": "...", "why": "<≤12 words>" },  // REQ
  "probe": "<≤10 words>" }                 // REQ — the examiner's extension move (R1 §7 move 8)
```

Rules:
- The five angles in a frame must be **five different** A-codes. Sequence them easy → light opinion
  (R2 §1.1): a good default is A1 → A3 → A5 → A2/A4 → A6/A8.
- **At least one of A5, A7, A9** must appear in every frame — those are where band-6 candidates leak
  tense, quantifier and conditional marks (R2 §1.1).
- `answer_shape` is direct-answer → reason → one detail, *instantiated for this question*.
  "Say which one, name the subject or role, then add where" — not "answer, reason, detail".
- `extend_move` is the actual English. It must sound spoken.
- `common_error` must be an error this *specific question* provokes, drawn from R3 §5.1.
- `probe` is what the examiner would really say next — short, contingent, often three words.

---

## 3. The Part 2 card payload (`schema_version: 2`) — the heart of the pack

Unchanged: `id`, `part`, `topic`, `difficulty`, `tags`, `cue_card`.
New: `family`, `teaching`.

### 3.1 `cue_card` — do not restructure it

```jsonc
"cue_card": {
  "topic": "Describe a time when you helped someone solve a problem.",  // full sentence, imperative
  "bullets": [ "<noun phrase>", "<noun phrase>", "<noun phrase>",
               "and explain <evaluative/explanatory move>." ],          // EXACTLY 4
  "rounding_off": [ "<short question>", "<short question>" ]            // EXACTLY 2
}
```

- Bullets 1–3 are **descriptive scaffolding**: who / what / where / when, factually answerable, and
  written as bare noun phrases with no leading capital and no full stop.
- **Bullet 4 is always the evaluative move** and always begins `and explain ` (R1 §3.1, R2 §0). Its
  surface may be *why*, *how you felt*, *what you learned*, *what difference it made* — but it must
  shift from description to reason/evaluation. This is lint-enforced.
- `rounding_off`: 2 questions, each answerable in one or two sentences, each derived from *the talk*
  rather than the topic in the abstract (R1 §3.4). Good shapes: a different attribute of the same
  thing; a counterfactual; a social probe. **Never write a Part 3 question here.**

### 3.2 `teaching` on a Part 2 card

```jsonc
"teaching": {
  "schema_version": 1,
  "band_move":          "<≤20 words>",   // REQ — the ONE highest-impact instruction for this card
  "prep_plan":          { ... },         // REQ — §3.3
  "time_plan":          [ ... ],         // REQ — exactly 5 segments, §3.4
  "recovery_moves":     [ ... ],         // REQ — 3–4, §3.5
  "target_language":    ["<function>"],  // REQ — 2–3, must exist in set.language_bank.functions
  "error_watchlist":    [ ... ],         // REQ — 2–3, §3.6, ordered highest-impact first
  "pronunciation_focus":{ ... },         // REQ — §3.7
  "examiner_note":      "<≤35 words>",   // REQ — what the examiner will actually do here (R1 §7)
  "swap_slots":         [ ... ],         // REQ — 3–5, §3.9
  "transfer_drill":     "<≤30 words>",   // REQ — must name a duration
  "model_answers":      [ ... ]          // REQ — exactly 3, §3.8
}
```

### 3.3 `prep_plan` — the sixty seconds

```jsonc
"prep_plan": {
  "idea_prompt": "<≤30 words>",   // REQ — how to CHOOSE in ten seconds, for this card specifically
  "note_grid": [                  // REQ — exactly 4, one per bullet, in order
    { "bullet_index": 0, "cell": "<≤40 characters>" }
  ],
  "trap": "<≤25 words>"           // REQ — shown AFTER the turn only, never during
}
```

The 40-character cap **is** the "phrases not sentences" rule made structural (R4 §3.1). Cells are
worked examples: keywords, arrows, abbreviations — write them the way a candidate under time
pressure actually would (`went thru calls -> email w/ dates`), not the way a textbook would.
`idea_prompt` must push *commit to the first usable memory*, because forty seconds hunting for the
best story is the commonest self-inflicted wound. `trap` names the specific omission this card
provokes.

### 3.4 `time_plan` — exactly five segments

Fixed boundaries, from R4 §3.2. Only `goal` varies per card.

```jsonc
[ { "from_s":   0, "to_s":  10, "segment": "opening",     "goal": "<≤12 words>" },
  { "from_s":  10, "to_s":  50, "segment": "bullets_1_2", "goal": "<≤12 words>" },
  { "from_s":  50, "to_s":  80, "segment": "bullet_3",    "goal": "<≤12 words>" },
  { "from_s":  80, "to_s": 115, "segment": "bullet_4",    "goal": "<≤12 words>" },
  { "from_s": 115, "to_s": 120, "segment": "landing",     "goal": "<≤12 words>" } ]
```

Do not change the numbers. The point of the budget is that the bullets are **not** 30 seconds each:
bullet 4 carries the band, so it gets 35 seconds.

### 3.5 `recovery_moves` — the ladder, made concrete

```jsonc
[ { "rung": 1, "prompt": "<≤20 words, specific to THIS card>" } ]   // 3–4 entries
```

`rung` ∈ 1–6, from R4 §3.3: 1 zoom in on a detail · 2 add time depth · 3 bring in another person ·
4 contrast with the opposite · 5 speculate · 6 evaluate out loud. Pick the 3–4 rungs that actually
work for this subject and instantiate them. `"Zoom in on a detail"` is not a prompt; `"Describe what
you actually wrote — how long it was, what came first"` is.

Never write a filler-stalling move ("that's an interesting question, let me think"). It produces no
rateable language and is the most parroted move in the exam.

### 3.6 `error_watchlist`

```jsonc
[ { "pattern": "<name from R3 §5.1>",
    "wrong":   "<the error, in THIS topic's content>",
    "right":   "<the fix, same sentence>",
    "why":     "<≤12 words, a rule the learner can apply>",
    "criterion": "GRA" | "LR" } ]                                  // 2–3 entries
```

Ordered highest-impact first — the coach persona surfaces one improvement, so index 0 is the one it
gets. Choose the two patterns **this topic's questions force**, not two you like. R3 §5.1 pairs to
copy: past narrative → tense consistency + third conditional; Part 3 trends → agreement-across-a-long-subject
+ articles with generalisations; possession cards → present perfect duration + `for`/`since`.

### 3.7 `pronunciation_focus`

```jsonc
{ "priority": "<enum>",                 // REQ
  "tier": 1 | 2,                        // REQ — R3 §5.2 tier of that feature
  "why_here": "<≤18 words>",            // REQ — why THIS topic's language stresses it
  "target_words": [                     // REQ — 3–5, all drawn from this card's own vocabulary
    { "word": "annoyed", "stress": "a-NOYED", "note": "<≤12 words>" } ],
  "chunking_drill": {                   // REQ
    "sentence": "<one sentence copied verbatim from the band-7 model>",
    "chunks": [ "<thought group>", "<thought group>", "<thought group>" ] },
  "minimal_pairs": [ { "a": "...", "b": "...", "contrast": "<≤12 words>" } ]  // OPT, 0–2
}
```

`priority` enum, ordered by R3 §5.2 damage ranking:
`consonant_clusters` · `final_consonants` · `l_r` · `v_w_b` · `word_stress` · `ed_endings` ·
`s_endings` · `sentence_stress` · `chunking` · `intonation` · `weak_forms` · `vowel_length` · `th`

Constraints: `th` may be used **at most once across a whole cluster file** — ELF research puts it
among the least intelligibility-critical features and it is over-taught everywhere else (R3 §9.3).
Across your 8 sets you must use at least 3 distinct `priority` values, and at least 2 of them from
Tier 1. `stress` is written as a plain-ASCII capitalised-syllable hint, not IPA.

### 3.8 `model_answers` — three bands, one story

**Exactly three entries, `band_target` 6 then 7 then 8, in that order.** All three tell the *same*
story with the *same* facts. Only the language differs. That is the whole design: it isolates
language from content, so the learner can see that the gap between 6 and 7 is not a better memory or
a more interesting life.

```jsonc
{ "band_target": 6 | 7 | 8,
  "label": "<≤8 words>",              // REQ — e.g. "Where most candidates land"
  "approx_seconds": <int>,            // REQ — 90–125
  "transcript": "<string, \n\n between paragraphs, one paragraph per bullet>",  // REQ
  "what_caps_it":  [ { "criterion": "FC"|"LR"|"GRA"|"PRON", "point": "<≤20 words>" } ],
  "what_lifts_it": [ { "criterion": "FC"|"LR"|"GRA"|"PRON", "point": "<≤20 words>" } ],
  "annotations":   [ { "span": "<EXACT substring of this transcript>",
                       "kind": "<enum>",
                       "criterion": "FC"|"LR"|"GRA"|"PRON",
                       "label": "<≤8 words>",
                       "why":   "<≤20 words, phrased as something to do next time>",
                       "transferable": true|false } ] }
```

`kind` enum: `move` · `chunk` · `grammar` · `lexis` · `prosody` · `repair` · `swap` · `avoid`.

Per-band requirements:

| | band 6 | band 7 | band 8 |
|---|---|---|---|
| Transcript words | 170–220 | 250–310 | 240–320 |
| Annotations | 4–6 | 6–10 | 4–6 |
| Required kinds | ≥ 3 × `avoid`, ≥ 1 × `move` (something it does *right*) | ≥ 3 × `move`, ≥ 1 × `grammar`, ≥ 1 × `lexis` | ≥ 1 × `grammar`, ≥ 1 × `lexis` |
| `what_caps_it` | exactly 3, three different criteria | `[]` | `[]` |
| `what_lifts_it` | `[]` | exactly 3, vs band 6 | exactly 3, vs band 7 |

**Every `span` must be an exact substring of its own transcript.** This is lint-enforced; the UI
locates annotations by string search. Spans must not overlap.

Writing the band 6: it must be *plausible*, not a parody. A band-6 candidate speaks at length and is
understood. The characteristic limitations are: `so`/`and` carrying every connection; tense drifting
into the present inside a past narrative; a broken conditional; the same flat adjective twice
(`good`, `nice`, `happy`); and a close that restates the card. Include one thing it does *right* and
annotate it `move` — the learner needs to know what to keep.

Writing the band 7: the diagnostic features from R3 §3 are what you are demonstrating — hesitation
at clause boundaries rather than mid-phrase, two or three signposted moves, one past perfect, one
conditional, chunks rather than single adjectives, and `whereas`/`although` doing real work. Ten
annotations is the ceiling; six is fine.

Writing the band 8: one further step, not a different universe. R3 §2.4 — band 7 is band 6 plus
intermittent band-8 stretches, so band 8 is sustained control, not error-freedom. Show inversion or
a cleft, two idioms used exactly where a native would use them, one precise word chosen for its
shade of meaning, and a close that abstracts away from the anecdote. Do **not** pack it with rare
vocabulary; that is the band-6 failure mode wearing a costume (R3 §3.5).

**Never** assert a personal fact a learner would have to borrow wholesale. Every specific detail
that identifies *whose* life this is must sit inside a `swap_slot`.

### 3.9 `swap_slots`

```jsonc
[ { "span": "<EXACT substring of the BAND-7 transcript>",
    "prompt": "<≤25 words — what the learner must put there instead>" } ]   // 3–5 entries
```

Cover, at minimum: the time reference, the person or place, and the central concrete detail. The
prompt must demand specificity ("one relationship plus one specific detail, never a general
description"), because a vague replacement leaves the model memorisable.

---

## 4. The Part 3 card payload (`schema_version: 2`)

Unchanged: `id`, `part`, `topic`, `difficulty` (always `stretch`), `tags`, `part3_themes`.

### 4.1 Theme object

```jsonc
{ "title": "<lowercase spoken noun phrase, ≤7 words>",     // REQ
  "questions": [ "<string>", "<string>", "<string>" ],     // REQ — exactly 3 STRINGS
  "counterpoint": "<≤22 words>",                           // REQ — a position, not a fact
  "counter_probe": "<≤20 words>",                          // REQ — how the examiner says it aloud
  "concession_frame": "<≤20 words, contains ___>",         // REQ — concede-then-hold
  "target_functions": [ "<function>", "<function>" ],      // REQ — 2, must exist in the set bank
  "abstraction_ladder": {                                  // REQ
    "concrete":          "<the same question, about the candidate>",
    "local_general":     "<the same question, about people they know>",
    "societal_abstract": "<the same question, about society>" },
  "question_notes": [                                      // REQ — one per question, contiguous
    { "q_index": 0,
      "move": "M1".."M10",              // REQ — R2 §3.1 abstraction move
      "archetype": "<enum>",            // REQ
      "answer_shape": "<≤22 words>",    // REQ
      "probe": "<≤12 words>",           // REQ — R1 §7 move 19
      "watch_out": "<≤18 words>" } ] }  // REQ — the trap in THIS question
```

`archetype` enum (R1 §4 seven, plus two we needed): `opinion` · `cause` · `comparison` ·
`evaluation` · `speculation` · `hypothetical` · `responsibility` · `generalisation` · `definition`.

Rules:
- **2 themes** (3 permitted), **3 questions each**.
- Within a theme the three `move` codes must be **three different** M-codes.
- Across the card, **at least one of M2 / M6 / M9** must appear — those are the band-6→7 separators
  (R2 §3.1).
- `title` reads like the examiner's spoken hinge: `how neighbourhoods change`, not
  `The Changing Face of Neighbourhoods`.
- `counterpoint` is a **position an examiner would push you onto**, not a fact. It must be arguable
  and mildly provocative. This is the field the Part 3 sparring feature runs on, and R1 §4 names
  concede-and-rebut as the cheapest reliable upgrade available.
- `abstraction_ladder` is the *same* question at three altitudes. It is what makes the escalation
  legible and it is what a stuck learner drops down to.
- Part 3 questions are **never about the candidate's own instance**. The Part 2 card was a person;
  Part 3 is about people. If a Part 3 question could be answered with "my neighbour", rewrite it.

### 4.2 Card-level `teaching` on a Part 3 card

```jsonc
"teaching": {
  "schema_version": 1,
  "band_move": "<≤20 words>",            // REQ
  "bridge":    "<≤30 words>",            // REQ — the examiner's spoken pivot from Part 2 (R1 §7 move 17)
  "error_watchlist": [ ... ]             // REQ — 2, same shape as §3.6
}
```

`bridge` names the Part 2 subject and announces the widening, in the examiner's register — economical,
first-person-plural, no evaluation. Write your own; do not reuse the template's.

---

## 5. Cluster assignments

Seven agents, eight sets each, 56 sets. Clusters are non-overlapping by subject **and** by Part 1
frame-B area, so the pack ends up covering 56 distinct everyday topic areas.

### 5.1 Global rules that apply to every cluster

**Part 1 frame A** — every set's first Part 1 card is a **Tier 1 personal frame**: `work or study`,
`your home town`, or `your home`. This closes R1 §10 gap 1 (a real Part 1 opens with the obligatory
personal frame). Within your 8 sets, rotate **3 work/study · 3 hometown · 2 home**, and give each a
genuinely different sub-focus and a different angle sequence — "what you study" vs "how you got
into it" vs "the place you study in" are three different frames, not one frame three times.

**Part 1 frame B** — the second card is the topic frame, taken from your assigned area list below.
Areas are numbered as in R2 §1.2. No area may be used twice inside the pack.

**Difficulty** — per cluster: exactly **6 `core` sets and 2 `stretch` sets**. The stretch sets are
named below. Card-level difficulty is mechanical: **Part 1 cards are always `core`; the Part 2 card
takes the set's difficulty; the Part 3 card is always `stretch`.**

**topic_id** — the *set's* `topic_id` is the concrete Part 1/Part 2 topic. The Part 3 card may and
often should carry a different, more abstract `topic_id` (R2 §4.3). `topic_crime`,
`topic_globalisation`, `topic_economy`, `topic_urbanisation` and `topic_science` are Part-3 topics —
use them on Part 3 cards, not on Part 1 cards.

**Reserved** — the subject *"a time you helped someone solve a problem"* belongs to `TEMPLATE.json`.
Do not author it. Also do not re-author any of the 12 existing sets' Part 2 subjects (listed in
§5.9).

---

### 5.2 `c1-people` — People and relationships · id block **1xx**

Set `topic_id`s: mostly `topic_family`, `topic_communication`, `topic_culture`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 101 | a friend you have known the longest | F1 | core |
| 102 | someone who helped you when you were struggling | F1 | core |
| 103 | a person who makes you laugh | F1 | core |
| 104 | a person who gave you useful advice | F1 | core |
| 105 | a person you met once and still remember | F1 | **stretch** (`there_and_then`) |
| 106 | a time you had to explain something difficult to someone | F5 | **stretch** (`reasoning`) |
| 107 | a time you were surprised by someone's kindness | F4 | core |
| 108 | something you do with your family regularly | F6 | core |

Frame-B areas: 8 friends · 9 family · 21 childhood · 26 celebrations and festivals · 27 gifts and
giving · 39 names · 53 politeness and good manners · 58 helping others and volunteering.

Teaching centre of gravity: character adjectives beyond `nice`/`kind`; relative clauses
(`the kind of person who…`); cleft structures (`what I admire about her is…`). The classic F1
failure is narrating a biography and never characterising — say so in a `trap`.

---

### 5.3 `c2-places` — Places and living space · id block **2xx**

Set `topic_id`s: `topic_housing`, `topic_urbanisation`, `topic_tourism`, `topic_environment`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 201 | a quiet place you go to think | F2 | core |
| 202 | a park or green space you use | F2 | core |
| 203 | a room in your home you spend a lot of time in | F2 | core |
| 204 | a place that gets very crowded | F2 | core |
| 205 | a place you used to go to as a child | F2 | core |
| 206 | a place you visited that was different from what you expected | F2 | **stretch** (`there_and_then`) |
| 207 | a change you would like to see in your town | F8 | **stretch** (`reasoning`) |
| 208 | something in your home that needs replacing | F3 | core |

Frame-B areas: 10 holidays and travel · 11 transport and getting around · 23 neighbours and
neighbourhood · 30 parks, nature and being outdoors · 35 noise and quiet · 44 public places
(libraries, markets, squares) · 47 maps, directions and finding your way · 49 furniture and the
things in your room.

Teaching centre of gravity: prepositions of place (`on the outskirts of`, `tucked away behind`,
`overlooking`); existential `there is/are`; the flat-listing failure (`there is a shop, there is a
park`) and the relative-clause fix.

---

### 5.4 `c3-work-money` — Work, study and money · id block **3xx**

Set `topic_id`s: `topic_work`, `topic_education`, `topic_money`; Part 3 cards may use
`topic_economy`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 301 | a person who is good at their job | F1 | core |
| 302 | someone you would like to work with | F1 | core |
| 303 | a goal you are working towards at the moment | F8 | **stretch** (`reasoning`) |
| 304 | a time you saved up for something | F5 | core |
| 305 | a time you worked with other people towards a goal | F5 | **stretch** (`elements`) |
| 306 | something you bought that turned out to be a waste of money | F3 | core |
| 307 | an occasion when you were given a responsibility | F4 | core |
| 308 | a place you go to study or work that isn't your home or office | F2 | core |

Frame-B areas: 4 daily routine · 15 reading and books · 22 future plans · 36 concentration and focus
· 40 numbers and maths in daily life · 54 confidence · 55 small shops and local businesses ·
57 saving and spending money.

Teaching centre of gravity: future forms for plans (`I'm hoping to`, `the idea is to…`); weighing
language for decisions (`what tipped the balance was…`); uncountable nouns (`advice`, `research`,
`equipment`, `feedback`) and their counters.

---

### 5.5 `c4-objects-media` — Objects, media and technology · id block **4xx**

Set `topic_id`s: `topic_technology`, `topic_media`, `topic_culture`; Part 3 cards may use
`topic_globalisation` or `topic_communication`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 401 | a film that made you think differently about something | F7 | **stretch** (`reasoning`) |
| 402 | a website or app you use almost every day | F7 | core |
| 403 | a song that means something to you | F7 | core |
| 404 | a bag or container you carry with you | F3 | core |
| 405 | something you own that other people comment on | F3 | core |
| 406 | an object that reminds you of a particular time in your life | F3 | **stretch** (`there_and_then`) |
| 407 | something handmade that you own or were given | F3 | core |
| 408 | an item of clothing you wear often | F3 | core |

Frame-B areas: 16 television and films · 17 mobile phones · 18 the internet and social media ·
25 photographs and taking photos · 45 advertisements · 50 emails, letters and messages · 51 robots
and AI in everyday life · 56 apps you use.

Teaching centre of gravity: **present simple for plot and content** (`it's set in…`, `it follows a
man who…`) — candidates wrongly narrate media in the past; present perfect for possession duration
(`I've had it since…`, `for about six years`); material and shape vocabulary; `it comes in handy
when…`.

---

### 5.6 `c5-experience` — Experiences and turning points · id block **5xx**

Set `topic_id`s: spread across `topic_education`, `topic_transport`, `topic_communication`,
`topic_work`, `topic_family`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 501 | a time you learned something from a mistake | F5 | core |
| 502 | a time you had to change a plan at short notice | F5 | **stretch** (`elements`) |
| 503 | a time you had to be patient | F5 | core |
| 504 | a time you got lost | F5 | core |
| 505 | a time someone gave you honest feedback | F5 | core |
| 506 | a time you disagreed with someone and it turned out well | F5 | **stretch** (`reasoning`) |
| 507 | an occasion when you had to speak in front of people | F4 | core |
| 508 | a day that did not go according to plan | F4 | core |

Frame-B areas: 20 sleep · 28 languages and learning English · 32 handwriting and writing by hand ·
33 patience and waiting · 34 boredom · 37 punctuality and being late · 38 dreams (both kinds) ·
52 memory and remembering things.

Teaching centre of gravity: this is the tense-control cluster and the biggest existing gap. Past
simple + past continuous for background; past perfect for backshift; **third conditional for
regret**; evaluative retrospect (`looking back`, `in hindsight`, `if I'm honest`); `had to` /
`managed to` / `ended up -ing`. Every card in this cluster should carry tense consistency at
`error_watchlist[0]`.

---

### 5.7 `c6-body-food-sport` — Health, food and activity · id block **6xx**

Set `topic_id`s: `topic_health`, `topic_food`, `topic_sport`, `topic_culture`.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 601 | a form of exercise that suits you | F6 | core |
| 602 | an activity you do to relax after work or study | F6 | core |
| 603 | something you do that other people find unusual | F6 | **stretch** (`elements`) |
| 604 | a hobby you would like to take up | F6 | core |
| 605 | a skill you practise regularly | F6 | core |
| 606 | a meal you remember well | F4 | core |
| 607 | a place where you like to eat | F2 | core |
| 608 | a habit you have managed to break or build | F8 | **stretch** (`reasoning`) |

Frame-B areas: 5 free time and leisure · 6 food and cooking · 14 sport and exercise · 19 clothes and
what you wear · 24 animals and pets · 41 colours · 42 flowers and plants · 60 games and toys.

Teaching centre of gravity: `used to` / `would` for lapsed habits; gerunds after verbs of liking
(`I'm into…`, `I've got into the habit of -ing`); process language (`first you…, then…`); frequency
adverb placement, which is the highest-density error in this cluster.

---

### 5.8 `c7-society-world` — Society, environment and the wider world · id block **7xx**

Set `topic_id`s: `topic_culture`, `topic_environment`, `topic_globalisation`, `topic_media`,
`topic_education`; Part 3 cards should carry `topic_crime`, `topic_science`, `topic_globalisation`,
`topic_economy` — this cluster is where our under-used abstract topics get covered.

| # | Part 2 subject | Family | Difficulty |
|---|---|---|---|
| 701 | a historic place in your country | F2 | core |
| 702 | a country you would like to live in for a year | F2 | core |
| 703 | an event in your country that most people remember | F4 | **stretch** (`elements`) |
| 704 | a public event you went to — a match, concert or festival | F4 | core |
| 705 | a television programme people in your country watch | F7 | core |
| 706 | a time you spent a whole day outdoors | F5 | core |
| 707 | a rule at your school or workplace that you agree with | F8 | **stretch** (`reasoning`) |
| 708 | a well-known person from your country you respect | F1 | core |

Frame-B areas: 7 weather and seasons · 12 shopping · 13 music · 31 art, drawing and painting ·
43 rain, snow and extreme weather · 46 news and how you follow it · 48 rubbish and recycling ·
59 talking to people you don't know.

Teaching centre of gravity: the Part 3 abstraction moves at their most demanding — M6 responsibility
(modals of obligation, passive `should be regulated`), M7 trade-off (`on balance`, `the downside
is`), M9 hypothetical (second conditional, `supposing`). At least three of this cluster's Part 3
cards must use a Part-3-only `topic_id`.

---

### 5.9 Do-not-repeat list (the existing 12 Part 2 subjects)

a place near your home that has changed · a job you would like to do · a piece of technology you
find useful · a skill you learned outside school · a healthy habit you have kept · something you did
to help the environment · a journey you remember well · a meal you enjoyed with other people · a
piece of news that interested you · an older person you admire · something useful you bought cheaply
· a sport or activity you enjoy · **a time you helped someone solve a problem** (template).

### 5.10 Resulting coverage (do not "improve" this — it is the R2 §4.2 weighting)

| Family | Sets | Target share |
|---|---|---|
| F2 Place | 10 | 18% |
| F5 Experience | 10 | 18% |
| F1 Person | 8 | 15% |
| F4 Event | 7 | 13% |
| F3 Object | 7 | 13% |
| F6 Activity | 6 | 10% |
| F7 Media | 4 | 7% |
| F8 Abstract | 4 | 6%, all `stretch` |

56 sets · 112 new Part 1 frames (56 Tier-1 personal + 56 topic frames) · 56 cue cards · 56 Part 3
cards · 168 model answers · 448 Part 1 per-question teaching notes.

Frame-B coverage: the seven area lists in §5.2–5.8 are disjoint and between them use **56 of the 57
Tier-2/Tier-3 areas in R2 §1.2** — every one of the 30 Tier-3 "curveball" areas is covered, which
closes R2 §4.4's largest gap. Only area 29 (keeping healthy) is left out, because the existing
`set_health_habits_001` already carries it.

---

## 6. Staging format and the merge contract

### 6.1 File location and shape

Each authoring agent writes **one** file:

```
content/core-en/staging/sets/<cluster-slug>.json
```

e.g. `content/core-en/staging/sets/c3-work-money.json`. The file is a single JSON object:

```jsonc
{
  "staging_version": 1,
  "cluster": "c3-work-money",           // must equal the filename stem
  "authored_by": "D4:c3-work-money",    // agent identifier
  "sets": [                             // EXACTLY 8 entries
    {
      "set":   { /* one card_sets.jsonl row, verbatim */ },
      "cards": [ /* exactly 4 speaking_cards.jsonl rows, verbatim: p1, p1, p2, p3 */ ]
    }
  ]
}
```

`TEMPLATE.json` is itself a valid staging file with one entry — copy its shape exactly.

**Row shape is the JSONL row, not a nested wrapper.** A `set` entry has exactly the keys
`id`, `title`, `topic_id`, `parts_json`, `payload_json`. A `cards` entry has exactly the keys
`id`, `part`, `card_set_id`, `topic_id`, `title`, `difficulty`, `tags_json`, `payload_json`.

### 6.2 The merge step (mechanical, no judgement)

```
for each file in staging/sets/*.json, sorted by filename:
    for each entry in file.sets:
        append json.dumps(entry.set,   ensure_ascii=False) + "\n"  ->  data/card_sets.jsonl
        for card in entry.cards:
            append json.dumps(card, ensure_ascii=False) + "\n"     ->  data/speaking_cards.jsonl
then: uv run --project sidecar python -m tools.content.build content/core-en
```

Nothing else. No transformation, no id rewriting, no defaulting. If a merge needs to *fix* anything,
the staging file is wrong and must be sent back.

### 6.3 Id naming convention — collision-proof by construction

```
set   :  set_<subject-slug>_<NNN>
part 1:  card_p1_<area-slug>_<NNN>
part 2:  card_p2_<subject-slug>_<NNN>
part 3:  card_p3_<theme-slug>_<NNN>
```

- `<NNN>` is the **set serial** from §5.2–5.8: cluster digit + set number, e.g. `304`.
  **All four cards in a set share their set's `<NNN>`.**
- Cluster blocks: c1 → `101`–`108`, c2 → `201`–`208`, … c7 → `701`–`708`. Template → `000`.
- The existing 12 sets all use `_001`, which is outside every block, so nothing collides.
- `<slug>` is lowercase ASCII, `[a-z0-9_]`, 2–4 words. Slugs may repeat across clusters; the serial
  keeps ids unique. They must **not** repeat within a cluster for the same part.

### 6.4 Lint rules the merge gate runs (write to pass these)

Structural:
1. `sets` has exactly 8 entries; each entry has exactly 4 cards with parts `[1,1,2,3]`.
2. `entry.set.payload_json.part1_card_ids` ∪ `{part2_card_id, part3_card_id}` == the set of the 4
   card ids, and every card's `card_set_id` == the set's `id`.
3. `card.payload_json.id == card.id`, `card.payload_json.part == card.part`,
   `card.payload_json.topic == card.title`.
4. Every id matches its cluster's serial block. No duplicate id anywhere in the pack.
5. Every `topic_id` exists in `data/topics.jsonl`.
6. `difficulty` ∈ {core, stretch}; Part 1 = core, Part 3 = stretch, Part 2 == set difficulty.
7. `cognitive_load` non-null iff `difficulty == "stretch"`.

Content shape:
8. `cue_card.bullets` length 4; `bullets[3]` starts with `and explain `; `rounding_off` length 2.
9. Part 1 `questions` length 4–6, all strings; `teaching.questions` same length, `q_index`
   contiguous from 0; angles within a frame all distinct; ≥1 of A5/A7/A9.
10. Part 3: 2–3 themes × exactly 3 string questions; per theme 3 distinct M-moves; card has ≥1 of
    M2/M6/M9; `question_notes` length == `questions` length with contiguous `q_index`.
11. `model_answers` length 3, `band_target` == `[6,7,8]`; per-band word counts, annotation counts
    and required kinds per §3.8.
12. **Every annotation `span` is an exact substring of its own transcript; every `swap_slots[].span`
    is an exact substring of the band-7 transcript.**
13. `time_plan` == the 5 fixed segments; `note_grid` 4 cells each ≤ 40 chars;
    `recovery_moves` 3–4 with `rung` ∈ 1–6.
14. Every `target_language` / `target_functions` value exists in the set's `language_bank.functions`.
15. `vocabulary` 8–12 items, ≤2 of type `word`, ≥2 `C1`, no duplicate `item` in the file.
16. All word/character limits in §1–§4 respected.
17. Cluster-wide: 6 core + 2 stretch sets; frame-A rotation 3/3/2; frame-B areas all distinct and
    matching the §5 assignment; ≥3 distinct `pronunciation_focus.priority` values with ≥2 Tier 1;
    at most one `th`.

Originality:
18. No 8-gram appears in more than one set in the file (catches an agent copy-pasting its own work).
19. No Part 2 subject from the §5.9 do-not-repeat list.

### 6.5 Post-merge, before hand-off

```
uv run --project sidecar python -m tools.content.build content/core-en
```

rewrites `manifest.counts` and `manifest.checksums`, then re-validates the whole pack with checksum
verification. Expected counts after the full merge: `card_sets` 68, `speaking_cards` 272.
**Nobody hand-edits `manifest.json`.**

---

## 7. Features, ranked by learner impact

Each feature names exactly which payload fields it consumes, so the content and the UI cannot drift.

### F1 — Compare (attempt-gated band ladder) · impact very high · cost M

**Consumes:** `p2.teaching.model_answers[]`, `swap_slots[]`, `transfer_drill`.

The single most important surface in the module. A `Compare` tab exists on every Part 2 card but is
**locked until the learner has recorded an attempt on that card**. The lock is the pedagogy, not a
paywall: a model shown before the attempt is a script to memorise, and memorised language is
precisely what the descriptors refuse to credit (R4 §2.1). Locked state shows the reason in one
line, plus a Record button.

Unlocked, the screen is two columns. Left: **Your answer** — the learner's transcript and their
audio. Right: **One way to say it**, with a three-position band selector (`6 · 7 · 8`) above it.
The right column swaps transcript as the selector moves; the left never changes. Between the columns,
a strip renders `what_lifts_it` for the selected band — three lines, each badged with its criterion
(FC / LR / GRA / PRON). On band 6 the strip renders `what_caps_it` instead, in the same three-line
shape. Default position is **7**.

Annotations are inline dots on the model text, coloured by criterion. Tapping one opens a popover:
`label` in bold, `why` beneath, criterion badge. `kind: "avoid"` dots (band 6 only) use a distinct
neutral marker — **no red anywhere** (R4 §7.2 rule 10).

A right rail, **Steal this**, lists every annotation with `transferable: true` as a chip carrying its
`label`; each chip has `Add to bank`, wired to the vocab suggestion inbox with `type` derived from
`kind` (`chunk`/`lexis` → collocation, `grammar` → phrase, `move` → not bankable, shown as
technique).

`swap_slots` spans render as visibly marked, differently-shaded regions in the model with their
`prompt` on hover. This is the anti-memorisation device — the learner must see that the specifics
are not theirs to keep.

Bottom of the screen: the `transfer_drill` with a 45-second timer and a record button. **The compare
screen is not finished until the learner has re-produced the moves with their own content.**

### F2 — Guided prep minute · impact high · cost M

**Consumes:** `p2.teaching.prep_plan`, `p2.cue_card.bullets`, `p2.teaching.time_plan`.

Replaces the plain notes textarea during `P2_PREP` with a 2×2 grid, one cell per bullet, each headed
by its bullet text and **hard-capped at 40 characters** with a visible counter. The cap enforces
"phrases, not sentences" structurally rather than advising it (R4 §3.1). `prep_plan.note_grid` is
available as a *"show me an example"* toggle — it fills the grid with the worked example, greyed, as
placeholder text only; typing clears it. It is never pre-filled.

A segmented ring countdown with two labelled marks: at **0:45** the banner flips from
`prep_plan.idea_prompt` to "Now note, don't write"; at **0:10** to "Read your grid once, top to
bottom". The grid persists on screen through `P2_LONG_TURN`, greyed but legible.

`time_plan` renders during the long turn as five segment ticks on the timer — no text, no
interruption, just a moving marker so the learner *feels* that bullet 4 gets 35 seconds.

`prep_plan.trap` is shown **after** the turn, never during, and only as a check: "Most people forget
the last bullet on this card — you covered it ✓".

We log `note_char_count` and `note_line_count` only. **Never the note content** (R4 §3.4).

### F3 — Recovery ladder, live · impact high · cost S–M

**Consumes:** `p2.teaching.recovery_moves`.

In Topic Drill and Single Part **only — never Full Mock**, a silent panel beside the timer headed
**Stuck? Climb one rung.** appears automatically after 4 seconds of silence past the 0:60 mark. It
renders this card's 3–4 `recovery_moves` as short lines, ordered by `rung`. No sound, no examiner
speech, no scoring penalty, no animation. Post-turn the report notes whether a rung was shown and
whether the turn reached 2:00.

Full Mock must not show it: exam fidelity is the whole reason Full Mock exists.

### F4 — Language bank · impact high · cost M

**Consumes:** `set.payload_json.language_bank`, `set.payload_json.vocabulary`,
`p2.teaching.target_language`, `p3.part3_themes[].target_functions`.

A per-set tab, always available (this is preparation material, not a model answer, so it is not
attempt-gated). Grouped by `function`, one accordion per function, ordered by how many cards in the
set target it. Each function shows: `why_here` as the subtitle, its 2–3 frames with the `___` slot
rendered as an actual input the learner can type into, `grammar` as a small badge — and the `avoid`
line beneath a divider labelled **Sounds canned**. The negative exemplar is not decoration; it is
what inoculates learners against the phrase lists that cause band-6 plateaus (R4 §4.3).

`language_bank.warning` sits at the top of the tab, always visible, never dismissible.

The vocabulary list renders as `item` · `cefr` badge · `meaning`, with `example` revealed on tap and
an `Add to bank` action mapping `type` onto the vocab SRS entry type. Chunk and collocation items
graduate into the SRS with **`use-in-sentence` and `speaking-drill` exercises only, never `flip`** —
a chunk is not learned until it has been spoken about the learner's own life (R4 §4.2 rule 4).

During a Topic Drill the bank is reachable in one tap **between** answers, never during one.

### F5 — One-Thing report headline · impact very high · cost S

**Consumes:** `p1.teaching.band_move`, `p2.teaching.band_move`, `p3.teaching.band_move`,
`error_watchlist[0]` of whichever card the session used.

The report opens on a single full-width card above everything else: **This week's one thing** — the
`band_move` for the card the learner performed worst on, one verbatim quote of the moment it failed,
the corrected version from `error_watchlist[0]`, and two buttons: `▷ Hear it` · `🎙 Say it now`. The
four criterion accordions, the error list and the vocabulary list all sit below the fold, collapsed.

Same evaluation JSON, different information architecture. Over a third of feedback interventions in
the literature make performance *worse*, and the mechanism is attention dispersal (R4 §1.1). Thirty-five
feedback items on one performance is that failure mode. Content is authored to be **rankable** — that
is what `band_move` and the ordering of `error_watchlist` are for.

### F6 — Listen-back noticing step · impact very high · cost S–M

**Consumes:** nothing new — existing per-turn audio and transcript.

Between the session end and the report: the learner's own audio with a waveform and their transcript,
and the prompt *"Before we score this — listen once and tap the part you'd change."* Tapping a span
opens a two-field mini-form: what's wrong (chip from `tense · word choice · article · too short ·
lost the thread`, or free text) and optionally how they'd fix it. Only then does the report load,
and it opens by acknowledging the overlap: *"You spotted 2 of the 3 things I found."*

Listed here despite needing no content because it is the highest evidence-per-build-hour item in the
module and it changes what F5 can say.

### F7 — Part 1 answer-shape overlay · impact medium-high · cost S–M

**Consumes:** `p1.teaching.questions[].answer_shape`, `extend_move`, `probe`, `common_error`.

During Part 1 Drill, a three-dot indicator beside the timer fills as the answer hits
● direct answer · ● reason · ● one detail. Post-answer, the coach references the shape and offers
`extend_move` as a *say-this-now* retry, and `probe` becomes the follow-up the coach actually asks.
`common_error` is checked against the transcript and surfaced only if it fired.

### F8 — Part 3 stance sparring · impact medium-high · cost M

**Consumes:** `p3.part3_themes[].counterpoint`, `counter_probe`, `concession_frame`,
`abstraction_ladder`.

Once per theme, after the learner's answer, the examiner delivers `counter_probe` verbatim. The
report then scores the specific Part 3 skill: **did the learner concede and then hold or revise, or
did they capitulate?** In Drill only, `concession_frame` is offered as a one-tap retry scaffold.

If the learner produces under 15 seconds on a question, the coach drops one rung down
`abstraction_ladder` — from `societal_abstract` to `local_general` to `concrete` — and asks again.
This is the single clearest way to teach that Part 3 feels harder *because it is harder*, in three
nameable dimensions (R4 §6.3).

### F9 — 4/3/2 cue-card cycle · impact high · cost M

**Consumes:** any Part 2 card. No new content.

Three consecutive takes on the same card at 2:00 / 1:30 / 1:00, no feedback between takes. After
take 3, one computed (not LLM-written) headline comparing wpm, long pauses and filled pauses across
the three. Best confidence-builder available, because within-session improvement is near-guaranteed.

### Explicitly not built

Model answers shown before an attempt · a phrase bank of "band 9 expressions" · real-time correction
during a long turn · band scores in Drill or Chat · daily-chain streaks with loss · a single global
band as the headline progress metric.

---

## 8. Authoring checklist — run this before you write the file

1. **Say every question aloud.** If it doesn't sound like a spoken examiner, rewrite it. Examiners
   use contractions and short forms. They do not write essay prompts.
2. Part 1: five questions, five different angles, opens easy and closes on light opinion, every one
   answerable in 2–4 sentences, no specialist knowledge required.
3. Part 2: three noun-phrase bullets plus `and explain …`, two short rounding-off questions. Never
   four plain bullets. Never a Part 3 question in `rounding_off`.
4. Part 3: two themes, three questions each, three different M-moves per theme, at least one of
   M2/M6/M9 on the card, and a `counterpoint` that is a *position*, not a fact.
5. Three model answers, same story, bands 6/7/8, every annotation span an exact substring, every
   personal specific inside a swap slot.
6. Teaching notes must be **actionable this week**. "Improve your cohesion" is not a note. "Link the
   contrast with `whereas` instead of `but`" is.
7. Everything rankable: `band_move` is the one thing; `error_watchlist[0]` is the top error. The
   coach persona gives exactly one improvement, so somebody has to decide which — that is you.
8. Teaching content **never surfaces during Full Mock or Single Part**. The examiner persona is
   forbidden from teaching. Write for the coach and the report.
9. Vary your own wording across the 8 sets. Eight identical `warning` strings or eight
   `examiner_note`s built from the same sentence is a tell that this was generated, not authored.
10. **Copyright self-check on every sentence before you commit it.** Did I read this somewhere? If
    there is any doubt, throw it away and write a different one on the same subject.

---

*IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge
University Press & Assessment. BandReady is not affiliated with, endorsed by, or approved by any of
them. No exam material is reproduced in this document or in `TEMPLATE.json`; all example wording is
original text authored for BandReady.*
