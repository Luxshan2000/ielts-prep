# What BandReady does

Everything the app actually does today, read off the code rather than off the plan. It runs
from the first launch through to the exam-readiness checklist, and it covers the four exam
skills, the two foundation skills, the review layer and the platform underneath.

Counts are real: they come from `wc -l` over `content/core-en/data/*.jsonl` and from the
constants in the sidecar, not from documentation. Where something is stated as a rule, it is a
rule the code enforces, and the file is named so you can check.

Two conventions run through the whole app and explain most of what follows:

- **The gate.** Model answers, worked solutions, transcripts and answer keys stay shut until you
  have made a real attempt. The gate is enforced by the sidecar, not the browser — the gated
  fields are *absent from the response*, so there is nothing for devtools to reveal. Theory is
  the deliberate exception: it is reference, and it is open end to end.
- **Suggest, never schedule.** Practice rooms put words into an inbox. Nothing enters your review
  queue without you accepting it. The two stated exceptions are a word you add yourself and a
  study deck you opt into, and both say so on screen.

---

## 1. First run

### The onboarding wizard — seven steps

`welcome → exam → level → engines → models → mic → placement-offer`, at `/onboarding`. It is
registered with no sidebar label but stays reachable forever, so retaking placement and editing
your profile are ordinary actions rather than a one-shot funnel.

- **Welcome** — the privacy position stated before anything is collected, plus a theme picker
  applied immediately.
- **Exam and target** — Academic or General Training with the consequence spelled out (chart vs
  letter, different reading passages); target band in half steps 4.0–9.0; a test date, or a
  rolling 8-week horizon if you have not booked one. A past date blocks Continue.
- **Level and week** — self-rating with explicit band anchors (beginner ≈ 4.5 up to advanced
  ≈ 7.5); 30, 60 or 90 minutes a day, each showing the session shape it produces; study-day
  toggles that refuse to go below three.
- **Marking** — set up the model that scores writing and speaking, or decline. A live status card
  tests the *stored* slot, so it checks what your next scored attempt will really use.
- **Speech models** — the downloads for the examiner voice and speech-to-text, sorted so the
  weights the app would actually load come first. Nothing here blocks Continue.
- **Microphone check** — a live level meter driven by an `AnalyserNode`. Skipping is explicitly
  fine; only Speaking needs it.
- **Placement offer** — what the sampler is, how long it takes, and exactly what you lose by
  skipping it.

Every answer is mirrored to `localStorage` as you type, so a reload does not cost you three
screens of typing. There are two escape hatches with deliberately different consequences: step 1
writes nothing at all, while step 2 onward commits your profile and builds a plan from the
self-rating.

### The placement sitting

About 30 minutes: one reading passage, one listening part, a 100–150 word writing task and four
short speaking answers. Every section is individually skippable and a skipped skill falls back to
your self-rating, clearly labelled as self-rated.

- Durable and resumable — the sidecar owns the sitting, and the app saves after every round trip,
  so a crash costs at most one step. Reopening says *"Picking up where you left off…"* rather
  than claiming your work is being scored.
- **Adaptive** — after the first reading half, scoring 75% or better swaps the second half to the
  harder paired passage; 25% or worse pivots down.
- **Speak or type**, per question, decided by a real capability probe rather than an assumption.
  A recording is capped at 45 s and its transcript is *appended* to the box rather than replacing
  it, so a second take does not destroy the first, and it stays editable.
- Listening reports itself **unavailable** when its audio has not been rendered, rather than
  serving silence and scoring a false 0/8.
- Answer keys never reach the browser: `answers`, `explanation`, `trap_note`, `evidence_quote`
  and the listening transcript are stripped at any depth.

**Result.** Four starting bands, each with a provenance line — from the sampler, from your typed
sample, from your self-rating, or *"you answered this, but it could not be marked, so your
self-rating stands"*. Missing estimates render "—", never a made-up number. Then a plan preview
with the first five sessions.

---

## 2. Listening

Practice and Exam conditions are separate tabs, and **Practice is the default landing mode**.

| | Practice | Exam conditions |
|---|---|---|
| Playback | replay, seek, 0.75×–1.25× | plays once, no pause, no rewind |
| Transcript | reveal a part once every question in it is answered | locked until submit |
| Scoring | raw score | raw score, and a band on a full four-part test |

### Playing a test

- **Audio is generated on your machine the first time**, then cached: 30–90 s for a test, 10–25 s
  for a single part, with real progress and a cancel button. A test cannot start until every part
  is ready, and the button says so.
- **Exam transport is enforced, not merely absent.** A high-water mark yanks the playhead back if
  it drifts more than 1.5 s, which defends against media keys and the touch bar. `playbackRate` is
  pinned to 1.
- **An interrupted part can be continued** from where it stopped — without this a candidate
  silently lost the rest of a part, up to ten marks.
- Practice keeps pitch correction on at 0.75×, so slowing down stays intelligible.
- **Check step** — two minutes, modelled on computer-delivered IELTS, auto-submitting at zero. It
  shows every question with an editable box and tints the blanks.

### Question types

`form_completion`, `note_completion`, `table_completion`, `sentence_completion`,
`multiple_choice`, `matching`, `map_labelling`, `short_answer`.

The answer sheet does real work: a shared option bank prints **once** above its group rather than
once per question; a shared form, note or table is drawn **once** with numbered inputs dropped
into its gaps; table prompts render as real scrollable tables. Without that, six questions meant
six copies of the same form with literal `**1**` markers on screen. Typing a letter A–Z selects
that option. A live word-limit hint warns but never blocks. Autocorrect and spellcheck are off
throughout — they would silently fix the misspellings the marker exists to catch.

### Marking

Word limit is applied to the **raw** answer first, then normalisation: case, curly quotes, seven
dash forms, thousands separators, number words to digits (including year readings —
"eighteen ninety-two" → 1892), `N%` ≡ `N percent`. A leading article is stripped only if every
stored variant is article-free. Hyphen ≡ space.

**Spelling is exact.** No fuzzy matching, ever. A near miss (within two edits) is *tagged* so the
review screen can point at it, and it never scores a mark.

Band conversion is a fixed table — 39 → 9.0, 30 → 7.0, 23 → 6.0, 18 → 5.5 and so on — and it is
**identical for Academic and General Training**, because Listening is literally the same test for
both. A single part returns a raw score and no band.

### Review

Score, part tabs with per-part fractions, and a near-miss banner: *"3 answers were one or two
letters off. In IELTS those score nothing, so they are worth drilling."* Every question shows
what you wrote against what was accepted, the cue quote, an explanation, and a **Replay from
2:14** button. A bare letter answer is expanded to `B: the studio`, because reviewing
"You wrote B — Accepted C" a day later teaches nothing. Missed words can be sent to the
vocabulary inbox one at a time or in bulk.

### The other listening rooms

- **Accent training** — re-voice any rendered script in British, American or Australian, then A/B
  the same 30 seconds against the original. The Australian label says *"approximated with British
  voices"* because Kokoro ships no Australian voices.
- **Targeted drills** — four kinds: dictation, numbers and spelling, signposts, prediction. The
  launcher leads with *what you have been dropping*, from your own dictation history. Every drill
  is answer → check → **reveal with the audio again**; a reveal that did not end in the sound
  would be a fact rather than a lesson. Sets are stateless and seeded, so grading rebuilds the set
  and refuses any item not in it. Exam scripts are excluded from the drill pool by default, so
  drills never feel like leaked questions. No band, deliberately.
- **Coach** — five tabs, landing on **Prediction** because it is the only one useful before the
  audio plays. Also the part brief, a five-step preview protocol timed to the real 30-second
  window, the eleven signpost kinds, five trap families over 24 trap slugs, and pre-teach
  vocabulary that names the question each item could cost you.
- **Mock paper** — choose computer-delivered (2-minute check) or paper-based (10-minute transfer).
  The play-once rule is **granted by the server**: pressing play calls the sidecar, and only on a
  grant is an audio element created at all. It survives a reload, a second tab and devtools. The
  report leads with the raw score, not the band, because the middle of the band table is five
  marks wide and a band-first report tells someone who went from 19 to 22 that nothing happened.

---

## 3. Reading

Three tabs: **Full tests**, **Single passages**, **Question drills**. Before an attempt you choose
a time limit — exam timing, 25% extra time, or untimed counting up — and whether exam conditions
apply.

### The player

A split view with a **draggable divider** (pointer or arrow keys, clamped 30–70%). Passage left,
questions right.

- **Highlights and notes** — select text to highlight it, click a highlight to remove it, and
  attach a note to any paragraph. Highlights are stored as character offsets, so they survive a
  reload even though the DOM is rebuilt.
- **Dictionary on double-click** — offline WordNet in the sidecar, never a model, with up to four
  senses and an Add to vocabulary button. Under exam conditions the popover is suppressed but the
  word is still **queued** and handed back on the report.
- **Keyboard** — `Alt+←/→` question, `Alt+1…9` passage, `⌘/Ctrl+Enter` submit,
  `⌘/Ctrl+Shift+F` flag.
- Autosave debounced at 900 ms; highlights and notes flush immediately because they are gestures,
  not typing. A failed save is requeued *under* anything typed since, so a retry never resurrects
  a stale value.
- The clock only ever loses time on reconciliation. A clock that could be pushed forward by the
  client is not a clock.

### Question types — twenty of them

`multiple_choice`, `multiple_choice_multi`, `list_selection`, `true_false_not_given`,
`yes_no_not_given`, `matching_headings`, `matching_information`, `matching_features`,
`matching_sentence_endings`, `matching`, `sentence_completion`, `summary_completion`,
`summary_completion_bank`, `note_completion`, `table_completion`, `flow_chart_completion`,
`form_completion`, `diagram_labelling`, `map_labelling`, `short_answer`.

Flow charts render as boxed steps with arrows; diagrams and maps place numbered callouts at
authored coordinates over the pack image, and a missing image degrades to a labelled placeholder
with every gap still answerable. An unknown type falls back to a free-text box rather than
silently dropping the questions.

The **TRUE / FALSE / NOT GIVEN rubric is printed verbatim**, as the real paper prints it, because
the pack ships only the question and "NOT GIVEN" is exactly the label a non-native reader cannot
infer.

### Band conversion

Two tables, and General Training is genuinely harsher at the top: band 9 needs 40/40 on GT
against 39 on Academic; 30 marks is band 6.0 on GT and band 7.0 on Academic. A short attempt is
projected onto /40 and flagged as an estimate. Drills get no band at all.

### The other reading rooms

- **Drills** — trap, type, paraphrase and skim. The launcher leads with **your own traps**,
  counted across everything you have submitted, and each row is the button. Options include
  *bounded search* (show the paragraph band, not the paragraph) and *two-stage TFNG* (decide
  GIVEN vs NOT GIVEN first). A self-diagnosis step sits **under the answer and above the reveal**,
  so you commit to what you think went wrong before being told.
- **Coach** — the passage stays permanently on the left, because in a receptive skill every claim
  is about a specific stretch of text. Five tabs: the map (you write your own four-word paragraph
  labels *first*, capped at four words), strategy with 17 per-type pages, worked solutions
  (gated), paraphrase, vocabulary. Solutions always render in one order: Location → Paraphrase
  link → Decision rule → Distractor autopsy → Rule to reuse, with **the option you actually
  chose pinned to the top of the autopsy**.
- **Mock paper** — one fixed hour. The loudest line on the pre-flight is that **unlike Listening
  there is no extra transfer time**, because candidates who expect ten extra minutes lose real
  marks to the surprise. Pacing plan 16/20/22 minutes for Academic, 15/18/25 for GT. Papers are
  chosen least-recently-sat, never at random. The report leads with **pacing**, then the raw
  score, then the band, and gives exactly one verdict — time, location or technique — because a
  screen offering five next actions gets none of them done.

---

## 4. Writing

Prompt bank and Frameworks, with History, Coach and Mock test in the header.

### The prompt bank

102 prompts: 38 Academic Task 1 with chart specs, 22 General Training letters, 42 Task 2.
Filter by task type, genre, difficulty, plus a debounced search. You can also generate a fresh
prompt from your configured model.

Academic Task 1 charts render eight kinds plus a two-panel mixed task. Every chart carries a
**View as table** toggle, a **text description** and **copy the data as text** — and the text
alternative is a first-class feature, not alt text: it carries every axis, category and figure,
and it gives **data, never interpretation**, because selecting and grouping the figures is the
skill being assessed.

### Writing an answer

Mode is fixed at creation and stated plainly: Practice counts up with spellcheck and phrase help;
Exam conditions counts down with neither.

- **The marking probe runs before the timer starts**, not after forty minutes. Three rules are
  written into it: never invent a band, never hide the feature, never claim more than the probe
  knows. It warns and points at Settings; it does not disable the button, because writing without
  marking is still practice.
- **Exam conditions are structural.** `spellCheck={false}` plus attributes that keep third-party
  grammar overlays out, and the phrase-help and previous-feedback drawers are *not rendered at
  all*.
- **Pasting is never blocked and always counted**, shown live in the footer and reported on the
  attempt.
- **The outline scratchpad** is saved with your draft, excluded from the word count, and passed to
  the examiner only so it can say whether you executed your plan.
- Autosave every 10 s while dirty, plus on blur, tab-hide, window close and unmount. A failure
  keeps the draft dirty and says *"Not saved, retrying"* — the text is never lost.
- The timer never auto-submits. At zero it counts overtime, and the overtime is named in the
  report.

### Pre-check, then marking

Five deterministic checks run **on your machine before any model is called**: under 50 words
blocks, as does an alphabetic-word ratio under 0.70; under the task minimum, low prompt overlap
and lifted prompt language warn. Warnings offer Submit anyway and are passed to the examiner as
context.

Marking returns four criteria — Task Achievement/Response, Coherence and Cohesion, Lexical
Resource, Grammatical Range and Accuracy. **The overall band is always recomputed server-side**
from the mean of the four with official half-band rounding; the model's own guess is stored only
for audit. Every evidence quote and error annotation is anchored to exact character offsets in
your own text, and anything that cannot be matched is bucketed as unanchored rather than guessed.

A failure is honest: the attempt is marked failed, your answer is saved exactly as written, and
the button changes to **Set up marking** when a retry cannot succeed.

### The report

Four tabs — Feedback, Your answer (with seven annotation types, each printing its name so colour
never carries meaning alone, walkable with `n`/`p`), Improve, and **Since last time** for
rewrites, with a band delta and a word diff against the parent. From any scored report you can
rewrite with feedback or start again from blank.

### Coach and mock

The coach is six tabs over one prompt. Four are always open — the task, the overview builder, the
plan, the language bank. Two are gated: model answers and Compare.

The gate has **two stages**. Unlocking does not open the model; it opens a find-the-difference
task showing the *body* paragraph at band 6 beside band 7 and asking you to name two things that
changed. Every frame in the language bank has a real typable gap, and every functional move ships
a plausible canned sentence under the heading **"Sounds canned"** — the negative example is what
inoculates against the phrase-bank sites that cause band-6 plateaus.

The mock is one 60-minute clock over both tasks, and the sitting file imports none of the coaching
machinery — not hidden behind a flag, simply not built into the screen. The weighting is stated
before any band exists to argue about: Task 2 counts twice, `(T1 + 2×T2) ÷ 3`, and the report is
the only screen in BandReady that shows a combined Writing band. **It leads with time
allocation**, because the most expensive mistake in that paper is giving Task 1 half the hour and
no band score would reveal it.

---

## 5. Speaking

Four modes, two of which are scored:

| Mode | Length | Scored |
|---|---|---|
| Full mock — parts 1, 2 and 3 back to back | 11–14 min | yes |
| Single part | 4–5 min | yes |
| Topic drill, with coaching after each answer | untimed | no |
| Quick chat | untimed | no |

### The live examiner

A real-time voice call over WebRTC against the local sidecar. Two invariants hold it together:
the renderer never advances the state machine — phase, part, timers and the cue card all arrive
as server events — and the microphone is initialised before the call connects.

- **A pre-call device check** with a live level meter, because the only way to know your
  microphone works before a timed test is to see it move.
- **Silent-mic detection** — six seconds of an open microphone with no signal raises a warning
  that names *which* fault it is, and resets the moment anything is heard. Pausing to think is
  normal and must never be reported as a broken microphone.
- **A remembered microphone is verified before use**, because device ids rotate on permission
  reset and a stale one leaves the call publishing silence.
- The **Part 2 cue card** shows the topic and bullets with a notes area, and stays visible through
  the long turn exactly as the paper card does. **Notes are local only** — never sent to the
  model, never persisted.
- The live transcript is collapsible and **hidden by default in scored modes**, because reading
  your own words mid-test is not exam conditions — but never removed, because captions are an
  accessibility requirement.
- **Zero turns are never marked.** No speech reaching the examiner produces an explanation and a
  pointer at the microphone, not a band.

### The report

Overall band plus Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and
Pronunciation. A criterion that was not assessed renders as a dashed "–", never a zero, and a
recording that could not be assessed for pronunciation says so and takes the mean of the other
three.

**"How you sounded"** sits above the criteria and is computed deterministically from the
transcript and voice-activity timestamps with no model involved: speaking rate, articulation
rate, mean pause, long pauses, pause ratio, initial latency, fillers per minute, false starts,
mean length of run. It is placed first because it is the only part of the report you can verify
yourself. A missing metric is omitted rather than rendered as 0.

Evidence quotes scroll and highlight the transcript. A quote the server could not anchor gets no
"find it" button and is badged *"Not found verbatim in your speech"*.

### Topics, coach and drills

496 cue cards across 108 linked sets, browsable with search, difficulty tier and *not started
first* — the previous dropdown held 280 options for Part 1, and nobody picks a topic that way.

The coach mirrors writing's structure, and **two things unlock the model answers**: a finished
session on that card set, *or* a completed rehearsal — sixty seconds of preparation followed by a
full two-minute turn. There is no transcript in that case, but the work was done, and refusing
the model afterwards would be pure gatekeeping. The prep coach replaces a notes box with **one
cell per bullet, capped at 40 characters**: a cell that cannot hold a sentence cannot hold a
script, and reading out prose written in sixty seconds is the commonest self-inflicted wound in
Part 2.

Four drill kinds — shadowing, minimal pair, error repair, extend — all built from *this card's own*
teaching payload rather than a generic bank. Speech-to-text capability is checked **before the
microphone button is drawn**: offering to record and then failing is worse, because you have
already spoken.

### The mock

The sitting has no transcript, no vocabulary, no model answers, no hints and **no mute button** —
each would change the measurement. The coach is shut server-side for the duration, even for cards
already unlocked. A silent sitting is abandoned rather than scored: marking silence would produce
a band, and that band would go into your trend.

The report **prints no band per part, because there is not one**. The sitting is marked as a
single performance, so what it shows is where the examiner's evidence landed — and when the parts
cannot be separated, the strongest/weakest labels are withheld rather than invented.

---

## 6. Pronunciation

Two tabs, in the order worth doing them: hear the contrast, then say it.

**The rule that governs this whole module** (`pron/analyze.py:55`, `docs/plan/09 §0`):

> `SCORE_IS_PRONUNCIATION = False`

Pronunciation measures intelligibility and never proximity to an accent. Concretely, you never
see a pronunciation score, a percentage, a band or a good/amber/poor badge anywhere in this
module. What the recogniser produces is its own *confidence*, which drops for a rare word, a
proper noun, background noise — and for speech that is accented and perfectly intelligible.
Publishing that as a pronunciation score would tell a Tamil or Sinhala speaker their
pronunciation is poor when the recogniser merely hesitated.

So the fields are renamed to what they honestly are: `worst_words` becomes
**"words the recogniser was unsure of"**, and the heading reads **"Words worth listening to
again"**. Every screen carries the notice: *"IELTS accepts every accent. These scores measure how
clearly each sound comes across — not how British or American you sound."* Even the model prompt
is constrained: *"Accent is NOT mispronunciation."* A test pins the constant, the notice and the
boundary.

- **Hear the difference** — rounds of ten minimal pairs. Play, then choose the word you heard;
  the options stay disabled until the sound has played, or it is a coin toss. **Your microphone is
  not used and nothing is recorded.** Filter by sound pair, and a chip row shows *pairs you have
  mixed up before* — deliberately with no number beside them, because this is what to practise
  next, not a mark out of ten.
- **Read aloud** — the sentence comes from **your own material first**: your vocabulary queue,
  then the minimal pairs you just practised. The caveat appears **before** you speak, not after,
  because a learner who records first has already spent the time believing they were about to be
  marked. Afterwards you get the actual transcript and the words the recogniser hesitated over.
  When speech-to-text is not set up the transcript is **withheld** and says so — it used to echo
  the sentence you were asked to read, which told everyone on a fresh install that every word came
  through.

---

## 7. Vocabulary

Five tabs over one bank — Review, Inbox, Browse, Decks, Stats — with the tab in the URL.

### Reviewing

FSRS scheduling from the MIT-licensed `fsrs` package; none of the maths is ours. Desired
retention 0.9, maximum interval 365 days, learning steps 1m/10m, 10 new cards a day, a 120-review
cap, sessions of 20, and a **4 AM local rollover** for both limits and the streak.

The queue is ordered relearning → learning → review, with new cards interleaved never more than
three in a row, and the review backlog sorted **most-forgotten first** rather than oldest-first.
New cards prefer entries carrying your own context sentence.

Six exercise types, chosen by how well you know the card: **recall** (flip), **gap fill** (cut out
of your own sentence), **use it** (write a sentence, judged by the model, with a speak-instead
option), **collocation** (decoys drawn from your own bank, so a wrong pick is a real confusion),
**listen** (mature cards only, so the spelling test is the point) and **speak** (nothing is
recorded).

`Space` reveals, `1–4` rate, `Esc` leaves. Every rating is saved the instant it is pressed, so
leaving mid-session loses nothing. Anki's "young" and "mature" are renamed **Settling in** and
**Well settled**, because the originals read as a verdict on the word.

### Where words come from

The inbox is **the only door into the queue**, and the header says so. Words arrive from Reading
(double-click any word), Writing, Speaking and Listening, each carrying a provenance line —
*"from your Speaking session on 12 March"*. Accept schedules it; dismiss deletes it, and it can
come back if you misuse the word again. Ingest matches on lemma and part of speech, so a repeat
merges and appends a source rather than duplicating.

A word missing its IPA, definition, examples or collocations is enriched by one background model
call, and every failure is swallowed and retried next time — so it works offline.

### Browse, decks and stats

Search runs over headword and definition through an SQLite FTS5 index. Filter by status, part of
speech and topic; sort four ways; select rows for bulk suspend, mark known, resume or delete. The
entry drawer lets you edit the definition and your own sentence in place, and shows collocations,
register advice as advice ("Best in the speaking test"), confusables with minimal pairs, and the
full review history.

**27 study decks, 4,995 entries** — 1,580 foundation, 1,250 core, 919 phrases, 151 academic, 20
topic decks and more. Opting into a deck is the second stated exception to suggest-never-schedule,
and the confirm dialog says exactly what will happen.

Stats show 30-day retention against a 90% target, your streak, where your words are as a stacked
bar, a 14-day forecast, and where they came from per module.

---

## 8. Grammar

Four tabs: Path, Theory, Your points, Phrases.

### The path — 156 points in 17 units

Units are named as things you can do: *"Talking about the past"*, *"Joining two ideas into one
sentence"*, *"The accuracy points that cost the most marks"*.

**Nothing is hidden.** A locked lesson still shows what it teaches and reads *"Opens after
⟨lesson⟩"*, naming the **deepest** unmet prerequisite — usually not the nearest one. A point
unlocks when every prerequisite reaches the Choose rung.

### The Ladder — six rungs

**Meet** → **Notice** → **Build** → **Choose** → **Use** → **Under pressure**.

The division of labour is absolute: **FSRS decides when a card comes back; the Ladder decides what
kind of question, which sentence, what counts as a pass, and whether it is mastered.** Neither
writes the other's columns. Stage sets the ceiling and FSRS state sets the floor, so a lapsed
mature card gets an easier question than its stage alone would allow.

- **One new grammar point a day**, and no new anything once the backlog is more than twice what
  you can clear today.
- A card is only created **after** you have met the point and passed one retrieval — which closes
  FSRS's blind spot, where it would otherwise schedule something you never understood, forever.
- **Mastery is five conditions, all required**: at the top rung, stability of at least 21 days,
  produced unassisted in real work, no recent lapse, and **you declined the rival** — you chose
  the *other* form correctly when the other one was right. You have not mastered the present
  perfect until you can decline to use it.

### Lessons and practice

A cold lesson cannot show its rule until you have answered all 4–6 *notice* questions — each a
real sentence with a question about the world, not about the grammar.

**2,150 practice items** across fourteen kinds — gap fill, interpret, produce, judge, choose form,
transform, error fix, dictation, order, contrast pair, both-ok, combine and speaking drill. In
error-fix the wrong span is **struck through from the start**, because hunting for the mistake is
a different and worse exercise. Dictation is graded only on its scored tokens, so a typo elsewhere
costs nothing.

Feedback has a deliberate three-beat shape. **A wrong first attempt returns no answer at all** —
just where to look, and one more go — because roughly seven in ten corrections go unnoticed when
the answer arrives first. The reveal then names the *meaning*, not the verdict: *"You chose
worked. That says the six years are over."* A wrong answer is amber; **red is reserved for things
that are broken**. Every rejection can be appealed with one field asking what you meant.

### Theory, your points, phrases

**99 articles in 8 chapters, 619 minutes, ungated end to end** — nothing is locked and nothing
requires anything first. Search matches the words a learner would actually type, because titles
are written as answers; the pack ships aliases that are searched but never displayed. Nineteen
block types render, including 99 quick-check questions that are deliberately *not* gated, because
this is reference rather than assessment.

**Your points** harvests the mistakes from your own writing and speaking — **53 error codes in
nine families**, each named in your terms rather than grammatically, quoting your own sentence,
with the lesson that stops it. The headline is deliberately not a percentage. Alongside it sits
*"These have gone quiet"*: **7 earlier, 0 since**, which is the motivating number. And **your
range**, on the argument that a learner who believes band 7 means "no mistakes" writes short safe
sentences and lands at 6, because range is marked too.

**26 contrast boards**, one per pair of rivals, restating the decision — which is what someone who
just got it wrong in a real essay needs, rather than another drill.

---

## 9. Progress and planning

- **Band estimates** with a documented weighting: `w = base × 0.5^(age/14 days)`, base 2.0 for a
  placement or mock, 1.0 for practice, 0.5 for a micro-drill. Confidence gates on the effective
  sample: under 2 is *insufficient*, under 4 low, under 8 medium, otherwise high. **An
  insufficient estimate renders no band at all** — the "no band until you have earned one" rule
  is enforced in the data model, not just in the UI. The overall band's confidence is the
  *minimum* of the four, so one weak skill caps it.
- **Trajectory chart** — a line per skill, y-axis pinned 4–9, your target as a dashed reference
  line, and **weeks with insufficient evidence rendered as gaps, never interpolated**. A
  "show the numbers" table is required relief, not decoration: two of the light-mode series sit
  under 3:1 contrast.
- **Criterion breakdown** — a radar for Writing and Speaking; Reading and Listening get
  question-type accuracy instead, since they have no rubric criteria.
- **Activity calendar** — 16 weeks, five intensity steps, and it waits until there is one logged
  minute rather than showing 16 weeks of zeroes. Rest days are never counted against you.
- **Study plan** — deterministic from your profile: same inputs, same plan. Session shapes of
  30/60/90 minutes; no skill below 15% of the week; the same main skill never three days running;
  a two-week taper before a booked exam with full mocks and no new cards. **Skipped sessions are
  never rescheduled** — next week's weighting picks up the slack.
- **Streaks** are never punitive. Rest days in your plan never break one, and the single automatic
  repair per 30 days is **disclosed, not hidden**: *"We covered 12 March for you."*
- **Adaptive rules** fire at most twice a day with cooldowns, and every firing writes an audit row
  with its evidence and its action, so a plan change is never silent: *"Evidence: Grammatical
  Range and Accuracy, Writing, band 5.5, 3 attempts in a row. Added 2 grammar micro-drills."*
- **Exam-readiness checklist** — locked until you set a test date. Six automatic checks with hard
  thresholds (two mocks; overall within 0.5 of target; every skill within 0.5 at medium
  confidence; reading inside the time limit; four writing submissions meeting the word minimums;
  85% seven-day vocabulary retention) and five you confirm yourself. Automatic items **cannot be
  ticked by hand**. Near the exam it adds a reality check: it is worth asking whether the target
  or the date is the thing to move — and BandReady will never change either for you.

---

## 10. Settings

A dialog over the app, mounted from `/settings`, so every "open Settings and paste your key" link
keeps working, `?tab=` deep links land on the right section, and **Back closes it**.

- **Appearance** — light/dark and comfortable/compact, saved on change.
- **You** — exam format, target band, daily minutes, study days, new words per day, show-the-timer.
  Daily minutes is three cards rather than a slider, because the database has
  `CHECK (daily_minutes IN (30,60,90))` and a slider would offer 35 values of which 32 are refused.
  Study days **refuse to go below three, out loud**.
- **Providers** — three jobs chosen independently: the examiner (marks), the voice (reads aloud),
  hearing you (transcribes). Each names **what still works without it**. Each offers exactly two
  routes, on this computer or through OpenRouter, with the trade on the button — including
  *"Your recordings never leave this computer"* against *"your recordings are sent to
  OpenRouter"*. A job with only one route shows one full-width button, because a greyed-out
  second button reads as a choice that exists and is unavailable to you. The local model list is
  built from **what this machine actually has**, never from suggestions. OpenRouter's examiner is
  offered as *Careful marking* and *Quick and cheap*, with the full searchable catalogue behind a
  disclosure. One key card covers every OpenRouter slot.
- **Voice** — turn-taking, not voice choice: Snappy, Balanced, **Patient (exam-like)**, plus four
  sliders with the numeral always rendered. The volume gate is hard-capped at 0.6 in both UI and
  sidecar, because the voice library's own default sits at that value and silently blocks normal
  speech, making the microphone look dead.
- **Data** — the data folder with a copy button, **export everything**, and **delete all
  recordings** behind a confirm that states the boundary exactly.
- **About** — versions, Python runtime, platform, database path, schema revision, uptime; reveal
  the data folder and the log file; report a bug. Plus an explicitly honest disclosure of how keys
  are stored: encrypted with a key generated on this install, *"which protects against casual
  reads and stray backups. It does not protect against someone who is already logged in as you."*

---

## 11. Platform

### What ships in the box

One first-party pack, `org.bandready.core-en`, **CC0-1.0**, ~21 MB, 6,102 records:

| File | Count | What it is |
|---|---|---|
| `vocab.jsonl` | 4,995 | 27 opt-in study decks |
| `grammar.jsonl` | 156 | 17 units, 2,150 practice items, 567 error cards, 26 contrast boards |
| `theory.jsonl` | 99 | 8 chapters, 1,750 blocks, 619 read-minutes |
| `speaking_cards.jsonl` | 496 | 280 Part 1, 108 Part 2 cue cards, 108 Part 3 |
| `card_sets.jsonl` | 108 | linked Part 1+2+3 units with their own language bank |
| `writing_prompts.jsonl` | 102 | with 306 model answers at bands 6, 7 and 8 |
| `reading_passages.jsonl` | 44 | 592 questions, 36,581 words |
| `listening_scripts.jsonl` | 43 | 415 questions |
| `reading_tests.jsonl` | 12 | 8 Academic, 4 General Training |
| `listening_tests.jsonl` | 7 | four-part tests |
| `topics.jsonl` | 20 | the shared taxonomy everything keys to |
| `pron_pairs.jsonl` | 20 | minimal pairs across 13 contrasts |

Eight reading passages and fifteen listening scripts are deliberately left out of the full tests
so drills have material that is not exam content.

Extra packs can be installed from a directory or a `.brpack` zip, validated as a whole — a single
bad row rejects the pack, with the line number. **Rows are retired, never deleted**, so
uninstalling a pack keeps your history.

### Privacy and offline

The sidecar binds **loopback only** on an OS-assigned port, behind a Host check, an Origin check
and a 256-bit per-launch bearer token passed through the environment rather than argv — because
`ps` shows argv to every local user.

**There is no telemetry, no analytics and no crash reporting.** Exactly four things can cross the
machine boundary, all opt-in: model downloads on first run, a cloud LLM if you configure one
(**text only** — your essay or transcript plus the rubric, never audio), a cloud speech-to-text
provider if you pick one, and a notify-only update check in packaged builds.

**The listening voice is local, enforced in code**: any engine other than Kokoro raises a 422.
Transcription scratch files are deleted in a `finally` — this is your voice data and has no reason
to outlive the request that read it.

### Your recordings

Speaking turns are written to `media/speaking/`, pronunciation takes to `media/pron/attempts/`.
They are **kept until you delete them** and are deliberately not registered in the media table, so
the cache sweep physically cannot reach them. The only deletion path is **Settings → Data →
delete all recordings**, which removes the audio and nothing else: transcripts, scores and reports
are untouched. The export includes them.

### Storage, jobs and media

One SQLite file with 46 tables, WAL mode, foreign keys on, migrated at startup under a
cross-process lock so two sidecars can never migrate the same database. Every mark you have ever
received is stored with the raw model response, so it is inspectable offline.

Eleven background job kinds, each answering `202` with a job URL and reporting real progress
("kokoro-v1.onnx — 128 MB / 310 MB", "rendering part 2 of 4"). Cancelling a download keeps the
partial file so Resume picks it up.

Generated audio uses numpy and soundfile — no ffmpeg, no pydub. Line offsets come from sample
counts rather than summed floats, so click-to-replay timing cannot drift. Media is served with
HTTP Range support, and because an `<audio>` element cannot send an Authorization header,
requests carry an HMAC ticket bound to the exact path.

### The desktop app

Electron with context isolation and sandboxing on, and an IPC surface of exactly five methods.
**No splash screen by design**: the window is created immediately so the renderer boots in
parallel, but not shown until the sidecar answers and the renderer has painted.

A crashed sidecar restarts with backoff, and after five consecutive failures a dialog names the
reason **and the log file**, offering to reveal it. Shutdown is a ladder — internal request,
SIGTERM, SIGKILL — and the sidecar independently watches its parent process, so a hard crash never
orphans a Python server holding the port and the database lock. Auto-update downloads in the
background but **never restarts on its own**, because a live speaking session must not be killed.

Model weights are **never bundled**. They download on first run into your data folder, resume via
HTTP Range, and BandReady will hard-link weights you already have in a HuggingFace or Pipecat
cache rather than downloading them again.

### Accessibility

Keyboard shortcuts are screen-local and documented on the screens that own them. The question
palette, tabs and mode pickers are roving-tabindex composites, so a 40-question palette is one tab
stop rather than forty, each cell named *"Question 7, answered"*. Every modal and drawer is a
HeadlessUI dialog with a real focus trap. The closed mobile sidebar is `invisible`, not merely
translated, specifically so its links leave the tab order — with a regression test.

220 `aria-label`s, 62 alerts, 26 status regions, 25 live regions. **The timer announces at
milestones** — 30, 15, 10, 5, 2, 1 minutes, then 30 and 10 seconds — because a per-second live
region would make the test unusable and silence would hide the one fact that changes how you
answer. Band scores are `role="img"` and never encode a verdict in colour alone. A global
`prefers-reduced-motion` switch neutralises every animation, and the theme tokens carry measured
contrast fixes as comments.

---

## Known gaps

Recorded here because a feature list that only lists what works is a brochure.

- **The grammar rule sheet is write-only.** "Add to my rules" saves, and there is no route or
  screen that reads it back.
- **Media cache eviction never runs on its own** — the 2 GB budget is only enforced if something
  calls the eviction route, and nothing does.
- **`POST /internal/shutdown` is not implemented**, so Electron's graceful shutdown always
  degrades to SIGTERM.
- **Model checksums are not pinned** in the built-in manifest, so download verification is
  currently a completeness check against `Content-Length` rather than a hash.
- **Full-session speaking audio is never found by the pronunciation job** — `speaking_turns`
  stores a bare filename while the resolver expects a path, so speaking sessions always fall back
  to transcript-only scoring. Playback is unaffected.
- **`GET /api/v1/pron/sessions/{id}` bypasses the pronunciation honesty gate** — it emits a raw
  score and a good/warn/poor level, unlike the three other paths that check
  `SCORE_IS_PRONUNCIATION`. No shipped screen calls it, so nothing reaches a learner today.
- **`theory` is missing from the pack manifest counts**, so the pack manager under-reports the 99
  articles.
- No profile-delete or full-reset endpoint; no database backup or integrity check. Deleting the
  data folder is the only full reset.
- No skip link, no system-theme option, no high-contrast mode. There is no ESLint configuration in
  the repo, so the `jsx-a11y` suppressions enforce nothing.
- Several endpoints have no UI: model import and delete, local-weight adoption, TTS preview, and
  media usage.
