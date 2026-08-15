# BandReady — Product Vision & Positioning

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read the [README](../../README.md) and [IMPLEMENTATION-STATUS.md](../IMPLEMENTATION-STATUS.md). Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.

_Status: draft v2 (2026-07-25)_

BandReady is an open-source (Apache-2.0), self-hosted desktop app for end-to-end IELTS-style exam preparation: all four skills (Speaking, Writing, Reading, Listening), spaced-repetition vocabulary, pronunciation feedback, and a guided curriculum from placement test to exam-ready — powered entirely by AI models the user chooses, local or cloud. It is a single-learner, local-first Electron + React app with a Python FastAPI sidecar that reuses the proven voice pipeline, provider abstraction, and design system of the sibling project OpenVoiceUI. The wedge feature is a live, low-latency voice examiner for Speaking practice — the one part of IELTS prep that is scarce, expensive, and anxiety-inducing to get from humans, and that no existing open-source project delivers end-to-end. This doc owns positioning, personas, competitive analysis, principles, metrics, naming, and v1 scope; architecture and module details live in 01-architecture.md through 16-roadmap.md.

## 1. Vision

**One-liner:** *Unlimited, private, exam-faithful IELTS practice with your own AI — on your own machine, forever free.*

**Elevator pitch:** An IELTS candidate today pays $30–150/month for AI prep apps that cover one or two skills, or $30–80/hour for human tutors, and every recording and essay they produce goes to someone else's server. BandReady is the first complete open-source alternative: install one desktop app, point it at any OpenAI-compatible model (a local MLX/Ollama model or a $0.50-a-month DeepSeek key), and get a full mock-test suite — a voice examiner that runs the real three-part Speaking interview, band-scored Writing feedback against the public descriptors, timed Reading and Listening tests in authentic formats, a vocabulary bank with spaced repetition, and a curriculum that tells you what to do each day until test day. No account. No subscription. No data leaves the device.

**What BandReady is:**
- A **complete practice environment**, not a chatbot wrapper: exam-faithful question formats, real timers, band-descriptor scoring, longitudinal progress tracking (10-curriculum-progress.md).
- **Model-agnostic**: one LLM + one STT + one TTS, any OpenAI-compatible endpoint (03-providers-and-settings.md). The app is the exam room; the user brings the examiner's brain.
- **A desktop app**: double-click install on macOS and Windows (Linux for free), Python sidecar bundled — no Docker, no terminal (13-packaging-distribution.md).

**What BandReady is not:**
- Not an official IELTS product, not affiliated with the IELTS Partners, and never claims its band estimates equal official scores (see §8 disclaimer).
- Not a content-piracy vehicle: all practice material is original, authored in IELTS format (15-content-authoring-licensing.md).
- Not a SaaS. There is no server, no telemetry-by-default, no accounts.

## 2. Why now

1. **Local models crossed the usefulness threshold.** An 8–14B instruct model on Apple Silicon (mlx-lm) or Ollama scores essays against published band descriptors credibly; Whisper-class STT is free and local; Kokoro TTS is fast enough for live conversation. In 2023 this required cloud APIs; in 2026 a mid-range laptop suffices.
2. **The voice stack is solved and in-house.** OpenVoiceUI already runs a production Pipecat 1.5 pipeline (SmallWebRTCTransport + Silero VAD) with sub-second turn-taking, including the five version-specific gotchas that sink naive implementations (02-voice-pipeline.md, `_context/openvoiceui-findings.md`). Competitors' OSS attempts die exactly here.
3. **The market is large and underserved.** ~4M IELTS tests are taken per year, concentrated in South/Southeast Asia, the Middle East, and Africa — regions where $1/hour of human tutoring is a luxury and $20/month subscriptions are meaningfully expensive. Free-and-local is not a gimmick there; it is the product.
4. **First-mover OSS window is open** (verified below, §4.3): the open-source field is a graveyard of single-skill student projects; no maintained, packaged, all-four-skills app exists.

## 3. Target personas

| # | Persona | Situation | Primary needs | BandReady answer |
|---|---------|-----------|---------------|------------------|
| P1 | **Academic candidate** ("Priya, 24, Hyderabad") | Applying to UK/CA/AU universities; needs overall 7.0, W ≥ 6.5; 8-week runway | Writing Task 1 (charts) + Task 2 feedback, speaking fluency under time pressure, score prediction | Full mock tests, per-criterion Writing feedback, curriculum with weekly band estimates |
| P2 | **General Training candidate** ("Marek, 35, Warsaw") | Skilled-migration visa (AU/CA); needs L/R/W/S minimums; works full-time | GT-specific formats (letters, GT reading), short daily sessions, offline commute practice | GT/Academic mode switch at profile level; 15-minute drill sessions; fully offline with local models |
| P3 | **Self-studier on a budget** ("Amina, 21, Cairo") | Cannot afford tutors ($25+/hr locally) or app subscriptions; has a laptop | Free, unlimited, private practice that doesn't feel like a toy | $0 with local models or ~pennies with DeepSeek/Groq keys; no trial walls |
| P4 | **Privacy-conscious / offline user** ("Chen, 29, restricted network") | Corporate laptop, sensitive about voice recordings, or unreliable/censored internet | Nothing leaves the machine; works without internet | 100% local pipeline (MLX/Ollama + whisper + Kokoro); airplane-mode capable |
| P5 | **Tutor / coaching center** ("Mr. Okafor, Lagos") | Runs small IELTS classes; wants tools students can use at home for free | Assignable practice, inspectable transcripts/essays with AI first-pass feedback | Free redistribution (Apache-2.0); exportable session reports; original content bank he can extend |
| P6 | **Speaking-anxious repeater** ("Yuki, 27, Osaka") | Passed R/L/W, failed Speaking twice; freezes with human examiners | Judgment-free unlimited interview reps, pronunciation diagnosis | Infinite-patience voice examiner, per-phoneme feedback (09-pronunciation-assessment.md), Part 2 cue-card drills |

P1 + P3 are the design center for v1. P5 is explicitly *not* served with any multi-user features in v1 (single learner, local profiles at most — locked decision), only via "install it on each student's machine."

## 4. Competitive landscape

### 4.1 Commercial apps

| Product | Skills covered | Model | Gaps BandReady exploits |
|---------|---------------|-------|--------------------------|
| **TalkFace AI** ([App Store](https://apps.apple.com/us/app/ielts-prep-app-talkface-ai/id6446065891)) | Speaking + Writing coach, mock tests | Subscription, cloud | Two skills only; data leaves device; recurring cost |
| **BAND9AI** ([site](https://band9ai.com/best-ielts-speaking-ai-tools)) | Timed speaking mocks, diagnostics | Subscription, cloud | Speaking-centric; closed; no local models |
| **SmallTalk2Me** ([site](https://smalltalk2.me/ielts)) | Speaking simulator + instant band score | Freemium, cloud | Speaking only; browser-based recording, not live conversation |
| **ELSA Speak** | Pronunciation drilling (phoneme-level) | Subscription, mobile | Pronunciation only — not IELTS-format practice; the benchmark for our 09-pronunciation-assessment.md quality bar |
| **TalkDrill** ([comparison](https://www.talkdrill.com/blog/compare/best-apps-for-ielts-speaking/)) | Conversational fluency practice | Subscription, cloud | General conversation, weak exam fidelity |
| **Official IELTS apps / IDP IELTS Prep** | Practice questions, info | Free/paid, official | No AI feedback loop, no adaptive curriculum, no speaking simulation |
| Magoosh / E2 / IELTS Liz-style courses | Video lessons + question banks | Course fee | Passive content, no interactive AI examiner |

Common pattern: **every commercial offering is cloud, subscription, and partial** (usually Speaking and/or Writing only). Nobody offers all four skills + SRS vocabulary + curriculum in one product, and by definition none is self-hostable.

### 4.2 DIY LLM chat workflows

The strongest "competitor" is ChatGPT/Claude with a prompt like "act as an IELTS examiner." It is free-ish and surprisingly good at Writing feedback. Its gaps define our feature bar:
- **No real-time voice interview** with interruptions, timing, and turn-taking (voice modes are conversational, not exam-structured, and can't run Part 2's timed 1-min prep + 2-min monologue).
- **No persistence**: no band history, no SRS, no curriculum, no placement test.
- **No exam fidelity**: no timed Reading passages with answer sheets, no Listening audio with section structure, no auto-marked question types.
- **Prompt burden**: the user must be their own exam designer every session.
BandReady productizes exactly this workflow: the same LLM the user would chat with, wrapped in exam structure, scoring rubrics, timers, and memory.

### 4.3 Open-source landscape and the first-mover claim

Verified 2026-07-25 via GitHub search ([topic: ielts](https://github.com/topics/ielts?o=asc&s=stars), [topic: ielts-speaking](https://github.com/topics/ielts-speaking?o=desc&s=stars)). The field is fragmented student projects, none packaged, none complete:

| Project | What it is | Why it isn't BandReady |
|---------|-----------|------------------------|
| [ielts-speaking-master](https://github.com/SazidulAlam47/ielts-speaking-master) | React app, record-then-feedback via Gemini | Speaking only; record-and-submit, not live voice; hardwired to Gemini; web app, not packaged |
| [IELTS-Speaking-Simulator](https://github.com/hubeiqiao/IELTS-Speaking-Simulator) | GPT-based Part 1/2/3 simulator | Speaking only; cloud-OpenAI only; no scoring history |
| [IELTS-Speaking-Practice-Tool](https://github.com/JoeXia77/IELTS-Speaking-Practice-Tool) | Web tool, GPT-4 suggestions | Speaking only; turn-based, no real-time voice |
| [IELTS_PracticeAndEvaluation](https://github.com/ZainabZaman/IELTS_PracticeAndEvaluation) | Four-module practice + band calc scripts | Closest in scope on paper; research-grade scripts, no app, no packaging, no live voice, unmaintained |
| [ieltstar](https://github.com/connectamey/ieltstar) | Online mock-test platform | Server-hosted multi-user platform, no AI examiner, no local models |
| [ielts-ai-dataset](https://github.com/LuchoBazz/ielts-ai-dataset) | AI-generated practice-test datasets (JSON/MD) | Content, not an app — potential *complement*; evaluate licensing in 15-content-authoring-licensing.md |
| Tauri local-first IELTS practice app (search result, JSON question packs) | Local desktop drills | No AI scoring, no voice pipeline, no curriculum; validates local-first demand |

**Refined first-mover claim (use this wording publicly):** *"BandReady is the first complete, packaged, open-source IELTS-style preparation app — all four skills with a live AI voice examiner, local-model support, spaced repetition, and a guided curriculum."* Do **not** claim "first open-source IELTS app" unqualified — single-skill OSS projects demonstrably exist. The defensible moats within OSS: (a) the working Pipecat live-voice pipeline (every OSS attempt above is record-then-upload, none does live conversation — this is exactly the hard part we already solved in OpenVoiceUI), (b) desktop packaging with bundled Python runtime, (c) an original, curated content bank, (d) the integrated curriculum loop.

## 5. The wedge: voice-first Speaking practice

Speaking is the wedge feature because it maximizes (pain × scarcity × our unfair advantage):

1. **Highest-anxiety, least-practicable skill.** Reading/Listening can be self-marked from a book. Writing feedback is a ChatGPT paste away. A realistic Speaking interview requires a partner — the one thing solo candidates don't have. P6 exists as a persona because of this.
2. **Structurally hard to fake.** The IELTS Speaking test is a *timed, three-part, interactive* interview: Part 1 (4–5 min, familiar topics), Part 2 (1 min prep + 1–2 min cue-card monologue), Part 3 (4–5 min abstract discussion). Turn-based record-and-submit tools cannot reproduce examiner follow-ups, interruptions, or time pressure. A live pipeline with sub-second VAD turn-taking can — and we have one running (02-voice-pipeline.md, 04-speaking-module.md).
3. **Our unfair advantage is precisely here.** The five Pipecat 1.5 gotchas (inert `TransportParams` VAD, hanging Smart Turn default, `initDevices()` ordering, ICE-PATCH routing, `min_volume` default blocking speech) are silent-failure landmines that killed or capped every OSS attempt at live voice. OpenVoiceUI's `TranscriptObserver` gives us clean per-turn transcripts as scoring input, and its RAG-injection pattern (`build_messages()`) injects cue cards and rubric fragments mid-session without prompt accumulation.
4. **It demos irresistibly.** "Open the app, talk to an examiner, get a band estimate in 12 minutes" is the GitHub-README GIF and the conference demo. Reading drills are not.

Sequencing consequence for 16-roadmap.md: Speaking + its scoring loop ships first and defines the quality bar; Writing second (highest feedback value per token); Reading/Listening third (content-bank-bound); Vocabulary/SRS and curriculum weave throughout.

## 6. Product principles

1. **Local-first, cloud-optional.** Every feature must work with a fully local stack (MLX/Ollama + whisper + Kokoro). Cloud endpoints are a performance/quality upgrade, never a requirement. If a proposed feature can't work offline, it needs an exception argued in its doc.
2. **Bring-your-own-model, one of each.** Exactly one LLM + one STT + one TTS via OpenAI-compatible endpoints (locked decision; 03-providers-and-settings.md). No multi-agent config sprawl. The app detects installed engines and offers guided one-click setup.
3. **No accounts, no server, no telemetry-by-default.** Single learner, all data in the local SQLite DB (11-data-model.md). Optional local profiles at most. Any future opt-in telemetry must be off by default and documented.
4. **Exam-faithful formats.** Question types, timing, section structure, and answer-sheet conventions match the real test (each module doc owns its formats). Practice that doesn't transfer to test day is a toy.
5. **Honest scoring.** Band estimates are always labeled as estimates, shown with the criterion breakdown (e.g. Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation), and never presented as predictions of official results. Calibration approach lives in 14-testing-strategy.md.
6. **Original content only.** Formats and public band descriptors are usable; past-paper content never is (15-content-authoring-licensing.md).
7. **Runs on modest hardware.** Default local-model recommendations must run on an 8 GB M1 / 16 GB Windows laptop; degrade gracefully (e.g. smaller whisper model) rather than gate features.
8. **Boring, proven tech.** Reuse OpenVoiceUI's verified patterns (pipeline params, lockfile atomics, token'd sidecar, design tokens) before inventing anything (01-architecture.md).

## 7. Success metrics

No telemetry in v1, so metrics split into observable-publicly and measurable-locally (surfaced to the *user*, and to us only via opt-in report sharing):

**Adoption (public):**
- GitHub stars: 1,000 in 3 months post-launch, 5,000 in 12 months (default targets; comparable dev-tool launches used as prior).
- GitHub release downloads: 10k in 6 months across macOS+Windows.
- ≥ 25 external contributors and ≥ 10 community-contributed content packs in year one.

**Engagement proxies (local analytics dashboard, shown to the user in 10-curriculum-progress.md):**
- Activation: % of installs that reach a **first speaking session within 20 minutes of install** — placement is deferrable (R2-14: the onboarding wizard, owned end-to-end by 10-curriculum-progress.md, lets the learner skip or defer placement, falling back to self-assessed levels per skill). Instrumentable only via opt-in.
- Retention proxy: median study-days per week for users who file feedback/issues with attached (voluntary) progress exports.
- Mock-test completion: full 4-skill mock completed by week 4 of the curriculum.

**Quality (measurable in CI, 14-testing-strategy.md):**
- Scoring calibration: LLM band scores within ±0.5 of expert-rated reference essays/transcripts on our internal calibration set, for the default recommended cloud model; within ±1.0 for the default local model.
- Voice pipeline: **< 1.5 s p50 examiner response** latency (user stop-speaking → TTS start) on reference hardware, matching 02-voice-pipeline.md's latency budget (R2-15); zero regressions on the five-gotchas E2E harness (reuse OpenVoiceUI's `eval/` headless WebRTC harness).

**Anti-metrics:** no DAU-maximization mechanics (streak guilt, notification spam). Success is the user *leaving* — passing their exam.

## 8. Naming

Constraints: must not contain "IELTS" (jointly registered trademark of British Council, IDP Education, and Cambridge University Press & Assessment — [copyright & trade mark statement](https://ielts.org/legal/ielts-copyright-and-trade-mark-statement), [US registration](https://www.trademarkelite.com/trademark/trademark-detail/76688547/IELTS)); nominative fair use only — we may *describe* the app as "IELTS-style exam preparation" but may not imply affiliation or endorsement, and prominent use of the mark in the product name or logo is out. Must be pronounceable globally (users are predominantly L2 English speakers), have an available GitHub org name, and ideally a free `.app`/`.dev` domain.

| Candidate | For | Against | Verdict |
|-----------|-----|---------|---------|
| **BandReady** | Says the outcome ("band" is the universal IELTS score word among candidates); no trademark conflict; easy to say in any accent; `bandready.app` style domains plausible | "Band" collides with music apps in app-store search; slightly generic | **Recommended — adopt as final** (default decision) |
| Band9 / NineBands | Aspirational, instantly understood by candidates | Band 9 is unattainable for most — sets a scammy tone; "9" digit awkward in package names | Reject |
| ExamRoom | Evokes the faithful-simulation positioning | Generic across all exams; weak SEO; sounds proctoring-related | Reject |
| Fluently / FluentPrep | Warm, speaking-first | Trademark-crowded space (multiple "Fluently" apps exist); covers only one skill connotation | Reject |
| OpenIELTS | Maximum clarity + OSS signal | **Contains the mark — legally untenable**, exactly what the trademark holders police | Reject (listed to record why) |
| Bandwidth→"Bandwit" | Playful | Cute-only; confusing | Reject |
| LinguaBand | International flavor | Clunky; harder to pronounce for target users | Reject |

**Decision (default, flagged):** ship as **BandReady**. Do a proper trademark clearance search (WIPO Global Brand DB + USPTO + UKIPO for classes 9/41) before the public launch — and **before embedding the name any further** (it already appears in appIds, data-dir names, and pack IDs; a late rename touches installers, data-dir migration, and update channels — 17-review-findings.md R8). Tracked as an open question.

**Mandatory disclaimer** — verbatim text, to appear in the README, the app's About screen, and the website footer (15-content-authoring-licensing.md owns placement rules and localization):

> BandReady is an independent open-source project and is not affiliated with, endorsed by, or connected to the IELTS Partners (British Council, IDP: IELTS Australia, and Cambridge University Press & Assessment). IELTS is a registered trademark of its owners, used here only to describe the exam format this software helps you prepare for. All practice materials in BandReady are original and are not official IELTS test content. Band scores produced by this software are AI-generated estimates for practice purposes only and do not predict official IELTS results.

Usage rules that follow: "IELTS" never appears in the app name, logo, package IDs, or domain; in UI copy prefer "IELTS-style" on first mention per screen; never reproduce IELTS logos; never use the phrase "official" near the mark.

## 9. Scope: v1 vs explicitly out of scope

**v1 in scope** (elaborated in module docs; sequencing in 16-roadmap.md):
- Speaking: live voice examiner, full 3-part interview + single-part drills, transcript + per-criterion band feedback (04, 09).
- Writing: Task 1 (Academic chart/GT letter) + Task 2 essays, timed editor, per-criterion feedback with inline annotations (05).
- Reading & Listening: timed tests in authentic question formats from the original content bank; auto-marking (06, 07); Listening audio generated via the configured TTS.
- Vocabulary bank + SRS, fed by the learner's own errors (08).
- Placement test → guided curriculum → progress dashboard with band-trend charts (10).
- Academic and General Training modes.
- One-LLM/one-STT/one-TTS settings page with engine detection and guided local setup (03).
- macOS (Apple Silicon) + Windows installers; Linux best-effort (13).
- English UI only.

**Explicitly OUT of v1** (and where the decision is revisited):
- **No human-tutor marketplace or tutor tooling** — conflicts with local-first/no-server; revisit only as a separate open-core product, not in this codebase.
- **No mobile apps** — ADR-001 locked Electron; RN has no viable Pipecat path. Revisit post-v1 at the earliest.
- **No accounts, cloud sync, or multi-user server deployment** — locked decision. Local export/import of the data directory is the v1 "sync."
- **No other exams** (TOEFL, PTE, CEFR, Duolingo English Test) — architecture should not preclude them (keep exam-format assumptions in content/config, not code, per 11-data-model.md), but zero v1 UI.
- **No community content marketplace/registry in-app** — v1 supports side-loading content packs as files; a registry is post-v1 (15).
- **No gamification beyond honest progress tracking** — see anti-metrics.
- **No web/SaaS deployment target** — the sidecar binds loopback-only by design.
- **No official-score integrations or "guaranteed band" claims** — ever.

## Open questions

1. **Trademark clearance for "BandReady"** — needs a real search (WIPO/USPTO/UKIPO, classes 9 & 41) and a check for existing prep products of the same name before the name is announced anywhere public.
2. **Opt-in feedback channel** — with no telemetry, do we ship an explicit "share my anonymized progress stats" action in v1 to get calibration data, or rely purely on GitHub issues? (Leaning: ship it, off by default; needs a privacy write-up in 15.)
3. **Star/download targets sanity check** — the §7 numbers are defaults chosen from comparable OSS launches; revisit after the repo is public and the README demo exists.
4. **`ielts-ai-dataset` reuse** — its AI-generated practice sets could bootstrap our content bank if license and quality pass review (15-content-authoring-licensing.md owns the audit).
