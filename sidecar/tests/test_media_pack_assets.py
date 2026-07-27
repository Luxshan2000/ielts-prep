"""Serving an asset that a content pack ships alongside its rows.

A passage refers to its own diagram pack-relatively — ``media/reading/diagrams/x.svg``
— because it cannot know which pack id or version it will be installed as, and it has
to keep working when the pack is republished at a new version. Installation records the
real location in ``media_files.rel_path``; this is the lookup that joins the two.

Before this existed, a diagram-labelling question rendered its "image not available"
fallback and the learner simply could not answer it — four unearnable marks inside a
scored test.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text

from bandready.server.routes.media import _pack_asset

PACK_REL = "media/reading/diagrams/dg_front_pack_panel.svg"


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from bandready.config import reset_settings_cache
    from bandready.db import engine as db_engine

    monkeypatch.setenv("BANDREADY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BANDREADY_ENABLE_MOCK", "1")
    reset_settings_cache()
    db_engine.reset_engine()
    db_engine.run_migrations()
    yield tmp_path
    db_engine.reset_engine()
    reset_settings_cache()


def _install(data_dir: Path, rel_path: str, *, kind: str = "pack_media", pinned: int = 1) -> Path:
    """Put a file on disk and register it the way pack installation would."""
    target = data_dir / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")

    from bandready.db.engine import session_scope

    with session_scope() as s:
        s.execute(
            text(
                "INSERT INTO media_files (hash, kind, rel_path, bytes, pinned) "
                "VALUES (:h, :k, :rel, :b, :p)"
            ),
            {"h": rel_path, "k": kind, "rel": rel_path, "b": target.stat().st_size, "p": pinned},
        )
    return target


def test_a_pack_relative_path_resolves_to_the_installed_file(db: Path) -> None:
    installed = _install(db, f"packs/org.bandready.core-en/1.0.0/{PACK_REL}")

    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, PACK_REL) == installed


def test_the_newest_installed_version_wins(db: Path) -> None:
    """Two versions of a pack can coexist; content must reach the later one."""
    _install(db, f"packs/org.bandready.core-en/1.0.0/{PACK_REL}")
    newer = _install(db, f"packs/org.bandready.core-en/1.1.0/{PACK_REL}")

    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, PACK_REL) == newer


def test_an_unknown_asset_is_not_found(db: Path) -> None:
    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, "media/reading/diagrams/nothing-here.svg") is None


def test_cached_media_is_never_reachable_this_way(db: Path) -> None:
    """The lookup is restricted to PINNED PACK media.

    Generated audio is registered unpinned under other kinds, and user recordings are
    deliberately never registered at all (11 §9 rule 1 — voice data is not cache and is
    never swept). So neither can be fished out by guessing a plausible pack-relative
    path, which is why the query filters on kind and pinned rather than path alone.
    """
    _install(db, "media/listening/abc123.wav", kind="listening_render", pinned=0)

    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, "media/listening/abc123.wav") is None


def test_a_registered_row_whose_file_vanished_is_not_found(db: Path) -> None:
    installed = _install(db, f"packs/org.bandready.core-en/1.0.0/{PACK_REL}")
    installed.unlink()

    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, PACK_REL) is None


@pytest.mark.parametrize("junk", ["", "   ", "/"])
def test_an_empty_path_is_rejected(db: Path, junk: str) -> None:
    from bandready.db.engine import session_scope

    with session_scope() as s:
        assert _pack_asset(s, junk) is None


def test_the_shipped_diagram_is_actually_in_the_pack() -> None:
    """The content references this file by name; if it is deleted the question breaks."""
    repo = Path(__file__).resolve().parents[2]
    assert (repo / "content" / "core-en" / PACK_REL).is_file(), (
        "content/core-en/media/reading/diagrams/dg_front_pack_panel.svg is referenced by "
        "a diagram-labelling question and must ship with the pack"
    )
