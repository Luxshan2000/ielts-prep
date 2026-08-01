"""`.brpack` import — 11-data-model.md §11.3 (typed-table upsert, idempotent).

    with session_scope() as s:
        loader.seed_if_empty(s)                      # startup
        loader.import_pack(s, Path("core.brpack"))   # user side-load

Algorithm (11 §11.3), faithfully:

1. validate the manifest, verify **every** checksum, schema-validate every JSONL row;
   any failure rejects the whole pack;
2. an existing ``content_packs`` row for this ``(pack_id, version)`` is a no-op unless
   ``repair=True``;
3. one transaction: register media (``pinned=1``), upsert rows by their authored ``id``
   into the typed tables with ``source='pack'`` provenance, derive
   ``reading_questions``/``listening_questions`` from the passage/script documents, and
   insert the ``content_packs`` row;
4. upgrading the same ``pack_id`` retires rows absent from the new version — never
   deletes them, because attempt history FK-references them.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import tempfile
import zipfile
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import bindparam, text

from bandready.content.validate import (
    DATA_FILES,
    PackError,
    PackReport,
    iter_grammar_items,
    iter_listening_questions,
    iter_reading_questions,
    read_manifest,
    validate_or_raise,
)

_log = logging.getLogger("bandready.content.loader")

PACK_SUFFIXES = (".brpack", ".zip")
DEFAULT_PACK_DIRNAME = "core-en"

ProgressFn = Callable[[float, str], None]


def _noop(_pct: float, _detail: str) -> None:
    return None


# --------------------------------------------------------------------------------------
# Locating and opening packs
# --------------------------------------------------------------------------------------


def candidate_pack_paths() -> list[Path]:
    """Where the shipped pack may live, dev first then packaged resources (13 §3)."""
    out: list[Path] = []
    env = os.environ.get("BANDREADY_CONTENT_DIR")
    if env:
        out.append(Path(env).expanduser())

    repo_root = Path(__file__).resolve().parents[3]
    out.append(repo_root / "content" / DEFAULT_PACK_DIRNAME)

    resources = os.environ.get("BANDREADY_RESOURCES_DIR")
    if resources:
        base = Path(resources).expanduser()
        out.append(base / "content" / DEFAULT_PACK_DIRNAME)
        out.append(base / "content")

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        out.append(Path(meipass) / "content" / DEFAULT_PACK_DIRNAME)
    out.append(Path(sys.prefix) / "share" / "bandready" / "content" / DEFAULT_PACK_DIRNAME)
    return out


def default_pack_path() -> Path | None:
    """First candidate that actually contains a pack (directory or ``.brpack``)."""
    for candidate in candidate_pack_paths():
        if candidate.is_dir() and (candidate / "manifest.json").is_file():
            return candidate
        if candidate.is_file() and candidate.suffix in PACK_SUFFIXES:
            return candidate
        if candidate.is_dir():
            for child in sorted(candidate.glob("*.brpack")):
                return child
    return None


@contextmanager
def open_pack(path: Path) -> Iterator[Path]:
    """Yield an extracted pack root; a ``.brpack`` is unzipped into a temp dir."""
    path = Path(path).expanduser()
    if path.is_dir():
        yield path
        return
    if not path.is_file():
        raise PackError(_report_error(f"no content pack at {path}"))
    if path.suffix not in PACK_SUFFIXES:
        raise PackError(_report_error(f"{path.name} is not a .brpack archive"))

    tmp = Path(tempfile.mkdtemp(prefix="bandready-pack-"))
    try:
        with zipfile.ZipFile(path) as archive:
            for member in archive.namelist():
                target = (tmp / member).resolve()
                if not str(target).startswith(str(tmp.resolve())):
                    raise PackError(_report_error(f"unsafe path in archive: {member}"))
            archive.extractall(tmp)
        root = tmp
        if not (root / "manifest.json").is_file():
            nested = [p for p in root.iterdir() if (p / "manifest.json").is_file()]
            if len(nested) == 1:
                root = nested[0]
        yield root
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _report_error(message: str) -> PackReport:
    report = PackReport()
    report.error(message)
    return report


# --------------------------------------------------------------------------------------
# Typed-table upsert plumbing
# --------------------------------------------------------------------------------------

PACK_COLUMNS = ("source", "pack_id", "pack_version", "license")

# table -> (column, jsonify?) — jsonified columns accept dicts/lists from the JSONL row.
TABLE_COLUMNS: dict[str, tuple[tuple[str, bool], ...]] = {
    "topics": (("id", False), ("label", False), ("category", False)),
    "card_sets": (
        ("id", False), ("title", False), ("topic_id", False),
        ("parts_json", True), ("payload_json", True),
    ),
    "speaking_cards": (
        ("id", False), ("part", False), ("card_set_id", False), ("topic_id", False),
        ("title", False), ("difficulty", False), ("tags_json", True), ("payload_json", True),
    ),
    "writing_prompts": (
        ("id", False), ("task_type", False), ("genre", False), ("topic_id", False),
        ("topic_tags", True), ("difficulty", False), ("prompt_text", False),
        ("chart_spec", True), ("letter_bullets", True), ("teaching_json", True),
    ),
    "reading_passages": (
        ("id", False), ("format", False), ("title", False), ("topic_id", False),
        ("word_count", False), ("band_target", False), ("passage_json", True),
        ("validation_report_json", True),
    ),
    "reading_tests": (
        ("id", False), ("format", False), ("title", False),
        ("p1_id", False), ("p2_id", False), ("p3_id", False),
    ),
    "listening_scripts": (
        ("id", False), ("part", False), ("title", False), ("topic_id", False),
        ("accent_set", False), ("target_band", False), ("script_json", True),
        ("audio_hash", False),
    ),
    "listening_tests": (
        ("id", False), ("title", False),
        ("p1_id", False), ("p2_id", False), ("p3_id", False), ("p4_id", False),
    ),
    "vocab_pack_entries": (
        ("id", False), ("lemma", False), ("pos", False), ("deck", False), ("entry_json", True),
    ),
    # Grammar: eight columns, and the whole teaching payload inside point_json. Adding a
    # ninth top-level key to the authored row without adding it here drops it silently.
    # Theory: seven columns, the whole article inside article_json. Same rule as grammar —
    # an eighth top-level key added by an author is dropped here in silence.
    "theory_articles": (
        ("id", False), ("chapter_id", False), ("sequence_index", False), ("title", False),
        ("kind", False), ("cefr_level", False), ("article_json", True),
    ),
    "grammar_points": (
        ("id", False), ("unit_id", False), ("sequence_index", False), ("title", False),
        ("cefr_level", False), ("role", False), ("topic_id", False), ("point_json", True),
    ),
}

# Import order respects the FKs (topics ← everything; passages ← tests; scripts ← tests).
IMPORT_ORDER: tuple[str, ...] = (
    "topics.jsonl",
    "card_sets.jsonl",
    "speaking_cards.jsonl",
    "writing_prompts.jsonl",
    "reading_passages.jsonl",
    "reading_tests.jsonl",
    "listening_scripts.jsonl",
    "listening_tests.jsonl",
    "vocab.jsonl",
    # After topics.jsonl because grammar_points.topic_id is an FK; position otherwise free.
    "grammar.jsonl",
    # Theory has no FKs at all — it is reference text keyed only by its own ids.
    "theory.jsonl",
)

PACKED_TABLES: tuple[str, ...] = tuple(
    DATA_FILES[name] for name in IMPORT_ORDER if name != "topics.jsonl"
)


#: ``(table, column)`` pairs the import must not blank out. These columns are owned by the
#: app at runtime, not by the pack, so an import only writes them when the pack actually
#: carries a value. See the COALESCE in :func:`upsert_rows`.
PRESERVE_LOCAL_WHEN_PACK_NULL: frozenset[tuple[str, str]] = frozenset(
    {("listening_scripts", "audio_hash")}
)


def _jsonify(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float)):
        return value
    return json.dumps(value, ensure_ascii=False)


def upsert_rows(
    session: Any,
    table: str,
    rows: list[dict[str, Any]],
    pack_id: str,
    version: str,
    license_: str,
) -> int:
    if not rows:
        return 0
    columns = TABLE_COLUMNS[table]
    names = [c for c, _ in columns]
    with_pack = table != "topics"
    if with_pack:
        names = names + list(PACK_COLUMNS) + ["retired"]

    placeholders = ", ".join(f":{n}" for n in names)
    updates = ", ".join(
        # A column the pack leaves empty must not erase what the app computed locally.
        # `listening_scripts.audio_hash` is the case that bites: it is set by
        # `tts_render._link_script_audio` after a render, and the pack always ships it
        # null, so a plain `audio_hash = excluded.audio_hash` un-links every rendered
        # WAV on the next pack import (an upgrade, or any re-seed). The bytes survive —
        # the render is content-addressed and `cached_render` still hits — but every
        # part reverts to "not prepared" in the UI and the learner has to ask for audio
        # again. COALESCE keeps a pack-supplied hash authoritative when there is one.
        f"{n} = COALESCE(excluded.{n}, {table}.{n})"
        if (table, n) in PRESERVE_LOCAL_WHEN_PACK_NULL
        else f"{n} = excluded.{n}"
        for n in names
        if n != "id"
    )
    sql = text(
        f"INSERT INTO {table} ({', '.join(names)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {updates}"
    )

    payload: list[dict[str, Any]] = []
    for row in rows:
        values: dict[str, Any] = {}
        for column, jsonify in columns:
            value = row.get(column)
            values[column] = _jsonify(value) if jsonify else value
        if with_pack:
            values.update(
                {
                    "source": "pack",
                    "pack_id": pack_id,
                    "pack_version": version,
                    "license": row.get("license") or license_,
                    "retired": 0,
                }
            )
        payload.append(values)
    session.execute(sql, payload)
    return len(payload)


def ensure_topics(session: Any, rows_by_file: dict[str, list[dict[str, Any]]]) -> list[str]:
    """Auto-create referenced topics that the pack did not declare (FK safety)."""
    declared = {r["id"] for r in rows_by_file.get("topics.jsonl", [])}
    referenced: set[str] = set()
    for name in ("card_sets.jsonl", "speaking_cards.jsonl", "writing_prompts.jsonl",
                 "reading_passages.jsonl", "listening_scripts.jsonl", "grammar.jsonl"):
        for row in rows_by_file.get(name, []):
            if row.get("topic_id"):
                referenced.add(str(row["topic_id"]))
    missing = sorted(referenced - declared)
    if not missing:
        return []
    stmt = text("SELECT id FROM topics WHERE id IN :ids").bindparams(
        bindparam("ids", expanding=True)
    )
    existing = {str(r[0]) for r in session.execute(stmt, {"ids": missing}).all()}
    created = [t for t in missing if t not in existing]
    for topic_id in created:
        session.execute(
            text(
                "INSERT INTO topics (id, label, category) VALUES (:id, :label, 'general') "
                "ON CONFLICT(id) DO NOTHING"
            ),
            {"id": topic_id, "label": topic_id.replace("_", " ").replace("-", " ").title()},
        )
    return created


# --------------------------------------------------------------------------------------
# Derived question rows
# --------------------------------------------------------------------------------------


def derive_reading_questions(session: Any, rows: list[dict[str, Any]]) -> int:
    total = 0
    for row in rows:
        passage_id = str(row["id"])
        # Clear the old set, but NEVER a question an attempt has already answered:
        # `reading_answers.question_id` FK-references this table, so deleting one aborts
        # the whole import. That made a content update impossible on any install where
        # the learner had actually practised — the module's own rule (§4: retire, never
        # delete, because attempt history references these rows) was applied to the
        # typed tables but not to the rows derived from them. Answered questions are
        # kept and refreshed by the upsert below instead.
        session.execute(
            text(
                "DELETE FROM reading_questions WHERE passage_id = :pid AND id NOT IN "
                "(SELECT question_id FROM reading_answers WHERE question_id IS NOT NULL)"
            ),
            {"pid": passage_id},
        )
        payload: list[dict[str, Any]] = []
        for question in iter_reading_questions(row):
            group = question.get("_group") or {}
            number = question.get("number")
            if not isinstance(number, int):
                continue
            word_limit = group.get("word_limit") or {}
            payload.append(
                {
                    "id": f"rq_{passage_id}_{number}",
                    "passage_id": passage_id,
                    "number": number,
                    "group_index": int(question.get("_group_index", 0)),
                    "qtype": str(group.get("type") or question.get("type") or "unknown"),
                    "word_limit": (
                        int(word_limit.get("max_words"))
                        if isinstance(word_limit, dict) and word_limit.get("max_words")
                        else None
                    ),
                    "answers_json": json.dumps(question.get("answers") or [], ensure_ascii=False),
                    "anchor_paragraphs_json": json.dumps(
                        question.get("anchor_paragraphs") or [], ensure_ascii=False
                    ),
                    "evidence_quote": question.get("evidence_quote"),
                    "explanation": question.get("explanation"),
                    "trap_note": question.get("trap_note"),
                }
            )
        if payload:
            session.execute(
                text(
                    "INSERT INTO reading_questions (id, passage_id, number, group_index, qtype, "
                    "word_limit, answers_json, anchor_paragraphs_json, evidence_quote, "
                    "explanation, trap_note) VALUES (:id, :passage_id, :number, :group_index, "
                    ":qtype, :word_limit, :answers_json, :anchor_paragraphs_json, "
                    ":evidence_quote, :explanation, :trap_note) "
                    "ON CONFLICT(id) DO UPDATE SET number = excluded.number, "
                    "group_index = excluded.group_index, qtype = excluded.qtype, "
                    "word_limit = excluded.word_limit, answers_json = excluded.answers_json, "
                    "anchor_paragraphs_json = excluded.anchor_paragraphs_json, "
                    "evidence_quote = excluded.evidence_quote, "
                    "explanation = excluded.explanation, trap_note = excluded.trap_note"
                ),
                payload,
            )
            total += len(payload)
    return total


def derive_listening_questions(session: Any, rows: list[dict[str, Any]]) -> int:
    total = 0
    for row in rows:
        script_id = str(row["id"])
        # Same rule as reading: `listening_answers.question_id` FK-references this table,
        # so an answered question must survive the refresh and be updated in place.
        session.execute(
            text(
                "DELETE FROM listening_questions WHERE script_id = :sid AND id NOT IN "
                "(SELECT question_id FROM listening_answers WHERE question_id IS NOT NULL)"
            ),
            {"sid": script_id},
        )
        payload: list[dict[str, Any]] = []
        for question in iter_listening_questions(row):
            number = question.get("n", question.get("number"))
            if not isinstance(number, int):
                continue
            word_limit = question.get("word_limit") or {}
            payload.append(
                {
                    "id": f"lq_{script_id}_{number}",
                    "script_id": script_id,
                    "number": number,
                    "qtype": str(question.get("type") or "unknown"),
                    "word_limit": (
                        int(word_limit.get("words"))
                        if isinstance(word_limit, dict) and word_limit.get("words")
                        else None
                    ),
                    "answers_json": json.dumps(question.get("answers") or [], ensure_ascii=False),
                    "cue_line_index": question.get("cue_line_index"),
                    "explanation": question.get("explanation"),
                }
            )
        if payload:
            session.execute(
                text(
                    "INSERT INTO listening_questions (id, script_id, number, qtype, word_limit, "
                    "answers_json, cue_line_index, explanation) VALUES (:id, :script_id, :number, "
                    ":qtype, :word_limit, :answers_json, :cue_line_index, :explanation) "
                    "ON CONFLICT(id) DO UPDATE SET number = excluded.number, "
                    "qtype = excluded.qtype, word_limit = excluded.word_limit, "
                    "answers_json = excluded.answers_json, "
                    "cue_line_index = excluded.cue_line_index, "
                    "explanation = excluded.explanation"
                ),
                payload,
            )
            total += len(payload)
    return total


def derive_grammar_items(session: Any, rows: list[dict[str, Any]]) -> int:
    """Flatten ``point_json.items[]`` into ``grammar_items``.

    Modelled on :func:`derive_reading_questions`, including its hard-won rule: **never
    delete a row an attempt references.** Here the rule is satisfied by the schema rather
    than by a subquery — ``grammar_review_logs.item_id`` is deliberately loose text and not
    a foreign key, so the history survives an item that a later pack version drops, and the
    delete cannot abort an upgrade on an install where the learner has actually practised.

    The delete is still scoped to one point at a time, so an import that touches one point
    never disturbs another's bank.
    """
    total = 0
    for row in rows:
        point_id = str(row["id"])
        items = list(iter_grammar_items(row))
        keep = [str(item["id"]) for item in items]
        if keep:
            stmt = text(
                "DELETE FROM grammar_items WHERE point_id = :pid AND id NOT IN :ids"
            ).bindparams(bindparam("ids", expanding=True))
            session.execute(stmt, {"pid": point_id, "ids": keep})
        else:
            session.execute(
                text("DELETE FROM grammar_items WHERE point_id = :pid"), {"pid": point_id}
            )
        payload: list[dict[str, Any]] = []
        for item in items:
            codes = item.get("error_codes") or []
            payload.append(
                {
                    "id": str(item["id"]),
                    "point_id": point_id,
                    "kind": str(item.get("kind") or "interpret"),
                    "stage": int(item.get("stage") or 0),
                    "register": str(item.get("register") or "both"),
                    "confusion_set": item.get("confusion_set"),
                    "twin_id": item.get("twin_id"),
                    "error_codes_json": json.dumps(
                        [str(c) for c in codes] if isinstance(codes, list) else [],
                        ensure_ascii=False,
                    ),
                    "topic_id": item.get("topic_id") or row.get("topic_id"),
                    "item_json": json.dumps(
                        {k: v for k, v in item.items() if k != "_point_id"}, ensure_ascii=False
                    ),
                }
            )
        if payload:
            session.execute(
                text(
                    "INSERT INTO grammar_items (id, point_id, kind, stage, register, "
                    "confusion_set, twin_id, error_codes_json, topic_id, item_json) VALUES "
                    "(:id, :point_id, :kind, :stage, :register, :confusion_set, :twin_id, "
                    ":error_codes_json, :topic_id, :item_json) "
                    "ON CONFLICT(id) DO UPDATE SET point_id = excluded.point_id, "
                    "kind = excluded.kind, stage = excluded.stage, "
                    "register = excluded.register, confusion_set = excluded.confusion_set, "
                    "twin_id = excluded.twin_id, "
                    "error_codes_json = excluded.error_codes_json, "
                    "topic_id = excluded.topic_id, item_json = excluded.item_json"
                ),
                payload,
            )
            total += len(payload)
    return total


# --------------------------------------------------------------------------------------
# Media
# --------------------------------------------------------------------------------------


def pack_media_root(pack_id: str, version: str) -> Path:
    from bandready.config import get_settings

    return get_settings().packs_dir / pack_id / version


def install_media(
    session: Any, root: Path, pack_id: str, version: str, checksums: dict[str, str]
) -> int:
    """Copy ``media/`` into ``<data_dir>/packs/<id>/<version>/`` and pin it (11 §9)."""
    source = root / "media"
    if not source.is_dir():
        return 0
    target_root = pack_media_root(pack_id, version)
    target_root.mkdir(parents=True, exist_ok=True)

    count = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()  # media/audio/<sha>.wav
        target = target_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        digest = (checksums.get(rel) or "").split(":", 1)[-1].strip().lower()
        if not digest:
            from bandready.content.validate import sha256_file

            digest = sha256_file(path)
        session.execute(
            text(
                "INSERT INTO media_files (hash, kind, rel_path, bytes, pinned) "
                "VALUES (:hash, 'pack_media', :rel, :bytes, 1) "
                "ON CONFLICT(hash) DO UPDATE SET rel_path = excluded.rel_path, "
                "kind = excluded.kind, bytes = excluded.bytes, pinned = 1"
            ),
            {
                "hash": digest,
                "rel": f"packs/{pack_id}/{version}/{rel}",
                "bytes": target.stat().st_size,
            },
        )
        count += 1
    return count


# Pack files that have no typed table yet (09 §5.3 minimal pairs). They are copied into
# the pack directory so `load_pack_jsonl` can read them after import.
UNTYPED_DATA_FILES: tuple[str, ...] = ("pron_pairs.jsonl",)


def install_untyped_data(root: Path, pack_id: str, version: str) -> list[str]:
    installed: list[str] = []
    target_root = pack_media_root(pack_id, version) / "data"
    for name in UNTYPED_DATA_FILES:
        source = root / "data" / name
        if not source.is_file():
            continue
        target_root.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target_root / name)
        installed.append(name)
    return installed


# --------------------------------------------------------------------------------------
# Import
# --------------------------------------------------------------------------------------


def pack_installed(session: Any, pack_id: str, version: str) -> bool:
    row = session.execute(
        text("SELECT 1 FROM content_packs WHERE pack_id = :p AND version = :v"),
        {"p": pack_id, "v": version},
    ).first()
    return row is not None


def installed_checksums(session: Any, pack_id: str, version: str) -> dict[str, str]:
    """The per-file checksums recorded when this pack version was installed."""
    row = session.execute(
        text("SELECT manifest_json FROM content_packs WHERE pack_id = :p AND version = :v"),
        {"p": pack_id, "v": version},
    ).first()
    if row is None:
        return {}
    try:
        manifest = json.loads(row[0])
    except (TypeError, ValueError):
        return {}
    checksums = manifest.get("checksums")
    return dict(checksums) if isinstance(checksums, dict) else {}


def content_changed(session: Any, pack_id: str, version: str, manifest: Mapping[str, Any]) -> bool:
    """True when this version is installed but its files no longer match.

    Version equality alone is not a safe skip. A pack is rebuilt far more often than
    its version is bumped — during development that is every single time — and the
    importer then reported ``already_installed`` and changed nothing. The failure is
    silent and looks like success, so an install can sit on a stale bank indefinitely
    while every count it reports says the import worked.

    Comparing the manifest checksums is exact: identical files skip, changed files
    re-import. An older install whose manifest recorded no checksums is treated as
    changed, because we cannot prove it is current and re-importing is idempotent.
    """
    incoming = manifest.get("checksums")
    if not isinstance(incoming, dict) or not incoming:
        # Nothing to compare against — leave the version check in charge.
        return False
    return dict(incoming) != installed_checksums(session, pack_id, version)


def import_pack(
    session: Any,
    path: Path,
    progress: ProgressFn | None = None,
    repair: bool = False,
) -> dict[str, Any]:
    """Validate + install one pack. Raises :class:`PackError` on any validation failure."""
    report_progress = progress or _noop
    with open_pack(Path(path)) as root:
        report_progress(5, "validating manifest and checksums")
        report = validate_or_raise(root)
        manifest = report.manifest or {}
        pack_id = str(report.pack_id)
        version = str(report.version)

        rebuilt = content_changed(session, pack_id, version, manifest)
        if rebuilt:
            _log.info(
                "content pack %s %s is installed but its files have changed — re-importing",
                pack_id,
                version,
            )
        if pack_installed(session, pack_id, version) and not repair and not rebuilt:
            _log.info("content pack %s %s is already installed", pack_id, version)
            return {
                "status": "already_installed",
                "pack_id": pack_id,
                "version": version,
                "counts": report.counts,
                "warnings": report.warnings,
            }

        report_progress(25, "reading rows")
        rows_by_file = _read_rows(root)
        license_ = str(manifest.get("license") or "CC0-1.0")

        report_progress(40, "installing media")
        media_count = install_media(
            session, root, pack_id, version, manifest.get("checksums") or {}
        )
        # Files with no typed table (09 §5.3 minimal pairs) are copied alongside the media so
        # `load_pack_jsonl` can find them after import.
        untyped_data = install_untyped_data(root, pack_id, version)

        report_progress(55, "upserting content")
        created_topics = ensure_topics(session, rows_by_file)
        counts: dict[str, int] = {}
        for name in IMPORT_ORDER:
            rows = rows_by_file.get(name) or []
            if not rows:
                continue
            table = DATA_FILES[name]
            counts[table] = upsert_rows(session, table, rows, pack_id, version, license_)

        report_progress(80, "deriving questions")
        counts["reading_questions"] = derive_reading_questions(
            session, rows_by_file.get("reading_passages.jsonl") or []
        )
        counts["listening_questions"] = derive_listening_questions(
            session, rows_by_file.get("listening_scripts.jsonl") or []
        )
        counts["grammar_items"] = derive_grammar_items(
            session, rows_by_file.get("grammar.jsonl") or []
        )
        counts["media_files"] = media_count

        report_progress(90, "retiring superseded rows")
        retired = _retire_absent(session, pack_id, version, rows_by_file)

        session.execute(
            text("UPDATE content_packs SET enabled = 0 WHERE pack_id = :p AND version <> :v"),
            {"p": pack_id, "v": version},
        )
        session.execute(
            text(
                "INSERT INTO content_packs (pack_id, version, name, description, publisher, "
                "homepage, license, ai_disclosure, manifest_json, enabled) VALUES (:p, :v, :n, "
                ":d, :pub, :home, :lic, :ai, :man, 1) "
                "ON CONFLICT(pack_id, version) DO UPDATE SET name = excluded.name, "
                "description = excluded.description, publisher = excluded.publisher, "
                "homepage = excluded.homepage, license = excluded.license, "
                "ai_disclosure = excluded.ai_disclosure, manifest_json = excluded.manifest_json, "
                "enabled = 1"
            ),
            {
                "p": pack_id,
                "v": version,
                "n": str(manifest.get("name") or pack_id),
                "d": str(manifest.get("description") or ""),
                "pub": str(manifest.get("publisher") or ""),
                "home": manifest.get("homepage"),
                "lic": license_,
                "ai": str(manifest.get("ai_disclosure") or "human"),
                "man": json.dumps(manifest, ensure_ascii=False),
            },
        )
        report_progress(100, "installed")

        result = {
            "status": "repaired" if repair else "installed",
            "pack_id": pack_id,
            "version": version,
            "counts": counts,
            "retired": retired,
            "created_topics": created_topics,
            "untyped_data": untyped_data,
            "warnings": report.warnings,
        }
        _log.info(
            "imported content pack %s %s (%s)",
            pack_id,
            version,
            ", ".join(f"{k}={v}" for k, v in counts.items() if v),
        )
        return result


def _read_rows(root: Path) -> dict[str, list[dict[str, Any]]]:
    from bandready.content.validate import ROW_SCHEMAS, iter_jsonl

    out: dict[str, list[dict[str, Any]]] = {}
    data_dir = root / "data"
    if not data_dir.is_dir():
        return out
    for name in ROW_SCHEMAS:
        path = data_dir / name
        if not path.is_file():
            continue
        schema = ROW_SCHEMAS[name]
        out[name] = [schema.model_validate(raw).model_dump() for _, raw in iter_jsonl(path)]
    return out


def _retire_absent(
    session: Any, pack_id: str, version: str, rows_by_file: dict[str, list[dict[str, Any]]]
) -> int:
    """Rows from earlier versions of this pack that the new version dropped (11 §11.4)."""
    retired = 0
    for name in IMPORT_ORDER:
        if name == "topics.jsonl":
            continue
        table = DATA_FILES[name]
        ids = [str(r["id"]) for r in rows_by_file.get(name) or []]
        if ids:
            stmt = text(
                f"UPDATE {table} SET retired = 1 WHERE pack_id = :p AND pack_version <> :v "
                "AND id NOT IN :ids"
            ).bindparams(bindparam("ids", expanding=True))
            result = session.execute(stmt, {"p": pack_id, "v": version, "ids": ids})
        else:
            result = session.execute(
                text(
                    f"UPDATE {table} SET retired = 1 WHERE pack_id = :p AND pack_version <> :v"
                ),
                {"p": pack_id, "v": version},
            )
        retired += int(result.rowcount or 0)
    return retired


# --------------------------------------------------------------------------------------
# Startup seed + management
# --------------------------------------------------------------------------------------


def content_is_empty(session: Any) -> bool:
    row = session.execute(text("SELECT COUNT(*) FROM content_packs")).first()
    return int(row[0] if row else 0) == 0


def seed_if_empty(session: Any) -> dict[str, Any] | None:
    """Startup hook called by ``bandready.server.app`` — safe to call on every boot.

    Seeds an empty bank, and ALSO re-imports when the shipped pack has been rebuilt
    since it was installed. Without the second case an existing install keeps whatever
    it first seeded forever: shipping new content in an app update would change nothing
    on any machine that had already run the app once, and nothing would report an error.
    ``import_pack`` upserts by authored id, so re-importing is safe and idempotent.
    """
    path = default_pack_path()
    if not content_is_empty(session):
        if path is None:
            return None
        try:
            with open_pack(Path(path)) as root:
                manifest = read_manifest(root)
            pack_id = str(manifest.get("id") or "")
            version = str(manifest.get("version") or "")
            if not pack_id or not version:
                return None
            # Only ever REFRESH a pack this install already has. A bank holding other
            # packs but not this one is a deliberate state — a side-loaded pack, or the
            # shipped one removed — and quietly reinstalling on every boot would
            # override that choice and never stop.
            if not pack_installed(session, pack_id, version):
                return None
            if not content_changed(session, pack_id, version, manifest):
                return None
        except (PackError, OSError, ValueError) as exc:
            # A shipped pack we cannot read is not a reason to fail startup; the bank
            # already has content and the packs screen surfaces the problem.
            _log.warning("could not check the shipped pack for changes: %s", exc)
            return None
        _log.info("shipped content pack has changed since install — refreshing")
    if path is None:
        _log.info("no shipped content pack found on disk — starting with an empty bank")
        return None
    try:
        return import_pack(session, path)
    except PackError as exc:
        _log.error("shipped content pack at %s failed validation: %s", path, exc)
        return {"status": "invalid", "path": str(path), "errors": exc.report.errors}


def list_packs(session: Any) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            "SELECT pack_id, version, name, description, publisher, homepage, license, "
            "ai_disclosure, manifest_json, enabled, installed_at FROM content_packs "
            "ORDER BY pack_id, version"
        )
    ).mappings().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        try:
            manifest = json.loads(row["manifest_json"])
        except (TypeError, ValueError):
            manifest = {}
        out.append(
            {
                "pack_id": row["pack_id"],
                "version": row["version"],
                "name": row["name"],
                "description": row["description"],
                "publisher": row["publisher"],
                "homepage": row["homepage"],
                "license": row["license"],
                "ai_disclosure": row["ai_disclosure"],
                "enabled": bool(row["enabled"]),
                "installed_at": row["installed_at"],
                "counts": manifest.get("counts") or {},
                "disclaimer": manifest.get("disclaimer"),
            }
        )
    return out


def uninstall_pack(session: Any, pack_id: str) -> dict[str, Any]:
    """Retire the pack's content and drop its rows; learner attempt history is kept."""
    retired = 0
    for table in PACKED_TABLES:
        result = session.execute(
            text(f"UPDATE {table} SET retired = 1 WHERE pack_id = :p"), {"p": pack_id}
        )
        retired += int(result.rowcount or 0)
    session.execute(
        text("DELETE FROM media_files WHERE rel_path LIKE :prefix"),
        {"prefix": f"packs/{pack_id}/%"},
    )
    session.execute(text("DELETE FROM content_packs WHERE pack_id = :p"), {"p": pack_id})

    from bandready.config import get_settings

    tree = get_settings().packs_dir / pack_id
    shutil.rmtree(tree, ignore_errors=True)
    return {"pack_id": pack_id, "retired_rows": retired}


def load_pack_jsonl(name: str) -> list[dict[str, Any]]:
    """Read one ``data/<name>`` file from every installed pack directory.

    Used for pack-authored content that has no typed table yet (09 §5.3 minimal pairs).
    """
    from bandready.config import get_settings

    out: list[dict[str, Any]] = []
    packs_dir = get_settings().packs_dir
    roots: list[Path] = []
    if packs_dir.is_dir():
        roots.extend(p for p in sorted(packs_dir.glob("*/*")) if p.is_dir())
    shipped = default_pack_path()
    if shipped is not None and shipped.is_dir():
        roots.append(shipped)

    seen: set[str] = set()
    for root in roots:
        path = root / "data" / name
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                row = json.loads(stripped)
                if isinstance(row, dict) and str(row.get("id")) not in seen:
                    seen.add(str(row.get("id")))
                    out.append(row)
        except (OSError, ValueError) as exc:
            _log.warning("could not read %s: %s", path, exc)
    return out
