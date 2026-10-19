"""Tester för lösenord via e-post: glömt lösenord och byte av lösenord med bekräftelse.

Riktig inloggning hela vägen (som i test_auth.py), och mejlen fångas av den fejkade
utskickaren i conftest.py (fixturen `sent_emails`).
"""

import re
from datetime import timedelta

from app.auth.security import hash_password
from app.core import error_messages as msg
from app.models.email_token import EmailToken, utc_now
from app.models.user import User

PASSWORD = "hemligt123"
NEW_PASSWORD = "nytt-losen-456"


def _register(client, username="vendela"):
    body = {"username": username, "email": f"{username}@example.com", "password": PASSWORD}
    assert client.post("/users/register", json=body).status_code == 201
    return _login(client, username, PASSWORD)


def _login(client, username, password):
    response = client.post("/users/login", json={"username_or_email": username, "password": password})
    if response.status_code != 200:
        return None
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _token_in(email, path) -> str:
    return re.search(rf"/{path}\?token=([A-Za-z0-9_-]+)", email[2]).group(1)


def _age_links(db, minutes=5):
    """Låtsas att alla länkar skickades för en stund sedan, så att spärren inte slår till."""
    for row in db.query(EmailToken).all():
        row.created_at = row.created_at - timedelta(minutes=minutes)
    db.commit()


def _make_older(db, seconds=5):
    """Låtsas att lösenordet byttes några sekunder efter den gamla inloggningen. Testet går så fort att båda annars
    hamnar i samma sekund, och då räknas inloggningen som ny (se get_current_user)."""
    for user in db.query(User).all():
        if user.password_changed_at is not None:
            user.password_changed_at = user.password_changed_at + timedelta(seconds=seconds)
    db.commit()


# ---------- Glömt lösenord ----------


def test_forgot_password_sends_a_link_to_the_accounts_email(client, sent_emails):
    _register(client)

    response = client.post("/users/forgot-password", json={"username_or_email": "vendela@example.com"})

    assert response.status_code == 204
    to, subject, text, _ = sent_emails.sent[-1]
    assert to == "vendela@example.com"
    assert subject == "Välj ett nytt lösenord"
    assert "/aterstall?token=" in text


def test_forgot_password_also_takes_the_username(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    assert sent_emails.sent[-1][1] == "Välj ett nytt lösenord"


def test_forgot_password_gives_the_same_answer_for_unknown_accounts(client, sent_emails):
    response = client.post("/users/forgot-password", json={"username_or_email": "finns-inte@example.com"})
    assert response.status_code == 204
    assert sent_emails.sent == []


def test_forgot_password_is_rate_limited_but_answers_the_same(client, db, sent_emails):
    _register(client)
    first = client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    second = client.post("/users/forgot-password", json={"username_or_email": "vendela"})

    assert first.status_code == second.status_code == 204
    resets = [mail for mail in sent_emails.sent if mail[1] == "Välj ett nytt lösenord"]
    assert len(resets) == 1


def test_forgot_password_answers_the_same_when_the_email_fails(client, sent_emails):
    _register(client)
    sent_emails.fail = True
    assert client.post("/users/forgot-password", json={"username_or_email": "vendela"}).status_code == 204


def test_reset_link_sets_a_new_password(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    token = _token_in(sent_emails.sent[-1], "aterstall")

    response = client.post("/users/reset-password", json={"token": token, "new_password": NEW_PASSWORD})

    assert response.status_code == 204
    assert _login(client, "vendela", PASSWORD) is None
    assert _login(client, "vendela", NEW_PASSWORD) is not None


def test_reset_link_works_only_once(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    token = _token_in(sent_emails.sent[-1], "aterstall")

    client.post("/users/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    again = client.post("/users/reset-password", json={"token": token, "new_password": "ett-tredje-789"})

    assert again.status_code == 400
    assert again.json()["detail"] == msg.PASSWORD_LINK_INVALID
    assert _login(client, "vendela", NEW_PASSWORD) is not None


def test_expired_reset_link_is_rejected(client, db, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    token = _token_in(sent_emails.sent[-1], "aterstall")
    db.query(EmailToken).update({EmailToken.expires_at: utc_now() - timedelta(minutes=1)})
    db.commit()

    response = client.post("/users/reset-password", json={"token": token, "new_password": NEW_PASSWORD})

    assert response.status_code == 400
    assert _login(client, "vendela", PASSWORD) is not None


def test_reset_logs_out_other_devices(client, db, sent_emails):
    old_session = _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    client.post(
        "/users/reset-password", json={"token": _token_in(sent_emails.sent[-1], "aterstall"), "new_password": NEW_PASSWORD}
    )
    _make_older(db)

    assert client.get("/users/me", headers=old_session).status_code == 401


def test_logging_in_right_after_a_reset_works(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    client.post(
        "/users/reset-password", json={"token": _token_in(sent_emails.sent[-1], "aterstall"), "new_password": NEW_PASSWORD}
    )

    new_session = _login(client, "vendela", NEW_PASSWORD)
    assert client.get("/users/me", headers=new_session).status_code == 200


def test_a_reset_also_verifies_the_email(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    client.post(
        "/users/reset-password", json={"token": _token_in(sent_emails.sent[-1], "aterstall"), "new_password": NEW_PASSWORD}
    )

    session = _login(client, "vendela", NEW_PASSWORD)
    assert client.get("/users/me", headers=session).json()["email_verified"] is True


def test_a_verification_link_cannot_reset_the_password(client, sent_emails):
    _register(client)
    verify_token = _token_in(sent_emails.sent[0], "verifiera")

    response = client.post("/users/reset-password", json={"token": verify_token, "new_password": NEW_PASSWORD})

    assert response.status_code == 400


def test_a_new_password_must_follow_the_rules(client, sent_emails):
    _register(client)
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    token = _token_in(sent_emails.sent[-1], "aterstall")

    too_short = client.post("/users/reset-password", json={"token": token, "new_password": "kort"})
    too_long = client.post("/users/reset-password", json={"token": token, "new_password": "å" * 40})

    assert too_short.status_code == 422
    assert too_long.status_code == 422
    assert msg.PASSWORD_TOO_LONG in str(too_long.json())


def test_registering_with_a_too_long_password_gives_a_clear_error(client):
    response = client.post(
        "/users/register", json={"username": "vendela", "email": "vendela@example.com", "password": "a" * 80}
    )
    assert response.status_code == 422
    assert msg.PASSWORD_TOO_LONG in str(response.json())


# ---------- Byta lösenord ----------


def _request_change(client, auth, current=PASSWORD, new=NEW_PASSWORD):
    return client.post("/users/me/password", headers=auth, json={"current_password": current, "new_password": new})


def test_changing_the_password_sends_a_confirmation_and_keeps_the_old_one(client, sent_emails):
    auth = _register(client)

    response = _request_change(client, auth)

    assert response.status_code == 204
    to, subject, text, _ = sent_emails.sent[-1]
    assert to == "vendela@example.com"
    assert subject == "Bekräfta ditt nya lösenord"
    assert "/bekrafta-losenord?token=" in text
    # Inget är bytt förrän länken används.
    assert _login(client, "vendela", PASSWORD) is not None
    assert _login(client, "vendela", NEW_PASSWORD) is None


def test_confirming_the_change_switches_the_password(client, db, sent_emails):
    auth = _register(client)
    _request_change(client, auth)
    token = _token_in(sent_emails.sent[-1], "bekrafta-losenord")

    response = client.post("/users/confirm-password-change", json={"token": token})
    _make_older(db)

    assert response.status_code == 204
    assert _login(client, "vendela", PASSWORD) is None
    assert _login(client, "vendela", NEW_PASSWORD) is not None
    # Inloggningen från innan bytet gäller inte längre, och det väntande lösenordet ligger inte kvar.
    assert client.get("/users/me", headers=auth).status_code == 401
    assert db.query(EmailToken).filter(EmailToken.new_password_hash.isnot(None)).count() == 0


def test_the_confirmation_link_works_only_once(client, sent_emails):
    auth = _register(client)
    _request_change(client, auth)
    token = _token_in(sent_emails.sent[-1], "bekrafta-losenord")

    client.post("/users/confirm-password-change", json={"token": token})
    again = client.post("/users/confirm-password-change", json={"token": token})

    assert again.status_code == 400
    assert again.json()["detail"] == msg.PASSWORD_LINK_INVALID


def test_an_expired_confirmation_link_changes_nothing(client, db, sent_emails):
    auth = _register(client)
    _request_change(client, auth)
    token = _token_in(sent_emails.sent[-1], "bekrafta-losenord")
    db.query(EmailToken).update({EmailToken.expires_at: utc_now() - timedelta(minutes=1)})
    db.commit()

    assert client.post("/users/confirm-password-change", json={"token": token}).status_code == 400
    assert _login(client, "vendela", PASSWORD) is not None


def test_changing_the_password_needs_the_current_one(client, sent_emails):
    auth = _register(client)
    response = _request_change(client, auth, current="fel-lösenord")
    assert response.status_code == 403
    assert all(mail[1] != "Bekräfta ditt nya lösenord" for mail in sent_emails.sent)


def test_changing_the_password_needs_an_email(client, db, user):
    # Fixturen `user` har ingen e-post, och lösenordet "unused" är ingen giltig hash: sätt ett riktigt.
    user.password_hash = hash_password(PASSWORD)
    db.commit()
    response = client.post("/users/me/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json()["detail"] == msg.PASSWORD_CHANGE_NEEDS_EMAIL


def test_asking_to_change_again_right_away_is_stopped(client, sent_emails):
    auth = _register(client)
    assert _request_change(client, auth).status_code == 204
    response = _request_change(client, auth, new="ett-annat-789")
    assert response.status_code == 429


def test_a_new_change_request_replaces_the_old_one(client, db, sent_emails):
    auth = _register(client)
    _request_change(client, auth)
    old = _token_in(sent_emails.sent[-1], "bekrafta-losenord")
    _age_links(db)
    _request_change(client, auth, new="ett-annat-789")
    new = _token_in(sent_emails.sent[-1], "bekrafta-losenord")

    assert client.post("/users/confirm-password-change", json={"token": old}).status_code == 400
    assert client.post("/users/confirm-password-change", json={"token": new}).status_code == 204
    assert _login(client, "vendela", "ett-annat-789") is not None


def test_a_reset_cancels_a_waiting_change(client, db, sent_emails):
    auth = _register(client)
    _request_change(client, auth)
    change_token = _token_in(sent_emails.sent[-1], "bekrafta-losenord")
    client.post("/users/forgot-password", json={"username_or_email": "vendela"})
    client.post(
        "/users/reset-password", json={"token": _token_in(sent_emails.sent[-1], "aterstall"), "new_password": "efter-reset-1"}
    )

    assert client.post("/users/confirm-password-change", json={"token": change_token}).status_code == 400
    assert _login(client, "vendela", "efter-reset-1") is not None


def test_a_failed_email_when_changing_says_so(client, sent_emails):
    auth = _register(client)
    sent_emails.fail = True
    response = _request_change(client, auth)
    assert response.status_code == 503
    assert response.json()["detail"] == msg.EMAIL_SEND_FAILED
