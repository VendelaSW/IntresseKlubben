"""Tester för att bekräfta e-postadressen via en länk i ett mejl.

Riktig inloggning hela vägen (som i test_auth.py), och mejlen fångas av den fejkade
utskickaren i conftest.py (fixturen `sent_emails`), så att inget skickas på riktigt.
"""

import re
from datetime import timedelta

import pytest

from app.core import error_messages as msg
from app.core.config import settings
from app.models.email_token import EmailToken, utc_now
from app.models.user import User

PASSWORD = "hemligt123"


def _register(client, username="vendela"):
    response = client.post(
        "/users/register", json={"username": username, "email": f"{username}@example.com", "password": PASSWORD}
    )
    assert response.status_code == 201
    login = client.post("/users/login", json={"username_or_email": username, "password": PASSWORD})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _link_token(email) -> str:
    """Koden i länken i ett fångat mejl (till, ämne, text, html)."""
    return re.search(r"/verifiera\?token=([A-Za-z0-9_-]+)", email[2]).group(1)


def _age_links(db, minutes=5):
    """Låtsas att alla länkar skickades för en stund sedan, så att spärren inte slår till."""
    for row in db.query(EmailToken).all():
        row.created_at = row.created_at - timedelta(minutes=minutes)
    db.commit()


def test_registering_sends_a_link_and_the_email_starts_unverified(client, sent_emails):
    auth = _register(client)

    assert len(sent_emails.sent) == 1
    to, subject, text, html = sent_emails.sent[0]
    assert to == "vendela@example.com"
    assert subject == "Bekräfta din e-postadress"
    assert f"{settings.frontend_base_url}/verifiera?token=" in text
    assert _link_token(sent_emails.sent[0]) in html
    assert client.get("/users/me", headers=auth).json()["email_verified"] is False


def test_the_link_verifies_the_email_without_being_logged_in(client, sent_emails):
    auth = _register(client)

    response = client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[0])})

    assert response.status_code == 204
    assert client.get("/users/me", headers=auth).json()["email_verified"] is True


def test_clicking_the_link_again_still_says_verified(client, sent_emails):
    _register(client)
    token = _link_token(sent_emails.sent[0])

    assert client.post("/users/verify-email", json={"token": token}).status_code == 204
    assert client.post("/users/verify-email", json={"token": token}).status_code == 204


def test_unknown_link_is_rejected(client):
    response = client.post("/users/verify-email", json={"token": "finns-inte"})
    assert response.status_code == 400
    assert response.json()["detail"] == msg.EMAIL_LINK_INVALID


def test_expired_link_is_rejected(client, db, sent_emails):
    auth = _register(client)
    db.query(EmailToken).update({EmailToken.expires_at: utc_now() - timedelta(minutes=1)})
    db.commit()

    response = client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[0])})

    assert response.status_code == 400
    assert client.get("/users/me", headers=auth).json()["email_verified"] is False


def test_only_a_hash_of_the_link_is_stored(client, db, sent_emails):
    _register(client)
    token = _link_token(sent_emails.sent[0])

    row = db.query(EmailToken).one()
    assert row.token_hash != token
    assert token not in row.token_hash
    assert row.email == "vendela@example.com"


def test_a_new_link_replaces_the_old_one(client, db, sent_emails):
    auth = _register(client)
    old = _link_token(sent_emails.sent[0])
    _age_links(db)

    assert client.post("/users/me/email-verification", headers=auth).status_code == 204
    new = _link_token(sent_emails.sent[1])

    assert client.post("/users/verify-email", json={"token": old}).status_code == 400
    assert client.post("/users/verify-email", json={"token": new}).status_code == 204


def test_sending_again_right_away_is_stopped(client, db, sent_emails):
    auth = _register(client)
    _age_links(db)

    assert client.post("/users/me/email-verification", headers=auth).status_code == 204
    response = client.post("/users/me/email-verification", headers=auth)

    assert response.status_code == 429
    assert response.json()["detail"] == msg.EMAIL_TOO_MANY_REQUESTS
    assert len(sent_emails.sent) == 2  # registreringen och den första


def test_at_most_five_links_an_hour(client, db, sent_emails):
    auth = _register(client)
    for _ in range(4):
        _age_links(db, minutes=2)
        assert client.post("/users/me/email-verification", headers=auth).status_code == 204
    _age_links(db, minutes=2)

    assert client.post("/users/me/email-verification", headers=auth).status_code == 429


def test_cannot_send_a_link_for_an_already_verified_email(client, sent_emails):
    auth = _register(client)
    client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[0])})

    response = client.post("/users/me/email-verification", headers=auth)

    assert response.status_code == 400
    assert response.json()["detail"] == msg.EMAIL_ALREADY_VERIFIED


def test_cannot_send_a_link_without_an_email(client, user):
    # Konton från innan e-post krävdes kan sakna e-post (fixturen `user` har ingen).
    response = client.post("/users/me/email-verification")
    assert response.status_code == 400
    assert response.json()["detail"] == msg.EMAIL_MISSING


def test_a_failed_email_does_not_stop_the_registration(client, sent_emails):
    sent_emails.fail = True
    response = client.post(
        "/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD}
    )
    assert response.status_code == 201


def test_a_failed_email_when_sending_again_says_so(client, db, sent_emails):
    auth = _register(client)
    _age_links(db)
    sent_emails.fail = True

    response = client.post("/users/me/email-verification", headers=auth)

    assert response.status_code == 503
    assert response.json()["detail"] == msg.EMAIL_SEND_FAILED


def test_a_new_email_must_be_verified_again(client, db, sent_emails):
    auth = _register(client)
    old_link = _link_token(sent_emails.sent[0])
    client.post("/users/verify-email", json={"token": old_link})
    _age_links(db)

    response = client.patch("/users/me", headers=auth, json={"password": PASSWORD, "email": "ny@example.com"})

    assert response.status_code == 200
    assert response.json()["email_verified"] is False
    assert sent_emails.sent[-1][0] == "ny@example.com"
    # Länken till den gamla adressen bekräftar inte den nya.
    assert client.post("/users/verify-email", json={"token": old_link}).status_code == 400
    assert client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[-1])}).status_code == 204


def test_changing_the_email_over_and_over_does_not_send_a_mail_each_time(client, db, sent_emails):
    # Annars kunde man skicka mejl till vem som helst från vår domän genom att byta adress gång på gång.
    auth = _register(client)
    _age_links(db)

    first = client.patch("/users/me", headers=auth, json={"password": PASSWORD, "email": "a@example.com"})
    second = client.patch("/users/me", headers=auth, json={"password": PASSWORD, "email": "b@example.com"})

    assert first.status_code == 200 and second.status_code == 200
    assert second.json()["email"] == "b@example.com"
    assert [mail[0] for mail in sent_emails.sent] == ["vendela@example.com", "a@example.com"]


def test_changing_only_the_username_keeps_the_email_verified(client, sent_emails):
    auth = _register(client)
    client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[0])})

    response = client.patch("/users/me", headers=auth, json={"password": PASSWORD, "username": "vendela2"})

    assert response.json()["email_verified"] is True
    assert len(sent_emails.sent) == 1


def test_login_works_without_a_verified_email_by_default(client):
    _register(client)  # loggar in utan att ha bekräftat


@pytest.fixture
def require_verification(monkeypatch):
    monkeypatch.setattr(settings, "require_email_verification", True)


def test_login_needs_a_verified_email_when_turned_on(client, sent_emails, require_verification):
    client.post("/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD})
    credentials = {"username_or_email": "vendela", "password": PASSWORD}

    refused = client.post("/users/login", json=credentials)
    assert refused.status_code == 403
    assert refused.json()["detail"] == msg.EMAIL_NOT_VERIFIED

    client.post("/users/verify-email", json={"token": _link_token(sent_emails.sent[0])})
    assert client.post("/users/login", json=credentials).status_code == 200


def test_wrong_password_still_gives_the_usual_error_when_turned_on(client, require_verification):
    client.post("/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": PASSWORD})
    response = client.post("/users/login", json={"username_or_email": "vendela", "password": "fel-lösenord"})
    assert response.status_code == 401


def test_without_a_key_the_link_is_logged_locally_but_never_in_production(monkeypatch, caplog):
    # Utan RESEND_API_KEY skrivs mejlet i loggen, så att länken går att testa lokalt. I produktion får länken
    # aldrig hamna i loggen (den ger tillgång till kontot), och den som väntar ska få veta att mejlet inte gick iväg.
    from app.services.email import EmailFailed, LogSender

    link = "http://localhost:5173/verifiera?token=hemlig-kod"
    LogSender().send("vendela@example.com", "Ämne", f"Klicka: {link}", "")
    assert link in caplog.text

    caplog.clear()
    monkeypatch.setattr(settings, "vercel_env", "production")
    with pytest.raises(EmailFailed):
        LogSender().send("vendela@example.com", "Ämne", f"Klicka: {link}", "")
    assert "hemlig-kod" not in caplog.text
    assert "RESEND_API_KEY saknas" in caplog.text


def test_deleting_the_account_removes_its_links(client, db, sent_emails):
    auth = _register(client)

    assert client.request("DELETE", "/users/me", headers=auth, json={"password": PASSWORD}).status_code == 204

    assert db.query(EmailToken).count() == 0
    assert db.query(User).count() == 0
