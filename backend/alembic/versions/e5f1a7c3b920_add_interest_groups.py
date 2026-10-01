"""add interest groups and group members

Revision ID: e5f1a7c3b920
Revises: c4d8e2a91f67
Create Date: 2026-10-01 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f1a7c3b920'
down_revision = 'c4d8e2a91f67'
branch_labels = None
depends_on = None

# Samma värden som GroupVisibility och GroupRole i app/models/group.py.
visibility_enum = sa.Enum('public', 'private', name='groupvisibility')
role_enum = sa.Enum('owner', 'member', name='grouprole')


def upgrade() -> None:
    op.create_table('groups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=30), nullable=False),
    sa.Column('description', sa.String(length=200), nullable=False),
    sa.Column('meeting_info', sa.String(length=100), nullable=True),
    sa.Column('interest_id', sa.Integer(), nullable=False),
    sa.Column('municipality_code', sa.String(length=4), nullable=False),
    sa.Column('visibility', visibility_enum, nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['interest_id'], ['interests.id'], ),
    sa.ForeignKeyConstraint(['municipality_code'], ['municipalities.code'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_groups_interest_id', 'groups', ['interest_id'])
    op.create_index('ix_groups_municipality_code', 'groups', ['municipality_code'])
    # Samma namn får inte finnas två gånger i samma kommun, oavsett stora/små bokstäver.
    op.create_index(
        'uq_groups_name_municipality', 'groups',
        [sa.text('lower(name)'), 'municipality_code'], unique=True,
    )

    op.create_table('group_members',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('group_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('role', role_enum, nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'user_id', name='uq_group_members_group_user')
    )
    op.create_index('ix_group_members_user_id', 'group_members', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_group_members_user_id', table_name='group_members')
    op.drop_table('group_members')
    op.drop_index('uq_groups_name_municipality', table_name='groups')
    op.drop_index('ix_groups_municipality_code', table_name='groups')
    op.drop_index('ix_groups_interest_id', table_name='groups')
    op.drop_table('groups')
    role_enum.drop(op.get_bind(), checkfirst=True)
    visibility_enum.drop(op.get_bind(), checkfirst=True)
