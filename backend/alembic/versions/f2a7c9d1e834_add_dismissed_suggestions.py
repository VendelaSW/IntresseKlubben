"""add dismissed suggestions

Revision ID: f2a7c9d1e834
Revises: a894e6b43b39
"""
from alembic import op
import sqlalchemy as sa


revision = 'f2a7c9d1e834'
down_revision = 'a894e6b43b39'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'dismissed_suggestions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('dismissed_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('user_id != dismissed_user_id', name='ck_dismissed_suggestions_distinct_users'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['dismissed_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'dismissed_user_id', name='uq_dismissed_suggestions_pair'),
    )


def downgrade() -> None:
    op.drop_table('dismissed_suggestions')
