"""add event creator_in_max

Revision ID: c3e8a5f1b927
Revises: b7d2e4f9a316
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3e8a5f1b927'
down_revision = 'b7d2e4f9a316'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Räknas skaparens eget Ja in i max antal? På för alla befintliga events, så att de fungerar som förut.
    op.add_column(
        'events',
        sa.Column('creator_in_max', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('events', 'creator_in_max')
