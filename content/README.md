# BandReady content packs

Everything a learner practises with — speaking cards, writing prompts, reading passages,
listening scripts, vocabulary — lives in a **content pack**, never in application code. This
directory holds the first-party pack that ships with the app:

```
content/
├── core-en/            # org.bandready.core-en — the shipped pack (this document's subject)
├── schema/             # JSON Schema exports, generated from the Pydantic row schemas
└── README.md
```

Authoritative specs, in order of precedence: **`docs/plan/11-data-model.md` §11** owns the pack
format; **`docs/plan/15-content-authoring-licensing.md`** owns authoring and licensing policy;
each module doc (04 speaking, 05 writing, 06 reading, 07 listening, 08 vocab) owns its item
schema. The executable contract is
**`sidecar/bandready/content/validate.py`** — its `ROW_SCHEMAS` reject anything malformed, and
the same code runs at pack-import time, so if the validator passes, the app can load it.

---

## 1. Pack layout

A pack is a directory (side-loaded as a `.brpack`, which is a plain zip of that directory):

```
core-en/
├── manifest.json                 # mandatory; see §2
├── data/                         # every file optional — a vocab-only pack ships just vocab.jsonl
│   ├── topics.jsonl              # shared topic vocabulary; everything else references these ids
│   ├── card_sets.jsonl           # speaking: one linked Part 1+2+3 unit per row
│   ├── speaking_cards.jsonl      # speaking: one card per row (04 §5)
│   ├── writing_prompts.jsonl     # writing tasks (05 §2)
│   ├── reading_passages.jsonl    # passages, with their question groups inline (06 §3)
│   ├── reading_tests.jsonl       # three passage ids = one test
│   ├── listening_scripts.jsonl   # scripts, with their questions inline (07 §2)
│   ├── listening_tests.jsonl     # four script ids = one test
│   ├── vocab.jsonl               # vocabulary entries (08 §6.1)
│   └── pron_pairs.jsonl          # minimal pairs (09 §5.3) — untyped, read straight from disk
└── media/                        # optional
    ├── audio/<sha256>.wav        # pre-rendered listening audio (+ .timing.json)
    └── images/…                  # diagram-labelling assets
```

Rules that bite:

- **One JSON object per line, no wrapping array.** Blank lines and lines starting with `//` are
  skipped, so a file may carry section comments.
- **Column names match the DDL** (`docs/plan/11-data-model.md` §3), minus the provenance columns
  (`source`, `pack_id`, `pack_version`, `license`, `retired`) — the importer fills those in.
- **`id` is a stable authored slug** and is the upsert key. Re-importing the same pack is a
  no-op; changing an `id` creates a second row and orphans attempt history. Treat ids as
  permanent once released.
- Files are imported in FK order: `topics` → `card_sets` → `speaking_cards` → `writing_prompts`
  → `reading_passages` → `reading_tests` → `listening_scripts` → `listening_tests` → `vocab`.
- Nested documents (`payload_json`, `passage_json`, `script_json`, `entry_json`, `chart_spec`)
  may be written as **real JSON objects** — the importer serialises them. Do not double-encode
  them as strings.
- A pack that fails **any** blocking check is rejected **whole**. Partial imports create states
  nobody can debug.

### 1.1 topics.jsonl is the shared vocabulary

Every other file's `topic_id` must be an `id` from `topics.jsonl`. The ids are `topic_<noun>`
in snake_case and are **frozen** — other files, curriculum weighting and progress reporting all
key off them:

`topic_environment`, `topic_education`, `topic_technology`, `topic_health`,
`topic_globalisation`, `topic_urbanisation`, `topic_work`, `topic_media`, `topic_culture`,
`topic_transport`, `topic_crime`, `topic_tourism`, `topic_family`, `topic_science`,
`topic_economy`, `topic_food`, `topic_sport`, `topic_housing`, `topic_communication`,
`topic_money`.

The importer auto-creates a missing topic rather than failing (FK safety), so a typo'd
`topic_id` does **not** raise — it silently forks the taxonomy and shows up as a
`Technlogy`-style label in the UI. Check `created_topics` in the import result, or diff your
`topic_id`s against the list above, before shipping.

---

## 2. manifest.json

```json
{
  "manifest_version": 1,
  "id": "org.bandready.core-en",
  "version": "1.0.0",
  "name": "BandReady Core (English)",
  "description": "…",
  "publisher": "BandReady",
  "homepage": "https://github.com/Luxshan2000/ielts-prep",
  "license": "CC0-1.0",
  "disclaimer": "…full non-affiliation text, verbatim…",
  "ai_disclosure": "ai_assisted",
  "built_with": { "tool": "tools.content.build", "tool_version": "1.0.0", "…": "…" },
  "locale_hint": "en",
  "counts": {},
  "checksums": {}
}
```

| Field | Rule |
|---|---|
| `manifest_version` | `1` — the only supported version |
| `id` | reverse-DNS, lowercase (`org.bandready.core-en`) |
| `version` | semver. Content edits bump **patch**, additions bump **minor**, schema or `id` changes bump **major** |
| `license` | pack default; the allowlist is `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`. An individual row may override with `"license"` + `"attribution"` |
| `disclaimer` | **mandatory, verbatim** — see §4.1 |
| `ai_disclosure` | **mandatory**, one of `human`, `ai_assisted`, `ai_generated` — see §4.2 |
| `min_app_version` | optional semver floor |
| `counts`, `checksums` | **generated — never hand-edit.** `{}` is the correct placeholder in a fresh pack |
| `locale_hint` | reserved, unvalidated in v1 |

`checksums` must list **every** file under `data/` and `media/` as
`"<rel/path>": "sha256:<hex>"`. A file absent from `checksums`, an entry pointing at a file that
is not in the pack, and a digest mismatch are all hard import failures — which is why the
manifest is written by a tool (§3) and not by hand.

---

## 3. Tooling

Both commands run from the **repository root**, inside the sidecar's venv (the validators live in
`bandready.content`; `tools/content/` is the authoring skin over them):

```bash
# 1. While authoring — checksums are still stale, so skip them:
uv run --project sidecar python -m tools.content.validate content/core-en --no-checksums

# 2. Once the files are final — regenerate counts + checksums, then full validation:
uv run --project sidecar python -m tools.content.build content/core-en

# 3. Full validation of a finished pack (this is what the app does at import):
uv run --project sidecar python -m tools.content.validate content/core-en
```

`validate` also takes `--json` (machine-readable report for CI), `--strict` (warnings fail) and
`--max-errors N`. `build` takes `--check` (verify without writing; **exit 1 if the manifest is
stale** — the CI form), `--skip-validate` and `--quiet`. Exit codes are uniform: `0` pass,
`1` content failure, `2` usage or unreadable pack.

Typical loop: edit `data/*.jsonl` → `validate --no-checksums` until clean → `build` → commit the
data files **and** the regenerated `manifest.json` together. A commit with one but not the other
leaves a pack the app refuses to import.

### 3.1 Checks that need an LLM

Blind answer-key agreement, blind chart solvability and difficulty estimation
(`docs/plan/15-content-authoring-licensing.md` §3.3) are **not** in these commands, because the
sidecar must be able to import a pack with no model configured. They are authoring-time checks;
run them before proposing a pack for listing.

---

## 4. Licensing and legal rules

These are not stylistic preferences. They are the conditions under which the project may
legally exist. `docs/plan/15-content-authoring-licensing.md` §1–§2 is the full text; this is the
operative summary.

### 4.1 Trademark, and the disclaimer

"IELTS" is a registered trademark of the IELTS Partners. BandReady's use of the word rests
entirely on **nominative fair use**, which survives only while all of the following hold:

- The word "IELTS" never appears in a product name, logo, app icon, domain, package id, repo
  name, or store listing title. Pack `name` and `id` follow the same rule.
- UI and content copy use descriptive phrasing — "IELTS-style practice test", "prepares you for
  the IELTS exam". Never "official", "certified", "approved", or "partner" next to the mark.
- No IELTS logo, colour scheme, trade dress, or scan of official material, anywhere — including
  screenshots and issue templates.

Every pack manifest carries this text **verbatim** in `disclaimer` (validation enforces its
presence; a human enforces that it has not been paraphrased):

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or
> connected to the IELTS Partners (British Council, IDP: IELTS Australia, and Cambridge
> University Press & Assessment). IELTS is a registered trademark of its owners, used here only
> to describe the exam format this software helps you prepare for. All practice materials in
> BandReady are original and are not official IELTS test content. Band scores produced by this
> software are AI-generated estimates for practice purposes only and do not predict official
> IELTS results.

### 4.2 Copyright: what may and may not be used

| Thing | Policy |
|---|---|
| Real past-paper content, Cambridge practice books, official sample PDFs | **Never** copy, adapt, paraphrase from, or train on. Authors must not have official materials open while authoring. |
| Exam **format** — four skills, three speaking parts, 40 questions in 60 minutes, question types, the 0–9 band scale | Facts, not protectable. Used freely; encoded in the schemas. |
| Public band-descriptor **text** | Paraphrase only, and **no run of more than five consecutive words** in common with any published descriptor (criteria names excepted). |
| Raw-score → band conversion tables | Short factual data; usable, labelled "approximate". |
| Third-party datasets | Audited before any use, and **never merged into a first-party pack** — repackaged as a separate community pack under its own license, or just linked. |

### 4.3 First-party content is CC0-1.0

All content in `core-en` is dedicated to the public domain under **CC0-1.0**. The code is MIT
licensed: different license, different directory. The reasoning: the pipeline is
LLM-assisted, purely AI-generated expression is not reliably copyrightable, and a ShareAlike
claim would assert rights the project may not hold. CC0 makes no claim that can be challenged
and puts no attribution tax on the community packs the project wants to exist.

Contributing content to a first-party pack therefore means agreeing to the CC0 dedication.

### 4.4 AI disclosure must be truthful

`ai_disclosure` describes how the pack was actually made — `human`, `ai_assisted` (LLM draft,
human review), or `ai_generated` (no human review). `core-en` is `ai_assisted`, and
`built_with.method` states so in plain language. The app surfaces this to learners in the
content manager. Overstating human involvement is the one failure that would justify pulling a
pack from the listing.

---

## 5. Authoring a new pack

1. `mkdir -p mypack/data` and write a `manifest.json` with the mandatory fields, `counts: {}` and
   `checksums: {}`.
2. Copy the frozen `topic_*` ids you need into `data/topics.jsonl` (or reference the core pack's
   ids and ship no topics of your own).
3. Write one `data/*.jsonl` file per content kind. **Read `ROW_SCHEMAS` in
   `sidecar/bandready/content/validate.py` first** — it is the contract, and it will reject the
   wrong shape with a line number.
4. `validate --no-checksums` until clean, then `build`.
5. Review every item against the human checklist in
   `docs/plan/15-content-authoring-licensing.md` §3.5, by a person who did not author it.
6. Zip the directory as `<name>.brpack` and side-load it from Settings → Content.

Community packs live in **their own git repos**, one pack per repo, never as pull requests into
the app repo. `bandready-pack-template` carries this layout plus a validation CI workflow.

### 5.1 Speaking content specifically (04 §5)

The speaking bank is the one place where two files must agree, so it is worth spelling out. One
**set** = one `card_sets` row + four `speaking_cards` rows (two Part 1 frames, one Part 2 cue
card, one Part 3 discussion card). The set row records the membership; each card row also
carries `card_set_id`, and both must match — the importer trusts the card's column, while the
Full-Mock picker walks `card_sets.last_served_at`.

`card_sets.payload_json`:

```json
{ "schema_version": 1, "difficulty": "core", "tags": ["housing"],
  "part1_card_ids": ["card_p1_home_001", "card_p1_neighbourhood_001"],
  "part2_card_id": "card_p2_local_change_001",
  "part3_card_id": "card_p3_urban_change_001",
  "lineage": "one sentence: how Part 3 generalises Part 2" }
```

`speaking_cards.payload_json`, by part — these key names are read directly by
`CardBundle.from_payloads` in `sidecar/bandready/voice/state_machine.py`, so they are not
negotiable:

```json
// part 1 and part 3 drills
{ "questions": ["Do you live in a house or an apartment?", "…"] }

// part 2
{ "cue_card": { "topic": "Describe a place near your home that has changed in recent years.",
                "bullets": ["where this place is", "what it used to be like", "how it has changed",
                            "and explain how you feel about the change."],
                "rounding_off": ["Do you go there more often now than you used to?", "…"] } }

// part 3
{ "part3_themes": [ { "title": "how neighbourhoods change",
                      "questions": ["Why do some neighbourhoods change much faster than others?", "…"],
                      "counterpoint": "a city that refuses to change simply turns into a museum" } ] }
```

Every card's `payload_json` also repeats `schema_version`, `id`, `part`, `topic`, `difficulty`
and `tags`; `topic` must equal the row's `title`, because the examiner prompt interpolates it
("Part 1 — Interview, topic: your home").

Content rules the reviewer checks, and that `core-en` satisfies throughout:

- **Part 1** — 5–6 questions per frame, answerable in 2–4 sentences from ordinary personal
  experience, progressing from concrete habits to mild reflection. Every question ends in `?`.
- **Part 2** — the cue-card `topic` is one `Describe …` sentence ending in a full stop; **3–4
  bullets**, lower-case noun/wh- phrases, and the **last bullet begins "and explain"**; exactly
  2 short `rounding_off` questions. The card must be doable from a completely ordinary life —
  no exotic-experience prerequisite.
- **Part 3** — 2–3 themes, lower-case gerund/noun-phrase titles, 3 genuinely abstract questions
  each (society, change over time, comparisons between groups, speculation), plus one
  `counterpoint`: a single defensible contrarian clause the examiner can push back with. Never
  a Part 1-style personal question.
- **Lineage** — the Part 3 card must generalise the Part 2 topic. A set whose Part 3 wanders to
  an unrelated domain fails review.
- `difficulty` is `core` on Part 1 and Part 2 cards (everyday, band 5–6 accessible) and
  `stretch` on Part 3 cards (band 7+ discourse). The picker indexes on it.
- Culturally portable: no assumed nationality, religion, or region-locked knowledge; every
  question answerable by an 18-year-old and a 45-year-old without embarrassment. No brand
  names, no real small businesses, no real private individuals.
