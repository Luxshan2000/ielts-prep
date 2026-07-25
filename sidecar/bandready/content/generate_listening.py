"""LLM authoring of listening scripts + questions (07-listening-module.md §10).

Two steps, both against the single configured LLM:

1. **generate** — one part-script (speakers, lines with pauses, 10 questions) from the
   part's context template;
2. **validate** — a lint pass (schema, answers in order, every ``cue_line_index`` line
   really contains its answer) followed by a **blind-answer agreement check**: a second
   call sees only the transcript and the questions, never the key, and must reproduce
   >= 90% of the answers. Ambiguous or unanswerable questions fail here and the script is
   regenerated (max 3 attempts, then the job ends ``error`` / ``validation_error``).

This module also owns the *listening-side glue* over the shared answer matcher —
word-limit counting and the raw->band table — and re-exports :func:`normalize_answer` /
:func:`answers_match` so the route module has one import site.

.. note::
   ``bandready.scoring.answers`` (R2-9) is the single normalizer implementation, owned by
   the reading module. It is imported lazily here; until it lands, a conformant local
   fallback implementing the same spec (07 §5 / 06 §4.1) keeps listening scoring working.
"""

from __future__ import annotations

import inspect
import json
import logging
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.content.listening")

PROMPT_VERSION = "listening-generate-v1"

# --------------------------------------------------------------------------------------
# Part templates (07 §1)
# --------------------------------------------------------------------------------------

PART_CONTEXT: dict[int, str] = {
    1: "everyday social/transactional dialogue between exactly 2 speakers "
       "(booking, enquiry, form-filling)",
    2: "everyday social monologue by 1 speaker (facility tour, event announcement)",
    3: "academic/training discussion between 2-3 speakers (students and a tutor "
       "discussing an assignment)",
    4: "academic monologue: one lecturer speaking on a single subject",
}

PART_QUESTION_TYPES: dict[int, tuple[str, ...]] = {
    1: ("form_completion", "note_completion", "table_completion", "multiple_choice"),
    2: ("note_completion", "sentence_completion", "multiple_choice", "matching"),
    3: ("multiple_choice", "matching", "sentence_completion", "note_completion"),
    4: ("note_completion", "sentence_completion", "table_completion"),
}

PART_ACCENTS: dict[int, str] = {1: "uk", 2: "us", 3: "uk", 4: "uk"}

DEFAULT_TOPICS: dict[int, str] = {
    1: "booking a place on a guided activity",
    2: "a tour of a new community facility",
    3: "two students planning a field-work assignment with their tutor",
    4: "a lecture on an everyday science or social-history subject",
}

QUESTION_TYPES: tuple[str, ...] = (
    "form_completion",
    "note_completion",
    "table_completion",
    "sentence_completion",
    "multiple_choice",
    "matching",
    "map_labelling",
)

# 07 §5 — map_labelling needs a hand-drawn SVG, so generated tests never use it.
GENERATABLE_TYPES = tuple(t for t in QUESTION_TYPES if t != "map_labelling")

SCHEMA_SKETCH = json.dumps(
    {
        "schema_version": 1,
        "part": 1,
        "title": "string",
        "scenario": "string",
        "accent_set": "uk|us|au",
        "target_band": 6.0,
        "speakers": [
            {"id": "narrator", "name": "Narrator", "role": "narrator", "accent": "uk"},
            {"id": "s1", "name": "string", "role": "female_1", "accent": "uk"},
        ],
        "lines": [{"speaker": "s1", "text": "string", "pause_after_ms": 300}],
        "questions": [
            {
                "n": 1,
                "type": "form_completion",
                "instruction": "Write ONE WORD AND/OR A NUMBER for each answer.",
                "word_limit": {"words": 1, "numbers": 1},
                "prompt": "Surname: ______",
                "options": {"A": "string", "B": "string", "C": "string"},
                "answers": [["variant one", "variant two"]],
                "cue_line_index": 4,
            }
        ],
    },
    indent=2,
)

GENERATE_PART_PROMPT = """\
You are an expert IELTS listening-test author. Write an ORIGINAL Part {part} listening \
script and questions. Never reproduce or imitate any real past-paper content.

Requirements:
- Context: {context_description}
- Topic: {topic}
- Target difficulty: band {target_band}
- Speakers: use exactly these speaker ids: {speaker_ids}. Include a "narrator" speaker who \
reads the exam framing: part introduction, "You now have thirty seconds to look at \
questions {q_start} to {q_mid}" (use pause_after_ms 30000 on that line), and mid-part \
question-preview breaks.
- Length: 55-75 dialogue lines (excluding narrator), 4.5-6.5 minutes when spoken.
- Write for the EAR: short sentences, contractions, natural fillers. Spell out numbers that \
must be dictated ("double four seven") and spell names letter-by-letter with hyphens \
("B-R-A-M-L-E-Y") the first time they answer a question.
- Include the standard IELTS distractor pattern: for at least 4 questions, a plausible wrong \
answer is mentioned first and then corrected or superseded ("...actually, make that Thursday").
- Questions: exactly 10, numbered {q_start}-{q_end}, using only these types: {allowed_types}. \
Every answer must be spoken verbatim (or as a number) in exactly one line; set that line's \
index as cue_line_index. Answers appear in question order. Respect the stated word limit.
- answers: give every acceptable variant, lowercase, including both UK and US spellings and \
both digit and word forms of numbers.

Return ONLY JSON matching this schema, no commentary:
{schema_json}
"""

BLIND_ANSWER_PROMPT = """\
You are a strong IELTS candidate. Using only the transcript below, answer questions \
{q_start}-{q_end}. Do not explain. Return JSON {{"answers": {{"<n>": "<answer>"}}}}.

TRANSCRIPT
{transcript}

QUESTIONS
{questions}
"""

# --------------------------------------------------------------------------------------
# Shared answer matching (R2-9) — delegating shims
# --------------------------------------------------------------------------------------

_ARTICLES = ("a ", "an ", "the ")
_NUMBER_WORDS: dict[str, str] = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
    "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15",
    "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19",
    "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50", "sixty": "60",
    "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "100",
    "thousand": "1000",
}


def _shared_answers_module() -> Any | None:
    """The R2-9 shared normalizer, or ``None`` while it is still being written."""
    try:
        from bandready.scoring import answers as shared  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001 — not landed yet / import error in a peer module
        return None
    return shared


def _fallback_normalize(raw: str) -> str:
    """06 §4.1 / 07 §5 normalization, used only until the shared module exists."""
    s = unicodedata.normalize("NFKC", str(raw or "")).strip().lower()
    s = s.replace("’", "'").replace("‘", "'")
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"[.,;:!?\"()]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(\d),(\d{3})\b", r"\1\2", s)
    s = " ".join(_NUMBER_WORDS.get(tok, tok) for tok in s.split(" "))
    s = re.sub(r"(\d+)\s*%", r"\1 percent", s)
    s = re.sub(r"\$\s*(\d+)", r"\1 dollars", s)
    return s.strip()


def normalize_answer(raw: str) -> str:
    """Canonical form of one answer (shared implementation when available)."""
    shared = _shared_answers_module()
    fn = getattr(shared, "normalize_answer", None) or getattr(shared, "normalize", None)
    if callable(fn):
        try:
            return str(fn(raw))
        except Exception as exc:  # noqa: BLE001 — never let scoring die on a peer bug
            _log.warning("shared normalizer failed (%s); using the local fallback", exc)
    return _fallback_normalize(raw)


def _hyphen_variants(value: str) -> set[str]:
    """``hyphen == space`` per 06 §4.1's exactness policy."""
    return {value, value.replace("-", " "), re.sub(r"\s+", " ", value.replace("-", " "))}


def _fallback_match(given: str, variants: Sequence[str]) -> bool:
    normalized = normalize_answer(given)
    if not normalized:
        return False
    keyed: set[str] = set()
    for variant in variants:
        keyed |= _hyphen_variants(normalize_answer(variant))
    if not keyed:
        return False
    candidates = _hyphen_variants(normalized)
    # Variant-aware article rule (R2-9): strip the learner's leading article only when
    # every stored variant also lacks one.
    if not any(v.startswith(_ARTICLES) for v in keyed):
        candidates |= {
            c[len(a):] for c in set(candidates) for a in _ARTICLES if c.startswith(a)
        }
    return bool(candidates & keyed)


def answers_match(given: str, variants: Sequence[str]) -> bool:
    """True iff ``given`` matches any keyed variant. Spelling is strict (07 §5)."""
    shared = _shared_answers_module()
    fn = getattr(shared, "answers_match", None)
    if callable(fn):
        try:
            params = inspect.signature(fn).parameters
        except (TypeError, ValueError):  # pragma: no cover — builtin/callable object
            params = {}
        try:
            if len(params) >= 2:
                return bool(fn(given, list(variants)))
        except Exception as exc:  # noqa: BLE001
            _log.warning("shared matcher failed (%s); using the local fallback", exc)
    return _fallback_match(given, variants)


def count_words(raw: str) -> int:
    """IELTS word counting: a hyphenated compound is ONE word, a numeral is one word."""
    text = normalize_answer(raw)
    return len([tok for tok in text.split(" ") if tok])


def effective_word_limit(word_limit: Any) -> int | None:
    """``{"words": 2, "numbers": 1}`` -> 3. ``None``/absent -> no limit."""
    if word_limit in (None, "", {}):
        return None
    if isinstance(word_limit, int):
        return max(1, word_limit)
    if isinstance(word_limit, Mapping):
        words = int(word_limit.get("words") or 0)
        numbers = int(word_limit.get("numbers") or 0)
        total = words + numbers
        return total if total > 0 else None
    if isinstance(word_limit, str):
        digits = re.findall(r"\d+", word_limit)
        if digits:
            return sum(int(d) for d in digits)
    return None


def edit_distance(a: str, b: str) -> int:
    """Levenshtein distance — only ever used to *tag* near misses, never to award marks."""
    if a == b:
        return 0
    if not a or not b:
        return max(len(a), len(b))
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb))
            )
        previous = current
    return previous[-1]


def is_near_miss(given: str, variants: Sequence[str]) -> bool:
    """Edit distance 1-2 from a keyed variant: wrong, but tagged ``near_miss_spelling``."""
    normalized = normalize_answer(given)
    if len(normalized) < 3:
        return False
    for variant in variants:
        distance = edit_distance(normalized, normalize_answer(variant))
        if 1 <= distance <= 2:
            return True
    return False


# --------------------------------------------------------------------------------------
# Script helpers
# --------------------------------------------------------------------------------------

def flatten_questions(script: Mapping[str, Any]) -> list[dict[str, Any]]:
    """One row per numbered question, matching ``listening_questions`` (07 §11)."""
    flattened: list[dict[str, Any]] = []
    for index, question in enumerate(script.get("questions") or []):
        if not isinstance(question, Mapping):
            continue
        number = question.get("n", question.get("number", index + 1))
        try:
            number = int(number)
        except (TypeError, ValueError):
            number = index + 1
        slots = normalize_answer_slots(question.get("answers"))
        flattened.append(
            {
                "number": number,
                "qtype": str(question.get("type") or question.get("qtype") or "note_completion"),
                "word_limit": effective_word_limit(question.get("word_limit")),
                "answers": slots,
                "cue_line_index": question.get("cue_line_index"),
                "explanation": question.get("explanation"),
                "instruction": question.get("instruction"),
                "prompt": question.get("prompt"),
                "options": question.get("options"),
                "select_n": question.get("select_n"),
                "asset": question.get("asset"),
            }
        )
    flattened.sort(key=lambda q: q["number"])
    return flattened


def normalize_answer_slots(answers: Any) -> list[list[str]]:
    """Coerce authored ``answers`` into ``[[variant, ...], ...]`` (one list per slot)."""
    if answers is None:
        return []
    if isinstance(answers, str):
        return [[answers]]
    if isinstance(answers, Mapping):
        return [[str(v) for v in answers.values()]]
    slots: list[list[str]] = []
    for slot in answers:
        if isinstance(slot, str):
            slots.append([slot])
        elif isinstance(slot, Iterable):
            variants = [str(v) for v in slot if str(v).strip()]
            if variants:
                slots.append(variants)
    return slots


def transcript_text(script: Mapping[str, Any], *, with_speakers: bool = True) -> str:
    names = {
        str(s.get("id")): str(s.get("name") or s.get("id"))
        for s in (script.get("speakers") or [])
        if isinstance(s, Mapping)
    }
    out: list[str] = []
    for index, line in enumerate(script.get("lines") or []):
        if not isinstance(line, Mapping):
            continue
        text = str(line.get("text") or "").strip()
        if not text:
            continue
        if with_speakers:
            speaker = names.get(str(line.get("speaker")), str(line.get("speaker") or "?"))
            out.append(f"[{index}] {speaker}: {text}")
        else:
            out.append(text)
    return "\n".join(out)


def _questions_for_prompt(script: Mapping[str, Any]) -> str:
    rows: list[str] = []
    for question in flatten_questions(script):
        line = f"{question['number']}. ({question['qtype']}) {question.get('prompt') or ''}".strip()
        options = question.get("options")
        if isinstance(options, Mapping):
            line += "  " + "; ".join(f"{k}: {v}" for k, v in options.items())
        rows.append(line)
    return "\n".join(rows)


# --------------------------------------------------------------------------------------
# Validation (07 §10)
# --------------------------------------------------------------------------------------

class ValidationReport:
    """Errors block acceptance; warnings are logged and ride along in the job result."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.agreement: tuple[int, int] | None = None

    @property
    def ok(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": self.errors,
            "warnings": self.warnings,
            "agreement": (
                {"correct": self.agreement[0], "total": self.agreement[1]}
                if self.agreement
                else None
            ),
        }


def lint_script(script: Mapping[str, Any], *, strict: bool = True) -> ValidationReport:
    """Schema + internal-consistency lint (07 §10 pass 1)."""
    report = ValidationReport()
    add = report.errors.append
    warn = report.warnings.append

    part = script.get("part")
    if not isinstance(part, int) or not 1 <= part <= 4:
        add("part must be an integer 1-4")

    speakers = script.get("speakers") or []
    speaker_ids = {
        str(s.get("id")) for s in speakers if isinstance(s, Mapping) and s.get("id")
    }
    if not speaker_ids:
        add("the script has no speakers")
    if strict and "narrator" not in speaker_ids:
        add("the script has no 'narrator' speaker for the exam framing")

    lines = [line for line in (script.get("lines") or []) if isinstance(line, Mapping)]
    if not lines:
        add("the script has no lines")
    for index, line in enumerate(lines):
        if str(line.get("speaker") or "") not in speaker_ids:
            add(f"line {index} names an unknown speaker {line.get('speaker')!r}")
        if not str(line.get("text") or "").strip():
            add(f"line {index} has no text")

    questions = flatten_questions(script)
    if strict and len(questions) != 10:
        add(f"expected exactly 10 questions, got {len(questions)}")
    if not questions:
        add("the script has no questions")

    numbers = [q["number"] for q in questions]
    if numbers != sorted(numbers) or len(set(numbers)) != len(numbers):
        add("question numbers must be unique and ascending")

    cue_indices: list[int] = []
    for question in questions:
        n = question["number"]
        if question["qtype"] not in QUESTION_TYPES:
            add(f"question {n} has unknown type {question['qtype']!r}")
        if question["qtype"] == "map_labelling" and not question.get("asset"):
            add(f"question {n} is map_labelling but carries no asset (07 §5)")
        if not question["answers"]:
            add(f"question {n} has no answers")
        cue = question.get("cue_line_index")
        if cue is None:
            (add if strict else warn)(f"question {n} has no cue_line_index")
            continue
        try:
            cue = int(cue)
        except (TypeError, ValueError):
            add(f"question {n} has a non-integer cue_line_index")
            continue
        if not 0 <= cue < len(lines):
            add(f"question {n} points at line {cue}, which does not exist")
            continue
        cue_indices.append(cue)
        cue_text = normalize_answer(str(lines[cue].get("text") or ""))
        spoken = any(
            normalize_answer(variant) and normalize_answer(variant) in cue_text
            for slot in question["answers"]
            for variant in slot
        )
        letters_only = all(
            len(str(variant).strip()) <= 2
            for slot in question["answers"]
            for variant in slot
        )
        if not spoken and not letters_only:
            (add if strict else warn)(
                f"question {n}'s cue line {cue} does not contain any accepted answer"
            )

    if cue_indices and cue_indices != sorted(cue_indices):
        warn("cue lines are not in question order — answers should follow the audio")

    total_chars = sum(len(str(line.get("text") or "")) for line in lines)
    seconds = total_chars / 15.0
    if strict and seconds < 120:
        add(f"the script is far too short ({seconds:.0f}s of speech; 07 §1 wants 270-390s)")
    elif strict and not 240 <= seconds <= 480:
        warn(f"estimated speech duration {seconds:.0f}s is outside the 4.5-6.5 min target")

    if strict:
        missing = _missing_spelling_pairs(questions)
        if missing:
            warn(
                "answers missing a UK/US spelling variant: "
                + ", ".join(sorted(missing)[:6])
            )
    return report


# ~40 common UK/US pairs (07 §5). Both spellings must be keyed as variants.
UK_US_PAIRS: dict[str, str] = {
    "centre": "center", "theatre": "theater", "litre": "liter", "metre": "meter",
    "fibre": "fiber", "colour": "color", "favour": "favor", "harbour": "harbor",
    "labour": "labor", "neighbour": "neighbor", "behaviour": "behavior",
    "flavour": "flavor", "humour": "humor", "honour": "honor", "rumour": "rumor",
    "vapour": "vapor", "odour": "odor", "armour": "armor", "parlour": "parlor",
    "organise": "organize", "recognise": "recognize", "realise": "realize",
    "specialise": "specialize", "analyse": "analyze", "apologise": "apologize",
    "catalogue": "catalog", "dialogue": "dialog", "programme": "program",
    "practise": "practice", "licence": "license", "defence": "defense",
    "offence": "offense", "pretence": "pretense", "storey": "story",
    "grey": "gray", "tyre": "tire", "kerb": "curb", "plough": "plow",
    "cheque": "check", "aluminium": "aluminum", "enrolment": "enrollment",
    "jewellery": "jewelry", "traveller": "traveler", "cancelled": "canceled",
}


def _missing_spelling_pairs(questions: Sequence[Mapping[str, Any]]) -> set[str]:
    both = {**UK_US_PAIRS, **{v: k for k, v in UK_US_PAIRS.items()}}
    missing: set[str] = set()
    for question in questions:
        for slot in question["answers"]:
            keyed = {normalize_answer(v) for v in slot}
            for variant in list(keyed):
                for word in variant.split(" "):
                    partner = both.get(word)
                    if not partner:
                        continue
                    swapped = variant.replace(word, partner)
                    if swapped not in keyed:
                        missing.add(f"{word}/{partner}")
    return missing


def _llm_is_mock() -> bool:
    try:
        from bandready.providers.presets import is_mock_preset
        from bandready.settings_store import get_slot

        cfg = get_slot("llm")
    except Exception:  # noqa: BLE001 — settings unavailable: assume a real provider
        return False
    return is_mock_preset(cfg.get("preset")) or str(cfg.get("base_url", "")).startswith(
        "mock://"
    )


async def blind_answer_check(
    script: Mapping[str, Any], *, threshold: float = 0.9
) -> tuple[int, int]:
    """07 §10 pass 2 — a model that never saw the key must answer the questions.

    Returns ``(correct, total)``; raises :class:`ApiError` below ``threshold``.
    """
    from bandready.providers.llm import chat_json

    questions = flatten_questions(script)
    if not questions:
        return 0, 0
    prompt = BLIND_ANSWER_PROMPT.format(
        q_start=questions[0]["number"],
        q_end=questions[-1]["number"],
        transcript=transcript_text(script, with_speakers=True),
        questions=_questions_for_prompt(script),
    )
    payload = await chat_json(
        [{"role": "user", "content": prompt}], mock_kind="generic", temperature=0.0
    )
    given = payload.get("answers")
    if not isinstance(given, Mapping):
        raise ApiError(
            422, "validation_error", "the blind-answer check returned no answers object"
        )
    correct = 0
    for question in questions:
        candidate = str(given.get(str(question["number"])) or "")
        slots = question["answers"]
        if slots and answers_match(candidate, slots[0]):
            correct += 1
    total = len(questions)
    if total and correct / total < threshold:
        raise ApiError(
            422,
            "validation_error",
            f"blind-answer agreement was {correct}/{total}; the questions are ambiguous "
            "or unanswerable from the transcript",
        )
    return correct, total


async def validate_script(script: Mapping[str, Any], *, strict: bool = True) -> ValidationReport:
    """Full validation: lint, then (real providers only) the blind-answer check."""
    report = lint_script(script, strict=strict)
    if not report.ok:
        return report
    if _llm_is_mock():
        report.warnings.append("blind-answer check skipped: the LLM is the mock provider")
        return report
    try:
        report.agreement = await blind_answer_check(script)
    except ApiError as exc:
        report.errors.append(exc.detail)
    return report


# --------------------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------------------

def persist_script(
    session: Any,
    script: Mapping[str, Any],
    *,
    script_id: str | None = None,
    source: str = "generated",
    topic_id: str | None = None,
) -> str:
    """Insert ``listening_scripts`` + the flattened ``listening_questions`` rows."""
    from ulid import ULID

    from bandready.db import models as m

    sid = script_id or f"ls_{ULID()}"
    part = int(script.get("part") or 1)
    accent = str(script.get("accent_set") or PART_ACCENTS.get(part, "uk")).lower()
    if accent not in ("uk", "us", "au"):
        accent = "uk"
    try:
        target_band = float(script.get("target_band") or 6.0)
    except (TypeError, ValueError):
        target_band = 6.0

    session.add(
        m.ListeningScript(
            id=sid,
            part=part,
            title=str(script.get("title") or f"Part {part} practice"),
            topic_id=topic_id,
            accent_set=accent,
            target_band=target_band,
            script_json=json.dumps(dict(script), ensure_ascii=False),
            source=source,
        )
    )
    # models.py declares no ORM relationships, so the unit of work does not know that
    # listening_questions depends on listening_scripts — flush the parent first or the
    # child INSERT hits the foreign key.
    session.flush()
    for question in flatten_questions(script):
        session.add(
            m.ListeningQuestion(
                id=f"lq_{ULID()}",
                script_id=sid,
                number=int(question["number"]),
                qtype=str(question["qtype"]),
                word_limit=question["word_limit"],
                answers_json=json.dumps(question["answers"], ensure_ascii=False),
                cue_line_index=(
                    int(question["cue_line_index"])
                    if question.get("cue_line_index") is not None
                    else None
                ),
                explanation=question.get("explanation"),
            )
        )
    session.flush()
    return sid


# --------------------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------------------

def _progress(job_id: str | None, pct: int, detail: str) -> None:
    if not job_id:
        return
    try:
        from bandready.server.jobs import job_manager

        job_manager.set_progress(job_id, pct, detail)
    except Exception as exc:  # noqa: BLE001
        _log.debug("progress update failed: %s", exc)


def _coerce_script(
    payload: Mapping[str, Any], *, part: int, target_band: float, accent_set: str
) -> dict[str, Any]:
    """Drop the LLM envelope keys and fill in the fields we own."""
    script = {k: v for k, v in payload.items() if not str(k).startswith("_")}
    inner = script.get("script")
    if isinstance(inner, Mapping) and "lines" in inner:
        script = {k: v for k, v in inner.items() if not str(k).startswith("_")}
    script.setdefault("schema_version", 1)
    script["part"] = part
    script["target_band"] = target_band
    script["accent_set"] = accent_set
    script.setdefault("title", f"Part {part} practice")
    return script


async def generate_script(
    *,
    part: int = 1,
    topic: str | None = None,
    target_band: float = 6.0,
    accent_set: str | None = None,
    job_id: str | None = None,
    persist: bool = True,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """Generate, validate and store one part-script. Job body for ``listening_generate``."""
    from bandready.providers.llm import chat_json

    part = int(part or 1)
    if part not in PART_CONTEXT:
        raise ApiError(422, "validation_error", "part must be 1, 2, 3 or 4")
    accent = str(accent_set or PART_ACCENTS.get(part, "uk")).lower()
    if accent not in ("uk", "us", "au"):
        raise ApiError(422, "validation_error", "accent_set must be uk, us or au")
    band = float(target_band or 6.0)
    subject = topic or DEFAULT_TOPICS[part]
    q_start = (part - 1) * 10 + 1
    q_end = q_start + 9
    speaker_ids = ["narrator", "s1"] if part in (2, 4) else ["narrator", "s1", "s2"]
    if part == 3:
        speaker_ids.append("s3")

    prompt = GENERATE_PART_PROMPT.format(
        part=part,
        context_description=PART_CONTEXT[part],
        topic=subject,
        target_band=band,
        speaker_ids=", ".join(speaker_ids),
        q_start=q_start,
        q_mid=q_start + 4,
        q_end=q_end,
        allowed_types=", ".join(PART_QUESTION_TYPES[part]),
        schema_json=SCHEMA_SKETCH,
    )

    strict = not _llm_is_mock()
    last: ValidationReport | None = None
    for attempt in range(1, max_attempts + 1):
        _progress(job_id, 10 + (attempt - 1) * 25, f"writing the script (attempt {attempt})")
        payload = await chat_json(
            [{"role": "user", "content": prompt}],
            mock_kind="listening_generate",
            temperature=0.8,
        )
        script = _coerce_script(payload, part=part, target_band=band, accent_set=accent)
        _progress(job_id, 20 + (attempt - 1) * 25, "validating the questions")
        report = await validate_script(script, strict=strict)
        last = report
        if report.ok:
            _progress(job_id, 90, "saving")
            script_id: str | None = None
            if persist:
                from bandready.db.engine import session_scope

                with session_scope() as session:
                    script_id = persist_script(session, script)
            _progress(job_id, 100, "script ready")
            return {
                "script_id": script_id,
                "part": part,
                "title": script.get("title"),
                "accent_set": accent,
                "questions": len(flatten_questions(script)),
                "validation": report.as_dict(),
                "script": None if persist else script,
            }
        _log.warning(
            "listening script attempt %d/%d rejected: %s",
            attempt, max_attempts, "; ".join(report.errors[:3]),
        )

    detail = "; ".join(last.errors[:3]) if last else "unknown validation failure"
    raise ApiError(
        422,
        "validation_error",
        f"could not author a valid Part {part} script in {max_attempts} attempts: {detail}",
    )


async def generate_test(
    *,
    target_band: float = 6.0,
    topics: Sequence[str] | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Four validated part-scripts assembled into one ``listening_tests`` row (07 §10)."""
    from ulid import ULID

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    script_ids: list[str] = []
    titles: list[str] = []
    for part in (1, 2, 3, 4):
        _progress(job_id, (part - 1) * 24, f"authoring part {part} of 4")
        topic = topics[part - 1] if topics and len(topics) >= part else None
        result = await generate_script(
            part=part, topic=topic, target_band=target_band, persist=True
        )
        if not result.get("script_id"):  # pragma: no cover — persist=True always sets it
            raise ApiError(500, "internal", "a generated script was not stored")
        script_ids.append(str(result["script_id"]))
        titles.append(str(result.get("title") or f"Part {part}"))

    test_id = f"lt_{ULID()}"
    with session_scope() as session:
        session.add(
            m.ListeningTest(
                id=test_id,
                title=titles[0] if titles else "Generated listening test",
                p1_id=script_ids[0],
                p2_id=script_ids[1],
                p3_id=script_ids[2],
                p4_id=script_ids[3],
                source="generated",
            )
        )
    _progress(job_id, 100, "test ready")
    return {"test_id": test_id, "script_ids": script_ids}
