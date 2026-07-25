"""Alembic environment.

The connection always comes from ``bandready.db.engine`` (the DB path depends on the runtime
data dir), so ``alembic.ini`` carries no ``sqlalchemy.url``. ``render_as_batch=True`` is
mandatory: SQLite cannot ALTER most things, so every future alteration uses Alembic's
copy-and-rename batch mode (11-data-model.md §12).
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import Column

from bandready.db import models  # noqa: F401  (registers every table on Base.metadata)
from bandready.db.engine import get_engine
from bandready.db.models import Base

config = context.config
target_metadata = Base.metadata

#: FTS5 external-content tables create shadow tables (``vocab_fts_data`` …) that autogenerate
#: would otherwise propose dropping. They are owned by bandready.db.views, not by metadata.
_UNMANAGED_TABLE_PREFIXES = ("vocab_fts",)


def _expression_index_names() -> set[str]:
    """Index names carrying a raw SQL term (``… DESC``).

    SQLite cannot reflect expression-based indexes, so autogenerate would emit a spurious
    drop/create pair for each on every run. They are created explicitly in the migrations.
    """
    names: set[str] = set()
    for table in target_metadata.tables.values():
        for index in table.indexes:
            if index.name and any(
                not isinstance(expr, Column) for expr in index.expressions
            ):
                names.add(index.name)
    return names


_EXPRESSION_INDEXES = _expression_index_names()


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    """Keep autogenerate away from objects this package manages by hand."""
    if type_ == "table" and name and name.startswith(_UNMANAGED_TABLE_PREFIXES):
        return False
    return not (type_ == "index" and name in _EXPRESSION_INDEXES)


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        render_as_batch=True,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        **kwargs,
    )


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url", None) or str(get_engine().url)
    _configure(url=url, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = config.attributes.get("engine") or get_engine()
    with connectable.connect() as connection:
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
