"""events: scope (område), application visibility, skill level, max attendees, join requests and hosts

Revision ID: b6d2f4a8c913
Revises: a3c8e1f5b702
Create Date: 2026-10-27 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b6d2f4a8c913'
down_revision = 'a3c8e1f5b702'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additivt: befintliga events får inget område, ingen nivå och inget max, och fungerar som förut.
    # Område (SCRUM-295), nivå och max antal (SCRUM-293).
    op.add_column('events', sa.Column('scope', sa.String(length=10), nullable=True))
    op.add_column('events', sa.Column('scope_code', sa.String(length=10), nullable=True))
    op.add_column('events', sa.Column('skill_level', sa.String(length=15), nullable=True))
    op.add_column('events', sa.Column('max_attendees', sa.Integer(), nullable=True))

    # Ansökan och medarrangörer (SCRUM-296). Det nya enum-värdet används inte i migrationen.
    op.execute("ALTER TYPE eventvisibility ADD VALUE IF NOT EXISTS 'application'")
    op.create_table(
        'event_join_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('message', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'user_id', name='uq_event_join_requests_event_user'),
    )
    op.create_index('ix_event_join_requests_user_id', 'event_join_requests', ['user_id'])
    op.create_table(
        'event_hosts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'user_id', name='uq_event_hosts_event_user'),
    )
    op.create_index('ix_event_hosts_user_id', 'event_hosts', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_event_hosts_user_id', table_name='event_hosts')
    op.drop_table('event_hosts')
    op.drop_index('ix_event_join_requests_user_id', table_name='event_join_requests')
    op.drop_table('event_join_requests')
    # Värdet går inte att ta bort ur enum-typen, men events man ansökte till blir öppna igen.
    op.execute("UPDATE events SET visibility = 'open' WHERE visibility = 'application'")
    op.drop_column('events', 'max_attendees')
    op.drop_column('events', 'skill_level')
    op.drop_column('events', 'scope_code')
    op.drop_column('events', 'scope')
