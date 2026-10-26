"""Vektorn för Om mig-texten (services/profile_embeddings.py och models/profile_embedding.py). Inga riktiga anrop: OpenAI
ersätts av en falsk Embedder."""

import pytest

from app import sync_embeddings
from app.core.config import settings
from app.models import Interest, Profile, ProfileEmbedding, User
from app.services.ai_clients import AIFailed, set_clients
from app.services.analysis_token import create_token
from app.services.interest_embeddings import text_hash
from app.services.profile_embeddings import (
    count_missing_profiles,
    fill_profile_embeddings,
    start_embedding,
    store_profile_embedding,
)
from tests.fakes import FakeEmbedder, fake_vector
from tests.helpers import make_profile

COMPLETE = "/profile/interview/complete"
ALLOWED = ["lyssna", "spela", "skapa", "besoka"]
PROFILE = {"name": "Nicklas", "birth_date": "1990-01-01", "gender": "man", "municipality_code": "1480", "profile_text": "Jag är snäll."}


@pytest.fixture
def music(db):
    interest = Interest(name="Musik", slug="musik", activities=list(ALLOWED))
    db.add(interest)
    db.commit()
    return interest


def complete(client, user, music, **overrides):
    claims = [{"key": "p1", "interest_id": music.id, "activity": "", "allowed": list(ALLOWED)}]
    batch = {"token": create_token(user.id, claims), "items": [{"key": "p1"}]}
    return client.post(COMPLETE, json={**PROFILE, "batches": [batch], **overrides})


def rows(db):
    return db.query(ProfileEmbedding).all()


def a_profile(db, user_id=1, text="Första texten."):
    if db.get(User, user_id) is None:
        db.add(User(id=user_id, username=f"person{user_id}", password_hash="unused"))
        db.flush()
    profile = make_profile(user_id, profile_text=text)
    db.add(profile)
    db.commit()
    return profile


# ---------- Intervjun ----------


def test_the_interview_saves_a_vector_for_the_about_me_text(client, user, municipalities, music, db):
    embedder = FakeEmbedder()
    set_clients(embedder=embedder)
    assert complete(client, user, music).status_code == 201
    (row,) = rows(db)
    assert row.profile_id == db.query(Profile).one().id
    assert row.embedding == fake_vector("Jag är snäll.") and row.embedding_hash == text_hash("Jag är snäll.")
    assert embedder.calls == [["Jag är snäll."]]  # ett anrop, och bara texten


def test_a_failing_embedding_call_still_saves_the_profile_without_a_vector(client, user, municipalities, music, db):
    set_clients(embedder=FakeEmbedder(error=AIFailed("URLError")))
    assert complete(client, user, music).status_code == 201
    assert db.query(Profile).count() == 1 and rows(db) == []


def test_no_key_means_no_vector_and_no_error(client, user, municipalities, music, db, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    assert complete(client, user, music).status_code == 201
    assert db.query(Profile).count() == 1 and rows(db) == []


def test_a_text_that_is_not_allowed_saves_neither_the_profile_nor_a_vector(client, user, municipalities, music, db):
    set_clients(embedder=FakeEmbedder())
    response = complete(client, user, music, profile_text="Jag är pedofil.")
    assert response.status_code == 422
    assert db.query(Profile).count() == 0 and rows(db) == []


# ---------- När texten ändras ----------


def test_a_new_text_replaces_the_old_vector(db, user):
    embedder = FakeEmbedder()
    profile = a_profile(db)
    assert store_profile_embedding(db, profile, start_embedding(profile.profile_text, embedder))
    profile.profile_text = "Andra texten."
    db.commit()
    assert store_profile_embedding(db, profile, start_embedding(profile.profile_text, embedder))
    (row,) = rows(db)  # bara en rad: den gamla är borta
    assert row.embedding == fake_vector("Andra texten.") and row.embedding_hash == text_hash("Andra texten.")


def test_the_same_text_keeps_its_vector_and_needs_no_new_call(db, user):
    embedder = FakeEmbedder()
    profile = a_profile(db)
    store_profile_embedding(db, profile, start_embedding(profile.profile_text, embedder))
    calls = len(embedder.calls)
    assert store_profile_embedding(db, profile, None)  # inget väntat resultat behövs
    assert len(embedder.calls) == calls and len(rows(db)) == 1


def test_a_new_text_whose_embedding_fails_leaves_no_old_vector_behind(db, user):
    profile = a_profile(db)
    store_profile_embedding(db, profile, start_embedding(profile.profile_text, FakeEmbedder()))
    profile.profile_text = "Andra texten."
    db.commit()
    broken = start_embedding(profile.profile_text, FakeEmbedder(error=AIFailed("URLError")))
    assert store_profile_embedding(db, profile, broken) is False
    assert rows(db) == []  # en gammal vektor hör till en text som inte längre finns


def test_a_vector_counted_for_another_text_is_never_saved(db, user):
    profile = a_profile(db, text="Texten som sparades.")
    wrong = start_embedding("En annan text.", FakeEmbedder())
    assert store_profile_embedding(db, profile, wrong) is False and rows(db) == []


def test_a_missing_table_never_breaks_saving_and_leaves_the_session_usable(db, user):
    profile = a_profile(db)
    ProfileEmbedding.__table__.drop(db.get_bind())  # koden utrullad före migrationen
    assert store_profile_embedding(db, profile, start_embedding(profile.profile_text, FakeEmbedder())) is False
    assert db.query(Profile).count() == 1


def test_deleting_the_profile_deletes_its_vector(db, user):
    profile = a_profile(db)
    store_profile_embedding(db, profile, start_embedding(profile.profile_text, FakeEmbedder()))
    db.delete(profile)
    db.commit()
    assert rows(db) == []


# ---------- Synken ----------


def test_the_sync_fills_in_missing_and_old_vectors_and_then_calls_nothing(db):
    for user_id in (1, 2, 3):
        a_profile(db, user_id, f"Text {user_id}.")
    embedder = FakeEmbedder()
    assert count_missing_profiles(db) == 3
    assert fill_profile_embeddings(db, embedder) == 3 and len(rows(db)) == 3
    assert embedder.calls == [["Text 1.", "Text 2.", "Text 3."]]  # ett enda anrop
    db.query(Profile).filter_by(user_id=2).one().profile_text = "Ny text 2."
    db.commit()
    assert count_missing_profiles(db) == 1 and fill_profile_embeddings(db, embedder) == 1
    assert len(rows(db)) == 3 and fill_profile_embeddings(db, embedder) == 0
    assert len(embedder.calls) == 2


def test_sync_embeddings_reports_profiles_too(db, capsys):
    a_profile(db, 1, "Text 1.")
    set_clients(embedder=FakeEmbedder())
    assert sync_embeddings.run(db, check_only=True) == (True, "0 intressen saknar vektor eller har en gammal. 1 profiler saknar vektor eller har en gammal.")
    ok, message = sync_embeddings.run(db)
    assert ok and message == "Alla intressen har redan en aktuell vektor. 1 profiler fick en vektor."
    assert sync_embeddings.run(db) == (True, "Alla intressen har redan en aktuell vektor.")


def test_sync_embeddings_survives_a_missing_profile_table(db):
    ProfileEmbedding.__table__.drop(db.get_bind())
    ok, message = sync_embeddings.run(db)
    assert ok and "alembic upgrade head" in message
