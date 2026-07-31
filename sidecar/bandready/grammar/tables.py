"""The four grammar tables (grammar `DESIGN.md` §0.4 D1).

Grammar cannot hang a blob on an existing table the way reading does, and it cannot
borrow the vocabulary SRS tables:

* ``srs_cards.entry_id`` is a **unique FK to ``vocab_entries``** (`models.py:836`), so a
  grammar card can never be an ``srs_cards`` row;
* ``srs_review_logs.review_type`` is ``CheckConstraint``-ed to the six vocabulary
  exercise kinds (`models.py:874`), so logging a ``choose_form`` there raises an
  ``IntegrityError`` on the first grammar review.

So grammar gets its own parallel pair, with the **FSRS columns named exactly as
``srs_cards`` names them** — that is the whole trick that lets
``bandready.srs.scheduler`` run unmodified over a ``grammar_cards`` row (§0.3: *give
``grammar_cards`` those nine columns and all seven functions work unmodified; do not fork
the FSRS maths*).

**Why these classes live here and not in ``bandready/db/models.py``.** They belong in
``models.py`` with a matching Alembic revision — that is what D1 asks for, and this module
is written so that landing them there is a no-op: every class is *adopted* from the
declarative registry if a class with the same ``__tablename__`` already exists, and only
declared here otherwise. Until the migration exists, :func:`ensure_grammar_tables` creates
them with ``checkfirst=True`` so the module is usable today; once the migration lands the
call is a cheap no-op.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import (
    REAL,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from bandready.db.models import Base, PackMixin, now_default, pack_checks

__all__ = [
    "GRAMMAR_TABLE_NAMES",
    "GrammarCard",
    "GrammarItem",
    "GrammarPoint",
    "GrammarReviewLog",
    "ensure_grammar_tables",
]


def _adopted(tablename: str) -> Any | None:
    """The mapped class for ``tablename`` if the ORM already declares one.

    ``bandready.db.models`` is fully imported by the time this module runs (we import
    ``Base`` from it), so the registry is complete and this is a reliable "has D1 landed
    in models.py yet?" probe. Declaring a second class for the same table would raise
    ``InvalidRequestError: Table is already defined for this MetaData``.
    """
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if getattr(cls, "__tablename__", None) == tablename:
            return cls
    return None


# --------------------------------------------------------------------------------------
# grammar_points — upserted by the loader from data/grammar.jsonl
# --------------------------------------------------------------------------------------

_existing = _adopted("grammar_points")
if _existing is not None:  # pragma: no cover - only once D1 lands in models.py
    GrammarPoint = _existing
else:

    class GrammarPoint(PackMixin, Base):  # type: ignore[no-redef]
        """One teachable point = one unit = one lesson = one card (§0.5 override 1).

        Every field the learner ever sees lives inside ``point_json``: ``TABLE_COLUMNS``
        copies only the columns it lists, so an extra top-level row key is silently
        dropped at import (§0.3).
        """

        __tablename__ = "grammar_points"

        id: Mapped[str] = mapped_column(Text, primary_key=True)
        unit_id: Mapped[str] = mapped_column(Text, nullable=False)
        sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)
        title: Mapped[str] = mapped_column(Text, nullable=False)
        cefr_level: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'B1'"))
        role: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'form'"))
        topic_id: Mapped[str | None] = mapped_column(Text, ForeignKey("topics.id"))
        point_json: Mapped[str] = mapped_column(Text, nullable=False)

        __table_args__ = (
            *pack_checks(),
            CheckConstraint("role IN ('form','choice','accuracy')", name="role"),
            CheckConstraint(
                "cefr_level IN ('A1','A2','B1','B2','C1','C2')", name="cefr_level"
            ),
            Index("ix_grammar_points_seq", "sequence_index", "retired"),
        )


# --------------------------------------------------------------------------------------
# grammar_items — DERIVED from point_json.items[], exactly like reading_questions
# --------------------------------------------------------------------------------------

_existing = _adopted("grammar_items")
if _existing is not None:  # pragma: no cover
    GrammarItem = _existing
else:

    class GrammarItem(Base):  # type: ignore[no-redef]
        """Flattened projection of ``grammar_points.point_json.items[]``.

        Deliberately **not** an FK target from ``grammar_review_logs``: the loader
        rebuilds this table on every import (delete-then-upsert, the rule
        ``derive_reading_questions`` learned the hard way), and an item dropped by a later
        pack version must leave the learner's history readable rather than abort the
        import.
        """

        __tablename__ = "grammar_items"

        id: Mapped[str] = mapped_column(Text, primary_key=True)
        point_id: Mapped[str] = mapped_column(
            Text, ForeignKey("grammar_points.id", ondelete="CASCADE"), nullable=False
        )
        kind: Mapped[str] = mapped_column(Text, nullable=False)
        stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        register: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'both'"))
        confusion_set: Mapped[str | None] = mapped_column(Text)
        twin_id: Mapped[str | None] = mapped_column(Text)
        error_codes_json: Mapped[str] = mapped_column(
            Text, nullable=False, server_default=text("'[]'")
        )
        topic_id: Mapped[str | None] = mapped_column(Text)
        item_json: Mapped[str] = mapped_column(Text, nullable=False)

        __table_args__ = (
            Index("ix_grammar_items_pick", "point_id", "stage", "kind"),
            Index("ix_grammar_items_codes", "kind", "confusion_set"),
        )


# --------------------------------------------------------------------------------------
# grammar_cards — one card per POINT per profile
# --------------------------------------------------------------------------------------

_existing = _adopted("grammar_cards")
if _existing is not None:  # pragma: no cover
    GrammarCard = _existing
else:

    class GrammarCard(Base):  # type: ignore[no-redef]
        """Ladder state + FSRS state for one point.

        The two blocks below are the module's authority boundary made physical (§1.1).
        Everything above the divider is written by ``bandready.grammar.practice`` and
        never by FSRS; everything below is written by ``bandready.srs.scheduler`` and
        never by the Ladder. The FSRS block uses ``srs_cards``' column names verbatim so
        ``scheduler.review`` / ``card_from_row`` / ``preview_intervals`` /
        ``retrievability`` / ``card_public`` all accept this row unmodified.
        """

        __tablename__ = "grammar_cards"

        id: Mapped[str] = mapped_column(Text, primary_key=True)
        profile_id: Mapped[str] = mapped_column(
            Text, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
        )
        point_id: Mapped[str] = mapped_column(
            Text, ForeignKey("grammar_points.id"), nullable=False
        )

        # --- ladder state (this module owns these) ---------------------------------
        stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        stage_successes: Mapped[int] = mapped_column(
            Integer, nullable=False, server_default=text("0")
        )
        stage_days_json: Mapped[str] = mapped_column(
            Text, nullable=False, server_default=text("'[]'")
        )
        seen_items_json: Mapped[str] = mapped_column(
            Text, nullable=False, server_default=text("'[]'")
        )
        last_wild_failure_at: Mapped[str | None] = mapped_column(Text)
        leech: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

        # --- FSRS state (identical column names to srs_cards) -----------------------
        state: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        step: Mapped[int | None] = mapped_column(Integer)
        stability: Mapped[float | None] = mapped_column(REAL)
        difficulty: Mapped[float | None] = mapped_column(REAL)
        due_at: Mapped[str] = mapped_column(Text, nullable=False)
        last_review_at: Mapped[str | None] = mapped_column(Text)
        reps: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        lapses: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        fsrs_json: Mapped[str] = mapped_column(Text, nullable=False)

        __table_args__ = (
            UniqueConstraint("profile_id", "point_id", name="uq_grammar_cards_profile_point"),
            CheckConstraint("state IN (0,1,2,3)", name="state"),
            CheckConstraint("stage BETWEEN 0 AND 5", name="stage"),
            Index("ix_grammar_cards_due", "profile_id", "due_at"),
        )


# --------------------------------------------------------------------------------------
# grammar_review_logs — append-only, mirrors srs_review_logs plus the ladder columns
# --------------------------------------------------------------------------------------

_existing = _adopted("grammar_review_logs")
if _existing is not None:  # pragma: no cover
    GrammarReviewLog = _existing
else:

    class GrammarReviewLog(Base):  # type: ignore[no-redef]
        """Every retrieval, and every real-world confirmation or contradiction of one.

        ``item_id`` is **loose text, not an FK**. Three things are written into it and
        the prefix says which:

        ``gi_…``               an authored item id;
        ``real:<module>:<id>`` a correct use detected in a real submission (mastery
                               condition 3 counts these as stronger evidence);
        ``wild:<module>:<id>`` the same error code coming back in a real submission — the
                               wild failure of §1.6.
        """

        __tablename__ = "grammar_review_logs"

        id: Mapped[str] = mapped_column(Text, primary_key=True)
        card_id: Mapped[str] = mapped_column(
            Text, ForeignKey("grammar_cards.id", ondelete="CASCADE"), nullable=False
        )
        item_id: Mapped[str | None] = mapped_column(Text)
        rating: Mapped[int] = mapped_column(Integer, nullable=False)
        review_type: Mapped[str] = mapped_column(Text, nullable=False)
        outcome: Mapped[str] = mapped_column(Text, nullable=False)
        stage_before: Mapped[int] = mapped_column(Integer, nullable=False)
        error_codes_json: Mapped[str] = mapped_column(
            Text, nullable=False, server_default=text("'[]'")
        )
        reviewed_at: Mapped[str] = mapped_column(
            Text, nullable=False, server_default=now_default()
        )
        elapsed_ms: Mapped[int | None] = mapped_column(Integer)
        state_before: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
        stability_before: Mapped[float | None] = mapped_column(REAL)
        difficulty_before: Mapped[float | None] = mapped_column(REAL)

        __table_args__ = (
            CheckConstraint("rating BETWEEN 1 AND 4", name="rating"),
            Index("ix_grammar_review_logs_card", "card_id", "reviewed_at"),
            Index("ix_grammar_review_logs_time", "reviewed_at"),
        )


GRAMMAR_TABLE_NAMES: tuple[str, ...] = (
    "grammar_points",
    "grammar_items",
    "grammar_cards",
    "grammar_review_logs",
)

_ensured_urls: set[str] = set()


def ensure_grammar_tables(engine: Any = None) -> None:
    """Create the four tables if they are not there yet (``checkfirst=True``).

    This is the bridge that keeps the module runnable before D1's Alembic revision
    exists. It never alters an existing table, so once the migration lands this becomes a
    no-op that costs one ``PRAGMA table_info`` per process.
    """
    from bandready.db.engine import get_engine

    eng = engine if engine is not None else get_engine()
    key = str(getattr(eng, "url", eng))
    if key in _ensured_urls:
        return
    tables = [Base.metadata.tables[name] for name in GRAMMAR_TABLE_NAMES]
    Base.metadata.create_all(bind=eng, tables=tables, checkfirst=True)
    _ensured_urls.add(key)
