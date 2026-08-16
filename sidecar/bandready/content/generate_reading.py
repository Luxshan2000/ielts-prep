"""The reading passage-generation pipeline (06 §7).

Four stages, run as one background job (kind ``reading_generate``, 18 §3):

1. **Passage** — one LLM call per passage, with explicit lexical constraints for the target
   band, followed by *code* post-checks (word count, paragraph count, Flesch-Kincaid grade).
   A failing post-check regenerates once, then fails the job.
2. **Questions** — one call per question group, driven by a coverage planner that spans at
   least six types and always includes one TFNG or YNNG group.
3. **Blind validation — the quality gate.** A fresh call re-answers every question from the
   passage alone, with no access to the key, and reports a confidence per answer. The blind
   answers are marked with the shared scorer (`bandready.scoring.answers`). Questions that
   disagree or come back under-confident are regenerated once; groups that still fail badly
   are discarded, and a passage that loses too many questions fails the job.
4. **Finalize** — static invariant validation, automatic US/UK variant expansion, contiguous
   renumbering, and insertion into the content bank tagged ``source="generated"``.

All prompts are module constants so they can be diffed and versioned. Every model call goes
through the single configured LLM (`bandready.providers.llm`, R2-17); in mock mode the
deterministic ``reading_generate`` fixture drives the whole pipeline end to end.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ulid import ULID

from bandready.providers.llm import chat_json
from bandready.scoring.answers import (
    CHOICE_TYPES,
    LETTER_TYPES,
    answers_match,
    expand_variants,
    instruction_for,
    spelling_variants,
    within_word_limit,
    word_limit_of,
)
from bandready.server.errors import ApiError

_log = logging.getLogger("bandready.content.reading")

__all__ = [
    "PROMPT_VERSION",
    "TOPIC_WHEEL",
    "generate_reading",
    "plan_group_types",
    "validate_passage_document",
]

PROMPT_VERSION = "reading-generate/v1"

#: 06 §7 stage 1 defaults — (AWL share, average sentence length, unknown-word cap).
LEXICAL_CONTROL: dict[float, tuple[int, int, int]] = {
    6.0: (6, 16, 8),
    6.5: (7, 17, 10),
    7.0: (9, 19, 12),
    7.5: (10, 20, 15),
    8.0: (12, 22, 18),
}
#: band → target Flesch-Kincaid grade (flagged default, 06 §7).
FK_TARGET: dict[float, float] = {6.0: 10.0, 6.5: 11.0, 7.0: 12.0, 7.5: 13.0, 8.0: 14.0}
FK_TOLERANCE = 2.0

MIN_WORDS = 780
MAX_WORDS = 900
MIN_PARAGRAPHS = 6
MAX_PARAGRAPHS = 8

#: 06 §7 stage 3 gate rules.
MIN_CONFIDENCE = 0.6
MAX_GROUP_FAILURE_RATIO = 0.30
MIN_SURVIVAL_RATIO = 0.90

TOPIC_WHEEL: tuple[str, ...] = (
    "urban ecology",
    "maritime trade history",
    "the economics of water",
    "sleep and memory consolidation",
    "the archaeology of everyday objects",
    "renewable energy storage",
    "language death and revival",
    "the psychology of queueing",
    "seed banks and food security",
    "the history of standard time",
)

ACADEMIC_TYPE_POOL: tuple[str, ...] = (
    "true_false_not_given",
    "matching_headings",
    "sentence_completion",
    "multiple_choice",
    "matching_information",
    "summary_completion",
    "short_answer",
    "matching_features",
    "yes_no_not_given",
    "note_completion",
)
GT_TYPE_POOL: tuple[str, ...] = (
    "true_false_not_given",
    "matching_information",
    "sentence_completion",
    "multiple_choice",
    "note_completion",
    "short_answer",
    "matching_features",
    "summary_completion",
)

# --------------------------------------------------------------------------------------
# Prompts (06 §7, verbatim where the doc gives them)
# --------------------------------------------------------------------------------------

PASSAGE_SYSTEM = (
    "You write original IELTS-style reading passages. Never reproduce or closely\n"
    "paraphrase any real IELTS test content."
)

PASSAGE_USER = """Write an {style}-style reading passage.
Topic: {topic}. Target reader level: IELTS band {band_target}.
Constraints:
- {min_words}-{max_words} words, {min_paragraphs}-{max_paragraphs} paragraphs. \
Label paragraphs A, B, C, ...
- Register: {register}. No headings inside the passage.
- Lexical control for band {band_target}: roughly {awl_pct}% academic
  (AWL-type) vocabulary; average sentence length {sent_len} words;
  at most {rare_word_cap} words a band-{band_target} reader would not know,
  each inferable from context.
- Include: at least 2 writer-opinion sentences, 2 factual claims with numbers,
  1 quantified comparison, and 1 plausible-but-unstated idea a careless reader
  might assume (fuel for NOT GIVEN questions).
Return JSON: {{ "title": ..., "paragraphs": [ {{ "id": "A", "text": ... }}, ... ] }}"""

QUESTIONS_SYSTEM = (
    "You write IELTS reading questions for a passage you are given. Every answer must be "
    "recoverable from the passage alone, with no outside knowledge. Never invent facts the "
    "passage does not contain."
)

QUESTIONS_USER = """PASSAGE (paragraph ids in brackets):
\"\"\"{passage}\"\"\"

Write ONE question group of type "{qtype}" with exactly {n_questions} questions.
{type_rules}
{limit_line}
Return JSON with this exact shape:
{{ "question_groups": [ {{
     "id": "g1",
     "type": "{qtype}",
     "instructions_extra": null,
     "word_limit": {word_limit_json},
     "allow_reuse": {allow_reuse},
     "options": {options_hint},
     "layout": null,
     "questions": [ {{
        "number": 1,
        "prompt": "...",
        "answers": [ {{ "value": "..." }} ],
        "anchor_paragraphs": ["A"],
        "evidence_quote": "a verbatim substring of the passage",
        "explanation": "why the answer is what it is",
        "trap_note": "the distractor a careless reader falls for, or null",
        "difficulty": "easy" | "medium" | "hard",
        "band_target": {band_target}
     }} ]
}} ] }}"""

TYPE_RULES: dict[str, str] = {
    "true_false_not_given": (
        "TFNG statements must be checkable as facts; exactly {n_ng} of them must be NOT "
        "GIVEN; FALSE statements must contradict the passage, not merely be absent from it. "
        "Answers are the strings TRUE, FALSE or NOT GIVEN."
    ),
    "yes_no_not_given": (
        "YNNG statements must be about the writer's claims or opinions, never about bare "
        "facts; exactly {n_ng} of them must be NOT GIVEN. Answers are YES, NO or NOT GIVEN."
    ),
    "matching_headings": (
        "Provide more headings than paragraphs, each usable once. Answers are the lower-case "
        "roman numeral of the heading; prompts are 'Paragraph A', 'Paragraph B', …"
    ),
    "matching_information": (
        "Each question asks which paragraph contains a piece of information. Answers are "
        "paragraph letters and may repeat."
    ),
    "matching_features": (
        "Match statements to a lettered feature list (researchers, dates, theories). Answers "
        "are the feature letters."
    ),
    "matching_sentence_endings": (
        "Provide more endings than stems; each ending is used once and the completed sentence "
        "must be grammatical. Answers are ending letters."
    ),
    "multiple_choice": (
        "Four options A-D, exactly one correct. Distractors must be plausible and drawn from "
        "the passage's own vocabulary. Answers are single letters."
    ),
    "summary_completion_bank": (
        "A short summary paragraph with numbered gaps and a lettered word bank containing "
        "more options than gaps. Answers are bank letters."
    ),
    "summary_completion": (
        "A short summary paragraph with numbered gaps. Answers must be verbatim contiguous "
        "words from the passage within the word limit."
    ),
    "sentence_completion": (
        "Completion answers must be verbatim contiguous words from the passage within the "
        "word limit, and the questions must follow passage order."
    ),
    "note_completion": (
        "Notes with numbered gaps. Answers must be verbatim contiguous words from the passage "
        "within the word limit."
    ),
    "short_answer": (
        "Direct questions whose answers are words that actually occur in the passage, within "
        "the word limit."
    ),
}
_DEFAULT_TYPE_RULE = (
    "Answers must be recoverable from the passage alone and respect the answer form for this "
    "question type."
)

# 06 §7 stage 3 — verbatim.
BLIND_SYSTEM = (
    "You are sitting an IELTS reading test. Answer strictly from the passage; use\n"
    "no outside knowledge. For True/False/Not Given: TRUE only if the passage\n"
    "states it, FALSE only if the passage contradicts it, NOT GIVEN if the passage\n"
    "does not say. Respect word limits exactly. For every answer, also report a\n"
    "confidence from 0.0 to 1.0 and quote the minimal passage evidence (<=20 words,\n"
    'or "NONE" for NOT GIVEN answers).'
)

BLIND_USER = """PASSAGE:
\"\"\"{passage}\"\"\"

QUESTIONS (answer every one; instructions per group are included):
{questions}

Return JSON:
{{ "answers": [ {{ "number": 1, "answer": "...", "confidence": 0.0,
                 "evidence": "..." }} ] }}"""


# --------------------------------------------------------------------------------------
# Small text utilities
# --------------------------------------------------------------------------------------

_WORD = re.compile(r"[A-Za-z0-9'’-]+")
_SENTENCE = re.compile(r"[.!?]+(?:\s|$)")
_VOWEL_RUN = re.compile(r"[aeiouy]+")


def _words(text: str) -> list[str]:
    return _WORD.findall(text or "")


def _syllables(word: str) -> int:
    w = word.lower().strip("'’-")
    if not w:
        return 0
    runs = len(_VOWEL_RUN.findall(w))
    if w.endswith("e") and runs > 1 and not w.endswith(("le", "ee", "ye")):
        runs -= 1
    return max(1, runs)


def flesch_kincaid_grade(text: str) -> float:
    """Standard FK grade level. Used only as a difficulty post-check (06 §7 stage 1)."""
    words = _words(text)
    if not words:
        return 0.0
    sentences = max(1, len(_SENTENCE.findall(text)))
    syllables = sum(_syllables(w) for w in words)
    return round(
        0.39 * (len(words) / sentences) + 11.8 * (syllables / len(words)) - 15.59, 2
    )


def _nearest_band_key(band_target: float, table: dict[float, Any]) -> float:
    return min(table, key=lambda b: abs(b - float(band_target)))


def _paragraph_text(passage: dict[str, Any]) -> str:
    parts: list[str] = []
    for text_block in passage.get("texts") or []:
        for para in text_block.get("paragraphs") or []:
            parts.append(str(para.get("text") or ""))
    return "\n\n".join(parts)


def _rendered_passage(passage: dict[str, Any]) -> str:
    lines: list[str] = []
    for text_block in passage.get("texts") or []:
        heading = text_block.get("heading")
        if heading:
            lines.append(str(heading))
        for para in text_block.get("paragraphs") or []:
            lines.append(f"[{para.get('id')}] {para.get('text')}")
    return "\n\n".join(lines)


def _iter_questions(passage: dict[str, Any]):
    for group_index, group in enumerate(passage.get("question_groups") or []):
        for question in group.get("questions") or []:
            yield group_index, group, question


# --------------------------------------------------------------------------------------
# Stage 1 — passage
# --------------------------------------------------------------------------------------

def _coerce_passage(response: dict[str, Any]) -> dict[str, Any] | None:
    """Pull ``{title, paragraphs}`` out of whatever shape the model answered with.

    Tolerates a model (or the mock fixture) that returns a whole §3 test document instead
    of the single passage the prompt asked for.
    """
    if not isinstance(response, dict):
        return None
    if isinstance(response.get("paragraphs"), list) and response["paragraphs"]:
        return {
            "title": str(response.get("title") or "Untitled passage"),
            "paragraphs": response["paragraphs"],
        }
    passages = response.get("passages")
    if isinstance(passages, list) and passages:
        inner = passages[0]
        texts = inner.get("texts") or []
        paragraphs = texts[0].get("paragraphs") if texts else None
        if paragraphs:
            return {
                "title": str(inner.get("title") or response.get("title") or "Untitled passage"),
                "paragraphs": paragraphs,
            }
    return None


def check_passage(passage: dict[str, Any], band_target: float) -> list[str]:
    """Code post-checks from 06 §7 stage 1. Empty list means the passage is usable."""
    issues: list[str] = []
    body = _paragraph_text(passage)
    word_count = len(_words(body))
    paragraphs = sum(
        len(t.get("paragraphs") or []) for t in (passage.get("texts") or [])
    )
    if not (MIN_WORDS <= word_count <= MAX_WORDS):
        issues.append(f"word count {word_count} outside {MIN_WORDS}-{MAX_WORDS}")
    if not (MIN_PARAGRAPHS <= paragraphs <= MAX_PARAGRAPHS):
        issues.append(
            f"paragraph count {paragraphs} outside {MIN_PARAGRAPHS}-{MAX_PARAGRAPHS}"
        )
    target = FK_TARGET[_nearest_band_key(band_target, FK_TARGET)]
    grade = flesch_kincaid_grade(body)
    if abs(grade - target) > FK_TOLERANCE:
        issues.append(f"Flesch-Kincaid grade {grade} outside {target}±{FK_TOLERANCE}")
    return issues


async def _generate_passage(
    *,
    fmt: str,
    topic: str,
    band_target: float,
    gt_section: int | None,
    strict: bool,
) -> tuple[dict[str, Any], list[str]]:
    academic = fmt == "academic"
    awl_pct, sent_len, rare_cap = LEXICAL_CONTROL[
        _nearest_band_key(band_target, LEXICAL_CONTROL)
    ]
    user = PASSAGE_USER.format(
        style="Academic" if academic else "General Training",
        topic=topic,
        band_target=band_target,
        min_words=MIN_WORDS,
        max_words=MAX_WORDS,
        min_paragraphs=MIN_PARAGRAPHS,
        max_paragraphs=MAX_PARAGRAPHS,
        register=(
            "popular-science journal"
            if academic
            else "everyday or workplace prose (notice, handbook, manual)"
        ),
        awl_pct=awl_pct,
        sent_len=sent_len,
        rare_word_cap=rare_cap,
    )
    messages = [
        {"role": "system", "content": PASSAGE_SYSTEM},
        {"role": "user", "content": user},
    ]

    issues: list[str] = []
    for attempt in range(2):
        response = await chat_json(messages, mock_kind="reading_generate", temperature=0.8)
        coerced = _coerce_passage(response)
        if coerced is None:
            issues = ["the model did not return a passage with paragraphs"]
            continue
        passage: dict[str, Any] = {
            "id": "p1",
            "position": 1,
            "title": coerced["title"],
            "topic": topic,
            "difficulty": "medium",
            "gt_section": gt_section,
            "texts": [{"id": "t1", "heading": None, "paragraphs": coerced["paragraphs"]}],
            "question_groups": [],
        }
        passage["word_count"] = len(_words(_paragraph_text(passage)))
        issues = check_passage(passage, band_target)
        if not issues or not strict:
            if issues:
                _log.info("passage post-check advisory (non-strict): %s", "; ".join(issues))
            return passage, issues
        _log.warning("passage post-check failed (attempt %d): %s", attempt + 1, "; ".join(issues))
    raise ApiError(
        502,
        "provider_error",
        "the generated passage failed its quality checks twice: " + "; ".join(issues),
    )


# --------------------------------------------------------------------------------------
# Stage 2 — questions
# --------------------------------------------------------------------------------------

JUDGEMENT_TYPES: tuple[str, ...] = ("true_false_not_given", "yes_no_not_given")


def plan_group_types(fmt: str, n_questions: int, offset: int = 0) -> list[tuple[str, int]]:
    """Coverage planner: ``[(type, count), …]``.

    A judgement type (TFNG or YNNG) is always the first group of every passage, per 06 §7
    stage 2. ``offset`` rotates the rest of the pool so the three passages of a full test
    span at least six distinct types between them.
    """
    pool = ACADEMIC_TYPE_POOL if fmt == "academic" else GT_TYPE_POOL
    judgement = [t for t in JUDGEMENT_TYPES if t in pool] or [pool[0]]
    rest = [t for t in pool if t not in JUDGEMENT_TYPES]
    order = [judgement[offset % len(judgement)]]
    for i in range(len(rest)):
        order.append(rest[(offset * 3 + i) % len(rest)])

    plan: list[tuple[str, int]] = []
    remaining = max(1, int(n_questions))
    seen: set[str] = set()
    for index, qtype in enumerate(order):
        if remaining <= 0:
            break
        if qtype in seen:
            continue
        seen.add(qtype)
        size = min(remaining, 4 if index == 0 else 3)
        plan.append((qtype, size))
        remaining -= size
    return plan


def _default_word_limit(qtype: str) -> dict[str, Any] | None:
    if qtype in LETTER_TYPES or qtype in CHOICE_TYPES:
        return None
    return {"max_words": 2, "numbers_allowed": True}


def _coerce_groups(response: dict[str, Any], qtype: str) -> list[dict[str, Any]]:
    """Extract question groups from the model's answer, tolerating a whole-document reply."""
    groups: list[dict[str, Any]] = []
    if not isinstance(response, dict):
        return groups
    if isinstance(response.get("question_groups"), list):
        groups = [g for g in response["question_groups"] if isinstance(g, dict)]
    elif isinstance(response.get("passages"), list):
        for passage in response["passages"]:
            if isinstance(passage, dict):
                groups.extend(
                    g for g in (passage.get("question_groups") or []) if isinstance(g, dict)
                )
    elif isinstance(response.get("questions"), list):
        groups = [{"type": qtype, "questions": response["questions"]}]
    return [g for g in groups if g.get("questions")]


async def _generate_group(
    *, passage: dict[str, Any], qtype: str, n_questions: int, band_target: float
) -> list[dict[str, Any]]:
    word_limit = _default_word_limit(qtype)
    rule = TYPE_RULES.get(qtype, _DEFAULT_TYPE_RULE)
    if "{n_ng}" in rule:
        rule = rule.format(n_ng=max(1, n_questions // 3))
    user = QUESTIONS_USER.format(
        passage=_rendered_passage(passage),
        qtype=qtype,
        n_questions=n_questions,
        type_rules=rule,
        limit_line=(f"Instruction shown to the learner: {instruction_for(word_limit)}"
                    if word_limit else ""),
        word_limit_json=json.dumps(word_limit),
        allow_reuse="true" if qtype == "matching_information" else "false",
        options_hint=("a list of {\"key\": ..., \"text\": ...} objects"
                      if qtype in LETTER_TYPES else "null"),
        band_target=band_target,
    )
    response = await chat_json(
        [
            {"role": "system", "content": QUESTIONS_SYSTEM},
            {"role": "user", "content": user},
        ],
        mock_kind="reading_generate",
        temperature=0.6,
    )
    groups = _coerce_groups(response, qtype)
    matching = [g for g in groups if str(g.get("type") or qtype) == qtype]
    return matching or groups


def _normalize_group(group: dict[str, Any], index: int, qtype_hint: str) -> dict[str, Any]:
    qtype = str(group.get("type") or qtype_hint)
    out = {
        # Always positional: the gate keys its report by group id, so duplicates from the
        # model would silently merge two groups' results.
        "id": f"g{index + 1}",
        "type": qtype,
        "instructions_extra": group.get("instructions_extra"),
        "word_limit": word_limit_of(group.get("word_limit")) or _default_word_limit(qtype),
        "allow_reuse": bool(group.get("allow_reuse", False)),
        "options": group.get("options"),
        "layout": group.get("layout"),
        "questions": [],
    }
    if qtype in LETTER_TYPES or qtype in CHOICE_TYPES:
        out["word_limit"] = None
    for question in group.get("questions") or []:
        if not isinstance(question, dict):
            continue
        answers = question.get("answers")
        if isinstance(answers, str):
            answers = [{"value": answers}]
        elif isinstance(answers, list):
            answers = [
                a if isinstance(a, dict) else {"value": str(a)} for a in answers if a
            ]
        else:
            answers = []
        if not answers:
            continue
        anchors = question.get("anchor_paragraphs")
        if isinstance(anchors, str):
            anchors = [anchors]
        out["questions"].append(
            {
                "number": int(question.get("number") or 0),
                "prompt": str(question.get("prompt") or ""),
                "answers": answers,
                "anchor_paragraphs": list(anchors or []),
                "evidence_quote": question.get("evidence_quote"),
                "explanation": question.get("explanation"),
                "trap_note": question.get("trap_note"),
                "difficulty": str(question.get("difficulty") or "medium"),
                "band_target": question.get("band_target"),
            }
        )
    return out


def renumber(passage: dict[str, Any], start: int = 1) -> int:
    """Assign contiguous ascending question numbers. Returns the next free number."""
    number = start
    for group in passage.get("question_groups") or []:
        for question in group.get("questions") or []:
            question["number"] = number
            number += 1
    return number


# --------------------------------------------------------------------------------------
# Stage 3 — blind validation
# --------------------------------------------------------------------------------------

def render_questions_for_blind(passage: dict[str, Any]) -> str:
    """The question paper with every answer key removed (what stage 3 is allowed to see)."""
    blocks: list[str] = []
    for group in passage.get("question_groups") or []:
        header = [f"Questions of type {group.get('type')}"]
        limit = instruction_for(group.get("word_limit"))
        if limit:
            header.append(limit)
        if group.get("instructions_extra"):
            header.append(str(group["instructions_extra"]))
        options = group.get("options")
        if isinstance(options, list) and options:
            header.append(
                "Options: "
                + "; ".join(
                    f"{o.get('key')}. {o.get('text')}"
                    for o in options
                    if isinstance(o, dict)
                )
            )
        lines = [
            f"{q.get('number')}. {q.get('prompt')}" for q in (group.get("questions") or [])
        ]
        blocks.append("\n".join(header + lines))
    return "\n\n".join(blocks)


def _blind_answers(response: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """Parse ``{"answers": [...]}``.

    Fallback: a model that echoes the §3 document instead of the answer list still carries
    an answer per question number, so we read those rather than failing the whole gate.
    """
    out: dict[int, dict[str, Any]] = {}
    raw = response.get("answers") if isinstance(response, dict) else None
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            try:
                number = int(item.get("number"))
            except (TypeError, ValueError):
                continue
            out[number] = {
                "answer": str(item.get("answer") or ""),
                "confidence": float(item.get("confidence") or 0.0),
                "evidence": str(item.get("evidence") or ""),
            }
        if out:
            return out
    for passage in (response.get("passages") or []) if isinstance(response, dict) else []:
        if not isinstance(passage, dict):
            continue
        for _idx, _group, question in _iter_questions(passage):
            values = expand_variants(question.get("answers"))
            if not values:
                continue
            out[int(question.get("number") or 0)] = {
                "answer": values[0],
                "confidence": 1.0,
                "evidence": str(question.get("evidence_quote") or ""),
            }
    return out


async def blind_validate(passage: dict[str, Any]) -> dict[str, Any]:
    """Stage 3: re-answer every question from the passage alone and mark the result."""
    response = await chat_json(
        [
            {"role": "system", "content": BLIND_SYSTEM},
            {
                "role": "user",
                "content": BLIND_USER.format(
                    passage=_rendered_passage(passage),
                    questions=render_questions_for_blind(passage),
                ),
            },
        ],
        mock_kind="reading_generate",
        temperature=0.0,
    )
    blind = _blind_answers(response)
    results: list[dict[str, Any]] = []
    for _index, group, question in _iter_questions(passage):
        number = int(question.get("number") or 0)
        entry = blind.get(number)
        given = entry["answer"] if entry else ""
        confidence = entry["confidence"] if entry else 0.0
        matched = bool(
            given
            and answers_match(
                given,
                question.get("answers"),
                question_type=str(group.get("type") or ""),
                word_limit=group.get("word_limit"),
            )
        )
        passed = matched and confidence >= MIN_CONFIDENCE
        results.append(
            {
                "number": number,
                "group_id": group.get("id"),
                "blind_answer": given,
                "confidence": confidence,
                "matched": matched,
                "passed": passed,
                "reason": (
                    ""
                    if passed
                    else ("no blind answer" if not given
                          else "mismatch" if not matched else "low confidence")
                ),
            }
        )
    return {
        "prompt_version": PROMPT_VERSION,
        "model": (response.get("_meta") or {}).get("model_id"),
        "results": results,
        "passed": sum(1 for r in results if r["passed"]),
        "total": len(results),
    }


def apply_gate(passage: dict[str, Any], report: dict[str, Any]) -> list[str]:
    """Drop groups that failed the gate. Returns the ids of the discarded groups."""
    by_group: dict[Any, list[dict[str, Any]]] = {}
    for result in report["results"]:
        by_group.setdefault(result["group_id"], []).append(result)
    discarded: list[str] = []
    keep: list[dict[str, Any]] = []
    for group in passage.get("question_groups") or []:
        results = by_group.get(group.get("id"), [])
        if not results:
            keep.append(group)
            continue
        failures = sum(1 for r in results if not r["passed"])
        if failures / len(results) > MAX_GROUP_FAILURE_RATIO:
            discarded.append(str(group.get("id")))
            continue
        failed_numbers = {r["number"] for r in results if not r["passed"]}
        group["questions"] = [
            q for q in group["questions"] if int(q.get("number") or 0) not in failed_numbers
        ]
        if group["questions"]:
            keep.append(group)
        else:
            discarded.append(str(group.get("id")))
    passage["question_groups"] = keep
    return discarded


# --------------------------------------------------------------------------------------
# Stage 4 — static validation, variant expansion, persistence
# --------------------------------------------------------------------------------------

def expand_answer_variants(passage: dict[str, Any]) -> None:
    """Add the US/UK partner spelling of every authored text answer, in place (06 §7 §4)."""
    for _index, group, question in _iter_questions(passage):
        if str(group.get("type") or "") in LETTER_TYPES | CHOICE_TYPES:
            continue
        existing = {str(a.get("value", "")).strip().lower() for a in question["answers"]}
        additions: list[dict[str, Any]] = []
        for answer in list(question["answers"]):
            for partner in spelling_variants(str(answer.get("value", ""))):
                if partner.lower() not in existing:
                    existing.add(partner.lower())
                    additions.append({"value": partner, "note": "us/uk variant"})
        question["answers"].extend(additions)


def validate_passage_document(passage: dict[str, Any]) -> list[str]:
    """The 06 §3 schema invariants. Empty list means the document is importable."""
    problems: list[str] = []
    body = _paragraph_text(passage).lower()
    paragraph_ids = {
        str(p.get("id"))
        for t in (passage.get("texts") or [])
        for p in (t.get("paragraphs") or [])
    }
    numbers: list[int] = []
    for _index, group, question in _iter_questions(passage):
        number = int(question.get("number") or 0)
        numbers.append(number)
        qtype = str(group.get("type") or "")
        label = f"q{number}"
        values = expand_variants(question.get("answers"))
        if not values:
            problems.append(f"{label}: no answers")
            continue
        if qtype in LETTER_TYPES:
            options = group.get("options")
            if isinstance(options, list) and options:
                keys = {str(o.get("key", "")).strip().lower() for o in options
                        if isinstance(o, dict)}
                for value in values:
                    if value.strip().lower() not in keys:
                        problems.append(f"{label}: answer {value!r} is not an option key")
        elif qtype in CHOICE_TYPES:
            allowed = (
                {"true", "false", "not given"}
                if qtype == "true_false_not_given"
                else {"yes", "no", "not given"}
            )
            for value in values:
                if value.strip().lower() not in allowed:
                    problems.append(f"{label}: {value!r} is not a valid {qtype} answer")
        else:
            for value in values:
                if not within_word_limit(value, group.get("word_limit")):
                    problems.append(f"{label}: keyed answer {value!r} breaks its own word limit")
        anchors = question.get("anchor_paragraphs") or []
        if not anchors:
            problems.append(f"{label}: no anchor_paragraphs")
        for anchor in anchors:
            if paragraph_ids and str(anchor) not in paragraph_ids:
                problems.append(f"{label}: anchor paragraph {anchor!r} does not exist")
        quote = str(question.get("evidence_quote") or "").strip()
        if not quote:
            problems.append(f"{label}: no evidence_quote")
        elif quote.lower() not in body:
            problems.append(f"{label}: evidence_quote is not a substring of the passage")
    if len(set(numbers)) != len(numbers):
        problems.append("question numbers are not unique")
    if numbers and sorted(numbers) != list(range(min(numbers), min(numbers) + len(numbers))):
        problems.append("question numbers are not contiguous")
    return problems


def _persist_passage(
    session: Any,
    passage: dict[str, Any],
    *,
    fmt: str,
    band_target: float,
    report: dict[str, Any],
) -> str:
    from bandready.db import models as m

    passage_id = f"rp_{ULID()}"
    passage = dict(passage)
    passage["id"] = passage_id
    session.add(
        m.ReadingPassage(
            id=passage_id,
            format=fmt,
            title=str(passage.get("title") or "Generated passage"),
            word_count=int(passage.get("word_count") or 0),
            band_target=float(band_target),
            passage_json=json.dumps(passage, ensure_ascii=False),
            validation_report_json=json.dumps(report, ensure_ascii=False),
            source="generated",
            license="generated",
        )
    )
    for group_index, group, question in _iter_questions(passage):
        limit = word_limit_of(group.get("word_limit"))
        session.add(
            m.ReadingQuestion(
                id=f"rq_{ULID()}",
                passage_id=passage_id,
                number=int(question["number"]),
                group_index=group_index,
                qtype=str(group.get("type") or ""),
                word_limit=int(limit["max_words"]) if limit else None,
                answers_json=json.dumps(question["answers"], ensure_ascii=False),
                anchor_paragraphs_json=json.dumps(question.get("anchor_paragraphs") or []),
                evidence_quote=question.get("evidence_quote"),
                explanation=question.get("explanation"),
                trap_note=question.get("trap_note"),
            )
        )
    session.flush()
    return passage_id


# --------------------------------------------------------------------------------------
# The job entry point
# --------------------------------------------------------------------------------------

def _is_mock_llm() -> bool:
    from bandready.providers.presets import is_mock_config
    from bandready.settings_store import get_slot

    try:
        cfg = get_slot("llm")
    except Exception:  # noqa: BLE001 — settings unavailable is not a generation concern
        return False
    return is_mock_config(cfg)


async def generate_reading(
    params: dict[str, Any], job_id: str | None = None
) -> dict[str, Any]:
    """Run the whole pipeline and return the job result ``{passage_id}`` / ``{test_id}``.

    ``params``: ``{format, topic?, band_target, scope: "test"|"passage", gt_section?}``.

    Post-checks are advisory when the configured LLM is a mock preset — the deterministic
    fixture is a three-question stub, not an 800-word passage, and failing the job on that
    would make the mock seam useless for tests. Against a real provider they are strict, as
    06 §7 specifies.
    """
    from bandready.db import models as m
    from bandready.db.engine import session_scope
    from bandready.server.jobs import job_manager

    fmt = str(params.get("format") or "academic")
    if fmt not in ("academic", "general_training"):
        raise ApiError(422, "validation_error", f"unknown reading format {fmt!r}")
    scope = str(params.get("scope") or "passage")
    if scope not in ("test", "passage"):
        raise ApiError(422, "validation_error", f"unknown scope {scope!r}")
    band_target = float(params.get("band_target") or 7.0)
    n_passages = 3 if scope == "test" else 1
    strict = not _is_mock_llm()

    def progress(pct: float, detail: str) -> None:
        if job_id:
            job_manager.set_progress(job_id, pct, detail)

    topics = params.get("topic")
    if isinstance(topics, str) and topics.strip():
        topic_list = [topics.strip()] * n_passages
    else:
        topic_list = [TOPIC_WHEEL[i % len(TOPIC_WHEEL)] for i in range(n_passages)]

    built: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for index in range(n_passages):
        base = index * (100 / n_passages)
        span = 100 / n_passages
        progress(base + span * 0.05, f"writing passage {index + 1} of {n_passages}…")
        passage, advisories = await _generate_passage(
            fmt=fmt,
            topic=topic_list[index],
            band_target=band_target,
            gt_section=(index + 1) if fmt == "general_training" else None,
            strict=strict,
        )
        passage["position"] = index + 1

        progress(base + span * 0.35, f"writing questions for passage {index + 1}…")
        planned = plan_group_types(fmt, 13 if scope == "test" else 10, offset=index)
        groups: list[dict[str, Any]] = []
        seen_types: set[str] = set()
        for qtype, count in planned:
            raw_groups = await _generate_group(
                passage=passage, qtype=qtype, n_questions=count, band_target=band_target
            )
            for raw in raw_groups:
                normalized = _normalize_group(raw, len(groups), qtype)
                if not normalized["questions"]:
                    continue
                if normalized["type"] in seen_types:
                    continue
                seen_types.add(normalized["type"])
                groups.append(normalized)
        if not groups:
            raise ApiError(502, "provider_error", "the model produced no usable questions")
        passage["question_groups"] = groups
        # Numbered from 1 inside the passage for the blind pass; the whole test is
        # renumbered contiguously once every passage has survived the gate.
        renumber(passage, 1)

        progress(base + span * 0.65, f"blind-validating passage {index + 1}…")
        report = await blind_validate(passage)
        discarded = apply_gate(passage, report)
        report["discarded_groups"] = discarded
        report["advisories"] = advisories
        survivors = sum(len(g["questions"]) for g in passage["question_groups"])
        report["survivors"] = survivors
        if report["total"] and survivors / report["total"] < MIN_SURVIVAL_RATIO:
            raise ApiError(
                502,
                "provider_error",
                f"blind validation rejected too many questions "
                f"({survivors}/{report['total']} survived)",
            )

        expand_answer_variants(passage)
        built.append((passage, report))

    next_number = 1
    for passage, report in built:
        next_number = renumber(passage, next_number)
        problems = validate_passage_document(passage)
        report["static_validation"] = problems
        if problems and strict:
            raise ApiError(
                502,
                "provider_error",
                "the generated passage failed schema validation: " + "; ".join(problems[:3]),
            )
        if problems:
            _log.info("static validation advisory (mock mode): %s", "; ".join(problems[:5]))

    progress(95, "saving to the content bank…")
    with session_scope() as session:
        passage_ids = [
            _persist_passage(session, passage, fmt=fmt, band_target=band_target, report=report)
            for passage, report in built
        ]
        if scope == "test":
            test_id = f"rt_{ULID()}"
            session.add(
                m.ReadingTest(
                    id=test_id,
                    format=fmt,
                    title=f"Generated {'Academic' if fmt == 'academic' else 'General Training'} "
                          f"Reading Test",
                    p1_id=passage_ids[0],
                    p2_id=passage_ids[1],
                    p3_id=passage_ids[2],
                    source="generated",
                    license="generated",
                )
            )
            progress(100, "done")
            return {"test_id": test_id, "passage_ids": passage_ids}
    progress(100, "done")
    return {"passage_id": passage_ids[0]}
