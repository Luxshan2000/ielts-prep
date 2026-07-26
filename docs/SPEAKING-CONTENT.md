# Speaking content bank

What ships in `content/core-en`, what a teaching set contains, how to author one, and how the
model-answer gate works.

> BandReady is not affiliated with, endorsed by, or connected to IELTS, the British Council, IDP or
> Cambridge Assessment English. Every question, cue card, model answer and teaching note in this
> bank is original work written for BandReady. Nothing is reproduced from a past paper. The exam
> *format* and the *topic areas* that recur are facts about the test and are used as such; the
> official band descriptors are copyright text and are never quoted — the criteria are paraphrased.

---

## 1. What is in the bank

| | count |
|---|---|
| Card sets | **68** — 12 legacy (`schema_version: 1`) + 56 teaching sets (`schema_version: 2`) |
| Speaking cards | **272** — 136 Part 1, 68 Part 2, 68 Part 3 |
| Part 1 questions (teaching sets) | 560, each with its own teaching note |
| Part 2 cue cards (teaching sets) | 56, all subjects distinct |
| Part 3 themes / questions | 112 / 336 |
| Band-laddered model answers | 168 (3 per Part 2 card) with 1,080 annotations |
| `swap_slots` / `recovery_moves` / `error_watchlist` entries | 226 / 223 / 280 |
| Functional-language frames | 705 across 8 functions |
| Topic vocabulary items | 591 (516 distinct) |

### By cluster (teaching sets only)

| Cluster | id block | core | stretch | topics covered |
|---|---|---|---|---|
| `people` | 1xx | 6 | 2 | communication, culture, family |
| `places` | 2xx | 6 | 2 | environment, family, housing, tourism, urbanisation |
| `work-study` | 3xx | 6 | 2 | education, work |
| `tech-media` | 4xx | 6 | 2 | communication, education, media, technology |
| `experience` | 5xx | 6 | 2 | communication, education, family, transport, work |
| `society-env` | 7xx | 6 | 2 | culture, environment, family, housing, money, urbanisation |
| `culture-leisure` | 8xx | 6 | 2 | culture, education, food, sport |

The 12 legacy sets all use serial `_001`, outside every cluster block, so nothing collides. Within
a set: both Part 1 cards are `core`, the Part 3 card is always `stretch`, and the Part 2 card
carries the set's difficulty. `payload_json.cognitive_load` is non-null **iff** the set is `stretch`.

Part 1 frame tiers across the teaching sets: 56 Tier 1 (personal openers — home town, work/study),
26 Tier 2 and 30 Tier 3 (the "curveball" areas that trip candidates up). Part 2 pronunciation focus
rotates across nine priorities (`word_stress`, `intonation`, `consonant_clusters`,
`final_consonants`, `sentence_stress`, `s_endings`, `chunking`, `weak_forms`, `ed_endings`).

---

## 2. The teaching payload

`payload_json` is a free-form JSON blob on both `card_sets` and `speaking_cards` rows, so teaching
fields need no database migration. The row-level schemas in
`sidecar/bandready/content/validate.py` accept extra keys by design (`ConfigDict(extra="allow")`),
which is why merging the teaching bank required **no** validator change.

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

`model_answers` is the feature the whole pack is built around. **All three tell the same story with
the same facts; only the language differs**, which isolates language from content. Per band:

| | band 6 | band 7 | band 8 |
|---|---|---|---|
| transcript words | 170–220 | 250–310 | 240–320 |
| annotations | 4–6 | 6–10 | 4–6 |
| required kinds | ≥3 `avoid`, ≥1 `move` | ≥3 `move`, ≥1 `grammar`, ≥1 `lexis` | ≥1 `grammar`, ≥1 `lexis` |
| `what_caps_it` | exactly 3, distinct criteria | `[]` | `[]` |
| `what_lifts_it` | `[]` | exactly 3 (vs band 6) | exactly 3 (vs band 7) |

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
                 "cards": [ /* four speaking_cards.jsonl rows: p1, p1, p2, p3 */ ] } ] }
   ```

   Ids are collision-proof by construction: `set_<subject>_<NNN>`, `card_p1_<area>_<NNN>`,
   `card_p2_<subject>_<NNN>`, `card_p3_<theme>_<NNN>`, where `<NNN>` is the cluster digit plus the
   set number and **all four cards share their set's `<NNN>`**. Every `topic_id` must exist in
   `data/topics.jsonl`.

2. **Lint** — structural rules only, no writes:

   ```
   uv run --project sidecar python -m tools.content.merge_speaking content/core-en --lint-only
   ```

   It checks the eight-set/four-card shape, card-pointer agreement, id serials and global
   uniqueness, the difficulty ladder, cue-card shape, model-answer bands, **annotation spans against
   their own transcripts**, the fixed `time_plan`, note-grid character caps, recovery rungs,
   `target_language` resolving against the set's `language_bank`, and the vocabulary caps.

3. **Merge** — appends the staged rows to the pack:

   ```
   uv run --project sidecar python -m tools.content.merge_speaking content/core-en
   ```

   The merge is mechanical: rows are copied verbatim, nothing is rewritten or defaulted. If a merge
   would need to *fix* something, the staging file is wrong. It is **idempotent** — rows already in
   the pack whose id appears in staging are replaced, everything else (the 12 pre-staging sets) is
   preserved in its original order and stays first in the file. A failing lint aborts the whole
   merge; `--allow-lint-failures` overrides that, and `--check` reports staleness without writing.

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

`model_answer_bands` is still returned (`[6, 7, 8]`) so the UI can render a locked tab rather than
an empty one, and the response always carries a `gate` object:

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

The reason for the gate is pedagogical, not technical: a model answer read before you speak becomes
a script to memorise, and memorised language is exactly what the descriptors decline to credit.

`POST /api/v1/speaking/coach/compare` is the payoff. It sends the learner's own transcript and the
card's authored teaching payload to the configured LLM and returns a per-criterion comparison
(`FC`/`LR`/`GRA`/`PRON`, each with `model_does` / `you_did` / `try_this`), the frames from this
set's language bank the learner did **not** use, and up to three next actions. If the LLM is
unreachable it falls back to the authored comparison from the card itself — `_meta.grounded` stays
`true` and `_meta.model_id` is `null`, so the learner still gets the card's own `what_lifts_it`
points, just without the personalised `you_did` line.

These routes are the *coach's*. The examiner never touches them: teaching content must not surface
during a Full Mock, and none of it is reachable from the session event stream.
