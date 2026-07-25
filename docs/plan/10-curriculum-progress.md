# 10 — Curriculum & progress tracking

Status: draft v2 (2026-07-25)

This doc specifies BandReady's end-to-end learner journey: the onboarding wizard (owned end-to-end
here per ruling R2-14 — 12-design-system.md §6.9 and 13-packaging-distribution.md §7.1 defer to
this doc), the ~30-minute placement test (speaking sampler skippable) that seeds per-skill band
estimates, the rule-based (deliberately non-ML) study-plan generator with its weekly weighting
algorithm and pre-exam taper, daily session composition (30/60/90-minute variants), the
band-prediction model (exponentially-decayed rolling estimates, confidence gating, official IELTS
rounding), the progress dashboard, the adaptive-rules engine that adjusts the plan from
criterion-level evidence, gentle gamification, and the mock-test / exam-readiness track. All
computation runs in the FastAPI sidecar (01-architecture.md); scored attempts reach the estimator
through the `scored_attempts` SQL view (11-data-model.md §8.3); vocabulary retention comes from
08-vocabulary-srs.md; persisted shapes coordinate with 11-data-model.md, which is canonical for
DDL; the route inventory is canonical in 18-api-contract.md (all routes under `/api/v1`, R2-1).

## 1. Learner journey overview

```
first launch
   │
   ▼
[Onboarding wizard] ── skip placement? ──► [self-assessed estimates, low confidence]
   │                                              │
   ▼                                              │
[Placement test ~30 min]                          │
   │  per-skill starting estimates                │
   │  (any section skippable → self-assessed      │
   │   fallback for that skill — R2-14)           │
   ▼                                              ▼
[Study plan generated] ◄──────────────────────────┘
   │
   ▼
[Daily sessions] ──► scored attempts ──► [band estimates update]
   ▲                                          │
   │            [adaptive rules fire] ◄───────┤
   └── plan adjustments ◄─────────────────────┘
   │
   ▼  (final 2 weeks)
[Mock-test taper] ──► [exam-readiness checklist] ──► exam day
```

Everything is re-enterable: the learner can retake placement, change target/date (plan regenerates),
or ignore the plan entirely and free-practice — scored attempts feed estimates either way.

## 2. Onboarding wizard (owned end-to-end by this doc — R2-14)

This doc owns the first-run wizard end-to-end; **12-design-system.md §6.9 (visual treatment) and
13-packaging-distribution.md §7.1 (model downloads) defer to this sequence** — 13's model-download
step is folded in as step 5 below. Seven modal-free full-screen steps, progress dots top-center,
Back/Continue at bottom, "Set up later" escape hatch on every step after step 3. All profile
answers are editable later in Settings → Profile. No account creation (single learner, local-first
— decisions.md); the wizard writes the single v1 profile resolved via `settings.active_profile_id`
(R2-5).

| Step | Screen | Fields / behaviour |
|---|---|---|
| 1 | Welcome + theme choice | dark default (12-design-system.md) |
| 2 | Which test? Target band? Exam date? | `exam_format` `academic` \| `general_training` (default `academic`); `target_band` 4.0–9.0 step 0.5 (default 6.5); `exam_date` date or "not booked yet" (`null`, default) |
| 3 | Self-rating + time budget | `self_level` `beginner`(→~4.5) \| `intermediate`(→~5.5) \| `upper`(→~6.5) \| `advanced`(→~7.5), default `intermediate`; `daily_minutes` 30 \| 60 \| 90, default 60; study-day chips Mon–Sun (default Mon–Sat, min 3 selected) |
| 4 | Engine detection + provider choice | "Found: Ollama ✓, mlx-lm ✗" with one-click guided setup per 03-providers-and-settings.md (setup runs as a job — 18-api-contract.md §3) |
| 5 | Model downloads *(folded from 13 §7.1 per R2-14)* | shows the artifacts the chosen presets need with sizes + a disk-space check; combined progress via the jobs API (`kind=model_download`, 18 §3). Downloads continue in the background — Speaking stays locked until its weights are present; Reading/Writing work immediately (13 §7.2's artifact manifest) |
| 6 | Mic check | same DeviceCheck component as the Speaking Room (12-design-system.md) |
| 7 | Placement offer | **[Take the ~30-min placement test]** (recommended) or **[Skip — start from my self-rating]**; within the placement, every section is individually skippable (§3) |

The profile questions (steps 1–3) take < 2 minutes; step-5 downloads run in the background so the
learner can reach their first speaking session within 20 minutes of install (00-vision.md's
activation metric — placement is deferrable, R2-14).

Skipping placement entirely seeds all four skills at the `self_level` band with
`confidence: "low"`; the dashboard nags (dismissibly) until a placement or 3 scored attempts exist
per skill.

Profile JSON (the `GET/PUT /api/v1/profile` document — 18-api-contract.md §4.13 — persisted on the
active `profiles` row, 11-data-model.md §2; R2-5 repeals the old single-row `learner_profile`):

```json
{
  "exam_format": "academic",
  "target_band": 7.0,
  "exam_date": "2026-08-22",
  "self_level": "upper",
  "daily_minutes": 60,
  "study_days": ["mon","tue","wed","thu","fri","sat"],
  "onboarded_at": "2026-07-25T10:12:00Z",
  "placement_completed_at": "2026-07-25T11:05:00Z"
}
```

(`study_days` maps to the `profiles.study_days_json` column; `exam_format` values are
`academic|general_training` — never `general`.)

## 3. Placement test

A short **fixed-then-adaptive sampler**, ~30 minutes (R2-14), one sitting (pausable between
sections). Goal: a starting band estimate per skill with ±1.0 tolerance — good enough to weight
the plan; real precision accrues from ongoing scored attempts. **Every section is individually
skippable** — the speaking sampler most prominently ("no mic handy? skip for now") — and a skipped
section falls back to the self-assessed `self_level` band for that skill with
`confidence: "low"` (R2-14).

| Section | Content | Time | Scoring |
|---|---|---|---|
| Speaking *(skippable)* | 1 Part-1 topic (4 questions, live voice — 02-voice-pipeline.md, 04-speaking-module.md) | ~6 min | LLM rubric scorer → FC/LR/GRA/P criterion bands |
| Writing | 1 short task: 100–150-word Task-1-style mini response (variant-appropriate: chart description for Academic, letter for GT) | ~10 min (timed) | LLM rubric scorer → TA/CC/LR/GRA (05-writing-module.md) |
| Reading | 1 passage, 8 questions, difficulty-adaptive question set | ~8 min | objective, banded via conversion table (06-reading-module.md) |
| Listening | 1 part (Part 2 monologue), 8 questions | ~6 min | objective, banded (07-listening-module.md) |

(Section timings are defaults revised down from the earlier ~45-minute design to hit R2-14's
~30-minute total; ~24 minutes when speaking is skipped.) Placement content ships as
15-content-authoring-licensing.md's placement pack (R2-22): 2 same-family reading passage pairs
(band 5–6 / 7–8), 2 listening samplers, 4 short writing tasks (2 per variant), 4 speaking P1 topic
minis.

Adaptivity (rule-based, single pivot to keep it simple — flagged default): Reading starts with a
band-5–6 difficulty passage; if the learner scores ≥ 7/8 on the first 4 questions the remaining 4
swap to the band-7–8 set of the same passage family; ≤ 2/8 swaps down. Listening likewise picks
Part 2 (easier) vs Part 3 based on `self_level` (`upper`/`advanced` → Part 3). Speaking/Writing are
single prompts scored on the full band scale — no pivot needed.

Objective → band conversion for the 8-question samplers (default table, calibrated later against
full-length tests in 15-content-authoring-licensing.md content):

```
correct: 0-1→3.5  2→4.5  3→5.0  4→5.5  5→6.0  6→6.5  7→7.0  8→7.5
```

Placement result JSON (row in `placement_results`):

```json
{
  "taken_at": "2026-07-25T11:05:00Z",
  "estimates": {
    "listening": {"band": 6.5, "evidence": {"correct": 6, "of": 8, "part": 2}},
    "reading":   {"band": 6.5, "evidence": {"correct": 6, "of": 8, "pivoted": "up"}},
    "writing":   {"band": 5.5, "evidence": {"criteria": {"TA": 6.0, "CC": 5.0, "LR": 5.5, "GRA": 5.5}}},
    "speaking":  {"band": 6.0, "evidence": {"criteria": {"FC": 6.0, "LR": 6.0, "GRA": 5.5, "P": 6.5}}}
  },
  "confidence": "medium"
}
```

Placement seeds the estimate engine (§6) as one attempt per skill with weight ×2 (it is a
controlled, timed sample — worth more than a casual drill) and `confidence: "medium"`. Placement
attempts enter the `scored_attempts` view (11-data-model.md §8.3) with `mode='placement'`
(the speaking sampler runs with `speaking_sessions.mode='placement'` — 11 §4.2).

## 4. Study-plan engine

Rule-based generator. Inputs: profile (§2), current per-skill estimates (§6), content availability.
Output: an ordered list of scheduled sessions from today to `exam_date` (or a rolling 8-week horizon
when no date is set — default). Deterministic given the same inputs + seed, so "Regenerate" is
reproducible and testable (14-testing-strategy.md).

### 4.1 Phases

```
weeks_remaining = ceil((exam_date - today) / 7)          # or 8 if exam_date is null
if weeks_remaining > 2:  phases = [BUILD (all but last 2 weeks), TAPER (last 2 weeks)]
else:                    phases = [TAPER only]           # crash-prep mode
```

- **BUILD**: skill-weighted practice, one weekly "review day" (error-log review + SRS deep session),
  one full section-length test per week rotating through skills.
- **TAPER** (final 2 weeks): 2 full 4-skill mock tests per week (three-hour blocks — see §10),
  remaining days are mock-review sessions + light SRS; no new vocabulary cards introduced
  (coordinates with 08-vocabulary-srs.md `new_cards_per_day = 0` override).

### 4.2 Weekly weighting algorithm

```python
SKILLS = ["listening", "reading", "writing", "speaking"]
FLOOR = 0.15          # no skill ever gets < 15% of weekly minutes (defaults, tuneable in code not UI)
MIN_GAP = 0.25        # even at/above target, keep a maintenance gap

def weekly_weights(target_band: float, estimates: dict[str, float]) -> dict[str, float]:
    gaps = {s: max(MIN_GAP, target_band - estimates[s]) for s in SKILLS}
    total = sum(gaps.values())
    w = {s: gaps[s] / total for s in SKILLS}
    # apply floor, renormalise the rest proportionally
    floored = {s for s in SKILLS if w[s] < FLOOR}
    for s in floored: w[s] = FLOOR
    rest = [s for s in SKILLS if s not in floored]
    remaining = 1.0 - FLOOR * len(floored)
    rest_total = sum(w[s] for s in rest)
    for s in rest: w[s] = w[s] / rest_total * remaining
    return w

def generate_plan(profile, estimates, today, seed) -> Plan:
    weeks = weeks_until_exam(profile) or 8
    sessions = []
    for wk in range(weeks):
        phase = "taper" if wk >= weeks - 2 and profile.exam_date else "build"
        w = weekly_weights(profile.target_band, current_estimates_for(wk))  # re-weighted weekly
        minutes = profile.daily_minutes * len(profile.study_days)
        if phase == "build":
            budget = {s: round_to_session(w[s] * minutes) for s in SKILLS}
            sessions += schedule_build_week(wk, budget, profile.study_days,
                                            review_day=last_study_day(profile),
                                            section_test=rotating_skill(wk), seed=seed)
        else:
            sessions += schedule_taper_week(wk, profile)   # 2 mocks + reviews + light SRS
    return Plan(sessions=sessions, weights_by_week=..., generated_at=now())
```

`schedule_build_week` fills each study day with one session of §5 composition, assigning the main
activity by largest remaining skill budget (greedy, ties broken by seed), never scheduling the same
skill as main activity 3 days running (variety rule). Micro-drills target the current
weakest criterion (§8). Regeneration triggers: profile edit, weekly rollover (weights recomputed
from fresh estimates), adaptive-rule plan actions, manual "Regenerate plan" button. Completed
sessions are never rewritten; only future sessions change.

### 4.3 Worked example — band 6 → 7, 4 weeks out, 60 min × 6 days

Estimates: L 6.5, R 6.5, W 5.5, S 6.0. Gaps: 0.5 / 0.5 / 1.5 / 1.0 → raw weights
L .14, R .14, W .43, S .29 → after 15% floor: **L 15%, R 15%, W 42%, S 28%**.
Weekly pool 360 min → W ~150, S ~100, L ~55, R ~55 (build weeks). Weeks 3–4 are TAPER.

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|
| **Wk 1** (build) | Writing T2 essay + GRA drill | Speaking P2 long turn | Writing T1 + vocab drill | Listening P3 set | Reading passage (timed) + Speaking P1 warmdown | Review day: error log + SRS deep | rest |
| **Wk 2** (build, reweighted) | Writing T2 (coherence focus) | Speaking P3 discussion | Section test: full Writing (60 min) | Listening P4 + micro-drill | Reading T/F/NG drill (timed) | Review day | rest |
| **Wk 3** (taper) | **Full mock #1** (LRW ~2h35) | Mock #1 Speaking + review | Mock error review: Writing rewrite | Light: SRS + Listening replay | **Full mock #2** | Mock #2 review + checklist pass | rest |
| **Wk 4** (taper) | **Full mock #3** | Mock #3 Speaking + review | Weakest-criterion micro-lessons | Light SRS + pronunciation pass (09) | Timing rehearsal: Reading + Listening only | Readiness checklist final; pack-your-bag list | rest → exam |

(Section-length mocks split across days in taper weeks when `daily_minutes < 90` — the mock block
overrides the daily budget with an explicit learner confirmation: "This session runs ~2h40.")

### 4.4 Plan JSON shape (coordinates with 11-data-model.md)

```json
{
  "plan_id": "pln_01J...",
  "generated_at": "2026-07-25T11:10:00Z",
  "horizon_weeks": 4,
  "weights_by_week": [{"week": 1, "listening": 0.15, "reading": 0.15, "writing": 0.42, "speaking": 0.28}],
  "sessions": [
    {
      "session_id": "ses_01J...",
      "date": "2026-07-27",
      "phase": "build",
      "duration_min": 60,
      "blocks": [
        {"kind": "warmup_srs",  "minutes": 10, "params": {"max_cards": 20}},
        {"kind": "main",        "minutes": 40, "module": "writing", "activity": "task2_essay",
         "params": {"topic_tag": "education", "criterion_focus": "GRA"}},
        {"kind": "micro_drill", "minutes": 10, "module": "writing", "activity": "gra_complex_sentences"}
      ],
      "status": "scheduled"        // scheduled | completed | partial | skipped
    }
  ]
}
```

## 5. Daily session composition

Fixed three-block skeleton (plus a 1-screen wrap-up). Block minutes by variant:

| Variant | Warm-up (SRS vocab review) | Main activity | Micro-drill | Wrap-up |
|---|---|---|---|---|
| 30 min | 5 (≤ 10 cards) | 20 | 5 | ~0 (toast) |
| 60 min | 10 (≤ 20 cards) | 40 | 10 | ~1 screen |
| 90 min | 10 (≤ 25 cards) | 60 (may be 2×30) | 15 | ~2 min |

- **Warm-up** pulls due cards from 08-vocabulary-srs.md; if fewer are due, remaining time offers new
  cards (never during taper).
- **Main activity** comes from the plan block; the learner can swap it for any same-skill activity
  (swap is logged; 3 swaps away from a skill in a week surfaces a "want me to reweight?" prompt —
  the plan serves the learner, not vice-versa).
- **Micro-drill** is a 5–15 min targeted exercise chosen by the adaptive engine (§8): grammar
  transformations, paraphrase sprints, T/F/NG speed sets, minimal-pair pronunciation (09).
- **Wrap-up** shows: minutes logged, criterion deltas if scored, streak state, tomorrow's preview.

Session lifecycle state machine (persisted per block so a crash resumes mid-session):

```
scheduled → in_progress(block_idx) → completed
                     │ (quit early, ≥1 block done) → partial
                     │ (date passes, never started) → skipped
```

Skipped sessions are NOT rescheduled by default (no guilt-debt piles — see §9); the weekly
reweighting naturally compensates because unpracticed skills keep larger gaps.

## 6. Band prediction model

### 6.1 Per-skill rolling estimate

The estimator reads exclusively from the **`scored_attempts` SQL view** (canonical DDL in
11-data-model.md §8.3, per R2-7): a UNION over `speaking_sessions` / `writing_submissions` /
`reading_attempts` / `listening_attempts` with uniform columns `attempt_id`, `profile_id`,
`skill`, `mode` (`placement|mock|practice|micro`), `band`, `criteria_json`, `at`. Only finished,
banded attempts appear; unbanded drills (`drill_results`) never feed the estimator. For each
skill, over those rows (module scorers produce an overall band per attempt plus criterion bands
where applicable):

```
HALF_LIFE_DAYS = 14                       # default; attempt from 2 weeks ago counts half
w_i        = base_i × 0.5^(age_days_i / HALF_LIFE_DAYS)
base_i     = 2.0 for mode placement|mock, 1.0 for mode practice, 0.5 for mode micro
estimate   = Σ(w_i · band_i) / Σ(w_i)     # raw float, e.g. 6.32
display    = nearest 0.5                  # skills are shown in half-band steps, like real IELTS
```

Same formula runs per **criterion** (FC/LR/GRA/P for speaking; TA(/TR)/CC/LR/GRA for writing) to
power the radar chart and adaptive rules.

### 6.2 Confidence gate & range

```
n_eff = Σ(w_i)                                    # effective sample size
confidence = "insufficient"  if n_eff < 2          → show "—", prompt to practice/place
             "low"           if 2 ≤ n_eff < 4      → range ±1.0
             "medium"        if 4 ≤ n_eff < 8      → range ±0.5
             "high"          if n_eff ≥ 8 AND newest attempt ≤ 7 days old → range ±0.5,
                                tightened to ±0.25 internally for plan weighting
```

Staleness: if the newest attempt for a skill is > 21 days old, confidence drops one level and the
dashboard shows "estimate is getting stale — practice X to refresh it."

### 6.3 Overall band — official IELTS rounding

Overall = arithmetic mean of the four skill bands, rounded to the nearest half band, with the
official upward tie rule: **a mean ending in .25 rounds UP to the next half band; a mean ending in
.75 rounds UP to the next whole band.** (This is the published IELTS policy; skill bands are already
half-band granular so the mean can only end in .00/.125/.25/.375/.5/.625/.75/.875 — we compute from
half-band-rounded skill displays, matching the real test, so only .00/.25/.5/.75 occur.)

```
Example: L 6.5, R 6.5, W 5.5, S 6.0 → mean 6.125?  No — mean of half-band values:
(6.5 + 6.5 + 5.5 + 6.0)/4 = 6.125 → this CAN occur; round to nearest 0.5 → 6.0
(6.5 + 6.5 + 5.5 + 6.5)/4 = 6.25  → .25 rounds UP → 6.5
(7.0 + 7.0 + 6.5 + 7.0)/4 = 6.875 → nearest 0.5 → 7.0
```

Implementation: `overall = round_ielts(mean)` where `round_ielts` rounds to nearest 0.5 and breaks
exact `.25`/`.75` ties upward. **There is exactly ONE shared `round_ielts()` implementation
app-wide (R2-4)**: the same helper is imported by the speaking post-processing (04 §6.3), the
writing post-processing (05 §6.3 — 05's earlier conservative round-down is repealed), and this
estimator; servers always recompute `overall_band` from criterion bands and ignore the model's
own overall value. Unit-tested against a table of all 4-tuples in 14-testing-strategy.md.
Overall confidence = the minimum of the four skill confidences; if any skill is "insufficient",
overall shows "—".

### 6.4 Display framing (non-negotiable copy rules)

- Always labelled **"Estimated band — not a guarantee"**; tooltip: "Based on N scored practice
  attempts over the last M days, scored by your configured AI model against public IELTS band
  descriptors. Real examiner scores can differ."
- Always shown WITH the range: "**6.5** (likely 6.0–7.0)".
- Never rendered without the range in any UI surface, including wrap-up toasts and exports.

Each estimator run (after every scored attempt) **appends** one `band_estimates` row per affected
skill plus `overall` — an append-only snapshot log (11-data-model.md §8.2, R2-7); the "current"
per-skill cache is the SQL view `current_band_estimates` (latest row per `(profile_id, skill)`),
which the dashboard reads. Row shape (11 owns the DDL):

```json
{
  "skill": "writing", "estimate_raw": 6.32, "band": 6.5,
  "range_low": 6.0, "range_high": 7.0, "confidence": "medium",
  "n_eff": 5.4, "attempts_used": 7, "newest_attempt_at": "2026-07-24T18:00:00Z",
  "criteria_json": {"TA": 6.5, "CC": 6.0, "LR": 6.5, "GRA": 5.5},
  "method": "estimator", "model_id": "mlx-community/Qwen3-14B-4bit",
  "created_at": "2026-07-24T18:00:05Z"
}
```

## 7. Progress dashboard

Route `/progress`. Layout (design tokens per 12-design-system.md; charts follow the dataviz
conventions — one accent hue, band axis fixed 4–9):

```
┌────────────────────────────────────────────────────────────────────┐
│  Overall estimate  6.5 (likely 6.0–7.0) · target 7.0 · exam in 28d │
│  [L 6.5 ±0.5] [R 6.5 ±0.5] [W 5.5 ±0.5] [S 6.0 ±1.0]  ← skill tiles│
├──────────────────────────────┬─────────────────────────────────────┤
│ Band trajectory (12 weeks)   │ Criteria radar (per selected skill) │
│  9 ┤                         │        TA                           │
│  7 ┤      ▄▄▀▀ target ────   │     ╱      ╲                        │
│  6 ┤ ▄▀▀▀▀   (band + range   │  GRA ─────── CC                    │
│  4 ┤          shading)       │     ╲      ╱                        │
│    └──────────────────────   │        LR                           │
├──────────────────────────────┼─────────────────────────────────────┤
│ Activity heatmap (GitHub-    │ Focus this week                     │
│ style 16-week calendar,      │ ⚠ Weakest: Writing GRA 5.5          │
│ cell = minutes studied)      │   → 3 grammar micro-lessons queued  │
│                              │ ⚠ Reading: 2 of last 3 timed out    │
│                              │   → speed drills added Wed          │
├──────────────────────────────┴─────────────────────────────────────┤
│ Vocab: 412 cards · 91% 7-day retention · 34 due today (→ /vocab)   │
│ Streak: 12 days 🔥 · daily goal 60 min · next milestone: 14 days   │
└────────────────────────────────────────────────────────────────────┘
```

Widget specs:

- **Trajectory chart**: per-skill weekly estimate points (line) with range band (translucent fill),
  horizontal dashed target line, skill selector tabs. Weeks with `confidence: insufficient` render
  a gap, not an interpolated line.
- **Criteria radar**: current criterion estimates for the selected productive skill (Writing/
  Speaking); Reading/Listening instead show a question-type accuracy bar list (e.g. "T/F/NG 54%").
- **Heatmap**: 16 weeks × 7 days, intensity = minutes vs `daily_minutes` goal (0 / <50% / <100% /
  ≥100%). Tooltip: date, minutes, activities.
- **Focus callouts**: rendered directly from the adaptive-rule firings table (§8) — every callout
  states the evidence AND the action taken, so plan changes are never silent.
- **Vocab tile**: retention = 7-day rolling correct-review rate from 08-vocabulary-srs.md.

Sidecar endpoints (canonical inventory: 18-api-contract.md §4.13; all under `/api/v1` per R2-1):
`GET /api/v1/progress/summary` (tiles+callouts+streak — band tiles read the
`current_band_estimates` view), `GET /api/v1/progress/trajectory?skill=`,
`GET /api/v1/progress/criteria?skill=`, `GET /api/v1/progress/heatmap?weeks=16`.

## 8. Adaptive rules engine

Declarative rules evaluated after every scored attempt and at daily rollover. Rules are shipped as
data (JSON in the content bank — same "composable fragments" spirit as OpenVoiceUI's skills.json),
so tuning them never needs a code change. Firings are persisted and surfaced as dashboard callouts.

Rule shape:

```json
{
  "id": "gra-low-streak",
  "description": "3 consecutive low GRA scores → inject grammar micro-lessons",
  "trigger": {"metric": "criterion_band", "skill": "any", "criterion": "GRA",
              "op": "<=", "value": 5.5, "consecutive": 3},
  "action": {"type": "inject_micro_drills", "activity_tag": "grammar", "count": 3,
             "within_days": 7},
  "cooldown_days": 14
}
```

Built-in rule set (defaults; ops on the attempt stream unless noted):

| id | Trigger | Action |
|---|---|---|
| `gra-low-streak` | criterion GRA ≤ 5.5 on 3 consecutive scored attempts (any productive skill) | inject 3 grammar micro-drills within 7 days |
| `reading-timeouts` | reading attempt hit the timer before finishing, 2 of last 3 | replace next reading main activity with timed speed-drill set; enable per-question timer display |
| `listening-late-parts` | Part 3+4 accuracy < Part 1+2 accuracy by ≥ 20pts over last 3 attempts | bias listening activity picker to Parts 3–4 |
| `speaking-lr-flat` | criterion LR ≤ 5.5 on 3 consecutive speaking attempts | queue topic-vocabulary card packs for upcoming speaking topics (08-vocabulary-srs.md) |
| `writing-ta-low` | criterion TA/TR ≤ 5.5 on 2 consecutive writing attempts | inject "answer the question" micro-lesson + outline-first mode on next essay |
| `vocab-retention-drop` | 7-day retention < 80% (daily rollover) | cap new cards at 0 until retention ≥ 85% |
| `stale-skill` | no scored attempt in a skill for 14 days (daily rollover) | promote that skill to next session's main activity |
| `returning-learner` | streak broken after ≥ 7 days AND 3+ idle days | next session auto-shrinks to the 30-min variant ("ease back in") |

Engine rules: max 2 firings applied per day (highest-priority first, priority = table order);
`cooldown_days` prevents nagging; every firing writes `adaptive_events` (11-data-model.md §8.4)
with evidence attempt-ids so callouts are auditable.

## 9. Streaks & gentle gamification

Principles (hard requirements, reviewed against 00-vision.md tone): no shame, no loss-aversion
mechanics, no notifications outside the app (v1 has none at all), nothing purchasable. Motivation
comes from visible progress toward a real exam.

- **Daily goal**: met when logged minutes ≥ `daily_minutes` OR the day's scheduled session is
  completed (whichever is easier). Partial sessions count their minutes.
- **Streak**: consecutive study-days with goal met; **rest days configured in the profile do not
  break the streak** (they show as "rest" in the heatmap). One free "streak repair" per 30 days is
  applied automatically and labelled honestly ("we covered Tuesday for you").
- **Milestones** (one-time, quiet confetti + badge on wrap-up screen only): first session; 7-, 14-,
  30-, 60-day streak; first full mock; each +0.5 gain in any skill estimate at medium+ confidence;
  100 vocab cards mastered; "exam-ready" (checklist complete, §10).
- Explicitly rejected: leagues/leaderboards (single learner anyway), decaying XP, "your streak is
  about to die!" copy, daily-reward chests.

## 10. Mock tests & exam-readiness

**Mock scheduling.** Full mocks (Listening ~30 min + Reading 60 + Writing 60, Speaking 11–14 min
scheduled same or next day, mirroring the real format) are auto-placed in TAPER weeks (2/week);
outside taper, the learner can insert one from `/plan` ("Add a full mock"), which displaces that
day's session. Mocks run in strict exam mode: fixed timers, no hints, no mid-test feedback, scores
revealed only at the end (modules 04–07 each define exam-mode behaviour). Mock attempts carry
`base=2.0` weight in §6.

**Exam-readiness checklist** (route `/readiness`, unlocked when `exam_date` set; items auto-check
from data, learner can also tick manual items):

```
Auto-checked                                     Manual
[✓] ≥ 2 full mocks completed                     [ ] Exam booked & documents valid
[✓] Overall mock estimate ≥ target − 0.5         [ ] Test-day logistics planned (venue/time)
[✗] Every skill estimate ≥ target − 0.5          [ ] Know the paper vs computer format you booked
    at medium+ confidence                        [ ] Speaking: recorded yourself and listened back
[✓] Completed Listening+Reading inside official  [ ] Sleep plan for exam week
    time limits in the last 2 mocks
[✓] Writing: both tasks within word minimums
    in the last 2 mocks
[✗] Vocab: 7-day retention ≥ 85%
```

Header verdict: "Ready" (all auto items ✓), "Nearly" (≥ 75%), "Keep building" — with the standing
disclaimer from §6.4. If auto items are still red 10 days out, a single (dismissible) banner
suggests: "Consider whether your target band or exam date is realistic — here's what the data
shows," linking the trajectory chart. BandReady never auto-changes the target.

## 11. Data shapes (coordination contract with 11-data-model.md)

**11-data-model.md §8 owns the canonical DDL and, per R2-7, adopted this doc's richer model
wholesale**: `placement_results`, `study_plans(horizon_weeks, weights_json, superseded_by)`,
block-structured `plan_sessions` (`blocks_json` per §4.4, `phase build|taper`, `status` incl.
`in_progress|partial`, crash-resume `current_block`), `adaptive_events`, `daily_activity`,
`milestones`, and `readiness_items` — ported to 11's conventions (TEXT ULID PKs, `*_at`
timestamps, `profile_id` scoping). The DDL formerly duplicated here is deleted; read it in
11 §8.1/§8.4. Deltas from this doc's earlier draft:

- **Profiles (R2-5, closes G4)**: the single-row `learner_profile CHECK (id = 1)` is **repealed**.
  The learner-profile fields (`exam_format`, `target_band`, `exam_date`, `self_level`,
  `daily_minutes`, `study_days_json`, `onboarded_at`, `placement_completed_at`) live on the
  multi-row `profiles` table (11 §2), and every curriculum/progress root table carries
  `profile_id`. The v1 UI exposes exactly one profile, resolved via `settings.active_profile_id`
  — no profile switcher until v1.x.
- **Band estimates (R2-7)**: BOTH models. `band_estimates` is an **append-only snapshot log**
  (one row per estimator run per affected skill — 11 §8.2; trend chart is a straight scan, model
  changes stay attributable), and the per-skill "current" cache this doc's §6.4 needs is the SQL
  **VIEW `current_band_estimates`** (latest row per `(profile_id, skill)`), so cache and log can
  never drift. This doc's former one-row-per-skill cache table is superseded.
- **Estimator input (R2-7, closes G3)**: the generic `attempts` table this doc previously
  required does not exist. Its replacement is the SQL **VIEW `scored_attempts`** (11 §8.3): a
  UNION over `speaking_sessions` / `writing_submissions` / `reading_attempts` /
  `listening_attempts` with uniform columns `attempt_id, profile_id, skill,
  mode (placement|mock|practice|micro), band, criteria_json, at`. §6 reads exclusively from this
  view; `speaking_sessions.mode` uses exactly this enum (11 §4.2), and the mode-based weights and
  half-life decay of §6.1 are applied in Python over it.

Sidecar API surface: the canonical route inventory is **18-api-contract.md §4.13** (all routes
under `/api/v1`, bearer-token loopback — R2-1): `GET/PUT /api/v1/profile` ·
`POST /api/v1/placement/{start,submit}` · `GET /api/v1/plan` · `POST /api/v1/plan/regenerate` ·
`POST /api/v1/plan/sessions/{id}/{start,complete,skip}` ·
`GET /api/v1/progress/{summary,trajectory,criteria,heatmap}` · `GET /api/v1/readiness` ·
`PUT /api/v1/readiness/{id}`.

## Open questions

1. **Placement→plan calibration**: the 8-question objective conversion table (§3) is an educated
   default; it needs empirical calibration against full-length in-app tests once real usage data
   exists. Who owns the calibration procedure — 14-testing-strategy.md or
   15-content-authoring-licensing.md?
2. **Half-life tuning**: 14 days is a guess balancing responsiveness vs stability. Should mocks use
   a longer half-life than drills (they're rarer), or does the ×2 base weight suffice?
3. **No-exam-date taper**: with a rolling 8-week horizon there is no taper phase. Should mocks be
   injected monthly instead, or only on demand?
4. **LLM-scorer drift vs trajectory**: if the user changes their configured LLM
   (03-providers-and-settings.md) mid-preparation, criterion scores may shift systematically and
   fake a trajectory jump. Do we annotate the trajectory chart with "model changed here" markers
   (cheap, honest — `band_estimates.model_id` already records it, 11 §8.2) or attempt
   renormalisation (complex)?
