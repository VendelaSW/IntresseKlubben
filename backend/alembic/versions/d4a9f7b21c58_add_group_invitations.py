"""add group invitations

Revision ID: d4a9f7b21c58
Revises: b1c3e5a7d902
Create Date: 2026-10-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4a9f7b21c58'
down_revision = 'b1c3e5a7d902'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Befintliga klubbar får false, så bara ägaren kan bjuda in.
    op.add_column('groups', sa.Column('members_can_invite', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        'group_invitations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('invited_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'user_id', name='uq_group_invitations_group_user'),
    )
    op.create_index(op.f('ix_group_invitations_user_id'), 'group_invitations', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_group_invitations_user_id'), table_name='group_invitations')
    op.drop_table('group_invitations')
    op.drop_column('groups', 'members_can_invite')
