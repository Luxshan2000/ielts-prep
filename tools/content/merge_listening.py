"""`python -m tools.content.merge_listening <pack>` — fold staged listening into the pack.

    uv run --project sidecar python -m tools.content.merge_listening content/core-en
    uv run --project sidecar python -m tools.content.merge_listening content/core-en --check
    uv run --project sidecar python -m tools.content.merge_listening content/core-en --lint-only

Authoring agents write one staging file per cluster at
``<pack>/staging-listening/tests/<cluster-slug>.json`` (staging schema in
``staging-listening/DESIGN.md`` §9.1). One file carries up to four *modes*; a single run
folds all of them in, in this order:

``tests[]`` — a whole test with its own four parts
    ``{"test": {…one listening_tests.jsonl row…},
       "scripts": [ …exactly four listening_scripts.jsonl rows, p1→p4… ]}``

``standalone_scripts[]`` — script rows not carried by a ``tests[]`` entry. Every part
    cluster in this pack authors here, because the four parts of a test were written by
    four different agents and no one of them owned the whole test.

``updates[]`` — in-place edits to rows that already exist
    ``{"id": "ls_t1_p1", "op": "replace_script_json", "script_json": {…whole document…}}``
    **Only** ``script_json`` is rewritten; ``part``, ``title``, ``topic_id``, ``accent_set``,
    ``target_band`` and every loader-supplied column survive, and the row keeps its line
    position. That is what makes a re-run a no-op instead of a duplicate.

``test_rows[]`` — bare ``listening_tests.jsonl`` rows, applied **last**, after every file's
    scripts are in. This is the shape the assembly cluster uses: it authors no scripts, so it
    cannot use ``tests[]`` (whose contract is a test plus its own four rows).

The merge itself is an **upsert keyed on ``id``** (DESIGN §9.3), never an append: a new id is
appended in file order, an existing id is replaced in place. Run it twice over the same
staging files and the second run leaves both JSONL files byte-identical — that is the
acceptance test for this tool, and ``--check`` is how you assert it in CI.

Before anything reaches disk the merged rows go through :func:`check_integrity`, which is the
gate that matters: **a wrong key silently teaches the learner something false, and a wrong
line index silently plays the wrong three seconds of audio.** It checks

* unique ids; ``ListeningScriptRow`` / ``ListeningTestRow`` validation; a real ``topic_id``;
* every test's ``p1_id``…``p4_id`` resolving to a real script **of the right part**, and
  question numbers across the four forming exactly ``{1..40}``;
* ``groups[]`` partitioning ``questions[]``, with the group's ``type``/``instruction`` equal
  to every member question's;
* **every cited transcript quote being a verbatim substring of its own script's lines** —
  ``teaching.answer_quote`` and ``paraphrase_link.audio`` against ``lines[cue_line_index]``,
  ``teaching.signpost.phrase`` against ``lines[signpost.line_index]``,
  ``distraction.signal`` against ``lines[decoy_line_index]``, and every ``pre_teach`` and
  ``signpost_map`` phrase against its own ``line_index``;
* every keyed free-text answer being spoken in its own cue line, and fitting its
  ``word_limit`` under the shared matcher; every keyed letter naming a real option;
* **every speaker ``voice`` being a voice id Kokoro actually ships**, and
* **every ``asset.src`` a question references existing under ``<pack>/media/``** — the
  reading module shipped a diagram question whose SVG did not exist and four marks became
  unearnable; this check is why that cannot happen here.

A test row whose parts do not all resolve is **skipped, not written**: a ``listening_tests``
row pointing at a missing script passes ``ListeningTestRow`` and then fails at runtime, in
the player, in front of the learner. The skip is reported loudly and the staging file is left
alone so a later cluster can supply the missing part.

After a successful merge, rebuild the manifest and re-render the audio::

    uv run --project sidecar python -m tools.content.build content/core-en
    POST /api/v1/listening/tests/{id}/render      # every test
    POST /api/v1/listening/scripts/{id}/render    # every standalone row
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

from bandready.audio.tts_render import VOICE_MAP
from bandready.content.validate import as_document, iter_jsonl
from bandready.scoring.answers import (
    LETTER_TYPES,
    TEXT_TYPES,
    instruction_for,
    normalize_answer,
    within_word_limit,
    word_limit_of,
)

from tools.content import DEFAULT_PACK, resolve_pack

STAGING_SUBDIR = "staging-listening/tests"
LISTENING_SCRIPTS = "data/listening_scripts.jsonl"
LISTENING_TESTS = "data/listening_tests.jsonl"
TOPICS = "data/topics.jsonl"

#: DESIGN §9.1 — a merged script row is written in exactly this order.
SCRIPT_KEYS: tuple[str, ...] = (
    "id",
    "part",
    "title",
    "topic_id",
    "accent_set",
    "target_band",
    "script_json",
    "audio_hash",
)

#: DESIGN §9.1 — a merged test row is written in exactly this order.
TEST_KEYS: tuple[str, ...] = ("id", "title", "p1_id", "p2_id", "p3_id", "p4_id")

#: Columns the loader supplies; an author never writes them, but an already-merged row may
#: carry them and they must survive a re-merge.
CARRIED_KEYS: tuple[str, ...] = ("source", "retired", "created_at", "validation_report_json")

#: Every voice id the shipped Kokoro voice pack contains. A speaker naming anything else
#: renders as whatever ``resolve_voice`` falls back to — silently the wrong person.
KOKORO_VOICES: frozenset[str] = frozenset(
    {
        "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
        "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
        "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
        "am_onyx", "am_puck", "am_santa",
        "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
        "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
    }
)

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
    has_append = bool(
        doc.get("tests") or doc.get("standalone_scripts") or doc.get("test_rows")
    )
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
    scripts: Sequence[dict[str, Any]],
) -> list[str]:
    """DESIGN §9.4's structural rules, checked before anything is merged."""
    problems: list[str] = []
    existing_script_ids = {str(r.get("id")) for r in scripts}
    seen_script: dict[str, str] = {}
    seen_test: dict[str, str] = {}

    for path, _kind, doc in docs:
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
            rows = entry.get("scripts")
            if not isinstance(test, dict):
                problems.append(f"{label}: no test row")
                continue
            if not isinstance(rows, list) or len(rows) != 4:
                problems.append(f"{label}: needs exactly 4 script rows, got {len(rows or [])}")
                continue
            problems += _lint_test_row_keys(label, test)
            ids = [str(row.get("id")) for row in rows]
            slots = [str(test.get(k)) for k in ("p1_id", "p2_id", "p3_id", "p4_id")]
            if ids != slots:
                problems.append(f"{label}: p1..p4 {slots} != script ids {ids}")
            if [row.get("part") for row in rows] != [1, 2, 3, 4]:
                problems.append(f"{label}: scripts are not in part order 1,2,3,4")
            _claim(seen_test, str(test.get("id")), where, "test", problems)
            for row in rows:
                _claim(seen_script, str(row.get("id")), where, "script", problems)
                problems += _lint_script_row_keys(f"{label} {row.get('id')}", row)

        for index, row in enumerate(doc.get("standalone_scripts") or []):
            label = f"{where} standalone_scripts[{index}]"
            if not isinstance(row, dict):
                problems.append(f"{label}: not an object")
                continue
            _claim(seen_script, str(row.get("id")), where, "script", problems)
            problems += _lint_script_row_keys(f"{label} {row.get('id')}", row)

        for index, row in enumerate(doc.get("test_rows") or []):
            label = f"{where} test_rows[{index}]"
            if not isinstance(row, dict):
                problems.append(f"{label}: not an object")
                continue
            _claim(seen_test, str(row.get("id")), where, "test", problems)
            problems += _lint_test_row_keys(label, row)

        for index, update in enumerate(doc.get("updates") or []):
            label = f"{where} updates[{index}]"
            if not isinstance(update, dict):
                problems.append(f"{label}: not an object")
                continue
            row_id = str(update.get("id"))
            if update.get("op") != "replace_script_json":
                problems.append(f"{label}: unsupported op {update.get('op')!r}")
            if not isinstance(update.get("script_json"), dict):
                problems.append(f"{label}: script_json must be an object")
            if row_id not in existing_script_ids and row_id not in seen_script:
                problems.append(f"{label}: {row_id} is not in {LISTENING_SCRIPTS}")

    return problems


def _claim(
    seen: dict[str, str], row_id: str, where: str, what: str, problems: list[str]
) -> None:
    if row_id in seen:
        problems.append(f"{where}: {what} id {row_id!r} is also claimed by {seen[row_id]}")
    else:
        seen[row_id] = where


def _lint_script_row_keys(label: str, row: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    extra = set(row) - set(SCRIPT_KEYS) - set(CARRIED_KEYS)
    if extra:
        problems.append(f"{label}: script row has unexpected keys {sorted(extra)}")
    missing = [k for k in SCRIPT_KEYS if k not in row]
    if missing:
        problems.append(f"{label}: script row missing {missing}")
        return problems
    if row.get("audio_hash") is not None:
        problems.append(f"{label}: audio_hash must be null on an authored row")
    doc = as_document(row.get("script_json"))
    for key in ("part", "accent_set", "target_band"):
        if key in doc and doc.get(key) != row.get(key):
            problems.append(
                f"{label}: script_json.{key}={doc.get(key)!r} != row {key}={row.get(key)!r}"
            )
    return problems


def _lint_test_row_keys(label: str, row: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    extra = set(row) - set(TEST_KEYS) - set(CARRIED_KEYS)
    if extra:
        problems.append(f"{label}: test row has unexpected keys {sorted(extra)}")
    missing = [k for k in TEST_KEYS if k not in row]
    if missing:
        problems.append(f"{label}: test row missing {missing}")
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
    scripts: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    docs: Sequence[tuple[Path, str, dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Fold every staging file into the two row lists. Order-stable and idempotent."""
    out_scripts = [order_row(dict(row), SCRIPT_KEYS) for row in scripts]
    out_tests = [order_row(dict(row), TEST_KEYS) for row in tests]
    script_at = {str(row.get("id")): i for i, row in enumerate(out_scripts)}
    test_at = {str(row.get("id")): i for i, row in enumerate(out_tests)}
    stats: Counter[str] = Counter()

    def put(
        row: dict[str, Any],
        out: list[dict[str, Any]],
        at: dict[str, int],
        keys: Sequence[str],
        label: str,
    ) -> None:
        row_id = str(row.get("id"))
        ordered = order_row(dict(row), keys)
        index = at.get(row_id)
        if index is None:
            at[row_id] = len(out)
            out.append(ordered)
            stats[f"{label}_appended"] += 1
            return
        # Replace in place, but keep whatever the loader added to the existing row.
        carried = {k: out[index][k] for k in CARRIED_KEYS if k in out[index]}
        merged = order_row({**ordered, **carried}, keys)
        if merged == out[index]:
            stats[f"{label}_unchanged"] += 1
        else:
            stats[f"{label}_replaced"] += 1
        out[index] = merged

    def put_script(row: dict[str, Any]) -> None:
        put(row, out_scripts, script_at, SCRIPT_KEYS, "scripts")

    def put_test(row: dict[str, Any]) -> None:
        put(row, out_tests, test_at, TEST_KEYS, "tests")

    for path, _kind, doc in docs:
        for entry in doc.get("tests") or []:
            for row in entry.get("scripts") or []:
                put_script(row)
            put_test(entry["test"])
        for row in doc.get("standalone_scripts") or []:
            put_script(row)
        for update in doc.get("updates") or []:
            row_id = str(update.get("id"))
            index = script_at.get(row_id)
            if index is None:
                raise MergeError(f"{path.name}: update target {row_id!r} does not exist")
            current = out_scripts[index]
            if current.get("script_json") == update.get("script_json"):
                stats["updates_unchanged"] += 1
                continue
            # An edited transcript invalidates the render; the hash is recomputed by
            # `POST .../render`, and leaving a stale one here would make the UI claim
            # audio that no longer matches the lines is ready.
            out_scripts[index] = order_row(
                {**current, "script_json": update["script_json"], "audio_hash": None},
                SCRIPT_KEYS,
            )
            stats["updates_applied"] += 1

    # test_rows[] last (DESIGN §9.3 / tests-assembly's merge_instruction): the assembly
    # cluster's title and slot wiring must win over any part-cluster's incidental row.
    known_scripts = {str(row.get("id")): row for row in out_scripts}
    skipped: list[str] = []
    for _path, _kind, doc in docs:
        for row in doc.get("test_rows") or []:
            if not isinstance(row, dict):
                continue
            missing = [
                f"{key}={row.get(key)!r}"
                for key in ("p1_id", "p2_id", "p3_id", "p4_id")
                if str(row.get(key)) not in known_scripts
            ]
            if missing:
                skipped.append(f"{row.get('id')}: unresolved {', '.join(missing)}")
                stats["tests_skipped"] += 1
                continue
            put_test(row)

    return out_scripts, out_tests, {**dict(stats), "_skipped": skipped}  # type: ignore[dict-item]


# --------------------------------------------------------------------------------------
# Item-level integrity
# --------------------------------------------------------------------------------------


def _flatten(raw: str) -> str:
    """Fold for substring search: case, whitespace and typographic punctuation only."""
    folded = (
        (raw or "")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
        .replace(" ", " ")
    )
    return _WS.sub(" ", folded).strip().lower()


def line_texts(doc: dict[str, Any]) -> list[str]:
    return [
        str(line.get("text") or "")
        for line in (doc.get("lines") or [])
        if isinstance(line, dict)
    ]


def iter_questions(doc: dict[str, Any]) -> Iterator[dict[str, Any]]:
    for question in doc.get("questions") or []:
        if isinstance(question, dict):
            yield question


def option_map(question: dict[str, Any], group: dict[str, Any] | None = None) -> dict[str, str]:
    """``{letter: option text}``.

    Authored listening options are a plain ``{"A": "…", "B": "…"}`` object on the question
    (``multiple_choice``) or on the group (a shared lettered bank for ``matching``). A list
    of ``{"key", "text"}`` objects is accepted too, because that is the shape the reading
    module uses and a future generator may emit it.
    """
    out: dict[str, str] = {}
    for source in (group or {}, question):
        options = source.get("options")
        if isinstance(options, dict):
            out.update({str(k): str(v) for k, v in options.items()})
        elif isinstance(options, list):
            for option in options:
                if isinstance(option, dict) and option.get("key") is not None:
                    out[str(option["key"])] = str(option.get("text") or "")
                elif isinstance(option, str):
                    out[option] = option
    return out


def answer_slots(question: dict[str, Any]) -> list[list[str]]:
    """``answers`` is a list of slots, each slot a list of accepted variants."""
    out: list[list[str]] = []
    for slot in question.get("answers") or []:
        if isinstance(slot, list):
            out.append([str(v) for v in slot])
        elif slot is not None:
            out.append([str(slot)])
    return out


def check_quotes(rows: Sequence[dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    """Every cited transcript quote must be verbatim in its own script's lines.

    This is the check that matters most in this module. ``answer_quote`` is what the review
    screen highlights and what the click-to-replay jump is anchored on; a quote that is not
    in ``lines[cue_line_index]`` highlights nothing and plays the wrong three seconds. The
    same is true of every ``signpost``, ``distraction.signal`` and ``pre_teach`` phrase — the
    coach shows them as *what you were supposed to hear*.
    """
    problems: list[str] = []
    stats: Counter[str] = Counter()

    for row in rows:
        row_id = str(row.get("id"))
        doc = as_document(row.get("script_json"))
        lines = line_texts(doc)
        flat_lines = [_flatten(text) for text in lines]
        flat_all = _flatten(" † ".join(lines))
        groups_by_number = {
            number: group
            for group in (doc.get("groups") or [])
            if isinstance(group, dict)
            for number in (group.get("questions") or [])
        }

        def cite(
            label: str, quote: Any, index: Any, kind: str, *, required: bool = True
        ) -> None:
            """One (quote, line_index) citation, checked against that exact line."""
            text = str(quote or "").strip()
            if not text:
                if required:
                    problems.append(f"{label}: empty {kind}")
                return
            stats[f"{kind}_total"] += 1
            if not isinstance(index, int) or not 0 <= index < len(lines):
                problems.append(
                    f"{label}: {kind} line_index {index!r} is not a valid line "
                    f"(0..{len(lines) - 1})"
                )
                stats[f"{kind}_bad_index"] += 1
                return
            flat = _flatten(text)
            if flat in flat_lines[index]:
                stats[f"{kind}_ok"] += 1
                return
            if flat in flat_all:
                problems.append(
                    f"{label}: {kind} {text!r} is in the script but NOT in line {index}"
                )
                stats[f"{kind}_wrong_line"] += 1
            else:
                problems.append(
                    f"{label}: {kind} {text!r} does NOT appear verbatim anywhere in the script"
                )
                stats[f"{kind}_missing"] += 1

        for question in iter_questions(doc):
            number = question.get("n", question.get("number"))
            where = f"{row_id} q{number}"
            cue = question.get("cue_line_index")
            teaching = question.get("teaching") or {}
            if not isinstance(teaching, dict):
                problems.append(f"{where}: teaching is not an object")
                continue
            if not teaching:
                stats["questions_without_teaching"] += 1
                continue
            stats["questions_with_teaching"] += 1

            cite(where, teaching.get("answer_quote"), cue, "answer_quote")

            signpost = teaching.get("signpost")
            if isinstance(signpost, dict):
                cite(
                    where,
                    signpost.get("phrase"),
                    signpost.get("line_index"),
                    "signpost",
                )

            link = teaching.get("paraphrase_link")
            if isinstance(link, dict):
                cite(where, link.get("audio"), cue, "paraphrase_audio", required=False)
                printed = str(link.get("printed") or "").strip()
                if printed:
                    stats["paraphrase_printed_total"] += 1
                    haystacks = [
                        str(question.get("prompt") or ""),
                        *option_map(question, groups_by_number.get(number)).values(),
                    ]
                    if not any(_flatten(printed) in _flatten(h) for h in haystacks):
                        problems.append(
                            f"{where}: paraphrase_link.printed {printed!r} is not in the "
                            "prompt or any option"
                        )
                        stats["paraphrase_printed_missing"] += 1

            distraction = teaching.get("distraction")
            if isinstance(distraction, dict):
                cite(
                    where,
                    distraction.get("signal"),
                    distraction.get("decoy_line_index"),
                    "distraction_signal",
                )

            for entry in teaching.get("option_diagnosis") or []:
                if not isinstance(entry, dict):
                    continue
                heard = entry.get("heard_at")
                if not isinstance(heard, int) or not 0 <= heard < len(lines):
                    problems.append(
                        f"{where}: option_diagnosis[{entry.get('option')}].heard_at "
                        f"{heard!r} is not a valid line index"
                    )
                    stats["option_diagnosis_bad_index"] += 1
                else:
                    stats["option_diagnosis_ok"] += 1

        script_teaching = doc.get("teaching")
        if isinstance(script_teaching, dict):
            for entry in script_teaching.get("pre_teach") or []:
                if isinstance(entry, dict):
                    cite(
                        f"{row_id} pre_teach {entry.get('item')!r}",
                        entry.get("item"),
                        entry.get("line_index"),
                        "pre_teach",
                    )
            for entry in script_teaching.get("signpost_map") or []:
                if isinstance(entry, dict):
                    cite(
                        f"{row_id} signpost_map",
                        entry.get("phrase"),
                        entry.get("line_index"),
                        "signpost_map",
                    )

    return problems, dict(stats)


#: Spoken digit names, including the two the exam actually uses for zero.
_SPOKEN_DIGITS: dict[str, str] = {
    "zero": "0", "oh": "0", "o": "0", "nought": "0",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9",
}

_ALNUM = re.compile(r"[^A-Za-z0-9]+")


def spoken_code_stream(text: str) -> str:
    """The letter/digit stream a listener would write down from ``text``.

    A reference number is *never* written in the script the way it is keyed: the answer key
    says ``01472 330915`` and the speaker says "oh one four seven two, double three oh, nine
    one five" (DESIGN §6.5 forbids the digit form, because Kokoro reads ``01472`` as a
    cardinal). Comparing the key against the raw line therefore fails on every code in the
    bank, so the key is compared against this expansion instead:

    * a digit word becomes its digit, and ``oh``/``nought`` become ``0``;
    * ``double``/``triple`` repeat the digit **or letter** that follows;
    * a lone letter — ``P.``, ``K.``, ``B`` — contributes itself, which is what makes
      ``P. T. double four, one nine`` yield ``PT4419``.

    Everything else is dropped, so the stream is a compact ``[A-Z0-9]`` string that the
    keyed code must appear inside contiguously.
    """
    out: list[str] = []
    repeat = 1
    for token in re.findall(r"[A-Za-z]+|\d+", text or ""):
        low = token.lower()
        if low in ("double", "twice"):
            repeat = 2
            continue
        if low == "triple":
            repeat = 3
            continue
        if token.isdigit():
            out.append(token * repeat)
        elif low in _SPOKEN_DIGITS:
            out.append(_SPOKEN_DIGITS[low] * repeat)
        elif len(token) == 1:
            out.append(token.upper() * repeat)
        else:
            repeat = 1
            continue
        repeat = 1
    return "".join(out)


def _spoken_in_line(value: str, cue_norm: str, cue_stream: str) -> bool:
    """Is this keyed variant actually said in the cue line, in words or as a code?"""
    if not value.strip():
        return False
    if normalize_answer(value) in cue_norm:
        return True
    compact = _ALNUM.sub("", value).upper()
    return bool(compact) and compact in cue_stream


def check_answers(rows: Sequence[dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    """Keyed answers: spoken in the cue line, inside the word limit, real option letters."""
    problems: list[str] = []
    stats: Counter[str] = Counter()

    for row in rows:
        row_id = str(row.get("id"))
        doc = as_document(row.get("script_json"))
        lines = line_texts(doc)
        groups_by_number = {
            number: group
            for group in (doc.get("groups") or [])
            if isinstance(group, dict)
            for number in (group.get("questions") or [])
        }
        for question in iter_questions(doc):
            number = question.get("n", question.get("number"))
            where = f"{row_id} q{number}"
            qtype = str(question.get("type") or "")
            slots = answer_slots(question)
            if not slots or not any(slot for slot in slots):
                problems.append(f"{where}: no answers[]")
                continue
            limit = word_limit_of(question.get("word_limit"))
            if qtype in TEXT_TYPES:
                # The learner obeys the *printed* rubric and the scorer applies the *keyed*
                # limit. When they disagree, a correct answer written to the instruction on
                # screen can still be marked over-limit, which is unappealable and invisible.
                printed = str(question.get("instruction") or "")
                implied = instruction_for(limit)
                if implied.lower() not in printed.lower():
                    problems.append(
                        f"{where}: printed instruction {printed!r} does not match "
                        f"word_limit {question.get('word_limit')!r} (which prints as "
                        f"{implied!r})"
                    )
            cue = question.get("cue_line_index")
            cue_text = (
                lines[cue] if isinstance(cue, int) and 0 <= cue < len(lines) else ""
            )
            cue_norm = normalize_answer(cue_text)
            cue_stream = spoken_code_stream(cue_text)

            for slot in slots:
                for value in slot:
                    if not value.strip():
                        problems.append(f"{where}: empty keyed answer")
                        continue
                    if qtype in LETTER_TYPES:
                        keys = set(option_map(question, groups_by_number.get(number)))
                        stats["letter_answers"] += 1
                        for letter in re.split(r"[^A-Za-z0-9]+", value.strip()):
                            if letter and letter not in keys:
                                problems.append(
                                    f"{where}: keyed letter {letter!r} is not an option "
                                    f"(options {sorted(keys)})"
                                )
                        continue
                    if limit and not within_word_limit(value, limit):
                        problems.append(
                            f"{where}: keyed answer {value!r} breaks its own word_limit "
                            f"{question.get('word_limit')}"
                        )
                if qtype not in TEXT_TYPES:
                    continue
                # One slot is one gap on the answer sheet. The gap is fine as long as *some*
                # keyed variant is audibly said — `21` is written on the sheet and
                # "twenty-first" is what the speaker says, and both are keyed on purpose.
                stats["text_answers"] += 1
                if any(_spoken_in_line(v, cue_norm, cue_stream) for v in slot):
                    stats["text_answers_in_cue_line"] += 1
                else:
                    stats["text_answers_missing"] += 1
                    problems.append(
                        f"{where}: no keyed variant of {slot!r} is spoken in its cue line "
                        f"{cue} ({cue_text[:80]!r})"
                    )
    return problems, dict(stats)


def check_voices_and_assets(
    rows: Sequence[dict[str, Any]], pack: Path
) -> tuple[list[str], dict[str, int]]:
    """Every voice is a real Kokoro id; every referenced map asset is on disk."""
    problems: list[str] = []
    stats: Counter[str] = Counter()
    known_roles = set(VOICE_MAP["uk"])

    for row in rows:
        row_id = str(row.get("id"))
        doc = as_document(row.get("script_json"))
        speaker_ids: set[str] = set()
        for speaker in doc.get("speakers") or []:
            if not isinstance(speaker, dict):
                continue
            sid = str(speaker.get("id") or "")
            speaker_ids.add(sid)
            voice = str(speaker.get("voice") or "")
            stats["speakers"] += 1
            if not voice:
                problems.append(f"{row_id} speaker {sid}: no voice")
            elif voice not in KOKORO_VOICES:
                problems.append(
                    f"{row_id} speaker {sid}: voice {voice!r} is not a Kokoro voice id"
                )
                stats["bad_voices"] += 1
            role = str(speaker.get("role") or "")
            if role not in known_roles:
                problems.append(f"{row_id} speaker {sid}: role {role!r} is not a cast role")
        for index, line in enumerate(doc.get("lines") or []):
            if not isinstance(line, dict):
                problems.append(f"{row_id} line {index}: not an object")
                continue
            if str(line.get("speaker") or "") not in speaker_ids:
                problems.append(
                    f"{row_id} line {index}: speaker {line.get('speaker')!r} is not cast"
                )
            pause = line.get("pause_after_ms")
            if not isinstance(pause, int) or not 0 <= pause <= 60000:
                problems.append(
                    f"{row_id} line {index}: pause_after_ms {pause!r} outside [0, 60000]"
                )

        for question in iter_questions(doc):
            asset = question.get("asset")
            if not isinstance(asset, dict):
                continue
            src = str(asset.get("src") or "")
            stats["asset_refs"] += 1
            if not src:
                problems.append(f"{row_id} q{question.get('n')}: asset has no src")
                continue
            if not (pack / src).is_file():
                problems.append(
                    f"{row_id} q{question.get('n')}: asset {src!r} does not exist under "
                    f"{pack.name}/ — the question would be unanswerable"
                )
                stats["assets_missing"] += 1
            else:
                stats["assets_present"] += 1
            alt = str(asset.get("alt") or "")
            if not alt:
                problems.append(f"{row_id} q{question.get('n')}: asset has no alt text")
    return problems, dict(stats)


def check_groups(rows: Sequence[dict[str, Any]]) -> list[str]:
    """``groups[]`` must partition ``questions[]`` and agree with every member question."""
    problems: list[str] = []
    for row in rows:
        row_id = str(row.get("id"))
        doc = as_document(row.get("script_json"))
        by_number = {
            q.get("n", q.get("number")): q for q in iter_questions(doc)
        }
        groups = doc.get("groups") or []
        if not groups:
            problems.append(f"{row_id}: script_json has no groups[]")
            continue
        covered: list[Any] = []
        for group in groups:
            if not isinstance(group, dict):
                problems.append(f"{row_id}: a group is not an object")
                continue
            numbers = list(group.get("questions") or [])
            covered += numbers
            if numbers != sorted(numbers) or (
                numbers and numbers != list(range(numbers[0], numbers[0] + len(numbers)))
            ):
                problems.append(
                    f"{row_id} group {group.get('id')}: questions {numbers} are not "
                    "contiguous and ascending"
                )
            for number in numbers:
                question = by_number.get(number)
                if question is None:
                    problems.append(
                        f"{row_id} group {group.get('id')}: names q{number}, which is not "
                        "on this row"
                    )
                    continue
                if question.get("type") != group.get("type"):
                    problems.append(
                        f"{row_id} q{number}: type {question.get('type')!r} != group type "
                        f"{group.get('type')!r}"
                    )
                if question.get("instruction") != group.get("instruction"):
                    problems.append(
                        f"{row_id} q{number}: instruction differs from its group's"
                    )
        if sorted(covered, key=str) != sorted(by_number, key=str):
            problems.append(
                f"{row_id}: groups[] does not partition questions[] "
                f"(groups {sorted(covered, key=str)}, questions {sorted(by_number, key=str)})"
            )
    return problems


def check_integrity(
    scripts: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    topic_ids: set[str],
    pack: Path,
) -> tuple[list[str], dict[str, int]]:
    """Everything that must be true of the merged pack. Empty list means safe to write."""
    from bandready.content.validate import ListeningScriptRow, ListeningTestRow

    problems: list[str] = []

    for label, rows, schema in (
        ("listening_scripts", scripts, ListeningScriptRow),
        ("listening_tests", tests, ListeningTestRow),
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

    by_id = {str(row.get("id")): row for row in scripts}
    for row in scripts:
        row_id = str(row.get("id"))
        topic_id = row.get("topic_id")
        if topic_id and str(topic_id) not in topic_ids:
            problems.append(f"listening_scripts {row_id}: unknown topic_id {topic_id!r}")
        doc = as_document(row.get("script_json"))
        if not doc.get("lines"):
            problems.append(f"listening_scripts {row_id}: script_json has no lines[]")
        if not doc.get("speakers"):
            problems.append(f"listening_scripts {row_id}: script_json has no speakers[]")
        numbers = [q.get("n", q.get("number")) for q in iter_questions(doc)]
        if not numbers:
            problems.append(f"listening_scripts {row_id}: script_json has no questions[]")
        if any(not isinstance(n, int) for n in numbers):
            problems.append(f"listening_scripts {row_id}: a question has no integer 'n'")
        if len(numbers) != len(set(numbers)):
            problems.append(f"listening_scripts {row_id}: duplicate question numbers")

    for test in tests:
        test_id = str(test.get("id"))
        slot_ids = [str(test.get(k)) for k in ("p1_id", "p2_id", "p3_id", "p4_id")]
        numbers = []
        for part, (key, sid) in enumerate(
            zip(("p1_id", "p2_id", "p3_id", "p4_id"), slot_ids, strict=True), start=1
        ):
            row = by_id.get(sid)
            if row is None:
                problems.append(
                    f"listening_tests {test_id}: {key}={sid!r} resolves to no script"
                )
                continue
            if int(row.get("part") or 0) != part:
                problems.append(
                    f"listening_tests {test_id}: {key}={sid!r} is a Part "
                    f"{row.get('part')} script in the Part {part} slot"
                )
            numbers += [
                n
                for n in (
                    q.get("n", q.get("number"))
                    for q in iter_questions(as_document(row.get("script_json")))
                )
                if isinstance(n, int)
            ]
        if len(set(slot_ids)) != 4:
            problems.append(f"listening_tests {test_id}: p1..p4 are not four distinct scripts")
        if sorted(numbers) != list(range(1, 41)):
            got = sorted(numbers)
            missing = sorted(set(range(1, 41)) - set(got))
            duplicated = sorted({n for n in got if got.count(n) > 1})
            problems.append(
                f"listening_tests {test_id}: question numbers are not a contiguous 1..40 "
                f"({len(got)} questions, missing={missing[:12]}, duplicated={duplicated[:12]})"
            )
        accents = {
            str(by_id[sid].get("accent_set")) for sid in slot_ids if sid in by_id
        }
        if len(accents) < 2:
            problems.append(
                f"listening_tests {test_id}: all four parts are accent_set {accents} — a "
                "test must expose at least two varieties (DESIGN lint 8)"
            )

    stats: Counter[str] = Counter()
    for check in (
        lambda: check_quotes(scripts),
        lambda: check_answers(scripts),
        lambda: check_voices_and_assets(scripts, pack),
    ):
        found, sub = check()
        problems += found
        stats.update(sub)
    problems += check_groups(scripts)
    return problems, dict(stats)


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
    scripts: Sequence[dict[str, Any]],
    tests: Sequence[dict[str, Any]],
    stats: dict[str, int],
) -> list[str]:
    by_part = Counter(int(row.get("part") or 0) for row in scripts)
    by_accent = Counter(str(row.get("accent_set")) for row in scripts)
    by_type: Counter[str] = Counter()
    total_q = 0
    q_teaching = 0
    group_teaching = 0
    groups = 0
    script_teaching = 0
    in_tests = {
        str(t.get(k)) for t in tests for k in ("p1_id", "p2_id", "p3_id", "p4_id")
    }
    for row in scripts:
        doc = as_document(row.get("script_json"))
        if doc.get("teaching"):
            script_teaching += 1
        for group in doc.get("groups") or []:
            groups += 1
            if isinstance(group, dict) and group.get("teaching"):
                group_teaching += 1
        for question in iter_questions(doc):
            total_q += 1
            by_type[str(question.get("type"))] += 1
            if question.get("teaching"):
                q_teaching += 1
    return [
        "scripts:  {} ({}), {} in a test, {} standalone".format(
            len(scripts),
            ", ".join(f"p{k}={v}" for k, v in sorted(by_part.items())),
            len([r for r in scripts if str(r.get("id")) in in_tests]),
            len([r for r in scripts if str(r.get("id")) not in in_tests]),
        ),
        "tests:    {}".format(len(tests)),
        "accents:  " + ", ".join(f"{k}={v}" for k, v in sorted(by_accent.items())),
        (
            f"questions: {total_q}  teaching on {q_teaching}/{total_q} questions, "
            f"{group_teaching}/{groups} groups, {script_teaching}/{len(scripts)} scripts"
        ),
        "  types: " + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())),
        (
            "  quotes: {}/{} answer_quotes verbatim in their cue line, "
            "{}/{} signposts, {}/{} distraction signals, {}/{} pre-teach items, "
            "{}/{} signpost-map phrases".format(
                stats.get("answer_quote_ok", 0), stats.get("answer_quote_total", 0),
                stats.get("signpost_ok", 0), stats.get("signpost_total", 0),
                stats.get("distraction_signal_ok", 0),
                stats.get("distraction_signal_total", 0),
                stats.get("pre_teach_ok", 0), stats.get("pre_teach_total", 0),
                stats.get("signpost_map_ok", 0), stats.get("signpost_map_total", 0),
            )
        ),
        (
            "  answers: {}/{} free-text keys spoken in their cue line, {} letter keys; "
            "{} map assets referenced, {} present, {} missing".format(
                stats.get("text_answers_in_cue_line", 0), stats.get("text_answers", 0),
                stats.get("letter_answers", 0), stats.get("asset_refs", 0),
                stats.get("assets_present", 0), stats.get("assets_missing", 0),
            )
        ),
    ]


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.merge_listening",
        description=(
            "Merge staging-listening/tests/*.json into data/listening_scripts.jsonl "
            "and data/listening_tests.jsonl."
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


def _print_problems(label: str, problems: Sequence[str], cap: int = 80) -> None:
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

    scripts_path = pack / LISTENING_SCRIPTS
    tests_path = pack / LISTENING_TESTS
    try:
        files = staging_files(pack)
        docs = [(path, *load_staging(path)) for path in files]
        existing_scripts = read_rows(scripts_path)
        existing_tests = read_rows(tests_path)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not args.quiet:
        print(f"pack: {pack}")
        print(f"existing rows: {len(existing_scripts)} scripts, {len(existing_tests)} tests")
        for path, kind, doc in docs:
            counts = (
                f"{len(doc.get('tests') or ())} tests, "
                f"{len(doc.get('standalone_scripts') or ())} standalone, "
                f"{len(doc.get('updates') or ())} updates, "
                f"{len(doc.get('test_rows') or ())} test rows"
            )
            print(f"  {path.name}: {kind} ({counts})")

    problems = lint_staging(docs, existing_scripts)
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
        merged_scripts, merged_tests, stats = merge_rows(
            existing_scripts, existing_tests, docs
        )
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    skipped = stats.pop("_skipped", [])  # type: ignore[arg-type]
    if skipped:
        _print_problems("SKIPPED test rows (not written — they would 500 in the player)", skipped)

    integrity, item_stats = check_integrity(
        merged_scripts, merged_tests, read_topic_ids(pack), pack
    )
    if integrity:
        _print_problems("integrity", integrity)
        if not args.allow_lint_failures:
            print("\nrefusing to write a broken pack", file=sys.stderr)
            return 1
    elif not args.quiet:
        print("integrity: clean")

    script_text = dump_jsonl(merged_scripts)
    test_text = dump_jsonl(merged_tests)
    changed = script_text != (
        scripts_path.read_text(encoding="utf-8") if scripts_path.exists() else ""
    ) or test_text != (tests_path.read_text(encoding="utf-8") if tests_path.exists() else "")

    if args.check:
        print("\n" + "\n".join(summarise(merged_scripts, merged_tests, item_stats)))
        print("check: " + ("DIFFERS from disk" if changed else "up to date"))
        return 1 if changed else 0

    if changed:
        write_atomic(scripts_path, script_text)
        write_atomic(tests_path, test_text)
    print(
        "\nmerged: "
        f"{stats.get('scripts_appended', 0)} scripts appended, "
        f"{stats.get('scripts_replaced', 0)} replaced, "
        f"{stats.get('scripts_unchanged', 0)} already current; "
        f"{stats.get('tests_appended', 0)} tests appended, "
        f"{stats.get('tests_replaced', 0)} replaced, "
        f"{stats.get('tests_unchanged', 0)} already current, "
        f"{stats.get('tests_skipped', 0)} skipped; "
        f"{stats.get('updates_applied', 0)} updates applied, "
        f"{stats.get('updates_unchanged', 0)} already current"
    )
    print("\n".join(summarise(merged_scripts, merged_tests, item_stats)))
    print(f"{'wrote' if changed else 'unchanged'}: {scripts_path}")
    print(f"{'wrote' if changed else 'unchanged'}: {tests_path}")
    print("next: uv run --project sidecar python -m tools.content.build " + str(args.pack))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
