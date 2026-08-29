"""Grapheme-to-phoneme, IPA tokenisation and **accent-fair** phone comparison.

This is the layer 09 §3 always needed and never had: a way to say what a word *should*
sound like, and to compare two pronunciations of it, without shipping a model. It runs on
`espeak-ng` via ``phonemizer``, both of which are already installed — ``espeakng_loader``
bundles the shared library, so there is nothing to download and nothing to ``brew install``.
That matters here more than it would elsewhere: an install that needs a gigabyte before it
does anything is unusable on this network.

Three jobs:

1. :func:`ipa_for` — the IPA for any word, cached. Enough on its own to put a
   pronunciation on every vocabulary headword and every drill item.
2. :func:`split_phones` — an IPA string cut into *phones*, not characters. ``/oʊ/`` is one
   sound and ``/tʃ/`` is one sound; comparing them character-by-character would report two
   errors where a learner made none.
3. :func:`align_phones` / :func:`phone_error_rate` — what changed between the sounds a word
   wanted and the sounds that came out.

**The accent rule is enforced here, in code, not left to the caller.**

09 §0 forbids scoring proximity to any accent, and a phone comparison is exactly where that
promise gets broken by accident. A Tamil or Sinhala speaker, an Indian, Nigerian, Scottish
or Australian speaker says *cot* and *caught* with vowels espeak transcribes differently
from its `en-us` default — and a naive diff calls every one of those an error. So
:data:`ACCENT_FOLDS` collapses the distinctions that vary *between healthy accents of
English* before anything is compared: vowel length, r-colouring, the cot-caught merger, the
reduced-vowel family, and the trap-bath split. What survives the fold is the kind of
difference that changes the word — ``/ʃɪp/`` against ``/ʃiːp/`` — which is the only kind
that costs a candidate marks in the exam and the only kind worth telling them about.

Adding a fold makes the module *more* permissive and is usually right. Removing one makes
it stricter and needs a reason that is about intelligibility, never about sounding native.
"""

from __future__ import annotations

import logging
import re
from typing import Any

_log = logging.getLogger("bandready.pron.phonemes")

__all__ = [
    "ACCENT_FOLDS",
    "PhoneOp",
    "align_phones",
    "available",
    "ipa_for",
    "ipa_for_many",
    "normalize_phone",
    "phone_error_rate",
    "phones_of",
    "split_phones",
    "stress_pattern",
]


# --------------------------------------------------------------------------------------
# The espeak backend
# --------------------------------------------------------------------------------------

_backend: Any = None
_backend_failed = False

#: espeak voice. ``en-us`` is the *transcription* reference, not a target to sound like:
#: :data:`ACCENT_FOLDS` erases the differences between it and the other major Englishes
#: before any comparison, so the choice of voice does not advantage one accent.
VOICE = "en-us"


def _load_backend() -> Any:
    """The espeak backend, or ``None`` when it cannot be loaded.

    Never raises. Everything downstream degrades to "no IPA available" rather than failing
    a learner's recording, because a missing phonemiser is our problem and not theirs.
    """
    global _backend, _backend_failed
    if _backend is not None or _backend_failed:
        return _backend
    try:
        # espeakng_loader ships the compiled library and its data; pointing phonemizer at
        # them is what removes the system `espeak-ng` install from the requirements.
        import espeakng_loader
        from phonemizer.backend import EspeakBackend
        from phonemizer.backend.espeak.wrapper import EspeakWrapper

        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        _backend = EspeakBackend(VOICE, preserve_punctuation=False, with_stress=True)
    except Exception:  # noqa: BLE001 — a missing phonemiser must not break a recording
        _log.warning("espeak-ng phonemiser unavailable; IPA features are off", exc_info=True)
        _backend_failed = True
        _backend = None
    return _backend


def available() -> bool:
    """True when IPA can be produced. Callers use this to hide, not to fail."""
    return _load_backend() is not None


# --------------------------------------------------------------------------------------
# Grapheme to phoneme
# --------------------------------------------------------------------------------------

_WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


#: Words already transcribed, filled by both the single and the batch path. A plain dict
#: rather than an ``lru_cache`` because :func:`ipa_for_many` needs to *write* results it
#: obtained in one espeak call, and a cache you cannot seed is no use to a batch.
_cache: dict[str, str | None] = {}

#: Ceiling on the cache. A whole content pack is a few thousand distinct words; this is
#: generous enough never to be hit in practice and small enough to stay bounded if some
#: caller starts phonemising free text.
_CACHE_MAX = 32768


def _phonemize(tokens: list[str]) -> list[str | None]:
    """One espeak call for a list of words. Never raises; returns ``None`` per failure."""
    backend = _load_backend()
    if backend is None or not tokens:
        return [None] * len(tokens)
    try:
        out = backend.phonemize(tokens, strip=True)
    except Exception:  # noqa: BLE001 — espeak edge cases degrade to "no IPA", never to an error
        _log.debug("phonemize failed for %d token(s)", len(tokens), exc_info=True)
        return [None] * len(tokens)
    result: list[str | None] = []
    for i in range(len(tokens)):
        raw = str(out[i]).strip() if i < len(out) else ""
        result.append(raw or None)
    return result


def _remember(word: str, ipa: str | None) -> None:
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[word] = ipa


def ipa_for(word: str) -> str | None:
    """IPA for one word, with stress marks, or ``None`` if it cannot be transcribed.

    Cached: the same few thousand headwords and drill items are asked for over and over.
    """
    token = word.strip().lower()
    if not token:
        return None
    if token in _cache:
        return _cache[token]
    ipa = _phonemize([token])[0]
    _remember(token, ipa)
    return ipa


def ipa_for_many(words: list[str]) -> list[str | None]:
    """IPA for a list of words, taking **one** espeak call for everything not yet cached.

    Same answers as calling :func:`ipa_for` in a loop, minus the per-word overhead — which
    is what makes phonemising a whole passage or a whole deck practical.
    """
    tokens = [w.strip().lower() for w in words]
    todo = [t for t in dict.fromkeys(tokens) if t and t not in _cache]
    if todo:
        for token, ipa in zip(todo, _phonemize(todo), strict=True):
            _remember(token, ipa)
    return [_cache.get(t) if t else None for t in tokens]


# --------------------------------------------------------------------------------------
# IPA tokenisation
# --------------------------------------------------------------------------------------

#: Stress marks espeak emits. Carried out of the phone stream by :func:`split_phones` and
#: read separately by :func:`stress_pattern` — word stress is a real IELTS pronunciation
#: feature, but it is not a property of any single sound.
STRESS_MARKS = "ˈˌ"

#: Multi-character phones, longest first. Greedy-matched, so ``/oʊ/`` never becomes
#: ``/o/`` + ``/ʊ/`` and ``/tʃ/`` never becomes ``/t/`` + ``/ʃ/``.
MULTI_PHONES: tuple[str, ...] = (
    # diphthongs
    "aɪ", "aʊ", "eɪ", "oʊ", "ɔɪ", "ɪə", "eə", "ʊə", "əʊ", "ɛə",
    # affricates
    "tʃ", "dʒ",
    # r-coloured and long monophthongs (the length mark is folded away later, but it must
    # be consumed with its vowel or it becomes a phantom phone of its own)
    "ɑː", "ɔː", "uː", "iː", "ɜː", "ɐː", "ɒː", "ɛː", "ɚ", "ɝ",
)


def split_phones(ipa: str | None) -> list[str]:
    """Cut an IPA string into phones.

    Whitespace and stress marks are dropped; :data:`MULTI_PHONES` are kept whole. The
    result is what a *sound* comparison operates on — comparing the raw string by
    character would score ``/tʃ/`` as two mistakes when the learner made none.
    """
    if not ipa:
        return []
    text = str(ipa)
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace() or ch in STRESS_MARKS:
            i += 1
            continue
        for multi in MULTI_PHONES:
            if text.startswith(multi, i):
                out.append(multi)
                i += len(multi)
                break
        else:
            # A bare length mark can only follow a vowel we already emitted; glue it on
            # rather than letting it stand as a phone.
            if ch == "ː" and out:
                out[-1] = out[-1] + "ː"
            else:
                out.append(ch)
            i += 1
    return out


def phones_of(word: str) -> list[str]:
    """The phones of one word, straight from its IPA. Empty when espeak is unavailable."""
    return split_phones(ipa_for(word))


def stress_pattern(ipa: str | None) -> list[int]:
    """Stress per syllable: 2 primary, 1 secondary, 0 unstressed. One entry per syllable.

    Used for word-stress feedback, which is a genuine intelligibility feature — *REcord*
    the noun against *reCORD* the verb — and is quite separate from which vowel an accent
    happens to use.

    Counted over vowel **phones**, not vowel characters. A diphthong is one syllable: ``/aɪ/``
    in *live* is two characters and one vowel, and counting characters made every such word
    look like it had a spare syllable — which put the stress marker on the wrong beat of
    every generated drill item.
    """
    return [stress for phone, stress in _phones_with_stress(ipa) if _is_vowel_phone(phone)]


def _phones_with_stress(ipa: str | None) -> list[tuple[str, int]]:
    """Phones paired with the stress mark that preceded them.

    Shares the greedy multi-phone matching of :func:`split_phones`; kept separate because
    that function deliberately discards stress and this one is the only caller that needs
    it back.
    """
    if not ipa:
        return []
    text = str(ipa)
    out: list[tuple[str, int]] = []
    pending = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "ˈ":
            pending = 2
            i += 1
            continue
        if ch == "ˌ":
            pending = 1
            i += 1
            continue
        if ch.isspace():
            pending = 0
            i += 1
            continue
        for multi in MULTI_PHONES:
            if text.startswith(multi, i):
                out.append((multi, pending))
                pending = 0
                i += len(multi)
                break
        else:
            if ch == "ː" and out:
                phone, stress = out[-1]
                out[-1] = (phone + "ː", stress)
            else:
                out.append((ch, pending))
                pending = 0
            i += 1
    return out


_VOWEL_CHARS = set("aeiouæɑɒɔəɚɛɜɝɪiʊuʌɐyøœ")


def _is_vowel(ch: str) -> bool:
    return ch in _VOWEL_CHARS


def _is_vowel_phone(phone: str) -> bool:
    """A phone is a vowel when it *starts* with one — ``/aɪ/``, ``/oʊ/``, ``/ɑː/`` all do.

    Checking the first character rather than any character is what keeps ``/tʃ/`` and
    ``/dʒ/`` out: both contain no vowel but end in a consonant that a looser test could
    misread.
    """
    return bool(phone) and phone[0] in _VOWEL_CHARS


# --------------------------------------------------------------------------------------
# Accent-fair normalisation — 09 §0 lives here
# --------------------------------------------------------------------------------------

#: Distinctions that vary between healthy accents of English and are folded away before any
#: comparison. Each group maps to a single representative.
#:
#: These are not sloppiness allowances. Every group is a documented axis of variation
#: across the Englishes our learners speak and the Englishes the exam accepts:
#:
#: * **Reduced vowels** — ``ə ʌ ɐ ɜ`` land differently in South Asian, Caribbean and
#:   Northern English varieties. None of the differences change a word.
#: * **Cot-caught** — merged in most of North America and in Scotland, distinct in RP.
#: * **Trap-bath** — ``æ``/``ɑː`` in *bath* splits Britain from America down the middle.
#: * **Length** — a phonemically long vowel is not reliably longer in every accent, and
#:   espeak marks length that speakers do not always produce.
#: * **Rhoticity** — whether ``/ɹ/`` surfaces after a vowel is the single loudest accent
#:   marker in English and carries no meaning at all.
#:
#: A learner who says *ship* for *sheep* still gets told, because ``ɪ``/``iː`` is not in
#: here: it changes the word, and that is the line.
ACCENT_FOLDS: dict[str, str] = {
    # reduced / central vowels
    "ʌ": "ə", "ɐ": "ə", "ɜ": "ə", "ɚ": "ə", "ɝ": "ə", "ɵ": "ə",
    # cot-caught and the low back vowels
    "ɒ": "ɑ", "ɔ": "ɑ",
    # espeak's bare ``a`` is the TRAP vowel in the voices we use
    "a": "æ",
    # the two transcriptions of the GOAT vowel espeak uses across voices
    "əʊ": "oʊ",
    "ɛə": "eə",
    # tapped / glottal realisations of /t/ carry no meaning difference
    "ɾ": "t", "ʔ": "t",
}


def normalize_phone(phone: str) -> str:
    """One phone, reduced to the form used for comparison.

    Drops length, then applies :data:`ACCENT_FOLDS`. This is the function that decides what
    counts as a mistake, so it is the one to read before changing any of this.
    """
    if not phone:
        return ""
    p = phone.replace("ː", "").replace("ˑ", "")
    for mark in STRESS_MARKS:
        p = p.replace(mark, "")
    if p in ACCENT_FOLDS:
        return ACCENT_FOLDS[p]
    # Fold a multi-character phone by its parts, so ``əʊ`` and ``oʊ`` meet.
    if len(p) > 1:
        folded = "".join(ACCENT_FOLDS.get(c, c) for c in p)
        return ACCENT_FOLDS.get(folded, folded)
    return p


def _comparable(phones: list[str], *, drop_final_r: bool = True) -> list[str]:
    """Phones normalised for comparison, with post-vocalic ``/ɹ/`` optionally removed.

    Rhoticity is dropped by default because whether *car* ends in an r-sound is the
    difference between Boston and London, not between right and wrong.
    """
    out = [normalize_phone(p) for p in phones]
    out = [p for p in out if p]
    if drop_final_r:
        kept: list[str] = []
        for i, p in enumerate(out):
            if p == "ɹ" and i > 0 and _is_vowel(out[i - 1][:1]):
                nxt = out[i + 1] if i + 1 < len(out) else ""
                if not nxt or not _is_vowel(nxt[:1]):
                    continue  # post-vocalic, not before a vowel: an accent feature
            kept.append(p)
        out = kept
    return out


# --------------------------------------------------------------------------------------
# Alignment
# --------------------------------------------------------------------------------------


class PhoneOp:
    """One edit between the sounds a word wanted and the sounds it got.

    ``op`` is ``equal``, ``sub``, ``del`` (a sound the learner left out) or ``ins`` (a
    sound they added). ``expected`` and ``heard`` hold the *unfolded* phones, so the
    learner is shown the real sounds rather than our internal representatives.
    """

    __slots__ = ("expected", "heard", "op")

    def __init__(self, op: str, expected: str | None, heard: str | None) -> None:
        self.op = op
        self.expected = expected
        self.heard = heard

    def as_wire(self) -> dict[str, Any]:
        return {"op": self.op, "expected": self.expected, "heard": self.heard}

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"PhoneOp({self.op!r}, {self.expected!r}, {self.heard!r})"

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, PhoneOp)
            and (self.op, self.expected, self.heard) == (other.op, other.expected, other.heard)
        )


def align_phones(expected: list[str], heard: list[str]) -> list[PhoneOp]:
    """Align two phone sequences by edit distance, accent-fairly.

    Comparison runs on the folded forms; the ops carry the original phones so the feedback
    shows a learner the sound they actually produced.
    """
    exp_cmp = _comparable(expected)
    heard_cmp = _comparable(heard)
    # Keep a parallel copy of the display forms, dropping whatever _comparable dropped.
    exp_disp = _display_aligned(expected, exp_cmp)
    heard_disp = _display_aligned(heard, heard_cmp)

    n, m = len(exp_cmp), len(heard_cmp)
    # Standard Levenshtein DP with a backtrace. Sequences here are one word long, so the
    # quadratic cost is irrelevant and the clarity is worth more than a clever algorithm.
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = i
    for j in range(1, m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if exp_cmp[i - 1] == heard_cmp[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)

    ops: list[PhoneOp] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            cost = 0 if exp_cmp[i - 1] == heard_cmp[j - 1] else 1
            if dp[i][j] == dp[i - 1][j - 1] + cost:
                ops.append(
                    PhoneOp("equal" if cost == 0 else "sub", exp_disp[i - 1], heard_disp[j - 1])
                )
                i -= 1
                j -= 1
                continue
        if i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(PhoneOp("del", exp_disp[i - 1], None))
            i -= 1
            continue
        ops.append(PhoneOp("ins", None, heard_disp[j - 1]))
        j -= 1
    ops.reverse()
    return ops


def _display_aligned(original: list[str], comparable: list[str]) -> list[str]:
    """Original phones, trimmed to line up with their normalised counterparts.

    ``_comparable`` can drop phones (post-vocalic ``/ɹ/``), so the display list has to lose
    the same ones or the two sequences fall out of step and a learner is shown a sound from
    the wrong position.
    """
    out: list[str] = []
    idx = 0
    for phone in original:
        norm = normalize_phone(phone)
        if not norm:
            continue
        if idx < len(comparable) and comparable[idx] == norm:
            out.append(phone)
            idx += 1
    # Whatever is left unmatched (should not happen) is padded so indexing stays safe.
    while len(out) < len(comparable):
        out.append(comparable[len(out)])
    return out


# --------------------------------------------------------------------------------------
# Lexical variation — the accent differences a phone fold cannot express
# --------------------------------------------------------------------------------------

#: The BATH lexical set: words where southern British English has ``/ɑː/`` and North
#: American English has ``/æ/``.
#:
#: This cannot be a :data:`ACCENT_FOLDS` entry, and the reason is worth stating because it
#: is the trap anyone extending this file will fall into. Folding ``ɑ`` to ``æ`` across the
#: board would also merge *cat* with *cot* and *ban* with *barn* — pairs that genuinely
#: differ. The trap-bath split is **lexically conditioned**: it applies to this set of
#: words and not to the vowel in general. So it is handled per word, here.
#:
#: The list is the common core of the set. It does not need to be exhaustive — a word left
#: out is scored by the espeak transcription alone, which is the behaviour we had before.
BATH_WORDS: frozenset[str] = frozenset(
    """
    after answer ask asked asking aunt bath bathe baths branch brass cast castle chance
    chant class classes command dance demand draft draught example fast faster fasten
    father france french glass grant graph grasp grass half halve laugh laughed laughter
    last mask master nasty pass passed passing past pastor path paths plant plants
    raft rather rasp sample slant staff task tasks vast
    """.split()  # noqa: SIM905 — the wrapped list is readable; the fix is one 400-char line
)

#: Words with two established pronunciations across major Englishes, where the difference
#: is a matter of dictionary variation rather than of a learner getting it wrong. Values
#: are extra IPA forms accepted alongside whatever espeak produces.
LEXICAL_VARIANTS: dict[str, tuple[str, ...]] = {
    "either": ("ˈaɪðɚ", "ˈiːðɚ"),
    "neither": ("ˈnaɪðɚ", "ˈniːðɚ"),
    "schedule": ("ˈskɛdʒuːl", "ˈʃɛdjuːl"),
    "privacy": ("ˈpɹaɪvəsi", "ˈpɹɪvəsi"),
    "route": ("ˈɹuːt", "ˈɹaʊt"),
    "vitamin": ("ˈvaɪtəmɪn", "ˈvɪtəmɪn"),
    "leisure": ("ˈliːʒɚ", "ˈlɛʒɚ"),
    "garage": ("ɡəˈɹɑːʒ", "ˈɡæɹɪdʒ"),
    "advertisement": ("ˌædvɚˈtaɪzmənt", "ədˈvɜːtɪsmənt"),
    "data": ("ˈdeɪtə", "ˈdɑːtə"),
    "process": ("ˈpɹɑːsɛs", "ˈpɹoʊsɛs"),
    "research": ("ɹɪˈsɜːtʃ", "ˈɹiːsɜːtʃ"),
    "controversy": ("ˈkɑːntɹəvɜːsi", "kənˈtɹɑːvɚsi"),
}


def variant_phone_sets(word: str) -> list[list[str]]:
    """Every pronunciation of ``word`` this module treats as correct.

    Always at least the espeak transcription. Words in :data:`BATH_WORDS` also get the
    ``/ɑː/``↔``/æ/`` counterpart, and words in :data:`LEXICAL_VARIANTS` get their
    documented alternatives. A learner matching *any* of these has said the word right.
    """
    token = word.strip().lower()
    if not token:
        return []
    sets: list[list[str]] = []
    base = phones_of(token)
    if base:
        sets.append(base)
    for extra in LEXICAL_VARIANTS.get(token, ()):
        phones = split_phones(extra)
        if phones:
            sets.append(phones)
    if token in BATH_WORDS and base:
        # The counterpart form: swap the folded low vowel for the other side of the split.
        swapped = [("ɑː" if normalize_phone(p) == "æ" else "æ" if normalize_phone(p) == "ɑ" else p) for p in base]
        if swapped != base:
            sets.append(swapped)
    return sets or [[]]


def best_phone_error_rate(word: str, heard: list[str]) -> tuple[float, list[str]]:
    """The lowest PER across every accepted pronunciation of ``word``.

    Returns the rate and the variant it was measured against, so the caller can show the
    learner the form they came closest to rather than an arbitrary one.
    """
    best = (1.0, [])  # type: tuple[float, list[str]]
    for variant in variant_phone_sets(word):
        if not variant:
            continue
        rate = phone_error_rate(variant, heard)
        if not best[1] or rate < best[0]:
            best = (rate, variant)
    return best


def phone_error_rate(expected: list[str], heard: list[str]) -> float:
    """Edited sounds over expected sounds, 0.0–1.0+.

    The same measure OpenPronounce weights at 0.4 in its score. Returns 0.0 when there was
    nothing to say, and 1.0 when something was expected and nothing came out.
    """
    exp_cmp = _comparable(expected)
    if not exp_cmp:
        return 0.0
    ops = align_phones(expected, heard)
    edits = sum(1 for op in ops if op.op != "equal")
    return edits / len(exp_cmp)
