"""positions for events and clubs

Revision ID: a7c2e4f9b1d3
Revises: f3b8c1d6a274
Create Date: 2026-10-14 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7c2e4f9b1d3'
down_revision = 'f3b8c1d6a274'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Var på kartan ett event är. Valfritt: befintliga events får ingen
    # position och visas som förut mitt i sin kommun.
    op.add_column('events', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('events', sa.Column('longitude', sa.Float(), nullable=True))

    # Valfri träffplats för klubbar: namn, adress och position.
    op.add_column('groups', sa.Column('place_name', sa.String(length=100), nullable=True))
    op.add_column('groups', sa.Column('address', sa.String(length=100), nullable=True))
    op.add_column('groups', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('groups', sa.Column('longitude', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('groups', 'longitude')
    op.drop_column('groups', 'latitude')
    op.drop_column('groups', 'address')
    op.drop_column('groups', 'place_name')
    op.drop_column('events', 'longitude')
    op.drop_column('events', 'latitude')
