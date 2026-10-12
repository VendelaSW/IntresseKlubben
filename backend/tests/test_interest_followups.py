"""Följdfrågorna och reglerna för vilka förslag som blir kvar (app/services/interest_followups.py)."""

import pytest

from app.services.interest_followups import (
    ACTIVITY,
    ACTIVITY_KIND,
    GENERAL,
    GENERAL_AREA,
    GENERAL_KIND,
    INTEREST,
    MAX_FOLLOWUPS,
    NARROW,
    SPECIFY,
    FollowUp,
    Option,
    followups,
    plan,
)
from app.services.ai_clients import AIFailed, set_clients
from app.services.interest_matching import LibraryIndex, LibraryItem, Match, Tag
from tests.fakes import FakeLLM

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
            item(13, "Djur och natur"),  # ingen lista i biblioteket: en lucka som modellen fyller
            item(14, "Katter", 13, 2, ["Djur och natur"]),
            item(15, "Historia"),
            item(16, "Mynt", 15, 2, ["Historia"]),
        ]
    )


def same(interest_id, key="t1", name="x", activity="", parent_key=None):
    return Match(Tag(key, name, parent_key=parent_key), "same", interest_id=interest_id, activity=activity)


def new(parent_id, key="t1", name="nytt", activity="", parent_key=None):
    return Match(Tag(key, name, parent_key=parent_key), "new", name=name, parent_id=parent_id, activity=activity)


def none(key="t1", parent_key=None):
    return Match(Tag(key, "x", parent_key=parent_key), "none")


def kinds(matches):
    return [m.kind for m in matches]


# ---------- Ett huvudområde ensamt: en fråga om både underintresse och aktivitet ----------

SPECIFY_MUSIK = "Vill du vara lite mer specifik ang genre eller hur du utövar ditt intresse för musik?"


def test_an_area_alone_gets_one_question_about_both_genre_and_how_you_do_it(index):
    (question,) = followups([same(1, "t1")], index, LABELS)
    assert (question.key, question.type, question.question) == ("t1", SPECIFY, SPECIFY_MUSIK)
    assert question.multiple is True


def test_the_question_has_the_children_then_the_activities_then_general(index):
    (question,) = followups([same(1)], index, LABELS)
    assert [(o.value, o.label, o.kind) for o in question.options] == [
        ("3", "Jazz", INTEREST),
        ("2", "Metal", INTEREST),
        ("11", "Stilla", INTEREST),
        ("lyssna", "Lyssnar på", ACTIVITY_KIND),
        ("spela", "Spelar", ACTIVITY_KIND),
        ("skapa", "Skapar", ACTIVITY_KIND),
        ("besoka", "Besöker", ACTIVITY_KIND),
        ("", GENERAL_AREA, GENERAL_KIND),
    ]
    assert GENERAL_AREA == "Bara allmänt"
    assert all(isinstance(o.value, str) for o in question.options)


def test_the_activities_are_the_areas_own(index):
    # Ett underintresse ärver områdets lista, så det som väljs bredvid hör ihop med vad som än väljs.
    (question,) = followups([same(1)], index, LABELS)
    assert [o.value for o in question.options if o.kind == ACTIVITY_KIND] == ["lyssna", "spela", "skapa", "besoka"]


def test_an_area_with_one_way_to_do_it_only_asks_about_the_children(index):
    (question,) = followups([same(5)], index)
    assert question.type == NARROW and question.question == "Något särskilt inom film och tv?"
    assert [(o.label, o.kind) for o in question.options] == [("Skräck", INTEREST), (GENERAL_AREA, GENERAL_KIND)]


def test_an_area_where_the_text_said_how_only_asks_about_the_children(index):
    # "Jag lyssnar på musik" säger hur, men inte vilken sorts musik.
    (question,) = followups([same(1, activity="lyssna")], index, LABELS)
    assert question.type == NARROW
    assert all(o.kind != ACTIVITY_KIND for o in question.options)


def test_an_area_without_children_is_asked_about_activity_only(index):
    (question,) = followups([same(12)], index, LABELS)
    assert (question.type, question.question) == (ACTIVITY, "Hur håller du på med fritid?")
    assert [(o.value, o.label, o.kind) for o in question.options] == [
        ("spela", "Spelar", ACTIVITY_KIND),
        ("samla", "Samlar", ACTIVITY_KIND),
        ("", "Allmänt", GENERAL_KIND),
    ]


def test_every_proposal_gets_at_most_one_question(index):
    matches = [same(1, "t1"), same(2, "t2"), same(9, "t3"), same(12, "t4"), same(5, "t5"), new(1, "t6", "Synthwave")]
    for match in matches:
        assert len(followups([match], index)) <= 1
    questions = followups(matches, index)
    assert len(questions) == len({q.key for q in questions})  # aldrig två frågor om samma förslag


# ---------- Ett specifikt intresse: bara aktivitet ----------


def test_a_specific_interest_gets_a_question_about_how_you_do_it(index):
    (question,) = followups([same(2)], index, LABELS)
    assert question == FollowUp(
        "t1",
        ACTIVITY,
        "Hur håller du på med Metal?",
        (
            Option("lyssna", "Lyssnar på", ACTIVITY_KIND),
            Option("spela", "Spelar", ACTIVITY_KIND),
            Option("skapa", "Skapar", ACTIVITY_KIND),
            Option("besoka", "Besöker", ACTIVITY_KIND),
            GENERAL,
        ),
        applies_to=("t1",),
    )
    assert question.multiple is True
    assert GENERAL == Option("", "Allmänt", GENERAL_KIND)


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


# ---------- Gränser ----------


def test_at_most_three_questions_in_the_order_the_interests_were_mentioned():
    items = [item(i * 10, f"Område {i}", activities=["a", "b"]) for i in range(1, 6)]
    matches = [same(i * 10, f"t{i}") for i in range(1, 6)]
    questions = followups(matches, LibraryIndex(items))
    assert len(questions) == MAX_FOLLOWUPS == 3
    assert [q.key for q in questions] == ["t1", "t2", "t3"]


def test_the_question_carries_the_key_of_the_tag(index):
    (question,) = followups([none("t1"), same(1, "t2")], index)
    assert question.key == "t2"


def test_the_questions_come_in_the_order_the_interests_were_mentioned(index):
    questions = followups([same(1, "t1"), same(9, "t2"), same(12, "t3")], index)
    assert [(q.key, q.type) for q in questions] == [("t1", SPECIFY), ("t2", ACTIVITY), ("t3", ACTIVITY)]


# ---------- Grupper: ett intresse och dess subs ----------


def test_an_interest_with_a_sub_is_one_group_with_one_activity_question_for_all(index):
    # "Jag gillar musik, särskilt hårdrock": Musik och Metal sparas, och det frågas bara en gång hur.
    (question,) = followups([same(1, "t1"), same(2, "t2", parent_key="t1")], index, LABELS)
    assert (question.key, question.type, question.question) == ("t1", ACTIVITY, "Hur håller du på med musik?")
    assert question.applies_to == ("t1", "t2")
    assert [o.value for o in question.options] == ["lyssna", "spela", "skapa", "besoka", ""]


def test_a_group_never_gets_the_question_about_something_in_particular(index):
    # Användaren var redan specifik, så "Något särskilt inom musik?" ställs inte.
    questions = followups([same(1, "t1"), same(2, "t2", parent_key="t1")], index, LABELS)
    assert [q.type for q in questions] == [ACTIVITY]


def test_no_question_when_something_in_the_group_already_says_how(index):
    assert followups([same(1, "t1"), same(2, "t2", activity="spela", parent_key="t1")], index, LABELS) == []
    assert followups([same(1, "t1", activity="lyssna"), same(2, "t2", parent_key="t1")], index, LABELS) == []


def test_several_subs_under_one_interest_get_one_question(index):
    matches = [same(1, "t1"), same(2, "t2", parent_key="t1"), same(3, "t3", parent_key="t1")]
    (question,) = followups(matches, index, LABELS)
    assert question.applies_to == ("t1", "t2", "t3")


def test_a_group_of_an_interest_with_one_way_to_do_it_gets_no_question(index):
    assert followups([same(5, "t1"), same(6, "t2", parent_key="t1")], index) == []  # Film och tv: bara titta


def test_a_new_interest_with_a_new_sub_under_it_is_one_group(index):
    matches = [new(13, "t1", "Modellbygge"), new(None, "t2", "Fyrmodeller", parent_key="t1")]  # 13: ingen lista
    llm = model_says([suggestion("t1", "skapa", "samla")])
    result = plan(matches, index, CATALOG)
    (question,) = result.followups
    assert (question.key, question.question, question.applies_to) == ("t1", "Hur håller du på med Modellbygge?", ("t1", "t2"))
    assert [o.value for o in question.options] == ["skapa", "samla", ""]
    assert llm is not None


def test_a_sub_whose_interest_is_none_is_its_own_group(index):
    questions = followups([none("t1"), same(2, "t2", parent_key="t1"), same(9, "t3")], index, LABELS)
    assert [(q.key, q.applies_to) for q in questions] == [("t2", ("t2",)), ("t3", ("t3",))]


def test_each_group_gets_its_own_question_in_the_order_mentioned(index):
    matches = [same(1, "t1"), same(2, "t2", parent_key="t1"), same(9, "t3"), same(12, "t4")]
    questions = followups(matches, index, LABELS)
    assert [(q.key, q.type) for q in questions] == [("t1", ACTIVITY), ("t3", ACTIVITY), ("t4", ACTIVITY)]


# ---------- Intressen där biblioteket saknar en lista: modellen väljer ----------

CATALOG = {**LABELS, "ha": "Har", "utova": "Utövar", "lara-sig": "Lär sig"}


def model_says(suggestions=None, answer=None):
    llm = FakeLLM({"activities": answer if answer is not None else {"suggestions": suggestions or []}})
    set_clients(llm=llm)
    return llm


def suggestion(key, *slugs):
    return {"key": key, "activities": list(slugs)}


def test_a_gap_gets_its_activities_from_the_model_in_one_call_for_all(index):
    llm = model_says([suggestion("t1", "ha", "utova"), suggestion("t2", "samla", "titta")])
    result = plan([same(14, "t1"), same(16, "t2")], index, CATALOG)
    assert len(llm.calls_named("activities")) == 1
    assert result.allowed == {"t1": ["ha", "utova"], "t2": ["samla", "titta"]}
    assert [(q.key, q.type) for q in result.followups] == [("t1", ACTIVITY), ("t2", ACTIVITY)]
    assert [o.value for o in result.followups[0].options] == ["ha", "utova", ""]
    assert [o.label for o in result.followups[0].options] == ["Har", "Utövar", "Allmänt"]


def test_the_model_is_not_asked_when_the_library_has_a_list(index):
    llm = model_says([])
    result = plan([same(2, "t1"), same(9, "t2")], index, CATALOG)
    assert llm.calls == []
    assert result.allowed == {"t1": ["lyssna", "spela", "skapa", "besoka"], "t2": ["spela", "samla"]}


def test_an_explicitly_empty_list_in_the_library_is_not_a_gap(index):
    llm = model_says([suggestion("t1", "spela")])
    result = plan([same(11, "t1")], index, CATALOG)  # "Stilla" har uttryckligen inga
    assert llm.calls == []
    assert result.allowed == {"t1": []} and result.followups == []


def test_only_the_gaps_are_sent_to_the_model(index):
    llm = model_says([suggestion("t2", "ha")])
    plan([same(2, "t1"), same(14, "t2")], index, CATALOG)
    (call,) = llm.calls_named("activities")
    assert '"key": "t1"' not in call.user and '"key": "t2"' in call.user


def test_one_suggested_activity_is_nothing_to_ask_about(index):
    model_says([suggestion("t1", "ha")])
    result = plan([same(14, "t1")], index, CATALOG)
    assert result.allowed == {"t1": ["ha"]} and result.followups == []


def test_the_model_can_suggest_nothing(index):
    model_says([suggestion("t1")])
    result = plan([same(14, "t1")], index, CATALOG)
    assert result.allowed == {"t1": []} and result.followups == []


def test_an_area_that_is_a_gap_gets_the_combined_question_with_the_models_activities(index):
    model_says([suggestion("t1", "ha", "utova")])
    (question,) = plan([same(13, "t1")], index, CATALOG).followups
    assert question.type == SPECIFY
    assert [(o.label, o.kind) for o in question.options] == [
        ("Katter", INTEREST),
        ("Har", ACTIVITY_KIND),
        ("Utövar", ACTIVITY_KIND),
        (GENERAL_AREA, GENERAL_KIND),
    ]


def test_an_area_that_is_a_gap_with_one_suggestion_only_asks_about_the_children(index):
    model_says([suggestion("t1", "ha")])
    (question,) = plan([same(13, "t1")], index, CATALOG).followups
    assert question.type == NARROW


def test_the_activity_the_text_gave_is_accepted_for_a_gap_even_if_the_model_did_not_suggest_it(index):
    model_says([suggestion("t1", "ha")])
    tag_with_activity = Match(Tag("t1", "mynt", activity="samla"), "same", interest_id=16)
    result = plan([tag_with_activity], index, CATALOG)
    assert result.allowed["t1"] == ["ha", "samla"]
    assert result.matches[0].activity == "samla"
    assert result.followups == []  # texten sa redan hur


def test_an_activity_the_text_gave_that_is_not_in_the_catalog_is_dropped(index):
    model_says([suggestion("t1", "ha")])
    result = plan([Match(Tag("t1", "katter", activity="flyga"), "same", interest_id=14)], index, CATALOG)
    assert result.allowed["t1"] == ["ha"] and result.matches[0].activity == ""


def test_a_failed_model_call_gives_no_activities_for_the_gap_but_the_rest_still_works(index):
    model_says(answer=AIFailed("URLError"))
    result = plan([same(14, "t1"), same(2, "t2")], index, CATALOG)
    assert result.allowed == {"t1": [], "t2": ["lyssna", "spela", "skapa", "besoka"]}
    assert [(q.key, q.type) for q in result.followups] == [("t2", ACTIVITY)]
    assert kinds(result.matches) == ["same", "same"]


def test_a_new_interest_under_a_gap_is_asked_about_too(index):
    llm = model_says([suggestion("t1", "ha", "utova")])
    result = plan([new(13, "t1", "Fjärilar")], index, CATALOG)
    assert result.allowed == {"t1": ["ha", "utova"]}
    assert [q.question for q in result.followups] == ["Hur håller du på med Fjärilar?"]
    assert '"path": ["Djur och natur"]' in llm.calls[0].user


def test_a_new_interest_under_a_listed_area_uses_the_library_list(index):
    llm = model_says([])
    result = plan([new(1, "t1", "Synthwave")], index, CATALOG)
    assert llm.calls == [] and result.allowed["t1"] == ["lyssna", "spela", "skapa", "besoka"]


def test_proposals_that_are_none_get_no_entry_and_no_call(index):
    llm = model_says([])
    result = plan([none("t1"), same(2, "t3")], index, CATALOG)
    assert llm.calls == []
    assert set(result.allowed) == {"t3"}


def test_nothing_is_asked_when_there_are_no_proposals(index):
    llm = model_says([])
    result = plan([], index, CATALOG)
    assert llm.calls == [] and result.matches == [] and result.followups == [] and result.allowed == {}


def test_the_activity_said_about_one_in_a_group_is_set_on_all_where_it_is_allowed(index):
    # "Jag spelar musik, särskilt hårdrock": aktiviteten som sades om Musik gäller Metal också.
    result = plan([same(1, "t1", activity="spela"), same(2, "t2", parent_key="t1")], index, CATALOG)
    assert [m.activity for m in result.matches] == ["spela", "spela"]
    assert result.followups == []


def test_the_activity_said_about_the_sub_is_set_on_the_interest_too(index):
    result = plan([same(1, "t1"), same(2, "t2", activity="lyssna", parent_key="t1")], index, CATALOG)
    assert [m.activity for m in result.matches] == ["lyssna", "lyssna"]


def test_an_activity_is_not_set_where_it_is_not_allowed(index):
    # Film och tv tillåter bara "titta", så "lyssna" följer inte med dit.
    result = plan([same(1, "t1", activity="lyssna"), same(5, "t2")], index, CATALOG)
    assert [m.activity for m in result.matches] == ["lyssna", ""]


def test_the_activity_does_not_spread_between_different_groups(index):
    result = plan([same(1, "t1", activity="lyssna"), same(2, "t2")], index, CATALOG)  # inte samma grupp
    assert [m.activity for m in result.matches] == ["lyssna", ""]
