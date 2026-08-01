# PR-3 — Speaking exercises for the Grammar and Vocabulary modules

**Brief:** the owner asked for *"talk sessions, speak based evaluation"* in Grammar and Vocabulary —
*"For grammar, small exercises with speak. Vocabulary section speak button already there but we need
a few sentence examples also so user can speak it themselves and see. Grammar case speak button and
also ask user to speak."*

**Status:** design, implementable. No application code was changed to produce it.

**Verified against the tree on 2026-08-01.** Every claim about existing code carries a file and a
line number. Every external claim carries a URL I actually fetched; the list is at the end.

**Confidence key.** `[verified]` — I read the code, the content file, or the fetched page.
`[measured]` — I computed it from the repo on this machine, and the command is quoted.
`[design]` — my proposal, defensible but not a fact. `[unverified]` — I could not check it and say so.

---

## 0. The headline, before the detail

**This PR ships no new model, no new weights and no new download.** Everything it needs is already
installed, already configured, already reachable, and already used by a working screen in another
module. If you read nothing else, read §1.9 — the four things that have to be built are small, and
three of the four are wiring rather than invention.

The one hard constraint that shapes everything below: **speech is an input mode, not an exercise
kind.** Both modules already have a free-production exercise that takes a string and grades it well
and fairly. A transcript is a string. Adding a microphone in front of an existing grader is a
50-line change; adding a fourteenth grammar item kind or a seventh vocabulary exercise kind is a
database migration, a content lint change, and a new grading path that will drift from the old one.
§2 argues this properly.

---

## 1. Ground truth — what is actually on disk

Read this section before designing anything, because three of the five things the brief assumes
turned out to be different from the description.

### 1.1 The recorder exists, and it is not where the brief says

The brief names `app/src/features/speaking/components/drills/useDrillRecorder.ts`. **That file does
not exist.** `[verified]`

The working recorder is at **`app/src/components/practice/useRecorder.ts`** (131 lines), and its
module docstring already anticipates this PR:

> *"Lives here rather than under `speaking/` because Grammar and Vocabulary need the same thing:
> neither module could record the learner at all, which is why the pronunciation backend has been
> sitting unreachable behind ten routes nothing calls."*

Its contract (`useRecorder.ts:18-26`):

```ts
export type RecorderState = "idle" | "recording" | "stopping" | "denied" | "unsupported";
export interface Recorder {
  state: RecorderState;
  remaining: number | null;          // seconds left in the take
  error: string | null;
  record: (seconds: number) => Promise<Blob | null>;   // self-stopping
  stop: () => void;
}
```

It stops its own microphone track after every take (`cleanup()`, line 53), maps `getUserMedia`
failures to learner-readable copy (`describe()`, line 29), and returns exactly one `Blob`. It has
**one caller today**: `app/src/features/speaking/components/drills/DrillRunner.tsx:57`, which uses it
at line 320 as `const blob = await recorder.record(item.seconds); if (blob) await onGrade(item, { wav: blob });`
`[verified]`

That single caller is the working precedent for the whole of this design: record → upload → local
STT → grade → show what was heard → show the verdict. It already ships.

### 1.2 The vocabulary "speak button" is a listen button

`useWordAudio.ts` plays the headword to the learner: cached WAV from
`/api/v1/media/vocab/<id>.wav`, falling back to `window.speechSynthesis`, falling back to a visible
`unavailable` state (`useWordAudio.ts:1-10`). `WordAudioButton.tsx` renders it as a `Volume2` icon
with `aria-label="Play the word"`. `[verified]`

**Nothing in `app/src/features/vocab/` or `app/src/features/grammar/` calls `getUserMedia` or
constructs a `MediaRecorder`.** `[verified]` — the only `useRecorder` import in the whole renderer is
`DrillRunner.tsx:28`.

This matters for copy as much as for code. The app currently has one button that the owner calls the
"speak button" and it is the one that speaks *to* the learner. §7.1 fixes the vocabulary: the
existing control is **Listen**, the new one is **Record**, and they never share an icon, a position,
or a word.

### 1.3 A vocabulary speaking exercise kind already exists — and is unreachable

`speaking_drill` is a first-class vocabulary exercise kind, end to end:

| Layer | Status |
|---|---|
| `srs/exercises.py:57` — in `EXERCISE_TYPES` | present `[verified]` |
| `srs/exercises.py:488-502` — `build_exercise` branch | present `[verified]` |
| `server/routes/srs.py:44-46` — `ReviewRequest.exercise_type` `Literal` | present `[verified]` |
| `db/models.py:877-881` — `srs_review_logs.review_type` CheckConstraint | present `[verified]` |
| `app/.../vocab/components/exercises/SpeakingDrillExercise.tsx` | present, 84 lines `[verified]` |
| `srs/exercises.py:308-316` — `eligible_types()` candidate lists | **absent** `[verified]` |

`eligible_types()` builds its candidate list from exactly four branches — `["flip"]`,
`["flip","cloze"]`, `["cloze","collocation","flip"]`, `["cloze","use_in_sentence","audio_recall","collocation"]`
— and `speaking_drill` appears in none of them. **The vocabulary queue can never select it.** It is
reachable only if a route asks for it by name, and no route does.

And the component it would render records nothing. `SpeakingDrillExercise.tsx:44-45` says so out
loud: *"Self-rated: BandReady does not listen here."*

**This is the single most valuable fact in the brief.** The vocabulary speaking exercise does not
need a new kind, a new `review_type` value, a migration, or a new route on the review path. It needs
`eligible_types()` to be allowed to pick `speaking_drill`, and it needs the component to grow a
microphone.

By contrast, inventing a new kind (`speak_sentence`, say) costs a CheckConstraint change on
`srs_review_logs.review_type` (`models.py:877-881`, mirrored in
`migrations/versions/0001_baseline.py:704`) plus the `Literal` on `srs.py:44`. That is a migration
against a live SQLite file on a user's laptop, for zero pedagogical gain. **Do not do it.**

### 1.4 The grammar module is fully built, and its free-production grader is excellent

The grammar module is not a plan — it ships. `sidecar/bandready/grammar/` is 3,802 lines across
`detectors.py`, `grading.py`, `practice.py`, `scheduler_bridge.py`, `syllabus.py`, `tables.py`;
`server/routes/grammar.py` is 1,596 lines exposing 20 routes; `app/src/features/grammar/` has eleven
screen components plus a five-file item renderer. `[measured]`

`content/core-en/data/grammar.jsonl` holds **147 points and 2,037 practice items** `[measured]`:

```
roles     form 76 · accuracy 32 · choice 39
kinds     gap_fill 303 · produce 294 · interpret 287 · judge 264 · choose_form 176 ·
          transform 163 · dictation 147 · error_fix 142 · order 125 · contrast_pair 85 ·
          both_ok 40 · combine 9 · speaking_drill 2
stages    S1 433 · S2 738 · S3 561 · S4 156 · S5 149
```

Read the last two entries of the kinds row together. **There are 294 authored `produce` items and 2
authored `speaking_drill` items.** Every one of the 147 points has exactly one `produce` at S4
(`mode: "sentence"`) and one at S5 (`mode: "apply_to_task"`). `[measured]`

So: *if the grammar speaking exercise is built on `speaking_drill`, it has two items in the entire
bank. If it is built on `produce`, it has 294.* That decides §3.

The grader those items already go to is `grammar.grading.judge_production()`
(`grading.py:626-750`), and it is the best-designed function in the sidecar. Its signature:

```python
async def judge_production(
    sentence: str, *, structure_slug: str | None, prompt_text: str = "",
    rule_line: str = "", min_words: int = 0, appeal_gloss: str = "",
) -> dict[str, Any]
```

Four checks: **A** is the structure present (answered mechanically by
`grammar/detectors.py`, 31 slugs, `detectors.py:365-400`), **B** is it built correctly (LLM, binary),
**C** does it fit the situation (LLM, binary), **D** the smallest fix (a string, never graded on).
Verdict is `A && B && C`, nothing else. Three fairness mechanisms are *code*, not prompt:

- a rejection that cannot quote an `offending_span` that is a real substring of the learner's
  sentence **is discarded and the answer accepted**;
- a rejection costs a second call, and **if the two calls disagree, the learner wins**;
- an unreachable model returns `checked: False` and the learner rates themselves — never a fail.

`NEVER_CHECKED` is written into the module as a tuple so no future prompt edit can reintroduce it
(`grading.py:60-72`): topic, opinion, truth, length, formality, spelling and punctuation outside the
target span, vocabulary choice, *"whether it is natural"*, *"whether a native speaker would say
it"*. `[verified]`

**That last pair is the accent rule already implemented for text.** The whole job of this PR on the
grammar side is to let a transcript reach that function without weakening any of it.

### 1.5 The vocabulary bank: three speakable sentences per entry, on every entry

`content/core-en/data/vocab.jsonl` holds **1,246 entries**, not the 343 or 583 that
`staging-grammar/DESIGN.md` §3.5 planned for — the v2 push landed and overshot. `[measured]`

```
schema_version      none 343  ·  2: 903
contexts[] total    2,709          (903 entries × exactly 3, no entry has 1, 2 or 4)
```

**2,709 is exactly the number in the brief, and it is `contexts[]`, not `example_sentences`.**
`example_sentences` totals 2,493 separately, and `own_context_sentence` is populated on all 1,246.
`[measured]`

The 2,709 contexts are in far better shape than a research doc has any right to expect:

| Property | Value | Why it matters here |
|---|---|---|
| `gap_span` an exact substring of `text` | **2,709 / 2,709** | the span to listen for is authored, not guessed |
| `unique_answer: true` | **2,709 / 2,709** | a swapped word is a real error, not an ambiguity |
| register per entry | 844 × (written, spoken, academic) · 59 × (written, spoken, spoken) | **every one of the 903 entries has ≥ 1 `spoken` context** |
| context length, words | min 7 · median 13 · p90 16 · max 21 | a 13-word sentence is a ~5-second take |
| `unit_type` | word 321 · frame 225 · chunk 183 · collocation 174 | 582 of 903 are multi-word |
| `grammar_links` | 903 / 903 | every v2 entry names 1–3 grammar points |
| `confusables` | 800 / 903 | a near-synonym to speak against |

`[measured]`

**The answer to the owner's "how many per entry" is three, and it is three for every single entry in
the bank** — including the 343 v1 entries that have no `contexts[]` at all. Deduplicating
`own_context_sentence` ∪ `contexts[].text` ∪ `example_sentences[]` per entry `[measured]`:

```
v1 entries:  3 distinct sentences × 342,  4 × 1
v2 entries:  3 distinct × 767,  5 × 136
```

Nothing has fewer than three. That is the floor the vocabulary speaking exercise can be designed
against without a content push, and it is why §4 has three rungs and not five.

The machinery for choosing *which* of them to speak also already exists:
`srs/context.py:307-370`, `select_sentence()`, sorts candidates by (0) unseen-first then
least-recently-seen, (1) provenance rank — the learner's own sentence beats an authored one, (2)
register match, (3) topic match, (4) short-context-at-low-stage, (5) id for determinism. It returns
a frozen `Sentence` dataclass (`context.py:129-163`) carrying `text`, `register`, `topic_id`,
`skill_hook`, `gap_span`, `unique_answer` and a learner-facing `provenance` string. `[verified]`

**Nothing in §4 needs a new sentence-selection rule.** It needs `register_bias="spoken"`.

### 1.6 The STT that already exists, and the exact model

`sidecar/bandready/speaking/drills.py:1553-1564`:

```python
async def transcribe(wav_path: Path) -> tuple[list[dict], str, int | None]:
    """(words, transcript, duration_ms) for one drill recording.
    Deliberately **not** pron.analyze_wav: that one spends an LLM call flagging likely
    mispronunciations across a whole turn, which is the wrong instrument and the wrong
    latency for a fifteen-second repeat."""
```

That is the primitive this PR needs, already written, already correct about latency, already used by
a shipped screen. It delegates to `pron.transcribe_words()` (`pron/analyze.py:208-250`) on a worker
thread, which tries an optional `bandready.providers.stt` module first (it does not exist —
`ls sidecar/bandready/providers/` gives `detect.py llm.py presets.py verify.py`, so that import
always falls through `[verified]`) and then faster-whisper.

**The model, per rule 5 of the brief:**

| Field | Value |
|---|---|
| Repo id | `Systran/faster-whisper-base` (a CTranslate2 conversion of `openai/whisper` `base`) |
| Chosen by | `settings_store.py:63-72` — `{"preset": "faster_whisper", "engine": "faster_whisper", "model": "base", "device": "auto", "compute_type": "int8", "language": "en"}` `[verified]` |
| Parameters | **74 M** — from the openai/whisper README size table `[verified, fetched]` |
| Disk size | **141 MB**, `model.bin` 145,217,532 bytes, measured in `~/.cache/huggingface/hub/` on this machine `[measured]` |
| Licence | openai/whisper's README states *"Whisper's code and model weights are released under the MIT License."* `[verified, fetched]`. The Systran conversion's own model card I **could not fetch** — `huggingface.co` is blocked from this environment — so treat the conversion's stated licence as `[unverified]`, noting it is a format conversion of MIT-licensed weights |
| Runs on CPU | **Yes.** Loaded as `WhisperModel(size, device="auto", compute_type="int8")` (`analyze.py:216-218`), i.e. int8-quantised CTranslate2 on CPU. No GPU anywhere in the path `[verified]` |
| Already downloaded | Yes — `base`, `base.en`, `small` (464 MB), `small.en` and `medium` are all in the local HF cache `[measured]` |
| Audio decoding | PyAV, which bundles the FFmpeg libraries; faster-whisper's README states *"FFmpeg does not need to be installed on the system"* `[verified, fetched]` |

That last row settles a question this design would otherwise have to guess at. `useRecorder` returns
`new Blob(chunks, { type: recorder.mimeType })` (`useRecorder.ts:103`) and on Chromium — which is
what Electron is — that mimeType is a WebM/Opus container, **not** WAV, despite the upload field
being named `wav` and the file being written with a `.wav` suffix
(`speaking_drills.py:292-296`). Because faster-whisper decodes through PyAV's bundled FFmpeg, the
mislabelled container decodes correctly anyway. `[verified]` It works today in the speaking drills;
it will work here. It is still worth a comment in the code, because the next person to read
`_attempt_path()` will assume the bytes are RIFF WAV and one day something else will try to open
them with `soundfile`, which is a core dependency (`pyproject.toml:21`) and cannot read WebM.

**The three-way multipart contract to copy verbatim** — `speaking_drills.py:303-360` accepts `wav`
*or* `transcript` *or* `choice`, and 422s on none of them with a message that explains why:
*"send the recording as `wav`, or a `transcript` if the client already transcribed it — this item is
graded on what was actually said"*. A drill graded on silence teaches the learner something false.
`[verified]`

### 1.7 Microphone permission is already granted at the Electron layer

`app/electron/main.ts:139-152` sets both `setPermissionRequestHandler` and
`setPermissionCheckHandler` to allow `media` for the app's own renderer origins and deny everything
else. `app/electron-builder.yml:51-53` sets `NSMicrophoneUsageDescription`. `[verified]`

So on macOS the only permission event a learner will ever see is the **OS-level TCC prompt, once**,
the first time any BandReady screen opens a microphone. If they have already done a Speaking session
or a speaking drill, they will see nothing at all. This is a genuinely good starting position and it
changes the degradation design in §8: a permission denial is *rare and sticky*, not routine, so the
right response is a one-time fallback that is remembered, not a per-card banner.

### 1.8 What the brief said, corrected

| Brief said | Actually |
|---|---|
| `app/src/features/speaking/components/drills/useDrillRecorder.ts` | `app/src/components/practice/useRecorder.ts` `[verified]` |
| the bank holds 2,709 authored context sentences | correct, and they are `contexts[]` on 903 of 1,246 entries, 3 each `[measured]` |
| nothing in vocab or grammar records the learner | correct `[verified]` |
| `pron/analyze.py` is a v1 proxy analyzer with `score: null` | correct, `METHOD = "proxy-v1"` at `analyze.py:40` `[verified]` |
| ten pron routes, nothing in the UI calls them | correct for `/api/v1/pron/*` `[verified]`; but `/api/v1/speaking/drills/attempts` *is* called, by `DrillRunner`, and it is the same record→STT→grade shape |

### 1.9 The four things to build

Everything in §3–§8 reduces to these. Nothing else in this document is new code.

1. **`transcribe_answer()`** — a thin sidecar helper over `speaking.drills.transcribe` that adds the
   silence/hallucination guard (§6). ~40 lines, `sidecar/bandready/pron/` or a new
   `sidecar/bandready/speech/answers.py`.
2. **Two multipart routes** — `POST /api/v1/grammar/answer/spoken` and `POST /api/v1/vocab/speak`.
   Both are "transcribe, then call the existing handler with `answer=<transcript>`".
3. **`eligible_types()` learns `speaking_drill`** (`srs/exercises.py:308-316`) and
   `build_exercise`'s `speaking_drill` branch learns the three rungs (`exercises.py:488`).
4. **Two React components grow a microphone** — `SpeakingDrillExercise.tsx` (vocab) and
   `ProduceItems.tsx` (grammar), both by reusing `useRecorder` the way `DrillRunner` does. Plus one
   small additive change to `useRecorder` itself (§7.3).

---

## 2. The one architectural decision: speech is an input mode

State it once, and enforce it in review, because every shortcut in this design comes from getting it
wrong.

> **A spoken answer is a typed answer that arrived by microphone.** It is transcribed to a string at
> the edge, and from that point on it travels the identical path: same grader, same rating map, same
> log row, same card. There is no second grading path, no `spoken_correct` column, and no exercise
> kind whose name contains the word *speak*.

Five reasons, in descending order of how expensive it is to learn them later:

1. **The schema forbids the alternative on the vocabulary side.**
   `srs_review_logs.review_type` is CheckConstraint-ed to six values (`models.py:877-881`). A seventh
   kind is a migration on a user's live database. `speaking_drill` is already one of the six.
   `[verified]`
2. **The content forbids it on the grammar side.** Grammar's kind enum is closed at 14 and enforced
   by `content/validate.py:77`. Of the two kinds that could carry speech, `produce` has 294 authored
   items and `speaking_drill` has 2. `[measured]`
3. **`judge_production()` already takes a `str`.** Its three fairness mechanisms — span-quoting
   enforcement, two-call confirmation, offline-is-an-accept — are 60 lines of hard-won code
   (`grading.py:626-750`). A parallel spoken grader would reimplement them badly and then diverge.
4. **The accent rule is easier to keep than to add.** `NEVER_CHECKED` already bans
   *"whether a native speaker would say it"*. Keeping the audio away from the grader means there is
   no surface on which an accent judgement could form, even by accident. §5 makes this structural.
5. **It degrades along a line the learner can follow.** No microphone → type it. No STT → type it.
   No LLM → the cheap spoken rungs still work (§8). Every failure lands on an exercise that already
   exists and already grades.

**The corollary that must be written into the code as a comment:** the grader sees the *transcript*
and never the *audio*, the *word confidences*, or the *timings*. Those exist — `transcribe_words()`
returns them (`analyze.py:208`) — and they are useful for the pronunciation module, which is a
different feature with a different consent story. Here they are used for exactly one thing: deciding
whether we heard anything at all (§6). They never touch a rating.

---

## 3. The grammar speaking exercise

### 3.1 Which items become spoken

**`produce`, in both its modes, gains a spoken input option. `speaking_drill` gains a real recorder.
Nothing else changes.** `[design]`

| Kind | Stage | Count | Spoken? |
|---|---|---|---|
| `produce`, `mode: "sentence"` | S4 | 147 | yes — the primary surface |
| `produce`, `mode: "apply_to_task"` | S5 | 147 | yes — longer take, 45 s |
| `combine` | S4 | 9 | yes, same treatment, low volume |
| `speaking_drill` | S5 | 2 | yes — and it stops being a self-rating |
| everything else (1,732 items) | S1–S3 | — | **no** |

`[measured]`

S1–S3 stay typed and tapped, for a reason `staging-grammar/DESIGN.md` §1.4 already argues: S2 carries
most of the volume because many cheap retrievals beat few expensive ones, and a spoken `gap_fill`
would turn a four-second item into a twenty-second one for no gain. Speech belongs at the top of the
ladder, where the thing being tested — *can you build this structure without preparation time* — is
the thing speech actually tests.

**Which items default to the microphone.** The item envelope already carries `register`. Of the 305
free-production items, **94 are `register: "spoken"` and 211 are `written`**; by `skill_hook`, 94 sit
on `speaking_p1/p2/p3` and 211 on the writing surfaces. `[measured]` So:

- `register: "spoken"` → the **Say it** tab is preselected;
- `register: "written"` → **Type it** is preselected;
- either way both tabs are live, and the learner's last choice is remembered for the session.

That gives roughly a 30/70 spoken/typed split across a learner's production items without any content
authoring at all, and it respects an authoring decision that has already been made 305 times.

### 3.2 What the learner is asked to say, and how it is worded

The prompt is **already authored**. `payload.prompt_text` on every `produce` item is a situation, not
a grammar instruction. A real one, `gi_pp_vs_past_simple_20` `[verified]`:

> *"Your team took over a service at the start of this year and you are still running it. Write one
> sentence about something that is different there now."*

with `required_structure: "present_perfect"`, `min_words: 8`, `max_words: 30`,
`seed_from_vocab_queue: true`.

The spoken version changes **one word** of it, mechanically, at render time: `Write` → `Say`.
`[design]` Not "record", not "speak aloud" — *say*, because that is what the learner is doing and it
is one syllable. The rule for the renderer, which should be a tiny helper and not a per-item
authoring burden:

```
Write one sentence …   → Say one sentence …
Write a sentence …     → Say a sentence …
Rewrite …              → Say your rewritten version of …
Take a body paragraph … and rewrite two sentences … → … and say the two rewritten sentences …
```

The constraint chips above the answer field are the ones `ProduceItems.tsx:52-62` already renders and
they do not change: **`Use: present perfect`** and, when the vocabulary queue supplied one,
**`and the word "deteriorate"`**. `DESIGN.md` §2.7.1 is explicit that the target must be stated —
*"learners route around anything they don't want"* — and that is more true in speech, not less,
because there is no time to reconsider.

One line of new copy sits under the record button, and it is the most important string in this
document:

> **"Say it however you say it. We check the grammar, not the accent."**

Not a footnote, not a tooltip, not on the settings page. Under the button, every time, on both
modules. `docs/plan/09-pronunciation-assessment.md` §0 already requires an `accent_notice` on every
pronunciation response and `pron.ACCENT_NOTICE` exists (`analyze.py:42`); this is the same
commitment stated where the learner is about to act on it.

### 3.3 What is checked — three gates, and the two that are not there

```
audio ──► [Gate 0: did we hear speech?] ──► transcript ──► [Gate A: structure present?]
                    │ no                                          │ mechanical, detectors.py
                    ▼                                             ▼
            "We didn't catch that."                    [Gate B/C: built right? fits?]
            Retake. No rating written.                       │ LLM, binary, existing
                                                              ▼
                                                    accepted = A && B && C
```

**Gate 0 — did we hear speech at all?** §6 specifies it. It is not a grading gate; failing it means
the app failed, and the app says so.

**Gate A — is the target structure present?** Answered by `grammar/detectors.py`, unchanged, on the
transcript. 31 slugs are implemented (`detectors.py:365-400`) and **189 of the 305 free-production
items resolve to a working detector**; the other 116 belong to points with `structure_slug: null`.
`[measured]` `judge_production` already handles all three outcomes — `True`, `False`, and `None` for
"no detector" — with three different prompt phrasings (`grading.py:664-672`), and a `False` on an
otherwise-accepted answer is logged as *our* bug (`grading.py:722-729`), not the learner's.

One spoken-specific tightening is needed and it is small. Detectors run on a normalised string. A
transcript of speech contains disfluencies and no punctuation. **Strip filled pauses before detection
and before judging** — `um`, `uh`, `er`, `erm`, `mm`, plus immediate word repetitions (`the the
council`). `[design]` These are normal features of fluent second-language speech, and a detector that
sees `have have published` where a writer would have typed `have published` will miss a structure
that was present. This belongs in `transcribe_answer()`, not in `detectors.py`, so the pronunciation
module's view of the same audio is unaffected.

**Gates B and C — is it built correctly, and does it fit?** The existing LLM call, verbatim, with
`sentence=<cleaned transcript>`. `JUDGE_PROMPT` (`grading.py:557-600`) needs **one added line** and
no other change:

> *"The learner spoke this answer and it was transcribed automatically. Ignore anything that looks
> like a transcription artefact — missing punctuation, missing capitals, a homophone, a plural that
> may simply not have been heard. Judge only the structure."* `[design]`

That is a leniency instruction on top of a prompt that already ends *"If you are unsure about
anything, answer true."* Correct for a learning tool, and §5.3 gives the evidence for why it is
necessary rather than merely kind.

**What is not checked, and must never be added:**

- **the accent.** No phoneme comparison, no GOP, no reference alignment, no "how close to RP".
- **the ASR's word confidences.** They are computed (`analyze.py:208-250` returns a `confidence` per
  word) and they are *the* tempting shortcut. §5.2 is a whole section on why they must not be used.
- **speaking rate, pauses, filler count, or any fluency proxy.** `fluency_proxies()` exists
  (`analyze.py:293`) and this exercise does not call it. A grammar item measures grammar. If we want
  to measure fluency we will build a fluency exercise and say so.
- **volume, room noise, microphone quality.**

### 3.4 How a failure is fed back

The existing `FeedbackPanel.tsx` and the F5 rules in `DESIGN.md` §6 already specify this, and the
spoken version inherits all of it. The sequence, in order, top to bottom:

**1. What we heard, first, always, before any verdict.** In the learner's own words, on its own line,
visually quoted and clearly attributed to the machine:

> *We heard: "I have work here for six years."*
> [ **That's not what I said** ] → retake, nothing written to the card

This ordering is not cosmetic. A learner who is told *"not quite"* before they are shown the
transcript has no way to tell whether they made a grammar error or the machine misheard them, and
the second possibility is common enough (§5.3) that leaving them unable to distinguish it will
destroy trust faster than any wrong verdict. `DrillRunner.tsx:490-492` already renders a
`Heard: "…"` line; this promotes it from a footnote to the first thing on the panel and adds the
dispute button.

**2. The verdict, as a coloured bar and never red.** `DESIGN.md` §6 F5: green or amber, *"red in
feedback is already banned across this app"*. `[verified]` The learner's transcript stays on screen,
unedited, above it.

**3. The `why`, which names the meaning and not the mistake.** This is `feedback.why_key`, authored,
≤ 35 words, and every one of the 2,037 items has one `[measured]`. From the same real item: *"You are
still inside the year and still inside the job, so the change belongs in a stretch nobody has
shut."*

**4. The `minimal_fix` as an inline diff against their own words.** Their sentence, one span changed.
Not a rewritten model answer.

**5. The `feed_forward`, one imperative sentence.** Also authored on every item: *"Say what is
different now, not what happened in March."* `[verified]` The item envelope's own docstring bans
self-level praise by name (*"great job!", "you're a natural"*), and that ban carries over.

**6. "I think this is right."** The appeal. `POST /api/v1/grammar/appeal` already exists
(`grammar.py:1090`) and `judge_production` already accepts an `appeal_gloss`. On a spoken item the
appeal field's placeholder changes to acknowledge the extra failure mode: *"What did you mean — or
type what you actually said."* If the learner types what they said and it now passes, that is a
labelled STT failure, and it should be logged as one.

**7. Say it again.** Under every outcome, accepted or not. A second take after an acceptance costs
nothing and is the single most useful thing a learner can do with a sentence they have just got
right; a second take after a rejection is graded as `attempts=2`, which the existing outcome map
turns into rating 2 (`hard`), not 1. `[verified, DESIGN.md §1.8]`

**What is never said.** Not *"unclear"*, not *"we couldn't understand you"*, not *"try to speak more
clearly"*, not *"pronounce X"*. When Gate 0 fails, the app takes the blame in the first person:
**"We didn't catch that — the recording came through quiet. Try again, or type it instead."** The
difference between *we didn't catch it* and *you weren't clear* is the entire accent rule, expressed
as one pronoun.

### 3.5 The `speaking_drill` items, and the honest scope of them

Both of them (`gi_pp_vs_past_simple_22`, `gi_reported_questions_15` `[measured]`) carry an
`injection` — a instruction addressed to the live examiner, not to the learner — plus
`required_structure` and `turns: 2`. `SpeakingDrillItem` (`ProduceItems.tsx:163-190`) currently
renders the injection *to the learner* and offers two self-rating buttons.

With a recorder available, the honest upgrade is small: keep the hand-off to the live Speaking module
as the primary route (that is what a two-turn conversation needs and this card cannot host one), but
replace **"I said it, and it came out right"** with a real 25-second take graded by the same
`judge_production` path as `produce`. `[design]` A one-turn spoken answer to the injection's question
is weaker evidence than a real conversation, and the card should say so in one line — but it is
enormously stronger evidence than a button labelled *I said it*.

Two items is not a feature. It is a bug in the content bank, and it should be filed as one against
whoever owns the next grammar authoring pass: **`DESIGN.md` §2.7 requires ≥ 1 `produce` at S4 and ≥ 1
at S5 with the S5 item's mode being `apply_to_task` **or** `speaking_drill`, and every author took
`apply_to_task` 147 times out of 147.** `[measured]` The lint passed; the intent did not survive it.

### 3.6 What this does *not* do

**A grammar spoken answer is not a "real speaking transcript" for the purposes of the wild-failure
rule.** `DESIGN.md` §1.6's most important row — the same error code reappearing in a real Writing
submission or Speaking transcript hard-drops the point to S3 — must keep meaning *the learner was not
thinking about this structure and produced it wrong anyway*. A `produce` item names its target
structure in a chip above the answer field. Evidence gathered while the learner is staring at the
words *"Use: present perfect"* cannot be evidence of unmonitored production. `[design]`

It **is** valid evidence for **mastery condition 3** (`DESIGN.md` §1.7: *"≥ 1 correct unassisted
production — a passed S5 item, or a detected correct use in a real Writing submission or Speaking
transcript. Record which; the real submission is worth more and the UI says so"*). A passed spoken S5
item is exactly a passed S5 item. Record the modality alongside it, so the progress screen can say
*"you have said this one under time pressure"* rather than only *"you have written it"*.

---

## 4. The vocabulary speaking exercise

The owner's ask is the specific one: *"we need a few sentence examples also so user can speak it
themselves and see."* §1.5 established that every entry has three. This section turns three sentences
into a three-rung ladder.

### 4.1 Three rungs, on the `speaking_drill` kind

One exercise kind, three `payload.rung` values. The kind is `speaking_drill`, which is already legal
everywhere (§1.3). `[design]`

| Rung | Name | The learner does | Sentence supply | Graded by | Take |
|---|---|---|---|---|---|
| **R1** | **Echo** | reads the model sentence aloud | `select_sentence(register_bias="spoken")` | token overlap against the known reference | 12 s |
| **R2** | **Swap** | says the same sentence with one part changed | same sentence + `chunk.open_slots` or a topic swap | target span present **and** sentence ≠ model | 15 s |
| **R3** | **Own** | says an original sentence using the word | no model — the definition and collocations only | `exercises.check_sentence()` on the transcript | 20 s |

This is deliberately the shape of the owner's sentence: *speak it themselves* (R1) *and see* (the
transcript), escalating to original production (R3). It is also the shape `DESIGN.md` §1.4 already
uses for the grammar ladder, so the two modules feel like one product.

**R1 — Echo.** The model sentence renders in a quoted block, the **Listen** button sits beside it
(this is `WordAudioButton` with `mediaPath=null` and `fallbackText=<the sentence>`, which routes to
`speechSynthesis` — `useWordAudio.ts:45-60` `[verified]`), the **Record** button sits below it.
Pass condition: **the `gap_span` was heard**, plus ≥ 60% token overlap with the reference sentence.
`[design]` The `gap_span` is authored and is an exact substring on all 2,709 contexts (§1.5), so the
thing being listened for is never inferred. `speaking/drills.py:235` already implements `align()` and
`agreement()` over expected/heard token lists, which is the exact primitive.

Echo is not a pronunciation exercise. It is a *retrieval-and-articulation* exercise: the learner has
to get their mouth around a real 13-word sentence containing the item, which is a thing they have
never once been asked to do in this app. It is also the rung that works when the LLM is down, which
makes it the reliability floor of the whole feature.

**R2 — Swap.** The screen shows the model sentence with one span struck through and a replacement
instruction. Two sources for the swap, in preference order `[design]`:

1. `chunk.open_slots[].fills` where the entry has them — 582 of 903 entries are multi-word and the v2
   schema defines `chunk.shape`, `chunk.fixed_part` and `chunk.open_slots[].fills` (`DESIGN.md` §3.2)
   `[measured, verified]`. *"Say it again, but about `poor planning` instead of `a shortage of
   qualified drivers`."*
2. otherwise, a different `contexts[]` entry's `topic_id`: *"Say the same thing about your own
   studies."*

Pass condition: the fixed part of the chunk (or the headword) is present, **and** the transcript is
not a token-for-token repeat of the model. That second clause is what makes it a different rung from
R1 rather than a longer R1.

**R3 — Own.** No model sentence on screen at all — headword, part of speech, definition, up to five
collocations, exactly as `UseInSentenceExercise.tsx:74-87` renders today. The learner speaks one
original sentence. Graded by `srs/exercises.py:620-665`, `check_sentence()`, unchanged, with the
transcript as `sentence`. That function already returns `{acceptable, issues, better_version,
suggested_rating, checked, detail}` and already degrades to `{acceptable: None, suggested_rating: 3,
checked: False}` when the model is unreachable (`exercises.py:642-650`). `[verified]`

**R3 is the spoken twin of `use_in_sentence`, and it should say so on screen** — *"Same question as
the written one. Different muscle."* — because the learner who has done both should understand why
they were asked twice.

### 4.2 Which rung, when

Mirror the existing maturity gate exactly (`srs/exercises.py:308-316`), one rung per band. Do not
invent a second set of thresholds; `YOUNG_STABILITY_DAYS = 7.0` is already imported everywhere.
`[design]`

```python
# srs/exercises.py — inside eligible_types()
if state in (0, 1):          candidates = ["flip"]                                    # unchanged
elif state == 3:             candidates = ["flip", "cloze", "speaking_drill"]         # rung R1 only
elif stability < YOUNG:      candidates = ["cloze", "collocation", "flip",
                                           "speaking_drill"]                          # R1 or R2
else:                        candidates = ["cloze", "use_in_sentence", "audio_recall",
                                           "collocation", "speaking_drill"]           # R2 or R3
```

with a new filter beside the three that already exist:

```python
if kind == "speaking_drill" and not speech_available:   # §8 — mic AND stt, decided by the caller
    continue
```

Rationale for the gate, from `DESIGN.md` §1.4, which cites Barcroft: sentence *production* can hurt
form learning while form is still being built, because semantic processing competes for the same
resources. So R3 sits behind the same `stability >= 7 days` wall as `use_in_sentence`. R1 is
different in kind — reading a sentence aloud has no production load at all — so it is allowed for a
relearning card, where it is one of the gentlest possible retrievals.

**Frequency.** `speaking_drill` should be one candidate among four or five, not a guaranteed slot. At
roughly one card in five, a 20-card session produces three to four spoken items — enough to be a
habit, few enough that a learner reviewing on a train can skip them all without the session
collapsing. `[design]` This falls out of `choose_exercise`'s uniform `rng.choice` over the candidate
list without any weighting code.

### 4.3 The sentence, chosen not fixed

`select_sentence()` (`context.py:307`), called with:

```python
select_sentence(entry, stage=2, seen_ids=card_seen_ids, register_bias="spoken",
                topic_bias=learner_recent_topics)
```

`register_bias="spoken"` is the whole change. Every one of the 903 v2 entries has at least one
`spoken` context (§1.5), so the bias resolves for all of them, and the 343 v1 entries fall through to
`own_context_sentence` and `example_sentences[]` via `SENTENCE_SOURCE_ORDER` (`context.py:90-98`)
with no special-casing. `[verified]`

The learner's own harvested sentences still outrank authored ones on provenance (rank 1 beats rank
2), but **unseen-first outranks provenance** (key 0 above key 1, and the docstring explains why:
*"the difference between learning a word and memorising one sentence"*). So the rotation works: three
contexts, three presentations, no repeat, exactly as designed for cloze — with the pleasant side
effect that a learner who meets an entry at R1, then R2, then R3 speaks three *different* sentences.
`[verified]`

### 4.4 The 343 v1 entries

They have no `contexts[]`, no `gap_span`, no `chunk.open_slots`, no `register`, and no
`unique_answer` assertion. `[measured]` They are not excluded — that would make the feature
unpredictable — they are **degraded by rung**:

- **R1 Echo works fully.** The sentence is `own_context_sentence`, and the token to listen for is
  found by `cloze_from_sentence()` (`exercises.py:237-272`), which already handles inflections and
  multi-word phrases and already reports `blanks == 0` when the word is not in the sentence.
- **R2 Swap is not offered** — there are no authored slots and inventing one at runtime is exactly
  the "runtime-generated choice item wearing a real one's costume" that `DESIGN.md` §1.2 warns
  against.
- **R3 Own works fully** — it needs only a headword and a definition, which `eligible_types` already
  checks for `use_in_sentence` (`exercises.py:325`).

So a v1 entry gets a two-rung ladder and a v2 entry gets three. That is the honest consequence of the
content state and it needs no code to express beyond the `has_slots` check.

---

## 5. The accent rule, made structural

`docs/plan/09-pronunciation-assessment.md` §0 is non-negotiable: scores measure **intelligibility**,
never proximity to a native accent. This section is how that survives contact with an ASR.

### 5.1 What the rule means when the exercise is a grammar exercise

Sharper than in the pronunciation module, and easier. A grammar item's job is to find out whether the
learner can build the present perfect. **If the transcript contains a correctly built present
perfect, the item passes — regardless of how the words were pronounced.** A Tamil, Sinhala, Nigerian
or Indian English speaker who says *"I have worked here for six years"* and is transcribed correctly
gets a pass identical in every byte to anyone else's.

The accent can only affect the outcome through one channel: the ASR mishearing a word. §5.3 shows
that channel is real and non-trivial. §5.4 closes it — not by measuring the accent, but by making the
consequence of a mishearing a **retake, never a lower rating**.

### 5.2 The word-confidence trap, named so it can be refused in review

`transcribe_words()` returns a per-word `confidence` (`analyze.py:208-250`), and
`pron/analyze.py`'s entire v1 method is *"flag words with ASR confidence < 0.55"*
(`low_confidence_words()`, `analyze.py:275`, threshold `analyze.py`, `METHOD = "proxy-v1"`,
`score: null` serialised because — the module's own words — *an ASR confidence is not a GOP*.)
`[verified]`

**Those confidences must not reach a grammar or vocabulary rating.** Ever. Not as a tie-breaker, not
as a "partial credit" term, not as a warning icon next to a word.

The reason is mechanical and it is the documented failure mode of naive GOP scoring, one layer up:
an acoustic model's posterior probability for a word is lower when the acoustics diverge from its
training distribution, and accent is precisely such a divergence. A rating that reads word confidence
is a rating that scores accent, whatever the variable is called in the code. The pronunciation module
may use them, because it is explicitly a pronunciation module, it labels its method `proxy-v1`, and
it refuses to emit a score. A grammar card has none of those protections.

**Concretely, in review:** if a diff to the grammar or vocabulary path reads `confidence`,
`avg_logprob`, `no_speech_prob`, or calls `low_confidence_words`, `score_from_confidence` or
`fluency_proxies`, it is wrong unless it is inside Gate 0 (§6) and its only possible output is
*"retake"*. `[design]`

### 5.3 Why "a mishearing must never lower a rating" is arithmetic, not sentiment

The most careful public number I could find for Whisper on second-language English:
McGuire (2025), *Automatic Speech Recognition for Non-Native English: Accuracy and Disfluency
Handling*, evaluates five ASR systems on the **L2-ARCTIC** corpus — 2,400 single-sentence read
recordings from 24 speakers across six L1 backgrounds (Arabic, Chinese, Hindi, Korean, Spanish,
Vietnamese). On read speech, **Whisper achieved a mean Match Error Rate of 0.054**, the best of the
five alongside AssemblyAI at 0.056; on spontaneous narrative speech RevAI led with a mean MER of
0.063. `[verified, fetched]`

MER ≈ 0.054 is genuinely good — the paper describes read-speech results as approaching human-level
accuracy. Now apply it to our sentences. Our vocabulary contexts have a **median of 13 words**
`[measured]`. Treating token errors as independent — which they are not, so read this as an order of
magnitude and not a prediction `[design, my arithmetic on a cited rate]`:

> P(at least one token wrong in a 13-token sentence) = 1 − (1 − 0.054)¹³ ≈ **52%**

**About half of all correctly-spoken Echo attempts will contain at least one ASR error.** An exact-
match grader would fail every one of them. That single number is the justification for the entire
grading design in §4.1: `gap_span` present plus 60% token overlap, not exact match; a mishearing
outside the target span costs nothing at all.

Three caveats I will not paper over:

1. **L2-ARCTIC's six L1s do not include Tamil, Sinhala or any Nigerian language.** Only Hindi is
   close to the populations the accent rule names. We have **no evidence** about our actual users
   `[unverified]`, and that absence is itself an argument for the lenient design: we cannot claim the
   error rate is 5.4% for a Sinhala speaker, so we must not build anything that breaks if it is 15%.
2. **The 0.054 is read speech.** R1 Echo is read speech. R3 Own and every grammar `produce` item are
   spontaneous, where the same paper's best system managed 0.063 and Whisper was not the leader.
3. **These are large hosted systems on a full-size model.** We run **`base`, 74 M parameters, int8-
   quantised on CPU** (§1.6), which is the smallest useful Whisper checkpoint. Our real error rate is
   `[unverified]` and is very unlikely to be *better* than the published figure.

Every one of those three points argues the same way: **be lenient, and put the cost of an ASR error
on the app, not on the learner.**

### 5.4 The three mechanisms that implement it

1. **No exact-match grading, anywhere.** R1 and R2 use span-presence plus overlap. R3 and grammar
   `produce` go to an LLM that has been told the input is a transcript and to ignore transcription
   artefacts (§3.3).
2. **A mishearing produces a retake, never a rating.** Gate 0 failures and learner-disputed
   transcripts write **no review row at all**. The card's schedule is untouched; the learner has lost
   fifteen seconds, not a day of stability.
3. **"That's not what I said" is a first-class control, not a support channel.** It appears next to
   every transcript, it always works, and pressing it is logged. Those log rows are the only dataset
   we will ever have about how this model performs on our actual users' accents, and they cost
   nothing to collect. `DESIGN.md` §2.9's closing line applies exactly: *a module that cannot be told
   it is wrong will stay wrong.*

---

## 6. Gate 0 — the silence and hallucination guard

This is the one genuinely new piece of logic and it is required, not optional.

Whisper generates fluent text on non-speech input. Barański et al. (ICASSP 2025), *Investigation of
Whisper ASR Hallucinations Induced by Non-Speech Audio*, show that *"there exists a set of
hallucinations that appear frequently"* when the model is fed various interfering sounds, and build a
"bag of hallucinations" post-filter that reduces WER as a safeguard. `[verified, fetched]` The
commonly reported artefacts are subtitle-style strings — *"Thank you for watching."*, *"Subtitles
by…"* — a consequence of the training data. `[verified via search results; the specific strings are
widely reported in issue trackers and are `[unverified]` as a canonical list]`

**The failure this creates here is severe and silent.** A learner taps Record, says nothing because
their microphone is muted at the OS level, and the transcript is *"Thank you for watching."* That
string goes to `judge_production`, which rejects it with complete confidence and a perfectly
reasonable explanation, and the learner is told their grammar is wrong when they did not speak.

**`transcribe_answer()` runs all four checks before anything is graded** `[design]`:

```python
async def transcribe_answer(wav_path: Path) -> AnswerAudio:
    """(transcript, words, duration_ms, heard: bool, reason: str|None).

    `heard=False` means WE failed, not the learner. Callers must retake, never grade.
    """
    words, transcript, duration_ms = await drills.transcribe(wav_path)
    # 1. too short to contain a sentence
    if (duration_ms or 0) < 700:                        return not_heard("too_short")
    # 2. nothing decoded
    if not transcript.strip():                          return not_heard("silent")
    # 3. a long take that decoded to almost nothing — the classic silence signature
    if (duration_ms or 0) > 3000 and len(transcript.split()) < 2:
                                                        return not_heard("silent")
    # 4. a known hallucination, matched on the WHOLE normalised transcript only
    if normalize(transcript) in HALLUCINATION_BLOCKLIST: return not_heard("silent")
    return AnswerAudio(clean_disfluencies(transcript), words, duration_ms, heard=True)
```

Four notes on the details, all of which matter:

- **Enable Whisper's own VAD for these takes.** `analyze.py:230` calls
  `model.transcribe(..., vad_filter=False)` `[verified]` — correct for the pronunciation module,
  which must not have chunks of the learner's turn silently dropped. For a 12-second answer,
  `vad_filter=True` is the cheapest available hallucination defence and faster-whisper bundles the
  Silero VAD. **Add a parameter to `transcribe_words()`; do not change its default**, because the
  pron module's behaviour is deliberate.
- **The blocklist matches the entire normalised transcript, never a substring.** A learner may
  legitimately say *"thank you"*. Keep the list short and derived from what we actually observe, not
  from a blog post.
- **The 700 ms floor catches the double-tap** — the learner presses Record and immediately Stop —
  which is otherwise indistinguishable from silence.
- **Disfluency cleaning happens here, once**, so the detector, the LLM and the displayed transcript
  all see the same string. Show the learner the *cleaned* transcript; showing them their own `um`s
  serves no purpose and reads as a criticism.

**What Gate 0 must never do:** infer that the learner was unclear. Its only outputs are *heard* and
*we failed*. Every reason string maps to copy about the recording, never about the speaker
(§3.4).

---

## 7. The exact UI

### 7.1 Vocabulary — where the buttons sit

The card is `ExerciseCard.tsx`, unchanged: badge row, prompt line, `<Body>`, then the divider and the
`RatingBar` (`ExerciseCard.tsx:109-186`). Only the body changes, and the body is
`SpeakingDrillExercise.tsx`.

Layout, top to bottom, R1 Echo:

```
┌──────────────────────────────────────────────────────────────┐
│  [Speak]  [Young]  was 2 days ago                            │  existing badge row
│                                                              │
│  Say this sentence out loud.                                 │  exercise.prompt
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │ stem from                          [ 🔊 ]  │              │  headword + LISTEN
│  │ phrase · to be caused by something         │              │  (WordAudioButton, unchanged)
│  └────────────────────────────────────────────┘              │
│                                                              │
│  ▌ Most of the delays **stem from** a shortage of            │  the chosen sentence,
│  ▌ qualified drivers.                          [ 🔊 Listen ] │  gap_span in bold
│                                                              │
│         ┌───────────────────────────┐                        │
│         │   🎤   Record  ·  12s     │                        │  the NEW control
│         └───────────────────────────┘                        │
│      Say it however you say it. We check the                 │  the accent line
│      words, not the accent.                                  │
│                                                              │
│  ─────────────────────────────────────────────               │
│  [ Again ] [ Hard ] [ Good ] [ Easy ]                        │  existing RatingBar
└──────────────────────────────────────────────────────────────┘
```

The rules the drawing encodes `[design]`:

- **Listen and Record are never the same control and never adjacent.** Listen is a `Volume2` icon
  button, top-right of its block, ghost/outline, and it is exactly the component that ships today.
  Record is a `Mic` icon, full-width-ish, centred, primary, on its own row. The owner called the
  existing button a "speak button"; the UI must never let anyone make that mistake again.
- **The mic button replaces the muted advisory box that is there now**
  (`SpeakingDrillExercise.tsx:40-55`), which currently contains a `Mic` icon and the sentence *"Say
  one full sentence using it, out loud. Self-rated: BandReady does not listen here."* Same position,
  same visual weight, and the copy becomes true.
- **The `Show answer` / reveal button is relabelled.** `ExerciseCard.tsx:25-32`'s `REVEAL_LABEL` maps
  `speaking_drill` to `"I said it"`. With a real recorder that becomes **`Skip the recording`**, and
  it still works — it commits with `suggestedRating: null` and the learner rates themselves, which is
  the existing behaviour and the correct one for someone in a quiet carriage.
- **Space still reveals and 1–4 still rate** (`ExerciseCard.tsx:86-104`). Add **R** for record.
  `isTypingTarget()` already guards text fields.

### 7.2 Grammar — where the tab sits

`ProduceItem` (`ProduceItems.tsx:38-100`) gains a two-tab segmented control immediately above the
answer area, preselected by `item.register` (§3.1):

```
  Your team took over a service at the start of this year and you are
  still running it. Say one sentence about something that is different
  there now.

  [ Use: present perfect ]  [ ✨ and the word "deteriorate" ]      ← unchanged, ProduceItems.tsx:52

  ┌──────────┬──────────┐
  │  Say it  │ Type it  │                                          ← NEW, preselected by register
  └──────────┴──────────┘

        ┌────────────────────────────┐
        │   🎤   Record  ·  25s      │
        └────────────────────────────┘
     Say it however you say it. We check the grammar, not the accent.
```

The tab is not a mode switch buried in settings. It is on the card, both options are always live, and
the learner's last pick persists for the session. `[design]` A learner who wants to write everything
should never have to fight the app, and a learner who wants to say everything should be able to.

`apply_to_task` (S5, 147 items) gets a 45-second take and the same tabs. Its prompts are two-sentence
rewrites of a real paragraph, so it is the closest thing in the module to an exam-shaped spoken task,
and it is the item where speech is most obviously the right modality.

### 7.3 While recording, and immediately after

`DrillRunner.tsx:374-391` is the precedent and it should be copied, with one addition.

**While recording** — the button becomes destructive-toned **`Stop (9s)`** with a `Square` icon,
counting down from `recorder.remaining`. `useRecorder` self-stops at the deadline, so the learner
never has to press anything.

**The addition: a live level indicator.** `useRecorder` today exposes `state`, `remaining`, `error`,
`record`, `stop` — and no amplitude. A countdown tells the learner that time is passing; it does not
tell them the microphone is live. Silence is the number one failure of any record-then-grade feature
(§6), and the moment to catch it is *during* the take, not after it. **Add an optional
`level: number` (0–1) to the `Recorder` interface**, computed from an `AnalyserNode` on the same
`MediaStream` the hook already holds in `streamRef` (`useRecorder.ts:49`). Additive, ~20 lines, no
change to any existing caller — and `DrillRunner` gets a free upgrade. `[design]`

Render it as three or four bars beside the countdown. If the level stays at zero for two seconds,
show one quiet line — *"We're not hearing anything yet."* — which is the only place in this design
where the app comments on the audio before the take is over, and it comments on the *signal*, never
the speaker.

**Immediately after**, in this order and no other:

1. **`Checking…`** on the button. This is a real wait — local Whisper `base` on CPU plus, at R3, an
   LLM round trip. It must be a spinner on the control the learner just pressed, not a full-card
   skeleton, because the transcript is about to appear underneath it and the sentence they spoke
   should not move.
2. **The transcript**, quoted, with **`That's not what I said`** beside it. Before the verdict.
   Always. (§3.4 beat 1.)
3. **The verdict bar**, green or amber, never red.
4. **The rest of the panel** — `why`, `minimal_fix` as an inline diff, `feed_forward`, appeal,
   **`Say it again`**.
5. **The rating bar**, with the computed rating pre-selected and the learner free to override
   (`RatingBar`, `suggested={result?.suggestedRating}` — the existing contract at
   `ExerciseCard.tsx:161-167`).

**Audio retention.** `speaking_drills.py:292-296` writes attempts to `media/pron/attempts/<ULID>.wav`
and the comment at `pron.py:222-224` records why they are never registered in `media_files`: *"this
is user voice data — it is NOT registered in media_files and is therefore never reachable by the LRU
cache sweep."* `[verified]` For grammar and vocabulary answers, the honest default is **not to keep
the audio at all** `[design]`: nothing downstream reads it, the learner has the transcript, and a
folder of a learner's voice that no feature uses and no sweep clears is a liability. Transcribe from
the temporary file, then delete it. If a "listen back to yourself" feature is ever wanted, it can be
added deliberately with its own retention setting.

---

## 8. Degradation — both required cases, and two more

The rule for all four: **the learner lands on a working exercise for the same card, in place, without
losing their session.** Never a dead end, never a disabled button with no explanation, never a
20-second recording followed by "we can't process this".

### 8.1 No microphone permission

**Detection.** `useRecorder.record()` already resolves the states: `denied` (from `NotAllowedError`
or `SecurityError`), `unsupported` (no `MediaRecorder`), plus mapped copy for `NotFoundError` — *"No
microphone was found"* — and `NotReadableError` — *"The microphone is in use by another app"*
(`useRecorder.ts:29-41`). `[verified]` MDN confirms those exact exception names and that browsers
must ask at least once and may then persist the grant per origin. `[verified, fetched]`

**Behaviour.**

| Rung / item | Falls back to | Same card? |
|---|---|---|
| Vocab R1 Echo | `cloze` on **the same sentence** — the `gap_span` becomes the blank | yes |
| Vocab R2 Swap | `cloze` on the same sentence | yes |
| Vocab R3 Own | `use_in_sentence` — the typed twin, same prompt | yes |
| Grammar `produce` / `combine` | the **Type it** tab, already on screen | yes |
| Grammar `speaking_drill` | the existing self-rating buttons | yes |

One banner above the fallback, using `recorder.error` verbatim (it is already learner-readable), plus
**`Try the microphone again`**. **Remember the denial for the session** and stop offering
`speaking_drill` from `eligible_types` until it is retried — asking for permission on every third
card is how an app gets its microphone permission permanently revoked. `[design]`

Because Electron already grants `media` to our own origin (§1.7), a denial on macOS almost always
means the OS-level TCC toggle. The banner should say so once, with the actual path: *"macOS has
microphone access switched off for BandReady. System Settings → Privacy & Security → Microphone."*

### 8.2 No STT provider configured

**This is the more likely of the two, and today it is the default for a fresh install.**
`faster-whisper` is **not a core dependency**: `sidecar/pyproject.toml:25-29` puts it in the optional
`voice` extra alongside `pipecat-ai[...]`. `[verified]` A sidecar installed without that extra has no
STT at all, and `_load_whisper()` handles it by design (`analyze.py:181-205`): it logs *"faster-
whisper is not installed — pronunciation v1 runs transcript-only"* and returns `None`, after which
`transcribe_words()` returns `([], "")`. `[verified]`

**The problem is that the renderer cannot currently find this out**, and the worst possible UX is a
learner speaking for twenty seconds into a system that was never going to transcribe it.

**Required: a capability probe, consulted before a mic button is ever drawn.** `[design]`

```
GET /api/v1/pron/capabilities
→ { "stt": { "available": true, "engine": "faster_whisper", "model": "base",
             "loaded": true, "reason": null },
    "accent_notice": "…" }
```

It belongs on the `pron` router beside the nine routes already there, it should attempt a cheap load
and cache the result, and it must distinguish *not installed* from *installed but the weights are not
downloaded* — `_load_whisper()` already tries `local_files_only=True` then `False`
(`analyze.py:215-225`) `[verified]`, and on a slow connection those are very different messages for
the learner.

**Behaviour when `available: false`:** `speaking_drill` is not offered by `eligible_types` at all
(the `speech_available` filter in §4.2), and the grammar **Say it** tab is not rendered. Not
disabled — **not rendered**. A greyed-out button the learner cannot fix is worse than no button.

One line in Settings, where it can be acted on: *"Speaking practice in Grammar and Vocabulary needs
the speech recogniser. It is a 141 MB one-time download."* — a number that is true `[measured]` and
that matters on a slow connection.

**One deliberate exception worth building:** offer **`Record anyway and rate yourself`**. The take is
made, nothing is transcribed, nothing is graded, and the learner rates themselves — which is exactly
what `SpeakingDrillExercise` does today, and exactly what `judge_production` does when the LLM is
unreachable. It keeps the habit alive on an offline machine, and it is honest about what it is.
`[design]`

### 8.3 STT works, LLM does not

Worth stating because it is the case where this feature is *better* than the typed one.

- **R1 Echo and R2 Swap work completely.** Their grading is token alignment
  (`speaking/drills.py:235-305`) and never touches a model.
- **R3 Own** → `check_sentence()` returns `checked: False, suggested_rating: 3` and the learner rates
  themselves (`exercises.py:642-650`). `[verified]`
- **Grammar `produce`** → `judge_production` returns `checked: False` and `post_answer` returns
  `{"committed": false, "beat": "self_rate"}` (`grammar.py:960-970`). `[verified]`

So on a laptop with the voice extra installed and no LLM configured — a perfectly ordinary
BandReady setup — the vocabulary speaking ladder still delivers two fully-graded rungs, while
`use_in_sentence` delivers nothing gradable at all.

### 8.4 The take produced no usable audio

Gate 0 (§6). Retake, no rating, blame in the first person, and after two consecutive failures offer
the typed fallback with the microphone still available. Never three strikes; two is where a learner
starts blaming themselves.

---

## 9. SRS wiring — what a pass and a fail do to the card

### 9.1 Vocabulary

Path unchanged: `POST /api/v1/srs/review` with `exercise_type: "speaking_drill"`, which is already in
the route's `Literal` (`srs.py:44-46`) and already legal in `srs_review_logs.review_type`
(`models.py:877-881`). One `srs_cards` row, one review log, one FSRS call. `[verified]`

| Outcome | Suggested rating | Note |
|---|---|---|
| R1/R2: `gap_span` heard, ≥ 60% overlap, first take | **3** `good` | |
| R1/R2: passed on the second take after a rejection | **2** `hard` | mirrors `grade_answer`'s `attempts > 1` branch, `exercises.py:582-584` |
| R1/R2: target span not heard | **1** `again` | and the panel shows the diff, so the learner sees *which* words |
| R3: `check_sentence` → `acceptable: true` | **3** | exactly `check_sentence`'s own mapping, `exercises.py:664` |
| R3: `acceptable: false` | **1** | with `issues[]` and `better_version` |
| R3: `checked: false` (LLM down) | **null** → learner rates | `exercises.py:642-650` |
| **Gate 0 failed, or transcript disputed** | **no review row is written at all** | the card's schedule is untouched |
| Learner pressed `Skip the recording` | **null** → learner rates | existing reveal behaviour |

The last two rows are the ones to defend in review. **A microphone failure is not a memory failure**,
and writing rating 1 for one would corrupt the card's difficulty estimate with a fact about the
hardware. `DESIGN.md` §1.6 makes the same argument about typos: *"a false lapse poisons FSRS's
difficulty estimate for that card and it poisons the learner's trust in the same move."*

Every rating stays a **default the learner may override** — `RatingBar` receives `suggested` and the
learner presses whichever they mean (`ExerciseCard.tsx:161-167`). `[verified]`

### 9.2 Grammar

Path unchanged: the spoken route transcribes, then executes the existing `post_answer` body with
`answer=<transcript>` (`grammar.py:884-1052`). That gives, in one transaction:
`judge_production` → `practice.outcome_for()` → `practice.apply_outcome()` → FSRS
`scheduler.review()` → `grammar_review_logs` row → `mastery_report`. `[verified]`

`DESIGN.md` §1.8's outcome map applies unmodified:

| Outcome | `outcome` | Rating |
|---|---|---|
| accepted, first take | `pass` | 3 `good` |
| accepted, first take, fast, at or above the card's stage | `pass` | 4 `easy` |
| accepted after a rejection and a retake | `self_repair` | 2 `hard` |
| rejected, answer shown | `fail` | 1 `again` — and at S ≥ 3 the point **drops one stage**, with a re-teach card before the retry |
| `checked: false` (LLM down) | — | `{"committed": false, "beat": "self_rate"}` |
| **Gate 0 failed, or transcript disputed** | — | **nothing committed** |

Three spoken-specific rules `[design]`:

1. **A retake caused by Gate 0 does not increment `attempts`.** Only a retake after a *verdict* does.
   The `attempts` counter measures retrieval difficulty; a silent microphone is not a retrieval.
2. **Latency thresholds do not apply to spoken items.** `STAGE_LATENCY_MS`
   (`srs/context.py:104`) sets `S4: None, S5: None` already, so this is already true — but it must
   stay true, because `elapsed_ms` on a spoken item includes the take, the upload and the model call,
   and none of that is thinking time.
3. **Modality is recorded on the log row and shown.** `grammar_review_logs` has no column for it, so
   it goes in the existing `error_codes_json`-adjacent payload or a new nullable column — but the
   progress screen should be able to say *"you have said this one under pressure"*, which is
   materially different from *"you have written it"*, and it feeds mastery condition 3 (§3.6).

### 9.3 The cross-module bonus, which is nearly free

`DESIGN.md` §1.5 rule 7 and `ProduceItems.tsx:56-61` already implement `seed_from_vocab_queue`: a
grammar `produce` item borrows a word from the learner's due vocabulary queue, and one answer reviews
a grammar card and a word card. **`seed_from_vocab_queue: true` is set on all 147 S4 `produce`
items.** `[measured]`

Spoken, that becomes: *"Say one sentence about something that is different there now — use the
present perfect, and the word **deteriorate**."* One 25-second take, two cards reviewed, both by
machinery that already exists. It is the owner's original ask — *vocabulary practised with real
sentences* — with the last modality attached.

---

## 10. Build order

| # | Change | Where | Size | Unblocks |
|---|---|---|---|---|
| 1 | `GET /api/v1/pron/capabilities` | `routes/pron.py` | S | everything — nothing may draw a mic without it |
| 2 | `transcribe_answer()` + Gate 0 + disfluency cleaning + `vad_filter` parameter | new `speech/answers.py`, `pron/analyze.py` | S–M | 3, 4 |
| 3 | `POST /api/v1/vocab/speak` (multipart, `wav` **or** `transcript`) | `routes/vocab.py` | S | 5 |
| 4 | `POST /api/v1/grammar/answer/spoken` (same shape) | `routes/grammar.py` | S | 6 |
| 5 | `eligible_types` learns `speaking_drill` + the three rungs in `build_exercise` | `srs/exercises.py` | M | 7 |
| 6 | `useRecorder` gains `level` | `components/practice/useRecorder.ts` | S | 7, 8 |
| 7 | `SpeakingDrillExercise` grows a recorder + the three rungs | vocab | M | — |
| 8 | `ProduceItem` gains Say it / Type it; `SpeakingDrillItem` gains a recorder | grammar | M | — |
| 9 | Settings line for the STT download; the macOS TCC banner | settings, shared | S | — |

**Ship 1–3, 5, 7 first.** The vocabulary Echo rung is the smallest complete slice: it needs no LLM,
it works on all 1,246 entries, it exercises Gate 0, the capability probe, the transcript-first panel
and the "that's not what I said" control, and it is the rung with the most forgiving grading. If it
does not feel good on a real learner's accent, nothing built on top of it will either.

**One test that must exist before any of it ships, because it is the accent rule as an assertion:**
feed the grading path a transcript containing a correctly built target structure with three unrelated
words wrong, and assert the item passes. Then feed it a transcript with the target structure wrong
and everything else perfect, and assert it fails. If those two tests pass, the design holds.

---

## 11. What I could not verify

- **The Systran CTranslate2 conversions' own licence declaration.** `huggingface.co` is blocked from
  this environment. openai/whisper's MIT licence on code *and* weights is verified from its GitHub
  README; the conversion is a format change of those weights, but someone should read the model card
  before this is quoted in a licence file.
- **Whisper `base`'s real error rate on Tamil-, Sinhala- or Nigerian-accented English.** No
  published number found. L2-ARCTIC's six L1s do not cover them, and the one number I do have is for
  larger hosted systems on read speech (§5.3).
- **Whether faster-whisper is actually installed in the DMG build.** It is in the `voice` optional
  extra (`pyproject.toml:25-29`); which extras the packaging step installs is decided in the build
  scripts and I did not trace them. §8.2 is written to be correct either way, but **someone should
  check, because it decides whether this feature is on or off for the median user.**
- **Real end-to-end latency** for a 12-second take on a 16 GB laptop with `base` int8 on CPU.
  `DrillRunner` does the same thing today and ships, so it is evidently tolerable, but no number was
  measured for this document.
- **Whether the two `speaking_drill` grammar items were a deliberate scoping decision or an
  oversight.** The content lint permitted `apply_to_task` as the S5 mode and every author took it 147
  times out of 147.

---

## Sources fetched

- IELTS scoring in detail — the four equally-weighted Speaking criteria (*Fluency and coherence*,
  *Lexical resource*, *Grammatical range and accuracy*, *Pronunciation*):
  https://ielts.org/organisations/ielts-for-organisations/ielts-scoring-in-detail
- openai/whisper — MIT licence on code and model weights; the model size table (`base` = 74 M
  parameters): https://github.com/openai/whisper
- SYSTRAN/faster-whisper — audio decoded with PyAV, which bundles the FFmpeg libraries, so system
  FFmpeg is not required: https://github.com/SYSTRAN/faster-whisper
- McGuire, *Automatic Speech Recognition for Non-Native English: Accuracy and Disfluency Handling* —
  five ASR systems on L2-ARCTIC, 2,400 read sentences from 24 speakers across six L1s; Whisper mean
  MER 0.054 on read speech, RevAI 0.063 on spontaneous: https://arxiv.org/abs/2503.06924
- Barański, Jasiński, Bartolewska, Kacprzak, Witkowski, Kowalczyk, *Investigation of Whisper ASR
  Hallucinations Induced by Non-Speech Audio* (ICASSP 2025) — a recurring set of hallucinations
  induced by non-speech input, and a "bag of hallucinations" post-filter:
  https://arxiv.org/abs/2501.11378
- MDN, `MediaDevices.getUserMedia()` — the exact rejection names (`NotAllowedError`, `NotFoundError`,
  `NotReadableError`, `SecurityError`, `OverconstrainedError`, `AbortError`, `InvalidStateError`,
  `TypeError`) and per-origin permission persistence:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN, `MediaRecorder.isTypeSupported()` — WebM/Opus is the documented example container; `audio/wav`
  is not among them: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported

## Repo commands behind the `[measured]` claims

```bash
wc -l content/core-en/data/vocab.jsonl content/core-en/data/grammar.jsonl
python3 - <<'PY'   # per-entry contexts, registers, gap_span substring check, sentence dedup
import json, collections
# iterate vocab.jsonl, parse entry_json, count contexts[]/example_sentences/own_context_sentence
PY
python3 - <<'PY'   # grammar item kinds, stages, registers, produce modes, detector coverage
import json, collections
# iterate grammar.jsonl, parse point_json, count items[] by kind/stage/register/payload.mode
PY
du -sh ~/.cache/huggingface/hub/models--Systran--faster-whisper-base
ls -laL ~/.cache/huggingface/hub/models--Systran--faster-whisper-base/snapshots/*/
```
