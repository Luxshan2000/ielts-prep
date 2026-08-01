"""Author the last seven grammar points by hand.

Six agent runs reached 147 of the design's 154 points and lost the same two blocks each time
to a session limit part-way through. Seven points is a tractable amount of writing, so this
finishes them directly rather than paying for a seventh run to die in the same place.

The four modal points close the certainty family (possibility, present deduction, the modal
perfect, and the must not / do not have to reversal). The three accuracy points are the
high-frequency local errors the block was cut off before reaching.

Written as a script rather than hand-edited JSON so the repeated scaffolding is stated once
and the content stays readable. Run it once; the output is a normal staging block from then
on.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path("content/core-en/staging-grammar/content/final-seven.json")


def item(
    slug: str,
    n: int,
    kind: str,
    stage: int,
    payload: dict,
    *,
    expected=None,
    why: str = "",
    forward: str = "",
    codes: list[str] | None = None,
    twin: str | None = None,
    cue: str | None = None,
    confusion: str | None = None,
    topic: str = "topic_education",
    register: str = "both",
    difficulty: int = 2,
) -> dict:
    return {
        "id": f"gi_{slug}_{n:02d}",
        "kind": kind,
        "stage": stage,
        "register": register,
        "topic_id": topic,
        "skill_hook": None,
        "error_codes": codes or [],
        "confusion_set": confusion,
        "twin_id": twin,
        "review_only": False,
        "difficulty": difficulty,
        "decision_cue": cue,
        "payload": payload,
        "expected": expected,
        "feedback": {"why_key": why, "feed_forward": forward},
    }


def point(
    pid: str,
    unit: str,
    seq: int,
    title: str,
    cefr: str,
    role: str,
    pj: dict,
    topic: str = "topic_education",
) -> dict:
    return {
        "id": pid,
        "unit_id": unit,
        "sequence_index": seq,
        "title": title,
        "cefr_level": cefr,
        "role": role,
        "topic_id": topic,
        "point_json": {
            "schema_version": 1,
            "unlocks_hint": None,
            "priority": 2,
            "insertable": False,
            "register": "both",
            "risk_tier": "A",
            "error_surface": 2,
            "gravity": "local",
            "confusion_set": None,
            "signal_blocklist": [],
            "tool_surface": None,
            "estimated_minutes": 20,
            "pays_in": [],
            "criteria": ["gra"],
            "used_in": [],
            **pj,
        },
    }


POINTS: list[dict] = []

# ======================================================================================
# u07 — the certainty family
# ======================================================================================

POINTS.append(point(
    "gr_modal_possibility", "u07", 2000,
    "Saying that something is possible without claiming to know",
    "B1", "choice",
    {
        "grammar_name": "may, might and could for possibility",
        "prerequisites": ["gr_modal_grammar"],
        "confusion_set": "cs_certainty_strength",
        "structure_slug": "modal_simple",
        "fixes_errors": ["modal_strength_mismatch"],
        "gravity": "local",
        "contrast": {
        "with": [
                "gr_modal_deduction_present"
        ],
        "board_id": "gb_certainty_strength",
        "question": "Could I show this if somebody asked me to?",
        "fork": [
                {
                        "answer": "No — it is a reasonable expectation and nothing more",
                        "selects": "may / might / could",
                        "point_id": "gr_modal_possibility"
                },
                {
                        "answer": "Yes — the evidence is in front of me and only one conclusion fits",
                        "selects": "must / cannot",
                        "point_id": "gr_modal_deduction_present"
                }
        ],
        "minimal_pair": {
                "a": {
                        "text": "The delay might be down to the signal failure at Ashfield.",
                        "means": "One explanation among several, and the speaker is not committing to it."
                },
                "b": {
                        "text": "The delay must be down to the signal failure at Ashfield.",
                        "means": "The speaker has ruled the others out and is committing to this one."
                },
                "only_difference": "might / must"
        },
        "wrong_choice_note": "You wrote must where nothing has been shown. That turns a fair suggestion into a claim the next sentence has to defend, and a reader who spots the gap stops trusting the rest of the paragraph.",
        "edge_case": {
                "text": "May, might and could are close enough here that no examiner will separate them. Spend the attention on choosing a hedge at all, not on choosing between the three.",
                "ignore_the_rest": True
        },
        "stronger_test": "Ask what you would say if the reader replied how do you know. If the honest answer is I do not, you need may, might or could.",
        "worked_pairs": [
                {
                        "a": "Free transport may increase use of the network.",
                        "b": "Free transport increases use of the network.",
                        "why": "The first is a proposal being discussed; the second is a finding that needs a source."
                }
        ]
},
        "teach": {
            "can_do": "I can say that something is possible without pretending to be sure of it.",
            "why_it_matters": "Stating a possibility as a fact is the fastest way to lose a reader's trust, and in Task 2 it turns a reasonable argument into one the next paragraph has to rescue.",
            "meaning": "May, might and could all do the same job here: they put a sentence somewhere between yes and no. The differences are small and mostly about how tentative you sound — may is the most formal, might the most cautious, could the one that presents an option among several. What matters far more is that you use one of them at all, rather than writing a guess as though it were established.",
            "form": {
                "pattern": "subject + may / might / could + plain verb",
                "notes": [
                    "no to, and no -s: the fee may rise, not the fee may to rise or may rises",
                    "for something possible right now, add be + -ing: she may be waiting",
                    "may not and might not mean possibly not — the possibility is still open",
                    "could not is NOT the negative of could here: it means impossible, not possibly not",
                ],
                "negative": "may not / might not = perhaps not. Use cannot only when you mean it is impossible.",
                "question": "English avoids may I ...? for possibility; use Do you think ...? or Is it possible that ...?",
            },
            "visual": {
                "kind": "two_box",
                "spec": {
                    "left": {"role": "claimed as fact", "text": "The scheme reduces congestion."},
                    "right": {"role": "offered as possible", "text": "The scheme may reduce congestion."},
                    "arrow": "left_to_right",
                    "caption": "One word is the difference between a claim you must defend and one you have only raised.",
                },
            },
            "worked_example": {
                "sentence": "Charging drivers to enter the centre might push shoppers out to the retail parks.",
                "why_this_form": "Nobody has run the scheme yet, so the effect is a reasonable expectation and not a finding. Might says exactly that, and leaves the sentence defensible.",
                "what_the_other_would_mean": "Charging drivers pushes shoppers out states it as something already observed, which invites the reader to ask where the evidence is.",
            },
            "notice_set": [
                {"sentence": "The council may review the parking charges in the spring.", "question": "Has the council decided to review them?", "options": ["Yes", "No", "The sentence doesn't say"], "key": 2},
                {"sentence": "Fees might not rise at all this year.", "question": "Is a rise still possible?", "options": ["Yes, it is still possible", "No, it has been ruled out"], "key": 0},
                {"sentence": "The line could be extended as far as Brackenfield.", "question": "Is this presented as a plan or as one possibility?", "options": ["A settled plan", "One possibility"], "key": 1},
            ],
            "rule_line": "If you cannot show it, say may, might or could and keep the sentence defensible.",
            "false_rule": "That may is for permission and might is for possibility. Both do possibility; may also does permission, and context tells them apart.",
        },
        "errors": [
            {"code": "modal_strength_mismatch", "wrong": "The scheme may to reduce congestion in the centre.", "right": "The scheme may reduce congestion in the centre.", "why_it_happens": "Have to, need to and want to all keep their to, and a learner has met far more of those than of the bare modals.", "smallest_fix": "delete to"},
            {"code": "modal_strength_mismatch", "wrong": "Fares couldn't rise next year, but nobody knows yet.", "right": "Fares might not rise next year, but nobody knows yet.", "why_it_happens": "Couldn't looks like the natural negative of could, but it means impossible rather than possibly not, so the sentence contradicts its own second half.", "smallest_fix": "couldn't -> might not"},
        ],
        "items": [
            item("modal_possibility", 1, "interpret", 1, {"sentence": "The department may move the deadline to the following Friday.", "question": "Has the deadline been moved?", "options": ["Yes", "No", "The sentence doesn't say"], "key": 2}, why="May raises it as possible and settles nothing.", forward="Read may as an open question, never as an announcement."),
            item("modal_possibility", 2, "interpret", 1, {"sentence": "Rents in the district might not fall for another two years.", "question": "Is a fall within two years still possible?", "options": ["Yes, it is still possible", "No, it has been ruled out"], "key": 0}, why="Might not leaves the possibility open; it does not close it.", forward="Might not means perhaps not, not certainly not."),
            item("modal_possibility", 3, "judge", 2, {"context": "A first draft of a Task 2 paragraph.", "sentence": "Free transport for students reduces car use in every city that tries it.", "acceptable": False, "reasons": ["it states a result nobody has measured as though it were settled", "the tense is wrong", "the subject and verb do not agree", "the sentence is too short"], "reason_key": 0}, why="Every city that tries it is a claim the essay cannot support; a modal makes it defensible.", forward="Before a sweeping claim, ask whether you could show it. If not, hedge it."),
            item("modal_possibility", 4, "gap_fill", 3, {"context": "A note on a proposal that has not been trialled.", "stem": "A later last train ___ (possible) encourage more people to use the line in the evening.", "blanks": 1, "lemma_hints": ["may"]}, expected=["may", "might", "could"], why="Any of the three marks it as possible rather than proven.", forward="All three work here; pick one and stay consistent within a paragraph."),
            item("modal_possibility", 5, "error_fix", 3, {"sentence": "The new timetable may to reduce waiting times at the interchange.", "error_span": "may to reduce", "accept_overlap_tokens": 1}, expected=["may reduce", "might reduce", "could reduce"], why="A modal is followed by the plain verb, with nothing between them.", forward="Delete to after may, might, could, must, should and will."),
            item("modal_possibility", 6, "error_fix", 3, {"sentence": "Numbers couldn't recover next season, though the club is hopeful.", "error_span": "couldn't recover", "accept_overlap_tokens": 1}, expected=["might not recover", "may not recover"], codes=["modal_strength_mismatch"], why="Couldn't says a recovery is impossible, which contradicts the hopeful second half.", forward="For possibly not, use might not or may not — never couldn't."),
            item("modal_possibility", 7, "choose_form", 4, {"context": "A report on a trial that has produced no results yet.", "stem": "The scheme ___ cut journey times, but the first figures are not due until March.", "options": [{"text": "may", "why_this_means": "That a cut is possible and nothing has been shown yet."}, {"text": "does", "why_this_means": "That the cut is already an established fact."}], "key": 0}, confusion="cs_certainty_strength", twin="gi_modal_possibility_08", cue="not due until March", why="No figures exist, so only the hedged version is defensible.", forward="Ask what you could show. That decides whether you hedge."),
            item("modal_possibility", 8, "choose_form", 4, {"context": "A report quoting three years of published figures that all point the same way.", "stem": "The scheme ___ cut journey times, and has done so in each of the three years measured.", "options": [{"text": "may", "why_this_means": "That a cut is possible and nothing has been shown yet."}, {"text": "does", "why_this_means": "That the cut is already an established fact."}], "key": 1}, confusion="cs_certainty_strength", twin="gi_modal_possibility_07", cue="each of the three years measured", why="Three years of figures is exactly the evidence that makes the flat claim honest.", forward="Hedging something you have measured is its own mistake — it wastes your evidence."),
            item("modal_possibility", 9, "transform", 4, {"given": "Perhaps the college will open a second campus.", "instruction": "Say the same thing with a modal instead of perhaps.", "starter": "The college ___"}, expected=["may open a second campus", "might open a second campus", "could open a second campus"], why="The modal carries the doubt, so perhaps is no longer needed.", forward="One hedge is enough; perhaps it might possibly is three."),
            item("modal_possibility", 10, "order", 3, {"tokens": ["the", "charge", "might", "discourage", "short", "car", "journeys"], "accepted_orders": [[0, 1, 2, 3, 4, 5, 6]], "context": "Build one sentence about a proposed charge."}, expected=["the charge might discourage short car journeys"], why="The modal sits between the subject and the plain verb.", forward="Subject, then modal, then the verb with nothing added."),
            item("modal_possibility", 11, "dictation", 2, {"audio_text": "The line may not reopen before the autumn.", "scored_tokens": ["may", "not"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["the line may not reopen before the autumn"], why="May not is two words and both are stressed.", forward="Listen for the gap between may and not."),
            item("modal_possibility", 12, "produce", 5, {"mode": "sentence", "prompt_text": "A city is considering making the central library open on Sundays. Nobody has trialled it. Write one sentence about a possible effect.", "required_structure": "modal_simple", "seed_from_vocab_queue": True, "min_words": 10, "max_words": 28, "task_ref": None}, why="An untrialled proposal can only be discussed in possibilities.", forward="Use may, might or could — and only one of them."),
        ],
    },
))

POINTS.append(point(
    "gr_modal_deduction_present", "u07", 2010,
    "Saying what must be true now, and what cannot be",
    "B1", "choice",
    {
        "grammar_name": "must and cannot for deduction in the present",
        "prerequisites": ["gr_modal_possibility"],
        "confusion_set": "cs_certainty_strength",
        "structure_slug": "modal_simple",
        "fixes_errors": ["modal_strength_mismatch"],
        "contrast": {
        "with": [
                "gr_modal_possibility"
        ],
        "board_id": "gb_certainty_strength",
        "question": "Does the evidence leave one conclusion, or several?",
        "fork": [
                {
                        "answer": "One — everything else is ruled out",
                        "selects": "must / cannot",
                        "point_id": "gr_modal_deduction_present"
                },
                {
                        "answer": "Several — this is only one of them",
                        "selects": "may / might / could",
                        "point_id": "gr_modal_possibility"
                }
        ],
        "minimal_pair": {
                "a": {
                        "text": "The gates are chained, so the site cannot be in use.",
                        "means": "The evidence rules the conclusion out completely."
                },
                "b": {
                        "text": "The gates are chained, so the site might not be in use.",
                        "means": "The speaker treats it as likely but leaves room to be wrong."
                },
                "only_difference": "cannot / might not"
        },
        "wrong_choice_note": "You wrote mustn't for a conclusion. Mustn't forbids an action, so the sentence reads as though somebody is issuing the shop an order. For a conclusion the opposite of must is can't.",
        "edge_case": {
                "text": "Must for deduction is common in speech and slightly informal in an essay; it is safest in Speaking Part 3 and in a sentence that names its evidence.",
                "ignore_the_rest": False
        },
        "stronger_test": "Say the evidence out loud first. If the conclusion follows from it without a gap, use must; if there is a gap, use might.",
        "worked_pairs": [
                {
                        "a": "Every seat is taken, so the talk must be popular.",
                        "b": "Every seat is taken, so the talk might be popular.",
                        "why": "The first draws the conclusion the full room forces; the second undersells evidence the speaker already has."
                }
        ]
},
        "teach": {
            "can_do": "I can say what the evidence forces me to conclude, and what it rules out.",
            "why_it_matters": "This is how you reason out loud in Speaking Part 3 and in an essay — you show the reader that a conclusion follows, rather than asserting it.",
            "meaning": "Here must has nothing to do with obligation. It says: given what I can see, this is the only conclusion left. Its opposite is cannot, which says the opposite conclusion is impossible. The negative of the obligation must is must not, and that is a different word doing a different job — using it for a conclusion produces a sentence English speakers simply do not write.",
            "form": {
                "pattern": "subject + must / cannot + plain verb  (for something happening now: must + be + -ing)",
                "notes": [
                    "must here means I am sure, not you are required",
                    "the opposite is cannot or can't — never must not",
                    "for something in progress: the lights are on, so somebody must be working late",
                    "might sits between them: must (sure), might (possible), cannot (ruled out)",
                ],
                "negative": "cannot / can't. Must not is prohibition and belongs to a different point.",
                "question": "Rare as a question; English asks Do you think it is ...? instead.",
            },
            "visual": {
                "kind": "two_box",
                "spec": {
                    "left": {"role": "the only conclusion left", "text": "The office is dark, so it must be closed."},
                    "right": {"role": "the conclusion ruled out", "text": "The office is dark, so it cannot be open."},
                    "arrow": "left_to_right",
                    "caption": "Same evidence, opposite ends. Neither of them is about being allowed.",
                },
            },
            "worked_example": {
                "sentence": "The car park has been full since eight, so the exhibition must be more popular than the organisers expected.",
                "why_this_form": "The full car park is the evidence; the conclusion follows from it rather than being independently known. Must marks that reasoning.",
                "what_the_other_would_mean": "The exhibition must be popular in the obligation sense would say somebody is requiring it to be popular, which is not a thing anyone can require.",
            },
            "notice_set": [
                {"sentence": "Every seat is taken, so the talk must have been advertised widely.", "question": "Does the speaker know how it was advertised?", "options": ["Yes, they were told", "No, they are working it out"], "key": 1},
                {"sentence": "The bridge cannot be open, because the diversion signs are still up.", "question": "How sure is the speaker?", "options": ["Sure it is closed", "Guessing that it might be closed"], "key": 0},
            ],
            "rule_line": "Must for the conclusion the evidence forces, cannot for the one it rules out.",
            "false_rule": "That must not is the opposite of must. For a conclusion the opposite is cannot; must not is about prohibition and belongs elsewhere.",
        },
        "errors": [
            {"code": "modal_strength_mismatch", "wrong": "The shop is dark, so it mustn't be open.", "right": "The shop is dark, so it can't be open.", "why_it_happens": "Mustn't looks like the natural negative of must, and in the obligation sense it is — but for a conclusion English uses can't.", "smallest_fix": "mustn't -> can't"},
        ],
        "items": [
            item("modal_deduction_present", 1, "interpret", 1, {"sentence": "The lights are still on, so somebody must be working late.", "question": "Does the speaker know somebody is there?", "options": ["Yes, they have seen them", "No, they are concluding it", "The sentence doesn't say"], "key": 1}, why="The lights are the evidence; the person is the conclusion drawn from it.", forward="Must here marks reasoning, not knowledge."),
            item("modal_deduction_present", 2, "interpret", 1, {"sentence": "She cannot be on the early train, because it was cancelled.", "question": "What is the speaker doing?", "options": ["Forbidding her from travelling", "Ruling out one possibility"], "key": 1}, why="Cannot rules the conclusion out; nobody is being forbidden anything.", forward="Cannot has two jobs; the evidence clause tells you which one is running."),
            item("modal_deduction_present", 3, "judge", 2, {"context": "A learner's sentence about a closed shop.", "sentence": "The shop is dark, so it mustn't be open.", "acceptable": False, "reasons": ["mustn't is prohibition, and nobody is forbidding the shop anything", "the tense is wrong", "dark and open cannot appear in one sentence", "so cannot join two clauses"], "reason_key": 0}, codes=["modal_strength_mismatch"], why="For a conclusion the opposite of must is can't.", forward="If you are concluding rather than forbidding, the negative is can't."),
            item("modal_deduction_present", 4, "error_fix", 3, {"sentence": "There is no queue at all, so the exhibition mustn't be as popular as they said.", "error_span": "mustn't be", "accept_overlap_tokens": 1}, expected=["can't be", "cannot be", "cant be"], codes=["modal_strength_mismatch"], why="The absent queue is evidence, so this is a conclusion and takes can't.", forward="Prohibition takes mustn't; conclusions take can't."),
            item("modal_deduction_present", 5, "gap_fill", 3, {"context": "The staff car park has been empty all morning.", "stem": "The office ___ be closed today.", "blanks": 1, "lemma_hints": ["must"]}, expected=["must"], why="An empty car park all morning leaves closed as the conclusion that fits.", forward="Strong evidence takes must, not might."),
            item("modal_deduction_present", 6, "gap_fill", 3, {"context": "The diversion signs are still up at both ends of the bridge.", "stem": "The bridge ___ be open yet.", "blanks": 1, "lemma_hints": ["cannot"]}, expected=["cannot", "can't", "cant"], why="The signs rule the open conclusion out.", forward="Evidence against a conclusion takes cannot."),
            item("modal_deduction_present", 7, "choose_form", 4, {"context": "Every window is dark and the gates are chained.", "stem": "The site ___ be in use at the moment.", "options": [{"text": "must", "why_this_means": "That the evidence forces this conclusion."}, {"text": "cannot", "why_this_means": "That the evidence rules this conclusion out."}], "key": 1}, confusion="cs_certainty_strength", twin="gi_modal_deduction_present_08", cue="dark and the gates are chained", why="Dark windows and chained gates rule out in use.", forward="Ask whether the evidence supports the conclusion or kills it."),
            item("modal_deduction_present", 8, "choose_form", 4, {"context": "Every window is lit and there are vans at the loading bay.", "stem": "The site ___ be in use at the moment.", "options": [{"text": "must", "why_this_means": "That the evidence forces this conclusion."}, {"text": "cannot", "why_this_means": "That the evidence rules this conclusion out."}], "key": 0}, confusion="cs_certainty_strength", twin="gi_modal_deduction_present_07", cue="lit and there are vans", why="Lights and vans force the in use conclusion.", forward="Same sentence, opposite evidence, opposite modal."),
            item("modal_deduction_present", 9, "transform", 4, {"given": "I am sure the library is shut, because the blinds are down.", "instruction": "Say it with a modal instead of I am sure.", "starter": "The blinds are down, so the library ___"}, expected=["must be shut", "must be closed"], why="Must carries the certainty, so I am sure becomes unnecessary.", forward="Let the modal do the work I am sure was doing."),
            item("modal_deduction_present", 10, "order", 3, {"tokens": ["the", "hall", "must", "be", "booked", "for", "something", "else"], "accepted_orders": [[0, 1, 2, 3, 4, 5, 6, 7]], "context": "Build one conclusion about the hall."}, expected=["the hall must be booked for something else"], why="Must sits before be, and the participle follows.", forward="Modal, then be, then the participle."),
            item("modal_deduction_present", 11, "dictation", 2, {"audio_text": "It can't be the last bus already.", "scored_tokens": ["can't"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["it can't be the last bus already", "it cannot be the last bus already", "it cant be the last bus already"], why="Can't is the deduction negative and is heard as one syllable.", forward="Write can't, not mustn't, when a conclusion is being ruled out."),
            item("modal_deduction_present", 12, "produce", 5, {"mode": "sentence", "prompt_text": "You arrive at a station and every departure on the board says DELAYED. Write one sentence drawing a conclusion about the cause.", "required_structure": "modal_simple", "seed_from_vocab_queue": True, "min_words": 9, "max_words": 26, "task_ref": None}, why="A board of delays is evidence, so the sentence should conclude rather than assert.", forward="Use must or can't, and make the evidence visible in the sentence."),
        ],
    },
))

POINTS.append(point(
    "gr_modal_perfect", "u07", 2020,
    "Saying how sure you are about something that already happened",
    "B2", "form",
    {
        "grammar_name": "The modal perfect: modal + have + past participle",
        "prerequisites": ["gr_modal_deduction_present", "gr_past_participle"],
        "structure_slug": "modal_perfect",
        "fixes_errors": ["modal_perfect_form"],
        "error_surface": 3,
        "estimated_minutes": 25,
        "teach": {
            "can_do": "I can say what probably happened, what cannot have happened, and what I wish had happened.",
            "why_it_matters": "It is the single structure that lets you discuss a past you did not witness, which is most of what Speaking Part 3 and a Task 2 body paragraph are made of.",
            "meaning": "Every one of these is the same three pieces: a modal, then have, then the third form of the verb. The modal supplies the attitude — sure, impossible, possible, regretful — and have plus the participle pushes all of it into the past. Learn the frame once and six meanings come with it.",
            "form": {
                "pattern": "subject + modal + have + past participle",
                "notes": [
                    "have never changes: he must have gone, not he must has gone",
                    "the third form, not the past: must have gone, never must have went",
                    "must have = I am sure it happened; can't have = I am sure it did not",
                    "might / may / could have = it possibly happened",
                    "should have = it did not happen and it would have been better if it had",
                    "needn't have = it did happen, and it was not necessary",
                ],
                "negative": "can't have / couldn't have for the impossible past; shouldn't have for the regretted one",
                "question": "Could she have missed the announcement? — the modal moves to the front, have stays put",
            },
            "visual": {
                "kind": "table",
                "spec": {
                    "headers": ["Frame", "What it claims about the past"],
                    "rows": [
                        ["must have arrived", "I am sure it happened"],
                        ["can't have arrived", "I am sure it did not happen"],
                        ["might have arrived", "it possibly happened"],
                        ["should have arrived", "it did not happen, and it would have been better if it had"],
                        ["needn't have arrived", "it did happen, and it was not necessary"],
                    ],
                },
            },
            "worked_example": {
                "sentence": "The report was on the desk before nine, so somebody must have come in early.",
                "why_this_form": "The report is the evidence and the early arrival is the conclusion, both of them in the past. Must have plus come places the reasoning and the event where they belong.",
                "what_the_other_would_mean": "Somebody must come in early is about a standing requirement now, not about what happened this morning.",
            },
            "notice_set": [
                {"sentence": "She can't have seen the notice, or she would have said something.", "question": "Did she see the notice?", "options": ["Almost certainly not", "Almost certainly yes"], "key": 0},
                {"sentence": "We should have booked the hall earlier.", "question": "Did they book it earlier?", "options": ["Yes", "No"], "key": 1},
                {"sentence": "You needn't have brought your own copy.", "question": "Did they bring one?", "options": ["Yes, and it was unnecessary", "No, and they should have"], "key": 0},
            ],
            "rule_line": "Modal, then have, then the third form — and have never changes its shape.",
            "false_rule": "That must of is an acceptable spelling because it sounds the same. It is must have; must of is never correct in writing.",
        },
        "errors": [
            {"code": "modal_perfect_form", "wrong": "The courier must have went to the old address.", "right": "The courier must have gone to the old address.", "why_it_happens": "Went is the past that the learner reaches for most; the frame needs the third form.", "smallest_fix": "went -> gone"},
            {"code": "modal_perfect_form", "wrong": "She must of missed the last train.", "right": "She must have missed the last train.", "why_it_happens": "Must have is reduced to must-uv in speech, and of is spelled the way that sounds.", "smallest_fix": "of -> have"},
            {"code": "modal_perfect_form", "wrong": "He must has forgotten about the meeting.", "right": "He must have forgotten about the meeting.", "why_it_happens": "Third-person -s is applied to have out of habit, but nothing after a modal ever agrees.", "smallest_fix": "has -> have"},
        ],
        "items": [
            item("modal_perfect", 1, "interpret", 1, {"sentence": "They can't have finished the survey already.", "question": "Does the speaker think the survey is finished?", "options": ["Yes", "No", "The sentence doesn't say"], "key": 1}, why="Can't have is the confident no about the past.", forward="Can't have rules a past event out."),
            item("modal_perfect", 2, "interpret", 1, {"sentence": "We should have booked the hall a month earlier.", "question": "Did they book it a month earlier?", "options": ["Yes", "No"], "key": 1}, why="Should have always describes what did not happen.", forward="Should have is a regret, so the thing did not happen."),
            item("modal_perfect", 3, "interpret", 2, {"sentence": "You needn't have queued at all — the tickets were on the door.", "question": "Did they queue?", "options": ["Yes, and it turned out to be unnecessary", "No, they went straight in"], "key": 0}, why="Needn't have means it was done and turned out not to be needed.", forward="Needn't have describes wasted effort that really happened."),
            item("modal_perfect", 4, "error_fix", 3, {"sentence": "The courier must have went to the old address again.", "error_span": "went", "accept_overlap_tokens": 0}, expected=["gone"], codes=["modal_perfect_form"], why="The frame takes the third form, not the past.", forward="After have, use the third form: gone, seen, taken, written."),
            item("modal_perfect", 5, "error_fix", 3, {"sentence": "She must of missed the last train from Ashfield.", "error_span": "of", "accept_overlap_tokens": 0}, expected=["have"], codes=["modal_perfect_form"], why="Must have is reduced in speech, but of is never correct in writing.", forward="If you can write must've, the full form is must have."),
            item("modal_perfect", 6, "error_fix", 3, {"sentence": "He must has forgotten about the deadline entirely.", "error_span": "has", "accept_overlap_tokens": 0}, expected=["have"], codes=["modal_perfect_form"], why="Nothing after a modal takes an ending, including have.", forward="Have never becomes has after a modal."),
            item("modal_perfect", 7, "gap_fill", 3, {"context": "The room was already tidy when they arrived.", "stem": "Somebody ___ (clean) it before the session.", "blanks": 1, "lemma_hints": ["must", "clean"]}, expected=["must have cleaned"], why="The tidy room is evidence for a past action.", forward="Modal, have, third form — all three every time."),
            item("modal_perfect", 8, "gap_fill", 3, {"context": "Her name is not on the attendance list at all.", "stem": "She ___ (attend) the first session.", "blanks": 1, "lemma_hints": ["cannot", "attend"]}, expected=["cannot have attended", "can't have attended", "cant have attended"], why="An absent name rules the attendance out.", forward="For a past ruled out, use can't have."),
            item("modal_perfect", 9, "transform", 4, {"given": "I am sure the parcel was delivered to the wrong flat.", "instruction": "Say it with a modal perfect instead of I am sure.", "starter": "The parcel ___"}, expected=["must have been delivered to the wrong flat"], why="Must have carries the certainty and the past together.", forward="I am sure it happened becomes must have plus the third form."),
            item("modal_perfect", 10, "transform", 4, {"given": "It was a mistake not to keep a copy of the form.", "instruction": "Say it as a regret about what you did not do.", "starter": "We ___"}, expected=["should have kept a copy of the form", "should have kept a copy"], why="Should have names the better action that was not taken.", forward="Regret about the past is should have plus the third form."),
            item("modal_perfect", 11, "dictation", 2, {"audio_text": "They might have missed the announcement.", "scored_tokens": ["might", "have", "missed"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["they might have missed the announcement", "they might've missed the announcement"], why="Have is reduced in speech but is still written in full.", forward="Write have even when you hear only a v."),
            item("modal_perfect", 12, "judge", 4, {"context": "A learner's sentence about a delayed delivery.", "sentence": "The driver must of took the wrong turning at the roundabout.", "acceptable": False, "reasons": ["of should be have, and took should be taken", "the sentence needs a comma", "must is the wrong modal for this evidence", "roundabout is the wrong word"], "reason_key": 0}, codes=["modal_perfect_form"], why="Two separate slips of the same frame in one short sentence.", forward="Check both halves: have, then the third form."),
            item("modal_perfect", 13, "produce", 5, {"mode": "sentence", "prompt_text": "A colleague did not arrive at a meeting and did not answer their phone. Write one sentence giving a possible explanation for what happened.", "required_structure": "modal_perfect", "seed_from_vocab_queue": True, "min_words": 9, "max_words": 28, "task_ref": None}, why="An unwitnessed past is exactly what this frame is for.", forward="Use modal + have + the third form."),
        ],
    },
))

POINTS.append(point(
    "gr_mustnt_vs_dont_have_to", "u07", 2030,
    "Two negatives that mean opposite things: must not and do not have to",
    "B1", "choice",
    {
        "grammar_name": "mustn't against don't have to",
        "prerequisites": ["gr_modal_obligation"],
        "confusion_set": "cs_obligation_source",
        "structure_slug": "modal_simple",
        "fixes_errors": ["modal_obligation_source"],
        "gravity": "global",
        "priority": 1,
        "contrast": {
        "with": [
                "gr_modal_obligation"
        ],
        "board_id": "gb_obligation_source",
        "question": "Am I banning the action, or removing the requirement?",
        "fork": [
                {
                        "answer": "Banning it — doing it would break a rule",
                        "selects": "must not",
                        "point_id": "gr_mustnt_vs_dont_have_to"
                },
                {
                        "answer": "Removing the requirement — doing it is fine either way",
                        "selects": "do not have to",
                        "point_id": "gr_modal_obligation"
                }
        ],
        "minimal_pair": {
                "a": {
                        "text": "You mustn't use a dictionary in the exam.",
                        "means": "Bringing one in breaks the rules."
                },
                "b": {
                        "text": "You don't have to use a dictionary in the exam.",
                        "means": "Bring one if you like; nobody requires it."
                },
                "only_difference": "mustn't / don't have to"
        },
        "wrong_choice_note": "You wrote mustn't where you meant there is no need. Those are opposites, and the sentence stays perfectly grammatical while telling the reader the rule is the reverse of what it is.",
        "edge_case": {
                "text": "Needn't matches don't have to, not mustn't. And mustn't has no past — for a past ban use wasn't allowed to.",
                "ignore_the_rest": False
        },
        "stronger_test": "Ask what happens if somebody does it anyway. If they are in trouble, it is mustn't. If nothing happens, it is don't have to.",
        "worked_pairs": [
                {
                        "a": "Visitors mustn't feed the animals.",
                        "b": "Visitors don't have to feed the animals.",
                        "why": "The first is a rule with consequences; the second implies feeding is an optional service, which is not what a sign means."
                }
        ]
},
        "teach": {
            "can_do": "I can tell somebody that something is forbidden, and separately that it is optional, without saying the opposite of what I mean.",
            "why_it_matters": "These two look like the same negative and mean opposite things. Getting it wrong does not sound like a small slip — it tells the reader the rule is the reverse of what it is, and the sentence stays perfectly grammatical while doing so.",
            "meaning": "Must and have to are close enough in the positive that learners treat them as one word. In the negative they split completely. Must not attaches the negative to the action: doing it is forbidden. Do not have to attaches the negative to the obligation itself: the obligation is what is absent, and the action is free either way.",
            "form": {
                "pattern": "subject + must not + plain verb   /   subject + do not have to + plain verb",
                "notes": [
                    "mustn't = it is forbidden, do not do it",
                    "don't have to = there is no requirement, do it or don't as you like",
                    "didn't have to is the past of the second; mustn't has no past — use wasn't allowed to",
                    "needn't matches don't have to, not mustn't",
                ],
                "negative": "These are the negatives. Their positives, must and have to, are far closer in meaning than these are.",
                "question": "Do I have to ...? asks about the requirement; May I ...? asks about permission.",
            },
            "visual": {
                "kind": "two_box",
                "spec": {
                    "left": {"role": "forbidden", "text": "You mustn't use a dictionary in the exam."},
                    "right": {"role": "optional", "text": "You don't have to use a dictionary in the exam."},
                    "arrow": "left_to_right",
                    "caption": "One bans the dictionary. The other says bring it if you like.",
                },
            },
            "worked_example": {
                "sentence": "Candidates must not bring a phone into the hall, but they do not have to leave their bag outside.",
                "why_this_form": "The phone is banned and the bag is optional, so the sentence needs both negatives doing their own job. Swapping them would ban the bag and permit the phone.",
                "what_the_other_would_mean": "Candidates do not have to bring a phone would say phones are simply not required, which is not a rule anyone needs to state.",
            },
            "notice_set": [
                {"sentence": "You mustn't park in front of the gates.", "question": "Is parking there allowed?", "options": ["Yes", "No"], "key": 1},
                {"sentence": "You don't have to park in the visitor bay.", "question": "Is parking in the visitor bay allowed?", "options": ["Yes, but it is not required", "No, it is forbidden"], "key": 0},
            ],
            "rule_line": "Mustn't bans the action; don't have to removes the requirement.",
            "false_rule": "That mustn't is simply the negative of have to. It is not — don't have to is, and mustn't means something else entirely.",
        },
        "errors": [
            {"code": "modal_obligation_source", "wrong": "You mustn't pay for the workshop, it is included in the course fee.", "right": "You don't have to pay for the workshop, it is included in the course fee.", "why_it_happens": "The writer means there is no need to pay, but mustn't forbids paying, so the sentence bans something the second half says is already covered.", "smallest_fix": "mustn't -> don't have to"},
        ],
        "items": [
            item("mustnt_vs_dont_have_to", 1, "interpret", 1, {"sentence": "You mustn't take photographs inside the reading room.", "question": "Are photographs allowed?", "options": ["Yes", "No"], "key": 1}, why="Mustn't forbids the action outright.", forward="Mustn't is a ban."),
            item("mustnt_vs_dont_have_to", 2, "interpret", 1, {"sentence": "You don't have to book a slot in advance.", "question": "Can you book a slot in advance if you want to?", "options": ["Yes", "No"], "key": 0}, why="The requirement is absent; the action is still available.", forward="Don't have to leaves you free either way."),
            item("mustnt_vs_dont_have_to", 3, "judge", 2, {"context": "A note to students about a free workshop.", "sentence": "You mustn't pay for the workshop, it is covered by the course fee.", "acceptable": False, "reasons": ["mustn't forbids paying, when the writer means paying is unnecessary", "the comma should be a full stop", "workshop is the wrong word", "the tense is wrong"], "reason_key": 0}, codes=["modal_obligation_source"], why="The second half explains there is no need, which is don't have to, not a ban.", forward="If the reason is it is already covered, use don't have to."),
            item("mustnt_vs_dont_have_to", 4, "error_fix", 3, {"sentence": "Students mustn't attend the optional Friday seminar if they are already confident.", "error_span": "mustn't attend", "accept_overlap_tokens": 1}, expected=["don't have to attend", "do not have to attend", "needn't attend", "dont have to attend"], codes=["modal_obligation_source"], why="Optional and if they are already confident both say the seminar is a choice.", forward="Optional means don't have to, never mustn't."),
            item("mustnt_vs_dont_have_to", 5, "error_fix", 3, {"sentence": "Visitors don't have to feed the animals under any circumstances.", "error_span": "don't have to feed", "accept_overlap_tokens": 1}, expected=["mustn't feed", "must not feed", "mustnt feed"], codes=["modal_obligation_source"], why="Under any circumstances is the language of a ban.", forward="A ban takes mustn't, whatever the surrounding politeness."),
            item("mustnt_vs_dont_have_to", 6, "gap_fill", 3, {"context": "A sign at the entrance to a laboratory.", "stem": "You ___ enter without eye protection.", "blanks": 1, "lemma_hints": ["must not"]}, expected=["must not", "mustn't", "mustnt"], why="Safety equipment rules are bans.", forward="Safety rules take mustn't."),
            item("mustnt_vs_dont_have_to", 7, "gap_fill", 3, {"context": "A note about a form that is only needed by first-year students.", "stem": "Returning students ___ complete this section.", "blanks": 1, "lemma_hints": ["do not have to"]}, expected=["do not have to", "don't have to", "needn't", "dont have to"], why="It simply does not apply to them; nothing is forbidden.", forward="Not applicable means don't have to."),
            item("mustnt_vs_dont_have_to", 8, "choose_form", 4, {"context": "A rule about a quiet study area.", "stem": "You ___ make phone calls in this room.", "options": [{"text": "mustn't", "why_this_means": "That doing it is forbidden."}, {"text": "don't have to", "why_this_means": "That doing it is optional."}], "key": 0}, confusion="cs_obligation_source", twin="gi_mustnt_vs_dont_have_to_09", cue="quiet study area", why="A quiet room bans calls rather than making them optional.", forward="Ask whether the action is banned or merely unnecessary."),
            item("mustnt_vs_dont_have_to", 9, "choose_form", 4, {"context": "A note about a session that is being recorded for anybody who misses it.", "stem": "You ___ attend the session in person.", "options": [{"text": "mustn't", "why_this_means": "That doing it is forbidden."}, {"text": "don't have to", "why_this_means": "That doing it is optional."}], "key": 1}, confusion="cs_obligation_source", twin="gi_mustnt_vs_dont_have_to_08", cue="being recorded", why="A recording removes the requirement without banning attendance.", forward="Same frame, opposite rule — read the context clause."),
            item("mustnt_vs_dont_have_to", 10, "transform", 4, {"given": "It is forbidden to bring food into the archive.", "instruction": "Say it as a rule addressed to the reader.", "starter": "You ___"}, expected=["mustn't bring food into the archive", "must not bring food into the archive", "mustnt bring food into the archive"], why="Forbidden maps onto mustn't.", forward="Forbidden becomes mustn't."),
            item("mustnt_vs_dont_have_to", 11, "transform", 4, {"given": "There is no requirement to submit a printed copy.", "instruction": "Say it as a rule addressed to the reader.", "starter": "You ___"}, expected=["don't have to submit a printed copy", "do not have to submit a printed copy", "needn't submit a printed copy", "dont have to submit a printed copy"], why="No requirement maps onto don't have to.", forward="No requirement becomes don't have to."),
            item("mustnt_vs_dont_have_to", 12, "produce", 5, {"mode": "sentence", "prompt_text": "Write two rules for a library in one sentence: one thing that is forbidden and one thing that is optional.", "required_structure": "modal_simple", "seed_from_vocab_queue": False, "min_words": 12, "max_words": 32, "task_ref": None}, why="Putting both in one sentence is the fastest way to feel the difference.", forward="Use mustn't for the ban and don't have to for the option."),
        ],
    },
))

# ======================================================================================
# u15 — the accuracy points
# ======================================================================================

POINTS.append(point(
    "gr_ed_ing_adjectives", "u15", 2040,
    "Saying who feels it and what causes it: bored against boring",
    "A2", "choice",
    {
        "grammar_name": "-ed and -ing describing words",
        "prerequisites": ["gr_adjective_position"],
        "structure_slug": None,
        "fixes_errors": ["word_form_wrong"],
        "gravity": "global",
        "priority": 1,
        "contrast": {
        "with": [],
        "board_id": "gb_ed_ing",
        "question": "Am I describing the one who feels it, or the one that causes it?",
        "fork": [
                {
                        "answer": "The one who feels it — usually a person",
                        "selects": "-ed: bored, interested, confused",
                        "point_id": "gr_ed_ing_adjectives"
                },
                {
                        "answer": "The one that causes it — usually a thing or an event",
                        "selects": "-ing: boring, interesting, confusing",
                        "point_id": "gr_ed_ing_adjectives"
                }
        ],
        "minimal_pair": {
                "a": {
                        "text": "The students were confused.",
                        "means": "The students are the ones experiencing it."
                },
                "b": {
                        "text": "The students were confusing.",
                        "means": "The students are what puzzled everybody else."
                },
                "only_difference": "confused / confusing"
        },
        "wrong_choice_note": "You wrote I am interesting. That says you are what other people find interesting, which is a claim about you rather than about how you feel. The felt form is interested.",
        "edge_case": {
                "text": "A person can genuinely take -ing when they really are the cause: he is confusing when he explains. That is not an exception to the rule, it is the rule applied to a person who happens to be the source.",
                "ignore_the_rest": False
        },
        "stronger_test": "Put by after it. If by the lecture can follow, you want the -ed form.",
        "worked_pairs": [
                {
                        "a": "The results were surprising.",
                        "b": "The researchers were surprised.",
                        "why": "Same event, and each word sits on the end that belongs to it."
                }
        ]
},
        "teach": {
            "can_do": "I can say how somebody feels without accidentally saying they are the cause of the feeling.",
            "why_it_matters": "The two endings are one letter apart and describe opposite ends of the same event. I am boring is a sentence about you that you did not mean to write, and readers do notice it.",
            "meaning": "Both endings come from the same verb, and they point in opposite directions. The -ed ending lands on whoever feels it. The -ing ending lands on whatever produces it. So a lecture that produces boredom is boring, and the student who receives it is bored — and the two words are never interchangeable, because they describe different people.",
            "form": {
                "pattern": "person + be + -ed adjective   /   thing + be + -ing adjective",
                "notes": [
                    "-ed goes with the one who feels: interested, bored, confused, surprised, tired",
                    "-ing goes with the one that causes: interesting, boring, confusing, surprising, tiring",
                    "a person can take -ing when they are genuinely the cause: he is confusing when he explains",
                    "the pair sits on many verbs of feeling: excite, frustrate, disappoint, worry, satisfy",
                ],
                "negative": "Both take not in the usual place: I was not interested; the talk was not interesting.",
                "question": "Were you interested? asks about the person; Was it interesting? asks about the thing.",
            },
            "visual": {
                "kind": "two_box",
                "spec": {
                    "left": {"role": "the one who feels it", "text": "The students were bored."},
                    "right": {"role": "the one that causes it", "text": "The lecture was boring."},
                    "arrow": "right_to_left",
                    "caption": "The arrow runs from the cause to the person. The endings mark which end you are on.",
                },
            },
            "worked_example": {
                "sentence": "The results were surprising, and the researchers were surprised by them.",
                "why_this_form": "The results did the surprising and the researchers received it, so each word sits on the right end of the same event. One sentence shows both endings doing their own job.",
                "what_the_other_would_mean": "The researchers were surprising would say the researchers were what startled everybody, which is a different claim.",
            },
            "notice_set": [
                {"sentence": "I was confused by the timetable.", "question": "Who or what caused the confusion?", "options": ["I did", "The timetable did"], "key": 1},
                {"sentence": "The instructions are confusing.", "question": "Is this about how the instructions feel, or what they do to a reader?", "options": ["What they do to a reader", "How they feel"], "key": 0},
            ],
            "rule_line": "-ed on the one who feels it, -ing on the one that causes it.",
            "false_rule": "That -ing is always the present and -ed always the past. These are describing words, not tenses; both can appear in any tense.",
        },
        "errors": [
            {"code": "word_form_wrong", "wrong": "I am very interesting in renewable energy.", "right": "I am very interested in renewable energy.", "why_it_happens": "The learner is describing themselves and reaches for the form they hear most, which is the -ing one from talking about topics.", "smallest_fix": "interesting -> interested"},
            {"code": "word_form_wrong", "wrong": "The three-hour seminar was very tired.", "right": "The three-hour seminar was very tiring.", "why_it_happens": "The seminar produced the tiredness rather than feeling it, but the felt form is the more familiar word.", "smallest_fix": "tired -> tiring"},
        ],
        "items": [
            item("ed_ing_adjectives", 1, "interpret", 1, {"sentence": "The audience was fascinated.", "question": "Who felt something?", "options": ["The audience", "Somebody else"], "key": 0}, why="The -ed ending marks the one who feels it.", forward="-ed points at the person."),
            item("ed_ing_adjectives", 2, "interpret", 1, {"sentence": "The exhibition was fascinating.", "question": "What is being described?", "options": ["The effect the exhibition had", "How the exhibition felt"], "key": 0}, why="The -ing ending marks the cause.", forward="-ing points at the thing."),
            item("ed_ing_adjectives", 3, "judge", 2, {"context": "A learner introducing themselves.", "sentence": "I am very interesting in environmental policy.", "acceptable": False, "reasons": ["interesting describes the cause, and the speaker means how they feel", "very cannot go with interesting", "in should be on", "the tense is wrong"], "reason_key": 0}, codes=["word_form_wrong"], why="The speaker is the one who feels it, so the -ed form belongs.", forward="Describing yourself takes -ed."),
            item("ed_ing_adjectives", 4, "error_fix", 3, {"sentence": "The three-hour seminar was very tired by the end.", "error_span": "tired", "accept_overlap_tokens": 0}, expected=["tiring"], codes=["word_form_wrong"], why="A seminar cannot feel tiredness; it produces it.", forward="A thing that causes the feeling takes -ing."),
            item("ed_ing_adjectives", 5, "error_fix", 3, {"sentence": "Most of the class were confusing by the new referencing rules.", "error_span": "confusing", "accept_overlap_tokens": 0}, expected=["confused"], codes=["word_form_wrong"], why="The class received the confusion; the rules caused it.", forward="After by, the subject is the one who felt it, so use -ed."),
            item("ed_ing_adjectives", 6, "gap_fill", 3, {"context": "A student writing about a documentary.", "stem": "The programme was ___ (fascinate) and I watched it twice.", "blanks": 1, "lemma_hints": ["fascinate"]}, expected=["fascinating"], why="The programme is the cause.", forward="The thing takes -ing."),
            item("ed_ing_adjectives", 7, "gap_fill", 3, {"context": "The same student, about themselves.", "stem": "I was ___ (fascinate) by how the footage had been assembled.", "blanks": 1, "lemma_hints": ["fascinate"]}, expected=["fascinated"], why="The student is the one who felt it.", forward="The person takes -ed."),
            item("ed_ing_adjectives", 8, "choose_form", 4, {"context": "A sentence about a delay at the airport.", "stem": "The passengers were extremely ___ by the fourth announcement.", "options": [{"text": "frustrated", "why_this_means": "That the passengers felt it."}, {"text": "frustrating", "why_this_means": "That the passengers caused it in others."}], "key": 0}, twin="gi_ed_ing_adjectives_09", cue="passengers were", why="The passengers received the frustration.", forward="Ask who felt it and who caused it."),
            item("ed_ing_adjectives", 9, "choose_form", 4, {"context": "A sentence about the same delay, from a member of staff.", "stem": "The fourth announcement was extremely ___ for everybody waiting.", "options": [{"text": "frustrated", "why_this_means": "That the passengers felt it."}, {"text": "frustrating", "why_this_means": "That the passengers caused it in others."}], "key": 1}, twin="gi_ed_ing_adjectives_08", cue="announcement was", why="The announcement produced the frustration.", forward="Same event, opposite end, opposite ending."),
            item("ed_ing_adjectives", 10, "transform", 4, {"given": "The film surprised the critics.", "instruction": "Write two sentences using describing words, one about the film and one about the critics.", "starter": "The film ___"}, expected=["was surprising and the critics were surprised", "was surprising, and the critics were surprised"], why="One event supplies both words, one for each end.", forward="Every verb of feeling gives you a matching pair."),
            item("ed_ing_adjectives", 11, "dictation", 2, {"audio_text": "The results were surprising and the team was surprised.", "scored_tokens": ["surprising", "surprised"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["the results were surprising and the team was surprised"], why="Both forms appear once each and the endings are the only difference.", forward="Listen to the final syllable; it carries the whole meaning."),
            item("ed_ing_adjectives", 12, "produce", 5, {"mode": "sentence", "prompt_text": "Write one sentence about a class or a talk you have been to, using both an -ed and an -ing describing word.", "required_structure": None, "seed_from_vocab_queue": True, "min_words": 10, "max_words": 30, "task_ref": None}, why="Using both in one sentence forces the distinction to be deliberate.", forward="Put the thing with -ing and yourself with -ed."),
        ],
    },
))

POINTS.append(point(
    "gr_dummy_subjects", "u15", 2050,
    "Filling the front of a sentence when there is nothing real to put there",
    "A2", "form",
    {
        "grammar_name": "it and there as empty subjects",
        "prerequisites": ["gr_there_is"],
        "structure_slug": None,
        "fixes_errors": [],
        "gravity": "global",
        "priority": 1,
        "teach": {
            "can_do": "I can start a sentence that has no real subject without leaving the front of it empty.",
            "why_it_matters": "Many languages let a sentence begin with the verb. English never does, and a missing subject is a global error — the reader stops, which costs far more than a local slip.",
            "meaning": "Sometimes there is nothing to put at the front of an English sentence: no one is raining, and nothing is being when you say there is a problem. English refuses to leave the slot empty anyway, so it fills it with a placeholder. It carries weather, time, distance and any statement whose real subject is a whole clause moved to the end. There announces that something exists.",
            "form": {
                "pattern": "It + be + ...   /   There + be + a noun",
                "notes": [
                    "it for weather, time, distance and temperature: it is raining, it is nearly four",
                    "it to move a heavy clause to the end: it is clear that the figures have been revised",
                    "there to say something exists: there is a delay, there are three options",
                    "there is / there are agrees with what follows it, not with there",
                ],
                "negative": "It is not raining. There is no delay. There are no seats left.",
                "question": "Is it raining? — Is there a delay? — the placeholder swaps with be, exactly as any subject would.",
            },
            "visual": {
                "kind": "two_box",
                "spec": {
                    "left": {"role": "the slot left empty", "text": "Is raining again in Sandmouth."},
                    "right": {"role": "the slot filled", "text": "It is raining again in Sandmouth."},
                    "arrow": "left_to_right",
                    "caption": "Nothing is doing the raining. English fills the slot anyway.",
                },
            },
            "worked_example": {
                "sentence": "It is clear that the figures have been revised since the first draft.",
                "why_this_form": "The real subject is the whole clause that the figures have been revised, which is too heavy to sit at the front. It holds the slot so the clause can arrive at the end where it reads easily.",
                "what_the_other_would_mean": "That the figures have been revised since the first draft is clear says the same thing, but makes the reader carry the entire clause before learning what is being claimed about it.",
            },
            "notice_set": [
                {"sentence": "There are three routes into the centre.", "question": "What is there doing in this sentence?", "options": ["Pointing at a place", "Announcing that something exists"], "key": 1},
                {"sentence": "It is nearly a mile from the station to the campus.", "question": "What does it refer to?", "options": ["The station", "Nothing — it fills the subject slot"], "key": 1},
            ],
            "rule_line": "An English sentence never starts with the verb: put it or there in the empty slot.",
            "false_rule": "That there in there is a delay is the same word as the there in put it over there. They are spelled alike and do unrelated jobs.",
        },
        "errors": [
            {"code": "fragment_no_main_verb", "wrong": "Is raining again, so the match has been postponed.", "right": "It is raining again, so the match has been postponed.", "why_it_happens": "Spanish, Tamil, Italian and many other languages mark the doer on the verb, so no separate subject word is needed and none is missed.", "smallest_fix": "add It"},
            {"code": "fragment_no_main_verb", "wrong": "Is a long queue outside the exam hall.", "right": "There is a long queue outside the exam hall.", "why_it_happens": "The sentence announces that something exists, and the learner starts with the verb because nothing obvious can go first.", "smallest_fix": "add There"},
        ],
        "items": [
            item("dummy_subjects", 1, "interpret", 1, {"sentence": "There is no charge for the evening session.", "question": "What does there tell you?", "options": ["Where the session is", "That no charge exists"], "key": 1}, why="There announces existence rather than pointing at a place.", forward="There is means something exists, or here does not."),
            item("dummy_subjects", 2, "interpret", 1, {"sentence": "It takes about twenty minutes to walk from the station.", "question": "What does it refer to?", "options": ["The station", "Nothing — it holds the subject slot"], "key": 1}, why="Distance and duration sentences use it as a placeholder.", forward="It can refer to nothing at all and still be required."),
            item("dummy_subjects", 3, "error_fix", 2, {"sentence": "Is raining heavily again in Sandmouth this morning.", "error_span": "Is raining", "accept_overlap_tokens": 1}, expected=["It is raining"], codes=[], why="Nothing does the raining, but the slot still has to be filled.", forward="Weather always takes it."),
            item("dummy_subjects", 4, "error_fix", 2, {"sentence": "Is a long queue outside the exam hall already.", "error_span": "Is a long queue", "accept_overlap_tokens": 2}, expected=["There is a long queue"], codes=[], why="The sentence announces existence, which takes there.", forward="Announcing something exists takes there."),
            item("dummy_subjects", 5, "gap_fill", 3, {"context": "A note about the walk from the campus to the station.", "stem": "___ is nearly a mile from the main gate to the platform.", "blanks": 1, "lemma_hints": ["it"]}, expected=["it", "It"], why="Distance takes it.", forward="Distance, time, weather: it."),
            item("dummy_subjects", 6, "gap_fill", 3, {"context": "A note about the options open to students.", "stem": "___ are three ways to apply for the bursary.", "blanks": 1, "lemma_hints": ["there"]}, expected=["there", "There"], why="Existence of several things takes there are.", forward="Existence: there."),
            item("dummy_subjects", 7, "choose_form", 4, {"context": "A sentence about the weather on the morning of the trip.", "stem": "___ was too foggy to see the far bank.", "options": [{"text": "It", "why_this_means": "That the placeholder is carrying weather or conditions."}, {"text": "There", "why_this_means": "That something is being announced as existing."}], "key": 0}, twin="gi_dummy_subjects_08", cue="too foggy", why="Weather and conditions take it.", forward="Ask whether you are describing conditions or announcing existence."),
            item("dummy_subjects", 8, "choose_form", 4, {"context": "A sentence about what could be seen from the bridge.", "stem": "___ was too much fog to see the far bank.", "options": [{"text": "It", "why_this_means": "That the placeholder is carrying weather or conditions."}, {"text": "There", "why_this_means": "That something is being announced as existing."}], "key": 1}, twin="gi_dummy_subjects_07", cue="too much fog", why="Too much fog is a quantity of a thing, so it is announced with there.", forward="A noun after the gap means there; an adjective means it."),
            item("dummy_subjects", 9, "transform", 4, {"given": "That the deadline has moved is obvious from the email.", "instruction": "Rewrite it so the heavy clause comes at the end.", "starter": "It ___"}, expected=["is obvious from the email that the deadline has moved"], why="It holds the slot so the clause can arrive last.", forward="Move a heavy that-clause to the end and put it at the front."),
            item("dummy_subjects", 10, "order", 3, {"tokens": ["there", "are", "no", "seats", "left", "on", "the", "later", "train"], "accepted_orders": [[0, 1, 2, 3, 4, 5, 6, 7, 8]], "context": "Build one sentence about the later train."}, expected=["there are no seats left on the later train"], why="There comes first and be agrees with seats.", forward="There are, because seats is plural."),
            item("dummy_subjects", 11, "dictation", 2, {"audio_text": "There is a delay and it is getting worse.", "scored_tokens": ["There", "it"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["there is a delay and it is getting worse"], why="Both placeholders appear once each, doing different jobs.", forward="Neither word refers to anything; both are required."),
            item("dummy_subjects", 12, "produce", 5, {"mode": "sentence", "prompt_text": "Describe the weather where you are and one thing that exists nearby, in one sentence.", "required_structure": None, "seed_from_vocab_queue": False, "min_words": 10, "max_words": 28, "task_ref": None}, why="Weather takes it and existence takes there, so one sentence exercises both.", forward="Use it for the weather and there for the thing."),
        ],
    },
))

POINTS.append(point(
    "gr_confusable_pairs", "u15", 2060,
    "The word pairs that sound the same and are marked wrong anyway",
    "B1", "accuracy",
    {
        "grammar_name": "Commonly confused pairs",
        "prerequisites": ["gr_possessive"],
        "structure_slug": None,
        "fixes_errors": ["word_form_wrong"],
        "gravity": "local",
        "priority": 1,
        "estimated_minutes": 25,
        "teach": {
            "can_do": "I can choose correctly between the pairs that sound identical and are spelled differently.",
            "why_it_matters": "Every one of these is scored as an error in Writing, and they are dense: a single paragraph can carry three. They are also the cheapest errors in the language to remove, because each pair has a test that takes one second.",
            "meaning": "None of these pairs is a grammar problem in the usual sense — the structures are already known. They survive because speech gives no clue: the two words sound the same, so the ear cannot correct the hand. Each pair therefore needs a written test rather than a feel, and the tests below are the ones that work.",
            "form": {
                "pattern": "one test per pair, applied while writing",
                "notes": [
                    "it's = it is or it has. If you cannot expand it, write its.",
                    "they're = they are; their = belonging to them; there = existence or place.",
                    "affect is the verb, effect is the noun: it affects the result; it has an effect.",
                    "than compares; then is time. If nothing is being compared, write then.",
                    "whose = belonging to whom; who's = who is or who has.",
                    "practice is the noun and practise the verb in British English; American uses practice for both.",
                    "lose = stop having; loose = not tight.",
                ],
                "negative": "The tests work in the negative too: it isn't expands, so it's is correct.",
                "question": "Whose is it? asks about ownership; Who's coming? expands to who is.",
            },
            "visual": {
                "kind": "table",
                "spec": {
                    "headers": ["Pair", "The test", "Example"],
                    "rows": [
                        ["it's / its", "expand to it is", "It's late. Its cover is torn."],
                        ["they're / their / there", "expand to they are; else ownership; else existence", "They're late. Their bags. There is a delay."],
                        ["affect / effect", "verb or noun", "It affects the result. It has an effect."],
                        ["than / then", "is anything being compared?", "Cheaper than before. We then left."],
                        ["whose / who's", "expand to who is", "Whose seat? Who's next?"],
                        ["lose / loose", "one o or two", "Don't lose it. The strap is loose."],
                    ],
                },
            },
            "worked_example": {
                "sentence": "The policy has had a clear effect on attendance, and it affects the evening classes most.",
                "why_this_form": "Effect follows a and an adjective, which only a noun can do; affects has a subject and an object, which only a verb can do. The sentence uses each word in the slot the other cannot occupy.",
                "what_the_other_would_mean": "A clear affect is not a milder mistake — it puts a verb where the sentence has left a noun-shaped hole.",
            },
            "notice_set": [
                {"sentence": "It's been raining since Tuesday and its roof still leaks.", "question": "Which one expands to it has?", "options": ["The first", "The second"], "key": 0},
                {"sentence": "The delay affected everybody, and the effect is still being felt.", "question": "Which word is the verb?", "options": ["affected", "effect"], "key": 0},
            ],
            "rule_line": "Apply the test as you write: expand it, or ask whether it is a verb or a noun.",
            "false_rule": "That its needs an apostrophe because it shows ownership. Possessive pronouns never take one — his, hers, ours, theirs and its all go without.",
        },
        "errors": [
            {"code": "word_form_wrong", "wrong": "The building has lost it's roof tiles in the storm.", "right": "The building has lost its roof tiles in the storm.", "why_it_happens": "Apostrophe-s marks ownership everywhere else, so it is applied here too — but its is a possessive pronoun and those never take one.", "smallest_fix": "it's -> its"},
            {"code": "word_form_wrong", "wrong": "The new timetable will effect everybody who travels before eight.", "right": "The new timetable will affect everybody who travels before eight.", "why_it_happens": "The two words are near-homophones and the noun is met far more often in reading.", "smallest_fix": "effect -> affect"},
            {"code": "word_form_wrong", "wrong": "Fares rose more sharply then they had in the previous decade.", "right": "Fares rose more sharply than they had in the previous decade.", "why_it_happens": "The vowel is reduced to almost nothing in speech, so the ear offers no help.", "smallest_fix": "then -> than"},
        ],
        "items": [
            item("confusable_pairs", 1, "interpret", 1, {"sentence": "It's been closed since March, and its windows are boarded up.", "question": "Which one can be expanded to it has?", "options": ["The first", "The second"], "key": 0}, why="Only it's expands; its is the possessive.", forward="If it expands to it is or it has, write it's."),
            item("confusable_pairs", 2, "interpret", 2, {"sentence": "The closure affected the whole timetable, and the effect lasted a term.", "question": "Which word is doing the work of a verb?", "options": ["affected", "effect"], "key": 0}, why="Affected has a subject and an object; effect follows the.", forward="Affect acts, effect is a thing."),
            item("confusable_pairs", 3, "error_fix", 3, {"sentence": "The building has lost it's roof tiles in the storm.", "error_span": "it's", "accept_overlap_tokens": 0}, expected=["its"], codes=["word_form_wrong"], why="It is roof tiles is not a sentence, so the possessive is needed.", forward="Try expanding it. If the expansion fails, drop the apostrophe."),
            item("confusable_pairs", 4, "error_fix", 3, {"sentence": "The new timetable will effect everybody who travels before eight.", "error_span": "effect", "accept_overlap_tokens": 0}, expected=["affect"], codes=["word_form_wrong"], why="Will needs a verb after it, and effect is a noun.", forward="After will, you need affect."),
            item("confusable_pairs", 5, "error_fix", 3, {"sentence": "Fares rose more sharply then they had in the previous decade.", "error_span": "then", "accept_overlap_tokens": 0}, expected=["than"], codes=["word_form_wrong"], why="More sharply sets up a comparison, which takes than.", forward="A comparison always takes than."),
            item("confusable_pairs", 6, "error_fix", 3, {"sentence": "Their are four routes into the centre from the north.", "error_span": "Their", "accept_overlap_tokens": 0}, expected=["There"], codes=["word_form_wrong"], why="The sentence announces existence, which takes there.", forward="Are four routes announces existence: there."),
            item("confusable_pairs", 7, "gap_fill", 3, {"context": "A note about a laptop left in a lecture theatre.", "stem": "The laptop is still in the office, but ___ battery is flat.", "blanks": 1, "lemma_hints": ["its"]}, expected=["its"], why="Ownership by a thing takes its, with no apostrophe.", forward="Possessive pronouns never take an apostrophe."),
            item("confusable_pairs", 8, "gap_fill", 3, {"context": "A sentence about a policy and what it has done.", "stem": "The charge has had a measurable ___ on traffic in the centre.", "blanks": 1, "lemma_hints": ["effect"]}, expected=["effect"], why="A and measurable both require a noun.", forward="After a or an adjective, you need the noun: effect."),
            item("confusable_pairs", 9, "judge", 4, {"context": "A learner's sentence in a first draft.", "sentence": "Whose going to collect the keys, and who's turn is it to lock up?", "acceptable": False, "reasons": ["the two words have been swapped", "the sentence needs a full stop", "collect is the wrong verb", "keys should be singular"], "reason_key": 0}, codes=["word_form_wrong"], why="Who's expands to who is, so it belongs in the first slot, not the second.", forward="Expand it: who is going, and whose turn."),
            item("confusable_pairs", 10, "choose_form", 4, {"context": "A sentence about a strap on a bag.", "stem": "The strap has gone ___ and the bag keeps slipping.", "options": [{"text": "loose", "why_this_means": "That it is no longer tight."}, {"text": "lose", "why_this_means": "That something is stopping being had."}], "key": 0}, twin="gi_confusable_pairs_11", cue="the bag keeps slipping", why="Gone plus a describing word takes loose.", forward="Two o's for not tight."),
            item("confusable_pairs", 11, "choose_form", 4, {"context": "A warning about a small memory card.", "stem": "Keep it in the case, or you will ___ it.", "options": [{"text": "loose", "why_this_means": "That it is no longer tight."}, {"text": "lose", "why_this_means": "That something is stopping being had."}], "key": 1}, twin="gi_confusable_pairs_10", cue="you will", why="After will the sentence needs a verb, which is lose.", forward="One o for the verb."),
            item("confusable_pairs", 12, "dictation", 2, {"audio_text": "They're leaving their bags over there.", "scored_tokens": ["They're", "their", "there"], "mode": "dictation", "speed": 1.0, "replay_slow": 0.8}, expected=["they're leaving their bags over there"], why="All three sound identical and only the spelling separates them.", forward="Expand the first, check ownership on the second, place on the third."),
            item("confusable_pairs", 13, "produce", 5, {"mode": "sentence", "prompt_text": "Write one sentence about a change at your college or workplace that uses both affect and effect correctly.", "required_structure": None, "seed_from_vocab_queue": True, "min_words": 12, "max_words": 32, "task_ref": None}, why="Using both in one sentence forces each into the slot only it can fill.", forward="Affect is what it does; effect is what it has."),
        ],
    },
))

# ======================================================================================

doc = {
    "staging_version": 1,
    "block": "final-seven",
    "authored_by": "hand",
    "_readme": (
        "The last seven points of the 154-point syllabus, written by hand after six agent runs "
        "reached 147 and lost the same two blocks to session limits each time. Four close the "
        "u07 certainty family; three are the u15 accuracy points the block was cut off before."
    ),
    "points": POINTS,
    "vocab_new": [],
    "vocab_updates": [],
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
items = sum(len(p["point_json"]["items"]) for p in POINTS)
print(f"wrote {OUT}: {len(POINTS)} points, {items} items")
