# PR-1:models — Offline pronunciation assessment: the real candidate set

Research briefing. Written 2026-08-01. Supersedes nothing; it is the evidence layer under
`docs/plan/09-pronunciation-assessment.md`. No application code was changed.

**Confidence key.** `[M]` measured by me on this machine, reproducible. `[V]` verified by
fetching the primary source today (URL given). `[R]` reported in a paper I read, numbers
transcribed from the results table. `[I]` inferred/derived — reasoning shown. `[?]` could
not verify — stated as unknown, not guessed.

---

## 0. Verdict first

**Pick:** `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0, ~316 M params, 1263.5 MB fp32
→ **320 MB int8** [M]) exported to ONNX yourself, run on the **CPU execution provider**, with
CTC forced alignment reimplemented in numpy. This is what plan/09 §4 already says, and the
evidence supports it. Everything else is worse on at least one axis that matters here.

**Reject, with reasons that are not close calls:**

| Rejected | Killer reason |
|---|---|
| `torchaudio.pipelines.MMS_FA` | **CC-BY-NC-4.0** [V]. Non-commercial. Cannot ship in an Apache-2.0 app. plan/09 §2(b) names it without noting this. |
| `facebook/mms-300m` | **CC-BY-NC-4.0** [V]. Same problem, it is the same weights family. |
| charsiu (`charsiu/en_w2v2_fc_10ms`) | **No licence on the model repo at all** [V]. GitHub code is MIT but the weights are unlicensed and the repo has not been pushed to since 2022-09-19 [V]. |
| `microsoft/wavlm-large` | **No licence field on the HF model card** [V]. Unresolvable without legal review. |
| Montreal Forced Aligner | MIT and good, but needs Kaldi binaries from conda-forge. Not pip-installable into the sidecar. |
| Azure Pronunciation Assessment | **There is no pronunciation-assessment container** [V]. Cloud only. Also its accuracy metric is defined against native speakers — see §5. |
| CoreML execution provider | **Measurably slower than plain CPU** [M]. 169 of 643 nodes supported, 121 partitions. |

**Answer to the direct question — is the ASR-confidence proxy defensible?**
As a *fluency and timing* signal, yes. As a *pronunciation* signal shown to a learner, **no —
it is actively misleading**, and the reason is mechanical rather than a matter of degree. See
§1. The current code is already honest about this at the `pron_signals_json` boundary
(`score: null`) and dishonest about it at the UI boundary (`score = confidence × 100`, banded
green/amber/red). That gap is the actual bug.

---

## 1. Is the existing proxy defensible? (evidence, not opinion)

### 1.1 What `probability` actually is

`sidecar/bandready/pron/analyze.py:244` reads `word.probability` from faster-whisper and
`score_from_confidence()` at line 396 turns it into a 0–100 score. In the installed
faster-whisper (`sidecar/.venv/.../faster_whisper/transcribe.py:1748`) that field is computed as:

```python
word_probabilities = [
    np.mean(text_token_probs[i:j])
    for i, j in zip(word_boundaries[:-1], word_boundaries[1:])
]
```

`text_token_probs` are the **decoder's next-token softmax probabilities**. Whisper's decoder is
an autoregressive sequence model conditioned on all preceding text. So this number is
`P(token | audio, preceding words)` — a quantity dominated by *lexical predictability*, not by
acoustic realisation. [V, read from the installed source]

Three consequences follow directly from that definition, without needing an experiment:

1. **A perfectly pronounced rare word scores low.** "Accommodation" after "the cost of" is
   predictable; "Nagoya" or "photovoltaic" is not. The learner sees red for vocabulary range.
2. **A badly pronounced predictable word scores high.** If context pins the token, the decoder
   assigns high probability nearly regardless of the acoustics.
3. **A clean phoneme substitution is invisible.** Say /ʃiːp/ for "ship" and Whisper transcribes
   "sheep" — *confidently*. The proxy reports a high score for the exact error class the
   minimal-pair bank at `content/core-en/data/pron_pairs.jsonl` exists to teach. plan/09 §2(a)
   already states this; the code ships the score anyway.

Note the direction of the bias in (1) and (3): it penalises lexical ambition and rewards the
substitutions IELTS examiners actually notice. That is not a weak signal, it is an
anti-correlated one for a meaningful slice of inputs.

### 1.2 The accent-rule problem is worse for the proxy than for GOP

plan/09 §0 forbids scoring accent proximity. The proxy violates this more directly than a GOP
pipeline would, because Whisper's decoder confidence inherits ASR accent bias wholesale.
Mainstream ASR is built on native-accented or majority-accent corpora and shows higher error
rates on non-native and less-common accents ([Quantifying Bias in ASR, arXiv:2103.15122](https://arxiv.org/pdf/2103.15122)) [V].
A Tamil- or Nigerian-accented speaker who is entirely intelligible gets systematically lower
token probabilities, and the current code renders that as red words. **This is the documented
failure mode plan/09 §0 calls unacceptable, and the v1 code implements it.** [I, but the
inference is short: lower ASR confidence on accented speech + score = confidence × 100 + red
band below 55.]

The review literature is precise about the distinction BandReady needs:
intelligibility is "the accuracy of the sound, word, and utterance itself along with
utterance-level completeness"; accentedness is "listeners' perceptions of the degree to which
L2 speech is influenced by their native language"; and critically, **"most of the unintelligible
speech is identified as highly accented whereas highly accented speech is not always
unintelligible"** ([Automatic Pronunciation Assessment — A Review, arXiv:2310.13974 §2.2](https://arxiv.org/html/2310.13974)) [V].
Decoder confidence tracks accentedness. BandReady must score intelligibility.

### 1.3 What the proxy *is* legitimately good for

The word timings are real and cheap, and everything in `fluency_proxies()`
(`analyze.py:293`) — speech rate, articulation rate, pause count, pause ratio, long-pause
count — is computed from timings, not from confidence. Those are defensible measures of
Fluency and Coherence, which is a *different IELTS criterion*, and they are not accent-biased
in the same way. Word timings also power tap-to-replay and the read-aloud heatmap geometry.

### 1.4 Recommendation

Keep the module; change three things, none of which need a new model:

1. **Stop emitting a per-word `score` in proxy-v1.** Set `score = None` and persist the
   confidence in a separate field. `pron_signals_json` already does exactly this
   (`analyze.py:830`, `"score": None,  # proxy-v1: an ASR confidence is not a pronunciation
   score`). Make `WordScore.as_wire()` and `_persist_scores()` agree with it. Right now the DB
   and the wire format disagree with the module's own stated policy.
2. **Re-label the heatmap.** With `score = None`, `level` is `None` and words render plain; the
   flagged list becomes the UI surface. That is the honest v1 product: "here are words worth a
   second listen", not "this word is 32/100".
3. **Keep the LLM flagger and the fluency proxies.** The flagger targets homophone
   substitutions and cross-turn inconsistency — the failure modes confidence cannot see — and
   its prompt already forbids flagging accent (`FLAG_PROMPT`, "Accent is NOT
   mispronunciation"). It is the more defensible half of v1.

Cost: small. Risk of not doing it: you ship a number that goes down when a Sri Lankan learner
uses a better word.

---

## 2. What I measured (this is the part nobody else has)

plan/09 open questions #1 and #4 ask for real latency numbers and CoreML operator coverage
before publishing anything. I measured both.

**Method.** I could not download 1.26 GB of weights on this connection, so I built a synthetic
ONNX graph with the *exact shapes* of `facebook/wav2vec2-xlsr-53-espeak-cv-ft` read from its
`config.json` [V]: `hidden_size=1024`, `num_hidden_layers=24`, 16 heads, FFN 4096,
`vocab_size=392`, plus the standard wav2vec2 7-layer conv feature extractor
(512 ch, kernels 10/3/3/3/3/2/2, strides 5/2/2/2/2/2/2 → 50 fps / 20 ms frames). Weights are
random. **Latency of a dense transformer depends on shapes and dtype, not on weight values**,
so this is a faithful proxy for the encoder cost, which plan/09 §4.7 correctly identifies as
~95 % of the pipeline.

Sanity check that the shapes are right: my fp32 graph serialises to **1,228,768,800 bytes**
against the real checkpoint's **1,263.5 MB** — 2.8 % apart, the gap being the relative
positional-embedding conv and biases I omitted. Good enough.

**Hardware:** Apple M5, 16 GB, macOS 25.4, onnxruntime 1.19.2, CPU execution provider,
`ORT_ENABLE_ALL`. Median of 3 runs after a warm-up. Scripts are in the session scratchpad
(`build_bench.py`, `bench2.py`, `bench3.py`).

### 2.1 Encoder latency

| Audio | Precision | Threads | Median | RTF |
|---|---|---|---|---|
| 10 s | fp32 | 4 | **0.86 s** | 0.086 |
| 10 s | int8 (MatMul) | 4 | **0.68 s** | 0.068 |
| 30 s | fp32 | 4 | 3.16 s | 0.105 |
| 30 s | int8 | 4 | 2.67 s | 0.089 |
| 60 s | fp32 | 4 | 8.32 s | 0.139 |
| 60 s | int8 | 4 | 6.91 s | 0.115 |
| 10 s | fp32 | 2 | 1.67 s | 0.167 |
| 10 s | int8 | 2 | 1.31 s | 0.131 |
| 10 s | fp32 | 10 | 1.01 s | 0.101 |
| 10 s | int8 | 10 | 0.69 s | 0.069 |

Four findings worth acting on:

- **A 10-second utterance costs ~0.7 s on modern Apple Silicon.** plan/09 §4.7 guessed
  "~2.5–4 s" for 15 s on M1/M2/M3 CPU EP. Scaled, my M5 number is ~1.0 s for 15 s. M5 is
  roughly 2–3× an M1 on threaded GEMM, so **plan/09's M-series CPU estimate is probably about
  right for M1 and about 3× pessimistic for current hardware** [I]. Do not relax the Windows
  rows — I did not measure x86.
- **RTF degrades with length** (0.068 → 0.115 from 10 s to 60 s) because attention is O(T²).
  This independently justifies plan/09 §4.2's 30-second chunking, for speed as well as memory.
- **More threads is not better.** 4 threads beat 10 on this 10-core part. Pin
  `intra_op_num_threads` to ~4 (or performance-core count); do not let onnxruntime default to
  all cores.
- **int8 buys disk, not speed.** 1.229 GB → 320 MB is a 3.8× win that matters enormously for
  users on slow connections. The latency win is only ~1.2×. Frame the int8 export as a
  *download-size* decision, and consequently **the fp16 "accuracy toggle" in plan/09 §4.0 is
  not obviously worth 630 MB of someone's bandwidth** — measure the accuracy delta before
  offering it.

### 2.2 CoreML execution provider — answering plan/09 open question #4

```
CoreMLExecutionProvider::GetCapability, number of partitions supported by CoreML: 121
number of nodes in the graph: 643   number of nodes supported by CoreML: 169
```

| Audio | Precision | Provider | Median |
|---|---|---|---|
| 10 s | fp32 | CoreML → CPU | 1.01 s |
| 10 s | fp32 | CPU only | **0.86 s** |
| 10 s | int8 | CoreML → CPU | 0.87 s |
| 10 s | int8 | CPU only | **0.68 s** |

**CoreML is slower than plain CPU, in both precisions.** Only 26 % of nodes are supported and
they fragment into 121 partitions; the per-partition handoff costs more than the acceleration
returns. **Ship CPU EP on macOS.** Delete the CoreML row from plan/09 §4.7 and close open
question #4 as answered: don't. [M]

### 2.3 A quantisation trap you will hit

`quantize_dynamic(..., weight_type=QInt8)` with default op coverage quantises the conv feature
extractor, and then the session fails to build:

```
NOT_IMPLEMENTED : Could not find an implementation for ConvInteger(10) node
```

Fix: `op_types_to_quantize=["MatMul"]`. Cost is 12 MB (308 MB → 320 MB) [M]. Put this in the
export script the first time, not after a bug report.

---

## 3. Phoneme CTC models for GOP — the actual candidate set

All rows fetched from the HuggingFace API today [V]. "Disk" is the fp32 checkpoint as stored.
All run on CPU. Params marked [I] are derived from file size ÷ 4 bytes where the API did not
expose a safetensors header.

| Repo id | Licence | Params | Disk (fp32) | Output | Verdict |
|---|---|---|---|---|---|
| **`facebook/wav2vec2-xlsr-53-espeak-cv-ft`** | **apache-2.0** | ~316 M [I] | 1263.5 MB | Frame posteriors over 392 espeak-IPA tokens @ 50 fps | **PICK** |
| `facebook/wav2vec2-lv-60-espeak-cv-ft` | apache-2.0 | ~316 M [I] | 1263.5 MB | Identical 392-token vocab [V] | Strong alternate; English-only pretraining |
| `vitouphy/wav2vec2-xls-r-300m-timit-phoneme` | apache-2.0 | 315,483,820 | 1262.0 MB | ARPAbet-ish TIMIT phone posteriors | Fallback. TIMIT is small and native-only |
| `mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme` | apache-2.0 | ~316 M [I] | 1262.1 MB | Phone posteriors, fine-tuned on L2-ARCTIC (non-native) | Interesting — trained on L2 speech. Unevaluated by me |
| `speech31/wav2vec2-large-english-TIMIT-phoneme_v3` | apache-2.0 | ~316 M [I] | 1262.0 MB | TIMIT phones | 550 lifetime downloads. Unvetted |
| `KoelLabs/xlsr-timit-b0` | **mpl-2.0** | 315,480,745 | 1262.0 MB | IPA phones | MPL-2.0 is file-level copyleft — workable but adds obligations. 11 downloads |
| `bookbot/wav2vec2-ljspeech-gruut` | apache-2.0 | 94,406,317 | 377.7 MB | gruut phoneme set | **Only viable small model.** 4× cheaper. Trained on LJSpeech = one native speaker |
| `ct-vikramanantha/phoneme-scorer-v2-wav2vec2` | apache-2.0 | 94,406,317 | 377.7 MB | Phonemes | 160 downloads, no eval published. Do not build on it |
| `facebook/hubert-large-ls960-ft` | apache-2.0 | ~316 M [I] | 1262.1 MB | **Characters, not phonemes** | Wrong output layer for GOP |
| `microsoft/wavlm-large` | **none on card** | ~316 M [I] | 1262.0 MB | SSL features only, no CTC head | **Reject: unlicensed** |
| `facebook/mms-300m` | **cc-by-nc-4.0** | ~317 M [I] | 1269.7 MB | SSL features | **Reject: non-commercial** |
| `charsiu/en_w2v2_fc_10ms` | **none** | ~94 M [I] | 377.7 MB | Frame classification, 10 ms | **Reject: unlicensed weights, dead since 2022** |

### 3.1 Why the espeak model, specifically

Its output vocabulary is espeak's IPA-ish phone set, produced by phonemizing Common Voice text
*with espeak*. If your G2P is also espeak, expected and recognised inventories match by
construction — no phone-set mapping table, no ARPAbet↔IPA lossiness. That is a genuine
engineering advantage and plan/09 §2(c) is right about it. 434,347 downloads makes it the
de-facto standard [V].

### 3.2 The vocab problem is bigger than plan/09 says

I pulled `vocab.json` [V]. 392 tokens. plan/09 §2(c) mentions "some non-standard IPA combos
(e.g. `yəɜ`)". The real issue is that this is a **multilingual** vocabulary and a large slice
of it is not English at all:

```
'ei5', 'onɡ5', 'ɑu5', 'iɑ5', 'ai5', 'i.5', 'iɛ5', 'tɕh', 'ts.h', 'tʃʲ', 'ʁ', 'β', 'ɣ', 'ɑ̃', 'ɔ̃'
```

Those are Mandarin tone-marked finals, Mandarin affricates, French nasals, German/Spanish
fricatives. This matters for GOP **specifically**, because the standard formula in plan/09 §4.3
is a posterior *ratio*:

```
gop_raw(p) = mean_t [ log P(p|o_t) − max_q log P(q|o_t) ]
```

`max_q` ranges over all 392 tokens. A Mandarin-L1 learner producing an /iː/ with a familiar
tonal colouring can have `ei5` win the argmax, and the expected phone gets penalised for
resembling the learner's own L1 inventory. **That is accent-proximity scoring by the back
door, and it is precisely what plan/09 §0 forbids.** [I — the mechanism is certain from the
formula and the vocabulary; the magnitude is unmeasured.]

**Concrete mitigation, and I think it is required, not optional:** restrict `max_q` to an
allow-list of English phones (plus blank) before computing the ratio. Ship that allow-list in
`assets/vocab_norm.json` alongside the normalisation map. Also record the unrestricted
`heard_token` separately — it is useful diagnostic data, but it must not enter the score.

The review paper independently flags the general form of this: GOP "demonstrates a degree of
dependency on the language of the acoustic model" (arXiv:2310.13974 §4.4) [V].

### 3.3 There is no ONNX export you can just download

I searched the Hub [V]. The only phoneme-CTC ONNX artefacts are
`proclivitystudios/vitouphy-wav2vec2-xls-r-300m-timit-phoneme-ONNX` (28 downloads) and
`Ouioui11/wav2vec2-phoneme-onnx` (0 downloads). Neither is the espeak model, neither is
maintained. **You must export and host it yourself**, which plan/09 §4.0 already assumes
(release assets + sha256 pin). Budget the export tooling: `torch` + `transformers` +
`optimum` at build time only, never at runtime. The int8 result will be ~320 MB [M].

---

## 4. Forced alignment / phoneme recognisers

| Option | Licence | Size | Outputs | Runtime cost | Verdict |
|---|---|---|---|---|---|
| **numpy CTC Viterbi over your own emissions** | yours | 0 | Per-token spans + per-token scores | ~150 lines, negligible CPU | **PICK** (plan/09 §4.2) |
| `torchaudio.functional.forced_align` | BSD-2 (code) | — | Same | Pulls torch (~2 GB installed) | **Dev-time oracle only.** Correct call in plan/09 |
| `torchaudio.pipelines.MMS_FA` | **CC-BY-NC-4.0** [V] | — | Alignment | torch | **REJECT — non-commercial weights** |
| WhisperX | BSD-2-Clause [V] | — | Word alignment via `WAV2VEC2_ASR_BASE_960H` [V] | Requires `torch~=2.8`, `torchaudio`, `torchvision`, `pyannote-audio` [V] | Reject as a dep. **But steal its model choice** |
| `facebook/wav2vec2-base-960h` | apache-2.0 | 94,395,552 params, 377.6 MB [V] | **Character** CTC posteriors | ~4× cheaper than large | Licence-clean alignment-only path if you ever want one without phonemes |
| Montreal Forced Aligner 3.4.1 | MIT [V]; `english_mfa` acoustic model 92.2 MB [V], CC BY 4.0 [V, medium confidence] | 92 MB | Phone + word TextGrids, no scores | **Needs Kaldi binaries via conda-forge** | **REJECT — not pip-installable into the sidecar** |
| charsiu forced aligner | unlicensed weights [V] | 377–406 MB | Frame/boundary phone alignment | — | **REJECT** |
| `ctc-forced-aligner` (PyPI 1.0.2) | no licence declared [V] | — | Alignment | onnxruntime-based (good) | Defaults to an MMS-derived model (CC-BY-NC lineage). Reject |

**The important non-obvious point:** MMS_FA being CC-BY-NC does **not** poison
`torchaudio.functional.forced_align`. That function is BSD-2 code that takes *your* emissions
and *your* token sequence. plan/09's plan — reimplement the algorithm in numpy, keep torchaudio
as a test oracle only — is licence-clean and correct. Just make sure the oracle test uses
`WAV2VEC2_ASR_BASE_960H` (Apache-2.0) and never `MMS_FA`, or CI itself downloads NC weights.

---

## 5. Azure Pronunciation Assessment — the quality baseline, and why it cannot ship

### 5.1 What it outputs (this is the target feature set)

From [the official how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) [V]:

- `AccuracyScore` — phoneme, **syllable** (en-US only), word, and full-text level
- `FluencyScore`, `CompletenessScore` (ratio of pronounced words to reference), `ProsodyScore`
  (en-US only; stress, intonation, speaking speed, rhythm)
- `PronScore` — weighted composite
- `ErrorType` per word: `None | Omission | Insertion | Mispronunciation | UnexpectedBreak |
  MissingBreak | Monotone`. **`Mispronunciation` fires when word `AccuracyScore` < 60.**
- `NBestPhonemes` — the top 5 competing phonemes per slot with confidences. The doc's own
  worked example: "the most likely spoken phonemes was `ə` instead of the expected phoneme
  `ɛ`. The expected phoneme `ɛ` only received a confidence score of 47."
- IPA alphabet, syllable segmentation, `Offset`/`Duration` in 100-ns units
- Audio > 30 s requires continuous mode, where `EnableMiscue` is unsupported

**Two things to copy.** (a) `NBestPhonemes` is exactly BandReady's `heard_approx` and it is
better UX than a bare score — surfacing the competitor set with confidences lets a learner see
"you were between /ɛ/ and /ə/". (b) Separating Accuracy / Fluency / Completeness / Prosody
into distinct axes rather than one number. plan/09's single 0–100 `word_score` is coarser than
the baseline.

**One thing to reject.** Azure defines its headline metric as: *"Accuracy indicates how closely
the phonemes match a **native speaker's** pronunciation"* [V, verbatim]. That is
native-proximity scoring, stated in the product documentation. It is a legitimate baseline for
*mechanism* — phoneme-level posteriors, n-best competitors, syllable timing — and an explicit
counter-example for *policy*. When BandReady benchmarks against Azure, expect and welcome
divergence on accented-but-intelligible speech; that divergence is the accent rule working, not
a regression.

### 5.2 It cannot ship here — and it is stronger than "policy says no"

Azure Speech offers exactly four containers: speech-to-text, custom speech-to-text, language
detection (preview, and explicitly *"Not available as a disconnected container"*), and neural
text-to-speech. **Pronunciation assessment is not among them** [V,
[container overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-container-overview)].

And even the containers that exist do not solve it: *"Speech containers aren't licensed to run
without being connected to Azure for metering."* [V, verbatim] Disconnected operation
additionally requires an approval form, an Azure subscription ID, a commitment plan, and a
10-business-day review.

So the correct framing in the docs is not "we chose local over cloud for privacy" — it is
**"the best-in-class system is architecturally unavailable offline, at any price."** That is a
stronger and more honest sentence, and it makes the local GOP pipeline the only option rather
than a principled compromise. Keep the opt-in cloud plugin in plan/09 §2(e) if you like, but
stop describing it as the quality ceiling you're declining to reach — describe it as the
ceiling you can measure against on a dev machine.

**SpeechAce:** scores syllable- and phoneme-level mistakes and emits IELTS-scale estimates
(0.0–9.0) [V]. Whether an on-premise deployment exists is **not documented publicly — [?]**;
their docs say to contact them. Do not plan around it.

---

## 6. How good will this actually be? (the number plan/09 gets wrong)

This is the most important correction in this document, because it changes what you should
build, not just what you should write.

### 6.1 The measured ceiling

**speechocean762 Kaldi baseline** (the corpus paper's own recipe, Table 2) [R,
[arXiv:2104.01378](https://arxiv.org/pdf/2104.01378)] — phoneme-level, against 5 expert raters:

| Method | MSE | **PCC** |
|---|---|---|
| GOP **value** (scalar) → polynomial regression | 0.69 | **0.25** |
| GOP-based **feature vector** → SVR | 0.16 | **0.45** |

**Current SOTA, phoneme level** (Table III of [Segmentation-free Goodness of Pronunciation,
arXiv:2507.16838](https://arxiv.org/pdf/2507.16838v2), IEEE TASLPRO) [R]:

| Features | Regressor | PCC |
|---|---|---|
| GOP-TDNN (Kaldi) | poly. reg. | 0.361 ± 0.008 |
| GOP-CTC-AF-SD | poly. reg. | 0.433 ± 0.007 |
| GOP-CTC-AF-SD-numerical | poly. reg. | 0.450 ± 0.006 |
| FGOP-TDNN | SVR | 0.441 ± 0.007 |
| FGOP-CTC-AF-Norm | SVR | 0.581 ± 0.006 |
| FGOP-TDNN | GOPT | 0.605 ± 0.002 |
| **FGOP-CTC-AF-Norm** | **GOPT** | **0.648 ± 0.002** |

Highest phoneme-level PCC reported on this dataset by anyone: **0.693** [R, cited as ref 42].

### 6.2 What that means for plan/09 §4.5

plan/09 §4.3 computes a **scalar** `gop_raw` and §4.5 maps it through a **logistic with
per-phone offsets**. Read the tables again with that in mind: *scalar GOP + simple regression*
is the **first row of both tables**. It scores **PCC 0.25** with a TDNN and **0.433–0.450**
with the best modern CTC formulation.

plan/09 §4.5 says "expect ~0.45–0.6 at phone level". **The top of that range is not reachable
by the architecture plan/09 specifies.** PCC ~0.58–0.65 requires the GOP *feature vector* (the
full per-phone log-posterior-ratio vector, not its scalar reduction) fed to a trained SVR or
GOPT. The gap between 0.45 and 0.65 is entirely "keep the vector, train a regressor" — the
acoustic model is the same.

Three ways forward, in order of how much I'd recommend them:

1. **Preserve the feature vector from day one, even if v2 ships the scalar.** Compute and store
   the per-phone posterior-ratio vector; reduce to a scalar for display. Then upgrading to an
   SVR is a calibration-asset change, exactly the "recalibration is a data change, not a code
   change" property plan/09 §4.5 already wants. If you throw the vector away in v2, v3 is a
   rewrite. **This is nearly free and it is the single highest-leverage decision in the design.**
2. **Ship a small SVR in v2.** speechocean762 is CC BY 4.0, free for commercial use, 520 MB
   [V, [OpenSLR 101](https://www.openslr.org/101/)]. A per-phone SVR trained offline is a few
   hundred KB of assets. This is what moves you from 0.45 to ~0.58.
3. **GOPT-style rescoring** — plan/09 §6 open question 6 defers this. Right call; it's a
   transformer over GOP features and the marginal gain (0.581 → 0.648) is smaller than the gain
   from step 2.

Also note the aligner-free framing: GOP-CTC-AF outperforms self-aligned GOP-SA, and the paper
shows the advantage comes from using utterance context. But plan/09's forced-alignment approach
is still the right *product* choice, because you need the time spans for tap-to-replay,
heatmaps, and shadowing regardless of what the scoring formula wants. Get alignment for the UX,
compute the score with the better formula.

### 6.3 Do not confuse phoneme-level with utterance-level PCC

A June 2026 paper reports "PCC improves from 0.60 to 0.66" and cites a supervised baseline at
0.807/0.848/0.843 ([Light-weight Pronunciation Assessment via Discrete Speech Token Surprisal,
arXiv:2606.19910](https://arxiv.org/pdf/2606.19910)) [R]. Those are **utterance-level**.
Utterance-level PCC runs far higher than phoneme-level on this corpus because utterance scores
are smoother. Any BandReady doc that quotes a correlation must state the level, or a future
reader will compare 0.45 against 0.85 and conclude the pipeline is broken.

### 6.4 Honest UX consequence

At phoneme-level PCC ~0.45, roughly 20 % of variance in expert judgement is explained. That is
a real signal and it is worth shipping. It is **not** a per-word verdict. plan/09's framing
("signal, not verdict") is correct — hold that line against the temptation to show a crisp
number, and prefer showing the top-N worst words plus the n-best competitor phones (the Azure
pattern, §5.1) over a precise-looking 31/100.

---

## 7. The licence problem nobody has written down yet

Any espeak-based G2P pulls **GPL-3.0** into a distributed binary.

| Package | Licence | Source |
|---|---|---|
| `phonemizer` 3.4.0 | **GPLv3+** | PyPI classifier [V] |
| `phonemizer-fork` 3.3.2 | **GPLv3+** | PyPI classifier [V] |
| espeak-ng (bundled by `espeakng-loader`) | **GPL-3.0** | [espeak-ng repo](https://github.com/espeak-ng/espeak-ng) [V] |
| `praat-parselmouth` 0.4.7 | **GPLv3+** | PyPI classifier [V] |
| `g2p-en` 2.1.0 | Apache-2.0 | PyPI [V] |
| `gruut` 2.4.0 | MIT | PyPI classifier [V] |

BandReady's root `LICENSE` is Apache-2.0 [V]. GPL-3.0 and Apache-2.0 are one-way compatible:
you may combine them, but **the combined distributed work goes out under GPL-3.0**.

**The finding that changes the shape of this problem:** you are already exposed.
`kokoro-onnx` 0.5.0 — the shipped TTS engine (`settings_store.py:75`, `presets.py:294`) —
declares `espeakng-loader>=0.2.4` and `phonemizer-fork>=3.3.2` as hard dependencies [V]. If the
DMG bundles Kokoro's Python environment, **the DMG is already a GPL-3.0 combined work today**.
Adding espeak G2P for pronunciation does not introduce a new licence class; it deepens a
dependency that is already load-bearing.

I am not a lawyer and this is not legal advice. What I can say with confidence is factual:
the licences are what they are, the dependency edges exist, and **this is currently undocumented
anywhere in `docs/`**. Options, listed neutrally:

1. **Accept it.** Relicense the distributed application GPL-3.0 (the sidecar *source* can stay
   Apache-2.0). Simplest, and arguably already the status quo.
2. **Keep espeak out of process.** GPL's boundary is much softer across a subprocess/IPC
   boundary than across a linked library. Costly and fiddly.
3. **Use a permissive G2P.** `g2p-en` (Apache-2.0, CMUdict + a neural fallback, ARPAbet output)
   or `gruut` (MIT). **The cost is real and specific:** you lose the
   espeak-phonemizer-matches-espeak-trained-vocab property from §3.1 and must build and
   maintain an ARPAbet→espeak-token mapping. That mapping is a lossy, bug-prone artefact
   sitting directly under every score.
4. **Reconsider the model.** `bookbot/wav2vec2-ljspeech-gruut` (Apache-2.0, 94 M params,
   377.7 MB) targets the **gruut** phone set, and gruut is MIT. That is a fully permissive
   G2P+acoustic pair at a quarter of the size. Its weakness is training data (LJSpeech is a
   single native speaker) and I have not evaluated it. **If the GPL question turns out to
   matter to this project, this pairing is the one to spike.**

**Recommendation:** decide this explicitly and write it into `13-packaging-distribution.md`
before v2, not after. It is cheap to resolve now and expensive after distribution.

---

## 8. Ranking

**Tier 1 — build this**

1. `facebook/wav2vec2-xlsr-53-espeak-cv-ft`, self-exported int8 ONNX (320 MB [M]), CPU EP,
   numpy CTC Viterbi alignment, `max_q` restricted to English phones (§3.2), **feature vector
   preserved** (§6.2), calibrated on speechocean762. Expect phoneme-level PCC ~0.45 with a
   scalar+logistic, ~0.58 once you add the per-phone SVR. Latency ~0.7 s per 10 s of audio on
   current Apple Silicon [M].

**Tier 2 — real options, take one if Tier 1 blocks**

2. `facebook/wav2vec2-lv-60-espeak-cv-ft` — same vocab, same size, English-only pretraining.
   A cheap A/B: identical integration, possibly cleaner English posteriors.
3. `bookbot/wav2vec2-ljspeech-gruut` + gruut G2P — 377.7 MB, fully permissive licence chain,
   4× cheaper. **The answer if the GPL question (§7) forces a permissive stack.** Unvalidated.
4. `mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme` — Apache-2.0, fine-tuned on non-native
   speech, which is directly on-mission for the accent rule. Unvalidated by me; worth a spike.

**Tier 3 — dev-time only, never runtime**

5. `torchaudio.functional.forced_align` with `WAV2VEC2_ASR_BASE_960H` — the alignment oracle.
   Apache-2.0 weights. Never `MMS_FA`.
6. speechocean762 (CC BY 4.0, 520 MB) — calibration and regression corpus.
7. Azure Pronunciation Assessment — a paid dev-machine yardstick for *mechanism*, with its
   native-proximity definition explicitly rejected as *policy*.

**Rejected** — see §0. `MMS_FA` and `mms-300m` (CC-BY-NC), charsiu and `wavlm-large`
(unlicensed), MFA (conda/Kaldi), Azure as a runtime (no container exists), CoreML EP
(measurably slower).

---

## 9. Corrections to `docs/plan/09-pronunciation-assessment.md`

| § | Says | Should say | Conf |
|---|---|---|---|
| §2(b) | Recommends `MMS_FA` (~300 M, ~1.2 GB) | `MMS_FA` is **CC-BY-NC-4.0** and unusable. Use `WAV2VEC2_ASR_BASE_960H` as the test oracle | [V] |
| §2(c) | "one ~300 MB int8 ONNX model" | Confirmed: **320 MB** with MatMul-only quantisation (308 MB if Conv quantised, but `ConvInteger` fails on CPU EP) | [M] |
| §2(c) | Vocab quirk = "non-standard IPA combos" | The vocab is **multilingual**; Mandarin/French/German phones can win `max_q` and penalise L1-coloured but intelligible speech. Restrict the competitor set | [V]+[I] |
| §4.0 | fp16 variant (~630 MB) as an accuracy toggle | int8 costs ~1.2× latency, not accuracy-critical per se. Measure the accuracy delta before spending 630 MB of a slow connection | [M] |
| §4.2 | CoreML EP on macOS, CPU elsewhere | **CPU EP everywhere.** CoreML supports 169/643 nodes, 121 partitions, and is slower | [M] |
| §4.5 | "expect ~0.45–0.6 at phone level" | Scalar GOP + logistic ≈ **0.43–0.45**. 0.58–0.65 needs the **feature vector** + SVR/GOPT | [R] |
| §4.5 | — | Add: preserve the GOP feature vector in v2 even though v2 displays a scalar | [I] |
| §4.7 | M-series CoreML ~1–2 s / 15 s | Measured M5 CPU: **~1.0 s / 15 s fp32, ~0.8 s int8**. Pin threads to ~4 | [M] |
| §4.7 | — | Add: RTF degrades 0.068 → 0.115 from 10 s → 60 s. Chunking is a latency fix too | [M] |
| §4.1 | phonemizer + espeakng-loader, "no system install" | True, and **GPL-3.0**. Already pulled in by `kokoro-onnx`. Undocumented anywhere in `docs/` | [V] |
| §2(e) | Azure is an opt-in cloud plugin | Also: **no pronunciation-assessment container exists**, and Speech containers can't run unmetered. Architecturally unavailable offline | [V] |
| §0 | Accent policy | Azure's `AccuracyScore` is defined as native-proximity — cite it as the explicit counter-example | [V] |
| §3 | v1 ships confidence-derived scores | v1 should ship `score = None`. Whisper `probability` is decoder next-token probability = lexical predictability | [V] |
| Open Q1 | Latency unmeasured | Partly answered for Apple Silicon (§2). **x86 still unmeasured** | [M] |
| Open Q4 | CoreML coverage needs a spike | **Answered: don't use it** | [M] |
| §8 | Cites arXiv 2603.25150, 2507.16838, 2506.02080 | All three resolve. 2603.25150 = "Goodness-of-pronunciation without phoneme time alignment" | [V] |

---

## 10. What I could not verify

- **x86 / Windows latency.** No x86 hardware here. plan/09 §4.7's Windows rows remain estimates.
  Do not print them in-app.
- **Real-weight accuracy.** My benchmark uses correct shapes with random weights. Latency is
  faithful; nothing about output quality is measured. The speechocean762 correlations in §6 are
  other people's numbers on their own models.
- **Actual params of the espeak checkpoints.** The HF API exposes no safetensors header for
  them. ~316 M is derived from 1263.5 MB ÷ 4 bytes, corroborated by
  `vitouphy/wav2vec2-xls-r-300m-timit-phoneme` reporting 315,483,820 params at 1262.0 MB.
- **MFA `english_mfa` model licence.** Search results say CC BY 4.0; I did not fetch the model
  page. Moot — MFA is rejected on packaging grounds.
- **SpeechAce on-premise availability.** Undocumented publicly.
- **Whether the DMG actually bundles `kokoro-onnx`'s deps.** I read `pyproject.toml` and
  `settings_store.py`, not the packaging pipeline. The GPL conclusion in §7 is conditional on it.
- **Quality of `bookbot/wav2vec2-ljspeech-gruut` and
  `mrrubino/...-l2-arctic-phoneme`.** Both are Tier-2 recommendations based on licence, size,
  and training data. Neither is evaluated.

---

## 11. Sources (all fetched 2026-08-01)

**Models and licences** — HuggingFace API (`/api/models/{id}?blobs=true`), plus raw
`vocab.json` and `config.json`:
[wav2vec2-xlsr-53-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft) ·
[wav2vec2-lv-60-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-lv-60-espeak-cv-ft) ·
[wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h) ·
[mms-300m](https://huggingface.co/facebook/mms-300m) ·
[wavlm-large](https://huggingface.co/microsoft/wavlm-large) ·
[charsiu/en_w2v2_fc_10ms](https://huggingface.co/charsiu/en_w2v2_fc_10ms) ·
[bookbot/wav2vec2-ljspeech-gruut](https://huggingface.co/bookbot/wav2vec2-ljspeech-gruut) ·
[vitouphy/wav2vec2-xls-r-300m-timit-phoneme](https://huggingface.co/vitouphy/wav2vec2-xls-r-300m-timit-phoneme) ·
[mrrubino/...-l2-arctic-phoneme](https://huggingface.co/mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme) ·
[KoelLabs/xlsr-timit-b0](https://huggingface.co/KoelLabs/xlsr-timit-b0)

**Alignment** — [torchaudio MMS_FA (CC-BY-NC-4.0)](https://docs.pytorch.org/audio/stable/generated/torchaudio.pipelines.MMS_FA.html) ·
[WhisperX (BSD-2-Clause; `alignment.py` line 33)](https://github.com/m-bain/whisperX) ·
[MFA GitHub (MIT)](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner) ·
[MFA installation (conda required)](https://montreal-forced-aligner.readthedocs.io/en/latest/installation.html) ·
[mfa-models releases (english_mfa 92.2 MB)](https://github.com/MontrealCorpusTools/mfa-models/releases) ·
[charsiu (MIT code, unlicensed weights, last push 2022-09-19)](https://github.com/lingjzhu/charsiu)

**GOP research** — [Segmentation-free Goodness of Pronunciation, arXiv:2507.16838](https://arxiv.org/pdf/2507.16838v2) (Table III) ·
[speechocean762 corpus paper, arXiv:2104.01378](https://arxiv.org/pdf/2104.01378) (Table 2) ·
[Automatic Pronunciation Assessment — A Review, arXiv:2310.13974](https://arxiv.org/html/2310.13974) ·
[Enhancing GOP in CTC-Based MDD with Phonological Knowledge, arXiv:2506.02080](https://arxiv.org/pdf/2506.02080) ·
[GOP without phoneme time alignment, arXiv:2603.25150](https://arxiv.org/abs/2603.25150) ·
[Light-weight PA via Discrete Speech Token Surprisal, arXiv:2606.19910](https://arxiv.org/pdf/2606.19910) ·
[Quantifying Bias in ASR, arXiv:2103.15122](https://arxiv.org/pdf/2103.15122)

**Data** — [speechocean762 on OpenSLR (CC BY 4.0, 520 MB)](https://www.openslr.org/101/)

**Commercial** — [Azure Pronunciation Assessment how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) ·
[Azure Speech containers overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-container-overview) ·
[SpeechAce API plans](https://www.speechace.com/api-plans/)

**Licences** — PyPI JSON API for `phonemizer`, `phonemizer-fork`, `kokoro-onnx`, `gruut`,
`g2p-en`, `praat-parselmouth`, `whisperx`, `montreal-forced-aligner`, `ctc-forced-aligner` ·
[espeak-ng (GPL-3.0)](https://github.com/espeak-ng/espeak-ng)

**Local sources read** —
`sidecar/bandready/pron/analyze.py` · `sidecar/pyproject.toml` · `LICENSE` ·
`sidecar/.venv/lib/python3.11/site-packages/faster_whisper/transcribe.py` (line 1748) ·
`docs/plan/09-pronunciation-assessment.md`
