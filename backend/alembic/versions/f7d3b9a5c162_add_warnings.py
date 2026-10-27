"""warnings: a moderator can warn a user from a report (SCRUM-268)

Revision ID: f7d3b9a5c162
Revises: a3c8e1f5b702
"""
from alembic import op
import sqlalchemy as sa


revision = 'f7d3b9a5c162'
down_revision = 'a3c8e1f5b702'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara en ny tabell, så inget ändras för befintliga användare eller anmälningar.
    op.create_table(
        'warnings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(length=20), nullable=False),
        sa.Column('message', sa.String(length=500), nullable=True),
        sa.Column('report_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_warnings_user_id', 'warnings', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_warnings_user_id', table_name='warnings')
    op.drop_table('warnings')
