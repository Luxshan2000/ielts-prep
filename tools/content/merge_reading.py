"""`python -m tools.content.merge_reading <pack>` — fold staged reading tests into the pack.

    uv run --project sidecar python -m tools.content.merge_reading content/core-en
    uv run --project sidecar python -m tools.content.merge_reading content/core-en --check
    uv run --project sidecar python -m tools.content.merge_reading content/core-en --lint-only

Authoring agents write one staging file per cluster at
``<pack>/staging-reading/tests/<cluster-slug>.json`` (staging schema in
``staging-reading/DESIGN.md`` §9.1). One file carries up to three *modes* and a single run
folds all of them in:

``tests[]`` — the ordinary cluster payload
    ``{"test": {…one reading_tests.jsonl row…},
       "passages": [ …exactly three reading_passages.jsonl rows, p1→p3… ]}``
    Passage rows land in ``data/reading_passages.jsonl`` and the test row in
    ``data/reading_tests.jsonl``. A **new** id is appended in file order; an id that already
    exists is **replaced in place**, which is what makes a second run a no-op rather than a
    duplicate.

``standalone_passages[]`` — passage rows not referenced by any test (drill fodder). Same
    append-or-replace-in-place rule.

``updates[]`` — in-place edits to rows that already exist
    ``{"id": "rp_a1", "op": "replace_passage_json", "passage_json": {…whole document…}}``
    The id must already exist exactly once. **Only** ``passage_json`` is rewritten; ``format``,
    ``title``, ``topic_id``, ``word_count``, ``band_target`` and every loader-supplied column
    are left exactly as they were, and the row keeps its line position. That is what makes the
    update path idempotent.

The merge is mechanical (DESIGN §9.3): rows are copied verbatim, with no id rewriting and no
defaulting. The one liberty it takes is **key order** — a merged row is rewritten in the §9.1
column order so the JSONL diffs cleanly whichever agent authored it.

What it will not do is write a pack it knows to be broken. Before anything reaches disk the
merged rows go through :func:`check_integrity`, which is the item-level gate that matters more
here than anywhere else in the pack: **a wrong key silently teaches the learner something
false.** It checks unique ids; ``ReadingPassageRow`` / ``ReadingTestRow`` validation; every
test's ``p1_id/p2_id/p3_id`` resolving to a real passage of the same format; question numbers
forming exactly ``{1..40}`` across a test's three rows; a real ``topic_id``; every question
carrying an integer ``number`` and a non-empty ``answers[]``; **every keyed free-text answer
appearing verbatim (case-insensitively) inside one of its own anchor paragraphs**; every
``evidence_quote`` being a verbatim substring of its own passage; every letter answer naming a
real option key; and every answer fitting its group's ``word_limit`` under the shared matcher.
A failure prints the offending ids and exits non-zero; use ``--allow-lint-failures`` only when
you are deliberately merging known-bad content.

After a successful merge, rebuild the manifest::

    uv run --project sidecar python -m tools.content.build content/core-en
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections import Counter
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

from bandready.content.validate import iter_jsonl, passage_document
from bandready.scoring.answers import (
    CHOICE_TYPES,
    LETTER_TYPES,
    TEXT_TYPES,
    within_word_limit,
    word_limit_of,
)

from tools.content import DEFAULT_PACK, resolve_pack

STAGING_SUBDIR = "staging-reading/tests"
READING_PASSAGES = "data/reading_passages.jsonl"
READING_TESTS = "data/reading_tests.jsonl"
TOPICS = "data/topics.jsonl"

#: DESIGN §9.1 — a merged passage row is written in exactly this order.
PASSAGE_KEYS: tuple[str, ...] = (
    "id",
    "format",
    "title",
    "topic_id",
    "word_count",
    "band_target",
    "passage_json",
)

#: DESIGN §9.1 — a merged test row is written in exactly this order.
TEST_KEYS: tuple[str, ...] = ("id", "format", "title", "p1_id", "p2_id", "p3_id")

#: Columns the loader supplies; an author never writes them, but an already-merged row may
#: carry them and they must survive a re-merge.
CARRIED_KEYS: tuple[str, ...] = ("source", "retired", "created_at", "validation_report_json")

#: The three-way judgement keys, which are never passage substrings.
JUDGEMENT_KEYS = {
    "TRUE",
    "FALSE",
    "NOT GIVEN",
    "YES",
    "NO",
    "T",
    "F",
    "NG",
    "Y",
    "N",
}

KIND_APPEND = "append"
KIND_UPDATE = "update"
KIND_MIXED = "mixed"

_WS = re.compile(r"\s+")


class MergeError(Exception):
    """A problem that stops the merge before anything is written."""


# --------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------


def staging_files(pack: Path) -> list[Path]:
    base = pack / STAGING_SUBDIR
    if not base.is_dir():
        raise MergeError(f"no staging directory at {base}")
    return sorted(base.glob("*.json"))


def load_staging(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise MergeError(f"{path.name}: not valid JSON ({exc})") from exc
    if not isinstance(doc, dict):
        raise MergeError(f"{path.name}: top level must be a JSON object")
    has_append = bool(doc.get("tests") or doc.get("standalone_passages"))
    has_update = bool(doc.get("updates"))
    if has_append and has_update:
        kind = KIND_MIXED
    elif has_update:
        kind = KIND_UPDATE
    else:
        kind = KIND_APPEND
    return kind, doc


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [row for _lineno, row in iter_jsonl(path)]


def read_topic_ids(pack: Path) -> set[str]:
    return {str(row.get("id")) for row in read_rows(pack / TOPICS)}


# --------------------------------------------------------------------------------------
# Staging lint (shape of the staging files themselves)
# --------------------------------------------------------------------------------------


def lint_staging(
    docs: Sequence[tuple[Path, str, dict[str, Any]]],
    passages: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
) -> list[str]:
    """DESIGN §9.4's structural rules, checked before anything is merged."""
    problems: list[str] = []
    existing_passage_ids = {str(r.get("id")) for r in passages}
    seen_passage: dict[str, str] = {}
    seen_test: dict[str, str] = {}

    for path, kind, doc in docs:
        where = path.name
        if doc.get("staging_version") != 1:
            problems.append(f"{where}: staging_version must be 1")
        cluster = str(doc.get("cluster") or "")
        if cluster != path.stem:
            problems.append(f"{where}: cluster {cluster!r} != filename stem {path.stem!r}")

        for index, entry in enumerate(doc.get("tests") or []):
            label = f"{where} tests[{index}]"
            if not isinstance(entry, dict):
                problems.append(f"{label}: not an object")
                continue
            test = entry.get("test")
            rows = entry.get("passages")
            if not isinstance(test, dict):
                problems.append(f"{label}: no test row")
                continue
            if not isinstance(rows, list) or len(rows) != 3:
                problems.append(f"{label}: needs exactly 3 passage rows, got {len(rows or [])}")
                continue
            extra = set(test) - set(TEST_KEYS) - set(CARRIED_KEYS)
            if extra:
                problems.append(f"{label}: test row has unexpected keys {sorted(extra)}")
            missing = [k for k in TEST_KEYS if k not in test]
            if missing:
                problems.append(f"{label}: test row missing {missing}")
                continue
            ids = [str(row.get("id")) for row in rows]
            slots = [str(test.get("p1_id")), str(test.get("p2_id")), str(test.get("p3_id"))]
            if ids != slots:
                problems.append(f"{label}: p1/p2/p3 {slots} != passage ids {ids}")
            for row in rows:
                if row.get("format") != test.get("format"):
                    problems.append(
                        f"{label}: passage {row.get('id')} format {row.get('format')!r} "
                        f"!= test format {test.get('format')!r}"
                    )
            _claim(seen_test, str(test.get("id")), where, "test", problems)
            for row in rows:
                _claim(seen_passage, str(row.get("id")), where, "passage", problems)
                problems += _lint_passage_row_keys(f"{label} {row.get('id')}", row)

        for index, row in enumerate(doc.get("standalone_passages") or []):
            label = f"{where} standalone_passages[{index}]"
            if not isinstance(row, dict):
                problems.append(f"{label}: not an object")
                continue
            _claim(seen_passage, str(row.get("id")), where, "passage", problems)
            problems += _lint_passage_row_keys(f"{label} {row.get('id')}", row)

        for index, update in enumerate(doc.get("updates") or []):
            label = f"{where} updates[{index}]"
            if not isinstance(update, dict):
                problems.append(f"{label}: not an object")
                continue
            row_id = str(update.get("id"))
            if update.get("op") != "replace_passage_json":
                problems.append(f"{label}: unsupported op {update.get('op')!r}")
            if not isinstance(update.get("passage_json"), dict):
                problems.append(f"{label}: passage_json must be an object")
            if row_id not in existing_passage_ids:
                problems.append(f"{label}: {row_id} is not in {READING_PASSAGES}")

    # An id may be claimed by a staging file *and* already exist in the pack — that is the
    # replace-in-place path and it is fine. Two staging files claiming one id is not.
    del existing_passage_ids
    return problems


def _claim(
    seen: dict[str, str], row_id: str, where: str, what: str, problems: list[str]
) -> None:
    if row_id in seen:
        problems.append(f"{where}: {what} id {row_id!r} is also claimed by {seen[row_id]}")
    else:
        seen[row_id] = where


def _lint_passage_row_keys(label: str, row: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    extra = set(row) - set(PASSAGE_KEYS) - set(CARRIED_KEYS)
    if extra:
        problems.append(f"{label}: passage row has unexpected keys {sorted(extra)}")
    missing = [k for k in PASSAGE_KEYS if k not in row]
    if missing:
        problems.append(f"{label}: passage row missing {missing}")
    return problems


# --------------------------------------------------------------------------------------
# Merge
# --------------------------------------------------------------------------------------


def order_row(row: dict[str, Any], keys: Sequence[str]) -> dict[str, Any]:
    """Rewrite one row in the documented column order, carrying any extra keys at the end."""
    out = {key: row[key] for key in keys if key in row}
    for key, value in row.items():
        if key not in out:
            out[key] = value
    return out


def merge_rows(
    passages: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    docs: Sequence[tuple[Path, str, dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Fold every staging file into the two row lists. Order-stable and idempotent."""
    out_passages = [order_row(dict(row), PASSAGE_KEYS) for row in passages]
    out_tests = [order_row(dict(row), TEST_KEYS) for row in tests]
    passage_at = {str(row.get("id")): i for i, row in enumerate(out_passages)}
    test_at = {str(row.get("id")): i for i, row in enumerate(out_tests)}
    stats: Counter[str] = Counter()

    def put_passage(row: dict[str, Any]) -> None:
        row_id = str(row.get("id"))
        ordered = order_row(dict(row), PASSAGE_KEYS)
        index = passage_at.get(row_id)
        if index is None:
            passage_at[row_id] = len(out_passages)
            out_passages.append(ordered)
            stats["passages_appended"] += 1
            return
        # Replace in place, but keep whatever the loader added to the existing row.
        carried = {k: out_passages[index][k] for k in CARRIED_KEYS if k in out_passages[index]}
        merged = order_row({**ordered, **carried}, PASSAGE_KEYS)
        if merged == out_passages[index]:
            stats["passages_unchanged"] += 1
        else:
            stats["passages_replaced"] += 1
        out_passages[index] = merged

    def put_test(row: dict[str, Any]) -> None:
        row_id = str(row.get("id"))
        ordered = order_row(dict(row), TEST_KEYS)
        index = test_at.get(row_id)
        if index is None:
            test_at[row_id] = len(out_tests)
            out_tests.append(ordered)
            stats["tests_appended"] += 1
            return
        carried = {k: out_tests[index][k] for k in CARRIED_KEYS if k in out_tests[index]}
        merged = order_row({**ordered, **carried}, TEST_KEYS)
        if merged == out_tests[index]:
            stats["tests_unchanged"] += 1
        else:
            stats["tests_replaced"] += 1
        out_tests[index] = merged

    for path, _kind, doc in docs:
        for entry in doc.get("tests") or []:
            for row in entry.get("passages") or []:
                put_passage(row)
            put_test(entry["test"])
        for row in doc.get("standalone_passages") or []:
            put_passage(row)
        for update in doc.get("updates") or []:
            row_id = str(update.get("id"))
            index = passage_at.get(row_id)
            if index is None:
                raise MergeError(f"{path.name}: update target {row_id!r} does not exist")
            current = out_passages[index]
            if current.get("passage_json") == update.get("passage_json"):
                stats["updates_unchanged"] += 1
                continue
            out_passages[index] = order_row(
                {**current, "passage_json": update["passage_json"]}, PASSAGE_KEYS
            )
            stats["updates_applied"] += 1

    return out_passages, out_tests, dict(stats)


# --------------------------------------------------------------------------------------
# Item-level integrity — the part that stops a wrong key reaching a learner
# --------------------------------------------------------------------------------------


def paragraph_texts(doc: dict[str, Any]) -> dict[str, str]:
    """``{paragraph id: text}`` for every paragraph of every text block on a row."""
    out: dict[str, str] = {}
    for text in doc.get("texts") or []:
        if not isinstance(text, dict):
            continue
        for para in text.get("paragraphs") or []:
            if isinstance(para, dict) and para.get("id") is not None:
                out[str(para["id"])] = str(para.get("text") or "")
    return out


def whole_text(doc: dict[str, Any]) -> str:
    """Every word of the row, headings included, joined for substring searching."""
    chunks: list[str] = []
    for text in doc.get("texts") or []:
        if not isinstance(text, dict):
            continue
        if text.get("heading"):
            chunks.append(str(text["heading"]))
        for para in text.get("paragraphs") or []:
            if isinstance(para, dict):
                if para.get("heading"):
                    chunks.append(str(para["heading"]))
                chunks.append(str(para.get("text") or ""))
    return "\n".join(chunks)


def _flatten(raw: str) -> str:
    """Fold for substring search: case, whitespace and typographic punctuation only."""
    folded = (
        raw.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
        .replace(" ", " ")
    )
    return _WS.sub(" ", folded).strip().lower()


def iter_questions(doc: dict[str, Any]) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    for group in doc.get("question_groups") or []:
        if not isinstance(group, dict):
            continue
        for question in group.get("questions") or []:
            if isinstance(question, dict):
                yield group, question


def answer_values(question: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for answer in question.get("answers") or []:
        if isinstance(answer, dict):
            value = answer.get("value")
        else:
            value = answer
        if value is not None:
            out.append(str(value))
    return out


def check_answer_spans(rows: Sequence[dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    """Every keyed free-text answer must appear verbatim in its own passage.

    This is the check that matters most in this module. A ``sentence_completion`` key that is
    not in the passage cannot be reached by any candidate, and the review screen will then
    "teach" a word the passage never used. Letters are checked against the option list, and
    judgement keys against the three legal values for their type.
    """
    problems: list[str] = []
    stats: Counter[str] = Counter()

    for row in rows:
        row_id = str(row.get("id"))
        doc = passage_document(row)
        paras = paragraph_texts(doc)
        flat_paras = {pid: _flatten(text) for pid, text in paras.items()}
        flat_all = _flatten(whole_text(doc))

        for group, question in iter_questions(doc):
            number = question.get("number")
            where = f"{row_id} q{number}"
            qtype = str(group.get("type") or "")
            anchors = [str(a) for a in (question.get("anchor_paragraphs") or [])]
            for anchor in anchors:
                if anchor not in paras:
                    problems.append(f"{where}: anchor_paragraphs names {anchor!r}, not on this row")

            quote = question.get("evidence_quote")
            if quote:
                stats["evidence_quotes"] += 1
                flat_quote = _flatten(str(quote))
                anchor_hit = any(flat_quote in flat_paras.get(a, "") for a in anchors)
                if not anchor_hit:
                    if flat_quote in flat_all:
                        stats["evidence_quote_outside_anchor"] += 1
                        problems.append(
                            f"{where}: evidence_quote is in the passage but not in its "
                            f"anchor paragraph(s) {anchors}"
                        )
                    else:
                        stats["evidence_quote_missing"] += 1
                        problems.append(
                            f"{where}: evidence_quote is not a verbatim substring of the passage"
                        )

            values = answer_values(question)
            if not values:
                problems.append(f"{where}: no answers[]")
                continue

            limit = word_limit_of(group.get("word_limit"))
            for value in values:
                if limit and not within_word_limit(value, limit):
                    problems.append(f"{where}: keyed answer {value!r} breaks its own word_limit")

            if qtype in CHOICE_TYPES:
                stats["judgement_answers"] += len(values)
                for value in values:
                    if value.strip().upper() not in JUDGEMENT_KEYS:
                        problems.append(f"{where}: {value!r} is not a legal {qtype} key")
                continue

            if qtype in LETTER_TYPES:
                # `multiple_choice` carries its options on the question (each stem has its
                # own A–D); every matching type carries one shared list on the group.
                options = question.get("options") or group.get("options") or []
                keys = {
                    str(option.get("key")) for option in options if isinstance(option, dict)
                }
                stats["letter_answers"] += len(values)
                for value in values:
                    for letter in re.split(r"[^A-Za-z0-9]+", value.strip()):
                        if letter and letter not in keys:
                            problems.append(
                                f"{where}: keyed letter {letter!r} is not an option of "
                                f"group {group.get('id')}"
                            )
                continue

            if qtype in TEXT_TYPES:
                # The *primary* key — answers[0] — is the form the passage uses and must be
                # findable in an anchor paragraph, or the review screen highlights nothing and
                # the item teaches a word the passage never printed. Later entries are
                # authored alternatives the exam genuinely grants ("run-off" for "runoff",
                # "1500" for "1,500"); they are counted, not blocked.
                stats["text_answers"] += len(values)
                for position, value in enumerate(values):
                    flat_value = _flatten(value)
                    if not flat_value:
                        problems.append(f"{where}: empty keyed answer")
                        continue
                    in_anchor = any(flat_value in flat_paras.get(a, "") for a in anchors)
                    in_passage = in_anchor or flat_value in flat_all
                    if in_anchor:
                        stats["text_answers_in_anchor"] += 1
                        continue
                    if position > 0:
                        stats["text_variants_not_verbatim"] += 1
                        continue
                    if in_passage:
                        stats["text_answers_outside_anchor"] += 1
                        problems.append(
                            f"{where}: keyed answer {value!r} is in the passage but not in "
                            f"its anchor paragraph(s) {anchors}"
                        )
                    else:
                        stats["text_answers_missing"] += 1
                        problems.append(
                            f"{where}: keyed answer {value!r} does NOT appear verbatim in "
                            f"the passage"
                        )
                continue

            stats["other_answers"] += len(values)
    return problems, dict(stats)


def check_integrity(
    passages: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    topic_ids: set[str],
) -> tuple[list[str], dict[str, int]]:
    """Everything that must be true of the merged pack. Empty problem list means safe to write."""
    from bandready.content.validate import ReadingPassageRow, ReadingTestRow

    problems: list[str] = []

    for label, rows, schema in (
        ("reading_passages", passages, ReadingPassageRow),
        ("reading_tests", tests, ReadingTestRow),
    ):
        counts = Counter(str(row.get("id")) for row in rows)
        for row_id, n in sorted(counts.items()):
            if n > 1:
                problems.append(f"{label} {row_id}: appears {n} times")
        for row in rows:
            try:
                schema.model_validate(row)
            except Exception as exc:  # noqa: BLE001 — pydantic's message is the useful part
                problems.append(f"{label} {row.get('id')}: fails {schema.__name__} ({exc})")

    by_id = {str(row.get("id")): row for row in passages}
    for row in passages:
        row_id = str(row.get("id"))
        topic_id = row.get("topic_id")
        if topic_id and str(topic_id) not in topic_ids:
            problems.append(f"reading_passages {row_id}: unknown topic_id {topic_id!r}")
        doc = passage_document(row)
        if not doc.get("texts"):
            problems.append(f"reading_passages {row_id}: passage_json has no texts[]")
        if not doc.get("question_groups"):
            problems.append(f"reading_passages {row_id}: passage_json has no question_groups[]")
        numbers = [q.get("number") for _g, q in iter_questions(doc)]
        if any(not isinstance(n, int) for n in numbers):
            problems.append(f"reading_passages {row_id}: a question has no integer number")
        if len(numbers) != len(set(numbers)):
            problems.append(f"reading_passages {row_id}: duplicate question numbers")
        paras = paragraph_texts(doc)
        if len(paras) != len(
            [p for t in doc.get("texts") or [] for p in (t.get("paragraphs") or [])]
        ):
            problems.append(f"reading_passages {row_id}: duplicate paragraph ids across texts[]")

    for test in tests:
        test_id = str(test.get("id"))
        slot_ids = [str(test.get(k)) for k in ("p1_id", "p2_id", "p3_id")]
        numbers: list[int] = []
        for key, pid in zip(("p1_id", "p2_id", "p3_id"), slot_ids, strict=True):
            row = by_id.get(pid)
            if row is None:
                problems.append(f"reading_tests {test_id}: {key}={pid!r} resolves to no passage")
                continue
            if row.get("format") != test.get("format"):
                problems.append(
                    f"reading_tests {test_id}: {pid} format {row.get('format')!r} "
                    f"!= test format {test.get('format')!r}"
                )
            numbers += [
                q.get("number")
                for _g, q in iter_questions(passage_document(row))
                if isinstance(q.get("number"), int)
            ]
        if len(set(slot_ids)) != 3:
            problems.append(f"reading_tests {test_id}: p1/p2/p3 are not three distinct passages")
        if sorted(numbers) != list(range(1, 41)):
            got = sorted(numbers)
            missing = sorted(set(range(1, 41)) - set(got))
            duplicated = sorted({n for n in got if got.count(n) > 1})
            problems.append(
                f"reading_tests {test_id}: question numbers are not 1..40 "
                f"({len(got)} questions, missing={missing[:12]}, duplicated={duplicated[:12]})"
            )

    span_problems, span_stats = check_answer_spans(passages)
    problems += span_problems
    return problems, span_stats


# --------------------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------------------


def dump_jsonl(rows: Sequence[dict[str, Any]]) -> str:
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()


def summarise(
    passages: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    span_stats: dict[str, int],
) -> list[str]:
    by_format = Counter(str(row.get("format")) for row in passages)
    tests_by_format = Counter(str(row.get("format")) for row in tests)
    by_type: Counter[str] = Counter()
    total_q = 0
    with_teaching = 0
    passage_teaching = 0
    group_teaching = 0
    groups = 0
    for row in passages:
        doc = passage_document(row)
        if doc.get("teaching"):
            passage_teaching += 1
        for group in doc.get("question_groups") or []:
            groups += 1
            if group.get("teaching"):
                group_teaching += 1
            for question in group.get("questions") or []:
                total_q += 1
                by_type[str(group.get("type"))] += 1
                if question.get("teaching"):
                    with_teaching += 1
    lines = [
        f"passages: {len(passages)}  (" + ", ".join(f"{k}={v}" for k, v in sorted(by_format.items())) + ")",
        f"tests:    {len(tests)}  (" + ", ".join(f"{k}={v}" for k, v in sorted(tests_by_format.items())) + ")",
        (
            f"questions: {total_q}  teaching on {with_teaching}/{total_q} questions, "
            f"{group_teaching}/{groups} groups, {passage_teaching}/{len(passages)} passages"
        ),
        "  types: " + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())),
    ]
    if span_stats:
        lines.append(
            "  answer spans: "
            f"{span_stats.get('text_answers_in_anchor', 0)}/{span_stats.get('text_answers', 0)} "
            "free-text keys verbatim in their anchor paragraph, "
            f"{span_stats.get('text_answers_missing', 0)} absent from the passage; "
            f"{span_stats.get('evidence_quotes', 0)} evidence quotes, "
            f"{span_stats.get('evidence_quote_missing', 0)} not verbatim"
        )
    return lines


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.merge_reading",
        description=(
            "Merge staging-reading/tests/*.json into data/reading_passages.jsonl "
            "and data/reading_tests.jsonl."
        ),
    )
    parser.add_argument("pack", nargs="?", default=DEFAULT_PACK, help="pack root")
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit 1 if the merged output would differ from what is on disk",
    )
    parser.add_argument(
        "--lint-only", action="store_true", help="run the lint gate and stop before merging"
    )
    parser.add_argument(
        "--allow-lint-failures",
        action="store_true",
        help="merge even if lint or integrity reports problems (they are still printed)",
    )
    parser.add_argument("--quiet", action="store_true", help="only print problems and the summary")
    return parser


def _print_problems(label: str, problems: Sequence[str], cap: int = 60) -> None:
    print(f"\n{label}: {len(problems)} problem(s)", file=sys.stderr)
    for problem in problems[:cap]:
        print(f"  - {problem}", file=sys.stderr)
    if len(problems) > cap:
        print(f"  … and {len(problems) - cap} more", file=sys.stderr)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        pack = resolve_pack(args.pack)
    except Exception as exc:  # noqa: BLE001 — resolve_pack raises its own message
        print(f"error: {exc}", file=sys.stderr)
        return 2

    passages_path = pack / READING_PASSAGES
    tests_path = pack / READING_TESTS
    try:
        files = staging_files(pack)
        docs = [(path, *load_staging(path)) for path in files]
        existing_passages = read_rows(passages_path)
        existing_tests = read_rows(tests_path)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not args.quiet:
        print(f"pack: {pack}")
        print(f"existing rows: {len(existing_passages)} passages, {len(existing_tests)} tests")
        for path, kind, doc in docs:
            counts = (
                f"{len(doc.get('tests') or ())} tests, "
                f"{len(doc.get('standalone_passages') or ())} standalone, "
                f"{len(doc.get('updates') or ())} updates"
            )
            print(f"  {path.name}: {kind} ({counts})")

    problems = lint_staging(docs, existing_passages, existing_tests)
    if problems:
        _print_problems("lint", problems)
    elif not args.quiet:
        print("\nlint: clean")

    if args.lint_only:
        return 1 if problems else 0
    if problems and not args.allow_lint_failures:
        print("\nrefusing to merge; pass --allow-lint-failures to override", file=sys.stderr)
        return 1

    try:
        merged_passages, merged_tests, stats = merge_rows(existing_passages, existing_tests, docs)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    integrity, span_stats = check_integrity(
        merged_passages, merged_tests, read_topic_ids(pack)
    )
    if integrity:
        _print_problems("integrity", integrity)
        if not args.allow_lint_failures:
            print("\nrefusing to write a broken pack", file=sys.stderr)
            return 1
    elif not args.quiet:
        print("integrity: clean")

    passage_text = dump_jsonl(merged_passages)
    test_text = dump_jsonl(merged_tests)
    changed = passage_text != (
        passages_path.read_text(encoding="utf-8") if passages_path.exists() else ""
    ) or test_text != (tests_path.read_text(encoding="utf-8") if tests_path.exists() else "")

    if args.check:
        print("\n" + "\n".join(summarise(merged_passages, merged_tests, span_stats)))
        print("check: " + ("DIFFERS from disk" if changed else "up to date"))
        return 1 if changed else 0

    if changed:
        write_atomic(passages_path, passage_text)
        write_atomic(tests_path, test_text)
    print(
        "\nmerged: "
        f"{stats.get('passages_appended', 0)} passages appended, "
        f"{stats.get('passages_replaced', 0)} replaced, "
        f"{stats.get('passages_unchanged', 0)} already current; "
        f"{stats.get('tests_appended', 0)} tests appended, "
        f"{stats.get('tests_replaced', 0)} replaced, "
        f"{stats.get('tests_unchanged', 0)} already current; "
        f"{stats.get('updates_applied', 0)} updates applied, "
        f"{stats.get('updates_unchanged', 0)} already current"
    )
    print("\n".join(summarise(merged_passages, merged_tests, span_stats)))
    print(f"{'wrote' if changed else 'unchanged'}: {passages_path}")
    print(f"{'wrote' if changed else 'unchanged'}: {tests_path}")
    print("next: uv run --project sidecar python -m tools.content.build " + str(args.pack))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
