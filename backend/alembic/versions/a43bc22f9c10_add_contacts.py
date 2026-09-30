"""add contacts

Revision ID: a43bc22f9c10
Revises: c4d8e2a91f67
"""
from alembic import op
import sqlalchemy as sa


revision = 'a43bc22f9c10'
down_revision = 'c4d8e2a91f67'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'contacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('addressee_id', sa.Integer(), nullable=False),
        sa.Column('pair_key', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.CheckConstraint('requester_id != addressee_id', name='ck_contacts_distinct_users'),
        sa.CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'BLOCKED')", name='ck_contacts_status'),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id']),
        sa.ForeignKeyConstraint(['addressee_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('pair_key', name='uq_contacts_pair_key'),
    )


def downgrade() -> None:
    op.drop_table('contacts')