"""A spoken answer is a typed answer that arrived by microphone.

That is the whole design, and it buys three things that matter more than the code it saves:
`srs_review_logs.review_type` needs no seventh value (it is CheckConstraint-ed to six and
`speaking_drill` is already one), grammar's item-kind enum stays closed at fourteen, and
`judge_production` keeps its single grading path — the one carrying span-quoting enforcement,
two-call confirmation and offline-counts-as-a-pass, which a parallel spoken grader would
reimplement worse and then let drift.

What a microphone needs that a keyboard does not is a refusal. Whisper will cheerfully invent
a fluent sentence out of two seconds of room tone, and a grader handed that invention marks
it — sometimes correct, which is worse. So silence has to be distinguishable from a wrong
answer, and it must never cost a rung.
"""

from __future__ import annotations

from bandready.speech import answers

# ======================================================================================
# Refusing what cannot honestly be graded
# ======================================================================================


def test_a_recording_too_short_to_hold_speech_is_refused() -> None:
    refusal = answers.refusal_for("the bridge closed", answers.MIN_SPEECH_MS - 1)
    assert refusal is not None
    assert "too short" in refusal.lower()


def test_the_refusal_tells_the_learner_what_to_do() -> None:
    """A refusal a learner cannot act on is just a dead end with better manners."""
    assert "hold the button" in str(answers.refusal_for("x", 100)).lower()
    assert "microphone" in str(answers.refusal_for("", 3000)).lower()


def test_an_empty_transcript_is_refused() -> None:
    assert answers.refusal_for("", 3000) is not None
    assert answers.refusal_for("   ", 3000) is not None


def test_punctuation_only_is_refused() -> None:
    """Whisper emits bare punctuation on near-silence; it is not an answer."""
    assert answers.refusal_for("...", 3000) is not None
    assert answers.refusal_for("!?", 3000) is not None


def test_whispers_stock_hallucinations_are_refused() -> None:
    """These are what the model writes for room tone, not things a learner said."""
    for invented in (
        "Thanks for watching!",
        "thank you",
        "Bye.",
        "Subtitles by the amara.org community",
        "[BLANK_AUDIO]",
        "you",
    ):
        assert answers.refusal_for(invented, 4000) is not None, invented


def test_a_hallucination_is_refused_case_and_punctuation_insensitively() -> None:
    assert answers.refusal_for("THANK YOU.", 4000) is not None
    assert answers.refusal_for("thanks for watching", 4000) is not None


# ======================================================================================
# Grading what can be graded
# ======================================================================================


def test_a_real_answer_is_not_refused() -> None:
    assert answers.refusal_for("The bridge has been closed since March.", 4000) is None


def test_a_one_word_answer_clears_the_floor() -> None:
    """The guard is for silence, not for brevity — plenty of items want one word."""
    assert answers.refusal_for("gone", 900) is None


def test_a_word_that_merely_contains_a_hallucination_is_kept() -> None:
    """The list is matched whole; 'you' is refused alone and fine inside a sentence."""
    assert answers.refusal_for("Thank you for the extension you granted.", 4000) is None
    assert answers.refusal_for("You should have booked it earlier.", 4000) is None


# ======================================================================================
# The shape the routes depend on
# ======================================================================================


def test_a_refused_answer_reports_itself_as_ungradeable() -> None:
    spoken = answers.SpokenAnswer(
        transcript="thank you", duration_ms=4000, words=[], refusal="Nothing was picked up."
    )
    assert spoken.gradeable is False
    wire = spoken.as_wire()
    assert wire["gradeable"] is False
    assert wire["refusal"]


def test_a_good_answer_reports_itself_as_gradeable_and_shows_what_was_heard() -> None:
    spoken = answers.SpokenAnswer(
        transcript="The site must have closed early.", duration_ms=4000, words=[]
    )
    assert spoken.gradeable is True
    wire = spoken.as_wire()
    assert wire["gradeable"] is True
    assert wire["refusal"] is None
    # The learner has to be able to see what the recogniser thought they said, or a wrong
    # verdict is unarguable.
    assert wire["heard"] == "The site must have closed early."


def test_an_empty_transcript_is_never_gradeable_even_without_a_refusal() -> None:
    """Belt and braces: the routes check `gradeable`, so it must not depend on refusal alone."""
    assert answers.SpokenAnswer(transcript="  ", duration_ms=4000, words=[]).gradeable is False
