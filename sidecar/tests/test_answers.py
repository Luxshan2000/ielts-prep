"""Table-driven tests for THE shared answer normalizer (R2-9).

`sidecar/bandready/scoring/answers.py` is imported by reading (06 §4) and listening
(07 §5), so every rule and every interaction between rules is pinned here. If a case in
this file changes, both modules change with it.
"""

from __future__ import annotations

import pytest

from bandready.scoring.answers import (
    US_UK_PAIRS,
    answers_match,
    count_words,
    expand_variants,
    instruction_for,
    near_miss,
    normalize_answer,
    normalize_letters,
    spelling_variants,
    within_word_limit,
)

TWO_WORDS = {"max_words": 2, "numbers_allowed": True}
ONE_WORD = {"max_words": 1, "numbers_allowed": False}
ONE_WORD_NUM = {"max_words": 1, "numbers_allowed": True}
THREE_WORDS = {"max_words": 3, "numbers_allowed": True}
NUMBER_ONLY = {"max_words": 0, "numbers_allowed": True}


# --------------------------------------------------------------------------------------
# normalize_answer
# --------------------------------------------------------------------------------------

NORMALIZE_CASES: list[tuple[str, str, str]] = [
    # (label, raw, expected)
    ("case is folded", "Ceramic Jars", "ceramic jars"),
    ("outer whitespace trimmed", "   ceramic jars  ", "ceramic jars"),
    ("inner whitespace collapsed", "ceramic     jars", "ceramic jars"),
    ("tabs and newlines collapse", "ceramic\t\njars", "ceramic jars"),
    ("trailing period stripped", "ceramic jars.", "ceramic jars"),
    ("surrounding quotes stripped", '"ceramic jars"', "ceramic jars"),
    ("commas stripped", "jars, ceramic", "jars ceramic"),
    ("semicolons stripped", "ceramic jars;", "ceramic jars"),
    ("brackets stripped", "[ceramic jars]", "ceramic jars"),
    ("curly apostrophe folded", "farmer’s market", "farmer's market"),
    ("apostrophe kept", "don't", "don't"),
    ("hyphen kept", "well-being", "well-being"),
    ("en dash folded to hyphen", "well–being", "well-being"),
    ("nfkc folds full-width digits", "７２", "72"),
    ("thousands separator dropped", "1,500", "1500"),
    ("big thousands separator dropped", "1,250,000", "1250000"),
    ("decimal point survives", "3.5", "3.5"),
    ("clock colon survives", "9:30", "9:30"),
    ("number word becomes digits", "seventy-two", "72"),
    ("spaced number word becomes digits", "seventy two", "72"),
    ("teen number word", "fifteen", "15"),
    ("compound with scale", "one hundred and twenty", "120"),
    ("thousand scale", "two thousand and five", "2005"),
    ("year reading", "eighteen ninety-two", "1892"),
    ("percent sign becomes word", "20%", "20 percent"),
    ("spaced percent sign", "20 %", "20 percent"),
    ("number word plus percent", "twenty percent", "20 percent"),
    ("dollar sign becomes word", "$40", "40 dollars"),
    ("pound sign becomes word", "£40", "40 pounds"),
    ("non-number words untouched", "black and white", "black and white"),
    ("no article stripped without variants", "the coal mine", "the coal mine"),
    ("empty stays empty", "", ""),
    ("punctuation only collapses to empty", "...", ""),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(raw, expected) for _label, raw, expected in NORMALIZE_CASES],
    ids=[label for label, _raw, _expected in NORMALIZE_CASES],
)
def test_normalize_answer(raw: str, expected: str) -> None:
    assert normalize_answer(raw) == expected


# --------------------------------------------------------------------------------------
# The article rule (R2-9): strip only when EVERY variant lacks an article
# --------------------------------------------------------------------------------------

ARTICLE_CASES: list[tuple[str, str, list[str], bool]] = [
    ("the + article-free key matches", "the ceramic jars", ["ceramic jars"], True),
    ("a + article-free key matches", "a beaver dam", ["beaver dam"], True),
    ("an + article-free key matches", "an estuary", ["estuary"], True),
    ("no article + article-free key matches", "ceramic jars", ["ceramic jars"], True),
    ("keyed article + same article matches", "the crown", ["the crown"], True),
    ("keyed article + missing article fails", "crown", ["the crown"], False),
    ("keyed article + wrong article fails", "a crown", ["the crown"], False),
    (
        "one variant with an article freezes the rule",
        "the crown",
        ["the crown", "crown jewels"],
        True,
    ),
    (
        "article-bearing variant list rejects a stripped learner answer",
        "jewels",
        ["the jewels"],
        False,
    ),
    ("article inside the answer is untouched", "king of the road", ["king of the road"], True),
    ("bare article is not an article prefix", "a", ["a"], True),
]


@pytest.mark.parametrize(
    ("given", "accepted", "expected"),
    [(g, a, e) for _label, g, a, e in ARTICLE_CASES],
    ids=[label for label, _g, _a, _e in ARTICLE_CASES],
)
def test_article_rule(given: str, accepted: list[str], expected: bool) -> None:
    """No word limit here — the limit interaction is pinned separately below, because the
    tolerance must never rescue an over-limit answer (06 §4.1)."""
    assert answers_match(given, accepted, question_type="sentence_completion") is expected


def test_article_tolerance_never_rescues_an_over_limit_answer() -> None:
    assert answers_match("the coal mine", ["coal mine"], "sentence_completion", TWO_WORDS) is False
    assert answers_match("the coal mine", ["coal mine"], "sentence_completion") is True


# --------------------------------------------------------------------------------------
# Free-text matching
# --------------------------------------------------------------------------------------

TEXT_CASES: list[tuple[str, str, list[str], bool]] = [
    ("exact match", "ceramic jars", ["ceramic jars"], True),
    ("case-insensitive match", "CERAMIC JARS", ["ceramic jars"], True),
    ("mixed case match", "Ceramic Jars", ["ceramic jars"], True),
    ("padded match", "  ceramic jars ", ["ceramic jars"], True),
    ("trailing full stop match", "ceramic jars.", ["ceramic jars"], True),
    ("second variant match", "ceramic jar", ["ceramic jars", "ceramic jar"], True),
    ("misspelling is wrong", "ceramik jars", ["ceramic jars"], False),
    ("one-letter typo is wrong", "enviroment", ["environment"], False),
    ("unauthored us spelling is wrong", "color", ["colour"], False),
    ("authored us spelling is right", "color", ["colour", "color"], True),
    ("hyphen matches space", "well being", ["well-being"], True),
    ("space matches hyphen", "well-being", ["well being"], True),
    ("closed form does not match hyphen", "wellbeing", ["well-being"], False),
    ("closed form matches when authored", "wellbeing", ["well-being", "wellbeing"], True),
    ("digits match number words", "72", ["seventy-two"], True),
    ("number words match digits", "seventy-two", ["72"], True),
    ("spaced number words match digits", "seventy two", ["72"], True),
    ("year in words matches digits", "eighteen ninety-two", ["1892"], True),
    ("thousands separator ignored", "1,500", ["1500"], True),
    ("percent sign matches the word", "20%", ["20 percent"], True),
    ("percent word matches the sign", "20 percent", ["20%"], True),
    ("dollar sign matches the words", "$40", ["40 dollars"], True),
    ("wrong number is wrong", "73", ["72"], False),
    ("empty answer is wrong", "", ["ceramic jars"], False),
    ("whitespace-only answer is wrong", "   ", ["ceramic jars"], False),
    ("None answer is wrong", None, ["ceramic jars"], False),
    ("parenthesized optional included", "sea turtles", ["(sea) turtles"], True),
    ("parenthesized optional omitted", "turtles", ["(sea) turtles"], True),
    ("parenthesized optional wrong word", "green turtles", ["(sea) turtles"], False),
    ("slash variant left side", "colour", ["colour/color"], True),
    ("slash variant right side", "color", ["colour/color"], True),
    ("slash original form kept", "km/h", ["km/h"], True),
    ("apostrophe preserved in match", "farmer's market", ["farmer's market"], True),
    ("curly apostrophe matches straight", "farmer’s market", ["farmer's market"], True),
    ("missing apostrophe is wrong", "farmers market", ["farmer's market"], False),
    ("dict-shaped variants accepted", "ceramic jars", [{"value": "ceramic jars"}], True),
    ("string-shaped accepted argument", "ceramic jars", "ceramic jars", True),
]


@pytest.mark.parametrize(
    ("given", "accepted", "expected"),
    [(g, a, e) for _label, g, a, e in TEXT_CASES],
    ids=[label for label, _g, _a, _e in TEXT_CASES],
)
def test_text_answers(given: str, accepted: object, expected: bool) -> None:
    assert answers_match(given, accepted, question_type="sentence_completion") is expected


# --------------------------------------------------------------------------------------
# Word limits
# --------------------------------------------------------------------------------------

WORD_COUNT_CASES: list[tuple[str, str, int]] = [
    ("single word", "jars", 1),
    ("two words", "ceramic jars", 2),
    ("hyphenated compound is one word", "well-being", 1),
    ("double hyphen compound is one word", "state-of-the-art", 1),
    ("contraction is one word", "don't", 1),
    ("article counts as a word", "the coal mine", 3),
    ("digits are one word", "1500", 1),
    ("number words count per token", "seventy-two", 1),
    ("currency token is one word", "$40", 1),
    ("punctuation is not a word", "ceramic jars.", 2),
    ("empty string is zero", "", 0),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(r, e) for _label, r, e in WORD_COUNT_CASES],
    ids=[label for label, _r, _e in WORD_COUNT_CASES],
)
def test_count_words(raw: str, expected: int) -> None:
    assert count_words(raw) == expected


LIMIT_CASES: list[tuple[str, str, dict, bool]] = [
    ("two words fits a two-word limit", "ceramic jars", TWO_WORDS, True),
    ("one word fits a two-word limit", "jars", TWO_WORDS, True),
    ("three words breaks a two-word limit", "the coal mine", TWO_WORDS, False),
    ("hyphenated compound counts once", "well-being centre", TWO_WORDS, True),
    ("number rides alongside the words", "40 ceramic jars", TWO_WORDS, True),
    ("number words ride alongside too", "forty ceramic jars", TWO_WORDS, True),
    ("multi-token number counts once", "twenty two dollars", TWO_WORDS, True),
    ("one word only rejects two", "coal mine", ONE_WORD, False),
    ("one word only accepts one", "coal", ONE_WORD, True),
    ("one word only rejects a number extra", "40 coal", ONE_WORD, False),
    ("one word and/or a number accepts both", "40 coal", ONE_WORD_NUM, True),
    ("one word and/or a number accepts a lone number", "1990s", ONE_WORD_NUM, True),
    ("number-only limit rejects a word", "coal", NUMBER_ONLY, False),
    ("number-only limit accepts a number", "1892", NUMBER_ONLY, True),
    ("three-word limit accepts three", "the coal mine", THREE_WORDS, True),
    ("no limit accepts anything", "a very long answer indeed", None, True),
    ("blank is not over the limit", "", ONE_WORD, True),
]


@pytest.mark.parametrize(
    ("raw", "limit", "expected"),
    [(r, limit, e) for _label, r, limit, e in LIMIT_CASES],
    ids=[label for label, _r, _l, _e in LIMIT_CASES],
)
def test_within_word_limit(raw: str, limit: dict | None, expected: bool) -> None:
    assert within_word_limit(raw, limit) is expected


def test_over_limit_is_wrong_even_when_the_words_are_right() -> None:
    """The real IELTS rule — no partial credit for an over-long correct answer."""
    assert answers_match("the coal mine", ["coal mine"], "sentence_completion", TWO_WORDS) is False
    assert answers_match("coal mine", ["coal mine"], "sentence_completion", TWO_WORDS) is True


def test_word_limit_accepts_a_bare_integer_and_the_listening_shape() -> None:
    assert within_word_limit("coal mine", 2) is True
    assert within_word_limit("the coal mine", 2) is False
    assert within_word_limit("bramley", {"words": 1, "numbers": 1}) is True
    assert within_word_limit("bramley road", {"words": 1, "numbers": 1}) is False


INSTRUCTION_CASES = [
    (ONE_WORD, "Write ONE WORD ONLY for each answer."),
    (ONE_WORD_NUM, "Write ONE WORD AND/OR A NUMBER for each answer."),
    (TWO_WORDS, "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer."),
    (THREE_WORDS, "Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer."),
    (NUMBER_ONLY, "Write A NUMBER for each answer."),
    ({"max_words": 2, "numbers_allowed": False}, "Write NO MORE THAN TWO WORDS for each answer."),
    (None, ""),
]


@pytest.mark.parametrize(("limit", "expected"), INSTRUCTION_CASES)
def test_instruction_for(limit: dict | None, expected: str) -> None:
    assert instruction_for(limit) == expected


# --------------------------------------------------------------------------------------
# Letter answers and the three-way judgement types
# --------------------------------------------------------------------------------------

LETTER_CASES: list[tuple[str, str, str, list[str], bool]] = [
    ("upper letter matches", "multiple_choice", "B", ["B"], True),
    ("lower letter matches", "multiple_choice", "b", ["B"], True),
    ("padded letter matches", "multiple_choice", " b ", ["B"], True),
    ("letter with a period matches", "multiple_choice", "B.", ["B"], True),
    ("wrong letter fails", "multiple_choice", "C", ["B"], False),
    ("roman numeral matches", "matching_headings", "iv", ["iv"], True),
    ("upper roman numeral matches", "matching_headings", "IV", ["iv"], True),
    ("roman numeral is not split into letters", "matching_headings", "vii", ["vii"], True),
    ("wrong roman numeral fails", "matching_headings", "vi", ["iv"], False),
    ("paragraph letter matches", "matching_information", "d", ["D"], True),
    ("feature letter matches", "matching_features", "c", ["C"], True),
    ("sentence ending letter matches", "matching_sentence_endings", "f", ["F"], True),
    ("bank letter matches", "summary_completion_bank", "e", ["E"], True),
    ("multi-select comma set matches", "multiple_choice_multi", "A, C", ["A", "C"], True),
    ("multi-select reversed set matches", "multiple_choice_multi", "C,A", ["A", "C"], True),
    ("multi-select run-together set matches", "multiple_choice_multi", "ac", ["A", "C"], True),
    ("multi-select partial set fails", "multiple_choice_multi", "A", ["A", "C"], False),
    ("multi-select extra letter fails", "multiple_choice_multi", "A,B,C", ["A", "C"], False),
    ("list selection three-letter set matches", "list_selection", "B D F", ["B", "D", "F"], True),
    ("empty letter answer fails", "multiple_choice", "", ["B"], False),
]


@pytest.mark.parametrize(
    ("qtype", "given", "accepted", "expected"),
    [(t, g, a, e) for _label, t, g, a, e in LETTER_CASES],
    ids=[label for label, *_rest in LETTER_CASES],
)
def test_letter_answers(qtype: str, given: str, accepted: list[str], expected: bool) -> None:
    assert answers_match(given, accepted, question_type=qtype) is expected


CHOICE_CASES: list[tuple[str, str, str, list[str], bool]] = [
    ("TRUE spelled out", "true_false_not_given", "TRUE", ["true"], True),
    ("true lower case", "true_false_not_given", "true", ["TRUE"], True),
    ("T abbreviation", "true_false_not_given", "T", ["true"], True),
    ("F abbreviation", "true_false_not_given", "f", ["false"], True),
    ("NG abbreviation", "true_false_not_given", "NG", ["not given"], True),
    ("N.G. abbreviation", "true_false_not_given", "N.G.", ["not given"], True),
    ("not given spelled out", "true_false_not_given", "Not Given", ["NOT GIVEN"], True),
    ("notgiven run together", "true_false_not_given", "notgiven", ["not given"], True),
    ("FALSE for a TRUE key fails", "true_false_not_given", "FALSE", ["true"], False),
    ("NOT GIVEN for a FALSE key fails", "true_false_not_given", "NG", ["false"], False),
    ("YES for a yes/no question", "yes_no_not_given", "yes", ["YES"], True),
    ("Y abbreviation", "yes_no_not_given", "Y", ["yes"], True),
    ("N means NO in yes/no", "yes_no_not_given", "N", ["no"], True),
    ("NG in yes/no", "yes_no_not_given", "ng", ["not given"], True),
    ("TRUE is not a yes/no answer", "yes_no_not_given", "true", ["yes"], False),
    ("garbage choice fails", "true_false_not_given", "maybe", ["true"], False),
    ("empty choice fails", "true_false_not_given", "", ["true"], False),
]


@pytest.mark.parametrize(
    ("qtype", "given", "accepted", "expected"),
    [(t, g, a, e) for _label, t, g, a, e in CHOICE_CASES],
    ids=[label for label, *_rest in CHOICE_CASES],
)
def test_choice_answers(qtype: str, given: str, accepted: list[str], expected: bool) -> None:
    assert answers_match(given, accepted, question_type=qtype) is expected


def test_word_limit_is_ignored_for_letter_and_choice_types() -> None:
    """"NOT GIVEN" is two words but is never over a one-word limit."""
    assert answers_match("NOT GIVEN", ["not given"], "true_false_not_given", ONE_WORD) is True
    assert answers_match("A, C", ["A", "C"], "multiple_choice_multi", ONE_WORD) is True


def test_normalize_letters() -> None:
    assert normalize_letters("a, c") == ["A", "C"]
    assert normalize_letters("B") == ["B"]
    assert normalize_letters("iv") == ["IV"]
    assert normalize_letters("") == []


# --------------------------------------------------------------------------------------
# Variant expansion and authoring helpers
# --------------------------------------------------------------------------------------

def test_expand_variants_parenthesized_optional() -> None:
    assert expand_variants(["(sea) turtles"]) == ["sea turtles", "turtles"]


def test_expand_variants_two_optional_groups() -> None:
    assert set(expand_variants(["(the) (green) roof"])) == {
        "the green roof",
        "the roof",
        "green roof",
        "roof",
    }


def test_expand_variants_slash_keeps_the_original() -> None:
    assert expand_variants(["colour/color"]) == ["colour/color", "colour", "color"]


def test_expand_variants_accepts_the_content_bank_shape() -> None:
    assert expand_variants([{"value": "ceramic jars"}, {"value": "ceramic jar"}]) == [
        "ceramic jars",
        "ceramic jar",
    ]


def test_spelling_variants_pairs_are_symmetric() -> None:
    for uk, us in US_UK_PAIRS:
        assert spelling_variants(uk) == [us]
        assert spelling_variants(us) == [uk]


def test_spelling_variants_inside_a_phrase() -> None:
    assert spelling_variants("the town centre") == ["the town center"]
    assert spelling_variants("ceramic jars") == []


def test_spelling_variants_are_not_applied_at_match_time() -> None:
    """06 §4.1: US/UK equivalence must be authored, never invented by the scorer."""
    assert answers_match("center", ["centre"], "short_answer") is False


# --------------------------------------------------------------------------------------
# Near-miss tagging (never affects correctness)
# --------------------------------------------------------------------------------------

def test_near_miss_flags_a_one_edit_typo() -> None:
    assert near_miss("enviroment", ["environment"]) is True
    assert answers_match("enviroment", ["environment"], "short_answer") is False


def test_near_miss_ignores_an_exact_match() -> None:
    assert near_miss("environment", ["environment"]) is False


def test_near_miss_ignores_a_completely_different_word() -> None:
    assert near_miss("bicycle", ["environment"]) is False


# --------------------------------------------------------------------------------------
# Interactions between rules
# --------------------------------------------------------------------------------------

INTERACTION_CASES: list[tuple[str, str, list[str], dict | None, bool]] = [
    (
        "article tolerance plus hyphen tolerance",
        "the well being",
        ["well-being"],
        THREE_WORDS,
        True,
    ),
    (
        "article tolerance plus number equivalence",
        "the seventy-two",
        ["72"],
        TWO_WORDS,
        True,
    ),
    (
        "article pushes a two-word answer over a two-word limit",
        "the well being",
        ["well being"],
        TWO_WORDS,
        False,
    ),
    (
        "hyphenated compound keeps a two-word answer inside a one-word limit",
        "well-being",
        ["well being"],
        ONE_WORD,
        True,
    ),
    (
        "number plus word inside one word and/or a number",
        "40 jars",
        ["40 jars"],
        ONE_WORD_NUM,
        True,
    ),
    (
        "case folding plus punctuation plus variant list",
        "  Ceramic JAR. ",
        ["ceramic jars", "ceramic jar"],
        TWO_WORDS,
        True,
    ),
    (
        "parenthesized optional plus article tolerance",
        "the turtles",
        ["(sea) turtles"],
        TWO_WORDS,
        True,
    ),
    (
        "percent equivalence inside a number-only limit",
        "20%",
        ["20 percent"],
        NUMBER_ONLY,
        True,
    ),
]


@pytest.mark.parametrize(
    ("given", "accepted", "limit", "expected"),
    [(g, a, limit, e) for _label, g, a, limit, e in INTERACTION_CASES],
    ids=[label for label, *_rest in INTERACTION_CASES],
)
def test_rule_interactions(
    given: str, accepted: list[str], limit: dict | None, expected: bool
) -> None:
    assert (
        answers_match(given, accepted, question_type="sentence_completion", word_limit=limit)
        is expected
    )
