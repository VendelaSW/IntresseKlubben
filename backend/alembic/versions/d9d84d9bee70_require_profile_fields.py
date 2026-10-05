"""require profile fields, add gender value vill_inte_uppge

Revision ID: d9d84d9bee70
Revises: 2add8296567d
"""
from alembic import op


revision = 'd9d84d9bee70'
down_revision = '2add8296567d'
branch_labels = None
depends_on = None


REQUIRED_COLUMNS = ('name', 'birth_date', 'gender', 'municipality_code', 'profile_text')


def upgrade() -> None:
    # 1. Nytt tillåtet värde i könsenumen. Läggs till utanför transaktionen:
    #    ett nytt enumvärde kan inte användas i samma transaktion som det skapas.
    #    Det är ingen ny kolumn, bara ett femte val i den befintliga typen.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE genderenum ADD VALUE IF NOT EXISTS 'vill_inte_uppge'")

    # 2. De fem fälten blir obligatoriska. Faller om någon befintlig profil
    #    saknar ett av dem. Kolla först:
    #      SELECT count(*) FROM profiles
    #      WHERE name IS NULL OR birth_date IS NULL OR gender IS NULL
    #         OR municipality_code IS NULL OR profile_text IS NULL OR btrim(profile_text) = '';
    for column in REQUIRED_COLUMNS:
        op.alter_column('profiles', column, nullable=False)


def downgrade() -> None:
    for column in REQUIRED_COLUMNS:
        op.alter_column('profiles', column, nullable=True)
    # Enumvärdet 'vill_inte_uppge' tas inte bort: Postgres kan inte ta bort ett
    # enumvärde utan att bygga om typen, och det skadar inte att det finns kvar.
