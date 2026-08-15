# VERIFY — learner walkthrough of the live app

Method: drove the running dev app at `http://localhost:5273` (sidecar `127.0.0.1:8710`)
through the browser as a learner would. Walked all eleven feature routes, the whole
first-run wizard from step 1, every Settings tab including Advanced, a vocabulary review
card, a reading attempt, and both Pronunciation tabs. Checked 1280 and 1024 wide.

Baseline before any edit: **581 app tests / 54 files green**, `tsc --noEmit` clean.
After the fixes below: **581 / 54 still green**, `tsc --noEmit` clean. No test was changed
or deleted.

The backend suite was **not** run to completion: the machine had six concurrent `pytest`
processes from other sessions and the run was still going after ~25 minutes. Every change
below is in `app/src/**` TypeScript — no Python and no content file was touched — so the
sidecar suite cannot be affected. Worth a confirming run when the machine is quiet.

A caveat on the console: this browser profile was shared with another session that was
editing files while I browsed. The session log contained a cluster of
`ReferenceError: levelLabel / shaky / pct / path / loadPath / instruction / REGISTER_LABEL
is not defined` crashes in `PatternCard`, `PointHeader`, `PathMap`, `MinimalPairDrill`,
`ExerciseCard` and `SessionScreen`. **None reproduce.** Every one of those identifiers
exists in the source, and I re-walked all of those screens live with zero console errors.
They were stale-HMR renders from concurrent edits. I reproduced the same artefact myself
after one of my own edits, and a hard reload cleared it. Nothing to fix; noted so the next
reader does not chase them.

---

## 1. Blockers

### 1.1 The theory reference rendered its core teaching blocks as `[object Object]` — FIXED
`app/src/features/grammar/components/theory/ArticleBody.tsx`

`ArticleBody.tsx` was written against a different block schema than the one
`content/core-en/data/theory.jsonl` actually ships and `GET /api/v1/theory/articles/{id}`
actually serves. Verified live against the API, not just the file. Four separate mismatches,
all in the module the app calls its always-readable reference:

| What the content ships | What the renderer read | What the learner saw |
|---|---|---|
| `minimal_pairs[].a` / `.b` as `{text, means, span}` | `String(pair.a)` | `[object Object]`, twice per pair |
| `minimal_pairs[].only_difference` | `pair.difference` | line silently dropped |
| `contrast.options[].use_it_when` | `option.when` | blank line under every option |
| `summary.headline` + `summary.table` | `points` / `text` | an empty green "In short" box |
| `examples.lead_in`, `examples.so_what` | not read | a run of unexplained sentences |
| `table.footnotes` | not read | dropped |
| `contrast.deciding_factor` / `trap` / `register_note` | not read | dropped |

Scale, counted over the 99 shipped articles:

- **150 minimal pairs across 39 articles** printed `[object Object]` — 300 lines of it.
- **96 of 99 articles** ended with an empty "In short" panel: `points` is `null` in 96 of
  them and `text` is never authored at all, so the callout rendered its label and nothing else.
- **All 88 contrast options** dropped their `use_it_when` explanation.
- **209 examples blocks** lost both their lead-in and their conclusion.
- **109 table footnotes** dropped.

Fixed all of it. Verified live on `th_describing_words`: zero `[object Object]`, the pairs
render both sentences plus their meanings plus "Only difference: …", the "In short" box now
carries its headline and recap table, and the examples block has its lead-in back.

### 1.2 Markdown emphasis printed as raw asterisks — FIXED
`app/src/features/grammar/components/theory/TheoryScreen.tsx`

`ArticleBody.tsx` has a `RichText` helper that resolves `**bold**` and `*italic*`, with a
comment above it reading *"authoring syntax is never learner-facing."* It was private to
that file, so `TheoryScreen.tsx` printed the raw markup. The theory index alone showed
**156 literal `*word*` strings** — "why the `*-ly*` test lets you down". Inside an article,
the title, `also_called`, `one_line`, `short_answer`, table captions, table headers and
every table cell all leaked asterisks.

Exported `RichText` and applied it to all of those. Index now shows zero.

### 1.3 Settings' health check swallowed every failure — FIXED
`app/src/features/settings/components/SimpleSetup.tsx`

The three-job "Is everything working?" rows had exactly two states: `ok === true` → a
"Working" badge, otherwise → a "Check" button. **There was no failure branch at all.**

A learner clicks "Check" on "The examiner". `POST /api/v1/providers/verify` fires, returns
200 with `{ok: false, state: "unreachable", detail: "could not connect to
http://127.0.0.1:11434/v1 — is the server running?"}` — and the screen renders exactly what
it rendered before the click. No message, no colour change, nothing. I confirmed this by
polling the row for five seconds after the click and watching the network tab.

This is the screen onboarding step 4 sends people to ("Settings has this screen again
whenever you want it") to fix the one thing the app cannot do on its own, so it is the
worst possible place for a silent no-op. It also breaks the standing rule that every error
says what to do next.

Added a failure branch that maps `state` to a sentence ending in an action —
"Not answering. If it runs on this computer, start it first, then check again." /
"The key was rejected. Open Advanced settings and paste it again." — tints the row, and
relabels the button "Check again". Verified live: the LLM row now explains itself, and the
TTS row still goes green with "Working".

---

## 2. Structural — not fixed, needs a decision

### 2.1 The placement test does not resume, and the screen promises it does
`app/src/features/onboarding/store.ts`

Step 7 tells the learner, in as many words: *"You can stop between sections; the sitting is
saved on this machine and resumes where you left it."* The store's own header comment at
line 6 says the same: *"a reload resumes rather than restarts."*

Neither is true in the UI. `StoredDraft` persists only `{draft, step_index}`. `phase` is
hardcoded to `"wizard"` and `placementId` to `null` at line 225/250, and nothing calls
`GET /placement/next` on mount to recover an open sitting. I hit this by accident — a reload
during the reading section dropped me back on the step 7 offer screen with the sitting
abandoned. The sitting really is durable on the sidecar; the client just never looks for it.

Fix is to persist `phase` + `placementId` alongside the draft and rehydrate, which is a real
change to the store's shape rather than a copy tweak — leaving it to you.

### 2.2 Placement Reading asks True/False/Not Given through bare text boxes
`sidecar` placement sampler + its onboarding renderer

The placement reading section renders four True/False/Not Given statements as free-text
inputs labelled only `Answer for question 1`…`4`. There is:

- no instruction line (no "Do the following statements agree with the information given…"),
- no placeholder,
- no TRUE / FALSE / NOT GIVEN options.

A learner cannot know whether to type `True`, `T`, `TRUE`, `Yes` or `Not Given`, and this is
the very first thing the app asks a new install to do. The contrast with the real Reading
room is stark: I started `Academic Reading Test 8` and it renders proper `TRUE` / `FALSE` /
`NOT GIVEN` buttons, a rubric line, "Write ONE WORD AND/OR A NUMBER for each answer", and
per-gap word counters. The placement sampler should reuse that renderer.

### 2.3 Speaking and Writing advertise band scoring with no marking model and no warning
`app/src/features/speaking/`, `app/src/features/writing/`

With marking deliberately left unconfigured — the path onboarding steers a new learner down
— both rooms are silent about it:

- Speaking shows a "Counts toward your band" banner, "Band scored" badges on the full mock
  and single part, and a "Sit a full mock test — 11–14 minutes" call to action.
- Writing's subtitle reads "marked against the four official criteria."

I scanned the full rendered text of both rooms for any mention of marking, a model, or
Settings: **nothing**. Home says "Writing and Speaking still need a marking model" and
onboarding says it twice, but the rooms themselves do not. A learner takes the 14-minute
mock and gets no band. The rooms need the same banner the dashboard already has.

### 2.4 "Yes, I have a date" with a blank date is silently discarded
`app/src/features/onboarding/components/steps.tsx`

`booked` is local `useState` inside `StepExam`, invisible to `examStepValid`, which returns
`true` whenever `exam_date === null`. So selecting "Yes, I have a date", typing nothing, and
pressing Continue proceeds with `exam_date: null` — I confirmed the persisted draft. The
learner's stated intent is dropped without a word, and the plan is built on the rolling
8-week horizon instead. Contrast with the study-days rule on the very next step, which does
validate ("Select at least three study days." and Continue disabled).

I added the inline warning (below), but blocking Continue means lifting `booked` into the
draft — a shape change I left alone.

---

## 3. Copy that would confuse a learner

### 3.1 Step 4 blames the learner for a choice they never made — not fixed
`app/src/features/onboarding/store.ts:131`, rendered by `steps.tsx` step 4

On a genuinely fresh run, before touching anything, step 4 opens with an alert row reading
**"The model you chose isn't answering — it may not be started yet."** The learner has
chosen nothing; the radio is still on "Not now". The shipped default settings carry
`llm.preset = "ollama"` with `model: "qwen3:14b"`, so `verify` returns `unreachable` and the
`unreachable` branch of `scoringStateSentence()` fires. There is an `unconfigured` state in
that switch with correct copy ("No marking model has been chosen yet.") that the backend
never returns here. Leading the step with a red alert and a "Check again" button for
something never configured is alarming and untrue.

### 3.2 Backend engineering notes are rendered verbatim into the wizard — not fixed
`sidecar/bandready/providers/presets.py` `notes`, surfaced in onboarding step 4

The provider `notes` strings are written for the Advanced settings screen and get printed
straight into the first-run wizard. Choosing "Use an online marking service" shows a learner
**"Covers all three modalities."** Others in the same field: "Port 8080 collides with
mlx-lm; detection disambiguates by model id.", "GUI-managed models — start the server from
LM Studio's Developer tab.", "82M ONNX voice model — the default everywhere.",
"Deterministic canned fixtures; no network." Either give presets a separate learner-facing
blurb, or suppress `notes` outside Advanced.

### 3.3 Step 5 repeats step 4's marking paragraph on a screen about audio files — not fixed
`app/src/features/onboarding/components/steps.tsx:780`

`WHAT_WORKS_NOW` — "Reading, Listening, Vocabulary and Grammar work right now… Writing and
Speaking need a marking model before anything you do there is scored." — is appended to
step 5's intro. Step 5 is "Speaking practice files" and is about downloading STT/TTS weights;
marking has nothing to do with it. The paragraph reads as a copy-paste error, and the learner
has just read the identical sentence on the previous screen. The same step also shows an
orphan card headed "Any machine + a cloud key" with no button and no explanation of why it
is on a page about local audio.

### 3.4 Overall band claimed "one or two attempts" with zero attempts — FIXED
`app/src/features/home/components/EstimateTiles.tsx`

The dashboard printed **"Low confidence — one or two attempts · starting point, no scored
attempts yet"** — the two halves of one sentence contradicting each other. The backend
returns `confidence: "low"` with `attempts_used: 0` after a skipped placement, and the
component concatenated the attempt-count-flavoured `CONFIDENCE_COPY` with the honest clause.
Straight fabricated confidence. Now reads "Starting point — no scored attempts yet" when
nothing has been scored.

### 3.5 Vocabulary card read "was 14 days ago" — FIXED
`app/src/features/vocab/components/ExerciseCard.tsx:135`

`formatDue()` returns a whole phrase — "due now", "14 days ago", "in 3 days" — and the card
prefixed it with a bare `was`, producing "was 14 days ago" (the word *due* missing) and, for
a card not yet due, the nonsense "was in 3 days". A card badged **New** also showed
"was 14 days ago". Added a `dueLabel()` helper that yields "due 14 days ago" / "due in
3 days" / "due now" without doubling the word. Verified live.

### 3.6 Grammar lesson said "Six sentences" and showed five — FIXED
`app/src/features/grammar/components/PointScreen.tsx:76`

The "Meet it first" hint hardcoded "Six sentences" while the button below it correctly
counted "Answer all 5 first" — the section contradicting itself on screen. Across the
shipped points, `notice_set` has 5 items in 125 points, 6 in 24, 2 in 5 and 3 in 2, so the
hint was wrong for **132 of 156 lessons**. Now derived from `notice.length`.

### 3.7 A past exam date showed an error but did not block Continue — FIXED
`app/src/features/onboarding/components/steps.tsx`

`StepExam` renders "That date has already passed." but `examStepValid` only regex-checked
the format, so Continue stayed live and the wizard carried a date the plan cannot be built
back from. `examStepValid` now rejects a past date too. Also added an inline note when
"Yes, I have a date" is selected with the field empty (see 2.4).

### 3.8 Developer voice on learner-facing Settings tabs — not fixed
`app/src/features/settings/`

Not Advanced — these are the plain tabs:

- **Voice**: closes with *"The volume gate is capped at 0.6 on purpose. The voice library's
  own default sits at that value and it silently blocks normal conversational speech — the
  microphone looks dead. BandReady clamps it both here and in the sidecar."* That is a commit
  message. "The sidecar" is an internal process name the learner has never met. The tab also
  puts four raw VAD numbers (`Sensitivity (confidence) 0.50`, `Speech start delay 0.20 s`,
  `Minimum volume gate 0.00`) at top level rather than behind Advanced.
- **Appearance**: *"applied before the first paint, so there is no flash on launch."*
- **Data**: "the SQLite database", "model weights", "every table as JSONL".
- **About**: "Sidecar version", "Sidecar uptime", "Schema revision 0004", "Python runtime",
  `Platform darwin · arm64`, and the `${MY_API_KEY}` environment-variable trick.
  **"Mock providers: enabled"** is the worst of these — a raw internal flag that reads, to
  anyone who parses it at all, as *this app may be showing you fake results*.

### 3.9 Raw slugs and shell commands on the Advanced screen — not fixed
Advanced is opt-in and behind `br-settings-advanced`, and a fresh install correctly starts
in the simple view, so this is a lower bar. Still: `darwin · arm64` should be "macOS ·
Apple Silicon"; `uv tool install mlx-lm` is a terminal command printed with no terminal;
`mlx-community/Qwen3-14B-4bit`, `qwen3:14b` and the voice id `af_heart` are raw ids;
"degrades noticeably below ~14B parameters" and "chat good · scoring acceptable" are jargon;
the `*` on "Base URL*", "Model*", "Voice*", "Model size*" is never explained.

### 3.10 Smaller copy notes — not fixed
- The plan built from a **60 minutes/day** answer schedules **"Wed, Aug 19 — 80 min · build"**
  with no explanation of why one day exceeds the budget, and "build" is an unglossed phase name.
- The same result screen says "Take the placement test (or 3 scored attempts per skill) to
  firm these up" — unachievable for Writing and Speaking, which cannot be scored at all
  without a marking model.
- Listening: "**1 of 4 parts are ready**" should be "is ready".
- Progress: the trajectory axis is labelled "Study week (**ISO week number**)".
- Phrases: slot tokens `X` and `CLAUSE` are shown in monospace caps with no legend.
- Vocabulary: "3 lapses" uses SRS vocabulary the learner has not been taught.
- Onboarding step 5 empty state: "No downloadable **weights** are listed for this build."
- Pronunciation's mandated accent notice says "These **scores** measure how clearly each
  sound comes across" on a tab that states it records nothing and produces no scores. The
  notice itself is required, so this is a wording question, not a rule break.

### 3.11 The mic check can spin forever — not fixed, low
`app/src/features/onboarding/components/steps.tsx`

If `getUserMedia` never settles (OS permission dialog left open), the row sits on "Waiting
for permission…" indefinitely and the only control is replaced by a bare spinner — no
cancel, no timeout, no guidance. The rejection paths are handled well ("Microphone access
was refused. Grant it in your system settings and try again."). Not a dead end, since
Continue stays available.

---

## 4. What is genuinely good

Worth recording, because it is most of the app.

- **Progress on an empty profile is exemplary.** Every panel explains what will fill it —
  "Nothing has been scored yet… Three things fill it", "No study minutes yet", "No mocks sat
  yet", "Add your test date to unlock the checklist". Not one blank panel or bare zero.
- **Home on an empty profile** is nearly as good: rest day explained, "Recall appears after
  your first week of reviews", "Your streak starts with your first session".
- **The gate holds.** Vocabulary hides the meaning until "Show answer". The reading room
  withholds everything until submit. Listening correctly disables "Start under exam
  conditions" behind "Prepare the audio to unlock this test."
- **The accent rule holds.** `SCORE_IS_PRONUNCIATION` is still `False`; Read aloud says
  "it does not score your pronunciation, and an accent is not a mistake"; the accent notice
  renders on both tabs; no band, no good/warn/poor, no "mispronounced" anywhere.
- **Dropdowns are closed.** The onboarding marking-provider select offers exactly OpenAI,
  OpenRouter, Groq, DeepSeek by brand name — no free text, no slugs.
- **Step 7 is honest** about what it cannot do: "The Writing and Speaking sections can't be
  marked yet… nothing is lost either way."
- **The simple Settings view** ("Where should the thinking happen?") is completely free of
  jargon and is what a fresh install gets.
- **The reading attempt room** is the strongest screen in the app.
- **No raw database ids reach any screen** — attempt ids appear only in the URL.

## 5. Responsive

Checked every route at **1280×860** and **1024×800**, plus the reading attempt and the
vocabulary review session. `documentElement.scrollWidth === clientWidth` everywhere: no
horizontal page scroll at either width. The only element overflowing the viewport is an
`absolute`, `pointer-events-none`, hidden tooltip span, which is harmless. Wide theory tables
are correctly wrapped in their own `overflow-x-auto` container.

## 6. Files changed

| File | Change |
|---|---|
| `app/src/features/grammar/components/theory/ArticleBody.tsx` | minimal pairs, `use_it_when`, `only_difference`, `deciding_factor`/`trap`/`register_note`, summary `headline`+`table`, examples `lead_in`/`so_what`, table `footnotes`, emphasis in captions/headers/cells; exported `RichText` |
| `app/src/features/grammar/components/theory/TheoryScreen.tsx` | `RichText` on chapter title/blurb, article title, `also_called`, `one_line`, `short_answer` |
| `app/src/features/settings/components/SimpleSetup.tsx` | failure branch for the three job checks, with a next action per `state` |
| `app/src/features/home/components/EstimateTiles.tsx` | no attempt-count confidence wording when `attempts_used === 0` |
| `app/src/features/vocab/components/ExerciseCard.tsx` | `dueLabel()` — "due 14 days ago", never "was in 3 days" |
| `app/src/features/grammar/components/PointScreen.tsx` | "Meet it first" count derived from `notice.length` |
| `app/src/features/onboarding/components/steps.tsx` | `examStepValid` rejects a past date; inline note for a blank booked date |
