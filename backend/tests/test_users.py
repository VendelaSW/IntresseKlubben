import pytest
from sqlalchemy.exc import IntegrityError

from app.auth.security import hash_password, verify_password
from app.crud.user import get_user_by_username
from app.models import User


def _register(client, username="vendela", email="vendela@example.com", password="hemligt123"):
    return client.post(
        "/users/register", json={"username": username, "email": email, "password": password}
    )


def test_register_creates_user_without_leaking_password_or_email(client, db):
    response = _register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "vendela"
    # E-post är privat och ska inte skickas ut, inte ens till den som registrerar sig.
    assert set(body) == {"id", "username", "created_at"}

    stored = get_user_by_username(db, "vendela")
    assert stored.email == "vendela@example.com"
    assert stored.password_hash != "hemligt123"
    assert verify_password("hemligt123", stored.password_hash)


def test_register_rejects_taken_username(client):
    _register(client)
    response = _register(client, email="annan@example.com", password="annat12345")
    assert response.status_code == 409
    assert response.json()["detail"] == "Användarnamnet är upptaget."


def test_register_rejects_taken_username_different_case(client):
    _register(client, username="Vendela")
    response = _register(client, username="vendela", email="annan@example.com", password="annat12345")
    assert response.status_code == 409


def test_register_rejects_taken_email(client):
    _register(client)
    response = _register(client, username="annan")
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."


def test_register_rejects_taken_email_different_case(client):
    _register(client, email="Vendela@Example.com")
    response = _register(client, username="annan", email="vendela@example.COM")
    assert response.status_code == 409


def test_register_saves_email_in_lowercase(client, db):
    _register(client, email="  Vendela@Example.COM ")
    assert get_user_by_username(db, "vendela").email == "vendela@example.com"


def test_database_rejects_usernames_differing_only_in_case(db):
    # Skyddsnätet under koden: även om något skriver direkt till tabellen
    # (eller två registreringar sker samtidigt) ska databasen säga nej.
    db.add(User(username="Vendela", password_hash="x"))
    db.commit()
    db.add(User(username="vendela", password_hash="x"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_login_is_not_case_sensitive(client):
    _register(client, username="Vendela")
    response = client.post("/users/login", json={"username_or_email": "VENDELA", "password": "hemligt123"})
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "Vendela"  # ursprungligt skiftläge bevaras


def _login(client, username_or_email, password="hemligt123"):
    return client.post("/users/login", json={"username_or_email": username_or_email, "password": password})


@pytest.mark.parametrize("typed", ["vendela@example.com", "  Vendela@Example.COM  ", "vendela", " VENDELA "])
def test_login_with_username_or_email_in_the_same_field(client, typed):
    # Samma fält tar emot användarnamn eller e-post, oavsett skiftläge och
    # mellanslag runt texten.
    _register(client)
    response = _login(client, typed)
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "vendela"


def test_login_with_email_needs_the_right_password(client):
    _register(client)
    response = _login(client, "vendela@example.com", password="fel-lösenord")
    assert response.status_code == 401
    assert response.json()["detail"] == "Fel användarnamn, e-post eller lösenord."


def test_unknown_email_gives_the_same_error_as_a_wrong_password(client):
    _register(client)
    unknown = _login(client, "finnsinte@example.com")
    wrong_password = _login(client, "vendela@example.com", password="fel-lösenord")
    assert unknown.status_code == wrong_password.status_code == 401
    assert unknown.json() == wrong_password.json()


def test_login_finds_older_account_with_at_sign_in_username(client, db):
    # Konton från innan @ förbjöds i användarnamn kan fortfarande logga in med
    # användarnamnet, när ingen har det som e-post.
    db.add(User(username="gamla@kontot", email="gamla@example.com", password_hash=hash_password("hemligt123")))
    db.commit()
    response = _login(client, "gamla@kontot")
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "gamla@kontot"


def test_email_wins_over_an_older_username_with_the_same_text(client, db):
    # Har någon ett gammalt användarnamn som är någon annans e-post, är det
    # e-posten som gäller. Den andra loggar in med sin egen e-post.
    db.add(User(username="bob@example.com", email="bob-gammal@example.com", password_hash=hash_password("annat-losen")))
    db.commit()
    _register(client, username="bob", email="bob@example.com")
    response = _login(client, "bob@example.com")
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "bob"


def test_register_rejects_at_sign_in_username(client):
    response = _register(client, username="vendela@hem")
    assert response.status_code == 422
    assert "Användarnamnet får inte innehålla @" in response.json()["detail"][0]["msg"]


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "email": "a@example.com", "password": "hemligt123"},       # för kort användarnamn
        {"username": "x" * 51, "email": "a@example.com", "password": "hemligt123"},   # för långt användarnamn
        {"username": "vendela", "email": "a@example.com", "password": "kort"},        # för kort lösenord
        {"username": "vendela", "email": "a@example.com"},                           # lösenord saknas
        {"username": "vendela", "password": "hemligt123"},                           # e-post saknas
        {"username": "vendela", "email": "", "password": "hemligt123"},              # tom e-post
        {"username": "vendela", "email": "inte-en-epost", "password": "hemligt123"},  # saknar @
        {"username": "vendela", "email": "a@", "password": "hemligt123"},            # saknar domän
        {"username": "vendela", "email": "a b@example.com", "password": "hemligt123"},  # mellanslag
    ],
)
def test_register_validates_input(client, payload):
    assert client.post("/users/register", json=payload).status_code == 422


def test_register_invalid_email_gives_swedish_message(client):
    response = _register(client, email="inte-en-epost")
    assert response.status_code == 422
    assert "Ogiltig e-postadress" in response.json()["detail"][0]["msg"]


def test_verify_password():
    password_hash = hash_password("hemligt123")
    assert verify_password("hemligt123", password_hash)
    assert not verify_password("fel-lösenord", password_hash)
    assert not verify_password("hemligt123", "")  # ogiltig hash ger False, inte krasch


# --- Ändra användarnamn och e-post (PATCH /users/me) ---
# Lösenordet krävs. `user`-fixturen saknar e-post, som konton som skapades
# innan e-post krävdes; den får ett riktigt lösenord här. Att andra aldrig ser
# e-posten täcks redan av testerna som kontrollerar exakt vilka fält som
# skickas ut om andra (test_user_profile.py, test_people.py).

PASSWORD = "hemligt123"


@pytest.fixture
def me(db, user):
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    return user


def _update(client, password=PASSWORD, **changes):
    return client.patch("/users/me", json={"password": password, **changes})


def test_me_shows_own_email_as_none_when_missing(client, user):
    response = client.get("/users/me")
    assert response.status_code == 200
    assert response.json()["email"] is None


def test_change_username_and_log_in_with_the_new_one(client, db, me):
    me.email = "test@example.com"
    db.commit()
    response = _update(client, username="Nytt_namn")
    assert response.status_code == 200
    assert response.json()["username"] == "Nytt_namn"
    db.refresh(me)
    assert me.username == "Nytt_namn"
    # Det nya namnet fungerar vid inloggning, det gamla inte längre.
    assert _login(client, "nytt_namn").status_code == 200
    assert _login(client, "testuser").status_code == 401


def test_change_email_saves_it_in_lowercase(client, db, me):
    me.email = "forsta@example.com"
    db.commit()
    response = _update(client, email="  Andra@Example.COM ")
    assert response.status_code == 200
    assert response.json()["email"] == "andra@example.com"
    assert client.get("/users/me").json()["email"] == "andra@example.com"
    assert _login(client, "andra@example.com").status_code == 200


def test_add_email_to_an_older_account_without_one(client, db, me):
    response = _update(client, email="ny@example.com")
    assert response.status_code == 200
    assert response.json()["email"] == "ny@example.com"


def test_change_both_at_once(client, db, me):
    response = _update(client, username="bada", email="bada@example.com")
    assert response.status_code == 200
    assert (response.json()["username"], response.json()["email"]) == ("bada", "bada@example.com")


def test_only_given_fields_change(client, db, me):
    me.email = "kvar@example.com"
    db.commit()
    _update(client, username="bara_namnet")
    db.refresh(me)
    assert me.email == "kvar@example.com"


def test_change_case_of_own_username(client, db, me):
    response = _update(client, username="TestUser")
    assert response.status_code == 200
    assert response.json()["username"] == "TestUser"


def test_wrong_password_changes_nothing(client, db, me):
    response = _update(client, password="fel-lösenord", username="annat")
    # 403, inte 401: frontend loggar ut vid 401.
    assert response.status_code == 403
    assert response.json()["detail"] == "Fel lösenord."
    db.refresh(me)
    assert me.username == "testuser"


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"username": "ANNAN"}, "Användarnamnet är upptaget."),
        ({"email": "Upptagen@Example.com"}, "E-postadressen används redan."),
    ],
)
def test_username_or_email_taken_by_someone_else(client, db, me, changes, detail):
    db.add(User(username="annan", email="upptagen@example.com", password_hash="x"))
    db.commit()
    response = _update(client, **changes)
    assert response.status_code == 409
    assert response.json()["detail"] == detail
    db.refresh(me)
    assert (me.username, me.email) == ("testuser", None)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"username": "x@y"}, "Användarnamnet får inte innehålla @"),
        ({"username": "ab"}, "Måste vara minst 3 tecken"),
        ({"email": "inte-en-epost"}, "Ogiltig e-postadress"),
        ({}, "Ange ett nytt användarnamn eller en ny e-postadress"),
    ],
)
def test_update_validates_like_registration(client, db, me, changes, message):
    response = _update(client, **changes)
    assert response.status_code == 422
    assert message in response.json()["detail"][0]["msg"]
    db.refresh(me)
    assert (me.username, me.email) == ("testuser", None)


# --- Är användarnamnet/e-posten ledig? (GET /users/me/availability) ---
# Formuläret frågar medan man skriver, så att "upptaget" syns direkt.


def test_availability_says_taken_with_the_same_messages_as_saving(client, db, user):
    db.add(User(username="annan", email="upptagen@example.com", password_hash="x"))
    db.commit()
    response = client.get("/users/me/availability", params={"username": "ANNAN", "email": " Upptagen@Example.com "})
    assert response.status_code == 200
    assert response.json() == {"username": "Användarnamnet är upptaget.", "email": "E-postadressen används redan."}


def test_availability_free_and_own_values_are_not_taken(client, db, user):
    user.email = "min@example.com"
    db.commit()
    response = client.get("/users/me/availability", params={"username": "TestUser", "email": "min@example.com"})
    assert response.json() == {"username": None, "email": None}
    response = client.get("/users/me/availability", params={"username": "ledigt_namn"})
    assert response.json() == {"username": None, "email": None}


def test_availability_requires_login(client):
    assert client.get("/users/me/availability", params={"username": "x"}).status_code == 401


# --- Två som sparar samma användarnamn/e-post exakt samtidigt ---
# Kontrollen före sparandet hinner då inte se den andra, och databasen stoppar
# den som kommer sist. Det ska ge samma 409 som annars, inte ett serverfel.


def _miss_first_check(monkeypatch, name):
    """Låter första anropet till get_user_by_<name> missa en befintlig
    användare, som när en annan registrering sparas precis efter kontrollen.
    Senare anrop fungerar som vanligt."""
    import app.crud.user as crud_user

    real = getattr(crud_user, name)
    calls = []

    def first_call_misses(db, value):
        calls.append(value)
        return None if len(calls) == 1 else real(db, value)

    monkeypatch.setattr(crud_user, name, first_call_misses)


def test_register_same_username_at_the_same_time_gives_409(client, monkeypatch):
    _register(client, username="Vendela")
    _miss_first_check(monkeypatch, "get_user_by_username")
    response = _register(client, username="vendela", email="annan@example.com")
    assert response.status_code == 409
    assert response.json()["detail"] == "Användarnamnet är upptaget."


def test_register_same_email_at_the_same_time_gives_409(client, monkeypatch):
    _register(client)
    _miss_first_check(monkeypatch, "get_user_by_email")
    response = _register(client, username="annan")
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."


def test_update_to_same_email_at_the_same_time_gives_409(client, db, me, monkeypatch):
    db.add(User(username="annan", email="upptagen@example.com", password_hash="x"))
    db.commit()
    _miss_first_check(monkeypatch, "get_user_by_email")
    response = _update(client, email="upptagen@example.com")
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."
    db.refresh(me)
    assert me.email is None


def test_update_to_same_username_at_the_same_time_gives_409(client, db, me, monkeypatch):
    db.add(User(username="annan", password_hash="x"))
    db.commit()
    _miss_first_check(monkeypatch, "get_user_by_username")
    response = _update(client, username="annan")
    assert response.status_code == 409
    assert response.json()["detail"] == "Användarnamnet är upptaget."


def test_own_row_is_not_a_conflict_when_saving_fails_for_another_reason(client, db, me, monkeypatch):
    # Byter man bara skiftläge på sitt namn och e-posten krockar samtidigt, ska
    # felet gälla e-posten, inte ens eget användarnamn.
    db.add(User(username="annan", email="upptagen@example.com", password_hash="x"))
    db.commit()
    _miss_first_check(monkeypatch, "get_user_by_email")
    response = _update(client, username="TESTUSER", email="upptagen@example.com")
    assert response.status_code == 409
    assert response.json()["detail"] == "E-postadressen används redan."
