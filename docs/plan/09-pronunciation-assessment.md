# 09 — Pronunciation assessment

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read [research/pronunciation/](../research/pronunciation/) and `sidecar/bandready/pron/`. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.
>
> **§0 of this doc is still binding law, not intent.** Pronunciation measures intelligibility and never proximity to an accent; `SCORE_IS_PRONUNCIATION` is `False` and stays `False`. Nothing in this banner softens that.

_Status: draft v2 (2026-07-25)_

This doc specifies how BandReady turns the per-turn WAVs captured by 02-voice-pipeline.md into
per-word and per-phoneme pronunciation feedback and into the Pronunciation-criterion signal
consumed by the speaking evaluation prompt in 04-speaking-module.md. It surveys the realistic
open-source options (whisper-confidence proxy, torchaudio CTC forced alignment, wav2vec2 GOP
scoring, dedicated toolkits, commercial APIs), then commits to a phased plan: **v1** ships
whisper-timestamp proxies + LLM-flagged likely-mispronounced words + minimal-pair drills (no new
models); **v2** ships a fully local GOP pipeline (ONNX wav2vec2 phoneme model → CTC forced align
→ per-phone posterior → calibrated 0–100 word scores) plus prosody metrics. It also specs the
practice UX (read-aloud heatmaps, minimal pairs, stress drills, shadowing), the `pron_signals_json`
contract with 04, and the `pron_scores` storage semantics whose canonical DDL now lives in
11-data-model.md §7 (ruling R2-6).

## 0. Accent policy (show this in the UI, not just here)

**IELTS accepts all accents.** The public Pronunciation band descriptors reward *intelligibility*
and *range/control of phonological features* — never proximity to RP or General American. BandReady
therefore assesses **intelligibility, not accent**:

- Scores measure whether the intended phoneme was produced recognizably, not whether it matches a
  native reference voice.
- Reference audio (Kokoro) is presented as "*a* clear model", never "the correct accent".
- Fixed UI copy shown on every pronunciation screen (default wording):
  > "IELTS accepts every accent. These scores measure how clearly each sound comes across —
  > not how British or American you sound."
- The calibration data we use (speechocean762) is L1-Mandarin speakers scored by experts for
  *accuracy*, which aligns with intelligibility-first scoring.
- Consequence for scoring math (§4.5): we calibrate against human accuracy labels, we never score
  against a single TTS voice's acoustics, and vowel-quality phones get wider tolerance than
  consonants (accent variation lives mostly in vowels).

## 1. Goal and scope

Outputs, in priority order:

1. **Per-word scores 0–100** for the learner's recorded speech (speaking-session turns and
   read-aloud practice), with per-phone detail underneath.
2. **A Pronunciation-criterion signal** (`pron_signals_json`) for the LLM evaluator in
   04-speaking-module.md — measured evidence, because the transcript alone cannot capture
   pronunciation (04 §6 rule 4).
3. **Practice loops** that convert scores into improvement: heatmap read-alouds, minimal pairs,
   stress drills, shadowing (§5).
4. **Prosody metrics** (v2): intonation flatness, word-stress accuracy — these feed the same
   signal JSON (04 already names `intonation_flatness` and `stress_accuracy`).

Non-goals: accent classification, accent conversion, real-time in-call scoring (all analysis is
post-turn/post-session over saved WAVs — the live pipeline stays untouched per 02).

## 2. Survey of approaches (verified 2026-07-25; links in §8)

### (a) Whisper word-level timestamps + confidence — weak proxy, zero new deps

faster-whisper (`word_timestamps=True`) and mlx_whisper both emit per-word `probability` and
timings. A word the ASR was unsure about *correlates* with mispronunciation, but confounds are
severe: rare words, noise, fast speech, and OOV names all lower confidence without any
pronunciation problem; conversely a systematic substitution ("sheep" for "ship") is transcribed
*confidently as the wrong word* — invisible to confidence.

- ✅ Free: we already re-transcribe WAVs offline (02 §7 notes 09 may re-run STT with timestamps).
- ✅ Word timings enable the v1 heatmap and tap-to-replay UX without alignment models.
- ❌ No phoneme information, no actionable "you said /ʃ/ instead of /s/" feedback.
- **Verdict: v1 signal only, always labeled a proxy.**

### (b) torchaudio CTC forced alignment — the alignment layer, no Kaldi/MFA pain

`torchaudio.functional.forced_align()` (stable across torchaudio 2.1→2.10) takes frame-wise
emissions + a token sequence and returns per-token spans **and per-token scores**. The bundled
`torchaudio.pipelines.MMS_FA` (Wav2Vec2FABundle, ~300 M params, ~1.2 GB) wraps pre/post-processing.
This replaces the historical install nightmare (Kaldi compile, Montreal Forced Aligner's conda-only
distribution) with a pip dependency.

- ✅ Robust word/phone timings; the alignment scores are themselves a usable (weak) GOP.
- ❌ Pulls in full PyTorch (~2 GB installed) — a packaging problem for 13-packaging-distribution.md.
- **Verdict: the alignment *algorithm* is right; we reimplement the Viterbi pass in numpy over
  ONNX emissions (§4.2) so we ship onnxruntime (already required for Kokoro) instead of torch.
  Torch + torchaudio remain the dev-time oracle for testing our alignment (14-testing-strategy.md).**

### (c) GOP with a phoneme-recognition wav2vec2 model — the real thing, fully local

`facebook/wav2vec2-xlsr-53-espeak-cv-ft` (~315 M params) is a CTC model whose output vocabulary is
**espeak IPA-ish phones** (it was fine-tuned on Common Voice text phonemized *by espeak*). That
makes it uniquely convenient: our G2P (§4.1) uses the *same* espeak phonemizer, so expected and
recognized phone inventories match by construction. Goodness-of-Pronunciation = how strongly the
model's frame posteriors support the *expected* phone at its aligned position vs. the best
competing phone. Recent literature (GOP-CTC / self-aligned GOP / alignment-free GOP, 2024–2025)
confirms CTC-model GOP works and benchmarks it on speechocean762.

- ✅ Per-phone, per-word scores; local; one ~300 MB int8 ONNX model.
- ✅ espeak phone set → direct IPA display and direct diff against expected pronunciation.
- ❌ Known quirk: the model's `vocab.json` contains some non-standard IPA combos (e.g. `yəɜ`) —
  we ship a normalization map (§4.1) and never render raw vocab tokens to users.
- ❌ Raw GOP values are uncalibrated log-probability ratios — meaningless to users without a
  calibration curve (§4.5). Phone-level GOP↔human-score correlation on speechocean762 is
  typically ~0.4–0.6 — honest framing required ("signal, not verdict").
- ❌ Needs espeak-ng at runtime for G2P. Default: the `espeakng-loader` wheel, which bundles
  libespeak-ng + data — no system install (default; 13-packaging verifies per-OS).
- **Verdict: the v2 core. §4 specs it.**

### (d) Dedicated OSS toolkits & datasets

- **speechocean762** (CC-BY-4.0-style open license): 5 000 utterances, 250 L1-Mandarin speakers,
  expert phone/word/utterance scores. **Our calibration + regression set** (§4.5, 14-testing).
- **GOPT** (YuanGongND/gopt, ICASSP 2022): transformer over GOP features, pretrained weights
  public. Research code, Kaldi-era feature extraction, not maintained as a product library —
  a v3 idea (learned rescoring of our GOP features), not a dependency.
- Assorted repos (e.g. crazycloud/mispronunciation-detection-diagnosis-wav2vec2-and-llm) validate
  the wav2vec2-phoneme + LLM-diagnosis pattern but none is a maintained, packageable library.
- **Kaldi GOP recipes / CMUSphinx**: mature but the install/runtime cost contradicts our
  "pip-installable sidecar" constraint. Rejected.
- **Verdict: no toolkit to adopt wholesale; we assemble (b)+(c) ourselves — it's ~600 lines.**

### (e) Commercial APIs — optional cloud plugins, never default

- **Azure Pronunciation Assessment**: per-phoneme accuracy + syllable timing + fluency/prosody
  scores; billed as standard Speech-to-Text (~$1/audio-hour class). Best-in-class quality.
- **SpeechAce**: pronunciation/fluency API with syllable+phoneme mistakes, IELTS-style scoring
  endpoints; paid plans.
- Policy per decisions.md (local-first, all data on device): these are **opt-in plugins** behind
  the same provider interface (§4.6), off by default, with an explicit "audio leaves your device"
  consent line in settings (03-providers-and-settings.md). They are not on the v1/v2 critical path.

### Summary table

| Approach | Phone-level? | New runtime deps | Model dl | Honest quality |
|---|---|---|---|---|
| (a) whisper confidence | no | none | none | weak proxy |
| (b) torchaudio forced align | timings + weak scores | torch (~2 GB) or none if reimplemented | 1.2 GB (or shared with (c)) | medium |
| (c) wav2vec2 GOP | **yes** | onnxruntime (already have), espeakng-loader | ~310 MB int8 | good, needs calibration |
| (d) toolkits | varies | heavy/unmaintained | varies | research-grade |
| (e) Azure/SpeechAce | yes | cloud | none | best, costs money + privacy |

## 3. Phased plan

### v1 — no new models (ships with first release)

1. **Offline re-transcription pass** over the session's per-turn WAVs (canonical media layout:
   11-data-model.md §9, `media/speaking/<session_id>/`) with
   the configured STT in word-timestamp mode (faster-whisper / mlx_whisper both support it;
   cloud STT without word confidence → v1 degrades to LLM-only flagging). Produces
   `{word, t_start_ms, t_end_ms, confidence}` per word.
2. **Low-confidence word list**: words with `confidence < 0.55` (default) and length ≥ 4 chars,
   excluding a stoplist of always-low-confidence tokens (fillers, interjections, proper nouns
   detected by capitalization mid-sentence).
3. **LLM anomaly flagging** — one extra non-streaming call at scoring time (same endpoint as 04's
   evaluator, temperature 0, JSON mode). Verbatim template `prompts/pron/v1_flag_words.txt`:

   ```
   You review an IELTS speaking transcript for words the candidate likely
   MISPRONOUNCED. You cannot hear audio. Use only transcript evidence:
   - homophone/near-word substitutions that break meaning in context
     ("she made a good live" -> likely "life")
   - words the ASR rendered inconsistently across turns ("developt",
     "devloped", "developed" for the same intended word)
   - the LOW-CONFIDENCE list below (ASR was unsure); include one only if
     context makes a mispronunciation plausible, not mere rarity
   Never flag a word for being informal, misspelled by the ASR alone, or
   part of a proper noun. Accent is NOT mispronunciation.

   TRANSCRIPT (candidate turns only, with turn indices):
   {{candidate_turns}}

   LOW-CONFIDENCE WORDS: {{low_conf_words_json}}

   Output only JSON:
   {"flagged": [{"word": "...", "turn_index": 3, "reason": "...",
                 "likely_intended": "..." }]}
   Maximum 8 entries. Empty list if nothing is clearly flaggable.
   ```
4. **v1 signal to 04**: `pron_signals_json` with `method:"proxy-v1"` (§6) — word list + fluency
   corroboration, `gop_mean:null`. 04's evaluator prompt already instructs caution when signals
   are thin.
5. **Practice content**: minimal-pair drills (§5.3) are pure authored content + A/B listening —
   they need no scoring model at all, so they ship in v1. Read-aloud (§5.1) ships in v1 with
   confidence-colored heatmap (labeled "beta — estimated").

### v2 — local GOP pipeline (target: second release)

Everything in §4. Read-aloud heatmap switches to calibrated GOP scores; speaking sessions get a
background "Analyzing pronunciation…" job after scoring; shadowing + stress drills unlock
(they need alignment). v1 proxy remains the automatic fallback when the model isn't downloaded.

## 4. v2 GOP pipeline spec

### 4.0 Module layout

Paths follow the binding repo layout of 01-architecture.md §7 (R2-9):

```
sidecar/bandready/pron/
├── __init__.py
├── provider.py      # PronProvider ABC + registry (same shape as the adapter base, 03 §4)
├── proxy_v1.py      # §3 v1 implementation (always available)
├── gop_v2.py        # orchestrates §4.1–4.5; the "local-gop" provider
├── g2p.py           # espeak phonemizer wrapper, vocab normalization map, CMUdict stress lookup
├── align.py         # CTC Viterbi forced alignment over ONNX emissions (numpy, ~150 lines)
├── calibrate.py     # fitted logistic constants (§4.5), raw-GOP -> 0-100
├── prosody.py       # f0 flatness + stress accuracy (§4.4)
└── assets/
    ├── vocab_norm.json          # model token -> clean IPA (fixes yəɜ-style quirks)
    └── calibration_v1.json      # {a, b, per_phone_offsets, fitted_on, corr_phone, corr_word}
```

Model file `w2v2-espeak-ctc-int8.onnx` (~310 MB, int8 dynamic-quantized export of
`facebook/wav2vec2-xlsr-53-espeak-cv-ft`) is **downloaded on demand** at first use from our
release assets (with sha256 pin), stored under `<data dir>/models/pron/` — it is not in the
installer (size budget lives in 13-packaging-distribution.md). fp16 variant (~630 MB) offered as
a settings toggle for accuracy comparisons (default: int8).

### 4.1 Stage 1 — G2P: expected phones

- Input: the *reference text* — for read-aloud/shadowing the passage itself; for free speech the
  ASR transcript of the turn (yes, circular for confidently-wrong substitutions; documented
  limitation — free-speech GOP catches *distorted* phones, minimal pairs catch *substituted* ones).
- `phonemizer` + `espeakng-loader` (bundled lib, no system install — default),
  `language="en-us"`, `with_stress=True`, word separator preserved. Output per word:
  `expected_ipa` (display string with ˈˌ stress marks) and `expected_tokens` (model-vocab token
  sequence via `vocab_norm.json` reverse map).
- CMUdict (bundled, ~4 MB) used only for stress-drill content (§5.4) and as a cross-check; espeak
  is the runtime G2P because it matches the model's training phonemization.
- Words we cannot map cleanly (OOV symbol output, digits after normalization fails) are marked
  `score:null, skipped:true` — never shown red.

### 4.2 Stage 2 — Emission + forced alignment

- Resample turn WAV 16 kHz mono (already the 02 capture format; resample here if the manifest says
  otherwise — 02 explicitly delegates resampling to us), peak-normalize to −3 dBFS.
- onnxruntime session (providers: CoreML EP on macOS, CPU EP elsewhere; default) → log-softmax
  emissions, one frame / 20 ms.
- `align.py`: standard CTC Viterbi forced alignment (same algorithm as
  `torchaudio.functional.forced_align`; torchaudio is our test oracle, not a runtime dep) over the
  concatenated expected-token sequence of the whole turn, with word-boundary bookkeeping from the
  G2P separators. Output: per-phone `{token, t_start_ms, t_end_ms, frames}`.
- Turns longer than 30 s are chunked at the transcript's inter-segment pauses (02 records segment
  times) and aligned per chunk to keep memory flat.

### 4.3 Stage 3 — GOP scoring

Per aligned phone *p* over its frames *T_p* (blank frames excluded):

```
gop_raw(p) = (1/|T_p|) * Σ_{t∈T_p} [ log P(p|o_t) − max_q log P(q|o_t) ]
```

(≤ 0; 0 = the expected phone was the argmax on every frame — the standard CTC-GOP posterior-ratio
form from the 2024–25 GOP-CTC literature.) Also record `heard_token(p)` = the majority-argmax
token over *T_p* — this is what powers "heard as" feedback.

Word roll-up (defaults):

```
phone_score = calibrate(gop_raw)                 # §4.5, 0–100
word_score  = round(0.7 * mean(phone_scores) + 0.3 * min(phone_scores))
```

The `min` term makes one badly-wrong phone drag the word down (matches how listeners perceive
"comfortable" → "com-for-TAY-bul"). `heard_approx` = expected IPA string with each phone whose
score < 55 replaced by its normalized `heard_token` IPA.

### 4.4 Stage 4 — Prosody (cheap DSP, same pass)

- `intonation_flatness` ∈ 0..1: f0 track via librosa `pyin` on voiced segments (librosa is small;
  default — alternative: torchaudio-free autocorrelation in `prosody.py` if librosa's numba dep
  annoys packaging); `flatness = 1 − clamp(std_f0_semitones / 4.0, 0, 1)`. 0.6+ ⇒ noticeably flat.
- `stress_accuracy` ∈ 0..1: for words ≥ 2 syllables with a clear espeak primary-stress mark,
  syllable prominence = mean RMS × duration over the aligned vowel; predicted stressed syllable =
  argmax prominence; accuracy = fraction of words where prediction matches the expected mark.
  Words with < 100 ms vowels excluded.

### 4.5 Score calibration (raw GOP → 0–100)

- Fit once, offline, on **speechocean762** phone-level accuracy labels (0/1/2 → 0/0.5/1):
  logistic `score = 100 / (1 + exp(−(a·gop_raw + b)))`, plus per-phone-class offsets
  (vowels get a wider tolerance band than consonants — accent policy §0). Constants ship in
  `assets/calibration_v1.json` with the achieved Pearson correlations recorded in the file
  (expect ~0.45–0.6 at phone level, ~0.6–0.7 at word level per published CTC-GOP baselines;
  actual numbers to be measured and committed — 14-testing-strategy.md owns the harness).
- **UI bands (defaults)**: green ≥ 80, amber 55–79, red < 55, mapped to the `success` / `warning`
  / `destructive` design tokens (12-design-system.md).
- Recalibration is a data change, not a code change: bump `calibration_v1.json` → regression run.

### 4.6 Provider interface + API

```python
class PronProvider(ABC):                      # provider.py
    provider_id: str                          # "proxy-v1" | "local-gop" | "azure" | "speechace"
    def available(self) -> VerifyResult: ...  # model downloaded? key set? (the verify() pattern)
    async def analyze(self, wav_path: Path, reference_text: str | None,
                      lang: str = "en-us") -> TurnPronResult: ...
```

`TurnPronResult` (also the wire shape returned per-turn by `GET /api/v1/pron/sessions/{session_id}`
and directly by `POST /api/v1/pron/read-aloud` — 18-api-contract.md §4.12):

```json
{
  "method": "local-gop",
  "words": [
    { "word": "comfortable", "word_index": 7, "t_start_ms": 4120, "t_end_ms": 4890,
      "score": 31, "expected_ipa": "ˈkʌmftəbəl", "heard_approx": "kʌmfɔɹˈteɪbʊl",
      "phones": [ { "ipa": "k", "score": 92, "t_start_ms": 4120, "t_end_ms": 4180 },
                  { "ipa": "ʌ", "score": 88, "t_start_ms": 4180, "t_end_ms": 4260 } ] },
    { "word": "Nagoya", "word_index": 8, "score": null, "skipped": true }
  ],
  "intonation_flatness": 0.62,
  "stress_accuracy": 0.58,
  "gop_mean": 71
}
```

Sidecar routes — all under `/api/v1` per R2-1; **18-api-contract.md §4.12/§4.16 is the
authoritative inventory** (method, path, auth, wire shape); this doc owns the behavior:

```
POST /api/v1/pron/sessions/{session_id}/analyze  # 202 {job_id}, kind pron_analyze — R2-3 job
                                                 #   convention; runs over all turn WAVs
GET  /api/v1/pron/sessions/{session_id}          # {status, turns:[TurnPronResult], aggregates}
POST /api/v1/pron/read-aloud                     # multipart {passage_id|text, wav} -> TurnPronResult (sync)
GET  /api/v1/pron/drills                         # ?type=minimal_pair_ab|word_stress_tap&contrast= (§5.3-5.4)
POST /api/v1/pron/drills/results                 # perception-drill outcome -> pron_drill_attempts row (§7)
GET  /api/v1/media/pron/ref?text=...             # Kokoro-rendered reference WAV (cached, §5.2);
                                                 #   ticket auth per 18 §2 — replaces the former
                                                 #   /api/pron/reference-audio (R2-2/R2-18)
```

### 4.7 Expected latency (estimates — verify in 14-testing-strategy.md before publishing numbers)

int8 ONNX, 15 s mono turn, emission is ~95 % of the cost; align+GOP+prosody < 150 ms:

| Hardware | Emission (15 s audio) | Full mock (~5 min candidate speech) |
|---|---|---|
| M1/M2/M3, CoreML EP | ~1–2 s | ~25–45 s |
| M1/M2/M3, CPU EP | ~2.5–4 s | ~50–80 s |
| Windows i5-class (AVX2, 4c) | ~4–8 s | ~1.5–3 min |
| Windows older/2c | ~10–15 s | 4 min+ → auto-suggest proxy-v1 mode |

Because 04's LLM scoring runs first and the report renders without pron detail, the GOP job runs
in the background and the report's Pronunciation section hydrates when ready ("Analyzing audio…"
shimmer). Read-aloud is a single short recording → interactive (< 3 s on M-series) — acceptable
for a "check" button, not for live word-by-word coloring (explicitly out of scope).

## 5. Practice UX (all screens carry the §0 accent banner on first visit)

### 5.1 Read-aloud passages with per-word heatmap

Original short passages (60–120 words, IELTS-topic vocabulary, authored per
15-content-authoring-licensing.md, tagged with target phonemes). Record → analyze → heatmap.

```
┌──────────────────────────────────────────────────────────────┐
│ Read aloud: "City life"                 ●REC 00:31  [Stop]   │
├──────────────────────────────────────────────────────────────┤
│ Living in a large city has both advantages and               │
│ [drawbacks]. Many people find the [atmosphere]               │  ← amber
│ exciting, although the cost of [accommodation] is            │  ← red
│ usually much higher than in rural areas. ...                 │
│                                                              │
│ ── tap a word ─────────────────────────────────────────────  │
│ │ accommodation   32/100                                   │ │
│ │ expected  /əˌkɒməˈdeɪʃən/                                │ │
│ │ we heard  /əˈkɒmədeʃn̩/ — stress landed on syllable 2    │ │
│ │ [▷ Reference (Kokoro)]  [▷ Your recording]  [＋ Add SRS] │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Overall 74 · 3 words to work on · [Practice these 3 →]       │
└──────────────────────────────────────────────────────────────┘
```

Green/amber/red per §4.5 thresholds; `skipped` words render plain. "＋ Add SRS" files the word
into the vocabulary bank with a pronunciation-lapse tag (08-vocabulary-srs.md).

### 5.2 Tap word → reference vs. own audio

Reference = Kokoro (default TTS per decisions.md) rendering of the word *and* of its carrier
sentence (isolated words sound unnatural; both offered). Cached at
`<data dir>/media/pron/ref/{voice_id}/{sha1(text)}.wav`. The learner's clip is sliced from the
turn WAV via the word's aligned `t_start_ms/t_end_ms` (±150 ms pad).

### 5.3 Minimal-pair drills (v1, no model needed)

Authored pair bank (15-content-authoring…), each: `{pair_id, a:"ship", b:"sheep",
contrast:"ɪ–iː", sentence_a, sentence_b, tags:[...]}`. Ship ~60 pairs covering the classic
contrasts (ɪ/iː, æ/e, θ/s, θ/t, v/w, l/r, b/p final, n/ŋ, ɜː/ɔː, word-final -s/-z cluster
deletion: works/walks).

Two modes:
- **Perception (A/B listening test)**: Kokoro speaks one of the pair in a carrier sentence
  (random voice + rate jitter so learners can't memorize renderings); learner picks A or B;
  10-item sets; per-contrast accuracy tracked.
- **Production** (v2): say the prompted word; scored by the GOP of the contrast phone only, plus a
  discrimination check (align both candidate phone sequences, pick the higher-likelihood one —
  "we heard *sheep*"). Pass = correct word heard AND contrast-phone score ≥ 55.

```
│ Minimal pairs · /ɪ/ vs /iː/         item 4/10 │
│        ▶ "The ____ left the harbour."         │
│        [ A: ship ]        [ B: sheep ]        │
│  streak: ●●●○   contrast accuracy: 78 %       │
```

### 5.4 Word-stress and sentence-stress exercises (v2)

- **Word stress**: show a multi-syllable word as syllable chips (`pho·TOG·ra·phy`); learner taps
  the stressed syllable (perception, CMUdict/espeak answer key), then records it (production,
  scored by §4.4 prominence detection on that word).
- **Sentence stress**: passage line with content words; learner records; we render measured
  prominence as dot sizes over words vs. an expected pattern (content words stressed, function
  words reduced). Scored leniently (direction-level feedback only, no 0–100 — sentence stress
  ground truth is genuinely variable).

### 5.5 Shadowing mode

Play a reference sentence (Kokoro, or a listening-module clip per 07-listening-module.md) →
learner records immediately → overlay + score.

```
│ Shadowing · sentence 3/8                                  │
│ ▶ "I'd rather have stayed home than queue for hours."     │
│ ref  ▁▂▅▇▅▂▁▂▆▇▆▂▁▁▃▅▃▁      you  ▁▂▄▆▄▂▁▁▅▆▅▂▁▁▂▄▂▁      │
│ words 84 · rhythm 71 (yours ran 14 % slower)              │
│ tempo [0.75×|1.0×]   [▶ compare]  [↻ again]  [next →]     │
```

Score components: word GOP mean (§4) + duration-ratio rhythm score (DTW over syllable durations
is a stretch goal, flagged; v2 ships the simple total+per-word duration ratio). The waveform
overlay is amplitude envelopes (cheap, honest), not spectrograms.

## 6. Contract with 04-speaking-module.md (`pron_signals_json`)

This doc owns the canonical shape; 04 embeds it verbatim in `evaluate_user.txt`. Scores are stored
0–100 (§7) but **serialized normalized to 0–1 in the prompt**, matching 04's documented example
(`"gop_mean": 0.71`, `"score": 0.31`). `heard_as` in 04's example is the human-readable
respelling we generate from `heard_approx` (IPA is wasted on small LLMs; "com-for-TAY-bul" is not).

```json
{
  "available": true,
  "method": "local-gop",            // or "proxy-v1"
  "gop_mean": 0.71,                 // null when method = proxy-v1
  "worst_words": [
    { "word": "comfortable", "score": 0.31,
      "expected_ipa": "ˈkʌmftəbəl", "heard_approx": "kʌmfɔɹˈteɪbʊl",
      "heard_as": "com-for-TAY-bul", "turn_index": 4 }
  ],                                // ≤ 8 entries, score ascending; proxy-v1: score/ipa null,
                                    // entries come from §3 flagging with "reason" instead
  "intonation_flatness": 0.62,      // null in proxy-v1
  "stress_accuracy": 0.58,          // null in proxy-v1
  "pct_words_red": 0.06             // fraction of scored words < 0.55; null in proxy-v1
}
```

`{"available": false}` when: no WAVs (recorder failure per 02 §5 failure policy), model absent and
proxy also impossible (cloud STT without confidences), or the background job errored. 04's rule 4
then bands PRON as null. Per-turn results persist as per-word `pron_scores` rows (§7); the
`TurnPronResult` wire shape is reconstructed from those rows on read (there is no
`speaking_turns.pron_json` column in the canonical schema — 11-data-model.md §4.2). Session-level
aggregates live in the signal JSON above and in `speaking_sessions.pron_summary_json` (11 §4.2).

## 7. Storage (canonical DDL: 11-data-model.md §7 — R2-6)

This doc's `pron_scores` + `pron_drill_attempts` design was adopted as canonical by
**11-data-model.md §7** (ruling R2-6, replacing 11's former `pron_word_scores`). 11 now owns the
DDL; the inline `CREATE TABLE` sketch that previously lived here is superseded by that port. The
semantics are preserved exactly:

- **`pron_scores`** — one row per analyzed word occurrence, **source-polymorphic**:
  `source IN ('speaking_turn','read_aloud','shadowing','minimal_pair')`, so read-aloud, shadowing,
  and minimal-pair-production scores (§5) store alongside speaking-turn scores. Session linkage
  (`session_id`, `turn_id`) is **nullable** — NULL unless `source='speaking_turn'`; `passage_id`
  carries the content id for the other three sources.
- **`score INTEGER CHECK (score BETWEEN 0 AND 100)`**, NULL = skipped/proxy-unscored. Wherever a
  prompt needs a 0–1 float (§6's `pron_signals_json`), the serializer emits `score/100` — the DB
  never stores the float.
- **`pron_drill_attempts`** — perception-drill attempts (minimal-pair A/B, stress taps), no audio
  scoring involved; one row per item response with `drill_type`, `item_id`, `contrast`, `correct`,
  `response_ms`.
- Deltas applied by the 11 port (this doc conforms): TEXT ULID PKs replace INTEGER PKs;
  `profile_id` root scoping on both tables; `turn_id` FK to `speaking_turns(id)` replaces the
  former `turn_index` join column; `audio_file` is renamed `audio_path`; an `issues_json` tag
  column is added.

Retention (R2-6): `pron_scores`/`pron_drill_attempts` rows are tiny and kept forever (they power
10-curriculum-progress.md trend charts, e.g. per-contrast accuracy over time). The WAVs they
reference follow 11 §9's canonical policy: **user recordings are never auto-evicted** — audio
disappears only on explicit session/recording deletion, at which point `audio_path` is NULLed,
replay buttons disable, and scores remain. (Generated reference audio under `media/pron/ref/`
remains LRU-evictable cache per 11 §9.) Aggregates (session `gop_mean`, `stress_accuracy`,
contrast accuracies) are computed on read; if slow, 11-data-model.md may add a materialized
`pron_session_stats` table (deferred).

Flagged-word → SRS linkage: "＋ Add SRS" writes a vocab item with `source:'pronunciation'` and the
`pron_scores.id`; 08-vocabulary-srs.md renders those cards with a listen/say-it front instead of a
definition front.

## 8. Verified sources (checked 2026-07-25)

- torchaudio CTC forced-alignment API + `MMS_FA` bundle: [CTC forced alignment API tutorial (stable)](https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html), [Forced alignment with Wav2Vec2](https://docs.pytorch.org/audio/stable/tutorials/forced_alignment_tutorial.html)
- Phoneme model: [facebook/wav2vec2-xlsr-53-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft/blob/main/README.md) (+ known [vocab quirks](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft/discussions/10) and [espeak-ng dependency issue](https://github.com/huggingface/transformers/issues/35064))
- GOP on CTC models, current research: [Segmentation-free GOP (GOP-SA/GOP-AF)](https://arxiv.org/pdf/2507.16838), [GOP without phoneme time alignment](https://arxiv.org/pdf/2603.25150), [phonological-knowledge CTC-GOP](https://arxiv.org/pdf/2506.02080)
- Benchmark/calibration data: [speechocean762 corpus](https://www.researchgate.net/publication/354221406_speechocean762_An_Open-Source_Non-Native_English_Speech_Corpus_for_Pronunciation_Assessment); learned-rescoring reference: [GOPT (ICASSP 2022)](https://github.com/YuanGongND/gopt); pattern validation: [wav2vec2+LLM MDD repo](https://github.com/crazycloud/mispronunciation-detection-diagnosis-wav2vec2-and-llm)
- Commercial plugins: [Azure Pronunciation Assessment how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment), [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), [SpeechAce API docs](https://docs.speechace.com/), [SpeechAce plans](https://www.speechace.com/api-plans/)

## Open questions

1. **Actual latency + accuracy numbers**: the §4.7 table and §4.5 correlation targets are
   estimates from published CTC-GOP baselines; the int8 export must be benchmarked on real M1 and
   Windows-i5 hardware and against the speechocean762 test split before we print any number in-app.
2. **Free-speech reference-text circularity** (§4.1): GOP over an ASR transcript can't catch a
   confident wrong-word substitution. Is the v1 LLM-flagging pass worth keeping *inside* v2 as a
   complementary detector, or does it double-flag and confuse users?
3. **espeakng-loader wheel coverage**: confirmed as a bundling approach, but Windows-arm64 and
   Linux-musl wheel availability needs verification during 13-packaging-distribution.md work;
   fallback would be vendoring libespeak-ng ourselves.
4. **CoreML EP operator coverage** for the quantized wav2vec2 export — if unsupported ops force
   CPU fallback on macOS, the M-series latency column degrades to the CPU row; needs a spike.
5. **Whisper hesitation tokens**: whether the configured STT emits fillers verbatim varies by
   model/settings (02 flags the same issue); if fillers are suppressed, v1's low-confidence lists
   skew — do we force a filler-friendly re-transcription profile for the offline pass?
6. **Learned rescoring (GOPT-style) as v3**: worth it only if v2 correlation measured < ~0.55 at
   word level; defer the decision until the §4.5 numbers exist.
