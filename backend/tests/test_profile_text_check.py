"""Förhandskontrollen av Om mig-texten (POST /profile/text-check): samma kontroll som vid sparandet, men utan att
något sparas, så att man får veta att texten nekas redan när man skrivit den."""

import pytest

from app.api.routes import profile as profile_routes
from app.core.config import settings
from app.services.ai_clients import AIFailed, set_clients
from tests.fakes import FakeLLM, FakeModerator

URL = "/profile/text-check"
NOT_ALLOWED = "Texten verkar innehålla något som inte får finnas här. Skriv om den"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-nyckel")
    monkeypatch.setattr(settings, "openai_model", "test-modell")
    profile_routes._recent_text_checks.clear()
    profile_routes._checked_texts.clear()
    yield
    profile_routes._recent_text_checks.clear()
    profile_routes._checked_texts.clear()


def fakes(flagged=False, allowed=True, policy_answer=None):
    llm = FakeLLM({"text_policy": policy_answer if policy_answer is not None else {"allowed": allowed}})
    moderator = FakeModerator(flag_all=flagged)
    set_clients(llm=llm, moderator=moderator)
    return llm, moderator


def test_an_allowed_text_gives_204_and_saves_nothing(client, user):
    fakes(allowed=True)
    response = client.post(URL, json={"profile_text": "Jag gillar att klättra och spela brädspel."})
    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/profile/").status_code == 404  # ingen profil skapades


def test_a_text_the_policy_model_rejects_gives_422_with_the_same_message_as_saving(client, user):
    fakes(allowed=False)
    response = client.post(URL, json={"profile_text": "Jag är nazist."})
    assert response.status_code == 422
    assert response.json()["detail"] == NOT_ALLOWED


def test_a_text_flagged_by_moderation_gives_422(client, user):
    fakes(flagged=True)
    assert client.post(URL, json={"profile_text": "Något olämpligt."}).status_code == 422


def test_the_word_list_is_checked_without_any_ai_call(client, user, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "openai_model", "")
    response = client.post(URL, json={"profile_text": "Jag gillar fitta."})
    assert response.status_code == 422
    assert "otillåtet språk" in str(response.json())


def test_a_text_that_is_too_long_or_empty_is_refused_like_when_saving(client, user):
    fakes()
    assert client.post(URL, json={"profile_text": "x" * 801}).status_code == 422
    assert client.post(URL, json={"profile_text": "   "}).status_code == 422


def test_it_gives_503_when_the_check_cannot_run(client, user):
    fakes(policy_answer=AIFailed("nere"))
    response = client.post(URL, json={"profile_text": "Jag gillar katter."})
    assert response.status_code == 503
    assert response.json()["detail"] == "Vi kunde inte kontrollera texten just nu. Försök igen om en stund"


def test_it_needs_a_login(client):
    from app.main import app
    from app.auth.security import get_current_user

    app.dependency_overrides.pop(get_current_user, None)
    assert client.post(URL, json={"profile_text": "Hej"}).status_code in (401, 403)


def test_it_is_open_without_a_profile_so_the_interview_can_use_it(client, user):
    fakes()
    # Vakten som låser resten av appen släpper igenom /profile/..., så en ny användare kan kolla texten.
    assert client.post(URL, json={"profile_text": "Jag gillar katter."}).status_code == 204


def test_too_many_checks_are_stopped(client, user):
    fakes()
    codes = [client.post(URL, json={"profile_text": "Jag gillar katter."}).status_code for _ in range(profile_routes.TEXT_CHECK_LIMIT + 1)]
    assert codes[:-1] == [204] * profile_routes.TEXT_CHECK_LIMIT
    assert codes[-1] == 429


def test_the_limit_is_per_user(client, db, user):
    from app.models.user import User

    fakes()
    for _ in range(profile_routes.TEXT_CHECK_LIMIT):
        client.post(URL, json={"profile_text": "Jag gillar katter."})
    other = User(username="annan", email="annan@example.com", password_hash="x")
    db.add(other)
    db.commit()
    profile_routes._check_text_rate_limit(other.id)  # en annan användare har sin egen gräns


# ---------- En text som redan är kontrollerad kontrolleras inte igen när den sparas ----------


@pytest.fixture
def yoga(db):
    from app.models.interest import Interest

    interest = Interest(name="Yoga")
    db.add(interest)
    db.commit()
    return interest


def create(client, yoga, text):
    from tests.helpers import profile_payload

    return client.post("/profile/", json=profile_payload([yoga.id], profile_text=text))


def test_a_text_that_passed_the_early_check_is_not_checked_again_when_saved(client, user, municipalities, yoga):
    llm, moderator = fakes()
    assert client.post(URL, json={"profile_text": "Jag gillar katter."}).status_code == 204
    assert len(llm.calls_named("text_policy")) == 1
    assert create(client, yoga, "Jag gillar katter.").status_code == 201
    assert len(llm.calls_named("text_policy")) == 1  # inget nytt anrop
    assert len(moderator.batches) == 1


def test_surrounding_spaces_do_not_make_it_a_different_text(client, user, municipalities, yoga):
    llm, _ = fakes()
    client.post(URL, json={"profile_text": "Jag gillar katter."})
    assert create(client, yoga, "  Jag gillar katter.  ").status_code == 201
    assert len(llm.calls_named("text_policy")) == 1


def test_a_different_text_is_checked_when_saved(client, user, municipalities, yoga):
    llm, _ = fakes()
    client.post(URL, json={"profile_text": "Jag gillar katter."})
    llm.answers["text_policy"] = {"allowed": False}  # modellen nekar det som kommer nu
    assert create(client, yoga, "Jag är nazist.").status_code == 422
    assert len(llm.calls_named("text_policy")) == 2


def test_saving_without_an_early_check_is_checked_as_usual(client, user, municipalities, yoga):
    llm, _ = fakes(allowed=False)
    assert create(client, yoga, "Jag är nazist.").status_code == 422
    assert len(llm.calls_named("text_policy")) == 1


def test_another_users_early_check_does_not_cover_me(client, db, user, municipalities, yoga):
    llm, _ = fakes()
    profile_routes._remember_checked(user.id + 1000, "Jag gillar katter.")
    assert create(client, yoga, "Jag gillar katter.").status_code == 201
    assert len(llm.calls_named("text_policy")) == 1  # kontrollerades som vanligt


def test_the_memory_runs_out_so_an_old_check_does_not_count(client, user, municipalities, yoga, monkeypatch):
    llm, _ = fakes()
    client.post(URL, json={"profile_text": "Jag gillar katter."})
    later = profile_routes.time.monotonic() + profile_routes.CHECKED_TEXT_SECONDS + 5
    monkeypatch.setattr(profile_routes.time, "monotonic", lambda: later)
    assert create(client, yoga, "Jag gillar katter.").status_code == 201
    assert len(llm.calls_named("text_policy")) == 2


def test_a_rejected_early_check_is_not_remembered(client, user, municipalities, yoga):
    llm, _ = fakes(allowed=False)
    assert client.post(URL, json={"profile_text": "Jag är nazist."}).status_code == 422
    assert create(client, yoga, "Jag är nazist.").status_code == 422
    assert len(llm.calls_named("text_policy")) == 2
