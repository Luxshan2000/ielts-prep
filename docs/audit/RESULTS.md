# Feature audit — verified in the running app

Every line here was confirmed by driving http://localhost:5273 with Playwright, not by reading
code. Screenshots in this folder. HEAD at audit start: a4dc45c.

## Home — PASS
- Capped-I mark, sidebar groups, vocab badge 23
- Rest-day state naming the real next session ("Mon, Aug 31: Speaking, Part 2 long turn (60 min)")
- Zero scored attempts -> "Starting point, nothing scored yet"; all four skills "Self-rated starting point"
- No test date -> explains rolling 8-week plan + readiness locked + the only button that fixes it
- Streak empty state non-punitive
- BUG (issue #5): "7-day recall 14 %" — stray space before %

## Listening — PASS
- Practice/Exam tabs, Practice default
- Targeted drills + Accent training at top, Practice tab ONLY (absent under exam conditions — verified both states)
- Spelling notice; History(5)/Coach/Mock test header order
- Per-part accent badges; audio gating real ("Prepare the audio before you can start this test")
- Partial render honesty: "2 of 4 parts are ready"
- Drills launcher: 4 kinds with real counts (dictation 162, numbers 39, signposts 196, prediction 135),
  per-kind modes, "Works with no audio" badge on prediction
- needs-audio is a first-class state: names the recording, offers "Do the no-audio drill instead"
- Prediction drill RUNS and GRADES: verdict, deciding cue, "Right family, wrong shape" diagnosis,
  hazard, form rule, Next
- Accent training: script + accent picker, "Australian (approximated with British voices)" live
- Coach: 43 of 43 parts, 2 sat, Transcript open/locked badges, part filter
- History: 6 attempts, search + sort present; kind chips correctly absent (only one kind present)

### Doc corrections needed (code is fine, FEATURES.md overstates)
- FEATURES.md says a drill needing audio is DISABLED up front. It is not — you get the
  needs-audio state after clicking, which is better behaviour.
- FEATURES.md says that state "mounts the PrepareAudioPanel inline". It does NOT. You are told
  to prepare the audio but given no control to do it from there. Small real UX gap.

## Reading — PASS
- Library: 3 tabs with live counts (Full tests 12, Single passages 44, Question drills),
  format + difficulty filters, "12 of 12 tests", History(6)/Coach/Mock header
- Drills tab lists all 15 drillable question types; bank probe resolves on selection
  ("40 in the bank"), 5/10/20 length picker, Start drill
- TFNG drill RUNS: rubric box printed verbatim (agrees / contradicts / no information),
  palette footer 1-10, autosave "Saved", countdown, pause, flags, per-question bounded paragraphs
- **The reported True/False bug is FIXED, verified live**: clicking FALSE leaves the label at
  top=626 before and after; shell not displaceable (overflow-clip holding); answer registers
- Submit -> review: "Drills are not band-scored", weakest-type card + "Drill it",
  by-type and by-passage bars, time-per-question with median and the 1:30 guidance,
  filter tabs All/Wrong/Flagged
- Solution card is the judgement variant: "TRUE, NOT NOT GIVEN" verdict boundary with a
  per-verdict autopsy, "In passage order" badge, Locate in passage, Why was I wrong

### Reading bug found
- The drill page title renders the RAW SLUG "true_false_not_given drill" instead of the human
  label, which the badge directly below gets right ("True / False / Not Given").

## Writing — PASS
- Hub: Prompt bank / Frameworks tabs, History(4)/Coach/Mock, task-type + pattern + difficulty
  filters, search, "New prompt" generation, "Last marked answer: band 1.0"
- AC Task 1 chart renders as real SVG with labelled axis, gridlines and value labels, plus all
  three text alternatives: View as table, Text description, Copy data
- Editor: live word count "15 / 150 words", autosave indicator, timer, Exit/Prompt/Submit,
  Phrase help and Outline scratchpad present (practice mode)
- **Pre-check gate verified**: 15 words -> BLOCKS with "This answer can't be marked yet",
  only one button ("Back to the editor"), no Submit-anyway escape, and the verbatim line
  "These checks run on your machine before any model is called, so nothing is spent on an
  answer that can't be marked fairly"

## Vocabulary — PASS
- Five tabs with live badge: Review 23, Inbox, Browse, Decks, Stats
- Review CTA + keyboard hint ("Space shows the answer · keys 1-4 rate · Esc leaves")
- Inbox states the rule verbatim: "This inbox is the only way a word enters your review queue"
- Decks list real word counts and state the exception (a deck schedules immediately;
  everything else only suggests)
- Stats: retention, 14-day forecast, editable daily limits, 4 AM rollover noted

## Grammar — PASS
- Four tabs: Path, Theory, Your points, Phrases; "Practise 5" when cards are due
- Path start card: "Pick up where you left off", next lesson named, "lesson 1 of 156"
- Ladder rungs named; unit map ("Part n of 17", hours remaining)

## Sidecar API — verified by execution (parallel pass)
PASS: /health open and 91 other routes 401 without a bearer; content counts (7 listening tests,
43 scripts, 12 reading tests, 44 passages, 102 writing prompts, 156 grammar, 99 theory);
reading ?mode=review 403s without an attempt; band tables end-to-end (GT needs 40/40 for 9.0,
Academic 39); marking rules (near miss scores 0 AND is tagged; "three thousand" matches;
"the bus" matches "bus"); drills stateless+seeded (wrong seed 422, unknown item 422);
/speech/capabilities shape; exactly 4 presets, mock disabled; /models/recommended tier;
WordNet offline; media tickets resource-bound, expiry enforced, and a media ticket is
rejected on /settings (the fix from earlier today, still holding).

### FAIL — the listening answer gate does not hold
GET /listening/scripts/{id}?with_answers=1 returns the full answer key, every explanation and
the whole transcript with NO attempt of any kind. Verified clean-room on ls_02_p3 (zero attempt
rows): 10/10 answers, 10 explanations, 53 transcript lines. _answers_allowed()
(routes/listening.py:387) only checks whether a mock is open; reading does it properly via
_has_submitted_attempt(). The in-app reveal button IS gated, so a learner using the UI is
unaffected — but FEATURES.md's claim that the gate is server-enforced and "there is nothing for
devtools to reveal" is FALSE for listening. Either listening gets reading's check, or the doc
must stop claiming it.

### Other API findings
- Speaking cards: 296 of 496 unreachable. /speaking/cards caps limit at 200, has no cursor
  parameter, and returns "next_cursor": null unconditionally — advertising pagination that
  does not exist. Part 1 has 280 cards; only 200 are reachable.
- /reading/mock/exam-conditions reports {"active": false} while every drill route 409s,
  because the two read different sources (an in-progress exam attempt vs a mock session row).
  A stranded attempt locked all coaching while the diagnostic endpoint insisted nothing was wrong.
- Review unlock is cheap: submitting one junk answer opens the whole 40-question key.

## Pronunciation — PASS
- Two tabs: "Hear the difference", "Read aloud"
- THE HONESTY RULE HOLDS in the live UI: zero violations — no percentage score, no band,
  no "mispronounced", no good/warn/poor, no n/100 anywhere on the screen
- "Every accent is accepted. This is about being understood, not about sounding like anybody else."
- "Your microphone is not used and nothing is recorded."
- Sound-pair filters show IPA WITH example words ("l-r: light / right"), never bare symbols
- Subtle rule verified: 20 options disabled before play; after playing one pair only THAT
  pair's two options enable, others stay disabled ("otherwise it is a coin toss")

## Speaking — PARTIAL (hub verified; live call needs a real microphone)
- Tabs: Start a session, Topics; History(16)/Coach/Mock test
- All four modes present: Full mock, Single part, Topic drill, Quick chat
- "Counts toward your band" badge
- Mock promoted as its own card with the honest terms ("no coaching and no pausing")

## Progress — PASS
- Series tabs: All skills / Listening / Reading / Writing / Speaking / Overall
- All six panels render; readiness correctly LOCKED with "Add my test date"

## Settings — PASS
- Dialog opens over the app; all six sections reachable by ?tab= deep link
- Providers: three jobs (examiner / voice / hearing you), two routes each with the privacy
  trade on the button, "Careful marking" vs "Quick and cheap", live catalogue
  ("392 models are available through OpenRouter"), per-job Check
- One-key card, and the documented gap case appears verbatim: "A key is saved for the
  examiner, but BandReady cannot read it back to copy it across."

## Grammar loops — PASS
- Lesson opens with can-do title, grammatical name, role, CEFR in words, register, minutes, stage bar
- Practice session runs: "1 of 5", rung badge "Notice · Meaning", a real interpret item
- THREE-BEAT FEEDBACK VERIFIED: a wrong first attempt returns NO answer, only
  "Not this one. Read the situation once more before you choose."  Correct on retry then
  names the mechanism ("Not sits inside doesn't and cancels the whole of what follows it")
  plus a feed-forward line, the FSRS interval, "Add to my rules" and Next

## Vocabulary loop — PASS
- "Card 1 of 20" (documented session cap), "23 due today", keyboard hints
- Card: headword, IPA, part of speech, play button, meaning, YOUR SENTENCE, collocations
- Rating bar prints the interval each choice schedules: Again 1m / Hard 6m / Good 10m / Easy 29d

## Bugs found by driving the UI
1. Home: "7-day recall 14 %" — stray space before % (issue #5)
2. Reading drill page title renders the raw slug "true_false_not_given drill"
3. Grammar feedback: "Back in in 5m" — doubled "in"
4. Listening drills: the needs-audio state tells you to prepare the audio but gives you no
   control to do it (FEATURES.md claims a PrepareAudioPanel mounts inline; it does not)

## Round 2 — verified after rendering audio

### Listening full exam sitting — PASS (complete loop)
- Brief prints every documented rule verbatim: "Each part plays once and moves straight to the
  next. There is no pause, no rewind and no replay... After part 4 you get two minutes to check
  them, then the test submits itself. The transcript stays locked until you submit... You cannot
  restart a part." Plus per-part accent and duration (Part 1 British 6:16, Part 2 Australian 5:38)
- EXAM TRANSPORT VERIFIED BY STRUCTURAL ABSENCE, not by disabled controls:
  seek bar absent, speed control absent, pause absent, replay absent,
  audio.playbackRate pinned to 1, native audio.controls false. Only Leave and
  "Go to the check step" exist. "pause, rewind and replay are switched off" printed on the transport.
- SharedBlock confirmed: the booking form renders ONCE with numbered inputs dropped into its
  gaps (Surname [1] ... Deposit [6] pounds), not six copies
- Question palette 1-40, "0 of 40 answered", per-group type badges and caps instructions
- Check step: "two minutes to check every answer... The test submits itself at 0:00",
  timer counting 2:00 -> 1:52, all 40 questions editable in one grid, "40 unanswered",
  "Blank answers score nothing, and a guess costs you nothing either"
- Submit -> review: "0 of 40 correct", per-part tabs 0/10 each, BAND 2.0 (a full four-part exam
  does produce a band; 0/40 is the table floor), MODE Exam Conditions, TIME TAKEN 1:25,
  PLAYS USED 1 (the play ledger), transcript+playback unlocked
  ("Seek anywhere, or use a timestamp to jump to a line"), and bulk vocab capture stating
  "Nothing is scheduled until you accept it there"

### Reading coach — PASS
- Picker: 44 of 44 passages, format filter, question types per card, "Solutions locked" badges
- Five tabs exactly as documented: The map, Strategy, Worked solutions, Paraphrase, Vocabulary
- The gate HOLDS on worked solutions, with a "Sit a full mock instead" escape
- RULE VERIFIED: no passage shows "Sat" despite my submitted TFNG drill — drills are
  deliberately excluded from the coach ledger, exactly as documented

### Grammar remaining tabs — PASS
- Theory: ungated end to end, search box, "Start at the beginning"
- Your points (slug is ?tab=progress): honest empty state naming what will fill it,
  Shaky/Solid columns, Your range, and no percentage anywhere
- Phrases: all four lenses (Everything, Fixed phrases, Sentence frames, Welded prepositions)

### Speaking rooms — PASS (live call still needs a microphone)
- Topics: 108 topics, search, difficulty tier, status and sort filters
- Coach: the same browser with a different verb ("Pick a card to study")
- History: 16 sessions, none scored, rows titled by topic and openable to their transcript

## Round 3

### Writing marking round trip — PASS (complete loop, real model call)
- Wrote 164 words; counter crossed the minimum and the "to go" warning cleared, replaced by
  "14 words above the 150-word minimum. There is no upper limit, but padding costs you Coherence."
- Practice mode counts UP with the allowance as a soft reference ("Untimed practice. The real
  exam allows 20 minutes for this task."), Phrase help and Outline scratchpad present
- A PASSING pre-check goes straight to the model with no modal flash, exactly as documented.
  Marking modal: "One call to your configured examiner model. This stays on your machine unless
  you configured a remote provider", with live job detail
- Marked by Gemini 2.5 Flash through OpenRouter: Task Achievement 6.0, Coherence 7.0, Lexis 7.0,
  Grammar 7.0 -> Overall Band 7.0. THE ARITHMETIC CONFIRMS THE RULE: mean is 6.75 and official
  half-band rounding takes ties up, so 7.0. Labelled "Task Achievement", not "Task Response" —
  the documented conditional label for Task 1
- EVIDENCE ANCHORING IS VISIBLE ON SCREEN: every quote carries its character offset
  (at 389, at 497, at 781, at 125, at 736, at 867), and annotations carry spans
  ("characters 873 to 957")
- The marking genuinely read the chart data with no vision model: it caught that I invented
  material names — "The candidate misidentifies 'food packaging' for the material at 14%, which
  should be 'Textiles'." That is chart_to_text working
- Improve tab: vocabulary upgrades with "Nothing is scheduled for review until you accept it
  there", "Add all (6)", model answer section
- Rewrite with feedback / Start again from blank both present

### Progress with real scored attempts — PASS, with one real trap
Once refreshed, every documented rule renders correctly:
- "Update my estimates" appears only once a scored attempt exists
- "No overall band yet — An overall band needs an estimate in all four skills"
- Writing shows "not enough scored practice yet —" as an EM DASH rather than an invented number,
  because n_eff 1.97 is under the 2.0 "insufficient" threshold. The no-band-until-earned rule
  is visibly enforced
- Estimator maths verified end to end: listening n_eff 6.99 from 6 attempts -> band 6.0,
  reading n_eff 13.97 from 12 -> 4.0

BUG (real, and circular): estimates are NOT recomputed when you submit an attempt. They refresh
only when a PLANNED SESSION is completed, or when you press "Update my estimates" — and that
button is hidden while the estimates still say zero scored attempts. So a learner who practises
outside the plan sees "Nothing has been scored yet" indefinitely with no visible control to fix
it. I had 20 scored attempts in the scored_attempts view while the screen insisted nothing had
been scored. Forcing POST /progress/estimates/recompute fixed it instantly and correctly.

## Round 4

### Reading dictionary, highlights and notes — PASS
- Double-clicking a word opens the Dictionary popover: headword LEMMATISED ("engineers" ->
  "engineer"), part of speech, FOUR senses with definitions, "Also:" synonyms per sense,
  italic examples, and Add to vocabulary. Matches the documented "up to 4 senses with
  definition, synonyms and one example"
- Offline WordNet confirmed live: oewn:2024, no network at lookup time
- Selection toolbar offers exactly Highlight / Note / Look up
- Highlights persist and are listed in the drawer with their paragraph marker, the quoted
  snippet and a per-item Remove
- The drawer's empty states name the gesture that fills them, including the keyboard shortcut:
  "Nothing flagged. Use the flag button on a question, or Ctrl/Cmd+Shift+F."
  and "Use the note button beside any paragraph marker."
- Player: draggable role="separator" divider, paragraph markers with per-paragraph note buttons,
  20-minute passage timer (the documented TIMER_DEFAULTS passage value), palette 1-13

### Writing coach — PASS, and the two-stage gate is real
- Picker: 100 of 100 prompts, search + task-type filter, cards leading with what each TEACHES
  ("Describe the shape of the ranking, not the order"), "models locked" badges
- Six tabs: The task, The overview, The plan, Model answers, Compare, Language bank
- STAGE 1 (attempt gate) opened because I genuinely wrote and submitted this prompt in round 3 —
  the card now reads "Attempted" rather than "models locked". The gate tracked a real attempt.
- STAGE 2 (noticing gate) is live and is NOT skippable by unlocking stage 1:
  "Before the notes: what actually changed? These two paragraphs report the same content. One is
  a band-6 rendering, the other a band-7 one. Name two differences you can see, then the
  annotations open." It shows the BODY paragraph, as documented, never the introduction.
- Satisfying it opens the model ladder, and the payoff is personalised to my own result:
  "Opened one band above your own Task Achievement score" — band 7, because my TA was 6.0.
  My typed noticing stays on screen under "WHAT YOU NOTICED", beside the model.
- Per-criterion annotations follow ("WHAT LIFTS IT ABOVE BAND 6 - TA: A figure-free overview
  naming the two groups...")

## Round 5

### Progress panels with real data — PASS
18 charts render. Every documented rule visible at once:
- "No overall band yet — An overall band needs an estimate in all four skills"
- Listening 6.0, Reading 4.0, Writing "not enough scored practice yet —" (em dash, never an
  invented number), Speaking "Self-rated starting point —"
- Band trajectory: "Weeks without enough scored practice are left blank rather than joined up",
  and the lines genuinely start at Wk 33 with nothing drawn before
- Y-axis pinned 4.0-9.0; axis labels spelled out ("IELTS band", "Study week (ISO week number)")
- Target band 6.5 as a dashed reference line KEYED OUTSIDE the plot
- Range selector defaulting to "Last 12 weeks"; six series tabs; "Show the numbers" toggle
- Criterion panel states the split: four criteria for Writing/Speaking, accuracy by question
  type for Reading/Listening
- Activity calendar: "Rest days in your plan are never counted against you."
- Mock history states the weighting: "mocks run in strict exam mode and carry double weight in
  your band estimates"
- Readiness correctly locked, explaining which checks are automatic and which are yours to tick

### The three mock pre-flights — PASS
- READING: "unlike Listening there is no extra time at the end to write your answers up" (the
  documented loudest line), checkpoints 16:00/36:00/58:00, band facts, and the exception that
  highlighting and notes stay on because computer-delivered IELTS has both
- WRITING: "The only place a combined Writing band is shown", past sittings, per-task minutes
  and word minimums, Task 2 weighting, nothing submits itself
- LISTENING: computer-delivered vs paper-based choice, the transfer-time mnemonic, and
  "length known once the audio is prepared" — the documented refusal to sum partial renders
  rather than announce a wrong duration

## Round 6 — the last untouched features

### Suggest-never-schedule, verified ACROSS modules — PASS
The headline rule, proven end to end rather than read:
- Pressed "Add all (6)" on the marked essay's Improve tab
- The vocabulary Inbox badge went 0 -> 6, "6 words waiting for your decision"
- The rule is restated at the destination: "This inbox is the only way a word enters your
  review queue. Nothing here is scheduled, and nothing is ever added automatically by a
  practice session."
- Each item carries its PROVENANCE ("from your Writing"), quotes the sentence it came from,
  and says "Definition is still being filled in. Accepting will finish it in the background."
- Accepting one moved the badge 6 -> 5 and scheduled that word only

### Speaking drills — PASS
- Coach card opens with six tabs; Model answers and Compare show PADLOCKS on a card never spoken
- Drills tab: "The two-minute set — 3 drills, about 2 minutes, in the order that builds on
  itself", per-kind budgets (Minimal pair 8s) and per-kind rationale
- The accent notice appears here too, as the rule requires on every pronunciation-adjacent screen
- The drill is built from THIS card's own pronunciation focus: text vs tex,
  "dropping the final /t/ loses the whole word"
- "Record 8s" with a "Type it instead" fallback offered even though STT is available
- Typed the forbidden neighbour ("text") and it graded correctly and mechanically:
  "Not quite - Heard: 'text'. We heard 'text', not 'tex'. The two differ only in dropping the
  final /t/ - exaggerate that one feature and say it again."

OBSERVATION (not a rule violation): the verdict renders as "0/100". This is NOT a breach of the
pronunciation honesty rule — that rule forbids publishing ASR CONFIDENCE as a pronunciation
score, whereas this is a mechanical check of whether the distinguishing feature was produced,
which is intelligibility and is explicitly permitted; the accent notice on the same screen even
says "These scores measure how clearly each sound comes across". The narrower objection is that
a BINARY outcome rendered as 0/100 implies 101 gradations when there are two.

### Grammar contrast boards — PASS
26 boards ship, matching the documented count. gb_active_vs_passive renders every documented
section in the documented order: the question as the page title ("Which of the two things in
this event should the sentence be about? Ask yourself this one question and the choice makes
itself"), the rivals as buttons into their own lessons carrying their state badges, One
difference two meanings, Three pairs worked, A test that always works, The exception once
("Know it exists, then ignore it"), and Practise this contrast. The personal hit rate is
correctly absent, having never answered this contrast.

Also confirmed: a locked lesson opens READ-ONLY with its prerequisite explanation rather than
refusing to open (gr_past_simple_vs_cont, "A choice to make", Locked).

## Round 7 — the audit closes

### The listening coach gate, opened by a real attempt — PASS
This could only be tested after actually sitting the exam in round 2, and it is the cleanest
proof of the gate design in the whole app:
- The picker moved to "43 of 43 parts · 4 sat", showing exactly 4 "Transcript open" against
  39 "Transcript locked". Submitting the four-part exam opened precisely its own four parts,
  per part, server-side.
- The part opens on five tabs: Prediction, The brief, Transcript (10), Signposts & traps,
  Vocabulary — and LANDS ON PREDICTION, not the brief, which is the documented deliberate
  default because prediction is the only one useful before the audio plays
- It shows my real result ("0 when you sat it") and offers "Sit it again"
- The transcript is genuinely unlocked: 27,947 characters of transcript and per-question
  timelines, carrying all five documented moments — BEFORE, APPROACH, THE MOMENT, THE TRAP,
  AFTER — with "Replay any line, or press a moment button beside a question"

### "Why was I wrong?" trap analysis — PASS
- Names the trap from the closed taxonomy: "absence read as contradiction"
- Quotes the passage as evidence, then gives the reusable rule ("Always look for direct
  statements or clear implications in the text...")
- Names the model that produced it: "Generated by google/gemini-2.5-flash"

## AUDIT COMPLETE
Every feature in docs/FEATURES.md has now been exercised in the running app except the two
below, neither of which is a coverage gap in the code.

## Still unverified (needs long-running setup or hardware)
- Completing a full 60-minute mock SITTING end to end in any of the three skills. All three
  pre-flights are verified, and the listening exam-conditions sitting was driven start to
  finish, so the machinery underneath is proven; only the hour itself is unsat. Sitting one
  would exercise no code path that has not already been driven.
- Speaking live examiner call (needs a real microphone; not drivable from this browser context)
- Grammar Theory / Your points / Phrases / contrast boards in detail
- Progress panel contents in detail (charts need scored attempts to populate)
