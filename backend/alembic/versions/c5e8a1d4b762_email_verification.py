"""email verification

Revision ID: c5e8a1d4b762
Revises: a7c2e4f9b1d3
"""
from alembic import op
import sqlalchemy as sa


revision = 'c5e8a1d4b762'
down_revision = 'a7c2e4f9b1d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # När e-postadressen bekräftades. Befintliga konton får ingen tid: de bekräftar själva från profilen.
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))

    # Engångslänkar i mejl. Bara hashen av koden sparas.
    op.create_table(
        'email_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('purpose', sa.String(length=30), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index('ix_email_tokens_user_purpose', 'email_tokens', ['user_id', 'purpose'])


def downgrade() -> None:
    op.drop_index('ix_email_tokens_user_purpose', table_name='email_tokens')
    op.drop_table('email_tokens')
    op.drop_column('users', 'email_verified_at')
