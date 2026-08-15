# A3 — Settings and setup surfaces

Audited against the running app (localhost:5273, sidecar 8710) on a machine where the
sidecar reports: `ollama absent, lm_studio absent, mlx_lm absent, llama_cpp absent,
kokoro ready, faster_whisper ready, mlx_whisper needs_download`. That is very close to a
real fresh install: voice out works, hearing works, **the examiner does not**.

All five tabs opened. Every finding below was reproduced in the browser, not inferred.

---

## 1. The learner walkthrough, click by click

**Where they arrive.** `components/shell/ProviderStatusBanner.tsx:45` is the app's one
global answer to "no working model": it says *"BandReady couldn't reach a model provider"*
and gives an **Open Settings** button. Every scoring failure anywhere funnels here. So the
Settings → Providers screen is not an optional expert surface; it is the landing pad for
every broken install.

Onboarding funnels there too. `features/onboarding/components/steps.tsx` `StepEngines`
ends, when nothing is running, with *"add a cloud key in Settings whenever you like"* —
prose, no link, no key field, no way to act inside the wizard.

**Then:**

1. Sidebar → **Settings**. Lands on the tab labelled **Providers** (`page.tsx:18`). The
   learner was sent here by a banner about a "model provider" and the tab is named after
   the same concept the simple view exists to hide.
2. `SimpleSetup` renders. Card 1 asks "Where should the thinking happen?" and shows
   **On this computer — In use**. This is false-comforting: it is "in use" only because
   `SimpleSetup.tsx:66` tests whether the base URL is localhost. Nothing is running behind
   that URL.
3. Card 2, "Is everything working?", shows three rows with a small grey alert circle and a
   **Check** button.
4. Learner clicks **Check** on *The examiner*. Spinner for ~1s. Then the row returns to
   **exactly the state it was in before** — same grey circle, same **Check** button. No
   message. No reason. No next step.

   The sidecar had answered, in full:
   `{"ok":false,"state":"unreachable","detail":"could not connect to
   http://127.0.0.1:11434/v1 — is the server running?"}`

   `SimpleSetup.tsx:130` reads only `verifyState?.[m]?.ok === true`; lines 156–167 render
   either a "Working" badge or the Check button. `verify.detail`, `verify.state` and
   `store.ts` `verifyError` are **never rendered anywhere in the simple view**.

**This is where it breaks down, and it is a hard dead end.** The banner promised Settings
would fix it; Settings runs a check, learns the precise cause, and shows the learner
nothing. Screenshot: the failing row is visually indistinguishable from the never-checked
row (grey circle + Check on all three, then two turn green and one silently does not).

The only escape is the ghost link **Advanced settings** at the bottom of the page
(`SimpleSetup.tsx:174-178`), which is styled as the least important thing on screen and
opens seven engines, three base-URL cards, and five model weights.

**Verdict on `SimpleSetup.tsx`: it does not go far enough.** It successfully hides
complexity on the happy path and successfully names the three jobs in human words. It
fails on the one path that matters — the path the global banner routes every broken
install down. A setup screen that cannot say *why* is a status light, not a setup screen.

---

## Findings, worst first

### F1 — A failed check says nothing at all
`app/src/features/settings/components/SimpleSetup.tsx:129-170` (specifically `:130` and
`:156-167`).
The verify response carries `state`, `detail` and `warnings`; none reach the DOM. Clicking
Check on a broken job is indistinguishable from never having clicked it. Confirmed live
with `llm` (`unreachable`) — see walkthrough above.

Every distinct cause the sidecar already reports, and the sentence the learner needs:

| `verify.state` | sidecar `detail` (verbatim) | what the row should say + do |
|---|---|---|
| `unreachable` | `could not connect to http://127.0.0.1:11434/v1 — is the server running?` | "BandReady needs a marking program running on this computer. Install Ollama (one click), or use an online service instead." → two buttons |
| `needs_download` | `whisper weights for '…' are not downloaded yet` | "A 1.5 GB one-time download is missing." → **Download (1.5 GB)** button, inline |
| `unauthorized` | `key rejected for model '…'` | "That key was refused. Check you pasted the whole key." → **Get a key** link + focus the field |
| `timeout` / `error` | provider text | "It answered too slowly to use." → Try again |

### F2 — "Use my computer" writes a configuration that cannot work, and breaks one that did
`SimpleSetup.tsx:49-60` (`useRoute`) applies every row of the recommendation table.
On this machine the sidecar recommends `llm: mlx_lm / mlx-community/Qwen3-14B-4bit` and
`stt: mlx_whisper / whisper-large-v3-turbo`. So one click:

* points the examiner at `mlx_lm`, which detection reports **absent** and whose only setup
  route is a terminal command (`uv tool install mlx-lm`) shown only in Advanced. The
  learner is now *worse* off — before the click, `ollama` was at least a one-click GUI
  install; after it, the recommended engine is one BandReady cannot install for them.
* replaces a **working, installed** `faster_whisper / base` with `mlx_whisper /
  large-v3-turbo`, which is `absent` and needs **1.5 GB**. Verified: "Hearing you" reports
  *Working* before the click and fails after it, with no download offered anywhere in the
  simple view.

Nothing on screen warns that a click cost them a working transcriber and added 1.5 GB of
downloads. `useRoute` must not recommend an engine that is absent-and-not-installable, and
must not downgrade a modality that currently verifies OK.

### F3 — Clicking "Use an online service" drops the full developer card into the simple view
`SimpleSetup.tsx:119` renders `<ProviderSlotCard modality="llm" />` verbatim. Screenshot
confirms the learner now sees, on the *simple* screen:

* a **Provider** `<select>` with 10 entries including `llama.cpp (llama-server)`,
  `MLX (mlx-lm server)` and (in this build) `Mock LLM (tests)`;
* **Base URL \*** — locked, greyed, unusable, and still marked required
  (`SpecField.tsx:193-205` + `Field` required asterisk);
* **Model \*** preset to the raw slug `anthropic/claude-sonnet-4.5`, hinted with
  *"Run Verify to load the models this endpoint actually serves"* (`SpecField.tsx:46`);
* an **Advanced** disclosure with Temperature and Max tokens;
* buttons **Verify** and **Provider docs** — no "Get a key" link at the point of need.

The cloud path needs exactly one input (the key) and one link (where to get it).

### F4 — Raw provider slugs are rendered as the status badge
`components/ProviderSlotCard.tsx:166-168`:
`{verify.ok ? "Verified" : (verify.state ?? "not reachable")}`
Reproduced live: after verifying OpenRouter with no key, the card header reads
**`unauthorized`**. The same line will print `needs_download`, `unreachable`, `timeout`.
These are wire enum values. Rule: "no screen shows a raw id, a model name, a provider slug".

Also `ProviderSlotCard.tsx:283-288` shows `· 995 ms · first token 196 ms` beside the
error — latency telemetry next to a message a learner is trying to act on.

### F5 — A cross-reference that points off-screen
`ProviderSlotCard.tsx:305-309` on `needs_download`: *"download them in the Models section
below."* When this card is rendered from `SimpleSetup.tsx:119`, there is no Models section
below — `ModelDownloads` is mounted only in the Advanced branch
(`ProvidersTab.tsx:55`). The instruction is unfollowable exactly when it fires.

### F6 — Switching route silently destroys a saved API key
`store.ts:572-596` (`applyPreset`): line 577 `slot.api_key = "";` and line 592 sets
`secretTouched[modality] = true`. `store.ts:634` then keeps `api_key: ""` in the PATCH
because the slot is "touched". Both `SimpleSetup` route buttons call `applyPreset` for the
LLM slot.

Sequence: learner has a working, saved OpenRouter key → clicks "Use my computer" to try
local → it does not work → clicks "Use an online service" → Save. The key field is now
empty, Verify says `unauthorized`, and nothing ever said the key was discarded. The
comment on line 577 ("a new provider means a new key") is right for a *different* provider
and wrong for returning to the same one.

### F7 — The offline / no-recommendations path removes the cloud button entirely
`SimpleSetup.tsx:62` requires an entry with `preset_only: true`; `:104-111` renders the
button only if that entry exists. The shipped fallback table
`store.ts:391-462` sets `preset_only` on **no entry at all** — the 8 GB branch's
`openrouter` row (`:423-428`) omits it. So whenever `/api/v1/models/recommended` is
unavailable and the built-in table is used, the "Use an online service" card renders three
bullets and **no button**. It is also button-less for the first ~1–2 s of every page load
(caught in two snapshots before the fetch resolved). A card with a heading, three selling
points and no action is the definition of a dead end.

### F8 — "Model weights" claims a verification it never performs
`components/ModelDownloads.tsx:34-37`: *"Downloaded once into your data folder and
**checksum-verified**."* Every artifact in `sidecar/bandready/server/routes/models.py`
ships `"sha256": None` — see `_ct2()` at `:66-68` and the Kokoro/MLX entries at `:98-124`.
The downloader only compares a hash when `expected_hash` is truthy
(`models.py:275-284`), so it never does. The API confirms it: `"sha256_pinned": false` on
every file. Nothing claims more than it knows — this claims more than it knows.

### F9 — The biggest downloads have no percentage
`models.py:300`: `pct = (overall / grand_total * 100) if grand_total else None`, where
`grand_total = sum(f["size"])`. All four Whisper artifacts declare `size: None`
(`models.py:66-68`), so `grand_total == 0` and the job's `progress_pct` is `None` for the
entire download. `ModelDownloads.tsx:117` passes that to `Progress`, which renders the
indeterminate pulsing third-of-a-bar (`ui/Progress.tsx:39-41`).

Net effect: **Kokoro (340 MB) shows a real progress bar; Whisper large-v3-turbo (1.6 GB)
and MLX Whisper (1.5 GB) show a pulsing stripe for as long as it takes.** The per-file
caption still counts up (`model.bin — 412 MB / 1546 MB`) but there is no overall percent,
no "file 2 of 4", no ETA and no transfer rate. `approx_mb` is already in the manifest and
would give an honest denominator.

### F10 — Network errors reach the learner as Python exception text
`models.py:270`: `on_bytes(None, None, name, f"retrying in {delay:.0f}s ({exc})")` and
`:267-269`: `f"downloading {spec['name']} failed: {exc}"`. Those strings are rendered
verbatim by `ModelDownloads.tsx:118` (`detail`) and `:127` (`job.error`). On a dropped
connection a learner reads `retrying in 8s (ReadTimeout(''))` or
`downloading model.bin failed: ConnectError('[Errno 8] nodename nor servname provided')`.

The retry/resume *mechanics* underneath are genuinely good — `Range: bytes=`, 3 attempts,
2/8/30 s backoff, `.part` kept on cancel, restart-on-ignored-Range
(`models.py:238-273`), and `ModelDownloads.tsx:83-105` surfaces Resume correctly. Only the
words are wrong. Two additions worth having: a free-disk check before starting (nothing in
the sidecar calls `shutil.disk_usage`) and a refresh of the artifact manifest in
`store.ts:876-888`'s catch, so the "X MB already downloaded" line
(`ModelDownloads.tsx:110-112`) appears after a failure instead of only after a manual
**Refresh**.

### F11 — The "Voice" tab is not about the voice
`components/VoiceTab.tsx` is four VAD sliders: *Sensitivity (confidence)* `0.50`,
*Pause before the examiner replies* `0.60 s`, *Speech start delay* `0.20 s`, *Minimum
volume gate* `0.00` (`:96-140`), plus a paragraph about "the voice library's own default"
(`:142-150`). The three named presets above them (Snappy / Balanced / Patient, `:18-37`)
already cover every learner need.

Meanwhile the things a learner would go to a tab called **Voice** for — which voice the
examiner uses, how fast it speaks, and the **Preview voice** button — live in Advanced →
Providers → Text-to-speech (`ProviderSlotCard.tsx:256-266`). The tab is named for the
thing it does not contain.

### F12 — A free-text model field on non-`custom_openai` presets
`components/SpecField.tsx:50-56`: when the option pool is empty the select degrades to a
bare `<Input>`. `lm_studio` and `llama_cpp` both ship `suggested_models: []` and no
`models_by_modality`, so before Verify has ever run, selecting either gives a free-text
model box. Check against Rule 3 ("only `custom_openai` is free text") — this is exactly the
"pick something that 404s three screens later" case the rule exists to stop. Disabling the
field with "Press Verify to load this server's models" would keep the rule and lose nothing.

### F13 — No tests exist for any of this
`app/src/features/settings/` is 3,251 lines with **zero** test files. It is the screen the
global provider banner routes every failure to. F1, F7 and F6 are all the kind of thing one
render test would have caught.

### F14 — Lower-severity copy and leakage
* `components/DetectPanel.tsx:112-116` — panel subtitle is `darwin · arm64 · 16 GB RAM ·
  Apple Silicon`. Raw platform slugs. (Advanced only.)
* `DetectPanel.tsx:35` — `engineLabel` falls back to the bare engine id for anything not in
  the hard-coded map at `:15-23`.
* `DetectPanel.tsx:217-221` — prints `uv tool install mlx-lm` as inline monospace on the
  engine row, before any copy button context.
* `components/RecommendedModels.tsx:69-73` — raw ids in mono:
  `mlx-community/Qwen3-14B-4bit`, `mlx-community/whisper-large-v3-turbo`, `af_heart`.
* `SimpleSetup.tsx:84-86` — "Free, and works with no internet" / "Nothing ever leaves the
  machine" are true of *running* local models and false of the setup, which needs a
  1.5 GB download from HuggingFace and, on this machine, a package install.
* `page.tsx:79` — "One language model, one voice in, one voice out" is the developer's
  mental model, on the page header.
* `store.ts:907-924` (`presetsFor`) does not filter `hidden` presets, so with
  `BANDREADY_ENABLE_MOCK=1` (this dev build) **Mock LLM (tests)** is selectable in the
  learner-facing Provider dropdown. The comment argues the sidecar gates it, and it does —
  correct for shipped builds, but it is on screen right now.
* `AboutTab.tsx:154-159` — "Database: ok", "Schema revision: 0004", "Mock providers:
  enabled". Fine inside a Diagnostics card; worth keeping it inside one.

---

## 2. Advanced: what a learner ever legitimately needs

Current Advanced surface, counted on screen: **7 engine rows, 4 recommendation rows, 3
provider cards (each with provider select + base URL + model + a params disclosure +
Verify + docs), 5 model weights** — plus a shell command.

| Surface | Does a learner need it? |
|---|---|
| Ollama / LM Studio — install + "Use this" | **Yes**, but as an *outcome* ("Install the free marking program"), never as an engine name they must choose between |
| mlx_lm, llama.cpp | **No.** Neither is installable by BandReady; `llama.cpp` is explicitly detect-only. Pure expert surface |
| Kokoro, Local Whisper, MLX Whisper rows | **No.** These are model *files*, not choices. They belong to a "one-time downloads" step, expressed in MB |
| Base URL × 3 | **No** — except `custom_openai`, whose entire purpose is a URL. The other 12 presets ship their own, and two lock it |
| API key | **Yes**, on the cloud route only, as the single field |
| Model dropdown × 3 | **No.** One recommended model per route. Rule 3 keeps them closed; the learner still should not be picking |
| Temperature / Max tokens / speed | **No.** Temperature's own help text admits "scoring calls override this per request" |
| VAD: confidence / start_secs / min_volume | **No.** Three presets already cover it |
| 5 model weights with Download/Resume | **The download, yes; the list, no.** They need "one file is missing, 1.5 GB, download it", not a matrix of five |
| Verify | **Yes**, renamed. "Check" in `SimpleSetup` is the right word |
| Preview voice | **Yes** — and it is the one genuinely learner-facing control currently buried in Advanced |

Honest total: of ~25 controls, a learner legitimately needs **four** — install-the-thing,
paste-a-key, download-the-missing-file, and hear-the-voice.

## 3. Three jobs, or one path?

The three-job model (`SimpleSetup.tsx:21-25`) is the best copy in the feature: *the
examiner / hearing you / the voice* is exactly the right vocabulary, and "three jobs have
to work for a full practice session" is honest.

But as *setup*, three is wrong. Two of the three are never really a choice:

* **The voice** is always Kokoro, always local, always the same 340 MB file. There is no
  decision.
* **Hearing you** is always local Whisper (the OpenRouter preset note even says
  pronunciation *requires* it). The only variable is which size fits the machine — a
  question the recommendation table already answers without asking.
* **The examiner** is the only genuine fork, and `SimpleSetup` already frames it correctly
  in one question: *where should the thinking happen?*

So: **one "get me started" path, with the three jobs kept as the status readout, not as
three setup decisions.** That is close to what the file already does — the gap is that the
status readout is mute (F1) and the one real decision writes an unusable config (F2).

## 4. Proposal — the simplest thing that could work

Replace the two cards in `SimpleSetup` with one card, `Get me started`, that runs one flow
and always ends in a state the learner can act on.

1. **One question, two buttons** — keep "Where should the thinking happen?" verbatim, keep
   the bullets, fix the two false ones (F14).

2. **Local route.** Do not write config first and check afterwards. Read the detect report,
   then present only the steps that are actually missing, each with the one control that
   fixes it:
   - *"BandReady needs a free marking program on this computer."* → **Install Ollama**
     (opens the download page; auto re-detect while waiting, which `runDetect` already
     supports). Never recommend `mlx_lm`/`llama.cpp` here — BandReady cannot install them.
   - *"One 145 MB file so BandReady can hear you."* → **Download** inline, reusing the
     `ModelDownloads` job plumbing. Never propose a heavier model than the one already on
     disk (F2).
   - Anything already installed shows as a done row, not a choice.

3. **Cloud route.** One provider chosen for them, one password field, one **Get a key**
   link (`preset.docs_url`, already present), one **Check**. No provider select, no base
   URL, no model dropdown, no params disclosure. Do not call `applyPreset` when the learner
   returns to a provider they already have a key for (F6).

4. **Status readout** — keep the three job rows exactly as they read now, and give the
   not-working state a body: the sentence from the F1 table plus the button that fixes it.
   Two shared components already exist to build this from — `components/ui/EmptyState.tsx`
   and `ErrorState.tsx`.

5. Rename the tab **Providers** → **Setup**, and rename **Voice** → **Turn-taking** (or
   move its content and give **Voice** the TTS voice picker, speed and Preview — F11).

Sizes and progress: pass `approx_mb` into `grand_total` so the 1.5 GB downloads get a real
percentage (F9), map the sidecar's exception text to plain sentences before display (F10),
check free disk before starting, and drop or earn the "checksum-verified" claim (F8).

### What Advanced keeps

Everything it has today, unchanged, behind the same `br-settings-advanced` flag
(`ProvidersTab.tsx:10-18`): all 7 detected engines with their setup flows and copyable
commands, `RecommendedModels`, all three `ProviderSlotCard`s with base URL, model
dropdown, params disclosure, Verify, docs and Preview, `custom_openai`, and the full
`ModelDownloads` matrix with Resume/Cancel. Plus, moved in from the learner surface: the
four VAD sliders (F11).

Two changes Advanced should still take, because they are correctness rather than altitude:
the status badge must not print wire enums (F4), and the `needs_download` hint must not
point at a section that is not rendered (F5).
