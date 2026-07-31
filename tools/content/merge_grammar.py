"""`python -m tools.content.merge_grammar <pack>` — fold the staged Grammar & Usage blocks in.

    uv run --project sidecar python -m tools.content.merge_grammar content/core-en
    uv run --project sidecar python -m tools.content.merge_grammar content/core-en --check
    uv run --project sidecar python -m tools.content.merge_grammar content/core-en --lint-only

Authoring agents write one file per block at
``<pack>/staging-grammar/content/<block-key>.json`` (staging schema in
``staging-grammar/DESIGN.md`` §5.1). A single run folds every block in, in filename order:

``points[]``          → ``data/grammar.jsonl``. Exactly the eight authored columns
                        (``id · unit_id · sequence_index · title · cefr_level · role ·
                        topic_id · point_json``); everything the learner ever sees lives
                        inside ``point_json``, because the loader copies only the columns
                        ``TABLE_COLUMNS`` names and drops any extra top-level key silently.
``vocab_new[]``       → appended to ``data/vocab.jsonl``. Exactly five columns
                        (``id · lemma · pos · deck · entry_json``).
``vocab_updates[]``   → in-place retrofits: ``{"id", "op": "replace_entry_json",
                        "entry_json": {…the whole new blob…}}``. **Only** ``entry_json`` is
                        rewritten; ``lemma``, ``pos``, ``deck`` and every loader-supplied
                        column keep their existing values and the row keeps its line
                        position, which is what makes a second run a no-op.

A top-level key beginning with ``_`` (``_readme``) is permitted and ignored.

**The merge is mechanical** (DESIGN §5.2): rows are copied verbatim, with no id rewriting
and no defaulting. It takes exactly two liberties, both of them orderings rather than
edits: ``data/grammar.jsonl`` is sorted by ``sequence_index`` (the one reordering the merge
performs), and each merged row is rewritten in the authored column order so the JSONL diffs
cleanly whichever agent produced it. Re-running over unchanged staging files is
byte-identical, and that idempotence is what makes a re-run safe.

**Vocabulary is deduplicated by ``lemma``+``pos``, not only by id.** The pack already ships
343 entries and six authors were each allocated a slice of the same topic decks, so the
realistic collision is two agents authoring the same high-frequency academic word under two
different ids. A new entry whose ``lemma``+``pos`` already exists in the pack is **skipped**
and reported; the shipped row wins, because it is the one the learner may already have
opted into and whose id their ``vocab_sources`` rows point at.

Before anything reaches disk the merged rows go through :func:`check_integrity`, which is
where this module earns its keep. Grammar's failure mode is not a broken file — it is a
**wall**: a beginner reaches a point whose prerequisite is taught later, or is inside a
dependency cycle, and the sequence they were promised does not exist. So the graph is
checked as a graph:

* every ``prerequisites[]`` id resolves, or is reported as an incomplete-syllabus warning;
* **no cycles** — Kahn's algorithm must consume every node;
* every edge runs forwards: a prerequisite's ``sequence_index`` is strictly lower;
* ``sequence_index`` is unique;
* every item id is unique across the whole bank, and its ``<point-slug>`` matches its point;
* **every exercise item has exactly one defensible answer and all-distinct distractors** —
  a duplicated option is two correct answers wearing one key, which teaches the learner that
  the app is arbitrary;
* every ``topic_id`` exists in ``data/topics.jsonl``;
* every ``structure_slug`` has a detector, every ``kind`` is in the closed enum, every twin
  pair shares its options and differs in its key.

A failure prints the offending ids and exits non-zero; ``--allow-lint-failures`` overrides,
and should only be used when you are deliberately merging known-bad content.

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
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from bandready.grammar.grading import _APOSTROPHE_SENSITIVE

from bandready.content.validate import (
    GRAMMAR_ITEM_KINDS,
    GRAMMAR_STRUCTURE_SLUGS,
    GrammarPointRow,
    VocabRow,
    iter_jsonl,
)

from tools.content import DEFAULT_PACK, resolve_pack

STAGING_SUBDIR = "staging-grammar/content"
GRAMMAR_FILE = "data/grammar.jsonl"
VOCAB_FILE = "data/vocab.jsonl"
TOPICS_FILE = "data/topics.jsonl"

#: DESIGN §5.1 — a merged point row is written in exactly this order, and carries no others.
POINT_KEYS: tuple[str, ...] = (
    "id",
    "unit_id",
    "sequence_index",
    "title",
    "cefr_level",
    "role",
    "topic_id",
    "point_json",
)

#: DESIGN §5.1 — a merged vocabulary row is written in exactly this order.
VOCAB_KEYS: tuple[str, ...] = ("id", "lemma", "pos", "deck", "entry_json")

#: The five top-level keys a staging file may carry, plus anything starting with ``_``.
STAGING_KEYS: frozenset[str] = frozenset(
    {"staging_version", "block", "authored_by", "points", "vocab_new", "vocab_updates"}
)

#: ``vocab_entries.pos`` is CheckConstraint-ed to these eight values (models.py).
VOCAB_POS: frozenset[str] = frozenset(
    {"noun", "verb", "adj", "adv", "prep", "phrase", "collocation", "other"}
)

ITEM_ID_RE = re.compile(r"^gi_[a-z0-9_]+_\d{2,3}$")


class MergeError(Exception):
    """A problem that stops the merge before anything is written."""


# --------------------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------------------


def read_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    try:
        return [row for _, row in iter_jsonl(path)]
    except (OSError, ValueError) as exc:
        raise MergeError(f"{path}: {exc}") from exc


def read_topic_ids(pack: Path) -> set[str]:
    return {str(row["id"]) for row in read_rows(pack / TOPICS_FILE) if row.get("id")}


def staging_docs(pack: Path) -> list[tuple[Path, dict[str, Any]]]:
    """Every staging file, sorted by filename — the merge order DESIGN §5.2 fixes."""
    base = pack / STAGING_SUBDIR
    if not base.is_dir():
        raise MergeError(f"no staging directory at {base}")
    out: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(base.glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise MergeError(f"{path.name}: {exc}") from exc
        if not isinstance(doc, dict):
            raise MergeError(f"{path.name}: a staging file must be a JSON object")
        out.append((path, doc))
    if not out:
        raise MergeError(f"no staging files in {base}")
    return out


# --------------------------------------------------------------------------------------
# Lints over the staging files themselves
# --------------------------------------------------------------------------------------


def lint_staging(docs: list[tuple[Path, dict[str, Any]]]) -> list[str]:
    problems: list[str] = []
    seen_points: dict[str, str] = {}
    seen_vocab: dict[str, str] = {}

    for path, doc in docs:
        name = path.name
        stem = path.stem
        block = str(doc.get("block") or "")
        if block != stem:
            problems.append(f"{name}: block {block!r} does not match the filename stem {stem!r}")
        if int(doc.get("staging_version") or 0) != 1:
            problems.append(f"{name}: staging_version must be 1")
        extra = {k for k in doc if not k.startswith("_")} - STAGING_KEYS
        if extra:
            problems.append(f"{name}: unexpected top-level keys {sorted(extra)}")

        for row in doc.get("points") or []:
            if not isinstance(row, dict):
                problems.append(f"{name}: a points[] entry is not an object")
                continue
            point_id = str(row.get("id") or "?")
            keys = set(row)
            if keys != set(POINT_KEYS):
                problems.append(
                    f"{name}/{point_id}: a point row carries exactly {list(POINT_KEYS)}, "
                    f"got {sorted(keys)}"
                )
            try:
                GrammarPointRow.model_validate(row)
            except Exception as exc:  # pydantic ValidationError
                problems.append(f"{name}/{point_id}: {_first_error(exc)}")
            if point_id in seen_points:
                problems.append(
                    f"{name}/{point_id}: this point id is also authored in {seen_points[point_id]}"
                )
            else:
                seen_points[point_id] = name

        for row in doc.get("vocab_new") or []:
            if not isinstance(row, dict):
                problems.append(f"{name}: a vocab_new[] entry is not an object")
                continue
            entry_id = str(row.get("id") or "?")
            keys = set(row)
            if keys != set(VOCAB_KEYS):
                problems.append(
                    f"{name}/{entry_id}: a vocab row carries exactly {list(VOCAB_KEYS)}, "
                    f"got {sorted(keys)}"
                )
            try:
                VocabRow.model_validate(row)
            except Exception as exc:
                problems.append(f"{name}/{entry_id}: {_first_error(exc)}")
            if str(row.get("pos")) not in VOCAB_POS:
                problems.append(
                    f"{name}/{entry_id}: pos {row.get('pos')!r} is outside the eight values "
                    "vocab_entries permits"
                )
            if entry_id in seen_vocab:
                problems.append(
                    f"{name}/{entry_id}: this entry id is also authored in {seen_vocab[entry_id]}"
                )
            else:
                seen_vocab[entry_id] = name

        for update in doc.get("vocab_updates") or []:
            if not isinstance(update, dict):
                problems.append(f"{name}: a vocab_updates[] entry is not an object")
                continue
            if set(update) != {"id", "op", "entry_json"}:
                problems.append(
                    f"{name}/{update.get('id')}: an update carries exactly "
                    "['id', 'op', 'entry_json']"
                )
            if update.get("op") != "replace_entry_json":
                problems.append(
                    f"{name}/{update.get('id')}: op must be 'replace_entry_json'"
                )
    return problems


def _first_error(exc: Exception) -> str:
    errors = getattr(exc, "errors", None)
    if callable(errors):
        first = errors()[0]
        loc = ".".join(str(x) for x in first.get("loc", ()))
        return f"{loc or '<row>'}: {first.get('msg')}"
    return str(exc)


# --------------------------------------------------------------------------------------
# Merging
# --------------------------------------------------------------------------------------


def _ordered(row: dict[str, Any], keys: Sequence[str]) -> dict[str, Any]:
    out = {k: row.get(k) for k in keys}
    out.update({k: v for k, v in row.items() if k not in out})
    return out


def merge_rows(
    existing_points: list[dict[str, Any]],
    existing_vocab: list[dict[str, Any]],
    docs: list[tuple[Path, dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int], list[str]]:
    """Fold every staging file in. Returns (points, vocab, stats, notes)."""
    points = [_ordered(r, POINT_KEYS) for r in existing_points]
    vocab = [_ordered(r, VOCAB_KEYS) for r in existing_vocab]
    point_at = {str(r["id"]): i for i, r in enumerate(points)}
    vocab_at = {str(r["id"]): i for i, r in enumerate(vocab)}
    #: The dedupe key DESIGN's merge contract does not name but the bank needs: two agents
    #: authoring the same word under two ids is the realistic collision, not two ids.
    lemma_at: dict[tuple[str, str], str] = {
        (str(r.get("lemma", "")).strip().lower(), str(r.get("pos") or "other")): str(r["id"])
        for r in vocab
    }

    stats = Counter()
    notes: list[str] = []

    for path, doc in docs:
        for row in doc.get("points") or []:
            if not isinstance(row, dict) or not row.get("id"):
                continue
            merged = _ordered(row, POINT_KEYS)
            point_id = str(merged["id"])
            index = point_at.get(point_id)
            if index is None:
                point_at[point_id] = len(points)
                points.append(merged)
                stats["points_appended"] += 1
            elif points[index] == merged:
                stats["points_unchanged"] += 1
            else:
                points[index] = merged
                stats["points_replaced"] += 1

        for row in doc.get("vocab_new") or []:
            if not isinstance(row, dict) or not row.get("id"):
                continue
            merged = _ordered(row, VOCAB_KEYS)
            entry_id = str(merged["id"])
            key = (str(merged.get("lemma", "")).strip().lower(), str(merged.get("pos") or "other"))
            owner = lemma_at.get(key)
            if owner is not None and owner != entry_id:
                stats["vocab_deduped"] += 1
                notes.append(
                    f"{path.name}: {entry_id} ({key[0]}/{key[1]}) duplicates the shipped "
                    f"entry {owner} — skipped, the shipped row wins"
                )
                continue
            index = vocab_at.get(entry_id)
            if index is None:
                vocab_at[entry_id] = len(vocab)
                lemma_at[key] = entry_id
                vocab.append(merged)
                stats["vocab_appended"] += 1
            elif vocab[index] == merged:
                stats["vocab_unchanged"] += 1
            else:
                vocab[index] = merged
                stats["vocab_replaced"] += 1

        for update in doc.get("vocab_updates") or []:
            if not isinstance(update, dict):
                continue
            entry_id = str(update.get("id") or "")
            index = vocab_at.get(entry_id)
            if index is None:
                raise MergeError(
                    f"{path.name}: vocab_updates names {entry_id!r}, which is not in "
                    f"{VOCAB_FILE}"
                )
            if vocab[index].get("entry_json") == update.get("entry_json"):
                stats["updates_unchanged"] += 1
            else:
                vocab[index]["entry_json"] = update.get("entry_json")
                stats["updates_applied"] += 1

    # The one reordering the merge performs (DESIGN §5.2).
    points.sort(key=lambda r: (int(r.get("sequence_index") or 0), str(r.get("id"))))
    return points, vocab, dict(stats), notes


# --------------------------------------------------------------------------------------
# Integrity — the graph, the bank, the answers
# --------------------------------------------------------------------------------------


def check_integrity(
    points: list[dict[str, Any]],
    vocab: list[dict[str, Any]],
    topic_ids: set[str],
) -> tuple[list[str], list[str], dict[str, Any]]:
    """Returns (blocking problems, warnings, stats)."""
    problems: list[str] = []
    warnings: list[str] = []

    ids = {str(r["id"]) for r in points}
    seq_of: dict[str, int] = {}
    prereqs: dict[str, list[str]] = {}
    dangling: list[tuple[str, str]] = []
    item_owner: dict[str, str] = {}
    kinds = Counter()
    stages = Counter()
    levels = Counter()
    roles = Counter()
    topic_load = Counter()

    for row in points:
        point_id = str(row["id"])
        doc = row.get("point_json")
        if isinstance(doc, str):
            doc = json.loads(doc)
        if not isinstance(doc, dict):
            problems.append(f"{point_id}: point_json is not an object")
            continue

        seq = row.get("sequence_index")
        if not isinstance(seq, int):
            problems.append(f"{point_id}: sequence_index must be an integer")
        else:
            clash = next((p for p, s in seq_of.items() if s == seq), None)
            if clash:
                problems.append(f"{point_id}: sequence_index {seq} is already used by {clash}")
            seq_of[point_id] = seq

        if row.get("topic_id") and str(row["topic_id"]) not in topic_ids:
            problems.append(f"{point_id}: topic_id {row['topic_id']!r} is not in {TOPICS_FILE}")
        topic_load[str(row.get("topic_id") or "—")] += 1
        levels[str(row.get("cefr_level"))] += 1
        roles[str(row.get("role"))] += 1

        wanted = [str(p) for p in (doc.get("prerequisites") or [])]
        prereqs[point_id] = [p for p in wanted if p in ids]
        dangling.extend((point_id, p) for p in wanted if p not in ids)

        slug = doc.get("structure_slug")
        if slug and str(slug) not in GRAMMAR_STRUCTURE_SLUGS:
            problems.append(f"{point_id}: structure_slug {slug!r} has no detector")

        role = str(row.get("role") or "form")
        if role == "choice" and not doc.get("contrast"):
            problems.append(f"{point_id}: role 'choice' with no contrast block")
        if role != "choice" and doc.get("contrast"):
            problems.append(f"{point_id}: a contrast block belongs only on a choice point")

        teach = doc.get("teach") or {}
        for required in ("can_do", "meaning", "rule_line"):
            if not str(teach.get(required) or "").strip():
                problems.append(f"{point_id}: teach.{required} is empty")

        slug_of_point = point_id.removeprefix("gr_")
        by_id: dict[str, dict[str, Any]] = {}
        for item in doc.get("items") or []:
            if not isinstance(item, dict):
                problems.append(f"{point_id}: an items[] entry is not an object")
                continue
            item_id = str(item.get("id") or "")
            if not ITEM_ID_RE.match(item_id):
                problems.append(f"{point_id}: item id {item_id!r} is not gi_<point-slug>_NN")
            elif not item_id.startswith(f"gi_{slug_of_point}_"):
                problems.append(f"{point_id}: item {item_id} does not carry its own point slug")
            owner = item_owner.get(item_id)
            if owner:
                problems.append(f"{point_id}: item id {item_id} is also used by {owner}")
            item_owner[item_id] = point_id
            by_id[item_id] = item

            kind = str(item.get("kind") or "")
            kinds[kind] += 1
            if kind not in GRAMMAR_ITEM_KINDS:
                problems.append(f"{point_id}/{item_id}: unknown kind {kind!r}")
            stage = item.get("stage")
            if not isinstance(stage, int) or not 0 <= stage <= 5:
                problems.append(f"{point_id}/{item_id}: stage must be 0..5")
            else:
                stages[stage] += 1
            if item.get("topic_id") and str(item["topic_id"]) not in topic_ids:
                problems.append(f"{point_id}/{item_id}: topic_id {item['topic_id']!r} is unknown")
            problems.extend(_check_answer(point_id, item_id, item))

        for item_id, item in by_id.items():
            twin = item.get("twin_id")
            if not twin:
                continue
            other = by_id.get(str(twin))
            if other is None:
                problems.append(f"{point_id}/{item_id}: twin {twin!r} is not in this point")
                continue
            if _options(item) != _options(other):
                problems.append(f"{point_id}/{item_id}: its twin has different options")
            elif _key(item) == _key(other):
                problems.append(f"{point_id}/{item_id}: its twin has the same key")

    # Prerequisites run forwards, and the graph is acyclic.
    for point_id, deps in prereqs.items():
        here = seq_of.get(point_id)
        for dep in deps:
            there = seq_of.get(dep)
            if here is not None and there is not None and there >= here:
                problems.append(
                    f"{point_id} (#{here}) needs {dep} (#{there}) — a beginner following the "
                    "sequence meets it before it is taught"
                )
    stuck = _cycle_nodes(prereqs)
    if stuck:
        problems.append(f"prerequisite cycle: {', '.join(stuck[:12])}")

    for point_id, dep in dangling:
        warnings.append(f"{point_id}: prerequisite {dep} is not in the pack (syllabus incomplete)")

    over = [(t, n) for t, n in topic_load.items() if n > 14 and t != "—"]
    for topic, n in sorted(over):
        warnings.append(f"topic {topic} carries {n} points' default context (floor 10 says ≤ 14)")

    # Vocabulary
    lemma_seen: dict[tuple[str, str], str] = {}
    unlinked: Counter[str] = Counter()
    v2 = multiword = with_contexts = 0
    for row in vocab:
        entry_id = str(row["id"])
        key = (str(row.get("lemma", "")).strip().lower(), str(row.get("pos") or "other"))
        if key in lemma_seen:
            problems.append(f"vocab {entry_id}: duplicates {lemma_seen[key]} ({key[0]}/{key[1]})")
        lemma_seen[key] = entry_id
        blob = row.get("entry_json")
        if isinstance(blob, str):
            try:
                blob = json.loads(blob)
            except ValueError:
                problems.append(f"vocab {entry_id}: entry_json is not valid JSON")
                continue
        if not isinstance(blob, dict):
            continue
        if int(blob.get("schema_version") or 1) >= 2:
            v2 += 1
        if str(blob.get("unit_type") or "word") in ("chunk", "frame", "collocation"):
            multiword += 1
        contexts = blob.get("contexts") or []
        if len(contexts) >= 3:
            with_contexts += 1
        for ctx in contexts:
            if not isinstance(ctx, dict):
                continue
            gap = str(ctx.get("gap_span") or "")
            if gap and gap not in str(ctx.get("text") or ""):
                problems.append(
                    f"vocab {entry_id}: gap_span {gap!r} is not a substring of its own context"
                )
        for link in blob.get("grammar_links") or []:
            if str(link) not in ids:
                unlinked[str(link)] += 1
    if unlinked:
        # One line, not one per entry: with a partial syllabus every vocabulary entry
        # pointing at an unauthored point would drown the real problems in noise.
        top = ", ".join(f"{pid} ×{n}" for pid, n in unlinked.most_common(5))
        warnings.append(
            f"vocabulary: {sum(unlinked.values())} grammar_link(s) across "
            f"{len(unlinked)} point id(s) name a point this pack does not carry ({top}) — "
            "the links are inert until those points are authored"
        )

    stats = {
        "points": len(points),
        "items": len(item_owner),
        "vocab": len(vocab),
        "vocab_v2": v2,
        "vocab_multiword": multiword,
        "vocab_with_3_contexts": with_contexts,
        "kinds": dict(sorted(kinds.items())),
        "stages": dict(sorted(stages.items())),
        "levels": dict(sorted(levels.items())),
        "roles": dict(sorted(roles.items())),
        "dangling_prerequisites": len(dangling),
        "reachable_from_zero": len(_reachable(prereqs)),
    }
    return problems, warnings, stats


def _options(item: dict[str, Any]) -> list[str]:
    payload = item.get("payload") or {}
    out: list[str] = []
    for option in payload.get("options") or []:
        out.append(str(option.get("text")) if isinstance(option, dict) else str(option))
    return out


def _key(item: dict[str, Any]) -> Any:
    return (item.get("payload") or {}).get("key")


def _check_answer(point_id: str, item_id: str, item: dict[str, Any]) -> list[str]:
    """One defensible answer, and every distractor distinct.

    Two options with the same text is two correct answers sharing one key, and the learner
    who picks the other one is told they are wrong for choosing the same words. It is the
    cheapest possible way to destroy trust in a grader, so it is blocking.
    """
    out: list[str] = []
    where = f"{point_id}/{item_id}"
    kind = str(item.get("kind") or "")
    payload = item.get("payload") or {}
    expected = item.get("expected")

    if kind in ("interpret", "choose_form"):
        options = _options(item)
        if len(options) < 2:
            out.append(f"{where}: needs at least two options")
        if len(set(options)) != len(options):
            out.append(f"{where}: two options have the same text — {_dupes(options)}")
        key = payload.get("key")
        if not isinstance(key, int) or not 0 <= key < len(options):
            out.append(f"{where}: key {key!r} is not an index into options[]")
    elif kind == "both_ok":
        options = _options(item)
        if len(set(options)) != len(options):
            out.append(f"{where}: two options have the same text — {_dupes(options)}")
        if payload.get("key") != "both":
            out.append(f"{where}: a both_ok item's key is the string 'both'")
        follow = payload.get("follow_up") or {}
        fkey = follow.get("key")
        if not isinstance(fkey, int) or not 0 <= fkey < max(1, len(options)):
            out.append(f"{where}: the follow-up needs a single key into options[]")
    elif kind == "judge":
        reasons = [str(r) for r in (payload.get("reasons") or [])]
        if len(set(reasons)) != len(reasons):
            out.append(f"{where}: two reasons are identical — {_dupes(reasons)}")
        if payload.get("acceptable") is None:
            out.append(f"{where}: payload.acceptable must be true or false")
        if payload.get("acceptable") is False:
            rkey = payload.get("reason_key")
            if not isinstance(rkey, int) or not 0 <= rkey < len(reasons):
                out.append(f"{where}: reason_key is not an index into reasons[]")
    elif kind == "contrast_pair":
        sentences = [str(s) for s in (payload.get("sentences") or [])]
        meanings = [str(m) for m in (payload.get("meanings") or [])]
        key = payload.get("key")
        if len(set(sentences)) != len(sentences):
            out.append(f"{where}: two sentences are identical")
        if len(set(meanings)) != len(meanings):
            out.append(f"{where}: two meanings are identical — the pair has no answer")
        if not isinstance(key, list) or sorted(key) != list(range(len(sentences))):
            out.append(f"{where}: key must assign each sentence exactly one meaning")
    elif kind == "order":
        tokens = payload.get("tokens") or []
        orders = payload.get("accepted_orders") or []
        if not orders:
            out.append(f"{where}: order items must list every legal token order")
        for order in orders:
            if sorted(order or []) != list(range(len(tokens))):
                out.append(f"{where}: an accepted_order is not a permutation of tokens[]")
    elif kind in ("gap_fill", "transform", "error_fix", "dictation"):
        if kind == "gap_fill" and int(payload.get("blanks") or 1) > 2:
            out.append(f"{where}: a gap_fill takes two blanks at most")
        if kind == "dictation":
            audio = str(payload.get("audio_text") or "")
            for token in payload.get("scored_tokens") or []:
                if str(token) not in audio:
                    out.append(f"{where}: scored token {token!r} is not in audio_text")
            if len(audio.split()) > 16:
                out.append(f"{where}: audio_text is longer than 16 words")
        if payload.get("mode") != "dictogloss":
            values = [str(e) for e in (expected or [])]
            if not values:
                out.append(f"{where}: a type-in item needs expected[]")
            if len(set(values)) != len(values):
                out.append(f"{where}: expected[] repeats an answer — {_dupes(values)}")
            # `normalize_answer_text()` preserves apostrophes, so `dont` != `don't` on a
            # bare set-membership test (DESIGN lint 34). `grading.grammar_close` already
            # forgives a dropped apostrophe as a typing slip — **except** where stripping
            # it produces a different real word (`its`/`it's`, `were`/`we're`). Those are
            # the only ones the author has to spell out, and asking for the rest would put
            # `everybodys` in the accepted list, which is just a misspelling.
            for value in values:
                if "'" not in value:
                    continue
                bare = value.replace("'", "")
                if bare.split()[-1] in _APOSTROPHE_SENSITIVE and bare not in values:
                    out.append(
                        f"{where}: expected {value!r} ends in an apostrophe-sensitive word, "
                        f"so {bare!r} must be listed too or the learner is marked wrong for "
                        "a keyboard habit"
                    )
    elif kind in ("produce", "combine", "speaking_drill"):
        if kind == "produce" and not str(payload.get("prompt_text") or "").strip():
            out.append(f"{where}: a produce item needs a prompt")
        if kind == "produce" and payload.get("mode") == "apply_to_task" and not payload.get(
            "task_ref"
        ):
            out.append(f"{where}: apply_to_task needs a task_ref")

    feedback = item.get("feedback") or {}
    if not str(feedback.get("why_key") or "").strip():
        out.append(f"{where}: feedback.why_key is empty")
    if not str(feedback.get("feed_forward") or "").strip():
        out.append(f"{where}: feedback.feed_forward is empty")
    for banned in ("great", "well done", "you're doing", "nice work"):
        if banned in str(feedback.get("feed_forward") or "").lower():
            out.append(f"{where}: feed_forward praises the learner rather than naming the next move")

    cue = item.get("decision_cue")
    if kind in ("choose_form", "judge", "both_ok", "contrast_pair") and cue:
        haystack = " ".join(
            str(x)
            for x in (
                payload.get("context"),
                payload.get("sentence"),
                payload.get("stem"),
                *(payload.get("sentences") or []),
            )
            if x
        )
        if str(cue) not in haystack:
            out.append(f"{where}: decision_cue {cue!r} is not a substring of its own item")
    return out


def _dupes(values: Sequence[str]) -> str:
    return ", ".join(repr(v) for v, n in Counter(values).items() if n > 1)


def _cycle_nodes(prereqs: dict[str, list[str]]) -> list[str]:
    indegree = {pid: len(set(deps)) for pid, deps in prereqs.items()}
    dependants: dict[str, list[str]] = {}
    for pid, deps in prereqs.items():
        for dep in set(deps):
            dependants.setdefault(dep, []).append(pid)
    queue = [pid for pid, n in indegree.items() if n == 0]
    consumed = 0
    while queue:
        node = queue.pop()
        consumed += 1
        for child in dependants.get(node, []):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    if consumed == len(prereqs):
        return []
    return sorted(pid for pid, n in indegree.items() if n > 0)


def _reachable(prereqs: dict[str, list[str]]) -> set[str]:
    """Points a learner who knows nothing can eventually reach.

    Start from every point with no *installed* prerequisite and walk forwards, which is
    exactly what the runtime does: ``syllabus.unmet_prerequisites`` ignores a prerequisite
    that is not installed, so an incomplete syllabus opens rather than locks.
    """
    reached: set[str] = set()
    changed = True
    while changed:
        changed = False
        for pid, deps in prereqs.items():
            if pid in reached:
                continue
            if all(dep in reached for dep in deps):
                reached.add(pid)
                changed = True
    return reached


# --------------------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------------------


def dump_jsonl(rows: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def summarise(stats: dict[str, Any]) -> list[str]:
    return [
        f"grammar points: {stats['points']}  (roles {stats['roles']}, CEFR {stats['levels']})",
        f"practice items: {stats['items']}  by kind {stats['kinds']}",
        f"                        by stage {stats['stages']}",
        f"vocabulary: {stats['vocab']} entries — {stats['vocab_v2']} at schema v2, "
        f"{stats['vocab_multiword']} multi-word, {stats['vocab_with_3_contexts']} with ≥ 3 contexts",
        f"prerequisite graph: acyclic, {stats['reachable_from_zero']}/{stats['points']} points "
        f"reachable from a zero-knowledge start, "
        f"{stats['dangling_prerequisites']} edge(s) to points not in this pack",
    ]


def _print(problems: list[str], label: str) -> None:
    print(f"\n{label}: {len(problems)} problem(s)", file=sys.stderr)
    for line in problems[:60]:
        print(f"  - {line}", file=sys.stderr)
    if len(problems) > 60:
        print(f"  … and {len(problems) - 60} more", file=sys.stderr)


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.content.merge_grammar",
        description="Fold staging-grammar/content/*.json into data/grammar.jsonl + data/vocab.jsonl",
    )
    parser.add_argument("pack", nargs="?", default=DEFAULT_PACK, help="pack root")
    parser.add_argument("--check", action="store_true", help="report without writing")
    parser.add_argument("--lint-only", action="store_true", help="lint the staging files and stop")
    parser.add_argument("--allow-lint-failures", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    pack = resolve_pack(args.pack)
    try:
        docs = staging_docs(pack)
        existing_points = read_rows(pack / GRAMMAR_FILE)
        existing_vocab = read_rows(pack / VOCAB_FILE)
        topic_ids = read_topic_ids(pack)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not args.quiet:
        print(f"pack: {pack}")
        print(
            f"existing rows: {len(existing_points)} grammar points, "
            f"{len(existing_vocab)} vocabulary entries"
        )
        for path, doc in docs:
            print(
                f"  {path.name}: {len(doc.get('points') or ())} points, "
                f"{len(doc.get('vocab_new') or ())} new vocab, "
                f"{len(doc.get('vocab_updates') or ())} updates"
            )

    problems = lint_staging(docs)
    if problems:
        _print(problems, "lint")
    elif not args.quiet:
        print("\nlint: clean")
    if args.lint_only:
        return 1 if problems else 0
    if problems and not args.allow_lint_failures:
        print("\nrefusing to merge; pass --allow-lint-failures to override", file=sys.stderr)
        return 1

    try:
        points, vocab, stats, notes = merge_rows(existing_points, existing_vocab, docs)
    except MergeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    integrity, warnings, summary = check_integrity(points, vocab, topic_ids)
    if integrity:
        _print(integrity, "integrity")
    elif not args.quiet:
        print("integrity: clean")
    if warnings and not args.quiet:
        print(f"\nwarnings: {len(warnings)}")
        for line in warnings[:15]:
            print(f"  ! {line}")
        if len(warnings) > 15:
            print(f"  … and {len(warnings) - 15} more")
    if notes and not args.quiet:
        print(f"\ndeduplicated: {len(notes)}")
        for line in notes[:10]:
            print(f"  ~ {line}")
    if integrity and not args.allow_lint_failures:
        print("\nrefusing to write a broken pack", file=sys.stderr)
        return 1

    grammar_path = pack / GRAMMAR_FILE
    vocab_path = pack / VOCAB_FILE
    grammar_text = dump_jsonl(points)
    vocab_text = dump_jsonl(vocab)
    changed = grammar_text != (
        grammar_path.read_text(encoding="utf-8") if grammar_path.exists() else ""
    ) or vocab_text != (vocab_path.read_text(encoding="utf-8") if vocab_path.exists() else "")

    print("\n" + "\n".join(summarise(summary)))
    if args.check:
        print("check: " + ("DIFFERS from disk" if changed else "up to date"))
        return 1 if changed else 0

    if changed:
        write_atomic(grammar_path, grammar_text)
        write_atomic(vocab_path, vocab_text)
    print(
        "\nmerged: "
        f"{stats.get('points_appended', 0)} points appended, "
        f"{stats.get('points_replaced', 0)} replaced, "
        f"{stats.get('points_unchanged', 0)} already current; "
        f"{stats.get('vocab_appended', 0)} entries appended, "
        f"{stats.get('vocab_replaced', 0)} replaced, "
        f"{stats.get('vocab_unchanged', 0)} already current, "
        f"{stats.get('vocab_deduped', 0)} skipped as duplicates; "
        f"{stats.get('updates_applied', 0)} retrofits applied"
    )
    print(f"{'wrote' if changed else 'unchanged'}: {grammar_path}")
    print(f"{'wrote' if changed else 'unchanged'}: {vocab_path}")
    print("next: uv run --project sidecar python -m tools.content.build " + str(args.pack))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
