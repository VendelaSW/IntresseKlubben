"""add conversation reads

Revision ID: e9a4c2b6f1d8
Revises: c8e3f1a5d7b2
"""
from alembic import op
import sqlalchemy as sa


revision = 'e9a4c2b6f1d8'
down_revision = 'c8e3f1a5d7b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hur långt varje användare har läst i varje konversation, på kontot i
    # stället för i webbläsaren.
    op.create_table(
        'conversation_reads',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('other_user_id', sa.Integer(), nullable=False),
        sa.Column('last_read_message_id', sa.Integer(), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['other_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('user_id', 'other_user_id'),
    )
    # Brev som redan finns räknas som lästa, så att ingen får en flod av
    # "nya" brev efter uppdateringen: för varje mottagare och avsändare, det
    # senaste brevet mottagaren har fått från avsändaren.
    op.execute(
        """
        INSERT INTO conversation_reads (user_id, other_user_id, last_read_message_id)
        SELECT recipient_id, sender_id, MAX(id)
        FROM messages
        GROUP BY recipient_id, sender_id
        """
    )


def downgrade() -> None:
    op.drop_table('conversation_reads')
