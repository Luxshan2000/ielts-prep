"""THE shared IELTS answer normalizer and matcher (ruling R2-9).

One implementation, imported by **both** the reading module (06 §4.1) and the listening
module (07 §5). Never duplicate any of this — if a rule needs to change, it changes here
and both modules move together.

The rules, in the order they are applied by :func:`answers_match`:

1. **Word limit first.** ``NO MORE THAN TWO WORDS AND/OR A NUMBER`` is checked against the
   learner's *raw* answer, before any article tolerance. An over-limit answer is wrong even
   when it contains the correct words — that is the real IELTS rule, and it is why
   ``the coal mine`` still fails a two-word limit that ``coal mine`` passes.
2. **Normalization** (:func:`normalize_answer`): NFKC → lower → curly quotes and dashes
   folded → thousands separators dropped → punctuation stripped (hyphen and apostrophe
   survive) → whitespace collapsed → number words turned into digits → ``%`` ≡ ``percent``,
   ``$N`` ≡ ``N dollars``.
3. **Variant-aware article rule (R2-9, 07 §5 wins over 06's earlier unconditional strip).**
   The learner's leading ``a``/``an``/``the`` is stripped **only if every stored variant also
   lacks one**. If any keyed variant was authored with an article, the comparison stays
   literal.
4. **Hyphen ≡ space.** ``well being`` matches ``well-being``. The closed form ``wellbeing``
   matches only when it is authored as a variant (06 §4.1 locked default).
5. **Exact spelling.** There is no fuzzy matching, no edit distance, no auto US/UK
   equivalence: ``enviroment`` is wrong. US/UK pairs are accepted only when they are
   *authored* as variants — :func:`spelling_variants` is what the generation and import
   pipelines use to add them, and it is deliberately not called at match time.
6. **Letter answers** (multiple choice, matching, bank completion) are compared as
   upper-cased letter sets, order-insensitive. TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN
   accept ``T``/``F``/``NG``/``N.G.`` and any casing.

Public surface::

    normalize_answer(s, variants=None) -> str
    answers_match(given, accepted, question_type=None, word_limit=None) -> bool
    count_words(s) -> int
    within_word_limit(s, word_limit) -> bool
    expand_variants(values) -> list[str]
    spelling_variants(value) -> list[str]
    instruction_for(word_limit) -> str
    normalize_letters(s) -> list[str]
    near_miss(given, accepted) -> bool
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

__all__ = [
    "CHOICE_TYPES",
    "LETTER_TYPES",
    "MULTI_TYPES",
    "TEXT_TYPES",
    "US_UK_PAIRS",
    "answers_match",
    "count_words",
    "expand_variants",
    "instruction_for",
    "near_miss",
    "normalize_answer",
    "normalize_letters",
    "spelling_variants",
    "strip_leading_article",
    "within_word_limit",
    "word_limit_of",
]

# --------------------------------------------------------------------------------------
# Question-type families
# --------------------------------------------------------------------------------------

#: Types whose answer is one or more letters / roman numerals from a fixed option list
#: (06 §2 types 1, 4, 5, 6, 7, 9, 14; 07 §5 ``multiple_choice`` and ``matching``).
LETTER_TYPES: frozenset[str] = frozenset(
    {
        "multiple_choice",
        "multiple_choice_multi",
        "matching_headings",
        "matching_information",
        "matching_features",
        "matching_sentence_endings",
        "summary_completion_bank",
        "list_selection",
        "matching",
    }
)

#: Letter types where the *set* of chosen letters is the answer ("Choose TWO letters").
MULTI_TYPES: frozenset[str] = frozenset({"multiple_choice_multi", "list_selection"})

#: The three-way judgement types.
CHOICE_TYPES: frozenset[str] = frozenset({"true_false_not_given", "yes_no_not_given"})

#: Free-text types — everything the learner types in their own characters.
TEXT_TYPES: frozenset[str] = frozenset(
    {
        "sentence_completion",
        "summary_completion",
        "note_completion",
        "table_completion",
        "flow_chart_completion",
        "form_completion",
        "diagram_labelling",
        "map_labelling",
        "short_answer",
    }
)

# --------------------------------------------------------------------------------------
# Character-level folding
# --------------------------------------------------------------------------------------

_QUOTES = {
    "‘": "'",
    "’": "'",
    "‚": "'",
    "′": "'",
    "“": '"',
    "”": '"',
    "„": '"',
}
_DASHES = {
    "‐": "-",
    "‑": "-",
    "‒": "-",
    "–": "-",
    "—": "-",
    "―": "-",
    "−": "-",
}

#: Everything removed outright. Hyphen, apostrophe, slash, ``$``, ``%`` and ``&`` survive:
#: the first two carry meaning inside words, the rest are handled by dedicated rules.
_STRIP_PUNCT = re.compile(r"[.,;:!?\"“”«»()\[\]{}*_·•]")
_THOUSANDS = re.compile(r"(\d),(\d{3})(?=\D|$)")
#: Decimal points and clock colons sit between digits and must survive punctuation removal
#: (``3.5`` and ``9:30`` are single answers, not two).
_INNER_NUMERIC = re.compile(r"(\d)([.:])(\d)")
_INNER_SENTINELS = {".": "\x00", ":": "\x01"}
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_CURRENCY = re.compile(r"([$£€])\s*(\d+(?:[.,]\d+)?)")
_CURRENCY_WORD = {"$": "dollars", "£": "pounds", "€": "euros"}
_WS = re.compile(r"\s+")

_ARTICLES = ("a ", "an ", "the ")


def _fold(raw: str) -> str:
    """NFKC + lower + quote/dash folding + whitespace collapse. No token surgery yet."""
    s = unicodedata.normalize("NFKC", str(raw or "")).strip().lower()
    for src, dst in _QUOTES.items():
        s = s.replace(src, dst)
    for src, dst in _DASHES.items():
        s = s.replace(src, dst)
    return _WS.sub(" ", s).strip()


def _clean(raw: str) -> str:
    """:func:`_fold` plus thousands separators and punctuation removal.

    This is the form the word counter counts, so ``$40`` and ``well-being`` are still
    single tokens here.
    """
    s = _fold(raw)
    for _ in range(4):  # 1,250,000 needs one pass per separator (the groups overlap)
        replaced = _THOUSANDS.sub(r"\1\2", s)
        if replaced == s:
            break
        s = replaced
    for _ in range(3):  # 12.34.56 needs more than one pass
        s = _INNER_NUMERIC.sub(lambda m: m.group(1) + _INNER_SENTINELS[m.group(2)] + m.group(3), s)
    s = _STRIP_PUNCT.sub(" ", s)
    for char, sentinel in _INNER_SENTINELS.items():
        s = s.replace(sentinel, char)
    s = _WS.sub(" ", s).strip()
    # Surrounding apostrophes/slashes/hyphens are decoration, not spelling (07 §5 step 1).
    return s.strip("'/-").strip()


# --------------------------------------------------------------------------------------
# Numbers
# --------------------------------------------------------------------------------------

_UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9,
}
_TEENS = {
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90,
}
_SCALES = {"hundred": 100, "thousand": 1000, "million": 1_000_000}
_NUMBER_WORDS: dict[str, int] = {**_UNITS, **_TEENS, **_TENS}

_DIGIT_TOKEN = re.compile(r"^[$£€]?\d+(?:[.:/-]\d+)*(?:%|st|nd|rd|th|s)?$")


def _number_word_parts(token: str) -> list[str] | None:
    """Split a token into number words, or ``None`` if it is not purely numeric words."""
    parts = [p for p in token.split("-") if p]
    if not parts:
        return None
    if all(p in _NUMBER_WORDS or p in _SCALES for p in parts):
        return parts
    return None


def is_number_token(token: str) -> bool:
    """True when the token reads as a number — ``72``, ``$40``, ``1990s``, ``seventy-two``."""
    if not token:
        return False
    if _DIGIT_TOKEN.match(token):
        return True
    return _number_word_parts(token) is not None


def _run_value(words: Sequence[str]) -> int | None:
    """Value of a run of number words. Handles ``eighteen ninety two`` → ``1892``."""
    if not words:
        return None
    if any(w in _SCALES for w in words):
        total = 0
        current = 0
        for w in words:
            if w in _SCALES:
                scale = _SCALES[w]
                current = max(current, 1) * scale
                if scale >= 1000:
                    total += current
                    current = 0
            elif w in _NUMBER_WORDS:
                current += _NUMBER_WORDS[w]
            else:  # "and"
                continue
        return total + current

    groups: list[int] = []
    current: int | None = None
    prev_kind = ""
    for w in words:
        if w == "and":
            continue
        if w not in _NUMBER_WORDS:
            return None
        kind = "tens" if w in _TENS else ("teen" if w in _TEENS else "unit")
        starts_group = (
            current is None
            or kind in ("tens", "teen")
            or prev_kind in ("unit", "teen")
        )
        if starts_group:
            if current is not None:
                groups.append(current)
            current = _NUMBER_WORDS[w]
        else:  # tens followed by a unit — same group ("twenty two" → 22)
            current += _NUMBER_WORDS[w]
        prev_kind = kind
    if current is not None:
        groups.append(current)
    if not groups:
        return None
    if len(groups) == 1:
        return groups[0]
    # Year reading, 07 §5 step 4's safety net: "eighteen ninety-two" → 1892.
    if len(groups) == 2 and 10 <= groups[0] <= 99 and 0 <= groups[1] <= 99:
        return groups[0] * 100 + groups[1]
    return sum(groups)


def _number_words_to_digits(s: str) -> str:
    """Rewrite every maximal run of number words as digits."""
    tokens = s.split(" ")
    out: list[str] = []
    run: list[str] = []
    run_raw: list[str] = []

    def flush() -> None:
        if not run:
            return
        value = _run_value(run)
        out.append(str(value) if value is not None else " ".join(run_raw))
        run.clear()
        run_raw.clear()

    for tok in tokens:
        parts = _number_word_parts(tok)
        if parts is not None:
            run.extend(parts)
            run_raw.append(tok)
            continue
        if tok == "and" and run:
            # "one hundred and twenty" — only bridge when a scale word is in play.
            run.append("and")
            run_raw.append(tok)
            continue
        flush()
        out.append(tok)
    flush()
    # A trailing bridging "and" that never got a number after it must come back.
    return _WS.sub(" ", " ".join(out)).strip()


# --------------------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------------------

def strip_leading_article(s: str) -> str:
    """Drop a leading ``a ``/``an ``/``the ``. Never strips a bare ``a``/``the``."""
    for art in _ARTICLES:
        if s.startswith(art):
            return s[len(art):].strip()
    return s


def _has_leading_article(s: str) -> bool:
    return s.startswith(_ARTICLES)


def normalize_answer(
    s: str, variants: Iterable[Any] | None = None
) -> str:
    """Canonical comparison form of one answer (06 §4.1 / 07 §5 step 1).

    ``variants`` enables the variant-aware article rule: pass the question's accepted
    values and the leading article is stripped only when **every** normalized variant is
    itself article-free. Omit it (the default) for pure normalization — e.g. when storing
    ``reading_answers.normalized`` for a letter answer.
    """
    out = _clean(s)
    out = _number_words_to_digits(out)
    out = _PERCENT.sub(lambda m: f"{m.group(1)} percent", out)
    out = _CURRENCY.sub(lambda m: f"{m.group(2)} {_CURRENCY_WORD[m.group(1)]}", out)
    out = _WS.sub(" ", out).strip()
    if variants is not None:
        keys = [normalize_answer(v) for v in _values_of(variants)]
        if keys and not any(_has_leading_article(k) for k in keys):
            out = strip_leading_article(out)
    return out


def _match_key(normalized: str) -> str:
    """Hyphen ≡ space (06 §4.1). Applied to both sides at comparison time only."""
    return _WS.sub(" ", normalized.replace("-", " ")).strip()


# --------------------------------------------------------------------------------------
# Word limits
# --------------------------------------------------------------------------------------

WordLimit = Mapping[str, Any]


def word_limit_of(value: Any) -> dict[str, Any] | None:
    """Coerce whatever the content bank stored into ``{max_words, numbers_allowed}``.

    Accepts the 06 §2.1 object, a bare int (``2`` → two words, numbers allowed) and the
    07 §5 shape ``{"words": 1, "numbers": 1}``. ``None`` means "no limit".
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return {"max_words": int(value), "numbers_allowed": True}
    if isinstance(value, Mapping):
        if "max_words" in value:
            return {
                "max_words": int(value.get("max_words") or 0),
                "numbers_allowed": bool(value.get("numbers_allowed", True)),
            }
        if "words" in value:
            return {
                "max_words": int(value.get("words") or 0),
                "numbers_allowed": bool(value.get("numbers", 1)),
            }
    return None


def _tokens(raw: str) -> list[str]:
    cleaned = _clean(raw)
    return [t for t in cleaned.split(" ") if t]


def count_words(raw: str) -> int:
    """IELTS word count: hyphenated compound = 1, contraction = 1, number = 1."""
    return len(_tokens(raw))


def within_word_limit(raw: str, word_limit: Any) -> bool:
    """``True`` when the raw answer respects ``NO MORE THAN N WORDS [AND/OR A NUMBER]``.

    ``AND/OR A NUMBER`` means *one number in addition to* the word allowance, so a
    two-word limit accepts ``ceramic jars`` and ``40 ceramic jars`` but not
    ``the ceramic jars`` (articles are words, 06 §2.1).
    """
    limit = word_limit_of(word_limit)
    if limit is None:
        return True
    tokens = _tokens(raw)
    if not tokens:
        return True  # blank is "unanswered", not "over the limit"
    max_words = max(0, int(limit["max_words"]))
    if not limit["numbers_allowed"]:
        return len(tokens) <= max_words
    words = 0
    numbers = 0
    prev_number = False
    for tok in tokens:
        if is_number_token(tok):
            if not prev_number:  # "twenty two" is one number, not two
                numbers += 1
            prev_number = True
        else:
            words += 1
            prev_number = False
    return words <= max_words and numbers <= 1


def instruction_for(word_limit: Any) -> str:
    """Render the 06 §2.1 instruction string. Never hand-type these."""
    limit = word_limit_of(word_limit)
    if limit is None:
        return ""
    max_words = int(limit["max_words"])
    numbers = bool(limit["numbers_allowed"])
    if max_words <= 0:
        return "Write A NUMBER for each answer."
    if max_words == 1:
        return (
            "Write ONE WORD AND/OR A NUMBER for each answer."
            if numbers
            else "Write ONE WORD ONLY for each answer."
        )
    names = {2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE"}
    word = names.get(max_words, str(max_words))
    return (
        f"Write NO MORE THAN {word} WORDS AND/OR A NUMBER for each answer."
        if numbers
        else f"Write NO MORE THAN {word} WORDS for each answer."
    )


# --------------------------------------------------------------------------------------
# Variants
# --------------------------------------------------------------------------------------

def _values_of(accepted: Any) -> list[str]:
    """Pull raw strings out of whatever the caller passed (str, list, ``[{"value": …}]``)."""
    if accepted is None:
        return []
    if isinstance(accepted, str):
        return [accepted]
    if isinstance(accepted, Mapping):
        return [str(accepted.get("value", ""))]
    out: list[str] = []
    for item in accepted:
        if isinstance(item, Mapping):
            out.append(str(item.get("value", "")))
        elif isinstance(item, (list, tuple)):
            out.extend(_values_of(item))
        else:
            out.append(str(item))
    return [v for v in out if v.strip()]


_PAREN = re.compile(r"\(([^()]*)\)")


def _expand_parens(value: str) -> list[str]:
    """``(sea) turtles`` → ``["sea turtles", "turtles"]``, recursively for several groups."""
    match = _PAREN.search(value)
    if not match:
        return [value]
    inner = match.group(1).strip()
    head, tail = value[: match.start()], value[match.end():]
    out: list[str] = []
    for replacement in (inner, ""):
        candidate = _WS.sub(" ", f"{head}{replacement}{tail}").strip()
        out.extend(_expand_parens(candidate))
    seen: dict[str, None] = {}
    for item in out:
        if item:
            seen.setdefault(item, None)
    return list(seen)


def expand_variants(accepted: Any) -> list[str]:
    """Every concrete string a keyed answer stands for.

    Expands parenthesized optionals and authored slash alternatives; the original form is
    always kept so ``km/h`` still matches itself.
    """
    out: list[str] = []
    for value in _values_of(accepted):
        for expanded in _expand_parens(value):
            out.append(expanded)
            if "/" in expanded:
                out.extend(p.strip() for p in expanded.split("/") if p.strip())
    seen: dict[str, None] = {}
    for item in out:
        if item.strip():
            seen.setdefault(item.strip(), None)
    return list(seen)


#: ~40 US/UK pairs (07 §5). Used by the generator and the content validator to *author*
#: variants — deliberately NOT consulted at match time (06 §4.1: "accepted only if
#: authored as variants").
US_UK_PAIRS: tuple[tuple[str, str], ...] = (
    ("centre", "center"), ("theatre", "theater"), ("metre", "meter"),
    ("litre", "liter"), ("fibre", "fiber"), ("calibre", "caliber"),
    ("colour", "color"), ("favour", "favor"), ("flavour", "flavor"),
    ("harbour", "harbor"), ("honour", "honor"), ("labour", "labor"),
    ("neighbour", "neighbor"), ("behaviour", "behavior"), ("humour", "humor"),
    ("odour", "odor"), ("rumour", "rumor"), ("vapour", "vapor"),
    ("organise", "organize"), ("realise", "realize"), ("recognise", "recognize"),
    ("analyse", "analyze"), ("apologise", "apologize"), ("specialise", "specialize"),
    ("emphasise", "emphasize"), ("summarise", "summarize"), ("civilisation", "civilization"),
    ("organisation", "organization"), ("catalogue", "catalog"), ("dialogue", "dialog"),
    ("programme", "program"), ("defence", "defense"), ("offence", "offense"),
    ("licence", "license"), ("practise", "practice"), ("travelled", "traveled"),
    ("travelling", "traveling"), ("labelled", "labeled"), ("modelling", "modeling"),
    ("aluminium", "aluminum"), ("grey", "gray"), ("plough", "plow"),
    ("storey", "story"), ("tyre", "tire"), ("cheque", "check"),
    ("ageing", "aging"), ("jewellery", "jewelry"), ("moustache", "mustache"),
    ("archaeology", "archeology"), ("paediatric", "pediatric"),
)

_US_UK_LOOKUP: dict[str, str] = {}
for _uk, _us in US_UK_PAIRS:
    _US_UK_LOOKUP[_uk] = _us
    _US_UK_LOOKUP[_us] = _uk


def spelling_variants(value: str) -> list[str]:
    """The US/UK partner spellings of ``value`` (empty when there is no known pair).

    Authoring/generation helper (06 §7 stage 4, 07 §5). The runtime matcher never calls it.
    """
    tokens = _clean(value).split(" ")
    hits = [(i, _US_UK_LOOKUP[t]) for i, t in enumerate(tokens) if t in _US_UK_LOOKUP]
    if not hits:
        return []
    swapped = list(tokens)
    for index, replacement in hits:
        swapped[index] = replacement
    partner = " ".join(swapped)
    return [partner] if partner != " ".join(tokens) else []


# --------------------------------------------------------------------------------------
# Letter / choice answers
# --------------------------------------------------------------------------------------

_LETTER_SPLIT = re.compile(r"[^A-Za-z0-9]+")


def normalize_letters(raw: str) -> list[str]:
    """Upper-cased option keys in a learner's answer: ``"a, c"`` → ``["A", "C"]``."""
    folded = _fold(raw)
    parts = [p for p in _LETTER_SPLIT.split(folded) if p]
    if len(parts) == 1 and len(parts[0]) > 1 and parts[0].isalpha():
        token = parts[0]
        # "AC" as a multi-select shorthand, but never split roman numerals or words.
        if _roman_value(token) is None and len(token) <= 4 and _looks_like_letter_run(token):
            parts = list(token)
    return sorted({p.upper() for p in parts})


def _looks_like_letter_run(token: str) -> bool:
    return all(c in "abcdefgh" for c in token) and len(set(token)) == len(token)


_ROMAN = re.compile(r"^(?=[ivxl])i{0,3}v?i{0,3}x{0,3}v?i{0,3}$")


def _roman_value(token: str) -> int | None:
    return 1 if _ROMAN.match(token.lower()) else None


_TFNG_CANON = {
    "true_false_not_given": {
        "t": "TRUE", "true": "TRUE",
        "f": "FALSE", "false": "FALSE",
        "ng": "NOT GIVEN", "notgiven": "NOT GIVEN", "ngiven": "NOT GIVEN",
    },
    "yes_no_not_given": {
        "y": "YES", "yes": "YES",
        "n": "NO", "no": "NO",
        "ng": "NOT GIVEN", "notgiven": "NOT GIVEN", "ngiven": "NOT GIVEN",
    },
}


def canonical_choice(raw: str, question_type: str) -> str:
    """``"n.g."`` → ``"NOT GIVEN"``. Empty string when the token is not a valid choice."""
    key = re.sub(r"[^a-z]", "", _fold(raw))
    return _TFNG_CANON.get(question_type, {}).get(key, "")


# --------------------------------------------------------------------------------------
# The matcher
# --------------------------------------------------------------------------------------

def answers_match(
    given: Any,
    accepted: Any,
    question_type: str | None = None,
    word_limit: Any = None,
) -> bool:
    """Is ``given`` a correct answer for a question keyed with ``accepted``?

    ``accepted`` may be a string, a list of strings, or the content bank's
    ``[{"value": "…"}, …]`` shape. For :data:`MULTI_TYPES` a multi-entry ``accepted``
    is the *required set* of letters and is compared order-insensitively; for every other
    type the entries are alternatives.
    """
    raw = "" if given is None else str(given)
    if not raw.strip():
        return False
    values = expand_variants(accepted)
    if not values:
        return False

    qtype = (question_type or "").strip()

    if qtype in CHOICE_TYPES:
        chosen = canonical_choice(raw, qtype)
        if not chosen:
            return False
        return any(canonical_choice(v, qtype) == chosen for v in values)

    if qtype in LETTER_TYPES:
        chosen_letters = set(normalize_letters(raw))
        if not chosen_letters:
            return False
        variant_sets = [set(normalize_letters(v)) for v in values if normalize_letters(v)]
        if not variant_sets:
            return False
        if qtype in MULTI_TYPES and len(variant_sets) > 1 and all(
            len(v) == 1 for v in variant_sets
        ):
            required: set[str] = set()
            for one in variant_sets:
                required |= one
            return chosen_letters == required
        return any(chosen_letters == one for one in variant_sets)

    # Free text — word limit first, then normalization, then exact set membership.
    if word_limit is not None and not within_word_limit(raw, word_limit):
        return False
    normalized = normalize_answer(raw, variants=values)
    keys = {_match_key(normalize_answer(v)) for v in values}
    return _match_key(normalized) in keys


# --------------------------------------------------------------------------------------
# Near-miss tagging (07 §5 "spelling leaks" panel — never affects correctness)
# --------------------------------------------------------------------------------------

def _levenshtein(a: str, b: str, cap: int = 3) -> int:
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb))
            )
        previous = current
    return previous[-1]


def near_miss(given: Any, accepted: Any, max_distance: int = 2) -> bool:
    """A wrong answer that is 1–2 edits from a keyed variant — a spelling leak, not a match.

    Scoring never calls this to award a point; it only tags the attempt detail.
    """
    raw = "" if given is None else str(given)
    if not raw.strip():
        return False
    normalized = _match_key(normalize_answer(raw))
    for value in expand_variants(accepted):
        key = _match_key(normalize_answer(value))
        if not key or key == normalized:
            continue
        if 0 < _levenshtein(normalized, key, cap=max_distance) <= max_distance:
            return True
    return False
