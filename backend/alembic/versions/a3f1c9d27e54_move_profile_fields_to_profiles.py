"""move profile fields from users to profiles

Revision ID: a3f1c9d27e54
Revises: 46ce3ef39f72
Create Date: 2026-09-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f1c9d27e54'
down_revision = '46ce3ef39f72'
branch_labels = None
depends_on = None

# Samma värden som GenderEnum i app/models/profile.py. SQLAlchemy lagrar
# enum-medlemmens namn (inte värdet), därav "ickebinar" utan ä.
gender_enum = sa.Enum('kvinna', 'man', 'ickebinar', 'annat', name='genderenum')


def upgrade() -> None:
    op.create_table('profiles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=True),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('gender', gender_enum, nullable=True),
    sa.Column('profile_text', sa.Text(), nullable=True),
    sa.Column('profile_image_url', sa.String(), nullable=True),
    sa.Column('city', sa.String(), nullable=True),
    sa.Column('district', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_profiles_id'), 'profiles', ['id'], unique=False)

    # Inga riktiga användare finns ännu, så kolumnerna kan tas bort utan
    # att data flyttas över till profiles.
    op.drop_column('users', 'display_name')
    op.drop_column('users', 'profile_text')
    op.drop_column('users', 'profile_image_url')
    op.drop_column('users', 'city')
    op.drop_column('users', 'district')


def downgrade() -> None:
    op.add_column('users', sa.Column('district', sa.String(), nullable=True))
    op.add_column('users', sa.Column('city', sa.String(), nullable=True))
    op.add_column('users', sa.Column('profile_image_url', sa.String(), nullable=True))
    op.add_column('users', sa.Column('profile_text', sa.Text(), nullable=True))
    # OBS: nullable=False fungerar bara om users-tabellen är tom.
    op.add_column('users', sa.Column('display_name', sa.String(), nullable=False))

    op.drop_index(op.f('ix_profiles_id'), table_name='profiles')
    op.drop_table('profiles')
    op.execute('DROP TYPE genderenum')
