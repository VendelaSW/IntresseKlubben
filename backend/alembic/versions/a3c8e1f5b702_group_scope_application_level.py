"""groups: scope (räckvidd), application visibility, skill level, max members, join requests and admin role

Revision ID: a3c8e1f5b702
Revises: e5b7c9d1f346
Create Date: 2026-10-27 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3c8e1f5b702'
down_revision = 'e5b7c9d1f346'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Databasen delas av lokal utveckling, dev och produktion, så befintliga klubbar ska se ut precis som förut:
    # de får räckvidden kommun med sin egen kommun (SCRUM-282).
    op.add_column('groups', sa.Column('scope', sa.String(length=10), nullable=False, server_default='kommun'))
    op.add_column('groups', sa.Column('scope_code', sa.String(length=10), nullable=True))
    op.execute("UPDATE groups SET scope_code = municipality_code")
    op.alter_column('groups', 'scope_code', nullable=False)
    # Kommunen behövs bara för räckvidden kommun.
    op.alter_column('groups', 'municipality_code', existing_type=sa.String(length=4), nullable=True)
    # Unikt namn per område i stället för per kommun (för kommunklubbar är det samma sak).
    op.drop_index('uq_groups_name_municipality', table_name='groups')
    op.create_index('uq_groups_name_scope', 'groups', [sa.text('lower(name)'), 'scope', 'scope_code'], unique=True)

    # Nivå och max antal medlemmar, valfria (SCRUM-216).
    op.add_column('groups', sa.Column('skill_level', sa.String(length=15), nullable=True))
    op.add_column('groups', sa.Column('max_members', sa.Integer(), nullable=True))

    # Klubbar man ansöker till (SCRUM-159). Ett nytt värde i enum-typen; det används inte i den här migrationen.
    op.execute("ALTER TYPE groupvisibility ADD VALUE IF NOT EXISTS 'application'")
    # Administratörer i klubbar (SCRUM-160). Används inte heller i migrationen.
    op.execute("ALTER TYPE grouprole ADD VALUE IF NOT EXISTS 'admin'")
    op.create_table(
        'group_join_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('message', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'user_id', name='uq_group_join_requests_group_user'),
    )
    op.create_index('ix_group_join_requests_user_id', 'group_join_requests', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_group_join_requests_user_id', table_name='group_join_requests')
    op.drop_table('group_join_requests')
    # Värdena går inte att ta bort ur enum-typerna, men klubbar man ansökte till blir öppna igen och
    # administratörer blir vanliga medlemmar.
    op.execute("UPDATE groups SET visibility = 'public' WHERE visibility = 'application'")
    op.execute("UPDATE group_members SET role = 'member' WHERE role = 'admin'")
    op.drop_column('groups', 'max_members')
    op.drop_column('groups', 'skill_level')
    op.drop_index('uq_groups_name_scope', table_name='groups')
    # Klubbar utan kommun (andra räckvidder än kommun) går inte att behålla när kommunen blir obligatorisk igen.
    op.execute("DELETE FROM groups WHERE municipality_code IS NULL")
    op.alter_column('groups', 'municipality_code', existing_type=sa.String(length=4), nullable=False)
    op.create_index('uq_groups_name_municipality', 'groups', [sa.text('lower(name)'), 'municipality_code'], unique=True)
    op.drop_column('groups', 'scope_code')
    op.drop_column('groups', 'scope')
