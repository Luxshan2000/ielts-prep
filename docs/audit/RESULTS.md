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

## Still unverified (needs long-running setup or hardware)
- Listening full exam sitting and mock paper (each part needs 30-90s of TTS rendering first)
- Reading full 60-minute test, mock paper, coach tabs, dictionary popover, highlights/notes
- Writing marking round trip, report tabs, coach gates, 60-minute mock
- Speaking live examiner call (needs a real microphone; not drivable from this browser context)
- Grammar Theory / Your points / Phrases / contrast boards in detail
- Progress panel contents in detail (charts need scored attempts to populate)
