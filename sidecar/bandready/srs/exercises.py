"""The six review exercise types (08-vocabulary-srs.md §5.2) and their grading.

Every generator returns the same envelope::

    {"type": "cloze", "prompt": "...", "payload": {...}, "expected": [...]}

`payload` is everything the renderer needs to draw the card; `expected` is what
`grade_answer()` checks a typed answer against (``None`` for the types that are not
auto-checked). Nothing here touches the database — routes pass in a serialized entry so
the same code can render a preview or a queue item.

This module also owns the small lexical helpers (normalisation, a rule-based lemmatizer and
inflection variants). `simplemma` — the package 08 §3.1 names — is not installed in the
sidecar environment, so the rules below stand in for it; they cover regular English
inflection plus the common irregulars an IELTS bank actually contains, and the lemma is only
ever a dedup/matching key, never shown to the learner.
"""

from __future__ import annotations

import random
import re
import unicodedata
from typing import Any

__all__ = [
    "EXERCISE_TYPES",
    "build_exercise",
    "check_sentence",
    "choose_exercise",
    "cloze_from_sentence",
    "eligible_types",
    "grade_answer",
    "lemmatize",
    "normalize_answer_text",
    "normalize_term",
    "word_variants",
]

EXERCISE_TYPES: tuple[str, ...] = (
    "flip",
    "cloze",
    "use_in_sentence",
    "collocation",
    "audio_recall",
    "speaking_drill",
)

#: §5.2 maturity table.
YOUNG_STABILITY_DAYS = 7.0

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*")
_PUNCT_RE = re.compile(r"[^\w\s'\-]", re.UNICODE)
_WS_RE = re.compile(r"\s+")


# --------------------------------------------------------------------------------------
# Lexical helpers
# --------------------------------------------------------------------------------------

_IRREGULAR: dict[str, str] = {
    "am": "be", "is": "be", "are": "be", "was": "be", "were": "be", "been": "be",
    "being": "be", "has": "have", "had": "have", "having": "have", "does": "do",
    "did": "do", "done": "do", "doing": "do", "went": "go", "gone": "go", "goes": "go",
    "made": "make", "making": "make", "took": "take", "taken": "take", "taking": "take",
    "gave": "give", "given": "give", "giving": "give", "came": "come", "coming": "come",
    "saw": "see", "seen": "see", "seeing": "see", "said": "say", "saying": "say",
    "thought": "think", "thinking": "think", "brought": "bring", "bringing": "bring",
    "bought": "buy", "buying": "buy", "caught": "catch", "catching": "catch",
    "found": "find", "finding": "find", "held": "hold", "holding": "hold",
    "kept": "keep", "keeping": "keep", "led": "lead", "leading": "lead",
    "left": "leave", "leaving": "leave", "lost": "lose", "losing": "lose",
    "met": "meet", "meeting": "meet", "paid": "pay", "paying": "pay",
    "ran": "run", "running": "run", "sold": "sell", "selling": "sell",
    "sent": "send", "sending": "send", "spent": "spend", "spending": "spend",
    "stood": "stand", "standing": "stand", "taught": "teach", "teaching": "teach",
    "told": "tell", "telling": "tell", "understood": "understand", "wrote": "write",
    "written": "write", "writing": "write", "children": "child", "people": "person",
    "men": "man", "women": "woman", "feet": "foot", "teeth": "tooth", "mice": "mouse",
    "criteria": "criterion", "phenomena": "phenomenon", "analyses": "analysis",
    "crises": "crisis", "theses": "thesis", "data": "datum", "better": "good",
    "best": "good", "worse": "bad", "worst": "bad", "more": "much", "most": "much",
}

_KEEP_AS_IS = {
    "as", "bus", "gas", "his", "its", "this", "thus", "yes", "less", "always", "perhaps",
    "series", "species", "news", "means", "focus", "campus", "status", "virus", "analysis",
    "crisis", "basis", "thesis", "during", "spring", "string", "thing", "ring", "king",
    "wing", "morning", "evening", "being", "nothing", "something", "everything", "was",
    "is", "has",
}

_DOUBLE_CONSONANTS = "bdfglmnprstz"
_VOWELS = "aeiou"


def strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )


def normalize_term(term: str) -> str:
    """Lowercase, trim, collapse whitespace, strip terminal punctuation (§3.1)."""
    text = _WS_RE.sub(" ", (term or "").replace("’", "'").strip()).lower()
    return text.strip(" \t\n\r.,;:!?\"'()[]{}")


def _singularize(word: str) -> str:
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith(("sses", "shes", "ches", "xes", "zes")):
        return word[:-2]
    if word.endswith("ses") and len(word) > 4:
        return word[:-2]
    if word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def _deduplicate_final(word: str) -> str:
    if (
        len(word) > 3
        and word[-1] == word[-2]
        and word[-1] in _DOUBLE_CONSONANTS
        and word[-3] in _VOWELS
    ):
        return word[:-1]
    return word


def _lemmatize_token(word: str) -> str:
    """Rule-based English lemmatizer (stands in for `simplemma`, see module docstring)."""
    w = word.lower()
    if w in _IRREGULAR:
        return _IRREGULAR[w]
    if w in _KEEP_AS_IS or len(w) <= 3:
        return w
    if w.endswith("ing") and len(w) > 5:
        stem = w[:-3]
        stem = _deduplicate_final(stem)
        return stem + "e" if _needs_silent_e(stem) else stem
    if w.endswith("ied") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("ed") and len(w) > 4:
        stem = w[:-2]
        stem = _deduplicate_final(stem)
        return stem + "e" if _needs_silent_e(stem) else stem
    if w.endswith("s"):
        return _singularize(w)
    return w


def _needs_silent_e(stem: str) -> bool:
    """`mitigat` → `mitigate`; `walk` stays `walk`. Heuristic but adequate as a key."""
    if len(stem) < 3:
        return False
    if stem.endswith(("at", "iz", "is", "ur", "in", "us", "iv", "id", "ic", "ol", "os")):
        return True
    return stem[-1] in "vz"


def lemmatize(term: str, is_phrase: bool | None = None) -> str:
    """The dedup key for `(profile_id, lemma, pos)` (§3.1).

    Phrases are normalised but never per-token lemmatized ("raining cats and dogs" stays).
    """
    normalized = normalize_term(term)
    if not normalized:
        return ""
    phrase = is_phrase if is_phrase is not None else (" " in normalized)
    if phrase:
        return normalized
    return _lemmatize_token(strip_accents(normalized))


def word_variants(headword: str, lemma: str | None = None) -> set[str]:
    """Plausible surface forms of a headword — used to blank cloze gaps and match answers."""
    base = normalize_term(headword)
    forms = {base}
    root = normalize_term(lemma or "") or _lemmatize_token(base)
    forms.add(root)
    if " " in base:
        return {f for f in forms if f}
    for stem in {base, root}:
        if not stem:
            continue
        forms.add(stem + "s")
        forms.add(stem + "es")
        forms.add(stem + "ed")
        forms.add(stem + "ing")
        forms.add(stem + "d")
        forms.add(stem + "ly")
        if stem.endswith("e"):
            forms.add(stem[:-1] + "ing")
            forms.add(stem[:-1] + "ed")
            forms.add(stem[:-1] + "ion")
        if stem.endswith("y"):
            forms.add(stem[:-1] + "ies")
            forms.add(stem[:-1] + "ied")
        if len(stem) > 3 and stem[-1] in _DOUBLE_CONSONANTS and stem[-2] in _VOWELS:
            forms.add(stem + stem[-1] + "ing")
            forms.add(stem + stem[-1] + "ed")
    return {f for f in forms if f}


def normalize_answer_text(text: str) -> str:
    """Answer comparison form: lowercase, accent-free, punctuation-free, single-spaced."""
    cleaned = _PUNCT_RE.sub(" ", strip_accents((text or "").replace("’", "'")).lower())
    return _WS_RE.sub(" ", cleaned).strip()


# --------------------------------------------------------------------------------------
# Cloze construction
# --------------------------------------------------------------------------------------


def cloze_from_sentence(sentence: str, headword: str, lemma: str | None = None) -> dict[str, Any]:
    """Blank every inflected occurrence of the headword in the learner's own sentence.

    Returns ``{"masked", "answers", "blanks"}``; ``blanks == 0`` means the sentence does not
    contain the word, so the caller must fall back to another exercise (§5.2).
    """
    if not sentence or not headword:
        return {"masked": sentence or "", "answers": [], "blanks": 0}

    variants = word_variants(headword, lemma)
    phrase = " " in normalize_term(headword)
    answers: list[str] = []

    if phrase:
        target = normalize_term(headword)
        pattern = re.compile(
            r"\b" + r"[\s\-]+".join(re.escape(tok) for tok in target.split()) + r"\b",
            re.IGNORECASE,
        )

        def replace_phrase(match: re.Match[str]) -> str:
            answers.append(match.group(0))
            return "_" * max(6, len(match.group(0)))

        masked = pattern.sub(replace_phrase, sentence)
        return {"masked": masked, "answers": answers, "blanks": len(answers)}

    def replace_word(match: re.Match[str]) -> str:
        token = match.group(0)
        if normalize_term(token) in variants:
            answers.append(token)
            return "_" * max(4, len(token))
        return token

    masked = _WORD_RE.sub(replace_word, sentence)
    return {"masked": masked, "answers": answers, "blanks": len(answers)}


# --------------------------------------------------------------------------------------
# Exercise selection (§5.2 maturity table)
# --------------------------------------------------------------------------------------


def eligible_types(
    entry: dict[str, Any],
    card: dict[str, Any] | None = None,
    *,
    allow_llm: bool = True,
    disabled: tuple[str, ...] = (),
) -> list[str]:
    """Exercise types this card can actually be rendered as, right now."""
    state = int((card or {}).get("state_code", 0) or 0)
    stability = float((card or {}).get("stability") or 0.0)

    has_context = bool(
        (entry.get("own_context_sentence") or "").strip()
        and cloze_from_sentence(
            entry.get("own_context_sentence") or "",
            entry.get("headword") or "",
            entry.get("lemma"),
        )["blanks"]
    )
    has_collocations = len(entry.get("collocations") or []) >= 1
    has_definition = bool((entry.get("definition") or "").strip())

    if state in (0, 1):
        candidates = ["flip"]
    elif state == 3:
        candidates = ["flip", "cloze"]
    elif stability < YOUNG_STABILITY_DAYS:
        candidates = ["cloze", "collocation", "flip"]
    else:
        candidates = ["cloze", "use_in_sentence", "audio_recall", "collocation"]

    out: list[str] = []
    for kind in candidates:
        if kind in disabled:
            continue
        if kind == "cloze" and not has_context:
            continue
        if kind == "collocation" and not has_collocations:
            continue
        if kind == "use_in_sentence" and (not allow_llm or not has_definition):
            continue
        out.append(kind)
    return out or ["flip"]


def choose_exercise(
    entry: dict[str, Any],
    card: dict[str, Any] | None = None,
    *,
    rng: random.Random | None = None,
    allow_llm: bool = True,
    disabled: tuple[str, ...] = (),
) -> str:
    options = eligible_types(entry, card, allow_llm=allow_llm, disabled=disabled)
    return (rng or random).choice(options)


# --------------------------------------------------------------------------------------
# Exercise builders
# --------------------------------------------------------------------------------------

_SOURCE_LABEL = {
    "speaking": "your Speaking practice",
    "writing": "your Writing feedback",
    "reading": "your Reading session",
    "listening": "your Listening practice",
    "pronunciation": "your Pronunciation report",
    "manual": "your own list",
    "seed": "a study deck",
}


def _source_note(entry: dict[str, Any]) -> str:
    source = entry.get("source") or {}
    module = str(source.get("module") or "")
    label = _SOURCE_LABEL.get(module)
    return f"from {label}" if label else ""


def _audio_url(entry: dict[str, Any]) -> str:
    return f"/api/v1/media/vocab/{entry.get('id')}.wav"


def build_exercise(
    kind: str,
    entry: dict[str, Any],
    card: dict[str, Any] | None = None,
    *,
    distractors: list[str] | None = None,
    rng: random.Random | None = None,
) -> dict[str, Any]:
    """Render one exercise. Falls back to `flip` when the chosen type is impossible."""
    rng = rng or random
    headword = entry.get("headword") or entry.get("lemma") or ""

    if kind == "cloze":
        cloze = cloze_from_sentence(
            entry.get("own_context_sentence") or "", headword, entry.get("lemma")
        )
        if not cloze["blanks"]:
            kind = "flip"
        else:
            answer = cloze["answers"][0]
            note = _source_note(entry)
            return {
                "type": "cloze",
                "prompt": f"Fill the gap ({note})" if note else "Fill the gap",
                "payload": {
                    "entry_id": entry.get("id"),
                    "masked_sentence": cloze["masked"],
                    "blanks": cloze["blanks"],
                    "hint_first_letter": answer[:1],
                    "hint_length": len(answer),
                    "ipa": entry.get("ipa"),
                    "pos": entry.get("pos"),
                    "audio_url": _audio_url(entry),
                    "definition": entry.get("definition"),
                },
                "expected": sorted({normalize_answer_text(a) for a in cloze["answers"]}),
            }

    if kind == "collocation":
        collocations = list(entry.get("collocations") or [])
        if not collocations:
            kind = "flip"
        else:
            fragments = []
            for phrase in collocations[:4]:
                gapped = cloze_from_sentence(phrase, headword, entry.get("lemma"))
                fragments.append(gapped["masked"] if gapped["blanks"] else phrase)
            options = [headword, *[d for d in (distractors or []) if d and d != headword][:3]]
            rng.shuffle(options)
            return {
                "type": "collocation",
                "prompt": "Which word completes all of these collocations?",
                "payload": {
                    "entry_id": entry.get("id"),
                    "fragments": fragments,
                    "options": options,
                    "definition": entry.get("definition"),
                },
                "expected": [normalize_answer_text(headword)],
            }

    if kind == "use_in_sentence":
        return {
            "type": "use_in_sentence",
            "prompt": f"Write one sentence using **{headword}** about any topic.",
            "payload": {
                "entry_id": entry.get("id"),
                "headword": headword,
                "pos": entry.get("pos"),
                "definition": entry.get("definition"),
                "collocations": entry.get("collocations") or [],
                "checked_by": "llm",
            },
            "expected": None,
        }

    if kind == "audio_recall":
        examples = entry.get("example_sentences") or []
        return {
            "type": "audio_recall",
            "prompt": "Listen and type the word you hear.",
            "payload": {
                "entry_id": entry.get("id"),
                "audio_url": _audio_url(entry),
                "replay_sentence": examples[0] if examples else entry.get("own_context_sentence"),
                "pos": entry.get("pos"),
            },
            "expected": [normalize_answer_text(headword)],
        }

    if kind == "speaking_drill":
        return {
            "type": "speaking_drill",
            "prompt": f"Use **{headword}** naturally in the conversation.",
            "payload": {
                "entry_id": entry.get("id"),
                "headword": headword,
                "definition": entry.get("definition"),
                "injection": (
                    f"Ask the learner a question that invites using the word "
                    f'"{headword}" ({entry.get("pos") or "word"}).'
                ),
            },
            "expected": None,
        }

    note = _source_note(entry)
    return {
        "type": "flip",
        "prompt": headword,
        "payload": {
            "entry_id": entry.get("id"),
            "front": {
                "headword": headword,
                "ipa": entry.get("ipa"),
                "pos": entry.get("pos"),
                "audio_url": _audio_url(entry),
            },
            "back": {
                "definition": entry.get("definition"),
                "own_context_sentence": entry.get("own_context_sentence"),
                "context_note": note,
                "collocations": entry.get("collocations") or [],
                "example_sentences": entry.get("example_sentences") or [],
                "cefr_level": entry.get("cefr_level"),
            },
        },
        "expected": None,
    }


# --------------------------------------------------------------------------------------
# Grading
# --------------------------------------------------------------------------------------


def grade_answer(
    exercise: dict[str, Any],
    answer: str,
    *,
    entry: dict[str, Any] | None = None,
    attempts: int = 1,
    revealed: bool = False,
) -> dict[str, Any]:
    """Auto-check a typed/selected answer and pre-select a rating (§5.2 mapping).

    The rating is only a *default* — FSRS ratings stay learner-final.
    """
    expected: list[str] = list(exercise.get("expected") or [])
    given = normalize_answer_text(answer)
    if not expected:
        return {
            "checked": False,
            "correct": None,
            "close": False,
            "suggested_rating": 3,
            "detail": "Rate yourself.",
            "expected": None,
        }

    correct = bool(given) and given in expected
    close = False
    if not correct and given and entry is not None:
        variants = {
            normalize_answer_text(v)
            for v in word_variants(entry.get("headword") or "", entry.get("lemma"))
        }
        close = given in variants

    if revealed or (not correct and not close):
        rating = 1
        detail = f"The answer is “{expected[0]}”." if expected else "Not quite."
    elif close and not correct:
        rating = 2
        detail = "Almost — check the word form."
    elif attempts > 1:
        rating = 2
        detail = "Correct on the second try."
    else:
        rating = 3
        detail = "Correct."

    return {
        "checked": True,
        "correct": correct,
        "close": close,
        "suggested_rating": rating,
        "detail": detail,
        "expected": expected[0] if expected else None,
    }


# --------------------------------------------------------------------------------------
# LLM-checked `use_in_sentence` (§5.2.3, verbatim prompt)
# --------------------------------------------------------------------------------------

CHECK_SENTENCE_PROMPT = """You are checking whether an IELTS learner used a vocabulary item \
correctly.
Item: "{headword}" ({pos}) — meaning: {definition}
Learner's sentence: "{sentence}"

Judge ONLY: (a) is the item used with its correct meaning, (b) is it grammatically correct in
this sentence including collocation and word form. Ignore unrelated minor errors elsewhere in
the sentence. Do not judge the opinion expressed.

Return ONLY a JSON object:
{{
  "acceptable": true/false,
  "issues": ["each distinct problem in one short sentence; empty if acceptable"],
  "better_version": "the learner's sentence minimally corrected, or an empty string if no
    change is needed"
}}"""


async def check_sentence(
    headword: str,
    sentence: str,
    *,
    pos: str = "other",
    definition: str = "",
) -> dict[str, Any]:
    """Grade a `use_in_sentence` answer with the configured LLM.

    Always returns the §5.2.3 shape; a provider failure degrades to an un-judged result
    rather than raising, so the review session can continue offline.
    """
    from bandready.providers.llm import chat_json

    prompt = CHECK_SENTENCE_PROMPT.format(
        headword=headword, pos=pos or "other", definition=definition or "(no definition yet)",
        sentence=sentence,
    )
    try:
        raw = await chat_json(
            [{"role": "user", "content": prompt}], mock_kind="vocab_check", temperature=0
        )
    except Exception as exc:  # noqa: BLE001 — offline fallback (§5.2.3)
        return {
            "acceptable": None,
            "issues": [],
            "better_version": "",
            "suggested_rating": 3,
            "checked": False,
            "detail": f"Could not reach the language model ({type(exc).__name__}) — rate yourself.",
        }

    acceptable = raw.get("acceptable")
    if not isinstance(acceptable, bool):
        acceptable = str(acceptable).strip().lower() in ("true", "yes", "1")
    issues_raw = raw.get("issues")
    issues = [str(i) for i in issues_raw if str(i).strip()] if isinstance(issues_raw, list) else []
    better = raw.get("better_version")
    return {
        "acceptable": acceptable,
        "issues": issues,
        "better_version": str(better) if isinstance(better, str) else "",
        "suggested_rating": 3 if acceptable else 1,
        "checked": True,
        "detail": "Good use." if acceptable else "Check the highlighted issues.",
    }
