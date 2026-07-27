"""Examiner realism (M3): does the live examiner behave like the real one?

Every assertion here traces to ``content/core-en/staging/research/01-exam-reality.md``:

* §8 — the part-dependent asymmetry: Part 1 may repeat but never reword or gloss a word;
  Part 3 may do all three.
* §3.3 — the long turn is silent, gets ONE prompt if it dries up early, and is cut off at
  two minutes with a bare acknowledgement.
* §6, §8 — relevance is not assessed, so the examiner never redirects or corrects.
* §7 — examiner turns are short and the candidate holds roughly 80% of the airtime.
* §7 — part transitions are scripted moves, identical in every session.

The pure functions are tested directly; the state machine is driven through the same seam
the pipeline uses (``on_user_turn`` / ``on_assistant_turn`` / timer expiry), so the wiring
is covered without WebRTC, audio or a model.
"""

from __future__ import annotations

from typing import Any

from bandready.voice import examiner as E
from bandready.voice import state_machine as SM
from bandready.voice.injector import MARKER, RULES_MARKER, build_messages
from bandready.voice.state_machine import (
    P1_QA,
    P2_LONG_TURN,
    P2_ROUNDING,
    P3_DISCUSS,
    CardBundle,
    CueCard,
    GateState,
    SpeakingStateMachine,
    Theme,
    Timings,
    TopicFrame,
    default_bundle,
)

# ======================================================================================
# harness
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


def machine(
    activity: str = "full_mock",
    part: int | None = None,
    bundle: CardBundle | None = None,
    timings: Timings | None = None,
) -> tuple[SpeakingStateMachine, Recorder]:
    rec = Recorder()
    sm = SpeakingStateMachine(
        "ss_realism",
        activity=activity,
        part=part,
        bundle=bundle or default_bundle(),
        timings=timings or Timings(),
        emit=rec.emit,
        speak=rec.speak,
        gate=rec.set_gate,
    )
    return sm, rec


async def part1_machine() -> tuple[SpeakingStateMachine, Recorder]:
    """A session parked on the first Part 1 question, with that question already asked."""
    sm, rec = machine("single_part", part=1)
    await sm.start()
    await sm.on_user_turn("My name is Sam.", 0)          # identity move -> P1_QA
    await sm.on_assistant_turn("Do you live in a house or an apartment?", 0)
    assert sm.phase == P1_QA
    rec.lines.clear()
    return sm, rec


async def part3_machine() -> tuple[SpeakingStateMachine, Recorder]:
    sm, rec = machine("single_part", part=3)
    await sm.start()
    assert sm.phase == P3_DISCUSS
    await sm.on_assistant_turn("Why do people need places to relax?", 0)
    rec.lines.clear()
    return sm, rec


# ======================================================================================
# 1. Repeat vs rephrase — the part-dependent asymmetry (research 01 §8)
# ======================================================================================


def test_detects_the_four_kinds_of_candidate_request() -> None:
    cases = {
        "Sorry?": E.REPEAT,
        "Pardon?": E.REPEAT,
        "Sorry, could you repeat that please?": E.REPEAT,
        "I didn't catch that.": E.REPEAT,
        "Could you say that again?": E.REPEAT,
        "Could you rephrase the question?": E.REPHRASE,
        "I don't understand the question.": E.REPHRASE,
        "What does 'commute' mean?": E.MEANING,
        "Sorry, what's the meaning of leisure?": E.MEANING,
        "What do you think?": E.OPINION,
        "And you?": E.OPINION,
    }
    for text, kind in cases.items():
        request = E.detect_clarification_request(text)
        assert request is not None, text
        assert request.kind == kind, text


def test_an_ordinary_answer_is_not_a_request_for_help() -> None:
    answers = [
        "I live in a small flat near the river with my brother.",
        "Sorry to say it, but I have never really enjoyed cooking at home.",
        "I understand why some people move to the city, and I think that is fair.",
        "It is hard to say. Most of my friends work in offices, so we meet at weekends.",
    ]
    for answer in answers:
        assert E.detect_clarification_request(answer) is None, answer


def test_meaning_request_captures_the_word_asked_about() -> None:
    request = E.detect_clarification_request("What does 'commute' mean?")
    assert request is not None
    assert request.term == "commute"


def test_part1_may_repeat_but_may_not_reword_or_gloss() -> None:
    """Research 01 §8: the Part 1 frame is scripted, so paraphrase is off the table."""
    repeat = E.clarification_policy(1, E.REPEAT)
    assert repeat.action == E.ACT_REPEAT
    assert repeat.scripted is True and repeat.repeat_question is True
    assert repeat.llm_instruction is None

    for kind in (E.REPHRASE, E.MEANING):
        policy = E.clarification_policy(1, kind)
        assert policy.action == E.ACT_DECLINE, kind
        assert policy.scripted is True, kind          # the model never gets a chance to help
        assert policy.llm_instruction is None, kind
        assert policy.repeat_question is True, kind   # the one thing that IS allowed
        assert "reword" in (policy.lead_in or "") or "explain" in (policy.lead_in or "")


def test_part2_is_as_strict_as_part1_and_part3_is_not() -> None:
    assert E.clarification_policy(2, E.MEANING).action == E.ACT_DECLINE
    assert E.clarification_policy(3, E.MEANING).action == E.ACT_EXPLAIN
    assert E.clarification_policy(3, E.REPHRASE).action == E.ACT_REPHRASE


def test_part3_rewording_is_delegated_to_the_model_not_scripted() -> None:
    policy = E.clarification_policy(3, E.REPHRASE)
    assert policy.scripted is False
    assert policy.llm_instruction is not None
    assert "simpler" in policy.llm_instruction
    assert "do not answer it yourself" in policy.llm_instruction.lower()


def test_an_unknown_part_falls_back_to_the_strictest_rule() -> None:
    assert E.clarification_policy(None, E.MEANING).action == E.ACT_DECLINE


def test_a_request_never_consumes_the_question() -> None:
    for part in (1, 2, 3):
        for kind in (E.REPEAT, E.REPHRASE, E.MEANING, E.OPINION):
            assert E.clarification_policy(part, kind).advance_question is False


def test_the_examiners_own_opinion_is_always_deflected() -> None:
    for part in (1, 2, 3):
        policy = E.clarification_policy(part, E.OPINION)
        assert policy.action == E.ACT_DEFLECT
        assert policy.scripted is True


async def test_part1_repeat_puts_the_same_question_again_verbatim() -> None:
    sm, _rec = await part1_machine()
    question = sm.current_question_text()
    before = (sm.frame_index, sm.question_index)

    await sm.on_user_turn("Sorry, could you repeat that?", 0, speech_s=2.0)

    assert (sm.frame_index, sm.question_index) == before
    assert sm.current_question_text() == question   # the question still stands
    assert sm.clarification_requests == 1
    block = sm.current_card_block() or ""
    assert "CLARIFICATION REQUEST" in block
    assert "asked you to repeat" in block
    assert "word for word" in block
    assert "no rewording" in block


async def test_part1_refuses_to_explain_a_word_and_reads_the_question_again() -> None:
    sm, _rec = await part1_machine()
    question = sm.current_question_text()

    await sm.on_user_turn("Sorry, what does 'apartment' mean?", 0, speech_s=2.0)

    block = sm.current_card_block() or ""
    assert f'"{E.LINE_DECLINE_MEANING}"' in block    # our words, quoted verbatim
    assert "you may not do either" in block
    assert question is not None and question in block
    # The refusal itself must not teach: no definition, no synonym, no example.
    assert E.examiner_turn_violations(E.LINE_DECLINE_MEANING) == []


async def test_a_clarification_never_consumes_the_question_in_any_part() -> None:
    sm, _rec = await part1_machine()
    for text in ("Sorry?", "What does that mean?", "What do you think?"):
        before = (sm.frame_index, sm.question_index)
        await sm.on_user_turn(text, 0, speech_s=2.0)
        assert (sm.frame_index, sm.question_index) == before, text
    assert sm.clarification_requests == 3


async def test_part3_hands_the_reword_to_the_model_and_keeps_the_question() -> None:
    sm, rec = await part3_machine()
    question = sm.current_question_text()
    before = (sm.theme_index, sm.question_index)

    await sm.on_user_turn("Sorry, I don't understand the question.", 0, speech_s=2.0)

    assert rec.lines == []                          # nothing is queued behind the model
    assert (sm.theme_index, sm.question_index) == before
    block = sm.current_card_block()
    assert block is not None
    assert "CLARIFICATION REQUEST" in block
    assert "simpler" in block
    assert "no rewording" not in block              # Part 3 may reword — Part 1 may not
    assert question is not None and question in block


async def test_the_clarification_instruction_lasts_exactly_one_turn() -> None:
    sm, _rec = await part3_machine()
    await sm.on_user_turn("Could you rephrase that?", 0, speech_s=2.0)
    assert "CLARIFICATION REQUEST" in (sm.current_card_block() or "")
    await sm.on_user_turn("I suppose it depends on the city you live in.", 0, speech_s=12.0)
    assert "CLARIFICATION REQUEST" not in (sm.current_card_block() or "")


async def test_part1_rules_forbid_rewording_and_part3_rules_allow_it() -> None:
    part1 = E.examiner_rules_fragment(1)
    part3 = E.examiner_rules_fragment(3)
    assert "may NOT reword" in part1
    assert "explain what any word in it means" in part1
    assert "simpler words" in part3
    assert "briefly explain what a word means" in part3
    # the constant rules travel with every part
    for fragment in (part1, part3):
        assert "never teach" in fragment
        assert "Relevance is not assessed" in fragment


# ======================================================================================
# 2. Silence during the long turn (research 01 §3.3)
# ======================================================================================


def test_long_turn_decision_stays_silent_while_the_candidate_speaks() -> None:
    assert E.long_turn_decision(speech_s=5.0, candidate_speaking=True) == E.LT_SILENT
    assert E.long_turn_decision(speech_s=95.0, candidate_speaking=True) == E.LT_SILENT
    assert E.BACKCHANNEL_ALLOWED is False


def test_long_turn_prompts_once_then_moves_on() -> None:
    stopped = {"speech_s": 35.0, "candidate_speaking": False}
    assert E.long_turn_decision(**stopped, prompts_used=0) == E.LT_PROMPT
    assert E.long_turn_decision(**stopped, prompts_used=1) == E.LT_END
    assert E.long_turn_decision(**stopped, prompts_used=5) == E.LT_END


def test_a_full_length_turn_that_ends_is_never_prompted() -> None:
    assert (
        E.long_turn_decision(speech_s=75.0, candidate_speaking=False, prompts_used=0)
        == E.LT_END
    )


def test_the_two_minute_cutoff_beats_everything_including_mid_sentence() -> None:
    assert (
        E.long_turn_decision(speech_s=118.0, elapsed_s=120.0, candidate_speaking=True)
        == E.LT_STOP
    )
    assert (
        E.long_turn_decision(speech_s=20.0, elapsed_s=130.0, candidate_speaking=False)
        == E.LT_STOP
    )


def test_the_cutoff_line_implies_no_penalty() -> None:
    """Being stopped at 2:00 is a good sign (research 01 §3.3) — say nothing else."""
    assert E.LINE_P2_STOP == "Thank you."
    assert E.examiner_turn_violations(E.LINE_P2_STOP) == []


def test_the_prompt_aims_at_a_bullet_the_candidate_has_not_covered() -> None:
    bullets = default_bundle().part2.bullets
    said = "It's a small cafe near my flat, and I go there most mornings before work."
    bullet = E.uncovered_bullet(bullets, said)
    assert bullet == bullets[-1]                       # the "and explain why…" bullet
    line = E.long_turn_prompt_line(bullet)
    assert line == "Is there anything more you can tell me about why you like going to this place?"
    assert E.examiner_turn_violations(line) == []


def test_the_prompt_falls_back_to_a_neutral_nudge() -> None:
    assert E.long_turn_prompt_line(None) == "Is there anything else you'd like to add?"
    assert E.uncovered_bullet([], "anything") is None


async def test_the_examiner_says_nothing_at_all_during_the_long_turn() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()
    await sm.transition(P2_LONG_TURN)
    rec.lines.clear()

    # A candidate mid-monologue, pausing, restarting — and even asking a question.
    await sm.on_user_turn("My favourite place is a cafe near the river.", 0, speech_s=18.0)
    await sm.on_user_turn("Sorry, could you repeat the topic?", 0, speech_s=3.0)

    assert rec.lines == []                    # no backchannel, no help, no acknowledgement
    assert rec.gate.is_open is False          # the model is structurally unable to speak
    assert sm.current_card_block() is None
    assert sm.current_rules_block() is not None
    assert "say nothing at all" in (sm.current_rules_block() or "")
    sm.cancel_timers()


async def test_an_early_stop_is_prompted_once_and_then_moves_on() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()
    await sm.transition(P2_LONG_TURN)
    rec.lines.clear()

    await sm.on_user_turn("It's a cafe near the river and I go there a lot.", 0, speech_s=32.0)
    await sm._on_timer_expired("p2_early_stop")        # candidate has gone quiet

    assert sm.phase == P2_LONG_TURN                    # still their turn
    assert len(rec.lines) == 1
    assert rec.lines[0].startswith("Is there anything more")
    assert sm.long_turn_prompts == 1

    # Still nothing: one prompt is all a real examiner gives.
    await sm.on_user_turn("Um. That's all really.", 0, speech_s=3.0)
    await sm._on_timer_expired("p2_early_stop")

    assert sm.long_turn_prompts == 1
    assert rec.lines[-1] == E.LINE_P2_STOP
    assert sm.phase == P2_ROUNDING
    sm.cancel_timers()


async def test_a_long_enough_turn_that_ends_is_not_prompted() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()
    await sm.transition(P2_LONG_TURN)
    rec.lines.clear()

    await sm.on_user_turn("...", 0, speech_s=95.0)     # over the 60 s soft minimum

    assert sm.phase == P2_ROUNDING
    assert rec.lines == [E.LINE_P2_STOP]
    assert sm.long_turn_prompts == 0


async def test_the_hard_cutoff_stops_the_talk_with_a_bare_thank_you() -> None:
    sm, rec = machine("single_part", part=2)
    await sm.start()
    await sm.transition(P2_LONG_TURN)
    rec.lines.clear()

    await sm.on_user_turn("still going", 0, speech_s=40.0)
    await sm._on_timer_expired("p2_long_turn_max")

    assert rec.lines[-1] == "Thank you."
    assert sm.phase == P2_ROUNDING
    sm.cancel_timers()


# ======================================================================================
# 3. Off-topic and misunderstanding — the examiner does not "fix" anything (§6, §8)
# ======================================================================================


def test_the_conduct_block_forbids_steering_an_off_topic_candidate() -> None:
    fragment = E.examiner_rules_fragment(1).lower()
    for phrase in (
        "do not steer them back",
        "do not correct them",
        "relevance is not assessed",
        "ask the next question",
    ):
        assert phrase in fragment


def test_coaching_behaviours_are_flagged_in_generated_turns() -> None:
    cases = {
        "Good answer! Now, do you often cook at home?": "praise",
        "Well done. Let's move on.": "praise",
        "Actually, you should say 'commute', not 'commuting'.": "teaching",
        "I think you mean 'rent', not 'hire'.": "teaching",
        "That's not what I asked — let's get back to the question about food.": "steering",
        "You didn't answer the question about your home.": "steering",
        "Your English is very strong, you'd probably get a band seven.": "feedback",
    }
    for text, code in cases.items():
        codes = [v.code for v in E.examiner_turn_violations(text)]
        assert code in codes, f"{text!r} -> {codes}"


def test_a_clean_examiner_turn_and_the_scripted_frame_are_never_flagged() -> None:
    clean = [
        "Do you live in a house or an apartment?",
        "Why do you think that is?",
        "Some people would say the opposite. What would you say to them?",
        "And what would you like me to call you?",
    ]
    for text in clean:
        assert E.examiner_turn_violations(text) == [], text
    for move in E.SCRIPTED_MOVES.values():
        rendered = move.template.format(**{f: "the topic" for f in move.fields})
        assert E.examiner_turn_violations(rendered) == [], move.id


def test_a_greeting_is_not_mistaken_for_praise() -> None:
    assert E.examiner_turn_violations("Good morning. Can you tell me your full name?") == []


async def test_the_session_records_a_coaching_slip_by_the_model() -> None:
    sm, _rec = await part1_machine()
    await sm.on_assistant_turn("Excellent answer! And where do you live?", 0)
    assert sm.conduct_violations == ["praise"]

    await sm.on_assistant_turn("And what do you do in the evenings?", 0)
    assert sm.conduct_violations == ["praise"]      # a clean turn adds nothing


# ======================================================================================
# 4. Turn discipline and airtime (research 01 §7)
# ======================================================================================


def test_a_normal_examiner_question_fits_the_budget() -> None:
    check = E.examiner_turn_length("How has the way people spend their free time changed?")
    assert check.ok is True
    assert check.scripted is False


def test_a_chatty_examiner_turn_is_flagged() -> None:
    drift = (
        "That's a really interesting point, and it reminds me of something I read about "
        "cities changing in the last twenty years, because a lot of people have moved "
        "away from the centre and the shops have followed them out to the suburbs. "
        "Anyway, what do you think about that?"
    )
    check = E.examiner_turn_length(drift)
    assert check.ok is False
    assert "words" in (check.reason or "")


def test_three_sentences_is_too_many_even_when_short() -> None:
    check = E.examiner_turn_length("I see. That is interesting. Why is that?")
    assert check.ok is False
    assert "sentences" in (check.reason or "")


def test_scripted_frame_moves_are_exempt_from_the_length_budget() -> None:
    """The Part 2 launch is long by design; its length says nothing about drift."""
    launch = E.LINE_P2_INTRO.format(topic_line="describe a place you often go to.")
    check = E.examiner_turn_length(launch)
    assert check.ok is True and check.scripted is True
    assert E.examiner_turn_length(E.LINE_P2_BEGIN).scripted is True


def test_airtime_check_flags_an_examiner_who_talks_too_much() -> None:
    good = E.airtime_check(candidate_s=300.0, examiner_s=60.0)
    assert good.ok is True
    assert 0.82 < good.candidate_share < 0.84

    bad = E.airtime_check(candidate_s=200.0, examiner_s=140.0)
    assert bad.ok is False
    assert bad.sample_ok is True
    assert "talking too much" in bad.detail


def test_airtime_is_not_judged_before_there_is_enough_speech() -> None:
    early = E.airtime_check(candidate_s=4.0, examiner_s=12.0)
    assert early.sample_ok is False
    assert early.ok is True                       # the greeting alone must not fail a session
    assert E.airtime_check(0.0, 0.0).candidate_share == 0.0


def test_airtime_from_a_captured_transcript_uses_vad_time_for_the_candidate() -> None:
    turns = [
        {"role": "assistant", "text": "Do you live in a house or an apartment?"},
        {
            "role": "user",
            "text": "I live in a flat",
            "segments": [{"t_start_ms": 0, "t_end_ms": 200_000}],
        },
    ]
    check = E.airtime_from_turns(turns)
    assert check.candidate_s == 200.0
    assert 0 < check.examiner_s < 10
    assert check.ok is True


async def test_the_session_tracks_airtime_and_flags_long_examiner_turns() -> None:
    sm, _rec = await part1_machine()
    await sm.on_user_turn("I live in a flat with my brother, quite close to the centre.", 0, 30.0)
    await sm.on_assistant_turn("And what do you like about it?", 0)
    await sm.on_user_turn("It is quiet, and the neighbours are friendly.", 0, 30.0)

    airtime = sm.airtime()
    assert airtime.candidate_share > 0.8
    assert sm.long_examiner_turns == 0

    await sm.on_assistant_turn(
        "That is such an interesting thing to say, because where I live the neighbours "
        "hardly speak at all, and honestly I have always wondered whether that is a city "
        "thing or just bad luck, but anyway, tell me more about your street.",
        0,
    )
    assert sm.long_examiner_turns == 1


# ======================================================================================
# 5. Part transitions are scripted moves that bypass the model (research 01 §7)
# ======================================================================================


def test_the_state_machine_speaks_the_registry_wording_and_nothing_else() -> None:
    """One source of truth: a transition whose wording drifts is a different test."""
    assert SM.LINE_GREETING is E.LINE_GREETING
    assert SM.LINE_P1_START is E.LINE_P1_START
    assert SM.LINE_P2_INTRO is E.LINE_P2_INTRO
    assert SM.LINE_P2_BEGIN is E.LINE_P2_BEGIN
    assert SM.LINE_P2_STOP is E.LINE_P2_STOP
    assert SM.LINE_P3_INTRO is E.LINE_P3_INTRO
    assert SM.LINE_WRAP_UP is E.LINE_WRAP_UP
    assert SM.LINE_SILENCE_PROMPT is E.LINE_SILENCE_PROMPT


def test_every_part_boundary_has_a_scripted_move() -> None:
    transitions = {m.id for m in E.SCRIPTED_MOVES.values() if m.is_transition}
    assert transitions == {"p1_launch", "p2_launch", "p3_bridge", "closing"}
    for move_id in transitions:
        move = E.SCRIPTED_MOVES[move_id]
        assert move.function                     # every move records what it is for
        assert move.template.strip()


def test_scripted_lines_are_recognisable_even_with_a_filled_slot() -> None:
    line = E.scripted_line("p3_bridge", topic_short="a place you often go to")
    assert "a place you often go to" in line
    assert E.is_scripted_move_text(line) is True
    assert E.is_scripted_move_text("So, tell me — what did you think of that topic?") is False


def test_a_scripted_move_needs_its_fields() -> None:
    try:
        E.scripted_line("p2_launch")
    except KeyError as exc:
        assert "topic_line" in str(exc)
    else:  # pragma: no cover - the call must raise
        raise AssertionError("a missing field must not silently render")


async def test_the_transitions_of_a_whole_sitting_are_verbatim_registry_lines() -> None:
    bundle = CardBundle(
        set_id="s1",
        part1=[TopicFrame(topic="your home", questions=["Do you live in a house?"])],
        part2=CueCard(
            topic="Describe a place you often go to.",
            bullets=["where it is", "and explain why you go."],
            rounding_off=["Do many people go there?"],
        ),
        part3=[Theme(title="public space", questions=["Should cities build more parks?"])],
    )
    sm, rec = machine(bundle=bundle)
    await sm.start()
    await sm.on_user_turn("Sam.", 0, speech_s=2.0)                    # -> P1_QA
    await sm.on_assistant_turn("Do you live in a house?", 0)
    await sm.on_user_turn("In a flat, actually.", 0, speech_s=12.0)   # -> P2 (chains to prep)
    await sm.transition(P2_LONG_TURN)
    await sm.on_user_turn("a full talk", 0, speech_s=95.0)            # -> P2_ROUNDING
    await sm.on_assistant_turn("Do many people go there?", 0)
    await sm.on_user_turn("Quite a few, yes.", 0, speech_s=8.0)       # -> P3_DISCUSS
    await sm.on_assistant_turn("Should cities build more parks?", 0)
    await sm.on_user_turn("They should, on balance.", 0, speech_s=25.0)

    assert sm.phase == "WRAP_UP"
    for line in rec.lines:
        assert E.is_scripted_move_text(line), line
    assert rec.lines[0] == E.LINE_GREETING
    assert rec.lines[-1] == E.LINE_WRAP_UP


# ======================================================================================
# 6. The conduct block reaches the model on every turn (injector wiring)
# ======================================================================================


def test_the_rules_block_is_pinned_ahead_of_the_conversation() -> None:
    history = [
        {"role": "system", "content": "persona"},
        {"role": "assistant", "content": "Where do you live?"},
        {"role": "user", "content": "In a small city."},
    ]
    out = build_messages(history, "CURRENT TASK: ask question 2", 12, "EXAMINER CONDUCT: …")

    assert [m["role"] for m in out] == ["system", "system", "assistant", "system", "user"]
    assert out[1]["content"].startswith(RULES_MARKER)
    assert out[3]["content"].startswith(MARKER)
    assert len(history) == 3                       # purity


def test_history_trimming_can_never_drop_the_conduct_block() -> None:
    history = [{"role": "system", "content": "persona"}]
    history += [{"role": "user", "content": f"turn {i}"} for i in range(40)]
    out = build_messages(history, None, 4, "EXAMINER CONDUCT: stay silent")

    assert sum(1 for m in out if m["content"].startswith(RULES_MARKER)) == 1
    assert out[1]["content"].startswith(RULES_MARKER)
    assert len(out) == 6                           # persona + rules + 4 trimmed turns


def test_the_conduct_block_never_accumulates() -> None:
    first = build_messages(
        [{"role": "system", "content": "persona"}, {"role": "user", "content": "hi"}],
        None,
        12,
        "rules v1",
    )
    second = build_messages(first, None, 12, "rules v2")
    rules = [m for m in second if m["content"].startswith(RULES_MARKER)]
    assert len(rules) == 1
    assert "rules v2" in rules[0]["content"]


async def test_the_coach_personas_get_no_examiner_conduct_block() -> None:
    sm, _rec = machine("topic_drill")
    await sm.start()
    assert sm.current_rules_block() is None

    examiner_sm, _ = machine("full_mock")
    await examiner_sm.start()
    assert (examiner_sm.current_rules_block() or "").startswith("EXAMINER CONDUCT")
