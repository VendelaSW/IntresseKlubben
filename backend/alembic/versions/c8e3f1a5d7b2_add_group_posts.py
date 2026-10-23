"""add group posts

Revision ID: c8e3f1a5d7b2
Revises: a7c2e4f9b1d3
"""
from alembic import op
import sqlalchemy as sa


revision = 'c8e3f1a5d7b2'
down_revision = 'a7c2e4f9b1d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Inlägg i klubbar (nyheter, regler), som ligger kvar till skillnad från chatten.
    op.create_table(
        'group_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_group_posts_group_id', 'group_posts', ['group_id'])


def downgrade() -> None:
    op.drop_index('ix_group_posts_group_id', table_name='group_posts')
    op.drop_table('group_posts')
