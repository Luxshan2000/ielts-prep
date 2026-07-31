"""Structure detectors, keyed by ``structure_slug`` (grammar `DESIGN.md` §0.4 D4).

Check A of free-production grading — *does the sentence contain the target structure?* —
is answered **mechanically, here**, and the model is then *told* the answer rather than
asked for it (§2.9). That single move is what stops the judge hallucinating a missing
present perfect out of a sentence that plainly has one.

Two rules govern everything in this file.

**A miss is our bug, never the learner's error.** Every detector is written to be
conservative: it fires when it is confident, and when it does not fire the caller falls
back to asking the model which structure the writer used, and accepts if the answer is the
target. So a false negative costs one extra model call and a logged detector gap. A false
*positive* is worse — it lets a wrong sentence through check A — so patterns are anchored
and never match on a bare keyword.

**No regex ever reaches a content pack.** The slug is the whole interface. A point
declaring a slug with no detector here is a lint failure at merge time, so the set below
is the closed list of 31 from §2.8 and adding to it is a code change with a test.
"""

from __future__ import annotations

import re
from collections.abc import Callable

__all__ = [
    "STRUCTURE_SLUGS",
    "describe",
    "detect",
    "has_detector",
]

# --------------------------------------------------------------------------------------
# Lexical building blocks
# --------------------------------------------------------------------------------------

#: Irregular past participles common enough to matter in exam-shaped writing. The list is
#: short on purpose: a regular ``-ed``/``-en`` ending covers the rest, and a participle we
#: fail to recognise costs a fallback call, not a rejection.
_IRREGULAR_PARTICIPLES = {
    "been", "become", "begun", "broken", "brought", "built", "bought", "caught", "chosen",
    "come", "cost", "cut", "done", "drawn", "driven", "eaten", "fallen", "felt", "fought",
    "found", "given", "gone", "grown", "had", "heard", "held", "hit", "kept", "known",
    "laid", "led", "left", "lent", "let", "lost", "made", "meant", "met", "paid", "put",
    "read", "run", "said", "seen", "sent", "set", "shown", "shut", "sold", "sought",
    "spent", "spoken", "split", "spread", "stood", "taken", "taught", "thought", "thrown",
    "told", "understood", "won", "written", "dealt", "drunk", "risen", "shaken", "hidden",
}

#: Irregular past-simple forms. Overlap with the participles above is real and harmless —
#: ``past_simple`` only has to be sure it is looking at a finite past verb.
_IRREGULAR_PAST = {
    "was", "were", "had", "did", "said", "went", "made", "took", "came", "saw", "knew",
    "got", "gave", "found", "thought", "told", "became", "left", "felt", "put", "brought",
    "began", "kept", "held", "wrote", "stood", "heard", "let", "meant", "set", "met",
    "ran", "paid", "sat", "spoke", "lay", "led", "grew", "lost", "fell", "sent", "built",
    "understood", "drew", "broke", "spent", "cut", "rose", "drove", "bought", "wore",
    "chose", "sought", "taught", "caught", "fought", "threw", "shut", "sold", "dealt",
}

_BE = r"(?:am|is|are|was|were|be|been|being|'m|'re|'s)"
_BE_FINITE = r"(?:am|is|are|was|were|'m|'re|'s)"
_HAVE_PRESENT = r"(?:have|has|'ve|'s)"
_HAVE_PAST = r"(?:had|'d)"
_MODAL = r"(?:will|would|shall|should|can|could|may|might|must|ought to|'ll|'d)"
_MODAL_NO_D = r"(?:will|would|shall|should|can|could|may|might|must|ought to|'ll)"
_ADV = r"(?:\s+(?:not|n't|never|already|just|always|still|recently|only|also|ever|yet))*"
_PREPOSITION = (
    r"(?:about|after|against|at|before|besides|between|by|despite|for|from|in|"
    r"instead of|into|of|on|through|to|towards|under|upon|with|without)"
)

_PARTICIPLE_RE = re.compile(r"\b(\w+(?:ed|en))\b")


def _norm(text: str) -> str:
    """Lowercase with curly apostrophes flattened; punctuation is preserved.

    The comma is load-bearing for ``relative_non_defining`` and ``participle_clause``, so
    unlike the answer normaliser this one keeps it.
    """
    return re.sub(r"\s+", " ", (text or "").replace("’", "'")).strip().lower()


def _is_participle(word: str) -> bool:
    w = word.strip("'").lower()
    if w in _IRREGULAR_PARTICIPLES:
        return True
    return bool(re.fullmatch(r"\w{3,}(?:ed|en)", w)) and w not in ("been", "seen")


def _participle_after(text: str, pattern: str) -> bool:
    """True when a past participle follows ``pattern`` within one adverb's distance."""
    for match in re.finditer(pattern + _ADV + r"\s+([\w']+)", text):
        if _is_participle(match.group(1)):
            return True
    return False


# --------------------------------------------------------------------------------------
# Detectors, one per slug
# --------------------------------------------------------------------------------------


def _present_perfect(t: str) -> bool:
    if _present_perfect_continuous(t):
        return False
    return _participle_after(t, r"\b" + _HAVE_PRESENT)


def _present_perfect_continuous(t: str) -> bool:
    return bool(re.search(r"\b" + _HAVE_PRESENT + _ADV + r"\s+been\s+\w+ing\b", t))


def _past_perfect(t: str) -> bool:
    if _past_perfect_continuous(t):
        return False
    return _participle_after(t, r"\b" + _HAVE_PAST)


def _past_perfect_continuous(t: str) -> bool:
    return bool(re.search(r"\b" + _HAVE_PAST + _ADV + r"\s+been\s+\w+ing\b", t))


def _present_continuous(t: str) -> bool:
    return bool(re.search(r"\b(?:am|is|are|'m|'re|'s)" + _ADV + r"\s+\w+ing\b", t))


def _past_continuous(t: str) -> bool:
    return bool(re.search(r"\b(?:was|were)" + _ADV + r"\s+\w+ing\b", t))


def _past_simple(t: str) -> bool:
    # A finite past verb that is not part of a perfect, a passive or a continuous.
    if re.search(r"\b(?:was|were)\b(?!\s+\w+(?:ing\b|ed\b|en\b))", t):
        return True
    for match in re.finditer(r"\b([\w']+)\b", t):
        word = match.group(1)
        if word in _IRREGULAR_PAST and word not in ("was", "were", "had"):
            return True
    for match in _PARTICIPLE_RE.finditer(t):
        start = match.start()
        before = t[max(0, start - 30):start]
        if re.search(
            r"\b(?:have|has|had|'ve|'s|'d|am|is|are|was|were|be|been|being|" + _MODAL_NO_D + r")\s*$",
            before,
        ):
            continue
        if match.group(1).endswith("ed"):
            return True
    return False


def _present_simple(t: str) -> bool:
    """The default tense: it fires when no other finite marker does.

    Written as an elimination rather than as a positive pattern, because "a verb with no
    tense marking on it" has no shape a regex can see. Every competing detector runs
    first, so a false positive requires a sentence with no tense marker at all.
    """
    if (
        _present_continuous(t)
        or _present_perfect(t)
        or _present_perfect_continuous(t)
        or _past_simple(t)
        or _past_continuous(t)
        or _past_perfect(t)
        or _future_will(t)
        or _future_going_to(t)
        or _modal_simple(t)
    ):
        return False
    if re.search(r"\b(?:do|does|don't|doesn't|am|is|are|'m|'re|'s)\b", t):
        return True
    if re.search(
        r"\b(?:i|you|we|they|people|he|she|it|this|that)\s+"
        r"(?:not\s+|never\s+|often\s+|always\s+|usually\s+|rarely\s+)?[a-z']{2,}\b",
        t,
    ):
        return True
    # Nothing else marks tense, so an -s form here is a third-person verb (or a plural
    # subject whose verb is a bare form, which is the same tense either way).
    return bool(re.search(r"\b\w{3,}s\b", t))


def _future_will(t: str) -> bool:
    return bool(re.search(r"\b(?:will|'ll|won't)\b(?!\s+have\s+\w+(?:ed|en)\b)", t))


def _future_going_to(t: str) -> bool:
    return bool(re.search(r"\b" + _BE_FINITE + r"\s+going\s+to\s+\w+", t))


def _future_continuous(t: str) -> bool:
    return bool(re.search(r"\b(?:will|'ll)" + _ADV + r"\s+be\s+\w+ing\b", t))


def _future_perfect(t: str) -> bool:
    return _participle_after(t, r"\b(?:will|'ll)" + _ADV + r"\s+have")


def _used_to(t: str) -> bool:
    return bool(re.search(r"\bused\s+to\s+[\w']+\b", t)) and not re.search(
        r"\b(?:am|is|are|was|were|get|gets|got|getting)\s+used\s+to\b", t
    )


def _passive_any(t: str) -> bool:
    """``be`` + past participle. The participle must not be the gerund of the same verb."""
    for match in re.finditer(r"\b" + _BE + _ADV + r"\s+([\w']+)", t):
        word = match.group(1)
        if word in ("going", "being"):
            continue
        if _is_participle(word):
            return True
    return False


def _passive_agentless(t: str) -> bool:
    if not _passive_any(t):
        return False
    return not re.search(r"\bby\s+(?:the|a|an|his|her|its|their|our|my|\w+)\s*[\w']*", t)


def _causative_have_get(t: str) -> bool:
    """``have``/``get`` + an object + a past participle — *we had the roof repaired*.

    The object is what separates this from the perfect (``we had repaired the roof``), so
    the participle must be at least one word further along, and the search stops at the
    first clause boundary rather than reaching into the next clause for a participle that
    belongs to something else.
    """
    for match in re.finditer(r"\b(?:have|has|had|having|get|gets|got|getting)\b", t):
        clause = re.split(r"[,.;:]|\b(?:and|but|because|so|which|that|who)\b", t[match.end():])[0]
        words = re.findall(r"[\w']+", clause)[:5]
        for index, word in enumerate(words):
            if index == 0:
                continue  # directly after have/get is the perfect, not the causative
            if _is_participle(word):
                return True
    return False


def _modal_simple(t: str) -> bool:
    if _modal_perfect(t):
        return False
    return bool(re.search(r"\b" + _MODAL + _ADV + r"\s+(?:be\s+)?[\w']+", t))


def _modal_perfect(t: str) -> bool:
    return _participle_after(t, r"\b" + _MODAL + _ADV + r"\s+(?:have|'ve)(?:\s+been)?")


def _conditional_real(t: str) -> bool:
    if _conditional_unreal_present(t) or _conditional_unreal_past(t):
        return False
    return bool(
        re.search(r"\b(?:if|unless|when|as long as|provided that)\b", t)
        and re.search(r"\b(?:will|'ll|won't|can|may|might|should|must)\b", t)
    )


def _conditional_unreal_present(t: str) -> bool:
    if _conditional_unreal_past(t):
        return False
    if not re.search(r"\b(?:if|unless|suppose|supposing)\b", t):
        return False
    return bool(
        re.search(r"\b(?:would|'d|could|might)\s+(?!have\b)[\w']+", t)
        and re.search(r"\b(?:were|was|had|did|" + r"[\w]+ed" + r")\b", t)
    )


def _conditional_unreal_past(t: str) -> bool:
    if not re.search(r"\b(?:if|had)\b", t):
        return False
    has_if_past_perfect = bool(re.search(r"\bif\s+[\w\s]{0,20}?\b(?:had|'d)\s+[\w']+", t)) or bool(
        re.search(r"^\s*had\s+(?:the\s+|a\s+|an\s+)?[\w\s]{0,20}?\b[\w']+", t)
    )
    return has_if_past_perfect and _participle_after(t, r"\b(?:would|could|might|'d)\s+have")


def _wish_unreal(t: str) -> bool:
    if not re.search(r"\b(?:wish|wishes|wished|if only)\b", t):
        return False
    return bool(
        re.search(r"\b(?:wish|wishes|wished|only)\s+[\w\s]{0,20}?\b(?:were|was|had|would|could|didn't|weren't)\b", t)
        or re.search(r"\b(?:wish|wishes|wished)\s+[\w\s]{0,15}?\b\w+ed\b", t)
    )


def _relative_defining(t: str) -> bool:
    return bool(re.search(r"(?<![,])\s\b(?:who|which|that|whom|whose)\s+[\w']+", t))


def _relative_non_defining(t: str) -> bool:
    return bool(re.search(r",\s*(?:who|which|whom|whose)\s+[\w']+", t))


def _participle_clause(t: str) -> bool:
    return bool(
        re.match(r"^\s*(?:having\s+)?[\w']+(?:ing|ed|en)\b[^,]{0,60},", t)
        or re.search(r",\s*(?:having\s+)?[\w']+ing\b", t)
    )


def _noun_clause_that(t: str) -> bool:
    return bool(
        re.search(
            r"\b(?:say|says|said|think|thinks|thought|believe|believes|argue|argues|argued|"
            r"suggest|suggests|suggested|know|knows|knew|show|shows|showed|shown|mean|means|"
            r"claim|claims|claimed|note|notes|noted|report|reports|reported|admit|admits|"
            r"admitted|agree|agrees|agreed|fact|idea|view|belief|point)\s+that\s+[\w']+",
            t,
        )
    )


def _embedded_question(t: str) -> bool:
    return bool(
        re.search(
            r"\b(?:know|knows|knew|wonder|wonders|wondered|ask|asks|asked|tell|tells|told|"
            r"sure|idea|remember|remembers|explain|explains|explained|understand|understands|"
            r"depends on|depend on|matter)\s+(?:me\s+|us\s+|him\s+|her\s+|them\s+)?"
            r"(?:what|where|when|why|how|who|whether|if)\s+[\w']+",
            t,
        )
    )


def _reported_speech(t: str) -> bool:
    return bool(
        re.search(
            r"\b(?:said|told|asked|explained|admitted|claimed|mentioned|replied|insisted|"
            r"warned|added|argued|announced)\b"
            r"(?:\s+(?:me|us|him|her|them|the\s+\w+|us\s+that))?\s*(?:that|if|whether)?\s+[\w']+",
            t,
        )
    ) and not re.search(r"[\"“]", t)


def _gerund_after_preposition(t: str) -> bool:
    return bool(re.search(r"\b" + _PREPOSITION + r"\s+[\w']*ing\b", t))


def _comparative(t: str) -> bool:
    return bool(
        re.search(r"\b(?:more|less)\s+[\w']+\s+than\b", t)
        or re.search(r"\b\w{3,}(?:er)\s+than\b", t)
        or re.search(r"\bas\s+[\w']+\s+as\b", t)
        or re.search(r"\bthe\s+(?:most|least|\w{3,}est)\b", t)
    )


def _cleft(t: str) -> bool:
    return bool(
        re.search(r"\bit\s+(?:is|was|'s)\s+[\w\s,'\-]{2,40}?\s+(?:that|who|which)\b", t)
        or re.match(r"^\s*what\s+[\w\s,'\-]{2,40}?\s+(?:is|was|are|were)\b", t)
        or re.search(r"\bthe\s+(?:reason|thing|place|person|way|point)\s+[\w\s,'\-]{2,40}?\s+(?:is|was)\b", t)
        or re.search(r"\ball\s+(?:that\s+)?[\w\s,'\-]{2,30}?\s+(?:is|was)\b", t)
    )


_DETECTORS: dict[str, Callable[[str], bool]] = {
    "present_simple": _present_simple,
    "present_continuous": _present_continuous,
    "present_perfect": _present_perfect,
    "present_perfect_continuous": _present_perfect_continuous,
    "past_simple": _past_simple,
    "past_continuous": _past_continuous,
    "past_perfect": _past_perfect,
    "past_perfect_continuous": _past_perfect_continuous,
    "future_will": _future_will,
    "future_going_to": _future_going_to,
    "future_continuous": _future_continuous,
    "future_perfect": _future_perfect,
    "used_to": _used_to,
    "passive_any": _passive_any,
    "passive_agentless": _passive_agentless,
    "causative_have_get": _causative_have_get,
    "modal_simple": _modal_simple,
    "modal_perfect": _modal_perfect,
    "conditional_real": _conditional_real,
    "conditional_unreal_present": _conditional_unreal_present,
    "conditional_unreal_past": _conditional_unreal_past,
    "wish_unreal": _wish_unreal,
    "relative_defining": _relative_defining,
    "relative_non_defining": _relative_non_defining,
    "participle_clause": _participle_clause,
    "noun_clause_that": _noun_clause_that,
    "embedded_question": _embedded_question,
    "reported_speech": _reported_speech,
    "gerund_after_preposition": _gerund_after_preposition,
    "comparative": _comparative,
    "cleft": _cleft,
}

#: The closed set of §2.8. A point declaring anything else fails the merge lint.
STRUCTURE_SLUGS: tuple[str, ...] = tuple(_DETECTORS)

#: Plain-English names, used when the judge has to be told what it is looking for and when
#: the UI says which structure the learner was asked to produce.
_DESCRIPTIONS: dict[str, str] = {
    "present_simple": "the present simple",
    "present_continuous": "the present continuous (am/is/are + -ing)",
    "present_perfect": "the present perfect (have/has + past participle)",
    "present_perfect_continuous": "the present perfect continuous (have/has been + -ing)",
    "past_simple": "the past simple",
    "past_continuous": "the past continuous (was/were + -ing)",
    "past_perfect": "the past perfect (had + past participle)",
    "past_perfect_continuous": "the past perfect continuous (had been + -ing)",
    "future_will": "will + base verb",
    "future_going_to": "be going to + base verb",
    "future_continuous": "will be + -ing",
    "future_perfect": "will have + past participle",
    "used_to": "used to + base verb",
    "passive_any": "the passive (a form of be + past participle)",
    "passive_agentless": "the passive with no by-phrase",
    "causative_have_get": "the causative (have/get something done)",
    "modal_simple": "a modal verb + base verb",
    "modal_perfect": "a modal verb + have + past participle",
    "conditional_real": "a real conditional",
    "conditional_unreal_present": "an unreal present conditional (if + past, would + base)",
    "conditional_unreal_past": "an unreal past conditional (if + had done, would have done)",
    "wish_unreal": "wish + an unreal form",
    "relative_defining": "a defining relative clause",
    "relative_non_defining": "a non-defining relative clause with commas",
    "participle_clause": "a participle clause",
    "noun_clause_that": "a that-clause after a reporting verb or noun",
    "embedded_question": "an embedded question in statement word order",
    "reported_speech": "reported speech",
    "gerund_after_preposition": "a preposition + -ing",
    "comparative": "a comparative",
    "cleft": "a cleft sentence",
}


def has_detector(slug: str | None) -> bool:
    return bool(slug) and slug in _DETECTORS


def describe(slug: str | None) -> str:
    """What to call this structure in a sentence addressed to the learner."""
    if not slug:
        return "the target structure"
    return _DESCRIPTIONS.get(slug, slug.replace("_", " "))


def detect(slug: str | None, sentence: str) -> bool | None:
    """Does ``sentence`` contain the structure ``slug`` names?

    ``None`` means *we cannot tell* — an unknown slug, or no sentence. The caller must
    treat ``None`` and ``False`` identically for the purposes of rejecting, which is to
    say: never reject on this alone (§2.9, "if the detector does not fire, we still do not
    reject").
    """
    if not slug or not sentence:
        return None
    fn = _DETECTORS.get(slug)
    if fn is None:
        return None
    try:
        return bool(fn(_norm(sentence)))
    except re.error:  # pragma: no cover — a malformed pattern must never 500 a review
        return None
