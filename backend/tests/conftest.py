"""Gemensamma fixtures för alla backend-tester.

Testerna rör aldrig Neon: varje test får en egen tom SQLite-databas i minnet,
och appens get_db byts ut mot den. Behöver ett test en användare eller
kommuner ber det om fixturerna `user` eller `municipalities`.

`user` betyder också "inloggad som den användaren": get_current_user byts ut
så att testet slipper logga in. Själva inloggningen (token) testas utan den
genvägen i test_auth.py.
"""

import os

# Måste sättas innan appen importeras. En miljövariabel går före backend/.env,
# så den riktiga DATABASE_URL läses aldrig in under tester.
os.environ["DATABASE_URL"] = "sqlite://"

# Samma sak för bucketen: tomma värden gör att de riktiga nycklarna i .env
# aldrig läses in. Bildtesterna sätter egna, fejkade värden (se test_profile_image.py).
for _name in ("S3_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"):
    os.environ[_name] = ""

# Egen nyckel för inloggningstoken i tester, aldrig den riktiga från .env.
os.environ["JWT_SECRET"] = "test-secret-only-for-tests-0123456789"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.auth.security import get_current_user  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Municipality, User  # noqa: E402


@pytest.fixture
def db():
    # StaticPool: alla anslutningar delar samma minnesdatabas.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def user(db):
    """En användare som testet är inloggat som."""
    test_user = User(id=1, username="testuser", password_hash="unused")
    db.add(test_user)
    db.commit()
    app.dependency_overrides[get_current_user] = lambda: test_user
    yield test_user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def municipalities(db):
    db.add_all([
        Municipality(code="1480", name="Göteborg"),
        Municipality(code="1481", name="Mölndal"),
    ])
    db.commit()
