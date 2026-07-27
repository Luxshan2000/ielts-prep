"""Two-minute speaking drills, built from one card's own teaching payload.

Every authored topic set already declares a ``pronunciation_focus``, an
``error_watchlist``, a ``language_bank`` and three model answers. Until now none of that
turned into *practice*: the learner could read it, and reading is not what moves a band.
This module turns each of those fields into a short repeatable exercise that is tied to
the card it came from — never a generic bank — and grades the attempt.

Four kinds, in the order a two-minute set runs them (:data:`DRILL_KINDS`):

``shadowing``
    One sentence from the band-7 model, spoken by Kokoro, repeated by the learner,
    re-transcribed by faster-whisper. Reports word-level agreement, which
    ``pronunciation_focus.target_words`` survived, and whether the pauses fell at the
    authored thought-group joins or inside them. The 2025 systematic review of shadowing
    finds consistent gains for **prosody** and calls the segmental evidence
    inconclusive — so this drill scores rhythm and chunking, and leaves phoneme work to
    the minimal pairs (09 §5.1, research/04-pedagogy §5.1).

``minimal_pair``
    Drawn from **this card's** ``pronunciation_focus`` — the authored pairs, plus pack
    pairs whose contrast or headword the card actually names. Production mode: say the
    carrier sentence; the check is that the STT heard the target word and not its
    neighbour (09 §5.3). Pairs that differ only by stress (``PRE-sent`` /
    ``pre-SENT``) cannot be separated by an ASR word hypothesis, so they ship as
    perception items instead of pretending otherwise.

``error_repair``
    ``error_watchlist[i]`` gives the sentence in this topic's own content and the fix.
    The learner says the corrected version; the grader checks the target form appeared
    and the wrong form did not. Explicit corrective feedback is the moderator that
    carries the ASR-training effect (g ≈ 0.69), so the response names the form, not just
    a verdict (research/04-pedagogy §5.3).

``extend``
    The classic under-run: a too-short answer, thirty seconds to keep going. Reports
    words per minute, long pauses, and whether any frame from the set's language bank
    was actually reached for. Part 2 items instantiate the recovery ladder rung by rung
    (research/04-pedagogy §3.3) because "I ran dry at seventy seconds" is the failure
    this drill exists to train out.

**Grading is mechanical wherever the question is mechanical.** "Did the target word
appear", "did the wrong form come back", "how many words in thirty seconds" are string
and arithmetic questions, and a string question answered by an LLM is a string question
answered unreliably. :func:`grade` is pure, synchronous, DB-free and LLM-free. Only when
the mechanical pass is *inconclusive* — the learner repaired the sentence a different
but possibly valid way, or performed the target function in words the frame does not
contain — does :func:`judge` spend one ``chat_json`` call, and its verdict may only
overturn an inconclusive result, never a confident one.

**Gating.** A shadowing sentence is a sentence of the band-7 model, so shadowing obeys
the same gate as ``pronunciation_focus.chunking_drill`` (coach ``GATED_FIELDS``): no
attempt, no sentence. The other three kinds quote nothing gated and are available from
the first visit. During a Full Mock the whole surface is shut, like every other coach
entry point.

**Storage — no new tables.** 11 §7's ``pron_scores`` is source-polymorphic and already
admits ``shadowing``/``minimal_pair``/``read_aloud``, so word-level results land there
and feed the existing worst-words screen. Minimal-pair verdicts additionally land in
``pron_drill_attempts`` so they roll into the per-contrast accuracy chart the pron
module already draws. Every attempt, whatever its kind, leaves one
``practice_sessions`` row (``module='drill'``, ``activity='speaking_drill:<kind>'``)
carrying the full graded result in ``summary_json`` — which is also why drills never
open the coach's model-answer gate: :func:`coach.find_attempts` only counts
``module='speaking'``.
"""

from __future__ import annotations

import asyncio
import difflib
import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text as sql
from sqlalchemy.orm import Session
from ulid import ULID

from bandready.db import models as m
from bandready.pron import analyze as pron
from bandready.server.errors import ApiError
from bandready.speaking import coach

_log = logging.getLogger("bandready.speaking.drills")

# ======================================================================================
# Vocabulary of the module
# ======================================================================================

#: Ordered as a two-minute set runs them: ear, then sound, then form, then flow.
DRILL_KINDS: tuple[str, ...] = ("shadowing", "minimal_pair", "error_repair", "extend")

#: How the response is graded. ``choice`` needs no recording at all.
GRADING_MODES: tuple[str, ...] = (
    "stt_alignment",  # align what was heard against an exact expected sentence
    "stt_contains",   # one required token present, one forbidden token absent
    "stt_repair",     # required forms present, wrong forms absent, LLM only if unclear
    "stt_fluency",    # rate, length and whether target language was reached for
    "choice",         # A/B perception, graded from the learner's pick
)

#: Seconds of speaking each item asks for. The whole point is that a set fits in two
#: minutes: research/04-pedagogy §5.5 puts the useful session at 5–15 minutes and notes
#: that nobody finishes a 45-minute one.
DRILL_SECONDS: dict[str, int] = {
    "shadowing": 15,
    "minimal_pair": 8,
    "error_repair": 12,
    "extend": 30,
}

#: A drill *set* is capped at two minutes of speaking, not counting listening or reading.
SET_BUDGET_S = 120

#: Word-level agreement a shadowed sentence needs to pass. Not 0.9 — 0.9 is right for
#: repeating one corrected clause (04 §549) and punitive across a 15-word sentence where
#: one ASR slip is worth 7 points.
SHADOW_PASS = 0.80

#: A gap at a thought-group join is the *point* of chunking; this is how big it has to be
#: to count as one.
BOUNDARY_MIN_MS = 120

#: A gap this long *inside* a thought group is the error R3 §5.2 names — pausing inside
#: a noun phrase — and it is what the drill is trying to remove.
INSIDE_BREAK_MS = 400

#: Thirty seconds of speech. 45 words is ~90 wpm: slow, but genuinely extended.
EXTEND_MIN_WORDS = 45
EXTEND_TARGET_WORDS = 60

#: Reported, never graded. R1 §297: fluency is continuity and rhythm, not words per
#: minute — so a learner outside this band gets an observation, not a failure.
COMFORTABLE_WPM = (95, 175)

#: How much of the extension has to be new material rather than the stub read back.
EXTEND_NEW_CONTENT = 0.6

#: Below this, the learner did not attempt the sentence at all and the LLM has nothing
#: to adjudicate.
REPAIR_MIN_SIMILARITY = 0.45

LOCKED_MESSAGE = (
    "Shadowing plays a sentence out of the band-7 answer, so it opens when the model "
    "answer does — record an attempt on this card first."
)

EMPTY_MESSAGE = (
    "This card predates the teaching payload, so there is nothing card-specific to "
    "drill. Any set with a pronunciation focus will have all four."
)

PROSODIC_PRIORITIES: tuple[str, ...] = (
    "word_stress",
    "sentence_stress",
    "chunking",
    "intonation",
    "weak_forms",
)


# ======================================================================================
# Text handling
# ======================================================================================

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:'[a-z]+)*")
_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'"})

#: ASR renders these one way and authored prose the other. Folding them stops a
#: shadowing score from measuring the transcriber's spelling preferences.
_FOLD: dict[str, str] = {
    "ok": "okay",
    "alright": "all right",
    "cannot": "can not",
    "gonna": "going to",
    "wanna": "want to",
    "til": "till",
    "'til": "till",
    "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
}


def tokens(value: Any) -> list[str]:
    """Comparable word tokens: lowercase, punctuation-free, apostrophes normalised.

    >>> tokens("By the time I'd left, they’d already gone.")
    ['by', 'the', 'time', "i'd", 'left', "they'd", 'already', 'gone']
    """
    raw = str(value or "").translate(_APOSTROPHES).lower()
    out: list[str] = []
    for token in _TOKEN_RE.findall(raw):
        folded = _FOLD.get(token, token)
        out.extend(folded.split())
    return out


def content_tokens(value: Any) -> list[str]:
    """Tokens that carry evidence — the same filter the coach uses for frame matching."""
    return [t for t in tokens(value) if len(t) >= 3 and t not in coach.STOPWORDS]


def clip(value: Any, limit: int = 400) -> str | None:
    """A whitespace-collapsed, length-capped string, or ``None`` — never ``"None"``."""
    if value is None:
        return None
    out = " ".join(str(value).split())
    return out[:limit] or None


#: Internal alias kept short because this module uses it on nearly every field.
_text = clip


def _iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _item_id(card_id: str, kind: str, index: int) -> str:
    """Deterministic and rebuildable: the server keeps no drill state between requests."""
    digest = hashlib.sha1(f"{card_id}|{kind}|{index}".encode()).hexdigest()[:8]
    return f"dr_{kind}_{index}_{digest}"


# ======================================================================================
# Alignment — the mechanical core every STT-graded drill shares
# ======================================================================================


def align(expected: list[str], heard: list[str]) -> list[dict[str, Any]]:
    """Per-expected-token verdicts, plus the words the learner added.

    ``status`` is one of ``hit`` · ``missed`` · ``substituted`` · ``added``. ``added``
    entries have ``expected: None`` and sit at the position they were inserted, so the
    UI can render one row per token in order.
    """
    ops = difflib.SequenceMatcher(a=expected, b=heard, autojunk=False).get_opcodes()
    out: list[dict[str, Any]] = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            for offset in range(i2 - i1):
                out.append(
                    {
                        "index": i1 + offset,
                        "expected": expected[i1 + offset],
                        "heard": heard[j1 + offset],
                        "status": "hit",
                    }
                )
        elif tag == "replace":
            overlap = min(i2 - i1, j2 - j1)
            for offset in range(overlap):
                out.append(
                    {
                        "index": i1 + offset,
                        "expected": expected[i1 + offset],
                        "heard": heard[j1 + offset],
                        "status": "substituted",
                    }
                )
            for offset in range(overlap, i2 - i1):
                out.append(
                    {
                        "index": i1 + offset,
                        "expected": expected[i1 + offset],
                        "heard": None,
                        "status": "missed",
                    }
                )
            for offset in range(overlap, j2 - j1):
                out.append(
                    {"index": i2, "expected": None, "heard": heard[j1 + offset], "status": "added"}
                )
        elif tag == "delete":
            for offset in range(i2 - i1):
                out.append(
                    {
                        "index": i1 + offset,
                        "expected": expected[i1 + offset],
                        "heard": None,
                        "status": "missed",
                    }
                )
        elif tag == "insert":
            for offset in range(j2 - j1):
                out.append(
                    {"index": i1, "expected": None, "heard": heard[j1 + offset], "status": "added"}
                )
    return out


def agreement(alignment: list[dict[str, Any]]) -> float:
    """Fraction of the expected sentence that came back intact, 0.0–1.0."""
    wanted = [row for row in alignment if row["expected"] is not None]
    if not wanted:
        return 0.0
    hits = sum(1 for row in wanted if row["status"] == "hit")
    return round(hits / len(wanted), 3)


def heard_index_for(alignment: list[dict[str, Any]], expected_index: int) -> int | None:
    """Where in the heard token stream expected token ``expected_index`` landed."""
    position = 0
    for row in alignment:
        if row["heard"] is not None:
            if row["expected"] is not None and row["index"] == expected_index:
                return position
            position += 1
    return None


def nearest_token(target: str, candidates: list[str]) -> str | None:
    """The heard word most likely to *be* the target — what "we heard …" reports."""
    best: tuple[float, str] | None = None
    for candidate in candidates:
        ratio = difflib.SequenceMatcher(a=target, b=candidate).ratio()
        if ratio >= 0.5 and (best is None or ratio > best[0]):
            best = (ratio, candidate)
    return best[1] if best else None


# ======================================================================================
# Item construction — everything comes off the card, nothing is generic
# ======================================================================================


def _focus(teaching: dict[str, Any]) -> dict[str, Any]:
    focus = teaching.get("pronunciation_focus")
    return dict(focus) if isinstance(focus, dict) else {}


def _target_words(focus: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for entry in focus.get("target_words") or []:
        if not isinstance(entry, dict):
            continue
        word = _text(entry.get("word"), 60)
        if not word:
            continue
        out.append(
            {
                "word": word,
                "stress": _text(entry.get("stress"), 60),
                "note": _text(entry.get("note"), 120),
            }
        )
    return out


def _sentences(transcript: str) -> list[str]:
    """Model transcripts are prose; shadowing needs one sentence at a time (§2.2 rule 7)."""
    flat = " ".join(str(transcript or "").split())
    parts = re.split(r"(?<=[.!?])\s+", flat)
    return [p.strip() for p in parts if p.strip()]


def _chunks_for(sentence: str, authored: list[str]) -> list[list[str]]:
    """Authored thought groups, kept only when they really do tile the sentence.

    A chunk list that has drifted from the sentence it annotates would silently score
    the learner's pauses against the wrong joins, so it is dropped rather than trusted.
    """
    groups = [tokens(chunk) for chunk in authored if tokens(chunk)]
    if not groups:
        return []
    flat: list[str] = [t for group in groups for t in group]
    return groups if flat == tokens(sentence) else []


def shadowing_items(card: Any, teaching: dict[str, Any], *, unlocked: bool) -> list[dict[str, Any]]:
    """Sentences to shadow, newest teaching field first.

    The authored ``chunking_drill`` sentence is preferred because it arrives with its
    thought groups already marked; further sentences come from the band-7 model, longest
    first, because a six-word sentence teaches no rhythm.
    """
    focus = _focus(teaching)
    if not unlocked:
        return []

    picks: list[tuple[str, list[str], str]] = []
    drill = focus.get("chunking_drill")
    if isinstance(drill, dict):
        sentence = _text(drill.get("sentence"), 600)
        if sentence:
            authored = [str(c) for c in (drill.get("chunks") or []) if str(c).strip()]
            picks.append((sentence, authored, "chunking_drill"))

    target_words = _target_words(focus)
    wanted = {tokens(w["word"])[0] for w in target_words if tokens(w["word"])}

    model = coach.model_answer_at(card, 7)
    if isinstance(model, dict):
        seen = {tuple(tokens(p[0])) for p in picks}
        candidates = [
            s for s in _sentences(str(model.get("transcript") or ""))
            if 8 <= len(tokens(s)) <= 26
        ]
        # A sentence that carries the card's own target words is worth more than a long
        # one; a six-word sentence teaches no rhythm, so length breaks the tie.
        candidates.sort(key=lambda s: (-len(wanted & set(tokens(s))), -len(tokens(s))))
        for sentence in candidates[:2]:
            if tuple(tokens(sentence)) in seen:
                continue
            picks.append((sentence, [], "model_band_7"))

    priority = _text(focus.get("priority"), 40)
    out: list[dict[str, Any]] = []
    for index, (sentence, authored, source) in enumerate(picks[:3]):
        expected = tokens(sentence)
        chunk_groups = _chunks_for(sentence, authored)
        in_sentence = [
            w for w in target_words
            if tokens(w["word"]) and tokens(w["word"])[0] in expected
        ]
        out.append(
            {
                "item_id": _item_id(card.id, "shadowing", index),
                "kind": "shadowing",
                "seconds": DRILL_SECONDS["shadowing"],
                "title": "Shadow the sentence",
                "instruction": (
                    "Listen once. Then say it back at the same speed, pausing where the "
                    "speaker pauses — copy the rhythm before you copy the sounds."
                ),
                "prompt": {
                    "sentence": sentence,
                    "chunks": [" ".join(g) for g in chunk_groups] or authored,
                    "source": source,
                    "target_words": in_sentence,
                },
                "audio": {"text": sentence, "role": "reference"},
                "expected": {
                    "text": sentence,
                    "tokens": expected,
                    "chunk_groups": chunk_groups,
                    "target_words": [w["word"] for w in in_sentence],
                    "priority": priority,
                },
                "grading": {
                    "mode": "stt_alignment",
                    "engine": "local_stt",
                    "pass_when": (
                        f"at least {int(SHADOW_PASS * 100)}% of the words come back, and no "
                        "target word is dropped"
                    ),
                    "thresholds": {
                        "agreement": SHADOW_PASS,
                        "boundary_min_ms": BOUNDARY_MIN_MS,
                        "inside_break_ms": INSIDE_BREAK_MS,
                    },
                    "reports": ["agreement", "target_words", "chunking", "rate"],
                },
                "why": (
                    "Shadowing moves prosody and fluency; it is not phoneme practice. "
                    "Copy the pauses and the stress, not the accent."
                ),
                "focus": {"priority": priority, "criterion": "PRON"},
            }
        )
    return out


#: Which pack pairs a card's ``pronunciation_focus.priority`` may pull in beyond the ones
#: it authored itself. Prosodic priorities (``word_stress``, ``sentence_stress``,
#: ``chunking``, ``intonation``, ``weak_forms``) are deliberately absent: a segmental
#: minimal pair is the wrong instrument for them, and shadowing is the right one.
PRIORITY_PAIR_HINTS: dict[str, dict[str, tuple[str, ...]]] = {
    "consonant_clusters": {"tags": ("cluster",)},
    "final_consonants": {"tags": ("final",)},
    "l_r": {"contrasts": ("l–r",)},
    "v_w_b": {"contrasts": ("v–w", "v–b")},
    "s_endings": {"contrasts": ("-s/-z cluster", "s–z")},
    "ed_endings": {"contrasts": ("-s/-z cluster",)},
    "vowel_length": {"tags": ("length",)},
    "th": {"contrasts": ("θ–s", "θ–t", "ð–d")},
}

#: Never more than this many pack pairs, so the card's authored ones always come first.
MAX_PACK_PAIRS = 3


def _pair_forms(value: Any) -> tuple[str | None, str | None]:
    """``("PRE-sent (noun)")`` → the display form and the single word an ASR could hear."""
    display = _text(value, 80)
    if not display:
        return None, None
    bare = re.sub(r"\([^)]*\)", " ", display)
    word_tokens = tokens(bare.replace("-", ""))
    return display, word_tokens[0] if len(word_tokens) == 1 else None


def minimal_pair_items(card: Any, teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """Pairs this card's pronunciation focus actually names, then pack pairs it implies.

    A pack pair only qualifies when the card's own focus reaches for it: same contrast
    label, or one of the card's ``target_words`` is a member of the pair. A drill that
    falls back to the generic bank is a drill the learner could have done anywhere, and
    the whole premise here is that practice stays contextual.
    """
    focus = _focus(teaching)
    priority = _text(focus.get("priority"), 40)
    target_words = {tokens(w["word"])[0] for w in _target_words(focus) if tokens(w["word"])}

    picked: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for entry in focus.get("minimal_pairs") or []:
        if not isinstance(entry, dict):
            continue
        a_display, a_word = _pair_forms(entry.get("a"))
        b_display, b_word = _pair_forms(entry.get("b"))
        if not a_display or not b_display:
            continue
        key = (a_display.lower(), b_display.lower())
        if key in seen:
            continue
        seen.add(key)
        picked.append(
            {
                "a": a_display, "b": b_display,
                "a_word": a_word, "b_word": b_word,
                "contrast": _text(entry.get("contrast"), 80) or priority,
                "sentence_a": None, "sentence_b": None,
                "source": "card",
                "pack_id": None,
            }
        )

    try:
        pack_pairs = pron.minimal_pairs()
    except Exception as exc:  # noqa: BLE001 — pack pairs are optional, the card's are not
        _log.debug("pack minimal pairs unavailable: %s", exc)
        pack_pairs = []

    hints = PRIORITY_PAIR_HINTS.get(priority or "", {})
    from_pack = 0
    for pair in pack_pairs:
        if from_pack >= MAX_PACK_PAIRS:
            break
        a_display, a_word = _pair_forms(pair.get("a"))
        b_display, b_word = _pair_forms(pair.get("b"))
        if not a_word or not b_word:
            continue
        contrast = _text(pair.get("contrast"), 80)
        tags = {str(t).lower() for t in (pair.get("tags") or [])}
        named = a_word in target_words or b_word in target_words
        by_contrast = bool(contrast) and contrast in hints.get("contrasts", ())
        by_tag = bool(tags & set(hints.get("tags", ())))
        if not (named or by_contrast or by_tag):
            continue
        key = (a_display.lower(), b_display.lower())
        if key in seen:
            continue
        seen.add(key)
        from_pack += 1
        picked.append(
            {
                "a": a_display, "b": b_display,
                "a_word": a_word, "b_word": b_word,
                "contrast": contrast or priority,
                "sentence_a": _text(pair.get("sentence_a"), 200),
                "sentence_b": _text(pair.get("sentence_b"), 200),
                "source": "pack",
                "pack_id": _text(pair.get("id"), 80),
            }
        )

    out: list[dict[str, Any]] = []
    for index, pair in enumerate(picked[:4]):
        item_id = _item_id(card.id, "minimal_pair", index)
        separable = bool(pair["a_word"]) and bool(pair["b_word"]) and pair["a_word"] != pair["b_word"]
        base = {
            "item_id": item_id,
            "kind": "minimal_pair",
            "seconds": DRILL_SECONDS["minimal_pair"],
            "focus": {"priority": priority, "criterion": "PRON", "contrast": pair["contrast"]},
            "pack_id": pair["pack_id"],
        }
        if separable:
            carrier = pair["sentence_b"] or f"Say the word on the right: {pair['b']}."
            out.append(
                {
                    **base,
                    "title": "Say the harder one",
                    "instruction": (
                        f"Say this so a listener could not mistake it for “{pair['a']}”. "
                        "One word, said clearly, is the whole task."
                    ),
                    "prompt": {
                        "a": pair["a"], "b": pair["b"],
                        "say": pair["b"], "not": pair["a"],
                        "carrier": carrier,
                        "contrast": pair["contrast"],
                    },
                    "audio": {"text": carrier, "role": "reference"},
                    "expected": {
                        "say": pair["b_word"],
                        "avoid": pair["a_word"],
                        "carrier": carrier,
                        "contrast": pair["contrast"],
                    },
                    "grading": {
                        "mode": "stt_contains",
                        "engine": "local_stt",
                        "pass_when": (
                            f"the transcriber writes “{pair['b_word']}” and does not write "
                            f"“{pair['a_word']}”"
                        ),
                        "thresholds": {},
                        "reports": ["heard_as", "contrast_accuracy"],
                    },
                    "why": (
                        "Minimal pairs are the phoneme half of the work: shadowing will not "
                        "fix a substituted sound, and this will."
                    ),
                }
            )
        else:
            out.append(
                {
                    **base,
                    "title": "Which one did you hear?",
                    "instruction": (
                        "These two differ only in where the stress falls, so a transcriber "
                        "cannot tell them apart — your ear has to. Listen, then choose."
                    ),
                    "prompt": {
                        "a": pair["a"], "b": pair["b"],
                        "contrast": pair["contrast"],
                        "options": [pair["a"], pair["b"]],
                    },
                    "audio": {"text": pair["b"], "role": "reference"},
                    "expected": {"answer": "b", "contrast": pair["contrast"]},
                    "grading": {
                        "mode": "choice",
                        "engine": "none",
                        "pass_when": "the learner picks the option that was played",
                        "thresholds": {},
                        "reports": ["contrast_accuracy"],
                    },
                    "why": (
                        "Stress alone can change the word class. Hearing it is the "
                        "precondition for producing it."
                    ),
                }
            )
    return out


def repair_targets(wrong: str, right: str) -> tuple[list[str], list[str]]:
    """``(required, banned)`` — what the fix adds, and what it must stop saying.

    Computed from the authored pair rather than authored separately, so the two can
    never drift apart. Function words are kept here on purpose: half the watchlist
    patterns *are* function words (``for``/``since``, ``to``/``in``).
    """
    left, rightt = tokens(wrong), tokens(right)
    ops = difflib.SequenceMatcher(a=left, b=rightt, autojunk=False).get_opcodes()
    required: list[str] = []
    banned: list[str] = []
    for tag, i1, i2, j1, j2 in ops:
        if tag in ("replace", "insert"):
            for token in rightt[j1:j2]:
                if token not in required:
                    required.append(token)
        if tag in ("replace", "delete"):
            for token in left[i1:i2]:
                if token not in banned:
                    banned.append(token)
    # A token on both sides of the edit is not evidence of anything.
    banned = [t for t in banned if t not in rightt]
    required = [t for t in required if t not in left]
    return required, banned


def distinctive(items: list[str]) -> list[str]:
    """The tokens worth naming to a learner, with a fallback so the list is never empty.

    Some watchlist fixes turn entirely on function words (``for``/``since``,
    ``to``/``in``) and some rewrite a whole clause. Naming ``the, story, was`` as "the
    error" in the second case is noise; naming nothing in the first case is useless. So:
    content words when there are any, everything otherwise.
    """
    content = [t for t in items if t not in coach.STOPWORDS]
    return content or list(items)


def error_repair_items(card: Any, teaching: dict[str, Any]) -> list[dict[str, Any]]:
    """One item per watchlist entry, highest-impact first (DESIGN §3.6 ordering)."""
    entries = coach.common_errors(card, teaching)
    out: list[dict[str, Any]] = []
    for index, entry in enumerate(entries[:3]):
        wrong, right = entry.get("wrong"), entry.get("right")
        if not wrong or not right:
            continue
        required, banned = repair_targets(wrong, right)
        if not required:
            continue
        out.append(
            {
                "item_id": _item_id(card.id, "error_repair", index),
                "kind": "error_repair",
                "seconds": DRILL_SECONDS["error_repair"],
                "title": "Say it correctly",
                "instruction": (
                    "Read the wrong sentence once so you hear it, then say the whole "
                    "sentence correctly out loud. Do not just say the missing word."
                ),
                "prompt": {
                    "wrong": wrong,
                    "pattern": entry.get("pattern"),
                    "why": entry.get("why"),
                    "criterion": entry.get("criterion"),
                    "question": entry.get("question"),
                    "hint": f"The fix turns on: {', '.join(distinctive(required)[:4])}",
                },
                # The corrected sentence is the *answer*: it is not sent with the item,
                # only played back in the grade. ``audio`` therefore points at the wrong
                # sentence, which is what the learner is meant to hear and reject.
                "audio": {"text": wrong, "role": "negative_exemplar"},
                "expected": {
                    "text": right,
                    "required": required,
                    "banned": banned,
                    "pattern": entry.get("pattern"),
                    "why": entry.get("why"),
                },
                "grading": {
                    "mode": "stt_repair",
                    "engine": "local_stt+llm_when_unclear",
                    "pass_when": (
                        "every target form is heard and no part of the error comes back; "
                        "a different but valid repair goes to the model to adjudicate"
                    ),
                    "thresholds": {"min_similarity": REPAIR_MIN_SIMILARITY},
                    "reports": ["required_forms", "banned_forms", "similarity"],
                },
                "why": _text(entry.get("why"), 200)
                or "Naming the form is what makes corrective feedback work.",
                "focus": {"criterion": entry.get("criterion"), "pattern": entry.get("pattern")},
            }
        )
    return out


def _bank_frames(set_payload: dict[str, Any], wanted: list[str]) -> list[dict[str, Any]]:
    """Bank entries filtered to the functions this item targets (all of them if none)."""
    functions = coach.bank_functions(set_payload)
    if wanted:
        targeted = [f for f in functions if f["function"] in wanted]
        if targeted:
            return targeted
    return functions


def _stub_from(extend_move: str) -> str | None:
    """The bare answer hiding at the front of an authored ``extend_move``.

    ``"I'm working — I've been at a small design studio since March"`` carries its own
    too-short version in the first clause: that is exactly the answer that stops dead,
    and the rest of the field is the extension being taught.
    """
    flat = _text(extend_move, 400)
    if not flat:
        return None
    head = re.split(r"\s[—–-]\s|[,;:]", flat, maxsplit=1)[0].strip()
    if len(tokens(head)) < 2:
        head = " ".join(flat.split()[:6])
    return head.rstrip(" .,;:") or None


def extend_items(
    card: Any, teaching: dict[str, Any], set_payload: dict[str, Any]
) -> list[dict[str, Any]]:
    """Thirty seconds past the point the answer wanted to stop.

    Part 1 has an authored too-short answer inside every ``extend_move``. Part 2 has no
    stub — the under-run happens mid-turn — so its items instantiate the recovery ladder
    instead, one rung at a time. Part 3 sets the question and names the two functions the
    theme is built to elicit.
    """
    payload = coach.payload_of(card)
    out: list[dict[str, Any]] = []
    seeds: list[dict[str, Any]] = []

    if card.part == 1:
        for note in coach.part1_questions(payload, teaching):
            stub = _stub_from(note.get("extend_move") or "")
            if not note.get("question") or not stub:
                continue
            seeds.append(
                {
                    "question": note["question"],
                    "too_short": stub,
                    "shape": note.get("answer_shape"),
                    "probe": note.get("probe"),
                    "functions": [],
                }
            )
    elif card.part == 2:
        cue = payload.get("cue_card") if isinstance(payload.get("cue_card"), dict) else {}
        topic = _text(cue.get("topic"), 300) or card.title
        rungs = sorted(
            (r for r in (teaching.get("recovery_moves") or []) if isinstance(r, dict)),
            key=lambda r: r.get("rung") if isinstance(r.get("rung"), int) else 99,
        )
        functions = [f for f in (teaching.get("target_language") or []) if isinstance(f, str)]
        for rung in rungs:
            prompt = _text(rung.get("prompt"), 200)
            if not prompt:
                continue
            seeds.append(
                {
                    "question": topic,
                    "too_short": None,
                    "shape": prompt,
                    "probe": None,
                    "functions": functions,
                    "rung": rung.get("rung"),
                }
            )
    elif card.part == 3:
        for theme in coach.part3_themes(payload, teaching):
            questions = theme.get("questions") or []
            if not questions:
                continue
            first = questions[0]
            seeds.append(
                {
                    "question": first.get("question"),
                    "too_short": None,
                    "shape": first.get("answer_shape"),
                    "probe": theme.get("counter_probe"),
                    "functions": theme.get("target_functions") or [],
                }
            )

    for index, seed in enumerate(seeds[:3]):
        if not seed.get("question"):
            continue
        frames = _bank_frames(set_payload, seed["functions"])
        flat_frames = [
            {
                "function": entry["function"],
                "frame": frame["frame"],
                "slot_hint": frame.get("slot_hint"),
            }
            for entry in frames
            for frame in entry.get("frames") or []
        ][:12]
        rung = seed.get("rung")
        out.append(
            {
                "item_id": _item_id(card.id, "extend", index),
                "kind": "extend",
                "seconds": DRILL_SECONDS["extend"],
                "title": "Keep going for thirty seconds" if seed["too_short"] is None
                else "Now finish the answer",
                "instruction": (
                    "You have thirty seconds. Say the short answer, then keep going — "
                    "one reason, one example, one comparison, in that order."
                    if seed["too_short"]
                    else "You have thirty seconds on this and nothing else. Start talking now."
                ),
                "prompt": {
                    "question": seed["question"],
                    "too_short": seed["too_short"],
                    "answer_shape": seed["shape"],
                    "probe": seed["probe"],
                    "rung": rung,
                    "frames": flat_frames,
                },
                "audio": {"text": seed["question"], "role": "examiner"},
                "expected": {
                    "seconds": DRILL_SECONDS["extend"],
                    "min_words": EXTEND_MIN_WORDS,
                    "target_words": EXTEND_TARGET_WORDS,
                    "too_short": seed["too_short"],
                    "functions": [f["function"] for f in frames],
                    "frames": flat_frames,
                },
                "grading": {
                    "mode": "stt_fluency",
                    "engine": "local_stt+llm_when_unclear",
                    "pass_when": (
                        f"at least {EXTEND_MIN_WORDS} words of mostly new material, and at "
                        "least one frame from this set's language bank reached for"
                    ),
                    "thresholds": {
                        "min_words": EXTEND_MIN_WORDS,
                        "new_content": EXTEND_NEW_CONTENT,
                        "comfortable_wpm": list(COMFORTABLE_WPM),
                    },
                    "reports": ["wpm", "long_pauses", "frames_used", "new_content"],
                },
                "why": (
                    "Under-running is the commonest self-inflicted wound in the exam, and "
                    "it is a habit, not a knowledge gap. Thirty seconds at a time fixes it."
                ),
                "focus": {"criterion": "FC", "rung": rung},
            }
        )
    return out


def build_items(
    session: Session,
    card: Any,
    *,
    unlocked: bool,
    kinds: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Every drill this card can offer, in :data:`DRILL_KINDS` order."""
    wanted = [k for k in (kinds or DRILL_KINDS) if k in DRILL_KINDS] or list(DRILL_KINDS)
    teaching = coach.teaching_of(card)
    set_row = session.get(m.CardSet, card.card_set_id) if card.card_set_id else None
    set_payload = coach.payload_of(set_row)

    builders = {
        "shadowing": lambda: shadowing_items(card, teaching, unlocked=unlocked),
        "minimal_pair": lambda: minimal_pair_items(card, teaching),
        "error_repair": lambda: error_repair_items(card, teaching),
        "extend": lambda: extend_items(card, teaching, set_payload),
    }
    out: list[dict[str, Any]] = []
    for kind in DRILL_KINDS:
        if kind not in wanted:
            continue
        for item in builders[kind]():
            out.append({**item, "card_id": card.id, "card_set_id": card.card_set_id, "part": card.part})
    return out


def unavailable_reason(card: Any, kind: str, *, unlocked: bool) -> str:
    """Why a kind produced nothing, said accurately rather than generically.

    "There is nothing here" and "there is nothing here *yet*" and "this is the wrong
    instrument for this card" are three different messages, and a learner who gets the
    wrong one concludes the feature is broken.
    """
    teaching = coach.teaching_of(card)
    if not teaching:
        return EMPTY_MESSAGE
    if kind == "shadowing":
        if not unlocked:
            return LOCKED_MESSAGE
        return (
            "Shadowing runs on the Part 2 long turn, where the band ladder lives. Try it "
            "on this set's Part 2 card."
        )
    if kind == "minimal_pair":
        priority = _text(_focus(teaching).get("priority"), 40)
        if priority in PROSODIC_PRIORITIES:
            return (
                f"This card's pronunciation focus is {priority.replace('_', ' ')}, which is "
                "rhythm, not sounds — minimal pairs cannot train it. Shadow the sentence instead."
            )
        return "No pair on this card yet. The pronunciation focus still tells you what to listen for."
    if kind == "error_repair":
        return "No error watchlist on this card — the set's Part 2 card will have one."
    return (
        "No too-short answer authored here. Part 1 questions and the Part 2 recovery "
        "ladder both carry one."
    )


def two_minute_set(items: list[dict[str, Any]]) -> list[str]:
    """One item of each available kind, in order, inside the two-minute budget."""
    plan: list[str] = []
    spent = 0
    for kind in DRILL_KINDS:
        for item in items:
            if item["kind"] != kind:
                continue
            cost = int(item.get("seconds") or 0)
            if spent + cost > SET_BUDGET_S:
                break
            plan.append(item["item_id"])
            spent += cost
            break
    return plan


def find_item(items: list[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
    for item in items:
        if item["item_id"] == item_id:
            return item
    return None


# ======================================================================================
# Grading — pure, synchronous, and the only place a verdict is decided
# ======================================================================================


def _fluency(words: list[dict[str, Any]], duration_ms: int | None) -> dict[str, Any]:
    try:
        return pron.fluency_proxies(words or [], duration_ms)
    except Exception as exc:  # noqa: BLE001 — a metric must never fail a drill
        _log.debug("fluency proxies unavailable: %s", exc)
        return {"available": False, "words": len(words or [])}


def _grade_shadowing(
    item: dict[str, Any], heard: list[str], words: list[dict[str, Any]], duration_ms: int | None
) -> dict[str, Any]:
    expected = list(item["expected"]["tokens"])
    alignment = align(expected, heard)
    score = agreement(alignment)

    target_status: list[dict[str, Any]] = []
    for target in item["expected"].get("target_words") or []:
        wanted = tokens(target)
        first = wanted[0] if wanted else None
        rows = [row for row in alignment if row["expected"] == first]
        hit = any(row["status"] == "hit" for row in rows)
        heard_as = next(
            (row["heard"] for row in rows if row["status"] == "substituted" and row["heard"]), None
        )
        target_status.append({"word": target, "hit": hit, "heard_as": heard_as})

    chunking = _chunk_report(item["expected"].get("chunk_groups") or [], alignment, words)

    missed = [row["expected"] for row in alignment if row["status"] == "missed"]
    substituted = [
        {"expected": row["expected"], "heard": row["heard"]}
        for row in alignment
        if row["status"] == "substituted"
    ]
    dropped = [t["word"] for t in target_status if not t["hit"]]
    passed = score >= SHADOW_PASS and not dropped

    feedback: list[str] = []
    if dropped:
        feedback.append(
            "The sentence held together, but " + ", ".join(dropped[:3]) + " did not survive — "
            "that is the sound this card is training."
            if score >= SHADOW_PASS
            else "Start again slower: " + ", ".join(dropped[:3]) + " did not come through."
        )
    if chunking["breaks_inside_chunks"]:
        first = chunking["breaks_inside_chunks"][0]
        feedback.append(
            f"You paused inside “{first['chunk']}”. Pause at the joins between groups, "
            "never in the middle of one — that is what makes speech sound assembled."
        )
    elif chunking["available"] and chunking["boundaries_kept"] == chunking["boundaries_total"]:
        feedback.append("Every pause landed at a thought-group join. That is the whole drill.")
    if not feedback:
        feedback.append(
            "Clean repeat. Run it once more without looking at the text — text-free "
            "shadowing is the version that transfers."
        )

    return {
        "mode": "stt_alignment",
        "passed": passed,
        "score": round(score * 100),
        "checks": [
            {"check": "agreement", "value": score, "threshold": SHADOW_PASS,
             "ok": score >= SHADOW_PASS},
            {"check": "target_words", "value": len(dropped), "threshold": 0, "ok": not dropped},
        ],
        "detail": {
            "agreement": score,
            "alignment": alignment,
            "missed": missed,
            "substituted": substituted,
            "target_words": target_status,
            "chunking": chunking,
            "fluency": _fluency(words, duration_ms),
        },
        "feedback": feedback,
        "needs_judgement": False,
    }


def _chunk_report(
    chunk_groups: list[list[str]], alignment: list[dict[str, Any]], words: list[dict[str, Any]]
) -> dict[str, Any]:
    """Where the learner actually paused, against where the authoring says the joins are."""
    timed = [
        w for w in (words or [])
        if w.get("t_start_ms") is not None and w.get("t_end_ms") is not None
    ]
    if not chunk_groups or len(timed) < 2:
        return {
            "available": False,
            "boundaries": [],
            "boundaries_kept": 0,
            "boundaries_total": 0,
            "breaks_inside_chunks": [],
        }

    def gap_before(expected_index: int) -> int | None:
        position = heard_index_for(alignment, expected_index)
        if position is None or position <= 0 or position >= len(timed):
            return None
        return int(timed[position]["t_start_ms"]) - int(timed[position - 1]["t_end_ms"])

    boundaries: list[dict[str, Any]] = []
    inside: list[dict[str, Any]] = []
    cursor = 0
    for chunk_index, group in enumerate(chunk_groups):
        start = cursor
        cursor += len(group)
        if chunk_index > 0:
            gap = gap_before(start)
            boundaries.append(
                {
                    "chunk_index": chunk_index,
                    "after": " ".join(chunk_groups[chunk_index - 1]),
                    "before": " ".join(group),
                    "gap_ms": gap,
                    "ok": gap is not None and gap >= BOUNDARY_MIN_MS,
                }
            )
        for offset in range(1, len(group)):
            gap = gap_before(start + offset)
            if gap is not None and gap >= INSIDE_BREAK_MS:
                inside.append(
                    {
                        "chunk": " ".join(group),
                        "before_word": group[offset],
                        "gap_ms": gap,
                    }
                )
    return {
        "available": True,
        "boundaries": boundaries,
        "boundaries_kept": sum(1 for b in boundaries if b["ok"]),
        "boundaries_total": len(boundaries),
        "breaks_inside_chunks": inside,
    }


def _grade_minimal_pair(item: dict[str, Any], heard: list[str]) -> dict[str, Any]:
    want = str(item["expected"]["say"])
    avoid = str(item["expected"]["avoid"])
    said_target = want in heard
    said_distractor = avoid in heard
    passed = said_target and not said_distractor
    heard_as = want if said_target else (avoid if said_distractor else nearest_token(want, heard))

    if passed:
        feedback = [
            f"Heard as “{want}”. That contrast is landing — keep it in the carrier sentence."
        ]
    elif said_distractor:
        feedback = [
            (
                f"We heard “{avoid}”, not “{want}”. The two differ only in "
                f"{item['expected'].get('contrast')} — exaggerate that one feature and say it again."
            )
        ]
    else:
        near = f" (we heard “{heard_as}”)" if heard_as else ""
        feedback = [
            (
                f"“{want}” did not come through{near}. Say the single word on its own first, "
                "then put it back in the sentence."
            )
        ]

    return {
        "mode": "stt_contains",
        "passed": passed,
        "score": 100 if passed else 0,
        "checks": [
            {"check": "said_target", "value": said_target, "threshold": True, "ok": said_target},
            {"check": "avoided_neighbour", "value": not said_distractor, "threshold": True,
             "ok": not said_distractor},
        ],
        "detail": {
            "heard_as": heard_as,
            "said_target": said_target,
            "said_distractor": said_distractor,
            "contrast": item["expected"].get("contrast"),
        },
        "feedback": feedback,
        "needs_judgement": False,
    }


def _grade_choice(item: dict[str, Any], choice: str | None) -> dict[str, Any]:
    answer = str(item["expected"].get("answer") or "b").strip().lower()
    picked = (choice or "").strip().lower()
    if picked not in ("a", "b"):
        raise ApiError(422, "validation_error", "this item is graded from a choice of 'a' or 'b'")
    passed = picked == answer
    return {
        "mode": "choice",
        "passed": passed,
        "score": 100 if passed else 0,
        "checks": [{"check": "choice", "value": picked, "threshold": answer, "ok": passed}],
        "detail": {"picked": picked, "answer": answer, "contrast": item["expected"].get("contrast")},
        "feedback": [
            "Correct — the stress moved and you heard it."
            if passed
            else "Not that one. Listen for which syllable is longer and louder, not which is first."
        ],
        "needs_judgement": False,
    }


def _grade_error_repair(item: dict[str, Any], heard: list[str], transcript: str) -> dict[str, Any]:
    required = list(item["expected"]["required"])
    banned = list(item["expected"]["banned"])
    heard_set = set(heard)
    missing = [t for t in required if t not in heard_set]
    returned = [t for t in banned if t in heard_set]
    similarity = round(
        difflib.SequenceMatcher(a=tokens(item["expected"]["text"]), b=heard, autojunk=False).ratio(), 3
    )
    # Some fixes rewrite a clause rather than swap a word, and then "which banned tokens
    # came back" is a poor description of what happened. Measuring the distance to the
    # *wrong* sentence tells us plainly whether the learner just read it out again.
    echoed = round(
        difflib.SequenceMatcher(a=tokens(item["prompt"]["wrong"]), b=heard, autojunk=False).ratio(), 3
    )
    attempted = bool(heard) and similarity >= REPAIR_MIN_SIMILARITY

    if returned and echoed >= 0.8 and echoed > similarity:
        passed, needs_judgement = False, False
        feedback = [
            (
                "That was the wrong sentence read back, not the fix. "
                f"{item['expected'].get('why') or ''}"
            )
        ]
    elif returned:
        passed, needs_judgement = False, False
        feedback = [
            (
                f"The error came back: {', '.join(distinctive(returned)[:3])}. "
                f"{item['expected'].get('why') or ''}"
            )
        ]
    elif not missing:
        passed, needs_judgement = True, False
        feedback = [
            f"Correct — {', '.join(required[:3])} all landed. {item['expected'].get('why') or ''}"
        ]
    elif attempted:
        # They said something else. It may be a different but perfectly good repair, and
        # only judgement settles that — this is the one branch worth an LLM call.
        passed, needs_judgement = False, True
        feedback = [
            (
                f"That is not the form this card is drilling ({', '.join(missing[:3])}), "
                "though it may still be correct English — checking."
            )
        ]
    else:
        passed, needs_judgement = False, False
        feedback = [
            (
                "Say the whole corrected sentence out loud, not just the changed word — "
                f"{item['expected'].get('why') or ''}"
            )
        ]

    return {
        "mode": "stt_repair",
        "passed": passed,
        "score": 100 if passed else (round(similarity * 100) if attempted else 0),
        "checks": [
            {"check": "required_forms", "value": len(required) - len(missing),
             "threshold": len(required), "ok": not missing},
            {"check": "banned_forms", "value": len(returned), "threshold": 0, "ok": not returned},
        ],
        "detail": {
            "required": required,
            "missing": missing,
            "banned": banned,
            "returned": returned,
            "similarity": similarity,
            "echoed_wrong": echoed,
            "you_said": _text(transcript, 400),
            "one_way_to_say_it": item["expected"]["text"],
            "pattern": item["expected"].get("pattern"),
        },
        "feedback": [f for f in feedback if f.strip()],
        "needs_judgement": needs_judgement,
    }


def frames_used(transcript: str, frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Which authored frames the learner demonstrably reached for.

    The same string test the compare screen uses (``coach.signature_tokens``): every
    content word of the frame present in what was said. It under-counts paraphrase on
    purpose — over-counting would tell a learner they used language they did not.
    """
    spoken = set(tokens(transcript))
    out: list[dict[str, Any]] = []
    for frame in frames:
        signature = coach.signature_tokens(str(frame.get("frame") or ""))
        if signature and all(token in spoken for token in signature):
            out.append({"function": frame.get("function"), "frame": frame.get("frame")})
    return out


def _grade_extend(
    item: dict[str, Any],
    heard: list[str],
    words: list[dict[str, Any]],
    transcript: str,
    duration_ms: int | None,
) -> dict[str, Any]:
    expected = item["expected"]
    fluency = _fluency(words, duration_ms)
    word_count = len(heard)

    stub_content = set(content_tokens(expected.get("too_short") or ""))
    spoken_content = content_tokens(transcript)
    new_content = (
        round(sum(1 for t in spoken_content if t not in stub_content) / len(spoken_content), 3)
        if spoken_content
        else 0.0
    )
    if not stub_content:
        new_content = 1.0

    used = frames_used(transcript, expected.get("frames") or [])
    long_enough = word_count >= EXTEND_MIN_WORDS
    fresh = new_content >= EXTEND_NEW_CONTENT
    reached = bool(used)

    wpm = fluency.get("wpm") if fluency.get("available") else None
    checks = [
        {"check": "length", "value": word_count, "threshold": EXTEND_MIN_WORDS, "ok": long_enough},
        {"check": "new_content", "value": new_content, "threshold": EXTEND_NEW_CONTENT, "ok": fresh},
        {"check": "target_language", "value": len(used), "threshold": 1, "ok": reached},
    ]
    passed = all(c["ok"] for c in checks)

    feedback: list[str] = []
    if not long_enough:
        feedback.append(
            f"{word_count} words in thirty seconds. Aim for {EXTEND_TARGET_WORDS}: one reason, "
            "one example, one comparison — three sentences, not three words."
        )
    if not fresh and stub_content:
        feedback.append("Most of that was the short answer said again. Add, don't repeat.")
    if reached:
        feedback.append(
            f"You reached for “{used[0]['frame']}” — that is the language this set teaches."
        )
    if wpm is not None:
        low, high = COMFORTABLE_WPM
        if wpm > high:
            feedback.append(
                f"You ran at {wpm} words a minute. That is the nervous speed-up; the fix is "
                "pacing, not content."
            )
        elif wpm < low:
            feedback.append(
                f"{wpm} words a minute — the words are there, the continuity is not. "
                "Try the same thirty seconds again immediately; the second take is always faster."
            )
    if fluency.get("long_pause_count"):
        feedback.append(
            f"{fluency['long_pause_count']} pause(s) over a second. Climb a rung rather than stop: "
            "add a detail to a noun you have already said."
        )

    return {
        "mode": "stt_fluency",
        "passed": passed,
        "score": round(100 * sum(1 for c in checks if c["ok"]) / len(checks)),
        "checks": checks,
        "detail": {
            "words": word_count,
            "wpm": wpm,
            "articulation_wpm": fluency.get("articulation_wpm"),
            "long_pause_count": fluency.get("long_pause_count"),
            "pause_ratio": fluency.get("pause_ratio"),
            "new_content": new_content,
            "frames_used": used,
            "frames_offered": expected.get("frames") or [],
            "you_said": _text(transcript, 1200),
        },
        "feedback": feedback
        or ["Thirty seconds, on topic, with new material. Do it again on the next question."],
        # A frame test is a string test, so a miss is not proof the function was absent —
        # only a learner who spoke at length and matched nothing is worth asking about.
        "needs_judgement": long_enough and fresh and not reached,
    }


def grade(
    item: dict[str, Any],
    *,
    transcript: str = "",
    words: list[dict[str, Any]] | None = None,
    duration_ms: int | None = None,
    choice: str | None = None,
) -> dict[str, Any]:
    """The verdict on one attempt. Pure: no DB, no network, no clock.

    ``words`` is the STT word list (``word``/``t_start_ms``/``t_end_ms``/``confidence``)
    when there is one; ``transcript`` alone is enough for every check except the
    rhythm-shaped ones, which degrade to ``available: false`` rather than guessing.
    """
    mode = item["grading"]["mode"]
    if mode == "choice":
        return _grade_choice(item, choice)

    words = list(words or [])
    if not transcript and words:
        transcript = " ".join(str(w.get("word") or "") for w in words)
    heard = tokens(transcript)
    if not heard:
        return {
            "mode": mode,
            "passed": False,
            "score": 0,
            "checks": [{"check": "heard_anything", "value": 0, "threshold": 1, "ok": False}],
            "detail": {"you_said": None},
            "feedback": [
                (
                    "Nothing came through. Check the microphone, then say it again — a "
                    "drill graded on silence would be worse than no drill."
                )
            ],
            "needs_judgement": False,
        }

    if mode == "stt_alignment":
        return _grade_shadowing(item, heard, words, duration_ms)
    if mode == "stt_contains":
        return _grade_minimal_pair(item, heard)
    if mode == "stt_repair":
        return _grade_error_repair(item, heard, transcript)
    if mode == "stt_fluency":
        return _grade_extend(item, heard, words, transcript, duration_ms)
    raise ApiError(422, "validation_error", f"unsupported grading mode {mode!r}")


# ======================================================================================
# Judgement — one call, only when the mechanical pass could not settle it
# ======================================================================================

JUDGE_SYSTEM = """You adjudicate one short IELTS-style speaking drill. You are given the
task, the target the drill was training, and exactly what the candidate said. You cannot
hear audio and you must not comment on pronunciation, accent, or fluency.

Answer one question only: did the candidate do the thing the drill asked for, even
though they did not use the exact wording we looked for?

Rules:
- Credit a different but correct way of doing it. Refuse a sentence that is ungrammatical
  or that dodges the target.
- Judge the target only. Do not mark other errors, do not rewrite the whole answer.
- "verdict" is "pass" or "fail". "note" is one sentence a learner can act on, under 25
  words, addressed to them as "you".

Output only JSON: {"verdict": "pass"|"fail", "note": "...", "target_seen": "<the words
in their answer that did the job, or null>"}"""


def build_judge_messages(
    item: dict[str, Any], transcript: str, result: dict[str, Any]
) -> list[dict[str, str]]:
    if item["kind"] == "error_repair":
        task = (
            f"The candidate had to correct this sentence: {item['prompt']['wrong']!r}\n"
            f"The error pattern is {item['expected'].get('pattern')!r} "
            f"({item['expected'].get('why')}).\n"
            f"One correct version is: {item['expected']['text']!r}\n"
            f"We looked for these forms and did not find them: "
            f"{', '.join(result['detail']['missing'])}."
        )
    else:
        functions = ", ".join(item["expected"].get("functions") or []) or "extending an answer"
        task = (
            f"The candidate had thirty seconds to extend an answer to: "
            f"{item['prompt']['question']!r}\n"
            f"The drill trains these language functions: {functions}.\n"
            "They spoke at length but used none of the authored frames verbatim."
        )
    return [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": f"{task}\n\nWHAT THE CANDIDATE SAID:\n{transcript.strip()}"},
    ]


async def judge(item: dict[str, Any], transcript: str, result: dict[str, Any]) -> dict[str, Any]:
    """Ask the model to settle an inconclusive verdict. Never overturns a confident one.

    Offline, keyless, mock-mode or a provider outage all land in the same place: the
    mechanical result stands and says why it could not be settled. ``mock_kind`` is
    passed unconditionally as the provider contract asks; there is no canned fixture for
    drill judgement, so mock builds fall through to that same honest degradation.
    """
    from bandready.providers.llm import chat_json

    if not result.get("needs_judgement"):
        return result

    try:
        parsed = await chat_json(
            build_judge_messages(item, transcript, result),
            mock_kind="drill_judge",
            temperature=0.1,
        )
    except ApiError as exc:
        _log.info("drill judgement unavailable, mechanical verdict stands: %s", exc.detail)
        parsed = {}

    verdict = str(parsed.get("verdict") or "").strip().lower()
    note = _text(parsed.get("note"), 200)
    if verdict not in ("pass", "fail") or not note:
        return {
            **result,
            "judgement": {"available": False, "reason": "no_usable_verdict"},
            "feedback": [
                *result["feedback"],
                (
                    "We could not check the alternative wording, so this is marked on the "
                    "exact target only."
                ),
            ],
        }

    passed = verdict == "pass"
    return {
        **result,
        "passed": passed,
        "score": max(result["score"], 100 if passed else 0) if passed else result["score"],
        "judgement": {
            "available": True,
            "verdict": verdict,
            "target_seen": _text(parsed.get("target_seen"), 200),
            "model_id": (parsed.get("_meta") or {}).get("model_id"),
        },
        "feedback": [note, *result["feedback"][1:]],
    }


# ======================================================================================
# Speech in — the local STT pass, without the LLM flagger
# ======================================================================================


async def transcribe(wav_path: Path) -> tuple[list[dict[str, Any]], str, int | None]:
    """``(words, transcript, duration_ms)`` for one drill recording.

    Deliberately **not** :func:`pron.analyze_wav`: that one spends an LLM call flagging
    likely mispronunciations across a whole turn, which is the wrong instrument and the
    wrong latency for a fifteen-second repeat.
    """
    words, transcript = await asyncio.to_thread(pron.transcribe_words, Path(wav_path))
    duration_ms = pron.wav_duration_ms(Path(wav_path))
    if not words and transcript:
        words = pron.words_from_transcript(transcript)
    return list(words), str(transcript or ""), duration_ms


# ======================================================================================
# Persistence — existing tables only (11 §7); see the module docstring
# ======================================================================================

#: Which ``pron_scores.source`` each drill's words belong under. ``extend`` is
#: spontaneous speech with no reference text, so it has no honest home there and stores
#: only its practice-session summary.
PRON_SOURCE: dict[str, str] = {
    "shadowing": "shadowing",
    "minimal_pair": "minimal_pair",
    "error_repair": "read_aloud",
}


def persist(
    session: Session,
    profile_id: str,
    item: dict[str, Any],
    result: dict[str, Any],
    *,
    words: list[dict[str, Any]] | None = None,
    transcript: str = "",
    duration_ms: int | None = None,
    audio_path: str | None = None,
) -> dict[str, Any]:
    """Write the attempt across the tables that already exist for it."""
    session_id = f"ps_{ULID()}"
    now = _iso()
    duration_s = round((duration_ms or 0) / 1000) or None

    summary = {
        "drill": {
            "kind": item["kind"],
            "item_id": item["item_id"],
            "card_id": item.get("card_id"),
            "card_set_id": item.get("card_set_id"),
            "part": item.get("part"),
            "mode": result["mode"],
        },
        "passed": result["passed"],
        "score": result["score"],
        "checks": result["checks"],
        "detail": result.get("detail"),
        "feedback": result.get("feedback"),
        "judgement": result.get("judgement"),
        "transcript": _text(transcript, 2000),
    }
    session.add(
        m.PracticeSession(
            id=session_id,
            profile_id=profile_id,
            module="drill",
            activity=f"speaking_drill:{item['kind']}",
            started_at=now,
            ended_at=now,
            duration_s=duration_s,
            summary_json=json.dumps(summary, ensure_ascii=False),
        )
    )

    written = {"practice_session_id": session_id, "pron_scores": 0, "pron_drill_attempt": None}

    source = PRON_SOURCE.get(item["kind"])
    if source and words:
        try:
            turn = pron.build_turn_result(
                words, transcript, duration_ms=duration_ms, audio_path=audio_path
            )
            written["pron_scores"] = pron.persist_standalone(
                session, profile_id, turn, source, item["item_id"], audio_path
            )
        except Exception as exc:  # noqa: BLE001 — word scores are a bonus, not the record
            _log.warning("could not store %s word scores: %s", item["kind"], exc)

    if item["kind"] == "minimal_pair":
        try:
            recorded = pron.record_drill_attempt(
                session,
                profile_id,
                "minimal_pair_ab",
                item.get("pack_id") or item["item_id"],
                bool(result["passed"]),
                contrast=(item["expected"].get("contrast")),
                response_ms=duration_ms,
            )
            written["pron_drill_attempt"] = recorded["id"]
        except Exception as exc:  # noqa: BLE001
            _log.warning("could not record the minimal-pair attempt: %s", exc)

    return written


def history(
    session: Session, profile_id: str, *, kind: str | None = None, limit: int = 25
) -> dict[str, Any]:
    """Recent drill attempts and the per-kind hit rate, read back out of ``practice_sessions``."""
    clauses = ["profile_id = :pid", "module = 'drill'", "activity LIKE 'speaking_drill:%'"]
    params: dict[str, Any] = {"pid": profile_id, "limit": max(1, min(200, limit))}
    if kind:
        if kind not in DRILL_KINDS:
            raise ApiError(422, "validation_error", f"drill kind must be one of {DRILL_KINDS}")
        clauses.append("activity = :activity")
        params["activity"] = f"speaking_drill:{kind}"

    rows = session.execute(
        sql(
            "SELECT id, activity, started_at, duration_s, summary_json FROM practice_sessions "
            "WHERE " + " AND ".join(clauses) + " ORDER BY started_at DESC, id DESC LIMIT :limit"
        ),
        params,
    ).mappings().all()

    items: list[dict[str, Any]] = []
    for row in rows:
        summary = coach.loads(row["summary_json"], {})
        drill = summary.get("drill") if isinstance(summary.get("drill"), dict) else {}
        items.append(
            {
                "id": row["id"],
                "kind": str(row["activity"]).split(":", 1)[-1],
                "at": row["started_at"],
                "duration_s": row["duration_s"],
                "card_id": drill.get("card_id"),
                "card_set_id": drill.get("card_set_id"),
                "item_id": drill.get("item_id"),
                "passed": summary.get("passed"),
                "score": summary.get("score"),
                "headline": (summary.get("feedback") or [None])[0],
            }
        )

    stats = session.execute(
        sql(
            "SELECT activity, COUNT(*) AS n, "
            "SUM(CASE WHEN json_extract(summary_json, '$.passed') IN (1, 'true') "
            "THEN 1 ELSE 0 END) AS ok, "
            "AVG(json_extract(summary_json, '$.score')) AS avg_score "
            "FROM practice_sessions WHERE profile_id = :pid AND module = 'drill' "
            "AND activity LIKE 'speaking_drill:%' GROUP BY activity"
        ),
        {"pid": profile_id},
    ).mappings().all()

    by_kind = [
        {
            "kind": str(r["activity"]).split(":", 1)[-1],
            "attempts": int(r["n"]),
            "passed": int(r["ok"] or 0),
            "accuracy": round(float(r["ok"] or 0) / max(1, int(r["n"])), 3),
            "mean_score": round(float(r["avg_score"]), 1) if r["avg_score"] is not None else None,
        }
        for r in stats
    ]
    by_kind.sort(key=lambda r: DRILL_KINDS.index(r["kind"]) if r["kind"] in DRILL_KINDS else 99)
    return {"items": items, "by_kind": by_kind}


__all__ = [
    "DRILL_KINDS",
    "DRILL_SECONDS",
    "GRADING_MODES",
    "agreement",
    "align",
    "build_items",
    "clip",
    "distinctive",
    "error_repair_items",
    "extend_items",
    "find_item",
    "frames_used",
    "grade",
    "history",
    "judge",
    "minimal_pair_items",
    "persist",
    "repair_targets",
    "shadowing_items",
    "tokens",
    "transcribe",
    "two_minute_set",
    "unavailable_reason",
]
