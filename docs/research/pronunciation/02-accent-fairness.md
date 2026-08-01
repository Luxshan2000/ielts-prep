# 02 — Accent fairness in pronunciation assessment

**PR-2:accent-fairness · research briefing · written 2026-08-01**

Scope: the evidence that automatic pronunciation assessment penalises non-native accents at equal
intelligibility, what the literature proposes instead, what IELTS itself actually rewards, and a
concrete spec for BandReady's `sidecar/bandready/pron/` module.

This is not a "be careful" memo. §5 is the implementable part; §1–§4 exist to justify it. If you are
implementing, read §3.2 (what IELTS actually assesses), §5 (the spec), and §6 (copy rules), and treat
§1–§2 as the citation trail.

**Every URL cited below was fetched during this research.** Where I could not fetch a source I say so
in-line and downgrade the claim; those are marked ⚠️. Confidence tags are on §7's ledger.

---

## 0. TL;DR for the implementer

Eight decisions, all of which are code-level and none of which need a new model:

1. **`proxy-v1` is currently an accent detector wearing a pronunciation-score costume.**
   `analyze.py:396 score_from_confidence()` maps faster-whisper's per-word `probability` straight to a
   0–100 `pron_scores.score`. ASR word confidence is *demonstrably lower for South-Indian, East-Indian
   and other L2 accents at equal content* (§1.1). Persisting that as a per-word score, and colouring it
   green/amber/red at `BAND_GREEN=80 / BAND_AMBER=55`, means a Tamil-L1 user with perfectly intelligible
   speech gets a redder heatmap than a Home-Counties user reading the same passage. **Fix: stop writing
   the confidence into `score`. Write it into a new `evidence_json` field and leave `score` NULL for
   `proxy-v1`.** `pron_signals()` already does the right thing at line 830 (`"score": None`) — the
   storage layer and the heatmap do not.
2. **Add a `fl_tier` (functional load) field to every contrast and never render a low-FL item red.**
   θ/ð and v/z are documented as *low* functional load — they barely affect intelligibility — while
   p/b, l/r, bit/bat and beet/bit are *high* (§2.2). Six of the ~46 shipped minimal pairs target the
   low-FL θ contrasts.
3. **Add a self-declared `profile.l1` setting and an L1 expected-variation table (§5.4).** A
   substitution that is in the learner's L1 table *and* is applied consistently is an **accent feature**,
   not an error. Label it, explain it, do not score it.
4. **Add a consistency test (§5.3, gate G3).** Jenkins' criterion — variation is acceptable *if
   consistent* — is directly computable from `pron_scores` grouped by phone.
5. **Promote perception drills.** `pron_drill_attempts` (minimal-pair A/B, stress tap) is the only
   signal in the whole module with **zero accent bias**: it is a forced choice on *listening*, scored
   against an authored key. It should be the primary Pronunciation evidence in v1, not the afterthought.
6. **Score against the learner's own baseline, not a native reference (§5.5).** Deltas are fair even
   when levels are not.
7. **Refuse to compute six things (§5.2)**, including anything named "accent", "native-like",
   "nativeness" or "accuracy vs. a reference voice".
8. **The app must not be stricter than the exam.** IELTS Band 8 explicitly reads
   *"L1 accent has minimal effect on intelligibility"* — i.e. an L1 accent is *present and expected* at
   the second-highest band (§3.1). BandReady must never imply otherwise.

---

## 1. The evidence: machines score accented speech worse at equal intelligibility

### 1.1 ASR error rates diverge sharply by speaker L1 — and Whisper is *more* divergent than the alternatives

The strongest, most directly relevant study for BandReady's user base is Rai, Jaiswal & Mukherjee,
*A Deep Dive into the Disparity of Word Error Rates Across Thousands of NPTEL MOOC Videos*
(ICWSM 2024), which audits **OpenAI Whisper** and YouTube auto-captions on 8,740 hours of Indian
English technical lectures from 332 speakers.
<https://arxiv.org/pdf/2307.10587>

Median WER by speaker's native region (Table, p. 6 of the PDF):

| Native region of speaker | YouTube WER | **Whisper WER** |
|---|---|---|
| North India (Hindi/Punjabi/Marwari belt) | 13.6 % | **10.8 %** |
| West India | 14.4 % | **11.4 %** |
| East India | 14.2 % | **11.6 %** |
| **South India (Tamil, Telugu, Kannada, Malayalam)** | **15.4 %** | **12.4 %** |

The authors attribute the gap explicitly to accent, citing prior work on Tamil, Bengali and Hindi/Urdu
speakers' accented/unaccented syllable frequencies: *"The higher variation in accent of English spoken
by the northern and southern speakers is reflected in the median WER difference for YouTube and Whisper
which are 1.8% and 1.6% respectively."* And on the mechanism: *"the high insertion error rate in both of
the ASRs for South and East Indian speakers could be due to their accent having certain regional
influences."*

Two things matter here and both are load-bearing for BandReady:

- **The worst-served group in the study is exactly BandReady's largest expected user group.** Tamil is
  a Lower-South Dravidian language. South-Indian speakers get the highest WER in *both* systems.
- **The authors' headline caution is about Whisper specifically:** *"while Whisper had better overall
  accuracy than YouTube, disparities were higher in Whisper."* BandReady runs faster-whisper. Lower
  absolute error, **higher** between-group spread — which is the worse property when you are using the
  output as a per-user score.

The same paper documents a second bias that BandReady's `fluency_proxies()` inherits: **slow speech is
transcribed worse**, with the highest insertion-error rate. *"The insertion error rate is lowest for
lectures delivered in fast speech rate while those delivered at a slower pace have a higher insertion
error rate."* L2 speakers are systematically slower than L1 speakers, so `wpm` and `pause_count`
are measured on a transcript that is itself degraded by the learner's slowness — a compounding error.

Corroboration on a global scale: DiChristofano, Shuster, Chandra & Patwari,
*Global Performance Disparities Between English-Language Accents in Automatic Speech Recognition*
(2022), audited commercial English ASR over **2,713 speakers born in 171 countries** from the Speech
Accent Archive, and found service performance had *"a statistically significant relationship to the
political alignment of the speaker's birth country"* relative to US interests, **even after controlling
for linguistic variables**. <https://arxiv.org/abs/2208.01157>
That paper's abstract does not publish per-group WER numbers, so I am citing it for *existence and
persistence of the disparity across every service tested*, not for magnitude.

The most-cited demonstration of the mechanism is Koenecke et al., *Racial disparities in automated speech
recognition*, PNAS 117:7684–7689 (2020) — roughly **2× the WER for Black American speakers vs. white
American speakers across all five of Amazon/Apple/Google/IBM/Microsoft**, attributed to an acoustic-model
gap from insufficient training data. ⚠️ **PNAS returned HTTP 403 to my fetch**; I am citing it as
reported in the related-work section of the NPTEL paper I *did* fetch (*"(Koenecke et al. 2020) have
highlighted the existing racial bias against Black speakers prevalent in state-of-the-art commercial
ASRs"*, <https://arxiv.org/pdf/2307.10587>). Treat the "2×" figure as second-hand.

An accent-and-traits analysis of Whisper specifically (Cambridge Open Engage record for the *JASA Express
Letters* 2024 paper) reports that *"North American English showed superior recognition compared to British
and Irish varieties"* and that *"Native speakers' speech was recognized more accurately than non-native
speakers' utterances"*, with WER correlating to **first-language typology** among other speaker traits.
<https://www.cambridge.org/engage/coe/article-details/6560d31829a13c4d47e7fdff>
⚠️ The publisher's full text (AIP) 403'd; the per-L1 numbers and the reported tone-language-vs-stress-
language ordering are **not verified** here. Do not put those numbers in the app.

### 1.2 Why `proxy-v1` inherits 100 % of that bias

`analyze.py` does this:

```python
def score_from_confidence(confidence: float | None) -> int | None:
    return max(0, min(100, round(float(confidence) * 100)))
```

…and stores the result in `pron_scores.score`, then buckets it green ≥ 80 / amber 55–79 / red < 55.

The chain of inference is: *the ASR was unsure → the sound was unclear → the learner mispronounced it.*
Step one of that chain is the ASR's accent bias, in full, with no discount. Every finding in §1.1 says
that step is conditioned on the speaker's L1. The module's own docstring already concedes this
("a confidence is not a GOP") and `pron_signals()` nulls the score — but `_persist_scores()`,
`persist_standalone()`, `session_aggregates()` (`mean_score`, `pct_words_red`) and `session_results()`
(`level: good|warn|poor`) all publish the biased number. That is the single highest-severity fairness
defect in the current code.

Worth noting the *confound direction* too, which 09 §2(a) already flags: a systematic L1 substitution
that produces a real word is transcribed **confidently as the wrong word**. A Tamil-L1 speaker saying
*wet* as [vet] gets high confidence on "vet" — no flag at all — while the same speaker's correctly
produced but unusual-sounding *accommodation* gets low confidence and goes red. The metric is
anti-correlated with the construct in exactly the cases that matter.

### 1.3 GOP is not the escape hatch: at published operating points it is majority false positives

The planned v2 (09 §4) is CTC-GOP. The most recent public benchmark of exactly that family is Parikh,
Tejedor-Garcia, Cucchiarini & Strik, *Evaluating Logit-Based GOP Scores for Mispronunciation Detection*,
Interspeech 2025. <https://www.isca-archive.org/interspeech_2025/parikh25b_interspeech.pdf>

On **speechocean762** (5,000 utterances, 250 native-Mandarin speakers, five expert annotators, 3,401
phonemes labelled as mispronunciations), at the MCC-optimal threshold:

| Metric | GOP_DNN | GOP_MaxLogit | GOP_Margin | GOP_VarLogit | GOP_Combined |
|---|---|---|---|---|---|
| Precision | **0.333** | 0.257 | 0.089 | 0.195 | 0.139 |
| Recall | 0.466 | 0.571 | 0.672 | 0.621 | 0.642 |
| F1 | 0.388 | 0.354 | 0.157 | 0.297 | 0.228 |
| PCC vs. human phone accuracy (high conf) | 0.295 | **0.456** | 0.191 | 0.357 | 0.319 |

And on MPC (Dutch children reading English): precision **0.184** for GOP_DNN, best-case **0.347**.

Read the precision column again. **At the threshold that maximises the classifier's own quality metric,
roughly two out of every three phones that GOP flags as mispronounced were not judged mispronounced by
the five human experts.** Correlation with human phone-accuracy ratings tops out at r ≈ 0.46, which is
consistent with 09 §4.5's own honest estimate of 0.45–0.6.

This is not an argument against building v2. It is an argument that **a GOP number is evidence, never a
verdict, and must never be the sole basis for a red word.** The false positives are not random either:
the paper names the MPC substitutions driving them — *"Common substitutions include replacing /ð/ → /d/,
/θ/ → /s/, /æ/ → /e/, and diphthong simplifications such as /eɪ/ → /eː/."* Compare that list against
§5.4's L1 tables: **those are precisely the systematic L1-transfer patterns of Tamil, Hindi, Sinhala and
Mandarin speakers.** An ungated GOP threshold will fire hardest on the learners BandReady is built for.

The mechanism behind the false alarms is stated cleanly by Korzekwa, Lorenzo-Trueba, Zaporowski, Calamaro,
Drugman & Kostek, *Mispronunciation Detection in Non-native (L2) English with Uncertainty Modeling*
(ICASSP 2021): conventional systems assume *"phonemes can be recognized from speech with high accuracy"*
and that there is *"a single correct way for a sentence to be pronounced"*. Modelling recognition
uncertainty **and multiple valid pronunciations** raised precision by up to 18 % relative.
<https://arxiv.org/abs/2101.06396>
"Multiple valid pronunciations" is the whole ballgame. It is also a pure-software change, not a model
change: it is a lexicon/allowlist, which is what §5.4 specifies.

### 1.4 Where the bias comes from: training data, and it will not fix itself

Two structural facts:

- **The calibration set is monolingual-L1.** speechocean762 — 09 §4.5's chosen calibration corpus — is
  *"5000 English sentences … All the speakers are non-native, and their mother tongue is Mandarin"*,
  CC BY 4.0, half children / half adults, scored by five experts.
  <https://www.openslr.org/101/>
  A logistic curve fitted on L1-Mandarin accuracy labels encodes **what a Mandarin-accented error looks
  like**. Applying it unmodified to a Tamil or Arabic speaker is transfer without evidence. 09 §0's
  claim that speechocean762 "aligns with intelligibility-first scoring" is half-true: it aligns with
  *human-judged accuracy*, which is better than TTS-similarity, but it is still one L1's error
  distribution. This is the single biggest known unknown in the v2 plan.
- **The APA literature does not systematically treat fairness.** The field review *Automatic
  Pronunciation Assessment — A Review* (arXiv 2310.13974) mentions accent only as a "complication"
  (§2.2 Pronunciation Constructs), notes that speechocean762's L1 column is Chinese alone (Table 1), and
  **does not critique that limited L1 coverage**. <https://arxiv.org/html/2310.13974>
  So: do not expect to inherit a fairness solution from the toolchain. It has to be built here.

---

## 2. What the literature proposes instead

### 2.1 The founding result: accent and intelligibility are only partially coupled

Munro & Derwing, *Foreign Accent, Comprehensibility, and Intelligibility in the Speech of Second Language
Learners*, **Language Learning 45(1):73–97 (1995)** — the study every later paper builds on. Eighteen
native-English listeners transcribed and rated extemporaneous English from ten L1-Mandarin and two L1-
English speakers. Finding, verbatim from the ERIC record:

> "although strength of foreign accent is correlated with perceived comprehensibility and intelligibility,
> a strong foreign accent does not necessarily reduce the comprehensibility or intelligibility of L2
> speech."

<https://eric.ed.gov/?id=EJ519945>

Kang & Hirschi's review restates the three constructs and the correlation structure precisely:
intelligibility = *"the extent to which the speaker's intended utterance is actually understood by a
listener"*; comprehensibility = *"the degree of difficulty the listener experiences"*; accentedness =
*"the extent to which an L2 learner's speech is perceived to differ from a particular standard"*. And:
*"While Munro and Derwing (1995) found the first two constructs to be highly intercorrelated,
accentedness … was found to be only moderately or weakly correlated with comprehensibility or with
intelligibility."*
<https://par.nsf.gov/servlets/purl/10531394>

**Operational consequence:** accentedness is a *separable* dimension. A system that measures deviation
from a reference is measuring accentedness. BandReady's stated construct is intelligibility. These are
different numbers and the app must compute the second.

Kang & Hirschi also name the frame: Levis's *nativeness principle* vs. *intelligibility principle*, and
note *"the number of English users who speak varieties historically considered to be standard (e.g.,
British, American, etc.) are now in the minority"* — and that a shared-L1 listener boost exists (Indian
listeners scored better on Indian-accented listening input), which is a reminder that "intelligible" is
audience-relative, not absolute.

### 2.2 Functional load — the most implementable idea in the whole literature

Kang & Moran (2014), analysing 120 Cambridge English Language Assessment spoken responses, as reported
in Kang & Hirschi:

> "The high FL errors had large effects on perceptual scales (e.g., p/b, l/r, or bit vs. bat, beet vs.
> bit), while the low FL errors had only a minimal impact (e.g., θ/ð, v/z or pooh/poor)."

<https://par.nsf.gov/servlets/purl/10531394>

Also from the same source: even C2 speakers still make segmental errors — *"highly proficiency (C2)
learners still make segmental errors, but their high functional errors dropped drastically as their
proficiency increased."* So the *presence* of segmental deviation is not a proficiency signal; the
*functional load* of the deviation is.

And a priority ordering for pronunciation features against CEFR proficiency (Kang 2013, same source):
**stress/pitch first, then fluency, then segmental errors, then tone choices** — with stress/pitch and
fluency together explaining over 58 % of proficiency judgements, and *"segmental errors and intonation
somewhat weakly contributed"*.

**This inverts BandReady's current emphasis.** `analyze.py` is entirely segmental-plus-crude-fluency. The
features the literature ranks highest — word stress, sentence stress/prominence, pitch range — are the
ones marked "v2" and left `None`. The `word_stress_tap` drill already in `WORD_STRESS_ITEMS` is closer to
the construct than the whole confidence heatmap.

### 2.3 The Lingua Franca Core — an explicit core/non-core split

Jenkins, *The Phonology of English as an International Language* (OUP, 2000), proposes an inventory of
features necessary for international intelligibility:

**Core (needed):** all English consonants **except /θ/ and /ð/**; word-initial consonant clusters preserved;
**vowel length contrasts** (*pill* vs *peel*); pre-fortis clipping; the vowel /ɜː/; **nuclear (tonic) stress
placement**.
**Non-core (not needed):** /θ/, /ð/ — substitutable with /f/, /v/, /t/, /d/, /s/, /z/; **vowel quality**
(variation acceptable **if consistent**); dark /l/; **word stress**; intonation/tone patterns.

⚠️ Source fetched: <https://elfpron.wordpress.com/2013/11/21/what-is-the-lfc/> — a specialist ELF-pronunciation
blog, i.e. a **secondary** summary of Jenkins 2000. I could not fetch Jenkins directly, and the ScienceDirect
paper testing the LFC empirically ("the intelligibility of flaps") returned 403. **Confidence MEDIUM.**
It converges with Kang & Moran's independently sourced functional-load list on the item that matters most
here (θ/ð is not intelligibility-critical), which is why I am willing to build on it — but the LFC's
demotion of **word stress** contradicts Kang 2013's ranking of stress *first*, so **do not adopt the LFC
wholesale**. §5 takes the consonant/vowel-quality half and rejects the word-stress half, siding with Kang.

The one LFC clause that is pure gold for implementation: **vowel quality variation is acceptable *if
consistent*.** That is a computable predicate. See gate G3 in §5.3.

### 2.4 L1-aware baselines

Tu, Grabek, Liss & Berisha, *Investigating the role of L1 in automatic pronunciation evaluation of L2
speech*, Interspeech 2018 — uses two acoustic models, *"one trained on L2 speech and the other trained on
L1 speech"*, and reports the combination *"yields improved correlation with human evaluators compared to
systems only using the L2 acoustic model"*, across four L1 backgrounds.
<https://arxiv.org/abs/1807.01738>

Direction of travel: **knowing the learner's L1 makes the machine agree with humans more, not less.** L1
information is a fairness input, not a stereotyping risk, provided it is *self-declared*, *optional*, and
used only to **suppress** flags (never to add them or to lower a score). §5.4 enforces that asymmetry.

Related and consistent: Jahanbin, *Modeling L1 Influence on L2 Pronunciation: An MFCC-Based Framework for
Explainable Machine Learning and Pedagogical Feedback* (2025), which frames L1 transfer as
*"L1-conditioned variation"* feeding *"intelligibility-oriented instruction"* rather than as deficiency.
<https://arxiv.org/abs/2504.13765>

### 2.5 Population-referenced rather than native-referenced scoring

There is an active line arguing the reference distribution should be the *learner population*, not native
speakers — pre-train on native speech, fine-tune on an L2 corpus (L2-ARCTIC), on the grounds that
*"most systems still adopt a native norm, treating deviations from canonical L1 pronunciations as errors"*
and that this is unfair as well as inaccurate.
⚠️ *Beyond Native Norms: A Perceptually Grounded and Fair Framework for Automatic Speech Assessment*,
Applied Sciences 16(2):647 (2026), <https://www.mdpi.com/2076-3417/16/2/647> — **MDPI returned 403 to my
fetch; the quoted phrasing is from the search index, not from the paper.** Cite it as a pointer for a
future reader, not as support for a decision. **Confidence LOW; do not build on this one.**

The verified, buildable version of the same idea for BandReady is §5.5: **reference the learner against
themselves**.

### 2.6 What this adds up to

Reference-free / self-referenced scoring is not an exotic research posture here — it is the only honest
option given that (a) the ASR that produces our evidence is measurably L1-biased (§1.1), (b) the GOP that
will produce v2's evidence is majority-false-positive at published thresholds (§1.3), and (c) the
calibration corpus is one L1 (§1.4). Absolute cross-user pronunciation levels are not defensible on this
stack. **Within-user change is.**

---

## 3. What IELTS itself assesses under Pronunciation

The app must not invent a stricter standard than the exam. So: what is the exam's standard, verbatim?

### 3.1 The public band descriptors, Pronunciation column, verbatim

Transcribed from the official PDFs. I fetched two independent official copies and they agree:
Cambridge English's <https://assets.cambridgeenglish.org/webinars/ielts-speaking-band-descriptors.pdf>
and IELTS.org's CDN copy
<https://assets.ctfassets.net/unrdeg6se4ke/4HClJPN2BGdO1fcc018Gz9/f5e625eb26d075a4d8b5151da0b90709/Speaking-Band-descriptors.pdf>
(the latter's Band 5 cell is a layout bug that duplicates the Grammar column; the Cambridge copy and
UCLES's teacher pack both carry the correct Band 5 text, which is the one given below).

| Band | Pronunciation |
|---|---|
| **9** | • uses a full range of pronunciation features with precision and subtlety<br>• sustains flexible use of features throughout<br>• **is effortless to understand** |
| **8** | • uses a wide range of pronunciation features<br>• sustains flexible use of features, with only occasional lapses<br>• **is easy to understand throughout; L1 accent has minimal effect on intelligibility** |
| **7** | • shows all the positive features of Band 6 and some, but not all, of the positive features of Band 8 |
| **6** | • uses a range of pronunciation features with mixed control<br>• shows some effective use of features but this is not sustained<br>• **can generally be understood throughout, though mispronunciation of individual words or sounds reduces clarity at times** |
| **5** | • shows all the positive features of Band 4 and some, but not all, of the positive features of Band 6 |
| **4** | • uses a limited range of pronunciation features<br>• attempts to control features but lapses are frequent<br>• **mispronunciations are frequent and cause some difficulty for the listener** |
| **3** | • shows some of the features of Band 2 and some, but not all, of the positive features of Band 4 |
| **2** | • **speech is often unintelligible** |
| **1** | (no rateable language) |
| **0** | does not attend |

Read the bolded clauses as a column. The entire scale's discriminating dimension is **listener effort**:
*effortless → easy → generally understood → some difficulty → often unintelligible*. That is Munro &
Derwing's comprehensibility/intelligibility pair, near-verbatim, in an operational rubric.

**The word "accent" appears exactly once in the whole column: at Band 8, and it appears as a permitted
condition, not a penalty.** *"L1 accent has minimal effect on intelligibility."* The descriptor takes for
granted that a Band 8 candidate **has** an L1 accent. Nothing anywhere in the scale mentions British,
American, RP, General American, native-likeness, or approximation to any model.

Nothing mentions specific phonemes either. There is no θ. There is no vowel inventory. The only
segmental reference in the whole column is Band 6's *"mispronunciation of individual words or sounds
reduces clarity at times"* — and even that is subordinated to clarity.

### 3.2 What the examiner is actually asked — the four questions

Cambridge/UCLES's official teacher pack *Assessing Speaking Performance – IELTS* (© UCLES 2011,
cambridgeenglish.org) contains the examiner-facing worksheet. The **Pronunciation** sheet asks exactly
four questions and no others:

1. **Can the speaker be generally understood?**
2. **Are individual sounds clear? Are they correctly produced?**
3. **Does the speaker use word stress and sentence stress correctly?**
4. **Is the speaker's intonation appropriate?**

<https://ielts.ch/wp-content/uploads/2021/04/assessing-IELTS-speaking.pdf>

There is **no fifth question about accent.** Note also the ordering: intelligibility first, segmentals
second, **stress third and intonation fourth — both above zero and both currently unimplemented in
BandReady**, and both ranked *above* segmentals by Kang 2013 (§2.2).

This four-question sheet is the best available specification of the construct BandReady is trying to
approximate, and it is short enough to implement directly. **§5.1 maps BandReady's metrics onto these
four questions one-for-one.** If a metric does not serve one of these four questions, it does not belong
in the Pronunciation signal.

### 3.3 The independent-testing critique — why we should not over-claim precision

Kang & Hirschi are pointed about the descriptors' own vagueness:

> "descriptors for Bands 7, 5, 3 are not specified explicitly, as their descriptors overlap with adjacent
> band levels (i.e. Band 7: shows all the positive features of Band 6 and some, but not all, of the
> positive features of Band 8). Indeed, the relationship between pronunciation features and level-specific
> criteria is still very difficult to determine."

…and on Band 9: *"We can see comprehensibility (effortless to understand) being a part of the measurement
construct, but it is rather ambiguous to identify what 'flexible use of features' actually means."*
<https://par.nsf.gov/servlets/purl/10531394>

**Implication for BandReady:** the target itself has ±1-band ambiguity at the odd bands. Emitting a
Pronunciation sub-band with the confidence of a decimal is over-claiming against a rubric that is
explicitly interpolative at 3, 5 and 7. Prefer a band **range** or a directional verdict.

### 3.4 What the exam does *not* say, that coaching material does

Widely-circulated IELTS coaching content states the position as *"examiners do not mark down for accents
themselves… the question is: does your accent cause difficulties for the listener?"*
<https://ieltsliz.com/ielts-speaking-accent-british-us-or-other/> — this is a **coaching blog, not an
official source**, and I cite it only because it is representative of what BandReady's users will already
have read. It happens to be a fair paraphrase of the descriptors in §3.1, and it sets the user's
expectation that the app must match. If BandReady is harsher than the coaching blogs, users will
correctly conclude the app is wrong.

---

## 4. Which accents suffer most, and the mechanism

For each L1 below I give the **documented transfer patterns** (cited), then the **fairness risk** — the
specific way BandReady's current or planned pipeline would misfire on that group. §5.4 turns these into
data.

### 4.1 Tamil (largest expected user group)

Sources: Jain, Pal, Vuppala, Ghosh & Yarra, *An Investigation of Indian Native Language Phonemic Influences
on L2 English Pronunciations*, Interspeech 2023 (18 Indian L1s, Indic TIMIT, 80 L2 speakers)
<https://www.isca-archive.org/interspeech_2023/jain23b_interspeech.pdf>; and Shanmugam, *Phonological
Interference in Learning English through Tamil*, Language in India 18(7):231–235 (2018)
<https://www.languageinindia.com/july2018/shanmugamtamilphonologicalinterference.pdf>.

Documented, from Jain et al. (general Indian-English rules relative to RP, validated both data-driven and
in literature) plus the Lower-South / Dravidian regional section:

- **/t/, /d/ → retroflex /ʈ/, /ɖ/** — general Indian; *"Indian languages lack alveolar stops and dental
  fricatives, so speakers substitute these with retroflex and dental stops"*.
- **/θ/ → /t̪ʰ/ or /t̪/; /ð/ → /d̪/** — general Indian, same rule.
- **Lax→tense vowel substitution: /ɛ/→/e/, /ʌ/→/ə/, /ɪ/→/i/, /ʊ/→/u/** — general; *"All vowel substitution
  rules are general as they are validated by the general characteristics of the native languages."*
- **/z/ → /s/, and voiced/voiceless interchange generally** — *"verified as a behaviour of Dravidian
  language speakers, especially for Tamil or Telugu."*
- **No aspiration contrast at all** — *"Tamil lacks aspirated consonants entirely. The Tamil character set
  also lacks the provision for voiced consonants; all such sounds occur due to the language phonotactics."*
- **Vowel length is contrastive in Tamil** — so length is *preserved*, which is good news: vowel length is
  an LFC core feature and Tamil speakers have it natively.

From Shanmugam (2018), Tamil-specific:

- **/v/–/w/ merger**: *"The Tamil speakers of English have only one sound for both [v]… they use labio-dental
  fricative /v/ in place of the semivowel /w/. For example, the word wet /wet/ is pronounced as [vet]."*
- **Diphthong monophthongisation**: /eɪ/→[eː] (*late*→[leːt]), /əʊ/→[oː] (*load*→[loːd], *post*→[poːst]),
  /eə/→[eː] (*care*→[keːr]), /ɪə/→[iː] (*period*→[piːr…]), /ʊə/→[uː] (*tour*→[tuːr]); /ɔɪ/ produced with an
  unrounded first element. Tamil has two diphthongs to English's eight.
- **Rhoticity**: *"The Tamil speakers do not leave a sound unpronounced in a sequence. They always pronounce
  it"* — post-vocalic /r/ is realised.
- **No schwa reduction, no weak forms, level stress**: *"Tamil is not a stressed language in the sense
  English is… Tamil speakers speak English with a kind of regular stress pattern mildly stressing all the
  syllables. The concept of strong and weak form is not observed."* *development* → [develpment].
- **Cluster breakup**: *"in Tamil the custom is to have a vowel preceded or followed by one consonant only"*
  → epenthesis in clusters; syllabic nasals/laterals largely absent.

**Fairness risk, concrete:**
- The `θ–s` and `θ–t` minimal pairs in `BUILTIN_MINIMAL_PAIRS` (think/sink, thick/sick, thin/tin,
  three/tree) target a **low-functional-load** contrast that Tamil systematically neutralises and that
  neither Kang & Moran nor the LFC treat as intelligibility-critical. Four of 26 built-in pairs, plus the
  pack's two `ð–d` pairs, are pointed at a non-problem. Red-flagging these is textbook accent-penalising.
- The `v–w` pairs (vest/west, vine/wine) target a **real** Tamil intelligibility issue and are correctly
  included — this is the contrast to *promote* for Tamil-L1 users, not θ.
- The **no-schwa-reduction / level-stress** pattern will make `fluency_proxies()` read as unusually even
  and slow; combined with §1.1's slow-speech insertion-error finding, Tamil speakers get a
  double-degraded fluency read.
- Whisper WER on South-Indian speakers is the highest in the NPTEL study (§1.1), so `confidence` →
  `score` is *systematically* lowest for exactly this group.

### 4.2 Sinhala

**Honest gap: I could not verify a peer-reviewed, fetchable source describing Sinhala→English learner
transfer patterns at the phoneme level.** The one Sri Lankan English phonology paper I successfully
fetched — Jayasinghe & Prahalathan, *Phonological Changes in Standard Sri Lankan English Across
Generations*, IJRISS VIII(XII), Dec 2024 <https://rsisinternational.org/journals/ijriss/Digital-Library/volume-8-issue-12/3911-3930.pdf>
— is a 40-speaker PRAAT study of **diphthong shift across generations of Colombo Standard Sri Lankan
English speakers under US/UK media exposure**, not a learner-transfer contrastive analysis. It supports
only one relevant claim: **Sri Lankan English is a variety with its own stable phonology that is itself
changing over time**, i.e. there is no single fixed "Sri Lankan target" to score against either.

The commonly repeated Sinhala claims — /f/↔/p/ confusion, cluster simplification, prothetic/epenthetic
vowels, θ/ð → dental stops — appear in secondary and commercial material I did not consider citable.

**Do not ship a Sinhala L1 table on guesswork.** §5.4 therefore lists Sinhala as
`status: "unpopulated"`, which the gate must treat as *fail-open* (suppress low-confidence flags rather
than emit them). Populating it is a tracked action item (§8).

Note the ASR angle is still evidenced: Sinhala is not among the well-served languages in any audit I
found, and the DiChristofano global study (§1.1) shows the disparity persists across all services for
speakers from the Global South.

### 4.3 Hindi (and the wider Indo-Aryan north)

Source: Jain et al. 2023, same paper.

- All the **general Indian** rules from §4.1 apply: /t,d/ → retroflex, /θ/→/t̪ʰ,t̪/, /ð/→/d̪/, lax→tense
  vowels.
- Indo-Aryan-specific: **schwa deletion** (word-medial and word-final) and **vowel nasalisation** —
  *"these languages (Malwi, Marwari, Hindi and Punjabi) possess both vowel nasalisation as well as
  word-medial and word-final schwa deletion"*; Hindi additionally shows **schwa fronting**.
- **Not** the Dravidian voicing interchange — Hindi keeps the voicing contrast and has phonemic aspiration.

**Fairness risk:** schwa deletion changes syllable count, which will confuse any duration-based
`stress_accuracy` implementation (09 §4.4 predicts the stressed syllable by argmax prominence over aligned
vowels — a deleted schwa has no vowel to align). Hindi speakers must not be scored on syllables the model
inserted and they did not produce. **Also: do not merge "Indian" into one table.** Jain et al.'s whole
result is that the Dravidian and Indo-Aryan patterns differ (voicing interchange vs. schwa deletion).
A single "Indian English" allowlist would over-suppress for Hindi and under-suppress for Tamil.

### 4.4 Arabic

Source: Aldaghri, *Consonant Pronunciation Errors Made by Saudi EFL Students*, Journal of Language Teaching
and Research 16(5):1640–1646 (2025) — 45 learners, spontaneous production, all consonants in all positions.
<https://jltr.academypublication.com/index.php/jltr/article/download/10813/8870/34940>

Measured mispronunciation rates and the substitution actually produced:

| English target | Produced as | % mispronounced |
|---|---|---|
| /p/ (any position) | **/b/** | **100 %** |
| /ŋ/ (final) | /ŋk/ | 95 % |
| /ɹ/ (any position) | trilled /r/ | 80 % |
| /ʒ/ | /g/ or /dʒ/ | 70 % |
| /dʒ/ | /dig/ or /g/ | 60 % |
| /t/ (final) | /d/ | 55 % |
| dark /ɫ/ | clear /l/ | 45 % |
| /v/ | — | 25 % |
| /d/ | — | 25 % |

And explicitly **no difficulty** with: /w/, /j/, /m/, /n/, /s/, /z/, /g/, **/ð/**, /h/.

**Fairness risk, and the sharpest illustration in this document:** /ð/ is *effortless* for Arabic speakers
(Arabic has it) and *systematically absent* for Tamil, Hindi and Mandarin speakers. A single L1-blind
`ð–d` drill is simultaneously **wasted** on one group and **unfair** to three others. Conversely /p/→/b/
is 100 % for Arabic learners and is a **high-functional-load** contrast (p/b is Kang & Moran's first named
example) — so this is a case where the app *should* flag, firmly, because intelligibility genuinely
suffers. `BUILTIN_MINIMAL_PAIRS` has `b–p (final)` but no initial p/b pair, which is the position Arabic
learners struggle with most. Add one.

Dark-/l/ → clear-/l/ at 45 % should be **suppressed**: the LFC lists dark /l/ as explicitly non-core.

### 4.5 Mandarin / Chinese

Sources: He, *Production of English Syllable Final /l/ by Mandarin Chinese Speakers*, Journal of Language
Teaching and Research 5(4):742–750 (2014)
<https://www.academypublication.com/issues/past/jltr/vol05/04/03.pdf>; plus Parikh et al. 2025 (§1.3) and
speechocean762 (§1.4), both of which are L1-Mandarin corpora.

- **Syllable-final /l/**: *"Chinese speakers had great difficulties in producing syllable final /l/"*, using
  three strategies — **vocalization, deletion, and retroflexion**; vocalization after front and back vowels,
  deletion and retroflexion only after back vowels. He cites Hansen (2001) measuring final /l/ **absent in
  23 %** of productions with **8 % feature change**.
- **/θ, ð/ → /s, z/** — He, citing Hansen (2001): *"Native Mandarin speakers replaced the interdental
  fricatives /θ, ð/ with /s, z/, respectively."*
- **Final-stop devoicing** — He, citing Hansen 2001, Major & Faudree 1996, Wang 1995.
- **Cluster simplification via epenthesis, deletion or feature change** — He, citing Broselow et al. 1998,
  Major 1994, Weinberger 1987.
- Parikh et al.'s MPC substitution list (/ð/→/d/, /θ/→/s/, /æ/→/e/, /eɪ/→/eː/) overlaps heavily.

**Fairness risk:** Mandarin is the *only* L1 the v2 calibration curve will actually be fitted on (§1.4).
Mandarin-L1 users will therefore be the **best**-calibrated group and everyone else will inherit their
error distribution. This is an argument for making the calibration constants **per-L1-overridable** in
`assets/calibration_v1.json` from day one, even if only one L1's constants are ever measured — a schema
that admits L1 offsets is cheap now and expensive to retrofit.

Also: final-consonant deletion is a **high-functional-load** issue (it destroys plural/past-tense
morphology and word identity), so unlike θ/ð this one is worth flagging. `works/walks` and `cost/costs`
already cover it — good, keep and promote for Mandarin-L1 users.

---

## 5. THE SPEC

Everything below is a change to `sidecar/bandready/pron/`, `content/core-en/data/`, or the UI copy. No
new model. No new weights. All of it is compatible with the v2 GOP plan in 09 §4.

### 5.1 Metrics we compute — mapped to the examiner's four questions (§3.2)

| # | Metric | Serves examiner Q | Source | Bias status |
|---|---|---|---|---|
| **M1** | `perception_accuracy` — per-contrast accuracy from `pron_drill_attempts` (minimal-pair A/B, stress tap) | Q2, Q3 | already stored | **unbiased** — forced choice, authored key, learner's own accent never enters |
| **M2** | `reference_recovery` — for **read-aloud only**: did the ASR recover each reference word? Boolean per reference token via alignment of hypothesis to `reference_text` | Q1 | `transcribe_words()` + a new aligner | biased (§1.1) → **self-referenced only** (M6) |
| **M3** | `contrast_confusions` — for read-aloud/minimal-pair production: which *specific* contrast was neutralised, with `fl_tier` | Q2 | reference vs. hypothesis diff | biased → gated by §5.3 |
| **M4** | `prosody.stress` — word-stress placement (from `WORD_STRESS_ITEMS` perception, and v2 production) and sentence prominence | **Q3** | drills now; alignment in v2 | mostly unbiased for perception |
| **M5** | `fluency` — `wpm`, `articulation_wpm`, `pause_count`, `long_pause_count`, `pause_ratio` (already computed) | Q1 (indirect) | `fluency_proxies()` | mildly biased (slow-speech insertion errors, §1.1) → self-referenced |
| **M6** | `delta_vs_baseline` — every one of M1–M5 expressed as change vs. this profile's own rolling baseline | all | new, §5.5 | **fair by construction** |
| **M7** | `evidence` — raw `confidence`, `gop_raw` etc., stored but **never rendered as a score** | — | existing | biased; internal only |

Q4 (intonation) is unserved today. 09 §4.4's `intonation_flatness` is the right v2 metric; until then it
stays `null`, which the code already does.

**Storage change:** `pron_scores.score` stays `NULL` for `method='proxy-v1'`. Add a nullable
`evidence_json` TEXT column carrying `{"asr_confidence": 0.42, "source_model": "small"}`. The heatmap
reads `evidence_json` and renders **neutral** (not amber/red) with a "tap to see why" affordance, not a
colour verdict. `session_aggregates()` must stop emitting `mean_score` / `pct_words_red` for `proxy-v1`
(emit `null`, matching `pron_signals()` which already gets this right).

### 5.2 Metrics we refuse to compute — and why, so nobody re-adds them

| Refused | Reason | Enforcement |
|---|---|---|
| **Accentedness / "nativeness" / accent-similarity score** | It is a *separable construct from intelligibility* (§2.1) and it is not in the IELTS rubric at all (§3.1, §3.2) | no field may be named `accent*` except `accent_notice`; add a test asserting so |
| **Automatic accent/L1 classification from audio** | Not needed — L1 is self-declared (§5.4). Inferring ethnicity-correlated attributes from voice for scoring is a bright line | no classifier ships |
| **Absolute per-word 0–100 from ASR confidence** | §1.2 — it is an accent detector | `score_from_confidence()` deleted; `score` NULL for proxy-v1 |
| **Similarity to the Kokoro reference voice (DTW/MCD/spectral distance)** | Scoring against one TTS voice's acoustics is the nativeness principle in numeric form. 09 §0 already forbids it; make it a test | shadowing scores use duration ratio + M1/M3 only, never spectral distance |
| **Red status for a low-functional-load contrast** | §2.2 — θ/ð, v/z have minimal intelligibility impact | `fl_tier == "low"` → max level `info`, never `warn`/`poor` |
| **A vowel-quality penalty where the substitution is consistent** | §2.3 — LFC: quality variation acceptable if consistent. Also 09 §0's "wider tolerance for vowels" | gate G3 |
| **A Pronunciation sub-band as a single decimal** | §3.3 — the rubric is interpolative at bands 3/5/7 | emit a band **range** (`{"low": 6, "high": 7}`) or a direction |

### 5.3 The fairness gate — the algorithm

Runs between "an anomaly was detected" and "the user is told something". Order matters; first gate that
fires wins.

```
classify(observation) -> "accent_feature" | "intelligibility_risk" | "insufficient_evidence"

G0  MIN EVIDENCE
    occurrences(phone_or_contrast, profile, window=last 5 sessions) < 3
      -> "insufficient_evidence"           # never surface a one-off

G1  L1 EXPECTED VARIATION
    profile.l1 is set
      and (expected, observed) in L1_TABLE[profile.l1].substitutions
      and word_was_recovered(observation)    # ASR still returned the reference word,
                                             # or the A/B discriminator picked the right side
      -> "accent_feature"

G2  FUNCTIONAL LOAD
    fl_tier(contrast) == "low"
      -> "accent_feature"                  # θ/ð, v/z, dark-l, r-colouring

G3  CONSISTENCY  (Jenkins' criterion, §2.3)
    substitution_rate(expected -> observed, over all occurrences of `expected`) >= 0.80
      and observed is a stable single alternant (not scattered)
      -> "accent_feature"                  # a systematic mapping is an accent, not a lapse

G4  INTELLIGIBILITY CHECK
    word_was_recovered(observation) is False
      or fl_tier(contrast) == "high"
      -> "intelligibility_risk"

G5  DEFAULT
    -> "insufficient_evidence"             # fail closed: say nothing
```

Notes:

- **G1 requires `word_was_recovered`.** This is the whole point: an L1-typical substitution that still
  lands the right word is *by definition* intelligible, so it is an accent feature. The same substitution
  that loses the word is a genuine risk even for an L1-typical pattern. The L1 table suppresses **flags**,
  never **evidence**, and can never *create* a flag.
- **G3 is computable today** from `pron_scores` grouped by `word`/`expected_ipa`, and becomes much better
  in v2 when `heard_token` exists per phone (09 §4.3 already records it).
- **Fail-open on unknown L1.** `profile.l1 in (None, "unpopulated")` → G1 is skipped, so G2/G3 carry the
  load. Both are L1-independent. This is why Sinhala (§4.2) being unpopulated is survivable.
- **`accent_feature` is not "invisible".** It is shown, in a distinct neutral style, with copy from §6.
  Hiding it would be its own failure: users *want* to know why their speech differs, they just must not be
  marked down for it.
- **`insufficient_evidence` renders as nothing at all.** Given §1.3's precision figures, silence is the
  correct default output of this module far more often than the current code assumes.

### 5.4 The L1 expected-variation table

New file: `content/core-en/data/l1_variation.jsonl`, one row per L1, loaded through the existing
`bandready.content.loader.load_pack_jsonl` path (same mechanism as `pron_pairs.jsonl`). Ships with the
core pack; a user's `profile.l1` is **self-declared, optional, changeable, defaults to unset**, and is
used **only** by gate G1.

Row shape:

```json
{
  "l1": "ta",
  "label": "Tamil",
  "status": "populated",
  "sources": ["jain2023-interspeech", "shanmugam2018-lii"],
  "substitutions": [
    {"expected": "θ", "observed": "t̪",  "fl_tier": "low",    "note": "Tamil has no dental fricative"},
    {"expected": "ð", "observed": "d̪",  "fl_tier": "low"},
    {"expected": "t", "observed": "ʈ",   "fl_tier": "low",    "note": "retroflex for alveolar; general Indian"},
    {"expected": "d", "observed": "ɖ",   "fl_tier": "low"},
    {"expected": "z", "observed": "s",   "fl_tier": "low",    "note": "Dravidian voicing interchange"},
    {"expected": "w", "observed": "v",   "fl_tier": "high",   "note": "v/w merger — real intelligibility cost"},
    {"expected": "ɪ", "observed": "i",   "fl_tier": "medium"},
    {"expected": "ʊ", "observed": "u",   "fl_tier": "medium"},
    {"expected": "ɛ", "observed": "e",   "fl_tier": "low"},
    {"expected": "ʌ", "observed": "ə",   "fl_tier": "low"},
    {"expected": "eɪ","observed": "eː",  "fl_tier": "low",    "note": "diphthong -> monophthong"},
    {"expected": "əʊ","observed": "oː",  "fl_tier": "low"},
    {"expected": "eə","observed": "eː",  "fl_tier": "low"},
    {"expected": "ɪə","observed": "iː",  "fl_tier": "low"},
    {"expected": "ʊə","observed": "uː",  "fl_tier": "low"}
  ],
  "prosody": ["syllable_timed", "no_weak_forms", "no_schwa_reduction", "level_stress"],
  "phonotactics": ["cluster_epenthesis", "no_syllabic_nasal", "rhotic"],
  "promote_contrasts": ["v–w", "l–r", "ɪ–iː", "b–p (final)"],
  "demote_contrasts": ["θ–s", "θ–t", "ð–d", "s–z"]
}
```

Rows to ship (all `substitutions` traceable to §4's cited sources):

- **`ta` Tamil** — as above. Sources: Jain et al. 2023; Shanmugam 2018.
- **`si` Sinhala** — `{"status": "unpopulated", "substitutions": []}`. **Do not guess.** G1 is skipped;
  G2/G3 carry it. See §8 action item.
- **`hi` Hindi** — general Indian set (θ→t̪ʰ/t̪, ð→d̪, t→ʈ, d→ɖ, lax→tense vowels) **minus** the Dravidian
  voicing interchange, **plus** `prosody: ["schwa_deletion", "vowel_nasalisation", "schwa_fronting"]`.
  Source: Jain et al. 2023.
  `promote`: `ɪ–iː`, `l–r`, `b–p`. `demote`: `θ–s`, `θ–t`, `ð–d`.
- **`ar` Arabic** — `{p→b, high}`, `{ŋ→ŋk, medium}`, `{ɹ→r(trill), low}`, `{ʒ→dʒ|g, medium}`,
  `{dʒ→g, medium}`, `{t(final)→d, high}`, `{ɫ→l, low}`; `phonotactics: ["cluster_epenthesis"]`.
  **Explicitly NOT θ/ð** — Arabic speakers have no difficulty with /ð/ (Aldaghri 2025).
  `promote`: **initial `p–b`** (must be authored — the bank only has final position), `ʒ–dʒ`, final `t–d`.
  `demote`: `θ–s`, `θ–t`, `ð–d`, dark-/l/.
  Source: Aldaghri 2025.
- **`zh` Mandarin** — `{θ→s, low}`, `{ð→z, low}`, `{l(final)→∅|ʊ|ɻ, high}`, `{final stop→devoiced, high}`,
  `{æ→e, low}`, `{eɪ→eː, low}`; `phonotactics: ["cluster_reduction", "no_complex_coda"]`.
  `promote`: `-s/-z cluster` (works/walks, cost/costs), final `b–p`, `l–r`, `n–ŋ`.
  `demote`: `θ–s`, `θ–t`, `ð–d`.
  Sources: He 2014 (citing Hansen 2001); Parikh et al. 2025.

**`fl_tier` assignment rule** (so future rows are consistent): `high` if the contrast appears in Kang &
Moran's high-FL exemplar set (p/b, l/r, bit/bat, beet/bit) or destroys word identity/inflection
(final-consonant deletion, cluster loss); `low` if it appears in their low-FL set (θ/ð, v/z) or the LFC
non-core list (vowel quality, dark /l/, r-colouring); `medium` otherwise. Every row carries its
`fl_tier` in `pron_pairs.jsonl` too — see §5.7.

**Privacy/UX constraints on `profile.l1`, non-negotiable:**
- optional; the app is fully functional with it unset
- never inferred from audio, locale, keyboard, or name
- surfaced as *"Which language do you speak at home? We use this only to avoid flagging normal features
  of your accent as mistakes."* — the copy states the **suppressive** purpose explicitly
- stored locally like everything else; never leaves the device
- setting it can only ever **reduce** the number of flags. Assert this in a test.

### 5.5 Self-referenced scoring: the learner's own baseline

The fair number is the delta. Concretely:

- On the first 3 read-aloud / speaking sessions, compute and store a **baseline** per profile:
  median `reference_recovery` rate, median `wpm`, median `pause_ratio`, per-contrast
  `perception_accuracy`. Store as `pron_baselines` (or a JSON blob on the profile — one row, tiny).
- Thereafter every user-facing number is **`current − baseline`**, rendered as
  *"clearer than your first week"* / *"about the same"* / *"a bit less clear than usual"*.
- Absolute levels appear **only** in the two places where an absolute standard genuinely exists:
  (a) perception-drill accuracy (there is a correct answer), and (b) the IELTS band range, which is
  produced by the LLM evaluator from the descriptors and is explicitly a range (§3.3).
- Baselines **re-anchor** if the user is idle > 60 days, so a returning learner is not measured against a
  stale self.

Why this is defensible: every bias documented in §1 is a roughly *constant offset per speaker* — the ASR
is worse at this speaker's accent today and it was equally worse last week. Differencing cancels the
offset. It does not cancel session-to-session noise, which is why G0 requires ≥ 3 occurrences and why
baselines are medians over multiple sessions.

Cross-user leaderboards, percentiles, or "compare to other learners" are **out of scope permanently** —
they would re-import the absolute bias through the back door.

### 5.6 Changes to the v2 GOP plan (09 §4) that must land before v2 ships

1. **`calibration_v1.json` gains an `l1_offsets` map**, even if it ships as `{}`. Retrofitting a per-L1
   offset into a fitted-constants file after v1 users exist is painful; adding an empty map now is free.
   Rationale: §1.4 — the fit is on L1-Mandarin data only.
2. **The GOP threshold must not be tuned to maximise MCC.** §1.3's precision figures are *at* the
   MCC-optimal threshold. For a learner-facing tool, tune for **precision ≥ 0.7** and accept the recall
   collapse. Under-flagging is a mild annoyance; over-flagging a Tamil speaker's normal /t̪/ is the
   documented harm this whole document exists to prevent. Record the chosen threshold and its measured
   precision in `calibration_v1.json` alongside the correlations 09 §4.5 already plans to record.
3. **Never emit a phone-level red without the §5.3 gate.** `heard_token` (09 §4.3) is exactly the
   `observed` value gate G1 and G3 need — wire it straight in.
4. **Vowel tolerance is not a fudge factor, it is gate G3.** 09 §4.5's "per-phone-class offsets, vowels
   wider than consonants" is the right instinct; implement it as the consistency test rather than a flat
   offset, because a *consistent* vowel mapping is an accent and an *inconsistent* one is a real lapse,
   and a flat offset cannot tell them apart.

### 5.7 Content changes

- **Add `fl_tier` to every row of `pron_pairs.jsonl` and to `BUILTIN_MINIMAL_PAIRS`.** Current
  distribution across the 26 built-ins + 20 pack pairs: `θ–s`(2), `θ–t`(2), `ð–d`(2), `s–z`(2) are **low**
  FL — 8 of ~46 items, ~17 % of the bank, aimed at contrasts the literature says barely matter. Keep them
  (they are useful *awareness* content) but tier them so the drill selector and the heatmap can demote
  them.
- **Author the missing high-FL items**: **initial `p–b`** (for Arabic-L1: *pin/bin*, *pack/back*),
  more final-cluster items (for Mandarin-L1), and more `ɪ–iː` / `æ–ʌ` (Kang & Moran's named high-FL
  vowel contrasts, and the ones Tamil/Hindi tense-vowel substitution actually threatens).
- **Drill selection becomes L1-aware** via `promote_contrasts` / `demote_contrasts`: `drill_items()`
  takes an optional `l1` and reorders. It must **never hide** a contrast — only reorder — so a user who
  wants to practise θ still can.
- **`WORD_STRESS_ITEMS` should grow.** Per §2.2, stress ranks *above* segmentals for proficiency, and per
  §3.2 it is examiner question 3. Eight items is thin for what is arguably the highest-value drill in the
  module.

### 5.8 Tests that must exist (`14-testing-strategy.md`)

1. **No score from confidence.** Assert `pron_scores.score IS NULL` for every row with
   `method='proxy-v1'`. Regression-locks §1.2.
2. **L1 can only suppress.** For a fixed synthetic observation set, assert
   `len(flags(l1=None)) >= len(flags(l1=X))` for every shipped `X`. This is the core fairness invariant.
3. **Low-FL never red.** Assert no `level in ("warn","poor")` is ever emitted for a `fl_tier == "low"`
   contrast.
4. **Consistency ⇒ accent.** Feed a synthetic session where /θ/→/t̪/ in 10 of 10 occurrences; assert the
   classification is `accent_feature`, not `intelligibility_risk`. Then feed 4 of 10 with scattered
   alternants; assert it is *not* auto-classified as accent.
5. **Banned-word test on all user-facing copy.** Grep every string that can reach the UI or the LLM
   prompts for the §6 forbidden list (`native`, `nativelike`, `accent-free`, `correct accent`, `proper`,
   `British`, `American`, `standard accent`, `sounds foreign`, `heavy accent`, `broken`). Fail the build.
   Applies to LLM output too — post-filter, do not merely instruct.
6. **`accent_notice` present on every pronunciation response.** Already true across `pron.py`'s routes;
   lock it.
7. **Empty is a valid answer.** Assert the pipeline can return zero flags without erroring or rendering
   an empty-state that implies failure. Per §1.3, silence is often correct.

---

## 6. Feedback copy: what the app says, and what it must never say

### 6.1 The three verdict registers

| Classification (§5.3) | Register | Template |
|---|---|---|
| `accent_feature` | **Neutral, explanatory, never corrective** | *"You produce **think** with a /t/ sound rather than /θ/. This is a normal feature of many accents and listeners understand you — IELTS does not mark it down. If you want to add /θ/ to your range, here's how it's made."* |
| `intelligibility_risk` | **Specific, consequence-first, actionable** | *"In **wet**, the /w/ came out closer to /v/, and the word was heard as **vet**. That one changes the meaning, so it's worth practising. → v–w drill"* |
| `insufficient_evidence` | **Silence** | render nothing |

The `intelligibility_risk` template has a required structure: **word → what happened → what it was heard
as → why that costs meaning → one action.** Never "you mispronounced X". Always "X was heard as Y".
That phrasing is honest about what the system actually observed (a recognition outcome), and it is the
same evidence an IELTS examiner uses ("can the speaker be generally understood?").

### 6.2 Never say

Hard-banned in UI copy, LLM prompts, and LLM *output* (post-filter, per test 5):

- **"native"**, "native-like", "native speaker", "sounds native", "non-native" as an evaluation
- **"correct accent"**, "proper pronunciation", "standard pronunciation", "standard accent"
- **"British"**, "American", "RP", "General American" as a *target* (fine as a factual label on a
  reference voice: *"a British voice reading this"* is fine; *"the British pronunciation"* is not)
- **"accent-free"**, "reduce your accent", "neutralise your accent", "accent reduction"
- **"heavy accent"**, "strong accent" used as a fault
- **"broken English"**, "poor English", "bad pronunciation"
- **"you mispronounced"** — replaced by "was heard as"
- any **numeric accent score**, any **percentile against other users**
- any implication that a phoneme the learner's L1 lacks is a **defect** rather than a **new skill**

### 6.3 Always say / do

- The existing `ACCENT_NOTICE` string is good and should stay verbatim:
  > "IELTS accepts every accent. These scores measure how clearly each sound comes across — not how
  > British or American you sound."
  It is already attached to nine of `pron.py`'s ten route responses. Add it to the tenth
  (`/sessions/{id}/signals`) for uniformity, and **render it on first visit to every pron screen**, as
  09 §5 requires.
- Reference audio is **"one clear example"**, never "the correct version".
- When showing an `accent_feature`, name it as a **feature of a variety**, and where the L1 table has a
  `note`, use it — *"Tamil doesn't have a dental fricative, so /t/ for /θ/ is expected"* is respectful,
  accurate, and more useful than a red square.
- Frame every target as **adding to range**, matching the IELTS descriptors' own wording — the scale
  rewards *"a wide range of pronunciation features"* and *"flexible use"*, not conformity.
- Where the app quotes the standard, quote **the actual descriptor** (§3.1). *"Band 8 says 'L1 accent has
  minimal effect on intelligibility' — an accent is expected at Band 8"* is the single most reassuring and
  most factually defensible sentence this product can say.

### 6.4 The LLM flagger prompt (`FLAG_PROMPT`, `analyze.py:66`) — required edits

The current prompt already contains *"Accent is NOT mispronunciation."* Good, but insufficient: the model
has no idea what *this user's* accent is, and no notion of functional load. Add, verbatim:

```
The candidate's first language is {l1_label}. The following are NORMAL features of
that accent and MUST NOT be flagged, even when they look like errors:
{l1_expected_summary}

Only flag a word when the transcript shows the MEANING was at risk — a different
real word was produced, or the word could not be recovered. Do not flag a word
because it merely sounds different from a British or American model.

These contrasts carry LOW functional load and must never be flagged on their own:
th/s, th/t, th/d, v/z, dark-l, r-colouring.

Prefer returning an empty list. An empty list is a good answer.
```

Where `profile.l1` is unset, substitute *"The candidate's first language is not known."* and keep the
functional-load paragraph — it is L1-independent.

The final line is not decoration. Per §1.3, the base rate of genuine, actionable, transcript-visible
mispronunciation in a five-minute turn is low, and the current prompt's "Maximum 8 entries" reads to a
small model as a quota to fill.

---

## 7. Confidence ledger

| Claim | Confidence | Basis |
|---|---|---|
| ASR WER is systematically higher for South-Indian (incl. Tamil) than North-Indian speakers; Whisper's between-group spread exceeds YouTube's | **HIGH** | Rai et al. ICWSM 2024, 8,740 h, 332 speakers, numbers in §1.1 |
| Accent disparities in ASR persist across every commercial service tested, globally | **HIGH** | DiChristofano et al. 2022, 2,713 speakers / 171 countries |
| Koenecke et al.: ~2× WER Black vs. white US speakers | **MEDIUM** | ⚠️ PNAS 403'd; cited second-hand via Rai et al.'s related work |
| Whisper WER correlates with L1 typology (tone vs. stress-accent ordering) | **LOW** | ⚠️ JASA full text 403'd; only the qualitative preprint record verified. **Do not quote numbers.** |
| GOP precision at MCC-optimal threshold is ~0.33 on speechocean762 and ~0.18–0.35 on Dutch children | **HIGH** | Parikh et al. Interspeech 2025, tables reproduced in §1.3 |
| GOP↔human phone-accuracy correlation tops out ~0.46 | **HIGH** | same |
| GOP false positives concentrate on ð→d, θ→s, æ→e, eɪ→eː — i.e. exactly L1-transfer patterns | **HIGH** | same paper names the substitutions; overlap with §4 is my inference but the lists are literal matches |
| Accentedness is only weakly/moderately correlated with intelligibility & comprehensibility | **HIGH** | Munro & Derwing 1995 (ERIC record); restated in Kang & Hirschi |
| Functional load ordering: p/b, l/r, bit/bat, beet/bit high; θ/ð, v/z low | **HIGH** | Kang & Moran 2014 via Kang & Hirschi, quoted verbatim |
| Stress/pitch + fluency outrank segmentals for proficiency judgements (>58 % contribution) | **MEDIUM-HIGH** | Kang 2013 via Kang & Hirschi; the percentage is reported in a review, not the primary paper |
| LFC core/non-core inventory (θ/ð non-core; vowel quality non-core if consistent; /ɜː/ and nuclear stress core) | **MEDIUM** | ⚠️ secondary blog summary of Jenkins 2000; converges with Kang & Moran on θ/ð. LFC's demotion of word stress is **rejected** here as contradicted by Kang 2013 |
| L1-aware modelling improves agreement with human raters | **MEDIUM-HIGH** | Tu et al. Interspeech 2018 abstract (no effect size verified) |
| Conventional MDD assumes a single correct pronunciation; modelling multiple valid pronunciations raises precision ~18 % relative | **HIGH** | Korzekwa et al. ICASSP 2021 abstract |
| speechocean762 is 5,000 utts / 250 speakers / **L1-Mandarin only** / CC BY 4.0 / 5 expert annotators | **HIGH** | openslr.org/101 + Parikh et al. |
| IELTS Pronunciation descriptors, verbatim | **HIGH** | two independent official PDFs, cross-checked, §3.1 |
| Examiners' four Pronunciation questions; no accent question | **HIGH** | UCLES/Cambridge *Assessing Speaking Performance – IELTS* teacher pack, §3.2 |
| Tamil transfer set (v/w merger, no aspiration, z→s, monophthongisation, level stress, cluster epenthesis) | **HIGH** | Jain et al. 2023 + Shanmugam 2018, both fetched |
| Hindi/Indo-Aryan schwa deletion + nasalisation; **not** Dravidian voicing interchange | **HIGH** | Jain et al. 2023 |
| Arabic: /p/→/b/ 100 %, /ŋ/→/ŋk/ 95 %, final /t/→/d/ 55 %, **/ð/ no difficulty** | **HIGH** | Aldaghri 2025, n=45, table reproduced in §4.4 |
| Mandarin: final /l/ absent 23 %, θ/ð→s/z, final-stop devoicing, cluster reduction | **MEDIUM-HIGH** | He 2014; the 23 %/8 % figures are He citing Hansen 2001, i.e. second-hand |
| **Sinhala transfer patterns** | **NONE — unverified** | ⚠️ No fetchable peer-reviewed learner-transfer source found. §5.4 ships `status: "unpopulated"`. **Do not populate from memory.** |
| Population-referenced ("beyond native norms") scoring frameworks | **LOW** | ⚠️ MDPI 403'd; search-index text only. Pointer, not a basis for a decision |

---

## 8. Open items this briefing could not close

1. **Sinhala L1 table is empty.** Needs a fetchable contrastive-analysis source (candidate leads that I
   could *not* fetch: Widyalankara's *A cause-effect analysis of the phonology of Sri Lankan Englishes*,
   and the University of Kelaniya / Sri Lankan English phonology literature generally). Until then G1 is
   skipped for `si` and G2/G3 carry it. **This is the largest gap in the spec** given the user base.
2. **No per-L1 calibration data exists for anything except Mandarin.** §5.6 item 1 makes the schema ready;
   actually measuring offsets for `ta`/`hi`/`ar` would need a labelled corpus BandReady does not have and
   cannot cheaply build. Interim answer: gates G1–G3, which need no calibration.
3. **The Whisper JASA per-L1 numbers are unverified** (paywall). If someone can get institutional access,
   the tone-language vs. stress-language finding would sharpen §4.5's Mandarin risk assessment.
4. **`word_was_recovered()` needs an aligner.** For read-aloud we have `reference_text` and a hypothesis;
   a simple token-level Levenshtein alignment suffices and is ~40 lines. For free speech there is no
   reference, so G1's recovery test degrades to "the LLM flagger judged meaning was at risk" — weaker.
   09 §4.1's documented circularity limitation applies unchanged.
5. **Nobody calls any of this yet.** `pron.py` exposes ten routes and the UI calls zero of them, and there
   are no tests. That is an opportunity, not a problem: **the fairness gate can be built before the first
   user ever sees a pronunciation score, which is the only time it is cheap.**

---

## 9. Sources

All fetched during this research on 2026-08-01 unless marked ⚠️ (fetch failed — claim downgraded in §7).

**IELTS / assessment standard**
- IELTS Speaking Band Descriptors (public version), Cambridge English —
  <https://assets.cambridgeenglish.org/webinars/ielts-speaking-band-descriptors.pdf>
- SPEAKING: Band Descriptors (public version), IELTS.org CDN —
  <https://assets.ctfassets.net/unrdeg6se4ke/4HClJPN2BGdO1fcc018Gz9/f5e625eb26d075a4d8b5151da0b90709/Speaking-Band-descriptors.pdf>
- *Assessing Speaking Performance – IELTS*, © UCLES 2011, cambridgeenglish.org (examiner worksheet) —
  <https://ielts.ch/wp-content/uploads/2021/04/assessing-IELTS-speaking.pdf>
- ieltsliz.com on accent (coaching blog, cited only as representative user expectation) —
  <https://ieltsliz.com/ielts-speaking-accent-british-us-or-other/>

**Accent bias in ASR**
- Rai, Jaiswal & Mukherjee (ICWSM 2024), *A Deep Dive into the Disparity of Word Error Rates Across
  Thousands of NPTEL MOOC Videos* — <https://arxiv.org/pdf/2307.10587>
- DiChristofano, Shuster, Chandra & Patwari (2022), *Global Performance Disparities Between
  English-Language Accents in Automatic Speech Recognition* — <https://arxiv.org/abs/2208.01157>
- Whisper accents/traits study, Cambridge Open Engage record —
  <https://www.cambridge.org/engage/coe/article-details/6560d31829a13c4d47e7fdff>
- ⚠️ Koenecke et al. (2020), PNAS 117:7684–7689 — <https://www.pnas.org/doi/10.1073/pnas.1915768117> (403)

**GOP / pronunciation assessment**
- Parikh, Tejedor-Garcia, Cucchiarini & Strik (Interspeech 2025), *Evaluating Logit-Based GOP Scores for
  Mispronunciation Detection* — <https://www.isca-archive.org/interspeech_2025/parikh25b_interspeech.pdf>
- Korzekwa et al. (ICASSP 2021), *Mispronunciation Detection in Non-native (L2) English with Uncertainty
  Modeling* — <https://arxiv.org/abs/2101.06396>
- Tu, Grabek, Liss & Berisha (Interspeech 2018), *Investigating the role of L1 in automatic pronunciation
  evaluation of L2 speech* — <https://arxiv.org/abs/1807.01738>
- *Automatic Pronunciation Assessment — A Review* — <https://arxiv.org/html/2310.13974>
- Jahanbin (2025), *Modeling L1 Influence on L2 Pronunciation* — <https://arxiv.org/abs/2504.13765>
- speechocean762 corpus page (license, composition) — <https://www.openslr.org/101/>
- ⚠️ *Beyond Native Norms*, Applied Sciences 16(2):647 (2026) — <https://www.mdpi.com/2076-3417/16/2/647> (403)

**Intelligibility, functional load, ELF**
- Munro & Derwing (1995), Language Learning 45(1):73–97, ERIC record — <https://eric.ed.gov/?id=EJ519945>
- Kang & Hirschi, *Pronunciation Assessment Criteria and Intelligibility* (IATEFL PronSIG) —
  <https://par.nsf.gov/servlets/purl/10531394>
- ⚠️ Lingua Franca Core summary (secondary source for Jenkins 2000) —
  <https://elfpron.wordpress.com/2013/11/21/what-is-the-lfc/>

**L1 transfer patterns**
- Jain, Pal, Vuppala, Ghosh & Yarra (Interspeech 2023), *An Investigation of Indian Native Language
  Phonemic Influences on L2 English Pronunciations* —
  <https://www.isca-archive.org/interspeech_2023/jain23b_interspeech.pdf>
- Shanmugam (2018), *Phonological Interference in Learning English through Tamil*, Language in India
  18(7):231–235 — <https://www.languageinindia.com/july2018/shanmugamtamilphonologicalinterference.pdf>
- Aldaghri (2025), *Consonant Pronunciation Errors Made by Saudi EFL Students*, JLTR 16(5):1640–1646 —
  <https://jltr.academypublication.com/index.php/jltr/article/download/10813/8870/34940>
- He (2014), *Production of English Syllable Final /l/ by Mandarin Chinese Speakers*, JLTR 5(4):742–750 —
  <https://www.academypublication.com/issues/past/jltr/vol05/04/03.pdf>
- Jayasinghe & Prahalathan (2024), *Phonological Changes in Standard Sri Lankan English Across
  Generations*, IJRISS VIII(XII) —
  <https://rsisinternational.org/journals/ijriss/Digital-Library/volume-8-issue-12/3911-3930.pdf>

**In-repo**
- `sidecar/bandready/pron/analyze.py` · `sidecar/bandready/server/routes/pron.py` ·
  `content/core-en/data/pron_pairs.jsonl` · `docs/plan/09-pronunciation-assessment.md` §0, §4.1, §4.3, §4.5
