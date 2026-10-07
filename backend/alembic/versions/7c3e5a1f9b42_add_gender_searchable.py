"""add profiles.gender_searchable

Revision ID: 7c3e5a1f9b42
Revises: e0a6b2b09a47
"""
from alembic import op
import sqlalchemy as sa


revision = '7c3e5a1f9b42'
down_revision = 'e0a6b2b09a47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Befintliga profiler blir inte sökbara på kön förrän de själva väljer det.
    op.add_column(
        'profiles',
        sa.Column('gender_searchable', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('profiles', 'gender_searchable')
