"""add notifications

Revision ID: f4a6d2c8e917
Revises: b6e1c4a9d273
"""
from alembic import op
import sqlalchemy as sa


revision = 'f4a6d2c8e917'
down_revision = 'b6e1c4a9d273'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Notiser från Intresseklubben, t.ex. att ett event man skulle gå på har ställts in.
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=30), nullable=False),
        sa.Column('title', sa.String(length=150), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('quote', sa.Text(), nullable=True),
        sa.Column('quote_by', sa.String(length=100), nullable=True),
        sa.Column('link', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_notifications_user_created', table_name='notifications')
    op.drop_table('notifications')
