"""Gemensamma fixtures för alla backend-tester.

Testerna rör aldrig Neon: varje test får en egen tom SQLite-databas i minnet,
och appens get_db byts ut mot den. Behöver ett test en användare eller
kommuner ber det om fixturerna `user` eller `municipalities`.

`user` betyder också "inloggad som den användaren": get_current_user byts ut
så att testet slipper logga in. Själva inloggningen (token) testas utan den
genvägen i test_auth.py.

Låset "resten av appen kräver en klar profil" (require_profile) är avstängt som
standard, så att varje test slipper skapa en profil först. Testerna som gäller
själva låset slår på det igen med fixturen `profile_lock` (se test_require_profile.py).
"""

import os

# Måste sättas innan appen importeras. En miljövariabel går före backend/.env,
# så den riktiga DATABASE_URL läses aldrig in under tester.
os.environ["DATABASE_URL"] = "sqlite://"

# Samma sak för bucketen: tomma värden gör att de riktiga nycklarna i .env
# aldrig läses in. Bildtesterna sätter egna, fejkade värden (se test_profile_image.py).
for _name in ("S3_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"):
    os.environ[_name] = ""

# Tomma värden gör att den riktiga OpenAI-nyckeln i .env aldrig läses in, så att inget test kan
# råka anropa OpenAI på riktigt.
os.environ["OPENAI_API_KEY"] = ""
os.environ["OPENAI_MODEL"] = ""

# Samma sak för mejlen: ingen riktig Resend-nyckel, och kravet på bekräftad e-post av som standard.
os.environ["RESEND_API_KEY"] = ""
os.environ["REQUIRE_EMAIL_VERIFICATION"] = ""
os.environ["VERCEL_ENV"] = ""

# Egen nyckel för inloggningstoken i tester, aldrig den riktiga från .env.
os.environ["JWT_SECRET"] = "test-secret-only-for-tests-0123456789"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.auth.security import get_current_user, require_profile  # noqa: E402
from app.services.ai_clients import set_clients  # noqa: E402
from app.services.email import set_email_sender  # noqa: E402
from app.services.geocoding import set_geocoder  # noqa: E402
from tests.fakes import FakeEmailSender, FakeGeocoder  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Municipality, User  # noqa: E402


@pytest.fixture(autouse=True)
def fake_geocoder():
    """Inget test ska anropa Nominatim: adressökningen är en fejkad version utan träffar, om inte
    testet sätter in en egen. Spärren för antal sökningar nollställs också."""
    from app.api.routes import geocode as geocode_route

    set_geocoder(FakeGeocoder())
    geocode_route._recent.clear()
    yield
    set_geocoder()
    geocode_route._recent.clear()


@pytest.fixture(autouse=True)
def sent_emails():
    """Inget test ska skicka riktiga mejl: utskicket är en fejkad version som sparar mejlen. Testerna som gäller
    mejlen ber om fixturen och läser `sent_emails.sent`."""
    sender = FakeEmailSender()
    set_email_sender(sender)
    yield sender
    set_email_sender()


@pytest.fixture(autouse=True)
def reset_ai_clients():
    """Inget test ska råka behålla en fejkad AI-klient från ett annat test, eller anropa OpenAI. Spärren för antal
    Om mig-kontroller och minnet av redan kontrollerade texter nollställs också, så att ett test som sparar många
    profiltexter inte stoppar nästa."""
    from app.api.routes import profile as profile_route

    set_clients()
    profile_route._recent_text_checks.clear()
    profile_route._checked_texts.clear()
    yield
    set_clients()
    profile_route._recent_text_checks.clear()
    profile_route._checked_texts.clear()


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


@pytest.fixture(autouse=True)
def _profile_lock_off():
    """Låset av som standard (se modulens beskrivning)."""
    app.dependency_overrides[require_profile] = lambda: None
    yield
    app.dependency_overrides.pop(require_profile, None)


@pytest.fixture
def profile_lock():
    """Slår på låset igen, för testerna som gäller själva låset."""
    app.dependency_overrides.pop(require_profile, None)


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
