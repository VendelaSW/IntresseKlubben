"""Aktivitetsfrågorna och reglerna för vilka förslag som blir kvar (app/services/interest_followups.py)."""

import pytest

from app.services.interest_followups import (
    ACTIVITY,
    GENERAL,
    GENERAL_AREA,
    MAX_FOLLOWUPS,
    NARROW,
    FollowUp,
    Option,
    drop_covered,
    followups,
    settle,
)
from app.services.interest_matching import LibraryIndex, LibraryItem, Match, Tag

LABELS = {"lyssna": "Lyssnar på", "spela": "Spelar", "skapa": "Skapar", "besoka": "Besöker", "titta": "Tittar på", "samla": "Samlar"}


def item(id, name, parent=None, level=1, path=(), activities=None):
    return LibraryItem(id, name, (), parent, level, tuple(path), activities=None if activities is None else tuple(activities))


@pytest.fixture
def index():
    return LibraryIndex(
        [
            item(1, "Musik", activities=["lyssna", "spela", "skapa", "besoka"]),
            item(2, "Metal", 1, 2, ["Musik"]),  # ärver Musiks lista
            item(3, "Jazz", 1, 2, ["Musik"]),
            item(4, "Black metal", 2, 3, ["Musik", "Metal"]),
            item(5, "Film och tv", activities=["titta"]),  # bara ett sätt
            item(6, "Skräck", 5, 2, ["Film och tv"]),
            item(7, "Spel och pussel", activities=["spela"]),
            item(8, "Kortspel", 7, 2, ["Spel och pussel"], activities=["spela", "samla"]),
            item(9, "Pokémon TCG", 8, 3, ["Spel och pussel", "Kortspel"]),  # ärver Kortspels lista
            item(10, "Ensamt område"),  # inga aktiviteter alls
            item(11, "Stilla", 1, 2, ["Musik"], activities=[]),  # uttryckligen inga
            item(12, "Fritid", activities=["spela", "samla"]),  # ett område utan underintressen
        ]
    )


def same(interest_id, key="t1", name="x", activity=""):
    return Match(Tag(key, name), "same", interest_id=interest_id, activity=activity)


def new(parent_id, key="t1", name="nytt", activity=""):
    return Match(Tag(key, name), "new", name=name, parent_id=parent_id, activity=activity)


def none(key="t1"):
    return Match(Tag(key, "x"), "none")


def kinds(matches):
    return [m.kind for m in matches]


# ---------- Narrow: bara ett huvudområde ----------


def test_an_area_alone_gets_a_question_about_something_in_particular(index):
    (question,) = followups([same(1, "t1")], index, LABELS)
    assert (question.key, question.type, question.question) == ("t1", NARROW, "Något särskilt inom musik?")
    assert question.multiple is True


def test_the_options_are_the_areas_children_by_name_then_stay_general(index):
    (question,) = followups([same(1)], index, LABELS)
    assert [(o.value, o.label) for o in question.options] == [
        ("3", "Jazz"),
        ("2", "Metal"),
        ("11", "Stilla"),
        ("", GENERAL_AREA),
    ]
    assert GENERAL_AREA == "Bara allmänt"
    assert all(isinstance(o.value, str) for o in question.options)


def test_each_option_carries_the_activities_that_apply_if_it_is_chosen(index):
    (question,) = followups([same(1)], index, LABELS)
    by_label = {o.label: o for o in question.options}
    assert by_label["Metal"].activities == ("lyssna", "spela", "skapa", "besoka")  # ärvt från Musik
    assert by_label["Stilla"].activities == ()  # uttryckligen inga
    assert by_label[GENERAL_AREA].activities == ("lyssna", "spela", "skapa", "besoka")  # området självt


def test_an_area_whose_children_have_their_own_lists_gets_them_per_option():
    items = [
        item(1, "Sport", activities=["utova", "titta"]),
        item(2, "Löpning", 1, 2, ["Sport"]),
        item(3, "Schack", 1, 2, ["Sport"], activities=["spela"]),
    ]
    (question,) = followups([same(1)], LibraryIndex(items))
    assert {o.label: o.activities for o in question.options} == {
        "Löpning": ("utova", "titta"),
        "Schack": ("spela",),
        GENERAL_AREA: ("utova", "titta"),
    }


def test_an_area_gets_the_question_even_if_it_has_only_one_way_to_do_it(index):
    (question,) = followups([same(5)], index)
    assert question.type == NARROW and question.question == "Något särskilt inom film och tv?"
    assert [o.label for o in question.options] == ["Skräck", GENERAL_AREA]


def test_an_area_gets_the_question_even_if_the_text_said_how(index):
    # "Jag lyssnar på musik" säger hur, men inte vilken sorts musik.
    (question,) = followups([same(1, activity="lyssna")], index)
    assert question.type == NARROW


def test_an_area_gets_only_the_narrowing_question_not_the_activity_question_too(index):
    assert [q.type for q in followups([same(1)], index)] == [NARROW]


def test_an_area_without_children_is_asked_about_activity_instead(index):
    (question,) = followups([same(12)], index, LABELS)
    assert (question.type, question.question) == (ACTIVITY, "Hur håller du på med fritid?")
    assert [(o.value, o.label) for o in question.options] == [("spela", "Spelar"), ("samla", "Samlar"), ("", "Allmänt")]


# ---------- Activity: hur man håller på med ett intresse ----------


def test_a_specific_interest_gets_a_question_about_how_you_do_it(index):
    (question,) = followups([same(2)], index, LABELS)
    assert question == FollowUp(
        "t1",
        ACTIVITY,
        "Hur håller du på med Metal?",
        (Option("lyssna", "Lyssnar på"), Option("spela", "Spelar"), Option("skapa", "Skapar"), Option("besoka", "Besöker"), GENERAL),
    )
    assert question.multiple is True
    assert GENERAL == Option("", "Allmänt")


def test_a_specific_interest_inherits_the_activities_of_what_is_above_it(index):
    (pokemon,) = followups([same(9)], index, LABELS)
    assert [o.value for o in pokemon.options] == ["spela", "samla", ""]  # Kortspels egen lista, inte områdets
    assert pokemon.question == "Hur håller du på med Pokémon TCG?"


def test_there_is_no_activity_question_when_the_text_already_said_how(index):
    assert followups([same(2, activity="spela")], index, LABELS) == []


@pytest.mark.parametrize("interest_id", [6, 10, 11])
def test_there_is_no_question_for_an_interest_with_one_or_no_way_to_do_it(index, interest_id):
    assert followups([same(interest_id)], index) == []


def test_a_new_interest_is_asked_about_with_its_parents_activities(index):
    (question,) = followups([new(1, name="Synthwave")], index, LABELS)
    assert question.question == "Hur håller du på med Synthwave?"
    assert [o.value for o in question.options] == ["lyssna", "spela", "skapa", "besoka", ""]
    assert followups([new(5, name="Splatter")], index) == []  # föräldern har bara ett sätt


def test_a_none_proposal_never_gets_a_question(index):
    assert followups([none()], index) == []


def test_an_unknown_id_gets_no_question(index):
    assert followups([same(999)], index) == []


def test_a_missing_label_falls_back_to_the_slug(index):
    (question,) = followups([same(2)], index, {"spela": "Spelar"})
    assert [o.label for o in question.options] == ["lyssna", "Spelar", "skapa", "besoka", "Allmänt"]


# ---------- Tillsammans ----------


def test_at_most_three_questions_in_the_order_the_interests_were_mentioned():
    items = [item(i * 10, f"Område {i}", activities=["a", "b"]) for i in range(1, 6)]
    matches = [same(i * 10, f"t{i}") for i in range(1, 6)]
    questions = followups(matches, LibraryIndex(items))
    assert len(questions) == MAX_FOLLOWUPS == 3
    assert [q.key for q in questions] == ["t1", "t2", "t3"]


def test_the_question_carries_the_key_of_the_tag(index):
    (question,) = followups([none("t1"), same(1, "t2")], index)
    assert question.key == "t2"


def test_both_kinds_of_questions_are_asked_in_the_order_the_interests_were_mentioned(index):
    questions = followups([same(1, "t1"), same(9, "t2"), same(12, "t3")], index)
    assert [(q.key, q.type) for q in questions] == [("t1", NARROW), ("t2", ACTIVITY), ("t3", ACTIVITY)]


# ---------- Förslag som täcks ----------


def test_an_area_is_dropped_when_a_more_specific_proposal_is_in_the_same_area(index):
    assert kinds(drop_covered([same(1, "t1"), same(2, "t2")], index)) == ["none", "same"]


def test_an_interest_is_dropped_when_a_specific_interest_below_it_is_proposed(index):
    assert kinds(drop_covered([same(8, "t1"), same(9, "t2")], index)) == ["none", "same"]


def test_an_area_is_dropped_when_something_two_levels_down_is_proposed(index):
    assert kinds(drop_covered([same(1, "t1"), same(4, "t2")], index)) == ["none", "same"]


def test_an_area_is_dropped_when_a_new_interest_is_proposed_under_it(index):
    assert kinds(drop_covered([same(1, "t1"), new(1, "t2")], index)) == ["none", "new"]
    assert kinds(drop_covered([same(1, "t1"), new(2, "t2")], index)) == ["none", "new"]


def test_the_order_does_not_matter_for_what_is_dropped(index):
    assert kinds(drop_covered([same(2, "t1"), same(1, "t2")], index)) == ["same", "none"]


def test_unrelated_proposals_are_all_kept(index):
    assert kinds(drop_covered([same(1, "t1"), same(5, "t2"), same(9, "t3")], index)) == ["same", "same", "same"]


def test_siblings_do_not_cover_each_other(index):
    assert kinds(drop_covered([same(2, "t1"), same(3, "t2")], index)) == ["same", "same"]


def test_dropping_keeps_the_tag_and_the_order(index):
    kept = drop_covered([same(1, "t1", "musik"), same(2, "t2", "hårdrock")], index)
    assert [m.tag.key for m in kept] == ["t1", "t2"]
    assert kept[0].tag.name == "musik"


def test_nothing_to_drop_in_an_empty_list(index):
    assert drop_covered([], index) == []


def test_the_activity_said_about_the_broader_one_follows_to_the_specific_one(index):
    # "Jag lyssnar på musik, särskilt hårdrock": Musik (lyssna) täcks av Metal, som får lyssna.
    kept = drop_covered([same(1, "t1", activity="lyssna"), same(2, "t2")], index)
    assert kinds(kept) == ["none", "same"]
    assert kept[1].activity == "lyssna"


def test_the_specific_ones_own_activity_is_not_overwritten(index):
    kept = drop_covered([same(1, "t1", activity="lyssna"), same(2, "t2", activity="spela")], index)
    assert kept[1].activity == "spela"


def test_an_activity_that_is_not_allowed_for_the_specific_one_does_not_follow(index):
    # Film och tv tillåter bara "titta", så "lyssna" följer inte med till Skräck.
    kept = drop_covered([same(5, "t1", activity="lyssna"), same(6, "t2")], index)
    assert kept[1].activity == ""


def test_the_activity_follows_to_a_new_interest_under_the_area(index):
    kept = drop_covered([same(1, "t1", activity="spela"), new(1, "t2", "Synthwave")], index)
    assert kinds(kept) == ["none", "new"]
    assert kept[1].activity == "spela"


# ---------- Förslag och frågor tillsammans ----------


def test_the_activity_the_text_gave_follows_and_no_question_is_asked(index):
    kept, questions = settle([same(1, "t1", activity="lyssna"), same(2, "t2")], index, LABELS)
    assert [m.activity for m in kept] == ["", "lyssna"]
    assert questions == []


def test_no_question_about_the_area_when_a_specific_proposal_already_covers_it(index):
    kept, questions = settle([same(1, "t1"), same(2, "t2")], index, LABELS)
    assert kinds(kept) == ["none", "same"]
    assert [(q.key, q.type) for q in questions] == [("t2", ACTIVITY)]  # bara hur man håller på med Metal


def test_a_question_for_each_proposal_that_needs_one(index):
    _, questions = settle([same(1, "t1"), same(5, "t2"), same(9, "t3")], index, LABELS)
    assert [(q.key, q.type) for q in questions] == [("t1", NARROW), ("t2", NARROW), ("t3", ACTIVITY)]
