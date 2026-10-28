"""Antal användare per område på kartan (SCRUM-82): GET /users/area-counts ger bara antal, per kommun, landskap och del
av ett län, och aldrig ett exakt tal under 5."""

from app.crud.moderation import suspend_user
from app.models import Municipality, User
from tests.event_helpers import add_contact
from tests.helpers import make_profile

# Göteborg (1480) ligger i Västergötland (7) och Västra Götalands län (14), Kungsbacka (1384) i Halland (4) och Hallands
# län (13). Se data/regions.json.
GOTEBORG, KUNGSBACKA = "1480", "1384"


def _people(db, municipality_code, count, first_id):
    """`count` personer med profil i kommunen. Ger deras id:n."""
    ids = list(range(first_id, first_id + count))
    db.add_all(User(id=i, username=f"person{i}", password_hash="x") for i in ids)
    db.flush()
    db.add_all(make_profile(i, name=f"Person {i}", municipality_code=municipality_code) for i in ids)
    db.commit()
    return ids


def _setup(db, user):
    db.add_all([Municipality(code=GOTEBORG, name="Göteborg"), Municipality(code=KUNGSBACKA, name="Kungsbacka")])
    db.add(make_profile(user.id, name="Jag", municipality_code=GOTEBORG))
    db.commit()
    return _people(db, GOTEBORG, 6, 10), _people(db, KUNGSBACKA, 2, 20)


def test_counts_per_kommun_landskap_and_lan_without_yourself(client, db, user):
    _setup(db, user)

    counts = client.get("/users/area-counts").json()

    # Man räknar inte sig själv: sex andra i Göteborg.
    assert counts["kommun"] == {GOTEBORG: 6, KUNGSBACKA: None}
    assert counts["landskap"] == {"7": 6, "4": None}
    assert counts["lan"] == {"7:14": 6, "4:13": None}


def test_one_to_four_is_never_sent_as_an_exact_number(client, db, user):
    _setup(db, user)

    counts = client.get("/users/area-counts").json()

    # Kungsbacka har två: det skickas som null ("färre än 5"), aldrig som 2.
    every = [n for level in counts.values() for n in level.values()]
    assert all(n is None or n >= 5 for n in every)


def test_a_kommun_where_nobody_lives_is_left_out(client, db, user):
    _setup(db, user)
    assert "1481" not in client.get("/users/area-counts").json()["kommun"]


def test_blocked_and_suspended_people_are_not_counted(client, db, user):
    goteborg, _ = _setup(db, user)
    add_contact(db, user.id, goteborg[0], status="BLOCKED")  # jag har blockerat en
    add_contact(db, goteborg[1], user.id, status="BLOCKED")  # en har blockerat mig
    suspend_user(db, goteborg[2], 7, "spam", moderator_id=goteborg[3])

    counts = client.get("/users/area-counts").json()

    # Sex i Göteborg, minus tre: färre än 5.
    assert counts["kommun"][GOTEBORG] is None


def test_people_without_a_profile_are_not_counted(client, db, user):
    _setup(db, user)
    db.add_all(User(id=i, username=f"utan{i}", password_hash="x") for i in range(30, 40))
    db.commit()
    assert client.get("/users/area-counts").json()["kommun"][GOTEBORG] == 6


def test_the_counts_need_your_own_profile(client, db, user, profile_lock):
    response = client.get("/users/area-counts")
    assert response.status_code == 403
