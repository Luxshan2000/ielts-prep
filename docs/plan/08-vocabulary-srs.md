# 08 — Vocabulary & Spaced Repetition

Status: draft v2 (2026-07-25)

BandReady's vocabulary bank is *dynamic*: words and phrases flow in from every module (speaking
evaluations, writing feedback, reading lookups, listening misses) into a consent-gated
**suggestion inbox** — nothing is scheduled without learner acceptance (R2-5) — plus curated
seed decks, each entry carrying the sentence the learner actually met it in. An offline WordNet
dictionary serves instant lookups (§3.4, R2-20). Scheduling uses
**FSRS** (via the open-source `py-fsrs` package, desired retention 0.9) rather than SM-2. Reviews
go beyond flip-cards: cloze from the learner's own context sentence, LLM-checked
use-it-in-a-sentence, collocation matching, Kokoro audio-recall dictation, and live speaking
drills. At launch we ship ~2,000 curated entries (20 IELTS topic packs, Academic Word List
coverage, less-common-lexis upgrade pairs) authored per 15-content-authoring-licensing.md. Daily
review volume is governed by the curriculum planner (10-curriculum-progress.md): default 10 new
cards/day, 120-review daily cap. All tables below are owned by 11-data-model.md; this doc is the
functional source of truth for them.

## 1. Dynamic vocabulary bank — inflow sources

Every entry records where it came from. Module-sourced ingestion goes through one sidecar
endpoint — `POST /api/v1/vocab/suggestions` (§3.2; routes per 18-api-contract.md §4.11) — and
lands in the suggestion inbox (`status='suggested'`, not yet scheduled, R2-5). Manual adds use
`POST /api/v1/vocab/entries`:

| Source module | Trigger | What gets sent |
|---|---|---|
| `speaking` | Speaking evaluation returns `vocab_to_bank[]` (see 04-speaking-module.md) — words the examiner-LLM suggests the learner should have used, or misused | word, suggested definition, the learner's transcript sentence as `own_context_sentence` |
| `writing` | Writing feedback returns `vocab_upgrades[]` (see 05-writing-module.md), e.g. `{"used": "good", "upgrade": "beneficial"}` | upgrade word; learner's original sentence with the weak word as context |
| `reading` | Learner double-clicks a word in a passage (06-reading-module.md) → lookup popover → "Add to bank" | word, passage sentence as context, passage topic tag |
| `listening` | Post-exercise review marks words the learner transcribed wrongly or flagged (07-listening-module.md) | word, the audio-script sentence as context, `audio_ref` reuse |
| `pronunciation` | "Add to bank" on a pronunciation report's worst-words list (09-pronunciation-assessment.md; enum per 11 §6) | word, the learner's transcript sentence as context |
| `seed` | Curated seed decks opted in from content packs (§6) | full pre-authored entry |
| `manual` | Learner types a word into the bank UI; enrichment fills in the card (§3.2) | word only |

Design rule: **modules never write vocab tables directly** — they call the suggestions endpoint,
which owns dedup/lemmatization (§3) and enrichment. This keeps merge policy in one place — and
nothing a module sends enters the SRS without learner acceptance (R2-5).

## 2. Card schema

Canonical JSON shape (returned by the API; the DB columns behind it are 11-data-model.md §6's —
JSON arrays are stored as TEXT `*_json` columns there and returned unsuffixed here):

```json
{
  "id": "ve_01J8G3D9V2N5QW8XKZ4T2P6R7M",
  "headword": "mitigate",
  "lemma": "mitigate",
  "is_phrase": false,
  "ipa": "/ˈmɪtɪɡeɪt/",
  "pos": "verb",
  "definition": "to make something less harmful, serious, or severe",
  "own_context_sentence": "Governments must act now to mitigate the effects of climate change.",
  "example_sentences": [
    "Planting trees can mitigate urban heat.",
    "The company took steps to mitigate the risk of data loss."
  ],
  "collocations": ["mitigate the effects of", "mitigate risk", "mitigate climate change"],
  "topic_tags": ["environment"],
  "cefr_level": "C1",
  "source": { "module": "reading", "session_id": "rd_01J8G3CX7K2M9Q4T6W8Y0Z2B4D", "detail": "passage:env-04" },
  "audio_ref": "media/vocab/ve_01J8G3D9V2N5QW8XKZ4T2P6R7M.wav",
  "status": "active",
  "srs": {
    "state": "review", "stability": 14.2, "difficulty": 5.1,
    "due": "2026-08-03T09:00:00Z", "reps": 6, "lapses": 1,
    "retrievability": 0.93
  }
}
```

Field notes:
- `id` — TEXT ULID with `ve_` prefix (11 §1). Entries are profile-scoped (`profile_id`, 11 §6);
  the API always operates on the active profile (`settings.active_profile_id`, R2-5).
- `headword` — display form as the learner met it (may be inflected: "mitigating"); `lemma` is the
  dedup key (§3).
- `own_context_sentence` — **the** signature feature: the sentence the learner actually
  encountered/produced. Drives the cloze exercise. Seed-pack entries ship a neutral example here
  which is *replaced* the first time the learner meets the word organically (§3.3).
- `pos` — one of `noun|verb|adj|adv|prep|phrase|collocation|other`. Phrases ("in terms of",
  "a double-edged sword") set `is_phrase=1`, `pos='phrase'`.
- `cefr_level` — `A1..C2`; used for filtering and for the writing module's "less common lexis"
  suggestions (band 7+ descriptor).
- `audio_ref` — relative path under `media/vocab/` in the data dir (canonical tree, 11 §9 per
  R2-18); Kokoro-generated lazily (§5.3).
- `status` — `suggested | active | suspended | known` (unified enum, R2-5). `suggested` =
  module-sourced, waiting in the inbox, **not scheduled** (no `srs_cards` row, so the `srs`
  block above is absent). "Mark as known" removes the card from scheduling without deleting the
  entry (it still suppresses re-ingestion of the same lemma).
- Multiple sources accumulate in `vocab_sources` rows; the JSON `source` field shows the first.

### Canonical tables (DDL owned by 11-data-model.md §6)

The full DDL for the four vocab tables — `vocab_entries`, `vocab_sources`, `srs_cards`,
`srs_review_logs` — plus the `vocab_fts` FTS5 search table lives in **11-data-model.md §6** and
is not duplicated here (R2-5; this doc remains the functional source of truth). Facts this doc
relies on:

- **TEXT ULID PKs** with type prefixes (`ve_`, `vs_`, `sc_`, `rl_`); `vocab_entries.profile_id`
  scopes the bank per profile — children inherit through their FKs.
- **Dedup key**: `UNIQUE (profile_id, lemma, pos)` on `vocab_entries` (§3.1).
- **Status enum**: `suggested | active | suspended | known`, default `'suggested'` (R2-5).
- JSON-array columns carry the `_json` suffix in the DB (`example_sentences_json`,
  `collocations_json`, `topic_tags_json`); the API returns them unsuffixed as in §2's shape.
- `srs_cards`: **one row per scheduled entry only** — suggested entries have none until accepted
  (§3.2). Mirrored FSRS columns (`state`, `step`, `stability`, `difficulty`, `due_at`,
  `last_review_at`, `reps`, `lapses`) serve the hot due-queue query; `fsrs_json` keeps the
  verbatim py-fsrs `Card.to_dict()` for forward compatibility.
- `srs_review_logs`: append-only — the input for future FSRS parameter optimization (§4.4) and
  for all stats (§8). The DB column is **`review_type`** (canonical name per R2-5; the API wire
  field stays `exercise_type`, 18-api-contract.md §4.11), CHECKed to exactly this doc's six
  exercise types: `flip | cloze | use_in_sentence | collocation | audio_recall | speaking_drill`.

## 3. Ingestion, dedup, and lemmatization

### 3.1 Lemma key policy

- **Single words**: lemmatize with `simplemma` (pure-Python, dictionary-based, no model download —
  chosen as default over spaCy to keep the PyInstaller sidecar small; see 13-packaging-distribution.md).
  `lemma = simplemma.lemmatize(word.lower(), lang="en")`. POS is taken from the ingest payload if
  provided, else inferred by the enrichment LLM call (§3.2).
- **Phrases** (`is_phrase=1`): normalize = lowercase, trim, collapse whitespace, strip terminal
  punctuation. No per-token lemmatization ("raining cats and dogs" stays as-is).
- Dedup key is `(profile_id, lemma, pos)` (R2-5) — so "book (noun)" and "book (verb)" are
  distinct cards within a profile. Default: if POS is unknown at ingest and a single entry with
  that lemma exists, merge into it; if ambiguous (two POS entries exist), the enrichment call
  decides using `own_context_sentence`.

### 3.2 Ingest flows (`POST /api/v1/vocab/suggestions` + `POST /api/v1/vocab/entries` — 18 §4.11)

**Module-sourced ingest lands in a suggestion inbox (R2-5 — 04 §8 / 05 §10 win).** Modules call
`POST /api/v1/vocab/suggestions` (batch:
`{items: [{term, sentence_context?, source: {kind, item_id}}]}`):

```
each item → normalize + lemmatize (§3.1)
  → SELECT by (profile_id, lemma, pos)
  ├─ exists → MERGE (§3.3), append vocab_sources row, return {merged: true, id}
  │           (scheduling untouched; status changes only via the §3.3 known-misuse flip)
  └─ new    → INSERT vocab_entries with status='suggested' and NO srs_cards row;
              definition filled instantly from the offline WordNet dictionary (§3.4) when the
              word is found, else '(pending)'; append vocab_sources row; return {merged: false, id}
```

Nothing enters the SRS silently. The inbox (`GET /api/v1/vocab/suggestions`) shows pending
suggestions with their context sentences; **accept**
(`POST /api/v1/vocab/suggestions/{id}/accept`) flips `status='active'`, creates the `srs_cards`
row (`state=0` new, `due_at=now`), and queues async LLM enrichment (below); **dismiss**
(`POST /api/v1/vocab/suggestions/{id}/dismiss`) deletes the entry (its `vocab_sources` rows
cascade; the same `(lemma, pos)` may be re-suggested later).

**Manual adds schedule immediately.** `POST /api/v1/vocab/entries` (the learner typed a word into
the bank UI, or pressed "Add" in the reading popover) runs the same normalize/dedup/merge, but a
new entry is inserted `status='active'` **with** its `srs_cards` row (`due_at=now`) — the
explicit learner action is the consent. Accepted seed-deck opt-ins (§6.2) are the only other
immediate-schedule path (R2-5).

**LLM enrichment is an async, optional upgrade on accepted entries (R2-20).** When an entry is
accepted or manually added and fields are missing (ipa/pos/definition/examples/collocations/cefr),
the sidecar queues ONE enrichment LLM call (JSON mode) to fill them. It never blocks scheduling
or reviews — the WordNet definition (§3.4) keeps the card usable meanwhile.

Enrichment prompt (verbatim; sent as the single user message, `response_format: json_object`,
temperature 0.2, uses the configured LLM from 03-providers-and-settings.md):

```
You are a lexicographer preparing an English vocabulary card for an IELTS learner.
Word or phrase: "{{word}}"
Context sentence (may be empty): "{{context_sentence}}"

Return ONLY a JSON object:
{
  "ipa": "IPA transcription of the headword, no slashes",
  "pos": "noun|verb|adj|adv|prep|phrase|collocation|other",
  "definition": "one clear learner-friendly definition matching the context sense, max 20 words",
  "example_sentences": ["2 natural example sentences at IELTS band 7 level"],
  "collocations": ["3-5 common collocations containing the headword"],
  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "topic_tags": ["0-2 tags from: environment, education, technology, health, globalisation,
    work-careers, travel-tourism, media-advertising, crime-law, family-relationships,
    art-culture, science-research, urbanisation-housing, transport, food-diet, sport-fitness,
    money-economy, government-society, language-communication, nature-animals"]
}
If the input is not a real English word or phrase, return {"error": "not_a_word"}.
```

Enrichment is offline-tolerant: if the LLM call fails, the entry keeps its WordNet definition
(or `'(pending)'` if the word is not in WordNet either) and a background retry queue fills it in
(default: retry on next app launch).

### 3.3 Merge rules (same lemma arrives again)

- Append a new `vocab_sources` row always (full provenance history).
- `topic_tags` = set union.
- `own_context_sentence`: a **learner-origin** sentence always replaces a **seed-origin** one
  (`own_context_origin` flips to `learner`); a second learner sentence does NOT replace the first
  (default — the first genuine encounter is the memory hook) but is appended to
  `example_sentences` if not already present.
- `example_sentences` / `collocations`: union, capped at 6 / 8 items.
- SRS state is untouched — re-encountering a word never resets scheduling. Exception (default):
  if `status='known'` and the word arrives from `speaking` or `writing` *as an error* (the learner
  misused it), status flips back to `active` and the card is rescheduled `due_at=now` (this
  known→active misuse flip stands per R2-5).

### 3.4 Offline dictionary (WordNet — owns G7, per R2-20)

The instant-lookup path is a **bundled WordNet**, not the LLM:

- **Asset**: the `wn` Python package plus the **English WordNet 2023** database (~35 MB,
  permissive license). Shipped with the sidecar so lookups work fully offline from first run —
  13-packaging-distribution.md owns how the data file rides in the installer (no first-run
  download; flagged as the default).
- **Route**: `GET /api/v1/dictionary/{word}` (18-api-contract.md §4.6) →
  `{word, lemma, found, senses: [{pos, definition, examples[], synonyms[]}]}`. No LLM call,
  target < 50 ms — this is what the reading double-click popover renders instantly
  (06-reading-module.md references it) and what fills `definition` at suggestion time (§3.2).
- **Lookup**: lemmatize with `simplemma` (same §3.1 policy), then `wn` synset lookup on the
  lemma; senses returned in WordNet sense order. `found=false` for out-of-vocabulary items
  (mostly phrases) — the popover then offers the LLM preview (`POST /api/v1/vocab/lookup`, §9)
  as an online fallback.
- **Division of labor**: WordNet supplies instant, generic, offline definitions; the LLM
  enrichment call (§3.2) is the optional **async upgrade on accepted entries** —
  context-matched learner-friendly definition, IPA, collocations, CEFR level — and overwrites
  the WordNet placeholder when it succeeds.

## 4. SRS algorithm — DECISION: FSRS via `py-fsrs`

**Decision: FSRS (Free Spaced Repetition Scheduler), not SM-2.** Rationale, briefly:
- FSRS models memory with three components (Difficulty, Stability, Retrievability) and schedules
  each card to hit a target recall probability; SM-2's ease-factor heuristic over/under-schedules
  and suffers "ease hell" after lapses.
- FSRS is the modern open standard (Anki's built-in scheduler since 23.10), with a maintained
  MIT-licensed Python implementation — `fsrs` on PyPI (open-spaced-repetition/py-fsrs) — so we
  write zero scheduling math ourselves.
- Its parameters are optimizable from the learner's own `srs_review_logs`, giving us a free
  personalization lever later (§4.4).

### 4.1 Configuration (defaults)

```python
from fsrs import Scheduler, Card, Rating

scheduler = Scheduler(
    desired_retention=0.9,               # DEFAULT retention target (settable 0.80–0.95 in UI)
    learning_steps=("1m", "10m"),        # py-fsrs defaults
    relearning_steps=("10m",),
    maximum_interval=365,                # cap at 1 year (default; py-fsrs default 36500 is too long
                                         #   for an exam-prep app with a bounded timeline)
    enable_fuzzing=True,
)
```

Pin `fsrs>=5,<6` in `pyproject.toml` (voice/scoring sidecar package). The `Scheduler` is stateless
per call; instantiate once at app startup with the learner's stored parameters.

### 4.2 State fields

Per card (mirrored into `srs_cards` columns, verbatim blob in `fsrs_json`):

| Field | Meaning |
|---|---|
| `state` | 0 New (never reviewed), 1 Learning, 2 Review (graduated), 3 Relearning (after lapse) |
| `step` | position within learning/relearning steps |
| `stability` | days until recall probability decays to 90% |
| `difficulty` | 1–10 intrinsic difficulty; drifts per rating |
| `due_at` | next review timestamp (UTC) |
| `reps` | total reviews (our counter, incremented on every rating) |
| `lapses` | count of `Again` ratings while in Review state |

### 4.3 Rating flow

Every exercise resolves to one of the four FSRS ratings — the learner presses a button for
flip-cards; for auto-checked exercises the app maps the outcome (§5 table):

`Again (1)` failed · `Hard (2)` recalled with strain/partial · `Good (3)` recalled ·
`Easy (4)` instant, effortless.

Review transaction (sidecar, single SQLAlchemy session):

```python
card = Card.from_dict(json.loads(row.fsrs_json))
card, log = scheduler.review_card(card, Rating(rating), review_datetime=now_utc)
row.fsrs_json = json.dumps(card.to_dict())
row.state, row.step = card.state, card.step
row.stability, row.difficulty = card.stability, card.difficulty
row.due_at, row.last_review_at = card.due.isoformat(), now_utc.isoformat()
row.reps += 1
if rating == 1 and state_before == 2: row.lapses += 1
session.add(SrsReviewLog(...))          # append-only
```

UI shows the projected next interval on each rating button (e.g. `Good · 12d`), computed by
running `review_card` on a copy for each rating.

### 4.4 Personalization (post-v1 default: off)

Once a learner has ≥ 400 review logs, offer "Optimize scheduling from my history": run the
`fsrs[optimizer]` extra over `srs_review_logs` and store the resulting 19-parameter vector in the
settings table; the Scheduler is rebuilt with it. Not in v1 scope (adds a torch dependency —
packaging cost, see 13-packaging-distribution.md); the button ships disabled with a tooltip.

## 5. Review session UX & exercise types

### 5.1 Session shell

A review session pulls up to 20 cards at a time from the queue (§7) and runs them through
exercises chosen by card maturity. ASCII wireframe (design tokens per 12-design-system.md):

```
┌──────────────────────────────────────────────────────────────┐
│  Review · 7 of 20                      streak 12 🔥   [Exit] │
│──────────────────────────────────────────────────────────────│
│                                                              │
│   Fill the gap (from your reading session, 22 Jul):          │
│                                                              │
│   "Governments must act now to m________ the effects         │
│    of climate change."                                       │
│                                                              │
│   [ type your answer…                              ] [Check] │
│                                                              │
│   hint: /ˈmɪtɪɡeɪt/ · verb                     [🔊] [Reveal] │
│──────────────────────────────────────────────────────────────│
│        [Again · 10m]  [Hard · 2d]  [Good · 5d]  [Easy · 9d]  │
└──────────────────────────────────────────────────────────────┘
```

Rating buttons appear after the answer is checked/revealed. Keyboard: `1–4` rate, `Space` reveal,
`Enter` check.

### 5.2 Exercise types

Exercise per review is picked by maturity (defaults; learner can disable types in settings):

| Card state | Eligible exercises (random among) |
|---|---|
| New / Learning | `flip` |
| Review, stability < 7d ("young") | `cloze`, `collocation`, `flip` |
| Review, stability ≥ 7d | `cloze`, `use_in_sentence`, `audio_recall`, `collocation` |
| Relearning | `flip`, `cloze` |

Outcome → rating mapping for auto-checked types: exact/accepted answer on first try = learner
chooses Good/Easy; needed hint or 2nd try = Hard offered as default; revealed/wrong = Again
default (learner can override — FSRS ratings remain learner-final, defaults just pre-select).

1. **`flip`** — classic: front = headword + IPA + audio button; back = definition,
   `own_context_sentence` (source-attributed: "from your Speaking Part 2, 20 Jul"), collocations.
2. **`cloze`** — `own_context_sentence` with the headword blanked (all inflected occurrences
   blanked via lemma match; first letter shown as hint after 10 s). Typed answer, checked by
   lemma-equality (so "mitigating" accepts "mitigate" only if the blank was the inflected form —
   exact surface match required, lemma match shows "almost — check the form").
3. **`use_in_sentence`** — "Write one sentence using **mitigate** about any topic." The sentence
   is checked by the configured LLM. Verbatim checking prompt (JSON mode, temperature 0):

```
You are checking whether an IELTS learner used a vocabulary item correctly.
Item: "{{headword}}" ({{pos}}) — meaning: {{definition}}
Learner's sentence: "{{sentence}}"

Judge ONLY: (a) is the item used with its correct meaning, (b) is it grammatically correct in
this sentence including collocation and word form. Ignore unrelated minor errors elsewhere in
the sentence. Do not judge the opinion expressed.

Return ONLY a JSON object:
{
  "acceptable": true/false,
  "issues": ["each distinct problem in one short sentence; empty if acceptable"],
  "better_version": "the learner's sentence minimally corrected, or an empty string if no
    change is needed"
}
```

   UI shows `issues` inline and `better_version` as a diff. `acceptable:true` → Good pre-selected;
   false → Again pre-selected. Offline fallback (no LLM reachable): exercise degrades to `cloze`.
4. **`collocation`** — match-up: left column the headword's `collocations` fragments with the
   headword removed ("____ the effects of"), right column 4 candidate words (the headword + 3
   distractors drawn from same-topic entries). All correct first try → Good default.
5. **`audio_recall`** — Kokoro pronounces the headword (and on replay, one example sentence);
   learner types what they heard. Checks spelling — doubles as listening/spelling practice
   feeding the same skill the Listening module's transfer-answers phase needs
   (07-listening-module.md).
6. **`speaking_drill`** — not a queue exercise: during Speaking-module warm-up drills
   (04-speaking-module.md), the session injects 3 due words via the RAG-processor-style message
   injection pattern (02-voice-pipeline.md; `build_messages()` single marked system message) —
   "Ask the learner a question that invites using *mitigate*". If the evaluator confirms the word
   was used correctly in the transcript, the sidecar posts a `Good` review with
   `exercise_type='speaking_drill'` — the card is counted as reviewed for the day.

### 5.3 Word audio

`audio_ref` is generated lazily: first time a card needs audio, the sidecar synthesizes the
headword with Kokoro ONNX (voice `af_heart`, the same local TTS default as
03-providers-and-settings.md) into `{data_dir}/media/vocab/{entry_id}.wav` (canonical tree, 11 §9
per R2-18) and stores the relative path. It is cache audio (`media_files` kind `vocab_audio`,
11 §9): evictable under the media cache budget and regenerated on the next miss — never treated
as a user recording. The renderer streams it via `GET /api/v1/media/vocab/{entry_id}.wav`
(ticket auth, 18-api-contract.md §2/§4.16).

## 6. Curated seed banks (content packs)

Authored per 15-content-authoring-licensing.md (original sentences; word *lists* themselves are
not copyrightable, AWL headwords are published research). **Launch target: ~2,000 entries**,
generated with LLM assistance then human-reviewed (the review pipeline is defined in
15-content-authoring-licensing.md).

### 6.1 Pack format (merged content-pack format — R2-8; 11 §11 is canonical)

Vocab decks ship inside content packs (`.brpack` archives, reverse-DNS pack ids — 11 §11) as
`data/vocab.jsonl`: one entry per line, keyed by a stable authored id, with a `deck` field
grouping entries into opt-in decks. Pack import upserts lines into the content-side
`vocab_pack_entries` table (11 §3) — **shipped content, not learner data**; no profile's bank is
touched at import (§6.2). The launch decks below ship in the core pack (`org.bandready.core`);
authoring sources live under `content/` in the repo and are built by the `tools/content` tooling
(15-content-authoring-licensing.md). Entry shape (one JSONL line, pretty-printed):

```json
{
  "id": "env_biodegradable",
  "deck": "topic-environment",
  "headword": "biodegradable",
  "ipa": "ˌbaɪəʊdɪˈɡreɪdəbl",
  "pos": "adj",
  "definition": "able to decay naturally without harming the environment",
  "own_context_sentence": "Shops now offer biodegradable packaging instead of plastic bags.",
  "example_sentences": ["Most food waste is biodegradable."],
  "collocations": ["biodegradable packaging", "biodegradable materials", "biodegradable waste"],
  "topic_tags": ["environment"],
  "cefr_level": "B2"
}
```

Upgrade-pair entries (deck `upgrade-pairs`) add one field: `"upgrade_of": "good"` (the common
word it improves on); the writing module reads this to power `vocab_upgrades` suggestions
(05-writing-module.md).

### 6.2 Deck inventory (launch)

| Kind | Decks | Entries/deck | Total |
|---|---|---|---|
| `topic` — the 20 topics listed in the §3.2 prompt (environment, education, technology, health, globalisation, work-careers, travel-tourism, media-advertising, crime-law, family-relationships, art-culture, science-research, urbanisation-housing, transport, food-diet, sport-fitness, money-economy, government-society, language-communication, nature-animals) | 20 | ~60 | ~1,200 |
| `awl` — Academic Word List, sublists 1–10 | 10 | 57 avg | 570 |
| `upgrade-pairs` — less-common-lexis pairs (good→beneficial, big→substantial, important→pivotal, …) | 1 | ~230 | ~230 |

Opt-in UX (R2-5): pack import stages decks as content only (`vocab_pack_entries`) — nothing
reaches any profile's bank or the SRS at import. On first run the onboarding flow
(10-curriculum-progress.md) asks Academic vs General Training and offers the AWL decks only for
Academic. An explicit **deck opt-in** (`POST /api/v1/vocab/packs/{pack_id}/import`, §9) copies
that deck's entries into the active profile's `vocab_entries` as `status='active'` with
`srs_cards` rows scheduled immediately — accepted seed opt-ins are one of the two
immediate-schedule paths (§3.2). The curriculum surfaces the deck matching the current
study-plan topic week as a one-click opt-in prompt; it never opts a deck in silently. The
10-new-cards/day gate (§7) prevents a 2,000-card day-one avalanche either way. Duplicate
handling on opt-in goes through the same §3 dedup (learner-met words win their context
sentences).

## 7. Daily flow — integration with 10-curriculum-progress.md

The curriculum's daily plan includes a "Vocabulary" block sized from the SRS queue:

- **New cards/day: 10** (default; settable 0–30). New cards are drawn round-robin from opted-in
  decks + organically-added entries, organic entries first (they have learner context — better
  hooks).
- **Daily review cap: 120** (default). If due backlog exceeds the cap, cards are prioritized by
  ascending retrievability (`scheduler.get_card_retrievability`) — most-forgotten first; the
  remainder rolls over (FSRS tolerates lateness natively; no penalty logic needed).
- **Session chunk: 20 cards** with a continue prompt between chunks.
- Queue order within a session: relearning → learning → review(due) → new; interleaved so no more
  than 3 new cards appear consecutively.
- `speaking_drill` reviews (§5.2.6) count against the daily review number, so voice practice
  visibly shrinks the queue — deliberate cross-module reinforcement.
- The curriculum dashboard shows `due_today`, `new_available`, and blocks the "exam-ready"
  checklist item on `retention_30d ≥ 0.85` (10-curriculum-progress.md owns the checklist).

Day boundary: local-time 4:00 AM rollover (default, matches Anki convention), computed in the
sidecar from the OS timezone.

## 8. Stats

Shown on the vocab dashboard; all computed from `srs_cards` + `srs_review_logs`:

- **True retention (30d)**: `ratings in (2,3,4) / all ratings` over review-state cards in the
  trailing 30 days (learning-step reviews excluded).
- **Streak**: consecutive days (4 AM boundary) with ≥ 1 review log. Stored materialized in the
  settings table, recomputed on write.
- **Counts**: new (`state=0`), learning (`state IN (1,3)`), **young** (`state=2 AND stability < 21`),
  **mature** (`state=2 AND stability >= 21`), suspended/known.
- **Forecast**: due-per-day histogram for the next 14 days (`GROUP BY date(due_at)`).
- **Sources breakdown**: entries per module (`GROUP BY module` on `vocab_sources`) — motivational
  "your bank is 63% self-collected".

Example (retention):

```sql
SELECT CAST(SUM(rating >= 2) AS REAL) / COUNT(*)
FROM srs_review_logs
WHERE state_before = 2 AND reviewed_at >= datetime('now', '-30 days');
```

## 9. Sidecar API surface

All routes live under `/api/v1` on the token-authenticated loopback FastAPI (R2-1);
**18-api-contract.md §4.11 is the authoritative inventory** (method, path, auth, wire shapes) —
this table summarizes purpose only:

| Method & path | Purpose |
|---|---|
| `POST /api/v1/vocab/entries` | Manual add: dedup + immediate scheduling (§3.2); returns `{id, merged}` |
| `POST /api/v1/vocab/suggestions` | Module-sourced batch ingest → `status='suggested'`, no `srs_cards` row (§3.2) |
| `GET /api/v1/vocab/suggestions` | Suggestion inbox (paginated) |
| `POST /api/v1/vocab/suggestions/{id}/accept` | Accept: `status→'active'`, card created `due_at=now`, enrichment queued |
| `POST /api/v1/vocab/suggestions/{id}/dismiss` | Dismiss: entry deleted (sources cascade) |
| `GET /api/v1/vocab/entries?query=&topic=&status=&pos=&sort=&limit=&cursor=` | Browse/search the bank (FTS5 on headword+definition, 11 §6) |
| `PATCH /api/v1/vocab/entries/{id}` | Edit fields; `{"status": "known"}` etc. |
| `DELETE /api/v1/vocab/entries/{id}` | Hard delete entry + card + logs |
| `GET /api/v1/dictionary/{word}` | Offline WordNet lookup (§3.4) — instant, no LLM |
| `POST /api/v1/vocab/lookup` | LLM enrichment-shaped preview *without* saving (online fallback when WordNet misses); "Add" then calls the manual-add route |
| `GET /api/v1/srs/queue?limit=20` | Next session chunk (§7 ordering), each item with its chosen `exercise_type` and rendered exercise payload |
| `POST /api/v1/srs/review` | `{card_id, rating, exercise_type, elapsed_ms}` → §4.3 transaction; returns updated card + next-interval preview |
| `POST /api/v1/vocab/check-sentence` | `{entry_id, sentence}` → §5.2.3 LLM check `{acceptable, issues, better_version}` |
| `GET /api/v1/vocab/stats` | §8 payload |
| `GET /api/v1/vocab/packs` · `POST /api/v1/vocab/packs/{pack_id}/import` | Seed-deck list · explicit deck opt-in (§6.2) |
| `GET /api/v1/media/vocab/{entry_id}.wav` | Headword audio stream, ticket auth (18 §2); Kokoro on miss (§5.3) |

Frontend (R2-23): due-count/queue-summary state lives in the global `srs` Zustand store
(01-architecture.md's four-store convention); bank browsing and the in-flight review session are
feature-local ephemeral state in `app/src/features/vocab/store.ts` — attempt-in-progress state is
never global.

## Open questions

1. **Second-encounter context sentences** — current default keeps the *first* learner sentence
   forever. Should a more recent encounter (or a learner "pin this sentence" action) be able to
   replace it? Needs a UX opinion.
2. **AWL for General Training** — GT candidates skip the AWL pack by default; is a slimmed
   "GT high-frequency" pack (~300 entries) worth authoring for launch, or post-v1?
3. **Optimizer packaging** — `fsrs[optimizer]` drags in torch (~2 GB installed). Options: ship
   disabled (current default), optional download-on-demand component, or reimplement optimization
   against the ONNX runtime we already bundle for Kokoro. Decide with 13-packaging-distribution.md.
4. **Phrase lemmatization edge cases** — simplemma handles single tokens only; inflected phrase
   variants ("raining cats and dogs" vs "rained cats and dogs") currently create duplicate
   entries. Acceptable for v1, or add head-token lemmatization for phrases?
5. **Cloze for multi-occurrence lemmas** — when `own_context_sentence` contains the lemma twice,
   blank both or only the first? Currently both (simplest), but it can make the item trivially
   guessable or confusing.
