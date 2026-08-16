# 00 — RECOMMENDATION: what BandReady ships for pronunciation

**Decision document. Written 2026-08-01.** Reads the three briefings in this directory
(`01-models.md`, `02-accent-fairness.md`, `03-exercise-design.md`) and the code in
`sidecar/bandready/pron/`, and picks one path.

**Confidence key.** `[V]` verified by me in this repo today, command or file:line given.
`[B]` carried from a briefing that marked it verified/measured — I did not re-derive it.
`[?]` could not verify.

---

## 1. The decision

### Ship no new pronunciation model. The one model we pay for is the one already on disk.

| Field | Value |
|---|---|
| **Repo id** | `Systran/faster-whisper-base` (CTranslate2 conversion of `openai/whisper` `base`) |
| **Licence** | MIT on the upstream openai/whisper code **and** weights `[B]`. The Systran conversion's own model-card declaration is **`[?]` — unverified**, huggingface.co was unreachable from the research environment. Someone must read that card before it is quoted in `LICENSE` or an about-box. |
| **Parameters** | 74 M `[B, openai/whisper README size table]` |
| **Disk** | 141 MB measured in the HF cache `[B]`; the manifest already declares `approx_mb: 145` `[V, routes/models.py:104]` |
| **Runs on CPU** | Yes. `WhisperModel(size, device="auto", compute_type="int8")` — int8 CTranslate2, no GPU anywhere in the path `[V, pron/analyze.py:197-199]` |
| **Already in the manifest** | Yes — `_whisper("base", "Systran/faster-whisper-base", 145)` `[V, routes/models.py:104]` |
| **New bytes the user downloads** | **Zero.** It is the configured STT default already `[V, settings_store.py:63-72]` |

The thing we build is not a model. It is: **the perception drills, which are already
implemented end-to-end and unreachable, plus a fairness gate, plus deleting the score the
proxy currently invents.**

### Why this is the right call and not a cop-out

Five facts, in the order that decides it.

**1. The shipped app cannot transcribe at all today.** `scripts/stage-sidecar.mjs:105-107`
installs the sidecar with the `[voice]` extra **only when `--voice` is passed**, and
`faster-whisper` lives in that optional extra `[V, sidecar/pyproject.toml:25-29]`. I checked
both built trees:

```
build/sidecar-venv/.../site-packages/                       → no faster_whisper
dist-electron/mac-arm64/BandReady.app/.../site-packages/    → no faster_whisper
```

`[V]` This closes `03-exercise-design.md` §11's open question #3. The median DMG user has
**no STT**, so `transcribe_words()` returns `([], "")`, so `words_from_transcript()` fabricates
timing-free words, so every fluency proxy is `available: False` and every word carries
`confidence: None`. Buying a 320 MB phoneme model to sit on top of a 141 MB ASR that is not in
the build is out of order by two steps.

**2. Nothing calls any of it.** Ten routes exist under `/api/v1/pron`; the renderer contains
exactly one reference to the string, and it is a comment in `useRecorder.ts:5` `[V]`. There
is no UI to regress and no user expectation to protect. A fairness gate built before the first
learner sees a pronunciation number is the only version of that gate that is cheap.

**3. The GOP path's honest operating point is "say nothing".** At the MCC-optimal threshold on
speechocean762, GOP_DNN precision is **0.333** — two of every three flags were not judged
mispronunciations by five human experts `[B, Parikh et al. Interspeech 2025]`. Tuned for the
precision a learner-facing tool needs (≥ 0.7, per `02` §5.6), recall collapses and the feature
mostly returns nothing. And the false positives are not random: they concentrate on
/ð/→/d/, /θ/→/s/, /æ/→/e/, /eɪ/→/eː/ `[B]` — the documented transfer set of Tamil, Hindi,
Sinhala and Mandarin speakers, i.e. this app's users. **We would spend weeks and 320 MB to buy
a flagger that fires hardest on the people it was built for.**

**4. The scalar GOP that `docs/plan/09` §4.3 specifies tops out at PCC ≈ 0.43–0.45 at phoneme
level** `[B, arXiv:2507.16838 Table III]`. Reaching 0.58–0.65 needs the GOP *feature vector* fed
to a trained SVR or GOPT — a second project with a 520 MB calibration corpus attached, and that
corpus is **L1-Mandarin only** `[B, OpenSLR 101]`. The first version of the expensive path is
worse than the number `09` §4.5 currently promises.

**5. The one metric in the whole module with zero accent bias is already written and cannot be
selected.** `pron_drill_attempts`, `minimal_pairs()`, `WORD_STRESS_ITEMS`, `drill_items()`,
`contrast_accuracy()` — all present `[V, pron/analyze.py:870-1077]`, three routes exposing them
`[V, routes/pron.py:252-341]`, 26 built-in pairs plus 20 pack pairs `[V, wc -l
content/core-en/data/pron_pairs.jsonl = 20]`, and **no screen renders any of it**. A forced
choice on *listening*, scored against an authored key, is unbiased by construction: the
learner's own accent never enters the measurement. That is the primary Pronunciation evidence
we should have been shipping, and it costs a React screen.

### The model we would buy, when we buy one

Stated now so the deferral is a decision and not a drift. If the trigger in §7 fires:

| Field | Value |
|---|---|
| **Repo id** | `facebook/wav2vec2-xlsr-53-espeak-cv-ft` |
| **Licence** | **apache-2.0** `[B, HF API]` — compatible with this repo's `LICENSE` |
| **Parameters** | ~316 M — derived from 1263.5 MB ÷ 4 bytes; the HF API exposes no safetensors header for this checkpoint `[B]`. Corroborated by `vitouphy/wav2vec2-xls-r-300m-timit-phoneme` reporting 315,483,820 params at 1262.0 MB |
| **Disk** | 1263.5 MB fp32 as published; **~320 MB after self-exporting to int8 ONNX** with `op_types_to_quantize=["MatMul"]` `[B, measured]` |
| **Runs on CPU** | Yes, and CPU is the *correct* provider: CoreML supports 169 of 643 nodes across 121 partitions and is **measurably slower** than plain CPU in both fp32 and int8 `[B, measured on M5]`. ~0.68 s per 10 s of audio, int8, 4 threads |
| **Ships as** | Nothing you can download — there is no maintained ONNX export of this checkpoint on the Hub `[B]`. We export and host it ourselves |

**Why it beats the runners-up**, on the four axes that bind here:

- `torchaudio.pipelines.MMS_FA` and `facebook/mms-300m` — **CC-BY-NC-4.0** `[B]`. Non-commercial
  weights in a permissively licensed app. Not a close call; `docs/plan/09` §2(b) names `MMS_FA` without
  noticing this and must be corrected.
- `charsiu/en_w2v2_fc_10ms` (~94 M, 377.7 MB) — **no licence on the weights at all**, repo dead
  since 2022-09-19 `[B]`.
- `microsoft/wavlm-large` (~316 M, 1262.0 MB) — **no licence field on the model card** `[B]`.
- Montreal Forced Aligner 3.4.1 (MIT, `english_mfa` 92.2 MB) — needs Kaldi binaries from
  conda-forge, not pip-installable into the sidecar `[B]`.
- Azure Pronunciation Assessment — **no container exists**, and Speech containers "aren't
  licensed to run without being connected to Azure for metering" `[B, verbatim]`. Architecturally
  unavailable offline at any price. It is a dev-machine yardstick, not an option.
- `bookbot/wav2vec2-ljspeech-gruut` — apache-2.0, **94,406,317 params, 377.7 MB**, CPU yes `[B]`.
  The genuine Tier-2 alternative, and the one to spike **if** the espeak/GPL question in §6
  turns out to matter, because gruut is MIT and espeak-ng is GPL-3.0. Trained on LJSpeech: one
  native speaker. Unevaluated by anyone here.
- `facebook/wav2vec2-lv-60-espeak-cv-ft` — apache-2.0, ~316 M, 1263.5 MB, identical 392-token
  vocab `[B]`. A free A/B if we ever integrate; identical code path.

The espeak checkpoint wins because its output vocabulary *is* espeak's phone set, so an espeak
G2P matches the recogniser's inventory by construction — no ARPAbet↔IPA mapping table sitting
under every score. That advantage is real and it is the only reason to prefer 1263 MB of
weights over 377 MB.

---

## 2. What the learner gets — in the words they would see

Four surfaces. All of them work with `faster-whisper base` or, for the first two, with no model
at all.

### 2.1 Sound check (the perception drill — primary evidence, needs no microphone)

> ### Which one did you hear?
> **A** ship  **B** sheep
>
> *(after 10 items)*
>
> **You heard 7 of 10.**
> Your ear for **ɪ–iː** (ship / sheep) is still settling. That contrast changes meaning in
> real sentences, so it is worth ten minutes.
> **θ–s** (think / sink): 9 of 10 — solid.
>
> IELTS accepts every accent. These scores measure how clearly each sound comes across — not
> how British or American you sound.

### 2.2 Read this aloud (needs the recogniser)

> ### Read this out loud
> "Most of the delays stem from a shortage of qualified drivers."
>
> 🎤 **Record · 12s**
> Say it however you say it. We check the words, not the accent.
>
> *(after)*
>
> **We heard:** "Most of the delays stem from a shortage of qualified drivers."
> **All nine key words came through.** ✓
> [ That's not what I said ]

And when a word does not come through:

> **We heard:** "Most of the delays stem from a shortage of *quality* drivers."
> **qualified** was heard as **quality**. That changes the meaning, so it is worth a second
> go. → Practise the **-fied / -ity** ending
> [ That's not what I said ]  [ Say it again ]

And when the learner's L1 is set and the pattern is expected:

> You produce **think** with a /t/ sound rather than /θ/. Tamil doesn't have a dental
> fricative, so /t/ for /θ/ is expected — listeners understand you and IELTS does not mark it
> down. If you want to add /θ/ to your range, here's how it's made.

### 2.3 Your own baseline (not a score)

> **Clearer than your first week.**
> More of your words are coming through first time than they were in early July.
> 8 words in 10 → 9 words in 10.
>
> We never compare you to other learners or to a native speaker. We compare you to you.

### 2.4 What Band 8 actually says (shown once, on first visit)

> **Band 8: "is easy to understand throughout; L1 accent has minimal effect on
> intelligibility."**
>
> The word "accent" appears exactly once in the whole IELTS Pronunciation scale, and it appears
> at the second-highest band as something you are *expected* to have. Nothing in the scale
> mentions British, American, or sounding native. `[B, two official PDFs cross-checked]`

### And what it never says

Hard-banned in UI copy, in prompts, and in model output (post-filtered, not merely instructed):
*native, native-like, non-native (as a judgement), correct accent, proper pronunciation, standard
accent, British/American as a target, accent-free, reduce your accent, heavy accent, broken
English, you mispronounced,* any numeric accent score, any percentile against other users.
"You mispronounced X" is always replaced by "X was heard as Y" — that is what the system
actually observed, and it is the same evidence the examiner uses.

---

## 3. Integration plan against the code that exists

### 3.1 `sidecar/bandready/pron/analyze.py` — five changes

**C1 — Delete the invented score.** `score_from_confidence()` (line 396) maps faster-whisper's
`word.probability` to 0–100. That field is the decoder's next-token softmax probability
`[B, read from the installed faster_whisper source]` — it measures *lexical predictability*, not
acoustic realisation. It goes **down** when a learner uses a rarer word and **up** when a clean
phoneme substitution produces a real word ("ship"→"sheep" is transcribed confidently as
"sheep"). The module already knows this: `pron_signals()` line 830 writes
`"score": None,  # proxy-v1: an ASR confidence is not a pronunciation score`. Make the rest
agree.

- `score_from_confidence()` → delete. `build_turn_result()` sets `score=None` for `METHOD == "proxy-v1"`.
- `WordScore.as_wire()` (line 114): `level` already returns `None` when `score is None`
  (line 129-133) — this is free, no edit needed. Add `"confidence"` is already there; keep it.
- `_persist_scores()` (line 582) and `persist_standalone()` (line 627): write the confidence
  into **`phone_detail_json`**, which is a nullable TEXT column on `pron_scores`
  `[V, db/models.py:919; migrations/versions/0001_baseline.py:767]` that proxy-v1 currently
  always writes as `None`. `02` §5.1 asks for a new `evidence_json` column; **it is not needed
  for v1** — reusing the existing nullable column avoids an Alembic migration against a live
  SQLite file. Payload: `{"asr_confidence": 0.42, "engine": "faster_whisper", "model": "base"}`.
  Rename to `evidence_json` in the same migration that lands v2's real phone detail, when there
  will be a migration anyway.
- `session_aggregates()` (line 675): `mean_score` and `pct_words_red` → `None` when
  `method == "proxy-v1"`. They are means over a number that no longer exists.

**C2 — `word_was_recovered()`, the aligner.** ~40 lines of token-level Levenshtein between
`reference_text` and the hypothesis, returning a per-reference-token boolean plus the substituted
token. This is the *only* new algorithm in the whole plan. It replaces `overall` and
`words_to_work_on` on the read-aloud route (see §3.3) and it is gate G1's recovery test.

**C3 — The fairness gate.** New `sidecar/bandready/pron/fairness.py`, ~150 lines, pure function,
no I/O:

```python
def classify(obs: Observation, l1: str | None, history: OccurrenceCounts) -> Verdict
# -> "accent_feature" | "intelligibility_risk" | "insufficient_evidence"
```

Gate order, first hit wins (from `02` §5.3): **G0** fewer than 3 occurrences in the last 5
sessions → `insufficient_evidence`. **G1** L1 set, (expected, observed) in the L1 table, and the
word was recovered → `accent_feature`. **G2** `fl_tier == "low"` → `accent_feature`. **G3**
substitution rate ≥ 0.80 with a single stable alternant → `accent_feature` (Jenkins' criterion:
consistent variation is an accent). **G4** word not recovered, or `fl_tier == "high"` →
`intelligibility_risk`. **G5** default → `insufficient_evidence`, render nothing.

**C4 — The L1 table.** New `content/core-en/data/l1_variation.jsonl`, loaded through the existing
`load_pack_jsonl()` path that `minimal_pairs()` already uses `[V, analyze.py:977-983]`. Ships
`ta` (Tamil), `hi` (Hindi), `ar` (Arabic), `zh` (Mandarin) populated from cited sources, and
`si` (Sinhala) as **`{"status": "unpopulated", "substitutions": []}`** — no fetchable
peer-reviewed Sinhala learner-transfer source was found `[B]` and guessing one is worse than an
empty row, because G1 fails open (skipped) and G2/G3 are L1-independent.

`profile.l1` storage: **there is no `l1` column on `profiles`** `[V, db/models.py:150-180]`.
Do **not** add one. Put it in the `settings` KV table through `settings_store` — a new
`"learner"` slot alongside `llm`/`stt`/`tts` — so this needs no migration.

**C5 — `FLAG_PROMPT` (line 66).** Append the four paragraphs from `02` §6.4 verbatim: the L1
expected-variation summary, the meaning-at-risk restriction, the low-functional-load never-flag
list (th/s, th/t, th/d, v/z, dark-l, r-colouring), and the closing line *"Prefer returning an
empty list. An empty list is a good answer."* The existing `MAX_FLAGGED = 8` reads to a small
model as a quota to fill. Post-filter the output against the §2 banned-word list — instructing
is not enforcing.

**Not changed:** `fluency_proxies()` (line 293) is computed from timings, not confidences, and
is defensible as Fluency-and-Coherence evidence. `transcribe_words()` keeps `vad_filter=False`
(line 229) — that default is deliberate for the pron module; the answer-transcription path in
`03` gets a new *parameter*, not a changed default.

### 3.2 The model download entry

**It already exists and needs no change.** `routes/models.py:104`:

```python
_whisper("base", "Systran/faster-whisper-base", 145)
# expands to:
{"id": "faster-whisper-base", "kind": "stt", "engine": "faster_whisper",
 "label": "Whisper base (CTranslate2)", "dest": "whisper/base",
 "hf_repo": "Systran/faster-whisper-base", "approx_mb": 145,
 "files": [model.bin, config.json, tokenizer.json, vocabulary.txt]}   # sha256: None
```

Two things to do to it, neither of which is a new artifact:

1. **Pin the sha256s.** Every file in the built-in manifest carries `"sha256": None`
   `[V, routes/models.py:66-84]`, and the module's own docstring says an unpinned file
   "downloads with a warning in `detail` instead of silently pretending it was verified". Run
   `scripts/pin_model_hashes.py` at release time — the manifest header already declares
   `"pinned": False`.
2. **Decide the `--voice` flag.** `scripts/stage-sidecar.mjs:105-107` omits the extra by default
   and the shipped app has no `faster_whisper` `[V]`. Either build with `--voice` (the script
   says it adds "roughly 2-3 GB", because the extra pulls all of
   `pipecat-ai[silero,webrtc,openai,whisper,kokoro]`), or ship without it and let the capability
   probe below tell the truth. **Recommendation: ship without it and fix the probe.** A 2–3 GB
   DMG to make a 141 MB model reachable is the wrong trade, and `models_local.py` already adopts
   an existing HF cache by hard link when one is present.

For the deferred espeak model, the entry it would eventually take — recorded so nobody
re-invents it — is a self-hosted release asset, not an HF path, because no maintained ONNX
export exists `[B]`:

```python
{"id": "pron-gop-espeak-int8", "kind": "pron", "engine": "onnxruntime",
 "label": "Pronunciation phone model (int8)", "dest": "pron/espeak-int8",
 "approx_mb": 320,
 "files": [{"name": "w2v2_espeak_int8.onnx", "size": None, "sha256": "<pinned at release>",
            "url": "<github release asset>"},
           {"name": "vocab_norm.json",  ...},   # 392-token map + the English max_q allow-list
           {"name": "calibration_v1.json", ...}]}  # with an l1_offsets: {} map from day one
```

### 3.3 The ten routes — what the new UI calls, and what has to change

| # | Route | Verdict |
|---|---|---|
| 1 | `POST /pron/analyze` | **Duplicate.** Same body as #2 with `session_id` in JSON. Leave it; **the UI must not call it.** |
| 2 | `POST /pron/sessions/{id}/analyze` | **As-is.** The one the UI calls. Returns a 202 job id. |
| 3 | `GET /pron/sessions/{id}` | **Change.** Correct by construction once C1 lands — `score` NULL ⇒ `level` NULL ⇒ words render neutral `[V, analyze.py:768-773]`. But `aggregates` must stop carrying `mean_score` / `pct_words_red` (C1). |
| 4 | `GET /pron/sessions/{id}/signals` | **Change, one line.** `pron_signals()` returns bare `{"available": False}` when there are no rows `[V, analyze.py:812]` — the only pron response in the file with **no `accent_notice`**. Add it. (This corrects `02` §6.3, which says the route lacks it entirely; it carries it on the happy path.) |
| 5 | `GET /pron/scores` | **Change, substantively.** `worst_words()` filters `WHERE score IS NOT NULL` `[V, analyze.py:791]`, so after C1 it returns `[]` and the route's headline surface silently empties. Replace with worst-*recovery* words from the C2 aligner plus the LLM flags, ordered by occurrence count, gated by C3. |
| 6 | `POST /pron/read-aloud` | **Change, substantively.** `overall` is a mean of the deleted scores and `words_to_work_on` filters `score < BAND_AMBER` `[V, routes/pron.py:230-242]` — both become `None`/`[]` after C1. Rebuild both on `word_was_recovered()` (C2). **This is the route the read-aloud screen lives on.** |
| 7 | `GET /pron/drills` | **As-is.** Add one optional `l1` query param that *reorders* by `promote_contrasts`/`demote_contrasts`. It must never hide a contrast — a learner who wants to drill θ still can. |
| 8 | `POST /pron/drills/{item_id}/attempt` | **As-is.** The one the UI calls. |
| 9 | `POST /pron/drills/results` | **Duplicate** of #8 with the id in the body. Leave it; the UI must not call it. |
| 10 | `GET /pron/contrasts` | **As-is.** Powers the "your ear" panel in §2.1. |
| **NEW** | `GET /pron/capabilities` | **Required, and it is item 1 in the build order.** `{"stt": {"available": bool, "engine", "model", "loaded", "reason"}, "accent_notice": ...}`. It must distinguish *not installed* from *installed, weights not downloaded* — `_load_whisper()` already tries `local_files_only=True` then `False` `[V, analyze.py:195-203]`, and on a slow connection those are different sentences for the learner. **Nothing may draw a microphone button before this returns `available: true`.** Given §1 fact 1, on today's build it returns `false`. |

So: **4 routes usable as-is by the new UI** (2, 7, 8, 10), **4 that need changing** (3, 4, 5, 6),
**2 duplicates to leave alone and never call** (1, 9), **1 to add** (capabilities).

### 3.4 What the UI calls

Two screens, in this order.

**Screen A — Sound check.** `GET /pron/drills?type=minimal_pair_ab&limit=10` →
render A/B → `POST /pron/drills/{item_id}/attempt` per item → `GET /pron/contrasts` for the
summary panel. **Needs no microphone, no STT, no LLM, no download.** It works on today's DMG,
unmodified, right now. Build it first.

**Screen B — Read aloud.** `GET /pron/capabilities` first; if `available: false`, render the
Settings line ("Speaking practice needs the speech recogniser. It is a 141 MB one-time
download.") and **do not render the microphone** — not disabled, not rendered. Otherwise
`useRecorder` (`app/src/components/practice/useRecorder.ts`, 131 lines, one existing caller at
`DrillRunner.tsx:57` `[B]`) → `POST /pron/read-aloud` multipart → render transcript **before**
verdict, with **"That's not what I said"** beside it, always.

Two notes carried from `03` that will otherwise cost a day each: the blob `useRecorder` returns
is **WebM/Opus on Chromium despite the `.wav` field name and suffix** — faster-whisper decodes
it through PyAV's bundled FFmpeg so it works, but `soundfile` (a core dependency
`[V, pyproject.toml:21]`) cannot read it, and `wav_duration_ms()` (line 325) calls `sf.info()`
and will silently return `None`. And the microphone permission is already granted at the
Electron layer `[B, main.ts:139-152]`, so a denial on macOS is almost always the OS-level TCC
toggle and the banner should say so with the actual path.

---

## 4. Accent fairness as testable assertions

Not prose. Each line is one test, in `sidecar/tests/test_pron_fairness.py` unless noted. A build
that cannot run these does not ship the pronunciation feature.

**A1.** For every row in `pron_scores` where `method = 'proxy-v1'`: `score IS NULL`.
*Property test over a generated session; also a direct SQL assertion after `analyze_session()`.*

**A2.** `"score_from_confidence"` does not appear in `sidecar/bandready/` after C1.
*A grep test. It is the cheapest possible regression lock on the highest-severity defect.*

**A3.** For a fixed synthetic observation set `O` and every shipped L1 code `X` in
`{ta, hi, ar, zh, si}`: `len(flags(O, l1=X)) <= len(flags(O, l1=None))`.
*Setting your first language can only ever reduce the number of flags. This is the core
fairness invariant and everything else is commentary.*

**A4.** For every observation whose contrast has `fl_tier == "low"`: the emitted `level` is not
in `("warn", "poor")`, and `classify()` does not return `"intelligibility_risk"` on the strength
of `fl_tier` alone.

**A5.** Given 10 of 10 occurrences of /θ/→/t̪/ with the word recovered each time,
`classify(...) == "accent_feature"`. Given 4 of 10 with three different alternants,
`classify(...) != "accent_feature"`.

**A6.** Given fewer than 3 occurrences of any observation in the last 5 sessions,
`classify(...) == "insufficient_evidence"` and the rendered output is the empty list.

**A7.** `classify()` never returns `"intelligibility_risk"` when `word_was_recovered()` is
`True` **and** `fl_tier != "high"`. *An L1-typical substitution that still lands the right word
is, by definition, intelligible.*

**A8.** Every response body from every route on `routes/pron.py` contains a non-empty
`accent_notice`, **including error and empty-state branches**. *Today this fails for
`GET /sessions/{id}/signals` when there are no rows `[V, analyze.py:812]`.*

**A9.** No identifier anywhere under `sidecar/bandready/pron/` or in any pron API response key
matches `^accent` except the literal `accent_notice`. *No field may be named `accent_score`,
`accentedness`, `nativeness`.*

**A10.** Concatenate every user-facing string reachable from the pron module, the pron routes,
`FLAG_PROMPT`, and the LLM flagger's **output** (post-filter, not just the prompt), and assert
none matches the banned list in §2. *Case-insensitive, word-boundary. Fails the build.*

**A11.** The pipeline returns zero flags for a clean session without raising and without
rendering an empty state that implies failure. *Silence is the correct output far more often
than the current code assumes.*

**A12.** No function under `sidecar/bandready/pron/` computes a spectral, DTW, MCD or any other
distance between learner audio and a TTS reference voice. *A grep test on `kokoro`, `dtw`, `mcd`
inside the pron package. Scoring against one synthetic voice's acoustics is the nativeness
principle in numeric form.*

**A13.** No cross-user comparison exists: no percentile, no cohort, no leaderboard. Every
user-facing number is either a delta against the same `profile_id`'s own baseline, or a
perception-drill accuracy where an authored correct answer exists.

**A14.** *(Applies to `03`'s grammar/vocabulary speech path, and it is the accent rule as one
assertion.)* Feed the grading path a transcript containing a correctly built target structure
with three unrelated words wrong → **passes**. Feed it a transcript with the target structure
wrong and every other word perfect → **fails**. Neither path reads `confidence`, `avg_logprob`,
`no_speech_prob`, `low_confidence_words`, or `fluency_proxies`.

**A15.** A Gate-0 failure (silence, sub-700 ms take, whole-transcript hallucination match)
writes **no** review row and leaves the card's schedule byte-identical. *A microphone failure is
not a memory failure; writing rating 1 for one corrupts FSRS's difficulty estimate with a fact
about the hardware.*

---

## 5. What the learner is told when we cannot do it

Because §1 fact 1 means this is the *default* path today, not an edge case.

- **No recogniser installed:** the microphone is not rendered at all. One Settings line:
  *"Speaking practice in Grammar and Vocabulary needs the speech recogniser. It is a 141 MB
  one-time download."* A greyed-out button the learner cannot fix is worse than no button.
- **Recogniser present, no LLM:** the read-aloud recovery check and every perception drill work
  completely; only the flagger goes quiet. Say nothing about it.
- **Microphone denied:** fall back to the perception drill *on the same contrast*, remember the
  denial for the session, and stop offering microphone exercises until the learner retries.
  Asking on every third card is how an app gets its permission permanently revoked.
- **Nothing was heard:** *"We didn't catch that one — the recording came through empty. Try
  again?"* Never *"you were unclear."* Gate 0's only two outputs are *heard* and *we failed*.

---

## 6. Risks, and what I could not verify

**Risks I am accepting on purpose**

1. **This ships less than `docs/plan/09` promises.** No per-word 0–100, no heatmap colours, no
   GOP. Someone will read the plan, read the app, and file a bug. The mitigation is to correct
   `09` in the same PR — `01` §9 already lists sixteen specific corrections, including that
   `MMS_FA` is CC-BY-NC and that CoreML is slower than CPU.
2. **The perception drill measures the ear, not the mouth.** It is unbiased *because* it is a
   listening task, and that is also its limit: a learner can ace ɪ–iː discrimination and still
   produce it poorly. We should say so in the UI rather than let the number imply otherwise.
3. **The read-aloud recovery check inherits Whisper's accent bias, in full.** Whisper's WER on
   South-Indian speakers is the highest of the four Indian regions in the NPTEL audit (12.4 % vs
   10.8 % North) and Whisper's *between-group spread exceeds YouTube's* `[B]`. Self-referencing
   (§2.3) cancels a constant per-speaker offset; it does not cancel session noise, which is why
   A6 requires ≥ 3 occurrences.
4. **~52 % of 13-word sentences will contain at least one ASR error** even at the published
   L2-ARCTIC read-speech MER of 0.054 `[B, arithmetic on a cited rate, independence assumed —
   it is not true, read it as an order of magnitude]`. Every grader must be span-and-overlap
   based, never exact match.
5. **The `si` (Sinhala) row is empty**, and Sri Lankan learners are a core audience. G1 is
   skipped for them; G2 and G3 carry the load and are L1-independent. This is survivable but it
   is the largest gap in the spec, and it is a content task, not an engineering one.

**Could not verify**

- **The Systran conversion's own licence declaration.** Upstream openai/whisper is MIT on code
  and weights `[B]`; the conversion's model card was unreachable. **Read it before quoting a
  licence.** `[?]`
- **Whisper `base`'s real error rate on Tamil-, Sinhala- or Nigerian-accented English.** No
  published number exists that I or the briefings could find. L2-ARCTIC's six L1s do not include
  any of them. Every number in §6.4 is from larger hosted systems on read speech. `[?]`
- **Real end-to-end latency** for a 12-second take on a 16 GB laptop with `base` int8 on CPU.
  `DrillRunner` does this today and ships, so it is evidently tolerable, but nobody measured it.
  `[?]`
- **x86 / Windows latency for the deferred GOP path.** The 0.68 s/10 s figure is Apple Silicon
  only. `[?]`
- **Whether adding `--voice` to the DMG build is acceptable** — the script says it adds "roughly
  2-3 GB" `[V, stage-sidecar.mjs:19]`, but I did not measure the actual delta, and most of it is
  Pipecat/torch rather than faster-whisper. Someone should measure it; if faster-whisper can be
  pulled in without the rest of the extra, the capability story gets much simpler. `[?]`
- **The GPL-3.0 exposure.** `kokoro-onnx` 0.5.0 declares `espeakng-loader` and `phonemizer-fork`
  as hard dependencies, both GPL-3.0 `[B]`; whether the DMG actually bundles them was not traced.
  **This recommendation does not add espeak** — that is one of its quieter benefits — but the
  question exists today and is undocumented anywhere in `docs/`. `[?]`

---

## 7. The trigger — when to reconsider and buy the 320 MB

Written now so the deferral expires on evidence rather than on enthusiasm. Buy the espeak model
when **all four** are true:

1. Screens A and B in §3.4 have shipped and a real learner has used them for a month.
2. `GET /pron/capabilities` returns `available: true` for the median install — i.e. the
   `--voice`/download question in §3.2 is resolved.
3. The "That's not what I said" log has accumulated enough rows to say something about our
   actual users' accents. Those rows are the only dataset we will ever have on this, they cost
   nothing to collect, and collecting them is the highest-value thing in this whole document.
4. Someone can state, in one sentence, the learner question the GOP number answers that
   recovery-plus-drills does not.

If #4 has no answer, the model is not the bottleneck.

---

## 8. For the owner

**What it costs.** Zero new download bytes, zero new dependencies, zero new licence exposure.
About one engineer-week in the sidecar (delete the invented score, ~40-line aligner, ~150-line
fairness gate, one L1 content file, one capability route, four route bodies touched) and about
one week in the renderer (two screens, reusing a recorder that already exists and already
works in the Speaking module). Plus a content task with no code in it: fill the Sinhala row.

**What it buys.** A pronunciation feature that is actually reachable — today the module is ten
routes and 1,077 lines that nothing calls. The perception drill, which is the only measurement
in the system with no accent bias in it at all, on screen. A read-aloud check that tells a
learner *"'qualified' was heard as 'quality'"* — the same evidence an IELTS examiner uses — and
that never tells them they sound wrong. And a fairness gate written before the first learner
ever sees a number, which is the only moment it is cheap: after users exist, every fix to it is
a fix to something they already saw.

**What happens if we do nothing.** The current code keeps computing `score = ASR confidence ×
100` and colouring it red below 55. That number goes **down** when a learner reaches for a better
word, and **up** when they cleanly substitute one phoneme for another — the exact error the
minimal-pair bank exists to teach. It is systematically lowest for South-Indian speakers, who are
this app's largest expected audience. The module's own code already says so in a comment
(`analyze.py:830`) while the storage layer and the wire format publish the number anyway. **The
first time that heatmap is rendered, BandReady ships an accent detector wearing a pronunciation
score's costume, to the people it was built for.** Right now nothing renders it. That is the
entire window, and it is free.
