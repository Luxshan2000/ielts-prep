"""Grading: mechanical for eleven kinds, and four binary questions for the other three.

Grammar `DESIGN.md` §2.9 sets the shape and the reason for it. The failure mode that kills
a module like this is precise: *a learner writes a correct sentence the grader did not
anticipate, the grader says no, and the learner stops trusting the app.* After that every
correction is noise. So grading here is asymmetric by construction — **accepting is cheap,
rejecting is expensive** — and the expensive path is where all the code is.

Three things in this file are load-bearing and should not be "simplified":

1. :func:`grammar_close` exists because ``exercises.word_variants()`` must never be used
   for grammar. It generates ``-s/-ed/-ing/-d/-ly`` blindly, so it would score ``walking``
   as "almost" when the answer is ``walked``. In a tense point that distinction *is* the
   lesson (§0.3).
2. Check A of free production is answered by :mod:`bandready.grammar.detectors`, not by
   the model. The model is told the result.
3. A rejection that cannot quote the offending words **is discarded**. Ten lines, and the
   strongest fairness mechanism available to us.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from bandready.grammar import detectors
from bandready.srs.exercises import normalize_answer_text

_log = logging.getLogger("bandready.grammar.grading")

__all__ = [
    "FREE_PRODUCTION_KINDS",
    "MECHANICAL_KINDS",
    "NEVER_CHECKED",
    "grade_item",
    "grammar_close",
    "judge_production",
    "same_inflection_class",
]

#: Eleven of fourteen kinds need no network. This module works with the radio off, and the
#: three that do not degrade to a ``transform`` or ``order`` item on the same structure.
MECHANICAL_KINDS: tuple[str, ...] = (
    "interpret",
    "gap_fill",
    "order",
    "transform",
    "choose_form",
    "contrast_pair",
    "judge",
    "both_ok",
    "error_fix",
    "dictation",
    "discover",
)

FREE_PRODUCTION_KINDS: tuple[str, ...] = ("produce", "combine", "speaking_drill")

#: Written out so no future prompt edit can quietly reintroduce any of it (§2.9). These
#: are the things a grammar judge must never have an opinion about.
NEVER_CHECKED: tuple[str, ...] = (
    "topic",
    "opinion",
    "truth",
    "length",
    "formality (unless the point is about register)",
    "spelling outside the target span",
    "punctuation outside the target span",
    "vocabulary choice",
    "whether it is 'natural'",
    "whether a native speaker would say it",
)


# --------------------------------------------------------------------------------------
# Near-miss policy — grammar's own, deliberately narrower than vocabulary's
# --------------------------------------------------------------------------------------

#: Words whose *identity* is the grammar. A one-character difference between two of these
#: is never a typo: ``has``/``had`` is a tense, ``is``/``it`` is a clause, ``few``/``new``
#: is a different word entirely. If both sides of a one-edit difference are in here, the
#: answer is wrong, full stop.
_GRAMMATICAL_WORDS = {
    # be
    "am", "is", "are", "was", "were", "be", "been", "being",
    # have / do
    "have", "has", "had", "having", "do", "does", "did", "done", "doing",
    # modals
    "will", "would", "shall", "should", "can", "could", "may", "might", "must", "ought",
    # determiners and quantifiers
    "a", "an", "the", "this", "that", "these", "those", "some", "any", "no", "few",
    "little", "much", "many", "more", "most", "less", "least", "each", "every", "all",
    "both", "either", "neither",
    # pronouns
    "i", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
    "his", "its", "our", "their", "who", "whom", "whose", "which", "what",
    # frequent function words
    "in", "on", "at", "to", "for", "of", "from", "by", "with", "as", "if", "so", "than",
    "then", "there", "since", "ago", "yet", "still", "just", "not", "nor", "or",
    "and", "but", "when", "while", "until", "unless", "though", "although",
}

#: Stripping the apostrophe is normally a typo. For these it is a different word, so the
#: forgiving branch is switched off (``its``/``it's``, ``were``/``we're``, ``ill``/``I'll``).
_APOSTROPHE_SENSITIVE = {
    "its", "were", "well", "hell", "shell", "ill", "id", "hed", "shed", "wed", "whos",
    "theres", "youre", "theyre", "cant", "wont", "wholl", "hes", "shes",
}

_SUFFIX_CLASSES: tuple[tuple[str, str], ...] = (
    ("ing", "ing"),
    ("ied", "ed"),
    ("ed", "ed"),
    ("en", "en"),
    ("es", "s"),
    ("s", "s"),
)


def _inflection_class(word: str) -> str:
    """The final morpheme, coarsely: ``ing`` / ``ed`` / ``en`` / ``s`` / ``base``."""
    w = word.lower()
    for suffix, name in _SUFFIX_CLASSES:
        if w.endswith(suffix) and len(w) > len(suffix) + 1:
            return name
    return "base"


def same_inflection_class(a: str, b: str) -> bool:
    """``walked``/``walkd`` is a slip; ``walked``/``walking`` is not.

    A misspelling almost never lands on a *different valid inflection*, so the test is:
    if both words carry a recognisable and different inflectional ending, they are two
    different forms and the learner chose the wrong one.
    """
    class_a, class_b = _inflection_class(a), _inflection_class(b)
    if class_a == class_b:
        return True
    # One side has no recognisable ending (`walkd`) — that is what a typo looks like.
    return "base" in (class_a, class_b) and not (
        a.lower() in _GRAMMATICAL_WORDS and b.lower() in _GRAMMATICAL_WORDS
    )


def _levenshtein(a: str, b: str, cap: int = 2) -> int:
    """Edit distance, short-circuited at ``cap`` (we only ever ask "is it ≤ 1?")."""
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    previous = list(range(len(b) + 1))
    for i, ch_a in enumerate(a, start=1):
        current = [i]
        for j, ch_b in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (ch_a != ch_b),
                )
            )
        if min(current) > cap:
            return cap + 1
        previous = current
    return previous[-1]


def _strip_apostrophes(text: str) -> str:
    return text.replace("'", "")


def grammar_close(expected: list[str], given: str) -> bool:
    """Grammar's own near-miss policy. **Never** call ``exercises.word_variants()`` here.

    A near miss is a *spelling slip on the same form*. It is graded as a pass with a
    spelling note (§1.6: a false lapse poisons FSRS's difficulty estimate for the card and
    poisons the learner's trust in the same move). Everything else — a different
    inflection, a different auxiliary, a different determiner — is wrong, because in this
    module that difference is what is being taught.
    """
    given = given.strip()
    if not given:
        return False
    for candidate in expected:
        candidate = candidate.strip()
        if not candidate:
            continue
        if candidate == given:
            return True

        # A dropped apostrophe (`dont` for `don't`) is a typing slip, except where the
        # apostrophe is the whole distinction.
        bare_expected = _strip_apostrophes(candidate)
        bare_given = _strip_apostrophes(given)
        if bare_expected == bare_given and candidate != given:
            if bare_given.split()[-1] not in _APOSTROPHE_SENSITIVE:
                return True
            continue

        exp_tokens, given_tokens = candidate.split(), given.split()
        if len(exp_tokens) != len(given_tokens):
            continue
        differing = [
            (e, g) for e, g in zip(exp_tokens, given_tokens, strict=True) if e != g
        ]
        if len(differing) != 1:
            continue
        exp_word, given_word = differing[0]
        if _levenshtein(exp_word, given_word) > 1:
            continue
        if exp_word in _GRAMMATICAL_WORDS and given_word in _GRAMMATICAL_WORDS:
            continue  # `has` for `had` is the lesson, not a typo
        if same_inflection_class(exp_word, given_word):
            return True
    return False


# --------------------------------------------------------------------------------------
# Mechanical grading
# --------------------------------------------------------------------------------------


def _norm_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [normalize_answer_text(str(v)) for v in values if str(v).strip()]


def _as_index(answer: Any, options: list[Any]) -> int | None:
    """An answer that is an option index, an option's text, or its ``text`` field."""
    if isinstance(answer, bool):
        return None
    if isinstance(answer, int):
        return answer if 0 <= answer < len(options) else None
    text = normalize_answer_text(str(answer))
    if not text:
        return None
    if text.isdigit():
        index = int(text)
        if 0 <= index < len(options):
            return index
    for index, option in enumerate(options):
        label = option.get("text") if isinstance(option, dict) else option
        if normalize_answer_text(str(label)) == text:
            return index
    return None


def _result(
    *,
    correct: bool | None,
    close: bool = False,
    detail: str,
    expected: Any = None,
    checked: bool = True,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "checked": checked,
        "correct": correct,
        "close": close,
        "detail": detail,
        "expected": expected,
        **extra,
    }


def _grade_choice(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    payload = item.get("payload") or {}
    options = payload.get("options") or []
    key = payload.get("key")

    # `both_ok` — the honesty item. Choosing one option is not "half right": the answer is
    # that both are correct and mean different things (§2.7).
    if key == "both":
        chosen = str(answer).strip().lower()
        correct = chosen in ("both", "both_ok", "either", "-1") or (
            isinstance(answer, list) and len(answer) == len(options)
        )
        return _result(
            correct=correct,
            detail=(
                "Both are correct English here — and they say different things."
                if correct
                else "Both of these are correct. The choice is about what you want to mean."
            ),
            expected="both",
        )

    index = _as_index(answer, options)
    if index is None:
        return _result(correct=False, detail="No option was chosen.", expected=key)
    try:
        key_index = int(key)
    except (TypeError, ValueError):
        return _result(correct=None, checked=False, detail="Rate yourself.", expected=None)
    correct = index == key_index
    return _result(correct=correct, detail="Correct." if correct else "Not this one.",
                   expected=key_index, chosen_index=index)


def _grade_interpret(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    payload = item.get("payload") or {}
    options = payload.get("options") or payload.get("slots") or []
    index = _as_index(answer, options)
    try:
        key_index = int(payload.get("key"))
    except (TypeError, ValueError):
        return _result(correct=None, checked=False, detail="Rate yourself.")
    if index is None:
        return _result(correct=False, detail="No option was chosen.", expected=key_index)
    correct = index == key_index
    return _result(
        correct=correct,
        detail="Yes — that is what the form is telling you." if correct else "Not quite.",
        expected=key_index,
        chosen_index=index,
    )


def _grade_judge(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    """Two stages: acceptable or not, and only on 'not' the reason from a closed list."""
    payload = item.get("payload") or {}
    acceptable_key = bool(payload.get("acceptable"))
    reasons = payload.get("reasons") or []
    reason_key = payload.get("reason_key")

    verdict: Any = answer
    reason: Any = None
    if isinstance(answer, dict):
        verdict = answer.get("acceptable")
        reason = answer.get("reason")
    elif isinstance(answer, list) and answer:
        verdict = answer[0]
        reason = answer[1] if len(answer) > 1 else None

    if isinstance(verdict, str):
        verdict_bool = verdict.strip().lower() in ("true", "yes", "ok", "acceptable", "1")
    else:
        verdict_bool = bool(verdict)

    if verdict_bool != acceptable_key:
        return _result(
            correct=False,
            detail=(
                "This one is fine as it stands."
                if acceptable_key
                else "There is something wrong with this sentence."
            ),
            expected={"acceptable": acceptable_key, "reason": reason_key},
        )
    if acceptable_key or reason_key is None:
        return _result(
            correct=True, detail="Correct.", expected={"acceptable": acceptable_key}
        )
    reason_index = _as_index(reason, reasons)
    correct = reason_index == int(reason_key)
    return _result(
        correct=correct,
        detail=(
            "Right sentence, right reason."
            if correct
            else "You spotted it — but the reason is a different one."
        ),
        expected={"acceptable": acceptable_key, "reason": int(reason_key)},
        stage_reached="reason" if not correct else "complete",
    )


def _grade_contrast_pair(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    payload = item.get("payload") or {}
    key = payload.get("key") or []
    given: list[int] = []
    if isinstance(answer, list):
        for value in answer:
            try:
                given.append(int(value))
            except (TypeError, ValueError):
                given.append(-1)
    correct = given == [int(k) for k in key]
    return _result(
        correct=correct,
        detail="Both matched." if correct else "One of those meanings belongs to the other sentence.",
        expected=[int(k) for k in key],
    )


def _grade_order(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    payload = item.get("payload") or {}
    tokens = [str(t) for t in (payload.get("tokens") or [])]
    accepted = payload.get("accepted_orders") or []
    given: list[int] = []
    if isinstance(answer, list):
        if answer and all(isinstance(v, int) for v in answer):
            given = [int(v) for v in answer]
        else:
            lookup = {normalize_answer_text(t): i for i, t in enumerate(tokens)}
            given = [lookup.get(normalize_answer_text(str(v)), -1) for v in answer]
    elif isinstance(answer, str):
        lookup = {normalize_answer_text(t): i for i, t in enumerate(tokens)}
        given = [lookup.get(normalize_answer_text(w), -1) for w in answer.split()]
    correct = any(given == [int(i) for i in order] for order in accepted)
    return _result(
        correct=correct,
        detail=(
            "Correct."
            if correct
            else "Not that order. Every order the language allows is accepted here, so this one is not one of them."
        ),
        expected=(
            " ".join(tokens[i] for i in accepted[0]) if accepted and tokens else None
        ),
    )


def _grade_dictation(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    """Graded on the target tokens only — the fairness trick (§2.7.1).

    A whole-string grader fails a good learner for misspelling ``commuting``, and that is
    not what a dictation item on ``I'd been`` is testing.
    """
    payload = item.get("payload") or {}
    scored = [str(t) for t in (payload.get("scored_tokens") or [])]
    heard = normalize_answer_text(str(answer))
    if not scored:
        expected = _norm_list(item.get("expected"))
        correct = heard in expected
        return _result(
            correct=correct,
            close=(not correct) and grammar_close(expected, heard),
            detail="Correct." if correct else "Listen once more.",
            expected=(item.get("expected") or [None])[0],
        )
    heard_tokens = heard.split()
    missed = []
    window = " ".join(heard_tokens)
    for token in scored:
        needle = normalize_answer_text(token)
        if needle and re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", window):
            continue
        missed.append(token)
    correct = not missed
    return _result(
        correct=correct,
        detail=(
            "Every target word is there."
            if correct
            else f"Listen again for: {', '.join(missed)}."
        ),
        expected=" ".join(scored),
        missed_tokens=missed,
    )


def _grade_error_fix(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    """Click the wrong span, then type the replacement. Both halves are graded."""
    payload = item.get("payload") or {}
    error_span = str(payload.get("error_span") or "")
    overlap_allowance = int(payload.get("accept_overlap_tokens") or 0)
    expected = _norm_list(item.get("expected"))

    span: Any = None
    replacement: Any = answer
    if isinstance(answer, dict):
        span = answer.get("span")
        replacement = answer.get("replacement") or answer.get("text")

    span_ok = True
    if span is not None and error_span:
        wanted = set(normalize_answer_text(error_span).split())
        got = set(normalize_answer_text(str(span)).split())
        if not wanted:
            span_ok = True
        else:
            missing = len(wanted - got)
            span_ok = bool(got & wanted) and missing <= max(overlap_allowance, 0)

    given = normalize_answer_text(str(replacement or ""))
    correct = span_ok and bool(given) and given in expected
    close = (not correct) and span_ok and grammar_close(expected, given)
    if not span_ok:
        detail = "That part of the sentence is fine. The problem is somewhere else."
    elif correct:
        detail = "Correct."
    elif close:
        detail = "Right fix — check the spelling."
    else:
        detail = f"The fix is: “{(item.get('expected') or ['—'])[0]}”."
    return _result(
        correct=correct,
        close=close,
        detail=detail,
        expected=(item.get("expected") or [None])[0],
        span_ok=span_ok,
    )


def _grade_text(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    """``gap_fill`` and ``transform``: normalise, then set membership, then near-miss."""
    expected = _norm_list(item.get("expected"))
    given = normalize_answer_text(str(answer or ""))
    if not expected:
        return _result(correct=None, checked=False, detail="Rate yourself.")
    correct = bool(given) and given in expected
    close = (not correct) and grammar_close(expected, given)
    if correct:
        detail = "Correct."
    elif close:
        detail = "Close — check the spelling. The form is right."
    else:
        detail = f"The answer is “{(item.get('expected') or ['—'])[0]}”."
    return _result(
        correct=correct,
        close=close,
        detail=detail,
        expected=(item.get("expected") or [None])[0],
    )


def grade_item(item: dict[str, Any], answer: Any) -> dict[str, Any]:
    """Grade one item mechanically.

    Returns ``checked=False`` for the three free-production kinds — those go to
    :func:`judge_production`, which is asynchronous because it may call a model.
    """
    kind = str(item.get("kind") or "")
    if kind in FREE_PRODUCTION_KINDS:
        return _result(
            correct=None,
            checked=False,
            detail="This one is read by the language model.",
            needs_llm=True,
        )
    if kind == "discover":
        return _result(
            correct=None,
            checked=False,
            detail="Nothing to get wrong here — the rule card is next.",
        )
    if kind == "interpret":
        return _grade_interpret(item, answer)
    if kind in ("choose_form", "both_ok"):
        return _grade_choice(item, answer)
    if kind == "judge":
        return _grade_judge(item, answer)
    if kind == "contrast_pair":
        return _grade_contrast_pair(item, answer)
    if kind == "order":
        return _grade_order(item, answer)
    if kind == "dictation":
        return _grade_dictation(item, answer)
    if kind == "error_fix":
        return _grade_error_fix(item, answer)
    return _grade_text(item, answer)


# --------------------------------------------------------------------------------------
# Free production — four binary checks, and a rejection that has to show its work
# --------------------------------------------------------------------------------------

JUDGE_PROMPT = """You are checking ONE sentence written by an English learner who was \
asked to use a particular structure.

The structure they were asked to use: {structure}
{rule_line}
What they were asked to write about: {prompt_text}
The learner wrote: "{sentence}"

An automatic check has already run. It says the structure {detected}.
Do not second-guess that result; it is more reliable than you are at this.

Answer only these questions:
1. structure_correct — is the target structure itself built correctly? Ignore EVERY error \
that is not part of that structure: spelling, articles, prepositions, punctuation, \
commas and word choice elsewhere in the sentence are none of your business.
2. fits_situation — given what this structure means, does the sentence make sense for what \
they were asked to write about?
3. offending_span — if structure_correct is false, quote the EXACT words from the \
learner's sentence that are wrong. Copy them character for character. If you cannot quote \
them, structure_correct must be true.
4. minimal_fix — the smallest possible edit that fixes it, as the corrected sentence. \
Empty string if nothing needs changing.
5. why — one short sentence, addressed to the learner, saying what their version means \
rather than saying it is wrong. Empty if accepted.

Never judge: the opinion, whether it is true, the topic, the length, how natural it \
sounds, or whether a native speaker would phrase it that way.
If you are unsure about anything, answer true.

Return ONLY a JSON object:
{{
  "structure_correct": true/false,
  "fits_situation": true/false,
  "offending_span": "exact words from the learner's sentence, or an empty string",
  "minimal_fix": "the corrected sentence, or an empty string",
  "why": "one sentence, or an empty string"
}}"""

_APPEAL_SUFFIX = """

The learner disagrees with the rejection. They say they meant: "{gloss}"
If the sentence CAN carry that meaning with the structure built as they built it, accept \
it. Only keep the rejection if the sentence cannot mean that."""


def _as_bool(value: Any, default: bool = True) -> bool:
    """Leniency bias: anything we cannot read as a decision is read as ``true`` (§2.9)."""
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ("true", "yes", "1", "ok")


async def _ask(prompt: str) -> dict[str, Any] | None:
    from bandready.providers.llm import chat_json

    try:
        return await chat_json(
            [{"role": "user", "content": prompt}], mock_kind="grammar_produce", temperature=0
        )
    except Exception as exc:  # noqa: BLE001 — offline must degrade, never raise
        _log.info("grammar production judge unavailable (%s)", type(exc).__name__)
        return None


async def judge_production(
    sentence: str,
    *,
    structure_slug: str | None,
    prompt_text: str = "",
    rule_line: str = "",
    min_words: int = 0,
    appeal_gloss: str = "",
) -> dict[str, Any]:
    """Judge a free-production answer: A && B && C, and nothing else.

    ``A`` (is the structure present) is mechanical. ``B`` (is it built correctly) and
    ``C`` (does it fit the situation) are binary questions put to the model. ``D`` (the
    smallest edit) is a string it returns and we never grade on.

    The three fairness mechanisms, all of which are code and not prompt:

    * **a rejection must quote itself.** If ``structure_correct`` is false but
      ``offending_span`` is empty or is not a substring of what the learner wrote, the
      rejection is thrown away and the answer is accepted;
    * **asymmetric confirmation.** Accepting costs one call. Rejecting costs a second, and
      **if the two calls disagree, we accept**;
    * **offline is an accept, not a reject.** No network means no verdict, and no verdict
      means the learner rates themselves.
    """
    sentence = (sentence or "").strip()
    if not sentence:
        return {
            "checked": False,
            "accepted": None,
            "detail": "Nothing was written.",
            "structure_present": False,
            "structure_correct": None,
            "fits_situation": None,
            "minimal_fix": "",
            "why": "",
            "appealable": False,
        }

    words = len(sentence.split())
    detected = detectors.detect(structure_slug, sentence)
    structure_name = detectors.describe(structure_slug)

    if detected is True:
        detected_phrase = "IS present"
    elif detected is False:
        detected_phrase = (
            "was NOT detected — but the check is imperfect, so if the learner has in fact "
            "used it, say so and treat the structure as present"
        )
    else:
        detected_phrase = "could not be checked automatically"

    prompt = JUDGE_PROMPT.format(
        structure=structure_name,
        rule_line=f"The rule the learner is working on: {rule_line}" if rule_line else "",
        prompt_text=prompt_text or "(no situation was given — judge the sentence alone)",
        sentence=sentence,
        detected=detected_phrase,
    )
    if appeal_gloss:
        prompt += _APPEAL_SUFFIX.format(gloss=appeal_gloss.strip())

    raw = await _ask(prompt)
    if raw is None:
        return {
            "checked": False,
            "accepted": None,
            "detail": "Could not reach the language model — rate yourself.",
            "structure_present": bool(detected),
            "structure_correct": None,
            "fits_situation": None,
            "minimal_fix": "",
            "why": "",
            "appealable": False,
        }

    verdict = _read_verdict(raw, sentence)

    # A rejection costs a second call. If the two disagree, the learner wins.
    if not verdict["accepted"]:
        second = await _ask(prompt)
        if second is None:
            verdict["accepted"] = True
            verdict["why"] = ""
            verdict["discarded_reason"] = "the confirming check could not be reached"
        else:
            confirm = _read_verdict(second, sentence)
            if confirm["accepted"]:
                verdict = confirm
                verdict["discarded_reason"] = "the two checks disagreed, so the answer stands"

    present = detected if detected is not None else True
    if detected is False and verdict["accepted"]:
        # The model saw the structure where our detector did not. That is our bug (§2.9).
        _log.info(
            "grammar detector gap: %s did not fire on an accepted sentence", structure_slug
        )
        verdict["detector_gap"] = True
        present = True

    accepted = bool(verdict["accepted"]) and (detected is not False or verdict["accepted"])
    short = bool(min_words) and words < min_words

    return {
        "checked": True,
        "accepted": accepted,
        "structure_present": bool(present),
        "structure_correct": verdict["structure_correct"],
        "fits_situation": verdict["fits_situation"],
        "minimal_fix": verdict["minimal_fix"],
        "why": verdict["why"],
        "offending_span": verdict["offending_span"],
        "detector_gap": verdict.get("detector_gap", False),
        "discarded_reason": verdict.get("discarded_reason"),
        "too_short": short,
        "detail": (
            _accepted_detail(verdict, structure_name)
            if accepted
            else (verdict["why"] or f"Check how {structure_name} is built here.")
        ),
        "appealable": not accepted,
        "structure": structure_name,
    }


def _accepted_detail(verdict: dict[str, Any], structure_name: str) -> str:
    """An accepted sentence with a suggested edit is *not* corrected (F5)."""
    fix = verdict.get("minimal_fix") or ""
    if fix:
        return f"That works. Also fine, and slightly more natural: “{fix}”."
    return f"That works — {structure_name}, used for what it is for."


def _read_verdict(raw: dict[str, Any], sentence: str) -> dict[str, Any]:
    """Parse one model response, and throw away any rejection that cannot quote itself."""
    structure_correct = _as_bool(raw.get("structure_correct"), default=True)
    fits = _as_bool(raw.get("fits_situation"), default=True)
    span = str(raw.get("offending_span") or "").strip()
    fix = str(raw.get("minimal_fix") or "").strip()
    why = str(raw.get("why") or "").strip()

    discarded: str | None = None
    if not structure_correct:
        haystack = normalize_answer_text(sentence)
        needle = normalize_answer_text(span)
        if not needle or needle not in haystack:
            # It could not point at the words it objected to, so there is nothing to
            # object to. This is the single strongest fairness mechanism we have.
            structure_correct = True
            discarded = "the rejection did not quote the learner's own words"
            span = ""
            why = ""

    return {
        "accepted": structure_correct and fits,
        "structure_correct": structure_correct,
        "fits_situation": fits,
        "offending_span": span,
        "minimal_fix": fix,
        "why": why,
        **({"discarded_reason": discarded} if discarded else {}),
    }
