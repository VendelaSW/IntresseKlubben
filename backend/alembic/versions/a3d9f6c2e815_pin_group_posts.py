"""pin group posts

Revision ID: a3d9f6c2e815
Revises: b6e1c4a9d273
"""
from alembic import op
import sqlalchemy as sa


revision = 'a3d9f6c2e815'
down_revision = 'b6e1c4a9d273'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additiv: en ny kolumn som får vara tom, så inget som körs idag påverkas. Klubbens ägare kan nåla
    # fast ett inlägg i taget på anslagstavlan, som då ligger först.
    op.add_column('group_posts', sa.Column('pinned_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('group_posts', 'pinned_at')
