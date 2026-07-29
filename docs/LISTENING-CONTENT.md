# The listening bank

What ships, what the teaching payload promises, how it reaches the learner, what the audio
pipeline can and cannot do, and how to add a test. Every number here was measured against
the merged pack on 2026-07-28, not estimated.

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or
> connected to the IELTS Partners. IELTS is a registered trademark of its owners, used here only
> to describe the exam format this software helps you prepare for. Every script, line of dialogue,
> question, option, map, answer key and teaching note in this bank is original. No past paper,
> official practice test or preparation book was used as a source, a reference or a paraphrase
> target. Band scores are estimates for practice and do not predict an official result.

---

## 1. What the bank holds

| | |
|---|---|
| Part-scripts | **43** |
| Complete four-part tests | **7** (`lt_test_1`, `lt_02` … `lt_07`) |
| Questions | **415** |
| Questions carrying a teaching payload | **415 / 415** |
| Groups carrying a teaching payload | **92 / 92** |
| Scripts in a test / standalone | 28 / 15 |

**By part** — p1 = 11, p2 = 14, p3 = 7, p4 = 11.
Parts 2 and 4 are over-supplied and part 3 is the bottleneck: tests 8, 9 and 10 are fully
authored *except* their p2/p3 scripts, so `merge_listening.py` deliberately refuses to
write those three test rows (see §6). Writing six part-3 tutorials is the single highest
-value content job left.

**By accent** — uk = 18, us = 13, au = 12. Every test mixes at least two accent sets across
its four parts.

**By question type**

| type | n | | type | n |
|---|---|---|---|---|
| note_completion | 133 | | sentence_completion | 46 |
| form_completion | 66 | | table_completion | 27 |
| multiple_choice | 65 | | map_labelling | 20 |
| matching | 50 | | short_answer | 8 |

**Map assets** — `content/core-en/media/listening/maps/`. Nine SVGs ship; four are
referenced by 20 `map_labelling` questions (`lm_watermill`, `lm_museum_floor`,
`lm_festival_ground`, `lm_campsite`). The other five (`lm_allotment_site`,
`lm_market_square`, `lm_sports_centre`, `lm_wetland_hide`, `lm_wormery`) are drawn and
checksummed but unclaimed — supply for future part 2s, not dead weight to delete without
thought. Every map question has a resolvable `asset.src`; there is no repeat of the reading
module's missing-diagram defect.

**Derived drill items** (`GET /api/v1/listening/practice/catalogue`): dictation 577,
signpost 596, prediction 415, numbers 112.

> **The maps were invisible until 2026-07-29, and it was not a content bug.** Every SVG
> existed, was checksummed, was registered in `media_files`, and returned `200` with
> `content-type: image/svg+xml` — but the renderer's Content-Security-Policy listed the
> sidecar origin under `media-src` (so audio played) and **not** under `img-src`, so the
> browser refused to display any of them. `MapAsset` degrades gracefully, so what a learner
> saw was the honest-looking message *"The map for this question isn't in the installed
> content pack"* on all 20 `map_labelling` questions — a question you cannot answer, since
> the labels live on the plan. Fixed in **both** CSPs (`app/index.html` and the packaged
> one in `app/electron/main.ts`) and verified in Chromium: `naturalWidth 640`,
> `naturalHeight 460`, placeholder gone. The lesson worth keeping is that "the asset ships"
> and "the learner can see it" are two different claims, and only the second one is a mark.

---

## 2. The teaching payload

Two levels: a **group** payload (strategy for a question set) and a **question** payload
(the anatomy of one mark). Both live inside `script_json`, which the content validator
treats as free-form, so no schema change is needed to add a field.

### Per question — `questions[].teaching`

```jsonc
{
  "schema_version": 1,
  "prediction": {                  // worked out BEFORE the audio plays
    "slot": "proper_name",         // closed enum: the kind of word the gap needs
    "cue": "Surname",              // the printed word that fixes the slot
    "range": null,                 // for numeric slots: plausible bounds
    "note": "Unguessable. Put your pen on the box…"
  },
  "signpost": {                    // the marker that announces the answer
    "phrase": "would you spell that for me",
    "line_index": 7,               // MUST contain `phrase` verbatim
    "kind": "dictation"
  },
  "answer_quote": "W. H. I. T. L. O. W. Whitlow.",   // verbatim in the cue line
  "paraphrase_link": null,         // printed wording -> spoken wording, when they differ
  "distraction": {                 // the wrong thing said before the right thing
    "trap": "spelling_correction",
    "decoy": "White",
    "decoy_line_index": 8,
    "signal": "No, sorry, ignore that, there's no E in it",  // verbatim in that line
    "note": "He abandons the first spelling…"
  },
  "form": { "risk": "spelling", "note": "Seven letters and no E…" },
  "recovery": null,                // what to do when this one is already lost
  "option_diagnosis": null         // MCQ only: why each distractor attracts
}
```

`cue_line_index` on the question (not on `teaching`) points at the transcript line that
carries the answer. The review screen highlights exactly that line and the "Replay from
m:ss" button seeks to its `start_ms` from the timing sidecar.

### Per group — `groups[].teaching`

`answer_order` (`sequential` / `scattered`), `order_note`, `strategy`, `preview_focus`,
`watch_out`, and for maps a `spatial_cues` list of the direction phrases the speaker uses.

### The invariants a merge enforces

`tools/content/merge_listening.py` refuses to write, and
`tools/content/verify_listening.py` re-derives independently:

* `answer_quote` appears **verbatim** in its own script's `cue_line_index` line — 415/415;
* `signpost.phrase` appears verbatim at `signpost.line_index` — 415/415;
* `distraction.signal` appears verbatim at `decoy_line_index` — 227/227;
* every speaker's `voice` is one of the 54 ids Kokoro v1.0 actually ships;
* every referenced media path exists on disk;
* question numbers are contiguous 1–40 within each test, no duplicates.

Run the independent audit with:

```bash
uv run --project sidecar python -m tools.content.verify_listening
```

It deliberately does **not** import the merger, so a bug shared between author and merge
tool cannot hide behind the merger's own self-report.

---

## 3. The audio contract

Rendering is `POST /api/v1/listening/tests/{id}/render` (or `/scripts/{id}/render`), which
hashes the script content and returns a cached result if the WAV already exists.

**Measured, full render of `lt_02` on an M-series Mac, Kokoro v1.0 ONNX, cold cache:**

| part | lines | duration | size | RMS | peak | clipped | render wall |
|---|---|---|---|---|---|---|---|
| p1 uk | 50 | 6:17 | 18.09 MB | 0.061 | 0.841 | 0 | 53 s |
| p2 au | 21 | 5:38 | 16.23 MB | 0.063 | 0.841 | 0 | 40 s |
| p3 uk | 53 | 7:08 | 20.53 MB | 0.069 | 0.841 | 0 | 32 s |
| p4 uk | 20 | 5:18 | 15.25 MB | 0.074 | 0.841 | 0 | 40 s |
| **total** | **144** | **24:20** | **70.1 MB** | | | | **~3 min** |

Output is 24 000 Hz mono 16-bit PCM WAV. Every render writes a `<hash>.timing.json`
alongside it with one `{index, start_ms, end_ms, pause_after_ms}` entry per line — that is
what click-to-replay and the drill clips seek against. All 144 lines had timing entries.

**Second independent render, `lt_test_1`, different machine state, cold cache (2026-07-29):**

| part | lines | duration | size | RMS | peak | clipped | timing entries | render wall |
|---|---|---|---|---|---|---|---|---|
| `ls_t1_p1` uk | 47 | 5:21.7 | 15.44 MB | 0.070 | 0.841 | 0 | 47/47 | 48.5 s |
| `ls_t1_p2` us | 30 | 5:53.3 | 16.96 MB | 0.055 | 0.841 | 0 | 30/30 | 47.9 s |
| `ls_t1_p3` uk | 48 | 6:15.7 | 18.03 MB | 0.064 | 0.841 | 0 | 48/48 | 53.3 s |
| `ls_t1_p4` uk | 31 | 6:29.2 | 18.68 MB | 0.074 | 0.841 | 0 | 31/31 | 51.2 s |
| **total** | **156** | **23:59.8** | **69.1 MB** | | | | **156/156** | **3 min 21 s** |

Two tests rendered independently land within 20 seconds of each other on total duration
(24:20 and 24:00), which is the right length for a paper whose audio is nominally ~30 min
including the printed pauses. The identical `peak = 0.8414` across all eight parts is the
engine's own normalisation ceiling, not a coincidence — nothing clips, and nothing is
silence (a silent part would show RMS ≈ 0; the floor observed is 0.055).

The render is **content-addressed**: `script_audio_hash()` folds the script plus
`RENDER_GENERATION`, so a cached part re-renders in ~12 ms (measured via
`POST /tests/lt_test_1/render` → `{"cached": true}`) and editing one line re-synthesizes
only that line.

**A pack import used to un-link every render (fixed 2026-07-29).** `listening_scripts.audio_hash`
is written by the app after a render (`tts_render._link_script_audio`), but the pack always
ships it null, and `upsert_rows` did a blanket `audio_hash = excluded.audio_hash`. Any pack
import — an upgrade, a re-seed, a repair — therefore reset all 43 scripts to "not prepared",
and a learner who had rendered a 24-minute test was told to prepare it again. The WAVs were
never lost (the hash is derived from script content, so `cached_render` still hit and a
re-prepare returned in ~12 ms), but the prompt is alarming and the state was simply wrong.
`upsert_rows` now COALESCEs the columns listed in `PRESERVE_LOCAL_WHEN_PACK_NULL`, so a pack
only writes `audio_hash` when it actually carries one. Verified by setting a hash, importing
the full pack, and reading it back unchanged.

**Voice resolution has a trap.** `render_script(script, accent_set=…)`:

* `accent_set=None` — **honours each speaker's authored `voice`.** This is what the render
  routes send by default and therefore what the shipped audio is.
* `accent_set="uk"` — *forces* every speaker onto that accent's table cast, discarding
  authoring. This exists for the accent drill, which re-voices a script on purpose.

The two differ for **20 of 43 scripts** and produce different `audio_hash` values. If you
render outside the routes, pass `accent_set=None` or you will fill the cache with audio the
app will never ask for. The authored cast is also the better one: forcing `us` moves
`ls_03_p1`'s caller onto `am_eric`, whose spelled-name delivery is the worst in the engine.

---

## 4. Kokoro's real limits

Measured by synthesizing through the shipped pipeline and transcribing the result back with
the installed `faster-whisper` (`small.en`).

### 4.1 Spelled-aloud names — the format that works

The historical defect (R4 §8.1) was real, and it still reproduces **exactly** when the
normaliser is bypassed. Synthesizing the raw string and transcribing it back:

| what Kokoro was given | `bm_george` heard back | `af_heart` heard back | |
|---|---|---|---|
| `B-R-A-D-S-H-A-W` | `BRADSHW` | `BRADSH to W` | ✗ an A lost |
| `B R A D S H A W` | `BRDSHW` | `Be R-A-D-S-H-A-W` | ✗ both As lost |
| `B. R. A. D. S. H. A. W.` | `B R A D S H A W` | `B-R-A-D-S-H-A-W` | ✓ |

A lone `A` between spaces or hyphens phonemizes as the *article* (ə) rather than the letter
name (eɪ), so it vanishes. **The only notation Kokoro segments correctly is
period-separated.**

`normalize_spelled_runs()` in `bandready/audio/tts_render.py` rewrites hyphen- and
space-separated runs into the dotted form **for synthesis only** — the transcript keeps
whatever the author wrote, because that is what a human writes down. Re-running the same
three inputs *through the shipped pipeline* (normaliser on): all three are rewritten to
`B. R. A. D. S. H. A. W.` and all three recover `BRADSHAW` on **6/6 voices tested**
(`bm_george`, `bf_emma`, `am_michael`, `af_heart`, `bm_lewis`, `bf_alice`).
**The defect is fixed, and the control proves the fix is what fixes it.**

Note that the *shipped content does not rely on the normaliser*: the authors wrote the
dotted form directly, so `normalize_spelled_runs` is a no-op on all 43 scripts today and
exists as a guard for future authoring.

**The whole-bank measurement.** Every spelled run in the pack (35 runs across 28 lines,
238 letters) was synthesized in its real cast voice and transcribed back with
`faster-whisper small.en`:

> **29 / 35 runs recovered exactly · 232 / 238 letters = 97.5 %**

Of the six that did not match exactly, **four are artefacts of the comparison, not the
audio**: where the author wrote `double L`, Kokoro correctly says the words "double L" and
whisper correctly writes "double L", while the scorer expected `LL`. Those lines
(`ls_08_p1` ×2, `ls_07_p1`, and one `ls_09_p1`) are right in the ear and right on the page.

**Two are real, and both are the same defect: the first letter of a run being swallowed by
the second.**

| script | voice | authored | heard back |
|---|---|---|---|
| `ls_03_p1` L8 | `am_adam` | `V. A. S. Q. U. E. Z. Vasquez.` | "**Villa** SQUEZ Vazquez" — `V.A.` merges into a word |
| `ls_06_p1` L8 | `bf_alice` | `Q. U. E. double N. E. double L.` | "**Choose** U-E-N-N-E-L-L" — `Q.U.` merges into a word |

Both are recoverable in context (the speaker says the name as a word immediately after, and
in both scripts a second character repeats the spelling back a line later, which transcribes
cleanly), so **no mark in the bank is unearnable**. But if you author a surname beginning
`Q`+`U`, or one whose first two letters form a common syllable, listen to it before shipping.

**The separator comparison, repeated in context (2026-07-29).** The measurements above
synthesize the spelled run *in isolation*. That turns out to overstate the difficulty for
every format: a bare `B. E. L. L. F. I. E. L. D.` with no surrounding sentence gives the
ASR no reason to expect letters, and it hallucinates (an isolated-clip run scored dotted
4/20, space 4/20, hyphen 2/20 — i.e. it measures ASR context-sensitivity, not the engine).
Learners never hear a run in isolation, so the run was repeated with each name embedded in
its real carrier — *"Sorry, would you mind spelling that for me? Of course. {run} {Name}."* —
across 5 names × 4 cast voices (`bm_lewis`, `bf_isabella`, `am_eric`, `bm_daniel`):

| separator | runs recovered exactly | mean letter recall |
|---|---|---|
| `B-R-A-D-S-H-A-W` (hyphen) | 11 / 20 | 0.81 |
| `B R A D S H A W` (space) | 10 / 20 | 0.81 |
| **`B. R. A. D. S. H. A. W.` (dotted)** | **19 / 20** | **0.85** |

This is the cleanest evidence in the file that the fix is the right one, because all three
arms share a voice, a carrier and a scorer — whatever the ASR gets wrong, it gets wrong
equally. The historical R4 failure reproduces verbatim inside it: `BRADSHAW` space-separated
on `am_eric` came back as **`brdshw`** — letters gone, exactly the "BRDSH-W" defect — while
the dotted form on the same voice returned `B-R-A-D-S-H-A-W`. The characteristic hyphen
failure is also visible: `O-K-A-F-O-R` collapses to "**Okay,** F.O.R." on three of the four
voices, because `O-K-A` is read as a word. `V. A. S. Q. U. E. Z.` recovered its `A` on 4/4
voices dotted and lost it on 4/4 hyphen and space.

**Method caveat, stated plainly.** Every claim in this section is mediated by ASR, which is
a noisy instrument, not a human ear. Re-running the same line with a different whisper model
changed the result in both directions — `small` (multilingual) misheard a phone number that
`small.en` got right, and separator variants that looked better on one voice looked worse on
another. Treat the 97.5 % aggregate as sound and any **single** cell as indicative only.

**Other measured weaknesses:**

* The *word* after the spelling is sometimes mangled where the spelling is not
  (`Okafor` → "O-K-A-F-A", `Doust` → "doused"). The mark is the spelling, so no answer is
  lost, but do not rely on the spoken word as the only carrier.
* Spelled runs are **fast** — seven letters in about 1.8 s. That is the underlying cause of
  both real failures above. There is no per-run speed control: `speed` is a global TTS
  setting, and lowering it would slow every line in the pack.
* `double L` / `double T` / `double S` are expanded correctly by the engine — a useful,
  non-obvious result, because it means the natural British dictation idiom is safe to
  author, and it is what four of the six "failures" above actually demonstrate.

### 4.2 Numbers

Number-dictation answers were transcribed back and matched their answer key exactly,
including the distractor-and-correction patterns:

* `ls_02_p1` "oh one four seven two, double three oh, nine one five" → `01472 330915`
* `ls_09_p1` "three three oh nine … Yours is three three one oh" → `3310` (decoy rejected)
* `ls_08_p1` "P. T. double four, one nine" → `PT4419`

One caution about the *method*, not the audio: the `small` (multilingual) whisper model
transcribed `01472 330915` as `01472 230915`, which looks like a rendering fault and is not
— `small.en` on the identical WAV returns `01472 330915`, and a control synthesis of
"double three" alone returns "Double three" on every voice. Use `small.en` for English
verification; the multilingual model's number normalisation is unreliable.

Author numbers **as spoken words** in the transcript (`"oh four one two, double six"`), not
as digits. The answer key holds the digit form. This is both what real IELTS does and what
the engine reads correctly.

### 4.3 Other

* Australian is **approximated with British voices** — Kokoro v1.0 has no `au` cast. The UI
  labels it "Australian (approximated with British voices)". Do not claim otherwise.
* `au` and `uk` still share the `bm_george` narrator, so the accent drill opens by playing
  the same voice it is contrasting. Known, unfixed.
* Two per-line escape hatches exist for anything the phonemizer gets wrong: `say_as`
  (a different spoken string) and `phonemes` (raw IPA). Both are folded into the content
  hash, so editing either re-renders that line only.
* Separator experiments: comma-plus-period changes prosody; extra spaces, newlines and
  dashes are all ignored by the phonemizer and produce identical audio.

---

## 4bis. How the teaching payload reaches the learner

All teaching data lives inside `script_json`, which means it survives the loader untouched —
but it also means nothing serves it by default. Listening builds every response field by
field from an allowlist, so delivery is *additive*, and there are exactly two doors:

| door | endpoint | what opens it |
|---|---|---|
| **Coach** | `GET /listening/coach/scripts/{id}/teaching` | the preparation half (prediction, type pages, pause plan, pre-teach) is **always** open; the `timeline` and the `transcript` open only once the learner has submitted an attempt on that script |
| **Review** | `GET /listening/attempts/{id}/review` | opens only after that attempt is **submitted** |

The review projection is one `get()` per level, which is why every teaching field in
`DESIGN.md` lives under a single key named `teaching`:

* per part — `teaching` and `groups`, straight off `script_json`;
* per question — `teaching`, read from the **authored** question object via
  `_authored_questions()`. Note that it cannot come from `_question_meta()`:
  `flatten_questions()` deliberately rebuilds each question from a fixed allowlist (that is
  what keeps `_public_script` from leaking), so the payload does not survive it.

**Four gates enforce that this is the only way in.** Each returns the stated status:

| behaviour | check |
|---|---|
| Review before submission | `409` — the review body carries the transcript, and in listening the transcript *is* the key |
| `?with_answers=1` on `/scripts/{id}` or `/tests/{id}` while a mock is open | key silently withheld; restored when the sitting ends |
| A second play of the same part in a sitting | `409`, server-side, so a reload does not buy a replay |
| Opening a practice attempt, a drill or the coach while a sitting is open | `409` — otherwise the practice player's free transport hands back the replay the mock just refused |

The mock response body was audited directly: a sitting's questions carry only
`asset, id, instruction, number, options, prompt, select_n, slots, source_number, type,
word_limit` — no `answers`, no `teaching`, no `cue_line_index`, and no transcript.

---

## 5. The mock, and which delivery mode it models

`GET /api/v1/listening/mock/delivery` is the authority. **Computer-delivered is the
default.**

| mode | check window | why |
|---|---|---|
| `computer` | **120 s** | The answers are already in the box. You check, you do not copy. |
| `paper` | **600 s** | Paper must transfer answers to a separate sheet. Clerical, not thinking time. |

The mnemonic the module teaches: *paper gets ten minutes because paper has to move the
answers; computer gets two because the answers are already where they need to be.*

Computer is the default because it is the realistic assumption now — the hybrid "IELTS on
Computer (Writing on Paper)" still keeps Listening on a computer, and One Skill Retake,
which is what makes an isolated listening score actionable, is computer-only. Paper mode is
offered because deferred transfer is a genuinely different skill.

**Exam conditions are enforced, not merely requested.** Verified in Chromium against the
running app:

* the transport control is disabled and no seek bar is rendered;
* seeking is guarded at the element level — a direct `audio.currentTime` write, backwards
  *or* forwards, snaps back to the true playhead within ~600 ms;
* each part registers a play server-side (`POST /mock/sessions/{id}/play`) so a replay
  cannot be bought by reloading;
* the coach is unreachable while a sitting is open (`GET /mock/exam-conditions`).

One honest gap: a direct `audio.pause()` from the console stops playback and is not
auto-resumed. It buys thinking time, not a replay, and the surrounding UI offers no way to
do it.

**An interrupted part is now recoverable (fixed 2026-07-29).** A pause that the candidate
did not ask for is a real event — a media key, a Bluetooth device change, an OS ducking
event — and in a once-only exam it is expensive. `PartPlayer` already had the machinery for
it (`interrupted`, set by `onPause` only when the audio stopped before `ended`, and a
"Playback stopped — continue" button), but the button was gated on `!playedOnce`, and
`playedOnce` flips on the *first `play` event*, not on `ended`. The condition was therefore
false for the entire part and the button was **dead code in the only mode that renders it**:
an interrupted exam part could not be resumed and the candidate silently lost the rest of
it, up to 10 marks. Reproduced in Chromium, then fixed by dropping the `!playedOnce` term.
Resuming is safe and was verified as such: `start()` calls `play()` on the paused element
and never rewinds, and the seek guard still pins `currentTime` to the high-water mark — a
rewind attempted immediately after a resume snapped from 1 s back to 24.6 s.

The check step's protocol, in the order the module teaches it: blanks first (a blank is a
guaranteed zero, a guess is free), then word limits, then plurals, then doubled answers,
then spelling — and *only* on words copied from a spelled-out name. Nothing on that list is
a question you rethink, because the audio is gone: only form recovery is possible.

**Scoring**, verified end-to-end against all seven tests: 40/40 → **band 9.0**,
20/40 → **band 5.5**, 0/40 → **band 2.0**. Submitting each test's own answer key scores
40/40 on all seven — **zero unearnable marks in the bank**.

Marking uses `bandready/scoring/answers.py`, shared with reading. Spelling is exact for
listening: a near miss is wrong, but is tagged `near_miss_spelling` so the drills can pick
it up. Word limits go through `within_word_limit`, which implements "N WORDS **AND/OR A
NUMBER**" properly — a run of adjacent number tokens is *one* number, so `01472 330915` and
`86 pounds` are both legal at a limit of one. (Counting bare tokens instead made 8 of the
pack's own accepted answers unearnable; see the regression test
`test_a_spaced_number_is_one_number_not_two_words`.)

---

## 6. Authoring a new test

1. **Write four part-scripts** as a staging file under
   `content/core-en/staging-listening/tests/`, following `DESIGN.md` and the worked example
   in `TEMPLATE.json`. Ids are `ls_<test>_p<n>`; a script not destined for a test gets an
   `ls_dx_*` id and lives as standalone practice.

   Each script needs `speakers[]` (with `role`, `accent` and an explicit `voice`), `lines[]`
   (`speaker`, `text`, `pause_after_ms`), `groups[]` and `questions[]`. Number questions
   1–10 in p1, 11–20 in p2, and so on: the merge checks 1–40 across the four parts.

   Write the narrator's preview pauses as real `pause_after_ms` (30 000 ms before a
   question set) — they are what makes the render the right length.

2. **Add the test row** to `tests-assembly.json`'s `test_rows`, naming the four script ids.
   A row whose parts do not all resolve is skipped with a warning rather than written, so a
   half-finished test can sit in staging indefinitely without breaking the pack.

3. **Merge** — idempotent, safe to re-run:

   ```bash
   uv run --project sidecar python -m tools.content.merge_listening
   ```

   `standalone_scripts` and `tests` append; `updates` (keyed by an existing id) patch in
   place. Re-running with no source change rewrites nothing.

4. **Audit and build:**

   ```bash
   uv run --project sidecar python -m tools.content.verify_listening
   uv run --project sidecar python -m tools.content.build content/core-en
   ```

   The build recomputes `manifest.json` counts and SHA-256 checksums for every data file and
   media asset, then validates. Fix until it prints `OK — pack is valid.`

5. **Render and listen.** Do not ship a test you have not heard:

   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:8710/api/v1/listening/tests/<id>/render
   ```

   Then check the spelled names and numbers actually come back. The cheapest real check is
   to transcribe the render with the bundled `faster-whisper` and compare to the authored
   text — that is how every claim in §4 was established.

### Authoring rules that are not obvious

* **Spelled names:** write `B-R-A-D-S-H-A-W` or `B. R. A. D. S. H. A. W.` — both are
  normalised. Always follow a spelled run with the name as a word; it is the learner's
  second chance and it is what a real speaker does. Prefer the dotted form directly, as the
  shipped bank does, so the render does not depend on the normaliser firing.
  **Avoid a surname whose first two letters form a syllable** — `Q`+`U` renders as "choose"
  and `V`+`A` as "villa" (§4.1). If you must use one, have the *second* speaker read it back,
  which is what rescues both of the bank's two affected lines.
* **Listen to every spelled run before shipping.** The cheapest check is
  `faster-whisper small.en` on the rendered segment; never the multilingual `small`, whose
  number normalisation invents digits (§4.2).
* **Numbers:** write them as words in `text`, digits in `answers`.
* **`answer_quote` must be a verbatim substring of the `cue_line_index` line** in the same
  script. This is checked and it is the binding between the teaching payload and the
  transcript highlight — get it wrong and the merge refuses the file.
* **Distractors need a `signal`** the learner could actually have heard ("no, sorry",
  "actually", "it used to be"). A trap with no audible retraction is unfair, not difficult.
* **Word limits:** `{"words": 1, "numbers": 1}` renders as "ONE WORD AND/OR A NUMBER".
  Remember that articles count as words, and that the answer key must itself satisfy the
  limit — the audit checks this.
* **Maps:** the SVG path goes on the *question* as `asset.src`, relative to the pack root
  (`media/listening/maps/x.svg`), on every question in the group.
