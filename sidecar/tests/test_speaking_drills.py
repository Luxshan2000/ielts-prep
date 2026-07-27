"""Speaking-drill tests: the grading logic first, the wiring second.

The grading contract is the product here — a learner who is told "correct" for a
sentence in which the error came back has been actively taught the wrong thing — so most
of this file exercises :func:`drills.grade` directly, with real authored content and
synthetic STT output. It is a pure function by design: no DB, no network, no clock.

Three properties get tested from several directions because getting them wrong is
expensive:

1. **The gate.** Shadowing quotes the band-7 model, so it must be absent until the
   learner has attempted the card — and a *drill* attempt must never be what opens it,
   or shadowing would unlock the model answer it was quoting.
2. **Mechanical before judgement.** A verdict the string test settles confidently must
   never reach the model, and a model that returns nothing usable must never overturn
   the mechanical result.
3. **Existing tables only.** Attempts land in ``practice_sessions`` / ``pron_scores`` /
   ``pron_drill_attempts``. If a future change invents a table, these assertions fail.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from bandready.speaking import drills

# ======================================================================================
# Fixture pack
# ======================================================================================

SET_ID = "set_drill_fixture_950"
P1 = "card_p1_your_work_950"
P2 = "card_p2_delivery_950"
P3 = "card_p3_complaints_950"
LEGACY = "card_p2_legacy_950"
LEGACY_SET = "set_drill_legacy_950"

#: Appears only inside the band-7 model. If a locked response ever contains it, the gate
#: leaked through the drill surface.
MODEL_ONLY = "closed the order on their system"

BAND7 = (
    "I ordered a desk back in the spring, for a flat with almost nothing in it. "
    "By the time I rang the shop, they'd already " + MODEL_ONLY + ". "
    "I spent a fortnight getting nowhere with it before I walked in and asked in person. "
    "What it changed was simple: I now give a supplier two days, then I turn up."
)

LANGUAGE_BANK = {
    "warning": "Frames with gaps, not lines to recite.",
    "functions": [
        {
            "function": "narrating",
            "why_here": "The card is a story and the tense has to hold across it.",
            "grammar": "past simple with one past perfect backshift",
            "frames": [
                {"frame": "By the time I ___, they'd already ___",
                 "slot_hint": "two past events; the earlier one goes in past perfect"},
            ],
            "avoid": "First of all I would like to describe a memorable experience.",
        },
        {
            "function": "evaluating",
            "why_here": "The fourth bullet asks what changed, and that carries the band.",
            "grammar": "cleft sentences",
            "frames": [
                {"frame": "What stayed with me wasn't ___, it was ___",
                 "slot_hint": "the obvious thing, then the one that mattered"},
            ],
            "avoid": "It was a very memorable experience I will never forget.",
        },
    ],
}

P2_TEACHING = {
    "schema_version": 1,
    "band_move": "Hold one past tense across the whole two minutes.",
    "prep_plan": {
        "idea_prompt": "Take the first delivery that went wrong. Do not shop for a better one.",
        "note_grid": [{"bullet_index": 0, "cell": "desk, spring, empty flat"}],
        "trap": "Most people never say what they did differently afterwards.",
    },
    "time_plan": [
        {"from_s": 0, "to_s": 10, "segment": "opening", "goal": "Name it and when."},
    ],
    "recovery_moves": [
        {"rung": 2, "prompt": "Say how long it went on for — days, weeks, how often you chased it."},
        {"rung": 3, "prompt": "Bring in the person who finally helped and what they said."},
        {"rung": 6, "prompt": "Say plainly whether you would handle it the same way again."},
    ],
    "target_language": ["narrating", "evaluating"],
    "error_watchlist": [
        {
            "pattern": "duration with for and since",
            "wrong": "I am waiting for that desk since three weeks.",
            "right": "I had been waiting for that desk for three weeks.",
            "why": "'For' takes a length; 'since' takes a start point.",
            "criterion": "GRA",
        },
        {
            "pattern": "flat evaluative adjectives",
            "wrong": "It was very annoying and I feel bad.",
            "right": "It was maddening, and I felt completely stuck.",
            "why": "One precise word beats an adverb plus a flat one.",
            "criterion": "LR",
        },
    ],
    "pronunciation_focus": {
        "priority": "final_consonants",
        "tier": 1,
        "why_here": "Every verb in the answer is past tense, so every verb ends in a cluster.",
        "target_words": [
            {"word": "closed", "stress": "KLOHZD", "note": "ends voiced, not 'close'"},
            {"word": "rang", "stress": "RANG", "note": "one syllable, final -ng"},
        ],
        "chunking_drill": {
            "sentence": "By the time I rang the shop they had already closed the order",
            "chunks": ["By the time I rang the shop", "they had already closed", "the order"],
        },
        "minimal_pairs": [
            {"a": "close", "b": "closed", "contrast": "final voiced cluster"},
            {"a": "PRE-sent (noun)", "b": "pre-SENT (verb)", "contrast": "stress changes word class"},
        ],
    },
    "examiner_note": "The examiner will let the two minutes run.",
    "swap_slots": [{"span": "back in the spring", "prompt": "Your own time reference."}],
    "transfer_drill": "Retell the same story in 45 seconds with two past perfects.",
    "model_answers": [
        {"band_target": 7, "label": "One clear step up", "approx_seconds": 115,
         "transcript": BAND7, "what_caps_it": [], "what_lifts_it": [], "annotations": []},
    ],
}

P1_TEACHING = {
    "schema_version": 1,
    "tense_focus": "present simple for the state, present perfect for the change",
    "band_move": "Add one reason to every answer before you stop.",
    "questions": [
        {
            "q_index": 0,
            "angle": "A1",
            "answer_shape": "Say which one, name the field, then say where.",
            "extend_move": "I'm working — I've been at a small design studio since March.",
            "common_error": {
                "wrong": "I am work in a studio.",
                "right": "I work at a studio.",
                "why": "Present simple takes one verb, not 'am' plus another.",
            },
            "probe": "And how long has that been?",
        },
        {
            "q_index": 1,
            "angle": "A3",
            "answer_shape": "Give the hours, then one thing that varies.",
            "extend_move": "Four full days, normally, though it creeps into Fridays.",
            "common_error": {
                "wrong": "I work usually forty hours.",
                "right": "I usually work about forty hours.",
                "why": "Frequency adverbs go before the main verb.",
            },
            "probe": "Is that more than you'd like?",
        },
    ],
}

P3_THEMES = [
    {
        "title": "how people complain now",
        "questions": [
            "Why do you think people complain publicly rather than privately these days?",
            "Does that change how companies behave?",
            "Is anything lost when a complaint becomes public?",
        ],
        "counterpoint": "Public complaints are mostly performance, not redress.",
        "counter_probe": "But isn't that just shouting into a void?",
        "concession_frame": "There's something in that, although ___",
        "target_functions": ["evaluating", "narrating"],
        "abstraction_ladder": {
            "concrete": "How would you complain about a late delivery?",
            "local_general": "How do people you know complain?",
            "societal_abstract": "How has complaining changed as a social act?",
        },
        "question_notes": [
            {"q_index": 0, "move": "M2", "archetype": "cause",
             "answer_shape": "Name the mechanism, then the incentive it creates.",
             "probe": "And who benefits?", "watch_out": "Do not answer about yourself."},
        ],
    }
]

P3_TEACHING = {
    "schema_version": 1,
    "band_move": "Concede one clause, then hold your position.",
    "bridge": "We've been talking about one delivery; I'd like to widen that out.",
    "error_watchlist": [
        {
            "pattern": "agreement across a long subject",
            "wrong": "The number of people who complain online are rising.",
            "right": "The number of people who complain online is rising.",
            "why": "The verb agrees with 'number', not with 'people'.",
            "criterion": "GRA",
        },
    ],
}

SET_PAYLOAD = {
    "schema_version": 2,
    "difficulty": "core",
    "tags": ["services"],
    "part1_card_ids": [P1],
    "part2_card_id": P2,
    "part3_card_id": P3,
    "cluster": "test-fixture",
    "family": "F5",
    "language_bank": LANGUAGE_BANK,
    "vocabulary": [{"item": "getting nowhere with it", "type": "chunk", "cefr": "B2"}],
}


def _card(card_id: str, part: int, title: str, payload: dict[str, Any], set_id: str = SET_ID) -> dict:
    return {
        "id": card_id,
        "part": part,
        "card_set_id": set_id,
        "topic_id": "topic_communication",
        "title": title,
        "difficulty": "core",
        "tags_json": json.dumps(["services"]),
        "payload_json": json.dumps(
            {"schema_version": 2, "id": card_id, "part": part, "topic": title, **payload}
        ),
    }


CARDS = [
    _card(P1, 1, "your work or studies", {
        "frame_tier": 1, "frame_kind": "personal",
        "questions": [
            "Are you working at the moment, or are you still studying?",
            "How much of your week does that take up?",
        ],
        "teaching": P1_TEACHING,
    }),
    _card(P2, 2, "a delivery that went wrong", {
        "family": "F5",
        "cue_card": {
            "topic": "Describe a time when something you ordered did not arrive.",
            "bullets": ["what you had ordered", "when it was due", "what you did about it",
                        "and explain what it changed about how you handle this now."],
            "rounding_off": ["Would you order from them again?"],
        },
        "teaching": P2_TEACHING,
    }),
    _card(P3, 3, "getting things put right", {"part3_themes": P3_THEMES, "teaching": P3_TEACHING}),
    # schema_version 1, no teaching at all — the twelve legacy sets in miniature.
    _card(LEGACY, 2, "a legacy card", {"cue_card": {"topic": "Describe something.", "bullets": []}},
          set_id=LEGACY_SET),
]


# ======================================================================================
# Card stand-ins for the pure tests (no DB needed to build an item)
# ======================================================================================


class _Row:
    def __init__(self, data: dict[str, Any]) -> None:
        self.__dict__.update(data)


class _Sets:
    """The two lookups :func:`drills.build_items` makes on a session, and nothing else."""

    def __init__(self) -> None:
        self._sets = {
            SET_ID: {"id": SET_ID, "payload_json": json.dumps(SET_PAYLOAD), "retired": False},
            LEGACY_SET: {"id": LEGACY_SET, "payload_json": json.dumps({"schema_version": 1}),
                         "retired": False},
        }

    def get(self, _model: Any, key: str) -> Any:
        row = self._sets.get(key)
        return _Row(row) if row else None


def card_row(card_id: str) -> Any:
    for card in CARDS:
        if card["id"] == card_id:
            return _Row(card)
    raise AssertionError(f"no fixture card {card_id}")


def items_for(card_id: str, *, unlocked: bool = True) -> list[dict[str, Any]]:
    return drills.build_items(_Sets(), card_row(card_id), unlocked=unlocked)


def one(card_id: str, kind: str, index: int = 0, *, unlocked: bool = True) -> dict[str, Any]:
    found = [i for i in items_for(card_id, unlocked=unlocked) if i["kind"] == kind]
    assert found, f"no {kind} item on {card_id}"
    return found[index]


def fake_words(text: str, *, start_ms: int = 0, gap_ms: int = 60, dur_ms: int = 240,
               confidence: float = 0.92, gaps: dict[int, int] | None = None) -> list[dict[str, Any]]:
    """STT output for ``text``, with per-index gap overrides for the rhythm tests."""
    out: list[dict[str, Any]] = []
    clock = start_ms
    for index, word in enumerate(text.split()):
        if index:
            clock += (gaps or {}).get(index, gap_ms)
        out.append({"word": word, "t_start_ms": clock, "t_end_ms": clock + dur_ms,
                    "confidence": confidence})
        clock += dur_ms
    return out


# ======================================================================================
# Text handling
# ======================================================================================


def test_tokens_normalise_the_things_two_transcribers_disagree_about() -> None:
    assert drills.tokens("By the time I'd left, they’d already gone!") == [
        "by", "the", "time", "i'd", "left", "they'd", "already", "gone",
    ]
    # A digit and its spelling are the same word to a listener.
    assert drills.tokens("I waited 3 weeks") == drills.tokens("I waited three weeks")
    assert drills.tokens("It's OK") == drills.tokens("It's okay")
    assert drills.tokens("") == []


def test_content_tokens_drop_the_words_that_prove_nothing() -> None:
    assert drills.content_tokens("it was in the studio") == ["studio"]


# ======================================================================================
# Alignment
# ======================================================================================


def test_align_names_every_kind_of_divergence() -> None:
    alignment = drills.align(["the", "cat", "sat", "down"], ["the", "hat", "sat", "quietly", "down"])
    by_status = {row["status"] for row in alignment}
    assert by_status == {"hit", "substituted", "added"}
    substituted = next(r for r in alignment if r["status"] == "substituted")
    assert (substituted["expected"], substituted["heard"]) == ("cat", "hat")
    assert drills.agreement(alignment) == round(3 / 4, 3)


def test_agreement_ignores_words_the_learner_added() -> None:
    """Extra words are not errors in a shadowing repeat; missing words are."""
    padded = drills.align(["one", "two"], ["um", "one", "er", "two"])
    assert drills.agreement(padded) == 1.0
    dropped = drills.align(["one", "two"], ["one"])
    assert drills.agreement(dropped) == 0.5


def test_agreement_of_nothing_is_zero_not_a_crash() -> None:
    assert drills.agreement([]) == 0.0


def test_nearest_token_finds_what_the_learner_probably_meant() -> None:
    assert drills.nearest_token("closed", ["i", "close", "it"]) == "close"
    assert drills.nearest_token("closed", ["completely", "different"]) is None


# ======================================================================================
# Item construction — everything traces back to the card
# ======================================================================================


def test_shadowing_is_absent_until_the_model_answer_is_unlocked() -> None:
    locked = items_for(P2, unlocked=False)
    assert [i for i in locked if i["kind"] == "shadowing"] == []
    assert MODEL_ONLY not in json.dumps(locked), "the band-7 model leaked through a locked drill"

    unlocked = [i for i in items_for(P2) if i["kind"] == "shadowing"]
    assert unlocked, "shadowing should appear once the gate is open"
    assert unlocked[0]["prompt"]["source"] == "chunking_drill"


def test_the_other_three_kinds_never_need_the_gate() -> None:
    kinds = {i["kind"] for i in items_for(P2, unlocked=False)}
    assert kinds == {"minimal_pair", "error_repair", "extend"}


def test_shadowing_prefers_a_sentence_carrying_the_cards_own_target_words() -> None:
    item = one(P2, "shadowing")
    assert "closed" in item["expected"]["target_words"]
    assert item["expected"]["chunk_groups"], "authored chunks should tile the sentence"
    assert [" ".join(g) for g in item["expected"]["chunk_groups"]] == [
        "by the time i rang the shop", "they had already closed", "the order",
    ]


def test_chunks_that_no_longer_tile_their_sentence_are_dropped_not_trusted() -> None:
    assert drills._chunks_for("one two three", ["one two", "three"]) == [["one", "two"], ["three"]]
    assert drills._chunks_for("one two three", ["one two", "four"]) == []


def test_minimal_pairs_come_from_this_card_not_the_generic_bank() -> None:
    pairs = [i for i in items_for(P2) if i["kind"] == "minimal_pair"]
    said = {i["expected"].get("say") for i in pairs}
    assert "closed" in said, "the card's own authored pair must be offered"
    # ``final_consonants`` may pull in pack pairs tagged 'final', but never more than the cap.
    assert len(pairs) <= 4


def test_a_pair_that_differs_only_by_stress_becomes_a_perception_item() -> None:
    """An ASR word hypothesis cannot separate PRE-sent from pre-SENT; pretending it can
    would fail a learner who did it right."""
    pairs = [i for i in items_for(P2) if i["kind"] == "minimal_pair"]
    stress = [i for i in pairs if "PRE-sent" in json.dumps(i["prompt"])]
    assert stress and stress[0]["grading"]["mode"] == "choice"


def test_error_repair_items_keep_the_authored_ranking() -> None:
    items = [i for i in items_for(P2) if i["kind"] == "error_repair"]
    assert items[0]["prompt"]["pattern"] == "duration with for and since"
    assert items[0]["expected"]["required"] and items[0]["expected"]["banned"]


def test_repair_targets_are_derived_from_the_authored_pair() -> None:
    required, banned = drills.repair_targets(
        "My aunt has that stall since ten years.",
        "My aunt has had that stall for about ten years.",
    )
    assert required == ["had", "for", "about"]
    assert banned == ["since"]


def test_repair_targets_never_ban_a_word_the_fix_still_uses() -> None:
    required, banned = drills.repair_targets("I go there yesterday.", "I went there yesterday.")
    assert required == ["went"] and banned == ["go"]
    assert "yesterday" not in banned


def test_part1_extend_takes_its_too_short_answer_from_the_authored_extend_move() -> None:
    item = one(P1, "extend")
    assert item["prompt"]["too_short"] == "I'm working"
    assert item["prompt"]["question"].startswith("Are you working")


def test_part2_extend_instantiates_the_recovery_ladder_rung_by_rung() -> None:
    items = [i for i in items_for(P2) if i["kind"] == "extend"]
    assert [i["prompt"]["rung"] for i in items] == [2, 3, 6]
    assert items[0]["prompt"]["too_short"] is None
    functions = {f["function"] for f in items[0]["expected"]["frames"]}
    assert functions == {"narrating", "evaluating"}


def test_part3_extend_targets_the_themes_own_functions() -> None:
    item = one(P3, "extend")
    assert item["prompt"]["question"].startswith("Why do you think people complain")
    assert item["prompt"]["probe"] == "But isn't that just shouting into a void?"


def test_a_legacy_card_produces_no_drills_and_an_honest_reason() -> None:
    assert items_for(LEGACY) == []
    reason = drills.unavailable_reason(card_row(LEGACY), "shadowing", unlocked=True)
    assert reason == drills.EMPTY_MESSAGE


def test_the_reason_for_an_empty_kind_is_specific_to_why_it_is_empty() -> None:
    locked = drills.unavailable_reason(card_row(P2), "shadowing", unlocked=False)
    assert locked == drills.LOCKED_MESSAGE
    prosodic = drills.unavailable_reason(card_row(P1), "minimal_pair", unlocked=True)
    assert "listen for" in prosodic or "rhythm" in prosodic


def test_item_ids_are_stable_across_calls_so_a_post_can_name_one() -> None:
    first = [i["item_id"] for i in items_for(P2)]
    second = [i["item_id"] for i in items_for(P2)]
    assert first == second and len(set(first)) == len(first)


def test_the_two_minute_set_takes_one_of_each_kind_inside_the_budget() -> None:
    items = items_for(P2)
    plan = drills.two_minute_set(items)
    chosen = [drills.find_item(items, item_id) for item_id in plan]
    assert [c["kind"] for c in chosen] == list(drills.DRILL_KINDS)
    assert sum(c["seconds"] for c in chosen) <= drills.SET_BUDGET_S


# ======================================================================================
# Grading — shadowing
# ======================================================================================


def test_a_clean_repeat_passes_at_full_marks() -> None:
    item = one(P2, "shadowing")
    said = item["expected"]["text"]
    result = drills.grade(item, transcript=said, words=fake_words(said), duration_ms=5000)
    assert result["passed"] is True
    assert result["score"] == 100
    assert result["needs_judgement"] is False


def test_dropping_a_target_word_fails_even_when_the_sentence_survives() -> None:
    """The target words *are* the drill. A 90% repeat that lost them taught nothing."""
    item = one(P2, "shadowing")
    said = item["expected"]["text"].replace("closed", "close")
    result = drills.grade(item, transcript=said, words=fake_words(said), duration_ms=5000)
    assert result["detail"]["agreement"] >= drills.SHADOW_PASS
    assert result["passed"] is False
    dropped = [t for t in result["detail"]["target_words"] if not t["hit"]]
    assert [t["word"] for t in dropped] == ["closed"]
    assert dropped[0]["heard_as"] == "close"


def test_a_pause_inside_a_thought_group_is_named_and_located() -> None:
    item = one(P2, "shadowing")
    said = item["expected"]["text"]
    # A 900 ms break before "shop" (token 6), which sits inside the first authored chunk.
    words = fake_words(said, gaps={6: 900})
    result = drills.grade(item, transcript=said, words=words, duration_ms=6000)
    inside = result["detail"]["chunking"]["breaks_inside_chunks"]
    assert inside and inside[0]["before_word"] == "shop"
    assert any("inside" in line for line in result["feedback"])


def test_pauses_at_the_authored_joins_are_credited_not_penalised() -> None:
    item = one(P2, "shadowing")
    said = item["expected"]["text"]
    groups = item["expected"]["chunk_groups"]
    boundaries = {len(groups[0]): 400, len(groups[0]) + len(groups[1]): 400}
    result = drills.grade(item, transcript=said, words=fake_words(said, gaps=boundaries),
                          duration_ms=6000)
    chunking = result["detail"]["chunking"]
    assert chunking["boundaries_kept"] == chunking["boundaries_total"] == 2
    assert not chunking["breaks_inside_chunks"]
    assert result["passed"] is True


def test_rhythm_reporting_degrades_rather_than_guesses_without_timings() -> None:
    item = one(P2, "shadowing")
    said = item["expected"]["text"]
    result = drills.grade(item, transcript=said)
    assert result["passed"] is True
    assert result["detail"]["chunking"]["available"] is False


# ======================================================================================
# Grading — minimal pairs
# ======================================================================================


def production_pair() -> dict[str, Any]:
    for item in items_for(P2):
        if item["kind"] == "minimal_pair" and item["grading"]["mode"] == "stt_contains":
            return item
    raise AssertionError("no production minimal-pair item on the fixture card")


def test_the_target_word_heard_is_the_whole_pass_condition() -> None:
    item = production_pair()
    result = drills.grade(item, transcript=f"I {item['expected']['say']} the order.")
    assert result["passed"] is True and result["score"] == 100


def test_hearing_the_neighbour_fails_and_says_which_one_we_heard() -> None:
    item = production_pair()
    result = drills.grade(item, transcript=f"I {item['expected']['avoid']} the order.")
    assert result["passed"] is False
    assert result["detail"]["heard_as"] == item["expected"]["avoid"]
    assert item["expected"]["avoid"] in result["feedback"][0]


def test_a_perception_pair_is_graded_from_the_choice_and_refuses_a_missing_one() -> None:
    stress = next(i for i in items_for(P2)
                  if i["kind"] == "minimal_pair" and i["grading"]["mode"] == "choice")
    assert drills.grade(stress, choice="b")["passed"] is True
    assert drills.grade(stress, choice="a")["passed"] is False
    with pytest.raises(Exception) as excinfo:
        drills.grade(stress, choice=None)
    assert "'a' or 'b'" in str(excinfo.value)


# ======================================================================================
# Grading — error repair
# ======================================================================================


def repair_item() -> dict[str, Any]:
    return one(P2, "error_repair")


def test_the_exact_fix_passes_without_troubling_the_model() -> None:
    item = repair_item()
    result = drills.grade(item, transcript=item["expected"]["text"])
    assert result["passed"] is True
    assert result["needs_judgement"] is False


def test_the_error_coming_back_is_a_confident_fail_not_a_question_for_the_model() -> None:
    item = repair_item()
    result = drills.grade(item, transcript="I am waiting for that desk since three weeks.")
    assert result["passed"] is False
    assert result["needs_judgement"] is False, "a returned error needs no adjudication"
    assert result["detail"]["returned"] == ["am", "since"]
    # Read back verbatim, so say that rather than listing tokens at them.
    assert result["detail"]["echoed_wrong"] == 1.0
    assert result["feedback"][0].startswith("That was the wrong sentence read back")


def test_a_partial_slip_names_the_form_rather_than_the_whole_sentence() -> None:
    item = repair_item()
    result = drills.grade(item, transcript="I had been waiting for that desk since three weeks.")
    assert result["passed"] is False
    assert result["detail"]["returned"] == ["since"]
    # It looks like the wrong sentence, but it looks more like the right one: the learner
    # changed the tense and slipped on one word, and that is what they should be told.
    assert result["detail"]["echoed_wrong"] < result["detail"]["similarity"]
    assert "since" in result["feedback"][0]


def test_distinctive_drops_the_function_words_unless_they_are_the_whole_point() -> None:
    assert drills.distinctive(["the", "story", "was"]) == ["story"]
    # for/since is a real watchlist pattern and both members are function words.
    assert drills.distinctive(["for", "the"]) == ["for", "the"]


def test_the_fix_said_in_a_different_word_order_still_passes_mechanically() -> None:
    """Word order is not the target; ``had been`` and the absence of ``since`` are."""
    item = repair_item()
    result = drills.grade(item, transcript="I had been waiting three weeks for that desk.")
    assert result["passed"] is True and result["needs_judgement"] is False


#: Correct English, correct tense, but not the exact form the card is drilling — the one
#: shape where the string test genuinely cannot decide.
PLAUSIBLE_REPAIR = "I had waited for that desk for three whole weeks."


def test_a_different_but_plausible_repair_is_the_one_case_worth_a_model_call() -> None:
    item = repair_item()
    result = drills.grade(item, transcript=PLAUSIBLE_REPAIR)
    assert result["passed"] is False
    assert result["needs_judgement"] is True
    assert result["detail"]["missing"] == ["been"]


def test_saying_something_unrelated_is_not_sent_to_the_model_either() -> None:
    item = repair_item()
    result = drills.grade(item, transcript="I really do not know what to say here at all.")
    assert result["passed"] is False and result["needs_judgement"] is False


def test_silence_is_reported_as_silence_rather_than_scored() -> None:
    item = repair_item()
    result = drills.grade(item, transcript="   ")
    assert result["passed"] is False and result["score"] == 0
    assert "microphone" in result["feedback"][0]


# ======================================================================================
# Grading — extend
# ======================================================================================


def extend_item() -> dict[str, Any]:
    return one(P1, "extend")


LONG_ANSWER = (
    "I'm working at the moment at a small design studio in the city centre, and I've been "
    "there since March, which is longer than I expected when I started. It suits me "
    "because the team is tiny, so I end up doing a bit of everything rather than one "
    "narrow thing, and that variety is really the part I would not want to give up now."
)


def test_a_short_answer_fails_on_length_and_is_told_what_to_aim_for() -> None:
    item = extend_item()
    result = drills.grade(item, transcript="I'm working. Yes.", duration_ms=30000)
    length = next(c for c in result["checks"] if c["check"] == "length")
    assert length["ok"] is False
    assert result["passed"] is False
    assert str(drills.EXTEND_TARGET_WORDS) in result["feedback"][0]


def test_reading_the_stub_back_does_not_count_as_extending_it() -> None:
    item = extend_item()
    said = " ".join([item["prompt"]["too_short"]] * 30)
    result = drills.grade(item, transcript=said, duration_ms=30000)
    fresh = next(c for c in result["checks"] if c["check"] == "new_content")
    assert fresh["ok"] is False
    assert any("Add, don't repeat" in line for line in result["feedback"])


def test_reaching_for_an_authored_frame_is_what_passes_the_language_check() -> None:
    item = one(P2, "extend")
    said = (
        "By the time I rang them they'd already marked it as delivered, which was the "
        "part that annoyed me, and I spent the following fortnight chasing an answer from "
        "three different people before anyone would admit the order had gone missing at "
        "the depot rather than in transit."
    )
    result = drills.grade(item, transcript=said, words=fake_words(said), duration_ms=30000)
    assert result["detail"]["frames_used"], "the narrating frame was used verbatim"
    assert result["passed"] is True
    assert result["needs_judgement"] is False


def test_speaking_at_length_without_a_frame_is_the_extend_case_worth_judging() -> None:
    item = extend_item()
    result = drills.grade(item, transcript=LONG_ANSWER, words=fake_words(LONG_ANSWER),
                          duration_ms=30000)
    assert result["detail"]["words"] >= drills.EXTEND_MIN_WORDS
    assert result["detail"]["frames_used"] == []
    assert result["needs_judgement"] is True


def test_a_nervous_speed_up_is_an_observation_not_a_failure() -> None:
    item = one(P2, "extend")
    said = (
        "By the time I rang them they'd already closed it and I kept going and going "
        "without stopping to breathe at any point in the whole thirty seconds of this."
    )
    # Same words, packed into eight seconds: about 200 wpm.
    words = fake_words(said, gap_ms=10, dur_ms=150)
    result = drills.grade(item, transcript=said, words=words, duration_ms=8000)
    assert result["detail"]["wpm"] > drills.COMFORTABLE_WPM[1]
    assert any("nervous speed-up" in line for line in result["feedback"])
    assert all(c["check"] != "rate" for c in result["checks"]), "rate is reported, never graded"


def test_frames_used_is_a_string_test_and_says_so_by_under_counting() -> None:
    frames = [{"function": "narrating", "frame": "By the time I ___, they'd already ___"}]
    assert drills.frames_used("By the time I rang, they'd already closed it", frames)
    # A paraphrase is not evidence the frame was used, and is not claimed as one.
    assert drills.frames_used("When I called they had shut it already", frames) == []


# ======================================================================================
# Judgement
# ======================================================================================


async def test_a_pass_verdict_overturns_an_inconclusive_mechanical_fail() -> None:
    item = repair_item()
    mechanical = drills.grade(item, transcript=PLAUSIBLE_REPAIR)
    assert mechanical["needs_judgement"] is True

    async def fake_chat_json(messages, mock_kind=None, **kw):
        assert mock_kind == "drill_judge"
        sent = json.dumps(messages)
        assert "duration with for and since" in sent, "the prompt must carry the card's pattern"
        assert PLAUSIBLE_REPAIR in sent, "the model must see exactly what was said"
        return {"verdict": "pass", "note": "You fixed the duration correctly a different way.",
                "target_seen": "three whole weeks", "_meta": {"model_id": "fake-1"}}

    from bandready.providers import llm

    original = llm.chat_json
    llm.chat_json = fake_chat_json
    try:
        judged = await drills.judge(item, PLAUSIBLE_REPAIR, mechanical)
    finally:
        llm.chat_json = original

    assert judged["passed"] is True
    assert judged["judgement"]["verdict"] == "pass"
    assert judged["feedback"][0].startswith("You fixed the duration")


async def test_a_model_that_says_nothing_usable_leaves_the_mechanical_verdict_standing() -> None:
    item = repair_item()
    mechanical = drills.grade(item, transcript=PLAUSIBLE_REPAIR)

    async def useless(messages, mock_kind=None, **kw):
        return {"text": "mock response", "items": []}

    from bandready.providers import llm

    original = llm.chat_json
    llm.chat_json = useless
    try:
        judged = await drills.judge(item, "whatever", mechanical)
    finally:
        llm.chat_json = original

    assert judged["passed"] is False
    assert judged["judgement"] == {"available": False, "reason": "no_usable_verdict"}


async def test_a_confident_verdict_is_never_sent_to_the_model_at_all() -> None:
    item = repair_item()
    confident = drills.grade(item, transcript=item["expected"]["text"])

    async def explode(*_a, **_kw):
        raise AssertionError("a settled verdict must not reach the model")

    from bandready.providers import llm

    original = llm.chat_json
    llm.chat_json = explode
    try:
        assert await drills.judge(item, "anything", confident) is confident
    finally:
        llm.chat_json = original


# ======================================================================================
# HTTP surface
# ======================================================================================


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

    from bandready.server.app import create_app

    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        test_client.headers.update({"Authorization": "Bearer test-token"})
        settings_store.patch_settings({"llm": {"preset": "mock_llm", "model": "mock-1"}})
        _seed()
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def _seed() -> None:
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.merge(m.Topic(id="topic_communication", label="Communication", category="general"))
        s.flush()
        s.add(m.CardSet(id=SET_ID, title="Services that let you down",
                        topic_id="topic_communication", parts_json=json.dumps([1, 2, 3]),
                        payload_json=json.dumps(SET_PAYLOAD), source="pack"))
        s.add(m.CardSet(id=LEGACY_SET, title="A legacy set", topic_id="topic_communication",
                        parts_json=json.dumps([2]), payload_json=json.dumps({"schema_version": 1}),
                        source="pack"))
        for row in CARDS:
            s.add(m.SpeakingCard(**row, source="pack"))


def _item_id(client: Any, card_id: str, kind: str, *, attempted: bool = True) -> str:
    response = client.get(f"/api/v1/speaking/drills/cards/{card_id}",
                          params={"attempted": str(attempted).lower()})
    assert response.status_code == 200, response.text
    found = [i for i in response.json()["items"] if i["kind"] == kind]
    assert found, f"no {kind} item served for {card_id}"
    return str(found[0]["item_id"])


def test_the_kinds_contract_is_servable_without_a_card(client: Any) -> None:
    doc = client.get("/api/v1/speaking/drills/kinds").json()
    assert [k["kind"] for k in doc["kinds"]] == list(drills.DRILL_KINDS)
    assert [k for k in doc["kinds"] if k["gated"]] == [doc["kinds"][0]]
    assert doc["set_budget_s"] == drills.SET_BUDGET_S


def test_the_card_route_withholds_shadowing_until_the_learner_has_spoken(client: Any) -> None:
    locked = client.get(f"/api/v1/speaking/drills/cards/{P2}").json()
    assert locked["gate"]["unlocked"] is False
    assert "shadowing" not in locked["available_kinds"]
    assert locked["unavailable_kinds"]["shadowing"] == drills.LOCKED_MESSAGE
    assert MODEL_ONLY not in json.dumps(locked)

    opened = client.get(f"/api/v1/speaking/drills/cards/{P2}", params={"attempted": "true"}).json()
    assert "shadowing" in opened["available_kinds"]
    assert len(opened["plan"]) == 4


def test_an_unknown_kind_filter_is_refused_rather_than_ignored(client: Any) -> None:
    response = client.get(f"/api/v1/speaking/drills/cards/{P2}", params={"kinds": "shadowing,tango"})
    assert response.status_code == 422
    assert "tango" in response.json()["detail"]


def test_an_unknown_card_is_a_404(client: Any) -> None:
    assert client.get("/api/v1/speaking/drills/cards/card_nope").status_code == 404


def test_an_attempt_grades_and_lands_in_practice_sessions(client: Any) -> None:
    from sqlalchemy import text as sql

    from bandready.db.engine import session_scope

    item_id = _item_id(client, P2, "error_repair")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": item_id, "attempted": "true",
              "transcript": "I had been waiting for that desk for three weeks."},
    )
    assert response.status_code == 201, response.text
    doc = response.json()
    assert doc["passed"] is True and doc["kind"] == "error_repair"
    assert doc["stored"]["practice_session_id"]

    with session_scope() as s:
        row = s.execute(
            sql("SELECT module, activity, summary_json FROM practice_sessions WHERE id = :id"),
            {"id": doc["stored"]["practice_session_id"]},
        ).mappings().one()
    assert row["module"] == "drill"
    assert row["activity"] == "speaking_drill:error_repair"
    assert json.loads(row["summary_json"])["passed"] is True


def test_a_drill_attempt_never_opens_the_coach_gate(client: Any) -> None:
    """Otherwise shadowing a sentence of the band-7 model would unlock the band-7 model."""
    item_id = _item_id(client, P2, "extend")
    said = (
        "By the time I rang them they'd already closed it, and I spent the next fortnight "
        "getting nowhere at all with three different people who each told me something new."
    )
    posted = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": item_id, "attempted": "true", "transcript": said},
    )
    assert posted.status_code == 201, posted.text

    teaching = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert teaching["gate"]["unlocked"] is False
    assert teaching["model_answers"] == []


def test_a_minimal_pair_verdict_feeds_the_existing_contrast_chart(client: Any) -> None:
    from sqlalchemy import text as sql

    from bandready.db.engine import session_scope

    doc = client.get(f"/api/v1/speaking/drills/cards/{P2}", params={"attempted": "true"}).json()
    pair = next(i for i in doc["items"]
                if i["kind"] == "minimal_pair" and i["grading"]["mode"] == "stt_contains")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": pair["item_id"], "attempted": "true",
              "transcript": f"They {pair['expected']['say']} the order."},
    )
    assert response.status_code == 201, response.text
    assert response.json()["stored"]["pron_drill_attempt"]

    with session_scope() as s:
        rows = s.execute(
            sql("SELECT drill_type, contrast, correct FROM pron_drill_attempts")
        ).mappings().all()
    assert len(rows) == 1
    assert rows[0]["drill_type"] == "minimal_pair_ab" and rows[0]["correct"] == 1

    history = client.get("/api/v1/speaking/drills/history").json()
    assert any(c["contrast"] == pair["expected"]["contrast"] for c in history["contrasts"])
    minimal = next(k for k in history["by_kind"] if k["kind"] == "minimal_pair")
    assert minimal["accuracy"] == 1.0


def test_a_perception_item_is_graded_from_a_choice_with_no_recording(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/drills/cards/{P2}", params={"attempted": "true"}).json()
    perception = next(i for i in doc["items"] if i["grading"]["mode"] == "choice")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": perception["item_id"], "attempted": "true", "choice": "b"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["passed"] is True


def test_an_attempt_with_neither_audio_nor_words_is_refused(client: Any) -> None:
    item_id = _item_id(client, P2, "error_repair")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": item_id, "attempted": "true"},
    )
    assert response.status_code == 422
    assert "transcript" in response.json()["detail"]


def test_an_item_id_from_another_card_is_a_404(client: Any) -> None:
    item_id = _item_id(client, P1, "extend")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": item_id, "attempted": "true", "transcript": "hello there"},
    )
    assert response.status_code == 404


def test_a_shadowing_attempt_stores_word_scores_under_the_right_source(client: Any) -> None:
    from sqlalchemy import text as sql

    from bandready.db.engine import session_scope

    doc = client.get(f"/api/v1/speaking/drills/cards/{P2}", params={"attempted": "true"}).json()
    item = next(i for i in doc["items"] if i["kind"] == "shadowing")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": item["item_id"], "attempted": "true",
              "transcript": item["expected"]["text"]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["stored"]["pron_scores"] > 0

    with session_scope() as s:
        sources = s.execute(
            sql("SELECT DISTINCT source, passage_id FROM pron_scores")
        ).mappings().all()
    assert [r["source"] for r in sources] == ["shadowing"]
    assert sources[0]["passage_id"] == item["item_id"]


def test_an_extend_attempt_stores_no_word_scores_because_it_has_no_reference(client: Any) -> None:
    from sqlalchemy import text as sql

    from bandready.db.engine import session_scope

    item_id = _item_id(client, P1, "extend")
    response = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P1, "item_id": item_id, "attempted": "true", "transcript": LONG_ANSWER},
    )
    assert response.status_code == 201, response.text
    assert response.json()["stored"]["pron_scores"] == 0

    with session_scope() as s:
        count = s.execute(sql("SELECT COUNT(*) FROM pron_scores")).scalar_one()
    assert count == 0


def test_history_reports_per_kind_accuracy(client: Any) -> None:
    item_id = _item_id(client, P2, "error_repair")
    for transcript, _expected in (
        ("I had been waiting for that desk for three weeks.", True),
        ("I am waiting for that desk since three weeks.", False),
    ):
        client.post(
            "/api/v1/speaking/drills/attempts",
            data={"card_id": P2, "item_id": item_id, "attempted": "true", "transcript": transcript},
        )
    doc = client.get("/api/v1/speaking/drills/history", params={"kind": "error_repair"}).json()
    assert len(doc["items"]) == 2
    repair = next(k for k in doc["by_kind"] if k["kind"] == "error_repair")
    assert repair["attempts"] == 2 and repair["passed"] == 1 and repair["accuracy"] == 0.5


def test_history_refuses_a_kind_that_does_not_exist(client: Any) -> None:
    assert client.get("/api/v1/speaking/drills/history", params={"kind": "tango"}).status_code == 422


def test_a_legacy_card_serves_an_empty_set_with_reasons_not_a_500(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/drills/cards/{LEGACY}").json()
    assert doc["items"] == [] and doc["plan"] == []
    assert set(doc["unavailable_kinds"]) == set(drills.DRILL_KINDS)


# ======================================================================================
# Exam conditions
# ======================================================================================


def _open_a_mock(session_id: str = "ss_drill_mock_1") -> None:
    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id
    from bandready.speaking import mock

    with session_scope() as s:
        profile_id = current_profile_id(s)
        mock.ensure_schema(s)
        doc = {"session_id": session_id, "profile_id": profile_id, "status": "in_progress",
               "card_set_id": SET_ID, "started_at": mock._iso(), "stages": [], "cursor": 0}
        s.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO speaking_mocks (session_id, profile_id, status, seed, card_set_id, "
                "created_at, updated_at, doc_json) VALUES (:sid, :pid, 'in_progress', 1, :cs, "
                ":now, :now, :doc)"
            ),
            {"sid": session_id, "pid": profile_id, "cs": SET_ID, "now": mock._iso(),
             "doc": json.dumps(doc)},
        )


def test_every_drill_entry_point_is_shut_during_a_mock(client: Any) -> None:
    """Drills are coaching. A mock you can drill inside is not a mock."""
    _open_a_mock()

    listing = client.get(f"/api/v1/speaking/drills/cards/{P2}")
    assert listing.status_code == 409
    assert listing.json()["code"] == "conflict"

    attempt = client.post(
        "/api/v1/speaking/drills/attempts",
        data={"card_id": P2, "item_id": "dr_extend_0_deadbeef", "transcript": "hello there"},
    )
    assert attempt.status_code == 409
    assert client.get("/api/v1/speaking/drills/history").status_code == 409
    assert client.post(
        "/api/v1/speaking/drills/audio", json={"card_id": P2, "item_id": "dr_extend_0_deadbeef"}
    ).status_code == 409

    # The static contract carries no card material, so it stays available.
    assert client.get("/api/v1/speaking/drills/kinds").status_code == 200


# ======================================================================================
# Reference audio
# ======================================================================================


def test_reference_audio_renders_into_the_cache_the_media_route_reads(client: Any) -> None:
    from bandready import settings_store

    settings_store.patch_settings({"tts": {"preset": "mock_tts", "engine": "mock"}})
    item_id = _item_id(client, P2, "shadowing")
    response = client.post(
        "/api/v1/speaking/drills/audio",
        json={"card_id": P2, "item_id": item_id, "attempted": True},
    )
    if response.status_code == 502:  # pragma: no cover — no TTS engine on this machine
        pytest.skip("no TTS engine available")
    assert response.status_code == 201, response.text
    doc = response.json()
    assert doc["rel_path"].startswith("pron/ref/")
    assert doc["media_url"].startswith("/api/v1/media/pron/ref?")

    served = client.get(doc["media_url"])
    assert served.status_code == 200
    assert served.content


def test_reference_audio_refuses_an_item_the_card_does_not_have(client: Any) -> None:
    response = client.post(
        "/api/v1/speaking/drills/audio", json={"card_id": P2, "item_id": "dr_extend_9_deadbeef"}
    )
    assert response.status_code == 404
