"""Read-aloud pronunciation checking — the method 09 §3 reserved for v2.

``analyze.py`` documents why **proxy-v1** refuses to publish a pronunciation score: all it
has is recogniser confidence, which falls for rare words, proper nouns, background noise
and perfectly intelligible accented speech alike. Multiplying that by 100 and colouring it
red is exactly what 09 §0 forbids.

Read-aloud is different, and the difference is the whole reason this module can exist:
**we know what the learner was asked to say.** With a reference text there is something to
compare against, so the question stops being "did the recogniser feel sure?" and becomes
"did the words that came out match the words on the page?" — which is a real, checkable
property of the recording.

## What this measures, precisely

**Intelligibility, not accent.** Every word is put through
:mod:`bandready.pron.phonemes`, whose accent folds erase the differences that vary between
healthy Englishes — rhoticity, cot-caught, trap-bath, vowel length, reduced vowels — before
anything is compared. What survives is the kind of difference that changes the word:
*three* heard as *tree*, *sheep* heard as *ship*, a dropped final cluster. Those cost marks
in the exam because a listener loses the word, which is the only thing worth reporting.

## The honest limitation, stated up front

The recogniser has a language model, and a language model **repairs** learners. Asked to
read "I think three ships", a speaker who says *tink tree ships* may still be transcribed
*think three ships*, because those are the likelier words. So this method **under-reports**:
everything it flags is real, but it will miss sounds that were wrong and got fixed on the
way through.

That is a floor, not a ceiling, and it is the right way round — a learner is told about
errors that survived a system actively trying to hear them charitably, so a flag here means
a human listener would very likely have lost the word too. The fix for the misses is a
phoneme-recognition model that has no language model to repair with, which is a ~1.2 GB
download and therefore an opt-in upgrade rather than something the app assumes.

Because it under-reports, this module never says "your pronunciation is 84% good". It
reports what it found and how much of the passage it could check.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from bandready.pron import phonemes as ph

_log = logging.getLogger("bandready.pron.readaloud")

METHOD = "readaloud-v2"

__all__ = [
    "METHOD",
    "ReadAloudResult",
    "WordCheck",
    "score_read_aloud",
    "tokenize",
]

# --------------------------------------------------------------------------------------
# Thresholds
# --------------------------------------------------------------------------------------

#: A word is only reported when at least this share of its sounds changed. Borrowed from
#: OpenPronounce, which flags a word once its per-sound confidences reach 40% of the word.
#: Below it, a single folded vowel in a long word is noise rather than a finding, and
#: reporting it trains learners to distrust the feedback.
FLAG_PER = 0.40

#: …or when at least this many sounds changed outright, which catches short words where one
#: wrong sound is most of the word (*three* is three sounds; one wrong is 33%).
FLAG_MIN_EDITS = 1

#: Words shorter than this are not reported. Function words — *a*, *the*, *of*, *to* — are
#: reduced to almost nothing in connected speech by every native speaker alive, and the
#: recogniser drops them constantly. Flagging them produces a wall of false findings.
MIN_FLAG_CHARS = 3

#: Function words never reported even when long enough, for the same reason.
#:
#: The test is *phonetic reduction*, not part of speech. Articles, prepositions, auxiliaries
#: and pronouns lose their vowel in connected speech — every native speaker says
#: ``/kən/`` for *can* — so a recogniser disagreeing about one says nothing about the
#: learner. **Wh-words are deliberately absent**: *how*, *what*, *where* carry stress, are
#: not reduced, and *how* heard as *who* is a genuine intelligibility failure a candidate
#: needs to know about.
FUNCTION_WORDS: frozenset[str] = frozenset(
    """
    the a an and or but of to in on at by for with from as is are was were be been being
    am do does did have has had will would shall should can could may might must
    this that these those it its he she they them his her their our your my me you we i
    nor so than then there here
    """.split()  # noqa: SIM905 — the wrapped list is readable; the fix is one 400-char line
)

_TOKEN_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def tokenize(text: str) -> list[str]:
    """Words of a passage, lowercased, punctuation and digits dropped.

    Digits are dropped rather than spelled out because a reference passage that says "2024"
    and a recogniser that writes "twenty twenty four" would otherwise register four word
    errors for a correct reading.
    """
    return _TOKEN_RE.findall(str(text or "").lower())


# --------------------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class WordCheck:
    """One word of the reference passage and what became of it."""

    word: str
    word_index: int
    #: ``matched`` the word came through; ``substituted`` a different word was heard in its
    #: place; ``missing`` nothing was heard for it.
    status: str = "matched"
    heard: str | None = None
    expected_ipa: str | None = None
    heard_ipa: str | None = None
    phone_error_rate: float = 0.0
    phone_ops: list[ph.PhoneOp] = field(default_factory=list)
    t_start_ms: int | None = None
    t_end_ms: int | None = None
    confidence: float | None = None
    #: True when this word is worth showing the learner — see :data:`FLAG_PER`.
    flagged: bool = False

    def as_wire(self) -> dict[str, Any]:
        changed = [op for op in self.phone_ops if op.op != "equal"]
        return {
            "word": self.word,
            "word_index": self.word_index,
            "status": self.status,
            "heard": self.heard,
            "expected_ipa": self.expected_ipa,
            "heard_ipa": self.heard_ipa,
            "phone_error_rate": round(self.phone_error_rate, 3),
            # Only the sounds that changed; the matching ones are not news.
            "sounds": [op.as_wire() for op in changed] or None,
            "t_start_ms": self.t_start_ms,
            "t_end_ms": self.t_end_ms,
            "confidence": self.confidence,
            "flagged": self.flagged,
        }


@dataclass(slots=True)
class ReadAloudResult:
    """The whole passage: what matched, what did not, and how much could be checked."""

    method: str = METHOD
    words: list[WordCheck] = field(default_factory=list)
    transcript: str = ""
    word_error_rate: float = 0.0
    phone_error_rate: float = 0.0
    #: Share of reference words the phonemiser could produce IPA for. Below 1.0 the
    #: phone-level numbers cover only part of the passage and must be reported as such.
    coverage: float = 0.0
    intelligibility: int | None = None

    @property
    def flagged(self) -> list[WordCheck]:
        return [w for w in self.words if w.flagged]

    def as_wire(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "transcript": self.transcript,
            "words": [w.as_wire() for w in self.words],
            "word_error_rate": round(self.word_error_rate, 3),
            "phone_error_rate": round(self.phone_error_rate, 3),
            "coverage": round(self.coverage, 3),
            "intelligibility": self.intelligibility,
            "flagged_words": [w.as_wire() for w in self.flagged],
        }


# --------------------------------------------------------------------------------------
# Word alignment
# --------------------------------------------------------------------------------------


def _char_distance(a: str, b: str) -> int:
    """Plain character-level edit distance between two words."""
    if a == b:
        return 0
    n, m = len(a), len(b)
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        for j in range(1, m + 1):
            cur[j] = min(
                prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if a[i - 1] == b[j - 1] else 1)
            )
        prev = cur
    return prev[m]


def _sub_cost(expected: str, heard: str) -> float:
    """Cost of pairing ``expected`` with ``heard``, scaled by how alike they are.

    A flat cost of 1 for every substitution makes *hello*→*hell* and *hello*→*no* equally
    good, so the aligner picks between them arbitrarily and the learner is shown a
    comparison against a word they never nearly said. Scaling by character distance makes
    the near-miss win, which is what puts the right pair in front of them.

    Capped just under the 1.0 of a delete-plus-insert so that two genuinely unrelated words
    still prefer to align rather than fragmenting into separate errors.
    """
    if expected == heard:
        return 0.0
    longest = max(len(expected), len(heard)) or 1
    return min(0.99, _char_distance(expected, heard) / longest)


def _align_words(expected: list[str], heard: list[str]) -> list[tuple[str | None, str | None]]:
    """Pair reference words with heard words, preferring near-misses.

    Returns ``(expected, heard)`` pairs; ``None`` on either side is a deletion or an
    insertion. Alignment is on words rather than characters because that is the unit the
    learner reads and the unit the exam marks — but the *cost* of a pairing is
    character-aware, so a mispronounced word aligns to the word it actually resembles.
    """
    n, m = len(expected), len(heard)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = float(i)
    for j in range(1, m + 1):
        dp[0][j] = float(j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            dp[i][j] = min(
                dp[i - 1][j] + 1.0,
                dp[i][j - 1] + 1.0,
                dp[i - 1][j - 1] + _sub_cost(expected[i - 1], heard[j - 1]),
            )

    pairs: list[tuple[str | None, str | None]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            cost = _sub_cost(expected[i - 1], heard[j - 1])
            if abs(dp[i][j] - (dp[i - 1][j - 1] + cost)) < 1e-9:
                pairs.append((expected[i - 1], heard[j - 1]))
                i -= 1
                j -= 1
                continue
        if i > 0 and abs(dp[i][j] - (dp[i - 1][j] + 1.0)) < 1e-9:
            pairs.append((expected[i - 1], None))
            i -= 1
            continue
        pairs.append((None, heard[j - 1]))
        j -= 1
    pairs.reverse()
    return pairs


def _should_flag(word: str, status: str, per: float, edits: int) -> bool:
    """Whether a word is worth putting in front of the learner.

    The gate is *content-word-ness*, not severity. If the recogniser — which has a language
    model actively trying to hear the expected word — still came back with something else,
    that word did not survive, and a human listener would very likely have lost it too.
    That is the finding, whether one sound changed or four.

    Severity still matters, but for **ranking**, not for admission: ``phone_error_rate``
    orders the list so the worst word is the one the learner sees first. Gating on severity
    instead is what silently dropped *three* heard as *tree* — one sound in three, below any
    percentage threshold, and exactly the substitution a learner most needs to know about.
    """
    if len(word) < MIN_FLAG_CHARS or word in FUNCTION_WORDS:
        return False
    if status in ("substituted", "missing"):
        return True
    return per >= FLAG_PER or edits >= FLAG_MIN_EDITS


# --------------------------------------------------------------------------------------
# The method
# --------------------------------------------------------------------------------------


def score_read_aloud(
    reference_text: str,
    heard_words: list[dict[str, Any]],
    transcript: str | None = None,
) -> ReadAloudResult:
    """Compare a reading of ``reference_text`` against what the recogniser heard.

    ``heard_words`` is the word-timestamp list produced by
    :func:`bandready.pron.analyze.transcribe_words` — ``{word, t_start_ms, t_end_ms,
    confidence}``. Timings are carried through so the UI can replay the exact moment a word
    went wrong, which is the feature that makes this feedback actionable rather than a list
    of complaints.
    """
    expected = tokenize(reference_text)

    # One token per recogniser word, keeping the two lists index-aligned so a word's timing
    # survives the cleaning. A recogniser word can clean away to nothing ("," or "2024"),
    # so both lists are filtered together rather than separately.
    cleaned = [(tokenize(str(w.get("word", ""))) or [""])[0] for w in heard_words]
    timing_by_token: list[dict[str, Any]] = [
        w for w, t in zip(heard_words, cleaned, strict=True) if t
    ]
    heard_clean = [t for t in cleaned if t]

    result = ReadAloudResult(
        transcript=transcript if transcript is not None else " ".join(heard_clean)
    )
    if not expected:
        return result

    # Warm the phonemiser for every word in one call rather than one call per word.
    ph.ipa_for_many(expected + heard_clean)

    pairs = _align_words(expected, heard_clean)

    # Walk the alignment, tracking which heard word each pair consumed so timings line up.
    heard_cursor = 0
    word_index = 0
    checks: list[WordCheck] = []
    substitutions = deletions = insertions = 0
    per_numer = 0.0
    per_denom = 0
    phonemised = 0

    for exp, got in pairs:
        if exp is None:
            # A word appeared that the passage did not ask for. Counted against the word
            # error rate but never shown as a "your word was wrong" finding, because there
            # is no reference word it belongs to.
            insertions += 1
            heard_cursor += 1
            continue

        timing = timing_by_token[heard_cursor] if got is not None and heard_cursor < len(timing_by_token) else None
        check = WordCheck(word=exp, word_index=word_index, heard=got)
        word_index += 1
        if timing is not None:
            check.t_start_ms = timing.get("t_start_ms")
            check.t_end_ms = timing.get("t_end_ms")
            check.confidence = timing.get("confidence")

        expected_variants = ph.variant_phone_sets(exp)
        expected_phones = expected_variants[0] if expected_variants else []
        check.expected_ipa = ph.ipa_for(exp)
        if expected_phones:
            phonemised += 1

        if got is None:
            check.status = "missing"
            deletions += 1
            # Nothing was heard, so every expected sound counts as an error.
            if expected_phones:
                per_numer += len(expected_phones)
                per_denom += len(expected_phones)
            check.phone_error_rate = 1.0
            check.flagged = _should_flag(exp, "missing", 1.0, len(expected_phones))
            checks.append(check)
            continue

        heard_cursor += 1
        if got == exp:
            check.status = "matched"
            if expected_phones:
                per_denom += len(expected_phones)
            checks.append(check)
            continue

        # A different word was heard. This is where the phone comparison earns its keep:
        # it turns "we heard something else" into "the /θ/ came out as /t/".
        substitutions += 1
        check.status = "substituted"
        heard_phones = ph.phones_of(got)
        check.heard_ipa = ph.ipa_for(got)
        rate, matched_variant = ph.best_phone_error_rate(exp, heard_phones)
        check.phone_error_rate = rate
        check.phone_ops = ph.align_phones(matched_variant or expected_phones, heard_phones)
        edits = sum(1 for op in check.phone_ops if op.op != "equal")
        if matched_variant:
            per_numer += edits
            per_denom += len(matched_variant)
        check.flagged = _should_flag(exp, "substituted", rate, edits)
        checks.append(check)

    result.words = checks
    total = len(expected)
    result.word_error_rate = (substitutions + deletions + insertions) / total if total else 0.0
    result.phone_error_rate = (per_numer / per_denom) if per_denom else 0.0
    result.coverage = phonemised / total if total else 0.0
    result.intelligibility = _intelligibility(result)
    return result


#: Weights on the two error rates. OpenPronounce fits 0.3 acoustic / 0.4 phoneme / 0.3 word
#: against expert ratings; without the acoustic term — it needs the wav2vec2 embeddings we
#: do not download — its remaining two are renormalised to 0.57/0.43 and rounded here.
#:
#: **These weights are not calibrated.** OpenPronounce's were fitted on 500 expert-rated
#: utterances; ours are inherited proportions. Until they are fitted against a scored set,
#: :data:`INTELLIGIBILITY_IS_CALIBRATED` stays False and the number is presented as a rough
#: reading, never as a band or a percentage score.
PER_WEIGHT = 0.6
WER_WEIGHT = 0.4

INTELLIGIBILITY_IS_CALIBRATED = False

#: Below this share of the passage the phone numbers rest on too few words to mean
#: anything, and no overall figure is published.
MIN_COVERAGE = 0.5


def _intelligibility(result: ReadAloudResult) -> int | None:
    """A 0–100 reading of how much of the passage survived, or ``None``.

    Withheld when the phonemiser covered too little of the passage — a number computed from
    a handful of words invites exactly the over-reading this module is trying to avoid.
    """
    if result.coverage < MIN_COVERAGE:
        return None
    score = PER_WEIGHT * (1.0 - result.phone_error_rate) + WER_WEIGHT * (1.0 - result.word_error_rate)
    return max(0, min(100, round(score * 100)))
