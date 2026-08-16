# Final walkthrough — a new learner, no key configured

Read-only audit. Route entry (`app/src/App.tsx`) → onboarding → Home → the three plan blocks →
each room → review → Settings. Nothing was edited.

The individual screens are in good shape. Almost everything below lives at a join: the plan
promises something, and the room the plan hands you to has never heard of the plan.

Ranked by how many learners hit it and how stuck they get.

---

## 1. The very first thing the app asks you to do is a review of an empty word bank

`sidecar/bandready/curriculum/plan.py:197` — `compose_session_blocks` puts `_warmup_block` first
in **every** session, always. `app/src/features/home/blocks.ts:161` routes `warmup_srs` to
`/vocab`, and `blocks.ts:198` labels it `Up to 20 due cards`.

Day one the bank is empty by design — `app/src/features/vocab/components/ReviewOverview.tsx:68`
is a well-written empty state that says so ("Your word bank is empty, and that is the normal
start"). But the learner arrives at it having just read a card that told them 20 cards were due
and pressed a button labelled Start. The honest empty state reads as a contradiction, not as an
onboarding.

**What the learner experiences:** block 1 of session 1 promises 20 due cards and lands on a screen
saying they have no words at all.

---

## 2. Start on a block opens the room's default, not the block

`app/src/features/home/components/TodaySessionCard.tsx:255` — `navigate(path)`, where `path`
comes from `blockTarget` (`blocks.ts:160-182`) and is a bare room path with no activity, no
prompt, no session id, no query string. No room reads one: `grep -rn "useSearchParams"` over
`features/speaking` returns nothing.

The worst case is Speaking, because `app/src/features/speaking/store.ts:269` defaults
`activity: "full_mock"`. So the card says **"Speaking: Part 1 interview · 25 min"**, and the
screen it opens has the mode picker sitting on *full mock* and a primary button reading
"Set up the mock test" — an 11-to-14-minute scored sitting.

Writing is the same shape: "Writing: Task 2 essay" opens the prompt bank on the Prompt bank tab,
unfiltered, with Task 1 and Task 2 mixed.

**What the learner experiences:** told to do a Part 1 interview, handed a full mock test, with
nothing on screen connecting the two.

---

## 3. The third block of every session is a drill that does not exist

`plan.py:72-80` — `CRITERION_DRILL` emits `gra_complex_sentences`, `cc_cohesion_linkers`,
`ta_answer_the_question` (module `writing`), `lr_paraphrase_sprint` (`vocab`),
`fc_fluency_shadowing` (`speaking`); the default is `vocab_recall_sprint`.

```
$ grep -rn "gra_complex_sentences|fc_fluency_shadowing|lr_paraphrase_sprint" app/src
features/home/blocks.ts:82,85,86            (labels only)
features/onboarding/components/PlacementResultView.tsx:46,49,50   (labels only)
```

They exist only as strings in a label table. No screen implements any of them.
`blocks.ts:51-58` (`ACTIVITY_ROUTES`) has no entry for them, so `blocks.ts:166` falls through to
the module and opens `/writing` or `/vocab`.

`blocks.ts` was built to be honest about this — `blockTarget` returns
`unavailableReason: "…has no screen in this build yet"` and `TodaySessionCard.tsx:144` disables
the button. That path is never taken for micro-drills, because the module always resolves.

**What the learner experiences:** "Micro-drill: Complex sentences · 10 min" opens the Writing
prompt bank, which contains no complex-sentence drill, and the app never admits it.

---

## 4. Listening is promised as ready, needs a 340 MB download, and fails to a page that does not exist

Four statements in a row, all made before the failure:

- `app/src/features/onboarding/components/steps.tsx:58` — "Reading, Listening, Vocabulary and
  Grammar work right now, with nothing to set up." Shown verbatim on wizard steps 4 and 5.
- `app/src/features/listening/page.tsx:71` — "The audio is generated on this machine, so nothing
  needs the internet."
- `app/src/features/listening/components/PrepareAudioPanel.tsx:90` — "The voices are synthesized
  locally the first time, then cached. Expect 30 to 90 seconds."

The default TTS engine is `kokoro_onnx` (`sidecar/bandready/settings_store.py:74-75`) and its
weights are a **340 MB download** that does not ship
(`sidecar/bandready/server/routes/models.py:88-103`, `approx_mb: 340`). The failure text is
`sidecar/bandready/audio/tts_render.py:528-534`:

> Kokoro model files are missing (expected kokoro-v1.0.onnx and voices-v1.0.bin under
> …/models/kokoro); download them from the Models settings page before rendering listening audio

There is no Models settings page. `app/src/features/settings/page.tsx:19-26` lists exactly six
tabs: You, Providers, Voice, Appearance, Data, About. The download control is
`ModelDownloads` → mounted only at `ProvidersTab.tsx:55`, which is behind
`ProvidersTab.tsx:41` (`if (!advanced) return <SimpleSetup …>`). And `friendlyMessage`
(`app/src/lib/errors.ts:78`) passes the sentence through untouched because it matches
`/settings/i`, so the learner gets the raw filenames and the wrong page name.

**What the learner experiences:** presses "Prepare audio" expecting 30 seconds, waits, and is
told to visit a settings page that is not in the app, in a sentence containing two `.onnx`
filenames and an absolute path.

---

## 5. Nothing you do in a room ever gets back to the plan

`app/src/features/home/store.ts:137-148` posts `/plan/sessions/{id}/start` and that is the only
plan write any room triggers.

```
$ grep -rn "plan/sessions" app/src
features/home/store.ts:140   .../start
features/home/store.ts:154   .../complete
features/home/store.ts:170   .../skip
```

`/plan/sessions/{id}/partial` exists on the sidecar (`server/routes/progress.py:535`) and is never
called. `current_block` is never advanced by anything, so `activeBlockIndex`
(`blocks.ts:210-216`) returns 0 forever, and `minutes_logged` only ever moves when the learner
presses "Mark session done", which jumps it straight to the full duration
(`curriculum/plan.py:673-674`).

**What the learner experiences:** finishes a 40-minute reading passage, returns to Home, and the
session card is byte-identical — block 1 still highlighted, "Minutes logged today" absent,
nothing ticked. The only way to make the dashboard acknowledge an hour of work is a button
labelled "Mark session done", which marks all three blocks done at once whether or not they were.

---

## 6. Settings opens on three amber alarms with no text under them

`app/src/features/settings/components/SimpleSetup.tsx:190` — "Is everything working?" renders one
row per modality. `SimpleSetup.tsx:203` computes
`failure = busy || ok ? null : (failureSentence(result) ?? thrown ?? null)`, and
`failureSentence(undefined)` returns `null` (`SimpleSetup.tsx:66-67`).

Nothing runs verify on mount — `settings/page.tsx:80-92` runs `loadPresets`, `runDetect`,
`loadRecommended`, `loadModels` and never `runVerify`; the only two call sites are the two
buttons (`SimpleSetup.tsx:255`, `ProviderSlotCard.tsx:250`).

So the destination of every "Open Settings" / "Set up the examiner" call to action in the app is
three rows each showing a `CircleAlert` in a muted circle, a bare "Check" button, and no sentence
at all. The good copy in `failureSentence` — including the `needs_download` case that is exactly
right for the Kokoro problem in §4 — only appears after the learner presses Check on each of the
three rows individually.

**What the learner experiences:** arrives to fix one thing, sees three warning icons and no words,
and cannot tell which of the three is their problem without pressing three buttons.

---

## 7. Clicking Home during setup silently teleports you back into setup

`app/src/features/home/page.tsx:75-77` — `if (initialized && needsOnboarding(summary)) return
<Navigate to="/onboarding" replace />`, and `firstRun.ts:103-106` makes `needsOnboarding` true for
anyone with no plan and no deferral.

The escape hatch only exists on step 1 and from step 2 on (`page.tsx:111-133`,
`ESCAPE_HATCH_FROM_INDEX = 1` at `store.ts:57`), but the sidebar is visible throughout
(`WizardChrome.tsx:29` — "onboarding deliberately fills the pane so the sidebar is the only chrome
around it"). Reading, Listening and Vocabulary in that sidebar all work mid-wizard. Home is the
one that does not.

**What the learner experiences:** clicks Home to go and look at the app before answering more
questions, and the screen flickers back to the same wizard step with no message.

---

## 8. The one file Listening needs is labelled "Needed for Speaking" and the wizard tells you to skip it

`steps.tsx:857` badges an in-use artifact `Needed for Speaking`, and `steps.tsx:913` closes the
step with "Nothing here is required to continue. Downloads can wait until you first open the
Speaking room."

The artifact in question is `kokoro-v1.0`, `kind: "tts"` (`server/routes/models.py:91-93`). It is
required for every listening test in the app (§4), and the wizard has just told the same learner
on the same screen that Listening "works right now, with nothing to set up" (`steps.tsx:58`).

**What the learner experiences:** correctly declines a 340 MB download they were told is only for
a room they do not plan to use, and thereby breaks the Listening module without knowing it.

---

## 9. The fix instructions name controls that are not in the default Settings view

`app/src/features/writing/markingStatus.ts:49-50`:

> Open Settings → Providers, choose a model and press Verify.

The default Providers view is `SimpleSetup` (`ProvidersTab.tsx:41`). It has no "Verify" —
`SimpleSetup.tsx:256` renders `"Checking…" | "Check again" | "Check"`. It has no model chooser
either; that is `ProviderSlotCard` behind Advanced settings. The one button labelled Verify is
`ProviderSlotCard.tsx:253`, two clicks deeper.

Same class of error at `tts_render.py:534` ("the Models settings page", §4) and at
`SimpleSetup.tsx:69` ('Open Advanced settings and press Download under "Model weights"') — that
last one is correct, and is the only pointer in the app that actually is.

**What the learner experiences:** follows the instruction word for word, cannot find "Verify" on
the screen it names, and has no way to know they are two clicks short.

---

## 10. The global banner blames a provider for a missing local file, and lists a feature that needs no provider

`app/src/components/shell/ProviderStatusBanner.tsx:41-45`:

> BandReady couldn't reach a model provider … Scoring, generated prompts, word lookups and
> listening audio need one; everything else keeps working.

Two problems. First, `api.pollJob` (`app/src/lib/api.ts:332-343`) reports every failed job as a
provider failure, so the Kokoro-weights-missing case in §4 raises this banner too — a missing file
on disk described as an unreachable provider, with an "Open Settings" button that lands on the
route/key chooser rather than on the downloads list.

Second, word lookups do not need a provider at all:
`app/src/features/reading/useDictionary.ts:1-3` — "WordNet in the sidecar, never an LLM", and
`sidecar/bandready/server/routes/dictionary.py` contains no LLM call.

**What the learner experiences:** told a provider is unreachable when nothing was being reached,
and told that dictionary lookups will stop working when they will not.

---

## Notes on what is already good

Worth saying, because most of the above is joins rather than screens:

- `features/writing/markingStatus.ts` is the right model for "check before you ask for forty
  minutes", and its three rules in the header docstring are the ones the rest of the app should
  be held to. It is used only by `features/writing` (`grep -rn "useMarkingStatus" app/src`).
- Speaking guards its start button on `examiner_available` in both the room
  (`features/speaking/page.tsx:206-212`) and the mock pre-flight
  (`components/mock/MockPreflight.tsx:257`), and explains the consequence in both.
- The placement offer warns about unmarkable Writing and Speaking *before* the 30-minute sitting
  (`steps.tsx:1096-1110`), and `_score_productive` falls back to the self-rating rather than
  inventing a band (`server/routes/placement.py:962-974`).
- `features/vocab/components/ReviewOverview.tsx:63-94` and
  `features/progress/page.tsx:78-140` are both model empty states — they name what fills the
  screen and give a way to start.

## Verification

```
$ cd app && npx vitest run src/features/home
  Test Files  1 passed (1)
       Tests  9 passed (9)
```

The suite is green. None of the ten findings above is covered by a test.
