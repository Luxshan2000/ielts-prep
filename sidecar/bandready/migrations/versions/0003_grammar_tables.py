"""grammar_points / grammar_items / grammar_cards / grammar_review_logs

The Grammar & Usage module (grammar ``DESIGN.md`` §0.4 D1). Four additive tables, no data
migration, nothing existing is touched:

* ``grammar_points``     — upserted by the loader from ``data/grammar.jsonl``;
* ``grammar_items``      — DERIVED from ``point_json.items[]``, rebuilt on every import,
                           exactly like ``reading_questions``;
* ``grammar_cards``      — one card per point per profile, carrying the six ladder columns
                           this module owns plus the nine FSRS columns named exactly as
                           ``srs_cards`` names them, so ``bandready.srs.scheduler`` runs
                           over the row unmodified;
* ``grammar_review_logs`` — append-only, mirroring ``srs_review_logs``. It exists because
                           ``srs_review_logs.review_type`` is CheckConstraint-ed to the six
                           vocabulary exercise kinds and would reject every grammar kind.

``grammar_review_logs.item_id`` is deliberately **loose text and not a foreign key**: the
loader rebuilds ``grammar_items`` on each import, and an item dropped by a later pack
version must leave the learner's history readable rather than abort the upgrade.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-31

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOW = sa.text("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")


def upgrade() -> None:
    op.create_table(
        'grammar_points',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('unit_id', sa.Text(), nullable=False),
        sa.Column('sequence_index', sa.Integer(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('cefr_level', sa.Text(), server_default=sa.text("'B1'"), nullable=False),
        sa.Column('role', sa.Text(), server_default=sa.text("'form'"), nullable=False),
        sa.Column('topic_id', sa.Text(), nullable=True),
        sa.Column('point_json', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), server_default=sa.text("'pack'"), nullable=False),
        sa.Column('pack_id', sa.Text(), nullable=True),
        sa.Column('pack_version', sa.Text(), nullable=True),
        sa.Column('license', sa.Text(), nullable=True),
        sa.Column('retired', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.Text(), server_default=NOW, nullable=False),
        sa.CheckConstraint("source IN ('pack','generated','user')",
                           name=op.f('ck_grammar_points_source')),
        sa.CheckConstraint('retired IN (0,1)', name=op.f('ck_grammar_points_retired')),
        sa.CheckConstraint("role IN ('form','choice','accuracy')",
                           name=op.f('ck_grammar_points_role')),
        sa.CheckConstraint("cefr_level IN ('A1','A2','B1','B2','C1','C2')",
                           name=op.f('ck_grammar_points_cefr_level')),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id'],
                                name=op.f('fk_grammar_points_topics_topic_id')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_grammar_points')),
    )
    op.create_index('ix_grammar_points_seq', 'grammar_points',
                    ['sequence_index', 'retired'], unique=False)

    op.create_table(
        'grammar_items',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('point_id', sa.Text(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('stage', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('register', sa.Text(), server_default=sa.text("'both'"), nullable=False),
        sa.Column('confusion_set', sa.Text(), nullable=True),
        sa.Column('twin_id', sa.Text(), nullable=True),
        sa.Column('error_codes_json', sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('topic_id', sa.Text(), nullable=True),
        sa.Column('item_json', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['point_id'], ['grammar_points.id'], ondelete='CASCADE',
                                name=op.f('fk_grammar_items_grammar_points_point_id')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_grammar_items')),
    )
    op.create_index('ix_grammar_items_pick', 'grammar_items',
                    ['point_id', 'stage', 'kind'], unique=False)
    op.create_index('ix_grammar_items_codes', 'grammar_items',
                    ['kind', 'confusion_set'], unique=False)

    op.create_table(
        'grammar_cards',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('profile_id', sa.Text(), nullable=False),
        sa.Column('point_id', sa.Text(), nullable=False),
        sa.Column('stage', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('stage_successes', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('stage_days_json', sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('seen_items_json', sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('last_wild_failure_at', sa.Text(), nullable=True),
        sa.Column('leech', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('state', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('step', sa.Integer(), nullable=True),
        sa.Column('stability', sa.REAL(), nullable=True),
        sa.Column('difficulty', sa.REAL(), nullable=True),
        sa.Column('due_at', sa.Text(), nullable=False),
        sa.Column('last_review_at', sa.Text(), nullable=True),
        sa.Column('reps', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('lapses', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('fsrs_json', sa.Text(), nullable=False),
        sa.CheckConstraint('state IN (0,1,2,3)', name=op.f('ck_grammar_cards_state')),
        sa.CheckConstraint('stage BETWEEN 0 AND 5', name=op.f('ck_grammar_cards_stage')),
        sa.ForeignKeyConstraint(['point_id'], ['grammar_points.id'],
                                name=op.f('fk_grammar_cards_grammar_points_point_id')),
        sa.ForeignKeyConstraint(['profile_id'], ['profiles.id'], ondelete='CASCADE',
                                name=op.f('fk_grammar_cards_profiles_profile_id')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_grammar_cards')),
        sa.UniqueConstraint('profile_id', 'point_id', name='uq_grammar_cards_profile_point'),
    )
    op.create_index('ix_grammar_cards_due', 'grammar_cards', ['profile_id', 'due_at'], unique=False)

    op.create_table(
        'grammar_review_logs',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('card_id', sa.Text(), nullable=False),
        # loose text, NOT an FK — see the module docstring.
        sa.Column('item_id', sa.Text(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('review_type', sa.Text(), nullable=False),
        sa.Column('outcome', sa.Text(), nullable=False),
        sa.Column('stage_before', sa.Integer(), nullable=False),
        sa.Column('error_codes_json', sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column('reviewed_at', sa.Text(), server_default=NOW, nullable=False),
        sa.Column('elapsed_ms', sa.Integer(), nullable=True),
        sa.Column('state_before', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('stability_before', sa.REAL(), nullable=True),
        sa.Column('difficulty_before', sa.REAL(), nullable=True),
        sa.CheckConstraint('rating BETWEEN 1 AND 4', name=op.f('ck_grammar_review_logs_rating')),
        sa.ForeignKeyConstraint(['card_id'], ['grammar_cards.id'], ondelete='CASCADE',
                                name=op.f('fk_grammar_review_logs_grammar_cards_card_id')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_grammar_review_logs')),
    )
    op.create_index('ix_grammar_review_logs_card', 'grammar_review_logs',
                    ['card_id', 'reviewed_at'], unique=False)
    op.create_index('ix_grammar_review_logs_time', 'grammar_review_logs',
                    ['reviewed_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_grammar_review_logs_time', table_name='grammar_review_logs')
    op.drop_index('ix_grammar_review_logs_card', table_name='grammar_review_logs')
    op.drop_table('grammar_review_logs')
    op.drop_index('ix_grammar_cards_due', table_name='grammar_cards')
    op.drop_table('grammar_cards')
    op.drop_index('ix_grammar_items_codes', table_name='grammar_items')
    op.drop_index('ix_grammar_items_pick', table_name='grammar_items')
    op.drop_table('grammar_items')
    op.drop_index('ix_grammar_points_seq', table_name='grammar_points')
    op.drop_table('grammar_points')
