"""password reset and change via email

Revision ID: d7f3b9e2a581
Revises: c5e8a1d4b762
"""
from alembic import op
import sqlalchemy as sa


revision = 'd7f3b9e2a581'
down_revision = 'c5e8a1d4b762'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # När lösenordet senast byttes. Inloggningar från innan dess slutar gälla.
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
    # Det nya lösenordet (hashat) medan ett byte väntar på att bekräftas via mejlet.
    op.add_column('email_tokens', sa.Column('new_password_hash', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('email_tokens', 'new_password_hash')
    op.drop_column('users', 'password_changed_at')
