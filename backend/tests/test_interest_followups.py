"""Följdfrågorna och reglerna för vilka förslag som blir kvar (app/services/interest_followups.py)."""

import pytest

from app.services.interest_followups import GENERAL, MAX_FOLLOWUPS, NARROW, FollowUp, Option, drop_covered, followups, settle
from app.services.interest_matching import LibraryIndex, LibraryItem, Match, Tag


def item(id, name, parent=None, level=1, path=()):
    return LibraryItem(id, name, (), parent, level, tuple(path))


@pytest.fixture
def index():
    return LibraryIndex(
        [
            item(1, "Musik"),
            item(2, "Metal", 1, 2, ["Musik"]),
            item(3, "Jazz", 1, 2, ["Musik"]),
            item(4, "Black metal", 2, 3, ["Musik", "Metal"]),
            item(5, "Film och tv"),
            item(6, "Skräck", 5, 2, ["Film och tv"]),
            item(7, "Spel och pussel"),
            item(8, "Kortspel", 7, 2, ["Spel och pussel"]),
            item(9, "Pokémon TCG", 8, 3, ["Spel och pussel", "Kortspel"]),
            item(10, "Ensamt område"),  # saknar underintressen
        ]
    )


def same(interest_id, key="t1", name="x"):
    return Match(Tag(key, name), "same", interest_id=interest_id)


def new(parent_id, key="t1", name="nytt"):
    return Match(Tag(key, name), "new", name=name, parent_id=parent_id)


def none(key="t1"):
    return Match(Tag(key, "x"), "none")


def kinds(matches):
    return [m.kind for m in matches]


# ---------- Följdfrågor ----------


def test_an_area_alone_gets_a_narrowing_question_with_its_children_and_a_general_choice(index):
    (question,) = followups([same(1, "t1")], index)
    assert question == FollowUp(
        "t1",
        NARROW,
        "Något speciellt inom musik?",
        (Option("3", "Jazz"), Option("2", "Metal"), GENERAL),
    )
    assert GENERAL == Option("", "Bara allmänt")


def test_the_options_are_the_areas_children_sorted_by_name_with_their_ids_as_text(index):
    (question,) = followups([same(1)], index)
    assert [(o.value, o.label) for o in question.options] == [("3", "Jazz"), ("2", "Metal"), ("", "Bara allmänt")]
    assert all(isinstance(o.value, str) for o in question.options)


def test_the_question_names_the_area_in_lower_case(index):
    assert followups([same(5)], index)[0].question == "Något speciellt inom film och tv?"


@pytest.mark.parametrize("interest_id", [2, 8, 4, 9, 3])
def test_only_a_main_area_gets_a_question_not_an_interest_below_it(index, interest_id):
    assert followups([same(interest_id)], index) == []


def test_an_area_without_children_gets_no_question(index):
    assert followups([same(10)], index) == []


def test_new_and_none_proposals_never_get_a_question(index):
    assert followups([new(1), none()], index) == []


def test_an_unknown_interest_id_gets_no_question(index):
    assert followups([same(999)], index) == []


def test_at_most_three_questions_in_the_order_the_interests_were_mentioned():
    items = [item(i * 10, f"Område {i}") for i in range(1, 6)] + [item(i * 10 + 1, f"Barn {i}", i * 10, 2, [f"Område {i}"]) for i in range(1, 6)]
    matches = [same(i * 10, f"t{i}") for i in range(1, 6)]
    questions = followups(matches, LibraryIndex(items))
    assert len(questions) == MAX_FOLLOWUPS == 3
    assert [q.key for q in questions] == ["t1", "t2", "t3"]


def test_the_question_carries_the_key_of_the_tag(index):
    (question,) = followups([none("t1"), same(1, "t2")], index)
    assert question.key == "t2"


# ---------- Förslag som täcks ----------


def test_an_area_is_dropped_when_a_more_specific_proposal_is_in_the_same_area(index):
    kept = drop_covered([same(1, "t1"), same(2, "t2")], index)
    assert kinds(kept) == ["none", "same"]


def test_an_interest_is_dropped_when_a_specific_interest_below_it_is_proposed(index):
    kept = drop_covered([same(8, "t1"), same(9, "t2")], index)
    assert kinds(kept) == ["none", "same"]


def test_an_area_is_dropped_when_something_two_levels_down_is_proposed(index):
    assert kinds(drop_covered([same(1, "t1"), same(4, "t2")], index)) == ["none", "same"]


def test_an_area_is_dropped_when_a_new_interest_is_proposed_under_it(index):
    assert kinds(drop_covered([same(1, "t1"), new(1, "t2")], index)) == ["none", "new"]
    assert kinds(drop_covered([same(1, "t1"), new(2, "t2")], index)) == ["none", "new"]  # under Metal, som är under Musik


def test_the_order_does_not_matter_for_what_is_dropped(index):
    assert kinds(drop_covered([same(2, "t1"), same(1, "t2")], index)) == ["same", "none"]


def test_unrelated_proposals_are_all_kept(index):
    assert kinds(drop_covered([same(1, "t1"), same(5, "t2"), same(9, "t3")], index)) == ["same", "same", "same"]


def test_siblings_do_not_cover_each_other(index):
    assert kinds(drop_covered([same(2, "t1"), same(3, "t2")], index)) == ["same", "same"]


def test_a_new_interest_never_drops_an_unrelated_one(index):
    assert kinds(drop_covered([same(5, "t1"), new(1, "t2")], index)) == ["same", "new"]


def test_dropping_keeps_the_tag_and_the_order(index):
    kept = drop_covered([same(1, "t1", "musik"), same(2, "t2", "hårdrock")], index)
    assert [m.tag.key for m in kept] == ["t1", "t2"]
    assert kept[0].tag.name == "musik"


def test_nothing_to_drop_in_an_empty_list(index):
    assert drop_covered([], index) == []


# ---------- Tillsammans ----------


def test_no_question_for_an_area_that_a_specific_proposal_already_covers(index):
    kept, questions = settle([same(1, "t1"), same(2, "t2")], index)
    assert kinds(kept) == ["none", "same"]
    assert questions == []


def test_a_question_for_the_area_that_nothing_more_specific_covers(index):
    kept, questions = settle([same(1, "t1"), same(5, "t2"), same(9, "t3")], index)
    assert kinds(kept) == ["same", "same", "same"]
    assert [q.key for q in questions] == ["t1", "t2"]
