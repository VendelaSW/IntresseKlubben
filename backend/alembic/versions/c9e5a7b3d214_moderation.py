"""moderation: moderators, handled reports and suspensions

Revision ID: c9e5a7b3d214
Revises: b4f2d8e6a193
"""
from alembic import op
import sqlalchemy as sa


revision = 'c9e5a7b3d214'
down_revision = 'b4f2d8e6a193'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additivt: en kolumn som är falsk för alla, två tomma kolumner och en ny tabell, så att inget som körs idag
    # påverkas. Moderatorer utses med `python -m app.make_moderator <användarnamn>`.
    op.add_column('users', sa.Column('is_moderator', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('reports', sa.Column('handled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('reports', sa.Column('handled_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.create_table(
        'suspensions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reason', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('lifted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lifted_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['lifted_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_suspensions_user_id', 'suspensions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_suspensions_user_id', table_name='suspensions')
    op.drop_table('suspensions')
    op.drop_column('reports', 'handled_by')
    op.drop_column('reports', 'handled_at')
    op.drop_column('users', 'is_moderator')
