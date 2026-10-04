"""add unique index on lower(username)

Revision ID: 2add8296567d
Revises: f2a7c9d1e834
"""
from alembic import op
import sqlalchemy as sa


revision = '2add8296567d'
down_revision = 'f2a7c9d1e834'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Faller om det redan finns två användare som bara skiljer sig i skiftläge.
    # Kolla först: SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
    op.create_index(
        'uq_users_username_lower',
        'users',
        [sa.text('lower(username)')],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('uq_users_username_lower', table_name='users')
