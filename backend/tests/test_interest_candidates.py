"""Kandidatfiltret (app/services/interest_candidates.py): vilka intressen AI:n får se för oklara taggar. Inga riktiga anrop:
OpenAI ersätts av en falsk Embedder, och SQLite lagrar vektorerna som JSON."""

import pytest
from sqlalchemy.exc import ProgrammingError

from app.core.config import settings
from app.crud.interest import load_library_index
from app.models.interest import Interest
from app.models.interest_embedding import InterestEmbedding
from app.services import interest_candidates as candidates
from app.services.ai_clients import AIFailed, set_clients
from app.services.interest_candidates import CandidateFinder, local_candidate_ids
from app.services.interest_matching import LibraryIndex, LibraryItem, Tag
from tests.fakes import FakeEmbedder

TEXT = "Jag gillar att sticka sockor"


def make(db, name, parent=None, aliases=None):
    interest = Interest(name=name, slug=name.lower().replace(" ", "-"), parent_id=parent.id if parent else None, aliases=aliases)
    db.add(interest)
    db.flush()
    return interest


@pytest.fixture
def world(db):
    """Tre huvudområden med intressen under. Vektorerna i tre dimensioner: stickning och virkning nära varandra, löpning och
    bouldering nära varandra, musik för sig."""
    skapande, sport, musik = make(db, "Skapande"), make(db, "Sport och träning"), make(db, "Musik")
    stickning = make(db, "Stickning", skapande, aliases="sticka")
    virkning = make(db, "Virkning", skapande)
    sockor = make(db, "Sockor", stickning)  # nivå 3
    lopning = make(db, "Löpning", sport, aliases="springa")
    bouldering = make(db, "Bouldering", sport)
    jazz = make(db, "Jazz", musik)
    metal = make(db, "Metal", musik)
    vectors = {
        stickning: [1.0, 0.0, 0.0], virkning: [0.9, 0.1, 0.0], sockor: [0.95, 0.0, 0.05],
        lopning: [0.0, 1.0, 0.0], bouldering: [0.0, 0.9, 0.1],
        jazz: [0.0, 0.0, 1.0], metal: [0.05, 0.0, 1.0],
        skapande: [0.4, 0.4, 0.4], sport: [0.4, 0.4, 0.4], musik: [0.4, 0.4, 0.4],  # områden är generella: ingen tydlig riktning
    }
    for interest, vector in vectors.items():
        db.add(InterestEmbedding(interest_id=interest.id, embedding=vector, embedding_hash="x"))
    db.commit()
    return {i.name: i for i in vectors}


def names(db, ids):
    return {db.get(Interest, i).name for i in ids}


def finder(db, **kwargs):
    embedder = FakeEmbedder(vectors={"stickade sockor": [1.0, 0.0, 0.0], TEXT: [0.95, 0.05, 0.0], "okänt": [0.0, 0.0, 1.0]})
    return CandidateFinder(db, embedder=embedder, **kwargs), embedder


# ---------- Vilka som väljs ----------


def test_the_nearest_to_the_tag_and_the_text_are_chosen_with_every_area_and_the_parents(db, world):
    index = load_library_index(db)
    find, _ = finder(db, per_tag=2, for_text=2)
    chosen = find([Tag("t1", "stickade sockor")], TEXT, index)
    result = names(db, chosen)
    assert {"Stickning", "Sockor", "Skapande"} <= result  # de närmaste, och Sockors föräldrar
    assert {"Skapande", "Sport och träning", "Musik"} <= result  # alla huvudområden, alltid
    assert not result & {"Jazz", "Metal", "Bouldering", "Löpning"}  # det som ligger långt bort visas inte


def test_the_embedder_is_called_once_with_the_tags_and_the_whole_text(db, world):
    index = load_library_index(db)
    find, embedder = finder(db)
    find([Tag("t1", "stickade sockor"), Tag("t2", "okänt")], TEXT, index)
    assert embedder.calls == [["stickade sockor", "okänt", TEXT]]


def test_a_name_or_alias_in_the_library_is_chosen_even_when_the_vectors_say_it_is_far_away(db, world):
    index = load_library_index(db)
    find, _ = finder(db, per_tag=1, for_text=1)
    # "okänt" ligger nära musik i vektorerna, men aliaset "springa" ger Löpning lokalt
    chosen = find([Tag("t1", "okänt", aliases=("springa",))], "okänt", index)
    assert {"Löpning", "Sport och träning"} <= names(db, chosen)


def test_the_closest_of_each_tag_come_before_the_second_closest_of_any(db, world):
    index = load_library_index(db)
    embedder = FakeEmbedder(vectors={"a": [1.0, 0.0, 0.0], "b": [0.0, 0.0, 1.0], "text": [0.0, 1.0, 0.0]})
    find = CandidateFinder(db, embedder=embedder, per_tag=1, for_text=1, maximum=3 + 2)  # tre huvudområden och plats för två
    chosen = names(db, find([Tag("t1", "a"), Tag("t2", "b")], "text", index))
    assert {"Stickning", "Jazz"} <= chosen  # den närmaste för a och för b
    assert "Löpning" not in chosen  # hela textens närmaste kom efter, och fick inte plats


def test_no_more_than_the_maximum_is_chosen_and_the_areas_and_the_best_stay(db, world):
    index = load_library_index(db)
    find, _ = finder(db, per_tag=5, for_text=10, maximum=5)
    chosen = names(db, find([Tag("t1", "stickade sockor")], TEXT, index))
    assert len(chosen) <= 5
    assert {"Skapande", "Sport och träning", "Musik"} <= chosen and "Stickning" in chosen


def test_the_parents_of_every_candidate_come_with_so_the_model_can_place_a_new_interest(db, world):
    index = load_library_index(db)
    find, _ = finder(db, per_tag=1, for_text=1)
    chosen = names(db, find([Tag("t1", "stickade sockor")], TEXT, index))
    assert "Sockor" in chosen and "Stickning" in chosen and "Skapande" in chosen  # Sockor ligger på nivå 3


# ---------- Reservvägen: hela biblioteket ----------


def test_no_vectors_yet_means_the_whole_library(db, world):
    db.query(InterestEmbedding).delete()
    db.commit()
    find, _ = finder(db)
    assert find([Tag("t1", "stickade sockor")], TEXT, load_library_index(db)) is None


def test_a_failing_embedding_call_means_the_whole_library(db, world):
    find = CandidateFinder(db, embedder=FakeEmbedder(error=AIFailed("URLError")))
    assert find([Tag("t1", "stickade sockor")], TEXT, load_library_index(db)) is None


def test_no_key_means_the_whole_library(db, world, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    set_clients()
    assert CandidateFinder(db)([Tag("t1", "stickade sockor")], TEXT, load_library_index(db)) is None


def test_a_missing_table_means_the_whole_library_and_the_session_is_rolled_back(db, world, monkeypatch):
    # Koden kan vara utrullad före migrationen. I Postgres måste transaktionen rullas tillbaka efter felet.
    rolled_back = []

    def table_missing(*args, **kwargs):
        raise ProgrammingError("SELECT ...", {}, Exception('relation "interest_embeddings" does not exist'))

    monkeypatch.setattr(candidates, "nearest_interests", table_missing)
    monkeypatch.setattr(db, "rollback", lambda: rolled_back.append(True))
    find, _ = finder(db)
    assert find([Tag("t1", "stickade sockor")], TEXT, load_library_index(db)) is None
    assert rolled_back == [True]


# ---------- Den lokala delen ----------


def item(id, name, aliases=(), parent=None, level=1, path=()):
    return LibraryItem(id, name, tuple(aliases), parent, level, tuple(path))


@pytest.fixture
def small_index():
    return LibraryIndex(
        [
            item(1, "Skapande"),
            item(2, "Stickning", ["sticka", "handarbete"], 1, 2, ["Skapande"]),
            item(3, "Löpning", ["springa"], 1, 2, ["Skapande"]),
            item(4, "Inomhusklättring", [], 1, 2, ["Skapande"]),
        ]
    )


@pytest.mark.parametrize(
    "tag, expected",
    [
        (Tag("t1", "Stickning"), [2]),  # namnet
        (Tag("t1", "stickade sockor"), [2]),  # grundformen sticka (alias) ur "stickade"
        (Tag("t1", "springer"), [3]),  # springer -> springa
        (Tag("t1", "klättring"), [4]),  # delsträng i ett längre namn
        (Tag("t1", "kaktusar"), []),
        (Tag("t1", "okänt", aliases=("handarbete",)), [2]),  # aliaset i taggen
    ],
)
def test_the_local_candidates(small_index, tag, expected):
    assert local_candidate_ids(tag, small_index) == expected
