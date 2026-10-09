"""add events.guests_can_invite

Revision ID: c73402a1493c
Revises: 7c3e5a1f9b42
Create Date: 2026-10-07 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c73402a1493c'
down_revision = '7c3e5a1f9b42'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Befintliga events får false, så bara skaparen kan bjuda in som förut.
    op.add_column('events', sa.Column('guests_can_invite', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column('events', 'guests_can_invite')
