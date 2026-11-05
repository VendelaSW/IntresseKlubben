"""profile embeddings in their own table (pgvector)

Revision ID: e5b7c9d1f346
Revises: d1a7c3e5f902
Create Date: 2026-10-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = 'e5b7c9d1f346'
down_revision = 'd1a7c3e5f902'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bara additiv: en ny tabell, så att ingenting som körs idag påverkas (databasen delas av lokal utveckling, dev och
    # produktion). pgvector-tillägget finns redan (interest_embeddings). En rad per profil med vektorn för Om mig-texten.
    # Raden tas bort med profilen (och indexet med tabellen). Vektorerna fylls i när profiler sparas och med `python -m app.sync_embeddings`.
    op.create_table(
        'profile_embeddings',
        sa.Column('profile_id', sa.Integer(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=False),
        sa.Column('embedding_hash', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['profile_id'], ['profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('profile_id'),
    )
    # Vektorindex (HNSW, cosinus) för att söka efter de närmaste profiltexterna när matchningen kommer. Cosinus är samma
    # mått som sökningen bland intressena använder (<=>). Indexet är ett tillägg: stöder databasens pgvector inte HNSW
    # (före version 0.5.0) hoppas det över med en notis, och tabellen skapas ändå.
    op.execute("""
        DO $$
        BEGIN
            CREATE INDEX IF NOT EXISTS ix_profile_embeddings_embedding ON profile_embeddings USING hnsw (embedding vector_cosine_ops);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Vektorindexet hoppades över: %', SQLERRM;
        END $$;
    """)


def downgrade() -> None:
    op.drop_table('profile_embeddings')
