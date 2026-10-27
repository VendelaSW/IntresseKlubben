"""user interests: practises or just interested, one row per interest, no strength

Revision ID: e8c4a1f7b305
Revises: d1a7c3e5f902

SCRUM-271: av de 16 aktiviteterna blir två kvar. activity = 'utova' när personen själv håller på med intresset,
annars '' (intresserad). Samma intresse sparas därför bara en gång per person, och strength (1-3), som aldrig
användes, tas bort.
"""
from alembic import op
import sqlalchemy as sa


revision = 'e8c4a1f7b305'
down_revision = 'd1a7c3e5f902'
branch_labels = None
depends_on = None

# Aktiviteterna där man själv håller på med intresset. Resten (titta, lyssna, lasa, besoka, ha) är att vara intresserad.
PRACTISING = ('utova', 'spela', 'tavla', 'leda', 'lara-sig', 'skapa', 'bygga', 'samla', 'laga', 'prova', 'kora')


def upgrade() -> None:
    practising = ', '.join(f"'{slug}'" for slug in PRACTISING)
    # 1. En rad per person och intresse: har någon av raderna en aktivitet där man håller på själv blir den äldsta
    #    raden 'utova', och de andra tas bort. Den äldsta behålls, med sina egna ord (label) och sin källa.
    #    Först en tillfällig markering, eftersom det gamla unika villkoret (person, intresse, aktivitet) gäller
    #    tills dubbletterna är borta och en annan rad kan ha 'utova' redan.
    op.execute(
        f"UPDATE user_interests AS keep SET activity = '__utova__' "
        f"WHERE keep.id = (SELECT MIN(id) FROM user_interests o WHERE o.user_id = keep.user_id AND o.interest_id = keep.interest_id) "
        f"AND EXISTS (SELECT 1 FROM user_interests o WHERE o.user_id = keep.user_id AND o.interest_id = keep.interest_id "
        f"AND o.activity IN ({practising}))"
    )
    op.execute(
        'DELETE FROM user_interests a USING user_interests b '
        'WHERE a.user_id = b.user_id AND a.interest_id = b.interest_id AND a.id > b.id'
    )
    # 2. Markeringen blir 'utova', och allt annat blir intresserad.
    op.execute("UPDATE user_interests SET activity = CASE WHEN activity = '__utova__' THEN 'utova' ELSE '' END")
    # 3. Ett intresse per person.
    op.drop_constraint('uq_user_interests_user_interest_activity', 'user_interests', type_='unique')
    op.create_unique_constraint('uq_user_interests_user_interest', 'user_interests', ['user_id', 'interest_id'])
    # 4. strength användes aldrig.
    op.drop_column('user_interests', 'strength')


def downgrade() -> None:
    # Vilka verb raderna hade går inte att återskapa: 'utova' och '' blir kvar som de är.
    op.add_column('user_interests', sa.Column('strength', sa.Integer(), server_default='2', nullable=False))
    op.drop_constraint('uq_user_interests_user_interest', 'user_interests', type_='unique')
    op.create_unique_constraint(
        'uq_user_interests_user_interest_activity', 'user_interests', ['user_id', 'interest_id', 'activity']
    )
