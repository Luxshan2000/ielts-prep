# A1 — First run

Audited against the running app (localhost:5273, sidecar 127.0.0.1:8710) on 2026-08-15.
Profile state: `plan_id: null`, `needs_placement: true`, no scored attempts.

Machine state that a first-run learner shares: `GET /providers/detect` returns
`ollama/lm_studio/mlx_lm/llama_cpp → absent`, `kokoro/faster_whisper → ready`.
`GET /settings` ships `llm.preset=ollama, model=qwen3:14b, base_url=http://127.0.0.1:11434/v1`.
`POST /providers/verify {"modality":"llm"}` →
`{"ok":false,"state":"unreachable","detail":"could not connect to http://127.0.0.1:11434/v1 — is the server running?"}`.
So: **the app ships pointed at a model server that is not installed**, and everything below follows from that.

---

## Answers to the five questions

**What a new user sees first.** `/` → `HomePage`, which *does* redirect: `app/src/features/home/page.tsx:67-69`
returns `<Navigate to="/onboarding" replace />` when `needsOnboarding(summary)`. The premise in the brief
("no route redirects to it") is out of date — the redirect exists and the first screen is the wizard, with the
sidebar still live around it. The next action is obvious (**Continue**).

**Is the Home first-run card enough?** The redirect makes the card a backstop rather than the only door, and the
dashboard's empty states are honest (`—` with "No estimate yet / Self-rated starting point", not zeroes).
But the redirect is gated on a browser flag with no way back — see F6. Right now, on this machine,
`localStorage['br-onboarding-skipped'] === "1"` with `plan_id === null`, so the wizard never opens and the
learner lands on a dashboard of dashes. Two links out remain (`TodaySessionCard.tsx:170` "Set up my plan",
`home/page.tsx:155` "Take the placement test"), so it is not a hard dead end — it is a silent one.

**Where a learner stalls in the wizard.** Steps 1-3 are good. Step 4 tells them four things they have never
heard of are "Not found" and gives them no button (F5). Step 5 shows them `mlx-community/Qwen3-14B-4bit via mlx`
and a 1.5 GB download they do not need (F7, F8). Step 7 sells a 30-minute placement whose Writing and Speaking
halves cannot be scored on this machine (F4).

**What must be configured before practice works, and does the app say so?** Reading, Listening and Vocabulary
work out of the box (the core pack is installed: 36 passages, 7 listening tests, 1246 vocab). Writing, Speaking,
the coaches and every band score need a reachable LLM. Nothing in first run configures one; nothing in the
Writing or Speaking room warns before the learner commits time; the wizard says it in prose on step 4 and then
contradicts itself on step 5 (F9).

**Enthusiastic Start → error?** Yes, three of them: Speaking's "Sit a full mock test" (F2), Writing's
"Sit the 60-minute paper" (F3), and "Take the placement test" (F4).

---

## Fix list, worst first

### F1 — Nothing in first run gets a scoring model working, and the failure is invisible
`app/src/features/onboarding/store.ts` never calls `PUT /api/v1/settings`; the wizard is read-only about
providers. It leaves the shipped default (`ollama`, unreachable) in place, then hands the learner to a
dashboard. Worse, the one screen that would tell them lies by omission:
`app/src/features/settings/components/SimpleSetup.tsx:129-170` — a verify that returns `ok:false` renders
**identically to never-checked**: the row's button flips back to "Check" and `verify[modality].detail` /
`verifyError[modality]` are never rendered. Confirmed live: pressed "Check" on *The examiner*, waited 12 s,
row unchanged, while the same call over curl returns "could not connect to …". Alongside it,
`SimpleSetup.tsx:206` badges the local route **"In use"** although nothing is installed.
*Fix:* render the failed state ("Not working" + the sidecar's detail + the fix action) in `SimpleSetup.tsx`;
stop showing "In use" for a route that has never verified; have the wizard write a working provider choice
(or an explicit "no scoring yet" choice) instead of only describing one.

### F2 — Speaking offers a full mock with no examiner and no preflight
`app/src/features/speaking/page.tsx:62-63` gates its only warning on `engine.voice_available`, and that field is
`pipecat_available()` — a Python import check — at `sidecar/bandready/server/routes/speaking.py:746`. It is
`true` here. `start_session` (`speaking.py:222-245`) checks only for a conflicting live session. So the room
shows "Counts toward your band", "Go to the mock room", mic test and all, and the examiner simply never speaks.
*Fix:* extend `/speaking/engine` with the LLM reachability the verify route already computes, and let
`page.tsx` disable the scored modes with one sentence naming the fix.

### F3 — Writing lets a learner spend 40 minutes before revealing the same problem
`app/src/features/writing/page.tsx:95` only handles the sidecar being down. The provider failure surfaces at
submit: `writing/store.ts:782` → `friendlyMessage` → the raw sidecar string plus "Check your model provider in
Settings, then try again." (`app/src/lib/errors.ts:47-52`). The learner reads
*"could not connect to http://127.0.0.1:11434/v1 — is the server running?"* — a URL and a port, to someone who
never chose either. The draft is kept (`status: failed`), so nothing is lost but the time.
*Fix:* preflight banner on the Writing page when scoring is unavailable ("You can write and save now; marking
needs a scoring model — set one up in Settings"), and strip host/port out of the learner-facing string.
`isProviderFailure()` in `lib/errors.ts:35` exists for exactly this and is currently used by tests only.

### F4 — Placement silently downgrades the work the learner actually did
`sidecar/.../placement.py:840-848`: when the LLM call raises, `_score_productive` logs and returns `None`; the
completion loop (`placement.py:888-896`) then falls through to the self-rating with `skipped: True`. The result
screen prints **"From your self-rating"** under Writing and Speaking
(`app/src/features/onboarding/components/PlacementResultView.tsx:103`). A learner who typed a 150-word essay and
four spoken answers is told, in effect, that they did not. That is the "nothing claims more than it knows" rule
inverted — the app knows the scoring failed and says something else.
*Fix:* carry a third state ("could not be scored — no model was reachable") through
`/placement/complete` and render it distinctly from a skip; ideally warn on step 7 before the sitting starts.

### F5 — Step 4 is a dead end: four "Not found" rows and no way to act
Live text: *"Ollama — Not found / LM Studio — Not found / mlx-lm — Not found / llama.cpp — Not found"*, then
*"Start one of these, or add a cloud key in Settings"* (`onboarding/components/steps.tsx:400-405`). The sidecar
already returns everything needed to fix it — `providers/detect.setup` carries per-engine
`{runnable, kind, reason, url, command, instructions}`, e.g. *"Install Ollama, then come back — we re-detect
automatically."* — and `EngineRow` (`steps.tsx:328-349`) drops the whole `setup` block. Settings can already run
it: `features/settings/store.ts:736 runSetup()` + `components/DetectPanel.tsx`.
*Fix:* reuse `DetectPanel`'s row (or its setup action) inside `StepEngines`; a learner should never read a
provider slug without a button next to it.

### F6 — "Skip setup for now" is one-way and lives in browser storage
`app/src/features/home/firstRun.ts:18-45`: the deferral is `localStorage["br-onboarding-skipped"]`, cleared only
by completing or skipping *placement* (`onboarding/store.ts:300,320`). There is no UI to undo it, and it is not
profile state — so a learner who cleared browser data, or a second machine, gets re-onboarded, while this
machine has a permanently suppressed wizard with `plan_id: null`.
*Fix:* key the deferral off server state (a `deferred_at` on the profile, or accept `onboarded_at` on the wire —
`firstRun.ts:9-13` notes it is deliberately not exposed) and offer "Run setup again" from Settings.

### F7 — Step 5 shows raw model ids and slugs to a learner
`onboarding/components/steps.tsx:488-496` renders *"Suggested scoring model: mlx-community/Qwen3-14B-4bit via
mlx."* — a HuggingFace path and a runtime slug, purely informational, with nothing to click.
`steps.tsx:500-505` prints `cloud_alternative.advice` with its label dropped, so the page contains the orphan
sentence *"Best scoring quality; audio still runs locally so recordings never leave the machine."* with no
subject. `steps.tsx:542-546` badges artifacts **STT** and **TTS**.
*Fix:* name the thing by its job ("the model that marks your writing"), keep the id out of the wizard, restore
the cloud option's title, and replace STT/TTS with "speech to text" / "examiner voice" (the labels
`ENGINE_LABELS` already uses one step earlier).

### F8 — Step 5 pushes a 1.5 GB download the app does not use
The only "required" artifact offered is **MLX Whisper large-v3-turbo (1.5 GB)**, from
`/models/recommended.required_artifacts`. The configured STT is `faster_whisper/base`, already installed
(`detect: faster_whisper → ready`) and verified Working. On a modest laptop on a slow connection this is the
single most expensive thing the wizard asks for, and it changes nothing.
*Fix:* mark artifacts that the current settings actually use; label anything else "optional — a more accurate
speech model" with its benefit stated, never as the default action.

### F9 — Adjacent steps contradict each other about what works
`steps.tsx:366-370` (step 4): *"Nothing here blocks Reading or Listening practice."*
`steps.tsx:467-472` (step 5): *"Reading and Writing work immediately."* Writing does **not** work without a
scoring model, which is the whole point of the previous screen.
*Fix:* one sentence, used in both places: Reading, Listening and Vocabulary work now; Writing and Speaking need
a scoring model.

### F10 — Setup is lost on reload, and the sidebar invites the learner to wander off
`onboarding/store.ts:103-126` keeps the draft in memory only. A reload during the wizard (or an Electron
restart) returns to step 1 with `DEFAULT_DRAFT` — exam date, target band and study days gone. The wizard renders
inside the app shell, so every practice room is one click away mid-setup.
*Fix:* persist the draft (same `localStorage` convention as `br-theme`), or write the profile at step 3 where it
is already valid.

### F11 — Two escape hatches, near-identical wording, opposite consequences
`onboarding/page.tsx:97-108` step 1 "Skip setup for now" → `deferEntirely()`, writes nothing to the server.
`onboarding/page.tsx:92-96` steps 4-6 "Set up later" → `skipPlacement()` (`store.ts:312-328`), which POSTs
`/placement/start` **and** `/placement/skip`, committing the profile and generating a plan. A learner cannot
tell those apart from the labels.
*Fix:* "Skip setup for now" / "Finish setup without the placement test — I'll use my self-rating".

### F12 — The Speaking placement is typed, then reported as a speaking sample
`onboarding/components/PlacementRunner.tsx:375-401` collects four typed answers immediately after the wizard's
microphone check, and step 7 advertises "four speaking questions" (`steps.tsx:775-779`). The result labels the
band "From the sampler" (`PlacementResultView.tsx:103`) with no note that no speech was involved.
*Fix:* call it what it is on step 7 ("four short written answers, in the way you would say them"), and keep the
"typed sample" qualifier on the result row.

### F13 — The dashboard and the sidebar disagree about vocabulary, by 7×
Sidebar badge reads **20** (`components/shell/Sidebar.tsx:65-70` ← `/vocab/stats.due_today`, which applies the
daily caps: 10 new + 10 learning). The dashboard card reads **Due today 151** and the button says
**"Review 151 cards"** (`features/home/components/SideTiles.tsx:134,161` ← `progress.py:131`, a raw count of all
scheduled cards). Clicking "Review 151 cards" delivers 20. This is the first pair of numbers a new install shows.
*Fix:* have `progress.py:129-138` report the same capped `due_today` the SRS will actually serve.

### F14 — Small but visible
- `WizardChrome.tsx:52-72`: progress is seven unlabeled dots; the step names are `sr-only`. Add a visible
  "Step 4 of 7 · What's already on this machine" for a learner who wants to know how long this is.
- `store.ts:42` (`ESCAPE_HATCH_FROM_INDEX = 3`): steps 2 and 3 have no way out except Back.
- `PlacementResultView.tsx:129`: prints the raw ISO date (`· exam 2026-11-14`) where `formatDate` is imported
  and used two lines below.

---

Any fix here must keep `app/src/features/onboarding/__tests__/onboarding.test.tsx` and
`app/src/features/home/__tests__/home.test.tsx` green; F6 in particular is asserted by the first-run redirect
tests and will need those updated alongside the code, not around it.
