"""add reports

Revision ID: b4f2d8e6a193
Revises: a3d9f6c2e815
"""
from alembic import op
import sqlalchemy as sa


revision = 'b4f2d8e6a193'
down_revision = 'a3d9f6c2e815'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additiv: en ny tabell. Anmälningar av användare, brev, klubbchatt och lappar, för granskning.
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=True),
        sa.Column('reported_user_id', sa.Integer(), nullable=True),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('reason', sa.String(length=20), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id']),
        sa.ForeignKeyConstraint(['reported_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reports_reporter_id', 'reports', ['reporter_id'])
    op.create_index('ix_reports_reported_user_id', 'reports', ['reported_user_id'])


def downgrade() -> None:
    op.drop_index('ix_reports_reported_user_id', table_name='reports')
    op.drop_index('ix_reports_reporter_id', table_name='reports')
    op.drop_table('reports')
