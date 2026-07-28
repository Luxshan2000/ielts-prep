"""The listening coach — the read side of the authored teaching payload.

The teaching layer lives inside ``listening_scripts.script_json`` at three depths, all of
them authored to ``content/core-en/staging-listening/DESIGN.md``:

* ``script_json.teaching`` — what makes this part hard, the vocabulary worth pre-teaching,
  the pause plan, the signpost map, the accent note and the measured metrics (DESIGN §3);
* ``script_json.groups[].teaching`` — the answer order, the attack plan for this type on
  *this* script, what to do in the preview pause, and the loss the group is built to
  provoke (§2);
* ``script_json.questions[].teaching`` — the five moments: prediction, signpost,
  answer_quote, distraction, form, recovery, and option_diagnosis on letter types (§1).

One rule outranks everything else in this file:

    **Nothing anchored to the audio is returned for a script the learner has not
    attempted.**

Reading gates a worked solution because ``evidence_quote`` points straight at the answer.
Listening's version of that field is the **transcript itself**, and the transcript is
already the answer key: every keyed completion answer is a verbatim contiguous span of a
spoken line, so a learner who reads the lines has the paper. Worse, they cannot un-know
it — the audio can be rendered again but the part cannot be sat again. So the gate here
covers a wider surface than reading's: the transcript, the answer quotes, the cue line
indices, the signposts (which name the moment), the decoys, the authored prediction slots
and the recovery notes.

What is **not** gated is the part that is genuinely preparation: the per-type strategy
pages, the group attack plans, the preview protocol, the pre-teach glosses, the pause
plan's shape and the cue table that lets a learner slot-type a question set for
themselves. Those are worth most *before* the attempt, and withholding them would leave
the coach with nothing to say to a learner who has not sat the part yet.

:func:`gate_state` is the only place that decides and :func:`teaching_payload` is the only
place that assembles the response. There is deliberately **no client attestation escape
hatch**: a listening attempt is written to the database by
``POST /listening/attempts/{id}/submit`` before that call returns, so unlike the speaking
renderer there is never a window in which the learner has attempted and the sidecar cannot
see it.

Everything here is absent-by-default. The four scripts that shipped before the teaching
pass carry no ``teaching`` object at all, so every accessor returns an empty structure
rather than raising: such a script renders as "no teaching material for this part yet"
instead of a 500.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.db import models as m
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.listening.coach")

SCHEMA_VERSION = 1


# ======================================================================================
# The closed enums (DESIGN §5). A slug is simultaneously a content field, a review
# picker, a progress axis, a drill filter and the constrained vocabulary for the "why was
# I wrong" call. Never rename one after content ships.
# ======================================================================================

#: ``distraction.trap`` families. Reading has four; listening has five, and family C has
#: no equivalent in reading at all because a printed text never takes anything back.
TRAP_FAMILIES: dict[str, str] = {
    "C": "Correction — the speaker takes it back",
    "R": "Raised and then dropped",
    "A": "Attribution and agreement",
    "N": "Numbers, quantities and codes",
    "L": "The words do not match the meaning",
}

#: ``distraction.trap`` — 24 slugs. ``signal`` is the lexical marker that must be audible
#: in the script for the trap to be fair, which makes it teachable rather than merely
#: diagnosable: a learner who learns the signal hears the trap coming next time.
TRAPS: dict[str, dict[str, str]] = {
    # ---- Family C — the speaker takes it back ----------------------------------------
    "self_correction": {
        "family": "C",
        "label": "Corrected in the same breath",
        "what_happened": (
            "A value was stated, and replaced before the sentence finished. You wrote the "
            "first one."
        ),
        "signal": "sorry · no · I mean · actually · rather · make that",
        "fix": (
            "The answer is the last value stated for that slot before the speaker moves "
            "on. Never the first. Write in pencil until the sentence ends."
        ),
    },
    "late_correction": {
        "family": "C",
        "label": "Corrected a turn later",
        "what_happened": (
            "The correction arrived after you had written the answer and moved to the "
            "next question, so you never heard it."
        ),
        "signal": "oh, hang on · did I say Tuesday? I meant Thursday",
        "fix": (
            "Keep half an ear on the speaker for one more turn after you write. A late "
            "correction is always flagged out loud — nobody corrects themselves silently."
        ),
    },
    "third_party_correction": {
        "family": "C",
        "label": "The other speaker corrected it",
        "what_happened": "One speaker gave a value and the other pushed back and replaced it.",
        "signal": "are you sure? I thought… · no, that was last year",
        "fix": (
            "In a two-voice part, a value is not settled until nobody objects. Wait for "
            "the agreement, not for the number."
        ),
    },
    "readback_correction": {
        "family": "C",
        "label": "Corrected inside the read-back",
        "what_happened": (
            "The listener repeated the value back to confirm it, and the correction "
            "landed inside the repetition."
        ),
        "signal": "so that's B. R. A. M. — actually it's with a Y",
        "fix": (
            "A read-back is not a repeat, it is a second chance to be wrong. Follow it "
            "letter for letter against what you wrote."
        ),
    },
    "spelling_correction": {
        "family": "C",
        "label": "A letter was re-given",
        "what_happened": "One letter was said wrongly and re-given. Brutal, and entirely fair.",
        "signal": "S for sugar — sorry, F for Freddie",
        "fix": (
            "When a spelling restarts, strike the whole thing out and take the restart "
            "clean. Never patch one letter of the first run."
        ),
    },
    # ---- Family R — raised and then dropped ------------------------------------------
    "rejected_option": {
        "family": "R",
        "label": "Raised, then declined",
        "what_happened": "It was discussed warmly, at length, and then not chosen.",
        "signal": "we did think about… · that would've been ideal, except",
        "fix": "Enthusiasm is not selection. Listen for the verb that settles it.",
    },
    "concession_flip": {
        "family": "R",
        "label": "Reversed after the comma",
        "what_happened": "A positive claim was reversed, and the mark is on the second clause.",
        "signal": "but · however · mind you · the thing is",
        "fix": "On a concession, the answer is always on the far side of the marker.",
    },
    "hypothetical_only": {
        "family": "R",
        "label": "Planned, not done",
        "what_happened": "It was stated as an intention or a possibility that has not happened.",
        "signal": "is planning to · there's talk of · should be ready by",
        "fix": "Check the tense and the modal. A plan is not a fact and does not answer a fact stem.",
    },
    "past_state": {
        "family": "R",
        "label": "True until recently",
        "what_happened": "It was true, and the speaker explicitly superseded it.",
        "signal": "it used to be · up until last year · that's been moved",
        "fix": "Any past tense next to a candidate answer is a warning, not a confirmation.",
    },
    "negated_fact": {
        "family": "R",
        "label": "One unstressed 'not'",
        "what_happened": (
            "Every word you were listening for was there and the polarity was inverted."
        ),
        "signal": "not · no longer · apart from · rather than",
        "fix": (
            "Negation is spoken fast and unstressed. Slow down on any sentence that "
            "sounds exactly like the answer you wanted."
        ),
    },
    # ---- Family A — attribution and agreement. Part 3's whole difficulty. -------------
    "attribution_shift": {
        "family": "A",
        "label": "Whose view was it?",
        "what_happened": (
            "The opinion belongs to the tutor, the other student or a cited source — not "
            "to the speaker the stem asks about."
        ),
        "signal": "my supervisor reckons · the paper argues",
        "fix": (
            "Before the audio starts, write the two names in the margin and tick which "
            "one each stem is about. Track people, not content."
        ),
    },
    "agreement_shift": {
        "family": "A",
        "label": "The settled position, said quietly",
        "what_happened": (
            "Proposed, resisted, modified, agreed. The keyed answer is the settled "
            "position, and it is stated least emphatically because by then everyone "
            "agrees and agreement is spoken quietly."
        ),
        "signal": "fair enough · yeah, let's do that · alright then",
        "fix": "Loudness is not evidence. Wait for the quiet agreement at the end of the exchange.",
    },
    # ---- Family N — numbers, quantities and codes -------------------------------------
    "number_superseded": {
        "family": "N",
        "label": "The figure was revised",
        "what_happened": "A figure was given and then replaced — a quote and then a discount.",
        "signal": "that's before the discount · actually, this year it's",
        "fix": "Last value wins, exactly as with any other correction.",
    },
    "number_arithmetic": {
        "family": "N",
        "label": "Several figures, one total",
        "what_happened": "Several figures were given and the key is the total the speaker stated.",
        "signal": "so that comes to · all in, that's",
        "fix": (
            "You are never required to compute. If you find yourself adding, you have "
            "missed the sentence where the speaker did it for you."
        ),
    },
    "adjacent_numbers": {
        "family": "N",
        "label": "Two numbers, one stem",
        "what_happened": (
            "Two numbers sat in one sentence and only one answers the stem — full price "
            "against concession, weeks of the course against the week of the exam."
        ),
        "signal": "twelve weeks, and the exam's in week ten",
        "fix": "Re-read the printed frame before you write. The frame says which number it wants.",
    },
    "unit_switch": {
        "family": "N",
        "label": "Same quantity, other unit",
        "what_happened": "The quantity was restated in a different unit and you converted it wrongly.",
        "signal": "nought point seven five metres — seventy-five centimetres",
        "fix": "Write the unit the printed frame prints. Never convert under the clock.",
    },
    "digit_reading": {
        "family": "N",
        "label": "How the digits were said",
        "what_happened": (
            "The spoken convention was the difficulty: 'oh' for zero, 'double four', "
            "'nineteen eighty-three'."
        ),
        "signal": "double four · oh seven · nineteen eighty-three",
        "fix": (
            "Drill the conventions once and they stop costing you marks forever. This is "
            "twenty minutes of work, not a skill."
        ),
    },
    # ---- Family L — the words do not match the meaning ---------------------------------
    "lexical_lure": {
        "family": "L",
        "label": "Your keyword, someone else's fact",
        "what_happened": (
            "The question's own keyword was spoken, attached to a different fact. The "
            "trap candidates are structurally most vulnerable to, because superficial "
            "lexical matching is what everybody falls back on under pressure."
        ),
        "signal": "the printed word, in a sentence that answers nothing",
        "fix": "Match the whole proposition, not the noun. Who does what to whom.",
    },
    "synonym_only": {
        "family": "L",
        "label": "The printed word was never spoken",
        "what_happened": (
            "The trigger was a synonym and the printed word never occurred. The commonest "
            "silent failure — you never knew the moment happened."
        ),
        "signal": "no signal, by construction",
        "fix": (
            "In the preview, say two ways a speaker might say each stem's key word. That "
            "rehearsal is what makes the synonym audible."
        ),
    },
    "option_never_named": {
        "family": "L",
        "label": "Chosen by description",
        "what_happened": "The keyed option was chosen by description and never by its printed label.",
        "signal": "I'll go for the highest one",
        "fix": "Convert each option into a property before the audio starts, not a phrase.",
    },
    "all_options_named": {
        "family": "L",
        "label": "Every option was spoken",
        "what_happened": "All three options occurred, so option-spotting was worthless by construction.",
        "signal": "all of them, in order",
        "fix": "Hearing an option proves nothing. Listen for the verb that endorses one.",
    },
    "decoy_first": {
        "family": "L",
        "label": "The decoy came first",
        "what_happened": (
            "The distractor was spoken before the answer. Structural and near-universal: "
            "the earlier plausible candidate is nearly always the trap."
        ),
        "signal": "position, not wording",
        "fix": "Never commit on the first plausible candidate. Hold it until the slot is closed.",
    },
    "paraphrased_stem": {
        "family": "L",
        "label": "The stem was the paraphrase",
        "what_happened": (
            "The option was spoken verbatim and the *stem* was the reworded half — the "
            "exact inverse of what you were braced for."
        ),
        "signal": "the option's own words, spoken plainly",
        "fix": "Paraphrase the stem in the preview so you recognise it when it arrives whole.",
    },
    "plausible_but_unasked": {
        "family": "L",
        "label": "True, and not the question",
        "what_happened": (
            "The option was stated and true, and it does not answer this stem. Why against "
            "what against when decides it."
        ),
        "signal": "the question word in the stem",
        "fix": "Underline the stem's question word in the preview. It is the whole item.",
    },
}

#: ``form.risk`` — 6 slugs, counted apart from traps everywhere. These are never
#: comprehension failures: the learner heard it and lost the mark to orthography or to
#: the answer's shape, and coaching them as listening problems wastes their time.
FORM_RISKS: dict[str, dict[str, str]] = {
    "spelling": {
        "label": "Heard right, spelled wrong",
        "what_happened": "You had the word and the marker could not accept what you wrote.",
        "fix": (
            "This is the most motivating diagnosis in the module: it is a three-week fix, "
            "not a six-month one. Drill dictation on the lines you missed."
        ),
    },
    "plural_form": {
        "label": "Singular for plural",
        "what_happened": "The printed frame decided the number and the answer did not match it.",
        "fix": "Read the completed frame back. 'some ___' and 'a ___' are instructions, not decoration.",
    },
    "word_class": {
        "label": "Right root, wrong form",
        "what_happened": "manage for management, check for checking.",
        "fix": "Let the frame's grammar pick the form. If it does not parse, it is wrong.",
    },
    "over_limit": {
        "label": "Over the word limit",
        "what_happened": "Right content, certain zero. Usually an article or the speaker's own phrase.",
        "fix": "Cut to the shortest span that still answers. Articles are words.",
    },
    "wrote_word_not_letter": {
        "label": "Wrote the words, not the letter",
        "what_happened": "A letter type answered with the option's text scores zero.",
        "fix": "Answer letter types with a letter. Copy it before the audio moves on.",
    },
    "wrong_letter_count": {
        "label": "Wrong number of letters",
        "what_happened": "'Choose TWO' answered with one or three scores zero for both, not one of two.",
        "fix": "Count your selections against the instruction before the part ends.",
    },
}

#: The process enum. **No author ever writes these** — the app derives them from the
#: attempt and its timings. They live beside the authored enums so the review picker, the
#: progress axis and the content share one vocabulary.
PROCESS: dict[str, dict[str, str]] = {
    "overrun": {
        "label": "Still writing the last one",
        "what_happened": (
            "The next answer was spoken while you were finishing the previous box. The "
            "mechanical cause of most consecutive-miss pairs."
        ),
        "fix": "Abbreviate in the box and complete it in the check window. Never write in full during the audio.",
    },
    "cascade": {
        "label": "One miss became three",
        "what_happened": "You lost your place, and the questions after the miss went with it.",
        "fix": (
            "Recovery is a skill and it is drillable: on a miss, skip forward to the next "
            "printed anchor and rejoin there rather than hunting backwards."
        ),
    },
    "preview_overrun": {
        "label": "Still reading ahead when it started",
        "what_happened": "The preview pause ended and you were not back on question one.",
        "fix": "Read the LAST question of the set at 20 seconds, then return to the first two.",
    },
    "blank": {
        "label": "Left empty",
        "what_happened": "A guaranteed zero where a guess costs nothing.",
        "fix": "There is no negative marking. Every empty box gets its predicted slot type in the check window.",
    },
}

#: ``prediction.slot`` — 14 slugs. R3's P-codes are kept as documentation; the slugs are
#: the data. This is the module's single most drillable table.
SLOTS: dict[str, dict[str, str]] = {
    "quantity": {
        "p_code": "P1",
        "label": "A quantity",
        "listening_for": "a bare figure, price, count, capacity, distance or age",
        "hazard": "13 against 30, 15 against 50; repeating a unit the frame already prints",
    },
    "code": {
        "p_code": "P2",
        "label": "A code",
        "listening_for": "phone, postcode, membership, room or reference — digits and letters, said slowly",
        "hazard": "hearing 'oh' as a letter; losing a 'double'",
    },
    "date": {
        "p_code": "P3",
        "label": "A date",
        "listening_for": "a day, a day and month, sometimes a year; days of the week live here",
        "hazard": "ordinal suffixes; day and month the other way round",
    },
    "time": {
        "p_code": "P4",
        "label": "A time",
        "listening_for": "a clock time or a duration",
        "hazard": "am against pm; a duration written where a start time was wanted",
    },
    "proper_name": {
        "p_code": "P5",
        "label": "A name",
        "listening_for": "a name, usually spelled out",
        "hazard": "pure transcription — the whole mark is orthography",
    },
    "address": {
        "p_code": "P6",
        "label": "An address",
        "listening_for": "number, street name and street type",
        "hazard": "the street type is part of the answer and gets dropped",
    },
    "noun_singular": {
        "p_code": "P7",
        "label": "A singular noun",
        "listening_for": "a noun after a / an / each / one",
        "hazard": "writing the plural",
    },
    "noun_plural": {
        "p_code": "P8",
        "label": "A plural noun",
        "listening_for": "a noun after some / two / several / a range of",
        "hazard": "dropping the -s",
    },
    "noun_uncountable": {
        "p_code": "P9",
        "label": "An uncountable noun",
        "listening_for": "equipment, advice, access, funding, transport",
        "hazard": "adding an illegal -s",
    },
    "adjective": {
        "p_code": "P10",
        "label": "An adjective",
        "listening_for": "after is / are / very, or in front of a printed noun",
        "hazard": "writing the noun instead",
    },
    "verb": {
        "p_code": "P11",
        "label": "A verb",
        "listening_for": "base form after to, -ing after a preposition, past inside a narrative",
        "hazard": "right verb, wrong inflection",
    },
    "noun_phrase": {
        "p_code": "P12",
        "label": "A noun phrase",
        "listening_for": "modifier plus head, spoken as one prosodic chunk",
        "hazard": "writing three words where two were allowed",
    },
    "letter": {
        "p_code": "P13",
        "label": "A letter",
        "listening_for": "not a gap — a choice between candidates all of which get mentioned",
        "hazard": "choosing the one mentioned first",
    },
    "category": {
        "p_code": "P14",
        "label": "A category",
        "listening_for": "the superordinate the speaker never says, or the instance when the class was given",
        "hazard": "the paraphrase gap",
    },
}

#: How the printed frame fixes the slot. A learner who internalises this can slot-type a
#: whole question set in fifteen seconds, which is why it is served ungated on every
#: predictions call: it is the technique, not the answer.
CUE_TABLE: tuple[dict[str, str], ...] = (
    {
        "printed": "a ___",
        "slot": "noun_singular",
        "note": (
            "'an ___' additionally tells you the answer begins with a vowel sound — a "
            "free constraint that eliminates half the candidates"
        ),
    },
    {"printed": "some / several / many / two / a range of ___", "slot": "noun_plural", "note": ""},
    {
        "printed": "much / amount of / level of / access to ___",
        "slot": "noun_uncountable",
        "note": "never -s",
    },
    {
        "printed": "Cost / Fee / Price / Deposit: ___",
        "slot": "quantity",
        "note": "check whether the symbol is already printed",
    },
    {
        "printed": "Tel / Ref / Membership no.: ___",
        "slot": "code",
        "note": "expect 'double' and 'oh'",
    },
    {"printed": "___ per person / per night", "slot": "quantity", "note": ""},
    {"printed": "on ___", "slot": "date", "note": "a day, a date, or a surface"},
    {"printed": "at ___", "slot": "time", "note": "or a place"},
    {"printed": "by ___", "slot": "verb", "note": "the -ing form, or an agent noun"},
    {"printed": "to ___", "slot": "verb", "note": "base form"},
    {"printed": "is / are / was ___", "slot": "adjective", "note": "or a singular noun"},
    {"printed": "very / quite / fairly ___", "slot": "adjective", "note": ""},
    {"printed": "___ + printed noun", "slot": "adjective", "note": "or a noun phrase"},
    {
        "printed": "a printed unit after the gap (___ km)",
        "slot": "quantity",
        "note": "write the bare figure only",
    },
    {
        "printed": "a printed symbol before the gap ($___)",
        "slot": "quantity",
        "note": "do NOT repeat the symbol",
    },
    {
        "printed": "the column's other cells are -ing forms",
        "slot": "verb",
        "note": "parallelism is a hard constraint",
    },
    {
        "printed": "the stem asks Why… / What was the reason…",
        "slot": "letter",
        "note": "expect several reasons mentioned and one endorsed",
    },
    {
        "printed": "the stem names two people (Part 3)",
        "slot": "letter",
        "note": "attribution trap incoming",
    },
)

#: ``signpost.kind`` — 11 slugs. In reading the skill that decides the band is seeing that
#: two differently-worded propositions match. In listening you get one pass, so what you
#: get instead is **metadiscourse**: the speaker constantly announcing what they are about
#: to do. The whole inventory is perhaps 150 phrases and it is learnable in a fortnight.
SIGNPOST_KINDS: dict[str, dict[str, Any]] = {
    "imminent": {
        "means": "the answer is arriving within a clause",
        "examples": ["the ___ is…", "that'll be…", "you'll need…", "so we've got you down for…"],
    },
    "dictation": {
        "means": "stop comprehending, start transcribing",
        "examples": ["that's spelt…", "shall I spell that?", "double-…", "all one word", "with a K"],
    },
    "structure": {
        "means": "a new section of the talk",
        "examples": ["I'll start by…", "moving on to…", "which brings me to…", "having covered…"],
    },
    "list": {
        "means": (
            "N things are coming — the strongest recovery anchor in a monologue, because "
            "the announced number tells you how many gaps to expect"
        ),
        "examples": ["there are three main…", "a couple of points here…"],
    },
    "emphasis": {
        "means": "this is the one that counts",
        "examples": ["the important thing is…", "what's crucial here…", "what swung it was…"],
    },
    "definition": {
        "means": "a term is about to be named — very common in Part 4, and the term is often the key",
        "examples": ["which we call…", "known as…", "to give it its proper name…"],
    },
    "reformulation": {
        "means": "the same idea again in easier words — a second chance at a fact you missed",
        "examples": ["in other words", "that is to say", "which basically means"],
    },
    "contrast": {
        "means": "the answer is on the far side",
        "examples": ["but", "however", "whereas", "on the other hand", "having said that"],
    },
    "correction": {
        "means": "the value is about to change",
        "examples": ["sorry", "no, actually", "I mean", "rather", "make that", "hang on"],
    },
    "decision": {
        "means": "a settled outcome (Part 3)",
        "examples": ["let's go with…", "shall we say…?", "OK, that's settled"],
    },
    "negation": {
        "means": "polarity or exclusion, and missing one inverts the answer",
        "examples": ["apart from", "except for", "rather than", "no longer", "unless", "only"],
    },
}

#: ``what_makes_this_hard.levers[]``, ordered by how much each actually moves difficulty
#: between Part 1 and Part 4. ``speech_rate`` is deliberately absent: most of the perceived
#: speed increase is lexical density, not articulation rate, and it is not an authoring
#: dial in any case.
LEVERS: dict[str, str] = {
    "lexical_density": "how much content is packed into each clause",
    "cue_answer_distance": "how far the answer sits from the phrase that announced it",
    "paraphrase_distance": "how far the spoken wording is from the printed wording",
    "syntax": "clause complexity, embedding, and how late the verb arrives",
    "answer_abstraction": "how far the answer is from a thing you can point at",
    "distraction_density": "how many values get raised and dropped per answer",
    "speaker_tracking": "keeping hold of who thinks what (Part 3 only)",
    "no_reset": "no mid-part pause to recover in (Part 4 only)",
}

#: The only legal value of ``group.teaching.answer_order``. Officially, the questions run
#: in the order the information is spoken, and **nothing in listening scatters**.
ANSWER_ORDER = "sequential"
ORDER_BADGE = "In recording order"
ORDER_CONTRAST = (
    "This is the fact that most surprises a learner arriving from Reading. There, "
    "matching headings and matching information scatter and the whole strategy is built "
    "on that. Here you are on a conveyor belt: every group runs top to bottom, so a "
    "question you have gone past is gone and the next one is always ahead of you."
)

#: The one line worth putting in the product, from the correction inventory.
LAST_VALUE_RULE = (
    "The answer is the last value stated for that slot before the speaker moves on. "
    "Never the first."
)

#: The five-step preview protocol. Group-level ``preview_focus`` instantiates it; this is
#: the constant it instantiates.
PREVIEW_PROTOCOL: tuple[dict[str, Any], ...] = (
    {"from_s": 0, "to_s": 3, "step": "Read the instruction line. How many words? Is a number allowed?"},
    {
        "from_s": 3,
        "to_s": 10,
        "step": "Slot-type every gap — one prediction slot per box. Never drop this step.",
    },
    {
        "from_s": 10,
        "to_s": 20,
        "step": "Underline one anchor per stem: the word most likely to be paraphrased.",
    },
    {"from_s": 20, "to_s": 26, "step": "Read the LAST question of the set, so you know where it ends."},
    {
        "from_s": 26,
        "to_s": 30,
        "step": "Look at the first two again — the first answer often arrives seconds after the cue.",
    },
)

#: The check window's protocol. It is an executable list, not advice, and the last line of
#: it is the one thing about the check step almost nobody says.
CHECK_PROTOCOL: tuple[str, ...] = (
    (
        "Blanks first. Every empty box gets the most plausible item of its predicted slot "
        "type. There is no negative marking; a blank is a guaranteed zero and a guess is not."
    ),
    (
        "Word limits second. Anything over the limit is a certain zero. Cut to the shortest "
        "span that still answers, and remember that articles are words."
    ),
    (
        "Plurals third. Re-read the printed frame: does 'some ___' or 'a ___' or 'two ___' "
        "force a number on the noun you wrote?"
    ),
    (
        "Doubled answers fourth. Any box holding two candidates (Tuesday/Thursday, gap(s)) "
        "is marked wrong. Pick one."
    ),
    "Spelling last, and only on words you copied from a spelled-out name.",
)

CHECK_NOTE = (
    "Nothing on that list is a question you rethink. The audio is gone, so content "
    "recovery is impossible and only form recovery is possible. That distinction is the "
    "single most useful thing to say about the check step."
)


# ======================================================================================
# Per-type strategy — static app copy (DESIGN §10 F5), written once.
#
# `answer_order` is a published property of the paper rather than an authorial choice, and
# in listening it has exactly one value. `seconds_per_question` is not a budget the
# learner controls — the audio spends the time for them — so it is reported as the pace
# the recording sets, which is a different and more useful fact.
# ======================================================================================


@dataclass(frozen=True)
class TypeStrategy:
    """The static per-type page. One per question type in the bank."""

    qtype: str
    label: str
    tests: str
    parts: tuple[int, ...]
    preview_move: str
    during_move: str
    losses: tuple[str, str]
    rule: str
    typical_slots: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "qtype": self.qtype,
            "label": self.label,
            "tests": self.tests,
            "parts": list(self.parts),
            "answer_order": ANSWER_ORDER,
            "order_badge": ORDER_BADGE,
            "order_contrast": ORDER_CONTRAST,
            "preview_move": self.preview_move,
            "during_move": self.during_move,
            "characteristic_losses": list(self.losses),
            "rule": self.rule,
            "typical_slots": [
                {"slug": slug, **SLOTS[slug]} for slug in self.typical_slots if slug in SLOTS
            ],
        }


TYPE_STRATEGY: dict[str, TypeStrategy] = {
    s.qtype: s
    for s in (
        TypeStrategy(
            qtype="form_completion",
            label="Form completion",
            tests="transcription under dictation conditions — names, numbers, dates and codes",
            parts=(1,),
            preview_move=(
                "Slot-type every field before the call starts. A form tells you what each "
                "gap is: a surname is letters, a deposit is a figure, an arrival is a date."
            ),
            during_move=(
                "Write only the burst that fills the field the speaker just named, then "
                "get your eyes back to the next field. Do not listen to the sentence."
            ),
            losses=(
                (
                    "Spelling. Four of six answers on a typical form are pure orthography, "
                    "and the whole mark rides on it."
                ),
                "Taking the first value when the speaker read it back and corrected it.",
            ),
            rule=(
                "A form is filled in the order it is printed, always, because the person "
                "on the other end is filling in the same form."
            ),
            typical_slots=("proper_name", "code", "quantity", "date", "noun_singular"),
        ),
        TypeStrategy(
            qtype="note_completion",
            label="Note completion",
            tests="following a talk's own structure and catching short bursts inside it",
            parts=(2, 3, 4),
            preview_move=(
                "Read the headings, not the gaps. The headings are the talk's plan and "
                "they tell you the order the answers will arrive in."
            ),
            during_move=(
                "Track the heading you are under. If you hear a heading from further down "
                "the page, the gaps above it are gone — skip forward, do not hunt back."
            ),
            losses=(
                "Over the word limit, because notes read as though they want a phrase.",
                "A cascade: one missed gap taking the next two with it.",
            ),
            rule=(
                "Notes are already abbreviated. Your answer is a span the speaker said, "
                "not a summary of what they meant."
            ),
            typical_slots=("noun_singular", "noun_plural", "noun_phrase", "verb", "adjective"),
        ),
        TypeStrategy(
            qtype="table_completion",
            label="Table completion",
            tests="reading across a structured comparison while the audio moves through it",
            parts=(1, 2, 4),
            preview_move=(
                "Read the column headings first. They name the categories the talk is "
                "organised by, and the filled cells show you what kind of thing each column holds."
            ),
            during_move=(
                "Work across each row, then down. A learner reading column-wise is "
                "guaranteed to be in the wrong cell — this is a ten-second fix worth "
                "several marks and nobody says it because it looks too obvious to say."
            ),
            losses=(
                "Taking the answer from the wrong row, because rows share vocabulary.",
                "Number and unit errors, especially when the unit is already printed.",
            ),
            rule="Confirm the row before you confirm the word. The table runs row-major.",
            typical_slots=("quantity", "noun_singular", "adjective", "time"),
        ),
        TypeStrategy(
            qtype="sentence_completion",
            label="Sentence completion",
            tests="hearing a proposition through a printed paraphrase of it",
            parts=(2, 3, 4),
            preview_move=(
                "Predict the word class from the frame, then say one synonym for the "
                "stem's key word out loud. The printed word is often never spoken."
            ),
            during_move="Listen for the idea, not the wording, and write the speaker's word for it.",
            losses=(
                (
                    "The synonym-only miss: the printed word never occurs and you never "
                    "know the moment went past."
                ),
                "Right word, wrong grammatical form for the printed frame.",
            ),
            rule=(
                "The gap's grammar is a constraint, not decoration. Read the completed "
                "sentence back in the check window; if it does not parse, it is wrong."
            ),
            typical_slots=("noun_singular", "noun_plural", "verb", "adjective", "noun_phrase"),
        ),
        TypeStrategy(
            qtype="short_answer",
            label="Short answer questions",
            tests="catching one specific fact and writing it inside the limit",
            parts=(1, 2, 4),
            preview_move="Decide what kind of thing each answer is before the audio starts.",
            during_move="Answer the question word. Why, what and when want different things.",
            losses=(
                "Answering with a clause where two words were asked for.",
                "Writing the true-but-unasked fact spoken beside the answer.",
            ),
            rule="The cheapest marks in the paper, and the ones most often lost to form.",
            typical_slots=("noun_singular", "quantity", "noun_phrase", "date"),
        ),
        TypeStrategy(
            qtype="summary_completion",
            label="Summary completion",
            tests="following a compressed restatement while the original is being spoken",
            parts=(2, 4),
            preview_move=(
                "Read the whole summary first. It is a paraphrase of a continuous stretch "
                "of the talk, so it tells you both the section and its shape."
            ),
            during_move="Keep your finger on the gap you are waiting for. The summary does not skip.",
            losses=(
                "Losing the thread and answering from the last thing heard.",
                "Over the word limit.",
            ),
            rule="Everything comes from one continuous stretch and it arrives in order.",
            typical_slots=("noun_singular", "noun_plural", "adjective", "verb"),
        ),
        TypeStrategy(
            qtype="multiple_choice",
            label="Multiple choice",
            tests="discrimination between candidates that all get mentioned",
            parts=(1, 2, 3, 4),
            preview_move=(
                "Underline the verb in each stem, then reduce each option to a property "
                "rather than a phrase. Options are chosen by description, not by label."
            ),
            during_move=(
                "Expect to hear every option. Listen for the one sentence that endorses, "
                "recommends or settles — that verb is the answer."
            ),
            losses=(
                "Choosing the option whose words you heard, when all three were spoken by design.",
                "Choosing an option that was raised warmly and then declined.",
            ),
            rule=(
                "Hearing an option proves nothing. Three of them are in the recording "
                "because they are wrong."
            ),
            typical_slots=("letter",),
        ),
        TypeStrategy(
            qtype="multiple_choice_multi",
            label="Multiple choice — choose TWO",
            tests="the same discrimination, over a wider span of speech",
            parts=(2, 3),
            preview_move="Count. Write the number of letters wanted at the top of the box.",
            during_move=(
                "The two answers are rarely adjacent. Keep listening after the first one "
                "instead of switching to the next question."
            ),
            losses=(
                "Selecting one or three where two were asked for, which scores zero for both.",
                "Both selections drawn from the same sentence.",
            ),
            rule="Wrong count scores zero, not one of two. Count before the part ends.",
            typical_slots=("letter",),
        ),
        TypeStrategy(
            qtype="matching",
            label="Matching",
            tests="attribution — which option belongs to which item, from a shared lettered bank",
            parts=(2, 3),
            preview_move=(
                "Read the bank once and paraphrase each option in your own words. The "
                "spoken form will be an idiom, never the printed phrase."
            ),
            during_move=(
                "Track the items in printed order and let the bank stay in your peripheral "
                "vision. Options can repeat, and some are never used."
            ),
            losses=(
                "Matching on a word the speaker used about a different item.",
                "Assuming one option per item, when the bank is deliberately larger.",
            ),
            rule=(
                "The teachable unit here is the idiom bank, not the topic: 'I'll give that "
                "a miss', 'put me down for that', 'it depends who's teaching it'. None of "
                "them contains the printed option's words."
            ),
            typical_slots=("letter", "category"),
        ),
        TypeStrategy(
            qtype="map_labelling",
            label="Map and plan labelling",
            tests="mapping spoken spatial description onto a drawn plan",
            parts=(2,),
            preview_move=(
                "Find the fixed point the plan marks — the entrance, the gate, the 'you "
                "are here' — and put your finger on it before the audio starts."
            ),
            during_move=(
                "You are not searching the plan, you are walking it. Move your finger with "
                "the speaker; each answer starts from where the last one left you."
            ),
            losses=(
                "Losing the orientation, after which every subsequent label is wrong.",
                "Labelling by plausibility rather than by the spoken preposition.",
            ),
            rule=(
                "Map answers follow the order of the recording, officially and always. "
                "That converts the scariest type in the paper into a tracking task, and it "
                "gives it the best recovery property of any type: a route is continuous, so "
                "the next place is adjacent to this one."
            ),
            typical_slots=("letter", "noun_singular"),
        ),
    )
}


# ======================================================================================
# The gate
# ======================================================================================

#: Every field withheld until the learner has submitted an attempt covering this script.
#: They travel together because each one either *is* the answer or names the second of
#: audio it was spoken in.
GATED_FIELDS: tuple[str, ...] = (
    "transcript",
    "questions[].accepted_answers",
    "questions[].explanation",
    "questions[].cue_line_index",
    "questions[].prediction.slot",
    "questions[].prediction.range",
    "questions[].prediction.note",
    "questions[].signpost",
    "questions[].answer_quote",
    "questions[].paraphrase_link",
    "questions[].distraction",
    "questions[].form",
    "questions[].recovery",
    "questions[].option_diagnosis",
    "signpost_map",
    "pre_teach[].line_index",
    "pre_teach[].blocks_q",
    "trap_profile",
    "replay",
)

LOCK_MESSAGE = (
    "Sit this part first. In listening the transcript IS the answer key — every keyed "
    "answer is a verbatim span of a spoken line — so reading it now would not teach you "
    "anything and would spend a part you can only sit once. The audio can be rendered "
    "again; the first hearing cannot."
)

PREDICTION_LOCK_MESSAGE = (
    "The authored slot for each gap arrives after you have sat the part. Predicting is "
    "the exercise: the cue table below is the whole technique, and reading our answer "
    "before you have tried it turns the strongest skill in the module into a page you "
    "skimmed."
)


@dataclass(frozen=True)
class Attempt:
    """One submitted attempt that covered a script."""

    attempt_id: str
    submitted_at: str | None
    raw_score: int | None
    total_questions: int | None
    mode: str
    evidence: str  # "script" · "test"


# ======================================================================================
# JSON helpers — never raise, always degrade to the empty structure
# ======================================================================================


def loads(raw: Any, fallback: Any) -> Any:
    """Parse a ``*_json`` column that may already be decoded, never raising."""
    if raw is None:
        return fallback
    if isinstance(raw, type(fallback)) and not isinstance(raw, str):
        return raw
    if isinstance(raw, str):
        if not raw.strip():
            return fallback
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            return fallback
        return value if isinstance(value, type(fallback)) else fallback
    return fallback


def _text(value: Any, limit: int = 600) -> str | None:
    if value is None:
        return None
    out = str(value).strip()
    return out[:limit] if out else None


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in (value or []) if isinstance(item, dict)]


def _strings(value: Any, limit: int = 40) -> list[str]:
    out: list[str] = []
    for item in value or []:
        text = _text(item, 200)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ======================================================================================
# Row and document access
# ======================================================================================


def get_script(session: Session, script_id: str) -> m.ListeningScript:
    row = session.get(m.ListeningScript, script_id)
    if row is None or row.retired:
        raise ApiError(404, "not_found", f"no listening script {script_id!r}")
    return row


def document(row: Any) -> dict[str, Any]:
    """``script_json`` as a dict, whatever the column happens to hold."""
    doc = loads(getattr(row, "script_json", None), {})
    return dict(doc) if isinstance(doc, dict) else {}


def script_teaching(doc: dict[str, Any]) -> dict[str, Any]:
    teaching = doc.get("teaching")
    return dict(teaching) if isinstance(teaching, dict) else {}


def iter_questions(doc: dict[str, Any]):
    """Every numbered question in a document, in printed order.

    ``script_json.questions[]`` is flat — the loader iterates it and ``groups[]`` is a
    parallel index rather than a nesting change — so this is deliberately not the reading
    coach's ``(group, question)`` walk.
    """
    for question in doc.get("questions") or []:
        if isinstance(question, dict):
            yield question


def groups_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    return _dicts(doc.get("groups"))


def group_for(doc: dict[str, Any], number: int | None) -> dict[str, Any] | None:
    """The authored group carrying one question number, if ``groups[]`` was authored."""
    if number is None:
        return None
    for group in groups_of(doc):
        if number in [_int(n) for n in group.get("questions") or []]:
            return group
    return None


def lines_of(doc: dict[str, Any]) -> list[dict[str, Any]]:
    return _dicts(doc.get("lines"))


def line_text(doc: dict[str, Any], index: Any) -> str | None:
    position = _int(index)
    lines = lines_of(doc)
    if position is None or not 0 <= position < len(lines):
        return None
    return _text(lines[position].get("text"), 1200)


def strip_teaching(doc: dict[str, Any]) -> dict[str, Any]:
    """Remove every ``teaching`` object at all three depths, and the group index with it.

    Listening's serialiser is an allowlist rather than a blob passthrough, so this is
    belt-and-braces rather than the primary defence — but any future caller that hands a
    whole document to a client during a sitting should hand it through here, so no
    strategy card, no signpost and no decoy is ever *serialised* during a mock.
    """
    out = dict(doc)
    out.pop("teaching", None)
    out["groups"] = [
        {k: v for k, v in group.items() if k != "teaching"} for group in groups_of(doc)
    ]
    out["questions"] = [
        {k: v for k, v in question.items() if k != "teaching"}
        for question in iter_questions(doc)
    ]
    return out


# ======================================================================================
# Attempt history — what the gate is made of
# ======================================================================================


def _script_ids_of_test(session: Session, test_id: str) -> list[str]:
    test = session.get(m.ListeningTest, test_id)
    if test is None:
        return []
    return [test.p1_id, test.p2_id, test.p3_id, test.p4_id]


def find_attempts(
    session: Session, profile_id: str, script_id: str, *, limit: int = 10
) -> list[Attempt]:
    """Submitted attempts by this learner that contained this script, newest first.

    Two shapes count, because both put the audio in front of the learner: a single-part
    practice run and a full test one of whose four parts this is. ``status ==
    'submitted'`` is load-bearing — an attempt still in progress has not been sat yet, and
    opening the gate on it would hand the transcript to somebody mid-test.
    """
    rows = session.execute(
        select(m.ListeningAttempt, m.PracticeSession.started_at)
        .join(m.PracticeSession, m.PracticeSession.id == m.ListeningAttempt.id)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.ListeningAttempt.status == "submitted",
        )
        .order_by(m.ListeningAttempt.submitted_at.desc(), m.ListeningAttempt.id.desc())
    ).all()

    test_cache: dict[str, list[str]] = {}
    out: list[Attempt] = []
    for row, started_at in rows:
        evidence: str | None = None
        if row.script_id == script_id:
            evidence = "script"
        elif row.test_id:
            if row.test_id not in test_cache:
                test_cache[row.test_id] = _script_ids_of_test(session, row.test_id)
            if script_id in test_cache[row.test_id]:
                evidence = "test"
        if evidence is None:
            continue
        out.append(
            Attempt(
                attempt_id=row.id,
                submitted_at=row.submitted_at or started_at,
                raw_score=row.raw_score,
                total_questions=row.total_questions,
                mode=row.mode,
                evidence=evidence,
            )
        )
        if len(out) >= limit:
            break
    return out


def gate_state(session: Session, profile_id: str, script_id: str) -> dict[str, Any]:
    """Whether the timeline may be returned for this script, and why.

    Two things can shut it. A live mock shuts it for **every** script, including one sat
    and legitimately unlocked last week — that is the property a mock has no value
    without. Otherwise it opens on a submitted attempt covering this script and on nothing
    else. There is no ``attested=True`` bypass: a listening attempt is persisted by its own
    submit call before that call returns.
    """
    from bandready.listening import mock as mock_mod

    conditions = mock_mod.exam_conditions(session, profile_id)
    if conditions is not None:
        return mock_mod.locked_gate(conditions)

    attempts = find_attempts(session, profile_id, script_id)
    unlocked = bool(attempts)
    return {
        "unlocked": unlocked,
        "reason": "attempted" if unlocked else "not_attempted",
        "attempts": len(attempts),
        "last_attempt_id": attempts[0].attempt_id if attempts else None,
        "last_submitted_at": attempts[0].submitted_at if attempts else None,
        "last_raw_score": attempts[0].raw_score if attempts else None,
        "evidence": attempts[0].evidence if attempts else None,
        "gated_fields": [] if unlocked else list(GATED_FIELDS),
        "message": None if unlocked else LOCK_MESSAGE,
    }


# ======================================================================================
# Shaping the authored payload
# ======================================================================================


def _trap(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = TRAPS.get(key)
    if entry is None:
        return None
    return {
        "slug": key,
        "label": entry["label"],
        "family": entry["family"],
        "family_label": TRAP_FAMILIES[entry["family"]],
        "what_happened": entry["what_happened"],
        "signal": entry["signal"],
        "fix": entry["fix"],
    }


def _form_risk(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = FORM_RISKS.get(key)
    return None if entry is None else {"slug": key, **entry}


def _slot(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = SLOTS.get(key)
    return None if entry is None else {"slug": key, **entry}


def _signpost_kind(slug: Any) -> dict[str, Any] | None:
    key = str(slug or "").strip()
    entry = SIGNPOST_KINDS.get(key)
    return None if entry is None else {"slug": key, **entry}


def _prediction(raw: Any, *, unlocked: bool) -> dict[str, Any] | None:
    """The BEFORE moment.

    ``cue`` stays open and ``slot`` does not, and the split is the whole pedagogy. The cue
    is a word already printed on the learner's paper — naming it teaches them where to
    look. The slot is what the cue *implies*, and deriving it is the exercise; handing it
    over before the attempt turns the strongest technique in the module into a page they
    skimmed.
    """
    if not isinstance(raw, dict):
        return None
    cue = _text(raw.get("cue"), 120)
    out: dict[str, Any] = {"cue": cue, "locked": not unlocked}
    if not unlocked:
        out.update({"slot": None, "range": None, "note": None})
        return out
    out.update(
        {
            "slot": _slot(raw.get("slot")),
            "range": _text(raw.get("range"), 60),
            "note": _text(raw.get("note"), 200),
        }
    )
    return out


def _signpost(raw: Any) -> dict[str, Any] | None:
    """The APPROACH moment. Always gated — it names the second the answer arrived in."""
    if not isinstance(raw, dict):
        return None
    phrase = _text(raw.get("phrase"), 200)
    if not phrase:
        return None
    return {
        "phrase": phrase,
        "line_index": _int(raw.get("line_index")),
        "kind": _signpost_kind(raw.get("kind")),
    }


def _paraphrase_link(raw: Any) -> dict[str, Any] | None:
    """Printed phrase against spoken phrase — listening's version of reading's best field."""
    if not isinstance(raw, dict):
        return None
    printed = _text(raw.get("printed") or raw.get("stem_phrase"), 300)
    spoken = _text(raw.get("audio") or raw.get("spoken") or raw.get("text_phrase"), 300)
    if not printed or not spoken:
        return None
    return {
        "printed": printed,
        "audio": spoken,
        "note": _text(raw.get("note"), 300),
    }


def _distraction(raw: Any) -> dict[str, Any] | None:
    """The decoy, recorded. The highest-value single element in the whole module.

    ``decoy_line_index`` and the cue line together are what let the review screen play the
    two lines back to back — the exact three seconds where the mark was lost.
    """
    if not isinstance(raw, dict):
        return None
    traps = [t for t in (_trap(raw.get("trap")), _trap(raw.get("trap_2"))) if t]
    decoy = _text(raw.get("decoy"), 300)
    if not traps and not decoy:
        return None
    return {
        "traps": traps,
        "trap": traps[0] if traps else None,
        "decoy": decoy,
        "decoy_line_index": _int(raw.get("decoy_line_index")),
        "signal": _text(raw.get("signal"), 200),
        "note": _text(raw.get("note"), 400),
    }


def _form(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    risk = _form_risk(raw.get("risk"))
    note = _text(raw.get("note"), 300)
    if risk is None and not note:
        return None
    return {"risk": risk, "note": note}


def _option_diagnosis(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in _dicts(raw):
        key = _text(entry.get("option") or entry.get("key"), 40)
        if not key:
            continue
        out.append(
            {
                "option": key,
                "verdict": _text(entry.get("verdict"), 40),
                "heard_at": _int(entry.get("heard_at") or entry.get("line_index")),
                "why_tempting": _text(entry.get("why_tempting"), 300),
                "why_wrong": _text(entry.get("why_wrong"), 300),
            }
        )
    return out


def group_strategy(group: dict[str, Any]) -> dict[str, Any]:
    """The per-group teaching object plus the static per-type page beside it.

    Never gated by the attempt: a strategy card says *how to attack* this type on this
    script, not what was said, and it is worth most in the thirty seconds before the audio
    starts. It **is** withheld during a mock, because during a mock nothing is preparation.
    """
    qtype = str(group.get("type") or "")
    teaching = group.get("teaching")
    teaching = dict(teaching) if isinstance(teaching, dict) else {}
    static = TYPE_STRATEGY.get(qtype)
    numbers = sorted(n for n in (_int(v) for v in group.get("questions") or []) if n is not None)
    return {
        "group_id": _text(group.get("id"), 60),
        "qtype": qtype,
        "instruction": _text(group.get("instruction"), 400),
        "type_page": static.as_dict() if static else None,
        "question_numbers": numbers,
        "question_count": len(numbers),
        "answer_order": ANSWER_ORDER,
        "order_badge": ORDER_BADGE,
        "order_note": _text(teaching.get("order_note"), 300),
        "strategy": _text(teaching.get("strategy"), 500),
        "preview_focus": _text(teaching.get("preview_focus"), 400),
        "watch_out": _text(teaching.get("watch_out"), 300),
        "spatial_cues": _strings(teaching.get("spatial_cues"), 16),
        "bank_note": _text(teaching.get("bank_note"), 300),
        "teaching_available": bool(teaching),
    }


def question_card(
    doc: dict[str, Any], question: dict[str, Any], *, unlocked: bool
) -> dict[str, Any]:
    """One question's row in the teaching payload. ``timeline`` is the gated half.

    The five moments come back in the order the review screen renders them and in no
    other: **BEFORE → APPROACH → THE MOMENT → THE TRAP → AFTER**. That order is the
    teaching. Showing the decoy before the prediction trains suspicion, which is the habit
    that makes learners overwrite answers they had right.
    """
    teaching = question.get("teaching")
    teaching = dict(teaching) if isinstance(teaching, dict) else {}
    number = _int(question.get("n") if question.get("n") is not None else question.get("number"))
    group = group_for(doc, number)
    qtype = str(question.get("type") or (group or {}).get("type") or "")

    card: dict[str, Any] = {
        "number": number,
        "qtype": qtype,
        "group_id": _text((group or {}).get("id"), 60),
        "instruction": _text(question.get("instruction"), 400),
        # The prompt is the printed page. It is on screen during the attempt already, so
        # withholding it in the coach would be theatre rather than a gate.
        "prompt": _text(question.get("prompt"), 1200),
        "options": question.get("options"),
        "select_n": _int(question.get("select_n")),
        "word_limit": question.get("word_limit"),
        # The BEFORE moment is half-open by design — see `_prediction`.
        "prediction": _prediction(teaching.get("prediction"), unlocked=unlocked),
        "teaching_available": bool(teaching),
        "timeline": None,
        "locked": not unlocked,
    }
    if not unlocked:
        return card

    card["timeline"] = {
        # 1. BEFORE — already on the card above, repeated here so the renderer can walk
        #    the five moments in one list without reaching back out.
        "prediction": card["prediction"],
        # 2. APPROACH
        "signpost": _signpost(teaching.get("signpost")),
        # 3. THE MOMENT
        "answer_quote": _text(teaching.get("answer_quote"), 600),
        "cue_line_index": _int(question.get("cue_line_index")),
        "cue_text": line_text(doc, question.get("cue_line_index")),
        "accepted_answers": _answers(question),
        "paraphrase_link": _paraphrase_link(teaching.get("paraphrase_link")),
        # 4. THE TRAP
        "distraction": _distraction(teaching.get("distraction")),
        "decoy_text": line_text(
            doc, (teaching.get("distraction") or {}).get("decoy_line_index")
        )
        if isinstance(teaching.get("distraction"), dict)
        else None,
        "option_diagnosis": _option_diagnosis(teaching.get("option_diagnosis")),
        # 5. AFTER
        "recovery": _text(teaching.get("recovery"), 300),
        "form": _form(teaching.get("form")),
        "explanation": _text(question.get("explanation"), 900),
    }
    return card


def _answers(question: dict[str, Any]) -> list[list[str]]:
    """The keyed answer slots, normalised to ``[[variant, …], …]``."""
    out: list[list[str]] = []
    for slot in question.get("answers") or []:
        if isinstance(slot, str):
            out.append([slot])
        elif isinstance(slot, list):
            out.append([str(v) for v in slot])
        elif isinstance(slot, dict) and slot.get("value") is not None:
            out.append([str(slot["value"])])
    return out


def _what_makes_this_hard(teaching: dict[str, Any]) -> dict[str, Any] | None:
    raw = teaching.get("what_makes_this_hard")
    if not isinstance(raw, dict):
        return None
    levers = [str(v) for v in raw.get("levers") or [] if str(v) in LEVERS]
    return {
        "levers": [{"slug": slug, "note": LEVERS[slug]} for slug in levers],
        "note": _text(raw.get("note"), 400),
        "hardest_question": _int(raw.get("hardest_question")),
        "why_hardest": _text(raw.get("why_hardest"), 300),
    }


def _pre_teach(teaching: dict[str, Any], *, unlocked: bool) -> list[dict[str, Any]]:
    """The vocabulary worth pre-teaching.

    Item and gloss are open — pre-teaching that waits until after the attempt is not
    pre-teaching. ``line_index`` and ``blocks_q`` are the answer's address and the mark it
    costs, so those wait.
    """
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("pre_teach")):
        item = _text(entry.get("item"), 80)
        if not item:
            continue
        out.append(
            {
                "item": item,
                "gloss": _text(entry.get("gloss"), 200),
                "line_index": _int(entry.get("line_index")) if unlocked else None,
                "blocks_q": _int(entry.get("blocks_q")) if unlocked else None,
            }
        )
    return out


def _pause_plan(teaching: dict[str, Any]) -> dict[str, Any] | None:
    """The audio's own shape, as data. Never gated — it is the timetable, not the content.

    Knowing that Part 4 previews all ten questions at once and then runs without a break
    is the structural reason a single miss cascades there, and it is the anchor for every
    Part 4 recovery note. A learner who does not know it walks into it.
    """
    raw = teaching.get("pause_plan")
    if not isinstance(raw, dict):
        return None
    blocks: list[dict[str, Any]] = []
    for entry in _dicts(raw.get("blocks")):
        numbers = [n for n in (_int(v) for v in entry.get("questions") or []) if n is not None]
        blocks.append(
            {
                "questions": numbers,
                "first_number": numbers[0] if numbers else None,
                "last_number": numbers[-1] if numbers else None,
                "preview_line_index": _int(entry.get("preview_line_index")),
                "preview_ms": _int(entry.get("preview_ms")),
                "cue_line_index": _int(entry.get("cue_line_index")),
                "orient_line_index": _int(entry.get("orient_line_index")),
            }
        )
    return {
        "blocks": blocks,
        "block_count": len(blocks),
        "close_line_index": _int(raw.get("close_line_index")),
        "check_ms": _int(raw.get("check_ms")),
        "whole_test_intro": bool(raw.get("whole_test_intro")),
        "preview_protocol": [dict(step) for step in PREVIEW_PROTOCOL],
        "note": (
            "Part 4 previews all ten questions at once and then runs without a mid-part "
            "pause. That is the structural reason one miss cascades there."
            if len(blocks) == 1
            else "Two blocks: you get a second preview part-way through, and a second start."
        ),
    }


def _signpost_map(teaching: dict[str, Any], *, unlocked: bool) -> list[dict[str, Any]]:
    """The script's structure markers. Gated: it is a line-by-line index of the audio."""
    if not unlocked:
        return []
    out: list[dict[str, Any]] = []
    for entry in _dicts(teaching.get("signpost_map")):
        phrase = _text(entry.get("phrase"), 200)
        if not phrase:
            continue
        out.append(
            {
                "line_index": _int(entry.get("line_index")),
                "phrase": phrase,
                "kind": _signpost_kind(entry.get("kind")),
            }
        )
    return out


def trap_profile(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Which traps this part's items are built on, and which questions carry them."""
    counts: dict[str, list[int]] = {}
    for question in iter_questions(doc):
        teaching = question.get("teaching")
        if not isinstance(teaching, dict):
            continue
        distraction = teaching.get("distraction")
        if not isinstance(distraction, dict):
            continue
        number = _int(question.get("n") if question.get("n") is not None else question.get("number"))
        for key in ("trap", "trap_2"):
            slug = str(distraction.get(key) or "")
            if slug not in TRAPS:
                continue
            counts.setdefault(slug, [])
            if number is not None and number not in counts[slug]:
                counts[slug].append(number)
    out = []
    for slug, numbers in counts.items():
        entry = _trap(slug)
        if entry is None:  # pragma: no cover — filtered above
            continue
        out.append({**entry, "questions": sorted(numbers), "count": len(numbers)})
    out.sort(key=lambda e: (-e["count"], e["slug"]))
    return out


# ======================================================================================
# The teaching payload — the ONLY assembler of this shape
# ======================================================================================


def script_header(row: Any, doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "script_id": row.id,
        "part": row.part,
        "title": row.title,
        "scenario": _text(doc.get("scenario"), 400),
        "topic_id": row.topic_id,
        "accent_set": row.accent_set,
        "target_band": row.target_band,
        "audio_hash": row.audio_hash,
        "schema_version": _int(doc.get("schema_version")) or 1,
    }


def audio_view(row: Any) -> dict[str, Any]:
    """Whether this part's audio exists, and where the player finds it.

    Never gated: knowing that the audio is not rendered yet is an operational fact, not a
    teaching one, and a locked coach screen that cannot say "press render" is a dead end.
    """
    from bandready.audio import tts_render

    audio_hash = row.audio_hash
    cached = tts_render.cached_render(audio_hash) if audio_hash else None
    return {
        "audio_hash": audio_hash,
        "ready": cached is not None,
        "duration_ms": int((cached or {}).get("duration_ms") or 0),
        "media_path": f"/api/v1/media/listening/{audio_hash}.wav" if audio_hash else None,
        "timing_path": (
            f"/api/v1/media/listening/{audio_hash}.timing.json" if audio_hash else None
        ),
    }


def teaching_payload(row: Any, *, unlocked: bool) -> dict[str, Any]:
    """Everything the coach may show for one part. The only assembler of this shape.

    ``unlocked`` comes from :func:`gate_state` and nowhere else. When it is false the
    timeline is **absent** — not truncated, not summarised, absent — and so is the
    transcript, while the fact that they exist is still advertised through
    ``timelines_available`` so the UI can render a locked card rather than an empty screen.
    """
    doc = document(row)
    teaching = script_teaching(doc)
    groups = [group_strategy(group) for group in groups_of(doc)]
    questions = [question_card(doc, q, unlocked=unlocked) for q in iter_questions(doc)]
    lines = lines_of(doc)

    return {
        **script_header(row, doc),
        "teaching_available": bool(teaching)
        or any(g["teaching_available"] for g in groups)
        or any(q["teaching_available"] for q in questions),
        "timelines_available": sum(1 for q in questions if q["teaching_available"]),
        "question_count": len(questions),
        "audio": audio_view(row),
        # ---- ungated: preparation material ------------------------------------------
        "speakers": _dicts(doc.get("speakers")),
        "what_makes_this_hard": _what_makes_this_hard(teaching),
        "pre_teach": _pre_teach(teaching, unlocked=unlocked),
        "pause_plan": _pause_plan(teaching),
        "accent_note": _text(teaching.get("accent_note"), 300),
        "metrics": dict(teaching.get("metrics") or {})
        if isinstance(teaching.get("metrics"), dict)
        else None,
        "groups": groups,
        "check_protocol": list(CHECK_PROTOCOL),
        "check_note": CHECK_NOTE,
        "last_value_rule": LAST_VALUE_RULE,
        # ---- gated: everything anchored to the audio ---------------------------------
        "transcript": transcript(row, doc, unlocked=unlocked),
        "signpost_map": _signpost_map(teaching, unlocked=unlocked),
        "questions": questions,
        "trap_profile": trap_profile(doc) if unlocked else [],
        "line_count": len(lines),
    }


def transcript(row: Any, doc: dict[str, Any], *, unlocked: bool) -> dict[str, Any]:
    """The spoken lines with their audio offsets, or the locked stub.

    This is the field that makes listening's gate wider than reading's. A reading passage
    is on the learner's screen throughout the attempt; a listening transcript never is,
    and it contains every keyed answer verbatim. So when the gate is shut the lines are
    not returned at all — only how many there are, which the UI needs to size a locked
    panel.
    """
    if not unlocked:
        return {"locked": True, "lines": [], "line_count": len(lines_of(doc)), "message": LOCK_MESSAGE}
    timing = _timing(row)
    out: list[dict[str, Any]] = []
    for index, line in enumerate(lines_of(doc)):
        start, end = _line_window(timing, index)
        out.append(
            {
                "index": index,
                "speaker": _text(line.get("speaker"), 40),
                "text": _text(line.get("text"), 2000),
                "pause_after_ms": _int(line.get("pause_after_ms")),
                "start_ms": start,
                "end_ms": end,
            }
        )
    return {
        "locked": False,
        "lines": out,
        "line_count": len(out),
        "timed": timing is not None,
        "message": None,
    }


def locked_teaching_payload(row: Any, conditions: dict[str, Any]) -> dict[str, Any]:
    """The teaching document during a mock: the part's identity and nothing taught.

    Built here rather than by stripping :func:`teaching_payload` so that no coaching field
    is ever *computed*, let alone serialised. The shape stays key-compatible with the open
    document so the client renders the same screen with dark panels instead of crashing on
    a missing key.
    """
    doc = document(row)
    return {
        **script_header(row, doc),
        "teaching_available": False,
        "timelines_available": 0,
        "question_count": sum(1 for _ in iter_questions(doc)),
        "audio": audio_view(row),
        "speakers": [],
        "what_makes_this_hard": None,
        "pre_teach": [],
        "pause_plan": None,
        "accent_note": None,
        "metrics": None,
        "groups": [],
        "check_protocol": [],
        "check_note": None,
        "last_value_rule": None,
        "transcript": {"locked": True, "lines": [], "line_count": 0, "message": conditions["message"]},
        "signpost_map": [],
        "questions": [],
        "trap_profile": [],
        "line_count": 0,
        "exam_conditions": conditions,
    }


# ======================================================================================
# Predictions (DESIGN §10 F4/F7d) — the strongest technique, trained on its own
# ======================================================================================

PREDICTION_NOTE = (
    "Prediction is the only listening skill you can practise with the sound off. Slot-type "
    "every gap from the printed frame before the audio starts, and half the wrong answers "
    "stop being available: a plural noun cannot be 'twenty', a code is never a word, and "
    "'an ___' tells you the answer starts with a vowel sound."
)


def predictions(row: Any, *, unlocked: bool) -> dict[str, Any]:
    """The per-gap prediction layer for one part.

    Two surfaces, and the split between them is the feature. The **cue table** is the
    technique, static app copy, never gated: it is how a printed frame fixes a slot, and a
    learner who internalises it can slot-type a whole question set in fifteen seconds. The
    **authored slots** are the answers to that exercise, and they arrive with the rest of
    the timeline.

    Every question is listed either way — with its printed frame, its instruction and its
    cue — so the drill is runnable before the part is sat, which is the entire point of a
    listening exercise that needs no audio.
    """
    doc = document(row)
    items: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for question in iter_questions(doc):
        teaching = question.get("teaching")
        teaching = dict(teaching) if isinstance(teaching, dict) else {}
        raw = teaching.get("prediction")
        number = _int(question.get("n") if question.get("n") is not None else question.get("number"))
        group = group_for(doc, number)
        slug = str((raw or {}).get("slot") or "") if isinstance(raw, dict) else ""
        if slug in SLOTS:
            counts[slug] = counts.get(slug, 0) + 1
        items.append(
            {
                "number": number,
                "qtype": str(question.get("type") or (group or {}).get("type") or ""),
                "group_id": _text((group or {}).get("id"), 60),
                "instruction": _text(question.get("instruction"), 400),
                "prompt": _text(question.get("prompt"), 1200),
                "word_limit": question.get("word_limit"),
                "prediction": _prediction(raw, unlocked=unlocked)
                or {"cue": None, "slot": None, "range": None, "note": None, "locked": not unlocked},
                "authored": isinstance(raw, dict),
            }
        )

    return {
        **script_header(row, doc),
        "note": PREDICTION_NOTE,
        "question_count": len(items),
        "authored_count": sum(1 for item in items if item["authored"]),
        "items": items,
        # Always open: the exercise needs the vocabulary of possible answers to be
        # playable at all, and a closed list of fourteen slots gives nothing away.
        "slots": {slug: dict(entry) for slug, entry in SLOTS.items()},
        "cue_table": [dict(entry) for entry in CUE_TABLE],
        "preview_protocol": [dict(step) for step in PREVIEW_PROTOCOL],
        "slot_profile": (
            [
                {"slug": slug, **SLOTS[slug], "count": count}
                for slug, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
            ]
            if unlocked
            else []
        ),
        "locked": not unlocked,
        "message": None if unlocked else PREDICTION_LOCK_MESSAGE,
    }


# ======================================================================================
# Strategy across the pack (DESIGN §10 F5)
# ======================================================================================


def strategy(
    session: Session,
    *,
    qtype: str | None = None,
    part: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    """The static per-type page for every type in the bank, plus every authored group.

    Two surfaces in one response. The **type page** is app copy, written once: what the
    type tests, which parts it appears in, the move to make in the preview pause, the move
    to make while the audio runs, its two characteristic losses and the slots it usually
    wants. The **groups** are the authored attack plans — the same type instantiated for a
    particular script, which is what the review and drill panes render above a group.

    Filterable by type and by part, because "how do I do map labelling" and "what happens
    in Part 4" are the two questions learners actually ask, and they are different
    questions.
    """
    wanted_type = (qtype or "").strip() or None
    if wanted_type and wanted_type not in TYPE_STRATEGY:
        raise ApiError(
            422,
            "validation_error",
            f"unknown question type {wanted_type!r} — one of {', '.join(sorted(TYPE_STRATEGY))}",
        )
    wanted_part = _int(part) if part is not None else None
    if wanted_part is not None and not 1 <= wanted_part <= 4:
        raise ApiError(422, "validation_error", "part must be 1, 2, 3 or 4")

    stmt = select(m.ListeningScript).where(m.ListeningScript.retired == 0)
    if wanted_part is not None:
        stmt = stmt.where(m.ListeningScript.part == wanted_part)

    by_type: dict[str, list[dict[str, Any]]] = {}
    for row in session.scalars(stmt.order_by(m.ListeningScript.id)).all():
        doc = document(row)
        for group in groups_of(doc):
            group_type = str(group.get("type") or "")
            if wanted_type and group_type != wanted_type:
                continue
            card = group_strategy(group)
            if not card["strategy"]:
                # A group with no authored plan contributes to coverage but has nothing to
                # teach; counted below, not listed.
                by_type.setdefault(group_type, [])
                continue
            by_type.setdefault(group_type, []).append(
                {
                    **card,
                    "script_id": row.id,
                    "script_title": row.title,
                    "part": row.part,
                    "accent_set": row.accent_set,
                    "target_band": row.target_band,
                }
            )

    types: list[dict[str, Any]] = []
    names = [wanted_type] if wanted_type else sorted(set(by_type) | set(TYPE_STRATEGY))
    for name in names:
        static = TYPE_STRATEGY.get(name)
        if (
            wanted_part is not None
            and static is not None
            and wanted_part not in static.parts
            and not by_type.get(name)
        ):
            continue
        groups = by_type.get(name, [])[:limit]
        types.append(
            {
                "qtype": name,
                "page": static.as_dict() if static else None,
                "in_bank": name in by_type,
                "authored_groups": len(groups),
                "questions": sum(g["question_count"] for g in groups),
                "groups": groups,
            }
        )

    return {
        "types": types,
        "count": len(types),
        "part": wanted_part,
        "answer_order": ANSWER_ORDER,
        "order_badge": ORDER_BADGE,
        "order_contrast": ORDER_CONTRAST,
        "last_value_rule": LAST_VALUE_RULE,
        "preview_protocol": [dict(step) for step in PREVIEW_PROTOCOL],
        "check_protocol": list(CHECK_PROTOCOL),
        "check_note": CHECK_NOTE,
        "signpost_kinds": {slug: dict(entry) for slug, entry in SIGNPOST_KINDS.items()},
    }


# ======================================================================================
# Replay — the highest-value review action in the module
# ======================================================================================

#: How much audio to take before the answer line starts, and after it ends. Three seconds
#: is enough to carry the clause that announced it without replaying the previous answer.
LEAD_IN_MS = 3000
TAIL_MS = 1500

REPLAY_NOTE = (
    "The moment, played back in the order you heard it: the line that announced the "
    "answer, the decoy if there was one, and the keyed line itself. Where two of those "
    "share a spoken line it plays once and is labelled as both. Nothing is re-ordered to "
    "make a point — you hear the seconds the mark was lost in, not a reconstruction."
)


def _timing(row: Any) -> dict[str, Any] | None:
    from bandready.audio import tts_render

    if not row.audio_hash:
        return None
    return tts_render.load_timing(row.audio_hash)


def _line_window(timing: dict[str, Any] | None, index: Any) -> tuple[int | None, int | None]:
    """``(start_ms, end_ms)`` for one script line, from the stitch offsets."""
    position = _int(index)
    if timing is None or position is None:
        return None, None
    for line in timing.get("lines") or []:
        if isinstance(line, dict) and _int(line.get("index")) == position:
            return _int(line.get("start_ms")), _int(line.get("end_ms"))
    return None, None


def _clip(
    doc: dict[str, Any],
    timing: dict[str, Any] | None,
    index: Any,
    *,
    role: str,
    lead_in_ms: int = 0,
    tail_ms: int = 0,
    duration_ms: int | None = None,
) -> dict[str, Any] | None:
    """One playable segment of the rendered WAV, clamped to the file."""
    position = _int(index)
    if position is None:
        return None
    start, end = _line_window(timing, position)
    text = line_text(doc, position)
    if start is None or end is None:
        # The audio is not rendered, or this line predates the render. The line still has
        # a transcript, so the card degrades to text rather than disappearing.
        return {
            "role": role,
            "line_index": position,
            "text": text,
            "start_ms": None,
            "end_ms": None,
            "seek_ms": None,
            "duration_ms": None,
            "playable": False,
        }
    from_ms = max(0, start - lead_in_ms)
    to_ms = end + tail_ms
    if duration_ms:
        to_ms = min(to_ms, int(duration_ms))
    return {
        "role": role,
        "line_index": position,
        "text": text,
        "start_ms": from_ms,
        "end_ms": to_ms,
        # Where the highlight belongs, as distinct from where playback starts.
        "seek_ms": start,
        "duration_ms": max(0, to_ms - from_ms),
        "playable": True,
    }


def replay(
    session: Session, script_id: str, number: int, *, unlocked: bool
) -> dict[str, Any]:
    """The audio moment for one question: its answer line, and what announced it.

    This is the review action worth more than any other in listening, and it is worth more
    than a worked solution because the learner's failure was not one of reasoning. They did
    not mis-weigh the evidence; their ear did not stop at the right second. Telling them
    which second it was, and playing the three before it, is the only intervention that
    addresses what actually happened.

    Precision comes from ``timing.json``, which :mod:`bandready.audio.stitch` writes with
    sample-accurate offsets for every line — so the returned window is the real position in
    the rendered WAV, not an estimate from a words-per-minute heuristic. When the part has
    not been rendered the clips come back with ``playable: false`` and their text intact,
    because a card that degrades to the transcript is far better than a 500.
    """
    row = get_script(session, script_id)
    if not unlocked:
        raise ApiError(
            409,
            "conflict",
            f"{LOCK_MESSAGE} (script {script_id})",
        )

    doc = document(row)
    question = next(
        (
            q
            for q in iter_questions(doc)
            if _int(q.get("n") if q.get("n") is not None else q.get("number")) == int(number)
        ),
        None,
    )
    if question is None:
        raise ApiError(404, "not_found", f"question {number} is not in script {script_id!r}")

    teaching = question.get("teaching")
    teaching = dict(teaching) if isinstance(teaching, dict) else {}
    timing = _timing(row)
    total_ms = _int((timing or {}).get("duration_ms"))

    signpost = _signpost(teaching.get("signpost"))
    distraction = _distraction(teaching.get("distraction"))

    cue_index = _int(question.get("cue_line_index"))
    answer_clip = _clip(
        doc,
        timing,
        cue_index,
        role="answer",
        lead_in_ms=LEAD_IN_MS,
        tail_ms=TAIL_MS,
        duration_ms=total_ms,
    )
    signpost_clip = (
        _clip(
            doc,
            timing,
            (signpost or {}).get("line_index"),
            role="signpost",
            tail_ms=500,
            duration_ms=total_ms,
        )
        if signpost
        else None
    )
    decoy_clip = (
        _clip(
            doc,
            timing,
            (distraction or {}).get("decoy_line_index"),
            role="decoy",
            tail_ms=500,
            duration_ms=total_ms,
        )
        if distraction
        else None
    )

    # ``segments`` is a playlist, and a playlist has exactly one correct order: the order
    # the learner heard. Script lines are stitched in document order, so ``line_index`` is
    # chronological whether or not the part has been rendered, and sorting by it puts the
    # signpost before the answer in the 100% of authored items where it precedes it, and
    # the decoy where it actually fell — which for the correction family ("no, sorry, make
    # that…") is *after* the wrong value and sometimes after the keyed line too. Playing a
    # later line first would not reproduce the three seconds the mark was lost in; it would
    # invent three seconds that never happened.
    #
    # Lines are merged, not merely de-duplicated, and that matters on real content: in the
    # shipped pack the signpost sits on the keyed line itself for most items, and where a
    # decoy falls on a third line the naive walk emits signpost → decoy → answer and plays
    # the keyed line **twice** with a jump backwards in between. One clip per line, keeping
    # the widest window — the answer's, which alone carries the lead-in and the tail — and
    # ``roles`` tells the UI everything that line is, so a merged clip can be labelled
    # "the signpost and the answer" rather than losing one of the two.
    widest = {"answer": 0, "decoy": 1, "signpost": 2}  # which clip's window survives a merge
    narrative = {"signpost": 0, "decoy": 1, "answer": 2}  # how a merged line is described
    by_line: dict[int, dict[str, Any]] = {}
    for clip in (signpost_clip, decoy_clip, answer_clip):
        if clip is None:
            continue
        index = int(clip["line_index"])
        existing = by_line.get(index)
        if existing is None:
            by_line[index] = {**clip, "roles": [clip["role"]]}
            continue
        roles = {*existing["roles"], clip["role"]}
        # The answer's window is the widest — it alone carries the lead-in and the tail —
        # so it is the one kept when two roles land on the same spoken line.
        keep = clip if widest[clip["role"]] < widest[existing["role"]] else existing
        by_line[index] = {**keep, "roles": sorted(roles, key=lambda role: narrative[role])}
    segments: list[dict[str, Any]] = [by_line[index] for index in sorted(by_line)]

    return {
        "script_id": row.id,
        "part": row.part,
        "title": row.title,
        "number": int(number),
        "audio": audio_view(row),
        "note": REPLAY_NOTE,
        "lead_in_ms": LEAD_IN_MS,
        "tail_ms": TAIL_MS,
        "segments": segments,
        "answer": answer_clip,
        "signpost": (
            {**signpost, "clip": signpost_clip} if signpost else None
        ),
        "distraction": ({**distraction, "clip": decoy_clip} if distraction else None),
        "answer_quote": _text(teaching.get("answer_quote"), 600),
        "accepted_answers": _answers(question),
        "recovery": _text(teaching.get("recovery"), 300),
        "explanation": _text(question.get("explanation"), 900),
        "playable": bool(segments) and all(seg["playable"] for seg in segments),
        "render_hint": (
            None
            if timing is not None
            else f"POST /api/v1/listening/scripts/{row.id}/render to make this playable"
        ),
    }


__all__ = [
    "ANSWER_ORDER",
    "CHECK_NOTE",
    "CHECK_PROTOCOL",
    "CUE_TABLE",
    "FORM_RISKS",
    "GATED_FIELDS",
    "LAST_VALUE_RULE",
    "LEAD_IN_MS",
    "LEVERS",
    "LOCK_MESSAGE",
    "ORDER_BADGE",
    "ORDER_CONTRAST",
    "PREVIEW_PROTOCOL",
    "PROCESS",
    "SIGNPOST_KINDS",
    "SLOTS",
    "TAIL_MS",
    "TRAPS",
    "TRAP_FAMILIES",
    "TYPE_STRATEGY",
    "Attempt",
    "audio_view",
    "document",
    "find_attempts",
    "gate_state",
    "get_script",
    "group_for",
    "group_strategy",
    "groups_of",
    "iter_questions",
    "line_text",
    "lines_of",
    "loads",
    "locked_teaching_payload",
    "predictions",
    "question_card",
    "replay",
    "script_header",
    "script_teaching",
    "strategy",
    "strip_teaching",
    "teaching_payload",
    "transcript",
    "trap_profile",
]
