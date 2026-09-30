"""seed interests, index user_interests.interest_id

Revision ID: c4d8e2a91f67
Revises: b7e2d4f81c30
Create Date: 2026-09-29 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d8e2a91f67'
down_revision = 'b7e2d4f81c30'
branch_labels = None
depends_on = None

# Startlista för MVP:n: samma intressen som demon (DEMO_INTERESTS i
# frontend/src/services/demoData.js) plus några till. Fler läggs till i
# senare migrationer.
INTERESTS = [
    'Brädspel',
    'Klättring',
    'Keramik',
    'Dykning',
    'Fotboll',
    'Löpning',
    'Fotografering',
    'Stickning',
    'Schack',
    'Matlagning',
    'Vandring',
    'Yoga',
    'Tv-spel',
    'Bokcirkel',
    'Musik',
    'Trädgård',
    'Resor',
    'Katter',
    'Gaming',
]

interests_table = sa.table(
    'interests',
    sa.column('id', sa.Integer()),
    sa.column('name', sa.String()),
)


def upgrade() -> None:
    op.bulk_insert(interests_table, [{'name': name} for name in INTERESTS])

    # Primärnyckeln (user_id, interest_id) täcker "vilka intressen har
    # användaren?". Indexet täcker omvända frågan "vilka användare har
    # intresse X?", som behövs när vi filtrerar användare på intressen.
    op.create_index(
        'ix_user_interests_interest_id', 'user_interests', ['interest_id']
    )


def downgrade() -> None:
    op.drop_index('ix_user_interests_interest_id', table_name='user_interests')

    # Ta bort användarnas kopplingar till startlistans intressen först,
    # annars stoppar foreign key-constrainten borttagningen.
    user_interests_table = sa.table('user_interests', sa.column('interest_id'))
    seeded_ids = sa.select(interests_table.c.id).where(
        interests_table.c.name.in_(INTERESTS)
    )
    op.execute(
        sa.delete(user_interests_table).where(
            user_interests_table.c.interest_id.in_(seeded_ids)
        )
    )
    op.execute(
        sa.delete(interests_table).where(interests_table.c.name.in_(INTERESTS))
    )
