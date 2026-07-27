"""Reading coach tests: the gate, the strategy card, the paraphrase layer, why-wrong.

Four properties are load-bearing and each is tested from more than one angle:

1. **The worked solution is gated on a submitted attempt containing that passage.** In
   reading the solution *is* the answer — the evidence quote, the paraphrase link and the
   trap slug all point straight at it — so the gate is tested against every path that
   could open it wrongly: another passage's attempt, an attempt still in progress, and a
   live mock (which shuts it even for a passage legitimately unlocked last week).
2. **Strategy is never gated by an attempt and always gated by a mock.** A strategy card
   says how to attack a type, not what the answer is; it is worth most before the passage
   is sat, and worth nothing during a sitting.
3. **Mining is constrained.** Only items whose ``blocks_q`` is a question the learner got
   wrong, capped at five, filed as suggestions rather than scheduled.
4. **"Why was I wrong" prefers the authored autopsy over the model**, matches the option
   the learner actually chose, and lets the learner's own answer decide which trap leads.

The fixture pack is three tests we control completely — two Academic and one General
Training, forty questions each, numbered contiguously across the paper — so "which
passage does the gate open" is a question about this engine rather than about production
content.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from ulid import ULID

TOKEN = "test-token"

AC_TEST_1 = "rt_mk_ac_01"
AC_TEST_2 = "rt_mk_ac_02"
GT_TEST_1 = "rt_mk_gt_01"


# ======================================================================================
# The fixture pack — original passages, authored teaching, exactly 40 questions a paper
# ======================================================================================

#: Three paragraphs per passage. Every completion answer below is a verbatim contiguous
#: span of one of them, which is the authoring rule the real bank follows.
PARAGRAPH_SETS: dict[str, list[dict[str, str]]] = {
    "marsh": [
        {
            "id": "A",
            "text": (
                "The salt marsh at Kelder Point is drained by a single creek. Surveyors "
                "recorded a fall of eleven centimetres in the marsh surface between 1998 "
                "and 2012, and the fall was steepest in the years when the creek was "
                "dredged for navigation."
            ),
        },
        {
            "id": "B",
            "text": (
                "Marsh plants trap sediment when the tide is slack. Most assessments "
                "conclude that the trapping rate depends on stem density, although the "
                "effect varies with the width of the channel surveyed."
            ),
        },
        {
            "id": "C",
            "text": (
                "In the writer's view the marsh repays its upkeep, because the sea wall "
                "behind it would otherwise have to be raised. The parish council disputes "
                "the figure the estuary authority publishes."
            ),
        },
    ],
    "kilns": [
        {
            "id": "A",
            "text": (
                "Lime was burned in field kilns across the northern counties until the "
                "railways arrived. A kiln held about twelve tonnes of stone and took four "
                "days to burn through, and the burners slept beside it."
            ),
        },
        {
            "id": "B",
            "text": (
                "Fuel decided where a kiln stood. Most surveys conclude that siting "
                "followed the coal, although the pattern varies with the distance from "
                "the nearest quarry."
            ),
        },
        {
            "id": "C",
            "text": (
                "In the writer's view the kilns deserve their protection, because nothing "
                "else records the trade so plainly. The county archaeologist disputes the "
                "count that the survey published."
            ),
        },
    ],
    "ferries": [
        {
            "id": "A",
            "text": (
                "The estuary ferries ran on the tide rather than to a timetable. A "
                "crossing took about forty minutes, and the boats carried livestock as "
                "readily as passengers."
            ),
        },
        {
            "id": "B",
            "text": (
                "Weather decided the service. Most accounts conclude that cancellations "
                "followed the wind direction, although the pattern varies with the depth "
                "of the approach channel."
            ),
        },
        {
            "id": "C",
            "text": (
                "In the writer's view the ferries were undervalued, because the road "
                "around the head of the estuary added two hours. The harbour board "
                "disputes the traffic figures that survive."
            ),
        },
    ],
}

#: One TFNG template per key, cycled through the group. Between them they satisfy the
#: group rule that a TFNG group carries at least one "phantom contradiction" item and at
#: least one "missed contradiction" item — they are inverse errors, and a learner who
#: over-corrects for one walks straight into the other.
TFNG_TEMPLATES: list[dict[str, Any]] = [
    {
        "key": "true",
        "prompt_by_topic": {
            "marsh": "The creek at Kelder Point has been dredged.",
            "kilns": "A single kiln burned for several days at a time.",
            "ferries": "The ferries sailed according to the state of the tide.",
        },
        "anchor": "A",
        "evidence_by_topic": {
            "marsh": "the years when the creek was dredged",
            "kilns": "took four days to burn through",
            "ferries": "ran on the tide rather than to a timetable",
        },
        "teaching": {
            "schema_version": 1,
            "decision_rule": (
                "The statement and the text make the same claim with the same strength, "
                "and nothing in the sentence narrows it. That forces TRUE rather than the "
                "other two verdicts."
            ),
            "distractors": [
                {
                    "key": "false",
                    "why_tempting": (
                        "The sentence carries a subordinate clause, and a reader who "
                        "stops at the main clause finds nothing that matches."
                    ),
                    "why_wrong": "Nothing in the paragraph contradicts the statement.",
                    "diagnosis": "no_contradiction",
                },
                {
                    "key": "not given",
                    "why_tempting": (
                        "The statement uses different wording from the text, so a reader "
                        "hunting for the exact words concludes it is absent."
                    ),
                    "why_wrong": "The paragraph states it in full, in other words.",
                    "diagnosis": "support_present",
                },
            ],
            "reusable_rule": (
                "Different wording is not absence. Search for the proposition, not for "
                "the vocabulary."
            ),
            "traps": ["paraphrase_missed"],
            "gear": "close",
        },
    },
    {
        "key": "false",
        "prompt_by_topic": {
            "marsh": "The trapping rate is the same in every channel surveyed.",
            "kilns": "Siting followed the same pattern at every distance from a quarry.",
            "ferries": "Cancellations followed the same pattern in every approach channel.",
        },
        "anchor": "B",
        "evidence_by_topic": {
            "marsh": "the effect varies with the width of the channel surveyed",
            "kilns": "the pattern varies with the distance from the nearest quarry",
            "ferries": "the pattern varies with the depth of the approach channel",
        },
        "teaching": {
            "schema_version": 1,
            "decision_rule": (
                "The text says the effect varies and the statement says it does not. That "
                "is a contradiction you can quote, so the verdict is FALSE rather than "
                "NOT GIVEN."
            ),
            "distractors": [
                {
                    "key": "true",
                    "why_tempting": (
                        "Every content word in the statement appears in the sentence, so "
                        "a keyword check passes."
                    ),
                    "why_wrong": "The relation is reversed: the text says it varies.",
                    "diagnosis": "reversed",
                },
                {
                    "key": "not given",
                    "why_tempting": (
                        "The word 'every' does not appear in the passage, so a reader "
                        "looking for the quantifier concludes nothing was said."
                    ),
                    "why_wrong": "'Varies' denies 'the same in every'. The denial is there.",
                    "diagnosis": "contradiction_present",
                },
            ],
            "reusable_rule": (
                "A hedge in the text against an absolute in the statement is a "
                "contradiction, not a silence."
            ),
            "traps": ["contradiction_read_as_absence", "scope_shift"],
            "gear": "close",
        },
    },
    {
        "key": "not given",
        "prompt_by_topic": {
            "marsh": "The parish council has published a figure of its own.",
            "kilns": "The county archaeologist has published a count of his own.",
            "ferries": "The harbour board has published traffic figures of its own.",
        },
        "anchor": "C",
        "evidence_by_topic": {
            "marsh": "The parish council disputes the figure",
            "kilns": "The county archaeologist disputes the count",
            "ferries": "The harbour board disputes the traffic figures",
        },
        "teaching": {
            "schema_version": 1,
            "decision_rule": (
                "Disputing a figure and publishing a rival one are different acts. The "
                "text states the first and is silent on the second, so neither TRUE nor "
                "FALSE can be supported."
            ),
            "nearest_text": "disputes the figure",
            "distractors": [
                {
                    "key": "false",
                    "why_tempting": (
                        "The paragraph names the body and the dispute, so a reader who "
                        "has located the sentence feels the passage has settled it."
                    ),
                    "why_wrong": (
                        "Nothing in the paragraph denies that a rival figure exists."
                    ),
                    "diagnosis": "no_contradiction",
                },
                {
                    "key": "true",
                    "why_tempting": (
                        "Disputing a number usually implies having a better one, and the "
                        "inference feels safe."
                    ),
                    "why_wrong": "The inference is the reader's; the text does not make it.",
                    "diagnosis": "unstated",
                },
            ],
            "reusable_rule": (
                "If a step of reasoning is needed to reach the statement, the answer is "
                "NOT GIVEN however reasonable the step."
            ),
            "traps": ["absence_read_as_contradiction", "plausible_inference"],
            "gear": "close",
        },
    },
]

#: One completion template per gap. Every answer is a verbatim span of its anchor.
COMPLETION_TEMPLATES: list[dict[str, Any]] = [
    {
        "anchor": "A",
        "prompt_by_topic": {
            "marsh": "The marsh surface fell by {{gap}} between 1998 and 2012.",
            "kilns": "A field kiln held roughly {{gap}} of stone.",
            "ferries": "A crossing lasted about {{gap}}.",
        },
        "answer_by_topic": {
            "marsh": "eleven centimetres",
            "kilns": "twelve tonnes",
            "ferries": "forty minutes",
        },
        "evidence_by_topic": {
            "marsh": "a fall of eleven centimetres in the marsh surface",
            "kilns": "held about twelve tonnes of stone",
            "ferries": "took about forty minutes",
        },
        "teaching": {
            "schema_version": 1,
            "grammar_cue": "'by' before the gap wants a measured quantity, not a verb.",
            "decision_rule": (
                "Only one figure in the paragraph is a measurement of the thing the "
                "sentence names, which fixes the answer's form as well as its content."
            ),
            "distractors": [
                {
                    "key": "1998",
                    "why_tempting": "It is the nearest number to the gap in the sentence.",
                    "why_wrong": "It is a date, not the quantity the sentence asks for.",
                    "diagnosis": "wrong_form",
                }
            ],
            "reusable_rule": (
                "Decide what kind of thing the gap wants before you look for a number."
            ),
            "traps": ["form_error"],
            "gear": "scan",
        },
    },
    {
        "anchor": "B",
        "prompt_by_topic": {
            "marsh": "Marsh plants trap sediment when the tide is {{gap}}.",
            "kilns": "Where a kiln stood was decided by its {{gap}}.",
            "ferries": "Whether the service ran was decided by the {{gap}}.",
        },
        "answer_by_topic": {"marsh": "slack", "kilns": "Fuel", "ferries": "Weather"},
        "evidence_by_topic": {
            "marsh": "trap sediment when the tide is slack",
            "kilns": "Fuel decided where a kiln stood",
            "ferries": "Weather decided the service",
        },
        "teaching": {
            "schema_version": 1,
            "grammar_cue": "The gap follows a determiner, so a single noun or adjective fits.",
            "decision_rule": (
                "The sentence restates the paragraph's opening clause, and only one word "
                "in that clause fills the slot without breaking the grammar."
            ),
            "distractors": [
                {
                    "key": "sediment",
                    "why_tempting": "It is the noun nearest the gap in the paraphrased line.",
                    "why_wrong": "It is what is trapped, not the condition being asked about.",
                    "diagnosis": "wrong_form",
                }
            ],
            "reusable_rule": "Read the completed sentence back. If it does not parse, the answer is wrong.",
            "traps": ["form_error"],
            "gear": "search",
        },
    },
    {
        "anchor": "B",
        "prompt_by_topic": {
            "marsh": "Most assessments conclude that the trapping rate depends on {{gap}}.",
            "kilns": "Most surveys conclude that siting followed the {{gap}}.",
            "ferries": "Most accounts conclude that cancellations followed the {{gap}}.",
        },
        "answer_by_topic": {
            "marsh": "stem density",
            "kilns": "coal",
            "ferries": "wind direction",
        },
        "evidence_by_topic": {
            "marsh": "the trapping rate depends on stem density",
            "kilns": "siting followed the coal",
            "ferries": "cancellations followed the wind direction",
        },
        "teaching": {
            "schema_version": 1,
            "grammar_cue": "'on' before the gap wants a noun phrase, and 'the' is already supplied.",
            "decision_rule": (
                "The reporting clause is copied verbatim from the paragraph, so the gap "
                "takes whatever completes that same clause in the text."
            ),
            "distractors": [
                {
                    "key": "the channel surveyed",
                    "why_tempting": (
                        "It is the noun phrase in the concessive clause, which sits closer "
                        "to the end of the sentence."
                    ),
                    "why_wrong": "It belongs to the qualification, not to the main claim.",
                    "diagnosis": "right_words_wrong_paragraph",
                }
            ],
            "reusable_rule": (
                "A concessive clause qualifies the claim; it does not answer questions "
                "about it."
            ),
            "traps": ["lexical_lure"],
            "gear": "search",
        },
    },
]


def _passage_teaching(topic: str, minutes: int) -> dict[str, Any]:
    paragraphs = {p["id"]: p["text"] for p in PARAGRAPH_SETS[topic]}
    hinge = {"marsh": "Most", "kilns": "Most", "ferries": "Most"}[topic]
    return {
        "schema_version": 1,
        "time_budget_min": minutes,
        "difficulty_rationale": {
            "levers": ["density", "implicit_cohesion"],
            "note": (
                "Everyday vocabulary carrying two qualified claims per paragraph, with "
                "the link between the claim and its qualification left to the reader."
            ),
            "hardest_paragraph": "B",
            "why_hardest": "It states a majority view and then qualifies it in the same sentence.",
        },
        "skim_plan": {
            "kind": "paragraph_map",
            "read_first": "The title and the whole of paragraph A.",
            "skip": "The parenthetical detail in paragraph C.",
            "budget_s": 120,
            "map": [
                {"paragraph": "A", "label": "what it is"},
                {"paragraph": "B", "label": "what decides it"},
                {"paragraph": "C", "label": "who disagrees"},
            ],
        },
        "paraphrase_families": [
            {
                "concept": "changes with",
                "passage_form": "varies with",
                "paragraph": "B",
                "rewordings": [
                    "is not constant across",
                    "differs according to",
                    "is conditional on",
                    "shifts depending on",
                ],
                "cefr": "B2",
            },
            {
                "concept": "most people think",
                "passage_form": "Most",
                "paragraph": "B",
                "rewordings": [
                    "the prevailing view is",
                    "the majority position holds",
                    "it is generally accepted",
                    "the weight of opinion is",
                ],
                "cefr": "B2",
            },
        ],
        "hinge_words": [
            {
                "word": hinge,
                "kind": "quantifier",
                "why_here": "A majority is not a settled result, and it bounds the second item in the group.",
            },
            {
                "word": "although",
                "kind": "connective",
                "why_here": "It introduces the qualification the third completion item turns on.",
            },
        ],
        "mineable": [
            {
                "item": "varies with",
                "paragraph": "B",
                "cefr": "B2",
                "meaning": "changes depending on",
                "blocks_q": None,  # filled in by build_passage once numbering is known
            },
            {
                "item": "disputes the figure",
                "paragraph": "C",
                "cefr": "B2",
                "meaning": "says publicly that a number is wrong",
                "blocks_q": None,
            },
        ],
        "metrics": {
            "awl_pct": 6.0,
            "mean_sentence_length": 18,
            "longest_sentence": 30,
            "unknown_token_pct": 0.8,
            "attributed_opinions": 2,
            "quantified_comparisons": 2,
            "abstraction": "concrete",
        },
        "_paragraph_lengths": {k: len(v.split()) for k, v in paragraphs.items()},
    }


def build_passage(
    passage_id: str,
    title: str,
    topic: str,
    numbers: list[int],
    *,
    fmt: str,
    position: int,
) -> dict[str, Any]:
    """One passage document with half its questions TFNG and half completion.

    ``numbers`` is the contiguous slice of the paper's 1..40 this passage owns; the split
    is deterministic so a test can compute the whole answer key without reading the
    document back.
    """
    half = (len(numbers) + 1) // 2
    tfng_numbers, completion_numbers = numbers[:half], numbers[half:]

    tfng_questions: list[dict[str, Any]] = []
    for index, number in enumerate(tfng_numbers):
        template = TFNG_TEMPLATES[index % len(TFNG_TEMPLATES)]
        tfng_questions.append(
            {
                "number": number,
                "prompt": template["prompt_by_topic"][topic],
                "answers": [{"value": template["key"]}],
                "anchor_paragraphs": [template["anchor"]],
                "evidence_quote": template["evidence_by_topic"][topic],
                "explanation": (
                    f"Paragraph {template['anchor']} settles this: "
                    f"\"{template['evidence_by_topic'][topic]}\"."
                ),
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 6.5,
                "teaching": {
                    **json.loads(json.dumps(template["teaching"])),
                    "paraphrase_link": {
                        "stem_phrase": " ".join(
                            template["prompt_by_topic"][topic].split()[:3]
                        ),
                        "text_phrase": " ".join(
                            template["evidence_by_topic"][topic].split()[:3]
                        ),
                        "devices": ["synonym", "clause_restructure"],
                        "note": "The stem restates the clause with the content word swapped.",
                    },
                },
            }
        )

    completion_questions: list[dict[str, Any]] = []
    for index, number in enumerate(completion_numbers):
        template = COMPLETION_TEMPLATES[index % len(COMPLETION_TEMPLATES)]
        completion_questions.append(
            {
                "number": number,
                "prompt": template["prompt_by_topic"][topic],
                "answers": [{"value": template["answer_by_topic"][topic]}],
                "anchor_paragraphs": [template["anchor"]],
                "evidence_quote": template["evidence_by_topic"][topic],
                "explanation": (
                    f"The answer is a verbatim span of paragraph {template['anchor']}."
                ),
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.5,
                "teaching": {
                    **json.loads(json.dumps(template["teaching"])),
                    "paraphrase_link": {
                        "stem_phrase": " ".join(
                            template["prompt_by_topic"][topic].replace("{{gap}}", "").split()[:3]
                        ),
                        "text_phrase": " ".join(
                            template["evidence_by_topic"][topic].split()[:3]
                        ),
                        "devices": ["nominalisation"],
                        "note": "The gapped line nominalises the paragraph's own verb.",
                    },
                },
            }
        )

    teaching = _passage_teaching(topic, {1: 16, 2: 20, 3: 22}[position] if fmt == "academic" else {1: 15, 2: 18, 3: 25}[position])
    teaching.pop("_paragraph_lengths", None)
    # `blocks_q` is the whole discipline of the mining list: every entry names a real
    # question on this passage whose decision turns on the item.
    teaching["mineable"][0]["blocks_q"] = tfng_numbers[1] if len(tfng_numbers) > 1 else numbers[0]
    teaching["mineable"][1]["blocks_q"] = tfng_numbers[2] if len(tfng_numbers) > 2 else numbers[-1]

    return {
        "schema_version": 1,
        "id": passage_id,
        "position": position,
        "title": title,
        "topic": topic,
        "difficulty": "medium",
        "gt_section": position if fmt == "general_training" else None,
        "word_count": sum(len(p["text"].split()) for p in PARAGRAPH_SETS[topic]),
        "texts": [{"id": "t1", "heading": None, "paragraphs": PARAGRAPH_SETS[topic]}],
        "teaching": teaching,
        "question_groups": [
            {
                "id": "g1",
                "type": "true_false_not_given",
                "instructions_extra": None,
                "word_limit": None,
                "allow_reuse": True,
                "options": None,
                "layout": None,
                "teaching": {
                    "schema_version": 1,
                    "answer_order": "sequential",
                    "section_scope": None,
                    "strategy": (
                        "Two of these statements turn on a single hedged word in paragraph "
                        "B. Read the statement, mark its strongest word, then locate — in "
                        "that order, because locating first makes you generous."
                    ),
                    "order_note": (
                        f"In order: Q{tfng_numbers[-1]}'s answer sits below "
                        f"Q{tfng_numbers[0]}'s. Search the band, not the passage."
                    ),
                    "watch_out": (
                        "One item disputes a figure without offering another. Disputing is "
                        "not proposing."
                    ),
                    "time_budget_s": 70 * len(tfng_numbers),
                },
                "questions": tfng_questions,
            },
            {
                "id": "g2",
                "type": "sentence_completion",
                "instructions_extra": None,
                "word_limit": {"max_words": 2, "numbers_allowed": True},
                "allow_reuse": False,
                "options": None,
                "layout": None,
                "teaching": {
                    "schema_version": 1,
                    "answer_order": "sequential",
                    "section_scope": None,
                    "strategy": (
                        "Every answer here is a contiguous span of paragraph A or B. "
                        "Predict the word class from the gapped line first; two of the "
                        "gaps will only take a noun."
                    ),
                    "order_note": "In order, and all of them in the first two paragraphs.",
                    "watch_out": "Two words is two words. Articles count.",
                    "time_budget_s": 40 * max(1, len(completion_numbers)),
                },
                "questions": completion_questions,
            },
        ],
    }


#: (test_id, format, title, [(passage_id, title, topic, question_count)])
PACK: list[tuple[str, str, str, list[tuple[str, str, str, int]]]] = [
    (
        AC_TEST_1,
        "academic",
        "Academic Reading — practice paper 1",
        [
            ("rp_mk_ac_01_p1", "The marsh that pays for itself", "marsh", 14),
            ("rp_mk_ac_01_p2", "Burning lime in the fields", "kilns", 13),
            ("rp_mk_ac_01_p3", "Crossing on the tide", "ferries", 13),
        ],
    ),
    (
        AC_TEST_2,
        "academic",
        "Academic Reading — practice paper 2",
        [
            ("rp_mk_ac_02_p1", "Kelder Point revisited", "marsh", 14),
            ("rp_mk_ac_02_p2", "Kilns and the coming of rail", "kilns", 13),
            ("rp_mk_ac_02_p3", "The last estuary ferry", "ferries", 13),
        ],
    ),
    (
        GT_TEST_1,
        "general_training",
        "General Training Reading — practice paper 1",
        [
            ("rp_mk_gt_01_s1", "Notices from the estuary authority", "marsh", 14),
            ("rp_mk_gt_01_s2", "Working at the kilns", "kilns", 13),
            ("rp_mk_gt_01_s3", "Ferry timetables and their limits", "ferries", 13),
        ],
    ),
]


def seed_pack() -> None:
    """Retire the shipped reading content and install three papers we control."""
    from sqlalchemy import text as sa_text

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(sa_text("UPDATE reading_tests SET retired = 1"))
        s.execute(sa_text("UPDATE reading_passages SET retired = 1"))

    with session_scope() as s:
        for test_id, fmt, title, passages in PACK:
            next_number = 1
            passage_ids: list[str] = []
            for position, (passage_id, passage_title, topic, count) in enumerate(
                passages, start=1
            ):
                numbers = list(range(next_number, next_number + count))
                next_number += count
                doc = build_passage(
                    passage_id, passage_title, topic, numbers, fmt=fmt, position=position
                )
                s.add(
                    m.ReadingPassage(
                        id=passage_id,
                        format=fmt,
                        title=passage_title,
                        word_count=int(doc["word_count"]),
                        band_target=7.0,
                        passage_json=json.dumps(doc, ensure_ascii=False),
                        source="pack",
                        license="CC-BY-4.0",
                    )
                )
                for group_index, group in enumerate(doc["question_groups"]):
                    limit = group.get("word_limit")
                    for question in group["questions"]:
                        s.add(
                            m.ReadingQuestion(
                                id=f"rq_{ULID()}",
                                passage_id=passage_id,
                                number=question["number"],
                                group_index=group_index,
                                qtype=group["type"],
                                word_limit=limit["max_words"] if limit else None,
                                answers_json=json.dumps(question["answers"]),
                                anchor_paragraphs_json=json.dumps(
                                    question["anchor_paragraphs"]
                                ),
                                evidence_quote=question["evidence_quote"],
                                explanation=question["explanation"],
                                trap_note=question["trap_note"],
                            )
                        )
                passage_ids.append(passage_id)
            s.add(
                m.ReadingTest(
                    id=test_id,
                    format=fmt,
                    title=title,
                    p1_id=passage_ids[0],
                    p2_id=passage_ids[1],
                    p3_id=passage_ids[2],
                    source="pack",
                    license="CC-BY-4.0",
                )
            )


def answer_key(test_id: str) -> dict[str, str]:
    """The whole paper's key, recomputed from the same templates the builder used."""
    entry = next(t for t in PACK if t[0] == test_id)
    key: dict[str, str] = {}
    next_number = 1
    for _passage_id, _title, topic, count in entry[3]:
        numbers = list(range(next_number, next_number + count))
        next_number += count
        half = (len(numbers) + 1) // 2
        for index, number in enumerate(numbers[:half]):
            key[str(number)] = TFNG_TEMPLATES[index % len(TFNG_TEMPLATES)]["key"]
        for index, number in enumerate(numbers[half:]):
            key[str(number)] = COMPLETION_TEMPLATES[index % len(COMPLETION_TEMPLATES)][
                "answer_by_topic"
            ][topic]
    return key


def passage_numbers(test_id: str) -> dict[str, list[int]]:
    entry = next(t for t in PACK if t[0] == test_id)
    out: dict[str, list[int]] = {}
    next_number = 1
    for passage_id, _title, _topic, count in entry[3]:
        out[passage_id] = list(range(next_number, next_number + count))
        next_number += count
    return out


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
                    "base_url": "mock://llm",
                    "model": "mock-model-1",
                    "api_key": "",
                }
            }
        )
        seed_pack()
        yield test_client

    db_engine.reset_engine()
    reset_settings_cache()
    settings_store.invalidate_cache()


def sit_passage(
    client: TestClient, passage_id: str, answers: dict[str, str] | None = None
) -> dict[str, Any]:
    """Sit and submit one passage, which is what opens the gate on it."""
    started = client.post(
        "/api/v1/reading/attempts", json={"mode": "passage", "passage_id": passage_id}
    )
    assert started.status_code == 201, started.text
    attempt_id = started.json()["attempt_id"]
    submitted = client.post(
        f"/api/v1/reading/attempts/{attempt_id}/submit",
        json={"answers": answers or {}, "duration_s": 900},
    )
    assert submitted.status_code == 200, submitted.text
    return {"attempt_id": attempt_id, "score": submitted.json()}


def teaching(client: TestClient, passage_id: str) -> dict[str, Any]:
    response = client.get(f"/api/v1/reading/coach/passages/{passage_id}/teaching")
    assert response.status_code == 200, response.text
    return response.json()


# ======================================================================================
# The gate
# ======================================================================================


def test_worked_solutions_are_absent_before_an_attempt(client: TestClient) -> None:
    doc = teaching(client, "rp_mk_ac_01_p1")

    assert doc["gate"]["unlocked"] is False
    assert doc["gate"]["reason"] == "not_attempted"
    assert doc["gate"]["message"]
    assert "questions[].evidence_quote" in doc["gate"]["gated_fields"]

    # Absent, not truncated: there is no field to reveal with a devtools toggle.
    assert all(q["solution"] is None for q in doc["questions"])
    assert all(q["locked"] is True for q in doc["questions"])
    body = json.dumps(doc)
    assert "the years when the creek was dredged" not in body  # an evidence quote
    assert "stem density" not in body  # a keyed completion answer
    assert "absence_read_as_contradiction" not in body  # a trap slug names the verdict

    # The existence of the material is still advertised, so the UI can render a locked
    # card rather than an empty screen.
    assert doc["solutions_available"] == 14
    assert doc["teaching_available"] is True


def test_preparation_material_is_never_gated(client: TestClient) -> None:
    """A skim plan and a strategy card teach how to attack, not what the answer is."""
    doc = teaching(client, "rp_mk_ac_01_p1")

    assert doc["skim_plan"]["read_first"]
    assert doc["skim_plan"]["budget_s"] == 120
    assert doc["groups"][0]["strategy"]
    assert doc["groups"][0]["order_badge"] == "In passage order"
    assert doc["groups"][0]["type_page"]["label"] == "True / False / Not Given"
    assert [f["concept"] for f in doc["paraphrase_families"]] == [
        "changes with",
        "most people think",
    ]
    assert doc["pacing"]["target_minutes"] == 16

    # …but the parts of it that point at a specific question do wait.
    assert doc["skim_plan"]["map"] == []
    assert doc["skim_plan"]["map_locked"] is True
    assert doc["skim_plan"]["map_size"] == 3
    assert all(h["why_here"] is None for h in doc["hinge_words"])
    assert all(item["blocks_q"] is None for item in doc["mineable"])


def test_a_submitted_attempt_opens_the_passage(client: TestClient) -> None:
    sit_passage(client, "rp_mk_ac_01_p1", {"1": "TRUE"})
    doc = teaching(client, "rp_mk_ac_01_p1")

    assert doc["gate"]["unlocked"] is True
    assert doc["gate"]["reason"] == "attempted"
    assert doc["gate"]["evidence"] == "passage"
    assert doc["gate"]["gated_fields"] == []

    first = doc["questions"][0]
    solution = first["solution"]
    # The five parts of the Solution Card, in the order the review screen renders them.
    assert solution["evidence_quote"] == "the years when the creek was dredged"
    assert solution["paraphrase_link"]["stem_phrase"]
    assert solution["paraphrase_link"]["meaning_preserving"] is True
    assert solution["decision_rule"]
    assert len(solution["distractors"]) == 2  # both non-keyed TFNG choices
    assert solution["reusable_rule"]
    assert solution["accepted_answers"] == ["true"]

    assert doc["skim_plan"]["map"][0] == {"paragraph": "A", "label": "what it is"}
    assert doc["hinge_words"][0]["why_here"]
    assert doc["mineable"][0]["blocks_q"] is not None
    assert {t["slug"] for t in doc["trap_profile"]} >= {
        "absence_read_as_contradiction",
        "contradiction_read_as_absence",
    }


def test_attempting_one_passage_does_not_open_another(client: TestClient) -> None:
    sit_passage(client, "rp_mk_ac_01_p1", {"1": "TRUE"})
    assert teaching(client, "rp_mk_ac_01_p1")["gate"]["unlocked"] is True
    assert teaching(client, "rp_mk_ac_01_p2")["gate"]["unlocked"] is False


def test_an_unsubmitted_attempt_does_not_open_the_gate(client: TestClient) -> None:
    """A test still in progress has not been sat, and must not unlock mid-paper."""
    started = client.post(
        "/api/v1/reading/attempts",
        json={"mode": "passage", "passage_id": "rp_mk_ac_01_p1"},
    )
    assert started.status_code == 201
    assert teaching(client, "rp_mk_ac_01_p1")["gate"]["unlocked"] is False


def test_a_full_test_attempt_opens_all_three_of_its_passages(client: TestClient) -> None:
    started = client.post(
        "/api/v1/reading/attempts", json={"mode": "full", "test_id": AC_TEST_1}
    )
    assert started.status_code == 201, started.text
    attempt_id = started.json()["attempt_id"]
    client.post(
        f"/api/v1/reading/attempts/{attempt_id}/submit",
        json={"answers": answer_key(AC_TEST_1)},
    )
    for passage_id in ("rp_mk_ac_01_p1", "rp_mk_ac_01_p2", "rp_mk_ac_01_p3"):
        gate = teaching(client, passage_id)["gate"]
        assert gate["unlocked"] is True, passage_id
        assert gate["evidence"] == "test"
    # …and not the second paper's.
    assert teaching(client, "rp_mk_ac_02_p1")["gate"]["unlocked"] is False


def test_a_live_mock_shuts_the_coach_on_an_unlocked_passage(client: TestClient) -> None:
    """The property a mock has no value without, tested against the unlock path."""
    sit_passage(client, "rp_mk_ac_01_p1", {"1": "TRUE"})
    assert teaching(client, "rp_mk_ac_01_p1")["gate"]["unlocked"] is True

    opened = client.post("/api/v1/reading/mock/sessions", json={"module": "academic"})
    assert opened.status_code == 201, opened.text

    doc = teaching(client, "rp_mk_ac_01_p1")
    assert doc["gate"]["unlocked"] is False
    assert doc["gate"]["reason"] == "exam_conditions"
    assert doc["questions"] == []
    assert doc["groups"] == []
    assert doc["skim_plan"] is None
    assert doc["exam_conditions"]["dictionary_enabled"] is False

    # Every other coach surface refuses outright rather than answering thinly.
    for path in (
        "/api/v1/reading/coach/strategy",
        "/api/v1/reading/coach/traps",
        "/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1",
    ):
        assert client.get(path).status_code == 409, path

    client.post(f"/api/v1/reading/mock/sessions/{opened.json()['mock_id']}/abandon")
    assert teaching(client, "rp_mk_ac_01_p1")["gate"]["unlocked"] is True


# ======================================================================================
# Strategy
# ======================================================================================


def test_strategy_carries_the_static_page_and_the_authored_plans(client: TestClient) -> None:
    response = client.get("/api/v1/reading/coach/strategy", params={"type": "matching_headings"})
    assert response.status_code == 200, response.text
    body = response.json()

    page = body["types"][0]["page"]
    assert page["answer_order"] == "scattered"
    assert page["order_badge"] == "Not in order"
    assert page["gear"] == "skim"
    assert len(page["characteristic_losses"]) == 2
    # The type is not in our fixture pack, and the static page still answers.
    assert body["types"][0]["in_bank"] is False
    assert body["one_line_rule"]


def test_strategy_lists_every_authored_group_for_a_type(client: TestClient) -> None:
    body = client.get(
        "/api/v1/reading/coach/strategy",
        params={"type": "true_false_not_given", "format": "academic"},
    ).json()
    entry = body["types"][0]

    assert entry["authored_groups"] == 6  # two Academic papers × three passages
    assert entry["questions"] == 42
    assert all(g["format"] == "academic" for g in entry["groups"])
    assert all(g["strategy"] for g in entry["groups"])
    assert all(g["answer_order"] == "sequential" for g in entry["groups"])

    gt = client.get(
        "/api/v1/reading/coach/strategy",
        params={"type": "true_false_not_given", "format": "general_training"},
    ).json()
    assert gt["types"][0]["authored_groups"] == 3


def test_strategy_refuses_an_unknown_type(client: TestClient) -> None:
    response = client.get("/api/v1/reading/coach/strategy", params={"type": "cloze"})
    assert response.status_code == 422
    assert "cloze" in response.json()["detail"]


def test_sequential_and_section_local_carry_the_facts_learners_lack(client: TestClient) -> None:
    """The two order facts worth the most marks per word of explanation."""
    from bandready.reading import coach

    endings = coach.TYPE_STRATEGY["matching_sentence_endings"]
    assert endings.answer_order == "sequential", "the one matching type that runs in order"
    for name in ("summary_completion", "table_completion", "note_completion"):
        assert coach.TYPE_STRATEGY[name].answer_order == "section_local"
    assert "one section" in coach.ORDER_NOTES["section_local"].lower()


# ======================================================================================
# Paraphrase and mining
# ======================================================================================


def test_paraphrase_families_are_open_and_the_links_are_gated(client: TestClient) -> None:
    body = client.get("/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1").json()

    assert body["locked"] is True
    assert body["links"] == []
    assert body["links_available"] == 14  # the UI can say what is waiting
    assert len(body["families"]) == 2
    assert "varies with" not in json.dumps(body["links"])
    # No family rewording may itself appear in the passage — that is what makes it a
    # rewording rather than a hint.
    assert "is conditional on" in body["families"][0]["rewordings"]

    sit_passage(client, "rp_mk_ac_01_p1", {"1": "TRUE"})
    opened = client.get("/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1").json()
    assert opened["locked"] is False
    assert len(opened["links"]) == 14
    first = opened["links"][0]
    assert first["stem_phrase"] and first["text_phrase"]
    assert first["source_sentence"]  # the sentence the pair was cut from
    assert opened["gym"]["name_it"] == 14
    assert opened["devices"]["scope_change"]["preserving"] is False


def test_mining_is_constrained_to_words_that_cost_a_mark(client: TestClient) -> None:
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    key = answer_key(AC_TEST_1)
    # Answer everything correctly except the two questions the mineable items block.
    blocked = [numbers[1], numbers[2]]
    answers = {str(n): key[str(n)] for n in numbers}
    for number in blocked:
        answers[str(number)] = "true" if key[str(number)] != "true" else "false"

    sat = sit_passage(client, "rp_mk_ac_01_p1", answers)

    pushed = client.post(
        "/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1/push",
        json={"attempt_id": sat["attempt_id"]},
    )
    assert pushed.status_code == 201, pushed.text
    body = pushed.json()
    assert body["filtered_to_missed"] is True
    assert body["requested"] == 2
    assert body["cap"] == 5

    # Filed as suggestions, never scheduled: the learner accepts from the inbox.
    inbox = client.get("/api/v1/vocab/suggestions").json()
    terms = {item["headword"].lower() for item in inbox["items"]}
    assert {"varies with", "disputes the figure"} <= terms

    # The card is the paraphrase pair plus its source sentence, not a bare headword.
    entry = next(i for i in inbox["items"] if i["headword"].lower() == "varies with")
    assert entry["definition"] == "changes depending on"


def test_mining_refuses_words_that_did_not_block_a_mark(client: TestClient) -> None:
    key = answer_key(AC_TEST_1)
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    sat = sit_passage(
        client, "rp_mk_ac_01_p1", {str(n): key[str(n)] for n in numbers}
    )
    response = client.post(
        "/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1/push",
        json={"attempt_id": sat["attempt_id"]},
    )
    assert response.status_code == 422
    assert "did not need" in response.json()["detail"]


def test_mining_rejects_a_term_the_passage_does_not_carry(client: TestClient) -> None:
    response = client.post(
        "/api/v1/reading/coach/paraphrase/rp_mk_ac_01_p1/push",
        json={"items": ["photovoltaic"]},
    )
    assert response.status_code == 422
    assert "photovoltaic" in response.json()["detail"]


# ======================================================================================
# Why was I wrong?
# ======================================================================================


def test_why_wrong_uses_this_item_s_own_autopsy(client: TestClient) -> None:
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    key = answer_key(AC_TEST_1)
    # Question 3 is the NOT GIVEN item; answering FALSE is the commonest error in the
    # paper and the fixture authored a distractor entry for exactly that choice.
    not_given_number = numbers[2]
    assert key[str(not_given_number)] == "not given"
    sat = sit_passage(client, "rp_mk_ac_01_p1", {str(not_given_number): "FALSE"})

    response = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": sat["attempt_id"], "number": not_given_number},
    )
    assert response.status_code == 200, response.text
    card = response.json()

    assert card["source"] == "authored"
    assert card["your_option"]["key"] == "false"
    assert card["your_option"]["diagnosis"] == "no_contradiction"
    assert card["your_option"]["why_tempting"]
    assert [d["key"] for d in card["other_distractors"]] == ["true"]
    assert card["trap"]["slug"] == "absence_read_as_contradiction"
    assert card["trap"]["family"] == "J"
    assert card["nearest_text"] == "disputes the figure"  # the sentence that tempts you
    assert card["rule"]
    assert card["next_action"]


def test_the_learner_s_own_answer_decides_which_trap_leads(client: TestClient) -> None:
    """An over-length answer is a form loss, whatever the item's authored trap is."""
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    completion = numbers[7]  # the first completion item on this passage
    sat = sit_passage(
        client,
        "rp_mk_ac_01_p1",
        {str(completion): "a fall of eleven centimetres"},
    )
    card = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": sat["attempt_id"], "number": completion},
    ).json()

    assert card["trap"]["slug"] == "over_limit"
    assert card["trap"]["family"] == "F"
    assert "over_limit" in [t["slug"] for t in card["form_traps"]]
    assert "count the words" in card["next_action"].lower()


def test_a_blank_is_diagnosed_as_pacing_not_comprehension(client: TestClient) -> None:
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    sat = sit_passage(client, "rp_mk_ac_01_p1", {})
    card = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": sat["attempt_id"], "number": numbers[0]},
    ).json()
    assert card["trap"]["slug"] == "ran_out_of_time"
    assert card["trap"]["family"] == "F"


def test_why_wrong_falls_back_to_the_model_without_an_authored_autopsy(
    client: TestClient,
) -> None:
    """A passage authored before the teaching pass still gets an explanation."""
    from sqlalchemy import text as sa_text

    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.execute(
            sa_text("SELECT passage_json FROM reading_passages WHERE id = 'rp_mk_ac_01_p1'")
        ).first()
        doc = json.loads(row[0])
        doc.pop("teaching", None)
        for group in doc["question_groups"]:
            group.pop("teaching", None)
            for question in group["questions"]:
                question.pop("teaching", None)
        s.execute(
            sa_text("UPDATE reading_passages SET passage_json = :doc WHERE id = :id"),
            {"doc": json.dumps(doc), "id": "rp_mk_ac_01_p1"},
        )

    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    sat = sit_passage(client, "rp_mk_ac_01_p1", {str(numbers[1]): "true"})
    card = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": sat["attempt_id"], "number": numbers[1]},
    ).json()

    assert card["source"] == "model"
    assert card["what_the_text_says"]
    # The model's free-text trap is coerced back onto the closed taxonomy, because the
    # slug is simultaneously a drill filter and a progress axis.
    assert card["trap"]["slug"] == "scope_shift"

    # …and the payload really was empty, so this exercised the fallback rather than the
    # authored path.
    assert teaching(client, "rp_mk_ac_01_p1")["teaching_available"] is False


def test_why_wrong_refuses_a_correct_answer_and_an_open_attempt(client: TestClient) -> None:
    numbers = passage_numbers(AC_TEST_1)["rp_mk_ac_01_p1"]
    sat = sit_passage(client, "rp_mk_ac_01_p1", {str(numbers[0]): "TRUE"})
    correct = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": sat["attempt_id"], "number": numbers[0]},
    )
    assert correct.status_code == 422

    started = client.post(
        "/api/v1/reading/attempts",
        json={"mode": "passage", "passage_id": "rp_mk_ac_01_p2"},
    ).json()
    open_attempt = client.post(
        "/api/v1/reading/coach/why-wrong",
        json={"attempt_id": started["attempt_id"], "number": 15},
    )
    assert open_attempt.status_code == 409


# ======================================================================================
# The taxonomy itself
# ======================================================================================


def test_the_trap_taxonomy_is_closed_and_separates_form_from_comprehension(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/reading/coach/traps").json()
    families = {entry["family"]: entry for entry in body["families"]}

    assert set(families) == {"J", "P", "L", "F"}
    slugs = {t["slug"] for entry in body["families"] for t in entry["traps"]}
    assert body["count"] == len(slugs)
    # The two inverse judgement errors, which is the pair the whole type turns on.
    assert {"absence_read_as_contradiction", "contradiction_read_as_absence"} <= slugs
    # Form and process losses are counted apart: they need a pacing fix and an
    # answer-form fix, not a reading fix.
    form = {t["slug"] for t in families["F"]["traps"]}
    assert {"over_limit", "spelling", "ran_out_of_time"} <= form
    assert not form & {t["slug"] for t in families["J"]["traps"]}

    assert body["devices"]["modality_change"]["preserving"] is False
    assert body["devices"]["synonym"]["preserving"] is True
