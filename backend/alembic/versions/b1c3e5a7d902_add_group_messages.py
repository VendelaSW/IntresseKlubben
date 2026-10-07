"""add group messages

Revision ID: b1c3e5a7d902
Revises: c73402a1493c
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c3e5a7d902'
down_revision = 'c73402a1493c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'group_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_group_messages_group_id', 'group_messages', ['group_id'])


def downgrade() -> None:
    op.drop_index('ix_group_messages_group_id', table_name='group_messages')
    op.drop_table('group_messages')
