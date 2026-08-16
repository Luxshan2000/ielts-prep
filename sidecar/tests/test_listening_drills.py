"""Listening drills and audio-pipeline hardening (L-B3).

Two halves, and the second one is the reason the first one works.

**The drills** (:mod:`bandready.listening.drills` + the ``/listening/practice`` router).
What is pinned here is what a learner would notice if it broke: that a dictated word is
bucketed by *diagnosis* rather than counted as one undifferentiated error, that a
misspelling is scored as an exam zero **and** a hearing success at the same time, that a
set is a pure function of its seed, that no response body carries the key before the
answer is in, and that the whole surface shuts while a mock is open.

**The pipeline** (:mod:`bandready.audio.tts_render` + :mod:`bandready.audio.stitch`).
L-R4 measured three defects against the engine we actually ship, and each one is asserted
here in the form a candidate would experience it: a British voice must be given British
phonology, a spelled-aloud surname must survive synthesis as separable letters, and an
authored pause must be the pause the learner hears rather than a lower bound that varies
by up to 800 ms depending on who is speaking.

Everything runs with no TTS engine and no network through the hidden mock providers. The
one test that needs the real phonemizer is skipped when ``kokoro_onnx`` is absent — the
claim it checks is about Kokoro specifically and there is nothing honest to assert without
it.

One test goes further and is therefore opt-in. ``BANDREADY_TEST_AUDIO=1`` enables
:func:`test_a_spelled_surname_survives_synthesis_and_comes_back_whole`, which synthesizes
the line with Kokoro and transcribes it back with ``faster-whisper``. It loads two models
and takes about half a minute, so it stays out of the default run, but it is the only
check here that measures what a candidate actually *hears* rather than what an
intermediate representation looks like::

    BANDREADY_TEST_AUDIO=1 uv run pytest tests/test_listening_drills.py -k comes_back_whole
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from bandready import settings_store
from bandready.audio import stitch as stitch_mod
from bandready.audio import tts_render
from bandready.config import reset_settings_cache
from bandready.content import generate_listening as gen
from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import session_scope
from bandready.listening import drills
from bandready.server.app import create_app

TOKEN = "listening-drills-token"
RATE = stitch_mod.TARGET_RATE
BASE = "/api/v1/listening/practice"


# ======================================================================================
# Fixtures — one authored script carrying the full teaching payload
# ======================================================================================

def _reset_caches() -> None:
    reset_settings_cache()
    settings_store.invalidate_cache()
    db_engine.reset_engine()


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    directory = tmp_path_factory.mktemp("bandready-listening-drills")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(directory))
        mp.setenv("BANDREADY_AUTH_TOKEN", TOKEN)
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        _reset_caches()
        try:
            yield directory
        finally:
            _reset_caches()


@pytest.fixture(scope="module")
def client(data_dir: Path) -> Iterator[TestClient]:
    app = create_app()
    with TestClient(app, base_url="http://127.0.0.1:8710") as test_client:
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
        test_client.headers["Authorization"] = f"Bearer {TOKEN}"
        yield test_client


def _teaching(
    *,
    slot: str,
    cue: str | None,
    note: str,
    phrase: str,
    line_index: int,
    kind: str,
    quote: str,
    form_risk: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "prediction": {"slot": slot, "cue": cue, "range": None, "note": note},
        "signpost": {"phrase": phrase, "line_index": line_index, "kind": kind},
        "answer_quote": quote,
        "paraphrase_link": {"printed": "Deposit", "audio": "hold a hundred back"},
        "distraction": None,
        "form": (
            {"risk": form_risk, "note": "Six letters, and there is no second L."}
            if form_risk
            else None
        ),
        "recovery": None,
    }


def _script_document() -> dict[str, Any]:
    """One original Part 1 script with the DESIGN §1 teaching payload on every question.

    Written for this test file. The content is deliberately mundane — a village hall
    booking — because the drills only need real *shapes*: a spelled surname, a price whose
    spoken form differs from its written one, a date, and four different signpost kinds.
    """
    lines = [
        # 0
        {
            "speaker": "narrator",
            "text": (
                "Part one. You will hear a man booking a village hall for a party. First, "
                "you have thirty seconds to look at questions one to five."
            ),
            "pause_after_ms": 30000,
        },
        # 1
        {
            "speaker": "narrator",
            "text": "Now listen carefully and answer questions one to five.",
            "pause_after_ms": 900,
        },
        # 2
        {"speaker": "s1", "text": "Kingsmoor Village Hall, good afternoon.",
         "pause_after_ms": 250},
        # 3
        {
            "speaker": "s2",
            "text": (
                "Oh, hello. I'm, er, I'm trying to book the big room for a birthday thing, "
                "if you've got anything left in the spring."
            ),
            "pause_after_ms": 250,
        },
        # 4
        {"speaker": "s1", "text": "We might have. Can I take your surname first?",
         "pause_after_ms": 300},
        # 5
        {
            "speaker": "s2",
            "text": "It's Pardoe. That's P-A-R-D-O-E. No E on the front, everyone puts one there.",
            "pause_after_ms": 450,
        },
        # 6
        {
            "speaker": "s1",
            "text": "Lovely. And what date were you thinking of?",
            "pause_after_ms": 250,
        },
        # 7
        {
            "speaker": "s2",
            "text": (
                "The Saturday, so that's the eleventh of April. Um, actually, no, sorry — "
                "make that the eighteenth. The eleventh is Easter."
            ),
            "pause_after_ms": 400,
        },
        # 8
        {
            "speaker": "s1",
            "text": (
                "The eighteenth, right. Now the important thing is the deposit, because we "
                "hold a hundred back and that's separate from the hire."
            ),
            "pause_after_ms": 300,
        },
        # 9
        {
            "speaker": "s2",
            "text": "A hundred. And how much is the room itself, for the whole day?",
            "pause_after_ms": 250,
        },
        # 10
        {
            "speaker": "s1",
            "text": (
                "That'll be eighty-five pounds fifty for the day, which includes the little "
                "kitchen at the back."
            ),
            "pause_after_ms": 300,
        },
        # 11
        {
            "speaker": "s1",
            "text": (
                "Moving on to access, you collect the keys from the shop on the corner, and "
                "they close at six, so do not leave it late."
            ),
            "pause_after_ms": 300,
        },
        # 12
        {
            "speaker": "s2",
            "text": "The shop. Right, I'll write that down. Thanks very much.",
            "pause_after_ms": 250,
        },
    ]
    questions = [
        {
            "n": 1,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 1, "numbers": 1},
            "prompt": "KINGSMOOR VILLAGE HALL — BOOKING\n\nSurname: **1** ______",
            "answers": [["Pardoe"]],
            "cue_line_index": 5,
            "explanation": (
                "Predict a surname you cannot guess. She asks for it, he spells it, and the "
                "whole mark is the letters."
            ),
            "teaching": _teaching(
                slot="proper_name",
                cue="Surname",
                note="Unguessable — put your pen down and take single letters.",
                phrase="Can I take your surname first",
                line_index=4,
                kind="dictation",
                quote="It's Pardoe. That's P-A-R-D-O-E.",
                form_risk="spelling",
            ),
        },
        {
            "n": 2,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 1, "numbers": 1},
            "prompt": "Date: Saturday **2** ______ April",
            "answers": [["18", "18th", "eighteenth"]],
            "cue_line_index": 7,
            "explanation": (
                "The printed month fixes a date. He gives one, withdraws it and gives "
                "another. The last value stated is the answer, never the first."
            ),
            "teaching": _teaching(
                slot="date",
                cue="April",
                note="A day number. The month is already printed, so do not write it.",
                phrase="Um, actually, no, sorry",
                line_index=7,
                kind="correction",
                quote="make that the eighteenth",
                form_risk="spelling",
            ),
        },
        {
            "n": 3,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 1, "numbers": 1},
            "prompt": "Deposit: **3** ______ pounds",
            "answers": [["100"]],
            "cue_line_index": 8,
            "explanation": (
                "The printed unit fixes a bare figure. 'The important thing is' announces it "
                "one clause early."
            ),
            "teaching": _teaching(
                slot="quantity",
                cue="pounds",
                note="A bare figure — the word 'pounds' is already printed.",
                phrase="the important thing is",
                line_index=8,
                kind="emphasis",
                quote="we hold a hundred back",
            ),
        },
        {
            "n": 4,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 2, "numbers": 1},
            "prompt": "Hire for the day: £ **4** ______",
            "answers": [["85.50"]],
            "cue_line_index": 10,
            "explanation": (
                "The symbol is printed, so write the figure only. He says the amount in "
                "words and you have to write it in digits."
            ),
            "teaching": _teaching(
                slot="quantity",
                cue="£",
                note="Figure only. The pound sign is already on the page.",
                phrase="That'll be",
                line_index=10,
                kind="imminent",
                quote="eighty-five pounds fifty for the day",
            ),
        },
        {
            "n": 5,
            "type": "form_completion",
            "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
            "word_limit": {"words": 1, "numbers": 0},
            "prompt": "Collect keys from: the **5** ______",
            "answers": [["shop"]],
            "cue_line_index": 11,
            "explanation": (
                "'the' before the gap fixes a singular noun. 'Moving on to access' tells you "
                "the section has changed and the next answer belongs to it."
            ),
            "teaching": _teaching(
                slot="noun_singular",
                cue="the",
                note="One thing, singular. A place you can walk into.",
                phrase="Moving on to access",
                line_index=11,
                kind="structure",
                quote="you collect the keys from the shop on the corner",
            ),
        },
    ]
    return {
        "schema_version": 1,
        "part": 1,
        "title": "Booking a village hall",
        "scenario": "A caller books a hall for a birthday party.",
        "accent_set": "uk",
        "target_band": 6.0,
        "speakers": [
            {"id": "narrator", "name": "Narrator", "role": "narrator", "accent": "uk"},
            {"id": "s1", "name": "Hall secretary", "role": "female_1", "accent": "uk"},
            {"id": "s2", "name": "Caller", "role": "male_1", "accent": "uk"},
        ],
        "lines": lines,
        "groups": [
            {
                "id": "g1",
                "type": "form_completion",
                "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
                "questions": [1, 2, 3, 4, 5],
                "teaching": {
                    "schema_version": 1,
                    "answer_order": "sequential",
                    "order_note": "The form fills top to bottom in the order she asks.",
                    "strategy": "Fix the five slot types in the pause, then listen for five "
                                "short bursts.",
                    "preview_focus": "Slot-type all five: name, date, figure, figure, noun.",
                    "watch_out": "Four of the five are transcription, not comprehension.",
                },
            }
        ],
        "questions": questions,
        "teaching": {
            "schema_version": 1,
            "what_makes_this_hard": {"levers": ["distraction_density"]},
            "signpost_map": [
                {"line_index": 4, "phrase": "Can I take your surname first",
                 "kind": "dictation"},
                {"line_index": 7, "phrase": "Um, actually, no, sorry", "kind": "correction"},
                {"line_index": 8, "phrase": "the important thing is", "kind": "emphasis"},
                {"line_index": 10, "phrase": "That'll be", "kind": "imminent"},
                {"line_index": 11, "phrase": "Moving on to access", "kind": "structure"},
                {"line_index": 6, "phrase": "And what date were you thinking of",
                 "kind": "imminent"},
            ],
            "metrics": {"speakers": 2},
        },
    }


@pytest.fixture(scope="module")
def seeded(client: TestClient) -> dict[str, Any]:
    """The script in the database, with its audio rendered through the mock provider."""
    import asyncio

    document = _script_document()
    with session_scope() as session:
        script_id = gen.persist_script(session, document, script_id="ls_drill_p1", source="user")
    result = asyncio.run(tts_render.render_script(document, script_id=script_id))
    return {"script_id": script_id, "document": document, "render": result}


@pytest.fixture()
def unrendered(client: TestClient) -> str:
    """A second script with no audio, for the "prepare it first" path."""
    document = _script_document()
    document["title"] = "Never rendered"
    with session_scope() as session:
        existing = session.get(m.ListeningScript, "ls_drill_dark")
        if existing is None:
            gen.persist_script(session, document, script_id="ls_drill_dark", source="user")
    return "ls_drill_dark"


# ======================================================================================
# 1. Token alignment — the one algorithm this module owns
# ======================================================================================

def test_align_tokens_reports_every_edit_class() -> None:
    ops = drills.align_tokens(["the", "big", "red", "van"], ["the", "red", "vans", "now"])
    assert [op for op, _, _ in ops] == ["equal", "del", "equal", "sub", "ins"]
    # The deletion is reported against the word that went missing, not smeared.
    assert [(op, ref) for op, ref, _ in ops if op == "del"] == [("del", 1)]


def test_align_tokens_handles_empty_input_both_ways() -> None:
    assert [op for op, _, _ in drills.align_tokens([], ["a", "b"])] == ["ins", "ins"]
    assert [op for op, _, _ in drills.align_tokens(["a", "b"], [])] == ["del", "del"]
    assert drills.align_tokens([], []) == []


def test_dictation_tokens_keep_contractions_and_drop_punctuation() -> None:
    assert drills.dictation_tokens("I'll be there — at 6.30, honestly!") == [
        "i'll", "be", "there", "at", "6", "30", "honestly",
    ]
    # A curly apostrophe is the same word as a straight one.
    assert drills.dictation_tokens("I’ll") == drills.dictation_tokens("I'll")


# ======================================================================================
# 2. Dictation grading — four diagnoses, never one percentage
# ======================================================================================

def test_missed_function_word_is_its_own_diagnosis() -> None:
    marking = drills.grade_dictation(
        "I'll be there in about ten minutes", "I'll be there about ten minutes"
    )
    assert marking["counts"] == {"function_word": 1}
    assert marking["heard"] == 6 and marking["total"] == 7
    assert "grammar words" in marking["headline"]


def test_a_misspelling_is_an_exam_zero_and_a_hearing_success() -> None:
    marking = drills.grade_dictation(
        "the compost bays are behind the greenhouse",
        "the compost bayes are behind the greenhouse",
    )
    assert marking["counts"] == {"spelling": 1}
    # Heard counts it; exact does not. Reporting one number would teach the wrong lesson.
    assert marking["heard"] == 7
    assert marking["exact"] == 6
    assert marking["accuracy"] > marking["exact_accuracy"]


def test_short_words_are_never_called_spelling_slips() -> None:
    """``the`` → ``they`` is one edit and is not evidence the learner heard anything."""
    marking = drills.grade_dictation("the van was late", "they van was late")
    assert "spelling" not in marking["counts"]


def test_a_run_of_three_missing_words_is_overload_not_vocabulary() -> None:
    marking = drills.grade_dictation(
        "we open at nine but from September it is eight thirty",
        "we open at nine eight thirty",
    )
    assert marking["counts"].get("dropout") == 5
    assert "content_word" not in marking["counts"]
    diagnoses = {entry["bucket"] for entry in marking["diagnoses"]}
    assert "dropout" in diagnoses


def test_a_single_missing_content_word_is_not_a_dropout() -> None:
    marking = drills.grade_dictation("bring a spare battery please", "bring a battery please")
    assert marking["counts"] == {"content_word": 1}


def test_a_boundary_error_routes_to_segmentation() -> None:
    """"bath house" written as "bathhouse": the stream was heard and cut in the wrong place."""
    marking = drills.grade_dictation(
        "past the old bath house on the left", "past the old bathhouse on the left"
    )
    # Which of the two words carries the substitution is a coin toss the aligner is
    # entitled to call either way; that one of them is diagnosed as segmentation is not.
    assert marking["counts"] == {"segmentation": 1, "content_word": 1}


def test_an_invented_word_is_reported_as_an_insertion() -> None:
    marking = drills.grade_dictation("collect the keys", "collect all the keys")
    assert marking["counts"] == {"inserted": 1}
    assert marking["heard"] == 3  # insertions never reduce what you heard


def test_a_perfect_line_says_so_and_an_empty_one_does_not_divide_by_zero() -> None:
    assert drills.grade_dictation("two words here", "two words here")["headline"] == (
        "You heard all 3 words."
    )
    empty = drills.grade_dictation("", "")
    assert empty["accuracy"] == 0.0 and empty["total"] == 0


def test_headline_names_weak_forms_only_when_they_dominate() -> None:
    mostly_grammar = drills.grade_dictation(
        "a lot of the equipment is in the shed", "lot of equipment is in shed"
    )
    assert "weak forms" in mostly_grammar["headline"]
    vocabulary = drills.grade_dictation(
        "the sedimentary layers were exposed", "the layers were exposed"
    )
    assert "vocabulary" in vocabulary["headline"]


# ======================================================================================
# 3. Selection — what a script can honestly supply
# ======================================================================================

def test_dictation_ranks_answer_lines_first_and_excludes_the_narrator() -> None:
    doc = _script_document()
    sources = drills.dictation_sources(doc)
    assert sources, "the fixture must be drillable"
    assert sources[0]["why"].startswith("This is where the answer")
    assert all(entry["line_index"] not in (0, 1) for entry in sources)
    assert all(
        drills.DICTATION_MIN_WORDS <= entry["words"] <= drills.DICTATION_MAX_WORDS
        for entry in sources
    )


def test_numbers_finds_the_spelled_name_the_price_and_the_date() -> None:
    doc = _script_document()
    slots = {entry["number"]: entry["slot"] for entry in drills.numbers_sources(doc)}
    assert slots == {1: "proper_name", 2: "date", 3: "quantity", 4: "quantity"}
    # Q5 is a noun, not a figure or a name, so it is not a numbers item.
    assert 5 not in slots


def test_numbers_falls_back_to_evidence_when_there_is_no_teaching_payload() -> None:
    """The four scripts that shipped before the payload existed still drill."""
    doc = _script_document()
    for question in doc["questions"]:
        question.pop("teaching", None)
    found = {entry["number"]: entry for entry in drills.numbers_sources(doc)}
    # The digit answers are detected from the key; the surname from the spelled cue line.
    assert set(found) == {1, 2, 3, 4}
    assert found[1]["slot"] == "proper_name" and found[1]["detected"] is True
    assert found[1]["spelled"] is True


def test_signpost_and_prediction_report_themselves_unavailable_without_a_payload() -> None:
    doc = _script_document()
    for question in doc["questions"]:
        question.pop("teaching", None)
    doc["teaching"] = {}
    assert drills.signpost_sources(doc) == []
    assert drills.prediction_sources(doc) == []


def test_a_signpost_whose_phrase_is_not_in_its_line_is_dropped() -> None:
    doc = _script_document()
    doc["teaching"]["signpost_map"].append(
        {"line_index": 2, "phrase": "this was never said", "kind": "imminent"}
    )
    assert all(
        entry["phrase"] != "this was never said" for entry in drills.signpost_sources(doc)
    )


def test_signposts_are_deduped_across_the_question_payload_and_the_map() -> None:
    doc = _script_document()
    sources = drills.signpost_sources(doc)
    keys = [(entry["line_index"], entry["phrase"].lower()) for entry in sources]
    assert len(keys) == len(set(keys))
    # Five question signposts plus the one structure marker that carries no answer.
    assert len(sources) == 6


# ======================================================================================
# 4. Item construction and the key that must not travel
# ======================================================================================

def test_strip_key_removes_every_field_that_is_or_reconstructs_the_answer(
    seeded: dict[str, Any],
) -> None:
    doc = _script_document()
    doc["script_id"] = seeded["script_id"]
    doc["audio_hash"] = seeded["render"]["audio_hash"]
    timing = drills.timing_for(doc)

    dictation = drills.dictation_item(
        doc, drills.dictation_sources(doc)[0], timing, index=1, seed="s"
    )
    assert dictation is not None and dictation["reference"]
    assert "reference" not in drills.strip_key(dictation)

    signpost = drills.signpost_item(
        doc, drills.signpost_sources(doc)[0], timing, drills.signpost_sources(doc),
        index=1, seed="s", mode="recognise",
    )
    assert signpost is not None
    served = drills.strip_key(signpost)
    assert "answer_key" not in served
    # The marker as *text* is a key too: a learner who can read it is not listening.
    assert "phrase" not in served and "line_text" not in served
    assert len(served["options"]) == 4

    prediction = drills.prediction_item(
        doc, drills.prediction_sources(doc)[0], index=1, seed="s"
    )
    served = drills.strip_key(prediction)
    for leak in ("answer_key", "cue", "note", "range"):
        assert leak not in served, f"{leak} gives the slot away"
    assert len(served["options"]) == 5


def test_prediction_lures_come_from_the_slot_s_own_family_first() -> None:
    doc = _script_document()
    source = next(s for s in drills.prediction_sources(doc) if s["slot"] == "noun_singular")
    item = drills.prediction_item(doc, source, index=1, seed="seed-1")
    slugs = {option["slug"] for option in item["options"]}
    # Singular/plural/uncountable/phrase are the discrimination the exam punishes.
    assert {"noun_plural", "noun_uncountable", "noun_phrase"} <= slugs


def test_a_form_mode_numbers_item_is_dropped_when_it_would_be_copying() -> None:
    """Quoting "shop" against a key of "shop" is a typing test, not a transcription one."""
    doc = _script_document()
    source = next(s for s in drills.numbers_sources(doc) if s["number"] == 4)
    item = drills.numbers_item(doc, source, None, index=1, seed="s", mode="form")
    assert item is not None and item["quote"] == "eighty-five pounds fifty for the day"

    copying = dict(source)
    copying["question"] = dict(source["question"])
    copying["question"]["answers"] = [["eighty-five pounds fifty for the day"]]
    assert drills.numbers_item(doc, copying, None, index=1, seed="s", mode="form") is None


# ======================================================================================
# 5. Grading the non-dictation kinds
# ======================================================================================

def test_numbers_grading_is_exact_and_tags_the_spelling_leak() -> None:
    item = {
        "answers": [["Pardoe"]],
        "qtype": "form_completion",
        "word_limit": {"max_words": 1, "numbers_allowed": True},
    }
    assert drills.grade_numbers(item, "Pardoe")["correct"] is True
    assert drills.grade_numbers(item, "pardoe")["correct"] is True  # case is not marked

    leak = drills.grade_numbers(item, "Pardo")
    assert leak["correct"] is False and leak["near_miss_spelling"] is True

    blank = drills.grade_numbers(item, "   ")
    assert blank["blank"] is True and blank["near_miss_spelling"] is False


def test_numbers_grading_enforces_the_word_limit() -> None:
    item = {
        "answers": [["shop"]],
        "qtype": "form_completion",
        "word_limit": {"max_words": 1, "numbers_allowed": False},
    }
    marking = drills.grade_numbers(item, "the corner shop")
    assert marking["correct"] is False and marking["over_limit"] is True


def test_prediction_separates_the_wrong_shape_from_the_wrong_family() -> None:
    item = {"answer_key": "noun_plural"}
    right = drills.grade_prediction(item, "noun_plural")
    assert right["correct"] is True and right["note"] is None

    near = drills.grade_prediction(item, "noun_singular")
    assert near["correct"] is False and near["same_family"] is True
    assert "Right family" in near["note"]

    far = drills.grade_prediction(item, "time")
    assert far["same_family"] is False and "printed frame" in far["note"]

    assert drills.grade_prediction(item, None)["correct"] is False


def test_signpost_cue_window_is_forgiving_early_and_strict_late() -> None:
    item = {"mode": "cue", "clip": {"start_ms": 0, "line_start_ms": 10_000}}
    assert drills.grade_signpost(item, {"given": 10_000})["verdict"] == "on_time"
    # Pressing three seconds early is the skill working: you heard the marker.
    assert drills.grade_signpost(item, {"given": 7_000})["correct"] is True
    # Pressing three seconds late means you reacted to the answer, not to its announcement.
    late = drills.grade_signpost(item, {"given": 13_000})
    assert late["correct"] is False and late["verdict"] == "late"
    early = drills.grade_signpost(item, {"given": 1_000})
    assert early["verdict"] == "early"
    assert drills.grade_signpost(item, {"given": None})["verdict"] == "no_press"


def test_signpost_recognise_is_an_exact_pick() -> None:
    item = {"mode": "recognise", "answer_key": "correction"}
    assert drills.grade_signpost(item, {"given": "correction"})["correct"] is True
    wrong = drills.grade_signpost(item, {"given": "imminent"})
    assert wrong["correct"] is False
    assert wrong["key_info"]["name"] == drills.SIGNPOST_KINDS["correction"]["name"]


# ======================================================================================
# 6. The HTTP surface
# ======================================================================================

def test_kinds_describes_all_four_and_the_buckets(client: TestClient) -> None:
    body = client.get(f"{BASE}/kinds").json()
    assert [k["kind"] for k in body["kinds"]] == list(drills.DRILL_KINDS)
    assert {b["bucket"] for b in body["buckets"]} == set(drills.DICTATION_BUCKETS)
    # The synthetic-voice disclosure is not optional copy.
    assert "synthesized" in body["honesty"]


def test_catalogue_counts_what_is_really_there(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    body = client.get(f"{BASE}/catalogue").json()
    counts = {row["kind"]: row for row in body["kinds"]}
    assert counts["prediction"]["items"] >= 5
    assert counts["prediction"]["needs_audio"] is False
    assert counts["dictation"]["needs_audio"] is True
    mine = next(s for s in body["scripts"] if s["script_id"] == seeded["script_id"])
    assert mine["audio_ready"] is True


def test_a_set_is_a_pure_function_of_its_seed(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    payload = {"kind": "prediction", "script_id": seeded["script_id"], "size": 4}
    first = client.post(f"{BASE}/sets", json=payload)
    assert first.status_code == 201
    seed = first.json()["seed"]
    again = client.post(f"{BASE}/sets", json={**payload, "seed": seed}).json()
    assert [i["item_id"] for i in again["items"]] == [
        i["item_id"] for i in first.json()["items"]
    ]
    # A different seed is a different deal: either the questions, or the order the slot
    # chips are offered in, or both. Comparing the whole set rather than one item keeps the
    # assertion out of the small chance that one item happens to land identically.
    different = client.post(f"{BASE}/sets", json={**payload, "seed": "other"}).json()
    def signature(doc: dict[str, Any]) -> list[tuple[str, list[str]]]:
        return [
            (item["item_id"], [o["slug"] for o in item["options"]]) for item in doc["items"]
        ]

    assert signature(different) != signature(first.json())


def test_no_served_item_carries_the_key(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    for kind in drills.DRILL_KINDS:
        body = client.post(
            f"{BASE}/sets",
            json={"kind": kind, "script_id": seeded["script_id"], "size": 3},
        )
        assert body.status_code == 201, f"{kind}: {body.text}"
        raw = body.text
        for leak in ("answer_key", '"reference"', '"answers"'):
            assert leak not in raw, f"{kind} leaked {leak}"


def test_grading_a_dictation_set_records_one_drill_row_with_the_buckets(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    built = client.post(
        f"{BASE}/sets",
        json={"kind": "dictation", "script_id": seeded["script_id"], "size": 3},
    ).json()
    assert built["items"][0]["clip"]["end_ms"] > built["items"][0]["clip"]["start_ms"]

    graded = client.post(
        f"{BASE}/grade",
        json={
            "kind": "dictation",
            "script_id": seeded["script_id"],
            "size": 3,
            "seed": built["seed"],
            "responses": [
                {"item_id": item["item_id"], "given": "nothing like the line"}
                for item in built["items"]
            ],
            "duration_s": 120,
        },
    )
    assert graded.status_code == 200, graded.text
    body = graded.json()
    assert body["band"] is None  # a drill is not an assessment instrument
    assert body["summary"]["words_total"] > 0
    assert body["results"][0]["reveal"]["reference"]  # the transcript opens only now

    with session_scope() as session:
        row = session.get(m.DrillResult, body["drill_id"])
        assert row is not None
        assert row.module == "listening" and row.drill_kind == "dictation"
        details = json.loads(row.details_json)
        assert details["buckets"], "the per-bucket counts are what makes this repeatable"
        envelope = session.get(m.PracticeSession, body["drill_id"])
        assert envelope is not None and envelope.duration_s == 120


def test_grading_a_numbers_set_marks_exactly_and_reveals_the_form_note(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    # Four, not three: the fixture has exactly four form-eligible answers, and asking for
    # all of them is what makes the set deterministic. With three, which one is left out is
    # a function of the minted seed, and the assertion below would pass or fail by luck.
    built = client.post(
        f"{BASE}/sets",
        json={
            "kind": "numbers",
            "script_id": seeded["script_id"],
            "mode": "form",
            "size": 4,
        },
    ).json()
    assert built["mode"] == "form"
    assert built["size"] == 4
    assert all(item["clip"] is None for item in built["items"])
    assert all(item["quote"] for item in built["items"])

    body = client.post(
        f"{BASE}/grade",
        json={
            "kind": "numbers",
            "script_id": seeded["script_id"],
            "mode": "form",
            "size": 4,
            "seed": built["seed"],
            "responses": [
                {"item_id": item["item_id"], "given": "Pardo"} for item in built["items"]
            ],
        },
    ).json()
    # "Pardo" for "Pardoe" is one edit: wrong on the sheet, and heard correctly.
    assert body["summary"]["near_miss_spelling"] >= 1
    assert "orthography" in body["summary"]["headline"]
    assert body["n_correct"] == 0


def test_prediction_needs_no_audio_at_all(
    client: TestClient, unrendered: str
) -> None:
    """The whole point of the kind: it runs on a script that has never been synthesized."""
    built = client.post(
        f"{BASE}/sets", json={"kind": "prediction", "script_id": unrendered, "size": 4}
    )
    assert built.status_code == 201, built.text
    assert len(built.json()["items"]) == 4

    blocked = client.post(
        f"{BASE}/sets", json={"kind": "dictation", "script_id": unrendered, "size": 3}
    )
    assert blocked.status_code == 409
    assert "Prepare the audio" in blocked.json()["detail"]


def test_responses_from_another_set_are_refused(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    body = client.post(
        f"{BASE}/grade",
        json={
            "kind": "prediction",
            "script_id": seeded["script_id"],
            "size": 3,
            "seed": "a-known-seed",
            "responses": [{"item_id": "ldr_prediction_1_deadbeef", "given": "quantity"}],
        },
    )
    assert body.status_code == 422
    assert "function of its seed" in body.json()["detail"]


def test_the_whole_surface_shuts_while_a_mock_is_open(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    attempt = client.post(
        "/api/v1/listening/attempts",
        json={"script_id": seeded["script_id"], "mode": "exam"},
    )
    assert attempt.status_code in (200, 201), attempt.text
    attempt_id = attempt.json()["attempt_id"]
    try:
        for path, method in (
            (f"{BASE}/catalogue", "get"),
            (f"{BASE}/profile", "get"),
        ):
            assert getattr(client, method)(path).status_code == 409
        blocked = client.post(
            f"{BASE}/sets", json={"kind": "prediction", "script_id": seeded["script_id"]}
        )
        assert blocked.status_code == 409
        assert "coaching is shut" in blocked.json()["detail"]
    finally:
        client.post(f"/api/v1/listening/attempts/{attempt_id}/submit", json={})


def test_the_bucket_profile_aggregates_across_sessions(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    # Recorded here rather than leaned on from an earlier test, so the assertion does not
    # depend on which order the file happens to run in.
    built = client.post(
        f"{BASE}/sets",
        json={"kind": "dictation", "script_id": seeded["script_id"], "size": 3},
    ).json()
    client.post(
        f"{BASE}/grade",
        json={
            "kind": "dictation",
            "script_id": seeded["script_id"],
            "size": 3,
            "seed": built["seed"],
            "responses": [
                {"item_id": item["item_id"], "given": "the"} for item in built["items"]
            ],
        },
    )

    body = client.get(f"{BASE}/profile").json()
    assert isinstance(body["buckets"], list)
    assert body["buckets"], "a graded dictation set must show up in the profile"
    assert sum(entry["count"] for entry in body["buckets"]) > 0
    assert "counted apart" in body["form_note"]


def test_finished_drill_sets_are_listed_back_without_their_keys(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    """The ledger a history screen reads: counts and dates, and nothing that reveals."""
    empty = client.get(f"{BASE}/sessions")
    assert empty.status_code == 200, empty.text
    before = empty.json()["count"]

    built = client.post(
        f"{BASE}/sets",
        json={"kind": "dictation", "script_id": seeded["script_id"], "size": 3},
    ).json()
    graded = client.post(
        f"{BASE}/grade",
        json={
            "kind": "dictation",
            "script_id": seeded["script_id"],
            "size": 3,
            "seed": built["seed"],
            "duration_s": 91,
            "responses": [
                {"item_id": item["item_id"], "given": "the"} for item in built["items"]
            ],
        },
    )
    assert graded.status_code == 200, graded.text

    body = client.get(f"{BASE}/sessions").json()
    assert body["count"] == before + 1
    row = body["items"][0]
    # The launcher's word for the kind, not the storage taxonomy's, so a client can label
    # the row without reversing RESULT_KINDS.
    assert row["kind"] == "dictation"
    assert row["script_id"] == seeded["script_id"]
    assert row["n_items"] == 3
    assert row["n_correct"] == 0
    assert row["started_at"], "a drill with no date cannot be placed in a history"
    assert row["duration_s"] == 91

    # Aggregates only. The dictated line, the key and what the learner typed all live in
    # `details_json` and none of them may leave through a list payload.
    flat = json.dumps(body)
    for leaked in ("details", "items_detail", "key", "given", "diff"):
        assert f'"{leaked}"' not in flat


def test_the_drill_ledger_stays_open_while_a_mock_is_open(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    """Past scores reveal nothing about the paper in front of you (unlike every sibling)."""
    attempt = client.post(
        "/api/v1/listening/attempts",
        json={"script_id": seeded["script_id"], "mode": "exam"},
    )
    attempt_id = attempt.json()["attempt_id"]
    try:
        assert client.get(f"{BASE}/profile").status_code == 409
        assert client.get(f"{BASE}/sessions").status_code == 200
    finally:
        client.post(f"/api/v1/listening/attempts/{attempt_id}/submit", json={})


def test_synonym_check_returns_the_authored_link_alongside_the_model(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    body = client.post(
        f"{BASE}/synonym",
        json={
            "script_id": seeded["script_id"],
            "number": 3,
            "printed": "Deposit",
            "guesses": ["money up front", "a bit to hold the date"],
        },
    )
    assert body.status_code == 200, body.text
    payload = body.json()
    # The author's paraphrase is the ground truth; the model is a second layer.
    assert payload["authored"]["audio"] == "hold a hundred back"
    assert payload["guesses"] == ["money up front", "a bit to hold the date"]

    empty = client.post(
        f"{BASE}/synonym",
        json={"script_id": seeded["script_id"], "number": 3, "printed": "Deposit",
              "guesses": ["  "]},
    )
    assert empty.status_code == 422


# ======================================================================================
# 7. Audio pipeline — the three defects L-R4 measured
# ======================================================================================

def test_british_voices_get_british_phonology() -> None:
    assert tts_render.lang_for_voice("bf_emma") == "en-gb"
    assert tts_render.lang_for_voice("bm_lewis") == "en-gb"
    assert tts_render.lang_for_voice("am_adam") == "en-us"
    assert tts_render.lang_for_voice("af_heart") == "en-us"
    assert tts_render.lang_for_voice("") == "en-us"


@pytest.mark.parametrize(
    ("written", "spoken"),
    [
        ("Of course. O-K-A-F-O-R. Okafor.", "Of course. O. K. A. F. O. R. Okafor."),
        ("That's B-R-A-D.", "That's B. R. A. D."),
        ("The Y M C A on Bridge Street.", "The Y. M. C. A. on Bridge Street."),
        # Two letters is a word, not a spelling: these must survive untouched.
        ("a T-shirt and an X-ray", "a T-shirt and an X-ray"),
        # Already dotted content is left exactly as it is — the rewrite is idempotent.
        ("It's P. A. R. D. O. E.", "It's P. A. R. D. O. E."),
    ],
)
def test_spelled_runs_are_rewritten_for_synthesis_only(written: str, spoken: str) -> None:
    assert tts_render.normalize_spelled_runs(written) == spoken
    # The transcript keeps the authored form: `text` is never mutated in place.
    line = {"text": written}
    assert tts_render.speech_text(line)[0] == spoken
    assert line["text"] == written


@pytest.mark.skipif(
    pytest.importorskip("kokoro_onnx", reason="Kokoro is not installed") is None,
    reason="Kokoro is not installed",
)
def test_the_rewritten_form_is_the_one_kokoro_can_segment() -> None:
    """The claim under all of this, checked against the real phonemizer.

    Hyphens are stripped and the letter names run together into one pseudo-word; dots
    produce one stressed letter name each. No synthesis needed — the tokenizer alone is
    enough to catch the defect, which is what makes an authoring gate practical.
    """
    from kokoro_onnx.tokenizer import Tokenizer

    tokenizer = Tokenizer()
    broken = tokenizer.phonemize("That's B-R-A-D.", lang="en-gb")
    fixed = tokenizer.phonemize(
        tts_render.normalize_spelled_runs("That's B-R-A-D."), lang="en-gb"
    )
    assert " " not in broken.split("ðats ")[1].strip(" .")  # one run-on blob
    assert fixed.count(".") >= 4  # four separable letter names

    # And the accent bug, in the form a candidate would hear it.
    assert tokenizer.phonemize("Z.", lang="en-gb").startswith("zˈɛd")
    assert tokenizer.phonemize("Z.", lang="en-us").startswith("zˈiː")


def _kokoro_weights() -> tuple[Path, Path] | None:
    """The real downloaded Kokoro weights, or ``None``.

    Deliberately **not** ``get_settings().models_dir``. The module fixtures point
    ``BANDREADY_DATA_DIR`` at a fresh ``tmp_path`` so nothing touches the developer's real
    database, which also means the settings-derived models directory is empty for the whole
    session — resolving through it made both round-trip tests skip silently in a full run
    while passing under ``-k``. :func:`~bandready.config.default_data_dir` ignores the env
    var and gives the install location the weights are actually downloaded to.
    """
    from bandready.config import default_data_dir

    roots = [default_data_dir() / "models" / "kokoro"]
    override = os.getenv("BANDREADY_KOKORO_DIR")
    if override:
        roots.insert(0, Path(override))
    for models in roots:
        model, voices = models / "kokoro-v1.0.onnx", models / "voices-v1.0.bin"
        if model.exists() and voices.exists():
            return model, voices
    return None


@pytest.mark.skipif(
    not os.getenv("BANDREADY_TEST_AUDIO"),
    reason="round-trip synthesis is opt-in: set BANDREADY_TEST_AUDIO=1 (~30 s, CPU)",
)
def test_a_spelled_surname_survives_synthesis_and_comes_back_whole() -> None:
    """The end-to-end claim: synthesize it, then transcribe it back and read the letters.

    The tokenizer test above shows the *phonemes* separate. This one closes the loop the
    way L-R4 §8.1 measured it — Kokoro renders the line, ``faster-whisper`` listens to the
    audio, and the surname either survives or it does not. Kept opt-in because it loads
    two models and takes about half a minute, but it is the only test here that proves the
    learner hears the right thing rather than that an intermediate representation looks
    right.

    Measured on this machine, ``bf_emma`` at ``en-gb``:

    ==================================  ==========================
    ``That's B-R-A-D-S-H-A-W.``         heard ``That's BRDSH-W.``
    ``That's B R A D S H A W.``         heard ``That's BRDSHW.``
    ``That's B. R. A. D. S. H. A. W.``  heard ``That's B-R-A-D-S-H-A-W.``
    ==================================  ==========================

    Both broken forms silently drop letters — including *both* A's under space separation,
    which is the article-phonemization bug — and only the dotted form comes back whole.
    """
    weights = _kokoro_weights()
    if weights is None:
        pytest.skip("Kokoro weights are not downloaded")
    pytest.importorskip("kokoro_onnx", reason="Kokoro is not installed")
    pytest.importorskip("faster_whisper", reason="faster-whisper is not installed")

    from faster_whisper import WhisperModel
    from kokoro_onnx import Kokoro

    engine = Kokoro(str(weights[0]), str(weights[1]))
    asr = WhisperModel("base.en", device="cpu", compute_type="int8")

    def heard(text: str) -> str:
        samples, _rate = engine.create(text, voice="bf_emma", speed=1.0, lang="en-gb")
        segments, _info = asr.transcribe(np.asarray(samples, dtype=np.float32), language="en")
        # Letters only: the ASR is free to punctuate the run as `B-R-A-D`, `B.R.A.D` or
        # `B R A D` and all three mean the candidate heard the same thing.
        return "".join(ch for ch in " ".join(s.text for s in segments) if ch.isalnum()).upper()

    target = "BRADSHAW"
    for broken in ("That's B-R-A-D-S-H-A-W.", "That's B R A D S H A W."):
        assert target not in heard(broken), f"{broken!r} was expected to lose letters"

    fixed = heard(tts_render.normalize_spelled_runs("That's B-R-A-D-S-H-A-W."))
    assert target in fixed, f"the normalised form came back as {fixed!r}"


@pytest.mark.skipif(
    not os.getenv("BANDREADY_TEST_AUDIO"),
    reason="round-trip synthesis is opt-in: set BANDREADY_TEST_AUDIO=1 (~60 s, CPU)",
)
def test_every_line_window_replays_its_own_line_in_real_audio() -> None:
    """Click-to-replay, measured on audio the engine really produced.

    :func:`test_a_rendered_line_window_is_tight_enough_to_replay` pins the *arithmetic* of
    ``timing.json`` against the mock renderer, which emits a fixed tone and therefore
    cannot catch a drift that only appears when lines have real, unequal speech durations.
    This one runs the pipeline exactly as :func:`~bandready.audio.tts_render.render_script`
    does — synthesize, :func:`~bandready.audio.stitch.trim_edges`, stitch — then cuts the
    file at each recorded window and transcribes the slice.

    The assertion is the learner-facing one rather than a millisecond tolerance: a slice
    must read back as *its own* line and not a neighbour's. A window that started early or
    ran long would pull in the previous or next utterance and lose that comparison, which
    is precisely the failure a learner would experience as "the replay button plays the
    wrong bit".

    Number lines are deliberately excluded from the reference set. ``faster-whisper``
    writes *"oh one one seven, four nine six"* back as ``0117 496``, which is a correct
    hearing and a similarity score of 0.17 — an orthography artefact of the checker, not a
    timing fault, and asserting on it would make this test lie.
    """
    weights = _kokoro_weights()
    if weights is None:
        pytest.skip("Kokoro weights are not downloaded")
    pytest.importorskip("kokoro_onnx", reason="Kokoro is not installed")
    pytest.importorskip("faster_whisper", reason="faster-whisper is not installed")

    import difflib

    from faster_whisper import WhisperModel
    from kokoro_onnx import Kokoro

    engine = Kokoro(str(weights[0]), str(weights[1]))
    asr = WhisperModel("base.en", device="cpu", compute_type="int8")

    lines = [
        ("bf_emma", "Good morning, Bridgewater Community Centre, how can I help?"),
        ("bm_lewis", "Hello. I'd like to enquire about the swimming lessons."),
        ("bf_emma", "Of course. Can I take your surname please?"),
        ("bm_lewis", "It's Pardoe. That's P-A-R-D-O-E."),
        ("bf_emma", "Thank you. And a contact number?"),
    ]

    pieces: list[stitch_mod.Piece] = []
    for voice, text in lines:
        samples, rate = engine.create(
            tts_render.normalize_spelled_runs(text), voice=voice, speed=1.0, lang="en-gb"
        )
        pcm = stitch_mod.trim_edges(np.asarray(samples, dtype=np.float32), rate)
        pieces.append((pcm, rate, 300))

    result = stitch_mod.stitch(pieces)
    audio, sample_rate = result.audio, result.sample_rate
    assert len(result.timings) == len(lines)

    def flatten(text: str) -> str:
        keep = "".join(c for c in text.lower() if c.isalnum() or c.isspace())
        return " ".join(keep.split())

    for timing, (_voice, own) in zip(result.timings, lines, strict=True):
        start = int(timing.start_ms * sample_rate / 1000)
        end = int(timing.end_ms * sample_rate / 1000)
        segments, _info = asr.transcribe(audio[start:end], language="en")
        listened = flatten(" ".join(s.text for s in segments))

        scores = [
            difflib.SequenceMatcher(None, listened, flatten(text)).ratio()
            for _v, text in lines
        ]
        mine = scores[result.timings.index(timing)]
        others = [s for i, s in enumerate(scores) if i != result.timings.index(timing)]
        assert mine == max(scores), (
            f"the window for {own!r} transcribed as {listened!r}, which matches another "
            f"line better ({mine:.2f} vs {max(others):.2f}) — the window is off"
        )
        # And not marginally: a correctly cut window beats every neighbour outright.
        assert mine - max(others) > 0.25, f"{own!r} only just won ({mine:.2f})"


def test_say_as_and_phonemes_win_over_text_in_that_order() -> None:
    assert tts_render.speech_text({"text": "Fanshaw Road", "say_as": "Fanshor Road"}) == (
        "Fanshor Road",
        False,
    )
    assert tts_render.speech_text(
        {"text": "Featherstonehaugh", "say_as": "Fanshaw", "phonemes": "fˈanʃɔː"}
    ) == ("fˈanʃɔː", True)


def test_editing_say_as_invalidates_the_render(seeded: dict[str, Any]) -> None:
    """The hash covers what is *spoken*, or a `say_as` fix would silently do nothing."""
    document = _script_document()
    base = tts_render.script_audio_hash(document, "uk")
    edited = json.loads(json.dumps(document))
    edited["lines"][5]["say_as"] = "It's Pardoe. That's P. A. R. D. O. E."
    assert tts_render.script_audio_hash(edited, "uk") != base
    # Re-titling still does not, which is what lets teaching payloads be rewritten freely.
    assert tts_render.script_audio_hash(dict(document, title="renamed"), "uk") == base


def test_the_line_cache_key_separates_phonemes_from_text() -> None:
    plain = tts_render.line_cache_key("bf_emma", "Fanshaw", 1.0)
    ipa = tts_render.line_cache_key("bf_emma", "Fanshaw", 1.0, is_phonemes=True)
    assert plain != ipa


def test_speech_warnings_fire_on_the_forms_that_render_wrongly() -> None:
    def rules(text: str) -> set[str]:
        return {w["rule"] for w in tts_render.speech_warnings(text)}

    assert "digit_run" in rules("Ring extension 4021.")
    assert "digit_run" in rules("Call 0117 496 0384.")
    assert "old_year" in rules("It opened in 1994.")
    assert "decimal" in rules("It is 12.5 kilometres.")
    assert "currency_symbol" in rules("It costs £42.50.")
    assert "abbreviation" in rules("Doctor Patel on St. Mary's Road.")
    assert "bare_dash" in rules("I went there - it was closed.")


def test_speech_warnings_stay_quiet_on_the_forms_that_render_correctly() -> None:
    """A linter that cries wolf is one authors learn to ignore, so the carve-outs matter."""
    for clean in (
        "on the 14th of March 2019",
        "we pushed it back to 6.45",
        "a 1500 word essay",
        "the postcode is B4 7QT",
        "it's flat 2B, on the second floor",
        "forty-two pounds fifty a year",
    ):
        assert tts_render.speech_warnings(clean) == [], clean


# --------------------------------------------------------------------------------------
# The pause the learner actually hears
# --------------------------------------------------------------------------------------

def _speech(ms: int, *, lead_ms: int = 0, tail_ms: int = 0) -> np.ndarray:
    """A block of "speech" with silent margins, for the trimmer to find."""
    body = np.full(stitch_mod.ms_to_samples(ms, RATE), 0.4, dtype=np.float32)
    return np.concatenate(
        [
            np.zeros(stitch_mod.ms_to_samples(lead_ms, RATE), dtype=np.float32),
            body,
            np.zeros(stitch_mod.ms_to_samples(tail_ms, RATE), dtype=np.float32),
        ]
    )


def test_trim_edges_cuts_the_residual_back_to_a_fixed_floor() -> None:
    pcm = _speech(1000, lead_ms=100, tail_ms=540)
    trimmed = stitch_mod.trim_edges(pcm, RATE)
    # 1000 ms of speech plus 40 ms at each end, whatever the voice left behind.
    assert abs(stitch_mod.duration_ms(trimmed, RATE) - 1080) <= 2
    assert stitch_mod.duration_ms(pcm, RATE) == 1640


def test_trim_edges_never_pads_a_line_that_is_already_tight() -> None:
    pcm = _speech(500, lead_ms=5, tail_ms=5)
    assert stitch_mod.trim_edges(pcm, RATE).size == pcm.size


def test_trim_edges_leaves_a_silent_buffer_completely_alone() -> None:
    """Mock renders are pure silence; collapsing them would break every offline test."""
    silence = np.zeros(RATE, dtype=np.float32)
    assert stitch_mod.trim_edges(silence, RATE).size == silence.size
    assert stitch_mod.trim_edges(np.zeros(0, dtype=np.float32), RATE).size == 0


def test_trimming_makes_an_authored_pause_mean_what_it_says() -> None:
    """Two voices with different residuals must produce the same gap for the same pause.

    This is the defect in the form a learner meets it: identical authoring rendering as a
    434 ms gap after one speaker and a 941 ms gap after another, so no script could hold a
    conversational rhythm and `pause_after_ms: 0` was never a latched interruption.
    """
    tidy = stitch_mod.trim_edges(_speech(600, lead_ms=35, tail_ms=97), RATE)
    trailing = stitch_mod.trim_edges(_speech(600, lead_ms=103, tail_ms=538), RATE)
    result = stitch_mod.stitch(
        [(tidy, RATE, 300), (trailing, RATE, 300), (tidy, RATE, 0)], normalize=False
    )
    gaps = [
        result.timings[i + 1].start_ms - result.timings[i].end_ms for i in range(2)
    ]
    assert gaps == [300, 300]
    # The 538 ms tail is gone — the line is 600 ms of speech plus the 40 ms floor at each
    # end — while the line that was already tighter than the floor is left alone rather
    # than padded back out, so the two differ by the 5 ms the first one never had.
    assert stitch_mod.duration_ms(trailing, RATE) == 680
    assert stitch_mod.duration_ms(tidy, RATE) == 675


def test_a_rendered_line_window_is_tight_enough_to_replay(
    seeded: dict[str, Any],
) -> None:
    """The coach's click-to-replay is only as good as ``timing.json`` is tight."""
    doc = _script_document()
    doc["script_id"] = seeded["script_id"]
    doc["audio_hash"] = seeded["render"]["audio_hash"]
    timing = drills.timing_for(doc)
    assert timing is not None

    window = drills.line_window(timing, 5)
    assert window is not None and window["end_ms"] > window["start_ms"]

    clip = drills.clip_for(timing, 5)
    assert clip is not None
    assert clip["start_ms"] <= window["start_ms"] <= clip["line_start_ms"]
    assert clip["end_ms"] >= window["end_ms"]
    # The clip opens before the line so the learner hears the signpost that announced it.
    assert clip["line_start_ms"] - clip["start_ms"] == min(
        drills.CLIP_LEAD_MS, window["start_ms"]
    )
    # …and never runs past the end of the file.
    assert clip["end_ms"] <= int(timing["duration_ms"])


def test_clip_for_is_none_when_nothing_is_rendered() -> None:
    assert drills.clip_for(None, 3) is None
    assert drills.clip_for({"lines": [], "duration_ms": 0}, 3) is None


# --------------------------------------------------------------------------------------
# Duration estimation — the heuristic that was out by 4x on Part 1's own lines
# --------------------------------------------------------------------------------------

def test_digit_dense_lines_are_estimated_far_slower_than_prose() -> None:
    numeric = stitch_mod.estimate_speech_ms("Call 0117 496 0384.")
    prose = stitch_mod.estimate_speech_ms(
        "I'll be there in about ten minutes if the traffic behaves itself."
    )
    # Nineteen characters of phone number take longer to say than sixty-five characters of
    # prose. Measured 3.9 cps against ~19 cps, and the old flat 15 cps had it backwards —
    # it called the phone line a third of the length of the prose one.
    assert numeric > prose
    assert stitch_mod.estimate_speech_ms("Call 0117 496 0384.", chars_per_second=15.0) < prose
    # Within half a second of the 4.87 s the engine really takes for that line.
    assert 4_300 <= numeric <= 5_400


def test_spelled_letters_are_counted_at_dictation_speed() -> None:
    spelled = stitch_mod.estimate_speech_ms("P. A. R. D. O. E.")
    word = stitch_mod.estimate_speech_ms("Pardoe")
    assert spelled > word * 3


def test_the_flat_rate_is_still_available_for_callers_that_want_one() -> None:
    assert stitch_mod.estimate_speech_ms("x" * 150, chars_per_second=15.0) == 10_000
    assert stitch_mod.estimate_speech_ms("") == 0
