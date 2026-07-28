"""Listening coach tests: the gate, the strategy card, predictions, replay.

Four properties are load-bearing and each is tested from more than one angle:

1. **The transcript and everything anchored to it are gated on a submitted attempt
   covering that script.** This is a wider gate than reading's and the difference is the
   point: a reading passage sits on the learner's screen throughout the attempt, but a
   listening transcript never does and every keyed answer is a verbatim span of it. So the
   gate is tested against every path that could open it wrongly — another script's
   attempt, an attempt still in progress, and a live mock (which shuts it even for a part
   sat and legitimately unlocked earlier).
2. **The preparation half is never gated and always mock-gated.** Strategy cards, the cue
   table, the preview protocol and the pre-teach glosses are worth most *before* the audio
   plays, so an unattempted script still returns them; a sitting still refuses them,
   because during a sitting nothing is preparation.
3. **Prediction is split down the middle.** The cue that fixes the slot is printed on the
   learner's own page and comes back open; the authored slot is the answer to the exercise
   and waits. That split is what keeps the strongest technique in the module a technique
   rather than a page somebody skimmed.
4. **Replay is precise.** The windows come from the real ``timing.json`` the stitcher
   wrote, ordered signpost → decoy → answer, so the learner hears the three seconds where
   the mark was lost rather than being told about them.

The fixture pack is two tests we control completely, four parts and forty questions each,
numbered contiguously across the paper — so "what does the gate open" is a question about
this engine rather than about production content. Everything runs with no TTS engine and
no network, on the hidden mock providers.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

TOKEN = "listening-coach-token"

TEST_1 = "lt_mk_01"
TEST_2 = "lt_mk_02"
BARE_SCRIPT = "ls_mk_bare"

#: ``(test_id, title, [(script_id, part, title, accent), …])``
PACK: list[tuple[str, str, list[tuple[str, int, str, str]]]] = [
    (
        TEST_1,
        "IELTS-style Listening — practice paper 1",
        [
            ("ls_mk_01_p1", 1, "Booking a cottage", "uk"),
            ("ls_mk_01_p2", 2, "The harbour walk", "au"),
            ("ls_mk_01_p3", 3, "Tutorial on kiln surveys", "uk"),
            ("ls_mk_01_p4", 4, "Lecture: salt marsh sediment", "us"),
        ],
    ),
    (
        TEST_2,
        "IELTS-style Listening — practice paper 2",
        [
            ("ls_mk_02_p1", 1, "Joining the ferry club", "uk"),
            ("ls_mk_02_p2", 2, "The estuary trail", "au"),
            ("ls_mk_02_p3", 3, "Tutorial on tidal records", "uk"),
            ("ls_mk_02_p4", 4, "Lecture: lime burning", "us"),
        ],
    ),
]

#: Five completion answers and five letter answers per part, which is a realistic split
#: and — more usefully here — makes the marker exercise both of its branches.
LETTERS = ("A", "B", "C")


# ======================================================================================
# The fixture pack — original scripts, authored teaching, exactly 40 questions a paper
# ======================================================================================


def _line(speaker: str, text: str, pause_after_ms: int = 100) -> dict[str, Any]:
    return {"speaker": speaker, "text": text, "pause_after_ms": pause_after_ms}


def build_script(
    script_id: str,
    part: int,
    title: str,
    numbers: list[int],
    accent: str,
    *,
    teaching: bool = True,
) -> dict[str, Any]:
    """One part: ten questions, three lines each, teaching at all three depths.

    The line layout is fixed and every teaching field points into it, which is what lets
    the replay assertions check real offsets rather than a shape:

        0            narrator preview
        1            narrator cue
        2 + 3i       the signpost line
        3 + 3i       the decoy line
        4 + 3i       the answer line — this is ``cue_line_index``
        2 + 3n       narrator close
    """
    first, last = numbers[0], numbers[-1]
    lines: list[dict[str, Any]] = [
        _line(
            "narrator",
            f"Part {part}. First, look at questions {first} to {last}.",
            3000,
        ),
        _line("narrator", f"Now listen and answer questions {first} to {last}.", 500),
    ]
    questions: list[dict[str, Any]] = []
    for index, number in enumerate(numbers):
        letter_type = index >= 5
        signpost_index = 2 + 3 * index
        decoy_index = signpost_index + 1
        cue_index = signpost_index + 2
        trapped = index % 2 == 0

        lines.append(_line("s1", f"Right, the next thing is item {number}."))
        lines.append(_line("s2", f"We nearly said decoy{number} there."))
        if letter_type:
            keyed = LETTERS[index % len(LETTERS)]
            lines.append(_line("s1", f"Let us go with option {keyed} for {number}."))
        else:
            lines.append(_line("s1", f"So the one you want is answer{number}."))

        item_teaching: dict[str, Any] | None = None
        if teaching:
            item_teaching = {
                "schema_version": 1,
                "prediction": {
                    "slot": "letter" if letter_type else "noun_singular",
                    "cue": None if letter_type else "the",
                    "range": None,
                    "note": (
                        "Three options, all of them spoken. Wait for the verb that settles it."
                        if letter_type
                        else "A single noun after 'the'. One word, no article."
                    ),
                },
                "signpost": {
                    "phrase": "the next thing is",
                    "line_index": signpost_index,
                    "kind": "imminent",
                },
                "answer_quote": (
                    f"option {LETTERS[index % len(LETTERS)]}"
                    if letter_type
                    else f"answer{number}"
                ),
                "paraphrase_link": (
                    None
                    if letter_type
                    else {
                        "printed": f"item {number}",
                        "audio": f"the one you want is answer{number}",
                        "note": "The printed noun is never spoken; the speaker names it another way.",
                    }
                ),
                "distraction": (
                    {
                        "trap": "self_correction" if not letter_type else "all_options_named",
                        "decoy": f"decoy{number}",
                        "decoy_line_index": decoy_index,
                        "signal": "we nearly said",
                        "note": "The first value is withdrawn in the same breath. Take the second.",
                    }
                    if trapped
                    else None
                ),
                "form": (
                    {"risk": "spelling", "note": "Seven letters and a digit. Copy, do not guess."}
                    if not letter_type
                    else None
                ),
                "recovery": (
                    "If this one went past, wait for the next 'right, the next thing' and "
                    "rejoin there."
                ),
                "option_diagnosis": (
                    [
                        {
                            "option": letter,
                            "verdict": "keyed" if letter == LETTERS[index % 3] else "wrong",
                            "heard_at": decoy_index,
                            "why_tempting": "It is spoken aloud, like all three.",
                            "why_wrong": "Nothing in the exchange endorses it.",
                        }
                        for letter in LETTERS
                    ]
                    if letter_type
                    else None
                ),
            }

        question: dict[str, Any] = {
            "n": number,
            "type": "multiple_choice" if letter_type else "note_completion",
            "instruction": (
                "Choose the correct letter, A, B or C."
                if letter_type
                else "Write ONE WORD for each answer."
            ),
            "word_limit": None if letter_type else {"words": 1, "numbers": 0},
            "prompt": (
                f"Question {number}: which option was chosen?"
                if letter_type
                else f"The item {number} is the ______"
            ),
            "answers": [[LETTERS[index % len(LETTERS)]]] if letter_type else [[f"answer{number}"]],
            "cue_line_index": cue_index,
            "explanation": (
                f"Predict a letter; the signpost announces it; the speaker endorses "
                f"{LETTERS[index % len(LETTERS)]}; every option is spoken; write the letter."
                if letter_type
                else f"Predict a noun; 'the next thing is' announces it; the speaker says "
                f"answer{number}; decoy{number} came first; write one word."
            ),
        }
        if letter_type:
            question["options"] = {letter: f"Option {letter}" for letter in LETTERS}
        if item_teaching is not None:
            question["teaching"] = item_teaching
        questions.append(question)

    close_index = 2 + 3 * len(numbers)
    lines.append(
        _line("narrator", f"That is the end of part {part}.", 1000)
    )

    document: dict[str, Any] = {
        "schema_version": 1,
        "part": part,
        "title": title,
        "scenario": f"A fixture recording used by the listening coach tests (part {part}).",
        "accent_set": accent,
        "target_band": 6.5,
        "speakers": [
            {"id": "narrator", "name": "Narrator", "role": "narrator", "accent": accent},
            {"id": "s1", "name": "Speaker one", "role": "female_1", "accent": accent},
            {"id": "s2", "name": "Speaker two", "role": "male_1", "accent": accent},
        ],
        "lines": lines,
        "questions": questions,
    }
    if not teaching:
        return document

    document["groups"] = [
        {
            "id": "g1",
            "type": "note_completion",
            "instruction": "Write ONE WORD for each answer.",
            "questions": numbers[:5],
            "teaching": {
                "schema_version": 1,
                "answer_order": "sequential",
                "order_note": "The five gaps fill top to bottom. A gap you go past is gone.",
                "strategy": (
                    "Every answer here is announced by the same phrase, so listen for the "
                    "marker rather than for the topic, and write only the burst after it."
                ),
                "preview_focus": "Slot-type all five gaps, then read the last one so you know where the set ends.",
                "watch_out": "Four of the five are transcription. You lose them to spelling, not to hearing.",
                "spatial_cues": [],
                "bank_note": None,
            },
        },
        {
            "id": "g2",
            "type": "multiple_choice",
            "instruction": "Choose the correct letter, A, B or C.",
            "questions": numbers[5:],
            "teaching": {
                "schema_version": 1,
                "answer_order": "sequential",
                "order_note": "Five stems, in the order they are settled.",
                "strategy": (
                    "All three options are spoken for every stem, so hearing an option "
                    "proves nothing. Listen for the verb that endorses one."
                ),
                "preview_focus": "Reduce each option to a property before the audio starts.",
                "watch_out": "The option raised first is the one that was withdrawn.",
                "spatial_cues": [],
                "bank_note": None,
            },
        },
    ]
    document["teaching"] = {
        "schema_version": 1,
        "what_makes_this_hard": {
            "levers": ["distraction_density", "cue_answer_distance"],
            "note": "Nothing here is hard to hear. Half the answers are the second value offered.",
            "hardest_question": numbers[-1],
            "why_hardest": "Every option is spoken and the endorsement is the quietest line.",
            "unused": "ignored",
        },
        "pre_teach": [
            {
                "item": "the next thing is",
                "gloss": "an answer is arriving now",
                "line_index": 2,
                "blocks_q": numbers[0],
            },
            {
                "item": "we nearly said",
                "gloss": "what follows was considered and dropped",
                "line_index": 3,
                "blocks_q": numbers[0],
            },
        ],
        "pause_plan": {
            "blocks": [
                {
                    "questions": numbers,
                    "orient_line_index": 0,
                    "preview_line_index": 0,
                    "preview_ms": 3000,
                    "cue_line_index": 1,
                }
            ],
            "close_line_index": close_index,
            "check_ms": 1000,
            "whole_test_intro": part == 1,
        },
        "signpost_map": [
            {"line_index": 2 + 3 * i, "phrase": "the next thing is", "kind": "imminent"}
            for i in range(len(numbers))
        ],
        "accent_note": (
            "Australian vocabulary and conventions with an approximated voice."
            if accent == "au"
            else None
        ),
        "metrics": {
            "spoken_words": 220,
            "words_per_answer": 22,
            "trapped_items": 5,
            "clean_items": 5,
            "spelled_out_answers": 1,
            "speakers": 2,
            "longest_line_chars": 60,
        },
    }
    return document


def answer_key(test_id: str) -> dict[str, str]:
    """The whole paper's key, recomputed from the same rules the builder used."""
    key: dict[str, str] = {}
    for block in script_numbers(test_id).values():
        for index, number in enumerate(block):
            key[str(number)] = (
                LETTERS[index % len(LETTERS)] if index >= 5 else f"answer{number}"
            )
    return key


def script_numbers(test_id: str) -> dict[str, list[int]]:
    entry = next(t for t in PACK if t[0] == test_id)
    out: dict[str, list[int]] = {}
    for position, (script_id, _part, _title, _accent) in enumerate(entry[2]):
        out[script_id] = list(range(position * 10 + 1, position * 10 + 11))
    return out


def seed_pack() -> None:
    """Retire the shipped listening content and install two papers we control."""
    from sqlalchemy import text as sa_text

    from bandready.content import generate_listening as gen
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(sa_text("UPDATE listening_tests SET retired = 1"))
        s.execute(sa_text("UPDATE listening_scripts SET retired = 1"))

    with session_scope() as s:
        for test_id, title, parts in PACK:
            numbering = script_numbers(test_id)
            script_ids: list[str] = []
            for script_id, part, script_title, accent in parts:
                document = build_script(
                    script_id, part, script_title, numbering[script_id], accent
                )
                gen.persist_script(s, document, script_id=script_id, source="pack")
                script_ids.append(script_id)
            s.add(
                m.ListeningTest(
                    id=test_id,
                    title=title,
                    p1_id=script_ids[0],
                    p2_id=script_ids[1],
                    p3_id=script_ids[2],
                    p4_id=script_ids[3],
                    source="pack",
                    license="CC-BY-4.0",
                )
            )
        # One part authored before the teaching pass, so "no teaching yet" is exercised as
        # a rendered screen rather than as a 500.
        gen.persist_script(
            s,
            build_script(BARE_SCRIPT, 1, "A part with no teaching", list(range(1, 11)), "uk", teaching=False),
            script_id=BARE_SCRIPT,
            source="pack",
        )


# ======================================================================================
# Fixtures
# ======================================================================================


@pytest.fixture()
def client(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from bandready import settings_store
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    monkeypatch.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
    monkeypatch.setenv("BANDREADY_HOST", "127.0.0.1")
    monkeypatch.delenv("BANDREADY_PARENT_PID", raising=False)
    reset_settings_cache()
    db_engine.reset_engine()
    settings_store.invalidate_cache()

    from bandready.server.app import create_app

    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1") as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TOKEN}"})
        settings_store.patch_settings(
            {
                "llm": {
                    "preset": "mock_llm",
                    "engine": "mock",
                    "base_url": "mock://llm",
                    "model": "mock-model-1",
                },
                "tts": {
                    "preset": "mock_tts",
                    "engine": "mock",
                    "base_url": "mock://tts",
                    "voice": "mock_voice",
                },
            }
        )
        seed_pack()
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


# ======================================================================================
# Helpers
# ======================================================================================


def sit_script(
    client: TestClient, script_id: str, answers: dict[str, str] | None = None
) -> str:
    """Start, answer and submit a single-part attempt. Returns the attempt id."""
    created = client.post(
        "/api/v1/listening/attempts", json={"script_id": script_id, "mode": "practice"}
    )
    assert created.status_code == 201, created.text
    attempt_id = created.json()["attempt_id"]
    submitted = client.post(
        f"/api/v1/listening/attempts/{attempt_id}/submit",
        json={"answers": answers or {}},
    )
    assert submitted.status_code == 200, submitted.text
    return attempt_id


def sit_test(client: TestClient, test_id: str, answers: dict[str, str]) -> str:
    created = client.post(
        "/api/v1/listening/attempts", json={"test_id": test_id, "mode": "practice"}
    )
    assert created.status_code == 201, created.text
    attempt_id = created.json()["attempt_id"]
    submitted = client.post(
        f"/api/v1/listening/attempts/{attempt_id}/submit", json={"answers": answers}
    )
    assert submitted.status_code == 200, submitted.text
    return attempt_id


def teaching(client: TestClient, script_id: str) -> dict[str, Any]:
    response = client.get(f"/api/v1/listening/coach/scripts/{script_id}/teaching")
    assert response.status_code == 200, response.text
    return response.json()


def render(script_id: str) -> dict[str, Any]:
    """Render one part through the mock TTS provider, synchronously."""
    from bandready.audio import tts_render
    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.get(m.ListeningScript, script_id)
        document = json.loads(row.script_json)
    return asyncio.run(tts_render.render_script(document, script_id=script_id))


P1 = "ls_mk_01_p1"
P2 = "ls_mk_01_p2"


# ======================================================================================
# 1. The gate
# ======================================================================================


def test_the_transcript_is_absent_before_an_attempt(client: TestClient) -> None:
    """Not truncated, not summarised — absent, and the count says one exists.

    This is the whole feature. In listening the transcript IS the answer key: every keyed
    completion answer is a verbatim span of a spoken line, so a learner who reads the lines
    has the paper and cannot un-read them.
    """
    payload = teaching(client, P1)

    assert payload["gate"]["unlocked"] is False
    assert payload["gate"]["reason"] == "not_attempted"
    assert payload["transcript"]["locked"] is True
    assert payload["transcript"]["lines"] == []
    # The count survives so the UI can size a locked panel rather than render nothing.
    assert payload["transcript"]["line_count"] == 33
    assert "transcript" in payload["gate"]["gated_fields"]

    for question in payload["questions"]:
        assert question["locked"] is True
        assert question["timeline"] is None
    # …and it is advertised, so a locked card is renderable.
    assert payload["timelines_available"] == 10
    assert payload["question_count"] == 10


def test_the_preparation_half_survives_the_gate(client: TestClient) -> None:
    """Strategy, the pause plan and the pre-teach glosses are worth most beforehand.

    Withholding them would leave the coach with nothing at all to say to a learner who has
    not sat the part — which is precisely the learner it should be most useful to.
    """
    payload = teaching(client, P1)

    assert payload["gate"]["unlocked"] is False
    assert [g["group_id"] for g in payload["groups"]] == ["g1", "g2"]
    assert payload["groups"][0]["strategy"]
    assert payload["groups"][0]["preview_focus"]
    assert payload["groups"][0]["order_badge"] == "In recording order"
    assert payload["groups"][0]["type_page"]["label"] == "Note completion"
    assert payload["pause_plan"]["block_count"] == 1
    assert payload["pause_plan"]["preview_protocol"][1]["step"].startswith("Slot-type")
    assert payload["what_makes_this_hard"]["levers"][0]["slug"] == "distraction_density"
    assert payload["check_protocol"][0].startswith("Blanks first")

    # …but the two fields on a pre-teach entry that point at the audio do not.
    glosses = {entry["item"]: entry for entry in payload["pre_teach"]}
    assert glosses["the next thing is"]["gloss"] == "an answer is arriving now"
    assert glosses["the next thing is"]["line_index"] is None
    assert glosses["the next thing is"]["blocks_q"] is None
    assert payload["signpost_map"] == []
    assert payload["trap_profile"] == []


def test_a_submitted_attempt_opens_the_whole_timeline(client: TestClient) -> None:
    """The five moments, in the order the review screen walks them."""
    sit_script(client, P1, {"1": "answer1"})
    payload = teaching(client, P1)

    assert payload["gate"]["unlocked"] is True
    assert payload["gate"]["evidence"] == "script"
    assert payload["gate"]["gated_fields"] == []
    assert payload["transcript"]["locked"] is False
    assert len(payload["transcript"]["lines"]) == 33

    first = payload["questions"][0]
    timeline = first["timeline"]
    assert timeline["signpost"]["phrase"] == "the next thing is"
    assert timeline["signpost"]["kind"]["slug"] == "imminent"
    assert timeline["answer_quote"] == "answer1"
    assert timeline["cue_line_index"] == 4
    assert timeline["cue_text"] == "So the one you want is answer1."
    assert timeline["accepted_answers"] == [["answer1"]]
    assert timeline["paraphrase_link"]["printed"] == "item 1"
    assert timeline["distraction"]["trap"]["slug"] == "self_correction"
    assert timeline["distraction"]["trap"]["family"] == "C"
    assert timeline["decoy_text"] == "We nearly said decoy1 there."
    assert timeline["form"]["risk"]["slug"] == "spelling"
    assert timeline["recovery"]
    # The prediction is repeated inside the timeline so the renderer can walk one list.
    assert timeline["prediction"]["slot"]["slug"] == "noun_singular"

    # Letter types swap the trap panel for the option autopsy.
    letter_item = payload["questions"][5]
    assert letter_item["qtype"] == "multiple_choice"
    assert len(letter_item["timeline"]["option_diagnosis"]) == 3
    assert {row["option"] for row in letter_item["timeline"]["option_diagnosis"]} == {
        "A",
        "B",
        "C",
    }

    # The trap profile is the aggregate over the part, and it arrives with the rest.
    profile = {row["slug"]: row["count"] for row in payload["trap_profile"]}
    assert profile["self_correction"] == 3
    assert profile["all_options_named"] == 2
    assert len(payload["signpost_map"]) == 10


def test_another_scripts_attempt_does_not_open_this_one(client: TestClient) -> None:
    sit_script(client, P1, {"1": "answer1"})
    assert teaching(client, P2)["gate"]["unlocked"] is False
    assert teaching(client, P1)["gate"]["unlocked"] is True


def test_an_unsubmitted_attempt_does_not_open_the_gate(client: TestClient) -> None:
    """Mid-test is exactly when leaking the transcript does the most damage."""
    created = client.post(
        "/api/v1/listening/attempts", json={"script_id": P2, "mode": "exam"}
    )
    assert created.status_code == 201
    payload = teaching(client, P2)
    assert payload["gate"]["unlocked"] is False
    assert payload["gate"]["attempts"] == 0
    assert payload["transcript"]["lines"] == []


def test_a_whole_test_attempt_opens_all_four_parts(client: TestClient) -> None:
    sit_test(client, TEST_1, answer_key(TEST_1))
    for script_id in script_numbers(TEST_1):
        gate = teaching(client, script_id)["gate"]
        assert gate["unlocked"] is True, script_id
        assert gate["evidence"] == "test"
        assert gate["last_raw_score"] == 40


def test_a_script_with_no_teaching_renders_rather_than_raising(client: TestClient) -> None:
    """Absent-by-default: the four shipped parts carry no teaching object at all."""
    payload = teaching(client, BARE_SCRIPT)
    assert payload["teaching_available"] is False
    assert payload["timelines_available"] == 0
    assert payload["groups"] == []
    assert payload["pause_plan"] is None
    assert payload["question_count"] == 10
    # And the identity half still works, so the screen has something to draw.
    assert payload["title"] == "A part with no teaching"
    assert payload["part"] == 1


def test_an_unknown_script_is_a_404(client: TestClient) -> None:
    response = client.get("/api/v1/listening/coach/scripts/ls_nope/teaching")
    assert response.status_code == 404


# ======================================================================================
# 2. Strategy
# ======================================================================================


def test_strategy_is_not_gated_by_an_attempt(client: TestClient) -> None:
    """A strategy card says how to attack the type, never what was said."""
    response = client.get("/api/v1/listening/coach/strategy")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["answer_order"] == "sequential"
    assert body["order_badge"] == "In recording order"
    assert "conveyor belt" in body["order_contrast"]
    assert body["last_value_rule"].startswith("The answer is the last value")
    pages = {entry["qtype"]: entry for entry in body["types"]}
    # Every type in the app's vocabulary has a page, whether or not the pack uses it.
    assert "map_labelling" in pages
    assert pages["map_labelling"]["page"]["parts"] == [2]
    assert pages["note_completion"]["in_bank"] is True
    assert pages["note_completion"]["authored_groups"] == 8  # two papers, four parts each
    assert pages["note_completion"]["questions"] == 40


def test_strategy_filters_by_type_and_by_part(client: TestClient) -> None:
    by_type = client.get(
        "/api/v1/listening/coach/strategy", params={"type": "multiple_choice"}
    ).json()
    assert [entry["qtype"] for entry in by_type["types"]] == ["multiple_choice"]
    assert by_type["types"][0]["authored_groups"] == 8

    by_part = client.get("/api/v1/listening/coach/strategy", params={"part": 4}).json()
    assert by_part["part"] == 4
    for entry in by_part["types"]:
        for group in entry["groups"]:
            assert group["part"] == 4

    unknown = client.get(
        "/api/v1/listening/coach/strategy", params={"type": "matching_headings"}
    )
    assert unknown.status_code == 422
    assert "unknown question type" in unknown.json()["detail"]


def test_the_trap_taxonomy_keeps_form_losses_separate(client: TestClient) -> None:
    """Marks lost to spelling were heard. They need a different fix and a different table."""
    body = client.get("/api/v1/listening/coach/traps").json()

    assert body["count"] == 24
    families = {entry["family"]: entry for entry in body["families"]}
    assert set(families) == {"C", "R", "A", "N", "L"}
    assert "takes it back" in families["C"]["label"]
    slugs = {trap["slug"] for entry in body["families"] for trap in entry["traps"]}
    assert "self_correction" in slugs
    # Form risks are their own table, never mixed into the trap families.
    assert set(body["form_risks"]) == {
        "spelling",
        "plural_form",
        "word_class",
        "over_limit",
        "wrote_word_not_letter",
        "wrong_letter_count",
    }
    assert slugs.isdisjoint(set(body["form_risks"]))
    assert len(body["slots"]) == 14
    assert len(body["signpost_kinds"]) == 11
    # Every trap carries the audible signal that makes it fair, and teachable.
    for entry in body["families"]:
        for trap in entry["traps"]:
            assert trap["signal"], trap["slug"]
            assert trap["fix"], trap["slug"]


# ======================================================================================
# 3. Predictions
# ======================================================================================


def test_predictions_serve_the_technique_and_withhold_the_answer(
    client: TestClient,
) -> None:
    """The cue is on the learner's own page; the slot is the exercise."""
    response = client.get(f"/api/v1/listening/coach/predictions/{P1}")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["locked"] is True
    assert body["question_count"] == 10
    assert body["authored_count"] == 10
    assert body["slot_profile"] == []
    # The whole technique, always open: fourteen slots and the cue table that fixes them.
    assert len(body["slots"]) == 14
    assert any(row["printed"] == "a ___" for row in body["cue_table"])
    assert any("vowel sound" in (row["note"] or "") for row in body["cue_table"])
    assert len(body["preview_protocol"]) == 5

    first = body["items"][0]
    assert first["prompt"] == "The item 1 is the ______"
    assert first["prediction"]["cue"] == "the"
    assert first["prediction"]["slot"] is None
    assert first["prediction"]["note"] is None
    assert first["prediction"]["locked"] is True


def test_predictions_reveal_after_the_attempt(client: TestClient) -> None:
    sit_script(client, P1, {"1": "answer1"})
    body = client.get(f"/api/v1/listening/coach/predictions/{P1}").json()

    assert body["locked"] is False
    first = body["items"][0]
    assert first["prediction"]["slot"]["slug"] == "noun_singular"
    assert first["prediction"]["slot"]["p_code"] == "P7"
    assert first["prediction"]["note"]
    profile = {row["slug"]: row["count"] for row in body["slot_profile"]}
    assert profile == {"noun_singular": 5, "letter": 5}


# ======================================================================================
# 4. Replay
# ======================================================================================


def test_replay_is_refused_before_the_attempt(client: TestClient) -> None:
    response = client.post(
        "/api/v1/listening/coach/replay", json={"script_id": P1, "number": 1}
    )
    assert response.status_code == 409
    assert "Sit this part first" in response.json()["detail"]


def test_replay_returns_real_offsets_in_the_right_order(client: TestClient) -> None:
    """Signpost, then decoy, then the answer — the order is the teaching.

    The windows come from the ``timing.json`` the stitcher actually wrote, so this asserts
    against sample-accurate offsets rather than against a heuristic.
    """
    rendered = render(P1)
    sit_script(client, P1, {"1": "answer1"})

    response = client.post(
        "/api/v1/listening/coach/replay", json={"script_id": P1, "number": 1}
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["playable"] is True
    assert [segment["role"] for segment in body["segments"]] == [
        "signpost",
        "decoy",
        "answer",
    ]
    assert [segment["line_index"] for segment in body["segments"]] == [2, 3, 4]

    timing = {int(line["index"]): line for line in rendered["lines"]}
    answer = body["answer"]
    assert answer["seek_ms"] == timing[4]["start_ms"]
    # Three seconds of lead-in, clamped at the start of the file.
    assert answer["start_ms"] == max(0, timing[4]["start_ms"] - 3000)
    assert answer["end_ms"] == timing[4]["end_ms"] + 1500
    assert answer["text"] == "So the one you want is answer1."

    assert body["distraction"]["decoy"] == "decoy1"
    assert body["distraction"]["clip"]["text"] == "We nearly said decoy1 there."
    assert body["signpost"]["clip"]["seek_ms"] == timing[2]["start_ms"]
    assert body["accepted_answers"] == [["answer1"]]
    assert body["render_hint"] is None
    # One clip per spoken line, and each is exactly one thing here.
    assert [segment["roles"] for segment in body["segments"]] == [
        ["signpost"],
        ["decoy"],
        ["answer"],
    ]


#: Three question geometries the tidy fixture above never produces and the shipped pack is
#: full of. Measured against ``content/core-en/data/listening_scripts.jsonl``: of 415 items
#: carrying a cue line, 355 put the signpost **on** the keyed line and 44 of those also
#: carry a decoy on a third line; 11 items put the decoy **after** the keyed line, which is
#: what the correction family looks like when the speaker gives a value, moves on, and only
#: then takes it back.
AWKWARD = "ls_mk_awkward"


def build_awkward_script() -> dict[str, Any]:
    """One part whose three items each break the fixture's neat signpost/decoy/answer walk.

        line 2   signpost for Q1
        line 3   the keyed line for Q1
        line 4   Q1's decoy — *after* the answer
        line 5   Q2's signpost **and** keyed line, one utterance
        line 6   Q2's decoy — a third line, after
        line 7   Q3's decoy — a third line, before
        line 8   filler
        line 9   Q3's signpost **and** keyed line, one utterance
    """
    lines = [
        _line("narrator", "Part 1. First, look at questions 1 to 3.", 3000),
        _line("narrator", "Now listen and answer questions 1 to 3.", 500),
        _line("s1", "Right, the next thing is the room."),
        _line("s1", "So the one you want is answer1."),
        _line("s2", "Sorry — ignore that, I said decoy1 by mistake."),
        _line("s1", "The next thing is the date, and the one you want is answer2."),
        _line("s2", "Not decoy2 — that was last year's."),
        _line("s2", "We nearly said decoy3 there."),
        _line("s1", "Anyway."),
        _line("s1", "The next thing is the fee, and the one you want is answer3."),
        _line("narrator", "That is the end of part 1.", 1000),
    ]
    geometry = {1: (2, 3, 4), 2: (5, 5, 6), 3: (9, 9, 7)}
    questions = []
    for number, (signpost_index, cue_index, decoy_index) in geometry.items():
        questions.append(
            {
                "n": number,
                "type": "note_completion",
                "instruction": "Write ONE WORD for each answer.",
                "word_limit": {"words": 1, "numbers": 0},
                "prompt": f"The item {number} is the ______",
                "answers": [[f"answer{number}"]],
                "cue_line_index": cue_index,
                "explanation": f"The speaker settles on answer{number}.",
                "teaching": {
                    "schema_version": 1,
                    "prediction": {"slot": "noun_singular", "cue": "the", "range": None, "note": "One noun."},
                    "signpost": {
                        "phrase": "the next thing is",
                        "line_index": signpost_index,
                        "kind": "imminent",
                    },
                    "answer_quote": f"answer{number}",
                    "distraction": {
                        "trap": "self_correction",
                        "decoy": f"decoy{number}",
                        "decoy_line_index": decoy_index,
                        "signal": "sorry, ignore that",
                        "note": "The wrong value is withdrawn, not the right one.",
                    },
                    "recovery": "Rejoin at the next 'the next thing is'.",
                },
            }
        )
    return {
        "schema_version": 1,
        "part": 1,
        "title": "A part whose signposts sit on the keyed lines",
        "scenario": "A fixture recording with the geometries the shipped pack actually has.",
        "accent_set": "uk",
        "target_band": 6.5,
        "speakers": [
            {"id": "narrator", "name": "Narrator", "role": "narrator", "accent": "uk"},
            {"id": "s1", "name": "Speaker one", "role": "female_1", "accent": "uk"},
            {"id": "s2", "name": "Speaker two", "role": "male_1", "accent": "uk"},
        ],
        "lines": lines,
        "questions": questions,
    }


@pytest.fixture()
def awkward(client: TestClient) -> TestClient:
    from bandready.content import generate_listening as gen
    from bandready.db.engine import session_scope

    with session_scope() as s:
        gen.persist_script(s, build_awkward_script(), script_id=AWKWARD, source="pack")
    return client


def replay_of(client: TestClient, number: int) -> dict[str, Any]:
    response = client.post(
        "/api/v1/listening/coach/replay", json={"script_id": AWKWARD, "number": number}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_replay_plays_a_late_decoy_after_the_answer_not_before_it(
    awkward: TestClient,
) -> None:
    """Recording order, always — a corrected decoy that came second is played second.

    Eleven items in the shipped pack put the decoy *after* the keyed line, which is what
    the correction family sounds like when the speaker states a value, carries on, and only
    then takes it back. Playing that decoy first because it is "the distraction" would hand
    the learner three seconds that never happened in that order, which is the one thing a
    replay must not do: its whole claim is that it reproduces the moment rather than
    describing it.
    """
    rendered = render(AWKWARD)
    sit_script(awkward, AWKWARD, {"1": "answer1"})
    body = replay_of(awkward, 1)

    assert [segment["line_index"] for segment in body["segments"]] == [2, 3, 4]
    assert [segment["roles"] for segment in body["segments"]] == [
        ["signpost"],
        ["answer"],
        ["decoy"],
    ]
    timing = {int(line["index"]): line for line in rendered["lines"]}
    starts = [segment["seek_ms"] for segment in body["segments"]]
    assert starts == sorted(starts), "segments must play forwards through the file"
    assert starts == [timing[2]["start_ms"], timing[3]["start_ms"], timing[4]["start_ms"]]
    # The answer keeps its three-second lead-in even though it is no longer last.
    assert body["segments"][1]["start_ms"] == timing[3]["start_ms"] - 3000


def test_a_signpost_on_the_keyed_line_plays_that_line_once(awkward: TestClient) -> None:
    """The common shape in the shipped pack: 355 of 415 items signpost on the keyed line.

    Forty-four of those also carry a decoy on a third line, and a walk that emits
    signpost → decoy → answer plays the keyed line, jumps away, then plays the keyed line
    again. One clip per spoken line, labelled as both things it is, and it keeps the
    answer's window — the widest of the three — so the lead-in is not lost to the merge.
    """
    rendered = render(AWKWARD)
    sit_script(awkward, AWKWARD, {"2": "answer2", "3": "answer3"})
    timing = {int(line["index"]): line for line in rendered["lines"]}

    # Q2: the shared line comes first, its decoy after it.
    q2 = replay_of(awkward, 2)
    assert [segment["line_index"] for segment in q2["segments"]] == [5, 6]
    assert q2["segments"][0]["roles"] == ["signpost", "answer"]
    assert q2["segments"][0]["role"] == "answer"
    assert q2["segments"][0]["start_ms"] == timing[5]["start_ms"] - 3000
    assert q2["segments"][0]["end_ms"] == timing[5]["end_ms"] + 1500
    assert q2["segments"][1]["roles"] == ["decoy"]

    # Q3: the decoy came four lines earlier, so it plays first.
    q3 = replay_of(awkward, 3)
    assert [segment["line_index"] for segment in q3["segments"]] == [7, 9]
    assert [segment["roles"] for segment in q3["segments"]] == [
        ["decoy"],
        ["signpost", "answer"],
    ]
    starts = [segment["seek_ms"] for segment in q3["segments"]]
    assert starts == sorted(starts)

    # Both keep the standalone views the UI labels the card with.
    assert q3["signpost"]["clip"]["line_index"] == 9
    assert q3["distraction"]["clip"]["line_index"] == 7


def test_replay_degrades_to_text_when_the_part_is_not_rendered(
    client: TestClient,
) -> None:
    """A card that falls back to the transcript beats a 500, and says how to fix itself."""
    sit_script(client, P2, {"11": "answer11"})
    body = client.post(
        "/api/v1/listening/coach/replay", json={"script_id": P2, "number": 11}
    ).json()

    assert body["playable"] is False
    assert body["answer"]["text"] == "So the one you want is answer11."
    assert body["answer"]["start_ms"] is None
    assert "render" in body["render_hint"]


def test_replay_resolves_the_part_from_a_whole_test_attempt(client: TestClient) -> None:
    """Question 23 belongs to Part 3, and only the attempt's numbering knows that."""
    attempt_id = sit_test(client, TEST_1, answer_key(TEST_1))
    body = client.post(
        "/api/v1/listening/coach/replay", json={"attempt_id": attempt_id, "number": 23}
    ).json()

    assert body["script_id"] == "ls_mk_01_p3"
    assert body["part"] == 3
    assert body["number"] == 23
    assert body["answer"]["text"] == "So the one you want is answer23."


def test_replay_needs_a_submitted_attempt_and_a_real_number(client: TestClient) -> None:
    created = client.post(
        "/api/v1/listening/attempts", json={"test_id": TEST_1, "mode": "practice"}
    ).json()
    open_attempt = client.post(
        "/api/v1/listening/coach/replay",
        json={"attempt_id": created["attempt_id"], "number": 1},
    )
    assert open_attempt.status_code == 409

    sit_script(client, P1, {"1": "answer1"})
    missing = client.post(
        "/api/v1/listening/coach/replay", json={"script_id": P1, "number": 39}
    )
    assert missing.status_code == 404

    neither = client.post("/api/v1/listening/coach/replay", json={"number": 1})
    assert neither.status_code == 422


# ======================================================================================
# 5. Exam conditions, seen from the coach's side
# ======================================================================================


def test_exam_conditions_report_open_when_no_mock_is_running(client: TestClient) -> None:
    body = client.get("/api/v1/listening/coach/exam-conditions").json()
    assert body["active"] is False
    assert body["coaching_available"] is True
    assert body["withheld"] == []
