# 14 — Testing strategy

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and the suites themselves. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.

_Status: draft v2 (2026-07-25)_

BandReady's correctness splits into two very different problems: **deterministic logic** (answer matching, band tables, FSRS scheduling, state machines, lockfile I/O) which gets a classic pytest/vitest pyramid with exhaustive table-driven tests, and **LLM-judged scoring quality** (writing/speaking band prediction) which cannot be unit-tested and instead gets a **golden-set evaluation framework**: ~50 expert-annotated samples across bands 4–8.5, run through the real evaluation prompts, with hard accuracy gates (|predicted − expected| ≤ 0.5 for ≥ 80% of samples, ≤ 1.0 for 100%) and drift tracking per `prompt_version` and per model (the `llm_evaluations.prompt_version` column in 11-data-model.md exists for exactly this). Between those poles sit FastAPI TestClient API tests on a temp data dir, a headless WebRTC speaking-session E2E harness (`_context/voice-pipeline-gotchas.md` §5), blind re-answer validation tests for generated content (06-reading-module.md, 07-listening-module.md), Playwright driving the real Electron app against a mock-LLM sidecar, and packaging smoke tests in CI. This doc specs each layer, the eval runner CLI, the model-swap calibration workflow, what is deliberately NOT automated, and the CI matrix.

## 1. The pyramid at a glance

```
                       ┌────────────────────────────┐
   manual review       │ Examiner review checklist  │   per release, humans
                       ├────────────────────────────┤
   packaging smoke     │ installer → boot → /health │   CI, per release + nightly
                       ├────────────────────────────┤
   E2E                 │ Playwright × Electron      │   CI (linux headed-xvfb + mac), ~15 flows
                       │ Voice E2E (aiortc harness) │   nightly + pre-release (real audio)
                       ├────────────────────────────┤
   scoring evals       │ Golden-set band accuracy   │   on prompt/model change + nightly
                       │ Consistency (3× stddev)    │
                       ├────────────────────────────┤
   integration         │ FastAPI TestClient (API)   │   every PR, ~200 tests
                       │ Generated-content blind QA │   every PR (mock LLM) + nightly (real)
                       ├────────────────────────────┤
   unit                │ pytest (scoring, FSRS,     │   every PR, fast (<60 s), the bulk
                       │  matcher, lockfile, plans) │
                       │ vitest (components, utils) │
                       └────────────────────────────┘
```

Test code layout (extends the repo tree in 01-architecture.md §7):

```
bandready/
├── sidecar/
│   └── tests/
│       ├── conftest.py               # tmp data dir, app fixture, mock-LLM adapter
│       ├── unit/
│       │   ├── test_answer_matcher.py        # §2.1 — the big table
│       │   ├── test_band_tables.py
│       │   ├── test_eval_response_parser.py  # §2.2
│       │   ├── test_fsrs.py                  # §2.3
│       │   ├── test_plan_generator.py        # §2.4
│       │   ├── test_lockfile.py              # §2.5
│       │   └── test_speaking_state_machine.py
│       ├── api/                              # §3 — TestClient
│       │   ├── test_sessions_api.py
│       │   ├── test_content_api.py
│       │   ├── test_srs_api.py
│       │   └── test_settings_api.py
│       ├── contentqa/                        # §6 — blind re-answer validation
│       │   ├── test_reading_blind_validation.py
│       │   └── test_listening_blind_validation.py
│       └── voice_e2e/                        # §4 — real WebRTC, marked slow
│           ├── harness.py  client.py  speech.py   # see _context/voice-pipeline-gotchas §5
│           ├── scripts/                      # scripted candidate answers (§4.2)
│           └── test_speaking_session_e2e.py
├── evals/                                    # §5 — golden-set framework (NOT pytest)
│   ├── golden/
│   │   ├── writing/    w-001.json … w-030.json
│   │   ├── speaking/   s-001.json … s-020.json
│   │   └── MANIFEST.json
│   ├── runner.py                             # bandready-eval entry point
│   ├── report.py
│   └── runs/                                 # gitignored JSONL results + reports
└── app/
    ├── src/**/*.test.tsx                     # vitest colocated
    └── e2e/                                  # Playwright specs (§7.2)
        ├── fixtures/electron.ts
        └── *.spec.ts
```

Pytest markers (registered in `pyproject.toml`): `slow` (voice E2E), `real_llm` (needs a configured provider; skipped unless `BANDREADY_TEST_LLM_BASE_URL` is set), `eval` (golden-set — normally run via the CLI, not pytest).

## 2. Python unit tests (pytest)

Runner: `uv run pytest sidecar/tests/unit -q`. No network, no DB file (in-memory SQLite where a session is needed), target < 60 s total.

### 2.1 Acceptable-answer matcher — exhaustive table-driven tests

The matcher (`sidecar/bandready/scoring/answers.py::normalize/is_correct` — the ONE shared implementation imported by reading AND listening per R2-9; spec: 06-reading-module.md §4.1 with 07-listening-module.md §5's variant-aware article rule) is the single most consequential piece of deterministic code in the app: a wrong equivalence silently mis-marks every learner. It gets a table of **≥ 150 cases**, one row per documented rule and per known trap, structured so adding a case is one line:

```python
# test_answer_matcher.py
import pytest
from bandready.scoring.answers import is_correct, normalize
from bandready.content.schema import Question, Answer

def q(*variants, word_limit=None):
    return Question(answers=[Answer(value=v) for v in variants]), word_limit

CASES = [
    # id                          learner input        keyed variants            limit  expect
    ("case-insensitive",          "CERAMIC Jars",      ["ceramic jars"],         None,  True),
    ("whitespace-collapse",       "  ceramic   jars ", ["ceramic jars"],         None,  True),
    ("curly-apostrophe",          "world’s fair",      ["world's fair"],         None,  True),
    ("punct-stripped",            "ceramic jars.",     ["ceramic jars"],         None,  True),
    # -- articles (leading only; stripped ONLY if every keyed variant lacks a leading
    #    article — 07 §5's variant-aware rule per R2-9; limit checked on RAW answer first) --
    ("leading-the-ok",            "the ceramic jars",  ["ceramic jars"],         "3",   True),
    ("leading-an-ok",             "an estuary",        ["estuary"],              None,  True),
    ("article-breaks-limit",      "the coal mine",     ["coal mine"],            "2",   False),
    ("mid-article-not-stripped",  "jars the ceramic",  ["ceramic jars"],         None,  False),
    ("variant-article-exact",     "the mine",          ["the mine"],             None,  True),
    ("variant-has-article-no-strip", "mine",           ["the mine"],             None,  False),  # variant keeps its article → no stripping either side
    # -- hyphens: hyphen ≡ space; closed form only if authored --
    ("hyphen-to-space",           "well being",        ["well-being"],           None,  True),
    ("space-to-hyphen",           "well-being",        ["well being"],           None,  True),
    ("closed-not-equiv",          "wellbeing",         ["well-being"],           None,  False),
    ("closed-authored-ok",        "wellbeing",         ["well-being","wellbeing"],None, True),
    ("hyphen-counts-one-word",    "well-known author", ["well-known author"],    "2",   True),
    # -- word limits: over-limit is WRONG even if content matches --
    ("limit-exact",               "solar panel",       ["solar panel"],          "2",   True),
    ("limit-over",                "a large solar panel",["solar panel"],         "2",   False),
    ("limit-number-free",         "72 solar panels",   ["72 solar panels"],      "2N",  True),  # "TWO WORDS AND/OR A NUMBER"
    ("number-is-not-a-word",      "1,500 metres",      ["1500 metres"],          "1N",  True),
    # -- numbers --
    ("digits-eq-words",           "seventy-two",       ["72"],                   None,  True),
    ("thousands-sep",             "1,500",             ["1500"],                 None,  True),
    ("percent-symbol",            "20%",               ["20 percent"],           None,  True),
    ("dollars",                   "$40",               ["40 dollars"],           None,  True),
    # -- spelling is exact: no fuzz, ever --
    ("misspelling-wrong",         "enviroment",        ["environment"],          None,  False),
    ("us-uk-only-if-authored",    "color",             ["colour"],               None,  False),
    ("us-uk-authored",            "color",             ["colour","color"],       None,  True),
    # -- letter / TFNG answers --
    ("letter-case",               "b",                 ["B"],                    None,  True),
    ("ng-abbrev",                 "NG",                ["NOT GIVEN"],            None,  True),
    ("ng-dotted",                 "N.G.",              ["NOT GIVEN"],            None,  True),
    ("false-not-ng",              "FALSE",             ["NOT GIVEN"],            None,  False),
    # -- authored slash/optional forms are expanded at IMPORT, not match, time --
    ("paren-optional",            "turtles",           ["(sea) turtles"],        None,  True),   # via importer expansion
    ("slash-form",                "sea turtles",       ["(sea) turtles"],        None,  True),
    # ... ≥ 150 rows total; every bullet in 06-reading-module.md §4.1 has ≥ 3 rows
]

@pytest.mark.parametrize("case_id,learner,variants,limit,expect",
                         CASES, ids=[c[0] for c in CASES])
def test_matcher(case_id, learner, variants, limit, expect):
    question, wl = q(*variants, word_limit=limit)
    assert is_correct(learner, question, wl) is expect
```

Companion suites in the same file: `test_normalize_idempotent` (property: `normalize(normalize(x)) == normalize(x)` over the whole table via hypothesis, default profile 200 examples), `test_multiselect_as_sets` (types with multi-letter answers compare order-insensitively), and `test_importer_variant_expansion` (parenthesized-optional and slash forms produce the exact expected variant set). **Rule: every marker bug found in the wild adds a row before the fix lands.**

### 2.2 Scoring parsers and band tables

- `test_eval_response_parser.py`: the tolerant JSON extractor from 05-writing-module.md §6 (first `{` … last `}`, one retry) against: clean JSON, markdown-fenced JSON, leading prose + JSON, truncated JSON (→ parse failure), out-of-range bands (→ clamped/rejected per spec), missing criterion key (→ `status='failed'`), `overall_band` recomputed server-side and model's own value ignored — via the ONE shared `round_ielts()` used by speaking, writing, and overall estimates (R2-4: official rule, ties x.25/x.75 round UP — explicit cases for 6.25→6.5, 6.75→7.0; 05's former conservative rounding is repealed).
- `test_band_tables.py`: raw→band tables (06/07) are data; tests assert monotonicity, full 0–40 coverage, and spot-check published anchor points for both Academic and GT variants.

### 2.3 FSRS scheduling

Against `bandready/srs/fsrs.py` (08-vocabulary-srs.md): (a) golden-vector test — 30 (state, rating, elapsed_days) sequences with expected (stability, difficulty, next_interval) captured from the reference py-fsrs implementation at the pinned version, asserted to 1e-6; (b) invariants via hypothesis — intervals strictly positive, `Again` never lengthens the interval, difficulty stays within bounds; (c) clock-skew: reviews with `elapsed < 0` (machine clock moved back) are clamped to 0, not crashing.

### 2.4 Plan generator

The curriculum plan generator (10-curriculum-progress.md) is pure: `generate_plan(placement_result, target_band, exam_date, today) -> Plan`. Tests: deterministic given a seed; total scheduled minutes/week within configured bounds; weakest-skill gets the largest share; exam < 14 days away switches to mock-heavy taper; degenerate inputs (target below placement, exam date in the past) produce the documented fallback plans, never exceptions.

### 2.5 Settings lockfile atomicity and corruption recovery

The settings write path (`_context/voice-pipeline-gotchas.md` §2.2) is directly testable. Against `bandready/settings/lockfile.py` (03-providers-and-settings.md):

- **Atomicity**: monkeypatch `os.replace` to raise after the temp file is written → original file unchanged, no partial writes visible; temp file cleaned up.
- **Crash-window fuzz**: write, kill mid-sequence at each of {post-mkstemp, post-fsync, pre-replace} via injected exceptions → subsequent load always sees either old or new content, never garbage.
- **Corruption quarantine**: hand-write invalid JSON / valid JSON failing schema → load quarantines to `settings.json.corrupt-<ts>`, returns shipped defaults, logs a warning, does NOT crash the sidecar.
- **Merge semantics**: `{**defaults, **user}` — user overrides win, unknown user keys preserved, missing keys fall back.
- **Env interpolation**: `${OPENAI_API_KEY}` resolved at read; unset var → documented placeholder error surfaced in `verify()`, not at load.
- **Permissions**: written file is 0600 (skip assert on Windows CI).

### 2.6 Speaking state machine (unit level)

`bandready/speaking/session.py` (04-speaking-module.md §3) is tested without any audio by driving it with synthetic events (`client_connected`, `turn_completed`, `timer_expired(name)`, `client_disconnected`): every edge in the §3.1 diagram has a test; illegal transitions raise; timer expiry semantics (P2 prep hard 60 s → auto P2_LONG_TURN; long-turn hard 120 s → P2_ROUNDING; silence-repeat max 2) each covered; hang-up in every live state → ABORTED with partial-transcript flag; RECONNECTING grace resumes the exact prior state.

## 3. API tests (FastAPI TestClient)

`sidecar/tests/api/`, run on every PR. All routes follow 18-api-contract.md's inventory (`/api/v1` prefix throughout, per R2-1). The core fixture gives each test a fully isolated app:

```python
# conftest.py
import pytest, os
from fastapi.testclient import TestClient

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))     # engine is lazily built
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", "test-token")    # (so create_app must be
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")            #  imported AFTER env is set)
    from bandready.server.app import create_app                 # hidden mock presets register
    app = create_app()                                          # runs migrations + seeds
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as c:
        yield c

@pytest.fixture()
def mock_llm(client):
    """Selects the hidden mock preset (§7.1; registered only under BANDREADY_ENABLE_MOCK=1,
    the test seam 03-providers-and-settings.md documents per R2-19) as the configured LLM,
    via the partial deep-merge PATCH — sibling settings keys are untouched."""
    client.patch("/api/v1/settings", json={"providers": {"llm": {"type": "mock", "fixture_set": "default"}}})
```

Coverage (illustrative, not exhaustive):

- **Auth contract** (01-architecture.md §5): every route except `/health` → 401 without/with-wrong bearer; `/health` open; Host-header middleware rejects `evil.example:port`.
- **Sessions**: `POST /api/v1/speaking/sessions` → session row (`{session_id, offer_url, events_url}` per 18-api-contract.md §4.7); `GET /api/v1/speaking/sessions/{id}` mirrors state-machine state; double-start while one speaking session live → 409 (workers=1 contract).
- **Content bank**: import of seed JSON validates against schemas (05 §2.2 chart-spec, 06 §content schema, 07 script schema); invalid docs rejected with pointer to the failing path; attempts/score records round-trip (06 §4.2 JSON shape).
- **Reading/listening submit**: posting an answer sheet returns the exact score record shape of 06 §4.2, uses the real matcher (integration seam with §2.1).
- **Writing submit** (with `mock_llm`): full flow → `llm_evaluations` row written with `prompt_version`, offsets resolved, `overall_band` recomputed; malformed mock response → one retry → `status='failed'` with raw output stored.
- **SRS**: review posting advances FSRS state; due-queue endpoint ordering.
- **Settings**: `GET /api/v1/settings` returns the full document with secrets masked (never echoed back); `PATCH /api/v1/settings` does partial deep-merge (R2-19 — `PUT` is dropped): patching a nested key (e.g. `providers.llm`) leaves sibling keys untouched; lockfile endpoints exercise §2.5 behaviors through HTTP.
- **Voice offer**: `POST /api/v1/speaking/sessions/{session_id}/offer` (R2-1 — the former `/api/v1/voice/offer` is superseded) with an SDP from a bare aiortc `RTCPeerConnection` → valid answer; **trickle ICE arrives as PATCH to the same `/offer` URL** and both snake_case and camelCase candidate keys are accepted (gotcha #4 — this is a regression test, not documentation).

## 4. Voice E2E: headless speaking-session harness

Built to the shape in `_context/voice-pipeline-gotchas.md` §5, under `sidecar/tests/voice_e2e/`. The reusable pieces: `ScriptedAudioTrack` (queued s16-mono-48k utterances + silence when idle, drift-free pacing), `place_call` (aiortc `RTCPeerConnection` + `MediaBlackhole`/recorder), `say()` (Kokoro TTS synth with macOS `say` fallback, on-disk cache keyed by text hash). On top of that, the BandReady harness (a) subscribes to the session WebSocket `WS /api/v1/speaking/sessions/{id}/events` (minting a `session-events` ticket first, per 18-api-contract.md §2) to observe **state-machine transitions live**, and (b) polls `GET /api/v1/speaking/sessions/{id}` for the final record.

### 4.1 Harness API

```python
async def run_speaking_scenario(
    base_url: str, token: str,
    mode: str,                      # "full_mock" | "single_part" | ...
    part: int | None,
    script: list[dict],             # scripted candidate answers, see §4.2
    *, record_dir: Path,            # bot audio recorded here
) -> ScenarioResult:                # .states: [(state, t_ms)], .transcript, .session, .checks
```

The harness answers each examiner turn by enqueuing the next scripted WAV **when the bot stops speaking** (detected via silence on the incoming track for > 1.2 s, event-driven rather than a fixed per-turn wait), so a more verbose examiner does not break the test.

### 4.2 Scripted candidate answers

`voice_e2e/scripts/*.json` — one script per scenario, TTS-synthesized at run time (cached):

```json
{
  "script_id": "p1-hometown-band6",
  "mode": "single_part", "part": 1,
  "turns": [
    {"say": "My name is Arun and I come from Chennai, in the south of India.",
     "expect_state": "P1_QA"},
    {"say": "I live in an apartment with my parents. It is quite small but comfortable.",
     "expect_state": "P1_QA"},
    {"say": "Yes, I like my hometown because the food is famous and my friends are there.",
     "expect_state": "P1_QA"}
  ]
}
```

Shipped scenarios (defaults): `p1-hometown-band6`, `p2-cue-card-long-turn` (one 90 s monologue turn — asserts no hard-timer interrupt before 120 s and P2_PREP→P2_LONG_TURN auto-transition at 60 s), `p3-discussion`, `full-mock-short` (abbreviated budgets via a test-only `timer_scale=0.2` session flag so the full P1→WRAP_UP path runs in < 4 min), `hangup-mid-p2` (client closes the PC → ABORTED, partial transcript saved).

### 4.3 Assertions per scenario

1. **State sequence**: observed WebSocket states equal the expected path for the mode (order-sensitive subsequence match; timer-driven states allow ±1 turn jitter).
2. **Transcript capture**: final session transcript (transcript-observer shape, `_context/voice-pipeline-gotchas.md` §4.1: `{"turns":[{role,text,t_ms}]}`) contains ≥ 1 user turn per scripted utterance, and STT text for each turn passes a loose keyword check (`expect_transcript_contains`, ≥ 60% of content words — STT is imperfect; do not assert exact strings).
3. **Recording files exist**: per 04-speaking-module.md, the session writes candidate-audio WAVs to `media/speaking/<session_id>/` in the data dir (11-data-model.md §9's canonical layout, R2-18; user recordings are never auto-evicted per R2-6); assert file count == candidate turns and each is > 0 bytes with a valid RIFF header and duration within ±30% of the source utterance.
4. **Scoring handoff**: session reaches SCORING then FEEDBACK (mock LLM configured), and an `llm_evaluations` row exists for the session.
5. **The five Pipecat gotchas stay pinned** (`_context/voice-pipeline-gotchas.md` §1.3): this suite is their living regression test — if VADProcessor is dropped, turn-stop regresses to Smart Turn, or `min_volume` drifts up, scenario turns simply never transcribe and the suite fails loudly. Additionally one direct unit test asserts pipeline assembly order and params by introspecting the built pipeline (`test_pipeline_assembly.py`: VADProcessor immediately after `transport.input()`; `SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)` present; `VADParams.min_volume == 0.0`, user-supplied values clamped ≤ 0.6).

Execution: `uv run pytest -m slow sidecar/tests/voice_e2e` — runs the real sidecar (subprocess, temp data dir, real Whisper BASE STT + Kokoro TTS locally, mock LLM). ~6 min wall clock. Nightly + pre-release + on any change under `bandready/voice/` or `bandready/speaking/`; not on every PR.

## 5. Scoring-quality evals (golden-set framework)

The novel, critical layer. Band prediction is an LLM judgment; the only meaningful test is agreement with expert judgment on a fixed corpus.

### 5.1 Golden set

Authored per 15-content-authoring-licensing.md (original learner-style samples, expert-annotated; never copied from real candidates or prep books):

- **Writing**: ~30 samples (default split: 12 Task 2 essays, 9 Academic Task 1, 9 GT Task 1 letters) spanning bands 4.0–8.5, including deliberate edge profiles: off-topic-but-fluent (Task Response trap), memorized-template essay, under-length (< 250 words), high-vocab/broken-grammar, and one band-8.5 near-native sample.
- **Speaking**: ~20 transcripts (with the timed-turn structure and fluency metrics the real pipeline produces — pauses/wpm from 02-voice-pipeline.md included in the fixture so the eval prompt sees exactly production input), bands 4.0–8.5, including a hesitant-but-accurate profile and a fluent-but-off-question profile.

Fixture shape (`evals/golden/writing/w-014.json`):

```json
{
  "id": "w-014",
  "kind": "writing", "task_type": "task2",
  "prompt_text": "Some people believe that unpaid community service should be...",
  "response_text": "In this day and age, ...",
  "word_count": 268,
  "expected": {
    "overall": {"min": 6.0, "max": 6.5},
    "criteria": {
      "task_achievement":            {"min": 6, "max": 7},
      "coherence_cohesion":          {"min": 6, "max": 6},
      "lexical_resource":            {"min": 6, "max": 7},
      "grammatical_range_accuracy":  {"min": 5, "max": 6}
    }
  },
  "annotator": "expert-1", "annotated_on": "2026-07-20",
  "notes": "Position clear but conclusion restates without development."
}
```

Expected values are **ranges** (expert annotators legitimately disagree by ±0.5); the accuracy metric uses the range midpoint, and a prediction inside the range counts as error 0. `MANIFEST.json` records per-file SHA-256 so a run is reproducible against an exact corpus revision; changing a golden file bumps `corpus_rev`.

### 5.2 Metrics and gates

Per suite (writing / speaking), per (model, prompt_version):

| Metric | Definition | Gate (default) |
|---|---|---|
| `acc@0.5` | share of samples with overall-band error ≤ 0.5 | **≥ 80%** |
| `acc@1.0` | share with error ≤ 1.0 | **= 100%** |
| `mae` | mean absolute overall-band error | report only |
| `bias` | mean signed error (inflation +) | warn if \|bias\| > 0.25 |
| `crit_acc@1` | per-criterion band error ≤ 1 | ≥ 90% report-level |
| `consistency` | same input scored 3×: stddev of overall band | **< 0.3** on every sample in a 5-sample consistency subset |
| `parse_rate` | strict-JSON parses without retry | ≥ 95% |

Gate failure blocks: merging a prompt change, and marking a model "recommended" in the engine-detection UI (03-providers-and-settings.md).

### 5.3 Eval runner CLI

Installed as a console script of the sidecar package: `bandready-eval` (also `uv run python -m bandready.evals`).

```
bandready-eval run   --suite writing|speaking|all
                     [--model NAME]           # else the configured provider from the lockfile
                     [--base-url URL --api-key-env VAR]
                     [--prompt-version vN]    # else current shipped version
                     [--samples w-001,w-014]  [--consistency]   # adds the 3× subset
                     [--out evals/runs/]
bandready-eval report [--last | --run RUN_ID] [--compare RUN_ID]  # side-by-side drift table
bandready-eval history --suite writing        # acc@0.5 over time per (model, prompt_version)
```

`run` writes one JSONL per sample plus a summary to `evals/runs/<ts>-<suite>-<model>-<prompt_version>.jsonl` and prints:

```
suite=writing  model=qwen3-32b@localhost  prompt_version=v3  corpus_rev=9f2c1a  n=30
─────────────────────────────────────────────────────────────────────────────
 id     expected   predicted   err    TA  CC  LR  GRA   parse   notes
 w-001  5.0–5.5    5.0         0.00    ok  ok  ok  ok    1st
 w-014  6.0–6.5    7.0         0.75    ok  ok  +1  +1    1st    INFLATED
 ...
─────────────────────────────────────────────────────────────────────────────
 acc@0.5 83.3%  (gate ≥80% PASS)   acc@1.0 100% (gate PASS)
 mae 0.32   bias +0.18   crit_acc@1 92%   parse_rate 100%
 consistency (5×3 runs): max stddev 0.24 (gate <0.3 PASS)
 RESULT: PASS
```

Each per-sample record also lands in `llm_evaluations` (11-data-model.md — eval rows are distinguishable from production rows by their `prompt_version`/`model_id` plus the run's JSONL manifest; 11's column set is canonical), so `prompt_version`/model drift is queryable with plain SQL alongside production scoring rows. Cost note: a full writing run is 30 calls (+15 for consistency) — trivial locally, pennies on cloud endpoints.

### 5.4 Prompt-change and model-swap calibration workflow

- **Prompt change**: any edit to an evaluation prompt template (04/05) bumps `prompt_version`. PR must include a `bandready-eval report --compare <baseline-run>` table in its description showing gates PASS on the reference model (default reference: the current recommended local model per platform + one cloud model, e.g. `gpt-4.1-mini`-class via OpenRouter). CI cannot run real-LLM evals on PRs by default (no keys); the nightly `eval` workflow re-verifies on the reference models and files an issue on regression.
- **Model swap (user-facing calibration)**: when the user changes the configured LLM, Settings offers "Calibrate scoring" → runs a 10-sample quick suite (stratified subset, ~2 min local) and shows the verdict: *well calibrated* (acc@0.5 ≥ 80% on subset), *usable, tends to inflate by ~0.5* (bias surfaced, applied as a displayed caveat — never silently subtracted), or *not recommended for scoring* (acc@1.0 < 100%). Result stored per (model, prompt_version) so it reruns only on change. This is the same runner with `--samples` = the quick subset.
- **Drift watch**: nightly run on reference models; `history` chart in the repo dashboard. A model update behind the same alias (cloud providers do this) shows up as an unexplained metric shift on an unchanged (prompt_version, corpus_rev) — exactly what this catches.

## 6. Generated-content validation tests

The blind re-answer quality gates are production code (06-reading-module.md §Stage-3, 07-listening-module.md §validation) — so they get tests at two levels:

- **PR level (mock LLM, deterministic)**: `contentqa/` tests feed canned generator+blind-answerer outputs through the gate logic and assert the rules: pass at confidence ≥ 0.6 match; auto-repair on mismatch (one regeneration); discard group at > 30% failures post-repair; discard test at < 36/40 surviving; listening ≥ 9/10 blind agreement else the failing questions regenerate (max 3 attempts, then surfaced); `evidence_quote` substring check; word-limit self-consistency. Also: the blind answers are scored with the **real** §2.1 matcher, not string equality.
- **Nightly level (`real_llm`)**: generate 2 reading passages + 1 listening script end-to-end with the reference local model and assert the pipeline converges (a valid test survives within the retry budget) and the stored `validation_report_json` (11-data-model.md §3) is inspectable. This is a smoke test of generation viability, not of content quality — quality is the gate's own job.

## 7. Frontend tests

### 7.1 The mock LLM adapter (shared seam)

A `MockLLM` adapter registered under `type_id="mock"` implements the same adapter ABC as `OpenAICompatLLM` (`_context/voice-pipeline-gotchas.md` §2.1), returning canned fixture responses keyed by (route, fixture_set) with 0 latency (or `--latency-ms` for loading-state tests). Fixture sets live in `sidecar/bandready/adapters/mock/fixtures/*.json` and include: a valid writing evaluation (05 §6 schema), a malformed one, a reading generation + matching blind answers, examiner turn responses. The mock adapter ships in the package but its presets carry `"hidden": true` and register only when `BANDREADY_ENABLE_MOCK=1` (the test seam 03-providers-and-settings.md documents, per R2-19; selected via `PATCH /api/v1/settings`) — used by §3, §4, and §7.2 alike, so every layer above unit tests exercises the **real** scoring orchestration code with fake model output.

### 7.2 Vitest component tests

`pnpm vitest` in `app/`, jsdom, colocated `*.test.tsx`. Priorities (logic-bearing components, not snapshot theater): answer-sheet input components (word-count guard, letter-answer widgets), the writing editor autosave debounce (fake timers), inline-highlight offset rendering against the resolved-offset JSON of 05 §7, timer displays (soft vs hard semantics), SRS review card flow, band-score display rounding, api-client 401/retry behavior against a mocked `fetch`. Preload bridge (`window.bandready`) is stubbed via a test setup file. Coverage gate: 80% lines on `src/lib/` (pure logic), no gate on components (default).

### 7.3 Playwright × real Electron

Playwright's `_electron.launch()` drives the actual app — dev build on PRs, the **packaged** build in the release pipeline (same specs, `BANDREADY_E2E_PACKAGED=1` switches the launch target to the installed binary path):

```ts
// app/e2e/fixtures/electron.ts
export const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const app = await _electron.launch({
      args: ["."],
      env: { ...process.env, BANDREADY_ENABLE_MOCK: "1",
             BANDREADY_DATA_DIR: mkdtempSync(join(tmpdir(), "br-e2e-")) },
    });
    await use(app); await app.close();
  },
  page: async ({ app }, use) => { await use(await app.firstWindow()); },
});
```

The Electron main process spawns the **real sidecar** (real DB, real content bank, mock LLM) — this covers the spawn/token/health handshake of 01-architecture.md §4 for free on every run. ~15 flows (defaults): first-run onboarding + placement entry; settings form renders from `config_spec` and verify() feedback shows; reading full-test flow (answer, auto-submit at time-scale-compressed 60 min, score screen shows 06 §4.2 fields); writing submit → feedback with inline highlights → rewrite loop; listening playback gating (no scrubbing in exam mode); SRS review session; speaking session **UI states only** (mic is fake via `--use-fake-device-for-media-stream`-equivalent Electron flags; the UI walks CONNECTING→P1… on harness-driven events — real audio is §4's job); sidecar-crash recovery banner (kill the sidecar PID mid-flow → "Session interrupted", app recovers with new port/token); theme toggle without flash; offline mode (block non-loopback via a network-deny flag → all deterministic features still work).

## 8. Packaging smoke tests (CI, per release + nightly)

Owned jointly with 13-packaging-distribution.md. On real OS runners (macos-14 arm64, macos-13 x64, windows-2022, ubuntu-22.04):

1. Build installer (dmg/zip, nsis, AppImage/deb) via electron-builder.
2. Install silently (`hdiutil attach`+copy / `installer.exe /S` / `dpkg -i`).
3. Launch the installed binary headless (xvfb on Linux) with a temp `BANDREADY_DATA_DIR`.
4. Assert within 30 s: sidecar process is running as a child; `GET /health` on the advertised port returns `{"status":"ok","db":"ok"}` with the expected migration head; renderer window reached the app shell (Playwright attach to the packaged app).
5. **Wheel-content guard** (the dist-not-in-wheel trap, `_context/voice-pipeline-gotchas.md` §6): a script asserts the built artifact contains the webui `dist/`, alembic migrations, seed content JSON, Kokoro model files (or the documented download-on-first-run marker), and that `Path(__file__).parent`-relative resolution finds them from the installed location.
6. **Offline boot**: relaunch with all non-loopback traffic blocked (pf rule / firewall / netns) → app boots, a seeded reading test can be taken and scored, SRS reviews work. (LLM features degrade with the documented offline notice — asserted present, not absent.)
7. Uninstall leaves the data dir intact (documented behavior).
8. Auto-update: dedicated nightly-only job feeds a stub update server, asserts version bump across restart.

## 9. Explicitly NOT automated

- **Subjective feedback quality** — whether comments/suggestions are *helpful, kind, specific*. The golden-set evals gate band *accuracy*; feedback prose is covered by a **manual review checklist** run per release on 5 stratified samples per module: (1) every comment cites an `evidence_quote` actually present in the response; (2) suggestions are actionable, not generic; (3) tone matches the coach persona; (4) no hallucinated errors (flagged "error" text exists at the claimed offset); (5) model-answer outline is on-topic. Checklist lives in `docs/release-checklist.md`; results filed in the release notes.
- **Examiner persona naturalness in live speech** (pacing, warmth) — reviewed by a human doing one full mock per release per reference model.
- **STT/TTS accuracy themselves** — upstream model quality; we test our *integration* (§4), not Whisper.
- **Pronunciation-score ground truth** (09-pronunciation-assessment.md) — no expert-labeled phoneme corpus in v1; covered only by consistency checks (same audio scored twice → identical) and monotonic sanity (deliberately mispronounced fixture scores below the clean fixture). Flagged limitation.
- **Real-exam correlation** — no access to actual candidate outcomes; the golden set is the best available proxy.

## 10. CI matrix summary

GitHub Actions (defaults; workflow names in parentheses):

| Workflow | Trigger | Runners | Jobs | Budget |
|---|---|---|---|---|
| `pr` | every PR | ubuntu-22.04 (+ windows-2022 for lockfile/path tests) | ruff+mypy, pytest unit+api+contentqa(mock), vitest, eslint+tsc, Playwright×Electron dev build (xvfb), build wheel+webui | < 12 min |
| `nightly` | cron 03:00 UTC | ubuntu, macos-14 | voice E2E (§4), `real_llm` content generation (§6), golden-set evals on reference models (§5.4), packaging smoke (§8) incl. auto-update job | < 90 min |
| `release` | tag `v*` | macos-14, macos-13, windows-2022, ubuntu-22.04 | full pyramid: everything in `pr` + voice E2E + evals (gates block the release) + packaging smoke on **packaged** builds + Playwright against packaged app | < 3 h |
| `eval-manual` | `workflow_dispatch` | ubuntu | `bandready-eval run` with user-supplied model/base-url inputs, uploads report artifact | on demand |

Secrets: nightly/release hold one cloud key (reference model) as a repo secret; PRs from forks get mock-only lanes automatically (`real_llm`/`eval` markers skip without env). Python matrix: 3.11 only (pinned floor, matches packaging runtime); pipecat-ai pinned 1.5.0 with a CI guard that fails if the lock drifts.

## Open questions

1. **Golden-set annotation authority**: ranges need at least two independent expert annotations to be defensible. Do we recruit a certified ex-examiner (paid) for the initial 50 samples, or bootstrap with two experienced IELTS tutors and tighten later? (15-content-authoring-licensing.md owns sourcing; the gate thresholds here assume annotation noise ≤ ±0.5.)
2. **Windows voice E2E**: the aiortc harness is developed/verified on macOS; Windows CI audio (no real devices, different Opus/AV binary wheels) may need a dedicated self-hosted runner. Decide when nightly Windows voice runs first flake.
3. **Consistency gate at temperature 0.2**: the stddev < 0.3 gate assumes the production sampling temperature. If a configured endpoint ignores `temperature` (some local servers do), consistency may fail through no fault of the prompt — do we auto-detect and annotate, or force temperature support as a provider requirement?
4. **Should the 10-sample user calibration be mandatory** before the first scored writing submission on a new model, or opt-in with a persistent "uncalibrated model" badge? UX call for 03-providers-and-settings.md + 12-design-system.md.
5. **Eval corpus growth policy**: production mis-scores users report ("this band feels wrong") are the best future golden samples, but adding user text to a public repo corpus needs explicit consent + anonymization — process TBD with 15-content-authoring-licensing.md.
