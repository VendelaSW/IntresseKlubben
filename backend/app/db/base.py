from sqlalchemy.orm import declarative_base

# Gemensam bas för alla SQLAlchemy-modeller. Importera denna Base i varje
# modellfil (backend/app/models/*.py) så Alembic hittar tabellerna vid
# autogenerate.
Base = declarative_base()
