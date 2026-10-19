"""Alias först: intressen som redan finns hittas utan AI (app/services/interest_shortcut.py)."""

import pytest

from app.services import interest_shortcut as shortcut
from app.services.interest_matching import LibraryIndex, LibraryItem
from app.services.interest_shortcut import has_doubt, local_tree, shortcut_tree


def item(id, name, aliases=(), parent=None, level=1, path=()):
    return LibraryItem(id, name, tuple(aliases), parent, level, tuple(path))


@pytest.fixture
def index():
    return LibraryIndex(
        [
            item(1, "Musik"),
            item(2, "Metal", ["hårdrock", "heavy metal"], 1, 2, ["Musik"]),
            item(3, "Sport och träning"),
            item(4, "Löpning", ["springa", "jogga"], 3, 2, ["Sport och träning"]),
            item(5, "Simning", ["simma"], 3, 2, ["Sport och träning"]),
            item(6, "Friluftsliv"),
            item(7, "Bad och bastu", ["bada", "badning", "bastu"], 6, 2, ["Friluftsliv"]),
            item(8, "Djur och natur"),
            item(9, "Hundar", [], 8, 2, ["Djur och natur"]),
            item(10, "Skapande"),
            item(11, "Keramik", [], 10, 2, ["Skapande"]),
            # Samma namn på två ställen på samma nivå: går inte att avgöra utan modell.
            item(12, "Fotboll", [], 3, 2, ["Sport och träning"]),
            item(13, "Fotboll", [], 8, 2, ["Djur och natur"]),
            item(14, "Sång", ["kör"], 1, 2, ["Musik"]),
        ]
    )


def names(tree):
    return [node["name"] for node in tree]


# ---------- Genvägen: hela texten är kända intressen ----------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Löpning", ["Löpning"]),
        ("löpning.", ["löpning."]),
        ("bada", ["bada"]),
        ("Hårdrock, simma och Hundar", ["Hårdrock", "simma", "Hundar"]),
        ("Löpning och keramik", ["Löpning", "keramik"]),
        ("Löpning & keramik samt hundar", ["Löpning", "keramik", "hundar"]),
        ("heavy metal / Keramik", ["heavy metal", "Keramik"]),
    ],
)
def test_a_text_that_is_only_known_interests_is_a_shortcut(index, text, expected):
    assert names(shortcut_tree(text, index)) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Jag älskar att bada",  # en mening: modellen avgör
        "Löpning och kaktusar",  # en del som inte finns
        "Fotboll",  # finns på två ställen på samma nivå: tvetydigt
        "",
        " , ; ",
        "Jag hatar löpning",  # negation
        "inte löpning",
        "Löpning, keramik, hundar, bada, simma, kör, hårdrock, bastu, musik",  # fler än 8 delar
    ],
)
def test_other_texts_are_not_a_shortcut(index, text):
    assert shortcut_tree(text, index) is None


def test_a_part_with_a_profanity_or_sensitive_word_is_never_a_shortcut(index, monkeypatch):
    monkeypatch.setattr(shortcut, "contains_profanity", lambda text: text.lower() == "keramik")
    assert shortcut_tree("Löpning och keramik", index) is None
    monkeypatch.setattr(shortcut, "contains_profanity", lambda text: False)
    monkeypatch.setattr(shortcut, "_has_sensitive_word", lambda text: text.lower() == "hundar")
    assert shortcut_tree("Löpning och hundar", index) is None


# ---------- Skyddsnätet: namn och alias i texten ----------


def test_an_alias_in_the_text_is_found_even_when_a_model_would_have_skipped_it(index):
    assert names(local_tree("Jag älskar att bada", index)) == ["Bad och bastu"]


def test_simple_forms_of_a_word_find_its_base_form(index):
    assert names(local_tree("Jag springer varje morgon och simmar på helgen", index)) == ["Löpning", "Simning"]  # springa, simma
    assert names(local_tree("Jag joggar", index)) == ["Löpning"]  # jogga
    assert names(local_tree("Jag går ut med hundarna", index)) == ["Hundar"]  # hundar


def test_the_hits_come_in_the_order_the_text_mentions_them(index):
    assert names(local_tree("Först keramik, sedan löpning och till sist hårdrock", index)) == ["Keramik", "Löpning", "Metal"]


def test_an_area_is_left_out_when_something_more_specific_in_it_was_found(index):
    assert names(local_tree("Jag gillar musik och hårdrock", index)) == ["Metal"]
    assert names(local_tree("Jag gillar musik", index)) == ["Musik"]


def test_text_that_shows_doubt_gives_nothing(index):
    assert local_tree("Jag hatar löpning", index) == []
    assert local_tree("Jag drömmer om att bada", index) == []
    assert local_tree("Jag vill lära mig simma", index) == []


def test_a_name_that_cannot_be_told_apart_is_left_out(index):
    assert local_tree("Jag gillar fotboll", index) == []


def test_at_most_a_few_hits_are_returned(index):
    text = "keramik, löpning, simma, bada, hårdrock, hundar, kör"
    assert len(local_tree(text, index)) == shortcut.MAX_SAFETY_NET


def test_a_text_without_any_known_word_gives_nothing(index):
    assert local_tree("Jag gillar kaktusar", index) == []


def test_a_word_with_a_profane_alias_is_never_returned(index, monkeypatch):
    monkeypatch.setattr(shortcut, "contains_profanity", lambda text: text == "Keramik")
    assert local_tree("Jag gillar keramik", index) == []


@pytest.mark.parametrize("text, expected", [("Jag hatar fotboll", True), ("Det här är INTE bra", True), ("Jag gillar bastu", False), ("Kanske bada", True)])
def test_doubt_words(text, expected):
    assert has_doubt(text) is expected
