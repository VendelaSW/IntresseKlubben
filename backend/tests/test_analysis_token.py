"""Sigillet på en analys (app/services/analysis_token.py)."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth.security import create_access_token
from app.core.config import settings
from app.services import analysis_token
from app.services.analysis_token import (
    TOKEN_LIFETIME,
    AnalysisTokenUnavailable,
    InvalidAnalysisToken,
    create_token,
    read_token,
)

PROPOSALS = [
    {"key": "p1", "interest_id": 2, "activity": "spela", "allowed": ["lyssna", "spela"]},
    {"key": "p2", "new": {"name": "Fyrmodeller", "parent_key": "p3"}, "activity": "", "allowed": []},
]


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-hemlighet-0123456789-0123456789")


def test_a_token_gives_back_exactly_the_proposals_for_the_same_user():
    assert read_token(create_token(7, PROPOSALS), 7) == PROPOSALS


def test_an_empty_list_of_proposals_can_be_sealed_too():
    assert read_token(create_token(7, []), 7) == []


def test_a_token_belongs_to_the_user_it_was_made_for():
    with pytest.raises(InvalidAnalysisToken):
        read_token(create_token(7, PROPOSALS), 8)


def test_the_token_is_valid_for_thirty_minutes():
    assert TOKEN_LIFETIME == timedelta(minutes=30)
    payload = jwt.decode(create_token(7, []), options={"verify_signature": False})
    assert 29 * 60 < payload["exp"] - payload["iat"] <= 30 * 60


def test_an_expired_token_is_rejected(monkeypatch):
    old = datetime.now(timezone.utc) - TOKEN_LIFETIME - timedelta(minutes=1)
    payload = {"typ": "interest-analysis", "uid": 7, "iat": old, "exp": old + TOKEN_LIFETIME, "proposals": PROPOSALS}
    expired = jwt.encode(payload, analysis_token._key(), algorithm="HS256")
    with pytest.raises(InvalidAnalysisToken):
        read_token(expired, 7)


def test_a_changed_token_is_rejected():
    token = create_token(7, PROPOSALS)
    head, body, signature = token.split(".")
    forged_body = jwt.utils.base64url_encode(
        b'{"typ":"interest-analysis","uid":7,"exp":9999999999,"iat":1,"proposals":[{"key":"p1","interest_id":1}]}'
    ).decode()
    for bad in (f"{head}.{forged_body}.{signature}", token[:-2] + "xx", "inte.en.token", "", token + "x"):
        with pytest.raises(InvalidAnalysisToken):
            read_token(bad, 7)


def test_a_token_signed_with_another_secret_is_rejected(monkeypatch):
    token = create_token(7, PROPOSALS)
    monkeypatch.setattr(settings, "jwt_secret", "en-helt-annan-hemlighet-0123456789")
    with pytest.raises(InvalidAnalysisToken):
        read_token(token, 7)


def test_a_login_token_is_not_accepted_as_a_seal():
    with pytest.raises(InvalidAnalysisToken):
        read_token(create_access_token(7), 7)


def test_a_seal_is_not_accepted_as_a_login_token():
    # Det har ingen "sub", och är signerat med en annan nyckel än inloggningen.
    token = create_token(7, PROPOSALS)
    assert "sub" not in jwt.decode(token, options={"verify_signature": False})
    with pytest.raises(jwt.InvalidTokenError):
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def test_a_token_made_with_the_login_key_and_the_right_claims_is_still_rejected():
    now = datetime.now(timezone.utc)
    payload = {"typ": "interest-analysis", "uid": 7, "iat": now, "exp": now + TOKEN_LIFETIME, "proposals": PROPOSALS}
    forged = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidAnalysisToken):
        read_token(forged, 7)


@pytest.mark.parametrize("missing", ["exp", "iat", "uid", "typ"])
def test_a_token_missing_a_required_claim_is_rejected(missing):
    now = datetime.now(timezone.utc)
    payload = {"typ": "interest-analysis", "uid": 7, "iat": now, "exp": now + TOKEN_LIFETIME, "proposals": PROPOSALS}
    del payload[missing]
    with pytest.raises(InvalidAnalysisToken):
        read_token(jwt.encode(payload, analysis_token._key(), algorithm="HS256"), 7)


@pytest.mark.parametrize("claims", [{"typ": "login"}, {"proposals": "inte en lista"}, {"proposals": None}, {"uid": "7"}])
def test_a_token_with_the_wrong_kind_of_claims_is_rejected(claims):
    now = datetime.now(timezone.utc)
    payload = {"typ": "interest-analysis", "uid": 7, "iat": now, "exp": now + TOKEN_LIFETIME, "proposals": PROPOSALS, **claims}
    with pytest.raises(InvalidAnalysisToken):
        read_token(jwt.encode(payload, analysis_token._key(), algorithm="HS256"), 7)


def test_the_algorithm_none_is_not_accepted():
    now = datetime.now(timezone.utc)
    payload = {"typ": "interest-analysis", "uid": 7, "iat": now, "exp": now + TOKEN_LIFETIME, "proposals": PROPOSALS}
    unsigned = jwt.encode(payload, key="", algorithm="none")
    with pytest.raises(InvalidAnalysisToken):
        read_token(unsigned, 7)


def test_without_a_secret_no_token_can_be_made_or_read(monkeypatch):
    token = create_token(7, PROPOSALS)
    monkeypatch.setattr(settings, "jwt_secret", "")
    with pytest.raises(AnalysisTokenUnavailable):
        create_token(7, PROPOSALS)
    with pytest.raises(AnalysisTokenUnavailable):
        read_token(token, 7)
