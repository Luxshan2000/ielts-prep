"""The shared band arithmetic (ruling R2-4).

``round_ielts`` is imported by speaking, writing, reading, listening and the overall
estimator, so its boundary behaviour is pinned here exhaustively: half-band rounding with
ties (x.25 / x.75) going **UP**.
"""

from __future__ import annotations

import pytest

from bandready.scoring import (
    band_delta,
    clamp_band,
    clamp_criterion,
    format_band,
    mean_band,
    overall_from_criteria,
    round_ielts,
)
from bandready.scoring.bands import BAND_MAX
from bandready.scoring.rubrics import (
    DESCRIPTOR_BANDS,
    SPEAKING_CRITERIA,
    WRITING_CRITERIA,
    criteria_for,
    descriptor,
    descriptor_table,
    rubric_payload,
    writing_criterion1_name,
)

# --------------------------------------------------------------------------------------
# round_ielts — the table
# --------------------------------------------------------------------------------------

ROUNDING_TABLE = [
    # (input, expected) — every quarter step across a band, plus the documented examples
    (0.0, 0.0),
    (4.0, 4.0),
    (4.1, 4.0),
    (4.2, 4.0),
    (4.24, 4.0),
    (4.25, 4.5),          # tie rounds UP
    (4.26, 4.5),
    (4.4, 4.5),
    (4.5, 4.5),
    (4.6, 4.5),
    (4.74, 4.5),
    (4.75, 5.0),          # tie rounds UP
    (4.76, 5.0),
    (4.9, 5.0),
    (5.0, 5.0),
    (5.125, 5.0),
    (5.375, 5.5),
    (6.0, 6.0),
    (6.24, 6.0),
    (6.25, 6.5),          # 05 §6.1's worked example
    (6.49, 6.5),
    (6.5, 6.5),
    (6.51, 6.5),
    (6.74, 6.5),
    (6.75, 7.0),          # 05 §6.1's worked example
    (6.8, 7.0),
    (7.0, 7.0),
    (7.25, 7.5),
    (7.75, 8.0),
    (8.125, 8.0),
    (8.25, 8.5),
    (8.5, 8.5),
    (8.75, 9.0),
    (8.9, 9.0),
    (9.0, 9.0),
]


@pytest.mark.parametrize(("value", "expected"), ROUNDING_TABLE)
def test_round_ielts_table(value: float, expected: float) -> None:
    assert round_ielts(value) == pytest.approx(expected)


def test_round_ielts_ties_always_go_up_across_the_whole_scale() -> None:
    for whole in range(9):
        assert round_ielts(whole + 0.25) == pytest.approx(whole + 0.5)
        assert round_ielts(whole + 0.75) == pytest.approx(whole + 1.0)


def test_round_ielts_output_is_always_a_half_band() -> None:
    value = 0.0
    while value <= 9.0:
        rounded = round_ielts(value)
        assert (rounded * 2) == int(rounded * 2), f"{value} -> {rounded} is not a half band"
        assert 0.0 <= rounded <= 9.0
        value = round(value + 0.01, 2)


def test_round_ielts_clamps_out_of_range_inputs() -> None:
    assert round_ielts(12.4) == BAND_MAX
    assert round_ielts(-3.0) == 0.0


def test_round_ielts_is_robust_to_float_noise() -> None:
    # A mean computed in floating point can land a hair off an exact quarter.
    assert round_ielts(6.250000000000001) == 6.5
    assert round_ielts(6.249999999999999) == 6.0
    assert round_ielts((6 + 6 + 7 + 6) / 4) == 6.5
    assert round_ielts((7 + 7 + 6 + 7) / 4) == 7.0
    assert round_ielts((6 + 7 + 7 + 7) / 4) == 7.0


def test_round_ielts_accepts_ints_and_numeric_strings() -> None:
    assert round_ielts(7) == 7.0
    assert round_ielts("6.25") == 6.5


@pytest.mark.parametrize("bad", ["", "abc", None, object()])
def test_round_ielts_rejects_nonsense(bad: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        round_ielts(bad)


def test_round_ielts_rejects_nan_and_inf() -> None:
    with pytest.raises(ValueError):
        round_ielts(float("nan"))
    with pytest.raises(ValueError):
        round_ielts(float("inf"))


def test_round_ielts_rejects_bool() -> None:
    with pytest.raises(TypeError):
        round_ielts(True)


# --------------------------------------------------------------------------------------
# criteria arithmetic
# --------------------------------------------------------------------------------------

def test_overall_from_criteria_flat_mapping() -> None:
    assert overall_from_criteria({"ta": 6, "cc": 6, "lr": 7, "gra": 6}) == 6.5
    assert overall_from_criteria({"ta": 6, "cc": 6, "lr": 6, "gra": 6}) == 6.0
    assert overall_from_criteria({"fc": 7, "lr": 8, "gra": 7, "pron": 7}) == 7.5


def test_overall_from_criteria_nested_llm_shape_and_ignores_meta() -> None:
    payload = {
        "task_achievement": {"band": 6, "comment": "x"},
        "coherence_cohesion": {"band": 7, "comment": "y"},
        "lexical_resource": {"band": 6, "comment": "z"},
        "grammatical_range_accuracy": {"band": 6, "comment": "w"},
        "_meta": {"model_id": "mock-model-1"},
    }
    assert overall_from_criteria(payload) == 6.5


def test_overall_from_criteria_needs_at_least_one_band() -> None:
    with pytest.raises(ValueError):
        overall_from_criteria({})
    with pytest.raises(ValueError):
        overall_from_criteria({"ta": {"comment": "no band here"}})
    with pytest.raises(TypeError):
        overall_from_criteria([6, 6, 7, 6])  # type: ignore[arg-type]


def test_mean_band_and_clamps() -> None:
    assert mean_band([6, 7]) == pytest.approx(6.5)
    with pytest.raises(ValueError):
        mean_band([])
    assert clamp_band(11) == 9.0
    assert clamp_band(-1) == 0.0
    assert clamp_criterion(0) == 1
    assert clamp_criterion(11) == 9
    assert clamp_criterion(6.5) == 7  # whole bands only, ties up
    assert clamp_criterion("6") == 6


def test_band_delta_and_format() -> None:
    assert band_delta(7.0, 6.0) == 1.0
    assert band_delta(6.0, 6.5) == -0.5
    assert format_band(7) == "7.0"
    assert format_band(6.5) == "6.5"


# --------------------------------------------------------------------------------------
# rubrics
# --------------------------------------------------------------------------------------

def test_rubrics_cover_every_criterion_and_band() -> None:
    for skill, keys in (("writing", WRITING_CRITERIA), ("speaking", SPEAKING_CRITERIA)):
        assert criteria_for(skill) == keys
        for key in keys:
            for band in DESCRIPTOR_BANDS:
                text = descriptor(skill, key, band)
                assert len(text) > 30, (skill, key, band)


def test_descriptor_clamps_outside_the_paraphrased_range() -> None:
    assert descriptor("writing", "ta", 2) == descriptor("writing", "ta", 4)
    assert descriptor("writing", "ta", 10) == descriptor("writing", "ta", 9)


def test_criterion_one_is_named_for_the_task() -> None:
    assert writing_criterion1_name("task2") == "Task Response"
    assert writing_criterion1_name("ac_task1") == "Task Achievement"
    assert writing_criterion1_name(None) == "Task Achievement"


def test_descriptor_table_is_prompt_ready() -> None:
    table = descriptor_table("writing", "task2")
    lines = table.splitlines()
    assert lines[0].startswith("| Band | Task Response |")
    assert len(lines) == 2 + len(DESCRIPTOR_BANDS)
    assert descriptor_table("speaking").splitlines()[0].count("|") == 6


def test_rubric_payload_shape() -> None:
    payload = rubric_payload("writing", "ac_task1")
    assert [c["key"] for c in payload["criteria"]] == list(WRITING_CRITERIA)
    assert payload["criteria"][0]["label"] == "Task Achievement"
    assert payload["criteria"][0]["wire"] == "task_achievement"
    assert set(payload["criteria"][0]["descriptors"]) == {"4", "5", "6", "7", "8", "9"}


def test_unknown_skill_is_rejected() -> None:
    with pytest.raises(ValueError):
        criteria_for("reading")
    with pytest.raises(ValueError):
        descriptor("writing", "nope", 6)
