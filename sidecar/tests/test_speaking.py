"""Speaking module tests: the pure logic, and one whole session lifecycle in mock mode.

The lifecycle test deliberately runs **without WebRTC** — it starts a session, injects a
transcript through the documented headless seam, ends it, and scores it. That exercises
every route, the R2-24 turn flatten, the R2-4 band recompute and the R2-5 vocab inbox
without needing a real peer connection or a microphone.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from bandready.voice import metrics as M
from bandready.voice import runtime
from bandready.voice.injector import MARKER, build_messages
from bandready.voice.state_machine import (
    P1_INTRO,
    P1_QA,
    P2_INTRO,
    P2_LONG_TURN,
    P2_PREP,
    P2_ROUNDING,
    P3_DISCUSS,
    WRAP_UP,
    CardBundle,
    GateState,
    SpeakingStateMachine,
    Timings,
    default_bundle,
)

# ======================================================================================
# injector.build_messages — purity and the strip-then-insert rule
# ======================================================================================


def test_build_messages_inserts_before_last_user_turn() -> None:
    history = [
        {"role": "system", "content": "persona"},
        {"role": "assistant", "content": "Where do you live?"},
        {"role": "user", "content": "In a small city."},
    ]
    out = build_messages(history, "CURRENT TASK: ask question 2")

    assert [m["role"] for m in out] == ["system", "assistant", "system", "user"]
    assert out[2]["content"].startswith(MARKER)
    # purity: the caller's list and dicts are untouched
    assert len(history) == 3
    assert history[0] == {"role": "system", "content": "persona"}


def test_build_messages_strips_the_previous_card() -> None:
    first = build_messages(
        [{"role": "system", "content": "persona"}, {"role": "user", "content": "hi"}],
        "card one",
    )
    second = build_messages(first + [{"role": "user", "content": "again"}], "card two")

    cards = [m for m in second if m["content"].startswith(MARKER)]
    assert len(cards) == 1
    assert "card two" in cards[0]["content"]
    assert "card one" not in json.dumps(second)


def test_build_messages_without_a_card_only_cleans() -> None:
    out = build_messages(
        [{"role": "system", "content": f"{MARKER}\nold"}, {"role": "user", "content": "hi"}],
        None,
    )
    assert out == [{"role": "user", "content": "hi"}]


def test_build_messages_trims_history_but_pins_the_persona() -> None:
    convo = [{"role": "system", "content": "persona"}]
    convo += [{"role": "user", "content": f"turn {i}"} for i in range(20)]
    out = build_messages(convo, "card", max_history=4)

    assert out[0]["content"] == "persona"
    assert len([m for m in out if m["role"] == "user"]) == 4
    assert out[-1]["content"] == "turn 19"


def test_build_messages_appends_when_there_is_no_user_turn() -> None:
    out = build_messages([{"role": "system", "content": "persona"}], "card")
    assert out[-1]["content"].startswith(MARKER)


# ======================================================================================
# metrics — the R2-10 set, exactly
# ======================================================================================


def test_turn_metrics_math() -> None:
    # 10 words; two runs of 4 s and 5 s with a 2 s pause between them.
    segments = [
        {"t_start_ms": 10_000, "t_end_ms": 14_000},
        {"t_start_ms": 16_000, "t_end_ms": 21_000},
    ]
    text = "um I I think the the best thing is the food"
    out = M.turn_metrics(text, segments, prev_assistant_t_ms=9_200)

    assert out["_words"] == 11
    # response span 11 s, speech 9 s
    assert out["wpm"] == pytest.approx(11 / (11 / 60), rel=1e-3)
    assert out["articulation_wpm"] == pytest.approx(11 / (9 / 60), rel=1e-3)
    assert out["mean_pause_ms"] == 2000
    assert out["long_pause_count"] == 1              # 2000 ms ≥ 1500 ms
    assert out["pause_ratio"] == pytest.approx(2 / 11, abs=0.01)
    assert out["initial_latency_ms"] == 800
    assert out["filler_count"] == 1                  # "um"
    assert out["false_start_count"] == 2             # "I I" and "the the"
    assert out["mean_length_of_run_words"] == pytest.approx(5.5)


def test_short_gaps_are_vad_jitter_not_pauses() -> None:
    segments = [
        {"t_start_ms": 0, "t_end_ms": 1_000},
        {"t_start_ms": 1_100, "t_end_ms": 2_000},  # 100 ms gap → ignored
    ]
    out = M.turn_metrics("one two three four", segments)
    assert out["mean_pause_ms"] == 0
    assert out["mean_length_of_run_words"] == 4.0  # a jitter gap never splits a run


def test_metrics_degrade_cleanly_without_segments() -> None:
    out = M.turn_metrics("hello there", [])
    assert out["wpm"] == 0.0
    assert out["initial_latency_ms"] is None
    assert set(M.METRIC_FIELDS).issubset(out)


def test_false_start_counts_bigram_repetition() -> None:
    assert M.false_start_count("I went to I went to the market") == 1
    assert M.false_start_count("no repetition at all here") == 0


def test_aggregate_pools_totals_rather_than_averaging_rates() -> None:
    long_turn = M.turn_metrics(
        " ".join(["word"] * 100), [{"t_start_ms": 0, "t_end_ms": 60_000}]
    )
    tiny = M.turn_metrics("yes", [{"t_start_ms": 61_000, "t_end_ms": 61_500}])
    pooled = M.aggregate_metrics([long_turn, tiny])
    # 101 words over 60.5 s of speech ≈ 100 wpm — not the mean of 100 and 360.
    assert 95 <= pooled["articulation_wpm"] <= 105


def test_p2_long_turn_secs_only_counts_the_long_turn() -> None:
    turns = [
        {
            "role": "user",
            "phase": "P1_QA",
            "segments": [{"t_start_ms": 0, "t_end_ms": 5_000}],
        },
        {
            "role": "user",
            "phase": "P2_LONG_TURN",
            "segments": [{"t_start_ms": 20_000, "t_end_ms": 60_000}],
        },
        {
            "role": "user",
            "phase": "P2_LONG_TURN",
            "segments": [{"t_start_ms": 62_000, "t_end_ms": 116_000}],
        },
    ]
    assert M.p2_long_turn_secs(turns) == pytest.approx(96.0)
    assert M.p2_long_turn_secs(turns[:1]) is None


def test_compute_transcript_metrics_shape() -> None:
    record = {
        "turns": [
            {"role": "assistant", "text": "Where do you live?", "t_ms": 1_000},
            {
                "role": "user",
                "text": "I live in a small city near the coast",
                "t_ms": 8_000,
                "part": 1,
                "phase": "P1_QA",
                "segments": [{"t_start_ms": 2_000, "t_end_ms": 7_500}],
            },
        ]
    }
    out = M.compute_transcript_metrics(record)
    assert set(out) == {"parts", "overall", "session", "turns"}
    assert "1" in out["parts"]
    assert out["turns"][0]["turn_index"] == 1
    assert "p2_long_turn_secs" not in out["session"]
    # private aggregation keys never leak into the persisted document
    assert not [k for k in out["turns"][0] if k.startswith("_")]


# ======================================================================================
# state machine
# ======================================================================================


class Recorder:
    """Collects the state machine's three side-channels."""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.lines: list[str] = []
        self.gate = GateState(True)

    def emit(self, event: dict[str, Any]) -> None:
        self.events.append(event)

    def speak(self, line: str) -> None:
        self.lines.append(line)

    def set_gate(self, is_open: bool) -> None:
        self.gate.set_open(is_open)

    def states(self) -> list[str]:
        return [e["state"] for e in self.events if e["type"] == "state"]


def machine(activity: str = "full_mock", part: int | None = None) -> tuple[Any, Recorder]:
    rec = Recorder()
    sm = SpeakingStateMachine(
        "ss_test",
        activity=activity,
        part=part,
        bundle=default_bundle(),
        timings=Timings(),
        emit=rec.emit,
        speak=rec.speak,
        gate=rec.set_gate,
    )
    return sm, rec


async def test_full_mock_walks_the_canonical_phases() -> None:
    sm, rec = machine()
    await sm.start()
    assert sm.phase == P1_INTRO

    await sm.on_user_turn("My name is Sam.", 1_000)
    assert sm.phase == P1_QA

    # Exhaust Part 1 the way the pipeline does: examiner asks, candidate answers.
    for _ in range(40):
        if sm.phase != P1_QA:
            break
        await sm.on_assistant_turn("question?", 0)
        await sm.on_user_turn("an answer", 0)
    assert sm.phase == P2_PREP           # P2_INTRO chains straight into prep
    assert P2_INTRO in rec.states()
    assert any(e["type"] == "cue_card" for e in rec.events)


async def test_part2_gate_is_closed_for_prep_and_the_long_turn() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()

    assert sm.phase == P2_PREP
    assert rec.gate.is_open is False      # 02 §7 — examiner structurally silent

    await sm.transition(P2_LONG_TURN)
    assert rec.gate.is_open is False

    # The hard 120 s cutoff: scripted "Thank you.", then the rounding-off question.
    await sm._on_timer_expired("p2_long_turn_max")
    assert sm.phase == P2_ROUNDING
    assert rec.lines[-1] == "Thank you."
    assert rec.gate.is_open is True       # gate reopens for the LLM turn


async def test_prep_timer_hard_transitions_into_the_long_turn() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()
    await sm._on_timer_expired("p2_prep")
    assert sm.phase == P2_LONG_TURN
    assert any("one to two minutes" in line for line in rec.lines)


async def test_long_turn_ends_after_enough_speech() -> None:
    sm, _rec = machine("single_part", part=2)
    await sm.start()
    await sm.transition(P2_LONG_TURN)
    await sm.on_user_turn("a short start", 0, speech_s=20.0)
    assert sm.phase == P2_LONG_TURN       # under the 60 s soft minimum
    await sm.on_user_turn("the rest of the monologue", 0, speech_s=45.0)
    assert sm.phase == P2_ROUNDING


async def test_soft_budget_waits_for_the_current_turn() -> None:
    sm, _rec = machine()
    await sm.start()
    await sm.on_user_turn("name", 0)
    assert sm.phase == P1_QA
    await sm._on_timer_expired("p1_budget")
    assert sm.phase == P1_QA               # soft: never cuts mid-answer
    await sm.on_assistant_turn("q", 0)
    await sm.on_user_turn("a", 0)
    assert sm.phase == P2_PREP


async def test_single_part_3_wraps_up_without_other_parts() -> None:
    sm, rec = machine("single_part", part=3)
    await sm.start()
    assert sm.phase == P3_DISCUSS
    assert sm.next_phase() == WRAP_UP
    await sm._on_timer_expired("p3_budget")
    await sm.on_assistant_turn("q", 0)
    await sm.on_user_turn("a", 0)
    assert sm.phase == WRAP_UP
    assert rec.lines[-1] == "Thank you. That is the end of the Speaking test."


async def test_card_block_is_marked_and_advances_one_question_at_a_time() -> None:
    sm, _rec = machine()
    await sm.start()
    await sm.on_user_turn("name", 0)
    first = sm.current_card_block()
    assert first is not None
    assert "question 1 of" in first
    assert sm.bundle.part1[0].questions[0] in first

    await sm.on_assistant_turn("asked", 0)
    await sm.on_user_turn("answered", 0)
    second = sm.current_card_block()
    assert second is not None
    assert "question 2 of" in second


async def test_no_card_is_offered_while_the_examiner_is_gated() -> None:
    sm, _rec = machine("single_part", part=2)
    await sm.start()
    assert sm.phase == P2_PREP
    assert sm.current_card_block() is None


async def test_hangup_aborts_when_nothing_was_said() -> None:
    sm, _rec = machine()
    await sm.start()
    await sm.hangup()
    assert sm.phase == "ABORTED"


async def test_empty_card_bank_falls_back_to_the_builtin_set() -> None:
    bundle = CardBundle.from_payloads([])
    assert bundle.is_empty()
    sm = SpeakingStateMachine("ss_x", bundle=None)
    assert sm.bundle.part2 is not None


def test_card_bundle_parses_authored_payloads() -> None:
    bundle = CardBundle.from_payloads(
        [
            {"id": "c1", "part": 1, "topic": "Hometown", "questions": ["Q1", "Q2"]},
            {
                "id": "c2",
                "part": 2,
                "cue_card": {
                    "topic": "Describe a journey.",
                    "bullets": ["where", "and explain why."],
                    "rounding_off": ["Again?"],
                },
            },
            {
                "id": "c3",
                "part": 3,
                "part3_themes": [
                    {"title": "transport", "questions": ["Why?"], "counterpoint": "cp"}
                ],
            },
        ],
        set_id="set_1",
    )
    assert bundle.set_id == "set_1"
    assert bundle.part1[0].topic == "Hometown"
    assert bundle.part2 is not None and bundle.part2.rounding_off == ["Again?"]
    assert bundle.part3[0].counterpoint == "cp"
    assert bundle.card_ids == ["c1", "c2", "c3"]


# ======================================================================================
# transcript accumulator
# ======================================================================================


def test_accumulator_attaches_segments_to_the_next_user_turn() -> None:
    from bandready.voice.transcript import TranscriptAccumulator

    seen: list[tuple[str, int]] = []
    acc = TranscriptAccumulator(
        stamp=lambda: {"part": 1, "phase": "P1_QA", "card_id": None},
        on_assistant_turn=lambda text, t: seen.append(("assistant", t)),
        on_user_turn=lambda text, t, s: seen.append(("user", t)),
    )
    acc.assistant_turn("Where do you live?", 1_000)
    acc.segment_start(2_000)
    acc.segment_end(6_000)
    acc.segment_start(7_000)
    acc.segment_end(9_000)
    acc.user_turn("in a small city", 9_500)
    acc.segment_start(12_000)
    acc.segment_end(13_000)
    acc.user_turn("near the coast", 13_500)

    record = acc.record()
    assert [t["role"] for t in record["turns"]] == ["assistant", "user", "user"]
    assert len(record["turns"][1]["segments"]) == 2
    assert len(record["turns"][2]["segments"]) == 1   # segments are not re-used
    assert record["turns"][1]["part"] == 1
    assert record["turns"][1]["phase"] == "P1_QA"
    assert "card_id" not in record["turns"][1]        # None values are dropped
    assert seen == [("assistant", 1_000), ("user", 9_500), ("user", 13_500)]

    acc.set_audio_file(acc.last_user_index() or 0, "turn-002.wav")
    assert acc.record()["turns"][2]["audio_file"] == "turn-002.wav"


# ======================================================================================
# recorder — WAV per turn, and never dying on a disk failure
# ======================================================================================


def _tone(ms: int, rate: int = 16000) -> bytes:
    return b"\x01\x02" * int(rate * ms / 1000)


def test_recorder_writes_one_wav_per_turn_with_pre_roll(tmp_path: Path) -> None:
    import wave

    from bandready.voice.recorder import TurnAudioRecorder

    rec = TurnAudioRecorder("ss_test", base_dir=tmp_path)
    for _ in range(10):  # 10 × 100 ms of 16 kHz mono audio
        rec.append(_tone(100), sample_rate=16000, num_channels=1)

    filename = rec.write_turn(4, [{"t_start_ms": 400, "t_end_ms": 900}])
    assert filename == "turn-004.wav"
    path = tmp_path / filename
    with wave.open(str(path), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 16000
        # 500 ms of speech + 300 ms pre-roll
        assert wav.getnframes() == pytest.approx(0.8 * 16000, rel=0.05)

    assert rec.write_manifest() is not None
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["session_id"] == "ss_test"
    assert manifest["turns"][0]["file"] == "turn-004.wav"


def test_recorder_ring_buffer_drops_the_oldest_audio(tmp_path: Path) -> None:
    from bandready.voice.recorder import TurnAudioRecorder

    rec = TurnAudioRecorder("ss_ring", base_dir=tmp_path, capacity_s=1.0)
    for _ in range(20):  # 2 s of audio into a 1 s buffer
        rec.append(_tone(100))
    assert rec._buffered_ms <= 1_100
    # the first second is gone, so an old segment splices to nothing rather than raising
    assert rec.write_turn(1, [{"t_start_ms": 0, "t_end_ms": 200}]) is None


def test_recorder_failures_never_kill_the_session(tmp_path: Path) -> None:
    from bandready.voice.recorder import TurnAudioRecorder

    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    rec = TurnAudioRecorder("ss_fail", base_dir=blocker / "media")
    rec.append(_tone(500))
    assert rec.write_turn(1, [{"t_start_ms": 0, "t_end_ms": 400}]) is None
    rec.close()  # must not raise either


# ======================================================================================
# Pipecat processors (real pipecat objects — skipped when the voice extra is absent)
# ======================================================================================

pipecat_only = pytest.mark.skipif(
    not __import__("bandready.voice.pipeline", fromlist=["x"]).pipecat_available(),
    reason="the voice extra is not installed",
)


@pipecat_only
async def test_llm_gate_drops_context_frames_while_closed() -> None:
    from pipecat.frames.frames import LLMContextFrame

    from bandready.voice.state_machine import make_llm_gate

    gate = make_llm_gate()
    pushed: list[Any] = []

    async def capture(frame: Any, direction: Any = None) -> None:
        pushed.append(frame)

    gate.push_frame = capture
    frame = LLMContextFrame(context=None)

    gate.close()
    await gate.process_frame(frame, None)
    assert pushed == []          # examiner is structurally silent (02 §7)

    gate.open()
    await gate.process_frame(frame, None)
    assert pushed == [frame]


@pipecat_only
def test_question_card_processor_rewrites_the_live_context() -> None:
    from bandready.voice.injector import make_question_card_processor

    class Context:
        def __init__(self) -> None:
            self.messages = [
                {"role": "system", "content": "persona"},
                {"role": "user", "content": "hello"},
            ]

        def get_messages(self) -> list[dict[str, Any]]:
            return self.messages

        def set_messages(self, messages: list[dict[str, Any]]) -> None:
            self.messages = messages

    class Cards:
        def current_card_block(self) -> str:
            return "CURRENT TASK: ask question one"

    context = Context()
    processor = make_question_card_processor(context, Cards())
    processor._apply()

    assert [m["role"] for m in context.messages] == ["system", "system", "user"]
    assert context.messages[1]["content"].startswith(MARKER)


@pipecat_only
def test_vad_params_clamp_min_volume() -> None:
    from bandready.voice.pipeline import vad_params

    params = vad_params()
    assert params["stop_secs"] == 0.6      # must track user_speech_timeout (G2/02 §9)
    assert params["min_volume"] <= 0.6     # G5


# ======================================================================================
# scoring — R2-4 recompute, quote anchoring, band clamping
# ======================================================================================


def test_round_ielts_ties_round_up() -> None:
    from bandready.scoring.speaking import round_ielts

    assert round_ielts(6.25) == 6.5
    assert round_ielts(6.75) == 7.0
    assert round_ielts(6.1) == 6.0
    assert round_ielts(6.4) == 6.5
    assert round_ielts(9.4) == 9.0


def test_overall_band_is_recomputed_and_the_model_is_ignored() -> None:
    from bandready.scoring.speaking import normalize_evaluation

    parsed = {
        "overall_band": 8.5,  # the model's arithmetic — must be ignored (R2-4)
        "criteria": {
            "fc": {"band": 6, "evidence": ["x"], "improvements": ["y"]},
            "lr": {"band": 7, "evidence": [], "improvements": []},
            "gra": {"band": 6, "evidence": [], "improvements": []},
            "pron": {"band": 6, "evidence": [], "improvements": []},
        },
    }
    report = normalize_evaluation(parsed)
    assert report["overall_band"] == 6.5  # mean 6.25 → 6.5
    assert report["model_overall_band"] == 8.5


def test_missing_pronunciation_makes_the_estimate_pron_blind() -> None:
    from bandready.scoring.speaking import normalize_evaluation

    report = normalize_evaluation(
        {
            "criteria": {
                "fc": {"band": 7},
                "lr": {"band": 7},
                "gra": {"band": 6},
                "pron": {"band": None},
            }
        }
    )
    assert report["criteria"]["pron"]["band"] is None
    assert report["pronunciation_blind"] is True
    assert report["overall_band"] == 6.5  # mean of the three available


def test_bands_are_clamped_to_whole_bands_1_to_9() -> None:
    from bandready.scoring.speaking import normalize_evaluation

    report = normalize_evaluation(
        {"criteria": {"fc": {"band": 12}, "lr": {"band": 0}, "gra": {"band": "7"},
                      "pron": {"band": 6.4}}}
    )
    bands = {k: report["criteria"][k]["band"] for k in ("fc", "lr", "gra", "pron")}
    assert bands == {"fc": 9, "lr": 1, "gra": 7, "pron": 6}


def test_unmatched_quotes_are_segregated_not_rendered() -> None:
    from bandready.scoring.speaking import normalize_evaluation

    record = {"turns": [{"role": "user", "text": "there were very much cars downtown"}]}
    report = normalize_evaluation(
        {
            "criteria": {"fc": {"band": 6, "evidence": ["there were very much cars"]}},
            "errors": [
                {"quote": "very much cars", "issue": "quantifier", "better": "heavy traffic"},
                {"quote": "a sentence never spoken", "issue": "?", "better": "?"},
            ],
            "best_moments": ["something the model invented"],
        },
        record,
    )
    assert report["errors"][0]["anchored"] is True
    assert report["errors"][1]["anchored"] is False
    assert "something the model invented" in report["unanchored"]
    assert "there were very much cars" not in report["unanchored"]


def test_transcript_renders_measured_pauses_inline() -> None:
    from bandready.scoring.speaking import render_transcript

    text = render_transcript(
        {
            "turns": [
                {"role": "assistant", "text": "Why?", "t_ms": 1_000},
                {
                    "role": "user",
                    "text": "because the food is good and the people are friendly",
                    "t_ms": 4_000,
                    "segments": [
                        {"t_start_ms": 2_000, "t_end_ms": 6_000},
                        {"t_start_ms": 8_000, "t_end_ms": 12_000},
                    ],
                },
            ]
        }
    )
    assert text.startswith("E [t=1s] Why?")
    assert "(pause 2.0s)" in text
    assert "C [t=4s]" in text


def test_evaluation_prompt_carries_the_descriptors_and_the_metric_contract() -> None:
    from bandready.scoring.speaking import build_evaluation_messages

    record = {
        "turns": [
            {
                "role": "user",
                "text": "I commute every day",
                "t_ms": 1_000,
                "part": 1,
                "segments": [{"t_start_ms": 0, "t_end_ms": 3_000}],
            }
        ]
    }
    messages = build_evaluation_messages(
        record, M.compute_transcript_metrics(record), mode="full_mock", card_set_id="set_1"
    )
    system, user = messages
    assert "senior IELTS Speaking examiner" in system["content"]
    assert "| 9 |" in system["content"]           # descriptor table interpolated
    assert "{" in system["content"]               # the JSON shape survived .format()
    assert "card_set: set_1" in user["content"]
    for field in M.METRIC_FIELDS:
        assert field in user["content"]


# ======================================================================================
# route lifecycle in mock mode — start → inject transcript → end → score → report
# ======================================================================================

TRANSCRIPT = {
    "turns": [
        {"role": "assistant", "text": "Can you tell me your full name, please?", "t_ms": 500},
        {
            "role": "user",
            "text": "My name is Sam Perera.",
            "t_ms": 3_000,
            "part": 1,
            "phase": "P1_QA",
            "segments": [{"t_start_ms": 1_500, "t_end_ms": 2_800}],
        },
        {"role": "assistant", "text": "Do you live in a house or an apartment?", "t_ms": 5_000},
        {
            "role": "user",
            "text": (
                "um I live in a small apartment near the coast and my daily commute takes "
                "an hour because there were very much cars in the morning"
            ),
            "t_ms": 20_000,
            "part": 1,
            "phase": "P1_QA",
            "segments": [
                {"t_start_ms": 6_500, "t_end_ms": 12_000},
                {"t_start_ms": 14_000, "t_end_ms": 19_500},
            ],
        },
        {"role": "assistant", "text": "Here is your topic.", "t_ms": 22_000},
        {
            "role": "user",
            "text": " ".join(["I often go to the beach in the evening"] * 6),
            "t_ms": 120_000,
            "part": 2,
            "phase": "P2_LONG_TURN",
            "segments": [
                {"t_start_ms": 30_000, "t_end_ms": 80_000},
                {"t_start_ms": 82_000, "t_end_ms": 118_000},
            ],
        },
    ]
}


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    from fastapi.testclient import TestClient

    from bandready import settings_store
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", "test-token")
    reset_settings_cache()
    db_engine.reset_engine()
    settings_store.invalidate_cache()
    runtime.reset()

    from bandready.server.app import create_app

    app = create_app()
    # base_url must be loopback: the sidecar rejects any other Host header.
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        test_client.headers.update({"Authorization": "Bearer test-token"})
        # Select the hidden mock LLM so scoring is deterministic and offline.
        settings_store.patch_settings({"llm": {"preset": "mock_llm", "model": "mock-1"}})
        yield test_client
        runtime.reset()

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def test_health_and_routes_are_registered(client: Any) -> None:
    assert client.get("/health").status_code == 200
    engine = client.get("/api/v1/speaking/engine")
    assert engine.status_code == 200
    assert "vad" in engine.json()
    # G5 — the shipped VAD params, with min_volume clamped well below Pipecat's 0.6.
    assert engine.json()["vad"]["min_volume"] <= 0.6


def test_full_session_lifecycle_without_webrtc(client: Any) -> None:
    started = client.post("/api/v1/speaking/sessions", json={"mode": "full_mock"})
    assert started.status_code == 201, started.text
    payload = started.json()
    session_id = payload["session_id"]
    assert session_id.startswith("ss_")
    assert payload["mode"] == "mock"              # R2-7 estimator weight class
    assert payload["state"] == "P1_INTRO"
    assert payload["offer_url"].endswith(f"/{session_id}/offer")

    # a second session is a 409 (workers=1)
    assert client.post("/api/v1/speaking/sessions", json={"mode": "quick_chat"}).status_code == 409

    # headless seam: the transcript a real call would have produced
    runtime.inject_transcript(session_id, TRANSCRIPT)

    ended = client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    assert ended.status_code == 200, ended.text
    assert ended.json()["status"] == "complete"
    assert ended.json()["turns"] == len(TRANSCRIPT["turns"])

    scored = client.post(f"/api/v1/speaking/sessions/{session_id}/score")
    assert scored.status_code == 200, scored.text
    report = scored.json()
    assert report["report_id"].startswith("sr_")
    # mock fixture bands are 6/7/6/6 → mean 6.25 → 6.5 (recomputed, not the model's)
    assert report["overall_band"] == 6.5
    assert set(report["criteria"]) == {"fc", "lr", "gra", "pron"}
    assert report["metrics"]["session"]["p2_long_turn_secs"] == pytest.approx(88.0)

    fetched = client.get(f"/api/v1/speaking/reports/{report['report_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["overall_band"] == 6.5

    via_session = client.get(f"/api/v1/speaking/sessions/{session_id}/report")
    assert via_session.status_code == 200
    assert via_session.json()["report_id"] == report["report_id"]

    record = client.get(f"/api/v1/speaking/sessions/{session_id}").json()
    assert record["status"] == "complete"
    assert record["overall_band"] == 6.5
    assert record["report_id"] == report["report_id"]
    assert record["live"] is False

    history = client.get("/api/v1/speaking/sessions").json()
    assert [item["id"] for item in history["items"]] == [session_id]

    # scoring is idempotent — the same report comes back
    again = client.post(f"/api/v1/speaking/sessions/{session_id}/score")
    assert again.json()["report_id"] == report["report_id"]


def test_teardown_flattens_turns_before_marking_complete(client: Any) -> None:
    from sqlalchemy import select

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "full_mock"}
    ).json()["session_id"]
    runtime.inject_transcript(session_id, TRANSCRIPT)
    client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})

    with session_scope() as s:
        row = s.get(m.SpeakingSession, session_id)
        assert row is not None
        assert row.status == "complete"          # R2-24 — never complete without turns
        turns = list(
            s.execute(
                select(m.SpeakingTurn)
                .where(m.SpeakingTurn.session_id == session_id)
                .order_by(m.SpeakingTurn.turn_index)
            ).scalars()
        )
        assert len(turns) == len(TRANSCRIPT["turns"])
        assert [t.role for t in turns] == [t["role"] for t in TRANSCRIPT["turns"]]
        assert turns[1].segments_json is not None
        assert json.loads(row.metrics_json or "{}")["parts"].keys() >= {"1", "2"}
        envelope = s.get(m.PracticeSession, session_id)
        assert envelope is not None
        assert envelope.activity == "full_mock"
        assert envelope.ended_at is not None


def test_transcript_seam_installs_turns_over_http(client: Any) -> None:
    """The Playwright suite seeds a scored session through this mock-only route.

    It is the out-of-process twin of ``runtime.inject_transcript``: a browser can
    never reach the runtime object, so a speaking report has to be seedable over
    HTTP. Registered only under ``BANDREADY_ENABLE_MOCK=1``.
    """
    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "full_mock"}
    ).json()["session_id"]

    empty = client.post(f"/api/v1/speaking/sessions/{session_id}/transcript", json={"turns": []})
    assert empty.status_code == 422, "an empty transcript is a client error, not a silent no-op"

    installed = client.post(
        f"/api/v1/speaking/sessions/{session_id}/transcript", json=TRANSCRIPT
    )
    assert installed.status_code == 200
    assert installed.json()["turns"] == len(TRANSCRIPT["turns"])

    ended = client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    assert ended.json()["turns"] == len(TRANSCRIPT["turns"])

    turns = client.get(f"/api/v1/speaking/sessions/{session_id}/transcript").json()["turns"]
    assert [t["text"] for t in turns] == [t["text"] for t in TRANSCRIPT["turns"]]

    gone = client.post("/api/v1/speaking/sessions/ss_not_a_session/transcript", json=TRANSCRIPT)
    assert gone.status_code == 404


def test_finalizing_twice_never_wipes_the_record(client: Any) -> None:
    """The runner's finally-block and `POST …/end` both call finalize — order-independent."""
    from sqlalchemy import func, select

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "full_mock"}
    ).json()["session_id"]
    runtime.inject_transcript(session_id, TRANSCRIPT)

    first = client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    second = client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    assert first.json()["turns"] == second.json()["turns"] == len(TRANSCRIPT["turns"])

    with session_scope() as s:
        row = s.get(m.SpeakingSession, session_id)
        assert row is not None
        assert json.loads(row.transcript_json or "{}")["turns"]
        assert (
            s.execute(
                select(func.count())
                .select_from(m.SpeakingTurn)
                .where(m.SpeakingTurn.session_id == session_id)
            ).scalar()
            == len(TRANSCRIPT["turns"])
        )


def test_scoring_files_suggestions_but_never_srs_cards(client: Any) -> None:
    from sqlalchemy import func, select

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "full_mock"}
    ).json()["session_id"]
    runtime.inject_transcript(session_id, TRANSCRIPT)
    client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    client.post(f"/api/v1/speaking/sessions/{session_id}/score")

    with session_scope() as s:
        entries = list(s.execute(select(m.VocabEntry)).scalars())
        assert entries, "the report's vocab_to_bank items must reach the inbox"
        assert {e.status for e in entries} == {"suggested"}      # R2-5
        assert s.execute(select(func.count()).select_from(m.SrsCard)).scalar() == 0
        sources = list(s.execute(select(m.VocabSource)).scalars())
        assert {src.module for src in sources} == {"speaking"}
        assert all(src.session_id == session_id for src in sources)


def test_single_part_requires_a_part(client: Any) -> None:
    bad = client.post("/api/v1/speaking/sessions", json={"mode": "single_part"})
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation_error"

    good = client.post("/api/v1/speaking/sessions", json={"mode": "single_part", "part": 2})
    assert good.status_code == 201
    assert good.json()["state"] == "P2_PREP"       # cue card + prep timer, immediately


def test_unknown_mode_and_unknown_session(client: Any) -> None:
    assert client.post("/api/v1/speaking/sessions", json={"mode": "nonsense"}).status_code == 422
    missing = client.get("/api/v1/speaking/sessions/ss_missing")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"
    assert client.post("/api/v1/speaking/sessions/ss_missing/score").status_code == 404


def test_scoring_an_empty_session_is_refused(client: Any) -> None:
    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "quick_chat"}
    ).json()["session_id"]
    client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})
    refused = client.post(f"/api/v1/speaking/sessions/{session_id}/score")
    assert refused.status_code == 422
    assert "no candidate speech" in refused.json()["detail"]


def test_events_socket_needs_a_ticket(client: Any) -> None:
    from starlette.websockets import WebSocketDisconnect as WSDisconnect

    from bandready.server.tickets import issue_ticket

    session_id = client.post(
        "/api/v1/speaking/sessions", json={"mode": "full_mock"}
    ).json()["session_id"]

    with pytest.raises(WSDisconnect), client.websocket_connect(
        f"/api/v1/speaking/sessions/{session_id}/events?ticket=forged"
    ) as socket:
        socket.receive_json()

    ticket = issue_ticket("session-events", session_id)
    with client.websocket_connect(
        f"/api/v1/speaking/sessions/{session_id}/events?ticket={ticket}"
    ) as socket:
        first = socket.receive_json()
        assert first["type"] == "state"
        assert first["state"] == "P1_INTRO"

    client.post(f"/api/v1/speaking/sessions/{session_id}/end", json={"score": False})


def test_cards_endpoint_has_an_empty_state(client: Any) -> None:
    listed = client.get("/api/v1/speaking/cards?part=2")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert items, "an unseeded bank still shows the built-in cards"
