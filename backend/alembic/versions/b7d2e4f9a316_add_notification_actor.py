"""add notification actor

Revision ID: b7d2e4f9a316
Revises: a9e5c3d7f214
"""
from alembic import op
import sqlalchemy as sa


revision = 'b7d2e4f9a316'
down_revision = 'a9e5c3d7f214'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Personen en notis gäller (t.ex. den som ansökte), så att Notiser kan visa hens profilbild. Blir NULL när
    # kontot raderas. Gamla notiser har ingen, och visar bilden för sin sort.
    op.add_column('notifications', sa.Column('actor_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'notifications_actor_id_fkey', 'notifications', 'users', ['actor_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('notifications_actor_id_fkey', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'actor_id')
