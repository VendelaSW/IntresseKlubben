"""Tester för intressebiblioteket (app/data/interests.json) och synken som för
in det i databasen (app/crud/interest_library.py)."""

import importlib.util
from pathlib import Path

import pytest

from app.crud.interest import allowed_activities
from app.crud.interest_library import (
    LibraryEntry,
    LibraryError,
    load_activities,
    load_library,
    parse_library,
    slugify,
    sync_library,
)
from app.models import Interest

VERSIONS = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _migration(filename):
    spec = importlib.util.spec_from_file_location(filename, VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- Filen i repot ---------------------------------------------------------------


def test_the_library_file_is_valid():
    # Fäller PR:en om någon har skrivit in en dubblett, en förälder som inte
    # finns, en cirkel, en fjärde nivå, en aktivitet som inte finns i listan
    # eller ett alias som pekar på två intressen.
    assert len(load_library()) > 0
    assert len(load_activities()) > 0


def test_a_specific_interest_in_the_file_inherits_its_activities(db):
    # Hela filen, så att arvet prövas mot det riktiga trädet: Pokémon TCG har
    # ingen egen lista och får Kortspels.
    sync_library(db, load_library())

    def activities(slug):
        return allowed_activities(db.query(Interest).filter_by(slug=slug).one())

    assert activities("pokemon-tcg") == activities("kortspel") == ["spela", "samla", "tavla"]
    assert activities("spel-och-pussel") == []


def test_every_interest_people_already_have_is_in_the_library():
    # Dagens intressen (från seed-migrationen) får sin slug av migrationen
    # d2f8a6c41b07. Finns slugen i biblioteket känner synken igen dem, och
    # användarnas, klubbarnas och eventens kopplingar ligger kvar. Gaming slås
    # ihop med Tv-spel och ska inte finnas kvar.
    seeded = _migration("c4d8e2a91f67_seed_interests_and_index.py").INTERESTS
    rename = _migration("d2f8a6c41b07_interest_library.py")._slugify
    slugs = {entry.slug for entry in load_library()}
    assert {rename(name) for name in seeded} - slugs == {"gaming"}


def test_slugify_is_the_same_in_the_app_and_the_migration():
    rename = _migration("d2f8a6c41b07_interest_library.py")._slugify
    for name in ["Klättring", "Tv-spel", "Måla och teckna", "3D-utskrift", "Rollspel (RPG)"]:
        assert slugify(name) == rename(name)


# --- Kontrollen av filen ------------------------------------------------------------


def _parse(*interests, activities=()):
    listed = [{"slug": slug, "label": slug.capitalize()} for slug in activities]
    return parse_library({"activities": listed, "interests": list(interests)})


def test_parse_puts_parents_before_children():
    entries = _parse(
        {"slug": "traillopning", "name": "Traillöpning", "parent": "lopning"},
        {"slug": "lopning", "name": "Löpning", "parent": "sport"},
        {"slug": "sport", "name": "Sport", "aliases": ["idrott", " "]},
    )
    assert [e.slug for e in entries] == ["sport", "lopning", "traillopning"]
    assert entries[0].aliases == ["idrott"]


@pytest.mark.parametrize(
    ("interests", "problem"),
    [
        ([{"slug": "a", "name": "A"}, {"slug": "a", "name": "A igen"}], "finns flera gånger"),
        ([{"slug": "a", "name": "A", "parent": "saknas"}], "som inte finns"),
        ([{"slug": "a", "name": "A", "parent": "b"}, {"slug": "b", "name": "B", "parent": "a"}], "cirkel"),
        ([{"slug": "Stora Bokstäver", "name": "A"}], "Ogiltig slug"),
        ([{"name": "Utan slug"}], "saknar slug"),
        ([{"slug": "a", "name": "A", "activities": ["odla"]}], "inte finns i aktivitetslistan"),
        ([{"slug": "a", "name": "A", "activities": ["spela", "spela"]}], "samma aktivitet flera gånger"),
        (
            [{"slug": "a", "name": "A", "aliases": ["springa"]}, {"slug": "b", "name": "B", "aliases": ["Springa"]}],
            "finns på både",
        ),
        ([{"slug": "a", "name": "Löpning"}, {"slug": "b", "name": "B", "aliases": ["löpning"]}], "är namnet på"),
        (
            [
                {"slug": "a", "name": "A"},
                {"slug": "b", "name": "B", "parent": "a"},
                {"slug": "c", "name": "C", "parent": "b"},
                {"slug": "d", "name": "D", "parent": "c"},
            ],
            "högst 3 nivåer",
        ),
    ],
)
def test_parse_rejects_a_broken_library(interests, problem):
    with pytest.raises(LibraryError, match=problem):
        _parse(*interests, activities=["spela"])


def test_parse_keeps_the_difference_between_no_list_and_an_empty_list():
    # Ingen lista = ärver förälderns. Tom lista = uttryckligen inga aktiviteter.
    entries = _parse(
        {"slug": "spel", "name": "Spel", "activities": ["spela"]},
        {"slug": "kortspel", "name": "Kortspel", "parent": "spel"},
        {"slug": "pussel", "name": "Pussel", "parent": "spel", "activities": []},
        activities=["spela"],
    )
    assert {e.slug: e.activities for e in entries} == {"spel": ["spela"], "kortspel": None, "pussel": []}


# --- Synken ----------------------------------------------------------------------


def _entries(*items):
    return [LibraryEntry(**item) for item in items]


def test_sync_adds_the_tree(db):
    result = sync_library(db, _entries(
        {"slug": "sport", "name": "Sport"},
        {"slug": "lopning", "name": "Löpning", "parent": "sport", "aliases": ["springa", "jogga"]},
    ))
    assert (result.added, result.updated, result.deactivated) == (2, 0, 0)
    running = db.query(Interest).filter_by(slug="lopning").one()
    assert running.parent.name == "Sport"
    assert running.aliases == "springa\njogga"
    assert (running.status, running.source) == ("active", "library")


def test_sync_twice_changes_nothing(db):
    entries = _entries({"slug": "sport", "name": "Sport"}, {"slug": "gym", "name": "Gym", "parent": "sport"})
    sync_library(db, entries)
    result = sync_library(db, entries)
    assert (result.added, result.updated, result.deactivated) == (0, 0, 0)


def test_sync_keeps_existing_interest_and_who_has_it(db, user):
    # Som efter migrationen: dagens intresse har en slug men ingen förälder än.
    knitting = Interest(name="Stickning", slug="stickning")
    db.add(knitting)
    user.interests = [knitting]
    db.commit()
    old_id = knitting.id

    result = sync_library(db, _entries(
        {"slug": "skapande", "name": "Skapande"},
        {"slug": "stickning", "name": "Stickning och virkning", "parent": "skapande"},
    ))

    assert (result.added, result.updated) == (1, 1)
    db.refresh(knitting)
    assert knitting.id == old_id
    assert knitting.name == "Stickning och virkning"
    assert knitting.parent.slug == "skapande"
    assert [i.id for i in user.interests] == [old_id]


def test_sync_never_deletes_but_deactivates_what_left_the_file(db, user):
    sync_library(db, _entries({"slug": "sport", "name": "Sport"}, {"slug": "padel", "name": "Padel"}))
    padel = db.query(Interest).filter_by(slug="padel").one()
    user.interests = [padel]
    db.commit()

    result = sync_library(db, _entries({"slug": "sport", "name": "Sport"}))

    assert result.deactivated == 1
    db.refresh(padel)
    assert padel.status == "inactive"
    assert [i.slug for i in user.interests] == ["padel"]


def test_sync_brings_back_an_interest_that_returns_to_the_file(db):
    sync_library(db, _entries({"slug": "padel", "name": "Padel"}))
    sync_library(db, _entries())
    sync_library(db, _entries({"slug": "padel", "name": "Padel"}))
    assert db.query(Interest).filter_by(slug="padel").one().status == "active"


def test_sync_does_not_touch_interests_from_suggestions(db):
    suggestion = Interest(name="Padel-tennis", slug="padel-tennis", status="pending", source="user_suggestion")
    db.add(suggestion)
    db.commit()

    result = sync_library(db, _entries({"slug": "sport", "name": "Sport"}))

    assert result.deactivated == 0
    db.refresh(suggestion)
    assert (suggestion.status, suggestion.source) == ("pending", "user_suggestion")


def test_sync_leaves_an_own_interest_active(db, user):
    # Ett eget intresse finns bara i databasen, aldrig i filen, och har ingen slug.
    sync_library(db, _entries({"slug": "skapande", "name": "Skapande"}))
    parent = db.query(Interest).filter_by(slug="skapande").one()
    own = Interest(name="Fyrmodeller", parent_id=parent.id, source="user_suggestion", created_by_user_id=user.id)
    db.add(own)
    db.commit()

    result = sync_library(db, _entries({"slug": "skapande", "name": "Skapande"}))

    assert (result.added, result.updated, result.deactivated) == (0, 0, 0)
    db.refresh(own)
    assert (own.status, own.parent_id, own.created_by_user_id) == ("active", parent.id, user.id)


# --- Aktiviteter -----------------------------------------------------------------


def _synced(db, *items):
    sync_library(db, _entries(*items))
    return {i.slug: i for i in db.query(Interest).all()}


def test_sync_saves_and_updates_activities(db):
    interests = _synced(db, {"slug": "spel", "name": "Spel"}, {"slug": "kortspel", "name": "Kortspel", "parent": "spel", "activities": ["spela"]})
    assert interests["kortspel"].activities == ["spela"]

    result = sync_library(db, _entries(
        {"slug": "spel", "name": "Spel"},
        {"slug": "kortspel", "name": "Kortspel", "parent": "spel", "activities": ["spela", "samla"]},
    ))
    assert (result.added, result.updated, result.deactivated) == (0, 1, 0)
    db.expire_all()
    assert db.query(Interest).filter_by(slug="kortspel").one().activities == ["spela", "samla"]


def test_an_interest_without_its_own_activities_gets_its_parents(db):
    interests = _synced(
        db,
        {"slug": "spel", "name": "Spel", "activities": ["spela"]},
        {"slug": "kortspel", "name": "Kortspel", "parent": "spel", "activities": ["spela", "samla"]},
        {"slug": "pokemon-tcg", "name": "Pokémon TCG", "parent": "kortspel"},
        {"slug": "schack", "name": "Schack", "parent": "spel"},
    )
    assert allowed_activities(interests["pokemon-tcg"]) == ["spela", "samla"]
    # Inget eget och inget på föräldern: huvudområdets lista är standardvärdet.
    assert allowed_activities(interests["schack"]) == ["spela"]


def test_an_empty_list_means_no_activities_even_when_the_parent_has_some(db):
    interests = _synced(
        db,
        {"slug": "spel", "name": "Spel", "activities": ["spela"]},
        {"slug": "pussel", "name": "Pussel", "parent": "spel", "activities": []},
    )
    assert allowed_activities(interests["pussel"]) == []


def test_a_main_area_never_has_an_activity_of_its_own(db):
    # Listan på ett huvudområde gäller bara det som ligger under.
    interests = _synced(db, {"slug": "spel", "name": "Spel", "activities": ["spela"]})
    assert allowed_activities(interests["spel"]) == []
