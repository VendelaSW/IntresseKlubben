from concurrent.futures import TimeoutError
from collections import defaultdict, deque
from unittest.mock import Mock, patch

import pytest

from app.services import ai_clients, text_moderation as moderation
from app.core.config import Settings
from app.auth.security import hash_password
from app.models.user import User
from app.models.user_interest import UserInterest
from app.models import Event, Group, GroupMessage, Interest, Message, Profile
from app.schemas.event import EventCreate, EventUpdate
from app.schemas.group import GroupCreate
from app.schemas.profile import ProfileCreate, ProfileUpdate
from app.schemas.user import AccountUpdate, UserCreate
from tests.event_helpers import add_event, add_group, payload as event_payload
from tests.helpers import make_profile, profile_payload
from app.services.analysis_token import create_token

_client_factory = ai_clients._get_hf_client


@pytest.fixture
def client_factory(monkeypatch):
    _client_factory.cache_clear()
    monkeypatch.setattr(ai_clients.settings, "moderation_space", "example/moderation")
    monkeypatch.setattr(ai_clients.settings, "hf_token", "")
    with patch("gradio_client.Client", autospec=True) as constructor:
        yield _client_factory, constructor
    _client_factory.cache_clear()


def test_client_is_created_once_and_reused(client_factory):
    factory, constructor = client_factory
    assert factory() is factory()
    constructor.assert_called_once_with(
        "example/moderation", token=None, verbose=False, analytics_enabled=False,
        httpx_kwargs={"timeout": 10},
    )


def test_missing_space_is_reported_by_client_without_connecting(client_factory, monkeypatch):
    factory, constructor = client_factory
    monkeypatch.setattr(ai_clients.settings, "moderation_space", "")
    with pytest.raises(ai_clients.AINotConfigured):
        factory()
    constructor.assert_not_called()


def test_private_space_token_stays_in_client_configuration(client_factory, monkeypatch):
    factory, constructor = client_factory
    monkeypatch.setattr(ai_clients.settings, "hf_token", "test-token-only")
    factory()
    assert constructor.call_args.kwargs["token"] == "test-token-only"


def test_hf_token_is_loaded_from_environment(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "environment-test-token")
    configured = Settings(_env_file=None)
    assert configured.hf_token == "environment-test-token"


def test_private_space_token_is_trimmed_before_client_initialization(client_factory, monkeypatch):
    factory, constructor = client_factory
    monkeypatch.setattr(ai_clients.settings, "hf_token", "  test-token-only  ")
    factory()
    assert constructor.call_args.kwargs["token"] == "test-token-only"


@pytest.fixture
def remote(monkeypatch):
    client = Mock()
    client.submit.return_value.result.return_value = {
        "flagged": False, "translated_text": "Hello", "score": 0.01,
    }
    monkeypatch.setattr(ai_clients, "_get_hf_client", lambda: client)
    return client


def test_clean_text_uses_named_remote_endpoint(remote):
    assert moderation.check_fields(ai=True, description="Hej") is None
    remote.submit.assert_called_once_with("Hej", api_name="/moderate")
    remote.submit.return_value.result.assert_called_once_with(timeout=10)


@pytest.mark.parametrize("result", [
    {"flagged": True, "translated_text": "Toxic", "score": 0.9},
    {"flagged": False, "translated_text": "Toxic", "score": 0.5},
])
def test_flagged_or_high_scoring_text_is_rejected(remote, result):
    remote.submit.return_value.result.return_value = result
    with pytest.raises(moderation.ToxicContentError):
        moderation.check_fields(ai=True, description="Text")


@pytest.mark.parametrize("result", [
    None, {}, "invalid", {"flagged": "false", "translated_text": "Hello", "score": 0.1},
    {"flagged": False, "translated_text": "Hello", "score": float("nan")},
    {"flagged": False, "translated_text": "Hello", "score": 1.1},
    {"flagged": False, "score": 0.1},
])
def test_invalid_remote_response_falls_back_and_logs_warning(remote, result, caplog):
    remote.submit.return_value.result.return_value = result
    assert moderation.check_fields(ai=True, description="Hej") is None
    assert "lokal ordkontroll används" in caplog.text


def test_timeout_falls_back_and_cancels_job(remote, caplog):
    remote.submit.return_value.result.side_effect = TimeoutError()
    assert moderation.check_fields(ai=True, description="Hej") is None
    remote.submit.return_value.cancel.assert_called_once()
    assert "lokal ordkontroll används" in caplog.text


def test_remote_failure_falls_back(remote, caplog):
    remote.submit.side_effect = RuntimeError("unavailable")
    assert moderation.check_fields(ai=True, description="Hej") is None
    assert "lokal ordkontroll används" in caplog.text


def test_private_space_auth_failure_falls_back_to_local_filter(remote, caplog):
    remote.submit.side_effect = RuntimeError("401 Unauthorized")
    assert moderation.check_fields(ai=True, description="Ren text") is None
    assert "lokal ordkontroll används" in caplog.text


def test_private_space_auth_failure_does_not_bypass_local_filter(remote, caplog):
    remote.submit.side_effect = RuntimeError("401 Unauthorized")
    with pytest.raises(moderation.WordFilterError):
        moderation.check_fields(ai=True, description="FUCK")
    remote.submit.assert_not_called()


@pytest.mark.parametrize("text", [None, "", "  "])
def test_optional_empty_text_never_calls_remote(remote, text):
    moderation.check_fields(ai=True, description=text)
    remote.submit.assert_not_called()


@pytest.mark.parametrize("flagged", [True, None])
def test_registration_does_not_depend_on_ai(client, db, remote, flagged):
    if flagged is None:
        remote.submit.side_effect = RuntimeError("Space unavailable")
    else:
        remote.submit.return_value.result.return_value = {
            "flagged": True, "translated_text": "Toxic", "score": 0.9,
        }
    response = client.post("/users/register", json={
        "username": "Vendela", "email": "vendela@example.com", "password": "hemligt123",
    })
    assert response.status_code == 201
    assert db.query(User).one().username == "Vendela"
    remote.submit.assert_not_called()


def test_clean_registration_preserves_original_text(client, db, remote):
    response = client.post("/users/register", json={
        "username": "Vendela", "email": "vendela@example.com", "password": "hemligt123",
    })
    assert response.status_code == 201
    assert db.query(User).one().username == "Vendela"
    remote.submit.assert_not_called()


_SAVE_CASES = [
    ("account_create", "username"), ("account_update", "username"),
    *[(operation, field) for operation in ("profile_create", "profile_update")
      for field in ("name", "profile_text", "district")],
    *[("group_create", field) for field in ("name", "description", "meeting_info", "place_name", "address")],
    *[(operation, field) for operation in ("event_create", "event_update")
      for field in ("title", "description", "place_name", "address")],
    ("message", "text"), ("group_message", "content"),
]


@pytest.fixture
def save_case(request, db, user, municipalities, client):
    operation, field = request.param
    interest = Interest(id=1, name="Schack")
    friend = User(id=2, username="friend", password_hash="unused")
    db.add_all([interest, friend])
    db.commit()
    group = add_group(db, user.id)
    target = "Kontrolltext"
    uses_ai = operation == "group_create" or (
        operation in ("event_create", "event_update") and field in ("title", "description")
    ) or (
        operation in ("profile_create", "profile_update") and field == "profile_text"
    )
    if operation == "account_create":
        data = UserCreate(username=target, email="new@example.com", password="hemligt123")
        url, method, model = "/users/register", "post", User
    elif operation == "account_update":
        user.password_hash = hash_password("hemligt123")
        db.commit()
        data = AccountUpdate(username=target, email="new@example.com", password="hemligt123")
        url, method, model = "/users/me", "patch", User
    elif operation == "profile_create":
        data = ProfileCreate(**profile_payload([interest.id], **{field: target}))
        url, method, model = "/profile/", "post", Profile
    elif operation == "profile_update":
        db.add(make_profile(user.id))
        db.commit()
        data = ProfileUpdate(**{field: target, **({"name": "Nytt namn"} if field != "name" else {})})
        url, method, model = "/profile/", "patch", Profile
    elif operation == "group_create":
        data = GroupCreate(**{
            "name": "Ny klubb", "description": "Spela schack.",
            "interest_id": interest.id, "municipality_code": "1480", field: target,
        })
        url, method, model = "/groups/", "post", Group
    elif operation == "event_create":
        data = EventCreate(**event_payload(**{field: target}))
        url, method, model = "/events/", "post", Event
    elif operation == "event_update":
        event = add_event(db, user.id)
        data = EventUpdate(**{field: target, **({"title": "Ny titel"} if field != "title" else {})})
        url, method, model = f"/events/{event.id}", "patch", Event
    elif operation == "message":
        data = {"recipient_id": friend.id, "text": target}
        url, method, model = "/messages", "post", Message
    else:
        data = {"content": target}
        url, method, model = f"/groups/{group.id}/messages", "post", GroupMessage

    def save():
        body = data if isinstance(data, dict) else data.model_dump(mode="json", exclude_unset=True)
        return client.request(method, url, json=body)

    return save, field, target, uses_ai, model, data


def _snapshot(db):
    return {
        model.__name__: [
            tuple(getattr(row, column.name) for column in model.__table__.columns)
            for row in db.query(model).order_by(model.id).all()
        ]
        for model in (User, Profile, Group, Event, Message, GroupMessage)
    }


@pytest.mark.parametrize("save_case", [case for case in _SAVE_CASES if
    case[0] == "group_create"
    or (case[0] in ("event_create", "event_update") and case[1] in ("title", "description"))
    or (case[0] in ("profile_create", "profile_update") and case[1] == "profile_text")], indirect=True)
@pytest.mark.parametrize("unavailable", [False, True])
def test_every_save_checks_text_before_mutation(db, remote, save_case, unavailable, caplog):
    save, _, target, _, _, _ = save_case
    before = _snapshot(db)

    def submit(text, **kwargs):
        if target in text and unavailable:
            raise RuntimeError("Space unavailable")
        job = Mock()
        job.result.return_value = {
            "flagged": target in text, "translated_text": "Translation", "score": 0.9 if target in text else 0.01,
        }
        return job

    remote.submit.side_effect = submit
    response = save()
    if unavailable:
        assert response.status_code in (200, 201), response.text
        assert "lokal ordkontroll används" in caplog.text
        assert target in str(_snapshot(db))
    else:
        assert response.status_code == 422
        assert response.json()["detail"] == "Innehållet innehåller otillåtet språk."
        assert not db.new
        assert not db.dirty
        db.expire_all()
        assert _snapshot(db) == before
    assert any(target in call.args[0] for call in remote.submit.call_args_list)


_AI_SAVE_CASES = [
    case for case in _SAVE_CASES
    if case[0] == "group_create"
    or (case[0] in ("event_create", "event_update") and case[1] in ("title", "description"))
    or (case[0] in ("profile_create", "profile_update") and case[1] == "profile_text")
]


@pytest.mark.parametrize("save_case", _AI_SAVE_CASES, indirect=True)
def test_every_save_keeps_approved_original_text(db, remote, save_case):
    save, field, target, uses_ai, model, _ = save_case
    response = save()
    assert response.status_code in (200, 201), response.text
    db.expire_all()
    assert db.query(model).filter(getattr(model, field) == target).count() == 1
    assert any(target in call.args[0] for call in remote.submit.call_args_list) is uses_ai


@pytest.mark.parametrize("save_case", [case for case in _SAVE_CASES if case[0] not in ("message", "group_message")], indirect=True)
def test_every_free_text_field_gets_local_baseline_before_ai(db, remote, save_case):
    save, field, _, _, _, data = save_case
    setattr(data, field, "FUCK")
    before = _snapshot(db)
    response = save()
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert "otillåtet språk" in response.json()["detail"][0]["msg"]
    db.expire_all()
    assert _snapshot(db) == before
    remote.submit.assert_not_called()


@pytest.mark.parametrize("unavailable", [False, True])
@pytest.mark.parametrize("group_chat", [False, True])
def test_chat_routes_never_depend_on_ai(client, db, user, municipalities, remote, unavailable, group_chat):
    if group_chat:
        db.add(Interest(id=1, name="Schack"))
        db.commit()
        group = add_group(db, user.id)
        url, body = f"/groups/{group.id}/messages", {"content": "Kontrolltext"}
    else:
        friend = User(id=2, username="friend", password_hash="unused")
        db.add(friend)
        db.commit()
        url, body = "/messages", {"recipient_id": friend.id, "text": "Kontrolltext"}
    if unavailable:
        remote.submit.side_effect = RuntimeError("Space unavailable")
    else:
        remote.submit.return_value.result.return_value = {
            "flagged": True, "translated_text": "Toxic", "score": 0.9,
        }
    response = client.post(url, json=body)
    assert response.status_code == 201
    assert db.query(Message).count() == (0 if group_chat else 1)
    assert db.query(GroupMessage).count() == (1 if group_chat else 0)
    remote.submit.assert_not_called()


def test_event_create_and_update_send_one_combined_public_text_to_ai(client, user, db, remote):
    interest = Interest(id=1, name="Löpning")
    db.add(interest)
    db.commit()
    body = event_payload(title="Morgonlöpning", description="Vi springer tillsammans.")
    created = client.post("/events/", json=body)
    assert created.status_code == 201, created.text
    remote.submit.assert_called_once_with(
        "Morgonlöpning\nVi springer tillsammans.", api_name="/moderate"
    )

    remote.submit.reset_mock()
    updated = client.patch(
        f"/events/{created.json()['id']}",
        json={"title": "Kvällslöpning", "description": "En lugn runda."},
    )
    assert updated.status_code == 200, updated.text
    remote.submit.assert_called_once_with("Kvällslöpning\nEn lugn runda.", api_name="/moderate")


def test_event_location_only_update_uses_local_filter_without_ai(client, user, db, remote):
    db.add(Interest(id=1, name="Löpning"))
    db.commit()
    created = client.post("/events/", json=event_payload())
    assert created.status_code == 201, created.text
    remote.submit.reset_mock()
    response = client.patch(f"/events/{created.json()['id']}", json={"place_name": "Slottsskogen"})
    assert response.status_code == 200, response.text
    remote.submit.assert_not_called()


@pytest.fixture
def bio_setup(db, user, municipalities, monkeypatch):
    from app.api.routes import profile as profile_route

    monkeypatch.setattr(profile_route, "_checked_texts", {})
    monkeypatch.setattr(profile_route, "_recent_text_checks", defaultdict(deque))
    interest = Interest(name="Schack", slug="schack", activities=["spela"])
    db.add(interest)
    db.commit()
    bio = "Jag gillar schack och att träffa nya vänner."
    body = profile_payload([interest.id], name="Vendela", profile_text=bio)
    token = create_token(user.id, [{
        "key": "p1", "interest_id": interest.id, "activity": "", "allowed": ["spela"],
    }])
    interview = {key: value for key, value in body.items() if key != "interest_ids"}
    interview["batches"] = [{"token": token, "items": [{"key": "p1", "activity": "spela"}]}]
    return bio, {
        "/profile/text-check": {"profile_text": bio},
        "/profile/": body,
        "/profile/interview/complete": interview,
    }


@pytest.mark.parametrize("route", ["/profile/text-check", "/profile/", "/profile/interview/complete"])
@pytest.mark.parametrize("decision", ["clean", "flagged", "unavailable"])
def test_bio_setup_checks_bio_before_saving(client, db, user, remote, bio_setup, route, decision, caplog):
    bio, bodies = bio_setup

    def submit(text, **kwargs):
        if text == bio and decision == "unavailable":
            raise TimeoutError()
        flagged = text == bio and decision == "flagged"
        job = Mock()
        job.result.return_value = {
            "flagged": flagged, "translated_text": "English translation", "score": 0.9 if flagged else 0.01,
        }
        return job

    remote.submit.side_effect = submit
    response = client.post(route, json=bodies[route])
    if decision != "flagged":
        assert response.status_code == (204 if route == "/profile/text-check" else 201), response.text
        if route != "/profile/text-check":
            assert db.query(Profile).one().profile_text == bio
            assert db.query(UserInterest).count() == 1
        else:
            assert db.query(Profile).count() == 0
        if decision == "unavailable":
            assert "lokal ordkontroll används" in caplog.text
    else:
        assert response.status_code == 422
        assert response.json() == {"detail": "Innehållet innehåller otillåtet språk."}
        assert db.query(Profile).count() == 0
        assert db.query(UserInterest).count() == 0
        assert db.get(User, user.id).onboarding_completed_at is None
    if decision == "flagged":
        assert bio in [call.args[0] for call in remote.submit.call_args_list]