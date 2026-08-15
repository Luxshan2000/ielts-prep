# Suite verification — V2

Run 2026-08-16 against the working tree, with the app live at `localhost:5273` and the
sidecar at `127.0.0.1:8710` (`/health` → `{"status":"ok","db":"ok","migrations":"0004"}`).
Every number below came from a command actually executed in this session. Where a suite was
not run to completion, it says so.

---

## Summary

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **1 error, fixed** → now clean |
| `npx vitest run` | **581 passed / 54 files**, 0 failed |
| `npx vitest run src/__tests__/noHorizontalOverflow.test.ts` | **3 passed** |
| `uv run --project sidecar pytest sidecar/tests/ -q` | **did not finish** — stalled at 47 %, 0 failures up to that point |
| …same, `--ignore=sidecar/tests/test_listening_mock.py` | **1288 passed, 2 skipped** in 3:47 |
| `pytest sidecar/tests/test_listening_mock.py` (28 tests) | **not verified** — 14 of 28 in 15 min, repeated multi-minute stalls, §3 |
| `npx vite build` | **built in 4.07s**, 2 warnings, both benign |

---

## 1. `tsc --noEmit` — one error, fixed

```
src/features/settings/components/setupCopy.ts(69,3):
error TS6133: 'modality' is declared but its value is never read.
```

**The code was wrong, not a test.** `describeVerify(modality, verify, ctx)` takes a
`Modality` and never reads it — every branch of the function returns copy that is identical
for all three slots ("Not running", "Needs one download", "Key refused"…). `tsconfig.json`
sets `noUnusedParameters: true`, so this fails the typecheck.

Fix applied — the parameter is kept in the signature (callers will pass it, and the copy may
well want to differ per slot later) but marked deliberately unused:

```ts
export function describeVerify(
  _modality: Modality,
```

`npx tsc --noEmit` now exits 0.

### Why this error existed at all: `setupCopy.ts` is not wired up

While confirming the fix was safe I checked for callers. There are none — **nothing in
`app/src` imports `setupCopy.ts`.** All fourteen of its exports (`describeVerify`,
`plainDownloadError`, `downloadProgress`, `engineLabel`, `platformLabel`, …) are dead in
this build. It is the newest file in the tree (mtime 2026-08-15 20:26), and
`docs/ux-audit/repo.md` — a read-only pass dated the same day — asserts "there are no orphan
source files in `app/src`". That statement is now stale by one file.

This matters because of what the module was evidently written to fix. Its own docstring says
`verify.detail` "is deliberately never forwarded: it names base URLs, model ids and file
paths, and the learner cannot act on any of them" — and the screen that renders provider
status still forwards exactly that:

- `app/src/features/settings/components/ProviderSlotCard.tsx:167` renders `verify.state` raw
- `app/src/features/settings/components/ProviderSlotCard.tsx:282` renders `verify.detail` raw

Confirmed in the running app, Settings → Providers → **Advanced settings**:

> `unreachable`
> Base URL* Model* `qwen3:14b`
> `could not connect to http://127.0.0.1:11434/v1 — is the server running?`

That is a provider slug as a status badge and a localhost URL in learner-facing copy, which
the standard rules out. The simple Settings view is clean — it says "The examiner / asks you
questions and marks your answers" with a plain **Check** button, and the onboarding path
says "The model you chose isn't answering — it may not be started yet." Only the advanced
panel leaks.

**Left for a human, deliberately.** Wiring `describeVerify` into `ProviderSlotCard` is a
rewrite of an 11.5 KB component, `features/settings/` has zero unit tests to catch a
regression, and there is a real design question underneath — how much a panel explicitly
labelled "Advanced settings" is allowed to say. That is a decision, not a typo. It is not
in the "small and obvious" category and I did not make it.

---

## 2. App suites — green

### `npx vitest run`

```
Test Files  54 passed (54)
     Tests  581 passed (581)
  Duration  8.97s
```

Zero failures, and re-run after the §1 fix was applied with the same result. Note the count
has grown since the brief: the standing figure was 533 tests, the tree now has 581.

Three non-fatal React warnings, all in the writing feature, all "an update … was not wrapped
in `act(...)`":

- `src/features/writing/page.tsx` (`WritingHome`) — 1
- `src/features/writing/components/AttemptWorkspace.tsx` — 2

These are async state settling after the assertion, not broken behaviour; the tests they
appear in pass. Worth cleaning up so a genuine act-related failure is not lost in the noise,
but nothing is wrong today. Not fixed — touching those tests to silence a warning is churn
without a failure to justify it.

### `npx vitest run src/__tests__/noHorizontalOverflow.test.ts`

```
Test Files  1 passed (1)
     Tests  3 passed (3)
```

---

## 3. Backend suite — did not complete, and the reason is not a failing test

**No backend test failed. One test file could not be run to completion.**

The straight run of `uv run --project sidecar pytest sidecar/tests/ -q` reached 47 % and then
stopped moving:

```
........................................................................ [ 43%]
....ss.........................
```

613 tests in, zero `F`, zero `E`, two skips — and then nothing for fifteen minutes. I killed
it at that point. It was inside `sidecar/tests/test_listening_mock.py`, at
`test_the_sitting_serves_no_key_no_transcript_and_no_teaching` (line 411).

### Splitting the suite isolates it to one file

| Subset | Result |
| --- | --- |
| `pytest sidecar/tests/ -q --ignore=sidecar/tests/test_listening_mock.py` (40 files) | **1288 passed, 2 skipped in 227.64s (3:47)** |
| `pytest sidecar/tests/test_listening_mock.py -q` (28 tests) | 14 of 28 in 15 min, repeated multi-minute stalls, 0 failures — abandoned |

**1288 of the ~1300 backend tests pass, and they do it in under four minutes.** The whole of
the reported slowness and the whole of the stall live in one 28-test file. Running that file
on its own, with nothing else in the process, reproduces it: nine tests in eight minutes
(≈ 55 s each, at ~1 % CPU), then a stall of about seven minutes at
`test_the_coach_is_shut_for_a_part_that_was_legitimately_unlocked` (line 341) — which it did
come out of — then two more multi-minute stalls after that. It reached 14 of 28 in fifteen
minutes and I abandoned it there. So the block is sometimes finite and sometimes very long:
stalls of 5–15 minutes recur, and the full-suite run I killed had sat on a single test for
fifteen. At this pace the file needs roughly half an hour on a good day, against 3:47 for the
other 1288 tests combined.
Either way, **the 28 tests in this file were not verified in this session and I am not
claiming they pass** — only that none of them had failed at the point each run was stopped.

### What is actually happening

Not "audio round-trips are slow" — the process is not doing any work. Measured on the stalled
run: **0.04 s of CPU consumed over 30 s of wall clock**, and the test's own
`bandready.db-wal` untouched for eleven minutes.

`sample(1)` on the stalled process, during a run of just that file — its own pytest tmpdir,
its own SQLite file, and (checked with `lsof`) not holding the shared `~/.wn_data/wn.db`, so
every lock in the picture below belongs to this process alone:

```
Thread_497411  com.apple.main-thread
  lock_PyThread_acquire_lock → acquire_timed → _pthread_cond_wait   ← blocked
Thread_502500
  select_kqueue_control_impl                                        ← asyncio loop, idle
Thread_502503
  _pysqlite_query_execute → sqlite3_step
    → sqliteDefaultBusyCallback → __semwait_signal                  ← waiting on a DB lock
```

That is a lock cycle inside one process: the `TestClient` blocking portal on the main thread
is waiting for the request handler to return, and the handler's worker thread is parked in
SQLite's busy handler waiting for a write lock that another connection in the same process
holds. `db/engine.py:115` sets `PRAGMA busy_timeout=5000`, so this should surrender after
five seconds with "database is locked". It does not — it sat there for minutes.

It is a **race, not a fixed hang**. Stalls across two independent runs landed on at least
three different tests in the file (`test_the_sitting_serves_no_key…`,
`test_a_fully_rendered_paper_op…`, `test_the_coach_is_shut_for_a_part…`), and the tests
either side of each of them pass. Even when it does get through, every test in this file
burns 55–120 s of wall clock at roughly 1 % CPU — the same contention, resolving eventually.

### Ruled out

- **Not the working tree.** Only three sidecar files are modified
  (`providers/presets.py`, `test_preset_models.py`, `test_settings_api.py`) and none touch
  audio, the DB or the listening mock. `tts_render.py` and `test_listening_mock.py` were last
  committed 2026-07-29.
- **Not my change.** The only edit I made is a TypeScript parameter rename (§1).
- **Not cross-process contention on the shared WordNet DB.** `dictionary.py:111-114` does
  fall back to a process-global `~/.wn_data/wn.db` when the per-test data dir has no
  `wordnet/` — a real escape from pytest's tmpdir isolation, and `lsof` confirms separate
  pytest processes opening the same file. But the stalled isolated run did **not** hold
  `wn.db` open, so it is not the cause here. Worth fixing on its own account; not this bug.
- **Not a connection that missed the pragma.** There is exactly one `create_engine` in the
  sidecar and no raw `sqlite3.connect`, so every connection gets `busy_timeout`.

**One disclosure about the environment.** Partway through, a second pytest process appeared on
this machine that I did not start (`pytest sidecar/tests/ -q --no-header -x -k "not audio"`,
PID 37700) and it holds the shared `~/.wn_data/wn.db`. It could in principle perturb timings.
It does not affect the finding: it started at 00:34, and the original full-suite run had
already been stalled since 00:30 with nothing else running.

### Left for a human — deliberately

This is a concurrency bug in how the listening-mock render path and the request handler share
one SQLite connection pool. Fixing it means changing transaction scope or pooling in
`db/engine.py` (`create_engine` runs with SQLAlchemy's default pool and
`check_same_thread: False`) or in the render queue — a change that touches every route in the
sidecar. There is no version of that which is "small and obvious", and guessing at it would
be worse than reporting it.

**Test or code? The code.** `test_listening_mock.py` asserts things the product genuinely
promises — audio rendered before the sitting opens, each part played once and refused the
second time, the coach shut for the duration, no key or transcript in the part documents.
Every one of those is a rule from the brief and none of them should be relaxed. The test only
exercises the render-then-request path harder than any other file does, and that path has a
lock ordering problem. Do not weaken or skip these tests to get a green suite.

Two things a human can use immediately:

- Reproducer: `uv run --project sidecar pytest sidecar/tests/test_listening_mock.py -q`
- Interim: `pytest-timeout` is **not installed** in the sidecar venv. Adding it and setting a
  per-test timeout would convert this silent stall into a named failure with a traceback,
  which is what CI needs before anything else.

---

## 4. Renderer build — passes

```
dist/index.html                    1.48 kB │ gzip:   0.79 kB
dist/assets/index-BSSCYYRf.css    59.01 kB │ gzip:  11.32 kB
dist/assets/index-CRwPO4wM.js  2,589.20 kB │ gzip: 713.88 kB
✓ built in 4.07s
```

Two warnings, and neither is a defect:

**"dynamically imported … but also statically imported"** (`features/vocab/route.tsx`,
`features/writing/route.tsx`). This is the auto-discovery seam working as designed.
`App.tsx` uses an **eager** `import.meta.glob("./features/*/route.tsx")` to build the router,
while `features/home/blocks.ts` uses a **lazy** glob over the same pattern purely to read the
module *keys* — so the dashboard can show "not available in this build yet" instead of a
Start button that 404s. Rollup sees both globs and warns it cannot split the chunk. Correct
observation, wrong conclusion: the lazy glob is never called, only enumerated. Fixing the
warning would mean editing `App.tsx`, which rule 5 forbids.

**"chunks are larger than 500 kB"** — 2.59 MB, 714 kB gzipped, in one chunk, for the same
reason. In a browser that would be a real cost on a modest laptop. This is Electron loading
from local disk with no network in the path, so it is not one. Left alone.

---

## 5. Invariants spot-checked

Not asked for, but cheap, and a suite pass means nothing if the rules underneath moved:

- **Accent rule** — `sidecar/bandready/pron/analyze.py:55` still reads
  `SCORE_IS_PRONUNCIATION = False`, and all three consumers in
  `server/routes/pron.py` (lines 189, 204, 266) still null out `score`, `worst_words` and
  `overall` behind it. `accent_notice` is rendered by `ReadAloud.tsx:147`,
  `MinimalPairDrill.tsx:278` and `DrillRunner.tsx:232`. Covered by
  `sidecar/tests/test_pron_honesty.py`.
- **Live app** — sidecar `/health` ok, renderer serves 200, 0 console errors on Settings.

---

## 6. What I did not do

- Did not delete, skip or weaken any test.
- Did not touch `server/app.py`, `App.tsx` or `Sidebar.tsx`.
- **Did not verify the 28 tests in `sidecar/tests/test_listening_mock.py`** (§3). They are the
  only part of either suite I cannot vouch for.
- Did not wire up `setupCopy.ts` (§1) — flagged for a human instead.
- Did not silence the three `act(...)` warnings (§2).
- Did not attempt a fix for the SQLite lock contention (§3).

One file changed in this session:
`app/src/features/settings/components/setupCopy.ts` — one parameter renamed.
