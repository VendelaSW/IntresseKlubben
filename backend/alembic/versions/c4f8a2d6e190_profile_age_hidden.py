"""profiles: age_hidden (dölj åldern för andra)

Revision ID: c4f8a2d6e190
Revises: e5b7c9d1f346
Create Date: 2026-10-27 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4f8a2d6e190'
down_revision = 'e5b7c9d1f346'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Additiv: alla befintliga profiler visar sin ålder som förut (SCRUM-134).
    op.add_column('profiles', sa.Column('age_hidden', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('profiles', 'age_hidden')
