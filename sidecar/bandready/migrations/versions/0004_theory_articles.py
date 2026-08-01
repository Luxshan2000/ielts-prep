"""theory_articles — the browsable reference

Theory is the map; the practice module is the walking route. A learner who has never met
grammar terminology needs to be able to survey the language — what the tenses are, what a
modal does, when the passive is the right choice — before being asked to practise any of it.

The table therefore carries no learner state and no prerequisite gate. Reference is always
readable: gating it would defeat the only reason it exists. (The practice module's gate on
notice-set answers stays exactly as it is; that withholds answers to *practice items*, which
is a different thing entirely.)

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

#: Same clock the rest of the schema uses, so provenance rows sort together.
NOW = sa.text("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "theory_articles",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("chapter_id", sa.Text(), nullable=False),
        sa.Column("sequence_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), server_default=sa.text("'explainer'"), nullable=False),
        sa.Column("cefr_level", sa.Text(), server_default=sa.text("'A1'"), nullable=False),
        # Every block the reader sees lives in here; the columns above are only for listing
        # and ordering the chapter index.
        sa.Column("article_json", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), server_default=sa.text("'pack'"), nullable=False),
        sa.Column("pack_id", sa.Text(), nullable=True),
        sa.Column("pack_version", sa.Text(), nullable=True),
        sa.Column("license", sa.Text(), nullable=True),
        # Retired rather than deleted, for the same reason the rest of the pack is: an
        # upgrade that drops an article must not break a link that points at it.
        sa.Column("retired", sa.Integer(), server_default=sa.text("0"), nullable=False),
        # PackMixin contributes this on every content-bank table; omitting it here makes the
        # ORM select a column the table does not have, and every read fails at runtime.
        sa.Column("created_at", sa.Text(), server_default=NOW, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_theory_articles_chapter",
        "theory_articles",
        ["chapter_id", "sequence_index"],
    )
    op.create_index("ix_theory_articles_seq", "theory_articles", ["sequence_index", "retired"])


def downgrade() -> None:
    op.drop_index("ix_theory_articles_seq", table_name="theory_articles")
    op.drop_index("ix_theory_articles_chapter", table_name="theory_articles")
    op.drop_table("theory_articles")
