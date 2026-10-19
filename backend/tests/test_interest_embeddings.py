"""Embeddings för intressena (app/services/interest_embeddings.py och app/sync_embeddings.py). Inga riktiga anrop:
OpenAI ersätts av en falsk Embedder."""

import pytest
from sqlalchemy.dialects import postgresql

from app import sync_embeddings, sync_interests
from app.core.config import settings
from app.models.interest import Interest
from app.models.interest_embedding import EMBEDDING_DIMENSIONS, InterestEmbedding
from app.services import interest_embeddings as embeddings
from app.services.ai_clients import AIFailed, set_clients
from app.services.interest_embeddings import (
    count_missing,
    embed_interest,
    embedding_text,
    fill_embeddings,
    fill_embeddings_report,
    interests_to_embed,
    nearest_interests,
    text_hash,
)
from tests.fakes import FakeEmbedder


@pytest.fixture
def library(db):
    """Sport och träning (område) > Löpning (alias springa, jogga) och Bouldering. Ett inaktivt intresse och ett väntande."""
    sport = Interest(name="Sport och träning", slug="sport")
    db.add(sport)
    db.flush()
    lopning = Interest(name="Löpning", slug="lopning", parent_id=sport.id, description="Springa för nöjes skull.", aliases="springa\njogga")
    bouldering = Interest(name="Bouldering", slug="bouldering", parent_id=sport.id)
    gammalt = Interest(name="Gammalt", slug="gammalt", status="inactive")
    vantar = Interest(name="Väntar", slug="vantar", status="pending")
    db.add_all([lopning, bouldering, gammalt, vantar])
    db.commit()
    return {"sport": sport, "lopning": lopning, "bouldering": bouldering, "gammalt": gammalt, "vantar": vantar}


def stored(db, interest):
    """Intressets rad i vektortabellen, eller None."""
    return db.get(InterestEmbedding, interest.id)


# ---------- Texten och hashen ----------


def test_the_text_is_the_name_the_description_and_the_aliases(library):
    assert embedding_text(library["lopning"]) == "Löpning. Springa för nöjes skull. Även kallat: springa, jogga"


def test_a_plain_interest_is_just_its_name(library):
    assert embedding_text(library["bouldering"]) == "Bouldering"


def test_the_parents_name_is_not_part_of_the_text(library):
    assert "Sport och träning" not in embedding_text(library["lopning"])


def test_the_hash_changes_with_the_text(library):
    assert text_hash("Löpning") != text_hash("Löpning.")
    assert text_hash("Löpning") == text_hash("Löpning")


def test_the_hash_changes_with_the_model_and_the_size(monkeypatch):
    before = text_hash("Löpning")
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "en-annan-modell")
    assert text_hash("Löpning") != before
    monkeypatch.undo()
    monkeypatch.setattr(embeddings, "EMBEDDING_DIMENSIONS", 512)
    assert text_hash("Löpning") != before


# ---------- Vad som behöver räknas ----------


def test_every_interest_without_a_vector_needs_one_except_the_inactive(library):
    names = {interest.name for interest, _ in interests_to_embed(library_db(library))}
    assert names == {"Sport och träning", "Löpning", "Bouldering", "Väntar"}


def library_db(library):
    from sqlalchemy.orm import object_session

    return object_session(library["sport"])


def test_an_interest_with_an_up_to_date_vector_is_left_alone_and_a_changed_one_is_counted(db, library):
    fill_embeddings(db, FakeEmbedder())
    assert count_missing(db) == 0
    library["lopning"].description = "Något helt annat."
    db.commit()
    assert [interest.name for interest, _ in interests_to_embed(db)] == ["Löpning"]


# ---------- Att fylla i ----------


def test_the_missing_vectors_are_calculated_in_one_call_and_saved_with_their_hash(db, library):
    embedder = FakeEmbedder()
    assert fill_embeddings(db, embedder) == 4
    assert len(embedder.calls) == 1 and len(embedder.calls[0]) == 4
    lopning = stored(db, library["lopning"])
    assert len(lopning.embedding) == EMBEDDING_DIMENSIONS
    assert lopning.embedding_hash == text_hash(embedding_text(library["lopning"]))
    assert stored(db, library["gammalt"]) is None  # inaktiva räknas inte


def test_a_second_run_calls_nothing(db, library):
    fill_embeddings(db, FakeEmbedder())
    again = FakeEmbedder()
    assert fill_embeddings(db, again) == 0
    assert again.calls == []


def test_only_the_changed_interest_is_recalculated(db, library):
    fill_embeddings(db, FakeEmbedder())
    library["lopning"].aliases = "springa\njogga\nlöpträning"
    db.commit()
    embedder = FakeEmbedder()
    assert fill_embeddings(db, embedder) == 1
    assert embedder.calls == [["Löpning. Springa för nöjes skull. Även kallat: springa, jogga, löpträning"]]
    assert db.query(InterestEmbedding).count() == 4  # raden uppdaterades, ingen ny lades till
    assert stored(db, library["lopning"]).embedding_hash == text_hash(embedding_text(library["lopning"]))


def test_a_failed_call_saves_nothing(db, library):
    with pytest.raises(AIFailed):
        fill_embeddings(db, FakeEmbedder(error=AIFailed("URLError")))
    assert count_missing(db) == 4


def test_the_report_says_what_happened_without_raising(db, library, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    set_clients()  # ingen falsk, och ingen nyckel
    ok, message = fill_embeddings_report(db)
    assert not ok and "OPENAI_API_KEY" in message
    ok, message = fill_embeddings_report(db, FakeEmbedder(error=AIFailed("URLError")))
    assert not ok and "URLError" in message
    ok, message = fill_embeddings_report(db, FakeEmbedder())
    assert ok and "4" in message
    assert fill_embeddings_report(db, FakeEmbedder()) == (True, "Alla intressen har redan en aktuell vektor.")


# ---------- Ett nytt intresse ----------


def test_a_new_interest_gets_a_vector(db, library):
    nytt = Interest(name="Tomater", slug=None, parent_id=library["sport"].id)
    db.add(nytt)
    db.flush()
    assert embed_interest(db, nytt, FakeEmbedder()) is True
    row = stored(db, nytt)
    assert len(row.embedding) == EMBEDDING_DIMENSIONS and row.embedding_hash == text_hash("Tomater")


def test_a_failing_embedding_never_stops_the_interest_from_being_saved(db, library):
    nytt = Interest(name="Tomater", parent_id=library["sport"].id)
    db.add(nytt)
    db.flush()
    assert embed_interest(db, nytt, FakeEmbedder(error=AIFailed("URLError"))) is False
    db.commit()
    assert db.get(Interest, nytt.id) is not None and stored(db, nytt) is None  # sparat, och nästa synk fyller i det


def test_no_key_means_no_vector_but_no_error(db, library, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    set_clients()
    nytt = Interest(name="Tomater", parent_id=library["sport"].id)
    db.add(nytt)
    db.flush()
    assert embed_interest(db, nytt) is False


# ---------- De närmaste ----------


@pytest.fixture
def placed(db, library):
    """Vektorer i tre dimensioner (SQLite lagrar dem som JSON): Löpning och Bouldering nära varandra, Sport längre bort."""
    vectors = {"lopning": [1.0, 0.0, 0.0], "bouldering": [0.9, 0.1, 0.0], "sport": [0.0, 1.0, 0.0], "vantar": [0.95, 0.05, 0.0], "gammalt": [1.0, 0.0, 0.0]}
    for key, vector in vectors.items():
        db.add(InterestEmbedding(interest_id=library[key].id, embedding=vector, embedding_hash="x"))
    db.commit()
    return library


def test_the_nearest_come_first_with_their_similarity(db, placed):
    result = nearest_interests(db, [1.0, 0.0, 0.0], limit=10)
    assert [interest.name for interest, _ in result] == ["Löpning", "Bouldering", "Sport och träning"]
    assert result[0][1] == pytest.approx(1.0) and result[2][1] == pytest.approx(0.0)


def test_only_the_asked_for_number_is_returned(db, placed):
    assert [i.name for i, _ in nearest_interests(db, [1.0, 0.0, 0.0], limit=1)] == ["Löpning"]


def test_inactive_and_pending_are_left_out_unless_asked_for(db, placed):
    assert "Väntar" not in {i.name for i, _ in nearest_interests(db, [1.0, 0.0, 0.0])}
    assert "Gammalt" not in {i.name for i, _ in nearest_interests(db, [1.0, 0.0, 0.0], statuses=("active", "pending"))}
    assert "Väntar" in {i.name for i, _ in nearest_interests(db, [1.0, 0.0, 0.0], statuses=("active", "pending"))}


def test_an_interest_can_be_excluded_and_one_without_a_vector_is_skipped(db, placed):
    db.query(InterestEmbedding).filter_by(interest_id=placed["bouldering"].id).delete()
    db.commit()
    result = nearest_interests(db, [1.0, 0.0, 0.0], exclude_ids={placed["lopning"].id})
    assert [i.name for i, _ in result] == ["Sport och träning"]


def test_in_postgres_the_search_is_done_by_the_database_with_the_cosine_operator_and_never_returns_the_vectors():
    # Testerna körs i SQLite, så här ses bara frågan som skulle skickas till Postgres (Neon), utan att något körs.
    from sqlalchemy import create_mock_engine
    from sqlalchemy.orm import Session

    session = Session(bind=create_mock_engine("postgresql+psycopg2://", lambda *a, **k: None))
    query = embeddings.nearest_in_postgres(session, [0.1, 0.2, 0.3], 5, ("active",), {7})
    sql = str(query.statement.compile(dialect=postgresql.dialect()))
    assert "interest_embeddings.embedding <=>" in sql and "ORDER BY" in sql and "LIMIT" in sql
    assert "JOIN interest_embeddings" in sql and "interests.id NOT IN" in sql and "interests.status IN" in sql
    selected = sql.split("FROM")[0]
    assert "interest_embeddings.embedding," not in selected and "AS distance" in selected  # bara avståndet, inte vektorn


# ---------- Vektorerna följer inte med när intressen läses ----------


def test_the_vectors_live_in_their_own_table_so_reading_interests_never_touches_them(db, library):
    fill_embeddings(db, FakeEmbedder())
    assert InterestEmbedding.__tablename__ == "interest_embeddings"
    statement = str(db.query(Interest).filter(Interest.status == "active").statement)
    assert "interest_embeddings" not in statement and "vector" not in statement.lower()
    assert not any(column.name == "embedding" and column.table.name == "interests" and "Vector" in type(column.type).__name__
                   for column in Interest.__table__.columns)


def test_looking_for_what_is_missing_does_not_read_any_vectors(db, library):
    fill_embeddings(db, FakeEmbedder())
    queries = []
    from sqlalchemy import event

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def record(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    try:
        assert count_missing(db) == 0
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", record)
    assert queries and all("interest_embeddings.embedding " not in q and "interest_embeddings.embedding," not in q for q in queries)


# ---------- Skriptet ----------


def test_the_script_can_just_check_how_many_are_missing(db, library):
    ok, message = sync_embeddings.run(db, check_only=True)
    assert ok and message == "4 intressen saknar vektor eller har en gammal."
    assert count_missing(db) == 4  # inget ändrades


def test_the_script_fills_in_what_is_missing(db, library):
    set_clients(embedder=FakeEmbedder())
    ok, message = sync_embeddings.run(db)
    assert ok and "4" in message and count_missing(db) == 0


def test_the_script_says_so_when_there_is_nothing_to_do(db, library):
    set_clients(embedder=FakeEmbedder())
    sync_embeddings.run(db)
    assert sync_embeddings.run(db) == (True, "Alla intressen har redan en aktuell vektor.")


def test_the_library_sync_gives_new_interests_a_vector_and_says_so(db, monkeypatch, capsys):
    class Session:  # synken stänger sin session, men testets session ska leva vidare
        def __getattr__(self, name):
            return getattr(db, name)

        def close(self):
            pass

    monkeypatch.setattr(sync_interests, "SessionLocal", Session)
    set_clients(embedder=FakeEmbedder())
    sync_interests.main()
    out = capsys.readouterr().out
    assert "Intressebiblioteket" in out and "Vektorer:" in out
    active = db.query(Interest).filter(Interest.status == "active").count()
    assert active > 0 and db.query(InterestEmbedding).count() == active


def test_the_library_sync_is_still_done_when_embeddings_are_not_possible(db, monkeypatch, capsys):
    class Session:
        def __getattr__(self, name):
            return getattr(db, name)

        def close(self):
            pass

    monkeypatch.setattr(sync_interests, "SessionLocal", Session)
    set_clients(embedder=FakeEmbedder(error=AIFailed("URLError")))
    sync_interests.main()
    out = capsys.readouterr().out
    assert "Vektorer:" in out and "misslyckades" in out
    assert db.query(Interest).filter(Interest.status == "active").count() > 0  # biblioteket synkades ändå
    assert db.query(InterestEmbedding).count() == 0
