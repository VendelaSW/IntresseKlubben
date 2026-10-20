"""interest embeddings in their own table (pgvector)

Revision ID: b6e1c4a9d273
Revises: d7f3b9e2a581
Create Date: 2026-10-19 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = 'b6e1c4a9d273'
down_revision = 'd7f3b9e2a581'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector är ett tillägg i Postgres (finns i Neon). Det ger kolumntypen vector och avståndsoperatorerna.
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    # Bara additiv: en ny tabell, så att ingenting som körs idag påverkas (databasen delas av lokal utveckling, dev och
    # produktion). Vektorn ligger i en egen tabell och inte på interests, eftersom 1536 tal per rad annars skulle följa
    # med varje gång intressen läses. De gamla tomma kolumnerna interests.embedding och embedding_hash lämnas orörda och
    # oanvända. Vektorerna fylls i med `python -m app.sync_embeddings`.
    op.create_table(
        'interest_embeddings',
        sa.Column('interest_id', sa.Integer(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=False),
        sa.Column('embedding_hash', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['interest_id'], ['interests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('interest_id'),
    )


def downgrade() -> None:
    op.drop_table('interest_embeddings')
    # Tillägget lämnas kvar: något annat kan ha börjat använda det.
