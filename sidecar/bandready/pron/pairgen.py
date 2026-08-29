"""Minimal pairs and word-stress items generated from words the learner already has.

09 §5.3 ships 46 hand-authored minimal pairs and eight word-stress items. That is enough to
demonstrate the drill and not enough to practise with, and hand-authoring more is slow
work that has to be redone for every content pack.

It also drills the wrong words. A fixed bank asks a learner to hear *ship* against *sheep*
whether or not either word is in their vocabulary. The words that repay the effort are the
ones they are **already studying** — the deck entries, the words they misspelled in
listening, the vocabulary a reading passage just taught them. Those they will have to say
out loud, and soon.

So this module derives drills from a supplied word list:

* :func:`minimal_pairs_from` finds words differing in exactly one sound, and names the
  contrast.
* :func:`stress_items_from` finds multi-syllable words and reads their stress off espeak.

Both run entirely on :mod:`bandready.pron.phonemes` — no model, no download, no authoring.
And because the comparison happens on *folded* phones, a generated pair is never a pair
that only differs by accent: ``/kɑt/`` and ``/kɔt/`` fold together and are correctly
rejected, while ``/ʃɪp/`` and ``/ʃiːp/`` survive. The accent guarantee is inherited rather
than restated.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from bandready.pron import phonemes as ph

_log = logging.getLogger("bandready.pron.pairgen")

__all__ = [
    "CONTRAST_LABELS",
    "contrast_id",
    "minimal_pairs_from",
    "stress_items_from",
]


#: Human names for the contrasts worth drilling, keyed by the sorted folded phone pair.
#:
#: Only listed contrasts are generated. An unlisted pair is not *wrong*, it is unlabelled —
#: and a drill that cannot tell the learner which two sounds they are choosing between is a
#: guessing game. The list covers the substitutions that actually cost IELTS candidates
#: marks, weighted towards the ones common across South Asian, East Asian, Slavic and
#: Romance first languages.
CONTRAST_LABELS: dict[tuple[str, str], str] = {
    ("ɪ", "i"): "short i / long ee",
    ("æ", "ɛ"): "a / e",
    ("æ", "ə"): "a / uh",
    ("ɑ", "æ"): "ah / a",
    ("ʊ", "u"): "short oo / long oo",
    ("ɛ", "eɪ"): "e / ay",
    ("ə", "oʊ"): "uh / oh",
    ("b", "v"): "b / v",
    ("v", "w"): "v / w",
    ("b", "p"): "b / p",
    ("d", "t"): "d / t",
    ("ɡ", "k"): "g / k",
    ("f", "p"): "f / p",
    ("f", "v"): "f / v",
    ("s", "z"): "s / z",
    ("s", "ʃ"): "s / sh",
    ("tʃ", "ʃ"): "ch / sh",
    ("dʒ", "ʒ"): "j / zh",
    ("θ", "t"): "th / t",
    ("θ", "s"): "th / s",
    ("ð", "d"): "th / d",
    ("ð", "z"): "th / z",
    ("l", "ɹ"): "l / r",
    ("l", "n"): "l / n",
    ("m", "n"): "m / n",
    ("n", "ŋ"): "n / ng",
    ("h", "ə"): "dropped h",
}


def contrast_id(a: str, b: str) -> str:
    """Stable identifier for a contrast, order-independent: ``"th_t"``-ish, from phones."""
    lo, hi = sorted((a, b))
    return f"{lo}_{hi}"


def _label(a: str, b: str) -> str | None:
    return CONTRAST_LABELS.get(tuple(sorted((a, b))))  # type: ignore[arg-type]


def minimal_pairs_from(
    words: list[str],
    *,
    limit: int = 40,
    contrast: str | None = None,
) -> list[dict[str, Any]]:
    """Minimal pairs among ``words`` — two words differing in exactly one sound.

    ``contrast`` filters to one contrast id from :func:`contrast_id`.

    The method is an index rather than a comparison of every word against every other: for
    each word and each position in it, the phones either side of that position form a key,
    and any two words sharing a key differ in exactly that one place. That turns a
    quadratic scan of the deck into a linear pass, which matters at 1,246 entries.
    """
    if not ph.available():
        return []

    cleaned = [w.strip().lower() for w in words]
    cleaned = [w for w in dict.fromkeys(cleaned) if w and w.isalpha() and len(w) > 1]
    if len(cleaned) < 2:
        return []

    ph.ipa_for_many(cleaned)

    # key -> list of (word, phone at the blanked position)
    buckets: dict[tuple[tuple[str, ...], tuple[str, ...]], list[tuple[str, str]]] = defaultdict(list)
    folded: dict[str, list[str]] = {}
    for word in cleaned:
        phones = [ph.normalize_phone(p) for p in ph.phones_of(word)]
        phones = [p for p in phones if p]
        if not (2 <= len(phones) <= 12):
            continue
        folded[word] = phones
        for i, phone in enumerate(phones):
            buckets[(tuple(phones[:i]), tuple(phones[i + 1 :]))].append((word, phone))

    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for members in buckets.values():
        if len(members) < 2:
            continue
        for idx, (word_a, phone_a) in enumerate(members):
            for word_b, phone_b in members[idx + 1 :]:
                if word_a == word_b or phone_a == phone_b:
                    continue
                label = _label(phone_a, phone_b)
                if label is None:
                    continue  # unlabelled contrast: cannot be explained, so not drilled
                key = tuple(sorted((word_a, word_b)))
                if key in seen:
                    continue
                seen.add(key)  # type: ignore[arg-type]
                cid = contrast_id(phone_a, phone_b)
                if contrast and cid != contrast:
                    continue
                first, second = key
                out.append(
                    {
                        "id": f"gen_{first}_{second}",
                        "drill_type": "minimal_pair_ab",
                        "a": first,
                        "b": second,
                        "contrast": cid,
                        "contrast_label": label,
                        "ipa_a": ph.ipa_for(first),
                        "ipa_b": ph.ipa_for(second),
                        "sentence_a": "",
                        "sentence_b": "",
                        "tags": ["generated"],
                        "source": "generated",
                    }
                )

    # Spread the results across contrasts rather than returning forty of the same one —
    # a drill that is twenty rounds of l/r teaches less than one covering the learner's
    # whole error profile.
    return _round_robin(out, limit)


def _round_robin(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    by_contrast: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_contrast[str(item["contrast"])].append(item)
    order = sorted(by_contrast, key=lambda c: (-len(by_contrast[c]), c))
    out: list[dict[str, Any]] = []
    depth = 0
    while len(out) < limit:
        added = False
        for cid in order:
            group = by_contrast[cid]
            if depth < len(group):
                out.append(group[depth])
                added = True
                if len(out) >= limit:
                    break
        if not added:
            break
        depth += 1
    return out


#: Minimum syllables for a stress item. Two-syllable words are where English stress first
#: becomes contrastive, and where candidates most often get it wrong.
MIN_SYLLABLES = 2


def stress_items_from(words: list[str], *, limit: int = 20) -> list[dict[str, Any]]:
    """Word-stress drill items for multi-syllable words in ``words``.

    ``answer_index`` is the syllable carrying primary stress, read from espeak rather than
    authored. Syllables are *not* orthographic — the count comes from the vowels in the
    transcription — so the item carries the IPA and the index, and leaves the UI to present
    them however it presents the hand-authored ones.
    """
    if not ph.available():
        return []
    cleaned = [w.strip().lower() for w in words]
    cleaned = [w for w in dict.fromkeys(cleaned) if w and w.isalpha() and len(w) > 3]
    ph.ipa_for_many(cleaned)

    out: list[dict[str, Any]] = []
    for word in cleaned:
        ipa = ph.ipa_for(word)
        if not ipa:
            continue
        pattern = ph.stress_pattern(ipa)
        if len(pattern) < MIN_SYLLABLES or 2 not in pattern:
            continue
        out.append(
            {
                "id": f"gen_ws_{word}",
                "drill_type": "word_stress_tap",
                "word": word,
                "syllable_count": len(pattern),
                "answer_index": pattern.index(2),
                "stress_pattern": pattern,
                "ipa": ipa,
                "contrast": "word_stress",
                "tags": ["generated"],
                "source": "generated",
            }
        )
        if len(out) >= limit:
            break
    return out
