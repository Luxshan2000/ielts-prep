# Speaking content bank

What ships in `content/core-en`, what a teaching set contains, how to author one, how the
model-answer gate works, and how the Full Mock and the card-tied drills use both.

> BandReady is not affiliated with, endorsed by, or connected to IELTS, the British Council, IDP or
> Cambridge Assessment English. Every question, cue card, model answer and teaching note in this
> bank is original work written for BandReady. Nothing is reproduced from a past paper. The exam
> *format* and the *topic areas* that recur are facts about the test and are used as such; the
> official band descriptors are copyright text and are never quoted — the criteria are paraphrased.

---

## 1. What is in the bank

| | count |
|---|---|
| Card sets | **108**, every one carrying a full teaching payload |
| Speaking cards | **496** — 280 Part 1, 108 Part 2, 108 Part 3 |
| Part 1 frames | 280 (44 sets with 2, **64 sets with 3**), 1,450 questions, each with its own teaching note |
| Part 2 cue cards | 108, all subjects distinct |
| Part 3 themes / questions | 218 / 654 |
| Band-laddered model answers | **364** with 2,321 annotations — 88 cards at 6/7/8, **20 cards at 5/6/7/8/9** |
| `swap_slots` / `recovery_moves` / `error_watchlist` entries | 442 / 430 / 540 |
| Functional-language frames | 1,466 across 8 functions |
| Topic vocabulary items | 1,178 (912 distinct) |

Round 2 doubled the bank and closed the holes round 1 left. The twelve original `_001` sets used to
render as stripped cards in the Topic Coach; they now carry the same payload as everything else, so
**there is no longer a set in the pack without teaching material**.

### By cluster

| Cluster | id suffix | core | stretch | challenging |
|---|---|---|---|---|
| `people` | `1xx` | 6 | 2 | — |
| `places` | `2xx` | 6 | 2 | — |
| `work-study` | `3xx` | 6 | 2 | — |
| `tech-media` | `4xx` | 6 | 2 | — |
| `experience` | `5xx` | 6 | 2 | — |
| `society-env` | `7xx` | 6 | 2 | — |
| `culture-leisure` | `8xx` | 6 | 2 | — |
| `r2-backfill` (the 12 legacy sets) | `001` | 12 | — | — |
| `r2-object-media` | `r2om1`–`8` | 2 | 4 | 2 |
| `r2-person-abstract` | `r2pa*` / `901`–`908` | 2 | 4 | 2 |
| `r2-place-activity` | `r2pa1`–`8` | 2 | 4 | 2 |
| `r2-event-experience` | `r2ee1`–`8` | 2 | 4 | 2 |
| `r2-challenging` | `r2c01`–`08` | — | — | 8 |
| **total** | | **62** | **30** | **16** |

Round 1 used DESIGN §6.3's three-digit cluster serials; round-2 clusters key the suffix to the
cluster instead, because five agents authored in parallel and a shared numeric block would have
collided. The merge gate checks the same invariant either way: **every card in a set carries its
set's suffix**, and no id appears twice in the pack.

### The third difficulty tier

`speaking_cards.difficulty` is pinned to `core | stretch` by the row schema
(`SpeakingCardRow._difficulty`), so the third tier cannot live there without a migration. It lives
in the **set payload** instead, and a `challenging` set is a `stretch` row with a non-null
`cognitive_load` plus a tier marker. Round-2 authors wrote that marker under two different keys, so
the merge step mirrors them: after a merge every set payload carries **both** `difficulty_tier` and
`challenge_tier`, equal, one of `core | stretch | challenging`. Read either.

`GET /api/v1/speaking/cards` reports it as `difficulty_tier` alongside the row `difficulty`, so the
Topic Coach picker can badge a `challenging` set as one. That endpoint caps at `limit=200` and the
app asks for it — a limit below the bank size hides sets from the picker entirely, which reads as
content nobody wrote rather than as a paging bug.

### Part 2 subject families

| F1 person | F2 place | F3 object | F4 event | F5 experience | F6 activity | F7 media | F8 abstract |
|---|---|---|---|---|---|---|---|
| 12 | 14 | 9 | 12 | 24 | 13 | 10 | 14 |

F5 remains the heaviest family and F3 the thinnest — round 2 tripled F3 (3 → 9) but did not
level the distribution. That is the next content gap, not a bug.

### Part 1 frames

A real Part 1 runs **two to three topic frames**, and the first is always the candidate's own life —
work or study, and where they live. 64 of the 108 sets now open that way; the other 44 are round-1
sets with two frames, which the mock assembler compensates for by *borrowing* a personal frame from
another set rather than opening on a rehearsable topic.

Frame tiers across all 280 Part 1 cards: **110 Tier 1** (personal openers), 82 Tier 2, 88 Tier 3
(the "curveball" areas). Part 2 pronunciation focus rotates across twelve priorities, led by
`word_stress`, `consonant_clusters`, `final_consonants` and `sentence_stress` (13 sets each).

---

## 2. The teaching payload

`payload_json` is a free-form JSON blob on both `card_sets` and `speaking_cards` rows, so teaching
fields need no database migration. The row-level schemas in
`sidecar/bandready/content/validate.py` accept extra keys by design (`ConfigDict(extra="allow")`),
which is why merging the teaching bank required **no** validator change — including round 2's five
new clusters, the band 5/9 rungs and the third Part 1 frame.

The authoritative field-by-field spec, with every word and character limit, is
`content/core-en/staging/DESIGN.md` §1–§4. The summary below is the map, not the territory.

### Card set (`card_sets.jsonl` → `payload_json`, `schema_version: 2`)

```jsonc
{
  "schema_version": 2,
  "difficulty": "core" | "stretch",
  "tags": [...],
  "part1_card_ids": ["…", "…"], "part2_card_id": "…", "part3_card_id": "…",
  "cluster": "people",            // one of the seven above
  "family": "F1".."F8",           // Part 2 subject family (person, place, object, event, …)
  "cognitive_load": null | "…",   // non-null only on stretch sets
  "lineage":  "how Part 2 feeds Part 3",
  "teaches":  "the one transferable skill this set drills",
  "exam_note": "one fact about how the exam actually runs",
  "language_bank": {
    "warning": "these are shapes with holes in them, not scripts",
    "functions": [{ "function": "narrating" | "evaluating" | "comparing" | "hedging"
                                | "conceding" | "speculating" | "opinion" | "exemplifying",
                    "why_here": "…", "grammar": "…",
                    "frames": [{ "frame": "We go back to ___, when ___", "slot_hint": "…" }],
                    "avoid":  "the canned version of the same move" }]
  },
  "vocabulary": [{ "item": "…", "type": "chunk|collocation|phrasal_verb|idiom|word",
                   "cefr": "B1|B2|C1", "meaning": "…", "example": "…",
                   "used_in": "part1|part2|part3|any" }]   // 8–12, ≤2 of type "word", ≥2 C1
}
```

### Part 1 card

`questions` (4–6 strings) plus `teaching.questions`, one note per question in order:
`{ q_index, angle, answer_shape, extend_move, common_error: {wrong, right, why}, probe }`.
Card-level `teaching` carries `tense_focus` and `band_move`. `frame_tier` (1–3) and `frame_kind`
(`personal` | `topic`) say where the frame sits in the exam's opening.

### Part 2 card — the heart of the pack

`cue_card: { topic, bullets[4], rounding_off[2] }` is unchanged from v1, so every existing renderer
still works. Bullet 4 always starts `and explain `. `teaching` adds:

| field | what it is |
|---|---|
| `band_move` | the single thing that moves this card up a band |
| `prep_plan` | `idea_prompt` (how to choose in ten seconds), `note_grid` (4 worked note cells, ≤40 chars each, one per bullet), `trap` (shown **after** the turn only) |
| `time_plan` | the fixed 5-segment budget: 0–10 opening, 10–50 bullets 1–2, 50–80 bullet 3, 80–115 bullet 4, 115–120 landing |
| `recovery_moves` | 3–4 rungs (1–6) of "you have run dry at 70 seconds, do this" |
| `target_language` | function names, all of which must exist in the set's `language_bank` |
| `error_watchlist` | `{pattern, wrong, right, why, criterion}` |
| `pronunciation_focus` | `{priority, tier, why_here, target_words[], chunking_drill, minimal_pairs}` |
| `examiner_note`, `transfer_drill` | what the examiner is actually doing; the same moves on a fresh subject |
| `model_answers` | three answers at bands 6/7/8 — see below |
| `swap_slots` | 3–5 spans of the band-7 transcript the learner must replace with their own life |

`model_answers` is the feature the whole pack is built around. **Every rung tells the same story with
the same facts; only the language differs**, which isolates language from content.

Round 1 authored three rungs. Round 2 extended twenty cards to **five** — down to band 5, because a
candidate sitting below 6 had no rung to stand on, and up to band 9, because nobody could see what
the ceiling looks like. Both shapes are legal and nothing downstream may assume a count: the UI
builds its band selector from `model_answer_bands`, which is exactly the bands the card ships.

| | band 5 | band 6 | band 7 | band 8 | band 9 |
|---|---|---|---|---|---|
| cards | 20 | 108 | 108 | 108 | 20 |
| transcript words | 120–165 | 170–220 | 250–310 | 240–320 | 250–320 |
| annotations | 4–6 | 4–6 | 6–10 | 4–6 | 4–6 |
| required kinds | ≥3 `avoid`, ≥1 `move` | ≥3 `avoid`, ≥1 `move` | ≥3 `move`, ≥1 `grammar`, ≥1 `lexis` | ≥1 `grammar`, ≥1 `lexis` | ≥1 `grammar`, ≥1 `lexis` |
| `what_caps_it` | exactly 3, distinct criteria | exactly 3, distinct criteria | `[]` | `[]` | `[]` |
| `what_lifts_it` | `[]` | `[]` | exactly 3 (vs band 6) | exactly 3 (vs band 7) | exactly 3 (vs band 8) |

The band-5 answer is written to *dry up*: about 72 seconds spoken against the band-7 answer's 118,
so the learner sees the missing minute rather than being told about it.

A five-rung card also carries `teaching.ladder_note` — one sentence per step, naming the **single**
change a learner standing on that rung should make next:

```jsonc
"ladder_note": {
  "from_5_to_6": "Don't stop at seventy seconds. Add what you actually did on that trip …",
  "from_6_to_7": "Every fact about her life needs a sentence about what she is like …",
  "from_7_to_8": "Cut one explanation and put a judgement there instead …",
  "from_8_to_9": "Stop explaining your own good line. Deliver the observation and move on."
}
```

`ladder_note` is **not** gated. A model answer read before you speak is a script; "you stopped at
seventy seconds, add three details" is advice about the learner's own turn. The Model answers and
Compare screens both surface the note for the rung being viewed.

Annotation: `{ span, kind, criterion, label, why, transferable }` where `kind` ∈ `move` · `chunk` ·
`grammar` · `lexis` · `prosody` · `repair` · `swap` · `avoid`, and `criterion` ∈ `FC` · `LR` · `GRA`
· `PRON`. **Every `span` must be an exact, non-overlapping substring of its own transcript** — the
UI locates annotations by string search, so a near-miss silently disappears.

### Part 3 card

`part3_themes` — 2–3 themes, each `{ title, questions[3], question_notes[3], counterpoint,
counter_probe, concession_frame, target_functions[], abstraction_ladder }`. The
`abstraction_ladder` gives the same idea at three altitudes (`concrete` → `local_general` →
`societal_abstract`), which is how the examiner escalates. Card-level `teaching` carries
`band_move`, `bridge` (the examiner's spoken hand-off from Part 2) and `error_watchlist`.

---

## 3. Authoring a new set

Authoring never touches `data/*.jsonl` directly. You write **one staging file per cluster** and let
the merge tool do the mechanical part.

1. **Write** `content/core-en/staging/sets/<cluster>.json`. Copy the shape of
   `content/core-en/staging/TEMPLATE.json`, which is itself a valid one-set staging file:

   ```jsonc
   { "staging_version": 1,
     "cluster": "<must equal the filename stem>",
     "authored_by": "…",
     "sets": [ { "set": { /* one card_sets.jsonl row, verbatim */ },
                 "cards": [ /* p1, p1, p2, p3 — or p1, p1, p1, p2, p3 */ ] } ] }
   ```

   Ids are collision-proof by construction: `set_<subject>_<KEY>`, `card_p1_<area>_<KEY>`,
   `card_p2_<subject>_<KEY>`, `card_p3_<theme>_<KEY>`, where `<KEY>` is the cluster's serial block
   (round 1: `304`) or its cluster key (round 2: `r2c04`), and **every card shares its set's
   `<KEY>`**. Every `topic_id` must exist in `data/topics.jsonl`.

   **Three other staging shapes exist**, all detected from the document itself and all merged by
   the same command. Use them to change what already ships rather than re-authoring a set:

   | shape | detected by | what it does |
   |---|---|---|
   | new sets | a `sets` list | appends whole sets (the default) |
   | in-place updates | `"merge_mode": "update-in-place"` + a `sets` list | **replaces** rows whose ids already exist; the merge refuses if one does not |
   | model-answer updates | `"kind": "card_model_answer_updates"` | splices band 5 / band 9 and `ladder_note` onto existing Part 2 cards |
   | Part 1 frame additions | `"kind": "part1_frame_additions"` | appends new Part 1 cards **and** rewrites the parent set's `part1_card_ids` so nothing is orphaned |

   The last two are patches: they are applied to the *merged* row list, after the verbatim rows have
   been rebuilt from staging, so re-running replays them from a clean base instead of compounding.
   A frame patch asserts its `expect_before` and stops rather than overwrite a pointer list another
   file has changed.

2. **Lint** — structural rules only, no writes:

   ```
   uv run --project sidecar python -m tools.content.merge_speaking content/core-en --lint-only
   ```

   It checks the eight-set shape (four *or* five cards, parts `[1,1,2,3]` or `[1,1,1,2,3]`),
   card-pointer agreement, id suffixes and global uniqueness, the difficulty ladder and tier,
   cue-card shape, model-answer bands (`[6,7,8]` or `[5,6,7,8,9]`), **annotation spans against their
   own transcripts**, the fixed `time_plan`, note-grid character caps, recovery rungs,
   `target_language` resolving against the set's `language_bank`, and the vocabulary caps. Update
   files get their own rules: a ladder update must supply exactly bands 5 and 9 with a four-key
   `ladder_note` under 30 words a step; a frame addition must add exactly one card per set and every
   added card must be claimed by exactly one set.

3. **Merge** — appends the staged rows to the pack:

   ```
   uv run --project sidecar python -m tools.content.merge_speaking content/core-en
   ```

   Rows are copied verbatim; nothing is rewritten or defaulted. If a merge would need to *fix*
   something, the staging file is wrong. Two mechanical passes do run afterwards, and both are
   idempotent: the two tier keys are mirrored onto each other, and the cards are written **in the
   order their set points at them** — the API serves a set's cards `ORDER BY part`, so ties fall
   back to insertion order, and a frame prepended to `part1_card_ids` has to come first in the file
   or a practice session opens on the wrong frame.

   The whole run is **idempotent**: `--check` exits 0 immediately after a merge. Before writing,
   an integrity gate refuses the merge on any duplicate id, any set pointing at a card that does not
   exist, or any card whose set does not point back at it. A failing lint aborts the whole merge;
   `--allow-lint-failures` overrides that, and `--check` reports staleness without writing.
   `sidecar/tests/test_merge_speaking.py` covers all three modes and both idempotency claims.

4. **Rebuild the manifest** — never hand-edit `manifest.json`:

   ```
   uv run --project sidecar python -m tools.content.build content/core-en
   ```

   This rewrites `counts` and `checksums` and then re-validates the pack with checksum verification.
   `--check` is the CI form.

5. **Verify the pack imports** by booting a sidecar against a throwaway data dir:

   ```
   BANDREADY_DATA_DIR=/tmp/br BANDREADY_AUTH_TOKEN=dev uv run python -m bandready.cli serve
   ```

   The startup log line `imported content pack org.bandready.core-en …` carries the row counts.

---

## 4. How the model-answer gate works

Route: `GET /api/v1/speaking/coach/cards/{card_id}/teaching`.

Everything a learner can use **before** speaking is always returned: `band_move`, `tense_focus`,
`functional_language`, `vocabulary`, `structure_plan`, per-question notes, Part 3 themes,
`common_errors`, `examiner_note`, `transfer_drill`. A frame with an open slot is preparation
material, not a script.

Three fields are withheld until the learner has attempted the card:

```
model_answers · swap_slots · pronunciation_focus.chunking_drill
```

`model_answer_bands` is still returned (`[6, 7, 8]`, or `[5, 6, 7, 8, 9]` on an extended card) so
the UI can render a locked tab rather than an empty one, and the response always carries a `gate`
object:

```jsonc
"gate": { "unlocked": false, "reason": "not_attempted",
          "attempts": 0, "last_attempt_session_id": null,
          "gated_fields": ["model_answers", "swap_slots", "pronunciation_focus.chunking_drill"],
          "message": "Record an attempt on this card first. …" }
```

`reason` is one of:

- `attempted` — an attempt on this card exists in a **completed** session for the active profile.
  A live session does not count: the gate must not open mid-turn.
- `client_attested` — the caller passed `?attempted=true`, the renderer attesting that the learner
  has just recorded an attempt this sidecar has not finalised yet.
- `not_attempted` — locked.
- `exam_conditions` — a Full Mock is in progress. See §5; this one is not openable by attesting.

The reason for the gate is pedagogical, not technical: a model answer read before you speak becomes
a script to memorise, and memorised language is exactly what the descriptors decline to credit.

`POST /api/v1/speaking/coach/compare` is the payoff. It sends the learner's own transcript and the
card's authored teaching payload to the configured LLM and returns a per-criterion comparison
(`FC`/`LR`/`GRA`/`PRON`, each with `model_does` / `you_did` / `try_this`), the frames from this
set's language bank the learner did **not** use, and up to three next actions. If the LLM is
unreachable it falls back to the authored comparison from the card itself — `_meta.grounded` stays
`true` and `_meta.model_id` is `null`, so the learner still gets the card's own `what_lifts_it`
points, just without the personalised `you_did` line.

`compare` accepts any band in `5, 6, 7, 8, 9`; a card that does not carry that rung refuses with a
422 naming the bands it does have, rather than comparing against a neighbouring band silently.

These routes are the *coach's*. The examiner never touches them: teaching content must not surface
during a Full Mock, and none of it is reachable from the session event stream.

---

## 5. The Full Mock

Practice is stop-and-look-things-up. A mock is one unbroken **11–14 minutes** in which nobody helps
you, the long turn is cut at two minutes whether or not you were finished, and one band comes out at
the end for the whole test — which is how the real thing is rated.

### Assembly

`POST /api/v1/speaking/mock/sessions` builds a coherent sitting rather than three unrelated cards.
Coherent means the Part 3 themes descend from the Part 2 card that was set, never from a card picked
at random. Part 1 is the deliberate exception: a real interview opens on the candidate's own life,
so the first frame is a **personal** one even when it has to be borrowed from another set — which is
what the 44 two-frame round-1 sets rely on.

| body field | |
|---|---|
| `seed` | reproducibility — the same seed assembles the same sitting on any machine |
| `card_set_id` | sit a specific set; unset, least-recently-served picks one |
| `difficulty` | `core` \| `stretch` \| `challenging` (reads the set payload's tier) |
| `frames` | 2 or 3 Part 1 frames; 3 is the default and the researched norm |
| `live` | also register the WebRTC session, so `/sessions/{id}/offer` drives this sitting |

`GET /mock/plan` previews an assembly without opening anything.

### Stages and the clock

Eleven stages, nominal total **790 s** — inside the 660–840 s window, which `assemble` refuses to
hand out a plan outside of.

| stage | part | budget | hard cap |
|---|---|---|---|
| `p1_intro` | 1 | 25 s | |
| `p1_frame_1..3` | 1 | ~82 s each | |
| `p2_intro` | 2 | 25 s | |
| `p2_prep` | 2 | 60 s | **60 s, exactly** |
| `p2_long_turn` | 2 | 105 s | **120 s**, mid-sentence if necessary |
| `p2_rounding` | 2 | 40 s | skipped if the long turn reached 115 s |
| `p3_theme_1..2` | 3 | 135 s each | |
| `wrap_up` | — | 20 s | |

Only two of those are enforced against the candidate. The rest are soft budgets the examiner
manages, exactly as in the real test. `POST …/advance` closes a stage and opens the next; the client
sends the `elapsed_s` it measured, because it owns the audio clock.

### Exam conditions — the rule that makes the band mean anything

While a sitting is `in_progress`, the coach is **shut for the whole sidecar**, not merely hidden on
one screen. `GET /mock/exam-conditions` says so, and names what is withheld:

```
model_answers · swap_slots · band_move · prep_plan · structure_plan
language_bank · vocabulary · error_watchlist · pronunciation_focus · compare
```

The teaching route still answers 200, with those fields empty and `gate.reason = "exam_conditions"`;
the plan, language-bank, vocabulary and drill routes answer **409**. This matters because the app's
sidebar is still on screen during a sitting — hiding the affordance is not enough, so the server
refuses. `POST /mock/sessions/{id}/score` and `POST …/abandon` both close the sitting and reopen the
coach, and a sitting left open goes stale after **3 hours** so a closed laptop never bricks the
teaching layer overnight.

> The UI must therefore open its sitting through `POST /mock/sessions`, not the ordinary
> `POST /speaking/sessions`. Opening it the plain way produces a "mock" with the entire teaching
> layer one sidebar click away. `mock/__tests__/noCoaching.test.ts` asserts this against the source.

### Scoring

`POST /mock/sessions/{id}/score` finalises the sitting and returns one band for the whole test —
the mean of the criterion bands through `round_ielts`, recomputed server-side so no client ever
decides it — plus evidence attributed to the part it was spoken in, a measured part breakdown, and
next actions naming the cards that were actually sat. `GET /mock/sessions` is the history and the
band trajectory.

The part breakdown reports a **strength index**, not a per-part band: pace, silence, filled pauses,
lexical variety, errors anchored to that part, and how much was produced. IELTS does not score parts
separately and neither does this.

---

## 6. Card-tied drills

`GET /api/v1/speaking/drills/cards/{card_id}` turns a card's own teaching payload into practice —
no new content, no generic exercise bank. Four kinds, 120 s for a full set:

| kind | s | graded by | gated | trains |
|---|---|---|---|---|
| `shadowing` | 15 | `stt_alignment` | **yes** | rhythm, thought groups, sentence stress |
| `minimal_pair` | 8 | `stt_contains` | no | the contrast this card's vocabulary keeps stumbling on |
| `error_repair` | 12 | `stt_repair` | no | the grammar or lexis pattern this topic provokes |
| `extend` | 30 | `stt_fluency` | no | not stopping — the commonest self-inflicted band loss |

Shadowing is gated with the model answers, because its sentence is lifted from one. The other three
are built from `error_watchlist`, `pronunciation_focus.minimal_pairs` and the set's language bank,
none of which is model wording, so they are available before the first attempt.

`POST /drills/attempts` grades one attempt (a WAV through local Whisper, or a transcript);
`POST /drills/audio` renders the reference audio through Kokoro into the media cache;
`GET /drills/history` reports per-kind accuracy. `GET /drills/kinds` is self-describing and carries
the accent notice: **IELTS accepts every accent** — these scores measure how clearly each sound
comes across, not how British or American you sound.

13 of the 108 Part 2 cards produce no minimal-pair item, because their authored
`pronunciation_focus` is prosodic and ships no `minimal_pairs` array. The response says so rather
than silently offering three drills instead of four.

---

## 7. Known gaps

Written down rather than discovered later.

- **Two stage machines run a sitting.** The examiner's script is driven by
  `voice/state_machine.py` (registered with the mock's assembled bundle, so the *content* is
  right), while `mock.advance()` — the cursor, the per-stage log and therefore
  `sitting.timing` on the report — is never called by the app. A sitting scores correctly but
  its timing report shows one open stage. Wiring `advance` to the runtime's phase transitions
  is the fix.
- **The mock report derives its part breakdown in the browser.** `mock/analysis.ts` computes a
  relative signal from the transcript; the server now returns a measured `part_breakdown` from
  `POST /mock/sessions/{id}/score`. The screen should defer to the server's.
- **Exam conditions are installed by monkey-patch.** `mock.install_exam_conditions_guards()`
  wraps six `coach` functions at startup. It is idempotent and covered by tests, but the right
  home is two lines inside `coach.gate_state`.
- **`speaking_mocks` is created by `CREATE TABLE IF NOT EXISTS`,** not by an alembic revision.
  Adopt it into a migration the next time the schema moves.
- **`content/core-en/staging/DESIGN.md` is round 1's contract and is now behind the pack** in
  three places: §1 says `part1_card_ids` is exactly 2 (64 sets carry 3), §6.4/1 expects 4 cards
  per set (40 sets have 5), and §3.8 lints `model_answers` to exactly `[6,7,8]` (20 cards carry
  five rungs). `tools/content/merge_speaking.py` is the enforced contract; DESIGN.md should be
  amended to match it.
- **Family balance is still uneven** — F5 24, F3 9. See §1.
- **44 sets still open on two Part 1 frames.** The mock borrows a personal frame for those; the
  Topic Coach shows them as authored.
