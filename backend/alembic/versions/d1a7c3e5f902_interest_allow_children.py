"""interests: allow_children, may an interest get new sub-interests

Revision ID: d1a7c3e5f902
Revises: c9e5a7b3d214
"""
from alembic import op
import sqlalchemy as sa


revision = 'd1a7c3e5f902'
down_revision = 'c9e5a7b3d214'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additivt: en kolumn som är sann för alla, så att inget som körs idag påverkas. Biblioteket sätter den falsk för
    # plattformarna (PlayStation, PC ...) vid nästa python -m app.sync_interests.
    op.add_column('interests', sa.Column('allow_children', sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column('interests', 'allow_children')
