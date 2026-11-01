"""remove events more than a year ahead (SCRUM-313)

Revision ID: a9e5c3d7f214
Revises: f7d3b9a5c162
"""
from datetime import datetime, timedelta, timezone

from alembic import op
import sqlalchemy as sa


revision = 'a9e5c3d7f214'
down_revision = 'f7d3b9a5c162'
branch_labels = None
depends_on = None

# Samma gräns som EVENT_MAX_DAYS_AHEAD i app/schemas/event.py. Skrivs ut här, så att migrationen gör samma sak även om
# gränsen ändras senare.
MAX_DAYS_AHEAD = 365


def upgrade() -> None:
    # Ett event kan inte längre ligga mer än ett år fram (SCRUM-313). De som redan börjar eller slutar senare (t.ex. år
    # 2188, från testning) tas bort, med sina inbjudningar, svar, ansökningar och medarrangörer (ON DELETE CASCADE).
    cutoff = datetime.now(timezone.utc) + timedelta(days=MAX_DAYS_AHEAD)
    op.get_bind().execute(
        sa.text("DELETE FROM events WHERE starts_at > :cutoff OR ends_at > :cutoff"),
        {"cutoff": cutoff},
    )


def downgrade() -> None:
    # De borttagna eventen går inte att få tillbaka.
    pass
