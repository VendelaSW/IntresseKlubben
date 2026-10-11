"""interest library: tree, slug, aliases, description, status, source

Revision ID: d2f8a6c41b07
Revises: c73402a1493c
Create Date: 2026-10-08 12:00:00.000000

Intressena blir ett bibliotek (app/data/interests.json, inläst med
python -m app.sync_interests). Den här migrationen ändrar bara strukturen
och förbereder dagens intressen:

- nya kolumner: slug, parent_id, description, aliases, status, source
- name är inte längre unikt (samma namn kan finnas under flera huvudområden);
  slug är unikt
- dagens intressen får sin slug (samma som i interests.json), så att synken
  känner igen dem och deras id:n, och därmed användarnas, klubbarnas och
  eventens kopplingar, finns kvar
- "Gaming" slås ihop med "Tv-spel": kopplingarna flyttas och Gaming markeras
  som inaktivt (raderas inte)

Kör sedan synken för att lägga in resten av biblioteket.
"""
import re
import unicodedata

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2f8a6c41b07'
down_revision = 'c73402a1493c'
branch_labels = None
depends_on = None


def _slugify(name: str) -> str:
    # Samma regel som slugify i app/crud/interest_library.py. Kopierad hit, så
    # att migrationen inte ändrar sig om appens kod ändras senare.
    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def upgrade() -> None:
    op.add_column('interests', sa.Column('slug', sa.String(), nullable=True))
    op.add_column('interests', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.add_column('interests', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('interests', sa.Column('aliases', sa.Text(), nullable=True))
    op.add_column('interests', sa.Column('status', sa.String(), server_default='active', nullable=False))
    op.add_column('interests', sa.Column('source', sa.String(), server_default='library', nullable=False))
    op.create_foreign_key('interests_parent_id_fkey', 'interests', 'interests', ['parent_id'], ['id'])
    op.create_index('ix_interests_parent_id', 'interests', ['parent_id'])
    op.drop_constraint('interests_name_key', 'interests', type_='unique')
    op.create_unique_constraint('interests_slug_key', 'interests', ['slug'])

    conn = op.get_bind()
    for interest_id, name in conn.execute(sa.text('SELECT id, name FROM interests')).fetchall():
        conn.execute(
            sa.text('UPDATE interests SET slug = :slug WHERE id = :id'),
            {'slug': _slugify(name), 'id': interest_id},
        )

    gaming = conn.execute(sa.text("SELECT id FROM interests WHERE slug = 'gaming'")).scalar()
    tv_games = conn.execute(sa.text("SELECT id FROM interests WHERE slug = 'tv-spel'")).scalar()
    if gaming is not None and tv_games is not None:
        params = {'gaming': gaming, 'tv_games': tv_games}
        # Användare med Gaming får Tv-spel (om de inte redan har det).
        conn.execute(sa.text(
            'INSERT INTO user_interests (user_id, interest_id) '
            'SELECT user_id, :tv_games FROM user_interests WHERE interest_id = :gaming '
            'AND user_id NOT IN (SELECT user_id FROM user_interests WHERE interest_id = :tv_games)'
        ), params)
        conn.execute(sa.text('DELETE FROM user_interests WHERE interest_id = :gaming'), params)
        conn.execute(sa.text('UPDATE groups SET interest_id = :tv_games WHERE interest_id = :gaming'), params)
        conn.execute(sa.text('UPDATE events SET interest_id = :tv_games WHERE interest_id = :gaming'), params)
        conn.execute(sa.text("UPDATE interests SET status = 'inactive' WHERE id = :gaming"), params)


def downgrade() -> None:
    # Gaming-sammanslagningen går inte att backa (vem som hade vad är borta),
    # men Gaming blir aktivt igen så att det går att välja.
    op.execute("UPDATE interests SET status = 'active' WHERE slug = 'gaming'")
    op.drop_constraint('interests_slug_key', 'interests', type_='unique')
    op.create_unique_constraint('interests_name_key', 'interests', ['name'])
    op.drop_index('ix_interests_parent_id', table_name='interests')
    op.drop_constraint('interests_parent_id_fkey', 'interests', type_='foreignkey')
    op.drop_column('interests', 'source')
    op.drop_column('interests', 'status')
    op.drop_column('interests', 'aliases')
    op.drop_column('interests', 'description')
    op.drop_column('interests', 'parent_id')
    op.drop_column('interests', 'slug')
