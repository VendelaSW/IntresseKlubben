"""user interests with activity, own interests and onboarding

Revision ID: f3b8c1d6a274
Revises: d4a9f7b21c58
Create Date: 2026-10-12 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3b8c1d6a274'
down_revision = 'd4a9f7b21c58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # user_interests: från ren kopplingstabell (nyckel = användare + intresse)
    # till en rad per val, med aktivitet, styrka och egna ord. Befintliga val
    # finns kvar och får activity = '' (ingen aktivitet angiven).
    op.drop_constraint('user_interests_pkey', 'user_interests', type_='primary')
    op.execute('ALTER TABLE user_interests ADD COLUMN id SERIAL PRIMARY KEY')
    op.add_column('user_interests', sa.Column('activity', sa.String(), server_default='', nullable=False))
    op.add_column('user_interests', sa.Column('strength', sa.Integer(), server_default='2', nullable=False))
    op.add_column('user_interests', sa.Column('label', sa.String(), nullable=True))
    op.add_column('user_interests', sa.Column('source', sa.String(), server_default='picker', nullable=False))
    op.add_column('user_interests', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    # Samma intresse kan sparas med olika aktiviteter, men inte två gånger med
    # samma. Ersätter den gamla nyckeln och täcker uppslag på user_id.
    op.create_unique_constraint(
        'uq_user_interests_user_interest_activity', 'user_interests', ['user_id', 'interest_id', 'activity']
    )

    # interests: aktiviteter, vektor för betydelsesökning och vem som skapade
    # ett eget intresse.
    op.add_column('interests', sa.Column('activities', sa.JSON(), nullable=True))
    op.add_column('interests', sa.Column('embedding', sa.JSON(), nullable=True))
    op.add_column('interests', sa.Column('embedding_hash', sa.String(), nullable=True))
    op.add_column('interests', sa.Column('created_by_user_id', sa.Integer(), nullable=True))
    op.add_column('interests', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    # Raderas skaparens konto finns intresset kvar för andra, utan skapare.
    op.create_foreign_key(
        'fk_interests_created_by_user_id_users', 'interests', 'users',
        ['created_by_user_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_interests_created_by_user_id', 'interests', ['created_by_user_id'])

    # users: när intervjun blev klar. Befintliga användare har redan en profil
    # eller har valt att inte skapa en, och ska inte få intervjun.
    op.add_column('users', sa.Column('onboarding_completed_at', sa.DateTime(timezone=True), nullable=True))
    op.execute('UPDATE users SET onboarding_completed_at = now()')


def downgrade() -> None:
    op.drop_column('users', 'onboarding_completed_at')

    op.drop_index('ix_interests_created_by_user_id', table_name='interests')
    op.drop_constraint('fk_interests_created_by_user_id_users', 'interests', type_='foreignkey')
    op.drop_column('interests', 'created_at')
    op.drop_column('interests', 'created_by_user_id')
    op.drop_column('interests', 'embedding_hash')
    op.drop_column('interests', 'embedding')
    op.drop_column('interests', 'activities')

    # Den gamla nyckeln tillåter bara en rad per användare och intresse, så av
    # ett intresse som sparats med flera aktiviteter behålls den äldsta raden.
    op.execute(
        'DELETE FROM user_interests a USING user_interests b '
        'WHERE a.user_id = b.user_id AND a.interest_id = b.interest_id AND a.id > b.id'
    )
    op.drop_constraint('uq_user_interests_user_interest_activity', 'user_interests', type_='unique')
    op.drop_column('user_interests', 'created_at')
    op.drop_column('user_interests', 'source')
    op.drop_column('user_interests', 'label')
    op.drop_column('user_interests', 'strength')
    op.drop_column('user_interests', 'activity')
    op.drop_column('user_interests', 'id')
    op.create_primary_key('user_interests_pkey', 'user_interests', ['user_id', 'interest_id'])
