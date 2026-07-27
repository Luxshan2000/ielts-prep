"""Reading drills: selection, the trap reveal, the two-stage scaffold, and grading.

The fixture below is a miniature pack carrying the full ``schema_version: 2`` teaching
payload — trap slugs, distractor autopsies, paraphrase links, a skim plan — because every
behaviour worth testing here is a behaviour that reads one of those fields. A second
passage exists so that "pull from across the pack" can actually be observed rather than
asserted, and one deliberately payload-free question exists so the degrade path is
exercised too.

What these tests are really protecting:

* the key, the trap and the device answer are **absent from a served item**, not merely
  unrendered — a drill that ships its own answer measures nothing;
* the trap reveal names the **rival verdict** for this statement, which is the one thing
  a TFNG learner needs and the one thing a generic explanation never says;
* the two-stage scaffold separates *did not locate it* from *located it and read it the
  wrong way*, because those are two diagnoses with two different remedies;
* every verdict goes through the shared matcher, so ``n.g.`` and ``1,500`` behave in a
  drill exactly as they behave in the player.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from ulid import ULID

from bandready.db import engine as db_engine
from bandready.db import models as m
from bandready.db.engine import session_scope
from bandready.reading import drills

PRACTICE = "/api/v1/reading/practice"


# ======================================================================================
# A miniature pack with a real teaching payload
# ======================================================================================

PARAGRAPHS_ONE = [
    {
        "id": "A",
        "text": (
            "The Verdon tramway opened in 1898 and ran for thirty-one years. It was built "
            "to carry stone down from the quarries above Norland, and passengers were an "
            "afterthought that the company never advertised."
        ),
    },
    {
        "id": "B",
        "text": (
            "Costs rose steadily after 1910. Timber sleepers on the upper section had to be "
            "replaced every four years, and the company borrowed twice to pay for the work."
        ),
    },
    {
        "id": "C",
        "text": (
            "Ashfield's own line, opened in the same decade, used steel sleepers throughout. "
            "Its operating accounts have not survived, so nothing is known about what it "
            "spent on maintenance."
        ),
    },
    {
        "id": "D",
        "text": (
            "The tramway closed in 1929. Lorries had taken the stone traffic, and the "
            "directors were unable to persuade the county to subsidise the passenger "
            "service they had never promoted."
        ),
    },
]

QUESTIONS_ONE: list[dict[str, Any]] = [
    {
        "id": "g1",
        "type": "true_false_not_given",
        "instructions_extra": "Do the following statements agree with the information given?",
        "word_limit": None,
        "allow_reuse": True,
        "options": None,
        "layout": None,
        "teaching": {
            "schema_version": 1,
            "answer_order": "sequential",
            "section_scope": None,
            "strategy": (
                "These four run A, B, C, D, one paragraph apart. Underline the quantifier or "
                "the comparative in each statement before you go near the text."
            ),
            "order_note": "In passage order. Q2's answer lies below Q1's — search that band.",
            "time_budget_s": 280,
            "watch_out": "One statement invites a comparison the passage never makes.",
        },
        "questions": [
            {
                "number": 1,
                "prompt": "The tramway was built mainly to carry passengers.",
                "answers": [{"value": "FALSE"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "passengers were an afterthought",
                "explanation": "Paragraph A says the line was built to carry stone.",
                "trap_note": "Missed contradiction: 'an afterthought' denies the statement.",
                "difficulty": "easy",
                "band_target": 5.5,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "mainly to carry passengers",
                        "text_phrase": "passengers were an afterthought",
                        "devices": ["negated_antonym"],
                        "note": "'an afterthought' is the negation of 'the main purpose'.",
                    },
                    "decision_rule": (
                        "The purpose is stated and it is stone, not passengers. The text "
                        "denies the statement, so FALSE rather than NOT GIVEN."
                    ),
                    "distractors": [
                        {
                            "key": "TRUE",
                            "why_tempting": "Passengers are mentioned twice, so the topic "
                                            "feels supported.",
                            "why_wrong": "Being mentioned is not being the purpose.",
                            "diagnosis": "reversed",
                        },
                        {
                            "key": "NOT GIVEN",
                            "why_tempting": "The word 'mainly' appears nowhere in the text.",
                            "why_wrong": "'an afterthought' denies primacy explicitly.",
                            "diagnosis": "contradiction_present",
                        },
                    ],
                    "reusable_rule": "A word that ranks two things is a claim you must find, "
                                     "not one you may assume.",
                    "traps": ["contradiction_read_as_absence"],
                    "gear": "close",
                },
            },
            {
                "number": 2,
                "prompt": "The company raised money on more than one occasion.",
                "answers": [{"value": "TRUE"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "the company borrowed twice to pay for the work",
                "explanation": "Paragraph B says the company borrowed twice.",
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 6.0,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "raised money on more than one occasion",
                        "text_phrase": "borrowed twice to pay for the work",
                        "devices": ["synonym", "figure_restatement"],
                        "note": "'twice' is restated as 'more than one occasion'.",
                    },
                    "decision_rule": (
                        "Borrowing is raising money and twice is more than once, so every "
                        "part of the statement is supported."
                    ),
                    "distractors": [
                        {
                            "key": "FALSE",
                            "why_tempting": "'Raised money' is not the wording used.",
                            "why_wrong": "Nothing denies it; the wording simply differs.",
                            "diagnosis": "no_contradiction",
                        },
                        {
                            "key": "NOT GIVEN",
                            "why_tempting": "A keyword search for 'raised' returns nothing.",
                            "why_wrong": "'borrowed twice' states it in other words.",
                            "diagnosis": "support_present",
                        },
                    ],
                    "reusable_rule": "A number in the text can license a vaguer quantity in "
                                     "the statement.",
                    "traps": ["paraphrase_missed"],
                    "gear": "search",
                },
            },
            {
                "number": 3,
                "prompt": "Ashfield's line cost less to maintain than the Verdon tramway.",
                "answers": [{"value": "NOT GIVEN"}],
                "anchor_paragraphs": ["C"],
                "evidence_quote": "Its operating accounts have not survived",
                "explanation": (
                    "Paragraph C says Ashfield's accounts are lost, so no comparison of "
                    "maintenance cost is available."
                ),
                "trap_note": "Invented comparison built out of the steel sleepers.",
                "difficulty": "hard",
                "band_target": 7.5,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "cost less to maintain",
                        "text_phrase": "used steel sleepers throughout",
                        "devices": ["compression"],
                        "note": "Steel lasting longer is a fact you supply, not one stated.",
                    },
                    "decision_rule": (
                        "Costs are given for one line and explicitly unavailable for the "
                        "other, so no sentence supports or denies the ranking."
                    ),
                    "distractors": [
                        {
                            "key": "TRUE",
                            "why_tempting": "Steel outlasts timber, so the ranking follows "
                                            "from what the reader already knows.",
                            "why_wrong": "That step is the reader's, not the text's.",
                            "diagnosis": "unstated",
                        },
                        {
                            "key": "FALSE",
                            "why_tempting": "Only Verdon's borrowing is described, which "
                                            "reads like a denial of any Ashfield saving.",
                            "why_wrong": "Silence about Ashfield is not a denial.",
                            "diagnosis": "no_contradiction",
                        },
                    ],
                    "reusable_rule": "Two facts placed side by side do not make the "
                                     "comparison between them.",
                    "traps": ["comparison_invented", "absence_read_as_contradiction"],
                    "nearest_text": "Ashfield's own line, opened in the same decade, used "
                                    "steel sleepers throughout",
                    "gear": "close",
                },
            },
            {
                "number": 4,
                "prompt": "The county refused to fund the passenger service.",
                "answers": [{"value": "TRUE"}],
                "anchor_paragraphs": ["D"],
                "evidence_quote": "unable to persuade the county to subsidise the passenger service",
                "explanation": "Paragraph D says the directors could not persuade the county.",
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 6.5,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "refused to fund the passenger service",
                        "text_phrase": "unable to persuade the county to subsidise",
                        "devices": ["negated_antonym", "synonym"],
                        "note": "'unable to persuade' is the converse of 'refused'.",
                    },
                    "decision_rule": (
                        "A failed persuasion is a refusal by the other party, and subsidy "
                        "is funding, so the statement is fully supported."
                    ),
                    "distractors": [
                        {
                            "key": "FALSE",
                            "why_tempting": "'Refused' is stronger than anything on the page.",
                            "why_wrong": "It is the same event described from the other side.",
                            "diagnosis": "no_contradiction",
                        },
                        {
                            "key": "NOT GIVEN",
                            "why_tempting": "No sentence contains the word 'refused'.",
                            "why_wrong": "The failure to persuade states the outcome.",
                            "diagnosis": "support_present",
                        },
                    ],
                    "reusable_rule": "Failing to persuade someone and being refused by them "
                                     "are one event with two descriptions.",
                    "traps": ["paraphrase_missed"],
                    "gear": "close",
                },
            },
        ],
    },
    {
        "id": "g2",
        "type": "matching_headings",
        "instructions_extra": None,
        "word_limit": None,
        "allow_reuse": False,
        "options": [
            {"key": "i", "text": "Why the line was laid"},
            {"key": "ii", "text": "Money running out"},
            {"key": "iii", "text": "A neighbour we cannot compare with"},
            {"key": "iv", "text": "Stone quarrying in the north"},
        ],
        "layout": None,
        "teaching": {
            "schema_version": 1,
            "answer_order": "scattered",
            "section_scope": None,
            "strategy": "Say each paragraph's job in six words before you look at the list.",
            "order_note": "Not in order. Do the two you are sure of first.",
            "time_budget_s": 210,
            "watch_out": "Heading iv names the passage's subject, not any paragraph's job.",
        },
        "questions": [
            {
                "number": 5,
                "prompt": "Paragraph A",
                "answers": [{"value": "i"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "It was built to carry stone down from the quarries",
                "explanation": "Paragraph A is about why the line existed.",
                "trap_note": None,
                "difficulty": "medium",
                "band_target": 6.0,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "Why the line was laid",
                        "text_phrase": "built to carry stone down from the quarries",
                        "devices": ["nominalisation"],
                        "note": "The heading nominalises the paragraph's purpose clause.",
                    },
                    "decision_rule": (
                        "The paragraph's controlling idea is the reason for building, not "
                        "the quarrying it mentions in passing."
                    ),
                    "distractors": [
                        {
                            "key": "iv",
                            "why_tempting": "Quarries are named in the first sentence.",
                            "why_wrong": "Quarrying is the setting, not the paragraph's job.",
                            "diagnosis": "too_broad",
                        },
                        {
                            "key": "ii",
                            "why_tempting": "A reader who has not yet read B has ii spare.",
                            "why_wrong": "No money is discussed in A at all.",
                            "diagnosis": "right_words_wrong_paragraph",
                        },
                    ],
                    "reusable_rule": "A heading names what a paragraph does, not what it "
                                     "mentions on the way.",
                    "traps": ["detail_for_main_idea", "heading_too_broad"],
                    "gear": "skim",
                },
            },
            {
                "number": 6,
                "prompt": "Paragraph B",
                "answers": [{"value": "ii"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "Costs rose steadily after 1910",
                "explanation": "Paragraph B is about rising costs and borrowing.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.5,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "Money running out",
                        "text_phrase": "Costs rose steadily after 1910",
                        "devices": ["gloss_swap"],
                        "note": "The heading glosses a rising-cost paragraph.",
                    },
                    "decision_rule": "Every sentence in B is about expenditure.",
                    "distractors": [
                        {
                            "key": "iii",
                            "why_tempting": "Both paragraphs mention another line's costs.",
                            "why_wrong": "Ashfield appears only in C.",
                            "diagnosis": "right_words_wrong_paragraph",
                        },
                        {
                            "key": "iv",
                            "why_tempting": "Quarry traffic is what the costs were for.",
                            "why_wrong": "It names the passage's subject, not B's job.",
                            "diagnosis": "too_broad",
                        },
                    ],
                    "reusable_rule": "When every sentence names one thing, that thing is "
                                     "the heading.",
                    "traps": ["parallel_decoy"],
                    "gear": "skim",
                },
            },
            {
                "number": 7,
                "prompt": "Paragraph C",
                "answers": [{"value": "iii"}],
                "anchor_paragraphs": ["C"],
                "evidence_quote": "nothing is known about what it spent on maintenance",
                "explanation": "Paragraph C is about the missing Ashfield accounts.",
                "trap_note": None,
                "difficulty": "hard",
                "band_target": 7.0,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "A neighbour we cannot compare with",
                        "text_phrase": "nothing is known about what it spent",
                        "devices": ["clause_restructure"],
                        "note": "'cannot compare' restates 'nothing is known'.",
                    },
                    "decision_rule": (
                        "The paragraph exists to say a comparison is unavailable, which is "
                        "the opposite of describing the neighbour."
                    ),
                    "distractors": [
                        {
                            "key": "ii",
                            "why_tempting": "Maintenance spending is the subject of the "
                                            "last clause.",
                            "why_wrong": "C says the figures are lost, not that they were high.",
                            "diagnosis": "partially_true",
                        },
                        {
                            "key": "iv",
                            "why_tempting": "Nothing else is left once i and ii are placed.",
                            "why_wrong": "Guessing by elimination is what heading iv is for.",
                            "diagnosis": "too_broad",
                        },
                    ],
                    "reusable_rule": "A paragraph whose point is an absence still has a "
                                     "point, and it is the absence.",
                    "traps": ["heading_cascade"],
                    "gear": "skim",
                },
            },
        ],
    },
    {
        "id": "g3",
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
            "strategy": "Both gaps are in paragraph B. Read the frame before you search.",
            "order_note": "In passage order, and both inside one paragraph.",
            "time_budget_s": 80,
            "watch_out": "One answer is a two-word span and the limit is two words.",
        },
        "questions": [
            {
                "number": 8,
                "prompt": "The upper section's {{gap}} needed replacing every four years.",
                "answers": [{"value": "timber sleepers"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "Timber sleepers on the upper section had to be replaced",
                "explanation": "The span appears verbatim in paragraph B.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.0,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "needed replacing every four years",
                        "text_phrase": "had to be replaced every four years",
                        "devices": ["verbalisation"],
                        "note": "The frame verbalises the passage's passive.",
                    },
                    "decision_rule": "The gap follows a possessive, so the answer is the "
                                     "noun phrase that was replaced.",
                    "distractors": [
                        {
                            "key": "sleepers",
                            "why_tempting": "One word is safely inside the limit.",
                            "why_wrong": "It does not distinguish the upper section's timber.",
                            "diagnosis": "wrong_form",
                        }
                    ],
                    "reusable_rule": "Copy the whole noun phrase when the limit allows it.",
                    "traps": [],
                    "grammar_cue": "The possessive before the gap forces a noun.",
                    "gear": "scan",
                },
            },
            {
                "number": 9,
                "prompt": "The tramway closed in {{gap}}.",
                "answers": [{"value": "1929"}],
                "anchor_paragraphs": ["D"],
                "evidence_quote": "The tramway closed in 1929",
                "explanation": "The year appears verbatim in paragraph D.",
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.0,
                "teaching": {
                    "schema_version": 1,
                    "decision_rule": "The date is stated once and only once.",
                    "distractors": [
                        {
                            "key": "1898",
                            "why_tempting": "It is the first year in the passage.",
                            "why_wrong": "That is the opening, not the closure.",
                            "diagnosis": "wrong_period",
                        }
                    ],
                    "reusable_rule": "Two dates in one passage means the frame decides which.",
                    "traps": [],
                    "grammar_cue": "'in' before the gap forces a year, not an event.",
                    "gear": "scan",
                },
            },
        ],
    },
]

PASSAGE_ONE_TEACHING: dict[str, Any] = {
    "schema_version": 1,
    "time_budget_min": 16,
    "difficulty_rationale": {
        "levers": ["implicit_cohesion", "density"],
        "note": "Short text, but the denials are carried by subordinate clauses.",
        "hardest_paragraph": "C",
        "why_hardest": "Its point is an absence, which reads like a description.",
    },
    "skim_plan": {
        "kind": "paragraph_map",
        "read_first": "The title and the whole of paragraph A.",
        "skip": "The sleeper replacement interval — it is a completion answer, not gist.",
        "budget_s": 90,
        "map": [
            {"paragraph": "A", "label": "why it was built"},
            {"paragraph": "B", "label": "costs climbing"},
            {"paragraph": "C", "label": "the missing accounts"},
            {"paragraph": "D", "label": "closure"},
        ],
    },
    "paraphrase_families": [
        {
            "concept": "an afterthought",
            "passage_form": "passengers were an afterthought",
            "paragraph": "A",
            "rewordings": ["never the point", "a secondary consideration",
                           "of marginal importance", "not what it was for"],
            "cefr": "B2",
        }
    ],
    "hinge_words": [
        {"word": "twice", "kind": "quantifier", "why_here": "It decides question 2."},
        {"word": "nothing", "kind": "quantifier", "why_here": "It decides question 3."},
    ],
    "mineable": [
        {"item": "an afterthought", "paragraph": "A", "cefr": "B2",
         "meaning": "something considered only later and briefly", "blocks_q": 1},
    ],
    "metrics": {
        "awl_pct": 9.1,
        "mean_sentence_length": 19,
        "longest_sentence": 28,
        "unknown_token_pct": 0.8,
        "attributed_opinions": 0,
        "quantified_comparisons": 2,
        "abstraction": "concrete",
    },
}

PARAGRAPHS_TWO = [
    {
        "id": "A",
        "text": (
            "Sandmouth harbour silted up faster than its engineers expected. Dredging began "
            "in 1954 and was repeated every second summer for two decades."
        ),
    },
    {
        "id": "B",
        "text": (
            "A breakwater was proposed in 1961. The plan was drawn, costed and abandoned; "
            "no stone was ever laid, although the drawings are still held by the council."
        ),
    },
    {
        "id": "C",
        "text": (
            "Fishing tonnage fell by half between 1960 and 1975. Marlow's fleet, forty miles "
            "along the coast, grew over the same period."
        ),
    },
]

QUESTIONS_TWO: list[dict[str, Any]] = [
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
            "strategy": "Three statements, three paragraphs, in order. Check the tense.",
            "order_note": "In passage order.",
            "time_budget_s": 210,
            "watch_out": "One statement turns a plan into a thing that happened.",
        },
        "questions": [
            {
                "number": 1,
                "prompt": "A breakwater was built at Sandmouth.",
                "answers": [{"value": "FALSE"}],
                "anchor_paragraphs": ["B"],
                "evidence_quote": "no stone was ever laid",
                "explanation": "Paragraph B says the plan was abandoned.",
                "trap_note": "Plan read as implementation.",
                "difficulty": "medium",
                "band_target": 6.0,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "A breakwater was built",
                        "text_phrase": "no stone was ever laid",
                        "devices": ["negated_antonym"],
                        "note": "'no stone laid' is the denial of 'was built'.",
                    },
                    "decision_rule": (
                        "The proposal is described and its abandonment is stated, so the "
                        "text denies the statement outright."
                    ),
                    "distractors": [
                        {
                            "key": "TRUE",
                            "why_tempting": "Drawn and costed reads like progress towards "
                                            "building.",
                            "why_wrong": "The same sentence says it was abandoned.",
                            "diagnosis": "wrong_period",
                        },
                        {
                            "key": "NOT GIVEN",
                            "why_tempting": "The word 'built' never appears.",
                            "why_wrong": "'no stone was ever laid' denies it in other words.",
                            "diagnosis": "contradiction_present",
                        },
                    ],
                    "reusable_rule": "A plan is not an event. Check whether anything "
                                     "actually happened.",
                    "traps": ["time_shift", "contradiction_read_as_absence"],
                    "gear": "close",
                },
            },
            {
                "number": 2,
                "prompt": "Dredging at Sandmouth took place annually.",
                "answers": [{"value": "FALSE"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "repeated every second summer for two decades",
                "explanation": "Every second summer is not annual.",
                "trap_note": "Frequency shift.",
                "difficulty": "easy",
                "band_target": 5.5,
                "teaching": {
                    "schema_version": 1,
                    "paraphrase_link": {
                        "stem_phrase": "took place annually",
                        "text_phrase": "repeated every second summer",
                        "devices": ["scope_change"],
                        "note": "The statement doubles the stated frequency.",
                    },
                    "decision_rule": (
                        "The interval is stated and it is two years, which contradicts "
                        "'annually' rather than leaving it open."
                    ),
                    "distractors": [
                        {
                            "key": "TRUE",
                            "why_tempting": "'Every summer' is what a fast reader sees.",
                            "why_wrong": "'every second summer' is the text.",
                            "diagnosis": "overstated",
                        },
                        {
                            "key": "NOT GIVEN",
                            "why_tempting": "The word 'annually' is absent.",
                            "why_wrong": "The interval is stated, so the text settles it.",
                            "diagnosis": "contradiction_present",
                        },
                    ],
                    "reusable_rule": "A frequency word in the statement must be matched "
                                     "against a frequency word in the text.",
                    "traps": ["scope_shift"],
                    "gear": "close",
                },
            },
            {
                "number": 3,
                "prompt": "Marlow's fishermen bought boats from Sandmouth.",
                "answers": [{"value": "NOT GIVEN"}],
                "anchor_paragraphs": ["C"],
                "evidence_quote": "Marlow's fleet, forty miles along the coast, grew",
                "explanation": "The passage never says where Marlow's boats came from.",
                "trap_note": "Causal link assumed between one fleet's decline and another's growth.",
                "difficulty": "hard",
                "band_target": 7.5,
                "teaching": {
                    "schema_version": 1,
                    "decision_rule": (
                        "One fleet shrinks and another grows in the same years, and no "
                        "sentence connects the two, so nothing supports or denies it."
                    ),
                    "distractors": [
                        {
                            "key": "TRUE",
                            "why_tempting": "A shrinking fleet selling to a growing one is "
                                            "the obvious story.",
                            "why_wrong": "The obvious story is the reader's, not the text's.",
                            "diagnosis": "unstated",
                        },
                        {
                            "key": "FALSE",
                            "why_tempting": "Forty miles sounds like too far to buy a boat.",
                            "why_wrong": "Nothing in the passage rules the sale out either.",
                            "diagnosis": "no_contradiction",
                        },
                    ],
                    "reusable_rule": "Two trends in the same years are not a transaction "
                                     "between them.",
                    "traps": ["causal_link_assumed", "absence_read_as_contradiction"],
                    "nearest_text": "Marlow's fleet, forty miles along the coast, grew over "
                                    "the same period",
                    "gear": "close",
                },
            },
        ],
    },
    {
        "id": "g2",
        "type": "short_answer",
        "instructions_extra": None,
        "word_limit": {"max_words": 1, "numbers_allowed": True},
        "allow_reuse": False,
        "options": None,
        "layout": None,
        "questions": [
            {
                "number": 4,
                "prompt": "In which year did dredging begin?",
                "answers": [{"value": "1954"}],
                "anchor_paragraphs": ["A"],
                "evidence_quote": "Dredging began in 1954",
                "explanation": "Stated verbatim in paragraph A.",
                # Deliberately payload-free: the degrade path has to keep working.
                "trap_note": None,
                "difficulty": "easy",
                "band_target": 5.0,
            }
        ],
    },
]

PASSAGE_TWO_TEACHING: dict[str, Any] = {
    "schema_version": 1,
    "time_budget_min": 20,
    "skim_plan": {
        "kind": "paragraph_map",
        "read_first": "The first paragraph in full.",
        "skip": "The dredging dates — those are scan answers, not gist.",
        "budget_s": 75,
        "map": [
            {"paragraph": "A", "label": "silting and dredging"},
            {"paragraph": "B", "label": "the breakwater that never was"},
            {"paragraph": "C", "label": "two fleets diverging"},
        ],
    },
    "paraphrase_families": [],
    "hinge_words": [],
    "mineable": [],
    "metrics": {"awl_pct": 8.4, "mean_sentence_length": 18, "longest_sentence": 26,
                "unknown_token_pct": 0.5, "attributed_opinions": 0,
                "quantified_comparisons": 3, "abstraction": "concrete"},
}


def build_doc(
    passage_id: str,
    title: str,
    paragraphs: list[dict[str, str]],
    groups: list[dict[str, Any]],
    teaching: dict[str, Any] | None,
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "schema_version": 2 if teaching else 1,
        "id": passage_id,
        "position": 1,
        "title": title,
        "topic": "transport history",
        "difficulty": "medium",
        "gt_section": None,
        "word_count": sum(len(p["text"].split()) for p in paragraphs),
        "texts": [{"id": "t1", "heading": None, "paragraphs": paragraphs}],
        "question_groups": json.loads(json.dumps(groups)),
    }
    if teaching:
        doc["teaching"] = json.loads(json.dumps(teaching))
    return doc


def seed_passage(
    session,
    passage_id: str,
    title: str,
    paragraphs: list[dict[str, str]],
    groups: list[dict[str, Any]],
    teaching: dict[str, Any] | None,
) -> str:
    doc = build_doc(passage_id, title, paragraphs, groups, teaching)
    session.add(
        m.ReadingPassage(
            id=passage_id,
            format="academic",
            title=title,
            word_count=int(doc["word_count"]),
            band_target=6.5,
            passage_json=json.dumps(doc),
            source="pack",
            license="CC-BY-4.0",
        )
    )
    for group_index, group in enumerate(doc["question_groups"]):
        limit = group.get("word_limit")
        for question in group["questions"]:
            session.add(
                m.ReadingQuestion(
                    id=f"rq_{ULID()}",
                    passage_id=passage_id,
                    number=question["number"],
                    group_index=group_index,
                    qtype=group["type"],
                    word_limit=limit["max_words"] if limit else None,
                    answers_json=json.dumps(question["answers"]),
                    anchor_paragraphs_json=json.dumps(question["anchor_paragraphs"]),
                    evidence_quote=question["evidence_quote"],
                    explanation=question["explanation"],
                    trap_note=question.get("trap_note"),
                )
            )
    session.flush()
    return passage_id


# ======================================================================================
# Fixtures
# ======================================================================================

@pytest.fixture(scope="module")
def client(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    data_dir = tmp_path_factory.mktemp("bandready-reading-drills")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("BANDREADY_DATA_DIR", str(data_dir))
        mp.setenv("BANDREADY_ENABLE_MOCK", "1")
        mp.setenv("BANDREADY_AUTH_TOKEN", "test-token")
        mp.delenv("BANDREADY_PARENT_PID", raising=False)

        from bandready import config as br_config
        from bandready import settings_store

        br_config.reset_settings_cache()
        db_engine.reset_engine()
        db_engine.run_migrations()
        settings_store.invalidate_cache()
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

        from bandready.server.app import create_app

        app = create_app()
        with TestClient(app, base_url="http://127.0.0.1") as test_client:
            test_client.headers.update({"Authorization": "Bearer test-token"})
            yield test_client

        db_engine.reset_engine()
        settings_store.invalidate_cache()
        br_config.reset_settings_cache()


@pytest.fixture()
def bank(client: TestClient) -> Iterator[tuple[str, str]]:
    """Two seeded passages, torn down between tests so the census cache cannot leak."""
    drills._CENSUS_CACHE.clear()
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.DrillResult))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingQuestion))
        # The core-en pack is imported at startup and its test rows reference passages,
        # so the tests own the whole reading bank for the duration of this module.
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingPassage))
        one = seed_passage(session, "rp_t1", "The Verdon tramway",
                           PARAGRAPHS_ONE, QUESTIONS_ONE, PASSAGE_ONE_TEACHING)
        two = seed_passage(session, "rp_t2", "Sandmouth harbour",
                           PARAGRAPHS_TWO, QUESTIONS_TWO, PASSAGE_TWO_TEACHING)
    yield one, two
    drills._CENSUS_CACHE.clear()
    with session_scope() as session:
        session.execute(delete(m.ReadingAnswer))
        session.execute(delete(m.ReadingAttempt))
        session.execute(delete(m.DrillResult))
        session.execute(delete(m.PracticeSession))
        session.execute(delete(m.ReadingQuestion))
        # The core-en pack is imported at startup and its test rows reference passages,
        # so the tests own the whole reading bank for the duration of this module.
        session.execute(delete(m.ReadingTest))
        session.execute(delete(m.ReadingPassage))


def doc_for(passage_id: str) -> dict[str, Any]:
    with session_scope() as session:
        return drills.passage_doc(session.get(m.ReadingPassage, passage_id))


# ======================================================================================
# The taxonomy itself
# ======================================================================================

def test_every_trap_belongs_to_a_declared_family() -> None:
    assert set(drills.TRAP_FAMILIES) == {t["family"] for t in drills.TRAPS.values()}


def test_every_picker_slug_is_in_the_taxonomy() -> None:
    for qtype, slugs in drills.TRAP_PICKER.items():
        unknown = [s for s in slugs if s not in drills.TRAPS]
        assert not unknown, f"{qtype} offers slugs that are not in the enum: {unknown}"


def test_only_scope_and_modality_change_meaning() -> None:
    """The preserving/changing split is the scored distinction in the paraphrase gym."""
    assert drills.CHANGING_DEVICES == {"scope_change", "modality_change"}


# ======================================================================================
# Selection and serving
# ======================================================================================

def test_trap_drill_selects_only_items_carrying_that_trap(client: TestClient, bank) -> None:
    res = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "trap", "trap": "absence_read_as_contradiction", "size": 5},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["items"], "the fixture carries two items with this trap"
    assert body["trap_info"]["name"] == "Phantom contradiction"

    for item in body["items"]:
        doc = doc_for(item["passage_id"])
        _group, question = drills.find_question(doc, item["number"])
        assert "absence_read_as_contradiction" in drills.traps_of(question)


def test_a_served_item_carries_no_key_no_trap_and_no_solution(
    client: TestClient, bank
) -> None:
    """A drill that ships its own answer measures nothing at all."""
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "trap", "size": 5, "seed": "s1"}
    ).json()
    blob = json.dumps(body)
    for leak in ("answer_key", "evidence_quote", "explanation", "decision_rule",
                 "reusable_rule", "why_wrong", "distractors", "trap_note", "nearest_text"):
        assert leak not in blob, f"{leak} reached the learner before they answered"
    for item in body["items"]:
        assert "traps" not in item
        # The self-diagnosis picker is fine to send — it is the menu, not the answer.
        assert item["self_diagnosis_options"]


def test_a_set_spreads_across_passages_rather_than_draining_one(
    client: TestClient, bank
) -> None:
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "trap", "size": 6, "seed": "spread"}
    ).json()
    assert len({item["passage_id"] for item in body["items"]}) == 2


def test_the_same_seed_rebuilds_the_same_set(client: TestClient, bank) -> None:
    first = client.post(
        f"{PRACTICE}/sets", json={"kind": "type", "qtype": "true_false_not_given",
                                  "size": 5, "seed": "fixed"}
    ).json()
    second = client.post(
        f"{PRACTICE}/sets", json={"kind": "type", "qtype": "true_false_not_given",
                                  "size": 5, "seed": "fixed"}
    ).json()
    assert [i["item_id"] for i in first["items"]] == [i["item_id"] for i in second["items"]]


def test_an_undrillable_trap_says_why_rather_than_shipping_an_empty_set(
    client: TestClient, bank
) -> None:
    res = client.post(
        f"{PRACTICE}/sets", json={"kind": "trap", "trap": "heading_cascade", "size": 5}
    )
    # heading_cascade is authored on a matching-headings item, which a trap drill excludes.
    assert res.status_code == 404
    assert "Error propagated" in res.json()["detail"] or "trap" in res.json()["detail"]


# ======================================================================================
# Bounded search
# ======================================================================================

def test_bounded_search_brackets_a_sequential_answer_between_its_neighbours(bank) -> None:
    doc = doc_for("rp_t1")
    group = doc["question_groups"][0]
    band = drills.bounded_band(doc, group, 2)
    # Q1 is anchored in A and Q3 in C, so Q2's answer must lie in A–C.
    assert band == ["A", "B", "C"]


def test_bounded_search_is_refused_on_a_scattered_group(bank) -> None:
    """Matching headings is not in passage order, so a 'band' would be a lie."""
    doc = doc_for("rp_t1")
    assert drills.bounded_band(doc, doc["question_groups"][1], 6) == []


def test_a_bounded_item_shows_the_band_and_labels_it_honestly(
    client: TestClient, bank
) -> None:
    body = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "type", "qtype": "true_false_not_given", "size": 6,
              "bounded": True, "seed": "bounded"},
    ).json()
    banded = [i for i in body["items"] if i["context"]["kind"] == "band"]
    assert banded, "at least one sequential item should widen to a band"
    for item in banded:
        assert len(item["context"]["paragraph_ids"]) > 1
        assert "bounded" in item["context"]["note"]


# ======================================================================================
# Grading — through the shared matcher, never a second copy of it
# ======================================================================================

def _answers_for(items: list[dict[str, Any]], wrong_numbers: set[int] | None = None):
    """Key-correct responses, with the named item numbers deliberately spoiled."""
    wrong_numbers = wrong_numbers or set()
    out = []
    for item in items:
        doc = doc_for(item["passage_id"])
        _group, question = drills.find_question(doc, item["number"])
        key = drills.key_values(question)[0]
        given = "TRUE" if key.upper() != "TRUE" else "FALSE"
        out.append(
            {"item_id": item["item_id"],
             "given": given if item["number"] in wrong_numbers else key}
        )
    return out


def test_grading_accepts_the_abbreviations_the_player_accepts(
    client: TestClient, bank
) -> None:
    built = client.post(
        f"{PRACTICE}/sets", json={"kind": "trap", "size": 6, "seed": "abbrev"}
    ).json()
    responses = []
    for item in built["items"]:
        doc = doc_for(item["passage_id"])
        _group, question = drills.find_question(doc, item["number"])
        key = drills.key_values(question)[0].upper()
        # "n.g." is what a learner actually types, and the shared matcher knows it.
        typed = {"NOT GIVEN": "n.g.", "TRUE": "t", "FALSE": "f"}[key]
        responses.append({"item_id": item["item_id"], "given": typed})

    graded = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "trap", "size": 6, "seed": "abbrev", "responses": responses},
    ).json()
    assert graded["n_correct"] == graded["n_items"] == len(built["items"])


def test_a_wrong_answer_is_marked_wrong_and_a_blank_is_a_pacing_diagnosis(
    client: TestClient, bank
) -> None:
    built = client.post(
        f"{PRACTICE}/sets", json={"kind": "trap", "size": 4, "seed": "blank"}
    ).json()
    responses = [{"item_id": built["items"][0]["item_id"], "given": ""}]
    graded = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "trap", "size": 4, "seed": "blank", "responses": responses},
    ).json()
    first = graded["results"][0]
    assert first["correct"] is False
    assert first["marking"]["answered"] is False
    # Not a comprehension error — it needs a pacing fix and must stay separable.
    assert first["marking"]["form_trap"] == "ran_out_of_time"


def test_an_over_limit_completion_is_diagnosed_as_form_not_comprehension(
    client: TestClient, bank
) -> None:
    built = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "type", "qtype": "sentence_completion", "size": 3, "seed": "limit"},
    ).json()
    target = next(i for i in built["items"] if i["number"] == 8)
    graded = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "type", "qtype": "sentence_completion", "size": 3, "seed": "limit",
              "responses": [{"item_id": target["item_id"],
                             "given": "the timber sleepers used"}]},
    ).json()
    result = next(r for r in graded["results"] if r["number"] == 8)
    assert result["correct"] is False
    assert result["marking"]["over_limit"] is True
    assert result["marking"]["form_trap"] == "over_limit"


def test_responses_from_another_seed_are_refused(client: TestClient, bank) -> None:
    res = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "trap", "size": 4, "seed": "seed-a",
              "responses": [{"item_id": "rdr_trap_1_deadbeef", "given": "TRUE"}]},
    )
    assert res.status_code == 422
    assert "seed" in res.json()["detail"]


# ======================================================================================
# The trap reveal — the whole point of the trap drill
# ======================================================================================

def _grade_one(client: TestClient, *, number: int, passage_id: str, given: str,
               seed: str = "reveal", **extra) -> dict[str, Any]:
    # The whole judgement pool, so a named item is certain to be in the set.
    payload = {"kind": "trap", "size": drills.MAX_SIZE, "seed": seed, **extra}
    built = client.post(f"{PRACTICE}/sets", json=payload).json()
    item = next(
        i for i in built["items"] if i["number"] == number and i["passage_id"] == passage_id
    )
    graded = client.post(
        f"{PRACTICE}/grade",
        json={**payload, "responses": [{"item_id": item["item_id"], "given": given}]},
    ).json()
    return next(r for r in graded["results"] if r["item_id"] == item["item_id"])


def test_a_not_given_reveal_names_false_as_the_rival_and_says_why_it_fails(
    client: TestClient, bank
) -> None:
    """The FALSE/NOT GIVEN boundary is where the marks go, so the reveal must state it."""
    result = _grade_one(client, number=3, passage_id="rp_t1", given="FALSE")
    assert result["correct"] is False
    contrast = result["reveal"]["contrast"]
    assert contrast["key"] == "NOT GIVEN"
    assert contrast["boundary"]["rival"] == "FALSE"
    assert "opposite" in contrast["boundary"]["line"]
    # The authored autopsy is what makes the line specific to this statement rather than
    # a restatement of the general rule.
    assert contrast["boundary"]["authored"] == "Silence about Ashfield is not a denial."
    assert contrast["complete"] is True


def test_a_false_reveal_names_not_given_as_the_rival(client: TestClient, bank) -> None:
    result = _grade_one(client, number=1, passage_id="rp_t1", given="NOT GIVEN")
    contrast = result["reveal"]["contrast"]
    assert contrast["key"] == "FALSE"
    assert contrast["boundary"]["rival"] == "NOT GIVEN"
    assert contrast["boundary"]["authored"] == "'an afterthought' denies primacy explicitly."
    assert [row["verdict"] for row in contrast["verdicts"]] == ["TRUE", "FALSE", "NOT GIVEN"]


def test_the_option_the_learner_chose_is_pinned_to_the_top_of_the_autopsy(
    client: TestClient, bank
) -> None:
    result = _grade_one(client, number=3, passage_id="rp_t1", given="TRUE")
    autopsy = result["reveal"]["distractors"]
    assert autopsy[0]["key"] == "TRUE"
    assert autopsy[0]["why_tempting"]


def test_a_not_given_item_shows_the_sentence_that_tempts_you(
    client: TestClient, bank
) -> None:
    """There is no evidence span on a NOT GIVEN item; the near miss is the lesson."""
    result = _grade_one(client, number=3, passage_id="rp_t1", given="FALSE")
    assert result["reveal"]["location"]["nearest_text"].startswith("Ashfield's own line")


def test_the_reveal_carries_the_authored_trap_and_the_rule_to_reuse(
    client: TestClient, bank
) -> None:
    result = _grade_one(client, number=3, passage_id="rp_t1", given="FALSE")
    slugs = [t["slug"] for t in result["reveal"]["traps"]]
    assert "comparison_invented" in slugs
    assert result["reveal"]["reusable_rule"].startswith("Two facts placed side by side")
    assert result["reveal"]["strategy"]["order_badge"] == "In passage order"


def test_a_payload_free_question_still_grades_and_reveals_what_it_has(
    client: TestClient, bank
) -> None:
    """schema_version 1 rows must flow through everything, carrying fewer fields."""
    built = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "type", "qtype": "short_answer", "size": 3, "seed": "degrade"},
    ).json()
    item = built["items"][0]
    graded = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "type", "qtype": "short_answer", "size": 3, "seed": "degrade",
              "responses": [{"item_id": item["item_id"], "given": "1954"}]},
    ).json()
    reveal = graded["results"][0]["reveal"]
    assert graded["results"][0]["correct"] is True
    assert reveal["decision_rule"] is None
    assert reveal["distractors"] == []
    assert reveal["explanation"]  # the pre-payload field is still there and still useful


def test_verdict_contrast_is_none_for_a_type_with_no_three_way_verdict(bank) -> None:
    doc = doc_for("rp_t1")
    group, question = drills.find_question(doc, 5)  # matching_headings
    assert drills.verdict_contrast(question, str(group["type"])) is None


# ======================================================================================
# The two-stage TFNG scaffold
# ======================================================================================

def test_stage_split_gives_a_not_given_item_no_second_stage(bank) -> None:
    stages = drills.stage_split("true_false_not_given", "NOT GIVEN")
    assert stages["one"]["key"] == "NOT GIVEN"
    assert stages["two"] is None


def test_stage_split_routes_a_false_item_through_both_stages(bank) -> None:
    stages = drills.stage_split("true_false_not_given", "FALSE")
    assert stages["one"]["key"] == "GIVEN"
    assert stages["two"]["key"] == "FALSE"
    assert stages["two"]["options"] == ["TRUE", "FALSE"]


def test_the_served_two_stage_item_offers_stage_two_on_every_item(
    client: TestClient, bank
) -> None:
    """Omitting stage two on the NOT GIVEN items would announce which ones they are."""
    built = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "trap", "size": drills.MAX_SIZE, "two_stage": True, "seed": "stages"},
    ).json()
    assert built["items"]
    for item in built["items"]:
        assert item["two_stage"]["two"]["options"] in (["TRUE", "FALSE"], ["YES", "NO"])
        assert "key" not in item["two_stage"]["one"]


def test_two_stage_separates_failing_to_locate_from_reading_it_backwards(
    client: TestClient, bank
) -> None:
    """Q1 of passage one is FALSE: the passage settles it, and it settles it against."""
    built = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "trap", "size": drills.MAX_SIZE, "two_stage": True, "seed": "diag"},
    ).json()
    item = next(i for i in built["items"] if i["number"] == 1 and i["passage_id"] == "rp_t1")

    def run(stage_one: str, given: str) -> dict[str, Any]:
        graded = client.post(
            f"{PRACTICE}/grade",
            json={"kind": "trap", "size": drills.MAX_SIZE, "two_stage": True, "seed": "diag",
                  "responses": [{"item_id": item["item_id"], "stage_one": stage_one,
                                 "given": given}]},
        ).json()
        return next(r for r in graded["results"] if r["item_id"] == item["item_id"])

    right = run("GIVEN", "FALSE")
    assert right["correct"] is True
    assert right["two_stage"]["diagnosis"] == "located_and_read"

    backwards = run("GIVEN", "TRUE")
    assert backwards["correct"] is False
    assert backwards["two_stage"]["diagnosis"] == "located_wrong_direction"

    never_found = run("NOT GIVEN", "FALSE")
    assert never_found["correct"] is False, "calling it NOT GIVEN is not answering it"
    assert never_found["two_stage"]["diagnosis"] == "did_not_locate"
    assert never_found["two_stage"]["stage_two"]["skipped"] is True


def test_two_stage_on_a_not_given_item_is_settled_by_stage_one_alone(
    client: TestClient, bank
) -> None:
    built = client.post(
        f"{PRACTICE}/sets",
        json={"kind": "trap", "size": drills.MAX_SIZE, "two_stage": True, "seed": "ng"},
    ).json()
    item = next(i for i in built["items"] if i["number"] == 3 and i["passage_id"] == "rp_t1")
    graded = client.post(
        f"{PRACTICE}/grade",
        json={"kind": "trap", "size": drills.MAX_SIZE, "two_stage": True, "seed": "ng",
              "responses": [{"item_id": item["item_id"], "stage_one": "NOT GIVEN"}]},
    ).json()
    result = next(r for r in graded["results"] if r["item_id"] == item["item_id"])
    assert result["correct"] is True
    assert result["two_stage"]["stage_two"] is None
    assert result["two_stage"]["diagnosis"] == "located_and_read"


# ======================================================================================
# The paraphrase gym
# ======================================================================================

def test_a_paraphrase_item_offers_four_extracts_and_hides_which_is_real(
    client: TestClient, bank
) -> None:
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "paraphrase", "size": 4, "seed": "para"}
    ).json()
    assert body["items"]
    for item in body["items"]:
        assert len(item["options"]) == 4
        assert len({o["text"] for o in item["options"]}) == 4
        assert "answer_key" not in item
        if item.get("device_step"):
            assert "answer" not in item["device_step"]
            assert "devices" not in item["device_step"]


def test_the_paraphrase_key_is_the_authored_text_phrase(client: TestClient, bank) -> None:
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "paraphrase", "size": 4, "seed": "para"}
    ).json()
    item = body["items"][0]
    doc = doc_for(item["passage_id"])
    _group, question = drills.find_question(doc, item["number"])
    link = drills.paraphrase_link(question)
    assert link["text_phrase"] in [o["text"] for o in item["options"]]
    assert item["stem_phrase"] == link["stem_phrase"]


def test_grading_a_paraphrase_choice_and_the_meaning_call(client: TestClient, bank) -> None:
    payload = {"kind": "paraphrase", "size": 4, "seed": "gym"}
    body = client.post(f"{PRACTICE}/sets", json=payload).json()
    item = body["items"][0]
    doc = doc_for(item["passage_id"])
    _group, question = drills.find_question(doc, item["number"])
    link = drills.paraphrase_link(question)
    key_letter = next(o["key"] for o in item["options"] if o["text"] == link["text_phrase"])
    expected = "changing" if set(link["devices"]) & drills.CHANGING_DEVICES else "preserving"

    graded = client.post(
        f"{PRACTICE}/grade",
        json={**payload, "responses": [{"item_id": item["item_id"], "given": key_letter,
                                        "device_choice": expected}]},
    ).json()
    result = graded["results"][0]
    assert result["correct"] is True
    assert result["marking"]["device"]["correct"] is True
    assert result["reveal"]["text_phrase"] == link["text_phrase"]


def test_a_scope_change_pair_is_keyed_as_meaning_changing(bank) -> None:
    """A rewording that doubles a frequency is what makes a statement FALSE, not TRUE."""
    doc = doc_for("rp_t2")
    _group, question = drills.find_question(doc, 2)
    link = drills.paraphrase_link(question)
    assert "scope_change" in link["devices"]
    assert set(link["devices"]) & drills.CHANGING_DEVICES


# ======================================================================================
# The timed skim
# ======================================================================================

def test_a_skim_drill_returns_the_passage_and_the_authored_window(
    client: TestClient, bank
) -> None:
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "skim", "passage_id": "rp_t1", "size": 4}
    ).json()
    assert body["window"]["seconds"] == 90  # from skim_plan.budget_s, not a default
    assert body["window"]["plan_kind"] == "paragraph_map"
    assert body["passage"]["texts"][0]["paragraphs"][0]["id"] == "A"
    assert "label, not a summary" in body["window"]["rule"]


def test_skim_items_carry_no_passage_text_because_the_window_has_closed(
    client: TestClient, bank
) -> None:
    body = client.post(
        f"{PRACTICE}/sets", json={"kind": "skim", "passage_id": "rp_t1", "size": 4}
    ).json()
    for item in body["items"]:
        assert item.get("context", {"kind": "none"})["kind"] == "none"
        assert "answer_key" not in item


def test_a_map_label_item_is_keyed_to_the_paragraph_the_author_labelled(
    client: TestClient, bank
) -> None:
    payload = {"kind": "skim", "passage_id": "rp_t1", "size": 4, "seed": "map"}
    body = client.post(f"{PRACTICE}/sets", json=payload).json()
    labels = [i for i in body["items"] if i.get("source") == "map_label"]
    assert labels, "the authored paragraph map should produce gist items for free"
    item = next(i for i in labels if "costs climbing" in i["prompt"])

    graded = client.post(
        f"{PRACTICE}/grade",
        json={**payload, "responses": [{"item_id": item["item_id"], "given": "B"}]},
    ).json()
    result = next(r for r in graded["results"] if r["item_id"] == item["item_id"])
    assert result["correct"] is True
    assert result["reveal"]["kind"] == "map_label"
    assert result["reveal"]["label"] == "costs climbing"


def test_a_passage_with_no_skim_plan_refuses_rather_than_inventing_gist(
    client: TestClient, bank
) -> None:
    with session_scope() as session:
        row = session.get(m.ReadingPassage, "rp_t2")
        doc = json.loads(row.passage_json)
        doc.pop("teaching", None)
        row.passage_json = json.dumps(doc)
    res = client.post(f"{PRACTICE}/sets", json={"kind": "skim", "passage_id": "rp_t2"})
    assert res.status_code == 404
    assert "closely" in res.json()["detail"]


# ======================================================================================
# Self-diagnosis, persistence and the profile
# ======================================================================================

def test_self_diagnosis_records_agreement_with_the_authored_trap(bank) -> None:
    agreed = drills.self_diagnosis(["comparison_invented"], "comparison_invented")
    assert agreed["agreed"] is True and agreed["comparable"] is True

    missed = drills.self_diagnosis(["comparison_invented"], "outside_knowledge")
    assert missed["agreed"] is False and missed["comparable"] is True
    assert missed["picked_label"] == "True in the world, not in the text"

    unsure = drills.self_diagnosis(["comparison_invented"], "unsure")
    assert unsure["comparable"] is False, "'I don't know' is informative, not comparable"


def test_a_graded_set_writes_one_drill_result_and_no_new_table(
    client: TestClient, bank
) -> None:
    payload = {"kind": "trap", "trap": "absence_read_as_contradiction", "size": 4,
               "seed": "persist"}
    built = client.post(f"{PRACTICE}/sets", json=payload).json()
    responses = [
        {"item_id": item["item_id"], "given": "FALSE", "self_trap": "outside_knowledge"}
        for item in built["items"]
    ]
    graded = client.post(
        f"{PRACTICE}/grade", json={**payload, "responses": responses, "duration_s": 91}
    ).json()
    assert graded["drill_id"]

    with session_scope() as session:
        row = session.get(m.DrillResult, graded["drill_id"])
        assert row is not None
        assert row.module == "reading"
        assert row.drill_kind == "trap"
        assert row.n_items == len(built["items"])
        details = json.loads(row.details_json)
        assert details["trap_hits"].get("absence_read_as_contradiction")
        assert details["items"][0]["self_trap"] == "outside_knowledge"
        # The envelope every module shares, so a drill shows up in practice history.
        envelope = session.get(m.PracticeSession, graded["drill_id"])
        assert envelope.module == "reading"
        assert envelope.activity == "drill:trap"
        assert envelope.duration_s == 91


def test_a_drill_never_reports_a_band(client: TestClient, bank) -> None:
    payload = {"kind": "trap", "size": 4, "seed": "noband"}
    built = client.post(f"{PRACTICE}/sets", json=payload).json()
    graded = client.post(
        f"{PRACTICE}/grade",
        json={**payload, "responses": [{"item_id": built["items"][0]["item_id"],
                                        "given": "TRUE"}]},
    ).json()
    assert graded["band"] is None


def test_the_trap_profile_accumulates_what_the_learner_actually_loses(
    client: TestClient, bank
) -> None:
    payload = {"kind": "trap", "trap": "absence_read_as_contradiction", "size": 4,
               "seed": "profile"}
    built = client.post(f"{PRACTICE}/sets", json=payload).json()
    # Answer every one of them wrongly, on purpose.
    responses = [
        {"item_id": item["item_id"], "given": "FALSE"} for item in built["items"]
    ]
    client.post(f"{PRACTICE}/grade", json={**payload, "responses": responses})

    profile = client.get(f"{PRACTICE}/traps").json()["profile"]
    slugs = {row["slug"] for row in profile}
    assert "absence_read_as_contradiction" in slugs
    hit = next(r for r in profile if r["slug"] == "absence_read_as_contradiction")
    assert hit["lost"] >= 1
    assert hit["name"] == "Phantom contradiction"


# ======================================================================================
# The catalogue
# ======================================================================================

def test_the_catalogue_counts_what_is_drillable_rather_than_guessing(
    client: TestClient, bank
) -> None:
    body = client.get(f"{PRACTICE}/catalogue").json()
    types = {row["qtype"]: row for row in body["types"]}
    assert types["true_false_not_given"]["count"] == 7  # 4 + 3 across the two passages
    assert types["true_false_not_given"]["drillable"] is True
    assert types["true_false_not_given"]["order_badge"] == "In passage order"
    assert types["matching_headings"]["order_badge"] == "Not in order"

    traps = {row["slug"]: row for row in body["traps"]}
    assert traps["absence_read_as_contradiction"]["count"] == 2
    assert traps["absence_read_as_contradiction"]["thin"] is True  # under the floor of six
    assert "over_limit" not in traps, "form errors are diagnosed, never drilled"

    assert body["skim"], "a passage with a paragraph map is skimmable"
    assert body["paraphrase"]["links"] >= 8


def test_the_kinds_route_is_static_and_needs_no_bank(client: TestClient) -> None:
    body = client.get(f"{PRACTICE}/kinds").json()
    assert [k["kind"] for k in body["kinds"]] == list(drills.DRILL_KINDS)
    assert body["sizes"]["default"] == drills.DEFAULT_SIZE


# ======================================================================================
# Explain-back — the one judgement call
# ======================================================================================

def test_explain_back_refuses_where_there_is_no_authored_rule_to_check_against(
    client: TestClient, bank
) -> None:
    """A model asked to grade against nothing would grade against its own invention."""
    question_id = _question_id("rp_t2", 4)  # the deliberately payload-free short answer
    res = client.post(
        f"{PRACTICE}/explain-back",
        json={"question_id": question_id, "sentence": "Because the text says so."},
    )
    assert res.status_code == 422
    assert "decision rule" in res.json()["detail"]


def test_explain_back_returns_a_constrained_verdict(client: TestClient, bank) -> None:
    question_id = _question_id("rp_t1", 3)
    res = client.post(
        f"{PRACTICE}/explain-back",
        json={
            "question_id": question_id,
            "sentence": "The passage gives costs for one line and says the other's accounts "
                        "are lost, so there is nothing to compare.",
            "self_trap": "comparison_invented",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["verdict"] in ("aligned", "partial", "off")
    assert body["decision_rule"].startswith("Costs are given for one line")
    assert body["self_diagnosis"]["agreed"] is True


def _question_id(passage_id: str, number: int) -> str:
    with session_scope() as session:
        from sqlalchemy import select as sa_select

        row = session.scalars(
            sa_select(m.ReadingQuestion).where(
                m.ReadingQuestion.passage_id == passage_id,
                m.ReadingQuestion.number == number,
            )
        ).first()
        assert row is not None
        return row.id


# ======================================================================================
# Exam conditions
# ======================================================================================

def test_every_drill_route_is_shut_while_a_reading_mock_is_open(
    client: TestClient, bank
) -> None:
    """Drills are coaching, and coaching is shut for the duration of a sitting."""
    started = client.post(
        "/api/v1/reading/attempts",
        json={"passage_id": "rp_t1", "mode": "passage", "exam_conditions": True},
    )
    assert started.status_code == 201, started.text

    for method, path, payload in (
        ("get", f"{PRACTICE}/catalogue", None),
        ("get", f"{PRACTICE}/traps", None),
        ("post", f"{PRACTICE}/sets", {"kind": "trap", "size": 4}),
        ("post", f"{PRACTICE}/grade", {"kind": "trap", "size": 4, "seed": "x"}),
    ):
        res = getattr(client, method)(path, **({"json": payload} if payload else {}))
        assert res.status_code == 409, f"{path} stayed open during a mock"
        assert "mock" in res.json()["detail"]

    client.post(f"/api/v1/reading/attempts/{started.json()['attempt_id']}/submit", json={})
    assert client.get(f"{PRACTICE}/catalogue").status_code == 200
