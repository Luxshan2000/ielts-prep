"""What proxy-v1 is allowed to claim.

The pronunciation module shipped with a complete analyzer, ten routes, and no tests, and
nothing in the UI ever called it. Inside that gap it grew a defect that would have reached a
learner the moment a screen was wired up: `score_from_confidence` returns `confidence * 100`,
and the wire payload published that as `score` with a `level` of good/warn/poor, plus an
`overall` that averaged it.

An ASR confidence is not a pronunciation score. It falls for rare words, proper nouns,
background noise, and — the case that matters for this app's users — speech that is accented
and perfectly intelligible. Banding it red tells a Tamil or Sinhala speaker they pronounced
something badly when the recogniser merely hesitated, which is what docs/09 §0 forbids in as
many words.

The module already knew this: it serialises `score: null` into `pron_signals_json` "because a
confidence is not a GOP". It was honest at one boundary and not at the other. These tests pin
the honest one, so a future change that makes a screen look more populated has to argue with
a failing test first.
"""

from __future__ import annotations

from bandready.pron import analyze as pron


def _word(confidence: float | None) -> pron.WordScore:
    return pron.WordScore(
        word="brackenfield",
        word_index=0,
        score=pron.score_from_confidence(confidence),
        confidence=confidence,
    )


# ======================================================================================
# The claim the method cannot support
# ======================================================================================


def test_proxy_v1_publishes_no_pronunciation_score() -> None:
    assert pron.SCORE_IS_PRONUNCIATION is False, (
        "proxy-v1 infers from ASR confidence and cannot score pronunciation"
    )
    assert _word(0.31).as_wire()["score"] is None


def test_proxy_v1_publishes_no_good_warn_poor_band() -> None:
    """The band is the part a learner reads as a verdict, so it goes first."""
    for confidence in (0.05, 0.31, 0.62, 0.97):
        assert _word(confidence).as_wire()["level"] is None


def test_a_confident_word_is_not_told_it_is_good_either() -> None:
    """The defect is the claim, not its direction — praise from a confidence is equally unearned."""
    wire = _word(0.99).as_wire()
    assert wire["score"] is None
    assert wire["level"] is None


# ======================================================================================
# What it may still say, because it is true
# ======================================================================================


def test_the_confidence_itself_is_still_reported_under_its_own_name() -> None:
    """Suppressing the honest number too would leave nothing to debug the recogniser with."""
    assert _word(0.42).as_wire()["confidence"] == 0.42


def test_a_low_confidence_word_is_flagged_as_unsure_not_as_wrong() -> None:
    wire = _word(0.20).as_wire()
    assert wire["recogniser_unsure"] is True
    assert wire["score"] is None, "unsure is a reason to listen again, not a mark"


def test_a_high_confidence_word_is_not_flagged() -> None:
    assert _word(0.95).as_wire()["recogniser_unsure"] is False


def test_a_word_with_no_confidence_at_all_claims_nothing() -> None:
    wire = _word(None).as_wire()
    assert wire["score"] is None
    assert wire["recogniser_unsure"] is None
    assert wire["skipped"] is True


# ======================================================================================
# The arithmetic underneath, which is still correct and still not a score
# ======================================================================================


def test_score_from_confidence_is_a_percentage_of_the_confidence() -> None:
    """Kept intact: it ranks which words to replay. It is only wrong when published."""
    assert pron.score_from_confidence(0.0) == 0
    assert pron.score_from_confidence(0.5) == 50
    assert pron.score_from_confidence(1.0) == 100
    assert pron.score_from_confidence(None) is None


def test_score_from_confidence_clamps_rather_than_trusting_its_input() -> None:
    assert pron.score_from_confidence(1.4) == 100
    assert pron.score_from_confidence(-0.2) == 0


# ======================================================================================
# The rule this all exists to serve
# ======================================================================================


def test_every_response_carries_the_accent_notice() -> None:
    """09 §0 makes this copy a product requirement, not decoration."""
    assert pron.ACCENT_NOTICE
    assert isinstance(pron.ACCENT_NOTICE, str)


def test_the_accent_notice_says_accents_are_not_penalised() -> None:
    text = pron.ACCENT_NOTICE.lower()
    assert "accent" in text


# ======================================================================================
# The same rule at every boundary, not just the one I fixed first
# ======================================================================================


def test_the_signals_boundary_and_the_wire_boundary_now_agree() -> None:
    """The original defect was a disagreement, so the fix has to be checked as one.

    `pron_signals_json` always said `score: null` for proxy-v1. `as_wire` said
    `confidence * 100`. Fixing one boundary and not the other is how the first pass of this
    fix missed `/pron/scores`, which reads the stored column straight back out.
    """
    wire = _word(0.31).as_wire()
    assert wire["score"] is None
    assert wire["level"] is None
    # And the honest number is still there, under a name that says what it is.
    assert wire["confidence"] == 0.31


def test_the_stored_column_is_still_populated_for_ranking() -> None:
    """Suppressing the number in the database too would throw away the useful part.

    Which words the recogniser struggled with is a real signal — it decides what is worth
    replaying. The rule is about what may be *published as a judgement*, not about what may
    be recorded.
    """
    assert pron.score_from_confidence(0.31) == 31


# ======================================================================================
# Why the recogniser cannot simply be swapped for a faster one
# ======================================================================================


def test_the_proxy_depends_on_a_per_word_probability() -> None:
    """This is the constraint that decides which ASR the app can use at all.

    `score_from_confidence` reads faster-whisper's per-word `probability`. Parakeet and the
    other TDT transducers that beat Whisper on clean-English leaderboards do not emit one —
    swapping to them would leave this returning None for every word and quietly disable the
    only pronunciation signal the app has, while every test about *scores* still passed.

    Pinned here so the dependency is visible from the pronunciation side, not just implied by
    the STT preset list.
    """
    assert pron.score_from_confidence(0.5) == 50
    assert pron.score_from_confidence(None) is None
