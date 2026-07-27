"""Full Mock tests: assembly coherence, exam conditions, the stage machine, scoring.

Four properties are load-bearing here, and each is tested from more than one angle:

1. **The sitting is coherent.** Part 3 descends from the Part 2 card that was set, and
   Part 1 opens on a personal frame even when the chosen set carries none.
2. **The coach is shut for the duration** — including for a card the learner has already
   attempted and legitimately unlocked. This is the property a mock has no value without,
   so it is tested against the unlock path that would otherwise open the gate.
3. **Rounding-off questions are skipped when the long turn ran long**, and a long turn is
   never recorded as longer than two minutes.
4. **Scoring is whole-test**, with evidence attributed back to the part it was spoken in.

The pack below is two card sets: one modern set whose Part 1 frames are a personal frame
plus two topic frames, and one legacy-shaped set with no ``frame_kind`` at all — the
second exists so the "borrow a personal frame" path is exercised rather than assumed.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from bandready.speaking import mock

# ======================================================================================
# Fixture pack
# ======================================================================================

MODERN_SET = "set_mock_modern_910"
LEGACY_SET = "set_mock_legacy_911"

M_P1_PERSONAL = "card_p1_work_and_home_910"
M_P1_TOPIC_A = "card_p1_getting_around_910"
M_P1_TOPIC_B = "card_p1_weekends_910"
M_P2 = "card_p2_journey_you_remember_910"
M_P3 = "card_p3_how_people_travel_910"

L_P1_A = "card_p1_your_street_911"
L_P1_B = "card_p1_local_shops_911"
L_P2 = "card_p2_shop_you_like_911"
L_P3 = "card_p3_high_streets_911"

#: Appears only inside the band-7 model answer of the modern set's Part 2 card. If this
#: ever comes back during a mock, exam conditions have leaked.
MODEL_ONLY = "the last train had already gone"


def _p1(card_id: str, set_id: str, topic: str, questions: list[str], **extra: Any) -> dict:
    return {
        "id": card_id,
        "part": 1,
        "card_set_id": set_id,
        "topic_id": "topic_transport",
        "title": topic,
        "difficulty": "core",
        "tags_json": json.dumps(["transport", "daily-life"]),
        "payload_json": json.dumps(
            {
                "schema_version": 2,
                "id": card_id,
                "part": 1,
                "topic": topic,
                "questions": questions,
                **extra,
            }
        ),
    }


P2_TEACHING = {
    "band_move": "Put the journey in one clear past frame and keep it there for two minutes.",
    "transfer_drill": "Retell the same journey in ninety seconds without the word 'then'.",
    "error_watchlist": [
        {
            "pattern": "present for past narration",
            "wrong": "So I go to the station and I see the platform is empty",
            "right": "So I went to the station and saw the platform was empty",
            "why": "A story told in the present reads as a translated script, not narration.",
            "criterion": "GRA",
        }
    ],
    "prep_plan": {"idea_prompt": "One journey. Where, when, what went wrong.", "trap": "Do not list every stop."},
    "model_answers": [
        {
            "band_target": 7,
            "label": "one way to say it",
            "transcript": f"I want to talk about a journey home that went wrong. {MODEL_ONLY}, "
            "so I ended up walking most of the way across town.",
            "what_lifts_it": [{"criterion": "GRA", "point": "past perfect used once, and used well"}],
        }
    ],
}

P3_TEACHING = {
    "band_move": "Answer the general question generally, then land one concrete example.",
}

CARDS = [
    _p1(
        M_P1_PERSONAL,
        MODERN_SET,
        "your work or studies, and where you live",
        ["Do you work or are you a student?", "What do you like about where you live?"],
        frame_tier=1,
        frame_kind="personal",
    ),
    _p1(
        M_P1_TOPIC_A,
        MODERN_SET,
        "getting around",
        ["How do you usually travel to work or college?", "Has that changed recently?"],
        frame_tier=2,
        frame_kind="topic",
    ),
    _p1(
        M_P1_TOPIC_B,
        MODERN_SET,
        "weekends",
        ["What do you normally do at the weekend?", "Do you prefer to plan or decide on the day?"],
        frame_tier=3,
        frame_kind="topic",
    ),
    {
        "id": M_P2,
        "part": 2,
        "card_set_id": MODERN_SET,
        "topic_id": "topic_transport",
        "title": "a journey you remember",
        "difficulty": "core",
        "tags_json": json.dumps(["transport", "narrative"]),
        "payload_json": json.dumps(
            {
                "schema_version": 2,
                "id": M_P2,
                "part": 2,
                "topic": "a journey you remember",
                "family": "F7",
                "cue_card": {
                    "topic": "Describe a journey you remember for the wrong reasons.",
                    "bullets": [
                        "where you were going",
                        "who you were with",
                        "what went wrong",
                        "and explain what you would do differently now.",
                    ],
                    "rounding_off": [
                        "Would you make that journey again?",
                        "Did anyone else find it as difficult as you did?",
                    ],
                },
                "teaching": P2_TEACHING,
            }
        ),
    },
    {
        "id": M_P3,
        "part": 3,
        "card_set_id": MODERN_SET,
        "topic_id": "topic_transport",
        "title": "how people travel",
        "difficulty": "stretch",
        "tags_json": json.dumps(["transport", "society"]),
        "payload_json": json.dumps(
            {
                "schema_version": 2,
                "id": M_P3,
                "part": 3,
                "topic": "how people travel",
                "part3_themes": [
                    {
                        "title": "why journeys go wrong",
                        "counterpoint": "most delays are nobody's fault",
                        "questions": [
                            "Why do you think public transport is unreliable in some places?",
                            "Who should be responsible when a service fails?",
                        ],
                    },
                    {
                        "title": "how travel is changing",
                        "counterpoint": "people will always prefer their own car",
                        "questions": [
                            "How has the way people travel changed in the last twenty years?",
                            "Do you think cities will be easier or harder to move around in future?",
                        ],
                    },
                ],
                "teaching": P3_TEACHING,
            }
        ),
    },
    # --- the legacy-shaped set: no frame_kind, no frame_tier, no teaching -------------
    _p1(L_P1_A, LEGACY_SET, "your street", ["Is your street a quiet one?", "Has it changed?"]),
    _p1(L_P1_B, LEGACY_SET, "local shops", ["Where do you do your shopping?", "Is it convenient?"]),
    {
        "id": L_P2,
        "part": 2,
        "card_set_id": LEGACY_SET,
        "topic_id": "topic_housing",
        "title": "a shop you like",
        "difficulty": "core",
        "tags_json": json.dumps(["shopping"]),
        "payload_json": json.dumps(
            {
                "schema_version": 1,
                "id": L_P2,
                "part": 2,
                "topic": "a shop you like",
                "cue_card": {
                    "topic": "Describe a shop near you that you like going to.",
                    "bullets": ["where it is", "what it sells", "how often you go",
                                "and explain why you like it."],
                    "rounding_off": ["Do many people use it?", "Has it been there long?"],
                },
            }
        ),
    },
    {
        "id": L_P3,
        "part": 3,
        "card_set_id": LEGACY_SET,
        "topic_id": "topic_housing",
        "title": "high streets",
        "difficulty": "stretch",
        "tags_json": json.dumps(["shopping"]),
        "payload_json": json.dumps(
            {
                "schema_version": 1,
                "id": L_P3,
                "part": 3,
                "topic": "high streets",
                "part3_themes": [
                    {
                        "title": "small shops and big chains",
                        "questions": ["Why do small shops struggle?", "Does it matter if they close?"],
                    }
                ],
            }
        ),
    },
]

MODERN_SET_PAYLOAD = {
    "schema_version": 2,
    "difficulty": "core",
    "tags": ["transport", "narrative"],
    "part1_card_ids": [M_P1_PERSONAL, M_P1_TOPIC_A, M_P1_TOPIC_B],
    "part2_card_id": M_P2,
    "part3_card_id": M_P3,
    "family": "F7",
    "cognitive_load": None,
    "lineage": "Part 2 is one journey that went wrong; Part 3 widens to reliability and change.",
    "language_bank": {
        "warning": "Frames with gaps, not lines to recite.",
        "functions": [
            {
                "function": "narrating",
                "why_here": "The card is a story and the tense has to hold.",
                "grammar": "past simple with one past perfect backshift",
                "frames": [{"frame": "By the time I ___, they'd already ___",
                            "slot_hint": "two past events"}],
                "avoid": "I would like to describe a memorable journey of my life.",
            }
        ],
    },
    "vocabulary": [
        {
            "item": "a knock-on effect",
            "type": "collocation",
            "cefr": "B2",
            "meaning": "one delay causing further delays",
            "example": "One cancellation had a knock-on effect all evening.",
            "used_in": "part3",
        }
    ],
}

LEGACY_SET_PAYLOAD = {
    "schema_version": 1,
    "difficulty": "stretch",
    "tags": ["shopping"],
    "part1_card_ids": [L_P1_A, L_P1_B],
    "part2_card_id": L_P2,
    "part3_card_id": L_P3,
}


# ======================================================================================
# Fixtures
# ======================================================================================


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    from fastapi.testclient import TestClient

    from bandready import settings_store
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine
    from bandready.voice import runtime

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", "test-token")
    reset_settings_cache()
    db_engine.reset_engine()
    settings_store.invalidate_cache()
    runtime.reset()

    from bandready.server.app import create_app

    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
        test_client.headers.update({"Authorization": "Bearer test-token"})
        settings_store.patch_settings({"llm": {"preset": "mock_llm", "model": "mock-1"}})
        _seed()
        yield test_client

    runtime.reset()
    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def _seed() -> None:
    """Install the fixture pack and retire everything the content loader seeded.

    The shipped pack is 68 sets deep; leaving it in place would make "which set does
    least-recently-served pick" a question about production content rather than about
    this engine.
    """
    from sqlalchemy import text as sa_text

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(sa_text("UPDATE card_sets SET retired = 1"))
        s.execute(sa_text("UPDATE speaking_cards SET retired = 1"))
        s.merge(m.Topic(id="topic_transport", label="Transport", category="general"))
        s.merge(m.Topic(id="topic_housing", label="Housing", category="general"))
        s.flush()
        s.add(
            m.CardSet(
                id=MODERN_SET,
                title="Journeys that went wrong",
                topic_id="topic_transport",
                parts_json=json.dumps([1, 2, 3]),
                payload_json=json.dumps(MODERN_SET_PAYLOAD),
                source="pack",
            )
        )
        s.add(
            m.CardSet(
                id=LEGACY_SET,
                title="Shops and streets",
                topic_id="topic_housing",
                parts_json=json.dumps([1, 2, 3]),
                payload_json=json.dumps(LEGACY_SET_PAYLOAD),
                source="pack",
            )
        )
        for row in CARDS:
            s.add(m.SpeakingCard(**row, source="pack"))


def _start(client: Any, **body: Any) -> dict[str, Any]:
    response = client.post("/api/v1/speaking/mock/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _stage_keys(doc: dict[str, Any]) -> list[str]:
    return [s["key"] for s in doc["stages"]]


#: A whole sitting's worth of candidate speech, stamped part by part so the scorer and
#: the breakdown can tell which part a quote came from.
def _turns() -> list[dict[str, Any]]:
    def user(text: str, part: int, phase: str, t_ms: int, secs: float) -> dict[str, Any]:
        return {
            "role": "user",
            "text": text,
            "t_ms": t_ms,
            "part": part,
            "phase": phase,
            "segments": [{"t_start_ms": t_ms, "t_end_ms": t_ms + int(secs * 1000)}],
        }

    return [
        {"role": "assistant", "text": "Do you work or are you a student?", "t_ms": 0, "part": 1,
         "phase": "P1_QA"},
        user(
            "I am a student at the moment, I study civil engineering and I live with two "
            "friends in a flat near the university campus.",
            1, "P1_QA", 3_000, 9.0,
        ),
        {"role": "assistant", "text": "How do you usually travel to college?", "t_ms": 15_000,
         "part": 1, "phase": "P1_QA"},
        user(
            "Mostly I take the bus because parking is impossible, although when the weather "
            "is decent I cycle and it takes about the same time.",
            1, "P1_QA", 17_000, 10.0,
        ),
        {"role": "assistant", "text": "Describe a journey you remember for the wrong reasons.",
         "t_ms": 60_000, "part": 2, "phase": "P2_INTRO"},
        user(
            "The journey I want to describe was a trip back from my cousin's wedding last "
            "spring. We had booked the late train because the reception ran on, and by the "
            "time we reached the station the service had been cancelled with no announcement "
            "at all. I am agree with the idea that you should always have a plan B, and we "
            "did not, so we ended up walking across town for nearly an hour with a suitcase "
            "each. What I remember most is not the walk but how calm my sister stayed about "
            "the whole thing.",
            2, "P2_LONG_TURN", 130_000, 108.0,
        ),
        {"role": "assistant", "text": "Why is public transport unreliable in some places?",
         "t_ms": 300_000, "part": 3, "phase": "P3_DISCUSS"},
        user(
            "I think it comes down to investment, or the lack of it. Where services were sold "
            "off cheaply there were very much cars on the road and no incentive to run late "
            "buses, whereas cities that kept control tend to plan for the evening as well as "
            "the rush hour.",
            3, "P3_DISCUSS", 303_000, 22.0,
        ),
    ]


def _inject(client: Any, session_id: str) -> None:
    response = client.post(
        f"/api/v1/speaking/mock/sessions/{session_id}/transcript", json={"turns": _turns()}
    )
    assert response.status_code == 200, response.text


# ======================================================================================
# 1. Assembly coherence
# ======================================================================================


def test_part3_descends_from_the_part2_card_that_was_set(client: Any) -> None:
    """The property that separates a mock from three practices in a row."""
    doc = _start(client, card_set_id=MODERN_SET)
    sitting = doc["sitting"]

    assert sitting["part2_card_id"] == M_P2
    assert sitting["part3_card_id"] == M_P3

    p3_stages = [s for s in doc["stages"] if s["key"].startswith("p3_theme_")]
    assert p3_stages, "a sitting with no Part 3 is not a sitting"
    # Every Part 3 question came off the Part 3 card of the same set as the cue card.
    authored = {
        q
        for theme in json.loads(_payload(M_P3))["part3_themes"]
        for q in theme["questions"]
    }
    for stage in p3_stages:
        assert stage["card_id"] == M_P3
        assert set(stage["content"]["questions"]) <= authored


def _payload(card_id: str) -> str:
    return next(c["payload_json"] for c in CARDS if c["id"] == card_id)


def test_part1_opens_on_the_obligatory_personal_frame(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    frames = [s for s in doc["stages"] if s["key"].startswith("p1_frame_")]

    assert len(frames) == 3
    assert frames[0]["content"]["frame_kind"] == "personal"
    assert frames[0]["card_id"] == M_P1_PERSONAL
    # …and the intro comes before it, because the identity check is not a test question.
    assert _stage_keys(doc)[0] == "p1_intro"


def test_a_legacy_set_borrows_a_personal_frame_rather_than_opening_cold(client: Any) -> None:
    """The twelve legacy sets carry no ``frame_kind``; a mock must still open properly."""
    doc = _start(client, card_set_id=LEGACY_SET)
    frames = [s for s in doc["stages"] if s["key"].startswith("p1_frame_")]

    assert frames[0]["content"]["frame_kind"] == "personal"
    assert frames[0]["card_id"] == M_P1_PERSONAL  # borrowed from the other set
    assert doc["sitting"]["borrowed_part1_card_ids"] == [M_P1_PERSONAL]
    # The legacy set's own frames still run, so the sitting stays topical.
    assert [f["card_id"] for f in frames[1:]] == [L_P1_A, L_P1_B]


def test_part1_runs_two_or_three_frames_and_never_more(client: Any) -> None:
    two = _start(client, card_set_id=MODERN_SET, frames=2)
    assert len([s for s in two["stages"] if s["key"].startswith("p1_frame_")]) == 2
    client.post(f"/api/v1/speaking/mock/sessions/{two['session_id']}/abandon")

    three = _start(client, card_set_id=MODERN_SET, frames=3)
    assert len([s for s in three["stages"] if s["key"].startswith("p1_frame_")]) == 3

    assert client.post(
        "/api/v1/speaking/mock/sessions", json={"frames": 4}
    ).status_code == 422


def test_least_recently_served_makes_a_repeat_mock_a_different_sitting(client: Any) -> None:
    first = _start(client)
    client.post(f"/api/v1/speaking/mock/sessions/{first['session_id']}/abandon")
    second = _start(client)

    assert first["sitting"]["card_set_id"] != second["sitting"]["card_set_id"]


def test_a_seed_reproduces_the_same_sitting(client: Any) -> None:
    a = client.get("/api/v1/speaking/mock/plan", params={"seed": 4242}).json()
    b = client.get("/api/v1/speaking/mock/plan", params={"seed": 4242}).json()
    assert a["card_set_id"] == b["card_set_id"]
    assert a["part1_card_ids"] == b["part1_card_ids"]

    # …and the seed, not the serving order, is what decides it: serving the pack does not
    # move a seeded pick.
    _start(client, seed=4242)
    c = client.get("/api/v1/speaking/mock/plan", params={"seed": 4242}).json()
    assert c["card_set_id"] == a["card_set_id"]


def test_the_preview_does_not_consume_the_serving_order(client: Any) -> None:
    before = client.get("/api/v1/speaking/mock/plan").json()["card_set_id"]
    after = client.get("/api/v1/speaking/mock/plan").json()["card_set_id"]
    assert before == after


def test_a_set_without_a_part3_card_cannot_carry_a_mock(client: Any) -> None:
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(sa_text("UPDATE speaking_cards SET retired = 1 WHERE id = :id"), {"id": M_P3})

    doc = _start(client)
    assert doc["sitting"]["card_set_id"] == LEGACY_SET

    response = client.post(
        "/api/v1/speaking/mock/sessions", json={"card_set_id": MODERN_SET}
    )
    assert response.status_code in (404, 409)


def test_difficulty_selects_the_tier(client: Any) -> None:
    stretch = client.get(
        "/api/v1/speaking/mock/plan", params={"difficulty": "stretch"}
    ).json()
    assert stretch["card_set_id"] == LEGACY_SET
    assert stretch["difficulty"] == "stretch"

    core = client.get("/api/v1/speaking/mock/plan", params={"difficulty": "core"}).json()
    assert core["card_set_id"] == MODERN_SET

    challenging = client.get(
        "/api/v1/speaking/mock/plan", params={"difficulty": "challenging"}
    )
    assert challenging.status_code == 422  # the fixture pack has no challenging tier

    assert client.get(
        "/api/v1/speaking/mock/plan", params={"difficulty": "impossible"}
    ).status_code == 422


def test_the_plan_carries_no_teaching_material(client: Any) -> None:
    """The plan is the exam layer. Model answers, prep plans and counterpoints stay out."""
    doc = _start(client, card_set_id=MODERN_SET)
    # The stages are what the client renders during the sitting; the envelope around them
    # only names what is being withheld.
    blob = json.dumps({"stages": doc["stages"], "sitting": doc["sitting"]})

    assert MODEL_ONLY not in blob
    assert "band_move" not in blob
    assert "idea_prompt" not in blob
    assert "counterpoint" not in blob
    assert "most delays are nobody's fault" not in blob
    assert "Do not list every stop" not in blob  # the prep-plan trap
    assert "knock-on effect" not in blob  # the topic vocabulary


# ======================================================================================
# 2. Timing
# ======================================================================================


def test_the_whole_sitting_is_planned_inside_the_exam_window(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    timing = doc["timing"]

    assert mock.EXAM_WINDOW_MIN_S <= timing["total_s"] <= mock.EXAM_WINDOW_MAX_S
    assert timing["within_exam_window"] is True


def test_each_part_gets_its_researched_share_of_the_clock(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    by_part = doc["timing"]["by_part_s"]

    assert 240.0 <= by_part["1"] <= 300.0, "Part 1 runs 4–5 minutes"
    assert 180.0 <= by_part["2"] <= 240.0, "Part 2 runs 3–4 minutes including prep"
    assert 240.0 <= by_part["3"] <= 300.0, "Part 3 runs 4–5 minutes"


def test_prep_is_exactly_sixty_seconds_and_hard(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    prep = next(s for s in doc["stages"] if s["key"] == "p2_prep")

    assert prep["budget_s"] == 60.0
    assert prep["min_s"] == prep["max_s"] == 60.0
    assert prep["hard"] is True
    assert prep["examiner_silent"] is True


def test_the_long_turn_is_sixty_to_one_hundred_and_twenty_seconds(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    turn = next(s for s in doc["stages"] if s["key"] == "p2_long_turn")

    assert turn["min_s"] == 60.0
    assert turn["max_s"] == 120.0
    assert turn["hard"] is True
    assert turn["examiner_silent"] is True, "the examiner does not back-channel"


def test_the_stage_order_is_the_exam_order(client: Any) -> None:
    doc = _start(client, card_set_id=MODERN_SET)
    keys = _stage_keys(doc)

    assert keys[0] == "p1_intro"
    assert keys[-1] == "wrap_up"
    assert keys.index("p2_prep") < keys.index("p2_long_turn") < keys.index("p2_rounding")
    assert keys.index("p2_rounding") < keys.index("p3_theme_1")


# ======================================================================================
# 3. Exam conditions — the rule that makes a mock mean anything
# ======================================================================================


def _unlock_the_part2_card(session_id: str = "ss_unlock_910") -> None:
    """Leave behind a completed session that legitimately unlocks the Part 2 card."""
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
                ended_at="2026-07-20T10:00:00.000Z",
            )
        )
        s.add(
            m.SpeakingSession(
                id=session_id,
                mode="practice",
                part=2,
                card_set_id=MODERN_SET,
                state="WRAP_UP",
                status="complete",
                transcript_json=json.dumps(
                    {
                        "turns": [
                            {
                                "role": "user",
                                "card_id": M_P2,
                                "part": 2,
                                "text": "I remember one journey home that went completely wrong.",
                                "t_ms": 1000,
                            }
                        ]
                    }
                ),
            )
        )


def test_an_attempted_card_is_unlocked_until_a_mock_starts(client: Any) -> None:
    """The headline: the gate shuts for a card the learner has already earned."""
    _unlock_the_part2_card()

    before = client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()
    assert before["gate"]["unlocked"] is True
    assert before["model_answers"], "the fixture must be genuinely unlocked first"
    assert MODEL_ONLY in json.dumps(before)

    started = _start(client, card_set_id=MODERN_SET)

    during = client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching")
    assert during.status_code == 200
    doc = during.json()
    assert doc["gate"]["unlocked"] is False
    assert doc["gate"]["reason"] == "exam_conditions"
    assert doc["gate"]["mock_session_id"] == started["session_id"]
    assert doc["model_answers"] == []
    assert MODEL_ONLY not in json.dumps(doc)


def test_exam_conditions_withhold_every_coaching_route(client: Any) -> None:
    _unlock_the_part2_card()
    _start(client, card_set_id=MODERN_SET)

    assert client.get(f"/api/v1/speaking/coach/part2/plan/{M_P2}").status_code == 409
    assert client.get(f"/api/v1/speaking/coach/vocabulary/{MODERN_SET}").status_code == 409
    assert client.get("/api/v1/speaking/coach/language-bank").status_code == 409
    compare = client.post(
        "/api/v1/speaking/coach/compare",
        json={"card_id": M_P2, "transcript": "I went to the station and the train had gone.",
              "band_target": 7},
    )
    assert compare.status_code == 409
    assert "mock exam" in compare.json()["detail"]


def test_the_teaching_document_keeps_its_shape_while_locked(client: Any) -> None:
    """A dark tab, not a broken screen: the client renders the same document."""
    _start(client, card_set_id=MODERN_SET)
    doc = client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()

    for key in ("card_id", "part", "topic", "title", "functional_language", "vocabulary",
                "model_answers", "model_answer_bands", "structure_plan", "common_errors"):
        assert key in doc
    assert doc["vocabulary"] == []
    assert doc["functional_language"]["functions"] == []
    assert doc["exam_conditions"]["session_id"]
    assert set(doc["exam_conditions"]["withheld"]) >= {"model_answers", "vocabulary"}


def test_finishing_the_mock_reopens_the_coach(client: Any) -> None:
    _unlock_the_part2_card()
    started = _start(client, card_set_id=MODERN_SET)
    assert client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()["gate"][
        "unlocked"
    ] is False

    for _ in range(len(started["stages"])):
        client.post(f"/api/v1/speaking/mock/sessions/{started['session_id']}/advance",
                    json={"elapsed_s": 5.0})

    after = client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()
    assert after["gate"]["unlocked"] is True
    assert after["model_answers"]


def test_abandoning_the_mock_reopens_the_coach(client: Any) -> None:
    """Closing the laptop mid-sitting must not brick the teaching layer."""
    _unlock_the_part2_card()
    started = _start(client, card_set_id=MODERN_SET)

    response = client.post(f"/api/v1/speaking/mock/sessions/{started['session_id']}/abandon")
    assert response.status_code == 200
    assert response.json()["status"] == "abandoned"

    assert client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()["gate"][
        "unlocked"
    ] is True


def test_exam_conditions_are_reported_so_the_ui_can_grey_the_tab(client: Any) -> None:
    idle = client.get("/api/v1/speaking/mock/exam-conditions").json()
    assert idle["active"] is False and idle["coaching_available"] is True

    started = _start(client, card_set_id=MODERN_SET)
    live = client.get("/api/v1/speaking/mock/exam-conditions").json()
    assert live["active"] is True
    assert live["coaching_available"] is False
    assert live["session_id"] == started["session_id"]
    assert "model_answers" in live["withheld"]


def test_only_one_mock_may_be_in_progress(client: Any) -> None:
    _start(client, card_set_id=MODERN_SET)
    second = client.post("/api/v1/speaking/mock/sessions", json={"card_set_id": LEGACY_SET})
    assert second.status_code == 409
    assert "still in progress" in second.json()["detail"]


# ======================================================================================
# 4. The stage machine
# ======================================================================================


def test_the_sitting_reports_where_it_is_and_what_comes_next(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]

    state = client.get(f"/api/v1/speaking/mock/sessions/{sid}").json()
    assert state["stage"]["key"] == "p1_intro"
    assert state["stage"]["elapsed_s"] >= 0.0
    assert state["next"]["key"] == "p1_frame_1"
    assert state["progress"]["stages_total"] == len(started["stages"])
    assert state["progress"]["stage_index"] == 0

    moved = client.post(f"/api/v1/speaking/mock/sessions/{sid}/advance",
                        json={"elapsed_s": 22.0}).json()
    assert moved["stage"]["key"] == "p1_frame_1"
    assert moved["progress"]["stages_done"] == 1
    assert moved["log"][0]["duration_s"] == 22.0


def _advance_to(client: Any, sid: str, key: str, elapsed: float = 5.0) -> dict[str, Any]:
    """Walk the machine forward until ``key`` is the current stage."""
    state = client.get(f"/api/v1/speaking/mock/sessions/{sid}").json()
    for _ in range(40):
        if state["stage"] and state["stage"]["key"] == key:
            return state
        state = client.post(
            f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": elapsed}
        ).json()
    raise AssertionError(f"never reached {key}")


def test_a_long_turn_that_ran_to_115s_skips_the_rounding_off_questions(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _advance_to(client, sid, "p2_long_turn")

    result = client.post(
        f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 116.0}
    ).json()

    assert result["stage"]["key"] == "p3_theme_1", "Part 2 is out of clock; go to Part 3"
    assert any(e["type"] == "rounding_off_skipped" for e in result["events"])
    skipped = next(e for e in result["log"] if e["key"] == "p2_rounding")
    assert skipped["skipped"] is True
    assert "116.0s" in skipped["skip_reason"]


def test_a_long_turn_that_stopped_short_still_gets_its_rounding_off(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _advance_to(client, sid, "p2_long_turn")

    result = client.post(
        f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 74.0}
    ).json()

    assert result["stage"]["key"] == "p2_rounding"
    assert result["stage"]["content"]["questions"] == [
        "Would you make that journey again?",
        "Did anyone else find it as difficult as you did?",
    ]
    assert not any(e["type"] == "rounding_off_skipped" for e in result["events"])


def test_the_skip_boundary_is_exactly_115_seconds(client: Any) -> None:
    for elapsed, expected in ((114.9, "p2_rounding"), (115.0, "p3_theme_1")):
        started = _start(client, card_set_id=MODERN_SET)
        sid = started["session_id"]
        _advance_to(client, sid, "p2_long_turn")
        result = client.post(
            f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": elapsed}
        ).json()
        assert result["stage"]["key"] == expected, f"{elapsed}s should lead to {expected}"
        client.post(f"/api/v1/speaking/mock/sessions/{sid}/abandon")


def test_the_long_turn_is_never_recorded_as_longer_than_two_minutes(client: Any) -> None:
    """The examiner stopped it at 2:00, so 2:00 is what happened."""
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _advance_to(client, sid, "p2_long_turn")

    result = client.post(
        f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 155.0}
    ).json()
    entry = next(e for e in result["log"] if e["key"] == "p2_long_turn")

    assert entry["duration_s"] == 120.0
    assert entry["hard_stopped"] is True


def test_the_examiner_may_skip_the_rounding_off_but_nothing_else(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _advance_to(client, sid, "p2_long_turn")

    result = client.post(
        f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 70.0, "skip": True}
    ).json()
    assert result["stage"]["key"] == "p3_theme_1"

    refused = client.post(
        f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 60.0, "skip": True}
    )
    assert refused.status_code == 422


def test_the_machine_records_every_stage_it_actually_ran(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    for _ in range(len(started["stages"])):
        final = client.post(
            f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 30.0}
        ).json()

    assert final["status"] == "complete"
    assert final["stage"] is None
    assert all(e["ended_at"] for e in final["log"])
    assert len(final["log"]) == len(started["stages"])


def test_a_finished_mock_cannot_be_advanced(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    for _ in range(len(started["stages"])):
        client.post(f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 1.0})

    response = client.post(f"/api/v1/speaking/mock/sessions/{sid}/advance", json={})
    assert response.status_code == 409


def test_an_unknown_sitting_is_a_404(client: Any) -> None:
    assert client.get("/api/v1/speaking/mock/sessions/ss_nope").status_code == 404


def test_a_live_mock_reuses_the_existing_webrtc_signalling(client: Any) -> None:
    """A mock is a speaking session with a stricter script — not a second call stack."""
    from bandready.voice import runtime

    doc = _start(client, card_set_id=MODERN_SET, live=True)
    sid = doc["session_id"]

    assert doc["live"] is True
    assert doc["offer_url"] == f"/api/v1/speaking/sessions/{sid}/offer"
    assert doc["events_url"] == f"/api/v1/speaking/sessions/{sid}/events"

    live = runtime.get(sid)
    assert live is not None and live.activity == "full_mock"
    # The examiner's own bundle carries the sparring material the plan withholds.
    assert live.bundle.part2.topic.startswith("Describe a journey")
    assert live.bundle.part2.rounding_off == [
        "Would you make that journey again?",
        "Did anyone else find it as difficult as you did?",
    ]
    assert [t.title for t in live.bundle.part3] == [
        "why journeys go wrong", "how travel is changing"
    ]
    assert live.bundle.part3[0].counterpoint == "most delays are nobody's fault"
    assert len(live.bundle.part1) == 3

    # …and the sidecar still runs one session at a time.
    client.post(f"/api/v1/speaking/mock/sessions/{sid}/abandon")
    assert client.post(
        "/api/v1/speaking/mock/sessions", json={"live": True}
    ).status_code == 409


# ======================================================================================
# 5. Whole-test scoring
# ======================================================================================


def _sit_and_score(client: Any, long_turn_s: float = 108.0) -> dict[str, Any]:
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _advance_to(client, sid, "p2_long_turn", elapsed=40.0)
    client.post(f"/api/v1/speaking/mock/sessions/{sid}/advance",
                json={"elapsed_s": long_turn_s})
    for _ in range(len(started["stages"])):
        state = client.get(f"/api/v1/speaking/mock/sessions/{sid}").json()
        if state["stage"] is None:
            break
        client.post(f"/api/v1/speaking/mock/sessions/{sid}/advance", json={"elapsed_s": 120.0})
    _inject(client, sid)
    response = client.post(f"/api/v1/speaking/mock/sessions/{sid}/score")
    assert response.status_code == 200, response.text
    return response.json()


def test_the_score_is_one_band_set_for_the_whole_sitting(client: Any) -> None:
    report = _sit_and_score(client)

    assert report["scored_as"] == "whole_test"
    assert set(report["criteria"]) == {"fc", "lr", "gra", "pron"}
    assert report["overall_band"] is not None
    assert "no Part 2 score" in report["whole_test_note"]


def test_the_overall_band_is_recomputed_server_side(client: Any) -> None:
    from bandready.scoring.speaking import round_ielts

    report = _sit_and_score(client)
    bands = [
        block["band"] for block in report["criteria"].values() if block["band"] is not None
    ]

    assert report["overall_band"] == round_ielts(sum(bands) / len(bands))


def test_the_part_breakdown_says_where_the_evidence_was(client: Any) -> None:
    report = _sit_and_score(client)
    breakdown = {row["part"]: row for row in report["part_breakdown"]}

    assert set(breakdown) == {1, 2, 3}
    assert breakdown[2]["cards"] == [M_P2]
    assert breakdown[3]["cards"] == [M_P3]
    assert breakdown[1]["cards"], "Part 1 sat at least one frame"

    # Every part carried speech, so every part gets a measured signal and a verdict.
    for row in report["part_breakdown"]:
        assert row["words"] > 0
        assert row["strength_index"] is not None
        assert 0.0 <= row["strength_index"] <= 100.0
        assert row["verdict"]

    assert report["strongest_part"] in (1, 2, 3)
    assert report["weakest_part"] in (1, 2, 3)
    assert report["strongest_part"] != report["weakest_part"]


def test_evidence_is_attributed_to_the_part_it_was_spoken_in(client: Any) -> None:
    """The scorer quotes the candidate; the breakdown says which part the quote is from."""
    report = _sit_and_score(client)
    by_part = {row["part"]: row for row in report["part_breakdown"]}

    # "I am agree with this idea" is the fixture scorer's GRA error; the candidate said
    # "I am agree with the idea" inside the long turn.
    part2_errors = " ".join(e["quote"] for e in by_part[2]["errors"])
    part3_errors = " ".join(e["quote"] for e in by_part[3]["errors"])
    assert "I am agree" in part2_errors
    assert "very much cars" in part3_errors, "that phrase was only ever said in Part 3"


def test_a_part_the_candidate_barely_spoke_in_gets_no_flattering_number(client: Any) -> None:
    """Three careful sentences are not a strong Part 3 — they are no evidence at all."""
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    thin = [t for t in _turns() if t.get("part") != 3]
    thin.append(
        {
            "role": "user",
            "part": 3,
            "phase": "P3_DISCUSS",
            "text": "Yes, probably.",
            "t_ms": 303_000,
            "segments": [{"t_start_ms": 303_000, "t_end_ms": 304_500}],
        }
    )
    client.post(f"/api/v1/speaking/mock/sessions/{sid}/transcript", json={"turns": thin})

    report = client.post(f"/api/v1/speaking/mock/sessions/{sid}/score").json()
    part3 = next(row for row in report["part_breakdown"] if row["part"] == 3)

    assert part3["strength_index"] is None
    assert "too little speech" in part3["verdict"]
    assert part3["words"] < part3["assessable_from_words"]
    # …and the parts that did carry speech are still ranked against each other.
    assert report["strongest_part"] in (1, 2)
    assert report["weakest_part"] in (1, 2)


def test_next_actions_name_the_cards_that_were_sat(client: Any) -> None:
    report = _sit_and_score(client)
    actions = report["next_actions"]

    assert actions, "a mock that suggests nothing is a mock that taught nothing"
    assert any(a.get("card_id") == M_P2 for a in actions)
    texts = " ".join(a["action"] for a in actions)
    assert "one clear past frame" in texts, "the Part 2 card's own band move"
    assert all(a["action"].strip() for a in actions)


def test_the_report_records_the_sitting_and_its_actual_timing(client: Any) -> None:
    report = _sit_and_score(client, long_turn_s=118.0)
    timing = report["sitting"]["timing"]

    assert report["sitting"]["card_set_id"] == MODERN_SET
    assert timing["long_turn_s"] == 118.0
    assert timing["rounding_off_skipped"] is True
    assert timing["long_turn_reached_min"] is True
    assert next(s["key"] for s in timing["stages"]) == "p1_intro"
    assert any(s["planned_s"] is not None for s in timing["stages"])


def test_scoring_a_sitting_with_no_speech_is_refused(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    response = client.post(
        f"/api/v1/speaking/mock/sessions/{started['session_id']}/score"
    )
    assert response.status_code == 422


def test_scoring_finishes_the_sitting_and_reopens_the_coach(client: Any) -> None:
    _unlock_the_part2_card()
    started = _start(client, card_set_id=MODERN_SET)
    sid = started["session_id"]
    _inject(client, sid)

    assert client.post(f"/api/v1/speaking/mock/sessions/{sid}/score").status_code == 200
    assert client.get(f"/api/v1/speaking/mock/sessions/{sid}").json()["status"] == "complete"
    assert client.get(f"/api/v1/speaking/coach/cards/{M_P2}/teaching").json()["gate"][
        "unlocked"
    ] is True


# ======================================================================================
# 6. History
# ======================================================================================


def test_history_plots_a_real_mock_trajectory(client: Any) -> None:
    first = _sit_and_score(client)
    second = _sit_and_score(client)

    history = client.get("/api/v1/speaking/mock/sessions").json()
    assert history["count"] == 2
    assert history["scored"] == 2
    assert [i["session_id"] for i in history["items"]] == [
        second["session_id"], first["session_id"]
    ]
    assert history["latest_band"] == second["overall_band"]
    assert len(history["trajectory"]) == 2
    assert all(point["overall_band"] is not None for point in history["trajectory"])
    assert history["items"][0]["long_turn_s"] == 108.0
    assert history["items"][0]["card_set_title"] == "Journeys that went wrong"


def test_history_shows_an_abandoned_sitting_for_what_it_was(client: Any) -> None:
    started = _start(client, card_set_id=MODERN_SET)
    client.post(f"/api/v1/speaking/mock/sessions/{started['session_id']}/abandon")

    item = client.get("/api/v1/speaking/mock/sessions").json()["items"][0]
    assert item["status"] == "abandoned"
    assert item["overall_band"] is None


# ======================================================================================
# 7. Pure logic
# ======================================================================================


def test_build_stages_gives_every_stage_a_budget_and_an_order() -> None:
    frames = [
        {"card_id": "a", "topic": "work", "questions": ["q1"], "frame_kind": "personal",
         "frame_tier": 1},
        {"card_id": "b", "topic": "food", "questions": ["q2"], "frame_kind": "topic",
         "frame_tier": 2},
    ]
    cue = {"card_id": "c", "topic": "Describe a meal.", "bullets": ["where", "when"],
           "rounding_off": ["Do you cook often?"]}
    themes = [{"card_id": "d", "title": "eating out", "questions": ["Why?"]}]

    stages = mock.build_stages(frames, cue, themes)

    assert [s["index"] for s in stages] == list(range(len(stages)))
    assert all(s["budget_s"] > 0 for s in stages)
    assert [s["part"] for s in stages][-1] is None  # wrap-up belongs to no part


def test_the_default_budgets_fit_the_exam_window() -> None:
    """A regression guard on the constants themselves, with no database involved."""
    frames = [
        {"card_id": f"f{i}", "topic": "t", "questions": ["q"], "frame_kind": None,
         "frame_tier": None}
        for i in range(3)
    ]
    cue = {"card_id": "c", "topic": "t", "bullets": ["b"], "rounding_off": ["r"]}
    themes = [{"card_id": "d", "title": "t", "questions": ["q"]} for _ in range(2)]

    total = sum(s["budget_s"] for s in mock.build_stages(frames, cue, themes))
    assert mock.EXAM_WINDOW_MIN_S <= total <= mock.EXAM_WINDOW_MAX_S


def test_the_skip_threshold_matches_the_researched_number() -> None:
    assert mock.ROUNDING_SKIP_AT_S == 115.0
    assert mock.TIMINGS.part2_prep_s == 60.0
    assert mock.TIMINGS.part2_talk_min_s == 60.0
    assert mock.TIMINGS.part2_talk_max_s == 120.0
    assert (mock.PART1_FRAMES_MIN, mock.PART1_FRAMES_MAX) == (2, 3)


def test_installing_the_guards_twice_does_not_double_wrap() -> None:
    mock.install_exam_conditions_guards()
    assert mock.install_exam_conditions_guards() is False
