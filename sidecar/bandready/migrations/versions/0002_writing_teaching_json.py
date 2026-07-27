"""writing_prompts.teaching_json — the authored teaching payload

A writing prompt had no payload column, so the teaching layer authored in
``content/core-en/staging-writing`` (schema in that directory's ``DESIGN.md`` §1–§5) had
nowhere to land: ``loader.upsert_rows`` copies only the columns named in
``TABLE_COLUMNS["writing_prompts"]`` and dropped every extra key on the floor. This adds the
one nullable TEXT column that holds it, mirroring ``speaking_cards.payload_json``.

Nullable by design: the column is absent-by-default and every consumer
(``bandready.writing.coach``) treats a NULL as "no teaching material for this prompt".

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-27

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('writing_prompts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('teaching_json', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('writing_prompts', schema=None) as batch_op:
        batch_op.drop_column('teaching_json')
