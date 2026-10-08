"""Tester för intressebiblioteket (app/data/interests.json) och synken som för
in det i databasen (app/crud/interest_library.py)."""

import importlib.util
from pathlib import Path

import pytest

from app.crud.interest_library import (
    LibraryEntry,
    LibraryError,
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
    # finns eller en cirkel.
    assert len(load_library()) > 0


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


def _parse(*interests):
    return parse_library({"interests": list(interests)})


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
    ],
)
def test_parse_rejects_a_broken_library(interests, problem):
    with pytest.raises(LibraryError, match=problem):
        _parse(*interests)


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
