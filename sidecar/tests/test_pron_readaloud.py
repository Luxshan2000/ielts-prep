"""What the read-aloud check must catch, and what it must never call a mistake.

`test_pron_honesty.py` pins what proxy-v1 is *not* allowed to claim. This file pins the
opposite boundary for the method that replaced it on the read-aloud path: with a reference
text there is something real to compare against, so the module is now allowed to say a word
went wrong — and the whole risk moves to saying it about the wrong things.

Two halves, and the first one is the one that matters:

* **Accent is never an error.** A Tamil, Sinhala, Indian, Scottish, Australian or American
  speaker reading the same sentence correctly must score identically. Every case in
  `test_accent_variation_is_never_an_error` is a documented axis of variation between
  healthy Englishes. If one of these starts failing, the module is telling a learner their
  accent is a defect, which docs/09 §0 forbids.
* **Real substitutions are always caught.** The ones that change the word — th-stopping,
  the sheep/ship vowel, dropped final clusters — must survive every fold above.

The two halves pull against each other on purpose: any fold broad enough to break the
second half is too broad, and any strictness that breaks the first is too strict.
"""

from __future__ import annotations

import pytest

from bandready.pron import phonemes as ph
from bandready.pron import readaloud as ra

pytestmark = pytest.mark.skipif(
    not ph.available(), reason="espeak-ng phonemiser unavailable in this environment"
)


def _heard(text: str) -> list[dict[str, object]]:
    """Recogniser output for ``text``, shaped like `analyze.transcribe_words`."""
    return [
        {"word": w, "t_start_ms": i * 400, "t_end_ms": i * 400 + 380, "confidence": 0.9}
        for i, w in enumerate(text.split())
    ]


def _flagged_words(reference: str, heard: str) -> set[str]:
    result = ra.score_read_aloud(reference, _heard(heard))
    return {w.word for w in result.flagged}


# ======================================================================================
# Accent is never an error
# ======================================================================================


@pytest.mark.parametrize(
    ("label", "word", "heard_ipa"),
    [
        ("cot-caught merger", "cot", "kˈɔːt"),
        ("non-rhotic car", "car", "kˈɑː"),
        ("trap-bath, southern British", "bath", "bˈɑːθ"),
        ("trap-bath, laugh", "laugh", "lˈɑːf"),
        ("trap-bath, class", "class", "klˈɑːs"),
        ("reduced vowel", "cup", "kˈəp"),
        ("length not produced", "sheep", "ʃˈip"),
        ("tapped t", "butter", "bˈʌɾɚ"),
        ("GOAT transcribed as əʊ", "goat", "ɡˈəʊt"),
        ("either, both forms", "either", "ˈaɪðɚ"),
        ("either, the other form", "either", "ˈiːðɚ"),
        ("schedule, British", "schedule", "ˈʃɛdjuːl"),
        ("data, British", "data", "ˈdɑːtə"),
    ],
)
def test_accent_variation_is_never_an_error(label: str, word: str, heard_ipa: str) -> None:
    """A correct word said in another accent costs nothing. See ACCENT_FOLDS."""
    rate, _variant = ph.best_phone_error_rate(word, ph.split_phones(heard_ipa))
    assert rate == 0.0, f"{label}: accent variation scored as {rate:.2f} error"


# ======================================================================================
# Real substitutions are always caught
# ======================================================================================


@pytest.mark.parametrize(
    ("label", "word", "heard_ipa"),
    [
        ("th-stopping, three/tree", "three", "tɹˈiː"),
        ("th-fronting, thin/sin", "thin", "sˈɪn"),
        ("sheep/ship vowel", "sheep", "ʃˈɪp"),
        ("v/w confusion", "vine", "wˈaɪn"),
        ("r/l confusion", "rice", "lˈaɪs"),
        ("dropped final cluster", "tests", "tˈɛs"),
        ("bath is not bat", "bath", "bˈæt"),
    ],
)
def test_meaning_changing_substitutions_are_caught(label: str, word: str, heard_ipa: str) -> None:
    rate, _variant = ph.best_phone_error_rate(word, ph.split_phones(heard_ipa))
    assert rate > 0.0, f"{label}: a word-changing error was folded away"


def test_cat_and_cot_stay_distinct() -> None:
    """The trap-bath allowance must not merge the vowel everywhere.

    Folding ɑ to æ across the board would make this pass silently, which is the specific
    trap BATH_WORDS exists to avoid.
    """
    rate, _ = ph.best_phone_error_rate("cat", ph.split_phones("kˈɑːt"))
    assert rate > 0.0


# ======================================================================================
# End to end over a sentence
# ======================================================================================


def test_perfect_reading_flags_nothing() -> None:
    result = ra.score_read_aloud(
        "I think three ships are sailing", _heard("i think three ships are sailing")
    )
    assert result.flagged == []
    assert result.word_error_rate == 0.0
    assert result.phone_error_rate == 0.0
    assert result.intelligibility == 100


def test_th_stopping_is_reported_with_the_sound_that_changed() -> None:
    """The finding a learner can act on: not "wrong", but θ came out as t."""
    result = ra.score_read_aloud(
        "I think three ships are sailing", _heard("i tink tree ships are sailing")
    )
    flagged = {w.word: w for w in result.flagged}
    assert set(flagged) == {"think", "three"}

    changed = [op for op in flagged["three"].phone_ops if op.op != "equal"]
    assert len(changed) == 1
    assert changed[0].op == "sub"
    assert changed[0].expected == "θ"
    assert changed[0].heard == "t"


def test_a_missing_content_word_is_reported() -> None:
    result = ra.score_read_aloud(
        "the government should reduce carbon emissions",
        _heard("the government should reduce emissions"),
    )
    missing = [w for w in result.words if w.status == "missing"]
    assert [w.word for w in missing] == ["carbon"]
    assert missing[0].flagged


def test_near_miss_wins_the_alignment() -> None:
    """`hello` must be compared against `hell`, not against `no`.

    Both are one word-substitution away under a flat edit cost, so a plain aligner picks
    arbitrarily and can show the learner a comparison with a word they never nearly said.
    """
    result = ra.score_read_aloud("Hello, how are you?", _heard("hell no who are you"))
    by_word = {w.word: w for w in result.words}
    assert by_word["hello"].heard == "hell"


def test_reduced_function_words_are_not_reported() -> None:
    """`can` heard as `kən` is every native speaker, not a learner error."""
    assert _flagged_words("we can go to the shop", "we could go to the shop") == set()


def test_wh_words_are_still_reported() -> None:
    """...but `how` heard as `who` is a real intelligibility failure."""
    assert "how" in _flagged_words("how are you", "who are you")


# ======================================================================================
# Refusing to answer
# ======================================================================================


def test_no_intelligibility_when_coverage_is_too_low() -> None:
    """A number computed from a couple of words invites over-reading, so it is withheld."""
    result = ra.score_read_aloud("hello", _heard("hello"))
    result.coverage = 0.1
    assert ra._intelligibility(result) is None


def test_empty_reference_returns_an_empty_result() -> None:
    result = ra.score_read_aloud("", _heard("anything at all"))
    assert result.words == []
    assert result.intelligibility is None


def test_score_is_not_claimed_to_be_calibrated() -> None:
    """The weights are inherited proportions, not fitted ones, and must stay marked so."""
    assert ra.INTELLIGIBILITY_IS_CALIBRATED is False
