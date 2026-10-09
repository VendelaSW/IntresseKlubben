"""add events, event invitations and event responses

Revision ID: e0a6b2b09a47
Revises: d9d84d9bee70
Create Date: 2026-10-06 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e0a6b2b09a47'
down_revision = 'd9d84d9bee70'
branch_labels = None
depends_on = None

# Samma värden som EventVisibility och EventAnswer i app/models/event.py.
visibility_enum = sa.Enum('open', 'invite_only', name='eventvisibility')
answer_enum = sa.Enum('yes', 'maybe', 'no', name='eventanswer')


def upgrade() -> None:
    op.create_table('events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=50), nullable=False),
    sa.Column('description', sa.String(length=800), nullable=False),
    sa.Column('interest_id', sa.Integer(), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('place_name', sa.String(length=100), nullable=False),
    sa.Column('address', sa.String(length=100), nullable=False),
    sa.Column('visibility', visibility_enum, nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('group_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('ends_at IS NULL OR ends_at > starts_at', name='ck_events_ends_after_start'),
    sa.ForeignKeyConstraint(['interest_id'], ['interests.id'], ),
    # Tas skaparen bort försvinner eventet med. Tas klubben bort finns eventet kvar.
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_interest_id', 'events', ['interest_id'])
    op.create_index('ix_events_starts_at', 'events', ['starts_at'])
    op.create_index('ix_events_created_by', 'events', ['created_by'])
    op.create_index('ix_events_group_id', 'events', ['group_id'])

    op.create_table('event_invitations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'user_id', name='uq_event_invitations_event_user')
    )
    op.create_index('ix_event_invitations_user_id', 'event_invitations', ['user_id'])

    op.create_table('event_responses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('answer', answer_enum, nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'user_id', name='uq_event_responses_event_user')
    )
    op.create_index('ix_event_responses_user_id', 'event_responses', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_event_responses_user_id', table_name='event_responses')
    op.drop_table('event_responses')
    op.drop_index('ix_event_invitations_user_id', table_name='event_invitations')
    op.drop_table('event_invitations')
    op.drop_index('ix_events_group_id', table_name='events')
    op.drop_index('ix_events_created_by', table_name='events')
    op.drop_index('ix_events_starts_at', table_name='events')
    op.drop_index('ix_events_interest_id', table_name='events')
    op.drop_table('events')
    answer_enum.drop(op.get_bind(), checkfirst=True)
    visibility_enum.drop(op.get_bind(), checkfirst=True)
