"""Content-pack schema validation — 11-data-model.md §11 + 15 §3.3/§6.

Every check here runs without an LLM and without a network, so the same code backs the
sidecar's import step and the `bandready-content validate` CLI a pack repo runs in CI
(15 §7). A pack that fails any blocking check is rejected **whole** — partial imports
create un-debuggable states.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

_log = logging.getLogger("bandready.content.validate")

MANIFEST_NAME = "manifest.json"
SUPPORTED_MANIFEST_VERSIONS = (1,)

REVERSE_DNS_RE = re.compile(r"^[a-z0-9]+(?:[.-][a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")

AI_DISCLOSURES = ("human", "ai_assisted", "ai_generated")

# data/<file>.jsonl → the typed table it upserts into (11 §11.1/§11.3).
DATA_FILES: dict[str, str] = {
    "topics.jsonl": "topics",
    "card_sets.jsonl": "card_sets",
    "speaking_cards.jsonl": "speaking_cards",
    "writing_prompts.jsonl": "writing_prompts",
    "reading_passages.jsonl": "reading_passages",
    "reading_tests.jsonl": "reading_tests",
    "listening_scripts.jsonl": "listening_scripts",
    "listening_tests.jsonl": "listening_tests",
    "vocab.jsonl": "vocab_pack_entries",
    # Not in 11 §11.1's list; accepted so a pack can ship 09 §5.3 minimal pairs.
    "pron_pairs.jsonl": "pron_pairs",
}


# --------------------------------------------------------------------------------------
# Row schemas
# --------------------------------------------------------------------------------------


class _Row(BaseModel):
    model_config = ConfigDict(extra="allow")


class Manifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    manifest_version: int
    id: str
    version: str
    name: str
    description: str = ""
    publisher: str = ""
    homepage: str | None = None
    license: str
    min_app_version: str | None = None
    disclaimer: str
    ai_disclosure: str
    built_with: dict[str, Any] | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    checksums: dict[str, str] = Field(default_factory=dict)
    locale_hint: str | None = None  # reserved, unvalidated in v1 (15 §9)

    @field_validator("manifest_version")
    @classmethod
    def _supported(cls, v: int) -> int:
        if v not in SUPPORTED_MANIFEST_VERSIONS:
            raise ValueError(f"unsupported manifest_version {v}")
        return v

    @field_validator("id")
    @classmethod
    def _reverse_dns(cls, v: str) -> str:
        if not REVERSE_DNS_RE.match(v):
            raise ValueError(f"pack id must be reverse-DNS (e.g. org.bandready.core), got {v!r}")
        return v

    @field_validator("version")
    @classmethod
    def _semver(cls, v: str) -> str:
        if not SEMVER_RE.match(v):
            raise ValueError(f"version must be semver, got {v!r}")
        return v

    @field_validator("disclaimer")
    @classmethod
    def _disclaimer(cls, v: str) -> str:
        if len(v.strip()) < 40:
            raise ValueError("disclaimer is mandatory (15 §1.1 wording rules)")
        return v

    @field_validator("ai_disclosure")
    @classmethod
    def _disclosure(cls, v: str) -> str:
        if v not in AI_DISCLOSURES:
            raise ValueError(f"ai_disclosure must be one of {AI_DISCLOSURES}")
        return v


class TopicRow(_Row):
    id: str
    label: str
    category: str = "general"


class CardSetRow(_Row):
    id: str
    title: str
    topic_id: str | None = None
    parts_json: list[int] | str = Field(default_factory=lambda: [1, 2, 3])
    payload_json: dict[str, Any] | str | None = None


class SpeakingCardRow(_Row):
    id: str
    part: int
    card_set_id: str | None = None
    topic_id: str | None = None
    title: str
    difficulty: str = "core"
    tags_json: list[str] | str = Field(default_factory=list)
    payload_json: dict[str, Any] | str

    @field_validator("part")
    @classmethod
    def _part(cls, v: int) -> int:
        if v not in (1, 2, 3):
            raise ValueError("speaking card part must be 1, 2 or 3")
        return v

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, v: str) -> str:
        if v not in ("core", "stretch"):
            raise ValueError("difficulty must be 'core' or 'stretch'")
        return v


class WritingPromptRow(_Row):
    id: str
    task_type: str
    genre: str
    topic_id: str | None = None
    topic_tags: list[str] | str = Field(default_factory=list)
    difficulty: int = 2
    prompt_text: str
    chart_spec: dict[str, Any] | str | None = None
    letter_bullets: list[str] | str | None = None
    #: The authored teaching layer (staging-writing/DESIGN.md §1–§5). Typed here so a
    #: malformed payload fails the pack rather than the UI.
    teaching_json: dict[str, Any] | str | None = None

    @field_validator("task_type")
    @classmethod
    def _task_type(cls, v: str) -> str:
        if v not in ("ac_task1", "gt_task1", "task2"):
            raise ValueError("task_type must be ac_task1 | gt_task1 | task2")
        return v

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, v: int) -> int:
        if not 1 <= v <= 3:
            raise ValueError("difficulty must be 1..3")
        return v


class ReadingPassageRow(_Row):
    id: str
    format: str = "academic"
    title: str
    topic_id: str | None = None
    word_count: int = 0
    band_target: float | None = None
    passage_json: dict[str, Any] | str

    @field_validator("format")
    @classmethod
    def _format(cls, v: str) -> str:
        if v not in ("academic", "general_training"):
            raise ValueError("format must be academic | general_training")
        return v


class ReadingTestRow(_Row):
    id: str
    format: str = "academic"
    title: str
    p1_id: str
    p2_id: str
    p3_id: str


class ListeningScriptRow(_Row):
    id: str
    part: int
    title: str
    topic_id: str | None = None
    accent_set: str = "uk"
    target_band: float = 6.0
    script_json: dict[str, Any] | str
    audio_hash: str | None = None

    @field_validator("part")
    @classmethod
    def _part(cls, v: int) -> int:
        if not 1 <= v <= 4:
            raise ValueError("listening part must be 1..4")
        return v

    @field_validator("accent_set")
    @classmethod
    def _accent(cls, v: str) -> str:
        if v not in ("uk", "us", "au"):
            raise ValueError("accent_set must be uk | us | au")
        return v


class ListeningTestRow(_Row):
    id: str
    title: str
    p1_id: str
    p2_id: str
    p3_id: str
    p4_id: str


class VocabRow(_Row):
    id: str
    lemma: str
    pos: str = "other"
    deck: str = "core"
    entry_json: dict[str, Any] | str


class PronPairRow(_Row):
    id: str
    a: str
    b: str
    contrast: str
    sentence_a: str = ""
    sentence_b: str = ""
    tags: list[str] = Field(default_factory=list)


ROW_SCHEMAS: dict[str, type[_Row]] = {
    "topics.jsonl": TopicRow,
    "card_sets.jsonl": CardSetRow,
    "speaking_cards.jsonl": SpeakingCardRow,
    "writing_prompts.jsonl": WritingPromptRow,
    "reading_passages.jsonl": ReadingPassageRow,
    "reading_tests.jsonl": ReadingTestRow,
    "listening_scripts.jsonl": ListeningScriptRow,
    "listening_tests.jsonl": ListeningTestRow,
    "vocab.jsonl": VocabRow,
    "pron_pairs.jsonl": PronPairRow,
}


# --------------------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------------------


@dataclass
class PackReport:
    ok: bool = True
    pack_id: str | None = None
    version: str | None = None
    manifest: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)

    def error(self, message: str) -> None:
        self.ok = False
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "pack_id": self.pack_id,
            "version": self.version,
            "errors": self.errors,
            "warnings": self.warnings,
            "counts": self.counts,
        }


class PackError(Exception):
    """Raised by the loader when a pack fails validation."""

    def __init__(self, report: PackReport) -> None:
        super().__init__("; ".join(report.errors) or "invalid content pack")
        self.report = report


# --------------------------------------------------------------------------------------
# File helpers
# --------------------------------------------------------------------------------------


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def read_manifest(root: Path) -> dict[str, Any]:
    path = root / MANIFEST_NAME
    if not path.is_file():
        raise PackError(_fail(f"{MANIFEST_NAME} is missing"))
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PackError(_fail(f"{MANIFEST_NAME} is not valid JSON: {exc}")) from exc


def _fail(message: str) -> PackReport:
    report = PackReport()
    report.error(message)
    return report


def iter_jsonl(path: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue
            yield lineno, json.loads(stripped)


def payload_files(root: Path) -> list[Path]:
    """Every file that must appear in ``manifest.checksums`` (11 §11.2)."""
    out: list[Path] = []
    for sub in ("data", "media"):
        base = root / sub
        if not base.is_dir():
            continue
        out.extend(p for p in sorted(base.rglob("*")) if p.is_file())
    return out


# --------------------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------------------


def validate_manifest(raw: dict[str, Any], report: PackReport) -> Manifest | None:
    try:
        manifest = Manifest.model_validate(raw)
    except ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(x) for x in err.get("loc", ()))
            report.error(f"manifest.{loc or '<root>'}: {err.get('msg')}")
        return None
    report.pack_id = manifest.id
    report.version = manifest.version
    report.manifest = manifest.model_dump()
    return manifest


def validate_checksums(root: Path, manifest: Manifest, report: PackReport) -> None:
    """Every data/ and media/ file must be listed AND match (a missing entry fails)."""
    declared = {k.replace("\\", "/"): v for k, v in (manifest.checksums or {}).items()}
    seen: set[str] = set()

    for path in payload_files(root):
        rel = path.relative_to(root).as_posix()
        seen.add(rel)
        expected = declared.get(rel)
        if expected is None:
            report.error(f"{rel} is not listed in manifest.checksums")
            continue
        want = expected.split(":", 1)[-1].strip().lower()
        got = sha256_file(path)
        if want != got:
            report.error(f"{rel}: checksum mismatch (manifest {want[:12]}…, file {got[:12]}…)")

    for rel in declared:
        if rel not in seen:
            report.error(f"manifest.checksums lists {rel}, which is not in the pack")


def validate_rows(root: Path, report: PackReport) -> dict[str, list[dict[str, Any]]]:
    """Parse + schema-validate every ``data/*.jsonl`` file. Returns the parsed rows."""
    parsed: dict[str, list[dict[str, Any]]] = {}
    data_dir = root / "data"
    if not data_dir.is_dir():
        report.warn("pack has no data/ directory — nothing to import")
        return parsed

    for path in sorted(data_dir.glob("*.jsonl")):
        name = path.name
        schema = ROW_SCHEMAS.get(name)
        if schema is None:
            report.warn(f"data/{name} is not a recognised pack file — ignored")
            continue
        rows: list[dict[str, Any]] = []
        ids: set[str] = set()
        try:
            for lineno, raw in iter_jsonl(path):
                if not isinstance(raw, dict):
                    report.error(f"data/{name}:{lineno}: each line must be a JSON object")
                    continue
                try:
                    row = schema.model_validate(raw)
                except ValidationError as exc:
                    first = exc.errors()[0]
                    loc = ".".join(str(x) for x in first.get("loc", ()))
                    report.error(f"data/{name}:{lineno}: {loc or '<row>'}: {first.get('msg')}")
                    continue
                row_id = str(row.id)
                if row_id in ids:
                    report.error(f"data/{name}:{lineno}: duplicate id {row_id!r}")
                    continue
                ids.add(row_id)
                rows.append(row.model_dump())
        except (OSError, ValueError) as exc:
            report.error(f"data/{name}: {exc}")
            continue
        parsed[name] = rows
        report.counts[DATA_FILES.get(name, name)] = len(rows)
    return parsed


def validate_relations(parsed: dict[str, list[dict[str, Any]]], report: PackReport) -> None:
    """Intra-pack referential + question-shape checks (06 §3, 07 §2 invariants)."""
    passage_ids = {r["id"] for r in parsed.get("reading_passages.jsonl", [])}
    script_ids = {r["id"] for r in parsed.get("listening_scripts.jsonl", [])}

    for row in parsed.get("reading_tests.jsonl", []):
        for key in ("p1_id", "p2_id", "p3_id"):
            if row.get(key) and row[key] not in passage_ids:
                report.warn(
                    f"reading_tests {row['id']}: {key}={row[key]!r} is not in this pack "
                    "(assumed already installed)"
                )
    for row in parsed.get("listening_tests.jsonl", []):
        for key in ("p1_id", "p2_id", "p3_id", "p4_id"):
            if row.get(key) and row[key] not in script_ids:
                report.warn(
                    f"listening_tests {row['id']}: {key}={row[key]!r} is not in this pack "
                    "(assumed already installed)"
                )

    for row in parsed.get("reading_passages.jsonl", []):
        numbers: list[int] = []
        for question in iter_reading_questions(row):
            number = question.get("number")
            if not isinstance(number, int):
                report.error(f"reading_passages {row['id']}: a question has no integer number")
                continue
            numbers.append(number)
            if not question.get("answers"):
                report.error(f"reading_passages {row['id']} q{number}: no answers[]")
        if len(numbers) != len(set(numbers)):
            report.error(f"reading_passages {row['id']}: duplicate question numbers")

    for row in parsed.get("listening_scripts.jsonl", []):
        numbers = []
        for question in iter_listening_questions(row):
            number = question.get("n", question.get("number"))
            if not isinstance(number, int):
                report.error(f"listening_scripts {row['id']}: a question has no integer 'n'")
                continue
            numbers.append(number)
            if not question.get("answers"):
                report.error(f"listening_scripts {row['id']} q{number}: no answers[]")
        if len(numbers) != len(set(numbers)):
            report.error(f"listening_scripts {row['id']}: duplicate question numbers")


# --------------------------------------------------------------------------------------
# Question extraction (shared with the loader)
# --------------------------------------------------------------------------------------


def as_document(value: Any) -> dict[str, Any]:
    """``passage_json``/``script_json`` may arrive as an object or an embedded string."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def passage_document(row: dict[str, Any]) -> dict[str, Any]:
    doc = as_document(row.get("passage_json") or row.get("passage"))
    if "question_groups" not in doc and isinstance(doc.get("passages"), list) and doc["passages"]:
        # A whole-test document was stored on a single passage row — use its first passage.
        first = doc["passages"][0]
        if isinstance(first, dict):
            return first
    return doc


def iter_reading_questions(row: dict[str, Any]) -> Iterator[dict[str, Any]]:
    doc = passage_document(row)
    for group_index, group in enumerate(doc.get("question_groups") or []):
        if not isinstance(group, dict):
            continue
        for question in group.get("questions") or []:
            if isinstance(question, dict):
                yield {**question, "_group_index": group_index, "_group": group}


def iter_listening_questions(row: dict[str, Any]) -> Iterator[dict[str, Any]]:
    doc = as_document(row.get("script_json") or row.get("script"))
    for question in doc.get("questions") or []:
        if isinstance(question, dict):
            yield question


# --------------------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------------------


def validate_pack(root: Path, verify_checksums: bool = True) -> PackReport:
    """Full validation of an *extracted* pack directory."""
    report = PackReport()
    root = Path(root)
    if not root.is_dir():
        report.error(f"{root} is not a directory")
        return report
    try:
        raw = read_manifest(root)
    except PackError as exc:
        return exc.report

    manifest = validate_manifest(raw, report)
    if manifest is None:
        return report
    if verify_checksums:
        validate_checksums(root, manifest, report)
    parsed = validate_rows(root, report)
    validate_relations(parsed, report)
    return report


def validate_or_raise(root: Path, verify_checksums: bool = True) -> PackReport:
    report = validate_pack(root, verify_checksums=verify_checksums)
    if not report.ok:
        raise PackError(report)
    return report
