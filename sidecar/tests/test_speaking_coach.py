"""Speaking-coach tests: the model-answer gate, the compare parse, and the vocab push.

The gate is the security-shaped property of this module — a model answer reaching a
learner who has not spoken yet is the one failure this feature cannot have — so it is
tested from several directions: no flag, an explicit flag, a *completed* session, a
still-live session, and a different card in the same set.

The fixture pack below is a miniature of the authored shape in
``content/core-en/staging/DESIGN.md``: one card set with a language bank and a vocabulary
list, two Part 1 frames, one Part 2 card carrying three model answers, and one Part 3
card. Transcripts are short — they are here to be gated and quoted, not to be read.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from bandready.speaking import coach

# ======================================================================================
# Fixture pack — the DESIGN.md shape in miniature
# ======================================================================================

#: Appears only inside the band-7 model answer. If this string ever shows up in a locked
#: response the gate has leaked, whatever the shape of the leak.
MODEL_ONLY = "the printer jammed halfway through"

SET_ID = "set_coach_fixture_900"
P1_A = "card_p1_your_studies_900"
P1_B = "card_p1_asking_for_help_900"
P2 = "card_p2_late_delivery_900"
P3 = "card_p3_getting_things_fixed_900"

LANGUAGE_BANK = {
    "warning": (
        "These are frames with gaps, not lines to recite. Fill the gap with your own "
        "meaning and it is language; deliver it whole and it is audibly a recital."
    ),
    "functions": [
        {
            "function": "narrating",
            "why_here": "The card is a story, and the tense has to hold across it.",
            "grammar": "past simple with one past perfect backshift",
            "frames": [
                {
                    "frame": "This was back in ___, when ___",
                    "slot_hint": "a season or a year, then what was going on at the time",
                },
                {
                    "frame": "By the time I ___, they'd already ___",
                    "slot_hint": "two past events; the earlier one goes in past perfect",
                },
            ],
            "avoid": "First of all, I would like to describe a memorable experience of my life.",
        },
        {
            "function": "evaluating",
            "why_here": "The fourth bullet asks what you learned; that carries the band.",
            "grammar": "cleft sentences, comparative judgement",
            "frames": [
                {
                    "frame": "What stayed with me wasn't ___, it was ___",
                    "slot_hint": "the obvious thing first, then the thing that actually mattered",
                }
            ],
            "avoid": "It was a very memorable experience which I will never forget in my life.",
        },
        {
            "function": "conceding",
            "why_here": "Part 3 pushes back, and the answer has to hold its position.",
            "grammar": "concessive clauses",
            "frames": [
                {
                    "frame": "There's something in that, although ___",
                    "slot_hint": "the bit you keep",
                }
            ],
            "avoid": "Yes, I completely agree with you, you are absolutely right about that.",
        },
    ],
}

VOCABULARY = [
    {
        "item": "get nowhere with something",
        "type": "chunk",
        "cefr": "B2",
        "meaning": "keep trying and make no progress at all",
        "example": "I rang them twice and I was getting nowhere with it.",
        "used_in": "part2",
    },
    {
        "item": "fob someone off",
        "type": "phrasal_verb",
        "cefr": "C1",
        "meaning": "put someone off with an excuse instead of helping",
        "example": "They kept fobbing me off with promises of a callback.",
        "used_in": "part2",
    },
    {
        "item": "a running joke",
        "type": "collocation",
        "cefr": "B2",
        "meaning": "a joke a group keeps coming back to",
        "example": "It turned into a running joke in the office by the end of the week.",
        "used_in": "any",
    },
]

BAND6 = (
    "I want to talk about a time I had a problem with a delivery. It was last year and "
    "I ordered a chair for my room. The shop said it will come on Friday but it doesn't "
    "come. So I call them and they say sorry. It was very annoying and I feel bad. "
    "Then I go to the shop and I speak to a man there and he was nice. He said he will "
    "check it for me and he did. The chair comes the next week. So it was good in the "
    "end but it takes a long time. I learned that you must call them and not wait."
)

BAND7 = (
    "I'd like to describe the time a delivery I'd been waiting on simply never turned up. "
    "This was back in the spring, when I'd just moved into a flat with almost nothing in it. "
    "By the time I rang the shop, they'd already closed the order on their system, so as far "
    "as they were concerned it had arrived. I spent about a fortnight getting nowhere with it. "
    "The turning point was going in person, because the assistant printed the delivery record "
    "for me, and although " + MODEL_ONLY + ", you could still read the date. "
    "What stayed with me wasn't the chair, it was how quickly the whole thing moved once I "
    "stopped emailing and stood in front of somebody. Looking back, I'd have gone in on day two."
)

BAND8 = (
    "The delivery I want to talk about is the one that never came at all, which sounds like a "
    "small thing until you are sitting on the floor of an empty flat. It was the spring I moved "
    "in, and by the time I got through to anybody the order had been closed off as delivered. "
    "What made it so hard to shift was that everyone I spoke to was reading the same screen. "
    "Only when I turned up in person did somebody go and look, and that is the bit I have kept: "
    "not that persistence pays, exactly, but that the person who can actually fix it is rarely "
    "the person answering the phone."
)

P2_TEACHING = {
    "schema_version": 1,
    "band_move": "Hold one past tense across the whole two minutes, then land on what changed.",
    "prep_plan": {
        "idea_prompt": (
            "Take the first delivery or repair that went wrong. Do not shop for a better one."
        ),
        "note_grid": [
            {"bullet_index": 0, "cell": "chair, spring, empty flat"},
            {"bullet_index": 1, "cell": "rang -> closed on system"},
            {"bullet_index": 2, "cell": "2 wks emails -> went in"},
            {"bullet_index": 3, "cell": "learned: go in person day 2"},
        ],
        "trap": (
            "Most people describe the problem and never say what they did differently after it."
        ),
    },
    "time_plan": [
        {"from_s": 0, "to_s": 10, "segment": "opening",
         "goal": "Name the delivery and when."},
        {"from_s": 10, "to_s": 50, "segment": "bullets_1_2",
         "goal": "What you ordered, what went wrong."},
        {"from_s": 50, "to_s": 80, "segment": "bullet_3",
         "goal": "What you actually did about it."},
        {"from_s": 80, "to_s": 115, "segment": "bullet_4",
         "goal": "What it changed about how you handle this."},
        {"from_s": 115, "to_s": 120, "segment": "landing",
         "goal": "One sentence of judgement, then stop."},
    ],
    "recovery_moves": [
        {"rung": 2,
         "prompt": "Say how long it went on for — days, weeks, how often you chased it."},
        {"rung": 3, "prompt": "Bring in the person who finally helped and what they said."},
        {"rung": 6, "prompt": "Say plainly whether you would handle it the same way again."},
    ],
    "target_language": ["narrating", "evaluating"],
    "error_watchlist": [
        {
            "pattern": "tense consistency in a past narrative",
            "wrong": "The shop said it will come on Friday but it doesn't come.",
            "right": "The shop said it would come on Friday, but it never came.",
            "why": "Reported speech and the story stay in the past.",
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
        "priority": "ed_endings",
        "tier": 1,
        "why_here": "The whole answer is past tense, so every verb ends in a cluster.",
        "target_words": [
            {"word": "jammed", "stress": "JAMMD", "note": "one syllable, not jam-med"},
            {"word": "printed", "stress": "PRIN-tid", "note": "here the -ed is a syllable"},
            {"word": "closed", "stress": "KLOHZD", "note": "ends voiced, not 'close'"},
        ],
        "chunking_drill": {
            "sentence": (
                "By the time I rang the shop, they'd already closed the order on their system"
            ),
            "chunks": [
                "By the time I rang the shop",
                "they'd already closed the order",
                "on their system",
            ],
        },
        "minimal_pairs": [{"a": "closed", "b": "close", "contrast": "final voiced cluster"}],
    },
    "examiner_note": "The examiner will let the two minutes run and will not help you land it.",
    "swap_slots": [
        {"span": "back in the spring",
         "prompt": "Your own time reference — a season or a year, not 'once'."},
        {"span": "a flat with almost nothing in it",
         "prompt": "Where you actually were, in four words."},
        {"span": MODEL_ONLY, "prompt": "The one concrete detail that proves you were there."},
    ],
    "transfer_drill": "Retell the same story in 45 seconds using two past perfects and no 'so'.",
    "model_answers": [
        {
            "band_target": 6,
            "label": "Where most candidates land",
            "approx_seconds": 95,
            "transcript": BAND6,
            "what_caps_it": [
                {"criterion": "GRA",
                 "point": "The narrative slips into the present halfway through."},
                {"criterion": "LR",
                 "point": "Evaluation is carried by 'nice', 'good' and 'annoying'."},
                {"criterion": "FC", "point": "Every clause is joined with 'and' or 'so'."},
            ],
            "what_lifts_it": [],
            "annotations": [
                {
                    "span": "I learned that you must call them and not wait",
                    "kind": "move",
                    "criterion": "FC",
                    "label": "Lands on a lesson",
                    "why": "Keep this — it answers the fourth bullet directly.",
                    "transferable": True,
                },
                {
                    "span": "It was very annoying and I feel bad",
                    "kind": "avoid",
                    "criterion": "LR",
                    "label": "Flat adjectives",
                    "why": "Choose one precise word instead of 'very' plus a weak one.",
                    "transferable": False,
                },
            ],
        },
        {
            "band_target": 7,
            "label": "One clear step up",
            "approx_seconds": 115,
            "transcript": BAND7,
            "what_caps_it": [],
            "what_lifts_it": [
                {"criterion": "GRA", "point": "Past perfect marks what had already happened."},
                {"criterion": "LR", "point": "Chunks like 'getting nowhere with it' do the work."},
                {"criterion": "FC",
                 "point": "The turn is signposted rather than merely continued."},
            ],
            "annotations": [
                {
                    "span": "By the time I rang the shop, they'd already closed the order",
                    "kind": "grammar",
                    "criterion": "GRA",
                    "label": "Past perfect backshift",
                    "why": "Use it once to show which event came first.",
                    "transferable": True,
                },
                {
                    "span": "getting nowhere with it",
                    "kind": "lexis",
                    "criterion": "LR",
                    "label": "Chunk, not a word",
                    "why": "Bank the whole phrase and use it about your own week.",
                    "transferable": True,
                },
            ],
        },
        {
            "band_target": 8,
            "label": "Sustained control",
            "approx_seconds": 110,
            "transcript": BAND8,
            "what_caps_it": [],
            "what_lifts_it": [
                {"criterion": "GRA", "point": "A cleft and an inversion carry the emphasis."},
                {"criterion": "LR", "point": "'closed off as delivered' is exact, not decorative."},
                {"criterion": "FC", "point": "The close abstracts away from the anecdote."},
            ],
            "annotations": [
                {
                    "span": "Only when I turned up in person did somebody go and look",
                    "kind": "grammar",
                    "criterion": "GRA",
                    "label": "Inversion after 'only when'",
                    "why": "Save it for the sentence you most want heard.",
                    "transferable": True,
                }
            ],
        },
    ],
}

P1_TEACHING = {
    "schema_version": 1,
    "tense_focus": "present simple for the routine, past simple for how it started",
    "band_move": "Answer, reason, one detail — then stop talking.",
    "questions": [
        {
            "q_index": 0,
            "angle": "A1",
            "answer_shape": "Say which subject, then where you study it, then one detail.",
            "extend_move": (
                "I picked it because it was the only one I did not have to be talked into."
            ),
            "common_error": {
                "wrong": "I am studying in the university since two years.",
                "right": "I have been studying at university for two years.",
                "why": "'for' takes a length of time, 'since' takes a start point.",
            },
            "probe": "And before that?",
        },
        {
            "q_index": 1,
            "angle": "A5",
            "answer_shape": "Say what changed, then when, then what it is like now.",
            "extend_move": "It used to be all lectures, whereas now most of it is group work.",
            "common_error": {
                "wrong": "Before I was going there every days.",
                "right": "I used to go in every day.",
                "why": "'used to' carries a lapsed habit; 'every day' is singular.",
            },
            "probe": "Why the change?",
        },
    ],
}

P3_TEACHING = {
    "schema_version": 1,
    "band_move": "Concede the reasonable half, then say what you still hold.",
    "bridge": (
        "We have been talking about a delivery that went wrong. I would like to widen "
        "that out to services in general."
    ),
    "error_watchlist": [
        {
            "pattern": "agreement across a long subject",
            "wrong": "The number of complaints people make about deliveries have gone up.",
            "right": "The number of complaints people make about deliveries has gone up.",
            "why": "The subject is 'the number', not 'complaints'.",
            "criterion": "GRA",
        },
        {
            "pattern": "articles with generalisations",
            "wrong": "The companies should be more responsible for the customers.",
            "right": "Companies should be more responsible to their customers.",
            "why": "Drop 'the' when you mean the category, not a known group.",
            "criterion": "GRA",
        },
    ],
}

P3_THEMES = [
    {
        "title": "how companies handle complaints",
        "questions": [
            "Why do you think complaints take so long to resolve these days?",
            "Should companies be made to answer complaints within a set time?",
            "How might the way people complain change over the next ten years?",
        ],
        "counterpoint": "Slow complaint handling is a deliberate saving, not an accident of scale.",
        "counter_probe": (
            "But surely a company that ignores you for a fortnight is saving money by doing it?"
        ),
        "concession_frame": "There's something in that, although ___",
        "target_functions": ["conceding", "evaluating"],
        "abstraction_ladder": {
            "concrete": "How long did you wait for someone to deal with it?",
            "local_general": "Do people you know bother complaining at all?",
            "societal_abstract": "What does the speed of redress say about a market?",
        },
        "question_notes": [
            {
                "q_index": 0,
                "move": "M2",
                "archetype": "cause",
                "answer_shape": (
                    "Name one cause, rule out the obvious one, then give the consequence."
                ),
                "probe": "Is that new?",
                "watch_out": "Do not narrate your own delivery again — this is about companies.",
            },
            {
                "q_index": 1,
                "move": "M6",
                "archetype": "responsibility",
                "answer_shape": "Take a side, name who would carry the cost, then qualify it.",
                "probe": "Enforced by whom?",
                "watch_out": "'Should' answers drift into a list; keep one line of argument.",
            },
            {
                "q_index": 2,
                "move": "M9",
                "archetype": "speculation",
                "answer_shape": "Say what is already shifting, then extrapolate one step only.",
                "probe": "What would stop that?",
                "watch_out": "Speculating with 'will' rather than 'might' overclaims.",
            },
        ],
    }
]

SET_PAYLOAD = {
    "schema_version": 2,
    "difficulty": "core",
    "tags": ["services", "problem-solving", "everyday-admin"],
    "part1_card_ids": [P1_A, P1_B],
    "part2_card_id": P2,
    "part3_card_id": P3,
    "cluster": "test-fixture",
    "family": "F5",
    "cognitive_load": None,
    "lineage": "Part 2 is one delivery that went wrong; Part 3 widens to complaint handling.",
    "teaches": "Hold one past tense across two minutes, then concede in Part 3 without folding.",
    "exam_note": "The examiner will not rescue a long turn that stalls at seventy seconds.",
    "language_bank": LANGUAGE_BANK,
    "vocabulary": VOCABULARY,
}


def _card(card_id: str, part: int, title: str, payload: dict[str, Any], difficulty: str) -> dict:
    return {
        "id": card_id,
        "part": part,
        "card_set_id": SET_ID,
        "topic_id": "topic_communication",
        "title": title,
        "difficulty": difficulty,
        "tags_json": json.dumps(["services", "problem-solving"]),
        "payload_json": json.dumps(
            {"schema_version": 2, "id": card_id, "part": part, "topic": title, **payload}
        ),
    }


CARDS = [
    _card(P1_A, 1, "your studies", {"frame_tier": 1, "frame_kind": "personal",
                                    "questions": ["What are you studying at the moment?",
                                                  "Has the way you study changed at all?"],
                                    "teaching": P1_TEACHING}, "core"),
    _card(P1_B, 1, "asking for help",
          {"frame_tier": 3, "frame_kind": "topic",
           "questions": ["Do you find it easy to ask for help?",
                         "Who do you usually ask first?"],
           "teaching": {"schema_version": 1,
                        "band_move": "Answer the question asked, not the one nearby.",
                        "questions": []}}, "core"),
    _card(P2, 2, "a delivery that went wrong",
          {"family": "F5",
           "cue_card": {
               "topic": "Describe a time when something you ordered did not arrive.",
               "bullets": ["what you had ordered", "when it was due", "what you did about it",
                           "and explain what it changed about how you handle this now."],
               "rounding_off": ["Would you order from them again?",
                                "Did anyone else get involved?"],
           },
           "teaching": P2_TEACHING}, "core"),
    _card(P3, 3, "getting things put right",
          {"part3_themes": P3_THEMES, "teaching": P3_TEACHING}, "stretch"),
]


# ======================================================================================
# Fixtures
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
        _seed_fixture_pack()
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def _seed_fixture_pack() -> None:
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.merge(m.Topic(id="topic_communication", label="Communication", category="general"))
        s.flush()
        s.add(
            m.CardSet(
                id=SET_ID,
                title="Services that let you down",
                topic_id="topic_communication",
                parts_json=json.dumps([1, 2, 3]),
                payload_json=json.dumps(SET_PAYLOAD),
                source="pack",
            )
        )
        for row in CARDS:
            s.add(m.SpeakingCard(**row, source="pack"))


def _complete_session(
    session_id: str,
    *,
    turns: list[dict[str, Any]],
    status: str = "complete",
    card_set_id: str | None = SET_ID,
    part: int | None = 2,
) -> None:
    """Write the record a finished (or still-live) speaking session leaves behind."""
    from bandready.db import models as m
    from bandready.db.engine import session_scope
    from bandready.server.deps import current_profile_id

    with session_scope() as s:
        profile_id = current_profile_id(s)
        s.add(
            m.PracticeSession(
                id=session_id,
                profile_id=profile_id,
                module="speaking",
                activity="single_part:2",
                ended_at="2026-07-20T10:00:00.000Z" if status == "complete" else None,
            )
        )
        s.add(
            m.SpeakingSession(
                id=session_id,
                mode="practice",
                part=part,
                card_set_id=card_set_id,
                state="WRAP_UP",
                status=status,
                transcript_json=json.dumps({"turns": turns}),
            )
        )


LEARNER_TURN = {
    "role": "user",
    "text": (
        "I ordered a desk last year and it did not arrive. I called the shop and they "
        "told me it was already delivered, so I went there and they checked it for me. "
        "In the end it came two weeks late and I was quite annoyed about it."
    ),
    "t_ms": 60_000,
    "part": 2,
    "phase": "P2_LONG_TURN",
}


# ======================================================================================
# The gate — the property this feature cannot get wrong
# ======================================================================================


def test_model_answers_are_absent_until_the_learner_has_spoken(client: Any) -> None:
    response = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching")
    assert response.status_code == 200, response.text
    doc = response.json()

    assert doc["gate"]["unlocked"] is False
    assert doc["gate"]["reason"] == "not_attempted"
    assert doc["model_answers"] == []
    assert doc["swap_slots"] == []
    assert doc["pronunciation_focus"]["chunking_drill"] is None
    assert doc["pronunciation_focus"]["chunking_drill_locked"] is True

    # Nothing anywhere in the body may quote the model — not a span, not a drill line.
    body = response.text
    assert MODEL_ONLY not in body
    for answer in P2_TEACHING["model_answers"]:
        assert answer["transcript"][:60] not in body
    assert "they'd already closed the order on their system" not in body

    # The ladder's existence is still advertised, so the UI can lock a tab, not hide one.
    assert doc["model_answer_bands"] == [6, 7, 8]
    assert doc["gate"]["gated_fields"] == list(coach.GATED_FIELDS)
    assert "script" in doc["gate"]["message"]


def test_the_teaching_material_around_the_model_is_not_gated(client: Any) -> None:
    """Everything that is *not* model wording must be usable before the attempt."""
    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()

    assert doc["band_move"].startswith("Hold one past tense")
    assert doc["structure_plan"]["prep"]["idea_prompt"]
    assert [f["function"] for f in doc["functional_language"]["functions"][:2]] == [
        "evaluating",
        "narrating",
    ]  # targeted functions sort first
    assert doc["functional_language"]["warning"]
    assert len(doc["vocabulary"]) == 3
    assert doc["common_errors"][0]["criterion"] == "GRA"
    assert doc["pronunciation_focus"]["priority"] == "ed_endings"
    assert len(doc["pronunciation_focus"]["target_words"]) == 3


def test_the_explicit_attempt_flag_unlocks_the_ladder(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching?attempted=true").json()

    assert doc["gate"]["unlocked"] is True
    assert doc["gate"]["reason"] == "client_attested"
    assert [a["band_target"] for a in doc["model_answers"]] == [6, 7, 8]
    assert MODEL_ONLY in doc["model_answers"][1]["transcript"]
    assert len(doc["swap_slots"]) == 3
    assert doc["pronunciation_focus"]["chunking_drill"]["chunks"]


def test_a_completed_session_unlocks_without_any_flag(client: Any) -> None:
    _complete_session("ss_done", turns=[LEARNER_TURN])

    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is True
    assert doc["gate"]["reason"] == "attempted"
    assert doc["gate"]["attempts"] == 1
    assert doc["gate"]["last_attempt_session_id"] == "ss_done"
    assert len(doc["model_answers"]) == 3


def test_a_live_session_does_not_open_the_gate(client: Any) -> None:
    """The gate must not open mid-turn — an attempt is a *finished* attempt."""
    _complete_session("ss_live", turns=[LEARNER_TURN], status="active")

    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is False
    assert doc["model_answers"] == []


def test_a_silent_session_does_not_open_the_gate(client: Any) -> None:
    """Connecting and saying nothing is not an attempt."""
    _complete_session(
        "ss_silent",
        turns=[
            {"role": "assistant", "text": "Here is your topic.", "t_ms": 1_000},
            {"role": "user", "text": "um", "t_ms": 3_000, "part": 2},
        ],
    )

    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is False


def test_the_gate_is_per_card_not_per_learner(client: Any) -> None:
    """Speaking on one card must not hand over every other card's model answer."""
    _complete_session(
        "ss_other_set",
        turns=[{**LEARNER_TURN, "part": 2}],
        card_set_id="set_home_neighbourhood_001",  # a different set, from the shipped pack
    )

    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is False
    assert doc["model_answers"] == []


def test_a_part1_turn_does_not_unlock_the_part2_card(client: Any) -> None:
    """Same set, wrong part: answering the interview is not attempting the long turn."""
    _complete_session(
        "ss_part1_only",
        turns=[{**LEARNER_TURN, "part": 1, "phase": "P1_QA"}],
        part=1,
    )

    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is False

    # ...but it does unlock the Part 1 card that was actually spoken on.
    p1 = client.get(f"/api/v1/speaking/coach/cards/{P1_A}/teaching").json()
    assert p1["gate"]["unlocked"] is True


def test_a_turn_naming_the_card_unlocks_it_across_sets(client: Any) -> None:
    _complete_session(
        "ss_by_card_id",
        turns=[{**LEARNER_TURN, "card_id": P2, "part": None}],
        card_set_id=None,
        part=None,
    )
    doc = client.get(f"/api/v1/speaking/coach/cards/{P2}/teaching").json()
    assert doc["gate"]["unlocked"] is True
    assert doc["gate"]["reason"] == "attempted"


def test_unknown_card_is_a_404(client: Any) -> None:
    missing = client.get("/api/v1/speaking/coach/cards/card_nope/teaching")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


def test_a_schema_v1_card_degrades_instead_of_failing(client: Any) -> None:
    """The twelve shipped sets carry no teaching payload; they must still render."""
    listed = client.get("/api/v1/speaking/cards?part=2").json()["items"]
    legacy = next(c for c in listed if c["id"].endswith("_001"))

    doc = client.get(f"/api/v1/speaking/coach/cards/{legacy['id']}/teaching").json()
    assert doc["teaching_available"] is False
    assert doc["model_answers"] == []
    assert doc["model_answer_bands"] == []
    assert doc["common_errors"] == []
    assert doc["pronunciation_focus"] is None


# ======================================================================================
# Part-specific teaching shapes
# ======================================================================================


def test_part1_teaching_joins_questions_to_their_notes(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/coach/cards/{P1_A}/teaching").json()

    assert doc["tense_focus"].startswith("present simple")
    questions = doc["questions"]
    assert [q["q_index"] for q in questions] == [0, 1]
    assert questions[0]["question"] == "What are you studying at the moment?"
    assert questions[0]["angle"] == "A1"
    assert questions[1]["probe"] == "Why the change?"
    # Per-question errors are flattened and ranked so the report can surface exactly one.
    assert doc["common_errors"][0]["q_index"] == 0
    assert doc["common_errors"][0]["right"].startswith("I have been studying")
    assert doc["structure_plan"] is None


def test_part1_notes_may_be_missing_without_losing_the_questions(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/coach/cards/{P1_B}/teaching").json()
    assert [q["question"] for q in doc["questions"]] == [
        "Do you find it easy to ask for help?",
        "Who do you usually ask first?",
    ]
    assert doc["questions"][0]["answer_shape"] is None


def test_part3_teaching_carries_the_sparring_fields(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/coach/cards/{P3}/teaching").json()

    theme = doc["themes"][0]
    assert theme["title"] == "how companies handle complaints"
    assert theme["counter_probe"].startswith("But surely")
    assert "___" in theme["concession_frame"]
    assert list(theme["abstraction_ladder"]) == ["concrete", "local_general", "societal_abstract"]
    assert [q["move"] for q in theme["questions"]] == ["M2", "M6", "M9"]
    assert doc["bridge"].startswith("We have been talking")
    # Part 3 targets its themes' functions, so the bank leads with them.
    assert doc["functional_language"]["targeted"] == ["conceding", "evaluating"]


# ======================================================================================
# Part 2 plan (the prep-minute coach)
# ======================================================================================


def test_part2_plan_keeps_the_trap_out_of_the_prep_block(client: Any) -> None:
    plan = client.get(f"/api/v1/speaking/coach/part2/plan/{P2}").json()

    assert plan["cue_card"]["bullets"][3].startswith("and explain ")
    prep = plan["prep"]
    assert prep["seconds"] == 60
    assert prep["cell_char_limit"] == 40
    assert [cue["remaining_s"] for cue in prep["cues"]] == [60, 45, 10]
    assert prep["cues"][1]["banner"] == "Now note, don't write."
    # The worked example is a toggle, and each cell is paired with its own bullet.
    assert [cell["bullet_index"] for cell in prep["note_grid_example"]] == [0, 1, 2, 3]
    assert prep["note_grid_example"][0]["bullet"] == "what you had ordered"
    assert all(len(cell["cell"]) <= 40 for cell in prep["note_grid_example"])
    # The trap is a post-turn check, never something read while planning.
    assert "trap" not in prep
    assert plan["post_turn"]["trap"].startswith("Most people describe")

    assert [seg["segment"] for seg in plan["time_plan"]] == [
        "opening", "bullets_1_2", "bullet_3", "bullet_4", "landing",
    ]
    assert [move["rung"] for move in plan["recovery_moves"]] == [2, 3, 6]
    assert plan["target_language"] == ["narrating", "evaluating"]


def test_part2_plan_refuses_a_card_that_is_not_part_2(client: Any) -> None:
    wrong = client.get(f"/api/v1/speaking/coach/part2/plan/{P1_A}")
    assert wrong.status_code == 422
    assert "Part 1" in wrong.json()["detail"]


def test_part2_plan_is_404_when_the_card_predates_the_payload(client: Any) -> None:
    listed = client.get("/api/v1/speaking/cards?part=2").json()["items"]
    legacy = next(c for c in listed if c["id"].endswith("_001"))
    assert client.get(f"/api/v1/speaking/coach/part2/plan/{legacy['id']}").status_code == 404


# ======================================================================================
# Language bank
# ======================================================================================


def test_language_bank_filters_by_function_and_topic(client: Any) -> None:
    everything = client.get("/api/v1/speaking/coach/language-bank").json()
    ours = [i for i in everything["items"] if i["card_set_id"] == SET_ID]
    assert len(ours) == 3
    assert everything["facets"]["narrating"] >= 1

    narrating = client.get("/api/v1/speaking/coach/language-bank?function=narrating").json()
    assert {i["function"] for i in narrating["items"]} == {"narrating"}
    entry = next(i for i in narrating["items"] if i["card_set_id"] == SET_ID)
    assert len(entry["frames"]) == 2
    assert all(frame["slots"] >= 1 for frame in entry["frames"])
    assert entry["avoid"].startswith("First of all")   # the negative exemplar travels with it
    assert entry["set_warning"]

    # `topic` accepts the bare topic or the row id — both must resolve to the same rows.
    # Counted against the fixture only: the shipped pack also carries this topic, and how
    # many authored sets sit under it is content, not behaviour this test owns.
    bare = client.get("/api/v1/speaking/coach/language-bank?topic=communication").json()
    prefixed = client.get("/api/v1/speaking/coach/language-bank?topic=topic_communication").json()
    assert bare["count"] == prefixed["count"]
    assert bare["items"] == prefixed["items"]
    assert len([i for i in bare["items"] if i["card_set_id"] == SET_ID]) == 3
    assert bare["filters"]["topic_id"] == "topic_communication"

    scoped = client.get(f"/api/v1/speaking/coach/language-bank?card_set_id={SET_ID}").json()
    assert scoped["sets"] == 1


def test_language_bank_rejects_an_unknown_function(client: Any) -> None:
    bad = client.get("/api/v1/speaking/coach/language-bank?function=vibing")
    assert bad.status_code == 422
    assert "conceding" in bad.json()["detail"]


# ======================================================================================
# Vocabulary → the suggestion inbox (R2-5: modules never schedule)
# ======================================================================================


def test_vocabulary_listing_carries_the_production_only_exercise_rule(client: Any) -> None:
    doc = client.get(f"/api/v1/speaking/coach/vocabulary/{SET_ID}").json()
    assert doc["count"] == 3
    assert doc["topic_tag"] == "language-communication"
    assert doc["items"][0]["item"] == "get nowhere with something"
    assert doc["srs_exercises"] == ["use-in-sentence", "speaking-drill"]
    assert client.get("/api/v1/speaking/coach/vocabulary/set_nope").status_code == 404


def test_pushing_vocabulary_creates_suggestions_not_scheduled_cards(client: Any) -> None:
    from sqlalchemy import func, select

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    pushed = client.post(
        f"/api/v1/speaking/coach/vocabulary/{SET_ID}/push",
        json={"items": ["fob someone off", "a running joke"]},
    )
    assert pushed.status_code == 201, pushed.text
    assert pushed.json()["count"] == 2
    assert pushed.json()["requested"] == 2

    with session_scope() as s:
        entries = list(s.execute(select(m.VocabEntry)).scalars())
        assert {e.headword for e in entries} == {"fob someone off", "a running joke"}
        # R2-5 — the inbox, always. Nothing a module sends is scheduled silently.
        assert {e.status for e in entries} == {"suggested"}
        assert s.execute(select(func.count()).select_from(m.SrsCard)).scalar() == 0

        by_head = {e.headword: e for e in entries}
        assert by_head["a running joke"].pos == "collocation"
        assert by_head["fob someone off"].cefr_level == "C1"
        assert by_head["fob someone off"].definition.startswith("put someone off")
        assert json.loads(by_head["a running joke"].topic_tags_json) == ["language-communication"]

        sources = list(s.execute(select(m.VocabSource)).scalars())
        assert {src.module for src in sources} == {"speaking"}
        assert {src.session_id for src in sources} == {SET_ID}

    # And they show up in the inbox the learner actually reviews.
    inbox = client.get("/api/v1/vocab/suggestions").json()
    assert inbox["total"] == 2


def test_pushing_without_a_selection_files_the_whole_list(client: Any) -> None:
    pushed = client.post(f"/api/v1/speaking/coach/vocabulary/{SET_ID}/push", json={})
    assert pushed.status_code == 201
    assert pushed.json()["count"] == 3

    # POST on the collection URL is the documented alias of …/push, and dedup means a
    # second file merges rather than duplicating.
    again = client.post(f"/api/v1/speaking/coach/vocabulary/{SET_ID}", json={})
    assert again.status_code == 201
    assert all(item["merged"] for item in again.json()["items"])
    assert client.get("/api/v1/vocab/suggestions").json()["total"] == 3


def test_pushing_an_item_the_set_does_not_have_is_refused(client: Any) -> None:
    """A typo must not quietly file fewer words than the learner ticked."""
    bad = client.post(
        f"/api/v1/speaking/coach/vocabulary/{SET_ID}/push",
        json={"items": ["fob someone off", "not in this set"]},
    )
    assert bad.status_code == 422
    assert "not in this set" in bad.json()["detail"]


# ======================================================================================
# Compare
# ======================================================================================

LEARNER_ANSWER = (
    "I want to talk about a desk I ordered last year. It did not arrive on the day they "
    "said and I called them and they said it was delivered already. So I went to the shop "
    "and the man checked it and he was nice about it. It came two weeks later. It was very "
    "annoying but in the end it was fine and I learned to call them earlier."
)

MODEL_COMPARE_JSON = {
    "criteria": [
        {
            "criterion": "GRA",
            "model_does": "Marks the earlier event with a past perfect before the main clause.",
            "you_did": "\"they said it was delivered already\" keeps everything in one tense.",
            "try_this": "By the time I rang them, they'd already marked the desk as delivered.",
        },
        {
            "criterion": "LR",
            "model_does": "Carries the judgement on a chunk rather than an intensifier.",
            "you_did": "\"it was very annoying but in the end it was fine\".",
            "try_this": (
                "I spent a fortnight getting nowhere with it, then ten minutes in person."
            ),
        },
    ],
    "unused_language": [
        {
            "frame": "What stayed with me wasn't ___, it was ___",
            "where_it_fits": "Instead of 'in the end it was fine', at the close.",
        }
    ],
    "next_actions": [
        "Retell this with one past perfect in the first thirty seconds.",
        "Replace 'very annoying' with one precise adjective and stop there.",
    ],
}


def test_compare_parses_the_model_response_and_keeps_it_grounded(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, Any] = {}

    async def fake_chat_json(
        messages: list[dict[str, str]], mock_kind: str | None = None, **kw: Any
    ):
        seen["messages"] = messages
        seen["mock_kind"] = mock_kind
        return dict(MODEL_COMPARE_JSON, _meta={"model_id": "fake-1"})

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake_chat_json)

    response = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P2, "transcript": LEARNER_ANSWER, "band_target": 7},
    )
    assert response.status_code == 200, response.text
    doc = response.json()

    assert doc["band_target"] == 7
    assert doc["your_words"] == len(LEARNER_ANSWER.split())
    assert MODEL_ONLY in doc["model_answer"]["transcript"]
    assert doc["_meta"]["model_id"] == "fake-1"

    # The model's two criteria survive, and the authored third is kept rather than lost.
    by_criterion = {c["criterion"]: c for c in doc["criteria"]}
    assert by_criterion["GRA"]["source"] == "model"
    assert by_criterion["GRA"]["try_this"].startswith("By the time I rang")
    assert by_criterion["FC"]["source"] == "card"
    assert [c["criterion"] for c in doc["criteria"]] == ["FC", "LR", "GRA"]

    assert doc["next_actions"] == MODEL_COMPARE_JSON["next_actions"]

    # The prompt is built from this card, not from generic band advice.
    prompt = seen["messages"][1]["content"]
    assert MODEL_ONLY in prompt
    assert "Hold one past tense" in prompt
    assert "This was back in ___, when ___" in prompt
    assert "tense consistency in a past narrative" in prompt
    assert LEARNER_ANSWER in prompt
    assert seen["mock_kind"] == "speaking_compare"


def test_compare_reports_which_frames_went_unused(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_chat_json(
        messages: list[dict[str, str]], mock_kind: str | None = None, **kw: Any
    ):
        return dict(MODEL_COMPARE_JSON, _meta={"model_id": "fake-1"})

    monkeypatch.setattr("bandready.providers.llm.chat_json", fake_chat_json)

    doc = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P2, "transcript": LEARNER_ANSWER},
    ).json()

    frames = {item["frame"]: item for item in doc["unused_language"]}
    assert "What stayed with me wasn't ___, it was ___" in frames
    # The model only annotates where an unused frame fits; membership is decided here.
    assert frames["What stayed with me wasn't ___, it was ___"]["where_it_fits"].startswith(
        "Instead of"
    )
    assert frames["By the time I ___, they'd already ___"]["where_it_fits"] is None


def test_compare_falls_back_to_the_authored_card_in_mock_mode(client: Any) -> None:
    """Mock mode returns a fixture that knows nothing about this card — and still helps."""
    doc = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P2, "transcript": LEARNER_ANSWER, "band_target": 8},
    ).json()

    assert [c["criterion"] for c in doc["criteria"]] == ["FC", "LR", "GRA"]
    assert all(c["source"] == "card" for c in doc["criteria"])
    assert doc["criteria"][2]["model_does"] == "A cleft and an inversion carry the emphasis."
    # The authored next actions: the one move, the top error, the transfer drill.
    assert doc["next_actions"][0] == P2_TEACHING["band_move"]
    assert "The shop said it would come on Friday" in doc["next_actions"][1]
    assert doc["next_actions"][2] == P2_TEACHING["transfer_drill"]
    assert len(doc["next_actions"]) == 3
    assert doc["unused_language"]


def test_compare_can_read_the_transcript_from_a_finished_session(client: Any) -> None:
    _complete_session("ss_for_compare", turns=[LEARNER_TURN])

    doc = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P2, "session_id": "ss_for_compare"},
    ).json()
    assert doc["your_words"] == len(LEARNER_TURN["text"].split())
    assert doc["session_id"] == "ss_for_compare"


def test_compare_refuses_a_transcript_with_nothing_in_it(client: Any) -> None:
    empty = client.post(
        "/api/v1/speaking/coach/compare", json={"card_id": P2, "transcript": "um yes"}
    )
    assert empty.status_code == 422
    assert "record an attempt first" in empty.json()["detail"]


def test_compare_refuses_a_band_the_card_does_not_model(client: Any) -> None:
    bad = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P2, "transcript": LEARNER_ANSWER, "band_target": 9},
    )
    assert bad.status_code == 422
    assert "band_target must be one of 6, 7, 8" in bad.json()["detail"]


def test_compare_refuses_a_card_without_a_band_ladder(client: Any) -> None:
    wrong_part = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": P1_A, "transcript": LEARNER_ANSWER},
    )
    assert wrong_part.status_code == 422
    assert "Part 2 long turn" in wrong_part.json()["detail"]


# ======================================================================================
# Pure helpers
# ======================================================================================


def test_unused_language_is_decided_by_string_match_not_by_the_model() -> None:
    functions = coach.bank_functions(SET_PAYLOAD)
    reached = coach.unused_language(
        "This was back in the spring, when I had just moved in.", functions
    )
    assert "This was back in ___, when ___" not in {item["frame"] for item in reached}

    silent = coach.unused_language("I ordered a desk and it never came.", functions)
    assert len(silent) == 4
    assert {item["function"] for item in silent} == {"narrating", "evaluating", "conceding"}


def test_signature_tokens_ignore_the_slots_and_the_function_words() -> None:
    assert coach.signature_tokens("This was back in ___, when ___") == ["back"]
    assert coach.signature_tokens("What stayed with me wasn't ___, it was ___") == ["stayed"]


def test_normalize_comparison_survives_a_fixture_that_knows_nothing() -> None:
    """Mock mode returns `{"ok": true, "text": ..., "items": []}` — never a crash."""
    baseline = {
        "criteria": [{"criterion": "GRA", "model_does": "x", "you_did": None,
                      "try_this": None, "source": "card"}],
        "unused_language": [{"frame": "a ___ frame", "function": "hedging",
                             "slot_hint": None, "grammar": None, "where_it_fits": None}],
        "next_actions": ["do the thing"],
    }
    out = coach.normalize_comparison({"ok": True, "text": "mock response", "items": []}, baseline)
    assert out["criteria"] == baseline["criteria"]
    assert out["next_actions"] == ["do the thing"]
    assert out["unused_language"][0]["where_it_fits"] is None
    assert out["grounded"] is True

    # A non-dict body (a bare list, a string) must fall through to the baseline too.
    assert coach.normalize_comparison("not a dict", baseline)["criteria"]  # type: ignore[arg-type]


def test_normalize_comparison_drops_criteria_it_cannot_trust() -> None:
    baseline = {"criteria": [], "unused_language": [], "next_actions": ["fallback"]}
    out = coach.normalize_comparison(
        {
            "criteria": [
                {"criterion": "VIBES", "model_does": "invented criterion"},
                {"criterion": "LR", "model_does": ""},
                {"criterion": "fc", "model_does": "lower case is fine"},
                {"criterion": "FC", "model_does": "a duplicate"},
            ],
            "next_actions": ["  ", "one real action"],
        },
        baseline,
    )
    assert [c["criterion"] for c in out["criteria"]] == ["FC"]
    assert out["criteria"][0]["model_does"] == "lower case is fine"
    # One usable action is a thin screen, so the authored ones top it up rather than
    # leaving the learner with a single line.
    assert out["next_actions"] == ["one real action", "fallback"]


def test_loads_never_raises_on_a_broken_column() -> None:
    assert coach.loads("{not json", {}) == {}
    assert coach.loads(None, []) == []
    assert coach.loads('["a"]', []) == ["a"]
    assert coach.loads('"a string"', {}) == {}


# ======================================================================================
# The authored pack itself
# ======================================================================================

STAGING = Path(__file__).resolve().parents[2] / "content" / "core-en" / "staging"


@pytest.mark.skipif(not (STAGING / "TEMPLATE.json").is_file(), reason="staging not authored yet")
def test_the_authored_template_survives_the_teaching_shape(client: Any) -> None:
    """Serve the real authored set, not just the fixture, when it is on disk."""
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    entry = json.loads((STAGING / "TEMPLATE.json").read_text(encoding="utf-8"))["sets"][0]
    with session_scope() as s:
        row = entry["set"]
        s.add(
            m.CardSet(
                id=row["id"],
                title=row["title"],
                topic_id=row["topic_id"],
                parts_json=json.dumps(row["parts_json"]),
                payload_json=json.dumps(row["payload_json"]),
                source="pack",
            )
        )
        for card in entry["cards"]:
            s.add(
                m.SpeakingCard(
                    id=card["id"],
                    part=card["part"],
                    card_set_id=card["card_set_id"],
                    topic_id=card["topic_id"],
                    title=card["title"],
                    difficulty=card["difficulty"],
                    tags_json=json.dumps(card["tags_json"]),
                    payload_json=json.dumps(card["payload_json"]),
                    source="pack",
                )
            )

    p2 = next(c for c in entry["cards"] if c["part"] == 2)
    locked = client.get(f"/api/v1/speaking/coach/cards/{p2['id']}/teaching").json()
    assert locked["model_answers"] == []
    assert locked["model_answer_bands"] == [6, 7, 8]

    unlocked = client.get(
        f"/api/v1/speaking/coach/cards/{p2['id']}/teaching?attempted=true"
    ).json()
    band7 = unlocked["model_answers"][1]["transcript"]
    # Every swap-slot span must be locatable in the band-7 text — the UI finds them by search.
    for slot in unlocked["swap_slots"]:
        assert slot["span"] in band7

    plan = client.get(f"/api/v1/speaking/coach/part2/plan/{p2['id']}").json()
    assert len(plan["time_plan"]) == 5
    assert len(plan["prep"]["note_grid_example"]) == 4
