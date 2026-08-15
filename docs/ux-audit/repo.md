# Repository audit — cleanliness and organisation

Read-only pass, 2026-08-15. Nothing was deleted or moved. Every claim below was proved by
grep, by an import-graph walk over `app/src`, by a reference walk over `sidecar/bandready`,
or by parsing `.git/index` (777 entries, matching the stated baseline).

**Headline: the code tree is in good shape and the docs tree is not.** There are no orphan
source files in `app/src` and no dead modules in the sidecar. The real damage is concentrated
in `docs/`, where a status document that reads as authoritative is wrong in six places, and a
whole shipped feature (Theory) has zero documentation anywhere.

---

## 1. What hurts a real user first

### 1.1 `app/src/features/settings/` has zero unit tests — 17 files, 3,251 lines

Every other feature directory has a `__tests__/`. Settings has none:

```
features/settings/     0 test files   17 source files   3251 lines
features/home/         1
features/pron/         1
features/listening/   11
```

This is the screen a new install must survive before anything else works —
`SimpleSetup.tsx`, `ProviderSlotCard.tsx`, `RecommendedModels.tsx`, `ModelDownloads.tsx`,
`DetectPanel.tsx`, `VoiceTab.tsx`. It also owns the closed-dropdown rule (RULE 3): nothing
currently fails if someone turns `models_by_modality` back into a free-text field. The 933-line
`features/settings/store.ts` is the single largest file in `app/src` and is untested.

`e2e/settings.spec.ts` exists, but E2E does not run in the `ci.yml` `app` job — only in the
separate `e2e.yml` workflow.

Also missing E2E entirely: **grammar** (27 files, 7,480 lines) and **pron** (RULE 2 lives
here). `e2e/` has 9 specs; there is no `grammar.spec.ts` and no `pron.spec.ts`.

### 1.2 The Theory feature is undocumented — `grep -ri theory docs/` returns nothing

Theory ships and is substantial:

| Layer | Path |
|---|---|
| Content | `content/core-en/data/theory.jsonl` (91 rows, 1.0 MB) |
| Staging | `content/core-en/staging-theory/` (8 chapters, 1.6 MB) |
| Merge tool | `tools/content/merge_theory.py` |
| Migration | `sidecar/bandready/migrations/versions/0004_theory_articles.py` |
| Route | `sidecar/bandready/server/routes/theory.py` |
| UI | `app/src/features/grammar/components/theory/TheoryScreen.tsx`, `ArticleBody.tsx` (619 lines) |

`docs/` contains **zero** occurrences of the word "theory" — not in `plan/`, not in
`GRAMMAR-VOCAB.md`, not in `IMPLEMENTATION-STATUS.md`.

This is the dangerous kind of undocumented. Theory is the **deliberate exception to THE GATE**
(reference is always readable). That exception exists only in the code and in the prompt that
briefs each agent. The next person reading `docs/plan/` will find the gate stated
unconditionally, "fix" `TheoryScreen.tsx` to respect it, and silently take reference material
away from learners. Write the exception down before touching anything else in this list.

### 1.3 `docs/IMPLEMENTATION-STATUS.md` contradicts the code in six places

The file is stamped "**Verified on 2026-07-25**" and reads as ground truth — `docs/DEVELOPMENT.md`
and the plan index both point at it. It is three weeks stale and the content bank has roughly
quintupled since. Verified against the current pack and routes:

| Line | Claim | Reality |
|---|---|---|
| 43, 51 | "Zero General Training passages" / "**0** General Training reading passages" | 29 of 36 passages are `general_training`; 12 reading tests across both formats |
| 51 | "**2** reading tests", "**1** listening test", "472 rows across 10 files" | 12 reading tests, 7 listening tests, 12 data files, ~2,335 rows |
| 51 | "**0** media files" | 10 tracked SVGs under `content/core-en/media/` (9 listening maps + 1 reading diagram) |
| 44 | "No dictation mode (sidecar exposes no endpoints)" | `routes/listening.py:51` lists `dictation` in `MODES`; `routes/listening_drills.py:70` serves dictation drills; `DictationItem.tsx` renders them |
| 52 | "No release workflow" | `.github/workflows/release.yml` exists (build + attach to a GitHub pre-release) |
| 44 | "No `map_labelling` question (needs an SVG asset; pack ships no media)" | Half stale: the 9 map SVGs now ship and `MapAsset.tsx` renders them, but `listening_tests.jsonl` still contains **0** `map_labelling` questions. Rewrite, don't delete |

Still accurate, leave alone: "No `GET /api/v1/reading/attempts` list route" (line 43 — confirmed,
`routes/reading.py` has create/patch/get-by-id/submit/review only) and "`stores/progress.ts` still
models an obsolete summary shape" (line 48 — see 2.1, it is now fully dead).

The module status table also has **no Grammar row and no Theory row** — two shipped modules,
~10,000 lines of app code and 245 content rows, absent from the table that says what exists.

### 1.4 `.gitignore` `build/` is unanchored and swallows `app/build/`

`.gitignore:23` is `build/` with no leading slash, so it matches **any** directory named `build`
at any depth. It is intended for the repo-root `build/` staging output (the comment says so), but
it also matches `app/build/`, which is electron-builder's `buildResources` directory:

- `app/electron-builder.yml:17` — `buildResources: build`
- `app/electron-builder.yml:47` — `entitlements: build/entitlements.mac.plist`

`app/build/entitlements.mac.plist` is tracked today only because it was added before the ignore
rule. Anything added there from now on is silently unstageable — including
`app/build/icon.icns`, which `IMPLEMENTATION-STATUS.md:52` lists as a known gap ("No app icon").
Whoever adds the icon will `git add` it, see nothing happen, commit, and ship an
icon-less DMG.

Fix: anchor it as `/build/`, or add `!app/build/` after it.

### 1.5 `pnpm lint` is a broken command in three places

- Root `package.json:10` — `"lint": "pnpm --filter bandready-app lint"`
- `app/package.json` — has **no** `lint` script (`dev`, `dev:electron`, `build`, `build:electron`, `preview`, `test`, `test:e2e`)
- `app/` has no ESLint config and no `eslint` in `devDependencies`

So `pnpm lint` fails at the root. `CONTRIBUTING.md:217` says "`ruff` is the only formatter/linter
opinion that counts", which is honest about the Python half — but the root script advertises a
TypeScript linter that was never installed. Either delete the root `lint` script or add ESLint.
`ci.yml` doesn't lint the app either, so nothing catches this.

---

## 2. Dead files and dead code

The import graph is clean. Every file in `app/src` is reachable: the only zero-importer files are
test files, `main.tsx` (Vite entry), `vite-env.d.ts`, and the eleven `features/*/route.tsx`, which
`App.tsx:23` picks up via `import.meta.glob` — the RULE 5 seam working exactly as intended.
Likewise, no sidecar module is unreferenced; routes look orphaned to a naive grep only because
`server/app.py` auto-discovers them.

**No file in this repo is dead.** What follows is dead *code inside* live files.

### 2.1 `app/src/stores/progress.ts` — 215 lines, every export unused

The whole module is dead. Consumers of each export, excluding `stores/` itself:

```
useProgressStore    0    bandsOf       0    streakOf        0
targetBandOf        0    todaySessionsOf 0  ProgressProfile 0
ProgressCallout     0    BandEstimate  0    StreakSummary   0
HeatmapPoint        0    BandEstimates 0
```

The only mention anywhere in the app is a comment at `app/src/features/home/store.ts:4`
explaining why it is bypassed: *"The global `useProgressStore` predates the curriculum routes and
models a…"*. `stores/index.ts:20-34` still re-exports all of it, so it looks alive at the barrel.

`stores/index.ts:1-5` calls itself "The four GLOBAL Zustand stores (01 §7.1, R2-23)". Deleting
`progress.ts` makes it three, which contradicts a doc reference — resolve the doc at the same time.

### 2.2 Exported symbols with exactly one reference (the definition itself)

Verified individually; each appears once across `app/src` and `e2e`.

| Symbol | File |
|---|---|
| `peekSidecarContract` | `app/src/lib/api.ts` |
| `isOfflineFailure` | `app/src/lib/errors.ts` |
| `bandColor`, `daysUntil`, `formatMinutes` | `app/src/lib/format.ts` |
| `wholeQuoteAnnotation` | `app/src/features/speaking/components/quotes.ts` |
| `fetchSessionRecord` | `app/src/features/speaking/components/mock/api.ts` |
| `CRITERION_SHORT` | `app/src/features/speaking/components/teaching/labels.ts` |
| `POINT_STATE_HINT` | `app/src/features/grammar/labels.ts` |
| `standingOf` | `app/src/features/writing/components/coach/store.ts` |
| `AXIS_LABEL` | `app/src/features/writing/components/coach/labels.ts` |
| `paragraphIndex` | `app/src/features/reading/model.ts` |
| `CEFR_VALUES` | `app/src/features/vocab/labels.tsx` |
| `SLOT_ORDER`, `slotLabel`, `leverLabel`, `signpostLabel`, `trapLabel` | `app/src/features/listening/components/coach/labels.ts` |
| `DELIVERY_LABEL`, `RAW_FIRST_NOTE`, `TRANSFER_MNEMONIC` | `app/src/features/listening/components/mock/script.ts` |

Two clusters are worth a second look rather than a blind delete:

- **`listening/components/coach/labels.ts`** — five of its label helpers are unused. A labels
  file whose labels nobody renders usually means a panel was cut. Check `ListeningCoach.tsx`
  renders every slot/lever/trap the sidecar sends before deleting; the dead code may be the
  evidence of a missing UI, not surplus.
- **`listening/components/mock/script.ts`** — `TRANSFER_MNEMONIC` and `RAW_FIRST_NOTE` read like
  learner-facing exam-technique copy that never made it onto the screen. Same check.

### 2.3 Exported but only used inside their own file

Not dead, just over-exported — the barrel implies an API that has no consumer. Narrow to
module-private: `getSidecarContract`, `resetSidecarContract`, `onSidecarReachability`
(`lib/api.ts`); `deepMerge`, `setPath`, `SECRET_MASK`, `fallbackRecommendations`,
`normalizeRecommended` (`features/settings/store.ts`); `syncSrsBadge` (`features/vocab/store.ts`);
`truncateToWidth`, `SERIES_INK` (`features/writing/components/chart/palette.ts`); `codeFamily`,
`ERROR_CODES`, `SURFACE_LABEL` (`features/grammar/labels.ts`); `coachError`
(`features/reading/components/coach/store.ts`); `hashUrl`, `waitForJob`, `SPEAKING_TRANSCRIPT`
(`e2e/fixtures.ts`).

### 2.4 One broken import specifier

`app/src/components/shell/TitleBar.tsx:5` — `import type { WindowControlAction } from "@/vite-env";`

`vite-env.d.ts` is an ambient declaration file. It resolves under `tsc` but is the only
non-resolving specifier in the entire graph; `vite-env.d.ts` is also the only file exporting
runtime-relevant types (`BandReadyBridge`, `SidecarInfo`, `BandReadyPlatform`) that a `.d.ts`
should not own. Move those three interfaces plus `WindowControlAction` to `app/src/lib/bridge.ts`
and leave `vite-env.d.ts` holding only the `declare global` block.

---

## 3. Duplication

### 3.1 `coach/primitives.tsx` written four times — 1,151 lines, one component set

| File | Lines |
|---|---|
| `app/src/features/reading/components/coach/primitives.tsx` | 357 |
| `app/src/features/writing/components/coach/primitives.tsx` | 313 |
| `app/src/features/listening/components/coach/primitives.tsx` | 287 |
| `app/src/features/speaking/components/teaching/primitives.tsx` | 194 |

`CALLOUT_STYLE` is **byte-identical in all four**. `Callout` is byte-identical in reading and
writing (25 lines) and cosmetically drifted in the other two. `Disclosure` is byte-identical in
reading↔listening (64 lines) and in speaking↔writing (57 lines) — two frozen copies of two
different versions, which is how this bug class always looks just before the four drift apart for
good. `SectionHead` is identical in reading↔listening. Reading↔writing measure 75% similar overall.

**Survivor:** none of them. Promote the shared set — `Callout`/`CalloutTone`, `Disclosure`,
`SectionHead`, `Chip`/`ChipTone`, `CopyChunk`, `AddToBank`/`BankItem` — into
`app/src/components/practice/` (the house rule already says reusable practice UI lives there, and
that directory currently holds only 4 files). Leave behind only what is genuinely per-skill:
`listening`'s `Marked` and `PlayMoment`, `reading`'s `LocateButton`.

Note `AddToBank` writes to the vocabulary inbox from three of the four copies, but
`sendToVocabInbox` exists only in `writing/components/coach/primitives.tsx:228` — so the same
button already has one shared implementation and two unshared ones.

### 3.2 `spans.ts` written twice — 322 lines

- `app/src/features/speaking/components/teaching/spans.ts` (172 lines)
- `app/src/features/writing/components/coach/spans.ts` (150 lines)

`HasSpan`, `Placed`, `Placement`, `placeSpans`, `layerSpans`, `toParagraphs` in both; `Placed`
and `Placement` are byte-identical. This is the character-offset annotation engine that anchors
inline feedback onto a learner's own text — the code where an off-by-one silently highlights the
wrong word. It must not exist twice.

**Survivor:** the speaking copy (172 lines) is the more complete one — it has `Segment<T>`,
`segmentText` and a generic `toParagraphs<T>`, where writing's `toParagraphs` is hardcoded to
`LayeredRun`. Move it to `app/src/lib/spans.ts`; port writing's `splitParagraphs` across.
`app/src/components/ui/AnnotatedText.tsx` is the natural consumer of the merged module.

### 3.3 `drills/api.ts` written twice — the error taxonomy, not the endpoints

- `app/src/features/reading/components/drills/api.ts` (169 lines)
- `app/src/features/listening/components/drills/api.ts` (188 lines)
- `app/src/features/speaking/components/drills/api.ts` (85 lines)

66% similar. `MockInProgressError` appears in all three; `NoContentError` is byte-identical in
reading and listening; `rethrow()`, `RunnerParams` and `body()` are near-identical in reading and
listening. `MockInProgressError` is how the client enforces RULE 1 (coach shut during a mock) —
three copies of a rule-carrying error class is three chances to get the rule wrong.

**Survivor:** move `MockInProgressError`, `NoContentError`, `NeedsAudioError` and `rethrow()` into
`app/src/lib/errors.ts` (which already owns `FailureKind`). The per-skill fetchers stay put.

### 3.4 Progress DTOs written twice

`app/src/features/home/types.ts` (193 lines) and `app/src/features/progress/types.ts` (219 lines)
both declare `SkillKey`, `SKILL_KEYS`, `SKILL_LABELS`, `CRITERION_LABELS`, `Confidence`,
`SkillEstimate`, `HeatmapCell`, `HeatmapDoc` — four of them byte-identical.

Both describe the same sidecar responses (`/progress/summary`, `/estimates`, `/heatmap`). Home
and Progress will disagree about what a band estimate looks like the first time the sidecar
changes one field. **Survivor:** `features/progress/types.ts` (the superset — it also has
`TrajectoryPoint`, the criteria docs and the readiness docs); have `home` import from it, or lift
the shared core to `app/src/lib/progress-dto.ts`.

### 3.5 Two `ClipPlayer`s in one feature

- `app/src/features/listening/components/coach/ClipPlayer.tsx` (200 lines) — exports `useClipPlayer` + `ClipPlayerBar`
- `app/src/features/listening/components/drills/ClipPlayer.tsx` (206 lines) — exports a `forwardRef` `ClipPlayer`

Same filename, same feature, same job (play a bounded clip of a rendered listening part), two
unrelated APIs. **Survivor:** the coach hook-plus-bar split is the more reusable shape; the drills
imperative-ref version exists because `DrillRunner` needs to trigger replay. One
`useClipPlayer` + one `ClipPlayerBar` with an optional ref covers both.

### 3.6 Three `MockHistory`s

- `app/src/features/progress/components/MockHistory.tsx` (132) — cross-skill, takes `mocks` as a prop
- `app/src/features/speaking/components/mock/MockHistory.tsx` (191) — self-fetching, also exports `MockHistoryPage`
- `app/src/features/writing/components/mock/MockHistory.tsx` (107) — self-fetching

Listening's equivalent is named `RecentAttempts.tsx` and reading has none. Lower priority than
the above — the three genuinely render different rows — but the shared row/empty-state/band-cell
chrome belongs in one component, and the naming should be settled (`MockHistory` everywhere, or
`RecentAttempts` everywhere).

### 3.7 Two model-answer surfaces per feature

`features/writing/components/ModelAnswerPanel.tsx` (148) vs
`features/writing/components/coach/ModelAnswers.tsx` (418); and
`features/speaking/components/teaching/ModelAnswers.tsx` (330) which is 47% similar to writing's.
Both writing components render gated model answers (RULE 1). Two gate implementations for one
rule is worth confirming they gate identically before deciding which survives — flagging for
inspection, not for automatic merge.

---

## 4. Organisation

### 4.1 Speaking's coach directory is the only one not called `coach`

```
features/reading/components/coach/      → ReadingCoach, CoachPicker, primitives, labels, store, types
features/listening/components/coach/    → ListeningCoach, CoachPicker, primitives, labels, store, types
features/writing/components/coach/      → WritingCoach,  CoachPicker, primitives, labels, store, types
features/speaking/components/teaching/  → TopicCoach,    CoachPicker, primitives, labels, store, types
```

Identical internal shape, one different directory name, and the component inside is `TopicCoach`
rather than `SpeakingCoach`. Rename `teaching/` → `coach/`. This costs nothing today and stops
every future "add it to all four coaches" task from missing one.

### 4.2 Two files sit at the speaking feature root that belong in `components/`

- `app/src/features/speaking/LiveSession.tsx` (741 lines)
- `app/src/features/speaking/FeedbackReport.tsx` (439 lines)

Speaking is the only feature with components at its root; the other ten put everything under
`components/`. These two are also the largest speaking files, and `LiveSession.tsx` at 741 lines
is doing WebRTC lifecycle, transcript feed and HUD state in one file — the natural split is
`components/live/`.

### 4.3 `features/writing/` has `__tests__` at two depths

`features/writing/__tests__/` (autosave-race, chart-v2) **and**
`features/writing/components/__tests__/` (chart, route, screens). `chart-v2.test.tsx` and
`chart.test.tsx` test the same `components/chart/` directory from different levels. Every other
feature keeps one `__tests__/` per directory-being-tested. Consolidate under
`features/writing/components/__tests__/` and rename `chart-v2` to something that says what it
covers rather than which attempt it was.

### 4.4 `features/grammar/` is two features in one directory

27 files, 7,480 lines, four independent screens behind one route:

- **Grammar practice** — `BoardScreen`, `PointScreen`, `SessionScreen`, `PathScreen`, `ProgressScreen`, `PhrasesScreen`, `components/items/` (14 item renderers), `store.ts`, `grading`
- **Theory** — `components/theory/TheoryScreen.tsx`, `components/theory/ArticleBody.tsx` (619 lines)

Theory has its own content file (`theory.jsonl`), its own sidecar route (`routes/theory.py`), its
own migration, its own staging tree, and — per RULE 1 — the **opposite gating policy** from
everything else in the directory. It is a reference library that happens to be reachable from the
grammar route. Splitting it into `app/src/features/theory/` would give it its own
`route.tsx` (the RULE 5 seam makes this free), its own sidebar entry, and a place to state the
gate exception next to the code that implements it. Do this after 1.2, not instead of it.

### 4.5 `content/` staging is tracked for two modules and ignored for four

| Module | Staging output | Tracked? | Size |
|---|---|---|---|
| speaking | `staging/sets/` | ignored | 5.7 MB |
| writing | `staging-writing/prompts/` | ignored | 2.8 MB |
| reading | `staging-reading/tests/` | ignored | 2.0 MB |
| listening | `staging-listening/tests/` | ignored | 1.7 MB |
| **grammar** | `staging-grammar/content/` | **tracked** | **6.7 MB** |
| **theory** | `staging-theory/content/` | **tracked** | **1.6 MB** |

`.gitignore` states the policy four times in its own comments — staging is merged into
`content/core-en/data/` by `tools/content/merge_*.py`, so only `research/`, `DESIGN.md` and
`TEMPLATE.json` are the authoring contract and get tracked. Grammar and theory were never added
to that list, so 8.3 MB of intermediate JSON is committed **and** its merged output is committed
again (`data/grammar.jsonl` 3.0 MB, `data/vocab.jsonl` 2.2 MB, `data/theory.jsonl` 1.0 MB).
`staging-grammar/content/vocabulary-expansion.json` alone is 2.4 MB — the third-largest tracked
file in the repository.

Either add the two directories to `.gitignore` to match the other four, or delete the four
existing ignore rules because the policy is actually "staging is tracked". It cannot be both.

**This is spreading, not static.** A seventh staging tree appeared during this audit:
`content/core-en/staging-oxford/worklists/` (12 JSON files, 208 KB), written while I was
reading. It is untracked and matches no `.gitignore` rule, so it defaults to *tracked* — the
grammar/theory side of the split. Every new content module inherits whichever behaviour nobody
decided. Settle the policy once and state it in `content/README.md`, or each new bank makes the
same coin-flip.

### 4.6 Default exports are inconsistent

32 files outside `route.tsx` carry `export default` alongside a named export. They cluster
entirely in `mock/` and `coach/` subtrees (every `MockSitting`, `MockReport`, `MockPreflight`,
`CoachPicker`, and the four `*Coach` components) plus `features/*/page.tsx` in five of eleven
features. Grammar, vocab, settings and pron use named exports only. Nothing imports the default
form. Cosmetic; fix opportunistically.

---

## 5. `tools/content/_author_final_seven.py` — recommendation: **delete**

794 lines. Nothing imports it, nothing runs it, no test covers it, and it appears in no workflow,
no `package.json` script and no documentation. The only references anywhere are inside itself:
`OUT = Path("content/core-en/staging-grammar/content/final-seven.json")` at line 21 and its own
`"block": "final-seven"` at line 779.

Its output is committed at `content/core-en/staging-grammar/content/final-seven.json`, and that
file — not the script — is what `tools/content/merge_grammar.py` folds into
`data/grammar.jsonl`. So the generator is not in any pipeline; it is a snapshot of how one JSON
file was produced once.

Three reasons it should go rather than stay as provenance:

1. **It is a loaded gun.** Running it overwrites `final-seven.json` unconditionally. Any hand-edit
   made to those seven grammar points since — a typo fix, a rewritten `feed_forward` — is silently
   destroyed by anyone who runs the file to see what it does.
2. **The provenance it carries is already recorded better elsewhere.** Its docstring explains why
   the seven points were hand-authored (six agent runs hit a session limit at 147 of 154). That
   reasoning is three paragraphs, and it belongs in `content/core-en/staging-grammar/DESIGN.md`
   next to the design it completes, where a content author will actually find it. Git history
   holds the rest.
3. **It is the only file in `tools/content/` with no test and no caller.** Its ten siblings are
   all live pipeline steps (`merge_*.py`, `build.py`, `validate.py`, `verify_listening.py`) or
   tested one-shots (`reseq_grammar.py` has `sidecar/tests/test_reseq_grammar.py`). The
   leading underscore already marks it as not-part-of-the-package; finish the thought.

**Before deleting:** copy the docstring (lines 1-13) into
`content/core-en/staging-grammar/DESIGN.md` as a note on the `final-seven` block. That preserves
every fact the file carries that git history does not.

---

## 6. What is committed, and what `.gitignore` gets wrong

**The tracked tree is clean.** 777 entries, no `.DS_Store`, no `.env`, no `__pycache__`, no
`node_modules`, no build output, nothing tracked-but-missing-from-disk. The 4.3 GB on disk is
entirely ignored and correctly so:

```
1.0G  .dev-data/        828M  sidecar/.venv/     785M  node_modules/
595M  dist-electron/    169M  build/              11M  app/dist/
```

Problems, in order:

1. **`build/` is unanchored** — see 1.4. Anchor to `/build/` or add `!app/build/`.
2. **Duplicate rule.** `content/core-en/staging-writing/prompts/` appears **twice**
   (`.gitignore` lines 30 and 34). The second copy has the explanatory comment above it; line 30
   is a bare orphan. Delete line 30.
3. **Missing rules for grammar and theory staging** — see 4.5, if the policy is meant to be
   uniform.
4. **Stale rules with nothing behind them:** `.turbo/` (no Turborepo in this repo — pnpm
   workspaces only), `coverage/` (no coverage reporter configured in `vitest.config.ts`),
   `release/` (electron-builder outputs to `../dist-electron` per `app/electron-builder.yml:17`,
   never `release/`). Harmless, but they describe a toolchain that isn't here.
5. **A live secret sits in the working tree.** `/.env` holds a real `OPENROUTER_API_KEY`. It is
   correctly gitignored and was **not** committed — but it is one `git add -f` or one
   zip-the-folder away from a leak, and it is the credential behind the writing/speaking
   verification runs. No repo change needed; worth knowing it is there.
6. `.ruff_cache/` exists at the repo root (12 KB) as well as in `sidecar/`, even though ruff only
   ever runs against `sidecar/`. Ignored, so cosmetic.

---

## 7. The `docs/` tree

33 tracked markdown files, ~15,400 lines. Three tiers with three different levels of trust, and
nothing tells the reader which tier they are in.

### Current and trustworthy

- `CONTRIBUTING.md` (repo root) — the two auto-discovery seams, house style, real commands. Matches the code. The one document to keep pointing people at.
- `docs/DEVELOPMENT.md` — where the app writes, how to get out of a bad state. Accurate.
- `docs/LISTENING-CONTENT.md`, `READING-CONTENT.md`, `SPEAKING-CONTENT.md`, `GRAMMAR-VOCAB.md` — measured against the merged pack (listening states 2026-07-28) and explicitly say so where a number falls short. These are the model the rest of `docs/` should follow.
- `docs/research/pronunciation/00-03` — background for RULE 2. Research, not status; ages gracefully.
- `docs/screenshots/README.md` — describes six images that do not exist yet, and **says so in its first sentence**. Correctly self-describing; leave it.

### Stale

- **`docs/IMPLEMENTATION-STATUS.md`** — six contradictions plus two missing modules; see 1.3. Highest-value fix in the tree, because its filename promises exactly the thing it gets wrong.
- **`docs/plan/README.md:3`** — "Status: planning complete (2026-07-25) — **pre-implementation**." The app is built, packaged into a DMG, and has ~1,830 passing tests. Every reader arriving at the plan index is told the code does not exist yet.
- `docs/plan/00-vision.md` … `18-api-contract.md` — 22 files, ~11,000 lines, all headed `Status: draft (2026-07-25)` per the stated convention, all ending in an "Open questions" section. These are **design intent**, and much of it shipped differently. They should not be deleted (RULE 2's `09 §0` and the R2-* rulings in `_context/decisions.md` are still load-bearing and cited from code comments), but every one needs a one-line banner: *"Design intent as of 2026-07-25. For what actually shipped, see …"*.

### Contradicts the code

- `docs/plan/13-packaging-distribution.md` describes signing and notarization as part of the flow; `.github/workflows/release.yml:5-13` explicitly disables notarization and marks every build a pre-release. The workflow is right and documents itself well; the plan doc is the one that is out of date.
- `docs/plan/README.md` cross-reference table omits `17-review-findings.md` from the reading order (mentioned only in the status line).
- `docs/plan/18-api-contract.md` is the "single authoritative" route inventory but is dated 2026-07-25, before grammar, theory, and the coach/drills/mock route families landed. `sidecar/bandready/server/routes/` now holds 33 route modules. `IMPLEMENTATION-STATUS.md:48` already records two contract drifts found by hand (`PUT /api/v1/settings` does not exist; `GET`/`PUT /api/v1/profile` from 18 §4.13 do not exist). Nobody should trust this file for a route name today.

### Missing

- **Anything at all about Theory** — see 1.2.
- **`docs/WRITING-CONTENT.md`** — listening, reading, speaking and grammar each have a content
  bank document; writing does not, despite having `content/core-en/staging-writing/`
  (DESIGN.md + 4 research files), 102 prompt rows, chart specs and a coach. The asymmetry is
  invisible until an author needs to add a writing prompt and finds no instructions.

---

## Suggested order for whoever acts on this

1. Write down the Theory gate exception (1.2) — nothing else here can break a learner's access to reference material.
2. Fix `.gitignore` `build/` (1.4) — one character, prevents a shipped bug.
3. Correct or date-stamp `docs/IMPLEMENTATION-STATUS.md` and `docs/plan/README.md:3` (1.3, §7).
4. Delete `stores/progress.ts` and its barrel re-exports (2.1) — the only fully dead module.
5. Delete `tools/content/_author_final_seven.py` after copying its docstring into `staging-grammar/DESIGN.md` (§5).
6. Unify `spans.ts` (3.2) and the `MockInProgressError` family (3.3) — both carry rules, so both are correctness risks, not tidiness.
7. Unify `coach/primitives.tsx` (3.1) into `components/practice/`.
8. Add tests for `features/settings/` (1.1); fix or remove `pnpm lint` (1.5).
9. Settle the staging-tracking policy (4.5) and rename `teaching/` → `coach/` (4.1).
