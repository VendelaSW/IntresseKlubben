"""
Testlägets databas: en SQLite-fil som byggs om från början vid varje start och vid "Börja om" i testpanelen.
"""

import importlib.util
from datetime import timezone
from pathlib import Path

from sqlalchemy.dialects.sqlite import DATETIME

from app.crud.interest_library import load_library, sync_library
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.devtools import assert_safe, fake_ai
from app.devtools.seed import seed
from app.models import Interest, Municipality

MIGRATIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
MUNICIPALITIES_MIGRATION = MIGRATIONS / "b7e2d4f81c30_add_municipalities.py"


def use_utc_datetimes() -> None:
    """SQLite sparar tider utan tidszon, så de kommer tillbaka "naiva" och visas två timmar fel i webbläsaren.
    Här sparas de i UTC och läses tillbaka som UTC, som i Postgres. Bara i testläget, aldrig i den riktiga appen."""
    bind, result = DATETIME.bind_processor, DATETIME.result_processor

    def bind_processor(self, dialect):
        process = bind(self, dialect)

        def to_utc(value):
            if value is not None and value.tzinfo is not None:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)
            return process(value) if process else value

        return to_utc

    def result_processor(self, dialect, coltype):
        process = result(self, dialect, coltype)
        if not self.timezone:
            return process

        def from_utc(value):
            value = process(value) if process else value
            return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value

        return from_utc

    DATETIME.bind_processor, DATETIME.result_processor = bind_processor, result_processor


def _municipalities() -> list[tuple[str, str]]:
    """Alla kommuner, ur migrationen som lägger in dem i den riktiga databasen (så att listan bara finns på ett ställe)."""
    spec = importlib.util.spec_from_file_location("municipalities_migration", MUNICIPALITIES_MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.MUNICIPALITIES


def rebuild(app) -> dict[str, int]:
    """Tömmer databasen och fyller den igen: intressebiblioteket, kommunerna och testdatan. Ger {användarnamn: id}."""
    assert_safe()
    engine.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        sync_library(db, load_library())
        db.add_all(Municipality(code=code, name=name) for code, name in _municipalities())
        db.commit()
        fake_ai.install([name for (name,) in db.query(Interest.name).all()])
        return seed(app, db)
