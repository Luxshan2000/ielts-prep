"""Listening drills — practice for the skill the once-only recording actually tests.

Speaking and writing drill *production*. Reading drills *re-reading*: the text is still on
the page, so a worked solution that names the sentence is a complete lesson. Listening has
neither affordance. The audio plays once, it is gone, and the learner's decision had to be
made in real time. So a drill here cannot be "look again"; it has to be one of the four
things that are still trainable after the sound has stopped:

``dictation``
    The only exercise whose task is *purely* decoding. Play one line, type what was said,
    and grade it word by word. Partial dictation loads cleanly on the listening construct
    in confirmatory factor analysis, and the measured effect is large for how cheap it is
    (L-R4 §2) — but only when the learner is told **what class of thing** they got wrong.
    A word error rate is a number nobody can act on, so :func:`grade_dictation` sorts every
    mismatch into :data:`DICTATION_BUCKETS` instead: a missed *function* word is weak-form
    deafness, a wrong word that sounds like the right one is a segmentation failure, a
    misspelling is an **orthography success and a hearing success**, and a run of three
    silent tokens is overload. Those four need four different remedies, and averaging them
    into one percentage hides all of them.

``numbers``
    The Part 1 staple and the mechanically commonest lost mark: spelled-aloud surnames,
    phone numbers, postcodes, dates, prices. Built from the pack's own keyed answers so the
    practice is the test, and run in two modes — ``transcribe`` (hear the answer line, write
    the answer) and ``form`` (no audio: here is what the speaker *said*, write what goes in
    the box). The second mode exists because *"twenty-four pounds fifty"* → ``24.50`` is a
    transcription problem the learner will otherwise only meet on test day, and because a
    correctly heard answer written wrongly scores exactly zero.

``signpost``
    Metadiscourse is what replaces re-reading. Speakers announce what they are about to do,
    the inventory is closed and small (:data:`SIGNPOST_KINDS`), and it is learnable in a
    fortnight. Two modes: ``recognise`` (hear the marker, say what kind of thing is coming)
    and ``cue`` (hear a stretch, press the button at the moment the answer starts arriving,
    scored against the authored signpost's real position in ``timing.json``).

``prediction``
    **The only listening drill with no audio at all**, which is why it is the cheapest thing
    in the module and the one a learner can do on a bus. Show the printed gap and its
    surrounding frame; the learner commits to what *kind* of word has to fill it before any
    sound exists. Vandergrift's predict-verify-reflect cycle beats controls on comprehension
    and the gain is largest for weaker listeners — our core user (L-R4 §4.4).

**Everything mechanical is graded mechanically.** Every free-text verdict goes through
:func:`bandready.scoring.answers.answers_match`, the matcher listening and reading already
share; every spelling-leak call goes through :func:`~bandready.scoring.answers.near_miss`,
which is the character-level Levenshtein this module deliberately does not own a second copy
of. What :func:`align_tokens` adds is a different algorithm on a different alphabet — a
sequence alignment over *tokens*, needed because dictation compares two word streams of
different lengths and there is no way to bucket an error without first knowing which
reference word it belongs to.

**One judgement call, and it is quarantined.** The synonym move on a prediction item asks the
learner to invent ways a speaker might phrase the printed stem, and no string test can mark
that. It is a single ``chat_json`` call, it lives in the route rather than here, and it runs
after the mechanical verdict is already fixed so it can never change a mark.

**Degrading honestly.** The teaching payload (staging-listening/DESIGN.md §1) is newer than
some of the pack, so every accessor treats every teaching field as absent-by-default.
``dictation`` and ``numbers`` fall back to evidence that exists in any script — the cue line
and the keyed answer — and therefore work on a bare pack; ``signpost`` and ``prediction``
cannot be faked from nothing and report themselves unavailable rather than inventing a key.
:func:`census` counts what is really there.

**Storage — no new table.** A finished set writes one ``practice_sessions`` envelope and one
``drill_results`` row (:func:`record_set`), the same plumbing reading and vocab use, with the
per-item detail in ``details_json``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import re
from collections.abc import Iterator, Mapping, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from bandready.audio import tts_render
from bandready.db import models as m
from bandready.scoring.answers import (
    LETTER_TYPES,
    answers_match,
    count_words,
    expand_variants,
    instruction_for,
    near_miss,
    normalize_answer,
    within_word_limit,
    word_limit_of,
)

_log = logging.getLogger("bandready.listening.drills")


# ======================================================================================
# Vocabulary of the module
# ======================================================================================

#: Ordered as the launcher offers them, which is DESIGN §10 F7's order: the one with the
#: largest measured effect first, the one with no audio cost last so it is always offered.
DRILL_KINDS: tuple[str, ...] = ("dictation", "numbers", "signpost", "prediction")

#: ``drill_results.drill_kind`` values. Never rename one: it is simultaneously a progress
#: axis, a history filter and the key the results screen groups on.
RESULT_KINDS: dict[str, str] = {
    "dictation": "dictation",
    "numbers": "numbers_spelling",
    "signpost": "signpost",
    "prediction": "prediction",
}

#: Smallest and largest set. Below three the accuracy figure is noise; dictation is
#: genuinely exhausting and its own ceiling is lower (:data:`MAX_SIZE_BY_KIND`).
MIN_SIZE, MAX_SIZE, DEFAULT_SIZE = 3, 16, 6

#: L-R4 §2.1: "20–40 seconds of audio per set, replay unlimited, is the right unit. A whole
#: part is not." At ~4 s a line that is 5–10 items, so dictation stops at eight.
MAX_SIZE_BY_KIND: dict[str, int] = {"dictation": 8}

#: Seconds one item is worth, for the launcher's honest time estimate. Dictation is the
#: outlier because typing a heard sentence is slower than every other interaction we have.
DRILL_SECONDS: dict[str, int] = {
    "dictation": 90,
    "numbers": 40,
    "signpost": 30,
    "prediction": 25,
}


# --------------------------------------------------------------------------------------
# The dictation buckets (L-R4 §2.1) — four diagnoses, never one percentage
# --------------------------------------------------------------------------------------

#: slug → (learner-facing name, what it means, what to do next). The order is the order the
#: report lists them in, which is descending by how much the learner can act on it.
DICTATION_BUCKETS: dict[str, dict[str, str]] = {
    "function_word": {
        "name": "Weak form went past you",
        "what": "You missed a small grammar word — of, to, the, been, are. In connected "
                "speech they are unstressed and squashed, so they do not sound like the "
                "word you have stored.",
        "next": "Re-listen to just that chunk and count the words before you write them. "
                "This is the highest-signal error there is and the one nobody spots alone.",
    },
    "segmentation": {
        "name": "You heard the sounds, not the words",
        "what": "You wrote a real word built out of the right sounds in the wrong places — "
                "'a spirit' for 'a spare set'. The stream was not cut where the words are.",
        "next": "Replay and watch the transcript. The lesson is what that phrase sounds "
                "like at speed, not what it means.",
    },
    "spelling": {
        "name": "Heard it — spelled it wrong",
        "what": "Your word is one or two letters from the right one. Your ear worked. "
                "In the exam this still scores zero, which is why it is counted apart.",
        "next": "This is an orthography fix, not a listening fix. Do not practise "
                "listening to solve it.",
    },
    "dropout": {
        "name": "You dropped out",
        "what": "Three or more words in a row are missing. That is not a vocabulary gap, "
                "it is overload — attention was still on the last thing.",
        "next": "Practise the recovery habit: write something, move on, re-enter at the "
                "next signpost. One miss must not become three.",
    },
    "content_word": {
        "name": "A content word went missing",
        "what": "You missed a stressed, meaning-carrying word on its own. Usually "
                "unfamiliar vocabulary rather than a decoding failure.",
        "next": "Bank the word. This is the one bucket that is genuinely a vocabulary job.",
    },
    "substitution": {
        "name": "You wrote something else",
        "what": "The word you wrote does not sound like the word that was said, so this is "
                "a guess filling a gap rather than a mis-hearing.",
        "next": "Guessing is right on an answer sheet and wrong here — in dictation, leave "
                "the gap so it shows up as a gap.",
    },
    "inserted": {
        "name": "You added a word",
        "what": "A word you wrote is not in the recording. Usually the brain completing a "
                "familiar phrase.",
        "next": "Worth noticing: it means you were predicting, and prediction that is not "
                "checked against the audio is the thing that overwrites correct answers.",
    },
}

#: Buckets that mean *the learner heard it*. Reported as a second number, because a
#: dictation score that folds spelling in tells a learner to practise the wrong skill.
HEARD_BUCKETS: frozenset[str] = frozenset({"spelling"})

#: The closed-class inventory whose members are reduced in connected speech. A deletion of
#: one of these is bucket 1 rather than "a missing word", and that distinction is the whole
#: diagnostic value of the exercise.
_FUNCTION_WORD_LIST = """
    a an and are as at be been being but by can could did do does for from had has have he
    her him his i in into is it its me my nor of on or our shall she should so some than
    that the their them then there these they this those to us was we were what when where
    which who will with would you your am arent aren't cant can't couldnt couldn't didnt
    didn't doesnt doesn't dont don't hasnt hasn't havent haven't isnt isn't wasnt wasn't
    wont won't wouldnt wouldn't im i'm ive i've ill i'll id i'd it's thats that's theres
    there's youre you're weve we've theyre they're
"""

FUNCTION_WORDS: frozenset[str] = frozenset(_FUNCTION_WORD_LIST.split())


# --------------------------------------------------------------------------------------
# The authored enums this module reads (staging-listening/DESIGN.md §5.4, §5.5)
# --------------------------------------------------------------------------------------

#: ``teaching.prediction.slot`` — 14 slugs. The value is what the learner is told they are
#: listening for; ``family`` groups the confusable ones so a prediction item's wrong options
#: are the slots that genuinely compete rather than four obviously-absurd ones.
PREDICTION_SLOTS: dict[str, dict[str, str]] = {
    "quantity": {
        "family": "figure", "name": "A number",
        "what": "A bare figure — a price, a count, a capacity, a distance, an age.",
        "hazard": "13 heard as 30, 15 as 50; and repeating a unit that is already printed.",
    },
    "code": {
        "family": "figure", "name": "A code",
        "what": "Digits and letters said slowly — phone, postcode, membership, room, "
                "reference.",
        "hazard": "Hearing 'oh' as a letter, and losing a 'double'.",
    },
    "date": {
        "family": "figure", "name": "A date",
        "what": "A day, a day and month, sometimes a year. Days of the week live here.",
        "hazard": "Ordinal endings, and day/month order.",
    },
    "time": {
        "family": "figure", "name": "A time",
        "what": "A clock time, or how long something lasts.",
        "hazard": "am/pm, and a duration written where a start time was wanted.",
    },
    "proper_name": {
        "family": "name", "name": "A name",
        "what": "A person or place, and it will usually be spelled out for you.",
        "hazard": "None of the mark is comprehension. All of it is orthography.",
    },
    "address": {
        "family": "name", "name": "An address",
        "what": "Number, street name, and the street *type*.",
        "hazard": "Dropping the 'Road' or 'Avenue' — it is part of the answer.",
    },
    "noun_singular": {
        "family": "noun", "name": "A singular noun",
        "what": "Follows 'a', 'an', 'each', 'one'.",
        "hazard": "Writing the plural. 'an' also tells you it starts with a vowel sound.",
    },
    "noun_plural": {
        "family": "noun", "name": "A plural noun",
        "what": "Follows 'some', 'two', 'several', 'a range of'.",
        "hazard": "Dropping the -s, which costs the whole mark.",
    },
    "noun_uncountable": {
        "family": "noun", "name": "An uncountable noun",
        "what": "Equipment, advice, access, funding, transport.",
        "hazard": "Adding an -s that cannot legally be there.",
    },
    "noun_phrase": {
        "family": "noun", "name": "A noun phrase",
        "what": "Modifier plus head, said as one chunk.",
        "hazard": "Writing three words where the limit is two.",
    },
    "adjective": {
        "family": "modifier", "name": "An adjective",
        "what": "After 'is', 'are', 'very', or before a printed noun.",
        "hazard": "Writing the noun instead.",
    },
    "verb": {
        "family": "modifier", "name": "A verb",
        "what": "Base form after 'to', -ing after a preposition, past in a narrative.",
        "hazard": "Right verb, wrong inflection — and the inflection is the mark.",
    },
    "letter": {
        "family": "choice", "name": "A letter",
        "what": "Not a gap at all — a choice, and every candidate will be mentioned.",
        "hazard": "Choosing whichever one was mentioned first.",
    },
    "category": {
        "family": "choice", "name": "A category word",
        "what": "The class the speaker never names, or the instance when the class was "
                "given.",
        "hazard": "Waiting for the printed word, which is never spoken.",
    },
}

#: ``teaching.signpost.kind`` — 11 slugs. ``prompt`` is the question a recognise item asks
#: about the marker, phrased as what the learner should *do* next rather than as a label.
SIGNPOST_KINDS: dict[str, dict[str, str]] = {
    "imminent": {
        "name": "The answer, right now",
        "prompt": "The answer is arriving inside this clause — pen down, write.",
    },
    "dictation": {
        "name": "Stop comprehending, start transcribing",
        "prompt": "Letters or digits are coming. Meaning is irrelevant for a few seconds.",
    },
    "structure": {
        "name": "A new section",
        "prompt": "The talk is moving on. If you were lost, this is where you get back in.",
    },
    "list": {
        "name": "A counted list",
        "prompt": "A number of things has just been announced — that number tells you how "
                  "many gaps to expect.",
    },
    "emphasis": {
        "name": "This is the one that counts",
        "prompt": "Out of everything just said, this is the part the question is about.",
    },
    "definition": {
        "name": "A term is about to be named",
        "prompt": "A name is coming for the thing just described, and the term is often "
                  "the answer.",
    },
    "reformulation": {
        "name": "The same thing again, easier",
        "prompt": "A second chance at something you may have just missed.",
    },
    "contrast": {
        "name": "The answer is on the other side",
        "prompt": "What was just said is about to be set against something. Keep the "
                  "second half.",
    },
    "correction": {
        "name": "The value is about to change",
        "prompt": "What you have written is being withdrawn. Take the last value stated.",
    },
    "decision": {
        "name": "A decision is being settled",
        "prompt": "The agreed outcome is coming, and it will be said quietly.",
    },
    "negation": {
        "name": "Polarity or exclusion",
        "prompt": "One small word is about to invert or exclude something. Miss it and the "
                  "answer flips.",
    },
}

#: ``prediction.slot`` values whose answer is a figure, a code or a name — the ones the
#: numbers-and-spelling drill exists for.
NUMBER_SLOTS: frozenset[str] = frozenset(
    {"quantity", "code", "date", "time", "proper_name", "address"}
)

#: ``form.risk`` (DESIGN §5.2), for the reveal on a numbers item.
FORM_RISKS: dict[str, str] = {
    "spelling": "Heard right, written wrong. Zero marks, and not a listening problem.",
    "plural_form": "Singular for plural, or the reverse, where the printed frame decided it.",
    "word_class": "Right root, wrong form — 'manage' for 'management'.",
    "over_limit": "Right content, too many words. Usually an article you did not need.",
    "wrote_word_not_letter": "The option's words instead of its letter. Scores zero.",
    "wrong_letter_count": "'Choose TWO' answered with one or three. Zero for both.",
}


# ======================================================================================
# Reading the content — every teaching field absent-by-default
# ======================================================================================

def loads(raw: str | None, fallback: Any) -> Any:
    try:
        return json.loads(raw) if raw else fallback
    except ValueError:
        return fallback


def script_doc(row: m.ListeningScript) -> dict[str, Any]:
    """``script_json`` as a dict, with the row's identity folded in.

    ``script_id`` and ``part`` come off the row rather than out of the document because the
    row is what the rest of the app joins on, and a generated document does not always
    repeat them.

    ``audio_hash`` is the **expected** hash — what the current script and the current TTS
    provider would render to — not ``listening_scripts.audio_hash``. The stored column
    records one past render and follows neither an edited line nor a change of provider,
    so keying off it is what let a drill keep playing the previous engine's audio and
    keep reporting itself ready. It is computed from the document exactly as it was
    loaded, before the row's own ``accent_set`` is folded in, so that it matches the hash
    the render routes compute for the same script.
    """
    doc = loads(row.script_json, {})
    if not isinstance(doc, dict):
        doc = {}
    doc = dict(doc)
    expected = tts_render.script_audio_hash(doc)
    doc["script_id"] = row.id
    doc.setdefault("title", row.title)
    doc["part"] = row.part
    doc["accent_set"] = row.accent_set
    doc["audio_hash"] = expected
    return doc


def lines_of(doc: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [line for line in (doc.get("lines") or []) if isinstance(line, dict)]


def line_at(doc: Mapping[str, Any], index: Any) -> dict[str, Any] | None:
    try:
        position = int(index)
    except (TypeError, ValueError):
        return None
    lines = lines_of(doc)
    if 0 <= position < len(lines):
        return lines[position]
    return None


def line_text(doc: Mapping[str, Any], index: Any) -> str:
    line = line_at(doc, index)
    return str((line or {}).get("text") or "")


def speaker_of(doc: Mapping[str, Any], index: Any) -> dict[str, Any]:
    """The speaker record for a line — name and role, for "who is talking" on a clip."""
    line = line_at(doc, index) or {}
    sid = str(line.get("speaker") or "")
    for speaker in doc.get("speakers") or []:
        if isinstance(speaker, dict) and str(speaker.get("id") or "") == sid:
            return speaker
    return {"id": sid, "name": sid or "Speaker", "role": sid}


def is_narrator(doc: Mapping[str, Any], index: Any) -> bool:
    """The exam announcer, not a speaker in the scene.

    Dictating "you will hear a telephone conversation…" teaches nothing about the
    conversation, so narrator lines are excluded from every clip-based drill.
    """
    speaker = speaker_of(doc, index)
    return str(speaker.get("role") or speaker.get("id") or "").lower() == "narrator"


def iter_questions(doc: Mapping[str, Any]) -> Iterator[dict[str, Any]]:
    for question in doc.get("questions") or []:
        if isinstance(question, dict):
            yield question


def question_number(question: Mapping[str, Any]) -> int:
    for key in ("n", "number"):
        try:
            return int(question[key])
        except (KeyError, TypeError, ValueError):
            continue
    return 0


def teaching_of(node: Any) -> dict[str, Any]:
    if not isinstance(node, Mapping):
        return {}
    teaching = node.get("teaching")
    return dict(teaching) if isinstance(teaching, Mapping) else {}


def sub_teaching(question: Mapping[str, Any], field: str) -> dict[str, Any]:
    value = teaching_of(question).get(field)
    return dict(value) if isinstance(value, Mapping) else {}


def key_values(question: Mapping[str, Any]) -> list[str]:
    """Every accepted written form of the answer, flattened across slots."""
    values: list[str] = []
    for slot in question.get("answers") or []:
        values.extend(expand_variants(slot))
    return [v for v in values if v]


def group_of(doc: Mapping[str, Any], number: int) -> dict[str, Any]:
    for group in doc.get("groups") or []:
        if isinstance(group, dict) and number in (group.get("questions") or []):
            return group
    return {}


# --------------------------------------------------------------------------------------
# Audio windows — the one asset we already ship and under-use
# --------------------------------------------------------------------------------------

#: How far before a line's own start a replay clip opens, and how long it runs on past the
#: end. DESIGN §1.3: enough lead-in to hear the signpost that announced the answer, and a
#: beat after so the clip does not stop on the last consonant.
CLIP_LEAD_MS, CLIP_TAIL_MS = 2500, 1200

#: A ``cue`` signpost item plays a longer stretch, because the learner has to *wait* inside
#: it for the moment to press the button — a two-second clip would make that trivial.
CUE_LEAD_MS, CUE_TAIL_MS = 9000, 2500

#: How close a ``cue`` press has to be to count. Generous before (pressing early means you
#: heard the marker, which is the skill) and tight after (pressing late means you heard the
#: answer, which is not).
CUE_EARLY_MS, CUE_LATE_MS = 4000, 1500


def timing_for(doc: Mapping[str, Any]) -> dict[str, Any] | None:
    """The rendered ``timing.json`` for this script, or ``None`` when nothing is rendered.

    ``start_ms``/``end_ms`` are sample-accurate by construction
    (:mod:`bandready.audio.stitch`), so a clip computed from them lands on the moment it
    names. They are also *tight* now that the render trims each line's residual silence to
    a fixed floor — before that, a line's window opened on up to half a second of the
    previous voice's dead air, which is exactly how a replay button loses a learner's trust.
    """
    audio_hash = str(doc.get("audio_hash") or "")
    if not audio_hash:
        return None
    return tts_render.load_timing(audio_hash)


def line_window(timing: Mapping[str, Any] | None, index: Any) -> dict[str, int] | None:
    """``{start_ms, end_ms}`` of one line inside the rendered file."""
    if not timing:
        return None
    try:
        position = int(index)
    except (TypeError, ValueError):
        return None
    for entry in timing.get("lines") or []:
        if isinstance(entry, Mapping) and int(entry.get("index", -1)) == position:
            return {"start_ms": int(entry.get("start_ms") or 0),
                    "end_ms": int(entry.get("end_ms") or 0)}
    return None


def clip_for(
    timing: Mapping[str, Any] | None,
    index: Any,
    *,
    lead_ms: int = CLIP_LEAD_MS,
    tail_ms: int = CLIP_TAIL_MS,
) -> dict[str, int] | None:
    """A playable window around one line, clamped to the file.

    ``line_start_ms`` rides along because the ``cue`` drill is scored against *the line's
    own* start, not the clip's — the learner presses a button inside the clip and the mark
    is how close that press was to the moment the answer actually began.
    """
    window = line_window(timing, index)
    if window is None:
        return None
    duration = int((timing or {}).get("duration_ms") or 0)
    start = max(0, window["start_ms"] - max(0, lead_ms))
    end = window["end_ms"] + max(0, tail_ms)
    if duration:
        end = min(end, duration)
    if end <= start:
        return None
    return {
        "start_ms": start,
        "end_ms": end,
        "line_start_ms": window["start_ms"],
        "line_end_ms": window["end_ms"],
    }


def audio_ref(doc: Mapping[str, Any]) -> dict[str, Any]:
    """Where the client fetches the recording, and whether it exists yet.

    ``doc["audio_hash"]`` is the expected hash (:func:`script_doc`), so ``ready`` answers
    "is the audio this configuration would produce already on disk" rather than "was
    something rendered once". A drill whose provider has changed comes back not-ready and
    the existing 409 → ``NeedsAudioError`` → inline Prepare panel path takes over.
    """
    audio_hash = str(doc.get("audio_hash") or "")
    ready = bool(audio_hash) and tts_render.cached_render(audio_hash) is not None
    return {
        "audio_hash": audio_hash if ready else None,
        "expected_audio_hash": audio_hash or None,
        "ready": ready,
        "media_path": f"/api/v1/media/listening/{audio_hash}.wav" if audio_hash else None,
        "timing_path": (
            f"/api/v1/media/listening/{audio_hash}.timing.json" if audio_hash else None
        ),
    }


# ======================================================================================
# Token alignment — the one algorithm this module owns
# ======================================================================================

_WORD = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)*")


def dictation_tokens(text: str) -> list[str]:
    """Lower-cased word tokens, punctuation dropped, contractions kept whole.

    Punctuation is not marked in listening and never has been, so a learner who writes the
    words and no commas has written the sentence. Contractions stay one token because
    ``I'll`` is one word to the ear and to the IELTS word count alike.
    """
    return [match.group(0).lower().replace("’", "'") for match in _WORD.finditer(text or "")]


#: Alignment weights. A substitution costs less than a deletion plus an insertion — so two
#: words that line up are still paired rather than torn apart — but **more than a single
#: gap**, which is what makes the alignment prefer the reading with the most matched words.
#: With ``SUB == GAP`` the aligner is free to call ``big red van`` → ``red vans now`` three
#: substitutions, and the learner is told they mis-heard three words when they dropped one.

def _sounds_like(a: str, b: str) -> bool:
    """Rough phonetic neighbourhood: do these two share most of their letters, in order?

    Deliberately crude. A real phonetic distance needs a pronunciation dictionary we do not
    ship, and the bucket this feeds — *segmentation* versus *you wrote something else* — is
    a coaching hint, not a mark. Erring towards "sounds like" is the safe direction: it
    routes the learner to a connected-speech replay, which is useful either way.
    """
    if not a or not b:
        return False
    # One word inside the other is the classic boundary error: "bath house" written as
    # "bathhouse", "a name" as "an aim". The stream was heard; it was cut in the wrong place.
    if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
        return True
    if a[0] == b[0] and (a.startswith(b[:3]) or b.startswith(a[:3])):
        return True
    common = 0
    remaining = list(b)
    for char in a:
        if char in remaining:
            remaining.remove(char)
            common += 1
    return common / max(len(a), len(b)) >= 0.6


def _is_spelling_slip(reference: str, given: str) -> bool:
    """A misspelling of the right word, rather than a different word.

    Guarded on length because at three letters or fewer almost everything is within two
    edits of everything else — ``the``/``they``, ``in``/``it`` — and calling those a
    spelling slip would tell a learner their ear worked when it did not.
    """
    if len(reference) < 4 or reference == given or not given:
        return False
    if reference in FUNCTION_WORDS or given in FUNCTION_WORDS:
        return False
    return near_miss(given, [reference], max_distance=2)


#: Alignment weights, and they are the difference between a report a learner recognises and
#: one they argue with.
#:
#: ``GAP_COST``       omitting or inventing a word.
#: ``SUB_COST``       pairing two words with nothing in common — deliberately dearer than a
#:                    gap, so the aligner prefers the reading with the most matched words.
#:                    With ``SUB == GAP`` it is free to call ``big red van`` → ``red vans
#:                    now`` three substitutions, telling the learner they mis-heard three
#:                    words when what they actually did was drop one.
#: ``SUB_NEAR_COST``  pairing two words that look or sound alike — cheaper than a gap, so
#:                    ``van`` and ``vans`` are matched to each other instead of reported as
#:                    an unrelated deletion next to an unrelated insertion.
GAP_COST, SUB_COST, SUB_NEAR_COST = 2, 3, 1


def _sub_cost(a: str, b: str, memo: dict[tuple[str, str], int]) -> int:
    """Similarity-aware substitution price, memoised across the alignment table."""
    if a == b:
        return 0
    cached = memo.get((a, b))
    if cached is None:
        cached = (
            SUB_NEAR_COST
            if (_sounds_like(a, b) or _is_spelling_slip(a, b))
            else SUB_COST
        )
        memo[(a, b)] = cached
    return cached


def align_tokens(
    reference: Sequence[str], given: Sequence[str]
) -> list[tuple[str, int | None, int | None]]:
    """Weighted edit alignment over **tokens**, returned as an edit script.

    Each entry is ``(op, reference_index, given_index)`` with ``op`` in
    ``equal | sub | del | ins``. ``del`` means the learner omitted a reference word;
    ``ins`` means they wrote one that is not in the recording.

    This is not a second copy of :func:`~bandready.scoring.answers.near_miss`. That measures
    the distance between two *strings* and is what decides whether a substitution is a
    misspelling; this decides which reference word a learner's word is even a candidate for,
    which has to happen first and cannot be done character-wise. Sequences here are one
    spoken line — tens of tokens — so the quadratic table is free.

    The weighting matters more than it looks. Every diagnosis downstream is a statement
    about *one reference word*, so an alignment that pairs unrelated words to save an
    operation produces a report that is wrong in a way the learner can see.
    """
    n, k = len(reference), len(given)
    memo: dict[tuple[str, str], int] = {}
    cost = [[0] * (k + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        cost[i][0] = i * GAP_COST
    for j in range(1, k + 1):
        cost[0][j] = j * GAP_COST
    for i in range(1, n + 1):
        for j in range(1, k + 1):
            cost[i][j] = min(
                cost[i - 1][j - 1] + _sub_cost(reference[i - 1], given[j - 1], memo),
                cost[i - 1][j] + GAP_COST,
                cost[i][j - 1] + GAP_COST,
            )

    ops: list[tuple[str, int | None, int | None]] = []
    i, j = n, k
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            price = _sub_cost(reference[i - 1], given[j - 1], memo)
            if cost[i][j] == cost[i - 1][j - 1] + price:
                ops.append(("equal" if price == 0 else "sub", i - 1, j - 1))
                i, j = i - 1, j - 1
                continue
        if i > 0 and cost[i][j] == cost[i - 1][j] + GAP_COST:
            ops.append(("del", i - 1, None))
            i -= 1
            continue
        ops.append(("ins", None, j - 1))
        j -= 1
    ops.reverse()
    return ops


def grade_dictation(reference_text: str, given_text: str) -> dict[str, Any]:
    """Word-by-word verdict on one dictated line, bucketed by *diagnosis*.

    Returns the aligned diff the report renders, per-bucket counts, and the two numbers that
    are the whole point of the exercise:

    ``heard`` / ``total``
        Reference words the learner recovered, **counting misspellings as heard**, because
        they were. This is the listening score.
    ``exact``
        The same count with misspellings excluded. This is the exam score.

    The gap between the two is the learner's form problem stated in one number, and DESIGN
    §1.6 is emphatic that it must never be folded into "wrong": a candidate losing marks to
    orthography who is told to practise listening will practise the wrong thing for months.
    """
    reference = dictation_tokens(reference_text)
    given = dictation_tokens(given_text)
    ops = align_tokens(reference, given)

    # A deletion run of three or more is overload, not three separate vocabulary gaps, so
    # the runs are found before anything is classified.
    dropout: set[int] = set()
    run: list[int] = []
    for op, ref_index, _ in ops:
        if op == "del" and ref_index is not None:
            run.append(ref_index)
            continue
        if len(run) >= 3:
            dropout.update(run)
        run = []
    if len(run) >= 3:
        dropout.update(run)

    diff: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for op, ref_index, given_index in ops:
        ref_word = reference[ref_index] if ref_index is not None else None
        given_word = given[given_index] if given_index is not None else None
        bucket: str | None = None
        if op == "sub":
            if _is_spelling_slip(ref_word or "", given_word or ""):
                bucket = "spelling"
            elif ref_word in FUNCTION_WORDS:
                bucket = "function_word"
            elif _sounds_like(ref_word or "", given_word or ""):
                bucket = "segmentation"
            else:
                bucket = "substitution"
        elif op == "del":
            # Run membership wins over word class on purpose. Five words in a row is one
            # event — attention dropped — and reporting three of them as "weak forms" would
            # send the learner to a decoding drill for something that was overload.
            if ref_index in dropout:
                bucket = "dropout"
            elif ref_word in FUNCTION_WORDS:
                bucket = "function_word"
            else:
                bucket = "content_word"
        elif op == "ins":
            bucket = "inserted"
        if bucket:
            counts[bucket] = counts.get(bucket, 0) + 1
        diff.append(
            {
                "op": op,
                "reference": ref_word,
                "given": given_word,
                "bucket": bucket,
                "index": ref_index if ref_index is not None else given_index,
            }
        )

    total = len(reference)
    exact = sum(1 for entry in diff if entry["op"] == "equal")
    heard = exact + counts.get("spelling", 0)
    missed = total - heard
    function_missed = counts.get("function_word", 0)
    return {
        "total": total,
        "exact": exact,
        "heard": heard,
        "missed": missed,
        "accuracy": round(heard / total, 3) if total else 0.0,
        "exact_accuracy": round(exact / total, 3) if total else 0.0,
        "counts": counts,
        "diff": diff,
        "headline": dictation_headline(total, heard, missed, function_missed),
        "diagnoses": [
            {"bucket": bucket, "count": counts[bucket], **DICTATION_BUCKETS[bucket]}
            for bucket in DICTATION_BUCKETS
            if counts.get(bucket)
        ],
    }


def dictation_headline(total: int, heard: int, missed: int, function_missed: int) -> str:
    """The one sentence most learners have never had said to them.

    L-R4 §2.1: the feedback *is* the active ingredient, and the specific fact that most of
    what a learner drops is grammar words is invisible from a percentage.
    """
    if total == 0:
        return "There was nothing to transcribe here."
    if missed <= 0:
        return f"You heard all {total} words."
    body = f"You heard {heard} of {total} words."
    if function_missed and function_missed >= max(1, missed // 2):
        return (
            f"{body} {function_missed} of the {missed} you missed were small grammar "
            "words — that is weak forms, not vocabulary."
        )
    if function_missed:
        return f"{body} {function_missed} of the {missed} you missed were grammar words."
    return f"{body} None of the misses were grammar words, so this is vocabulary, not decoding."


# ======================================================================================
# Selection — what this pack can honestly drill
# ======================================================================================

def exam_script_ids(session: Session) -> set[str]:
    """Every script a listening test carries, and therefore every script a drill must not use."""
    ids: set[str] = set()
    for row in session.execute(
        select(
            m.ListeningTest.p1_id, m.ListeningTest.p2_id, m.ListeningTest.p3_id, m.ListeningTest.p4_id
        )
    ):
        ids.update(value for value in row if value)
    return ids


def live_scripts(
    session: Session,
    *,
    part: int | None = None,
    accent_set: str | None = None,
    include_exam: bool = False,
) -> list[m.ListeningScript]:
    """Scripts a drill may be built from.

    **Exam scripts are excluded by default**, and that is the whole point of this function.
    A learner put it plainly: seeing a drill item again inside a test "gives the feel like
    leaked questions". The module docstring above says drills are "built from the pack's own
    keyed answers so the practice is the test", which is good for fidelity and bad for anybody
    who then meets the same item on exam day.

    The pack already ships the material for both: 43 scripts, of which the seven tests carry 28,
    leaving 15 that belong to nobody. This query used to take all 43.

    An empty result is an honest empty state, not a reason to fall back to the exam pool. Falling
    back would re-open the leak exactly when the practice pool is thinnest, which is now.
    """
    query = select(m.ListeningScript).where(m.ListeningScript.retired == 0)
    if part:
        query = query.where(m.ListeningScript.part == int(part))
    if accent_set:
        query = query.where(m.ListeningScript.accent_set == accent_set)
    rows = list(session.scalars(query.order_by(m.ListeningScript.id)).all())
    if include_exam:
        return rows
    reserved = exam_script_ids(session)
    return [row for row in rows if row.id not in reserved]


def rng_for(seed: str, salt: str = "") -> random.Random:
    return random.Random(hashlib.sha256(f"{seed}\x00{salt}".encode()).hexdigest())


#: A dictated line has to be long enough to be a sentence and short enough to hold in
#: working memory. Below six words there is nothing to segment; above thirty the exercise
#: measures typing stamina.
DICTATION_MIN_WORDS, DICTATION_MAX_WORDS = 6, 30


def dictation_sources(doc: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Lines worth dictating from one script, best first.

    "Best" is *contextual*: an answer line first, because dictating the exact seconds where
    a mark was won or lost is the version of this exercise that transfers. Signpost-map
    lines come next — the markers are the handholds we claim are learnable, so hearing them
    slowly is directly useful. Anything else is filler and is only used to fill a set.

    Degrades to any speech line on a pack with no teaching payload, which is why dictation
    works on a bare install and the signpost drill does not.
    """
    lines = lines_of(doc)
    if not lines:
        return []
    ranked: dict[int, dict[str, Any]] = {}

    def offer(index: Any, why: str, rank: int, number: int | None = None) -> None:
        line = line_at(doc, index)
        if line is None or is_narrator(doc, index):
            return
        position = int(index)
        words = count_words(str(line.get("text") or ""))
        if not DICTATION_MIN_WORDS <= words <= DICTATION_MAX_WORDS:
            return
        current = ranked.get(position)
        if current is not None and current["rank"] <= rank:
            return
        ranked[position] = {
            "line_index": position,
            "text": str(line.get("text") or ""),
            "words": words,
            "why": why,
            "rank": rank,
            "number": number,
        }

    for question in iter_questions(doc):
        offer(
            question.get("cue_line_index"),
            "This is where the answer was spoken.",
            0,
            question_number(question),
        )
    for entry in teaching_of(doc).get("signpost_map") or []:
        if isinstance(entry, Mapping):
            offer(entry.get("line_index"), "A structural marker — one of your handholds.", 1)
    for index in range(len(lines)):
        offer(index, "Ordinary connected speech from this recording.", 2)

    return sorted(ranked.values(), key=lambda entry: (entry["rank"], entry["line_index"]))


def numbers_sources(doc: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Questions whose answer is a figure, a code, a date or a spelled name.

    Reads ``teaching.prediction.slot`` where the payload exists. Where it does not, it falls
    back to the *evidence*: an answer containing a digit, or an answer whose letters are
    spelled out in the cue line. That fallback is what lets the drill run against the four
    scripts that shipped before the payload existed, and it does not guess — a keyed answer
    with a digit in it really is a number item.
    """
    found: list[dict[str, Any]] = []
    for question in iter_questions(doc):
        number = question_number(question)
        qtype = str(question.get("type") or question.get("qtype") or "")
        if qtype in LETTER_TYPES:
            continue  # the answer is a letter; there is nothing to spell
        keys = key_values(question)
        if not keys:
            continue
        prediction = sub_teaching(question, "prediction")
        slot = str(prediction.get("slot") or "")
        form = sub_teaching(question, "form")
        cue = line_text(doc, question.get("cue_line_index"))
        if slot in NUMBER_SLOTS:
            why = slot
        elif any(char.isdigit() for char in " ".join(keys)):
            why = "quantity"
        elif _spelled_in(cue, keys):
            why = "proper_name"
        else:
            continue
        found.append(
            {
                "number": number,
                "question": question,
                "slot": slot or why,
                "detected": slot not in NUMBER_SLOTS,
                "form": form,
                "cue_line_index": question.get("cue_line_index"),
                "spelled": _spelled_in(cue, keys),
            }
        )
    return found


_SPELLED_RUN = re.compile(r"(?:\b[A-Za-z][.\-]\s*){3,}")


def _spelled_in(cue: str, keys: Sequence[str]) -> bool:
    """Does the cue line spell one of the keyed answers out letter by letter?

    Matches both notations because both occur in the bank: the dotted form the renderer
    needs (``O. K. A. F. O. R.``) and the hyphenated form a human writes.
    """
    match = _SPELLED_RUN.search(cue or "")
    if not match:
        return False
    letters = "".join(char for char in match.group(0) if char.isalpha()).lower()
    return any(letters.startswith(str(key).replace(" ", "").lower()[:4]) for key in keys if key)


def signpost_sources(doc: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Every authored signpost in a script, deduped on ``(line_index, phrase)``.

    Both the per-question ``teaching.signpost`` and the script-level ``signpost_map`` feed
    this, and DESIGN §3.4 requires the second to contain the first — so the dedupe is not
    defensive tidying, it is the contract. An entry whose ``phrase`` is not verbatim in its
    line is dropped: the drill highlights the phrase inside the clip, and a phrase that is
    not there breaks that silently.
    """
    seen: set[tuple[int, str]] = set()
    found: list[dict[str, Any]] = []

    def offer(index: Any, phrase: str, kind: str, number: int | None) -> None:
        line = line_at(doc, index)
        if line is None or kind not in SIGNPOST_KINDS:
            return
        phrase = str(phrase or "").strip()
        if not phrase or phrase.lower() not in str(line.get("text") or "").lower():
            return
        token = (int(index), phrase.lower())
        if token in seen:
            return
        seen.add(token)
        found.append(
            {
                "line_index": int(index),
                "phrase": phrase,
                "kind": kind,
                "number": number,
                "text": str(line.get("text") or ""),
            }
        )

    for question in iter_questions(doc):
        signpost = sub_teaching(question, "signpost")
        offer(
            signpost.get("line_index"),
            signpost.get("phrase", ""),
            str(signpost.get("kind") or ""),
            question_number(question),
        )
    for entry in teaching_of(doc).get("signpost_map") or []:
        if isinstance(entry, Mapping):
            offer(entry.get("line_index"), entry.get("phrase", ""),
                  str(entry.get("kind") or ""), None)

    found.sort(key=lambda entry: entry["line_index"])
    return found


def prediction_sources(doc: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Questions carrying an authored ``prediction.slot``.

    No fallback, deliberately. The slot is a judgement about what the printed frame
    constrains, and a renderer that inferred it from the answer would be showing the learner
    a prediction derived from the thing they are supposed to be predicting.
    """
    found: list[dict[str, Any]] = []
    for question in iter_questions(doc):
        prediction = sub_teaching(question, "prediction")
        slot = str(prediction.get("slot") or "")
        if slot not in PREDICTION_SLOTS:
            continue
        found.append(
            {
                "number": question_number(question),
                "question": question,
                "prediction": prediction,
                "slot": slot,
            }
        )
    return found


SOURCES: dict[str, Any] = {
    "dictation": dictation_sources,
    "numbers": numbers_sources,
    "signpost": signpost_sources,
    "prediction": prediction_sources,
}


def census(
    session: Session, *, part: int | None = None, accent_set: str | None = None
) -> dict[str, Any]:
    """What this pack can actually drill, counted rather than assumed.

    The launcher offers a kind only when this says it exists, because an empty drill that
    404s after the learner has chosen it is worse than one that was never offered.
    """
    rows = live_scripts(session, part=part, accent_set=accent_set)
    per_kind: dict[str, int] = dict.fromkeys(DRILL_KINDS, 0)
    scripts: list[dict[str, Any]] = []
    rendered = 0
    for row in rows:
        doc = script_doc(row)
        counts = {kind: len(SOURCES[kind](doc)) for kind in DRILL_KINDS}
        for kind, value in counts.items():
            per_kind[kind] += value
        audio = audio_ref(doc)
        rendered += int(audio["ready"])
        scripts.append(
            {
                "script_id": row.id,
                "title": row.title,
                "part": row.part,
                "accent_set": row.accent_set,
                "audio_ready": audio["ready"],
                "counts": counts,
            }
        )
    return {
        "n_scripts": len(rows),
        "n_rendered": rendered,
        "kinds": [
            {
                "kind": kind,
                "items": per_kind[kind],
                "drillable": per_kind[kind] >= MIN_SIZE,
                "needs_audio": kind in AUDIO_KINDS,
                "audio": AUDIO_NEED[kind],
            }
            for kind in DRILL_KINDS
        ],
        "scripts": scripts,
    }


#: Kinds whose items cannot be served at all before the script has been rendered.
AUDIO_KINDS: frozenset[str] = frozenset({"dictation", "signpost"})

#: …and the honest three-way version, because ``numbers`` is the one that depends on the
#: mode: ``transcribe`` plays the answer line, ``form`` shows the speaker's wording and needs
#: no recording. ``prediction`` never needs one, which is the whole reason it exists.
AUDIO_NEED: dict[str, str] = {
    "dictation": "required",
    "numbers": "optional",
    "signpost": "required",
    "prediction": "never",
}


# ======================================================================================
# Item construction
# ======================================================================================

def item_id(kind: str, script_id: str, anchor: int, seed: str = "") -> str:
    digest = hashlib.sha1(f"{kind}|{script_id}|{anchor}|{seed}".encode()).hexdigest()[:8]
    return f"ldr_{kind}_{anchor}_{digest}"


def _script_header(doc: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "script_id": doc.get("script_id"),
        "script_title": doc.get("title"),
        "part": doc.get("part"),
        "accent_set": doc.get("accent_set"),
    }


def dictation_item(
    doc: Mapping[str, Any],
    source: Mapping[str, Any],
    timing: Mapping[str, Any] | None,
    *,
    index: int,
    seed: str,
) -> dict[str, Any] | None:
    """One line to transcribe. Carries the key — :func:`strip_key` removes it before serving."""
    clip = clip_for(timing, source["line_index"], lead_ms=600, tail_ms=900)
    if clip is None:
        return None
    speaker = speaker_of(doc, source["line_index"])
    return {
        "item_id": item_id("dictation", str(doc.get("script_id")), source["line_index"], seed),
        "kind": "dictation",
        "index": index,
        **_script_header(doc),
        "line_index": source["line_index"],
        "speaker": {"id": speaker.get("id"), "name": speaker.get("name")},
        "clip": clip,
        "audio": audio_ref(doc),
        "words": source["words"],
        "why": source["why"],
        "question_number": source.get("number"),
        "seconds": DRILL_SECONDS["dictation"],
        # The key. Never serialised to a client before the answer is in.
        "reference": source["text"],
    }


def numbers_item(
    doc: Mapping[str, Any],
    source: Mapping[str, Any],
    timing: Mapping[str, Any] | None,
    *,
    index: int,
    seed: str,
    mode: str,
) -> dict[str, Any] | None:
    """One answer to write down — either from the audio, or from what the speaker said.

    ``mode="transcribe"`` needs a rendered clip. ``mode="form"`` needs the authored
    ``answer_quote`` instead, and needs it to *differ* from the key: quoting "twenty-four
    pounds fifty" against a key of ``24.50`` is a real exercise, quoting "Tuesday" against a
    key of ``Tuesday`` is a copying test. Items that would be copying tests are dropped.
    """
    question = source["question"]
    number = source["number"]
    teaching = teaching_of(question)
    quote = str(teaching.get("answer_quote") or "").strip()
    limit = word_limit_of(question.get("word_limit"))

    clip = clip_for(timing, source["cue_line_index"]) if timing else None
    if mode == "transcribe" and clip is None:
        return None
    if mode == "form":
        if not quote:
            return None
        keys = key_values(question)
        if any(normalize_answer(key) == normalize_answer(quote) for key in keys):
            return None

    return {
        "item_id": item_id("numbers", str(doc.get("script_id")), number, seed),
        "kind": "numbers",
        "mode": mode,
        "index": index,
        **_script_header(doc),
        "number": number,
        "qtype": str(question.get("type") or question.get("qtype") or ""),
        "slot": source["slot"],
        "slot_info": PREDICTION_SLOTS.get(source["slot"]),
        "detected": bool(source.get("detected")),
        "spelled": bool(source.get("spelled")),
        "prompt": str(question.get("prompt") or ""),
        "instruction": str(question.get("instruction") or "") or instruction_for(limit),
        "word_limit": limit,
        "quote": quote if mode == "form" else None,
        "clip": clip if mode == "transcribe" else None,
        "audio": audio_ref(doc) if mode == "transcribe" else None,
        "seconds": DRILL_SECONDS["numbers"],
        "answers": question.get("answers") or [],
        "reference": quote,
    }


def signpost_item(
    doc: Mapping[str, Any],
    source: Mapping[str, Any],
    timing: Mapping[str, Any] | None,
    pool: Sequence[Mapping[str, Any]],
    *,
    index: int,
    seed: str,
    mode: str,
) -> dict[str, Any] | None:
    """One marker: what is it announcing (``recognise``), or when does it land (``cue``)."""
    lead, tail = (
        (CUE_LEAD_MS, CUE_TAIL_MS) if mode == "cue" else (CLIP_LEAD_MS, CLIP_TAIL_MS)
    )
    clip = clip_for(timing, source["line_index"], lead_ms=lead, tail_ms=tail)
    if clip is None:
        return None

    options: list[dict[str, str]] = []
    if mode == "recognise":
        rng = rng_for(seed, f"signpost:{source['line_index']}")
        # Lures come from kinds this same script really uses, so the choice is between
        # things that plausibly happen here rather than between the enum and three absurdities.
        local = [str(entry["kind"]) for entry in pool if entry["kind"] != source["kind"]]
        lures = list(dict.fromkeys(local))
        rng.shuffle(lures)
        for slug in list(SIGNPOST_KINDS):
            if len(lures) >= 3:
                break
            if slug != source["kind"] and slug not in lures:
                lures.append(slug)
        chosen = [source["kind"], *lures[:3]]
        rng.shuffle(chosen)
        options = [{"slug": slug, "label": SIGNPOST_KINDS[slug]["name"]} for slug in chosen]

    return {
        "item_id": item_id("signpost", str(doc.get("script_id")), source["line_index"], seed),
        "kind": "signpost",
        "mode": mode,
        "index": index,
        **_script_header(doc),
        "line_index": source["line_index"],
        "question_number": source.get("number"),
        "clip": clip,
        "audio": audio_ref(doc),
        "options": options,
        "seconds": DRILL_SECONDS["signpost"],
        "tolerance": (
            {"early_ms": CUE_EARLY_MS, "late_ms": CUE_LATE_MS} if mode == "cue" else None
        ),
        "answer_key": source["kind"],
        "phrase": source["phrase"],
        "line_text": source["text"],
    }


def prediction_item(
    doc: Mapping[str, Any],
    source: Mapping[str, Any],
    *,
    index: int,
    seed: str,
) -> dict[str, Any]:
    """One printed gap, five slot chips, no audio.

    The lures are drawn from the key's own family first — plural against singular against
    uncountable — because that is the discrimination the exam actually punishes. A set whose
    wrong options are ``a time`` and ``a letter`` against a key of ``a plural noun`` is
    answerable without reading the frame at all.
    """
    question = source["question"]
    number = source["number"]
    slot = source["slot"]
    prediction = source["prediction"]
    limit = word_limit_of(question.get("word_limit"))

    rng = rng_for(seed, f"prediction:{number}")
    family = PREDICTION_SLOTS[slot]["family"]
    siblings = [s for s, info in PREDICTION_SLOTS.items() if info["family"] == family and s != slot]
    others = [s for s in PREDICTION_SLOTS if s != slot and s not in siblings]
    rng.shuffle(siblings)
    rng.shuffle(others)
    chosen = [slot, *(siblings + others)[:4]]
    rng.shuffle(chosen)

    return {
        "item_id": item_id("prediction", str(doc.get("script_id")), number, seed),
        "kind": "prediction",
        "index": index,
        **_script_header(doc),
        "number": number,
        "qtype": str(question.get("type") or question.get("qtype") or ""),
        "prompt": str(question.get("prompt") or ""),
        "instruction": str(question.get("instruction") or "") or instruction_for(limit),
        "word_limit": limit,
        "options": [
            {"slug": s, "label": PREDICTION_SLOTS[s]["name"], "what": PREDICTION_SLOTS[s]["what"]}
            for s in chosen
        ],
        "group_strategy": _group_strategy(doc, number),
        "seconds": DRILL_SECONDS["prediction"],
        "answer_key": slot,
        "cue": str(prediction.get("cue") or "") or None,
        "range": prediction.get("range"),
        "note": str(prediction.get("note") or "") or None,
    }


def _group_strategy(doc: Mapping[str, Any], number: int) -> dict[str, Any] | None:
    """The group's own preview instruction, when the pack carries one.

    Prediction is a *preview* skill, and the preview is a group-level activity — you
    slot-type six gaps at once, not one. Showing the authored ``preview_focus`` next to the
    item is what stops the drill teaching it as a per-question trick.
    """
    teaching = teaching_of(group_of(doc, number))
    focus = str(teaching.get("preview_focus") or "").strip()
    order = str(teaching.get("order_note") or "").strip()
    if not focus and not order:
        return None
    return {"preview_focus": focus or None, "order_note": order or None}


# ======================================================================================
# Grading
# ======================================================================================

def grade_numbers(item: Mapping[str, Any], given: str) -> dict[str, Any]:
    """Exact match against the key, with the spelling leak tagged separately.

    Listening spelling is strict and this drill exists precisely to make that concrete, so
    ``correct`` is the exam verdict and nothing softens it. ``near_miss_spelling`` is the
    coaching layer on top: you heard it, and it still scored zero.
    """
    answers = item.get("answers") or []
    qtype = str(item.get("qtype") or "")
    limit = item.get("word_limit")
    raw = (given or "").strip()
    correct = bool(raw) and answers_match(raw, answers, qtype, limit)
    keys = [expand_variants(slot) for slot in answers]
    flat = [value for slot in keys for value in slot]
    over_limit = bool(raw) and limit is not None and not within_word_limit(raw, limit)
    return {
        "given": raw,
        "correct": correct,
        "key": flat[0] if flat else None,
        "accepted": flat,
        "near_miss_spelling": (not correct) and bool(raw) and near_miss(raw, flat),
        "over_limit": over_limit,
        "blank": not raw,
    }


def grade_prediction(item: Mapping[str, Any], picked: str | None) -> dict[str, Any]:
    """Slot verdict, plus the one distinction worth making about a wrong slot.

    Picking ``noun_singular`` where the key is ``noun_plural`` is not the same failure as
    picking ``time``: the first heard the frame and lost the number, the second did not read
    the frame at all. The report says which, because the fixes are different — one is a
    grammar habit, the other is the preview protocol.
    """
    key = str(item.get("answer_key") or "")
    chosen = str(picked or "").strip()
    correct = chosen == key
    key_family = PREDICTION_SLOTS.get(key, {}).get("family")
    chosen_family = PREDICTION_SLOTS.get(chosen, {}).get("family")
    return {
        "given": chosen or None,
        "correct": correct,
        "key": key,
        "key_info": PREDICTION_SLOTS.get(key),
        "chosen_info": PREDICTION_SLOTS.get(chosen),
        "same_family": bool(chosen) and not correct and chosen_family == key_family,
        "note": (
            None
            if correct
            else (
                "Right family, wrong shape — you read the frame and then ignored what it "
                "said about number or form. That is a one-letter loss on the answer sheet."
                if chosen_family == key_family and chosen
                else "You did not use the printed frame. The word before the gap decides "
                     "this, every time."
            )
        ),
    }


def grade_signpost(item: Mapping[str, Any], response: Mapping[str, Any]) -> dict[str, Any]:
    """``recognise`` is an exact pick; ``cue`` is a press inside a tolerance window.

    The window is asymmetric on purpose (:data:`CUE_EARLY_MS`, :data:`CUE_LATE_MS`).
    Pressing four seconds early is the skill working — you heard the marker and got ready.
    Pressing a second and a half late means you reacted to the answer instead of to its
    announcement, which is exactly the behaviour that loses the next question too.
    """
    if str(item.get("mode") or "recognise") == "recognise":
        key = str(item.get("answer_key") or "")
        chosen = str(response.get("given") or "").strip()
        return {
            "given": chosen or None,
            "correct": chosen == key,
            "key": key,
            "key_info": SIGNPOST_KINDS.get(key),
            "chosen_info": SIGNPOST_KINDS.get(chosen),
        }

    clip = item.get("clip") or {}
    target = int(clip.get("line_start_ms") or clip.get("start_ms") or 0)
    raw = response.get("given")
    try:
        pressed = int(raw)
    except (TypeError, ValueError):
        pressed = None
    if pressed is None:
        return {
            "given": None, "correct": False, "key": target, "offset_ms": None,
            "verdict": "no_press",
            "note": "No press. On the sheet a blank and a wrong guess are worth the same, "
                    "so press whenever you think it is coming.",
        }
    offset = pressed - target
    correct = -CUE_EARLY_MS <= offset <= CUE_LATE_MS
    if correct:
        verdict = "on_time"
        note = None
    elif offset < -CUE_EARLY_MS:
        verdict = "early"
        note = ("Too early — you pressed before the marker. Wait for the words, not for the "
                "feeling that something is due.")
    else:
        verdict = "late"
        note = ("Too late — you pressed once you heard the answer. By then your pen should "
                "already have been down.")
    return {
        "given": pressed,
        "correct": correct,
        "key": target,
        "offset_ms": offset,
        "verdict": verdict,
        "note": note,
    }


def dictation_result(item: Mapping[str, Any], given: str) -> dict[str, Any]:
    """Grade one dictation item and decide whether it counts as *correct*.

    A dictated line is not pass/fail in any exam sense, so "correct" here is a threshold on
    the listening score (:data:`DICTATION_PASS`) rather than a mark. It exists only so the
    set has an ``n_correct`` to store next to every other drill in the same table; the number
    the learner is shown is the word count and the buckets.
    """
    marking = grade_dictation(str(item.get("reference") or ""), given or "")
    marking["correct"] = marking["accuracy"] >= DICTATION_PASS
    return marking


#: Fraction of a line's words a learner has to recover before the item is banked as
#: "correct". Not a standard — a threshold, and a deliberately forgiving one, because
#: dictation punished at 100% stops being attempted.
DICTATION_PASS = 0.9


# ======================================================================================
# Reveals — what opens once the answer is in, and not before
# ======================================================================================

def reveal_for(
    doc: Mapping[str, Any],
    item: Mapping[str, Any],
    timing: Mapping[str, Any] | None,
    question: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """The teaching payload for one item, assembled at grading time.

    Nothing in this module puts a reveal on an item at build time, so there is no flag a
    client could flip to open it early: the fields simply are not in the response body until
    the answer has been submitted. That is the standard the mock is held to, applied to the
    drills as well.
    """
    kind = str(item.get("kind") or "")
    teaching = teaching_of(question) if question else {}

    reveal: dict[str, Any] = {"kind": kind}

    if kind == "dictation":
        index = item.get("line_index")
        reveal.update(
            {
                "reference": str(item.get("reference") or ""),
                "line_index": index,
                "speaker": item.get("speaker"),
                "before": line_text(doc, int(index) - 1) if index else None,
                "after": line_text(doc, int(index) + 1) if index is not None else None,
                "replay": clip_for(timing, index, lead_ms=0, tail_ms=400),
            }
        )
    elif kind == "numbers":
        reveal.update(
            {
                "quote": str(teaching.get("answer_quote") or "") or None,
                "cue_line_index": (question or {}).get("cue_line_index"),
                "cue_text": line_text(doc, (question or {}).get("cue_line_index")),
                "prediction": sub_teaching(question or {}, "prediction") or None,
                "form": _form_reveal(sub_teaching(question or {}, "form")),
                "distraction": sub_teaching(question or {}, "distraction") or None,
                "explanation": str((question or {}).get("explanation") or "") or None,
                "replay": clip_for(timing, (question or {}).get("cue_line_index")),
            }
        )
    elif kind == "signpost":
        reveal.update(
            {
                "phrase": item.get("phrase"),
                "line_text": item.get("line_text"),
                "line_index": item.get("line_index"),
                "kind_info": SIGNPOST_KINDS.get(str(item.get("answer_key") or "")),
                "replay": clip_for(timing, item.get("line_index"), lead_ms=1500, tail_ms=800),
            }
        )
    elif kind == "prediction":
        reveal.update(
            {
                "cue": item.get("cue"),
                "range": item.get("range"),
                "note": item.get("note"),
                "slot_info": PREDICTION_SLOTS.get(str(item.get("answer_key") or "")),
                "paraphrase_link": sub_teaching(question or {}, "paraphrase_link") or None,
                "form": _form_reveal(sub_teaching(question or {}, "form")),
                # No audio, no transcript, no key. A prediction drill that ended by playing
                # the answer would have taught the learner to wait for it.
            }
        )
    return reveal


def _form_reveal(form: Mapping[str, Any]) -> dict[str, Any] | None:
    risk = str(form.get("risk") or "")
    if not risk:
        return None
    return {
        "risk": risk,
        "what": FORM_RISKS.get(risk),
        "note": str(form.get("note") or "") or None,
    }


def find_question(doc: Mapping[str, Any], number: Any) -> dict[str, Any] | None:
    try:
        wanted = int(number)
    except (TypeError, ValueError):
        return None
    for question in iter_questions(doc):
        if question_number(question) == wanted:
            return question
    return None


# ======================================================================================
# Serving — the key never leaves the server before the answer arrives
# ======================================================================================

#: Fields that are the answer, or hand it to a client that reads the response body.
#:
#: ``reference``  the dictated line, verbatim
#: ``answers``    the keyed answer of a numbers item
#: ``answer_key`` the slot, or the signpost kind
#: ``phrase`` / ``line_text``  the marker in writing — a signpost item the learner can
#:              *read* is a reading exercise, and the whole drill is that they hear it
#: ``cue`` / ``range`` / ``note``  the prediction reveal. ``cue`` is the printed word that
#:              fixes the slot, so showing it up front answers the question; ``range``
#:              ("6–40") announces that the slot is a quantity; ``note`` is the margin note
#:              the learner is supposed to be able to write for themselves.
_ITEM_SECRETS = (
    "reference", "answers", "answer_key", "phrase", "line_text", "cue", "range", "note",
)


def strip_key(item: Mapping[str, Any]) -> dict[str, Any]:
    """The item as the learner sees it — no key, in the body, not behind a flag."""
    out = json.loads(json.dumps(dict(item), ensure_ascii=False))
    for field in _ITEM_SECRETS:
        out.pop(field, None)
    return out


# ======================================================================================
# Recording — one practice_sessions envelope, one drill_results row, no new table
# ======================================================================================

def record_set(
    session: Session,
    *,
    profile_id: str,
    kind: str,
    script_id: str | None,
    results: Sequence[Mapping[str, Any]],
    params: Mapping[str, Any],
    duration_s: int | None = None,
    now: str,
) -> str:
    """Persist a finished set through the existing drill plumbing.

    ``details_json`` carries more than the verdicts because the aggregate a listening
    learner needs is not "how many did you get right" — it is **which bucket keeps costing
    you marks**. Dictation stores its per-bucket counts, so a progress screen can eventually
    say "weak forms have cost you 31 words across 5 sessions", which is a sentence that
    changes behaviour in a way a percentage never does.
    """
    from ulid import ULID

    drill_id = f"dr_{ULID()}"
    n_items = len(results)
    n_correct = sum(1 for r in results if r.get("correct"))

    buckets: dict[str, int] = {}
    words_total = words_heard = 0
    for result in results:
        marking = result.get("marking") or {}
        for bucket, count in (marking.get("counts") or {}).items():
            buckets[bucket] = buckets.get(bucket, 0) + int(count)
        words_total += int(marking.get("total") or 0)
        words_heard += int(marking.get("heard") or 0)

    summary = {
        "kind": kind,
        "script_id": script_id,
        "n_items": n_items,
        "n_correct": n_correct,
        "buckets": buckets,
        **({"words_total": words_total, "words_heard": words_heard} if words_total else {}),
    }

    session.add(
        m.PracticeSession(
            id=drill_id,
            profile_id=profile_id,
            module="listening",
            activity=f"drill:{RESULT_KINDS.get(kind, kind)}",
            ended_at=now,
            duration_s=duration_s,
            summary_json=json.dumps(summary, ensure_ascii=False),
        )
    )
    session.flush()
    session.add(
        m.DrillResult(
            id=drill_id,
            module="listening",
            drill_kind=RESULT_KINDS.get(kind, kind),
            qtype=None,
            n_items=n_items,
            n_correct=n_correct,
            params_json=json.dumps({**dict(params), "kind": kind}, ensure_ascii=False),
            details_json=json.dumps(
                {
                    "buckets": buckets,
                    "items": [
                        {
                            "item_id": r.get("item_id"),
                            "script_id": r.get("script_id"),
                            "number": r.get("number"),
                            "line_index": r.get("line_index"),
                            "correct": bool(r.get("correct")),
                            "given": (r.get("marking") or {}).get("given"),
                            "key": (r.get("marking") or {}).get("key"),
                            "counts": (r.get("marking") or {}).get("counts"),
                            "near_miss_spelling": (r.get("marking") or {}).get(
                                "near_miss_spelling"
                            ),
                        }
                        for r in results
                    ],
                },
                ensure_ascii=False,
            ),
        )
    )
    return drill_id


def bucket_profile(
    session: Session, profile_id: str, *, limit: int = 20
) -> list[dict[str, Any]]:
    """The learner's own dictation buckets, aggregated across recent sessions.

    This is the number that makes the drill worth repeating: a single session's "four
    function words" is noise, and "weak forms are 60% of everything you drop" is a diagnosis.
    """
    rows = session.scalars(
        select(m.PracticeSession)
        .where(
            m.PracticeSession.profile_id == profile_id,
            m.PracticeSession.module == "listening",
            m.PracticeSession.activity.like("drill:%"),
        )
        .order_by(m.PracticeSession.ended_at.desc())
        .limit(limit)
    ).all()
    totals: dict[str, int] = {}
    for row in rows:
        summary = loads(row.summary_json, {})
        if not isinstance(summary, dict):
            continue
        for bucket, count in (summary.get("buckets") or {}).items():
            if bucket in DICTATION_BUCKETS:
                totals[bucket] = totals.get(bucket, 0) + int(count)
    grand = sum(totals.values())
    return [
        {
            "bucket": bucket,
            "count": count,
            "share": round(count / grand, 3) if grand else 0.0,
            **DICTATION_BUCKETS[bucket],
        }
        for bucket, count in sorted(totals.items(), key=lambda kv: -kv[1])
    ]
